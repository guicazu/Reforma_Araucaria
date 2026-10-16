// Feriados e calendários de trabalho das obras (módulo ES, o mesmo na tela e no servidor).
// Um calendário (tela Calendários, tabela plan_calendarios) diz os dias da semana trabalhados e
// quais feriados param a obra: nacionais e pontos facultativos (calculados aqui), estaduais
// (regras abaixo) e municipais (vindos de dados/feriados/municipais/<UF>.json ao escolher o
// município e editáveis), além de dias específicos parados ou trabalhados. Feriado é uma regra
// que vale para qualquer ano: "MM-DD" ou "P+60" (dias a partir do domingo de Páscoa).
// Estaduais e municipais: base aberta github.com/joaopbini/feriados-brasil (MIT), gerada por
// dados/feriados/gerar.py. Confira com o governo do estado e a prefeitura.

const DIA = 86400000;
const tempo = (iso) => Date.UTC(Number(iso.slice(0, 4)), Number(iso.slice(5, 7)) - 1, Number(iso.slice(8, 10)));
const paraIso = (t) => new Date(t).toISOString().slice(0, 10);
const somar = (iso, n) => paraIso(tempo(iso) + n * DIA);
const diaSemana = (iso) => new Date(tempo(iso)).getUTCDay();
const ehData = (v) => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) && paraIso(tempo(v)) === v;

export const DIAS_SEMANA = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];
export const UFS = [['AC', 'Acre'], ['AL', 'Alagoas'], ['AP', 'Amapá'], ['AM', 'Amazonas'], ['BA', 'Bahia'], ['CE', 'Ceará'],
  ['DF', 'Distrito Federal'], ['ES', 'Espírito Santo'], ['GO', 'Goiás'], ['MA', 'Maranhão'], ['MT', 'Mato Grosso'],
  ['MS', 'Mato Grosso do Sul'], ['MG', 'Minas Gerais'], ['PA', 'Pará'], ['PB', 'Paraíba'], ['PR', 'Paraná'], ['PE', 'Pernambuco'],
  ['PI', 'Piauí'], ['RJ', 'Rio de Janeiro'], ['RN', 'Rio Grande do Norte'], ['RS', 'Rio Grande do Sul'], ['RO', 'Rondônia'],
  ['RR', 'Roraima'], ['SC', 'Santa Catarina'], ['SP', 'São Paulo'], ['SE', 'Sergipe'], ['TO', 'Tocantins']];

export const NACIONAIS = [
  ['01-01', 'Confraternização Universal'], ['P-2', 'Sexta-feira Santa'], ['04-21', 'Tiradentes'], ['05-01', 'Dia do Trabalho'],
  ['09-07', 'Independência do Brasil'], ['10-12', 'Nossa Senhora Aparecida'], ['11-02', 'Finados'], ['11-15', 'Proclamação da República'],
  ['11-20', 'Dia Nacional de Zumbi e da Consciência Negra', 2024], ['12-25', 'Natal']
].map(([regra, nome, desde]) => ({ id: 'n:' + regra, regra, nome, tipo: 'nacional', ...(desde ? { desde } : {}) }));

// Pontos facultativos: só param a obra se o calendário marcar
export const FACULTATIVOS = [
  ['P-48', 'Segunda-feira de Carnaval'], ['P-47', 'Terça-feira de Carnaval'], ['P-46', 'Quarta-feira de Cinzas'],
  ['P+60', 'Corpus Christi'], ['12-24', 'Véspera de Natal'], ['12-31', 'Véspera de Ano Novo']
].map(([regra, nome]) => ({ id: 'f:' + regra, regra, nome, tipo: 'facultativo' }));

const BASE_ESTADUAIS = {
  AC: [["01-22", "Dia do Católico"], ["01-23", "Dia do Evangélico"], ["03-08", "Dia da Mulher"], ["06-15", "Aniversário do Acre"], ["08-06", "Revolução Acreana"], ["09-05", "Dia da Amazônia"]],
  AL: [["06-24", "Dia de São João"], ["06-29", "Dia de São Pedro"], ["09-16", "Emancipação de Alagoas"], ["11-30", "Dia do Evangélico"]],
  AM: [["09-05", "Aniversário do Amazonas"], ["12-08", "Dia de Nossa Senhora da Conceição"]],
  AP: [["03-19", "Dia de São José"], ["05-15", "Dia de Cabralzinho"], ["07-25", "Dia de São Tiago"], ["09-13", "Aniversário da criação do ex-território federal do Amapá"], ["11-30", "Dia do Evangélico"]],
  BA: [["07-02", "Independência da Bahia"]],
  CE: [["03-25", "Data Magna do Ceará"]],
  DF: [["11-30", "Dia do Evangélico"]],
  ES: [["04-28", "Aniversário do Estado"]],
  MA: [["07-28", "Adesão ao Império Brasileiro"]],
  MS: [["10-11", "Aniversário do Mato Grosso do Sul"]],
  PA: [["08-15", "Adesão ao Império Brasileiro"], ["12-08", "N. Sra. Conceição"]],
  PB: [["07-26", "Homenagem a João Pessoa"], ["08-05", "Fundação do Estado da Paraíba"]],
  PE: [["03-06", "Revolução Pernambucana"], ["06-24", "Dia de São João"]],
  PI: [["10-19", "Dia do Piauí"]],
  RJ: [["P-47", "Carnaval"], ["04-23", "Dia de São Jorge"]],
  RN: [["10-03", "Mártires de Cunhaú e Uruaçu"]],
  RO: [["01-04", "Aniversário de Rondônia"], ["06-18", "Dia do Evangélico"]],
  RR: [["10-05", "Aniversário de Roraima"]],
  RS: [["09-20", "Proc. República Rio Grandense"]],
  SC: [["08-11", "Dia de Santa Catarina"]],
  SE: [["07-08", "Aniversário de Sergipe"]],
  SP: [["07-09", "Revolução Constitucionalista"]],
  TO: [["09-08", "Padroeira de Tocantins"], ["10-05", "Aniversário de Tocantins"]]
};
export const ESTADUAIS = Object.fromEntries(Object.entries(BASE_ESTADUAIS).map(([uf, lista]) =>
  [uf, lista.map(([regra, nome]) => ({ id: 'e:' + regra, regra, nome, tipo: 'estadual' }))]));

// Datas móveis que a tela oferece ao cadastrar um feriado municipal
export const MOVEIS = [['P-48', 'Segunda-feira de Carnaval'], ['P-47', 'Terça-feira de Carnaval'], ['P-46', 'Quarta-feira de Cinzas'],
  ['P-3', 'Quinta-feira Santa'], ['P-2', 'Sexta-feira Santa'], ['P+0', 'Domingo de Páscoa'], ['P+39', 'Ascensão'], ['P+49', 'Pentecostes'], ['P+60', 'Corpus Christi']];

export const REGRA_VALIDA = /^(\d{2}-\d{2}|P[+-]\d{1,3})$/;

// Domingo de Páscoa (algoritmo de Meeus/Jones/Butcher)
export function pascoa(ano) {
  const a = ano % 19, b = Math.floor(ano / 100), c = ano % 100, d = Math.floor(b / 4), e = b % 4, f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3), h = (19 * a + b - d - g + 15) % 30, i = Math.floor(c / 4), k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7, m = Math.floor((a + 11 * h + 22 * l) / 451);
  const mes = Math.floor((h + l - 7 * m + 114) / 31), dia = ((h + l - 7 * m + 114) % 31) + 1;
  return ano + '-' + String(mes).padStart(2, '0') + '-' + String(dia).padStart(2, '0');
}
// Data da regra no ano (null para 29/02 fora de ano bissexto)
export function dataDaRegra(regra, ano) {
  if (regra.charAt(0) === 'P') return somar(pascoa(ano), Number(regra.slice(1)));
  const iso = ano + '-' + regra;
  return ehData(iso) ? iso : null;
}
// "25/01", "Corpus Christi (Páscoa + 60 dias)"
export function descreverRegra(regra) {
  if (regra.charAt(0) !== 'P') return regra.slice(3, 5) + '/' + regra.slice(0, 2);
  const movel = MOVEIS.find((m) => m[0] === regra || (regra === 'P-0' && m[0] === 'P+0'));
  const n = Number(regra.slice(1));
  return movel ? movel[1] : 'Páscoa ' + (n < 0 ? '− ' + -n : '+ ' + n) + ' dias';
}

/* ---------- calendário ---------- */
// Configuração completa com os valores padrão (registro novo ou campos faltando)
export function normalizar(c) {
  c = c || {};
  return {
    diasSemana: Array.isArray(c.diasSemana) && c.diasSemana.length ? c.diasSemana.slice().sort() : [1, 2, 3, 4, 5],
    uf: c.uf || '', municipioCodigo: c.municipioCodigo || null, municipioNome: c.municipioNome || '',
    nacionais: c.nacionais !== false, estaduais: c.estaduais !== false, municipais: c.municipais !== false,
    facultativos: Array.isArray(c.facultativos) ? c.facultativos : [],
    desativados: Array.isArray(c.desativados) ? c.desativados : [],
    feriadosMunicipais: Array.isArray(c.feriadosMunicipais) ? c.feriadosMunicipais : [],
    dias: Array.isArray(c.dias) ? c.dias : []
  };
}

// Todas as regras do calendário, cada uma com "ativa" (para): nacionais, estaduais da UF,
// municipais e pontos facultativos
export function regrasDoCalendario(cal) {
  const c = normalizar(cal);
  const desligadas = new Set(c.desativados);
  const facultativos = new Set(c.facultativos);
  const municipais = c.feriadosMunicipais.filter((m) => m && REGRA_VALIDA.test(m.regra))
    .map((m) => ({ id: 'm:' + m.regra, regra: m.regra, nome: m.nome || 'Feriado municipal', tipo: 'municipal' }));
  return [
    ...NACIONAIS.map((r) => ({ ...r, ativa: c.nacionais && !desligadas.has(r.id) })),
    ...(ESTADUAIS[c.uf] || []).map((r) => ({ ...r, ativa: c.estaduais && !desligadas.has(r.id) })),
    ...municipais.map((r) => ({ ...r, ativa: c.municipais && !desligadas.has(r.id) })),
    ...FACULTATIVOS.map((r) => ({ ...r, ativa: facultativos.has(r.id) }))
  ];
}

// Dias sem trabalho do ano por feriado ou dia parado: [{ data, nome, tipo }] (vários nomes no mesmo dia juntos)
export function folgasDoAno(cal, ano) {
  const porData = new Map();
  const juntar = (data, nome, tipo) => {
    const x = porData.get(data);
    if (x) { if (!x.nomes.includes(nome)) x.nomes.push(nome); }
    else porData.set(data, { data, nomes: [nome], tipo });
  };
  for (const r of regrasDoCalendario(cal)) {
    if (!r.ativa || (r.desde && ano < r.desde)) continue;
    const d = dataDaRegra(r.regra, ano);
    if (d) juntar(d, r.nome, r.tipo);
  }
  for (const d of normalizar(cal).dias) {
    if (d && d.tipo === 'parado' && ehData(d.data) && d.data.slice(0, 4) === String(ano)) juntar(d.data, d.motivo || 'Dia parado', 'parado');
  }
  return Array.from(porData.values()).map((x) => ({ data: x.data, nome: x.nomes.join(' · '), tipo: x.tipo })).sort((a, b) => (a.data < b.data ? -1 : 1));
}

// O que o motor do cronograma precisa, para os anos pedidos
export function resolver(cal, anoInicio, anoFim) {
  const c = normalizar(cal);
  const folgas = [];
  for (let ano = anoInicio; ano <= anoFim; ano++) for (const f of folgasDoAno(c, ano)) folgas.push(f.data);
  return { diasSemana: c.diasSemana, feriados: folgas, trabalhados: c.dias.filter((d) => d && d.tipo === 'trabalhado' && ehData(d.data)).map((d) => d.data) };
}

// Configuração do cronograma com o calendário aplicado: semana, feriados (os do calendário mais os
// dias parados só da obra) e dias trabalhados por exceção, do ano do início a 10 anos depois
export function aplicarCalendario(config, cal) {
  if (!cal) return config;
  const ano = Number(String(config.dataInicio || '').slice(0, 4)) || new Date().getUTCFullYear();
  const r = resolver(cal, ano - 1, ano + 10);
  return { ...config, diasSemana: r.diasSemana, trabalhados: r.trabalhados, feriados: Array.from(new Set([...(config.feriados || []), ...r.feriados])) };
}

// Pontes: dia de trabalho com folga dos dois lados (feriado colado no fim de semana ou entre dois
// feriados). Ex.: feriado na terça sugere a segunda; na quinta, a sexta.
export function sugerirPontes(cal, ano) {
  const c = normalizar(cal);
  const folgas = new Map();
  for (const a of [ano - 1, ano, ano + 1]) for (const f of folgasDoAno(c, a)) folgas.set(f.data, f);
  const semana = new Set(c.diasSemana);
  const trabalhados = new Set(c.dias.filter((d) => d && d.tipo === 'trabalhado').map((d) => d.data));
  const livre = (d) => !trabalhados.has(d) && (folgas.has(d) || !semana.has(diaSemana(d)));
  const sugestoes = [];
  for (let d = ano + '-01-01'; d <= ano + '-12-31'; d = somar(d, 1)) {
    if (livre(d)) continue;
    const antes = somar(d, -1), depois = somar(d, 1);
    if (!livre(antes) || !livre(depois)) continue;
    const feriados = [folgas.get(antes), folgas.get(depois)].filter((f) => f && f.tipo !== 'parado');
    if (!feriados.length) continue;
    sugestoes.push({ data: d, motivo: 'Ponte: ' + feriados.map((f) => f.nome).join(' e ') });
  }
  return sugestoes;
}
