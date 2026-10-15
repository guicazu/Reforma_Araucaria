import { SINAPI_ESTADO as ESTADO_PADRAO, SINAPI_DESONERADO as DESONERADO_PADRAO } from '../../_lib/sinapi.js';

export async function onRequestGet({ request }) {
  const url = new URL(request.url);
  const codigo = (url.searchParams.get('codigo') || '').trim();
  if (!/^\d+$/.test(codigo)) return Response.json({ encontrado: false });

  const params = new URLSearchParams({
    state: ESTADO_PADRAO,
    is_desonerated: DESONERADO_PADRAO
  });
  let resposta;
  try {
    resposta = await fetch(
      `https://api.sinpres.com.br/api/v1/sectors/civil-construction/items/${encodeURIComponent(codigo)}?${params.toString()}`
    );
  } catch (error) {
    return Response.json({ encontrado: false, erro: 'sinapi_indisponivel' }, { status: 502 });
  }
  if (resposta.status === 404) return Response.json({ encontrado: false });
  if (!resposta.ok) {
    return Response.json({ encontrado: false, erro: 'sinapi_erro' }, { status: 502 });
  }
  const dados = await resposta.json();
  const item = dados.data;
  if (!item) return Response.json({ encontrado: false });

  return Response.json({
    encontrado: true,
    codigo: String(item.code),
    descricao: item.description,
    unidade: item.unit,
    valor: typeof item.unitPrice === 'number' ? item.unitPrice / 100 : null,
    referencia: item.referenceMonth || null,
    normas: item.technicalStandards || '',
    detalhes: item.generalInfo || ''
  });
}
