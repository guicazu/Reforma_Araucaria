import { lerCookie, validarSessao } from '../../../../_lib/session.js';
import { podeEditar } from '../../../../_lib/admin.js';
import { proximoNumeroPedido, gerarTokenConfirmacao } from '../../../../_lib/compras.js';
import { gerarPdfPedido, bytesParaBase64 } from '../../../../_lib/pdf-simples.js';

// POST /api/compras/cotacoes/:id/finalizar
// Pega todas as células marcadas como vencedoras, agrupa por fornecedor e gera
// um pedido de compra (com PDF) para cada fornecedor vencedor.
export async function onRequestPost({ request, env, params }) {
  const token = lerCookie(request, 'sessao');
  const payload = token ? await validarSessao(token, env.SESSION_SECRET) : null;
  if (!payload) return Response.json({ erro: 'nao_autenticado' }, { status: 401 });
  if (!(await podeEditar(payload, env))) {
    return Response.json({ erro: 'somente_visualizacao' }, { status: 403 });
  }

  const cotacao = await env.DB.prepare('SELECT * FROM cotacoes WHERE id = ?').bind(params.id).first();
  if (!cotacao) return Response.json({ erro: 'nao_encontrada' }, { status: 404 });
  if (cotacao.status !== 'aberta') return Response.json({ erro: 'cotacao_ja_finalizada' }, { status: 409 });

  const { results: vencedoras } = await env.DB.prepare(
    `SELECT cp.*, ci.quantidade as quantidadeCotada, ci.itemRequisicaoId,
            ir.descricao, ir.unidade, ir.requisicaoId,
            f.nome as fornecedorNome, f.email as fornecedorEmail, f.cnpj as fornecedorCnpj,
            cf.condicaoPagamento
     FROM cotacao_precos cp
     JOIN cotacao_itens ci ON ci.id = cp.cotacaoItemId
     JOIN itens_requisicao ir ON ir.id = ci.itemRequisicaoId
     JOIN fornecedores f ON f.id = cp.fornecedorId
     LEFT JOIN cotacao_fornecedores cf ON cf.cotacaoId = cp.cotacaoId AND cf.fornecedorId = cp.fornecedorId
     WHERE cp.cotacaoId = ? AND cp.vencedora = 1`
  ).bind(params.id).all();

  if (!vencedoras.length) {
    return Response.json({ erro: 'nenhuma_cotacao_vencedora_marcada' }, { status: 400 });
  }

  const porFornecedor = {};
  vencedoras.forEach((v) => { (porFornecedor[v.fornecedorId] ||= []).push(v); });

  const agora = new Date().toISOString();
  const comandos = [];
  const pedidosGerados = [];
  const itensRequisicaoAfetados = new Set();

  for (const fornecedorId of Object.keys(porFornecedor)) {
    const linhas = porFornecedor[fornecedorId];
    const numero = await proximoNumeroPedido(env);
    const pedidoId = crypto.randomUUID();
    const confirmacaoToken = gerarTokenConfirmacao();

    const itensPedido = linhas.map((v) => {
      const quantidade = v.quantidadeComprada != null ? v.quantidadeComprada : v.quantidadeCotada;
      const valorItem = quantidade * v.precoUnitario;
      return { id: crypto.randomUUID(), descricao: v.descricao, unidade: v.unidade, quantidade, precoUnitario: v.precoUnitario, valorTotal: valorItem, itemRequisicaoId: v.itemRequisicaoId };
    });
    const valorTotal = itensPedido.reduce((s, it) => s + it.valorTotal, 0);

    const pdfBytes = gerarPdfPedido({
      numero, dataEmissao: agora.slice(0, 10),
      fornecedor: { nome: linhas[0].fornecedorNome, cnpj: linhas[0].fornecedorCnpj, email: linhas[0].fornecedorEmail },
      condicaoPagamento: linhas[0].condicaoPagamento,
      itens: itensPedido, valorTotal,
    });
    const pdfBase64 = bytesParaBase64(pdfBytes);

    comandos.push(env.DB.prepare(
      `INSERT INTO pedidos (id, numero, cotacaoId, orcamentoId, fornecedorId, status, valorTotal, condicaoPagamento, dataEmissao, pdfGeradoEm, pdfBase64, confirmacaoToken, criadoPorEmail, criadoEm)
       VALUES (?, ?, ?, ?, ?, 'emitido', ?, ?, ?, ?, ?, ?, ?, ?)`
    ).bind(pedidoId, numero, params.id, cotacao.orcamentoId, fornecedorId, valorTotal, linhas[0].condicaoPagamento || null, agora, agora, pdfBase64, confirmacaoToken, payload.email.toLowerCase(), agora));

    itensPedido.forEach((it) => {
      comandos.push(env.DB.prepare(
        `INSERT INTO itens_pedido (id, pedidoId, itemRequisicaoId, descricao, unidade, quantidade, precoUnitario, valorTotal)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
      ).bind(it.id, pedidoId, it.itemRequisicaoId, it.descricao, it.unidade, it.quantidade, it.precoUnitario, it.valorTotal));
      itensRequisicaoAfetados.add(it.itemRequisicaoId);
    });

    pedidosGerados.push({ id: pedidoId, numero, fornecedorId, fornecedorNome: linhas[0].fornecedorNome, valorTotal });
  }

  comandos.push(env.DB.prepare("UPDATE cotacoes SET status = 'finalizada', finalizadaEm = ? WHERE id = ?").bind(agora, params.id));

  const idsItens = [...itensRequisicaoAfetados];
  if (idsItens.length) {
    comandos.push(env.DB.prepare(
      `UPDATE itens_requisicao SET status = 'pedido_gerado' WHERE id IN (${idsItens.map(() => '?').join(',')})`
    ).bind(...idsItens));
  }

  await env.DB.batch(comandos);

  // Fecha o status da requisição-pai quando todos os itens dela já têm pedido ou foram cancelados
  const { results: requisicoesAfetadas } = await env.DB.prepare(
    `SELECT DISTINCT requisicaoId FROM itens_requisicao WHERE id IN (${idsItens.map(() => '?').join(',') || "''"})`
  ).bind(...idsItens).all();
  for (const r of requisicoesAfetadas) {
    const pendentes = await env.DB.prepare(
      "SELECT COUNT(*) as n FROM itens_requisicao WHERE requisicaoId = ? AND status IN ('pendente','em_cotacao')"
    ).bind(r.requisicaoId).first();
    if (pendentes.n === 0) {
      await env.DB.prepare("UPDATE requisicoes SET status = 'pedido_gerado', atualizadoEm = ? WHERE id = ?")
        .bind(agora, r.requisicaoId).run();
    }
  }

  return Response.json({ ok: true, pedidos: pedidosGerados });
}
