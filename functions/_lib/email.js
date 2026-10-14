// Envio de e-mail via Resend (https://resend.com). Precisa da variável de
// ambiente RESEND_API_KEY configurada no Cloudflare Pages (Settings → Variáveis e segredos).
//
// Enquanto não configurar um domínio próprio verificado no Resend, o remetente
// 'onboarding@resend.dev' funciona para testes (envia pra qualquer destinatário,
// mas com o limite do plano gratuito — ~100 e-mails/dia). Depois, configure
// REMETENTE_EMAIL com um domínio verificado (ex: 'Compras iBuild <compras@seudominio.com.br>').

export async function enviarEmail({ env, destinatario, assunto, html, anexoPdfBase64, nomeArquivo }) {
  if (!env.RESEND_API_KEY) {
    throw new Error('RESEND_API_KEY ausente — configure em Settings > Variáveis e segredos no Cloudflare Pages');
  }
  const remetente = env.REMETENTE_EMAIL || 'Reforma Araucária <onboarding@resend.dev>';

  const corpo = {
    from: remetente,
    to: [destinatario],
    subject: assunto,
    html,
  };
  if (anexoPdfBase64) {
    corpo.attachments = [{ filename: nomeArquivo || 'pedido.pdf', content: anexoPdfBase64 }];
  }

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${env.RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(corpo),
  });

  if (!res.ok) {
    const texto = await res.text().catch(() => '');
    throw new Error(`Falha ao enviar e-mail (${res.status}): ${texto}`);
  }
  return res.json();
}
