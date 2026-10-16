// Planejamento (cronograma e avanço físico das obras): rotas em functions/_lib/planejamento/rotas.js
import { tratarRota } from '../../_lib/planejamento/rotas.js';

export function onRequest(contexto) {
  return tratarRota(contexto);
}
