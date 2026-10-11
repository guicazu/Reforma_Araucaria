/* Lista e aprova/bloqueia usuários, renderizado dentro da própria
   página (view "Usuários"), sem precisar sair para /admin.html. */
(function () {
  'use strict';

  function carregar() {
    var el = document.getElementById('usuariosConteudo');
    if (!el) return;
    fetch('/api/admin/usuarios')
      .then(function (r) {
        if (r.status === 403) throw new Error('Você não é administrador.');
        return r.json();
      })
      .then(function (data) {
        var usuarios = data.usuarios || [];
        if (!usuarios.length) {
          el.innerHTML = '<p class="dash-card-vazio">Nenhum usuário ainda.</p>';
          return;
        }
        var linhas = usuarios.map(function (u) {
          return '<tr>' +
            '<td>' + u.nome + '<br><small>' + u.email + '</small></td>' +
            '<td>' + u.provedor + '</td>' +
            '<td><span class="ua-tag ua-' + u.status + '">' + u.status + '</span></td>' +
            '<td>' +
              (u.status !== 'aprovado' ? '<button class="ua-btn ua-aprovar" data-id="' + u.id + '" data-acao="aprovar">Aprovar</button>' : '') +
              (u.status !== 'bloqueado' ? '<button class="ua-btn ua-bloquear" data-id="' + u.id + '" data-acao="bloquear">Bloquear</button>' : '') +
            '</td>' +
          '</tr>';
        }).join('');
        el.innerHTML =
          '<table class="ua-table"><thead><tr><th>Usuário</th><th>Login</th><th>Status</th><th>Ação</th></tr></thead><tbody>' +
          linhas + '</tbody></table>';
      })
      .catch(function (e) {
        el.innerHTML = '<p class="dash-card-vazio">' + e.message + '</p>';
      });
  }

  document.addEventListener('click', function (ev) {
    var container = document.getElementById('usuariosConteudo');
    var btn = ev.target.closest('[data-acao][data-id]');
    if (!btn || !container || !container.contains(btn)) return;
    fetch('/api/admin/usuarios', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: btn.dataset.id, acao: btn.dataset.acao })
    }).then(carregar);
  });

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', carregar);
  } else {
    carregar();
  }
})();
