/* Painel de Suprimentos: o que precisa de ação (autorizações, itens a comprar, cotações abertas,
   entregas atrasadas e próximas, contas a pagar) e o resumo de custos da obra escolhida. */
(function () {
  'use strict';
  const S = window.Supr;

  S.registrar('painel', {
    titulo: 'Painel de suprimentos', subtitulo: 'Pendências de compra, entregas e pagamentos', lista: true,
    render: async (c) => {
      const obra = S.obraAtual();
      const p = await S.get('painel?obra=' + encodeURIComponent(obra));
      if (!c.vigente()) return;
      const pend = p.pendentes;
      const totalPend = pend.solicitacoes + pend.pedidos + pend.contratos + pend.aditivos + pend.medicoes;
      // cartão vira link só para o módulo que a pessoa pode ver
      const card = (aba, rotulo, icone, valor, det, classe) => {
        const pode = aba === 'autorizacoes' || S.pode(aba, 'visualizar');
        const tag = pode ? 'button type="button"' : 'div';
        return '<' + tag + ' class="supr-card' + (classe ? ' ' + classe : '') + '"' + (pode ? ' data-ir="' + aba + '"' : '') + '>' +
          '<span class="rotulo">' + S.ic(icone) + S.esc(rotulo) + '</span><span class="valor">' + valor + '</span><span class="det">' + det + '</span>' + (pode ? '</button>' : '</div>');
      };
      const atalhos = [
        S.podeEditar('solicitacoes') ? S.botao('nova-sc', 'Nova solicitação', { primario: true, icone: 'mais' }) : '',
        S.podeEditar('cotacoes') ? S.botao('nova-cot', 'Nova cotação', { icone: 'cotacao' }) : '',
        S.podeEditar('notas') ? S.botao('nova-nf', 'Lançar nota fiscal', { icone: 'nota' }) : '',
        S.podeEditar('contratos') ? S.botao('novo-ct', 'Novo contrato', { icone: 'contrato' }) : ''
      ].join('');
      let resumo = '';
      if (p.resumoObra && !p.resumoObra.erro) {
        const r = p.resumoObra;
        const pct = (v) => (r.orcado > 0 ? Math.min(100, Math.max(0, v / r.orcado * 100)) : 0);
        resumo = S.secao('Custos da obra', '<div class="supr-cards">' +
          card('acompanhamento', 'Orçado', 'orcamento', S.moeda(r.orcado), 'V' + r.versao.numero + (r.referenciaSinapi ? ' · SINAPI ' + S.esc(r.referenciaSinapi) : '')) +
          card('acompanhamento', 'Realizado', 'nota', S.moeda(r.realizado), S.pct(pct(r.realizado)) + ' do orçado') +
          card('acompanhamento', 'Comprometido', 'suprimentos', S.moeda(r.comprometido), S.pct(pct(r.comprometido)) + ' do orçado') +
          card('acompanhamento', 'Saldo', 'grafico', S.moeda(r.saldo), r.emAprovacao ? S.moeda(r.emAprovacao) + ' em aprovação' : 'a comprar e contratar', r.saldo < 0 ? 'perigo' : '') + '</div>' +
          '<div class="supr-progresso"><span class="realizado" style="width:' + pct(r.realizado) + '%"></span><span class="comprometido" style="width:' + Math.min(100 - pct(r.realizado), pct(r.comprometido)) + '%"></span></div>' +
          (r.avisos || []).map((a) => '<p class="supr-nota alerta" style="margin-top:10px">' + S.esc(a) + '</p>').join(''));
      } else if (!obra) {
        resumo = '<p class="supr-nota">Escolha uma obra no seletor acima para ver o orçado × comprometido × realizado.</p>';
      }
      const listaPedidos = (lista, vazio) => S.tabela([
        { t: 'Pedido', v: (x) => 'nº ' + x.numero, c: 'min' },
        { t: 'Fornecedor', v: (x) => S.esc(x.fornecedorNome) + (obra ? '' : '<small>' + S.esc(S.nomeObra(x.orcamentoId)) + '</small>') },
        { t: 'Entrega', v: (x) => S.data(x.dataEntrega), c: 'nowrap' },
        { t: 'Valor', v: (x) => S.moeda(x.valorTotal), c: 'num' },
        { t: 'Situação', v: (x) => S.status('pedido', x.status) }
      ], lista, { id: (x) => 'pedido:' + x.id, vazio });

      c.innerHTML = (atalhos ? '<div class="supr-atalhos">' + atalhos + '</div>' : '') + '<div class="supr-cards">' +
        card('autorizacoes', 'Aguardando autorização', 'autorizacao', String(totalPend),
          [pend.solicitacoes ? pend.solicitacoes + ' SC' : '', pend.pedidos ? pend.pedidos + ' pedido(s)' : '', pend.contratos ? pend.contratos + ' contrato(s)' : '',
            pend.aditivos ? pend.aditivos + ' aditivo(s)' : '', pend.medicoes ? pend.medicoes + ' medição(ões)' : ''].filter(Boolean).join(' · ') || 'nada pendente', totalPend ? 'alerta' : '') +
        card('solicitacoes', 'Itens aguardando compra', 'prancheta', String(p.aguardandoCompra.itens),
          p.aguardandoCompra.itens ? p.aguardandoCompra.solicitacoes + ' solicitação(ões)' + (p.aguardandoCompra.maisUrgente ? ' · mais urgente ' + S.data(p.aguardandoCompra.maisUrgente) : '') : 'tudo comprado') +
        card('cotacoes', 'Cotações abertas', 'cotacao', String(p.cotacoesAbertas.length),
          p.cotacoesAbertas.length ? p.cotacoesAbertas.reduce((s, x) => s + x.respostas, 0) + ' resposta(s) de ' + p.cotacoesAbertas.reduce((s, x) => s + x.fornecedores, 0) + ' convite(s)' : 'nenhuma') +
        card('pedidos', 'Entregas atrasadas', 'relogio', String(p.pedidosAtrasados.length), p.entregasProximas.length + ' entrega(s) nos próximos 7 dias', p.pedidosAtrasados.length ? 'perigo' : '') +
        (S.pode('financeiro', 'visualizar') ? '<button type="button" class="supr-card' + (p.titulos.qtdVencido ? ' perigo' : '') + '" data-ir-financeiro><span class="rotulo">' + S.ic('financeiro') + 'Contas a pagar</span>' +
        '<span class="valor">' + S.moeda(p.titulos.proximos) + '</span><span class="det">' + p.titulos.qtdProximos + ' título(s) em 7 dias' +
        (p.titulos.qtdVencido ? ' · ' + S.moeda(p.titulos.vencido) + ' vencido' : '') + '</span></button>' : '') + '</div>' +
        resumo +
        '<div class="supr-duas">' + S.secao('Entregas atrasadas', listaPedidos(p.pedidosAtrasados, 'Nenhuma entrega atrasada.')) +
        S.secao('Entregas nos próximos 7 dias', listaPedidos(p.entregasProximas, 'Nenhuma entrega prevista.')) + '</div>' +
        (p.cotacoesAbertas.length ? S.secao('Cotações abertas', S.tabela([
          { t: 'Cotação', v: (x) => 'nº ' + x.numero, c: 'min' },
          ...(obra ? [] : [{ t: 'Obra', v: (x) => S.esc(S.nomeObra(x.orcamentoId)) }]),
          { t: 'Respostas', v: (x) => x.respostas + ' de ' + x.fornecedores, c: 'num' },
          { t: 'Prazo', v: (x) => S.data(x.prazoResposta) + (x.prazoResposta && x.prazoResposta < p.hoje ? '<small class="supr-negativo">vencido</small>' : ''), c: 'nowrap' },
          { t: 'Rodada', v: (x) => x.rodada + 'ª', c: 'num' }
        ], p.cotacoesAbertas, { id: (x) => 'cotacao:' + x.id })) : '');

      S.aoAbrirLinha(c, (chave) => { const i = chave.indexOf(':'); S.ir(chave.slice(0, i), { id: chave.slice(i + 1) }); });
      c.addEventListener('click', (ev) => {
        if (ev.target.closest('[data-ir-financeiro]')) { if (window.ErpNav) window.ErpNav.abrir('financeiro'); return; }
        const ir = ev.target.closest('[data-ir]');
        if (ir) { S.ir(ir.dataset.ir, {}); return; }
        const b = ev.target.closest('[data-acao]');
        if (!b) return;
        const destino = { 'nova-sc': 'solicitacao-form', 'nova-cot': 'cotacao-form', 'nova-nf': 'nota-form', 'novo-ct': 'contrato-form' }[b.dataset.acao];
        if (destino) S.ir(destino, {});
      });
    }
  });
})();
