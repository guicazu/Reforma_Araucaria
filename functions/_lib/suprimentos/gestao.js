// Caixa de autorizações (documentos aguardando aprovação, com a alçada de quem está vendo) e painel
// de Suprimentos (pendências, atrasos, entregas e pagamentos próximos).
import { json, hoje, somarDias, arred, alcadasDoUsuario, cabeNaAlcada } from './base.js';
import { orcadoComMovimentos } from './obras.js';

export async function listarAutorizacoes({ env, ctx, url }) {
  const obra = url.searchParams.get('obra') || '';
  const [sc, ped, ctr, adt, med] = await env.DB.batch([
    env.DB.prepare(
      `SELECT s.id, s.numero, s.orcamentoId, s.data, s.solicitanteNome, s.valorEstimado AS valor, s.excedeOrcamento, s.observacoes,
              (SELECT COUNT(*) FROM supr_solicitacao_itens i WHERE i.solicitacaoId = s.id) AS itens
         FROM supr_solicitacoes s WHERE s.status = 'pendente' AND (?1 = '' OR s.orcamentoId = ?1) ORDER BY s.numero`
    ).bind(obra),
    env.DB.prepare(
      `SELECT p.id, p.numero, p.orcamentoId, p.data, p.valorTotal AS valor, p.compradorNome, p.cotacaoId, f.nome AS fornecedorNome,
              (SELECT COUNT(*) FROM supr_pedido_itens i WHERE i.pedidoId = p.id) AS itens
         FROM supr_pedidos p JOIN supr_fornecedores f ON f.id = p.fornecedorId
        WHERE p.status = 'pendente' AND (?1 = '' OR p.orcamentoId = ?1) ORDER BY p.numero`
    ).bind(obra),
    env.DB.prepare(
      `SELECT c.id, c.numero, c.orcamentoId, c.objeto, c.valorTotal AS valor, c.criadoPorNome, f.nome AS fornecedorNome
         FROM supr_contratos c JOIN supr_fornecedores f ON f.id = c.fornecedorId
        WHERE c.status = 'pendente' AND (?1 = '' OR c.orcamentoId = ?1) ORDER BY c.numero`
    ).bind(obra),
    env.DB.prepare(
      `SELECT a.id, a.numero, a.contratoId, a.descricao, a.valor, a.novaDataFim, a.criadoPorNome, c.numero AS contratoNumero, c.orcamentoId,
              f.nome AS fornecedorNome
         FROM supr_contrato_aditivos a JOIN supr_contratos c ON c.id = a.contratoId JOIN supr_fornecedores f ON f.id = c.fornecedorId
        WHERE a.status = 'pendente' AND (?1 = '' OR c.orcamentoId = ?1) ORDER BY c.numero, a.numero`
    ).bind(obra),
    env.DB.prepare(
      `SELECT m.id, m.numero, m.contratoId, m.orcamentoId, m.data, m.periodoInicio, m.periodoFim, m.valorBruto AS valor, m.valorLiquido,
              m.criadoPorNome, c.numero AS contratoNumero, c.objeto, f.nome AS fornecedorNome
         FROM supr_medicoes m JOIN supr_contratos c ON c.id = m.contratoId JOIN supr_fornecedores f ON f.id = c.fornecedorId
        WHERE m.status = 'pendente' AND (?1 = '' OR m.orcamentoId = ?1) ORDER BY m.data`
    ).bind(obra)
  ]);
  const alcadas = await alcadasDoUsuario(env, ctx);
  const marcar = (lista, tipo, valor = (x) => x.valor) => lista.map((x) => ({ ...x, podeAutorizar: cabeNaAlcada(alcadas, tipo, Math.abs(valor(x))) }));
  return json({
    alcadas,
    solicitacoes: marcar(sc.results, 'solicitacao'),
    pedidos: marcar(ped.results, 'pedido'),
    contratos: marcar(ctr.results, 'contrato'),
    aditivos: marcar(adt.results, 'contrato'),
    medicoes: marcar(med.results, 'medicao')
  });
}

export async function painel({ env, ctx, url }) {
  const obra = url.searchParams.get('obra') || '';
  const dia = hoje();
  const em7 = somarDias(dia, 7);
  const [pend, aguardando, cot, atrasados, proximas, titulos] = await env.DB.batch([
    env.DB.prepare(
      `SELECT (SELECT COUNT(*) FROM supr_solicitacoes WHERE status = 'pendente' AND (?1 = '' OR orcamentoId = ?1)) AS solicitacoes,
              (SELECT COUNT(*) FROM supr_pedidos WHERE status = 'pendente' AND (?1 = '' OR orcamentoId = ?1)) AS pedidos,
              (SELECT COUNT(*) FROM supr_contratos WHERE status = 'pendente' AND (?1 = '' OR orcamentoId = ?1)) AS contratos,
              (SELECT COUNT(*) FROM supr_contrato_aditivos a JOIN supr_contratos c ON c.id = a.contratoId
                WHERE a.status = 'pendente' AND (?1 = '' OR c.orcamentoId = ?1)) AS aditivos,
              (SELECT COUNT(*) FROM supr_medicoes WHERE status = 'pendente' AND (?1 = '' OR orcamentoId = ?1)) AS medicoes`
    ).bind(obra),
    env.DB.prepare(
      `SELECT COUNT(*) AS itens, COUNT(DISTINCT i.solicitacaoId) AS solicitacoes, MIN(i.dataNecessidade) AS maisUrgente
         FROM supr_solicitacao_itens i JOIN supr_solicitacoes s ON s.id = i.solicitacaoId
        WHERE s.status = 'autorizada' AND i.status = 'autorizado' AND i.encerrado = 0 AND (?1 = '' OR i.orcamentoId = ?1)
          AND i.quantidade
            - COALESCE((SELECT SUM(pi.quantidade - pi.quantidadeEncerrada) FROM supr_pedido_itens pi JOIN supr_pedidos p ON p.id = pi.pedidoId
                         WHERE pi.solicitacaoItemId = i.id AND p.status NOT IN ('cancelado', 'reprovado')), 0)
            - COALESCE((SELECT SUM(ci.quantidade) FROM supr_cotacao_itens ci JOIN supr_cotacoes c ON c.id = ci.cotacaoId
                         WHERE ci.solicitacaoItemId = i.id AND c.status = 'aberta'), 0) > 0.000001`
    ).bind(obra),
    env.DB.prepare(
      `SELECT c.id, c.numero, c.orcamentoId, c.prazoResposta, c.rodada,
              (SELECT COUNT(*) FROM supr_cotacao_fornecedores f WHERE f.cotacaoId = c.id) AS fornecedores,
              (SELECT COUNT(*) FROM supr_cotacao_fornecedores f WHERE f.cotacaoId = c.id AND f.respondidoEm IS NOT NULL) AS respostas
         FROM supr_cotacoes c WHERE c.status = 'aberta' AND (?1 = '' OR c.orcamentoId = ?1) ORDER BY c.numero`
    ).bind(obra),
    env.DB.prepare(
      `SELECT p.id, p.numero, p.orcamentoId, p.dataEntrega, p.valorTotal, p.status, f.nome AS fornecedorNome
         FROM supr_pedidos p JOIN supr_fornecedores f ON f.id = p.fornecedorId
        WHERE p.status IN ('autorizado', 'parcial') AND p.dataEntrega < ?2 AND (?1 = '' OR p.orcamentoId = ?1) ORDER BY p.dataEntrega LIMIT 20`
    ).bind(obra, dia),
    env.DB.prepare(
      `SELECT p.id, p.numero, p.orcamentoId, p.dataEntrega, p.valorTotal, p.status, f.nome AS fornecedorNome
         FROM supr_pedidos p JOIN supr_fornecedores f ON f.id = p.fornecedorId
        WHERE p.status IN ('autorizado', 'parcial') AND p.dataEntrega >= ?2 AND p.dataEntrega <= ?3 AND (?1 = '' OR p.orcamentoId = ?1)
        ORDER BY p.dataEntrega LIMIT 20`
    ).bind(obra, dia, em7),
    env.DB.prepare(
      `SELECT COALESCE(SUM(CASE WHEN dataVencimento < ?2 THEN valor END), 0) AS vencido, COUNT(CASE WHEN dataVencimento < ?2 THEN 1 END) AS qtdVencido,
              COALESCE(SUM(CASE WHEN dataVencimento >= ?2 AND dataVencimento <= ?3 THEN valor END), 0) AS proximos,
              COUNT(CASE WHEN dataVencimento >= ?2 AND dataVencimento <= ?3 THEN 1 END) AS qtdProximos
         FROM fin_titulos WHERE status = 'aberto' AND (?1 = '' OR orcamentoId = ?1)`
    ).bind(obra, dia, em7)
  ]);
  let resumoObra = null;
  if (obra) {
    try {
      const d = await orcadoComMovimentos(env, obra);
      resumoObra = { ...d.totais, avisos: d.avisos, versao: d.versao, referenciaSinapi: d.referenciaSinapi };
    } catch (e) { resumoObra = { erro: e.message }; }
  }
  const t = titulos.results[0];
  return json({
    hoje: dia,
    pendentes: pend.results[0],
    aguardandoCompra: aguardando.results[0],
    cotacoesAbertas: cot.results,
    pedidosAtrasados: atrasados.results,
    entregasProximas: proximas.results,
    titulos: { vencido: arred(t.vencido), qtdVencido: t.qtdVencido, proximos: arred(t.proximos), qtdProximos: t.qtdProximos },
    resumoObra,
    usuario: { nome: ctx.nome, isAdmin: ctx.isAdmin }
  });
}
