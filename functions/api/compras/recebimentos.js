import { lerCookie, validarSessao } from '../../_lib/session.js';
import { podeEditar } from '../../_lib/admin.js';

// POST body: { pedidoId, notaFiscalNumero?, notaFiscalChave?, dataRecebimento, valorNota, observacoes?,
//              itens: [{itemPedidoId, quantidadeRecebida}] }
export async function onRequestPost({ request, env }) {
  const token = lerCookie(request, 'sessao');
  const payload = token ? await validarSessao(token, env.SESSION_SECRET) : null;
  if (!payload) return Response.json({ erro: 'nao_autenticado' }, { status: 401 });
  if (!(await podeEditar(payload, env))) {
    return Response.json({ erro: 'somente_visualizacao' }, { status: 403 });
  }

  const corpo = await request.json();
  const { pedidoId, notaFiscalNumero, notaFiscalChave, dataRecebimento, valorNota, observacoes, itens } = corpo || {};
  if (!pedidoId || !dataRecebimento || valorNota == null || !Array.isArray(itens) || !itens.length) {
    return Response.json({ erro: 'parametros_invalidos' }, { status: 400 });
  }
  for (const it of itens) {
    if (!it.itemPedidoId || !it.quantidadeRecebida || it.quantidadeRecebida <= 0) {
      return Response.json({ erro: 'parametros_invalidos' }, { status: 400 });
    }
  }

  const pedido = await env.DB.prepare('SELECT * FROM pedidos WHERE id = ?').bind(pedidoId).first();
  if (!pedido) return Response.json({ erro: 'pedido_nao_encontrado' }, { status: 404 });

  const { results: itensPedido } = await env.DB.prepare('SELECT * FROM itens_pedido WHERE pedidoId = ?').bind(pedidoId).all();
  const { results: recebidosAntes } = await env.DB.prepare(
    `SELECT ir.itemPedidoId, SUM(ir.quantidadeRecebida) as total
     FROM itens_recebimento ir JOIN recebimentos r ON r.id = ir.recebimentoId
     WHERE r.pedidoId = ? GROUP BY ir.itemPedidoId`
  ).bind(pedidoId).all();
  const jaRecebidoPorItem = {};
  recebidosAntes.forEach((r) => { jaRecebidoPorItem[r.itemPedidoId] = r.total; });

  const id = crypto.randomUUID();
  const agora = new Date().toISOString();
  const comandos = [
    env.DB.prepare(
      `INSERT INTO recebimentos (id, pedidoId, notaFiscalNumero, notaFiscalChave, dataRecebimento, valorNota, recebidoPorEmail, observacoes, criadoEm)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).bind(id, pedidoId, notaFiscalNumero || null, notaFiscalChave || null, dataRecebimento, valorNota, payload.email.toLowerCase(), observacoes || null, agora),
  ];
  itens.forEach((it) => {
    comandos.push(env.DB.prepare(
      'INSERT INTO itens_recebimento (id, recebimentoId, itemPedidoId, quantidadeRecebida) VALUES (?, ?, ?, ?)'
    ).bind(crypto.randomUUID(), id, it.itemPedidoId, it.quantidadeRecebida));
    jaRecebidoPorItem[it.itemPedidoId] = (jaRecebidoPorItem[it.itemPedidoId] || 0) + it.quantidadeRecebida;
  });

  const totalPedido = itensPedido.reduce((s, it) => s + it.quantidade, 0);
  const totalRecebido = itensPedido.reduce((s, it) => s + (jaRecebidoPorItem[it.id] || 0), 0);
  const statusPedido = totalRecebido >= totalPedido ? 'recebido_total' : 'recebido_parcial';
  comandos.push(env.DB.prepare('UPDATE pedidos SET status = ? WHERE id = ?').bind(statusPedido, pedidoId));

  await env.DB.batch(comandos);
  return Response.json({ ok: true, id, statusPedido });
}
