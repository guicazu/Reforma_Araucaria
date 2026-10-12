
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
  const row = await env.DB.prepare(
    "SELECT conteudo FROM orcamentos WHERE id = 'atual'"
  ).first();
  let dados = [];
  if (row && row.conteudo) {
    dados = JSON.parse(row.conteudo);
    if (!Array.isArray(dados)) throw new Error('Snapshot de orçamentos inválido no D1');
  }

  // Anexa o bloqueio ativo de cada orçamento
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
  const ids = new Set();
  for (const orcamento of orcamentos) {
    if (!orcamento || typeof orcamento.id !== 'string' || !orcamento.id || ids.has(orcamento.id)) {
      return Response.json({ erro: 'orcamentos_invalidos' }, { status: 400 });
    }
    ids.add(orcamento.id);
  }

  const atual = await env.DB.prepare(
    "SELECT conteudo FROM orcamentos WHERE id = 'atual'"
  ).first();
  const anteriores = atual && atual.conteudo ? JSON.parse(atual.conteudo) : [];
  if (!Array.isArray(anteriores)) throw new Error('Snapshot de orçamentos inválido no D1');
  const antigosPorId = new Map(anteriores.map((orcamento) => [orcamento.id, orcamento]));
  const novosPorId = new Map(orcamentos.map((orcamento) => [orcamento.id, orcamento]));
  const idsAlterados = new Set([...antigosPorId.keys(), ...novosPorId.keys()]);
  for (const id of [...idsAlterados]) {
    if (JSON.stringify(antigosPorId.get(id)) === JSON.stringify(novosPorId.get(id))) {
      idsAlterados.delete(id);
    }
  }
  if (!idsAlterados.size) return Response.json({ ok: true, semAlteracoes: true });

  const editandoId = corpo.editandoId;
  if (typeof editandoId !== 'string' || idsAlterados.size !== 1 || !idsAlterados.has(editandoId)) {
    return Response.json({ erro: 'bloqueio_obrigatorio' }, { status: 409 });
  }
  const agora = new Date().toISOString();
  const conteudo = JSON.stringify(orcamentos);
  const gravacao = await env.DB.prepare(
    `INSERT INTO orcamentos (id, codigo, nome, criadoEm, conteudo, atualizadoEm)
     SELECT 'atual', 'SNAP', 'Estado atual', ?, ?, ?
     WHERE EXISTS (
       SELECT 1 FROM bloqueios WHERE orcamentoId = ? AND lower(usuarioEmail) = ?
     )
     ON CONFLICT(id) DO UPDATE SET conteudo = excluded.conteudo, atualizadoEm = excluded.atualizadoEm
     WHERE EXISTS (
       SELECT 1 FROM bloqueios WHERE orcamentoId = ? AND lower(usuarioEmail) = ?
     )`
  ).bind(
    agora, conteudo, agora,
    editandoId, session.email.toLowerCase(),
    editandoId, session.email.toLowerCase()
  ).run();
  if (!gravacao.meta || gravacao.meta.changes !== 1) {
    return Response.json({ erro: 'bloqueio_nao_permitido' }, { status: 409 });
  }
  return Response.json({ ok: true, atualizadoEm: agora });
}