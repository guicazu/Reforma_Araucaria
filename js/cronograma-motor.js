// Motor do cronograma de obra (módulo ES): calendário de dias úteis ou corridos, caminho crítico
// (CPM) com predecessoras término-início e espera, e avanço físico previsto × realizado ponderado
// pelo valor orçado de cada serviço. O mesmo arquivo roda na tela (js/planejamento.js) e no
// servidor (functions/_lib/planejamento e o painel de Início), para os números baterem.
//
// As tarefas são os serviços da versão atual do orçamento (EAP de functions/_lib/suprimentos/
// orcado.js: unidade › etapa › sub etapa › serviço). O cronograma guarda só o que é dele, por id do
// serviço: duração em dias de trabalho, predecessoras (serviço ou grupo da EAP, com espera em dias)
// e um "não iniciar antes de". Serviço novo no orçamento entra com a duração padrão, depois da etapa
// anterior. Datas em texto ISO (AAAA-MM-DD).

export const DURACAO_PADRAO = 5;
export const CALENDARIOS = { uteis: 'Dias úteis (segunda a sexta)', corridos: 'Dias corridos' };
export const LIMITE_DURACAO = 3650;
export const LIMITE_ESPERA = 365;

const DIA = 86400000;
const tempo = (iso) => Date.UTC(Number(iso.slice(0, 4)), Number(iso.slice(5, 7)) - 1, Number(iso.slice(8, 10)));
const iso = (t) => new Date(t).toISOString().slice(0, 10);
export const ehData = (v) => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(tempo(v)) && iso(tempo(v)) === v;
export const somarDias = (data, n) => iso(tempo(data) + n * DIA);
export const diasEntre = (a, b) => Math.round((tempo(b) - tempo(a)) / DIA);
export const diaDaSemana = (data) => new Date(tempo(data)).getUTCDay();

/* ---------- calendário ---------- */
// Dias de trabalho numerados a partir do início da obra: 0 é o primeiro dia de trabalho na data de
// início ou depois dela. tipo 'uteis' pula sábado e domingo; feriados valem nos dois tipos. Com um
// calendário da tela Calendários (js/feriados.js), opcoes traz os dias da semana trabalhados e os
// dias trabalhados por exceção (ex.: sábado de compensação).
export function criarCalendario(inicio, tipo, feriados, opcoes) {
  const folgas = new Set((feriados || []).filter(ehData));
  const corridos = tipo === 'corridos';
  const semana = new Set(opcoes && Array.isArray(opcoes.diasSemana) && opcoes.diasSemana.length ? opcoes.diasSemana.map(Number)
    : corridos ? [0, 1, 2, 3, 4, 5, 6] : [1, 2, 3, 4, 5]);
  const extras = new Set(((opcoes && opcoes.trabalhados) || []).filter(ehData));
  const trabalha = (d) => extras.has(d) || (!folgas.has(d) && semana.has(diaDaSemana(d)));
  const datas = [];
  let cursor = ehData(inicio) ? inicio : iso(Date.now());
  let voltas = 0;
  function avancar() {
    // proteção contra calendário sem nenhum dia de trabalho (lista de feriados absurda)
    while (!trabalha(cursor)) { cursor = somarDias(cursor, 1); if (++voltas > 200000) throw new Error('Calendário sem dias de trabalho.'); }
    datas.push(cursor);
    cursor = somarDias(cursor, 1);
  }
  const garantirIndice = (i) => { while (datas.length <= i) avancar(); };
  const garantirData = (d) => { if (!datas.length) avancar(); while (datas[datas.length - 1] < d) avancar(); };
  // maior i com datas[i] <= d (busca binária)
  function ultimoAte(d) {
    let a = 0, b = datas.length - 1, r = -1;
    while (a <= b) { const m = (a + b) >> 1; if (datas[m] <= d) { r = m; a = m + 1; } else b = m - 1; }
    return r;
  }
  return {
    tipo: corridos ? 'corridos' : 'uteis',
    semana,
    trabalha,
    // data do i-ésimo dia de trabalho
    data(i) { const n = Math.max(0, Math.floor(i)); garantirIndice(n); return datas[n]; },
    // índice do último dia de trabalho até a data (−1 se for antes do primeiro)
    indiceAte(d) { if (!ehData(d)) return -1; garantirData(d); return ultimoAte(d); },
    // índice do primeiro dia de trabalho na data ou depois dela
    indiceDesde(d) { if (!ehData(d)) return 0; garantirData(d); const i = ultimoAte(d); return i >= 0 && datas[i] === d ? i : i + 1; }
  };
}

/* ---------- estrutura ---------- */
function estrutura(nos) {
  const porId = new Map();
  const filhos = new Map();
  for (const n of nos) {
    porId.set(n.id, n);
    if (n.paiId != null) {
      if (!filhos.has(n.paiId)) filhos.set(n.paiId, []);
      filhos.get(n.paiId).push(n.id);
    }
  }
  const cache = new Map();
  // serviços (folhas) de um nó: o próprio serviço ou todos os serviços abaixo do grupo
  function folhas(id) {
    if (cache.has(id)) return cache.get(id);
    const n = porId.get(id);
    let r = [];
    if (n && n.tipo === 'servico') r = [id];
    else for (const f of filhos.get(id) || []) r = r.concat(folhas(f));
    cache.set(id, r);
    return r;
  }
  return { porId, filhos, folhas };
}

// Sequência inicial: em cada unidade, as etapas uma depois da outra; serviços da mesma etapa em
// paralelo. Etapa sem serviço não entra na corrente.
export function predecessorasPadrao(nos) {
  const { folhas } = estrutura(nos);
  const r = new Map();
  const anteriorDaUnidade = new Map();
  for (const n of nos) {
    if (n.tipo !== 'etapa') continue;
    const servicos = folhas(n.id);
    if (!servicos.length) continue;
    const anterior = anteriorDaUnidade.get(n.paiId);
    for (const s of servicos) r.set(s, anterior ? [{ id: anterior, espera: 0 }] : []);
    anteriorDaUnidade.set(n.paiId, n.id);
  }
  return r;
}

const inteiro = (v, min, max, padrao) => {
  const n = Math.round(Number(v));
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : padrao;
};

// Configuração completa de uma tarefa (a salva ou a padrão para serviço sem configuração)
export function tarefaDe(config, servicoId, padrao) {
  const c = config && config.tarefas ? config.tarefas[servicoId] : null;
  return {
    duracao: c ? inteiro(c.duracao, 0, LIMITE_DURACAO, DURACAO_PADRAO) : inteiro(config && config.duracaoPadrao, 0, LIMITE_DURACAO, DURACAO_PADRAO),
    predecessoras: (c ? c.predecessoras : padrao.get(servicoId)) || [],
    inicioMinimo: c && ehData(c.inicioMinimo) ? c.inicioMinimo : null,
    novo: !c
  };
}

/* ---------- cálculo (CPM) ---------- */
// Kahn na ordem dada; usar(de, para) diz se a aresta conta
function ordenar(ids, entradas, saidas, usar) {
  const grau = new Map(ids.map((id) => [id, entradas.get(id).filter((a) => usar(a.de, id)).length]));
  const fila = ids.filter((id) => !grau.get(id));
  const ordem = [];
  for (let i = 0; i < fila.length; i++) {
    const id = fila[i];
    ordem.push(id);
    for (const a of saidas.get(id) || []) {
      if (!usar(id, a.para)) continue;
      grau.set(a.para, grau.get(a.para) - 1);
      if (!grau.get(a.para)) fila.push(a.para);
    }
  }
  return ordem;
}
// Componentes fortemente conexos com mais de um serviço (Tarjan): Map id -> número do ciclo
function emCiclo(ids, saidas) {
  const dentro = new Set(ids);
  const indice = new Map(), baixo = new Map(), pilha = [], naPilha = new Set();
  const componente = new Map();
  let contador = 0, ciclos = 0;
  function visitar(v) {
    indice.set(v, contador); baixo.set(v, contador); contador++;
    pilha.push(v); naPilha.add(v);
    for (const a of saidas.get(v) || []) {
      const w = a.para;
      if (!dentro.has(w)) continue;
      if (!indice.has(w)) { visitar(w); baixo.set(v, Math.min(baixo.get(v), baixo.get(w))); }
      else if (naPilha.has(w)) baixo.set(v, Math.min(baixo.get(v), indice.get(w)));
    }
    if (baixo.get(v) === indice.get(v)) {
      const grupo = [];
      let w;
      do { w = pilha.pop(); naPilha.delete(w); grupo.push(w); } while (w !== v);
      if (grupo.length > 1) { ciclos++; for (const x of grupo) componente.set(x, ciclos); }
    }
  }
  for (const v of ids) if (!indice.has(v)) visitar(v);
  return componente;
}

// nos: EAP da versão atual; config: { dataInicio, calendario, feriados, duracaoPadrao, tarefas }.
// Devolve as datas e folgas de cada serviço, as datas de cada grupo, início e término da obra, os
// pesos (valor orçado; duração quando o orçamento não tem valores) e os erros (ciclos).
export function calcular(nos, config) {
  const { porId, folhas } = estrutura(nos);
  const cal = criarCalendario(config.dataInicio, config.calendario, config.feriados, { diasSemana: config.diasSemana, trabalhados: config.trabalhados });
  const servicos = nos.filter((n) => n.tipo === 'servico');
  const padrao = predecessorasPadrao(nos);
  const tarefas = new Map();
  for (const s of servicos) {
    const t = tarefaDe(config, s.id, padrao);
    t.predecessoras = t.predecessoras
      .filter((p) => p && porId.has(p.id) && p.id !== s.id)
      .map((p) => ({ id: p.id, espera: inteiro(p.espera, -LIMITE_ESPERA, LIMITE_ESPERA, 0) }));
    t.id = s.id;
    t.minimo = t.inicioMinimo ? cal.indiceDesde(t.inicioMinimo) : 0;
    tarefas.set(s.id, t);
  }
  // arestas entre serviços: predecessora em grupo vale para todos os serviços dele
  const entradas = new Map();
  const saidas = new Map();
  for (const t of tarefas.values()) {
    const lista = [];
    for (const p of t.predecessoras) {
      for (const f of folhas(p.id)) if (f !== t.id && tarefas.has(f)) lista.push({ de: f, espera: p.espera });
    }
    entradas.set(t.id, lista);
    for (const a of lista) {
      if (!saidas.has(a.de)) saidas.set(a.de, []);
      saidas.get(a.de).push({ para: t.id, espera: a.espera });
    }
  }
  // ordem topológica na ordem da EAP (Kahn). Se houver ciclo, as arestas dentro dele são ignoradas
  // (o resto do cronograma continua calculado) e o ciclo vira aviso
  const ids = servicos.map((s) => s.id);
  let usar = () => true;
  let ordem = ordenar(ids, entradas, saidas, usar);
  const erros = [];
  if (ordem.length < ids.length) {
    const feitos = new Set(ordem);
    const componente = emCiclo(ids.filter((id) => !feitos.has(id)), saidas);
    usar = (de, para) => !(componente.has(de) && componente.get(de) === componente.get(para));
    ordem = ordenar(ids, entradas, saidas, usar);
    erros.push({ tipo: 'ciclo', ids: Array.from(componente.keys()),
      mensagem: 'Predecessoras em círculo (uma depende da outra): ' + Array.from(componente.keys()).map((id) => porId.get(id).eap).join(', ') + '.' });
  }
  // ida: início mais cedo; volta: término mais tarde
  for (const id of ordem) {
    const t = tarefas.get(id);
    let es = t.minimo;
    for (const a of entradas.get(id)) if (usar(a.de, id)) es = Math.max(es, tarefas.get(a.de).ef + 1 + a.espera);
    t.es = Math.max(0, es);
    t.ef = t.es + t.duracao - 1;
  }
  // último dia de trabalho da obra (marco, de duração zero, acontece no início do dia: não estica)
  const fim = tarefas.size ? Math.max(...Array.from(tarefas.values()).map((t) => t.ef)) : 0;
  for (const id of ordem.slice().reverse()) {
    const t = tarefas.get(id);
    let lf = fim;
    for (const a of saidas.get(id) || []) if (usar(id, a.para)) lf = Math.min(lf, tarefas.get(a.para).ls - 1 - a.espera);
    t.lf = lf;
    t.ls = lf - t.duracao + 1;
    t.folga = Math.max(0, t.ls - t.es);
    t.critico = t.ls - t.es <= 0;
    t.inicio = cal.data(t.es);
    t.termino = t.duracao > 0 ? cal.data(t.ef) : t.inicio;
  }
  // pesos: valor orçado do serviço; sem valores no orçamento, a duração
  const comValor = servicos.some((s) => s.valor > 0);
  for (const s of servicos) {
    const t = tarefas.get(s.id);
    t.peso = comValor ? Math.max(0, s.valor || 0) : Math.max(1, t.duracao);
  }
  // grupos: do primeiro início ao último término dos serviços abaixo
  const grupos = new Map();
  for (const n of nos) {
    if (n.tipo === 'servico') continue;
    const fs = folhas(n.id).map((id) => tarefas.get(id)).filter(Boolean);
    if (!fs.length) { grupos.set(n.id, null); continue; }
    const es = Math.min(...fs.map((t) => t.es));
    const ef = Math.max(...fs.map((t) => Math.max(t.ef, t.es - 1)));
    grupos.set(n.id, { es, ef, inicio: cal.data(es), termino: cal.data(Math.max(es, ef)), duracao: Math.max(0, ef - es + 1),
      critico: fs.some((t) => t.critico), peso: fs.reduce((s, t) => s + t.peso, 0) });
  }
  const lista = Array.from(tarefas.values());
  const inicioIdx = lista.length ? Math.min(...lista.map((t) => t.es)) : 0;
  // (só marcos no início: fim = −1, duração zero)
  return {
    calendario: cal, tarefas, grupos, erros, folhas,
    inicio: cal.data(inicioIdx),
    termino: cal.data(Math.max(inicioIdx, fim)),
    duracao: lista.length ? fim - inicioIdx + 1 : 0,
    pesoTotal: lista.reduce((s, t) => s + t.peso, 0),
    criticos: lista.filter((t) => t.critico).length,
    novos: lista.filter((t) => t.novo).length
  };
}

/* ---------- avanço físico ---------- */
// Fração prevista de um serviço até o fim do dia: distribuição linear nos dias de trabalho
export function previstoDaTarefa(t, indiceAte) {
  if (t.duracao <= 0) return indiceAte >= t.es ? 1 : 0;
  return Math.min(1, Math.max(0, (indiceAte - t.es + 1) / t.duracao));
}

// Apontamentos [{ servicoId, data, percentual }] -> Map servicoId -> [[data, fração]] em ordem de data
export function indexarAvancos(avancos) {
  const m = new Map();
  for (const a of avancos || []) {
    if (!ehData(a.data)) continue;
    if (!m.has(a.servicoId)) m.set(a.servicoId, []);
    m.get(a.servicoId).push([a.data, Math.min(1, Math.max(0, Number(a.percentual) / 100 || 0))]);
  }
  for (const l of m.values()) l.sort((x, y) => (x[0] < y[0] ? -1 : x[0] > y[0] ? 1 : 0));
  return m;
}
// Fração executada do serviço na data: o último apontamento até ela
export function realizadoDaTarefa(indice, servicoId, data) {
  const l = indice.get(servicoId);
  if (!l) return 0;
  let r = 0;
  for (const [d, f] of l) { if (d > data) break; r = f; }
  return r;
}

// Previsto e realizado (0 a 1) de toda a obra, ou só dos serviços de um grupo, na data
export function avancoEm(res, indice, data, grupoId) {
  const ids = grupoId ? res.folhas(grupoId) : Array.from(res.tarefas.keys());
  const ate = res.calendario.indiceAte(data);
  let peso = 0, previsto = 0, realizado = 0;
  for (const id of ids) {
    const t = res.tarefas.get(id);
    if (!t || !(t.peso > 0)) continue;
    peso += t.peso;
    previsto += t.peso * previstoDaTarefa(t, ate);
    realizado += t.peso * realizadoDaTarefa(indice, id, data);
  }
  return { previsto: peso ? previsto / peso : 0, realizado: peso ? realizado / peso : 0, peso };
}

// Datas da curva S: do início ao término (ou até hoje, se passar), por semana ou por mês
export function datasDaCurva(inicio, termino, hoje) {
  const fim = hoje && hoje > termino ? hoje : termino;
  const dias = Math.max(0, diasEntre(inicio, fim));
  const datas = [somarDias(inicio, -1)];
  if (dias <= 200) {
    for (let d = somarDias(inicio, 6); d < fim; d = somarDias(d, 7)) datas.push(d);
  } else {
    let [a, m] = [Number(inicio.slice(0, 4)), Number(inicio.slice(5, 7))];
    for (;;) {
      const ultimo = iso(Date.UTC(a, m, 0));
      if (ultimo >= fim) break;
      if (ultimo >= inicio) datas.push(ultimo);
      m += 1;
      if (m > 12) { m = 1; a += 1; }
    }
  }
  datas.push(fim);
  if (hoje && hoje > inicio && hoje < fim && !datas.includes(hoje)) datas.push(hoje);
  return Array.from(new Set(datas)).sort();
}

// Curva S: [{ data, previsto, realizado }] em %; realizado só até hoje
export function curvaS(res, avancos, hoje) {
  const indice = indexarAvancos(avancos);
  return datasDaCurva(res.inicio, res.termino, hoje).map((data) => {
    const a = avancoEm(res, indice, data);
    return { data, previsto: a.previsto * 100, realizado: !hoje || data <= hoje ? a.realizado * 100 : null };
  });
}

/* ---------- predecessoras em texto (tela) ---------- */
// "3.1, 3.2.1+2, 4.1.1-1": códigos da EAP com espera opcional em dias
export function lerPredecessoras(texto, idDoCodigo) {
  const lista = [];
  const erros = [];
  for (const parte of String(texto || '').split(/[;,\s]+/).filter(Boolean)) {
    const m = parte.match(/^([\d.]+?)([+-]\d+)?$/);
    const id = m ? idDoCodigo(m[1].replace(/\.$/, '')) : null;
    if (!id) { erros.push(parte); continue; }
    if (!lista.some((p) => p.id === id)) lista.push({ id, espera: m[2] ? Number(m[2]) : 0 });
  }
  return { lista, erros };
}
export function escreverPredecessoras(lista, codigoDoId) {
  return (lista || []).map((p) => {
    const c = codigoDoId(p.id);
    if (!c) return '';
    return c + (p.espera ? (p.espera > 0 ? '+' : '') + p.espera : '');
  }).filter(Boolean).join(', ');
}
