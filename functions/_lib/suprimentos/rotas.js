// Rotas de /api/suprimentos/*: uma tabela método + caminho -> função (functions/_lib/roteador.js
// confere a permissão de cada rota e trata os erros).
import { criarRoteador } from '../roteador.js';
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
import * as ini from './inicio.js';
import * as con from './consultas.js';

// Permissão de cada rota: 'livre' (qualquer usuário aprovado), 'admin', '*' (vê algum módulo de
// Suprimentos/Financeiro) ou 'modulo:ver' / 'modulo:editar' (Usuários › Editar permissões).
// Autorizar e reprovar pedem só ver o módulo: quem decide é a alçada.
const ROTAS = [
  ['GET', 'configuracao', cad.obterConfiguracao, 'livre'],
  ['PUT', 'parametros', cad.salvarParametros, 'admin'],
  ['GET', 'alcadas', cad.listarAlcadas, 'admin'],
  ['POST', 'alcadas', cad.salvarAlcada, 'admin'],
  ['DELETE', 'alcadas/:id', cad.excluirAlcada, 'admin'],
  ['GET', 'fornecedores', cad.listarFornecedores, '*'],
  ['POST', 'fornecedores', cad.criarFornecedor, 'cadastros:editar'],
  ['GET', 'fornecedores/:id', cad.obterFornecedor, '*'],
  ['PUT', 'fornecedores/:id', cad.atualizarFornecedor, 'cadastros:editar'],
  ['DELETE', 'fornecedores/:id', cad.excluirFornecedor, 'cadastros:editar'],
  // CNPJ (Receita) e CEP para preencher o cadastro de fornecedor
  ['GET', 'consultas/cnpj/:numero', con.cnpj, '*'],
  ['GET', 'consultas/cep/:numero', con.cep, '*'],
  ['GET', 'condicoes', cad.listarCondicoes, '*'],
  ['POST', 'condicoes', cad.criarCondicao, 'cadastros:editar'],
  ['PUT', 'condicoes/:id', cad.atualizarCondicao, 'cadastros:editar'],
  ['DELETE', 'condicoes/:id', cad.excluirCondicao, 'cadastros:editar'],

  ['GET', 'obras', obras.obras, '*'],
  ['GET', 'obras/:id/orcado', obras.orcadoDaObraComMovimentos, '*'],
  ['GET', 'insumos/busca', obras.buscarInsumosParaCompra, '*'],

  ['GET', 'solicitacoes', sol.listarSolicitacoes, 'solicitacoes:ver'],
  ['POST', 'solicitacoes', sol.criarSolicitacao, 'solicitacoes:editar'],
  ['GET', 'solicitacoes/itens-para-compra', sol.itensParaCompra, '*'],
  ['GET', 'solicitacoes/:id', sol.obterSolicitacao, 'solicitacoes:ver'],
  ['PUT', 'solicitacoes/:id', sol.atualizarSolicitacao, 'solicitacoes:editar'],
  ['POST', 'solicitacoes/:id/autorizar', sol.autorizarSolicitacao, 'solicitacoes:ver'],
  ['POST', 'solicitacoes/:id/reprovar', sol.reprovarSolicitacao, 'solicitacoes:ver'],
  ['POST', 'solicitacoes/:id/cancelar', sol.cancelarSolicitacao, 'solicitacoes:editar'],
  ['POST', 'solicitacoes/:id/itens/:itemId/encerrar', sol.encerrarItemSolicitacao, 'solicitacoes:editar'],

  ['GET', 'cotacoes', cot.listarCotacoes, 'cotacoes:ver'],
  ['POST', 'cotacoes', cot.criarCotacao, 'cotacoes:editar'],
  ['GET', 'cotacoes/:id', cot.obterCotacao, 'cotacoes:ver'],
  ['PUT', 'cotacoes/:id/mapa', cot.salvarMapa, 'cotacoes:editar'],
  ['POST', 'cotacoes/:id/itens', cot.adicionarItensCotacao, 'cotacoes:editar'],
  ['DELETE', 'cotacoes/:id/itens/:itemId', cot.removerItemCotacao, 'cotacoes:editar'],
  ['POST', 'cotacoes/:id/fornecedores', cot.adicionarFornecedorCotacao, 'cotacoes:editar'],
  ['DELETE', 'cotacoes/:id/fornecedores/:fornecedorId', cot.removerFornecedorCotacao, 'cotacoes:editar'],
  ['POST', 'cotacoes/:id/rodada', cot.novaRodada, 'cotacoes:editar'],
  ['POST', 'cotacoes/:id/convites', cot.enviarConvites, 'cotacoes:editar'],
  ['POST', 'cotacoes/:id/gerar-pedidos', cot.gerarPedidos, 'cotacoes:editar'],
  ['POST', 'cotacoes/:id/cancelar', cot.cancelarCotacao, 'cotacoes:editar'],

  ['GET', 'pedidos', ped.listarPedidos, 'pedidos:ver'],
  ['POST', 'pedidos', ped.criarPedido, 'pedidos:editar'],
  ['GET', 'pedidos/para-entrada', ped.pedidosParaEntrada, 'notas:ver'],
  ['GET', 'pedidos/:id', ped.obterPedido, 'pedidos:ver'],
  ['PUT', 'pedidos/:id', ped.atualizarPedido, 'pedidos:editar'],
  ['GET', 'pedidos/:id/pdf', ped.pdfDoPedido, 'pedidos:ver'],
  ['POST', 'pedidos/:id/autorizar', ped.autorizarPedido, 'pedidos:ver'],
  ['POST', 'pedidos/:id/reprovar', ped.reprovarPedido, 'pedidos:ver'],
  ['POST', 'pedidos/:id/cancelar', ped.cancelarPedido, 'pedidos:editar'],
  ['POST', 'pedidos/:id/encerrar', ped.encerrarPedido, 'pedidos:editar'],
  ['POST', 'pedidos/:id/enviar', ped.enviarPedido, 'pedidos:editar'],
  ['POST', 'pedidos/:id/envio-manual', ped.registrarEnvioManual, 'pedidos:editar'],

  ['GET', 'notas', nf.listarNotas, 'notas:ver'],
  ['POST', 'notas', nf.lancarNota, 'notas:editar'],
  ['GET', 'notas/:id', nf.obterNota, 'notas:ver'],
  ['POST', 'notas/:id/cancelar', nf.cancelarNota, 'notas:editar'],

  ['GET', 'contratos', ctr.listarContratos, 'contratos:ver'],
  ['POST', 'contratos', ctr.criarContrato, 'contratos:editar'],
  ['GET', 'contratos/:id', ctr.obterContrato, 'contratos:ver'],
  ['PUT', 'contratos/:id', ctr.atualizarContrato, 'contratos:editar'],
  ['POST', 'contratos/:id/autorizar', ctr.autorizarContrato, 'contratos:ver'],
  ['POST', 'contratos/:id/reprovar', ctr.reprovarContrato, 'contratos:ver'],
  ['POST', 'contratos/:id/cancelar', ctr.cancelarContrato, 'contratos:editar'],
  ['POST', 'contratos/:id/encerrar', ctr.encerrarContrato, 'contratos:editar'],
  ['POST', 'contratos/:id/aditivos', ctr.criarAditivo, 'contratos:editar'],
  ['POST', 'contratos/:id/aditivos/:aditivoId/autorizar', ctr.autorizarAditivo, 'contratos:ver'],
  ['POST', 'contratos/:id/aditivos/:aditivoId/reprovar', ctr.reprovarAditivo, 'contratos:ver'],
  ['POST', 'contratos/:id/medicoes', ctr.criarMedicao, 'contratos:editar'],
  ['GET', 'medicoes', ctr.listarMedicoes, 'contratos:ver'],
  ['GET', 'medicoes/:id', ctr.obterMedicao, 'contratos:ver'],
  ['POST', 'medicoes/:id/autorizar', ctr.autorizarMedicao, 'contratos:ver'],
  ['POST', 'medicoes/:id/reprovar', ctr.reprovarMedicao, 'contratos:ver'],
  ['POST', 'medicoes/:id/cancelar', ctr.cancelarMedicao, 'contratos:editar'],

  ['GET', 'estoque/saldos', est.listarSaldos, 'estoque:ver'],
  ['GET', 'estoque/movimentos', est.listarMovimentos, 'estoque:ver'],
  ['POST', 'estoque/saidas', est.registrarSaida, 'estoque:editar'],
  ['POST', 'estoque/entradas', est.registrarEntrada, 'estoque:editar'],
  ['POST', 'estoque/transferencias', est.transferir, 'estoque:editar'],
  ['POST', 'estoque/inventario', est.registrarInventario, 'estoque:editar'],
  ['POST', 'estoque/movimentos/:id/estornar', est.estornarMovimento, 'estoque:editar'],

  ['GET', 'titulos', fin.listarTitulos, 'financeiro:ver'],
  ['GET', 'titulos/:id', fin.obterTitulo, 'financeiro:ver'],
  ['PUT', 'titulos/:id', fin.alterarTitulo, 'financeiro:editar'],
  ['POST', 'titulos/:id/pagar', fin.pagarTitulo, 'financeiro:editar'],
  ['POST', 'titulos/:id/estornar', fin.estornarPagamento, 'financeiro:editar'],

  ['GET', 'autorizacoes', ges.listarAutorizacoes, '*'],
  ['GET', 'painel', ges.painel, '*'],
  // Início: cada parte do painel confere a própria permissão
  ['GET', 'inicio', ini.inicio, 'livre']
];

export const tratarRota = criarRoteador(ROTAS, { area: 'Suprimentos', migracao: 'db/migrations/20261017_suprimentos.sql' });
