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
  const { precos, rodada, condicoes } = corpo || {};
  if (!id || !Array.isArray(precos) || !precos.length) {
    return Response.json({ erro: 'parametros_invalidos' }, { status: 400 });
  }

  const agora = new Date().toISOString();
  const comandos = [];

  // Preços existentes (para upsert)
  const { results: existentes } = await env.DB.prepare(
    'SELECT id, cotacaoItemId, fornecedorId FROM cotacao_precos WHERE cotacaoId = ?'
  ).bind(id).all();
  const mapaExistente = {};
  existentes.forEach((e) => { mapaExistente[e.cotacaoItemId + '|' + e.fornecedorId] = e.id; });

  // Mapear itemRequisicaoId -> cotacaoItemId
  const { results: citens } = await env.DB.prepare(
    'SELECT id, itemRequisicaoId FROM cotacao_itens WHERE cotacaoId = ?'
  ).bind(id).all();
  const itemParaCotacaoItem = {};
  citens.forEach((ci) => { itemParaCotacaoItem[ci.itemRequisicaoId] = ci.id; });

  for (const p of precos) {
    const cotacaoItemId = itemParaCotacaoItem[p.itemRequisicaoId];
    if (!cotacaoItemId) continue;
    const chave = cotacaoItemId + '|' + p.fornecedorId;
    const valor = Number(String(p.valor).replace(/[^\d,.-]/g, '').replace(',', '.')) || 0;
    if (mapaExistente[chave]) {
      comandos.push(env.DB.prepare(
        'UPDATE cotacao_precos SET precoUnitario = ?, atualizadoEm = ? WHERE id = ?'
      ).bind(valor, agora, mapaExistente[chave]));
    } else {
      comandos.push(env.DB.prepare(
        'INSERT INTO cotacao_precos (id, cotacaoId, cotacaoItemId, fornecedorId, precoUnitario, vencedora, atualizadoEm) VALUES (?, ?, ?, ?, ?, 0, ?)'
      ).bind(crypto.randomUUID(), id, cotacaoItemId, p.fornecedorId, valor, agora));
    }
  }

  // Condições de pagamento por fornecedor
  (condicoes || []).forEach((c) => {
    if (!c.fornecedorId) return;
    comandos.push(env.DB.prepare(
      'UPDATE cotacao_fornecedores SET condicaoPagamento = ? WHERE cotacaoId = ? AND fornecedorId = ?'
    ).bind(c.condicaoPagamento || null, id, c.fornecedorId));
  });

  // Nova rodada: limpa flags de vencedora anteriores
  if (rodada) {
    const { results: cf } = await env.DB.prepare(
      'SELECT rodada FROM cotacao_fornecedores WHERE cotacaoId = ? LIMIT 1'
    ).bind(id).all();
    if (!cf.length || Number(cf[0].rodada) !== Number(rodada)) {
      comandos.push(env.DB.prepare(
        'UPDATE cotacao_precos SET vencedora = 0, quantidadeComprada = NULL WHERE cotacaoId = ?'
      ).bind(id));
      comandos.push(env.DB.prepare(
        'UPDATE cotacao_fornecedores SET rodada = ? WHERE cotacaoId = ?'
      ).bind(Number(rodada), id));
    }
  }

  await env.DB.batch(comandos);
  return Response.json({ ok: true });
}