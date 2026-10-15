// Portal do fornecedor (rota PÚBLICA, liberada em functions/_middleware.js): resposta de cotação e
// confirmação de pedido pelo link com token. Ver functions/_lib/suprimentos/portal.js
import { tratarPortal } from '../../_lib/suprimentos/portal.js';

export function onRequest(contexto) {
  return tratarPortal(contexto);
}
