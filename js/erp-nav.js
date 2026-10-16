/* Controla o menu lateral: recolher/expandir e troca entre as views
   (Início / Orçamento / Usuários / Backup / Suprimentos / Financeiro). Não depende do app.js.
   Os itens de Suprimentos são a mesma view com data-aba diferente (Painel, Solicitações...):
   o evento app:viewchange leva { view, aba }. window.ErpNav.abrir(view, aba) navega pelo código. */
(function () {
  'use strict';

  var sidebar = document.getElementById('appSidebar');
  var toggle = document.getElementById('btnToggleSidebar');
  var views = {
    dashboard: document.getElementById('viewDashboard'),
    orcamento: document.getElementById('viewOrcamento'),
    planejamento: document.getElementById('viewPlanejamento'),
    calendarios: document.getElementById('viewCalendarios'),
    liberacao: document.getElementById('viewLiberacao'),
    usuarios: document.getElementById('viewUsuarios'),
    backup: document.getElementById('viewBackup'),
    sinapi: document.getElementById('viewSinapi'),
    composicoes: document.getElementById('viewComposicoes'),
    insumos: document.getElementById('viewInsumos'),
    unidades: document.getElementById('viewUnidades'),
    suprimentos: document.getElementById('viewSuprimentos'),
    financeiro: document.getElementById('viewFinanceiro')
  };
  var itens = Array.prototype.slice.call(document.querySelectorAll('.app-sidebar-item[data-view]'));

  function mostrarView(nome, aba) {
    Object.keys(views).forEach(function (key) {
      if (views[key]) views[key].classList.toggle('hidden', key !== nome);
    });
    itens.forEach(function (it) {
      var mesmaView = it.dataset.view === nome;
      it.classList.toggle('ativo', mesmaView && (!it.dataset.aba || it.dataset.aba === aba));
    });
    document.dispatchEvent(new CustomEvent('app:viewchange', { detail: { view: nome, aba: aba || null } }));
  }

  // Em telas pequenas o menu cobre o conteúdo: começa recolhido e recolhe ao escolher uma opção
  var telaPequena = !!(window.matchMedia && window.matchMedia('(max-width: 860px)').matches);

  itens.forEach(function (it) {
    it.addEventListener('click', function () {
      mostrarView(it.dataset.view, it.dataset.aba);
      if (telaPequena && sidebar) sidebar.classList.add('recolhido');
    });
  });

  window.ErpNav = { abrir: mostrarView };

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
