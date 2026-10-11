import { criarSessao, cookieHeader } from './session.js';

// Chamado pelos callbacks do Google e Microsoft depois de confirmar o e-mail da pessoa.
export async function autorizarOuRegistrarUsuario({ env, url, email, nome, provedor }) {
  const agora = new Date().toISOString();
  email = (email || '').toLowerCase().trim();

  if (!email) {
    return Response.redirect(`${url.origin}/login.html?erro=sem_email`, 302);
  }

  const admins = (env.ADMIN_EMAILS || '')
    .split(',')
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);

  let usuario = await env.DB.prepare(
    'SELECT * FROM usuarios WHERE email = ?'
  ).bind(email).first();

  if (!usuario) {
    const id = crypto.randomUUID();
    const eAdmin = admins.includes(email) ? 1 : 0;
    await env.DB.prepare(
      `INSERT INTO usuarios (id, email, nome, provedor, status, isAdmin, criadoEm)
       VALUES (?, ?, ?, ?, 'pendente', ?, ?)`
    ).bind(id, email, nome, provedor, eAdmin, agora).run();
    return Response.redirect(`${url.origin}/aguardando-aprovacao`, 302);
  }

  if (usuario.status === 'bloqueado') {
    return Response.redirect(`${url.origin}/login?erro=bloqueado`, 302);
  }

  if (usuario.status === 'pendente') {
    return Response.redirect(`${url.origin}/aguardando-aprovacao`, 302);
  }

  if (!usuario.isAdmin && admins.includes(email)) {
    await env.DB.prepare(
      'UPDATE usuarios SET isAdmin = 1 WHERE email = ?'
    ).bind(email).run();
    usuario.isAdmin = 1;
  }

  // status === 'aprovado' -> cria sessão de 30 dias
  const token = await criarSessao(
    { email: usuario.email, nome: usuario.nome, exp: Date.now() + 1000 * 60 * 60 * 24 * 30 },
    env.SESSION_SECRET
  );

  const headers = new Headers();
  headers.set('Location', `${url.origin}/`);
  headers.append('Set-Cookie', cookieHeader('sessao', token, { maxAge: 60 * 60 * 24 * 30 }));
  return new Response(null, { status: 302, headers });
}
