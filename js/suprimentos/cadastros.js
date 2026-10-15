/* Cadastros de Suprimentos: fornecedores, condições de pagamento e, para administradores, os
   parâmetros (o que exige autorização, dados da empresa) e as alçadas de cada usuário.
   Supr.formFornecedor(f) é a janela de fornecedor usada também pelo cadastro rápido. */
(function () {
  'use strict';
  const S = window.Supr;
  const filtro = { aba: 'fornecedores', busca: '', inativos: false };
  const UFS = 'AC AL AP AM BA CE DF ES GO MA MT MS MG PA PB PR PE PI RJ RN RS RO RR SC SP SE TO'.split(' ');

  /* ---------- fornecedor ---------- */
  S.formFornecedor = (f) => {
    const v = (k) => S.esc(f && f[k] != null ? f[k] : '');
    return S.dialogo({
      titulo: f ? 'Fornecedor' : 'Novo fornecedor', tamanho: 'md', botao: 'Salvar',
      corpo: '<div class="grade">' +
        '<label class="campo largo">Razão social / nome<input data-c="nome" maxlength="200" value="' + v('nome') + '"></label>' +
        '<label class="campo">Nome fantasia<input data-c="nomeFantasia" maxlength="200" value="' + v('nomeFantasia') + '"></label>' +
        '<label class="campo">CNPJ ou CPF<input data-c="documento" inputmode="numeric" value="' + S.esc(f ? S.documento(f.documento) : '') + '"></label>' +
        '<label class="campo">Inscrição estadual<input data-c="inscricaoEstadual" maxlength="30" value="' + v('inscricaoEstadual') + '"></label>' +
        '<label class="campo">E-mail (pedidos e cotações)<input type="email" data-c="email" maxlength="200" value="' + v('email') + '"></label>' +
        '<label class="campo">Telefone / WhatsApp<input data-c="telefone" maxlength="40" value="' + v('telefone') + '"></label>' +
        '<label class="campo">Contato<input data-c="contato" maxlength="120" value="' + v('contato') + '"></label>' +
        '<label class="campo largo">Endereço<input data-c="endereco" maxlength="300" value="' + v('endereco') + '"></label>' +
        '<label class="campo">Cidade<input data-c="cidade" maxlength="120" value="' + v('cidade') + '"></label>' +
        '<label class="campo">UF<select data-c="uf"><option value=""></option>' + UFS.map((u) => '<option' + (f && f.uf === u ? ' selected' : '') + '>' + u + '</option>').join('') + '</select></label>' +
        '<label class="campo">CEP<input data-c="cep" inputmode="numeric" maxlength="10" value="' + v('cep') + '"></label>' +
        '<label class="campo largo">O que fornece<input data-c="categorias" maxlength="300" value="' + v('categorias') + '" placeholder="Ex.: concreto usinado, aço, agregados"></label>' +
        '<label class="campo largo">Dados bancários / PIX<input data-c="dadosBancarios" maxlength="500" value="' + v('dadosBancarios') + '"></label>' +
        '<label class="campo largo">Observações<textarea rows="2" data-c="observacoes" maxlength="1000">' + v('observacoes') + '</textarea></label>' +
        (f ? '<label class="check largo"><input type="checkbox" data-c="ativo"' + (f.ativo ? ' checked' : '') + '>Ativo (aparece nas cotações e pedidos)</label>' : '') + '</div>',
      aoAbrir: (corpo) => setTimeout(() => corpo.querySelector('[data-c="nome"]').focus(), 30),
      aoConfirmar: async (corpo) => {
        const d = {};
        corpo.querySelectorAll('[data-c]').forEach((x) => { d[x.dataset.c] = x.type === 'checkbox' ? x.checked : x.value; });
        if (!d.nome.trim()) { S.aviso('Informe a razão social.', 'erro'); return false; }
        if (f) { await S.put('fornecedores/' + f.id, d); S.aviso('Fornecedor salvo.'); return f.id; }
        const r = await S.post('fornecedores', d);
        S.aviso('Fornecedor cadastrado.');
        return r.id;
      }
    }).resultado;
  };

  /* ---------- condição de pagamento ---------- */
  function formCondicao(cond) {
    let parcelas = cond ? cond.parcelas.map((p) => ({ ...p })) : [{ dias: 30, percentual: 100 }];
    const desenhar = (corpo) => {
      corpo.querySelector('[data-parcelas]').innerHTML = parcelas.map((p, k) => '<div class="supr-barra" style="margin:0 0 6px">' +
        '<label class="campo" style="flex:1">Dias<input inputmode="numeric" data-dias="' + k + '" value="' + p.dias + '"></label>' +
        '<label class="campo" style="flex:1">Percentual (%)<input inputmode="decimal" data-pct="' + k + '" value="' + S.valorCampo(p.percentual, 2) + '"></label>' +
        (parcelas.length > 1 ? '<button type="button" class="btn-icon btn-danger" data-tirar="' + k + '" style="align-self:flex-end">' + S.ic('excluir') + '</button>' : '') + '</div>').join('');
      const soma = parcelas.reduce((s, p) => s + (Number(p.percentual) || 0), 0);
      corpo.querySelector('[data-soma]').innerHTML = 'Soma: <b class="' + (Math.abs(soma - 100) > 0.05 ? 'supr-negativo' : 'supr-positivo') + '">' + S.pct(soma) + '</b>';
    };
    return S.dialogo({
      titulo: cond ? 'Condição de pagamento' : 'Nova condição de pagamento', botao: 'Salvar',
      corpo: '<label class="campo">Descrição<input data-desc maxlength="120" value="' + S.esc(cond ? cond.descricao : '') + '" placeholder="Ex.: 30/60/90 dias"></label>' +
        '<p class="supr-dica" style="margin:12px 0 6px">Parcelas: dias contados da emissão da nota (0 = à vista).</p><div data-parcelas></div>' +
        '<div class="supr-barra"><button type="button" class="btn btn-ghost btn-sm" data-mais>' + S.ic('mais') + 'Parcela</button>' +
        '<button type="button" class="btn btn-ghost btn-sm" data-dividir>Dividir igual</button><span class="espaco"></span><span data-soma class="supr-dica"></span></div>',
      aoAbrir: (corpo) => {
        desenhar(corpo);
        corpo.addEventListener('input', (ev) => {
          if (ev.target.dataset.dias != null) parcelas[Number(ev.target.dataset.dias)].dias = parseInt(ev.target.value, 10) || 0;
          if (ev.target.dataset.pct != null) { parcelas[Number(ev.target.dataset.pct)].percentual = S.num(ev.target.value) || 0; desenharSoma(corpo); }
        });
        corpo.addEventListener('click', (ev) => {
          if (ev.target.closest('[data-mais]')) { const ult = parcelas[parcelas.length - 1]; parcelas.push({ dias: (ult ? ult.dias : 0) + 30, percentual: 0 }); desenhar(corpo); }
          if (ev.target.closest('[data-dividir]')) {
            const base = Math.floor(10000 / parcelas.length) / 100;
            parcelas.forEach((p, i) => { p.percentual = i === 0 ? S.arred(100 - base * (parcelas.length - 1), 2) : base; });
            desenhar(corpo);
          }
          const t = ev.target.closest('[data-tirar]');
          if (t) { parcelas.splice(Number(t.dataset.tirar), 1); desenhar(corpo); }
        });
      },
      aoConfirmar: async (corpo) => {
        const corpoReq = { descricao: corpo.querySelector('[data-desc]').value, parcelas };
        if (cond) await S.put('condicoes/' + cond.id, corpoReq); else await S.post('condicoes', corpoReq);
        S.aviso('Condição salva.');
        return true;
      }
    }).resultado;
    function desenharSoma(corpo) {
      const soma = parcelas.reduce((s, p) => s + (Number(p.percentual) || 0), 0);
      corpo.querySelector('[data-soma]').innerHTML = 'Soma: <b class="' + (Math.abs(soma - 100) > 0.05 ? 'supr-negativo' : 'supr-positivo') + '">' + S.pct(soma) + '</b>';
    }
  }

  /* ---------- tela ---------- */
  S.registrar('cadastros', {
    titulo: 'Cadastros de suprimentos', subtitulo: 'Fornecedores, condições de pagamento, parâmetros e alçadas de autorização', lista: true,
    render: async (c) => {
      const abas = [['fornecedores', 'Fornecedores'], ['condicoes', 'Condições de pagamento']].concat(S.isAdmin() ? [['parametros', 'Parâmetros'], ['alcadas', 'Alçadas']] : []);
      if (!abas.some((a) => a[0] === filtro.aba)) filtro.aba = 'fornecedores';
      const topo = () => '<div class="supr-abas">' + abas.map((a) => '<button type="button" data-aba="' + a[0] + '"' + (a[0] === filtro.aba ? ' class="ativo"' : '') + '>' + a[1] + '</button>').join('') + '</div>';
      let dados = null;

      async function abrir() {
        c.innerHTML = topo() + S.carregando();
        if (filtro.aba === 'fornecedores') dados = (await S.get('fornecedores?todos=1')).fornecedores;
        else if (filtro.aba === 'condicoes') dados = (await S.get('condicoes?todas=1')).condicoes;
        else if (filtro.aba === 'parametros') dados = (await S.get('configuracao')).parametros;
        else dados = await S.get('alcadas');
        if (c.vigente()) desenhar();
      }

      function desenhar() {
        let h = topo();
        if (filtro.aba === 'fornecedores') {
          const linhas = dados.filter((f) => (filtro.inativos || f.ativo) && S.combina(filtro.busca, [f.nome, f.nomeFantasia, f.documento, f.categorias, f.cidade, f.email]));
          h += '<div class="supr-barra">' + S.busca(filtro.busca, 'Nome, CNPJ, cidade ou o que fornece') +
            '<label class="check" style="display:inline-flex;gap:6px;align-items:center;font-size:12px"><input type="checkbox" data-inativos' + (filtro.inativos ? ' checked' : '') + '>Mostrar inativos</label>' +
            '<span class="espaco"></span>' + (S.podeEditar() ? S.botao('novo-forn', 'Novo fornecedor', { primario: true, icone: 'mais' }) : '') + '</div>' +
            S.tabela([
              { t: 'Fornecedor', v: (f) => S.esc(f.nome) + (f.nomeFantasia ? '<small>' + S.esc(f.nomeFantasia) + '</small>' : '') },
              { t: 'CNPJ/CPF', v: (f) => S.esc(S.documento(f.documento) || '—'), c: 'nowrap' },
              { t: 'Contato', v: (f) => S.esc([f.contato, f.telefone].filter(Boolean).join(' · ') || '—') + (f.email ? '<small>' + S.esc(f.email) + '</small>' : '') },
              { t: 'Cidade', v: (f) => S.esc([f.cidade, f.uf].filter(Boolean).join('/') || '—') },
              { t: 'Fornece', v: (f) => S.esc(f.categorias || '—') },
              { t: 'Pedidos', v: (f) => String(f.pedidos || 0), c: 'num' },
              { t: 'Comprado', v: (f) => S.moeda(f.valorComprado), c: 'num' },
              { t: '', v: (f) => (f.ativo ? '' : S.tag('Inativo', 'cinza')) + (S.podeEditar() ? '<button type="button" class="btn-icon btn-danger" data-excluir-forn="' + S.esc(f.id) + '" title="Excluir ou inativar">' + S.ic('excluir') + '</button>' : ''), c: 'acoes' }
            ], linhas, { id: (f) => f.id, vazio: dados.length ? 'Nenhum fornecedor com esse filtro.' : '<strong>Nenhum fornecedor</strong>Cadastre os fornecedores para cotar e comprar.' });
        } else if (filtro.aba === 'condicoes') {
          h += '<div class="supr-barra"><span class="supr-dica">As parcelas da condição viram o prazo dos títulos quando a nota é lançada.</span><span class="espaco"></span>' +
            (S.podeEditar() ? S.botao('nova-cond', 'Nova condição', { primario: true, icone: 'mais' }) : '') + '</div>' +
            S.tabela([
              { t: 'Descrição', v: (x) => S.esc(x.descricao) },
              { t: 'Parcelas', v: (x) => S.esc(S.textoParcelas(x.parcelas)) },
              { t: '', v: (x) => (x.ativo ? '' : S.tag('Inativa', 'cinza')) + (S.podeEditar() && x.ativo ? '<button type="button" class="btn-icon btn-danger" data-excluir-cond="' + S.esc(x.id) + '" title="Tirar da lista">' + S.ic('excluir') + '</button>' : ''), c: 'acoes' }
            ], dados, { id: (x) => x.id });
        } else if (filtro.aba === 'parametros') {
          const p = dados;
          const caixa = (k, rotulo, dica) => '<label class="check largo"><input type="checkbox" data-p="' + k + '"' + (p[k] === '1' ? ' checked' : '') + '>' + rotulo +
            (dica ? ' <span class="supr-dica">' + dica + '</span>' : '') + '</label>';
          h += '<div class="supr-form">' +
            '<p class="largo" style="margin:0;font-size:12.5px;font-weight:600;color:var(--tinta)">Autorizações</p>' +
            caixa('solicitacao_exige_autorizacao', 'Solicitação de compra exige autorização', '(item acima do saldo orçado ou fora do orçamento sempre exige)') +
            caixa('pedido_exige_autorizacao', 'Pedido de compra exige autorização') +
            caixa('contrato_exige_autorizacao', 'Contrato e aditivo exigem autorização') +
            caixa('medicao_exige_autorizacao', 'Medição exige autorização') +
            caixa('bloquear_acima_orcado', 'Bloquear solicitação acima do saldo orçado ou fora do orçamento', '(em vez de mandar para autorização)') +
            '<p class="largo" style="margin:8px 0 0;font-size:12.5px;font-weight:600;color:var(--tinta)">Empresa (cabeçalho do pedido e dos e-mails)</p>' +
            '<label class="duplo">Razão social<input data-p="empresa_nome" value="' + S.esc(p.empresa_nome) + '"></label>' +
            '<label>CNPJ<input data-p="empresa_documento" value="' + S.esc(S.documento(p.empresa_documento)) + '"></label>' +
            '<label class="largo">Endereço<input data-p="empresa_endereco" value="' + S.esc(p.empresa_endereco) + '"></label>' +
            '<label class="largo">Local de entrega padrão<input data-p="local_entrega_padrao" value="' + S.esc(p.local_entrega_padrao) + '" placeholder="Endereço da obra para os pedidos"></label></div>' +
            '<div class="supr-rodape"><button type="button" class="btn btn-primary" data-acao="salvar-param">' + S.ic('salvar') + 'Salvar parâmetros</button></div>';
        } else {
          const nomes = { solicitacao: 'Solicitações de compra', pedido: 'Pedidos de compra', contrato: 'Contratos e aditivos', medicao: 'Medições' };
          h += '<p class="supr-nota">Administradores autorizam tudo. Os demais usuários autorizam só o que estiver na alçada: tipo de documento e valor máximo (em branco = sem limite).</p>' +
            '<div class="supr-form"><label class="duplo">Usuário<select data-usuario><option value="">Escolha</option>' +
            dados.usuarios.filter((u) => !u.isAdmin).map((u) => '<option value="' + S.esc(u.email) + '">' + S.esc((u.nome || u.email) + ' · ' + u.email) + '</option>').join('') + '</select></label>' +
            '<label>Documento<select data-tipo>' + Object.keys(nomes).map((k) => '<option value="' + k + '">' + nomes[k] + '</option>').join('') + '</select></label>' +
            '<label>Valor máximo (R$)<input inputmode="decimal" data-limite placeholder="Sem limite"></label>' +
            '<label style="justify-content:flex-end"><button type="button" class="btn btn-primary" data-acao="salvar-alcada">' + S.ic('mais') + 'Definir alçada</button></label></div>' +
            S.tabela([
              { t: 'Usuário', v: (a) => S.esc(a.nome || a.email) + '<small>' + S.esc(a.email) + '</small>' },
              { t: 'Documento', v: (a) => S.esc(nomes[a.tipo] || a.tipo) },
              { t: 'Valor máximo', v: (a) => (a.valorLimite == null ? 'Sem limite' : S.moeda(a.valorLimite)), c: 'num' },
              { t: '', v: (a) => '<button type="button" class="btn-icon btn-danger" data-excluir-alcada="' + S.esc(a.id) + '">' + S.ic('excluir') + '</button>', c: 'acoes' }
            ], dados.alcadas, { vazio: 'Nenhuma alçada definida: só administradores autorizam.' });
        }
        c.innerHTML = h;
        const busca = c.querySelector('[data-busca]');
        if (busca) busca.addEventListener('input', (ev) => { filtro.busca = ev.target.value; const pos = ev.target.selectionStart; desenhar(); const b = c.querySelector('[data-busca]'); b.focus(); b.setSelectionRange(pos, pos); });
      }

      c.addEventListener('change', (ev) => { if (ev.target.matches('[data-inativos]')) { filtro.inativos = ev.target.checked; desenhar(); } });
      c.addEventListener('click', async (ev) => {
        const aba = ev.target.closest('[data-aba]');
        if (aba) { filtro.aba = aba.dataset.aba; filtro.busca = ''; abrir().catch(S.falhou); return; }
        try {
          const exf = ev.target.closest('[data-excluir-forn]');
          if (exf) {
            const f = dados.find((x) => x.id === exf.dataset.excluirForn);
            const r = await S.acao({ titulo: 'Excluir ' + f.nome, botao: 'Excluir', perigo: true, depois: false,
              texto: 'Fornecedor com cotação, pedido, nota ou contrato fica inativo (o histórico continua apontando para ele).',
              executar: () => S.del('fornecedores/' + f.id) });
            if (r) { S.aviso(r.inativado ? 'Fornecedor inativado.' : 'Fornecedor excluído.'); abrir(); }
            return;
          }
          const exc = ev.target.closest('[data-excluir-cond]');
          if (exc) { await S.del('condicoes/' + exc.dataset.excluirCond); S.aviso('Condição retirada da lista.'); abrir(); return; }
          const exa = ev.target.closest('[data-excluir-alcada]');
          if (exa) { await S.del('alcadas/' + exa.dataset.excluirAlcada); S.aviso('Alçada removida.'); abrir(); return; }
          const b = ev.target.closest('[data-acao]');
          if (!b) return;
          if (b.dataset.acao === 'novo-forn') { if (await S.formFornecedor(null)) abrir(); }
          else if (b.dataset.acao === 'nova-cond') { if (await formCondicao(null)) abrir(); }
          else if (b.dataset.acao === 'salvar-param') {
            const parametros = {};
            c.querySelectorAll('[data-p]').forEach((x) => { parametros[x.dataset.p] = x.type === 'checkbox' ? (x.checked ? '1' : '0') : x.value.trim(); });
            parametros.empresa_documento = parametros.empresa_documento.replace(/\D/g, '');
            const r = await S.put('parametros', { parametros });
            S.estado.config.parametros = r.parametros;
            S.aviso('Parâmetros salvos.');
          } else if (b.dataset.acao === 'salvar-alcada') {
            const email = c.querySelector('[data-usuario]').value;
            if (!email) { S.aviso('Escolha o usuário.', 'erro'); return; }
            const lim = c.querySelector('[data-limite]').value.trim();
            await S.post('alcadas', { email, tipo: c.querySelector('[data-tipo]').value, valorLimite: lim ? S.num(lim) : null });
            S.aviso('Alçada definida.');
            abrir();
          }
        } catch (e) { S.falhou(e); }
      });
      S.aoAbrirLinha(c, async (id) => {
        if (filtro.aba === 'fornecedores' && S.podeEditar()) { if (await S.formFornecedor(dados.find((f) => f.id === id))) abrir(); }
        if (filtro.aba === 'condicoes' && S.podeEditar()) { if (await formCondicao(dados.find((x) => x.id === id))) abrir(); }
      });
      await abrir();
    }
  });
})();
