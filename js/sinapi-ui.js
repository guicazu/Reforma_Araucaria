/* Busca de composições SINAPI por código exato ou descrição. */
(function () {
  'use strict';

  var MAPA_UNIDADE = {
    KG: 'kg', M: 'm', M2: 'm²', M3: 'm³', UN: 'un', H: 'h',
    L: 'l', T: 't', DIA: 'dia', MES: 'mês', CJ: 'cj', JG: 'jg',
    PAR: 'par', MIL: 'mil', CENTO: 'cento', SC25KG: 'sc 25kg', KWH: 'kwh'
  };

  function escaparHtml(valor) {
    return String(valor == null ? '' : valor).replace(/[&<>"']/g, function (caractere) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[caractere];
    });
  }

  function unidadeAmigavel(un) {
    return MAPA_UNIDADE[un] || (un || '').toLowerCase();
  }

  function formatarValor(valor) {
    if (valor === null || valor === undefined || !Number.isFinite(Number(valor))) return '—';
    return Number(valor).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  function formatarCoeficiente(valor) {
    var numero = Number(valor);
    return Number.isFinite(numero)
      ? numero.toLocaleString('pt-BR', { maximumFractionDigits: 6 })
      : '—';
  }

  function tituloAmigavel(texto) {
    if (!texto) return '';
    return texto.toLowerCase().replace(/(^|\s|\/|-)\p{L}/gu, function (m) {
      return m.toUpperCase();
    });
  }

  function iniciar() {
    // Usado também pela pesquisa de serviços (js/pesquisa-servico.js)
    window.SinapiUI = { renderizarItens: renderizarItens, tituloAmigavel: tituloAmigavel, unidadeAmigavel: unidadeAmigavel };
    var fCodigo = document.getElementById('fCodigoSinapi');
    var fNome = document.getElementById('fNome');
    var fUnidade = document.getElementById('fUnidadeMedida');
    var fValor = document.getElementById('fValor');
    var fCatalogoItem = document.getElementById('fCatalogoItem');
    var fCatalogoTipo = document.getElementById('fCatalogoTipo');
    var fCatalogoId = document.getElementById('fCatalogoId');
    var statusServico = document.getElementById('sinapiStatus');
    var btnAbrir = document.getElementById('btnAbrirBuscaSinapi');
    var modal = document.getElementById('modalBuscaSinapi');
    var btnFechar = document.getElementById('btnFecharBuscaSinapi');
    var resultadosEl = document.getElementById('buscaSinapiResultados');
    var buscaStatus = document.getElementById('sinapiBuscaStatus');
    var campoCodigo = document.getElementById('buscaCodigo');
    var btnBuscarCodigo = document.getElementById('btnBuscarCodigo');
    var incs = [document.getElementById('buscaInc1')];
    var excs = [document.getElementById('buscaExc1')];

    if (!fCodigo || !modal || !resultadosEl) return;

    var timer = null;
    var buscaId = 0;
    var resultadosPorCodigo = new Map();
    var detalhesPorCodigo = new Map();

    function atualizarStatus(el, texto, classe) {
      if (!el) return;
      el.textContent = texto;
      el.className = 'sinapi-status' + (classe ? ' ' + classe : '');
    }

    function aplicarResultado(resultado) {
      if (document.getElementById('modalServico').open && window.selecionarComposicaoSinapiServico) {
        return window.selecionarComposicaoSinapiServico(resultado);
      }
      if (fCatalogoItem) fCatalogoItem.value = '';
      if (fCatalogoTipo) fCatalogoTipo.value = '';
      if (fCatalogoId) fCatalogoId.value = '';
      fCodigo.value = resultado.codigo;
      fNome.value = tituloAmigavel(resultado.descricao);
      if (fUnidade) fUnidade.value = unidadeAmigavel(resultado.unidade);
      if (fValor && resultado.valor !== null) fValor.value = formatarValor(resultado.valor);
      atualizarStatus(statusServico, 'Composição encontrada' +
        (resultado.referencia ? ' · Referência ' + resultado.referencia : ''), 'ok');
      return true;
    }

    function renderizarItens(itens) {
      if (!Array.isArray(itens) || !itens.length) {
        return '<p class="dica">A API não retornou itens para esta composição.</p>';
      }
      var linhas = itens.map(function (item) {
        var tipo = item.tipo === 'SUB_COMPOSITION' ? 'Subcomposição' : 'Insumo';
        return '<tr>' +
          '<td>' + escaparHtml(tipo) + '</td>' +
          '<td>' + escaparHtml(item.codigo) + '</td>' +
          '<td>' + escaparHtml(tituloAmigavel(item.descricao)) + '</td>' +
          '<td>' + escaparHtml(formatarCoeficiente(item.coeficiente)) + '</td>' +
          '<td>' + escaparHtml(unidadeAmigavel(item.unidade)) + '</td>' +
          '<td>R$ ' + escaparHtml(formatarValor(item.valorUnitario)) + '</td>' +
          '<td>R$ ' + escaparHtml(formatarValor(item.valorTotal)) + '</td>' +
          '</tr>';
      }).join('');
      return '<div class="sinapi-itens-wrap"><table class="ua-table sinapi-itens">' +
        '<thead><tr><th>Tipo</th><th>Código</th><th>Insumo / subcomposição</th><th>Coeficiente</th><th>Un.</th><th>Preço unitário</th><th>Total</th></tr></thead>' +
        '<tbody>' + linhas + '</tbody></table></div>';
    }

    function buscarDetalhes(botao, codigo) {
      var linha = botao.closest('.sinapi-resultado-item');
      var detalhesEl = linha && linha.querySelector('.sinapi-composicao-detalhes');
      if (!detalhesEl) return;
      if (!detalhesEl.hidden) {
        detalhesEl.hidden = true;
        botao.textContent = 'Ver composição';
        return;
      }
      detalhesEl.hidden = false;
      botao.textContent = 'Ocultar composição';
      if (detalhesPorCodigo.has(codigo)) {
        detalhesEl.innerHTML = renderizarItens(detalhesPorCodigo.get(codigo));
        return;
      }
      detalhesEl.textContent = 'Carregando itens da composição...';
      fetch('/api/sinapi/composicao?codigo=' + encodeURIComponent(codigo))
        .then(function (resposta) {
          return resposta.json().then(function (data) {
            if (!resposta.ok) {
              throw new Error(data.erro === 'sinapi_indisponivel'
                ? 'O serviço SINAPI está indisponível.'
                : 'Não foi possível consultar os itens da composição (HTTP ' + resposta.status + ').');
            }
            return data;
          });
        })
        .then(function (data) {
          if (!data.encontrado) throw new Error('Não foi possível carregar os itens desta composição.');
          detalhesPorCodigo.set(codigo, data.itens || []);
          detalhesEl.innerHTML = renderizarItens(data.itens);
        })
        .catch(function (erro) {
          detalhesEl.textContent = erro.message || 'Não foi possível carregar a composição.';
        });
    }

    function renderizarResultados(lista, mensagem) {
      resultadosPorCodigo.clear();
      if (!lista.length) {
        resultadosEl.innerHTML = '<p class="dica">' + escaparHtml(mensagem || 'Nenhum resultado. Informe um código ou termos de busca.') + '</p>';
        return;
      }
      lista.forEach(function (resultado) {
        resultadosPorCodigo.set(String(resultado.codigo), resultado);
      });
      resultadosEl.innerHTML = lista.map(function (resultado) {
        var codigo = escaparHtml(resultado.codigo);
        var descricao = escaparHtml(tituloAmigavel(resultado.descricao));
        var itens = '';
        if (Array.isArray(resultado.itens)) detalhesPorCodigo.set(String(resultado.codigo), resultado.itens);
        return '<article class="sinapi-resultado-item" data-codigo="' + codigo + '">' +
          '<div class="sinapi-resultado-cabecalho">' +
            '<div class="sinapi-resultado-info">' +
              '<span class="sinapi-codigo">' + codigo + '</span>' +
              '<span class="sinapi-resultado-descricao">' + descricao + '</span>' +
              '<span class="sinapi-un">Unidade: ' + escaparHtml(unidadeAmigavel(resultado.unidade)) +
                (resultado.referencia ? ' · Referência: ' + escaparHtml(resultado.referencia) : '') + '</span>' +
            '</div>' +
            '<div class="sinapi-resultado-preco"><small>Preço unitário</small><strong>R$ ' +
              escaparHtml(formatarValor(resultado.valor)) + '</strong></div>' +
          '</div>' +
          '<div class="sinapi-resultado-acoes">' +
            '<button type="button" class="btn btn-ghost btn-sm" data-detalhes="' + codigo + '">Ver composição</button>' +
            '<button type="button" class="btn btn-primary btn-sm" data-usar-codigo="' + codigo + '">Usar composição</button>' +
          '</div>' +
          '<div class="sinapi-composicao-detalhes" hidden>' + itens + '</div>' +
        '</article>';
      }).join('');
    }

    function buscarPorCodigo(codigoInformado) {
      var codigo = (codigoInformado || (campoCodigo && campoCodigo.value) || '').trim();
      if (!codigo) {
        atualizarStatus(buscaStatus, 'Digite o código SINAPI para buscar.', 'erro');
        return;
      }
      clearTimeout(timer);
      var buscaAtual = ++buscaId;
      atualizarStatus(buscaStatus, 'Buscando código ' + codigo + '...', '');
      resultadosEl.innerHTML = '<p class="dica">Buscando composição SINAPI...</p>';
      fetch('/api/sinapi/composicao?codigo=' + encodeURIComponent(codigo))
        .then(function (resposta) {
          return resposta.json().then(function (data) {
            if (!resposta.ok) {
              throw new Error(data.erro === 'sinapi_indisponivel'
                ? 'O serviço SINAPI está indisponível.'
                : 'Consulta do código falhou (HTTP ' + resposta.status + ').');
            }
            return data;
          });
        })
        .then(function (data) {
          if (buscaAtual !== buscaId) return;
          if (!data.encontrado) {
            atualizarStatus(buscaStatus, 'Código ' + codigo + ' não encontrado na tabela de São Paulo, desonerada.', 'erro');
            renderizarResultados([], 'Confira o código ou tente a busca por descrição.');
            return;
          }
          atualizarStatus(buscaStatus, 'Composição encontrada · ' + data.itens.length + ' item(ns)', 'ok');
          renderizarResultados([data]);
        })
        .catch(function (erro) {
          if (buscaAtual !== buscaId) return;
          atualizarStatus(buscaStatus, erro.message || 'Não foi possível consultar o SINAPI agora.', 'erro');
          renderizarResultados([], 'Tente novamente em instantes.');
        });
    }

    function abrirBusca() {
      buscaId++;
      clearTimeout(timer);
      resultadosPorCodigo.clear();
      detalhesPorCodigo.clear();
      if (campoCodigo) campoCodigo.value = '';
      incs.concat(excs).forEach(function (campo) { if (campo) campo.value = ''; });
      var filtros = modal.querySelector('.sinapi-filtros');
      if (filtros) filtros.open = false;
      atualizarStatus(buscaStatus, '', '');
      if (!modal.open) modal.showModal();
      if (campoCodigo) campoCodigo.focus();
      renderizarResultados([]);
    }
    if (btnAbrir) btnAbrir.addEventListener('click', abrirBusca);
    if (btnFechar) btnFechar.addEventListener('click', function () { modal.close(); });
    modal.addEventListener('click', function (ev) {
      if (ev.target === modal) modal.close();
    });

    if (btnBuscarCodigo) btnBuscarCodigo.addEventListener('click', function () { buscarPorCodigo(); });
    if (campoCodigo) {
      campoCodigo.addEventListener('input', function () {
        clearTimeout(timer);
        buscaId++;
        incs.concat(excs).forEach(function (campo) { if (campo) campo.value = ''; });
        var codigo = campoCodigo.value.trim();
        if (!codigo) {
          atualizarStatus(buscaStatus, '', '');
          renderizarResultados([]);
          return;
        }
        timer = setTimeout(function () { buscarPorCodigo(codigo); }, 450);
      });
      campoCodigo.addEventListener('keydown', function (ev) {
        if (ev.key === 'Enter') {
          ev.preventDefault();
          buscarPorCodigo();
        }
      });
    }

    function executarBuscaPorDescricao() {
      var buscaAtual = ++buscaId;
      var termos = incs.map(function (campo) { return campo ? campo.value.trim() : ''; }).filter(Boolean);
      var excluir = excs.map(function (campo) { return campo ? campo.value.trim() : ''; })
        .filter(Boolean).join(',');
      if (!termos.length || termos.join(' ').length < 3) {
        renderizarResultados([], 'Digite pelo menos 3 caracteres nos termos "Deve conter".');
        atualizarStatus(buscaStatus, '', '');
        return;
      }
      atualizarStatus(buscaStatus, 'Buscando composições...', '');
      resultadosEl.innerHTML = '<p class="dica">Buscando...</p>';
      var url = '/api/sinapi/buscar?q=' + encodeURIComponent(termos.join(' ')) +
        (excluir ? '&excluir=' + encodeURIComponent(excluir) : '');
      fetch(url)
        .then(function (resposta) {
          return resposta.json().then(function (data) {
            if (!resposta.ok) {
              throw new Error(data.erro === 'sinapi_indisponivel'
                ? 'O serviço SINAPI está indisponível.'
                : 'Consulta SINAPI falhou (HTTP ' + resposta.status + ').');
            }
            return data;
          });
        })
        .then(function (data) {
          if (buscaAtual !== buscaId) return;
          if (data.erro) throw new Error(data.erro === 'sinapi_indisponivel'
            ? 'O serviço SINAPI está indisponível.'
            : 'O serviço SINAPI não conseguiu concluir a busca.');
          var resultados = Array.isArray(data.resultados) ? data.resultados : [];
          atualizarStatus(buscaStatus, resultados.length + ' resultado(s) encontrado(s).', 'ok');
          renderizarResultados(resultados);
        })
        .catch(function (erro) {
          if (buscaAtual !== buscaId) return;
          atualizarStatus(buscaStatus, erro.message || 'Não foi possível consultar o SINAPI agora.', 'erro');
          renderizarResultados([], 'Tente novamente em instantes.');
        });
    }

    function agendarBuscaPorDescricao() {
      clearTimeout(timer);
      buscaId++;
      if (campoCodigo) campoCodigo.value = '';
      if (incs.concat(excs).every(function (campo) { return !campo || !campo.value.trim(); })) {
        atualizarStatus(buscaStatus, '', '');
        renderizarResultados([]);
        return;
      }
      timer = setTimeout(executarBuscaPorDescricao, 350);
    }
    incs.concat(excs).forEach(function (campo) {
      if (campo) campo.addEventListener('input', agendarBuscaPorDescricao);
    });

    window.limparBuscaSinapi = function () {
      clearTimeout(timer);
      buscaId++;
      if (campoCodigo) campoCodigo.value = '';
      incs.concat(excs).forEach(function (campo) { if (campo) campo.value = ''; });
      var filtros = modal.querySelector('.sinapi-filtros');
      if (filtros) filtros.open = false;
      atualizarStatus(statusServico, '', '');
      atualizarStatus(buscaStatus, '', '');
      renderizarResultados([]);
    };

    resultadosEl.addEventListener('click', function (ev) {
      var botaoUsar = ev.target.closest('[data-usar-codigo]');
      var botaoDetalhes = ev.target.closest('[data-detalhes]');
      if (botaoUsar) {
        var resultado = resultadosPorCodigo.get(botaoUsar.getAttribute('data-usar-codigo'));
        if (!resultado) {
          atualizarStatus(buscaStatus, 'O resultado expirou. Faça a busca novamente.', 'erro');
          return;
        }
        if (!aplicarResultado(resultado)) {
          atualizarStatus(buscaStatus, 'Não foi possível aplicar esta composição ao serviço.', 'erro');
          return;
        }
        modal.close();
      } else if (botaoDetalhes) {
        buscarDetalhes(botaoDetalhes, botaoDetalhes.getAttribute('data-detalhes'));
      }
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', iniciar);
  } else {
    iniciar();
  }
})();
