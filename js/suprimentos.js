/* ============================================================
   suprimentos.js — Módulo de Suprimentos (v2)
   Requisições → Cotação → Mapa de comparação → Pedidos →
   Confirmação → Recebimento + Comparativo orçado × executado.
   Alinhado à API /api/compras/* (Cloudflare Pages Functions + D1).
   ============================================================ */
(function () {
  'use strict';

  var API = '/api/compras';
  var ME = null;
  var estado = {
    orcamentoId: '',
    itensOrcamento: [],
    carrinho: [],
    requisicoes: [],
    cotacoes: [],
    fornecedores: [],
    pedidos: [],
    linksConfirmacao: {},
    apenasMinhas: true
  };

  function el(id) { return document.getElementById(id); }
  function $$(sel, ctx) { return Array.prototype.slice.call((ctx || document).querySelectorAll(sel)); }
  function escS(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  var fmtM = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
  var fmtQ = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 2 });

  async function api(path, opcoes) {
    var res = await fetch(path, Object.assign({
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' }
    }, opcoes || {}));
    if (res.status === 401) { location.href = '/login'; throw new Error('nao_autenticado'); }
    if (res.status === 403) return { erro: 'somente_visualizacao' };
    return res.json().catch(function () { return {}; });
  }

  async function carregarMe() {
    try {
      var d = await fetch('/api/auth/me', { credentials: 'same-origin' }).then(function (r) { return r.json(); });
      ME = d.usuario || d;
    } catch (e) { ME = null; }
  }
  function podeEditar() { return !ME || ME.podeEditar === 1 || ME.podeEditar === true || ME.isAdmin === 1 || ME.isAdmin === true; }
  function msg(id, texto, ok) {
    var m = el(id);
    if (!m) return;
    m.className = 'supr-msg ' + (ok ? 'ok' : 'erro');
    m.textContent = texto;
  }

  /* ---------- stepper ---------- */
  function stepper(passo) {
    $$('.supr-step').forEach(function (s) {
      var n = Number(s.dataset.step || 0);
      s.classList.toggle('ativo', n === passo);
      s.classList.toggle('concluido', n < passo);
    });
  }

  /* ---------- orçamentos / itens ---------- */
  async function carregarOrcamentos() {
    var sel = el('suprSelectOrcamento');
    if (!sel) return;
    var lista = [];
    try {
      var d = await api('/api/orcamentos');
      lista = Array.isArray(d) ? d : (d && d.orcamentos || []);
    } catch (e) {}
    if (!lista.length && window.state && Array.isArray(window.state.orcamentos)) lista = window.state.orcamentos;
    sel.innerHTML = '<option value="">— Selecione a obra (orçamento) —</option>' +
      lista.map(function (o) {
        return '<option value="' + escS(o.id) + '">' + escS(o.codigo || '') + (o.codigo ? ' — ' : '') + escS(o.nome) + '</option>';
      }).join('');
    if (lista.length && !estado.orcamentoId) estado.orcamentoId = lista[0].id;
    if (estado.orcamentoId) sel.value = estado.orcamentoId;
  }

  function normalizarUnidades(o) {
    var conteudo = o && o.conteudo;
    if (typeof conteudo === 'string') { try { conteudo = JSON.parse(conteudo); } catch (e) { conteudo = null; } }
    return (conteudo && (conteudo.unidades || (conteudo.versao && conteudo.versao.unidades))) || (o && o.unidades) || [];
  }

  function qtdServico(sv) {
    var q = sv && (sv.qtdManual != null ? sv.qtdManual : (sv.quantidade && (sv.quantidade.valor != null ? sv.quantidade.valor : sv.quantidade)));
    return Number(q) || 0;
  }

  async function carregarItensOrcamento() {
    var id = estado.orcamentoId;
    if (!id) return [];
    var o = null;
    try {
      var d = await api('/api/orcamentos/' + encodeURIComponent(id));
      o = d.orcamento || d;
    } catch (e) {}
    if (!o) {
      try {
        var dl = await api('/api/orcamentos');
        var lista = Array.isArray(dl) ? dl : (dl && dl.orcamentos || []);
        o = lista.find(function (x) { return x.id === id; }) || null;
      } catch (e) {}
    }
    if (!o) return [];
    var itens = [];
    normalizarUnidades(o).forEach(function (u, iu) {
      (u.etapas || []).forEach(function (e, ie) {
        (e.subEtapas || []).forEach(function (s, is) {
          (s.servicos || []).forEach(function (sv, isv) {
            if (!sv.id) return;
            itens.push({
              servicoId: sv.id,
              codigo: (iu + 1) + '.' + (ie + 1) + '.' + (is + 1) + '.' + (isv + 1),
              caminho: (u.nome || '') + ' → ' + (e.nome || '') + ' → ' + (s.nome || ''),
              descricao: sv.nome || '',
              unidade: sv.unidadeMedida || '',
              quantidadeOrcada: qtdServico(sv)
            });
          });
        });
      });
    });
    return itens;
  }

  function renderArvore() {
    var wrap = el('suprArvoreItens');
    if (!wrap) return;
    var filtro = (el('suprFiltroItens') || {}).value || '';
    var f = filtro.toLowerCase();
    var list = estado.itensOrcamento.filter(function (i) {
      return !f || (i.descricao + ' ' + i.caminho + ' ' + i.codigo).toLowerCase().indexOf(f) !== -1;
    });
    wrap.innerHTML = list.length ? list.map(function (i) {
      var sel = estado.carrinho.some(function (c) { return c.servicoId === i.servicoId; });
      return '<label class="supr-item-linha">' +
        '<input type="checkbox" data-servicoid="' + escS(i.servicoId) + '"' + (sel ? ' checked' : '') + '>' +
        '<span class="supr-item-codigo">' + escS(i.codigo) + '</span>' +
        '<span class="supr-item-txt"><strong>' + escS(i.descricao) + '</strong><small>' + escS(i.caminho) + '</small></span>' +
        '<span class="supr-item-qtd">' + escS(i.unidade) + ' · orçado ' + fmtQ.format(i.quantidadeOrcada) + '</span>' +
        '</label>';
    }).join('') : '<p class="supr-msg">Nenhum item encontrado.</p>';
    var btn = el('suprBtnContinuarSelecao');
    if (btn) btn.textContent = 'Continuar (' + estado.carrinho.length + ' itens)';
  }

  /* ---------- REQUISIÇÕES ---------- */
  async function listaRequisicoes() {
    var wrap = el('suprListaRequisicoes');
    if (!wrap) return;
    var orcId = estado.orcamentoId;
    if (!orcId) { wrap.innerHTML = '<p class="supr-msg">Selecione a obra acima.</p>'; return; }
    wrap.innerHTML = '<p class="supr-msg">Carregando…</p>';
    var dados = await api(API + '/requisicoes?orcamentoId=' + encodeURIComponent(orcId));
    if (!dados || dados.erro === 'somente_visualizacao') { wrap.innerHTML = ''; return; }
    estado.requisicoes = dados.requisicoes || [];
    var lista = estado.requisicoes;
    if (estado.apenasMinhas && ME && ME.email) {
      lista = lista.filter(function (r) { return (r.solicitanteEmail || '').toLowerCase() === ME.email.toLowerCase(); });
    }
    if (!lista.length) {
      wrap.innerHTML = '<p class="supr-msg">Nenhuma requisição' + (estado.apenasMinhas ? ' sua' : '') + ' ainda. Clique em "+ Nova requisição".</p>';
      return;
    }
    wrap.innerHTML = lista.map(function (r) {
      var qtdItens = (r.itens || []).length;
      return '<div class="supr-card">' +
        '<div class="supr-card-head">' +
        '<strong>Req #' + escS(r.id.slice(0, 8).toUpperCase()) + '</strong>' +
        '<span>' + new Date(r.criadoEm || Date.now()).toLocaleDateString('pt-BR') + ' · ' + badge(r.status) + '</span>' +
        '</div>' +
        '<div class="supr-card-body">' + escS(r.observacoes || '') +
        '<small> · ' + qtdItens + ' item(ns) · ' + escS(r.solicitanteNome || r.solicitanteEmail || '') + '</small></div>' +
        '<div class="supr-card-acoes">' +
        '<button class="btn btn-sm btn-ghost" data-acao="cotar-req" data-id="' + escS(r.id) + '">Cotar</button>' +
        '</div></div>';
    }).join('');
  }

  function badge(st) {
    var mapa = { aberta: ['Aberta', 'badge-aberta'], em_cotacao: ['Em cotação', 'badge-em-cotacao'], em_pedido: ['Em pedido', 'badge-em-pedido'], pendente: ['Pendente', 'badge-aberta'], emitido: ['Emitido', 'badge-em-pedido'], enviado: ['Enviado', 'badge-enviado'], confirmado: ['Confirmado', 'badge-confirmado'], recebido: ['Recebido', 'badge-recebido'], cancelado: ['Cancelado', 'badge-cancelado'], finalizada: ['Finalizada', 'badge-confirmado'] };
    var m = mapa[st] || [st, 'badge-aberta'];
    return '<span class="badge ' + m[1] + '">' + escS(m[0]) + '</span>';
  }

  function novaRequisicao() {
    el('suprReqLista').classList.add('hidden');
    el('suprReqNova').classList.remove('hidden');
    el('suprReqRevisar').classList.add('hidden');
    estado.carrinho = [];
    var info = el('suprReqOrcamentoInfo');
    if (info) info.textContent = estado.orcamentoId;
    renderArvore();
    stepper(1);
  }

  function revisarSelecao() {
    if (!estado.carrinho.length) { alert('Selecione ao menos um item.'); return; }
    el('suprReqNova').classList.add('hidden');
    el('suprReqRevisar').classList.remove('hidden');
    var wrap = el('suprCarrinhoLista');
    if (wrap) wrap.innerHTML = estado.carrinho.map(function (c, idx) {
      return '<div class="supr-carrinho-linha">' +
        '<input type="number" step="any" min="0" class="supr-carrinho-qtd" data-idx="' + idx + '" value="' + (c.quantidade || c.quantidadeOrcada || 0) + '">' +
        '<span>' + escS(c.descricao) + ' <small>' + escS(c.unidade) + ' · orçado: ' + fmtQ.format(c.quantidadeOrcada) + '</small></span>' +
        '</div>';
    }).join('');
    stepper(1);
  }

  async function salvarRequisicao() {
    if (!podeEditar()) { msg('suprMsgRequisicao', 'Você está em modo somente leitura.', false); return; }
    var btn = el('suprBtnSalvarRequisicao');
    if (btn) btn.disabled = true;
    var orcamentoId = estado.orcamentoId;
    var observacoes = (el('suprReqObservacoes') || {}).value || '';
    var itens = [];
    estado.carrinho.forEach(function (c, idx) {
      var input = document.querySelector('.supr-carrinho-qtd[data-idx="' + idx + '"]');
      var qtd = input ? Number(input.value) : 0;
      itens.push({
        itemOrcamentoId: c.servicoId,
        descricao: c.descricao,
        unidade: c.unidade,
        quantidadeOrcamento: c.quantidadeOrcada,
        quantidadeSolicitada: qtd || 0
      });
    });
    if (!itens.length || !orcamentoId) { msg('suprMsgRequisicao', 'Selecione itens válidos.', false); if (btn) btn.disabled = false; return; }
    var dados = await api(API + '/requisicoes', { method: 'POST', body: JSON.stringify({ orcamentoId: orcamentoId, observacoes: observacoes, itens: itens }) });
    if (!dados || dados.erro) { msg('suprMsgRequisicao', dados && dados.erro === 'somente_visualizacao' ? 'Modo somente leitura.' : 'Não foi possível salvar a requisição.', false); if (btn) btn.disabled = false; return; }
    msg('suprMsgRequisicao', 'Requisição salva com sucesso ✔', true);
    setTimeout(function () {
      estado.carrinho = [];
      el('suprReqObservacoes').value = '';
      ativarAba('requisicoes');
    }, 900);
  }

  /* ---------- COTAÇÕES ---------- */
  async function listaCotacoes() {
    var wrap = el('suprListaCotacoes');
    if (!wrap) return;
    var orcId = estado.orcamentoId;
    if (!orcId) { wrap.innerHTML = '<p class="supr-msg">Selecione a obra acima.</p>'; return; }
    wrap.innerHTML = '<p class="supr-msg">Carregando…</p>';
    var dados = await api(API + '/cotacoes?orcamentoId=' + encodeURIComponent(orcId));
    if (!dados || dados.erro) { wrap.innerHTML = ''; return; }
    estado.cotacoes = dados.cotacoes || [];
    if (!estado.cotacoes.length) { wrap.innerHTML = '<p class="supr-msg">Nenhuma cotação ainda.</p>'; return; }
    wrap.innerHTML = estado.cotacoes.map(function (c) {
      return '<div class="supr-card">' +
        '<div class="supr-card-head"><strong>Cot. ' + escS(c.id.slice(0, 8).toUpperCase()) + '</strong>' +
        '<span>' + badge(c.status) + ' · ' + new Date(c.criadoEm || Date.now()).toLocaleDateString('pt-BR') + '</span></div>' +
        '<div class="supr-card-acoes">' +
        (c.status === 'aberta' ? '<button class="btn btn-sm btn-primary" data-acao="abrir-mapa" data-id="' + escS(c.id) + '">Abrir mapa</button>' : '') +
        '</div></div>';
    }).join('');
  }

  async function novaCotacao() {
    if (!podeEditar()) { msg('suprMsgNovaCotacao', 'Modo somente leitura.', false); return; }
    var orcId = estado.orcamentoId;
    if (!orcId) { msg('suprMsgNovaCotacao', 'Selecione a obra acima.', false); return; }
    el('suprCotLista').classList.add('hidden');
    el('suprCotNova').classList.remove('hidden');
    el('suprMapaCotacao').classList.add('hidden');
    msg('suprMsgNovaCotacao', '');
    var dados = await api(API + '/requisicoes?orcamentoId=' + encodeURIComponent(orcId));
    if (!dados || dados.erro) { msg('suprMsgNovaCotacao', 'Não foi possível carregar as requisições.', false); return; }
    var reqs = dados.requisicoes || [];
    var itens = [];
    reqs.forEach(function (r) {
      (r.itens || []).forEach(function (it) {
        if (it.status === 'em_pedido' || it.status === 'confirmado' || it.status === 'recebido') return;
        itens.push({ id: it.id, descricao: it.descricao, unidade: it.unidade, quantidade: it.quantidadeSolicitada || 0, quantidadeOrcamento: it.quantidadeOrcamento, reqRef: r.id.slice(0, 8).toUpperCase(), status: it.status });
      });
    });
    var wrap = el('suprItensParaCotar');
    if (wrap) wrap.innerHTML = itens.length ? itens.map(function (it) {
      return '<label class="supr-item-linha">' +
        '<input type="checkbox" data-itemreq="' + escS(it.id) + '"' + (it.status === 'em_cotacao' ? ' disabled' : '') + '>' +
        '<span class="supr-item-txt"><strong>' + escS(it.descricao) + '</strong>' +
        '<small>Req ' + escS(it.reqRef) + ' · ' + badge(it.status) + '</small></span>' +
        '<span class="supr-item-qtd"><input type="number" step="any" min="0" class="supr-qtd-cotar" data-itemreq="' + escS(it.id) + '" value="' + (it.quantidade || 0) + '" style="width:80px"></span>' +
        '</label>';
    }).join('') : '<p class="supr-msg">Nenhum item de requisição disponível para cotar (crie antes uma requisição).</p>';
    await carregarFornecedores();
    var fwrap = el('suprFornecedoresParaCotar');
    if (fwrap) fwrap.innerHTML = estado.fornecedores.length ? estado.fornecedores.map(function (f) {
      return '<label class="supr-item-linha"><input type="checkbox" data-fornid="' + escS(f.id) + '" checked>' +
        '<span class="supr-item-txt"><strong>' + escS(f.nome) + '</strong><small>' + escS(f.email || '') + '</small></span></label>';
    }).join('') : '<p class="supr-msg">Nenhum fornecedor cadastrado — cadastre na aba Fornecedores.</p>';
    stepper(2);
  }

  async function criarMapa() {
    var itens = $$('#suprItensParaCotar input[type=checkbox]:checked').map(function (i) {
      var qtd = i.closest('label').querySelector('.supr-qtd-cotar');
      return { itemRequisicaoId: i.dataset.itemreq, quantidade: qtd ? (Number(qtd.value) || 0) : 0 };
    });
    var forn = $$('#suprFornecedoresParaCotar input[type=checkbox]:checked').map(function (i) { return { fornecedorId: i.dataset.fornid }; });
    if (!itens.length || !forn.length) { msg('suprMsgNovaCotacao', 'Selecione itens e ao menos um fornecedor.', false); return; }
    var dados = await api(API + '/cotacoes', {
      method: 'POST',
      body: JSON.stringify({ orcamentoId: estado.orcamentoId, itens: itens, fornecedores: forn })
    });
    if (!dados || dados.erro) { msg('suprMsgNovaCotacao', dados && dados.erro === 'somente_visualizacao' ? 'Modo somente leitura.' : 'Falha ao criar a cotação.', false); return; }
    msg('suprMsgNovaCotacao', 'Cotação criada ✔ abrindo o mapa…', true);
    setTimeout(function () { abrirMapa(dados.id); }, 700);
  }

  /* ---------- MAPA DE COMPARAÇÃO ---------- */
  var MAPA_ID = null;

  async function abrirMapa(id) {
    MAPA_ID = id;
    if (!el('suprCotNova')) return;
    el('suprCotLista').classList.add('hidden');
    el('suprCotNova').classList.add('hidden');
    el('suprMapaCotacao').classList.remove('hidden');
    var wrap = el('suprMapaWrap');
    if (!wrap) return;
    wrap.innerHTML = '<p class="supr-msg">Carregando mapa…</p>';
    var dados = await api(API + '/cotacoes/' + encodeURIComponent(id));
    if (!dados || dados.erro) { wrap.innerHTML = '<p class="supr-msg">Erro ao carregar o mapa.</p>'; return; }
    var c = dados.cotacao || dados;
    var fornecedores = c.fornecedores || [];
    var itens = c.itens || [];
    if (!fornecedores.length || !itens.length) { wrap.innerHTML = '<p class="supr-msg">Mapa sem itens ou fornecedores.</p>'; return; }

    var rodada = fornecedores[0] && fornecedores[0].rodada || 1;
    var head = '<tr><th class="supr-item-nome">Item</th>' + fornecedores.map(function (f) {
      return '<th><div class="supr-forn-head"><strong>' + escS(f.nome) + '</strong>' +
        (f.email ? '<small>' + escS(f.email) + '</small>' : '') + '</div>' +
        '<input class="supr-cond-pag" data-forn="' + escS(f.id) + '" value="' + escS(f.condicaoPagamento || '') + '" placeholder="Cond. pagamento">' +
        '</th>';
    }).join('') + '</tr>';

    var body = itens.map(function (it) {
      return '<tr><td class="supr-item-nome"><strong>' + escS(it.descricao) + '</strong>' +
        '<small>Req ' + escS(it.requisicaoRef || '') + ' · ' + escS(it.unidade || '') + ' · qtd: ' + fmtQ.format(it.quantidade) + '</small></td>' +
        fornecedores.map(function (f) {
          var p = (it.precos || []).find(function (x) { return x.fornecedorId === f.id; });
          return '<td class="cmp-cel">' +
            '<input class="supr-preco" data-item="' + escS(it.itemRequisicaoId) + '" data-forn="' + escS(f.id) + '" inputmode="decimal" value="' + (p ? p.precoUnitario : '') + '" placeholder="0,00">' +
            '<label class="supr-venc-lbl"><input type="checkbox" class="supr-venc" data-item="' + escS(it.itemRequisicaoId) + '" data-forn="' + escS(f.id) + '"' + (p && p.vencedora ? ' checked' : '') + '>comprar</label>' +
            '<input type="number" min="0" step="any" class="supr-qtd-venc" data-item="' + escS(it.itemRequisicaoId) + '" data-forn="' + escS(f.id) + '" placeholder="qtd parcial" style="width:74px" value="' + (p && p.quantidadeComprada ? p.quantidadeComprada : '') + '">' +
            '</td>';
        }).join('') + '</tr>';
    }).join('');

    var totais = '<tr class="supr-total-row"><td><b>Total por fornecedor</b></td>' + fornecedores.map(function (f) {
      return '<td><b class="supr-total-forn" data-forn="' + escS(f.id) + '">R$ 0,00</b></td>';
    }).join('') + '</tr>';

    wrap.innerHTML =
      '<div class="supr-mapa-head">' +
      '<div class="supr-mapa-tools">' +
      '<label>Rodada de negociação <select id="suprRodada">' + [1, 2, 3, 4, 5].map(function (r) { return '<option value="' + r + '"' + (Number(rodada) === r ? ' selected' : '') + '>' + r + 'ª</option>'; }).join('') + '</select></label>' +
      '<button class="btn btn-ghost" id="suprBtnSalvarPrecos">Salvar valores</button>' +
      '<button class="btn btn-primary" id="suprBtnFinalizarCotacao">Finalizar cotação</button>' +
      '<button class="btn btn-ghost btn-sm" id="suprBtnVoltarMapa">Voltar</button>' +
      '</div></div>' +
      '<div class="supr-mapa-scroll"><table class="mapa-cotacao"><thead>' + head + '</thead><tbody>' + body + totais + '</tbody></table></div>';

    recalcularTotais();
    $$('.supr-preco, .supr-venc, .supr-qtd-venc', wrap).forEach(function (i) {
      i.addEventListener('input', recalcularTotais);
    });
    var btnSalvar = el('suprBtnSalvarPrecos');
    if (btnSalvar) btnSalvar.addEventListener('click', salvarPrecos);
    var btnFinal = el('suprBtnFinalizarCotacao');
    if (btnFinal) btnFinal.addEventListener('click', finalizarCotacao);
    var btnVoltar = el('suprBtnVoltarMapa');
    if (btnVoltar) btnVoltar.addEventListener('click', function () { ativarAba('cotacoes'); });
    stepper(3);
  }

  function recalcularTotais() {
    $$('.supr-total-forn').forEach(function (cel) {
      var fornId = cel.dataset.forn;
      var total = 0;
      $$('.supr-preco[data-forn="' + fornId + '"]').forEach(function (inp) {
        var v = Number(String(inp.value).replace(/[^\d,.-]/g, '').replace(',', '.')) || 0;
        var qtd = document.querySelector('.supr-qtd-venc[data-item="' + inp.dataset.item + '"][data-forn="' + fornId + '"]');
        total += v * (qtd && qtd.value ? (Number(qtd.value) || 0) : 1);
      });
      cel.textContent = fmtM.format(total);
    });
  }

  async function salvarPrecos() {
    if (!podeEditar()) { alert('Modo somente leitura.'); return; }
    if (!MAPA_ID) return;
    var precos = [];
    $$('.supr-preco').forEach(function (inp) {
      var v = String(inp.value || '').trim();
      if (!v) return;
      precos.push({ itemRequisicaoId: inp.dataset.item, fornecedorId: inp.dataset.forn, valor: v });
    });
    if (!precos.length) { alert('Informe ao menos um valor.'); return; }
    var condicoes = $$('.supr-cond-pag').map(function (i) { return { fornecedorId: i.dataset.forn, condicaoPagamento: i.value }; });
    var rodada = (el('suprRodada') || {}).value || '1';
    var dados = await api(API + '/cotacoes/' + encodeURIComponent(MAPA_ID) + '/precos', {
      method: 'POST',
      body: JSON.stringify({ precos: precos, rodada: Number(rodada), condicoes: condicoes })
    });
    if (!dados || dados.erro) { alert(dados && dados.erro === 'somente_visualizacao' ? 'Modo somente leitura.' : 'Erro ao salvar valores.'); return; }
    alert('Valores salvos ✔');
  }

  async function finalizarCotacao() {
    if (!podeEditar()) { alert('Modo somente leitura.'); return; }
    if (!MAPA_ID) return;
    var vencedores = [];
    $$('.supr-venc:checked').forEach(function (v) {
      var qtd = document.querySelector('.supr-qtd-venc[data-item="' + v.dataset.item + '"][data-forn="' + v.dataset.forn + '"]');
      vencedores.push({
        itemRequisicaoId: v.dataset.item,
        fornecedorId: v.dataset.forn,
        quantidade: qtd && qtd.value ? (Number(qtd.value) || 0) : null
      });
    });
    if (!vencedores.length) { alert('Marque ao menos um item como comprado (comprar).'); return; }
    if (!confirm('Finalizar a cotação e gerar os pedidos de compra dos itens marcados?')) return;
    var dados = await api(API + '/cotacoes/' + encodeURIComponent(MAPA_ID) + '/finalizar', {
      method: 'POST',
      body: JSON.stringify({ vencedores: vencedores })
    });
    if (!dados || dados.erro) { alert(dados && dados.erro === 'somente_visualizacao' ? 'Modo somente leitura.' : 'Erro ao finalizar a cotação.'); return; }
    alert('Pedidos de compra gerados ✔');
    ativarAba('pedidos');
  }

  /* ---------- PEDIDOS ---------- */
  async function listaPedidos() {
    var wrap = el('suprListaPedidos');
    if (!wrap) return;
    var orcId = estado.orcamentoId;
    if (!orcId) { wrap.innerHTML = '<p class="supr-msg">Selecione a obra acima.</p>'; return; }
    wrap.innerHTML = '<p class="supr-msg">Carregando…</p>';
    var dados = await api(API + '/pedidos?orcamentoId=' + encodeURIComponent(orcId));
    if (!dados || dados.erro) { wrap.innerHTML = ''; return; }
    estado.pedidos = dados.pedidos || [];
    if (!estado.pedidos.length) { wrap.innerHTML = '<p class="supr-msg">Nenhum pedido de compra gerado.</p>'; return; }
    wrap.innerHTML = estado.pedidos.map(function (p) {
      var link = estado.linksConfirmacao[p.id] || '';
      return '<div class="supr-card">' +
        '<div class="supr-card-head">' +
        '<strong>' + escS(p.numero || p.id.slice(0, 8)) + '</strong>' +
        '<span>' + badge(p.status) + ' · ' + new Date(p.dataEmissao || Date.now()).toLocaleDateString('pt-BR') + '</span>' +
        '</div>' +
        '<div class="supr-card-body"><b>' + escS(p.fornecedorNome || '') + '</b> · ' + fmtM.format(p.valorTotal || 0) +
        (p.condicaoPagamento ? ' · ' + escS(p.condicaoPagamento) : '') + '</div>' +
        '<div class="supr-card-acoes">' +
        '<button class="btn btn-sm btn-ghost" data-acao="pdf-pedido" data-id="' + escS(p.id) + '" title="Salvar PDF">📄 PDF</button>' +
        '<button class="btn btn-sm btn-ghost" data-acao="enviar-pedido" data-id="' + escS(p.id) + '" title="Enviar por e-mail">📧 Enviar</button>' +
        '<button class="btn btn-sm btn-ghost" data-acao="receber-pedido" data-id="' + escS(p.id) + '">📥 Receber</button>' +
        (link ? '<button class="btn btn-sm btn-ghost" data-acao="copiar-link" data-link="' + escS(link) + '">🔗 Link confirmação</button>' : '') +
        '</div></div>';
    }).join('');
  }

  async function enviarPedido(id) {
    if (!podeEditar()) { alert('Modo somente leitura.'); return; }
    if (!confirm('Enviar este pedido por e-mail para o fornecedor cadastrado?')) return;
    var dados = await api(API + '/pedidos/' + encodeURIComponent(id) + '/enviar', { method: 'POST' });
    if (!dados || dados.erro) {
      if (dados && dados.erro === 'fornecedor_sem_email') alert('Este fornecedor não tem e-mail cadastrado.');
      else alert('Erro ao enviar o pedido. Verifique a configuração do Resend (RESEND_API_KEY).');
      return;
    }
    estado.linksConfirmacao[id] = dados.linkConfirmacao || '';
    var link = dados.linkConfirmacao || '';
    if (link) { try { navigator.clipboard.writeText(link); } catch (e) {} }
    alert('Pedido enviado ✔\nLink de confirmação: ' + link);
    listaPedidos();
  }

  /* ---------- RECEBIMENTO ---------- */
  async function abrirRecebimento(id) {
    var dlg = el('suprDialogRecebimento');
    if (!dlg) return;
    var dados = await api(API + '/pedidos/' + encodeURIComponent(id));
    if (!dados || !dados.pedido) { alert('Não foi possível carregar o pedido.'); return; }
    var p = dados.pedido;
    el('suprRecPedidoInfo').textContent = (p.numero || '') + ' — ' + (p.fornecedor && p.fornecedor.nome || '') + ' · Total ' + fmtM.format(p.valorTotal || 0);
    var wrap = el('suprRecItensWrap');
    if (wrap) wrap.innerHTML = '<h4 style="margin:10px 0 6px">Itens recebidos</h4>' +
      (p.itens || []).map(function (i) {
        return '<label class="supr-item-linha">' +
          '<input type="checkbox" data-itemid="' + escS(i.id) + '" checked>' +
          '<span class="supr-item-txt"><strong>' + escS(i.descricao) + '</strong>' +
          '<small>' + escS(i.unidade || 'un') + ' · pedido: ' + fmtQ.format(i.quantidade) + '</small></span>' +
          '<span class="supr-item-qtd"><input type="number" step="any" min="0" class="supr-rec-qtd" data-itemid="' + escS(i.id) + '" value="' + (i.quantidade || 0) + '" style="width:80px"></span>' +
          '</label>';
      }).join('');
    msg('suprMsgRecebimento', '', true);
    dlg.dataset.pedidoId = id;
    dlg.showModal();
  }

  async function confirmarRecebimento() {
    var dlg = el('suprDialogRecebimento');
    if (!dlg) return;
    var pedidoId = dlg.dataset.pedidoId;
    var itens = $$('#suprRecItensWrap input[type=checkbox]:checked').map(function (i) {
      var q = document.querySelector('.supr-rec-qtd[data-itemid="' + i.dataset.itemid + '"]');
      return { itemPedidoId: i.dataset.itemid, quantidadeRecebida: q ? (Number(q.value) || 0) : 0 };
    });
    if (!itens.length) { msg('suprMsgRecebimento', 'Marque ao menos um item recebido.', false); return; }
    var payload = {
      pedidoId: pedidoId,
      notaFiscalNumero: (el('suprRecNotaNumero') || {}).value || '',
      notaFiscalChave: (el('suprRecNotaChave') || {}).value || '',
      dataRecebimento: (el('suprRecData') || {}).value || new Date().toISOString().slice(0, 10),
      valorNota: Number((el('suprRecValor') || {}).value) || 0,
      observacoes: (el('suprRecObservacoes') || {}).value || '',
      itens: itens
    };
    var dados = await api(API + '/recebimentos', { method: 'POST', body: JSON.stringify(payload) });
    if (!dados || dados.erro) { msg('suprMsgRecebimento', 'Erro ao lançar recebimento.', false); return; }
    msg('suprMsgRecebimento', 'Recebimento lançado ✔', true);
    setTimeout(function () { dlg.close(); ativarAba('pedidos'); }, 900);
  }

  /* ---------- FORNECEDORES ---------- */
  async function carregarFornecedores() {
    var dados = await api(API + '/fornecedores');
    if (!dados || dados.erro) return false;
    estado.fornecedores = dados.fornecedores || [];
    return true;
  }
  async function listaFornecedores() {
    var wrap = el('suprListaFornecedores');
    if (!wrap) return;
    if (!(await carregarFornecedores())) return;
    if (!estado.fornecedores.length) { wrap.innerHTML = '<p class="supr-msg">Nenhum fornecedor cadastrado.</p>'; return; }
    wrap.innerHTML = '<div class="supr-table-wrap"><table class="tabela"><thead><tr><th>Nome</th><th>CNPJ</th><th>Telefone</th><th>E-mail</th><th></th></tr></thead><tbody>' +
      estado.fornecedores.map(function (f) {
        return '<tr><td>' + escS(f.nome) + '</td><td>' + escS(f.cnpj || '—') + '</td><td>' + escS(f.telefone || '—') + '</td><td>' + escS(f.email || '—') + '</td>' +
          '<td><button class="btn-icon btn-danger" data-acao="del-forn" data-id="' + escS(f.id) + '" title="Excluir">🗑</button></td></tr>';
      }).join('') + '</tbody></table></div>';
  }
  async function salvarFornecedor() {
    if (!podeEditar()) { msg('suprMsgFornecedor', 'Modo somente leitura.', false); return; }
    var payload = {
      nome: (el('suprFNome') || {}).value.trim(),
      cnpj: (el('suprFCnpj') || {}).value.trim(),
      telefone: (el('suprFTelefone') || {}).value.trim(),
      email: (el('suprFEmail') || {}).value.trim()
    };
    if (!payload.nome) { msg('suprMsgFornecedor', 'Informe o nome do fornecedor.', false); return; }
    var dados = await api(API + '/fornecedores', { method: 'POST', body: JSON.stringify(payload) });
    if (!dados || dados.erro) { msg('suprMsgFornecedor', 'Erro ao salvar.', false); return; }
    ['suprFNome', 'suprFCnpj', 'suprFTelefone', 'suprFEmail'].forEach(function (i) { if (el(i)) el(i).value = ''; });
    msg('suprMsgFornecedor', 'Fornecedor salvo ✔', true);
    listaFornecedores();
  }

  /* ---------- COMPARATIVO ---------- */
  async function carregarComparativo() {
    if (!estado.orcamentoId) return;
    var dados = await api(API + '/comparativo?orcamentoId=' + encodeURIComponent(estado.orcamentoId));
    if (!dados || dados.erro) return;
    var resumo = dados.resumo || {};
    var rw = el('suprResumoComparativo');
    if (rw) rw.innerHTML =
      '<div class="resumo-card"><span>Orçado</span><strong class="total-grande">' + fmtM.format(resumo.orcado || 0) + '</strong></div>' +
      '<div class="resumo-card"><span>Comprometido</span><strong>' + fmtM.format(resumo.comprometido || 0) + '</strong></div>' +
      '<div class="resumo-card"><span>Executado (recebido)</span><strong>' + fmtM.format(resumo.executado || 0) + '</strong></div>' +
      '<div class="resumo-card"><span>Saldo</span><strong>' + fmtM.format(resumo.saldo || 0) + '</strong></div>';
    var body = el('suprCorpoComparativo');
    if (body) body.innerHTML = (dados.itens || []).map(function (i) {
      return '<tr><td>' + escS(i.descricao) + '</td>' +
        '<td class="col-num">' + fmtM.format(i.orcado || 0) + '</td>' +
        '<td class="col-num">' + fmtM.format(i.comprometido || 0) + '</td>' +
        '<td class="col-num">' + fmtM.format(i.executado || 0) + '</td>' +
        '<td class="col-num"><b>' + fmtM.format(i.saldo || 0) + '</b></td></tr>';
    }).join('');
  }

  /* ---------- NAVEGAÇÃO / ABAS ---------- */
  function ativarAba(aba) {
    estado.abaAtiva = aba;
    $$('.supr-tab').forEach(function (b) { b.classList.toggle('ativa', b.dataset.aba === aba); });
    var paineis = { requisicoes: 'suprPainelRequisicoes', cotacoes: 'suprPainelCotacoes', pedidos: 'suprPainelPedidos', fornecedores: 'suprPainelFornecedores', comparativo: 'suprPainelComparativo' };
    Object.keys(paineis).forEach(function (k) {
      var p = el(paineis[k]);
      if (p) p.classList.toggle('hidden', k !== aba);
    });
    if (aba === 'requisicoes') { listaRequisicoes(); stepper(1); }
    else if (aba === 'cotacoes') { listaCotacoes(); stepper(2); }
    else if (aba === 'pedidos') { listaPedidos(); stepper(4); }
    else if (aba === 'fornecedores') listaFornecedores();
    else if (aba === 'comparativo') carregarComparativo();
  }

  /* ---------- EVENTOS ---------- */
  document.addEventListener('DOMContentLoaded', function () {
    if (typeof carregarMe === 'function') {
      carregarMe().then(function () {
        var banner = el('suprReadonlyBanner');
        if (banner && !podeEditar()) banner.classList.remove('hidden');
        carregarOrcamentos().then(function () {
          estado.itensOrcamento = [];
          carregarItensOrcamento().then(function (it) { estado.itensOrcamento = it; });
        });
      });
    }

    var sel = el('suprSelectOrcamento');
    if (sel) sel.addEventListener('change', function () {
      estado.orcamentoId = sel.value;
      estado.carrinho = [];
      carregarItensOrcamento().then(function (it) { estado.itensOrcamento = it; if (estado.abaAtiva) ativarAba(estado.abaAtiva); });
    });

    $$('.supr-tab').forEach(function (b) {
      b.addEventListener('click', function () { ativarAba(b.dataset.aba); });
    });
    var fMinhas = el('suprFiltroMinhas');
    if (fMinhas) fMinhas.addEventListener('change', function () { estado.apenasMinhas = fMinhas.checked; listaRequisicoes(); });

    var bNova = el('suprBtnNovaRequisicao');
    if (bNova) bNova.addEventListener('click', novaRequisicao);
    var bCancelarNova = el('suprBtnCancelarNova');
    if (bCancelarNova) bCancelarNova.addEventListener('click', function () { ativarAba('requisicoes'); });
    var bVoltarSel = el('suprBtnVoltarSelecao');
    if (bVoltarSel) bVoltarSel.addEventListener('click', novaRequisicao);
    var bSalvarReq = el('suprBtnSalvarRequisicao');
    if (bSalvarReq) bSalvarReq.addEventListener('click', salvarRequisicao);

    var filtro = el('suprFiltroItens');
    if (filtro) filtro.addEventListener('input', renderArvore);
    var arvore = el('suprArvoreItens');
    if (arvore) arvore.addEventListener('change', function (ev) {
      var cb = ev.target.closest('input[data-servicoid]');
      if (!cb) return;
      var item = estado.itensOrcamento.find(function (i) { return i.servicoId === cb.dataset.servicoid; });
      if (!item) return;
      if (cb.checked) estado.carrinho.push(Object.assign({}, item, { quantidade: item.quantidadeOrcada }));
      else estado.carrinho = estado.carrinho.filter(function (c) { return c.servicoId !== cb.dataset.servicoid; });
      renderArvore();
    });
    var btnCont = el('suprBtnContinuarSelecao');
    if (btnCont) btnCont.addEventListener('click', revisarSelecao);

    var bNovaCot = el('suprBtnNovaCotacao');
    if (bNovaCot) bNovaCot.addEventListener('click', novaCotacao);
    var bVoltarCot = el('suprBtnVoltarListaCot');
    if (bVoltarCot) bVoltarCot.addEventListener('click', function () { ativarAba('cotacoes'); });
    var bCriarMapa = el('suprBtnCriarMapa');
    if (bCriarMapa) bCriarMapa.addEventListener('click', criarMapa);

    var bSalvarForn = el('suprBtnSalvarFornecedor');
    if (bSalvarForn) bSalvarForn.addEventListener('click', salvarFornecedor);

    var dlg = el('suprDialogRecebimento');
    if (dlg) {
      var bCancelRec = el('suprBtnCancelarRecebimento');
      if (bCancelRec) bCancelRec.addEventListener('click', function () { dlg.close(); });
      var bConfRec = el('suprBtnConfirmarRecebimento');
      if (bConfRec) bConfRec.addEventListener('click', confirmarRecebimento);
    }

    document.addEventListener('click', async function (ev) {
      var b = ev.target.closest('[data-acao]');
      if (!b) return;
      var acao = b.dataset.acao;
      if (acao === 'cotar-req') { ativarAba('cotacoes'); novoComItemReq(b.dataset.id); }
      else if (acao === 'abrir-mapa') abrirMapa(b.dataset.id);
      else if (acao === 'pdf-pedido') { window.open(API + '/pedidos/' + encodeURIComponent(b.dataset.id) + '/pdf', '_blank'); }
      else if (acao === 'enviar-pedido') enviarPedido(b.dataset.id);
      else if (acao === 'receber-pedido') abrirRecebimento(b.dataset.id);
      else if (acao === 'copiar-link') { try { navigator.clipboard.writeText(b.dataset.link); alert('Link copiado ✔'); } catch (e) { alert(b.dataset.link); } }
      else if (acao === 'del-forn') {
        if (confirm('Excluir este fornecedor?')) {
          var r = await api(API + '/fornecedores/' + encodeURIComponent(b.dataset.id), { method: 'DELETE' });
          if (r && r.erro === 'fornecedor_em_uso') alert('Este fornecedor tem histórico de cotações/pedidos e não pode ser excluído.');
          listaFornecedores();
        }
      }
    });
  });

  async function novoComItemReq(reqId) {
    await novaCotacao();
    setTimeout(function () {
      var reqs = estado.requisicoes.find(function (r) { return r.id === reqId; });
      if (!reqs) return;
      var ids = new Set((reqs.itens || []).map(function (i) { return i.id; }));
      $$('#suprItensParaCotar input[type=checkbox][data-itemreq]').forEach(function (i) {
        if (ids.has(i.dataset.itemreq) && !i.disabled) i.checked = true;
      });
    }, 300);
  }
})();
/* ---------- FLUXO REQUISIÇÃO (baseado no Sienge) ---------- */
function abrirNovaReqBasica() {
  mostrarOpcoesInsumo();
  // Tela 1: dados básicos (obra, observações)
  document.getElementById('suprReqLista').classList.add('hidden');
  document.getElementById('suprReqNova').classList.remove('hidden');
  // Preencher select de obras
  var sel = document.getElementById('reqObraSelect');
  if (sel && !sel.options.length) {
    // Carregar orçamentos disponíveis
    carregarOrcamentos().then(function() {
      // Implementar preenchimento
    });
  }
}

function salvarReqBasica() {
  // Tela 2: criar número e ir para itens
  var obs = document.getElementById('reqObservacoes').value;
  // Criar requisição com número
  document.getElementById('suprReqNova').classList.add('hidden');
  document.getElementById('suprReqRevisar').classList.remove('hidden');
  // Carregar itens do orçamento selecionado
}

/* ---------- FLUXO COMPLETO REQUISIÇÃO ---------- */
function abrirNovaReqBasica() {
  mostrarOpcoesInsumo();
  // Passo 1: Tela de consulta (lista) - já visível
  // Passo 2: Nova requisição - informações básicas
  document.getElementById('suprReqLista').classList.add('hidden');
  document.getElementById('suprReqNova').classList.remove('hidden');
  document.getElementById('suprReqRevisar').classList.add('hidden');
  document.getElementById('suprReqInsumos').classList.add('hidden');
}

function salvarReqBasica() {
  var obra = document.getElementById('reqObraSelect').value;
  var obs = document.getElementById('reqObservacoes').value;
  if (!obra) { alert('Selecione uma obra'); return; }
  // Criar número de requisição
  var numReq = 'REQ-' + new Date().toISOString().slice(0,10).replace(/-/g,'') + '-' + Math.floor(Math.random()*1000);
  document.getElementById('suprReqNova').classList.add('hidden');
  document.getElementById('suprReqRevisar').classList.remove('hidden');
  // Carregar itens do orçamento selecionado
  carregarItensOrcamento().then(function(itens) {
    estado.itensOrcamento = itens;
    mostrarItensParaSelecao(itens);
  });
}

function mostrarItensParaSelecao(itens) {
  var wrap = document.getElementById('suprArvoreItens');
  if (!wrap) return;
  wrap.innerHTML = itens.map(function(it) {
    return '<label><input type="checkbox" data-item="' + it.id + '">' + it.nome + ' (' + it.unidade + ')</label>';
  }).join('');
}

/* ---------- CONEXÃO DOS BOTÕES ---------- */
document.addEventListener('DOMContentLoaded', function() {
  var btnNova = document.getElementById('suprBtnNovaRequisicao');
  if (btnNova) btnNova.addEventListener('click', abrirNovaReqBasica);
  
  var btnSalvarBasica = document.getElementById('btnSalvarReqBasica');
  if (btnSalvarBasica) btnSalvarBasica.addEventListener('click', salvarReqBasica);
});

function abrirReqInsumos() {
  // Passo 3: Selecionar insumo (orçamento ou base)
  document.getElementById('suprReqNova').classList.add('hidden');
  document.getElementById('suprReqInsumos').classList.remove('hidden');
}

function salvarReqInsumos() {
  // Passo 4: Quantidade + serviço de apropriação
  document.getElementById('suprReqInsumos').classList.add('hidden');
  document.getElementById('suprReqRevisar').classList.remove('hidden');
}

/* ---------- OPÇÕES DE INSUMO ---------- */
function mostrarOpcoesInsumo() {
  var wrap = document.getElementById('suprArvoreItens');
  if (!wrap) return;
  wrap.innerHTML = 
    '<div style="margin-bottom:12px">' +
    '<button class="btn btn-primary" onclick="selecionarInsumoOrcamento()">📋 Selecionar item do orçamento</button>' +
    '<button class="btn btn-ghost" onclick="selecionarInsumoBase()">📦 Selecionar insumo da base</button>' +
    '</div>' +
    '<div id="suprSelecaoInsumo"></div>';
}

function selecionarInsumoOrcamento() {
  // Carrega itens do orçamento com referência automática
  carregarItensOrcamento().then(function(itens) {
    var div = document.getElementById('suprSelecaoInsumo');
    if (!div) return;
    div.innerHTML = '<h4>Itens do orçamento (já referenciados)</h4>' +
      itens.map(function(it) {
        return '<label><input type="checkbox" data-item="' + it.id + '" data-servico="' + (it.servico || '') + '">' +
        it.nome + ' — <small>' + (it.servico || 'Serviço não definido') + '</small></label>';
      }).join('');
  });
}

function selecionarInsumoBase() {
  // Carrega insumos da base e pede serviço
  var div = document.getElementById('suprSelecaoInsumo');
  if (!div) return;
  div.innerHTML = '<h4>Insumos da base</h4>' +
    '<label>Serviço / Etapa para apropriação: <select id="suprServApropriacao"><option>Fundação</option><option>Estrutura</option><option>Alvenaria</option></select></label>' +
    '<div id="suprListaInsumosBase"></div>';
  // Carregar base de insumos
  carregarInsumosBase().then(function(insumos) {
    var lista = document.getElementById('suprListaInsumosBase');
    if (lista) lista.innerHTML = insumos.map(function(i) {
      return '<label><input type="checkbox" data-insumo="' + i.id + '">' + i.nome + '</label>';
    }).join('');
  });
}
