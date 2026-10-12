import { lerCookie, validarSessao } from '../_lib/session.js';

const TIPOS = {
  unidades: { tabela: 'unidades_medida', colunas: ['id', 'simbolo', 'nome', 'grupo', 'criadoEm', 'atualizadoEm'] },
  composicoes: { tabela: 'composicoes', colunas: ['id', 'codigo', 'nome', 'descricao', 'unidade', 'valorUnitario', 'base', 'codigoReferencia', 'componentes', 'criadoEm', 'atualizadoEm'] },
  insumos: { tabela: 'insumos', colunas: ['id', 'codigo', 'nome', 'descricao', 'unidade', 'valorUnitario', 'base', 'codigoReferencia', 'unidadeBaseId', 'conversoes', 'detalhes', 'criadoEm', 'atualizadoEm'] }
};
const SIMBOLOS_PADRAO = new Set([
  'kg', 'g', 't', 'sc', 'l', 'ml', 'lt', 'm', 'cm', 'mm', 'm²', 'cm²', 'm³', 'un',
  'h', 'dia', 'mês', 'cj', 'jg', 'cx', 'pct', 'rolo', 'bobina', 'barra', 'par', 'mil',
  'cento', 'kwh', 'sc 25kg', 'vb', 'chi', 'chp', 'kgxkm', 'lxkm', 'm2xkm', 'm2xmes',
  'm3xkm', 'mxkm', 'mxmes', 'txkm', 'unxkm', '100m', '310ml', 'unxmes'
].map(normalizarSimbolo));

function normalizarSimbolo(simbolo) {
  return String(simbolo || '').normalize('NFD').replace(/\p{Diacritic}/gu, '').replace(/²/g, '2').replace(/³/g, '3').toUpperCase();
}

function respostaErro(erro, status) {
  return Response.json({ erro }, { status });
}

function parseJsonArray(valor) {
  try {
    const parsed = JSON.parse(valor);
    return Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    throw new Error('JSON inválido armazenado no catálogo', { cause: error });
  }
}

function serializar(tipo, row) {
  if (!row) return null;
  const item = { ...row };
  if (tipo === 'unidades') item.padrao = item.id.startsWith('std-') || item.id.startsWith('sinapi-');
  if (tipo === 'composicoes') item.componentes = parseJsonArray(item.componentes);
  if (tipo === 'insumos') {
    item.conversoes = parseJsonArray(item.conversoes);
    item.detalhes = parseJsonArray(item.detalhes);
  }
  return item;
}

async function contextoUsuario(request, env) {
  const token = lerCookie(request, 'sessao');
  const sessao = token ? await validarSessao(token, env.SESSION_SECRET) : null;
  if (!sessao || !sessao.email) return null;

  const email = sessao.email.toLowerCase();
  const admins = (env.ADMIN_EMAILS || '').split(',').map((value) => value.trim().toLowerCase()).filter(Boolean);
  const { results } = await env.DB.prepare(
    'SELECT status, isAdmin, podeEditar FROM usuarios WHERE email = ?'
  ).bind(email).all();
  const usuario = results[0] || null;
  const isAdmin = email === 'cazu89@gmail.com' || admins.includes(email) || Boolean(usuario && usuario.isAdmin);
  const aprovado = isAdmin || Boolean(usuario && usuario.status === 'aprovado');
  return {
    isAdmin,
    aprovado,
    podeEditar: isAdmin || Boolean(usuario && usuario.podeEditar)
  };
}

function texto(valor, limite, campo, obrigatorio = false) {
  if (typeof valor !== 'string') throw new TypeError(campo + '_invalido');
  const normalizado = valor.trim();
  if ((obrigatorio && !normalizado) || normalizado.length > limite) {
    throw new TypeError(campo + '_invalido');
  }
  return normalizado;
}

function jsonLista(valor, campo) {
  if (!Array.isArray(valor)) throw new TypeError(campo + '_invalido');
  if (valor.length > 500) throw new TypeError(campo + '_invalido');
  return JSON.stringify(valor);
}

function prepararItem(tipo, item, existente) {
  if (!item || typeof item !== 'object' || Array.isArray(item)) throw new TypeError('item_invalido');
  const agora = new Date().toISOString();
  const id = existente ? existente.id : texto(item.id, 100, 'id', true);
  const criadoEm = existente ? existente.criadoEm : (typeof item.criadoEm === 'string' ? item.criadoEm : agora);

  if (tipo === 'unidades') {
    if (existente && (existente.id.startsWith('std-') || existente.id.startsWith('sinapi-'))) {
      throw new TypeError('unidade_padrao_protegida');
    }
    if (!id.startsWith('un-')) throw new TypeError('id_invalido');
    const simbolo = texto(item.simbolo, 40, 'simbolo', true);
    if (SIMBOLOS_PADRAO.has(normalizarSimbolo(simbolo))) throw new TypeError('simbolo_reservado');
    return {
      id,
      simbolo,
      nome: texto(item.nome, 120, 'nome', true),
      grupo: texto(item.grupo || 'Outros', 40, 'grupo', true),
      criadoEm,
      atualizadoEm: agora
    };
  }

  const prefixo = tipo === 'composicoes' ? 'COMP' : 'INS';
  const base = item.base === 'sinapi' ? 'sinapi' : 'propria';
  const valorUnitario = Number(item.valorUnitario);
  if (!Number.isFinite(valorUnitario) || valorUnitario < 0) throw new TypeError('valorUnitario_invalido');
  const dados = {
    id,
    codigo: texto(item.codigo, 80, 'codigo', true),
    nome: texto(item.nome, 240, 'nome', true),
    descricao: texto(item.descricao || '', 2000, 'descricao'),
    unidade: texto(item.unidade || 'un', 40, 'unidade', true),
    valorUnitario,
    base,
    codigoReferencia: texto(item.codigoReferencia || '', 100, 'codigoReferencia'),
    criadoEm,
    atualizadoEm: agora
  };
  if (!new RegExp('^' + prefixo + '-\\d{4}-\\d+$').test(dados.codigo)) {
    throw new TypeError('codigo_invalido');
  }
  if (tipo === 'composicoes') dados.componentes = jsonLista(item.componentes || [], 'componentes');
  if (tipo === 'insumos') {
    dados.unidadeBaseId = texto(item.unidadeBaseId || '', 100, 'unidadeBaseId');
    dados.conversoes = jsonLista(item.conversoes || [], 'conversoes');
    dados.detalhes = jsonLista(item.detalhes || [], 'detalhes');
  }
  return dados;
}

function statementFor(env, tipo, dados) {
  const { tabela, colunas } = TIPOS[tipo];
  const values = colunas.map((coluna) => dados[coluna]);
  const marks = colunas.map(() => '?').join(', ');
  return env.DB.prepare(
    `INSERT INTO ${tabela} (${colunas.join(', ')}) VALUES (${marks})`
  ).bind(...values);
}

async function listar(env) {
  const resultado = {};
  for (const [tipo, { tabela }] of Object.entries(TIPOS)) {
    const { results } = await env.DB.prepare(`SELECT * FROM ${tabela} ORDER BY nome COLLATE NOCASE`).all();
    resultado[tipo] = results.map((row) => serializar(tipo, row));
  }
  return Response.json(resultado, { headers: { 'Cache-Control': 'no-store' } });
}

async function migrarUnidades(request, env, usuario) {
  if (!usuario.isAdmin) return respostaErro('somente_admin', 403);
  let corpo;
  try {
    corpo = await request.json();
  } catch (error) {
    return respostaErro('json_invalido', 400);
  }
  if (!Array.isArray(corpo.unidades) || corpo.unidades.length > 500) {
    return respostaErro('unidades_invalidas', 400);
  }

  const agora = new Date().toISOString();
  const statements = [];
  try {
    for (const unidade of corpo.unidades) {
      if (!unidade || unidade.padrao) continue;
      const simbolo = texto(unidade.simbolo, 40, 'simbolo', true);
      if (SIMBOLOS_PADRAO.has(normalizarSimbolo(simbolo))) continue;
      const dados = {
        id: texto(unidade.id, 100, 'id', true),
        simbolo,
        nome: texto(unidade.nome, 120, 'nome', true),
        grupo: texto(unidade.grupo || 'Outros', 40, 'grupo', true),
        criadoEm: typeof unidade.criadoEm === 'string' ? unidade.criadoEm : agora,
        atualizadoEm: agora
      };
      if (!dados.id.startsWith('un-')) throw new TypeError('id_invalido');
      statements.push(env.DB.prepare(
        'INSERT OR IGNORE INTO unidades_medida (id, simbolo, nome, grupo, criadoEm, atualizadoEm) VALUES (?, ?, ?, ?, ?, ?)'
      ).bind(dados.id, dados.simbolo, dados.nome, dados.grupo, dados.criadoEm, dados.atualizadoEm));
    }
  } catch (error) {
    return respostaErro(error instanceof TypeError ? error.message : 'unidades_invalidas', 400);
  }
  if (!statements.length) return Response.json({ importadas: 0 });
  const resultados = await env.DB.batch(statements);
  const importadas = resultados.reduce((total, item) => total + Number(item.meta && item.meta.changes || 0), 0);
  return Response.json({ importadas });
}

export async function onRequestGet({ request, env }) {
  const usuario = await contextoUsuario(request, env);
  if (!usuario) return respostaErro('nao_autenticado', 401);
  if (!usuario.aprovado) return respostaErro('nao_aprovado', 403);
  return listar(env);
}

export async function onRequestPost({ request, env }) {
  const usuario = await contextoUsuario(request, env);
  if (!usuario) return respostaErro('nao_autenticado', 401);
  if (!usuario.aprovado) return respostaErro('nao_aprovado', 403);
  if (!usuario.podeEditar) return respostaErro('somente_visualizacao', 403);

  const corpo = await request.clone().json().catch(() => null);
  if (!corpo || typeof corpo !== 'object') return respostaErro('json_invalido', 400);
  if (corpo.migrarUnidades === true) return migrarUnidades(request, env, usuario);
  const tipo = corpo.tipo;
  if (!Object.hasOwn(TIPOS, tipo)) return respostaErro('tipo_invalido', 400);

  try {
    const dados = prepararItem(tipo, corpo.item, null);
    await statementFor(env, tipo, dados).run();
    return Response.json({ item: serializar(tipo, dados) }, { status: 201 });
  } catch (error) {
    if (error instanceof TypeError) return respostaErro(error.message, 400);
    if (/unique constraint/i.test(error.message || '')) return respostaErro('item_duplicado', 409);
    throw error;
  }
}

export async function onRequestPut({ request, env }) {
  const usuario = await contextoUsuario(request, env);
  if (!usuario) return respostaErro('nao_autenticado', 401);
  if (!usuario.aprovado) return respostaErro('nao_aprovado', 403);
  if (!usuario.podeEditar) return respostaErro('somente_visualizacao', 403);
  const corpo = await request.json().catch(() => null);
  const tipo = corpo && corpo.tipo;
  const item = corpo && corpo.item;
  if (!corpo || !Object.hasOwn(TIPOS, tipo) || !item || typeof item.id !== 'string') {
    return respostaErro('item_invalido', 400);
  }
  const { tabela, colunas } = TIPOS[tipo];
  const existente = await env.DB.prepare(`SELECT * FROM ${tabela} WHERE id = ?`).bind(item.id).first();
  if (!existente) return respostaErro('nao_encontrado', 404);
  if (tipo === 'unidades' && (existente.id.startsWith('std-') || existente.id.startsWith('sinapi-'))) {
    return respostaErro('unidade_padrao_protegida', 409);
  }
  try {
    const dados = prepararItem(tipo, item, existente);
    const campos = colunas.filter((coluna) => coluna !== 'id' && coluna !== 'criadoEm');
    await env.DB.prepare(
      `UPDATE ${tabela} SET ${campos.map((coluna) => `${coluna} = ?`).join(', ')} WHERE id = ?`
    ).bind(...campos.map((coluna) => dados[coluna]), dados.id).run();
    return Response.json({ item: serializar(tipo, dados) });
  } catch (error) {
    if (error instanceof TypeError) return respostaErro(error.message, 400);
    if (/unique constraint/i.test(error.message || '')) return respostaErro('item_duplicado', 409);
    throw error;
  }
}

export async function onRequestDelete({ request, env }) {
  const usuario = await contextoUsuario(request, env);
  if (!usuario) return respostaErro('nao_autenticado', 401);
  if (!usuario.aprovado) return respostaErro('nao_aprovado', 403);
  if (!usuario.podeEditar) return respostaErro('somente_visualizacao', 403);
  const corpo = await request.json().catch(() => null);
  const tipo = corpo && corpo.tipo;
  const id = corpo && corpo.id;
  if (!Object.hasOwn(TIPOS, tipo) || typeof id !== 'string' || !id) return respostaErro('parametros_invalidos', 400);
  const { tabela } = TIPOS[tipo];
  const existente = await env.DB.prepare(`SELECT * FROM ${tabela} WHERE id = ?`).bind(id).first();
  if (!existente) return respostaErro('nao_encontrado', 404);
  if (tipo === 'unidades' && (existente.id.startsWith('std-') || existente.id.startsWith('sinapi-'))) {
    return respostaErro('unidade_padrao_protegida', 409);
  }
  if (tipo === 'unidades' && existente.padrao) return respostaErro('unidade_padrao_protegida', 409);

  if (tipo === 'unidades') {
    const referencia = await env.DB.prepare(
      `SELECT 1 AS usada FROM insumos
       WHERE unidadeBaseId = ? OR lower(unidade) = lower(?)
          OR EXISTS (
            SELECT 1 FROM json_each(insumos.conversoes)
            WHERE json_extract(json_each.value, '$.unidadeId') = ?
               OR lower(json_extract(json_each.value, '$.simbolo')) = lower(?)
          )
       UNION ALL
       SELECT 1 AS usada FROM composicoes WHERE lower(unidade) = lower(?)
       LIMIT 1`
    ).bind(id, existente.simbolo, id, existente.simbolo, existente.simbolo).first();
    if (referencia) return respostaErro('unidade_em_uso', 409);
  }

  await env.DB.prepare(`DELETE FROM ${tabela} WHERE id = ?`).bind(id).run();
  return Response.json({ removido: true });
}
