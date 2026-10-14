// Rota PÚBLICA (liberada no _middleware) — o fornecedor clica no link do e-mail.
export async function onRequestGet({ request, env }) {
  const url = new URL(request.url);
  const pedidoId = url.searchParams.get('pedido');
  const token = url.searchParams.get('token');
  if (!pedidoId || !token) {
    return Response.redirect(url.origin + '/confirmar-pedido.html?status=invalido', 302);
  }

  const agora = new Date().toISOString();
  const { meta } = await env.DB.prepare(
    "UPDATE pedidos SET confirmadoEm = ?, status = 'confirmado' WHERE id = ? AND confirmacaoToken = ? AND confirmadoEm IS NULL"
  ).bind(agora, pedidoId, token).run();

  const status = meta.changes > 0 ? 'confirmado' : (meta.changes === 0 ? 'ja_confirmado' : 'invalido');
  return Response.redirect(url.origin + '/confirmar-pedido.html?status=' + status, 302);
}