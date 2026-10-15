// Estoque (almoxarifado) de cada obra: entra pela nota fiscal (materiais) ou por entrada avulsa, sai
// por requisição de material apropriada a um serviço da EAP, passa entre obras por transferência e
// é ajustado pelo inventário. Saldo e custo médio vêm dos movimentos não estornados; a saída é
// valorizada pelo custo médio do momento.
import {
  json, falha, uuid, agora, hoje, texto, numero, dataIso, listaObrigatoria, arred, arredQtd, exigirEdicao, historico
} from './base.js';
import { exigirObra, orcadoDaObra } from './orcado.js';

const TOLERANCIA = 1e-6;
const ENTRADAS = ['entrada', 'transferencia_entrada', 'ajuste_entrada'];
const SAIDAS = ['saida', 'transferencia_saida', 'ajuste_saida'];
export const NOMES_TIPO = {
  entrada: 'Entrada por nota fiscal', saida: 'Saída para serviço', transferencia_entrada: 'Transferência recebida',
  transferencia_saida: 'Transferência enviada', ajuste_entrada: 'Entrada avulsa / ajuste', ajuste_saida: 'Saída por ajuste'
};

export async function saldosDaObra(env, orcamentoId) {
  const { results } = await env.DB.prepare(
    `SELECT insumoChave, insumoCodigo, descricao, unidade, tipo, quantidade, valorTotal, data
       FROM supr_estoque_movimentos WHERE orcamentoId = ? AND estornado = 0 ORDER BY data, criadoEm`
  ).bind(orcamentoId).all();
  const saldos = new Map();
  for (const m of results) {
    let s = saldos.get(m.insumoChave);
    if (!s) {
      s = { chave: m.insumoChave, codigo: m.insumoCodigo || '', descricao: m.descricao, unidade: m.unidade || '',
        entradas: 0, saidas: 0, valorEntradas: 0, valorSaidas: 0, ultimaMovimentacao: null };
      saldos.set(m.insumoChave, s);
    }
    if (ENTRADAS.includes(m.tipo)) { s.entradas += m.quantidade; s.valorEntradas += m.valorTotal; }
    else { s.saidas += m.quantidade; s.valorSaidas += m.valorTotal; }
    s.ultimaMovimentacao = m.data;
  }
  for (const s of saldos.values()) {
    s.saldo = arredQtd(s.entradas - s.saidas);
    s.custoMedio = s.entradas > 0 ? arred(s.valorEntradas / s.entradas, 6) : 0;
    s.valorSaldo = arred(s.saldo * s.custoMedio);
    s.entradas = arredQtd(s.entradas);
    s.saidas = arredQtd(s.saidas);
  }
  return saldos;
}

export async function listarSaldos({ env, url }) {
  const obra = url.searchParams.get('obra') || '';
  await exigirObra(env, obra);
  const saldos = Array.from((await saldosDaObra(env, obra)).values()).sort((a, b) => a.descricao.localeCompare(b.descricao, 'pt-BR'));
  return json({ saldos, valorTotal: arred(saldos.reduce((s, x) => s + Math.max(0, x.valorSaldo), 0)) });
}

export async function listarMovimentos({ env, url }) {
  const obra = url.searchParams.get('obra') || '';
  await exigirObra(env, obra);
  const insumo = url.searchParams.get('insumo') || '';
  const { results } = await env.DB.prepare(
    `SELECT * FROM supr_estoque_movimentos WHERE orcamentoId = ?1 AND (?2 = '' OR insumoChave = ?2) ORDER BY data DESC, criadoEm DESC LIMIT 2000`
  ).bind(obra, insumo).all();
  return json({ movimentos: results });
}

function movimento(base, campos) {
  return { id: uuid(), estornado: 0, criadoEm: agora(), ...base, ...campos };
}

export const SQL_MOVIMENTOS = `INSERT INTO supr_estoque_movimentos (id, orcamentoId, data, tipo, insumoChave, insumoCodigo, descricao, unidade, quantidade,
    valorUnitario, valorTotal, servicoId, origemTipo, origemId, documento, observacao, estornado, usuarioEmail, usuarioNome, criadoEm)
  SELECT json_extract(value, '$.id'), json_extract(value, '$.orcamentoId'), json_extract(value, '$.data'), json_extract(value, '$.tipo'),
         json_extract(value, '$.insumoChave'), json_extract(value, '$.insumoCodigo'), json_extract(value, '$.descricao'), json_extract(value, '$.unidade'),
         json_extract(value, '$.quantidade'), json_extract(value, '$.valorUnitario'), json_extract(value, '$.valorTotal'), json_extract(value, '$.servicoId'),
         json_extract(value, '$.origemTipo'), json_extract(value, '$.origemId'), json_extract(value, '$.documento'), json_extract(value, '$.observacao'), 0,
         json_extract(value, '$.usuarioEmail'), json_extract(value, '$.usuarioNome'), json_extract(value, '$.criadoEm')
    FROM json_each(?1)`;

function cabecalho(ctx, corpo) {
  return {
    data: dataIso(corpo.data, 'data', { rotulo: 'a data' }) || hoje(),
    documento: texto(corpo.documento, 'documento', { max: 120 }),
    observacao: texto(corpo.observacao, 'observacao', { max: 500 }),
    usuarioEmail: ctx.email, usuarioNome: ctx.nome
  };
}

// Itens com saldo suficiente; devolve as linhas de saída valorizadas pelo custo médio
function saidasComSaldo(saldos, itens, tipo, extra) {
  const pedido = new Map();
  return itens.map((it, idx) => {
    const s = saldos.get(it.insumoChave);
    if (!s) falha(400, 'sem_saldo', `Item ${idx + 1}: insumo sem saldo no estoque desta obra.`);
    const quantidade = numero(it.quantidade, 'quantidade', { min: 0, rotulo: `a quantidade de "${s.descricao}"` });
    if (!(quantidade > 0)) falha(400, 'quantidade_invalida', `Informe a quantidade de "${s.descricao}".`);
    const total = (pedido.get(s.chave) || 0) + quantidade;
    pedido.set(s.chave, total);
    if (total > s.saldo + TOLERANCIA) falha(409, 'sem_saldo', `"${s.descricao}": saldo em estoque é ${s.saldo} ${s.unidade}.`);
    return { ...extra(it, s), tipo, insumoChave: s.chave, insumoCodigo: s.codigo, descricao: s.descricao, unidade: s.unidade,
      quantidade: arredQtd(quantidade), valorUnitario: s.custoMedio, valorTotal: arred(quantidade * s.custoMedio) };
  });
}

/* ---------- saída para serviço (requisição de material) ---------- */
export async function registrarSaida({ env, ctx, corpo }) {
  exigirEdicao(ctx);
  const orcamentoId = texto(corpo.orcamentoId, 'orcamentoId', { max: 100, obrigatorio: true, rotulo: 'a obra' });
  const orcado = await orcadoDaObra(env, orcamentoId);
  const servicos = new Set(orcado.eap.filter((n) => n.tipo === 'servico').map((n) => n.id));
  const saldos = await saldosDaObra(env, orcamentoId);
  const cab = cabecalho(ctx, corpo);
  const itens = saidasComSaldo(saldos, listaObrigatoria(corpo.itens, 'itens', { max: 200, rotulo: 'a saída' }), 'saida', (it, s) => {
    if (!servicos.has(it.servicoId)) falha(400, 'apropriacao_obrigatoria', `"${s.descricao}": escolha o serviço da EAP que consumiu o material.`);
    return movimento({ orcamentoId, ...cab, origemTipo: 'manual', origemId: null }, { servicoId: it.servicoId });
  });
  await env.DB.batch([
    env.DB.prepare(SQL_MOVIMENTOS).bind(JSON.stringify(itens)),
    historico(env, ctx, 'estoque', orcamentoId, 'Saída de material', `${itens.length} item(ns)` + (cab.documento ? ` · ${cab.documento}` : ''))
  ]);
  return json({ ok: true });
}

/* ---------- entrada avulsa (sobras, devolução de obra, material recebido sem nota) ---------- */
export async function registrarEntrada({ env, ctx, corpo }) {
  exigirEdicao(ctx);
  const orcamentoId = texto(corpo.orcamentoId, 'orcamentoId', { max: 100, obrigatorio: true, rotulo: 'a obra' });
  await exigirObra(env, orcamentoId);
  const saldos = await saldosDaObra(env, orcamentoId);
  const cab = cabecalho(ctx, corpo);
  const itens = listaObrigatoria(corpo.itens, 'itens', { max: 200, rotulo: 'a entrada' }).map((it, idx) => {
    const chave = texto(it.insumoChave, 'insumoChave', { max: 140, obrigatorio: true, rotulo: `o insumo do item ${idx + 1}` });
    if (!/^(I|C|PI|PC|S):/.test(chave)) falha(400, 'insumo_invalido', `Item ${idx + 1}: escolha o insumo pela busca.`);
    const s = saldos.get(chave);
    const quantidade = numero(it.quantidade, 'quantidade', { min: 0.000001, rotulo: `a quantidade do item ${idx + 1}` });
    const valorUnitario = numero(it.valorUnitario, 'valorUnitario', { min: 0, obrigatorio: false, rotulo: `o custo do item ${idx + 1}` });
    const custo = valorUnitario != null ? valorUnitario : (s ? s.custoMedio : 0);
    return movimento({ orcamentoId, ...cab, origemTipo: 'manual', origemId: null }, {
      tipo: 'ajuste_entrada', insumoChave: chave, insumoCodigo: s ? s.codigo : texto(it.insumoCodigo, 'insumoCodigo', { max: 60 }),
      descricao: s ? s.descricao : texto(it.descricao, 'descricao', { max: 400, obrigatorio: true, rotulo: `a descrição do item ${idx + 1}` }),
      unidade: s ? s.unidade : texto(it.unidade, 'unidade', { max: 20 }), servicoId: null,
      quantidade: arredQtd(quantidade), valorUnitario: custo, valorTotal: arred(quantidade * custo)
    });
  });
  await env.DB.batch([
    env.DB.prepare(SQL_MOVIMENTOS).bind(JSON.stringify(itens)),
    historico(env, ctx, 'estoque', orcamentoId, 'Entrada avulsa', `${itens.length} item(ns)` + (cab.documento ? ` · ${cab.documento}` : ''))
  ]);
  return json({ ok: true });
}

/* ---------- transferência entre obras ---------- */
export async function transferir({ env, ctx, corpo }) {
  exigirEdicao(ctx);
  const origem = texto(corpo.origemId, 'origemId', { max: 100, obrigatorio: true, rotulo: 'a obra de origem' });
  const destino = texto(corpo.destinoId, 'destinoId', { max: 100, obrigatorio: true, rotulo: 'a obra de destino' });
  if (origem === destino) falha(400, 'mesma_obra', 'Escolha uma obra de destino diferente da origem.');
  const [vOrigem, vDestino] = await Promise.all([exigirObra(env, origem), exigirObra(env, destino)]);
  const saldos = await saldosDaObra(env, origem);
  const cab = cabecalho(ctx, corpo);
  const transferenciaId = uuid();
  const saidas = saidasComSaldo(saldos, listaObrigatoria(corpo.itens, 'itens', { max: 200, rotulo: 'a transferência' }), 'transferencia_saida',
    () => movimento({ orcamentoId: origem, ...cab, origemTipo: 'transferencia', origemId: transferenciaId,
      observacao: [cab.observacao, `Para ${vDestino.codigo || ''} ${vDestino.nome || ''}`.trim()].filter(Boolean).join(' · ') }, { servicoId: null }));
  const entradas = saidas.map((s) => ({ ...s, id: uuid(), orcamentoId: destino, tipo: 'transferencia_entrada',
    observacao: [cab.observacao, `De ${vOrigem.codigo || ''} ${vOrigem.nome || ''}`.trim()].filter(Boolean).join(' · ') }));
  await env.DB.batch([
    env.DB.prepare(SQL_MOVIMENTOS).bind(JSON.stringify(saidas.concat(entradas))),
    historico(env, ctx, 'estoque', origem, 'Transferência enviada', `${saidas.length} item(ns) para ${vDestino.nome || destino}`),
    historico(env, ctx, 'estoque', destino, 'Transferência recebida', `${saidas.length} item(ns) de ${vOrigem.nome || origem}`)
  ]);
  return json({ ok: true, transferenciaId });
}

/* ---------- inventário: contagem física vira ajuste ---------- */
export async function registrarInventario({ env, ctx, corpo }) {
  exigirEdicao(ctx);
  const orcamentoId = texto(corpo.orcamentoId, 'orcamentoId', { max: 100, obrigatorio: true, rotulo: 'a obra' });
  await exigirObra(env, orcamentoId);
  const saldos = await saldosDaObra(env, orcamentoId);
  const cab = cabecalho(ctx, corpo);
  const inventarioId = uuid();
  const ajustes = [];
  for (const it of listaObrigatoria(corpo.itens, 'itens', { max: 1000, rotulo: 'o inventário' })) {
    const s = saldos.get(it.insumoChave);
    if (!s) continue;
    const contada = numero(it.quantidadeContada, 'quantidadeContada', { min: 0, rotulo: `a contagem de "${s.descricao}"` });
    const diferenca = arredQtd(contada - s.saldo);
    if (Math.abs(diferenca) <= TOLERANCIA) continue;
    ajustes.push(movimento({ orcamentoId, ...cab, origemTipo: 'inventario', origemId: inventarioId }, {
      tipo: diferenca > 0 ? 'ajuste_entrada' : 'ajuste_saida', insumoChave: s.chave, insumoCodigo: s.codigo, descricao: s.descricao,
      unidade: s.unidade, servicoId: null, quantidade: Math.abs(diferenca), valorUnitario: s.custoMedio,
      valorTotal: arred(Math.abs(diferenca) * s.custoMedio),
      observacao: [cab.observacao, `Inventário: sistema ${s.saldo}, contado ${contada}`].filter(Boolean).join(' · ')
    }));
  }
  if (!ajustes.length) return json({ ok: true, ajustes: 0 });
  await env.DB.batch([
    env.DB.prepare(SQL_MOVIMENTOS).bind(JSON.stringify(ajustes)),
    historico(env, ctx, 'estoque', orcamentoId, 'Inventário', `${ajustes.length} ajuste(s)`)
  ]);
  return json({ ok: true, ajustes: ajustes.length });
}

/* ---------- estorno de movimento manual ---------- */
export async function estornarMovimento({ env, ctx, params, corpo }) {
  exigirEdicao(ctx);
  const m = await env.DB.prepare('SELECT * FROM supr_estoque_movimentos WHERE id = ?').bind(params.id).first();
  if (!m) falha(404, 'nao_encontrado', 'Movimento não encontrado.');
  if (m.estornado) falha(409, 'ja_estornado', 'Movimento já estornado.');
  if (m.origemTipo === 'nota') falha(409, 'origem_nota', 'Entrada de nota fiscal: cancele a nota para estornar.');
  const motivo = texto(corpo.motivo, 'motivo', { max: 300, obrigatorio: true, rotulo: 'o motivo do estorno' });
  // transferência estorna os dois lados; entrada só se o saldo continuar positivo
  const grupo = m.origemTipo === 'transferencia'
    ? (await env.DB.prepare("SELECT * FROM supr_estoque_movimentos WHERE origemTipo = 'transferencia' AND origemId = ? AND insumoChave = ? AND estornado = 0")
      .bind(m.origemId, m.insumoChave).all()).results
    : [m];
  for (const g of grupo) {
    if (!ENTRADAS.includes(g.tipo)) continue;
    const saldo = (await saldosDaObra(env, g.orcamentoId)).get(g.insumoChave);
    if (!saldo || saldo.saldo - g.quantidade < -TOLERANCIA) {
      falha(409, 'saldo_negativo', `Não dá para estornar: parte de "${g.descricao}" já saiu do estoque.`);
    }
  }
  await env.DB.batch([
    env.DB.prepare('UPDATE supr_estoque_movimentos SET estornado = 1, observacao = trim(COALESCE(observacao, \'\') || ?) WHERE id IN (SELECT value FROM json_each(?))')
      .bind(` · Estornado: ${motivo}`, JSON.stringify(grupo.map((g) => g.id))),
    historico(env, ctx, 'estoque', m.orcamentoId, 'Movimento estornado', `${m.descricao}: ${m.quantidade} ${m.unidade || ''} — ${motivo}`)
  ]);
  return json({ ok: true });
}

export { ENTRADAS, SAIDAS };
