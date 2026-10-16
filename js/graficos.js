/* Peças de gráfico compartilhadas (Início e Planejamento): a dica flutuante e a curva S (avanço
   físico previsto × realizado no tempo). Linhas finas, eixo de 0 a 100%, marca de "hoje", rótulo só
   no fim do realizado, mira vertical que acompanha o ponteiro e o teclado (setas) com os dois
   valores na dica. Texto sempre por textContent. */
(function () {
  'use strict';
  const MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
  const NS = 'http://www.w3.org/2000/svg';
  const pct = (v) => (v == null ? '—' : (Math.round(v * 10) / 10).toLocaleString('pt-BR', { maximumFractionDigits: 1 }) + '%');
  const dataBr = (iso) => iso.slice(8, 10) + '/' + iso.slice(5, 7) + '/' + iso.slice(0, 4);
  const tempo = (iso) => Date.UTC(Number(iso.slice(0, 4)), Number(iso.slice(5, 7)) - 1, Number(iso.slice(8, 10)));

  /* ---------- dica ---------- */
  let caixa = null;
  function elemento() {
    if (!caixa) {
      caixa = document.createElement('div');
      caixa.className = 'graf-dica';
      caixa.setAttribute('role', 'tooltip');
      caixa.hidden = true;
      document.body.appendChild(caixa);
      window.addEventListener('scroll', esconder, { passive: true });
    }
    return caixa;
  }
  // conteudo: { titulo, linhas: [{ valor, nome, classe, total }] }; x, y: posição na janela
  function mostrar(conteudo, x, y) {
    const d = elemento();
    d.replaceChildren();
    if (conteudo.titulo) {
      const t = document.createElement('div');
      t.className = 'graf-dica-titulo';
      t.textContent = conteudo.titulo;
      d.appendChild(t);
    }
    for (const l of conteudo.linhas || []) {
      const linha = document.createElement('div');
      linha.className = 'graf-dica-linha' + (l.total ? ' total' : '');
      const chave = document.createElement('span');
      chave.className = 'graf-chave' + (l.classe ? ' ' + l.classe : '');
      const valor = document.createElement('strong');
      valor.textContent = l.valor;
      const nome = document.createElement('span');
      nome.textContent = l.nome;
      linha.append(chave, valor, nome);
      d.appendChild(linha);
    }
    d.hidden = false;
    const r = d.getBoundingClientRect();
    let px = x + 14, py = y + 14;
    if (px + r.width > window.innerWidth - 8) px = Math.max(8, x - r.width - 14);
    if (py + r.height > window.innerHeight - 8) py = Math.max(8, y - r.height - 14);
    d.style.left = px + 'px';
    d.style.top = py + 'px';
  }
  function esconder() { if (caixa) caixa.hidden = true; }

  /* ---------- curva S ---------- */
  function no(tipo, attrs, pai) {
    const e = document.createElementNS(NS, tipo);
    for (const k in attrs) e.setAttribute(k, attrs[k]);
    if (pai) pai.appendChild(e);
    return e;
  }
  // op: { pontos: [{ data, previsto, realizado|null }], hoje, titulo, legenda (true) }
  function curvaS(el, op) {
    el.__curva = op;
    if (!el.__observador && window.ResizeObserver) {
      let largura = 0;
      el.__observador = new ResizeObserver(() => {
        if (el.clientWidth && el.clientWidth !== largura) { largura = el.clientWidth; desenhar(el); }
      });
      el.__observador.observe(el);
    }
    desenhar(el);
  }

  function desenhar(el) {
    const op = el.__curva;
    const pontos = (op && op.pontos) || [];
    el.replaceChildren();
    if (pontos.length < 2) { el.textContent = 'Sem dados para a curva.'; return; }
    if (op.legenda !== false) {
      const ul = document.createElement('ul');
      ul.className = 'graf-legenda';
      for (const [classe, nome] of [['previsto', 'Previsto'], ['realizado', 'Realizado']]) {
        const li = document.createElement('li');
        const k = document.createElement('span');
        k.className = 'graf-chave ' + classe;
        li.append(k, document.createTextNode(nome));
        ul.appendChild(li);
      }
      el.appendChild(ul);
    }
    const largura = Math.max(280, Math.floor(el.clientWidth));
    const altura = 220;
    const m = { t: 22, r: 52, b: 24, l: 40 };
    const pw = largura - m.l - m.r, ph = altura - m.t - m.b;
    const t0 = tempo(pontos[0].data), t1 = tempo(pontos[pontos.length - 1].data);
    const x = (iso) => m.l + (t1 > t0 ? (tempo(iso) - t0) / (t1 - t0) : 0) * pw;
    const y = (v) => m.t + ph - (Math.max(0, Math.min(100, v)) / 100) * ph;
    const svg = no('svg', { class: 'graf-svg', width: largura, height: altura, viewBox: '0 0 ' + largura + ' ' + altura,
      role: 'img', tabindex: '0', 'aria-label': (op.titulo || 'Curva S') + ': use as setas para percorrer as datas' });
    for (const v of [0, 25, 50, 75, 100]) {
      no('line', { class: v ? 'grade' : 'base', x1: m.l, x2: largura - m.r, y1: Math.round(y(v)) + 0.5, y2: Math.round(y(v)) + 0.5 }, svg);
      no('text', { class: 'eixo', x: m.l - 8, y: Math.round(y(v)) + 4, 'text-anchor': 'end' }, svg).textContent = v + '%';
    }
    // meses no eixo x, sem encavalar
    const anos = new Set(pontos.map((p) => p.data.slice(0, 4))).size > 1;
    let ultimoX = -Infinity, primeiro = true;
    const [ai, mi] = [Number(pontos[0].data.slice(0, 4)), Number(pontos[0].data.slice(5, 7))];
    for (let k = 0; k < 600; k++) {
      const d = new Date(Date.UTC(ai, mi - 1 + k, 1)).toISOString().slice(0, 10);
      if (tempo(d) > t1) break;
      if (tempo(d) < t0) continue;
      const xx = x(d);
      if (xx - ultimoX < 46) continue;
      ultimoX = xx;
      no('text', { class: 'eixo', x: xx, y: altura - 7, 'text-anchor': 'middle' }, svg).textContent =
        MESES[Number(d.slice(5, 7)) - 1] + (anos || primeiro ? '/' + d.slice(2, 4) : '');
      primeiro = false;
    }
    // hoje
    if (op.hoje && tempo(op.hoje) >= t0 && tempo(op.hoje) <= t1) {
      const xh = Math.round(x(op.hoje)) + 0.5;
      no('line', { class: 'hoje', x1: xh, x2: xh, y1: m.t - 6, y2: m.t + ph }, svg);
      no('text', { class: 'eixo', x: xh, y: m.t - 10, 'text-anchor': 'middle' }, svg).textContent = 'hoje';
    }
    const caminho = (chave) => {
      let d = '';
      for (const p of pontos) if (p[chave] != null) d += (d ? 'L' : 'M') + x(p.data).toFixed(1) + ',' + y(p[chave]).toFixed(1);
      return d;
    };
    no('path', { class: 'linha previsto', d: caminho('previsto') }, svg);
    no('path', { class: 'linha realizado', d: caminho('realizado') }, svg);
    // fim do realizado: ponto com anel e o valor
    const reais = pontos.filter((p) => p.realizado != null);
    if (reais.length) {
      const u = reais[reais.length - 1];
      no('circle', { class: 'ponto realizado', cx: x(u.data), cy: y(u.realizado), r: 4 }, svg);
      const direita = x(u.data) + 8 + 40 < largura;
      no('text', { class: 'rotulo', x: x(u.data) + (direita ? 8 : -8), y: y(u.realizado) - 8, 'text-anchor': direita ? 'start' : 'end' }, svg).textContent = pct(u.realizado);
    }
    // mira: linha vertical e pontos na data mais próxima do ponteiro (ou das setas)
    const mira = no('g', { class: 'mira', visibility: 'hidden' }, svg);
    const linhaMira = no('line', { x1: 0, x2: 0, y1: m.t, y2: m.t + ph }, mira);
    const pontoPrev = no('circle', { class: 'ponto previsto', r: 4 }, mira);
    const pontoReal = no('circle', { class: 'ponto realizado', r: 4 }, mira);
    let atual = -1;
    function marcar(i, cx, cy) {
      atual = Math.max(0, Math.min(pontos.length - 1, i));
      const p = pontos[atual];
      const xx = x(p.data);
      linhaMira.setAttribute('x1', xx); linhaMira.setAttribute('x2', xx);
      pontoPrev.setAttribute('cx', xx); pontoPrev.setAttribute('cy', y(p.previsto));
      pontoReal.setAttribute('visibility', p.realizado == null ? 'hidden' : 'visible');
      if (p.realizado != null) { pontoReal.setAttribute('cx', xx); pontoReal.setAttribute('cy', y(p.realizado)); }
      mira.setAttribute('visibility', 'visible');
      const linhas = [{ valor: pct(p.realizado), nome: 'Realizado', classe: 'realizado' }, { valor: pct(p.previsto), nome: 'Previsto', classe: 'previsto' }];
      if (p.realizado != null) {
        const desvio = p.realizado - p.previsto;
        linhas.push({ valor: (desvio > 0 ? '+' : '') + pct(desvio).replace('%', ' p.p.'), nome: 'Desvio', total: true });
      }
      const r = svg.getBoundingClientRect();
      mostrar({ titulo: dataBr(p.data) + (p.data === op.hoje ? ' (hoje)' : ''), linhas }, cx != null ? cx : r.left + xx, cy != null ? cy : r.top + m.t + 20);
    }
    function maisProximo(clientX) {
      const r = svg.getBoundingClientRect();
      const px = clientX - r.left;
      let melhor = 0, dist = Infinity;
      pontos.forEach((p, i) => { const dd = Math.abs(x(p.data) - px); if (dd < dist) { dist = dd; melhor = i; } });
      return melhor;
    }
    svg.addEventListener('pointermove', (ev) => marcar(maisProximo(ev.clientX), ev.clientX, ev.clientY));
    svg.addEventListener('pointerleave', () => { mira.setAttribute('visibility', 'hidden'); esconder(); });
    svg.addEventListener('focus', () => {
      const ih = op.hoje ? pontos.findIndex((p) => p.data === op.hoje) : -1;
      marcar(ih >= 0 ? ih : pontos.length - 1);
    });
    svg.addEventListener('blur', () => { mira.setAttribute('visibility', 'hidden'); esconder(); });
    svg.addEventListener('keydown', (ev) => {
      if (ev.key === 'ArrowLeft' || ev.key === 'ArrowRight') { ev.preventDefault(); marcar(atual + (ev.key === 'ArrowRight' ? 1 : -1)); }
      else if (ev.key === 'Escape') { mira.setAttribute('visibility', 'hidden'); esconder(); }
    });
    el.appendChild(svg);
  }

  window.Graficos = { dica: { mostrar, esconder }, curvaS, pct, dataBr };
})();
