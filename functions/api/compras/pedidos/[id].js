import { lerCookie, validarSessao } from '../../../_lib/session.js';

export async function onRequestGet({ request, env }) {
  const token = lerCookie(request, 'sessao');
  const payload = token ? await validarSessao(token, env.SESSION_SECRET) : null;
  if (!payload) return Response.json({ erro: 'nao_autenticado' }, { status: 401 });

  const url = new URL(request.url);
  const id = url.pathname.split('/').pop();
  if (!id) return Response.json({ erro: 'parametros_invalidos' }, { status: 400 });

  const { results: ped } = await env.DB.prepare('SELECT * FROM pedidos WHERE id = ?').bind(id).all();
  if (!ped.length) return Response.json({ erro: 'nao_encontrado' }, { status: 404 });

  const { results: fornecedor } = await env.DB.prepare('SELECT * FROM fornecedores WHERE id = ?').bind(ped[0].fornecedorId).all();
  const { results: itens } = await env.DB.prepare('SELECT * FROM itens_pedido WHERE pedidoId = ?').bind(id).all();

  return Response.json({ pedido: { ...ped[0], fornecedor: fornecedor[0] || null, itens } });
}