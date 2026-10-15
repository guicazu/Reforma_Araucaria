/* Meses da base SINAPI própria (importados em "Base SINAPI"), do mais recente para o mais antigo.
   Usado pelo orçamento (referência de cada versão), pela pesquisa de serviços, pelos relatórios e
   pelas buscas SINAPI das telas Composições e Insumos. Lista vazia: a base ainda não foi importada
   e as rotas usam a API pública. */
(function () {
  'use strict';

  var MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
  var meses = [];
  var carregadoEm = 0;
  var pedido = null;

  function nome(mes) {
    var p = String(mes || '').split('-');
    return p.length === 2 && MESES[Number(p[1]) - 1] ? MESES[Number(p[1]) - 1] + '/' + p[0] : (mes || '');
  }
  function abreviado(mes) {
    var p = String(mes || '').split('-');
    return p.length === 2 ? p[1] + '/' + p[0].slice(2) : (mes || '');
  }

  // Recarrega no máximo a cada minuto (a importação de um mês novo aparece logo)
  function carregar(forcar) {
    if (!forcar && pedido) return pedido;
    if (!forcar && carregadoEm && Date.now() - carregadoEm < 60000) return Promise.resolve(meses);
    pedido = fetch('/api/sinapi/referencias')
      .then(function (r) { return r.ok ? r.json() : { referencias: [] }; })
      .then(function (d) {
        meses = (d.referencias || []).filter(function (r) { return r.status === 'ok'; })
          .map(function (r) { return r.mes; }).sort().reverse();
        carregadoEm = Date.now();
        return meses;
      })
      .catch(function () { return meses; })
      .finally(function () { pedido = null; });
    return pedido;
  }

  // Preenche um <select> com os meses; sem meses, esconde o seletor
  function preencherSelect(select, selecionado) {
    if (!select) return;
    var atual = selecionado || select.value || meses[0] || '';
    select.innerHTML = meses.map(function (mes, i) {
      return '<option value="' + mes + '">' + nome(mes) + (i === 0 ? ' (mais recente)' : '') + '</option>';
    }).join('');
    if (meses.indexOf(atual) >= 0) select.value = atual;
    select.hidden = !meses.length;
    Array.from(select.labels || []).forEach(function (l) { if (l !== select.parentNode) l.hidden = !meses.length; });
  }

  window.ReferenciasSinapi = {
    carregar: carregar,
    lista: function () { return meses.slice(); },
    maisRecente: function () { return meses[0] || null; },
    nome: nome,
    abreviado: abreviado,
    preencherSelect: preencherSelect
  };
})();
