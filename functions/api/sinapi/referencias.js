// Meses da base SINAPI própria e importação do arquivo oficial da Caixa (tela "Base SINAPI").
// O navegador lê o ZIP, confere e manda em lotes; aqui só se grava (só administradores):
//   POST ?acao=iniciar  { mes, emissao, arquivo, substituir }  abre o mês (status "importando")
//   POST ?acao=lote&mes=AAAA-MM&tabela=insumos|composicoes|estruturas  corpo: lista JSON de linhas
//   POST ?acao=concluir { mes, insumos, composicoes }  confere contagens e libera o mês para uso
//   DELETE ?mes=AAAA-MM  remove os preços e custos do mês
// Cada lote vai inteiro como um parâmetro e o SQLite o percorre com json_each: poucas consultas
// por requisição e quase nenhum processamento no Worker.

import { lerCookie, validarSessao } from '../../_lib/session.js';
import { SINAPI_UF, SINAPI_REGIME } from '../../_lib/sinapi-base.js';

const MES = /^\d{4}-\d{2}$/;
const MAX_LOTE = 1_900_000; // um parâmetro do D1 aceita até 2 MB

async function emailAdmin(request, env) {
  const token = lerCookie(request, 'sessao');
  const payload = token ? await validarSessao(token, env.SESSION_SECRET) : null;
  if (!payload || !payload.email) return null;
  const email = payload.email.toLowerCase();
  const admins = (env.ADMIN_EMAILS || '').split(',').map((e) => e.trim().toLowerCase()).filter(Boolean);
  if (admins.includes(email)) return email;
  const usuario = await env.DB.prepare('SELECT isAdmin FROM usuarios WHERE email = ?').bind(email).first();
  return usuario && usuario.isAdmin ? email : null;
}

function erro(codigo, status, extra) {
  return Response.json(Object.assign({ erro: codigo }, extra || {}), { status });
}

export async function onRequestGet({ env }) {
  try {
    const { results } = await env.DB.prepare(
      'SELECT mes, uf, regime, emissao, arquivo, status, insumos, composicoes, importadoEm, importadoPor FROM sinapi_referencias ORDER BY mes DESC'
    ).all();
    return Response.json({ uf: SINAPI_UF, regime: SINAPI_REGIME, referencias: results });
  } catch (e) {
    return Response.json({ uf: SINAPI_UF, regime: SINAPI_REGIME, referencias: [], erro: 'base_nao_criada' });
  }
}

// Linhas de cada tabela, na ordem em que o navegador as manda
const LOTES = {
  // [codigo, descricao, unidade, classificacao, origem, preco]
  insumos: [
    `INSERT INTO sinapi_insumos (codigo, descricao, unidade, classificacao, mes)
     SELECT json_extract(value, '$[0]'), json_extract(value, '$[1]'), json_extract(value, '$[2]'), json_extract(value, '$[3]'), ?2
       FROM json_each(?1) WHERE true
     ON CONFLICT(codigo) DO UPDATE SET descricao = excluded.descricao, unidade = excluded.unidade,
       classificacao = excluded.classificacao, mes = excluded.mes
     WHERE excluded.mes >= sinapi_insumos.mes AND (sinapi_insumos.descricao IS NOT excluded.descricao
       OR sinapi_insumos.unidade IS NOT excluded.unidade OR sinapi_insumos.classificacao IS NOT excluded.classificacao)`,
    `INSERT OR REPLACE INTO sinapi_insumos_precos (mes, uf, regime, codigo, preco, origem)
     SELECT ?2, ?3, ?4, json_extract(value, '$[0]'), json_extract(value, '$[5]'), json_extract(value, '$[4]')
       FROM json_each(?1)`
  ],
  // [codigo, grupo, descricao, unidade, custo, maoDeObra, versao]
  composicoes: [
    `INSERT INTO sinapi_composicoes (codigo, descricao, unidade, grupo, mes)
     SELECT json_extract(value, '$[0]'), json_extract(value, '$[2]'), json_extract(value, '$[3]'), json_extract(value, '$[1]'), ?2
       FROM json_each(?1) WHERE true
     ON CONFLICT(codigo) DO UPDATE SET descricao = excluded.descricao, unidade = excluded.unidade,
       grupo = excluded.grupo, mes = excluded.mes
     WHERE excluded.mes >= sinapi_composicoes.mes AND (sinapi_composicoes.descricao IS NOT excluded.descricao
       OR sinapi_composicoes.unidade IS NOT excluded.unidade OR sinapi_composicoes.grupo IS NOT excluded.grupo)`,
    `INSERT OR REPLACE INTO sinapi_composicoes_custos (mes, uf, regime, codigo, custo, maoDeObra, versao)
     SELECT ?2, ?3, ?4, json_extract(value, '$[0]'), json_extract(value, '$[4]'), json_extract(value, '$[5]'), json_extract(value, '$[6]')
       FROM json_each(?1)`
  ],
  // [codigo, versao, [[tipo, item, coeficiente], ...]] — versão já gravada fica como está
  estruturas: [
    `INSERT OR IGNORE INTO sinapi_composicoes_estruturas (codigo, versao, itens)
     SELECT json_extract(value, '$[0]'), json_extract(value, '$[1]'), json_extract(value, '$[2]')
       FROM json_each(?1)`
  ]
};

async function iniciar(env, email, corpo) {
  const mes = corpo && corpo.mes;
  if (!MES.test(mes || '')) return erro('mes_invalido', 400);
  const atual = await env.DB.prepare('SELECT status FROM sinapi_referencias WHERE mes = ?1 AND uf = ?2 AND regime = ?3')
    .bind(mes, SINAPI_UF, SINAPI_REGIME).first();
  if (atual && atual.status === 'ok' && !corpo.substituir) return erro('ja_importado', 409);
  await env.DB.batch([
    env.DB.prepare('DELETE FROM sinapi_insumos_precos WHERE mes = ?1 AND uf = ?2 AND regime = ?3').bind(mes, SINAPI_UF, SINAPI_REGIME),
    env.DB.prepare('DELETE FROM sinapi_composicoes_custos WHERE mes = ?1 AND uf = ?2 AND regime = ?3').bind(mes, SINAPI_UF, SINAPI_REGIME),
    env.DB.prepare(
      `INSERT OR REPLACE INTO sinapi_referencias (mes, uf, regime, emissao, arquivo, status, insumos, composicoes, importadoEm, importadoPor)
       VALUES (?1, ?2, ?3, ?4, ?5, 'importando', 0, 0, ?6, ?7)`
    ).bind(mes, SINAPI_UF, SINAPI_REGIME, String(corpo.emissao || ''), String(corpo.arquivo || ''), new Date().toISOString(), email)
  ]);
  return Response.json({ ok: true, mes });
}

async function lote(env, url, request) {
  const mes = url.searchParams.get('mes') || '';
  const tabela = url.searchParams.get('tabela') || '';
  if (!MES.test(mes) || !LOTES[tabela]) return erro('parametros_invalidos', 400);
  const ref = await env.DB.prepare('SELECT status FROM sinapi_referencias WHERE mes = ?1 AND uf = ?2 AND regime = ?3')
    .bind(mes, SINAPI_UF, SINAPI_REGIME).first();
  if (!ref || ref.status !== 'importando') return erro('mes_nao_iniciado', 409);
  const texto = await request.text();
  if (!texto.startsWith('[') || texto.length > MAX_LOTE) return erro('lote_invalido', 400);
  // cada instrução recebe só os parâmetros que usa (?1 lote, ?2 mês, ?3 UF, ?4 regime)
  const valores = [texto, mes, SINAPI_UF, SINAPI_REGIME];
  const resultados = await env.DB.batch(LOTES[tabela].map((sql) => {
    const usados = Math.max(...Array.from(sql.matchAll(/\?(\d)/g), (m) => Number(m[1])));
    return env.DB.prepare(sql).bind(...valores.slice(0, usados));
  }));
  return Response.json({ ok: true, gravadas: resultados.reduce((s, r) => s + ((r.meta && r.meta.changes) || 0), 0) });
}

async function concluir(env, corpo) {
  const mes = corpo && corpo.mes;
  if (!MES.test(mes || '')) return erro('mes_invalido', 400);
  const c = await env.DB.prepare(
    `SELECT
       (SELECT COUNT(*) FROM sinapi_insumos_precos WHERE mes = ?1 AND uf = ?2 AND regime = ?3) AS insumos,
       (SELECT COUNT(*) FROM sinapi_composicoes_custos WHERE mes = ?1 AND uf = ?2 AND regime = ?3) AS composicoes,
       (SELECT COUNT(*) FROM sinapi_composicoes_custos k
          LEFT JOIN sinapi_composicoes_estruturas e ON e.codigo = k.codigo AND e.versao = k.versao
         WHERE k.mes = ?1 AND k.uf = ?2 AND k.regime = ?3 AND e.codigo IS NULL) AS semEstrutura`
  ).bind(mes, SINAPI_UF, SINAPI_REGIME).first();
  if (c.insumos !== Number(corpo.insumos) || c.composicoes !== Number(corpo.composicoes) || c.semEstrutura > 0) {
    return erro('contagem_diferente', 422, { gravado: c, esperado: { insumos: corpo.insumos, composicoes: corpo.composicoes } });
  }
  await env.DB.batch([
    // a busca por palavras usa as descrições mais recentes
    env.DB.prepare("INSERT INTO sinapi_composicoes_busca(sinapi_composicoes_busca) VALUES ('rebuild')"),
    env.DB.prepare("UPDATE sinapi_referencias SET status = 'ok', insumos = ?4, composicoes = ?5, importadoEm = ?6 WHERE mes = ?1 AND uf = ?2 AND regime = ?3")
      .bind(mes, SINAPI_UF, SINAPI_REGIME, c.insumos, c.composicoes, new Date().toISOString())
  ]);
  return Response.json({ ok: true, mes, insumos: c.insumos, composicoes: c.composicoes });
}

export async function onRequestPost({ request, env }) {
  const email = await emailAdmin(request, env);
  if (!email) return erro('nao_autorizado', 403);
  const url = new URL(request.url);
  const acao = url.searchParams.get('acao');
  try {
    if (acao === 'lote') return await lote(env, url, request);
    const corpo = await request.json().catch(() => null);
    if (acao === 'iniciar') return await iniciar(env, email, corpo);
    if (acao === 'concluir') return await concluir(env, corpo);
    return erro('acao_invalida', 400);
  } catch (e) {
    return erro('falha_banco', 500, { detalhe: String(e && e.message || e).slice(0, 300) });
  }
}

export async function onRequestDelete({ request, env }) {
  const email = await emailAdmin(request, env);
  if (!email) return erro('nao_autorizado', 403);
  const mes = new URL(request.url).searchParams.get('mes') || '';
  if (!MES.test(mes)) return erro('mes_invalido', 400);
  await env.DB.batch([
    env.DB.prepare('DELETE FROM sinapi_insumos_precos WHERE mes = ?1 AND uf = ?2 AND regime = ?3').bind(mes, SINAPI_UF, SINAPI_REGIME),
    env.DB.prepare('DELETE FROM sinapi_composicoes_custos WHERE mes = ?1 AND uf = ?2 AND regime = ?3').bind(mes, SINAPI_UF, SINAPI_REGIME),
    env.DB.prepare('DELETE FROM sinapi_referencias WHERE mes = ?1 AND uf = ?2 AND regime = ?3').bind(mes, SINAPI_UF, SINAPI_REGIME)
  ]);
  return Response.json({ ok: true });
}
