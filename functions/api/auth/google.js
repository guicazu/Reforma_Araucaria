import { cookieHeader } from '../../_lib/session.js';

export async function onRequestGet({ request, env }) {
  const url = new URL(request.url);
  const state = crypto.randomUUID();
  const redirectUri = `${url.origin}/api/auth/google-callback`;

  const params = new URLSearchParams({
    client_id: env.GOOGLE_CLIENT_ID,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: 'openid email profile',
    state,
    prompt: 'select_account'
  });

  const resposta = Response.redirect(
    `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`,
    302
  );
  resposta.headers.append('Set-Cookie', cookieHeader('oauth_state', state, { maxAge: 600 }));
  return resposta;
}
