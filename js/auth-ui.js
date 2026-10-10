/* Barra de usuário: nome logado, botão de sair, e painel admin (se aplicável).
   Não depende do resto do app.js — só injeta um elemento fixo no canto da tela. */
(function () {
  'use strict';

  function criarEstilos() {
    var css = [
      '#auth-toolbar {',
      '  position: fixed; top: 12px; right: 12px; z-index: 9999;',
      '  display: flex; align-items: center; gap: .5rem;',
      '  background: #fefefe; border: 1px solid #6f8789; border-radius: 8px;',
      '  padding: .4rem .6rem; font-family: system-ui, sans-serif; font-size: .8rem;',
      '  box-shadow: 0 2px 8px rgba(5,45,51,.12);',
      '}',
      '#auth-toolbar .nome {',
      '  color: #1a3f44; margin-right: .25rem; max-width: 160px;',
      '  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;',
      '}',
      '#auth-toolbar a {',
      '  text-decoration: none; padding: .3rem .6rem; border-radius: 6px;',
      '  font-weight: 600; white-space: nowrap;',
      '}',
      '#auth-toolbar a.sair { color: #6f8789; border: 1px solid #6f8789; }',
      '#auth-toolbar a.sair:hover { background: #f5f8f7; }',
      '#auth-toolbar a.admin { color: #052d33; background: #aadf3d; }',
      '#auth-toolbar a.admin:hover { background: #b1e445; }',
      '@media (max-width: 480px) { #auth-toolbar .nome { display: none; } }'
    ].join('\n');
    var style = document.createElement('style');
    style.textContent = css;
    document.head.appendChild(style);
  }

  function montarToolbar(usuario) {
    criarEstilos();
    var div = document.createElement('div');
    div.id = 'auth-toolbar';

    var nome = document.createElement('span');
    nome.className = 'nome';
    nome.textContent = usuario.nome || usuario.email;
    div.appendChild(nome);

    if (usuario.isAdmin) {
      var admin = document.createElement('a');
      admin.className = 'admin';
      admin.href = '/admin.html';
      admin.textContent = 'Painel Administração';
      div.appendChild(admin);
    }

    var sair = document.createElement('a');
    sair.className = 'sair';
    sair.href = '/api/auth/logout';
    sair.textContent = 'Sair';
    div.appendChild(sair);

    document.body.appendChild(div);
  }

  function iniciar() {
    fetch('/api/auth/me')
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (usuario) {
        if (usuario) montarToolbar(usuario);
      })
      .catch(function () { /* sem sessão, não mostra nada */ });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', iniciar);
  } else {
    iniciar();
  }
})();
