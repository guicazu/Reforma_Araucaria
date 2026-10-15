/* Exportar: relatórios do orçamento em PDF (página de impressão) ou Excel (ExcelJS, carregado
   só na hora de gerar).
   - Orçamento: EAP até o nível escolhido (1 unidades ... 5 com memória de cálculo), com opção
     de separar material, mão de obra e equipamento de cada serviço;
   - Curva ABC de serviços e Curva ABC de insumos (A até 80% do custo, B até 95%, C o resto).
   Cada relatório vira um "documento" (título, dados, resumo, gráfico, tabela e notas) que os
   dois formatos desenham. Usa as funções do app.js (qtdServico, totalServico, fonteServico...). */
(function () {
  'use strict';

  var EXCELJS = 'https://cdnjs.cloudflare.com/ajax/libs/exceljs/4.4.0/exceljs.min.js';
  var CHAVE_PREFS = 'ibuild_exportar';
  var LIMITE_A = 0.8, LIMITE_B = 0.95;
  var LOTE_SINAPI = 15; // mesmo máximo de /api/sinapi/decomposicao
  var TIPOS = ['material', 'maoDeObra', 'equipamento', 'semDetalhe'];
  var NOME_TIPO = { material: 'Material', maoDeObra: 'Mão de obra', equipamento: 'Equipamento', semDetalhe: 'Sem detalhamento' };
  var NOME_RELATORIO = { orcamento: 'Orçamento', abcServicos: 'Curva ABC de serviços', abcInsumos: 'Curva ABC de insumos' };
  var RE_ENCARGOS = /encargos complementares/i;
  var RE_LOCACAO = /(?<!\p{L})(loca[cç][aã]o|aluguel)/iu; // palavra inteira: "colocação" não é locação

  var sinapi = new Map(); // código SINAPI -> composição aberta até os recursos, ou { erro }
  var referenciaSinapi = '';
  var fonteSinapi = '';     // 'base' (arquivo oficial importado) ou 'sinpres' (API pública)
  var mesRelatorio = '';    // referência SINAPI da versão exportada; vazio = a mais recente
  function chaveSinapi(codigo) { return (mesRelatorio || 'recente') + '|' + codigo; }
  var modal, el = {};
  var orcamentoId = null;
  var exportando = false;

  function esc(v) {
    return String(v == null ? '' : v).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  var fmt2 = new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  function pct(v) { return (v * 100).toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + '%'; }
  function somar(lista, f) { return lista.reduce(function (a, x) { return a + (f(x) || 0); }, 0); }
  function esperar(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }
  function lerPrefs() { try { return JSON.parse(localStorage.getItem(CHAVE_PREFS)) || {}; } catch (e) { return {}; } }
  function salvarPrefs(p) { try { localStorage.setItem(CHAVE_PREFS, JSON.stringify(p)); } catch (e) { /* sem armazenamento */ } }

  /* ---------- EAP da versão (mesmos códigos da tabela da tela) ---------- */
  function percorrer(unidades, visitar) {
    unidades.forEach(function (u, iu) {
      var cU = String(iu + 1);
      visitar({ tipo: 'unidade', eap: cU, item: u, servicos: servicosDaUnidade(u) });
      u.etapas.forEach(function (e, ie) {
        var cE = cU + '.' + (ie + 1);
        var diretos = e.servicos || [];
        visitar({ tipo: 'etapa', eap: cE, item: e, servicos: servicosDaEtapa(e) });
        // serviço direto na etapa é o 3º nível da EAP, como na tela (aparece junto com as sub etapas)
        diretos.forEach(function (sv, i) { visitar({ tipo: 'servico', eap: cE + '.' + (i + 1), item: sv, profundidade: 2, nivel: 3 }); });
        e.subEtapas.forEach(function (s, is) {
          var cS = cE + '.' + (diretos.length + is + 1);
          visitar({ tipo: 'sub', eap: cS, item: s, servicos: s.servicos });
          s.servicos.forEach(function (sv, i) { visitar({ tipo: 'servico', eap: cS + '.' + (i + 1), item: sv, profundidade: 3, nivel: 4 }); });
        });
      });
    });
  }
  function servicosDaEtapa(e) {
    var lista = (e.servicos || []).slice();
    e.subEtapas.forEach(function (s) { lista = lista.concat(s.servicos); });
    return lista;
  }
  function servicosDaUnidade(u) {
    return u.etapas.reduce(function (lista, e) { return lista.concat(servicosDaEtapa(e)); }, []);
  }
  function todosServicos(unidades) {
    return unidades.reduce(function (lista, u) { return lista.concat(servicosDaUnidade(u)); }, []);
  }

  /* ---------- material, mão de obra e equipamento ---------- */
  // Mesma regra de /api/sinapi/decomposicao, para as composições próprias do catálogo
  function tipoRecurso(nome, unidade) {
    var un = String(unidade || '').trim().toUpperCase();
    if (un === 'CHP' || un === 'CHI' || RE_LOCACAO.test(nome || '')) return 'equipamento';
    if (un === 'H') return 'maoDeObra';
    return 'material';
  }
  // M2 -> m², KG -> kg...; custos horários de equipamento ficam como no SINAPI (CHP/CHI)
  function unidadeTexto(un) {
    var u = String(un || '').trim();
    if (/^CH[PI]$/i.test(u)) return u.toUpperCase();
    return window.SinapiUI ? window.SinapiUI.unidadeAmigavel(u.toUpperCase()) : u;
  }
  function codigoSinapi(sv) { return String(sv.codigo || sv.catalogoId || '').trim(); }

  async function carregarSinapi(servicos, avisar) {
    var faltam = Array.from(new Set(servicos.filter(function (sv) { return sv.catalogoTipo === 'sinapi'; })
      .map(codigoSinapi).filter(function (c) { return /^\d+$/.test(c) && (!sinapi.has(chaveSinapi(c)) || sinapi.get(chaveSinapi(c)).erro); })));
    var total = faltam.length;
    // a SINPRES aceita 100 consultas por minuto: no limite, espera o tempo que ela pede e tenta de novo
    for (var tentativa = 0; tentativa < 3 && faltam.length; tentativa++) {
      var noLimite = [], espera = 0;
      for (var i = 0; i < faltam.length; i += LOTE_SINAPI) {
        var lote = faltam.slice(i, i + LOTE_SINAPI);
        avisar('Abrindo as composições SINAPI… ' + (total - faltam.length + i) + ' de ' + total);
        try {
          var mesPedido = mesRelatorio || referenciaSinapi;
          var resposta = await fetch('/api/sinapi/decomposicao?codigos=' + lote.join(',') + (mesPedido ? '&mes=' + mesPedido : ''));
          var dados = await resposta.json();
          if (resposta.status === 409) {
            var semMes = new Error('A referência desta versão (' + (window.ReferenciasSinapi ? window.ReferenciasSinapi.nome(mesPedido) : mesPedido) +
              ') não está na base SINAPI. Importe o mês em Base SINAPI ou altere a referência do orçamento.');
            semMes.abortar = true;
            throw semMes;
          }
          if (resposta.status === 429) {
            noLimite = noLimite.concat(lote);
            espera = Math.max(espera, dados.espera || 60);
            continue;
          }
          if (!resposta.ok) throw new Error('sinapi');
          if (dados.referencia) referenciaSinapi = dados.referencia;
          fonteSinapi = dados.fonte || 'sinpres';
          dados.composicoes.forEach(function (c) {
            sinapi.set(chaveSinapi(String(c.codigo)), c);
            if (c.erro === 'limite') { noLimite.push(String(c.codigo)); espera = Math.max(espera, c.espera || 60); }
          });
        } catch (e) {
          if (e.abortar) throw e;
          lote.forEach(function (c) { sinapi.set(chaveSinapi(c), { codigo: c, erro: 'falha' }); });
        }
      }
      faltam = noLimite;
      if (faltam.length && tentativa < 2) {
        for (var s = Math.min(espera, 70); s > 0; s--) {
          avisar('O SINAPI pediu uma pausa entre consultas. Continuando em ' + s + ' s…');
          await esperar(1000);
        }
      }
    }
  }

  function acumular(mapa, recurso, coeficiente) {
    var atual = mapa.get(recurso.chave);
    if (atual) { atual.coeficiente += coeficiente; return; }
    recurso.coeficiente = coeficiente;
    mapa.set(recurso.chave, recurso);
  }
  // Composição própria aberta pelos componentes do catálogo; os recursos com código SINAPI de
  // referência usam a mesma chave do SINAPI, para somar com eles na curva ABC de insumos
  function abrirPropria(comp, fator, mapa, catalogo, profundidade) {
    (comp.componentes || []).forEach(function (c) {
      var coeficiente = fator * (num(c.coeficiente) || 0);
      if (c.tipo === 'composicao') {
        var sub = catalogo.composicoes.get(c.composicaoId);
        var nome = sub ? sub.nome : c.nome;
        var un = String(sub ? sub.unidade : c.unidade || '').toUpperCase();
        var ehRecurso = !sub || !(sub.componentes || []).length || profundidade >= 8 ||
          un === 'CHP' || un === 'CHI' || (un === 'H' && RE_ENCARGOS.test(nome));
        if (!ehRecurso) { abrirPropria(sub, coeficiente, mapa, catalogo, profundidade + 1); return; }
        var ref = sub && sub.codigoReferencia;
        acumular(mapa, {
          chave: ref ? 'C:' + ref : 'PC:' + c.composicaoId, codigo: ref || (sub && sub.codigo) || '',
          base: ref ? 'SINAPI' : 'Própria', descricao: nome, unidade: sub ? sub.unidade : c.unidade,
          tipo: tipoRecurso(nome, un), preco: num(sub ? sub.valorUnitario : c.valorUnitario) || 0
        }, coeficiente);
        return;
      }
      var ins = catalogo.insumos.get(c.insumoId);
      var nomeI = c.detalheId ? c.nome : (ins ? ins.nome : c.nome);
      var refI = ins && ins.codigoReferencia;
      acumular(mapa, {
        chave: refI ? 'I:' + refI : 'PI:' + c.insumoId + (c.detalheId ? ':' + c.detalheId : ''),
        codigo: refI || (ins && ins.codigo) || '', base: refI ? 'SINAPI' : 'Própria', descricao: nomeI,
        unidade: ins ? ins.unidade : c.unidade, tipo: tipoRecurso(nomeI, ins ? ins.unidade : c.unidade),
        preco: num(ins ? ins.valorUnitario : c.valorUnitario) || 0
      }, coeficiente);
    });
  }
  function recursosBase(sv, catalogo) {
    var mapa = new Map();
    if (sv.catalogoTipo === 'sinapi') {
      var c = sinapi.get(chaveSinapi(codigoSinapi(sv)));
      if (!c || c.erro) return null;
      c.recursos.forEach(function (r) {
        acumular(mapa, { chave: r.chave, codigo: r.codigo, base: 'SINAPI', descricao: r.descricao,
          unidade: r.unidade, tipo: r.tipo, preco: r.preco }, r.coeficiente);
      });
    } else if (sv.catalogoTipo === 'composicao') {
      var comp = catalogo.composicoes.get(sv.catalogoId);
      if (!comp) return null;
      abrirPropria(comp, 1, mapa, catalogo, 0);
    } else {
      return null;
    }
    var recursos = Array.from(mapa.values());
    var custo = somar(recursos, function (r) { return r.coeficiente * r.preco; });
    return custo > 0 ? { recursos: recursos, custo: custo } : null;
  }
  // Proporções da composição aplicadas ao preço unitário do orçamento, para os totais baterem
  function criarDecompositor() {
    var catalogo = {
      composicoes: new Map((window.Composicoes ? window.Composicoes.carregar() : []).map(function (c) { return [c.id, c]; })),
      insumos: new Map((window.Insumos ? window.Insumos.carregar() : []).map(function (i) { return [i.id, i]; }))
    };
    var memo = new Map();
    return function (sv) {
      if (memo.has(sv)) return memo.get(sv);
      var preco = num(sv.valorUnitario) || 0;
      var base = recursosBase(sv, catalogo);
      var porUnidade = { material: 0, maoDeObra: 0, equipamento: 0, semDetalhe: 0 };
      var recursos = [];
      if (!base) porUnidade.semDetalhe = preco;
      else {
        var fator = preco / base.custo;
        recursos = base.recursos.map(function (r) {
          var x = Object.assign({}, r, { custo: r.coeficiente * r.preco * fator });
          porUnidade[x.tipo] += x.custo;
          return x;
        });
      }
      var d = { porUnidade: porUnidade, recursos: recursos };
      memo.set(sv, d);
      return d;
    };
  }
  function divisao(servicos, decompor) {
    var t = { material: 0, maoDeObra: 0, equipamento: 0, semDetalhe: 0 };
    servicos.forEach(function (sv) {
      var d = decompor(sv), q = qtdServico(sv);
      TIPOS.forEach(function (k) { t[k] += d.porUnidade[k] * q; });
    });
    return t;
  }

  /* ---------- documentos ---------- */
  function coluna(titulo, tipo, mm, wch) { return { titulo: titulo, tipo: tipo, mm: mm, wch: wch }; }
  function cabecalhoComum(o, versao, relatorio) {
    var usuario = window.usuarioAtual || {};
    var marca = document.querySelector('.brand h1');
    return {
      empresa: marca ? marca.textContent.trim() : 'Orçamento',
      emitidoEm: new Date().toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }),
      emitidoPor: usuario.nome || usuario.email || '',
      meta: [
        ['Orçamento', (o.codigo ? o.codigo + ' — ' : '') + o.nome],
        ['Versão', 'V' + versao.numero + ' · Rev. ' + (versao.revisao || 0)],
        ['Base de preços', 'SINAPI São Paulo · desonerado' + (versao.referencia ? ' · ref. ' + versao.referencia
          : referenciaSinapi && relatorio !== 'abcServicos' ? ' · ref. ' + referenciaSinapi : '')],
        ['Valores', 'Em reais (R$)']
      ],
      rodape: (o.codigo || o.nome) + ' · ' + NOME_RELATORIO[relatorio] + ' · V' + versao.numero + ' Rev. ' + (versao.revisao || 0),
      arquivo: [o.codigo || o.nome, NOME_RELATORIO[relatorio], 'V' + versao.numero + ' Rev ' + (versao.revisao || 0)]
        .join(' - ').replace(/[\\/:*?"<>|]+/g, '-')
    };
  }
  function textoMemo(l) {
    var partes = [num(l.quantidade)].concat([l.comprimento, l.largura, l.altura].map(num), [num(l.coeficiente)])
      .filter(function (v) { return v != null; }).map(function (v) { return fmtNum.format(v); });
    return [l.descricao || 'Linha da memória', partes.length > 1 ? partes.join(' × ') : ''].filter(Boolean).join(' — ');
  }
  function notaDecomposicao(servicos, decompor) {
    var notas = [fonteSinapi === 'base'
      ? 'Material, mão de obra e equipamento: composição SINAPI aberta até os insumos com a classificação oficial da Caixa (base importada, referência ' +
        (referenciaSinapi || '—') + '), ou componentes da composição própria; proporções aplicadas ao preço unitário deste orçamento. ' +
        'Profissionais aparecem com os encargos complementares; equipamentos, pelo custo horário (CHP/CHI); serviços terceirizados contam como material.'
      : 'Material, mão de obra e equipamento: proporções da composição SINAPI (consultada na referência ' +
        (referenciaSinapi || 'mais recente') + ') ou dos componentes da composição própria, aplicadas ao preço unitário deste orçamento. ' +
        'Mão de obra inclui os encargos complementares; equipamento, os custos horários (CHP/CHI) e locações.'];
    var sem = servicos.filter(function (sv) { return decompor(sv).porUnidade.semDetalhe > 0; });
    if (sem.length) {
      var codigos = Array.from(new Set(sem.map(function (sv) { return sv.codigo || sv.nome; })));
      notas.push('Sem detalhamento: ' + sem.length + ' serviço(s) sem composição aberta (sem vínculo com o catálogo, não encontrados no SINAPI ou sem resposta da consulta): ' +
        codigos.slice(0, 12).join(', ') + (codigos.length > 12 ? '…' : '') + '.');
    }
    return notas;
  }

  function docOrcamento(o, versao, opcoes, decompor) {
    var unidades = versao.unidades || [];
    var composicoes = mapaComposicoes();
    var servicos = todosServicos(unidades);
    var total = somar(servicos, totalServico);
    var nivel = opcoes.nivel;
    var tipos = [];
    var geral = null;
    if (opcoes.separar) {
      geral = divisao(servicos, decompor);
      tipos = TIPOS.filter(function (k) { return k !== 'semDetalhe' || geral.semDetalhe > 0.005; });
    }
    var colunas = [
      coluna('Item', 'codigo', 15, 10), coluna('Código', 'codigo', 22, 14), coluna('Base', 'texto', 14, 8),
      coluna('Descrição', 'descricao', 0, 52), coluna('Un.', 'texto', 10, 6), coluna('Quantidade', 'num', 16, 12),
      coluna('Preço unitário', 'moeda', 18, 13), coluna('Preço total', 'moeda', 22, 15)
    ].concat(tipos.map(function (k) { return coluna(NOME_TIPO[k], 'moeda', 21, 14); }), [coluna('Peso', 'pct', 14, 8)]);
    var vazio = function (n) { return new Array(n).fill(''); };
    var linhas = [];
    var NIVEL_TIPO = { unidade: 1, etapa: 2, sub: 3 };
    percorrer(unidades, function (n) {
      if ((n.nivel || NIVEL_TIPO[n.tipo]) > nivel) return;
      if (n.tipo !== 'servico') {
        var t = somar(n.servicos, totalServico);
        var d = tipos.length ? divisao(n.servicos, decompor) : null;
        linhas.push({
          estilo: n.tipo === 'unidade' ? 'n1' : n.tipo === 'etapa' ? 'n2' : 'n3',
          nivel: NIVEL_TIPO[n.tipo] - 1,
          celulas: [n.eap, '', '', n.tipo === 'unidade' ? tudoMaiusculo(n.item.nome) : n.item.nome, '', null, null, t]
            .concat(tipos.map(function (k) { return d[k]; }), [total ? t / total : 0])
        });
        return;
      }
      var sv = n.item, f = fonteServico(sv, composicoes), q = qtdServico(sv), tt = totalServico(sv);
      var ds = tipos.length ? decompor(sv) : null;
      linhas.push({
        estilo: 'servico', nivel: n.profundidade,
        celulas: [n.eap, f.codigo, f.base, sv.nome, unidadeTexto(sv.unidadeMedida), q, num(sv.valorUnitario), tt]
          .concat(tipos.map(function (k) { return ds.porUnidade[k] * q; }), [total ? tt / total : 0])
      });
      if (nivel >= 5 && sv.memo && sv.memo.length) {
        sv.memo.forEach(function (l) {
          var r = calcularLinha(l);
          linhas.push({
            estilo: 'memo', nivel: n.profundidade + 1,
            celulas: ['', '', '', textoMemo(l), unidadeTexto(unidadeLinhaMemo(r, sv)), r.valor, null, null].concat(vazio(tipos.length), [null])
          });
        });
      }
    });
    linhas.push({
      estilo: 'total', nivel: 0,
      celulas: ['', '', '', 'Total geral', '', null, null, total].concat(tipos.map(function (k) { return geral[k]; }), [total ? 1 : 0])
    });

    var resumo = [[{ rotulo: 'Total do orçamento', valor: fmtBRL.format(total) },
      { rotulo: 'Serviços', valor: String(servicos.length) },
      { rotulo: 'Unidades construtivas', valor: String(unidades.length) }]];
    if (tipos.length) {
      resumo = [[{ rotulo: 'Total do orçamento', valor: fmtBRL.format(total) }].concat(tipos.map(function (k) {
        return { rotulo: NOME_TIPO[k], valor: fmtBRL.format(geral[k]), detalhe: total ? pct(geral[k] / total) : '' };
      }))];
    }
    return {
      titulo: 'Orçamento',
      subtitulo: NOMES_NIVEIS[nivel] + (tipos.length ? ' · material, mão de obra e equipamento' : ''),
      aba: 'Orçamento', paisagem: tipos.length > 0,
      resumo: resumo, colunas: colunas, linhas: linhas,
      notas: tipos.length ? notaDecomposicao(servicos, decompor) : []
    };
  }

  function classificar(itens) {
    itens.sort(function (a, b) { return b.total - a.total; });
    var total = somar(itens, function (i) { return i.total; });
    var acumulado = 0;
    itens.forEach(function (it) {
      var antes = total ? acumulado / total : 1;
      acumulado += it.total;
      it.peso = total ? it.total / total : 0;
      it.acumulado = total ? acumulado / total : 0;
      it.classe = antes < LIMITE_A ? 'A' : antes < LIMITE_B ? 'B' : 'C';
    });
    return total;
  }
  function resumoClasses(itens, total, nomes) {
    return ['A', 'B', 'C'].map(function (classe) {
      var grupo = itens.filter(function (i) { return i.classe === classe; });
      var valor = somar(grupo, function (i) { return i.total; });
      return {
        rotulo: 'Classe ' + classe, valor: fmtBRL.format(valor),
        detalhe: grupo.length + ' ' + nomes[grupo.length === 1 ? 0 : 1] + (itens.length ? ' (' + pct(grupo.length / itens.length) + ')' : '') + ' · ' + (total ? pct(valor / total) : '0%')
      };
    });
  }
  var NOTA_ABC = 'Classe A: itens que somam os primeiros 80% do custo; B: até 95%; C: o restante.';

  function docAbcServicos(o, versao) {
    var composicoes = mapaComposicoes();
    var grupos = new Map();
    todosServicos(versao.unidades || []).forEach(function (sv) {
      var chave = sv.catalogoTipo === 'sinapi' ? 'S:' + codigoSinapi(sv)
        : sv.catalogoTipo === 'composicao' ? 'P:' + sv.catalogoId : 'N:' + sv.nome + '|' + sv.unidadeMedida;
      var g = grupos.get(chave);
      if (!g) {
        var f = fonteServico(sv, composicoes);
        g = { codigo: f.codigo, base: f.base, descricao: sv.nome, unidade: unidadeTexto(sv.unidadeMedida), qtd: 0, total: 0, ocorrencias: 0 };
        grupos.set(chave, g);
      }
      g.qtd += qtdServico(sv);
      g.total += totalServico(sv);
      g.ocorrencias += 1;
    });
    var itens = Array.from(grupos.values());
    var total = classificar(itens);
    return {
      titulo: 'Curva ABC de serviços', subtitulo: itens.length + ' serviços distintos, do maior para o menor custo',
      aba: 'Curva ABC serviços', paisagem: true,
      resumo: [[{ rotulo: 'Total do orçamento', valor: fmtBRL.format(total) }].concat(resumoClasses(itens, total, ['serviço', 'serviços']))],
      curva: itens,
      colunas: [coluna('#', 'num0', 8, 5), coluna('Código', 'codigo', 22, 14), coluna('Base', 'texto', 14, 8),
        coluna('Descrição', 'descricao', 0, 60), coluna('Un.', 'texto', 11, 6), coluna('Quantidade', 'num', 20, 12),
        coluna('Preço unitário', 'moeda', 19, 13), coluna('Total', 'moeda', 22, 15), coluna('Peso', 'pct', 13, 8),
        coluna('Acumulado', 'pct', 17, 10), coluna('Classe', 'classe', 12, 7)],
      linhas: itens.map(function (it, i) {
        return { estilo: 'abc-' + it.classe, nivel: 0, celulas: [i + 1, it.codigo, it.base,
          it.descricao + (it.ocorrencias > 1 ? ' (' + it.ocorrencias + ' lugares na EAP)' : ''), it.unidade, it.qtd,
          it.qtd ? it.total / it.qtd : null, it.total, it.peso, it.acumulado, it.classe] };
      }).concat([{ estilo: 'total', nivel: 0, celulas: ['', '', '', 'Total', '', null, null, total, total ? 1 : 0, null, ''] }]),
      notas: [NOTA_ABC, 'Serviços com o mesmo código em lugares diferentes da EAP aparecem somados.']
    };
  }

  function docAbcInsumos(o, versao, decompor) {
    var servicos = todosServicos(versao.unidades || []);
    var grupos = new Map();
    var semDetalhe = { codigo: '', base: '', descricao: 'Serviços sem composição detalhada', tipo: 'semDetalhe', unidade: '', qtd: null, total: 0, servicos: 0 };
    servicos.forEach(function (sv) {
      var d = decompor(sv), q = qtdServico(sv);
      if (d.porUnidade.semDetalhe) { semDetalhe.total += d.porUnidade.semDetalhe * q; semDetalhe.servicos += 1; }
      d.recursos.forEach(function (r) {
        var g = grupos.get(r.chave);
        if (!g) {
          g = { codigo: r.codigo, base: r.base, descricao: primeiraMaiuscula(r.descricao), tipo: r.tipo, unidade: unidadeTexto(r.unidade), qtd: 0, total: 0 };
          grupos.set(r.chave, g);
        }
        g.qtd += r.coeficiente * q;
        g.total += r.custo * q;
      });
    });
    var itens = Array.from(grupos.values());
    if (semDetalhe.total > 0.005) {
      semDetalhe.descricao += ' (' + semDetalhe.servicos + ')';
      itens.push(semDetalhe);
    }
    var total = classificar(itens);
    var porTipo = TIPOS.filter(function (k) { return itens.some(function (i) { return i.tipo === k && i.total > 0; }); }).map(function (k) {
      var v = somar(itens.filter(function (i) { return i.tipo === k; }), function (i) { return i.total; });
      return { rotulo: NOME_TIPO[k], valor: fmtBRL.format(v), detalhe: total ? pct(v / total) : '' };
    });
    return {
      titulo: 'Curva ABC de insumos', subtitulo: itens.length + ' insumos e profissionais, do maior para o menor custo',
      aba: 'Curva ABC insumos', paisagem: true,
      resumo: [[{ rotulo: 'Total do orçamento', valor: fmtBRL.format(total) }].concat(resumoClasses(itens, total, ['item', 'itens'])), porTipo],
      curva: itens,
      colunas: [coluna('#', 'num0', 8, 5), coluna('Código', 'codigo', 22, 14), coluna('Descrição', 'descricao', 0, 60),
        coluna('Tipo', 'texto', 22, 13), coluna('Un.', 'texto', 12, 6), coluna('Quantidade', 'num', 20, 12),
        coluna('Preço médio', 'moeda', 18, 12), coluna('Total', 'moeda', 22, 15), coluna('Peso', 'pct', 13, 8),
        coluna('Acumulado', 'pct', 17, 10), coluna('Classe', 'classe', 12, 7)],
      linhas: itens.map(function (it, i) {
        return { estilo: 'abc-' + it.classe, nivel: 0, celulas: [i + 1, it.codigo, it.descricao, NOME_TIPO[it.tipo],
          it.unidade, it.qtd, it.qtd ? it.total / it.qtd : null, it.total, it.peso, it.acumulado, it.classe] };
      }).concat([{ estilo: 'total', nivel: 0, celulas: ['', '', 'Total', '', '', null, null, total, total ? 1 : 0, null, ''] }]),
      notas: [NOTA_ABC, 'Quantidades somadas de todas as composições do orçamento (coeficiente × quantidade do serviço); ' +
        'profissionais aparecem com encargos complementares e equipamentos pelo custo horário.'].concat(notaDecomposicao(servicos, decompor))
    };
  }

  /* ---------- PDF: página de impressão ---------- */
  function textoCelula(valor, tipo) {
    if (valor == null || valor === '') return '';
    if (tipo === 'moeda' || tipo === 'num') return typeof valor === 'number' ? fmt2.format(valor) : esc(valor);
    if (tipo === 'pct') return typeof valor === 'number' ? pct(valor) : esc(valor);
    return esc(valor);
  }
  // Curva ABC: % acumulado do custo (um eixo só) com as faixas A, B e C ao fundo
  function svgCurva(itens) {
    if (!itens.length) return '';
    var L = 40, R = 12, T = 22, B = 30, W = 1100, H = 210, pw = W - L - R, ph = H - T - B;
    var x = function (i) { return L + pw * i / itens.length; };
    var y = function (v) { return T + ph * (1 - v); };
    var s = '<svg class="curva" viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="Curva ABC: custo acumulado por item">';
    var inicio = 0;
    ['A', 'B', 'C'].forEach(function (classe, k) {
      var n = itens.filter(function (i) { return i.classe === classe; }).length;
      if (!n) return;
      var x0 = x(inicio), x1 = x(inicio + n);
      s += '<rect x="' + x0 + '" y="' + T + '" width="' + (x1 - x0) + '" height="' + ph + '" fill="' + ['#ededf0', '#f5f5f6', '#fbfbfb'][k] + '"/>';
      s += '<text x="' + (x0 + 4) + '" y="' + (T - 6) + '" class="faixa">' + classe + ' · ' + n + (n === 1 ? ' item' : ' itens') + '</text>';
      inicio += n;
    });
    [0, 0.2, 0.4, 0.6, 0.8, 1].forEach(function (v) {
      s += '<line x1="' + L + '" x2="' + (L + pw) + '" y1="' + y(v) + '" y2="' + y(v) + '" class="grade"/>' +
        '<text x="' + (L - 6) + '" y="' + (y(v) + 3) + '" class="eixo" text-anchor="end">' + Math.round(v * 100) + '%</text>';
    });
    var pontos = [L + ',' + y(0)].concat(itens.map(function (it, i) { return x(i + 1) + ',' + y(it.acumulado); }));
    s += '<polyline points="' + pontos.join(' ') + '" class="linha"/>';
    s += '<text x="' + (L + pw / 2) + '" y="' + (H - 8) + '" class="eixo" text-anchor="middle">' + itens.length + ' itens, do maior para o menor custo</text>';
    return s + '</svg>';
  }
  function htmlDocumento(doc) {
    var origem = location.origin;
    var larguraFixa = somar(doc.colunas, function (c) { return c.mm; });
    var util = doc.paisagem ? 273 : 186;
    var cols = doc.colunas.map(function (c) {
      return '<col style="width:' + (c.mm ? c.mm : Math.max(40, util - larguraFixa)) + 'mm">';
    }).join('');
    var alinhaDireita = function (t) { return t === 'moeda' || t === 'num' || t === 'pct' || t === 'num0'; };
    var thead = doc.colunas.map(function (c) {
      return '<th' + (alinhaDireita(c.tipo) ? ' class="r"' : c.tipo === 'classe' ? ' class="c"' : '') + '>' + esc(c.titulo) + '</th>';
    }).join('');
    var tbody = doc.linhas.map(function (l) {
      return '<tr class="' + l.estilo + '">' + l.celulas.map(function (v, i) {
        var c = doc.colunas[i], cls = [];
        if (alinhaDireita(c.tipo)) cls.push('r');
        if (c.tipo === 'codigo') cls.push('cod');
        if (c.tipo === 'classe') cls.push('c');
        if (c.tipo === 'descricao') cls.push('d' + l.nivel);
        return '<td' + (cls.length ? ' class="' + cls.join(' ') + '"' : '') + '>' + textoCelula(v, c.tipo) + '</td>';
      }).join('') + '</tr>';
    }).join('');
    var resumo = (doc.resumo || []).filter(function (g) { return g.length; }).map(function (grupo) {
      return '<section class="resumo">' + grupo.map(function (r) {
        return '<div><span>' + esc(r.rotulo) + '</span><strong>' + esc(r.valor) + '</strong>' + (r.detalhe ? '<small>' + esc(r.detalhe) + '</small>' : '') + '</div>';
      }).join('') + '</section>';
    }).join('');
    var meta = doc.meta.map(function (m) { return '<div><dt>' + esc(m[0]) + '</dt><dd>' + esc(m[1]) + '</dd></div>'; }).join('');
    var notas = doc.notas.length ? '<section class="notas">' + doc.notas.map(function (n) { return '<p>' + esc(n) + '</p>'; }).join('') + '</section>' : '';
    var css = [
      '@page{size:A4 ' + (doc.paisagem ? 'landscape' : 'portrait') + ';margin:12mm 12mm 14mm;',
      '@bottom-left{content:"' + doc.rodape.replace(/"/g, '') + '";font:7pt Inter,Arial,sans-serif;color:#a1a1aa}',
      '@bottom-right{content:"Página " counter(page) " de " counter(pages);font:7pt Inter,Arial,sans-serif;color:#a1a1aa}}',
      '*{box-sizing:border-box}html{-webkit-print-color-adjust:exact;print-color-adjust:exact}',
      'body{margin:0;font-family:Inter,-apple-system,"Segoe UI",Helvetica,Arial,sans-serif;font-size:8pt;line-height:1.35;color:#27272a;background:#fff}',
      '@media screen{body{max-width:' + (doc.paisagem ? 1180 : 860) + 'px;margin:0 auto;padding:0 28px 48px}}',
      '.barra{position:sticky;top:0;display:flex;justify-content:flex-end;gap:8px;padding:12px 0;background:#fff}',
      '.barra button{height:30px;padding:0 12px;border:1px solid #e4e4e7;border-radius:6px;background:#18181b;color:#fff;font:500 12px Inter,sans-serif;cursor:pointer}',
      '@media print{.barra{display:none}}',
      '.cab{display:flex;justify-content:space-between;align-items:center;padding-bottom:7px;border-bottom:1px solid #18181b}',
      '.empresa{display:flex;align-items:center;gap:8px;font-size:8.5pt;font-weight:600;color:#18181b}.empresa img{height:20px}',
      '.emissao{text-align:right;font-size:7pt;line-height:1.45;color:#71717a}',
      'h1{margin:14px 0 1px;font-size:15pt;font-weight:600;letter-spacing:-.01em;color:#18181b}',
      '.sub{margin:0 0 10px;font-size:8.5pt;color:#71717a}',
      '.meta{display:flex;flex-wrap:wrap;gap:4px 28px;margin:0 0 12px}.meta dt{font-size:6.5pt;letter-spacing:.06em;text-transform:uppercase;color:#a1a1aa}.meta dd{margin:1px 0 0;color:#27272a}',
      '.resumo{display:flex;margin:0 0 8px;border:1px solid #e4e4e7;border-radius:5px}',
      '.resumo div{flex:1;padding:6px 10px;border-left:1px solid #e4e4e7}.resumo div:first-child{border-left:0}',
      '.resumo span{display:block;font-size:6.5pt;letter-spacing:.06em;text-transform:uppercase;color:#a1a1aa}',
      '.resumo strong{display:block;margin-top:2px;font-size:10pt;font-weight:600;color:#18181b}.resumo small{font-size:7pt;color:#71717a}',
      '.curva{display:block;width:100%;height:auto;margin:6px 0 12px}.curva .grade{stroke:#e4e4e7;stroke-width:.6}',
      '.curva .eixo{font-size:8px;fill:#a1a1aa}.curva .faixa{font-size:8.5px;font-weight:600;fill:#52525b}',
      '.curva .linha{fill:none;stroke:#18181b;stroke-width:2;stroke-linejoin:round}',
      'table{width:100%;margin-top:6px;border-collapse:collapse;table-layout:fixed}',
      'th{padding:5px 4px;border-bottom:1px solid #18181b;font-size:6.5pt;font-weight:500;letter-spacing:.05em;text-align:left;text-transform:uppercase;vertical-align:bottom;color:#71717a}',
      'td{padding:3.5px 4px;border-bottom:.5px solid #ececee;vertical-align:top;font-variant-numeric:tabular-nums;overflow-wrap:anywhere}',
      'tr{break-inside:avoid}.r{text-align:right}td.r{white-space:nowrap}.c{text-align:center}',
      '.cod{font-family:ui-monospace,Menlo,Consolas,monospace;font-size:7pt;color:#71717a;overflow-wrap:normal;white-space:nowrap}',
      'tr.n1 td{background:#e7e7ea;font-weight:600;color:#18181b}tr.n2 td{background:#efeff1;font-weight:600;color:#18181b}tr.n3 td{background:#f6f6f7;color:#18181b}',
      'tr.n1 .cod,tr.n2 .cod,tr.n3 .cod{color:#3f3f46}',
      'td.d1{padding-left:10px}td.d2{padding-left:16px}td.d3{padding-left:22px}td.d4{padding-left:28px}',
      'tr.memo td{padding-top:1.5px;padding-bottom:1.5px;border-bottom:0;font-size:7pt;font-style:italic;color:#71717a}',
      'tr.abc-A td.c{font-weight:600;color:#18181b}tr.abc-B td.c{color:#52525b}tr.abc-C td.c{color:#a1a1aa}',
      'tr.total td{padding-top:6px;border-top:1px solid #18181b;border-bottom:0;font-size:8.5pt;font-weight:600;color:#18181b}',
      '.notas{break-inside:avoid;margin-top:12px;padding-top:6px;border-top:.5px solid #e4e4e7;font-size:7pt;line-height:1.5;color:#71717a}.notas p{margin:0 0 3px}'
    ].join('');
    return '<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>' + esc(doc.arquivo) + '</title>' +
      '<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>' +
      '<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&display=swap" rel="stylesheet">' +
      '<style>' + css + '</style></head><body>' +
      '<div class="barra"><button type="button" onclick="window.print()">Imprimir ou salvar em PDF</button></div>' +
      '<header class="cab"><div class="empresa"><img src="' + esc(origem) + '/logo.png" alt="" onerror="this.remove()">' + esc(doc.empresa) + '</div>' +
      '<div class="emissao">Emitido em ' + esc(doc.emitidoEm) + (doc.emitidoPor ? '<br>por ' + esc(doc.emitidoPor) : '') + '</div></header>' +
      '<h1>' + esc(doc.titulo) + '</h1><p class="sub">' + esc(doc.subtitulo) + '</p>' +
      '<dl class="meta">' + meta + '</dl>' + resumo + (doc.curva ? svgCurva(doc.curva) : '') +
      '<table><colgroup>' + cols + '</colgroup><thead><tr>' + thead + '</tr></thead><tbody>' + tbody + '</tbody></table>' +
      notas + '</body></html>';
  }
  function abrirJanela() {
    var janela = window.open('', '_blank');
    if (janela) janela.document.write('<!doctype html><title>Gerando relatório…</title><body style="margin:48px;font:14px -apple-system,Segoe UI,sans-serif;color:#71717a">Gerando relatório…</body>');
    return janela;
  }
  function mostrarPdf(janela, doc) {
    var html = htmlDocumento(doc);
    var alvo = janela && !janela.closed ? janela : null;
    var quadro = null;
    if (!alvo) { // janela bloqueada: imprime por um quadro escondido
      quadro = document.createElement('iframe');
      quadro.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0';
      document.body.appendChild(quadro);
      alvo = quadro.contentWindow;
    }
    alvo.document.open();
    alvo.document.write(html);
    alvo.document.close();
    var pronto = new Promise(function (r) { if (alvo.document.readyState === 'complete') r(); else alvo.addEventListener('load', r); });
    Promise.race([pronto.then(function () { return alvo.document.fonts ? alvo.document.fonts.ready : null; }), esperar(3000)])
      .then(function () {
        alvo.focus();
        alvo.print();
        if (quadro) setTimeout(function () { quadro.remove(); }, 2000);
      });
  }

  /* ---------- Excel ---------- */
  function carregarExcelJS() {
    if (window.ExcelJS) return Promise.resolve();
    return new Promise(function (ok, falha) {
      var s = document.createElement('script');
      s.src = EXCELJS;
      s.onload = ok;
      s.onerror = function () { s.remove(); falha(new Error('Não foi possível carregar o gerador de Excel. Verifique a conexão e tente de novo.')); };
      document.head.appendChild(s);
    });
  }
  var FORMATO_EXCEL = { moeda: '#,##0.00', num: '#,##0.00', pct: '0.0%', num0: '0' };
  var FUNDO_EXCEL = { n1: 'FFE7E7EA', n2: 'FFEFEFF1', n3: 'FFF6F6F7' };
  async function baixarExcel(doc) {
    await carregarExcelJS();
    var wb = new window.ExcelJS.Workbook();
    wb.creator = doc.empresa;
    wb.created = new Date();
    var n = doc.colunas.length;
    var ws = wb.addWorksheet(doc.aba, {
      properties: { outlineProperties: { summaryBelow: false } },
      pageSetup: { paperSize: 9, orientation: doc.paisagem ? 'landscape' : 'portrait', fitToPage: true, fitToWidth: 1, fitToHeight: 0,
        margins: { left: 0.4, right: 0.4, top: 0.5, bottom: 0.6, header: 0.2, footer: 0.3 } },
      headerFooter: { oddFooter: '&L&8' + doc.rodape.replace(/&/g, '&&') + '&R&8Página &P de &N' }
    });
    ws.columns = doc.colunas.map(function (c) { return { width: c.wch }; });
    var fonte = function (extra) { return Object.assign({ name: 'Calibri', size: 9, color: { argb: 'FF27272A' } }, extra || {}); };
    var linhaLarga = function (texto, f) {
      var r = ws.addRow([texto]);
      ws.mergeCells(r.number, 1, r.number, n);
      r.getCell(1).font = fonte(f);
      return r;
    };
    linhaLarga(doc.empresa, { size: 9, bold: true, color: { argb: 'FF18181B' } });
    linhaLarga(doc.titulo, { size: 15, bold: true, color: { argb: 'FF18181B' } }).height = 22;
    linhaLarga(doc.subtitulo, { color: { argb: 'FF71717A' } });
    doc.meta.concat([['Emitido em', doc.emitidoEm + (doc.emitidoPor ? ' por ' + doc.emitidoPor : '')]]).forEach(function (m) {
      linhaLarga(m[0] + ': ' + m[1], { color: { argb: 'FF71717A' } });
    });
    ws.addRow([]);
    (doc.resumo || []).forEach(function (grupo) {
      grupo.forEach(function (r) { linhaLarga(r.rotulo + ': ' + r.valor + (r.detalhe ? ' · ' + r.detalhe : ''), { bold: r === grupo[0] }); });
    });
    ws.addRow([]);
    var cab = ws.addRow(doc.colunas.map(function (c) { return c.titulo; }));
    cab.height = 18;
    cab.eachCell(function (cell, i) {
      var t = doc.colunas[i - 1].tipo;
      cell.font = fonte({ bold: true, color: { argb: 'FF18181B' } });
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF4F4F5' } };
      cell.border = { bottom: { style: 'thin', color: { argb: 'FF18181B' } } };
      cell.alignment = { vertical: 'bottom', horizontal: FORMATO_EXCEL[t] ? 'right' : t === 'classe' ? 'center' : 'left', wrapText: true };
    });
    ws.views = [{ state: 'frozen', ySplit: cab.number, showGridLines: false }];
    ws.pageSetup.printTitlesRow = cab.number + ':' + cab.number;
    var iDescricao = doc.colunas.findIndex(function (c) { return c.tipo === 'descricao'; });
    doc.linhas.forEach(function (l) {
      var r = ws.addRow(l.celulas.map(function (v) { return v === '' ? null : v; }));
      if (l.estilo !== 'total') r.outlineLevel = l.nivel;
      var fundo = FUNDO_EXCEL[l.estilo];
      var negrito = l.estilo === 'n1' || l.estilo === 'n2' || l.estilo === 'total';
      var italico = l.estilo === 'memo';
      r.eachCell({ includeEmpty: true }, function (cell, i) {
        var c = doc.colunas[i - 1];
        if (!c) return;
        cell.font = fonte({ bold: negrito, italic: italico, color: { argb: italico ? 'FF71717A' : c.tipo === 'codigo' ? 'FF52525B' : 'FF27272A' } });
        if (FORMATO_EXCEL[c.tipo]) cell.numFmt = FORMATO_EXCEL[c.tipo];
        cell.alignment = {
          vertical: 'top', wrapText: c.tipo === 'descricao',
          horizontal: FORMATO_EXCEL[c.tipo] ? 'right' : c.tipo === 'classe' ? 'center' : 'left',
          indent: c.tipo === 'descricao' ? Math.min(l.nivel, 4) : 0
        };
        if (fundo) cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: fundo } };
        cell.border = l.estilo === 'total'
          ? { top: { style: 'thin', color: { argb: 'FF18181B' } } }
          : { bottom: { style: 'hair', color: { argb: 'FFE4E4E7' } } };
      });
      // o Excel não ajusta sozinho a altura de texto quebrado: estima pelas linhas da descrição
      if (iDescricao >= 0) {
        var texto = String(l.celulas[iDescricao] || '');
        var linhas = Math.max(1, Math.ceil(texto.length / (doc.colunas[iDescricao].wch * 1.15)));
        if (linhas > 1) r.height = 12 * linhas + 3;
      }
    });
    if (doc.notas.length) {
      ws.addRow([]);
      doc.notas.forEach(function (nota) {
        var r = linhaLarga(nota, { size: 8, italic: true, color: { argb: 'FF71717A' } });
        r.getCell(1).alignment = { wrapText: true, vertical: 'top' };
        r.height = 12 * Math.max(1, Math.ceil(nota.length / (somar(doc.colunas, function (c) { return c.wch; }) * 1.1))) + 3;
      });
    }
    var buffer = await wb.xlsx.writeBuffer();
    var a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }));
    a.download = doc.arquivo + '.xlsx';
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 2000);
  }

  /* ---------- janela "Exportar" ---------- */
  function valorMarcado(nome) {
    var r = modal.querySelector('input[name="' + nome + '"]:checked');
    return r ? r.value : '';
  }
  function marcar(nome, valor) {
    modal.querySelectorAll('input[name="' + nome + '"]').forEach(function (r) { r.checked = r.value === String(valor); });
  }
  function atualizarOpcoes() {
    var relatorio = valorMarcado('exportarRelatorio');
    el.opcoesOrcamento.hidden = relatorio !== 'orcamento';
    var nivel = Number(valorMarcado('exportarNivel')) || 4;
    el.legendaNivel.textContent = NOMES_NIVEIS[nivel];
  }
  function status(texto, classe) {
    el.status.textContent = texto || '';
    el.status.className = 'sinapi-status' + (classe ? ' ' + classe : '');
  }
  function abrir(id) {
    var o = state.orcamentos.find(function (x) { return x.id === id; });
    if (!o || !modal) return;
    orcamentoId = id;
    var p = lerPrefs();
    el.orcamento.textContent = (o.codigo ? o.codigo + ' · ' : '') + o.nome;
    el.versao.innerHTML = o.versoes.map(function (v, i) {
      var atual = i === o.versoes.length - 1;
      return '<option value="' + esc(v.numero) + '"' + (atual ? ' selected' : '') + '>V' + esc(v.numero) + ' · Rev. ' + esc(v.revisao || 0) + (atual ? ' (atual)' : '') + '</option>';
    }).join('');
    marcar('exportarRelatorio', p.relatorio || 'orcamento');
    marcar('exportarNivel', p.nivel || 4);
    marcar('exportarFormato', p.formato || 'pdf');
    el.separar.checked = Boolean(p.separar);
    status('');
    el.confirmar.disabled = false;
    atualizarOpcoes();
    if (!modal.open) modal.showModal();
  }
  async function exportar() {
    if (exportando) return;
    var o = state.orcamentos.find(function (x) { return x.id === orcamentoId; });
    if (!o) return;
    var versao = o.versoes.find(function (v) { return String(v.numero) === el.versao.value; }) || o.versoes[o.versoes.length - 1];
    var opcoes = {
      relatorio: valorMarcado('exportarRelatorio') || 'orcamento',
      nivel: Number(valorMarcado('exportarNivel')) || 4,
      separar: el.separar.checked,
      formato: valorMarcado('exportarFormato') || 'pdf'
    };
    salvarPrefs(opcoes);
    exportando = true;
    el.confirmar.disabled = true;
    // a janela do PDF abre já no clique, senão o navegador a bloqueia
    var janela = opcoes.formato === 'pdf' ? abrirJanela() : null;
    try {
      var servicos = todosServicos(versao.unidades || []);
      mesRelatorio = versao.referencia || '';
      var precisaAbrir = opcoes.relatorio === 'abcInsumos' || (opcoes.relatorio === 'orcamento' && opcoes.separar);
      var decompor = null;
      if (precisaAbrir) {
        await carregarSinapi(servicos, function (t) { status(t); });
        decompor = criarDecompositor();
      }
      status('Montando o relatório…');
      var doc = opcoes.relatorio === 'abcServicos' ? docAbcServicos(o, versao)
        : opcoes.relatorio === 'abcInsumos' ? docAbcInsumos(o, versao, decompor)
        : docOrcamento(o, versao, opcoes, decompor);
      Object.assign(doc, cabecalhoComum(o, versao, opcoes.relatorio));
      if (opcoes.formato === 'xlsx') {
        status('Gerando o Excel…');
        await baixarExcel(doc);
      } else {
        mostrarPdf(janela, doc);
      }
      modal.close();
    } catch (erro) {
      if (janela && !janela.closed) janela.close();
      status(erro.message || 'Não foi possível gerar o relatório.', 'erro');
    } finally {
      exportando = false;
      el.confirmar.disabled = false;
    }
  }

  function iniciar() {
    modal = document.getElementById('modalExportar');
    if (!modal) return;
    el = {
      orcamento: document.getElementById('exportarOrcamento'),
      opcoesOrcamento: document.getElementById('exportarOpcoesOrcamento'),
      legendaNivel: document.getElementById('exportarNivelLegenda'),
      separar: document.getElementById('exportarSeparar'),
      versao: document.getElementById('exportarVersao'),
      status: document.getElementById('exportarStatus'),
      confirmar: document.getElementById('btnConfirmarExportar')
    };
    modal.addEventListener('change', atualizarOpcoes);
    el.confirmar.addEventListener('click', exportar);
    document.getElementById('btnCancelarExportar').addEventListener('click', function () { modal.close(); });
    modal.addEventListener('click', function (ev) { if (ev.target === modal) modal.close(); });
  }

  window.Relatorios = { abrir: abrir };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', iniciar);
  else iniciar();
})();
