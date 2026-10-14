import { lerCookie, validarSessao } from '../../../../_lib/session.js';
import { podeEditar } from '../../../../_lib/admin.js';
import { enviarEmail } from '../../../../_lib/email.js';

// POST /api/compras/pedidos/:id/enviar  body: { emailDestino? } (default: e-mail cadastrado do fornecedor)
export async function onRequestPost({ request, env, params }) {
  const token = lerCookie(request, 'sessao');
  const payload = token ? await validarSessao(token, env.SESSION_SECRET) : null;
  if (!payload) return Response.json({ erro: 'nao_autenticado' }, { status: 401 });
  if (!(await podeEditar(payload, env))) {
    return Response.json({ erro: 'somente_visualizacao' }, { status: 403 });
  }

  const pedido = await env.DB.prepare(
    `SELECT p.*, f.nome as fornecedorNome, f.email as fornecedorEmail FROM pedidos p
     JOIN fornecedores f ON f.id = p.fornecedorId WHERE p.id = ?`
  ).bind(params.id).first();
  if (!pedido) return Response.json({ erro: 'nao_encontrado' }, { status: 404 });
  if (!pedido.pdfBase64) return Response.json({ erro: 'pdf_nao_gerado' }, { status: 409 });

  let destino = pedido.fornecedorEmail;
  try {
    const corpo = await request.json();
    if (corpo && corpo.emailDestino) destino = corpo.emailDestino;
  } catch (e) { /* corpo vazio é aceitável, usa o e-mail cadastrado */ }
  if (!destino) return Response.json({ erro: 'fornecedor_sem_email' }, { status: 400 });

  const url = new URL(request.url);
  const linkConfirmacao = `${url.origin}/confirmar-pedido.html?token=${pedido.confirmacaoToken}`;

  const html = `
    <p>Olá, ${pedido.fornecedorNome},</p>
    <p>Segue em anexo o pedido de compra <strong>${pedido.numero}</strong>, no valor total de
    ${(pedido.valorTotal || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}.</p>
    <p>Por favor, confirme o recebimento deste pedido clicando no link abaixo:</p>
    <p><a href="${linkConfirmacao}">${linkConfirmacao}</a></p>
    <p>Obrigado.</p>
  `;

  await enviarEmail({
    env, destinatario: destino, assunto: `Pedido de compra ${pedido.numero}`, html,
    anexoPdfBase64: pedido.pdfBase64, nomeArquivo: `${pedido.numero}.pdf`,
  });

  const agora = new Date().toISOString();
  await env.DB.prepare(
    "UPDATE pedidos SET status = 'enviado', emailEnviadoEm = ?, emailDestino = ? WHERE id = ?"
  ).bind(agora, destino, params.id).run();

  return Response.json({ ok: true, enviadoPara: destino });
}
