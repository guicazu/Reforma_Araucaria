// Contas a pagar: títulos gerados pelas notas fiscais (parcelas), pelas medições de contrato (valor
// líquido) e pela liberação da caução no encerramento do contrato. Aqui se dá baixa (pagamento),
// estorna a baixa e muda vencimento/valor de título em aberto.
import { json, falha, agora, hoje, texto, numero, dataIso, arred, exigirEdicao, historico, lerHistorico } from './base.js';
import { moeda, dataBr } from './pdf.js';

export const SQL_TITULOS = `INSERT INTO fin_titulos (id, orcamentoId, fornecedorId, origemTipo, origemId, documento, parcela, totalParcelas,
    dataEmissao, dataVencimento, valor, valorPago, dataPagamento, status, observacoes, criadoEm, atualizadoEm)
  SELECT json_extract(value, '$.id'), json_extract(value, '$.orcamentoId'), json_extract(value, '$.fornecedorId'), json_extract(value, '$.origemTipo'),
         json_extract(value, '$.origemId'), json_extract(value, '$.documento'), json_extract(value, '$.parcela'), json_extract(value, '$.totalParcelas'),
         json_extract(value, '$.dataEmissao'), json_extract(value, '$.dataVencimento'), json_extract(value, '$.valor'), NULL, NULL, 'aberto',
         json_extract(value, '$.observacoes'), json_extract(value, '$.criadoEm'), json_extract(value, '$.criadoEm')
    FROM json_each(?1)`;

export async function listarTitulos({ env, url }) {
  const obra = url.searchParams.get('obra') || '';
  const { results } = await env.DB.prepare(
    `SELECT t.*, f.nome AS fornecedorNome FROM fin_titulos t JOIN supr_fornecedores f ON f.id = t.fornecedorId
      WHERE (?1 = '' OR t.orcamentoId = ?1) ORDER BY CASE t.status WHEN 'aberto' THEN 0 WHEN 'pago' THEN 1 ELSE 2 END, t.dataVencimento LIMIT 3000`
  ).bind(obra).all();
  const dia = hoje();
  const resumo = { aberto: 0, vencido: 0, venceHoje: 0, proximos7: 0, pagoNoMes: 0 };
  const em7 = new Date(dia + 'T12:00:00Z');
  em7.setUTCDate(em7.getUTCDate() + 7);
  const limite7 = em7.toISOString().slice(0, 10);
  const mes = dia.slice(0, 7);
  for (const t of results) {
    if (t.status === 'aberto') {
      resumo.aberto += t.valor;
      if (t.dataVencimento < dia) resumo.vencido += t.valor;
      else if (t.dataVencimento === dia) resumo.venceHoje += t.valor;
      else if (t.dataVencimento <= limite7) resumo.proximos7 += t.valor;
    } else if (t.status === 'pago' && String(t.dataPagamento || '').startsWith(mes)) resumo.pagoNoMes += t.valorPago || 0;
  }
  for (const k of Object.keys(resumo)) resumo[k] = arred(resumo[k]);
  return json({ titulos: results, resumo, hoje: dia });
}

async function tituloOuErro(env, id) {
  const t = await env.DB.prepare('SELECT * FROM fin_titulos WHERE id = ?').bind(id).first();
  if (!t) falha(404, 'nao_encontrado', 'Título não encontrado.');
  return t;
}

export async function obterTitulo({ env, params }) {
  const t = await tituloOuErro(env, params.id);
  return json({ titulo: { ...t, historico: await lerHistorico(env, 'titulo', t.id) } });
}

export async function pagarTitulo({ env, ctx, params, corpo }) {
  exigirEdicao(ctx);
  const t = await tituloOuErro(env, params.id);
  if (t.status !== 'aberto') falha(409, 'nao_aberto', 'Este título não está em aberto.');
  const dataPagamento = dataIso(corpo.dataPagamento, 'dataPagamento', { rotulo: 'a data do pagamento' }) || hoje();
  const valorPago = arred(numero(corpo.valorPago, 'valorPago', { min: 0.01, obrigatorio: false, rotulo: 'o valor pago' }) ?? t.valor);
  const obs = texto(corpo.observacoes, 'observacoes', { max: 500 });
  const ts = agora();
  await env.DB.batch([
    env.DB.prepare("UPDATE fin_titulos SET status = 'pago', valorPago = ?, dataPagamento = ?, observacoes = COALESCE(?, observacoes), atualizadoEm = ? WHERE id = ?")
      .bind(valorPago, dataPagamento, obs, ts, t.id),
    historico(env, ctx, 'titulo', t.id, 'Pago', `${moeda(valorPago)} em ${dataBr(dataPagamento)}` + (Math.abs(valorPago - t.valor) > 0.004 ? ` (valor do título ${moeda(t.valor)})` : ''))
  ]);
  return json({ ok: true });
}

export async function estornarPagamento({ env, ctx, params, corpo }) {
  exigirEdicao(ctx);
  const t = await tituloOuErro(env, params.id);
  if (t.status !== 'pago') falha(409, 'nao_pago', 'Este título não está pago.');
  const motivo = texto(corpo.motivo, 'motivo', { max: 300, obrigatorio: true, rotulo: 'o motivo do estorno' });
  await env.DB.batch([
    env.DB.prepare("UPDATE fin_titulos SET status = 'aberto', valorPago = NULL, dataPagamento = NULL, atualizadoEm = ? WHERE id = ?").bind(agora(), t.id),
    historico(env, ctx, 'titulo', t.id, 'Pagamento estornado', motivo)
  ]);
  return json({ ok: true });
}

export async function alterarTitulo({ env, ctx, params, corpo }) {
  exigirEdicao(ctx);
  const t = await tituloOuErro(env, params.id);
  if (t.status !== 'aberto') falha(409, 'nao_aberto', 'Só dá para alterar título em aberto.');
  const dataVencimento = dataIso(corpo.dataVencimento, 'dataVencimento', { obrigatorio: true, rotulo: 'o vencimento' });
  const observacoes = texto(corpo.observacoes, 'observacoes', { max: 500 });
  await env.DB.batch([
    env.DB.prepare('UPDATE fin_titulos SET dataVencimento = ?, observacoes = ?, atualizadoEm = ? WHERE id = ?').bind(dataVencimento, observacoes, agora(), t.id),
    historico(env, ctx, 'titulo', t.id, 'Vencimento alterado', `${dataBr(t.dataVencimento)} → ${dataBr(dataVencimento)}`)
  ]);
  return json({ ok: true });
}
