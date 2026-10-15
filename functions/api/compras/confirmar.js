// Rota PÚBLICA (liberada no _middleware) — formato antigo do link enviado por e-mail
// (/api/compras/confirmar?pedido=...&token=...). Encaminha para a página de confirmação,
// que mostra o pedido e confirma pelo botão (POST /api/compras/confirmar/[token]).
export async function onRequestGet({ request }) {
  const url = new URL(request.url);
  const token = url.searchParams.get('token');
  if (!token) {
    return Response.redirect(url.origin + '/confirmar-pedido', 302);
  }
  return Response.redirect(url.origin + '/confirmar-pedido?token=' + encodeURIComponent(token), 302);
}
