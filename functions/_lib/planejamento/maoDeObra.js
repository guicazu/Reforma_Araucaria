// Horas de mão de obra de cada serviço, tiradas do orçado aberto por insumo (o mesmo de Suprimentos:
// SINAPI pela base própria e composições próprias). Profissional com unidade H vira oficial ou
// ajudante (servente, ajudante, auxiliar); encarregado, engenheiro, mestre e afins são apoio e não
// decidem a duração. Por serviço ficam o oficial com mais horas e o ajudante com mais horas.
import { orcadoDaObra } from '../suprimentos/orcado.js';

const RE_APOIO = /engenheir|encarregad|mestre de obra|t[eé]cnic|apontador|almoxarif|vigia|vigilante|top[oó]graf|desenhista|arquitet|estagi[aá]ri|nivelador/i;
const RE_AJUDANTE = /servente|ajudante|auxiliar/i;

export function papel(descricao) {
  if (RE_APOIO.test(descricao)) return 'apoio';
  if (RE_AJUDANTE.test(descricao)) return 'ajudante';
  return 'oficial';
}
// "CARPINTEIRO DE FORMAS COM ENCARGOS COMPLEMENTARES" -> "Carpinteiro de formas"
export function nomeCurto(descricao) {
  const t = String(descricao || '').replace(/\s*com encargos complementares.*$/i, '').replace(/\s*\(horista\)/i, '').trim().toLowerCase();
  return t.charAt(0).toUpperCase() + t.slice(1);
}

// { servicoId: { oficial: { nome, horas } | null, ajudante: { nome, horas } | null, apoio: [{ nome, horas }] } }
export function maoDeObraPorServico(orcado) {
  const r = {};
  for (const i of orcado.insumos || []) {
    if (i.tipo !== 'maoDeObra' || String(i.unidade || '').toUpperCase() !== 'H') continue;
    const p = papel(i.descricao);
    for (const [sid, [horas]] of Object.entries(i.servicos || {})) {
      if (!(horas > 0)) continue;
      const s = r[sid] || (r[sid] = { oficial: null, ajudante: null, apoio: [] });
      const item = { nome: nomeCurto(i.descricao), horas: Math.round(horas * 100) / 100 };
      if (p === 'apoio') s.apoio.push(item);
      else if (!s[p] || horas > s[p].horas) s[p] = item;
    }
  }
  return r;
}

// Só as horas, do jeito que o motor do cronograma usa (config.mao)
export function horasParaMotor(mapa) {
  return Object.fromEntries(Object.entries(mapa || {}).map(([sid, m]) => [sid, { oficial: m.oficial ? m.oficial.horas : 0, ajudante: m.ajudante ? m.ajudante.horas : 0 }]));
}

// Da obra; se o orçado não abrir (ex.: base SINAPI faltando), o cronograma fica só com durações manuais
export async function maoDeObraDaObra(env, orcamentoId) {
  try {
    return maoDeObraPorServico(await orcadoDaObra(env, orcamentoId));
  } catch (e) {
    console.error('[planejamento] mão de obra', orcamentoId, e && e.message);
    return {};
  }
}
