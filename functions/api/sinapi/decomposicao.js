// Abre composições SINAPI até os insumos (endpoint "expanded" da SINPRES) para os relatórios:
// separação de material, mão de obra e equipamento e curva ABC de insumos.
// GET /api/sinapi/decomposicao?codigos=87879,103355&mes=2026-08 (até MAX_CODIGOS por chamada; o mês
// é opcional e evita consultá-lo de novo a cada lote)
//
// A SINPRES não informa se um insumo é material ou mão de obra, então a classificação segue
// a estrutura do SINAPI:
// - composição em CHP/CHI (custo horário de equipamento) é equipamento, e conta como um recurso;
// - composição em H "com encargos complementares" (pedreiro, servente...) é mão de obra;
// - insumo em H é mão de obra; locação/aluguel é equipamento; o resto é material;
// - demais composições auxiliares (argamassa, concreto...) são abertas até esses recursos.

import { SINAPI_ESTADO, SINAPI_DESONERADO } from '../../_lib/sinapi.js';

const BASE = 'https://api.sinpres.com.br/api/v1/sectors/civil-construction/compositions/';
const MAX_CODIGOS = 15;            // cada código é uma consulta (+ até 4 do mês); o Pages limita subrequisições
// a referência muda 1x por mês; erros e "limite excedido" (429) não ficam guardados
const CACHE = { cf: { cacheEverything: true, cacheTtlByStatus: { '200-299': 86400, '404': 3600, '300-599': 0 } } };
const ENCARGOS = /ENCARGOS COMPLEMENTARES/i;
// palavra inteira: "colocação" não é locação
const LOCACAO = /(?<!\p{L})(loca[cç][aã]o|aluguel)/iu;

function unidadeDe(no) { return String(no.unit || '').trim().toUpperCase(); }

function tipoRecurso(no) {
  const un = unidadeDe(no);
  if (un === 'CHP' || un === 'CHI' || LOCACAO.test(no.description || '')) return 'equipamento';
  if (un === 'H') return 'maoDeObra';
  return 'material';
}

function ehRecurso(no) {
  if (no.item_type === 'INPUT') return true;
  const un = unidadeDe(no);
  if (un === 'CHP' || un === 'CHI') return true;
  if (un === 'H' && ENCARGOS.test(no.description || '')) return true;
  return no.truncated || !Array.isArray(no.items) || !no.items.length;
}

// Soma os coeficientes de cada recurso por unidade do serviço (o mesmo insumo pode
// aparecer em várias composições auxiliares)
function coletar(no, fator, recursos) {
  for (const filho of no.items || []) {
    const coeficiente = fator * (Number(filho.coefficient) || 0);
    if (!ehRecurso(filho)) { coletar(filho, coeficiente, recursos); continue; }
    const chave = (filho.item_type === 'INPUT' ? 'I' : 'C') + ':' + filho.code;
    const atual = recursos.get(chave);
    if (atual) { atual.coeficiente += coeficiente; continue; }
    recursos.set(chave, {
      chave,
      codigo: String(filho.code),
      descricao: filho.description || '',
      unidade: filho.unit || '',
      tipo: tipoRecurso(filho),
      coeficiente,
      preco: typeof filho.unit_price === 'number' ? filho.unit_price / 100 : 0
    });
  }
}

async function buscarJson(url) {
  const resposta = await fetch(url, CACHE);
  if (resposta.status === 404) return { naoEncontrado: true };
  if (resposta.status === 429) return { limite: true, espera: Number(resposta.headers.get('retry-after')) || 60 };
  if (!resposta.ok) return { falha: true };
  return { dados: await resposta.json() };
}

// O "expanded" exige o mês; ele vem na consulta simples de uma composição. Nem todo código
// existe nessa consulta (ex.: 103355), então tenta alguns e, por fim, o servente (88316)
const CODIGO_SEMPRE_PRESENTE = '88316';
async function mesDeReferencia(codigos, params) {
  for (const codigo of codigos.slice(0, 3).concat(CODIGO_SEMPRE_PRESENTE)) {
    const r = await buscarJson(BASE + encodeURIComponent(codigo) + '?' + params);
    if (r.limite) return r;
    if (r.dados && r.dados.data && r.dados.data.referenceMonth) return { mes: r.dados.data.referenceMonth };
  }
  return {};
}

async function decompor(codigo, params) {
  const r = await buscarJson(BASE + encodeURIComponent(codigo) + '/expanded?' + params);
  if (r.limite) return { codigo, erro: 'limite', espera: r.espera };
  if (r.naoEncontrado) return { codigo, erro: 'nao_encontrado' };
  if (r.falha || !r.dados || !r.dados.data) return { codigo, erro: 'falha' };
  const raiz = r.dados.data;
  const recursos = new Map();
  coletar(raiz, 1, recursos);
  return {
    codigo,
    unidade: raiz.unit || '',
    preco: typeof raiz.unit_price === 'number' ? raiz.unit_price / 100 : null,
    recursos: Array.from(recursos.values())
  };
}

export async function onRequestGet({ request }) {
  const url = new URL(request.url);
  const codigos = Array.from(new Set((url.searchParams.get('codigos') || '')
    .split(',').map((c) => c.trim()).filter((c) => /^\d+$/.test(c))));
  if (!codigos.length) return Response.json({ referencia: null, composicoes: [] });
  if (codigos.length > MAX_CODIGOS) {
    return Response.json({ erro: 'codigos_demais', maximo: MAX_CODIGOS }, { status: 400 });
  }

  const params = new URLSearchParams({ state: SINAPI_ESTADO, is_desonerated: SINAPI_DESONERADO });
  let referencia = /^\d{4}-\d{2}$/.test(url.searchParams.get('mes') || '') ? url.searchParams.get('mes') : '';
  if (!referencia) {
    let r;
    try {
      r = await mesDeReferencia(codigos, params);
    } catch (e) {
      return Response.json({ erro: 'sinapi_indisponivel' }, { status: 502 });
    }
    if (r.limite) return Response.json({ erro: 'limite', espera: r.espera }, { status: 429 });
    if (!r.mes) return Response.json({ erro: 'sinapi_indisponivel' }, { status: 502 });
    referencia = r.mes;
  }
  params.set('month', referencia);

  const composicoes = await Promise.all(codigos.map((codigo) =>
    decompor(codigo, params).catch(() => ({ codigo, erro: 'falha' }))));
  return Response.json({ referencia, composicoes });
}
