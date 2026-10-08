'use strict';

/* ============================================================
   iBuild Obras — Tela de Orçamento (EAP 4 níveis + memória de cálculo)
   Dados salvos no navegador (localStorage) + backup JSON
   ============================================================ */

const DB_KEY = 'ibuild_orcamentos_v1';
const $ = (sel, ctx = document) => ctx.querySelector(sel);

const fmtBRL = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
const fmtNum = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 2 });

/* ---------- utilidades ---------- */

function uid() {
  if (window.crypto && crypto.randomUUID) return crypto.randomUUID();
  return 'id-' + Date.now() + '-' + Math.random().toString(36).slice(2, 10);
}

function escapeHtml(str) {
  return String(str ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

/* Aceita "12", "12,5" (vírgula decimal BR) e "1.234,5".
   Se houver vírgula: ponto vira separador de milhar.
   Se não houver vírgula e houver +1 ponto: pontos são milhar. */
function parseNum(v) {
  if (v == null || String(v).trim() === '') return null;
  let s = String(v).trim();
  if (s.includes(',')) {
    s = s.replace(/\./g, '').replace(',', '.');
  } else {
    const dots = (s.match(/\./g) || []).length;
    if (dots > 1) s = s.replace(/\./g, '');
  }
  const n = Number(s);
  return isNaN(n) ? null : n;
}

/* ---------- estado ---------- */

function estadoInicial() {
  return { orcamentos: [], ativoId: null, expandidos: {} };
}

function carregarEstado() {
  try {
    const raw = localStorage.getItem(DB_KEY);
    if (!raw) return estadoInicial();
    const s = JSON.parse(raw);
    return {
      orcamentos: Array.isArray(s.orcamentos) ? s.orcamentos : [],
      ativoId: s.ativoId || null,
      expandidos: s.expandidos || {}
    };
  } catch (e) {
    console.error('Falha ao ler dados locais:', e);
    return estadoInicial();
  }
}

const state = carregarEstado();

function salvar() {
  localStorage.setItem(DB_KEY, JSON.stringify(state));
}

/* ---------- seletores ---------- */

function orcamentoAtivo() {
  return state.orcamentos.find(o => o.id === state.ativoId) || null;
}

function servicoPorId(o, id) {
  return (o && o.servicos) ? o.servicos.find(s => s.id === id) : null;
}

/* ---------- operações: orçamentos ---------- */

function criarOrcamento(nome) {
  const o = {
    id: uid(),
    nome: (nome || '').trim() || 'Orçamento sem nome',
    criadoEm: new Date().toISOString(),
    servicos: []
  };
  state.orcamentos.push(o);
  state.ativoId = o.id;
  salvar();
  renderTudo();
}

function renomearOrcamento() {
  const o = orcamentoAtivo();
  if (!o) return;
  const novo = prompt('Nome do orçamento:', o.nome);
  if (novo === null) return;
  o.nome = novo.trim() || o.nome;
  salvar();
  renderTudo();
}

function excluirOrcamento(id) {
  const o = state.orcamentos.find(x => x.id === id);
  if (!o) return;
  if (!confirm(`Excluir o orçamento "${o.nome}"? Esta ação não pode ser desfeita.`)) return;
  state.orcamentos = state.orcamentos.filter(x => x.id !== id);
  if (state.ativoId === id) state.ativoId = state.orcamentos.length ? state.orcamentos[0].id : null;
  salvar();
  renderTudo();
}

function ativarOrcamento(id) {
  if (!state.orcamentos.some(o => o.id === id)) return;
  state.ativoId = id;
  salvar();
  renderTudo();
}

/* ---------- operações: serviços ---------- */

function addServico(d) {
  const o = orcamentoAtivo();
  if (!o) return false;
  o.servicos.push({
    id: uid(),
    unidade: d.unidade.trim(),
    etapa: d.etapa.trim(),
    subEtapa: d.subEtapa.trim(),
    servico: d.servico.trim(),
    descricao: (d.descricao || '').trim(),
    qtdManual: parseNum(d.qtd),
    unidadeMedida: (d.unidadeMedida || 'm²').trim(),
    valorUnitario: parseNum(d.valor),
    memo: []
  });
  salvar();
  return true;
}

function atualizarServico(id, d) {
  const o = orcamentoAtivo();
  const s = servicoPorId(o, id);
  if (!s) return;
  s.unidade = d.unidade.trim();
  s.etapa = d.etapa.trim();
  s.subEtapa = d.subEtapa.trim();
  s.servico = d.servico.trim();
  s.descricao = (d.descricao || '').trim();
  s.qtdManual = parseNum(d.qtd);
  s.unidadeMedida = (d.unidadeMedida || 'm²').trim();
  s.valorUnitario = parseNum(d.valor);
  salvar();
  renderTudo();
}

function excluirServico(id) {
  const o = orcamentoAtivo();
  const s = servicoPorId(o, id);
  if (!s) return;
  if (!confirm(`Excluir o serviço "${s.servico}"?`)) return;
  o.servicos = o.servicos.filter(x => x.id !== id);
  salvar();
  renderTudo();
}

/* ---------- operações: memória de cálculo ---------- */

function addLinhaMemo(servicoId, descricao, qtd) {
  const o = orcamentoAtivo();
  const s = servicoPorId(o, servicoId);
  if (!s) return;
  s.memo.push({ id: uid(), descricao: (descricao || '').trim(), qtd: Number(qtd) || 0 });
  salvar();
  renderTudo();
}

function delLinhaMemo(servicoId, linhaId) {
  const o = orcamentoAtivo();
  const s = servicoPorId(o, servicoId);
  if (!s) return;
  s.memo = s.memo.filter(l => l.id !== linhaId);
  salvar();
  renderTudo();
}

function limparMemo(servicoId) {
  const o = orcamentoAtivo();
  const s = servicoPorId(o, servicoId);
  if (!s || !s.memo.length) return;
  if (!confirm('Apagar todas as linhas da memória de cálculo deste serviço?')) return;
  s.memo = [];
  salvar();
  renderTudo();
}

/* ---------- cálculos ---------- */

function qtdEfetiva(s) {
  if (Array.isArray(s.memo) && s.memo.length) {
    return s.memo.reduce((acc, l) => acc + (Number(l.qtd) || 0), 0);
  }
  return Number(s.qtdManual) || 0;
}

function totalServico(s) {
  return qtdEfetiva(s) * (Number(s.valorUnitario) || 0);
}

function totalOrcamento(o) {
  return (o.servicos || []).reduce((acc, s) => acc + totalServico(s), 0);
}

function subtotalSubEtapa(sb) {
  return sb.servicos.reduce((a, s) => a + totalServico(s), 0);
}
function subtotalEtapa(e) {
  return e.subEtapas.reduce((a, sb) => a + subtotalSubEtapa(sb), 0);
}
function subtotalUnidade(u) {
  return u.etapas.reduce((a, e) => a + subtotalEtapa(e), 0);
}

/* ---------- árvore da EAP (ordem de inserção) ---------- */

function arvoreEAP(o) {
  const unidades = [];
  for (const s of o.servicos) {
    let u = unidades.find(x => x.nome === s.unidade);
    if (!u) { u = { nome: s.unidade, etapas: [] }; unidades.push(u); }
    let e = u.etapas.find(x => x.nome === s.etapa);
    if (!e) { e = { nome: s.etapa, subEtapas: [] }; u.etapas.push(e); }
    let sb = e.subEtapas.find(x => x.nome === s.subEtapa);
    if (!sb) { sb = { nome: s.subEtapa, servicos: [] }; e.subEtapas.push(sb); }
    sb.servicos.push(s);
  }
  return unidades;
}

/* ---------- expansão de grupos ---------- */

function ehExpandido(o, key) {
  return state.expandidos[o.id + '|' + key] !== false;
}
function alternarExpandido(o, key) {
  const full = o.id + '|' + key;
  state.expandidos[full] = !ehExpandido(o, key);
  salvar();
  renderTudo();
}

/* ---------- renderização ---------- */

function renderTudo() {
  renderLista();
  renderConteudo();
}

function renderLista() {
  const ul = $('#listaOrcamentos');
  if (!state.orcamentos.length) {
    ul.innerHTML = '<li class="lista-vazia">Nenhum orçamento ainda.<br>Crie o primeiro com "+ Novo".</li>';
    return;
  }
  ul.innerHTML = state.orcamentos.map(o => {
    const data = new Date(o.criadoEm).toLocaleDateString('pt-BR');
    const ativo = o.id === state.ativoId ? ' ativo' : '';
    return `
      <li class="orcamento-item${ativo}" data-orcamento-id="${o.id}">
        <div class="oi-info">
          <strong>${escapeHtml(o.nome)}</strong>
          <span>${fmtBRL.format(totalOrcamento(o))} · ${data}</span>
        </div>
        <button class="btn-icon btn-danger" data-acao="del-orcamento" data-id="${o.id}" title="Excluir orçamento">🗑</button>
      </li>`;
  }).join('');
}

function renderConteudo() {
  const o = orcamentoAtivo();
  const vazio = $('#contentVazio');
  const orc = $('#contentOrcamento');
  if (!o) {
    vazio.classList.remove('hidden');
    orc.classList.add('hidden');
    return;
  }
  vazio.classList.add('hidden');
  orc.classList.remove('hidden');

  $('#orcamentoNome').textContent = o.nome;
  $('#orcamentoMeta').textContent =
    'Criado em ' + new Date(o.criadoEm).toLocaleDateString('pt-BR') +
    ' · ' + o.servicos.length + ' serviço(s)';
  $('#totalGeral').textContent = fmtBRL.format(totalOrcamento(o));
  $('#totalServicos').textContent = o.servicos.length;
  $('#totalRodape').textContent = fmtBRL.format(totalOrcamento(o));

  preencherDatalists();
  renderTabela(o);
}

function renderTabela(o) {
  const tbody = $('#corpoTabela');
  if (!o.servicos.length) {
    tbody.innerHTML = `<tr><td colspan="7" class="sem-servicos">
      Nenhum serviço ainda. Clique em <strong>+ Adicionar serviço</strong> para montar a EAP.
    </td></tr>`;
    return;
  }

  const arvore = arvoreEAP(o);
  let html = '';

  arvore.forEach((u, iu) => {
    const keyU = 'u|' + u.nome;
    const abertaU = ehExpandido(o, keyU);
    html += `<tr class="linha-grupo nivel-1" data-acao="toggle" data-key="${keyU}">
      <td class="col-eap">${iu + 1}</td>
      <td colspan="6">
        <span class="grup-toggle">${abertaU ? '▾' : '▸'}</span>
        <strong>${escapeHtml(u.nome)}</strong> <span style="color:var(--suave);font-weight:400">— Unidade construtiva</span>
        <span class="grup-total">${fmtBRL.format(subtotalUnidade(u))}</span>
      </td>
    </tr>`;

    u.etapas.forEach((e, ie) => {
      const keyE = 'e|' + u.nome + '::' + e.nome;
      const abertaE = ehExpandido(o, keyE) && abertaU;
      html += `<tr class="linha-grupo nivel-2 ${abertaU ? '' : 'oculto'}" data-acao="toggle" data-key="${keyE}">
        <td class="col-eap">${iu + 1}.${ie + 1}</td>
        <td colspan="6">
          <span class="grup-toggle">${abertaE ? '▾' : '▸'}</span>
          <strong>${escapeHtml(e.nome)}</strong> <span style="color:var(--suave);font-weight:400">— Etapa</span>
          <span class="grup-total">${fmtBRL.format(subtotalEtapa(e))}</span>
        </td>
      </tr>`;

      e.subEtapas.forEach((sb, isb) => {
        const keyS = 's|' + u.nome + '::' + e.nome + '::' + sb.nome;
        const abertaS = ehExpandido(o, keyS) && abertaU && abertaE;
        html += `<tr class="linha-grupo nivel-3 ${abertaU && abertaE ? '' : 'oculto'}" data-acao="toggle" data-key="${keyS}">
          <td class="col-eap">${iu + 1}.${ie + 1}.${isb + 1}</td>
          <td colspan="6">
            <span class="grup-toggle">${abertaS ? '▾' : '▸'}</span>
            <strong>${escapeHtml(sb.nome)}</strong> <span style="color:var(--suave);font-weight:400">— Sub etapa</span>
            <span class="grup-total">${fmtBRL.format(subtotalSubEtapa(sb))}</span>
          </td>
        </tr>`;

        sb.servicos.forEach((s, is) => {
          const visivel = abertaU && abertaE && abertaS;
          const codigo = `${iu + 1}.${ie + 1}.${isb + 1}.${is + 1}`;
          const memoAberta = state.expandidos['m|' + o.id + '|' + s.id] === true;
          html += servicoRow(o, s, codigo, visivel, memoAberta);
          if (memoAberta && visivel) html += memoRow(o, s);
        });
      });
    });
  });

  tbody.innerHTML = html;
}

function servicoRow(o, s, codigo, visivel, memoAberta) {
  const temMemo = s.memo && s.memo.length;
  const qtd = qtdEfetiva(s);
  return `
  <tr class="linha-servico ${visivel ? '' : 'oculto'}">
    <td class="col-eap codigo">${codigo}</td>
    <td>
      <div class="sv-desc">
        <strong>${escapeHtml(s.servico)}</strong>
        ${s.descricao ? `<span class="sv-extra">${escapeHtml(s.descricao)}</span>` : ''}
        <span class="sv-path">${escapeHtml(s.unidade)} / ${escapeHtml(s.etapa)} / ${escapeHtml(s.subEtapa)}</span>
        ${temMemo ? '<span class="tag-memo">qtd via memória de cálculo</span>' : ''}
      </div>
    </td>
    <td class="col-qtd">${fmtNum.format(qtd)}</td>
    <td class="col-un">${escapeHtml(s.unidadeMedida)}</td>
    <td class="col-valor">${s.valorUnitario == null ? '—' : fmtBRL.format(Number(s.valorUnitario))}</td>
    <td class="col-valor total">${fmtBRL.format(totalServico(s))}</td>
    <td class="col-acoes">
      <button class="btn-icon" data-acao="memo" data-sid="${s.id}" title="${temMemo && memoAberta ? 'Ocultar memória' : 'Abrir memória de cálculo'}">🧮</button>
      <button class="btn-icon" data-acao="edit" data-sid="${s.id}" title="Editar serviço">✏️</button>
      <button class="btn-icon btn-danger" data-acao="del" data-sid="${s.id}" title="Excluir serviço">🗑</button>
    </td>
  </tr>`;
}

function memoRow(o, s) {
  const linhas = (s.memo || []).map(l => `
    <tr>
      <td>${escapeHtml(l.descricao) || '—'}</td>
      <td class="col-qtd">${fmtNum.format(Number(l.qtd) || 0)}</td>
      <td class="col-un">${escapeHtml(s.unidadeMedida)}</td>
      <td class="col-acoes">
        <button class="btn-icon" data-acao="del-linha" data-sid="${s.id}" data-lid="${l.id}" title="Remover linha">✕</button>
      </td>
    </tr>`).join('');

  const soma = qtdEfetiva(s);

  return `
  <tr class="linha-memo">
    <td colspan="7">
      <div class="memo-box">
        <div class="memo-head">
          <h4>🧮 Memória de cálculo — ${escapeHtml(s.servico)}</h4>
          <span class="memo-soma">Soma: <strong>${fmtNum.format(soma)} ${escapeHtml(s.unidadeMedida)}</strong></span>
        </div>
        ${s.qtdManual != null ? `<p class="memo-aviso">ℹ️ Quantidade manual informada (${fmtNum.format(Number(s.qtdManual))}) é ignorada enquanto existirem linhas na memória.</p>` : ''}
        ${linhas ? `
          <table class="tabela-memo">
            <thead><tr><th>Descrição</th><th>Quantidade</th><th>Un.</th><th></th></tr></thead>
            <tbody>${linhas}</tbody>
          </table>` :
          '<p class="memo-aviso">Nenhuma linha ainda. Adicione abaixo — ex.: "Parede sala 1 — 12", "Parede sala 2 — 15". A soma vira a quantidade do serviço.</p>'}
        <div class="memo-add">
          <input type="text" id="memoDesc_${s.id}" placeholder="Descrição (ex.: Parede sala 1)" />
          <input type="text" id="memoQtd_${s.id}" class="col-qtd" inputmode="decimal" placeholder="Qtd (ex.: 12)" />
          <button class="btn btn-primary btn-sm" data-acao="add-linha" data-sid="${s.id}">+ Adicionar</button>
          ${linhas ? `<button class="btn btn-ghost btn-sm" data-acao="clear-memo" data-sid="${s.id}">Apagar memória</button>` : ''}
        </div>
      </div>
    </td>
  </tr>`;
}

/* ---------- datalists (autocompletar da EAP) ---------- */

function preencherDatalists() {
  const un = new Set(), et = new Set(), sub = new Set(), sv = new Set();
  for (const o of state.orcamentos) {
    for (const s of o.servicos) {
      un.add(s.unidade); et.add(s.etapa); sub.add(s.subEtapa); sv.add(s.servico);
    }
  }
  const setHtml = (id, set) => {
    $(id).innerHTML = [...set].map(v => `<option value="${escapeHtml(v)}"></option>`).join('');
  };
  setHtml('#dlUnidade', un);
  setHtml('#dlEtapa', et);
  setHtml('#dlSubEtapa', sub);
  setHtml('#dlServico', sv);
}

/* ---------- modal de serviço ---------- */

function abrirModal(servico) {
  const o = orcamentoAtivo();
  if (!o) return;
  $('#fServicoId').value = servico ? servico.id : '';
  $('#modalTitulo').textContent = servico ? 'Editar serviço' : 'Adicionar serviço';
  $('#fUnidade').value = servico ? servico.unidade : '';
  $('#fEtapa').value = servico ? servico.etapa : '';
  $('#fSubEtapa').value = servico ? servico.subEtapa : '';
  $('#fServico').value = servico ? servico.servico : '';
  $('#fDescricao').value = servico ? servico.descricao : '';
  $('#fQtd').value = servico && servico.qtdManual != null ? servico.qtdManual : '';
  $('#fUnidadeMedida').value = servico ? servico.unidadeMedida : 'm²';
  $('#fValor').value = servico && servico.valorUnitario != null ? servico.valorUnitario : '';
  $('#modalServico').showModal();
  $('#fUnidade').focus();
}

$('#formServico').addEventListener('submit', (ev) => {
  ev.preventDefault();
  const id = $('#fServicoId').value;
  const dados = {
    unidade: $('#fUnidade').value,
    etapa: $('#fEtapa').value,
    subEtapa: $('#fSubEtapa').value,
    servico: $('#fServico').value,
    descricao: $('#fDescricao').value,
    qtd: $('#fQtd').value,
    unidadeMedida: $('#fUnidadeMedida').value,
    valor: $('#fValor').value
  };
  if (!dados.unidade.trim() || !dados.etapa.trim() || !dados.subEtapa.trim() || !dados.servico.trim()) {
    alert('Preencha os 4 níveis da EAP: unidade construtiva, etapa, sub etapa e serviço.');
    return;
  }
  if (id) atualizarServico(id, dados);
  else addServico(dados);
  $('#modalServico').close();
});

/* ---------- backup (exportar / importar) ---------- */

function exportarBackup() {
  if (!state.orcamentos.length) {
    alert('Não há orçamentos para exportar.');
    return;
  }
  const blob = new Blob([JSON.stringify(state.orcamentos, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'ibuild-orcamentos-' + new Date().toISOString().slice(0, 10) + '.json';
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(a.href);
}

function importarBackup(ev) {
  const file = ev.target.files && ev.target.files[0];
  ev.target.value = '';
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const dados = JSON.parse(reader.result);
      if (!Array.isArray(dados) || !dados.every(o => o && Array.isArray(o.servicos))) {
        throw new Error('formato inválido');
      }
      if (!confirm(`Importar ${dados.length} orçamento(s)? Os dados atuais serão SUBSTITUÍDOS. Exporte um backup antes, se necessário.`)) return;
      state.orcamentos = dados;
      state.ativoId = dados.length ? dados[0].id : null;
      state.expandidos = {};
      salvar();
      renderTudo();
      alert('Backup importado com sucesso.');
    } catch (e) {
      alert('Arquivo inválido: não é um backup de orçamentos da iBuild Obras.');
    }
  };
  reader.readAsText(file);
}

/* ---------- exemplo pronto ---------- */

function carregarExemplo() {
  const o = {
    id: uid(),
    nome: 'Exemplo — Casa Steel Frame',
    criadoEm: new Date().toISOString(),
    servicos: [
      {
        id: uid(), unidade: 'Casa 01', etapa: 'Vedações', subEtapa: 'Paredes',
        servico: 'Alvenaria',
        descricao: 'Paredes internas em alvenaria (bloco cerâmico)',
        qtdManual: null, unidadeMedida: 'm²', valorUnitario: 85,
        memo: [
          { id: uid(), descricao: 'Parede sala 1', qtd: 12 },
          { id: uid(), descricao: 'Parede sala 2', qtd: 15 },
          { id: uid(), descricao: 'Parede quarto', qtd: 10 }
        ]
      },
      {
        id: uid(), unidade: 'Casa 01', etapa: 'Estrutura', subEtapa: 'Painéis',
        servico: 'Painel steel frame',
        descricao: 'Painéis estruturais com perfis Ue 90',
        qtdManual: 96, unidadeMedida: 'm²', valorUnitario: 210, memo: []
      },
      {
        id: uid(), unidade: 'Casa 01', etapa: 'Cobertura', subEtapa: 'Telhado',
        servico: 'Telha metálica',
        descricao: 'Telha trapezoidal e=0,43 mm',
        qtdManual: 120, unidadeMedida: 'm²', valorUnitario: 95, memo: []
      }
    ]
  };
  state.orcamentos.push(o);
  state.ativoId = o.id;
  salvar();
  renderTudo();
}

/* ---------- eventos ---------- */

$('#listaOrcamentos').addEventListener('click', (ev) => {
  const btnDel = ev.target.closest('[data-acao="del-orcamento"]');
  if (btnDel) { excluirOrcamento(btnDel.dataset.id); return; }
  const item = ev.target.closest('.orcamento-item');
  if (item) ativarOrcamento(item.dataset.orcamentoId);
});

$('#corpoTabela').addEventListener('click', (ev) => {
  const btn = ev.target.closest('[data-acao]');
  if (!btn) return;
  const o = orcamentoAtivo();
  if (!o) return;
  const acao = btn.dataset.acao;
  const sid = btn.dataset.sid;

  if (acao === 'toggle') { alternarExpandido(o, btn.dataset.key); return; }

  switch (acao) {
    case 'memo': {
      const k = 'm|' + o.id + '|' + sid;
      state.expandidos[k] = !state.expandidos[k];
      salvar();
      renderTudo();
      break;
    }
    case 'edit': abrirModal(servicoPorId(o, sid)); break;
    case 'del': excluirServico(sid); break;
    case 'add-linha': {
      const d = $('#memoDesc_' + sid);
      const q = $('#memoQtd_' + sid);
      addLinhaMemo(sid, d ? d.value : '', q ? q.value : '');
      break;
    }
    case 'del-linha': delLinhaMemo(sid, btn.dataset.lid); break;
    case 'clear-memo': limparMemo(sid); break;
  }
});

$('#btnNovoOrcamento').addEventListener('click', () => {
  const nome = prompt('Nome do novo orçamento (ex.: Residência Silva — São Carlos):', '');
  if (nome === null) return;
  criarOrcamento(nome);
});
$('#btnNovoVazio').addEventListener('click', () => {
  const nome = prompt('Nome do novo orçamento (ex.: Residência Silva — São Carlos):', '');
  if (nome === null) return;
  criarOrcamento(nome);
});
$('#btnExemplo').addEventListener('click', carregarExemplo);
$('#btnRenomear').addEventListener('click', renomearOrcamento);
$('#btnAddServico').addEventListener('click', () => abrirModal(null));
$('#btnCancelarModal').addEventListener('click', () => $('#modalServico').close());
$('#btnExportar').addEventListener('click', exportarBackup);
$('#inputImportar').addEventListener('change', importarBackup);

/* ---------- inicio ---------- */
renderTudo();
