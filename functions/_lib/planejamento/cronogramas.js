// Planejamento: o cronograma de cada obra (as tarefas são os serviços da versão atual do orçamento)
// e os apontamentos de avanço físico. As contas (caminho crítico, previsto × realizado, curva S)
// são do js/cronograma-motor.js, o mesmo arquivo da tela.
import { json, falha, agora, hoje, uuid, arred, lerJson, historico, lerHistorico } from '../suprimentos/base.js';
import { estruturaEap } from '../suprimentos/orcado.js';
import { calcular, avancoEm, indexarAvancos, ehData, CALENDARIOS, LIMITE_DURACAO, LIMITE_ESPERA } from '../../../js/cronograma-motor.js';

const COLUNAS = `orcamentoId, dataInicio, calendario, feriados, duracaoPadrao, tarefas, revisao, criadoEm, criadoPorNome,
  atualizadoEm, atualizadoPorEmail, atualizadoPorNome`;
const dataBr = (iso) => (iso ? String(iso).slice(0, 10).split('-').reverse().join('/') : '—');
const dataHoraBr = (iso) => new Date(iso).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', dateStyle: 'short', timeStyle: 'short' });

export function configDe(linha) {
  if (!linha) return null;
  return { dataInicio: linha.dataInicio, calendario: linha.calendario, feriados: lerJson(linha.feriados, []),
    duracaoPadrao: linha.duracaoPadrao, tarefas: lerJson(linha.tarefas, {}) };
}

// Previsto e realizado de hoje, datas e avisos de um cronograma
export function resumoDoCronograma(nos, config, avancos, dia) {
  const res = calcular(nos, config);
  const a = avancoEm(res, indexarAvancos(avancos), dia);
  return {
    res, inicio: res.inicio, termino: res.termino, duracao: res.duracao,
    previsto: arred(a.previsto * 100, 1), realizado: arred(a.realizado * 100, 1),
    criticos: res.criticos, novos: res.novos, erros: res.erros.map((e) => e.mensagem)
  };
}

// Último % de cada serviço até a data, de uma obra ('' = todas): Map orcamentoId -> apontamentos
export async function ultimosAvancos(env, data, orcamentoId) {
  const { results } = await env.DB.prepare(
    `SELECT a.orcamentoId, a.servicoId, a.data, a.percentual FROM plan_avancos a
      WHERE (?2 = '' OR a.orcamentoId = ?2)
        AND a.data = (SELECT MAX(b.data) FROM plan_avancos b WHERE b.orcamentoId = a.orcamentoId AND b.servicoId = a.servicoId AND b.data <= ?1)`
  ).bind(data, orcamentoId || '').all();
  const porObra = new Map();
  for (const r of results) {
    if (!porObra.has(r.orcamentoId)) porObra.set(r.orcamentoId, []);
    porObra.get(r.orcamentoId).push(r);
  }
  return porObra;
}

async function versaoAtual(env, orcamentoId) {
  const v = await env.DB.prepare(
    `SELECT orcamentoId AS id, codigo, nome, versaoNumero, conteudo FROM orcamentos_versoes
      WHERE orcamentoId = ? ORDER BY versaoNumero DESC LIMIT 1`
  ).bind(orcamentoId).first();
  if (!v) falha(404, 'obra_nao_encontrada', 'Obra (orçamento) não encontrada.');
  return v;
}

/* ---------- lista de obras ---------- */
export async function listar({ env }) {
  const dia = hoje();
  const [obras, avancos] = await Promise.all([
    env.DB.prepare(
      `SELECT v.orcamentoId AS id, v.codigo, v.nome, v.versaoNumero, CASE WHEN c.orcamentoId IS NULL THEN NULL ELSE v.conteudo END AS conteudo,
              c.dataInicio, c.calendario, c.feriados, c.duracaoPadrao, c.tarefas, c.atualizadoEm, c.atualizadoPorNome
         FROM orcamentos_versoes v LEFT JOIN plan_cronogramas c ON c.orcamentoId = v.orcamentoId
        WHERE v.versaoNumero = (SELECT MAX(x.versaoNumero) FROM orcamentos_versoes x WHERE x.orcamentoId = v.orcamentoId)
        ORDER BY v.codigo, v.nome`
    ).all(),
    ultimosAvancos(env, dia, '')
  ]);
  return json({
    hoje: dia,
    obras: obras.results.map((o) => {
      const base = { id: o.id, codigo: o.codigo || '', nome: o.nome || '', versao: o.versaoNumero, temCronograma: Boolean(o.dataInicio) };
      if (!o.dataInicio) return base;
      const r = resumoDoCronograma(estruturaEap(lerJson(o.conteudo, [])), configDe(o), avancos.get(o.id) || [], dia);
      return { ...base, inicio: r.inicio, termino: r.termino, duracao: r.duracao, previsto: r.previsto, realizado: r.realizado,
        novos: r.novos, erros: r.erros, atualizadoEm: o.atualizadoEm, atualizadoPorNome: o.atualizadoPorNome };
    })
  });
}

/* ---------- uma obra ---------- */
export async function obter({ env, params }) {
  const v = await versaoAtual(env, params.id);
  const [c, av] = await env.DB.batch([
    env.DB.prepare(`SELECT ${COLUNAS} FROM plan_cronogramas WHERE orcamentoId = ?`).bind(v.id),
    env.DB.prepare('SELECT servicoId, data, percentual, usuarioNome, criadoEm FROM plan_avancos WHERE orcamentoId = ? ORDER BY data, servicoId').bind(v.id)
  ]);
  const linha = c.results[0] || null;
  return json({
    hoje: hoje(),
    obra: { id: v.id, codigo: v.codigo || '', nome: v.nome || '', versao: v.versaoNumero },
    eap: estruturaEap(lerJson(v.conteudo, [])).map((n) => ({ tipo: n.tipo, id: n.id, eap: n.eap, nivel: n.nivel, paiId: n.paiId, nome: n.nome,
      unidade: n.unidade || '', quantidade: n.quantidade || 0, valor: n.valor || 0 })),
    cronograma: linha ? { ...configDe(linha), revisao: linha.revisao, criadoEm: linha.criadoEm, criadoPorNome: linha.criadoPorNome,
      atualizadoEm: linha.atualizadoEm, atualizadoPorNome: linha.atualizadoPorNome } : null,
    avancos: av.results
  });
}

// Confere o que veio da tela: só serviços da versão atual, durações e esperas nos limites,
// predecessoras que existem na EAP e não são o próprio serviço nem um grupo que o contém
function validarConfig(corpo, nos) {
  if (!ehData(corpo.dataInicio)) falha(400, 'data_inicio', 'Informe a data de início da obra.');
  if (!CALENDARIOS[corpo.calendario]) falha(400, 'calendario', 'Escolha o calendário: dias úteis ou dias corridos.');
  const feriados = Array.isArray(corpo.feriados) ? corpo.feriados : [];
  if (feriados.length > 400 || feriados.some((f) => !ehData(f))) falha(400, 'feriados', 'Confira as datas dos feriados (uma por linha, dd/mm/aaaa).');
  const duracaoPadrao = Number(corpo.duracaoPadrao);
  if (!Number.isInteger(duracaoPadrao) || duracaoPadrao < 1 || duracaoPadrao > LIMITE_DURACAO) falha(400, 'duracao_padrao', 'A duração padrão deve ser de 1 a ' + LIMITE_DURACAO + ' dias.');
  const porId = new Map(nos.map((n) => [n.id, n]));
  const entrada = corpo.tarefas && typeof corpo.tarefas === 'object' && !Array.isArray(corpo.tarefas) ? corpo.tarefas : {};
  const tarefas = {};
  for (const [id, t] of Object.entries(entrada)) {
    const s = porId.get(id);
    if (!s || s.tipo !== 'servico' || !t || typeof t !== 'object') continue;
    const duracao = Number(t.duracao);
    if (!Number.isInteger(duracao) || duracao < 0 || duracao > LIMITE_DURACAO) falha(400, 'duracao', `Duração inválida no serviço ${s.eap}: use de 0 a ${LIMITE_DURACAO} dias.`);
    const ancestrais = new Set();
    for (let p = porId.get(s.paiId); p; p = porId.get(p.paiId)) ancestrais.add(p.id);
    const predecessoras = [];
    for (const p of (Array.isArray(t.predecessoras) ? t.predecessoras : []).slice(0, 50)) {
      if (!p || !porId.has(p.id) || p.id === id) continue;
      if (ancestrais.has(p.id)) falha(400, 'predecessora', `O serviço ${s.eap} não pode depender do próprio grupo (${porId.get(p.id).eap}).`);
      const espera = Number(p.espera || 0);
      if (!Number.isInteger(espera) || Math.abs(espera) > LIMITE_ESPERA) falha(400, 'espera', `Espera inválida no serviço ${s.eap}: use de −${LIMITE_ESPERA} a ${LIMITE_ESPERA} dias.`);
      if (!predecessoras.some((x) => x.id === p.id)) predecessoras.push({ id: p.id, espera });
    }
    if (t.inicioMinimo && !ehData(t.inicioMinimo)) falha(400, 'inicio_minimo', `Data inválida em "não iniciar antes de" no serviço ${s.eap}.`);
    tarefas[id] = { duracao, predecessoras, ...(t.inicioMinimo ? { inicioMinimo: t.inicioMinimo } : {}) };
  }
  return { dataInicio: corpo.dataInicio, calendario: corpo.calendario, feriados: Array.from(new Set(feriados)).sort(), duracaoPadrao, tarefas };
}

// Cria (revisao 0) ou grava o cronograma; quem salvou por último antes de mim faz a gravação voltar
export async function salvar({ env, ctx, params, corpo }) {
  const v = await versaoAtual(env, params.id);
  const nos = estruturaEap(lerJson(v.conteudo, []));
  const config = validarConfig(corpo, nos);
  const res = calcular(nos, config);
  if (res.erros.length) falha(400, 'ciclo', res.erros[0].mensagem + ' Ajuste as predecessoras antes de salvar.');
  const revisao = Number(corpo.revisao) || 0;
  const ts = agora();
  const valores = [config.dataInicio, config.calendario, JSON.stringify(config.feriados), config.duracaoPadrao, JSON.stringify(config.tarefas)];
  const r = revisao
    ? await env.DB.prepare(
      `UPDATE plan_cronogramas SET dataInicio = ?2, calendario = ?3, feriados = ?4, duracaoPadrao = ?5, tarefas = ?6, revisao = revisao + 1,
              atualizadoEm = ?7, atualizadoPorNome = ?8, atualizadoPorEmail = ?9
        WHERE orcamentoId = ?1 AND revisao = ?10`
    ).bind(v.id, ...valores, ts, ctx.nome, ctx.email, revisao).run()
    : await env.DB.prepare(
      `INSERT INTO plan_cronogramas (orcamentoId, dataInicio, calendario, feriados, duracaoPadrao, tarefas, revisao,
              criadoEm, criadoPorNome, atualizadoEm, atualizadoPorNome, atualizadoPorEmail)
       VALUES (?1, ?2, ?3, ?4, ?5, ?6, 1, ?7, ?8, ?7, ?8, ?9) ON CONFLICT(orcamentoId) DO NOTHING`
    ).bind(v.id, ...valores, ts, ctx.nome, ctx.email).run();
  if (!r.meta.changes) {
    const atual = await env.DB.prepare('SELECT atualizadoEm, atualizadoPorNome FROM plan_cronogramas WHERE orcamentoId = ?').bind(v.id).first();
    if (!atual) falha(409, 'sem_cronograma', 'O cronograma desta obra foi excluído por outra pessoa. Recarregue a tela.');
    falha(409, 'conflito', `${revisao ? 'O cronograma foi alterado' : 'O cronograma foi criado'} por ${atual.atualizadoPorNome || 'outra pessoa'} em ${dataHoraBr(atual.atualizadoEm)}. ` +
      'Recarregue para ver a versão atual (suas alterações não foram salvas).');
  }
  await historico(env, ctx, 'cronograma', v.id, revisao ? 'Cronograma alterado' : 'Cronograma criado',
    `Início ${dataBr(config.dataInicio)} · término previsto ${dataBr(res.termino)} · ${res.duracao} dias de trabalho`).run();
  return obter({ env, params });
}

export async function excluir({ env, ctx, params }) {
  const v = await versaoAtual(env, params.id);
  const [c] = await env.DB.batch([
    env.DB.prepare('DELETE FROM plan_cronogramas WHERE orcamentoId = ?').bind(v.id),
    env.DB.prepare('DELETE FROM plan_avancos WHERE orcamentoId = ?').bind(v.id)
  ]);
  if (!c.meta.changes) falha(404, 'sem_cronograma', 'Esta obra não tem cronograma.');
  await historico(env, ctx, 'cronograma', v.id, 'Cronograma excluído', 'Cronograma e apontamentos de avanço removidos').run();
  return json({ ok: true });
}

/* ---------- avanço físico ---------- */
// { data, itens: [{ servicoId, percentual }] }: % executado acumulado de cada serviço na data
export async function apontar({ env, ctx, params, corpo }) {
  const v = await versaoAtual(env, params.id);
  const cronograma = await env.DB.prepare('SELECT dataInicio FROM plan_cronogramas WHERE orcamentoId = ?').bind(v.id).first();
  if (!cronograma) falha(400, 'sem_cronograma', 'Crie o cronograma da obra antes de apontar o avanço.');
  const data = corpo.data;
  if (!ehData(data)) falha(400, 'data', 'Informe a data do apontamento.');
  if (data > hoje()) falha(400, 'data_futura', 'O avanço é apontado até hoje: escolha hoje ou uma data passada.');
  const servicos = new Map(estruturaEap(lerJson(v.conteudo, [])).filter((n) => n.tipo === 'servico').map((n) => [n.id, n]));
  const itens = Array.isArray(corpo.itens) ? corpo.itens : [];
  if (!itens.length) falha(400, 'sem_itens', 'Nenhum serviço com avanço para salvar.');
  if (itens.length > 5000) falha(400, 'itens', 'Apontamento grande demais.');
  const linhas = itens.map((i) => {
    const s = servicos.get(i && i.servicoId);
    if (!s) falha(400, 'servico', 'Serviço que não está na versão atual do orçamento. Recarregue a tela.');
    const p = Number(i.percentual);
    if (!Number.isFinite(p) || p < 0 || p > 100) falha(400, 'percentual', `O executado do serviço ${s.eap} deve ficar entre 0% e 100%.`);
    return { id: uuid(), servicoId: s.id, percentual: arred(p, 2) };
  });
  await env.DB.batch([
    env.DB.prepare(
      `INSERT INTO plan_avancos (id, orcamentoId, servicoId, data, percentual, usuarioEmail, usuarioNome, criadoEm)
       SELECT json_extract(value, '$.id'), ?1, json_extract(value, '$.servicoId'), ?2, json_extract(value, '$.percentual'), ?3, ?4, ?5
         FROM json_each(?6) WHERE true
       ON CONFLICT(orcamentoId, servicoId, data) DO UPDATE SET percentual = excluded.percentual,
         usuarioEmail = excluded.usuarioEmail, usuarioNome = excluded.usuarioNome, criadoEm = excluded.criadoEm`
    ).bind(v.id, data, ctx.email, ctx.nome, agora(), JSON.stringify(linhas)),
    historico(env, ctx, 'cronograma', v.id, 'Avanço apontado', `${linhas.length} serviço(s) em ${dataBr(data)}`)
  ]);
  return obter({ env, params });
}

export async function excluirApontamento({ env, ctx, params }) {
  const v = await versaoAtual(env, params.id);
  if (!ehData(params.data)) falha(400, 'data', 'Data inválida.');
  const r = await env.DB.prepare('DELETE FROM plan_avancos WHERE orcamentoId = ? AND servicoId = ? AND data = ?').bind(v.id, params.servico, params.data).run();
  if (!r.meta.changes) falha(404, 'sem_apontamento', 'Apontamento não encontrado (talvez já excluído).');
  const s = estruturaEap(lerJson(v.conteudo, [])).find((n) => n.id === params.servico);
  await historico(env, ctx, 'cronograma', v.id, 'Apontamento excluído', `${s ? s.eap + ' ' + s.nome : 'Serviço'} em ${dataBr(params.data)}`).run();
  return obter({ env, params });
}

export async function historicoDoCronograma({ env, params }) {
  return json({ historico: (await lerHistorico(env, 'cronograma', params.id)).reverse() });
}
