import { lerCookie, validarSessao } from '../../_lib/session.js';
import { podeEditar } from '../../_lib/admin.js';

async function sessao(request, env) {
  const token = lerCookie(request, 'sessao');
  return token ? await validarSessao(token, env.SESSION_SECRET) : null;
}

export async function onRequestGet({ request, env }) {
  const payload = await sessao(request, env);
  if (!payload) return Response.json({ erro: 'nao_autenticado' }, { status: 401 });
  const { results } = await env.DB.prepare('SELECT * FROM fornecedores ORDER BY nome ASC').all();
  return Response.json({ fornecedores: results });
}

export async function onRequestPost({ request, env }) {
  const payload = await sessao(request, env);
  if (!payload) return Response.json({ erro: 'nao_autenticado' }, { status: 401 });
  if (!(await podeEditar(payload, env))) {
    return Response.json({ erro: 'somente_visualizacao' }, { status: 403 });
  }
  const corpo = await request.json();
  if (!corpo || !corpo.nome) return Response.json({ erro: 'parametros_invalidos' }, { status: 400 });

  const id = crypto.randomUUID();
  const agora = new Date().toISOString();
  await env.DB.prepare(
    `INSERT INTO fornecedores (id, nome, cnpj, telefone, email, criadoEm) VALUES (?, ?, ?, ?, ?, ?)`
  ).bind(id, corpo.nome, corpo.cnpj || null, corpo.telefone || null, corpo.email || null, agora).run();
  return Response.json({ ok: true, id });
}
