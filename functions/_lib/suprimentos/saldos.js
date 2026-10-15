// Movimentos de Suprimentos de uma obra consolidados por insumo e por serviço da EAP:
// - quantidades: solicitado (SC), comprado (pedidos) e recebido (notas fiscais);
// - valores por serviço: comprometido (pedido autorizado ainda não entregue + saldo de contrato a
//   medir), realizado (notas fiscais + medições autorizadas) e em aprovação (pedidos e contratos
//   aguardando autorização). Frete, desconto e impostos do pedido/nota são rateados pelos itens.
import { lerJson } from './base.js';

export async function movimentosDaObra(env, orcamentoId) {
  const [sc, ped, nf, ctr, med] = await env.DB.batch([
    env.DB.prepare(
      `SELECT id, solicitacaoId, insumoChave, insumoCodigo, descricao, unidade, tipo, quantidade, precoOrcado,
              apropriacoes, status, encerrado
         FROM supr_solicitacao_itens WHERE orcamentoId = ? AND status IN ('pendente', 'autorizado')`
    ).bind(orcamentoId),
    env.DB.prepare(
      `SELECT pi.id, pi.pedidoId, pi.solicitacaoItemId, pi.insumoChave, pi.insumoCodigo, pi.descricao, pi.unidade, pi.tipo,
              pi.quantidade, pi.quantidadeEncerrada,
              pi.precoUnitario, pi.valorTotal, pi.apropriacoes, p.status AS pedidoStatus, p.valorItens, p.valorTotal AS pedidoTotal
         FROM supr_pedido_itens pi JOIN supr_pedidos p ON p.id = pi.pedidoId
        WHERE p.orcamentoId = ? AND p.status NOT IN ('cancelado', 'reprovado')`
    ).bind(orcamentoId),
    env.DB.prepare(
      `SELECT ni.id, ni.pedidoItemId, ni.insumoChave, ni.insumoCodigo, ni.descricao, ni.unidade, ni.tipo,
              ni.quantidade, ni.valorTotal, ni.apropriacoes,
              n.valorProdutos, n.valorTotal AS notaTotal
         FROM supr_nota_itens ni JOIN supr_notas n ON n.id = ni.notaId
        WHERE n.orcamentoId = ? AND n.status = 'lancada'`
    ).bind(orcamentoId),
    env.DB.prepare(
      `SELECT ci.id, ci.contratoId, ci.servicoId, ci.quantidade, ci.valorTotal, c.status AS contratoStatus
         FROM supr_contrato_itens ci JOIN supr_contratos c ON c.id = ci.contratoId
        WHERE c.orcamentoId = ? AND c.status IN ('pendente', 'autorizado', 'encerrado')`
    ).bind(orcamentoId),
    env.DB.prepare(
      `SELECT mi.contratoItemId, mi.quantidade, mi.valor, m.status
         FROM supr_medicao_itens mi JOIN supr_medicoes m ON m.id = mi.medicaoId
        WHERE m.orcamentoId = ? AND m.status IN ('pendente', 'autorizada')`
    ).bind(orcamentoId)
  ]);
  return { scItens: sc.results, pedidoItens: ped.results, notaItens: nf.results, contratoItens: ctr.results, medicaoItens: med.results };
}

function fracoes(apropriacoes) {
  return lerJson(apropriacoes, []).map((a) => [a.servicoId, (Number(a.percentual) || 0) / 100]);
}

// Quanto já foi entregue (notas) de cada item de pedido e comprado (pedidos) de cada item de SC
export function indicesDeAtendimento(mov) {
  const recebidoPorPedidoItem = new Map();
  for (const n of mov.notaItens) {
    if (n.pedidoItemId) recebidoPorPedidoItem.set(n.pedidoItemId, (recebidoPorPedidoItem.get(n.pedidoItemId) || 0) + n.quantidade);
  }
  const compradoPorScItem = new Map();
  for (const p of mov.pedidoItens) {
    if (!p.solicitacaoItemId) continue;
    const efetivo = Math.max(0, p.quantidade - (p.quantidadeEncerrada || 0));
    compradoPorScItem.set(p.solicitacaoItemId, (compradoPorScItem.get(p.solicitacaoItemId) || 0) + efetivo);
  }
  return { recebidoPorPedidoItem, compradoPorScItem };
}

// SC com saldo encerrado só conta o que chegou a ser comprado
export function quantidadeSolicitadaEfetiva(item, compradoPorScItem) {
  if (!item.encerrado) return item.quantidade;
  return Math.min(item.quantidade, compradoPorScItem.get(item.id) || 0);
}

export function consolidar(mov) {
  const { recebidoPorPedidoItem, compradoPorScItem } = indicesDeAtendimento(mov);
  const insumos = new Map();   // chave -> { solicitado, comprado, recebido, valorComprado, valorRecebido, servicos: Map }
  const servicos = new Map();  // servicoId -> { comprometido, realizado, emAprovacao, ... }

  const doInsumo = (item) => {
    let x = insumos.get(item.insumoChave);
    if (!x) {
      x = { chave: item.insumoChave, codigo: item.insumoCodigo || '', descricao: item.descricao || '', unidade: item.unidade || '',
        tipo: item.tipo || 'material', solicitado: 0, comprado: 0, recebido: 0, valorComprado: 0, valorRecebido: 0, servicos: new Map() };
      insumos.set(item.insumoChave, x);
    }
    return x;
  };
  const noServico = (insumo, servicoId) => {
    let s = insumo.servicos.get(servicoId);
    if (!s) { s = { solicitado: 0, comprado: 0, recebido: 0 }; insumo.servicos.set(servicoId, s); }
    return s;
  };
  const doServico = (servicoId) => {
    let s = servicos.get(servicoId);
    if (!s) {
      s = { comprometido: 0, realizado: 0, emAprovacao: 0, comprometidoPedidos: 0, comprometidoContratos: 0, realizadoNotas: 0, realizadoMedicoes: 0 };
      servicos.set(servicoId, s);
    }
    return s;
  };

  for (const i of mov.scItens) {
    const q = quantidadeSolicitadaEfetiva(i, compradoPorScItem);
    const x = doInsumo(i);
    x.solicitado += q;
    for (const [sid, f] of fracoes(i.apropriacoes)) noServico(x, sid).solicitado += q * f;
  }

  // valor já entregue de cada item de pedido, com o rateio de frete/impostos da nota
  const valorEntreguePorPedidoItem = new Map();
  for (const n of mov.notaItens) {
    if (!n.pedidoItemId) continue;
    const fator = n.valorProdutos > 0 ? n.notaTotal / n.valorProdutos : 1;
    valorEntreguePorPedidoItem.set(n.pedidoItemId, (valorEntreguePorPedidoItem.get(n.pedidoItemId) || 0) + n.valorTotal * fator);
  }
  // Comprometido do pedido = valor do pedido − valor já entregue em nota (frete cobrado na nota não
  // conta duas vezes), rateado pelos serviços dos itens que ainda faltam entregar
  const porPedido = new Map();
  for (const p of mov.pedidoItens) {
    if (!porPedido.has(p.pedidoId)) porPedido.set(p.pedidoId, []);
    porPedido.get(p.pedidoId).push(p);
  }
  for (const itens of porPedido.values()) {
    const { pedidoStatus, valorItens, pedidoTotal } = itens[0];
    const fator = valorItens > 0 ? pedidoTotal / valorItens : 1;
    let valorEfetivo = 0, entregue = 0, pesoTotal = 0;
    const pesos = new Map();
    for (const p of itens) {
      const efetivo = Math.max(0, p.quantidade - (p.quantidadeEncerrada || 0));
      const falta = Math.max(0, efetivo - (recebidoPorPedidoItem.get(p.id) || 0));
      const x = doInsumo(p);
      x.comprado += efetivo;
      x.valorComprado += efetivo * p.precoUnitario * fator;
      valorEfetivo += efetivo * p.precoUnitario * fator;
      entregue += valorEntreguePorPedidoItem.get(p.id) || 0;
      const base = pedidoStatus === 'pendente' ? efetivo : falta;
      for (const [sid, f] of fracoes(p.apropriacoes)) {
        noServico(x, sid).comprado += efetivo * f;
        const peso = base * p.precoUnitario * f;
        if (peso > 0) { pesos.set(sid, (pesos.get(sid) || 0) + peso); pesoTotal += peso; }
      }
    }
    if (!(pesoTotal > 0)) continue;
    if (pedidoStatus === 'pendente') {
      for (const [sid, peso] of pesos) doServico(sid).emAprovacao += valorEfetivo * peso / pesoTotal;
    } else if (pedidoStatus === 'autorizado' || pedidoStatus === 'parcial') {
      const restante = Math.max(0, valorEfetivo - entregue);
      for (const [sid, peso] of pesos) {
        const s = doServico(sid);
        s.comprometido += restante * peso / pesoTotal;
        s.comprometidoPedidos += restante * peso / pesoTotal;
      }
    }
  }

  for (const n of mov.notaItens) {
    const fator = n.valorProdutos > 0 ? n.notaTotal / n.valorProdutos : 1;
    const x = doInsumo(n);
    x.recebido += n.quantidade;
    x.valorRecebido += n.valorTotal * fator;
    for (const [sid, f] of fracoes(n.apropriacoes)) {
      noServico(x, sid).recebido += n.quantidade * f;
      const s = doServico(sid);
      s.realizado += n.valorTotal * fator * f;
      s.realizadoNotas += n.valorTotal * fator * f;
    }
  }

  const medidoPorItem = new Map();
  for (const m of mov.medicaoItens) {
    if (m.status !== 'autorizada') continue;
    medidoPorItem.set(m.contratoItemId, (medidoPorItem.get(m.contratoItemId) || 0) + m.valor);
  }
  for (const c of mov.contratoItens) {
    if (!c.servicoId) continue;
    const s = doServico(c.servicoId);
    const medido = medidoPorItem.get(c.id) || 0;
    s.realizado += medido;
    s.realizadoMedicoes += medido;
    if (c.contratoStatus === 'pendente') s.emAprovacao += c.valorTotal;
    else if (c.contratoStatus === 'autorizado') {
      const saldo = Math.max(0, c.valorTotal - medido);
      s.comprometido += saldo;
      s.comprometidoContratos += saldo;
    }
  }

  return { insumos, servicos, recebidoPorPedidoItem, compradoPorScItem };
}

// Saldo para solicitar de cada insumo em cada serviço: orçado − solicitado
export function saldoParaSolicitar(orcado, consolidado, chave, servicoId) {
  const ins = orcado.insumos.find((i) => i.chave === chave);
  const orc = ins && ins.servicos[servicoId] ? ins.servicos[servicoId][0] : 0;
  const mov = consolidado.insumos.get(chave);
  const sol = mov && mov.servicos.get(servicoId) ? mov.servicos.get(servicoId).solicitado : 0;
  return orc - sol;
}
