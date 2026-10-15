/* Financeiro › Contas a pagar: títulos gerados pelas notas fiscais (parcelas), pelas medições de
   contrato (valor líquido) e pela liberação de caução. Dá baixa (pagamento), estorna a baixa e muda o
   vencimento. Usa o núcleo de Suprimentos (js/suprimentos/nucleo.js) para API, janelas e formatação. */
(function () {
  'use strict';
  const S = window.Supr;
  const filtro = { situacao: 'aberto', busca: '', obra: null, de: '', ate: '' };
  const ORIGENS = { nota: 'Nota fiscal', medicao: 'Medição', caucao: 'Caução' };

  async function desenhar(area) {
    await S.iniciar();
    if (filtro.obra == null) filtro.obra = S.obraAtual();
    area.innerHTML = S.carregando();
    const r = await S.get('titulos?obra=' + encodeURIComponent(filtro.obra));
    const hoje = r.hoje;
    const situacao = (t) => (t.status === 'aberto' && t.dataVencimento < hoje ? 'vencido' : t.status);
    const conta = (s) => r.titulos.filter((t) => situacao(t) === s || (s === 'aberto' && situacao(t) === 'vencido')).length;
    const res = r.resumo;
    area.innerHTML = '<div class="supr-topo"><div class="supr-titulo"><h2>Contas a pagar</h2><p>Títulos das notas fiscais, medições de contrato e cauções liberadas</p></div>' +
      '<label class="supr-obra"><span>Obra</span><select data-obra>' + S.opcoesObras(filtro.obra, 'Todas as obras') + '</select></label></div>' +
      '<div class="supr-cards">' +
      '<div class="supr-card"><span class="rotulo">Em aberto</span><span class="valor">' + S.moeda(res.aberto) + '</span></div>' +
      '<div class="supr-card' + (res.vencido ? ' perigo' : '') + '"><span class="rotulo">Vencido</span><span class="valor">' + S.moeda(res.vencido) + '</span></div>' +
      '<div class="supr-card' + (res.venceHoje ? ' alerta' : '') + '"><span class="rotulo">Vence hoje</span><span class="valor">' + S.moeda(res.venceHoje) + '</span></div>' +
      '<div class="supr-card"><span class="rotulo">Próximos 7 dias</span><span class="valor">' + S.moeda(res.proximos7) + '</span></div>' +
      '<div class="supr-card"><span class="rotulo">Pago no mês</span><span class="valor">' + S.moeda(res.pagoNoMes) + '</span></div></div>' +
      '<div class="supr-barra">' + S.busca(filtro.busca, 'Fornecedor ou documento') +
      S.chips([['aberto', 'Em aberto', conta('aberto')], ['vencido', 'Vencidos', conta('vencido')], ['pago', 'Pagos', conta('pago')], ['cancelado', 'Cancelados', conta('cancelado')], ['', 'Todos', r.titulos.length]], filtro.situacao) +
      '<label class="supr-dica" style="display:inline-flex;gap:6px;align-items:center">Vencimento de <input type="date" data-de value="' + S.esc(filtro.de) + '" style="width:auto"></label>' +
      '<label class="supr-dica" style="display:inline-flex;gap:6px;align-items:center">até <input type="date" data-ate value="' + S.esc(filtro.ate) + '" style="width:auto"></label></div><div data-tabela></div>';

    const desenharTabela = () => {
      const linhas = r.titulos.filter((t) => {
        const s = situacao(t);
        if (filtro.situacao === 'aberto' && !['aberto', 'vencido'].includes(s)) return false;
        if (filtro.situacao && filtro.situacao !== 'aberto' && s !== filtro.situacao) return false;
        if (filtro.de && t.dataVencimento < filtro.de) return false;
        if (filtro.ate && t.dataVencimento > filtro.ate) return false;
        return S.combina(filtro.busca, [t.fornecedorNome, t.documento]);
      });
      const total = linhas.reduce((s, t) => s + t.valor, 0);
      area.querySelector('[data-tabela]').innerHTML = S.tabela([
        { t: 'Vencimento', v: (t) => S.data(t.dataVencimento), c: 'nowrap' },
        { t: 'Fornecedor', v: (t) => S.esc(t.fornecedorNome) + (filtro.obra ? '' : '<small>' + S.esc(S.nomeObra(t.orcamentoId)) + '</small>') },
        { t: 'Documento', v: (t) => S.esc(t.documento || '—') + (t.totalParcelas > 1 ? '<small>parcela ' + t.parcela + '/' + t.totalParcelas + '</small>' : '') },
        { t: 'Origem', v: (t) => S.esc(ORIGENS[t.origemTipo] || t.origemTipo) },
        { t: 'Valor', v: (t) => S.moeda(t.valor), c: 'num' },
        { t: 'Pago', v: (t) => (t.dataPagamento ? S.moeda(t.valorPago) + '<small>' + S.data(t.dataPagamento) + '</small>' : '—'), c: 'num' },
        { t: 'Situação', v: (t) => S.status('titulo', situacao(t)) },
        { t: '', v: (t) => (!S.podeEditar() ? '' : t.status === 'aberto'
          ? S.botao('pagar', 'Pagar', { primario: true, dados: 'data-id="' + S.esc(t.id) + '"' }) + S.botao('vencimento', 'Vencimento', { dados: 'data-id="' + S.esc(t.id) + '"' })
          : t.status === 'pago' ? S.botao('estornar', 'Estornar', { dados: 'data-id="' + S.esc(t.id) + '"' }) : ''), c: 'acoes' }
      ], linhas, { id: (t) => t.origemTipo + ':' + t.origemId, classeLinha: (t) => (situacao(t) === 'vencido' ? 'alerta' : ''),
        vazio: r.titulos.length ? 'Nenhum título com esse filtro.' : '<strong>Nenhum título</strong>As parcelas aparecem aqui quando uma nota fiscal é lançada ou uma medição é autorizada.',
        rodape: linhas.length ? '<tr><td colspan="4">' + linhas.length + ' título(s)</td><td class="num">' + S.moeda(total) + '</td><td colspan="3"></td></tr>' : '' });
    };
    area.querySelector('[data-busca]').addEventListener('input', (ev) => { filtro.busca = ev.target.value; desenharTabela(); });
    area.querySelector('[data-chips]').addEventListener('click', (ev) => {
      const b = ev.target.closest('button[data-valor]');
      if (!b) return;
      filtro.situacao = b.dataset.valor;
      area.querySelectorAll('[data-chips] button').forEach((x) => x.classList.toggle('ativo', x === b));
      desenharTabela();
    });
    area.querySelector('[data-de]').addEventListener('change', (ev) => { filtro.de = ev.target.value; desenharTabela(); });
    area.querySelector('[data-ate]').addEventListener('change', (ev) => { filtro.ate = ev.target.value; desenharTabela(); });
    area.querySelector('[data-obra]').addEventListener('change', (ev) => { filtro.obra = ev.target.value; desenhar(area).catch(S.falhou); });
    desenharTabela();
    return r;
  }

  let dadosAtuais = null;
  function abrirView() {
    const area = document.getElementById('finConteudo');
    if (!area) return;
    const nova = area.cloneNode(false);
    area.replaceWith(nova);
    desenhar(nova).then((r) => { dadosAtuais = r; }).catch((e) => { nova.innerHTML = '<div class="supr-nota erro">' + S.esc(e.message) + '</div>'; });
    nova.addEventListener('click', (ev) => {
      const b = ev.target.closest('[data-acao][data-id]');
      if (b && dadosAtuais) {
        const t = dadosAtuais.titulos.find((x) => x.id === b.dataset.id);
        const depois = () => abrirView();
        if (b.dataset.acao === 'pagar') {
          S.acao({ titulo: 'Pagar ' + (t.documento || 'título'), botao: 'Registrar pagamento', depois,
            texto: S.esc(t.fornecedorNome) + ' · vencimento ' + S.data(t.dataVencimento) + ' · <b>' + S.moeda(t.valor) + '</b>',
            extra: '<div class="grade"><label class="campo">Data do pagamento<input type="date" data-data value="' + S.hoje() + '"></label>' +
              '<label class="campo">Valor pago (R$)<input inputmode="decimal" data-valor value="' + S.valorCampo(t.valor, 2) + '"></label>' +
              '<label class="campo largo">Observação<input data-obs maxlength="500" placeholder="Banco, forma de pagamento, juros/desconto…"></label></div>',
            executar: (m, corpo) => S.post('titulos/' + t.id + '/pagar', { dataPagamento: corpo.querySelector('[data-data]').value || null,
              valorPago: S.num(corpo.querySelector('[data-valor]').value), observacoes: corpo.querySelector('[data-obs]').value }), sucesso: 'Pagamento registrado.' });
        } else if (b.dataset.acao === 'estornar') {
          S.acao({ titulo: 'Estornar pagamento', botao: 'Estornar', perigo: true, motivo: 'obrigatorio', depois,
            texto: S.esc(t.documento || '') + ' · pago ' + S.moeda(t.valorPago) + ' em ' + S.data(t.dataPagamento),
            executar: (motivo) => S.post('titulos/' + t.id + '/estornar', { motivo }), sucesso: 'Pagamento estornado.' });
        } else if (b.dataset.acao === 'vencimento') {
          S.acao({ titulo: 'Alterar vencimento', botao: 'Salvar', depois,
            extra: '<div class="grade"><label class="campo">Novo vencimento<input type="date" data-venc value="' + S.esc(t.dataVencimento) + '"></label>' +
              '<label class="campo largo">Observação<input data-obs maxlength="500" value="' + S.esc(t.observacoes || '') + '"></label></div>',
            executar: (m, corpo) => S.put('titulos/' + t.id, { dataVencimento: corpo.querySelector('[data-venc]').value, observacoes: corpo.querySelector('[data-obs]').value }),
            sucesso: 'Vencimento alterado.' });
        }
        return;
      }
      if (ev.target.closest('button, a, input, select, label')) return;
      const tr = ev.target.closest('tr[data-abrir]');
      if (!tr) return;
      // abre o documento de origem em Suprimentos
      const [origem, id] = tr.dataset.abrir.split(':');
      const tela = origem === 'nota' ? 'nota' : origem === 'medicao' ? 'medicao' : 'contrato';
      S.abrirDocumento(tela, { id });
    });
  }

  document.addEventListener('app:viewchange', (ev) => { if (ev.detail && ev.detail.view === 'financeiro') abrirView(); });
})();
