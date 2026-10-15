import { lerCookie, validarSessao, apagarCookieHeader } from './_lib/session.js';

// Caminhos que continuam acessíveis sem login
const CAMINHOS_PUBLICOS = [
  '/login',
  '/aguardando-aprovacao',
  '/api/auth/google',
  '/api/auth/google-callback',
  '/api/auth/microsoft',
  '/api/auth/microsoft-callback',
  '/api/compras/confirmar', // link antigo de confirmação enviado ao fornecedor
  '/confirmar-pedido', // Cloudflare Pages redireciona /confirmar-pedido.html para cá
  '/confirmar-pedido.html'
];
// /api/compras/confirmar/<token>: dados e confirmação do pedido, usados pela página do fornecedor
const PREFIXOS_PUBLICOS = ['/css/', '/js/', '/api/compras/confirmar/'];

export async function onRequest({ request, env, next }) {
  const url = new URL(request.url);

  const publico =
    CAMINHOS_PUBLICOS.includes(url.pathname) ||
    PREFIXOS_PUBLICOS.some((p) => url.pathname.startsWith(p)) ||
    url.pathname === '/logo.png' ||
    url.pathname === '/favicon.ico';
  if (publico) return next();

  const token = lerCookie(request, 'sessao');
  const payload = token ? await validarSessao(token, env.SESSION_SECRET) : null;

  if (!payload || !payload.email) {
    return Response.redirect(`${url.origin}/login`, 302);
  }

  // A sessão dura 30 dias: confere a cada requisição se o usuário continua aprovado,
  // para que um bloqueio feito pelo administrador valha imediatamente.
  const usuario = await env.DB.prepare('SELECT status FROM usuarios WHERE email = ?')
    .bind(payload.email.toLowerCase()).first();
  if (!usuario || usuario.status !== 'aprovado') {
    const destino = usuario && usuario.status === 'pendente' ? '/aguardando-aprovacao' : '/login?erro=bloqueado';
    const headers = new Headers();
    headers.set('Location', `${url.origin}${destino}`);
    headers.append('Set-Cookie', apagarCookieHeader('sessao'));
    return new Response(null, { status: 302, headers });
  }

  return next();
}
