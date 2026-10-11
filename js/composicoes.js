/* Gerenciamento de composições e insumos próprios */
(function () {
  'use strict';

  const DB_KEY_COMP = 'ibuild_composicoes_v1';
  const DB_KEY_INSUMO = 'ibuild_insumos_v1';
  const DB_KEY_UNIDADE = 'ibuild_unidades_v1';
  const UNIDADES_PADRAO = [
    {id: 'std-kg', simbolo: 'kg', nome: 'Quilograma', grupo: 'Massa', padrao: true},
    {id: 'std-g', simbolo: 'g', nome: 'Grama', grupo: 'Massa', padrao: true},
    {id: 'std-t', simbolo: 't', nome: 'Tonelada', grupo: 'Massa', padrao: true},
    {id: 'std-sc', simbolo: 'sc', nome: 'Saco', grupo: 'Massa', padrao: true},
    {id: 'std-l', simbolo: 'L', nome: 'Litro', grupo: 'Volume', padrao: true},
    {id: 'std-ml', simbolo: 'mL', nome: 'Mililitro', grupo: 'Volume', padrao: true},
    {id: 'std-lt', simbolo: 'Lt', nome: 'Lata', grupo: 'Volume', padrao: true},
    {id: 'std-m', simbolo: 'm', nome: 'Metro', grupo: 'Comprimento', padrao: true},
    {id: 'std-cm', simbolo: 'cm', nome: 'Centímetro', grupo: 'Comprimento', padrao: true},
    {id: 'std-mm', simbolo: 'mm', nome: 'Milímetro', grupo: 'Comprimento', padrao: true},
    {id: 'std-m2', simbolo: 'm²', nome: 'Metro quadrado', grupo: 'Área', padrao: true},
    {id: 'std-cm2', simbolo: 'cm²', nome: 'Centímetro quadrado', grupo: 'Área', padrao: true},
    {id: 'std-m3', simbolo: 'm³', nome: 'Metro cúbico', grupo: 'Volume', padrao: true},
    {id: 'std-un', simbolo: 'un', nome: 'Unidade', grupo: 'Quantidade', padrao: true},
    {id: 'std-h', simbolo: 'h', nome: 'Hora', grupo: 'Tempo', padrao: true},
    {id: 'std-dia', simbolo: 'dia', nome: 'Dia', grupo: 'Tempo', padrao: true},
    {id: 'std-mes', simbolo: 'mês', nome: 'Mês', grupo: 'Tempo', padrao: true},
    {id: 'std-cj', simbolo: 'cj', nome: 'Conjunto', grupo: 'Quantidade', padrao: true},
    {id: 'std-jg', simbolo: 'jg', nome: 'Jogo', grupo: 'Quantidade', padrao: true},
    {id: 'std-cx', simbolo: 'cx', nome: 'Caixa', grupo: 'Embalagem', padrao: true},
    {id: 'std-pct', simbolo: 'pct', nome: 'Pacote', grupo: 'Embalagem', padrao: true},
    {id: 'std-rolo', simbolo: 'rolo', nome: 'Rolo', grupo: 'Embalagem', padrao: true},
    {id: 'std-bobina', simbolo: 'bobina', nome: 'Bobina', grupo: 'Embalagem', padrao: true},
    {id: 'std-barra', simbolo: 'barra', nome: 'Barra', grupo: 'Quantidade', padrao: true},
    {id: 'std-par', simbolo: 'par', nome: 'Par', grupo: 'Quantidade', padrao: true},
    {id: 'std-mil', simbolo: 'mil', nome: 'Milheiro', grupo: 'Quantidade', padrao: true},
    {id: 'std-cento', simbolo: 'cento', nome: 'Cento', grupo: 'Quantidade', padrao: true},
    {id: 'std-kwh', simbolo: 'kWh', nome: 'Quilowatt-hora', grupo: 'Energia', padrao: true},
    {id: 'std-sc25', simbolo: 'sc 25kg', nome: 'Saco de 25 kg', grupo: 'Massa', padrao: true},
    {id: 'std-vb', simbolo: 'vb', nome: 'Verba', grupo: 'Outros', padrao: true}
  ];

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

  function carregarUnidades() {
    try {
      const personalizadas = JSON.parse(localStorage.getItem(DB_KEY_UNIDADE) || '[]');
      return UNIDADES_PADRAO.concat(Array.isArray(personalizadas) ? personalizadas : []);
    } catch (e) { return UNIDADES_PADRAO.slice(); }
  }

  function salvarUnidades(unidades) {
    localStorage.setItem(DB_KEY_UNIDADE, JSON.stringify(unidades.filter(function (u) { return !u.padrao; })));
  }

  function parseReal(valor) {
    if (valor === null || valor === undefined || valor === '') return 0;
    if (typeof valor === 'number') return Number.isFinite(valor) ? valor : 0;
    let texto = String(valor).trim();
    if (texto.includes(',')) {
      texto = texto.replace(/\./g, '').replace(',', '.');
    } else if ((texto.match(/\./g) || []).length > 1 || /^\d{1,3}\.\d{3}$/.test(texto)) {
      texto = texto.replace(/\./g, '');
    }
    const n = Number(texto);
    return Number.isFinite(n) ? n : 0;
  }

  function escaparHtml(valor) {
    return String(valor ?? '').replace(/[&<>"']/g, function (caractere) {
      return {'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[caractere];
    });
  }

  function formatarReal(valor) {
    return Number(valor || 0).toLocaleString('pt-BR', {minimumFractionDigits: 2, maximumFractionDigits: 2});
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

  function unidadeSinapi(unidade) {
    const mapa = {KG: 'kg', M: 'm', M2: 'm²', M3: 'm³', UN: 'un', H: 'h', L: 'L', T: 't', DIA: 'dia', MES: 'mês', CJ: 'cj', JG: 'jg', PAR: 'par', MIL: 'mil', CENTO: 'cento', SC25KG: 'sc 25kg', KWH: 'kWh'};
    const valor = (unidade || '').trim();
    return mapa[valor.toUpperCase()] || valor;
  }

  window.Composicoes = {
    carregar: carregarComposicoes,
    salvar: salvarComposicoes,
    adicionar: function (nome, descricao, unidade, valorUnitario, base, extras) {
      const comp = carregarComposicoes();
      const item = {
        id: (window.crypto && crypto.randomUUID ? crypto.randomUUID() : 'c-' + Date.now()),
        codigo: proximoCodigoComposicao(),
        nome: (nome || '').trim() || 'Nova composição',
        descricao: descricao || '',
        unidade: unidade || 'un',
        valorUnitario: parseReal(valorUnitario),
        base: base || 'propria',
        codigoReferencia: extras && extras.codigoReferencia || '',
        componentes: extras && Array.isArray(extras.componentes) ? extras.componentes : [],
        criadoEm: new Date().toISOString()
      };
      comp.push(item);
      salvarComposicoes(comp);
      return item;
    },
    atualizar: function (id, dados) {
      const comp = carregarComposicoes();
      const item = comp.find(function (c) { return c.id === id; });
      if (!item) return null;
      item.nome = (dados.nome || '').trim();
      item.descricao = dados.descricao || '';
      item.unidade = dados.unidade || 'un';
      item.valorUnitario = parseReal(dados.valorUnitario);
      item.componentes = Array.isArray(dados.componentes) ? dados.componentes : [];
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
    adicionar: function (nome, descricao, unidade, valorUnitario, base, extras) {
      const ins = carregarInsumos();
      const item = {
        id: (window.crypto && crypto.randomUUID ? crypto.randomUUID() : 'i-' + Date.now()),
        codigo: proximoCodigoInsumo(),
        nome: (nome || '').trim() || 'Novo insumo',
        descricao: descricao || '',
        unidade: unidade || 'un',
        valorUnitario: parseReal(valorUnitario),
        base: base || 'propria',
        codigoReferencia: extras && extras.codigoReferencia || '',
        unidadeBaseId: extras && extras.unidadeBaseId || '',
        conversoes: extras && Array.isArray(extras.conversoes) ? extras.conversoes : [],
        detalhes: extras && Array.isArray(extras.detalhes) ? extras.detalhes : [],
        criadoEm: new Date().toISOString()
      };
      ins.push(item);
      salvarInsumos(ins);
      return item;
    },
    atualizar: function (id, dados) {
      const ins = carregarInsumos();
      const item = ins.find(function (i) { return i.id === id; });
      if (!item) return null;
      item.nome = (dados.nome || '').trim();
      item.descricao = dados.descricao || '';
      item.unidade = dados.unidade || 'un';
      item.valorUnitario = parseReal(dados.valorUnitario);
      item.unidadeBaseId = dados.unidadeBaseId || '';
      item.conversoes = Array.isArray(dados.conversoes) ? dados.conversoes : [];
      item.detalhes = Array.isArray(dados.detalhes) ? dados.detalhes : [];
      salvarInsumos(ins);
      return item;
    },
    excluir: function (id) {
      const ins = carregarInsumos();
      const nova = ins.filter(function (i) { return i.id !== id; });
      salvarInsumos(nova);
    }
  };

  window.Unidades = {
    carregar: carregarUnidades,
    adicionar: function (dados) {
      const unidades = carregarUnidades();
      const simbolo = (dados.simbolo || '').trim();
      if (!simbolo || unidades.some(function (u) { return u.simbolo.toLowerCase() === simbolo.toLowerCase(); })) return null;
      const nova = {id: 'un-' + (window.crypto && crypto.randomUUID ? crypto.randomUUID() : Date.now()), simbolo: simbolo, nome: (dados.nome || '').trim(), grupo: dados.grupo || 'Outros', padrao: false};
      unidades.push(nova);
      salvarUnidades(unidades);
      return nova;
    },
    atualizar: function (id, dados) {
      const unidades = carregarUnidades();
      const unidade = unidades.find(function (u) { return u.id === id && !u.padrao; });
      const simbolo = (dados.simbolo || '').trim();
      if (!unidade || !simbolo || unidades.some(function (u) { return u.id !== id && u.simbolo.toLowerCase() === simbolo.toLowerCase(); })) return null;
      unidade.simbolo = simbolo;
      unidade.nome = (dados.nome || '').trim();
      unidade.grupo = dados.grupo || 'Outros';
      salvarUnidades(unidades);
      return unidade;
    },
    excluir: function (id) {
      const unidade = carregarUnidades().find(function (u) { return u.id === id && !u.padrao; });
      if (!unidade) return false;
      const referenciada = carregarInsumos().some(function (i) {
        return i.unidadeBaseId === id || i.unidade === unidade.simbolo || (i.conversoes || []).some(function (c) { return c.unidadeId === id || c.unidade === unidade.simbolo; });
      });
      if (referenciada) return false;
      salvarUnidades(carregarUnidades().filter(function (u) { return u.id !== id; }));
      return true;
    }
  };

  function baseSelecionada(nomeGrupo) {
    const radios = document.querySelectorAll('input[name="' + nomeGrupo + '"]');
    for (const radio of radios) {
      if (radio.checked) return radio.value;
    }
    return 'sinapi';
  }

  function buscarUnidade(idOuSimbolo) {
    return carregarUnidades().find(function (u) { return u.id === idOuSimbolo || u.simbolo === idOuSimbolo; });
  }

  function formatarConversoes(item) {
    return (item.conversoes || []).map(function (conversao) {
      const unidade = buscarUnidade(conversao.unidadeId || conversao.simbolo || conversao.unidade);
      const base = buscarUnidade(item.unidadeBaseId || item.unidade);
      return '1 ' + (unidade ? unidade.simbolo : conversao.simbolo || conversao.unidade) + ' = ' + formatarReal(conversao.fator) + ' ' + (base ? base.simbolo : item.unidade);
    }).join(' · ');
  }

  function renderUnidades() {
    const tbody = document.getElementById('listaUnidades');
    if (!tbody) return;
    tbody.innerHTML = carregarUnidades().map(function (unidade) {
      return '<tr><td>' + escaparHtml(unidade.simbolo) + '</td><td>' + escaparHtml(unidade.nome) + '</td><td>' + escaparHtml(unidade.grupo) + '</td><td>' + (unidade.padrao ? 'Padrão' : 'Personalizada') + '</td><td>' +
        (unidade.padrao ? '—' : '<div class="unidade-acoes"><button type="button" class="btn btn-ghost btn-xs" data-acao="editar-unidade" data-id="' + escaparHtml(unidade.id) + '">Editar</button><button type="button" class="btn btn-ghost btn-xs" data-acao="remover-unidade" data-id="' + escaparHtml(unidade.id) + '">Remover</button></div>') +
        '</td></tr>';
    }).join('');
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
          '<span class="item-codigo">' + escaparHtml(item.codigoReferencia || item.codigo || '—') + '</span>' +
          '<span class="item-base">' + (item.base === 'sinapi' ? 'SINAPI' : 'Própria') + '</span>' +
        '</div>' +
        '<div class="item-nome">' + escaparHtml(item.nome || 'Sem nome') + '</div>' +
        '<div class="item-meta">' + escaparHtml(item.descricao || 'Sem descrição') + '</div>' +
        '<div class="item-footer">' +
          '<span>' + escaparHtml(item.unidade || 'un') + (item.componentes && item.componentes.length ? ' · ' + item.componentes.length + ' insumo(s)' : '') + '</span>' +
          '<strong>R$ ' + formatarReal(item.valorUnitario) + '</strong>' +
        '</div>' +
        '<div class="item-acoes">' +
          (item.base === 'propria' ? '<button type="button" class="btn btn-ghost btn-xs" data-item-id="' + escaparHtml(item.id) + '" data-acao="editar-composicao">Editar</button>' : '') +
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
          '<span class="item-codigo">' + escaparHtml(item.codigoReferencia || item.codigo || '—') + '</span>' +
          '<span class="item-base">' + (item.base === 'sinapi' ? 'SINAPI' : 'Própria') + '</span>' +
        '</div>' +
        '<div class="item-nome">' + escaparHtml(item.nome || 'Sem nome') + '</div>' +
        '<div class="item-meta">' + escaparHtml(item.descricao || 'Sem descrição') + '</div>' +
        (item.detalhes && item.detalhes.length ? '<div class="item-detalhes">' + item.detalhes.map(function (detalhe) { return '<span>' + escaparHtml(detalhe.nome) + '</span>'; }).join('') + '</div>' : '') +
        '<div class="item-footer">' +
          '<span>' + escaparHtml((buscarUnidade(item.unidadeBaseId || item.unidade) || {}).simbolo || item.unidade || 'un') + (item.conversoes && item.conversoes.length ? '<small class="item-conversoes">' + escaparHtml(formatarConversoes(item)) + '</small>' : '') + '</span>' +
          '<strong>R$ ' + formatarReal(item.valorUnitario) + '</strong>' +
        '</div>' +
        '<div class="item-acoes">' +
          (item.base === 'propria' ? '<button type="button" class="btn btn-ghost btn-xs" data-item-id="' + escaparHtml(item.id) + '" data-acao="editar-insumo">Editar</button>' : '') +
          '<button type="button" class="btn btn-ghost btn-xs" data-item-id="' + item.id + '" data-item-tipo="insumo" data-acao="remover">Remover</button>' +
        '</div>' +
      '</div>';
    }).join('');
  }
  function registrarResultadoSinapi(resultado) {
    if (!resultado || !resultado.codigo) return;
    const view = document.querySelector('.content:not(.hidden)');
    if (!view) return;

    const nome = tituloAmigavel(resultado.descricao) || 'Item SINAPI';
    const unidade = unidadeSinapi(resultado.unidade) || 'un';
    const valor = resultado.valor !== null && resultado.valor !== undefined ? resultado.valor : 0;

    if (view.id === 'viewComposicoes') {
      window.Composicoes.adicionar(nome, 'Origem: SINAPI', unidade, valor, 'sinapi', {codigoReferencia: resultado.codigo});
      document.querySelectorAll('input[name="baseComposicao"]').forEach(function (radio) { radio.checked = radio.value === 'sinapi'; });
      renderComposicoes();
    } else if (view.id === 'viewInsumos') {
      window.Insumos.adicionar(nome, 'Origem: SINAPI', unidade, valor, 'sinapi', {codigoReferencia: resultado.codigo});
      document.querySelectorAll('input[name="baseInsumo"]').forEach(function (radio) { radio.checked = radio.value === 'sinapi'; });
      renderInsumos();
    }
  }

  function preencherSelectUnidades(select, selecionado, excluirId, grupo) {
    const unidades = carregarUnidades().filter(function (u) {
      return u.id !== excluirId && u.simbolo !== excluirId && (!grupo || u.grupo === grupo || u.grupo === 'Embalagem');
    });
    select.innerHTML = '<option value="">Selecione a unidade</option>' + unidades.map(function (u) {
      return '<option value="' + escaparHtml(u.id) + '">' + escaparHtml(u.simbolo + ' — ' + u.nome) + '</option>';
    }).join('');
    let unidade = buscarUnidade(selecionado);
    if (!unidade && selecionado) {
      select.insertAdjacentHTML('beforeend', '<option value="legado:' + escaparHtml(selecionado) + '">' + escaparHtml(selecionado + ' — unidade existente') + '</option>');
      select.value = 'legado:' + selecionado;
    } else {
      select.value = unidade && unidade.id !== excluirId ? unidade.id : '';
    }
  }

  function adicionarLinhaConversao(conversao) {
    const tbody = document.getElementById('conversoesInsumo');
    const linha = document.createElement('tr');
    const unidadeId = conversao && (conversao.unidadeId || conversao.simbolo || conversao.unidade) || '';
    linha.innerHTML = '<td><select class="conversao-unidade" required></select></td>' +
      '<td><div class="fator-conversao"><span>1 unidade =</span><input class="conversao-fator" type="number" min="0.000001" step="any" inputmode="decimal" placeholder="50" value="' + escaparHtml(conversao && conversao.fator != null ? conversao.fator : '') + '" required /><span class="conversao-base-simbolo"></span></div></td>' +
      '<td><button type="button" class="btn-icon btn-danger" data-remover-conversao title="Remover conversão">×</button></td>';
    tbody.appendChild(linha);
    atualizarSelectConversao(linha, unidadeId);
  }

  function atualizarSelectConversao(linha, selecionado) {
    const unidadeBase = document.getElementById('fInsumoUnidade').value;
    const base = buscarUnidade(unidadeBase);
    preencherSelectUnidades(linha.querySelector('.conversao-unidade'), selecionado, unidadeBase, base && base.grupo);
    linha.querySelector('.conversao-base-simbolo').textContent = base ? base.simbolo : 'unidade padrão';
  }

  function atualizarUnidadesConversao() {
    const baseId = document.getElementById('fInsumoUnidade').value;
    const base = buscarUnidade(baseId);
    document.getElementById('unidadeBaseLabel').textContent = base ? base.simbolo : 'unidade padrão';
    document.querySelectorAll('#conversoesInsumo tr').forEach(function (linha) {
      const selecionado = linha.querySelector('.conversao-unidade').value;
      atualizarSelectConversao(linha, selecionado);
    });
  }

  function adicionarLinhaDetalhe(detalhe) {
    const container = document.getElementById('detalhesInsumo');
    const linha = document.createElement('div');
    linha.className = 'insumo-detalhe-linha';
    linha.dataset.detalheId = detalhe && detalhe.id || '';
    linha.innerHTML = '<input class="insumo-detalhe-nome" placeholder="ex.: Vermelho" value="' + escaparHtml(detalhe && detalhe.nome || '') + '" aria-label="Nome do detalhe" />' +
      '<button type="button" class="btn-icon btn-danger" data-remover-detalhe title="Remover detalhe">×</button>';
    container.appendChild(linha);
  }

  function abrirEditorInsumo(item) {
    const form = document.getElementById('formInsumo');
    form.reset();
    document.getElementById('fInsumoId').value = item ? item.id : '';
    document.getElementById('modalInsumoTitulo').textContent = item ? 'Editar insumo' : 'Novo insumo';
    document.getElementById('fInsumoNome').value = item ? item.nome : '';
    document.getElementById('fInsumoDescricao').value = item ? item.descricao || '' : '';
    document.getElementById('fInsumoValor').value = item ? formatarReal(item.valorUnitario) : '';
    const detalhes = document.getElementById('detalhesInsumo');
    detalhes.replaceChildren();
    (item && item.detalhes || []).forEach(function (d) { adicionarLinhaDetalhe(d); });
    preencherSelectUnidades(document.getElementById('fInsumoUnidade'), item && (item.unidadeBaseId || item.unidade) || 'std-un');
    const tbody = document.getElementById('conversoesInsumo');
    tbody.replaceChildren();
    (item && item.conversoes || []).forEach(adicionarLinhaConversao);
    atualizarUnidadesConversao();
    document.getElementById('modalInsumo').showModal();
  }

  function abrirEditorUnidade(unidade) {
    const form = document.getElementById('formUnidade');
    form.reset();
    document.getElementById('fUnidadeCadastroId').value = unidade ? unidade.id : '';
    document.getElementById('modalUnidadeTitulo').textContent = unidade ? 'Editar unidade' : 'Nova unidade';
    document.getElementById('fUnidadeSimbolo').value = unidade ? unidade.simbolo : '';
    document.getElementById('fUnidadeNome').value = unidade ? unidade.nome : '';
    document.getElementById('fUnidadeGrupo').value = unidade ? unidade.grupo : 'Outros';
    document.getElementById('modalUnidade').showModal();
  }

  function linhaComponente(componente) {
    const tbody = document.getElementById('componentesComposicao');
    if (!tbody) return;
    const insumos = window.Insumos.carregar();
    const selecionado = componente && componente.insumoId ? componente.insumoId + (componente.detalheId ? ':' + componente.detalheId : '') : '';
    const opcoes = ['<option value="">Selecione um insumo</option>'];
    insumos.forEach(function (insumo) {
      const codigo = (insumo.codigo || '') + ' — ' + insumo.nome;
      opcoes.push('<option value="' + escaparHtml(insumo.id) + '">' + escaparHtml(codigo + (insumo.detalhes && insumo.detalhes.length ? ' — Principal' : '')) + '</option>');
      (insumo.detalhes || []).forEach(function (detalhe) {
        opcoes.push('<option value="' + escaparHtml(insumo.id + ':' + detalhe.id) + '">' + escaparHtml(codigo + ' — ' + detalhe.nome) + '</option>');
      });
    });
    if (componente && componente.insumoId && !insumos.some(function (i) { return i.id === componente.insumoId; })) {
      opcoes.push('<option value="' + escaparHtml(selecionado) + '">' + escaparHtml(componente.nome + ' (sem cadastro)') + '</option>');
    }
    const linha = document.createElement('tr');
    linha.dataset.insumoNome = componente && componente.nome || '';
    linha.dataset.insumoUnidade = componente && componente.unidade || '';
    linha.dataset.insumoValor = componente && componente.valorUnitario != null ? componente.valorUnitario : '';
    linha.innerHTML = '<td><select class="componente-insumo">' + opcoes.join('') + '</select></td>' +
      '<td class="componente-unidade">—</td>' +
      '<td><input class="componente-coeficiente" inputmode="decimal" placeholder="1,00" value="' + escaparHtml(componente && componente.coeficiente != null ? componente.coeficiente : '') + '"></td>' +
      '<td class="componente-preco">—</td><td class="componente-parcial">—</td>' +
      '<td><button type="button" class="btn-icon btn-danger" data-remover-componente title="Remover insumo">×</button></td>';
    tbody.appendChild(linha);
    linha.querySelector('.componente-insumo').value = selecionado;
    atualizarLinhaComponente(linha);
  }

  function atualizarLinhaComponente(linha) {
    const [id, detalheId] = linha.querySelector('.componente-insumo').value.split(':');
    const insumo = window.Insumos.carregar().find(function (i) { return i.id === id; });
    if (insumo) {
      const detalhe = (insumo.detalhes || []).find(function (d) { return d.id === detalheId; });
      linha.dataset.insumoNome = insumo.nome + (detalhe ? ' — ' + detalhe.nome : '');
      linha.dataset.insumoUnidade = (buscarUnidade(insumo.unidadeBaseId || insumo.unidade) || {}).simbolo || insumo.unidade || 'un';
      linha.dataset.insumoValor = insumo.valorUnitario || 0;
    }
    const unidade = linha.dataset.insumoUnidade || '—';
    const preco = parseReal(linha.dataset.insumoValor);
    const coeficiente = parseReal(linha.querySelector('.componente-coeficiente').value);
    linha.querySelector('.componente-unidade').textContent = unidade;
    linha.querySelector('.componente-preco').textContent = 'R$ ' + formatarReal(preco);
    linha.querySelector('.componente-parcial').textContent = 'R$ ' + formatarReal(preco * coeficiente);
    atualizarTotalComposicao();
  }

  function atualizarTotalComposicao() {
    const tbody = document.getElementById('componentesComposicao');
    const campoValor = document.getElementById('fComposicaoValor');
    if (!tbody || !campoValor) return;
    const linhas = Array.from(tbody.querySelectorAll('tr'));
    if (linhas.length) {
      const total = linhas.reduce(function (soma, linha) {
        return soma + parseReal(linha.dataset.insumoValor) * parseReal(linha.querySelector('.componente-coeficiente').value);
      }, 0);
      campoValor.value = formatarReal(total);
    } else {
      campoValor.value = formatarReal(0);
    }
    campoValor.readOnly = true;
  }

  function abrirEditorComposicao(item) {
    const form = document.getElementById('formComposicao');
    if (!form) return;
    form.reset();
    document.getElementById('fComposicaoId').value = item ? item.id : '';
    document.getElementById('fComposicaoNome').value = item ? item.nome : '';
    document.getElementById('fComposicaoDescricao').value = item ? item.descricao : '';
    preencherSelectUnidades(document.getElementById('fComposicaoUnidade'), item ? item.unidade : 'std-un');
    document.getElementById('fComposicaoValor').value = item ? formatarReal(item.valorUnitario) : '';
    const tbody = document.getElementById('componentesComposicao');
    tbody.replaceChildren();
    (item && item.componentes || []).forEach(linhaComponente);
    atualizarTotalComposicao();
    document.getElementById('modalComposicao').showModal();
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
    const btnBuscarSinapi = document.getElementById('btnBuscarSinapi');
    const btnBuscarSinapiInsumo = document.getElementById('btnBuscarSinapiInsumo');

    if (btnAddComposicao) btnAddComposicao.addEventListener('click', function () {
      const propria = document.querySelector('input[name="baseComposicao"][value="propria"]');
      if (propria) propria.checked = true;
      renderComposicoes();
      abrirEditorComposicao(null);
    });
    if (btnAddInsumo) btnAddInsumo.addEventListener('click', function () {
      const propria = document.querySelector('input[name="baseInsumo"][value="propria"]');
      if (propria) propria.checked = true;
      renderInsumos();
      abrirEditorInsumo(null);
    });
    if (btnBuscarSinapi) btnBuscarSinapi.addEventListener('click', function () { var modal = document.getElementById('modalBuscaSinapi'); if (modal) modal.showModal(); });
    if (btnBuscarSinapiInsumo) btnBuscarSinapiInsumo.addEventListener('click', function () { var modal = document.getElementById('modalBuscaSinapi'); if (modal) modal.showModal(); });

    document.getElementById('btnCancelarInsumo').addEventListener('click', function () { document.getElementById('modalInsumo').close(); });
    document.getElementById('btnAdicionarConversao').addEventListener('click', function () { adicionarLinhaConversao(null); });
    document.getElementById('btnAdicionarDetalhe').addEventListener('click', function () { adicionarLinhaDetalhe(null); });
    document.getElementById('fInsumoUnidade').addEventListener('change', atualizarUnidadesConversao);
    document.getElementById('detalhesInsumo').addEventListener('click', function (ev) {
      if (ev.target.closest('[data-remover-detalhe]')) ev.target.closest('.insumo-detalhe-linha').remove();
    });
    document.getElementById('conversoesInsumo').addEventListener('click', function (ev) {
      if (ev.target.closest('[data-remover-conversao]')) ev.target.closest('tr').remove();
    });
    document.getElementById('formInsumo').addEventListener('submit', function (ev) {
      ev.preventDefault();
      const unidadeSelecionada = document.getElementById('fInsumoUnidade').value;
      const unidade = buscarUnidade(unidadeSelecionada);
      const simboloBase = unidade ? unidade.simbolo : unidadeSelecionada.replace(/^legado:/, '');
      const linhas = Array.from(document.querySelectorAll('#conversoesInsumo tr'));
      const conversoes = linhas.map(function (linha) {
        const id = linha.querySelector('.conversao-unidade').value;
        const selecionada = buscarUnidade(id);
        return {
          unidadeId: selecionada ? selecionada.id : '',
          simbolo: selecionada ? selecionada.simbolo : id.replace(/^legado:/, ''),
          fator: Number(linha.querySelector('.conversao-fator').value)
        };
      });
      const simbolosConversao = conversoes.map(function (c) { return c.simbolo.toLowerCase(); });
      const linhasDetalhe = Array.from(document.querySelectorAll('#detalhesInsumo .insumo-detalhe-linha'));
      const detalhes = linhasDetalhe.map(function (linha) {
        return {id: linha.dataset.detalheId || 'det-' + (window.crypto && crypto.randomUUID ? crypto.randomUUID() : Date.now() + Math.random()), nome: linha.querySelector('.insumo-detalhe-nome').value.trim()};
      });
      if (!simboloBase) { alert('Selecione a unidade padrão do insumo.'); return; }
      if (conversoes.some(function (c) { return !c.simbolo || !Number.isFinite(c.fator) || c.fator <= 0 || c.simbolo.toLowerCase() === simboloBase.toLowerCase(); })) {
        alert('Cada conversão precisa ter uma unidade diferente da unidade padrão e um fator maior que zero.');
        return;
      }
      if (new Set(simbolosConversao).size !== simbolosConversao.length) { alert('Não repita a mesma unidade de conversão.'); return; }
      if (linhasDetalhe.some(function (linha) { return !linha.querySelector('.insumo-detalhe-nome').value.trim(); })) { alert('Preencha ou remova cada detalhe adicionado.'); return; }
      const nomesDetalhe = detalhes.map(function (d) { return d.nome.toLocaleLowerCase('pt-BR'); });
      if (new Set(nomesDetalhe).size !== nomesDetalhe.length) { alert('Não repita o mesmo detalhe.'); return; }
      const dados = {
        nome: document.getElementById('fInsumoNome').value.trim(),
        descricao: document.getElementById('fInsumoDescricao').value.trim(),
        unidade: simboloBase,
        unidadeBaseId: unidade ? unidade.id : '',
        valorUnitario: document.getElementById('fInsumoValor').value,
        conversoes: conversoes,
        detalhes: detalhes
      };
      if (!dados.nome) { alert('Informe o nome do insumo.'); return; }
      const id = document.getElementById('fInsumoId').value;
      if (id) {
        window.Insumos.atualizar(id, dados);
      } else {
        window.Insumos.adicionar(dados.nome, dados.descricao, dados.unidade, dados.valorUnitario, 'propria', {unidadeBaseId: dados.unidadeBaseId, conversoes: dados.conversoes, detalhes: dados.detalhes});
      }
      renderInsumos();
      renderComposicoes();
      document.getElementById('modalInsumo').close();
    });

    document.getElementById('btnAddUnidadeMedida').addEventListener('click', function () { abrirEditorUnidade(null); });
    document.getElementById('btnCancelarUnidade').addEventListener('click', function () { document.getElementById('modalUnidade').close(); });
    document.getElementById('formUnidade').addEventListener('submit', function (ev) {
      ev.preventDefault();
      const id = document.getElementById('fUnidadeCadastroId').value;
      const dados = {
        simbolo: document.getElementById('fUnidadeSimbolo').value.trim(),
        nome: document.getElementById('fUnidadeNome').value.trim(),
        grupo: document.getElementById('fUnidadeGrupo').value
      };
      if (!dados.simbolo || !dados.nome) { alert('Informe o símbolo e o nome da unidade.'); return; }
      const unidade = id ? window.Unidades.atualizar(id, dados) : window.Unidades.adicionar(dados);
      if (!unidade) { alert('Já existe uma unidade com esse símbolo.'); return; }
      renderUnidades();
      renderInsumos();
      renderComposicoes();
      document.getElementById('modalUnidade').close();
    });

    document.getElementById('btnAdicionarComponente').addEventListener('click', function () { linhaComponente(null); });
    document.getElementById('btnCancelarComposicao').addEventListener('click', function () { document.getElementById('modalComposicao').close(); });
    document.getElementById('componentesComposicao').addEventListener('change', function (ev) {
      if (ev.target.matches('.componente-insumo')) atualizarLinhaComponente(ev.target.closest('tr'));
    });
    document.getElementById('componentesComposicao').addEventListener('input', function (ev) {
      if (ev.target.matches('.componente-coeficiente')) atualizarLinhaComponente(ev.target.closest('tr'));
    });
    document.getElementById('componentesComposicao').addEventListener('click', function (ev) {
      if (ev.target.closest('[data-remover-componente]')) {
        ev.target.closest('tr').remove();
        atualizarTotalComposicao();
      }
    });
    document.getElementById('formComposicao').addEventListener('submit', function (ev) {
      ev.preventDefault();
      const linhas = Array.from(document.querySelectorAll('#componentesComposicao tr'));
      if (!linhas.length) { alert('Adicione ao menos um insumo à composição.'); return; }
      const componentes = linhas.map(function (linha) {
        const [insumoId, detalheId] = linha.querySelector('.componente-insumo').value.split(':');
        const insumo = window.Insumos.carregar().find(function (i) { return i.id === insumoId; });
        const detalhe = insumo && (insumo.detalhes || []).find(function (d) { return d.id === detalheId; });
        return {
          insumoId: insumoId,
          detalheId: detalhe ? detalhe.id : '',
          nome: insumo ? insumo.nome + (detalhe ? ' — ' + detalhe.nome : '') : linha.dataset.insumoNome,
          unidade: insumo ? (buscarUnidade(insumo.unidadeBaseId || insumo.unidade) || {}).simbolo || insumo.unidade : linha.dataset.insumoUnidade,
          valorUnitario: insumo ? parseReal(insumo.valorUnitario) : parseReal(linha.dataset.insumoValor),
          coeficiente: parseReal(linha.querySelector('.componente-coeficiente').value)
        };
      });
      if (componentes.some(function (c) { return !c.insumoId || !c.nome || c.coeficiente <= 0; })) {
        alert('Selecione um insumo e informe um coeficiente maior que zero em cada linha.');
        return;
      }
      const dados = {
        nome: document.getElementById('fComposicaoNome').value.trim(),
        descricao: document.getElementById('fComposicaoDescricao').value.trim(),
        unidade: (buscarUnidade(document.getElementById('fComposicaoUnidade').value) || {}).simbolo || document.getElementById('fComposicaoUnidade').value.replace(/^legado:/, '') || 'un',
        valorUnitario: document.getElementById('fComposicaoValor').value,
        componentes: componentes
      };
      if (!dados.nome) { alert('Informe o nome da composição.'); return; }
      const id = document.getElementById('fComposicaoId').value;
      if (id) {
        window.Composicoes.atualizar(id, dados);
      } else {
        window.Composicoes.adicionar(dados.nome, dados.descricao, dados.unidade, dados.valorUnitario, 'propria', {componentes: dados.componentes});
      }
      renderComposicoes();
      document.getElementById('modalComposicao').close();
    });

    document.addEventListener('click', function (ev) {
      const editInsumoBtn = ev.target.closest('[data-acao="editar-insumo"]');
      if (editInsumoBtn) {
        const item = window.Insumos.carregar().find(function (i) { return i.id === editInsumoBtn.getAttribute('data-item-id'); });
        if (item) abrirEditorInsumo(item);
        return;
      }
      const editUnidadeBtn = ev.target.closest('[data-acao="editar-unidade"]');
      if (editUnidadeBtn) {
        const unidade = carregarUnidades().find(function (u) { return u.id === editUnidadeBtn.getAttribute('data-id'); });
        if (unidade) abrirEditorUnidade(unidade);
        return;
      }
      const removeUnidadeBtn = ev.target.closest('[data-acao="remover-unidade"]');
      if (removeUnidadeBtn) {
        const id = removeUnidadeBtn.getAttribute('data-id');
        if (confirm('Remover esta unidade padronizada?')) {
          if (!window.Unidades.excluir(id)) alert('Esta unidade está sendo usada por um insumo ou conversão e não pode ser removida.');
          renderUnidades();
        }
        return;
      }
      const editBtn = ev.target.closest('[data-acao="editar-composicao"]');
      if (editBtn) {
        const item = window.Composicoes.carregar().find(function (c) { return c.id === editBtn.getAttribute('data-item-id'); });
        if (item) abrirEditorComposicao(item);
        return;
      }
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
    renderUnidades();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
