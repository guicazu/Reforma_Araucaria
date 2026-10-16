// Rotas de /api/planejamento/*: cronograma e avanço físico por obra e calendários de trabalho
// (Usuários › Editar permissões, módulo Planejamento). Ver cronogramas.js e calendarios.js.
import { criarRoteador } from '../roteador.js';
import * as cro from './cronogramas.js';
import * as cal from './calendarios.js';

const ROTAS = [
  ['GET', 'obras', cro.listar, 'planejamento:ver'],
  ['GET', 'obras/:id', cro.obter, 'planejamento:ver'],
  ['PUT', 'obras/:id', cro.salvar, 'planejamento:editar'],
  ['DELETE', 'obras/:id', cro.excluir, 'planejamento:editar'],
  ['POST', 'obras/:id/avancos', cro.apontar, 'planejamento:editar'],
  ['DELETE', 'obras/:id/avancos/:servico/:data', cro.excluirApontamento, 'planejamento:editar'],
  ['GET', 'obras/:id/historico', cro.historicoDoCronograma, 'planejamento:ver'],
  ['GET', 'calendarios', cal.listar, 'planejamento:ver'],
  ['GET', 'calendarios/:id', cal.obter, 'planejamento:ver'],
  ['POST', 'calendarios', cal.criar, 'planejamento:editar'],
  ['PUT', 'calendarios/:id', cal.atualizar, 'planejamento:editar'],
  ['DELETE', 'calendarios/:id', cal.excluir, 'planejamento:editar']
];

export const tratarRota = criarRoteador(ROTAS, { area: 'Planejamento', migracao: 'db/migrations/20261019_planejamento.sql' });
