/* Sistema de bloqueio (lock) de orçamentos + tela de liberação do admin. */
(function () {
  'use strict';

  var usuarioAtual = null;

  function escaparHtml(valor) {
    return String(valor == null ? '' : valor).replace(/[&<>"']/g, function (caractere) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[caractere];
    });
  }

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
      if (r.status === 403) return r.json().then(function () { throw new Error('Sua conta tem permissão somente para visualizar.'); });
      if (!r.ok) throw new Error('Não foi possível adquirir o bloqueio.');
      return r.json().then(function (d) {
        if (!d.ok) throw new Error(d.erro || 'Não foi possível adquirir o bloqueio.');
        return d;
      });
    });
  };

  window.liberarOrcamento = function (id) {
    return fetch('/api/bloqueios', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: id })
    }).then(function (r) {
      if (!r.ok) throw new Error('Não foi possível liberar o bloqueio.');
      return r.json();
    });
  };

  // ---- Tela de liberação do admin ----
  function carregarLiberacao() {
    var el = document.getElementById('liberacaoConteudo');
    if (!el) return;
    el.textContent = 'Carregando bloqueios...';
    fetch('/api/bloqueios')
      .then(function (r) {
        if (!r.ok) {
          if (r.status === 403) throw new Error('Seu usuário não tem permissão para acessar a liberação de bloqueios.');
          throw new Error('Não foi possível carregar os bloqueios (HTTP ' + r.status + ').');
        }
        return r.json();
      })
      .then(function (data) {
        var bloqueios = data.bloqueios || [];
        if (!bloqueios.length) {
          el.innerHTML = '<p class="dash-card-vazio">Nenhum bloqueio ativo no momento.</p>';
          return;
        }
        var linhas = bloqueios.map(function (b) {
          var id = escaparHtml(b.orcamentoId || '');
          var nome = escaparHtml(b.usuarioNome || b.usuarioEmail);
          var email = escaparHtml(b.usuarioEmail);
          var criadoEm = escaparHtml(b.criadoEm ? new Date(b.criadoEm).toLocaleString('pt-BR') : '—');
          return '<tr>' +
            '<td>' + (id || '—') + '</td>' +
            '<td>' + nome + '<br>' + email + '</td>' +
            '<td>' + criadoEm + '</td>' +
            '<td><button class="ua-btn ua-aprovar" data-bloqueio="' + id + '">Liberar</button></td>' +
          '</tr>';
        }).join('');
        el.innerHTML =
          '<table class="ua-table"><thead><tr><th>Orçamento</th><th>Bloqueado por</th><th>Desde</th><th>Ação</th></tr></thead><tbody>' +
          linhas + '</tbody></table>';
      })
      .catch(function (erro) {
        el.textContent = erro.message || 'Não foi possível carregar os bloqueios.';
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
    }).then(function (r) {
      if (!r.ok) throw new Error('O servidor recusou a liberação do bloqueio.');
      return r.json();
    }).then(function (d) {
      if (!d.ok) throw new Error(d.erro || 'Não foi possível liberar o bloqueio.');
      carregarLiberacao();
    }).catch(function (erro) {
      alert(erro.message || 'Não foi possível liberar o bloqueio.');
    });
  });

  // Revela o menu "Liberação de orçamento" para admins
  obterUsuario().then(function (u) {
    usuarioAtual = u;
    if (u && u.isAdmin) {
      var nav = document.getElementById('navLiberacao');
      if (nav) nav.classList.remove('hidden');
    }
  });

  document.addEventListener('app:viewchange', function (ev) {
    if (ev.detail && ev.detail.view === 'liberacao') carregarLiberacao();
  });

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () {});
  }
})();