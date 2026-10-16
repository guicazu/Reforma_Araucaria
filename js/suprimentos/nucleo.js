/* Núcleo de Suprimentos (padrão SIENGE): estado, chamadas a /api/suprimentos, formatação pt-BR,
   janelas, tabelas, seletores (obra, fornecedor, serviço da EAP, insumo do orçamento) e navegação
   entre as telas que os outros arquivos de js/suprimentos/ registram com Supr.registrar(nome, tela).
   Cada item de Suprimentos no menu lateral abre uma tela (data-aba); dentro dela, Supr.ir() troca
   de tela guardando o caminho para o "Voltar". */
(function () {
  'use strict';

  const S = window.Supr = {};
  const CHAVE_OBRA = 'supr_obra';
  const estado = S.estado = { obra: lerObra(), obras: [], config: null, aba: null, params: null, pilha: [], carregado: false };
  const cache = {};

  function lerObra() { try { return localStorage.getItem(CHAVE_OBRA) || ''; } catch (e) { return ''; } }
  function gravarObra(id) { try { localStorage.setItem(CHAVE_OBRA, id || ''); } catch (e) { /* sem armazenamento */ } }

  /* ---------- formatação ---------- */
  S.esc = (v) => String(v == null ? '' : v).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const fmtMoeda = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
  S.moeda = (v) => fmtMoeda.format(Number(v) || 0);
  S.qtd = (v, casas) => (Number(v) || 0).toLocaleString('pt-BR', { maximumFractionDigits: casas == null ? 4 : casas });
  S.pct = (v) => (Number(v) || 0).toLocaleString('pt-BR', { maximumFractionDigits: 1 }) + '%';
  S.arred = (v, casas) => { const f = Math.pow(10, casas == null ? 2 : casas); return Math.round((Number(v) || 0) * f) / f; };
  S.data = (iso) => { if (!iso) return '—'; const d = String(iso).slice(0, 10).split('-'); return d.length === 3 ? d[2] + '/' + d[1] + '/' + d[0] : String(iso); };
  S.dataHora = (iso) => { if (!iso) return '—'; const d = new Date(iso); return isNaN(d) ? String(iso) : d.toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }); };
  S.hoje = () => new Date().toLocaleDateString('en-CA');
  S.somarDias = (iso, dias) => { const d = new Date(iso + 'T12:00:00'); d.setDate(d.getDate() + (Number(dias) || 0)); return d.toLocaleDateString('en-CA'); };
  // "1.234,56", "1234,56" ou "1234.56" -> número; vazio -> null
  S.num = (v) => {
    if (v == null) return null;
    let s = String(v).trim().replace(/\s|R\$/g, '');
    if (!s) return null;
    if (s.indexOf(',') >= 0) s = s.replace(/\./g, '').replace(',', '.');
    else if ((s.match(/\./g) || []).length > 1) s = s.replace(/\./g, '');
    const n = Number(s);
    return Number.isFinite(n) ? n : null;
  };
  S.valorCampo = (v, casas) => (v == null || v === '' ? '' : String(S.arred(v, casas == null ? 4 : casas)).replace('.', ','));
  S.documento = (d) => {
    const s = String(d || '').replace(/\D/g, '');
    if (s.length === 14) return s.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5');
    if (s.length === 11) return s.replace(/^(\d{3})(\d{3})(\d{3})(\d{2})$/, '$1.$2.$3-$4');
    return s;
  };
  S.nome = (t) => (window.primeiraMaiuscula ? window.primeiraMaiuscula(t || '') : String(t || ''));
  S.ic = (nome, classe) => (window.icone ? window.icone(nome, classe) : '');
  S.TIPOS_INSUMO = { material: 'Material', maoDeObra: 'Mão de obra', equipamento: 'Equipamento', servico: 'Serviço / verba' };

  /* ---------- API ---------- */
  function erroApi(mensagem, status, dados) {
    const e = new Error(mensagem);
    e.status = status;
    e.dados = dados || null;
    return e;
  }
  S.api = async function (metodo, caminho, corpo, opcoes) {
    const base = (opcoes && opcoes.base) || '/api/suprimentos/';
    const init = { method: metodo, credentials: 'same-origin', headers: {} };
    if (corpo !== undefined) { init.headers['Content-Type'] = 'application/json'; init.body = JSON.stringify(corpo); }
    let r;
    try { r = await fetch(base + String(caminho).replace(/^\//, ''), init); }
    catch (e) { throw erroApi('Sem conexão com o servidor. Confira a internet e tente de novo.', 0); }
    if (r.redirected && /\/login|aguardando-aprovacao/.test(r.url)) { location.href = r.url; throw erroApi('Sessão expirada.', 401); }
    const tipo = r.headers.get('content-type') || '';
    const dados = tipo.indexOf('json') >= 0 ? await r.json().catch(() => ({})) : null;
    if (metodo !== 'GET') {
      cache.orcado = null;
      if (/^fornecedores/.test(caminho)) cache.fornecedores = null;
      if (/^condicoes/.test(caminho)) cache.condicoes = null;
      setTimeout(S.atualizarContador, 300);
    }
    if (!r.ok) {
      if (r.status === 401) location.href = '/login';
      throw erroApi((dados && dados.mensagem) || 'Não foi possível concluir (erro ' + r.status + ').', r.status, dados);
    }
    return dados || {};
  };
  S.get = (c) => S.api('GET', c);
  S.post = (c, corpo) => S.api('POST', c, corpo || {});
  S.put = (c, corpo) => S.api('PUT', c, corpo || {});
  S.del = (c) => S.api('DELETE', c);

  S.fornecedores = async (forcar) => {
    if (forcar || !cache.fornecedores) cache.fornecedores = (await S.get('fornecedores')).fornecedores;
    return cache.fornecedores;
  };
  S.condicoes = async (forcar) => {
    if (forcar || !cache.condicoes) cache.condicoes = (await S.get('condicoes')).condicoes;
    return cache.condicoes;
  };
  // Orçado da obra com o que já foi solicitado/comprado/recebido (refeito após qualquer gravação)
  S.orcado = async (obraId, forcar) => {
    if (forcar || !cache.orcado || cache.orcado.id !== obraId) cache.orcado = { id: obraId, dados: await S.get('obras/' + encodeURIComponent(obraId) + '/orcado') };
    return cache.orcado.dados;
  };

  /* ---------- avisos ---------- */
  S.aviso = (mensagem, tipo) => {
    let caixa = document.querySelector('.supr-toasts');
    if (!caixa) { caixa = document.createElement('div'); caixa.className = 'supr-toasts'; caixa.setAttribute('role', 'status'); document.body.appendChild(caixa); }
    const t = document.createElement('div');
    t.className = 'supr-toast' + (tipo === 'erro' ? ' erro' : '');
    t.innerHTML = S.ic(tipo === 'erro' ? 'alerta' : 'check') + '<span>' + S.esc(mensagem) + '</span>';
    caixa.appendChild(t);
    setTimeout(() => t.remove(), tipo === 'erro' ? 8000 : 3800);
  };
  S.falhou = (e) => {
    if (e && e.status !== 401) console.error(e);
    S.aviso(e && e.message ? e.message : 'Algo deu errado. Tente de novo.', 'erro');
  };

  /* ---------- janelas ---------- */
  // op: { titulo, corpo (html), tamanho: ''|'md'|'lg'|'xl', botao, perigo, rodape (html), aoAbrir(corpo, dlg, fechar),
  //       aoConfirmar(corpo, dlg) -> false mantém aberta; o retorno vira o resultado }
  S.dialogo = (op) => {
    const dlg = document.createElement('dialog');
    dlg.className = 'supr-dlg ' + (op.tamanho || '');
    const rodape = op.rodape != null ? op.rodape
      : '<span class="espaco"></span><button type="button" class="btn btn-ghost" data-fechar>' + S.esc(op.textoFechar || (op.botao ? 'Cancelar' : 'Fechar')) + '</button>' +
        (op.botao ? '<button type="button" class="btn ' + (op.perigo ? 'btn-danger' : 'btn-primary') + '" data-confirmar>' + S.esc(op.botao) + '</button>' : '');
    dlg.innerHTML = '<div class="supr-dlg-cab"><h3>' + S.esc(op.titulo) + '</h3><button type="button" class="btn-icon" data-fechar aria-label="Fechar">' + S.ic('fechar') + '</button></div>' +
      '<div class="supr-dlg-corpo">' + (op.corpo || '') + '</div>' + (rodape ? '<div class="supr-dlg-rodape">' + rodape + '</div>' : '');
    document.body.appendChild(dlg);
    const corpo = dlg.querySelector('.supr-dlg-corpo');
    let resolver;
    const resultado = new Promise((r) => { resolver = r; });
    let fechado = false;
    function fechar(valor) {
      if (fechado) return;
      fechado = true;
      if (dlg.open) dlg.close();
      dlg.remove();
      resolver(valor === undefined ? null : valor);
    }
    dlg.addEventListener('cancel', (ev) => { ev.preventDefault(); fechar(null); });
    dlg.addEventListener('click', async (ev) => {
      if (ev.target.closest('[data-fechar]')) { fechar(null); return; }
      const botao = ev.target.closest('[data-confirmar]');
      if (!botao || !op.aoConfirmar) return;
      botao.disabled = true;
      try {
        const r = await op.aoConfirmar(corpo, dlg);
        if (r !== false) fechar(r === undefined ? true : r);
      } catch (e) { S.falhou(e); }
      finally { botao.disabled = false; }
    });
    dlg.showModal();
    if (op.aoAbrir) op.aoAbrir(corpo, dlg, fechar);
    return { dlg, corpo, fechar, resultado };
  };

  // Confirmação com motivo opcional/obrigatório; executar(motivo) roda com a janela aberta
  // (erro mantém a janela e o texto digitado)
  S.acao = (op) => {
    const motivo = op.motivo
      ? '<label class="campo largo">' + S.esc(op.rotuloMotivo || 'Motivo') + (op.motivo === 'obrigatorio' ? '' : ' <span class="supr-dica">(opcional)</span>') +
        '<textarea rows="3" data-motivo></textarea></label>'
      : '';
    const d = S.dialogo({
      titulo: op.titulo, botao: op.botao || 'Confirmar', perigo: op.perigo, tamanho: op.tamanho,
      corpo: (op.texto ? '<p class="texto">' + op.texto + '</p>' : '') + (op.extra || '') + motivo,
      aoAbrir: (corpo) => { const m = corpo.querySelector('[data-motivo]'); if (m) setTimeout(() => m.focus(), 30); if (op.aoAbrir) op.aoAbrir(corpo); },
      aoConfirmar: async (corpo) => {
        const m = corpo.querySelector('[data-motivo]');
        const texto = m ? m.value.trim() : '';
        if (op.motivo === 'obrigatorio' && !texto) { m.classList.add('invalido'); m.focus(); S.aviso('Informe o motivo.', 'erro'); return false; }
        const r = op.executar ? await op.executar(texto, corpo) : true;
        if (r === false) return false;
        if (op.sucesso) S.aviso(op.sucesso);
        return r === undefined ? true : r;
      }
    });
    return d.resultado.then((r) => { if (r && op.depois !== false) (op.depois || S.recarregar)(r); return r; });
  };

  /* ---------- pedaços de tela ---------- */
  const ST = {
    solicitacao: { pendente: ['Aguardando autorização', 'amarelo'], autorizada: ['Autorizada', 'azul'], aguardando_compra: ['Aguardando compra', 'azul'],
      em_cotacao: ['Em cotação', 'roxo'], atendida_parcial: ['Atendida parcialmente', 'roxo'], atendida: ['Atendida', 'verde'], reprovada: ['Reprovada', 'vermelho'], cancelada: ['Cancelada', 'cinza'] },
    item: { pendente: ['Pendente', 'amarelo'], autorizado: ['Autorizado', 'azul'], reprovado: ['Reprovado', 'vermelho'], cancelado: ['Cancelado', 'cinza'] },
    cotacao: { aberta: ['Aberta', 'azul'], finalizada: ['Finalizada', 'verde'], cancelada: ['Cancelada', 'cinza'] },
    pedido: { pendente: ['Aguardando autorização', 'amarelo'], autorizado: ['Autorizado', 'azul'], reprovado: ['Reprovado', 'vermelho'], parcial: ['Entregue parcialmente', 'roxo'],
      entregue: ['Entregue', 'verde'], encerrado: ['Encerrado', 'cinza'], cancelado: ['Cancelado', 'cinza'] },
    nota: { lancada: ['Lançada', 'verde'], cancelada: ['Cancelada', 'cinza'] },
    contrato: { pendente: ['Aguardando autorização', 'amarelo'], autorizado: ['Vigente', 'azul'], reprovado: ['Reprovado', 'vermelho'], encerrado: ['Encerrado', 'verde'], cancelado: ['Cancelado', 'cinza'] },
    aditivo: { pendente: ['Aguardando autorização', 'amarelo'], autorizado: ['Autorizado', 'verde'], reprovado: ['Reprovado', 'vermelho'], cancelado: ['Cancelado', 'cinza'] },
    medicao: { pendente: ['Aguardando autorização', 'amarelo'], autorizada: ['Autorizada', 'verde'], reprovada: ['Reprovada', 'vermelho'], cancelada: ['Cancelada', 'cinza'] },
    titulo: { aberto: ['Em aberto', 'azul'], vencido: ['Vencido', 'vermelho'], pago: ['Pago', 'verde'], cancelado: ['Cancelado', 'cinza'] }
  };
  S.rotuloStatus = (tipo, s) => ((ST[tipo] || {})[s] || [s || '—'])[0];
  S.status = (tipo, s) => { const x = (ST[tipo] || {})[s] || [s || '—', 'cinza']; return '<span class="st st-' + x[1] + '">' + S.esc(x[0]) + '</span>'; };
  S.tag = (texto, cor, titulo) => '<span class="st st-' + (cor || 'cinza') + '"' + (titulo ? ' title="' + S.esc(titulo) + '"' : '') + '>' + S.esc(texto) + '</span>';

  // colunas: [{ t: 'Título', v: (linha, i) => html, c: 'num'|'acoes'|... }]; op: { id(linha), vazio, rodape, classe, classeLinha(linha) }
  S.tabela = (colunas, linhas, op) => {
    op = op || {};
    if (!linhas.length) return '<div class="supr-vazio">' + (op.vazio || 'Nada por aqui ainda.') + '</div>';
    let h = '<div class="supr-tabela-wrap"><table class="supr-tabela' + (op.classe ? ' ' + op.classe : '') + '"><thead><tr>' +
      colunas.map((c) => '<th class="' + (c.c || '') + '"' + (c.titulo ? ' title="' + S.esc(c.titulo) + '"' : '') + '>' + c.t + '</th>').join('') + '</tr></thead><tbody>';
    h += linhas.map((l, i) => {
      const id = op.id ? op.id(l) : null;
      const cls = [id ? 'clicavel' : '', op.classeLinha ? op.classeLinha(l) : ''].filter(Boolean).join(' ');
      return '<tr' + (cls ? ' class="' + cls + '"' : '') + (id ? ' data-abrir="' + S.esc(id) + '"' : '') + '>' +
        colunas.map((c) => '<td class="' + (c.c || '') + '">' + c.v(l, i) + '</td>').join('') + '</tr>';
    }).join('');
    return h + '</tbody>' + (op.rodape ? '<tfoot>' + op.rodape + '</tfoot>' : '') + '</table></div>';
  };
  // Clique numa linha com data-abrir (fora de botões e campos)
  S.aoAbrirLinha = (c, fn) => {
    c.addEventListener('click', (ev) => {
      if (ev.target.closest('button, a, input, select, textarea, label')) return;
      const tr = ev.target.closest('tr[data-abrir]');
      if (tr && c.contains(tr)) fn(tr.dataset.abrir, tr);
    });
  };
  S.ficha = (pares) => '<dl class="supr-ficha">' + pares.filter((p) => p && p[1] != null && p[1] !== '')
    .map((p) => '<div' + (p[2] ? ' class="largo"' : '') + '><dt>' + S.esc(p[0]) + '</dt><dd>' + p[1] + '</dd></div>').join('') + '</dl>';
  S.cabecalho = (op) => (op.voltar === false ? '' : '<button type="button" class="supr-voltar" data-voltar>' + S.ic('voltar') + S.esc(op.voltar || 'Voltar') + '</button>') +
    '<div class="supr-cab"><div><h3>' + S.esc(op.titulo) + (op.status ? ' ' + op.status : '') + '</h3>' + (op.sub ? '<p>' + op.sub + '</p>' : '') + '</div>' +
    (op.acoes ? '<div class="supr-acoes">' + op.acoes + '</div>' : '') + '</div>';
  S.botao = (acao, texto, op) => {
    op = op || {};
    const cls = op.primario ? 'btn-primary' : op.perigo ? 'btn-danger' : 'btn-ghost';
    return '<button type="button" class="btn ' + cls + ' btn-sm" data-acao="' + acao + '"' + (op.titulo ? ' title="' + S.esc(op.titulo) + '"' : '') +
      (op.desabilitado ? ' disabled' : '') + (op.dados ? ' ' + op.dados : '') + '>' + (op.icone ? S.ic(op.icone) : '') + S.esc(texto) + '</button>';
  };
  S.historico = (lista) => (lista && lista.length
    ? '<ul class="supr-historico">' + lista.map((h) => '<li><time>' + S.dataHora(h.criadoEm) + '</time><div><b>' + S.esc(h.acao) + '</b> · ' +
      S.esc(h.usuarioNome || h.usuarioEmail || '') + (h.detalhe ? '<br><span>' + S.esc(h.detalhe) + '</span>' : '') + '</div></li>').join('') + '</ul>'
    : '<div class="supr-vazio">Sem histórico.</div>');
  S.secao = (titulo, conteudo, extra) => '<section class="supr-secao"><h4>' + titulo + (extra ? '<span class="espaco"></span>' + extra : '') + '</h4>' + conteudo + '</section>';
  S.carregando = (texto) => '<div class="supr-carregando">' + S.esc(texto || 'Carregando…') + '</div>';
  S.chips = (opcoes, ativo, nome) => '<div class="supr-chips" data-chips="' + (nome || '') + '">' + opcoes.map((o) =>
    '<button type="button" data-valor="' + S.esc(o[0]) + '"' + (o[0] === ativo ? ' class="ativo"' : '') + '>' + S.esc(o[1]) + (o[2] != null ? '<span class="n">' + o[2] + '</span>' : '') + '</button>').join('') + '</div>';
  S.busca = (valor, placeholder) => '<span class="supr-busca">' + S.ic('buscar') + '<input type="search" data-busca value="' + S.esc(valor || '') + '" placeholder="' + S.esc(placeholder || 'Buscar') + '"></span>';
  S.normalizar = (t) => String(t || '').normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase();
  S.combina = (termo, campos) => {
    const palavras = S.normalizar(termo).split(/\s+/).filter(Boolean);
    if (!palavras.length) return true;
    const alvo = S.normalizar(campos.filter((x) => x != null).join(' '));
    return palavras.every((p) => alvo.indexOf(p) >= 0);
  };
  // CSV para o Excel em português (ponto e vírgula, vírgula decimal, BOM) e download de arquivo
  S.csv = (linhas) => {
    const esc = (v) => { const s = v == null ? '' : typeof v === 'number' ? String(v).replace('.', ',') : String(v); return /[";\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
    return '\ufeff' + linhas.map((l) => l.map(esc).join(';')).join('\r\n');
  };
  S.baixar = (nome, conteudo, tipo) => {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([conteudo], { type: tipo || 'text/csv;charset=utf-8' }));
    a.download = nome;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  };
  S.copiar = async (texto, mensagem) => {
    try { await navigator.clipboard.writeText(texto); S.aviso(mensagem || 'Link copiado.'); }
    catch (e) { window.prompt('Copie o link:', texto); }
  };

  /* ---------- obra e permissões ---------- */
  S.obraAtual = () => estado.obra;
  S.obraPorId = (id) => estado.obras.find((o) => o.id === id) || null;
  S.nomeObra = (id) => { const o = S.obraPorId(id); return o ? (o.codigo ? o.codigo + ' — ' : '') + o.nome : '—'; };
  S.opcoesObras = (selecionada, vazio) => '<option value="">' + S.esc(vazio || 'Escolha a obra') + '</option>' +
    estado.obras.map((o) => '<option value="' + S.esc(o.id) + '"' + (o.id === selecionada ? ' selected' : '') + '>' + S.esc((o.codigo ? o.codigo + ' — ' : '') + o.nome) + '</option>').join('');
  // Telas que precisam de uma obra: sem obra escolhida, mostra o pedido para escolher
  S.semObra = (c, texto) => {
    if (estado.obra) return false;
    c.innerHTML = '<div class="supr-vazio"><strong>Escolha a obra</strong>' + S.esc(texto || 'Esta tela mostra uma obra por vez.') +
      '<div style="margin-top:12px"><select data-escolher-obra style="min-width:280px">' + S.opcoesObras('') + '</select></div></div>';
    c.querySelector('[data-escolher-obra]').addEventListener('change', (ev) => S.definirObra(ev.target.value));
    return true;
  };
  S.definirObra = (id) => {
    estado.obra = id || '';
    gravarObra(estado.obra);
    const sel = document.getElementById('suprObra');
    if (sel) sel.value = estado.obra;
    S.recarregar();
  };
  // Permissões por módulo (Usuários › Editar permissões). Sem módulo, vale o da tela aberta.
  const SUPRIMENTOS = ['solicitacoes', 'cotacoes', 'pedidos', 'notas', 'contratos', 'estoque', 'acompanhamento', 'cadastros', 'financeiro'];
  const SEM_MODULO = { painel: true, autorizacoes: true };
  function moduloDaTela() {
    const tela = S.telas[estado.aba];
    const menu = (tela && tela.menu) || estado.aba;
    return SEM_MODULO[menu] ? null : menu;
  }
  S.pode = (modulo, acao) => {
    const p = estado.config && estado.config.usuario.permissoes;
    if (!p) return false;
    if (modulo === '*') return SUPRIMENTOS.some((m) => p[m] && p[m].visualizar);
    const x = p[modulo];
    return Boolean(x && (acao === 'editar' ? x.editar : x.visualizar));
  };
  S.podeEditar = (modulo) => { const m = modulo || moduloDaTela(); return m ? S.pode(m, 'editar') : false; };
  S.isAdmin = () => !!(estado.config && estado.config.usuario.isAdmin);
  S.parametro = (chave) => (estado.config ? estado.config.parametros[chave] : null);
  S.podeAutorizar = (tipo, valor) => {
    const a = estado.config && estado.config.alcadas;
    if (!a || !(tipo in a)) return false;
    return a[tipo] == null || (Number(valor) || 0) <= a[tipo] + 0.005;
  };

  /* ---------- serviços da EAP ---------- */
  S.servicos = (orc) => orc.eap.filter((n) => n.tipo === 'servico');
  S.servicoPorId = (orc, id) => orc.eap.find((n) => n.tipo === 'servico' && n.id === id) || null;
  S.nomeServico = (orc, id) => { const s = S.servicoPorId(orc, id); return s ? s.eap + ' — ' + S.nome(s.nome) : 'Serviço removido do orçamento'; };
  S.caminho = (n) => (n.caminho || []).map((t, i) => (i === 0 && window.tudoMaiusculo ? window.tudoMaiusculo(t) : S.nome(t))).join(' › ');
  S.opcoesServicos = (orc, selecionado, vazio) => {
    let h = '<option value="">' + S.esc(vazio || 'Escolha o serviço') + '</option>';
    let grupo = null;
    for (const n of orc.eap) {
      if (n.tipo !== 'servico') continue;
      const g = S.caminho(n);
      if (g !== grupo) { if (grupo !== null) h += '</optgroup>'; h += '<optgroup label="' + S.esc(g) + '">'; grupo = g; }
      h += '<option value="' + S.esc(n.id) + '"' + (n.id === selecionado ? ' selected' : '') + '>' + S.esc(n.eap + ' — ' + S.nome(n.nome)) + '</option>';
    }
    return h + (grupo !== null ? '</optgroup>' : '');
  };
  // Resumo da apropriação: "1.2.1 · 1.3.4 (40%)"; o título lista os serviços
  S.textoApropriacao = (orc, aprops) => {
    const lista = aprops || [];
    if (!lista.length) return '—';
    const titulo = lista.map((a) => S.nomeServico(orc, a.servicoId) + ' (' + S.pct(a.percentual) + ')').join('\n');
    const curto = lista.map((a) => { const s = S.servicoPorId(orc, a.servicoId); return (s ? s.eap : '?') + (lista.length > 1 ? ' (' + S.pct(a.percentual) + ')' : ''); }).join(' · ');
    return '<span title="' + S.esc(titulo) + '">' + S.esc(curto) + '</span>';
  };

  /* ---------- seletores ---------- */
  S.opcoesFornecedores = (lista, selecionado, vazio) => '<option value="">' + S.esc(vazio || 'Escolha o fornecedor') + '</option>' +
    lista.map((f) => '<option value="' + S.esc(f.id) + '"' + (f.id === selecionado ? ' selected' : '') + '>' + S.esc(f.nome + (f.documento ? ' · ' + S.documento(f.documento) : '')) + '</option>').join('');
  S.opcoesCondicoes = (lista, selecionado, vazio) => '<option value="">' + S.esc(vazio || 'A combinar') + '</option>' +
    lista.map((c) => '<option value="' + S.esc(c.id) + '"' + (c.id === selecionado ? ' selected' : '') + '>' + S.esc(c.descricao) + '</option>').join('');
  S.textoParcelas = (parcelas) => (parcelas || []).map((p) => (Number(p.dias) === 0 ? 'à vista' : p.dias + ' d') + ' (' + S.pct(p.percentual) + ')').join(' · ');
  // Cadastro rápido de fornecedor (a janela completa fica em cadastros.js)
  S.novoFornecedor = () => (S.formFornecedor ? S.formFornecedor(null) : Promise.resolve(null));

  /* ---------- escolher insumo: do orçamento (com saldo por serviço) ou fora dele ---------- */
  // op: { orc, titulo, botao, apropriacao (true), preco (false), necessidade (true), item (para editar),
  //       ja: Map 'chave|servicoId' -> quantidade já incluída no documento em edição, foraPermitido (true) }
  // Resultado: { insumoChave, insumoCodigo, descricao, unidade, tipo, base, precoReferencia, foraOrcamento,
  //              apropriacoes: [{ servicoId, quantidade }], quantidade, dataNecessidade, observacao, precoUnitario }
  S.escolherInsumo = (op) => {
    const orc = op.orc;
    const comApropriacao = op.apropriacao !== false;
    const ja = op.ja || new Map();
    let filtroTipo = op.tipoInicial || 'material';
    let soComSaldo = !!op.soComSaldo;
    let escolhido = null;
    let linhas = [];
    const d = S.dialogo({ titulo: op.titulo || 'Escolher insumo', tamanho: 'lg', rodape: '' });
    const corpo = d.corpo;
    const rodape = document.createElement('div');
    rodape.className = 'supr-dlg-rodape';
    d.dlg.appendChild(rodape);
    // um ouvinte só por janela; cada passo troca o que ele faz
    let aoDigitar = null;
    let aoClicar = null;
    corpo.addEventListener('input', () => { if (aoDigitar) aoDigitar(); });
    corpo.addEventListener('click', (ev) => { if (aoClicar) aoClicar(ev); });

    function saldoServico(ins, sid) {
      const s = (ins.servicos || []).find((x) => x.servicoId === sid);
      const orcado = s ? s.quantidadeOrcada : 0;
      const sol = s ? s.solicitado : 0;
      return { orcado, solicitado: sol + (ja.get(ins.chave + '|' + sid) || 0), saldo: orcado - sol - (ja.get(ins.chave + '|' + sid) || 0) };
    }
    function saldoTotal(ins) {
      let jaTotal = 0;
      ja.forEach((v, k) => { if (k.indexOf(ins.chave + '|') === 0) jaTotal += v; });
      return ins.quantidadeOrcada - ins.solicitado - jaTotal;
    }

    function passoLista(aba) {
      aba = aba || 'orcamento';
      aoDigitar = null;
      aoClicar = null;
      corpo.innerHTML = '<div class="supr-abas">' +
        '<button type="button" data-aba="orcamento"' + (aba === 'orcamento' ? ' class="ativo"' : '') + '>Insumos do orçamento</button>' +
        (op.foraPermitido === false ? '' : '<button type="button" data-aba="fora"' + (aba === 'fora' ? ' class="ativo"' : '') + '>Buscar fora do orçamento</button>') +
        '</div><div data-lista></div>';
      rodape.innerHTML = '<span class="espaco"></span><button type="button" class="btn btn-ghost" data-fechar>Cancelar</button>';
      corpo.querySelectorAll('[data-aba]').forEach((b) => b.addEventListener('click', () => passoLista(b.dataset.aba)));
      if (aba === 'orcamento') listaOrcamento(corpo.querySelector('[data-lista]'));
      else listaFora(corpo.querySelector('[data-lista]'));
    }

    function listaOrcamento(alvo) {
      const contagem = {};
      orc.insumos.forEach((i) => { if (!i.foraOrcamento) contagem[i.tipo] = (contagem[i.tipo] || 0) + 1; });
      alvo.innerHTML = '<div class="supr-barra">' + S.busca('', 'Código ou descrição do insumo') +
        S.chips([['material', 'Material', contagem.material || 0], ['equipamento', 'Equipamento', contagem.equipamento || 0],
          ['maoDeObra', 'Mão de obra', contagem.maoDeObra || 0], ['servico', 'Serviço / verba', contagem.servico || 0], ['', 'Todos']], filtroTipo) +
        '<label class="check" style="display:inline-flex;gap:6px;align-items:center;font-size:12px"><input type="checkbox" data-saldo' + (soComSaldo ? ' checked' : '') + '>Só com saldo</label></div><div data-tabela></div>';
      const desenhar = () => {
        const termo = alvo.querySelector('[data-busca]').value;
        linhas = orc.insumos.filter((i) => !i.foraOrcamento && (!filtroTipo || i.tipo === filtroTipo) &&
          (!soComSaldo || saldoTotal(i) > 1e-6) && S.combina(termo, [i.codigo, i.descricao]));
        alvo.querySelector('[data-tabela]').innerHTML = S.tabela([
          { t: 'Código', v: (i) => '<span class="supr-codigo">' + S.esc(i.codigo || '—') + '</span>', c: 'min' },
          { t: 'Insumo', v: (i) => S.esc(S.nome(i.descricao)) + '<small>' + S.esc(i.base) + ' · ' + i.servicos.filter((s) => s.quantidadeOrcada > 0).length + ' serviço(s)</small>' },
          { t: 'Un.', v: (i) => S.esc(i.unidade), c: 'min' },
          { t: 'Orçado', v: (i) => S.qtd(i.quantidadeOrcada), c: 'num' },
          { t: 'Solicitado', v: (i) => S.qtd(i.quantidadeOrcada - saldoTotal(i)), c: 'num' },
          { t: 'Saldo', v: (i) => { const s = saldoTotal(i); return '<b class="' + (s < -1e-6 ? 'supr-negativo' : '') + '">' + S.qtd(s) + '</b>'; }, c: 'num' }
        ], linhas.slice(0, 300), { id: (i) => i.chave, vazio: 'Nenhum insumo encontrado com esses filtros.' });
      };
      alvo.querySelector('[data-busca]').addEventListener('input', desenhar);
      alvo.querySelector('[data-saldo]').addEventListener('change', (ev) => { soComSaldo = ev.target.checked; desenhar(); });
      alvo.querySelector('[data-chips]').addEventListener('click', (ev) => {
        const b = ev.target.closest('button[data-valor]');
        if (!b) return;
        filtroTipo = b.dataset.valor;
        alvo.querySelectorAll('[data-chips] button').forEach((x) => x.classList.toggle('ativo', x === b));
        desenhar();
      });
      S.aoAbrirLinha(alvo, (chave) => { const i = orc.insumos.find((x) => x.chave === chave); if (i) passoQuantidade(i, false); });
      desenhar();
      setTimeout(() => alvo.querySelector('[data-busca]').focus(), 30);
    }

    function listaFora(alvo) {
      alvo.innerHTML = '<p class="supr-nota alerta">Insumo fora do orçamento (ou em serviço onde não foi orçado) sempre vai para autorização.</p>' +
        '<form class="supr-barra" data-form-busca>' + S.busca('', 'Ex.: cimento CP II, porta de madeira, 1379') +
        '<button type="submit" class="btn btn-primary btn-sm">Buscar</button><span class="supr-dica">Base SINAPI e insumos próprios do catálogo</span></form><div data-resultados></div>';
      const res = alvo.querySelector('[data-resultados]');
      alvo.querySelector('[data-form-busca]').addEventListener('submit', async (ev) => {
        ev.preventDefault();
        const q = alvo.querySelector('[data-busca]').value.trim();
        if (q.length < 2) { S.aviso('Digite ao menos 2 letras.', 'erro'); return; }
        res.innerHTML = S.carregando('Buscando…');
        try {
          const r = await S.get('insumos/busca?q=' + encodeURIComponent(q));
          linhas = r.resultados;
          res.innerHTML = S.tabela([
            { t: 'Base', v: (i) => S.tag(i.base, i.base === 'SINAPI' ? 'cinza' : 'azul'), c: 'min' },
            { t: 'Código', v: (i) => '<span class="supr-codigo">' + S.esc(i.codigo) + '</span>', c: 'min' },
            { t: 'Insumo', v: (i) => S.esc(S.nome(i.descricao)) + '<small>' + S.esc(S.TIPOS_INSUMO[i.tipo] || '') + '</small>' },
            { t: 'Un.', v: (i) => S.esc(i.unidade), c: 'min' },
            { t: 'Preço ref.', v: (i) => (i.preco == null ? '—' : S.moeda(i.preco)), c: 'num' }
          ], linhas, { id: (i) => i.chave, vazio: 'Nada encontrado. Tente outras palavras ou cadastre o insumo em Engenharia › Insumos.' });
        } catch (e) { res.innerHTML = ''; S.falhou(e); }
      });
      S.aoAbrirLinha(res, (chave) => {
        const i = linhas.find((x) => x.chave === chave);
        if (!i) return;
        const doOrcamento = orc.insumos.find((x) => x.chave === chave);
        passoQuantidade(doOrcamento || { chave: i.chave, codigo: i.codigo, descricao: i.descricao, unidade: i.unidade, tipo: i.tipo, base: i.base,
          quantidadeOrcada: 0, solicitado: 0, precoOrcado: i.preco || 0, servicos: [], foraOrcamento: true }, true);
      });
      setTimeout(() => alvo.querySelector('[data-busca]').focus(), 30);
    }

    function passoQuantidade(ins, veioDaBusca) {
      escolhido = ins;
      const item = op.item && op.item.insumoChave === ins.chave ? op.item : null;
      const qtdItem = new Map(((item && item.apropriacoes) || []).map((a) => [a.servicoId, a.quantidade]));
      const servicosOrcados = (ins.servicos || []).filter((s) => s.quantidadeOrcada > 0);
      const extras = Array.from(qtdItem.keys()).filter((sid) => !servicosOrcados.some((s) => s.servicoId === sid));
      const linhaServico = (sid, orcado) => {
        const sal = saldoServico(ins, sid);
        const sv = S.servicoPorId(orc, sid);
        return '<tr data-servico="' + S.esc(sid) + '"><td class="min"><span class="supr-codigo">' + S.esc(sv ? sv.eap : '—') + '</span></td>' +
          '<td>' + S.esc(sv ? S.nome(sv.nome) : 'Serviço removido') + (orcado ? '' : '<small>Não orçado neste serviço</small>') + '</td>' +
          '<td class="num">' + S.qtd(sal.orcado) + '</td><td class="num">' + S.qtd(sal.solicitado) + '</td>' +
          '<td class="num"><b class="' + (sal.saldo < -1e-6 ? 'supr-negativo' : '') + '">' + S.qtd(sal.saldo) + '</b></td>' +
          '<td class="num"><input class="num" inputmode="decimal" data-qtd value="' + S.valorCampo(qtdItem.get(sid)) + '"></td>' +
          '<td class="acoes">' + (sal.saldo > 1e-6 ? '<button type="button" class="btn btn-ghost btn-xs" data-usar-saldo="' + Math.floor(sal.saldo * 10000 + 1e-9) / 10000 + '">Saldo</button>' : '') + '</td></tr>';
      };
      const precoRef = ins.precoOrcado || 0;
      corpo.innerHTML =
        '<div class="supr-cab" style="margin-bottom:10px"><div><h3 style="font-size:14px">' + S.esc(S.nome(ins.descricao)) + '</h3><p>' +
        [ins.codigo ? 'Código ' + S.esc(ins.codigo) : '', S.esc(ins.base || ''), 'Unidade ' + S.esc(ins.unidade || '—'), S.esc(S.TIPOS_INSUMO[ins.tipo] || ''),
          precoRef ? 'Orçado a ' + S.moeda(precoRef) + '/' + S.esc(ins.unidade || 'un') : ''].filter(Boolean).join(' · ') + '</p></div></div>' +
        (veioDaBusca && ins.foraOrcamento ? '<p class="supr-nota alerta">Insumo fora do orçamento: escolha o serviço que vai receber o custo.</p>' : '') +
        (comApropriacao
          ? '<div class="supr-tabela-wrap"><table class="supr-tabela" data-aprop><thead><tr><th>EAP</th><th>Serviço (apropriação)</th><th class="num">Orçado</th>' +
            '<th class="num">Solicitado</th><th class="num">Saldo</th><th class="num">Quantidade</th><th></th></tr></thead><tbody>' +
            servicosOrcados.map((s) => linhaServico(s.servicoId, true)).join('') + extras.map((sid) => linhaServico(sid, false)).join('') +
            '</tbody></table></div>' +
            '<div class="supr-barra" style="margin-top:8px"><select data-outro style="max-width:420px">' + S.opcoesServicos(orc, '', 'Apropriar também em outro serviço…') + '</select></div>'
          : '<div class="supr-form"><label>Quantidade (' + S.esc(ins.unidade || 'un') + ')<input inputmode="decimal" data-qtd-simples value="' + S.valorCampo(item && item.quantidade) + '"></label></div>') +
        '<div class="supr-form">' +
        (op.preco ? '<label>Preço unitário (R$)<input inputmode="decimal" data-preco value="' + S.valorCampo(item ? item.precoUnitario : (precoRef || ''), 6) + '"></label>' : '') +
        (op.necessidade !== false ? '<label>Data de necessidade<input type="date" data-necessidade value="' + S.esc((item && item.dataNecessidade) || '') + '"></label>' : '') +
        (op.observacao !== false ? '<label class="duplo">Observação<input data-obs maxlength="500" value="' + S.esc((item && item.observacao) || '') + '" placeholder="Especificação, marca, cor…"></label>' : '') +
        '</div><div data-resumo class="supr-dica"></div>';
      rodape.innerHTML = (op.item ? '' : '<button type="button" class="btn btn-ghost" data-volta-lista>' + S.ic('voltar') + 'Trocar insumo</button>') +
        '<span class="espaco"></span><button type="button" class="btn btn-ghost" data-fechar>Cancelar</button>' +
        '<button type="button" class="btn btn-primary" data-ok>' + S.esc(op.botao || (op.item ? 'Salvar item' : 'Incluir item')) + '</button>';
      const resumo = () => {
        const r = ler(false);
        const el = corpo.querySelector('[data-resumo]');
        if (!r) { el.textContent = ''; return; }
        const acima = comApropriacao && r.apropriacoes.some((a) => { const sal = saldoServico(ins, a.servicoId); return a.quantidade > sal.saldo + Math.max(1e-6, sal.orcado * 1e-6); });
        el.innerHTML = 'Total: <b>' + S.qtd(r.quantidade) + ' ' + S.esc(ins.unidade || '') + '</b>' +
          (precoRef ? ' · estimado ' + S.moeda(r.quantidade * (r.precoUnitario || precoRef)) : '') +
          (acima ? ' · <span class="supr-negativo">acima do saldo orçado: vai para autorização</span>' : '');
      };
      aoDigitar = resumo;
      aoClicar = (ev) => {
        const b = ev.target.closest('[data-usar-saldo]');
        if (b) { b.closest('tr').querySelector('[data-qtd]').value = S.valorCampo(Number(b.dataset.usarSaldo)); resumo(); }
      };
      const outro = corpo.querySelector('[data-outro]');
      if (outro) outro.addEventListener('change', () => {
        const sid = outro.value;
        outro.value = '';
        if (!sid || corpo.querySelector('tr[data-servico="' + CSS.escape(sid) + '"]')) return;
        corpo.querySelector('[data-aprop] tbody').insertAdjacentHTML('beforeend', linhaServico(sid, false));
        corpo.querySelector('tr[data-servico="' + CSS.escape(sid) + '"] [data-qtd]').focus();
      });
      const voltaLista = rodape.querySelector('[data-volta-lista]');
      if (voltaLista) voltaLista.addEventListener('click', () => passoLista(veioDaBusca ? 'fora' : 'orcamento'));
      rodape.querySelector('[data-ok]').addEventListener('click', () => { const r = ler(true); if (r) d.fechar(r); });
      const primeiro = corpo.querySelector('[data-qtd], [data-qtd-simples]');
      if (primeiro) setTimeout(() => primeiro.focus(), 30);
      resumo();
    }

    function ler(validar) {
      const ins = escolhido;
      let apropriacoes = [];
      let quantidade = 0;
      if (comApropriacao) {
        corpo.querySelectorAll('tr[data-servico]').forEach((tr) => {
          const q = S.num(tr.querySelector('[data-qtd]').value);
          if (q != null && q > 0) apropriacoes.push({ servicoId: tr.dataset.servico, quantidade: q });
        });
        quantidade = apropriacoes.reduce((s, a) => s + a.quantidade, 0);
        if (validar && !apropriacoes.length) { S.aviso('Informe a quantidade em ao menos um serviço.', 'erro'); return null; }
      } else {
        quantidade = S.num(corpo.querySelector('[data-qtd-simples]').value) || 0;
        if (validar && !(quantidade > 0)) { S.aviso('Informe a quantidade.', 'erro'); return null; }
      }
      const precoEl = corpo.querySelector('[data-preco]');
      const precoUnitario = precoEl ? S.num(precoEl.value) : null;
      if (validar && precoEl && !(precoUnitario >= 0)) { S.aviso('Informe o preço unitário.', 'erro'); return null; }
      const nec = corpo.querySelector('[data-necessidade]');
      const obs = corpo.querySelector('[data-obs]');
      return {
        insumoChave: ins.chave, insumoCodigo: ins.codigo || '', descricao: ins.descricao, unidade: ins.unidade || '', tipo: ins.tipo || 'material',
        base: ins.base || '', precoReferencia: ins.precoOrcado || 0, foraOrcamento: !!ins.foraOrcamento || ins.quantidadeOrcada <= 0,
        apropriacoes, quantidade: S.arred(quantidade, 4), precoUnitario,
        dataNecessidade: nec ? nec.value || null : null, observacao: obs ? obs.value.trim() : ''
      };
    }

    if (op.item) {
      const doOrcamento = orc.insumos.find((x) => x.chave === op.item.insumoChave);
      passoQuantidade(doOrcamento || { chave: op.item.insumoChave, codigo: op.item.insumoCodigo, descricao: op.item.descricao, unidade: op.item.unidade,
        tipo: op.item.tipo, base: op.item.base || 'Fora do orçamento', quantidadeOrcada: 0, solicitado: 0, precoOrcado: op.item.precoReferencia || 0,
        servicos: [], foraOrcamento: true }, true);
    } else passoLista(op.abaInicial);
    return d.resultado;
  };

  /* ---------- navegação ---------- */
  S.telas = {};
  S.registrar = (nome, tela) => { S.telas[nome] = tela; };
  let geracao = 0;

  function marcarMenu(menu) {
    document.querySelectorAll('.app-sidebar-item[data-view="suprimentos"]').forEach((it) => it.classList.toggle('ativo', it.dataset.aba === menu));
  }

  function abrir(aba, params) {
    const tela = S.telas[aba] || S.telas.painel;
    const nomeTela = S.telas[aba] ? aba : 'painel';
    estado.aba = nomeTela;
    estado.params = params || null;
    const area = document.getElementById('suprConteudo');
    const c = document.createElement('div');
    c.className = 'supr-tela';
    area.replaceChildren(c);
    document.getElementById('suprTitulo').textContent = tela.titulo || 'Suprimentos';
    document.getElementById('suprSubtitulo').textContent = tela.subtitulo || '';
    marcarMenu(tela.menu || nomeTela);
    const modulo = moduloDaTela();
    document.getElementById('suprAvisoLeitura').classList.toggle('hidden', !modulo || modulo === 'acompanhamento' || S.podeEditar(modulo));
    const minha = ++geracao;
    c.vigente = () => minha === geracao && c.isConnected;
    c.addEventListener('click', (ev) => { if (ev.target.closest('[data-voltar]')) S.voltar(tela.menu || nomeTela); });
    c.innerHTML = S.carregando();
    Promise.resolve()
      .then(() => tela.render(c, params || {}))
      .catch((e) => {
        if (c.vigente()) c.innerHTML = '<div class="supr-nota erro">' + S.esc(e && e.message ? e.message : String(e)) + '</div>';
        if (e && e.status !== 401) console.error(e);
      });
    window.scrollTo(0, 0);
  }
  S.ir = (aba, params) => {
    if (estado.aba) estado.pilha.push({ aba: estado.aba, params: estado.params });
    if (estado.pilha.length > 40) estado.pilha.shift();
    abrir(aba, params);
  };
  S.substituir = (aba, params) => abrir(aba, params);
  S.voltar = (padrao) => {
    const anterior = estado.pilha.pop();
    if (anterior) abrir(anterior.aba, anterior.params);
    else abrir(padrao || 'painel', null);
  };
  S.recarregar = () => { if (estado.aba) abrir(estado.aba, estado.params); };
  // Abre um documento de Suprimentos vindo de outra view (ex.: Contas a pagar)
  S.abrirDocumento = (tela, params) => {
    estado.pendente = { tela, params };
    if (window.ErpNav) window.ErpNav.abrir('suprimentos', null);
  };
  // Abre uma tela de Suprimentos já com a obra escolhida ('' = todas), como nos atalhos do Início
  S.abrirNaObra = (tela, obraId) => {
    estado.obra = obraId || '';
    gravarObra(estado.obra);
    const sel = document.getElementById('suprObra');
    if (sel && estado.carregado) sel.value = estado.obra;
    S.abrirDocumento(tela, {});
  };

  S.iniciar = async () => {
    if (estado.carregado) return;
    if (!estado.carregando) {
      estado.carregando = Promise.all([S.get('configuracao'), S.get('obras')]).then((r) => {
        estado.config = r[0];
        estado.obras = r[1].obras || [];
        if (estado.obra && !S.obraPorId(estado.obra)) estado.obra = '';
        if (!estado.obra && estado.obras.length === 1) estado.obra = estado.obras[0].id;
        const sel = document.getElementById('suprObra');
        if (sel) {
          sel.innerHTML = S.opcoesObras(estado.obra, 'Todas as obras');
          sel.value = estado.obra;
        }
        estado.carregado = true;
      }).catch((e) => { estado.carregando = null; throw e; });
    }
    return estado.carregando;
  };

  S.atualizarContador = async () => {
    const el = document.getElementById('suprContadorAutorizacoes');
    if (!el || !estado.carregado) return;
    try {
      const r = await S.get('autorizacoes');
      const n = ['solicitacoes', 'pedidos', 'contratos', 'aditivos', 'medicoes']
        .reduce((s, k) => s + r[k].filter((x) => x.podeAutorizar).length, 0);
      el.textContent = n > 99 ? '99+' : String(n);
      el.classList.toggle('hidden', !n);
      el.title = n + ' documento(s) aguardando sua autorização';
    } catch (e) { /* contador é opcional */ }
  };

  document.addEventListener('DOMContentLoaded', () => {
    const sel = document.getElementById('suprObra');
    if (sel) sel.addEventListener('change', () => {
      estado.obra = sel.value;
      gravarObra(estado.obra);
      const tela = S.telas[estado.aba];
      if (tela && tela.lista) S.recarregar();
      else { estado.pilha = []; abrir((tela && tela.menu) || 'painel', null); }
    });
  });

  document.addEventListener('app:viewchange', (ev) => {
    const d = ev.detail || {};
    if (d.view !== 'suprimentos') return;
    const area = document.getElementById('suprConteudo');
    if (!estado.carregado && area) area.innerHTML = S.carregando('Carregando Suprimentos…');
    S.iniciar().then(() => {
      estado.pilha = [];
      estado.aba = null;
      const pendente = estado.pendente;
      estado.pendente = null;
      if (pendente) abrir(pendente.tela, pendente.params); else abrir(d.aba || 'painel', null);
      S.atualizarContador();
    }).catch((e) => {
      if (area) area.innerHTML = '<div class="supr-nota erro">Não foi possível abrir Suprimentos: ' + S.esc(e.message) + '</div>';
    });
  });

  // Contador de autorizações no menu assim que o usuário entra (só para quem vê Suprimentos)
  document.addEventListener('app:profilechange', () => {
    if (window.Permissoes && !window.Permissoes.pode('*suprimentos')) return;
    S.iniciar().then(S.atualizarContador).catch(() => {});
  });
})();
