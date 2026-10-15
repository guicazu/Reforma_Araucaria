/* Autorizações: tudo que aguarda aprovação (solicitações, pedidos, contratos, aditivos e medições),
   com os botões só para quem tem alçada para o valor. Cada linha abre o documento. */
(function () {
  'use strict';
  const S = window.Supr;

  function nomesAlcadas(alcadas) {
    const nomes = { solicitacao: 'solicitações', pedido: 'pedidos', contrato: 'contratos e aditivos', medicao: 'medições' };
    const partes = Object.keys(nomes).filter((k) => k in alcadas).map((k) => nomes[k] + (alcadas[k] == null ? ' (sem limite)' : ' (até ' + S.moeda(alcadas[k]) + ')'));
    return partes.length ? 'Sua alçada: ' + partes.join(' · ') + '.' : 'Você não tem alçada de autorização: só consulta. O administrador define as alçadas em Cadastros › Alçadas.';
  }

  S.registrar('autorizacoes', {
    titulo: 'Autorizações', subtitulo: 'Documentos aguardando aprovação, conforme a alçada de cada usuário', lista: true,
    render: async (c) => {
      const obra = S.obraAtual();
      const r = await S.get('autorizacoes?obra=' + encodeURIComponent(obra));
      if (!c.vigente()) return;
      const total = r.solicitacoes.length + r.pedidos.length + r.contratos.length + r.aditivos.length + r.medicoes.length;
      const colObra = obra ? [] : [{ t: 'Obra', v: (x) => S.esc(S.nomeObra(x.orcamentoId)) }];
      const botoes = (tipo, x) => (x.podeAutorizar
        ? S.botao('autorizar', 'Autorizar', { primario: true, dados: 'data-tipo="' + tipo + '" data-id="' + S.esc(x.id) + '"' }) +
          S.botao('reprovar', 'Reprovar', { perigo: true, dados: 'data-tipo="' + tipo + '" data-id="' + S.esc(x.id) + '"' })
        : '<span class="supr-dica">Fora da sua alçada</span>');
      c.innerHTML = '<p class="supr-nota">' + S.esc(nomesAlcadas(r.alcadas)) + '</p>' +
        (total ? '' : '<div class="supr-vazio"><strong>Nada aguardando autorização</strong>Quando houver solicitação, pedido, contrato, aditivo ou medição pendente, aparece aqui.</div>') +
        (r.solicitacoes.length ? S.secao('Solicitações de compra <span class="supr-sub">' + r.solicitacoes.length + '</span>', S.tabela([
          { t: 'Nº', v: (x) => '<b>' + x.numero + '</b>', c: 'min' }, { t: 'Data', v: (x) => S.data(x.data), c: 'nowrap' }, ...colObra,
          { t: 'Solicitante', v: (x) => S.esc(x.solicitanteNome || '') + (x.observacoes ? '<small>' + S.esc(x.observacoes) + '</small>' : '') },
          { t: 'Itens', v: (x) => String(x.itens), c: 'num' }, { t: 'Estimado', v: (x) => S.moeda(x.valor), c: 'num' },
          { t: 'Orçamento', v: (x) => (x.excedeOrcamento ? S.tag('Acima do orçado', 'amarelo') : S.tag('Dentro do saldo', 'verde')) },
          { t: '', v: (x) => botoes('solicitacao', x), c: 'acoes' }
        ], r.solicitacoes, { id: (x) => 'solicitacao:' + x.id })) : '') +
        (r.pedidos.length ? S.secao('Pedidos de compra <span class="supr-sub">' + r.pedidos.length + '</span>', S.tabela([
          { t: 'Nº', v: (x) => '<b>' + x.numero + '</b>', c: 'min' }, { t: 'Data', v: (x) => S.data(x.data), c: 'nowrap' }, ...colObra,
          { t: 'Fornecedor', v: (x) => S.esc(x.fornecedorNome) + '<small>' + (x.cotacaoId ? 'Da cotação' : 'Compra direta') + ' · ' + S.esc(x.compradorNome || '') + '</small>' },
          { t: 'Itens', v: (x) => String(x.itens), c: 'num' }, { t: 'Valor', v: (x) => S.moeda(x.valor), c: 'num' },
          { t: '', v: (x) => botoes('pedido', x), c: 'acoes' }
        ], r.pedidos, { id: (x) => 'pedido:' + x.id })) : '') +
        (r.contratos.length ? S.secao('Contratos <span class="supr-sub">' + r.contratos.length + '</span>', S.tabela([
          { t: 'Nº', v: (x) => '<b>' + x.numero + '</b>', c: 'min' }, ...colObra,
          { t: 'Fornecedor', v: (x) => S.esc(x.fornecedorNome) + '<small>' + S.esc(x.objeto) + '</small>' },
          { t: 'Valor', v: (x) => S.moeda(x.valor), c: 'num' }, { t: '', v: (x) => botoes('contrato', x), c: 'acoes' }
        ], r.contratos, { id: (x) => 'contrato:' + x.id })) : '') +
        (r.aditivos.length ? S.secao('Aditivos de contrato <span class="supr-sub">' + r.aditivos.length + '</span>', S.tabela([
          { t: 'Contrato', v: (x) => 'nº ' + x.contratoNumero, c: 'min' }, { t: 'Aditivo', v: (x) => 'nº ' + x.numero, c: 'min' }, ...colObra,
          { t: 'Fornecedor', v: (x) => S.esc(x.fornecedorNome) + '<small>' + S.esc(x.descricao || '') + '</small>' },
          { t: 'Variação', v: (x) => S.moeda(x.valor), c: 'num' }, { t: 'Novo término', v: (x) => S.data(x.novaDataFim), c: 'nowrap' },
          { t: '', v: (x) => botoes('aditivo', x), c: 'acoes' }
        ], r.aditivos, { id: (x) => 'contrato:' + x.contratoId })) : '') +
        (r.medicoes.length ? S.secao('Medições <span class="supr-sub">' + r.medicoes.length + '</span>', S.tabela([
          { t: 'Contrato', v: (x) => 'nº ' + x.contratoNumero, c: 'min' }, { t: 'Medição', v: (x) => 'nº ' + x.numero, c: 'min' }, ...colObra,
          { t: 'Fornecedor', v: (x) => S.esc(x.fornecedorNome) + '<small>' + (x.periodoInicio ? S.data(x.periodoInicio) + ' a ' + S.data(x.periodoFim) : S.data(x.data)) + '</small>' },
          { t: 'Bruto', v: (x) => S.moeda(x.valor), c: 'num' }, { t: 'Líquido', v: (x) => S.moeda(x.valorLiquido), c: 'num' },
          { t: '', v: (x) => botoes('medicao', x), c: 'acoes' }
        ], r.medicoes, { id: (x) => 'medicao:' + x.id })) : '');

      S.aoAbrirLinha(c, (chave) => { const i = chave.indexOf(':'); S.ir(chave.slice(0, i), { id: chave.slice(i + 1) }); });
      c.addEventListener('click', async (ev) => {
        const b = ev.target.closest('[data-acao][data-tipo]');
        if (!b) return;
        const { tipo, id } = b.dataset;
        const autorizar = b.dataset.acao === 'autorizar';
        try {
          if (tipo === 'solicitacao') {
            const { solicitacao } = await S.get('solicitacoes/' + id);
            if (autorizar) S.autorizarSolicitacao(solicitacao); else S.reprovarSolicitacao(solicitacao);
          } else if (tipo === 'pedido') {
            const p = r.pedidos.find((x) => x.id === id);
            const dados = { id, numero: p.numero, valorTotal: p.valor, fornecedorNome: p.fornecedorNome };
            if (autorizar) S.autorizarPedido(dados); else S.reprovarPedido(dados);
          } else if (tipo === 'contrato') {
            const x = r.contratos.find((y) => y.id === id);
            const dados = { id, numero: x.numero, valorTotal: x.valor, fornecedorNome: x.fornecedorNome };
            if (autorizar) S.autorizarContrato(dados); else S.reprovarContrato(dados);
          } else if (tipo === 'aditivo') {
            const a = r.aditivos.find((y) => y.id === id);
            if (autorizar) S.autorizarAditivo(a.contratoId, a); else S.reprovarAditivo(a.contratoId, a);
          } else if (tipo === 'medicao') {
            const m = r.medicoes.find((y) => y.id === id);
            const dados = { id, numero: m.numero, valorBruto: m.valor, valorLiquido: m.valorLiquido };
            if (autorizar) S.autorizarMedicao(dados); else S.reprovarMedicao(dados);
          }
        } catch (e) { S.falhou(e); }
      });
    }
  });
})();
