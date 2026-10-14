/* Suprimentos — embutido na sidebar via erp-nav.js (view "suprimentos") */
(function () {
  'use strict';

  const estado = {
    usuario: null,
    orcamentos: [],
    orcamentoId: null,
    servicosFlat: [],
    carrinho: [],          // seleção em andamento pra nova requisição: [{itemOrcamentoId, descricao, unidade, quantidadeOrcamento, quantidadeSolicitada}]
    requisicoes: [],
    fornecedores: [],
    cotacoes: [],
    novaCotacaoItens: [],        // itens escolhidos pra cotar: [{itemRequisicaoId, descricao, unidade, quantidade}]
    novaCotacaoFornecedores: {}, // { fornecedorId: {selecionado, condicaoPagamento} }
    mapaAtual: null,             // {cotacao, itens, fornecedores, precos}
    pedidos: [],
    comparativo: null,
  };

  function $(sel) { return document.querySelector(sel); }
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }
  function fmtBRL(v) { return (Number(v) || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }); }
  function fmtNum(v) { return (Number(v) || 0).toLocaleString('pt-BR', { maximumFractionDigits: 2 }); }
  function hoje() { return new Date().toISOString().slice(0, 10); }
  function uid() { return crypto.randomUUID(); }

  async function api(path, opts) {
    opts = opts || {};
    const res = await fetch(path, Object.assign({ credentials: 'same-origin', headers: { 'Content-Type': 'application/json' } }, opts));
    let data = null;
    try { data = await res.json(); } catch (e) {}
    if (!res.ok) { const err = new Error((data && data.erro) || ('erro_http_' + res.status)); err.status = res.status; err.data = data; throw err; }
    return data;
  }
  const MSG = {
    nao_autenticado: 'Sessão expirada — faça login novamente.',
    somente_visualizacao: 'Seu usuário não tem permissão de edição.',
    parametros_invalidos: 'Preencha os campos obrigatórios.',
    nenhuma_cotacao_vencedora_marcada: 'Marque ao menos um fornecedor vencedor antes de finalizar.',
    pdf_nao_gerado: 'PDF deste pedido ainda não foi gerado.',
    fornecedor_sem_email: 'Este fornecedor não tem e-mail cadastrado.',
  };
  function msgErro(e) { return MSG[e && e.message] || 'Não foi possível concluir. Tente novamente.'; }

  // ---- cálculo de quantidade orçada (replica o memo do orçamento) ----
  function numBR(v) { if (v === '' || v == null) return 1; const n = parseFloat(String(v).replace(',', '.')); return isNaN(n) ? 1 : n; }
  function qtdServico(s) {
    if (s.qtdManual != null && s.qtdManual !== '') return Number(s.qtdManual) || 0;
    if (!s.memo || !s.memo.length) return 0;
    return s.memo.reduce((acc, m) => acc + ['comprimento', 'altura', 'largura', 'coeficiente', 'quantidade'].map((k) => numBR(m[k])).reduce((a, b) => a * b, 1), 0);
  }
  function flattenServicos(orc) {
    const linhas = []; const versao = orc.versoes && orc.versoes[orc.versoes.length - 1]; if (!versao) return linhas;
    (function andar(nivel, caminho) {
      (nivel.servicos || []).forEach((s) => {
        const quantidade = qtdServico(s);
        linhas.push({ id: s.id, caminho: caminho.join(' › '), nome: s.nome, unidade: s.unidadeMedida || '', valorUnitario: s.valorUnitario || 0, quantidade, valorOrcado: quantidade * (s.valorUnitario || 0) });
      });
      (nivel.subEtapas || []).forEach((se) => andar(se, caminho.concat(se.nome)));
      (nivel.etapas || []).forEach((e) => andar(e, caminho.concat(e.nome)));
      (nivel.unidades || []).forEach((u) => andar(u, caminho.concat(u.nome)));
    })(versao, []);
    return linhas;
  }

  const ROTULO_STATUS = {
    aberta: 'Aberta', em_cotacao: 'Em cotação', pedido_gerado: 'Pedido gerado', concluida: 'Concluída', cancelada: 'Cancelada',
    pendente: 'Pendente', atendido_parcial: 'Atendido (parcial)', atendido_total: 'Atendido', cancelado: 'Cancelado',
    finalizada: 'Finalizada', emitido: 'Emitido', enviado: 'Enviado', confirmado: 'Confirmado pelo fornecedor',
    recebido_parcial: 'Recebido (parcial)', recebido_total: 'Recebido (total)',
  };
  function badge(status) { return `<span class="supr-badge supr-badge-${esc(status)}">${esc(ROTULO_STATUS[status] || status)}</span>`; }

  // ======================= INIT =======================
  async function init() {
    try { estado.usuario = await api('/api/auth/me'); } catch (e) { return; }
    if (!estado.usuario.podeEditar) { const b = $('#suprBannerSomenteLeitura'); if (b) b.classList.remove('hidden'); }
    ligarEventos();
    await carregarOrcamentos();
    await carregarFornecedores();
  }

  function ligarEventos() {
    document.querySelectorAll('.supr-tab').forEach((btn) => btn.addEventListener('click', () => mostrarAba(btn.dataset.supraba)));
    $('#suprSelectOrcamento').addEventListener('change', (e) => selecionarOrcamento(e.target.value));

    // Requisições
    $('#suprBtnNovaRequisicao').addEventListener('click', () => { estado.carrinho = []; mostrarSubRequisicao('nova'); renderArvoreItens(); });
    $('#suprBtnVoltarListaReq').addEventListener('click', () => mostrarSubRequisicao('lista'));
    $('#suprFiltroItens').addEventListener('input', renderArvoreItens);
    $('#suprBtnVoltarSelecao').addEventListener('click', () => mostrarSubRequisicao('nova'));
    $('#suprBtnSalvarRequisicao').addEventListener('click', salvarRequisicao);

    // Cotações
    $('#suprBtnNovaCotacao').addEventListener('click', () => { estado.novaCotacaoItens = []; estado.novaCotacaoFornecedores = {}; mostrarSubCotacao('nova'); renderItensParaCotar(); renderFornecedoresParaCotar(); });
    $('#suprBtnVoltarListaCot').addEventListener('click', () => mostrarSubCotacao('lista'));
    $('#suprBtnVoltarListaCot2').addEventListener('click', () => mostrarSubCotacao('lista'));
    $('#suprBtnCriarMapa').addEventListener('click', criarMapaCotacao);

    // Fornecedores
    $('#suprBtnSalvarFornecedor').addEventListener('click', salvarFornecedor);

    // Modal recebimento
    $('#suprBtnCancelarRecebimento').addEventListener('click', () => $('#suprModalRecebimento').close());
    $('#suprBtnConfirmarRecebimento').addEventListener('click', confirmarRecebimento);

    document.addEventListener('app:viewchange', (e) => { if (e.detail.view === 'suprimentos') mostrarAba('requisicoes'); });
  }

  function mostrarAba(nome) {
    document.querySelectorAll('.supr-tab').forEach((b) => b.classList.toggle('ativa', b.dataset.supraba === nome));
    ['requisicoes', 'cotacoes', 'pedidos', 'fornecedores', 'comparativo'].forEach((n) => {
      $('#suprPainel' + n[0].toUpperCase() + n.slice(1)).classList.toggle('hidden', n !== nome);
    });
    if (nome === 'requisicoes') mostrarSubRequisicao('lista');
    if (nome === 'cotacoes') mostrarSubCotacao('lista');
    if (nome === 'pedidos') carregarPedidos();
    if (nome === 'comparativo') carregarComparativo();
  }
  function mostrarSubRequisicao(nome) {
    ['Lista', 'Nova', 'Revisar'].forEach((n) => $('#suprRequisicoes' + n).classList.toggle('hidden', n.toLowerCase() !== nome));
  }
  function mostrarSubCotacao(nome) {
    $('#suprCotacoesLista').classList.toggle('hidden', nome !== 'lista');
    $('#suprCotacoesNova').classList.toggle('hidden', nome !== 'nova');
    $('#suprMapaCotacao').classList.toggle('hidden', nome !== 'mapa');
    if (nome === 'lista') carregarCotacoes();
  }

  // ======================= ORÇAMENTO =======================
  async function carregarOrcamentos() {
    const { dados } = await api('/api/orcamentos');
    estado.orcamentos = dados || [];
    const sel = $('#suprSelectOrcamento');
    if (!estado.orcamentos.length) { sel.innerHTML = '<option value="">Nenhum orçamento</option>'; return; }
    sel.innerHTML = estado.orcamentos.map((o) => `<option value="${esc(o.id)}">${esc(o.codigo || '')} — ${esc(o.nome)}</option>`).join('');
    await selecionarOrcamento(estado.orcamentos[0].id);
  }
  async function selecionarOrcamento(id) {
    estado.orcamentoId = id;
    $('#suprSelectOrcamento').value = id;
    const orc = estado.orcamentos.find((o) => o.id === id);
    estado.servicosFlat = orc ? flattenServicos(orc) : [];
    await carregarRequisicoes();
    renderArvoreItens();
  }

  // ======================= REQUISIÇÕES (multi-item) =======================
  function renderArvoreItens() {
    const filtro = ($('#suprFiltroItens').value || '').trim().toLowerCase();
    const wrap = $('#suprArvoreItens');
    const linhas = estado.servicosFlat.filter((s) => !filtro || s.nome.toLowerCase().includes(filtro) || s.caminho.toLowerCase().includes(filtro));
    if (!linhas.length) { wrap.innerHTML = '<div class="supr-empty">Nenhum item encontrado.</div>'; return; }
    wrap.innerHTML = linhas.slice(0, 250).map((s) => {
      const sel = estado.carrinho.some((c) => c.itemOrcamentoId === s.id);
      return `<label class="orcamento-item supr-item-check ${sel ? 'selecionado' : ''}">
        <input type="checkbox" data-item="${esc(s.id)}" ${sel ? 'checked' : ''}>
        <div class="oi-info">
          <strong>${esc(s.nome)}</strong><span>${esc(s.caminho)}</span>
          <span>${esc(s.unidade)} · ${fmtBRL(s.valorUnitario)}/${esc(s.unidade)} · Qtd. orçada: ${fmtNum(s.quantidade)}</span>
        </div>
      </label>`;
    }).join('') + `<div class="supr-carrinho-resumo">${estado.carrinho.length} item(ns) selecionado(s)</div>
      <button class="btn btn-primary btn-sm" id="suprBtnRevisarCarrinho" ${estado.carrinho.length ? '' : 'disabled'}>Revisar e definir quantidades →</button>`;
    wrap.querySelectorAll('[data-item]').forEach((chk) => chk.addEventListener('change', () => {
      const s = estado.servicosFlat.find((x) => x.id === chk.dataset.item);
      if (chk.checked) estado.carrinho.push({ itemOrcamentoId: s.id, descricao: s.nome, unidade: s.unidade, quantidadeOrcamento: s.quantidade, quantidadeSolicitada: s.quantidade });
      else estado.carrinho = estado.carrinho.filter((c) => c.itemOrcamentoId !== s.id);
      renderArvoreItens();
    }));
    const btnRev = $('#suprBtnRevisarCarrinho');
    if (btnRev) btnRev.addEventListener('click', () => { mostrarSubRequisicao('revisar'); renderCarrinhoRevisar(); });
  }

  function renderCarrinhoRevisar() {
    $('#suprCarrinhoLista').innerHTML = estado.carrinho.map((c, i) => `
      <div class="supr-carrinho-item">
        <div class="oi-info"><strong>${esc(c.descricao)}</strong><span>Orçado: ${fmtNum(c.quantidadeOrcamento)} ${esc(c.unidade)}</span></div>
        <input type="number" step="0.01" min="0.01" value="${c.quantidadeSolicitada}" data-qtd-idx="${i}">
        <span>${esc(c.unidade)}</span>
        <button class="supr-remover" data-remover-idx="${i}" title="Remover">×</button>
      </div>`).join('');
    $('#suprCarrinhoLista').querySelectorAll('[data-qtd-idx]').forEach((inp) => inp.addEventListener('input', () => {
      estado.carrinho[Number(inp.dataset.qtdIdx)].quantidadeSolicitada = parseFloat(inp.value) || 0;
    }));
    $('#suprCarrinhoLista').querySelectorAll('[data-remover-idx]').forEach((btn) => btn.addEventListener('click', () => {
      estado.carrinho.splice(Number(btn.dataset.removerIdx), 1);
      renderCarrinhoRevisar();
      if (!estado.carrinho.length) mostrarSubRequisicao('nova');
    }));
  }

  async function salvarRequisicao() {
    const msgEl = $('#suprMsgRequisicao');
    if (!estado.carrinho.length || estado.carrinho.some((c) => !c.quantidadeSolicitada || c.quantidadeSolicitada <= 0)) {
      msgEl.textContent = 'Confira as quantidades — todas devem ser maiores que zero.'; msgEl.className = 'supr-msg erro'; return;
    }
    try {
      await api('/api/compras/requisicoes', { method: 'POST', body: JSON.stringify({ orcamentoId: estado.orcamentoId, observacoes: $('#suprReqObservacoes').value || null, itens: estado.carrinho }) });
      estado.carrinho = []; $('#suprReqObservacoes').value = ''; msgEl.textContent = '';
      mostrarSubRequisicao('lista');
      await carregarRequisicoes();
    } catch (e) { msgEl.textContent = msgErro(e); msgEl.className = 'supr-msg erro'; }
  }

  async function carregarRequisicoes() {
    if (!estado.orcamentoId) { estado.requisicoes = []; renderRequisicoes(); return; }
    const { requisicoes } = await api('/api/compras/requisicoes?orcamentoId=' + encodeURIComponent(estado.orcamentoId));
    estado.requisicoes = requisicoes || [];
    renderRequisicoes();
  }
  function renderRequisicoes() {
    const wrap = $('#suprListaRequisicoes');
    if (!estado.requisicoes.length) { wrap.innerHTML = '<div class="supr-empty">Nenhuma requisição criada ainda para este orçamento.</div>'; return; }
    wrap.innerHTML = estado.requisicoes.map((r) => `
      <div class="supr-pedido-card">
        <div class="supr-pedido-head">
          <div><h4>${r.itens.length} item(ns) — ${esc(r.solicitanteNome || r.solicitanteEmail)}</h4>
          <p>${(r.criadoEm || '').slice(0, 10)}${r.observacoes ? ' · ' + esc(r.observacoes) : ''}</p></div>
          <div>${badge(r.status)}</div>
        </div>
        <table class="tabela" style="margin-top:8px"><tbody>
          ${r.itens.map((it) => `<tr><td>${esc(it.descricao)}</td><td class="col-num">${fmtNum(it.quantidadeSolicitada)} ${esc(it.unidade || '')}</td><td>${badge(it.status)}</td></tr>`).join('')}
        </tbody></table>
        ${estado.usuario.podeEditar && r.status === 'aberta' ? `<div class="supr-pedido-acoes"><button class="btn btn-xs btn-danger" data-cancelar-req="${esc(r.id)}">Cancelar requisição</button></div>` : ''}
      </div>`).join('');
    wrap.querySelectorAll('[data-cancelar-req]').forEach((btn) => btn.addEventListener('click', async () => {
      if (!confirm('Cancelar esta requisição e todos os itens dela?')) return;
      await api('/api/compras/requisicoes/' + btn.dataset.cancelarReq, { method: 'PUT', body: JSON.stringify({ status: 'cancelada' }) });
      await carregarRequisicoes();
    }));
  }

  // ======================= COTAÇÕES =======================
  async function carregarCotacoes() {
    if (!estado.orcamentoId) { estado.cotacoes = []; renderCotacoesLista(); return; }
    const { cotacoes } = await api('/api/compras/cotacoes?orcamentoId=' + encodeURIComponent(estado.orcamentoId));
    estado.cotacoes = cotacoes || [];
    renderCotacoesLista();
  }
  function renderCotacoesLista() {
    const wrap = $('#suprListaCotacoes');
    if (!estado.cotacoes.length) { wrap.innerHTML = '<div class="supr-empty">Nenhuma cotação criada ainda.</div>'; return; }
    wrap.innerHTML = estado.cotacoes.map((c) => `
      <div class="supr-pedido-card">
        <div class="supr-pedido-head">
          <div><h4>Cotação de ${(c.criadoEm || '').slice(0, 10)}</h4><p>${esc(c.criadoPorEmail)}</p></div>
          <div>${badge(c.status)}</div>
        </div>
        <div class="supr-pedido-acoes"><button class="btn btn-xs btn-ghost" data-abrir-mapa="${esc(c.id)}">${c.status === 'aberta' ? 'Abrir mapa de comparação' : 'Ver mapa'}</button></div>
      </div>`).join('');
    wrap.querySelectorAll('[data-abrir-mapa]').forEach((btn) => btn.addEventListener('click', () => abrirMapaCotacao(btn.dataset.abrirMapa)));
  }

  function itensRequisicaoDisponiveis() {
    const linhas = [];
    estado.requisicoes.forEach((r) => {
      (r.itens || []).forEach((it) => {
        if (['pendente', 'em_cotacao'].includes(it.status)) linhas.push(Object.assign({}, it, { requisicaoInfo: r.solicitanteNome || r.solicitanteEmail }));
      });
    });
    return linhas;
  }
  function renderItensParaCotar() {
    const wrap = $('#suprItensParaCotar');
    const disponiveis = itensRequisicaoDisponiveis();
    if (!disponiveis.length) { wrap.innerHTML = '<div class="supr-empty">Nenhum item de requisição pendente de cotação neste orçamento.</div>'; return; }
    wrap.innerHTML = disponiveis.map((it) => {
      const sel = estado.novaCotacaoItens.find((x) => x.itemRequisicaoId === it.id);
      return `<label class="orcamento-item supr-item-check ${sel ? 'selecionado' : ''}">
        <input type="checkbox" data-itreq="${esc(it.id)}" ${sel ? 'checked' : ''}>
        <div class="oi-info"><strong>${esc(it.descricao)}</strong><span>Solicitado por ${esc(it.requisicaoInfo)} · Qtd. requisitada: ${fmtNum(it.quantidadeSolicitada)} ${esc(it.unidade || '')}</span></div>
        ${sel ? `<input type="number" step="0.01" min="0.01" style="width:100px" value="${sel.quantidade}" data-itreq-qtd="${esc(it.id)}">` : ''}
      </label>`;
    }).join('');
    wrap.querySelectorAll('[data-itreq]').forEach((chk) => chk.addEventListener('change', () => {
      const it = disponiveis.find((x) => x.id === chk.dataset.itreq);
      if (chk.checked) estado.novaCotacaoItens.push({ itemRequisicaoId: it.id, descricao: it.descricao, unidade: it.unidade, quantidade: it.quantidadeSolicitada });
      else estado.novaCotacaoItens = estado.novaCotacaoItens.filter((x) => x.itemRequisicaoId !== it.id);
      renderItensParaCotar();
    }));
    wrap.querySelectorAll('[data-itreq-qtd]').forEach((inp) => inp.addEventListener('input', () => {
      const alvo = estado.novaCotacaoItens.find((x) => x.itemRequisicaoId === inp.dataset.itreqQtd);
      if (alvo) alvo.quantidade = parseFloat(inp.value) || 0;
    }));
  }
  function renderFornecedoresParaCotar() {
    const wrap = $('#suprFornecedoresParaCotar');
    if (!estado.fornecedores.length) { wrap.innerHTML = '<div class="supr-empty">Cadastre fornecedores na aba "Fornecedores" primeiro.</div>'; return; }
    wrap.innerHTML = estado.fornecedores.map((f) => {
      const sel = estado.novaCotacaoFornecedores[f.id];
      return `<label class="supr-chip-fornecedor ${sel ? 'selecionado' : ''}">
        <input type="checkbox" data-forn="${esc(f.id)}" ${sel ? 'checked' : ''}> ${esc(f.nome)}
      </label>`;
    }).join('');
    wrap.querySelectorAll('[data-forn]').forEach((chk) => chk.addEventListener('change', () => {
      if (chk.checked) estado.novaCotacaoFornecedores[chk.dataset.forn] = { condicaoPagamento: null };
      else delete estado.novaCotacaoFornecedores[chk.dataset.forn];
      renderFornecedoresParaCotar();
    }));
  }
  async function criarMapaCotacao() {
    const msgEl = $('#suprMsgNovaCotacao');
    const fornecedorIds = Object.keys(estado.novaCotacaoFornecedores);
    if (!estado.novaCotacaoItens.length || !fornecedorIds.length) {
      msgEl.textContent = 'Selecione ao menos 1 item e 1 fornecedor.'; msgEl.className = 'supr-msg erro'; return;
    }
    try {
      const r = await api('/api/compras/cotacoes', {
        method: 'POST',
        body: JSON.stringify({
          orcamentoId: estado.orcamentoId,
          itens: estado.novaCotacaoItens.map((it) => ({ itemRequisicaoId: it.itemRequisicaoId, quantidade: it.quantidade })),
          fornecedores: fornecedorIds.map((id) => ({ fornecedorId: id, condicaoPagamento: estado.novaCotacaoFornecedores[id].condicaoPagamento })),
        }),
      });
      await carregarRequisicoes();
      abrirMapaCotacao(r.id);
    } catch (e) { msgEl.textContent = msgErro(e); msgEl.className = 'supr-msg erro'; }
  }

  async function abrirMapaCotacao(cotacaoId) {
    estado.mapaAtual = await api('/api/compras/cotacoes/' + cotacaoId);
    mostrarSubCotacao('mapa');
    renderMapa();
  }
  function precoCelula(cotacaoItemId, fornecedorId) {
    return estado.mapaAtual.precos.find((p) => p.cotacaoItemId === cotacaoItemId && p.fornecedorId === fornecedorId);
  }
  function renderMapa() {
    const { cotacao, itens, fornecedores } = estado.mapaAtual;
    const finalizada = cotacao.status !== 'aberta';
    const wrap = $('#suprMapaWrap');
    if (!itens.length || !fornecedores.length) { wrap.innerHTML = '<div class="supr-empty">Mapa vazio.</div>'; return; }

    let html = `<div class="supr-mapa-scroll"><table class="supr-mapa"><thead><tr><th class="supr-col-item">Item</th>`;
    fornecedores.forEach((f) => {
      html += `<th class="supr-fornecedor-head">${esc(f.nome)}<small>${esc(f.condicaoPagamento || 'condição não informada')}</small><span class="supr-rodada-badge">Rodada ${f.rodada}</span></th>`;
    });
    html += '</tr></thead><tbody>';

    itens.forEach((it) => {
      const precosDaLinha = fornecedores.map((f) => precoCelula(it.cotacaoItemId, f.fornecedorId)).filter((p) => p && p.precoUnitario);
      const menor = precosDaLinha.length ? Math.min(...precosDaLinha.map((p) => p.precoUnitario)) : null;
      html += `<tr><td class="supr-col-item"><strong>${esc(it.descricao)}</strong><br><span style="color:var(--suave)">Qtd.: ${fmtNum(it.quantidade)} ${esc(it.unidade || '')}</span></td>`;
      fornecedores.forEach((f) => {
        const p = precoCelula(it.cotacaoItemId, f.fornecedorId);
        const classes = ['supr-celula'];
        if (p && p.vencedora) classes.push('supr-celula-vencedora');
        html += `<td class="${classes.join(' ')}">
          <input type="number" step="0.01" min="0" placeholder="R$" value="${p ? p.precoUnitario : ''}"
            class="${p && menor != null && p.precoUnitario === menor ? 'supr-menor-preco' : ''}"
            data-preco data-cotitem="${esc(it.cotacaoItemId)}" data-forn="${esc(f.fornecedorId)}" ${finalizada || !estado.usuario.podeEditar ? 'disabled' : ''}>
          ${p ? `<label class="supr-flag-vencedora"><input type="checkbox" data-vencedora data-cotitem="${esc(it.cotacaoItemId)}" data-forn="${esc(f.fornecedorId)}" ${p.vencedora ? 'checked' : ''} ${finalizada || !estado.usuario.podeEditar ? 'disabled' : ''}> vencedor</label>` : ''}
        </td>`;
      });
      html += '</tr>';
    });
    html += '</tbody></table></div>';

    if (!finalizada && estado.usuario.podeEditar) {
      html += `<div id="suprMsgMapa" class="supr-msg"></div><button class="btn btn-primary" id="suprBtnFinalizarCotacao" style="margin-top:16px">Finalizar cotação e gerar pedidos</button>`;
    } else if (cotacao.status === 'finalizada') {
      html += `<p style="color:var(--verde);font-weight:700;margin-top:14px">✓ Cotação finalizada — veja os pedidos gerados na aba "Pedidos".</p>`;
    }
    wrap.innerHTML = html;

    wrap.querySelectorAll('[data-preco]').forEach((inp) => inp.addEventListener('change', async () => {
      const valor = parseFloat(inp.value);
      if (!valor || valor <= 0) return;
      await api(`/api/compras/cotacoes/${cotacao.id}/precos`, { method: 'PUT', body: JSON.stringify({ cotacaoItemId: inp.dataset.cotitem, fornecedorId: inp.dataset.forn, precoUnitario: valor }) });
      estado.mapaAtual = await api('/api/compras/cotacoes/' + cotacao.id);
      renderMapa();
    }));
    wrap.querySelectorAll('[data-vencedora]').forEach((chk) => chk.addEventListener('change', async () => {
      await api(`/api/compras/cotacoes/${cotacao.id}/vencedores`, { method: 'PUT', body: JSON.stringify({ cotacaoItemId: chk.dataset.cotitem, fornecedorId: chk.dataset.forn, vencedora: chk.checked }) });
      estado.mapaAtual = await api('/api/compras/cotacoes/' + cotacao.id);
      renderMapa();
    }));
    const btnFin = $('#suprBtnFinalizarCotacao');
    if (btnFin) btnFin.addEventListener('click', async () => {
      const msgEl = $('#suprMsgMapa');
      if (!confirm('Finalizar cotação? Isso vai gerar os pedidos de compra (um por fornecedor vencedor) e não pode ser desfeito.')) return;
      try {
        const r = await api(`/api/compras/cotacoes/${cotacao.id}/finalizar`, { method: 'POST' });
        alert(`${r.pedidos.length} pedido(s) gerado(s):\n` + r.pedidos.map((p) => `${p.numero} — ${p.fornecedorNome} — ${fmtBRL(p.valorTotal)}`).join('\n'));
        mostrarAba('pedidos');
      } catch (e) { msgEl.textContent = msgErro(e); msgEl.className = 'supr-msg erro'; }
    });
  }

  // ======================= PEDIDOS =======================
  async function carregarPedidos() {
    if (!estado.orcamentoId) { estado.pedidos = []; renderPedidos(); return; }
    const { pedidos } = await api('/api/compras/pedidos?orcamentoId=' + encodeURIComponent(estado.orcamentoId));
    estado.pedidos = pedidos || [];
    renderPedidos();
  }
  function renderPedidos() {
    const wrap = $('#suprListaPedidos');
    if (!estado.pedidos.length) { wrap.innerHTML = '<div class="supr-empty">Nenhum pedido gerado ainda.</div>'; return; }
    wrap.innerHTML = estado.pedidos.map((p) => `
      <div class="supr-pedido-card">
        <div class="supr-pedido-head">
          <div><h4>${esc(p.numero)} — ${esc(p.fornecedorNome)}</h4><p>Emitido em ${(p.dataEmissao || '').slice(0, 10)}${p.emailEnviadoEm ? ' · e-mail enviado' : ''}${p.confirmadoEm ? ' · confirmado pelo fornecedor ✓' : ''}</p></div>
          <div style="text-align:right">${badge(p.status)}<div class="supr-pedido-valor">${fmtBRL(p.valorTotal)}</div></div>
        </div>
        <div class="supr-pedido-acoes">
          <button class="btn btn-xs btn-ghost" data-ver-pdf="${esc(p.id)}">Ver PDF</button>
          ${estado.usuario.podeEditar && !p.emailEnviadoEm ? `<button class="btn btn-xs btn-primary" data-enviar="${esc(p.id)}">Enviar por e-mail</button>` : ''}
          ${estado.usuario.podeEditar && !['recebido_total', 'cancelado'].includes(p.status) ? `<button class="btn btn-xs btn-primary" data-receber="${esc(p.id)}">Lançar recebimento</button>` : ''}
        </div>
      </div>`).join('');
    wrap.querySelectorAll('[data-ver-pdf]').forEach((btn) => btn.addEventListener('click', () => window.open('/api/compras/pedidos/' + btn.dataset.verPdf + '/pdf', '_blank')));
    wrap.querySelectorAll('[data-enviar]').forEach((btn) => btn.addEventListener('click', async () => {
      btn.disabled = true; btn.textContent = 'Enviando...';
      try { const r = await api('/api/compras/pedidos/' + btn.dataset.enviar + '/enviar', { method: 'POST' }); alert('E-mail enviado para ' + r.enviadoPara); await carregarPedidos(); }
      catch (e) { alert(msgErro(e)); btn.disabled = false; btn.textContent = 'Enviar por e-mail'; }
    }));
    wrap.querySelectorAll('[data-receber]').forEach((btn) => btn.addEventListener('click', () => abrirModalRecebimento(btn.dataset.receber)));
  }

  async function abrirModalRecebimento(pedidoId) {
    const { pedido, itens } = await api('/api/compras/pedidos/' + pedidoId);
    $('#suprModalRecebimento').dataset.pedidoId = pedidoId;
    $('#suprModalRecPedidoInfo').textContent = `${pedido.numero} — ${pedido.fornecedorNome}`;
    $('#suprRecNotaNumero').value = ''; $('#suprRecNotaChave').value = ''; $('#suprRecData').value = hoje();
    $('#suprRecValor').value = pedido.valorTotal; $('#suprRecObservacoes').value = ''; $('#suprMsgRecebimento').textContent = '';
    $('#suprRecItensWrap').innerHTML = `<h4 style="margin:14px 0 8px">Quantidade recebida por item</h4>` + itens.map((it) => `
      <div class="supr-carrinho-item">
        <div class="oi-info"><strong>${esc(it.descricao)}</strong><span>Pedido: ${fmtNum(it.quantidade)} ${esc(it.unidade || '')}</span></div>
        <input type="number" step="0.01" min="0" value="${it.quantidade}" data-item-pedido="${esc(it.id)}">
        <span>${esc(it.unidade || '')}</span>
      </div>`).join('');
    $('#suprModalRecebimento').showModal();
  }
  async function confirmarRecebimento() {
    const pedidoId = $('#suprModalRecebimento').dataset.pedidoId;
    const msgEl = $('#suprMsgRecebimento');
    const itensInputs = [...document.querySelectorAll('[data-item-pedido]')];
    const itens = itensInputs.map((inp) => ({ itemPedidoId: inp.dataset.itemPedido, quantidadeRecebida: parseFloat(inp.value) || 0 })).filter((it) => it.quantidadeRecebida > 0);
    const valorNota = parseFloat($('#suprRecValor').value);
    if (!itens.length || isNaN(valorNota) || valorNota < 0 || !$('#suprRecData').value) {
      msgEl.textContent = 'Informe ao menos 1 item recebido, a data e o valor da nota.'; msgEl.className = 'supr-msg erro'; return;
    }
    try {
      await api('/api/compras/recebimentos', { method: 'POST', body: JSON.stringify({ pedidoId, notaFiscalNumero: $('#suprRecNotaNumero').value || null, notaFiscalChave: $('#suprRecNotaChave').value || null, dataRecebimento: $('#suprRecData').value, valorNota, observacoes: $('#suprRecObservacoes').value || null, itens }) });
      $('#suprModalRecebimento').close();
      await carregarPedidos();
    } catch (e) { msgEl.textContent = msgErro(e); msgEl.className = 'supr-msg erro'; }
  }

  // ======================= FORNECEDORES =======================
  async function carregarFornecedores() {
    const { fornecedores } = await api('/api/compras/fornecedores');
    estado.fornecedores = fornecedores || [];
    renderFornecedores();
  }
  function renderFornecedores() {
    const wrap = $('#suprListaFornecedores');
    if (!estado.fornecedores.length) { wrap.innerHTML = '<div class="supr-empty">Nenhum fornecedor cadastrado ainda.</div>'; return; }
    wrap.innerHTML = `<table class="tabela"><thead><tr><th>Nome</th><th>CNPJ</th><th>Telefone</th><th>E-mail</th></tr></thead><tbody>${estado.fornecedores.map((f) => `<tr><td>${esc(f.nome)}</td><td>${esc(f.cnpj || '—')}</td><td>${esc(f.telefone || '—')}</td><td>${esc(f.email || '—')}</td></tr>`).join('')}</tbody></table>`;
  }
  async function salvarFornecedor() {
    const nome = $('#suprFNome').value.trim();
    const msgEl = $('#suprMsgFornecedor');
    if (!nome) { msgEl.textContent = 'Informe o nome do fornecedor.'; msgEl.className = 'supr-msg erro'; return; }
    try {
      await api('/api/compras/fornecedores', { method: 'POST', body: JSON.stringify({ nome, cnpj: $('#suprFCnpj').value || null, telefone: $('#suprFTelefone').value || null, email: $('#suprFEmail').value || null }) });
      ['#suprFNome', '#suprFCnpj', '#suprFTelefone', '#suprFEmail'].forEach((s) => { $(s).value = ''; });
      msgEl.textContent = 'Fornecedor adicionado.'; msgEl.className = 'supr-msg ok';
      await carregarFornecedores();
    } catch (e) { msgEl.textContent = msgErro(e); msgEl.className = 'supr-msg erro'; }
  }

  // ======================= COMPARATIVO =======================
  async function carregarComparativo() {
    if (!estado.orcamentoId) { estado.comparativo = null; renderComparativo(); return; }
    estado.comparativo = await api('/api/compras/comparativo?orcamentoId=' + encodeURIComponent(estado.orcamentoId));
    renderComparativo();
  }
  function renderComparativo() {
    const corpo = $('#suprCorpoComparativo'); const resumo = $('#suprResumoComparativo');
    if (!estado.comparativo) { corpo.innerHTML = ''; resumo.innerHTML = ''; return; }
    const comprometidoPorItem = {}; (estado.comparativo.comprometido || []).forEach((r) => { comprometidoPorItem[r.itemOrcamentoId] = r.valor; });
    const executadoPorItem = {}; (estado.comparativo.executado || []).forEach((r) => { executadoPorItem[r.itemOrcamentoId] = r.valor; });
    const itensComMovimento = estado.servicosFlat.filter((s) => comprometidoPorItem[s.id] != null || executadoPorItem[s.id] != null);
    if (!itensComMovimento.length) { corpo.innerHTML = '<tr><td colspan="5" class="sem-servicos">Nenhuma compra iniciada ainda para este orçamento.</td></tr>'; resumo.innerHTML = ''; return; }
    let totalOrcado = 0, totalComprometido = 0, totalExecutado = 0;
    corpo.innerHTML = itensComMovimento.map((s) => {
      const comprometido = comprometidoPorItem[s.id] || 0, executado = executadoPorItem[s.id] || 0, saldo = s.valorOrcado - comprometido - executado;
      totalOrcado += s.valorOrcado; totalComprometido += comprometido; totalExecutado += executado;
      return `<tr><td><strong>${esc(s.nome)}</strong><br><span style="color:var(--suave);font-size:11px">${esc(s.caminho)}</span></td>
        <td class="col-num">${fmtBRL(s.valorOrcado)}</td><td class="col-num">${fmtBRL(comprometido)}</td><td class="col-num">${fmtBRL(executado)}</td>
        <td class="col-num" style="color:${saldo < 0 ? 'var(--vermelho)' : 'var(--verde)'};font-weight:700">${fmtBRL(saldo)}</td></tr>`;
    }).join('');
    resumo.innerHTML = `
      <div class="resumo-card"><span>Orçado (itens em compra)</span><strong>${fmtBRL(totalOrcado)}</strong></div>
      <div class="resumo-card"><span>Comprometido</span><strong>${fmtBRL(totalComprometido)}</strong></div>
      <div class="resumo-card"><span>Executado</span><strong>${fmtBRL(totalExecutado)}</strong></div>
      <div class="resumo-card"><span>Saldo</span><strong class="total-grande">${fmtBRL(totalOrcado - totalComprometido - totalExecutado)}</strong></div>`;
  }

  document.addEventListener('DOMContentLoaded', init);
})();
