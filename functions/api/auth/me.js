import { lerCookie, validarSessao } from '../../_lib/session.js';

export async function onRequestGet({ request, env }) {
  const token = lerCookie(request, 'sessao');
  const payload = token ? await validarSessao(token, env.SESSION_SECRET) : null;

  if (!payload) {
    return new Response('Não autenticado', { status: 401 });
  }

  const admins = (env.ADMIN_EMAILS || '')
    .split(',')
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);

  const isAdmin = admins.includes(payload.email.toLowerCase());

  return Response.json({ email: payload.email, nome: payload.nome, isAdmin });
}
