import { lerCookie, validarSessao } from '../../../../_lib/session.js';

function base64ParaBytes(b64) {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

export async function onRequestGet({ request, env, params }) {
  const token = lerCookie(request, 'sessao');
  const payload = token ? await validarSessao(token, env.SESSION_SECRET) : null;
  if (!payload) return Response.json({ erro: 'nao_autenticado' }, { status: 401 });

  const pedido = await env.DB.prepare('SELECT numero, pdfBase64 FROM pedidos WHERE id = ?').bind(params.id).first();
  if (!pedido || !pedido.pdfBase64) return Response.json({ erro: 'pdf_nao_encontrado' }, { status: 404 });

  return new Response(base64ParaBytes(pedido.pdfBase64), {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `inline; filename="${pedido.numero}.pdf"`,
    },
  });
}
