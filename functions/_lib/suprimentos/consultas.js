// Consulta de CNPJ (dados públicos da Receita Federal) e de CEP para preencher o cadastro de
// fornecedor. Fontes gratuitas: para CNPJ, BrasilAPI e CNPJ.ws ao mesmo tempo (o CNPJ.ws também traz
// a inscrição estadual e serve de reserva); para CEP, BrasilAPI e, de reserva, ViaCEP. As respostas
// ficam no cache da Cloudflare (CNPJ 7 dias, CEP 30 dias) para não repetir a consulta.
import { json, falha } from './base.js';
import { documentoValido } from './cadastros.js';

const so = (v) => String(v || '').replace(/\D/g, '');
const MINUSCULAS = new Set(['de', 'da', 'do', 'das', 'dos', 'e', 'em', 'a', 'o', 'na', 'no']);
// "AVENIDA REPUBLICA DO CHILE" -> "Avenida Republica do Chile" (siglas de 2 letras ficam: "SP")
function titulo(t) {
  return String(t || '').trim().toLowerCase().split(/\s+/).filter(Boolean)
    .map((p, i) => (i > 0 && MINUSCULAS.has(p) ? p : p.charAt(0).toUpperCase() + p.slice(1))).join(' ');
}
function telefoneBr(v) {
  const d = so(v);
  if (d.length === 10) return '(' + d.slice(0, 2) + ') ' + d.slice(2, 6) + '-' + d.slice(6);
  if (d.length === 11) return '(' + d.slice(0, 2) + ') ' + d.slice(2, 7) + '-' + d.slice(7);
  return '';
}
const cepBr = (v) => { const d = so(v); return d.length === 8 ? d.slice(0, 5) + '-' + d.slice(5) : ''; };
function enderecoDe(rua, numero, complemento, bairro) {
  const partes = [titulo(rua), String(numero || '').trim(), titulo(complemento)].filter(Boolean);
  return partes.join(', ') + (bairro ? ' – ' + titulo(bairro) : '');
}

async function buscar(url) {
  try {
    const r = await fetch(url, { headers: { accept: 'application/json', 'user-agent': 'cazu-obras/1.0' }, signal: AbortSignal.timeout(8000) });
    let dados = null;
    try { dados = await r.json(); } catch (e) { /* resposta sem JSON */ }
    return { status: r.status, dados };
  } catch (e) {
    return { status: 0, dados: null };
  }
}
// Cache da Cloudflare por chave; falha de consulta (null) não é guardada
async function comCache(chave, segundos, buscarDados) {
  const cache = typeof caches !== 'undefined' ? caches.default : null;
  const pedido = new Request('https://cache.consultas.interno/' + chave);
  if (cache) {
    try { const r = await cache.match(pedido); if (r) return await r.json(); } catch (e) { /* sem cache */ }
  }
  const dados = await buscarDados();
  if (dados && cache) {
    try {
      await cache.put(pedido, new Response(JSON.stringify(dados), { headers: { 'content-type': 'application/json', 'cache-control': 'public, max-age=' + segundos } }));
    } catch (e) { /* sem cache */ }
  }
  return dados;
}

/* ---------- CNPJ ---------- */
function deBrasilApi(d) {
  return {
    nome: String(d.razao_social || '').trim(), nomeFantasia: titulo(d.nome_fantasia),
    situacao: String(d.descricao_situacao_cadastral || '').toUpperCase(), abertura: d.data_inicio_atividade || '',
    atividade: d.cnae_fiscal_descricao || '', telefone: telefoneBr(d.ddd_telefone_1) || telefoneBr(d.ddd_telefone_2),
    email: String(d.email || '').trim().toLowerCase(), cep: cepBr(d.cep),
    endereco: enderecoDe([d.descricao_tipo_de_logradouro, d.logradouro].filter(Boolean).join(' '), d.numero, d.complemento, d.bairro),
    cidade: titulo(d.municipio), uf: String(d.uf || '').toUpperCase(), inscricaoEstadual: ''
  };
}
function deCnpjWs(d) {
  const e = d.estabelecimento || {};
  return {
    nome: String(d.razao_social || '').trim(), nomeFantasia: titulo(e.nome_fantasia),
    situacao: String(e.situacao_cadastral || '').toUpperCase(), abertura: e.data_inicio_atividade || '',
    atividade: (e.atividade_principal && e.atividade_principal.descricao) || '',
    telefone: telefoneBr(String(e.ddd1 || '') + String(e.telefone1 || '')), email: String(e.email || '').trim().toLowerCase(),
    cep: cepBr(e.cep), endereco: enderecoDe([e.tipo_logradouro, e.logradouro].filter(Boolean).join(' '), e.numero, e.complemento, e.bairro),
    cidade: titulo(e.cidade && e.cidade.nome), uf: String((e.estado && e.estado.sigla) || '').toUpperCase(), inscricaoEstadual: ''
  };
}
// Inscrição estadual ativa no estado do endereço (CNPJ.ws)
function inscricaoDe(d, uf) {
  const lista = ((d && d.estabelecimento && d.estabelecimento.inscricoes_estaduais) || []).filter((i) => i && i.inscricao_estadual);
  const ativa = lista.find((i) => i.ativo && i.estado && i.estado.sigla === uf) || lista.find((i) => i.ativo);
  return ativa ? String(ativa.inscricao_estadual) : '';
}
async function consultarCnpj(n) {
  const [a, b] = await Promise.all([buscar('https://brasilapi.com.br/api/cnpj/v1/' + n), buscar('https://publica.cnpj.ws/cnpj/' + n)]);
  let dados = null;
  if (a.status === 200 && a.dados && a.dados.razao_social) dados = { ...deBrasilApi(a.dados), fonte: 'BrasilAPI' };
  else if (b.status === 200 && b.dados && b.dados.razao_social) dados = { ...deCnpjWs(b.dados), fonte: 'CNPJ.ws' };
  else if (a.status === 404 || b.status === 404) return { naoEncontrado: true };
  else return null;
  if (b.status === 200 && b.dados && b.dados.razao_social) {
    // o que faltou numa fonte vem da outra (ex.: e-mail), e a inscrição estadual só o CNPJ.ws tem
    const reserva = deCnpjWs(b.dados);
    for (const k of Object.keys(reserva)) if (!dados[k] && reserva[k]) dados[k] = reserva[k];
    dados.inscricaoEstadual = inscricaoDe(b.dados, dados.uf);
  }
  // a Receita grava sem acento ("Sao Paulo"): o CEP da empresa traz o nome certo da cidade
  if (dados.cep) {
    const c = await comCache('cep/' + so(dados.cep), 30 * 86400, () => consultarCep(so(dados.cep)));
    const semAcento = (t) => String(t || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
    if (c && c.cidade && semAcento(c.cidade) === semAcento(dados.cidade)) dados.cidade = c.cidade;
  }
  return dados;
}

export async function cnpj({ env, params }) {
  const n = so(params.numero);
  if (n.length !== 14 || !documentoValido(n)) falha(400, 'cnpj_invalido', 'CNPJ inválido: confira os 14 dígitos.');
  const dados = await comCache('cnpj/' + n, 7 * 86400, () => consultarCnpj(n));
  if (!dados) falha(502, 'consulta_indisponivel', 'Não foi possível consultar a Receita agora. Preencha à mão ou tente de novo em instantes.');
  if (dados.naoEncontrado) falha(404, 'cnpj_nao_encontrado', 'CNPJ não encontrado na Receita Federal.');
  const outro = await env.DB.prepare('SELECT id, nome FROM supr_fornecedores WHERE documento = ?').bind(n).first();
  return json({ ...dados, documento: n, jaCadastrado: outro || null });
}

/* ---------- CEP ---------- */
async function consultarCep(n) {
  const a = await buscar('https://brasilapi.com.br/api/cep/v2/' + n);
  if (a.status === 200 && a.dados && a.dados.city) {
    return { cep: cepBr(n), logradouro: a.dados.street || '', bairro: a.dados.neighborhood || '', cidade: a.dados.city || '', uf: a.dados.state || '', fonte: 'BrasilAPI' };
  }
  const b = await buscar('https://viacep.com.br/ws/' + n + '/json/');
  if (b.status === 200 && b.dados && !b.dados.erro && b.dados.localidade) {
    return { cep: cepBr(n), logradouro: b.dados.logradouro || '', bairro: b.dados.bairro || '', cidade: b.dados.localidade || '', uf: b.dados.uf || '', fonte: 'ViaCEP' };
  }
  if (a.status === 404 || (b.status === 200 && b.dados && b.dados.erro) || b.status === 400) return { naoEncontrado: true };
  return null;
}

export async function cep({ params }) {
  const n = so(params.numero);
  if (n.length !== 8) falha(400, 'cep_invalido', 'CEP com 8 dígitos.');
  const dados = await comCache('cep/' + n, 30 * 86400, () => consultarCep(n));
  if (!dados) falha(502, 'consulta_indisponivel', 'Não foi possível consultar o CEP agora. Preencha à mão ou tente de novo.');
  if (dados.naoEncontrado) falha(404, 'cep_nao_encontrado', 'CEP não encontrado.');
  return json(dados);
}
