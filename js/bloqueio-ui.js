/* Sistema de bloqueio (lock) de orçamentos + tela de liberação do admin. */
(function () {
  'use strict';

  var usuarioAtual = null;

  function obterUsuario() {
    return fetch('/api/auth/me')
      .then(function (r) { return r.ok ? r.json() : null; })
      .catch(function () { return null; });
  }

  // ---- Bloqueio ao abrir para edição ----
  window.bloquearOrcamento = function (id) {
    return fetch('/api/bloqueios', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: id })
    }).then(function (r) {
      if (r.status === 409) return r.json().then(function (d) { throw new Error(d.bloqueadoPor || 'orçamento bloqueado'); });
      return r.json();
    });
  };

  window.liberarOrcamento = function (id) {
    return fetch('/api/bloqueios', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: id })
    }).then(function (r) { return r.json(); });
  };

  // ---- Tela de liberação do admin ----
  function carregarLiberacao() {
    var el = document.getElementById('liberacaoConteudo');
    if (!el) return;
    fetch('/api/bloqueios')
      .then(function (r) { return r.json(); })
      .then(function (data) {
        var bloqueios = data.bloqueios || [];
        if (!bloqueios.length) {
          el.innerHTML = '<p class="dash-card-vazio">Nenhum orçamento travado no momento.</p>';
          return;
        }
        var linhas = bloqueios.map(function (b) {
          return '<tr>' +
            '<td>' + (b.orcamentoId || '—') + '</td>' +
            '<td>' + (b.usuarioNome || b.usuarioEmail) + '<br>' + b.usuarioEmail + '</td>' +
            '<td>' + (b.criadoEm ? new Date(b.criadoEm).toLocaleString('pt-BR') : '—') + '</td>' +
            '<td><button class="ua-btn ua-aprovar" data-bloqueio="' + b.orcamentoId + '">Liberar</button></td>' +
          '</tr>';
        }).join('');
        el.innerHTML =
          '<table class="ua-table"><thead><tr><th>Orçamento</th><th>Bloqueado por</th><th>Desde</th><th>Ação</th></tr></thead><tbody>' +
          linhas + '</tbody></table>';
      })
      .catch(function () {
        el.innerHTML = '<p class="dash-card-vazio">Não foi possível carregar os bloqueios.</p>';
      });
  }

  document.addEventListener('click', function (ev) {
    var btn = ev.target.closest('[data-bloqueio]');
    if (!btn) return;
    var id = btn.getAttribute('data-bloqueio');
    fetch('/api/admin/bloqueios', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: id })
    }).then(function () { carregarLiberacao(); });
  });

  // Revela o menu "Liberação de orçamento" para admins
  obterUsuario().then(function (u) {
    usuarioAtual = u;
    if (u && u.isAdmin) {
      var nav = document.getElementById('navLiberacao');
      if (nav) nav.classList.remove('hidden');
    }
  });

  // Dispara o carregamento quando a view for aberta
  document.addEventListener('click', function (ev) {
    var item = ev.target.closest('[data-view="liberacao"]');
    if (item) carregarLiberacao();
  });

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () {});
  }
})();