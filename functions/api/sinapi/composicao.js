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
    return Response.json({ encontrado: false, erro: 'sinapi_indisponivel' }, { status: 502 });
  }

  // Código inexistente: a SINPRES responde 404, o que não é falha do serviço
  if (resp.status === 404) {
    return Response.json({ encontrado: false });
  }
  if (!resp.ok) {
    return Response.json({ encontrado: false, erro: 'sinapi_erro' }, { status: 502 });
  }

  const dados = await resp.json();
  const c = dados.data;
  if (!c) return Response.json({ encontrado: false });

  return Response.json({
    encontrado: true,
    codigo: c.code,
    descricao: c.description,
    unidade: c.unit,
    valor: typeof c.baseUnitCost === 'number' ? c.baseUnitCost / 100 : null,
    referencia: c.referenceMonth || null,
    itens: Array.isArray(c.items) ? c.items.map((item) => ({
      tipo: item.itemType,
      codigo: item.code,
      descricao: item.description,
      unidade: item.unit,
      coeficiente: Number(item.coefficient),
      valorUnitario: typeof item.unitPrice === 'number' ? item.unitPrice / 100 : null,
      valorTotal: typeof item.totalPrice === 'number' ? item.totalPrice / 100 : null
    })) : []
  });
}
