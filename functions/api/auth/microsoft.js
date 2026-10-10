import { cookieHeader } from '../../_lib/session.js';

export async function onRequestGet({ request, env }) {
  const url = new URL(request.url);
  const state = crypto.randomUUID();
  const redirectUri = `${url.origin}/api/auth/microsoft-callback`;

  const params = new URLSearchParams({
    client_id: env.MICROSOFT_CLIENT_ID,
    redirect_uri: redirectUri,
    response_type: 'code',
    response_mode: 'query',
    scope: 'openid email profile User.Read',
    state
  });

  const resposta = Response.redirect(
    `https://login.microsoftonline.com/common/oauth2/v2.0/authorize?${params.toString()}`,
    302
  );
  resposta.headers.append('Set-Cookie', cookieHeader('oauth_state', state, { maxAge: 600 }));
  return resposta;
}
