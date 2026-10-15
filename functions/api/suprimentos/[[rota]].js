// Suprimentos no padrão do SIENGE: todas as rotas em functions/_lib/suprimentos/rotas.js
import { tratarRota } from '../../_lib/suprimentos/rotas.js';

export function onRequest(contexto) {
  return tratarRota(contexto);
}
