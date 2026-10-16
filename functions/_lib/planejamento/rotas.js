// Rotas de /api/planejamento/*: cronograma e avanço físico por obra (Usuários › Editar permissões,
// módulo Planejamento). Ver functions/_lib/planejamento/cronogramas.js.
import { criarRoteador } from '../roteador.js';
import * as cro from './cronogramas.js';

const ROTAS = [
  ['GET', 'obras', cro.listar, 'planejamento:ver'],
  ['GET', 'obras/:id', cro.obter, 'planejamento:ver'],
  ['PUT', 'obras/:id', cro.salvar, 'planejamento:editar'],
  ['DELETE', 'obras/:id', cro.excluir, 'planejamento:editar'],
  ['POST', 'obras/:id/avancos', cro.apontar, 'planejamento:editar'],
  ['DELETE', 'obras/:id/avancos/:servico/:data', cro.excluirApontamento, 'planejamento:editar'],
  ['GET', 'obras/:id/historico', cro.historicoDoCronograma, 'planejamento:ver']
];

export const tratarRota = criarRoteador(ROTAS, { area: 'Planejamento', migracao: 'db/migrations/20261019_planejamento.sql' });
