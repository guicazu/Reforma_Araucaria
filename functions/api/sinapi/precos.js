// Custos de várias composições SINAPI num mês da base própria, para "Alterar referência" do orçamento.
// GET /api/sinapi/precos?mes=AAAA-MM&codigos=87879,103355  ->  { referencia, composicoes: [...] }

import { escolherReferencia, respostaReferenciaIndisponivel, precosComposicoes } from '../../_lib/sinapi-base.js';

const MAX_CODIGOS = 500;

export async function onRequestGet({ request, env }) {
  const url = new URL(request.url);
  const mes = url.searchParams.get('mes') || '';
  if (!mes) return Response.json({ erro: 'referencia_obrigatoria' }, { status: 400 });
  const codigos = Array.from(new Set((url.searchParams.get('codigos') || '')
    .split(',').map((c) => c.trim()).filter((c) => /^\d+$/.test(c))));
  if (codigos.length > MAX_CODIGOS) return Response.json({ erro: 'codigos_demais', maximo: MAX_CODIGOS }, { status: 400 });
  const { ref, erro } = await escolherReferencia(env, mes);
  if (erro || !ref) return respostaReferenciaIndisponivel(mes, erro);
  return Response.json({ referencia: ref.mes, composicoes: codigos.length ? await precosComposicoes(env, ref, codigos) : [] });
}
