import { lerCookie, validarSessao } from '../../_lib/session.js';

function itensDoOrcamento(conteudo) {
  let c = conteudo;
  if (typeof c === 'string') { try { c = JSON.parse(c); } catch (e) { return []; } }
  const unidades = (c && (c.unidades || (c.versao && c.versao.unidades))) || [];
  const itens = [];
  unidades.forEach((u) => (u.etapas || []).forEach((e) => (e.subEtapas || []).forEach((s) => (s.servicos || []).forEach((sv) => {
    if (!sv.id) return;
    const qtd = Number(sv.qtdManual != null ? sv.qtdManual : (sv.quantidade && (sv.quantidade.valor != null ? sv.quantidade.valor : sv.quantidade))) || 0;
    const vu = Number(sv.valorUnitario != null ? sv.valorUnitario : (sv.precoUnitario || 0)) || 0;
    itens.push({ itemOrcamentoId: sv.id, descricao: sv.nome || '', orcado: qtd * vu });
  }))));
  return itens;
}

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

  let recebidoPorItemPedido = {};
  if (itensPedido.length) {
    const ids = itensPedido.map((i) => i.id);
    const { results: recebidos } = await env.DB.prepare(
      `SELECT itemPedidoId, SUM(quantidadeRecebida) as total FROM itens_recebimento
       WHERE itemPedidoId IN (${ids.map(() => '?').join(',')}) GROUP BY itemPedidoId`
    ).bind(...ids).all();
    recebidoPorItemPedido = {};
    recebidos.forEach((r) => { recebidoPorItemPedido[r.itemPedidoId] = r.total; });
  }

  const comprometidoPorItem = {};
  const executadoPorItem = {};
  const descricaoPorItem = {};
  itensPedido.forEach((ip) => {
    const recebido = recebidoPorItemPedido[ip.id] || 0;
    const pendente = Math.max(0, ip.quantidade - recebido);
    comprometidoPorItem[ip.itemOrcamentoId] = (comprometidoPorItem[ip.itemOrcamentoId] || 0) + pendente * ip.precoUnitario;
    executadoPorItem[ip.itemOrcamentoId] = (executadoPorItem[ip.itemOrcamentoId] || 0) + recebido * ip.precoUnitario;
  });

  // Orçado: lê o orçamento salvo no D1
  const { results: orc } = await env.DB.prepare('SELECT conteudo FROM orcamentos WHERE id = ?').bind(orcamentoId).all();
  const itensOrc = orc.length ? itensDoOrcamento(orc[0].conteudo) : [];
  const orcadoPorItem = {};
  itensOrc.forEach((i) => { orcadoPorItem[i.itemOrcamentoId] = i.orcado; descricaoPorItem[i.itemOrcamentoId] = i.descricao; });

  const chaves = new Set([...Object.keys(orcadoPorItem), ...Object.keys(comprometidoPorItem), ...Object.keys(executadoPorItem)]);
  const itens = [];
  let somaOrcado = 0, somaComprometido = 0, somaExecutado = 0;
  chaves.forEach((k) => {
    const orcado = orcadoPorItem[k] || 0;
    const comprometido = comprometidoPorItem[k] || 0;
    const executado = executadoPorItem[k] || 0;
    somaOrcado += orcado; somaComprometido += comprometido; somaExecutado += executado;
    itens.push({ itemOrcamentoId: k, descricao: descricaoPorItem[k] || 'Item', orcado, comprometido, executado, saldo: orcado - comprometido - executado });
  });
  itens.sort((a, b) => (a.descricao || '').localeCompare(b.descricao || ''));

  return Response.json({
    resumo: { orcado: somaOrcado, comprometido: somaComprometido, executado: somaExecutado, saldo: somaOrcado - somaComprometido - somaExecutado },
    itens
  });
}