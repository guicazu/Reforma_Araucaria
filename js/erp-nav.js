/* Controla o menu lateral: recolher/expandir e troca entre as views
   (Início / Orçamento / Usuários / Backup / Suprimentos). Não depende do app.js. */
(function () {
  'use strict';

  var sidebar = document.getElementById('appSidebar');
  var toggle = document.getElementById('btnToggleSidebar');
  var views = {
    dashboard: document.getElementById('viewDashboard'),
    orcamento: document.getElementById('viewOrcamento'),
    planejamento: document.getElementById('viewPlanejamento'),
    liberacao: document.getElementById('viewLiberacao'),
    usuarios: document.getElementById('viewUsuarios'),
    backup: document.getElementById('viewBackup'),
    composicoes: document.getElementById('viewComposicoes'),
    insumos: document.getElementById('viewInsumos'),
    unidades: document.getElementById('viewUnidades'),
    suprimentos: document.getElementById('viewSuprimentos')
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

  // Em telas pequenas o menu cobre o conteúdo: começa recolhido e recolhe ao escolher uma opção
  var telaPequena = !!(window.matchMedia && window.matchMedia('(max-width: 860px)').matches);

  itens.forEach(function (it) {
    it.addEventListener('click', function () {
      mostrarView(it.dataset.view);
      if (telaPequena && sidebar) sidebar.classList.add('recolhido');
    });
  });

  if (toggle && sidebar) {
    toggle.addEventListener('click', function () {
      sidebar.classList.toggle('recolhido');
      if (telaPequena) return; // no celular, abrir/fechar é momentâneo
      try {
        localStorage.setItem('erp_sidebar_recolhido', sidebar.classList.contains('recolhido') ? '1' : '0');
      } catch (e) {}
    });
    var recolher = telaPequena;
    try {
      if (!telaPequena) recolher = localStorage.getItem('erp_sidebar_recolhido') === '1';
    } catch (e) {}
    if (recolher) sidebar.classList.add('recolhido');
  }
})();
