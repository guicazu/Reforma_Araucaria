/* Padrão de escrita dos nomes, seja qual for a forma digitada:
   - unidade construtiva: tudo em maiúsculas (tudoMaiusculo);
   - etapa, sub etapa, serviço, composição e insumo: só a primeira letra maiúscula
     (primeiraMaiuscula), mantendo siglas conhecidas (PVC, EPI, NBR...), códigos com
     números (AF_09/2023, CA-50, 220V) e algarismos romanos (CP II).
   Em texto digitado com minúsculas, palavras inteiras em maiúsculas são tratadas como sigla. */
(function () {
  'use strict';

  var SIGLAS = new Set([
    'ABNT', 'ABS', 'ACM', 'ART', 'BDI', 'CA', 'CAU', 'CDHU', 'CP', 'CFTV', 'CPOS', 'CPVC', 'CREA', 'DN', 'EPC', 'EPDM', 'EPI',
    'EPS', 'FGTS', 'GLP', 'INSS', 'LED', 'MDF', 'MDP', 'NBR', 'NR', 'ORSE', 'OSB', 'PEAD', 'PEX', 'PNE', 'PPR',
    'PU', 'PVC', 'QDC', 'QGBT', 'RRT', 'SINAPI', 'SPDA', 'TCPO', 'TV', 'UV', 'XPS'
  ]);
  // grafias técnicas que não são nem tudo maiúsculo nem tudo minúsculo
  var GRAFIAS = { MPA: 'MPa', KPA: 'kPa', KN: 'kN', KW: 'kW', KWH: 'kWh', KVA: 'kVA', MM: 'mm', CM: 'cm', KG: 'kg' };
  var NUMERO_E_UNIDADE = /^(\d+(?:[.,]\d+)?)(\p{L}+)$/u;
  var ROMANO = /^(?:XC|XL|L?X{0,3})(?:IX|IV|V?I{0,3})$/;
  // palavra com os conectores internos de códigos: CA-50, AF_09/2023, semi-cabinada
  var PALAVRA = /[\p{L}\p{N}_]+(?:[-/.][\p{L}\p{N}_]+)*/gu;

  function limpar(texto) {
    return String(texto == null ? '' : texto).replace(/\s+/g, ' ').trim();
  }

  function formatarPalavra(palavra, textoTodoMaiusculo) {
    var medida = palavra.match(NUMERO_E_UNIDADE);
    if (medida && GRAFIAS[medida[2].toUpperCase()]) return medida[1] + GRAFIAS[medida[2].toUpperCase()];
    // medidas como 9X19X19 viram 9x19x19; o resto do código fica como está
    if (/\d/.test(palavra)) return palavra.replace(/(\d)X(?=\d)/g, '$1x');
    var maiuscula = palavra.toLocaleUpperCase('pt-BR');
    if (SIGLAS.has(maiuscula)) return maiuscula;
    if (GRAFIAS[maiuscula]) return GRAFIAS[maiuscula];
    var digitadaEmMaiusculas = palavra === maiuscula && palavra.length > 1;
    if (digitadaEmMaiusculas && ROMANO.test(palavra)) return palavra;
    if (digitadaEmMaiusculas && !textoTodoMaiusculo) return palavra;
    return palavra.toLocaleLowerCase('pt-BR');
  }

  function primeiraMaiuscula(texto) {
    var limpo = limpar(texto);
    if (!limpo) return '';
    var todoMaiusculo = limpo === limpo.toLocaleUpperCase('pt-BR');
    var resultado = limpo.replace(PALAVRA, function (palavra) {
      return formatarPalavra(palavra, todoMaiusculo);
    });
    return resultado.replace(/\p{L}/u, function (letra) { return letra.toLocaleUpperCase('pt-BR'); });
  }

  function tudoMaiusculo(texto) {
    return limpar(texto).toLocaleUpperCase('pt-BR');
  }

  window.primeiraMaiuscula = primeiraMaiuscula;
  window.tudoMaiusculo = tudoMaiusculo;
})();
