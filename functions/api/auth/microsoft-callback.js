import { lerCookie } from '../../_lib/session.js';
import { autorizarOuRegistrarUsuario } from '../../_lib/usuarios.js';

export async function onRequestGet({ request, env }) {
  const url = new URL(request.url);
  let etapa = 'callback';
  try {
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
    etapa = 'troca_token';
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
      console.error('[auth:microsoft] Falha de rede na troca do token:', e);
      return Response.redirect(`${url.origin}/login?erro=token`, 302);
    }

    if (!tokenResp.ok) {
      console.error(`[auth:microsoft] Provedor recusou a troca do token; status=${tokenResp.status}`);
      return Response.redirect(`${url.origin}/login?erro=token`, 302);
    }

    etapa = 'leitura_token';
    const tokenData = await tokenResp.json();
    if (!tokenData.access_token) {
      return Response.redirect(`${url.origin}/login?erro=token`, 302);
    }

    let userResp;
    etapa = 'consulta_perfil';
    try {
      userResp = await fetch('https://graph.microsoft.com/v1.0/me', {
        headers: { Authorization: `Bearer ${tokenData.access_token}` }
      });
    } catch (e) {
      console.error('[auth:microsoft] Falha de rede ao consultar o perfil:', e);
      return Response.redirect(`${url.origin}/login?erro=perfil`, 302);
    }
    if (!userResp.ok) {
      console.error(`[auth:microsoft] Graph recusou a consulta do perfil; status=${userResp.status}`);
      return Response.redirect(`${url.origin}/login?erro=perfil`, 302);
    }
    const perfil = await userResp.json();
    const email = perfil.mail || perfil.userPrincipalName;
    if (!email) return Response.redirect(`${url.origin}/login?erro=sem_email`, 302);

    etapa = 'usuario_sessao';
    return await autorizarOuRegistrarUsuario({
      env, url,
      email,
      nome: perfil.displayName || email,
      provedor: 'microsoft'
    });
  } catch (error) {
    console.error(`[auth:microsoft][${etapa}] Falha inesperada no callback:`, error);
    return Response.redirect(`${url.origin}/login?erro=interno&etapa=${etapa}`, 302);
  }
}
