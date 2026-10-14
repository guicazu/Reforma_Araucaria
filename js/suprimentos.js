/* ============================================================
   suprimentos.js — Módulo de Suprimentos
   Requisições → Cotação → Pedidos → Fornecedores → Orçado × Exec.
   Integra com functions/api/compras/* (Cloudflare + D1).
   Carregar DEPOIS de app.js (usa esc/uid/qtdServico/fmtBRL quando existem).
   ============================================================ */
'use strict';

/* ---------- helpers seguros (fallback se app.js não expor) ---------- */
const $s = (s, c = document) => c.querySelector(s);
const $$s = (s, c = document) => [...c.querySelectorAll(s)];
const escS = (typeof esc === 'function') ? esc
  : (x => String(x ?? '').replace(/[&<>"']/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m])));
const fmtM = (typeof fmtBRL !== 'undefined' && fmtBRL.format) ? fmtBRL
  : new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
const fmtQ = (typeof fmtNum !== 'undefined' && fmtNum.format) ? fmtNum
  : new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 2 });

function suprEl(id) { return document.getElementById(id); }
function suprMsg(id, texto, ok) {
  const el = suprEl(id);
  if (!el) return;
  el.textContent = texto || '';
  el.className = 'supr-msg' + (ok ? ' ok' : (texto ? ' erro' : ''));
}

/* ---------- sessão / permissão ---------- */
let suprSomenteLeitura = false;
async function suprApi(path, opcoes = {}) {
  const res = await fetch(path, {
    headers: { 'Content-Type': 'application/json' },
    credentials: 'same-origin',
    ...opcoes,
  });
  if (res.status === 401) { location.href = '/login'; throw new Error('nao_autenticado'); }
  if (res.status === 403) {
    suprSomenteLeitura = true;
    const b = suprEl('suprBannerSomenteLeitura');
    if (b) b.classList.remove('hidden');
    return null;
  }
  const dados = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(dados.erro || ('erro ' + res.status));
  return dados;
}

/* ---------- estado ---------- */
const suprEstado = {
  abaAtiva: null,
  carrinho: [],          // itens selecionados na nova requisição
  requisicoes: [],
  cotacoes: [],
  fornecedores: [],
  pedidos: [],
  cotacaoAtual: null,
  pedidoAtual: null,     // pedido do modal de recebimento
};

/* ---------- orçamentos (obra = orçamento) ---------- */
function suprOrcamentos() {
  try {
    if (typeof state !== 'undefined' && Array.isArray(state.orcamentos)) return state.orcamentos;
    const raw = localStorage.getItem('ibuild_orcamentos_v5');
    const s = raw ? JSON.parse(raw) : { orcamentos: [] };
    return Array.isArray(s.orcamentos) ? s.orcamentos : [];
  } catch (e) { return []; }
}
function suprPreencherOrcamentos() {
  const sel = suprEl('suprSelectOrcamento');
  if (!sel) return;
  sel.innerHTML = '<option value="">— Selecione o orçamento (obra) —</option>' +
    suprOrcamentos().map(o => `<option value="${o.id}">${escS(o.codigo || '')} — ${escS(o.nome)}</option>`).join('');
}

/* ---------- sub-abas ---------- */
function suprAtivarAba(aba) {
  suprEstado.abaAtiva = aba;
  $$s('.supr-tab').forEach(b => {
    const v = b.dataset.suprAba || b.dataset.aba;
    b.classList.toggle('ativa', v === aba);
  });
  const paineis = {
    requisicoes: 'suprPainelRequisicoes',
    cotacoes: 'suprPainelCotacoes',
    pedidos: 'suprPainelPedidos',
    fornecedores: 'suprPainelFornecedores',
    comparativo: 'suprPainelComparativo',
  };
  Object.entries(paineis).forEach(([k, id]) => {
    const p = suprEl(id);
    if (p) p.classList.toggle('hidden', k !== aba);
  });
  if (aba === 'requisicoes') suprRequisicoesLista();
  else if (aba === 'cotacoes') suprCotacoesLista();
  else if (aba === 'pedidos') suprPedidosLista();
  else if (aba === 'fornecedores') suprFornecedoresLista();
  else if (aba === 'comparativo') suprComparativoCarregar();
}

/* ============================================================
   REQUISIÇÕES
   ============================================================ */
async function suprRequisicoesLista() {
  const box = suprEl('suprListaRequisicoes');
  if (!box) return;
  suprEl('suprRequisicoesLista').classList.remove('hidden');
  suprEl('suprRequisicoesNova').classList.add('hidden');
  suprEl('suprRequisicoesRevisar').classList.add('hidden');
  const orcId = suprEl('suprSelectOrcamento').value;
  if (!orcId) { box.innerHTML = '<p class="supr-msg">Selecione o orçamento (obra) acima.</p>'; return; }
  box.innerHTML = '<p class="supr-msg">Carregando…</p>';
  const dados = await suprApi('/api/compras/requisicoes?orcamentoId=' + encodeURIComponent(orcId));
  if (!dados) return;
  suprEstado.requisicoes = dados.requisicoes || [];
  if (!suprEstado.requisicoes.length) {
    box.innerHTML = '<p class="supr-msg">Nenhuma requisição ainda. Clique em "+ Nova requisição".</p>';
    return;
  }
  box.innerHTML = suprEstado.requisicoes.map(r => `
    <div class="supr-card">
      <div class="supr-card-head">
        <strong>Req #${escS(r.codigo || r.id)}</strong>
        <span>${new Date(r.criadoEm || Date.now()).toLocaleDateString('pt-BR')} · ${escS(r.status || '')}</span>
      </div>
      <div class="supr-card-body">${escS(r.observacoes || '')}</div>
      <div class="supr-card-acoes">
        <button class="btn btn-sm btn-ghost" data-acao="cotar-req" data-id="${r.id}">Cotar</button>
      </div>
    </div>`).join('');
}

/* Itens do orçamento: todos os serviços da EAP (unidade → etapa → sub → serviço) */
function suprItensOrcamento() {
  const o = suprOrcamentos().find(x => x.id === suprEl('suprSelectOrcamento').value);
  if (!o) return [];
  const versao = Array.isArray(o.versoes) && o.versoes.length ? o.versoes[o.versoes.length - 1] : null;
  const unidades = versao ? versao.unidades : (Array.isArray(o.unidades) ? o.unidades : []);
  const itens = [];
  unidades.forEach((u, iu) => (u.etapas || []).forEach((e, ie) => (e.subEtapas || []).forEach((s, is) => (s.servicos || []).forEach((sv, isv) => {
    itens.push({
      servicoId: sv.id,
      codigo: `${iu + 1}.${ie + 1}.${is + 1}.${isv + 1}`,
      caminho: `${u.nome} → ${e.nome} → ${s.nome}`,
      descricao: sv.nome,
      unidade: sv.unidadeMedida || '',
      quantidadeOrcada: (typeof qtdServico === 'function') ? (Number(qtdServico(sv)) || 0) : (Number(sv.qtdManual) || 0),
    });
  }))));
  return itens;
}

function suprRenderArvore() {
  const wrap = suprEl('suprArvoreItens');
  if (!wrap) return;
  const filtro = (suprEl('suprFiltroItens') || {}).value || '';
  const f = filtro.toLowerCase();
  const list = suprItensOrcamento().filter(i =>
    !f || (i.descricao + ' ' + i.caminho + ' ' + i.codigo).toLowerCase().includes(f));
  wrap.innerHTML = list.length ? list.map(i => {
    const sel = suprEstado.carrinho.some(c => c.servicoId === i.servicoId);
    return `<label class="supr-item-linha">
      <input type="checkbox" data-servicoid="${i.servicoId}" ${sel ? 'checked' : ''}>
      <span class="supr-item-codigo">${escS(i.codigo)}</span>
      <span class="supr-item-txt"><strong>${escS(i.descricao)}</strong><small>${escS(i.caminho)}</small></span>
      <span class="supr-item-qtd">${escS(i.unidade)} · orçado ${fmtQ.format(i.quantidadeOrcada)}</span>
    </label>`;
  }).join('') : '<p class="supr-msg">Nenhum item encontrado.</p>';
  let btn = suprEl('suprBtnContinuarSelecao');
  if (!btn) {
    btn = document.createElement('button');
    btn.id = 'suprBtnContinuarSelecao';
    btn.className = 'btn btn-primary';
    btn.style.marginTop = '12px';
    btn.textContent = 'Continuar (0 itens)';
    wrap.parentNode.appendChild(btn);
  }
  btn.textContent = 'Continuar (' + suprEstado.carrinho.length + ' itens)';
}

function suprNovaRequisicao() {
  suprEl('suprRequisicoesLista').classList.add('hidden');
  suprEl('suprRequisicoesNova').classList.remove('hidden');
  suprEl('suprRequisicoesRevisar').classList.add('hidden');
  suprEstado.carrinho = [];
  suprRenderArvore();
}

function suprRevisarSelecao() {
  if (!suprEstado.carrinho.length) { alert('Selecione ao menos um item.'); return; }
  suprEl('suprRequisicoesNova').classList.add('hidden');
  suprEl('suprRequisicoesRevisar').classList.remove('hidden');
  suprEl('suprCarrinhoLista').innerHTML = suprEstado.carrinho.map((c, idx) => `
    <div class="supr-carrinho-linha">
      <input type="number" step="any" min="0" class="supr-carrinho-qtd" data-idx="${idx}" value="${c.quantidade}">
      <span>${escS(c.descricao)} <small>${escS(c.unidade)} · orçado: ${fmtQ.format(c.quantidadeOrcada)}</small></span>
    </div>`).join('');
}

async function suprSalvarRequisicao() {
  const btn = suprEl('suprBtnSalvarRequisicao');
  btn.disabled = true;
  const orcamentoId = suprEl('suprSelectOrcamento').value;
  const observacoes = suprEl('suprReqObservacoes').value;
  const itens = suprEstado.carrinho.map(c => ({
    servicoId: c.servicoId,
    descricao: c.descricao,
    unidade: c.unidade,
    quantidade: Number(c.quantidade) || 0,
    quantidadeOrcada: c.quantidadeOrcada,
  }));
  try {
    const dados = await suprApi('/api/compras/requisicoes',
      { method: 'POST', body: JSON.stringify({ orcamentoId, observacoes, itens }) });
    if (!dados) return;
    suprMsg('suprMsgRequisicao', 'Requisição salva com sucesso ✅', true);
    setTimeout(() => { suprEstado.carrinho = []; suprEl('suprReqObservacoes').value = ''; suprAtivarAba('requisicoes'); }, 800);
  } catch (e) { suprMsg('suprMsgRequisicao', e.message); }
  finally { btn.disabled = false; }
}

/* ============================================================
   FORNECEDORES (cadastro completo)
   ============================================================ */
async function suprCarregarFornecedores() {
  const dados = await suprApi('/api/compras/fornecedores');
  if (!dados) return false;
  suprEstado.fornecedores = dados.fornecedores || [];
  return true;
}
async function suprFornecedoresLista() {
  const wrap = suprEl('suprListaFornecedores');
  if (!wrap) return;
  if (!(await suprCarregarFornecedores())) return;
  if (!suprEstado.fornecedores.length) {
    wrap.innerHTML = '<p class="supr-msg">Nenhum fornecedor cadastrado.</p>';
    return;
  }
  wrap.innerHTML = `<table class="tabela"><thead><tr><th>Nome</th><th>CNPJ</th><th>Telefone</th><th>E-mail</th><th></th></tr></thead><tbody>` +
    suprEstado.fornecedores.map(f => `<tr>
      <td>${escS(f.nome)}</td><td>${escS(f.cnpj || '—')}</td><td>${escS(f.telefone || '—')}</td><td>${escS(f.email || '—')}</td>
      <td><button class="btn-icon btn-danger" data-acao="del-forn" data-id="${f.id}" title="Excluir">🗑</button></td>
    </tr>`).join('') + '</tbody></table>';
}
async function suprSalvarFornecedor() {
  const payload = {
    nome: suprEl('suprFNome').value.trim(),
    cnpj: suprEl('suprFCnpj').value.trim(),
    telefone: suprEl('suprFTelefone').value.trim(),
    email: suprEl('suprFEmail').value.trim(),
  };
  if (!payload.nome) { suprMsg('suprMsgFornecedor', 'Informe o nome do fornecedor.'); return; }
  const dados = await suprApi('/api/compras/fornecedores', { method: 'POST', body: JSON.stringify(payload) });
  if (!dados) return;
  ['suprFNome', 'suprFCnpj', 'suprFTelefone', 'suprFEmail'].forEach(id => suprEl(id).value = '');
  suprMsg('suprMsgFornecedor', 'Fornecedor salvo ✅', true);
  suprFornecedoresLista();
}

/* ============================================================
   COTAÇÕES (montar mapa a partir de 1+ requisições, itens parciais)
   ============================================================ */
async function suprCotacoesLista() {
  const wrap = suprEl('suprListaCotacoes');
  if (!wrap) return;
  suprEl('suprCotacoesLista').classList.remove('hidden');
  suprEl('suprCotacoesNova').classList.add('hidden');
  suprEl('suprMapaCotacao').classList.add('hidden');
  const orcId = suprEl('suprSelectOrcamento').value;
  if (!orcId) { wrap.innerHTML = '<p class="supr-msg">Selecione o orçamento acima.</p>'; return; }
  wrap.innerHTML = '<p class="supr-msg">Carregando…</p>';
  const dados = await suprApi('/api/compras/cotacoes?orcamentoId=' + encodeURIComponent(orcId));
  if (!dados) return;
  suprEstado.cotacoes = dados.cotacoes || [];
  if (!suprEstado.cotacoes.length) { wrap.innerHTML = '<p class="supr-msg">Nenhuma cotação ainda.</p>'; return; }
  wrap.innerHTML = suprEstado.cotacoes.map(c => `
    <div class="supr-card">
      <div class="supr-card-head">
        <strong>Cot. ${escS(c.codigo || c.id)}</strong>
        <span>${escS(c.status || '')} · ${new Date(c.criadoEm || Date.now()).toLocaleDateString('pt-BR')}</span>
      </div>
      <div class="supr-card-acoes">
        <button class="btn btn-sm btn-primary" data-acao="abrir-mapa" data-id="${c.id}">Abrir mapa</button>
      </div>
    </div>`).join('');
}

async function suprNovaCotacao() {
  suprEl('suprCotacoesLista').classList.add('hidden');
  suprEl('suprCotacoesNova').classList.remove('hidden');
  suprEl('suprMapaCotacao').classList.add('hidden');
  suprMsg('suprMsgNovaCotacao', '');
  const orcId = suprEl('suprSelectOrcamento').value;
  const dados = await suprApi('/api/compras/requisicoes?orcamentoId=' + encodeURIComponent(orcId));
  if (!dados) return;
  const itens = (dados.requisicoes || []).flatMap(r =>
    (r.itens || []).map(it => ({ ...it, reqId: r.id, reqCodigo: r.codigo || r.id })));
  suprEl('suprItensParaCotar').innerHTML = itens.length ? itens.map(it => `
    <label class="supr-item-linha">
      <input type="checkbox" data-itemreq="${it.id}" ${it.status === 'em_cotacao' ? 'disabled title="Já está em cotação"' : ''}>
      <span class="supr-item-txt"><strong>${escS(it.descricao)}</strong>
        <small>Req ${escS(it.reqCodigo)} · ${escS(it.status || '')}</small></span>
      <span class="supr-item-qtd">
        <input type="number" step="any" min="0" class="supr-qtd-cotar" data-itemreq="${it.id}" value="${it.quantidade ?? 0}" style="width:80px">
      </span>
    </label>`).join('') : '<p class="supr-msg">Nenhum item de requisição disponível para cotar.</p>';
  await suprCarregarFornecedores();
  suprEl('suprFornecedoresParaCotar').innerHTML =
    (suprEstado.fornecedores.length ? suprEstado.fornecedores.map(f => `
      <label class="supr-item-linha">
        <input type="checkbox" data-fornid="${f.id}" checked>
        <span class="supr-item-txt"><strong>${escS(f.nome)}</strong><small>${escS(f.email || '')}</small></span>
      </label>`).join('') : '<p class="supr-msg">Nenhum fornecedor cadastrado — cadastre na aba Fornecedores.</p>');
}

async function suprCriarMapa() {
  const itens = $$s('#suprItensParaCotar input[type=checkbox]:checked').map(i => ({
    itemRequisicaoId: i.dataset.itemreq,
    quantidade: Number(i.closest('label').querySelector('.supr-qtd-cotar').value) || 0,
  }));
  const forn = $$s('#suprFornecedoresParaCotar input[type=checkbox]:checked').map(i => ({ fornecedorId: i.dataset.fornid }));
  if (!itens.length || !forn.length) { suprMsg('suprMsgNovaCotacao', 'Selecione itens e ao menos um fornecedor.'); return; }
  const dados = await suprApi('/api/compras/cotacoes', {
    method: 'POST',
    body: JSON.stringify({ orcamentoId: suprEl('suprSelectOrcamento').value, itens, fornecedores: forn }),
  });
  if (!dados) return;
  suprMsg('suprMsgNovaCotacao', 'Cotação criada ✅ abrindo o mapa…', true);
  setTimeout(() => suprAbrirMapa(dados.id), 700);
}

/* ---- Mapa de comparação (itens × fornecedores) ---- */
async function suprAbrirMapa(id) {
  suprEl('suprCotacoesLista').classList.add('hidden');
  suprEl('suprCotacoesNova').classList.add('hidden');
  suprEl('suprMapaCotacao').classList.remove('hidden');
  const wrap = suprEl('suprMapaWrap');
  wrap.innerHTML = '<p class="supr-msg">Carregando mapa…</p>';
  const dados = await suprApi('/api/compras/cotacoes/' + id);
  if (!dados) return;
  const c = dados.cotacao || dados;
  suprEstado.cotacaoAtual = c;
  const fornecedores = c.fornecedores || [];
  const itens = c.itens || [];
  let html = `<div class="cmp-head">
    <b>Mapa de comparação</b>
    <span>Rodada: <input id="suprRodada" type="number" min="1" value="${c.rodada || 1}" style="width:64px;padding:4px"></span>
  </div>`;
  html += '<div class="table-wrap"><table class="cmp-tabela"><thead><tr><th>Item</th>';
  fornecedores.forEach(f => { html += `<th>${escS(f.nome || f.fornecedorNome || '')}<br><small>${escS(f.condicaoPagamento || '')}</small></th><th>✔ comprar</th>`; });
  html += '</tr></thead><tbody>';
  itens.forEach(it => {
    const qtd = it.quantidade ?? 0;
    html += `<tr><td>${escS(it.descricao)} <small>${fmtQ.format(qtd)}</small></td>`;
    fornecedores.forEach(f => {
      const val = (f.precos && f.precos[it.id]) || (it.precos && it.precos[f.id]) || '';
      const venc = !!(c.vencedores && c.vencedores[it.id] && c.vencedores[it.id].fornecedorId === f.id);
      html += `<td><input class="supr-preco" data-item="${it.id}" data-forn="${f.id}" value="${escS(val)}" placeholder="R$"></td>`;
      html += `<td><input type="checkbox" class="supr-venc" data-item="${it.id}" data-forn="${f.id}" ${venc ? 'checked' : ''}></td>`;
    });
    html += '</tr>';
  });
  html += '</tbody></table></div>';
  html += `<div class="supr-form-actions" style="margin-top:12px;gap:8px">
    <button class="btn" id="suprBtnSalvarPrecos">💾 Salvar valores</button>
    <button class="btn btn-primary" id="suprBtnFinalizarCotacao">Finalizar → gerar pedidos</button>
  </div>`;
  wrap.innerHTML = html;
  wrap.addEventListener('change', ev => {
    const v = ev.target.closest('.supr-venc');
    if (!v || !v.checked) return;
    $$s('.supr-venc', wrap).forEach(x => {
      if (x !== v && x.dataset.item === v.dataset.item) x.checked = false;
    });
  });
  suprEl('suprBtnSalvarPrecos').addEventListener('click', suprSalvarPrecos);
  suprEl('suprBtnFinalizarCotacao').addEventListener('click', suprFinalizarCotacao);
}

async function suprSalvarPrecos() {
  const c = suprEstado.cotacaoAtual;
  const precos = $$s('.supr-preco').map(inp => ({
    itemRequisicaoId: inp.dataset.item,
    fornecedorId: inp.dataset.forn,
    valor: Number(String(inp.value).replace(/[^\d,.-]/g, '').replace(',', '.')) || 0,
  }));
  const rodada = Number(suprEl('suprRodada')?.value) || 1;
  const dados = await suprApi('/api/compras/cotacoes/' + c.id + '/precos',
    { method: 'POST', body: JSON.stringify({ precos, rodada }) });
  if (!dados) return;
  alert('Valores salvos ✅');
}

async function suprFinalizarCotacao() {
  const c = suprEstado.cotacaoAtual;
  const vencedores = $$s('.supr-venc:checked').map(v => ({
    itemRequisicaoId: v.dataset.item,
    fornecedorId: v.dataset.forn,
    quantidade: null, // null = item inteiro; preencha p/ compra parcial
  }));
  if (!vencedores.length) { alert('Marque ao menos um item como comprado (✔).'); return; }
  if (!confirm('Finalizar a cotação e gerar os pedidos de compra dos itens marcados?')) return;
  const dados = await suprApi('/api/compras/cotacoes/' + c.id + '/finalizar',
    { method: 'POST', body: JSON.stringify({ vencedores }) });
  if (!dados) return;
  alert('Pedidos de compra gerados ✅');
  suprAtivarAba('pedidos');
}

/* ============================================================
   PEDIDOS (lista, PDF, envio por e-mail, recebimento)
   ============================================================ */
async function suprPedidosLista() {
  const wrap = suprEl('suprListaPedidos');
  if (!wrap) return;
  const orcId = suprEl('suprSelectOrcamento').value;
  if (!orcId) { wrap.innerHTML = '<p class="supr-msg">Selecione o orçamento acima.</p>'; return; }
  wrap.innerHTML = '<p class="supr-msg">Carregando…</p>';
  const dados = await suprApi('/api/compras/pedidos?orcamentoId=' + encodeURIComponent(orcId));
  if (!dados) return;
  suprEstado.pedidos = dados.pedidos || [];
  if (!suprEstado.pedidos.length) { wrap.innerHTML = '<p class="supr-msg">Nenhum pedido de compra gerado.</p>'; return; }
  wrap.innerHTML = suprEstado.pedidos.map(p => `
    <div class="supr-card">
      <div class="supr-card-head">
        <strong>Pedido ${escS(p.codigo || p.id)}</strong>
        <span>${escS(p.status || '')} · ${escS(p.fornecedorNome || '')} · ${fmtM.format(Number(p.total || 0))}</span>
      </div>
      <div class="supr-card-acoes">
        <button class="btn btn-sm" data-acao="pdf-pedido" data-id="${p.id}">📄 PDF</button>
        <button class="btn btn-sm btn-primary" data-acao="enviar-pedido" data-id="${p.id}">✉ Enviar por e-mail</button>
        <button class="btn btn-sm" data-acao="receber-pedido" data-id="${p.id}">📦 Lançar recebimento</button>
      </div>
    </div>`).join('');
}

function suprPdfPedido(p) {
  const itensHtml = (p.itens || []).map(i =>
    `<tr><td>${escS(i.descricao)}</td><td style="text-align:center">${escS(i.unidade || '')}</td>
     <td style="text-align:right">${fmtQ.format(i.quantidade)}</td><td style="text-align:right">${fmtM.format(i.valorUnitario || 0)}</td>
     <td style="text-align:right">${fmtM.format(i.total || 0)}</td></tr>`).join('');
  const win = window.open('', '_blank');
  if (!win) { alert('Permita pop-ups para gerar o PDF.'); return; }
  win.document.write(`<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8"><title>Pedido ${escS(p.codigo || p.id)}</title>
  <style>body{font-family:Arial,sans-serif;margin:30px;font-size:13px}h1{font-size:18px}table{width:100%;border-collapse:collapse;margin-top:14px}
  th,td{border:1px solid #999;padding:6px 8px;text-align:left}th{background:#e9e4d6}.tot{font-weight:800}</style></head>
  <body><h1>Pedido de Compra ${escS(p.codigo || p.id)}</h1>
  <p><b>Fornecedor:</b> ${escS(p.fornecedorNome || '')} ${p.fornecedorCnpj ? '· CNPJ ' + escS(p.fornecedorCnpj) : ''}<br>
  <b>E-mail:</b> ${escS(p.fornecedorEmail || '')}<br><b>Status:</b> ${escS(p.status || '')}</p>
  <table><thead><tr><th>Item</th><th>Un.</th><th>Qtd</th><th>Valor unit.</th><th>Total</th></tr></thead>
  <tbody>${itensHtml}</tbody></table>
  <p class="tot">Total: ${fmtM.format(Number(p.total || 0))}</p>
  <p style="margin-top:26px;font-size:11px;color:#555">Gerado por iBuild — Cazú Projetos e Construções</p></body></html>`);
  win.document.close(); win.focus(); win.print();
}

async function suprEnviarPedido(id) {
  if (!confirm('Enviar este pedido por e-mail para o fornecedor cadastrado?')) return;
  const dados = await suprApi('/api/compras/pedidos/' + id + '/enviar', { method: 'POST' });
  if (!dados) return;
  alert('Pedido enviado ✅' + (dados.linkConfirmacao ? '\nLink de confirmação: ' + dados.linkConfirmacao : ''));
  suprPedidosLista();
}

/* ---- Modal de recebimento / baixa de nota ---- */
function suprAbrirRecebimento(id) {
  const p = suprEstado.pedidos.find(x => x.id === id);
  if (!p) return;
  suprEstado.pedidoAtual = p;
  suprEl('suprModalRecPedidoInfo').textContent = `Pedido ${p.codigo || p.id} — ${p.fornecedorNome || ''}`;
  suprEl('suprRecItensWrap').innerHTML = '<h4 style="margin:10px 0 6px">Itens recebidos</h4>' +
    (p.itens || []).map(i => `
      <label class="supr-item-linha">
        <input type="checkbox" data-itemid="${i.id}" checked>
        <span class="supr-item-txt"><strong>${escS(i.descricao)}</strong>
          <small>pedido: ${fmtQ.format(i.quantidade)}</small></span>
        <span class="supr-item-qtd"><input type="number" step="any" min="0" class="supr-rec-qtd"
          data-itemid="${i.id}" value="${i.quantidade}" style="width:80px"></span>
      </label>`).join('');
  suprEl('suprRecData').value = new Date().toISOString().slice(0, 10);
  suprMsg('suprMsgRecebimento', '');
  suprEl('suprModalRecebimento').showModal();
}
async function suprConfirmarRecebimento() {
  const p = suprEstado.pedidoAtual;
  const itens = $$s('#suprRecItensWrap input[type=checkbox]:checked').map(i => ({
    pedidoItemId: i.dataset.itemid,
    quantidade: Number(i.closest('label').querySelector('.supr-rec-qtd').value) || 0,
  }));
  if (!itens.length) { suprMsg('suprMsgRecebimento', 'Marque ao menos um item recebido.'); return; }
  const payload = {
    pedidoId: p.id,
    notaNumero: suprEl('suprRecNotaNumero').value.trim(),
    chaveAcesso: suprEl('suprRecNotaChave').value.trim(),
    data: suprEl('suprRecData').value,
    valorTotal: Number(suprEl('suprRecValor').value) || 0,
    itens,
    observacoes: suprEl('suprRecObservacoes').value,
  };
  const dados = await suprApi('/api/compras/recebimentos', { method: 'POST', body: JSON.stringify(payload) });
  if (!dados) return;
  suprMsg('suprMsgRecebimento', 'Recebimento lançado ✅', true);
  setTimeout(() => { suprEl('suprModalRecebimento').close(); suprPedidosLista(); }, 800);
}

/* ============================================================
   COMPARATIVO (Orçado × Comprometido × Executado)
   ============================================================ */
async function suprComparativoCarregar() {
  const orcId = suprEl('suprSelectOrcamento').value;
  if (!orcId) return;
  suprEl('suprResumoComparativo').innerHTML = '<p class="supr-msg">Carregando…</p>';
  suprEl('suprCorpoComparativo').innerHTML = '';
  const dados = await suprApi('/api/compras/comparativo?orcamentoId=' + encodeURIComponent(orcId));
  if (!dados) return;
  const resumo = dados.resumo || {};
  suprEl('suprResumoComparativo').innerHTML =
    `<div class="resumo-card"><span>Orçado</span><strong class="total-grande">${fmtM.format(resumo.orcado || 0)}</strong></div>
     <div class="resumo-card"><span>Comprometido</span><strong>${fmtM.format(resumo.comprometido || 0)}</strong></div>
     <div class="resumo-card"><span>Executado (recebido)</span><strong>${fmtM.format(resumo.executado || 0)}</strong></div>
     <div class="resumo-card"><span>Saldo</span><strong>${fmtM.format(resumo.saldo || 0)}</strong></div>`;
  suprEl('suprCorpoComparativo').innerHTML = (dados.itens || []).map(i => `
    <tr><td>${escS(i.descricao)}</td>
      <td class="col-num">${fmtM.format(i.orcado || 0)}</td>
      <td class="col-num">${fmtM.format(i.comprometido || 0)}</td>
      <td class="col-num">${fmtM.format(i.executado || 0)}</td>
      <td class="col-num"><b>${fmtM.format(i.saldo || 0)}</b></td></tr>`).join('');
}

/* ============================================================
   EVENTOS
   ============================================================ */
document.addEventListener('DOMContentLoaded', () => {
  suprPreencherOrcamentos();

  const sel = suprEl('suprSelectOrcamento');
  if (sel) sel.addEventListener('change', () => {
    suprEstado.carrinho = [];
    if (suprEstado.abaAtiva) suprAtivarAba(suprEstado.abaAtiva);
  });

  $$s('.supr-tabs').forEach(tabs => tabs.addEventListener('click', ev => {
    const b = ev.target.closest('.supr-tab');
    if (b) suprAtivarAba(b.dataset.suprAba || b.dataset.aba);
  }));

  const view = suprEl('viewSuprimentos');
  if (view) {
    new MutationObserver(() => {
      if (!view.classList.contains('hidden')) {
        suprPreencherOrcamentos();
        if (!suprEstado.abaAtiva) suprAtivarAba('requisicoes');
      }
    }).observe(view, { attributes: true, attributeFilter: ['class'] });
  }

  const bNova = suprEl('suprBtnNovaRequisicao');
  if (bNova) bNova.addEventListener('click', suprNovaRequisicao);
  const bVoltar = suprEl('suprBtnVoltarListaReq');
  if (bVoltar) bVoltar.addEventListener('click', () => suprAtivarAba('requisicoes'));
  const bVoltarSel = suprEl('suprBtnVoltarSelecao');
  if (bVoltarSel) bVoltarSel.addEventListener('click', suprNovaRequisicao);

  const filtro = suprEl('suprFiltroItens');
  if (filtro) filtro.addEventListener('input', suprRenderArvore);
  const arvore = suprEl('suprArvoreItens');
  if (arvore) arvore.addEventListener('change', ev => {
    const cb = ev.target.closest('input[data-servicoid]');
    if (!cb) return;
    const id = cb.dataset.servicoid;
    const item = suprItensOrcamento().find(i => i.servicoId === id);
    if (!item) return;
    if (cb.checked) suprEstado.carrinho.push({ ...item, quantidade: item.quantidadeOrcada });
    else suprEstado.carrinho = suprEstado.carrinho.filter(c => c.servicoId !== id);
    suprRenderArvore();
  });
  document.addEventListener('click', ev => {
    const b = ev.target.closest('#suprBtnContinuarSelecao');
    if (b) suprRevisarSelecao();
  });

  const carrinho = suprEl('suprCarrinhoLista');
  if (carrinho) carrinho.addEventListener('input', ev => {
    const inp = ev.target.closest('.supr-carrinho-qtd');
    if (!inp) return;
    suprEstado.carrinho[Number(inp.dataset.idx)].quantidade = Number(inp.value) || 0;
  });

  const bSalvar = suprEl('suprBtnSalvarRequisicao');
  if (bSalvar) bSalvar.addEventListener('click', suprSalvarRequisicao);

  const bForn = suprEl('suprBtnSalvarFornecedor');
  if (bForn) bForn.addEventListener('click', suprSalvarFornecedor);

  const bNovaCot = suprEl('suprBtnNovaCotacao');
  if (bNovaCot) bNovaCot.addEventListener('click', suprNovaCotacao);
  const bCriarMapa = suprEl('suprBtnCriarMapa');
  if (bCriarMapa) bCriarMapa.addEventListener('click', suprCriarMapa);
  const bVoltarCot = suprEl('suprBtnVoltarListaCot');
  if (bVoltarCot) bVoltarCot.addEventListener('click', () => suprAtivarAba('cotacoes'));
  const bVoltarCot2 = suprEl('suprBtnVoltarListaCot2');
  if (bVoltarCot2) bVoltarCot2.addEventListener('click', () => suprAtivarAba('cotacoes'));

  const bCancelRec = suprEl('suprBtnCancelarRecebimento');
  if (bCancelRec) bCancelRec.addEventListener('click', () => suprEl('suprModalRecebimento').close());
  const bConfRec = suprEl('suprBtnConfirmarRecebimento');
  if (bConfRec) bConfRec.addEventListener('click', suprConfirmarRecebimento);

  document.addEventListener('click', async ev => {
    const b = ev.target.closest('[data-acao]');
    if (!b) return;
    switch (b.dataset.acao) {
      case 'cotar-req':
        suprAtivarAba('cotacoes');
        break;
      case 'abrir-mapa': suprAbrirMapa(b.dataset.id); break;
      case 'del-forn':
        if (confirm('Excluir este fornecedor?')) {
          await suprApi('/api/compras/fornecedores/' + b.dataset.id, { method: 'DELETE' }).catch(() => null);
          suprFornecedoresLista();
        }
        break;
      case 'pdf-pedido': {
        const p = suprEstado.pedidos.find(x => x.id === b.dataset.id);
        if (p) suprPdfPedido(p);
        break;
      }
      case 'enviar-pedido': suprEnviarPedido(b.dataset.id); break;
      case 'receber-pedido': suprAbrirRecebimento(b.dataset.id); break;
    }
  });
});