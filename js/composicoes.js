/* Gerenciamento de composições e insumos próprios */
(function () {
  'use strict';

  const DB_KEY_UNIDADE = 'ibuild_unidades_v1';
  const DB_KEY_UNIDADE_IMPORTADA = 'ibuild_unidades_migradas_v1';
  const catalogos = {unidades: [], composicoes: [], insumos: []};
  let erroCatalogos = 'Carregando catálogos compartilhados...';
  let requisicaoCatalogos = null;
  const UNIDADES_PADRAO = [
    {id: 'std-kg', simbolo: 'KG', nome: 'Quilograma', grupo: 'Massa', padrao: true},
    {id: 'std-g', simbolo: 'g', nome: 'Grama', grupo: 'Massa', padrao: true},
    {id: 'std-t', simbolo: 'T', nome: 'Tonelada', grupo: 'Massa', padrao: true},
    {id: 'std-sc', simbolo: 'sc', nome: 'Saco', grupo: 'Massa', padrao: true},
    {id: 'std-l', simbolo: 'L', nome: 'Litro', grupo: 'Volume', padrao: true},
    {id: 'std-ml', simbolo: 'mL', nome: 'Mililitro', grupo: 'Volume', padrao: true},
    {id: 'std-lt', simbolo: 'Lt', nome: 'Lata', grupo: 'Volume', padrao: true},
    {id: 'std-m', simbolo: 'M', nome: 'Metro', grupo: 'Comprimento', padrao: true},
    {id: 'std-cm', simbolo: 'cm', nome: 'Centímetro', grupo: 'Comprimento', padrao: true},
    {id: 'std-mm', simbolo: 'mm', nome: 'Milímetro', grupo: 'Comprimento', padrao: true},
    {id: 'std-m2', simbolo: 'M2', nome: 'Metro quadrado', grupo: 'Área', padrao: true},
    {id: 'std-cm2', simbolo: 'cm²', nome: 'Centímetro quadrado', grupo: 'Área', padrao: true},
    {id: 'std-m3', simbolo: 'M3', nome: 'Metro cúbico', grupo: 'Volume', padrao: true},
    {id: 'std-un', simbolo: 'UN', nome: 'Unidade', grupo: 'Quantidade', padrao: true},
    {id: 'std-h', simbolo: 'H', nome: 'Hora', grupo: 'Tempo', padrao: true},
    {id: 'std-dia', simbolo: 'dia', nome: 'Dia', grupo: 'Tempo', padrao: true},
    {id: 'std-mes', simbolo: 'MES', nome: 'Mês', grupo: 'Tempo', padrao: true},
    {id: 'std-cj', simbolo: 'CJ', nome: 'Conjunto', grupo: 'Quantidade', padrao: true},
    {id: 'std-jg', simbolo: 'JG', nome: 'Jogo', grupo: 'Quantidade', padrao: true},
    {id: 'std-cx', simbolo: 'cx', nome: 'Caixa', grupo: 'Embalagem', padrao: true},
    {id: 'std-pct', simbolo: 'pct', nome: 'Pacote', grupo: 'Embalagem', padrao: true},
    {id: 'std-rolo', simbolo: 'rolo', nome: 'Rolo', grupo: 'Embalagem', padrao: true},
    {id: 'std-bobina', simbolo: 'bobina', nome: 'Bobina', grupo: 'Embalagem', padrao: true},
    {id: 'std-barra', simbolo: 'barra', nome: 'Barra', grupo: 'Quantidade', padrao: true},
    {id: 'std-par', simbolo: 'PAR', nome: 'Par', grupo: 'Quantidade', padrao: true},
    {id: 'std-mil', simbolo: 'MIL', nome: 'Milheiro', grupo: 'Quantidade', padrao: true},
    {id: 'std-cento', simbolo: 'CENTO', nome: 'Cento', grupo: 'Quantidade', padrao: true},
    {id: 'std-kwh', simbolo: 'KWH', nome: 'Quilowatt-hora', grupo: 'Energia', padrao: true},
    {id: 'std-sc25', simbolo: 'sc 25kg', nome: 'Saco de 25 kg', grupo: 'Massa', padrao: true},
    {id: 'std-vb', simbolo: 'vb', nome: 'Verba', grupo: 'Outros', padrao: true}
  ];

  function carregarComposicoes() {
    return catalogos.composicoes.slice();
  }

  function carregarInsumos() {
    return catalogos.insumos.slice();
  }

  function carregarUnidades() {
    const compartilhadasPorId = new Map(catalogos.unidades.map(function (unidade) { return [unidade.id, unidade]; }));
    const idsPadrao = new Set(UNIDADES_PADRAO.map(function (unidade) { return unidade.id; }));
    return UNIDADES_PADRAO.map(function (unidade) {
      return compartilhadasPorId.get(unidade.id) || unidade;
    }).concat(catalogos.unidades.filter(function (unidade) { return !idsPadrao.has(unidade.id); }));
  }

  async function enviarCatalogo(metodo, corpo) {
    let resposta;
    try {
      resposta = await fetch('/api/catalogos', {
        method: metodo,
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify(corpo)
      });
    } catch (error) {
      throw new Error('Não foi possível conectar ao catálogo compartilhado. Confira a conexão e tente novamente.', {cause: error});
    }
    let dados;
    try {
      dados = await resposta.json();
    } catch (error) {
      throw new Error('O servidor retornou uma resposta inválida para o catálogo.', {cause: error});
    }
    if (!resposta.ok) {
      const mensagens = {
        nao_autenticado: 'Entre novamente para acessar os catálogos.',
        nao_aprovado: 'Sua conta ainda não tem acesso aos catálogos.',
        somente_visualizacao: 'Sua conta pode visualizar, mas não alterar os catálogos.',
        somente_admin: 'Somente um administrador pode importar unidades deste navegador.',
        unidade_padrao_protegida: 'Unidades padrão da SINAPI não podem ser alteradas ou removidas.',
        simbolo_reservado: 'Esse símbolo já pertence a uma unidade padrão.',
        unidade_em_uso: 'Esta unidade está sendo usada por um insumo ou composição.',
        item_duplicado: 'Já existe um item com esse código ou símbolo no catálogo.'
      };
      throw new Error(mensagens[dados.erro] || 'Não foi possível salvar no catálogo (HTTP ' + resposta.status + ').');
    }
    if (!dados || typeof dados !== 'object') throw new Error('O servidor retornou uma resposta inválida para o catálogo.');
    return dados;
  }

  async function carregarCatalogos() {
    if (requisicaoCatalogos) return requisicaoCatalogos;
    requisicaoCatalogos = carregarCatalogosDaApi();
    try {
      await requisicaoCatalogos;
    } finally {
      requisicaoCatalogos = null;
    }
  }

  async function carregarCatalogosDaApi() {
    let resposta;
    try {
      resposta = await fetch('/api/catalogos');
    } catch (error) {
      throw new Error('Não foi possível conectar ao catálogo compartilhado.', {cause: error});
    }
    if (!resposta.ok) throw new Error('Não foi possível carregar os catálogos (HTTP ' + resposta.status + ').');
    const dados = await resposta.json();
    for (const tipo of ['unidades', 'composicoes', 'insumos']) {
      if (!Array.isArray(dados[tipo])) throw new Error('A resposta do catálogo está incompleta.');
      catalogos[tipo] = dados[tipo];
    }
    // nomes no padrão do site (js/texto.js), inclusive os já gravados em maiúsculas pela SINAPI
    catalogos.composicoes.concat(catalogos.insumos).forEach(padronizarNome);
    erroCatalogos = '';
    document.dispatchEvent(new CustomEvent('catalogos:loaded'));
  }

  function padronizarNome(item) {
    item.nome = window.primeiraMaiuscula(item.nome);
    (item.componentes || []).forEach(function (c) { c.nome = window.primeiraMaiuscula(c.nome); });
  }

  function erroCatalogo(container) {
    if (!container || !erroCatalogos) return false;
    container.className = 'lista-vazia';
    container.textContent = erroCatalogos;
    return true;
  }

  function usuarioPodeEditarCatalogos() {
    const usuario = window.usuarioAtual || {};
    return Boolean(usuario.podeEditar || usuario.isAdmin);
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

  function proximoCodigo(tipo) {
    const prefixo = tipo === 'composicoes' ? 'COMP' : 'INS';
    const itens = tipo === 'composicoes' ? carregarComposicoes() : carregarInsumos();
    const ano = new Date().getFullYear();
    const max = itens.reduce(function (maior, item) {
      const match = (item.codigo || '').match(new RegExp('^' + prefixo + '-\\d{4}-(\\d+)$'));
      return match ? Math.max(maior, Number(match[1])) : maior;
    }, 0);
    return prefixo + '-' + ano + '-' + String(max + 1).padStart(3, '0');
  }

  function unidadeSinapi(unidade) {
    const mapa = {KG: 'kg', M: 'm', M2: 'm²', M3: 'm³', UN: 'un', H: 'h', L: 'L', T: 't', DIA: 'dia', MES: 'mês', CJ: 'cj', JG: 'jg', PAR: 'par', MIL: 'mil', CENTO: 'cento', SC25KG: 'sc 25kg', KWH: 'kWh'};
    const valor = (unidade || '').trim();
    return mapa[valor.toUpperCase()] || valor;
  }

  window.Composicoes = {
    carregar: carregarComposicoes,
    adicionar: async function (nome, descricao, unidade, valorUnitario, base, extras) {
      const item = {
        id: (window.crypto && crypto.randomUUID ? crypto.randomUUID() : 'c-' + Date.now()),
        codigo: proximoCodigo('composicoes'),
        nome: window.primeiraMaiuscula(nome) || 'Nova composição',
        descricao: descricao || '',
        unidade: unidade || 'un',
        valorUnitario: parseReal(valorUnitario),
        base: base || 'propria',
        codigoReferencia: extras && extras.codigoReferencia || '',
        componentes: extras && Array.isArray(extras.componentes) ? extras.componentes : [],
        criadoEm: new Date().toISOString()
      };
      const resposta = await enviarCatalogo('POST', {tipo: 'composicoes', item});
      catalogos.composicoes.push(resposta.item);
      return resposta.item;
    },
    atualizar: async function (id, dados) {
      const item = carregarComposicoes().find(function (c) { return c.id === id; });
      if (!item) return null;
      const resposta = await enviarCatalogo('PUT', {tipo: 'composicoes', item: Object.assign({}, item, {
        nome: window.primeiraMaiuscula(dados.nome),
        descricao: dados.descricao || '',
        unidade: dados.unidade || 'un',
        valorUnitario: parseReal(dados.valorUnitario),
        componentes: Array.isArray(dados.componentes) ? dados.componentes : []
      })});
      catalogos.composicoes = catalogos.composicoes.map(function (atual) {
        return atual.id === id ? resposta.item : atual;
      });
      return resposta.item;
    },
    excluir: async function (id) {
      await enviarCatalogo('DELETE', {tipo: 'composicoes', id});
      catalogos.composicoes = catalogos.composicoes.filter(function (item) { return item.id !== id; });
    }
  };

  window.Insumos = {
    carregar: carregarInsumos,
    adicionar: async function (nome, descricao, unidade, valorUnitario, base, extras) {
      const item = {
        id: (window.crypto && crypto.randomUUID ? crypto.randomUUID() : 'i-' + Date.now()),
        codigo: proximoCodigo('insumos'),
        nome: window.primeiraMaiuscula(nome) || 'Novo insumo',
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
      const resposta = await enviarCatalogo('POST', {tipo: 'insumos', item});
      catalogos.insumos.push(resposta.item);
      return resposta.item;
    },
    atualizar: async function (id, dados) {
      const item = carregarInsumos().find(function (i) { return i.id === id; });
      if (!item) return null;
      const resposta = await enviarCatalogo('PUT', {tipo: 'insumos', item: Object.assign({}, item, {
        nome: window.primeiraMaiuscula(dados.nome),
        descricao: dados.descricao || '',
        unidade: dados.unidade || 'un',
        valorUnitario: parseReal(dados.valorUnitario),
        unidadeBaseId: dados.unidadeBaseId || '',
        conversoes: Array.isArray(dados.conversoes) ? dados.conversoes : [],
        detalhes: Array.isArray(dados.detalhes) ? dados.detalhes : []
      })});
      catalogos.insumos = catalogos.insumos.map(function (atual) {
        return atual.id === id ? resposta.item : atual;
      });
      return resposta.item;
    },
    excluir: async function (id) {
      await enviarCatalogo('DELETE', {tipo: 'insumos', id});
      catalogos.insumos = catalogos.insumos.filter(function (item) { return item.id !== id; });
    }
  };

  window.Unidades = {
    carregar: carregarUnidades,
    adicionar: async function (dados) {
      const unidades = carregarUnidades();
      const simbolo = (dados.simbolo || '').trim();
      if (!simbolo || unidades.some(function (u) { return u.simbolo.toLowerCase() === simbolo.toLowerCase(); })) return null;
      const nova = {id: 'un-' + (window.crypto && crypto.randomUUID ? crypto.randomUUID() : Date.now()), simbolo, nome: (dados.nome || '').trim(), grupo: dados.grupo || 'Outros', padrao: false, criadoEm: new Date().toISOString()};
      const resposta = await enviarCatalogo('POST', {tipo: 'unidades', item: nova});
      catalogos.unidades.push(resposta.item);
      return resposta.item;
    },
    atualizar: async function (id, dados) {
      const unidades = carregarUnidades();
      const unidade = unidades.find(function (u) { return u.id === id && !u.padrao; });
      const simbolo = (dados.simbolo || '').trim();
      if (!unidade || !simbolo || unidades.some(function (u) { return u.id !== id && u.simbolo.toLowerCase() === simbolo.toLowerCase(); })) return null;
      const resposta = await enviarCatalogo('PUT', {tipo: 'unidades', item: Object.assign({}, unidade, {
        simbolo, nome: (dados.nome || '').trim(), grupo: dados.grupo || 'Outros'
      })});
      catalogos.unidades = catalogos.unidades.map(function (atual) {
        return atual.id === id ? resposta.item : atual;
      });
      return resposta.item;
    },
    excluir: async function (id) {
      if (!carregarUnidades().some(function (u) { return u.id === id && !u.padrao; })) return false;
      await enviarCatalogo('DELETE', {tipo: 'unidades', id});
      catalogos.unidades = catalogos.unidades.filter(function (unidade) { return unidade.id !== id; });
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
    const simbolo = String(idOuSimbolo || '').normalize('NFD').replace(/\p{Diacritic}/gu, '').replace(/²/g, '2').replace(/³/g, '3').toUpperCase();
    return carregarUnidades().find(function (u) {
      const normalizado = String(u.simbolo || '').normalize('NFD').replace(/\p{Diacritic}/gu, '').replace(/²/g, '2').replace(/³/g, '3').toUpperCase();
      return u.id === idOuSimbolo || normalizado === simbolo;
    });
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
    const podeEditar = usuarioPodeEditarCatalogos();
    const botaoAdicionar = document.getElementById('btnAddUnidadeMedida');
    const aviso = document.getElementById('avisoMigracaoUnidades');
    if (botaoAdicionar) {
      botaoAdicionar.hidden = !podeEditar;
      botaoAdicionar.disabled = Boolean(erroCatalogos);
    }
    if (erroCatalogo(tbody)) {
      tbody.innerHTML = '<tr><td colspan="5">' + escaparHtml(erroCatalogos) + '</td></tr>';
      if (aviso) aviso.hidden = true;
      return;
    }
    tbody.innerHTML = carregarUnidades().map(function (unidade) {
      return '<tr><td>' + escaparHtml(unidade.simbolo) + '</td><td>' + escaparHtml(unidade.nome) + '</td><td>' + escaparHtml(unidade.grupo) + '</td><td>' + (unidade.padrao ? 'Padrão' : 'Personalizada') + '</td><td>' +
        (unidade.padrao || !podeEditar ? '—' : '<div class="unidade-acoes"><button type="button" class="btn btn-ghost btn-xs" data-acao="editar-unidade" data-id="' + escaparHtml(unidade.id) + '">Editar</button><button type="button" class="btn btn-ghost btn-xs" data-acao="remover-unidade" data-id="' + escaparHtml(unidade.id) + '">Remover</button></div>') +
        '</td></tr>';
    }).join('');
    const botaoImportar = document.getElementById('btnMigrarUnidadesLocais');
    if (aviso && botaoImportar) {
      let locais = [];
      try {
        const dadosLocais = JSON.parse(localStorage.getItem(DB_KEY_UNIDADE) || '[]');
        if (Array.isArray(dadosLocais)) locais = dadosLocais.filter(function (item) { return item && !item.padrao; });
      } catch (error) {
        console.error('Não foi possível ler as unidades antigas deste navegador:', error);
      }
      aviso.hidden = !podeEditar || !window.usuarioAtual.isAdmin ||
        localStorage.getItem(DB_KEY_UNIDADE_IMPORTADA) === 'true' || !locais.length;
    }
  }

  function renderComposicoes() {
    const container = document.getElementById('listaComposicoes');
    if (!container) return;
    const podeEditar = usuarioPodeEditarCatalogos();
    const botaoAdicionar = document.getElementById('btnAddComposicao');
    const contagem = document.getElementById('contagemComposicoes');
    const base = baseSelecionada('baseComposicao');
    const buscaSinapi = document.getElementById('buscaSinapiComposicoes');
    const origemSinapi = base === 'sinapi';
    container.hidden = origemSinapi;
    if (buscaSinapi) buscaSinapi.hidden = !origemSinapi;
    if (botaoAdicionar) {
      botaoAdicionar.hidden = !podeEditar || origemSinapi;
      botaoAdicionar.disabled = Boolean(erroCatalogos);
    }
    if (contagem) contagem.hidden = origemSinapi;
    if (origemSinapi) return;
    if (erroCatalogo(container)) {
      if (contagem) contagem.textContent = 'Catálogo indisponível';
      return;
    }
    const itens = window.Composicoes.carregar().filter(function (item) {
      return item.base === 'propria' || !item.base;
    });
    if (contagem) contagem.textContent = itens.length + (itens.length === 1 ? ' composição' : ' composições');

    if (!itens.length) {
      container.className = 'catalogo-empty';
      container.innerHTML = '<span class="catalogo-empty-icon" aria-hidden="true">' + window.icone(base === 'sinapi' ? 'buscar' : 'mais') + '</span>' +
        '<h3>' + (base === 'sinapi' ? 'Nenhuma composição SINAPI nesta lista' : 'Seu catálogo próprio começa aqui') + '</h3>' +
        '<p>' + (base === 'sinapi'
          ? 'Busque uma composição pelo código ou descrição para consultar e usar os dados da SINAPI.'
          : 'Cadastre composições próprias para reutilizá-las nos serviços dos seus orçamentos.') + '</p>';
      return;
    }

    container.className = 'catalogo-lista lista-itens';
    container.innerHTML = itens.map(function (item) {
      return '<article class="item-catalogo" data-base="' + escaparHtml(item.base || 'propria') + '">' +
        '<div class="item-header">' +
          '<span class="item-codigo">' + escaparHtml(item.codigoReferencia || item.codigo || '—') + '</span>' +
          '<span class="item-base">' + (item.base === 'sinapi' ? 'SINAPI' : 'Própria') + '</span>' +
        '</div>' +
        '<div class="item-nome">' + escaparHtml(item.nome || 'Sem nome') + '</div>' +
        '<div class="item-meta">' + escaparHtml(item.descricao || 'Sem descrição') + '</div>' +
        '<div class="item-footer">' +
          '<span>' + escaparHtml(item.unidade || 'un') + (item.componentes && item.componentes.length ? ' · ' + item.componentes.length + ' componente(s)' : '') + '</span>' +
          '<strong>R$ ' + formatarReal(item.valorUnitario) + '</strong>' +
        '</div>' +
        '<div class="item-acoes">' +
          (podeEditar && item.base === 'propria' ? '<button type="button" class="btn btn-ghost btn-xs" data-item-id="' + escaparHtml(item.id) + '" data-acao="editar-composicao">Editar</button>' : '') +
          (podeEditar ? '<button type="button" class="btn btn-ghost btn-xs" data-item-id="' + escaparHtml(item.id) + '" data-item-tipo="composicao" data-acao="remover">Remover</button>' : '') +
        '</div>' +
      '</article>';
    }).join('');
  }

  function renderInsumos() {
    const container = document.getElementById('listaInsumos');
    if (!container) return;
    const podeEditar = usuarioPodeEditarCatalogos();
    const botaoAdicionar = document.getElementById('btnAddInsumo');
    const contagem = document.getElementById('contagemInsumos');
    const base = baseSelecionada('baseInsumo');
    const buscaSinapi = document.getElementById('buscaSinapiInsumos');
    const origemSinapi = base === 'sinapi';
    container.hidden = origemSinapi;
    if (buscaSinapi) buscaSinapi.hidden = !origemSinapi;
    if (botaoAdicionar) {
      botaoAdicionar.hidden = !podeEditar || origemSinapi;
      botaoAdicionar.disabled = Boolean(erroCatalogos);
    }
    if (contagem) contagem.hidden = origemSinapi;
    if (origemSinapi) return;
    if (erroCatalogo(container)) {
      if (contagem) contagem.textContent = 'Catálogo indisponível';
      return;
    }
    const itens = window.Insumos.carregar().filter(function (item) {
      return item.base === 'propria' || !item.base;
    });
    if (contagem) contagem.textContent = itens.length + (itens.length === 1 ? ' insumo' : ' insumos');

    if (!itens.length) {
      container.className = 'catalogo-empty';
      container.innerHTML = '<span class="catalogo-empty-icon" aria-hidden="true">' + window.icone(base === 'sinapi' ? 'buscar' : 'mais') + '</span>' +
        '<h3>' + (base === 'sinapi' ? 'Nenhum insumo SINAPI nesta lista' : 'Seu catálogo próprio começa aqui') + '</h3>' +
        '<p>' + (base === 'sinapi'
          ? 'Busque um insumo pelo código ou descrição para consultar e usar os dados da SINAPI.'
          : 'Cadastre materiais, equipamentos e serviços auxiliares para compor suas composições.') + '</p>';
      return;
    }

    container.className = 'catalogo-lista lista-itens';
    container.innerHTML = itens.map(function (item) {
      return '<article class="item-catalogo" data-base="' + escaparHtml(item.base || 'propria') + '">' +
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
          (podeEditar && item.base === 'propria' ? '<button type="button" class="btn btn-ghost btn-xs" data-item-id="' + escaparHtml(item.id) + '" data-acao="editar-insumo">Editar</button>' : '') +
          (podeEditar ? '<button type="button" class="btn btn-ghost btn-xs" data-item-id="' + item.id + '" data-item-tipo="insumo" data-acao="remover">Remover</button>' : '') +
        '</div>' +
      '</article>';
    }).join('');
  }

  function iniciarBuscaSinapiCatalogo(tipo) {
    const composicao = tipo === 'composicao';
    const form = document.getElementById(composicao ? 'formBuscaCatalogoComposicao' : 'formBuscaCatalogoInsumo');
    const campo = document.getElementById(composicao ? 'buscaCatalogoComposicao' : 'buscaCatalogoInsumo');
    const status = document.getElementById(composicao ? 'statusBuscaCatalogoComposicao' : 'statusBuscaCatalogoInsumo');
    const resultados = document.getElementById(composicao ? 'resultadosCatalogoComposicao' : 'resultadosCatalogoInsumo');
    if (!form || !campo || !status || !resultados) return;

    let requisicao = 0;
    const itensPorCodigo = new Map();
    function mensagemStatus(texto, classe) {
      status.textContent = texto;
      status.className = 'sinapi-status' + (classe ? ' ' + classe : '');
    }
    function formatarValor(valor) {
      if (valor === null || valor === undefined || !Number.isFinite(Number(valor))) return '—';
      return Number(valor).toLocaleString('pt-BR', {minimumFractionDigits: 2, maximumFractionDigits: 2});
    }
    function mensagemErro(error) {
      if (error.message === 'sinapi_indisponivel') return 'O serviço SINAPI está indisponível. Tente novamente em instantes.';
      if (error.message === 'sinapi_nao_encontrado') return 'O código informado não foi encontrado na base SINAPI de São Paulo.';
      if (error.message === 'item_duplicado') return 'Este item foi copiado por outro usuário. Atualize sua base para evitar duplicatas.';
      if (error.message === 'sinapi_composicao_extensa') return 'A composição possui níveis ou quantidade de itens além do limite de cópia.';
      if (error.message === 'sinapi_composicao_invalida') return 'A SINAPI retornou componentes incompletos; nada foi copiado. Tente novamente mais tarde.';
      if (error.message === 'somente_visualizacao') return 'Sua conta tem acesso somente para visualizar; não pode copiar itens para a base própria.';
      if (error.message === 'nao_autenticado') return 'Entre novamente para copiar itens para a base própria.';
      return error.message || 'Não foi possível consultar a SINAPI.';
    }
    async function pedirJson(url, opcoes) {
      let resposta;
      try {
        resposta = await fetch(url, opcoes);
      } catch (error) {
        throw new Error('Não foi possível conectar ao servidor.');
      }
      const dados = await resposta.json().catch(function () { throw new Error('O servidor retornou uma resposta inválida.'); });
      if (!resposta.ok) throw new Error(dados.erro || 'A consulta falhou (HTTP ' + resposta.status + ').');
      return dados;
    }
    function renderizarDetalhesComposicao(itens) {
      if (!Array.isArray(itens) || !itens.length) return '<p class="dica">A composição não possui itens detalhados nesta referência.</p>';
      const linhas = itens.map(function (item) {
        return '<tr><td>' + escaparHtml(item.tipo === 'SUB_COMPOSITION' ? 'Subcomposição' : 'Insumo') + '</td>' +
          '<td>' + escaparHtml(item.codigo) + '</td>' +
          '<td>' + escaparHtml(item.descricao) + '</td>' +
          '<td>' + escaparHtml(Number(item.coeficiente).toLocaleString('pt-BR', {maximumFractionDigits: 6})) + '</td>' +
          '<td>' + escaparHtml(unidadeSinapi(item.unidade)) + '</td>' +
          '<td>R$ ' + formatarValor(item.valorUnitario) + '</td>' +
          '<td>R$ ' + formatarValor(item.valorTotal) + '</td></tr>';
      }).join('');
      return '<div class="sinapi-itens-wrap"><table class="ua-table sinapi-itens"><thead><tr>' +
        '<th>Tipo</th><th>Código</th><th>Descrição</th><th>Coeficiente</th><th>Un.</th><th>Preço unitário</th><th>Total</th>' +
        '</tr></thead><tbody>' + linhas + '</tbody></table></div>';
    }
    function renderizarResultados(lista) {
      itensPorCodigo.clear();
      resultados.innerHTML = lista.map(function (item) {
        const codigo = String(item.codigo);
        itensPorCodigo.set(codigo, item);
        const botaoCopiar = usuarioPodeEditarCatalogos()
          ? '<button type="button" class="btn btn-primary btn-sm" data-sinapi-copiar="' + escaparHtml(codigo) + '">' +
            (composicao ? 'Copiar composição' : 'Copiar insumo') + '</button>'
          : '';
        return '<article class="sinapi-catalogo-item" data-codigo="' + escaparHtml(codigo) + '">' +
          '<div class="sinapi-catalogo-item-info"><strong>' + escaparHtml(codigo) + '</strong>' +
          '<h3>' + escaparHtml(item.descricao) + '</h3><span>' + escaparHtml(unidadeSinapi(item.unidade)) +
          (item.referencia ? ' · Referência ' + escaparHtml(item.referencia) : '') + '</span></div>' +
          '<strong class="sinapi-catalogo-preco">R$ ' + formatarValor(item.valor) + '</strong>' +
          '<div class="sinapi-catalogo-item-acoes">' +
          '<button type="button" class="btn btn-ghost btn-sm" data-sinapi-detalhes="' + escaparHtml(codigo) + '">' +
          (composicao ? 'Ver itens' : 'Ver detalhes') + '</button>' +
          botaoCopiar + '</div>' +
          '<div class="sinapi-catalogo-detalhes" hidden></div></article>';
      }).join('');
    }

    form.addEventListener('submit', async function (event) {
      event.preventDefault();
      const termo = campo.value.trim();
      const atual = ++requisicao;
      if (!termo) {
        mensagemStatus('Digite um código ou uma descrição para buscar.', 'erro');
        resultados.replaceChildren();
        return;
      }
      mensagemStatus('Buscando na SINAPI…');
      resultados.innerHTML = '<p class="dica">Consultando a base SINAPI de São Paulo…</p>';
      const url = composicao
        ? (/^\d+$/.test(termo) ? '/api/sinapi/composicao?codigo=' + encodeURIComponent(termo) : '/api/sinapi/buscar?q=' + encodeURIComponent(termo))
        : '/api/sinapi/insumos?q=' + encodeURIComponent(termo);
      try {
        const dados = await pedirJson(url);
        if (atual !== requisicao) return;
        if (composicao && /^\d+$/.test(termo)) {
          if (!dados.encontrado) {
            resultados.replaceChildren();
            mensagemStatus('Nenhuma composição encontrada para esse código.', 'erro');
            return;
          }
          renderizarResultados([dados]);
        } else {
          const lista = Array.isArray(dados.resultados) ? dados.resultados : [];
          renderizarResultados(lista);
          mensagemStatus(lista.length + (lista.length === 1 ? ' resultado encontrado.' : ' resultados encontrados.'), 'ok');
          return;
        }
        mensagemStatus('Composição encontrada.', 'ok');
      } catch (error) {
        if (atual !== requisicao) return;
        resultados.replaceChildren();
        mensagemStatus(mensagemErro(error), 'erro');
      }
    });

    resultados.addEventListener('click', async function (event) {
      const botaoDetalhes = event.target.closest('[data-sinapi-detalhes]');
      const botaoCopiar = event.target.closest('[data-sinapi-copiar]');
      if (botaoDetalhes) {
        const codigo = botaoDetalhes.getAttribute('data-sinapi-detalhes');
        const artigo = botaoDetalhes.closest('.sinapi-catalogo-item');
        const area = artigo.querySelector('.sinapi-catalogo-detalhes');
        if (!area.hidden) {
          area.hidden = true;
          botaoDetalhes.textContent = composicao ? 'Ver itens' : 'Ver detalhes';
          return;
        }
        area.hidden = false;
        botaoDetalhes.textContent = 'Ocultar detalhes';
        area.textContent = 'Carregando detalhes…';
        try {
          const dados = await pedirJson(composicao
            ? '/api/sinapi/composicao?codigo=' + encodeURIComponent(codigo)
            : '/api/sinapi/insumo?codigo=' + encodeURIComponent(codigo));
          if (!dados.encontrado) throw new Error('sinapi_nao_encontrado');
          if (composicao) {
            area.innerHTML = renderizarDetalhesComposicao(dados.itens);
          } else {
            area.innerHTML = '<dl class="sinapi-item-detalhes">' +
              (dados.referencia ? '<div><dt>Referência</dt><dd>' + escaparHtml(dados.referencia) + '</dd></div>' : '') +
              (dados.normas ? '<div><dt>Normas técnicas</dt><dd>' + escaparHtml(dados.normas) + '</dd></div>' : '') +
              (dados.detalhes ? '<div><dt>Informações técnicas</dt><dd>' + escaparHtml(dados.detalhes) + '</dd></div>' : '') +
              '</dl>';
          }
        } catch (error) {
          area.textContent = mensagemErro(error);
        }
        return;
      }
      if (!botaoCopiar) return;
      const codigo = botaoCopiar.getAttribute('data-sinapi-copiar');
      const item = itensPorCodigo.get(codigo);
      if (!item) return;
      botaoCopiar.disabled = true;
      mensagemStatus('Copiando para a base própria…');
      try {
        const dados = await pedirJson('/api/catalogos', {
          method: 'POST',
          headers: {'Content-Type': 'application/json'},
          body: JSON.stringify({importarSinapi: {tipo: composicao ? 'composicao' : 'insumo', codigo}})
        });
        await carregarCatalogos();
        renderComposicoes();
        renderInsumos();
        const importadas = dados.importadas || {};
        const composicoesNovas = Number(importadas.composicoes || 0);
        const insumosNovos = Number(importadas.insumos || 0);
        const partes = [];
        if (composicoesNovas) partes.push(composicoesNovas + (composicoesNovas === 1 ? ' composição' : ' composições'));
        if (insumosNovos) partes.push(insumosNovos + (insumosNovos === 1 ? ' insumo' : ' insumos'));
        if (dados.duplicada) {
          mensagemStatus('A composição principal já existe na sua base própria.' +
            (partes.length ? ' Foram adicionados componentes ausentes: ' + partes.join(' e ') + '.' : ' Nenhum componente novo precisou ser copiado.'), 'ok');
        } else {
          mensagemStatus('Copiado para Próprios: ' + (partes.join(' e ') || 'nenhum novo componente') + '.', 'ok');
        }
      } catch (error) {
        mensagemStatus(mensagemErro(error), 'erro');
      } finally {
        botaoCopiar.disabled = false;
      }
    });
  }
  async function registrarResultadoSinapi(resultado) {
    if (!resultado || !resultado.codigo) return;
    const view = document.querySelector('.content:not(.hidden)');
    if (!view) return;

    if (view.id === 'viewComposicoes') {
      await enviarCatalogo('POST', {importarSinapi: {tipo: 'composicao', codigo: String(resultado.codigo)}});
      await carregarCatalogos();
      document.querySelectorAll('input[name="baseComposicao"]').forEach(function (radio) { radio.checked = radio.value === 'propria'; });
      renderComposicoes();
    } else if (view.id === 'viewInsumos') {
      await enviarCatalogo('POST', {importarSinapi: {tipo: 'insumo', codigo: String(resultado.codigo)}});
      await carregarCatalogos();
      document.querySelectorAll('input[name="baseInsumo"]').forEach(function (radio) { radio.checked = radio.value === 'propria'; });
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
      '<td><button type="button" class="btn-icon btn-danger" data-remover-conversao title="Remover conversão" aria-label="Remover conversão">' + window.icone('fechar') + '</button></td>';
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
      '<button type="button" class="btn-icon btn-danger" data-remover-detalhe title="Remover detalhe" aria-label="Remover detalhe">' + window.icone('fechar') + '</button>';
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
    const composicoes = window.Composicoes.carregar();
    const selecionado = componente && (componente.composicaoId || componente.tipo === 'composicao')
      ? 'composicao:' + (componente.composicaoId || '')
      : componente && componente.insumoId
        ? 'insumo:' + componente.insumoId + (componente.detalheId ? ':' + componente.detalheId : '')
        : '';
    const opcoes = ['<option value="">Selecione um insumo ou composição</option>'];
    insumos.forEach(function (insumo) {
      const codigo = (insumo.codigo || '') + ' — ' + insumo.nome;
      opcoes.push('<option value="insumo:' + escaparHtml(insumo.id) + '">' + escaparHtml(codigo + (insumo.detalhes && insumo.detalhes.length ? ' — Principal' : '')) + '</option>');
      (insumo.detalhes || []).forEach(function (detalhe) {
        opcoes.push('<option value="insumo:' + escaparHtml(insumo.id + ':' + detalhe.id) + '">' + escaparHtml(codigo + ' — ' + detalhe.nome) + '</option>');
      });
    });
    composicoes.forEach(function (item) {
      if (item.id === document.getElementById('fComposicaoId').value) return;
      opcoes.push('<option value="composicao:' + escaparHtml(item.id) + '">' +
        escaparHtml((item.codigo || '') + ' — ' + item.nome) + '</option>');
    });
    if (componente && componente.composicaoId && !composicoes.some(function (item) { return item.id === componente.composicaoId; })) {
      opcoes.push('<option value="' + escaparHtml(selecionado) + '">' + escaparHtml(componente.nome + ' (sem cadastro)') + '</option>');
    } else if (componente && componente.insumoId && !insumos.some(function (i) { return i.id === componente.insumoId; })) {
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
      '<td><button type="button" class="btn-icon btn-danger" data-remover-componente title="Remover componente" aria-label="Remover componente">' + window.icone('fechar') + '</button></td>';
    tbody.appendChild(linha);
    linha.querySelector('.componente-insumo').value = selecionado;
    atualizarLinhaComponente(linha);
  }

  function atualizarLinhaComponente(linha) {
    const [tipo, id, detalheId] = linha.querySelector('.componente-insumo').value.split(':');
    const insumo = tipo === 'insumo' && window.Insumos.carregar().find(function (i) { return i.id === id; });
    const composicao = tipo === 'composicao' && window.Composicoes.carregar().find(function (i) { return i.id === id; });
    if (insumo) {
      const detalhe = (insumo.detalhes || []).find(function (d) { return d.id === detalheId; });
      linha.dataset.insumoNome = insumo.nome + (detalhe ? ' — ' + detalhe.nome : '');
      linha.dataset.insumoUnidade = (buscarUnidade(insumo.unidadeBaseId || insumo.unidade) || {}).simbolo || insumo.unidade || 'un';
      linha.dataset.insumoValor = insumo.valorUnitario || 0;
    } else if (composicao) {
      linha.dataset.insumoNome = composicao.nome;
      linha.dataset.insumoUnidade = composicao.unidade || 'un';
      linha.dataset.insumoValor = composicao.valorUnitario || 0;
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
    iniciarBuscaSinapiCatalogo('composicao');
    iniciarBuscaSinapiCatalogo('insumo');

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
    document.getElementById('formInsumo').addEventListener('submit', async function (ev) {
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
      const botao = ev.currentTarget.querySelector('[type="submit"]');
      botao.disabled = true;
      try {
        if (id) {
          await window.Insumos.atualizar(id, dados);
        } else {
          await window.Insumos.adicionar(dados.nome, dados.descricao, dados.unidade, dados.valorUnitario, 'propria', {unidadeBaseId: dados.unidadeBaseId, conversoes: dados.conversoes, detalhes: dados.detalhes});
        }
        renderInsumos();
        renderComposicoes();
        document.getElementById('modalInsumo').close();
      } catch (error) {
        alert(error.message || 'Não foi possível salvar o insumo.');
      } finally {
        botao.disabled = false;
      }
    });

    document.getElementById('btnAddUnidadeMedida').addEventListener('click', function () { abrirEditorUnidade(null); });
    document.getElementById('btnCancelarUnidade').addEventListener('click', function () { document.getElementById('modalUnidade').close(); });
    document.getElementById('formUnidade').addEventListener('submit', async function (ev) {
      ev.preventDefault();
      const id = document.getElementById('fUnidadeCadastroId').value;
      const dados = {
        simbolo: document.getElementById('fUnidadeSimbolo').value.trim(),
        nome: document.getElementById('fUnidadeNome').value.trim(),
        grupo: document.getElementById('fUnidadeGrupo').value
      };
      if (!dados.simbolo || !dados.nome) { alert('Informe o símbolo e o nome da unidade.'); return; }
      const botao = ev.currentTarget.querySelector('[type="submit"]');
      botao.disabled = true;
      try {
        const unidade = id ? await window.Unidades.atualizar(id, dados) : await window.Unidades.adicionar(dados);
        if (!unidade) { alert('Já existe uma unidade com esse símbolo.'); return; }
        renderUnidades();
        renderInsumos();
        renderComposicoes();
        document.getElementById('modalUnidade').close();
      } catch (error) {
        alert(error.message || 'Não foi possível salvar a unidade.');
      } finally {
        botao.disabled = false;
      }
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
    document.getElementById('formComposicao').addEventListener('submit', async function (ev) {
      ev.preventDefault();
      const linhas = Array.from(document.querySelectorAll('#componentesComposicao tr'));
      if (!linhas.length) { alert('Adicione ao menos um insumo ou uma composição à composição.'); return; }
      const componentes = linhas.map(function (linha) {
        const [tipo, idComponente, detalheId] = linha.querySelector('.componente-insumo').value.split(':');
        if (tipo === 'composicao') {
          const composicao = window.Composicoes.carregar().find(function (item) { return item.id === idComponente; });
          return {
            tipo: 'composicao',
            composicaoId: idComponente,
            nome: composicao ? composicao.nome : linha.dataset.insumoNome,
            unidade: composicao ? composicao.unidade : linha.dataset.insumoUnidade,
            valorUnitario: composicao ? parseReal(composicao.valorUnitario) : parseReal(linha.dataset.insumoValor),
            coeficiente: parseReal(linha.querySelector('.componente-coeficiente').value)
          };
        }
        const insumoId = idComponente;
        const insumo = window.Insumos.carregar().find(function (i) { return i.id === insumoId; });
        const detalhe = insumo && (insumo.detalhes || []).find(function (d) { return d.id === detalheId; });
        return {
          tipo: 'insumo',
          insumoId: insumoId,
          detalheId: detalhe ? detalhe.id : '',
          nome: insumo ? insumo.nome + (detalhe ? ' — ' + detalhe.nome : '') : linha.dataset.insumoNome,
          unidade: insumo ? (buscarUnidade(insumo.unidadeBaseId || insumo.unidade) || {}).simbolo || insumo.unidade : linha.dataset.insumoUnidade,
          valorUnitario: insumo ? parseReal(insumo.valorUnitario) : parseReal(linha.dataset.insumoValor),
          coeficiente: parseReal(linha.querySelector('.componente-coeficiente').value)
        };
      });
      if (componentes.some(function (c) { return (c.tipo === 'composicao' ? !c.composicaoId : !c.insumoId) || !c.nome || c.coeficiente <= 0; })) {
        alert('Selecione um insumo ou composição e informe um coeficiente maior que zero em cada linha.');
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
      const botao = ev.currentTarget.querySelector('[type="submit"]');
      botao.disabled = true;
      try {
        if (id) {
          await window.Composicoes.atualizar(id, dados);
        } else {
          await window.Composicoes.adicionar(dados.nome, dados.descricao, dados.unidade, dados.valorUnitario, 'propria', {componentes: dados.componentes});
        }
        renderComposicoes();
        document.getElementById('modalComposicao').close();
      } catch (error) {
        alert(error.message || 'Não foi possível salvar a composição.');
      } finally {
        botao.disabled = false;
      }
    });

    const btnMigrarUnidades = document.getElementById('btnMigrarUnidadesLocais');
    if (btnMigrarUnidades) btnMigrarUnidades.addEventListener('click', async function () {
      let unidades;
      try {
        unidades = JSON.parse(localStorage.getItem(DB_KEY_UNIDADE) || '[]');
      } catch (error) {
        alert('Não foi possível ler as unidades salvas neste navegador.');
        return;
      }
      if (!Array.isArray(unidades) || !unidades.some(function (item) { return item && !item.padrao; })) {
        alert('Não foram encontradas unidades personalizadas para importar.');
        renderUnidades();
        return;
      }
      const quantidade = unidades.filter(function (item) { return item && !item.padrao; }).length;
      if (!confirm('Importar ' + quantidade + ' unidade(s) personalizada(s) deste navegador para toda a conta? Símbolos já existentes serão ignorados.')) return;
      btnMigrarUnidades.disabled = true;
      try {
        const resposta = await enviarCatalogo('POST', {migrarUnidades: true, unidades});
        localStorage.setItem(DB_KEY_UNIDADE_IMPORTADA, 'true');
        await carregarCatalogos();
        alert(resposta.importadas + ' unidade(s) importada(s) para o catálogo compartilhado.');
      } catch (error) {
        alert(error.message || 'Não foi possível importar as unidades.');
      } finally {
        btnMigrarUnidades.disabled = false;
        renderUnidades();
      }
    });

    document.addEventListener('click', async function (ev) {
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
          try {
            if (!await window.Unidades.excluir(id)) alert('Unidade personalizada não encontrada.');
            renderUnidades();
            renderInsumos();
            renderComposicoes();
          } catch (error) {
            alert(error.message || 'Não foi possível remover a unidade.');
          }
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
      try {
        if (tipo === 'insumo') {
          await window.Insumos.excluir(id);
          renderInsumos();
        } else {
          await window.Composicoes.excluir(id);
          renderComposicoes();
        }
      } catch (error) {
        alert(error.message || 'Não foi possível remover o item do catálogo.');
      }
    });

    window.registrarResultadoSinapiComoItem = registrarResultadoSinapi;
    renderComposicoes();
    renderInsumos();
    renderUnidades();

    document.addEventListener('app:viewchange', function (ev) {
      if (!ev.detail) return;
      if (['composicoes', 'insumos', 'unidades'].includes(ev.detail.view)) {
        carregarCatalogos().catch(function (error) {
          erroCatalogos = error.message || 'Não foi possível atualizar os catálogos compartilhados.';
          console.error('Erro ao atualizar catálogos compartilhados:', error);
          renderComposicoes();
          renderInsumos();
          renderUnidades();
        });
      }
    });
    document.addEventListener('app:profilechange', function () {
      renderComposicoes();
      renderInsumos();
      renderUnidades();
    });
    document.addEventListener('catalogos:loaded', function () {
      renderComposicoes();
      renderInsumos();
      renderUnidades();
    });
  }

  window.catalogosProntos = carregarCatalogos().catch(function (error) {
    erroCatalogos = error.message || 'Não foi possível carregar os catálogos compartilhados.';
    console.error('Erro ao carregar catálogos compartilhados:', error);
    renderComposicoes();
    renderInsumos();
    renderUnidades();
    return false;
  });

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
