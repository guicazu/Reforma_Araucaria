/* Controla o menu lateral: recolher/expandir e troca entre as views
   (Início / Orçamento / Usuários / Backup). Não depende do app.js. */
(function () {
  'use strict';

  var sidebar = document.getElementById('appSidebar');
  var toggle = document.getElementById('btnToggleSidebar');
  var views = {
    dashboard: document.getElementById('viewDashboard'),
    orcamento: document.getElementById('viewOrcamento'),
    liberacao: document.getElementById('viewLiberacao'),
    usuarios: document.getElementById('viewUsuarios'),
    backup: document.getElementById('viewBackup'),
    composicoes: document.getElementById('viewComposicoes'),
    insumos: document.getElementById('viewInsumos'),
    unidades: document.getElementById('viewUnidades')
  };
  var itens = document.querySelectorAll('.app-sidebar-item[data-view]');

  function mostrarView(nome) {
    Object.keys(views).forEach(function (key) {
      if (views[key]) views[key].classList.toggle('hidden', key !== nome);
    });
    itens.forEach(function (it) {
      it.classList.toggle('ativo', it.dataset.view === nome);
    });
    document.dispatchEvent(new CustomEvent('app:viewchange', { detail: { view: nome } }));
  }

  itens.forEach(function (it) {
    it.addEventListener('click', function () {
      mostrarView(it.dataset.view);
    });
  });

  if (toggle && sidebar) {
    toggle.addEventListener('click', function () {
      sidebar.classList.toggle('recolhido');
      try {
        localStorage.setItem('erp_sidebar_recolhido', sidebar.classList.contains('recolhido') ? '1' : '0');
      } catch (e) {}
    });
    try {
      if (localStorage.getItem('erp_sidebar_recolhido') === '1') {
        sidebar.classList.add('recolhido');
      }
    } catch (e) {}
  }
})();
