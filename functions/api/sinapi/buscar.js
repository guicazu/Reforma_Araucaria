// Busca composições SINAPI (via API pública SINPRES) com suporte a palavras
// que a descrição deve conter (q) e palavras que não deve conter (excluir).
// UF e regime fixos no Paraná / não desonerado.

const ESTADO_PADRAO = 'PR';
const DESONERADO_PADRAO = 'false';

function normalizarTexto(texto) {
  return String(texto || '').normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase();
}

export async function onRequestGet({ request }) {
  const url = new URL(request.url);
  const termo = (url.searchParams.get('q') || '').trim();
  const incluir = termo.split(/\s+/).map((palavra) => normalizarTexto(palavra.trim())).filter(Boolean);
  const excluirParam = (url.searchParams.get('excluir') || '').trim();
  const excluir = excluirParam
    ? excluirParam.split(',').map((t) => normalizarTexto(t.trim())).filter(Boolean)
    : [];

  if (termo.length < 3) {
    return Response.json({ resultados: [] });
  }

  const params = new URLSearchParams({
    search: normalizarTexto(termo),
    state: ESTADO_PADRAO,
    is_desonerated: DESONERADO_PADRAO,
    include_total: 'false',
    limit: '40'
  });

  let resp;
  try {
    resp = await fetch(
      `https://api.sinpres.com.br/api/v1/sectors/civil-construction/compositions?${params.toString()}`
    );
  } catch (e) {
    return Response.json({ resultados: [], erro: 'sinapi_indisponivel' }, { status: 502 });
  }

  if (!resp.ok) {
    return Response.json({ resultados: [], erro: 'sinapi_erro' }, { status: 502 });
  }

  const dados = await resp.json();
  let resultados = (dados.data || []).map((c) => ({
    codigo: c.code,
    descricao: c.description,
    unidade: c.unit,
    valor: typeof c.baseUnitCost === 'number' ? c.baseUnitCost / 100 : null,
    referencia: c.referenceMonth || null
  }));

  if (incluir.length) {
    resultados = resultados.filter((resultado) => {
      const descricao = normalizarTexto(resultado.descricao);
      return incluir.every((palavra) => descricao.includes(palavra));
    });
  }

  if (excluir.length) {
    resultados = resultados.filter((r) => {
      const desc = normalizarTexto(r.descricao);
      return !excluir.some((palavra) => desc.includes(palavra));
    });
  }

  return Response.json({ resultados: resultados.slice(0, 20) });
}
