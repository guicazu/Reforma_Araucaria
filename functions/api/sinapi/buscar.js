// Busca composições SINAPI (via API pública SINPRES) com suporte a palavras
// que a descrição deve conter (q) e palavras que não deve conter (excluir).
// UF e regime fixos em SP / não desonerado.

const ESTADO_PADRAO = 'SP';
const DESONERADO_PADRAO = 'false';

export async function onRequestGet({ request }) {
  const url = new URL(request.url);
  const termo = (url.searchParams.get('q') || '').trim();
  const excluirParam = (url.searchParams.get('excluir') || '').trim();
  const excluir = excluirParam
    ? excluirParam.split(',').map((t) => t.trim().toLowerCase()).filter(Boolean)
    : [];

  if (termo.length < 3) {
    return Response.json({ resultados: [] });
  }

  const params = new URLSearchParams({
    search: termo,
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
    return Response.json({ resultados: [], erro: 'sinapi_indisponivel' });
  }

  if (!resp.ok) {
    return Response.json({ resultados: [], erro: 'sinapi_erro' });
  }

  const dados = await resp.json();
  let resultados = (dados.data || []).map((c) => ({
    codigo: c.code,
    descricao: c.description,
    unidade: c.unit,
    valor: typeof c.baseUnitCost === 'number' ? c.baseUnitCost / 100 : null
  }));

  if (excluir.length) {
    resultados = resultados.filter((r) => {
      const desc = (r.descricao || '').toLowerCase();
      return !excluir.some((palavra) => desc.includes(palavra));
    });
  }

  return Response.json({ resultados: resultados.slice(0, 20) });
}
