/* Ajuda: manual do ERP. Os artigos ficam em ajuda/artigos.html (um <article> por tópico, com fotos
   em ajuda/img e vídeos de demonstração em ajuda/video) e são lidos na primeira vez que a tela abre.
   Índice por grupo, busca sem acentos, um artigo por vez com anterior/próximo, fotos ampliáveis e
   o botão "Abrir a tela". O botão Ajuda do topo abre o artigo da tela em que a pessoa está, e o
   endereço #ajuda/<id> abre um artigo direto (dá para mandar o link).
   window.Ajuda.abrir(id) abre um artigo pelo código. */
(function () {
  'use strict';

  var view = document.getElementById('viewAjuda');
  if (!view) return;
  var indiceEl = document.getElementById('ajudaIndice');
  var artigoEl = document.getElementById('ajudaArtigo');
  var buscaEl = document.getElementById('ajudaBusca');
  var lateral = view.querySelector('.ajuda-lateral');
  var CHAVE = 'erp_ajuda_artigo';
  var INICIAL = 'boas-vindas';

  // tela (view do menu ou tela de Suprimentos) -> artigo
  var POR_VIEW = {
    dashboard: 'inicio', orcamento: 'orcamento', planejamento: 'cronograma', calendarios: 'calendarios',
    composicoes: 'catalogo', insumos: 'catalogo', unidades: 'catalogo', financeiro: 'contas-pagar',
    usuarios: 'usuarios-permissoes', liberacao: 'liberacao-backup', backup: 'liberacao-backup', sinapi: 'base-sinapi'
  };
  var POR_TELA_SUPR = [
    [/^painel/, 'suprimentos'], [/^solicitac/, 'solicitacao'], [/^cotac/, 'cotacao'], [/^pedido/, 'pedido'],
    [/^nota/, 'nota-fiscal'], [/^(contrat|medic|aditiv)/, 'contratos'], [/^estoque/, 'estoque'],
    [/^autoriz/, 'autorizacoes'], [/^acompanh/, 'acompanhamento'], [/^cadastr/, 'fornecedores']
  ];

  var artigos = null;      // [{ id, titulo, grupo, resumo, tela, el, texto, titNorm }]
  var carregando = null;
  var atual = null;
  var pendente = null;     // { id, op } pedido antes de os artigos chegarem
  var telaAnterior = { view: 'dashboard', aba: null };
  var timerBusca = null;

  function esc(v) {
    return String(v == null ? '' : v).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function normalizar(t) { return String(t || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase(); }
  function lerArtigoSalvo() { try { return localStorage.getItem(CHAVE); } catch (e) { return null; } }
  function salvarArtigo(id) { try { localStorage.setItem(CHAVE, id); } catch (e) { /* sem armazenamento */ } }
  function porId(id) { return artigos && artigos.find(function (a) { return a.id === id; }); }

  /* ---------- carga dos artigos ---------- */
  function carregar() {
    if (carregando) return carregando;
    artigoEl.innerHTML = '<p class="ajuda-carregando">Carregando a ajuda…</p>';
    carregando = fetch('/ajuda/artigos.html', { cache: 'no-cache' })
      .then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.text(); })
      .then(function (html) {
        var doc = new DOMParser().parseFromString('<body>' + html + '</body>', 'text/html');
        artigos = Array.prototype.map.call(doc.querySelectorAll('article[id]'), function (el) {
          var titulo = el.getAttribute('data-titulo') || el.id;
          return {
            id: el.id, titulo: titulo, grupo: el.getAttribute('data-grupo') || 'Outros',
            resumo: el.getAttribute('data-resumo') || '', tela: el.getAttribute('data-tela') || '', el: el,
            titNorm: normalizar(titulo + ' ' + (el.getAttribute('data-palavras') || '')),
            texto: normalizar(el.textContent.replace(/\s+/g, ' '))
          };
        });
        desenharIndice();
        return artigos;
      })
      .catch(function (e) {
        carregando = null;
        artigoEl.innerHTML = '<p class="ajuda-carregando">Não foi possível carregar a ajuda (' + esc(e.message) + '). <button type="button" class="btn btn-ghost btn-sm" data-recarregar>Tentar de novo</button></p>';
        throw e;
      });
    return carregando;
  }

  function grupos(lista) {
    var ordem = [];
    var mapa = {};
    lista.forEach(function (a) {
      if (!mapa[a.grupo]) { mapa[a.grupo] = []; ordem.push(a.grupo); }
      mapa[a.grupo].push(a);
    });
    return ordem.map(function (g) { return { nome: g, artigos: mapa[g] }; });
  }

  /* ---------- índice ---------- */
  function desenharIndice(resultado) {
    if (!artigos) return;
    var lista = resultado || artigos;
    if (resultado && !resultado.length) {
      indiceEl.innerHTML = '<p class="ajuda-sem-resultado">Nada encontrado.</p>';
      return;
    }
    indiceEl.innerHTML = grupos(lista).map(function (g) {
      return '<div class="ajuda-grupo"><p class="ajuda-grupo-nome">' + esc(g.nome) + '</p><ul>' +
        g.artigos.map(function (a) {
          return '<li><a href="#ajuda/' + esc(a.id) + '" data-artigo="' + esc(a.id) + '"' + (atual === a.id ? ' aria-current="page"' : '') + '>' + esc(a.titulo) + '</a></li>';
        }).join('') + '</ul></div>';
    }).join('');
  }
  function marcarAtualNoIndice() {
    indiceEl.querySelectorAll('[data-artigo]').forEach(function (l) {
      if (l.dataset.artigo === atual) l.setAttribute('aria-current', 'page'); else l.removeAttribute('aria-current');
    });
  }

  /* ---------- artigo ---------- */
  // botão "Abrir a tela" só quando o item do menu existe e está visível para a pessoa
  function itemDoMenu(tela) {
    if (!tela) return null;
    var p = tela.split(':');
    var sel = '.app-sidebar-item[data-view="' + p[0] + '"]' + (p[1] ? '[data-aba="' + p[1] + '"]' : '');
    var it = document.querySelector(sel);
    if (!it || it.classList.contains('hidden') || it.classList.contains('sem-permissao')) return null;
    var grupo = it.closest('.app-sidebar-group');
    if (grupo && grupo.classList.contains('sem-permissao')) return null;
    return it;
  }

  function abrir(id, op) {
    op = op || {};
    if (!artigos) {
      // vale o último pedido feito enquanto os artigos chegam
      var esperando = Boolean(pendente);
      pendente = { id: id, op: op };
      if (!esperando) carregar().then(function () { var p = pendente; pendente = null; if (p) abrir(p.id, p.op); }).catch(function () { pendente = null; });
      return;
    }
    var a = porId(id) || porId(INICIAL);
    atual = a.id;
    salvarArtigo(a.id);
    var pos = artigos.indexOf(a);
    var ant = artigos[pos - 1];
    var prox = artigos[pos + 1];
    var abrirTela = itemDoMenu(a.tela);
    artigoEl.innerHTML =
      '<header class="ajuda-cab"><p class="ajuda-eyebrow">' + esc(a.grupo) + '</p>' +
      '<div class="ajuda-cab-linha"><h2>' + esc(a.titulo) + '</h2>' +
      (abrirTela ? '<button type="button" class="btn btn-ghost btn-sm" data-abrir-tela="' + esc(a.tela) + '">Abrir a tela<svg class="ic ic-sm" aria-hidden="true"><use href="#i-seta-dir"/></svg></button>' : '') +
      '</div></header><div class="ajuda-corpo"></div>' +
      '<nav class="ajuda-navegacao" aria-label="Outros tópicos">' +
      (ant ? '<a href="#ajuda/' + esc(ant.id) + '" data-artigo="' + esc(ant.id) + '" class="ant"><small>Anterior</small>' + esc(ant.titulo) + '</a>' : '<span></span>') +
      (prox ? '<a href="#ajuda/' + esc(prox.id) + '" data-artigo="' + esc(prox.id) + '" class="prox"><small>Próximo</small>' + esc(prox.titulo) + '</a>' : '<span></span>') +
      '</nav>';
    var corpo = artigoEl.querySelector('.ajuda-corpo');
    Array.prototype.forEach.call(a.el.childNodes, function (n) { corpo.appendChild(document.importNode(n, true)); });
    preencherCartoes(corpo);
    marcarAtualNoIndice();
    if (!op.semHash && location.hash !== '#ajuda/' + a.id) history.replaceState(null, '', '#ajuda/' + a.id);
    if (!op.manterRolagem) {
      artigoEl.scrollTop = 0;
      var topo = view.getBoundingClientRect().top + window.scrollY - 60;
      if (window.scrollY > topo) window.scrollTo(0, Math.max(0, topo));
    }
    if (lateral) lateral.classList.remove('aberta');
  }

  // cartões dos grupos no artigo de boas-vindas
  function preencherCartoes(corpo) {
    var alvo = corpo.querySelector('[data-cartoes]');
    if (!alvo) return;
    alvo.innerHTML = grupos(artigos.filter(function (a) { return a.id !== INICIAL; })).map(function (g) {
      return '<section class="ajuda-cartao"><h4>' + esc(g.nome) + '</h4><ul>' + g.artigos.map(function (a) {
        return '<li><a href="#ajuda/' + esc(a.id) + '" data-artigo="' + esc(a.id) + '">' + esc(a.titulo) + '</a><span>' + esc(a.resumo) + '</span></li>';
      }).join('') + '</ul></section>';
    }).join('');
  }

  /* ---------- busca ---------- */
  function trecho(a, palavras) {
    var bruto = a.el.textContent.replace(/\s+/g, ' ').trim();
    var norm = normalizar(bruto);
    var i = -1;
    palavras.some(function (p) { i = norm.indexOf(p); return i >= 0; });
    if (i < 0) return esc(a.resumo);
    var ini = Math.max(0, i - 70);
    var fim = Math.min(bruto.length, i + 150);
    var t = bruto.slice(ini, fim);
    var tn = norm.slice(ini, fim);
    // marca as palavras no trecho original (mesmas posições do texto normalizado)
    var marcas = [];
    palavras.forEach(function (p) {
      var k = tn.indexOf(p);
      while (k >= 0) { marcas.push([k, k + p.length]); k = tn.indexOf(p, k + p.length); }
    });
    marcas.sort(function (x, y) { return x[0] - y[0]; });
    var html = '';
    var pos = 0;
    marcas.forEach(function (m) {
      if (m[0] < pos) return;
      html += esc(t.slice(pos, m[0])) + '<mark>' + esc(t.slice(m[0], m[1])) + '</mark>';
      pos = m[1];
    });
    html += esc(t.slice(pos));
    return (ini > 0 ? '… ' : '') + html + (fim < bruto.length ? ' …' : '');
  }

  function buscar() {
    if (!artigos) return;
    var termo = normalizar(buscaEl.value).trim();
    var palavras = termo.split(/[\s,;]+/).filter(function (p) { return p.length >= 2; });
    if (!palavras.length) {
      desenharIndice();
      if (atual) abrir(atual, { manterRolagem: true, semHash: true }); else abrir(INICIAL);
      return;
    }
    var achados = artigos.map(function (a) {
      var ok = palavras.every(function (p) { return a.texto.indexOf(p) >= 0 || a.titNorm.indexOf(p) >= 0; });
      if (!ok) return null;
      var pontos = palavras.reduce(function (s, p) { return s + (a.titNorm.indexOf(p) >= 0 ? 10 : 0) + Math.min(5, a.texto.split(p).length - 1); }, 0);
      return { a: a, pontos: pontos };
    }).filter(Boolean).sort(function (x, y) { return y.pontos - x.pontos; });
    desenharIndice(achados.map(function (x) { return x.a; }));
    artigoEl.innerHTML = '<header class="ajuda-cab"><p class="ajuda-eyebrow">Busca</p><h2>' +
      (achados.length ? achados.length + ' tópico' + (achados.length > 1 ? 's' : '') + ' para “' + esc(buscaEl.value.trim()) + '”' : 'Nada encontrado para “' + esc(buscaEl.value.trim()) + '”') + '</h2></header>' +
      (achados.length
        ? '<ul class="ajuda-resultados">' + achados.map(function (x) {
          return '<li><a href="#ajuda/' + esc(x.a.id) + '" data-artigo="' + esc(x.a.id) + '"><small>' + esc(x.a.grupo) + '</small><b>' + esc(x.a.titulo) + '</b><span>' + trecho(x.a, palavras) + '</span></a></li>';
        }).join('') + '</ul>'
        : '<p class="ajuda-sem-resultado">Tente outras palavras, ou veja as <a href="#ajuda/faq" data-artigo="faq">Dúvidas frequentes</a>.</p>');
  }

  /* ---------- foto ampliada ---------- */
  var zoom = null;
  function ampliar(img) {
    if (!zoom) {
      zoom = document.createElement('dialog');
      zoom.className = 'ajuda-zoom';
      zoom.innerHTML = '<button type="button" class="ajuda-zoom-fechar" aria-label="Fechar"><svg class="ic" aria-hidden="true"><use href="#i-fechar"/></svg></button><img alt=""><p></p>';
      zoom.addEventListener('click', function () { zoom.close(); });
      document.body.appendChild(zoom);
    }
    zoom.querySelector('img').src = img.currentSrc || img.src;
    zoom.querySelector('img').alt = img.alt;
    var leg = img.closest('figure') && img.closest('figure').querySelector('figcaption');
    zoom.querySelector('p').textContent = leg ? leg.textContent : '';
    zoom.showModal();
  }

  /* ---------- eventos ---------- */
  view.addEventListener('click', function (ev) {
    var link = ev.target.closest('[data-artigo]');
    if (link) {
      ev.preventDefault();
      if (buscaEl.value && !link.closest('.ajuda-lateral')) { buscaEl.value = ''; desenharIndice(); }
      abrir(link.dataset.artigo);
      return;
    }
    var tela = ev.target.closest('[data-abrir-tela]');
    if (tela && window.ErpNav) {
      var p = tela.dataset.abrirTela.split(':');
      var it = itemDoMenu(tela.dataset.abrirTela);
      if (it) it.click(); else window.ErpNav.abrir(p[0], p[1] || null);
      return;
    }
    var img = ev.target.closest('.ajuda-foto img');
    if (img) { ampliar(img); return; }
    if (ev.target.closest('[data-recarregar]')) { carregar().then(function () { abrir(lerArtigoSalvo() || INICIAL); }).catch(function () {}); return; }
    if (ev.target.closest('[data-topicos]') && lateral) lateral.classList.toggle('aberta');
  });
  buscaEl.addEventListener('input', function () {
    clearTimeout(timerBusca);
    timerBusca = setTimeout(buscar, 120);
  });
  buscaEl.addEventListener('keydown', function (ev) {
    if (ev.key === 'Escape' && buscaEl.value) { buscaEl.value = ''; buscar(); }
  });

  // artigo da tela em que a pessoa estava
  function artigoDaTela(t) {
    if (t.view === 'suprimentos') {
      var tela = (window.Supr && window.Supr.estado && window.Supr.estado.aba) || t.aba || 'painel';
      for (var i = 0; i < POR_TELA_SUPR.length; i++) if (POR_TELA_SUPR[i][0].test(tela)) return POR_TELA_SUPR[i][1];
      return 'suprimentos';
    }
    if (t.view === 'planejamento') {
      var modo = document.querySelector('#planConteudo [data-chips="modo"] .ativo, #planConteudo [data-chips="modo"] [aria-pressed="true"]');
      if (modo && /avanco|curva/.test(modo.dataset.valor || '')) return 'avanco';
    }
    return POR_VIEW[t.view] || INICIAL;
  }

  var botaoTopo = document.getElementById('btnAjudaContexto');
  if (botaoTopo) botaoTopo.addEventListener('click', function () {
    var id = telaAnterior.view === 'ajuda' ? (atual || INICIAL) : artigoDaTela(telaAnterior);
    if (buscaEl.value) { buscaEl.value = ''; desenharIndice(); }
    if (window.ErpNav) window.ErpNav.abrir('ajuda');
    abrir(id);
  });

  document.addEventListener('app:viewchange', function (ev) {
    var d = ev.detail || {};
    if (d.view === 'ajuda') {
      if (!atual) abrir(lerArtigoSalvo() || INICIAL);
      if (botaoTopo) botaoTopo.setAttribute('aria-pressed', 'true');
    } else {
      telaAnterior = { view: d.view, aba: d.aba || null };
      if (botaoTopo) botaoTopo.setAttribute('aria-pressed', 'false');
      if (/^#ajuda/.test(location.hash)) history.replaceState(null, '', location.pathname + location.search);
      artigoEl.querySelectorAll('video').forEach(function (v) { v.pause(); });
    }
  });

  // link direto: /#ajuda/cotacao
  function pelaUrl() {
    var m = /^#ajuda(?:\/([\w-]+))?$/.exec(location.hash);
    if (!m) return;
    if (window.ErpNav) window.ErpNav.abrir('ajuda');
    abrir(m[1] || INICIAL, { semHash: !m[1] });
  }
  window.addEventListener('hashchange', pelaUrl);
  pelaUrl();

  window.Ajuda = { abrir: function (id) { if (window.ErpNav) window.ErpNav.abrir('ajuda'); abrir(id); } };
})();
