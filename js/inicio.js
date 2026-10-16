/* Início: indicadores e gráficos das obras e dos setores (GET /api/suprimentos/inicio).
   Cada seção só aparece para quem pode ver o módulo (o servidor decide em "secoes"): custos das
   obras (Acompanhamento), avanço físico (Planejamento), Suprimentos, Financeiro (Contas a pagar) e
   Engenharia (Orçamento).
   Os filtros ficam numa linha só, acima de tudo: período (3, 6 ou 12 meses) e obra. Gráficos
   desenhados aqui mesmo: medidores orçado × realizado × comprometido, colunas por mês (com
   legenda, dica por coluna e a tabela equivalente) e barras horizontais com o valor na ponta.
   Ao trocar o filtro, o painel anterior fica esmaecido até chegar o novo (sem piscar). */
(function () {
  'use strict';
  const S = window.Supr;
  const CHAVE = 'inicio_filtros';
  const MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
  const MESES_LONGOS = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
  const estado = { meses: 6, obra: '', dados: null, seq: 0, dicas: [], graficos: [], largura: 0, iniciado: false };
  let painel = null;
  let dica = null;

  (function lerFiltros() {
    try {
      const f = JSON.parse(localStorage.getItem(CHAVE) || '{}');
      if ([3, 6, 12].includes(f.meses)) estado.meses = f.meses;
      if (typeof f.obra === 'string') estado.obra = f.obra;
    } catch (e) { /* sem armazenamento: fica o padrão */ }
  })();
  function gravarFiltros() {
    try { localStorage.setItem(CHAVE, JSON.stringify({ meses: estado.meses, obra: estado.obra })); } catch (e) { /* opcional */ }
  }

  /* ---------- formatação ---------- */
  const fmtMoedaCompacta = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', notation: 'compact', maximumFractionDigits: 1 });
  const fmtCompacto = new Intl.NumberFormat('pt-BR', { notation: 'compact', maximumFractionDigits: 1 });
  // valor de cartão: abaixo de 10 mil por extenso, acima compacto ("R$ 154,5 mil"); o title tem o valor exato
  const moedaCurta = (v) => (Math.abs(Number(v) || 0) < 10000 ? S.moeda(v) : fmtMoedaCompacta.format(Number(v) || 0));
  const plural = (n, um, varios) => n + ' ' + (n === 1 ? um : varios);
  const pctDe = (v, total) => (total > 0 ? S.pct(v / total * 100) : '—');
  const mesCurto = (ym, comAno) => { const [a, m] = ym.split('-'); return MESES[Number(m) - 1] + (comAno ? '/' + a.slice(2) : ''); };
  const mesLongo = (ym) => { const [a, m] = ym.split('-'); return MESES_LONGOS[Number(m) - 1] + ' de ' + a; };
  const diaMes = (iso) => { const d = String(iso).split('-'); return d[2] + '/' + d[1]; };
  const refSinapi = (ym) => { if (!ym) return '—'; const [a, m] = String(ym).split('-'); return m + '/' + a; };
  const podeVer = (modulo) => (window.Permissoes ? window.Permissoes.pode(modulo, 'visualizar') : true);
  const nomeObra = (o) => (o.codigo ? o.codigo + ' — ' : '') + o.nome;

  /* ---------- dica (tooltip): o valor em destaque, a série depois; texto sempre por textContent ---------- */
  function novaDica(conteudo) { estado.dicas.push(conteudo); return estado.dicas.length - 1; }
  function mostrarDica(alvo, x, y) {
    const d = estado.dicas[Number(alvo.getAttribute('data-dica'))];
    if (!d || !dica) return;
    dica.replaceChildren();
    if (d.titulo) {
      const t = document.createElement('div');
      t.className = 'ini-dica-titulo';
      t.textContent = d.titulo;
      dica.appendChild(t);
    }
    for (const l of d.linhas) {
      const linha = document.createElement('div');
      linha.className = 'ini-dica-linha' + (l.total ? ' total' : '');
      const chave = document.createElement('span');
      chave.className = 'ini-dica-chave' + (l.classe ? ' ' + l.classe : '');
      const valor = document.createElement('strong');
      valor.textContent = l.valor;
      const nome = document.createElement('span');
      nome.textContent = l.nome;
      linha.append(chave, valor, nome);
      dica.appendChild(linha);
    }
    dica.hidden = false;
    const r = dica.getBoundingClientRect();
    let px = x + 14, py = y + 14;
    if (px + r.width > window.innerWidth - 8) px = Math.max(8, x - r.width - 14);
    if (py + r.height > window.innerHeight - 8) py = Math.max(8, y - r.height - 14);
    dica.style.left = px + 'px';
    dica.style.top = py + 'px';
  }
  function esconderDica() { if (dica) dica.hidden = true; }

  /* ---------- peças ---------- */
  // Cartão de número: rótulo, valor, situação (ícone + texto) e detalhe; vira atalho se puder abrir o módulo
  function cartaoNumero(op) {
    const tag = op.ir ? 'button' : 'div';
    return '<' + tag + (op.ir ? ' type="button" data-ir="' + S.esc(op.ir) + '"' : '') + ' class="ini-tile">' +
      '<span class="ini-tile-rotulo">' + S.esc(op.rotulo) + '</span>' +
      '<span class="ini-tile-valor"' + (op.titulo ? ' title="' + S.esc(op.titulo) + '"' : '') + '>' + S.esc(op.valor) + '</span>' +
      (op.alerta ? '<span class="ini-alerta">' + S.ic('alerta', 'ic-sm') + S.esc(op.alerta) + '</span>' : '') +
      (op.det ? '<span class="ini-tile-det">' + S.esc(op.det) + '</span>' : '') + '</' + tag + '>';
  }
  function legenda(itens) {
    return '<ul class="ini-legenda">' + itens.map((i) => '<li><span class="ini-chave ' + i.classe + '"></span>' + S.esc(i.nome) + '</li>').join('') + '</ul>';
  }
  // Moldura de cada gráfico: título, subtítulo, legenda e o botão que troca para a tabela
  function cartao(op) {
    return '<figure class="ini-card">' +
      '<figcaption class="ini-card-topo"><div><h4>' + S.esc(op.titulo) + '</h4>' + (op.sub ? '<p>' + S.esc(op.sub) + '</p>' : '') + '</div>' +
      (op.tabela ? '<button type="button" class="ini-alternar" data-alternar aria-pressed="false">' + S.ic('planilha', 'ic-sm') + '<span>Tabela</span></button>' : '') +
      '</figcaption><div class="ini-card-grafico">' + (op.legenda || '') + op.corpo + '</div>' +
      (op.tabela ? '<div class="ini-card-tabela" hidden>' + op.tabela + '</div>' : '') + '</figure>';
  }
  function vazio(texto) { return '<p class="ini-vazio">' + S.esc(texto) + '</p>'; }
  function tabela(cabecalho, linhas, rodape) {
    const celula = (v, i) => '<td' + (i ? ' class="num"' : '') + '>' + v + '</td>';
    return '<table class="ini-tabela"><thead><tr>' + cabecalho.map((c, i) => '<th' + (i ? ' class="num"' : '') + '>' + S.esc(c) + '</th>').join('') + '</tr></thead>' +
      '<tbody>' + linhas.map((l) => '<tr>' + l.map(celula).join('') + '</tr>').join('') + '</tbody>' +
      (rodape ? '<tfoot><tr>' + rodape.map(celula).join('') + '</tr></tfoot>' : '') + '</table>';
  }

  // Colunas (empilhadas quando há mais de uma série): o SVG é desenhado depois, na largura real
  function colunas(op) {
    const totais = op.categorias.map((_, i) => op.series.reduce((s, x) => s + Math.max(0, x.valores[i] || 0), 0));
    if (!totais.some((t) => t > 0)) return cartao({ titulo: op.titulo, sub: op.sub, corpo: vazio(op.vazio) });
    estado.graficos.push({ ...op, totais });
    const varias = op.series.length > 1;
    const linhas = op.categorias.map((c, i) => [S.esc(c.titulo)].concat(op.series.map((s) => S.moeda(s.valores[i] || 0)), varias ? [S.moeda(totais[i])] : []));
    const soma = (valores) => valores.reduce((s, v) => s + (v || 0), 0);
    const rodape = ['Total'].concat(op.series.map((s) => S.moeda(soma(s.valores))), varias ? [S.moeda(soma(totais))] : []);
    return cartao({
      titulo: op.titulo, sub: op.sub,
      legenda: varias ? legenda(op.series) : '',
      corpo: '<div class="ini-grafico" data-grafico="' + (estado.graficos.length - 1) + '"></div>',
      tabela: tabela([op.coluna].concat(op.series.map((s) => s.nome), varias ? ['Total'] : []), linhas, rodape)
    });
  }

  function escala(maximo) {
    if (!(maximo > 0)) return { topo: 1, marcas: [0] };
    const bruto = maximo / 4;
    const potencia = Math.pow(10, Math.floor(Math.log10(bruto)));
    const passo = [1, 2, 2.5, 5, 10].map((m) => m * potencia).find((p) => p >= bruto);
    const topo = Math.ceil(maximo / passo - 1e-9) * passo;
    const marcas = [];
    for (let v = 0; v <= topo + passo / 2; v += passo) marcas.push(v);
    return { topo, marcas };
  }

  function desenharColunas(el, g) {
    const largura = Math.max(260, Math.floor(el.clientWidth));
    const altura = 196;
    const m = { t: 20, r: 6, b: 24, l: 46 };
    const pw = largura - m.l - m.r, ph = altura - m.t - m.b;
    const { topo, marcas } = escala(Math.max(...g.totais));
    const y = (v) => m.t + ph - (v / topo) * ph;
    const n = g.categorias.length;
    const banda = pw / n;
    const larg = Math.min(24, Math.max(6, banda * 0.58));
    const passoRotulo = banda < 18 ? 3 : banda < 32 ? 2 : 1;
    const iMax = g.totais.indexOf(Math.max(...g.totais));
    let svg = '<svg class="ini-svg" width="' + largura + '" height="' + altura + '" viewBox="0 0 ' + largura + ' ' + altura + '" role="group" aria-label="' + S.esc(g.titulo) + '">';
    for (const v of marcas) {
      const yy = Math.round(y(v)) + 0.5;
      svg += '<line class="' + (v === 0 ? 'base' : 'grade') + '" x1="' + m.l + '" x2="' + (largura - m.r) + '" y1="' + yy + '" y2="' + yy + '"/>' +
        '<text class="eixo" x="' + (m.l - 8) + '" y="' + (yy + 3.5) + '" text-anchor="end">' + S.esc(fmtCompacto.format(v)) + '</text>';
    }
    g.categorias.forEach((c, i) => {
      const x0 = m.l + banda * i;
      const cx = x0 + banda / 2;
      const linhasDica = g.series.map((s) => ({ valor: S.moeda(s.valores[i] || 0), nome: s.nome, classe: s.classe }));
      if (g.series.length > 1) linhasDica.push({ valor: S.moeda(g.totais[i]), nome: 'Total', total: true });
      const k = novaDica({ titulo: c.titulo, linhas: linhasDica });
      const descricao = c.titulo + ': ' + linhasDica.map((l) => l.nome + ' ' + l.valor).join(', ');
      svg += '<g class="ini-col" tabindex="0" role="img" data-dica="' + k + '" aria-label="' + S.esc(descricao) + '">' +
        '<rect class="realce" x="' + (x0 + 1) + '" y="' + m.t + '" width="' + Math.max(0, banda - 2) + '" height="' + ph + '" rx="4"/>';
      // segmentos de baixo para cima, 2px de fundo entre eles; só o de cima tem a ponta arredondada
      const partes = g.series.map((s) => ({ s, v: Math.max(0, s.valores[i] || 0) })).filter((p) => p.v > 0);
      let acumulado = 0;
      partes.forEach((p, idx) => {
        const yBase = y(acumulado) - (idx ? 2 : 0);
        acumulado += p.v;
        const yTopo = y(acumulado);
        const h = yBase - yTopo;
        if (h < 0.5) return;
        const r = idx === partes.length - 1 ? Math.min(4, h, larg / 2) : 0;
        const xa = cx - larg / 2, xb = cx + larg / 2;
        svg += '<path class="seg ' + p.s.classe + '" d="M' + xa + ',' + yBase + 'V' + (yTopo + r) +
          (r ? 'Q' + xa + ',' + yTopo + ' ' + (xa + r) + ',' + yTopo + 'H' + (xb - r) + 'Q' + xb + ',' + yTopo + ' ' + xb + ',' + (yTopo + r) : 'H' + xb) +
          'V' + yBase + 'Z"/>';
      });
      // rótulo só no maior valor do período (o resto fica no eixo, na dica e na tabela)
      if (i === iMax) {
        const texto = moedaCurta(g.totais[i]);
        const meia = texto.length * 3.2;
        const xr = Math.min(Math.max(cx, m.l + meia), largura - m.r - meia);
        svg += '<text class="rotulo" x="' + xr + '" y="' + (y(g.totais[i]) - 6) + '" text-anchor="middle">' + S.esc(texto) + '</text>';
      }
      svg += '<rect class="alvo" x="' + x0 + '" y="0" width="' + banda + '" height="' + (m.t + ph) + '"/></g>';
      if (i % passoRotulo === 0) svg += '<text class="eixo" x="' + cx + '" y="' + (altura - 7) + '" text-anchor="middle">' + S.esc(c.rotulo) + '</text>';
    });
    el.innerHTML = svg + '</svg>';
  }
  function desenharGraficos() {
    if (!painel) return;
    painel.querySelectorAll('[data-grafico]').forEach((el) => {
      const g = estado.graficos[Number(el.dataset.grafico)];
      if (g && el.offsetParent !== null) desenharColunas(el, g);
    });
  }

  // Medidores: realizado e comprometido sobre o orçado (a trilha clara é o saldo do orçado)
  function medidores(linhas, op) {
    if (!linhas.length) return vazio(op.vazio);
    const escalaMax = Math.max(1, ...linhas.map((l) => Math.max(l.orcado, l.realizado + l.comprometido)));
    const pct = (v) => (v / escalaMax * 100).toFixed(3) + '%';
    return '<ul class="ini-medidores">' + linhas.map((l) => {
      const consumido = l.realizado + l.comprometido;
      const acima = consumido > l.orcado + 0.005;
      const titulo = op.nome(l);
      const k = novaDica({ titulo, linhas: [
        { valor: S.moeda(l.orcado), nome: 'Orçado', classe: 'orcado' },
        { valor: S.moeda(l.realizado), nome: 'Realizado', classe: 'realizado' },
        { valor: S.moeda(l.comprometido), nome: 'Comprometido', classe: 'comprometido' }
      ].concat(l.emAprovacao ? [{ valor: S.moeda(l.emAprovacao), nome: 'Em aprovação' }] : [],
        [{ valor: S.moeda(Math.abs(l.saldo)), nome: l.saldo < 0 ? 'Acima do orçado' : 'Saldo a comprar e contratar', total: true }]) });
      const pecas = [];
      if (l.realizado > 0) pecas.push('<span class="seg realizado" style="flex-basis:' + pct(l.realizado) + '"></span>');
      if (l.comprometido > 0) pecas.push('<span class="seg comprometido" style="flex-basis:' + pct(l.comprometido) + '"></span>');
      if (!acima && l.orcado - consumido > 0) pecas.push('<span class="seg trilha" style="flex-basis:' + pct(l.orcado - consumido) + '"></span>');
      if (pecas.length) pecas[pecas.length - 1] = pecas[pecas.length - 1].replace('class="seg ', 'class="seg fim ');
      const tag = op.ir ? 'button' : 'div';
      return '<li><' + tag + (op.ir ? ' type="button" data-ir="' + op.ir + '" data-obra="' + S.esc(op.obra(l)) + '"' : ' tabindex="0"') +
        ' class="ini-medidor" data-dica="' + k + '" aria-label="' + S.esc(titulo + ': ' + S.moeda(consumido) + ' de ' + S.moeda(l.orcado)) + '">' +
        '<span class="ini-medidor-topo"><span class="ini-medidor-nome">' + op.rotulo(l) + '</span>' +
        '<span class="ini-medidor-valor">' + S.esc(moedaCurta(consumido) + ' de ' + moedaCurta(l.orcado)) +
        (l.orcado > 0 ? ' · ' + S.esc(S.pct(consumido / l.orcado * 100)) : '') + '</span></span>' +
        '<span class="ini-barra" aria-hidden="true">' + pecas.join('') +
        (acima && l.orcado > 0 ? '<span class="marca" style="left:' + pct(l.orcado) + '"></span>' : '') + '</span>' +
        (acima ? '<span class="ini-alerta">' + S.ic('alerta', 'ic-sm') + 'Acima do orçado em ' + S.esc(moedaCurta(consumido - l.orcado)) + '</span>' : '') +
        '</' + tag + '></li>';
    }).join('') + '</ul>';
  }

  // Barras horizontais com o valor na ponta (fornecedores, maiores serviços)
  function barras(itens, op) {
    if (!itens.length) return vazio(op.vazio);
    const maximo = Math.max(1, ...itens.map((i) => i.valor));
    return '<ol class="ini-barras">' + itens.map((i) => {
      const k = novaDica({ titulo: i.nome, linhas: i.dica });
      return '<li tabindex="0" data-dica="' + k + '"><span class="ini-barras-nome" title="' + S.esc(i.nome) + '">' + S.esc(i.nome) +
        (i.sub ? '<small>' + S.esc(i.sub) + '</small>' : '') + '</span>' +
        '<span class="ini-barras-trilho"><span class="ini-barras-barra' + (i.outro ? ' outro' : '') + '" style="--v:' + (i.valor / maximo).toFixed(4) + '"></span>' +
        '<span class="ini-barras-valor">' + S.esc(i.rotulo) + '</span></span></li>';
    }).join('') + '</ol>';
  }

  function secao(id, titulo, sub, cartoes, graficos) {
    return '<section class="ini-secao" data-secao="' + id + '"><header class="ini-secao-topo"><h3>' + S.esc(titulo) + '</h3>' +
      (sub ? '<p>' + S.esc(sub) + '</p>' : '') + '</header>' +
      '<div class="ini-tiles">' + cartoes.join('') + '</div>' + (graficos.length ? '<div class="ini-grade">' + graficos.join('') + '</div>' : '') + '</section>';
  }

  /* ---------- seções ---------- */
  function categoriasDosMeses(d) {
    return d.mesesLista.map((ym, i) => ({ rotulo: mesCurto(ym, i === 0 || ym.endsWith('-01')), titulo: mesLongo(ym) }));
  }
  function obraEscolhida(d) { return d.obras.find((o) => o.id === d.obra) || null; }

  function secaoCustos(d) {
    const c = d.custos;
    const t = c.totais;
    const obra = obraEscolhida(d);
    const ir = podeVer('acompanhamento') ? 'supr:acompanhamento' : '';
    const acimas = t.acimaDoOrcado ? plural(t.acimaDoOrcado, c.porEtapa ? 'etapa acima do orçado' : 'obra acima do orçado',
      c.porEtapa ? 'etapas acima do orçado' : 'obras acima do orçado') : '';
    const cartoes = [
      cartaoNumero({ rotulo: 'Orçado', valor: moedaCurta(t.orcado), titulo: S.moeda(t.orcado), ir,
        det: obra ? 'versão atual do orçamento' : plural(c.linhas.length, 'obra', 'obras') + ' · versões atuais' }),
      cartaoNumero({ rotulo: 'Realizado', valor: moedaCurta(t.realizado), titulo: S.moeda(t.realizado), ir, det: pctDe(t.realizado, t.orcado) + ' do orçado · notas e medições' }),
      cartaoNumero({ rotulo: 'Comprometido', valor: moedaCurta(t.comprometido), titulo: S.moeda(t.comprometido), ir, det: pctDe(t.comprometido, t.orcado) + ' do orçado · pedidos e contratos a entregar' }),
      cartaoNumero({ rotulo: 'Saldo a comprar e contratar', valor: moedaCurta(t.saldo), titulo: S.moeda(t.saldo), ir, alerta: acimas,
        det: [t.saldo >= 0 ? pctDe(t.saldo, t.orcado) + ' do orçado' : 'gasto acima do orçado',
          t.emAprovacao ? moedaCurta(t.emAprovacao) + ' em aprovação' : ''].filter(Boolean).join(' · ') })
    ];
    const nomeLinha = (l) => (c.porEtapa ? (l.eap ? l.eap + ' ' : '') + l.nome + (l.grupo ? ' — ' + l.grupo : '') : nomeObra(l));
    const rotuloLinha = (l) => (c.porEtapa
      ? (l.eap ? '<b>' + S.esc(l.eap) + '</b> ' : '') + S.esc(l.nome) + (l.grupo ? '<small>' + S.esc(l.grupo) + '</small>' : '')
      : (l.codigo ? '<b>' + S.esc(l.codigo) + '</b> ' : '') + S.esc(l.nome));
    const graficos = [
      cartao({
        titulo: c.porEtapa ? 'Custos por etapa' : 'Custos por obra',
        sub: c.porEtapa ? 'Realizado e comprometido sobre o orçado de cada etapa da EAP' : 'Realizado e comprometido sobre o orçado de cada obra',
        legenda: legenda([{ nome: 'Realizado', classe: 'realizado' }, { nome: 'Comprometido', classe: 'comprometido' }, { nome: 'Saldo do orçado', classe: 'orcado' }]),
        corpo: medidores(c.linhas, { vazio: 'Nenhum orçamento cadastrado ainda.', nome: nomeLinha, rotulo: rotuloLinha, ir,
          obra: (l) => (c.porEtapa ? d.obra : l.id) })
      }),
      colunas({
        titulo: 'Realizado por mês', sub: 'Notas fiscais lançadas e medições autorizadas', coluna: 'Mês',
        categorias: categoriasDosMeses(d), vazio: 'Nenhuma nota fiscal ou medição no período.',
        series: [{ nome: 'Notas fiscais', classe: 's1', valores: c.realizadoMensal.notas }, { nome: 'Medições', classe: 's2', valores: c.realizadoMensal.medicoes }]
      })
    ];
    return secao('custos', 'Custos das obras', obra ? nomeObra(obra) : 'Orçado × comprometido × realizado de todas as obras', cartoes, graficos);
  }

  // Previsto × realizado em barras: trilha = 100%, preenchimento = realizado, marca = previsto para hoje
  function progresso(itens, op) {
    if (!itens.length) return vazio(op.vazio);
    const sinal = (v) => (v > 0 ? '+' : '') + S.pct(v).replace('%', ' p.p.');
    return '<ul class="ini-medidores">' + itens.map((i) => {
      const desvio = i.realizado - i.previsto;
      const k = novaDica({ titulo: i.titulo, linhas: [
        { valor: S.pct(i.realizado), nome: 'Realizado', classe: 'realizado' },
        { valor: S.pct(i.previsto), nome: 'Previsto para hoje', classe: 'marca' },
        { valor: sinal(desvio), nome: 'Desvio', total: true }] });
      const pecas = [];
      if (i.realizado > 0) pecas.push('<span class="seg realizado" style="flex-basis:' + Math.min(100, i.realizado) + '%"></span>');
      if (i.realizado < 100) pecas.push('<span class="seg trilha" style="flex-basis:' + (100 - Math.max(0, i.realizado)) + '%"></span>');
      pecas[pecas.length - 1] = pecas[pecas.length - 1].replace('class="seg ', 'class="seg fim ');
      const tag = op.ir ? 'button' : 'div';
      return '<li><' + tag + (op.ir ? ' type="button" data-ir="' + op.ir + '"' : ' tabindex="0"') + ' class="ini-medidor" data-dica="' + k + '" aria-label="' +
        S.esc(i.titulo + ': realizado ' + S.pct(i.realizado) + ', previsto ' + S.pct(i.previsto)) + '">' +
        '<span class="ini-medidor-topo"><span class="ini-medidor-nome">' + i.rotulo + '</span>' +
        '<span class="ini-medidor-valor">' + S.esc(S.pct(i.realizado) + ' de ' + S.pct(i.previsto) + ' previsto' + (i.extra ? ' · ' + i.extra : '')) + '</span></span>' +
        '<span class="ini-barra" aria-hidden="true">' + pecas.join('') + '<span class="marca" style="left:' + Math.min(100, Math.max(0, i.previsto)) + '%"></span></span>' +
        (desvio <= -5 && !op.semAlerta ? '<span class="ini-alerta">' + S.ic('alerta', 'ic-sm') + 'Atrasado ' + S.esc(sinal(-desvio).replace('+', '')) + '</span>' : '') +
        '</' + tag + '></li>';
    }).join('') + '</ul>';
  }

  function secaoPlanejamento(d) {
    const p = d.planejamento;
    const t = p.totais;
    const obra = obraEscolhida(d);
    const ir = podeVer('planejamento') ? 'view:planejamento' : '';
    const sub = obra ? nomeObra(obra) : 'Previsto × realizado pelo cronograma de cada obra';
    if (!t.comCronograma) {
      return '<section class="ini-secao" data-secao="planejamento"><header class="ini-secao-topo"><h3>Avanço físico</h3><p>' + S.esc(sub) + '</p></header>' +
        '<div class="ini-card ini-aviso-card">' + S.ic('planejamento') + '<span>' + (obra ? 'Esta obra ainda não tem cronograma.' : 'Nenhuma obra tem cronograma ainda.') +
        ' Monte o cronograma no Planejamento para acompanhar o avanço físico previsto × realizado.</span>' +
        (ir ? '<button type="button" class="btn btn-ghost btn-sm" data-ir="' + ir + '">Abrir o Planejamento</button>' : '') + '</div></section>';
    }
    const desvio = t.realizado - t.previsto;
    const linha = obra ? p.obras[0] : null;
    const semCronograma = t.obras - t.comCronograma;
    const cartoes = [
      cartaoNumero({ rotulo: 'Avanço previsto', valor: S.pct(t.previsto), ir, det: obra ? 'pelo cronograma, até hoje' : 'até hoje, média pelo valor orçado' }),
      cartaoNumero({ rotulo: 'Avanço realizado', valor: S.pct(t.realizado), ir, det: 'pelos apontamentos de avanço' }),
      cartaoNumero({ rotulo: 'Desvio', valor: (desvio > 0 ? '+' : '') + S.pct(desvio).replace('%', ' p.p.'), ir,
        alerta: t.atrasadas ? (obra ? 'Obra atrasada' : plural(t.atrasadas, 'obra atrasada', 'obras atrasadas')) : '', det: 'realizado − previsto' }),
      linha ? cartaoNumero({ rotulo: 'Término previsto', valor: S.data(linha.termino), ir, det: 'início ' + S.data(linha.inicio) + ' · ' + linha.duracao + ' dias de trabalho' })
        : cartaoNumero({ rotulo: 'Obras com cronograma', valor: t.comCronograma + ' de ' + t.obras, ir,
          det: semCronograma ? plural(semCronograma, 'obra sem cronograma', 'obras sem cronograma') : 'todas planejadas' })
    ];
    const atrasados = p.atrasados.map((a) => ({
      titulo: (obra ? '' : a.obra + ' · ') + a.eap + ' ' + a.nome, previsto: a.previsto, realizado: a.realizado, extra: 'término ' + S.data(a.termino),
      rotulo: (obra ? '' : '<b>' + S.esc(a.obra) + '</b> ') + S.esc(a.eap + ' ' + a.nome)
    }));
    const graficos = [];
    if (linha && p.curva) {
      graficos.push(cartao({
        titulo: 'Curva S', sub: 'Avanço físico acumulado, ponderado pelo valor orçado',
        corpo: '<div class="ini-curva" data-curva-ini></div>',
        tabela: tabela(['Data', 'Previsto', 'Realizado'], p.curva.map((x) => [S.esc(S.data(x.data)), S.pct(x.previsto), x.realizado == null ? '—' : S.pct(x.realizado)]))
      }));
    } else {
      graficos.push(cartao({
        titulo: 'Avanço físico por obra', sub: 'Realizado até hoje e a marca do previsto',
        legenda: legenda([{ nome: 'Realizado', classe: 'realizado' }, { nome: 'Previsto para hoje', classe: 'marca' }, { nome: 'A executar', classe: 'orcado' }]),
        corpo: progresso(p.obras.filter((o) => o.temCronograma).map((o) => ({ titulo: nomeObra(o), previsto: o.previsto, realizado: o.realizado,
          extra: 'término ' + S.data(o.termino), rotulo: (o.codigo ? '<b>' + S.esc(o.codigo) + '</b> ' : '') + S.esc(o.nome) })), { vazio: 'Nenhuma obra com cronograma.', ir })
      }));
    }
    graficos.push(cartao({
      titulo: 'Serviços mais atrasados', sub: p.totalAtrasados > atrasados.length ? atrasados.length + ' de ' + p.totalAtrasados + ' serviços abaixo do previsto' : 'Executado abaixo do previsto para hoje',
      legenda: atrasados.length ? legenda([{ nome: 'Executado', classe: 'realizado' }, { nome: 'Previsto para hoje', classe: 'marca' }]) : '',
      // todos aqui estão atrasados: o aviso em cada linha seria repetição
      corpo: progresso(atrasados, { vazio: 'Nenhum serviço atrasado. O executado está em dia com o previsto.', ir, semAlerta: true })
    }));
    return secao('planejamento', 'Avanço físico', sub, cartoes, graficos);
  }

  function secaoSuprimentos(d) {
    const s = d.suprimentos;
    const p = s.pendentes;
    const ag = s.aguardandoCompra;
    const e = s.entregas;
    const economia = s.economia.orcado - s.economia.comprado;
    const ir = (modulo) => (podeVer(modulo) ? 'supr:' + modulo : '');
    const partes = [[p.solicitacoes, 'SC'], [p.pedidos, 'pedido(s)'], [p.contratos, 'contrato(s)'], [p.aditivos, 'aditivo(s)'], [p.medicoes, 'medição(ões)']]
      .filter((x) => x[0]).map((x) => x[0] + ' ' + x[1]);
    const cartoes = [
      cartaoNumero({ rotulo: 'Aguardando autorização', valor: String(p.total), ir: 'supr:autorizacoes', det: partes.join(' · ') || 'nada pendente' }),
      cartaoNumero({ rotulo: 'Itens aguardando compra', valor: String(ag.itens), ir: ir('solicitacoes'),
        det: ag.itens ? plural(ag.solicitacoes, 'solicitação', 'solicitações') + (ag.maisUrgente ? ' · mais urgente ' + S.data(ag.maisUrgente) : '') : 'tudo comprado' }),
      cartaoNumero({ rotulo: 'Cotações abertas', valor: String(s.cotacoes.abertas), ir: ir('cotacoes'),
        det: s.cotacoes.abertas ? s.cotacoes.respostas + ' de ' + plural(s.cotacoes.convites, 'resposta recebida', 'respostas recebidas') : 'nenhuma em andamento' }),
      cartaoNumero({ rotulo: 'Entregas atrasadas', valor: String(e.atrasadas), ir: ir('pedidos'),
        alerta: e.atrasadas ? moedaCurta(e.valorAtrasado) + ' em pedidos atrasados' : '', det: plural(e.proximas, 'entrega', 'entregas') + ' nos próximos 7 dias' }),
      cartaoNumero({ rotulo: 'Comprado no período', valor: moedaCurta(s.comprado.pedidos.valor + s.comprado.contratos.valor),
        titulo: S.moeda(s.comprado.pedidos.valor + s.comprado.contratos.valor),
        det: plural(s.comprado.pedidos.qtd, 'pedido', 'pedidos') + ' e ' + plural(s.comprado.contratos.qtd, 'contrato autorizado', 'contratos autorizados') }),
      cartaoNumero({ rotulo: 'Economia nas compras', valor: s.economia.orcado ? moedaCurta(economia) : '—', titulo: s.economia.orcado ? S.moeda(economia) : '',
        alerta: economia < -0.005 ? 'Compras acima do preço orçado' : '',
        det: s.economia.orcado ? S.pct(Math.abs(economia) / s.economia.orcado * 100) + (economia < 0 ? ' acima' : ' abaixo') + ' do preço orçado no período' : 'sem compras com preço orçado no período' }),
      cartaoNumero({ rotulo: 'Entregas no prazo', valor: e.entregues ? S.pct(e.noPrazo / e.entregues * 100) : '—',
        det: e.entregues ? e.noPrazo + ' de ' + plural(e.entregues, 'pedido entregue', 'pedidos entregues') + ' no período' : 'nenhum pedido entregue no período' }),
      cartaoNumero({ rotulo: 'Prazo médio de compra', valor: s.prazoMedio == null ? '—' : S.qtd(s.prazoMedio, 1) + (s.prazoMedio === 1 ? ' dia' : ' dias'),
        det: 'da solicitação ao pedido, no período' })
    ];
    const fornecedores = s.fornecedores.map((f) => ({
      nome: f.nome, valor: f.valor, rotulo: moedaCurta(f.valor),
      dica: [{ valor: S.moeda(f.valor), nome: 'Comprado e contratado', classe: 's1' }]
        .concat(f.pedidos ? [{ valor: String(f.pedidos), nome: f.pedidos === 1 ? 'pedido' : 'pedidos' }] : [],
          f.contratos ? [{ valor: String(f.contratos), nome: f.contratos === 1 ? 'contrato' : 'contratos' }] : [])
    }));
    if (s.demais.quantidade) {
      fornecedores.push({ nome: 'Demais ' + plural(s.demais.quantidade, 'fornecedor', 'fornecedores'), valor: s.demais.valor, rotulo: moedaCurta(s.demais.valor), outro: true,
        dica: [{ valor: S.moeda(s.demais.valor), nome: 'Comprado e contratado', classe: 'outro' }] });
    }
    const graficos = [
      colunas({
        titulo: 'Compras por mês', sub: 'Pedidos de compra e contratos autorizados', coluna: 'Mês',
        categorias: categoriasDosMeses(d), vazio: 'Nenhum pedido ou contrato no período.',
        series: [{ nome: 'Pedidos de compra', classe: 's1', valores: s.comprasMensais.pedidos }, { nome: 'Contratos', classe: 's2', valores: s.comprasMensais.contratos }]
      }),
      cartao({ titulo: 'Maiores fornecedores', sub: 'Pedidos e contratos autorizados no período', corpo: barras(fornecedores, { vazio: 'Nenhuma compra no período.' }) })
    ];
    return secao('suprimentos', 'Suprimentos', 'Compras, cotações e entregas', cartoes, graficos);
  }

  function secaoFinanceiro(d) {
    const f = d.financeiro;
    const ir = 'view:financeiro';
    const mesAtual = MESES_LONGOS[Number(d.hoje.slice(5, 7)) - 1];
    const cartoes = [
      cartaoNumero({ rotulo: 'Em aberto', valor: moedaCurta(f.aberto), titulo: S.moeda(f.aberto), ir, det: plural(f.qtdAberto, 'título a pagar', 'títulos a pagar') }),
      cartaoNumero({ rotulo: 'Vencido', valor: moedaCurta(f.vencido), titulo: S.moeda(f.vencido), ir,
        alerta: f.qtdVencido ? plural(f.qtdVencido, 'título vencido', 'títulos vencidos') : '', det: f.qtdVencido ? '' : 'nenhum título vencido' }),
      cartaoNumero({ rotulo: 'Vence em 7 dias', valor: moedaCurta(f.proximos), titulo: S.moeda(f.proximos), ir, det: plural(f.qtdProximos, 'título', 'títulos') }),
      cartaoNumero({ rotulo: 'Pago em ' + mesAtual, valor: moedaCurta(f.pagoMes), titulo: S.moeda(f.pagoMes), ir, det: plural(f.qtdPagoMes, 'pagamento', 'pagamentos') })
    ];
    const graficos = [
      colunas({
        titulo: 'A pagar nas próximas 8 semanas', sub: 'Títulos em aberto pela semana de vencimento', coluna: 'Semana',
        categorias: f.semanas.map((s) => ({ rotulo: diaMes(s.inicio), titulo: diaMes(s.inicio) + ' a ' + diaMes(s.fim) })),
        vazio: 'Nenhum título a vencer nas próximas 8 semanas.',
        series: [{ nome: 'A pagar', classe: 's1', valores: f.semanas.map((s) => s.valor) }]
      }),
      colunas({
        titulo: 'Pago por mês', sub: 'Títulos pagos no período', coluna: 'Mês',
        categorias: categoriasDosMeses(d), vazio: 'Nenhum pagamento no período.',
        series: [{ nome: 'Pago', classe: 's1', valores: f.pagoMensal }]
      })
    ];
    return secao('financeiro', 'Financeiro', 'Contas a pagar das obras', cartoes, graficos);
  }

  function secaoEngenharia(d) {
    const e = d.engenharia;
    const obra = obraEscolhida(d);
    const atual = obra ? e.lista[0] : null;
    const irOrc = podeVer('orcamento') ? 'view:orcamento' : '';
    const curva = e.curvaA.de ? plural(e.curvaA.servicos, 'serviço soma', 'serviços somam') + ' 80% do valor' : 'nenhum serviço com valor';
    const cartoes = atual ? [
      cartaoNumero({ rotulo: 'Versão do orçamento', valor: 'V' + atual.versao, ir: irOrc,
        det: 'revisão ' + atual.revisao + (atual.atualizadoEm ? ' · atualizado em ' + S.data(atual.atualizadoEm) : '') }),
      cartaoNumero({ rotulo: 'Valor orçado', valor: moedaCurta(atual.orcado), titulo: S.moeda(atual.orcado), ir: irOrc, det: 'soma dos serviços da versão' }),
      cartaoNumero({ rotulo: 'Referência SINAPI', valor: refSinapi(atual.referencia), det: e.sinapi ? 'base mais recente: ' + refSinapi(e.sinapi) : 'base SINAPI não importada' }),
      cartaoNumero({ rotulo: 'Serviços', valor: String(atual.servicos), ir: irOrc, det: curva })
    ] : [
      cartaoNumero({ rotulo: 'Orçamentos', valor: String(e.orcamentos), ir: irOrc, det: plural(e.servicos, 'serviço', 'serviços') + ' nas versões atuais' }),
      cartaoNumero({ rotulo: 'Valor orçado', valor: moedaCurta(e.orcado), titulo: S.moeda(e.orcado), ir: irOrc, det: 'soma das versões atuais' }),
      cartaoNumero({ rotulo: 'Base SINAPI', valor: refSinapi(e.sinapi), det: e.sinapi ? 'mês mais recente importado' : 'nenhum mês importado' }),
      cartaoNumero({ rotulo: 'Composições próprias', valor: e.composicoes == null ? '—' : String(e.composicoes), ir: podeVer('composicoes') ? 'view:composicoes' : '',
        det: e.insumos == null ? '' : plural(e.insumos, 'insumo próprio', 'insumos próprios') })
    ];
    const servicos = e.maioresServicos.map((s) => ({
      nome: s.nome, sub: (obra ? '' : s.obra + ' · ') + s.eap, valor: s.valor, rotulo: moedaCurta(s.valor) + ' · ' + S.pct(s.participacao),
      dica: [{ valor: S.moeda(s.valor), nome: 'Valor orçado', classe: 's1' }, { valor: S.pct(s.participacao), nome: 'do total orçado' }]
    }));
    const graficos = [];
    if (obra) {
      const etapas = e.etapas.map((x) => ({
        nome: (x.eap ? x.eap + ' ' : '') + x.nome, sub: x.grupo, valor: x.valor, rotulo: moedaCurta(x.valor) + ' · ' + S.pct(x.participacao),
        dica: [{ valor: S.moeda(x.valor), nome: 'Valor orçado', classe: 's1' }, { valor: S.pct(x.participacao), nome: 'do total orçado' }]
      }));
      graficos.push(cartao({ titulo: 'Orçado por etapa', sub: 'Valor de cada etapa da EAP na versão atual', corpo: barras(etapas, { vazio: 'O orçamento ainda não tem etapas com valor.' }) }));
    }
    graficos.push(cartao({ titulo: 'Maiores serviços', sub: 'Curva ABC: ' + curva + ' orçado', corpo: barras(servicos, { vazio: 'Nenhum serviço com valor no orçamento.' }) }));
    if (!obra) {
      const lista = e.lista.slice(0, 8);
      graficos.push(cartao({
        titulo: 'Orçamentos', sub: 'Atualizados por último primeiro',
        corpo: lista.length ? '<div class="ini-tabela-rolagem">' + tabela(['Obra', 'Versão', 'Ref. SINAPI', 'Valor orçado'], lista.map((o) => [
          '<span class="ini-obra-nome">' + (o.codigo ? '<b>' + S.esc(o.codigo) + '</b> ' : '') + S.esc(o.nome) + '</span><small>atualizado em ' + S.esc(S.data(o.atualizadoEm)) + '</small>',
          'V' + o.versao, S.esc(refSinapi(o.referencia)), S.esc(S.moeda(o.orcado))
        ])) + '</div>' + (e.lista.length > lista.length && irOrc ? '<button type="button" class="ini-mais" data-ir="' + irOrc + '">Ver todos os ' + e.lista.length + ' orçamentos</button>' : '')
          : vazio('Nenhum orçamento cadastrado ainda.')
      }));
    }
    return secao('engenharia', 'Engenharia', obra ? nomeObra(obra) : 'Orçamentos e catálogo', cartoes, graficos);
  }

  /* ---------- montagem ---------- */
  function montarFiltros() {
    painel.innerHTML =
      '<div class="ini-filtros">' +
        '<div class="ini-periodo" role="group" aria-label="Período">' +
          [3, 6, 12].map((m) => '<button type="button" data-meses="' + m + '" aria-pressed="' + (m === estado.meses) + '">' + m + ' meses</button>').join('') +
        '</div>' +
        '<label class="ini-obra"><span>Obra</span><select data-filtro-obra><option value="">Todas as obras</option></select></label>' +
        '<span class="ini-intervalo" data-intervalo></span>' +
      '</div><div class="ini-corpo" data-corpo>' + '<p class="ini-vazio">Carregando o painel…</p>' + '</div>';
    painel.querySelector('.ini-periodo').addEventListener('click', (ev) => {
      const b = ev.target.closest('[data-meses]');
      if (!b || Number(b.dataset.meses) === estado.meses) return;
      estado.meses = Number(b.dataset.meses);
      painel.querySelectorAll('[data-meses]').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
      gravarFiltros();
      carregar();
    });
    painel.querySelector('[data-filtro-obra]').addEventListener('change', (ev) => {
      estado.obra = ev.target.value;
      gravarFiltros();
      carregar();
    });
    painel.addEventListener('click', (ev) => {
      const alternar = ev.target.closest('[data-alternar]');
      if (alternar) {
        const card = alternar.closest('.ini-card');
        const tabelaVisivel = alternar.getAttribute('aria-pressed') !== 'true';
        alternar.setAttribute('aria-pressed', String(tabelaVisivel));
        alternar.querySelector('span').textContent = tabelaVisivel ? 'Gráfico' : 'Tabela';
        card.querySelector('.ini-card-grafico').hidden = tabelaVisivel;
        card.querySelector('.ini-card-tabela').hidden = !tabelaVisivel;
        if (!tabelaVisivel) desenharGraficos();
        return;
      }
      if (ev.target.closest('[data-recarregar]')) { carregar(); return; }
      const ir = ev.target.closest('[data-ir]');
      if (!ir) return;
      const [tipo, alvo] = ir.dataset.ir.split(':');
      esconderDica();
      if (tipo === 'supr' && window.Supr && window.Supr.abrirNaObra) window.Supr.abrirNaObra(alvo, ir.dataset.obra != null ? ir.dataset.obra : estado.obra);
      else if (tipo === 'view' && window.ErpNav) window.ErpNav.abrir(alvo);
    });
    painel.addEventListener('pointermove', (ev) => {
      const alvo = ev.target.closest('[data-dica]');
      if (alvo) mostrarDica(alvo, ev.clientX, ev.clientY); else esconderDica();
    });
    painel.addEventListener('pointerleave', esconderDica);
    painel.addEventListener('focusin', (ev) => {
      const alvo = ev.target.closest('[data-dica]');
      if (!alvo) return;
      const r = alvo.getBoundingClientRect();
      mostrarDica(alvo, r.left + r.width / 2, r.bottom - 4);
    });
    painel.addEventListener('focusout', esconderDica);
    window.addEventListener('scroll', esconderDica, { passive: true });
    if (window.ResizeObserver) {
      new ResizeObserver(() => {
        const w = painel.clientWidth;
        if (w && w !== estado.largura) { estado.largura = w; requestAnimationFrame(desenharGraficos); }
      }).observe(painel);
    }
  }

  function desenhar() {
    const d = estado.dados;
    const corpo = painel.querySelector('[data-corpo]');
    const sel = painel.querySelector('[data-filtro-obra]');
    sel.innerHTML = '<option value="">Todas as obras</option>' +
      d.obras.map((o) => '<option value="' + S.esc(o.id) + '">' + S.esc(nomeObra(o)) + '</option>').join('');
    sel.value = d.obra;
    estado.obra = d.obra;
    const ultimo = d.mesesLista[d.mesesLista.length - 1];
    painel.querySelector('[data-intervalo]').textContent = mesCurto(d.mesesLista[0], true) + ' a ' + mesCurto(ultimo, true);
    estado.dicas = [];
    estado.graficos = [];
    const secoes = [];
    if (d.secoes.custos) secoes.push(secaoCustos(d));
    if (d.secoes.planejamento) secoes.push(secaoPlanejamento(d));
    if (d.secoes.suprimentos) secoes.push(secaoSuprimentos(d));
    if (d.secoes.financeiro) secoes.push(secaoFinanceiro(d));
    if (d.secoes.engenharia) secoes.push(secaoEngenharia(d));
    painel.querySelector('.ini-filtros').hidden = !secoes.length;
    // o período só vale para custos, suprimentos e financeiro (Engenharia e avanço físico mostram o hoje)
    const usaPeriodo = d.secoes.custos || d.secoes.suprimentos || d.secoes.financeiro;
    painel.querySelector('.ini-periodo').hidden = !usaPeriodo;
    painel.querySelector('[data-intervalo]').hidden = !usaPeriodo;
    corpo.innerHTML = secoes.join('') || '<div class="ini-sem-acesso">' + S.ic('cadeado', 'ic-lg') +
      '<strong>Nenhum painel liberado para você ainda</strong><p>Peça ao administrador para liberar os módulos em Usuários › Editar permissões.</p></div>';
    corpo.classList.remove('atualizando');
    desenharGraficos();
    corpo.querySelectorAll('[data-curva-ini]').forEach((el) => {
      if (window.Graficos && d.planejamento && d.planejamento.curva) window.Graficos.curvaS(el, { pontos: d.planejamento.curva, hoje: d.hoje, titulo: 'Curva S da obra' });
    });
  }

  async function carregar() {
    painel = painel || document.getElementById('inicioPainel');
    if (!painel || !S) return;
    if (!painel.querySelector('[data-corpo]')) montarFiltros();
    const corpo = painel.querySelector('[data-corpo]');
    corpo.classList.add('atualizando');
    const minha = ++estado.seq;
    try {
      const d = await S.get('inicio?meses=' + estado.meses + '&obra=' + encodeURIComponent(estado.obra));
      if (minha !== estado.seq) return;
      estado.dados = d;
      desenhar();
    } catch (e) {
      if (minha !== estado.seq) return;
      corpo.classList.remove('atualizando');
      const aviso = '<div class="ini-erro">' + S.ic('alerta', 'ic-sm') + '<span>Não foi possível carregar o painel: ' + S.esc(e.message) + '</span>' +
        '<button type="button" class="btn btn-ghost btn-sm" data-recarregar>Tentar de novo</button></div>';
      const antigo = corpo.querySelector('.ini-erro');
      if (antigo) antigo.remove();
      if (estado.dados) corpo.insertAdjacentHTML('afterbegin', aviso); else corpo.innerHTML = aviso;
    }
  }

  document.addEventListener('DOMContentLoaded', () => {
    dica = document.createElement('div');
    dica.className = 'ini-dica';
    dica.setAttribute('role', 'tooltip');
    dica.hidden = true;
    document.body.appendChild(dica);
  });
  // O Início é a tela de entrada: carrega quando o perfil chega e de novo a cada volta ao Início
  // (o perfil chega duas vezes na abertura: auth-ui.js e app.js; basta a primeira)
  document.addEventListener('app:profilechange', () => {
    if (estado.iniciado || !window.usuarioAtual) return;
    estado.iniciado = true;
    carregar();
  });
  document.addEventListener('app:viewchange', (ev) => {
    if (ev.detail && ev.detail.view === 'dashboard' && estado.iniciado) carregar();
  });
})();
