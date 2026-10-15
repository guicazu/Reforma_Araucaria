/* Exibição de dados SINAPI (descrição, unidade e itens da composição), usada pela pesquisa de
   serviços (js/pesquisa-servico.js). A busca em si fica em /api/sinapi/buscar. */
(function () {
  'use strict';

  var MAPA_UNIDADE = {
    KG: 'kg', M: 'm', M2: 'm²', M3: 'm³', UN: 'un', H: 'h',
    L: 'l', T: 't', DIA: 'dia', MES: 'mês', CJ: 'cj', JG: 'jg',
    PAR: 'par', MIL: 'mil', CENTO: 'cento', SC25KG: 'sc 25kg', KWH: 'kwh'
  };

  function escaparHtml(valor) {
    return String(valor == null ? '' : valor).replace(/[&<>"']/g, function (caractere) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[caractere];
    });
  }

  function unidadeAmigavel(un) {
    return MAPA_UNIDADE[un] || (un || '').toLowerCase();
  }

  function formatarValor(valor) {
    if (valor === null || valor === undefined || !Number.isFinite(Number(valor))) return '—';
    return Number(valor).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  function formatarCoeficiente(valor) {
    var numero = Number(valor);
    return Number.isFinite(numero)
      ? numero.toLocaleString('pt-BR', { maximumFractionDigits: 6 })
      : '—';
  }

  // padrão de escrita do site: só a primeira letra maiúscula (js/texto.js)
  function tituloAmigavel(texto) {
    return window.primeiraMaiuscula(texto);
  }

  function renderizarItens(itens) {
    if (!Array.isArray(itens) || !itens.length) {
      return '<p class="dica">A API não retornou itens para esta composição.</p>';
    }
    var linhas = itens.map(function (item) {
      var tipo = item.tipo === 'SUB_COMPOSITION' ? 'Subcomposição' : 'Insumo';
      return '<tr>' +
        '<td>' + escaparHtml(tipo) + '</td>' +
        '<td>' + escaparHtml(item.codigo) + '</td>' +
        '<td>' + escaparHtml(tituloAmigavel(item.descricao)) + '</td>' +
        '<td>' + escaparHtml(formatarCoeficiente(item.coeficiente)) + '</td>' +
        '<td>' + escaparHtml(unidadeAmigavel(item.unidade)) + '</td>' +
        '<td>R$ ' + escaparHtml(formatarValor(item.valorUnitario)) + '</td>' +
        '<td>R$ ' + escaparHtml(formatarValor(item.valorTotal)) + '</td>' +
        '</tr>';
    }).join('');
    return '<div class="sinapi-itens-wrap"><table class="ua-table sinapi-itens">' +
      '<thead><tr><th>Tipo</th><th>Código</th><th>Insumo / subcomposição</th><th>Coeficiente</th><th>Un.</th><th>Preço unitário</th><th>Total</th></tr></thead>' +
      '<tbody>' + linhas + '</tbody></table></div>';
  }

  window.SinapiUI = { renderizarItens: renderizarItens, tituloAmigavel: tituloAmigavel, unidadeAmigavel: unidadeAmigavel };
})();
