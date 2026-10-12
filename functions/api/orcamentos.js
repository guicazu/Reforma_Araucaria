
export async function onRequestGet({ env }) {
  const row = await env.DB.prepare(
    "SELECT conteudo FROM orcamentos WHERE id = 'atual'"
  ).first();
  let dados = [];
  if (row && row.conteudo) {
    dados = JSON.parse(row.conteudo);
    if (!Array.isArray(dados)) throw new Error('Snapshot de orçamentos inválido no D1');
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
  let corpo;
  try {
    corpo = await request.json();
  } catch (error) {
    return Response.json({ erro: 'json_invalido' }, { status: 400 });
  }
  const orcamentos = corpo && (corpo.orcamentos ?? corpo.dados);
  if (!Array.isArray(orcamentos)) {
    return Response.json({ erro: 'orcamentos_invalidos' }, { status: 400 });
  }
  const agora = new Date().toISOString();
  const payload = JSON.stringify(orcamentos);
  await env.DB.prepare(
    `INSERT INTO orcamentos (id, codigo, nome, criadoEm, conteudo, atualizadoEm)
     VALUES ('atual', 'SNAP', 'Estado atual', ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET conteudo = excluded.conteudo, atualizadoEm = excluded.atualizadoEm`
  ).bind(agora, payload, agora).run();
  return Response.json({ ok: true, atualizadoEm: agora });
}