import { criarSessao, cookieHeader } from './session.js';

// Chamado pelos callbacks do Google e Microsoft depois de confirmar o e-mail da pessoa.
export async function autorizarOuRegistrarUsuario({ env, url, email, nome, provedor }) {
  let etapa = 'validar_usuario';
  try {
    const agora = new Date().toISOString();
    email = (email || '').toLowerCase().trim();

    if (!email) {
      return Response.redirect(`${url.origin}/login?erro=sem_email`, 302);
    }

    etapa = 'validar_configuracao';
    const admins = (env.ADMIN_EMAILS || '')
      .split(',')
      .map((e) => e.trim().toLowerCase())
      .filter(Boolean);
    if (!env.DB || typeof env.DB.prepare !== 'function') {
      throw new Error('Binding D1 DB ausente');
    }
    const eAdminConfigurado = admins.includes(email);

    etapa = 'consultar_usuario';
    let usuario = await env.DB.prepare(
      'SELECT * FROM usuarios WHERE email = ?'
    ).bind(email).first();

    if (!usuario) {
      etapa = 'criar_usuario';
      const id = crypto.randomUUID();
      const statusInicial = eAdminConfigurado ? 'aprovado' : 'pendente';
      const adminInicial = eAdminConfigurado ? 1 : 0;
      await env.DB.prepare(
        `INSERT INTO usuarios (id, email, nome, provedor, status, isAdmin, criadoEm, aprovadoEm)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
      ).bind(id, email, nome, provedor, statusInicial, adminInicial, agora, eAdminConfigurado ? agora : null).run();
      usuario = {id, email, nome, status: statusInicial, isAdmin: adminInicial};
      if (!eAdminConfigurado) return Response.redirect(`${url.origin}/aguardando-aprovacao`, 302);
    }

    if (usuario.status === 'bloqueado') {
      return Response.redirect(`${url.origin}/login?erro=bloqueado`, 302);
    }

    if (eAdminConfigurado && usuario.status === 'pendente') {
      etapa = 'aprovar_admin';
      await env.DB.prepare(
        "UPDATE usuarios SET status = 'aprovado', isAdmin = 1, aprovadoEm = ? WHERE email = ?"
      ).bind(agora, email).run();
      usuario.status = 'aprovado';
      usuario.isAdmin = 1;
    }

    if (usuario.status === 'pendente') {
      return Response.redirect(`${url.origin}/aguardando-aprovacao`, 302);
    }

    if (!usuario.isAdmin && eAdminConfigurado) {
      etapa = 'marcar_admin';
      await env.DB.prepare(
        'UPDATE usuarios SET isAdmin = 1 WHERE email = ?'
      ).bind(email).run();
      usuario.isAdmin = 1;
    }

    etapa = 'criar_sessao';
    if (!env.SESSION_SECRET) throw new Error('SESSION_SECRET ausente');
    const token = await criarSessao(
      { email: usuario.email, nome: usuario.nome, exp: Date.now() + 1000 * 60 * 60 * 24 * 30 },
      env.SESSION_SECRET
    );

    const headers = new Headers();
    headers.set('Location', `${url.origin}/`);
    headers.append('Set-Cookie', cookieHeader('sessao', token, { maxAge: 60 * 60 * 24 * 30 }));
    return new Response(null, { status: 302, headers });
  } catch (error) {
    const erro = error instanceof Error ? error : new Error(String(error));
    erro.authStage = etapa;
    console.error(`[auth:${provedor}] Falha na etapa ${etapa}:`, erro);
    throw erro;
  }
}
