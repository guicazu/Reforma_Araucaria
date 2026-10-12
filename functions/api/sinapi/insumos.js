const ESTADO_PADRAO = 'PR';
const DESONERADO_PADRAO = 'false';

function normalizarTexto(texto) {
  return String(texto || '').normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase();
}

export async function onRequestGet({ request }) {
  const url = new URL(request.url);
  const termo = (url.searchParams.get('q') || '').trim();
  if (termo.length < 2) return Response.json({ resultados: [] });

  const params = new URLSearchParams({
    search: normalizarTexto(termo),
    state: ESTADO_PADRAO,
    is_desonerated: DESONERADO_PADRAO,
    limit: '40'
  });
  const codigoExato = /^\d+$/.test(termo);
  const caminho = codigoExato
    ? `items/${encodeURIComponent(termo)}?${new URLSearchParams({state: ESTADO_PADRAO, is_desonerated: DESONERADO_PADRAO})}`
    : `items?${params.toString()}`;

  let resposta;
  try {
    resposta = await fetch(`https://api.sinpres.com.br/api/v1/sectors/civil-construction/${caminho}`);
  } catch (error) {
    return Response.json({ resultados: [], erro: 'sinapi_indisponivel' }, { status: 502 });
  }
  if (codigoExato && resposta.status === 404) return Response.json({ resultados: [] });
  if (!resposta.ok) {
    return Response.json({ resultados: [], erro: 'sinapi_erro' }, { status: 502 });
  }

  const dados = await resposta.json();
  const itens = codigoExato ? (dados.data ? [dados.data] : []) : (Array.isArray(dados.data) ? dados.data : []);
  return Response.json({
    resultados: itens.map((item) => ({
      codigo: String(item.code),
      descricao: item.description,
      unidade: item.unit,
      valor: typeof item.unitPrice === 'number' ? item.unitPrice / 100 : null,
      referencia: item.referenceMonth || null
    }))
  });
}
