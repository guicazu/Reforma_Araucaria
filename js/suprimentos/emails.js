/* Suprimentos › Cadastros › Parâmetros › E-mails aos fornecedores: endereço e nome do remetente,
   cópia oculta, rodapé e os textos do convite de cotação e do pedido de compra, com os campos
   {{...}} que o sistema troca pelos dados de cada envio. A prévia e as regras dos textos vêm de
   js/email-modelos.js, o mesmo arquivo que o servidor usa para montar o e-mail. Só administradores. */
(function () {
  'use strict';
  const S = window.Supr;
  let M = null;   // js/email-modelos.js, carregado na primeira vez
  let telaSuja = () => false;
  window.addEventListener('beforeunload', (ev) => { if (telaSuja()) { ev.preventDefault(); ev.returnValue = ''; } });
  const carregarModelos = () => (M ? Promise.resolve(M) : import('/js/email-modelos.js').then((m) => { M = m; return m; }));

  // onde cada campo fica e o que vale nele (tipo null = serve aos dois e-mails)
  const CAMPOS = {
    email_remetente_nome: { tipo: null, onde: 'linha' },
    email_rodape: { tipo: null, onde: 'rodape' },
    email_cotacao_assunto: { tipo: 'cotacao', onde: 'assunto' },
    email_cotacao_corpo: { tipo: 'cotacao', onde: 'corpo' },
    email_pedido_assunto: { tipo: 'pedido', onde: 'assunto' },
    email_pedido_corpo: { tipo: 'pedido', onde: 'corpo' }
  };

  S.registrar('emails', {
    titulo: 'Cadastros de suprimentos', subtitulo: 'Parâmetros › E-mails aos fornecedores', menu: 'cadastros',
    render: async (c) => {
      if (!S.isAdmin()) { c.innerHTML = '<div class="supr-nota">Só administradores configuram os e-mails.</div>'; return; }
      const [modelos, cfg] = await Promise.all([carregarModelos(), S.get('configuracao')]);
      if (!c.vigente()) return;
      const p = cfg.parametros;
      const usuario = cfg.usuario;
      let tipo = 'cotacao';
      let ultimoCampo = null;
      let sujo = false;
      const v = (k) => S.esc(p[k] == null ? '' : p[k]);
      const editor = (t) => '<div class="eml-editor" data-editor="' + t + '"' + (t === tipo ? '' : ' hidden') + '>' +
        '<label class="campo">Assunto<input data-p="email_' + t + '_assunto" maxlength="200" value="' + v('email_' + t + '_assunto') + '"></label>' +
        '<p class="eml-erros" data-erros="email_' + t + '_assunto" hidden></p>' +
        '<label class="campo">Texto do e-mail<textarea data-p="email_' + t + '_corpo" rows="18" maxlength="6000" spellcheck="true">' + v('email_' + t + '_corpo') + '</textarea></label>' +
        '<p class="eml-erros" data-erros="email_' + t + '_corpo" hidden></p>' +
        '<div class="supr-barra"><button type="button" class="btn btn-ghost btn-sm" data-restaurar="' + t + '">' + S.ic('versoes') + 'Restaurar texto padrão</button>' +
        '<span class="supr-dica">' + (t === 'pedido' ? 'O PDF do pedido vai sempre em anexo.' : 'O botão leva ao portal, onde o fornecedor responde sem login.') + '</span></div></div>';

      c.innerHTML = S.cabecalho({ titulo: 'E-mails aos fornecedores',
        sub: 'Textos do convite de cotação e do pedido de compra. Os campos entre chaves, como {{fornecedor.nome}}, são trocados pelos dados de cada envio.' }) +
        S.secao('Envio', '<div class="supr-form">' +
          '<label class="duplo">E-mail de envio<input type="email" data-p="email_remetente" value="' + v('email_remetente') + '" placeholder="contato@cazu.com.br">' +
          '<span class="supr-dica">Precisa ser do domínio verificado no Resend. Quem entra no sistema com e-mail desse domínio envia com o próprio endereço.</span></label>' +
          '<label class="duplo">Nome do remetente<input data-p="email_remetente_nome" maxlength="200" value="' + v('email_remetente_nome') + '">' +
          '<span class="supr-dica">Como o fornecedor vê quem mandou. Ex.: {{usuario.nome}} ({{empresa.nome}}).</span></label>' +
          '<p class="eml-erros largo" data-erros="email_remetente_nome" hidden></p>' +
          '<label class="check largo"><input type="checkbox" data-p="email_copia_remetente"' + (p.email_copia_remetente === '1' ? ' checked' : '') + '>Mandar cópia oculta para quem enviou ' +
          '<span class="supr-dica">(o e-mail enviado pelo sistema não aparece nos “Enviados” da pessoa)</span></label>' +
          '<p class="supr-dica largo" style="margin:0">As respostas do fornecedor vão sempre para o e-mail de login de quem enviou (“Responder para”).</p>' +
          '<label class="largo">Rodapé (nos dois e-mails)<textarea data-p="email_rodape" rows="2" maxlength="600">' + v('email_rodape') + '</textarea></label>' +
          '<p class="eml-erros largo" data-erros="email_rodape" hidden></p></div>') +
        S.secao('Textos', S.chips([['cotacao', modelos.TIPOS.cotacao.nome], ['pedido', modelos.TIPOS.pedido.nome]], tipo, 'tipo-email') +
          '<div class="eml-grade"><div>' + editor('cotacao') + editor('pedido') + '</div>' +
          '<div class="eml-previa"><p class="eml-previa-rot">Prévia com dados de exemplo</p><dl class="eml-cab" data-cab></dl>' +
          '<iframe title="Prévia do e-mail" sandbox="allow-same-origin" data-previa></iframe></div></div>') +
        S.secao('Campos e regras', '<div class="eml-ajuda"><div data-campos></div><div class="eml-regras"><p><b>Como escrever</b></p><ul>' +
          '<li>Clique num campo para colocá-lo onde está o cursor (no assunto, no texto, no nome do remetente ou no rodapé).</li>' +
          '<li><code>{{fornecedor.contato|fornecedor.nome}}</code>: usa o segundo quando o primeiro estiver vazio.</li>' +
          '<li><code>[[ ... ]]</code>: o trecho some se algum campo dentro dele estiver vazio. Ex.: <code>[[Responda até {{cotacao.prazo}}.]]</code></li>' +
          '<li><code>**texto**</code> fica em negrito.</li>' +
          '<li>Linha em branco começa um novo parágrafo; quebra simples continua no mesmo parágrafo, na linha de baixo.</li>' +
          '<li><code>{{itens}}</code> e <code>{{botao}}</code> só valem no texto do e-mail, em linha própria.</li>' +
          '<li>Campo em branco volta ao texto padrão ao salvar.</li></ul></div></div>') +
        // botões sempre à vista, no pé da tela (os textos são longos)
        '<div class="eml-barra"><span class="eml-sujo" data-sujo hidden>Alterações não salvas</span><span class="espaco"></span>' +
          S.botao('teste', 'Enviar teste para mim', { icone: 'email', titulo: 'Manda o e-mail aberto, com os textos da tela e dados de exemplo, para o seu e-mail' }) +
          S.botao('salvar', 'Salvar', { primario: true, icone: 'salvar' }) + '</div>';

      // ---------- campos disponíveis (do e-mail que está aberto) ----------
      function desenharCampos() {
        c.querySelector('[data-campos]').innerHTML = modelos.camposDoTipo(tipo, 'corpo').map((g) => '<div class="eml-grupo"><p>' + S.esc(g.nome) + '</p>' +
          g.campos.map((x) => '<button type="button" class="eml-campo" data-inserir="' + S.esc(x.chave) + '" title="' + S.esc(x.descricao + (x.exemplo ? ' · ex.: ' + x.exemplo : '')) + '">' +
            '<code>{{' + S.esc(x.chave) + '}}</code><span>' + S.esc(x.descricao) + '</span></button>').join('') + '</div>').join('');
      }

      // ---------- leitura, validação e prévia ----------
      function ler() {
        const r = {};
        c.querySelectorAll('[data-p]').forEach((x) => { r[x.dataset.p] = x.type === 'checkbox' ? (x.checked ? '1' : '0') : x.value; });
        return r;
      }
      function validarTudo(valores) {
        let total = 0;
        for (const k of Object.keys(CAMPOS)) {
          const erros = modelos.validar(valores[k], CAMPOS[k].tipo, CAMPOS[k].onde);
          const el = c.querySelector('[data-erros="' + k + '"]');
          if (el) { el.hidden = !erros.length; el.textContent = erros.length ? 'Corrija: ' + erros.join('; ') + '.' : ''; }
          c.querySelector('[data-p="' + k + '"]').classList.toggle('invalido', erros.length > 0);
          total += erros.length;
        }
        return total;
      }
      function desenharPrevia() {
        const valores = ler();
        validarTudo(valores);
        const dados = modelos.exemplo(tipo, { nome: usuario.nome, email: usuario.email },
          { nome: p.empresa_nome, documento: p.empresa_documento, endereco: p.empresa_endereco });
        const m = modelos.montarEmail(tipo, valores, dados);
        const r = modelos.remetente(valores.email_remetente || modelos.PADROES.email_remetente, usuario.email, m.nomeRemetente);
        c.querySelector('[data-cab]').innerHTML = '<dt>De</dt><dd>' + S.esc(r.from) + '</dd>' +
          '<dt>Para</dt><dd>' + S.esc(dados.campos['fornecedor.email']) + '</dd>' +
          (r.responderPara ? '<dt>Responder para</dt><dd>' + S.esc(r.responderPara) + '</dd>' : '') +
          (valores.email_copia_remetente === '1' && r.responderPara ? '<dt>Cópia oculta</dt><dd>' + S.esc(r.responderPara) + '</dd>' : '') +
          '<dt>Assunto</dt><dd><b>' + S.esc(m.assunto) + '</b></dd>' + (tipo === 'pedido' ? '<dt>Anexo</dt><dd>Pedido-35.pdf</dd>' : '');
        const fr = c.querySelector('[data-previa]');
        fr.onload = () => { try { fr.style.height = Math.max(300, fr.contentDocument.documentElement.scrollHeight + 4) + 'px'; } catch (e) { /* sem acesso */ } };
        fr.srcdoc = '<!doctype html><html><head><meta charset="utf-8"><style>body{margin:16px;background:#fff}</style></head><body>' + m.html + '</body></html>';
      }
      let timer = null;
      const agendarPrevia = () => { clearTimeout(timer); timer = setTimeout(desenharPrevia, 150); };
      const marcarSujo = (s) => { sujo = s; c.querySelector('[data-sujo]').hidden = !s; };

      c.addEventListener('focusin', (ev) => { if (ev.target.matches('input[data-p]:not([type=checkbox]):not([type=email]), textarea[data-p]')) ultimoCampo = ev.target; });
      c.addEventListener('input', (ev) => { if (ev.target.matches('[data-p]')) { marcarSujo(true); agendarPrevia(); } });
      c.addEventListener('change', (ev) => { if (ev.target.matches('[data-p]')) { marcarSujo(true); agendarPrevia(); } });
      c.addEventListener('click', async (ev) => {
        const chip = ev.target.closest('[data-chips="tipo-email"] [data-valor]');
        if (chip) {
          tipo = chip.dataset.valor;
          c.querySelectorAll('[data-chips="tipo-email"] [data-valor]').forEach((b) => b.classList.toggle('ativo', b === chip));
          c.querySelectorAll('[data-editor]').forEach((e) => { e.hidden = e.dataset.editor !== tipo; });
          if (ultimoCampo && ultimoCampo.closest('[data-editor]')) ultimoCampo = null;
          desenharCampos();
          desenharPrevia();
          return;
        }
        const ins = ev.target.closest('[data-inserir]');
        if (ins) {
          const alvo = ultimoCampo && !ultimoCampo.closest('[hidden]') ? ultimoCampo : c.querySelector('[data-p="email_' + tipo + '_corpo"]');
          const bloco = ins.dataset.inserir === 'itens' || ins.dataset.inserir === 'botao';
          const texto = bloco ? '\n\n{{' + ins.dataset.inserir + '}}\n\n' : '{{' + ins.dataset.inserir + '}}';
          const ini = alvo.selectionStart == null ? alvo.value.length : alvo.selectionStart;
          const fim = alvo.selectionEnd == null ? ini : alvo.selectionEnd;
          alvo.setRangeText(texto, ini, fim, 'end');
          alvo.focus();
          marcarSujo(true);
          desenharPrevia();
          return;
        }
        const rest = ev.target.closest('[data-restaurar]');
        if (rest) {
          const t = rest.dataset.restaurar;
          c.querySelector('[data-p="email_' + t + '_assunto"]').value = modelos.PADROES['email_' + t + '_assunto'];
          c.querySelector('[data-p="email_' + t + '_corpo"]').value = modelos.PADROES['email_' + t + '_corpo'];
          marcarSujo(true);
          desenharPrevia();
          S.aviso('Texto padrão de volta. Salve para manter.');
          return;
        }
        const b = ev.target.closest('[data-acao]');
        if (!b) return;
        const valores = ler();
        if (validarTudo(valores)) { S.aviso('Há campos com erro nos textos: veja as mensagens em vermelho.', 'erro'); return; }
        b.disabled = true;
        try {
          if (b.dataset.acao === 'salvar') {
            const r = await S.put('parametros', { parametros: valores });
            Object.assign(p, r.parametros);
            S.estado.config.parametros = r.parametros;
            // o que ficou em branco voltou ao padrão
            for (const k of Object.keys(CAMPOS).concat(['email_remetente'])) c.querySelector('[data-p="' + k + '"]').value = r.parametros[k];
            marcarSujo(false);
            desenharPrevia();
            S.aviso('E-mails salvos.');
          } else if (b.dataset.acao === 'teste') {
            const r = await S.post('parametros/email-teste', { tipo, parametros: valores });
            S.aviso(r.tipo + ' de teste enviado para ' + r.destinatario + '.');
          }
        } catch (e) { S.falhou(e); }
        b.disabled = false;
      });
      telaSuja = () => sujo && c.isConnected;

      desenharCampos();
      desenharPrevia();
    }
  });
})();
