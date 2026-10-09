/* ─────────────────────────────────────────────────────────────
   js/sync.js — Sincronização dos orçamentos com Cloudflare D1
   REGRA: carregar DEPOIS do app.js (ver edição no index.html).
   Fonte da verdade: servidor. localStorage continua como cache
   offline (o app continua funcionando sem internet).
   ───────────────────────────────────────────────────────────── */
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
  function temSalvar() { return typeof window.salvar === 'function'; }

  // Envia o snapshot completo (todos os orçamentos) para o servidor
  window.salvarNoServidor = function () {
    if (!temEstado()) return Promise.resolve();
    return api({ method: 'POST', body: JSON.stringify({ dados: window.state.orcamentos }) });
  };

  // Busca o snapshot do servidor
  window.buscarServidor = function () {
    return api({ method: 'GET' });
  };

  // 1) Toda vez que o app chamar salvar(), sincroniza também com o servidor
  var salvarOriginal = null;
  if (temSalvar()) {
    salvarOriginal = window.salvar;
    window.salvar = function () {
      var resultado = salvarOriginal.apply(this, arguments);
      window.salvarNoServidor().catch(function (e) {
        console.warn('Sincronização com o servidor falhou (dados continuam salvos localmente).', e);
      });
      return resultado;
    };
  }

  // 2) Ao carregar: servidor vence; se o servidor estiver vazio,
  //    sobe os dados locais (migração automática no primeiro uso)
  function sincronizarAoCarregar() {
    window.buscarServidor()
      .then(function (resp) {
        var remotos = resp && resp.dados;
        if (!temEstado()) return;
        var locais = window.state.orcamentos || [];

        if (remotos && remotos.length) {
          // Servidor tem dados -> usa como fonte da verdade
          window.state.orcamentos = remotos;
          window.state.ativoId = remotos[0].id || null;
          if (temSalvar()) salvarOriginal();
          if (window.renderTudo) window.renderTudo();
        } else if (locais.length) {
          // Primeiro acesso com dados locais -> sobe para o servidor
          window.salvarNoServidor().catch(function (e) {
            console.warn('Não foi possível subir os dados locais.', e);
          });
        }
      })
      .catch(function (e) {
        console.warn('Servidor indisponível no carregamento; usando dados locais.', e);
      });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', sincronizarAoCarregar);
  } else {
    sincronizarAoCarregar();
  }
})();
