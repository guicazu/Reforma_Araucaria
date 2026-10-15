// Cotação de preços: itens autorizados de solicitações da obra, cotados com vários fornecedores.
// O mapa de cotação guarda os preços por rodada de negociação (cada rodada nova parte dos preços
// da anterior), as condições de cada fornecedor (pagamento, prazo, frete, validade) e os vencedores
// de cada item (um item pode ser dividido entre fornecedores). O fornecedor pode responder pelo
// portal (link com token). "Gerar pedidos" cria um pedido de compra por fornecedor vencedor.
import {
  json, falha, uuid, agora, hoje, texto, numero, dataIso, escolha, listaObrigatoria, lista, lerJson, arred, arredQtd,
  somarDias, token, exigirEdicao, historico, lerHistorico, proximoNumero, parametros, ligado, fornecedorAtivo, parcelasDoTexto
} from './base.js';
import { atendimentoDosItens } from './solicitacoes.js';
import { condicaoPorId } from './cadastros.js';
import { enviarEmail } from '../email.js';

const TOLERANCIA = 1e-6;

async function cotacaoOuErro(env, id) {
  const c = await env.DB.prepare('SELECT * FROM supr_cotacoes WHERE id = ?').bind(id).first();
  if (!c) falha(404, 'nao_encontrada', 'Cotação não encontrada.');
  return c;
}
function exigirAberta(c) {
  if (c.status !== 'aberta') falha(409, 'cotacao_fechada', `A cotação nº ${c.numero} está ${c.status}.`);
}

/* ---------- lista e mapa ---------- */
export async function listarCotacoes({ env, url }) {
  const obra = url.searchParams.get('obra') || '';
  const { results } = await env.DB.prepare(
    `SELECT c.*,
            (SELECT COUNT(*) FROM supr_cotacao_itens i WHERE i.cotacaoId = c.id) AS itens,
            (SELECT COUNT(*) FROM supr_cotacao_fornecedores f WHERE f.cotacaoId = c.id) AS fornecedores,
            (SELECT COUNT(*) FROM supr_cotacao_fornecedores f WHERE f.cotacaoId = c.id AND f.respondidoEm IS NOT NULL) AS respostas,
            (SELECT COUNT(*) FROM supr_pedidos p WHERE p.cotacaoId = c.id AND p.status NOT IN ('cancelado', 'reprovado')) AS pedidos,
            (SELECT GROUP_CONCAT(i.descricao, '; ') FROM (SELECT si.descricao FROM supr_cotacao_itens ci
               JOIN supr_solicitacao_itens si ON si.id = ci.solicitacaoItemId WHERE ci.cotacaoId = c.id ORDER BY ci.seq LIMIT 3) i) AS resumo
       FROM supr_cotacoes c WHERE (?1 = '' OR c.orcamentoId = ?1) ORDER BY c.numero DESC LIMIT 500`
  ).bind(obra).all();
  return json({ cotacoes: results });
}

export async function dadosDoMapa(env, cotacao) {
  const [itens, fornecedores, precos, selecao, pedidos] = await env.DB.batch([
    env.DB.prepare(
      `SELECT ci.id, ci.seq, ci.quantidade, ci.solicitacaoItemId, si.quantidade AS quantidadeSolicitada, si.insumoChave, si.insumoCodigo,
              si.descricao, si.unidade, si.tipo,
              si.precoOrcado, si.dataNecessidade, si.apropriacoes, si.observacao, s.numero AS solicitacaoNumero, s.id AS solicitacaoId
         FROM supr_cotacao_itens ci
         JOIN supr_solicitacao_itens si ON si.id = ci.solicitacaoItemId
         JOIN supr_solicitacoes s ON s.id = si.solicitacaoId
        WHERE ci.cotacaoId = ? ORDER BY ci.seq`
    ).bind(cotacao.id),
    env.DB.prepare(
      `SELECT cf.*, f.nome, f.nomeFantasia, f.documento, f.email, f.telefone, f.contato
         FROM supr_cotacao_fornecedores cf JOIN supr_fornecedores f ON f.id = cf.fornecedorId
        WHERE cf.cotacaoId = ? ORDER BY f.nome COLLATE NOCASE`
    ).bind(cotacao.id),
    env.DB.prepare('SELECT cotacaoItemId, fornecedorId, rodada, precoUnitario, marca, observacao FROM supr_cotacao_precos WHERE cotacaoId = ?').bind(cotacao.id),
    env.DB.prepare('SELECT cotacaoItemId, fornecedorId, quantidade FROM supr_cotacao_selecao WHERE cotacaoId = ?').bind(cotacao.id),
    env.DB.prepare(
      `SELECT p.id, p.numero, p.status, p.valorTotal, p.fornecedorId, f.nome AS fornecedorNome
         FROM supr_pedidos p JOIN supr_fornecedores f ON f.id = p.fornecedorId WHERE p.cotacaoId = ? ORDER BY p.numero`
    ).bind(cotacao.id)
  ]);
  return {
    itens: itens.results.map((i) => ({ ...i, apropriacoes: lerJson(i.apropriacoes, []) })),
    fornecedores: fornecedores.results,
    precos: precos.results,
    selecao: selecao.results,
    pedidos: pedidos.results
  };
}

export async function obterCotacao({ env, params }) {
  const c = await cotacaoOuErro(env, params.id);
  const dados = await dadosDoMapa(env, c);
  return json({ cotacao: { ...c, ...dados, historico: await lerHistorico(env, 'cotacao', c.id) } });
}

/* ---------- criação ---------- */
// Confere se cada item de SC ainda tem saldo para cotar (descontando outras cotações abertas)
async function validarItensDeSc(env, orcamentoId, entrada, cotacaoAtualId) {
  const pedidos = listaObrigatoria(entrada, 'itens', { max: 300, rotulo: 'a cotação' });
  const ids = pedidos.map((i) => i && i.solicitacaoItemId).filter(Boolean);
  const { results: scItens } = await env.DB.prepare(
    `SELECT i.*, s.status AS scStatus, s.numero AS scNumero FROM supr_solicitacao_itens i JOIN supr_solicitacoes s ON s.id = i.solicitacaoId
      WHERE i.id IN (SELECT value FROM json_each(?1))`
  ).bind(lista(ids)).all();
  const porId = new Map(scItens.map((i) => [i.id, i]));
  const atendimento = await atendimentoDosItens(env, ids);
  const vistos = new Set();
  return pedidos.map((p, idx) => {
    const sc = porId.get(p.solicitacaoItemId);
    if (!sc || sc.orcamentoId !== orcamentoId) falha(400, 'item_invalido', `Item ${idx + 1}: item de solicitação inválido para esta obra.`);
    if (vistos.has(sc.id)) falha(400, 'item_repetido', `O item "${sc.descricao}" foi incluído duas vezes.`);
    vistos.add(sc.id);
    if (sc.status !== 'autorizado' || sc.scStatus !== 'autorizada' || sc.encerrado) {
      falha(409, 'item_nao_autorizado', `O item "${sc.descricao}" (SC ${sc.scNumero}) não está autorizado ou já foi encerrado.`);
    }
    const at = atendimento.get(sc.id);
    const outras = at.cotacoes.filter((c) => c.id !== cotacaoAtualId);
    const emOutras = outras.reduce((s, c) => s + c.quantidade, 0);
    const saldo = arredQtd(sc.quantidade - at.comprado - emOutras);
    if (saldo <= TOLERANCIA) {
      falha(409, 'sem_saldo', `"${sc.descricao}" (SC nº ${sc.scNumero}) não tem saldo para cotar` +
        (outras.length ? `: está na cotação nº ${outras.map((c) => c.numero).join(', ')}.` : ': já foi comprado.'));
    }
    const quantidade = p.quantidade == null || p.quantidade === '' ? saldo
      : numero(p.quantidade, 'quantidade', { min: 0, rotulo: `a quantidade de "${sc.descricao}"` });
    if (!(quantidade > 0)) falha(400, 'quantidade_invalida', `Informe a quantidade de "${sc.descricao}".`);
    if (quantidade > saldo + TOLERANCIA) {
      falha(409, 'acima_do_saldo', `"${sc.descricao}" (SC ${sc.scNumero}): saldo para cotar é ${saldo} ${sc.unidade || ''}.`);
    }
    return { solicitacaoItemId: sc.id, quantidade: arredQtd(quantidade) };
  });
}

export async function criarCotacao({ env, ctx, corpo }) {
  exigirEdicao(ctx);
  const orcamentoId = texto(corpo.orcamentoId, 'orcamentoId', { max: 100, obrigatorio: true, rotulo: 'a obra' });
  const itens = await validarItensDeSc(env, orcamentoId, corpo.itens, null);
  const fornecedorIds = Array.from(new Set(listaObrigatoria(corpo.fornecedores, 'fornecedores', { max: 30, rotulo: 'os fornecedores' })));
  for (const fid of fornecedorIds) await fornecedorAtivo(env, fid);
  const id = uuid();
  const numero = await proximoNumero(env, 'cotacao');
  const ts = agora();
  const data = hoje();
  await env.DB.batch([
    env.DB.prepare(
      `INSERT INTO supr_cotacoes (id, numero, orcamentoId, data, prazoResposta, compradorEmail, compradorNome, observacoes, status, rodada, criadoEm, atualizadoEm)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'aberta', 1, ?, ?)`
    ).bind(id, numero, orcamentoId, data, dataIso(corpo.prazoResposta, 'prazoResposta', { rotulo: 'o prazo de resposta' }),
      ctx.email, ctx.nome, texto(corpo.observacoes, 'observacoes', { max: 2000 }), ts, ts),
    env.DB.prepare(
      `INSERT INTO supr_cotacao_itens (id, cotacaoId, solicitacaoItemId, seq, quantidade)
       SELECT json_extract(value, '$.id'), ?1, json_extract(value, '$.solicitacaoItemId'), json_extract(value, '$.seq'), json_extract(value, '$.quantidade')
         FROM json_each(?2)`
    ).bind(id, JSON.stringify(itens.map((i, idx) => ({ ...i, id: uuid(), seq: idx + 1 })))),
    env.DB.prepare(
      `INSERT INTO supr_cotacao_fornecedores (id, cotacaoId, fornecedorId, token)
       SELECT json_extract(value, '$.id'), ?1, json_extract(value, '$.fornecedorId'), json_extract(value, '$.token') FROM json_each(?2)`
    ).bind(id, JSON.stringify(fornecedorIds.map((f) => ({ id: uuid(), fornecedorId: f, token: token() })))),
    historico(env, ctx, 'cotacao', id, 'Criada', `${itens.length} item(ns), ${fornecedorIds.length} fornecedor(es)`)
  ]);
  return json({ ok: true, id, numero });
}

/* ---------- edição do mapa ---------- */
export async function adicionarItensCotacao({ env, ctx, params, corpo }) {
  exigirEdicao(ctx);
  const c = await cotacaoOuErro(env, params.id);
  exigirAberta(c);
  const atuais = await env.DB.prepare('SELECT solicitacaoItemId, seq FROM supr_cotacao_itens WHERE cotacaoId = ?').bind(c.id).all();
  const ja = new Set(atuais.results.map((i) => i.solicitacaoItemId));
  const novos = (corpo.itens || []).filter((i) => i && !ja.has(i.solicitacaoItemId));
  const itens = await validarItensDeSc(env, c.orcamentoId, novos, c.id);
  let seq = atuais.results.reduce((m, i) => Math.max(m, i.seq), 0);
  await env.DB.batch([
    env.DB.prepare(
      `INSERT INTO supr_cotacao_itens (id, cotacaoId, solicitacaoItemId, seq, quantidade)
       SELECT json_extract(value, '$.id'), ?1, json_extract(value, '$.solicitacaoItemId'), json_extract(value, '$.seq'), json_extract(value, '$.quantidade')
         FROM json_each(?2)`
    ).bind(c.id, JSON.stringify(itens.map((i) => ({ ...i, id: uuid(), seq: ++seq })))),
    env.DB.prepare('UPDATE supr_cotacoes SET atualizadoEm = ? WHERE id = ?').bind(agora(), c.id),
    historico(env, ctx, 'cotacao', c.id, 'Itens incluídos', `${itens.length} item(ns)`)
  ]);
  return json({ ok: true });
}

export async function removerItemCotacao({ env, ctx, params }) {
  exigirEdicao(ctx);
  const c = await cotacaoOuErro(env, params.id);
  exigirAberta(c);
  const item = await env.DB.prepare(
    `SELECT ci.id, si.descricao FROM supr_cotacao_itens ci JOIN supr_solicitacao_itens si ON si.id = ci.solicitacaoItemId
      WHERE ci.id = ? AND ci.cotacaoId = ?`
  ).bind(params.itemId, c.id).first();
  if (!item) falha(404, 'nao_encontrado', 'Item da cotação não encontrado.');
  await env.DB.batch([
    env.DB.prepare('DELETE FROM supr_cotacao_precos WHERE cotacaoItemId = ?').bind(item.id),
    env.DB.prepare('DELETE FROM supr_cotacao_selecao WHERE cotacaoItemId = ?').bind(item.id),
    env.DB.prepare('DELETE FROM supr_cotacao_itens WHERE id = ?').bind(item.id),
    historico(env, ctx, 'cotacao', c.id, 'Item retirado', item.descricao)
  ]);
  return json({ ok: true });
}

export async function adicionarFornecedorCotacao({ env, ctx, params, corpo }) {
  exigirEdicao(ctx);
  const c = await cotacaoOuErro(env, params.id);
  exigirAberta(c);
  const f = await fornecedorAtivo(env, corpo.fornecedorId);
  const existe = await env.DB.prepare('SELECT id FROM supr_cotacao_fornecedores WHERE cotacaoId = ? AND fornecedorId = ?').bind(c.id, f.id).first();
  if (existe) falha(409, 'fornecedor_repetido', `${f.nome} já está nesta cotação.`);
  await env.DB.batch([
    env.DB.prepare('INSERT INTO supr_cotacao_fornecedores (id, cotacaoId, fornecedorId, token) VALUES (?, ?, ?, ?)').bind(uuid(), c.id, f.id, token()),
    historico(env, ctx, 'cotacao', c.id, 'Fornecedor incluído', f.nome)
  ]);
  return json({ ok: true });
}

export async function removerFornecedorCotacao({ env, ctx, params }) {
  exigirEdicao(ctx);
  const c = await cotacaoOuErro(env, params.id);
  exigirAberta(c);
  const f = await env.DB.prepare(
    `SELECT f.nome FROM supr_cotacao_fornecedores cf JOIN supr_fornecedores f ON f.id = cf.fornecedorId
      WHERE cf.cotacaoId = ? AND cf.fornecedorId = ?`
  ).bind(c.id, params.fornecedorId).first();
  if (!f) falha(404, 'nao_encontrado', 'Fornecedor não está na cotação.');
  await env.DB.batch([
    env.DB.prepare('DELETE FROM supr_cotacao_precos WHERE cotacaoId = ? AND fornecedorId = ?').bind(c.id, params.fornecedorId),
    env.DB.prepare('DELETE FROM supr_cotacao_selecao WHERE cotacaoId = ? AND fornecedorId = ?').bind(c.id, params.fornecedorId),
    env.DB.prepare('DELETE FROM supr_cotacao_fornecedores WHERE cotacaoId = ? AND fornecedorId = ?').bind(c.id, params.fornecedorId),
    historico(env, ctx, 'cotacao', c.id, 'Fornecedor retirado', f.nome)
  ]);
  return json({ ok: true });
}

// Condições comerciais de um fornecedor (do comprador ou do portal)
export async function condicoesFornecedor(env, corpo) {
  let condicaoPagamentoId = texto(corpo.condicaoPagamentoId, 'condicaoPagamentoId', { max: 100 });
  let condicaoPagamento = texto(corpo.condicaoPagamento, 'condicaoPagamento', { max: 200, rotulo: 'a condição de pagamento' });
  if (condicaoPagamentoId) {
    const cond = await condicaoPorId(env, condicaoPagamentoId);
    if (!cond) condicaoPagamentoId = null;
    else condicaoPagamento = cond.descricao;
  }
  return {
    condicaoPagamentoId, condicaoPagamento,
    prazoEntregaDias: numero(corpo.prazoEntregaDias, 'prazoEntregaDias', { min: 0, max: 730, inteiro: true, obrigatorio: false, rotulo: 'o prazo de entrega' }),
    frete: escolha(corpo.frete, ['CIF', 'FOB'], 'frete', null),
    valorFrete: numero(corpo.valorFrete, 'valorFrete', { min: 0, obrigatorio: false, rotulo: 'o valor do frete' }) || 0,
    validade: dataIso(corpo.validade, 'validade', { rotulo: 'a validade da proposta' }),
    observacoes: texto(corpo.observacoes, 'observacoes', { max: 1000 })
  };
}

// Grava preços (rodada atual), condições e vencedores do mapa
export async function salvarMapa({ env, ctx, params, corpo }) {
  exigirEdicao(ctx);
  const c = await cotacaoOuErro(env, params.id);
  exigirAberta(c);
  const dados = await dadosDoMapa(env, c);
  const itens = new Map(dados.itens.map((i) => [i.id, i]));
  const fornecedores = new Set(dados.fornecedores.map((f) => f.fornecedorId));
  const ts = agora();
  const comandos = [];

  for (const f of corpo.fornecedores || []) {
    if (!fornecedores.has(f.fornecedorId)) continue;
    const cond = await condicoesFornecedor(env, f);
    comandos.push(env.DB.prepare(
      `UPDATE supr_cotacao_fornecedores SET condicaoPagamentoId = ?, condicaoPagamento = ?, prazoEntregaDias = ?, frete = ?, valorFrete = ?,
         validade = ?, observacoes = ? WHERE cotacaoId = ? AND fornecedorId = ?`
    ).bind(cond.condicaoPagamentoId, cond.condicaoPagamento, cond.prazoEntregaDias, cond.frete, cond.valorFrete, cond.validade,
      cond.observacoes, c.id, f.fornecedorId));
  }

  const precos = [];
  for (const p of corpo.precos || []) {
    if (!itens.has(p.cotacaoItemId) || !fornecedores.has(p.fornecedorId)) continue;
    const preco = numero(p.precoUnitario, 'precoUnitario', { min: 0, obrigatorio: false, rotulo: 'o preço' });
    precos.push({ id: uuid(), cotacaoItemId: p.cotacaoItemId, fornecedorId: p.fornecedorId, precoUnitario: preco,
      marca: texto(p.marca, 'marca', { max: 120 }), observacao: texto(p.observacao, 'observacao', { max: 300 }) });
  }
  if (precos.length) {
    comandos.push(env.DB.prepare(
      `INSERT INTO supr_cotacao_precos (id, cotacaoId, cotacaoItemId, fornecedorId, rodada, precoUnitario, marca, observacao, atualizadoEm)
       SELECT json_extract(value, '$.id'), ?1, json_extract(value, '$.cotacaoItemId'), json_extract(value, '$.fornecedorId'), ?2,
              json_extract(value, '$.precoUnitario'), json_extract(value, '$.marca'), json_extract(value, '$.observacao'), ?3
         FROM json_each(?4) WHERE true
       ON CONFLICT(cotacaoItemId, fornecedorId, rodada) DO UPDATE SET precoUnitario = excluded.precoUnitario,
         marca = excluded.marca, observacao = excluded.observacao, atualizadoEm = excluded.atualizadoEm`
    ).bind(c.id, c.rodada, ts, JSON.stringify(precos)));
  }

  if (Array.isArray(corpo.selecao)) {
    const porItem = new Map();
    const selecao = [];
    for (const s of corpo.selecao) {
      const item = itens.get(s.cotacaoItemId);
      if (!item || !fornecedores.has(s.fornecedorId)) continue;
      const q = numero(s.quantidade, 'quantidade', { min: 0, rotulo: `a quantidade escolhida de "${item.descricao}"` });
      if (!(q > 0)) continue;
      const total = (porItem.get(item.id) || 0) + q;
      if (total > item.quantidade + TOLERANCIA) falha(400, 'acima_da_cotacao', `"${item.descricao}": a soma dos vencedores (${arredQtd(total)}) passa da quantidade cotada (${item.quantidade}).`);
      porItem.set(item.id, total);
      selecao.push({ cotacaoItemId: item.id, fornecedorId: s.fornecedorId, quantidade: arredQtd(q) });
    }
    comandos.push(env.DB.prepare('DELETE FROM supr_cotacao_selecao WHERE cotacaoId = ?').bind(c.id));
    if (selecao.length) {
      comandos.push(env.DB.prepare(
        `INSERT INTO supr_cotacao_selecao (cotacaoItemId, fornecedorId, cotacaoId, quantidade)
         SELECT json_extract(value, '$.cotacaoItemId'), json_extract(value, '$.fornecedorId'), ?1, json_extract(value, '$.quantidade') FROM json_each(?2)`
      ).bind(c.id, JSON.stringify(selecao)));
    }
  }
  comandos.push(env.DB.prepare('UPDATE supr_cotacoes SET atualizadoEm = ?, prazoResposta = COALESCE(?, prazoResposta) WHERE id = ?')
    .bind(ts, dataIso(corpo.prazoResposta, 'prazoResposta'), c.id));
  await env.DB.batch(comandos);
  return json({ ok: true });
}

// Nova rodada de negociação: copia os preços da rodada atual para a próxima
export async function novaRodada({ env, ctx, params }) {
  exigirEdicao(ctx);
  const c = await cotacaoOuErro(env, params.id);
  exigirAberta(c);
  const proxima = c.rodada + 1;
  await env.DB.batch([
    env.DB.prepare(
      `INSERT INTO supr_cotacao_precos (id, cotacaoId, cotacaoItemId, fornecedorId, rodada, precoUnitario, marca, observacao, atualizadoEm)
       SELECT lower(hex(randomblob(16))), cotacaoId, cotacaoItemId, fornecedorId, ?2, precoUnitario, marca, observacao, ?3
         FROM supr_cotacao_precos WHERE cotacaoId = ?1 AND rodada = ?4
       ON CONFLICT(cotacaoItemId, fornecedorId, rodada) DO NOTHING`
    ).bind(c.id, proxima, agora(), c.rodada),
    env.DB.prepare('UPDATE supr_cotacao_fornecedores SET respondidoEm = NULL, declinou = 0 WHERE cotacaoId = ?').bind(c.id),
    env.DB.prepare('UPDATE supr_cotacoes SET rodada = ?, atualizadoEm = ? WHERE id = ?').bind(proxima, agora(), c.id),
    historico(env, ctx, 'cotacao', c.id, 'Nova rodada de negociação', `${proxima}ª rodada`)
  ]);
  return json({ ok: true, rodada: proxima });
}

/* ---------- convite por e-mail ---------- */
function linkPortal(origem, tk) { return `${origem}/portal-fornecedor?t=${encodeURIComponent(tk)}`; }

export async function enviarConvites({ env, ctx, params, corpo, url }) {
  exigirEdicao(ctx);
  const c = await cotacaoOuErro(env, params.id);
  exigirAberta(c);
  const dados = await dadosDoMapa(env, c);
  const p = await parametros(env);
  const alvo = Array.isArray(corpo.fornecedores) && corpo.fornecedores.length ? new Set(corpo.fornecedores) : null;
  const resultado = [];
  const comandos = [];
  for (const f of dados.fornecedores) {
    if (alvo && !alvo.has(f.fornecedorId)) continue;
    const link = linkPortal(url.origin, f.token);
    if (!f.email) { resultado.push({ fornecedorId: f.fornecedorId, nome: f.nome, link, enviado: false, erro: 'Fornecedor sem e-mail' }); continue; }
    const linhas = dados.itens.map((i) => `<tr><td style="padding:4px 8px;border-bottom:1px solid #eee">${esc(i.descricao)}</td>` +
      `<td style="padding:4px 8px;border-bottom:1px solid #eee;text-align:right">${fmt(i.quantidade)} ${esc(i.unidade || '')}</td></tr>`).join('');
    const html = `<div style="font-family:Arial,sans-serif;max-width:620px;margin:auto;color:#27272a">
      <h2 style="font-size:18px">Solicitação de cotação nº ${c.numero}</h2>
      <p>Olá, <b>${esc(f.nome)}</b>. A ${esc(p.empresa_nome)} pede sua proposta para os itens abaixo${c.prazoResposta ? ` até <b>${dataBr(c.prazoResposta)}</b>` : ''}.</p>
      <table style="border-collapse:collapse;width:100%;font-size:13px">${linhas}</table>
      <p style="margin:22px 0"><a href="${link}" style="background:#18181b;color:#fff;padding:11px 18px;border-radius:6px;text-decoration:none;font-weight:bold">Responder cotação</a></p>
      <p style="color:#71717a;font-size:12px">Pelo link você informa preço, marca, prazo de entrega, frete e condição de pagamento. ${c.observacoes ? 'Observações: ' + esc(c.observacoes) : ''}</p></div>`;
    try {
      await enviarEmail({ env, destinatario: f.email, assunto: `Cotação nº ${c.numero} — ${p.empresa_nome}`, html });
      comandos.push(env.DB.prepare('UPDATE supr_cotacao_fornecedores SET conviteEnviadoEm = ? WHERE id = ?').bind(agora(), f.id));
      resultado.push({ fornecedorId: f.fornecedorId, nome: f.nome, link, enviado: true });
    } catch (e) {
      resultado.push({ fornecedorId: f.fornecedorId, nome: f.nome, link, enviado: false, erro: e.message });
    }
  }
  const enviados = resultado.filter((r) => r.enviado).length;
  if (enviados) comandos.push(historico(env, ctx, 'cotacao', c.id, 'Convites enviados', resultado.filter((r) => r.enviado).map((r) => r.nome).join(', ')));
  if (comandos.length) await env.DB.batch(comandos);
  return json({ ok: true, resultado });
}

function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch])); }
function fmt(n) { return Number(n || 0).toLocaleString('pt-BR', { maximumFractionDigits: 4 }); }
function dataBr(d) { return d ? d.split('-').reverse().join('/') : ''; }

/* ---------- gerar pedidos ---------- */
export async function gerarPedidos({ env, ctx, params, corpo }) {
  exigirEdicao(ctx);
  const c = await cotacaoOuErro(env, params.id);
  exigirAberta(c);
  const dados = await dadosDoMapa(env, c);
  if (!dados.selecao.length) falha(400, 'sem_vencedores', 'Escolha os vencedores no mapa antes de gerar os pedidos.');
  const itens = new Map(dados.itens.map((i) => [i.id, i]));
  const fornecedores = new Map(dados.fornecedores.map((f) => [f.fornecedorId, f]));
  const precoAtual = new Map(dados.precos.filter((p) => p.rodada === c.rodada).map((p) => [p.cotacaoItemId + '|' + p.fornecedorId, p]));
  const atendimento = await atendimentoDosItens(env, dados.itens.map((i) => i.solicitacaoItemId));

  const porFornecedor = new Map();
  const porScItem = new Map();
  for (const s of dados.selecao) {
    const item = itens.get(s.cotacaoItemId);
    const preco = precoAtual.get(s.cotacaoItemId + '|' + s.fornecedorId);
    const f = fornecedores.get(s.fornecedorId);
    if (!item || !f) continue;
    if (!preco || !(preco.precoUnitario > 0)) falha(400, 'sem_preco', `"${item.descricao}": ${f.nome} está como vencedor mas não tem preço na rodada atual.`);
    const total = (porScItem.get(item.solicitacaoItemId) || 0) + s.quantidade;
    porScItem.set(item.solicitacaoItemId, total);
    const at = atendimento.get(item.solicitacaoItemId);
    if (total > item.quantidade + TOLERANCIA) falha(409, 'acima_da_cotacao', `"${item.descricao}": a quantidade escolhida passa do que foi cotado.`);
    if (at.comprado + total > item.quantidadeSolicitada + TOLERANCIA) {
      falha(409, 'acima_do_saldo', `"${item.descricao}": a SC nº ${item.solicitacaoNumero} já tem ${arredQtd(at.comprado)} ${item.unidade || ''} comprado(s); o saldo é ${arredQtd(item.quantidadeSolicitada - at.comprado)}.`);
    }
    if (!porFornecedor.has(s.fornecedorId)) porFornecedor.set(s.fornecedorId, []);
    porFornecedor.get(s.fornecedorId).push({ item, quantidade: s.quantidade, preco });
  }
  // confere se o item da SC ainda está autorizado e em aberto
  const { results: scVivos } = await env.DB.prepare(
    `SELECT id, descricao FROM supr_solicitacao_itens WHERE id IN (SELECT value FROM json_each(?1)) AND (status <> 'autorizado' OR encerrado = 1)`
  ).bind(lista(Array.from(porScItem.keys()))).all();
  if (scVivos.length) falha(409, 'item_encerrado', `O item "${scVivos[0].descricao}" foi cancelado ou encerrado na solicitação.`);

  const p = await parametros(env);
  const statusPedido = ligado(p.pedido_exige_autorizacao) ? 'pendente' : 'autorizado';
  const ts = agora();
  const data = hoje();
  const dataEntregaPadrao = dataIso(corpo.dataEntrega, 'dataEntrega', { rotulo: 'a data de entrega' });
  const localEntrega = texto(corpo.localEntrega, 'localEntrega', { max: 300 }) || p.local_entrega_padrao || null;
  const observacoes = texto(corpo.observacoes, 'observacoes', { max: 2000 });

  const comandos = [];
  const criados = [];
  const linhas = [];
  for (const [fornecedorId, escolhas] of porFornecedor) {
    const f = fornecedores.get(fornecedorId);
    const cond = f.condicaoPagamentoId ? await condicaoPorId(env, f.condicaoPagamentoId) : null;
    const id = uuid();
    const numeroPedido = await proximoNumero(env, 'pedido');
    let valorItens = 0;
    escolhas.forEach((e, idx) => {
      const valor = arred(e.quantidade * e.preco.precoUnitario);
      valorItens += valor;
      linhas.push({
        id: uuid(), pedidoId: id, seq: idx + 1, solicitacaoItemId: e.item.solicitacaoItemId, cotacaoItemId: e.item.id,
        insumoChave: e.item.insumoChave, insumoCodigo: e.item.insumoCodigo, descricao: e.item.descricao, unidade: e.item.unidade,
        tipo: e.item.tipo, quantidade: e.quantidade, precoUnitario: e.preco.precoUnitario, valorTotal: valor,
        apropriacoes: JSON.stringify(e.item.apropriacoes), marca: e.preco.marca, observacao: e.preco.observacao
      });
    });
    valorItens = arred(valorItens);
    const valorFrete = arred(f.valorFrete || 0);
    const dataEntrega = f.prazoEntregaDias != null ? somarDias(data, f.prazoEntregaDias) : dataEntregaPadrao;
    comandos.push(env.DB.prepare(
      `INSERT INTO supr_pedidos (id, numero, orcamentoId, fornecedorId, cotacaoId, data, dataEntrega, localEntrega, condicaoPagamentoId,
         condicaoPagamento, parcelas, frete, valorFrete, valorDesconto, valorItens, valorTotal, observacoes, status, compradorEmail, compradorNome,
         autorizadoPor, autorizadoEm, token, criadoEm, atualizadoEm)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).bind(id, numeroPedido, c.orcamentoId, fornecedorId, c.id, data, dataEntrega, localEntrega, cond ? cond.id : null,
      f.condicaoPagamento || (cond && cond.descricao) || null, JSON.stringify(cond ? cond.parcelas : parcelasDoTexto(f.condicaoPagamento)),
      f.frete, valorFrete, valorItens, arred(valorItens + valorFrete), [observacoes, f.observacoes].filter(Boolean).join('\n') || null,
      statusPedido, ctx.email, ctx.nome, statusPedido === 'autorizado' ? 'automática' : null, statusPedido === 'autorizado' ? ts : null,
      token(), ts, ts));
    comandos.push(historico(env, ctx, 'pedido', id, 'Gerado pela cotação', `Cotação nº ${c.numero}` +
      (statusPedido === 'autorizado' ? ' · autorizado automaticamente (parâmetro)' : '')));
    criados.push({ id, numero: numeroPedido, fornecedor: f.nome, valorTotal: arred(valorItens + valorFrete), status: statusPedido });
  }
  comandos.push(env.DB.prepare(
    `INSERT INTO supr_pedido_itens (id, pedidoId, seq, solicitacaoItemId, cotacaoItemId, insumoChave, insumoCodigo, descricao, unidade, tipo,
       quantidade, precoUnitario, valorTotal, quantidadeEncerrada, apropriacoes, marca, observacao)
     SELECT json_extract(value, '$.id'), json_extract(value, '$.pedidoId'), json_extract(value, '$.seq'), json_extract(value, '$.solicitacaoItemId'),
            json_extract(value, '$.cotacaoItemId'), json_extract(value, '$.insumoChave'), json_extract(value, '$.insumoCodigo'),
            json_extract(value, '$.descricao'), json_extract(value, '$.unidade'), json_extract(value, '$.tipo'), json_extract(value, '$.quantidade'),
            json_extract(value, '$.precoUnitario'), json_extract(value, '$.valorTotal'), 0, json_extract(value, '$.apropriacoes'),
            json_extract(value, '$.marca'), json_extract(value, '$.observacao')
       FROM json_each(?1)`
  ).bind(JSON.stringify(linhas)));
  comandos.push(env.DB.prepare("UPDATE supr_cotacoes SET status = 'finalizada', finalizadaEm = ?, atualizadoEm = ? WHERE id = ?").bind(ts, ts, c.id));
  comandos.push(historico(env, ctx, 'cotacao', c.id, 'Finalizada', criados.map((x) => `Pedido nº ${x.numero} (${x.fornecedor})`).join(', ')));
  await env.DB.batch(comandos);
  return json({ ok: true, pedidos: criados });
}

export async function cancelarCotacao({ env, ctx, params, corpo }) {
  exigirEdicao(ctx);
  const c = await cotacaoOuErro(env, params.id);
  exigirAberta(c);
  const motivo = texto(corpo.motivo, 'motivo', { max: 500, obrigatorio: true, rotulo: 'o motivo do cancelamento' });
  const ts = agora();
  await env.DB.batch([
    env.DB.prepare("UPDATE supr_cotacoes SET status = 'cancelada', finalizadaEm = ?, atualizadoEm = ? WHERE id = ?").bind(ts, ts, c.id),
    historico(env, ctx, 'cotacao', c.id, 'Cancelada', motivo)
  ]);
  return json({ ok: true });
}
