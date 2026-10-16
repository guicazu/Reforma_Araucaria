// Painel de Início: indicadores das obras (orçado × comprometido × realizado e avanço físico), de
// Suprimentos, do Financeiro e da Engenharia. Cada parte só vai para quem pode ver o módulo correspondente
// (Usuários › Editar permissões). Filtros: obra (vazio = todas) e período de 3, 6 ou 12 meses
// (inclui o mês atual) para as séries mensais, fornecedores, economia e prazos.
import { json, hoje, somarDias, arred, lerJson } from './base.js';
import { estruturaEap } from './orcado.js';
import { movimentosDaObra, movimentosPorObra, consolidar } from './saldos.js';
import { pode } from '../permissoes.js';
import { configDe, resumoDoCronograma, ultimosAvancos } from '../planejamento/cronogramas.js';
import { curvaS, indexarAvancos, previstoDaTarefa, realizadoDaTarefa } from '../../../js/cronograma-motor.js';

const MODULOS_COMPRAS = ['solicitacoes', 'cotacoes', 'pedidos', 'notas', 'contratos', 'estoque', 'cadastros'];
const PERIODOS = [3, 6, 12];
const SEMANAS = 8;
const PEDIDO_VALIDO = "('autorizado', 'parcial', 'entregue', 'encerrado')";
const DATA_CONTRATO = 'COALESCE(dataAssinatura, autorizadoEm, criadoEm)';

function primeiroDia(dia, mesesAtras) {
  const [a, m] = dia.split('-').map(Number);
  return new Date(Date.UTC(a, m - 1 - mesesAtras, 1)).toISOString().slice(0, 10);
}
function mesesDoPeriodo(desde, meses) {
  const [a, m] = desde.split('-').map(Number);
  return Array.from({ length: meses }, (_, i) => new Date(Date.UTC(a, m - 1 + i, 1)).toISOString().slice(0, 7));
}

// Comprometido, realizado e em aprovação somados de todos os serviços
function somarServicos(servicos, ids) {
  const r = { comprometido: 0, realizado: 0, emAprovacao: 0 };
  for (const [sid, v] of servicos) {
    if (ids && !ids.has(sid)) continue;
    r.comprometido += v.comprometido;
    r.realizado += v.realizado;
    r.emAprovacao += v.emAprovacao;
  }
  return r;
}
function fechar(linha) {
  for (const k of ['orcado', 'comprometido', 'realizado', 'emAprovacao']) linha[k] = arred(linha[k] || 0);
  linha.saldo = arred(linha.orcado - linha.comprometido - linha.realizado);
  return linha;
}

// Uma obra só: os custos por etapa da EAP (serviços de sub etapas sobem para a etapa)
function custosPorEtapa(nos, servicos) {
  const porId = new Map(nos.map((n) => [n.id, n]));
  const variasUnidades = nos.filter((n) => n.tipo === 'unidade').length > 1;
  const etapas = new Map();
  for (const n of nos) {
    if (n.tipo !== 'etapa') continue;
    const unidade = porId.get(n.paiId);
    etapas.set(n.id, { id: n.id, eap: n.eap, nome: n.nome, grupo: variasUnidades && unidade ? unidade.nome : '',
      orcado: 0, comprometido: 0, realizado: 0, emAprovacao: 0 });
  }
  const naEap = new Set();
  for (const n of nos) {
    if (n.tipo !== 'servico') continue;
    naEap.add(n.id);
    let pai = porId.get(n.paiId);
    if (pai && pai.tipo === 'sub') pai = porId.get(pai.paiId);
    const linha = pai && etapas.get(pai.id);
    if (!linha) continue;
    linha.orcado += n.valor;
    const v = servicos.get(n.id);
    if (v) { linha.comprometido += v.comprometido; linha.realizado += v.realizado; linha.emAprovacao += v.emAprovacao; }
  }
  const linhas = Array.from(etapas.values());
  // compras apropriadas em serviços que saíram da versão atual do orçamento
  const fora = { id: '', eap: '', nome: 'Serviços removidos do orçamento', grupo: '', orcado: 0, removido: true,
    ...somarServicos(Array.from(servicos).filter(([sid]) => !naEap.has(sid))) };
  if (fora.comprometido || fora.realizado || fora.emAprovacao) linhas.push(fora);
  return linhas.map(fechar).filter((l) => l.orcado || l.comprometido || l.realizado || l.emAprovacao);
}

// Avanço físico (Planejamento): previsto × realizado de hoje por obra, ponderado pelo valor orçado
// no total; os serviços mais atrasados; e a curva S quando há uma obra escolhida
async function avancoFisico(env, doFiltro, obra, dia) {
  const [cronogramas, ultimos, todos] = await Promise.all([
    env.DB.prepare(
      `SELECT orcamentoId, dataInicio, calendario, feriados, duracaoPadrao, tarefas FROM plan_cronogramas WHERE (?1 = '' OR orcamentoId = ?1)`
    ).bind(obra).all(),
    ultimosAvancos(env, dia, obra),
    obra ? env.DB.prepare('SELECT servicoId, data, percentual FROM plan_avancos WHERE orcamentoId = ? ORDER BY data').bind(obra).all() : null
  ]);
  const configs = new Map(cronogramas.results.map((c) => [c.orcamentoId, configDe(c)]));
  const linhas = [];
  const atrasados = [];
  let curva = null;
  for (const v of doFiltro) {
    const base = { id: v.id, codigo: v.codigo || '', nome: v.nome || '' };
    const config = configs.get(v.id);
    if (!config) { linhas.push({ ...base, temCronograma: false }); continue; }
    const apontados = ultimos.get(v.id) || [];
    const r = resumoDoCronograma(v.nos, config, apontados, dia);
    const servicos = v.nos.filter((n) => n.tipo === 'servico');
    linhas.push({ ...base, temCronograma: true, inicio: r.inicio, termino: r.termino, duracao: r.duracao,
      previsto: r.previsto, realizado: r.realizado, peso: servicos.reduce((s, n) => s + n.valor, 0) });
    const indice = indexarAvancos(apontados);
    const ate = r.res.calendario.indiceAte(dia);
    for (const n of servicos) {
      const t = r.res.tarefas.get(n.id);
      const previsto = previstoDaTarefa(t, ate), realizado = realizadoDaTarefa(indice, n.id, dia);
      if (previsto - realizado > 0.005) {
        atrasados.push({ obraId: v.id, obra: v.codigo || v.nome || '', eap: n.eap, nome: n.nome, termino: t.termino, critico: t.critico,
          previsto: arred(previsto * 100, 1), realizado: arred(realizado * 100, 1) });
      }
    }
    if (obra) curva = curvaS(r.res, todos.results, dia).map((p) => ({ data: p.data, previsto: arred(p.previsto, 1), realizado: p.realizado == null ? null : arred(p.realizado, 1) }));
  }
  const com = linhas.filter((l) => l.temCronograma);
  const somaValor = com.reduce((s, l) => s + l.peso, 0);
  const peso = (l) => (somaValor > 0 ? l.peso : 1);
  const total = com.reduce((s, l) => s + peso(l), 0);
  const media = (k) => (total > 0 ? arred(com.reduce((s, l) => s + peso(l) * l[k], 0) / total, 1) : 0);
  atrasados.sort((a, b) => (b.previsto - b.realizado) - (a.previsto - a.realizado) || String(a.termino).localeCompare(String(b.termino)));
  return {
    obras: linhas.map(({ peso: _, ...l }) => l),
    totais: { previsto: media('previsto'), realizado: media('realizado'), comCronograma: com.length, obras: linhas.length,
      atrasadas: com.filter((l) => l.realizado - l.previsto <= -5).length },
    atrasados: atrasados.slice(0, 8), totalAtrasados: atrasados.length,
    curva
  };
}

async function contagensDoCatalogo(env) {
  try {
    return await env.DB.prepare(
      `SELECT (SELECT COUNT(*) FROM composicoes WHERE base = 'propria') AS composicoes,
              (SELECT COUNT(*) FROM insumos WHERE base = 'propria') AS insumos,
              (SELECT MAX(mes) FROM sinapi_referencias WHERE status = 'ok') AS sinapi`
    ).first();
  } catch (e) {
    return { composicoes: null, insumos: null, sinapi: null };
  }
}

export async function inicio({ env, ctx, url }) {
  const ve = (m) => pode(ctx.permissoes, m, 'visualizar');
  const secoes = {
    custos: ve('acompanhamento'),
    planejamento: ve('planejamento'),
    suprimentos: MODULOS_COMPRAS.some(ve),
    financeiro: ve('financeiro'),
    engenharia: ve('orcamento')
  };
  const pedido = Number(url.searchParams.get('meses'));
  const meses = PERIODOS.includes(pedido) ? pedido : 6;
  const dia = hoje();
  const desde = primeiroDia(dia, meses - 1);
  const resposta = { hoje: dia, meses, desde, mesesLista: mesesDoPeriodo(desde, meses), secoes, obra: '', obras: [] };
  if (!Object.values(secoes).some(Boolean)) return json(resposta);

  // versão atual de cada obra; o conteúdo (EAP) só das obras do filtro
  const comConteudo = secoes.custos || secoes.engenharia || secoes.planejamento;
  const listar = async (filtro) => (await env.DB.prepare(
    `SELECT v.orcamentoId AS id, v.codigo, v.nome, v.versaoNumero, v.revisao, v.referencia, v.atualizadoEm,
            CASE WHEN ?1 = '' OR v.orcamentoId = ?1 THEN ${comConteudo ? 'v.conteudo' : 'NULL'} END AS conteudo
       FROM orcamentos_versoes v
      WHERE v.versaoNumero = (SELECT MAX(x.versaoNumero) FROM orcamentos_versoes x WHERE x.orcamentoId = v.orcamentoId)
      ORDER BY v.codigo, v.nome`
  ).bind(filtro).all()).results;
  const pedida = url.searchParams.get('obra') || '';
  let versoes = await listar(pedida);
  const obra = versoes.some((v) => v.id === pedida) ? pedida : '';
  if (pedida && !obra) versoes = await listar('');  // obra que não existe mais: volta para todas
  resposta.obras = versoes.map((v) => ({ id: v.id, codigo: v.codigo || '', nome: v.nome || '' }));
  resposta.obra = obra;
  const doFiltro = versoes.filter((v) => !obra || v.id === obra)
    .map((v) => ({ ...v, nos: comConteudo ? estruturaEap(lerJson(v.conteudo, [])) : [] }));

  // consultas agregadas numa ida ao banco; os nomes dizem onde cada resultado entra
  const consultas = [];
  const pedir = (nome, sql, ...valores) => consultas.push([nome, env.DB.prepare(sql).bind(...valores)]);
  const filtro = '(?1 = \'\' OR orcamentoId = ?1)';
  if (secoes.custos || secoes.suprimentos || secoes.financeiro) {
    pedir('series',
      `SELECT 'notas' AS serie, substr(COALESCE(dataEntrada, dataEmissao), 1, 7) AS mes, SUM(valorTotal) AS valor, COUNT(*) AS qtd
         FROM supr_notas WHERE status = 'lancada' AND COALESCE(dataEntrada, dataEmissao) >= ?2 AND ${filtro} GROUP BY 2
       UNION ALL
       SELECT 'medicoes', substr(data, 1, 7), SUM(valorBruto), COUNT(*)
         FROM supr_medicoes WHERE status = 'autorizada' AND data >= ?2 AND ${filtro} GROUP BY 2
       UNION ALL
       SELECT 'pedidos', substr(data, 1, 7), SUM(valorTotal), COUNT(*)
         FROM supr_pedidos WHERE status IN ${PEDIDO_VALIDO} AND data >= ?2 AND ${filtro} GROUP BY 2
       UNION ALL
       SELECT 'contratos', substr(${DATA_CONTRATO}, 1, 7), SUM(valorTotal), COUNT(*)
         FROM supr_contratos WHERE status IN ('autorizado', 'encerrado') AND ${DATA_CONTRATO} >= ?2 AND ${filtro} GROUP BY 2
       UNION ALL
       SELECT 'pago', substr(dataPagamento, 1, 7), SUM(COALESCE(valorPago, valor)), COUNT(*)
         FROM fin_titulos WHERE status = 'pago' AND dataPagamento >= ?2 AND ${filtro} GROUP BY 2`,
      obra, desde);
  }
  if (secoes.suprimentos) {
    pedir('contagens',
      `SELECT (SELECT COUNT(*) FROM supr_solicitacoes WHERE status = 'pendente' AND ${filtro}) AS solicitacoes,
              (SELECT COUNT(*) FROM supr_pedidos WHERE status = 'pendente' AND ${filtro}) AS pedidos,
              (SELECT COUNT(*) FROM supr_contratos WHERE status = 'pendente' AND ${filtro}) AS contratos,
              (SELECT COUNT(*) FROM supr_contrato_aditivos a JOIN supr_contratos c ON c.id = a.contratoId
                WHERE a.status = 'pendente' AND (?1 = '' OR c.orcamentoId = ?1)) AS aditivos,
              (SELECT COUNT(*) FROM supr_medicoes WHERE status = 'pendente' AND ${filtro}) AS medicoes,
              (SELECT COUNT(*) FROM supr_cotacoes WHERE status = 'aberta' AND ${filtro}) AS cotacoes,
              (SELECT COUNT(*) FROM supr_cotacao_fornecedores f JOIN supr_cotacoes c ON c.id = f.cotacaoId
                WHERE c.status = 'aberta' AND (?1 = '' OR c.orcamentoId = ?1)) AS convites,
              (SELECT COUNT(f.respondidoEm) FROM supr_cotacao_fornecedores f JOIN supr_cotacoes c ON c.id = f.cotacaoId
                WHERE c.status = 'aberta' AND (?1 = '' OR c.orcamentoId = ?1)) AS respostas,
              (SELECT COUNT(*) FROM supr_pedidos WHERE status IN ('autorizado', 'parcial') AND dataEntrega < ?2 AND ${filtro}) AS atrasados,
              (SELECT COALESCE(SUM(valorTotal), 0) FROM supr_pedidos
                WHERE status IN ('autorizado', 'parcial') AND dataEntrega < ?2 AND ${filtro}) AS valorAtrasado,
              (SELECT COUNT(*) FROM supr_pedidos
                WHERE status IN ('autorizado', 'parcial') AND dataEntrega >= ?2 AND dataEntrega <= ?3 AND ${filtro}) AS proximas`,
      obra, dia, somarDias(dia, 7));
    pedir('aguardando',
      `SELECT COUNT(*) AS itens, COUNT(DISTINCT i.solicitacaoId) AS solicitacoes, MIN(i.dataNecessidade) AS maisUrgente
         FROM supr_solicitacao_itens i JOIN supr_solicitacoes s ON s.id = i.solicitacaoId
        WHERE s.status = 'autorizada' AND i.status = 'autorizado' AND i.encerrado = 0 AND (?1 = '' OR i.orcamentoId = ?1)
          AND i.quantidade
            - COALESCE((SELECT SUM(pi.quantidade - pi.quantidadeEncerrada) FROM supr_pedido_itens pi JOIN supr_pedidos p ON p.id = pi.pedidoId
                         WHERE pi.solicitacaoItemId = i.id AND p.status NOT IN ('cancelado', 'reprovado')), 0)
            - COALESCE((SELECT SUM(ci.quantidade) FROM supr_cotacao_itens ci JOIN supr_cotacoes c ON c.id = ci.cotacaoId
                         WHERE ci.solicitacaoItemId = i.id AND c.status = 'aberta'), 0) > 0.000001`,
      obra);
    // economia: preço orçado × preço comprado dos itens de pedido que vieram de solicitação
    pedir('compras',
      `SELECT SUM(CASE WHEN si.precoOrcado > 0 THEN (pi.quantidade - pi.quantidadeEncerrada) * si.precoOrcado END) AS orcado,
              SUM(CASE WHEN si.precoOrcado > 0 THEN (pi.quantidade - pi.quantidadeEncerrada) * pi.precoUnitario END) AS comprado,
              (SELECT AVG(dias) FROM (
                 SELECT DISTINCT p2.id, s2.id, julianday(p2.data) - julianday(s2.data) AS dias
                   FROM supr_pedido_itens pi2 JOIN supr_pedidos p2 ON p2.id = pi2.pedidoId
                   JOIN supr_solicitacao_itens si2 ON si2.id = pi2.solicitacaoItemId JOIN supr_solicitacoes s2 ON s2.id = si2.solicitacaoId
                  WHERE p2.status IN ${PEDIDO_VALIDO} AND p2.data >= ?2 AND (?1 = '' OR p2.orcamentoId = ?1))) AS prazoMedio
         FROM supr_pedido_itens pi JOIN supr_pedidos p ON p.id = pi.pedidoId
         JOIN supr_solicitacao_itens si ON si.id = pi.solicitacaoItemId
        WHERE p.status IN ${PEDIDO_VALIDO} AND p.data >= ?2 AND (?1 = '' OR p.orcamentoId = ?1)`,
      obra, desde);
    // pontualidade: pedidos entregues no período com a última nota até a data de entrega combinada
    pedir('entregas',
      `SELECT COUNT(*) AS entregues, COALESCE(SUM(ultima <= dataEntrega), 0) AS noPrazo FROM (
         SELECT p.id, p.dataEntrega, MAX(COALESCE(n.dataEntrada, n.dataEmissao)) AS ultima
           FROM supr_pedidos p JOIN supr_pedido_itens pi ON pi.pedidoId = p.id
           JOIN supr_nota_itens ni ON ni.pedidoItemId = pi.id JOIN supr_notas n ON n.id = ni.notaId AND n.status = 'lancada'
          WHERE p.status IN ('entregue', 'encerrado') AND (?1 = '' OR p.orcamentoId = ?1)
          GROUP BY p.id) WHERE ultima >= ?2`,
      obra, desde);
    pedir('fornecedores',
      `SELECT f.id, f.nome, SUM(x.valor) AS valor, SUM(x.pedidos) AS pedidos, SUM(x.contratos) AS contratos
         FROM (SELECT fornecedorId, valorTotal AS valor, 1 AS pedidos, 0 AS contratos FROM supr_pedidos
                WHERE status IN ${PEDIDO_VALIDO} AND data >= ?2 AND ${filtro}
               UNION ALL
               SELECT fornecedorId, valorTotal, 0, 1 FROM supr_contratos
                WHERE status IN ('autorizado', 'encerrado') AND ${DATA_CONTRATO} >= ?2 AND ${filtro}) x
         JOIN supr_fornecedores f ON f.id = x.fornecedorId
        GROUP BY f.id ORDER BY valor DESC`,
      obra, desde);
  }
  if (secoes.financeiro) {
    pedir('titulos',
      `SELECT COALESCE(SUM(CASE WHEN status = 'aberto' THEN valor END), 0) AS aberto,
              COUNT(CASE WHEN status = 'aberto' THEN 1 END) AS qtdAberto,
              COALESCE(SUM(CASE WHEN status = 'aberto' AND dataVencimento < ?2 THEN valor END), 0) AS vencido,
              COUNT(CASE WHEN status = 'aberto' AND dataVencimento < ?2 THEN 1 END) AS qtdVencido,
              COALESCE(SUM(CASE WHEN status = 'aberto' AND dataVencimento >= ?2 AND dataVencimento <= ?3 THEN valor END), 0) AS proximos,
              COUNT(CASE WHEN status = 'aberto' AND dataVencimento >= ?2 AND dataVencimento <= ?3 THEN 1 END) AS qtdProximos,
              COALESCE(SUM(CASE WHEN status = 'pago' AND substr(dataPagamento, 1, 7) = ?4 THEN COALESCE(valorPago, valor) END), 0) AS pagoMes,
              COUNT(CASE WHEN status = 'pago' AND substr(dataPagamento, 1, 7) = ?4 THEN 1 END) AS qtdPagoMes
         FROM fin_titulos WHERE status IN ('aberto', 'pago') AND ${filtro}`,
      obra, dia, somarDias(dia, 7), dia.slice(0, 7));
    pedir('vencimentos',
      `SELECT dataVencimento AS data, SUM(valor) AS valor, COUNT(*) AS qtd FROM fin_titulos
        WHERE status = 'aberto' AND dataVencimento >= ?2 AND dataVencimento < ?3 AND ${filtro} GROUP BY dataVencimento`,
      obra, dia, somarDias(dia, SEMANAS * 7));
  }
  const r = {};
  if (consultas.length) {
    const resultados = await env.DB.batch(consultas.map((c) => c[1]));
    consultas.forEach(([nome], i) => { r[nome] = resultados[i].results; });
  }
  const doPeriodo = (nome) => (r.series || []).filter((x) => x.serie === nome && resposta.mesesLista.includes(x.mes));
  const serie = (nome) => {
    const porMes = new Map(doPeriodo(nome).map((x) => [x.mes, x.valor]));
    return resposta.mesesLista.map((m) => arred(porMes.get(m) || 0));
  };
  const noPeriodo = (nome) => doPeriodo(nome).reduce((t, x) => ({ valor: arred(t.valor + x.valor), qtd: t.qtd + x.qtd }), { valor: 0, qtd: 0 });

  if (secoes.custos) {
    const movimentos = obra ? new Map([[obra, await movimentosDaObra(env, obra)]]) : await movimentosPorObra(env);
    const totais = { orcado: 0, comprometido: 0, realizado: 0, emAprovacao: 0 };
    let linhas = [];
    for (const v of doFiltro) {
      const servicos = v.nos.filter((n) => n.tipo === 'servico');
      const mov = movimentos.get(v.id);
      const porServico = mov ? consolidar(mov).servicos : new Map();
      const linha = fechar({ id: v.id, codigo: v.codigo || '', nome: v.nome || '', versao: v.versaoNumero,
        orcado: servicos.reduce((s, n) => s + n.valor, 0), ...somarServicos(porServico) });
      for (const k of Object.keys(totais)) totais[k] += linha[k];
      linhas.push(linha);
      if (obra) linhas = custosPorEtapa(v.nos, porServico);
    }
    fechar(totais);
    totais.acimaDoOrcado = linhas.filter((l) => l.comprometido + l.realizado > l.orcado + 0.005).length;
    resposta.custos = {
      porEtapa: Boolean(obra), totais, linhas,
      realizadoMensal: { notas: serie('notas'), medicoes: serie('medicoes') }
    };
  }

  if (secoes.planejamento) resposta.planejamento = await avancoFisico(env, doFiltro, obra, dia);

  if (secoes.suprimentos) {
    const c = r.contagens[0];
    const compras = r.compras[0] || {};
    const entregas = r.entregas[0] || {};
    const fornecedores = r.fornecedores || [];
    const principais = fornecedores.slice(0, 5);
    const demais = fornecedores.slice(5);
    resposta.suprimentos = {
      pendentes: { solicitacoes: c.solicitacoes, pedidos: c.pedidos, contratos: c.contratos, aditivos: c.aditivos, medicoes: c.medicoes,
        total: c.solicitacoes + c.pedidos + c.contratos + c.aditivos + c.medicoes },
      aguardandoCompra: r.aguardando[0],
      cotacoes: { abertas: c.cotacoes, convites: c.convites, respostas: c.respostas },
      entregas: { atrasadas: c.atrasados, valorAtrasado: arred(c.valorAtrasado), proximas: c.proximas,
        entregues: entregas.entregues || 0, noPrazo: entregas.noPrazo || 0 },
      economia: { orcado: arred(compras.orcado || 0), comprado: arred(compras.comprado || 0) },
      prazoMedio: compras.prazoMedio == null ? null : arred(compras.prazoMedio, 1),
      comprasMensais: { pedidos: serie('pedidos'), contratos: serie('contratos') },
      comprado: { pedidos: noPeriodo('pedidos'), contratos: noPeriodo('contratos') },
      fornecedores: principais.map((f) => ({ id: f.id, nome: f.nome, valor: arred(f.valor), pedidos: f.pedidos, contratos: f.contratos })),
      demais: { quantidade: demais.length, valor: arred(demais.reduce((s, f) => s + f.valor, 0)) }
    };
  }

  if (secoes.financeiro) {
    const t = r.titulos[0];
    const semanas = Array.from({ length: SEMANAS }, (_, i) => ({ inicio: somarDias(dia, i * 7), fim: somarDias(dia, i * 7 + 6), valor: 0, qtd: 0 }));
    for (const v of r.vencimentos) {
      const i = Math.floor((Date.parse(v.data + 'T12:00:00Z') - Date.parse(dia + 'T12:00:00Z')) / (7 * 86400000));
      if (semanas[i]) { semanas[i].valor += v.valor; semanas[i].qtd += v.qtd; }
    }
    resposta.financeiro = {
      aberto: arred(t.aberto), qtdAberto: t.qtdAberto, vencido: arred(t.vencido), qtdVencido: t.qtdVencido,
      proximos: arred(t.proximos), qtdProximos: t.qtdProximos, pagoMes: arred(t.pagoMes), qtdPagoMes: t.qtdPagoMes,
      semanas: semanas.map((s) => ({ ...s, valor: arred(s.valor) })),
      pagoMensal: serie('pago')
    };
  }

  if (secoes.engenharia) {
    const catalogo = await contagensDoCatalogo(env);
    const lista = doFiltro.map((v) => {
      const servicos = v.nos.filter((n) => n.tipo === 'servico');
      return { id: v.id, codigo: v.codigo || '', nome: v.nome || '', versao: v.versaoNumero, revisao: v.revisao || 0,
        referencia: v.referencia || '', atualizadoEm: v.atualizadoEm || '', servicos: servicos.length,
        orcado: arred(servicos.reduce((s, n) => s + n.valor, 0)) };
    }).sort((a, b) => String(b.atualizadoEm).localeCompare(String(a.atualizadoEm)));
    // curva ABC dos serviços: os maiores e quantos somam 80% do valor
    const servicos = doFiltro.flatMap((v) => v.nos.filter((n) => n.tipo === 'servico' && n.valor > 0)
      .map((n) => ({ id: n.id, eap: n.eap, nome: n.nome, obra: v.codigo || v.nome || '', valor: n.valor })))
      .sort((a, b) => b.valor - a.valor);
    const total = servicos.reduce((s, n) => s + n.valor, 0);
    let acumulado = 0, classeA = 0;
    for (const s of servicos) { if (acumulado >= total * 0.8) break; acumulado += s.valor; classeA++; }
    resposta.engenharia = {
      orcamentos: lista.length, servicos: lista.reduce((s, o) => s + o.servicos, 0), orcado: arred(total),
      composicoes: catalogo.composicoes, insumos: catalogo.insumos, sinapi: catalogo.sinapi || '',
      lista,
      maioresServicos: servicos.slice(0, 8).map((s) => ({ ...s, valor: arred(s.valor), participacao: total > 0 ? arred(s.valor / total * 100, 1) : 0 })),
      // uma obra: o orçado de cada etapa da EAP
      etapas: obra && doFiltro[0] ? custosPorEtapa(doFiltro[0].nos, new Map())
        .map((l) => ({ eap: l.eap, nome: l.nome, grupo: l.grupo, valor: l.orcado, participacao: total > 0 ? arred(l.orcado / total * 100, 1) : 0 })) : [],
      curvaA: { servicos: classeA, de: servicos.length }
    };
  }

  return json(resposta);
}
