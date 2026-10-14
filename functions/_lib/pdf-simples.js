// Gerador de PDF minimalista, 100% JavaScript puro — sem bibliotecas externas.
// Necessário porque o projeto não tem etapa de build (Pages Functions roda os
// arquivos como estão, sem `npm install`), então pacotes como pdf-lib não
// podem ser importados. Suporta texto (Helvetica/Helvetica-Bold) e linhas —
// o suficiente para montar um documento de pedido de compra com tabela.

const PAGE_W = 595.28; // A4 em pontos
const PAGE_H = 841.89;
const MARGEM = 40;

function escaparTexto(s) {
  // WinAnsiEncoding cobre os acentos do português (á é í ó ú ã õ ç ê â) via charCode direto
  return String(s == null ? '' : s)
    .replace(/\\/g, '\\\\')
    .replace(/\(/g, '\\(')
    .replace(/\)/g, '\\)')
    .split('').map((c) => (c.charCodeAt(0) > 255 ? '?' : c)).join('');
}

class PaginaPDF {
  constructor() { this.cmds = []; }
  texto(x, y, texto, { fonte = 'F1', tamanho = 10 } = {}) {
    this.cmds.push(`BT /${fonte} ${tamanho} Tf ${x.toFixed(2)} ${y.toFixed(2)} Td (${escaparTexto(texto)}) Tj ET`);
    return this;
  }
  linha(x1, y1, x2, y2, largura = 0.5) {
    this.cmds.push(`${largura} w ${x1.toFixed(2)} ${y1.toFixed(2)} m ${x2.toFixed(2)} ${y2.toFixed(2)} l S`);
    return this;
  }
  retangulo(x, y, w, h, { preencher = false, cor = '0.93 0.93 0.93' } = {}) {
    if (preencher) this.cmds.push(`${cor} rg ${x.toFixed(2)} ${y.toFixed(2)} ${w.toFixed(2)} ${h.toFixed(2)} re f`);
    else this.cmds.push(`${x.toFixed(2)} ${y.toFixed(2)} ${w.toFixed(2)} ${h.toFixed(2)} re S`);
    return this;
  }
  stream() { return this.cmds.join('\n'); }
}

function construirPDF(paginas) {
  const objetos = [];
  // 1 catalog, 2 pages (preenchido depois), 3 font normal, 4 font bold
  objetos.push('<< /Type /Catalog /Pages 2 0 R >>'); // objeto 1
  objetos.push(null); // objeto 2 — placeholder, preenchido depois com a lista de páginas
  const idxPages = objetos.length; // 2 (precisa vir DEPOIS do push acima, senão aponta pro Catalog)
  objetos.push('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>');
  objetos.push('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>');

  const kids = [];
  paginas.forEach((pagina) => {
    const conteudo = pagina.stream();
    const idxContent = objetos.length + 1;
    objetos.push(`<< /Length ${conteudo.length} >>\nstream\n${conteudo}\nendstream`);
    const idxPage = objetos.length + 1;
    objetos.push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PAGE_W} ${PAGE_H}] ` +
      `/Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents ${idxContent} 0 R >>`);
    kids.push(`${idxPage} 0 R`);
  });
  objetos[idxPages - 1] = `<< /Type /Pages /Kids [${kids.join(' ')}] /Count ${kids.length} >>`;

  let pdf = '%PDF-1.4\n';
  const offsets = [0];
  objetos.forEach((corpo, i) => {
    offsets.push(pdf.length);
    pdf += `${i + 1} 0 obj\n${corpo}\nendobj\n`;
  });
  const xrefStart = pdf.length;
  pdf += `xref\n0 ${objetos.length + 1}\n0000000000 65535 f \n`;
  for (let i = 1; i <= objetos.length; i++) {
    pdf += String(offsets[i]).padStart(10, '0') + ' 00000 n \n';
  }
  pdf += `trailer\n<< /Size ${objetos.length + 1} /Root 1 0 R >>\nstartxref\n${xrefStart}\n%%EOF`;

  // string -> bytes (Latin1, já que só usamos charCodes <= 255)
  const bytes = new Uint8Array(pdf.length);
  for (let i = 0; i < pdf.length; i++) bytes[i] = pdf.charCodeAt(i) & 0xff;
  return bytes;
}

function fmtBRL(v) {
  return 'R$ ' + (Number(v) || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// Monta o PDF do pedido de compra. `itens`: [{descricao, unidade, quantidade, precoUnitario, valorTotal}]
export function gerarPdfPedido({ numero, dataEmissao, fornecedor, condicaoPagamento, itens, valorTotal, observacoes }) {
  const LINHAS_POR_PAGINA = 28;
  const blocos = [];
  for (let i = 0; i < itens.length; i += LINHAS_POR_PAGINA) blocos.push(itens.slice(i, i + LINHAS_POR_PAGINA));
  if (!blocos.length) blocos.push([]);

  const colX = { desc: MARGEM, un: 340, qtd: 390, preco: 440, total: 505 };
  const paginas = blocos.map((bloco, pagIdx) => {
    const p = new PaginaPDF();
    let y = PAGE_H - MARGEM;

    p.texto(MARGEM, y, 'PEDIDO DE COMPRA', { fonte: 'F2', tamanho: 16 }); y -= 20;
    p.texto(MARGEM, y, `Nº ${numero}`, { fonte: 'F2', tamanho: 11 });
    p.texto(400, y, `Emitido em: ${dataEmissao}`, { tamanho: 9 }); y -= 18;
    p.linha(MARGEM, y, PAGE_W - MARGEM, y); y -= 16;

    p.texto(MARGEM, y, 'Fornecedor:', { fonte: 'F2', tamanho: 10 });
    p.texto(130, y, fornecedor.nome || '', { tamanho: 10 }); y -= 14;
    if (fornecedor.cnpj) { p.texto(MARGEM, y, 'CNPJ:', { fonte: 'F2', tamanho: 10 }); p.texto(130, y, fornecedor.cnpj, { tamanho: 10 }); y -= 14; }
    if (fornecedor.email) { p.texto(MARGEM, y, 'E-mail:', { fonte: 'F2', tamanho: 10 }); p.texto(130, y, fornecedor.email, { tamanho: 10 }); y -= 14; }
    p.texto(MARGEM, y, 'Condição de pagamento:', { fonte: 'F2', tamanho: 10 });
    p.texto(190, y, condicaoPagamento || 'A combinar', { tamanho: 10 }); y -= 20;

    // cabeçalho da tabela
    p.retangulo(MARGEM, y - 16, PAGE_W - 2 * MARGEM, 18, { preencher: true });
    p.texto(colX.desc + 4, y - 11, 'Descrição', { fonte: 'F2', tamanho: 9 });
    p.texto(colX.un, y - 11, 'Un.', { fonte: 'F2', tamanho: 9 });
    p.texto(colX.qtd, y - 11, 'Qtd.', { fonte: 'F2', tamanho: 9 });
    p.texto(colX.preco, y - 11, 'Preço un.', { fonte: 'F2', tamanho: 9 });
    p.texto(colX.total, y - 11, 'Total', { fonte: 'F2', tamanho: 9 });
    y -= 22;

    bloco.forEach((item) => {
      const nome = (item.descricao || '').length > 55 ? item.descricao.slice(0, 52) + '...' : (item.descricao || '');
      p.texto(colX.desc + 4, y, nome, { tamanho: 9 });
      p.texto(colX.un, y, item.unidade || '', { tamanho: 9 });
      p.texto(colX.qtd, y, (Number(item.quantidade) || 0).toLocaleString('pt-BR', { maximumFractionDigits: 2 }), { tamanho: 9 });
      p.texto(colX.preco, y, fmtBRL(item.precoUnitario), { tamanho: 9 });
      p.texto(colX.total, y, fmtBRL(item.valorTotal), { tamanho: 9 });
      y -= 15;
    });

    const ultima = pagIdx === blocos.length - 1;
    if (ultima) {
      y -= 8;
      p.linha(350, y, PAGE_W - MARGEM, y);
      y -= 16;
      p.texto(400, y, 'TOTAL DO PEDIDO:', { fonte: 'F2', tamanho: 11 });
      p.texto(colX.total, y, fmtBRL(valorTotal), { fonte: 'F2', tamanho: 11 });
      if (observacoes) {
        y -= 26;
        p.texto(MARGEM, y, 'Observações:', { fonte: 'F2', tamanho: 9 }); y -= 13;
        p.texto(MARGEM, y, observacoes.length > 110 ? observacoes.slice(0, 107) + '...' : observacoes, { tamanho: 9 });
      }
    } else {
      p.texto(MARGEM, MARGEM, `(continua na página ${pagIdx + 2})`, { tamanho: 8 });
    }
    return p;
  });

  return construirPDF(paginas);
}

export function bytesParaBase64(bytes) {
  let binario = '';
  for (let i = 0; i < bytes.length; i++) binario += String.fromCharCode(bytes[i]);
  // btoa está disponível no runtime de Workers/Pages Functions
  return btoa(binario);
}
