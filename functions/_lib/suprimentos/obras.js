// Obras (orçamentos) vistas por Suprimentos: lista, orçado × movimentos por insumo e por serviço
// (base da solicitação de compra e do acompanhamento) e busca de insumos fora do orçamento.
import { escolherReferencia, buscarInsumos } from '../sinapi-base.js';
import { json, falha, arred } from './base.js';
import { listarObras, orcadoDaObra } from './orcado.js';
import { movimentosDaObra, consolidar } from './saldos.js';

export async function obras({ env }) {
  return json({ obras: await listarObras(env) });
}

// Orçado da obra com o que já foi solicitado, comprado e recebido (por insumo e serviço) e os
// valores comprometido/realizado de cada serviço
export async function orcadoComMovimentos(env, orcamentoId) {
  const orcado = await orcadoDaObra(env, orcamentoId);
  const consolidado = consolidar(await movimentosDaObra(env, orcamentoId));
  const servicosEap = new Set(orcado.eap.filter((n) => n.tipo === 'servico').map((n) => n.id));

  const vistos = new Set();
  const insumos = orcado.insumos.map((i) => {
    vistos.add(i.chave);
    const mov = consolidado.insumos.get(i.chave);
    const ids = new Set(Object.keys(i.servicos));
    if (mov) for (const sid of mov.servicos.keys()) ids.add(sid);
    return {
      chave: i.chave, codigo: i.codigo, descricao: i.descricao, unidade: i.unidade, tipo: i.tipo, base: i.base,
      quantidadeOrcada: i.quantidade, valorOrcado: i.valor, precoOrcado: i.quantidade > 0 ? arred(i.valor / i.quantidade, 6) : 0,
      solicitado: arred(mov ? mov.solicitado : 0, 6), comprado: arred(mov ? mov.comprado : 0, 6), recebido: arred(mov ? mov.recebido : 0, 6),
      valorComprado: arred(mov ? mov.valorComprado : 0), valorRecebido: arred(mov ? mov.valorRecebido : 0),
      servicos: Array.from(ids).map((sid) => {
        const o = i.servicos[sid] || [0, 0];
        const m = mov && mov.servicos.get(sid);
        return {
          servicoId: sid, quantidadeOrcada: o[0], valorOrcado: o[1],
          solicitado: arred(m ? m.solicitado : 0, 6), comprado: arred(m ? m.comprado : 0, 6), recebido: arred(m ? m.recebido : 0, 6),
          naEap: servicosEap.has(sid)
        };
      })
    };
  });
  // insumos comprados fora do orçamento (não aparecem em nenhuma composição da versão)
  for (const mov of consolidado.insumos.values()) {
    if (vistos.has(mov.chave)) continue;
    insumos.push({
      chave: mov.chave, codigo: mov.codigo, descricao: mov.descricao, unidade: mov.unidade, tipo: mov.tipo, base: 'Fora do orçamento',
      quantidadeOrcada: 0, valorOrcado: 0, precoOrcado: 0, foraOrcamento: true,
      solicitado: arred(mov.solicitado, 6), comprado: arred(mov.comprado, 6), recebido: arred(mov.recebido, 6),
      valorComprado: arred(mov.valorComprado), valorRecebido: arred(mov.valorRecebido),
      servicos: Array.from(mov.servicos.entries()).map(([sid, m]) => ({
        servicoId: sid, quantidadeOrcada: 0, valorOrcado: 0, solicitado: arred(m.solicitado, 6),
        comprado: arred(m.comprado, 6), recebido: arred(m.recebido, 6), naEap: servicosEap.has(sid)
      }))
    });
  }

  // valores por serviço e totais (inclui serviços que saíram do orçamento mas têm movimento)
  const eap = orcado.eap.map((n) => {
    if (n.tipo !== 'servico') return n;
    const v = consolidado.servicos.get(n.id);
    return {
      ...n,
      comprometido: arred(v ? v.comprometido : 0), realizado: arred(v ? v.realizado : 0), emAprovacao: arred(v ? v.emAprovacao : 0),
      comprometidoPedidos: arred(v ? v.comprometidoPedidos : 0), comprometidoContratos: arred(v ? v.comprometidoContratos : 0),
      realizadoNotas: arred(v ? v.realizadoNotas : 0), realizadoMedicoes: arred(v ? v.realizadoMedicoes : 0)
    };
  });
  const foraDaEap = [];
  for (const [sid, v] of consolidado.servicos) {
    if (servicosEap.has(sid)) continue;
    foraDaEap.push({ tipo: 'servico', id: sid, eap: '—', nivel: 4, nome: 'Serviço removido da versão atual do orçamento',
      quantidade: 0, valorUnitario: 0, valor: 0, comprometido: arred(v.comprometido), realizado: arred(v.realizado), emAprovacao: arred(v.emAprovacao),
      comprometidoPedidos: arred(v.comprometidoPedidos), comprometidoContratos: arred(v.comprometidoContratos),
      realizadoNotas: arred(v.realizadoNotas), realizadoMedicoes: arred(v.realizadoMedicoes), removido: true });
  }
  const totais = { orcado: 0, comprometido: 0, realizado: 0, emAprovacao: 0 };
  for (const n of eap.concat(foraDaEap)) {
    if (n.tipo !== 'servico') continue;
    totais.orcado += n.valor || 0;
    totais.comprometido += n.comprometido || 0;
    totais.realizado += n.realizado || 0;
    totais.emAprovacao += n.emAprovacao || 0;
  }
  for (const k of Object.keys(totais)) totais[k] = arred(totais[k]);
  totais.saldo = arred(totais.orcado - totais.comprometido - totais.realizado);

  return {
    obra: orcado.obra, versao: orcado.versao, referenciaSinapi: orcado.referenciaSinapi, avisos: orcado.avisos,
    eap, foraDaEap, insumos, totais, geradoEm: orcado.geradoEm
  };
}

export async function orcadoDaObraComMovimentos({ env, params }) {
  return json(await orcadoComMovimentos(env, params.id));
}

/* ---------- insumos fora do orçamento: base SINAPI e catálogo próprio ---------- */
function tipoPorClassificacao(classificacao, unidade, descricao) {
  const c = String(classificacao || '').toUpperCase();
  if (c.startsWith('MAO DE OBRA') || c.startsWith('MÃO DE OBRA')) return 'maoDeObra';
  if (c.startsWith('EQUIPAMENTO')) return 'equipamento';
  if (!c) {
    const un = String(unidade || '').toUpperCase();
    if (un === 'H') return 'maoDeObra';
    if (un === 'CHP' || un === 'CHI' || /(?<!\p{L})(loca[cç][aã]o|aluguel)/iu.test(descricao || '')) return 'equipamento';
  }
  return 'material';
}

function normalizar(t) {
  return String(t || '').normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase();
}

export async function buscarInsumosParaCompra({ env, url }) {
  const termo = (url.searchParams.get('q') || '').trim();
  if (termo.length < 2) return json({ resultados: [] });
  const palavras = normalizar(termo).split(/[\s,;]+/).filter((p) => p.length >= 2);
  if (!palavras.length) return json({ resultados: [] });

  // catálogo próprio primeiro (insumos cadastrados pela empresa)
  const { results: proprios } = await env.DB.prepare(
    'SELECT id, codigo, nome, unidade, valorUnitario, codigoReferencia, detalhes FROM insumos ORDER BY nome COLLATE NOCASE'
  ).all();
  const resultados = [];
  for (const i of proprios) {
    const alvo = normalizar([i.codigo, i.nome, i.codigoReferencia].join(' '));
    if (!palavras.every((p) => alvo.includes(p))) continue;
    resultados.push({
      chave: i.codigoReferencia ? 'I:' + i.codigoReferencia : 'PI:' + i.id, codigo: i.codigoReferencia || i.codigo,
      descricao: i.nome, unidade: i.unidade, tipo: tipoPorClassificacao('', i.unidade, i.nome), preco: Number(i.valorUnitario) || 0, base: 'Própria'
    });
    if (resultados.length >= 15) break;
  }

  const escolha = await escolherReferencia(env, '');
  if (escolha.ref) {
    const linhas = await buscarInsumos(env, escolha.ref, palavras, 40);
    for (const x of linhas) {
      const chave = 'I:' + x.codigo;
      if (resultados.some((r) => r.chave === chave)) continue;
      resultados.push({
        chave, codigo: String(x.codigo), descricao: x.descricao, unidade: x.unidade,
        tipo: tipoPorClassificacao(x.classificacao, x.unidade, x.descricao), preco: x.preco == null ? null : Number(x.preco),
        base: 'SINAPI', referencia: escolha.ref.mes
      });
    }
  }
  return json({ resultados, referencia: escolha.ref ? escolha.ref.mes : null });
}

export function exigirServicos(orcado) {
  const ids = new Set(orcado.eap.filter((n) => n.tipo === 'servico').map((n) => n.id));
  if (!ids.size) falha(400, 'orcamento_sem_servicos', 'O orçamento desta obra ainda não tem serviços para apropriar as compras.');
  return ids;
}
