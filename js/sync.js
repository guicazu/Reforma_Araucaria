/* Sincronização dos orçamentos com Cloudflare D1 */
(function () {
  'use strict';
  var API_URL = '/api/orcamentos';

  function api(opts) {
    return fetch(API_URL, Object.assign(
      { headers: { 'Content-Type': 'application/json' } },
      opts
    )).then(function (res) {
      if (!res.ok) throw new Error('API retornou ' + res.status);
      return res.json();
    });
  }

  function temEstado() { return typeof window.state !== 'undefined' && window.state; }

  // Envia o snapshot completo dos orçamentos
  window.salvarNoServidor = function () {
    if (!temEstado()) return Promise.resolve();
    return api({ method: 'POST', body: JSON.stringify({ orcamentos: window.state.orcamentos }) });
  };

  // Busca o snapshot do servidor
  window.buscarServidor = function () {
    return api({ method: 'GET' });
  };

  // 1) Toda vez que o app chamar salvar(), sincroniza também com o servidor
  var salvarOriginal = null;
  if (typeof window.salvar === 'function') {
    salvarOriginal = window.salvar;
    window.salvar = function () {
      var resultado = salvarOriginal.apply(this, arguments);
      window.salvarNoServidor().catch(function () { /* offline: dados continuam no local */ });
      return resultado;
    };
  }

  // 2) Ao carregar: servidor vence; se vazio, sobe os dados locais
  function sincronizarAoCarregar() {
    window.buscarServidor()
      .then(function (resp) {
        var remotos = resp && resp.dados;
        if (remotos && remotos.length) {
          window.state.orcamentos = remotos;
          window.state.ativoId = remotos[0].id || null;
          if (typeof salvarOriginal === 'function') salvarOriginal();
          if (window.renderTudo) window.renderTudo();
        } else if (window.state.orcamentos && window.state.orcamentos.length) {
          window.salvarNoServidor().catch(function () {});
        }
      })
      .catch(function () { /* servidor indisponível; usa dados locais */ });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', sincronizarAoCarregar);
  } else {
    sincronizarAoCarregar();
  }
})();
