// Funções auxiliares para criar/validar o cookie de sessão assinado (HMAC-SHA256)
// e ler/escrever cookies. Não é uma rota (fica em _lib, fora de functions/api).

function base64url(buffer) {
  return btoa(String.fromCharCode(...new Uint8Array(buffer)))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function base64urlToBuffer(str) {
  str = str.replace(/-/g, '+').replace(/_/g, '/');
  while (str.length % 4) str += '=';
  const bin = atob(str);
  const buf = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) buf[i] = bin.charCodeAt(i);
  return buf;
}

async function getKey(secret) {
  return crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign', 'verify']
  );
}

export async function criarSessao(payload, secret) {
  const corpo = base64url(new TextEncoder().encode(JSON.stringify(payload)));
  const key = await getKey(secret);
  const assinatura = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(corpo));
  return corpo + '.' + base64url(assinatura);
}

export async function validarSessao(token, secret) {
  if (!token || !token.includes('.')) return null;
  const [corpo, assinatura] = token.split('.');
  try {
    const key = await getKey(secret);
    const valido = await crypto.subtle.verify(
      'HMAC', key, base64urlToBuffer(assinatura), new TextEncoder().encode(corpo)
    );
    if (!valido) return null;
    const payload = JSON.parse(new TextDecoder().decode(base64urlToBuffer(corpo)));
    if (payload.exp && Date.now() > payload.exp) return null;
    return payload;
  } catch (e) {
    return null;
  }
}

export function lerCookie(request, nome) {
  const cookies = request.headers.get('Cookie') || '';
  const match = cookies.match(new RegExp('(?:^|; )' + nome + '=([^;]*)'));
  return match ? decodeURIComponent(match[1]) : null;
}

export function cookieHeader(nome, valor, opcoes = {}) {
  const partes = [`${nome}=${encodeURIComponent(valor)}`, 'Path=/', 'HttpOnly', 'Secure', 'SameSite=Lax'];
  if (opcoes.maxAge) partes.push(`Max-Age=${opcoes.maxAge}`);
  return partes.join('; ');
}

export function apagarCookieHeader(nome) {
  return `${nome}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`;
}
