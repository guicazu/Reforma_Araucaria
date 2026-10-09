// Cloudflare Pages Function — API de sincronização do orçamentos
// Rota gerada automaticamente: /api/orcamentos
// Binding D1 usado: "DB" (configurado no painel, passo 7)

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8' }
  });
}

function erro(msg, status = 500) {
  return json({ ok: false, erro: msg }, status);
}

// E-mail do usuário logado via Cloudflare Access (auditoria)
function usuarioDe(request) {
  return request.headers.get('Cf-Access-Authenticated-User-Email') || 'anônimo';
}

const CHAVE = 'orcamentos';

// GET /api/orcamentos -> devolve o snapshot atual
export async function onRequestGet(context) {
  const { env } = context;
  if (!env || !env.DB) return erro('Binding D1 "DB" não configurado.', 500);
  try {
    const { results } = await env.DB.prepare(
      'SELECT valor, atualizado_em FROM app_state WHERE chave = ?'
    ).bind(CHAVE).all();

    const row = results && results[0];
    let dados = [];
    if (row && row.valor) {
      try { dados = JSON.parse(row.valor); } catch (e) { dados = []; }
    }
    return json({ ok: true, dados, atualizadoEm: row ? row.atualizado_em : 0 });
  } catch (e) {
    return erro('Erro ao ler orçamentos: ' + e.message, 500);
  }
}

// POST /api/orcamentos -> grava o snapshot (corpo: { dados: [...] })
export async function onRequestPost(context) {
  const { request, env } = context;
  if (!env || !env.DB) return erro('Binding D1 "DB" não configurado.', 500);

  let body;
  try {
    body = await request.json();
  } catch (e) {
    return erro('Corpo inválido (JSON esperado).', 400);
  }
  if (!Array.isArray(body.dados)) return erro('Campo "dados" precisa ser um array.', 400);

  const valor = JSON.stringify(body.dados);
  const agora = Date.now();
  try {
    await env.DB.prepare(
      `INSERT INTO app_state (chave, valor, atualizado_por, atualizado_em)
       VALUES (?, ?, ?, ?)
       ON CONFLICT(chave) DO UPDATE SET
         valor            = excluded.valor,
         atualizado_por   = excluded.atualizado_por,
         atualizado_em    = excluded.atualizado_em`
    ).bind(CHAVE, valor, usuarioDe(request), agora).run();
    return json({ ok: true, atualizadoEm: agora });
  } catch (e) {
    return erro('Erro ao gravar orçamentos: ' + e.message, 500);
  }
}

// DELETE /api/orcamentos -> zera o snapshot (usar só como "reset")
export async function onRequestDelete(context) {
  const { request, env } = context;
  if (!env || !env.DB) return erro('Binding D1 "DB" não configurado.', 500);
  try {
    await env.DB.prepare(
      `INSERT INTO app_state (chave, valor, atualizado_por, atualizado_em)
       VALUES (?, '[]', ?, ?)
       ON CONFLICT(chave) DO UPDATE SET
         valor            = '[]',
         atualizado_por   = excluded.atualizado_por,
         atualizado_em    = excluded.atualizado_em`
    ).bind(CHAVE, usuarioDe(request), Date.now()).run();
    return json({ ok: true });
  } catch (e) {
    return erro('Erro ao limpar orçamentos: ' + e.message, 500);
  }
}
