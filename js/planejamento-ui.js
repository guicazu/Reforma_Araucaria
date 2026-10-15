/* Gerencia a view Planejamento: lista de cronogramas e editor de cronograma (EAP, linha de balanço, etc.) */
(function () {
  'use strict';

  var view = document.getElementById('viewPlanejamento');
  var navPlanejamento = document.querySelector('.app-sidebar-item[data-view="planejamento"]');
  var lista = document.getElementById('listaPlanejamentos');
  var btnNovo = document.getElementById('btnNovoPlanejamento');
  var btnNovoVazio = document.getElementById('btnCriarCronogramaVazio');
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
    atualizarView();
  }

  function atualizarView() {
    if (view) {
      // Update the dataset for potential CSS hooks (though we're handling visibility directly)
      view.dataset.modo = estado.modo;
      
      // Show/hide the main content sections based on mode
      if (contentVazio) {
        // Show contentVazio when in 'lista' mode, hide when in 'editor'
        contentVazio.classList.toggle('hidden', estado.modo !== 'lista');
      }
      if (contentEditor) {
        // Show contentEditor when in 'editor' mode, hide when in 'lista'
        contentEditor.classList.toggle('hidden', estado.modo !== 'editor');
      }
    }
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
          <button class="btn btn-ghost btn-sm" data-acao="ver" data-index="${index}">${icone('ver')}Ver</button>
          <button class="btn btn-ghost btn-sm" data-acao="editar" data-index="${index}">${icone('editar')}Editar</button>
          <button class="btn btn-ghost btn-sm" data-acao="excluir" data-index="${index}">${icone('excluir')}Excluir</button>
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
    carregarPlanejamentoNoEditor();
    irPara('editor');
    botoes.entrarEdicao.classList.add('hidden'); // Começamos em modo de criação
    botoes.salvar.classList.remove('hidden');
  }

  function limparEditor() {
    if (formulario.nome) formulario.nome.textContent = '';
    if (formulario.meta) formulario.meta.textContent = '';
    if (tabelaBody) tabelaBody.innerHTML = '';
    if (ganttHeader) ganttHeader.innerHTML = '';
    if (ganttBody) ganttBody.innerHTML = '';
    atualizarResumo();
  }

  function carregarPlanejamentoNoEditor() {
    var p = estado.planejamentoAtual;
    if (formulario.nome) formulario.nome.textContent = p.nome || '';
    if (formulario.meta) formulario.meta.textContent = p.meta || '';
    renderizarEAP();
    atualizarResumo();
    atualizarVisualizacao();
  }

  function salvarPlanejamento() {
    if (!estado.planejamentoAtual) return;
    // Atualizar dados do formulário
    estado.planejamentoAtual.nome = formulario.nome.textContent.trim();
    estado.planejamentoAtual.meta = formulario.meta.textContent.trim();
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
    // Show modal to select orçamento and version
    const orcamentoState = JSON.parse(localStorage.getItem('ibuild_orcamentos_v5') || '{}');
    
    if (!orcamentoState.orcamentos || orcamentoState.orcamentos.length === 0) {
      mostrarStatus('Nenhum orçamento encontrado para importar.', 'error');
      return;
    }

    // Create and show selection modal
    const modal = document.createElement('dialog');
    modal.className = 'modal-import';
    modal.innerHTML = `
      <div class="modal-content">
        <h2>Importar EAP do Orçamento</h2>
        <div class="modal-body">
          <div class="form-group">
            <label for="selectOrcamento">Orçamento:</label>
            <select id="selectOrcamento" class="form-select">
              ${orcamentoState.orcamentos.map(o => `
                <option value="${o.id}">${o.codigo} - ${o.nome}</option>
              `).join('')}
            </select>
          </div>
          <div class="form-group">
            <label for="selectVersao">Versão:</label>
            <select id="selectVersao" class="form-select">
              <!-- Versions will be populated when orçamento changes -->
            </select>
          </div>
          <div class="modal-footer">
            <button id="btnCancelarImport" class="btn btn-ghost">Cancelar</button>
            <button id="btnConfirmarImport" class="btn btn-primary">Importar</button>
          </div>
        </div>
      </div>
    `;

    // Add modal to document
    document.body.appendChild(modal);
    modal.showModal();
    
    // Get elements
    const selectOrcamento = modal.querySelector('#selectOrcamento');
    const selectVersao = modal.querySelector('#selectVersao');
    const btnCancelar = modal.querySelector('#btnCancelarImport');
    const btnConfirmar = modal.querySelector('#btnConfirmarImport');

    // Populate versions when orçamento changes
    function updateVersoes() {
      const orcamentoId = selectOrcamento.value;
      const orcamento = orcamentoState.orcamentos.find(o => o.id === orcamentoId);
      if (!orcamento) return;
      
      selectVersao.innerHTML = '';
      orcamento.versoes.forEach(v => {
        const option = document.createElement('option');
        option.value = v.id;
        option.textContent = `Versão ${v.numero}: ${v.rotulo || ''} (${new Date(v.criadoEm).toLocaleDateString()})`;
        selectVersao.appendChild(option);
      });
    }

    // Initialize
    updateVersoes();
    
    // Event listeners
    selectOrcamento.addEventListener('change', updateVersoes);
    btnCancelar.addEventListener('click', () => {
      modal.close();
      document.body.removeChild(modal);
    });
    btnConfirmar.addEventListener('click', async () => {
      const orcamentoId = selectOrcamento.value;
      const versaoId = selectVersao.value;
      
      const orcamento = orcamentoState.orcamentos.find(o => o.id === orcamentoId);
      if (!orcamento) {
        mostrarStatus('Orçamento não encontrado.', 'error');
        modal.close();
        document.body.removeChild(modal);
        return;
      }
      
      const versao = orcamento.versoes.find(v => v.id === versaoId);
      if (!versao) {
        mostrarStatus('Versão não encontrada.', 'error');
        modal.close();
        document.body.removeChild(modal);
        return;
      }

      // Check if this version is already being used for planning
      const planejamentoBloqueios = JSON.parse(localStorage.getItem('ibuild_planejamento_bloqueios_v1') || '{}');
      const isBloqueado = planejamentoBloqueios[orcamentoId] && planejamentoBloqueios[orcamentoId].includes(versaoId);
      
      let podeContinuar = true;
      if (isBloqueado) {
        podeContinuar = confirm(`Esta versão já está sendo usada para planejamento em outro cronograma. Deseja continuar mesmo assim? Isso pode causar conflitos.`);
      }

      if (!podeContinuar) {
        modal.close();
        document.body.removeChild(modal);
        return;
      }

      try {
        // Import the EAP from the selected version
        importarEAPDaVersao(orcamento, versao);
        
        // Mark this version as being used for planning
        if (!planejamentoBloqueios[orcamentoId]) {
          planejamentoBloqueios[orcamentoId] = [];
        }
        if (!planejamentoBloqueios[orcamentoId].includes(versaoId)) {
          planejamentoBloqueios[orcamentoId].push(versaoId);
        }
        localStorage.setItem('ibuild_planejamento_bloqueios_v1', JSON.stringify(planejamentoBloqueios));
        
        mostrarStatus(`EAP importada com sucesso da versão ${versao.numero} do orçamento "${orcamento.nome}". Esta versão está marcada como em uso para planejamento.`, 'success');
      } catch (erro) {
        mostrarStatus(`Erro ao importar: ${erro.message}`, 'error');
      } finally {
        modal.close();
        document.body.removeChild(modal);
      }
    });

    // Handle clicking outside the modal to close it
    modal.addEventListener('click', (e) => {
      if (e.target === modal) {
        modal.close();
        document.body.removeChild(modal);
      }
    });

    // Focus the modal
    selectOrcamento.focus();
  }

  function importarEAPDaVersao(orcamento, versao) {
    // Build the EAP flat list from the versao.unidades
    const eap = [];

    versao.unidades.forEach(unidade => {
      // Fase (nivel 0)
      const faseId = 'fase_' + unidade.id;
      eap.push({
        id: faseId,
        nome: unidade.nome,
        tipo: 'fase',
        nivel: 0,
        duracao: 0, // summary, will be calculated from children
        inicio: null,
        termino: null,
        folga: 0,
        predecessorIds: [], // to be filled later
        originalId: unidade.id // to link back to the orçamento
      });

      unidade.etapas.forEach(etapa => {
        // Atividade (nivel 1)
        const atividadeId = 'atividade_' + etapa.id;
        eap.push({
          id: atividadeId,
          nome: etapa.nome,
          tipo: 'atividade',
          nivel: 1,
          duracao: 0,
          inicio: null,
          termino: null,
          folga: 0,
          predecessorIds: [],
          originalId: etapa.id
        });

        etapa.subEtapas.forEach(subEtapa => {
          // SubAtividade (nivel 2)
          const subAtividadeId = 'subatividade_' + subEtapa.id;
          eap.push({
            id: subAtividadeId,
            nome: subEtapa.nome || 'SubEtapa',
            tipo: 'subEtapa',
            nivel: 2,
            duracao: 0,
            inicio: null,
            termino: null,
            folga: 0,
            predecessorIds: [],
            originalId: subEtapa.id
          });

          subEtapa.servicos.forEach(servico => {
            // Serviço (nivel 3)
            const servicoId = servico.id; // use the original ID
            // Try to get duration from servico, else default 1
            const duracao = servico.duracao !== undefined && servico.duracao !== null ? servico.duracao : 1;
            eap.push({
              id: servicoId,
              nome: servico.nome || 'Serviço sem nome',
              tipo: 'servico',
              nivel: 3,
              duracao: duracao,
              inicio: null,
              termino: null,
              folga: 0,
              predecessorIds: [], // we will set later
              originalId: servico.id
            });
          });
        });
      });
    });

    // Mark the version as blocked for planning
    versao.bloqueadoParaPlanejamento = true;

    // Save the orçamento state with the blocked version
    const orcamentoState = JSON.parse(localStorage.getItem('ibuild_orcamentos_v5') || '{}');
    const orcamentoIndex = orcamentoState.orcamentos.findIndex(o => o.id === orcamento.id);
    if (orcamentoIndex !== -1) {
      orcamentoState.orcamentos[orcamentoIndex] = orcamento;
      localStorage.setItem('ibuild_orcamentos_v5', JSON.stringify(orcamentoState));
    }

    // Set predecessors: we set each node's predecessor to the previous node in the list (for simplicity)
    for (let i = 1; i < eap.length; i++) {
      eap[i].predecessorIds = [eap[i-1].id];
    }

    // Calculate the schedule (start and end dates) based on the project start date and predecessors.
    const projetoInicio = estado.planejamentoAtual ? estado.planejamentoAtual.dataInicio : new Date().toISOString().split('T')[0];
    eap.forEach((node, index) => {
      if (index === 0) {
        node.inicio = projetoInicio;
      } else {
        const prevNode = eap[index-1];
        const prevEnd = new Date(prevNode.termino);
        prevEnd.setDate(prevEnd.getDate() + 1); // start next day
        node.inicio = prevEnd.toISOString().split('T')[0];
      }
      // Calculate termino: inicio + duracao - 1
      const inicioDate = new Date(node.inicio);
      const terminoDate = new Date(inicioDate);
      terminoDate.setDate(terminoDate.getDate() + node.duracao - 1);
      node.termino = terminoDate.toISOString().split('T')[0];
    });

    // Fix zero-duration nodes: if duration is 0, set termino equal to inicio
    // (a task with zero duration starts and ends on the same day)
    eap.forEach(node => {
      if (node.duracao === 0) {
        node.termino = node.inicio;
      }
    });

    // Fix zero-duration nodes: if duration is 0, set termino equal to inicio
    // (a task with zero duration starts and ends on the same day)
    eap.forEach(node => {
      if (node.duracao === 0 && node.inicio) {
        node.termino = node.inicio;
      }
    });

    // Calculate summary durations (fase, atividade, subEtapa) as the difference between the earliest start and latest finish of their children.
    const nodeMap = {};
    eap.forEach(node => {
      nodeMap[node.id] = node;
    });

    eap.slice().reverse().forEach(node => {
      if (node.tipo === 'servico') {
        let parentLevel = node.nivel - 1;
        let parentId = null;
        for (let i = eap.indexOf(node) - 1; i >= 0; i--) {
          if (eap[i].nivel === parentLevel) {
            parentId = eap[i].id;
            break;
          }
        }
        if (parentId) {
          const parent = nodeMap[parentId];
          if (!parent.inicio || node.inicio < parent.inicio) {
            parent.inicio = node.inicio;
          }
          if (!parent.termino || node.termino > parent.termino) {
            parent.termino = node.termino;
          }
          const parentInicio = new Date(parent.inicio);
          const parentTermino = new Date(parent.termino);
          parent.duracao = Math.floor((parentTermino - parentInicio) / (1000 * 60 * 60 * 24)) + 1;
        }
      }
    });

    // Set folga (slack) to 0 for now (placeholder for future implementation)
    eap.forEach(node => {
      node.folga = 0;
    });

    // Set the EAP in the estado.planejamentoAtual
    if (!estado.planejamentoAtual) {
      // If we don't have a planejamento atual, create one
      novoPlanejamentoVazio();
    }
    estado.planejamentoAtual.eap = eap;
    
    // Ensure we navigate to the editor view to show the imported data
    irPara('editor');

    // Render the EAP in the table and update the summary
    renderizarEAP();
    atualizarResumo();
    atualizarVisualizacao();
  }

  function addFase() {
    if (!estado.planejamentoAtual) {
      mostrarStatus('Crie um cronograma primeiro.', 'info');
      return;
    }
    
    const nomeFase = prompt('Nome da nova fase:', 'Nova Fase');
    if (!nomeFase) return;
    
    const faseId = 'fase_' + Date.now();
    const novaFase = {
      id: faseId,
      nome: nomeFase,
      tipo: 'fase',
      nivel: 0,
      duracao: 0,
      inicio: null,
      termino: null,
      folga: 0,
      predecessorIds: [],
      originalId: faseId
    };
    
    estado.planejamentoAtual.eap.push(novaFase);
    
    // Recalculate the schedule
    recalcularCronograma();
    renderizarEAP();
    atualizarResumo();
    mostrarStatus('Fase adicionada com sucesso!', 'success');
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

  function editarDuracao(id) {
    const node = estado.planejamentoAtual.eap.find(n => n.id === id);
    if (!node) return;
    const novaDuracao = prompt('Nova duração (dias):', node.duracao);
    if (novaDuracao === null) return;
    const duracaoNum = parseInt(novaDuracao, 10);
    if (isNaN(duracaoNum) || duracaoNum < 0) {
      mostrarStatus('Duração inválida.', 'error');
      return;
    }
    node.duracao = duracaoNum;
    // Recalcular o cronograma inteiro após a mudança
    recalcularCronograma();
    renderizarEAP();
    atualizarResumo();
    mostrarStatus('Duração atualizada.', 'success');
  }

  function excluirNode(id) {
    if (!confirm('Tem certeza que deseja excluir este item?')) return;
    estado.planejamentoAtual.eap = estado.planejamentoAtual.eap.filter(n => n.id !== id);
    // Recalcular o cronograma após exclusão
    recalcularCronograma();
    renderizarEAP();
    atualizarResumo();
    mostrarStatus('Item excluído.', 'success');
  }

  function atualizarVisualizacao() {
    // TODO: Atualizar a visualização do Gantt com base nos selects e checkboxes
    mostrarStatus('Visualização atualizada (funcionalidade a ser implementada)', 'info');
  }

  function renderizarEAP() {
    if (!estado.planejamentoAtual || !estado.planejamentoAtual.eap || estado.planejamentoAtual.eap.length === 0) {
      tabelaBody.innerHTML = '<tr><td colspan="8">Nenhuma atividade adicionada.</td></tr>';
      return;
    }

    const eap = estado.planejamentoAtual.eap;
    tabelaBody.innerHTML = ''; // clear

    eap.forEach((node, index) => {
      const indent = ' '.repeat(node.nivel * 2); // 2 spaces per level
      const tr = document.createElement('tr');
      // Add classes for styling based on node type
      tr.className = 'linha-' + node.tipo;
      if (node.tipo === 'fase') tr.classList.add('grupo', 'n1');
      else if (node.tipo === 'atividade') tr.classList.add('grupo', 'n2');
      else if (node.tipo === 'subEtapa') tr.classList.add('grupo', 'n3');
      else if (node.tipo === 'servico') tr.classList.add('linha-servico');
      
      tr.innerHTML = `
        <td class="col-codigo">${node.originalId || ''}</td>
        <td style="width:350px">${indent}${node.nome}</td>
        <td class="col-un">-</td>
        <td class="col-num">${node.duracao}</td>
        <td class="col-num">${node.inicio || ''}</td>
        <td class="col-num">${node.termino || ''}</td>
        <td class="col-num">${node.folga}d</td>
        <td class="col-acoes">
          <button class="btn btn-ghost btn-sm" data-acao="editar-duracao" data-id="${node.id}">${icone('relogio')}Duração</button>
          <button class="btn btn-ghost btn-sm" data-acao="excluir" data-id="${node.id}">${icone('excluir')}Excluir</button>
        </td>
      `;
      tabelaBody.appendChild(tr);
    });

    // Add event listeners for the buttons in the table
    tabelaBody.querySelectorAll('[data-acao]').forEach(botao => {
      botao.addEventListener('click', function () {
        const acao = this.dataset.acao;
        const id = this.dataset.id;
        if (acao === 'editar-duracao') {
          editarDuracao(id);
        } else if (acao === 'excluir') {
          excluirNode(id);
        }
      });
    });
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