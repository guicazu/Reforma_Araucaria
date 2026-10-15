// Busca composições SINAPI (via API pública SINPRES) por palavras, em qualquer ordem.
// Vêm primeiro as composições com mais palavras encontradas; "excluir" (termos separados
// por vírgula) remove as que contêm qualquer um deles. UF e regime: os de functions/_lib/sinapi.js.

import { SINAPI_ESTADO as ESTADO_PADRAO, SINAPI_DESONERADO as DESONERADO_PADRAO } from '../../_lib/sinapi.js';
const LIMITE_SINPRES = 100;       // máximo aceito pela SINPRES por consulta
const MAX_PALAVRAS_CONSULTA = 6;  // limita quantas consultas uma busca dispara
const MAX_RESULTADOS = 60;
// Palavras muito comuns não ajudam a encontrar nem a ordenar
const PALAVRAS_IGNORADAS = new Set(['a', 'o', 'as', 'os', 'ao', 'aos', 'de', 'da', 'do', 'das', 'dos', 'e', 'em',
  'no', 'na', 'nos', 'nas', 'um', 'uma', 'para', 'por', 'com', 'ou', 'que']);

function normalizarTexto(texto) {
  return String(texto || '').normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase();
}

function extrairPalavras(termo) {
  const palavras = [];
  for (const palavra of normalizarTexto(termo).split(/[\s,;]+/)) {
    if (palavra.length >= 2 && !PALAVRAS_IGNORADAS.has(palavra) && !palavras.includes(palavra)) palavras.push(palavra);
  }
  return palavras;
}

function extrairExclusoes(texto) {
  return String(texto || '').split(',')
    .map((termo) => normalizarTexto(termo).trim().replace(/\s+/g, ' '))
    .filter(Boolean);
}

async function consultarSinpres(termo) {
  const params = new URLSearchParams({
    search: termo,
    state: ESTADO_PADRAO,
    is_desonerated: DESONERADO_PADRAO,
    include_total: 'false',
    limit: String(LIMITE_SINPRES)
  });
  // Cache de 1 h na Cloudflare: os preços mudam por mês e as mesmas palavras se repetem enquanto se digita.
  // Só respostas boas: um "limite excedido" (429) guardado travaria a busca por 1 h
  const resp = await fetch(
    `https://api.sinpres.com.br/api/v1/sectors/civil-construction/compositions?${params.toString()}`,
    { cf: { cacheTtlByStatus: { '200-299': 3600, '300-599': 0 } } }
  );
  if (!resp.ok) throw new Error('sinapi_erro');
  const dados = await resp.json();
  return Array.isArray(dados.data) ? dados.data : [];
}

export async function onRequestGet({ request }) {
  const url = new URL(request.url);
  const palavras = extrairPalavras(url.searchParams.get('q'));
  const exclusoes = extrairExclusoes(url.searchParams.get('excluir'));

  if (!palavras.some((palavra) => palavra.length >= 3)) {
    return Response.json({ resultados: [], palavras });
  }

  // A SINPRES só devolve o que tem TODAS as palavras da consulta (em qualquer ordem) e compara
  // palavras inteiras ("25" não acha "25MPA"). Para trazer também quem tem parte delas: uma
  // consulta com todas; com todas menos uma (tolera uma palavra que não aparece, como erro de
  // digitação); e cada palavra sozinha. A contagem abaixo aceita pedaços de palavra.
  const consulta = palavras.slice(0, MAX_PALAVRAS_CONSULTA);
  const termos = new Set([consulta.join(' ')]);
  if (consulta.length >= 3) consulta.forEach((_, i) => termos.add(consulta.filter((__, j) => j !== i).join(' ')));
  if (consulta.length >= 2) consulta.forEach((palavra) => termos.add(palavra));

  const respostas = await Promise.allSettled([...termos].map(consultarSinpres));
  if (respostas.every((resposta) => resposta.status === 'rejected')) {
    return Response.json({ resultados: [], palavras, erro: 'sinapi_indisponivel' }, { status: 502 });
  }

  const porCodigo = new Map();
  for (const resposta of respostas) {
    if (resposta.status !== 'fulfilled') continue;
    for (const c of resposta.value) if (!porCodigo.has(c.code)) porCodigo.set(c.code, c);
  }

  const resultados = [];
  for (const c of porCodigo.values()) {
    const texto = normalizarTexto(c.description);
    if (exclusoes.some((termo) => texto.includes(termo))) continue;
    let encontradas = 0;
    let posicao = 0;
    for (const palavra of palavras) {
      const indice = texto.indexOf(palavra);
      if (indice >= 0) { encontradas++; posicao += indice; }
    }
    if (!encontradas) continue;
    resultados.push({
      codigo: c.code,
      descricao: c.description,
      unidade: c.unit,
      valor: typeof c.baseUnitCost === 'number' ? c.baseUnitCost / 100 : null,
      referencia: c.referenceMonth || null,
      encontradas,
      posicao,
      tamanho: texto.length
    });
  }

  // Mais palavras encontradas primeiro; no empate, quem traz as palavras mais cedo e a descrição mais curta
  resultados.sort((a, b) => b.encontradas - a.encontradas || a.posicao - b.posicao || a.tamanho - b.tamanho);

  return Response.json({
    resultados: resultados.slice(0, MAX_RESULTADOS).map(({ posicao, tamanho, ...resultado }) => resultado),
    palavras
  });
}
