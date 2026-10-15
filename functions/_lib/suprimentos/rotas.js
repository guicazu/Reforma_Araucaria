// Rotas de /api/suprimentos/*: uma tabela método + caminho -> função. As funções recebem
// { request, env, ctx (usuário), params, corpo, url } e devolvem a Response; erros esperados são
// ErroApi (status + código + mensagem para a tela).
import { json, ErroApi, contextoUsuario, lerCorpo } from './base.js';
import * as cad from './cadastros.js';
import * as obras from './obras.js';
import * as sol from './solicitacoes.js';
import * as cot from './cotacoes.js';
import * as ped from './pedidos.js';
import * as nf from './notas.js';
import * as ctr from './contratos.js';
import * as est from './estoque.js';
import * as fin from './financeiro.js';
import * as ges from './gestao.js';

const ROTAS = [
  ['GET', 'configuracao', cad.obterConfiguracao],
  ['PUT', 'parametros', cad.salvarParametros],
  ['GET', 'alcadas', cad.listarAlcadas],
  ['POST', 'alcadas', cad.salvarAlcada],
  ['DELETE', 'alcadas/:id', cad.excluirAlcada],
  ['GET', 'fornecedores', cad.listarFornecedores],
  ['POST', 'fornecedores', cad.criarFornecedor],
  ['GET', 'fornecedores/:id', cad.obterFornecedor],
  ['PUT', 'fornecedores/:id', cad.atualizarFornecedor],
  ['DELETE', 'fornecedores/:id', cad.excluirFornecedor],
  ['GET', 'condicoes', cad.listarCondicoes],
  ['POST', 'condicoes', cad.criarCondicao],
  ['PUT', 'condicoes/:id', cad.atualizarCondicao],
  ['DELETE', 'condicoes/:id', cad.excluirCondicao],

  ['GET', 'obras', obras.obras],
  ['GET', 'obras/:id/orcado', obras.orcadoDaObraComMovimentos],
  ['GET', 'insumos/busca', obras.buscarInsumosParaCompra],

  ['GET', 'solicitacoes', sol.listarSolicitacoes],
  ['POST', 'solicitacoes', sol.criarSolicitacao],
  ['GET', 'solicitacoes/itens-para-compra', sol.itensParaCompra],
  ['GET', 'solicitacoes/:id', sol.obterSolicitacao],
  ['PUT', 'solicitacoes/:id', sol.atualizarSolicitacao],
  ['POST', 'solicitacoes/:id/autorizar', sol.autorizarSolicitacao],
  ['POST', 'solicitacoes/:id/reprovar', sol.reprovarSolicitacao],
  ['POST', 'solicitacoes/:id/cancelar', sol.cancelarSolicitacao],
  ['POST', 'solicitacoes/:id/itens/:itemId/encerrar', sol.encerrarItemSolicitacao],

  ['GET', 'cotacoes', cot.listarCotacoes],
  ['POST', 'cotacoes', cot.criarCotacao],
  ['GET', 'cotacoes/:id', cot.obterCotacao],
  ['PUT', 'cotacoes/:id/mapa', cot.salvarMapa],
  ['POST', 'cotacoes/:id/itens', cot.adicionarItensCotacao],
  ['DELETE', 'cotacoes/:id/itens/:itemId', cot.removerItemCotacao],
  ['POST', 'cotacoes/:id/fornecedores', cot.adicionarFornecedorCotacao],
  ['DELETE', 'cotacoes/:id/fornecedores/:fornecedorId', cot.removerFornecedorCotacao],
  ['POST', 'cotacoes/:id/rodada', cot.novaRodada],
  ['POST', 'cotacoes/:id/convites', cot.enviarConvites],
  ['POST', 'cotacoes/:id/gerar-pedidos', cot.gerarPedidos],
  ['POST', 'cotacoes/:id/cancelar', cot.cancelarCotacao],

  ['GET', 'pedidos', ped.listarPedidos],
  ['POST', 'pedidos', ped.criarPedido],
  ['GET', 'pedidos/para-entrada', ped.pedidosParaEntrada],
  ['GET', 'pedidos/:id', ped.obterPedido],
  ['PUT', 'pedidos/:id', ped.atualizarPedido],
  ['GET', 'pedidos/:id/pdf', ped.pdfDoPedido],
  ['POST', 'pedidos/:id/autorizar', ped.autorizarPedido],
  ['POST', 'pedidos/:id/reprovar', ped.reprovarPedido],
  ['POST', 'pedidos/:id/cancelar', ped.cancelarPedido],
  ['POST', 'pedidos/:id/encerrar', ped.encerrarPedido],
  ['POST', 'pedidos/:id/enviar', ped.enviarPedido],
  ['POST', 'pedidos/:id/envio-manual', ped.registrarEnvioManual],

  ['GET', 'notas', nf.listarNotas],
  ['POST', 'notas', nf.lancarNota],
  ['GET', 'notas/:id', nf.obterNota],
  ['POST', 'notas/:id/cancelar', nf.cancelarNota],

  ['GET', 'contratos', ctr.listarContratos],
  ['POST', 'contratos', ctr.criarContrato],
  ['GET', 'contratos/:id', ctr.obterContrato],
  ['PUT', 'contratos/:id', ctr.atualizarContrato],
  ['POST', 'contratos/:id/autorizar', ctr.autorizarContrato],
  ['POST', 'contratos/:id/reprovar', ctr.reprovarContrato],
  ['POST', 'contratos/:id/cancelar', ctr.cancelarContrato],
  ['POST', 'contratos/:id/encerrar', ctr.encerrarContrato],
  ['POST', 'contratos/:id/aditivos', ctr.criarAditivo],
  ['POST', 'contratos/:id/aditivos/:aditivoId/autorizar', ctr.autorizarAditivo],
  ['POST', 'contratos/:id/aditivos/:aditivoId/reprovar', ctr.reprovarAditivo],
  ['POST', 'contratos/:id/medicoes', ctr.criarMedicao],
  ['GET', 'medicoes', ctr.listarMedicoes],
  ['GET', 'medicoes/:id', ctr.obterMedicao],
  ['POST', 'medicoes/:id/autorizar', ctr.autorizarMedicao],
  ['POST', 'medicoes/:id/reprovar', ctr.reprovarMedicao],
  ['POST', 'medicoes/:id/cancelar', ctr.cancelarMedicao],

  ['GET', 'estoque/saldos', est.listarSaldos],
  ['GET', 'estoque/movimentos', est.listarMovimentos],
  ['POST', 'estoque/saidas', est.registrarSaida],
  ['POST', 'estoque/entradas', est.registrarEntrada],
  ['POST', 'estoque/transferencias', est.transferir],
  ['POST', 'estoque/inventario', est.registrarInventario],
  ['POST', 'estoque/movimentos/:id/estornar', est.estornarMovimento],

  ['GET', 'titulos', fin.listarTitulos],
  ['GET', 'titulos/:id', fin.obterTitulo],
  ['PUT', 'titulos/:id', fin.alterarTitulo],
  ['POST', 'titulos/:id/pagar', fin.pagarTitulo],
  ['POST', 'titulos/:id/estornar', fin.estornarPagamento],

  ['GET', 'autorizacoes', ges.listarAutorizacoes],
  ['GET', 'painel', ges.painel]
].map(([metodo, caminho, funcao]) => ({ metodo, partes: caminho.split('/'), funcao }));

function encontrar(metodo, partes) {
  for (const r of ROTAS) {
    if (r.metodo !== metodo || r.partes.length !== partes.length) continue;
    const params = {};
    let ok = true;
    for (let i = 0; i < partes.length && ok; i++) {
      if (r.partes[i].startsWith(':')) params[r.partes[i].slice(1)] = decodeURIComponent(partes[i]);
      else ok = r.partes[i] === partes[i];
    }
    if (ok) return { funcao: r.funcao, params };
  }
  return null;
}

export async function tratarRota({ request, env, params }) {
  const url = new URL(request.url);
  const partes = (Array.isArray(params.rota) ? params.rota : params.rota ? [params.rota] : []).filter(Boolean);
  try {
    const ctx = await contextoUsuario(request, env);
    if (!ctx) return json({ erro: 'nao_autenticado', mensagem: 'Sua sessão expirou. Entre de novo.' }, 401);
    const rota = encontrar(request.method, partes);
    if (!rota) return json({ erro: 'rota_inexistente', mensagem: 'Operação não encontrada.' }, 404);
    const comCorpo = ['POST', 'PUT', 'DELETE'].includes(request.method) && (request.headers.get('content-type') || '').includes('json');
    const corpo = comCorpo ? await lerCorpo(request) : {};
    return await rota.funcao({ request, env, ctx, params: rota.params, corpo, url });
  } catch (e) {
    if (e instanceof ErroApi) return json({ erro: e.codigo, mensagem: e.message, ...(e.extra ? { detalhes: e.extra } : {}) }, e.status);
    console.error('[suprimentos]', request.method, url.pathname, e);
    if (/no such table|no such column/i.test(String(e && e.message))) {
      return json({ erro: 'banco_desatualizado', mensagem: 'O banco ainda não tem as tabelas de Suprimentos: aplique db/migrations/20261017_suprimentos.sql.' }, 500);
    }
    return json({ erro: 'erro_interno', mensagem: 'Erro inesperado no servidor. Tente de novo; se continuar, avise o administrador.' }, 500);
  }
}
