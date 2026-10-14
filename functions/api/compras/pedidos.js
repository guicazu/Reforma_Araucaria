import { lerCookie, validarSessao } from '../../_lib/session.js';

export async function onRequestGet({ request, env }) {
  const token = lerCookie(request, 'sessao');
  const payload = token ? await validarSessao(token, env.SESSION_SECRET) : null;
  if (!payload) return Response.json({ erro: 'nao_autenticado' }, { status: 401 });

  const url = new URL(request.url);
  const orcamentoId = url.searchParams.get('orcamentoId');
  if (!orcamentoId) return Response.json({ erro: 'parametros_invalidos' }, { status: 400 });

  const { results } = await env.DB.prepare(
    `SELECT p.id, p.numero, p.status, p.valorTotal, p.condicaoPagamento, p.dataEmissao,
            p.emailEnviadoEm, p.confirmadoEm, f.nome as fornecedorNome, f.email as fornecedorEmail
     FROM pedidos p JOIN fornecedores f ON f.id = p.fornecedorId
     WHERE p.orcamentoId = ? ORDER BY p.dataEmissao DESC`
  ).bind(orcamentoId).all();
  return Response.json({ pedidos: results });
}
