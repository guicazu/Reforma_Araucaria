/* Janela "Referência SINAPI do orçamento": define ou troca o mês da base SINAPI da versão ativa.
   A referência só muda por aqui. Com serviços SINAPI na versão, mostra antes a tabela de diferenças
   (preço atual x preço no mês escolhido) e pode guardar a versão atual, com os preços antigos,
   aplicando a troca numa versão nova. Serviços que não existem no mês escolhido, ou cuja unidade
   mudou, ficam com o preço atual e continuam marcados na tabela do orçamento.
   Usa funções do app.js (orcamentoAtivo, versaoAtiva, gerarVersao, salvar, renderTudo...). */
(function () {
  'use strict';

  var LOTE = 400; // códigos por consulta de preços
  var modal, el = {};
  var aoDefinir = null;
  var previa = null; // { mes, precos: Map(código -> novo preço) }
  var pedido = 0;

  function servicosSinapi(versao) {
    var lista = [];
    (versao.unidades || []).forEach(function (u) {
      (u.etapas || []).forEach(function (e) {
        (e.servicos || []).forEach(function (sv) { if (sv.catalogoTipo === 'sinapi') lista.push(sv); });
        (e.subEtapas || []).forEach(function (s) { (s.servicos || []).forEach(function (sv) { if (sv.catalogoTipo === 'sinapi') lista.push(sv); }); });
      });
    });
    return lista;
  }
  function codigo(sv) { return String(sv.codigo || sv.catalogoId || '').trim(); }
  function status(texto, classe) {
    el.status.textContent = texto || '';
    el.status.className = 'sinapi-status' + (classe ? ' ' + classe : '');
  }
  function pct(v) { return (v > 0 ? '+' : '') + (v * 100).toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + '%'; }

  async function calcular() {
    var o = orcamentoAtivo();
    if (!o) return;
    var versao = versaoAtiva(o);
    var mes = el.mes.value;
    var atual = versao.referencia || null;
    var svs = servicosSinapi(versao);
    var id = ++pedido;
    previa = null;
    el.previa.innerHTML = '';
    el.versaoLinha.hidden = true;
    el.aplicar.textContent = atual ? 'Aplicar ' + nomeReferencia(mes) : 'Definir ' + nomeReferencia(mes);
    if (!mes) { el.aplicar.disabled = true; return; }
    if (mes === atual && svs.every(function (sv) { return sv.referencia === mes; })) {
      el.aplicar.disabled = true;
      status('Esta já é a referência do orçamento.');
      return;
    }
    if (!svs.length) {
      el.aplicar.disabled = false;
      status(atual ? 'Não há serviços SINAPI nesta versão: só a referência muda.' : '');
      return;
    }
    el.aplicar.disabled = true;
    status('Buscando os preços de ' + nomeReferencia(mes) + '…');
    var codigos = Array.from(new Set(svs.map(codigo).filter(function (c) { return /^\d+$/.test(c); })));
    var novos = new Map();
    try {
      for (var i = 0; i < codigos.length; i += LOTE) {
        var r = await fetch('/api/sinapi/precos?mes=' + encodeURIComponent(mes) + '&codigos=' + codigos.slice(i, i + LOTE).join(','));
        var d = await r.json();
        if (!r.ok) throw new Error(d.erro === 'referencia_indisponivel' ? nomeReferencia(mes) + ' não está mais na base SINAPI.' : 'Não foi possível buscar os preços.');
        (d.composicoes || []).forEach(function (c) { novos.set(String(c.codigo), c); });
      }
    } catch (erro) {
      if (id === pedido) status(erro.message, 'erro');
      return;
    }
    if (id !== pedido) return; // trocou de mês no meio

    var precos = new Map();
    var linhas = codigos.map(function (cod) {
      var dele = svs.filter(function (sv) { return codigo(sv) === cod; });
      var sv0 = dele[0];
      var qtd = dele.reduce(function (s, sv) { return s + qtdServico(sv); }, 0);
      var precoAtual = num(sv0.valorUnitario) || 0;
      var c = novos.get(cod);
      var motivo = !c ? 'não existe em ' + nomeReferencia(mes)
        : !mesmaUnidade(c.unidade, sv0.unidadeMedida) ? 'unidade mudou (' + sv0.unidadeMedida + ' → ' + c.unidade + ')'
        : c.custo == null ? 'sem preço em ' + nomeReferencia(mes) : '';
      var novo = motivo ? null : c.custo;
      if (novo != null) precos.set(cod, novo);
      return { cod: cod, nome: sv0.nome, unidade: sv0.unidadeMedida, qtd: qtd, atual: precoAtual, novo: novo, motivo: motivo };
    });
    var totalAtual = linhas.reduce(function (s, l) { return s + l.qtd * l.atual; }, 0);
    var totalNovo = linhas.reduce(function (s, l) { return s + l.qtd * (l.novo == null ? l.atual : l.novo); }, 0);
    var mantidos = linhas.filter(function (l) { return l.motivo; });
    linhas.sort(function (a, b) { return Math.abs(b.qtd * ((b.novo == null ? b.atual : b.novo) - b.atual)) - Math.abs(a.qtd * ((a.novo == null ? a.atual : a.novo) - a.atual)); });

    var totalOrc = totalOrcamento(o);
    el.previa.innerHTML =
      '<p class="referencia-resumo">Serviços SINAPI: <strong>' + fmtBRL.format(totalAtual) + '</strong> → <strong>' + fmtBRL.format(totalNovo) + '</strong> (' + pct(totalAtual ? totalNovo / totalAtual - 1 : 0) + ')' +
        ' · orçamento: ' + fmtBRL.format(totalOrc) + ' → ' + fmtBRL.format(totalOrc - totalAtual + totalNovo) + '</p>' +
      (mantidos.length ? '<p class="referencia-aviso">' + mantidos.length + (mantidos.length === 1 ? ' serviço fica' : ' serviços ficam') + ' com o preço atual e marcado' + (mantidos.length === 1 ? '' : 's') + ' na tabela. Troque-' + (mantidos.length === 1 ? 'o' : 'os') + ' depois em Editar.</p>' : '') +
      '<div class="referencia-tabela-wrap"><table class="tabela referencia-tabela"><thead><tr><th>Código</th><th>Serviço</th><th class="col-num">Preço atual</th><th class="col-num">Novo</th><th class="col-num">Variação</th></tr></thead><tbody>' +
      linhas.map(function (l) {
        return '<tr' + (l.motivo ? ' class="mantido"' : '') + '><td class="codigo">' + esc(l.cod) + '</td><td>' + esc(l.nome) + (l.motivo ? '<small>' + esc(l.motivo) + '</small>' : '') + '</td>' +
          '<td class="col-num">' + fmtBRL.format(l.atual) + '</td><td class="col-num">' + (l.novo == null ? 'mantém' : fmtBRL.format(l.novo)) + '</td>' +
          '<td class="col-num">' + (l.novo == null || !l.atual ? '—' : pct(l.novo / l.atual - 1)) + '</td></tr>';
      }).join('') + '</tbody></table></div>';
    previa = { mes: mes, precos: precos };
    el.versaoLinha.hidden = false;
    el.aplicar.disabled = false;
    status('Confira antes de aplicar. Nada muda até você clicar em ' + el.aplicar.textContent + '.');
  }

  async function aplicar() {
    var o = orcamentoAtivo();
    var mes = el.mes.value;
    if (!o || !mes) return;
    el.aplicar.disabled = true;
    if (previa && previa.mes === mes && el.novaVersao.checked) {
      var numero = Math.max.apply(null, o.versoes.map(function (v) { return v.numero; })) + 1;
      var criada = await gerarVersao({ rotulo: 'Versão ' + numero + ' · SINAPI ' + nomeReferencia(mes) });
      if (!criada) { el.aplicar.disabled = false; return; }
    }
    var versao = versaoAtiva(o);
    if (previa && previa.mes === mes) {
      servicosSinapi(versao).forEach(function (sv) {
        var preco = previa.precos.get(codigo(sv));
        if (preco == null) return; // fica com o preço e o mês que tinha
        sv.valorUnitario = preco;
        sv.referencia = mes;
      });
    }
    versao.referencia = mes;
    salvar();
    renderTudo();
    modal.close();
    var continuar = aoDefinir;
    aoDefinir = null;
    if (continuar) continuar(mes);
  }

  function abrir(opcoes) {
    var o = orcamentoAtivo();
    if (!modal || !o || !modoEdicao) return;
    opcoes = opcoes || {};
    aoDefinir = opcoes.aoDefinir || null;
    el.ajuda.textContent = (opcoes.motivo ? opcoes.motivo + ' ' : '') +
      'Os preços SINAPI deste orçamento vêm do mês escolhido e não mudam sozinhos quando um mês novo é importado.';
    status('');
    el.previa.innerHTML = '';
    el.versaoLinha.hidden = true;
    window.ReferenciasSinapi.carregar(true).then(function (meses) {
      window.ReferenciasSinapi.preencherSelect(el.mes, referenciaOrcamento(o) || meses[0]);
      el.mes.hidden = false;
      if (!meses.length) {
        el.aplicar.disabled = true;
        status('Nenhum mês na base SINAPI. Importe um em Apoio → Base SINAPI.', 'erro');
      }
      if (!modal.open) modal.showModal();
      if (meses.length) calcular();
    });
  }

  function iniciar() {
    modal = document.getElementById('modalReferencia');
    if (!modal) return;
    el = {
      ajuda: document.getElementById('referenciaAjuda'),
      mes: document.getElementById('referenciaMes'),
      previa: document.getElementById('referenciaPrevia'),
      versaoLinha: document.getElementById('referenciaVersaoLinha'),
      novaVersao: document.getElementById('referenciaNovaVersao'),
      status: document.getElementById('referenciaStatus'),
      aplicar: document.getElementById('btnAplicarReferencia')
    };
    el.mes.addEventListener('change', calcular);
    el.aplicar.addEventListener('click', aplicar);
    document.getElementById('btnCancelarReferencia').addEventListener('click', function () { aoDefinir = null; modal.close(); });
    modal.addEventListener('close', function () { pedido++; });
    // botão "Definir"/"Alterar" do cabeçalho do orçamento
    document.addEventListener('click', function (ev) {
      if (ev.target.closest('[data-acao-referencia]')) abrir({});
    });
  }

  window.ReferenciaOrcamento = { abrir: abrir };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', iniciar);
  else iniciar();
})();
