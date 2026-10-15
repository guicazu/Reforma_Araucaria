/* Estoque (almoxarifado) da obra: saldos com custo médio e movimentações; saída de material para um
   serviço da EAP (requisição de material), entrada avulsa, transferência entre obras, inventário
   (contagem física vira ajuste) e estorno de movimento manual. */
(function () {
  'use strict';
  const S = window.Supr;
  const filtro = { aba: 'saldos', busca: '', soComSaldo: true };
  const TIPOS = {
    entrada: ['Entrada por nota', 'verde', 1], saida: ['Saída para serviço', 'azul', -1], transferencia_entrada: ['Transferência recebida', 'verde', 1],
    transferencia_saida: ['Transferência enviada', 'roxo', -1], ajuste_entrada: ['Entrada avulsa / ajuste', 'cinza', 1], ajuste_saida: ['Saída por ajuste', 'amarelo', -1]
  };

  S.registrar('estoque', {
    titulo: 'Estoque da obra', subtitulo: 'Saldos, requisições de material, transferências e inventário', lista: true,
    render: async (c) => {
      if (S.semObra(c, 'O estoque é controlado por obra (almoxarifado da obra).')) return;
      const obra = S.obraAtual();
      const [sal, mov, orc] = await Promise.all([S.get('estoque/saldos?obra=' + encodeURIComponent(obra)), S.get('estoque/movimentos?obra=' + encodeURIComponent(obra)), S.orcado(obra)]);
      if (!c.vigente()) return;
      const saldos = sal.saldos;
      const movimentos = mov.movimentos;
      const comSaldo = saldos.filter((s) => s.saldo > 1e-6);
      const desenhar = () => {
        const acoes = S.podeEditar() ? S.botao('saida', 'Saída para serviço', { primario: true, icone: 'enviar' }) + S.botao('entrada', 'Entrada avulsa', { icone: 'baixar' }) +
          S.botao('transferir', 'Transferir', { icone: 'fornecedor' }) + S.botao('inventario', 'Inventário', { icone: 'prancheta' }) : '';
        let h = '<div class="supr-cards"><div class="supr-card"><span class="rotulo">Valor em estoque</span><span class="valor">' + S.moeda(sal.valorTotal) + '</span>' +
          '<span class="det">pelo custo médio</span></div><div class="supr-card"><span class="rotulo">Itens com saldo</span><span class="valor">' + comSaldo.length + '</span></div>' +
          '<div class="supr-card"><span class="rotulo">Movimentos</span><span class="valor">' + movimentos.length + '</span></div></div>' +
          '<div class="supr-abas"><button type="button" data-aba="saldos"' + (filtro.aba === 'saldos' ? ' class="ativo"' : '') + '>Saldos</button>' +
          '<button type="button" data-aba="movimentos"' + (filtro.aba === 'movimentos' ? ' class="ativo"' : '') + '>Movimentações</button></div>' +
          '<div class="supr-barra">' + S.busca(filtro.busca, 'Insumo') +
          (filtro.aba === 'saldos' ? '<label class="check" style="display:inline-flex;gap:6px;align-items:center;font-size:12px"><input type="checkbox" data-so-saldo' + (filtro.soComSaldo ? ' checked' : '') + '>Só com saldo</label>' : '') +
          '<span class="espaco"></span>' + acoes + '</div>';
        if (filtro.aba === 'saldos') {
          const linhas = saldos.filter((s) => (!filtro.soComSaldo || Math.abs(s.saldo) > 1e-6) && S.combina(filtro.busca, [s.codigo, s.descricao]));
          h += S.tabela([
            { t: 'Insumo', v: (s) => S.esc(S.nome(s.descricao)) + (s.codigo ? '<small>Cód. ' + S.esc(s.codigo) + '</small>' : '') },
            { t: 'Un.', v: (s) => S.esc(s.unidade), c: 'min' },
            { t: 'Entradas', v: (s) => S.qtd(s.entradas), c: 'num' },
            { t: 'Saídas', v: (s) => S.qtd(s.saidas), c: 'num' },
            { t: 'Saldo', v: (s) => '<b class="' + (s.saldo < -1e-6 ? 'supr-negativo' : '') + '">' + S.qtd(s.saldo) + '</b>', c: 'num' },
            { t: 'Custo médio', v: (s) => S.moeda(s.custoMedio), c: 'num' },
            { t: 'Valor', v: (s) => S.moeda(s.valorSaldo), c: 'num' },
            { t: 'Última mov.', v: (s) => S.data(s.ultimaMovimentacao), c: 'nowrap' }
          ], linhas, { id: (s) => s.chave, vazio: saldos.length ? 'Nenhum insumo com esse filtro.' : '<strong>Estoque vazio</strong>Os materiais entram pela nota fiscal (opção "dar entrada no estoque") ou por entrada avulsa.' });
        } else {
          const linhas = movimentos.filter((m) => S.combina(filtro.busca, [m.descricao, m.documento, m.observacao]));
          h += S.tabela([
            { t: 'Data', v: (m) => S.data(m.data), c: 'nowrap' },
            { t: 'Movimento', v: (m) => S.tag((TIPOS[m.tipo] || [m.tipo, 'cinza'])[0], (TIPOS[m.tipo] || [0, 'cinza'])[1]) },
            { t: 'Insumo', v: (m) => S.esc(S.nome(m.descricao)) + (m.observacao ? '<small>' + S.esc(m.observacao) + '</small>' : '') },
            { t: 'Quantidade', v: (m) => ((TIPOS[m.tipo] || [0, 0, 1])[2] > 0 ? '+' : '−') + S.qtd(m.quantidade) + ' ' + S.esc(m.unidade || ''), c: 'num' },
            { t: 'Valor', v: (m) => S.moeda(m.valorTotal), c: 'num' },
            { t: 'Serviço', v: (m) => (m.servicoId ? '<span title="' + S.esc(S.nomeServico(orc, m.servicoId)) + '">' + S.esc((S.servicoPorId(orc, m.servicoId) || {}).eap || '—') + '</span>' : '—'), c: 'nowrap' },
            { t: 'Documento', v: (m) => S.esc(m.documento || (m.origemTipo === 'inventario' ? 'Inventário' : '—')) },
            { t: 'Por', v: (m) => S.esc(m.usuarioNome || m.usuarioEmail) + '<small>' + S.dataHora(m.criadoEm) + '</small>' },
            { t: '', v: (m) => (m.estornado ? S.tag('Estornado', 'cinza') : (S.podeEditar() && m.origemTipo !== 'nota' ? '<button type="button" class="btn btn-ghost btn-xs" data-estornar="' + S.esc(m.id) + '">Estornar</button>' : '')), c: 'acoes' }
          ], linhas, { classeLinha: (m) => (m.estornado ? 'riscado' : ''), vazio: 'Nenhuma movimentação.' });
        }
        c.innerHTML = h;
        const busca = c.querySelector('[data-busca]');
        busca.addEventListener('input', (ev) => { filtro.busca = ev.target.value; const pos = ev.target.selectionStart; desenhar(); const b = c.querySelector('[data-busca]'); b.focus(); b.setSelectionRange(pos, pos); });
      };

      // linhas de insumos com saldo (saída, transferência)
      const linhaSaldo = (k, comServico) => '<tr data-linha="' + k + '"><td><select data-insumo style="min-width:260px"><option value="">Escolha o insumo</option>' +
        comSaldo.map((s) => '<option value="' + S.esc(s.chave) + '">' + S.esc(S.nome(s.descricao) + ' — saldo ' + S.qtd(s.saldo) + ' ' + s.unidade) + '</option>').join('') + '</select></td>' +
        '<td class="num"><input class="num" inputmode="decimal" data-qtd></td>' +
        (comServico ? '<td><select data-servico style="max-width:280px">' + S.opcoesServicos(orc, '') + '</select></td>' : '') +
        '<td class="acoes"><button type="button" class="btn-icon btn-danger" data-tirar-linha>' + S.ic('excluir') + '</button></td></tr>';
      function dialogoLinhas(op) {
        let n = 0;
        return S.dialogo({
          titulo: op.titulo, tamanho: 'lg', botao: op.botao,
          corpo: (op.topo || '') + '<div class="supr-tabela-wrap"><table class="supr-tabela"><thead><tr><th>Insumo</th><th class="num">Quantidade</th>' +
            (op.servico ? '<th>Serviço que consumiu (apropriação)</th>' : '') + '<th></th></tr></thead><tbody data-linhas>' + linhaSaldo(n++, op.servico) + '</tbody></table></div>' +
            '<button type="button" class="btn btn-ghost btn-sm" data-mais-linha style="margin-top:8px">' + S.ic('mais') + 'Outro insumo</button>' +
            '<div class="grade" style="margin-top:12px"><label class="campo">Data<input type="date" data-data value="' + S.hoje() + '"></label>' +
            '<label class="campo">Documento<input data-doc placeholder="' + S.esc(op.docExemplo || 'Nº da requisição') + '"></label>' +
            '<label class="campo largo">Observação<input data-obs maxlength="500"></label></div>',
          aoAbrir: (corpo) => corpo.addEventListener('click', (ev) => {
            if (ev.target.closest('[data-mais-linha]')) corpo.querySelector('[data-linhas]').insertAdjacentHTML('beforeend', linhaSaldo(n++, op.servico));
            const t = ev.target.closest('[data-tirar-linha]');
            if (t && corpo.querySelectorAll('[data-linha]').length > 1) t.closest('tr').remove();
          }),
          aoConfirmar: async (corpo) => {
            const itens = [];
            for (const tr of corpo.querySelectorAll('[data-linha]')) {
              const chave = tr.querySelector('[data-insumo]').value;
              const q = S.num(tr.querySelector('[data-qtd]').value);
              if (!chave && !q) continue;
              if (!chave || !(q > 0)) { S.aviso('Escolha o insumo e a quantidade em cada linha.', 'erro'); return false; }
              const it = { insumoChave: chave, quantidade: q };
              if (op.servico) {
                it.servicoId = tr.querySelector('[data-servico]').value;
                if (!it.servicoId) { S.aviso('Escolha o serviço que consumiu o material.', 'erro'); return false; }
              }
              itens.push(it);
            }
            if (!itens.length) { S.aviso('Inclua ao menos um insumo.', 'erro'); return false; }
            await op.enviar({ itens, data: corpo.querySelector('[data-data]').value || null, documento: corpo.querySelector('[data-doc]').value,
              observacao: corpo.querySelector('[data-obs]').value }, corpo);
            S.aviso(op.sucesso);
            return true;
          }
        }).resultado;
      }

      c.addEventListener('change', (ev) => { if (ev.target.matches('[data-so-saldo]')) { filtro.soComSaldo = ev.target.checked; desenhar(); } });
      c.addEventListener('click', async (ev) => {
        const aba = ev.target.closest('[data-aba]');
        if (aba) { filtro.aba = aba.dataset.aba; desenhar(); return; }
        const est = ev.target.closest('[data-estornar]');
        if (est) {
          const m = movimentos.find((x) => x.id === est.dataset.estornar);
          S.acao({ titulo: 'Estornar movimento', botao: 'Estornar', perigo: true, motivo: 'obrigatorio',
            texto: S.esc((TIPOS[m.tipo] || [m.tipo])[0]) + ': ' + S.esc(S.nome(m.descricao)) + ', ' + S.qtd(m.quantidade) + ' ' + S.esc(m.unidade || '') +
              (m.origemTipo === 'transferencia' ? '. <b>Estorna os dois lados da transferência.</b>' : '.'),
            executar: (motivo) => S.post('estoque/movimentos/' + m.id + '/estornar', { motivo }), sucesso: 'Movimento estornado.' });
          return;
        }
        const b = ev.target.closest('[data-acao]');
        if (!b) return;
        let ok = null;
        if (b.dataset.acao === 'saida') {
          if (!comSaldo.length) { S.aviso('Não há material com saldo no estoque desta obra.', 'erro'); return; }
          ok = await dialogoLinhas({ titulo: 'Saída de material para serviço', botao: 'Registrar saída', servico: true, docExemplo: 'Nº da requisição de material',
            topo: '<p class="texto">O consumo fica apropriado no serviço escolhido e sai pelo custo médio.</p>',
            enviar: (d) => S.post('estoque/saidas', { orcamentoId: obra, ...d }), sucesso: 'Saída registrada.' });
        } else if (b.dataset.acao === 'transferir') {
          if (!comSaldo.length) { S.aviso('Não há material com saldo para transferir.', 'erro'); return; }
          const outras = S.estado.obras.filter((o) => o.id !== obra);
          if (!outras.length) { S.aviso('Não há outra obra para receber a transferência.', 'erro'); return; }
          ok = await dialogoLinhas({ titulo: 'Transferir material para outra obra', botao: 'Transferir', docExemplo: 'Nº da guia de transferência',
            topo: '<label class="campo" style="margin-bottom:12px">Obra de destino<select data-destino>' + outras.map((o) => '<option value="' + S.esc(o.id) + '">' + S.esc(S.nomeObra(o.id)) + '</option>').join('') + '</select></label>',
            enviar: (d, corpo) => S.post('estoque/transferencias', { origemId: obra, destinoId: corpo.querySelector('[data-destino]').value, ...d }), sucesso: 'Transferência registrada.' });
        } else if (b.dataset.acao === 'entrada') {
          const r = await S.escolherInsumo({ orc, titulo: 'Entrada avulsa no estoque', apropriacao: false, preco: true, necessidade: false, botao: 'Continuar' });
          if (!r) return;
          ok = await S.acao({ titulo: 'Entrada avulsa: ' + S.nome(r.descricao), botao: 'Registrar entrada', depois: false,
            texto: S.qtd(r.quantidade) + ' ' + S.esc(r.unidade) + ' a ' + S.moeda(r.precoUnitario || 0) + ' (sobra de obra, devolução, material recebido sem nota…).',
            extra: '<div class="grade"><label class="campo">Data<input type="date" data-data value="' + S.hoje() + '"></label><label class="campo">Documento<input data-doc></label>' +
              '<label class="campo largo">Observação<input data-obs maxlength="500"></label></div>',
            executar: (m, corpo) => S.post('estoque/entradas', { orcamentoId: obra, data: corpo.querySelector('[data-data]').value || null, documento: corpo.querySelector('[data-doc]').value,
              observacao: corpo.querySelector('[data-obs]').value, itens: [{ insumoChave: r.insumoChave, insumoCodigo: r.insumoCodigo, descricao: r.descricao, unidade: r.unidade,
                quantidade: r.quantidade, valorUnitario: r.precoUnitario }] }), sucesso: 'Entrada registrada.' });
        } else if (b.dataset.acao === 'inventario') {
          const itens = saldos.filter((s) => Math.abs(s.saldo) > 1e-6 || s.entradas > 0);
          if (!itens.length) { S.aviso('Nada para inventariar ainda.', 'erro'); return; }
          ok = await S.dialogo({ titulo: 'Inventário do estoque', tamanho: 'lg', botao: 'Registrar inventário',
            corpo: '<p class="texto">Informe a quantidade contada de cada insumo. A diferença para o saldo do sistema vira ajuste de entrada ou saída (pelo custo médio). Deixe em branco o que não foi contado.</p>' +
              S.tabela([
                { t: 'Insumo', v: (s) => S.esc(S.nome(s.descricao)) },
                { t: 'Un.', v: (s) => S.esc(s.unidade), c: 'min' },
                { t: 'No sistema', v: (s) => S.qtd(s.saldo), c: 'num' },
                { t: 'Contado', v: (s) => '<input class="num" inputmode="decimal" data-contado="' + S.esc(s.chave) + '">', c: 'num' }
              ], itens) + '<div class="grade" style="margin-top:12px"><label class="campo">Data<input type="date" data-data value="' + S.hoje() + '"></label>' +
              '<label class="campo largo">Observação<input data-obs maxlength="500" placeholder="Quem contou, setor…"></label></div>',
            aoConfirmar: async (corpo) => {
              const lidos = Array.from(corpo.querySelectorAll('[data-contado]')).filter((x) => x.value.trim() !== '')
                .map((x) => ({ insumoChave: x.dataset.contado, quantidadeContada: S.num(x.value) }));
              if (!lidos.length) { S.aviso('Informe ao menos uma contagem.', 'erro'); return false; }
              if (lidos.some((x) => x.quantidadeContada == null || x.quantidadeContada < 0)) { S.aviso('Contagem inválida.', 'erro'); return false; }
              const r = await S.post('estoque/inventario', { orcamentoId: obra, data: corpo.querySelector('[data-data]').value || null, observacao: corpo.querySelector('[data-obs]').value, itens: lidos });
              S.aviso(r.ajustes ? r.ajustes + ' ajuste(s) registrado(s).' : 'Contagem igual ao sistema: nenhum ajuste.');
              return true;
            } }).resultado;
        }
        if (ok) S.recarregar();
      });
      S.aoAbrirLinha(c, (chave) => { filtro.aba = 'movimentos'; filtro.busca = (saldos.find((s) => s.chave === chave) || {}).descricao || ''; desenhar(); });
      desenhar();
    }
  });
})();
