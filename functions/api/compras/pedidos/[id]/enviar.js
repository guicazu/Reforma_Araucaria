import { lerCookie, validarSessao } from '../../../../_lib/session.js';
import { podeEditar } from '../../../../_lib/admin.js';
import { enviarEmail } from '../../../../_lib/email.js';
import { gerarPdfPedido } from '../../../../_lib/pdf.js';

export async function onRequestPost({ request, env }) {
  const token = lerCookie(request, 'sessao');
  const payload = token ? await validarSessao(token, env.SESSION_SECRET) : null;
  if (!payload) return Response.json({ erro: 'nao_autenticado' }, { status: 401 });
  if (!(await podeEditar(payload, env))) {
    return Response.json({ erro: 'somente_visualizacao' }, { status: 403 });
  }

  const url = new URL(request.url);
  const id = url.pathname.split('/')[url.pathname.split('/').length - 2];
  if (!id) return Response.json({ erro: 'parametros_invalidos' }, { status: 400 });

  const { results: ped } = await env.DB.prepare('SELECT * FROM pedidos WHERE id = ?').bind(id).all();
  if (!ped.length) return Response.json({ erro: 'nao_encontrado' }, { status: 404 });
  const { results: fornecedor } = await env.DB.prepare('SELECT * FROM fornecedores WHERE id = ?').bind(ped[0].fornecedorId).all();
  const { results: itens } = await env.DB.prepare('SELECT * FROM itens_pedido WHERE pedidoId = ?').bind(id).all();

  const p = ped[0];
  const forn = fornecedor[0] || null;
  if (!forn || !forn.email) {
    return Response.json({ erro: 'fornecedor_sem_email' }, { status: 400 });
  }

  let b64 = p.pdfBase64;
  if (!b64) {
    b64 = await gerarPdfPedido({ pedido: p, fornecedor: forn, itens });
  }

  const link = url.origin + '/confirmar-pedido?token=' + encodeURIComponent(p.confirmacaoToken || '');
  const html =
    '<div style="font-family:Arial,sans-serif;max-width:560px;margin:auto">' +
    '<h2 style="color:#052d33">Pedido de compra ' + (p.numero || '') + '</h2>' +
    '<p>Olá, <b>' + forn.nome + '</b>! Recebemos seu(s) valor(es) e fechamos o pedido abaixo:</p>' +
    '<p>Valor total: <b>R$ ' + Number(p.valorTotal || 0).toFixed(2) + '</b><br>' +
    'Condição de pagamento: ' + (p.condicaoPagamento || '—') + '</p>' +
    '<p>Ao receber esta mercadoria, confirme o recebimento pelo botão abaixo:</p>' +
    '<p><a href="' + link + '" style="background:#b1e445;color:#052d33;padding:12px 20px;border-radius:8px;text-decoration:none;font-weight:bold">Confirmar recebimento do pedido</a></p>' +
    '<p style="color:#666;font-size:12px">E-mail enviado automaticamente por Cazú Projetos e Construções.</p>' +
    '</div>';

  try {
    await enviarEmail({
      env,
      destinatario: forn.email,
      assunto: 'Pedido de compra ' + (p.numero || '') + ' — Cazú Projetos e Construções',
      html,
      anexoPdfBase64: b64,
      nomeArquivo: 'Pedido-' + (p.numero || id) + '.pdf'
    });
  } catch (e) {
    return Response.json({ erro: 'falha_envio_email', detalhe: e.message }, { status: 502 });
  }

  const agora = new Date().toISOString();
  await env.DB.prepare(
    "UPDATE pedidos SET pdfBase64 = ?, pdfGeradoEm = ?, emailEnviadoEm = ?, emailDestino = ?, status = 'enviado' WHERE id = ?"
  ).bind(b64, agora, agora, forn.email, id).run();

  return Response.json({ ok: true, linkConfirmacao: link });
}