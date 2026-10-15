/* Lista e aprova/bloqueia usuários, renderizado dentro da própria página (view "Usuários"), sem
   precisar sair para /admin.html. "Editar permissões" abre a matriz módulo × visualizar/editar
   (functions/_lib/permissoes.js); administradores têm acesso total e não usam a matriz. */
(function () {
  'use strict';

  var modulos = [];
  var usuarios = [];

  function esc(v) {
    return String(v == null ? '' : v).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function resumo(u) {
    if (u.isAdmin) return 'Acesso total (administrador)';
    var p = u.permissoes || {};
    var ve = modulos.filter(function (m) { return p[m.chave] && p[m.chave].visualizar; }).length;
    var edita = modulos.filter(function (m) { return p[m.chave] && p[m.chave].editar; }).length;
    if (!u.permissoesPersonalizadas) return 'Padrão: visualiza tudo' + (edita ? ' e edita tudo' : ', sem edição');
    if (!ve) return 'Sem acesso a nenhum módulo';
    return 'Visualiza ' + ve + ' de ' + modulos.length + ' módulos · edita ' + edita;
  }

  function desenhar(el) {
    if (!usuarios.length) {
      el.innerHTML = '<p class="dash-card-vazio">Nenhum usuário ainda.</p>';
      return;
    }
    var linhas = usuarios.map(function (u) {
      var adminBadge = u.isAdmin ? '<span class="ua-tag ua-aprovado">admin</span>' : '<span class="ua-tag ua-bloqueado">não admin</span>';
      return '<tr>' +
        '<td>' + esc(u.nome) + '<br><small>' + esc(u.email) + '</small></td>' +
        '<td>' + esc(u.provedor) + '</td>' +
        '<td><span class="ua-tag ua-' + esc(u.status) + '">' + esc(u.status) + '</span></td>' +
        '<td>' + adminBadge + '</td>' +
        '<td class="ua-permissoes">' + esc(resumo(u)) + '</td>' +
        '<td>' +
          (u.status !== 'aprovado' ? '<button class="ua-btn ua-aprovar" data-id="' + esc(u.id) + '" data-acao="aprovar" data-is-admin="' + (u.isAdmin ? 'true' : 'false') + '">Aprovar</button>' : '') +
          (u.status !== 'bloqueado' ? '<button class="ua-btn ua-bloquear" data-id="' + esc(u.id) + '" data-acao="bloquear">Bloquear</button>' : '') +
          '<button class="ua-btn ua-gestao" data-id="' + esc(u.id) + '" data-acao="toggle_admin">' + (u.isAdmin ? 'Remover admin' : 'Tornar admin') + '</button>' +
          (!u.isAdmin ? '<button class="ua-btn ua-gestao" data-id="' + esc(u.id) + '" data-acao="editar_permissoes">Editar permissões</button>' : '') +
        '</td>' +
      '</tr>';
    }).join('');
    el.innerHTML =
      '<table class="ua-table"><thead><tr><th>Usuário</th><th>Login</th><th>Status</th><th>Admin</th><th>Permissões</th><th>Ação</th></tr></thead><tbody>' +
      linhas + '</tbody></table>';
  }

  function carregar() {
    var el = document.getElementById('usuariosConteudo');
    if (!el) return;
    fetch('/api/admin/usuarios')
      .then(function (r) {
        if (r.status === 403) throw new Error('Você não é administrador.');
        return r.json();
      })
      .then(function (data) {
        modulos = data.modulos || [];
        usuarios = data.usuarios || [];
        desenhar(el);
      })
      .catch(function (e) {
        el.innerHTML = '<p class="dash-card-vazio">' + esc(e.message) + '</p>';
      });
  }

  /* ---------- janela de permissões ---------- */
  function abrirPermissoes(u) {
    var p = u.permissoes || {};
    var grupo = null;
    var linhas = '';
    modulos.forEach(function (m) {
      if (m.grupo !== grupo) {
        grupo = m.grupo;
        linhas += '<tr class="perm-grupo"><td colspan="3">' + esc(grupo) + '</td></tr>';
      }
      var x = p[m.chave] || {};
      linhas += '<tr data-modulo="' + esc(m.chave) + '"><td>' + esc(m.nome) + (m.detalhe ? '<small>' + esc(m.detalhe) + '</small>' : '') + '</td>' +
        '<td class="col-check"><input type="checkbox" data-campo="visualizar"' + (x.visualizar ? ' checked' : '') + ' aria-label="Visualizar ' + esc(m.nome) + '"></td>' +
        '<td class="col-check">' + (m.soVisualizar ? '<span title="Este módulo é só de consulta">—</span>'
          : '<input type="checkbox" data-campo="editar"' + (x.editar ? ' checked' : '') + ' aria-label="Editar ' + esc(m.nome) + '">') + '</td></tr>';
    });
    var dlg = document.createElement('dialog');
    dlg.className = 'modal modal-permissoes';
    dlg.innerHTML = '<h3>Permissões de ' + esc(u.nome || u.email) + '</h3>' +
      '<p class="perm-nota">Marque o que esta pessoa pode visualizar e editar em cada módulo. Editar inclui visualizar. ' +
      'Usuários, Liberação e Base SINAPI são só de administradores; quem autoriza compras é definido nas alçadas (Suprimentos › Cadastros).' +
      (u.permissoesPersonalizadas ? '' : ' <b>Hoje vale o padrão antigo</b>: ao salvar, passa a valer esta matriz.') + '</p>' +
      '<div class="perm-wrap"><table class="perm-tabela"><thead><tr><th>Módulo</th>' +
      '<th class="col-check"><label>Visualizar<input type="checkbox" data-todos="visualizar" title="Marcar ou desmarcar todos"></label></th>' +
      '<th class="col-check"><label>Editar<input type="checkbox" data-todos="editar" title="Marcar ou desmarcar todos"></label></th></tr></thead>' +
      '<tbody>' + linhas + '</tbody></table></div>' +
      '<p class="perm-nota" data-erro style="color:var(--vermelho);margin:10px 0 0"></p>' +
      '<div class="modal-actions"><button type="button" class="btn btn-ghost" data-fechar>Cancelar</button>' +
      '<button type="button" class="btn btn-primary" data-salvar>Salvar permissões</button></div>';
    document.body.appendChild(dlg);

    function caixas(campo) { return dlg.querySelectorAll('tbody input[data-campo="' + campo + '"]'); }
    function atualizarTodos() {
      ['visualizar', 'editar'].forEach(function (campo) {
        var lista = Array.prototype.slice.call(caixas(campo));
        var todos = dlg.querySelector('[data-todos="' + campo + '"]');
        var marcados = lista.filter(function (c) { return c.checked; }).length;
        todos.checked = lista.length > 0 && marcados === lista.length;
        todos.indeterminate = marcados > 0 && marcados < lista.length;
      });
    }
    dlg.addEventListener('change', function (ev) {
      var c = ev.target;
      if (c.dataset.todos) {
        caixas(c.dataset.todos).forEach(function (x) { x.checked = c.checked; });
        if (c.dataset.todos === 'editar' && c.checked) caixas('visualizar').forEach(function (x) { x.checked = true; });
        if (c.dataset.todos === 'visualizar' && !c.checked) caixas('editar').forEach(function (x) { x.checked = false; });
      } else if (c.dataset.campo) {
        var linha = c.closest('tr');
        var v = linha.querySelector('[data-campo="visualizar"]');
        var e = linha.querySelector('[data-campo="editar"]');
        if (c === e && e.checked) v.checked = true;       // editar inclui visualizar
        if (c === v && !v.checked && e) e.checked = false; // sem visualizar não edita
      }
      atualizarTodos();
    });
    function fechar() { if (dlg.open) dlg.close(); dlg.remove(); }
    dlg.addEventListener('cancel', function (ev) { ev.preventDefault(); fechar(); });
    dlg.querySelector('[data-fechar]').addEventListener('click', fechar);
    dlg.querySelector('[data-salvar]').addEventListener('click', function (ev) {
      var botao = ev.currentTarget;
      var permissoes = {};
      dlg.querySelectorAll('tbody tr[data-modulo]').forEach(function (tr) {
        var e = tr.querySelector('[data-campo="editar"]');
        permissoes[tr.dataset.modulo] = { visualizar: tr.querySelector('[data-campo="visualizar"]').checked, editar: Boolean(e && e.checked) };
      });
      botao.disabled = true;
      fetch('/api/admin/usuarios', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: u.id, acao: 'permissoes', permissoes: permissoes })
      }).then(function (r) {
        if (!r.ok) throw new Error('Não foi possível salvar as permissões (erro ' + r.status + ').');
        return r.json();
      }).then(function (data) {
        modulos = data.modulos || modulos;
        usuarios = data.usuarios || usuarios;
        fechar();
        desenhar(document.getElementById('usuariosConteudo'));
      }).catch(function (e) {
        dlg.querySelector('[data-erro]').textContent = e.message;
        botao.disabled = false;
      });
    });
    atualizarTodos();
    dlg.showModal();
  }

  document.addEventListener('click', function (ev) {
    var container = document.getElementById('usuariosConteudo');
    var btn = ev.target.closest('[data-acao][data-id]');
    if (!btn || !container || !container.contains(btn)) return;

    if (btn.dataset.acao === 'editar_permissoes') {
      var u = usuarios.filter(function (x) { return x.id === btn.dataset.id; })[0];
      if (u) abrirPermissoes(u);
      return;
    }

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

  // A lista só é pedida para administradores (os demais nem veem o item no menu)
  document.addEventListener('app:profilechange', function () {
    if (window.usuarioAtual && window.usuarioAtual.isAdmin) carregar();
  });
})();
