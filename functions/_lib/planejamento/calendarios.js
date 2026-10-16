// Calendários de trabalho das obras (tela Calendários): semana, feriados e dias de exceção. As
// regras de feriado e a sugestão de pontes estão em js/feriados.js, o mesmo arquivo da tela.
import { json, falha, agora, uuid, lerJson, historico } from '../suprimentos/base.js';
import { normalizar, REGRA_VALIDA, UFS, FACULTATIVOS, dataDaRegra } from '../../../js/feriados.js';

const ehData = (v) => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) && new Date(v + 'T00:00:00Z').toISOString().slice(0, 10) === v;

export function calendarioDe(linha) {
  if (!linha) return null;
  return { id: linha.id, nome: linha.nome, padrao: Boolean(linha.padrao), revisao: linha.revisao, atualizadoEm: linha.atualizadoEm,
    atualizadoPorNome: linha.atualizadoPorNome, ...(linha.uso != null ? { uso: linha.uso } : {}), ...normalizar(lerJson(linha.config, {})) };
}

// Map id -> calendário (os usados por uma lista de cronogramas)
export async function calendariosPorId(env, ids) {
  const lista = Array.from(new Set(ids.filter(Boolean)));
  if (!lista.length) return new Map();
  const { results } = await env.DB.prepare('SELECT * FROM plan_calendarios WHERE id IN (SELECT value FROM json_each(?))').bind(JSON.stringify(lista)).all();
  return new Map(results.map((l) => [l.id, calendarioDe(l)]));
}

export async function listar({ env }) {
  const { results } = await env.DB.prepare(
    `SELECT c.*, (SELECT COUNT(*) FROM plan_cronogramas p WHERE p.calendarioId = c.id) AS uso FROM plan_calendarios c ORDER BY c.padrao DESC, c.nome`
  ).all();
  return json({ calendarios: results.map(calendarioDe) });
}

async function carregar(env, id) {
  const linha = await env.DB.prepare(
    `SELECT c.*, (SELECT COUNT(*) FROM plan_cronogramas p WHERE p.calendarioId = c.id) AS uso FROM plan_calendarios c WHERE c.id = ?`
  ).bind(id).first();
  if (!linha) falha(404, 'calendario_nao_encontrado', 'Calendário não encontrado (talvez excluído).');
  return linha;
}

export async function obter({ env, params }) {
  const linha = await carregar(env, params.id);
  const { results } = await env.DB.prepare(
    `SELECT v.orcamentoId AS id, v.codigo, v.nome FROM plan_cronogramas p JOIN orcamentos_versoes v ON v.orcamentoId = p.orcamentoId
      WHERE p.calendarioId = ? AND v.versaoNumero = (SELECT MAX(x.versaoNumero) FROM orcamentos_versoes x WHERE x.orcamentoId = v.orcamentoId)
      ORDER BY v.codigo, v.nome`
  ).bind(linha.id).all();
  return json({ calendario: calendarioDe(linha), obras: results });
}

function validar(corpo) {
  const nome = String(corpo.nome || '').trim();
  if (!nome) falha(400, 'nome', 'Dê um nome ao calendário (ex.: São Paulo – capital).');
  if (nome.length > 80) falha(400, 'nome', 'Nome com até 80 caracteres.');
  const dias = Array.isArray(corpo.diasSemana) ? Array.from(new Set(corpo.diasSemana.map(Number))) : [];
  if (!dias.length || dias.some((d) => !Number.isInteger(d) || d < 0 || d > 6)) falha(400, 'dias_semana', 'Marque pelo menos um dia da semana de trabalho.');
  const uf = corpo.uf || '';
  if (uf && !UFS.some((u) => u[0] === uf)) falha(400, 'uf', 'Estado inválido.');
  const codigo = corpo.municipioCodigo == null || corpo.municipioCodigo === '' ? null : Number(corpo.municipioCodigo);
  if (codigo != null && (!Number.isInteger(codigo) || codigo < 1000000 || codigo > 9999999)) falha(400, 'municipio', 'Município inválido.');
  const idsFacultativos = new Set(FACULTATIVOS.map((f) => f.id));
  const facultativos = (Array.isArray(corpo.facultativos) ? corpo.facultativos : []).filter((f) => idsFacultativos.has(f));
  const desativados = (Array.isArray(corpo.desativados) ? corpo.desativados : []).filter((d) => typeof d === 'string' && /^[nem]:/.test(d) && d.length <= 20).slice(0, 300);
  const municipais = [];
  for (const m of (Array.isArray(corpo.feriadosMunicipais) ? corpo.feriadosMunicipais : []).slice(0, 100)) {
    if (!m || !REGRA_VALIDA.test(m.regra) || !dataDaRegra(m.regra, 2024)) falha(400, 'feriado_municipal', 'Data inválida num feriado municipal: ' + (m && m.nome ? m.nome : '?') + '.');
    const n = String(m.nome || '').trim().slice(0, 120) || 'Feriado municipal';
    if (!municipais.some((x) => x.regra === m.regra)) municipais.push({ regra: m.regra, nome: n });
  }
  const porData = new Map();
  for (const d of (Array.isArray(corpo.dias) ? corpo.dias : []).slice(0, 3000)) {
    if (!d || !ehData(d.data) || !['parado', 'trabalhado'].includes(d.tipo)) falha(400, 'dia', 'Confira os dias específicos (data e se para ou trabalha).');
    porData.set(d.data, { data: d.data, tipo: d.tipo, motivo: String(d.motivo || '').trim().slice(0, 120) });
  }
  return {
    nome, padrao: Boolean(corpo.padrao),
    config: { diasSemana: dias.sort(), uf, municipioCodigo: codigo, municipioNome: codigo ? String(corpo.municipioNome || '').trim().slice(0, 80) : '',
      nacionais: corpo.nacionais !== false, estaduais: corpo.estaduais !== false, municipais: corpo.municipais !== false,
      facultativos, desativados, feriadosMunicipais: municipais, dias: Array.from(porData.values()).sort((a, b) => (a.data < b.data ? -1 : 1)) }
  };
}

export async function criar({ env, ctx, corpo }) {
  const v = validar(corpo);
  const id = uuid();
  const ts = agora();
  await env.DB.batch([
    ...(v.padrao ? [env.DB.prepare('UPDATE plan_calendarios SET padrao = 0 WHERE padrao = 1')] : []),
    env.DB.prepare(`INSERT INTO plan_calendarios (id, nome, config, padrao, revisao, criadoEm, atualizadoEm, atualizadoPorNome)
                    VALUES (?1, ?2, ?3, ?4, 1, ?5, ?5, ?6)`).bind(id, v.nome, JSON.stringify(v.config), v.padrao ? 1 : 0, ts, ctx.nome),
    historico(env, ctx, 'calendario', id, 'Calendário criado', v.nome)
  ]);
  return obter({ env, params: { id } });
}

export async function atualizar({ env, ctx, params, corpo }) {
  const atual = await carregar(env, params.id);
  const v = validar(corpo);
  const ts = agora();
  const [, r] = await env.DB.batch([
    // tira o "padrão" dos outros só se esta gravação passar (mesma revisão)
    env.DB.prepare(`UPDATE plan_calendarios SET padrao = 0 WHERE padrao = 1 AND id <> ?1 AND ?2 = 1
                     AND EXISTS (SELECT 1 FROM plan_calendarios WHERE id = ?1 AND revisao = ?3)`).bind(atual.id, v.padrao ? 1 : 0, Number(corpo.revisao) || 0),
    env.DB.prepare(`UPDATE plan_calendarios SET nome = ?2, config = ?3, padrao = ?4, revisao = revisao + 1, atualizadoEm = ?5, atualizadoPorNome = ?6
                     WHERE id = ?1 AND revisao = ?7`).bind(atual.id, v.nome, JSON.stringify(v.config), v.padrao ? 1 : 0, ts, ctx.nome, Number(corpo.revisao) || 0)
  ]);
  if (!r.meta.changes) {
    falha(409, 'conflito', `O calendário foi alterado por ${atual.atualizadoPorNome || 'outra pessoa'} enquanto você editava. Recarregue para ver a versão atual (suas alterações não foram salvas).`);
  }
  await historico(env, ctx, 'calendario', atual.id, 'Calendário alterado', v.nome).run();
  return obter({ env, params });
}

export async function excluir({ env, ctx, params }) {
  const atual = await carregar(env, params.id);
  if (atual.uso) falha(409, 'em_uso', `Este calendário é usado em ${atual.uso} cronograma(s). Troque o calendário deles (Planejamento › Configurar) antes de excluir.`);
  await env.DB.batch([
    env.DB.prepare('DELETE FROM plan_calendarios WHERE id = ?').bind(atual.id),
    historico(env, ctx, 'calendario', atual.id, 'Calendário excluído', atual.nome)
  ]);
  return json({ ok: true });
}
