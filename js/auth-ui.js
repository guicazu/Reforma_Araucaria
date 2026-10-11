/* Preenche o rodapé do menu lateral com nome do usuário + botão Sair,
   e revela o item "Usuários" (Apoio) se a pessoa for administradora. */
(function () {
  'use strict';

  function montar(usuario) {
    var container = document.getElementById('appSidebarUser');
    if (!container) return;

    var nome = document.createElement('div');
    nome.className = 'nome';
    nome.textContent = usuario.nome || usuario.email;
    container.appendChild(nome);

    var sair = document.createElement('a');
    sair.className = 'sair';
    sair.href = '/api/auth/logout';
    sair.textContent = 'Sair';
    container.appendChild(sair);

    if (usuario.isAdmin) {
      var navUsuarios = document.getElementById('navUsuarios');
      if (navUsuarios) navUsuarios.classList.remove('hidden');
    }
  }

  function iniciar() {
    fetch('/api/auth/me')
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (usuario) {
        if (usuario) montar(usuario);
      })
      .catch(function () { /* sem sessão, não mostra nada */ });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', iniciar);
  } else {
    iniciar();
  }
})();
