/* Tela "Base SINAPI": importa o arquivo oficial mensal da Caixa (SINAPI-AAAA-MM-formato-xlsx.zip)
   para a base própria do site. O ZIP é lido aqui no navegador (descompressão nativa, sem
   biblioteca), conferido e só então enviado em lotes para /api/sinapi/referencias.
   Da planilha "Referência" saem os insumos (aba ICD/ISD), as composições (CCD/CSD) e a estrutura
   (Analítico); da planilha "mao_de_obra", o % oficial de mão de obra. Só a UF e o regime do site. */
(function () {
  'use strict';

  var LOTE_BYTES = 400000;           // cada envio fica bem abaixo dos 2 MB que o banco aceita
  var MINIMOS = { insumos: 3000, composicoes: 5000, itens: 30000 };
  var NOMES_MES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];

  var el = {};
  var base = { uf: 'SP', regime: 'desonerado', referencias: [] };
  var lido = null;     // conteúdo conferido, pronto para enviar
  var ocupado = false;

  function esc(v) {
    return String(v == null ? '' : v).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function nomeMes(mes) {
    var p = String(mes || '').split('-');
    return p.length === 2 ? NOMES_MES[Number(p[1]) - 1] + '/' + p[0] : mes;
  }
  function numero(n) { return Number(n || 0).toLocaleString('pt-BR'); }
  function pausa() { return new Promise(function (r) { setTimeout(r, 0); }); }

  /* ---------- ZIP (também o .xlsx, que é um ZIP) ---------- */
  function lerZip(bytes) {
    var dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    var fim = -1;
    for (var i = bytes.length - 22; i >= Math.max(0, bytes.length - 65557); i--) {
      if (dv.getUint32(i, true) === 0x06054b50) { fim = i; break; }
    }
    if (fim < 0) throw new Error('O arquivo não é um ZIP válido.');
    var total = dv.getUint16(fim + 10, true);
    var p = dv.getUint32(fim + 16, true);
    var entradas = [];
    // nomes em latin1: a Caixa grava acentos numa codificação antiga; só a parte sem acento importa
    var nomeDe = new TextDecoder('latin1');
    for (var k = 0; k < total; k++) {
      if (dv.getUint32(p, true) !== 0x02014b50) throw new Error('O arquivo ZIP está corrompido.');
      var tamNome = dv.getUint16(p + 28, true), tamExtra = dv.getUint16(p + 30, true), tamComent = dv.getUint16(p + 32, true);
      entradas.push({
        nome: nomeDe.decode(bytes.subarray(p + 46, p + 46 + tamNome)),
        metodo: dv.getUint16(p + 10, true),
        tamanho: dv.getUint32(p + 20, true),
        local: dv.getUint32(p + 42, true)
      });
      p += 46 + tamNome + tamExtra + tamComent;
    }
    return { bytes: bytes, dv: dv, entradas: entradas };
  }
  async function extrair(zip, entrada) {
    var l = entrada.local;
    var inicio = l + 30 + zip.dv.getUint16(l + 26, true) + zip.dv.getUint16(l + 28, true);
    var dados = zip.bytes.subarray(inicio, inicio + entrada.tamanho);
    if (entrada.metodo === 0) return dados;
    if (entrada.metodo !== 8) throw new Error('O ZIP usa uma compressão que o navegador não abre.');
    var fluxo = new Blob([dados]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
    return new Uint8Array(await new Response(fluxo).arrayBuffer());
  }

  /* ---------- planilha .xlsx: linhas como { A: valor, B: valor, ... } ---------- */
  function decodificar(s) {
    return s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&');
  }
  async function abrirPlanilha(bytes) {
    var zip = lerZip(bytes);
    var porNome = {};
    zip.entradas.forEach(function (e) { porNome[e.nome] = e; });
    var utf8 = new TextDecoder();
    async function texto(nome) { return porNome[nome] ? utf8.decode(await extrair(zip, porNome[nome])) : ''; }
    var wb = await texto('xl/workbook.xml');
    var rels = await texto('xl/_rels/workbook.xml.rels');
    var compartilhados = [];
    var sx = await texto('xl/sharedStrings.xml');
    for (var m of sx.matchAll(/<si>([\s\S]*?)<\/si>/g)) {
      compartilhados.push(decodificar(Array.from(m[1].matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g), function (x) { return x[1]; }).join('')));
    }
    var alvo = {};
    for (var r of rels.matchAll(/<Relationship [^>]*Id="([^"]+)"[^>]*Target="([^"]+)"/g)) alvo[r[1]] = r[2];
    var abas = {};
    for (var a of wb.matchAll(/<sheet [^>]*name="([^"]+)"[^>]*r:id="([^"]+)"/g)) abas[decodificar(a[1])] = 'xl/' + alvo[a[2]].replace(/^\/?xl\//, '');
    return {
      abas: Object.keys(abas),
      linhas: async function (aba) {
        if (!abas[aba]) throw new Error('A planilha não tem a aba "' + aba + '".');
        var xml = await texto(abas[aba]);
        var saida = [];
        for (var linha of xml.matchAll(/<row [^>]*>([\s\S]*?)<\/row>/g)) {
          var o = {};
          for (var c of linha[1].matchAll(/<c r="([A-Z]+)\d+"([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
            var corpo = c[3] || '';
            var v = corpo.match(/<v>([\s\S]*?)<\/v>/);
            var inline = corpo.match(/<t[^>]*>([\s\S]*?)<\/t>/);
            var valor = v ? v[1] : inline ? decodificar(inline[1]) : null;
            if (/t="s"/.test(c[2]) && v) valor = compartilhados[Number(v[1])];
            // código em HYPERLINK(...; 104658): a Caixa às vezes salva sem recalcular e o valor vem 0
            var f = corpo.match(/<f[^>]*>HYPERLINK\(([\s\S]*?)<\/f>/);
            if (f) { var cod = f[1].match(/,\s*(\d+)\)\s*$/); if (cod) valor = cod[1]; }
            if (valor != null && valor !== '') o[c[1]] = valor;
          }
          saida.push(o);
        }
        return saida;
      }
    };
  }

  /* ---------- interpretação do pacote da Caixa ---------- */
  function procurar(linhas, teste) {
    for (var i = 0; i < linhas.length; i++) if (teste(linhas[i])) return { linha: linhas[i], indice: i };
    return null;
  }
  function colunaDaUf(linhas, uf) {
    var cab = procurar(linhas, function (l) { var v = Object.values(l); return v.indexOf('AC') >= 0 && v.indexOf(uf) >= 0; });
    if (!cab) return null;
    return Object.keys(cab.linha).find(function (k) { return cab.linha[k] === uf; });
  }
  function valorDe(linhas, rotulo) {
    var r = procurar(linhas, function (l) { return String(l.A || '').indexOf(rotulo) === 0; });
    return r ? r.linha.B : '';
  }
  function num(v) { if (v == null || v === '') return null; var n = Number(v); return isFinite(n) ? n : null; }
  // resumo curto e estável dos itens: identifica a versão da estrutura
  function resumo(texto) {
    var h1 = 0xdeadbeef, h2 = 0x41c6ce57;
    for (var i = 0; i < texto.length; i++) {
      var ch = texto.charCodeAt(i);
      h1 = Math.imul(h1 ^ ch, 2654435761);
      h2 = Math.imul(h2 ^ ch, 1597334677);
    }
    h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
    h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
    return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36);
  }

  async function lerPacote(arquivo, avisar) {
    var desonerado = base.regime === 'desonerado';
    var abaI = desonerado ? 'ICD' : 'ISD', abaC = desonerado ? 'CCD' : 'CSD', abaMO = desonerado ? 'COM Desoneração' : 'SEM Desoneração';
    avisar('Abrindo o ZIP…');
    var pacote = lerZip(new Uint8Array(await arquivo.arrayBuffer()));
    var achar = function (re) { return pacote.entradas.find(function (e) { return re.test(e.nome); }); };
    var eRef = achar(/Refer.{0,4}ncia_\d{4}_\d{2}\.xlsx$/i), eMO = achar(/mao_de_obra_\d{4}_\d{2}\.xlsx$/i);
    if (!eRef || !eMO) throw new Error('O ZIP não tem as planilhas "SINAPI_Referência" e "SINAPI_mao_de_obra". Use o arquivo "formato xlsx" da Caixa.');
    var mesArquivo = (eRef.nome.match(/(\d{4})_(\d{2})\.xlsx$/i) || []).slice(1).join('-');

    avisar('Lendo a planilha de referência…');
    var ref = await abrirPlanilha(await extrair(pacote, eRef));
    await pausa();
    avisar('Lendo os insumos…');
    var li = await ref.linhas(abaI);
    await pausa();
    avisar('Lendo as composições…');
    var lc = await ref.linhas(abaC);
    await pausa();
    avisar('Lendo a estrutura das composições…');
    var la = await ref.linhas('Analítico');
    await pausa();
    avisar('Lendo o percentual de mão de obra…');
    var lm = await (await abrirPlanilha(await extrair(pacote, eMO))).linhas(abaMO);

    var mesPlanilha = String(valorDe(li, 'Mês de Referência')).replace(/^(\d{2})\/(\d{4})$/, '$2-$1');
    var emissao = String(valorDe(li, 'Data de emissão'));
    var regimeTexto = JSON.stringify(li.slice(0, 10)).toUpperCase();
    var cI = colunaDaUf(li, base.uf), cC = colunaDaUf(lc, base.uf), cM = colunaDaUf(lm, base.uf);

    var insumos = li.filter(function (l) { return /^\d+$/.test(l.B || '') && l.C; }).map(function (l) {
      return [Number(l.B), l.C, l.D || '', l.A || '', l.E || '', num(l[cI])];
    });
    var maoDeObra = new Map(lm.filter(function (l) { return /^\d+$/.test(l.B || ''); }).map(function (l) { return [Number(l.B), num(l[cM])]; }));
    var porComposicao = new Map();
    la.forEach(function (l) {
      if (!/^\d+$/.test(l.B || '') || !l.C || !/^\d+$/.test(l.D || '')) return;
      var cod = Number(l.B);
      if (!porComposicao.has(cod)) porComposicao.set(cod, []);
      porComposicao.get(cod).push([l.C === 'COMPOSICAO' ? 'C' : 'I', Number(l.D), num(l.G)]);
    });
    var estruturas = [];
    var versoes = new Map();
    var itens = 0;
    porComposicao.forEach(function (lista, cod) {
      lista.sort(function (a, b) { return a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : a[1] - b[1]; });
      var versao = resumo(JSON.stringify(lista));
      versoes.set(cod, versao);
      estruturas.push([cod, versao, lista]);
      itens += lista.length;
    });
    var composicoes = lc.filter(function (l) { return /^\d+$/.test(l.B || '') && l.C; }).map(function (l) {
      var cod = Number(l.B);
      return [cod, l.A || '', l.C, l.D || '', num(l[cC]), maoDeObra.has(cod) ? maoDeObra.get(cod) : null, versoes.get(cod) || ''];
    });

    var codigosI = insumos.map(function (i) { return i[0]; }), codigosC = composicoes.map(function (c) { return c[0]; });
    var anterior = base.referencias.find(function (r) { return r.status === 'ok' && r.mes !== mesPlanilha; });
    var conferencias = [
      { ok: mesPlanilha === mesArquivo && /^\d{4}-\d{2}$/.test(mesPlanilha), texto: 'Mês da planilha (' + nomeMes(mesPlanilha) + ') igual ao do nome do arquivo' },
      { ok: regimeTexto.indexOf(desonerado ? 'COM DESONERA' : 'SEM DESONERA') >= 0, texto: 'Regime ' + (desonerado ? 'desonerado' : 'não desonerado') + ' (aba ' + abaI + ')' },
      { ok: Boolean(cI && cC && cM), texto: 'Coluna de ' + base.uf + ' encontrada nas três tabelas' },
      { ok: insumos.length >= MINIMOS.insumos && composicoes.length >= MINIMOS.composicoes && itens >= MINIMOS.itens,
        texto: numero(insumos.length) + ' insumos, ' + numero(composicoes.length) + ' composições e ' + numero(itens) + ' itens de estrutura' },
      { ok: codigosI.indexOf(0) < 0 && codigosC.indexOf(0) < 0 && new Set(codigosI).size === codigosI.length && new Set(codigosC).size === codigosC.length,
        texto: 'Nenhum código zerado ou repetido' },
      { ok: composicoes.every(function (c) { return c[6]; }), texto: 'Todas as composições com estrutura (aba Analítico)' },
      { ok: composicoes.filter(function (c) { return c[4] != null; }).length >= composicoes.length * 0.95, texto: 'Custo em ' + base.uf + ' em pelo menos 95% das composições' },
      { ok: insumos.filter(function (i) { return i[5] != null; }).length >= insumos.length * 0.9, texto: 'Preço em ' + base.uf + ' em pelo menos 90% dos insumos' }
    ];
    if (anterior) {
      var variacao = composicoes.length / Math.max(1, anterior.composicoes) - 1;
      conferencias.push({ ok: Math.abs(variacao) <= 0.2, texto: 'Quantidade de composições parecida com ' + nomeMes(anterior.mes) + ' (' + numero(anterior.composicoes) + ')' });
    }
    return {
      mes: mesPlanilha, emissao: emissao, arquivo: arquivo.name,
      insumos: insumos, composicoes: composicoes, estruturas: estruturas, itens: itens,
      comMaoDeObra: composicoes.filter(function (c) { return c[5] != null; }).length,
      conferencias: conferencias
    };
  }

  /* ---------- envio ---------- */
  async function chamar(url, opcoes) {
    var r = await fetch(url, opcoes);
    var d = await r.json().catch(function () { return {}; });
    if (!r.ok) {
      var msg = { nao_autorizado: 'Só administradores podem importar a base.', ja_importado: 'Este mês já foi importado.',
        contagem_diferente: 'O banco não recebeu tudo (contagem diferente). Tente importar de novo.', mes_nao_iniciado: 'A importação foi interrompida. Comece de novo.' }[d.erro];
      var e = new Error(msg || ('Falha ao gravar (' + (d.erro || r.status) + (d.detalhe ? ': ' + d.detalhe : '') + ').'));
      e.codigo = d.erro;
      throw e;
    }
    return d;
  }
  function lotes(linhas) {
    var saida = [], atual = [], tamanho = 0;
    linhas.forEach(function (l) {
      var t = JSON.stringify(l).length + 1;
      if (atual.length && tamanho + t > LOTE_BYTES) { saida.push(atual); atual = []; tamanho = 0; }
      atual.push(l); tamanho += t;
    });
    if (atual.length) saida.push(atual);
    return saida;
  }
  async function importar(substituir) {
    if (!lido || ocupado) return;
    ocupado = true;
    el.importar.disabled = true;
    el.arquivo.disabled = true;
    var etapas = [['insumos', lido.insumos], ['composicoes', lido.composicoes], ['estruturas', lido.estruturas]];
    var grupos = etapas.map(function (e) { return [e[0], lotes(e[1])]; });
    var total = grupos.reduce(function (s, g) { return s + g[1].length; }, 0) + 2, feito = 0;
    var progresso = function (texto) { feito++; mostrarProgresso(feito / total, texto); };
    try {
      await chamar('/api/sinapi/referencias?acao=iniciar', { method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ mes: lido.mes, emissao: lido.emissao, arquivo: lido.arquivo, substituir: substituir }) });
      progresso('Mês aberto no banco…');
      for (var g of grupos) {
        for (var i = 0; i < g[1].length; i++) {
          await chamar('/api/sinapi/referencias?acao=lote&mes=' + lido.mes + '&tabela=' + g[0], {
            method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(g[1][i]) });
          progresso({ insumos: 'Gravando insumos', composicoes: 'Gravando composições', estruturas: 'Gravando a estrutura' }[g[0]] + ' (' + (i + 1) + ' de ' + g[1].length + ')…');
        }
      }
      var fim = await chamar('/api/sinapi/referencias?acao=concluir', { method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ mes: lido.mes, insumos: lido.insumos.length, composicoes: lido.composicoes.length }) });
      progresso('Pronto.');
      lido = null;
      el.previa.innerHTML = '';
      el.arquivo.value = '';
      await carregar();
      // mês mais antigo que o em uso fica só como histórico
      var emUso = base.referencias.find(function (r) { return r.status === 'ok'; });
      el.status.className = 'sinapi-status ok';
      el.status.textContent = nomeMes(fim.mes) + ' importado: ' + numero(fim.insumos) + ' insumos e ' + numero(fim.composicoes) + ' composições. ' +
        (emUso && emUso.mes !== fim.mes ? 'Fica como histórico; buscas e relatórios continuam em ' + nomeMes(emUso.mes) + '.' : 'As buscas e os relatórios já usam esta base.');
    } catch (erro) {
      if (erro.codigo === 'ja_importado' && !substituir) {
        ocupado = false;
        if (confirm(nomeMes(lido.mes) + ' já está na base. Importar de novo e substituir?')) return importar(true);
      }
      el.status.className = 'sinapi-status erro';
      el.status.textContent = erro.message;
    } finally {
      ocupado = false;
      el.arquivo.disabled = false;
      el.importar.disabled = !lido;
      el.progresso.hidden = true;
    }
  }
  function mostrarProgresso(fracao, texto) {
    el.progresso.hidden = false;
    el.barra.style.width = Math.round(fracao * 100) + '%';
    el.status.className = 'sinapi-status';
    el.status.textContent = texto;
  }

  /* ---------- tela ---------- */
  function renderPrevia() {
    if (!lido) {
      el.previa.innerHTML = '';
      el.importar.disabled = true;
      el.importar.innerHTML = window.icone('enviar') + 'Importar';
      return;
    }
    var tudoOk = lido.conferencias.every(function (c) { return c.ok; });
    el.previa.innerHTML =
      '<div class="sinapi-previa-cab"><strong>' + esc(nomeMes(lido.mes)) + '</strong><span>emissão ' + esc(lido.emissao) + ' · ' + esc(lido.arquivo) + '</span></div>' +
      '<dl class="sinapi-previa-numeros">' +
        '<div><dt>Insumos</dt><dd>' + numero(lido.insumos.length) + '</dd></div>' +
        '<div><dt>Composições</dt><dd>' + numero(lido.composicoes.length) + '</dd></div>' +
        '<div><dt>Itens de estrutura</dt><dd>' + numero(lido.itens) + '</dd></div>' +
        '<div><dt>Com % de mão de obra</dt><dd>' + numero(lido.comMaoDeObra) + '</dd></div>' +
      '</dl>' +
      '<ul class="sinapi-conferencias">' + lido.conferencias.map(function (c) {
        return '<li class="' + (c.ok ? 'ok' : 'falha') + '">' + window.icone(c.ok ? 'check' : 'alerta', 'ic-sm') + esc(c.texto) + '</li>';
      }).join('') + '</ul>';
    el.importar.disabled = !tudoOk;
    el.importar.innerHTML = window.icone('enviar') + 'Importar ' + esc(nomeMes(lido.mes));
    el.status.className = 'sinapi-status' + (tudoOk ? '' : ' erro');
    el.status.textContent = tudoOk ? 'Conferido. Nada foi gravado ainda.' : 'Alguma conferência falhou: confira se é o arquivo "formato xlsx" do mês certo.';
  }
  function renderLista() {
    var atual = base.referencias.find(function (r) { return r.status === 'ok'; });
    el.atual.innerHTML = atual
      ? '<span class="status-dot status-ok"></span>Em uso: <strong>' + esc(nomeMes(atual.mes)) + '</strong> · ' + esc(base.uf) + ' · ' + (base.regime === 'desonerado' ? 'desonerado' : 'não desonerado') +
        ' · ' + numero(atual.composicoes) + ' composições'
      : '<span class="status-dot"></span>Nenhum mês importado: as buscas usam a API pública do SINAPI (só os 2 últimos meses).';
    el.lista.innerHTML = base.referencias.length ? base.referencias.map(function (r) {
      return '<tr><td>' + esc(nomeMes(r.mes)) + '</td><td>' + esc(r.emissao || '—') + '</td><td class="col-num">' + numero(r.insumos) + '</td><td class="col-num">' + numero(r.composicoes) + '</td>' +
        '<td>' + (r.importadoEm ? esc(new Date(r.importadoEm).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })) : '—') + (r.importadoPor ? '<small>' + esc(r.importadoPor) + '</small>' : '') + '</td>' +
        '<td>' + (r.status === 'ok' ? 'Em uso' + (r === atual ? '' : ' (histórico)') : 'Incompleto') + '</td>' +
        '<td class="col-acoes"><button type="button" class="btn-icon btn-danger" data-excluir="' + esc(r.mes) + '" title="Excluir este mês da base" aria-label="Excluir ' + esc(nomeMes(r.mes)) + '">' + window.icone('excluir') + '</button></td></tr>';
    }).join('') : '<tr><td colspan="7" class="sem-servicos">Nenhum mês importado ainda.</td></tr>';
  }
  async function carregar() {
    try {
      var d = await (await fetch('/api/sinapi/referencias')).json();
      base = { uf: d.uf || 'SP', regime: d.regime || 'desonerado', referencias: d.referencias || [] };
    } catch (e) { /* mantém o que havia */ }
    renderLista();
  }
  async function escolherArquivo() {
    var arquivo = el.arquivo.files && el.arquivo.files[0];
    lido = null;
    renderPrevia();
    if (!arquivo) return;
    ocupado = true;
    el.arquivo.disabled = true;
    try {
      lido = await lerPacote(arquivo, function (t) { el.status.className = 'sinapi-status'; el.status.textContent = t; });
      renderPrevia();
    } catch (erro) {
      el.status.className = 'sinapi-status erro';
      el.status.textContent = erro.message || 'Não foi possível ler o arquivo.';
    } finally {
      ocupado = false;
      el.arquivo.disabled = false;
    }
  }
  async function excluir(mes) {
    if (!confirm('Excluir ' + nomeMes(mes) + ' da base SINAPI? Os orçamentos não mudam; buscas e relatórios passam a usar o mês anterior.')) return;
    try {
      await chamar('/api/sinapi/referencias?mes=' + encodeURIComponent(mes), { method: 'DELETE' });
      await carregar();
    } catch (erro) {
      el.status.className = 'sinapi-status erro';
      el.status.textContent = erro.message;
    }
  }

  function iniciar() {
    var tela = document.getElementById('viewSinapi');
    if (!tela) return;
    el = {
      atual: document.getElementById('sinapiBaseAtual'),
      arquivo: document.getElementById('sinapiArquivo'),
      previa: document.getElementById('sinapiPrevia'),
      importar: document.getElementById('btnImportarSinapi'),
      progresso: document.getElementById('sinapiProgresso'),
      barra: document.querySelector('#sinapiProgresso span'),
      status: document.getElementById('sinapiImportStatus'),
      lista: document.getElementById('sinapiReferencias')
    };
    el.arquivo.addEventListener('change', escolherArquivo);
    el.importar.addEventListener('click', function () { importar(false); });
    el.lista.addEventListener('click', function (ev) {
      var b = ev.target.closest('[data-excluir]');
      if (b) excluir(b.getAttribute('data-excluir'));
    });
    document.addEventListener('app:viewchange', function (ev) {
      if (ev.detail && ev.detail.view === 'sinapi') carregar();
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', iniciar);
  else iniciar();
})();
