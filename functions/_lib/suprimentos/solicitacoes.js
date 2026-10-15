// Solicitação de compra (SC): a obra pede insumos do orçamento (ou fora dele), cada um apropriado a
// um ou mais serviços da EAP. A quantidade é conferida com o saldo orçado (orçado − já solicitado)
// em cada serviço; item acima do saldo ou fora do orçamento sempre passa por autorização.
// Situação de atendimento (calculada): aguardando compra → em cotação → atendida parcial → atendida.
import {
  json, falha, uuid, agora, hoje, texto, numero, dataIso, listaObrigatoria, lista, lerJson, arred, arredQtd,
  exigirEdicao, exigirAlcada, historico, lerHistorico, proximoNumero, parametros, ligado, normalizarApropriacoes
} from './base.js';
import { orcadoDaObra } from './orcado.js';
import { movimentosDaObra, consolidar } from './saldos.js';
import { exigirServicos } from './obras.js';

const RE_CHAVE = /^(I|C|PI|PC|S):[\w:.-]{1,120}$/;
const TOLERANCIA = 1e-6;

// Quanto de cada item de SC está em cotação aberta, comprado (pedidos válidos) e recebido
export async function atendimentoDosItens(env, itemIds) {
  if (!itemIds.length) return new Map();
  const ids = lista(itemIds);
  const [cot, ped] = await env.DB.batch([
    env.DB.prepare(
      `SELECT ci.solicitacaoItemId, ci.quantidade, c.id AS cotacaoId, c.numero
         FROM supr_cotacao_itens ci JOIN supr_cotacoes c ON c.id = ci.cotacaoId
        WHERE c.status = 'aberta' AND ci.solicitacaoItemId IN (SELECT value FROM json_each(?1))`
    ).bind(ids),
    env.DB.prepare(
      `SELECT pi.id, pi.solicitacaoItemId, pi.quantidade, pi.quantidadeEncerrada, p.id AS pedidoId, p.numero, p.status,
              (SELECT COALESCE(SUM(ni.quantidade), 0) FROM supr_nota_itens ni JOIN supr_notas n ON n.id = ni.notaId
                WHERE ni.pedidoItemId = pi.id AND n.status = 'lancada') AS recebido
         FROM supr_pedido_itens pi JOIN supr_pedidos p ON p.id = pi.pedidoId
        WHERE p.status NOT IN ('cancelado', 'reprovado') AND pi.solicitacaoItemId IN (SELECT value FROM json_each(?1))`
    ).bind(ids)
  ]);
  const mapa = new Map(itemIds.map((id) => [id, { emCotacao: 0, cotacoes: [], comprado: 0, recebido: 0, pedidos: [] }]));
  for (const c of cot.results) {
    const a = mapa.get(c.solicitacaoItemId);
    a.emCotacao += c.quantidade;
    a.cotacoes.push({ id: c.cotacaoId, numero: c.numero, quantidade: c.quantidade });
  }
  for (const p of ped.results) {
    const a = mapa.get(p.solicitacaoItemId);
    const efetivo = Math.max(0, p.quantidade - (p.quantidadeEncerrada || 0));
    a.comprado += efetivo;
    a.recebido += p.recebido;
    a.pedidos.push({ id: p.pedidoId, numero: p.numero, status: p.status, quantidade: efetivo, recebido: p.recebido });
  }
  return mapa;
}

function saldoDoItem(item, at) {
  if (item.status !== 'autorizado' || item.encerrado) return 0;
  return Math.max(0, arredQtd(item.quantidade - at.comprado));
}

// Situação da SC a partir dos itens: só faz sentido para SC autorizada
function situacao(sc, itens, atendimento) {
  if (sc.status !== 'autorizada') return sc.status;
  const validos = itens.filter((i) => i.status === 'autorizado');
  if (!validos.length) return 'cancelada';
  let algumComprado = false, algumEmCotacao = false, todosAtendidos = true;
  for (const i of validos) {
    const at = atendimento.get(i.id) || { comprado: 0, emCotacao: 0 };
    if (at.comprado > TOLERANCIA) algumComprado = true;
    if (at.emCotacao > TOLERANCIA) algumEmCotacao = true;
    if (!i.encerrado && at.comprado + TOLERANCIA < i.quantidade) todosAtendidos = false;
  }
  if (todosAtendidos) return 'atendida';
  if (algumComprado) return 'atendida_parcial';
  if (algumEmCotacao) return 'em_cotacao';
  return 'aguardando_compra';
}

/* ---------- lista e detalhe ---------- */
export async function listarSolicitacoes({ env, url }) {
  const obra = url.searchParams.get('obra') || '';
  const { results: scs } = await env.DB.prepare(
    `SELECT * FROM supr_solicitacoes WHERE (?1 = '' OR orcamentoId = ?1) ORDER BY numero DESC LIMIT 1000`
  ).bind(obra).all();
  if (!scs.length) return json({ solicitacoes: [] });
  const { results: itens } = await env.DB.prepare(
    `SELECT id, solicitacaoId, descricao, quantidade, status, encerrado, dataNecessidade FROM supr_solicitacao_itens
      WHERE solicitacaoId IN (SELECT value FROM json_each(?1))`
  ).bind(lista(scs.map((s) => s.id))).all();
  const atendimento = await atendimentoDosItens(env, itens.filter((i) => i.status === 'autorizado').map((i) => i.id));
  const porSc = new Map();
  for (const i of itens) (porSc.get(i.solicitacaoId) || porSc.set(i.solicitacaoId, []).get(i.solicitacaoId)).push(i);
  return json({
    solicitacoes: scs.map((s) => {
      const its = porSc.get(s.id) || [];
      const datas = its.map((i) => i.dataNecessidade).filter(Boolean).sort();
      return {
        ...s, itens: its.length, resumo: its.slice(0, 3).map((i) => i.descricao).join('; '),
        necessidade: datas[0] || null, situacao: situacao(s, its, atendimento)
      };
    })
  });
}

export async function obterSolicitacao({ env, params }) {
  const sc = await env.DB.prepare('SELECT * FROM supr_solicitacoes WHERE id = ?').bind(params.id).first();
  if (!sc) falha(404, 'nao_encontrada', 'Solicitação não encontrada.');
  const { results: itens } = await env.DB.prepare(
    'SELECT * FROM supr_solicitacao_itens WHERE solicitacaoId = ? ORDER BY seq'
  ).bind(sc.id).all();
  const atendimento = await atendimentoDosItens(env, itens.map((i) => i.id));
  const hist = await lerHistorico(env, 'solicitacao', sc.id);
  return json({
    solicitacao: {
      ...sc,
      situacao: situacao(sc, itens, atendimento),
      itens: itens.map((i) => {
        const at = atendimento.get(i.id);
        return { ...i, apropriacoes: lerJson(i.apropriacoes, []), ...at, saldo: saldoDoItem(i, at) };
      }),
      historico: hist
    }
  });
}

/* ---------- itens autorizados com saldo para cotar ou comprar ---------- */
export async function itensParaCompra({ env, url }) {
  const obra = url.searchParams.get('obra') || '';
  if (!obra) falha(400, 'obra_obrigatoria', 'Escolha a obra.');
  const { results: itens } = await env.DB.prepare(
    `SELECT i.*, s.numero AS solicitacaoNumero, s.data AS solicitacaoData, s.solicitanteNome
       FROM supr_solicitacao_itens i JOIN supr_solicitacoes s ON s.id = i.solicitacaoId
      WHERE i.orcamentoId = ?1 AND i.status = 'autorizado' AND i.encerrado = 0 AND s.status = 'autorizada'
      ORDER BY COALESCE(i.dataNecessidade, '9999'), s.numero, i.seq`
  ).bind(obra).all();
  const atendimento = await atendimentoDosItens(env, itens.map((i) => i.id));
  const resultado = [];
  for (const i of itens) {
    const at = atendimento.get(i.id);
    const saldo = saldoDoItem(i, at);
    if (saldo <= TOLERANCIA) continue;
    resultado.push({
      ...i, apropriacoes: lerJson(i.apropriacoes, []), comprado: at.comprado, emCotacao: at.emCotacao, cotacoes: at.cotacoes,
      saldo, saldoParaCotar: Math.max(0, arredQtd(saldo - at.emCotacao))
    });
  }
  return json({ itens: resultado });
}

/* ---------- criação e edição ---------- */
async function prepararItens(env, orcamentoId, corpoItens, ignorarSolicitacaoId) {
  const orcado = await orcadoDaObra(env, orcamentoId);
  const servicosValidos = exigirServicos(orcado);
  const mov = await movimentosDaObra(env, orcamentoId);
  if (ignorarSolicitacaoId) mov.scItens = mov.scItens.filter((i) => i.solicitacaoId !== ignorarSolicitacaoId);
  const consolidado = consolidar(mov);
  const orcadoPorChave = new Map(orcado.insumos.map((i) => [i.chave, i]));
  // quanto esta própria SC já pede de cada insumo em cada serviço (o mesmo insumo pode vir em 2 linhas)
  const nestaSc = new Map();

  const itens = listaObrigatoria(corpoItens, 'itens', { max: 300, rotulo: 'a solicitação' }).map((it, idx) => {
    const n = idx + 1;
    const chave = typeof it.insumoChave === 'string' ? it.insumoChave.trim() : '';
    if (!RE_CHAVE.test(chave)) falha(400, 'insumo_invalido', `Item ${n}: escolha o insumo pela lista do orçamento ou pela busca.`);
    const orc = orcadoPorChave.get(chave);
    const temQuantidades = Array.isArray(it.apropriacoes) && it.apropriacoes.some((a) => a && a.quantidade != null);
    const quantidade = temQuantidades
      ? arredQtd(it.apropriacoes.reduce((s, a) => s + (Number(a.quantidade) || 0), 0))
      : numero(it.quantidade, 'quantidade', { min: 0, rotulo: `a quantidade do item ${n}` });
    if (!(quantidade > 0)) falha(400, 'quantidade_invalida', `Item ${n}: informe uma quantidade maior que zero.`);
    const apropriacoes = normalizarApropriacoes(it.apropriacoes, servicosValidos, `o item ${n}`);
    const descricao = orc ? orc.descricao : texto(it.descricao, 'descricao', { max: 400, obrigatorio: true, rotulo: `a descrição do item ${n}` });
    const precoOrcado = orc && orc.quantidade > 0 ? arred(orc.valor / orc.quantidade, 6)
      : (numero(it.precoReferencia, 'precoReferencia', { min: 0, obrigatorio: false }) || 0);

    // saldo por serviço: orçado − solicitado (outras SCs) − o que esta SC já pediu acima
    let excede = false;
    const detalhes = [];
    for (const a of apropriacoes) {
      const qtdServico = quantidade * a.percentual / 100;
      const orcServico = orc && orc.servicos[a.servicoId] ? orc.servicos[a.servicoId][0] : 0;
      const movIns = consolidado.insumos.get(chave);
      const jaSolicitado = movIns && movIns.servicos.get(a.servicoId) ? movIns.servicos.get(a.servicoId).solicitado : 0;
      const k = chave + '|' + a.servicoId;
      const nesta = nestaSc.get(k) || 0;
      nestaSc.set(k, nesta + qtdServico);
      const saldo = orcServico - jaSolicitado - nesta;
      if (qtdServico > saldo + Math.max(TOLERANCIA, orcServico * 1e-6)) {
        excede = true;
        detalhes.push({ servicoId: a.servicoId, saldo: arredQtd(Math.max(0, saldo)), pedido: arredQtd(qtdServico) });
      }
    }
    return {
      id: uuid(), seq: n, insumoChave: chave,
      insumoCodigo: orc ? orc.codigo : texto(it.insumoCodigo, 'insumoCodigo', { max: 60 }),
      descricao,
      unidade: orc ? orc.unidade : texto(it.unidade, 'unidade', { max: 20, rotulo: `a unidade do item ${n}` }),
      tipo: orc ? orc.tipo : (['material', 'maoDeObra', 'equipamento', 'servico'].includes(it.tipo) ? it.tipo : 'material'),
      quantidade, precoOrcado,
      dataNecessidade: dataIso(it.dataNecessidade, 'dataNecessidade', { rotulo: `a data de necessidade do item ${n}` }),
      apropriacoes,
      foraOrcamento: orc ? 0 : 1,
      excedeOrcamento: excede ? 1 : 0,
      excesso: detalhes,
      observacao: texto(it.observacao, 'observacao', { max: 500, rotulo: `a observação do item ${n}` })
    };
  });
  return { itens, orcado };
}

function sqlInserirItens() {
  return `INSERT INTO supr_solicitacao_itens (id, solicitacaoId, orcamentoId, seq, insumoChave, insumoCodigo, descricao, unidade, tipo,
            quantidade, precoOrcado, dataNecessidade, apropriacoes, foraOrcamento, excedeOrcamento, observacao, status, encerrado)
          SELECT json_extract(value, '$.id'), ?1, ?2, json_extract(value, '$.seq'), json_extract(value, '$.insumoChave'),
                 json_extract(value, '$.insumoCodigo'), json_extract(value, '$.descricao'), json_extract(value, '$.unidade'),
                 json_extract(value, '$.tipo'), json_extract(value, '$.quantidade'), json_extract(value, '$.precoOrcado'),
                 json_extract(value, '$.dataNecessidade'), json_extract(value, '$.apropriacoes'), json_extract(value, '$.foraOrcamento'),
                 json_extract(value, '$.excedeOrcamento'), json_extract(value, '$.observacao'), ?3, 0
            FROM json_each(?4)`;
}

function paraGravar(itens) {
  return JSON.stringify(itens.map((i) => ({ ...i, apropriacoes: JSON.stringify(i.apropriacoes), excesso: undefined })));
}

async function decidirStatus(env, itens) {
  const p = await parametros(env);
  const acima = itens.filter((i) => i.excedeOrcamento || i.foraOrcamento);
  if (acima.length && ligado(p.bloquear_acima_orcado)) {
    falha(400, 'acima_do_orcado', `Bloqueado pelos parâmetros: ${acima.length} item(ns) acima do saldo orçado ou fora do orçamento (${acima.map((i) => i.seq).join(', ')}).`,
      { itens: acima.map((i) => ({ seq: i.seq, descricao: i.descricao, excesso: i.excesso, foraOrcamento: i.foraOrcamento })) });
  }
  const exige = ligado(p.solicitacao_exige_autorizacao) || acima.length > 0;
  return { status: exige ? 'pendente' : 'autorizada', motivoAutomatico: acima.length ? 'acima do saldo orçado ou fora do orçamento' : null };
}

export async function criarSolicitacao({ env, ctx, corpo }) {
  exigirEdicao(ctx);
  const orcamentoId = texto(corpo.orcamentoId, 'orcamentoId', { max: 100, obrigatorio: true, rotulo: 'a obra' });
  const { itens } = await prepararItens(env, orcamentoId, corpo.itens, null);
  const data = dataIso(corpo.data, 'data', { rotulo: 'a data' }) || hoje();
  const observacoes = texto(corpo.observacoes, 'observacoes', { max: 2000 });
  const { status } = await decidirStatus(env, itens);
  const valorEstimado = arred(itens.reduce((s, i) => s + i.quantidade * (i.precoOrcado || 0), 0));
  const excede = itens.some((i) => i.excedeOrcamento || i.foraOrcamento) ? 1 : 0;
  const numero = await proximoNumero(env, 'solicitacao');
  const id = uuid();
  const ts = agora();
  const comandos = [
    env.DB.prepare(
      `INSERT INTO supr_solicitacoes (id, numero, orcamentoId, data, solicitanteEmail, solicitanteNome, observacoes, status,
         excedeOrcamento, valorEstimado, autorizadoPor, autorizadoEm, criadoEm, atualizadoEm)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).bind(id, numero, orcamentoId, data, ctx.email, ctx.nome, observacoes, status, excede, valorEstimado,
      status === 'autorizada' ? 'automática' : null, status === 'autorizada' ? ts : null, ts, ts),
    env.DB.prepare(sqlInserirItens()).bind(id, orcamentoId, status === 'autorizada' ? 'autorizado' : 'pendente', paraGravar(itens)),
    historico(env, ctx, 'solicitacao', id, 'Criada', `${itens.length} item(ns)` + (excede ? ' · com item acima do orçado ou fora do orçamento' : ''))
  ];
  if (status === 'autorizada') comandos.push(historico(env, ctx, 'solicitacao', id, 'Autorizada automaticamente', 'Parâmetro: solicitação não exige autorização'));
  await env.DB.batch(comandos);
  return json({ ok: true, id, numero, status, excedeOrcamento: excede, itens: itens.map((i) => ({ seq: i.seq, excedeOrcamento: i.excedeOrcamento, foraOrcamento: i.foraOrcamento, excesso: i.excesso })) });
}

async function scEditavel(env, id) {
  const sc = await env.DB.prepare('SELECT * FROM supr_solicitacoes WHERE id = ?').bind(id).first();
  if (!sc) falha(404, 'nao_encontrada', 'Solicitação não encontrada.');
  return sc;
}

export async function atualizarSolicitacao({ env, ctx, params, corpo }) {
  exigirEdicao(ctx);
  const sc = await scEditavel(env, params.id);
  if (!['pendente', 'reprovada'].includes(sc.status)) {
    falha(409, 'nao_editavel', 'Só dá para alterar solicitação pendente de autorização ou reprovada.');
  }
  const { itens } = await prepararItens(env, sc.orcamentoId, corpo.itens, sc.id);
  const { status } = await decidirStatus(env, itens);
  const ts = agora();
  const valorEstimado = arred(itens.reduce((s, i) => s + i.quantidade * (i.precoOrcado || 0), 0));
  const excede = itens.some((i) => i.excedeOrcamento || i.foraOrcamento) ? 1 : 0;
  await env.DB.batch([
    env.DB.prepare('DELETE FROM supr_solicitacao_itens WHERE solicitacaoId = ?').bind(sc.id),
    env.DB.prepare(
      `UPDATE supr_solicitacoes SET data = ?, observacoes = ?, status = ?, excedeOrcamento = ?, valorEstimado = ?,
         autorizadoPor = ?, autorizadoEm = ?, motivoReprovacao = NULL, atualizadoEm = ? WHERE id = ?`
    ).bind(dataIso(corpo.data, 'data') || sc.data, texto(corpo.observacoes, 'observacoes', { max: 2000 }), status, excede, valorEstimado,
      status === 'autorizada' ? 'automática' : null, status === 'autorizada' ? ts : null, ts, sc.id),
    env.DB.prepare(sqlInserirItens()).bind(sc.id, sc.orcamentoId, status === 'autorizada' ? 'autorizado' : 'pendente', paraGravar(itens)),
    historico(env, ctx, 'solicitacao', sc.id, sc.status === 'reprovada' ? 'Alterada e reenviada para autorização' : 'Alterada', `${itens.length} item(ns)`)
  ]);
  return json({ ok: true, id: sc.id, status });
}

/* ---------- autorização ---------- */
// Itens marcados são autorizados; os demais itens pendentes são reprovados com o motivo
export async function autorizarSolicitacao({ env, ctx, params, corpo }) {
  const sc = await scEditavel(env, params.id);
  if (sc.status !== 'pendente') falha(409, 'nao_pendente', 'Esta solicitação não está aguardando autorização.');
  const { results: itens } = await env.DB.prepare(
    "SELECT id, seq, quantidade, precoOrcado FROM supr_solicitacao_itens WHERE solicitacaoId = ? AND status = 'pendente'"
  ).bind(sc.id).all();
  const marcados = new Set(Array.isArray(corpo.autorizar) ? corpo.autorizar : itens.map((i) => i.id));
  const autorizar = itens.filter((i) => marcados.has(i.id));
  const reprovar = itens.filter((i) => !marcados.has(i.id));
  if (!autorizar.length) falha(400, 'nenhum_item', 'Marque ao menos um item para autorizar, ou use Reprovar.');
  const motivo = texto(corpo.motivo, 'motivo', { max: 500 });
  if (reprovar.length && !motivo) falha(400, 'motivo_obrigatorio', 'Informe o motivo dos itens não autorizados.');
  const valor = arred(autorizar.reduce((s, i) => s + i.quantidade * (i.precoOrcado || 0), 0));
  await exigirAlcada(env, ctx, 'solicitacao', valor);
  const ts = agora();
  await env.DB.batch([
    env.DB.prepare(`UPDATE supr_solicitacao_itens SET status = 'autorizado' WHERE id IN (SELECT value FROM json_each(?1))`)
      .bind(lista(autorizar.map((i) => i.id))),
    env.DB.prepare(`UPDATE supr_solicitacao_itens SET status = 'reprovado' WHERE id IN (SELECT value FROM json_each(?1))`)
      .bind(lista(reprovar.map((i) => i.id))),
    env.DB.prepare(
      "UPDATE supr_solicitacoes SET status = 'autorizada', autorizadoPor = ?, autorizadoEm = ?, motivoReprovacao = ?, atualizadoEm = ? WHERE id = ?"
    ).bind(ctx.nome, ts, reprovar.length ? motivo : null, ts, sc.id),
    historico(env, ctx, 'solicitacao', sc.id, 'Autorizada',
      reprovar.length ? `${autorizar.length} item(ns) autorizados; reprovados: ${reprovar.map((i) => i.seq).join(', ')} — ${motivo}` : `${autorizar.length} item(ns)`)
  ]);
  return json({ ok: true });
}

export async function reprovarSolicitacao({ env, ctx, params, corpo }) {
  const sc = await scEditavel(env, params.id);
  if (sc.status !== 'pendente') falha(409, 'nao_pendente', 'Esta solicitação não está aguardando autorização.');
  const motivo = texto(corpo.motivo, 'motivo', { max: 500, obrigatorio: true, rotulo: 'o motivo da reprovação' });
  await exigirAlcada(env, ctx, 'solicitacao', 0);
  const ts = agora();
  await env.DB.batch([
    env.DB.prepare("UPDATE supr_solicitacao_itens SET status = 'reprovado' WHERE solicitacaoId = ? AND status = 'pendente'").bind(sc.id),
    env.DB.prepare("UPDATE supr_solicitacoes SET status = 'reprovada', motivoReprovacao = ?, autorizadoPor = ?, autorizadoEm = ?, atualizadoEm = ? WHERE id = ?")
      .bind(motivo, ctx.nome, ts, ts, sc.id),
    historico(env, ctx, 'solicitacao', sc.id, 'Reprovada', motivo)
  ]);
  return json({ ok: true });
}

/* ---------- cancelamento e encerramento de saldo ---------- */
export async function cancelarSolicitacao({ env, ctx, params, corpo }) {
  exigirEdicao(ctx);
  const sc = await scEditavel(env, params.id);
  if (['cancelada', 'reprovada'].includes(sc.status)) falha(409, 'ja_encerrada', 'A solicitação já está encerrada.');
  const motivo = texto(corpo.motivo, 'motivo', { max: 500, obrigatorio: true, rotulo: 'o motivo do cancelamento' });
  const { results: itens } = await env.DB.prepare(
    "SELECT id, seq, status FROM supr_solicitacao_itens WHERE solicitacaoId = ? AND status IN ('pendente', 'autorizado')"
  ).bind(sc.id).all();
  const pedidos = Array.isArray(corpo.itens) && corpo.itens.length ? new Set(corpo.itens) : null;
  const alvo = pedidos ? itens.filter((i) => pedidos.has(i.id)) : itens;
  if (!alvo.length) falha(400, 'nenhum_item', 'Nenhum item para cancelar.');
  const atendimento = await atendimentoDosItens(env, alvo.map((i) => i.id));
  for (const i of alvo) {
    const at = atendimento.get(i.id);
    if (at.emCotacao > TOLERANCIA) falha(409, 'em_cotacao', `O item ${i.seq} está na cotação nº ${at.cotacoes[0].numero}: tire o item da cotação (ou cancele a cotação) antes.`);
    if (at.comprado > TOLERANCIA) falha(409, 'ja_comprado', `O item ${i.seq} já tem pedido de compra: use "Encerrar saldo" em vez de cancelar.`);
  }
  const restantes = itens.length - alvo.length;
  const ts = agora();
  await env.DB.batch([
    env.DB.prepare(`UPDATE supr_solicitacao_itens SET status = 'cancelado' WHERE id IN (SELECT value FROM json_each(?1))`)
      .bind(lista(alvo.map((i) => i.id))),
    env.DB.prepare('UPDATE supr_solicitacoes SET status = ?, atualizadoEm = ? WHERE id = ?')
      .bind(restantes ? sc.status : 'cancelada', ts, sc.id),
    historico(env, ctx, 'solicitacao', sc.id, restantes ? 'Itens cancelados' : 'Cancelada',
      (restantes ? `Itens ${alvo.map((i) => i.seq).join(', ')} — ` : '') + motivo)
  ]);
  return json({ ok: true });
}

export async function encerrarItemSolicitacao({ env, ctx, params, corpo }) {
  exigirEdicao(ctx);
  const item = await env.DB.prepare('SELECT * FROM supr_solicitacao_itens WHERE id = ? AND solicitacaoId = ?')
    .bind(params.itemId, params.id).first();
  if (!item) falha(404, 'nao_encontrado', 'Item não encontrado.');
  if (item.status !== 'autorizado' || item.encerrado) falha(409, 'nao_encerravel', 'Só dá para encerrar o saldo de item autorizado e em aberto.');
  const at = (await atendimentoDosItens(env, [item.id])).get(item.id);
  if (at.emCotacao > TOLERANCIA) falha(409, 'em_cotacao', `O item está na cotação nº ${at.cotacoes[0].numero}: finalize ou cancele a cotação antes.`);
  const motivo = texto(corpo.motivo, 'motivo', { max: 500 });
  await env.DB.batch([
    env.DB.prepare('UPDATE supr_solicitacao_itens SET encerrado = 1 WHERE id = ?').bind(item.id),
    env.DB.prepare('UPDATE supr_solicitacoes SET atualizadoEm = ? WHERE id = ?').bind(agora(), params.id),
    historico(env, ctx, 'solicitacao', params.id, 'Saldo do item encerrado',
      `Item ${item.seq}: comprado ${arredQtd(at.comprado)} de ${item.quantidade} ${item.unidade || ''}` + (motivo ? ' — ' + motivo : ''))
  ]);
  return json({ ok: true });
}
