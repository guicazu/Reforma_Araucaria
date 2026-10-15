/* Cotação de preços e mapa de cotação. Itens autorizados das solicitações são cotados com vários
   fornecedores; o mapa compara preço, condição de pagamento, prazo e frete, destaca o menor preço,
   guarda as rodadas de negociação e os vencedores (um item pode ser dividido). O fornecedor pode
   responder pelo portal (link). "Gerar pedidos" cria um pedido por fornecedor vencedor. */
(function () {
  'use strict';
  const S = window.Supr;
  const filtro = { situacao: 'aberta', busca: '' };

  /* ---------- lista ---------- */
  S.registrar('cotacoes', {
    titulo: 'Cotações de preço', subtitulo: 'Mapa de cotação com os fornecedores, rodadas de negociação e geração dos pedidos', lista: true,
    render: async (c) => {
      const obra = S.obraAtual();
      const { cotacoes } = await S.get('cotacoes?obra=' + encodeURIComponent(obra));
      if (!c.vigente()) return;
      const conta = (s) => cotacoes.filter((x) => x.status === s).length;
      c.innerHTML = '<div class="supr-barra">' + S.busca(filtro.busca, 'Nº ou item') +
        S.chips([['aberta', 'Abertas', conta('aberta')], ['finalizada', 'Finalizadas', conta('finalizada')], ['cancelada', 'Canceladas', conta('cancelada')], ['', 'Todas', cotacoes.length]], filtro.situacao) +
        '<span class="espaco"></span>' + (S.podeEditar() ? S.botao('nova', 'Nova cotação', { primario: true, icone: 'mais' }) : '') + '</div><div data-tabela></div>';
      const desenhar = () => {
        const linhas = cotacoes.filter((x) => (!filtro.situacao || x.status === filtro.situacao) && S.combina(filtro.busca, [x.numero, x.resumo]));
        c.querySelector('[data-tabela]').innerHTML = S.tabela([
          { t: 'Nº', v: (x) => '<b>' + x.numero + '</b>', c: 'min' },
          { t: 'Data', v: (x) => S.data(x.data), c: 'nowrap' },
          ...(obra ? [] : [{ t: 'Obra', v: (x) => S.esc(S.nomeObra(x.orcamentoId)) }]),
          { t: 'Itens', v: (x) => S.esc(S.nome(x.resumo || '')) + (x.itens > 3 ? '<small>+ ' + (x.itens - 3) + ' item(ns)</small>' : '') },
          { t: 'Respostas', v: (x) => x.respostas + ' de ' + x.fornecedores, c: 'num' },
          { t: 'Prazo', v: (x) => S.data(x.prazoResposta) + (x.status === 'aberta' && x.prazoResposta && x.prazoResposta < S.hoje() ? '<small class="supr-negativo">vencido</small>' : ''), c: 'nowrap' },
          { t: 'Rodada', v: (x) => x.rodada + 'ª', c: 'num' },
          { t: 'Situação', v: (x) => S.status('cotacao', x.status) + (x.pedidos ? '<small>' + x.pedidos + ' pedido(s)</small>' : '') }
        ], linhas, { id: (x) => x.id, vazio: cotacoes.length ? 'Nenhuma cotação com esse filtro.' : '<strong>Nenhuma cotação ainda</strong>Itens autorizados das solicitações aparecem em "Nova cotação".' });
      };
      c.querySelector('[data-busca]').addEventListener('input', (ev) => { filtro.busca = ev.target.value; desenhar(); });
      c.querySelector('[data-chips]').addEventListener('click', (ev) => {
        const b = ev.target.closest('button[data-valor]');
        if (!b) return;
        filtro.situacao = b.dataset.valor;
        c.querySelectorAll('[data-chips] button').forEach((x) => x.classList.toggle('ativo', x === b));
        desenhar();
      });
      c.addEventListener('click', (ev) => { if (ev.target.closest('[data-acao="nova"]')) S.ir('cotacao-form', {}); });
      S.aoAbrirLinha(c, (id) => S.ir('cotacao', { id }));
      desenhar();
    }
  });

  /* ---------- itens autorizados com saldo ---------- */
  function tabelaItensParaCompra(itens, orc, marcados, campoQtd) {
    return S.tabela([
      { t: '<input type="checkbox" data-todos title="Marcar todos">', v: (i) => '<input type="checkbox" data-item="' + S.esc(i.id) + '"' + (marcados.has(i.id) ? ' checked' : '') + '>', c: 'min' },
      { t: 'SC', v: (i) => 'nº ' + i.solicitacaoNumero, c: 'min' },
      { t: 'Insumo', v: (i) => S.esc(S.nome(i.descricao)) + '<small>' + (orc ? S.textoApropriacao(orc, i.apropriacoes) : '') + (i.observacao ? ' · ' + S.esc(i.observacao) : '') + '</small>' },
      { t: 'Un.', v: (i) => S.esc(i.unidade), c: 'min' },
      { t: 'Necessidade', v: (i) => S.data(i.dataNecessidade), c: 'nowrap' },
      { t: 'Saldo', v: (i) => S.qtd(i[campoQtd]) + (i.emCotacao > 1e-6 && campoQtd === 'saldoParaCotar' ? '<small>' + S.qtd(i.emCotacao) + ' em cotação</small>' : ''), c: 'num' },
      { t: 'Quantidade', v: (i) => '<input class="num" inputmode="decimal" data-qtd="' + S.esc(i.id) + '" value="' + S.valorCampo(i[campoQtd]) + '">', c: 'num' }
    ], itens, { vazio: 'Nenhum item autorizado com saldo nesta obra. Itens aparecem aqui depois que a solicitação é autorizada.' });
  }
  function lerItensMarcados(c, itens, campoQtd) {
    const r = [];
    for (const cb of c.querySelectorAll('[data-item]:checked')) {
      const i = itens.find((x) => x.id === cb.dataset.item);
      const q = S.num(c.querySelector('[data-qtd="' + CSS.escape(i.id) + '"]').value);
      if (!(q > 0)) throw new Error('Informe a quantidade de "' + S.nome(i.descricao) + '".');
      if (q > i[campoQtd] + 1e-6) throw new Error('"' + S.nome(i.descricao) + '": o saldo é ' + S.qtd(i[campoQtd]) + ' ' + i.unidade + '.');
      r.push({ solicitacaoItemId: i.id, quantidade: q });
    }
    return r;
  }
  function ligarMarcarTodos(c) {
    c.addEventListener('change', (ev) => {
      if (!ev.target.matches('[data-todos]')) return;
      ev.target.closest('table').querySelectorAll('[data-item]').forEach((x) => { x.checked = ev.target.checked; });
    });
  }
  S.tabelaItensParaCompra = tabelaItensParaCompra;
  S.lerItensMarcados = lerItensMarcados;
  S.ligarMarcarTodos = ligarMarcarTodos;

  /* ---------- nova cotação ---------- */
  S.registrar('cotacao-form', {
    titulo: 'Nova cotação', menu: 'cotacoes',
    render: async (c, p) => {
      if (!S.podeEditar()) { c.innerHTML = '<div class="supr-nota">Seu acesso é só de consulta.</div>'; return; }
      let obraId = p.obra || S.obraAtual();
      const fornecedores = await S.fornecedores();
      if (!c.vigente()) return;
      const marcados = new Set(p.itens || []);
      const marcadosForn = new Set();
      let itens = [];
      let orc = null;
      c.innerHTML = S.cabecalho({ titulo: 'Nova cotação de preços', sub: 'Escolha os itens autorizados e os fornecedores que vão cotar.' }) +
        '<div class="supr-form"><label class="duplo">Obra<select data-obra>' + S.opcoesObras(obraId) + '</select></label>' +
        '<label>Prazo para resposta<input type="date" data-prazo value="' + S.somarDias(S.hoje(), 3) + '"></label>' +
        '<label class="largo">Observações para os fornecedores<textarea rows="2" data-obs maxlength="2000" placeholder="Condições de entrega, especificações, horário de recebimento na obra…"></textarea></label></div>' +
        S.secao('Itens a cotar', '<div data-itens></div>') +
        S.secao('Fornecedores', '<div class="supr-barra">' + S.busca('', 'Nome, CNPJ ou o que fornece') + '<span class="espaco"></span>' +
          S.botao('novo-fornecedor', 'Novo fornecedor', { icone: 'mais' }) + '</div><div data-fornecedores></div>') +
        '<div class="supr-rodape"><button type="button" class="btn btn-ghost" data-voltar>Cancelar</button>' +
        '<button type="button" class="btn btn-primary" data-acao="criar">' + S.ic('cotacao') + 'Criar cotação</button></div>';

      async function carregarItens() {
        const alvo = c.querySelector('[data-itens]');
        if (!obraId) { alvo.innerHTML = '<div class="supr-vazio">Escolha a obra.</div>'; return; }
        alvo.innerHTML = S.carregando();
        const [r, o] = await Promise.all([S.get('solicitacoes/itens-para-compra?obra=' + encodeURIComponent(obraId)), S.orcado(obraId)]);
        itens = r.itens.filter((i) => i.saldoParaCotar > 1e-6);
        orc = o;
        if (!c.vigente()) return;
        alvo.innerHTML = tabelaItensParaCompra(itens, orc, marcados, 'saldoParaCotar');
      }
      function desenharFornecedores(lista) {
        const termo = c.querySelector('[data-fornecedores]').previousElementSibling.querySelector('[data-busca]').value;
        const visiveis = lista.filter((f) => marcadosForn.has(f.id) || S.combina(termo, [f.nome, f.nomeFantasia, f.documento, f.categorias, f.cidade]));
        c.querySelector('[data-fornecedores]').innerHTML = S.tabela([
          { t: '', v: (f) => '<input type="checkbox" data-forn="' + S.esc(f.id) + '"' + (marcadosForn.has(f.id) ? ' checked' : '') + '>', c: 'min' },
          { t: 'Fornecedor', v: (f) => S.esc(f.nome) + (f.categorias ? '<small>' + S.esc(f.categorias) + '</small>' : '') },
          { t: 'CNPJ/CPF', v: (f) => S.esc(S.documento(f.documento)), c: 'nowrap' },
          { t: 'Contato', v: (f) => S.esc([f.email, f.telefone].filter(Boolean).join(' · ') || '—') + (!f.email ? '<small>Sem e-mail: o convite vai por link</small>' : '') },
          { t: 'Cidade', v: (f) => S.esc([f.cidade, f.uf].filter(Boolean).join('/')) }
        ], visiveis.slice(0, 200), { vazio: lista.length ? 'Nenhum fornecedor encontrado.' : 'Cadastre fornecedores em "Novo fornecedor" ou em Cadastros.' });
      }
      let listaForn = fornecedores;
      c.querySelector('[data-obra]').addEventListener('change', (ev) => { obraId = ev.target.value; marcados.clear(); carregarItens().catch(S.falhou); });
      c.querySelector('[data-fornecedores]').previousElementSibling.querySelector('[data-busca]').addEventListener('input', () => desenharFornecedores(listaForn));
      c.addEventListener('change', (ev) => {
        if (ev.target.matches('[data-forn]')) { if (ev.target.checked) marcadosForn.add(ev.target.dataset.forn); else marcadosForn.delete(ev.target.dataset.forn); }
        if (ev.target.matches('[data-item]')) { if (ev.target.checked) marcados.add(ev.target.dataset.item); else marcados.delete(ev.target.dataset.item); }
      });
      ligarMarcarTodos(c);
      c.addEventListener('click', async (ev) => {
        if (ev.target.closest('[data-acao="novo-fornecedor"]')) {
          const id = await S.novoFornecedor();
          if (id) { listaForn = await S.fornecedores(true); marcadosForn.add(id); desenharFornecedores(listaForn); }
          return;
        }
        const criar = ev.target.closest('[data-acao="criar"]');
        if (!criar) return;
        try {
          if (!obraId) throw new Error('Escolha a obra.');
          const its = lerItensMarcados(c, itens, 'saldoParaCotar');
          if (!its.length) throw new Error('Marque ao menos um item.');
          if (!marcadosForn.size) throw new Error('Marque ao menos um fornecedor.');
          criar.disabled = true;
          const r = await S.post('cotacoes', { orcamentoId: obraId, itens: its, fornecedores: Array.from(marcadosForn),
            prazoResposta: c.querySelector('[data-prazo]').value || null, observacoes: c.querySelector('[data-obs]').value });
          S.aviso('Cotação nº ' + r.numero + ' criada. Envie os convites ou digite os preços no mapa.');
          S.substituir('cotacao', { id: r.id });
        } catch (e) { S.falhou(e); criar.disabled = false; }
      });
      desenharFornecedores(listaForn);
      await carregarItens();
    }
  });

  /* ---------- mapa de cotação ---------- */
  S.registrar('cotacao', {
    titulo: 'Mapa de cotação', menu: 'cotacoes',
    render: async (c, p) => {
      const [{ cotacao: cot }, condicoes] = await Promise.all([S.get('cotacoes/' + p.id), S.condicoes()]);
      const orc = await S.orcado(cot.orcamentoId);
      if (!c.vigente()) return;
      const aberta = cot.status === 'aberta' && S.podeEditar();
      let rodadaVista = p.rodada && p.rodada <= cot.rodada ? p.rodada : cot.rodada;
      let dividir = cot.selecao.some((s) => { const it = cot.itens.find((i) => i.id === s.cotacaoItemId); return it && Math.abs(s.quantidade - it.quantidade) > 1e-6; });
      let sujo = false;
      const editavel = () => aberta && rodadaVista === cot.rodada;
      // estado do mapa
      const preco = new Map();
      for (const x of cot.precos) preco.set(x.cotacaoItemId + '|' + x.fornecedorId + '|' + x.rodada, x);
      const selecao = new Map(cot.itens.map((i) => [i.id, new Map()]));
      for (const s of cot.selecao) if (selecao.has(s.cotacaoItemId)) selecao.get(s.cotacaoItemId).set(s.fornecedorId, s.quantidade);
      const condForn = new Map(cot.fornecedores.map((f) => [f.fornecedorId, {
        condicaoPagamentoId: f.condicaoPagamentoId || '', condicaoPagamento: f.condicaoPagamento || '', prazoEntregaDias: f.prazoEntregaDias,
        frete: f.frete || '', valorFrete: f.valorFrete || 0, validade: f.validade || '', observacoes: f.observacoes || '' }]));
      const precoDe = (itemId, fornId, rodada) => { const x = preco.get(itemId + '|' + fornId + '|' + (rodada || rodadaVista)); return x && x.precoUnitario > 0 ? x.precoUnitario : null; };

      function totalFornecedor(fid) {
        let soma = 0, n = 0;
        for (const it of cot.itens) { const pr = precoDe(it.id, fid); if (pr) { soma += pr * it.quantidade; n++; } }
        const frete = Number(condForn.get(fid).valorFrete) || 0;
        return { itens: soma, frete, total: soma + frete, cotados: n };
      }
      function totaisSelecao() {
        let total = 0, orcado = 0;
        const fretes = new Set();
        for (const it of cot.itens) {
          for (const [fid, q] of selecao.get(it.id)) { const pr = precoDe(it.id, fid, cot.rodada); if (pr) { total += pr * q; fretes.add(fid); orcado += (it.precoOrcado || 0) * q; } }
        }
        let frete = 0;
        fretes.forEach((fid) => { frete += Number(condForn.get(fid).valorFrete) || 0; });
        return { total: total + frete, itens: total, frete, orcado, fornecedores: fretes.size };
      }

      const statusResposta = (f) => f.declinou ? S.tag('Declinou', 'vermelho') : f.respondidoEm ? S.tag('Respondeu ' + S.dataHora(f.respondidoEm), 'verde')
        : f.conviteEnviadoEm ? S.tag('Convite enviado', 'azul') : S.tag('Sem resposta', 'cinza');

      function htmlMapa() {
        const forns = cot.fornecedores;
        const ed = editavel();
        let h = '<div class="supr-mapa-wrap"><table class="supr-mapa"><thead><tr><th class="col-item">Item' + (aberta ? '' : '') + '</th>';
        for (const f of forns) {
          const cf = condForn.get(f.fornecedorId);
          const outra = cf.condicaoPagamento && !cf.condicaoPagamentoId;
          h += '<th class="col-forn"><div class="forn-nome"><span>' + S.esc(f.nome) + '</span><span class="supr-nao-imprimir" style="display:inline-flex;gap:2px">' +
            '<button type="button" class="btn-icon" data-link="' + S.esc(f.token) + '" title="Copiar link do portal para este fornecedor">' + S.ic('link') + '</button>' +
            (aberta ? '<button type="button" class="btn-icon btn-danger" data-tirar-forn="' + S.esc(f.fornecedorId) + '" title="Tirar da cotação">' + S.ic('fechar') + '</button>' : '') +
            '</span></div><span class="supr-resposta">' + statusResposta(f) + '</span>' +
            '<div class="forn-cond" data-cond="' + S.esc(f.fornecedorId) + '">' +
            '<select class="largo" data-campo="condicao" title="Condição de pagamento"' + (ed ? '' : ' disabled') + '>' + S.opcoesCondicoes(condicoes, cf.condicaoPagamentoId, 'Pagamento…') +
            '<option value="__outra"' + (outra ? ' selected' : '') + '>' + S.esc(outra ? cf.condicaoPagamento : 'Outra…') + '</option></select>' +
            '<input data-campo="prazo" inputmode="numeric" placeholder="Prazo (dias)" title="Prazo de entrega em dias" value="' + S.esc(cf.prazoEntregaDias == null ? '' : cf.prazoEntregaDias) + '"' + (ed ? '' : ' disabled') + '>' +
            '<select data-campo="frete" title="Frete"' + (ed ? '' : ' disabled') + '><option value="">Frete…</option><option value="CIF"' + (cf.frete === 'CIF' ? ' selected' : '') + '>CIF (incluso)</option>' +
            '<option value="FOB"' + (cf.frete === 'FOB' ? ' selected' : '') + '>FOB (à parte)</option></select>' +
            '<input data-campo="valorFrete" inputmode="decimal" placeholder="Valor do frete" title="Valor do frete (R$)" value="' + S.valorCampo(cf.valorFrete || '', 2) + '"' + (ed ? '' : ' disabled') + '>' +
            '<input type="date" data-campo="validade" title="Validade da proposta" value="' + S.esc(cf.validade || '') + '"' + (ed ? '' : ' disabled') + '>' +
            '</div></th>';
        }
        h += '</tr></thead><tbody>';
        for (const it of cot.itens) {
          const precos = forns.map((f) => precoDe(it.id, f.fornecedorId)).filter(Boolean);
          const menor = precos.length ? Math.min.apply(null, precos) : null;
          const sel = selecao.get(it.id);
          h += '<tr><td class="col-item"><b>' + S.esc(S.nome(it.descricao)) + '</b><small>' + S.qtd(it.quantidade) + ' ' + S.esc(it.unidade || '') +
            ' · SC nº ' + it.solicitacaoNumero + (it.dataNecessidade ? ' · para ' + S.data(it.dataNecessidade) : '') + '</small>' +
            (it.precoOrcado ? '<small>Orçado: ' + S.moeda(it.precoOrcado) + '/' + S.esc(it.unidade || 'un') + ' · ' + S.moeda(it.precoOrcado * it.quantidade) + '</small>' : '') +
            (aberta ? '<button type="button" class="supr-link supr-nao-imprimir" data-tirar-item="' + S.esc(it.id) + '" style="font-size:11px;margin-top:3px">Tirar item</button>' : '') + '</td>';
          for (const f of forns) {
            const pr = precoDe(it.id, f.fornecedorId);
            const reg = preco.get(it.id + '|' + f.fornecedorId + '|' + rodadaVista);
            const venc = sel.has(f.fornecedorId);
            const anterior = rodadaVista > 1 ? precoDe(it.id, f.fornecedorId, rodadaVista - 1) : null;
            h += '<td class="' + [pr && pr === menor && precos.length > 1 ? 'melhor' : '', venc ? 'vencedor' : ''].join(' ') + '"><div class="celula" data-celula="' + S.esc(it.id) + '|' + S.esc(f.fornecedorId) + '">' +
              '<input class="preco" inputmode="decimal" data-preco placeholder="Preço unit." value="' + S.valorCampo(reg && reg.precoUnitario != null ? reg.precoUnitario : '', 6) + '"' + (editavel() ? '' : ' disabled') + '>' +
              '<div class="linha"><span><span data-total-cel>' + (pr ? S.moeda(pr * it.quantidade) : '—') + '</span>' + (anterior && pr && Math.abs(anterior - pr) > 1e-6 ? ' <span title="Rodada anterior: ' + S.moeda(anterior) + '">' + (pr < anterior ? '↓' : '↑') + '</span>' : '') + '</span>' +
              (aberta ? '<label><input type="checkbox" data-vencedor' + (venc ? ' checked' : '') + (pr ? '' : ' disabled') + '>Vencedor</label>' : (venc ? '<b class="supr-positivo">Vencedor</b>' : '')) + '</div>' +
              (dividir && aberta && venc ? '<div class="linha"><span>Qtd.</span><input class="qtd-venc" inputmode="decimal" data-qtd-venc value="' + S.valorCampo(sel.get(f.fornecedorId)) + '"></div>' : '') +
              (reg && (reg.marca || reg.observacao) ? '<small>' + S.esc([reg.marca ? 'Marca ' + reg.marca : '', reg.observacao].filter(Boolean).join(' · ')) + '</small>' : '') +
              '</div></td>';
          }
          h += '</tr>';
        }
        h += '</tbody><tfoot>';
        const linhaTotal = (rotulo, k) => '<tr><td class="col-item">' + rotulo + '</td>' + forns.map((f) => '<td class="num" data-rod="' + k + '|' + S.esc(f.fornecedorId) + '">' +
          RODAPE[k](totalFornecedor(f.fornecedorId)) + '</td>').join('') + '</tr>';
        h += linhaTotal('Itens cotados', 'cotados');
        h += linhaTotal('Total dos itens', 'itens');
        h += linhaTotal('Frete', 'frete');
        h += linhaTotal('Total da proposta', 'total');
        h += '</tfoot></table></div>';
        return h;
      }

      const RODAPE = {
        cotados: (t) => t.cotados + ' de ' + cot.itens.length, itens: (t) => S.moeda(t.itens), frete: (t) => S.moeda(t.frete), total: (t) => '<b>' + S.moeda(t.total) + '</b>'
      };
      // atualiza destaques, totais da linha e rodapé sem redesenhar (o foco continua no campo)
      function atualizarLinha(tr) {
        const cels = Array.from(tr.querySelectorAll('[data-celula]'));
        if (!cels.length) return;
        const itemId = cels[0].dataset.celula.split('|')[0];
        const it = cot.itens.find((i) => i.id === itemId);
        const valores = cels.map((cel) => precoDe(itemId, cel.dataset.celula.split('|')[1]));
        const validos = valores.filter(Boolean);
        const menor = validos.length ? Math.min.apply(null, validos) : null;
        cels.forEach((cel, k) => {
          const td = cel.closest('td');
          td.classList.toggle('melhor', !!valores[k] && valores[k] === menor && validos.length > 1);
          const tot = cel.querySelector('[data-total-cel]');
          if (tot) tot.textContent = valores[k] ? S.moeda(valores[k] * it.quantidade) : '—';
          const cb = cel.querySelector('[data-vencedor]');
          if (cb) { cb.disabled = !valores[k]; if (!valores[k] && cb.checked) { cb.checked = false; td.classList.remove('vencedor'); } }
        });
      }
      function atualizarRodape() {
        c.querySelectorAll('[data-rod]').forEach((td) => {
          const [k, fid] = td.dataset.rod.split('|');
          td.innerHTML = RODAPE[k](totalFornecedor(fid));
        });
        const r = c.querySelector('[data-resumo]');
        if (r) r.innerHTML = resumoSelecao();
      }

      function resumoSelecao() {
        const t = totaisSelecao();
        const dif = t.orcado ? t.itens - t.orcado : null;
        return 'Selecionado: <b>' + S.moeda(t.total) + '</b> (' + t.fornecedores + ' fornecedor(es)' + (t.frete ? ', frete ' + S.moeda(t.frete) : '') + ')' +
          (dif != null ? ' · orçado ' + S.moeda(t.orcado) + ' · <b class="' + (dif > 0 ? 'supr-negativo' : 'supr-positivo') + '">' + (dif > 0 ? '+' : '') + S.moeda(dif) + '</b>' : '');
      }

      function desenhar() {
        const acoes = [];
        if (aberta) {
          acoes.push(S.botao('salvar', 'Salvar mapa', { icone: 'salvar' }));
          acoes.push(S.botao('gerar', 'Gerar pedidos', { primario: true, icone: 'suprimentos' }));
          acoes.push(S.botao('convites', 'Convites e links', { icone: 'email' }));
          acoes.push(S.botao('mais-forn', 'Fornecedor', { icone: 'mais' }));
          acoes.push(S.botao('mais-itens', 'Itens', { icone: 'mais' }));
          acoes.push(S.botao('rodada', 'Nova rodada', { icone: 'versoes', titulo: 'Negociar: abre a ' + (cot.rodada + 1) + 'ª rodada partindo dos preços atuais' }));
        }
        acoes.push(S.botao('imprimir', 'Imprimir', { icone: 'imprimir' }));
        if (aberta) acoes.push(S.botao('cancelar', 'Cancelar', { perigo: true }));
        const rodadas = [];
        for (let r = 1; r <= cot.rodada; r++) rodadas.push('<option value="' + r + '"' + (r === rodadaVista ? ' selected' : '') + '>' + r + 'ª rodada' + (r === cot.rodada ? ' (atual)' : '') + '</option>');
        c.innerHTML = S.cabecalho({ voltar: 'Voltar', titulo: 'Cotação nº ' + cot.numero, status: S.status('cotacao', cot.status),
          sub: S.esc(S.nomeObra(cot.orcamentoId)) + ' · criada em ' + S.data(cot.data) + ' por ' + S.esc(cot.compradorNome || cot.compradorEmail) +
            (cot.prazoResposta ? ' · respostas até ' + S.data(cot.prazoResposta) : ''), acoes: acoes.join('') }) +
          (cot.observacoes ? '<p class="supr-nota">' + S.esc(cot.observacoes) + '</p>' : '') +
          (cot.pedidos.length ? '<p class="supr-nota ok">Pedidos gerados: ' + cot.pedidos.map((x) => '<button type="button" class="supr-link" data-pedido="' + S.esc(x.id) + '">nº ' + x.numero +
            '</button> ' + S.esc(x.fornecedorNome) + ' (' + S.moeda(x.valorTotal) + ', ' + S.esc(S.rotuloStatus('pedido', x.status).toLowerCase()) + ')').join(' · ') + '</p>' : '') +
          '<div class="supr-barra supr-nao-imprimir"><select data-rodada style="width:auto">' + rodadas.join('') + '</select>' +
          (aberta ? '<span class="supr-dica">Vencedores:</span>' + S.botao('auto-item', 'Menor preço por item') + S.botao('auto-forn', 'Menor total por fornecedor') + S.botao('limpar', 'Limpar') +
            '<label class="check" style="display:inline-flex;gap:6px;align-items:center;font-size:12px"><input type="checkbox" data-dividir' + (dividir ? ' checked' : '') + '>Dividir item entre fornecedores</label>' : '') +
          '<span class="espaco"></span><span data-sujo class="supr-dica"></span></div>' +
          (cot.fornecedores.length ? htmlMapa() : '<div class="supr-vazio">Inclua fornecedores na cotação.</div>') +
          '<p class="supr-nota" data-resumo style="margin-top:12px">' + resumoSelecao() + '</p>' +
          S.secao('Histórico', S.historico(cot.historico));
        marcarSujo(sujo);
      }
      function marcarSujo(v) {
        sujo = v;
        const el = c.querySelector('[data-sujo]');
        if (el) el.innerHTML = sujo ? '<span class="supr-negativo">Alterações não salvas</span>' : '';
      }

      // lê preços e condições digitados (rodada atual)
      function lerMapa() {
        const precos = [];
        c.querySelectorAll('[data-celula]').forEach((cel) => {
          const [itemId, fornId] = cel.dataset.celula.split('|');
          const v = cel.querySelector('[data-preco]').value;
          const n = S.num(v);
          if (v.trim() && n == null) throw new Error('Preço inválido: ' + v);
          const reg = preco.get(itemId + '|' + fornId + '|' + cot.rodada);
          if (n == null && !reg) return;
          precos.push({ cotacaoItemId: itemId, fornecedorId: fornId, precoUnitario: n, marca: reg ? reg.marca : null, observacao: reg ? reg.observacao : null });
        });
        const fornecedores = cot.fornecedores.map((f) => {
          const cf = condForn.get(f.fornecedorId);
          return { fornecedorId: f.fornecedorId, condicaoPagamentoId: cf.condicaoPagamentoId || null, condicaoPagamento: cf.condicaoPagamento || null,
            prazoEntregaDias: cf.prazoEntregaDias === '' ? null : cf.prazoEntregaDias, frete: cf.frete || null, valorFrete: cf.valorFrete || 0,
            validade: cf.validade || null, observacoes: cf.observacoes || null };
        });
        const sel = [];
        selecao.forEach((m, itemId) => m.forEach((q, fornId) => sel.push({ cotacaoItemId: itemId, fornecedorId: fornId, quantidade: q })));
        return { precos, fornecedores, selecao: sel };
      }
      async function salvar(silencioso) {
        if (!editavel()) return;
        await S.put('cotacoes/' + cot.id + '/mapa', lerMapa());
        marcarSujo(false);
        if (!silencioso) S.aviso('Mapa salvo.');
      }
      // preço digitado: atualiza o estado local (para totais e destaques)
      function atualizarPrecoLocal(cel) {
        const [itemId, fornId] = cel.dataset.celula.split('|');
        const n = S.num(cel.querySelector('[data-preco]').value);
        const k = itemId + '|' + fornId + '|' + cot.rodada;
        const reg = preco.get(k) || { cotacaoItemId: itemId, fornecedorId: fornId, rodada: cot.rodada };
        reg.precoUnitario = n;
        preco.set(k, reg);
        if (!(n > 0)) selecao.get(itemId).delete(fornId);
      }

      function vencedorAuto(modo) {
        const forns = cot.fornecedores.filter((f) => !f.declinou);
        if (modo === 'forn') {
          const completos = forns.map((f) => ({ f, t: totalFornecedor(f.fornecedorId) })).filter((x) => x.t.cotados === cot.itens.length)
            .sort((a, b) => a.t.total - b.t.total);
          if (completos.length) {
            for (const it of cot.itens) selecao.set(it.id, new Map([[completos[0].f.fornecedorId, it.quantidade]]));
            S.aviso(completos[0].f.nome + ' tem o menor total entre quem cotou todos os itens.');
            return;
          }
          S.aviso('Nenhum fornecedor cotou todos os itens: escolhido o menor preço de cada item.');
        }
        for (const it of cot.itens) {
          let melhor = null;
          for (const f of forns) { const pr = precoDe(it.id, f.fornecedorId, cot.rodada); if (pr && (!melhor || pr < melhor.pr)) melhor = { fid: f.fornecedorId, pr }; }
          selecao.set(it.id, melhor ? new Map([[melhor.fid, it.quantidade]]) : new Map());
        }
      }

      c.addEventListener('input', (ev) => {
        const cel = ev.target.closest('[data-celula]');
        if (cel && ev.target.matches('[data-preco]')) { atualizarPrecoLocal(cel); atualizarLinha(cel.closest('tr')); atualizarRodape(); marcarSujo(true); return; }
        if (cel && ev.target.matches('[data-qtd-venc]')) {
          const [itemId, fornId] = cel.dataset.celula.split('|');
          const q = S.num(ev.target.value);
          if (q > 0) selecao.get(itemId).set(fornId, q);
          marcarSujo(true);
          const r = c.querySelector('[data-resumo]'); if (r) r.innerHTML = resumoSelecao();
          return;
        }
        const cond = ev.target.closest('[data-cond]');
        if (cond) {
          const cf = condForn.get(cond.dataset.cond);
          const campo = ev.target.dataset.campo;
          if (campo === 'prazo') cf.prazoEntregaDias = ev.target.value.trim() === '' ? '' : parseInt(ev.target.value, 10) || 0;
          if (campo === 'valorFrete') { cf.valorFrete = S.num(ev.target.value) || 0; atualizarRodape(); }
          if (campo === 'validade') cf.validade = ev.target.value;
          marcarSujo(true);
        }
      });
      c.addEventListener('change', async (ev) => {
        if (ev.target.matches('[data-rodada]')) { rodadaVista = Number(ev.target.value); desenhar(); return; }
        if (ev.target.matches('[data-dividir]')) { dividir = ev.target.checked; desenhar(); return; }
        const cel = ev.target.closest('[data-celula]');
        if (cel && ev.target.matches('[data-vencedor]')) {
          const [itemId, fornId] = cel.dataset.celula.split('|');
          const it = cot.itens.find((i) => i.id === itemId);
          const sel = selecao.get(itemId);
          if (ev.target.checked) {
            if (!dividir) sel.clear();
            const usado = Array.from(sel.values()).reduce((s, q) => s + q, 0);
            sel.set(fornId, dividir ? Math.max(0, S.arred(it.quantidade - usado, 4)) || it.quantidade : it.quantidade);
          } else sel.delete(fornId);
          marcarSujo(true);
          desenhar();
          return;
        }
        const cond = ev.target.closest('[data-cond]');
        if (cond && ev.target.dataset.campo === 'condicao') {
          const cf = condForn.get(cond.dataset.cond);
          if (ev.target.value === '__outra') {
            const texto = window.prompt('Condição de pagamento (ex.: 28/35/42 dias):', cf.condicaoPagamentoId ? '' : cf.condicaoPagamento);
            if (texto && texto.trim()) { cf.condicaoPagamentoId = ''; cf.condicaoPagamento = texto.trim(); }
          } else {
            const cond2 = condicoes.find((x) => x.id === ev.target.value);
            cf.condicaoPagamentoId = cond2 ? cond2.id : '';
            cf.condicaoPagamento = cond2 ? cond2.descricao : '';
          }
          marcarSujo(true);
          desenhar();
          return;
        }
        if (cond && ev.target.dataset.campo === 'frete') { condForn.get(cond.dataset.cond).frete = ev.target.value; marcarSujo(true); }
      });

      c.addEventListener('click', async (ev) => {
        const ped = ev.target.closest('[data-pedido]');
        if (ped) { S.ir('pedido', { id: ped.dataset.pedido }); return; }
        const link = ev.target.closest('[data-link]');
        if (link) { S.copiar(location.origin + '/portal-fornecedor?t=' + link.dataset.link, 'Link do portal copiado: mande ao fornecedor por WhatsApp ou e-mail.'); return; }
        const tf = ev.target.closest('[data-tirar-forn]');
        if (tf) {
          const f = cot.fornecedores.find((x) => x.fornecedorId === tf.dataset.tirarForn);
          S.acao({ titulo: 'Tirar ' + f.nome + ' da cotação', texto: 'Os preços dele nesta cotação serão apagados.', botao: 'Tirar', perigo: true,
            executar: () => S.del('cotacoes/' + cot.id + '/fornecedores/' + f.fornecedorId), sucesso: 'Fornecedor retirado.' });
          return;
        }
        const ti = ev.target.closest('[data-tirar-item]');
        if (ti) {
          const it = cot.itens.find((x) => x.id === ti.dataset.tirarItem);
          S.acao({ titulo: 'Tirar item da cotação', texto: S.esc(S.nome(it.descricao)) + ' volta para o saldo da solicitação.', botao: 'Tirar', perigo: true,
            executar: () => S.del('cotacoes/' + cot.id + '/itens/' + it.id), sucesso: 'Item retirado.' });
          return;
        }
        const b = ev.target.closest('[data-acao]');
        if (!b) return;
        const acao = b.dataset.acao;
        try {
          if (acao === 'salvar') { b.disabled = true; await salvar(false); b.disabled = false; }
          else if (acao === 'imprimir') window.print();
          else if (acao === 'auto-item' || acao === 'auto-forn') { vencedorAuto(acao === 'auto-forn' ? 'forn' : 'item'); marcarSujo(true); desenhar(); }
          else if (acao === 'limpar') { selecao.forEach((m) => m.clear()); marcarSujo(true); desenhar(); }
          else if (acao === 'rodada') {
            if (sujo) await salvar(true);
            S.acao({ titulo: 'Nova rodada de negociação', texto: 'Abre a ' + (cot.rodada + 1) + 'ª rodada partindo dos preços atuais. Os fornecedores podem mandar preços novos pelo mesmo link; a rodada anterior fica guardada para comparação.',
              botao: 'Abrir rodada', executar: () => S.post('cotacoes/' + cot.id + '/rodada'), sucesso: 'Nova rodada aberta.' });
          } else if (acao === 'cancelar') {
            S.acao({ titulo: 'Cancelar cotação nº ' + cot.numero, texto: 'Os itens voltam para o saldo das solicitações.', botao: 'Cancelar cotação', perigo: true, motivo: 'obrigatorio',
              executar: (motivo) => S.post('cotacoes/' + cot.id + '/cancelar', { motivo }), sucesso: 'Cotação cancelada.' });
          } else if (acao === 'convites') { if (sujo) await salvar(true); convites(); }
          else if (acao === 'mais-forn') { if (sujo) await salvar(true); maisFornecedor(); }
          else if (acao === 'mais-itens') { if (sujo) await salvar(true); maisItens(); }
          else if (acao === 'gerar') { await salvar(true); gerar(); }
        } catch (e) { S.falhou(e); b.disabled = false; }
      });

      async function convites() {
        const linhas = cot.fornecedores.map((f) => '<tr><td>' + S.esc(f.nome) + '<small>' + S.esc(f.email || 'sem e-mail') + '</small></td><td>' + statusResposta(f) + '</td>' +
          '<td class="acoes"><button type="button" class="btn btn-ghost btn-xs" data-copiar="' + S.esc(f.token) + '">' + S.ic('copiar') + 'Copiar link</button></td></tr>').join('');
        S.dialogo({
          titulo: 'Convites da cotação nº ' + cot.numero, tamanho: 'md', botao: 'Enviar por e-mail',
          corpo: '<p class="texto">Cada fornecedor recebe um link só dele para informar preços, marca, prazo, frete e condição de pagamento, sem precisar de login. ' +
            'Quem não tem e-mail: copie o link e mande por WhatsApp.</p><div class="supr-tabela-wrap"><table class="supr-tabela"><tbody>' + linhas + '</tbody></table></div><div data-resultado></div>',
          aoAbrir: (corpo) => corpo.addEventListener('click', (ev) => {
            const b = ev.target.closest('[data-copiar]');
            if (b) S.copiar(location.origin + '/portal-fornecedor?t=' + b.dataset.copiar);
          }),
          aoConfirmar: async (corpo) => {
            const r = await S.post('cotacoes/' + cot.id + '/convites', {});
            const ok = r.resultado.filter((x) => x.enviado).length;
            corpo.querySelector('[data-resultado]').innerHTML = '<p class="supr-nota ' + (ok === r.resultado.length ? 'ok' : 'alerta') + '" style="margin-top:12px">' +
              r.resultado.map((x) => S.esc(x.nome) + ': ' + (x.enviado ? 'e-mail enviado' : 'não enviado (' + S.esc(x.erro || '') + ') — use "Copiar link"')).join('<br>') + '</p>';
            return false;
          }
        });
      }
      async function maisFornecedor() {
        const lista = (await S.fornecedores()).filter((f) => !cot.fornecedores.some((x) => x.fornecedorId === f.id));
        const r = await S.dialogo({
          titulo: 'Incluir fornecedor na cotação', botao: 'Incluir',
          corpo: '<label class="campo">Fornecedor<select data-f>' + S.opcoesFornecedores(lista, '') + '</select></label>' +
            '<p class="supr-dica" style="margin-top:8px">Não está na lista? <button type="button" class="supr-link" data-novo>Cadastrar fornecedor</button></p>',
          aoAbrir: (corpo, dlg, fechar) => corpo.querySelector('[data-novo]').addEventListener('click', async () => {
            const id = await S.novoFornecedor();
            if (id) { await S.post('cotacoes/' + cot.id + '/fornecedores', { fornecedorId: id }); fechar(true); }
          }),
          aoConfirmar: async (corpo) => {
            const id = corpo.querySelector('[data-f]').value;
            if (!id) { S.aviso('Escolha o fornecedor.', 'erro'); return false; }
            await S.post('cotacoes/' + cot.id + '/fornecedores', { fornecedorId: id });
            return true;
          }
        }).resultado;
        if (r) { S.aviso('Fornecedor incluído.'); S.recarregar(); }
      }
      async function maisItens() {
        const r0 = await S.get('solicitacoes/itens-para-compra?obra=' + encodeURIComponent(cot.orcamentoId));
        const itens = r0.itens.filter((i) => i.saldoParaCotar > 1e-6 && !cot.itens.some((x) => x.solicitacaoItemId === i.id));
        const r = await S.dialogo({
          titulo: 'Incluir itens na cotação', tamanho: 'lg', botao: 'Incluir marcados',
          corpo: tabelaItensParaCompra(itens, orc, new Set(), 'saldoParaCotar'),
          aoAbrir: (corpo) => ligarMarcarTodos(corpo),
          aoConfirmar: async (corpo) => {
            const its = lerItensMarcados(corpo, itens, 'saldoParaCotar');
            if (!its.length) { S.aviso('Marque ao menos um item.', 'erro'); return false; }
            await S.post('cotacoes/' + cot.id + '/itens', { itens: its });
            return true;
          }
        }).resultado;
        if (r) { S.aviso('Itens incluídos.'); S.recarregar(); }
      }
      async function gerar() {
        const porForn = new Map();
        for (const it of cot.itens) for (const [fid, q] of selecao.get(it.id)) {
          const pr = precoDe(it.id, fid, cot.rodada);
          if (!pr) continue;
          porForn.set(fid, (porForn.get(fid) || 0) + pr * q);
        }
        if (!porForn.size) { S.aviso('Marque os vencedores no mapa antes de gerar os pedidos.', 'erro'); return; }
        const semVencedor = cot.itens.filter((it) => !selecao.get(it.id).size);
        const lista = Array.from(porForn.entries()).map(([fid, v]) => {
          const f = cot.fornecedores.find((x) => x.fornecedorId === fid);
          const cf = condForn.get(fid);
          return '<li><b>' + S.esc(f.nome) + '</b>: ' + S.moeda(v + (Number(cf.valorFrete) || 0)) + (cf.condicaoPagamento ? ' · ' + S.esc(cf.condicaoPagamento) : '') +
            (cf.prazoEntregaDias != null && cf.prazoEntregaDias !== '' ? ' · entrega em ' + cf.prazoEntregaDias + ' dia(s)' : '') + '</li>';
        }).join('');
        await S.acao({
          titulo: 'Gerar pedidos da cotação nº ' + cot.numero, botao: 'Gerar pedidos', tamanho: 'md',
          texto: 'Um pedido de compra por fornecedor vencedor' + (S.parametro('pedido_exige_autorizacao') === '1' ? ', que vai para autorização' : '') + ':',
          extra: '<ul style="margin:0 0 12px;padding-left:18px;font-size:12.5px">' + lista + '</ul>' +
            (semVencedor.length ? '<p class="supr-nota alerta">Sem vencedor (continuam no saldo da solicitação): ' + semVencedor.map((i) => S.esc(S.nome(i.descricao))).join('; ') + '</p>' : '') +
            '<div class="grade"><label class="campo">Entrega até (se o fornecedor não deu prazo)<input type="date" data-entrega value="' + S.somarDias(S.hoje(), 7) + '"></label>' +
            '<label class="campo">Local de entrega<input data-local value="' + S.esc(S.parametro('local_entrega_padrao') || '') + '" placeholder="Endereço da obra"></label></div>',
          executar: async (motivo, corpo) => {
            const r = await S.post('cotacoes/' + cot.id + '/gerar-pedidos', { dataEntrega: corpo.querySelector('[data-entrega]').value || null,
              localEntrega: corpo.querySelector('[data-local]').value });
            S.aviso(r.pedidos.length + ' pedido(s) gerado(s): ' + r.pedidos.map((x) => 'nº ' + x.numero).join(', ') + '.');
            return r;
          },
          depois: (r) => { if (r.pedidos.length === 1) S.substituir('pedido', { id: r.pedidos[0].id }); else S.substituir('pedidos', {}); }
        });
      }

      desenhar();
    }
  });
})();
