import { lerCookie, validarSessao } from '../../../_lib/session.js';
import { podeEditar } from '../../../_lib/admin.js';

export async function onRequestGet({ env, params, request }) {
  const token = lerCookie(request, 'sessao');
  const payload = token ? await validarSessao(token, env.SESSION_SECRET) : null;
  if (!payload) return Response.json({ erro: 'nao_autenticado' }, { status: 401 });

  const pedido = await env.DB.prepare(
    `SELECT p.*, f.nome as fornecedorNome, f.email as fornecedorEmail, f.cnpj as fornecedorCnpj
     FROM pedidos p JOIN fornecedores f ON f.id = p.fornecedorId WHERE p.id = ?`
  ).bind(params.id).first();
  if (!pedido) return Response.json({ erro: 'nao_encontrado' }, { status: 404 });
  delete pedido.pdfBase64; // não precisa ir no JSON, tem endpoint próprio pra baixar

  const { results: itens } = await env.DB.prepare('SELECT * FROM itens_pedido WHERE pedidoId = ?').bind(params.id).all();
  const { results: recebimentos } = await env.DB.prepare(
    'SELECT * FROM recebimentos WHERE pedidoId = ? ORDER BY dataRecebimento DESC'
  ).bind(params.id).all();
  for (const r of recebimentos) {
    const { results: itensRec } = await env.DB.prepare(
      'SELECT * FROM itens_recebimento WHERE recebimentoId = ?'
    ).bind(r.id).all();
    r.itens = itensRec;
  }

  return Response.json({ pedido, itens, recebimentos });
}

export async function onRequestPut({ request, env, params }) {
  const token = lerCookie(request, 'sessao');
  const payload = token ? await validarSessao(token, env.SESSION_SECRET) : null;
  if (!payload) return Response.json({ erro: 'nao_autenticado' }, { status: 401 });
  if (!(await podeEditar(payload, env))) {
    return Response.json({ erro: 'somente_visualizacao' }, { status: 403 });
  }
  const STATUS_VALIDOS = ['emitido', 'enviado', 'confirmado', 'recebido_parcial', 'recebido_total', 'cancelado'];
  const corpo = await request.json();
  if (!corpo || !STATUS_VALIDOS.includes(corpo.status)) {
    return Response.json({ erro: 'status_invalido' }, { status: 400 });
  }
  const result = await env.DB.prepare('UPDATE pedidos SET status = ? WHERE id = ?').bind(corpo.status, params.id).run();
  if (!result.meta || result.meta.changes !== 1) return Response.json({ erro: 'nao_encontrado' }, { status: 404 });
  return Response.json({ ok: true });
}
