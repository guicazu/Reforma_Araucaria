// Referência SINAPI usada em todo o site nas consultas à SINPRES: São Paulo, regime desonerado.
// Para mudar estado ou regime, altere só aqui (e os textos "São Paulo · Desonerado" das telas).
export const SINAPI_ESTADO = 'SP';
export const SINAPI_DESONERADO = 'true';
export const SINAPI_PARAMS = { state: SINAPI_ESTADO, is_desonerated: SINAPI_DESONERADO };
