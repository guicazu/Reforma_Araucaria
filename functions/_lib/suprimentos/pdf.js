// PDF dos documentos de Suprimentos (pedido de compra), em JavaScript puro: as Pages Functions rodam
// sem etapa de build, então não há biblioteca de PDF. Usa as fontes padrão Helvetica e
// Helvetica-Bold (WinAnsiEncoding, que cobre os acentos do português); as larguras dos caracteres
// vêm das métricas da Helvetica, para quebrar linhas e alinhar números à direita.

const A4 = { largura: 595.28, altura: 841.89 };
const MARGEM = 36;

// Larguras (por 1000 unidades) da Helvetica, caracteres 32 a 126
const LARGURAS = [278, 278, 355, 556, 556, 889, 667, 191, 333, 333, 389, 584, 278, 333, 278, 278, 556, 556, 556, 556, 556,
  556, 556, 556, 556, 556, 278, 278, 584, 584, 584, 556, 1015, 667, 667, 722, 722, 667, 611, 778, 722, 278, 500, 667, 556,
  833, 722, 778, 667, 778, 722, 667, 611, 722, 667, 944, 667, 667, 611, 278, 278, 278, 469, 556, 333, 556, 556, 500, 556,
  556, 278, 556, 556, 222, 222, 500, 222, 833, 556, 556, 556, 556, 333, 500, 278, 556, 500, 722, 500, 500, 500, 334, 260,
  334, 584];
// Caracteres acentuados medem como a letra sem acento
const BASE_ACENTO = 'ÀÁÂÃÄÅàáâãäåÈÉÊËèéêëÌÍÎÏìíîïÒÓÔÕÖòóôõöÙÚÛÜùúûüÇçÑñ';
const SEM_ACENTO = 'AAAAAAaaaaaaEEEEeeeeIIIIiiiiOOOOOoooooUUUUuuuuCcNn';
// Pontuação Unicode que existe na WinAnsi
const WINANSI = { '–': 0x96, '—': 0x97, '‘': 0x91, '’': 0x92, '“': 0x93, '”': 0x94, '•': 0x95, '…': 0x85, '€': 0x80 };

function larguraChar(ch) {
  const i = BASE_ACENTO.indexOf(ch);
  if (i >= 0) ch = SEM_ACENTO[i];
  const c = ch.charCodeAt(0);
  if (c >= 32 && c <= 126) return LARGURAS[c - 32];
  if (ch === 'º' || ch === 'ª' || ch === '°') return 370;
  if (ch === '²' || ch === '³') return 333;
  return 556;
}

export function larguraTexto(texto, tamanho, negrito) {
  let soma = 0;
  for (const ch of String(texto)) soma += larguraChar(ch);
  return soma / 1000 * tamanho * (negrito ? 1.06 : 1);
}

function escapar(texto) {
  let s = '';
  for (const ch of String(texto == null ? '' : texto)) {
    if (ch === '\\' || ch === '(' || ch === ')') { s += '\\' + ch; continue; }
    const c = ch.codePointAt(0);
    if (WINANSI[ch]) { s += String.fromCharCode(WINANSI[ch]); continue; }
    if (c < 32) { s += ' '; continue; }
    s += c > 255 ? '?' : ch;
  }
  return s;
}

const n2 = (v) => v.toFixed(2);

export class DocumentoPdf {
  constructor({ rodape } = {}) {
    this.paginas = [];
    this.rodape = rodape || '';
    this.novaPagina();
  }
  get larguraUtil() { return A4.largura - 2 * MARGEM; }
  novaPagina() {
    this.cmds = [];
    this.paginas.push(this.cmds);
    this.y = A4.altura - MARGEM;
    if (this.aoNovaPagina) this.aoNovaPagina();
  }
  // Abre página nova quando o bloco não cabe
  garantir(altura) {
    if (this.y - altura < MARGEM + 24) { this.novaPagina(); return true; }
    return false;
  }
  texto(x, y, texto, { tamanho = 9, negrito = false, alinhar = 'esquerda', cor } = {}) {
    let px = x;
    if (alinhar === 'direita') px = x - larguraTexto(texto, tamanho, negrito);
    else if (alinhar === 'centro') px = x - larguraTexto(texto, tamanho, negrito) / 2;
    const c = cor ? `${cor} g ` : '';
    this.cmds.push(`BT ${c}/${negrito ? 'F2' : 'F1'} ${tamanho} Tf ${n2(px)} ${n2(y)} Td (${escapar(texto)}) Tj ET${cor ? ' 0 g' : ''}`);
  }
  linha(x1, y1, x2, y2, { espessura = 0.5, cor = '0.82' } = {}) {
    this.cmds.push(`${cor} G ${espessura} w ${n2(x1)} ${n2(y1)} m ${n2(x2)} ${n2(y2)} l S 0 G`);
  }
  retangulo(x, y, w, h, { preencher = false, cor = '0.96', borda = '0.82' } = {}) {
    if (preencher) this.cmds.push(`${cor} g ${n2(x)} ${n2(y)} ${n2(w)} ${n2(h)} re f 0 g`);
    else this.cmds.push(`${borda} G 0.5 w ${n2(x)} ${n2(y)} ${n2(w)} ${n2(h)} re S 0 G`);
  }
  // Quebra o texto em linhas que caibam na largura (palavras longas são cortadas)
  quebrar(texto, largura, tamanho = 9, negrito = false) {
    const linhas = [];
    for (const paragrafo of String(texto == null ? '' : texto).split(/\r?\n/)) {
      let atual = '';
      for (const palavra of paragrafo.split(/\s+/).filter(Boolean)) {
        const tentativa = atual ? atual + ' ' + palavra : palavra;
        if (larguraTexto(tentativa, tamanho, negrito) <= largura) { atual = tentativa; continue; }
        if (atual) linhas.push(atual);
        let resto = palavra;
        while (larguraTexto(resto, tamanho, negrito) > largura) {
          let corte = resto.length;
          while (corte > 1 && larguraTexto(resto.slice(0, corte), tamanho, negrito) > largura) corte--;
          linhas.push(resto.slice(0, corte));
          resto = resto.slice(corte);
        }
        atual = resto;
      }
      linhas.push(atual);
    }
    return linhas.length ? linhas : [''];
  }
  gerar() {
    const total = this.paginas.length;
    this.paginas.forEach((cmds, i) => {
      const y = MARGEM - 14;
      cmds.push(`0.82 G 0.5 w ${n2(MARGEM)} ${n2(y + 10)} m ${n2(A4.largura - MARGEM)} ${n2(y + 10)} l S 0 G`);
      cmds.push(`BT 0.45 g /F1 7.5 Tf ${n2(MARGEM)} ${n2(y)} Td (${escapar(this.rodape)}) Tj ET 0 g`);
      const pag = `Página ${i + 1} de ${total}`;
      cmds.push(`BT 0.45 g /F1 7.5 Tf ${n2(A4.largura - MARGEM - larguraTexto(pag, 7.5))} ${n2(y)} Td (${escapar(pag)}) Tj ET 0 g`);
    });
    const objetos = ['<< /Type /Catalog /Pages 2 0 R >>', null,
      '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>',
      '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>'];
    const kids = [];
    for (const cmds of this.paginas) {
      const conteudo = cmds.join('\n');
      objetos.push(`<< /Length ${conteudo.length} >>\nstream\n${conteudo}\nendstream`);
      const idConteudo = objetos.length;
      objetos.push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${A4.largura} ${A4.altura}] /Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents ${idConteudo} 0 R >>`);
      kids.push(`${objetos.length} 0 R`);
    }
    objetos[1] = `<< /Type /Pages /Kids [${kids.join(' ')}] /Count ${kids.length} >>`;
    let pdf = '%PDF-1.4\n';
    const offsets = [];
    objetos.forEach((corpo, i) => { offsets.push(pdf.length); pdf += `${i + 1} 0 obj\n${corpo}\nendobj\n`; });
    const xref = pdf.length;
    pdf += `xref\n0 ${objetos.length + 1}\n0000000000 65535 f \n` + offsets.map((o) => String(o).padStart(10, '0') + ' 00000 n \n').join('');
    pdf += `trailer\n<< /Size ${objetos.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
    const bytes = new Uint8Array(pdf.length);
    for (let i = 0; i < pdf.length; i++) bytes[i] = pdf.charCodeAt(i) & 0xff;
    return bytes;
  }
}

export function base64(bytes) {
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}

/* ---------- formatação ---------- */
export const moeda = (v) => 'R$ ' + (Number(v) || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
export const qtd = (v) => (Number(v) || 0).toLocaleString('pt-BR', { maximumFractionDigits: 4 });
export const dataBr = (d) => (d ? String(d).slice(0, 10).split('-').reverse().join('/') : '—');
export function documentoFormatado(d) {
  const s = String(d || '').replace(/\D/g, '');
  if (s.length === 14) return s.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5');
  if (s.length === 11) return s.replace(/^(\d{3})(\d{3})(\d{3})(\d{2})$/, '$1.$2.$3-$4');
  return s;
}

/* ---------- pedido de compra ---------- */
// dados: { empresa: {nome, documento, endereco}, pedido, fornecedor, obra: {codigo, nome}, itens, link }
export function pdfPedido({ empresa, pedido, fornecedor, obra, itens, link }) {
  const doc = new DocumentoPdf({ rodape: `${empresa.nome} · Pedido de compra nº ${pedido.numero}` });
  const L = MARGEM, R = A4.largura - MARGEM, W = R - L;

  // cabeçalho
  doc.texto(L, doc.y - 12, empresa.nome, { tamanho: 13, negrito: true });
  const sub = [empresa.documento ? 'CNPJ ' + documentoFormatado(empresa.documento) : '', empresa.endereco || ''].filter(Boolean).join(' · ');
  if (sub) doc.texto(L, doc.y - 26, sub, { tamanho: 8, cor: '0.35' });
  doc.texto(R, doc.y - 12, 'PEDIDO DE COMPRA', { tamanho: 13, negrito: true, alinhar: 'direita' });
  doc.texto(R, doc.y - 26, `Nº ${pedido.numero} · emitido em ${dataBr(pedido.data)}`, { tamanho: 8.5, alinhar: 'direita' });
  doc.y -= 38;
  doc.linha(L, doc.y, R, doc.y, { espessura: 1, cor: '0.1' });
  doc.y -= 14;

  // blocos fornecedor | entrega
  function bloco(x, largura, titulo, linhas) {
    let y = doc.y;
    doc.texto(x, y, titulo.toUpperCase(), { tamanho: 7, negrito: true, cor: '0.45' });
    y -= 12;
    for (const [rotulo, valor] of linhas) {
      if (!valor) continue;
      const textoRotulo = rotulo ? rotulo + ': ' : '';
      const lr = larguraTexto(textoRotulo, 8.5, true);
      const partes = doc.quebrar(valor, largura - lr, 8.5);
      doc.texto(x, y, textoRotulo, { tamanho: 8.5, negrito: true });
      partes.forEach((p, i) => doc.texto(x + lr, y - i * 11, p, { tamanho: 8.5 }));
      y -= 11 * partes.length + 1;
    }
    return y;
  }
  const meia = W / 2 - 10;
  const yF = bloco(L, meia, 'Fornecedor', [
    ['', fornecedor.nome], ['CNPJ/CPF', documentoFormatado(fornecedor.documento)], ['Contato', fornecedor.contato],
    ['Telefone', fornecedor.telefone], ['E-mail', fornecedor.email],
    ['Endereço', [fornecedor.endereco, [fornecedor.cidade, fornecedor.uf].filter(Boolean).join('/')].filter(Boolean).join(' — ')]
  ]);
  const yE = bloco(L + W / 2 + 10, meia, 'Entrega e pagamento', [
    ['Obra', [obra.codigo, obra.nome].filter(Boolean).join(' — ')], ['Local de entrega', pedido.localEntrega],
    ['Entrega até', pedido.dataEntrega ? dataBr(pedido.dataEntrega) : ''], ['Pagamento', pedido.condicaoPagamento || 'A combinar'],
    ['Frete', pedido.frete ? (pedido.frete === 'CIF' ? 'CIF (por conta do fornecedor)' : 'FOB (por conta do comprador)') : '']
  ]);
  doc.y = Math.min(yF, yE) - 8;

  // tabela de itens
  // bordas direitas das colunas numéricas (texto alinhado à direita)
  const col = { item: L + 4, desc: L + 24, un: R - 212, qtd: R - 142, preco: R - 74, total: R - 4 };
  const largDesc = col.un - col.desc - 8;
  function cabecalhoTabela() {
    doc.retangulo(L, doc.y - 16, W, 18, { preencher: true, cor: '0.94' });
    const y = doc.y - 11;
    doc.texto(col.item, y, '#', { tamanho: 7.5, negrito: true });
    doc.texto(col.desc, y, 'DESCRIÇÃO', { tamanho: 7.5, negrito: true });
    doc.texto(col.un, y, 'UN', { tamanho: 7.5, negrito: true });
    doc.texto(col.qtd, y, 'QUANTIDADE', { tamanho: 7.5, negrito: true, alinhar: 'direita' });
    doc.texto(col.preco, y, 'PREÇO UNIT.', { tamanho: 7.5, negrito: true, alinhar: 'direita' });
    doc.texto(col.total, y, 'TOTAL', { tamanho: 7.5, negrito: true, alinhar: 'direita' });
    doc.y -= 22;
  }
  cabecalhoTabela();
  doc.aoNovaPagina = () => { doc.y -= 4; cabecalhoTabela(); };
  itens.forEach((it, i) => {
    const desc = [it.insumoCodigo ? `[${it.insumoCodigo}]` : '', it.descricao, it.marca ? `· marca ${it.marca}` : ''].filter(Boolean).join(' ');
    const linhas = doc.quebrar(desc, largDesc, 8.5);
    const obs = it.observacao ? doc.quebrar('Obs.: ' + it.observacao, largDesc, 7.5) : [];
    const altura = linhas.length * 11 + obs.length * 9.5 + 6;
    doc.garantir(altura);
    const y = doc.y;
    doc.texto(col.item, y, String(i + 1), { tamanho: 8.5 });
    linhas.forEach((l, k) => doc.texto(col.desc, y - k * 11, l, { tamanho: 8.5 }));
    obs.forEach((l, k) => doc.texto(col.desc, y - linhas.length * 11 - k * 9.5 + 1, l, { tamanho: 7.5, cor: '0.4' }));
    doc.texto(col.un, y, it.unidade || '', { tamanho: 8.5 });
    doc.texto(col.qtd, y, qtd(it.quantidade), { tamanho: 8.5, alinhar: 'direita' });
    doc.texto(col.preco, y, moeda(it.precoUnitario), { tamanho: 8.5, alinhar: 'direita' });
    doc.texto(col.total, y, moeda(it.valorTotal), { tamanho: 8.5, alinhar: 'direita' });
    doc.y -= altura;
    doc.linha(L, doc.y + 4, R, doc.y + 4, { cor: '0.9' });
  });
  doc.aoNovaPagina = null;

  // totais
  doc.garantir(70);
  doc.y -= 6;
  const totais = [['Itens', pedido.valorItens], ['Frete', pedido.valorFrete], ['Desconto', -Math.abs(pedido.valorDesconto || 0)]]
    .filter(([r, v]) => r === 'Itens' || Math.abs(v) > 0.004);
  for (const [r, v] of totais) {
    doc.texto(R - 120, doc.y, r, { tamanho: 8.5, alinhar: 'direita', cor: '0.35' });
    doc.texto(R - 4, doc.y, moeda(v), { tamanho: 8.5, alinhar: 'direita' });
    doc.y -= 12;
  }
  doc.linha(R - 200, doc.y + 6, R, doc.y + 6, { cor: '0.1' });
  doc.y -= 6;
  doc.texto(R - 120, doc.y, 'TOTAL DO PEDIDO', { tamanho: 10, negrito: true, alinhar: 'direita' });
  doc.texto(R - 4, doc.y, moeda(pedido.valorTotal), { tamanho: 10, negrito: true, alinhar: 'direita' });
  doc.y -= 22;

  if (pedido.observacoes) {
    const linhas = doc.quebrar(pedido.observacoes, W, 8.5);
    doc.garantir(16 + linhas.length * 11);
    doc.texto(L, doc.y, 'OBSERVAÇÕES', { tamanho: 7, negrito: true, cor: '0.45' });
    doc.y -= 12;
    linhas.forEach((l) => { doc.texto(L, doc.y, l, { tamanho: 8.5 }); doc.y -= 11; });
    doc.y -= 6;
  }

  doc.garantir(60);
  doc.y -= 8;
  const autorizacao = pedido.autorizadoEm
    ? `Autorizado por ${pedido.autorizadoPor || '—'} em ${dataBr(pedido.autorizadoEm)}` : 'Aguardando autorização';
  doc.texto(L, doc.y, `Comprador: ${pedido.compradorNome || pedido.compradorEmail || '—'} · ${autorizacao}`, { tamanho: 8, cor: '0.35' });
  doc.y -= 12;
  doc.texto(L, doc.y, 'Informe o número deste pedido na nota fiscal. Ao receber este pedido, confirme pelo link:', { tamanho: 8, cor: '0.35' });
  doc.y -= 11;
  if (link) doc.quebrar(link, W, 8).forEach((l) => { doc.texto(L, doc.y, l, { tamanho: 8 }); doc.y -= 10; });
  return doc.gerar();
}
