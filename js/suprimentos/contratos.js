/* Contratos (empreiteiros, serviços, locação) e medições. Os itens do contrato são apropriados nos
   serviços da EAP; o contrato é autorizado (alçada), recebe aditivos e é medido por período. A
   medição autorizada vira título no contas a pagar pelo valor líquido (bruto − caução − impostos
   retidos − descontos); no encerramento, a caução retida pode ser liberada. */
(function () {
  'use strict';
  const S = window.Supr;
  const filtro = { aba: 'contratos', situacao: 'autorizado', busca: '', situacaoMed: 'pendente' };
  const TIPOS = { empreitada: 'Empreitada', servico: 'Prestação de serviço', fornecimento: 'Fornecimento', locacao: 'Locação' };

  /* ---------- lista ---------- */
  S.registrar('contratos', {
    titulo: 'Contratos e medições', subtitulo: 'Empreiteiros e serviços contratados, medidos por período', lista: true,
    render: async (c) => {
      const obra = S.obraAtual();
      const q = '?obra=' + encodeURIComponent(obra);
      const [{ contratos }, { medicoes }] = await Promise.all([S.get('contratos' + q), S.get('medicoes' + q)]);
      if (!c.vigente()) return;
      const desenhar = () => {
        const conta = (s) => contratos.filter((x) => x.status === s).length;
        const contaM = (s) => medicoes.filter((x) => x.status === s).length;
        let barra = '<div class="supr-abas"><button type="button" data-aba="contratos"' + (filtro.aba === 'contratos' ? ' class="ativo"' : '') + '>Contratos</button>' +
          '<button type="button" data-aba="medicoes"' + (filtro.aba === 'medicoes' ? ' class="ativo"' : '') + '>Medições</button></div>';
        if (filtro.aba === 'contratos') {
          barra += '<div class="supr-barra">' + S.busca(filtro.busca, 'Nº, fornecedor ou objeto') + S.chips([['autorizado', 'Vigentes', conta('autorizado')],
            ['pendente', 'Aguardando autorização', conta('pendente')], ['encerrado', 'Encerrados', conta('encerrado')], ['', 'Todos', contratos.length]], filtro.situacao) +
            '<span class="espaco"></span>' + (S.podeEditar() ? S.botao('novo', 'Novo contrato', { primario: true, icone: 'mais' }) : '') + '</div>';
          const linhas = contratos.filter((x) => (!filtro.situacao || x.status === filtro.situacao) && S.combina(filtro.busca, [x.numero, x.fornecedorNome, x.objeto]));
          c.innerHTML = barra + S.tabela([
            { t: 'Nº', v: (x) => '<b>' + x.numero + '</b>', c: 'min' },
            ...(obra ? [] : [{ t: 'Obra', v: (x) => S.esc(S.nomeObra(x.orcamentoId)) }]),
            { t: 'Fornecedor', v: (x) => S.esc(x.fornecedorNome) + '<small>' + S.esc(x.objeto) + '</small>' },
            { t: 'Vigência', v: (x) => S.data(x.dataInicio) + ' a ' + S.data(x.dataFim), c: 'nowrap' },
            { t: 'Valor', v: (x) => S.moeda(x.valorTotal), c: 'num' },
            { t: 'Medido', v: (x) => S.moeda(x.valorMedido) + '<small>' + S.pct(x.valorTotal ? x.valorMedido / x.valorTotal * 100 : 0) + '</small>', c: 'num' },
            { t: 'Saldo', v: (x) => S.moeda(x.saldo), c: 'num' },
            { t: 'Situação', v: (x) => '<span class="supr-tags">' + S.status('contrato', x.status) + (x.medicoesPendentes ? S.tag(x.medicoesPendentes + ' medição(ões) a autorizar', 'amarelo') : '') +
              (x.aditivosPendentes ? S.tag('Aditivo a autorizar', 'amarelo') : '') + '</span>' }
          ], linhas, { id: (x) => 'c:' + x.id, vazio: contratos.length ? 'Nenhum contrato com esse filtro.' : '<strong>Nenhum contrato</strong>Contrate empreiteiros e serviços apropriando cada item num serviço do orçamento.' });
        } else {
          barra += '<div class="supr-barra">' + S.busca(filtro.busca, 'Contrato ou fornecedor') + S.chips([['pendente', 'Aguardando autorização', contaM('pendente')],
            ['autorizada', 'Autorizadas', contaM('autorizada')], ['', 'Todas', medicoes.length]], filtro.situacaoMed) + '</div>';
          const linhas = medicoes.filter((x) => (!filtro.situacaoMed || x.status === filtro.situacaoMed) && S.combina(filtro.busca, [x.contratoNumero, x.fornecedorNome, x.objeto]));
          c.innerHTML = barra + S.tabela([
            { t: 'Contrato', v: (x) => 'nº ' + x.contratoNumero, c: 'min' },
            { t: 'Medição', v: (x) => 'nº ' + x.numero, c: 'min' },
            { t: 'Fornecedor', v: (x) => S.esc(x.fornecedorNome) + '<small>' + S.esc(x.objeto) + '</small>' },
            { t: 'Período', v: (x) => (x.periodoInicio ? S.data(x.periodoInicio) + ' a ' + S.data(x.periodoFim) : S.data(x.data)), c: 'nowrap' },
            { t: 'Bruto', v: (x) => S.moeda(x.valorBruto), c: 'num' },
            { t: 'Líquido', v: (x) => S.moeda(x.valorLiquido), c: 'num' },
            { t: 'Vencimento', v: (x) => S.data(x.dataVencimento), c: 'nowrap' },
            { t: 'Situação', v: (x) => S.status('medicao', x.status) }
          ], linhas, { id: (x) => 'm:' + x.id, vazio: 'Nenhuma medição com esse filtro.' });
        }
        const busca = c.querySelector('[data-busca]');
        busca.addEventListener('input', (ev) => { filtro.busca = ev.target.value; const pos = ev.target.selectionStart; desenhar(); const b = c.querySelector('[data-busca]'); b.focus(); b.setSelectionRange(pos, pos); });
      };
      c.addEventListener('click', (ev) => {
        const aba = ev.target.closest('[data-aba]');
        if (aba) { filtro.aba = aba.dataset.aba; desenhar(); return; }
        const chip = ev.target.closest('[data-chips] button[data-valor]');
        if (chip) { if (filtro.aba === 'contratos') filtro.situacao = chip.dataset.valor; else filtro.situacaoMed = chip.dataset.valor; desenhar(); return; }
        if (ev.target.closest('[data-acao="novo"]')) S.ir('contrato-form', {});
      });
      S.aoAbrirLinha(c, (id) => S.ir(id[0] === 'c' ? 'contrato' : 'medicao', { id: id.slice(2) }));
      desenhar();
    }
  });

  /* ---------- formulário ---------- */
  S.registrar('contrato-form', {
    titulo: 'Contrato', menu: 'contratos',
    render: async (c, prm) => {
      if (!S.podeEditar()) { c.innerHTML = '<div class="supr-nota">Seu acesso é só de consulta.</div>'; return; }
      const ct = prm.id ? (await S.get('contratos/' + prm.id)).contrato : null;
      const fornecedores = await S.fornecedores();
      if (!c.vigente()) return;
      let obraId = ct ? ct.orcamentoId : (prm.obra || S.obraAtual());
      let orc = obraId ? await S.orcado(obraId) : null;
      let itens = ct ? ct.itens.filter((i) => !i.aditivoId).map((i) => ({ servicoId: i.servicoId, descricao: i.descricao, unidade: i.unidade, quantidade: i.quantidade, precoUnitario: i.precoUnitario })) : [];
      const v = (k, padrao) => S.esc(ct ? (ct[k] == null ? '' : ct[k]) : padrao == null ? '' : padrao);
      c.innerHTML = S.cabecalho({ titulo: ct ? 'Alterar contrato nº ' + ct.numero : 'Novo contrato',
        sub: ct && ct.status === 'reprovado' ? 'Reprovado: ' + S.esc(ct.motivoReprovacao || '') + '. Ao salvar, volta para autorização.' : 'Cada item é apropriado num serviço do orçamento.' }) +
        '<div class="supr-form">' +
        '<label class="duplo">Obra<select data-obra' + (ct ? ' disabled' : '') + '>' + S.opcoesObras(obraId) + '</select></label>' +
        '<label class="duplo">Fornecedor (contratado)<select data-fornecedor>' + S.opcoesFornecedores(fornecedores, ct ? ct.fornecedorId : '') + '</select>' +
        '<button type="button" class="supr-link" data-acao="novo-forn" style="align-self:flex-start;font-size:11.5px">Cadastrar fornecedor</button></label>' +
        '<label class="largo">Objeto<input data-objeto maxlength="500" value="' + v('objeto') + '" placeholder="Ex.: mão de obra de alvenaria e revestimento do bloco A"></label>' +
        '<label>Tipo<select data-tipo>' + Object.keys(TIPOS).map((k) => '<option value="' + k + '"' + (ct && ct.tipo === k ? ' selected' : '') + '>' + TIPOS[k] + '</option>').join('') + '</select></label>' +
        '<label>Assinatura<input type="date" data-assinatura value="' + v('dataAssinatura') + '"></label>' +
        '<label>Início<input type="date" data-inicio value="' + v('dataInicio', S.hoje()) + '"></label>' +
        '<label>Término<input type="date" data-fim value="' + v('dataFim') + '"></label>' +
        '<label>Retenção contratual / caução (%)<input inputmode="decimal" data-pct="retencaoPercentual" value="' + S.valorCampo(ct ? ct.retencaoPercentual : 5, 2) + '"></label>' +
        '<label>INSS retido (%)<input inputmode="decimal" data-pct="inssPercentual" value="' + S.valorCampo(ct ? ct.inssPercentual : '', 2) + '"></label>' +
        '<label>ISS retido (%)<input inputmode="decimal" data-pct="issPercentual" value="' + S.valorCampo(ct ? ct.issPercentual : '', 2) + '"></label>' +
        '<label>IR retido (%)<input inputmode="decimal" data-pct="irPercentual" value="' + S.valorCampo(ct ? ct.irPercentual : '', 2) + '"></label>' +
        '<label>PIS/COFINS/CSLL (%)<input inputmode="decimal" data-pct="pccPercentual" value="' + S.valorCampo(ct ? ct.pccPercentual : '', 2) + '"></label>' +
        '<label>Pagamento (dias após a medição)<input inputmode="numeric" data-dias value="' + v('diasPagamento', 10) + '"></label>' +
        '<label class="largo">Observações<textarea rows="2" data-obs maxlength="2000">' + v('observacoes') + '</textarea></label></div>' +
        S.secao('Itens do contrato', '<div data-itens></div>', S.botao('incluir', 'Incluir serviço do orçamento', { primario: true, icone: 'mais' })) +
        '<div class="supr-rodape"><button type="button" class="btn btn-ghost" data-voltar>Cancelar</button><button type="button" class="btn btn-primary" data-acao="salvar">' +
        S.ic('salvar') + (ct ? 'Salvar alterações' : 'Criar contrato') + '</button></div>';

      function desenhar() {
        const alvo = c.querySelector('[data-itens]');
        if (!orc) { alvo.innerHTML = '<div class="supr-vazio">Escolha a obra.</div>'; return; }
        const total = itens.reduce((s, i) => s + (i.quantidade || 0) * (i.precoUnitario || 0), 0);
        alvo.innerHTML = S.tabela([
          { t: 'Serviço (apropriação)', v: (i, k) => '<select data-campo="servicoId" data-k="' + k + '" style="max-width:260px">' + S.opcoesServicos(orc, i.servicoId) + '</select>' },
          { t: 'Descrição no contrato', v: (i, k) => '<input data-campo="descricao" data-k="' + k + '" value="' + S.esc(i.descricao) + '" style="min-width:220px">' },
          { t: 'Un.', v: (i, k) => '<input data-campo="unidade" data-k="' + k + '" value="' + S.esc(i.unidade || '') + '" style="width:56px">' },
          { t: 'Quantidade', v: (i, k) => '<input class="num" inputmode="decimal" data-campo="quantidade" data-k="' + k + '" value="' + S.valorCampo(i.quantidade) + '">', c: 'num' },
          { t: 'Preço unit. (R$)', v: (i, k) => { const sv = S.servicoPorId(orc, i.servicoId); return '<input class="num" inputmode="decimal" data-campo="precoUnitario" data-k="' + k + '" value="' + S.valorCampo(i.precoUnitario, 6) + '">' +
            (sv ? '<small>orçado ' + S.moeda(sv.valorUnitario) + '/' + S.esc(sv.unidade || 'un') + '</small>' : ''); }, c: 'num' },
          { t: 'Valor', v: (i) => S.moeda((i.quantidade || 0) * (i.precoUnitario || 0)), c: 'num' },
          { t: '', v: (i, k) => '<button type="button" class="btn-icon btn-danger" data-tirar="' + k + '">' + S.ic('excluir') + '</button>', c: 'acoes' }
        ], itens, { vazio: 'Inclua os serviços do orçamento que este contrato cobre.', rodape: itens.length ? '<tr><td colspan="5">Valor do contrato</td><td class="num">' + S.moeda(total) + '</td><td></td></tr>' : '' });
      }
      c.addEventListener('change', async (ev) => {
        const t = ev.target;
        if (t.matches('[data-obra]')) {
          obraId = t.value; itens = []; orc = null; desenhar();
          if (obraId) { orc = await S.orcado(obraId).catch(S.falhou); if (c.vigente()) desenhar(); }
          return;
        }
        if (t.dataset.campo === 'servicoId') { itens[Number(t.dataset.k)].servicoId = t.value; desenhar(); }
      });
      c.addEventListener('input', (ev) => {
        const t = ev.target;
        if (!t.dataset.campo || t.dataset.k == null) return;
        const it = itens[Number(t.dataset.k)];
        if (t.dataset.campo === 'quantidade' || t.dataset.campo === 'precoUnitario') {
          it[t.dataset.campo] = S.num(t.value);
          const tr = t.closest('tr');
          tr.children[5].textContent = S.moeda((it.quantidade || 0) * (it.precoUnitario || 0));
          const tot = c.querySelector('tfoot td.num');
          if (tot) tot.textContent = S.moeda(itens.reduce((s, i) => s + (i.quantidade || 0) * (i.precoUnitario || 0), 0));
        } else it[t.dataset.campo] = t.value;
      });
      c.addEventListener('click', async (ev) => {
        const tirar = ev.target.closest('[data-tirar]');
        if (tirar) { itens.splice(Number(tirar.dataset.tirar), 1); desenhar(); return; }
        const b = ev.target.closest('[data-acao]');
        if (!b) return;
        if (b.dataset.acao === 'novo-forn') {
          const id = await S.novoFornecedor();
          if (id) c.querySelector('[data-fornecedor]').innerHTML = S.opcoesFornecedores(await S.fornecedores(true), id);
        } else if (b.dataset.acao === 'incluir') {
          if (!orc) { S.aviso('Escolha a obra.', 'erro'); return; }
          const r = await S.dialogo({ titulo: 'Incluir serviço do orçamento', botao: 'Incluir',
            corpo: '<label class="campo">Serviço<select data-sv>' + S.opcoesServicos(orc, '') + '</select></label>' +
              '<p class="supr-dica" style="margin-top:8px">A quantidade e o preço vêm do orçamento; ajuste para o que foi contratado (ex.: só a mão de obra).</p>',
            aoConfirmar: (corpo) => { const id = corpo.querySelector('[data-sv]').value; if (!id) { S.aviso('Escolha o serviço.', 'erro'); return false; } return id; } }).resultado;
          if (!r) return;
          const sv = S.servicoPorId(orc, r);
          itens.push({ servicoId: sv.id, descricao: S.nome(sv.nome), unidade: sv.unidade, quantidade: sv.quantidade, precoUnitario: sv.valorUnitario });
          desenhar();
        } else if (b.dataset.acao === 'salvar') {
          try {
            const corpo = {
              orcamentoId: obraId, fornecedorId: c.querySelector('[data-fornecedor]').value, objeto: c.querySelector('[data-objeto]').value,
              tipo: c.querySelector('[data-tipo]').value, dataAssinatura: c.querySelector('[data-assinatura]').value || null,
              dataInicio: c.querySelector('[data-inicio]').value || null, dataFim: c.querySelector('[data-fim]').value || null,
              diasPagamento: parseInt(c.querySelector('[data-dias]').value, 10) || 0, observacoes: c.querySelector('[data-obs]').value, itens
            };
            c.querySelectorAll('[data-pct]').forEach((x) => { corpo[x.dataset.pct] = S.num(x.value) || 0; });
            if (!corpo.orcamentoId) throw new Error('Escolha a obra.');
            if (!corpo.fornecedorId) throw new Error('Escolha o fornecedor.');
            if (!itens.length) throw new Error('Inclua ao menos um item.');
            b.disabled = true;
            const r = ct ? await S.put('contratos/' + ct.id, corpo) : await S.post('contratos', corpo);
            if (r.alertas && r.alertas.length) S.aviso('Atenção: o contrato passa do orçado em ' + r.alertas.map((a) => a.eap).join(', ') + '.', 'erro');
            S.aviso(ct ? 'Contrato alterado.' : 'Contrato nº ' + r.numero + ' criado' + (r.status === 'pendente' ? ' e enviado para autorização.' : '.'));
            S.substituir('contrato', { id: ct ? ct.id : r.id });
          } catch (e) { S.falhou(e); b.disabled = false; }
        }
      });
      desenhar();
    }
  });

  /* ---------- documento do contrato ---------- */
  S.autorizarContrato = (ct, depois) => S.acao({ titulo: 'Autorizar contrato nº ' + ct.numero, botao: 'Autorizar',
    texto: S.esc(ct.fornecedorNome || (ct.fornecedor && ct.fornecedor.nome) || '') + ' · <b>' + S.moeda(ct.valorTotal) + '</b>',
    executar: () => S.post('contratos/' + ct.id + '/autorizar'), sucesso: 'Contrato autorizado.', depois });
  S.reprovarContrato = (ct, depois) => S.acao({ titulo: 'Reprovar contrato nº ' + ct.numero, botao: 'Reprovar', perigo: true, motivo: 'obrigatorio',
    executar: (motivo) => S.post('contratos/' + ct.id + '/reprovar', { motivo }), sucesso: 'Contrato reprovado.', depois });
  S.autorizarAditivo = (contratoId, a, depois) => S.acao({ titulo: 'Autorizar aditivo nº ' + a.numero, botao: 'Autorizar',
    texto: S.esc(a.descricao) + '<br>Variação: <b>' + S.moeda(a.valor) + '</b>' + (a.novaDataFim ? ' · novo término ' + S.data(a.novaDataFim) : ''),
    executar: () => S.post('contratos/' + contratoId + '/aditivos/' + a.id + '/autorizar'), sucesso: 'Aditivo autorizado.', depois });
  S.reprovarAditivo = (contratoId, a, depois) => S.acao({ titulo: 'Reprovar aditivo nº ' + a.numero, botao: 'Reprovar', perigo: true, motivo: 'obrigatorio',
    executar: (motivo) => S.post('contratos/' + contratoId + '/aditivos/' + a.id + '/reprovar', { motivo }), sucesso: 'Aditivo reprovado.', depois });
  S.autorizarMedicao = (m, depois) => S.acao({ titulo: 'Autorizar medição nº ' + m.numero, botao: 'Autorizar',
    texto: 'Bruto <b>' + S.moeda(m.valorBruto) + '</b> · líquido <b>' + S.moeda(m.valorLiquido) + '</b>. Gera o título no contas a pagar.',
    executar: () => S.post('medicoes/' + m.id + '/autorizar'), sucesso: 'Medição autorizada.', depois });
  S.reprovarMedicao = (m, depois) => S.acao({ titulo: 'Reprovar medição nº ' + m.numero, botao: 'Reprovar', perigo: true, motivo: 'obrigatorio',
    executar: (motivo) => S.post('medicoes/' + m.id + '/reprovar', { motivo }), sucesso: 'Medição reprovada.', depois });

  S.registrar('contrato', {
    titulo: 'Contrato', menu: 'contratos',
    render: async (c, prm) => {
      const { contrato: ct } = await S.get('contratos/' + prm.id);
      const orc = await S.orcado(ct.orcamentoId);
      if (!c.vigente()) return;
      const f = ct.fornecedor || {};
      const r = ct.resumo;
      const acoes = [];
      if (ct.status === 'pendente') {
        if (S.podeAutorizar('contrato', ct.valorTotal)) acoes.push(S.botao('autorizar', 'Autorizar', { primario: true, icone: 'check' }));
        if (S.podeAutorizar('contrato', 0)) acoes.push(S.botao('reprovar', 'Reprovar', { perigo: true }));
      }
      if (S.podeEditar()) {
        if (['pendente', 'reprovado'].includes(ct.status)) acoes.push(S.botao('editar', ct.status === 'reprovado' ? 'Alterar e reenviar' : 'Alterar', { icone: 'editar' }));
        if (ct.status === 'autorizado') {
          acoes.push(S.botao('medir', 'Nova medição', { primario: true, icone: 'calculadora' }));
          acoes.push(S.botao('aditivo', 'Aditivo', { icone: 'mais' }));
          acoes.push(S.botao('encerrar', 'Encerrar contrato'));
        }
        if (['pendente', 'reprovado', 'autorizado'].includes(ct.status) && !ct.medicoes.some((m) => ['pendente', 'autorizada'].includes(m.status))) acoes.push(S.botao('cancelar', 'Cancelar', { perigo: true }));
      }
      acoes.push(S.botao('imprimir', 'Imprimir', { icone: 'imprimir' }));
      const pctTotal = ct.valorTotal ? r.valorMedido / ct.valorTotal * 100 : 0;
      c.innerHTML = S.cabecalho({ titulo: 'Contrato nº ' + ct.numero, status: S.status('contrato', ct.status), sub: S.esc(f.nome || '') + ' · ' + S.esc(S.nomeObra(ct.orcamentoId)), acoes: acoes.join('') }) +
        (ct.status === 'reprovado' && ct.motivoReprovacao ? '<p class="supr-nota erro">Reprovado: ' + S.esc(ct.motivoReprovacao) + '</p>' : '') +
        '<div class="supr-cards">' +
        '<div class="supr-card"><span class="rotulo">Valor do contrato</span><span class="valor">' + S.moeda(ct.valorTotal) + '</span><span class="det">' + ct.aditivos.filter((a) => a.status === 'autorizado').length + ' aditivo(s)</span></div>' +
        '<div class="supr-card"><span class="rotulo">Medido</span><span class="valor">' + S.moeda(r.valorMedido) + '</span><span class="det">' + S.pct(pctTotal) + ' executado</span></div>' +
        '<div class="supr-card"><span class="rotulo">Saldo a medir</span><span class="valor">' + S.moeda(r.saldo) + '</span></div>' +
        '<div class="supr-card"><span class="rotulo">Caução retida</span><span class="valor">' + S.moeda(r.retencaoAcumulada) + '</span><span class="det">' + (r.caucaoLiberada ? 'liberada' : S.pct(ct.retencaoPercentual) + ' de cada medição') + '</span></div>' +
        '<div class="supr-card"><span class="rotulo">Líquido a pagar (medições)</span><span class="valor">' + S.moeda(r.liquidoMedido) + '</span></div></div>' +
        S.ficha([
          ['Contratado', S.esc(f.nome || '') + (f.documento ? '<small class="supr-sub">' + S.esc(S.documento(f.documento)) + '</small>' : '')],
          ['Tipo', S.esc(TIPOS[ct.tipo] || ct.tipo)], ['Vigência', S.data(ct.dataInicio) + ' a ' + S.data(ct.dataFim)], ['Assinatura', S.data(ct.dataAssinatura)],
          ['Retenções', ['Caução ' + S.pct(ct.retencaoPercentual), ct.inssPercentual ? 'INSS ' + S.pct(ct.inssPercentual) : '', ct.issPercentual ? 'ISS ' + S.pct(ct.issPercentual) : '',
            ct.irPercentual ? 'IR ' + S.pct(ct.irPercentual) : '', ct.pccPercentual ? 'PIS/COFINS/CSLL ' + S.pct(ct.pccPercentual) : ''].filter(Boolean).join(' · ')],
          ['Pagamento', ct.diasPagamento + ' dia(s) após a medição'],
          ['Autorização', ct.autorizadoEm ? S.esc(ct.autorizadoPor || '') + ' em ' + S.dataHora(ct.autorizadoEm) : 'Aguardando'],
          ['Objeto', S.esc(ct.objeto), true], ['Observações', S.esc(ct.observacoes || ''), true]
        ]) +
        S.secao('Itens', S.tabela([
          { t: 'EAP', v: (i) => { const sv = S.servicoPorId(orc, i.servicoId); return '<span class="supr-codigo" title="' + S.esc(S.nomeServico(orc, i.servicoId)) + '">' + S.esc(sv ? sv.eap : '—') + '</span>'; }, c: 'min' },
          { t: 'Descrição', v: (i) => S.esc(i.descricao) + (i.aditivoId ? '<small>incluído por aditivo</small>' : '') },
          { t: 'Un.', v: (i) => S.esc(i.unidade || ''), c: 'min' },
          { t: 'Contratado', v: (i) => S.qtd(i.quantidade), c: 'num' },
          { t: 'Medido', v: (i) => S.qtd(i.medido) + (i.medidoPendente > 1e-6 ? '<small>+ ' + S.qtd(i.medidoPendente) + ' a autorizar</small>' : ''), c: 'num' },
          { t: 'Saldo', v: (i) => '<b>' + S.qtd(i.saldo) + '</b>', c: 'num' },
          { t: 'Preço unit.', v: (i) => S.moeda(i.precoUnitario), c: 'num' },
          { t: 'Valor', v: (i) => S.moeda(i.valorTotal), c: 'num' },
          { t: 'Executado', v: (i) => S.pct(i.quantidade ? i.medido / i.quantidade * 100 : 0), c: 'num' }
        ], ct.itens)) +
        S.secao('Medições', S.tabela([
          { t: 'Nº', v: (m) => String(m.numero), c: 'min' },
          { t: 'Período', v: (m) => (m.periodoInicio ? S.data(m.periodoInicio) + ' a ' + S.data(m.periodoFim) : '—'), c: 'nowrap' },
          { t: 'Data', v: (m) => S.data(m.data), c: 'nowrap' },
          { t: 'Bruto', v: (m) => S.moeda(m.valorBruto), c: 'num' },
          { t: 'Retenções e descontos', v: (m) => S.moeda(m.valorBruto - m.valorLiquido), c: 'num' },
          { t: 'Líquido', v: (m) => S.moeda(m.valorLiquido), c: 'num' },
          { t: 'Vencimento', v: (m) => S.data(m.dataVencimento), c: 'nowrap' },
          { t: 'Situação', v: (m) => S.status('medicao', m.status) }
        ], ct.medicoes, { id: (m) => 'm:' + m.id, vazio: 'Nenhuma medição.' })) +
        S.secao('Aditivos', S.tabela([
          { t: 'Nº', v: (a) => String(a.numero), c: 'min' },
          { t: 'Justificativa', v: (a) => S.esc(a.descricao) + '<small>' + a.itens.map((i) => S.esc(i.descricao) + ': ' + (i.quantidade > 0 ? '+' : '') + S.qtd(i.quantidade) + ' ' + S.esc(i.unidade || '')).join(' · ') + '</small>' },
          { t: 'Variação', v: (a) => S.moeda(a.valor), c: 'num' },
          { t: 'Novo término', v: (a) => S.data(a.novaDataFim), c: 'nowrap' },
          { t: 'Situação', v: (a) => S.status('aditivo', a.status) + (a.motivoReprovacao ? '<small>' + S.esc(a.motivoReprovacao) + '</small>' : '') },
          { t: '', v: (a) => (a.status === 'pendente' ? (S.podeAutorizar('contrato', Math.abs(a.valor)) ? S.botao('aut-aditivo', 'Autorizar', { dados: 'data-id="' + S.esc(a.id) + '"' }) : '') +
            (S.podeAutorizar('contrato', 0) ? S.botao('rep-aditivo', 'Reprovar', { perigo: true, dados: 'data-id="' + S.esc(a.id) + '"' }) : '') : ''), c: 'acoes' }
        ], ct.aditivos, { vazio: 'Nenhum aditivo.' })) +
        (ct.titulos.length ? S.secao('Contas a pagar', S.tabela([
          { t: 'Documento', v: (t) => S.esc(t.documento) },
          { t: 'Vencimento', v: (t) => S.data(t.dataVencimento), c: 'nowrap' },
          { t: 'Valor', v: (t) => S.moeda(t.valor), c: 'num' },
          { t: 'Situação', v: (t) => S.status('titulo', t.status === 'aberto' && t.dataVencimento < S.hoje() ? 'vencido' : t.status) }
        ], ct.titulos)) : '') +
        S.secao('Histórico', S.historico(ct.historico));

      S.aoAbrirLinha(c, (id) => S.ir('medicao', { id: id.slice(2) }));
      c.addEventListener('click', (ev) => {
        const b = ev.target.closest('[data-acao]');
        if (!b) return;
        const acao = b.dataset.acao;
        if (acao === 'autorizar') S.autorizarContrato({ ...ct, fornecedorNome: f.nome });
        else if (acao === 'reprovar') S.reprovarContrato(ct);
        else if (acao === 'editar') S.ir('contrato-form', { id: ct.id });
        else if (acao === 'imprimir') window.print();
        else if (acao === 'medir') novaMedicao(ct);
        else if (acao === 'aditivo') novoAditivo(ct, orc);
        else if (acao === 'aut-aditivo') S.autorizarAditivo(ct.id, ct.aditivos.find((a) => a.id === b.dataset.id));
        else if (acao === 'rep-aditivo') S.reprovarAditivo(ct.id, ct.aditivos.find((a) => a.id === b.dataset.id));
        else if (acao === 'cancelar') S.acao({ titulo: 'Cancelar contrato nº ' + ct.numero, botao: 'Cancelar contrato', perigo: true, motivo: 'obrigatorio',
          executar: (motivo) => S.post('contratos/' + ct.id + '/cancelar', { motivo }), sucesso: 'Contrato cancelado.' });
        else if (acao === 'encerrar') S.acao({ titulo: 'Encerrar contrato nº ' + ct.numero, botao: 'Encerrar', motivo: 'opcional',
          texto: 'O saldo a medir (' + S.moeda(r.saldo) + ') deixa de ser comprometido.' + (r.retencaoAcumulada > 0 ? ' A caução retida de <b>' + S.moeda(r.retencaoAcumulada) + '</b> pode ser liberada agora como título a pagar.' : ''),
          extra: r.retencaoAcumulada > 0 ? '<label class="check" style="margin-bottom:10px"><input type="checkbox" data-liberar checked>Liberar a caução</label>' +
            '<label class="campo">Vencimento da caução<input type="date" data-venc value="' + S.somarDias(S.hoje(), ct.diasPagamento || 0) + '"></label>' : '',
          executar: (motivo, corpo) => {
            const lib = corpo.querySelector('[data-liberar]');
            return S.post('contratos/' + ct.id + '/encerrar', { motivo, liberarCaucao: lib ? lib.checked : false, vencimentoCaucao: lib ? corpo.querySelector('[data-venc]').value : null });
          }, sucesso: 'Contrato encerrado.' });
      });
    }
  });

  function novaMedicao(ct) {
    const itens = ct.itens.filter((i) => i.quantidade > 0);
    const valores = (corpo) => {
      let bruto = 0;
      corpo.querySelectorAll('[data-med]').forEach((x) => {
        const it = itens.find((i) => i.id === x.dataset.med);
        const q = S.num(x.value) || 0;
        bruto += q * it.precoUnitario;
        x.closest('tr').querySelector('[data-valor-linha]').textContent = S.moeda(q * it.precoUnitario);
      });
      const desc = S.num(corpo.querySelector('[data-descontos]').value) || 0;
      const r = (p) => S.arred(bruto * (p || 0) / 100, 2);
      const v = { bruto: S.arred(bruto, 2), ret: r(ct.retencaoPercentual), inss: r(ct.inssPercentual), iss: r(ct.issPercentual), ir: r(ct.irPercentual), pcc: r(ct.pccPercentual), desc };
      v.liq = S.arred(v.bruto - v.ret - v.inss - v.iss - v.ir - v.pcc - v.desc, 2);
      corpo.querySelector('[data-resumo]').innerHTML = '<div class="supr-totais"><div>Bruto medido <strong>' + S.moeda(v.bruto) + '</strong></div>' +
        (v.ret ? '<div>Caução (' + S.pct(ct.retencaoPercentual) + ') <strong>− ' + S.moeda(v.ret) + '</strong></div>' : '') +
        (v.inss ? '<div>INSS <strong>− ' + S.moeda(v.inss) + '</strong></div>' : '') + (v.iss ? '<div>ISS <strong>− ' + S.moeda(v.iss) + '</strong></div>' : '') +
        (v.ir ? '<div>IR <strong>− ' + S.moeda(v.ir) + '</strong></div>' : '') + (v.pcc ? '<div>PIS/COFINS/CSLL <strong>− ' + S.moeda(v.pcc) + '</strong></div>' : '') +
        (v.desc ? '<div>Outros descontos <strong>− ' + S.moeda(v.desc) + '</strong></div>' : '') +
        '<div class="total">Líquido a pagar <strong>' + S.moeda(v.liq) + '</strong></div></div>';
    };
    S.dialogo({
      titulo: 'Nova medição — contrato nº ' + ct.numero, tamanho: 'xl', botao: 'Salvar medição',
      corpo: '<div class="grade" style="margin-bottom:12px"><label class="campo">Período: início<input type="date" data-ini></label>' +
        '<label class="campo">Período: fim<input type="date" data-fim value="' + S.hoje() + '"></label>' +
        '<label class="campo">Data da medição<input type="date" data-data value="' + S.hoje() + '"></label>' +
        '<label class="campo">Vencimento<input type="date" data-venc value="' + S.somarDias(S.hoje(), ct.diasPagamento || 0) + '"></label>' +
        '<label class="campo">Outros descontos (R$)<input inputmode="decimal" data-descontos placeholder="Ex.: material fornecido"></label></div>' +
        S.tabela([
          { t: 'Descrição', v: (i) => S.esc(i.descricao) },
          { t: 'Un.', v: (i) => S.esc(i.unidade || ''), c: 'min' },
          { t: 'Contratado', v: (i) => S.qtd(i.quantidade), c: 'num' },
          { t: 'Medido antes', v: (i) => S.qtd(i.medido + i.medidoPendente), c: 'num' },
          { t: 'Saldo', v: (i) => S.qtd(i.saldo), c: 'num' },
          { t: 'Esta medição', v: (i) => '<input class="num" inputmode="decimal" data-med="' + S.esc(i.id) + '"' + (i.saldo > 1e-6 ? '' : ' disabled') + '>' +
            (i.saldo > 1e-6 ? '<button type="button" class="supr-link" data-tudo="' + S.esc(i.id) + '" style="font-size:11px;display:block;margin-left:auto">saldo</button>' : ''), c: 'num' },
          { t: 'Preço unit.', v: (i) => S.moeda(i.precoUnitario), c: 'num' },
          { t: 'Valor', v: () => '<span data-valor-linha>R$ 0,00</span>', c: 'num' }
        ], itens) + '<div data-resumo></div><label class="campo largo" style="margin-top:12px">Observações<textarea rows="2" data-obs></textarea></label>',
      aoAbrir: (corpo) => {
        corpo.addEventListener('input', () => valores(corpo));
        corpo.addEventListener('click', (ev) => {
          const t = ev.target.closest('[data-tudo]');
          if (!t) return;
          const it = itens.find((i) => i.id === t.dataset.tudo);
          corpo.querySelector('[data-med="' + CSS.escape(it.id) + '"]').value = S.valorCampo(it.saldo);
          valores(corpo);
        });
        valores(corpo);
      },
      aoConfirmar: async (corpo) => {
        const lidos = Array.from(corpo.querySelectorAll('[data-med]')).map((x) => ({ contratoItemId: x.dataset.med, quantidade: S.num(x.value) || 0 })).filter((x) => x.quantidade > 0);
        if (!lidos.length) { S.aviso('Informe a quantidade medida de ao menos um item.', 'erro'); return false; }
        const r = await S.post('contratos/' + ct.id + '/medicoes', {
          periodoInicio: corpo.querySelector('[data-ini]').value || null, periodoFim: corpo.querySelector('[data-fim]').value || null,
          data: corpo.querySelector('[data-data]').value || null, dataVencimento: corpo.querySelector('[data-venc]').value || null,
          valorDescontos: S.num(corpo.querySelector('[data-descontos]').value) || 0, observacoes: corpo.querySelector('[data-obs]').value, itens: lidos
        });
        S.aviso('Medição nº ' + r.numero + ' ' + (r.status === 'autorizada' ? 'autorizada: título gerado no contas a pagar.' : 'enviada para autorização.'));
        return r;
      }
    }).resultado.then((r) => { if (r) S.ir('medicao', { id: r.id }); });
  }

  function novoAditivo(ct, orc) {
    let novos = [];
    const desenharNovos = (corpo) => {
      corpo.querySelector('[data-novos]').innerHTML = novos.length ? S.tabela([
        { t: 'Serviço', v: (n, k) => '<select data-n="servicoId" data-k="' + k + '" style="max-width:240px">' + S.opcoesServicos(orc, n.servicoId) + '</select>' },
        { t: 'Descrição', v: (n, k) => '<input data-n="descricao" data-k="' + k + '" value="' + S.esc(n.descricao) + '">' },
        { t: 'Un.', v: (n, k) => '<input data-n="unidade" data-k="' + k + '" value="' + S.esc(n.unidade) + '" style="width:56px">' },
        { t: 'Quantidade', v: (n, k) => '<input class="num" inputmode="decimal" data-n="quantidade" data-k="' + k + '" value="' + S.valorCampo(n.quantidade) + '">', c: 'num' },
        { t: 'Preço unit.', v: (n, k) => '<input class="num" inputmode="decimal" data-n="precoUnitario" data-k="' + k + '" value="' + S.valorCampo(n.precoUnitario, 6) + '">', c: 'num' }
      ], novos) : '';
    };
    const total = (corpo) => {
      let v = 0;
      corpo.querySelectorAll('[data-delta]').forEach((x) => { const it = ct.itens.find((i) => i.id === x.dataset.delta); v += (S.num(x.value) || 0) * it.precoUnitario; });
      for (const n of novos) v += (n.quantidade || 0) * (n.precoUnitario || 0);
      corpo.querySelector('[data-total]').innerHTML = 'Variação do contrato: <b class="' + (v < 0 ? 'supr-negativo' : '') + '">' + S.moeda(v) + '</b> · novo valor ' + S.moeda(ct.valorTotal + v);
    };
    S.dialogo({
      titulo: 'Aditivo ao contrato nº ' + ct.numero, tamanho: 'xl', botao: 'Salvar aditivo',
      corpo: '<div class="grade" style="margin-bottom:12px"><label class="campo largo">Justificativa<textarea rows="2" data-desc></textarea></label>' +
        '<label class="campo">Novo término (prazo)<input type="date" data-fim value="' + S.esc(ct.dataFim || '') + '"></label></div>' +
        '<h4 style="margin:0 0 6px;font-size:13px">Acréscimo (+) ou supressão (−) nos itens</h4>' + S.tabela([
          { t: 'Descrição', v: (i) => S.esc(i.descricao) },
          { t: 'Un.', v: (i) => S.esc(i.unidade || ''), c: 'min' },
          { t: 'Contratado', v: (i) => S.qtd(i.quantidade), c: 'num' },
          { t: 'Medido', v: (i) => S.qtd(i.medido + i.medidoPendente), c: 'num' },
          { t: 'Preço unit.', v: (i) => S.moeda(i.precoUnitario), c: 'num' },
          { t: '+ / − quantidade', v: (i) => '<input class="num" inputmode="decimal" data-delta="' + S.esc(i.id) + '" placeholder="0">', c: 'num' }
        ], ct.itens) +
        '<div class="supr-barra" style="margin-top:12px"><b style="font-size:13px">Itens novos</b><span class="espaco"></span><button type="button" class="btn btn-ghost btn-sm" data-mais>' + S.ic('mais') + 'Item novo</button></div>' +
        '<div data-novos></div><p class="supr-nota" data-total style="margin-top:12px"></p>',
      aoAbrir: (corpo) => {
        corpo.addEventListener('click', (ev) => {
          if (!ev.target.closest('[data-mais]')) return;
          novos.push({ servicoId: '', descricao: '', unidade: 'vb', quantidade: 1, precoUnitario: 0 });
          desenharNovos(corpo);
          total(corpo);
        });
        corpo.addEventListener('input', (ev) => {
          const t = ev.target;
          if (t.dataset.n) { const n = novos[Number(t.dataset.k)]; n[t.dataset.n] = ['quantidade', 'precoUnitario'].includes(t.dataset.n) ? S.num(t.value) : t.value; }
          total(corpo);
        });
        corpo.addEventListener('change', (ev) => {
          const t = ev.target;
          if (t.dataset.n === 'servicoId') {
            const n = novos[Number(t.dataset.k)];
            n.servicoId = t.value;
            const sv = S.servicoPorId(orc, t.value);
            if (sv && !n.descricao) { n.descricao = S.nome(sv.nome); n.unidade = sv.unidade; desenharNovos(corpo); }
          }
        });
        total(corpo);
      },
      aoConfirmar: async (corpo) => {
        const descricao = corpo.querySelector('[data-desc]').value.trim();
        if (!descricao) { S.aviso('Informe a justificativa do aditivo.', 'erro'); return false; }
        const itens = Array.from(corpo.querySelectorAll('[data-delta]')).map((x) => ({ contratoItemId: x.dataset.delta, quantidade: S.num(x.value) || 0 })).filter((x) => x.quantidade !== 0)
          .concat(novos.filter((n) => n.quantidade).map((n) => ({ servicoId: n.servicoId, descricao: n.descricao, unidade: n.unidade, quantidade: n.quantidade, precoUnitario: n.precoUnitario || 0 })));
        const fim = corpo.querySelector('[data-fim]').value;
        const r = await S.post('contratos/' + ct.id + '/aditivos', { descricao, novaDataFim: fim && fim !== ct.dataFim ? fim : null, itens });
        S.aviso('Aditivo nº ' + r.numero + (r.status === 'autorizado' ? ' aplicado ao contrato.' : ' enviado para autorização.'));
        return r;
      }
    }).resultado.then((r) => { if (r) S.recarregar(); });
  }

  /* ---------- boletim de medição ---------- */
  S.registrar('medicao', {
    titulo: 'Boletim de medição', menu: 'contratos',
    render: async (c, prm) => {
      const { medicao: m } = await S.get('medicoes/' + prm.id);
      const orc = await S.orcado(m.orcamentoId);
      if (!c.vigente()) return;
      const ct = m.contrato;
      const f = m.fornecedor || {};
      const acoes = [];
      if (m.status === 'pendente') {
        if (S.podeAutorizar('medicao', m.valorBruto)) acoes.push(S.botao('autorizar', 'Autorizar', { primario: true, icone: 'check' }));
        if (S.podeAutorizar('medicao', 0)) acoes.push(S.botao('reprovar', 'Reprovar', { perigo: true }));
      }
      if (S.podeEditar() && ['pendente', 'autorizada'].includes(m.status) && ct.status !== 'encerrado') acoes.push(S.botao('cancelar', 'Cancelar', { perigo: true }));
      acoes.push(S.botao('contrato', 'Ver contrato', { icone: 'contrato' }));
      acoes.push(S.botao('imprimir', 'Imprimir', { icone: 'imprimir' }));
      const medidos = m.itens.filter((i) => i.atual > 0 || i.anterior > 0);
      c.innerHTML = S.cabecalho({ titulo: 'Medição nº ' + m.numero + ' · contrato nº ' + ct.numero, status: S.status('medicao', m.status),
        sub: S.esc(f.nome || '') + ' · ' + S.esc(S.nomeObra(m.orcamentoId)), acoes: acoes.join('') }) +
        (m.motivoReprovacao ? '<p class="supr-nota erro">Reprovada: ' + S.esc(m.motivoReprovacao) + '</p>' : '') +
        S.ficha([
          ['Contratado', S.esc(f.nome || '') + (f.documento ? '<small class="supr-sub">' + S.esc(S.documento(f.documento)) + '</small>' : '')],
          ['Obra', S.esc(S.nomeObra(m.orcamentoId))], ['Período', m.periodoInicio ? S.data(m.periodoInicio) + ' a ' + S.data(m.periodoFim) : '—'],
          ['Data da medição', S.data(m.data)], ['Vencimento', S.data(m.dataVencimento)], ['Medido por', S.esc(m.criadoPorNome || m.criadoPorEmail)],
          ['Autorização', m.autorizadoEm ? S.esc(m.autorizadoPor || '') + ' em ' + S.dataHora(m.autorizadoEm) : 'Aguardando'],
          ['Objeto do contrato', S.esc(ct.objeto), true], ['Observações', S.esc(m.observacoes || ''), true]
        ]) +
        S.secao('Itens medidos', S.tabela([
          { t: 'EAP', v: (i) => { const sv = S.servicoPorId(orc, i.servicoId); return '<span class="supr-codigo">' + S.esc(sv ? sv.eap : '—') + '</span>'; }, c: 'min' },
          { t: 'Descrição', v: (i) => S.esc(i.descricao) },
          { t: 'Un.', v: (i) => S.esc(i.unidade || ''), c: 'min' },
          { t: 'Contratado', v: (i) => S.qtd(i.quantidadeContratada), c: 'num' },
          { t: 'Anterior', v: (i) => S.qtd(i.anterior), c: 'num' },
          { t: 'Esta medição', v: (i) => '<b>' + S.qtd(i.atual) + '</b>', c: 'num' },
          { t: 'Acumulado', v: (i) => S.qtd(i.acumulado) + '<small>' + S.pct(i.quantidadeContratada ? i.acumulado / i.quantidadeContratada * 100 : 0) + '</small>', c: 'num' },
          { t: 'Preço unit.', v: (i) => S.moeda(i.precoUnitario), c: 'num' },
          { t: 'Valor', v: (i) => S.moeda(i.valor), c: 'num' }
        ], medidos) + '<div class="supr-totais"><div>Bruto medido <strong>' + S.moeda(m.valorBruto) + '</strong></div>' +
          [['Caução (' + S.pct(ct.retencaoPercentual) + ')', m.valorRetencao], ['INSS', m.valorInss], ['ISS', m.valorIss], ['IR', m.valorIr], ['PIS/COFINS/CSLL', m.valorPcc], ['Outros descontos', m.valorDescontos]]
            .filter((x) => x[1]).map((x) => '<div>' + x[0] + ' <strong>− ' + S.moeda(x[1]) + '</strong></div>').join('') +
          '<div class="total">Líquido a pagar <strong>' + S.moeda(m.valorLiquido) + '</strong></div></div>') +
        (m.titulos.length ? S.secao('Contas a pagar', S.tabela([
          { t: 'Documento', v: (t) => S.esc(t.documento) }, { t: 'Vencimento', v: (t) => S.data(t.dataVencimento), c: 'nowrap' },
          { t: 'Valor', v: (t) => S.moeda(t.valor), c: 'num' }, { t: 'Situação', v: (t) => S.status('titulo', t.status === 'aberto' && t.dataVencimento < S.hoje() ? 'vencido' : t.status) }
        ], m.titulos)) : '') +
        '<div class="supr-duas supr-assinaturas"><div>' + S.esc(S.parametro('empresa_nome') || 'Contratante') + '</div><div>' + S.esc(f.nome || 'Contratado') + '</div></div>' +
        S.secao('Histórico', S.historico(m.historico));
      c.addEventListener('click', (ev) => {
        const b = ev.target.closest('[data-acao]');
        if (!b) return;
        const acao = b.dataset.acao;
        if (acao === 'autorizar') S.autorizarMedicao(m);
        else if (acao === 'reprovar') S.reprovarMedicao(m);
        else if (acao === 'contrato') S.ir('contrato', { id: ct.id });
        else if (acao === 'imprimir') window.print();
        else if (acao === 'cancelar') S.acao({ titulo: 'Cancelar medição nº ' + m.numero, botao: 'Cancelar medição', perigo: true, motivo: 'obrigatorio',
          texto: m.status === 'autorizada' ? 'O título desta medição no contas a pagar também será cancelado.' : '',
          executar: (motivo) => S.post('medicoes/' + m.id + '/cancelar', { motivo }), sucesso: 'Medição cancelada.' });
      });
    }
  });
})();
