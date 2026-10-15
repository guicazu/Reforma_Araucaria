// Portal do fornecedor (rotas públicas, liberadas no _middleware): o link com token leva à resposta
// da cotação (preços, marca, prazo, frete, condição de pagamento) ou à confirmação do pedido.
// O fornecedor só vê os próprios dados: nada de preços de outros fornecedores ou do orçamento.
import { json, falha, uuid, agora, texto, numero, lerCorpo, ErroApi, historico, parametros, arred } from './base.js';
import { condicoesFornecedor } from './cotacoes.js';

async function localizar(env, tk) {
  if (!tk || !/^[a-f0-9]{20,64}$/.test(tk)) return null;
  const cf = await env.DB.prepare(
    `SELECT cf.*, f.nome AS fornecedorNome, c.numero, c.status, c.rodada, c.prazoResposta, c.observacoes AS observacoesCotacao, c.data
       FROM supr_cotacao_fornecedores cf JOIN supr_fornecedores f ON f.id = cf.fornecedorId JOIN supr_cotacoes c ON c.id = cf.cotacaoId
      WHERE cf.token = ?`
  ).bind(tk).first();
  if (cf) return { tipo: 'cotacao', cf };
  const p = await env.DB.prepare(
    `SELECT p.*, f.nome AS fornecedorNome FROM supr_pedidos p JOIN supr_fornecedores f ON f.id = p.fornecedorId WHERE p.token = ?`
  ).bind(tk).first();
  if (p) return { tipo: 'pedido', p };
  return null;
}

async function dadosCotacao(env, cf) {
  const [itens, precos, condicoes] = await env.DB.batch([
    env.DB.prepare(
      `SELECT ci.id, ci.seq, ci.quantidade, si.descricao, si.unidade, si.insumoCodigo, si.dataNecessidade
         FROM supr_cotacao_itens ci JOIN supr_solicitacao_itens si ON si.id = ci.solicitacaoItemId WHERE ci.cotacaoId = ? ORDER BY ci.seq`
    ).bind(cf.cotacaoId),
    env.DB.prepare('SELECT cotacaoItemId, precoUnitario, marca, observacao FROM supr_cotacao_precos WHERE cotacaoId = ? AND fornecedorId = ? AND rodada = ?')
      .bind(cf.cotacaoId, cf.fornecedorId, cf.rodada),
    env.DB.prepare('SELECT id, descricao FROM supr_condicoes_pagamento WHERE ativo = 1 ORDER BY descricao COLLATE NOCASE')
  ]);
  const meus = new Map(precos.results.map((p) => [p.cotacaoItemId, p]));
  return {
    numero: cf.numero, data: cf.data, status: cf.status, rodada: cf.rodada, prazoResposta: cf.prazoResposta, observacoes: cf.observacoesCotacao,
    fornecedor: cf.fornecedorNome,
    proposta: { condicaoPagamentoId: cf.condicaoPagamentoId, condicaoPagamento: cf.condicaoPagamento, prazoEntregaDias: cf.prazoEntregaDias,
      frete: cf.frete, valorFrete: cf.valorFrete, validade: cf.validade, observacoes: cf.observacoes, respondidoEm: cf.respondidoEm, declinou: !!cf.declinou },
    itens: itens.results.map((i) => ({ ...i, ...(meus.get(i.id) ? {
      precoUnitario: meus.get(i.id).precoUnitario, marca: meus.get(i.id).marca, observacao: meus.get(i.id).observacao } : {}) })),
    condicoes: condicoes.results
  };
}

async function dadosPedido(env, p) {
  const { results: itens } = await env.DB.prepare(
    'SELECT seq, descricao, unidade, quantidade, quantidadeEncerrada, precoUnitario, valorTotal, marca FROM supr_pedido_itens WHERE pedidoId = ? ORDER BY seq'
  ).bind(p.id).all();
  return {
    numero: p.numero, data: p.data, dataEntrega: p.dataEntrega, localEntrega: p.localEntrega, condicaoPagamento: p.condicaoPagamento,
    frete: p.frete, valorFrete: p.valorFrete, valorDesconto: p.valorDesconto, valorItens: p.valorItens, valorTotal: p.valorTotal,
    observacoes: p.observacoes, status: p.status, confirmadoEm: p.confirmadoEm, fornecedor: p.fornecedorNome, itens
  };
}

export async function tratarPortal({ request, env, params }) {
  try {
    const partes = Array.isArray(params.rota) ? params.rota : params.rota ? [params.rota] : [];
    const [tk, acao] = partes;
    const achado = await localizar(env, tk);
    if (!achado) return json({ erro: 'link_invalido', mensagem: 'Link inválido ou expirado. Peça um novo ao comprador.' }, 404);
    const prm = await parametros(env);
    const empresa = { nome: prm.empresa_nome };

    if (request.method === 'GET' && !acao) {
      if (achado.tipo === 'cotacao') return json({ tipo: 'cotacao', empresa, cotacao: await dadosCotacao(env, achado.cf) });
      return json({ tipo: 'pedido', empresa, pedido: await dadosPedido(env, achado.p) });
    }
    if (request.method !== 'POST') return json({ erro: 'metodo_invalido' }, 405);
    const corpo = await lerCorpo(request);

    if (achado.tipo === 'cotacao') {
      const cf = achado.cf;
      if (cf.status !== 'aberta') falha(409, 'cotacao_fechada', 'Esta cotação já foi encerrada pelo comprador.');
      if (acao === 'declinar') {
        await env.DB.batch([
          env.DB.prepare('UPDATE supr_cotacao_fornecedores SET declinou = 1, respondidoEm = ?, observacoes = ? WHERE id = ?')
            .bind(agora(), texto(corpo.motivo, 'motivo', { max: 500 }), cf.id),
          historico(env, null, 'cotacao', cf.cotacaoId, 'Fornecedor declinou pelo portal', cf.fornecedorNome)
        ]);
        return json({ ok: true });
      }
      if (acao !== 'proposta') return json({ erro: 'acao_invalida' }, 404);
      const { results: itens } = await env.DB.prepare('SELECT id FROM supr_cotacao_itens WHERE cotacaoId = ?').bind(cf.cotacaoId).all();
      const validos = new Set(itens.map((i) => i.id));
      const precos = [];
      for (const p of Array.isArray(corpo.precos) ? corpo.precos : []) {
        if (!validos.has(p.cotacaoItemId)) continue;
        const preco = numero(p.precoUnitario, 'precoUnitario', { min: 0, obrigatorio: false, rotulo: 'o preço' });
        precos.push({ id: uuid(), cotacaoItemId: p.cotacaoItemId, precoUnitario: preco == null ? null : arred(preco, 6),
          marca: texto(p.marca, 'marca', { max: 120 }), observacao: texto(p.observacao, 'observacao', { max: 300 }) });
      }
      if (!precos.some((p) => p.precoUnitario > 0)) falha(400, 'sem_precos', 'Informe o preço de ao menos um item.');
      const cond = await condicoesFornecedor(env, corpo);
      const ts = agora();
      await env.DB.batch([
        env.DB.prepare(
          `INSERT INTO supr_cotacao_precos (id, cotacaoId, cotacaoItemId, fornecedorId, rodada, precoUnitario, marca, observacao, atualizadoEm)
           SELECT json_extract(value, '$.id'), ?1, json_extract(value, '$.cotacaoItemId'), ?2, ?3, json_extract(value, '$.precoUnitario'),
                  json_extract(value, '$.marca'), json_extract(value, '$.observacao'), ?4
             FROM json_each(?5) WHERE true
           ON CONFLICT(cotacaoItemId, fornecedorId, rodada) DO UPDATE SET precoUnitario = excluded.precoUnitario, marca = excluded.marca,
             observacao = excluded.observacao, atualizadoEm = excluded.atualizadoEm`
        ).bind(cf.cotacaoId, cf.fornecedorId, cf.rodada, ts, JSON.stringify(precos)),
        env.DB.prepare(
          `UPDATE supr_cotacao_fornecedores SET condicaoPagamentoId = ?, condicaoPagamento = ?, prazoEntregaDias = ?, frete = ?, valorFrete = ?,
             validade = ?, observacoes = ?, respondidoEm = ?, declinou = 0 WHERE id = ?`
        ).bind(cond.condicaoPagamentoId, cond.condicaoPagamento, cond.prazoEntregaDias, cond.frete, cond.valorFrete, cond.validade,
          cond.observacoes, ts, cf.id),
        env.DB.prepare('UPDATE supr_cotacoes SET atualizadoEm = ? WHERE id = ?').bind(ts, cf.cotacaoId),
        historico(env, null, 'cotacao', cf.cotacaoId, 'Proposta recebida pelo portal', `${cf.fornecedorNome} · ${cf.rodada}ª rodada`)
      ]);
      return json({ ok: true });
    }

    // pedido: o fornecedor confirma o recebimento do pedido
    const p = achado.p;
    if (acao !== 'confirmar') return json({ erro: 'acao_invalida' }, 404);
    if (['cancelado', 'reprovado', 'pendente'].includes(p.status)) falha(409, 'pedido_indisponivel', 'Este pedido não está liberado para confirmação.');
    if (!p.confirmadoEm) {
      await env.DB.batch([
        env.DB.prepare('UPDATE supr_pedidos SET confirmadoEm = ? WHERE id = ? AND confirmadoEm IS NULL').bind(agora(), p.id),
        historico(env, null, 'pedido', p.id, 'Confirmado pelo fornecedor (portal)', p.fornecedorNome)
      ]);
    }
    return json({ ok: true });
  } catch (e) {
    if (e instanceof ErroApi) return json({ erro: e.codigo, mensagem: e.message }, e.status);
    console.error('[portal]', e);
    return json({ erro: 'erro_interno', mensagem: 'Não foi possível concluir agora. Tente de novo em instantes.' }, 500);
  }
}
