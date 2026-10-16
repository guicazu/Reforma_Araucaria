/* Planejamento: cronograma de cada obra montado sobre a EAP da versão atual do orçamento (cada
   serviço é uma tarefa), com caminho crítico, Gantt, apontamento do avanço físico e curva S
   previsto × realizado. Grava no servidor (/api/planejamento); as contas são as de
   js/cronograma-motor.js, as mesmas do servidor e do Início. Editar pede a permissão de editar
   Planejamento (Usuários › Editar permissões); o servidor confere de novo. */
import * as M from './cronograma-motor.js';
import * as F from './feriados.js';

const S = window.Supr;
const G = window.Graficos;
const api = (metodo, caminho, corpo) => S.api(metodo, caminho, corpo, { base: '/api/planejamento/' });
const ESCALAS = [['auto', 'Ajustar'], ['dia', 'Dias'], ['semana', 'Semanas'], ['mes', 'Meses']];
const PX_DIA = { dia: 24, semana: 7, mes: 2.4 };
const COLUNAS_ESQUERDA = 910; // largura das colunas antes do Gantt (css/planejamento.css)
const MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];

const estado = {
  tela: 'lista', lista: null, obraId: null,
  dados: null,                 // GET obras/:id (obra, eap, cronograma, avancos, hoje)
  config: null, sujo: false,   // cronograma em edição
  calendario: null,            // calendário de trabalho escolhido (tela Calendários)
  res: null, indice: null,     // cálculo do motor e apontamentos indexados
  modo: 'cronograma', escala: 'auto', soCriticos: false, recolhidos: new Set(),
  dataApont: null, apont: new Map(), // avanço digitado e ainda não salvo (servicoId -> %)
  linhaTempo: null
};
let area = null;
const esc = S.esc;
const podeEditar = () => (window.Permissoes ? window.Permissoes.pode('planejamento', 'editar') : false);
const dataCurta = (iso) => (iso ? iso.slice(8, 10) + '/' + iso.slice(5, 7) + '/' + iso.slice(2, 4) : '—');
const pct = (v) => S.pct(Math.round(v * 10) / 10);
const dias = (n) => n + (estado.calendario ? (n === 1 ? ' dia de trabalho' : ' dias de trabalho')
  : estado.config && estado.config.calendario === 'corridos' ? (n === 1 ? ' dia' : ' dias') : (n === 1 ? ' dia útil' : ' dias úteis'));

function titulo(t, sub) {
  document.getElementById('planTitulo').textContent = t;
  document.getElementById('planSubtitulo').textContent = sub || '';
}

/* ---------- lista de obras ---------- */
function situacao(o) {
  if (!o.temCronograma) return S.tag('Sem cronograma', 'cinza');
  if (o.erros && o.erros.length) return S.tag('Predecessoras em círculo', 'vermelho', o.erros[0]);
  const desvio = o.realizado - o.previsto;
  if (o.realizado >= 99.95) return S.tag('Concluída', 'verde');
  if (desvio <= -5) return S.tag('Atrasada ' + pct(-desvio).replace('%', ' p.p.'), 'vermelho');
  if (!o.previsto && !o.realizado) return S.tag('Não iniciada', 'cinza');
  return S.tag(desvio >= 5 ? 'Adiantada' : 'No prazo', 'verde');
}

async function abrirLista() {
  estado.tela = 'lista';
  titulo('Planejamento', 'Cronograma e avanço físico das obras');
  area.innerHTML = S.carregando();
  try {
    estado.lista = await api('GET', 'obras');
  } catch (e) {
    area.innerHTML = '<div class="supr-nota erro">' + esc(e.message) + '</div>';
    return;
  }
  const editar = podeEditar();
  area.innerHTML = '<p class="supr-nota">Cada serviço do orçamento é uma tarefa do cronograma: defina a duração e o que precisa terminar antes, ' +
    'e aponte o % executado para acompanhar o avanço físico previsto × realizado.</p>' +
    S.tabela([
      { t: 'Obra', v: (o) => (o.codigo ? '<b>' + esc(o.codigo) + '</b> ' : '') + esc(o.nome) + '<small>Versão V' + o.versao + ' do orçamento</small>' },
      { t: 'Início', v: (o) => (o.temCronograma ? S.data(o.inicio) : '—'), c: 'nowrap' },
      { t: 'Término previsto', v: (o) => (o.temCronograma ? S.data(o.termino) + '<small>' + esc(o.duracao + ' dias de trabalho') + '</small>' : '—'), c: 'nowrap' },
      { t: 'Previsto hoje', v: (o) => (o.temCronograma ? pct(o.previsto) : '—'), c: 'num' },
      { t: 'Realizado', v: (o) => (o.temCronograma ? pct(o.realizado) : '—'), c: 'num' },
      { t: 'Situação', v: (o) => situacao(o) + (o.novos ? '<small>' + esc(o.novos + ' serviço(s) novo(s) no orçamento') + '</small>' : '') },
      { t: '', v: (o) => (!o.temCronograma && editar ? S.botao('criar', 'Criar cronograma', { icone: 'mais', dados: 'data-obra="' + esc(o.id) + '"' }) : ''), c: 'acoes' }
    ], estado.lista.obras, { id: (o) => o.id, vazio: 'Nenhum orçamento cadastrado. O cronograma é montado sobre a EAP do orçamento.' });
}

/* ---------- uma obra ---------- */
function reiniciarCronograma() {
  const c = estado.dados.cronograma;
  estado.config = c ? JSON.parse(JSON.stringify({ dataInicio: c.dataInicio, calendario: c.calendario, calendarioId: c.calendarioId || null,
    feriados: c.feriados, duracaoPadrao: c.duracaoPadrao, tarefas: c.tarefas })) : null;
  estado.calendario = estado.dados.calendario || null;
  estado.sujo = false;
  recalcular();
}
function reiniciarAvanco() {
  estado.apont = new Map();
  estado.dataApont = estado.dados.hoje;
  estado.indice = M.indexarAvancos(estado.dados.avancos);
}
// Horas de mão de obra de cada serviço no orçamento (oficial principal e ajudante), como o motor usa
function maoParaMotor() {
  return Object.fromEntries(Object.entries(estado.dados.maoDeObra || {}).map(([sid, m]) =>
    [sid, { oficial: m.oficial ? m.oficial.horas : 0, ajudante: m.ajudante ? m.ajudante.horas : 0 }]));
}
function recalcular() {
  estado.res = estado.config ? M.calcular(estado.dados.eap, { ...F.aplicarCalendario(estado.config, estado.calendario), mao: maoParaMotor() }) : null;
  estado.indice = M.indexarAvancos(estado.dados.avancos);
  numerarLinhas();
}
// Nº de cada linha (grupos com serviço e serviços, na ordem da EAP): é por ele que se indicam as predecessoras
function numerarLinhas() {
  estado.linha = new Map();
  estado.porLinha = new Map();
  if (!estado.res) return;
  let n = 0;
  for (const no of estado.dados.eap) {
    if (no.tipo !== 'servico' && !estado.res.grupos.get(no.id)) continue;
    n++;
    estado.linha.set(no.id, n);
    estado.porLinha.set(n, no.id);
  }
}
const linhaDe = (id) => (estado.linha && estado.linha.get(id)) || '';
const escreverPred = (lista) => (lista || []).map((p) => {
  const l = linhaDe(p.id);
  return l ? l + (p.espera ? (p.espera > 0 ? '+' : '') + p.espera : '') : '';
}).filter(Boolean).join('; ');
const horasTxt = (h) => (Math.round(h * 10) / 10).toLocaleString('pt-BR') + ' h';

async function abrirObra(id, op) {
  estado.tela = 'obra';
  const outra = estado.obraId !== id;
  if (outra || !estado.dados || (!estado.sujo && !estado.apont.size)) {
    if (outra) { estado.recolhidos = new Set(); estado.modo = 'cronograma'; }
    estado.obraId = id;
    area.innerHTML = S.carregando();
    try {
      estado.dados = await api('GET', 'obras/' + encodeURIComponent(id));
    } catch (e) {
      area.innerHTML = '<button type="button" class="supr-voltar" data-acao="voltar">' + S.ic('voltar') + 'Voltar para a lista</button>' +
        '<div class="supr-nota erro">' + esc(e.message) + '</div>';
      return;
    }
    reiniciarCronograma();
    reiniciarAvanco();
  }
  renderObra();
  if (op && op.criar && !estado.dados.cronograma && podeEditar()) configurar(true);
}

const noDe = (id) => estado.dados.eap.find((n) => n.id === id);
const servicos = () => estado.dados.eap.filter((n) => n.tipo === 'servico');

function cartao(rotulo, valor, det, classe, alerta) {
  return '<div class="supr-card' + (classe ? ' ' + classe : '') + '"><span class="rotulo">' + esc(rotulo) + '</span><span class="valor">' + valor + '</span>' +
    (alerta ? '<span class="plan-alerta">' + S.ic('alerta', 'ic-sm') + esc(alerta) + '</span>' : '') + '<span class="det">' + det + '</span></div>';
}

function renderObra() {
  const d = estado.dados;
  titulo((d.obra.codigo ? d.obra.codigo + ' — ' : '') + d.obra.nome, 'Cronograma sobre a versão V' + d.obra.versao + ' do orçamento');
  let h = '<button type="button" class="supr-voltar" data-acao="voltar">' + S.ic('voltar') + 'Voltar para a lista</button>';
  if (!estado.config) {
    area.innerHTML = h + '<div class="supr-vazio"><strong>Esta obra ainda não tem cronograma</strong>' +
      'Cada serviço do orçamento vira uma tarefa. O cronograma começa com as etapas uma depois da outra e os serviços de cada etapa em paralelo; depois é só ajustar.' +
      (podeEditar() ? '<div style="margin-top:14px">' + S.botao('configurar', 'Criar cronograma', { primario: true, icone: 'mais' }) + '</div>'
        : '<div style="margin-top:10px">Peça a quem edita o Planejamento para criar o cronograma.</div>') + '</div>';
    return;
  }
  const r = estado.res;
  const a = M.avancoEm(r, estado.indice, d.hoje);
  const desvio = (a.realizado - a.previsto) * 100;
  const c = d.cronograma;
  h += '<div class="supr-cab"><div><h3>Cronograma</h3><p>' + (estado.calendario ? 'Calendário ' + esc(estado.calendario.nome)
      : esc(M.CALENDARIOS[estado.config.calendario])) +
    (estado.config.feriados.length ? ' · ' + estado.config.feriados.length + (estado.calendario ? ' dia(s) parado(s) desta obra' : ' feriado(s)') : '') +
    (c ? ' · atualizado por ' + esc(c.atualizadoPorNome || '—') + ' em ' + esc(S.dataHora(c.atualizadoEm)) : '') + '</p></div>' +
    '<div class="supr-acoes">' + S.botao('historico', 'Histórico', { icone: 'relogio' }) + S.botao('csv', 'Exportar CSV', { icone: 'planilha' }) +
    (podeEditar() ? S.botao('configurar', 'Configurar', { icone: 'opcoes' }) + S.botao('excluir', 'Excluir', { icone: 'excluir', perigo: true }) : '') + '</div></div>';
  h += '<div class="supr-cards">' +
    cartao('Início', S.data(r.inicio), 'primeiro serviço') +
    cartao('Término previsto', S.data(r.termino), esc(dias(r.duracao))) +
    cartao('Previsto para hoje', pct(a.previsto * 100), 'pelo cronograma') +
    cartao('Realizado', pct(a.realizado * 100), 'pelos apontamentos de avanço') +
    cartao('Desvio', (desvio > 0 ? '+' : '') + pct(desvio).replace('%', ' p.p.'), desvio <= -5 ? '' : 'realizado − previsto', '', desvio <= -5 ? 'Obra atrasada' : '') +
    cartao('Caminho crítico', String(r.criticos), r.criticos === 1 ? 'serviço sem folga' : 'serviços sem folga') + '</div>';
  h += '<div data-avisos>' + avisos() + '</div>';
  h += '<div class="supr-barra">' + S.chips([['cronograma', 'Cronograma'], ['avanco', 'Avanço físico'], ['curva', 'Curva S']], estado.modo, 'modo') + '</div>';
  h += '<div data-modo-corpo></div>';
  area.innerHTML = h;
  renderModo();
}

function avisos() {
  const r = estado.res;
  let h = '';
  for (const e of r.erros) h += '<p class="supr-nota erro">' + esc(e.mensagem) + ' Ajuste as predecessoras: o cronograma só é salvo sem círculos.</p>';
  if (r.novos) {
    h += '<p class="supr-nota alerta">' + r.novos + ' serviço(s) do orçamento ainda sem planejamento entraram com ' + esc(dias(estado.config.duracaoPadrao)) +
      ', depois da etapa anterior (marcados como “novo”). Revise e salve o cronograma.</p>';
  }
  return h;
}
function atualizarAvisos() {
  const el = area.querySelector('[data-avisos]');
  if (el) el.innerHTML = avisos();
}

function renderModo() {
  const el = area.querySelector('[data-modo-corpo]');
  if (!el) return;
  G.dica.esconder();
  if (estado.modo === 'avanco') el.innerHTML = htmlAvanco();
  else if (estado.modo === 'curva') { el.innerHTML = htmlCurva(); desenharCurva(); }
  else el.innerHTML = htmlCronograma();
}

/* ---------- linhas da EAP (com recolher e filtro) ---------- */
function linhasVisiveis() {
  const eap = estado.dados.eap;
  const porId = new Map(eap.map((n) => [n.id, n]));
  const oculto = (n) => { for (let p = porId.get(n.paiId); p; p = porId.get(p.paiId)) if (estado.recolhidos.has(p.id)) return true; return false; };
  let lista = eap.filter((n) => !oculto(n));
  if (estado.soCriticos) {
    const manter = new Set();
    for (const [id, t] of estado.res.tarefas) {
      if (!t.critico) continue;
      for (let n = porId.get(id); n; n = porId.get(n.paiId)) manter.add(n.id);
    }
    lista = lista.filter((n) => manter.has(n.id));
  }
  return lista.filter((n) => n.tipo === 'servico' || estado.res.grupos.get(n.id));
}
const nivelClasse = (n) => (n.tipo === 'servico' ? 'servico' : 'grupo n' + n.nivel);
function botaoRecolher(n) {
  if (n.tipo === 'servico') return '';
  const fechado = estado.recolhidos.has(n.id);
  return '<button type="button" class="plan-abrir" data-acao="recolher" data-id="' + esc(n.id) + '" aria-expanded="' + !fechado + '" aria-label="' +
    (fechado ? 'Mostrar' : 'Esconder') + ' os itens de ' + esc(n.eap) + '">' + S.ic(fechado ? 'seta-dir' : 'seta-baixo', 'ic-sm') + '</button>';
}

/* ---------- modo cronograma (tabela + Gantt) ---------- */
function linhaDoTempo() {
  const r = estado.res, hoje = estado.dados.hoje;
  const a = r.inicio < hoje ? r.inicio : hoje;
  const b = r.termino > hoje ? r.termino : hoje;
  const inicio = a.slice(0, 8) + '01';
  const [ab, mb] = [Number(b.slice(0, 4)), Number(b.slice(5, 7))];
  const fim = new Date(Date.UTC(ab, mb, 0)).toISOString().slice(0, 10);
  const total = M.diasEntre(inicio, fim) + 1;
  let px = PX_DIA[estado.escala];
  if (!px) {
    const livre = Math.max(360, (area.clientWidth || 1100) - COLUNAS_ESQUERDA - 24);
    px = Math.min(24, Math.max(1.2, livre / total));
  }
  return { inicio, fim, total, px, largura: Math.ceil(total * px) };
}
function cabecalhoTempo(lt) {
  let h = '';
  const [a, m] = [Number(lt.inicio.slice(0, 4)), Number(lt.inicio.slice(5, 7))];
  for (let k = 0; ; k++) {
    const d = new Date(Date.UTC(a, m - 1 + k, 1)).toISOString().slice(0, 10);
    if (d > lt.fim) break;
    const ultimo = new Date(Date.UTC(a, m + k, 0)).toISOString().slice(0, 10);
    const x = M.diasEntre(lt.inicio, d) * lt.px;
    const w = (M.diasEntre(d, ultimo) + 1) * lt.px;
    const rotulo = w >= 44 ? MESES[Number(d.slice(5, 7)) - 1] + '/' + d.slice(2, 4) : w >= 16 ? MESES[Number(d.slice(5, 7)) - 1].charAt(0) : '';
    h += '<span class="plan-mes" style="left:' + x.toFixed(1) + 'px;width:' + w.toFixed(1) + 'px">' + rotulo + '</span>';
  }
  const xh = (M.diasEntre(lt.inicio, estado.dados.hoje) + 0.5) * lt.px;
  return h + '<span class="plan-hoje-rotulo" style="left:' + xh.toFixed(1) + 'px">hoje</span>';
}
// Fundo das linhas: semanas (e fins de semana na escala de dias)
function fundoTempo(lt) {
  const deslocamento = ((8 - M.diaDaSemana(lt.inicio)) % 7) * lt.px; // segunda-feira
  const semana = 7 * lt.px;
  const camadas = [];
  if (lt.px >= 12 && estado.config.calendario === 'uteis') {
    camadas.push('repeating-linear-gradient(to right,transparent 0,transparent ' + (5 * lt.px) + 'px,#f6f6f7 ' + (5 * lt.px) + 'px,#f6f6f7 ' + semana + 'px)');
  }
  if (lt.px >= 4) camadas.push('repeating-linear-gradient(to right,var(--linha) 0,var(--linha) 1px,transparent 1px,transparent ' + semana + 'px)');
  return camadas.length ? 'background-image:' + camadas.join(',') + ';background-position-x:' + deslocamento.toFixed(1) + 'px' : '';
}
function barraHtml(n, lt) {
  const r = estado.res;
  const xDe = (iso) => M.diasEntre(lt.inicio, iso) * lt.px;
  if (n.tipo !== 'servico') {
    const g = r.grupos.get(n.id);
    const x = xDe(g.inicio), w = Math.max(lt.px, (M.diasEntre(g.inicio, g.termino) + 1) * lt.px);
    return '<span class="plan-resumo" style="left:' + x.toFixed(1) + 'px;width:' + w.toFixed(1) + 'px"></span>';
  }
  const t = r.tarefas.get(n.id);
  const exec = M.realizadoDaTarefa(estado.indice, n.id, estado.dados.hoje);
  if (t.duracao === 0) {
    return '<span class="plan-marco' + (t.critico ? ' critico' : '') + '" data-dica-plan="' + esc(n.id) + '" style="left:' + xDe(t.inicio).toFixed(1) + 'px"></span>';
  }
  const x = xDe(t.inicio), w = Math.max(2, (M.diasEntre(t.inicio, t.termino) + 1) * lt.px);
  return '<span class="plan-barra' + (t.critico ? ' critico' : '') + '" data-dica-plan="' + esc(n.id) + '" style="left:' + x.toFixed(1) + 'px;width:' + w.toFixed(1) + 'px">' +
    '<span class="plan-exec" style="width:' + (exec * 100).toFixed(1) + '%"></span></span>';
}
// Equipe da atividade: oficiais e ajudantes. Papel que a composição não tem fica 0; os ajudantes
// acompanham os oficiais na proporção das horas, a não ser que tenham sido digitados
function equipeHtml(n, t, editar) {
  if (!t.mao) return '<span class="plan-eq-vazio" title="Sem mão de obra na composição do orçamento: a duração é digitada">—</span>';
  const m = (estado.dados.maoDeObra || {})[n.id] || {};
  const p = M.equipePadrao(t.mao);
  const proporcao = t.mao.oficial > 0 && t.mao.ajudante > 0 ? 'proporção ' + p.oficiais + ' oficial(is) : ' + p.ajudantes + ' ajudante(s)' : '';
  const campo = (k, papel, rotulo) => {
    if (!(t.mao[papel] > 0)) return '<span class="plan-eq-zero" title="Sem ' + papel + ' na composição">0</span>';
    const define = t.modo === 'equipe' && t.base === papel;
    const abaixo = k === 'ajudantes' && t.ajudantesFixos && t.ajudantes < t.ajudantesProporcao;
    const dica = rotulo + ' (' + (m[papel] ? m[papel].nome : papel) + ')' + (define ? ' — define a duração' : '') +
      (k === 'ajudantes' && t.mao.oficial > 0 ? (t.ajudantesFixos ? ' — digitado' + (abaixo ? '; abaixo da ' + proporcao + ' (seriam ' + t.ajudantesProporcao + ')' : '')
        : ' — pela ' + proporcao + '; digite para fixar') : '');
    const classes = [define ? 'base' : '', abaixo ? 'abaixo' : '', k === 'ajudantes' && t.mao.oficial > 0 && !t.ajudantesFixos ? 'derivado' : ''].filter(Boolean).join(' ');
    return editar ? '<input type="number" min="1" max="' + M.LIMITE_EQUIPE + '" step="1" inputmode="numeric" data-campo="' + k + '" value="' + t[k] + '" title="' + esc(dica) +
      '" aria-label="' + esc(rotulo + ' em ' + n.eap) + '"' + (classes ? ' class="' + classes + '"' : '') + '>'
      : '<span title="' + esc(dica) + '"' + (abaixo ? ' class="abaixo"' : '') + '>' + t[k] + '</span>';
  };
  return '<span class="plan-equipe">' + campo('oficiais', 'oficial', 'Oficiais') + campo('ajudantes', 'ajudante', 'Ajudantes') + '</span>';
}
// Horas de mão de obra do serviço no orçamento (a que decide a duração em destaque)
function maoHtml(n, t) {
  const m = (estado.dados.maoDeObra || {})[n.id];
  if (!m || (!m.oficial && !m.ajudante)) return '<span class="plan-eq-vazio">—</span>';
  const principal = m.oficial || m.ajudante;
  const partes = [m.oficial ? 'Oficial: ' + m.oficial.nome + ' ' + horasTxt(m.oficial.horas) : '', m.ajudante ? 'Ajudante: ' + m.ajudante.nome + ' ' + horasTxt(m.ajudante.horas) : '',
    ...(m.apoio || []).map((a) => 'Apoio: ' + a.nome + ' ' + horasTxt(a.horas))].filter(Boolean);
  return '<span class="plan-mao" title="' + esc(partes.join('\n')) + '"><b>' + horasTxt(principal.horas) + '</b> ' + esc(principal.nome) + '</span>';
}
// Duração: calculada pela equipe (texto claro) ou digitada; com mão de obra, ↺ volta ao cálculo
function duracaoHtml(n, t, editar) {
  const dica = t.modo === 'equipe' ? horasTxt(t.horas) + ' (' + t.base + ') ÷ horas de cada dia de trabalho' : 'Duração digitada (dias de trabalho)';
  if (!editar) return '<span title="' + esc(dica) + '"' + (t.modo === 'equipe' ? ' class="plan-auto"' : '') + '>' + t.duracao + '</span>';
  return '<input type="number" min="0" max="' + M.LIMITE_DURACAO + '" step="1" inputmode="numeric" data-campo="duracao" value="' + t.duracao + '"' +
    (t.modo === 'equipe' ? ' class="plan-auto"' : '') + ' title="' + esc(dica + (t.modo === 'equipe' ? '. Digitar uma duração deixa o serviço manual.' : '')) +
    '" aria-label="Duração de ' + esc(n.eap) + ' em dias">' +
    (t.mao && t.modo !== 'equipe' ? '<button type="button" class="plan-recalc" data-acao="auto" data-id="' + esc(n.id) + '" title="Calcular pela equipe e horas de mão de obra">↺</button>' : '');
}
function folgaHtml(t) {
  if (t.critico) return '<span class="st st-vermelho" title="Folga zero: atrasar este serviço atrasa a obra">Crítico</span>';
  return t.folga + (t.folga === 1 ? ' dia' : ' dias');
}
function htmlCronograma() {
  const r = estado.res;
  const editar = podeEditar();
  const lt = linhaDoTempo();
  estado.linhaTempo = lt;
  const codigo = (id) => { const n = noDe(id); return n ? n.eap : ''; };
  const fundo = fundoTempo(lt);
  const xHoje = ((M.diasEntre(lt.inicio, estado.dados.hoje) + 0.5) * lt.px).toFixed(1);
  const linhas = linhasVisiveis().map((n) => {
    const tl = '<td class="c-tl"><div class="plan-tl" style="width:' + lt.largura + 'px;' + fundo + '"><span class="plan-hoje" style="left:' + xHoje + 'px"></span>' + barraHtml(n, lt) + '</div></td>';
    const lin = '<td class="c-lin">' + linhaDe(n.id) + '</td>';
    if (n.tipo !== 'servico') {
      const g = r.grupos.get(n.id);
      return '<tr class="plan-linha ' + nivelClasse(n) + '" data-id="' + esc(n.id) + '">' + lin + '<td class="c-eap">' + botaoRecolher(n) + esc(n.eap) + '</td>' +
        '<td class="c-nome">' + esc(n.nome) + '</td><td class="c-equipe"></td><td class="c-mao"></td><td class="c-num" data-col="duracao">' + g.duracao + '</td>' +
        '<td class="c-data" data-col="inicio">' + dataCurta(g.inicio) + '</td><td class="c-data" data-col="termino">' + dataCurta(g.termino) + '</td>' +
        '<td class="c-pred"></td><td class="c-folga"></td>' + tl + '</tr>';
    }
    const t = r.tarefas.get(n.id);
    const pred = escreverPred(t.predecessoras);
    const nome = esc(n.nome) + (t.novo ? ' <span class="st st-amarelo">novo</span>' : '') + (t.inicioMinimo ? ' <span class="plan-restricao" title="Não iniciar antes de ' + S.data(t.inicioMinimo) + '">' + S.ic('cadeado', 'ic-sm') + '</span>' : '');
    return '<tr class="plan-linha servico' + (t.critico ? ' critico' : '') + '" data-id="' + esc(n.id) + '">' + lin + '<td class="c-eap">' + esc(n.eap) + '</td>' +
      '<td class="c-nome">' + (editar ? '<button type="button" class="plan-nome" data-acao="tarefa" data-id="' + esc(n.id) + '" title="' + esc(n.nome) + ' — equipe, duração, predecessoras e restrição de início">' + nome + '</button>' : '<span class="plan-nome" title="' + esc(n.nome) + '">' + nome + '</span>') + '</td>' +
      '<td class="c-equipe">' + equipeHtml(n, t, editar) + '</td><td class="c-mao">' + maoHtml(n, t) + '</td>' +
      '<td class="c-num" data-col="dur">' + duracaoHtml(n, t, editar) + '</td>' +
      '<td class="c-data" data-col="inicio">' + dataCurta(t.inicio) + '</td><td class="c-data" data-col="termino">' + dataCurta(t.termino) + '</td>' +
      '<td class="c-pred">' + (editar ? '<input type="text" data-campo="pred" value="' + esc(pred) + '" placeholder="—" aria-label="Predecessoras da linha ' + linhaDe(n.id) + '" spellcheck="false" inputmode="numeric">' : esc(pred || '—')) + '</td>' +
      '<td class="c-folga" data-col="folga">' + folgaHtml(t) + '</td>' + tl + '</tr>';
  }).join('');
  const manuaisComMao = Array.from(r.tarefas.values()).filter((t) => t.mao && t.modo !== 'equipe').length;
  return '<div class="supr-barra">' + S.chips(ESCALAS, estado.escala, 'escala') +
    '<label class="plan-check"><input type="checkbox" data-campo="so-criticos"' + (estado.soCriticos ? ' checked' : '') + '>Só caminho crítico</label>' +
    S.botao('expandir', 'Expandir tudo') + S.botao('recolher-tudo', 'Recolher etapas') +
    (editar && manuaisComMao ? S.botao('tudo-auto', 'Durações pela equipe (' + manuaisComMao + ')', { titulo: 'Calcular pela equipe e horas de mão de obra todos os serviços com duração digitada' }) : '') +
    '<span class="espaco"></span>' +
    (editar ? '<span class="plan-sujo" data-sujo' + (estado.sujo ? '' : ' hidden') + '>Alterações não salvas</span>' +
      S.botao('descartar', 'Descartar', { desabilitado: !estado.sujo, dados: 'data-sujo-botao' }) +
      S.botao('salvar', 'Salvar cronograma', { primario: true, icone: 'salvar', desabilitado: !estado.sujo || r.erros.length > 0, dados: 'data-sujo-botao' }) : '') + '</div>' +
    '<ul class="plan-legenda"><li><span class="k planejado"></span>Planejado</li><li><span class="k executado"></span>Executado até hoje</li>' +
    '<li><span class="k critico"></span>Caminho crítico</li><li><span class="k resumo"></span>Etapa</li><li><span class="k hoje"></span>Hoje</li></ul>' +
    (editar ? '<p class="plan-dica-uso"><b>Predecessoras</b>: números das linhas (Nº) separados por vírgula ou ponto e vírgula; “12+2” espera 2 dias depois do término e “12-1” começa 1 dia antes. A linha de uma etapa vale para todos os serviços dela. ' +
      '<b>Duração</b>: com mão de obra no orçamento, horas do oficial principal ÷ oficiais (sem oficial, do ajudante ÷ ajudantes), convertidas pelas horas de cada dia do calendário; digitar a duração deixa o serviço manual.</p>' : '') +
    '<div class="plan-gantt"><table class="plan-tabela"><thead><tr><th class="c-lin">Nº</th><th class="c-eap">EAP</th><th class="c-nome">Serviço</th>' +
    '<th class="c-equipe" title="Oficiais e ajudantes na atividade">Equipe <span class="plan-eq-rot">ofic. · ajud.</span></th><th class="c-mao" title="Horas de mão de obra do serviço no orçamento">Mão de obra</th><th class="c-num">Duração</th>' +
    '<th class="c-data">Início</th><th class="c-data">Término</th><th class="c-pred">Predecessoras</th><th class="c-folga">Folga</th>' +
    '<th class="c-tl"><div class="plan-tl-cab" style="width:' + lt.largura + 'px">' + cabecalhoTempo(lt) + '</div></th></tr></thead><tbody>' +
    (linhas || '<tr><td colspan="11" class="plan-vazio">Nenhum serviço ' + (estado.soCriticos ? 'no caminho crítico' : 'no orçamento') + '.</td></tr>') + '</tbody></table></div>';
}

// Depois de uma edição: datas, folgas e barras no lugar (sem perder o foco); se a obra passou do
// fim da linha do tempo, redesenha a tabela
function atualizarCronograma() {
  const lt = linhaDoTempo();
  const atual = estado.linhaTempo;
  if (!atual || lt.inicio !== atual.inicio || lt.fim !== atual.fim || Math.abs(lt.px - atual.px) > 0.01 || estado.soCriticos) {
    const foco = document.activeElement && document.activeElement.closest('tr[data-id]');
    const campo = document.activeElement && document.activeElement.dataset ? document.activeElement.dataset.campo : null;
    renderModo();
    if (foco && campo) {
      const el = area.querySelector('tr[data-id="' + CSS.escape(foco.dataset.id) + '"] [data-campo="' + campo + '"]');
      if (el) el.focus();
    }
  } else {
    const r = estado.res;
    area.querySelectorAll('.plan-tabela tbody tr[data-id]').forEach((tr) => {
      const id = tr.dataset.id;
      const n = noDe(id);
      if (!n) return;
      const info = n.tipo === 'servico' ? r.tarefas.get(id) : r.grupos.get(id);
      if (!info) return;
      tr.querySelector('[data-col="inicio"]').textContent = dataCurta(info.inicio);
      tr.querySelector('[data-col="termino"]').textContent = dataCurta(info.termino);
      if (n.tipo === 'servico') {
        tr.querySelector('[data-col="folga"]').innerHTML = folgaHtml(info);
        tr.classList.toggle('critico', info.critico);
        const dur = tr.querySelector('[data-col="dur"]');
        if (!dur.contains(document.activeElement)) dur.innerHTML = duracaoHtml(n, info, podeEditar());
        atualizarEquipe(tr.querySelector('.c-equipe'), n, info);
      } else tr.querySelector('[data-col="duracao"]').textContent = info.duracao;
      const tl = tr.querySelector('.plan-tl');
      const antiga = tl.querySelector('.plan-barra, .plan-marco, .plan-resumo');
      if (antiga) antiga.remove();
      tl.insertAdjacentHTML('beforeend', barraHtml(n, lt));
    });
  }
  atualizarAvisos();
  atualizarBotoesSalvar();
  atualizarCartoes();
}
// Equipe redesenhada depois de uma edição; o campo em que a pessoa está digitando fica (só a aparência muda)
function atualizarEquipe(celula, n, t) {
  const novo = document.createElement('td');
  novo.innerHTML = equipeHtml(n, t, podeEditar());
  const foco = document.activeElement;
  if (!celula.contains(foco)) { celula.innerHTML = novo.innerHTML; return; }
  celula.querySelectorAll('input').forEach((i) => {
    const igual = novo.querySelector('[data-campo="' + i.dataset.campo + '"]');
    if (!igual) return;
    if (i === foco) { i.className = igual.className; i.title = igual.title; }
    else i.replaceWith(igual);
  });
}
function atualizarBotoesSalvar() {
  const aviso = area.querySelector('[data-sujo]');
  if (aviso) aviso.hidden = !estado.sujo;
  area.querySelectorAll('[data-sujo-botao]').forEach((b) => {
    b.disabled = !estado.sujo || (b.dataset.acao === 'salvar' && estado.res.erros.length > 0);
  });
}
// Os cartões do topo dependem do cálculo: refaz só eles
function atualizarCartoes() {
  const antigo = area.querySelector('.supr-cards');
  if (!antigo) return;
  const temp = document.createElement('div');
  const r = estado.res;
  const a = M.avancoEm(r, estado.indice, estado.dados.hoje);
  const desvio = (a.realizado - a.previsto) * 100;
  temp.innerHTML = '<div class="supr-cards">' + cartao('Início', S.data(r.inicio), 'primeiro serviço') +
    cartao('Término previsto', S.data(r.termino), esc(dias(r.duracao))) + cartao('Previsto para hoje', pct(a.previsto * 100), 'pelo cronograma') +
    cartao('Realizado', pct(a.realizado * 100), 'pelos apontamentos de avanço') +
    cartao('Desvio', (desvio > 0 ? '+' : '') + pct(desvio).replace('%', ' p.p.'), desvio <= -5 ? '' : 'realizado − previsto', '', desvio <= -5 ? 'Obra atrasada' : '') +
    cartao('Caminho crítico', String(r.criticos), r.criticos === 1 ? 'serviço sem folga' : 'serviços sem folga') + '</div>';
  antigo.replaceWith(temp.firstChild);
}

// Duração digitada: com mão de obra no orçamento, ajusta a equipe para caber nesses dias (horas do
// orçamento ÷ horas dos dias); se nem uma pessoa precisa de tantos dias, o serviço fica manual com
// a duração digitada. Sem mão de obra (ou duração zero, marco), é manual.
function mudarDuracao(id, qtd) {
  const t = estado.res.tarefas.get(id);
  const tarefa = tarefaEditavel(id);
  const necessario = t.mao && qtd > 0 ? M.equipeParaDuracao(t, estado.res.calendario, qtd) : null;
  if (necessario == null) {
    Object.assign(tarefa, { duracao: qtd, modo: 'manual' });
  } else if (necessario < 1 - 1e-9) {
    // nem uma pessoa precisa de tantos dias: a atividade fica mais lenta, com a duração digitada
    const papel = t.mao.oficial > 0 ? 'oficial' : 'ajudante';
    Object.assign(tarefa, { duracao: qtd, modo: 'manual' });
    S.aviso('Com 1 ' + papel + ' o serviço já cabe em menos de ' + qtd + (qtd === 1 ? ' dia' : ' dias') + ': ficou com a duração digitada (manual).');
  } else {
    const n = Math.min(M.LIMITE_EQUIPE, Math.ceil(necessario - 1e-9));
    tarefa.modo = 'equipe';
    if (t.mao.oficial > 0) { tarefa.oficiais = n; delete tarefa.ajudantesFixos; } else tarefa.ajudantes = n;
    marcarSujo();
    const novo = estado.res.tarefas.get(id);
    S.aviso('Equipe ajustada: ' + (t.mao.oficial > 0 ? n + ' oficial(is)' + (novo.ajudantes ? ' e ' + novo.ajudantes + ' ajudante(s)' : '') : n + ' ajudante(s)') +
      (novo.duracao !== qtd ? ' — leva ' + novo.duracao + (novo.duracao === 1 ? ' dia' : ' dias') : '') + '.');
    atualizarCronograma();
    return;
  }
  marcarSujo();
  atualizarCronograma();
}
function tarefaEditavel(id) {
  if (!estado.config.tarefas[id]) {
    const t = estado.res.tarefas.get(id);
    estado.config.tarefas[id] = { duracao: t.duracao, predecessoras: t.predecessoras.map((p) => ({ ...p })), modo: t.modo, oficiais: t.oficiais, ajudantes: t.ajudantes,
      ...(t.ajudantesFixos ? { ajudantesFixos: true } : {}) };
  }
  return estado.config.tarefas[id];
}
function marcarSujo() {
  estado.sujo = true;
  recalcular();
}
// Predecessoras digitadas: números de linha (com espera opcional "+2" / "-1") separados por vírgula
// ou ponto e vírgula; não vale o próprio serviço nem o grupo que o contém
function lerPredecessorasDe(texto, id) {
  const lista = [], erros = [];
  const n = noDe(id);
  const ancestrais = new Set();
  for (let p = noDe(n.paiId); p; p = noDe(p.paiId)) ancestrais.add(p.id);
  for (const parte of String(texto || '').split(/[;,\s]+/).filter(Boolean)) {
    const m = parte.match(/^(\d+)([+-]\d+)?$/);
    const alvo = m ? estado.porLinha.get(Number(m[1])) : null;
    if (!alvo) { erros.push(parte + ' (linha não existe)'); continue; }
    const espera = m[2] ? Number(m[2]) : 0;
    if (alvo === id || ancestrais.has(alvo)) { erros.push(m[1] + ' (o próprio serviço ou o grupo dele)'); continue; }
    if (Math.abs(espera) > M.LIMITE_ESPERA) { erros.push(parte + ' (espera acima de ' + M.LIMITE_ESPERA + ' dias)'); continue; }
    if (!lista.some((p) => p.id === alvo)) lista.push({ id: alvo, espera });
  }
  return { lista, erros };
}

async function configurar(criar) {
  const d = estado.dados;
  let calendarios = [];
  try { calendarios = (await api('GET', 'calendarios')).calendarios; } catch (e) { S.falhou(e); return; }
  const padraoCal = calendarios.find((x) => x.padrao);
  const c = estado.config || { dataInicio: d.hoje, calendario: 'uteis', calendarioId: padraoCal ? padraoCal.id : null, feriados: [], duracaoPadrao: M.DURACAO_PADRAO };
  const antigas = criar ? duracoesAntigas() : new Map();
  const comCalendario = (id) => Boolean(id);
  S.dialogo({
    titulo: criar ? 'Criar cronograma' : 'Configurar cronograma', tamanho: 'md', botao: criar ? 'Criar cronograma' : 'Aplicar',
    corpo: '<div class="supr-form">' +
      '<label class="campo">Início da obra<input type="date" data-f="inicio" value="' + esc(c.dataInicio) + '" required></label>' +
      '<label class="campo">Calendário de trabalho<select data-f="calendarioId"><option value="">Sem calendário: definir aqui</option>' +
        calendarios.map((x) => '<option value="' + esc(x.id) + '"' + (x.id === c.calendarioId ? ' selected' : '') + '>' + esc(x.nome) + (x.padrao ? ' (padrão)' : '') + '</option>').join('') +
        '</select><span class="supr-dica">Feriados nacionais, estaduais e municipais e pontes: <a href="#" data-gerenciar-calendarios>tela Calendários</a></span></label>' +
      '<label class="campo" data-so-proprio' + (comCalendario(c.calendarioId) ? ' hidden' : '') + '>Dias de trabalho<select data-f="calendario">' + Object.entries(M.CALENDARIOS).map(([k, v]) =>
        '<option value="' + k + '"' + (k === c.calendario ? ' selected' : '') + '>' + esc(v) + '</option>').join('') + '</select></label>' +
      '<label class="campo">Duração de serviço novo (dias)<input type="number" min="1" max="' + M.LIMITE_DURACAO + '" data-f="padrao" value="' + c.duracaoPadrao + '"></label>' +
      '<label class="campo largo"><span data-rotulo-feriados>' + (comCalendario(c.calendarioId) ? 'Dias parados só desta obra' : 'Feriados e dias parados') + '</span>' +
      ' <span class="supr-dica">(uma data por linha, dd/mm/aaaa)</span>' +
      '<textarea rows="4" data-f="feriados" placeholder="25/12/2026">' + esc(c.feriados.map((f) => S.data(f)).join('\n')) + '</textarea></label>' +
      (criar ? '<p class="campo largo supr-dica">O cronograma começa com as etapas de cada unidade uma depois da outra e os serviços da mesma etapa em paralelo. ' +
        'Depois, ajuste a duração e as predecessoras de cada serviço.</p>' : '') +
      (criar && antigas.size ? '<label class="campo largo plan-check"><input type="checkbox" data-f="antigas" checked>Usar as durações de ' + antigas.size +
        ' serviço(s) do cronograma antigo guardado neste navegador</label>' : '') + '</div>',
    aoConfirmar: async (corpo) => {
      const f = (k) => corpo.querySelector('[data-f="' + k + '"]');
      const inicio = f('inicio').value;
      if (!M.ehData(inicio)) { f('inicio').classList.add('invalido'); S.aviso('Informe a data de início da obra.', 'erro'); return false; }
      const padrao = Number(f('padrao').value);
      if (!Number.isInteger(padrao) || padrao < 1 || padrao > M.LIMITE_DURACAO) { f('padrao').classList.add('invalido'); S.aviso('A duração padrão deve ser de 1 a ' + M.LIMITE_DURACAO + ' dias.', 'erro'); return false; }
      const feriados = [];
      const ruins = [];
      for (const parte of f('feriados').value.split(/[\n,;]+/).map((x) => x.trim()).filter(Boolean)) {
        const iso = dataDigitada(parte);
        if (iso) feriados.push(iso); else ruins.push(parte);
      }
      if (ruins.length) { f('feriados').classList.add('invalido'); S.aviso('Datas que não entendi: ' + ruins.join(', '), 'erro'); return false; }
      const calendarioId = f('calendarioId').value || null;
      const base = { dataInicio: inicio, calendario: f('calendario').value, calendarioId, feriados: Array.from(new Set(feriados)).sort(), duracaoPadrao: padrao };
      if (criar) {
        const usar = f('antigas') && f('antigas').checked;
        const pad = M.predecessorasPadrao(d.eap);
        const tarefas = {};
        // com mão de obra no orçamento, a duração sai da equipe (1 oficial e 1 ajudante para começar)
        const mao = d.maoDeObra || {};
        for (const s of servicos()) {
          const temMao = mao[s.id] && (mao[s.id].oficial || mao[s.id].ajudante);
          const antiga = usar && antigas.has(s.id);
          // equipe na proporção das horas (ex.: 8 h de oficial e 16 h de ajudante = 1 oficial e 2 ajudantes)
          const equipe = M.equipePadrao(temMao ? { oficial: mao[s.id].oficial ? mao[s.id].oficial.horas : 0, ajudante: mao[s.id].ajudante ? mao[s.id].ajudante.horas : 0 } : null);
          tarefas[s.id] = { duracao: antiga ? antigas.get(s.id) : padrao, predecessoras: pad.get(s.id) || [],
            modo: temMao && !antiga ? 'equipe' : 'manual', oficiais: equipe.oficiais, ajudantes: equipe.ajudantes };
        }
        estado.dados = await api('PUT', 'obras/' + encodeURIComponent(d.obra.id), { ...base, tarefas, revisao: 0 });
        reiniciarCronograma();
        reiniciarAvanco();
        renderObra();
        S.aviso('Cronograma criado. Ajuste as durações e as predecessoras de cada serviço e salve.');
      } else {
        Object.assign(estado.config, base);
        estado.calendario = calendarios.find((x) => x.id === calendarioId) || null;
        marcarSujo();
        renderObra();
      }
      return true;
    },
    aoAbrir: (corpo, dlg, fechar) => {
      const sel = corpo.querySelector('[data-f="calendarioId"]');
      sel.addEventListener('change', () => {
        corpo.querySelector('[data-so-proprio]').hidden = Boolean(sel.value);
        corpo.querySelector('[data-rotulo-feriados]').textContent = sel.value ? 'Dias parados só desta obra' : 'Feriados e dias parados';
      });
      corpo.querySelector('[data-gerenciar-calendarios]').addEventListener('click', (ev) => {
        ev.preventDefault();
        fechar(null);
        if (window.ErpNav) window.ErpNav.abrir('calendarios');
      });
    }
  });
}
// "25/12/2026", "25/12/26" ou "2026-12-25"
function dataDigitada(texto) {
  let m = texto.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2}|\d{4})$/);
  if (m) {
    const ano = m[3].length === 2 ? '20' + m[3] : m[3];
    const iso = ano + '-' + m[2].padStart(2, '0') + '-' + m[1].padStart(2, '0');
    return M.ehData(iso) ? iso : null;
  }
  m = texto.match(/^\d{4}-\d{2}-\d{2}$/);
  return m && M.ehData(texto) ? texto : null;
}
// Durações do cronograma antigo (ficava só no navegador): serviço pelo id do orçamento
function duracoesAntigas() {
  const r = new Map();
  try {
    const ids = new Set(servicos().map((s) => s.id));
    for (const p of JSON.parse(localStorage.getItem('planejamentos') || '[]')) {
      for (const n of (p && p.eap) || []) {
        const id = n && (n.originalId || n.id);
        const dur = Number(n && n.duracao);
        if (n && n.tipo === 'servico' && ids.has(id) && Number.isInteger(dur) && dur >= 0 && dur <= M.LIMITE_DURACAO) r.set(id, dur);
      }
    }
  } catch (e) { /* sem armazenamento ou dado quebrado: ignora */ }
  return r;
}

function editarTarefa(id) {
  const n = noDe(id);
  const t = estado.res.tarefas.get(id);
  const m = (estado.dados.maoDeObra || {})[id];
  const linhasMao = m ? [m.oficial ? ['Oficial', m.oficial.nome + ' — ' + horasTxt(m.oficial.horas)] : null, m.ajudante ? ['Ajudante', m.ajudante.nome + ' — ' + horasTxt(m.ajudante.horas)] : null,
    ...(m.apoio || []).map((a) => ['Apoio (não conta)', a.nome + ' — ' + horasTxt(a.horas)])].filter(Boolean) : [];
  const p = t.mao ? M.equipePadrao(t.mao) : null;
  const campoEquipe = (k, papel, rotulo) => (t.mao && t.mao[papel] > 0
    ? '<label class="campo">' + rotulo + (k === 'ajudantes' && t.mao.oficial > 0 ? ' <span class="supr-dica">(proporção ' + p.oficiais + ':' + p.ajudantes + (t.ajudantesFixos ? '; digitado' : '') + ')</span>' : '') +
      '<input type="number" min="1" max="' + M.LIMITE_EQUIPE + '" data-f="' + k + '" value="' + t[k] + '"></label>'
    : t.mao ? '<label class="campo">' + rotulo + '<input type="number" value="0" disabled title="Sem ' + papel + ' na composição"></label>' : '');
  S.dialogo({
    titulo: 'Linha ' + linhaDe(id) + ' · ' + n.eap + ' ' + n.nome, tamanho: 'md', botao: 'Aplicar',
    corpo: S.ficha([['Início', S.data(t.inicio)], ['Término', S.data(t.termino)], ['Folga', t.critico ? 'nenhuma (caminho crítico)' : esc(dias(t.folga))],
      ['Valor orçado', S.moeda(n.valor)], ...linhasMao.map(([a, b]) => [a, esc(b)])]) +
      '<div class="supr-form" style="margin-top:12px">' +
      (t.mao ? '<label class="campo largo plan-check"><input type="checkbox" data-f="auto"' + (t.modo === 'equipe' ? ' checked' : '') + '>Calcular a duração pela equipe e pelas horas de mão de obra</label>' +
        campoEquipe('oficiais', 'oficial', 'Oficiais') + campoEquipe('ajudantes', 'ajudante', 'Ajudantes') : '') +
      '<label class="campo">Duração (dias de trabalho)<input type="number" min="0" max="' + M.LIMITE_DURACAO + '" data-f="duracao" value="' + t.duracao + '"' + (t.modo === 'equipe' ? ' disabled' : '') + '></label>' +
      '<label class="campo">Não iniciar antes de <span class="supr-dica">(opcional)</span><input type="date" data-f="minimo" value="' + esc(t.inicioMinimo || '') + '"></label>' +
      '<label class="campo largo">Predecessoras <span class="supr-dica">(números das linhas, ex.: 3; 5+2)</span><input type="text" data-f="pred" value="' +
      esc(escreverPred(t.predecessoras)) + '" spellcheck="false"></label>' +
      '<p class="campo largo supr-dica">Duração zero vira um marco. “+2” espera 2 dias depois do término da predecessora; “-1” começa 1 dia antes.</p></div>',
    aoAbrir: (corpo) => {
      const auto = corpo.querySelector('[data-f="auto"]');
      if (auto) auto.addEventListener('change', () => { corpo.querySelector('[data-f="duracao"]').disabled = auto.checked; });
    },
    aoConfirmar: (corpo) => {
      const f = (k) => corpo.querySelector('[data-f="' + k + '"]');
      const auto = f('auto') && f('auto').checked;
      const duracao = Number(f('duracao').value);
      if (!auto && (!Number.isInteger(duracao) || duracao < 0 || duracao > M.LIMITE_DURACAO)) { f('duracao').classList.add('invalido'); S.aviso('Duração de 0 a ' + M.LIMITE_DURACAO + ' dias.', 'erro'); return false; }
      const equipe = {};
      for (const k of ['oficiais', 'ajudantes']) {
        if (!f(k) || f(k).disabled) continue;
        const v = Number(f(k).value);
        if (!Number.isInteger(v) || v < 1 || v > M.LIMITE_EQUIPE) { f(k).classList.add('invalido'); S.aviso('Equipe de 1 a ' + M.LIMITE_EQUIPE + '.', 'erro'); return false; }
        equipe[k] = v;
      }
      const lido = lerPredecessorasDe(f('pred').value, id);
      if (lido.erros.length) { f('pred').classList.add('invalido'); S.aviso('Predecessoras inválidas: ' + lido.erros.join(', '), 'erro'); return false; }
      const minimo = f('minimo').value;
      const tarefa = tarefaEditavel(id);
      // ajudantes ficam fixos só se forem diferentes da proporção dos oficiais escolhidos
      if (t.mao && t.mao.oficial > 0 && equipe.ajudantes != null) {
        if (equipe.ajudantes === M.ajudantesNaProporcao(equipe.oficiais || t.oficiais, t.mao)) { delete equipe.ajudantes; delete tarefa.ajudantesFixos; }
        else equipe.ajudantesFixos = true;
      }
      Object.assign(tarefa, equipe, { modo: auto ? 'equipe' : 'manual', predecessoras: lido.lista });
      if (!auto) tarefa.duracao = duracao;
      if (minimo) tarefa.inicioMinimo = minimo; else delete tarefa.inicioMinimo;
      marcarSujo();
      renderModo();
      return true;
    }
  });
}

async function salvarCronograma() {
  const d = estado.dados;
  if (estado.res.erros.length) { S.aviso(estado.res.erros[0].mensagem, 'erro'); return; }
  // serviços novos entram com o que está na tela (deixam de ser "novos")
  const tarefas = {};
  for (const s of servicos()) {
    const t = estado.res.tarefas.get(s.id);
    tarefas[s.id] = { duracao: t.duracao, predecessoras: t.predecessoras, ...(t.inicioMinimo ? { inicioMinimo: t.inicioMinimo } : {}),
      modo: t.modo, oficiais: t.oficiais, ajudantes: t.ajudantes, ...(t.ajudantesFixos ? { ajudantesFixos: true } : {}) };
  }
  const botao = area.querySelector('[data-acao="salvar"]');
  if (botao) botao.disabled = true;
  try {
    estado.dados = await api('PUT', 'obras/' + encodeURIComponent(d.obra.id), { ...estado.config, tarefas, revisao: d.cronograma.revisao });
    estado.dados.avancos = estado.dados.avancos || d.avancos;
    reiniciarCronograma();
    renderObra();
    S.aviso('Cronograma salvo.');
  } catch (e) {
    if (botao) botao.disabled = false;
    if (e.status === 409) {
      S.acao({ titulo: 'Cronograma alterado por outra pessoa', texto: esc(e.message), botao: 'Recarregar',
        executar: async () => { estado.dados = await api('GET', 'obras/' + encodeURIComponent(d.obra.id)); reiniciarCronograma(); reiniciarAvanco(); }, depois: renderObra });
    } else S.falhou(e);
  }
}

/* ---------- modo avanço físico ---------- */
function executadoEm(id, data) {
  if (data === estado.dataApont && estado.apont.has(id)) return estado.apont.get(id) / 100;
  return M.realizadoDaTarefa(estado.indice, id, data);
}
function avancoDoGrupo(id, data) {
  const ate = estado.res.calendario.indiceAte(data);
  let peso = 0, previsto = 0, executado = 0;
  for (const f of estado.res.folhas(id)) {
    const t = estado.res.tarefas.get(f);
    if (!t || !(t.peso > 0)) continue;
    peso += t.peso;
    previsto += t.peso * M.previstoDaTarefa(t, ate);
    executado += t.peso * executadoEm(f, data);
  }
  return { previsto: peso ? previsto / peso : 0, executado: peso ? executado / peso : 0 };
}
function ultimoApontamento(id) {
  let u = null;
  for (const a of estado.dados.avancos) if (a.servicoId === id && (!u || a.data >= u.data)) u = a;
  return u;
}
function htmlAvanco() {
  const editar = podeEditar();
  const data = estado.dataApont;
  const ate = estado.res.calendario.indiceAte(data);
  const linhas = linhasVisiveis().map((n) => {
    if (n.tipo !== 'servico') {
      const g = avancoDoGrupo(n.id, data);
      return '<tr class="plan-linha ' + nivelClasse(n) + '" data-id="' + esc(n.id) + '"><td class="c-lin">' + linhaDe(n.id) + '</td><td class="c-eap">' + botaoRecolher(n) + esc(n.eap) + '</td><td class="c-nome">' + esc(n.nome) + '</td>' +
        '<td class="c-data"></td><td class="c-num" data-col="previsto">' + pct(g.previsto * 100) + '</td><td class="c-num" data-col="executado">' + pct(g.executado * 100) + '</td><td></td><td></td></tr>';
    }
    const t = estado.res.tarefas.get(n.id);
    const exec = executadoEm(n.id, data) * 100;
    const u = ultimoApontamento(n.id);
    const alterado = estado.apont.has(n.id);
    return '<tr class="plan-linha servico' + (alterado ? ' alterado' : '') + '" data-id="' + esc(n.id) + '"><td class="c-lin">' + linhaDe(n.id) + '</td><td class="c-eap">' + esc(n.eap) + '</td>' +
      '<td class="c-nome"><span class="plan-nome">' + esc(n.nome) + '</span></td>' +
      '<td class="c-data">' + dataCurta(t.inicio) + ' a ' + dataCurta(t.termino) + '</td>' +
      '<td class="c-num">' + pct(M.previstoDaTarefa(t, ate) * 100) + '</td>' +
      '<td class="c-num">' + (editar ? '<span class="plan-pct"><input type="number" min="0" max="100" step="1" inputmode="decimal" data-campo="exec" value="' +
        (Math.round(exec * 100) / 100) + '" aria-label="% executado de ' + esc(n.eap) + '">%</span>' : pct(exec)) + '</td>' +
      '<td class="c-ultimo">' + (u ? dataCurta(u.data) + ' · ' + pct(u.percentual) + '<small>' + esc(u.usuarioNome || '') + '</small>' : '—') + '</td>' +
      '<td class="acoes">' + (estado.dados.avancos.some((a) => a.servicoId === n.id) ? '<button type="button" class="btn-icon" data-acao="hist-servico" data-id="' + esc(n.id) + '" title="Apontamentos deste serviço">' + S.ic('relogio') + '</button>' : '') + '</td></tr>';
  }).join('');
  const qtd = estado.apont.size;
  return '<div class="supr-barra"><label class="plan-data">Avanço até<input type="date" data-campo="data-apont" value="' + esc(data) + '" max="' + esc(estado.dados.hoje) + '"></label>' +
    '<span class="supr-dica">' + (editar ? 'Informe o % executado acumulado de cada serviço até a data; os grupos somam pelo valor orçado.' : 'Previsto e executado acumulados até a data.') + '</span>' +
    '<span class="espaco"></span>' + (editar ? S.botao('descartar-avanco', 'Descartar', { desabilitado: !qtd }) +
      S.botao('salvar-avanco', qtd ? 'Salvar avanço (' + qtd + ')' : 'Salvar avanço', { primario: true, icone: 'salvar', desabilitado: !qtd }) : '') + '</div>' +
    '<div class="plan-gantt"><table class="plan-tabela avanco"><thead><tr><th class="c-lin">Nº</th><th class="c-eap">EAP</th><th class="c-nome">Serviço</th><th class="c-data">Planejado</th>' +
    '<th class="c-num">Previsto até a data</th><th class="c-num">Executado até a data</th><th class="c-ultimo">Último apontamento</th><th class="acoes"></th></tr></thead><tbody>' +
    (linhas || '<tr><td colspan="8" class="plan-vazio">Nenhum serviço.</td></tr>') + '</tbody></table></div>';
}
function atualizarGruposDoAvanco() {
  area.querySelectorAll('.plan-tabela.avanco tr.grupo[data-id]').forEach((tr) => {
    const g = avancoDoGrupo(tr.dataset.id, estado.dataApont);
    tr.querySelector('[data-col="previsto"]').textContent = pct(g.previsto * 100);
    tr.querySelector('[data-col="executado"]').textContent = pct(g.executado * 100);
  });
  const qtd = estado.apont.size;
  const salvar = area.querySelector('[data-acao="salvar-avanco"]');
  if (salvar) { salvar.disabled = !qtd; salvar.lastChild.textContent = qtd ? 'Salvar avanço (' + qtd + ')' : 'Salvar avanço'; }
  const descartar = area.querySelector('[data-acao="descartar-avanco"]');
  if (descartar) descartar.disabled = !qtd;
}
async function salvarAvanco() {
  const d = estado.dados;
  const itens = Array.from(estado.apont, ([servicoId, percentual]) => ({ servicoId, percentual }));
  if (!itens.length) return;
  const botao = area.querySelector('[data-acao="salvar-avanco"]');
  if (botao) botao.disabled = true;
  try {
    const r = await api('POST', 'obras/' + encodeURIComponent(d.obra.id) + '/avancos', { data: estado.dataApont, itens });
    d.avancos = r.avancos;
    const data = estado.dataApont;
    reiniciarAvanco();
    estado.dataApont = data;
    renderObra();
    S.aviso('Avanço de ' + itens.length + ' serviço(s) salvo em ' + S.data(data) + '.');
  } catch (e) {
    if (botao) botao.disabled = false;
    S.falhou(e);
  }
}
function historicoDoServico(id) {
  const n = noDe(id);
  const lista = estado.dados.avancos.filter((a) => a.servicoId === id).sort((a, b) => (a.data < b.data ? 1 : -1));
  const editar = podeEditar();
  const dlg = S.dialogo({
    titulo: 'Apontamentos — ' + n.eap + ' ' + n.nome, tamanho: 'md',
    corpo: S.tabela([
      { t: 'Data', v: (a) => S.data(a.data), c: 'nowrap' },
      { t: 'Executado', v: (a) => pct(a.percentual), c: 'num' },
      { t: 'Quem', v: (a) => esc(a.usuarioNome || '—') + '<small>' + esc(S.dataHora(a.criadoEm)) + '</small>' },
      ...(editar ? [{ t: '', v: (a) => '<button type="button" class="btn-icon" data-excluir-apont="' + esc(a.data) + '" title="Excluir este apontamento">' + S.ic('excluir') + '</button>', c: 'acoes' }] : [])
    ], lista, { vazio: 'Nenhum apontamento.' })
  });
  dlg.corpo.addEventListener('click', async (ev) => {
    const b = ev.target.closest('[data-excluir-apont]');
    if (!b) return;
    b.disabled = true;
    try {
      const r = await api('DELETE', 'obras/' + encodeURIComponent(estado.dados.obra.id) + '/avancos/' + encodeURIComponent(id) + '/' + b.dataset.excluirApont);
      estado.dados.avancos = r.avancos;
      estado.indice = M.indexarAvancos(r.avancos);
      dlg.fechar();
      renderObra();
      S.aviso('Apontamento excluído.');
    } catch (e) { b.disabled = false; S.falhou(e); }
  });
}

/* ---------- modo curva S ---------- */
function htmlCurva() {
  const pontos = M.curvaS(estado.res, estado.dados.avancos, estado.dados.hoje);
  estado.pontos = pontos;
  const tabela = S.tabela([
    { t: 'Data', v: (p) => S.data(p.data) + (p.data === estado.dados.hoje ? ' <small>hoje</small>' : ''), c: 'nowrap' },
    { t: 'Previsto', v: (p) => pct(p.previsto), c: 'num' },
    { t: 'Realizado', v: (p) => (p.realizado == null ? '—' : pct(p.realizado)), c: 'num' },
    { t: 'Desvio', v: (p) => (p.realizado == null ? '—' : ((p.realizado - p.previsto > 0 ? '+' : '') + pct(p.realizado - p.previsto).replace('%', ' p.p.'))), c: 'num' }
  ], pontos);
  return '<section class="supr-secao plan-curva"><h4>Curva S — avanço físico acumulado<span class="espaco"></span>' +
    '<button type="button" class="btn btn-ghost btn-sm" data-acao="alternar-curva" aria-pressed="false">' + S.ic('planilha') + '<span>Tabela</span></button></h4>' +
    '<p class="supr-dica">Previsto pelo cronograma × realizado pelos apontamentos, ponderados pelo valor orçado de cada serviço' +
    (estado.sujo ? ' (com as alterações ainda não salvas)' : '') + '.</p>' +
    '<div data-curva></div><div data-curva-tabela hidden>' + tabela + '</div></section>';
}
function desenharCurva() {
  const el = area.querySelector('[data-curva]');
  if (el) G.curvaS(el, { pontos: estado.pontos, hoje: estado.dados.hoje, titulo: 'Curva S da obra' });
}

/* ---------- histórico e CSV ---------- */
async function historico() {
  try {
    const r = await api('GET', 'obras/' + encodeURIComponent(estado.dados.obra.id) + '/historico');
    S.dialogo({ titulo: 'Histórico do cronograma', tamanho: 'md', corpo: S.historico(r.historico) });
  } catch (e) { S.falhou(e); }
}
function exportarCsv() {
  const d = estado.dados, r = estado.res;
  const ate = r.calendario.indiceAte(d.hoje);
  const linhas = [['Nº', 'EAP', 'Serviço / grupo', 'Oficiais', 'Ajudantes', 'Mão de obra (h)', 'Duração (dias)', 'Duração calculada pela equipe', 'Início', 'Término',
    'Predecessoras (Nº)', 'Folga (dias)', 'Crítico', 'Previsto hoje (%)', 'Executado (%)', 'Valor orçado']];
  for (const n of d.eap) {
    if (n.tipo === 'servico') {
      const t = r.tarefas.get(n.id);
      const m = (d.maoDeObra || {})[n.id];
      const principal = m && (m.oficial || m.ajudante);
      linhas.push([linhaDe(n.id), n.eap, n.nome, t.mao && t.mao.oficial ? t.oficiais : '', t.mao && t.mao.ajudante ? t.ajudantes : '',
        principal ? principal.nome + ' ' + S.arred(principal.horas, 1) : '', t.duracao, t.modo === 'equipe' ? 'sim' : '', S.data(t.inicio), S.data(t.termino),
        escreverPred(t.predecessoras), t.folga, t.critico ? 'sim' : '',
        S.arred(M.previstoDaTarefa(t, ate) * 100, 1), S.arred(M.realizadoDaTarefa(estado.indice, n.id, d.hoje) * 100, 1), S.arred(n.valor)]);
    } else {
      const g = r.grupos.get(n.id);
      if (!g) continue;
      const av = M.avancoEm(r, estado.indice, d.hoje, n.id);
      linhas.push([linhaDe(n.id), n.eap, n.nome.toUpperCase(), '', '', '', g.duracao, '', S.data(g.inicio), S.data(g.termino), '', '', '', S.arred(av.previsto * 100, 1), S.arred(av.realizado * 100, 1), '']);
    }
  }
  S.baixar('Cronograma - ' + (d.obra.codigo ? d.obra.codigo + ' ' : '') + d.obra.nome + '.csv', S.csv(linhas));
}

/* ---------- eventos ---------- */
function voltarParaLista() {
  if (!estado.sujo && !estado.apont.size) { abrirLista(); return; }
  S.acao({ titulo: 'Sair sem salvar?', texto: 'Há alterações no cronograma ou no avanço que ainda não foram salvas.', botao: 'Descartar e sair', perigo: true,
    executar: () => { reiniciarCronograma(); reiniciarAvanco(); }, depois: abrirLista });
}
function ligarEventos() {
  area.addEventListener('click', (ev) => {
    const chip = ev.target.closest('[data-chips] button[data-valor]');
    if (chip) {
      const grupo = chip.closest('[data-chips]').dataset.chips;
      if (grupo === 'modo') { estado.modo = chip.dataset.valor; renderObra(); }
      if (grupo === 'escala') { estado.escala = chip.dataset.valor; renderModo(); }
      return;
    }
    const b = ev.target.closest('[data-acao]');
    if (!b) return;
    const acao = b.dataset.acao;
    if (acao === 'voltar') voltarParaLista();
    else if (acao === 'criar') abrirObra(b.dataset.obra, { criar: true });
    else if (acao === 'configurar') configurar(!estado.config);
    else if (acao === 'excluir') {
      S.acao({ titulo: 'Excluir cronograma', texto: 'Apaga o cronograma desta obra e todos os apontamentos de avanço. Não dá para desfazer.', botao: 'Excluir', perigo: true,
        executar: () => api('DELETE', 'obras/' + encodeURIComponent(estado.dados.obra.id)), sucesso: 'Cronograma excluído.',
        depois: () => { estado.dados = null; estado.sujo = false; estado.apont = new Map(); abrirLista(); } });
    } else if (acao === 'historico') historico();
    else if (acao === 'csv') exportarCsv();
    else if (acao === 'salvar') salvarCronograma();
    else if (acao === 'descartar') { reiniciarCronograma(); renderObra(); }
    else if (acao === 'recolher') {
      if (estado.recolhidos.has(b.dataset.id)) estado.recolhidos.delete(b.dataset.id); else estado.recolhidos.add(b.dataset.id);
      renderModo();
    } else if (acao === 'expandir') { estado.recolhidos = new Set(); renderModo(); }
    else if (acao === 'recolher-tudo') { estado.recolhidos = new Set(estado.dados.eap.filter((n) => n.tipo === 'etapa').map((n) => n.id)); renderModo(); }
    else if (acao === 'tarefa') editarTarefa(b.dataset.id);
    else if (acao === 'auto') { b.blur(); tarefaEditavel(b.dataset.id).modo = 'equipe'; marcarSujo(); atualizarCronograma(); }
    else if (acao === 'tudo-auto') {
      for (const [id, t] of estado.res.tarefas) if (t.mao && t.modo !== 'equipe') tarefaEditavel(id).modo = 'equipe';
      marcarSujo();
      renderModo();
    }
    else if (acao === 'salvar-avanco') salvarAvanco();
    else if (acao === 'descartar-avanco') { estado.apont = new Map(); renderModo(); }
    else if (acao === 'hist-servico') historicoDoServico(b.dataset.id);
    else if (acao === 'alternar-curva') {
      const tabelaVisivel = b.getAttribute('aria-pressed') !== 'true';
      b.setAttribute('aria-pressed', String(tabelaVisivel));
      b.querySelector('span').textContent = tabelaVisivel ? 'Gráfico' : 'Tabela';
      area.querySelector('[data-curva]').hidden = tabelaVisivel;
      area.querySelector('[data-curva-tabela]').hidden = !tabelaVisivel;
    }
  });
  S.aoAbrirLinha(area, (id) => { if (estado.tela === 'lista') abrirObra(id); });
  area.addEventListener('change', (ev) => {
    const el = ev.target;
    const campo = el.dataset && el.dataset.campo;
    if (!campo) return;
    const tr = el.closest('tr[data-id]');
    if (campo === 'duracao' && tr) {
      const v = Number(el.value);
      if (!Number.isInteger(v) || v < 0 || v > M.LIMITE_DURACAO) { el.classList.add('invalido'); el.title = 'Duração de 0 a ' + M.LIMITE_DURACAO + ' dias'; return; }
      el.classList.remove('invalido');
      el.blur();
      mudarDuracao(tr.dataset.id, v);
    } else if ((campo === 'oficiais' || campo === 'ajudantes') && tr) {
      const v = Number(el.value);
      if (!Number.isInteger(v) || v < 1 || v > M.LIMITE_EQUIPE) { el.classList.add('invalido'); el.title = 'De 1 a ' + M.LIMITE_EQUIPE; return; }
      el.classList.remove('invalido');
      // mexer na equipe volta o serviço ao cálculo pelas horas; mudar os oficiais leva os ajudantes
      // de volta à proporção; digitar os ajudantes (com oficial no serviço) deixa-os fixos
      const t = estado.res.tarefas.get(tr.dataset.id);
      const tarefa = tarefaEditavel(tr.dataset.id);
      tarefa.modo = 'equipe';
      tarefa[campo] = v;
      if (campo === 'oficiais') delete tarefa.ajudantesFixos;
      else if (t.mao && t.mao.oficial > 0) tarefa.ajudantesFixos = true;
      marcarSujo();
      atualizarCronograma();
    } else if (campo === 'pred' && tr) {
      const lido = lerPredecessorasDe(el.value, tr.dataset.id);
      if (lido.erros.length) { el.classList.add('invalido'); el.title = 'Não encontrei: ' + lido.erros.join(', '); S.aviso('Predecessoras inválidas: ' + lido.erros.join(', '), 'erro'); return; }
      el.classList.remove('invalido'); el.title = '';
      tarefaEditavel(tr.dataset.id).predecessoras = lido.lista;
      marcarSujo();
      atualizarCronograma();
    } else if (campo === 'so-criticos') {
      estado.soCriticos = el.checked;
      renderModo();
    } else if (campo === 'data-apont') {
      const nova = el.value;
      if (!M.ehData(nova) || nova > estado.dados.hoje) { el.value = estado.dataApont; S.aviso('Escolha hoje ou uma data passada.', 'erro'); return; }
      const trocar = () => { estado.apont = new Map(); estado.dataApont = nova; renderModo(); };
      if (!estado.apont.size) { trocar(); return; }
      el.value = estado.dataApont;
      S.acao({ titulo: 'Trocar a data?', texto: 'O avanço digitado para ' + S.data(estado.dataApont) + ' ainda não foi salvo e será descartado.', botao: 'Descartar e trocar',
        perigo: true, executar: () => true, depois: trocar });
    }
  });
  area.addEventListener('input', (ev) => {
    const el = ev.target;
    if (!el.dataset || el.dataset.campo !== 'exec') return;
    const tr = el.closest('tr[data-id]');
    const id = tr.dataset.id;
    const v = Number(String(el.value).replace(',', '.'));
    if (el.value === '' || !Number.isFinite(v) || v < 0 || v > 100) { el.classList.add('invalido'); return; }
    el.classList.remove('invalido');
    const salvo = M.realizadoDaTarefa(estado.indice, id, estado.dataApont) * 100;
    if (Math.abs(v - salvo) < 0.005) estado.apont.delete(id); else estado.apont.set(id, Math.round(v * 100) / 100);
    tr.classList.toggle('alterado', estado.apont.has(id));
    atualizarGruposDoAvanco();
  });
  // dica nas barras do Gantt
  area.addEventListener('pointermove', (ev) => {
    const alvo = ev.target.closest('[data-dica-plan]');
    if (!alvo) { G.dica.esconder(); return; }
    const id = alvo.dataset.dicaPlan;
    const n = noDe(id), t = estado.res.tarefas.get(id);
    if (!n || !t) return;
    const ate = estado.res.calendario.indiceAte(estado.dados.hoje);
    G.dica.mostrar({ titulo: n.eap + ' ' + n.nome, linhas: [
      { valor: S.data(t.inicio) + ' a ' + S.data(t.termino), nome: '' },
      { valor: dias(t.duracao), nome: (t.critico ? 'caminho crítico' : 'folga de ' + dias(t.folga)) },
      ...(t.modo === 'equipe' ? [{ valor: horasTxt(t.horas), nome: 'de ' + (t.base === 'oficial' ? t.oficiais + ' oficial(is)' : t.ajudantes + ' ajudante(s)') + ' trabalhando' }] : []),
      { valor: pct(M.previstoDaTarefa(t, ate) * 100), nome: 'previsto até hoje' },
      { valor: pct(M.realizadoDaTarefa(estado.indice, id, estado.dados.hoje) * 100), nome: 'executado', classe: 'realizado' }
    ] }, ev.clientX, ev.clientY);
  });
  area.addEventListener('pointerleave', () => G.dica.esconder());
  window.addEventListener('beforeunload', (ev) => {
    if (estado.sujo || estado.apont.size) { ev.preventDefault(); ev.returnValue = ''; }
  });
}

function entrar() {
  if (!area) {
    area = document.getElementById('planConteudo');
    if (!area) return;
    ligarEventos();
  }
  document.getElementById('planAvisoLeitura').classList.toggle('hidden', podeEditar());
  if (estado.tela === 'obra' && estado.obraId) abrirObra(estado.obraId);
  else abrirLista();
}

document.addEventListener('app:viewchange', (ev) => {
  if (ev.detail && ev.detail.view === 'planejamento') entrar();
  else G.dica.esconder();
});
