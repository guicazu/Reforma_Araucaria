
export async function onRequestGet({ env }) {
  const row = await env.DB.prepare(
    "SELECT conteudo FROM orcamentos WHERE id = 'atual'"
  ).first();
  let dados = [];
  if (row && row.conteudo) {
    try { dados = JSON.parse(row.conteudo); } catch (e) { dados = []; }
  }

  // Anexa o bloqueio ativo de cada orçamento
  const { results: bloqueios } = await env.DB.prepare(
    'SELECT orcamentoId, usuarioEmail, usuarioNome, criadoEm FROM bloqueios'
  ).all();
  const mapa = {};
  for (const b of bloqueios) mapa[b.orcamentoId] = b;

  for (const o of dados) {
    o.bloqueio = mapa[o.id]
      ? { email: mapa[o.id].usuarioEmail, nome: mapa[o.id].usuarioNome, criadoEm: mapa[o.id].criadoEm }
      : null;
  }

  return Response.json({ dados });
}

export async function onRequestPost({ request, env }) {
  const corpo = await request.json();
  const orcamentos = corpo.orcamentos ?? corpo.dados ?? [];
  const agora = new Date().toISOString();
  const payload = JSON.stringify(orcamentos);
  await env.DB.prepare(
    `INSERT INTO orcamentos (id, codigo, nome, criadoEm, conteudo)
     VALUES ('atual', 'SNAP', 'Estado atual', ?, ?)
     ON CONFLICT(id) DO UPDATE SET conteudo = excluded.conteudo, atualizadoEm = excluded.atualizadoEm`
  ).bind(agora, payload).run();
  return Response.json({ ok: true });
}