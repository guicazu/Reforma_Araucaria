export async function onRequestGet({ env }) {
  const { results } = await env.DB.prepare(
    "SELECT id, codigo, nome, criadoEm, conteudo, atualizadoEm FROM orcamentos ORDER BY atualizadoEm DESC"
  ).all();
  return Response.json(results || []);
}

export async function onRequestPost({ request, env }) {
  const dados = await request.json(); // { orcamentos: [...] } — seu state.orcamentos
  const agora = new Date().toISOString();
  const payload = JSON.stringify(dados.orcamentos ?? []);
  // Upsert: substitui todos e guarda um único registro "atual"
  await env.DB.prepare(
    `INSERT INTO orcamentos (id, codigo, nome, criadoEm, conteudo)
     VALUES ('atual', 'SNAP', 'Estado atual', ?, ?)
     ON CONFLICT(id) DO UPDATE SET conteudo = excluded.conteudo, atualizadoEm = datetime('now')`
  ).bind(agora, payload).run();
  return Response.json({ ok: true });
}
