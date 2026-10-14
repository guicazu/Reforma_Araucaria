import { lerCookie, validarSessao } from '../../_lib/session.js';

// GET /api/compras/comparativo?orcamentoId=XYZ
// Devolve, por item do orçamento (itemOrcamentoId): comprometido (ainda não recebido) e executado (já recebido/NF lançada)
export async function onRequestGet({ request, env }) {
  const token = lerCookie(request, 'sessao');
  const payload = token ? await validarSessao(token, env.SESSION_SECRET) : null;
  if (!payload) return Response.json({ erro: 'nao_autenticado' }, { status: 401 });

  const url = new URL(request.url);
  const orcamentoId = url.searchParams.get('orcamentoId');
  if (!orcamentoId) return Response.json({ erro: 'parametros_invalidos' }, { status: 400 });

  const { results: itensPedido } = await env.DB.prepare(
    `SELECT ip.id, ip.quantidade, ip.precoUnitario, ir.itemOrcamentoId, p.status as statusPedido
     FROM itens_pedido ip
     JOIN pedidos p ON p.id = ip.pedidoId
     JOIN itens_requisicao ir ON ir.id = ip.itemRequisicaoId
     WHERE p.orcamentoId = ? AND p.status != 'cancelado'`
  ).bind(orcamentoId).all();

  if (!itensPedido.length) return Response.json({ comprometido: [], executado: [] });

  const idsItensPedido = itensPedido.map((i) => i.id);
  const { results: recebidos } = await env.DB.prepare(
    `SELECT itemPedidoId, SUM(quantidadeRecebida) as total FROM itens_recebimento
     WHERE itemPedidoId IN (${idsItensPedido.map(() => '?').join(',')}) GROUP BY itemPedidoId`
  ).bind(...idsItensPedido).all();
  const recebidoPorItemPedido = {};
  recebidos.forEach((r) => { recebidoPorItemPedido[r.itemPedidoId] = r.total; });

  const comprometidoPorItem = {};
  const executadoPorItem = {};
  itensPedido.forEach((ip) => {
    const recebido = recebidoPorItemPedido[ip.id] || 0;
    const pendente = Math.max(0, ip.quantidade - recebido);
    comprometidoPorItem[ip.itemOrcamentoId] = (comprometidoPorItem[ip.itemOrcamentoId] || 0) + pendente * ip.precoUnitario;
    executadoPorItem[ip.itemOrcamentoId] = (executadoPorItem[ip.itemOrcamentoId] || 0) + recebido * ip.precoUnitario;
  });

  return Response.json({
    comprometido: Object.entries(comprometidoPorItem).map(([itemOrcamentoId, valor]) => ({ itemOrcamentoId, valor })),
    executado: Object.entries(executadoPorItem).map(([itemOrcamentoId, valor]) => ({ itemOrcamentoId, valor })),
  });
}
