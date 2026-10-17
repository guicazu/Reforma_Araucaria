// Modelos dos e-mails aos fornecedores (convite de cotação e pedido de compra): textos padrão, campos
// disponíveis e a montagem do e-mail. O mesmo arquivo serve a tela de configuração (prévia) e o
// servidor (envio), para a prévia sair igual ao e-mail.
//
// Regras dos textos:
//   {{campo}}            troca pelo dado do envio (ex.: {{fornecedor.nome}})
//   {{a|b}}              usa b quando a estiver vazio (ex.: {{fornecedor.contato|fornecedor.nome}})
//   [[ ... ]]            o trecho some se algum campo dentro dele estiver vazio
//   **texto**            negrito
//   linha em branco      novo parágrafo; quebra simples vira quebra de linha
//   {{itens}} {{botao}}  blocos: tabela dos itens e o botão com o link (só no texto do e-mail)

export const TIPOS = {
  cotacao: { nome: 'Convite de cotação', botao: 'Responder cotação' },
  pedido: { nome: 'Pedido de compra', botao: 'Confirmar recebimento do pedido' }
};

export const PADROES = {
  email_remetente: 'contato@cazu.com.br',
  email_remetente_nome: '{{usuario.nome}} ({{empresa.nome}})',
  email_copia_remetente: '1',
  email_rodape: 'Enviado por {{usuario.nome}} ({{usuario.email}}) pelo sistema de compras da {{empresa.nome}}. Para falar com quem enviou, basta responder este e-mail.',
  email_cotacao_assunto: 'Cotação nº {{cotacao.numero}} — {{empresa.nome}}',
  email_cotacao_corpo: [
    'Olá, {{fornecedor.contato|fornecedor.nome}}.',
    '',
    'A {{empresa.nome}} pede sua proposta para os itens abaixo, da obra {{obra.nome}}[[, até **{{cotacao.prazo}}**]].',
    '',
    '{{itens}}',
    '',
    '{{botao}}',
    '',
    'Pelo link você informa preço, marca, prazo de entrega, frete e condição de pagamento, sem precisar de cadastro.[[',
    '',
    'Observações: {{cotacao.observacoes}}]]',
    '',
    'Obrigado,',
    '{{usuario.nome}}',
    '{{empresa.nome}}'
  ].join('\n'),
  email_pedido_assunto: 'Pedido de compra nº {{pedido.numero}} — {{empresa.nome}}',
  email_pedido_corpo: [
    'Olá, {{fornecedor.contato|fornecedor.nome}}.',
    '',
    'Segue o pedido de compra nº {{pedido.numero}} da {{empresa.nome}} para a obra {{obra.nome}}. O PDF vai em anexo.',
    '',
    '{{itens}}',
    '',
    'Valor total: **{{pedido.valor}}**',
    'Entrega até: **{{pedido.entrega}}**[[',
    'Local de entrega: {{pedido.local}}]]',
    'Pagamento: {{pedido.pagamento}}[[',
    'Observações: {{pedido.observacoes}}]]',
    '',
    '{{botao}}',
    '',
    'Por favor, informe o número do pedido na nota fiscal.',
    '',
    'Obrigado,',
    '{{usuario.nome}}',
    '{{empresa.nome}}'
  ].join('\n')
};
export const CHAVES = Object.keys(PADROES);

// campos por grupo: [chave, descrição, exemplo]
const COMUNS = [
  ['Quem envia', [
    ['usuario.nome', 'Nome de quem está enviando', 'Carlos Silva'],
    ['usuario.primeiroNome', 'Primeiro nome de quem envia', 'Carlos'],
    ['usuario.email', 'E-mail de login de quem envia', 'carlos@exemplo.com.br']
  ]],
  ['Empresa', [
    ['empresa.nome', 'Razão social (Parâmetros)', 'Cazú Projetos e Construções'],
    ['empresa.cnpj', 'CNPJ (Parâmetros)', '12.345.678/0001-90'],
    ['empresa.endereco', 'Endereço (Parâmetros)', 'Rua das Araucárias, 120 – São Paulo/SP']
  ]],
  ['Fornecedor', [
    ['fornecedor.nome', 'Razão social', 'Concreteira Boa Massa Ltda'],
    ['fornecedor.fantasia', 'Nome fantasia', 'Boa Massa'],
    ['fornecedor.contato', 'Pessoa de contato', 'Marcos'],
    ['fornecedor.email', 'E-mail do fornecedor', 'vendas@boamassa.com.br']
  ]],
  ['Obra', [
    ['obra.nome', 'Nome da obra', 'Fundamental 1 - Colégio Araucária'],
    ['obra.codigo', 'Código do orçamento', 'ORC-2026-001']
  ]]
];
const PROPRIOS = {
  cotacao: ['Cotação', [
    ['cotacao.numero', 'Número da cotação', '12'],
    ['cotacao.prazo', 'Prazo para responder', '21/10/2026'],
    ['cotacao.qtdItens', 'Quantidade de itens', '2'],
    ['cotacao.observacoes', 'Observações da cotação', 'Entrega na obra das 7h às 16h.']
  ]],
  pedido: ['Pedido', [
    ['pedido.numero', 'Número do pedido', '35'],
    ['pedido.data', 'Data do pedido', '16/10/2026'],
    ['pedido.valor', 'Valor total', 'R$ 6.546,00'],
    ['pedido.entrega', 'Entrega até', '23/10/2026'],
    ['pedido.local', 'Local de entrega', 'Rua das Araucárias, 120 – Obra Colégio'],
    ['pedido.pagamento', 'Condição de pagamento', '30/60 dias'],
    ['pedido.frete', 'Frete (CIF ou FOB)', 'CIF (incluso)'],
    ['pedido.observacoes', 'Observações do pedido', 'Descarregar no portão 2.']
  ]]
};
const BLOCOS = ['Blocos', [
  ['itens', 'Tabela com os itens (descrição e quantidade; no pedido, também preço e total)', ''],
  ['botao', 'Botão com o link do portal do fornecedor', ''],
  ['link', 'O endereço do link, em texto', 'https://araucaria.cazu.com.br/portal-fornecedor?t=…']
]];

// grupos de campos que valem para o tipo; texto = assunto/remetente (sem blocos de tabela e botão)
export function camposDoTipo(tipo, onde) {
  const grupos = COMUNS.slice();
  if (PROPRIOS[tipo]) grupos.push(PROPRIOS[tipo]);
  if (onde === 'corpo') grupos.push(BLOCOS);
  else if (onde !== 'linha') grupos.push(['Blocos', BLOCOS[1].filter((c) => c[0] === 'link')]);
  return grupos.map(([nome, campos]) => ({ nome, campos: campos.map(([chave, descricao, exemplo]) => ({ chave, descricao, exemplo })) }));
}
function permitidos(tipo, onde) {
  const s = new Set();
  for (const g of camposDoTipo(tipo, onde)) for (const c of g.campos) s.add(c.chave);
  return s;
}
// campos válidos em todos os tipos (remetente e rodapé valem para os dois)
function permitidosComuns(onde) {
  const a = permitidos('cotacao', onde), b = permitidos('pedido', onde);
  return new Set([...a].filter((x) => b.has(x)));
}

/* ---------- validação ---------- */
const RE_CAMPO = /\{\{\s*([\w.]+(?:\s*\|\s*[\w.]+)*)\s*\}\}/g;
// tipo: 'cotacao' | 'pedido' | null (comum aos dois); onde: 'linha' (remetente), 'assunto', 'corpo', 'rodape'
export function validar(texto, tipo, onde) {
  const erros = [];
  const ok = tipo ? permitidos(tipo, onde) : permitidosComuns(onde);
  const s = String(texto || '');
  const vistos = new Set();
  for (const m of s.matchAll(RE_CAMPO)) {
    for (const nome of m[1].split('|').map((x) => x.trim())) {
      if (ok.has(nome) || vistos.has(nome)) continue;
      vistos.add(nome);
      erros.push(nome === 'itens' || nome === 'botao' ? `{{${nome}}} só pode ser usado no texto do e-mail` : `campo desconhecido {{${nome}}}`);
    }
  }
  const sobra = s.replace(RE_CAMPO, '');
  if (/\{\{|\}\}/.test(sobra)) erros.push('há chaves {{ }} sem par');
  const abre = (s.match(/\[\[/g) || []).length, fecha = (s.match(/\]\]/g) || []).length;
  if (abre !== fecha) erros.push('há colchetes [[ ]] sem par');
  return erros;
}

/* ---------- montagem ---------- */
function esc(v) {
  return String(v == null ? '' : v).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
function valorDe(dados, expr) {
  for (const nome of expr.split('|').map((x) => x.trim())) {
    const v = dados.campos[nome];
    if (v != null && String(v).trim() !== '') return String(v);
  }
  return '';
}
// [[ ... ]] some quando algum campo dentro dele está vazio
function condicionais(texto, dados) {
  return String(texto || '').replace(/\[\[([\s\S]*?)\]\]/g, (_, dentro) => {
    for (const m of dentro.matchAll(RE_CAMPO)) {
      if (m[1].trim() === 'itens' || m[1].trim() === 'botao') continue;
      if (!valorDe(dados, m[1])) return '';
    }
    return dentro;
  });
}
// uma linha de texto puro (assunto, nome do remetente)
export function linha(texto, dados) {
  return condicionais(texto, dados).replace(RE_CAMPO, (_, expr) => valorDe(dados, expr))
    .replace(/\*\*/g, '').replace(/\s*\n\s*/g, ' ').replace(/\s{2,}/g, ' ').trim();
}

const COR = { texto: '#27272a', suave: '#71717a', borda: '#e4e4e7', tinta: '#18181b' };
function tabelaItens(dados) {
  const comPreco = dados.itens.some((i) => i.preco != null);
  const th = (t, dir) => `<th style="padding:6px 8px;border-bottom:1px solid ${COR.borda};text-align:${dir || 'left'};font-size:12px;color:${COR.suave};font-weight:600">${t}</th>`;
  const td = (t, dir) => `<td style="padding:6px 8px;border-bottom:1px solid ${COR.borda};text-align:${dir || 'left'};vertical-align:top">${t}</td>`;
  return `<table role="presentation" style="border-collapse:collapse;width:100%;font-size:13px;margin:4px 0 14px"><thead><tr>` +
    th('Item') + th('Quantidade', 'right') + (comPreco ? th('Preço unit.', 'right') + th('Total', 'right') : '') + '</tr></thead><tbody>' +
    dados.itens.map((i) => '<tr>' + td(esc(i.descricao)) + td(esc(i.quantidade) + ' ' + esc(i.unidade || ''), 'right') +
      (comPreco ? td(esc(i.preco || ''), 'right') + td(esc(i.total || ''), 'right') : '') + '</tr>').join('') + '</tbody></table>';
}
function botao(dados) {
  if (!dados.link) return '';
  return `<p style="margin:20px 0"><a href="${esc(dados.link)}" style="display:inline-block;background:${COR.tinta};color:#ffffff;padding:11px 18px;border-radius:6px;text-decoration:none;font-weight:bold">${esc(dados.rotuloBotao || 'Abrir')}</a></p>`;
}
function paragrafoHtml(texto, dados) {
  const t = texto.replace(/^\n+|\n+$/g, '');
  if (!t.trim()) return '';
  let h = esc(t).replace(RE_CAMPO, (_, expr) => esc(valorDe(dados, expr)));
  h = h.replace(/\*\*([\s\S]+?)\*\*/g, '<b>$1</b>').replace(/\n/g, '<br>');
  return `<p style="margin:0 0 12px">${h}</p>`;
}
const RE_BLOCO = /(\{\{\s*(?:itens|botao)\s*\}\})/;
export function corpoHtml(texto, dados) {
  const s = condicionais(texto, dados).replace(/\r\n?/g, '\n');
  return s.split(/\n[ \t]*\n/).map((par) => par.split(RE_BLOCO).map((parte) => {
    const bloco = /^\{\{\s*(itens|botao)\s*\}\}$/.exec(parte);
    if (bloco) return bloco[1] === 'itens' ? tabelaItens(dados) : botao(dados);
    return paragrafoHtml(parte, dados);
  }).join('')).join('');
}
export function corpoTexto(texto, dados) {
  const s = condicionais(texto, dados).replace(/\r\n?/g, '\n');
  return s.replace(/\{\{\s*itens\s*\}\}/g, dados.itens.map((i) => `- ${i.descricao}: ${i.quantidade} ${i.unidade || ''}` +
    (i.preco ? ` x ${i.preco} = ${i.total}` : '')).join('\n'))
    .replace(/\{\{\s*botao\s*\}\}/g, dados.link ? `${dados.rotuloBotao}: ${dados.link}` : '')
    .replace(RE_CAMPO, (_, expr) => valorDe(dados, expr)).replace(/\*\*/g, '').replace(/\n{3,}/g, '\n\n').trim();
}

// modelos: os parâmetros email_* (o que faltar usa o padrão); dados: saída de dadosDoEnvio
export function montarEmail(tipo, modelos, dados) {
  const m = (k) => (modelos && modelos[k] != null && String(modelos[k]).trim() !== '' ? modelos[k] : PADROES[k]);
  const rodape = linha(m('email_rodape'), dados);
  const html = `<div style="font-family:Arial,Helvetica,sans-serif;max-width:620px;margin:0 auto;color:${COR.texto};font-size:14px;line-height:1.55">` +
    corpoHtml(m(`email_${tipo}_corpo`), dados) +
    (rodape ? `<p style="margin:24px 0 0;padding-top:12px;border-top:1px solid ${COR.borda};color:${COR.suave};font-size:12px">${esc(rodape)}</p>` : '') + '</div>';
  return {
    assunto: linha(m(`email_${tipo}_assunto`), dados) || TIPOS[tipo].nome,
    nomeRemetente: linha(m('email_remetente_nome'), dados),
    html,
    texto: corpoTexto(m(`email_${tipo}_corpo`), dados) + (rodape ? '\n\n--\n' + rodape : '')
  };
}

/* ---------- dados de cada envio ---------- */
const moeda = (v) => 'R$ ' + (Number(v) || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const qtd = (v) => (Number(v) || 0).toLocaleString('pt-BR', { maximumFractionDigits: 4 });
const dataBr = (d) => (d ? String(d).slice(0, 10).split('-').reverse().join('/') : '');
function cnpj(d) {
  const s = String(d || '').replace(/\D/g, '');
  return s.length === 14 ? s.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5') : s;
}
const FRETES = { CIF: 'CIF (incluso)', FOB: 'FOB (por conta do comprador)' };

// { usuario: {nome, email}, empresa: {nome, documento, endereco}, fornecedor, obra, cotacao | pedido, itens, link }
export function dadosDoEnvio(tipo, o) {
  const u = o.usuario || {}, e = o.empresa || {}, f = o.fornecedor || {}, ob = o.obra || {};
  const campos = {
    'usuario.nome': u.nome || u.email || '', 'usuario.primeiroNome': String(u.nome || '').trim().split(/\s+/)[0] || '', 'usuario.email': u.email || '',
    'empresa.nome': e.nome || '', 'empresa.cnpj': cnpj(e.documento), 'empresa.endereco': e.endereco || '',
    'fornecedor.nome': f.nome || '', 'fornecedor.fantasia': f.nomeFantasia || '', 'fornecedor.contato': f.contato || '', 'fornecedor.email': f.email || '',
    'obra.nome': ob.nome || '', 'obra.codigo': ob.codigo || '',
    link: o.link || ''
  };
  let itens;
  if (tipo === 'cotacao') {
    const c = o.cotacao || {};
    Object.assign(campos, { 'cotacao.numero': c.numero != null ? String(c.numero) : '', 'cotacao.prazo': dataBr(c.prazoResposta),
      'cotacao.qtdItens': String((o.itens || []).length), 'cotacao.observacoes': c.observacoes || '' });
    itens = (o.itens || []).map((i) => ({ descricao: i.descricao, unidade: i.unidade, quantidade: qtd(i.quantidade) }));
  } else {
    const p = o.pedido || {};
    Object.assign(campos, { 'pedido.numero': p.numero != null ? String(p.numero) : '', 'pedido.data': dataBr(p.data), 'pedido.valor': moeda(p.valorTotal),
      'pedido.entrega': dataBr(p.dataEntrega), 'pedido.local': p.localEntrega || '', 'pedido.pagamento': p.condicaoPagamento || 'a combinar',
      'pedido.frete': FRETES[p.frete] || p.frete || '', 'pedido.observacoes': p.observacoes || '' });
    itens = (o.itens || []).map((i) => ({ descricao: i.descricao, unidade: i.unidade, quantidade: qtd(i.quantidade),
      preco: moeda(i.precoUnitario), total: moeda(i.valorTotal != null ? i.valorTotal : i.quantidade * i.precoUnitario) }));
  }
  return { campos, itens, link: o.link || '', rotuloBotao: TIPOS[tipo].botao };
}

// dados de exemplo para a prévia e o e-mail de teste
export function exemplo(tipo, usuario, empresa) {
  const base = {
    usuario, empresa,
    fornecedor: { nome: 'Concreteira Boa Massa Ltda', nomeFantasia: 'Boa Massa', contato: 'Marcos', email: 'vendas@boamassa.com.br' },
    obra: { nome: 'Fundamental 1 - Colégio Araucária', codigo: 'ORC-2026-001' },
    link: 'https://araucaria.cazu.com.br/portal-fornecedor?t=exemplo'
  };
  const itens = [
    { descricao: 'Concreto usinado bombeável C30, brita 0 e 1', unidade: 'M3', quantidade: 12, precoUnitario: 545.5 },
    { descricao: 'Telha galvalume com isolamento termoacústico 30 mm', unidade: 'M2', quantidade: 46.4, precoUnitario: 168.9 }
  ];
  if (tipo === 'cotacao') {
    return dadosDoEnvio('cotacao', { ...base, itens, cotacao: { numero: 12, prazoResposta: '2026-10-21', observacoes: 'Entrega na obra das 7h às 16h.' } });
  }
  const total = itens.reduce((s, i) => s + i.quantidade * i.precoUnitario, 0);
  return dadosDoEnvio('pedido', { ...base, itens, pedido: { numero: 35, data: '2026-10-16', valorTotal: total, dataEntrega: '2026-10-23',
    localEntrega: 'Rua das Araucárias, 120 – Obra Colégio', condicaoPagamento: '30/60 dias', frete: 'CIF', observacoes: '' } });
}

/* ---------- remetente ---------- */
const dominio = (email) => String(email || '').split('@')[1] || '';
// Quem entra com e-mail do mesmo domínio do endereço de envio (verificado no Resend) envia com o
// próprio endereço; os demais saem pelo endereço de envio. As respostas sempre vão para quem enviou.
export function remetente(enderecoEnvio, usuarioEmail, nome) {
  const envio = String(enderecoEnvio || PADROES.email_remetente).trim().toLowerCase();
  const login = String(usuarioEmail || '').trim().toLowerCase();
  const endereco = login && dominio(login) === dominio(envio) ? login : envio;
  const limpo = String(nome || '').replace(/["<>\r\n]/g, '').replace(/\s+/g, ' ').trim().slice(0, 120);
  return { endereco, from: limpo ? `"${limpo}" <${endereco}>` : endereco, responderPara: login || null };
}
