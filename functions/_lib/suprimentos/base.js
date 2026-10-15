// Base do módulo Suprimentos: usuário da sessão, validação dos dados recebidos, numeração dos
// documentos, histórico, parâmetros e alçadas de autorização.
// O D1 aceita até 100 parâmetros por consulta: listas de ids vão como um JSON só (json_each).
import { lerCookie, validarSessao } from '../session.js';
import { permissoesDoEmail } from '../permissoes.js';

export class ErroApi extends Error {
  constructor(status, codigo, mensagem, extra) {
    super(mensagem || codigo);
    this.status = status;
    this.codigo = codigo;
    this.extra = extra || null;
  }
}

// Interrompe a rota com a resposta de erro (a mensagem aparece na tela)
export function falha(status, codigo, mensagem, extra) {
  throw new ErroApi(status, codigo, mensagem, extra);
}

export function json(dados, status = 200) {
  return Response.json(dados, { status });
}

export const uuid = () => crypto.randomUUID();
export const agora = () => new Date().toISOString();

// Data de hoje no fuso de São Paulo (AAAA-MM-DD)
export function hoje() {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });
}

export function somarDias(dataIso, dias) {
  const d = new Date(dataIso + 'T12:00:00Z');
  d.setUTCDate(d.getUTCDate() + (Number(dias) || 0));
  return d.toISOString().slice(0, 10);
}

export function token() {
  return (crypto.randomUUID() + crypto.randomUUID()).replace(/-/g, '').slice(0, 40);
}

export function arred(valor, casas = 2) {
  const f = 10 ** casas;
  return Math.round((Number(valor) || 0) * f) / f;
}
export const arredQtd = (v) => arred(v, 4);

export const lista = (valores) => JSON.stringify(Array.from(new Set(valores)));

export function lerJson(texto, padrao) {
  if (texto == null || texto === '') return padrao;
  try { return JSON.parse(texto); } catch (e) { return padrao; }
}

/* ---------- usuário da sessão ---------- */
// Usuário da sessão com as permissões por módulo (functions/_lib/permissoes.js). O roteador
// (rotas.js) confere a permissão da rota e marca podeEditarModulo para exigirEdicao.
export async function contextoUsuario(request, env) {
  const cookie = lerCookie(request, 'sessao');
  const sessao = cookie ? await validarSessao(cookie, env.SESSION_SECRET) : null;
  if (!sessao || !sessao.email) return null;
  const email = sessao.email.toLowerCase();
  const { usuario, isAdmin, permissoes } = await permissoesDoEmail(env, email);
  return { email, nome: (usuario && usuario.nome) || sessao.nome || email, isAdmin, permissoes, podeEditarModulo: false };
}

export function exigirEdicao(ctx) {
  if (!ctx.podeEditarModulo) {
    falha(403, 'somente_visualizacao', 'Você não tem permissão para editar este módulo. Peça ao administrador (Usuários › Editar permissões).');
  }
}

export function exigirAdmin(ctx) {
  if (!ctx.isAdmin) falha(403, 'nao_autorizado', 'Só administradores podem alterar esta configuração.');
}

/* ---------- validação ---------- */
export function texto(valor, campo, { max = 500, obrigatorio = false, rotulo } = {}) {
  if (valor == null) valor = '';
  if (typeof valor === 'number') valor = String(valor);
  if (typeof valor !== 'string') falha(400, 'campo_invalido', `Campo inválido: ${rotulo || campo}.`);
  const limpo = valor.trim();
  if (obrigatorio && !limpo) falha(400, 'campo_obrigatorio', `Informe ${rotulo || campo}.`);
  if (limpo.length > max) falha(400, 'campo_invalido', `${rotulo || campo}: no máximo ${max} caracteres.`);
  return limpo || null;
}

export function numero(valor, campo, { min = null, max = null, obrigatorio = true, rotulo, inteiro = false } = {}) {
  if (valor == null || valor === '') {
    if (obrigatorio) falha(400, 'campo_obrigatorio', `Informe ${rotulo || campo}.`);
    return null;
  }
  const n = typeof valor === 'number' ? valor : Number(String(valor).replace(',', '.'));
  if (!Number.isFinite(n) || (inteiro && !Number.isInteger(n))) falha(400, 'campo_invalido', `Valor inválido em ${rotulo || campo}.`);
  if (min != null && n < min) falha(400, 'campo_invalido', `${rotulo || campo} deve ser no mínimo ${min}.`);
  if (max != null && n > max) falha(400, 'campo_invalido', `${rotulo || campo} deve ser no máximo ${max}.`);
  return n;
}

export function dataIso(valor, campo, { obrigatorio = false, rotulo } = {}) {
  if (valor == null || valor === '') {
    if (obrigatorio) falha(400, 'campo_obrigatorio', `Informe ${rotulo || campo}.`);
    return null;
  }
  if (typeof valor !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(valor) || Number.isNaN(Date.parse(valor + 'T00:00:00Z'))) {
    falha(400, 'campo_invalido', `Data inválida em ${rotulo || campo}.`);
  }
  return valor;
}

export function escolha(valor, opcoes, campo, padrao) {
  if (valor == null || valor === '') return padrao;
  if (!opcoes.includes(valor)) falha(400, 'campo_invalido', `Opção inválida em ${campo}.`);
  return valor;
}

export function listaObrigatoria(valor, campo, { max = 500, rotulo } = {}) {
  if (!Array.isArray(valor) || !valor.length) falha(400, 'campo_obrigatorio', `Inclua ao menos um item em ${rotulo || campo}.`);
  if (valor.length > max) falha(400, 'campo_invalido', `${rotulo || campo}: no máximo ${max} itens.`);
  return valor;
}

export async function lerCorpo(request) {
  try {
    const corpo = await request.json();
    return corpo && typeof corpo === 'object' ? corpo : {};
  } catch (e) {
    falha(400, 'json_invalido', 'Os dados enviados não puderam ser lidos.');
  }
}

/* ---------- apropriação nos serviços da EAP ---------- */
// Entrada: [{servicoId, quantidade}] ou [{servicoId, percentual}]. Saída: [{servicoId, percentual}]
// somando 100 (a última parcela absorve o arredondamento).
export function normalizarApropriacoes(entrada, servicosValidos, rotulo) {
  if (!Array.isArray(entrada) || !entrada.length) {
    falha(400, 'apropriacao_obrigatoria', `Informe em que serviço do orçamento ${rotulo || 'o item'} será apropriado.`);
  }
  const porServico = new Map();
  for (const a of entrada) {
    if (!a || typeof a.servicoId !== 'string' || !servicosValidos.has(a.servicoId)) {
      falha(400, 'apropriacao_invalida', `Apropriação de ${rotulo || 'item'} em serviço que não existe no orçamento.`);
    }
    const peso = a.quantidade != null ? Number(a.quantidade) : Number(a.percentual);
    if (!Number.isFinite(peso) || peso < 0) falha(400, 'apropriacao_invalida', `Apropriação inválida em ${rotulo || 'item'}.`);
    if (peso > 0) porServico.set(a.servicoId, (porServico.get(a.servicoId) || 0) + peso);
  }
  const total = Array.from(porServico.values()).reduce((s, v) => s + v, 0);
  if (!(total > 0)) falha(400, 'apropriacao_invalida', `A apropriação de ${rotulo || 'item'} está zerada.`);
  const itens = Array.from(porServico.entries());
  let acumulado = 0;
  return itens.map(([servicoId, peso], i) => {
    const percentual = i === itens.length - 1 ? arred(100 - acumulado, 6) : arred((peso / total) * 100, 6);
    acumulado += percentual;
    return { servicoId, percentual };
  });
}

/* ---------- numeração ---------- */
export async function proximoNumero(env, chave) {
  const linha = await env.DB.prepare(
    `INSERT INTO contadores (chave, valor) VALUES (?1, 1)
     ON CONFLICT(chave) DO UPDATE SET valor = valor + 1 RETURNING valor`
  ).bind('supr_' + chave).first();
  return linha.valor;
}

/* ---------- histórico ---------- */
export function historico(env, ctx, entidade, entidadeId, acao, detalhe) {
  return env.DB.prepare(
    `INSERT INTO supr_historico (id, entidade, entidadeId, acao, detalhe, usuarioEmail, usuarioNome, criadoEm)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  ).bind(uuid(), entidade, entidadeId, acao, detalhe || null, ctx ? ctx.email : null, ctx ? ctx.nome : 'Fornecedor (portal)', agora());
}

export async function lerHistorico(env, entidade, ids) {
  const { results } = await env.DB.prepare(
    `SELECT entidade, entidadeId, acao, detalhe, usuarioEmail, usuarioNome, criadoEm FROM supr_historico
      WHERE entidade = ?1 AND entidadeId IN (SELECT value FROM json_each(?2)) ORDER BY criadoEm`
  ).bind(entidade, lista(Array.isArray(ids) ? ids : [ids])).all();
  return results;
}

/* ---------- parâmetros ---------- */
export const PARAMETROS_PADRAO = {
  solicitacao_exige_autorizacao: '1',
  pedido_exige_autorizacao: '1',
  contrato_exige_autorizacao: '1',
  medicao_exige_autorizacao: '1',
  bloquear_acima_orcado: '0',
  empresa_nome: 'Cazú Projetos e Construções',
  empresa_documento: '',
  empresa_endereco: '',
  local_entrega_padrao: ''
};

export async function parametros(env) {
  const { results } = await env.DB.prepare('SELECT chave, valor FROM supr_parametros').all();
  const p = { ...PARAMETROS_PADRAO };
  for (const r of results) if (r.chave in p) p[r.chave] = r.valor;
  return p;
}
export const ligado = (valor) => valor === '1' || valor === 'true' || valor === true;

/* ---------- alçadas ---------- */
export const TIPOS_ALCADA = ['solicitacao', 'pedido', 'contrato', 'medicao'];

export async function alcadasDoUsuario(env, ctx) {
  if (ctx.isAdmin) return Object.fromEntries(TIPOS_ALCADA.map((t) => [t, null]));
  const { results } = await env.DB.prepare('SELECT tipo, valorLimite FROM supr_alcadas WHERE email = ?').bind(ctx.email).all();
  return Object.fromEntries(results.map((r) => [r.tipo, r.valorLimite]));
}

export function cabeNaAlcada(alcadas, tipo, valor) {
  if (!(tipo in alcadas)) return false;
  const limite = alcadas[tipo];
  return limite == null || (Number(valor) || 0) <= limite + 0.005;
}

export async function exigirAlcada(env, ctx, tipo, valor) {
  const alcadas = await alcadasDoUsuario(env, ctx);
  if (!cabeNaAlcada(alcadas, tipo, valor)) {
    const limite = alcadas[tipo];
    falha(403, 'sem_alcada', tipo in alcadas
      ? `O valor passa da sua alçada de autorização (limite de R$ ${Number(limite).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}).`
      : 'Você não tem alçada para autorizar este tipo de documento. Peça ao administrador.');
  }
}

/* ---------- fornecedores e obras ---------- */
export async function fornecedorAtivo(env, id) {
  if (!id) falha(400, 'campo_obrigatorio', 'Informe o fornecedor.');
  const f = await env.DB.prepare('SELECT * FROM supr_fornecedores WHERE id = ?').bind(id).first();
  if (!f) falha(404, 'fornecedor_nao_encontrado', 'Fornecedor não encontrado.');
  if (!f.ativo) falha(400, 'fornecedor_inativo', `O fornecedor ${f.nome} está inativo.`);
  return f;
}

// Parcelas a partir das condições: [{dias, percentual}] -> [{vencimento, valor}]
export function gerarParcelas(parcelas, dataBase, valorTotal) {
  const lista = Array.isArray(parcelas) && parcelas.length ? parcelas : [{ dias: 0, percentual: 100 }];
  let acumulado = 0;
  return lista.map((p, i) => {
    const valor = i === lista.length - 1 ? arred(valorTotal - acumulado) : arred(valorTotal * (Number(p.percentual) || 0) / 100);
    acumulado = arred(acumulado + valor);
    return { vencimento: somarDias(dataBase, p.dias), valor };
  });
}

// Condição digitada como texto ("28 dias", "30/60/90", "Entrada + 30", "À vista"): parcelas iguais
// nos dias citados; sem número reconhecível, à vista
export function parcelasDoTexto(textoCondicao) {
  const t = String(textoCondicao || '').toLowerCase();
  let dias = (t.match(/\d+/g) || []).map(Number).filter((d) => d >= 0 && d <= 365).slice(0, 12);
  if (/entrada|sinal|ato/.test(t) && !dias.includes(0)) dias.unshift(0);
  if (!dias.length) dias = [0];
  dias = Array.from(new Set(dias)).sort((a, b) => a - b);
  const base = Math.floor(10000 / dias.length) / 100;
  return dias.map((d, i) => ({ dias: d, percentual: i === 0 ? arred(100 - base * (dias.length - 1)) : base }));
}

export function validarParcelas(parcelas) {
  if (!Array.isArray(parcelas) || !parcelas.length) falha(400, 'parcelas_invalidas', 'Informe ao menos uma parcela.');
  if (parcelas.length > 48) falha(400, 'parcelas_invalidas', 'No máximo 48 parcelas.');
  const limpas = parcelas.map((p) => ({
    dias: numero(p.dias, 'dias', { min: 0, max: 3650, inteiro: true, rotulo: 'os dias da parcela' }),
    percentual: numero(p.percentual, 'percentual', { min: 0.01, max: 100, rotulo: 'o percentual da parcela' })
  }));
  const soma = limpas.reduce((s, p) => s + p.percentual, 0);
  if (Math.abs(soma - 100) > 0.05) falha(400, 'parcelas_invalidas', 'Os percentuais das parcelas devem somar 100%.');
  return limpas;
}
