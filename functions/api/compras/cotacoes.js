import { lerCookie, validarSessao } from '../../_lib/session.js';
import { podeEditar } from '../../_lib/admin.js';

async function sessao(request, env) {
  const token = lerCookie(request, 'sessao');
  return token ? await validarSessao(token, env.SESSION_SECRET) : null;
}

// GET /api/compras/cotacoes?orcamentoId=XYZ
export async function onRequestGet({ request, env }) {
  const payload = await sessao(request, env);
  if (!payload) return Response.json({ erro: 'nao_autenticado' }, { status: 401 });
  const url = new URL(request.url);
  const orcamentoId = url.searchParams.get('orcamentoId');
  if (!orcamentoId) return Response.json({ erro: 'parametros_invalidos' }, { status: 400 });

  const { results } = await env.DB.prepare(
    'SELECT * FROM cotacoes WHERE orcamentoId = ? ORDER BY criadoEm DESC'
  ).bind(orcamentoId).all();
  return Response.json({ cotacoes: results });
}

// POST cria uma cotação nova (mapa de comparação) a partir de itens de uma ou mais requisições
// body: { orcamentoId, itens: [{itemRequisicaoId, quantidade}], fornecedores: [{fornecedorId, condicaoPagamento?}] }
export async function onRequestPost({ request, env }) {
  const payload = await sessao(request, env);
  if (!payload) return Response.json({ erro: 'nao_autenticado' }, { status: 401 });
  if (!(await podeEditar(payload, env))) {
    return Response.json({ erro: 'somente_visualizacao' }, { status: 403 });
  }

  const corpo = await request.json();
  const { orcamentoId, itens, fornecedores } = corpo || {};
  if (!orcamentoId || !Array.isArray(itens) || !itens.length || !Array.isArray(fornecedores) || !fornecedores.length) {
    return Response.json({ erro: 'parametros_invalidos' }, { status: 400 });
  }

  const id = crypto.randomUUID();
  const agora = new Date().toISOString();
  const comandos = [
    env.DB.prepare(
      "INSERT INTO cotacoes (id, orcamentoId, status, criadoPorEmail, criadoEm) VALUES (?, ?, 'aberta', ?, ?)"
    ).bind(id, orcamentoId, payload.email.toLowerCase(), agora),
  ];
  itens.forEach((it) => {
    comandos.push(
      env.DB.prepare(
        'INSERT INTO cotacao_itens (id, cotacaoId, itemRequisicaoId, quantidade) VALUES (?, ?, ?, ?)'
      ).bind(crypto.randomUUID(), id, it.itemRequisicaoId, it.quantidade)
    );
  });
  fornecedores.forEach((f) => {
    comandos.push(
      env.DB.prepare(
        'INSERT INTO cotacao_fornecedores (id, cotacaoId, fornecedorId, condicaoPagamento, rodada) VALUES (?, ?, ?, ?, 1)'
      ).bind(crypto.randomUUID(), id, f.fornecedorId, f.condicaoPagamento || null)
    );
  });
  // marca os itens de requisição envolvidos como "em_cotacao"
  const idsItensReq = itens.map((it) => it.itemRequisicaoId);
  comandos.push(
    env.DB.prepare(
      `UPDATE itens_requisicao SET status = 'em_cotacao' WHERE id IN (${idsItensReq.map(() => '?').join(',')})`
    ).bind(...idsItensReq)
  );

  await env.DB.batch(comandos);
  return Response.json({ ok: true, id });
}
