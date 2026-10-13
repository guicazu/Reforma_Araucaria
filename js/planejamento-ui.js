/* Gerencia a view Planejamento: lista de cronogramas e editor de cronograma (EAP, linha de balanço, etc.) */
(function () {
  'use strict';

  var view = document.getElementById('viewPlanejamento');
  var navPlanejamento = document.querySelector('.app-sidebar-item[data-view="planejamento"]');
  var lista = document.getElementById('listaPlanejamentos');
  var btnNovo = document.getElementById('btnNovoPlanejamento');
  var btnNovoVazio = document.getElementById('btnNovoVazioPlanejamento');
  var btnVoltar = document.getElementById('btnVoltarListaPlanejamento');
  var contentVazio = document.getElementById('contentVazioPlanejamento');
  var contentEditor = document.getElementById('contentPlanejamento');
  var formulario = {
    nome: document.getElementById('planejamentoNome'),
    meta: document.getElementById('planejamentoMeta')
  };
  var tabelaBody = document.getElementById('corpoTabelaPlanejamento');
  var ganttHeader = document.getElementById('ganttHeader');
  var ganttBody = document.getElementById('ganttBody');
  var resumo = {
    duracaoTotal: document.getElementById('duracaoTotal'),
    dataInicio: document.getElementById('dataInicioProjeto'),
    dataFim: document.getElementById('dataFimProjeto'),
    atividadesCriticas: document.getElementById('atividadesCriticas'),
    folgaTotal: document.getElementById('folgaTotalProjeto')
  };
  var botoes = {
    salvar: document.getElementById('btnSalvarPlanejamento'),
    entrarEdicao: document.getElementById('btnEntrarEdicaoPlanejamento'),
    liberarBloqueio: document.getElementById('btnLiberarBloqueioPlanejamento'),
    importarOrcamento: document.getElementById('btnImportarDoOrcamento'),
    addFase: document.getElementById('btnAddFase'),
    duplicar: document.getElementById('btnDuplicarPlanejamento'),
    versoes: document.getElementById('btnVersoesPlanejamento'),
    exportarExcel: document.getElementById('btnExportarExcelPlanejamento'),
    exportarPdf: document.getElementById('btnExportarPdfPlanejamento'),
    renomear: document.getElementById('btnRenomearPlanejamento'),
    expandirTudo: document.getElementById('btnExpandirTudoPlanejamento'),
    recolherTudo: document.getElementById('btnRecolherTudoPlanejamento'),
    expandirOpcoes: document.getElementById('btnExpandirOpcoesPlanejamento')
  };
  var selects = {
    viewMode: document.getElementById('viewModePlanejamento'),
    timeScale: document.getElementById('timeScalePlanejamento')
  };
  var checkboxes = {
    critico: document.getElementById('chkCritico'),
    folga: document.getElementById('chkFolga'),
    linhaBalance: document.getElementById('chkLinhaBalance')
  };
  var painelStatusLista = document.getElementById('listaStatusPlanejamento');
  var btnSalvarLista = document.getElementById('btnSalvarListaPlanejamento');
  var statusLista = document.getElementById('statusListaPlanejamento');

  // Estado local
  var estado = {
    modo: 'lista', // lista ou editor
    planejamentoAtual: null, // objeto do planejamento sendo editado
    planejamentos: [] // lista de todos os planejamentos
  };

  // Inicialização
  function init() {
    carregarPlanejamentos();
    atualizarView();
    registrarEventos();
  }

  function registrarEventos() {
    if (navPlanejamento) {
      navPlanejamento.addEventListener('click', function () { irPara('lista'); });
    }
    if (btnNovo) btnNovo.addEventListener('click', function () { novoPlanejamento(); });
    if (btnNovoVazio) btnNovoVazio.addEventListener('click', function () { novoPlanejamentoVazio(); });
    if (btnVoltar) btnVoltar.addEventListener('click', function () { irPara('lista'); });
    if (botoes.salvar) botoes.salvar.addEventListener('click', function () { salvarPlanejamento(); });
    if (botoes.entrarEdicao) botoes.entrarEdicao.addEventListener('click', function () { entrarEdicao(); });
    if (botoes.liberarBloqueio) botoes.liberarBloqueio.addEventListener('click', function () { liberarBloqueio(); });
    if (botoes.importarOrcamento) botoes.importarOrcamento.addEventListener('click', function () { importarDoOrcamento(); });
    if (botoes.addFase) botoes.addFase.addEventListener('click', function () { addFase(); });
    if (botoes.duplicar) botoes.duplicar.addEventListener('click', function () { duplicarPlanejamento(); });
    if (botoes.versoes) botoes.versoes.addEventListener('click', function () { abrirVersoes(); });
    if (botoes.exportarExcel) botoes.exportarExcel.addEventListener('click', function () { exportarExcel(); });
    if (botoes.exportarPdf) botoes.exportarPdf.addEventListener('click', function () { exportarPdf(); });
    if (botoes.renomear) botoes.renomear.addEventListener('click', function () { renomearPlanejamento(); });
    if (botoes.expandirTudo) botoes.expandirTudo.addEventListener('click', function () { expandirTudo(); });
    if (botoes.recolherTudo) botoes.recolherTudo.addEventListener('click', function () { recolherTudo(); });
    if (botoes.expandirOpcoes) botoes.expandirOpcoes.addEventListener('click', function () { toggleExpandirOpcoes(); });
    if (selects.viewMode) selects.viewMode.addEventListener('change', function () { atualizarVisualizacao(); });
    if (selects.timeScale) selects.timeScale.addEventListener('change', function () { atualizarVisualizacao(); });
    if (checkboxes.critico) checkboxes.critico.addEventListener('change', function () { atualizarVisualizacao(); });
    if (checkboxes.folga) checkboxes.folga.addEventListener('change', function () { atualizarVisualizacao(); });
    if (checkboxes.linhaBalance) checkboxes.linhaBalance.addEventListener('change', function () { atualizarVisualizacao(); });
    if (btnSalvarLista) btnSalvarLista.addEventListener('click', function () { salvarListaPlanejamentos(); });
  }

  function irPara(modo) {
    if (view) view.dataset.modo = modo;
    estado.modo = modo;
    if (modo === 'lista') {
      atualizarListaPlanejamentos();
    } else if (modo === 'editor') {
      if (estado.planejamentoAtual) {
        carregarPlanejamentoNoEditor();
      }
    }
  }

  function atualizarView() {
    if (view) {
      Object.keys(views).forEach(function (key) {
        if (views[key]) views[key].classList.toggle('hidden', key !== estado.modo);
      });
    }
    // Também atualiza o estado do item ativo no sidebar
    var itens = document.querySelectorAll('.app-sidebar-item[data-view]');
    itens.forEach(function (it) {
      it.classList.toggle('ativo', it.dataset.view === estado.modo);
    });
  }

  // Lista de planejamentos
  function carregarPlanejamentos() {
    // TODO: carregar do localStorage ou IndexedDB
    estado.planejamentos = JSON.parse(localStorage.getItem('planejamentos') || '[]');
  }

  function salvarListaPlanejamentos() {
    localStorage.setItem('planejamentos', JSON.stringify(estado.planejamentos));
    mostrarStatus('Lista salva com sucesso!', 'success');
  }

  function atualizarListaPlanejamentos() {
    if (!lista) return;
    lista.innerHTML = '';
    estado.planejamentos.forEach(function (planejamento, index) {
      var li = document.createElement('li');
      li.className = 'planejamento-item';
      li.innerHTML = `
        <span class="planejamento-info">
          <strong>${planejamento.nome || 'Sem nome'}</strong>
          <br>
          <small>${planejamento.meta || ''}</small>
        </span>
        <div class="planejamento-actions">
          <button class="btn btn-ghost btn-sm" data-acao="ver" data-index="${index}">👁 Ver</button>
          <button class="btn btn-ghost btn-sm" data-acao="editar" data-index="${index}">✏️ Editar</button>
          <button class="btn btn-ghost btn-sm" data-acao="excluir" data-index="${index}">🗑 Excluir</button>
        </div>
      `;
      lista.appendChild(li);
    });
    // Adicionar eventos aos botões da lista
    lista.querySelectorAll('[data-acao]').forEach(function (botao) {
      botao.addEventListener('click', function () {
        var acao = this.dataset.acao;
        var index = parseInt(this.dataset.index);
        if (acao === 'ver') {
          verPlanejamento(index);
        } else if (acao === 'editar') {
          editarPlanejamento(index);
        } else if (acao === 'excluir') {
          excluirPlanejamento(index);
        }
      });
    });
  }

  function verPlanejamento(index) {
    estado.planejamentoAtual = estado.planejamentos[index];
    irPara('editor');
  }

  function editarPlanejamento(index) {
    estado.planejamentoAtual = estado.planejamentos[index];
    irPara('editor');
    // O botão de entrar em edição já estará visível
    botoes.entrarEdicao.classList.remove('hidden');
    botoes.salvar.classList.add('hidden');
  }

  function excluirPlanejamento(index) {
    if (confirm('Tem certeza que deseja excluir este planejamento?')) {
      estado.planejamentos.splice(index, 1);
      salvarListaPlanejamentos();
      atualizarListaPlanejamentos();
    }
  }

  // Novo planejamento
  function novoPlanejamento() {
    // Solicitar orçamento para vincular
    // Por enquanto, criamos um vazio e depois permite importar do orçamento
    novoPlanejamentoVazio();
  }

  function novoPlanejamentoVazio() {
    estado.planejamentoAtual = {
      id: Date.now(),
      nome: 'Novo Cronograma',
      meta: '',
      orcamentoVinculado: null, // ID do orçamento
      eap: [], // Estrutura Analítica do Projeto: fases, atividades, serviços
      dataInicio: new Date().toISOString().split('T')[0],
      duracaoTotal: 0,
      caminhoCritico: [],
      folgaTotal: 0
    };
    limparEditor();
    irPara('editor');
    botoes.entrarEdicao.classList.add('hidden'); // Começamos em modo de criação
    botoes.salvar.classList.remove('hidden');
  }

  function limparEditor() {
    if (formulario.nome) formulario.nome.value = '';
    if (formulario.meta) formulario.meta.value = '';
    if (tabelaBody) tabelaBody.innerHTML = '';
    if (ganttHeader) ganttHeader.innerHTML = '';
    if (ganttBody) ganttBody.innerHTML = '';
    atualizarResumo();
  }

  function carregarPlanejamentoNoEditor() {
    var p = estado.planejamentoAtual;
    if (formulario.nome) formulario.nome.value = p.nome || '';
    if (formulario.meta) formulario.meta.value = p.meta || '';
    renderizarEAP();
    atualizarResumo();
    atualizarVisualizacao();
  }

  function salvarPlanejamento() {
    if (!estado.planejamentoAtual) return;
    // Atualizar dados do formulário
    estado.planejamentoAtual.nome = formulario.nome.value.trim();
    estado.planejamentoAtual.meta = formulario.meta.value.trim();
    // Se for novo, adicionar à lista
    var index = estado.planejamentos.findIndex(function (p) { return p.id === estado.planejamentoAtual.id; });
    if (index === -1) {
      estado.planejamentos.push(estado.planejamentoAtual);
    } else {
      estado.planejamentos[index] = estado.planejamentoAtual;
    }
    salvarListaPlanejamentos();
    irPara('lista');
    mostrarStatus('Planejamento salvo com sucesso!', 'success');
  }

  function entrarEdicao() {
    botoes.entrarEdicao.classList.add('hidden');
    botoes.salvar.classList.remove('hidden');
    // Habilitar edição dos campos
    if (formulario.nome) formulario.nome.removeAttribute('readonly');
    if (formulario.meta) formulario.meta.removeAttribute('readonly');
    // Habilitar edição da tabela (TODO: implementar edição inline)
  }

  function liberarBloqueio() {
    // TODO: implementar liberação de bloqueio
    mostrarStatus('Bloqueio liberado (funcionalidade a ser implementada)', 'info');
  }

  function importarDoOrcamento() {
    // TODO: Importar EAP do orçamento vinculado
    mostrarStatus('Importar do orçamento (funcionalidade a ser implementada)', 'info');
  }

  function addFase() {
    // TODO: Adicionar uma nova fase à EAP
    mostrarStatus('Adicionar fase (funcionalidade a ser implementada)', 'info');
  }

  function duplicarPlanejamento() {
    // TODO: Duplicar o planejamento atual
    mostrarStatus('Duplicar planejamento (funcionalidade a ser implementada)', 'info');
  }

  function abrirVersoes() {
    // TODO: Abrir modal de versões
    mostrarStatus('Versões (funcionalidade a ser implementada)', 'info');
  }

  function exportarExcel() {
    // TODO: Exportar para Excel
    mostrarStatus('Exportar Excel (funcionalidade a ser implementada)', 'info');
  }

  function exportarPdf() {
    // TODO: Exportar para PDF
    mostrarStatus('Exportar PDF (funcionalidade a ser implementada)', 'info');
  }

  function renomearPlanejamento() {
    // TODO: Renomear o planejamento
    mostrarStatus('Renomear (funcionalidade a ser implementada)', 'info');
  }

  function expandirTudo() {
    // TODO: Expandir todos os níveis da EAP
    mostrarStatus('Expandir tudo (funcionalidade a ser implementada)', 'info');
  }

  function recolherTudo() {
    // TODO: Recolher todos os níveis da EAP
    mostrarStatus('Recolher tudo (funcionalidade a ser implementada)', 'info');
  }

  function toggleExpandirOpcoes() {
    var dropdown = document.querySelector('.expand-dropdown');
    if (dropdown) {
      dropdown.classList.toggle('hidden');
    }
  }

  function atualizarVisualizacao() {
    // TODO: Atualizar a visualização do Gantt com base nos selects e checkboxes
    mostrarStatus('Visualização atualizada (funcionalidade a ser implementada)', 'info');
  }

  function renderizarEAP() {
    // TODO: Renderizar a EAP na tabela e no Gantt
    // Por enquanto, apenas limpar
    if (tabelaBody) tabelaBody.innerHTML = '<tr><td colspan="8">Nenhuma atividade adicionada.</td></tr>';
  }

  function atualizarResumo() {
    if (estado.planejamentoAtual) {
      resumo.duracaoTotal.textContent = estado.planejamentoAtual.duracaoTotal || '—';
      resumo.dataInicio.textContent = estado.planejamentoAtual.dataInicio || '—';
      resumo.dataFim.textContent = estado.planejamentoAtual.dataFim || '—';
      resumo.atividadesCriticas.textContent = estado.planejamentoAtual.caminhoCritico ? estado.planejamentoAtual.caminhoCritico.length : 0;
      resumo.folgaTotal.textContent = estado.planejamentoAtual.folgaTotal || '0d';
    } else {
      resumo.duracaoTotal.textContent = '—';
      resumo.dataInicio.textContent = '—';
      resumo.dataFim.textContent = '—';
      resumo.atividadesCriticas.textContent = '0';
      resumo.folgaTotal.textContent = '0d';
    }
  }

  function mostrarStatus(mensagem, tipo) {
    // Atualizar o painel de status da lista ou do editor conforme o contexto
    var painel = estado.modo === 'lista' ? painelStatusLista : document.getElementById('statusSalvamentoPlanejamento');
    if (painel) {
      painel.textContent = mensagem;
      painel.className = 'save-status save-status-' + (tipo === 'success' ? 'success' : tipo === 'error' ? 'error' : 'info');
      painel.classList.remove('hidden');
      setTimeout(function () {
        painel.classList.add('hidden');
      }, 3000);
    }
  }

  // Iniciar quando o DOM estiver pronto
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();