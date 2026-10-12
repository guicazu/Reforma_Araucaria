import { lerCookie, validarSessao } from '../../_lib/session.js';

async function ehAdmin(payload, env) {
  if (!payload || !payload.email) return false;
  const admins = (env.ADMIN_EMAILS || '')
    .split(',').map((e) => e.trim().toLowerCase()).filter(Boolean);
  if (admins.includes(payload.email.toLowerCase()) || payload.email.toLowerCase() === 'cazu89@gmail.com') return true;
  const usuario = await env.DB.prepare('SELECT isAdmin FROM usuarios WHERE email = ?')
    .bind(payload.email.toLowerCase()).first();
  return Boolean(usuario && usuario.isAdmin);
}

export async function onRequestPost({ request, env }) {
  const token = lerCookie(request, 'sessao');
  const payload = token ? await validarSessao(token, env.SESSION_SECRET) : null;
  if (!(await ehAdmin(payload, env))) {
    return Response.json({ erro: 'nao_autorizado' }, { status: 403 });
  }
  const corpo = await request.json();
  const id = (corpo && corpo.id) || '';
  if (!id) return Response.json({ erro: 'parametros_invalidos' }, { status: 400 });
  await env.DB.prepare('DELETE FROM bloqueios WHERE orcamentoId = ?').bind(id).run();
  return Response.json({ ok: true });
}