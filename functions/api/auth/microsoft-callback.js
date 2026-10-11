import { lerCookie } from '../../_lib/session.js';
import { autorizarOuRegistrarUsuario } from '../../_lib/usuarios.js';

export async function onRequestGet({ request, env }) {
  const url = new URL(request.url);
  const erroProvedor = url.searchParams.get('error');
  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state');
  const stateCookie = lerCookie(request, 'oauth_state');

  if (erroProvedor) {
    const erro = erroProvedor === 'access_denied' ? 'microsoft_cancelado' : 'microsoft';
    return Response.redirect(`${url.origin}/login?erro=${erro}`, 302);
  }

  if (!code || !state || state !== stateCookie) {
    return Response.redirect(`${url.origin}/login?erro=state`, 302);
  }

  const redirectUri = `${url.origin}/api/auth/microsoft-callback`;

  let tokenResp;
  try {
    tokenResp = await fetch('https://login.microsoftonline.com/common/oauth2/v2.0/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: env.MICROSOFT_CLIENT_ID,
        client_secret: env.MICROSOFT_CLIENT_SECRET,
        redirect_uri: redirectUri,
        grant_type: 'authorization_code'
      })
    });
  } catch (e) {
    return Response.redirect(`${url.origin}/login?erro=token`, 302);
  }

  if (!tokenResp.ok) {
    return Response.redirect(`${url.origin}/login?erro=token`, 302);
  }

  const tokenData = await tokenResp.json();

  let userResp;
  try {
    userResp = await fetch('https://graph.microsoft.com/v1.0/me', {
      headers: { Authorization: `Bearer ${tokenData.access_token}` }
    });
  } catch (e) {
    return Response.redirect(`${url.origin}/login?erro=perfil`, 302);
  }
  if (!userResp.ok) return Response.redirect(`${url.origin}/login?erro=perfil`, 302);
  const perfil = await userResp.json();
  const email = perfil.mail || perfil.userPrincipalName;
  if (!email) return Response.redirect(`${url.origin}/login?erro=sem_email`, 302);

  return autorizarOuRegistrarUsuario({
    env, url,
    email,
    nome: perfil.displayName || email,
    provedor: 'microsoft'
  });
}
