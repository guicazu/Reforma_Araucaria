import { lerCookie, validarSessao } from '../../../_lib/session.js';

export async function onRequestGet({ request, env }) {
  const token = lerCookie(request, 'sessao');
  const payload = token ? await validarSessao(token, env.SESSION_SECRET) : null;
  if (!payload) return Response.json({ erro: 'nao_autenticado' }, { status: 401 });

  const url = new URL(request.url);
  const id = url.pathname.split('/').pop();
  if (!id) return Response.json({ erro: 'parametros_invalidos' }, { status: 400 });

  const { results: cot } = await env.DB.prepare('SELECT * FROM cotacoes WHERE id = ?').bind(id).all();
  if (!cot.length) return Response.json({ erro: 'nao_encontrado' }, { status: 404 });
  const cotacao = cot[0];

  const { results: fornecedores } = await env.DB.prepare(
    `SELECT cf.id AS relId, cf.condicaoPagamento, cf.rodada, f.id, f.nome, f.email, f.cnpj, f.telefone
     FROM cotacao_fornecedores cf JOIN fornecedores f ON f.id = cf.fornecedorId
     WHERE cf.cotacaoId = ? ORDER BY f.nome ASC`
  ).bind(id).all();

  const { results: itens } = await env.DB.prepare(
    `SELECT ci.id AS cotacaoItemId, ci.itemRequisicaoId, ci.quantidade,
            ir.descricao, ir.unidade, ir.quantidadeOrcamento, ir.quantidadeSolicitada,
            ir.requisicaoId, substr(r.id, 1, 8) AS requisicaoRef
     FROM cotacao_itens ci
     JOIN itens_requisicao ir ON ir.id = ci.itemRequisicaoId
     JOIN requisicoes r ON r.id = ir.requisicaoId
     WHERE ci.cotacaoId = ?`
  ).bind(id).all();

  const { results: precos } = await env.DB.prepare(
    'SELECT cotacaoItemId, fornecedorId, precoUnitario, vencedora, quantidadeComprada FROM cotacao_precos WHERE cotacaoId = ?'
  ).bind(id).all();

  const precosPorItem = {};
  precos.forEach((p) => {
    (precosPorItem[p.cotacaoItemId] ||= []).push(p);
  });
  itens.forEach((it) => { it.precos = precosPorItem[it.cotacaoItemId] || []; });

  return Response.json({ cotacao: { ...cotacao, fornecedores, itens } });
}