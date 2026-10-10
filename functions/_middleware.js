import { lerCookie, validarSessao } from './_lib/session.js';

// Caminhos que continuam acessíveis sem login
const CAMINHOS_PUBLICOS = [
  '/login',
  '/aguardando-aprovacao',
  '/api/auth/google',
  '/api/auth/google-callback',
  '/api/auth/microsoft',
  '/api/auth/microsoft-callback'
];

const PREFIXOS_PUBLICOS = ['/css/', '/js/'];

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

  if (!payload) {
    return Response.redirect(`${url.origin}/login.html`, 302);
  }

  return next();
}
