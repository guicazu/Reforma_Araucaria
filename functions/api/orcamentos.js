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
    const unidades = JSON.parse(v.conteudo || '[]');
    orcamentosPorId[v.orcamentoId].versoes.push({
      id: v.id,
      numero: v.versaoNumero,
      rotulo: v.rotulo,
      criadoEm: v.criadoEm,
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
  
  // Se é uma nova versão (versaoNova) - incrementa versão, revisao = 0
  if (corpo.versaoNova && corpo.orcamentoId && corpo.versaoNumero) {
    const o = orcamentos.find(x => x.id === corpo.orcamentoId);
    if (!o) return Response.json({ erro: 'orcamento_nao_encontrado' }, { status: 404 });
    
    const agora = new Date().toISOString();
    const versaoId = o.id + '-v' + corpo.versaoNumero;
    
    await env.DB.prepare(
      `INSERT INTO orcamentos_versoes (id, orcamentoId, revisao, versaoNumero, rotulo, codigo, nome, criadoEm, conteudo, atualizadoEm)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         rotulo = excluded.rotulo,
         conteudo = excluded.conteudo,
         atualizadoEm = excluded.atualizadoEm`
    ).bind(
      versaoId,
      o.id,
      0,
      corpo.rotulo || ('Versão ' + corpo.versaoNumero),
      o.codigo || '',
      o.nome || '',
      o.criadoEm || agora,
      JSON.stringify((o.versoes && o.versoes[o.versoes.length - 1] && o.versoes[o.versoes.length - 1].unidades && o.versoes[o.versoes.length - 1].unidades.length > 0) ? o.versoes[o.versoes.length - 1].unidades : (o.versoes && o.versoes[0] && o.versoes[0].unidades ? o.versoes[0].unidades : [])),
      agora
    ).run();
    
    return Response.json({ ok: true, versaoId, atualizadoEm: agora });
  }
  
  // Se é criação de novo orçamento (versão 1)
  if (corpo.novoOrcamento && corpo.orcamentoId) {
    const o = orcamentos.find(x => x.id === corpo.orcamentoId);
    if (!o) return Response.json({ erro: 'orcamento_nao_encontrado' }, { status: 404 });
    
    const agora = new Date().toISOString();
    const versaoId = o.id + '-v1';
    
    await env.DB.prepare(
      `INSERT INTO orcamentos_versoes (id, orcamentoId, revisao, versaoNumero, rotulo, codigo, nome, criadoEm, conteudo, atualizadoEm)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO NOTHING`
    ).bind(
      versaoId,
      o.id,
      1,
      'Versão 1',
      o.codigo || '',
      o.nome || '',
      o.criadoEm || agora,
      JSON.stringify(o.versoes ? o.versoes[0].unidades : []),
      agora
    ).run();
    
    return Response.json({ ok: true, versaoId, atualizadoEm: agora });
  }
  
  // Atualização normal (salva como nova versão ou atualiza existente)
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
  
  // Salva como nova versão (versão atual + 1) ou atualiza se já existe
  const ultimaVersao = await env.DB.prepare(
    'SELECT MAX(versaoNumero) as maxNum FROM orcamentos_versoes WHERE orcamentoId = ?'
  ).bind(editandoId).first();
  const ultimaRevisao = await env.DB.prepare('SELECT MAX(revisao) as maxRev FROM orcamentos_versoes WHERE orcamentoId = ?').bind(editandoId).first();
  const novaRevisao = (ultimaRevisao && ultimaRevisao.maxRev ? ultimaRevisao.maxRev : 0) + 1;
  const novoNum = (ultimaVersao && ultimaVersao.maxNum ? ultimaVersao.maxNum : 0) + 1;
  const versaoId = editandoId + '-v' + novoNum;
  
  await env.DB.prepare(
    `INSERT INTO orcamentos_versoes (id, orcamentoId, revisao, versaoNumero, rotulo, codigo, nome, criadoEm, conteudo, atualizadoEm)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       rotulo = excluded.rotulo,
       conteudo = excluded.conteudo,
       atualizadoEm = excluded.atualizadoEm`
  ).bind(
    versaoId,
    editandoId,
    novoNum,
    'Versão ' + novoNum,
    o.codigo || '',
    o.nome || '',
    o.criadoEm || agora,
    JSON.stringify((o.versoes && o.versoes[o.versoes.length - 1] && o.versoes[o.versoes.length - 1].unidades && o.versoes[o.versoes.length - 1].unidades.length > 0) ? o.versoes[o.versoes.length - 1].unidades : (o.versoes && o.versoes[0] && o.versoes[0].unidades ? o.versoes[0].unidades : [])),
    agora
  ).run();
  
  return Response.json({ ok: true, versaoId, atualizadoEm: agora });
}
