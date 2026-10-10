// functions/api/admin/usuarios.js
// Endpoint de administração: lista, aprova e bloqueia usuários.
// Só funciona para e-mails listados em ADMIN_EMAILS.
import { lerCookie, validarSessao } from '../../_lib/session.js';

function ehAdmin(payload, env) {
  if (!payload || !payload.email) return false;
  const admins = (env.ADMIN_EMAILS || '')
    .split(',')
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
  return admins.includes(payload.email.toLowerCase());
}

async function listar(env) {
  const { results } = await env.DB.prepare(
    'SELECT id, email, nome, provedor, status, criadoEm, aprovadoEm FROM usuarios ORDER BY criadoEm DESC'
  ).all();
  return Response.json({ usuarios: results });
}

export async function onRequestGet({ request, env }) {
  const token = lerCookie(request, 'sessao');
  const payload = token ? await validarSessao(token, env.SESSION_SECRET) : null;
  if (!ehAdmin(payload, env)) {
    return Response.json({ erro: 'nao_autorizado' }, { status: 403 });
  }
  return listar(env);
}

export async function onRequestPost({ request, env }) {
  const token = lerCookie(request, 'sessao');
  const payload = token ? await validarSessao(token, env.SESSION_SECRET) : null;
  if (!ehAdmin(payload, env)) {
    return Response.json({ erro: 'nao_autorizado' }, { status: 403 });
  }

  let corpo = {};
  try {
    corpo = await request.json();
  } catch (e) {
    corpo = {};
  }

  const { id, acao } = corpo || {};
  if (!id || !['aprovar', 'bloquear'].includes(acao)) {
    return Response.json({ erro: 'parametros_invalidos' }, { status: 400 });
  }

  if (acao === 'aprovar') {
    await env.DB.prepare(
      "UPDATE usuarios SET status = 'aprovado', aprovadoEm = ? WHERE id = ?"
    )
      .bind(new Date().toISOString(), id)
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
