/* Preenche o rodapé do menu lateral (nome + Sair), o avatar com menu
   (editar nome/telefone + sair) e a saudação do dashboard. Revela
   "Usuários" (Apoio) se a pessoa for administradora. */
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

  function montarMenuAvatar(usuario) {
    var topbarUser = document.getElementById('topbarUser');
    if (!topbarUser) return;

    var wrap = document.createElement('div');
    wrap.className = 'avatar-wrap';

    var botao = document.createElement('button');
    botao.type = 'button';
    botao.className = 'avatar';
    botao.title = usuario.nome || usuario.email;
    botao.setAttribute('aria-haspopup', 'true');
    botao.setAttribute('aria-expanded', 'false');
    var avatarIniciais = document.createElement('span');
    avatarIniciais.className = 'avatar-iniciais';
    avatarIniciais.textContent = iniciais(usuario.nome || usuario.email);
    var avatarNome = document.createElement('span');
    avatarNome.className = 'avatar-nome';
    avatarNome.textContent = usuario.nome || usuario.email;
    var avatarSeta = document.createElement('span');
    avatarSeta.className = 'avatar-seta';
    avatarSeta.setAttribute('aria-hidden', 'true');
    avatarSeta.innerHTML = window.icone ? window.icone('seta-baixo', 'ic-sm') : '';
    botao.appendChild(avatarIniciais);
    botao.appendChild(avatarNome);
    botao.appendChild(avatarSeta);

    var painel = document.createElement('div');
    painel.className = 'avatar-painel hidden';
    painel.innerHTML =
      '<label>Nome<input type="text" id="perfilNome"></label>' +
      '<label>Telefone<input type="text" id="perfilTelefone" placeholder="(00) 00000-0000"></label>' +
      '<button type="button" class="btn btn-primary btn-sm" id="btnSalvarPerfil" style="width:100%">Salvar</button>' +
      '<div class="avatar-painel-msg" id="perfilMsg"></div>' +
      '<hr>' +
      '<a class="avatar-sair" href="/api/auth/logout">Sair</a>';

    wrap.appendChild(botao);
    wrap.appendChild(painel);
    topbarUser.appendChild(wrap);

    painel.querySelector('#perfilNome').value = usuario.nome || '';
    painel.querySelector('#perfilTelefone').value = usuario.telefone || '';

    botao.addEventListener('click', function (ev) {
      ev.stopPropagation();
      painel.classList.toggle('hidden');
      botao.setAttribute('aria-expanded', String(!painel.classList.contains('hidden')));
    });
    document.addEventListener('click', function (ev) {
      if (!wrap.contains(ev.target)) {
        painel.classList.add('hidden');
        botao.setAttribute('aria-expanded', 'false');
      }
    });

    painel.querySelector('#btnSalvarPerfil').addEventListener('click', function () {
      var nome = painel.querySelector('#perfilNome').value.trim();
      var telefone = painel.querySelector('#perfilTelefone').value.trim();
      var msg = painel.querySelector('#perfilMsg');
      msg.textContent = 'Salvando...';
      fetch('/api/auth/perfil', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nome: nome, telefone: telefone })
      })
        .then(function (r) { return r.ok ? r.json() : Promise.reject(); })
        .then(function () {
          msg.textContent = 'Salvo!';
          avatarIniciais.textContent = iniciais(nome);
          avatarNome.textContent = nome;
          botao.title = nome;
          var nomeSidebar = document.querySelector('#appSidebarUser .nome');
          if (nomeSidebar) nomeSidebar.textContent = nome;
          var saud = document.getElementById('dashSaudacao');
          if (saud) saud.textContent = 'Olá, ' + (primeiroNome(nome) || nome);
          setTimeout(function () { msg.textContent = ''; }, 2000);
        })
        .catch(function () { msg.textContent = 'Erro ao salvar.'; });
    });
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

    montarMenuAvatar(usuario);

    var saudacao = document.getElementById('dashSaudacao');
    if (saudacao) {
      var primeiro = primeiroNome(usuario.nome) || usuario.email;
      saudacao.textContent = 'Olá, ' + primeiro;
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
        if (usuario) {
          window.usuarioAtual = usuario;
          document.dispatchEvent(new CustomEvent('app:profilechange'));
          montar(usuario);
        }
      })
      .catch(function () { /* sem sessão, não mostra nada */ });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', iniciar);
  } else {
    iniciar();
  }
})();
