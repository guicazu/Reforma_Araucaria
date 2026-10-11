import { lerCookie, validarSessao } from '../../_lib/session.js';

export async function onRequestPost({ request, env }) {
  const token = lerCookie(request, 'sessao');
  const payload = token ? await validarSessao(token, env.SESSION_SECRET) : null;

  if (!payload) {
    return new Response('Não autenticado', { status: 401 });
  }

  const corpo = await request.json();
  const nome = (corpo.nome || '').trim();
  const telefone = (corpo.telefone || '').trim();

  await env.DB.prepare(
    'UPDATE usuarios SET nome = ?, telefone = ? WHERE email = ?'
  ).bind(nome || payload.nome, telefone, payload.email).run();

  return Response.json({ ok: true });
}
