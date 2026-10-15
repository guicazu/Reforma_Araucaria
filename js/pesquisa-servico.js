/* Pesquisa de serviços (lupa da nova linha do orçamento): escolhe a base, busca por palavras
   em qualquer ordem (mais palavras encontradas primeiro) e exclui termos separados por vírgula.
   SINAPI vem de /api/sinapi/buscar; composições próprias, do catálogo já carregado. */
(function () {
  'use strict';

  // Mesmas regras de /api/sinapi/buscar, para próprias e SINAPI serem ordenadas juntas
  var PALAVRAS_IGNORADAS = ['a', 'o', 'as', 'os', 'ao', 'aos', 'de', 'da', 'do', 'das', 'dos', 'e', 'em',
    'no', 'na', 'nos', 'nas', 'um', 'uma', 'para', 'por', 'com', 'ou', 'que'];
  var CHAVE_BASE = 'ibuild_pesquisa_servico_base';
  var MAX_RESULTADOS = 60;
  var fmtBRL = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });

  var modal, campoPalavras, campoExcluir, statusEl, resultadosEl;
  var aoEscolher = null;
  var buscaId = 0;
  var timer = null;
  var opcoes = new Map();   // chave do resultado -> item exibido
  var detalhes = new Map(); // código SINAPI -> itens da composição

  function normalizar(texto) {
    return String(texto || '').normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase();
  }
  function esc(valor) {
    return String(valor == null ? '' : valor).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function extrairPalavras(texto) {
    var palavras = [];
    normalizar(texto).split(/[\s,;]+/).forEach(function (palavra) {
      if (palavra.length >= 2 && PALAVRAS_IGNORADAS.indexOf(palavra) < 0 && palavras.indexOf(palavra) < 0) palavras.push(palavra);
    });
    return palavras;
  }
  function extrairExclusoes(texto) {
    return String(texto || '').split(',').map(function (termo) {
      return normalizar(termo).trim().replace(/\s+/g, ' ');
    }).filter(Boolean);
  }
  // Quantas palavras aparecem no texto e o quão cedo (para desempatar)
  function pontuar(texto, palavras) {
    var normal = normalizar(texto);
    var encontradas = 0;
    var posicao = 0;
    palavras.forEach(function (palavra) {
      var indice = normal.indexOf(palavra);
      if (indice >= 0) { encontradas++; posicao += indice; }
    });
    return { encontradas: encontradas, posicao: posicao, tamanho: normal.length };
  }
  // Marca as palavras encontradas, sem diferenciar maiúsculas nem acentos
  function destacar(texto, palavras) {
    var caracteres = Array.from(String(texto || ''));
    var normal = '';
    var origem = []; // origem[i] = caractere original do i-ésimo caractere normalizado
    caracteres.forEach(function (c, i) {
      var n = normalizar(c);
      for (var k = 0; k < n.length; k++) { normal += n[k]; origem.push(i); }
    });
    var marcado = caracteres.map(function () { return false; });
    palavras.forEach(function (palavra) {
      for (var de = normal.indexOf(palavra); de >= 0; de = normal.indexOf(palavra, de + palavra.length)) {
        for (var k = de; k < de + palavra.length; k++) marcado[origem[k]] = true;
      }
    });
    var html = '';
    var aberto = false;
    caracteres.forEach(function (c, i) {
      if (marcado[i] !== aberto) { html += marcado[i] ? '<mark>' : '</mark>'; aberto = marcado[i]; }
      html += esc(c);
    });
    return html + (aberto ? '</mark>' : '');
  }
  function titulo(texto) {
    return window.SinapiUI ? window.SinapiUI.tituloAmigavel(texto) : String(texto || '');
  }
  function unidadeSinapi(unidade) {
    return window.SinapiUI ? window.SinapiUI.unidadeAmigavel(unidade) : String(unidade || '');
  }
  function numero(valor) {
    var n = typeof valor === 'number' ? valor : parseFloat(String(valor == null ? '' : valor).replace(/\./g, '').replace(',', '.'));
    return Number.isFinite(n) ? n : null;
  }

  function lerBase() { try { return localStorage.getItem(CHAVE_BASE) || 'todas'; } catch (e) { return 'todas'; } }
  function salvarBase(base) { try { localStorage.setItem(CHAVE_BASE, base); } catch (e) { /* só conveniência */ } }
  function baseSelecionada() {
    var marcada = modal.querySelector('input[name="pesquisaBase"]:checked');
    return marcada ? marcada.value : 'todas';
  }
  function definirStatus(texto, classe) {
    statusEl.textContent = texto;
    statusEl.className = 'sinapi-status' + (classe ? ' ' + classe : '');
  }

  function buscarProprias(palavras, exclusoes) {
    var catalogo = window.Composicoes ? window.Composicoes.carregar() : [];
    return catalogo.filter(function (c) { return c.base === 'propria' || !c.base; }).map(function (c) {
      var texto = [c.nome, c.codigo, c.codigoReferencia].filter(Boolean).join(' ');
      var normal = normalizar(texto);
      if (exclusoes.some(function (termo) { return normal.indexOf(termo) >= 0; })) return null;
      var p = pontuar(texto, palavras);
      if (!p.encontradas) return null;
      return {
        chave: 'propria:' + c.id, base: 'propria', codigo: c.codigo || '', descricao: c.nome || '',
        unidade: c.unidade || 'un', valor: numero(c.valorUnitario),
        detalhe: c.codigoReferencia ? 'Baseada no SINAPI ' + c.codigoReferencia : '',
        encontradas: p.encontradas, posicao: p.posicao, tamanho: p.tamanho,
        escolha: { tipo: 'propria', composicao: c }
      };
    }).filter(Boolean);
  }
  function itemSinapi(resultado, palavras) {
    var p = pontuar(resultado.descricao, palavras);
    return {
      chave: 'sinapi:' + resultado.codigo, base: 'sinapi', codigo: String(resultado.codigo),
      descricao: titulo(resultado.descricao), unidade: unidadeSinapi(resultado.unidade), valor: resultado.valor,
      detalhe: resultado.referencia ? 'Referência ' + resultado.referencia : '',
      encontradas: p.encontradas, posicao: p.posicao, tamanho: p.tamanho,
      escolha: { tipo: 'sinapi', resultado: resultado }
    };
  }
  // Mais palavras encontradas primeiro; no empate, quem tem preço (pode ser usado), composição
  // própria, quem traz as palavras mais cedo e a descrição mais curta
  function ordenar(lista) {
    return lista.slice().sort(function (a, b) {
      return b.encontradas - a.encontradas ||
        (a.valor == null ? 1 : 0) - (b.valor == null ? 1 : 0) ||
        (a.base === 'propria' ? 0 : 1) - (b.base === 'propria' ? 0 : 1) ||
        a.posicao - b.posicao || a.tamanho - b.tamanho;
    });
  }

  function renderizar(lista, palavras, mensagemVazia) {
    opcoes.clear();
    if (!lista.length) {
      resultadosEl.innerHTML = mensagemVazia ? '<p class="dica">' + esc(mensagemVazia) + '</p>' : '';
      return;
    }
    resultadosEl.innerHTML = lista.map(function (item) {
      opcoes.set(item.chave, item);
      var semPreco = item.valor == null;
      return '<article class="sinapi-resultado-item pesquisa-item">' +
        '<div class="sinapi-resultado-cabecalho">' +
          '<div class="sinapi-resultado-info">' +
            '<span class="sinapi-codigo">' + esc(item.codigo || '—') + '</span>' +
            '<span class="tag-base tag-base-' + item.base + '">' + (item.base === 'sinapi' ? 'SINAPI' : 'Própria') + '</span>' +
            (palavras.length > 1 ? '<span class="pesquisa-palavras">' + item.encontradas + ' de ' + palavras.length + ' palavras</span>' : '') +
            '<span class="sinapi-resultado-descricao">' + destacar(item.descricao, palavras) + '</span>' +
            '<span class="sinapi-un">Unidade: ' + esc(item.unidade) + (item.detalhe ? ' · ' + esc(item.detalhe) : '') + '</span>' +
          '</div>' +
          '<div class="sinapi-resultado-preco"><small>Preço unitário</small><strong>' +
            (semPreco ? '—' : esc(fmtBRL.format(item.valor))) + '</strong></div>' +
        '</div>' +
        '<div class="sinapi-resultado-acoes">' +
          (item.base === 'sinapi' ? '<button type="button" class="btn btn-ghost btn-sm" data-ver="' + esc(item.codigo) + '">Ver composição</button>' : '') +
          '<button type="button" class="btn btn-primary btn-sm" data-usar="' + esc(item.chave) + '"' +
            (semPreco ? ' disabled title="Composição sem preço unitário"' : '') + '>Usar</button>' +
        '</div>' +
        '<div class="sinapi-composicao-detalhes" hidden></div>' +
      '</article>';
    }).join('');
  }
  function concluir(lista, palavras, aviso) {
    var ordenada = ordenar(lista).slice(0, MAX_RESULTADOS);
    renderizar(ordenada, palavras, aviso ? '' : 'Nenhum serviço encontrado com essas palavras.');
    var resumo = ordenada.length ? ordenada.length + (ordenada.length === 1 ? ' serviço encontrado.' : ' serviços encontrados.') : '';
    definirStatus([resumo, aviso].filter(Boolean).join(' '), aviso ? 'erro' : (ordenada.length ? 'ok' : ''));
  }

  async function pesquisar() {
    clearTimeout(timer);
    var id = ++buscaId;
    var palavras = extrairPalavras(campoPalavras.value);
    var exclusoes = extrairExclusoes(campoExcluir.value);
    if (!palavras.some(function (palavra) { return palavra.length >= 3; })) {
      definirStatus('', '');
      renderizar([], palavras, campoPalavras.value.trim() ? 'Digite pelo menos uma palavra com 3 letras ou mais.' : '');
      return;
    }
    var base = baseSelecionada();
    var lista = base === 'sinapi' ? [] : buscarProprias(palavras, exclusoes);
    if (base === 'propria') { concluir(lista, palavras, ''); return; }
    // As próprias aparecem na hora; o SINAPI completa a lista quando responder
    if (lista.length) renderizar(ordenar(lista), palavras, '');
    definirStatus('Buscando no SINAPI…', '');
    var aviso = '';
    var sinapi = [];
    try {
      var resposta = await fetch('/api/sinapi/buscar?q=' + encodeURIComponent(campoPalavras.value) +
        '&excluir=' + encodeURIComponent(campoExcluir.value));
      var dados = await resposta.json();
      if (!resposta.ok) throw new Error('sinapi');
      sinapi = (dados.resultados || []).map(function (r) { return itemSinapi(r, palavras); });
    } catch (e) {
      aviso = 'Não foi possível consultar o SINAPI agora.';
    }
    if (id !== buscaId) return; // a pessoa continuou digitando
    concluir(lista.concat(sinapi), palavras, aviso);
  }
  function agendar() {
    clearTimeout(timer);
    timer = setTimeout(pesquisar, 350);
  }

  function verComposicao(botao, codigo) {
    var area = botao.closest('.pesquisa-item').querySelector('.sinapi-composicao-detalhes');
    if (!area.hidden) { area.hidden = true; botao.textContent = 'Ver composição'; return; }
    area.hidden = false;
    botao.textContent = 'Ocultar composição';
    var mostrar = function (itens) {
      area.innerHTML = window.SinapiUI ? window.SinapiUI.renderizarItens(itens) : '';
    };
    if (detalhes.has(codigo)) { mostrar(detalhes.get(codigo)); return; }
    area.textContent = 'Carregando itens da composição…';
    fetch('/api/sinapi/composicao?codigo=' + encodeURIComponent(codigo))
      .then(function (resposta) {
        return resposta.json().then(function (dados) {
          if (!resposta.ok || !dados.encontrado) throw new Error('sinapi');
          return dados;
        });
      })
      .then(function (dados) { detalhes.set(codigo, dados.itens || []); mostrar(dados.itens || []); })
      .catch(function () { area.textContent = 'Não foi possível carregar os itens desta composição.'; });
  }
  function aoClicarResultado(ev) {
    var usar = ev.target.closest('[data-usar]');
    var ver = ev.target.closest('[data-ver]');
    if (usar) {
      var item = opcoes.get(usar.getAttribute('data-usar'));
      if (!item || !aoEscolher) return;
      if (aoEscolher(item.escolha) === false) {
        definirStatus('Não foi possível incluir este serviço. Feche a janela e tente de novo.', 'erro');
        return;
      }
      modal.close();
    } else if (ver) {
      verComposicao(ver, ver.getAttribute('data-ver'));
    }
  }

  function iniciar() {
    modal = document.getElementById('modalPesquisaServico');
    if (!modal) return;
    campoPalavras = document.getElementById('pesquisaPalavras');
    campoExcluir = document.getElementById('pesquisaExcluir');
    statusEl = document.getElementById('pesquisaStatus');
    resultadosEl = document.getElementById('pesquisaResultados');
    [campoPalavras, campoExcluir].forEach(function (campo) {
      campo.addEventListener('input', agendar);
      campo.addEventListener('keydown', function (ev) {
        if (ev.key === 'Enter') { ev.preventDefault(); pesquisar(); }
      });
    });
    modal.querySelectorAll('input[name="pesquisaBase"]').forEach(function (opcao) {
      opcao.addEventListener('change', function () { salvarBase(opcao.value); pesquisar(); });
    });
    document.getElementById('btnFecharPesquisa').addEventListener('click', function () { modal.close(); });
    modal.addEventListener('click', function (ev) { if (ev.target === modal) modal.close(); });
    resultadosEl.addEventListener('click', aoClicarResultado);
  }

  window.PesquisaServico = {
    // opcoesAbertura: { texto: busca inicial, aoEscolher(escolha) -> false se não conseguiu incluir }
    abrir: function (opcoesAbertura) {
      if (!modal) return false;
      aoEscolher = (opcoesAbertura && opcoesAbertura.aoEscolher) || null;
      var base = lerBase();
      var radios = Array.from(modal.querySelectorAll('input[name="pesquisaBase"]'));
      if (!radios.some(function (r) { return r.value === base; })) base = 'todas';
      radios.forEach(function (r) { r.checked = r.value === base; });
      campoPalavras.value = (opcoesAbertura && opcoesAbertura.texto) || '';
      campoExcluir.value = '';
      buscaId++;
      clearTimeout(timer);
      definirStatus('', '');
      renderizar([], [], '');
      if (!modal.open) modal.showModal();
      campoPalavras.focus();
      if (campoPalavras.value.trim()) pesquisar();
      return true;
    }
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', iniciar);
  else iniciar();
})();
