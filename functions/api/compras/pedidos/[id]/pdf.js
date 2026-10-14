import { lerCookie, validarSessao } from '../../../../_lib/session.js';
import { gerarPdfPedido } from '../../../../_lib/pdf.js';

export async function onRequestGet({ request, env }) {
  const token = lerCookie(request, 'sessao');
  const payload = token ? await validarSessao(token, env.SESSION_SECRET) : null;
  if (!payload) return Response.redirect('/login', 302);

  const url = new URL(request.url);
  const id = url.pathname.split('/')[url.pathname.split('/').length - 2];
  if (!id) return Response.json({ erro: 'parametros_invalidos' }, { status: 400 });

  const { results: ped } = await env.DB.prepare('SELECT * FROM pedidos WHERE id = ?').bind(id).all();
  if (!ped.length) return Response.json({ erro: 'nao_encontrado' }, { status: 404 });
  const { results: fornecedor } = await env.DB.prepare('SELECT * FROM fornecedores WHERE id = ?').bind(ped[0].fornecedorId).all();
  const { results: itens } = await env.DB.prepare('SELECT * FROM itens_pedido WHERE pedidoId = ?').bind(id).all();

  let b64 = ped[0].pdfBase64;
  if (!b64) {
    b64 = await gerarPdfPedido({ pedido: ped[0], fornecedor: fornecedor[0] || null, itens });
    await env.DB.prepare('UPDATE pedidos SET pdfBase64 = ?, pdfGeradoEm = ? WHERE id = ?')
      .bind(b64, new Date().toISOString(), id).run();
  }

  const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
  return new Response(bytes, {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': 'inline; filename="Pedido-' + (ped[0].numero || id) + '.pdf"'
    }
  });
}