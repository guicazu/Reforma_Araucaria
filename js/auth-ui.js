/* Preenche o rodapé do menu lateral (nome + Sair), o avatar do topo
   e a saudação do dashboard. Revela "Usuários" (Apoio) se for admin. */
(function () {
  'use strict';

  function iniciais(nome) {
    if (!nome) return '?';
    var partes = nome.trim().split(/\s+/);
    var ini = partes[0][0] || '';
    if (partes.length > 1) ini += partes[partes.length - 1][0] || '';
    return ini.toUpperCase();
  }

  function primeiroNome(nome) {
    if (!nome) return '';
    return nome.trim().split(/\s+/)[0];
  }

  function montar(usuario) {
    var container = document.getElementById('appSidebarUser');
    if (container) {
      var nome = document.createElement('div');
      nome.className = 'nome';
      nome.textContent = usuario.nome || usuario.email;
      container.appendChild(nome);

      var sair = document.createElement('a');
      sair.className = 'sair';
      sair.href = '/api/auth/logout';
      sair.textContent = 'Sair';
      container.appendChild(sair);
    }

    var topbarUser = document.getElementById('topbarUser');
    if (topbarUser) {
      var avatar = document.createElement('div');
      avatar.className = 'avatar';
      avatar.title = usuario.nome || usuario.email;
      avatar.textContent = iniciais(usuario.nome || usuario.email);
      topbarUser.appendChild(avatar);
    }

    var saudacao = document.getElementById('dashSaudacao');
    if (saudacao) {
      var primeiro = primeiroNome(usuario.nome) || usuario.email;
      saudacao.textContent = 'Olá, ' + primeiro + '! 👋';
    }

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
