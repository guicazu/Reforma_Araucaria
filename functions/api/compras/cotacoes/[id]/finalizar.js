import { lerCookie, validarSessao } from '../../../../_lib/session.js';
import { podeEditar } from '../../../../_lib/admin.js';

export async function onRequestPost({ request, env }) {
  const token = lerCookie(request, 'sessao');
  const payload = token ? await validarSessao(token, env.SESSION_SECRET) : null;
  if (!payload) return Response.json({ erro: 'nao_autenticado' }, { status: 401 });
  if (!(await podeEditar(payload, env))) {
    return Response.json({ erro: 'somente_visualizacao' }, { status: 403 });
  }

  const url = new URL(request.url);
  const id = url.pathname.split('/')[url.pathname.split('/').length - 2];
  const corpo = await request.json();
  const { vencedores } = corpo || {};
  if (!id || !Array.isArray(vencedores) || !vencedores.length) {
    return Response.json({ erro: 'parametros_invalidos' }, { status: 400 });
  }

  const { results: cot } = await env.DB.prepare('SELECT * FROM cotacoes WHERE id = ?').bind(id).all();
  if (!cot.length) return Response.json({ erro: 'nao_encontrado' }, { status: 404 });
  if (cot[0].status !== 'aberta') return Response.json({ erro: 'cotacao_finalizada' }, { status: 400 });

  // Mapeamentos
  const { results: citens } = await env.DB.prepare(
    'SELECT id, itemRequisicaoId, quantidade FROM cotacao_itens WHERE cotacaoId = ?'
  ).bind(id).all();
  const itemParaCotacaoItem = {};
  citens.forEach((ci) => { itemParaCotacaoItem[ci.itemRequisicaoId] = ci; });

  const { results: precos } = await env.DB.prepare(
    'SELECT * FROM cotacao_precos WHERE cotacaoId = ?'
  ).bind(id).all();
  const precoPor = (itemReqId, fornId) => {
    const ci = itemParaCotacaoItem[itemReqId];
    if (!ci) return null;
    return precos.find((p) => p.cotacaoItemId === ci.id && p.fornecedorId === fornId) || null;
  };

  const { results: cfLis } = await env.DB.prepare(
    'SELECT fornecedorId, condicaoPagamento FROM cotacao_fornecedores WHERE cotacaoId = ?'
  ).bind(id).all();
  const condPorFornecedor = {};
  cfLis.forEach((c) => { condPorFornecedor[c.fornecedorId] = c.condicaoPagamento; });

  const idsReq = vencedores.map((v) => v.itemRequisicaoId);
  const { results: irs } = await env.DB.prepare(
    'SELECT * FROM itens_requisicao WHERE id IN (' + idsReq.map(() => '?').join(',') + ')'
  ).bind(...idsReq).all();
  const irPorId = {};
  irs.forEach((r) => { irPorId[r.id] = r; });

  // Número sequencial
  const { results: cont } = await env.DB.prepare(
    "SELECT valor FROM contadores WHERE chave = 'pedido_numero'"
  ).all();
  let seq = (cont[0] && cont[0].valor || 0) + 1;

  // Agrupar por fornecedor
  const porFornecedor = new Map();
  const comandos = [];
  const agora = new Date().toISOString();
  const pedidosCriados = [];

  for (const v of vencedores) {
    const ir = irPorId[v.itemRequisicaoId];
    const ci = itemParaCotacaoItem[v.itemRequisicaoId];
    const preco = precoPor(v.itemRequisicaoId, v.fornecedorId);
    if (!ir || !ci || !preco) continue;

    const quantidade = (v.quantidade != null && Number(v.quantidade) > 0) ? Number(v.quantidade) : ci.quantidade;
    const valorTotal = quantidade * preco.precoUnitario;

    if (!porFornecedor.has(v.fornecedorId)) {
      const numero = 'PC-' + String(seq).padStart(4, '0');
      seq++;
      const pedidoId = crypto.randomUUID();
      const confirmacaoToken = crypto.randomUUID();
      porFornecedor.set(v.fornecedorId, { id: pedidoId, numero, itens: [], valorTotal: 0 });
      comandos.push(env.DB.prepare(
        `INSERT INTO pedidos (id, numero, cotacaoId, orcamentoId, fornecedorId, status, valorTotal, condicaoPagamento, dataEmissao, confirmacaoToken, criadoPorEmail, criadoEm)
         VALUES (?, ?, ?, ?, ?, 'emitido', 0, ?, ?, ?, ?, ?)`
      ).bind(pedidoId, numero, id, cot[0].orcamentoId, v.fornecedorId, condPorFornecedor[v.fornecedorId] || null, agora, confirmacaoToken, payload.email.toLowerCase(), agora));
      pedidosCriados.push({ id: pedidoId, numero, fornecedorId: v.fornecedorId });
    }
    const pedido = porFornecedor.get(v.fornecedorId);
    pedido.valorTotal += valorTotal;
    comandos.push(env.DB.prepare(
      `INSERT INTO itens_pedido (id, pedidoId, itemRequisicaoId, descricao, unidade, quantidade, precoUnitario, valorTotal)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    ).bind(crypto.randomUUID(), pedido.id, ir.id, ir.descricao, ir.unidade || 'un', quantidade, preco.precoUnitario, valorTotal));

    // Marca vencedora e quantidade comprada
    comandos.push(env.DB.prepare(
      'UPDATE cotacao_precos SET vencedora = 1, quantidadeComprada = ? WHERE cotacaoItemId = ? AND fornecedorId = ?'
    ).bind(quantidade, ci.id, v.fornecedorId));
    comandos.push(env.DB.prepare(
      'UPDATE cotacao_precos SET vencedora = 0 WHERE cotacaoItemId = ? AND fornecedorId != ?'
    ).bind(ci.id, v.fornecedorId));
    comandos.push(env.DB.prepare(
      "UPDATE itens_requisicao SET status = 'em_pedido' WHERE id = ?"
    ).bind(ir.id));
  }

  if (!porFornecedor.size) return Response.json({ erro: 'sem_vencedores_validos' }, { status: 400 });

  for (const pedido of porFornecedor.values()) {
    comandos.push(env.DB.prepare('UPDATE pedidos SET valorTotal = ? WHERE id = ?').bind(pedido.valorTotal, pedido.id));
  }
  comandos.push(env.DB.prepare('UPDATE contadores SET valor = ? WHERE chave = ?').bind(seq - 1, 'pedido_numero'));
  comandos.push(env.DB.prepare("UPDATE cotacoes SET status = 'finalizada', finalizadaEm = ? WHERE id = ?").bind(agora, id));

  await env.DB.batch(comandos);
  return Response.json({ ok: true, pedidos: pedidosCriados });
}