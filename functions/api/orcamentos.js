import { lerCookie, validarSessao } from '../_lib/session.js';

async function usuarioPodeEditar(payload, env) {
  const email = payload && payload.email ? payload.email.toLowerCase() : '';
  if (!email) return false;
  const admins = (env.ADMIN_EMAILS || '').split(',').map((value) => value.trim().toLowerCase());
  if (admins.includes(email) || email === 'cazu89@gmail.com') return true;
  const usuario = await env.DB.prepare(
    'SELECT podeEditar, isAdmin FROM usuarios WHERE email = ?'
  ).bind(email).first();
  return Boolean(usuario && (usuario.podeEditar || usuario.isAdmin));
}

export async function onRequestGet({ env }) {
  // Lê todas as versões de todos os orçamentos
  const { results: versoes } = await env.DB.prepare(
    'SELECT * FROM orcamentos_versoes ORDER BY orcamentoId, versaoNumero DESC'
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
  const token = lerCookie(request, 'sessao');
  const session = token ? await validarSessao(token, env.SESSION_SECRET) : null;
  if (!session) return Response.json({ erro: 'nao_autenticado' }, { status: 401 });
  if (!(await usuarioPodeEditar(session, env))) {
    return Response.json({ erro: 'somente_visualizacao' }, { status: 403 });
  }

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
    const o = orcamentos.find(x => x.id === corpo.orcamentoId);
    if (!o) return Response.json({ erro: 'orcamento_nao_encontrado' }, { status: 404 });

    const agora = new Date().toISOString();
    const versaoId = o.id + '-v' + corpo.versaoNumero;
    const rotulo = corpo.rotulo || ('Versão ' + corpo.versaoNumero);
    const conteudo = JSON.stringify(
      (o.versoes && o.versoes[o.versoes.length - 1] && o.versoes[o.versoes.length - 1].unidades)
        ? o.versoes[o.versoes.length - 1].unidades
        : (o.unidades ? o.unidades : [])
    );

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
      corpo.versaoNumero,
      rotulo,
      o.codigo || '',
      o.nome || '',
      o.criadoEm || agora,
      conteudo,
      agora
    ).run();

    return Response.json({ ok: true, versaoId, versaoNumero: corpo.versaoNumero, revisao: 0, atualizadoEm: agora });
  }

  // ---------- Criação de novo orçamento: número novo, revisão 0, versão 1 ----------
  if (corpo.novoOrcamento && corpo.orcamentoId) {
    const o = orcamentos.find(x => x.id === corpo.orcamentoId);
    if (!o) return Response.json({ erro: 'orcamento_nao_encontrado' }, { status: 404 });

    const agora = new Date().toISOString();
    const versaoId = o.id + '-v1';

    await env.DB.prepare(
      `INSERT INTO orcamentos_versoes (id, orcamentoId, revisao, versaoNumero, rotulo, codigo, nome, criadoEm, conteudo, atualizadoEm)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO NOTHING`
    ).bind(
      versaoId,
      o.id,
      0,
      1,
      'Versão 1',
      o.codigo || '',
      o.nome || '',
      o.criadoEm || agora,
      JSON.stringify(o.versoes ? o.versoes[0].unidades : []),
      agora
    ).run();

    return Response.json({ ok: true, versaoId, versaoNumero: 1, revisao: 0, atualizadoEm: agora });
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

  const agora = new Date().toISOString();
  const o = orcamentos.find(x => x.id === editandoId);

  // A versão "atual" é a linha de maior versaoNumero para esse orçamento.
  // Salvar NÃO cria uma versão nova — atualiza essa linha e soma 1 na revisão.
  const linhaAtual = await env.DB.prepare(
    'SELECT id, versaoNumero, revisao FROM orcamentos_versoes WHERE orcamentoId = ? ORDER BY versaoNumero DESC LIMIT 1'
  ).bind(editandoId).first();

  if (!linhaAtual) {
    return Response.json({ erro: 'versao_nao_encontrada' }, { status: 404 });
  }

  const novaRevisao = (linhaAtual.revisao || 0) + 1;
  const conteudo = JSON.stringify(
    (o.versoes && o.versoes[o.versoes.length - 1] && o.versoes[o.versoes.length - 1].unidades)
      ? o.versoes[o.versoes.length - 1].unidades
      : (o.unidades ? o.unidades : [])
  );

  await env.DB.prepare(
    `UPDATE orcamentos_versoes
       SET revisao = ?, nome = ?, codigo = ?, conteudo = ?, atualizadoEm = ?
     WHERE id = ?`
  ).bind(
    novaRevisao,
    o.nome || '',
    o.codigo || '',
    conteudo,
    agora,
    linhaAtual.id
  ).run();

  return Response.json({
    ok: true,
    versaoId: linhaAtual.id,
    versaoNumero: linhaAtual.versaoNumero,
    revisao: novaRevisao,
    atualizadoEm: agora
  });
}
