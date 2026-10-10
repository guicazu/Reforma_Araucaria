import { lerCookie } from '../../_lib/session.js';
import { autorizarOuRegistrarUsuario } from '../../_lib/usuarios.js';

export async function onRequestGet({ request, env }) {
  const url = new URL(request.url);
  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state');
  const stateCookie = lerCookie(request, 'oauth_state');

  if (!code || !state || state !== stateCookie) {
    return Response.redirect(`${url.origin}/login?erro=state`, 302);
  }

  const redirectUri = `${url.origin}/api/auth/google-callback`;

  const tokenResp = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: env.GOOGLE_CLIENT_ID,
      client_secret: env.GOOGLE_CLIENT_SECRET,
      redirect_uri: redirectUri,
      grant_type: 'authorization_code'
    })
  });

  if (!tokenResp.ok) {
    return Response.redirect(`${url.origin}/login?erro=token`, 302);
  }

  const tokenData = await tokenResp.json();

  const userResp = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
    headers: { Authorization: `Bearer ${tokenData.access_token}` }
  });
  const perfil = await userResp.json();

  return autorizarOuRegistrarUsuario({
    env, url,
    email: perfil.email,
    nome: perfil.name || perfil.email,
    provedor: 'google'
  });
}
