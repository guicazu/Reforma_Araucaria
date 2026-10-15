/* Solicitação de compra (SC): lista, formulário e documento. A obra pede insumos do orçamento
   (com saldo orçado por serviço da EAP) ou fora dele; item acima do saldo ou fora do orçamento vai
   para autorização. Na autorização, os itens desmarcados são reprovados com o motivo. */
(function () {
  'use strict';
  const S = window.Supr;
  const filtro = { situacao: 'abertas', busca: '' };
  const ABERTAS = ['pendente', 'aguardando_compra', 'em_cotacao', 'atendida_parcial'];

  /* ---------- lista ---------- */
  S.registrar('solicitacoes', {
    titulo: 'Solicitações de compra', subtitulo: 'O que a obra precisa comprar, apropriado nos serviços do orçamento', lista: true,
    render: async (c) => {
      const obra = S.obraAtual();
      const { solicitacoes } = await S.get('solicitacoes?obra=' + encodeURIComponent(obra));
      if (!c.vigente()) return;
      const conta = (f) => solicitacoes.filter(f).length;
      const grupos = [
        ['abertas', 'Em aberto', conta((s) => ABERTAS.includes(s.situacao))],
        ['pendente', 'Aguardando autorização', conta((s) => s.situacao === 'pendente')],
        ['comprar', 'Aguardando compra', conta((s) => ['aguardando_compra', 'em_cotacao', 'atendida_parcial'].includes(s.situacao))],
        ['atendida', 'Atendidas', conta((s) => s.situacao === 'atendida')],
        ['encerradas', 'Reprovadas e canceladas', conta((s) => ['reprovada', 'cancelada'].includes(s.situacao))],
        ['', 'Todas', solicitacoes.length]
      ];
      c.innerHTML = '<div class="supr-barra">' + S.busca(filtro.busca, 'Nº, insumo ou solicitante') + S.chips(grupos, filtro.situacao) +
        '<span class="espaco"></span>' + (S.podeEditar() ? S.botao('nova', 'Nova solicitação', { primario: true, icone: 'mais' }) : '') + '</div><div data-tabela></div>';
      const desenhar = () => {
        const f = filtro.situacao;
        const linhas = solicitacoes.filter((s) => (!f ? true : f === 'abertas' ? ABERTAS.includes(s.situacao)
          : f === 'comprar' ? ['aguardando_compra', 'em_cotacao', 'atendida_parcial'].includes(s.situacao)
            : f === 'encerradas' ? ['reprovada', 'cancelada'].includes(s.situacao) : s.situacao === f) &&
          S.combina(filtro.busca, [s.numero, s.resumo, s.solicitanteNome, s.observacoes]));
        c.querySelector('[data-tabela]').innerHTML = S.tabela([
          { t: 'Nº', v: (s) => '<b>' + s.numero + '</b>', c: 'min' },
          { t: 'Data', v: (s) => S.data(s.data), c: 'nowrap' },
          ...(obra ? [] : [{ t: 'Obra', v: (s) => S.esc(S.nomeObra(s.orcamentoId)) }]),
          { t: 'Itens', v: (s) => S.esc(S.nome(s.resumo || '')) + (s.itens > 3 ? '<small>+ ' + (s.itens - 3) + ' item(ns)</small>' : '') },
          { t: 'Solicitante', v: (s) => S.esc(s.solicitanteNome || s.solicitanteEmail) },
          { t: 'Necessidade', v: (s) => S.data(s.necessidade), c: 'nowrap' },
          { t: 'Estimado', v: (s) => S.moeda(s.valorEstimado), c: 'num' },
          { t: 'Situação', v: (s) => S.status('solicitacao', s.situacao) + (s.excedeOrcamento && s.situacao === 'pendente' ? ' ' + S.tag('Acima do orçado', 'amarelo') : '') }
        ], linhas, { id: (s) => s.id, vazio: solicitacoes.length ? 'Nenhuma solicitação com esse filtro.' : '<strong>Nenhuma solicitação ainda</strong>Comece por "Nova solicitação": escolha os insumos do orçamento e os serviços em que serão usados.' });
      };
      c.querySelector('[data-busca]').addEventListener('input', (ev) => { filtro.busca = ev.target.value; desenhar(); });
      c.querySelector('[data-chips]').addEventListener('click', (ev) => {
        const b = ev.target.closest('button[data-valor]');
        if (!b) return;
        filtro.situacao = b.dataset.valor;
        c.querySelectorAll('[data-chips] button').forEach((x) => x.classList.toggle('ativo', x === b));
        desenhar();
      });
      c.addEventListener('click', (ev) => { if (ev.target.closest('[data-acao="nova"]')) S.ir('solicitacao-form', {}); });
      S.aoAbrirLinha(c, (id) => S.ir('solicitacao', { id }));
      desenhar();
    }
  });

  /* ---------- formulário ---------- */
  S.registrar('solicitacao-form', {
    titulo: 'Solicitação de compra', menu: 'solicitacoes',
    render: async (c, p) => {
      if (!S.podeEditar()) { c.innerHTML = '<div class="supr-nota">Seu acesso é só de consulta.</div>'; return; }
      const sc = p.id ? (await S.get('solicitacoes/' + p.id)).solicitacao : null;
      let obraId = sc ? sc.orcamentoId : (p.obra || S.obraAtual());
      let orc = obraId ? await S.orcado(obraId) : null;
      if (!c.vigente()) return;
      // itens do formulário com a quantidade por serviço
      const paraForm = (i) => ({
        insumoChave: i.insumoChave, insumoCodigo: i.insumoCodigo, descricao: i.descricao, unidade: i.unidade, tipo: i.tipo,
        precoReferencia: i.precoOrcado || 0, foraOrcamento: !!i.foraOrcamento, dataNecessidade: i.dataNecessidade, observacao: i.observacao || '',
        quantidade: i.quantidade, apropriacoes: (i.apropriacoes || []).map((a) => ({ servicoId: a.servicoId, quantidade: S.arred(i.quantidade * a.percentual / 100, 4) }))
      });
      let itens = sc ? sc.itens.filter((i) => i.status !== 'cancelado').map(paraForm) : [];
      // o que esta SC já tem gravado conta no "solicitado" do servidor: na edição, devolve para o saldo
      const original = new Map();
      if (sc) for (const i of itens) for (const a of i.apropriacoes) original.set(i.insumoChave + '|' + a.servicoId, (original.get(i.insumoChave + '|' + a.servicoId) || 0) + a.quantidade);

      function jaNoFormulario(exceto) {
        const m = new Map();
        itens.forEach((i, idx) => {
          if (idx === exceto) return;
          for (const a of i.apropriacoes) m.set(i.insumoChave + '|' + a.servicoId, (m.get(i.insumoChave + '|' + a.servicoId) || 0) + a.quantidade);
        });
        original.forEach((v, k) => m.set(k, (m.get(k) || 0) - v));
        return m;
      }
      // situação de cada item frente ao saldo orçado de cada serviço
      function situacaoItens() {
        const usado = new Map();
        original.forEach((v, k) => usado.set(k, -v));
        return itens.map((i) => {
          const ins = orc && orc.insumos.find((x) => x.chave === i.insumoChave && !x.foraOrcamento);
          if (!ins) return 'fora';
          let acima = false;
          for (const a of i.apropriacoes) {
            const s = ins.servicos.find((x) => x.servicoId === a.servicoId);
            const k = i.insumoChave + '|' + a.servicoId;
            const saldo = (s ? s.quantidadeOrcada - s.solicitado : 0) - (usado.get(k) || 0);
            if (a.quantidade > saldo + Math.max(1e-6, (s ? s.quantidadeOrcada : 0) * 1e-6)) acima = true;
            usado.set(k, (usado.get(k) || 0) + a.quantidade);
          }
          return acima ? 'acima' : 'ok';
        });
      }

      c.innerHTML = S.cabecalho({ titulo: sc ? 'Alterar solicitação nº ' + sc.numero : 'Nova solicitação de compra',
        sub: sc && sc.status === 'reprovada' ? 'Reprovada: ' + S.esc(sc.motivoReprovacao || '') + '. Ao salvar, volta para autorização.' : '' }) +
        '<div class="supr-form">' +
        '<label class="duplo">Obra<select data-obra' + (sc ? ' disabled' : '') + '>' + S.opcoesObras(obraId) + '</select></label>' +
        '<label>Data<input type="date" data-data value="' + S.esc(sc ? sc.data : S.hoje()) + '"></label>' +
        '<label>Solicitante<input value="' + S.esc(sc ? sc.solicitanteNome : S.estado.config.usuario.nome) + '" disabled></label>' +
        '<label class="largo">Observações<textarea rows="2" data-obs maxlength="2000" placeholder="Prioridade, frente de serviço, observações para o comprador…">' + S.esc(sc ? sc.observacoes || '' : '') + '</textarea></label>' +
        '</div><div data-avisos></div>' +
        S.secao('Itens', '<div data-itens></div>', S.botao('incluir', 'Incluir insumo', { primario: true, icone: 'mais' })) +
        '<div class="supr-rodape"><button type="button" class="btn btn-ghost" data-voltar>Cancelar</button>' +
        '<button type="button" class="btn btn-primary" data-acao="salvar">' + S.ic('salvar') + (sc ? 'Salvar alterações' : 'Enviar solicitação') + '</button></div>';

      function desenharItens() {
        const alvo = c.querySelector('[data-itens]');
        const avisos = c.querySelector('[data-avisos]');
        avisos.innerHTML = orc && orc.avisos && orc.avisos.length ? orc.avisos.map((a) => '<p class="supr-nota alerta">' + S.esc(a) + '</p>').join('') : '';
        if (!orc) { alvo.innerHTML = '<div class="supr-vazio">Escolha a obra para ver os insumos do orçamento.</div>'; return; }
        const sit = situacaoItens();
        const total = itens.reduce((s, i) => s + i.quantidade * (i.precoReferencia || 0), 0);
        alvo.innerHTML = S.tabela([
          { t: '#', v: (i, k) => String(k + 1), c: 'min' },
          { t: 'Insumo', v: (i) => S.esc(S.nome(i.descricao)) + '<small>' + [i.insumoCodigo ? 'Cód. ' + S.esc(i.insumoCodigo) : '', S.esc(S.TIPOS_INSUMO[i.tipo] || ''), S.esc(i.observacao || '')].filter(Boolean).join(' · ') + '</small>' },
          { t: 'Un.', v: (i) => S.esc(i.unidade), c: 'min' },
          { t: 'Quantidade', v: (i) => S.qtd(i.quantidade), c: 'num' },
          { t: 'Apropriação', v: (i) => S.textoApropriacao(orc, i.apropriacoes.map((a) => ({ servicoId: a.servicoId, percentual: a.quantidade / i.quantidade * 100 }))) },
          { t: 'Necessidade', v: (i) => S.data(i.dataNecessidade), c: 'nowrap' },
          { t: 'Estimado', v: (i) => (i.precoReferencia ? S.moeda(i.quantidade * i.precoReferencia) : '—'), c: 'num' },
          { t: 'Orçamento', v: (i, k) => (sit[k] === 'fora' ? S.tag('Fora do orçamento', 'vermelho') : sit[k] === 'acima' ? S.tag('Acima do saldo', 'amarelo') : S.tag('Dentro do saldo', 'verde')) },
          { t: '', v: (i, k) => '<button type="button" class="btn-icon" data-editar="' + k + '" title="Alterar">' + S.ic('editar') + '</button>' +
            '<button type="button" class="btn-icon btn-danger" data-remover="' + k + '" title="Tirar da solicitação">' + S.ic('excluir') + '</button>', c: 'acoes' }
        ], itens, { vazio: '<strong>Nenhum item</strong>Use "Incluir insumo" para escolher do orçamento (com saldo por serviço) ou buscar fora dele.',
          rodape: itens.length ? '<tr><td colspan="6">Total estimado pelo orçamento</td><td class="num">' + S.moeda(total) + '</td><td colspan="2"></td></tr>' : '' });
        if (sit.some((x) => x !== 'ok')) {
          alvo.insertAdjacentHTML('afterbegin', '<p class="supr-nota alerta">Há item acima do saldo orçado ou fora do orçamento: a solicitação vai para autorização' +
            (S.parametro('bloquear_acima_orcado') === '1' ? ' — e os parâmetros atuais bloqueiam o envio. Ajuste as quantidades.' : '.') + '</p>');
        }
      }

      async function incluirOuEditar(idx) {
        if (!orc) { S.aviso('Escolha a obra primeiro.', 'erro'); return; }
        const item = idx != null ? itens[idx] : null;
        const r = await S.escolherInsumo({ orc, item, ja: jaNoFormulario(idx), titulo: item ? 'Alterar item' : 'Incluir insumo na solicitação' });
        if (!r) return;
        const novo = { ...r, precoReferencia: r.precoReferencia || (item && item.precoReferencia) || 0 };
        if (idx != null) itens[idx] = novo; else itens.push(novo);
        desenharItens();
      }

      c.querySelector('[data-obra]').addEventListener('change', async (ev) => {
        obraId = ev.target.value;
        itens = [];
        orc = null;
        desenharItens();
        if (!obraId) return;
        c.querySelector('[data-itens]').innerHTML = S.carregando('Abrindo o orçamento da obra…');
        try { orc = await S.orcado(obraId); } catch (e) { S.falhou(e); }
        if (c.vigente()) desenharItens();
      });
      c.addEventListener('click', async (ev) => {
        if (ev.target.closest('[data-acao="incluir"]')) { incluirOuEditar(null); return; }
        const ed = ev.target.closest('[data-editar]');
        if (ed) { incluirOuEditar(Number(ed.dataset.editar)); return; }
        const rm = ev.target.closest('[data-remover]');
        if (rm) { itens.splice(Number(rm.dataset.remover), 1); desenharItens(); return; }
        const salvar = ev.target.closest('[data-acao="salvar"]');
        if (!salvar) return;
        if (!obraId) { S.aviso('Escolha a obra.', 'erro'); return; }
        if (!itens.length) { S.aviso('Inclua ao menos um item.', 'erro'); return; }
        salvar.disabled = true;
        try {
          const corpo = {
            orcamentoId: obraId, data: c.querySelector('[data-data]').value || null, observacoes: c.querySelector('[data-obs]').value,
            itens: itens.map((i) => ({ insumoChave: i.insumoChave, insumoCodigo: i.insumoCodigo, descricao: i.descricao, unidade: i.unidade, tipo: i.tipo,
              precoReferencia: i.precoReferencia, dataNecessidade: i.dataNecessidade, observacao: i.observacao, apropriacoes: i.apropriacoes }))
          };
          const r = sc ? await S.put('solicitacoes/' + sc.id, corpo) : await S.post('solicitacoes', corpo);
          const id = sc ? sc.id : r.id;
          S.aviso(r.status === 'autorizada' ? 'Solicitação ' + (r.numero ? 'nº ' + r.numero + ' ' : '') + 'autorizada: já pode ser cotada.'
            : 'Solicitação ' + (r.numero ? 'nº ' + r.numero + ' ' : '') + 'enviada para autorização.');
          S.substituir('solicitacao', { id });
        } catch (e) { S.falhou(e); salvar.disabled = false; }
      });
      desenharItens();
    }
  });

  /* ---------- autorização (também usada na tela Autorizações) ---------- */
  S.autorizarSolicitacao = async (sc, depois) => {
    const orc = await S.orcado(sc.orcamentoId);
    const pendentes = sc.itens.filter((i) => i.status === 'pendente');
    const linhas = pendentes.map((i) => '<tr><td class="min"><input type="checkbox" data-item="' + S.esc(i.id) + '" checked></td>' +
      '<td>' + S.esc(S.nome(i.descricao)) + '<small>' + S.textoApropriacao(orc, i.apropriacoes) + '</small></td>' +
      '<td class="num">' + S.qtd(i.quantidade) + ' ' + S.esc(i.unidade || '') + '</td><td class="num">' + (i.precoOrcado ? S.moeda(i.quantidade * i.precoOrcado) : '—') + '</td>' +
      '<td>' + (i.foraOrcamento ? S.tag('Fora do orçamento', 'vermelho') : i.excedeOrcamento ? S.tag('Acima do saldo', 'amarelo') : S.tag('Dentro do saldo', 'verde')) + '</td></tr>').join('');
    const d = S.dialogo({
      titulo: 'Autorizar solicitação nº ' + sc.numero, tamanho: 'md', botao: 'Autorizar marcados',
      corpo: '<p class="texto">Desmarque os itens que não devem ser comprados: eles serão reprovados com o motivo abaixo.</p>' +
        '<div class="supr-tabela-wrap"><table class="supr-tabela"><thead><tr><th></th><th>Item</th><th class="num">Quantidade</th><th class="num">Estimado</th><th>Orçamento</th></tr></thead><tbody>' +
        linhas + '</tbody></table></div><label class="campo largo" style="margin-top:12px">Motivo dos itens não autorizados<textarea rows="2" data-motivo></textarea></label>',
      aoConfirmar: async (corpo) => {
        const marcados = Array.from(corpo.querySelectorAll('[data-item]:checked')).map((x) => x.dataset.item);
        const motivo = corpo.querySelector('[data-motivo]').value.trim();
        if (!marcados.length) { S.aviso('Nenhum item marcado: use "Reprovar" para reprovar a solicitação inteira.', 'erro'); return false; }
        if (marcados.length < pendentes.length && !motivo) { S.aviso('Informe o motivo dos itens não autorizados.', 'erro'); return false; }
        await S.post('solicitacoes/' + sc.id + '/autorizar', { autorizar: marcados, motivo });
        S.aviso('Solicitação nº ' + sc.numero + ' autorizada.');
        return true;
      }
    });
    const r = await d.resultado;
    if (r) (depois || S.recarregar)();
  };
  S.reprovarSolicitacao = (sc, depois) => S.acao({
    titulo: 'Reprovar solicitação nº ' + sc.numero, botao: 'Reprovar', perigo: true, motivo: 'obrigatorio', rotuloMotivo: 'Motivo da reprovação',
    executar: (motivo) => S.post('solicitacoes/' + sc.id + '/reprovar', { motivo }), sucesso: 'Solicitação reprovada.', depois
  });

  /* ---------- documento ---------- */
  S.registrar('solicitacao', {
    titulo: 'Solicitação de compra', menu: 'solicitacoes',
    render: async (c, p) => {
      const { solicitacao: sc } = await S.get('solicitacoes/' + p.id);
      const orc = await S.orcado(sc.orcamentoId);
      if (!c.vigente()) return;
      const comSaldo = sc.itens.filter((i) => i.saldo > 1e-6);
      const paraCotar = comSaldo.filter((i) => i.saldo - i.emCotacao > 1e-6);
      const acoes = [];
      if (sc.status === 'pendente') {
        if (S.podeAutorizar('solicitacao', sc.valorEstimado)) acoes.push(S.botao('autorizar', 'Autorizar', { primario: true, icone: 'check' }));
        if (S.podeAutorizar('solicitacao', 0)) acoes.push(S.botao('reprovar', 'Reprovar', { perigo: true }));
      }
      if (paraCotar.length && sc.status === 'autorizada') {
        if (S.podeEditar('cotacoes')) acoes.push(S.botao('cotar', 'Gerar cotação', { primario: true, icone: 'cotacao' }));
        if (S.podeEditar('pedidos')) acoes.push(S.botao('comprar', 'Comprar direto', { icone: 'suprimentos', titulo: 'Pedido de compra sem cotação' }));
      }
      if (S.podeEditar()) {
        if (['pendente', 'reprovada'].includes(sc.status)) acoes.push(S.botao('editar', sc.status === 'reprovada' ? 'Alterar e reenviar' : 'Alterar', { icone: 'editar' }));
        if (['pendente', 'autorizada'].includes(sc.status) && sc.itens.some((i) => ['pendente', 'autorizado'].includes(i.status) && i.comprado <= 1e-6 && i.emCotacao <= 1e-6)) {
          acoes.push(S.botao('cancelar', 'Cancelar', { perigo: true }));
        }
      }
      acoes.push(S.botao('imprimir', 'Imprimir', { icone: 'imprimir' }));
      const ns = (lista, chave, aba) => lista.map((x) => '<button type="button" class="supr-link" data-ir="' + aba + '" data-id="' + S.esc(x.id) + '">nº ' + x.numero + '</button>').join(', ');
      c.innerHTML = S.cabecalho({ voltar: 'Voltar', titulo: 'Solicitação de compra nº ' + sc.numero, status: S.status('solicitacao', sc.situacao) +
        (sc.excedeOrcamento ? ' ' + S.tag('Com item acima do orçado', 'amarelo') : ''), sub: S.esc(S.nomeObra(sc.orcamentoId)), acoes: acoes.join('') }) +
        (sc.status === 'reprovada' && sc.motivoReprovacao ? '<p class="supr-nota erro">Reprovada por ' + S.esc(sc.autorizadoPor || '') + ': ' + S.esc(sc.motivoReprovacao) + '</p>' : '') +
        (sc.status === 'autorizada' && sc.motivoReprovacao ? '<p class="supr-nota">Itens não autorizados: ' + S.esc(sc.motivoReprovacao) + '</p>' : '') +
        S.ficha([
          ['Obra', S.esc(S.nomeObra(sc.orcamentoId))], ['Data', S.data(sc.data)], ['Solicitante', S.esc(sc.solicitanteNome || sc.solicitanteEmail)],
          ['Valor estimado (orçamento)', S.moeda(sc.valorEstimado)],
          ['Autorização', sc.autorizadoEm ? S.esc(sc.autorizadoPor || '') + ' em ' + S.dataHora(sc.autorizadoEm) : 'Aguardando'],
          ['Observações', S.esc(sc.observacoes || ''), true]
        ]) +
        S.secao('Itens', S.tabela([
          { t: '#', v: (i) => String(i.seq), c: 'min' },
          { t: 'Insumo', v: (i) => S.esc(S.nome(i.descricao)) + '<small>' + [i.insumoCodigo ? 'Cód. ' + S.esc(i.insumoCodigo) : '', S.esc(i.observacao || '')].filter(Boolean).join(' · ') + '</small>' },
          { t: 'Un.', v: (i) => S.esc(i.unidade), c: 'min' },
          { t: 'Solicitado', v: (i) => S.qtd(i.quantidade), c: 'num' },
          { t: 'Apropriação', v: (i) => S.textoApropriacao(orc, i.apropriacoes) },
          { t: 'Necessidade', v: (i) => S.data(i.dataNecessidade), c: 'nowrap' },
          { t: 'Em cotação', v: (i) => (i.emCotacao > 1e-6 ? S.qtd(i.emCotacao) + '<small>' + ns(i.cotacoes, 'numero', 'cotacao') + '</small>' : '—'), c: 'num' },
          { t: 'Comprado', v: (i) => (i.comprado > 1e-6 ? S.qtd(i.comprado) + '<small>' + ns(i.pedidos, 'numero', 'pedido') + '</small>' : '—'), c: 'num' },
          { t: 'Recebido', v: (i) => (i.recebido > 1e-6 ? S.qtd(i.recebido) : '—'), c: 'num' },
          { t: 'Saldo', v: (i) => '<b>' + S.qtd(i.saldo) + '</b>', c: 'num' },
          { t: 'Situação', v: (i) => '<span class="supr-tags">' + S.status('item', i.status) + (i.encerrado ? S.tag('Saldo encerrado', 'cinza') : '') +
            (i.foraOrcamento ? S.tag('Fora do orçamento', 'vermelho') : i.excedeOrcamento ? S.tag('Acima do saldo', 'amarelo') : '') + '</span>' },
          { t: '', v: (i) => (S.podeEditar() && i.status === 'autorizado' && !i.encerrado && i.comprado > 1e-6 && i.saldo > 1e-6 && i.emCotacao <= 1e-6
            ? '<button type="button" class="btn btn-ghost btn-xs" data-encerrar="' + S.esc(i.id) + '" title="O que falta comprar volta para o saldo do orçamento">Encerrar saldo</button>' : ''), c: 'acoes' }
        ], sc.itens)) +
        S.secao('Histórico', S.historico(sc.historico));

      c.addEventListener('click', (ev) => {
        const ir = ev.target.closest('[data-ir]');
        if (ir) { S.ir(ir.dataset.ir, { id: ir.dataset.id }); return; }
        const enc = ev.target.closest('[data-encerrar]');
        if (enc) {
          const item = sc.itens.find((i) => i.id === enc.dataset.encerrar);
          S.acao({ titulo: 'Encerrar saldo do item ' + item.seq, texto: 'Foram comprados <b>' + S.qtd(item.comprado) + ' de ' + S.qtd(item.quantidade) + ' ' + S.esc(item.unidade || '') +
            '</b>. O que falta deixa de ser solicitado e volta para o saldo do orçamento.', botao: 'Encerrar saldo', motivo: 'opcional',
          executar: (motivo) => S.post('solicitacoes/' + sc.id + '/itens/' + item.id + '/encerrar', { motivo }), sucesso: 'Saldo encerrado.' });
          return;
        }
        const b = ev.target.closest('[data-acao]');
        if (!b) return;
        const acao = b.dataset.acao;
        if (acao === 'autorizar') S.autorizarSolicitacao(sc);
        else if (acao === 'reprovar') S.reprovarSolicitacao(sc);
        else if (acao === 'editar') S.ir('solicitacao-form', { id: sc.id });
        else if (acao === 'cotar') S.ir('cotacao-form', { obra: sc.orcamentoId, itens: paraCotar.map((i) => i.id) });
        else if (acao === 'comprar') S.ir('pedido-form', { obra: sc.orcamentoId, itens: paraCotar.map((i) => i.id) });
        else if (acao === 'imprimir') window.print();
        else if (acao === 'cancelar') {
          const cancelaveis = sc.itens.filter((i) => ['pendente', 'autorizado'].includes(i.status) && i.comprado <= 1e-6 && i.emCotacao <= 1e-6);
          S.acao({ titulo: 'Cancelar solicitação nº ' + sc.numero, perigo: true, botao: 'Cancelar itens', motivo: 'obrigatorio', rotuloMotivo: 'Motivo do cancelamento',
            texto: 'Serão cancelados os itens sem pedido e fora de cotação:', extra: '<ul style="margin:0 0 12px;padding-left:18px;font-size:12.5px">' +
              cancelaveis.map((i) => '<li>' + S.esc(S.nome(i.descricao)) + ' — ' + S.qtd(i.quantidade) + ' ' + S.esc(i.unidade || '') + '</li>').join('') + '</ul>',
            executar: (motivo) => S.post('solicitacoes/' + sc.id + '/cancelar', { motivo, itens: cancelaveis.map((i) => i.id) }), sucesso: 'Itens cancelados.' });
        }
      });
    }
  });
})();
