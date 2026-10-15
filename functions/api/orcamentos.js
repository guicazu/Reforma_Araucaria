import { lerCookie, validarSessao } from '../_lib/session.js';

async function usuarioPodeEditar(payload, env) {
  const email = payload && payload.email ? payload.email.toLowerCase() : '';
  if (!email) return false;
  const admins = (env.ADMIN_EMAILS || '').split(',').map((value) => value.trim().toLowerCase()).filter(Boolean);
  if (admins.includes(email)) return true;
  const usuario = await env.DB.prepare(
    'SELECT podeEditar, isAdmin FROM usuarios WHERE email = ?'
  ).bind(email).first();
  return Boolean(usuario && (usuario.podeEditar || usuario.isAdmin));
}

// O bloqueio de edição precisa estar ativo e pertencer ao usuário da sessão
async function bloqueioEhDoUsuario(env, orcamentoId, email) {
  const bloqueio = await env.DB.prepare(
    'SELECT 1 AS ok FROM bloqueios WHERE orcamentoId = ? AND lower(usuarioEmail) = ?'
  ).bind(orcamentoId, email.toLowerCase()).first();
  return Boolean(bloqueio);
}

// Versão de maior número (a "ativa"), independente da ordem do array
function versaoMaisRecente(o) {
  if (!o || !Array.isArray(o.versoes) || !o.versoes.length) return null;
  return o.versoes.reduce((a, b) => ((Number(b.numero) || 0) >= (Number(a.numero) || 0) ? b : a));
}

function unidadesDe(versao, o) {
  if (versao && Array.isArray(versao.unidades)) return versao.unidades;
  if (o && Array.isArray(o.unidades)) return o.unidades;
  return [];
}

async function autenticarEditor(request, env) {
  const token = lerCookie(request, 'sessao');
  const session = token ? await validarSessao(token, env.SESSION_SECRET) : null;
  if (!session || !session.email) {
    return { erro: Response.json({ erro: 'nao_autenticado' }, { status: 401 }) };
  }
  if (!(await usuarioPodeEditar(session, env))) {
    return { erro: Response.json({ erro: 'somente_visualizacao' }, { status: 403 }) };
  }
  return { session };
}

export async function onRequestGet({ env }) {
  // Lê todas as versões de todos os orçamentos, da mais antiga para a mais nova:
  // o front-end trata a ÚLTIMA versão do array como a ativa.
  const { results: versoes } = await env.DB.prepare(
    'SELECT * FROM orcamentos_versoes ORDER BY orcamentoId, versaoNumero ASC'
  ).all();

  const orcamentosPorId = {};
  for (const v of versoes) {
    if (!orcamentosPorId[v.orcamentoId]) {
      orcamentosPorId[v.orcamentoId] = {
        id: v.orcamentoId,
        codigo: v.codigo,
        nome: v.nome,
        criadoEm: v.criadoEm,
        versoes: []
      };
    }
    // Reconstrói a versão a partir do conteúdo salvo
    let unidades = [];
    try { unidades = JSON.parse(v.conteudo || '[]'); } catch(e) { unidades = []; }
    if (!Array.isArray(unidades)) unidades = [];
    orcamentosPorId[v.orcamentoId].versoes.push({
      id: v.id,
      numero: v.versaoNumero,
      revisao: v.revisao || 0,
      rotulo: v.rotulo,
      criadoEm: v.criadoEm,
      atualizadoEm: v.atualizadoEm,
      unidades: unidades
    });
  }

  const dados = Object.values(orcamentosPorId);

  const { results: bloqueios } = await env.DB.prepare(
    'SELECT orcamentoId, usuarioEmail, usuarioNome, criadoEm FROM bloqueios'
  ).all();
  const mapa = {};
  for (const b of bloqueios) mapa[b.orcamentoId] = b;

  for (const o of dados) {
    o.bloqueio = mapa[o.id]
      ? { email: mapa[o.id].usuarioEmail, nome: mapa[o.id].usuarioNome, criadoEm: mapa[o.id].criadoEm }
      : null;
  }

  return Response.json({ dados });
}

export async function onRequestPost({ request, env }) {
  const { session, erro } = await autenticarEditor(request, env);
  if (erro) return erro;

  let corpo;
  try {
    corpo = await request.json();
  } catch (error) {
    return Response.json({ erro: 'json_invalido' }, { status: 400 });
  }

  const orcamentos = corpo && (corpo.orcamentos ?? corpo.dados);
  if (!Array.isArray(orcamentos)) {
    return Response.json({ erro: 'orcamentos_invalidos' }, { status: 400 });
  }

  // ---------- Gerar nova versão: mesmo número, revisão volta a 0, versão + 1 ----------
  if (corpo.versaoNova && corpo.orcamentoId && corpo.versaoNumero) {
    const o = orcamentos.find(x => x && x.id === corpo.orcamentoId);
    if (!o) return Response.json({ erro: 'orcamento_nao_encontrado' }, { status: 404 });
    const versaoNumero = Number(corpo.versaoNumero);
    if (!Number.isInteger(versaoNumero) || versaoNumero < 1) {
      return Response.json({ erro: 'versao_invalida' }, { status: 400 });
    }
    if (!(await bloqueioEhDoUsuario(env, o.id, session.email))) {
      return Response.json({ erro: 'bloqueio_nao_permitido' }, { status: 409 });
    }

    const agora = new Date().toISOString();
    const versaoId = o.id + '-v' + versaoNumero;
    const rotulo = corpo.rotulo || ('Versão ' + versaoNumero);
    const versao = (Array.isArray(o.versoes) && o.versoes.find(v => Number(v.numero) === versaoNumero)) || versaoMaisRecente(o);
    const conteudo = JSON.stringify(unidadesDe(versao, o));

    await env.DB.prepare(
      `INSERT INTO orcamentos_versoes (id, orcamentoId, revisao, versaoNumero, rotulo, codigo, nome, criadoEm, conteudo, atualizadoEm)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         rotulo = excluded.rotulo,
         conteudo = excluded.conteudo,
         atualizadoEm = excluded.atualizadoEm`
    ).bind(
      versaoId,
      o.id,
      0,
      versaoNumero,
      rotulo,
      o.codigo || '',
      o.nome || '',
      o.criadoEm || agora,
      conteudo,
      agora
    ).run();

    return Response.json({ ok: true, versaoId, versaoNumero, revisao: 0, atualizadoEm: agora });
  }

  // ---------- Criação de novo orçamento (ou cópia): grava todas as versões com revisão 0 ----------
  if (corpo.novoOrcamento && corpo.orcamentoId) {
    const o = orcamentos.find(x => x && x.id === corpo.orcamentoId);
    if (!o) return Response.json({ erro: 'orcamento_nao_encontrado' }, { status: 404 });
    if (!(await bloqueioEhDoUsuario(env, o.id, session.email))) {
      return Response.json({ erro: 'bloqueio_nao_permitido' }, { status: 409 });
    }

    const agora = new Date().toISOString();
    const versoes = Array.isArray(o.versoes) && o.versoes.length
      ? o.versoes
      : [{ numero: 1, rotulo: 'Versão 1', unidades: unidadesDe(null, o) }];

    const stmt = env.DB.prepare(
      `INSERT INTO orcamentos_versoes (id, orcamentoId, revisao, versaoNumero, rotulo, codigo, nome, criadoEm, conteudo, atualizadoEm)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO NOTHING`
    );
    await env.DB.batch(versoes.map((v, idx) => {
      const numero = Number(v.numero) || idx + 1;
      return stmt.bind(
        o.id + '-v' + numero,
        o.id,
        0,
        numero,
        v.rotulo || ('Versão ' + numero),
        o.codigo || '',
        o.nome || '',
        v.criadoEm || o.criadoEm || agora,
        JSON.stringify(unidadesDe(v, null)),
        agora
      );
    }));

    const ativa = versaoMaisRecente({ versoes });
    const numeroAtivo = Number(ativa.numero) || versoes.length;
    return Response.json({ ok: true, versaoId: o.id + '-v' + numeroAtivo, versaoNumero: numeroAtivo, revisao: 0, atualizadoEm: agora });
  }

  // ---------- Salvar alteração: mesmo número, mesma versão, revisão + 1 ----------
  const ids = new Set();
  for (const orcamento of orcamentos) {
    if (!orcamento || typeof orcamento.id !== 'string' || !orcamento.id || ids.has(orcamento.id)) {
      return Response.json({ erro: 'orcamentos_invalidos' }, { status: 400 });
    }
    ids.add(orcamento.id);
  }

  const editandoId = corpo.editandoId;
  if (typeof editandoId !== 'string' || !ids.has(editandoId)) {
    return Response.json({ erro: 'bloqueio_obrigatorio' }, { status: 409 });
  }
  if (!(await bloqueioEhDoUsuario(env, editandoId, session.email))) {
    return Response.json({ erro: 'bloqueio_nao_permitido' }, { status: 409 });
  }

  const agora = new Date().toISOString();
  const o = orcamentos.find(x => x.id === editandoId);
  const versao = versaoMaisRecente(o);
  const conteudo = JSON.stringify(unidadesDe(versao, o));

  // Salvar NÃO cria uma versão nova — atualiza a linha da versão ativa e soma 1 na revisão.
  // Busca pela versão que o cliente está editando; sem número, usa a maior gravada.
  const numeroCliente = versao ? Number(versao.numero) : NaN;
  const colunas = 'id, versaoNumero, revisao, conteudo, nome, codigo, atualizadoEm';
  const linhaAtual = Number.isInteger(numeroCliente) && numeroCliente > 0
    ? await env.DB.prepare(
        `SELECT ${colunas} FROM orcamentos_versoes WHERE orcamentoId = ? AND versaoNumero = ?`
      ).bind(editandoId, numeroCliente).first()
    : await env.DB.prepare(
        `SELECT ${colunas} FROM orcamentos_versoes WHERE orcamentoId = ? ORDER BY versaoNumero DESC LIMIT 1`
      ).bind(editandoId).first();

  if (!linhaAtual) {
    if (!Number.isInteger(numeroCliente) || numeroCliente < 1) {
      return Response.json({ erro: 'versao_nao_encontrada' }, { status: 404 });
    }
    // A versão existe só no navegador (ex.: falhou a gravação ao gerá-la): cria a linha agora
    const versaoId = editandoId + '-v' + numeroCliente;
    await env.DB.prepare(
      `INSERT INTO orcamentos_versoes (id, orcamentoId, revisao, versaoNumero, rotulo, codigo, nome, criadoEm, conteudo, atualizadoEm)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).bind(
      versaoId,
      editandoId,
      1,
      numeroCliente,
      versao.rotulo || ('Versão ' + numeroCliente),
      o.codigo || '',
      o.nome || '',
      versao.criadoEm || o.criadoEm || agora,
      conteudo,
      agora
    ).run();
    return Response.json({ ok: true, versaoId, versaoNumero: numeroCliente, revisao: 1, atualizadoEm: agora });
  }

  // Nada mudou desde a última gravação: não gera nova revisão
  if (linhaAtual.conteudo === conteudo &&
      (linhaAtual.nome || '') === (o.nome || '') &&
      (linhaAtual.codigo || '') === (o.codigo || '')) {
    return Response.json({
      ok: true,
      semAlteracoes: true,
      versaoId: linhaAtual.id,
      versaoNumero: linhaAtual.versaoNumero,
      revisao: linhaAtual.revisao || 0,
      atualizadoEm: linhaAtual.atualizadoEm
    });
  }

  const novaRevisao = (linhaAtual.revisao || 0) + 1;

  // Nome e código valem para o orçamento todo, não só para a versão ativa
  await env.DB.batch([
    env.DB.prepare(
      `UPDATE orcamentos_versoes
         SET revisao = ?, conteudo = ?, atualizadoEm = ?
       WHERE id = ?`
    ).bind(novaRevisao, conteudo, agora, linhaAtual.id),
    env.DB.prepare(
      'UPDATE orcamentos_versoes SET nome = ?, codigo = ? WHERE orcamentoId = ?'
    ).bind(o.nome || '', o.codigo || '', editandoId)
  ]);

  return Response.json({
    ok: true,
    versaoId: linhaAtual.id,
    versaoNumero: linhaAtual.versaoNumero,
    revisao: novaRevisao,
    atualizadoEm: agora
  });
}

// ---------- Excluir orçamento (todas as versões e o bloqueio) ou só uma versão ----------
export async function onRequestDelete({ request, env }) {
  const { session, erro } = await autenticarEditor(request, env);
  if (erro) return erro;

  const url = new URL(request.url);
  let id = url.searchParams.get('id') || '';
  if (!id) {
    try {
      const corpo = await request.json();
      id = (corpo && corpo.id) || '';
    } catch (e) { /* sem corpo */ }
  }
  if (typeof id !== 'string' || !id) {
    return Response.json({ erro: 'parametros_invalidos' }, { status: 400 });
  }
  if (!(await bloqueioEhDoUsuario(env, id, session.email))) {
    return Response.json({ erro: 'bloqueio_nao_permitido' }, { status: 409 });
  }

  // ---------- Excluir só uma versão (?versao=N): o orçamento mantém pelo menos uma ----------
  const versaoParam = url.searchParams.get('versao');
  if (versaoParam !== null) {
    const versaoNumero = Number(versaoParam);
    if (!Number.isInteger(versaoNumero) || versaoNumero < 1) {
      return Response.json({ erro: 'parametros_invalidos' }, { status: 400 });
    }
    // Numa instrução só, para nunca apagar a última versão gravada
    const { meta } = await env.DB.prepare(
      `DELETE FROM orcamentos_versoes
        WHERE orcamentoId = ? AND versaoNumero = ?
          AND (SELECT COUNT(*) FROM orcamentos_versoes WHERE orcamentoId = ?) > 1`
    ).bind(id, versaoNumero, id).run();
    if (meta && meta.changes === 1) return Response.json({ ok: true });
    const existe = await env.DB.prepare(
      'SELECT 1 AS ok FROM orcamentos_versoes WHERE orcamentoId = ? AND versaoNumero = ?'
    ).bind(id, versaoNumero).first();
    return existe
      ? Response.json({ erro: 'ultima_versao' }, { status: 409 })
      : Response.json({ erro: 'versao_nao_encontrada' }, { status: 404 });
  }

  await env.DB.batch([
    env.DB.prepare('DELETE FROM orcamentos_versoes WHERE orcamentoId = ?').bind(id),
    env.DB.prepare('DELETE FROM bloqueios WHERE orcamentoId = ?').bind(id)
  ]);

  return Response.json({ ok: true });
}
