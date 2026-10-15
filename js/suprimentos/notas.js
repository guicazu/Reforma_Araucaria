/* Entrada de notas fiscais (recebimento): lista, documento e lançamento. O lançamento parte dos
   pedidos do fornecedor com saldo a entregar (entrega parcial ou total) e pode importar o XML da
   NF-e: fornecedor pelo CNPJ, número, série, chave, itens (casados com os itens do pedido pela
   descrição e quantidade), frete, IPI, ST, desconto e as duplicatas, que viram as parcelas. */
(function () {
  'use strict';
  const S = window.Supr;
  const filtro = { situacao: 'lancada', busca: '' };
  const TIPOS_DOC = { nfe: 'NF-e', nfse: 'NFS-e', recibo: 'Recibo', outro: 'Outro' };

  S.registrar('notas', {
    titulo: 'Notas fiscais de entrada', subtitulo: 'Recebimento dos pedidos: estoque da obra e contas a pagar', lista: true,
    render: async (c) => {
      const obra = S.obraAtual();
      const { notas } = await S.get('notas?obra=' + encodeURIComponent(obra));
      if (!c.vigente()) return;
      const conta = (s) => notas.filter((n) => n.status === s).length;
      c.innerHTML = '<div class="supr-barra">' + S.busca(filtro.busca, 'Número, chave ou fornecedor') +
        S.chips([['lancada', 'Lançadas', conta('lancada')], ['cancelada', 'Canceladas', conta('cancelada')], ['', 'Todas', notas.length]], filtro.situacao) +
        '<span class="espaco"></span>' + (S.podeEditar() ? S.botao('nova', 'Lançar nota fiscal', { primario: true, icone: 'mais' }) : '') + '</div><div data-tabela></div>';
      const desenhar = () => {
        const linhas = notas.filter((n) => (!filtro.situacao || n.status === filtro.situacao) && S.combina(filtro.busca, [n.numero, n.chaveAcesso, n.fornecedorNome]));
        c.querySelector('[data-tabela]').innerHTML = S.tabela([
          { t: 'Entrada', v: (n) => S.data(n.dataEntrada), c: 'nowrap' },
          { t: 'Documento', v: (n) => S.esc(TIPOS_DOC[n.tipoDocumento] || 'NF') + ' ' + S.esc(n.numero) + (n.serie ? '-' + S.esc(n.serie) : '') + '<small>emitida ' + S.data(n.dataEmissao) + '</small>', c: 'nowrap' },
          ...(obra ? [] : [{ t: 'Obra', v: (n) => S.esc(S.nomeObra(n.orcamentoId)) }]),
          { t: 'Fornecedor', v: (n) => S.esc(n.fornecedorNome) },
          { t: 'Pedidos', v: (n) => (n.pedidos ? 'nº ' + S.esc(String(n.pedidos).split(',').join(', ')) : 'Sem pedido') },
          { t: 'Valor', v: (n) => S.moeda(n.valorTotal), c: 'num' },
          { t: 'Situação', v: (n) => S.status('nota', n.status) }
        ], linhas, { id: (n) => n.id, vazio: notas.length ? 'Nenhuma nota com esse filtro.' : '<strong>Nenhuma nota lançada</strong>Lance a nota quando o material chegar: o pedido é baixado e as parcelas vão para o contas a pagar.' });
      };
      c.querySelector('[data-busca]').addEventListener('input', (ev) => { filtro.busca = ev.target.value; desenhar(); });
      c.querySelector('[data-chips]').addEventListener('click', (ev) => {
        const b = ev.target.closest('button[data-valor]');
        if (!b) return;
        filtro.situacao = b.dataset.valor;
        c.querySelectorAll('[data-chips] button').forEach((x) => x.classList.toggle('ativo', x === b));
        desenhar();
      });
      c.addEventListener('click', (ev) => { if (ev.target.closest('[data-acao="nova"]')) S.ir('nota-form', {}); });
      S.aoAbrirLinha(c, (id) => S.ir('nota', { id }));
      desenhar();
    }
  });

  /* ---------- documento ---------- */
  S.registrar('nota', {
    titulo: 'Nota fiscal de entrada', menu: 'notas',
    render: async (c, prm) => {
      const { nota: n } = await S.get('notas/' + prm.id);
      const orc = await S.orcado(n.orcamentoId);
      if (!c.vigente()) return;
      const f = n.fornecedor || {};
      const acoes = [];
      if (S.podeEditar() && n.status === 'lancada') acoes.push(S.botao('cancelar', 'Cancelar nota', { perigo: true }));
      acoes.push(S.botao('imprimir', 'Imprimir', { icone: 'imprimir' }));
      const doc = (TIPOS_DOC[n.tipoDocumento] || 'NF') + ' ' + n.numero + (n.serie ? '-' + n.serie : '');
      c.innerHTML = S.cabecalho({ titulo: doc, status: S.status('nota', n.status), sub: S.esc(f.nome || '') + ' · ' + S.esc(S.nomeObra(n.orcamentoId)), acoes: acoes.join('') }) +
        S.ficha([
          ['Fornecedor', S.esc(f.nome || '') + (f.documento ? '<small class="supr-sub">' + S.esc(S.documento(f.documento)) + '</small>' : '')],
          ['Obra', S.esc(S.nomeObra(n.orcamentoId))], ['Emissão', S.data(n.dataEmissao)], ['Entrada', S.data(n.dataEntrada)],
          ['Chave de acesso', n.chaveAcesso ? '<span class="supr-codigo">' + S.esc(n.chaveAcesso.replace(/(\d{4})(?=\d)/g, '$1 ')) + '</span>' : ''],
          ['Lançada por', S.esc(n.lancadoPorNome || n.lancadoPorEmail) + ' em ' + S.dataHora(n.criadoEm)],
          ['Estoque', n.entradaEstoque ? 'Materiais entraram no estoque da obra' : 'Sem entrada no estoque'],
          ['Observações', S.esc(n.observacoes || ''), true]
        ]) +
        S.secao('Itens', S.tabela([
          { t: '#', v: (i) => String(i.seq), c: 'min' },
          { t: 'Insumo', v: (i) => S.esc(S.nome(i.descricao)) + '<small>' + [i.descricaoFornecedor ? 'Na nota: ' + S.esc(i.descricaoFornecedor) : '', i.ncm ? 'NCM ' + S.esc(i.ncm) : '', i.cfop ? 'CFOP ' + S.esc(i.cfop) : ''].filter(Boolean).join(' · ') + '</small>' },
          { t: 'Pedido', v: (i) => (i.pedidoId ? '<button type="button" class="supr-link" data-pedido="' + S.esc(i.pedidoId) + '">nº ' + i.pedidoNumero + '</button>' : 'Sem pedido'), c: 'nowrap' },
          { t: 'Un.', v: (i) => S.esc(i.unidade), c: 'min' },
          { t: 'Quantidade', v: (i) => S.qtd(i.quantidade), c: 'num' },
          { t: 'Preço unit.', v: (i) => S.moeda(i.precoUnitario) + (i.precoPedido && Math.abs(i.precoPedido - i.precoUnitario) > 0.005 ? '<small class="supr-negativo">pedido ' + S.moeda(i.precoPedido) + '</small>' : ''), c: 'num' },
          { t: 'Total', v: (i) => S.moeda(i.valorTotal), c: 'num' },
          { t: 'Apropriação', v: (i) => S.textoApropriacao(orc, i.apropriacoes) }
        ], n.itens) + '<div class="supr-totais"><div>Produtos <strong>' + S.moeda(n.valorProdutos) + '</strong></div>' +
          [['Frete', n.valorFrete], ['IPI', n.valorIpi], ['ICMS-ST', n.valorIcmsSt], ['Outras despesas', n.valorOutras]].filter((x) => x[1]).map((x) => '<div>' + x[0] + ' <strong>' + S.moeda(x[1]) + '</strong></div>').join('') +
          (n.valorDesconto ? '<div>Desconto <strong>− ' + S.moeda(n.valorDesconto) + '</strong></div>' : '') +
          '<div class="total">Total da nota <strong>' + S.moeda(n.valorTotal) + '</strong></div></div>') +
        S.secao('Parcelas no contas a pagar', S.tabela([
          { t: 'Parcela', v: (t) => t.parcela + '/' + t.totalParcelas, c: 'min' },
          { t: 'Vencimento', v: (t) => S.data(t.dataVencimento), c: 'nowrap' },
          { t: 'Valor', v: (t) => S.moeda(t.valor), c: 'num' },
          { t: 'Pagamento', v: (t) => (t.dataPagamento ? S.data(t.dataPagamento) + ' · ' + S.moeda(t.valorPago) : '—'), c: 'nowrap' },
          { t: 'Situação', v: (t) => S.status('titulo', t.status === 'aberto' && t.dataVencimento < S.hoje() ? 'vencido' : t.status) }
        ], n.titulos, { vazio: 'Sem parcelas.' })) +
        (n.movimentos.length ? S.secao('Entrada no estoque', S.tabela([
          { t: 'Insumo', v: (m) => S.esc(S.nome(m.descricao)) },
          { t: 'Quantidade', v: (m) => S.qtd(m.quantidade) + ' ' + S.esc(m.unidade || ''), c: 'num' },
          { t: 'Custo unit. (com frete e impostos)', v: (m) => S.moeda(m.valorUnitario), c: 'num' },
          { t: 'Situação', v: (m) => (m.estornado ? S.tag('Estornado', 'cinza') : S.tag('No estoque', 'verde')) }
        ], n.movimentos)) : '') +
        S.secao('Histórico', S.historico(n.historico));
      c.addEventListener('click', (ev) => {
        const pd = ev.target.closest('[data-pedido]');
        if (pd) { S.ir('pedido', { id: pd.dataset.pedido }); return; }
        const b = ev.target.closest('[data-acao]');
        if (!b) return;
        if (b.dataset.acao === 'imprimir') window.print();
        if (b.dataset.acao === 'cancelar') {
          S.acao({ titulo: 'Cancelar ' + doc, botao: 'Cancelar nota', perigo: true, motivo: 'obrigatorio',
            texto: 'Estorna a entrega nos pedidos, a entrada no estoque e as parcelas em aberto. Não dá para cancelar se alguma parcela já foi paga ou se o material já saiu do estoque.',
            executar: (motivo) => S.post('notas/' + n.id + '/cancelar', { motivo }), sucesso: 'Nota cancelada.' });
        }
      });
    }
  });

  /* ---------- XML da NF-e ---------- */
  function lerXmlNfe(texto) {
    const xml = new DOMParser().parseFromString(texto, 'application/xml');
    if (xml.getElementsByTagName('parsererror').length) throw new Error('Arquivo XML inválido.');
    const um = (no, tag) => { const e = no && no.getElementsByTagName(tag)[0]; return e ? e.textContent.trim() : ''; };
    const inf = xml.getElementsByTagName('infNFe')[0];
    if (!inf) throw new Error('O arquivo não é o XML de uma NF-e (infNFe não encontrado).');
    const emit = inf.getElementsByTagName('emit')[0];
    const end = emit && emit.getElementsByTagName('enderEmit')[0];
    const total = inf.getElementsByTagName('ICMSTot')[0];
    const numero = (v) => { const n = Number(v); return Number.isFinite(n) ? n : 0; };
    const chave = um(xml, 'chNFe') || String(inf.getAttribute('Id') || '').replace(/\D/g, '');
    return {
      chave: chave.length === 44 ? chave : '',
      numero: um(inf.getElementsByTagName('ide')[0], 'nNF'),
      serie: um(inf.getElementsByTagName('ide')[0], 'serie'),
      emissao: (um(inf.getElementsByTagName('ide')[0], 'dhEmi') || um(inf.getElementsByTagName('ide')[0], 'dEmi')).slice(0, 10),
      emitente: {
        documento: um(emit, 'CNPJ') || um(emit, 'CPF'), nome: um(emit, 'xNome'), nomeFantasia: um(emit, 'xFant'), inscricaoEstadual: um(emit, 'IE'),
        telefone: um(end, 'fone'), endereco: [um(end, 'xLgr'), um(end, 'nro'), um(end, 'xBairro')].filter(Boolean).join(', '),
        cidade: um(end, 'xMun'), uf: um(end, 'UF'), cep: um(end, 'CEP')
      },
      itens: Array.from(inf.getElementsByTagName('det')).map((d) => {
        const p = d.getElementsByTagName('prod')[0];
        return { codigo: um(p, 'cProd'), descricao: um(p, 'xProd'), ncm: um(p, 'NCM'), cfop: um(p, 'CFOP'), unidade: um(p, 'uCom'),
          quantidade: numero(um(p, 'qCom')), preco: numero(um(p, 'vUnCom')), total: numero(um(p, 'vProd')) };
      }),
      totais: { produtos: numero(um(total, 'vProd')), frete: numero(um(total, 'vFrete')) + numero(um(total, 'vSeg')), desconto: numero(um(total, 'vDesc')),
        ipi: numero(um(total, 'vIPI')), st: numero(um(total, 'vST')), outras: numero(um(total, 'vOutro')), nota: numero(um(total, 'vNF')) },
      duplicatas: Array.from(inf.getElementsByTagName('dup')).map((d) => ({ vencimento: um(d, 'dVenc'), valor: numero(um(d, 'vDup')) })).filter((d) => d.vencimento && d.valor > 0)
    };
  }
  // Semelhança entre descrições (palavras em comum), para casar o item da nota com o do pedido
  function palavras(t) { return new Set(S.normalizar(t).split(/[^a-z0-9]+/).filter((p) => p.length > 1)); }
  function semelhanca(a, b) {
    const A = palavras(a), B = palavras(b);
    if (!A.size || !B.size) return 0;
    let comum = 0;
    A.forEach((p) => { if (B.has(p)) comum++; });
    return comum / Math.min(A.size, B.size);
  }

  /* ---------- lançamento ---------- */
  S.registrar('nota-form', {
    titulo: 'Lançar nota fiscal', menu: 'notas',
    render: async (c, prm) => {
      if (!S.podeEditar()) { c.innerHTML = '<div class="supr-nota">Seu acesso é só de consulta.</div>'; return; }
      let fornecedores = await S.fornecedores();
      if (!c.vigente()) return;
      let obraId = prm.obra || S.obraAtual();
      let fornecedorId = prm.fornecedor || '';
      let pedidos = [];
      let orc = null;
      let semPedido = [];
      let xml = null;
      let parcelas = [];
      let parcelasManuais = false;
      const recebido = new Map();   // pedidoItemId -> { quantidade, preco, doXml }

      c.innerHTML = S.cabecalho({ titulo: 'Lançar nota fiscal de entrada', sub: 'Entrega dos pedidos do fornecedor. O XML da NF-e preenche quase tudo.',
        acoes: '<label class="btn btn-ghost btn-sm">' + S.ic('xml') + 'Importar XML da NF-e<input type="file" accept=".xml,text/xml,application/xml" data-xml hidden></label>' }) +
        '<div data-aviso-xml></div><div class="supr-form">' +
        '<label class="duplo">Obra<select data-obra>' + S.opcoesObras(obraId) + '</select></label>' +
        '<label class="duplo">Fornecedor<select data-fornecedor>' + S.opcoesFornecedores(fornecedores, fornecedorId) + '</select></label>' +
        '<label>Documento<select data-tipo>' + Object.keys(TIPOS_DOC).map((k) => '<option value="' + k + '">' + TIPOS_DOC[k] + '</option>').join('') + '</select></label>' +
        '<label>Número<input data-numero maxlength="30"></label><label>Série<input data-serie maxlength="10"></label>' +
        '<label>Emissão<input type="date" data-emissao value="' + S.hoje() + '"></label><label>Entrada (recebimento)<input type="date" data-entrada value="' + S.hoje() + '"></label>' +
        '<label class="duplo">Chave de acesso (44 dígitos)<input data-chave inputmode="numeric" maxlength="60"></label></div>' +
        S.secao('Itens dos pedidos', '<div data-pedidos></div>') +
        S.secao('Itens sem pedido', '<div data-sem-pedido></div>', S.botao('sem-pedido', 'Incluir item sem pedido', { icone: 'mais' })) +
        S.secao('Valores', '<div class="supr-form" style="margin-bottom:6px">' +
          ['valorFrete:Frete', 'valorIpi:IPI', 'valorIcmsSt:ICMS-ST', 'valorOutras:Outras despesas', 'valorDesconto:Desconto'].map((x) => { const [k, r] = x.split(':'); return '<label>' + r + ' (R$)<input inputmode="decimal" data-valor="' + k + '"></label>'; }).join('') +
          '<label>Total da nota (R$)<input inputmode="decimal" data-total-informado placeholder="Para conferir"></label></div><div data-totais></div>') +
        S.secao('Parcelas (contas a pagar)', '<div data-parcelas></div>', S.botao('parcela-mais', 'Parcela', { icone: 'mais' }) + S.botao('parcelas-pedido', 'Refazer pela condição do pedido')) +
        '<div class="supr-form"><label class="check largo"><input type="checkbox" data-estoque checked>Dar entrada dos materiais no estoque da obra (com frete e impostos rateados no custo)</label>' +
        '<label class="largo">Observações<textarea rows="2" data-obs maxlength="2000"></textarea></label></div>' +
        '<div class="supr-rodape"><button type="button" class="btn btn-ghost" data-voltar>Cancelar</button><button type="button" class="btn btn-primary" data-acao="lancar">' + S.ic('check') + 'Lançar nota</button></div>';
      const $ = (sel) => c.querySelector(sel);

      function produtos() {
        let soma = 0;
        recebido.forEach((r) => { if (r.quantidade > 0 && r.preco >= 0) soma += r.quantidade * r.preco; });
        for (const i of semPedido) soma += i.quantidade * (i.precoUnitario || 0);
        return S.arred(soma, 2);
      }
      function valor(k) { return S.num($('[data-valor="' + k + '"]').value) || 0; }
      function totalNota() { return S.arred(produtos() + valor('valorFrete') + valor('valorIpi') + valor('valorIcmsSt') + valor('valorOutras') - valor('valorDesconto'), 2); }

      function desenharPedidos() {
        const alvo = $('[data-pedidos]');
        if (!obraId || !fornecedorId) { alvo.innerHTML = '<div class="supr-vazio">Escolha a obra e o fornecedor para ver os pedidos com saldo a entregar.</div>'; return; }
        if (!pedidos.length) { alvo.innerHTML = '<div class="supr-vazio">Este fornecedor não tem pedido autorizado com saldo a entregar nesta obra. Lance como "item sem pedido" se for o caso.</div>'; return; }
        let h = '';
        for (const p of pedidos) {
          h += '<div class="supr-barra" style="margin:10px 0 6px"><b>Pedido nº ' + p.numero + '</b><span class="supr-dica">' + S.data(p.data) + ' · ' + S.moeda(p.valorTotal) +
            (p.condicaoPagamento ? ' · ' + S.esc(p.condicaoPagamento) : '') + '</span><span class="espaco"></span>' + S.botao('tudo', 'Receber tudo', { dados: 'data-pedido="' + S.esc(p.id) + '"' }) + '</div>';
          h += S.tabela([
            { t: 'Insumo', v: (i) => S.esc(S.nome(i.descricao)) + '<small>' + S.textoApropriacao(orc, i.apropriacoes) + '</small>' +
              (recebido.get(i.id) && recebido.get(i.id).doXml ? '<small>Na nota: ' + S.esc(recebido.get(i.id).doXml.descricao) + '</small>' : '') },
            { t: 'Un.', v: (i) => S.esc(i.unidade), c: 'min' },
            { t: 'Falta entregar', v: (i) => S.qtd(i.saldo), c: 'num' },
            { t: 'Preço do pedido', v: (i) => S.moeda(i.precoUnitario), c: 'num' },
            { t: 'Recebido nesta nota', v: (i) => '<input class="num" inputmode="decimal" data-rec="' + S.esc(i.id) + '" value="' + S.valorCampo(recebido.get(i.id) ? recebido.get(i.id).quantidade : '') + '">', c: 'num' },
            { t: 'Preço na nota', v: (i) => '<input class="num" inputmode="decimal" data-preco="' + S.esc(i.id) + '" value="' + S.valorCampo(recebido.get(i.id) ? recebido.get(i.id).preco : i.precoUnitario, 6) + '">', c: 'num' }
          ], p.itens);
        }
        alvo.innerHTML = h;
      }
      function desenharSemPedido() {
        $('[data-sem-pedido]').innerHTML = semPedido.length ? S.tabela([
          { t: 'Insumo', v: (i) => S.esc(S.nome(i.descricao)) + '<small>' + (orc ? S.textoApropriacao(orc, i.apropriacoes.map((a) => ({ servicoId: a.servicoId, percentual: a.quantidade / i.quantidade * 100 }))) : '') + '</small>' },
          { t: 'Un.', v: (i) => S.esc(i.unidade), c: 'min' },
          { t: 'Quantidade', v: (i) => S.qtd(i.quantidade), c: 'num' },
          { t: 'Preço', v: (i) => S.moeda(i.precoUnitario), c: 'num' },
          { t: 'Total', v: (i) => S.moeda(i.quantidade * i.precoUnitario), c: 'num' },
          { t: '', v: (i, k) => '<button type="button" class="btn-icon btn-danger" data-tirar-sem="' + k + '">' + S.ic('excluir') + '</button>', c: 'acoes' }
        ], semPedido) : '<p class="supr-dica">Use só para o que chegou sem pedido de compra (vai apropriado direto no serviço).</p>';
      }
      function gerarParcelas() {
        const total = totalNota();
        const emissao = $('[data-emissao]').value || S.hoje();
        const comRec = pedidos.find((p) => p.itens.some((i) => recebido.get(i.id) && recebido.get(i.id).quantidade > 0));
        const base = (comRec && comRec.parcelas && comRec.parcelas.length) ? comRec.parcelas : [{ dias: 0, percentual: 100 }];
        let acumulado = 0;
        parcelas = base.map((p, k) => {
          const v = k === base.length - 1 ? S.arred(total - acumulado, 2) : S.arred(total * p.percentual / 100, 2);
          acumulado = S.arred(acumulado + v, 2);
          return { vencimento: S.somarDias(emissao, p.dias), valor: v };
        });
      }
      function desenharParcelas() {
        $('[data-parcelas]').innerHTML = S.tabela([
          { t: 'Parcela', v: (p, k) => String(k + 1), c: 'min' },
          { t: 'Vencimento', v: (p, k) => '<input type="date" data-parc-venc="' + k + '" value="' + S.esc(p.vencimento) + '">' },
          { t: 'Valor (R$)', v: (p, k) => '<input class="num" inputmode="decimal" data-parc-valor="' + k + '" value="' + S.valorCampo(p.valor, 2) + '">', c: 'num' },
          { t: '', v: (p, k) => (parcelas.length > 1 ? '<button type="button" class="btn-icon btn-danger" data-parc-tirar="' + k + '">' + S.ic('excluir') + '</button>' : ''), c: 'acoes' }
        ], parcelas, { vazio: 'Sem parcelas.' });
      }
      function atualizarTotais() {
        if (!parcelasManuais) { gerarParcelas(); desenharParcelas(); }
        const total = totalNota();
        const informado = S.num($('[data-total-informado]').value);
        const somaParc = S.arred(parcelas.reduce((s, p) => s + (p.valor || 0), 0), 2);
        $('[data-totais]').innerHTML = '<div class="supr-totais"><div>Produtos <strong>' + S.moeda(produtos()) + '</strong></div>' +
          '<div class="total">Total calculado <strong>' + S.moeda(total) + '</strong></div>' +
          (informado != null && Math.abs(informado - total) > 0.05 ? '<div class="supr-negativo">Diferença para o total da nota <strong>' + S.moeda(informado - total) + '</strong></div>' : '') +
          (Math.abs(somaParc - total) > 0.02 ? '<div class="supr-negativo">Parcelas somam <strong>' + S.moeda(somaParc) + '</strong></div>' : '') + '</div>';
      }

      async function carregarPedidos() {
        pedidos = [];
        recebido.clear();
        if (obraId && fornecedorId) {
          $('[data-pedidos]').innerHTML = S.carregando();
          const [r, o] = await Promise.all([S.get('pedidos/para-entrada?obra=' + encodeURIComponent(obraId) + '&fornecedor=' + encodeURIComponent(fornecedorId)), S.orcado(obraId)]);
          pedidos = r.pedidos;
          orc = o;
          if (prm.pedido && !xml) {
            const p = pedidos.find((x) => x.id === prm.pedido);
            if (p) p.itens.forEach((i) => recebido.set(i.id, { quantidade: i.saldo, preco: i.precoUnitario }));
          }
          if (xml) casarXml();
        } else if (obraId) orc = await S.orcado(obraId);
        if (!c.vigente()) return;
        desenharPedidos();
        desenharSemPedido();
        atualizarTotais();
      }

      function casarXml() {
        recebido.clear(); // refaz do zero: importar de novo não soma em cima
        const livres = [];
        pedidos.forEach((p) => p.itens.forEach((i) => livres.push({ ...i, pedidoNumero: p.numero, restante: i.saldo })));
        const naoCasados = [];
        for (const x of xml.itens) {
          let melhor = null;
          for (const i of livres) {
            if (i.restante <= 1e-6) continue;
            let nota = semelhanca(x.descricao, i.descricao);
            if (Math.abs(x.quantidade - i.restante) < 1e-6) nota += 0.25;
            if (i.precoUnitario && Math.abs(x.preco - i.precoUnitario) / i.precoUnitario < 0.05) nota += 0.25;
            if (!melhor || nota > melhor.nota) melhor = { i, nota };
          }
          if (melhor && melhor.nota >= 0.3) {
            const q = Math.min(x.quantidade, melhor.i.restante);
            melhor.i.restante -= q;
            const atual = recebido.get(melhor.i.id);
            recebido.set(melhor.i.id, { quantidade: S.arred((atual ? atual.quantidade : 0) + q, 4), preco: x.preco, doXml: x });
          } else naoCasados.push(x);
        }
        $('[data-aviso-xml]').innerHTML = '<p class="supr-nota ' + (naoCasados.length ? 'alerta' : 'ok') + '">XML lido: NF ' + S.esc(xml.numero) + (xml.serie ? '-' + S.esc(xml.serie) : '') +
          ' de ' + S.esc(xml.emitente.nome) + ', ' + xml.itens.length + ' item(ns), total ' + S.moeda(xml.totais.nota) + '.' +
          (naoCasados.length ? '<br>Sem item de pedido correspondente (lance como "item sem pedido" ou ajuste as quantidades): ' + naoCasados.map((x) => S.esc(x.descricao) + ' (' + S.qtd(x.quantidade) + ' ' + S.esc(x.unidade) + ')').join('; ') : ' Confira as quantidades casadas com os pedidos.') + '</p>';
      }

      let importando = false;
      async function importarXml(arquivo) {
        if (importando) return;
        importando = true;
        try { await lerArquivoXml(arquivo); } finally { importando = false; }
      }
      async function lerArquivoXml(arquivo) {
        const texto = await arquivo.text();
        xml = lerXmlNfe(texto);
        const doc = String(xml.emitente.documento || '').replace(/\D/g, '');
        let forn = fornecedores.find((f) => f.documento === doc);
        if (!forn && doc) {
          const criar = await S.acao({ titulo: 'Fornecedor não cadastrado', botao: 'Cadastrar e continuar', depois: false,
            texto: '<b>' + S.esc(xml.emitente.nome) + '</b> (' + S.esc(S.documento(doc)) + ') ainda não está nos fornecedores. Cadastrar com os dados do XML?',
            executar: () => S.post('fornecedores', { ...xml.emitente, documento: doc }) });
          if (!criar) { xml = null; return; }
          fornecedores = await S.fornecedores(true);
          forn = fornecedores.find((f) => f.documento === doc);
          $('[data-fornecedor]').innerHTML = S.opcoesFornecedores(fornecedores, forn ? forn.id : '');
        }
        if (forn) { fornecedorId = forn.id; $('[data-fornecedor]').value = forn.id; }
        $('[data-tipo]').value = 'nfe';
        $('[data-numero]').value = xml.numero;
        $('[data-serie]').value = xml.serie;
        $('[data-chave]').value = xml.chave;
        if (xml.emissao) $('[data-emissao]').value = xml.emissao;
        const t = xml.totais;
        const preencher = (k, v) => { $('[data-valor="' + k + '"]').value = v ? S.valorCampo(v, 2) : ''; };
        preencher('valorFrete', t.frete); preencher('valorIpi', t.ipi); preencher('valorIcmsSt', t.st); preencher('valorOutras', t.outras); preencher('valorDesconto', t.desconto);
        $('[data-total-informado]').value = t.nota ? S.valorCampo(t.nota, 2) : '';
        if (xml.duplicatas.length) { parcelas = xml.duplicatas.map((d) => ({ vencimento: d.vencimento, valor: S.arred(d.valor, 2) })); parcelasManuais = true; }
        await carregarPedidos();
        desenharParcelas();
      }

      c.addEventListener('change', async (ev) => {
        const t = ev.target;
        try {
          if (t.matches('[data-xml]')) { if (t.files[0]) await importarXml(t.files[0]); t.value = ''; return; }
          if (t.matches('[data-obra]')) { obraId = t.value; semPedido = []; await carregarPedidos(); return; }
          if (t.matches('[data-fornecedor]')) { fornecedorId = t.value; await carregarPedidos(); return; }
          if (t.matches('[data-emissao]') && !parcelasManuais) atualizarTotais();
        } catch (e) { S.falhou(e); }
      });
      c.addEventListener('input', (ev) => {
        const t = ev.target;
        if (t.matches('[data-rec]') || t.matches('[data-preco]')) {
          const id = t.dataset.rec || t.dataset.preco;
          const atual = recebido.get(id) || {};
          const item = pedidos.reduce((a, p) => a || p.itens.find((i) => i.id === id), null);
          recebido.set(id, { quantidade: S.num(c.querySelector('[data-rec="' + CSS.escape(id) + '"]').value) || 0,
            preco: S.num(c.querySelector('[data-preco="' + CSS.escape(id) + '"]').value) ?? (item ? item.precoUnitario : 0), doXml: atual.doXml });
          atualizarTotais();
          return;
        }
        if (t.matches('[data-parc-venc]')) { parcelas[Number(t.dataset.parcVenc)].vencimento = t.value; parcelasManuais = true; return; }
        if (t.matches('[data-parc-valor]')) { parcelas[Number(t.dataset.parcValor)].valor = S.num(t.value) || 0; parcelasManuais = true; atualizarTotais(); return; }
        if (t.matches('[data-valor]') || t.matches('[data-total-informado]')) atualizarTotais();
      });
      c.addEventListener('click', async (ev) => {
        const tudo = ev.target.closest('[data-acao="tudo"]');
        if (tudo) {
          const p = pedidos.find((x) => x.id === tudo.dataset.pedido);
          p.itens.forEach((i) => { const a = recebido.get(i.id) || {}; recebido.set(i.id, { quantidade: i.saldo, preco: a.preco != null ? a.preco : i.precoUnitario, doXml: a.doXml }); });
          desenharPedidos();
          atualizarTotais();
          return;
        }
        const tirar = ev.target.closest('[data-tirar-sem]');
        if (tirar) { semPedido.splice(Number(tirar.dataset.tirarSem), 1); desenharSemPedido(); atualizarTotais(); return; }
        const tp = ev.target.closest('[data-parc-tirar]');
        if (tp) { parcelas.splice(Number(tp.dataset.parcTirar), 1); parcelasManuais = true; desenharParcelas(); atualizarTotais(); return; }
        const b = ev.target.closest('[data-acao]');
        if (!b) return;
        if (b.dataset.acao === 'parcela-mais') {
          const ult = parcelas[parcelas.length - 1];
          parcelas.push({ vencimento: S.somarDias(ult ? ult.vencimento : S.hoje(), 30), valor: 0 });
          parcelasManuais = true;
          desenharParcelas();
          atualizarTotais();
        } else if (b.dataset.acao === 'parcelas-pedido') { parcelasManuais = false; atualizarTotais(); }
        else if (b.dataset.acao === 'sem-pedido') {
          if (!orc) { S.aviso('Escolha a obra.', 'erro'); return; }
          const r = await S.escolherInsumo({ orc, titulo: 'Item da nota sem pedido', preco: true, necessidade: false, observacao: false, abaInicial: 'orcamento' });
          if (r) { semPedido.push(r); desenharSemPedido(); atualizarTotais(); }
        } else if (b.dataset.acao === 'lancar') lancar(b);
      });

      async function lancar(b) {
        try {
          if (!obraId) throw new Error('Escolha a obra.');
          if (!fornecedorId) throw new Error('Escolha o fornecedor.');
          const numero = $('[data-numero]').value.trim();
          if (!numero) throw new Error('Informe o número da nota.');
          const itens = [];
          recebido.forEach((r, id) => {
            if (r.quantidade > 0) itens.push({ pedidoItemId: id, quantidade: r.quantidade, precoUnitario: r.preco,
              descricaoFornecedor: r.doXml ? r.doXml.descricao : null, codigoFornecedor: r.doXml ? r.doXml.codigo : null,
              ncm: r.doXml ? r.doXml.ncm : null, cfop: r.doXml ? r.doXml.cfop : null });
          });
          for (const i of semPedido) itens.push({ insumoChave: i.insumoChave, insumoCodigo: i.insumoCodigo, descricao: i.descricao, unidade: i.unidade, tipo: i.tipo,
            quantidade: i.quantidade, precoUnitario: i.precoUnitario, apropriacoes: i.apropriacoes });
          if (!itens.length) throw new Error('Informe a quantidade recebida de ao menos um item.');
          const corpo = {
            orcamentoId: obraId, fornecedorId, tipoDocumento: $('[data-tipo]').value, numero, serie: $('[data-serie]').value.trim(),
            chaveAcesso: $('[data-chave]').value.trim(), dataEmissao: $('[data-emissao]').value, dataEntrada: $('[data-entrada]').value,
            valorFrete: valor('valorFrete'), valorIpi: valor('valorIpi'), valorIcmsSt: valor('valorIcmsSt'), valorOutras: valor('valorOutras'), valorDesconto: valor('valorDesconto'),
            valorTotalInformado: S.num($('[data-total-informado]').value), parcelas, entradaEstoque: $('[data-estoque]').checked,
            observacoes: $('[data-obs]').value, itens
          };
          b.disabled = true;
          const r = await S.post('notas', corpo);
          S.aviso('Nota lançada: ' + r.titulos + ' parcela(s) no contas a pagar' + (r.estoque ? ', ' + r.estoque + ' material(is) no estoque' : '') + '.');
          S.substituir('nota', { id: r.id });
        } catch (e) { S.falhou(e); b.disabled = false; }
      }

      await carregarPedidos();
    }
  });
})();
