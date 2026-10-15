// Entrada de nota fiscal (recebimento): itens ligados aos itens de pedido do fornecedor (atendimento
// parcial ou total) ou, sem pedido, apropriados direto nos serviços. Ao lançar:
// - os pedidos passam a parcial/entregue;
// - os materiais entram no estoque da obra (opcional), com frete e impostos rateados no custo;
// - as parcelas viram títulos no contas a pagar.
// Cancelar a nota estorna estoque e títulos (se nada foi pago nem consumido).
import {
  json, falha, uuid, agora, hoje, texto, numero, dataIso, escolha, listaObrigatoria, lista, lerJson, arred, arredQtd,
  exigirEdicao, historico, lerHistorico, gerarParcelas, normalizarApropriacoes, somarDias
} from './base.js';
import { exigirObra, orcadoDaObra } from './orcado.js';
import { recalcularStatusPedidos } from './pedidos.js';
import { saldosDaObra, SQL_MOVIMENTOS } from './estoque.js';
import { SQL_TITULOS } from './financeiro.js';
import { moeda } from './pdf.js';

const TOLERANCIA = 1e-6;

export async function listarNotas({ env, url }) {
  const obra = url.searchParams.get('obra') || '';
  const { results } = await env.DB.prepare(
    `SELECT n.id, n.orcamentoId, n.fornecedorId, n.tipoDocumento, n.numero, n.serie, n.chaveAcesso, n.dataEmissao, n.dataEntrada,
            n.valorTotal, n.status, n.lancadoPorNome, f.nome AS fornecedorNome,
            (SELECT GROUP_CONCAT(DISTINCT p.numero) FROM supr_nota_itens ni JOIN supr_pedido_itens pi ON pi.id = ni.pedidoItemId
               JOIN supr_pedidos p ON p.id = pi.pedidoId WHERE ni.notaId = n.id) AS pedidos,
            (SELECT COUNT(*) FROM supr_nota_itens ni WHERE ni.notaId = n.id) AS itens
       FROM supr_notas n JOIN supr_fornecedores f ON f.id = n.fornecedorId
      WHERE (?1 = '' OR n.orcamentoId = ?1) ORDER BY n.dataEntrada DESC, n.criadoEm DESC LIMIT 1000`
  ).bind(obra).all();
  return json({ notas: results });
}

export async function obterNota({ env, params }) {
  const n = await env.DB.prepare('SELECT * FROM supr_notas WHERE id = ?').bind(params.id).first();
  if (!n) falha(404, 'nao_encontrada', 'Nota fiscal não encontrada.');
  const [fornecedor, itens, titulos, movimentos] = await env.DB.batch([
    env.DB.prepare('SELECT * FROM supr_fornecedores WHERE id = ?').bind(n.fornecedorId),
    env.DB.prepare(
      `SELECT ni.*, p.id AS pedidoId, p.numero AS pedidoNumero, pi.precoUnitario AS precoPedido
         FROM supr_nota_itens ni LEFT JOIN supr_pedido_itens pi ON pi.id = ni.pedidoItemId LEFT JOIN supr_pedidos p ON p.id = pi.pedidoId
        WHERE ni.notaId = ? ORDER BY ni.seq`
    ).bind(n.id),
    env.DB.prepare("SELECT * FROM fin_titulos WHERE origemTipo = 'nota' AND origemId = ? ORDER BY parcela").bind(n.id),
    env.DB.prepare("SELECT * FROM supr_estoque_movimentos WHERE origemTipo = 'nota' AND origemId = ? ORDER BY descricao").bind(n.id)
  ]);
  return json({
    nota: {
      ...n, fornecedor: fornecedor.results[0] || null,
      itens: itens.results.map((i) => ({ ...i, apropriacoes: lerJson(i.apropriacoes, []) })),
      titulos: titulos.results, movimentos: movimentos.results, historico: await lerHistorico(env, 'nota', n.id)
    }
  });
}

export async function lancarNota({ env, ctx, corpo }) {
  exigirEdicao(ctx);
  const orcamentoId = texto(corpo.orcamentoId, 'orcamentoId', { max: 100, obrigatorio: true, rotulo: 'a obra' });
  await exigirObra(env, orcamentoId);
  const fornecedorId = texto(corpo.fornecedorId, 'fornecedorId', { max: 100, obrigatorio: true, rotulo: 'o fornecedor' });
  const fornecedor = await env.DB.prepare('SELECT id, nome FROM supr_fornecedores WHERE id = ?').bind(fornecedorId).first();
  if (!fornecedor) falha(404, 'fornecedor_nao_encontrado', 'Fornecedor não encontrado.');
  const tipoDocumento = escolha(corpo.tipoDocumento, ['nfe', 'nfse', 'recibo', 'outro'], 'tipoDocumento', 'nfe');
  const numeroNota = texto(corpo.numero, 'numero', { max: 30, obrigatorio: true, rotulo: 'o número da nota' });
  const serie = texto(corpo.serie, 'serie', { max: 10 });
  const chaveAcesso = (texto(corpo.chaveAcesso, 'chaveAcesso', { max: 60 }) || '').replace(/\D/g, '') || null;
  if (chaveAcesso && chaveAcesso.length !== 44) falha(400, 'chave_invalida', 'A chave de acesso da NF-e tem 44 dígitos.');
  const dataEmissao = dataIso(corpo.dataEmissao, 'dataEmissao', { obrigatorio: true, rotulo: 'a data de emissão' });
  const dataEntrada = dataIso(corpo.dataEntrada, 'dataEntrada', { rotulo: 'a data de entrada' }) || hoje();
  if (dataEmissao > somarDias(hoje(), 1)) falha(400, 'datas_invalidas', 'A data de emissão da nota não pode ser futura.');
  if (dataEntrada < dataEmissao) falha(400, 'datas_invalidas', 'A data de entrada não pode ser anterior à emissão.');

  const repetida = await env.DB.prepare(
    `SELECT numero FROM supr_notas WHERE status = 'lancada' AND ((fornecedorId = ?1 AND numero = ?2 AND COALESCE(serie, '') = ?3)
       OR (?4 IS NOT NULL AND chaveAcesso = ?4)) LIMIT 1`
  ).bind(fornecedorId, numeroNota, serie || '', chaveAcesso).first();
  if (repetida) falha(409, 'nota_repetida', `A nota nº ${repetida.numero} deste fornecedor já foi lançada.`);

  // itens com pedido: precisam ser do mesmo fornecedor e obra, com saldo a entregar
  const entrada = listaObrigatoria(corpo.itens, 'itens', { max: 300, rotulo: 'a nota' });
  const pedidoItemIds = entrada.map((i) => i && i.pedidoItemId).filter(Boolean);
  const { results: pedItens } = pedidoItemIds.length ? await env.DB.prepare(
    `SELECT pi.*, p.orcamentoId, p.fornecedorId, p.status AS pedidoStatus, p.numero AS pedidoNumero, p.parcelas,
            (SELECT COALESCE(SUM(ni.quantidade), 0) FROM supr_nota_itens ni JOIN supr_notas n ON n.id = ni.notaId
              WHERE ni.pedidoItemId = pi.id AND n.status = 'lancada') AS recebido
       FROM supr_pedido_itens pi JOIN supr_pedidos p ON p.id = pi.pedidoId WHERE pi.id IN (SELECT value FROM json_each(?1))`
  ).bind(lista(pedidoItemIds)).all() : { results: [] };
  const porPedidoItem = new Map(pedItens.map((i) => [i.id, i]));
  let servicosValidos = null;

  const usados = new Map();
  const itens = [];
  for (const [idx, it] of entrada.entries()) {
    const n = idx + 1;
    const quantidade = numero(it.quantidade, 'quantidade', { min: 0, rotulo: `a quantidade do item ${n}` });
    if (!(quantidade > 0)) continue; // item zerado: não veio nesta nota
    const precoUnitario = numero(it.precoUnitario, 'precoUnitario', { min: 0, rotulo: `o preço do item ${n}` });
    const doXml = {
      descricaoFornecedor: texto(it.descricaoFornecedor, 'descricaoFornecedor', { max: 400 }),
      codigoFornecedor: texto(it.codigoFornecedor, 'codigoFornecedor', { max: 60 }),
      ncm: texto(it.ncm, 'ncm', { max: 10 }), cfop: texto(it.cfop, 'cfop', { max: 6 })
    };
    if (it.pedidoItemId) {
      const pi = porPedidoItem.get(it.pedidoItemId);
      if (!pi || pi.orcamentoId !== orcamentoId || pi.fornecedorId !== fornecedorId) falha(400, 'pedido_invalido', `Item ${n}: o pedido não é deste fornecedor nesta obra.`);
      if (!['autorizado', 'parcial'].includes(pi.pedidoStatus)) falha(409, 'pedido_nao_autorizado', `Item ${n}: o pedido nº ${pi.pedidoNumero} não está autorizado para entrega.`);
      const ja = usados.get(pi.id) || 0;
      const saldo = Math.max(0, pi.quantidade - (pi.quantidadeEncerrada || 0)) - pi.recebido - ja;
      if (quantidade > saldo + TOLERANCIA) {
        falha(409, 'acima_do_pedido', `"${pi.descricao}" (pedido nº ${pi.pedidoNumero}): saldo a entregar é ${arredQtd(Math.max(0, saldo))} ${pi.unidade || ''}.`);
      }
      usados.set(pi.id, ja + quantidade);
      itens.push({ id: uuid(), seq: itens.length + 1, pedidoItemId: pi.id, pedidoId: pi.pedidoId, insumoChave: pi.insumoChave, insumoCodigo: pi.insumoCodigo,
        descricao: pi.descricao, unidade: pi.unidade, tipo: pi.tipo, quantidade: arredQtd(quantidade), precoUnitario,
        valorTotal: arred(quantidade * precoUnitario), apropriacoes: pi.apropriacoes, parcelasPedido: pi.parcelas, ...doXml });
      continue;
    }
    // sem pedido: insumo escolhido na busca e apropriação nos serviços
    if (!servicosValidos) {
      const orcado = await orcadoDaObra(env, orcamentoId);
      servicosValidos = new Set(orcado.eap.filter((x) => x.tipo === 'servico').map((x) => x.id));
    }
    const chave = texto(it.insumoChave, 'insumoChave', { max: 140, obrigatorio: true, rotulo: `o insumo do item ${n}` });
    if (!/^(I|C|PI|PC|S):/.test(chave)) falha(400, 'insumo_invalido', `Item ${n}: escolha o insumo pela busca.`);
    itens.push({ id: uuid(), seq: itens.length + 1, pedidoItemId: null, pedidoId: null, insumoChave: chave,
      insumoCodigo: texto(it.insumoCodigo, 'insumoCodigo', { max: 60 }),
      descricao: texto(it.descricao, 'descricao', { max: 400, obrigatorio: true, rotulo: `a descrição do item ${n}` }),
      unidade: texto(it.unidade, 'unidade', { max: 20 }), tipo: ['material', 'maoDeObra', 'equipamento', 'servico'].includes(it.tipo) ? it.tipo : 'material',
      quantidade: arredQtd(quantidade), precoUnitario, valorTotal: arred(quantidade * precoUnitario),
      apropriacoes: JSON.stringify(normalizarApropriacoes(it.apropriacoes, servicosValidos, `o item ${n}`)), ...doXml });
  }
  if (!itens.length) falha(400, 'sem_itens', 'Informe a quantidade recebida de ao menos um item.');

  const valorProdutos = arred(itens.reduce((s, i) => s + i.valorTotal, 0));
  const extras = {};
  for (const k of ['valorFrete', 'valorDesconto', 'valorIpi', 'valorIcmsSt', 'valorOutras']) {
    extras[k] = arred(numero(corpo[k], k, { min: 0, obrigatorio: false }) || 0);
  }
  const valorTotal = arred(valorProdutos + extras.valorFrete + extras.valorIpi + extras.valorIcmsSt + extras.valorOutras - extras.valorDesconto);
  if (valorTotal <= 0) falha(400, 'valor_invalido', 'O valor total da nota precisa ser maior que zero.');
  const informado = numero(corpo.valorTotalInformado, 'valorTotalInformado', { min: 0, obrigatorio: false });
  if (informado != null && Math.abs(informado - valorTotal) > 0.05) {
    falha(400, 'total_divergente', `O total calculado (${moeda(valorTotal)}) não bate com o total da nota (${moeda(informado)}). Confira itens, frete, impostos e desconto.`);
  }

  // parcelas: as informadas (somando o total) ou as da condição do pedido, contando da emissão
  let parcelas;
  if (Array.isArray(corpo.parcelas) && corpo.parcelas.length) {
    parcelas = corpo.parcelas.map((p, i) => ({
      vencimento: dataIso(p.vencimento, 'vencimento', { obrigatorio: true, rotulo: `o vencimento da parcela ${i + 1}` }),
      valor: arred(numero(p.valor, 'valor', { min: 0.01, rotulo: `o valor da parcela ${i + 1}` }))
    }));
    const soma = arred(parcelas.reduce((s, p) => s + p.valor, 0));
    if (Math.abs(soma - valorTotal) > 0.02) falha(400, 'parcelas_divergentes', `As parcelas somam ${moeda(soma)}, mas a nota é de ${moeda(valorTotal)}.`);
  } else {
    const comPedido = itens.find((i) => i.parcelasPedido);
    parcelas = gerarParcelas(comPedido ? lerJson(comPedido.parcelasPedido, []) : [], dataEmissao, valorTotal);
  }

  const notaId = uuid();
  const ts = agora();
  const documento = `${tipoDocumento === 'nfse' ? 'NFS-e' : tipoDocumento === 'recibo' ? 'Recibo' : 'NF'} ${numeroNota}${serie ? '-' + serie : ''}`;
  const titulos = parcelas.map((p, i) => ({
    id: uuid(), orcamentoId, fornecedorId, origemTipo: 'nota', origemId: notaId, documento, parcela: i + 1, totalParcelas: parcelas.length,
    dataEmissao, dataVencimento: p.vencimento, valor: p.valor, observacoes: null, criadoEm: ts
  }));

  // estoque: materiais, com o custo rateado (frete, IPI, ST, outras e desconto)
  const entradaEstoque = corpo.entradaEstoque !== false && corpo.entradaEstoque !== 0;
  const fator = valorProdutos > 0 ? valorTotal / valorProdutos : 1;
  const movimentos = entradaEstoque ? itens.filter((i) => i.tipo === 'material').map((i) => ({
    id: uuid(), orcamentoId, data: dataEntrada, tipo: 'entrada', insumoChave: i.insumoChave, insumoCodigo: i.insumoCodigo, descricao: i.descricao,
    unidade: i.unidade, quantidade: i.quantidade, valorUnitario: arred(i.valorTotal * fator / i.quantidade, 6), valorTotal: arred(i.valorTotal * fator),
    servicoId: null, origemTipo: 'nota', origemId: notaId, documento, observacao: fornecedor.nome, usuarioEmail: ctx.email, usuarioNome: ctx.nome, criadoEm: ts
  })) : [];

  const comandos = [
    env.DB.prepare(
      `INSERT INTO supr_notas (id, orcamentoId, fornecedorId, tipoDocumento, numero, serie, chaveAcesso, dataEmissao, dataEntrada, valorProdutos,
         valorFrete, valorDesconto, valorIpi, valorIcmsSt, valorOutras, valorTotal, entradaEstoque, observacoes, status, lancadoPorEmail, lancadoPorNome, criadoEm)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'lancada', ?, ?, ?)`
    ).bind(notaId, orcamentoId, fornecedorId, tipoDocumento, numeroNota, serie, chaveAcesso, dataEmissao, dataEntrada, valorProdutos,
      extras.valorFrete, extras.valorDesconto, extras.valorIpi, extras.valorIcmsSt, extras.valorOutras, valorTotal, movimentos.length ? 1 : 0,
      texto(corpo.observacoes, 'observacoes', { max: 2000 }), ctx.email, ctx.nome, ts),
    env.DB.prepare(
      `INSERT INTO supr_nota_itens (id, notaId, seq, pedidoItemId, insumoChave, insumoCodigo, descricao, unidade, tipo, quantidade, precoUnitario,
         valorTotal, apropriacoes, descricaoFornecedor, codigoFornecedor, ncm, cfop)
       SELECT json_extract(value, '$.id'), ?1, json_extract(value, '$.seq'), json_extract(value, '$.pedidoItemId'), json_extract(value, '$.insumoChave'),
              json_extract(value, '$.insumoCodigo'), json_extract(value, '$.descricao'), json_extract(value, '$.unidade'), json_extract(value, '$.tipo'),
              json_extract(value, '$.quantidade'), json_extract(value, '$.precoUnitario'), json_extract(value, '$.valorTotal'),
              json_extract(value, '$.apropriacoes'), json_extract(value, '$.descricaoFornecedor'), json_extract(value, '$.codigoFornecedor'),
              json_extract(value, '$.ncm'), json_extract(value, '$.cfop')
         FROM json_each(?2)`
    ).bind(notaId, JSON.stringify(itens.map(({ parcelasPedido, pedidoId, ...i }) => i))),
    env.DB.prepare(SQL_TITULOS).bind(JSON.stringify(titulos)),
    historico(env, ctx, 'nota', notaId, 'Lançada', `${documento} · ${moeda(valorTotal)} · ${parcelas.length} parcela(s)` +
      (movimentos.length ? ` · ${movimentos.length} material(is) no estoque` : ''))
  ];
  if (movimentos.length) comandos.push(env.DB.prepare(SQL_MOVIMENTOS).bind(JSON.stringify(movimentos)));
  const pedidoIds = Array.from(new Set(itens.map((i) => i.pedidoId).filter(Boolean)));
  for (const pid of pedidoIds) comandos.push(historico(env, ctx, 'pedido', pid, 'Entrega registrada', documento));
  await env.DB.batch(comandos);

  const status = await recalcularStatusPedidos(env, pedidoIds);
  if (status.length) await env.DB.batch(status);
  return json({ ok: true, id: notaId, valorTotal, titulos: titulos.length, estoque: movimentos.length });
}

export async function cancelarNota({ env, ctx, params, corpo }) {
  exigirEdicao(ctx);
  const n = await env.DB.prepare('SELECT * FROM supr_notas WHERE id = ?').bind(params.id).first();
  if (!n) falha(404, 'nao_encontrada', 'Nota fiscal não encontrada.');
  if (n.status !== 'lancada') falha(409, 'ja_cancelada', 'A nota já está cancelada.');
  const motivo = texto(corpo.motivo, 'motivo', { max: 500, obrigatorio: true, rotulo: 'o motivo do cancelamento' });
  const pago = await env.DB.prepare("SELECT COUNT(*) AS n FROM fin_titulos WHERE origemTipo = 'nota' AND origemId = ? AND status = 'pago'").bind(n.id).first();
  if (pago.n > 0) falha(409, 'titulo_pago', 'Há parcela desta nota já paga: estorne o pagamento no Financeiro antes de cancelar.');
  const { results: movimentos } = await env.DB.prepare(
    "SELECT * FROM supr_estoque_movimentos WHERE origemTipo = 'nota' AND origemId = ? AND estornado = 0"
  ).bind(n.id).all();
  if (movimentos.length) {
    const saldos = await saldosDaObra(env, n.orcamentoId);
    for (const m of movimentos) {
      const s = saldos.get(m.insumoChave);
      if (!s || s.saldo - m.quantidade < -TOLERANCIA) {
        falha(409, 'material_consumido', `"${m.descricao}" desta nota já saiu do estoque: faça uma entrada de ajuste ou estorne a saída antes de cancelar.`);
      }
    }
  }
  const { results: pedidos } = await env.DB.prepare(
    `SELECT DISTINCT pi.pedidoId FROM supr_nota_itens ni JOIN supr_pedido_itens pi ON pi.id = ni.pedidoItemId WHERE ni.notaId = ?`
  ).bind(n.id).all();
  const ts = agora();
  await env.DB.batch([
    env.DB.prepare("UPDATE supr_notas SET status = 'cancelada', canceladoEm = ? WHERE id = ?").bind(ts, n.id),
    env.DB.prepare("UPDATE fin_titulos SET status = 'cancelado', atualizadoEm = ? WHERE origemTipo = 'nota' AND origemId = ? AND status = 'aberto'").bind(ts, n.id),
    env.DB.prepare("UPDATE supr_estoque_movimentos SET estornado = 1 WHERE origemTipo = 'nota' AND origemId = ?").bind(n.id),
    historico(env, ctx, 'nota', n.id, 'Cancelada', motivo),
    ...pedidos.map((p) => historico(env, ctx, 'pedido', p.pedidoId, 'Entrega estornada', `NF ${n.numero} cancelada: ${motivo}`))
  ]);
  // pedidos entregues voltam a parcial/autorizado
  const ids = pedidos.map((p) => p.pedidoId);
  if (ids.length) {
    await env.DB.prepare("UPDATE supr_pedidos SET status = 'parcial' WHERE id IN (SELECT value FROM json_each(?1)) AND status = 'entregue'").bind(lista(ids)).run();
    const status = await recalcularStatusPedidos(env, ids);
    if (status.length) await env.DB.batch(status);
  }
  return json({ ok: true });
}
