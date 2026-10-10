import { apagarCookieHeader } from '../../_lib/session.js';

export async function onRequestGet({ request }) {
  const url = new URL(request.url);
  const headers = new Headers();
  headers.set('Location', `${url.origin}/login`);
  headers.append('Set-Cookie', apagarCookieHeader('sessao'));
  return new Response(null, { status: 302, headers });
}
