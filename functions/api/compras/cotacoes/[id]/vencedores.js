import { lerCookie, validarSessao } from '../../../../_lib/session.js';
import { podeEditar } from '../../../../_lib/admin.js';

// PUT /api/compras/cotacoes/:id/vencedores
// body: { cotacaoItemId, fornecedorId, vencedora: true|false, quantidadeComprada? }
// Permite marcar mais de um fornecedor vencedor para o mesmo item (compra dividida / parcial).
export async function onRequestPut({ request, env, params }) {
  const token = lerCookie(request, 'sessao');
  const payload = token ? await validarSessao(token, env.SESSION_SECRET) : null;
  if (!payload) return Response.json({ erro: 'nao_autenticado' }, { status: 401 });
  if (!(await podeEditar(payload, env))) {
    return Response.json({ erro: 'somente_visualizacao' }, { status: 403 });
  }

  const corpo = await request.json();
  const { cotacaoItemId, fornecedorId, vencedora, quantidadeComprada } = corpo || {};
  if (!cotacaoItemId || !fornecedorId || typeof vencedora !== 'boolean') {
    return Response.json({ erro: 'parametros_invalidos' }, { status: 400 });
  }

  const resultado = await env.DB.prepare(
    `UPDATE cotacao_precos SET vencedora = ?, quantidadeComprada = ?, atualizadoEm = ?
     WHERE cotacaoItemId = ? AND fornecedorId = ?`
  ).bind(vencedora ? 1 : 0, quantidadeComprada ?? null, new Date().toISOString(), cotacaoItemId, fornecedorId).run();

  if (!resultado.meta || resultado.meta.changes !== 1) {
    return Response.json({ erro: 'preco_nao_encontrado' }, { status: 404 });
  }
  return Response.json({ ok: true });
}
