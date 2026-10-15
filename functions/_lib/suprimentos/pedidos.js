// Pedido de compra: nasce da cotação (gerarPedidos em cotacoes.js) ou direto dos itens autorizados
// das solicitações. Passa pela autorização com alçada (parâmetro), vai ao fornecedor por e-mail com
// o PDF e o link de confirmação, e é atendido pelas notas fiscais (parcial → entregue). O saldo
// não entregue pode ser encerrado; pedido sem nota pode ser cancelado.
import {
  json, falha, uuid, agora, hoje, texto, numero, dataIso, escolha, listaObrigatoria, lista, lerJson, arred, arredQtd,
  token, exigirEdicao, exigirAlcada, historico, lerHistorico, proximoNumero, parametros, ligado, fornecedorAtivo, validarParcelas,
  parcelasDoTexto
} from './base.js';
import { atendimentoDosItens } from './solicitacoes.js';
import { condicaoPorId } from './cadastros.js';
import { listarObras } from './orcado.js';
import { pdfPedido, base64, moeda, dataBr } from './pdf.js';
import { enviarEmail } from '../email.js';

const TOLERANCIA = 1e-6;
const ATIVOS = ['autorizado', 'parcial'];

async function pedidoOuErro(env, id) {
  const p = await env.DB.prepare('SELECT * FROM supr_pedidos WHERE id = ?').bind(id).first();
  if (!p) falha(404, 'nao_encontrado', 'Pedido não encontrado.');
  return p;
}

// Itens do pedido com o que já foi entregue (notas lançadas)
async function itensComEntrega(env, pedidoIds) {
  const { results } = await env.DB.prepare(
    `SELECT pi.*, (SELECT COALESCE(SUM(ni.quantidade), 0) FROM supr_nota_itens ni JOIN supr_notas n ON n.id = ni.notaId
                    WHERE ni.pedidoItemId = pi.id AND n.status = 'lancada') AS recebido
       FROM supr_pedido_itens pi WHERE pi.pedidoId IN (SELECT value FROM json_each(?1)) ORDER BY pi.pedidoId, pi.seq`
  ).bind(lista(pedidoIds)).all();
  return results.map((i) => {
    const efetivo = Math.max(0, i.quantidade - (i.quantidadeEncerrada || 0));
    return { ...i, apropriacoes: lerJson(i.apropriacoes, []), saldo: Math.max(0, arredQtd(efetivo - i.recebido)) };
  });
}

// Depois de nota lançada/cancelada: autorizado ↔ parcial ↔ entregue
export async function recalcularStatusPedidos(env, pedidoIds) {
  if (!pedidoIds.length) return [];
  const { results: pedidos } = await env.DB.prepare(
    `SELECT id, status FROM supr_pedidos WHERE id IN (SELECT value FROM json_each(?1)) AND status IN ('autorizado', 'parcial', 'entregue')`
  ).bind(lista(pedidoIds)).all();
  if (!pedidos.length) return [];
  const itens = await itensComEntrega(env, pedidos.map((p) => p.id));
  const comandos = [];
  for (const p of pedidos) {
    const seus = itens.filter((i) => i.pedidoId === p.id);
    const recebido = seus.reduce((s, i) => s + i.recebido, 0);
    const pendente = seus.reduce((s, i) => s + i.saldo, 0);
    const novo = pendente <= TOLERANCIA ? 'entregue' : recebido > TOLERANCIA ? 'parcial' : 'autorizado';
    if (novo !== p.status) comandos.push(env.DB.prepare('UPDATE supr_pedidos SET status = ?, atualizadoEm = ? WHERE id = ?').bind(novo, agora(), p.id));
  }
  return comandos;
}

/* ---------- lista e detalhe ---------- */
export async function listarPedidos({ env, url }) {
  const obra = url.searchParams.get('obra') || '';
  const fornecedor = url.searchParams.get('fornecedor') || '';
  const { results } = await env.DB.prepare(
    `SELECT p.id, p.numero, p.orcamentoId, p.fornecedorId, p.cotacaoId, p.data, p.dataEntrega, p.valorTotal, p.status, p.enviadoEm,
            p.confirmadoEm, p.condicaoPagamento, p.compradorNome, f.nome AS fornecedorNome,
            (SELECT GROUP_CONCAT(x.descricao, '; ') FROM (SELECT descricao FROM supr_pedido_itens WHERE pedidoId = p.id ORDER BY seq LIMIT 3) x) AS resumo,
            (SELECT COALESCE(SUM(pi.quantidade - pi.quantidadeEncerrada), 0) FROM supr_pedido_itens pi WHERE pi.pedidoId = p.id) AS quantidadeTotal,
            (SELECT COALESCE(SUM(ni.quantidade), 0) FROM supr_nota_itens ni JOIN supr_notas n ON n.id = ni.notaId
               JOIN supr_pedido_itens pi ON pi.id = ni.pedidoItemId WHERE pi.pedidoId = p.id AND n.status = 'lancada') AS quantidadeRecebida
       FROM supr_pedidos p JOIN supr_fornecedores f ON f.id = p.fornecedorId
      WHERE (?1 = '' OR p.orcamentoId = ?1) AND (?2 = '' OR p.fornecedorId = ?2)
      ORDER BY p.numero DESC LIMIT 1000`
  ).bind(obra, fornecedor).all();
  const dia = hoje();
  return json({
    pedidos: results.map((p) => ({
      ...p,
      atrasado: ATIVOS.includes(p.status) && p.dataEntrega && p.dataEntrega < dia,
      percentualEntregue: p.quantidadeTotal > 0 ? Math.min(100, Math.round(p.quantidadeRecebida / p.quantidadeTotal * 100)) : 0
    }))
  });
}

export async function obterPedido({ env, params, url }) {
  const p = await pedidoOuErro(env, params.id);
  const [fornecedor, itens, notas, cotacao] = await Promise.all([
    env.DB.prepare('SELECT * FROM supr_fornecedores WHERE id = ?').bind(p.fornecedorId).first(),
    itensComEntrega(env, [p.id]),
    env.DB.prepare(
      `SELECT DISTINCT n.id, n.numero, n.serie, n.dataEmissao, n.dataEntrada, n.valorTotal, n.status
         FROM supr_notas n JOIN supr_nota_itens ni ON ni.notaId = n.id JOIN supr_pedido_itens pi ON pi.id = ni.pedidoItemId
        WHERE pi.pedidoId = ? ORDER BY n.dataEntrada`
    ).bind(p.id).all(),
    p.cotacaoId ? env.DB.prepare('SELECT id, numero FROM supr_cotacoes WHERE id = ?').bind(p.cotacaoId).first() : null
  ]);
  const notaIds = notas.results.map((n) => n.id);
  const titulos = notaIds.length ? (await env.DB.prepare(
    `SELECT * FROM fin_titulos WHERE origemTipo = 'nota' AND origemId IN (SELECT value FROM json_each(?1)) ORDER BY dataVencimento`
  ).bind(lista(notaIds)).all()).results : [];
  const scIds = itens.map((i) => i.solicitacaoItemId).filter(Boolean);
  const scs = scIds.length ? (await env.DB.prepare(
    `SELECT i.id, s.id AS solicitacaoId, s.numero FROM supr_solicitacao_itens i JOIN supr_solicitacoes s ON s.id = i.solicitacaoId
      WHERE i.id IN (SELECT value FROM json_each(?1))`
  ).bind(lista(scIds)).all()).results : [];
  const scPorItem = new Map(scs.map((s) => [s.id, s]));
  return json({
    pedido: {
      ...p, parcelas: lerJson(p.parcelas, []), fornecedor, cotacao, notas: notas.results, titulos,
      itens: itens.map((i) => ({ ...i, solicitacao: scPorItem.get(i.solicitacaoItemId) || null })),
      linkConfirmacao: `${url.origin}/portal-fornecedor?t=${encodeURIComponent(p.token)}`,
      atrasado: ATIVOS.includes(p.status) && p.dataEntrega && p.dataEntrega < hoje(),
      historico: await lerHistorico(env, 'pedido', p.id)
    }
  });
}

// Pedidos com saldo a entregar (base da entrada de nota fiscal)
export async function pedidosParaEntrada({ env, url }) {
  const obra = url.searchParams.get('obra') || '';
  const fornecedor = url.searchParams.get('fornecedor') || '';
  if (!obra || !fornecedor) falha(400, 'parametros_invalidos', 'Escolha a obra e o fornecedor.');
  const { results: pedidos } = await env.DB.prepare(
    `SELECT id, numero, data, dataEntrega, valorTotal, valorItens, valorFrete, valorDesconto, condicaoPagamento, parcelas, status
       FROM supr_pedidos WHERE orcamentoId = ? AND fornecedorId = ? AND status IN ('autorizado', 'parcial') ORDER BY numero`
  ).bind(obra, fornecedor).all();
  const itens = pedidos.length ? await itensComEntrega(env, pedidos.map((p) => p.id)) : [];
  return json({
    pedidos: pedidos.map((p) => ({ ...p, parcelas: lerJson(p.parcelas, []), itens: itens.filter((i) => i.pedidoId === p.id && i.saldo > TOLERANCIA) }))
      .filter((p) => p.itens.length)
  });
}

/* ---------- compra direta a partir das solicitações ---------- */
async function itensDaCompraDireta(env, orcamentoId, entrada) {
  const pedidos = listaObrigatoria(entrada, 'itens', { max: 300, rotulo: 'o pedido' });
  const ids = pedidos.map((i) => i && i.solicitacaoItemId).filter(Boolean);
  const { results } = await env.DB.prepare(
    `SELECT i.*, s.status AS scStatus, s.numero AS scNumero FROM supr_solicitacao_itens i JOIN supr_solicitacoes s ON s.id = i.solicitacaoId
      WHERE i.id IN (SELECT value FROM json_each(?1))`
  ).bind(lista(ids)).all();
  const porId = new Map(results.map((i) => [i.id, i]));
  const atendimento = await atendimentoDosItens(env, ids);
  const vistos = new Set();
  return pedidos.map((p, idx) => {
    const sc = porId.get(p.solicitacaoItemId);
    if (!sc || sc.orcamentoId !== orcamentoId) falha(400, 'item_invalido', `Item ${idx + 1}: item de solicitação inválido para esta obra.`);
    if (vistos.has(sc.id)) falha(400, 'item_repetido', `O item "${sc.descricao}" foi incluído duas vezes.`);
    vistos.add(sc.id);
    if (sc.status !== 'autorizado' || sc.scStatus !== 'autorizada' || sc.encerrado) falha(409, 'item_nao_autorizado', `O item "${sc.descricao}" não está autorizado ou foi encerrado.`);
    const at = atendimento.get(sc.id);
    const saldo = arredQtd(sc.quantidade - at.comprado - at.emCotacao);
    const quantidade = numero(p.quantidade, 'quantidade', { min: 0, rotulo: `a quantidade de "${sc.descricao}"` });
    if (!(quantidade > 0)) falha(400, 'quantidade_invalida', `Informe a quantidade de "${sc.descricao}".`);
    if (quantidade > saldo + TOLERANCIA) {
      falha(409, 'acima_do_saldo', `"${sc.descricao}" (SC nº ${sc.scNumero}): saldo para comprar é ${Math.max(0, saldo)} ${sc.unidade || ''}` +
        (at.emCotacao > TOLERANCIA ? ` (${arredQtd(at.emCotacao)} estão em cotação aberta)` : '') + '.');
    }
    const precoUnitario = numero(p.precoUnitario, 'precoUnitario', { min: 0.000001, rotulo: `o preço de "${sc.descricao}"` });
    return {
      id: uuid(), seq: idx + 1, solicitacaoItemId: sc.id, cotacaoItemId: null, insumoChave: sc.insumoChave, insumoCodigo: sc.insumoCodigo,
      descricao: sc.descricao, unidade: sc.unidade, tipo: sc.tipo, quantidade: arredQtd(quantidade), precoUnitario,
      valorTotal: arred(quantidade * precoUnitario), apropriacoes: sc.apropriacoes,
      marca: texto(p.marca, 'marca', { max: 120 }), observacao: texto(p.observacao, 'observacao', { max: 300 })
    };
  });
}

async function cabecalho(env, corpo, p) {
  const cond = corpo.condicaoPagamentoId ? await condicaoPorId(env, corpo.condicaoPagamentoId) : null;
  const textoCondicao = texto(corpo.condicaoPagamento, 'condicaoPagamento', { max: 200 });
  const parcelas = Array.isArray(corpo.parcelas) && corpo.parcelas.length ? validarParcelas(corpo.parcelas)
    : cond ? cond.parcelas : parcelasDoTexto(textoCondicao);
  return {
    dataEntrega: dataIso(corpo.dataEntrega, 'dataEntrega', { rotulo: 'a data de entrega' }),
    localEntrega: texto(corpo.localEntrega, 'localEntrega', { max: 300 }) || p.local_entrega_padrao || null,
    condicaoPagamentoId: cond ? cond.id : null,
    condicaoPagamento: (cond && cond.descricao) || textoCondicao || null,
    parcelas,
    frete: escolha(corpo.frete, ['CIF', 'FOB'], 'frete', null),
    valorFrete: arred(numero(corpo.valorFrete, 'valorFrete', { min: 0, obrigatorio: false, rotulo: 'o frete' }) || 0),
    valorDesconto: arred(numero(corpo.valorDesconto, 'valorDesconto', { min: 0, obrigatorio: false, rotulo: 'o desconto' }) || 0),
    observacoes: texto(corpo.observacoes, 'observacoes', { max: 2000 })
  };
}

const SQL_ITENS = `INSERT INTO supr_pedido_itens (id, pedidoId, seq, solicitacaoItemId, cotacaoItemId, insumoChave, insumoCodigo, descricao, unidade, tipo,
    quantidade, precoUnitario, valorTotal, quantidadeEncerrada, apropriacoes, marca, observacao)
  SELECT json_extract(value, '$.id'), ?1, json_extract(value, '$.seq'), json_extract(value, '$.solicitacaoItemId'), json_extract(value, '$.cotacaoItemId'),
         json_extract(value, '$.insumoChave'), json_extract(value, '$.insumoCodigo'), json_extract(value, '$.descricao'), json_extract(value, '$.unidade'),
         json_extract(value, '$.tipo'), json_extract(value, '$.quantidade'), json_extract(value, '$.precoUnitario'), json_extract(value, '$.valorTotal'), 0,
         json_extract(value, '$.apropriacoes'), json_extract(value, '$.marca'), json_extract(value, '$.observacao')
    FROM json_each(?2)`;

export async function criarPedido({ env, ctx, corpo }) {
  exigirEdicao(ctx);
  const orcamentoId = texto(corpo.orcamentoId, 'orcamentoId', { max: 100, obrigatorio: true, rotulo: 'a obra' });
  const fornecedor = await fornecedorAtivo(env, corpo.fornecedorId);
  const itens = await itensDaCompraDireta(env, orcamentoId, corpo.itens);
  const p = await parametros(env);
  const cab = await cabecalho(env, corpo, p);
  const valorItens = arred(itens.reduce((s, i) => s + i.valorTotal, 0));
  const valorTotal = arred(valorItens + cab.valorFrete - cab.valorDesconto);
  if (valorTotal < 0) falha(400, 'desconto_invalido', 'O desconto é maior que o valor do pedido.');
  const status = ligado(p.pedido_exige_autorizacao) ? 'pendente' : 'autorizado';
  const id = uuid();
  const numeroPedido = await proximoNumero(env, 'pedido');
  const ts = agora();
  await env.DB.batch([
    env.DB.prepare(
      `INSERT INTO supr_pedidos (id, numero, orcamentoId, fornecedorId, cotacaoId, data, dataEntrega, localEntrega, condicaoPagamentoId, condicaoPagamento,
         parcelas, frete, valorFrete, valorDesconto, valorItens, valorTotal, observacoes, status, compradorEmail, compradorNome, autorizadoPor, autorizadoEm,
         token, criadoEm, atualizadoEm)
       VALUES (?, ?, ?, ?, NULL, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).bind(id, numeroPedido, orcamentoId, fornecedor.id, hoje(), cab.dataEntrega, cab.localEntrega, cab.condicaoPagamentoId, cab.condicaoPagamento,
      JSON.stringify(cab.parcelas), cab.frete, cab.valorFrete, cab.valorDesconto, valorItens, valorTotal, cab.observacoes, status, ctx.email, ctx.nome,
      status === 'autorizado' ? 'automática' : null, status === 'autorizado' ? ts : null, token(), ts, ts),
    env.DB.prepare(SQL_ITENS).bind(id, JSON.stringify(itens)),
    historico(env, ctx, 'pedido', id, 'Criado (compra direta)', `${itens.length} item(ns), ${moeda(valorTotal)}` +
      (status === 'autorizado' ? ' · autorizado automaticamente (parâmetro)' : ''))
  ]);
  return json({ ok: true, id, numero: numeroPedido, status });
}

// Alteração enquanto pendente ou reprovado: condições, preços e quantidades (sem trocar itens)
export async function atualizarPedido({ env, ctx, params, corpo }) {
  exigirEdicao(ctx);
  const ped = await pedidoOuErro(env, params.id);
  if (!['pendente', 'reprovado'].includes(ped.status)) falha(409, 'nao_editavel', 'Só dá para alterar pedido pendente de autorização ou reprovado.');
  const p = await parametros(env);
  const cab = await cabecalho(env, corpo, p);
  const atuais = await itensComEntrega(env, [ped.id]);
  const scIds = atuais.map((i) => i.solicitacaoItemId).filter(Boolean);
  const atendimento = await atendimentoDosItens(env, scIds);
  const { results: scItens } = await env.DB.prepare('SELECT id, quantidade FROM supr_solicitacao_itens WHERE id IN (SELECT value FROM json_each(?1))')
    .bind(lista(scIds)).all();
  const qtdSc = new Map(scItens.map((s) => [s.id, s.quantidade]));
  const novos = new Map((corpo.itens || []).map((i) => [i.id, i]));
  const atualizados = atuais.map((i) => {
    const n = novos.get(i.id) || {};
    const quantidade = n.quantidade != null ? numero(n.quantidade, 'quantidade', { min: 0.000001, rotulo: `a quantidade de "${i.descricao}"` }) : i.quantidade;
    const precoUnitario = n.precoUnitario != null ? numero(n.precoUnitario, 'precoUnitario', { min: 0.000001, rotulo: `o preço de "${i.descricao}"` }) : i.precoUnitario;
    if (i.solicitacaoItemId) {
      const at = atendimento.get(i.solicitacaoItemId);
      // o próprio pedido conta no comprado, a não ser que esteja reprovado
      const proprio = ped.status === 'reprovado' ? 0 : Math.max(0, i.quantidade - (i.quantidadeEncerrada || 0));
      if (at.comprado - proprio + at.emCotacao + quantidade > (qtdSc.get(i.solicitacaoItemId) || 0) + TOLERANCIA) {
        falha(409, 'acima_do_saldo', `"${i.descricao}": a quantidade passa do saldo da solicitação.`);
      }
    }
    return { id: i.id, quantidade: arredQtd(quantidade), precoUnitario, valorTotal: arred(quantidade * precoUnitario),
      marca: n.marca !== undefined ? texto(n.marca, 'marca', { max: 120 }) : i.marca };
  });
  const valorItens = arred(atualizados.reduce((s, i) => s + i.valorTotal, 0));
  const valorTotal = arred(valorItens + cab.valorFrete - cab.valorDesconto);
  if (valorTotal < 0) falha(400, 'desconto_invalido', 'O desconto é maior que o valor do pedido.');
  const status = ligado(p.pedido_exige_autorizacao) ? 'pendente' : 'autorizado';
  const ts = agora();
  await env.DB.batch([
    env.DB.prepare(
      `UPDATE supr_pedido_itens SET quantidade = json_extract(j.value, '$.quantidade'), precoUnitario = json_extract(j.value, '$.precoUnitario'),
         valorTotal = json_extract(j.value, '$.valorTotal'), marca = json_extract(j.value, '$.marca')
         FROM (SELECT value FROM json_each(?1)) AS j WHERE supr_pedido_itens.id = json_extract(j.value, '$.id')`
    ).bind(JSON.stringify(atualizados)),
    env.DB.prepare(
      `UPDATE supr_pedidos SET dataEntrega = ?, localEntrega = ?, condicaoPagamentoId = ?, condicaoPagamento = ?, parcelas = ?, frete = ?, valorFrete = ?,
         valorDesconto = ?, valorItens = ?, valorTotal = ?, observacoes = ?, status = ?, motivoReprovacao = NULL,
         autorizadoPor = ?, autorizadoEm = ?, atualizadoEm = ? WHERE id = ?`
    ).bind(cab.dataEntrega, cab.localEntrega, cab.condicaoPagamentoId, cab.condicaoPagamento, JSON.stringify(cab.parcelas), cab.frete, cab.valorFrete,
      cab.valorDesconto, valorItens, valorTotal, cab.observacoes, status, status === 'autorizado' ? 'automática' : null, status === 'autorizado' ? ts : null,
      ts, ped.id),
    historico(env, ctx, 'pedido', ped.id, ped.status === 'reprovado' ? 'Alterado e reenviado para autorização' : 'Alterado', moeda(valorTotal))
  ]);
  return json({ ok: true, status });
}

/* ---------- autorização e ciclo de vida ---------- */
export async function autorizarPedido({ env, ctx, params }) {
  const p = await pedidoOuErro(env, params.id);
  if (p.status !== 'pendente') falha(409, 'nao_pendente', 'Este pedido não está aguardando autorização.');
  await exigirAlcada(env, ctx, 'pedido', p.valorTotal);
  const ts = agora();
  await env.DB.batch([
    env.DB.prepare("UPDATE supr_pedidos SET status = 'autorizado', autorizadoPor = ?, autorizadoEm = ?, motivoReprovacao = NULL, atualizadoEm = ? WHERE id = ?")
      .bind(ctx.nome, ts, ts, p.id),
    historico(env, ctx, 'pedido', p.id, 'Autorizado', moeda(p.valorTotal))
  ]);
  return json({ ok: true });
}

export async function reprovarPedido({ env, ctx, params, corpo }) {
  const p = await pedidoOuErro(env, params.id);
  if (p.status !== 'pendente') falha(409, 'nao_pendente', 'Este pedido não está aguardando autorização.');
  const motivo = texto(corpo.motivo, 'motivo', { max: 500, obrigatorio: true, rotulo: 'o motivo da reprovação' });
  await exigirAlcada(env, ctx, 'pedido', 0);
  await env.DB.batch([
    env.DB.prepare("UPDATE supr_pedidos SET status = 'reprovado', motivoReprovacao = ?, autorizadoPor = ?, autorizadoEm = ?, atualizadoEm = ? WHERE id = ?")
      .bind(motivo, ctx.nome, agora(), agora(), p.id),
    historico(env, ctx, 'pedido', p.id, 'Reprovado', motivo)
  ]);
  return json({ ok: true });
}

export async function cancelarPedido({ env, ctx, params, corpo }) {
  exigirEdicao(ctx);
  const p = await pedidoOuErro(env, params.id);
  if (['cancelado', 'entregue', 'encerrado'].includes(p.status)) falha(409, 'nao_cancelavel', `O pedido está ${p.status}.`);
  const motivo = texto(corpo.motivo, 'motivo', { max: 500, obrigatorio: true, rotulo: 'o motivo do cancelamento' });
  const notas = await env.DB.prepare(
    `SELECT COUNT(*) AS n FROM supr_nota_itens ni JOIN supr_notas n ON n.id = ni.notaId JOIN supr_pedido_itens pi ON pi.id = ni.pedidoItemId
      WHERE pi.pedidoId = ? AND n.status = 'lancada'`
  ).bind(p.id).first();
  if (notas.n > 0) falha(409, 'com_entrega', 'O pedido já tem nota fiscal lançada: use "Encerrar saldo".');
  await env.DB.batch([
    env.DB.prepare("UPDATE supr_pedidos SET status = 'cancelado', atualizadoEm = ? WHERE id = ?").bind(agora(), p.id),
    historico(env, ctx, 'pedido', p.id, 'Cancelado', motivo)
  ]);
  return json({ ok: true });
}

// Encerra o saldo não entregue: o que falta volta para o saldo das solicitações
export async function encerrarPedido({ env, ctx, params, corpo }) {
  exigirEdicao(ctx);
  const p = await pedidoOuErro(env, params.id);
  if (!ATIVOS.includes(p.status)) falha(409, 'nao_encerravel', 'Só dá para encerrar o saldo de pedido autorizado ou parcialmente entregue.');
  const motivo = texto(corpo.motivo, 'motivo', { max: 500, obrigatorio: true, rotulo: 'o motivo do encerramento' });
  const itens = await itensComEntrega(env, [p.id]);
  const ajustes = itens.filter((i) => i.saldo > TOLERANCIA).map((i) => ({ id: i.id, encerrada: arredQtd((i.quantidadeEncerrada || 0) + i.saldo) }));
  const recebidoAlgo = itens.some((i) => i.recebido > TOLERANCIA);
  await env.DB.batch([
    env.DB.prepare(
      `UPDATE supr_pedido_itens SET quantidadeEncerrada = json_extract(j.value, '$.encerrada')
         FROM (SELECT value FROM json_each(?1)) AS j WHERE supr_pedido_itens.id = json_extract(j.value, '$.id')`
    ).bind(JSON.stringify(ajustes)),
    env.DB.prepare('UPDATE supr_pedidos SET status = ?, atualizadoEm = ? WHERE id = ?').bind(recebidoAlgo ? 'encerrado' : 'cancelado', agora(), p.id),
    historico(env, ctx, 'pedido', p.id, 'Saldo encerrado', motivo)
  ]);
  return json({ ok: true });
}

/* ---------- PDF e envio ao fornecedor ---------- */
async function dadosDoPdf(env, p, origem) {
  const [fornecedor, itens, prm, obras] = await Promise.all([
    env.DB.prepare('SELECT * FROM supr_fornecedores WHERE id = ?').bind(p.fornecedorId).first(),
    itensComEntrega(env, [p.id]),
    parametros(env),
    listarObras(env)
  ]);
  const obra = obras.find((o) => o.id === p.orcamentoId) || {};
  return {
    empresa: { nome: prm.empresa_nome, documento: prm.empresa_documento, endereco: prm.empresa_endereco },
    pedido: p, fornecedor: fornecedor || {}, obra, itens,
    link: `${origem}/portal-fornecedor?t=${encodeURIComponent(p.token)}`
  };
}

export async function pdfDoPedido({ env, params, url }) {
  const p = await pedidoOuErro(env, params.id);
  const bytes = pdfPedido(await dadosDoPdf(env, p, url.origin));
  return new Response(bytes, {
    headers: { 'Content-Type': 'application/pdf', 'Content-Disposition': `inline; filename="Pedido-${p.numero}.pdf"`, 'Cache-Control': 'no-store' }
  });
}

export async function enviarPedido({ env, ctx, params, corpo, url }) {
  exigirEdicao(ctx);
  const p = await pedidoOuErro(env, params.id);
  if (!ATIVOS.includes(p.status) && p.status !== 'entregue') falha(409, 'nao_autorizado', 'O pedido precisa estar autorizado para ir ao fornecedor.');
  const dados = await dadosDoPdf(env, p, url.origin);
  const destino = texto(corpo.email, 'email', { max: 200 }) || dados.fornecedor.email;
  if (!destino) falha(400, 'sem_email', 'O fornecedor não tem e-mail cadastrado. Informe um e-mail ou copie o link.');
  const empresa = dados.empresa.nome;
  const html = `<div style="font-family:Arial,sans-serif;max-width:600px;margin:auto;color:#27272a">
    <h2 style="font-size:18px">Pedido de compra nº ${p.numero}</h2>
    <p>Olá, <b>${esc(dados.fornecedor.nome)}</b>. Segue o pedido de compra da ${esc(empresa)} (PDF em anexo).</p>
    <p>Valor total: <b>${moeda(p.valorTotal)}</b><br>Entrega até: <b>${dataBr(p.dataEntrega)}</b>${p.localEntrega ? '<br>Local: ' + esc(p.localEntrega) : ''}<br>
    Pagamento: ${esc(p.condicaoPagamento || 'a combinar')}</p>
    <p style="margin:22px 0"><a href="${dados.link}" style="background:#18181b;color:#fff;padding:11px 18px;border-radius:6px;text-decoration:none;font-weight:bold">Confirmar recebimento do pedido</a></p>
    <p style="color:#71717a;font-size:12px">Informe o número do pedido na nota fiscal.</p></div>`;
  try {
    await enviarEmail({ env, destinatario: destino, assunto: `Pedido de compra nº ${p.numero} — ${empresa}`, html,
      anexoPdfBase64: base64(pdfPedido(dados)), nomeArquivo: `Pedido-${p.numero}.pdf` });
  } catch (e) {
    falha(502, 'falha_email', 'Não foi possível enviar o e-mail (' + String(e.message).replace(/\.$/, '') + '). Use "Copiar link" para mandar por WhatsApp ou outro meio.', { link: dados.link });
  }
  const ts = agora();
  await env.DB.batch([
    env.DB.prepare('UPDATE supr_pedidos SET enviadoEm = ?, emailDestino = ?, atualizadoEm = ? WHERE id = ?').bind(ts, destino, ts, p.id),
    historico(env, ctx, 'pedido', p.id, 'Enviado ao fornecedor', destino)
  ]);
  return json({ ok: true, link: dados.link });
}

export async function registrarEnvioManual({ env, ctx, params, corpo }) {
  exigirEdicao(ctx);
  const p = await pedidoOuErro(env, params.id);
  if (!ATIVOS.includes(p.status)) falha(409, 'nao_autorizado', 'O pedido precisa estar autorizado.');
  const meio = texto(corpo.meio, 'meio', { max: 120 }) || 'link copiado';
  await env.DB.batch([
    env.DB.prepare('UPDATE supr_pedidos SET enviadoEm = COALESCE(enviadoEm, ?), atualizadoEm = ? WHERE id = ?').bind(agora(), agora(), p.id),
    historico(env, ctx, 'pedido', p.id, 'Enviado ao fornecedor', meio)
  ]);
  return json({ ok: true });
}

function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch])); }
