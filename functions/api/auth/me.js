import { lerCookie, validarSessao } from '../../_lib/session.js';

export async function onRequestGet({ request, env }) {
  const token = lerCookie(request, 'sessao');
  const payload = token ? await validarSessao(token, env.SESSION_SECRET) : null;

  if (!payload) {
    return new Response('Não autenticado', { status: 401 });
  }

  const usuario = await env.DB.prepare(
    'SELECT nome, telefone, isAdmin, podeEditar FROM usuarios WHERE email = ?'
  ).bind(payload.email).first();

  const admins = (env.ADMIN_EMAILS || '')
    .split(',')
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);

  const isAdmin = Boolean(usuario && usuario.isAdmin) || admins.includes(payload.email.toLowerCase()) || payload.email.toLowerCase() === 'cazu89@gmail.com';

  return Response.json({
    email: payload.email,
    nome: (usuario && usuario.nome) || payload.nome,
    telefone: usuario ? usuario.telefone : null,
    isAdmin,
    podeEditar: isAdmin || Boolean(usuario && usuario.podeEditar)
  });
}
