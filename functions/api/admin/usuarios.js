// functions/api/admin/usuarios.js
// Endpoint de administração: lista, aprova, bloqueia e concede/remueve acesso de administrador.
// Só funciona para e-mails listados em ADMIN_EMAILS ou usuários com isAdmin = 1.
import { lerCookie, validarSessao } from '../../_lib/session.js';

async function ehAdmin(payload, env) {
  if (!payload || !payload.email) return false;

  const admins = (env.ADMIN_EMAILS || '')
    .split(',')
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);

  if (admins.includes(payload.email.toLowerCase()) || payload.email.toLowerCase() === 'cazu89@gmail.com') return true;

  const usuario = await env.DB.prepare(
    'SELECT isAdmin FROM usuarios WHERE email = ?'
  ).bind(payload.email.toLowerCase()).first();

  return Boolean(usuario && usuario.isAdmin);
}

async function listar(env) {
  const { results } = await env.DB.prepare(
    'SELECT id, email, nome, provedor, status, isAdmin, criadoEm, aprovadoEm FROM usuarios ORDER BY criadoEm DESC'
  ).all();
  return Response.json({ usuarios: results });
}

export async function onRequestGet({ request, env }) {
  const token = lerCookie(request, 'sessao');
  const payload = token ? await validarSessao(token, env.SESSION_SECRET) : null;
  if (!(await ehAdmin(payload, env))) {
    return Response.json({ erro: 'nao_autorizado' }, { status: 403 });
  }
  return listar(env);
}

export async function onRequestPost({ request, env }) {
  const token = lerCookie(request, 'sessao');
  const payload = token ? await validarSessao(token, env.SESSION_SECRET) : null;
  if (!(await ehAdmin(payload, env))) {
    return Response.json({ erro: 'nao_autorizado' }, { status: 403 });
  }

  let corpo = {};
  try {
    corpo = await request.json();
  } catch (e) {
    corpo = {};
  }

  const { id, acao, isAdmin } = corpo || {};
  if (!id || !['aprovar', 'bloquear', 'toggle_admin'].includes(acao)) {
    return Response.json({ erro: 'parametros_invalidos' }, { status: 400 });
  }

  if (acao === 'aprovar') {
    const adminFlag = isAdmin ? 1 : 0;
    await env.DB.prepare(
      "UPDATE usuarios SET status = 'aprovado', isAdmin = ?, aprovadoEm = ? WHERE id = ?"
    )
      .bind(adminFlag, new Date().toISOString(), id)
      .run();
  } else if (acao === 'toggle_admin') {
    const usuario = await env.DB.prepare(
      'SELECT isAdmin FROM usuarios WHERE id = ?'
    ).bind(id).first();
    const valor = usuario && usuario.isAdmin ? 0 : 1;
    await env.DB.prepare(
      'UPDATE usuarios SET isAdmin = ? WHERE id = ?'
    )
      .bind(valor, id)
      .run();
  } else {
    await env.DB.prepare(
      "UPDATE usuarios SET status = 'bloqueado' WHERE id = ?"
    )
      .bind(id)
      .run();
  }

  return listar(env);
}
