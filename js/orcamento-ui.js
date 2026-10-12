/* Alterna entre "lista de orçamentos" e "editor do orçamento" dentro
   da view Orçamento. Não mexe no estado do app.js, só mostra/esconde. */
(function () {
  'use strict';

  var view = document.getElementById('viewOrcamento');
  var navOrcamento = document.querySelector('.app-sidebar-item[data-view="orcamento"]');
  var lista = document.getElementById('listaOrcamentos');
  var btnNovo = document.getElementById('btnNovoOrcamento');
  var btnNovoVazio = document.getElementById('btnNovoVazio');
  var btnVoltar = document.getElementById('btnVoltarLista');

  function irPara(modo) {
    if (view) view.dataset.modo = modo;
  }

  if (navOrcamento) {
    navOrcamento.addEventListener('click', function () { irPara('lista'); });
  }
  if (lista) {
    lista.addEventListener('click', function (ev) {
      var item = ev.target.closest('.orcamento-item');
      if (item && ev.target.closest('[data-acao="ver-orcamento"], [data-acao="editar-orcamento"]')) irPara('editor');
    });
  }
  if (btnNovo) btnNovo.addEventListener('click', function () { irPara('editor'); });
  if (btnNovoVazio) btnNovoVazio.addEventListener('click', function () { irPara('editor'); });
  if (btnVoltar) btnVoltar.addEventListener('click', function () { irPara('lista'); });
})();
