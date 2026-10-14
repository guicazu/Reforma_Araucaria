import { lerCookie, validarSessao } from '../../../../_lib/session.js';
import { podeEditar } from '../../../../_lib/admin.js';

// PUT /api/compras/cotacoes/:id/precos
// body: { cotacaoItemId, fornecedorId, precoUnitario }  -> upsert de uma célula da matriz
export async function onRequestPut({ request, env, params }) {
  const token = lerCookie(request, 'sessao');
  const payload = token ? await validarSessao(token, env.SESSION_SECRET) : null;
  if (!payload) return Response.json({ erro: 'nao_autenticado' }, { status: 401 });
  if (!(await podeEditar(payload, env))) {
    return Response.json({ erro: 'somente_visualizacao' }, { status: 403 });
  }

  const corpo = await request.json();
  const { cotacaoItemId, fornecedorId, precoUnitario } = corpo || {};
  if (!cotacaoItemId || !fornecedorId || !precoUnitario || precoUnitario <= 0) {
    return Response.json({ erro: 'parametros_invalidos' }, { status: 400 });
  }

  const agora = new Date().toISOString();
  await env.DB.prepare(
    `INSERT INTO cotacao_precos (id, cotacaoId, cotacaoItemId, fornecedorId, precoUnitario, vencedora, atualizadoEm)
     VALUES (?, ?, ?, ?, ?, 0, ?)
     ON CONFLICT(cotacaoItemId, fornecedorId) DO UPDATE SET precoUnitario = excluded.precoUnitario, atualizadoEm = excluded.atualizadoEm`
  ).bind(crypto.randomUUID(), params.id, cotacaoItemId, fornecedorId, precoUnitario, agora).run();

  return Response.json({ ok: true });
}
