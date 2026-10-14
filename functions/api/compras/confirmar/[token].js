// Rota PÚBLICA (sem login) — o fornecedor acessa via link recebido por e-mail.
// Precisa estar liberada em functions/_middleware.js (veja CAMINHOS_PUBLICOS).

export async function onRequestGet({ env, params }) {
  const pedido = await env.DB.prepare(
    `SELECT p.numero, p.valorTotal, p.status, p.confirmadoEm, p.dataEmissao, f.nome as fornecedorNome
     FROM pedidos p JOIN fornecedores f ON f.id = p.fornecedorId WHERE p.confirmacaoToken = ?`
  ).bind(params.token).first();
  if (!pedido) return Response.json({ erro: 'token_invalido' }, { status: 404 });
  return Response.json({ pedido });
}

export async function onRequestPost({ env, params }) {
  const pedido = await env.DB.prepare('SELECT id, status FROM pedidos WHERE confirmacaoToken = ?').bind(params.token).first();
  if (!pedido) return Response.json({ erro: 'token_invalido' }, { status: 404 });
  if (pedido.status === 'cancelado') return Response.json({ erro: 'pedido_cancelado' }, { status: 409 });

  const agora = new Date().toISOString();
  await env.DB.prepare(
    "UPDATE pedidos SET status = 'confirmado', confirmadoEm = ? WHERE id = ? AND confirmadoEm IS NULL"
  ).bind(agora, pedido.id).run();

  return Response.json({ ok: true });
}
