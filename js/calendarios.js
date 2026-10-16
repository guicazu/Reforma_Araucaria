/* Calendários de trabalho das obras: dias da semana trabalhados, feriados nacionais, estaduais e
   municipais (escolhendo o município), pontos facultativos, dias específicos parados ou
   trabalhados e sugestão de pontes (dia útil entre feriado e fim de semana ou entre dois
   feriados). O cronograma de cada obra escolhe um calendário em Planejamento › Configurar.
   As regras ficam em js/feriados.js (as mesmas do servidor); os feriados municipais vêm de
   dados/feriados/municipais/<UF>.json e podem ser editados. Editar pede a permissão de editar
   Planejamento. */
import * as F from './feriados.js';

const S = window.Supr;
const api = (metodo, caminho, corpo) => S.api(metodo, caminho, corpo, { base: '/api/planejamento/' });
const esc = S.esc;
const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
const SEMANA_CURTA = ['D', 'S', 'T', 'Q', 'Q', 'S', 'S'];
const DIA_SEMANA = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'];
const TIPOS = { nacional: 'Feriado nacional', estadual: 'Feriado estadual', municipal: 'Feriado municipal', facultativo: 'Ponto facultativo', parado: 'Dia parado' };

const estado = { tela: 'lista', cal: null, ano: new Date().getFullYear(), municipios: new Map(), sujo: false, obras: [] };
let area = null;
const podeEditar = () => (window.Permissoes ? window.Permissoes.pode('planejamento', 'editar') : false);
const hojeIso = () => S.hoje();
const diaSemana = (iso) => new Date(iso + 'T12:00:00Z').getUTCDay();
const somar = (iso, n) => S.somarDias(iso, n);

function titulo(t, sub) {
  document.getElementById('calTitulo').textContent = t;
  document.getElementById('calSubtitulo').textContent = sub || '';
}
const textoHoras = (h) => (Math.round(h * 100) / 100).toLocaleString('pt-BR') + ' h';
function textoHorasSemana() {
  return textoHoras(F.horasDaSemana(estado.cal)) + ' por semana';
}
function textoSemana(dias) {
  const d = (dias || []).slice().sort();
  if (d.join() === '1,2,3,4,5') return 'Segunda a sexta';
  if (d.join() === '1,2,3,4,5,6') return 'Segunda a sábado';
  if (d.join() === '0,1,2,3,4,5,6') return 'Todos os dias';
  return d.map((x) => DIA_SEMANA[x]).join(', ');
}
// Dias sem trabalho do ano que cairiam em dia de trabalho (feriados que de fato param a obra)
function resumoDoAno(cal, ano) {
  const c = F.normalizar(cal);
  const semana = new Set(c.diasSemana);
  const folgas = F.folgasDoAno(c, ano);
  const trabalhados = new Set(c.dias.filter((d) => d.tipo === 'trabalhado').map((d) => d.data));
  let uteis = 0;
  const folgaSet = new Set(folgas.map((f) => f.data));
  for (let d = ano + '-01-01'; d <= ano + '-12-31'; d = somar(d, 1)) {
    if (trabalhados.has(d) || (semana.has(diaSemana(d)) && !folgaSet.has(d))) uteis++;
  }
  return { uteis, folgas: folgas.filter((f) => semana.has(diaSemana(f.data)) && !trabalhados.has(f.data)).length };
}

/* ---------- lista ---------- */
async function abrirLista() {
  estado.tela = 'lista';
  titulo('Calendários', 'Dias de trabalho e feriados das obras');
  area.innerHTML = S.carregando();
  let r;
  try { r = await api('GET', 'calendarios'); } catch (e) { area.innerHTML = '<div class="supr-nota erro">' + esc(e.message) + '</div>'; return; }
  const ano = new Date().getFullYear();
  area.innerHTML = '<p class="supr-nota">Um calendário diz em que dias a obra trabalha: dias da semana, feriados nacionais, estaduais e municipais, ' +
    'pontos facultativos, pontes e dias específicos. Cada cronograma escolhe o seu em <b>Planejamento › Configurar</b>.</p>' +
    (podeEditar() ? '<div class="supr-barra"><span class="espaco"></span>' + S.botao('novo', 'Novo calendário', { primario: true, icone: 'mais' }) + '</div>' : '') +
    S.tabela([
      { t: 'Calendário', v: (c) => esc(c.nome) + (c.padrao ? ' ' + S.tag('padrão', 'azul', 'Sugerido ao criar um cronograma') : '') },
      { t: 'Local', v: (c) => esc(c.municipioNome ? c.municipioNome + ' / ' + c.uf : c.uf || '—') },
      { t: 'Semana', v: (c) => esc(textoSemana(c.diasSemana)) + '<small>' + esc(textoHoras(F.horasDaSemana(c)) + ' por semana') + '</small>' },
      { t: 'Feriados em ' + ano, v: (c) => { const x = resumoDoAno(c, ano); return x.folgas + '<small>' + x.uteis + ' dias de trabalho no ano</small>'; }, c: 'num' },
      { t: 'Cronogramas', v: (c) => String(c.uso || 0), c: 'num' },
      { t: 'Atualizado', v: (c) => esc(S.dataHora(c.atualizadoEm)) + '<small>' + esc(c.atualizadoPorNome || '') + '</small>', c: 'nowrap' }
    ], r.calendarios, { id: (c) => c.id, vazio: 'Nenhum calendário ainda. Crie um para a cidade de cada obra (ex.: “São Paulo – capital”).' });
}

/* ---------- editor ---------- */
async function abrirCalendario(id) {
  estado.tela = 'editor';
  estado.sujo = false;
  if (!id) {
    estado.cal = { id: null, nome: '', padrao: false, revisao: 0, ...F.normalizar({ uf: 'SP' }) };
    estado.obras = [];
    titulo('Novo calendário', 'Dias de trabalho e feriados');
    await carregarMunicipios('SP');
    render();
    return;
  }
  area.innerHTML = S.carregando();
  try {
    const r = await api('GET', 'calendarios/' + encodeURIComponent(id));
    estado.cal = r.calendario;
    estado.obras = r.obras;
  } catch (e) { area.innerHTML = '<div class="supr-nota erro">' + esc(e.message) + '</div>'; return; }
  if (estado.cal.uf) await carregarMunicipios(estado.cal.uf);
  render();
}

async function carregarMunicipios(uf) {
  if (!uf || estado.municipios.has(uf)) return;
  try {
    const r = await fetch('/dados/feriados/municipais/' + uf + '.json', { credentials: 'same-origin' });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    estado.municipios.set(uf, (await r.json()).municipios);
  } catch (e) {
    estado.municipios.set(uf, []);
    S.aviso('Não foi possível carregar os municípios de ' + uf + '. Você ainda pode cadastrar os feriados municipais à mão.', 'erro');
  }
}
const normalizarTexto = (t) => S.normalizar(t).replace(/\s+/g, ' ').trim();
function municipioPorNome(uf, nome) {
  const alvo = normalizarTexto(nome);
  return (estado.municipios.get(uf) || []).find((m) => normalizarTexto(m[1]) === alvo) || null;
}

function marcarSujo() {
  estado.sujo = true;
  const b = area.querySelector('[data-acao="salvar"]');
  if (b) b.disabled = false;
  const aviso = area.querySelector('[data-sujo]');
  if (aviso) aviso.hidden = false;
}

function render() {
  const c = estado.cal;
  const editar = podeEditar();
  const dis = editar ? '' : ' disabled';
  titulo(c.id ? c.nome : 'Novo calendário', c.id ? (c.municipioNome ? c.municipioNome + ' / ' + c.uf : c.uf || 'Dias de trabalho e feriados') : 'Dias de trabalho e feriados');
  const municipios = estado.municipios.get(c.uf) || [];
  let h = '<button type="button" class="supr-voltar" data-acao="voltar">' + S.ic('voltar') + 'Voltar para a lista</button>';
  h += '<div class="supr-cab"><div><h3>' + esc(c.id ? 'Calendário' : 'Novo calendário') + '</h3><p>' +
    (estado.obras.length ? 'Usado em ' + estado.obras.length + ' cronograma(s): ' + esc(estado.obras.map((o) => o.codigo || o.nome).join(', ')) + '. Ao salvar, as datas deles são recalculadas.'
      : 'Ainda não usado por nenhum cronograma.') + '</p></div>' +
    (editar ? '<div class="supr-acoes"><span class="plan-sujo" data-sujo' + (estado.sujo ? '' : ' hidden') + '>Alterações não salvas</span>' +
      (c.id ? S.botao('excluir', 'Excluir', { icone: 'excluir', perigo: true }) : '') +
      S.botao('salvar', c.id ? 'Salvar' : 'Criar calendário', { primario: true, icone: 'salvar', desabilitado: c.id && !estado.sujo }) + '</div>' : '') + '</div>';
  h += '<div class="supr-form">' +
    '<label class="campo">Nome<input type="text" data-c="nome" maxlength="80" value="' + esc(c.nome) + '" placeholder="Ex.: São Paulo – capital"' + dis + '></label>' +
    '<label class="campo">Estado<select data-c="uf"' + dis + '><option value="">—</option>' + F.UFS.map(([uf, nome]) =>
      '<option value="' + uf + '"' + (uf === c.uf ? ' selected' : '') + '>' + esc(nome) + '</option>').join('') + '</select></label>' +
    '<label class="campo">Município<input type="text" data-c="municipio" list="calListaMunicipios" autocomplete="off" value="' + esc(c.municipioNome) + '"' +
      (c.uf ? '' : ' disabled') + dis + ' placeholder="' + (c.uf ? 'Digite e escolha' : 'Escolha o estado') + '"><datalist id="calListaMunicipios">' +
      municipios.map((m) => '<option value="' + esc(m[1]) + '"></option>').join('') + '</datalist></label>' +
    '<label class="campo plan-check cal-padrao"><input type="checkbox" data-c="padrao"' + (c.padrao ? ' checked' : '') + dis + '>Padrão para novos cronogramas</label></div>';
  h += '<section class="supr-secao"><h4>Dias e horário de trabalho<span class="espaco"></span><span class="cal-resumo" data-horas-semana>' + textoHorasSemana() + '</span></h4>' +
    '<p class="supr-dica">Um turno por dia. Se o fim for antes do início, o turno passa da meia-noite (turno da noite). As horas do dia convertem as horas de mão de obra dos serviços em dias no cronograma.</p>' +
    '<table class="cal-jornada"><thead><tr><th>Dia</th><th>Início</th><th>Fim</th><th>Intervalo (min)</th><th class="num">Horas</th><th></th></tr></thead><tbody>' +
    [1, 2, 3, 4, 5, 6, 0].map((i) => {
      const t = c.jornada[i];
      const ativo = c.diasSemana.includes(i);
      const campo = (k, tipo, extra) => '<input type="' + tipo + '" data-jornada="' + i + '" data-campo-j="' + k + '" value="' + esc(t[k]) + '"' + extra + (ativo ? '' : ' disabled') + dis + '>';
      return '<tr class="' + (ativo ? '' : 'inativo') + '"><td><label class="cal-dia"><input type="checkbox" data-semana="' + i + '"' + (ativo ? ' checked' : '') + dis + '><span>' + esc(F.DIAS_SEMANA[i]) + '</span></label></td>' +
        '<td>' + campo('inicio', 'time', '') + '</td><td>' + campo('fim', 'time', '') + '</td><td>' + campo('intervalo', 'number', ' min="0" max="720" step="5"') + '</td>' +
        '<td class="num" data-horas-dia="' + i + '">' + (ativo ? textoHoras(F.horasDoTurno(t)) : '—') + '</td>' +
        '<td>' + (editar && ativo ? '<button type="button" class="btn btn-ghost btn-xs" data-copiar-jornada="' + i + '" title="Usar este horário em todos os dias marcados">Copiar para os outros</button>' : '') + '</td></tr>';
    }).join('') + '</tbody></table></section>';
  h += '<div class="cal-grade"><div data-regras>' + htmlRegras() + '</div><div><div data-ano>' + htmlAno() + '</div><div data-pontes>' + htmlPontes() + '</div></div></div>';
  h += '<div data-dias>' + htmlDias() + '</div>';
  area.innerHTML = h;
}
function atualizarDerivados(semRegras) {
  if (!semRegras) area.querySelector('[data-regras]').innerHTML = htmlRegras();
  area.querySelector('[data-ano]').innerHTML = htmlAno();
  area.querySelector('[data-pontes]').innerHTML = htmlPontes();
  area.querySelector('[data-dias]').innerHTML = htmlDias();
}

function dataNoAno(regra) {
  const d = F.dataDaRegra(regra.regra, estado.ano);
  return d ? S.data(d).slice(0, 5) + ' ' + DIA_SEMANA[diaSemana(d)] : '—';
}
function grupoRegras(chave, tituloGrupo, regras, ligado, extra) {
  const editar = podeEditar();
  const dis = editar ? '' : ' disabled';
  const linhas = regras.map((r) => {
    const fora = r.desde && estado.ano < r.desde;
    return '<li class="' + (r.ativa ? '' : 'desligada') + '"><label><input type="checkbox" data-regra="' + esc(r.id) + '"' + (r.ativa ? ' checked' : '') +
      (ligado || r.tipo === 'facultativo' ? '' : ' disabled') + dis + '><span class="cal-data">' + esc(dataNoAno(r)) + '</span><span class="cal-nome">' + esc(r.nome) +
      (fora ? ' <small>(a partir de ' + r.desde + ')</small>' : '') + (r.regra.charAt(0) === 'P' ? ' <small>' + esc(F.descreverRegra(r.regra) === r.nome ? 'data móvel' : F.descreverRegra(r.regra)) + '</small>' : '') + '</span></label>' +
      (r.tipo === 'municipal' && editar ? '<button type="button" class="btn-icon" data-remover-municipal="' + esc(r.regra) + '" title="Tirar este feriado">' + S.ic('fechar') + '</button>' : '') + '</li>';
  }).join('');
  return '<div class="cal-grupo cal-' + chave + '"><div class="cal-grupo-cab">' +
    (chave === 'facultativo' ? '<span class="cal-grupo-titulo"><span class="cal-chave ' + chave + '"></span>' + esc(tituloGrupo) + '</span>'
      : '<label class="cal-grupo-titulo"><input type="checkbox" data-grupo="' + chave + '"' + (ligado ? ' checked' : '') + dis + '><span class="cal-chave ' + chave + '"></span>' + esc(tituloGrupo) + '</label>') +
    '<span class="cal-qtd">' + regras.filter((r) => r.ativa).length + ' de ' + regras.length + '</span></div>' +
    (regras.length ? '<ul class="cal-regras">' + linhas + '</ul>' : '') + (extra || '') + '</div>';
}
function htmlRegras() {
  const c = estado.cal;
  const regras = F.regrasDoCalendario(c);
  const de = (tipo) => regras.filter((r) => r.tipo === tipo);
  const nomeUf = (F.UFS.find((u) => u[0] === c.uf) || [])[1];
  const editar = podeEditar();
  const base = c.municipioCodigo ? (estado.municipios.get(c.uf) || []).find((m) => m[0] === c.municipioCodigo) : null;
  const addMunicipal = editar ? '<div class="cal-novo-municipal"><select data-novo="tipo"><option value="fixa">Data fixa</option>' +
    F.MOVEIS.map(([regra, nome]) => '<option value="' + regra + '">' + esc(nome) + '</option>').join('') + '</select>' +
    '<input type="text" data-novo="data" placeholder="dd/mm" maxlength="5" inputmode="numeric">' +
    '<input type="text" data-novo="nome" placeholder="Nome (ex.: Aniversário da cidade)" maxlength="120">' +
    S.botao('add-municipal', 'Adicionar', { icone: 'mais' }) + '</div>' +
    (base ? '<p class="supr-dica">' + (base[2].length ? 'Base aberta de feriados: ' + base[2].length + ' feriado(s) de ' + esc(base[1]) + '. ' : 'A base aberta não tem feriados de ' + esc(base[1]) + ': cadastre os da prefeitura. ') +
      (base[2].length ? '<a href="#" data-recarregar-municipais>Recarregar da base</a>' : '') + '</p>' : '') : '';
  return '<section class="supr-secao"><h4>Feriados e pontos facultativos</h4>' +
    '<p class="supr-dica">Marcados = a obra não trabalha. Datas de ' + estado.ano + '. Confira os estaduais e municipais com o governo do estado e a prefeitura.</p>' +
    grupoRegras('nacional', 'Nacionais', de('nacional'), c.nacionais) +
    (c.uf ? grupoRegras('estadual', 'Estaduais — ' + (nomeUf || c.uf), de('estadual'), c.estaduais) : '') +
    grupoRegras('municipal', 'Municipais' + (c.municipioNome ? ' — ' + c.municipioNome : ''), de('municipal'), c.municipais, addMunicipal) +
    grupoRegras('facultativo', 'Pontos facultativos (param só se marcados)', de('facultativo'), true) + '</section>';
}

/* ---------- ano em calendário ---------- */
function htmlAno() {
  const c = F.normalizar(estado.cal);
  const ano = estado.ano;
  const folgas = new Map(F.folgasDoAno(c, ano).map((f) => [f.data, f]));
  const pontes = new Map(F.sugerirPontes(c, ano).map((p) => [p.data, p]));
  const trabalhados = new Map(c.dias.filter((d) => d.tipo === 'trabalhado').map((d) => [d.data, d]));
  const semana = new Set(c.diasSemana);
  const hoje = hojeIso();
  const r = resumoDoAno(c, ano);
  let meses = '';
  for (let m = 0; m < 12; m++) {
    const primeiro = ano + '-' + String(m + 1).padStart(2, '0') + '-01';
    let celulas = '';
    for (let i = 0; i < diaSemana(primeiro); i++) celulas += '<span></span>';
    for (let d = primeiro; d.slice(5, 7) === primeiro.slice(5, 7); d = somar(d, 1)) {
      const f = folgas.get(d), p = pontes.get(d), t = trabalhados.get(d);
      const classes = [t ? 'trabalhado' : f ? f.tipo : !semana.has(diaSemana(d)) ? 'sem' : '', p ? 'ponte' : '', d === hoje ? 'hoje' : ''].filter(Boolean).join(' ');
      const descricao = S.data(d) + ' (' + DIA_SEMANA[diaSemana(d)] + ')' + (t ? ': trabalhado — ' + (t.motivo || 'exceção') : f ? ': ' + TIPOS[f.tipo] + ' — ' + f.nome : '') +
        (p ? ' · sugestão: ' + p.motivo : '');
      celulas += '<span class="' + classes + '" title="' + esc(descricao) + '">' + Number(d.slice(8)) + '</span>';
    }
    meses += '<div class="cal-mes"><div class="cal-mes-nome">' + MESES[m] + '</div><div class="cal-mes-grade">' +
      SEMANA_CURTA.map((x) => '<b>' + x + '</b>').join('') + celulas + '</div></div>';
  }
  return '<section class="supr-secao"><h4>' +
    '<button type="button" class="btn-icon" data-ano="-1" aria-label="Ano anterior">' + S.ic('seta-dir', 'cal-volta') + '</button>' + ano +
    '<button type="button" class="btn-icon" data-ano="1" aria-label="Próximo ano">' + S.ic('seta-dir') + '</button>' +
    '<span class="espaco"></span><span class="cal-resumo">' + r.uteis + ' dias de trabalho · ' + r.folgas + ' feriado(s) e dias parados em dia de trabalho</span></h4>' +
    '<ul class="cal-legenda">' + ['nacional', 'estadual', 'municipal', 'facultativo', 'parado'].map((t) => '<li><span class="cal-chave ' + t + '"></span>' + esc(TIPOS[t]) + '</li>').join('') +
    '<li><span class="cal-chave sem"></span>Sem trabalho na semana</li><li><span class="cal-chave ponte"></span>Ponte sugerida</li><li><span class="cal-chave trabalhado"></span>Trabalhado por exceção</li></ul>' +
    '<div class="cal-ano">' + meses + '</div></section>';
}

/* ---------- pontes ---------- */
function htmlPontes() {
  const pontes = F.sugerirPontes(estado.cal, estado.ano);
  const editar = podeEditar();
  return '<section class="supr-secao"><h4>Pontes sugeridas em ' + estado.ano + '<span class="espaco"></span>' +
    (editar && pontes.length > 1 ? S.botao('pontes-todas', 'Não trabalhar em todas') : '') + '</h4>' +
    (pontes.length ? '<p class="supr-dica">Dias de trabalho entre um feriado e o fim de semana ou entre dois feriados.</p><ul class="cal-pontes">' + pontes.map((p) =>
      '<li><span class="cal-data">' + S.data(p.data) + ' ' + DIA_SEMANA[diaSemana(p.data)] + '</span><span class="cal-nome">' + esc(p.motivo) + '</span>' +
      (editar ? S.botao('ponte', 'Não trabalhar', { dados: 'data-data="' + p.data + '"' }) : '') + '</li>').join('') + '</ul>'
      : '<p class="supr-dica">Nenhuma ponte em ' + estado.ano + ' com os feriados marcados.</p>') + '</section>';
}

/* ---------- dias específicos ---------- */
function htmlDias() {
  const c = estado.cal;
  const editar = podeEditar();
  const lista = c.dias.slice().sort((a, b) => (a.data < b.data ? -1 : 1));
  return '<section class="supr-secao"><h4>Dias específicos</h4>' +
    '<p class="supr-dica">Pontes aceitas, recesso de fim de ano, dias parados por outro motivo — ou dias em que a obra trabalha mesmo sendo feriado ou fim de semana.</p>' +
    (editar ? '<div class="cal-novo-dia"><label>De<input type="date" data-dia="de"></label><label>Até <span class="supr-dica">(opcional)</span><input type="date" data-dia="ate"></label>' +
      '<label>O que acontece<select data-dia="tipo"><option value="parado">Obra não trabalha</option><option value="trabalhado">Obra trabalha</option></select></label>' +
      '<label class="largo">Motivo<input type="text" data-dia="motivo" maxlength="120" placeholder="Ex.: recesso de fim de ano"></label>' +
      S.botao('add-dia', 'Adicionar', { icone: 'mais' }) + '</div>' : '') +
    S.tabela([
      { t: 'Data', v: (d) => S.data(d.data) + ' <small>' + DIA_SEMANA[diaSemana(d.data)] + '</small>', c: 'nowrap' },
      { t: 'Obra', v: (d) => (d.tipo === 'parado' ? S.tag('Não trabalha', 'cinza') : S.tag('Trabalha', 'azul')) },
      { t: 'Motivo', v: (d) => esc(d.motivo || '—') },
      ...(editar ? [{ t: '', v: (d) => '<button type="button" class="btn-icon" data-remover-dia="' + d.data + '" title="Tirar">' + S.ic('excluir') + '</button>', c: 'acoes' }] : [])
    ], lista, { vazio: 'Nenhum dia específico.' }) + '</section>';
}

/* ---------- ações ---------- */
function regraMunicipalDigitada() {
  const tipo = area.querySelector('[data-novo="tipo"]').value;
  const nome = area.querySelector('[data-novo="nome"]').value.trim();
  if (tipo !== 'fixa') return { regra: tipo, nome: nome || (F.MOVEIS.find((m) => m[0] === tipo) || [])[1] };
  const m = area.querySelector('[data-novo="data"]').value.trim().match(/^(\d{1,2})\/(\d{1,2})$/);
  if (!m) { S.aviso('Informe a data do feriado como dd/mm.', 'erro'); return null; }
  const regra = m[2].padStart(2, '0') + '-' + m[1].padStart(2, '0');
  if (!F.dataDaRegra(regra, 2024)) { S.aviso('Data inválida.', 'erro'); return null; }
  if (!nome) { S.aviso('Dê um nome ao feriado.', 'erro'); return null; }
  return { regra, nome };
}
function adicionarDias() {
  const de = area.querySelector('[data-dia="de"]').value;
  const ate = area.querySelector('[data-dia="ate"]').value || de;
  const tipo = area.querySelector('[data-dia="tipo"]').value;
  const motivo = area.querySelector('[data-dia="motivo"]').value.trim();
  if (!de) { S.aviso('Escolha a data.', 'erro'); return; }
  if (ate < de) { S.aviso('A data final vem antes da inicial.', 'erro'); return; }
  if (Math.round((Date.parse(ate) - Date.parse(de)) / 86400000) > 400) { S.aviso('Período longo demais (até 400 dias).', 'erro'); return; }
  const c = estado.cal;
  const semana = new Set(c.diasSemana);
  const folgas = new Set();
  for (let a = Number(de.slice(0, 4)); a <= Number(ate.slice(0, 4)); a++) for (const f of F.folgasDoAno({ ...c, dias: [] }, a)) folgas.add(f.data);
  let n = 0;
  for (let d = de; d <= ate; d = somar(d, 1)) {
    // parado: só os dias que seriam de trabalho; trabalhado: só os que não seriam
    const seriaTrabalho = semana.has(diaSemana(d)) && !folgas.has(d);
    if (de !== ate && (tipo === 'parado' ? !seriaTrabalho : seriaTrabalho)) continue;
    c.dias = c.dias.filter((x) => x.data !== d).concat([{ data: d, tipo, motivo }]);
    n++;
  }
  if (!n) { S.aviso(tipo === 'parado' ? 'Nenhum dia de trabalho nesse período.' : 'Nenhum dia sem trabalho nesse período.', 'erro'); return; }
  marcarSujo();
  atualizarDerivados(true);
  S.aviso(n + ' dia(s) adicionado(s).');
}
async function salvar() {
  const c = estado.cal;
  const corpo = { nome: c.nome, padrao: c.padrao, revisao: c.revisao, diasSemana: c.diasSemana, jornada: c.jornada, uf: c.uf, municipioCodigo: c.municipioCodigo,
    municipioNome: c.municipioNome, nacionais: c.nacionais, estaduais: c.estaduais, municipais: c.municipais, facultativos: c.facultativos,
    desativados: c.desativados, feriadosMunicipais: c.feriadosMunicipais, dias: c.dias };
  if (!c.nome.trim()) { area.querySelector('[data-c="nome"]').classList.add('invalido'); S.aviso('Dê um nome ao calendário.', 'erro'); return; }
  const botao = area.querySelector('[data-acao="salvar"]');
  if (botao) botao.disabled = true;
  try {
    const r = c.id ? await api('PUT', 'calendarios/' + encodeURIComponent(c.id), corpo) : await api('POST', 'calendarios', corpo);
    estado.cal = r.calendario;
    estado.obras = r.obras;
    estado.sujo = false;
    render();
    S.aviso('Calendário salvo.' + (r.obras.length ? ' As datas de ' + r.obras.length + ' cronograma(s) foram recalculadas.' : ''));
  } catch (e) {
    if (botao) botao.disabled = false;
    S.falhou(e);
  }
}

function sair(fn) {
  if (!estado.sujo) { fn(); return; }
  S.acao({ titulo: 'Sair sem salvar?', texto: 'O calendário tem alterações que ainda não foram salvas.', botao: 'Descartar e sair', perigo: true,
    executar: () => { estado.sujo = false; }, depois: fn });
}

function ligarEventos() {
  area.addEventListener('click', async (ev) => {
    const c = estado.cal;
    const anoBotao = ev.target.closest('[data-ano]');
    if (anoBotao && estado.tela === 'editor') { estado.ano += Number(anoBotao.dataset.ano); atualizarDerivados(); return; }
    const copiar = ev.target.closest('[data-copiar-jornada]');
    if (copiar) {
      const base = c.jornada[Number(copiar.dataset.copiarJornada)];
      const jornada = { ...c.jornada };
      for (const d of c.diasSemana) jornada[d] = { ...base };
      c.jornada = jornada;
      marcarSujo();
      render();
      return;
    }
    const rem = ev.target.closest('[data-remover-municipal]');
    if (rem) { c.feriadosMunicipais = c.feriadosMunicipais.filter((m) => m.regra !== rem.dataset.removerMunicipal); marcarSujo(); atualizarDerivados(); return; }
    const remDia = ev.target.closest('[data-remover-dia]');
    if (remDia) { c.dias = c.dias.filter((d) => d.data !== remDia.dataset.removerDia); marcarSujo(); atualizarDerivados(true); return; }
    if (ev.target.closest('[data-recarregar-municipais]')) {
      ev.preventDefault();
      const base = (estado.municipios.get(c.uf) || []).find((m) => m[0] === c.municipioCodigo);
      if (base) { c.feriadosMunicipais = base[2].map(([regra, nome]) => ({ regra, nome })); marcarSujo(); atualizarDerivados(); }
      return;
    }
    const b = ev.target.closest('[data-acao]');
    if (!b) return;
    const acao = b.dataset.acao;
    if (acao === 'novo') abrirCalendario(null);
    else if (acao === 'voltar') sair(abrirLista);
    else if (acao === 'salvar') salvar();
    else if (acao === 'excluir') {
      S.acao({ titulo: 'Excluir calendário', texto: 'Excluir o calendário “' + esc(c.nome) + '”? Não dá para desfazer.', botao: 'Excluir', perigo: true,
        executar: () => api('DELETE', 'calendarios/' + encodeURIComponent(c.id)), sucesso: 'Calendário excluído.', depois: () => { estado.sujo = false; abrirLista(); } });
    } else if (acao === 'ponte' || acao === 'pontes-todas') {
      const pontes = F.sugerirPontes(c, estado.ano).filter((p) => acao === 'pontes-todas' || p.data === b.dataset.data);
      for (const p of pontes) c.dias = c.dias.filter((d) => d.data !== p.data).concat([{ data: p.data, tipo: 'parado', motivo: p.motivo }]);
      marcarSujo();
      atualizarDerivados(true);
    } else if (acao === 'add-municipal') {
      const nova = regraMunicipalDigitada();
      if (!nova) return;
      if (c.feriadosMunicipais.some((m) => m.regra === nova.regra)) { S.aviso('Esse feriado já está na lista.', 'erro'); return; }
      c.feriadosMunicipais = c.feriadosMunicipais.concat([nova]);
      c.desativados = c.desativados.filter((x) => x !== 'm:' + nova.regra);
      marcarSujo();
      atualizarDerivados();
    } else if (acao === 'add-dia') adicionarDias();
  });
  S.aoAbrirLinha(area, (id) => { if (estado.tela === 'lista') abrirCalendario(id); });
  area.addEventListener('change', async (ev) => {
    const el = ev.target;
    const c = estado.cal;
    if (!c || estado.tela !== 'editor') return;
    if (el.dataset.c === 'nome') { c.nome = el.value; marcarSujo(); return; }
    if (el.dataset.c === 'padrao') { c.padrao = el.checked; marcarSujo(); return; }
    if (el.dataset.c === 'uf') {
      c.uf = el.value;
      c.municipioCodigo = null; c.municipioNome = ''; c.feriadosMunicipais = [];
      const campo = area.querySelector('[data-c="municipio"]');
      if (campo && c.uf && !estado.municipios.has(c.uf)) { campo.value = ''; campo.disabled = true; campo.placeholder = 'Carregando municípios…'; }
      await carregarMunicipios(c.uf);
      marcarSujo();
      render();
      return;
    }
    if (el.dataset.c === 'municipio') {
      const m = municipioPorNome(c.uf, el.value);
      if (!el.value.trim()) { c.municipioCodigo = null; c.municipioNome = ''; marcarSujo(); atualizarDerivados(); return; }
      if (!m) { el.classList.add('invalido'); S.aviso('Escolha o município na lista.', 'erro'); return; }
      el.classList.remove('invalido');
      c.municipioCodigo = m[0]; c.municipioNome = m[1];
      c.feriadosMunicipais = m[2].map(([regra, nome]) => ({ regra, nome }));
      c.desativados = c.desativados.filter((x) => !x.startsWith('m:'));
      if (!c.nome.trim()) { c.nome = m[1] + (c.uf ? ' – ' + c.uf : ''); area.querySelector('[data-c="nome"]').value = c.nome; }
      marcarSujo();
      atualizarDerivados();
      S.aviso(m[2].length ? m[2].length + ' feriado(s) municipal(is) de ' + m[1] + ' trazido(s) da base. Confira com a prefeitura.'
        : 'A base não tem feriados municipais de ' + m[1] + '. Cadastre os da prefeitura.');
      return;
    }
    if (el.dataset.jornada != null) {
      const d = Number(el.dataset.jornada);
      const t = { ...c.jornada[d] };
      if (el.dataset.campoJ === 'intervalo') t.intervalo = Math.max(0, Math.min(720, Math.round(Number(el.value) || 0)));
      else if (F.HORA_VALIDA.test(el.value)) t[el.dataset.campoJ] = el.value;
      else { el.classList.add('invalido'); S.aviso('Horário inválido.', 'erro'); return; }
      if (!(F.horasDoTurno(t) > 0)) { el.classList.add('invalido'); S.aviso('O intervalo não pode ser maior que o turno.', 'erro'); return; }
      el.classList.remove('invalido');
      c.jornada = { ...c.jornada, [d]: t };
      area.querySelector('[data-horas-dia="' + d + '"]').textContent = textoHoras(F.horasDoTurno(t));
      area.querySelector('[data-horas-semana]').textContent = textoHorasSemana();
      marcarSujo();
      return;
    }
    if (el.dataset.semana != null) {
      const i = Number(el.dataset.semana);
      c.diasSemana = el.checked ? Array.from(new Set(c.diasSemana.concat([i]))).sort() : c.diasSemana.filter((x) => x !== i);
      if (!c.diasSemana.length) { el.checked = true; c.diasSemana = [i]; S.aviso('Pelo menos um dia da semana precisa ser de trabalho.', 'erro'); return; }
      marcarSujo();
      render();
      return;
    }
    if (el.dataset.grupo) {
      c[{ nacional: 'nacionais', estadual: 'estaduais', municipal: 'municipais' }[el.dataset.grupo]] = el.checked;
      marcarSujo();
      atualizarDerivados();
      return;
    }
    if (el.dataset.regra) {
      const id = el.dataset.regra;
      if (id.startsWith('f:')) c.facultativos = el.checked ? Array.from(new Set(c.facultativos.concat([id]))) : c.facultativos.filter((x) => x !== id);
      else c.desativados = el.checked ? c.desativados.filter((x) => x !== id) : Array.from(new Set(c.desativados.concat([id])));
      marcarSujo();
      atualizarDerivados();
    }
    if (el.dataset.novo === 'tipo') area.querySelector('[data-novo="data"]').hidden = el.value !== 'fixa';
  });
  area.addEventListener('input', (ev) => {
    if (ev.target.dataset.c === 'nome' && estado.cal) { estado.cal.nome = ev.target.value; marcarSujo(); }
  });
  window.addEventListener('beforeunload', (ev) => { if (estado.sujo) { ev.preventDefault(); ev.returnValue = ''; } });
}

function entrar() {
  if (!area) {
    area = document.getElementById('calConteudo');
    if (!area) return;
    ligarEventos();
  }
  document.getElementById('calAvisoLeitura').classList.toggle('hidden', podeEditar());
  if (estado.tela === 'editor' && estado.cal) render();
  else abrirLista();
}

document.addEventListener('app:viewchange', (ev) => {
  if (ev.detail && ev.detail.view === 'calendarios') entrar();
});
