// Envio de e-mail pelo Resend (https://resend.com). Precisa da variável RESEND_API_KEY no Cloudflare
// Pages (Settings → Variáveis e segredos) e do domínio do endereço de envio verificado no Resend.
//
// O e-mail sai em nome de quem está usando o sistema: remetente "Nome (Empresa)" no endereço de envio
// (Suprimentos › Cadastros › Parâmetros › E-mails; padrão contato@cazu.com.br), "Responder para" o
// e-mail de login da pessoa e, se ligado, cópia oculta para ela. Quem entra com e-mail do mesmo domínio
// do endereço de envio usa o próprio endereço como remetente (ver remetente() em js/email-modelos.js).
import { remetente } from '../../js/email-modelos.js';

export class FalhaEmail extends Error {}

// Traduz a recusa do Resend para uma frase que diga o que fazer
function explicar(status, corpo, endereco) {
  const nome = String((corpo && corpo.name) || '');
  const msg = String((corpo && corpo.message) || '');
  const dominio = String(endereco || '').split('@')[1] || 'do remetente';
  if (/not verified|verify a domain|testing emails|own email address/i.test(msg) || nome === 'invalid_from_address' && /domain/i.test(msg)) {
    return `o domínio ${dominio} não está verificado na conta do Resend usada pelo sistema. Confira em resend.com/domains (e se a RESEND_API_KEY é dessa mesma conta)`;
  }
  if (status === 401 || /api_key|api key/i.test(nome + ' ' + msg)) {
    return 'a chave do Resend (RESEND_API_KEY) é inválida, foi revogada ou não tem permissão de envio';
  }
  if (/quota/i.test(nome + ' ' + msg)) return 'a cota de envios do plano do Resend acabou';
  if (status === 429) return 'o Resend limitou os envios agora (muitos e-mails seguidos); tente de novo em alguns segundos';
  if (/invalid_from_address|`from`/i.test(nome + ' ' + msg)) return `o endereço de envio ${endereco} não é válido para o Resend`;
  if (/`to`|invalid_to|recipient/i.test(nome + ' ' + msg)) return 'o e-mail do destinatário não é válido';
  return `o Resend recusou o envio (${status}${msg ? ': ' + msg : ''})`;
}

// prm: parâmetros de Suprimentos (email_remetente, email_copia_remetente…); usuario: { email, nome } de quem envia
export async function enviarEmail({ env, prm, usuario, nomeRemetente, destinatario, assunto, html, texto, anexoPdfBase64, nomeArquivo, semCopia }) {
  if (!env.RESEND_API_KEY) throw new FalhaEmail('o envio de e-mails não está configurado (falta a RESEND_API_KEY no Cloudflare)');
  const r = remetente(prm && prm.email_remetente, usuario && usuario.email, nomeRemetente);
  const corpo = { from: r.from, to: [destinatario], subject: assunto, html };
  if (texto) corpo.text = texto;
  if (r.responderPara) corpo.reply_to = [r.responderPara];
  const copia = prm && (prm.email_copia_remetente === '1' || prm.email_copia_remetente === true);
  if (copia && !semCopia && r.responderPara && r.responderPara !== String(destinatario).toLowerCase()) corpo.bcc = [r.responderPara];
  if (anexoPdfBase64) corpo.attachments = [{ filename: nomeArquivo || 'pedido.pdf', content: anexoPdfBase64 }];

  let res;
  try {
    // RESEND_API_URL só existe nos testes locais (servidor falso que registra o envio)
    res = await fetch(env.RESEND_API_URL || 'https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(corpo),
      signal: AbortSignal.timeout(15000)
    });
  } catch (e) {
    throw new FalhaEmail('não foi possível falar com o Resend agora; tente de novo em instantes');
  }
  if (!res.ok) {
    const resposta = await res.json().catch(() => null);
    throw new FalhaEmail(explicar(res.status, resposta, r.endereco));
  }
  return { ...(await res.json()), de: r.from, responderPara: r.responderPara, copia: corpo.bcc ? corpo.bcc[0] : null };
}

// Motivo da falha em uma frase curta, e a frase completa para a tela
export function motivoFalha(e) {
  return e instanceof FalhaEmail ? e.message : 'erro inesperado (' + String(e && e.message || e).replace(/\.$/, '') + ')';
}
export function mensagemFalha(e) { return 'Não foi possível enviar o e-mail: ' + motivoFalha(e) + '.'; }
