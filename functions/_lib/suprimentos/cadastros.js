// Cadastros de Suprimentos: fornecedores, condições de pagamento, parâmetros e alçadas.
import {
  json, falha, uuid, agora, texto, numero, escolha, lerJson, exigirEdicao, exigirAdmin, historico,
  parametros, PARAMETROS_PADRAO, alcadasDoUsuario, TIPOS_ALCADA, validarParcelas
} from './base.js';
import { validar as validarModelo, montarEmail, exemplo, TIPOS as TIPOS_EMAIL } from '../../../js/email-modelos.js';
import { enviarEmail, mensagemFalha } from '../email.js';

/* ---------- CPF/CNPJ ---------- */
function digitos(v) { return String(v || '').replace(/\D/g, ''); }
function cpfValido(c) {
  if (c.length !== 11 || /^(\d)\1+$/.test(c)) return false;
  for (let t = 9; t < 11; t++) {
    let s = 0;
    for (let i = 0; i < t; i++) s += Number(c[i]) * (t + 1 - i);
    if (((s * 10) % 11) % 10 !== Number(c[t])) return false;
  }
  return true;
}
function cnpjValido(c) {
  if (c.length !== 14 || /^(\d)\1+$/.test(c)) return false;
  const calc = (n) => {
    const pesos = n === 12 ? [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2] : [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
    const s = pesos.reduce((acc, p, i) => acc + Number(c[i]) * p, 0);
    const r = s % 11;
    return r < 2 ? 0 : 11 - r;
  };
  return calc(12) === Number(c[12]) && calc(13) === Number(c[13]);
}
export function documentoValido(doc) {
  const d = digitos(doc);
  return d.length === 11 ? cpfValido(d) : d.length === 14 ? cnpjValido(d) : false;
}

/* ---------- fornecedores ---------- */
function dadosFornecedor(corpo) {
  const documento = digitos(corpo.documento);
  if (documento && !documentoValido(documento)) falha(400, 'documento_invalido', 'CNPJ ou CPF inválido. Confira os dígitos.');
  const email = texto(corpo.email, 'email', { max: 200, rotulo: 'o e-mail' });
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) falha(400, 'email_invalido', 'E-mail do fornecedor inválido.');
  const uf = texto(corpo.uf, 'uf', { max: 2, rotulo: 'a UF' });
  return {
    nome: texto(corpo.nome, 'nome', { max: 200, obrigatorio: true, rotulo: 'a razão social' }),
    nomeFantasia: texto(corpo.nomeFantasia, 'nomeFantasia', { max: 200, rotulo: 'o nome fantasia' }),
    documento: documento || null,
    inscricaoEstadual: texto(corpo.inscricaoEstadual, 'inscricaoEstadual', { max: 30, rotulo: 'a inscrição estadual' }),
    email: email ? email.toLowerCase() : null,
    telefone: texto(corpo.telefone, 'telefone', { max: 40, rotulo: 'o telefone' }),
    contato: texto(corpo.contato, 'contato', { max: 120, rotulo: 'o contato' }),
    endereco: texto(corpo.endereco, 'endereco', { max: 300, rotulo: 'o endereço' }),
    cidade: texto(corpo.cidade, 'cidade', { max: 120, rotulo: 'a cidade' }),
    uf: uf ? uf.toUpperCase() : null,
    cep: digitos(corpo.cep) || null,
    categorias: texto(corpo.categorias, 'categorias', { max: 300, rotulo: 'o que fornece' }),
    dadosBancarios: texto(corpo.dadosBancarios, 'dadosBancarios', { max: 500, rotulo: 'os dados bancários' }),
    observacoes: texto(corpo.observacoes, 'observacoes', { max: 1000, rotulo: 'as observações' })
  };
}

async function documentoRepetido(env, documento, id) {
  if (!documento) return;
  const outro = await env.DB.prepare('SELECT id, nome FROM supr_fornecedores WHERE documento = ? AND id <> ?')
    .bind(documento, id || '').first();
  if (outro) falha(409, 'documento_repetido', `Já existe um fornecedor com este CNPJ/CPF: ${outro.nome}.`);
}

export async function listarFornecedores({ env, url }) {
  const busca = (url.searchParams.get('busca') || '').trim().toLowerCase();
  const todos = url.searchParams.get('todos') === '1';
  const { results } = await env.DB.prepare(
    `SELECT f.*,
            (SELECT COUNT(*) FROM supr_pedidos p WHERE p.fornecedorId = f.id AND p.status NOT IN ('cancelado', 'reprovado')) AS pedidos,
            (SELECT COALESCE(SUM(p.valorTotal), 0) FROM supr_pedidos p WHERE p.fornecedorId = f.id AND p.status NOT IN ('cancelado', 'reprovado', 'pendente')) AS valorComprado
       FROM supr_fornecedores f ${todos ? '' : 'WHERE f.ativo = 1'} ORDER BY f.nome COLLATE NOCASE`
  ).all();
  const filtrados = busca
    ? results.filter((f) => [f.nome, f.nomeFantasia, f.documento, f.categorias, f.cidade, f.email]
      .some((v) => String(v || '').toLowerCase().includes(busca)))
    : results;
  return json({ fornecedores: filtrados });
}

export async function obterFornecedor({ env, params }) {
  const f = await env.DB.prepare('SELECT * FROM supr_fornecedores WHERE id = ?').bind(params.id).first();
  if (!f) falha(404, 'nao_encontrado', 'Fornecedor não encontrado.');
  return json({ fornecedor: f });
}

export async function criarFornecedor({ env, ctx, corpo }) {
  exigirEdicao(ctx);
  const dados = dadosFornecedor(corpo);
  await documentoRepetido(env, dados.documento, null);
  const id = uuid();
  const ts = agora();
  await env.DB.prepare(
    `INSERT INTO supr_fornecedores (id, nome, nomeFantasia, documento, inscricaoEstadual, email, telefone, contato, endereco,
       cidade, uf, cep, categorias, dadosBancarios, observacoes, ativo, criadoEm, atualizadoEm)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)`
  ).bind(id, dados.nome, dados.nomeFantasia, dados.documento, dados.inscricaoEstadual, dados.email, dados.telefone, dados.contato,
    dados.endereco, dados.cidade, dados.uf, dados.cep, dados.categorias, dados.dadosBancarios, dados.observacoes, ts, ts).run();
  return json({ ok: true, id });
}

export async function atualizarFornecedor({ env, ctx, params, corpo }) {
  exigirEdicao(ctx);
  const dados = dadosFornecedor(corpo);
  await documentoRepetido(env, dados.documento, params.id);
  const ativo = corpo.ativo === false || corpo.ativo === 0 ? 0 : 1;
  const r = await env.DB.prepare(
    `UPDATE supr_fornecedores SET nome = ?, nomeFantasia = ?, documento = ?, inscricaoEstadual = ?, email = ?, telefone = ?,
       contato = ?, endereco = ?, cidade = ?, uf = ?, cep = ?, categorias = ?, dadosBancarios = ?, observacoes = ?, ativo = ?, atualizadoEm = ?
     WHERE id = ?`
  ).bind(dados.nome, dados.nomeFantasia, dados.documento, dados.inscricaoEstadual, dados.email, dados.telefone, dados.contato,
    dados.endereco, dados.cidade, dados.uf, dados.cep, dados.categorias, dados.dadosBancarios, dados.observacoes, ativo, agora(), params.id).run();
  if (!r.meta.changes) falha(404, 'nao_encontrado', 'Fornecedor não encontrado.');
  return json({ ok: true });
}

// Fornecedor com movimento é inativado (o histórico continua apontando para ele)
export async function excluirFornecedor({ env, ctx, params }) {
  exigirEdicao(ctx);
  const uso = await env.DB.prepare(
    `SELECT (SELECT COUNT(*) FROM supr_cotacao_fornecedores WHERE fornecedorId = ?1) +
            (SELECT COUNT(*) FROM supr_pedidos WHERE fornecedorId = ?1) +
            (SELECT COUNT(*) FROM supr_notas WHERE fornecedorId = ?1) +
            (SELECT COUNT(*) FROM supr_contratos WHERE fornecedorId = ?1) AS n`
  ).bind(params.id).first();
  if (uso && uso.n > 0) {
    await env.DB.prepare('UPDATE supr_fornecedores SET ativo = 0, atualizadoEm = ? WHERE id = ?').bind(agora(), params.id).run();
    return json({ ok: true, inativado: true });
  }
  await env.DB.prepare('DELETE FROM supr_fornecedores WHERE id = ?').bind(params.id).run();
  return json({ ok: true, excluido: true });
}

/* ---------- condições de pagamento ---------- */
export async function listarCondicoes({ env, url }) {
  const todas = url.searchParams.get('todas') === '1';
  const { results } = await env.DB.prepare(
    `SELECT * FROM supr_condicoes_pagamento ${todas ? '' : 'WHERE ativo = 1'} ORDER BY descricao COLLATE NOCASE`
  ).all();
  return json({ condicoes: results.map((c) => ({ ...c, parcelas: lerJson(c.parcelas, []) })) });
}

function dadosCondicao(corpo) {
  return {
    descricao: texto(corpo.descricao, 'descricao', { max: 120, obrigatorio: true, rotulo: 'a descrição' }),
    parcelas: validarParcelas(corpo.parcelas)
  };
}

export async function criarCondicao({ env, ctx, corpo }) {
  exigirEdicao(ctx);
  const d = dadosCondicao(corpo);
  const id = uuid();
  const ts = agora();
  await env.DB.prepare(
    'INSERT INTO supr_condicoes_pagamento (id, descricao, parcelas, ativo, criadoEm, atualizadoEm) VALUES (?, ?, ?, 1, ?, ?)'
  ).bind(id, d.descricao, JSON.stringify(d.parcelas), ts, ts).run();
  return json({ ok: true, id });
}

export async function atualizarCondicao({ env, ctx, params, corpo }) {
  exigirEdicao(ctx);
  const d = dadosCondicao(corpo);
  const r = await env.DB.prepare('UPDATE supr_condicoes_pagamento SET descricao = ?, parcelas = ?, ativo = 1, atualizadoEm = ? WHERE id = ?')
    .bind(d.descricao, JSON.stringify(d.parcelas), agora(), params.id).run();
  if (!r.meta.changes) falha(404, 'nao_encontrado', 'Condição de pagamento não encontrada.');
  return json({ ok: true });
}

// Pedidos guardam a cópia das parcelas: a condição só sai da lista
export async function excluirCondicao({ env, ctx, params }) {
  exigirEdicao(ctx);
  await env.DB.prepare('UPDATE supr_condicoes_pagamento SET ativo = 0, atualizadoEm = ? WHERE id = ?').bind(agora(), params.id).run();
  return json({ ok: true });
}

export async function condicaoPorId(env, id) {
  if (!id) return null;
  const c = await env.DB.prepare('SELECT * FROM supr_condicoes_pagamento WHERE id = ?').bind(id).first();
  return c ? { ...c, parcelas: lerJson(c.parcelas, []) } : null;
}

/* ---------- parâmetros e alçadas ---------- */
export async function obterConfiguracao({ env, ctx }) {
  const [p, alcadas] = await Promise.all([parametros(env), alcadasDoUsuario(env, ctx)]);
  return json({
    usuario: { email: ctx.email, nome: ctx.nome, isAdmin: ctx.isAdmin, permissoes: ctx.permissoes },
    parametros: p,
    alcadas
  });
}

// Textos dos e-mails: tamanho e campos {{...}} conferidos pelo mesmo módulo da tela
const MODELOS_EMAIL = {
  email_remetente_nome: { rotulo: 'Nome do remetente', tipo: null, onde: 'linha', max: 200 },
  email_rodape: { rotulo: 'Rodapé', tipo: null, onde: 'rodape', max: 600 },
  email_cotacao_assunto: { rotulo: 'Assunto do convite de cotação', tipo: 'cotacao', onde: 'assunto', max: 200 },
  email_cotacao_corpo: { rotulo: 'Texto do convite de cotação', tipo: 'cotacao', onde: 'corpo', max: 6000 },
  email_pedido_assunto: { rotulo: 'Assunto do pedido de compra', tipo: 'pedido', onde: 'assunto', max: 200 },
  email_pedido_corpo: { rotulo: 'Texto do pedido de compra', tipo: 'pedido', onde: 'corpo', max: 6000 }
};
const RE_EMAIL = /^[^\s@<>"]+@[^\s@<>"]+\.[^\s@<>"]+$/;
function valorDoParametro(chave, bruto) {
  if (/_exige_|^bloquear_|^email_copia_/.test(chave)) return bruto === true || bruto === '1' ? '1' : '0';
  if (chave === 'email_remetente') {
    const v = String(bruto || '').trim().toLowerCase();
    if (v && !RE_EMAIL.test(v)) falha(400, 'email_invalido', 'E-mail de envio inválido: use um endereço como contato@cazu.com.br.');
    return v;
  }
  const m = MODELOS_EMAIL[chave];
  if (m) {
    const v = String(bruto == null ? '' : bruto).replace(/\r\n?/g, '\n');
    if (v.length > m.max) falha(400, 'texto_longo', `${m.rotulo}: até ${m.max} caracteres.`);
    const erros = validarModelo(v, m.tipo, m.onde);
    if (erros.length) falha(400, 'modelo_invalido', `${m.rotulo}: ${erros.join('; ')}.`);
    return v.trim() ? v : '';
  }
  return texto(bruto, chave, { max: 300 }) || '';
}

export async function salvarParametros({ env, ctx, corpo }) {
  exigirAdmin(ctx);
  const valores = corpo.parametros || {};
  const comandos = [];
  for (const chave of Object.keys(PARAMETROS_PADRAO)) {
    if (!(chave in valores)) continue;
    const valor = valorDoParametro(chave, valores[chave]);
    comandos.push(env.DB.prepare(
      'INSERT INTO supr_parametros (chave, valor) VALUES (?1, ?2) ON CONFLICT(chave) DO UPDATE SET valor = excluded.valor'
    ).bind(chave, valor));
  }
  if (comandos.length) {
    comandos.push(historico(env, ctx, 'parametros', 'suprimentos', 'Parâmetros alterados', Object.keys(valores).join(', ')));
    await env.DB.batch(comandos);
  }
  return json({ ok: true, parametros: await parametros(env) });
}

// E-mail de teste com os textos da tela (ainda não salvos) e dados de exemplo, para quem está configurando
export async function emailDeTeste({ env, ctx, corpo }) {
  exigirAdmin(ctx);
  const tipo = corpo.tipo === 'pedido' ? 'pedido' : 'cotacao';
  const prm = await parametros(env);
  for (const [chave, bruto] of Object.entries(corpo.parametros || {})) {
    if (/^email_/.test(chave) && chave in PARAMETROS_PADRAO) prm[chave] = valorDoParametro(chave, bruto) || PARAMETROS_PADRAO[chave];
  }
  const usuario = { email: ctx.email, nome: ctx.nome };
  const dados = exemplo(tipo, usuario, { nome: prm.empresa_nome, documento: prm.empresa_documento, endereco: prm.empresa_endereco });
  const m = montarEmail(tipo, prm, dados);
  try {
    const r = await enviarEmail({ env, prm, usuario, nomeRemetente: m.nomeRemetente, destinatario: ctx.email,
      assunto: '[Teste] ' + m.assunto, html: m.html, texto: m.texto, semCopia: true });
    return json({ ok: true, destinatario: ctx.email, de: r.de, tipo: TIPOS_EMAIL[tipo].nome });
  } catch (e) {
    falha(502, 'falha_email', mensagemFalha(e));
  }
}

export async function listarAlcadas({ env, ctx }) {
  exigirAdmin(ctx);
  const { results } = await env.DB.prepare(
    `SELECT a.id, a.email, a.tipo, a.valorLimite, a.criadoEm, u.nome
       FROM supr_alcadas a LEFT JOIN usuarios u ON lower(u.email) = a.email ORDER BY a.email, a.tipo`
  ).all();
  const usuarios = await env.DB.prepare(
    "SELECT email, nome, isAdmin FROM usuarios WHERE status = 'aprovado' ORDER BY nome COLLATE NOCASE"
  ).all();
  return json({ alcadas: results, usuarios: usuarios.results });
}

export async function salvarAlcada({ env, ctx, corpo }) {
  exigirAdmin(ctx);
  const email = texto(corpo.email, 'email', { max: 200, obrigatorio: true, rotulo: 'o usuário' }).toLowerCase();
  const tipo = escolha(corpo.tipo, TIPOS_ALCADA, 'tipo');
  if (!tipo) falha(400, 'campo_obrigatorio', 'Informe o tipo de documento.');
  const valorLimite = numero(corpo.valorLimite, 'valorLimite', { min: 0, obrigatorio: false, rotulo: 'o limite' });
  const usuario = await env.DB.prepare('SELECT email FROM usuarios WHERE lower(email) = ?').bind(email).first();
  if (!usuario) falha(404, 'usuario_nao_encontrado', 'Usuário não encontrado.');
  await env.DB.batch([
    env.DB.prepare(
      `INSERT INTO supr_alcadas (id, email, tipo, valorLimite, criadoEm) VALUES (?1, ?2, ?3, ?4, ?5)
       ON CONFLICT(email, tipo) DO UPDATE SET valorLimite = excluded.valorLimite`
    ).bind(uuid(), email, tipo, valorLimite, agora()),
    historico(env, ctx, 'alcada', email, 'Alçada definida', `${tipo}: ${valorLimite == null ? 'sem limite' : valorLimite}`)
  ]);
  return json({ ok: true });
}

export async function excluirAlcada({ env, ctx, params }) {
  exigirAdmin(ctx);
  await env.DB.prepare('DELETE FROM supr_alcadas WHERE id = ?').bind(params.id).run();
  return json({ ok: true });
}
