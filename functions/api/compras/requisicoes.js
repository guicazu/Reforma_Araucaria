import { lerCookie, validarSessao } from '../../_lib/session.js';
import { podeEditar } from '../../_lib/admin.js';

async function sessao(request, env) {
  const token = lerCookie(request, 'sessao');
  return token ? await validarSessao(token, env.SESSION_SECRET) : null;
}

// GET /api/compras/requisicoes?orcamentoId=XYZ -> lista requisições (com seus itens) daquele orçamento
export async function onRequestGet({ request, env }) {
  const payload = await sessao(request, env);
  if (!payload) return Response.json({ erro: 'nao_autenticado' }, { status: 401 });

  const url = new URL(request.url);
  const orcamentoId = url.searchParams.get('orcamentoId');
  if (!orcamentoId) return Response.json({ erro: 'parametros_invalidos' }, { status: 400 });

  const { results: requisicoes } = await env.DB.prepare(
    'SELECT * FROM requisicoes WHERE orcamentoId = ? ORDER BY criadoEm DESC'
  ).bind(orcamentoId).all();

  if (!requisicoes.length) return Response.json({ requisicoes: [] });

  const ids = requisicoes.map((r) => r.id);
  const placeholders = ids.map(() => '?').join(',');
  const { results: itens } = await env.DB.prepare(
    `SELECT * FROM itens_requisicao WHERE requisicaoId IN (${placeholders})`
  ).bind(...ids).all();

  const itensPorRequisicao = {};
  itens.forEach((it) => {
    (itensPorRequisicao[it.requisicaoId] ||= []).push(it);
  });
  requisicoes.forEach((r) => { r.itens = itensPorRequisicao[r.id] || []; });

  return Response.json({ requisicoes });
}

// POST cria uma requisição com um ou mais itens de uma vez
// body: { orcamentoId, observacoes?, itens: [{itemOrcamentoId, descricao, unidade, quantidadeOrcamento, quantidadeSolicitada}] }
export async function onRequestPost({ request, env }) {
  const payload = await sessao(request, env);
  if (!payload) return Response.json({ erro: 'nao_autenticado' }, { status: 401 });
  if (!(await podeEditar(payload, env))) {
    return Response.json({ erro: 'somente_visualizacao' }, { status: 403 });
  }

  const corpo = await request.json();
  const { orcamentoId, observacoes, itens } = corpo || {};
  if (!orcamentoId || !Array.isArray(itens) || !itens.length) {
    return Response.json({ erro: 'parametros_invalidos' }, { status: 400 });
  }
  for (const it of itens) {
    if (!it.itemOrcamentoId || !it.descricao || !it.quantidadeSolicitada || it.quantidadeSolicitada <= 0) {
      return Response.json({ erro: 'parametros_invalidos' }, { status: 400 });
    }
  }

  const id = crypto.randomUUID();
  const agora = new Date().toISOString();

  const comandos = [
    env.DB.prepare(
      `INSERT INTO requisicoes (id, orcamentoId, status, solicitanteEmail, solicitanteNome, observacoes, criadoEm, atualizadoEm)
       VALUES (?, ?, 'aberta', ?, ?, ?, ?, ?)`
    ).bind(id, orcamentoId, payload.email.toLowerCase(), payload.nome || '', observacoes || null, agora, agora),
  ];
  itens.forEach((it) => {
    comandos.push(
      env.DB.prepare(
        `INSERT INTO itens_requisicao (id, requisicaoId, itemOrcamentoId, descricao, unidade, quantidadeOrcamento, quantidadeSolicitada, status)
         VALUES (?, ?, ?, ?, ?, ?, ?, 'pendente')`
      ).bind(crypto.randomUUID(), id, it.itemOrcamentoId, it.descricao, it.unidade || '', it.quantidadeOrcamento ?? null, it.quantidadeSolicitada)
    );
  });

  await env.DB.batch(comandos);
  return Response.json({ ok: true, id });
}
