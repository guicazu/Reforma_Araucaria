/* Pedidos de compra: lista, documento e formulário (compra direta a partir dos itens autorizados
   das solicitações, ou alteração de pedido pendente/reprovado). O documento autoriza (alçada),
   manda ao fornecedor (e-mail com PDF ou link), lança a nota fiscal, encerra saldo e cancela. */
(function () {
  'use strict';
  const S = window.Supr;
  const filtro = { situacao: 'abertos', busca: '' };
  const ABERTOS = ['pendente', 'autorizado', 'parcial'];

  S.registrar('pedidos', {
    titulo: 'Pedidos de compra', subtitulo: 'Autorização, envio ao fornecedor e acompanhamento das entregas', lista: true,
    render: async (c) => {
      const obra = S.obraAtual();
      const { pedidos } = await S.get('pedidos?obra=' + encodeURIComponent(obra));
      if (!c.vigente()) return;
      const conta = (f) => pedidos.filter(f).length;
      const grupos = [
        ['abertos', 'Em aberto', conta((p) => ABERTOS.includes(p.status))],
        ['pendente', 'Aguardando autorização', conta((p) => p.status === 'pendente')],
        ['receber', 'A receber', conta((p) => p.status === 'autorizado' || p.status === 'parcial')],
        ['atrasados', 'Atrasados', conta((p) => p.atrasado)],
        ['entregue', 'Entregues', conta((p) => p.status === 'entregue')],
        ['', 'Todos', pedidos.length]
      ];
      c.innerHTML = '<div class="supr-barra">' + S.busca(filtro.busca, 'Nº, fornecedor ou item') + S.chips(grupos, filtro.situacao) + '<span class="espaco"></span>' +
        (S.podeEditar() ? S.botao('novo', 'Compra direta', { primario: true, icone: 'mais', titulo: 'Pedido sem cotação, a partir dos itens autorizados' }) : '') + '</div><div data-tabela></div>';
      const desenhar = () => {
        const f = filtro.situacao;
        const linhas = pedidos.filter((p) => (!f ? true : f === 'abertos' ? ABERTOS.includes(p.status) : f === 'receber' ? ['autorizado', 'parcial'].includes(p.status)
          : f === 'atrasados' ? p.atrasado : p.status === f) && S.combina(filtro.busca, [p.numero, p.fornecedorNome, p.resumo]));
        c.querySelector('[data-tabela]').innerHTML = S.tabela([
          { t: 'Nº', v: (p) => '<b>' + p.numero + '</b>', c: 'min' },
          { t: 'Data', v: (p) => S.data(p.data), c: 'nowrap' },
          ...(obra ? [] : [{ t: 'Obra', v: (p) => S.esc(S.nomeObra(p.orcamentoId)) }]),
          { t: 'Fornecedor', v: (p) => S.esc(p.fornecedorNome) + '<small>' + S.esc(S.nome(p.resumo || '')) + '</small>' },
          { t: 'Entrega', v: (p) => S.data(p.dataEntrega) + (p.atrasado ? '<small class="supr-negativo">atrasado</small>' : ''), c: 'nowrap' },
          { t: 'Entregue', v: (p) => (['autorizado', 'parcial', 'entregue', 'encerrado'].includes(p.status) ? p.percentualEntregue + '%' : '—'), c: 'num' },
          { t: 'Valor', v: (p) => S.moeda(p.valorTotal), c: 'num' },
          { t: 'Situação', v: (p) => '<span class="supr-tags">' + S.status('pedido', p.status) + (p.confirmadoEm ? S.tag('Confirmado', 'verde', 'Fornecedor confirmou em ' + S.dataHora(p.confirmadoEm))
            : p.enviadoEm ? S.tag('Enviado', 'cinza', 'Enviado em ' + S.dataHora(p.enviadoEm)) : '') + '</span>' }
        ], linhas, { id: (p) => p.id, classeLinha: (p) => (p.atrasado ? 'alerta' : ''),
          vazio: pedidos.length ? 'Nenhum pedido com esse filtro.' : '<strong>Nenhum pedido ainda</strong>Pedidos nascem do mapa de cotação ou da compra direta.' });
      };
      c.querySelector('[data-busca]').addEventListener('input', (ev) => { filtro.busca = ev.target.value; desenhar(); });
      c.querySelector('[data-chips]').addEventListener('click', (ev) => {
        const b = ev.target.closest('button[data-valor]');
        if (!b) return;
        filtro.situacao = b.dataset.valor;
        c.querySelectorAll('[data-chips] button').forEach((x) => x.classList.toggle('ativo', x === b));
        desenhar();
      });
      c.addEventListener('click', (ev) => { if (ev.target.closest('[data-acao="novo"]')) S.ir('pedido-form', {}); });
      S.aoAbrirLinha(c, (id) => S.ir('pedido', { id }));
      desenhar();
    }
  });

  /* ---------- documento ---------- */
  S.autorizarPedido = (p, depois) => S.acao({
    titulo: 'Autorizar pedido nº ' + p.numero, botao: 'Autorizar',
    texto: S.esc(p.fornecedorNome || (p.fornecedor && p.fornecedor.nome) || '') + ' · <b>' + S.moeda(p.valorTotal) + '</b>',
    executar: () => S.post('pedidos/' + p.id + '/autorizar'), sucesso: 'Pedido nº ' + p.numero + ' autorizado.', depois
  });
  S.reprovarPedido = (p, depois) => S.acao({
    titulo: 'Reprovar pedido nº ' + p.numero, botao: 'Reprovar', perigo: true, motivo: 'obrigatorio', rotuloMotivo: 'Motivo da reprovação',
    executar: (motivo) => S.post('pedidos/' + p.id + '/reprovar', { motivo }), sucesso: 'Pedido reprovado.', depois
  });

  S.registrar('pedido', {
    titulo: 'Pedido de compra', menu: 'pedidos',
    render: async (c, prm) => {
      const { pedido: p } = await S.get('pedidos/' + prm.id);
      const orc = await S.orcado(p.orcamentoId);
      if (!c.vigente()) return;
      const f = p.fornecedor || {};
      const acoes = [];
      const ativo = ['autorizado', 'parcial'].includes(p.status);
      if (p.status === 'pendente') {
        if (S.podeAutorizar('pedido', p.valorTotal)) acoes.push(S.botao('autorizar', 'Autorizar', { primario: true, icone: 'check' }));
        if (S.podeAutorizar('pedido', 0)) acoes.push(S.botao('reprovar', 'Reprovar', { perigo: true }));
      }
      if (ativo && S.podeEditar('notas')) acoes.push(S.botao('nota', 'Lançar nota fiscal', { primario: true, icone: 'nota' }));
      if (S.podeEditar()) {
        if (['pendente', 'reprovado'].includes(p.status)) acoes.push(S.botao('editar', p.status === 'reprovado' ? 'Alterar e reenviar' : 'Alterar', { icone: 'editar' }));
        if (ativo) {
          acoes.push(S.botao('enviar', p.enviadoEm ? 'Reenviar ao fornecedor' : 'Enviar ao fornecedor', { icone: 'email' }));
          acoes.push(S.botao('link', 'Copiar link', { icone: 'link', titulo: 'Link para o fornecedor ver e confirmar o pedido' }));
        }
      }
      acoes.push(S.botao('pdf', 'PDF', { icone: 'baixar' }));
      if (S.podeEditar()) {
        if (ativo && p.notas.some((n) => n.status === 'lancada')) acoes.push(S.botao('encerrar', 'Encerrar saldo', { titulo: 'O que falta entregar volta para o saldo das solicitações' }));
        if (['pendente', 'reprovado', 'autorizado'].includes(p.status) && !p.notas.some((n) => n.status === 'lancada')) acoes.push(S.botao('cancelar', 'Cancelar', { perigo: true }));
      }
      const tags = [S.status('pedido', p.status)];
      if (p.atrasado) tags.push(S.tag('Entrega atrasada', 'vermelho'));
      if (p.confirmadoEm) tags.push(S.tag('Confirmado pelo fornecedor', 'verde', S.dataHora(p.confirmadoEm)));
      else if (p.enviadoEm) tags.push(S.tag('Enviado ao fornecedor', 'cinza', S.dataHora(p.enviadoEm)));
      const totalRecebido = p.itens.reduce((s, i) => s + i.recebido * i.precoUnitario, 0);
      c.innerHTML = S.cabecalho({ titulo: 'Pedido de compra nº ' + p.numero, status: '<span class="supr-tags">' + tags.join('') + '</span>',
        sub: S.esc(f.nome || '') + ' · ' + S.esc(S.nomeObra(p.orcamentoId)), acoes: acoes.join('') }) +
        (p.status === 'reprovado' && p.motivoReprovacao ? '<p class="supr-nota erro">Reprovado por ' + S.esc(p.autorizadoPor || '') + ': ' + S.esc(p.motivoReprovacao) + '</p>' : '') +
        S.ficha([
          ['Fornecedor', S.esc(f.nome || '') + (f.documento ? '<small class="supr-sub">' + S.esc(S.documento(f.documento)) + '</small>' : '')],
          ['Contato', S.esc([f.contato, f.telefone, f.email].filter(Boolean).join(' · ') || '—')],
          ['Obra', S.esc(S.nomeObra(p.orcamentoId))],
          ['Emissão', S.data(p.data)],
          ['Entrega até', S.data(p.dataEntrega)],
          ['Local de entrega', S.esc(p.localEntrega || '—')],
          ['Pagamento', S.esc(p.condicaoPagamento || 'A combinar') + (p.parcelas.length ? '<small class="supr-sub">' + S.esc(S.textoParcelas(p.parcelas)) + '</small>' : '')],
          ['Frete', p.frete ? (p.frete === 'CIF' ? 'CIF (por conta do fornecedor)' : 'FOB (por conta da obra)') : '—'],
          ['Comprador', S.esc(p.compradorNome || p.compradorEmail)],
          ['Autorização', p.autorizadoEm ? S.esc(p.autorizadoPor || '') + ' em ' + S.dataHora(p.autorizadoEm) : 'Aguardando'],
          ['Origem', p.cotacao ? '<button type="button" class="supr-link" data-ir="cotacao" data-id="' + S.esc(p.cotacao.id) + '">Cotação nº ' + p.cotacao.numero + '</button>' : 'Compra direta'],
          ['Observações', S.esc(p.observacoes || ''), true]
        ]) +
        S.secao('Itens', S.tabela([
          { t: '#', v: (i) => String(i.seq), c: 'min' },
          { t: 'Insumo', v: (i) => S.esc(S.nome(i.descricao)) + '<small>' + [i.insumoCodigo ? 'Cód. ' + S.esc(i.insumoCodigo) : '', i.marca ? 'Marca ' + S.esc(i.marca) : '',
            i.solicitacao ? '<button type="button" class="supr-link" data-ir="solicitacao" data-id="' + S.esc(i.solicitacao.solicitacaoId) + '">SC nº ' + i.solicitacao.numero + '</button>' : ''].filter(Boolean).join(' · ') + '</small>' },
          { t: 'Un.', v: (i) => S.esc(i.unidade), c: 'min' },
          { t: 'Quantidade', v: (i) => S.qtd(i.quantidade) + (i.quantidadeEncerrada > 1e-6 ? '<small>' + S.qtd(i.quantidadeEncerrada) + ' encerrado</small>' : ''), c: 'num' },
          { t: 'Preço unit.', v: (i) => S.moeda(i.precoUnitario), c: 'num' },
          { t: 'Total', v: (i) => S.moeda(i.valorTotal), c: 'num' },
          { t: 'Entregue', v: (i) => S.qtd(i.recebido), c: 'num' },
          { t: 'Falta', v: (i) => '<b>' + S.qtd(i.saldo) + '</b>', c: 'num' },
          { t: 'Apropriação', v: (i) => S.textoApropriacao(orc, i.apropriacoes) }
        ], p.itens) + '<div class="supr-totais"><div>Itens <strong>' + S.moeda(p.valorItens) + '</strong></div>' +
          (p.valorFrete ? '<div>Frete <strong>' + S.moeda(p.valorFrete) + '</strong></div>' : '') +
          (p.valorDesconto ? '<div>Desconto <strong>− ' + S.moeda(p.valorDesconto) + '</strong></div>' : '') +
          '<div class="total">Total do pedido <strong>' + S.moeda(p.valorTotal) + '</strong></div>' +
          (totalRecebido ? '<div>Entregue (pelo preço do pedido) <strong>' + S.moeda(totalRecebido) + '</strong></div>' : '') + '</div>') +
        S.secao('Notas fiscais', S.tabela([
          { t: 'Nota', v: (n) => 'NF ' + S.esc(n.numero) + (n.serie ? '-' + S.esc(n.serie) : ''), c: 'nowrap' },
          { t: 'Emissão', v: (n) => S.data(n.dataEmissao), c: 'nowrap' },
          { t: 'Entrada', v: (n) => S.data(n.dataEntrada), c: 'nowrap' },
          { t: 'Valor', v: (n) => S.moeda(n.valorTotal), c: 'num' },
          { t: 'Situação', v: (n) => S.status('nota', n.status) }
        ], p.notas, { id: (n) => 'nota:' + n.id, vazio: 'Nenhuma entrega registrada.' })) +
        (p.titulos.length ? S.secao('Contas a pagar', S.tabela([
          { t: 'Documento', v: (t) => S.esc(t.documento) + ' · ' + t.parcela + '/' + t.totalParcelas },
          { t: 'Vencimento', v: (t) => S.data(t.dataVencimento), c: 'nowrap' },
          { t: 'Valor', v: (t) => S.moeda(t.valor), c: 'num' },
          { t: 'Situação', v: (t) => S.status('titulo', t.status === 'aberto' && t.dataVencimento < S.hoje() ? 'vencido' : t.status) }
        ], p.titulos)) : '') +
        S.secao('Histórico', S.historico(p.historico));

      S.aoAbrirLinha(c, (id) => { if (id.indexOf('nota:') === 0) S.ir('nota', { id: id.slice(5) }); });
      c.addEventListener('click', async (ev) => {
        const ir = ev.target.closest('[data-ir]');
        if (ir) { S.ir(ir.dataset.ir, { id: ir.dataset.id }); return; }
        const b = ev.target.closest('[data-acao]');
        if (!b) return;
        const acao = b.dataset.acao;
        if (acao === 'autorizar') S.autorizarPedido({ ...p, fornecedorNome: f.nome });
        else if (acao === 'reprovar') S.reprovarPedido(p);
        else if (acao === 'editar') S.ir('pedido-form', { id: p.id });
        else if (acao === 'nota') S.ir('nota-form', { obra: p.orcamentoId, fornecedor: p.fornecedorId, pedido: p.id });
        else if (acao === 'pdf') window.open('/api/suprimentos/pedidos/' + encodeURIComponent(p.id) + '/pdf', '_blank');
        else if (acao === 'link') {
          await S.copiar(p.linkConfirmacao, 'Link copiado: o fornecedor vê o pedido e confirma o recebimento.');
          if (!p.enviadoEm) S.post('pedidos/' + p.id + '/envio-manual', { meio: 'link copiado' }).catch(() => {});
        } else if (acao === 'enviar') {
          S.acao({ titulo: 'Enviar pedido nº ' + p.numero + ' ao fornecedor', botao: 'Enviar e-mail',
            texto: 'Vai por e-mail com o PDF em anexo e o link para o fornecedor confirmar o recebimento do pedido.',
            extra: '<label class="campo">E-mail do fornecedor<input type="email" data-email value="' + S.esc(f.email || '') + '"></label>' +
              '<p class="supr-dica" style="margin-top:8px">Sem e-mail? Use "Copiar link" e mande por WhatsApp.</p>',
            executar: async (motivo, corpo) => { await S.post('pedidos/' + p.id + '/enviar', { email: corpo.querySelector('[data-email]').value.trim() }); },
            sucesso: 'Pedido enviado ao fornecedor.' });
        } else if (acao === 'encerrar') {
          S.acao({ titulo: 'Encerrar saldo do pedido nº ' + p.numero, botao: 'Encerrar saldo', motivo: 'obrigatorio',
            texto: 'O que ainda falta entregar deixa de ser comprado e volta para o saldo das solicitações.',
            executar: (motivo) => S.post('pedidos/' + p.id + '/encerrar', { motivo }), sucesso: 'Saldo do pedido encerrado.' });
        } else if (acao === 'cancelar') {
          S.acao({ titulo: 'Cancelar pedido nº ' + p.numero, botao: 'Cancelar pedido', perigo: true, motivo: 'obrigatorio',
            texto: 'Os itens voltam para o saldo das solicitações.' + (p.enviadoEm ? ' <b>O pedido já foi enviado: avise o fornecedor.</b>' : ''),
            executar: (motivo) => S.post('pedidos/' + p.id + '/cancelar', { motivo }), sucesso: 'Pedido cancelado.' });
        }
      });
    }
  });

  /* ---------- formulário: compra direta ou alteração ---------- */
  S.registrar('pedido-form', {
    titulo: 'Pedido de compra', menu: 'pedidos',
    render: async (c, prm) => {
      if (!S.podeEditar()) { c.innerHTML = '<div class="supr-nota">Seu acesso é só de consulta.</div>'; return; }
      const edicao = prm.id ? (await S.get('pedidos/' + prm.id)).pedido : null;
      const [fornecedores, condicoes] = await Promise.all([S.fornecedores(), S.condicoes()]);
      if (!c.vigente()) return;
      let obraId = edicao ? edicao.orcamentoId : (prm.obra || S.obraAtual());
      let itens = [];
      let orc = null;
      const marcados = new Set(prm.itens || []);
      const condInicial = edicao ? edicao.condicaoPagamentoId : '';
      c.innerHTML = S.cabecalho({ titulo: edicao ? 'Alterar pedido nº ' + edicao.numero : 'Compra direta',
        sub: edicao ? (edicao.status === 'reprovado' ? 'Reprovado: ' + S.esc(edicao.motivoReprovacao || '') + '. Ao salvar, volta para autorização.' : 'Alteração antes da autorização.')
          : 'Pedido sem cotação, a partir dos itens autorizados das solicitações.' }) +
        '<div class="supr-form">' +
        '<label class="duplo">Obra<select data-obra' + (edicao ? ' disabled' : '') + '>' + S.opcoesObras(obraId) + '</select></label>' +
        '<label class="duplo">Fornecedor<select data-fornecedor' + (edicao ? ' disabled' : '') + '>' + S.opcoesFornecedores(fornecedores, edicao ? edicao.fornecedorId : (prm.fornecedor || '')) + '</select>' +
        (edicao || !S.podeEditar('cadastros') ? '' : '<button type="button" class="supr-link" data-acao="novo-forn" style="align-self:flex-start;font-size:11.5px">Cadastrar fornecedor</button>') + '</label>' +
        '<label>Condição de pagamento<select data-condicao>' + S.opcoesCondicoes(condicoes, condInicial, edicao && edicao.condicaoPagamento && !condInicial ? edicao.condicaoPagamento : 'A combinar') + '</select></label>' +
        '<label>Entrega até<input type="date" data-entrega value="' + S.esc(edicao ? edicao.dataEntrega || '' : S.somarDias(S.hoje(), 7)) + '"></label>' +
        '<label class="duplo">Local de entrega<input data-local value="' + S.esc(edicao ? edicao.localEntrega || '' : S.parametro('local_entrega_padrao') || '') + '" placeholder="Endereço da obra"></label>' +
        '<label>Frete<select data-frete><option value="">—</option><option value="CIF"' + (edicao && edicao.frete === 'CIF' ? ' selected' : '') + '>CIF (por conta do fornecedor)</option>' +
        '<option value="FOB"' + (edicao && edicao.frete === 'FOB' ? ' selected' : '') + '>FOB (por conta da obra)</option></select></label>' +
        '<label>Valor do frete (R$)<input inputmode="decimal" data-valor-frete value="' + S.valorCampo(edicao ? edicao.valorFrete || '' : '', 2) + '"></label>' +
        '<label>Desconto (R$)<input inputmode="decimal" data-desconto value="' + S.valorCampo(edicao ? edicao.valorDesconto || '' : '', 2) + '"></label>' +
        '<label class="largo">Observações (vão no pedido)<textarea rows="2" data-obs maxlength="2000">' + S.esc(edicao ? edicao.observacoes || '' : '') + '</textarea></label></div>' +
        S.secao('Itens', '<div data-itens></div>') + '<div data-totais></div>' +
        '<div class="supr-rodape"><button type="button" class="btn btn-ghost" data-voltar>Cancelar</button><button type="button" class="btn btn-primary" data-acao="salvar">' +
        S.ic('salvar') + (edicao ? 'Salvar alterações' : 'Criar pedido') + '</button></div>';

      function desenharItens() {
        const alvo = c.querySelector('[data-itens]');
        if (edicao) {
          alvo.innerHTML = S.tabela([
            { t: 'Insumo', v: (i) => S.esc(S.nome(i.descricao)) + '<small>' + S.textoApropriacao(orc, i.apropriacoes) + '</small>' },
            { t: 'Un.', v: (i) => S.esc(i.unidade), c: 'min' },
            { t: 'Quantidade', v: (i) => '<input class="num" inputmode="decimal" data-qtd="' + S.esc(i.id) + '" value="' + S.valorCampo(i.quantidade) + '">', c: 'num' },
            { t: 'Preço unit. (R$)', v: (i) => '<input class="num" inputmode="decimal" data-preco="' + S.esc(i.id) + '" value="' + S.valorCampo(i.precoUnitario, 6) + '">', c: 'num' },
            { t: 'Marca', v: (i) => '<input data-marca="' + S.esc(i.id) + '" value="' + S.esc(i.marca || '') + '" style="width:120px">' }
          ], edicao.itens);
        } else {
          if (!obraId) { alvo.innerHTML = '<div class="supr-vazio">Escolha a obra.</div>'; return; }
          alvo.innerHTML = S.tabela([
            { t: '<input type="checkbox" data-todos>', v: (i) => '<input type="checkbox" data-item="' + S.esc(i.id) + '"' + (marcados.has(i.id) ? ' checked' : '') + '>', c: 'min' },
            { t: 'SC', v: (i) => 'nº ' + i.solicitacaoNumero, c: 'min' },
            { t: 'Insumo', v: (i) => S.esc(S.nome(i.descricao)) + '<small>' + S.textoApropriacao(orc, i.apropriacoes) + (i.emCotacao > 1e-6 ? ' · ' + S.qtd(i.emCotacao) + ' em cotação' : '') + '</small>' },
            { t: 'Un.', v: (i) => S.esc(i.unidade), c: 'min' },
            { t: 'Saldo', v: (i) => S.qtd(i.saldoParaCotar), c: 'num' },
            { t: 'Quantidade', v: (i) => '<input class="num" inputmode="decimal" data-qtd="' + S.esc(i.id) + '" value="' + S.valorCampo(i.saldoParaCotar) + '">', c: 'num' },
            { t: 'Preço unit. (R$)', v: (i) => '<input class="num" inputmode="decimal" data-preco="' + S.esc(i.id) + '" value="' + S.valorCampo(i.precoOrcado || '', 2) + '">' +
              (i.precoOrcado ? '<small>orçado ' + S.moeda(i.precoOrcado) + '</small>' : ''), c: 'num' }
          ], itens, { vazio: 'Nenhum item autorizado com saldo nesta obra.' });
        }
        totais();
      }
      function lerItens() {
        const r = [];
        if (edicao) {
          for (const i of edicao.itens) {
            r.push({ id: i.id, quantidade: S.num(c.querySelector('[data-qtd="' + CSS.escape(i.id) + '"]').value),
              precoUnitario: S.num(c.querySelector('[data-preco="' + CSS.escape(i.id) + '"]').value), marca: c.querySelector('[data-marca="' + CSS.escape(i.id) + '"]').value.trim() });
          }
          return r;
        }
        for (const cb of c.querySelectorAll('[data-item]:checked')) {
          const id = cb.dataset.item;
          r.push({ solicitacaoItemId: id, quantidade: S.num(c.querySelector('[data-qtd="' + CSS.escape(id) + '"]').value),
            precoUnitario: S.num(c.querySelector('[data-preco="' + CSS.escape(id) + '"]').value) });
        }
        return r;
      }
      function totais() {
        let soma = 0, orcado = 0;
        for (const i of lerItens()) {
          if (i.quantidade > 0 && i.precoUnitario > 0) soma += i.quantidade * i.precoUnitario;
          const ref = edicao ? null : itens.find((x) => x.id === i.solicitacaoItemId);
          if (ref && i.quantidade > 0) orcado += i.quantidade * (ref.precoOrcado || 0);
        }
        const frete = S.num(c.querySelector('[data-valor-frete]').value) || 0;
        const desc = S.num(c.querySelector('[data-desconto]').value) || 0;
        const cond = condicoes.find((x) => x.id === c.querySelector('[data-condicao]').value);
        c.querySelector('[data-totais]').innerHTML = '<div class="supr-totais"><div>Itens <strong>' + S.moeda(soma) + '</strong></div>' +
          (frete ? '<div>Frete <strong>' + S.moeda(frete) + '</strong></div>' : '') + (desc ? '<div>Desconto <strong>− ' + S.moeda(desc) + '</strong></div>' : '') +
          '<div class="total">Total <strong>' + S.moeda(soma + frete - desc) + '</strong></div>' +
          (orcado ? '<div>Orçado <strong>' + S.moeda(orcado) + '</strong></div>' : '') +
          (cond ? '<div>Parcelas <strong>' + S.esc(S.textoParcelas(cond.parcelas)) + '</strong></div>' : '') + '</div>';
      }
      async function carregar() {
        if (!obraId) { desenharItens(); return; }
        c.querySelector('[data-itens]').innerHTML = S.carregando();
        const [r, o] = await Promise.all([edicao ? null : S.get('solicitacoes/itens-para-compra?obra=' + encodeURIComponent(obraId)), S.orcado(obraId)]);
        orc = o;
        if (r) itens = r.itens.filter((i) => i.saldoParaCotar > 1e-6);
        if (c.vigente()) desenharItens();
      }
      c.addEventListener('input', totais);
      c.addEventListener('change', (ev) => {
        if (ev.target.matches('[data-obra]')) { obraId = ev.target.value; marcados.clear(); carregar().catch(S.falhou); return; }
        if (ev.target.matches('[data-item]')) { if (ev.target.checked) marcados.add(ev.target.dataset.item); else marcados.delete(ev.target.dataset.item); }
        totais();
      });
      S.ligarMarcarTodos(c);
      c.addEventListener('click', async (ev) => {
        if (ev.target.closest('[data-acao="novo-forn"]')) {
          const id = await S.novoFornecedor();
          if (id) { c.querySelector('[data-fornecedor]').innerHTML = S.opcoesFornecedores(await S.fornecedores(true), id); }
          return;
        }
        const b = ev.target.closest('[data-acao="salvar"]');
        if (!b) return;
        const lidos = lerItens();
        const condicaoId = c.querySelector('[data-condicao]').value;
        const corpo = {
          condicaoPagamentoId: condicaoId || null,
          condicaoPagamento: condicaoId ? null : (edicao && !edicao.condicaoPagamentoId ? edicao.condicaoPagamento : null),
          dataEntrega: c.querySelector('[data-entrega]').value || null, localEntrega: c.querySelector('[data-local]').value,
          frete: c.querySelector('[data-frete]').value || null, valorFrete: S.num(c.querySelector('[data-valor-frete]').value) || 0,
          valorDesconto: S.num(c.querySelector('[data-desconto]').value) || 0, observacoes: c.querySelector('[data-obs]').value, itens: lidos
        };
        try {
          if (!edicao) {
            corpo.orcamentoId = obraId;
            corpo.fornecedorId = c.querySelector('[data-fornecedor]').value;
            if (!corpo.orcamentoId) throw new Error('Escolha a obra.');
            if (!corpo.fornecedorId) throw new Error('Escolha o fornecedor.');
            if (!lidos.length) throw new Error('Marque ao menos um item.');
          }
          for (const i of lidos) {
            if (!(i.quantidade > 0)) throw new Error('Informe as quantidades.');
            if (!(i.precoUnitario > 0)) throw new Error('Informe os preços unitários.');
          }
          b.disabled = true;
          const r = edicao ? await S.put('pedidos/' + edicao.id, corpo) : await S.post('pedidos', corpo);
          S.aviso(edicao ? 'Pedido alterado.' : 'Pedido nº ' + r.numero + ' criado' + (r.status === 'pendente' ? ' e enviado para autorização.' : '.'));
          S.substituir('pedido', { id: edicao ? edicao.id : r.id });
        } catch (e) { S.falhou(e); b.disabled = false; }
      });
      await carregar();
    }
  });
})();
