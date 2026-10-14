export async function proximoNumeroPedido(env) {
  await env.DB.prepare("UPDATE contadores SET valor = valor + 1 WHERE chave = 'pedido'").run();
  const row = await env.DB.prepare("SELECT valor FROM contadores WHERE chave = 'pedido'").first();
  const n = (row && row.valor) || 1;
  return `PC-${String(n).padStart(4, '0')}`;
}

export function gerarTokenConfirmacao() {
  return crypto.randomUUID().replace(/-/g, '');
}
