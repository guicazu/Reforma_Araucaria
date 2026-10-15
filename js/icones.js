/* Ícones monocromáticos de traço: os desenhos ficam no sprite SVG do index.html.
   icone('salvar') devolve o <svg> pronto para usar em HTML gerado pelo JS. */
window.icone = function (nome, classe) {
  return '<svg class="ic' + (classe ? ' ' + classe : '') + '" aria-hidden="true" focusable="false"><use href="#i-' + nome + '"/></svg>';
};
