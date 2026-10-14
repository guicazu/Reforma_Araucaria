// Gera um PDF A4 simples do pedido de compra, sem dependências externas.
export async function gerarPdfPedido({ pedido, fornecedor, itens }) {
  function latin1Escape(s) {
    let out = '';
    for (const ch of String(s)) {
      const code = ch.codePointAt(0);
      if (code === 92) { out += '\\\\'; continue; }        // backslash
      if (code === 40 || code === 41) { out += '\\' + ch; continue; } // parênteses
      if (code > 255) continue;                            // remove emojis/símbolos
      if (code > 127) { out += '\\' + code.toString(8).padStart(3, '0'); continue; }
      out += ch;
    }
    return out;
  }
  const es = latin1Escape;

  const linhas = [];
  linhas.push('CAZU PROJETOS E CONSTRUCOES');
  linhas.push('==============================================================');
  linhas.push('PEDIDO DE COMPRA  N.: ' + (pedido.numero || pedido.id || ''));
  linhas.push('Data de emissao: ' + new Date(pedido.dataEmissao || Date.now()).toLocaleDateString('pt-BR'));
  linhas.push('');
  linhas.push('FORNECEDOR: ' + (fornecedor && fornecedor.nome || ''));
  linhas.push('CNPJ: ' + (fornecedor && fornecedor.cnpj || '') + '    Telefone: ' + (fornecedor && fornecedor.telefone || ''));
  linhas.push('E-mail: ' + (fornecedor && fornecedor.email || ''));
  linhas.push('Condicao de pagamento: ' + (pedido.condicaoPagamento || ''));
  linhas.push('');
  linhas.push('ITEM  DESCRICAO                                          UN   QTD      PRECO UNIT.     TOTAL');
  (itens || []).forEach((i, idx) => {
    const desc = (i.descricao || '').slice(0, 46).padEnd(48);
    const un = (i.unidade || 'un').slice(0, 3).padEnd(3);
    const qtd = Number(i.quantidade || 0).toFixed(2).padStart(7);
    const pu = Number(i.precoUnitario || 0).toFixed(2).padStart(10);
    const tot = Number(i.valorTotal || 0).toFixed(2).padStart(12);
    linhas.push((idx + 1) + '.    ' + desc + ' ' + un + ' ' + qtd + ' ' + pu + '   ' + tot);
  });
  linhas.push('');
  linhas.push('TOTAL DO PEDIDO: R$ ' + Number(pedido.valorTotal || 0).toFixed(2));
  linhas.push('');
  linhas.push('Ao receber este pedido, confirme o recebimento pelo link enviado por e-mail.');

  const width = 595, height = 842, margin = 48, lineH = 12;
  const porPagina = Math.floor((height - margin * 2) / lineH);
  const paginas = [];
  for (let i = 0; i < linhas.length; i += porPagina) paginas.push(linhas.slice(i, i + porPagina));

  const conteudos = paginas.map((pg) => {
    let c = '';
    let y = height - margin;
    pg.forEach((t) => {
      c += 'BT /F1 9 Tf ' + margin + ' ' + y.toFixed(2) + ' Td (' + es(t) + ') Tj ET\n';
      y -= lineH;
    });
    return c;
  });

  const objs = [];
  const fontId = 3;
  objs.push('1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj');
  const kids = paginas.map((_, i) => 4 + i * 2);
  objs.push('2 0 obj\n<< /Type /Pages /Kids [' + kids.map((k) => k + ' 0 R').join(' ') + '] /Count ' + kids.length + ' >>\nendobj');
  objs.push(fontId + ' 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj');
  paginas.forEach((_, i) => {
    const pageId = 4 + i * 2, contId = pageId + 1;
    const stream = conteudos[i];
    objs.push(pageId + ' 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ' + width + ' ' + height + '] /Resources << /Font << /F1 ' + fontId + ' 0 R >> >> /Contents ' + contId + ' 0 R >>\nendobj');
    objs.push(contId + ' 0 obj\n<< /Length ' + stream.length + ' >>\nstream\n' + stream + 'endstream\nendobj');
  });

  let pdf = '%PDF-1.4\n';
  const offsets = [0];
  objs.forEach((o) => { offsets.push(pdf.length); pdf += o + '\n'; });
  const xrefStart = pdf.length;
  pdf += 'xref\n0 ' + (objs.length + 1) + '\n0000000000 65535 f \n';
  offsets.slice(1).forEach((off) => { pdf += String(off).padStart(10, '0') + ' 00000 n \n'; });
  pdf += 'trailer\n<< /Size ' + (objs.length + 1) + ' /Root 1 0 R >>\nstartxref\n' + xrefStart + '\n%%EOF';

  const bytes = new TextEncoder().encode(pdf);
  let bin = '';
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin);
}