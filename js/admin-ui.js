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
          var adminBadge = u.isAdmin ? '<span class="ua-tag ua-aprovado">admin</span>' : '<span class="ua-tag ua-bloqueado">não admin</span>';
          var editorBadge = u.isAdmin || u.podeEditar ? '<span class="ua-tag ua-aprovado">pode editar</span>' : '<span class="ua-tag ua-bloqueado">somente visualizar</span>';
          return '<tr>' +
            '<td>' + u.nome + '<br><small>' + u.email + '</small></td>' +
            '<td>' + u.provedor + '</td>' +
            '<td><span class="ua-tag ua-' + u.status + '">' + u.status + '</span></td>' +
            '<td>' + adminBadge + '</td>' +
            '<td>' + editorBadge + '</td>' +
            '<td>' +
              (u.status !== 'aprovado' ? '<button class="ua-btn ua-aprovar" data-id="' + u.id + '" data-acao="aprovar" data-is-admin="' + (u.isAdmin ? 'true' : 'false') + '">Aprovar</button>' : '') +
              (u.status !== 'bloqueado' ? '<button class="ua-btn ua-bloquear" data-id="' + u.id + '" data-acao="bloquear">Bloquear</button>' : '') +
              '<button class="ua-btn ua-gestao" data-id="' + u.id + '" data-acao="toggle_admin">' + (u.isAdmin ? 'Remover admin' : 'Tornar admin') + '</button>' +
              (!u.isAdmin ? '<button class="ua-btn ua-gestao" data-id="' + u.id + '" data-acao="toggle_edicao">' + (u.podeEditar ? 'Remover edição' : 'Permitir edição') + '</button>' : '') +
            '</td>' +
          '</tr>';
        }).join('');
        el.innerHTML =
          '<table class="ua-table"><thead><tr><th>Usuário</th><th>Login</th><th>Status</th><th>Admin</th><th>Acesso ao orçamento</th><th>Ação</th></tr></thead><tbody>' +
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

    var payload = { id: btn.dataset.id, acao: btn.dataset.acao };
    if (btn.dataset.acao === 'aprovar') {
      payload.isAdmin = btn.dataset.isAdmin === 'true';
    }

    fetch('/api/admin/usuarios', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    }).then(carregar);
  });

  document.addEventListener('app:viewchange', function (ev) {
    if (ev.detail && ev.detail.view === 'usuarios') carregar();
  });

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', carregar);
  } else {
    carregar();
  }
})();
