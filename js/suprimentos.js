(function () {
  'use strict';

  const estado = {
    usuario: null,
    orcamentos: [],
    orcamentoId: null,
    servicosFlat: [],
    requisicoes: [],
    requisicaoSelecionadaId: null,
    cotacoesDaRequisicao: [],
    fornecedores: [],
    pedidos: [],
    recebimentosPorPedido: {},
    comparativo: null,
  };

  // ---------- helpers ----------
  function $(sel) { return document.querySelector(sel); }
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[c]));
  }
  function fmtBRL(v) {
    return (Number(v) || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  }
  function fmtNum(v) {
    return (Number(v) || 0).toLocaleString('pt-BR', { maximumFractionDigits: 2 });
  }
  function hoje() { return new Date().toISOString().slice(0, 10); }

  async function api(path, opts) {
    opts = opts || {};
    const res = await fetch(path, Object.assign({
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' }
    }, opts));
    let data = null;
    try { data = await res.json(); } catch (e) { /* resposta sem corpo */ }
    if (!res.ok) {
      const err = new Error((data && data.erro) || ('erro_http_' + res.status));
      err.status = res.status; err.data = data;
      throw err;
    }
    return data;
  }

  const MENSAGENS_ERRO = {
    nao_autenticado: 'Sessão expirada — faça login novamente.',
    somente_visualizacao: 'Seu usuário não tem permissão de edição.',
    nao_autorizado: 'Você não tem permissão para esta ação.',
    parametros_invalidos: 'Preencha os campos obrigatórios.',
    ja_bloqueado: 'Já existe um bloqueio para este item.',
    cotacao_precisa_ser_vencedora: 'Marque uma cotação como vencedora antes de gerar o pedido.',
  };
  function msgErro(e) {
    return MENSAGENS_ERRO[e && e.message] || 'Não foi possível concluir. Tente novamente.';
  }

  // ---------- cálculo de quantidade orçada (mesma lógica do memo do orçamento) ----------
  function numBR(v) {
    if (v === '' || v == null) return 1;
    const n = parseFloat(String(v).replace(',', '.'));
    return isNaN(n) ? 1 : n;
  }
  function qtdServico(s) {
    if (s.qtdManual != null && s.qtdManual !== '') return Number(s.qtdManual) || 0;
    if (!s.memo || !s.memo.length) return 0;
    return s.memo.reduce((acc, m) => {
      const prod = ['comprimento', 'altura', 'largura', 'coeficiente', 'quantidade']
        .map((k) => numBR(m[k]))
        .reduce((a, b) => a * b, 1);
      return acc + prod;
    }, 0);
  }

  function flattenServicos(orcamento) {
    const linhas = [];
    const versao = orcamento.versoes && orcamento.versoes[orcamento.versoes.length - 1];
    if (!versao) return linhas;
    function andar(nivel, caminho) {
      (nivel.servicos || []).forEach((s) => {
        const quantidade = qtdServico(s);
        linhas.push({
          id: s.id,
          caminho: caminho.join(' › '),
          nome: s.nome,
          unidade: s.unidadeMedida || '',
          codigo: s.codigo || '',
          valorUnitario: s.valorUnitario || 0,
          quantidade,
          valorOrcado: quantidade * (s.valorUnitario || 0),
        });
      });
      (nivel.subEtapas || []).forEach((se) => andar(se, caminho.concat(se.nome)));
      (nivel.etapas || []).forEach((e) => andar(e, caminho.concat(e.nome)));
      (nivel.unidades || []).forEach((u) => andar(u, caminho.concat(u.nome)));
    }
    andar(versao, []);
    return linhas;
  }

  // ---------- init ----------
  async function init() {
    try {
      estado.usuario = await api('/api/auth/me');
    } catch (e) {
      location.href = '/';
      return;
    }
    $('#nomeUsuario').textContent = estado.usuario.nome || estado.usuario.email;
    if (!estado.usuario.podeEditar) {
      $('#bannerSomenteLeitura').classList.remove('hidden');
    }

    document.querySelectorAll('.supr-tab').forEach((btn) => {
      btn.addEventListener('click', () => mudarAba(btn.dataset.aba));
    });
    $('#selectOrcamento').addEventListener('change', (e) => selecionarOrcamento(e.target.value));
    $('#filtroServicos').addEventListener('input', renderListaServicos);
    $('#selectRequisicaoCotacao').addEventListener('change', carregarCotacoesDaRequisicaoSelecionada);

    $('#btnCancelarRequisicao').addEventListener('click', () => $('#modalRequisicao').close());
    $('#btnConfirmarRequisicao').addEventListener('click', confirmarNovaRequisicao);
    $('#btnCancelarRecebimento').addEventListener('click', () => $('#modalRecebimento').close());
    $('#btnConfirmarRecebimento').addEventListener('click', confirmarRecebimento);
    $('#btnSalvarFornecedor').addEventListener('click', salvarFornecedor);

    await carregarOrcamentos();
    await carregarFornecedores();
  }

  function mudarAba(nome) {
    document.querySelectorAll('.supr-tab').forEach((b) => b.classList.toggle('ativa', b.dataset.aba === nome));
    ['requisicoes', 'cotacoes', 'pedidos', 'fornecedores', 'comparativo'].forEach((n) => {
      $('#aba' + n[0].toUpperCase() + n.slice(1)).classList.toggle('hidden', n !== nome);
    });
    if (nome === 'pedidos') carregarPedidos();
    if (nome === 'comparativo') carregarComparativo();
  }

  // ---------- orçamentos ----------
  async function carregarOrcamentos() {
    const { dados } = await api('/api/orcamentos');
    estado.orcamentos = dados || [];
    const sel = $('#selectOrcamento');
    if (!estado.orcamentos.length) {
      sel.innerHTML = '<option value="">Nenhum orçamento encontrado</option>';
      return;
    }
    sel.innerHTML = estado.orcamentos.map((o) =>
      `<option value="${esc(o.id)}">${esc(o.codigo || '')} — ${esc(o.nome)}</option>`
    ).join('');
    await selecionarOrcamento(estado.orcamentos[0].id);
  }

  async function selecionarOrcamento(id) {
    estado.orcamentoId = id;
    $('#selectOrcamento').value = id;
    const orc = estado.orcamentos.find((o) => o.id === id);
    estado.servicosFlat = orc ? flattenServicos(orc) : [];
    renderListaServicos();
    await carregarRequisicoes();
    await carregarPedidos();
    if (!$('#abaComparativo').classList.contains('hidden')) await carregarComparativo();
  }

  // ---------- requisições ----------
  function renderListaServicos() {
    const filtro = $('#filtroServicos').value.trim().toLowerCase();
    const wrap = $('#listaServicos');
    const linhas = estado.servicosFlat.filter((s) =>
      !filtro || s.nome.toLowerCase().includes(filtro) || s.caminho.toLowerCase().includes(filtro)
    );
    if (!linhas.length) {
      wrap.innerHTML = '<div class="supr-empty">Nenhum item encontrado neste orçamento.</div>';
      return;
    }
    wrap.innerHTML = linhas.slice(0, 200).map((s) => `
      <div class="orcamento-item">
        <div class="oi-info">
          <strong>${esc(s.nome)}</strong>
          <span>${esc(s.caminho)}</span>
          <span>${esc(s.unidade)} · ${fmtBRL(s.valorUnitario)}/${esc(s.unidade)} · Qtd. orçada: ${fmtNum(s.quantidade)} · Total: ${fmtBRL(s.valorOrcado)}</span>
        </div>
        ${estado.usuario.podeEditar ? `<button class="btn btn-sm btn-primary" data-req="${esc(s.id)}">+ Requisitar</button>` : ''}
      </div>
    `).join('');
    wrap.querySelectorAll('[data-req]').forEach((btn) => {
      btn.addEventListener('click', () => abrirModalRequisicao(btn.dataset.req));
    });
  }

  function abrirModalRequisicao(itemId) {
    const item = estado.servicosFlat.find((s) => s.id === itemId);
    if (!item) return;
    $('#modalRequisicao').dataset.itemId = itemId;
    $('#modalReqItemNome').textContent = `${item.nome} (${item.caminho}) — un: ${item.unidade}`;
    $('#reqQuantidade').value = item.quantidade ? item.quantidade.toFixed(2) : '';
    $('#reqObservacoes').value = '';
    $('#supMsgRequisicao').textContent = '';
    $('#modalRequisicao').showModal();
  }

  async function confirmarNovaRequisicao() {
    const itemId = $('#modalRequisicao').dataset.itemId;
    const item = estado.servicosFlat.find((s) => s.id === itemId);
    const quantidade = parseFloat($('#reqQuantidade').value);
    const msgEl = $('#supMsgRequisicao');
    if (!item || !quantidade || quantidade <= 0) {
      msgEl.textContent = 'Informe uma quantidade válida.'; msgEl.className = 'supr-msg erro';
      return;
    }
    try {
      await api('/api/compras/requisicoes', {
        method: 'POST',
        body: JSON.stringify({
          orcamentoId: estado.orcamentoId,
          itemOrcamentoId: item.id,
          descricao: item.nome,
          unidade: item.unidade,
          quantidade,
          observacoes: $('#reqObservacoes').value || null,
        }),
      });
      $('#modalRequisicao').close();
      await carregarRequisicoes();
    } catch (e) {
      msgEl.textContent = msgErro(e); msgEl.className = 'supr-msg erro';
    }
  }

  async function carregarRequisicoes() {
    if (!estado.orcamentoId) { estado.requisicoes = []; renderRequisicoes(); return; }
    const { requisicoes } = await api('/api/compras/requisicoes?orcamentoId=' + encodeURIComponent(estado.orcamentoId));
    estado.requisicoes = requisicoes || [];
    renderRequisicoes();
    renderSelectRequisicoesParaCotacao();
  }

  const ROTULO_STATUS = {
    aberta: 'Aberta', em_cotacao: 'Em cotação', pedido_gerado: 'Pedido gerado',
    recebida_parcial: 'Recebida (parcial)', recebida_total: 'Recebida (total)', cancelada: 'Cancelada',
    emitido: 'Emitido', confirmado: 'Confirmado',
  };
  function badge(status) {
    return `<span class="supr-badge supr-badge-${esc(status)}">${esc(ROTULO_STATUS[status] || status)}</span>`;
  }

  function renderRequisicoes() {
    const wrap = $('#listaRequisicoes');
    if (!estado.requisicoes.length) {
      wrap.innerHTML = '<div class="supr-empty">Nenhuma requisição criada ainda para este orçamento.</div>';
      return;
    }
    wrap.innerHTML = `<div class="table-wrap"><table class="tabela"><thead><tr>
      <th>Item</th><th class="col-num">Qtd.</th><th>Status</th><th>Solicitante</th><th class="col-acoes">Ações</th>
    </tr></thead><tbody>${estado.requisicoes.map((r) => `
      <tr>
        <td>${esc(r.descricao)}</td>
        <td class="col-num">${fmtNum(r.quantidade)} ${esc(r.unidade || '')}</td>
        <td>${badge(r.status)}</td>
        <td>${esc(r.solicitanteNome || r.solicitanteEmail)}</td>
        <td class="col-acoes">
          ${r.status !== 'cancelada' && !r.status.startsWith('recebida') ? `<button class="btn btn-xs btn-ghost" data-ir-cotacao="${esc(r.id)}">Ir para cotação</button>` : ''}
          ${estado.usuario.podeEditar && r.status === 'aberta' ? `<button class="btn btn-xs btn-danger" data-cancelar="${esc(r.id)}">Cancelar</button>` : ''}
        </td>
      </tr>`).join('')}</tbody></table></div>`;
    wrap.querySelectorAll('[data-ir-cotacao]').forEach((btn) => btn.addEventListener('click', () => {
      mudarAba('cotacoes');
      $('#selectRequisicaoCotacao').value = btn.dataset.irCotacao;
      carregarCotacoesDaRequisicaoSelecionada();
    }));
    wrap.querySelectorAll('[data-cancelar]').forEach((btn) => btn.addEventListener('click', async () => {
      if (!confirm('Cancelar esta requisição?')) return;
      await api('/api/compras/requisicoes/' + btn.dataset.cancelar, {
        method: 'PUT', body: JSON.stringify({ status: 'cancelada' })
      });
      await carregarRequisicoes();
    }));
  }

  // ---------- cotações ----------
  function renderSelectRequisicoesParaCotacao() {
    const sel = $('#selectRequisicaoCotacao');
    const atual = sel.value;
    const candidatas = estado.requisicoes.filter((r) => ['aberta', 'em_cotacao'].includes(r.status));
    sel.innerHTML = candidatas.length
      ? candidatas.map((r) => `<option value="${esc(r.id)}">${esc(r.descricao)} (${fmtNum(r.quantidade)} ${esc(r.unidade || '')})</option>`).join('')
      : '<option value="">Nenhuma requisição aberta</option>';
    if (candidatas.some((r) => r.id === atual)) sel.value = atual;
    carregarCotacoesDaRequisicaoSelecionada();
  }

  function renderFormNovaCotacao() {
    const wrap = $('#formNovaCotacaoWrap');
    const id = $('#selectRequisicaoCotacao').value;
    if (!id || !estado.usuario.podeEditar) { wrap.innerHTML = ''; return; }
    wrap.innerHTML = `
      <div class="supr-form-inline">
        <label>Fornecedor
          <select id="cotFornecedor">${estado.fornecedores.map((f) => `<option value="${esc(f.id)}">${esc(f.nome)}</option>`).join('') || '<option value="">Cadastre um fornecedor</option>'}</select>
        </label>
        <label>Preço unitário (R$)<input id="cotPreco" type="number" step="0.01" min="0.01"></label>
        <label>Prazo entrega (dias)<input id="cotPrazo" type="number" min="0"></label>
        <label>Condição pagamento<input id="cotCondicao" type="text" placeholder="30/60 dias"></label>
        <label>Válida até<input id="cotValidade" type="date"></label>
        <div class="supr-form-actions">
          <button class="btn btn-primary btn-sm" id="btnAddCotacao">+ Adicionar cotação</button>
        </div>
      </div>
      <div id="supMsgCotacao" class="supr-msg"></div>
    `;
    $('#btnAddCotacao').addEventListener('click', adicionarCotacao);
  }

  async function adicionarCotacao() {
    const requisicaoId = $('#selectRequisicaoCotacao').value;
    const fornecedorId = $('#cotFornecedor').value;
    const precoUnitario = parseFloat($('#cotPreco').value);
    const msgEl = $('#supMsgCotacao');
    if (!requisicaoId || !fornecedorId || !precoUnitario || precoUnitario <= 0) {
      msgEl.textContent = 'Preencha fornecedor e preço.'; msgEl.className = 'supr-msg erro';
      return;
    }
    try {
      await api('/api/compras/cotacoes', {
        method: 'POST',
        body: JSON.stringify({
          requisicaoId, fornecedorId, precoUnitario,
          prazoEntregaDias: $('#cotPrazo').value ? Number($('#cotPrazo').value) : null,
          condicaoPagamento: $('#cotCondicao').value || null,
          validadeAte: $('#cotValidade').value || null,
        }),
      });
      await carregarRequisicoes();
      $('#selectRequisicaoCotacao').value = requisicaoId;
      await carregarCotacoesDaRequisicaoSelecionada();
    } catch (e) {
      msgEl.textContent = msgErro(e); msgEl.className = 'supr-msg erro';
    }
  }

  async function carregarCotacoesDaRequisicaoSelecionada() {
    const id = $('#selectRequisicaoCotacao').value;
    renderFormNovaCotacao();
    if (!id) { $('#listaCotacoes').innerHTML = ''; return; }
    estado.requisicaoSelecionadaId = id;
    const { cotacoes } = await api('/api/compras/requisicoes/' + id);
    estado.cotacoesDaRequisicao = cotacoes || [];
    renderCotacoes();
  }

  function renderCotacoes() {
    const wrap = $('#listaCotacoes');
    if (!estado.cotacoesDaRequisicao.length) {
      wrap.innerHTML = '<div class="supr-empty">Nenhuma cotação registrada para esta requisição.</div>';
      return;
    }
    wrap.innerHTML = estado.cotacoesDaRequisicao.map((c) => `
      <div class="supr-cotacao-item ${c.vencedora ? 'vencedora' : ''}">
        <div class="supr-cotacao-info">
          <strong>${esc(c.fornecedorNome)} ${c.vencedora ? '🏆' : ''}</strong>
          <span>Prazo: ${c.prazoEntregaDias != null ? c.prazoEntregaDias + ' dias' : '—'} · ${esc(c.condicaoPagamento || 'sem condição informada')}${c.validadeAte ? ' · válida até ' + esc(c.validadeAte) : ''}</span>
        </div>
        <div style="display:flex;align-items:center">
          <span class="supr-cotacao-preco">${fmtBRL(c.precoUnitario)}</span>
          ${estado.usuario.podeEditar && !c.vencedora ? `<button class="btn btn-xs btn-ghost" data-vencedora="${esc(c.id)}">Marcar vencedora</button>` : ''}
          ${estado.usuario.podeEditar && c.vencedora ? `<button class="btn btn-xs btn-primary" data-gerar-pedido="${esc(c.id)}">Gerar pedido</button>` : ''}
        </div>
      </div>
    `).join('');
    wrap.querySelectorAll('[data-vencedora]').forEach((btn) => btn.addEventListener('click', async () => {
      await api('/api/compras/cotacoes/' + btn.dataset.vencedora, { method: 'PUT', body: JSON.stringify({ vencedora: true }) });
      await carregarCotacoesDaRequisicaoSelecionada();
    }));
    wrap.querySelectorAll('[data-gerar-pedido]').forEach((btn) => btn.addEventListener('click', async () => {
      try {
        const r = await api('/api/compras/pedidos', { method: 'POST', body: JSON.stringify({ cotacaoId: btn.dataset.gerarPedido }) });
        alert('Pedido ' + r.numero + ' gerado — valor total ' + fmtBRL(r.valorTotal));
        await carregarRequisicoes();
        mudarAba('pedidos');
      } catch (e) {
        alert(msgErro(e));
      }
    }));
  }

  // ---------- pedidos & recebimento ----------
  async function carregarPedidos() {
    if (!estado.orcamentoId) { estado.pedidos = []; renderPedidos(); return; }
    const { pedidos } = await api('/api/compras/pedidos?orcamentoId=' + encodeURIComponent(estado.orcamentoId));
    estado.pedidos = pedidos || [];
    renderPedidos();
  }

  async function renderPedidos() {
    const wrap = $('#listaPedidos');
    if (!estado.pedidos.length) {
      wrap.innerHTML = '<div class="supr-empty">Nenhum pedido gerado ainda para este orçamento.</div>';
      return;
    }
    wrap.innerHTML = estado.pedidos.map((p) => `
      <div class="supr-pedido-card">
        <div class="supr-pedido-head">
          <div>
            <h4>${esc(p.numero)} — ${esc(p.descricao)}</h4>
            <p>Fornecedor: ${esc(p.fornecedorNome)} · ${fmtNum(p.quantidade)} un × ${fmtBRL(p.precoUnitario)} · Emitido em ${esc((p.dataEmissao || '').slice(0, 10))}</p>
          </div>
          <div style="text-align:right">
            ${badge(p.status)}
            <div class="supr-pedido-valor">${fmtBRL(p.valorTotal)}</div>
          </div>
        </div>
        ${estado.usuario.podeEditar ? `
        <div class="supr-pedido-acoes">
          ${p.status === 'emitido' ? `<button class="btn btn-xs btn-ghost" data-status="${esc(p.id)}" data-novo="confirmado">Confirmar c/ fornecedor</button>` : ''}
          ${!['recebido_total', 'cancelado'].includes(p.status) ? `<button class="btn btn-xs btn-primary" data-receber="${esc(p.id)}">Lançar recebimento / NF</button>` : ''}
          ${!['recebido_parcial', 'recebido_total', 'cancelado'].includes(p.status) ? `<button class="btn btn-xs btn-danger" data-status="${esc(p.id)}" data-novo="cancelado">Cancelar pedido</button>` : ''}
        </div>` : ''}
        <div class="supr-recebimentos" id="recPedido${esc(p.id)}"></div>
      </div>
    `).join('');

    wrap.querySelectorAll('[data-status]').forEach((btn) => btn.addEventListener('click', async () => {
      await api('/api/compras/pedidos/' + btn.dataset.status, { method: 'PUT', body: JSON.stringify({ status: btn.dataset.novo }) });
      await carregarPedidos();
    }));
    wrap.querySelectorAll('[data-receber]').forEach((btn) => btn.addEventListener('click', () => abrirModalRecebimento(btn.dataset.receber)));

    // carrega recebimentos já lançados de cada pedido, em paralelo
    estado.pedidos.forEach(async (p) => {
      try {
        const { recebimentos } = await api('/api/compras/pedidos/' + p.id);
        const el = $('#recPedido' + p.id);
        if (!el) return;
        el.innerHTML = recebimentos && recebimentos.length
          ? recebimentos.map((r) => `<div>📄 NF ${esc(r.notaFiscalNumero || '—')} · ${esc((r.dataRecebimento || '').slice(0, 10))} · ${fmtNum(r.quantidadeRecebida)} un · ${fmtBRL(r.valorNota)}</div>`).join('')
          : '';
      } catch (e) { /* ignora */ }
    });
  }

  function abrirModalRecebimento(pedidoId) {
    const pedido = estado.pedidos.find((p) => p.id === pedidoId);
    if (!pedido) return;
    $('#modalRecebimento').dataset.pedidoId = pedidoId;
    $('#modalRecPedidoInfo').textContent = `${pedido.numero} — ${pedido.descricao} (${pedido.fornecedorNome})`;
    $('#recNotaNumero').value = '';
    $('#recNotaChave').value = '';
    $('#recData').value = hoje();
    $('#recQuantidade').value = pedido.quantidade;
    $('#recValor').value = pedido.valorTotal;
    $('#recObservacoes').value = '';
    $('#supMsgRecebimento').textContent = '';
    $('#modalRecebimento').showModal();
  }

  async function confirmarRecebimento() {
    const pedidoId = $('#modalRecebimento').dataset.pedidoId;
    const msgEl = $('#supMsgRecebimento');
    const quantidadeRecebida = parseFloat($('#recQuantidade').value);
    const valorNota = parseFloat($('#recValor').value);
    if (!quantidadeRecebida || quantidadeRecebida <= 0 || isNaN(valorNota) || valorNota < 0 || !$('#recData').value) {
      msgEl.textContent = 'Preencha data, quantidade e valor da nota.'; msgEl.className = 'supr-msg erro';
      return;
    }
    try {
      await api('/api/compras/recebimentos', {
        method: 'POST',
        body: JSON.stringify({
          pedidoId,
          notaFiscalNumero: $('#recNotaNumero').value || null,
          notaFiscalChave: $('#recNotaChave').value || null,
          dataRecebimento: $('#recData').value,
          quantidadeRecebida, valorNota,
          observacoes: $('#recObservacoes').value || null,
        }),
      });
      $('#modalRecebimento').close();
      await carregarPedidos();
      await carregarRequisicoes();
    } catch (e) {
      msgEl.textContent = msgErro(e); msgEl.className = 'supr-msg erro';
    }
  }

  // ---------- fornecedores ----------
  async function carregarFornecedores() {
    const { fornecedores } = await api('/api/compras/fornecedores');
    estado.fornecedores = fornecedores || [];
    renderFornecedores();
  }

  function renderFornecedores() {
    const wrap = $('#listaFornecedores');
    if (!estado.fornecedores.length) {
      wrap.innerHTML = '<div class="supr-empty">Nenhum fornecedor cadastrado ainda.</div>';
      return;
    }
    wrap.innerHTML = `<table class="tabela"><thead><tr>
      <th>Nome</th><th>CNPJ</th><th>Telefone</th><th>E-mail</th>
    </tr></thead><tbody>${estado.fornecedores.map((f) => `
      <tr><td>${esc(f.nome)}</td><td>${esc(f.cnpj || '—')}</td><td>${esc(f.telefone || '—')}</td><td>${esc(f.email || '—')}</td></tr>
    `).join('')}</tbody></table>`;
  }

  async function salvarFornecedor() {
    const nome = $('#fNome').value.trim();
    const msgEl = $('#supMsgFornecedor');
    if (!nome) { msgEl.textContent = 'Informe o nome do fornecedor.'; msgEl.className = 'supr-msg erro'; return; }
    try {
      await api('/api/compras/fornecedores', {
        method: 'POST',
        body: JSON.stringify({
          nome, cnpj: $('#fCnpj').value || null, telefone: $('#fTelefone').value || null, email: $('#fEmail').value || null
        }),
      });
      ['#fNome', '#fCnpj', '#fTelefone', '#fEmail'].forEach((s) => { $(s).value = ''; });
      msgEl.textContent = 'Fornecedor adicionado.'; msgEl.className = 'supr-msg ok';
      await carregarFornecedores();
    } catch (e) {
      msgEl.textContent = msgErro(e); msgEl.className = 'supr-msg erro';
    }
  }

  // ---------- comparativo ----------
  async function carregarComparativo() {
    if (!estado.orcamentoId) { estado.comparativo = null; renderComparativo(); return; }
    estado.comparativo = await api('/api/compras/comparativo?orcamentoId=' + encodeURIComponent(estado.orcamentoId));
    renderComparativo();
  }

  function renderComparativo() {
    const corpo = $('#corpoComparativo');
    const resumo = $('#resumoComparativo');
    if (!estado.comparativo) { corpo.innerHTML = ''; resumo.innerHTML = ''; return; }

    const comprometidoPorItem = {};
    (estado.comparativo.comprometido || []).forEach((r) => { comprometidoPorItem[r.itemOrcamentoId] = r.valor; });
    const executadoPorItem = {};
    (estado.comparativo.executado || []).forEach((r) => { executadoPorItem[r.itemOrcamentoId] = r.valor; });

    const itensComMovimento = estado.servicosFlat.filter((s) =>
      comprometidoPorItem[s.id] != null || executadoPorItem[s.id] != null
    );

    if (!itensComMovimento.length) {
      corpo.innerHTML = '<tr><td colspan="5" class="sem-servicos">Nenhuma compra iniciada ainda para este orçamento.</td></tr>';
      resumo.innerHTML = '';
      return;
    }

    let totalOrcado = 0, totalComprometido = 0, totalExecutado = 0;
    corpo.innerHTML = itensComMovimento.map((s) => {
      const comprometido = comprometidoPorItem[s.id] || 0;
      const executado = executadoPorItem[s.id] || 0;
      const saldo = s.valorOrcado - comprometido - executado;
      totalOrcado += s.valorOrcado; totalComprometido += comprometido; totalExecutado += executado;
      return `<tr>
        <td><strong>${esc(s.nome)}</strong><br><span style="color:var(--suave);font-size:11px">${esc(s.caminho)}</span></td>
        <td class="col-num">${fmtBRL(s.valorOrcado)}</td>
        <td class="col-num">${fmtBRL(comprometido)}</td>
        <td class="col-num">${fmtBRL(executado)}</td>
        <td class="col-num" style="color:${saldo < 0 ? 'var(--vermelho)' : 'var(--verde)'};font-weight:700">${fmtBRL(saldo)}</td>
      </tr>`;
    }).join('');

    resumo.innerHTML = `
      <div class="resumo-card"><span>Orçado (itens em compra)</span><strong>${fmtBRL(totalOrcado)}</strong></div>
      <div class="resumo-card"><span>Comprometido (pedidos em aberto)</span><strong>${fmtBRL(totalComprometido)}</strong></div>
      <div class="resumo-card"><span>Executado (notas lançadas)</span><strong>${fmtBRL(totalExecutado)}</strong></div>
      <div class="resumo-card"><span>Saldo</span><strong class="total-grande">${fmtBRL(totalOrcado - totalComprometido - totalExecutado)}</strong></div>
    `;
  }

  document.addEventListener('DOMContentLoaded', init);
})();
