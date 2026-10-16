/* Acompanhamento de custos da obra: orçado × comprometido (pedidos autorizados ainda não entregues e
   saldo de contratos) × realizado (notas fiscais e medições autorizadas), por serviço na EAP e por
   insumo (quantidades orçada, solicitada, comprada e recebida). Exporta CSV para o Excel. */
(function () {
  'use strict';
  const S = window.Supr;
  const filtro = { aba: 'servicos', nivel: 2, soMovimento: false, busca: '', tipo: '', soAcima: false };

  const csv = S.csv;
  const baixar = S.baixar;

  S.registrar('acompanhamento', {
    titulo: 'Acompanhamento de custos', subtitulo: 'Orçado × comprometido × realizado, por serviço e por insumo', lista: true,
    render: async (c) => {
      if (S.semObra(c, 'O acompanhamento compara o orçamento de uma obra com o que já foi comprado e contratado.')) return;
      const d = await S.orcado(S.obraAtual(), true);
      if (!c.vigente()) return;
      const t = d.totais;
      const usado = t.comprometido + t.realizado;
      const pct = (v) => (t.orcado > 0 ? v / t.orcado * 100 : 0);

      // EAP com os valores somados para cima (unidade ← etapa ← sub etapa ← serviço)
      const nos = d.eap.map((n) => ({ ...n, orcadoT: n.tipo === 'servico' ? n.valor : 0, comprometidoT: n.comprometido || 0, realizadoT: n.realizado || 0, aprovacaoT: n.emAprovacao || 0 }));
      const porId = new Map(nos.map((n) => [n.id, n]));
      for (const n of nos) {
        if (n.tipo !== 'servico') continue;
        let pai = porId.get(n.paiId);
        while (pai) {
          pai.orcadoT += n.orcadoT; pai.comprometidoT += n.comprometidoT; pai.realizadoT += n.realizadoT; pai.aprovacaoT += n.aprovacaoT;
          pai = porId.get(pai.paiId);
        }
      }
      for (const n of d.foraDaEap) nos.push({ ...n, nivel: 1, orcadoT: 0, comprometidoT: n.comprometido, realizadoT: n.realizado, aprovacaoT: n.emAprovacao, removido: true });

      function desenhar() {
        let h = (d.avisos || []).map((a) => '<p class="supr-nota alerta">' + S.esc(a) + '</p>').join('') +
          '<div class="supr-cards">' +
          '<div class="supr-card"><span class="rotulo">Orçado</span><span class="valor">' + S.moeda(t.orcado) + '</span><span class="det">Versão V' + d.versao.numero + ' · rev. ' + d.versao.revisao +
          (d.referenciaSinapi ? ' · SINAPI ' + S.esc(d.referenciaSinapi) : '') + '</span></div>' +
          '<div class="supr-card"><span class="rotulo">Realizado</span><span class="valor">' + S.moeda(t.realizado) + '</span><span class="det">' + S.pct(pct(t.realizado)) + ' · notas e medições</span></div>' +
          '<div class="supr-card"><span class="rotulo">Comprometido</span><span class="valor">' + S.moeda(t.comprometido) + '</span><span class="det">' + S.pct(pct(t.comprometido)) + ' · pedidos e contratos a receber</span></div>' +
          '<div class="supr-card' + (t.emAprovacao ? ' alerta' : '') + '"><span class="rotulo">Em aprovação</span><span class="valor">' + S.moeda(t.emAprovacao) + '</span><span class="det">pedidos e contratos pendentes</span></div>' +
          '<div class="supr-card' + (t.saldo < 0 ? ' perigo' : '') + '"><span class="rotulo">Saldo do orçamento</span><span class="valor">' + S.moeda(t.saldo) + '</span><span class="det">' + S.pct(pct(usado)) + ' já usado</span></div></div>' +
          '<div class="supr-progresso" title="Realizado + comprometido + em aprovação sobre o orçado"><span class="realizado" style="width:' + Math.min(100, pct(t.realizado)) + '%"></span>' +
          '<span class="comprometido" style="width:' + Math.max(0, Math.min(100 - pct(t.realizado), pct(t.comprometido))) + '%"></span>' +
          '<span class="aprovacao" style="width:' + Math.max(0, Math.min(100 - pct(usado), pct(t.emAprovacao))) + '%"></span></div>' +
          '<div class="supr-legenda" style="margin-bottom:16px"><span><i style="background:var(--tinta)"></i>Realizado</span><span><i style="background:#a1a1aa"></i>Comprometido</span>' +
          '<span><i style="background:#d4d4d8"></i>Em aprovação</span></div>' +
          '<div class="supr-abas"><button type="button" data-aba="servicos"' + (filtro.aba === 'servicos' ? ' class="ativo"' : '') + '>Por serviço (EAP)</button>' +
          '<button type="button" data-aba="insumos"' + (filtro.aba === 'insumos' ? ' class="ativo"' : '') + '>Por insumo</button></div>';
        if (filtro.aba === 'servicos') {
          h += '<div class="supr-barra"><span class="supr-dica">Níveis</span>' + S.chips([['1', '1'], ['2', '2'], ['3', '3'], ['4', 'Serviços']], String(filtro.nivel)) +
            '<label class="check" style="display:inline-flex;gap:6px;align-items:center;font-size:12px"><input type="checkbox" data-so-mov' + (filtro.soMovimento ? ' checked' : '') + '>Só com compra/contrato</label>' +
            '<span class="espaco"></span>' + S.botao('csv', 'Exportar CSV', { icone: 'planilha' }) + S.botao('imprimir', 'Imprimir', { icone: 'imprimir' }) + '</div>';
          const linhas = nos.filter((n) => {
            const nivel = n.tipo === 'servico' ? 4 : n.nivel;
            if (!n.removido && nivel > filtro.nivel) return false;
            if (filtro.soMovimento && !(n.comprometidoT || n.realizadoT || n.aprovacaoT)) return false;
            return true;
          });
          h += S.tabela([
            { t: 'EAP', v: (n) => '<span class="supr-codigo">' + S.esc(n.eap) + '</span>', c: 'min' },
            { t: 'Descrição', v: (n) => (n.tipo === 'unidade' && window.tudoMaiusculo ? S.esc(window.tudoMaiusculo(n.nome)) : S.esc(S.nome(n.nome))), c: 'desc' },
            { t: 'Orçado', v: (n) => S.moeda(n.orcadoT), c: 'num' },
            { t: 'Em aprovação', v: (n) => (n.aprovacaoT ? S.moeda(n.aprovacaoT) : '—'), c: 'num' },
            { t: 'Comprometido', v: (n) => (n.comprometidoT ? S.moeda(n.comprometidoT) : '—'), c: 'num' },
            { t: 'Realizado', v: (n) => (n.realizadoT ? S.moeda(n.realizadoT) : '—'), c: 'num' },
            { t: 'Saldo', v: (n) => { const s = n.orcadoT - n.comprometidoT - n.realizadoT; return '<span class="' + (s < -0.005 ? 'supr-negativo' : '') + '">' + S.moeda(s) + '</span>'; }, c: 'num' },
            { t: 'Usado', v: (n) => { const p = n.orcadoT > 0 ? (n.comprometidoT + n.realizadoT) / n.orcadoT * 100 : (n.comprometidoT + n.realizadoT > 0 ? 999 : 0);
              return (p >= 999 ? 'fora do orçado' : S.pct(p)) + '<span class="barra' + (p > 100 ? ' estouro' : '') + '"><span style="width:' + Math.min(100, p) + '%"></span></span>'; }, c: 'num' }
          ], linhas, { classe: 'supr-eap', classeLinha: (n) => (n.tipo === 'servico' ? '' : 'n' + n.nivel) + (n.removido ? ' alerta' : ''),
            vazio: 'Sem serviços com esse filtro.' });
        } else {
          const contagem = {};
          d.insumos.forEach((i) => { contagem[i.tipo] = (contagem[i.tipo] || 0) + 1; });
          h += '<div class="supr-barra">' + S.busca(filtro.busca, 'Código ou insumo') + S.chips([['', 'Todos', d.insumos.length], ['material', 'Material', contagem.material || 0],
            ['equipamento', 'Equipamento', contagem.equipamento || 0], ['maoDeObra', 'Mão de obra', contagem.maoDeObra || 0], ['servico', 'Serviço / verba', contagem.servico || 0]], filtro.tipo) +
            '<label class="check" style="display:inline-flex;gap:6px;align-items:center;font-size:12px"><input type="checkbox" data-so-mov' + (filtro.soMovimento ? ' checked' : '') + '>Só com movimento</label>' +
            '<label class="check" style="display:inline-flex;gap:6px;align-items:center;font-size:12px"><input type="checkbox" data-so-acima' + (filtro.soAcima ? ' checked' : '') + '>Só acima do orçado</label>' +
            '<span class="espaco"></span>' + S.botao('csv', 'Exportar CSV', { icone: 'planilha' }) + '</div>';
          const linhas = insumosFiltrados();
          h += S.tabela([
            { t: 'Código', v: (i) => '<span class="supr-codigo">' + S.esc(i.codigo || '—') + '</span>', c: 'min' },
            { t: 'Insumo', v: (i) => S.esc(S.nome(i.descricao)) + '<small>' + S.esc(i.base) + ' · ' + S.esc(S.TIPOS_INSUMO[i.tipo] || '') + '</small>' },
            { t: 'Un.', v: (i) => S.esc(i.unidade), c: 'min' },
            { t: 'Orçado', v: (i) => S.qtd(i.quantidadeOrcada, 2), c: 'num' },
            { t: 'Solicitado', v: (i) => S.qtd(i.solicitado, 2), c: 'num' },
            { t: 'Comprado', v: (i) => S.qtd(i.comprado, 2), c: 'num' },
            { t: 'Recebido', v: (i) => S.qtd(i.recebido, 2), c: 'num' },
            { t: 'Falta comprar', v: (i) => { const s = i.quantidadeOrcada - i.comprado; return '<span class="' + (s < -1e-6 ? 'supr-negativo' : '') + '">' + S.qtd(s, 2) + '</span>'; }, c: 'num' },
            { t: 'Valor orçado', v: (i) => S.moeda(i.valorOrcado), c: 'num' },
            { t: 'Valor comprado', v: (i) => (i.valorComprado ? S.moeda(i.valorComprado) : '—'), c: 'num' },
            { t: 'Preço comprado × orçado', v: (i) => { if (!(i.comprado > 0) || !(i.precoOrcado > 0)) return '—'; const v = (i.valorComprado / i.comprado / i.precoOrcado - 1) * 100;
              return '<span class="' + (v > 0.5 ? 'supr-negativo' : v < -0.5 ? 'supr-positivo' : '') + '">' + (v > 0 ? '+' : '') + S.pct(v) + '</span>'; }, c: 'num' }
          ], linhas, { classeLinha: (i) => (i.comprado > i.quantidadeOrcada + 1e-6 ? 'alerta' : ''), vazio: 'Nenhum insumo com esse filtro.' });
        }
        c.innerHTML = h;
        c.querySelectorAll('.supr-eap tr').forEach((tr) => {
          const cel = tr.querySelector('td.desc');
          if (!cel) return;
          const eap = tr.querySelector('.supr-codigo');
          const nivel = eap ? (eap.textContent.match(/\./g) || []).length : 0;
          cel.style.setProperty('--nivel', String(nivel));
        });
        const busca = c.querySelector('[data-busca]');
        if (busca) busca.addEventListener('input', (ev) => { filtro.busca = ev.target.value; const pos = ev.target.selectionStart; desenhar(); const b = c.querySelector('[data-busca]'); b.focus(); b.setSelectionRange(pos, pos); });
      }
      function insumosFiltrados() {
        return d.insumos.filter((i) => (!filtro.tipo || i.tipo === filtro.tipo) && (!filtro.soMovimento || i.solicitado || i.comprado || i.recebido) &&
          (!filtro.soAcima || i.comprado > i.quantidadeOrcada + 1e-6 || i.foraOrcamento) && S.combina(filtro.busca, [i.codigo, i.descricao]));
      }

      c.addEventListener('change', (ev) => {
        if (ev.target.matches('[data-so-mov]')) { filtro.soMovimento = ev.target.checked; desenhar(); }
        if (ev.target.matches('[data-so-acima]')) { filtro.soAcima = ev.target.checked; desenhar(); }
      });
      c.addEventListener('click', (ev) => {
        const aba = ev.target.closest('[data-aba]');
        if (aba) { filtro.aba = aba.dataset.aba; desenhar(); return; }
        const chip = ev.target.closest('[data-chips] button[data-valor]');
        if (chip) { if (filtro.aba === 'servicos') filtro.nivel = Number(chip.dataset.valor); else filtro.tipo = chip.dataset.valor; desenhar(); return; }
        const b = ev.target.closest('[data-acao]');
        if (!b) return;
        if (b.dataset.acao === 'imprimir') window.print();
        if (b.dataset.acao === 'csv') {
          const nomeObra = (d.obra.codigo || d.obra.nome || 'obra').replace(/[\\/:*?"<>|]+/g, '-');
          if (filtro.aba === 'servicos') {
            baixar('Acompanhamento por serviço - ' + nomeObra + '.csv', csv([['EAP', 'Descrição', 'Tipo', 'Orçado', 'Em aprovação', 'Comprometido', 'Realizado', 'Saldo']].concat(
              nos.map((n) => [n.eap, n.nome, n.tipo, S.arred(n.orcadoT), S.arred(n.aprovacaoT), S.arred(n.comprometidoT), S.arred(n.realizadoT), S.arred(n.orcadoT - n.comprometidoT - n.realizadoT)]))));
          } else {
            baixar('Acompanhamento por insumo - ' + nomeObra + '.csv', csv([['Código', 'Insumo', 'Base', 'Tipo', 'Unidade', 'Qtd orçada', 'Solicitado', 'Comprado', 'Recebido', 'Valor orçado', 'Valor comprado', 'Valor recebido']].concat(
              insumosFiltrados().map((i) => [i.codigo, i.descricao, i.base, S.TIPOS_INSUMO[i.tipo] || i.tipo, i.unidade, S.arred(i.quantidadeOrcada, 4), S.arred(i.solicitado, 4),
                S.arred(i.comprado, 4), S.arred(i.recebido, 4), S.arred(i.valorOrcado), S.arred(i.valorComprado), S.arred(i.valorRecebido)]))));
          }
        }
      });
      desenhar();
    }
  });
})();
