// Busca de insumos SINAPI por código ou palavras (todas precisam aparecer): na base própria, no mês
// pedido ou no mais recente, ou, sem mês importado, na API pública SINPRES.
import { SINAPI_ESTADO as ESTADO_PADRAO, SINAPI_DESONERADO as DESONERADO_PADRAO } from '../../_lib/sinapi.js';
import { escolherReferencia, respostaReferenciaIndisponivel, buscarInsumos } from '../../_lib/sinapi-base.js';

function normalizarTexto(texto) {
  return String(texto || '').normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase();
}

export async function onRequestGet({ request, env }) {
  const url = new URL(request.url);
  const termo = (url.searchParams.get('q') || '').trim();
  if (termo.length < 2) return Response.json({ resultados: [] });
  const mes = url.searchParams.get('mes') || '';
  const escolha = await escolherReferencia(env, mes);
  if (escolha.erro) return respostaReferenciaIndisponivel(mes, escolha.erro);
  if (escolha.ref) {
    const palavras = normalizarTexto(termo).split(/[\s,;]+/).filter((p) => p.length >= 2);
    const linhas = await buscarInsumos(env, escolha.ref, palavras, 40);
    return Response.json({
      fonte: 'base',
      resultados: linhas.map((x) => ({ codigo: String(x.codigo), descricao: x.descricao, unidade: x.unidade, valor: x.preco, classificacao: x.classificacao, referencia: escolha.ref.mes }))
    });
  }

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
