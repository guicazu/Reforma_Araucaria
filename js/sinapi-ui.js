/* Busca de composições SINAPI: campo de código direto + pop-up de busca
   avançada (palavras que devem/não devem aparecer). Não bloqueia nada —
   a pessoa sempre pode digitar um nome livre se preferir. */
(function () {
  'use strict';

  var MAPA_UNIDADE = {
    KG: 'kg', M: 'm', M2: 'm²', M3: 'm³', UN: 'un', H: 'h',
    L: 'l', T: 't', DIA: 'dia', MES: 'mês', CJ: 'cj', JG: 'jg',
    PAR: 'par', MIL: 'mil', CENTO: 'cento', SC25KG: 'sc 25kg', KWH: 'kwh'
  };

  function unidadeAmigavel(un) {
    return MAPA_UNIDADE[un] || (un || '').toLowerCase();
  }

  function formatarValor(v) {
    if (v === null || v === undefined || isNaN(v)) return '';
    return v.toFixed(2).replace('.', ',');
  }

  function tituloAmigavel(texto) {
    if (!texto) return '';
    return texto.toLowerCase().replace(/(^|\s|\/|-)\p{L}/gu, function (m) {
      return m.toUpperCase();
    });
  }

  function iniciar() {
    var fCodigo = document.getElementById('fCodigoSinapi');
    var fNome = document.getElementById('fNome');
    var fUnidade = document.getElementById('fUnidadeMedida');
    var fValor = document.getElementById('fValor');
    var status = document.getElementById('sinapiStatus');
    var btnAbrir = document.getElementById('btnAbrirBuscaSinapi');
    var modal = document.getElementById('modalBuscaSinapi');
    var btnFechar = document.getElementById('btnFecharBuscaSinapi');
    var resultadosEl = document.getElementById('buscaSinapiResultados');
    var incs = ['buscaInc1', 'buscaInc2', 'buscaInc3'].map(function (id) {
      return document.getElementById(id);
    });
    var excs = ['buscaExc1', 'buscaExc2'].map(function (id) {
      return document.getElementById(id);
    });

    if (!fCodigo || !modal) return;

    function aplicarResultado(r) {
      fCodigo.value = r.codigo;
      fNome.value = tituloAmigavel(r.descricao);
      if (fUnidade) fUnidade.value = unidadeAmigavel(r.unidade);
      if (fValor && r.valor !== null) fValor.value = formatarValor(r.valor);
      if (status) { status.textContent = '✓ composição encontrada'; status.className = 'sinapi-status ok'; }
    }

    // ---- Busca por código direto ----
    function buscarPorCodigo() {
      var codigo = fCodigo.value.trim();
      if (!codigo) { if (status) status.textContent = ''; return; }
      if (status) { status.textContent = 'Buscando...'; status.className = 'sinapi-status'; }
      fetch('/api/sinapi/composicao?codigo=' + encodeURIComponent(codigo))
        .then(function (r) { return r.json(); })
        .then(function (data) {
          if (data.encontrado) {
            aplicarResultado(data);
          } else if (status) {
            status.textContent = 'Código não encontrado — pode escrever o nome manualmente';
            status.className = 'sinapi-status erro';
          }
        })
        .catch(function () {
          if (status) { status.textContent = 'Não foi possível consultar o SINAPI agora'; status.className = 'sinapi-status erro'; }
        });
    }

    fCodigo.addEventListener('blur', buscarPorCodigo);
    fCodigo.addEventListener('keydown', function (ev) {
      if (ev.key === 'Enter') { ev.preventDefault(); buscarPorCodigo(); }
    });

    // ---- Pop-up de busca avançada ----
    if (btnAbrir) {
      btnAbrir.addEventListener('click', function () {
        modal.showModal();
        renderizarResultados([]);
      });
    }
    if (btnFechar) {
      btnFechar.addEventListener('click', function () { modal.close(); });
    }
    modal.addEventListener('click', function (ev) {
      if (ev.target === modal) modal.close();
    });

    var timer = null;
    function agendarBusca() {
      clearTimeout(timer);
      timer = setTimeout(executarBusca, 350);
    }
    incs.concat(excs).forEach(function (campo) {
      if (campo) campo.addEventListener('input', agendarBusca);
    });

    function executarBusca() {
      var termo = incs.map(function (c) { return c ? c.value.trim() : ''; })
        .filter(Boolean).join(' ');
      var excluir = excs.map(function (c) { return c ? c.value.trim() : ''; })
        .filter(Boolean).join(',');

      if (termo.length < 3) {
        renderizarResultados([], 'Digite ao menos 3 letras em algum campo "Deve conter".');
        return;
      }

      resultadosEl.innerHTML = '<p class="dica">Buscando...</p>';
      var url = '/api/sinapi/buscar?q=' + encodeURIComponent(termo) +
        (excluir ? '&excluir=' + encodeURIComponent(excluir) : '');

      fetch(url)
        .then(function (r) { return r.json(); })
        .then(function (data) { renderizarResultados(data.resultados || []); })
        .catch(function () { renderizarResultados([], 'Não foi possível consultar o SINAPI agora.'); });
    }

    function renderizarResultados(lista, mensagem) {
      if (!lista.length) {
        resultadosEl.innerHTML = '<p class="dica">' + (mensagem || 'Nenhum resultado ainda. Preencha os campos acima.') + '</p>';
        return;
      }
      resultadosEl.innerHTML = lista.map(function (r) {
        var descricao = tituloAmigavel(r.descricao);
        return '<div class="sinapi-resultado-item">' +
          '<div class="sinapi-resultado-info">' +
            '<span class="sinapi-codigo">' + r.codigo + '</span> ' + descricao +
            '<span class="sinapi-un">' + unidadeAmigavel(r.unidade) +
              (r.valor !== null ? ' · R$ ' + formatarValor(r.valor) : '') + '</span>' +
          '</div>' +
          '<div class="sinapi-resultado-acoes">' +
            '<button type="button" class="btn btn-ghost btn-xs" data-copiar="' + r.codigo + '">Copiar código</button>' +
            '<button type="button" class="btn btn-primary btn-xs" data-usar=\'' + JSON.stringify(r).replace(/'/g, '&#39;') + '\'>Usar</button>' +
          '</div>' +
        '</div>';
      }).join('');
    }

    resultadosEl.addEventListener('click', function (ev) {
      var btnUsar = ev.target.closest('[data-usar]');
      var btnCopiar = ev.target.closest('[data-copiar]');
      if (btnUsar) {
        var r = JSON.parse(btnUsar.getAttribute('data-usar'));
        aplicarResultado(r);
        modal.close();
      } else if (btnCopiar) {
        var codigo = btnCopiar.getAttribute('data-copiar');
        if (navigator.clipboard) {
          navigator.clipboard.writeText(codigo).then(function () {
            var original = btnCopiar.textContent;
            btnCopiar.textContent = 'Copiado!';
            setTimeout(function () { btnCopiar.textContent = original; }, 1500);
          });
        }
      }
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', iniciar);
  } else {
    iniciar();
  }
})();
