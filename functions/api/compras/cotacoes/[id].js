import { lerCookie, validarSessao } from '../../../_lib/session.js';

// GET /api/compras/cotacoes/:id -> tudo que o mapa de comparação precisa:
// itens (linhas), fornecedores convidados (colunas) e os preços já lançados (células)
export async function onRequestGet({ request, env, params }) {
  const token = lerCookie(request, 'sessao');
  const payload = token ? await validarSessao(token, env.SESSION_SECRET) : null;
  if (!payload) return Response.json({ erro: 'nao_autenticado' }, { status: 401 });

  const cotacao = await env.DB.prepare('SELECT * FROM cotacoes WHERE id = ?').bind(params.id).first();
  if (!cotacao) return Response.json({ erro: 'nao_encontrada' }, { status: 404 });

  const { results: itens } = await env.DB.prepare(
    `SELECT ci.id as cotacaoItemId, ci.quantidade, ir.id as itemRequisicaoId, ir.descricao, ir.unidade, ir.quantidadeOrcamento
     FROM cotacao_itens ci JOIN itens_requisicao ir ON ir.id = ci.itemRequisicaoId
     WHERE ci.cotacaoId = ?`
  ).bind(params.id).all();

  const { results: fornecedores } = await env.DB.prepare(
    `SELECT cf.fornecedorId, cf.condicaoPagamento, cf.rodada, f.nome, f.email, f.cnpj
     FROM cotacao_fornecedores cf JOIN fornecedores f ON f.id = cf.fornecedorId
     WHERE cf.cotacaoId = ?`
  ).bind(params.id).all();

  const { results: precos } = await env.DB.prepare(
    'SELECT * FROM cotacao_precos WHERE cotacaoId = ?'
  ).bind(params.id).all();

  return Response.json({ cotacao, itens, fornecedores, precos });
}
