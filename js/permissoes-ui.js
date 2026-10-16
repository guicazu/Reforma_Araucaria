/* Aplica as permissões por módulo (Usuários › Editar permissões) na tela: esconde do menu o que a
   pessoa não pode visualizar (e os grupos que ficarem vazios) e marca o <body> para esconder os
   botões de edição do Backup (que não tem controle próprio). O servidor confere
   tudo de novo; aqui é só para não oferecer o que seria recusado. Window.Permissoes.pode(modulo,
   acao) serve às outras telas; '*suprimentos' = vê algum módulo de Suprimentos ou Financeiro. */
(function () {
  'use strict';

  var SUPRIMENTOS = ['solicitacoes', 'cotacoes', 'pedidos', 'notas', 'contratos', 'estoque', 'acompanhamento', 'cadastros', 'financeiro'];

  function permissoes() {
    var u = window.usuarioAtual;
    return u && u.permissoes ? u.permissoes : null;
  }

  function pode(modulo, acao) {
    var p = permissoes();
    if (!p) return true; // perfil ainda não carregado: não esconde nada (o servidor recusa se for o caso)
    if (modulo === '*suprimentos') return SUPRIMENTOS.some(function (m) { return p[m] && p[m].visualizar; });
    var x = p[modulo];
    return Boolean(x && (acao === 'editar' ? x.editar : x.visualizar));
  }

  function aplicar() {
    if (!permissoes()) return;
    document.querySelectorAll('.app-sidebar-item[data-modulo]').forEach(function (item) {
      item.classList.toggle('sem-permissao', !pode(item.dataset.modulo, 'visualizar'));
    });
    document.querySelectorAll('.app-sidebar-group').forEach(function (grupo) {
      var itens = grupo.querySelectorAll('.app-sidebar-item');
      var algum = Array.prototype.some.call(itens, function (it) {
        return !it.classList.contains('sem-permissao') && !it.classList.contains('hidden');
      });
      grupo.classList.toggle('sem-permissao', itens.length > 0 && !algum);
    });
    document.body.classList.toggle('sem-editar-backup', !pode('backup', 'editar'));
    // a tela aberta deixou de ser permitida: volta ao Início
    if (document.querySelector('.app-sidebar-item.ativo.sem-permissao') && window.ErpNav) window.ErpNav.abrir('dashboard');
  }

  window.Permissoes = { pode: pode, aplicar: aplicar };
  // depois do auth-ui.js revelar os itens de administrador
  document.addEventListener('app:profilechange', function () { setTimeout(aplicar, 0); });
})();
