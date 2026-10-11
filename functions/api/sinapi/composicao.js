// Busca uma composição SINAPI específica pelo código, via API pública SINPRES.

const ESTADO_PADRAO = 'PR';
const DESONERADO_PADRAO = 'false';

export async function onRequestGet({ request }) {
  const url = new URL(request.url);
  const codigo = (url.searchParams.get('codigo') || '').trim();

  if (!codigo) {
    return Response.json({ encontrado: false });
  }

  const params = new URLSearchParams({
    state: ESTADO_PADRAO,
    is_desonerated: DESONERADO_PADRAO
  });

  let resp;
  try {
    resp = await fetch(
      `https://api.sinpres.com.br/api/v1/sectors/civil-construction/compositions/${encodeURIComponent(codigo)}?${params.toString()}`
    );
  } catch (e) {
    return Response.json({ encontrado: false });
  }

  if (!resp.ok) {
    return Response.json({ encontrado: false });
  }

  const dados = await resp.json();
  const c = dados.data;
  if (!c) return Response.json({ encontrado: false });

  return Response.json({
    encontrado: true,
    codigo: c.code,
    descricao: c.description,
    unidade: c.unit,
    valor: typeof c.baseUnitCost === 'number' ? c.baseUnitCost / 100 : null
  });
}
