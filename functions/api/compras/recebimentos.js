import { lerCookie, validarSessao } from '../../_lib/session.js';
import { podeEditar } from '../../_lib/admin.js';

export async function onRequestPost({ request, env }) {
  const token = lerCookie(request, 'sessao');
  const payload = token ? await validarSessao(token, env.SESSION_SECRET) : null;
  if (!payload) return Response.json({ erro: 'nao_autenticado' }, { status: 401 });
  if (!(await podeEditar(payload, env))) {
    return Response.json({ erro: 'somente_visualizacao' }, { status: 403 });
  }

  const corpo = await request.json();
  const { pedidoId, notaFiscalNumero, notaFiscalChave, dataRecebimento, valorNota, observacoes, itens } = corpo || {};
  if (!pedidoId || !dataRecebimento || !Array.isArray(itens) || !itens.length) {
    return Response.json({ erro: 'parametros_invalidos' }, { status: 400 });
  }

  const { results: ped } = await env.DB.prepare('SELECT * FROM pedidos WHERE id = ?').bind(pedidoId).all();
  if (!ped.length) return Response.json({ erro: 'nao_encontrado' }, { status: 404 });

  const id = crypto.randomUUID();
  const agora = new Date().toISOString();
  const comandos = [
    env.DB.prepare(
      `INSERT INTO recebimentos (id, pedidoId, notaFiscalNumero, notaFiscalChave, dataRecebimento, valorNota, recebidoPorEmail, observacoes, criadoEm)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).bind(id, pedidoId, notaFiscalNumero || null, notaFiscalChave || null, dataRecebimento, Number(valorNota) || 0, payload.email.toLowerCase(), observacoes || null, agora),
    env.DB.prepare("UPDATE pedidos SET status = 'recebido' WHERE id = ?").bind(pedidoId)
  ];
  itens.forEach((i) => {
    comandos.push(env.DB.prepare(
      'INSERT INTO itens_recebimento (id, recebimentoId, itemPedidoId, quantidadeRecebida) VALUES (?, ?, ?, ?)'
    ).bind(crypto.randomUUID(), id, i.itemPedidoId, Number(i.quantidadeRecebida) || 0));
  });

  await env.DB.batch(comandos);
  return Response.json({ ok: true, id });
}