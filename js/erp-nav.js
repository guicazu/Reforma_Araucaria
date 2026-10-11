/* Controla o menu lateral: recolher/expandir e troca entre as views
   (Orçamento / Backup). Não depende do app.js nem mexe nele. */
(function () {
  'use strict';

  var sidebar = document.getElementById('appSidebar');
  var toggle = document.getElementById('btnToggleSidebar');
  var viewOrcamento = document.getElementById('viewOrcamento');
  var viewBackup = document.getElementById('viewBackup');
  var itens = document.querySelectorAll('.app-sidebar-item[data-view]');

  function mostrarView(nome) {
    if (viewOrcamento) viewOrcamento.classList.toggle('hidden', nome !== 'orcamento');
    if (viewBackup) viewBackup.classList.toggle('hidden', nome !== 'backup');
    itens.forEach(function (it) {
      it.classList.toggle('ativo', it.dataset.view === nome);
    });
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
