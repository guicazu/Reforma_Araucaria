/* Gerenciamento de composições e insumos próprios */
(function () {
  'use strict';

  const DB_KEY_COMP = 'ibuild_composicoes_v1';
  const DB_KEY_INSUMO = 'ibuild_insumos_v1';

  function carregarComposicoes() {
    try {
      const raw = localStorage.getItem(DB_KEY_COMP);
      return raw ? JSON.parse(raw) : [];
    } catch (e) { return []; }
  }

  function salvarComposicoes(comp) {
    localStorage.setItem(DB_KEY_COMP, JSON.stringify(comp));
  }

  function carregarInsumos() {
    try {
      const raw = localStorage.getItem(DB_KEY_INSUMO);
      return raw ? JSON.parse(raw) : [];
    } catch (e) { return []; }
  }

  function salvarInsumos(ins) {
    localStorage.setItem(DB_KEY_INSUMO, JSON.stringify(ins));
  }

  function parseReal(valor) {
    if (valor === null || valor === undefined || valor === '') return 0;
    const n = Number(String(valor).replace(/\./g, '').replace(',', '.').trim());
    return Number.isFinite(n) ? n : 0;
  }

  function proximoCodigoComposicao() {
    const comp = carregarComposicoes();
    let max = 0;
    for (const c of comp) {
      const m = (c.codigo || '').match(/^(COMP|INS)-\d{4}-(\d+)$/);
      if (m) max = Math.max(max, Number(m[2]));
    }
    const ano = new Date().getFullYear();
    return 'COMP-' + ano + '-' + String(max + 1).padStart(3, '0');
  }

  function proximoCodigoInsumo() {
    const ins = carregarInsumos();
    let max = 0;
    for (const i of ins) {
      const m = (i.codigo || '').match(/^(INS)-\d{4}-(\d+)$/);
      if (m) max = Math.max(max, Number(m[2]));
    }
    const ano = new Date().getFullYear();
    return 'INS-' + ano + '-' + String(max + 1).padStart(3, '0');
  }

  function tituloAmigavel(texto) {
    if (!texto) return '';
    return texto.toLowerCase().replace(/(^|\s|\/|-)\p{L}/gu, function (m) {
      return m.toUpperCase();
    });
  }

  window.Composicoes = {
    carregar: carregarComposicoes,
    salvar: salvarComposicoes,
    adicionar: function (nome, descricao, unidade, valorUnitario, base) {
      const comp = carregarComposicoes();
      const item = {
        id: (window.crypto && crypto.randomUUID ? crypto.randomUUID() : 'c-' + Date.now()),
        codigo: proximoCodigoComposicao(),
        nome: (nome || '').trim() || 'Nova composição',
        descricao: descricao || '',
        unidade: unidade || 'un',
        valorUnitario: parseReal(valorUnitario),
        base: base || 'propria',
        criadoEm: new Date().toISOString()
      };
      comp.push(item);
      salvarComposicoes(comp);
      return item;
    },
    excluir: function (id) {
      const comp = carregarComposicoes();
      const nova = comp.filter(function (c) { return c.id !== id; });
      salvarComposicoes(nova);
    }
  };

  window.Insumos = {
    carregar: carregarInsumos,
    salvar: salvarInsumos,
    adicionar: function (nome, descricao, unidade, valorUnitario, base) {
      const ins = carregarInsumos();
      const item = {
        id: (window.crypto && crypto.randomUUID ? crypto.randomUUID() : 'i-' + Date.now()),
        codigo: proximoCodigoInsumo(),
        nome: (nome || '').trim() || 'Novo insumo',
        descricao: descricao || '',
        unidade: unidade || 'un',
        valorUnitario: parseReal(valorUnitario),
        base: base || 'propria',
        criadoEm: new Date().toISOString()
      };
      ins.push(item);
      salvarInsumos(ins);
      return item;
    },
    excluir: function (id) {
      const ins = carregarInsumos();
      const nova = ins.filter(function (i) { return i.id !== id; });
      salvarInsumos(nova);
    }
  };

  function baseSelecionada(nomeGrupo) {
    const radios = document.querySelectorAll('input[name="' + nomeGrupo + '"]');
    for (const radio of radios) {
      if (radio.checked) return radio.value;
    }
    return 'sinapi';
  }

  function renderComposicoes() {
    const container = document.getElementById('listaComposicoes');
    if (!container) return;
    const base = baseSelecionada('baseComposicao');
    const itens = window.Composicoes.carregar().filter(function (item) {
      return item.base === base || (!item.base && base === 'propria');
    });

    if (!itens.length) {
      container.className = 'lista-vazia';
      container.textContent = base === 'sinapi'
        ? 'Nenhuma composição SINAPI cadastrada.'
        : 'Nenhuma composição própria cadastrada.';
      return;
    }

    container.className = 'lista-itens';
    container.innerHTML = itens.map(function (item) {
      return '<div class="item-catalogo">' +
        '<div class="item-header">' +
          '<span class="item-codigo">' + (item.codigo || '—') + '</span>' +
          '<span class="item-base">' + (item.base === 'sinapi' ? 'SINAPI' : 'Própria') + '</span>' +
        '</div>' +
        '<div class="item-nome">' + (item.nome || 'Sem nome') + '</div>' +
        '<div class="item-meta">' + (item.descricao || 'Sem descrição') + '</div>' +
        '<div class="item-footer">' +
          '<span>' + (item.unidade || 'un') + '</span>' +
          '<strong>R$ ' + Number(item.valorUnitario || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + '</strong>' +
        '</div>' +
        '<div class="item-acoes">' +
          '<button type="button" class="btn btn-ghost btn-xs" data-item-id="' + item.id + '" data-item-tipo="composicao" data-acao="remover">Remover</button>' +
        '</div>' +
      '</div>';
    }).join('');
  }

  function renderInsumos() {
    const container = document.getElementById('listaInsumos');
    if (!container) return;
    const base = baseSelecionada('baseInsumo');
    const itens = window.Insumos.carregar().filter(function (item) {
      return item.base === base || (!item.base && base === 'propria');
    });

    if (!itens.length) {
      container.className = 'lista-vazia';
      container.textContent = base === 'sinapi'
        ? 'Nenhum insumo SINAPI cadastrado.'
        : 'Nenhum insumo próprio cadastrado.';
      return;
    }

    container.className = 'lista-itens';
    container.innerHTML = itens.map(function (item) {
      return '<div class="item-catalogo">' +
        '<div class="item-header">' +
          '<span class="item-codigo">' + (item.codigo || '—') + '</span>' +
          '<span class="item-base">' + (item.base === 'sinapi' ? 'SINAPI' : 'Própria') + '</span>' +
        '</div>' +
        '<div class="item-nome">' + (item.nome || 'Sem nome') + '</div>' +
        '<div class="item-meta">' + (item.descricao || 'Sem descrição') + '</div>' +
        '<div class="item-footer">' +
          '<span>' + (item.unidade || 'un') + '</span>' +
          '<strong>R$ ' + Number(item.valorUnitario || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + '</strong>' +
        '</div>' +
        '<div class="item-acoes">' +
          '<button type="button" class="btn btn-ghost btn-xs" data-item-id="' + item.id + '" data-item-tipo="insumo" data-acao="remover">Remover</button>' +
        '</div>' +
      '</div>';
    }).join('');
  }

  function adicionarItemPorPrompt(tipo) {
    const base = tipo === 'insumo' ? baseSelecionada('baseInsumo') : baseSelecionada('baseComposicao');
    const nome = window.prompt(tipo === 'insumo' ? 'Nome do insumo:' : 'Nome da composição:');
    if (nome === null) return;
    const descricao = window.prompt('Descrição (opcional):', '') || '';
    const unidade = window.prompt('Unidade:', 'm²') || 'm²';
    const valor = window.prompt('Valor unitário (R$):', '0') || '0';

    if (tipo === 'insumo') {
      window.Insumos.adicionar(nome.trim() || 'Novo insumo', descricao, unidade, valor, base);
      renderInsumos();
    } else {
      window.Composicoes.adicionar(nome.trim() || 'Nova composição', descricao, unidade, valor, base);
      renderComposicoes();
    }
  }

  function registrarResultadoSinapi(resultado) {
    if (!resultado || !resultado.codigo) return;
    const view = document.querySelector('.content:not(.hidden)');
    if (!view) return;

    const nome = tituloAmigavel(resultado.descricao) || 'Item SINAPI';
    const unidade = resultado.unidade || 'un';
    const valor = resultado.valor !== null && resultado.valor !== undefined ? resultado.valor : 0;

    if (view.id === 'viewComposicoes') {
      window.Composicoes.adicionar(nome, 'Origem: SINAPI', unidade, valor, 'sinapi');
      renderComposicoes();
    } else if (view.id === 'viewInsumos') {
      window.Insumos.adicionar(nome, 'Origem: SINAPI', unidade, valor, 'sinapi');
      renderInsumos();
    }
  }

  function init() {
    const baseComp = document.querySelectorAll('input[name="baseComposicao"]');
    const baseInsumo = document.querySelectorAll('input[name="baseInsumo"]');
    baseComp.forEach(function (radio) {
      radio.addEventListener('change', renderComposicoes);
    });
    baseInsumo.forEach(function (radio) {
      radio.addEventListener('change', renderInsumos);
    });

    const btnAddComposicao = document.getElementById('btnAddComposicao');
    const btnAddInsumo = document.getElementById('btnAddInsumo');
    const btnAddItem = document.getElementById('btnAddItem');
    const btnBuscarSinapi = document.getElementById('btnBuscarSinapi');
    const btnBuscarSinapiInsumo = document.getElementById('btnBuscarSinapiInsumo');

    if (btnAddComposicao) btnAddComposicao.addEventListener('click', function () { adicionarItemPorPrompt('composicao'); });
    if (btnAddInsumo) btnAddInsumo.addEventListener('click', function () { adicionarItemPorPrompt('insumo'); });
    if (btnAddItem) btnAddItem.addEventListener('click', function () { adicionarItemPorPrompt('composicao'); });
    if (btnBuscarSinapi) btnBuscarSinapi.addEventListener('click', function () { var modal = document.getElementById('modalBuscaSinapi'); if (modal) modal.showModal(); });
    if (btnBuscarSinapiInsumo) btnBuscarSinapiInsumo.addEventListener('click', function () { var modal = document.getElementById('modalBuscaSinapi'); if (modal) modal.showModal(); });

    document.addEventListener('click', function (ev) {
      const actionBtn = ev.target.closest('[data-acao="remover"]');
      if (!actionBtn) return;
      const tipo = actionBtn.getAttribute('data-item-tipo');
      const id = actionBtn.getAttribute('data-item-id');
      if (!id) return;
      if (tipo === 'insumo') {
        window.Insumos.excluir(id);
        renderInsumos();
      } else {
        window.Composicoes.excluir(id);
        renderComposicoes();
      }
    });

    window.registrarResultadoSinapiComoItem = registrarResultadoSinapi;
    renderComposicoes();
    renderInsumos();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
