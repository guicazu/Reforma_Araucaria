import { lerCookie, validarSessao } from '../_lib/session.js';

async function usuarioDaSessao(request, env) {
  const token = lerCookie(request, 'sessao');
  return token ? await validarSessao(token, env.SESSION_SECRET) : null;
}

async function ehAdmin(payload, env) {
  if (!payload || !payload.email) return false;
  const admins = (env.ADMIN_EMAILS || '')
    .split(',').map((e) => e.trim().toLowerCase()).filter(Boolean);
  if (admins.includes(payload.email.toLowerCase()) || payload.email.toLowerCase() === 'cazu89@gmail.com') return true;
  const usuario = await env.DB.prepare('SELECT isAdmin FROM usuarios WHERE email = ?')
    .bind(payload.email.toLowerCase()).first();
  return Boolean(usuario && usuario.isAdmin);
}

async function podeEditar(payload, env) {
  if (!payload || !payload.email) return false;
  if (await ehAdmin(payload, env)) return true;
  const usuario = await env.DB.prepare(
    'SELECT podeEditar FROM usuarios WHERE email = ?'
  ).bind(payload.email.toLowerCase()).first();
  return Boolean(usuario && usuario.podeEditar);
}

// Lista todos os bloqueios ativos (usado pela tela do admin)
export async function onRequestGet({ request, env }) {
  const payload = await usuarioDaSessao(request, env);
  if (!payload) return Response.json({ erro: 'nao_autenticado' }, { status: 401 });
  if (!(await ehAdmin(payload, env))) {
    return Response.json({ erro: 'nao_autorizado' }, { status: 403 });
  }
  const { results } = await env.DB.prepare(
    'SELECT orcamentoId, usuarioEmail, usuarioNome, criadoEm FROM bloqueios'
  ).all();
  return Response.json({ bloqueios: results });
}

// Adquire o bloqueio de um orçamento (ao abrir para edição)
export async function onRequestPost({ request, env }) {
  const payload = await usuarioDaSessao(request, env);
  if (!payload) return Response.json({ erro: 'nao_autenticado' }, { status: 401 });
  if (!(await podeEditar(payload, env))) {
    return Response.json({ erro: 'somente_visualizacao' }, { status: 403 });
  }

  const corpo = await request.json();
  const id = (corpo && corpo.id) || '';
  if (!id) return Response.json({ erro: 'parametros_invalidos' }, { status: 400 });

  const agora = new Date().toISOString();
  const result = await env.DB.prepare(
    `INSERT INTO bloqueios (orcamentoId, usuarioEmail, usuarioNome, criadoEm)
     VALUES (?, ?, ?, ?)
     ON CONFLICT(orcamentoId) DO UPDATE SET
       usuarioNome = excluded.usuarioNome,
       criadoEm = excluded.criadoEm
     WHERE bloqueios.usuarioEmail = excluded.usuarioEmail`
  ).bind(id, payload.email.toLowerCase(), payload.nome || '', agora).run();

  if (!result.meta || result.meta.changes !== 1) {
    const existente = await env.DB.prepare(
      'SELECT usuarioEmail, usuarioNome FROM bloqueios WHERE orcamentoId = ?'
    ).bind(id).first();
    return Response.json({
      erro: 'ja_bloqueado',
      bloqueadoPor: existente && (existente.usuarioNome || existente.usuarioEmail)
    }, { status: 409 });
  }

  return Response.json({ ok: true });
}

// Libera o bloqueio (dono ou admin)
export async function onRequestPut({ request, env }) {
  const payload = await usuarioDaSessao(request, env);
  if (!payload) return Response.json({ erro: 'nao_autenticado' }, { status: 401 });

  const corpo = await request.json();
  const id = (corpo && corpo.id) || '';
  if (!id) return Response.json({ erro: 'parametros_invalidos' }, { status: 400 });

  const admin = await ehAdmin(payload, env);
  await env.DB.prepare(
    'DELETE FROM bloqueios WHERE orcamentoId = ? AND (lower(usuarioEmail) = ? OR ? = 1)'
  ).bind(id, payload.email.toLowerCase(), admin ? 1 : 0).run();
  return Response.json({ ok: true });
}