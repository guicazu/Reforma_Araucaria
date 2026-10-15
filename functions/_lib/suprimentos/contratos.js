// Contratos (empreiteiros, serviços, locação) e medições. Cada item do contrato é apropriado num
// serviço da EAP. O contrato passa por autorização (alçada), recebe aditivos (acréscimo, supressão,
// item novo, prazo) e é medido por período: a medição autorizada vira título no contas a pagar pelo
// valor líquido (bruto − caução − INSS − ISS − IR − PIS/COFINS/CSLL − descontos). No encerramento,
// a caução retida pode ser liberada como título.
import {
  json, falha, uuid, agora, hoje, texto, numero, dataIso, escolha, listaObrigatoria, lista, arred, arredQtd, somarDias,
  exigirEdicao, exigirAlcada, historico, lerHistorico, proximoNumero, parametros, ligado, fornecedorAtivo
} from './base.js';
import { orcadoDaObra } from './orcado.js';
import { orcadoComMovimentos } from './obras.js';
import { SQL_TITULOS } from './financeiro.js';
import { moeda, dataBr } from './pdf.js';

const TOLERANCIA = 1e-6;
const TIPOS = ['empreitada', 'servico', 'fornecimento', 'locacao'];

async function contratoOuErro(env, id) {
  const c = await env.DB.prepare('SELECT * FROM supr_contratos WHERE id = ?').bind(id).first();
  if (!c) falha(404, 'nao_encontrado', 'Contrato não encontrado.');
  return c;
}

// Itens do contrato com o medido (autorizado e pendente) e o saldo a medir
async function itensComMedicao(env, contratoIds) {
  const { results } = await env.DB.prepare(
    `SELECT ci.*,
            (SELECT COALESCE(SUM(mi.quantidade), 0) FROM supr_medicao_itens mi JOIN supr_medicoes m ON m.id = mi.medicaoId
              WHERE mi.contratoItemId = ci.id AND m.status = 'autorizada') AS medido,
            (SELECT COALESCE(SUM(mi.valor), 0) FROM supr_medicao_itens mi JOIN supr_medicoes m ON m.id = mi.medicaoId
              WHERE mi.contratoItemId = ci.id AND m.status = 'autorizada') AS valorMedido,
            (SELECT COALESCE(SUM(mi.quantidade), 0) FROM supr_medicao_itens mi JOIN supr_medicoes m ON m.id = mi.medicaoId
              WHERE mi.contratoItemId = ci.id AND m.status = 'pendente') AS medidoPendente
       FROM supr_contrato_itens ci WHERE ci.contratoId IN (SELECT value FROM json_each(?1)) ORDER BY ci.contratoId, ci.seq`
  ).bind(lista(contratoIds)).all();
  return results.map((i) => ({ ...i, saldo: Math.max(0, arredQtd(i.quantidade - i.medido - i.medidoPendente)) }));
}

/* ---------- lista e detalhe ---------- */
export async function listarContratos({ env, url }) {
  const obra = url.searchParams.get('obra') || '';
  const { results } = await env.DB.prepare(
    `SELECT c.*, f.nome AS fornecedorNome,
            (SELECT COALESCE(SUM(m.valorBruto), 0) FROM supr_medicoes m WHERE m.contratoId = c.id AND m.status = 'autorizada') AS valorMedido,
            (SELECT COUNT(*) FROM supr_medicoes m WHERE m.contratoId = c.id AND m.status = 'pendente') AS medicoesPendentes,
            (SELECT COUNT(*) FROM supr_contrato_aditivos a WHERE a.contratoId = c.id AND a.status = 'pendente') AS aditivosPendentes
       FROM supr_contratos c JOIN supr_fornecedores f ON f.id = c.fornecedorId
      WHERE (?1 = '' OR c.orcamentoId = ?1) ORDER BY c.numero DESC LIMIT 500`
  ).bind(obra).all();
  return json({ contratos: results.map((c) => ({ ...c, saldo: arred(c.valorTotal - c.valorMedido) })) });
}

export async function obterContrato({ env, params }) {
  const c = await contratoOuErro(env, params.id);
  const [fornecedor, aditivos, medicoes, titulos] = await env.DB.batch([
    env.DB.prepare('SELECT * FROM supr_fornecedores WHERE id = ?').bind(c.fornecedorId),
    env.DB.prepare('SELECT * FROM supr_contrato_aditivos WHERE contratoId = ? ORDER BY numero').bind(c.id),
    env.DB.prepare('SELECT * FROM supr_medicoes WHERE contratoId = ? ORDER BY numero').bind(c.id),
    env.DB.prepare(
      `SELECT * FROM fin_titulos WHERE (origemTipo = 'medicao' AND origemId IN (SELECT id FROM supr_medicoes WHERE contratoId = ?1))
          OR (origemTipo = 'caucao' AND origemId = ?1) ORDER BY dataVencimento`
    ).bind(c.id)
  ]);
  const itens = await itensComMedicao(env, [c.id]);
  const autorizadas = medicoes.results.filter((m) => m.status === 'autorizada');
  const soma = (k) => arred(autorizadas.reduce((s, m) => s + (m[k] || 0), 0));
  return json({
    contrato: {
      ...c, fornecedor: fornecedor.results[0] || null, itens,
      aditivos: aditivos.results.map((a) => ({ ...a, itens: JSON.parse(a.itens || '[]') })),
      medicoes: medicoes.results, titulos: titulos.results,
      resumo: { valorMedido: soma('valorBruto'), retencaoAcumulada: soma('valorRetencao'), liquidoMedido: soma('valorLiquido'),
        saldo: arred(c.valorTotal - soma('valorBruto')),
        caucaoLiberada: titulos.results.some((t) => t.origemTipo === 'caucao' && t.status !== 'cancelado') },
      historico: await lerHistorico(env, 'contrato', c.id)
    }
  });
}

/* ---------- criação e edição ---------- */
async function dadosContrato(env, corpo, orcamentoId) {
  const orcado = await orcadoDaObra(env, orcamentoId);
  const servicos = new Map(orcado.eap.filter((n) => n.tipo === 'servico').map((n) => [n.id, n]));
  const itens = listaObrigatoria(corpo.itens, 'itens', { max: 300, rotulo: 'o contrato' }).map((it, idx) => {
    const sv = servicos.get(it.servicoId);
    if (!sv) falha(400, 'apropriacao_obrigatoria', `Item ${idx + 1}: escolha o serviço da EAP em que o item é apropriado.`);
    const quantidade = numero(it.quantidade, 'quantidade', { min: 0.000001, rotulo: `a quantidade do item ${idx + 1}` });
    const precoUnitario = numero(it.precoUnitario, 'precoUnitario', { min: 0, rotulo: `o preço do item ${idx + 1}` });
    return {
      id: uuid(), seq: idx + 1, servicoId: sv.id, aditivoId: null,
      descricao: texto(it.descricao, 'descricao', { max: 400 }) || sv.nome,
      unidade: texto(it.unidade, 'unidade', { max: 20 }) || sv.unidade,
      quantidade: arredQtd(quantidade), precoUnitario, valorTotal: arred(quantidade * precoUnitario)
    };
  });
  const pct = (k, rotulo) => numero(corpo[k], k, { min: 0, max: 100, obrigatorio: false, rotulo }) || 0;
  const dataInicio = dataIso(corpo.dataInicio, 'dataInicio', { rotulo: 'o início' });
  const dataFim = dataIso(corpo.dataFim, 'dataFim', { rotulo: 'o término' });
  if (dataInicio && dataFim && dataFim < dataInicio) falha(400, 'datas_invalidas', 'O término não pode ser antes do início.');
  return {
    itens,
    objeto: texto(corpo.objeto, 'objeto', { max: 500, obrigatorio: true, rotulo: 'o objeto do contrato' }),
    tipo: escolha(corpo.tipo, TIPOS, 'tipo', 'empreitada'),
    dataAssinatura: dataIso(corpo.dataAssinatura, 'dataAssinatura', { rotulo: 'a assinatura' }),
    dataInicio, dataFim,
    retencaoPercentual: pct('retencaoPercentual', 'a retenção contratual'), inssPercentual: pct('inssPercentual', 'o INSS'),
    issPercentual: pct('issPercentual', 'o ISS'), irPercentual: pct('irPercentual', 'o IR'), pccPercentual: pct('pccPercentual', 'o PIS/COFINS/CSLL'),
    diasPagamento: numero(corpo.diasPagamento, 'diasPagamento', { min: 0, max: 365, inteiro: true, obrigatorio: false, rotulo: 'os dias para pagamento' }) || 0,
    observacoes: texto(corpo.observacoes, 'observacoes', { max: 2000 }),
    valorTotal: arred(itens.reduce((s, i) => s + i.valorTotal, 0))
  };
}

const SQL_ITENS = `INSERT INTO supr_contrato_itens (id, contratoId, aditivoId, seq, servicoId, descricao, unidade, quantidade, precoUnitario, valorTotal)
  SELECT json_extract(value, '$.id'), ?1, json_extract(value, '$.aditivoId'), json_extract(value, '$.seq'), json_extract(value, '$.servicoId'),
         json_extract(value, '$.descricao'), json_extract(value, '$.unidade'), json_extract(value, '$.quantidade'), json_extract(value, '$.precoUnitario'),
         json_extract(value, '$.valorTotal')
    FROM json_each(?2)`;

// Serviços em que o contrato passa do orçado (contando o que já está comprometido e realizado)
async function alertasDeOrcamento(env, orcamentoId, itens, ignorarContratoId) {
  const dados = await orcadoComMovimentos(env, orcamentoId);
  const porServico = new Map(dados.eap.filter((n) => n.tipo === 'servico').map((n) => [n.id, n]));
  const somaContrato = new Map();
  for (const i of itens) somaContrato.set(i.servicoId, (somaContrato.get(i.servicoId) || 0) + i.valorTotal);
  const alertas = [];
  for (const [sid, valor] of somaContrato) {
    const sv = porServico.get(sid);
    if (!sv) continue;
    const usado = ignorarContratoId ? 0 : (sv.comprometido + sv.realizado + sv.emAprovacao);
    if (usado + valor > sv.valor + 0.01) alertas.push({ servicoId: sid, eap: sv.eap, servico: sv.nome, orcado: sv.valor, usado: arred(usado), contrato: arred(valor) });
  }
  return alertas;
}

export async function criarContrato({ env, ctx, corpo }) {
  exigirEdicao(ctx);
  const orcamentoId = texto(corpo.orcamentoId, 'orcamentoId', { max: 100, obrigatorio: true, rotulo: 'a obra' });
  const fornecedor = await fornecedorAtivo(env, corpo.fornecedorId);
  const d = await dadosContrato(env, corpo, orcamentoId);
  const alertas = await alertasDeOrcamento(env, orcamentoId, d.itens, null);
  const p = await parametros(env);
  const status = ligado(p.contrato_exige_autorizacao) ? 'pendente' : 'autorizado';
  const id = uuid();
  const numeroContrato = await proximoNumero(env, 'contrato');
  const ts = agora();
  await env.DB.batch([
    env.DB.prepare(
      `INSERT INTO supr_contratos (id, numero, orcamentoId, fornecedorId, objeto, tipo, dataAssinatura, dataInicio, dataFim, retencaoPercentual,
         inssPercentual, issPercentual, irPercentual, pccPercentual, diasPagamento, valorTotal, observacoes, status, criadoPorEmail, criadoPorNome,
         autorizadoPor, autorizadoEm, criadoEm, atualizadoEm)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).bind(id, numeroContrato, orcamentoId, fornecedor.id, d.objeto, d.tipo, d.dataAssinatura, d.dataInicio, d.dataFim, d.retencaoPercentual,
      d.inssPercentual, d.issPercentual, d.irPercentual, d.pccPercentual, d.diasPagamento, d.valorTotal, d.observacoes, status, ctx.email, ctx.nome,
      status === 'autorizado' ? 'automática' : null, status === 'autorizado' ? ts : null, ts, ts),
    env.DB.prepare(SQL_ITENS).bind(id, JSON.stringify(d.itens)),
    historico(env, ctx, 'contrato', id, 'Criado', `${d.itens.length} item(ns), ${moeda(d.valorTotal)}` +
      (alertas.length ? ` · acima do orçado em ${alertas.length} serviço(s)` : '') + (status === 'autorizado' ? ' · autorizado automaticamente (parâmetro)' : ''))
  ]);
  return json({ ok: true, id, numero: numeroContrato, status, alertas });
}

export async function atualizarContrato({ env, ctx, params, corpo }) {
  exigirEdicao(ctx);
  const c = await contratoOuErro(env, params.id);
  if (!['pendente', 'reprovado'].includes(c.status)) falha(409, 'nao_editavel', 'Só dá para alterar contrato pendente de autorização ou reprovado. Use um aditivo.');
  const fornecedor = await fornecedorAtivo(env, corpo.fornecedorId || c.fornecedorId);
  const d = await dadosContrato(env, corpo, c.orcamentoId);
  const p = await parametros(env);
  const status = ligado(p.contrato_exige_autorizacao) ? 'pendente' : 'autorizado';
  const ts = agora();
  await env.DB.batch([
    env.DB.prepare('DELETE FROM supr_contrato_itens WHERE contratoId = ?').bind(c.id),
    env.DB.prepare(SQL_ITENS).bind(c.id, JSON.stringify(d.itens)),
    env.DB.prepare(
      `UPDATE supr_contratos SET fornecedorId = ?, objeto = ?, tipo = ?, dataAssinatura = ?, dataInicio = ?, dataFim = ?, retencaoPercentual = ?, inssPercentual = ?,
         issPercentual = ?, irPercentual = ?, pccPercentual = ?, diasPagamento = ?, valorTotal = ?, observacoes = ?, status = ?, motivoReprovacao = NULL,
         autorizadoPor = ?, autorizadoEm = ?, atualizadoEm = ? WHERE id = ?`
    ).bind(fornecedor.id, d.objeto, d.tipo, d.dataAssinatura, d.dataInicio, d.dataFim, d.retencaoPercentual, d.inssPercentual, d.issPercentual,
      d.irPercentual, d.pccPercentual, d.diasPagamento, d.valorTotal, d.observacoes, status, status === 'autorizado' ? 'automática' : null,
      status === 'autorizado' ? ts : null, ts, c.id),
    historico(env, ctx, 'contrato', c.id, c.status === 'reprovado' ? 'Alterado e reenviado para autorização' : 'Alterado', moeda(d.valorTotal))
  ]);
  return json({ ok: true, status });
}

export async function autorizarContrato({ env, ctx, params }) {
  const c = await contratoOuErro(env, params.id);
  if (c.status !== 'pendente') falha(409, 'nao_pendente', 'Este contrato não está aguardando autorização.');
  await exigirAlcada(env, ctx, 'contrato', c.valorTotal);
  const ts = agora();
  await env.DB.batch([
    env.DB.prepare("UPDATE supr_contratos SET status = 'autorizado', autorizadoPor = ?, autorizadoEm = ?, atualizadoEm = ? WHERE id = ?").bind(ctx.nome, ts, ts, c.id),
    historico(env, ctx, 'contrato', c.id, 'Autorizado', moeda(c.valorTotal))
  ]);
  return json({ ok: true });
}

export async function reprovarContrato({ env, ctx, params, corpo }) {
  const c = await contratoOuErro(env, params.id);
  if (c.status !== 'pendente') falha(409, 'nao_pendente', 'Este contrato não está aguardando autorização.');
  const motivo = texto(corpo.motivo, 'motivo', { max: 500, obrigatorio: true, rotulo: 'o motivo da reprovação' });
  await exigirAlcada(env, ctx, 'contrato', 0);
  await env.DB.batch([
    env.DB.prepare("UPDATE supr_contratos SET status = 'reprovado', motivoReprovacao = ?, autorizadoPor = ?, autorizadoEm = ?, atualizadoEm = ? WHERE id = ?")
      .bind(motivo, ctx.nome, agora(), agora(), c.id),
    historico(env, ctx, 'contrato', c.id, 'Reprovado', motivo)
  ]);
  return json({ ok: true });
}

export async function cancelarContrato({ env, ctx, params, corpo }) {
  exigirEdicao(ctx);
  const c = await contratoOuErro(env, params.id);
  if (['cancelado', 'encerrado'].includes(c.status)) falha(409, 'nao_cancelavel', `O contrato já está ${c.status}.`);
  const motivo = texto(corpo.motivo, 'motivo', { max: 500, obrigatorio: true, rotulo: 'o motivo do cancelamento' });
  const med = await env.DB.prepare("SELECT COUNT(*) AS n FROM supr_medicoes WHERE contratoId = ? AND status IN ('pendente', 'autorizada')").bind(c.id).first();
  if (med.n > 0) falha(409, 'com_medicao', 'O contrato tem medições: encerre o contrato em vez de cancelar.');
  await env.DB.batch([
    env.DB.prepare("UPDATE supr_contratos SET status = 'cancelado', atualizadoEm = ? WHERE id = ?").bind(agora(), c.id),
    env.DB.prepare("UPDATE supr_contrato_aditivos SET status = 'cancelado' WHERE contratoId = ? AND status = 'pendente'").bind(c.id),
    historico(env, ctx, 'contrato', c.id, 'Cancelado', motivo)
  ]);
  return json({ ok: true });
}

// Encerra o contrato (o saldo a medir deixa de ser comprometido) e libera a caução retida
export async function encerrarContrato({ env, ctx, params, corpo }) {
  exigirEdicao(ctx);
  const c = await contratoOuErro(env, params.id);
  if (c.status !== 'autorizado') falha(409, 'nao_encerravel', 'Só dá para encerrar contrato autorizado.');
  const pend = await env.DB.prepare(
    `SELECT (SELECT COUNT(*) FROM supr_medicoes WHERE contratoId = ?1 AND status = 'pendente') +
            (SELECT COUNT(*) FROM supr_contrato_aditivos WHERE contratoId = ?1 AND status = 'pendente') AS n`
  ).bind(c.id).first();
  if (pend.n > 0) falha(409, 'com_pendencias', 'Há medição ou aditivo aguardando autorização neste contrato.');
  const motivo = texto(corpo.motivo, 'motivo', { max: 500 });
  const ret = await env.DB.prepare("SELECT COALESCE(SUM(valorRetencao), 0) AS v FROM supr_medicoes WHERE contratoId = ? AND status = 'autorizada'").bind(c.id).first();
  const caucao = arred(ret.v);
  const ts = agora();
  const comandos = [
    env.DB.prepare("UPDATE supr_contratos SET status = 'encerrado', encerradoEm = ?, atualizadoEm = ? WHERE id = ?").bind(ts, ts, c.id),
    historico(env, ctx, 'contrato', c.id, 'Encerrado', motivo)
  ];
  if (caucao > 0 && corpo.liberarCaucao !== false) {
    const vencimento = dataIso(corpo.vencimentoCaucao, 'vencimentoCaucao', { rotulo: 'o vencimento da caução' }) || somarDias(hoje(), c.diasPagamento || 0);
    comandos.push(env.DB.prepare(SQL_TITULOS).bind(JSON.stringify([{
      id: uuid(), orcamentoId: c.orcamentoId, fornecedorId: c.fornecedorId, origemTipo: 'caucao', origemId: c.id,
      documento: `Caução contrato nº ${c.numero}`, parcela: 1, totalParcelas: 1, dataEmissao: hoje(), dataVencimento: vencimento,
      valor: caucao, observacoes: 'Liberação da retenção contratual', criadoEm: ts
    }])));
    comandos.push(historico(env, ctx, 'contrato', c.id, 'Caução liberada', `${moeda(caucao)} com vencimento em ${dataBr(vencimento)}`));
  }
  await env.DB.batch(comandos);
  return json({ ok: true, caucao });
}

/* ---------- aditivos ---------- */
export async function criarAditivo({ env, ctx, params, corpo }) {
  exigirEdicao(ctx);
  const c = await contratoOuErro(env, params.id);
  if (c.status !== 'autorizado') falha(409, 'contrato_nao_vigente', 'Só contrato autorizado recebe aditivo.');
  const itensAtuais = new Map((await itensComMedicao(env, [c.id])).map((i) => [i.id, i]));
  const orcado = await orcadoDaObra(env, c.orcamentoId);
  const servicos = new Map(orcado.eap.filter((n) => n.tipo === 'servico').map((n) => [n.id, n]));
  const itens = (Array.isArray(corpo.itens) ? corpo.itens : []).map((it, idx) => {
    const delta = numero(it.quantidade, 'quantidade', { rotulo: `a quantidade do item ${idx + 1}` });
    if (Math.abs(delta) <= TOLERANCIA) falha(400, 'quantidade_invalida', `Item ${idx + 1}: informe o acréscimo (positivo) ou a supressão (negativa).`);
    if (it.contratoItemId) {
      const atual = itensAtuais.get(it.contratoItemId);
      if (!atual) falha(400, 'item_invalido', `Item ${idx + 1}: item do contrato não encontrado.`);
      if (atual.quantidade + delta < atual.medido + atual.medidoPendente - TOLERANCIA) {
        falha(409, 'abaixo_do_medido', `"${atual.descricao}": a supressão deixaria a quantidade abaixo do que já foi medido.`);
      }
      return { contratoItemId: atual.id, servicoId: atual.servicoId, descricao: atual.descricao, unidade: atual.unidade,
        quantidade: arredQtd(delta), precoUnitario: atual.precoUnitario, valor: arred(delta * atual.precoUnitario) };
    }
    const sv = servicos.get(it.servicoId);
    if (!sv) falha(400, 'apropriacao_obrigatoria', `Item ${idx + 1}: escolha o serviço da EAP do item novo.`);
    if (delta < 0) falha(400, 'quantidade_invalida', `Item ${idx + 1}: item novo precisa de quantidade positiva.`);
    const precoUnitario = numero(it.precoUnitario, 'precoUnitario', { min: 0, rotulo: `o preço do item ${idx + 1}` });
    return { contratoItemId: null, servicoId: sv.id, descricao: texto(it.descricao, 'descricao', { max: 400 }) || sv.nome,
      unidade: texto(it.unidade, 'unidade', { max: 20 }) || sv.unidade, quantidade: arredQtd(delta), precoUnitario, valor: arred(delta * precoUnitario) };
  });
  const novaDataFim = dataIso(corpo.novaDataFim, 'novaDataFim', { rotulo: 'o novo término' });
  if (!itens.length && !novaDataFim) falha(400, 'aditivo_vazio', 'O aditivo precisa alterar itens ou o prazo.');
  const valor = arred(itens.reduce((s, i) => s + i.valor, 0));
  if (c.valorTotal + valor < -0.01) falha(400, 'valor_invalido', 'A supressão é maior que o valor do contrato.');
  const p = await parametros(env);
  const automatico = !ligado(p.contrato_exige_autorizacao);
  const proximo = await env.DB.prepare('SELECT COALESCE(MAX(numero), 0) + 1 AS n FROM supr_contrato_aditivos WHERE contratoId = ?').bind(c.id).first();
  const aditivo = { id: uuid(), numero: proximo.n, descricao: texto(corpo.descricao, 'descricao', { max: 1000, obrigatorio: true, rotulo: 'a justificativa do aditivo' }),
    novaDataFim, valor, itens };
  const ts = agora();
  const comandos = [
    env.DB.prepare(
      `INSERT INTO supr_contrato_aditivos (id, contratoId, numero, descricao, novaDataFim, valor, itens, status, criadoPorEmail, criadoPorNome, criadoEm)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'pendente', ?, ?, ?)`
    ).bind(aditivo.id, c.id, aditivo.numero, aditivo.descricao, novaDataFim, valor, JSON.stringify(itens), ctx.email, ctx.nome, ts),
    historico(env, ctx, 'contrato', c.id, `Aditivo nº ${aditivo.numero} criado`, `${moeda(valor)}` + (novaDataFim ? ` · término ${dataBr(novaDataFim)}` : ''))
  ];
  const maxSeq = Array.from(itensAtuais.values()).reduce((mx, i) => Math.max(mx, i.seq), 0);
  if (automatico) comandos.push(...comandosAplicarAditivo(env, ctx, c, aditivo, 'automática', maxSeq));
  await env.DB.batch(comandos);
  return json({ ok: true, id: aditivo.id, numero: aditivo.numero, status: automatico ? 'autorizado' : 'pendente' });
}

function comandosAplicarAditivo(env, ctx, c, aditivo, autorizadoPor, maxSeq) {
  const ts = agora();
  const novos = aditivo.itens.filter((i) => !i.contratoItemId);
  const ajustes = aditivo.itens.filter((i) => i.contratoItemId);
  const comandos = [
    env.DB.prepare("UPDATE supr_contrato_aditivos SET status = 'autorizado', autorizadoPor = ?, autorizadoEm = ? WHERE id = ?").bind(autorizadoPor, ts, aditivo.id),
    env.DB.prepare('UPDATE supr_contratos SET valorTotal = round(valorTotal + ?, 2), dataFim = COALESCE(?, dataFim), atualizadoEm = ? WHERE id = ?')
      .bind(aditivo.valor, aditivo.novaDataFim, ts, c.id),
    historico(env, ctx, 'contrato', c.id, `Aditivo nº ${aditivo.numero} autorizado`, moeda(aditivo.valor))
  ];
  if (ajustes.length) {
    comandos.push(env.DB.prepare(
      `UPDATE supr_contrato_itens SET quantidade = round(quantidade + json_extract(j.value, '$.quantidade'), 4),
         valorTotal = round((quantidade + json_extract(j.value, '$.quantidade')) * precoUnitario, 2)
         FROM (SELECT value FROM json_each(?1)) AS j WHERE supr_contrato_itens.id = json_extract(j.value, '$.contratoItemId')`
    ).bind(JSON.stringify(ajustes)));
  }
  if (novos.length) {
    comandos.push(env.DB.prepare(
      `INSERT INTO supr_contrato_itens (id, contratoId, aditivoId, seq, servicoId, descricao, unidade, quantidade, precoUnitario, valorTotal)
       SELECT lower(hex(randomblob(16))), ?1, ?2, ?4 + key + 1,
              json_extract(value, '$.servicoId'), json_extract(value, '$.descricao'), json_extract(value, '$.unidade'), json_extract(value, '$.quantidade'),
              json_extract(value, '$.precoUnitario'), json_extract(value, '$.valor')
         FROM json_each(?3)`
    ).bind(c.id, aditivo.id, JSON.stringify(novos), maxSeq));
  }
  return comandos;
}

async function aditivoOuErro(env, params) {
  const a = await env.DB.prepare('SELECT * FROM supr_contrato_aditivos WHERE id = ? AND contratoId = ?').bind(params.aditivoId, params.id).first();
  if (!a) falha(404, 'nao_encontrado', 'Aditivo não encontrado.');
  if (a.status !== 'pendente') falha(409, 'nao_pendente', 'Este aditivo não está aguardando autorização.');
  return { ...a, itens: JSON.parse(a.itens || '[]') };
}

export async function autorizarAditivo({ env, ctx, params }) {
  const c = await contratoOuErro(env, params.id);
  if (c.status !== 'autorizado') falha(409, 'contrato_nao_vigente', 'O contrato não está vigente.');
  const a = await aditivoOuErro(env, params);
  await exigirAlcada(env, ctx, 'contrato', Math.abs(a.valor));
  // a supressão não pode passar do que foi medido desde a criação do aditivo
  const itens = new Map((await itensComMedicao(env, [c.id])).map((i) => [i.id, i]));
  for (const i of a.itens) {
    const atual = i.contratoItemId && itens.get(i.contratoItemId);
    if (atual && atual.quantidade + i.quantidade < atual.medido + atual.medidoPendente - TOLERANCIA) {
      falha(409, 'abaixo_do_medido', `"${atual.descricao}": a supressão ficaria abaixo do já medido.`);
    }
  }
  const maxSeq = Array.from(itens.values()).reduce((mx, i) => Math.max(mx, i.seq), 0);
  await env.DB.batch(comandosAplicarAditivo(env, ctx, c, a, ctx.nome, maxSeq));
  return json({ ok: true });
}

export async function reprovarAditivo({ env, ctx, params, corpo }) {
  await contratoOuErro(env, params.id);
  const a = await aditivoOuErro(env, params);
  const motivo = texto(corpo.motivo, 'motivo', { max: 500, obrigatorio: true, rotulo: 'o motivo da reprovação' });
  await exigirAlcada(env, ctx, 'contrato', 0);
  await env.DB.batch([
    env.DB.prepare("UPDATE supr_contrato_aditivos SET status = 'reprovado', motivoReprovacao = ?, autorizadoPor = ?, autorizadoEm = ? WHERE id = ?")
      .bind(motivo, ctx.nome, agora(), a.id),
    historico(env, ctx, 'contrato', params.id, `Aditivo nº ${a.numero} reprovado`, motivo)
  ]);
  return json({ ok: true });
}

/* ---------- medições ---------- */
export async function listarMedicoes({ env, url }) {
  const obra = url.searchParams.get('obra') || '';
  const { results } = await env.DB.prepare(
    `SELECT m.*, c.numero AS contratoNumero, c.objeto, c.fornecedorId, f.nome AS fornecedorNome
       FROM supr_medicoes m JOIN supr_contratos c ON c.id = m.contratoId JOIN supr_fornecedores f ON f.id = c.fornecedorId
      WHERE (?1 = '' OR m.orcamentoId = ?1) ORDER BY m.data DESC, m.criadoEm DESC LIMIT 1000`
  ).bind(obra).all();
  return json({ medicoes: results });
}

export async function obterMedicao({ env, params }) {
  const m = await env.DB.prepare('SELECT * FROM supr_medicoes WHERE id = ?').bind(params.id).first();
  if (!m) falha(404, 'nao_encontrada', 'Medição não encontrada.');
  const c = await contratoOuErro(env, m.contratoId);
  const [fornecedor, itensMedicao, titulos, anteriores] = await env.DB.batch([
    env.DB.prepare('SELECT * FROM supr_fornecedores WHERE id = ?').bind(c.fornecedorId),
    env.DB.prepare('SELECT * FROM supr_medicao_itens WHERE medicaoId = ?').bind(m.id),
    env.DB.prepare("SELECT * FROM fin_titulos WHERE origemTipo = 'medicao' AND origemId = ?").bind(m.id),
    env.DB.prepare(
      `SELECT mi.contratoItemId, SUM(mi.quantidade) AS quantidade FROM supr_medicao_itens mi JOIN supr_medicoes x ON x.id = mi.medicaoId
        WHERE x.contratoId = ? AND x.status = 'autorizada' AND x.numero < ? GROUP BY mi.contratoItemId`
    ).bind(c.id, m.numero)
  ]);
  const itensContrato = await itensComMedicao(env, [c.id]);
  const medidos = new Map(itensMedicao.results.map((i) => [i.contratoItemId, i]));
  const ant = new Map(anteriores.results.map((a) => [a.contratoItemId, a.quantidade]));
  return json({
    medicao: {
      ...m, contrato: c, fornecedor: fornecedor.results[0] || null, titulos: titulos.results,
      itens: itensContrato.map((ci) => {
        const atual = medidos.get(ci.id);
        const anterior = ant.get(ci.id) || 0;
        return { contratoItemId: ci.id, servicoId: ci.servicoId, descricao: ci.descricao, unidade: ci.unidade, quantidadeContratada: ci.quantidade,
          precoUnitario: ci.precoUnitario, anterior, atual: atual ? atual.quantidade : 0, valor: atual ? atual.valor : 0,
          acumulado: arredQtd(anterior + (atual ? atual.quantidade : 0)) };
      }),
      historico: await lerHistorico(env, 'medicao', m.id)
    }
  });
}

function valoresDaMedicao(c, bruto, descontos) {
  const r = (pct) => arred(bruto * (pct || 0) / 100);
  const v = { valorBruto: arred(bruto), valorRetencao: r(c.retencaoPercentual), valorInss: r(c.inssPercentual), valorIss: r(c.issPercentual),
    valorIr: r(c.irPercentual), valorPcc: r(c.pccPercentual), valorDescontos: arred(descontos) };
  v.valorLiquido = arred(v.valorBruto - v.valorRetencao - v.valorInss - v.valorIss - v.valorIr - v.valorPcc - v.valorDescontos);
  return v;
}

function comandosAutorizarMedicao(env, ctx, c, m, autorizadoPor) {
  const ts = agora();
  const comandos = [
    env.DB.prepare("UPDATE supr_medicoes SET status = 'autorizada', autorizadoPor = ?, autorizadoEm = ? WHERE id = ?").bind(autorizadoPor, ts, m.id),
    historico(env, ctx, 'medicao', m.id, 'Autorizada', `Líquido ${moeda(m.valorLiquido)}`),
    historico(env, ctx, 'contrato', c.id, `Medição nº ${m.numero} autorizada`, moeda(m.valorBruto))
  ];
  if (m.valorLiquido > 0) {
    comandos.push(env.DB.prepare(SQL_TITULOS).bind(JSON.stringify([{
      id: uuid(), orcamentoId: c.orcamentoId, fornecedorId: c.fornecedorId, origemTipo: 'medicao', origemId: m.id,
      documento: `Medição ${m.numero} · contrato nº ${c.numero}`, parcela: 1, totalParcelas: 1, dataEmissao: m.data,
      dataVencimento: m.dataVencimento || somarDias(m.data, c.diasPagamento || 0), valor: m.valorLiquido, observacoes: null, criadoEm: ts
    }])));
  }
  return comandos;
}

export async function criarMedicao({ env, ctx, params, corpo }) {
  exigirEdicao(ctx);
  const c = await contratoOuErro(env, params.id);
  if (c.status !== 'autorizado') falha(409, 'contrato_nao_vigente', 'Só contrato autorizado pode ser medido.');
  const itensContrato = new Map((await itensComMedicao(env, [c.id])).map((i) => [i.id, i]));
  const itens = [];
  for (const it of Array.isArray(corpo.itens) ? corpo.itens : []) {
    const ci = itensContrato.get(it.contratoItemId);
    if (!ci) falha(400, 'item_invalido', 'Item de contrato inválido na medição.');
    const quantidade = numero(it.quantidade, 'quantidade', { min: 0, obrigatorio: false, rotulo: `a quantidade medida de "${ci.descricao}"` }) || 0;
    if (quantidade <= TOLERANCIA) continue;
    if (quantidade > ci.saldo + TOLERANCIA) falha(409, 'acima_do_contrato', `"${ci.descricao}": saldo a medir é ${ci.saldo} ${ci.unidade || ''}.`);
    itens.push({ id: uuid(), contratoItemId: ci.id, quantidade: arredQtd(quantidade), precoUnitario: ci.precoUnitario, valor: arred(quantidade * ci.precoUnitario) });
  }
  if (!itens.length) falha(400, 'medicao_vazia', 'Informe a quantidade medida de ao menos um item.');
  const data = dataIso(corpo.data, 'data', { rotulo: 'a data da medição' }) || hoje();
  const periodoInicio = dataIso(corpo.periodoInicio, 'periodoInicio', { rotulo: 'o início do período' });
  const periodoFim = dataIso(corpo.periodoFim, 'periodoFim', { rotulo: 'o fim do período' });
  if (periodoInicio && periodoFim && periodoFim < periodoInicio) falha(400, 'datas_invalidas', 'O fim do período não pode ser antes do início.');
  const descontos = numero(corpo.valorDescontos, 'valorDescontos', { min: 0, obrigatorio: false, rotulo: 'os descontos' }) || 0;
  const v = valoresDaMedicao(c, itens.reduce((s, i) => s + i.valor, 0), descontos);
  if (v.valorLiquido < 0) falha(400, 'liquido_negativo', 'Retenções e descontos passam do valor medido.');
  const prm = await parametros(env);
  const automatico = !ligado(prm.medicao_exige_autorizacao);
  const proximo = await env.DB.prepare('SELECT COALESCE(MAX(numero), 0) + 1 AS n FROM supr_medicoes WHERE contratoId = ?').bind(c.id).first();
  const m = { id: uuid(), numero: proximo.n, data, dataVencimento: dataIso(corpo.dataVencimento, 'dataVencimento', { rotulo: 'o vencimento' }) || somarDias(data, c.diasPagamento || 0), ...v };
  const ts = agora();
  const comandos = [
    env.DB.prepare(
      `INSERT INTO supr_medicoes (id, contratoId, orcamentoId, numero, periodoInicio, periodoFim, data, dataVencimento, valorBruto, valorRetencao, valorInss,
         valorIss, valorIr, valorPcc, valorDescontos, valorLiquido, observacoes, status, criadoPorEmail, criadoPorNome, criadoEm)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pendente', ?, ?, ?)`
    ).bind(m.id, c.id, c.orcamentoId, m.numero, periodoInicio, periodoFim, data, m.dataVencimento, v.valorBruto, v.valorRetencao, v.valorInss,
      v.valorIss, v.valorIr, v.valorPcc, v.valorDescontos, v.valorLiquido, texto(corpo.observacoes, 'observacoes', { max: 2000 }), ctx.email, ctx.nome, ts),
    env.DB.prepare(
      `INSERT INTO supr_medicao_itens (id, medicaoId, contratoItemId, quantidade, precoUnitario, valor)
       SELECT json_extract(value, '$.id'), ?1, json_extract(value, '$.contratoItemId'), json_extract(value, '$.quantidade'),
              json_extract(value, '$.precoUnitario'), json_extract(value, '$.valor') FROM json_each(?2)`
    ).bind(m.id, JSON.stringify(itens)),
    historico(env, ctx, 'medicao', m.id, 'Criada', `Bruto ${moeda(v.valorBruto)} · líquido ${moeda(v.valorLiquido)}`),
    historico(env, ctx, 'contrato', c.id, `Medição nº ${m.numero} criada`, moeda(v.valorBruto))
  ];
  if (automatico) comandos.push(...comandosAutorizarMedicao(env, ctx, c, m, 'automática'));
  await env.DB.batch(comandos);
  return json({ ok: true, id: m.id, numero: m.numero, status: automatico ? 'autorizada' : 'pendente', ...v });
}

async function medicaoComContrato(env, id) {
  const m = await env.DB.prepare('SELECT * FROM supr_medicoes WHERE id = ?').bind(id).first();
  if (!m) falha(404, 'nao_encontrada', 'Medição não encontrada.');
  return { m, c: await contratoOuErro(env, m.contratoId) };
}

export async function autorizarMedicao({ env, ctx, params }) {
  const { m, c } = await medicaoComContrato(env, params.id);
  if (m.status !== 'pendente') falha(409, 'nao_pendente', 'Esta medição não está aguardando autorização.');
  if (c.status !== 'autorizado') falha(409, 'contrato_nao_vigente', 'O contrato não está vigente.');
  await exigirAlcada(env, ctx, 'medicao', m.valorBruto);
  await env.DB.batch(comandosAutorizarMedicao(env, ctx, c, m, ctx.nome));
  return json({ ok: true });
}

export async function reprovarMedicao({ env, ctx, params, corpo }) {
  const { m, c } = await medicaoComContrato(env, params.id);
  if (m.status !== 'pendente') falha(409, 'nao_pendente', 'Esta medição não está aguardando autorização.');
  const motivo = texto(corpo.motivo, 'motivo', { max: 500, obrigatorio: true, rotulo: 'o motivo da reprovação' });
  await exigirAlcada(env, ctx, 'medicao', 0);
  await env.DB.batch([
    env.DB.prepare("UPDATE supr_medicoes SET status = 'reprovada', motivoReprovacao = ?, autorizadoPor = ?, autorizadoEm = ? WHERE id = ?")
      .bind(motivo, ctx.nome, agora(), m.id),
    historico(env, ctx, 'medicao', m.id, 'Reprovada', motivo),
    historico(env, ctx, 'contrato', c.id, `Medição nº ${m.numero} reprovada`, motivo)
  ]);
  return json({ ok: true });
}

export async function cancelarMedicao({ env, ctx, params, corpo }) {
  exigirEdicao(ctx);
  const { m, c } = await medicaoComContrato(env, params.id);
  if (!['pendente', 'autorizada'].includes(m.status)) falha(409, 'nao_cancelavel', `A medição está ${m.status}.`);
  if (c.status === 'encerrado') falha(409, 'contrato_encerrado', 'O contrato já foi encerrado.');
  const motivo = texto(corpo.motivo, 'motivo', { max: 500, obrigatorio: true, rotulo: 'o motivo do cancelamento' });
  const pago = await env.DB.prepare("SELECT COUNT(*) AS n FROM fin_titulos WHERE origemTipo = 'medicao' AND origemId = ? AND status = 'pago'").bind(m.id).first();
  if (pago.n > 0) falha(409, 'titulo_pago', 'O título desta medição já foi pago: estorne o pagamento no Financeiro antes.');
  await env.DB.batch([
    env.DB.prepare("UPDATE supr_medicoes SET status = 'cancelada' WHERE id = ?").bind(m.id),
    env.DB.prepare("UPDATE fin_titulos SET status = 'cancelado', atualizadoEm = ? WHERE origemTipo = 'medicao' AND origemId = ? AND status = 'aberto'").bind(agora(), m.id),
    historico(env, ctx, 'medicao', m.id, 'Cancelada', motivo),
    historico(env, ctx, 'contrato', c.id, `Medição nº ${m.numero} cancelada`, motivo)
  ]);
  return json({ ok: true });
}
