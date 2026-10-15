// Orçado da obra para Suprimentos: a EAP da versão ativa do orçamento e os insumos de cada serviço,
// com as composições abertas até os insumos (mesma regra da curva ABC de insumos em js/relatorios.js):
// - SINAPI pela base própria, no mês de referência da versão (functions/_lib/sinapi-base.js);
// - composições próprias pelos componentes do catálogo (insumo próprio com código SINAPI de
//   referência soma com o mesmo insumo do SINAPI);
// - serviço sem composição (ou que não abriu) vira um item só, comprável como serviço/verba.
// Quantidade do insumo = coeficiente × quantidade do serviço; o valor usa as proporções da
// composição aplicadas ao preço unitário do orçamento, para os totais baterem com o orçamento.
// O resultado fica em supr_orcado_cache até mudar a versão/revisão, a referência ou o catálogo.
import { escolherReferencia, decomporDaBase } from '../sinapi-base.js';
import { agora, falha, lerJson } from './base.js';

const VERSAO_CALCULO = 3;
const RE_ENCARGOS = /encargos complementares/i;
const RE_LOCACAO = /(?<!\p{L})(loca[cç][aã]o|aluguel)/iu;

/* ---------- quantidade do serviço (mesma conta de js/app.js) ---------- */
function num(v) {
  if (v == null || String(v).trim() === '') return null;
  let s = String(v).trim();
  if (s.includes(',')) s = s.replace(/\./g, '').replace(',', '.');
  else if ((s.match(/\./g) || []).length > 1) s = s.replace(/\./g, '');
  const n = Number(s);
  return Number.isNaN(n) ? null : n;
}
const num2 = (n) => Math.round((Number(n) || 0) * 100) / 100;
function valorLinhaMemo(l) {
  const medidas = [l.comprimento, l.largura, l.altura].map(num).filter((v) => v != null);
  const q = num(l.quantidade), coef = num(l.coeficiente);
  if (!medidas.length && q == null && coef == null) return null;
  return medidas.reduce((acc, v) => acc * v, 1) * (q ?? 1) * (coef ?? 1);
}
export function qtdServico(sv) {
  if (Array.isArray(sv.memo) && sv.memo.length) return num2(sv.memo.reduce((acc, l) => acc + (valorLinhaMemo(l) || 0), 0));
  return num2(num(sv.qtdManual) || 0);
}

/* ---------- obras (orçamentos) ---------- */
export async function listarObras(env) {
  const { results } = await env.DB.prepare(
    `SELECT v.orcamentoId AS id, v.codigo, v.nome, v.versaoNumero, v.revisao, v.referencia
       FROM orcamentos_versoes v
      WHERE v.versaoNumero = (SELECT MAX(x.versaoNumero) FROM orcamentos_versoes x WHERE x.orcamentoId = v.orcamentoId)
      ORDER BY v.codigo, v.nome`
  ).all();
  return results;
}

async function versaoAtiva(env, orcamentoId, comConteudo) {
  return env.DB.prepare(
    `SELECT id, orcamentoId, versaoNumero, revisao, referencia, codigo, nome${comConteudo ? ', conteudo' : ''}
       FROM orcamentos_versoes WHERE orcamentoId = ? ORDER BY versaoNumero DESC LIMIT 1`
  ).bind(orcamentoId).first();
}

export async function exigirObra(env, orcamentoId) {
  if (!orcamentoId || typeof orcamentoId !== 'string') falha(400, 'obra_obrigatoria', 'Escolha a obra.');
  const v = await versaoAtiva(env, orcamentoId, false);
  if (!v) falha(404, 'obra_nao_encontrada', 'Obra (orçamento) não encontrada.');
  return v;
}

/* ---------- EAP: mesmos códigos da tabela do orçamento ---------- */
export function estruturaEap(unidades) {
  const nos = [];
  const lista = Array.isArray(unidades) ? unidades : [];
  function servico(sv, eap, nivel, paiId, caminho) {
    if (!sv || !sv.id) return;
    const quantidade = qtdServico(sv);
    const valorUnitario = num(sv.valorUnitario) || 0;
    nos.push({
      tipo: 'servico', id: sv.id, eap, nivel, paiId, caminho,
      nome: sv.nome || '', unidade: String(sv.unidadeMedida || '').trim(),
      quantidade, valorUnitario, valor: Math.round(quantidade * valorUnitario * 100) / 100,
      catalogoTipo: sv.catalogoTipo || null, codigo: String(sv.codigo || sv.catalogoId || '').trim(), catalogoId: sv.catalogoId || null
    });
  }
  lista.forEach((u, iu) => {
    const cU = String(iu + 1);
    nos.push({ tipo: 'unidade', id: u.id, eap: cU, nivel: 1, paiId: null, nome: u.nome || '' });
    (u.etapas || []).forEach((e, ie) => {
      const cE = cU + '.' + (ie + 1);
      nos.push({ tipo: 'etapa', id: e.id, eap: cE, nivel: 2, paiId: u.id, nome: e.nome || '' });
      const diretos = Array.isArray(e.servicos) ? e.servicos : [];
      // serviço direto na etapa é o 3º nível, antes das sub etapas (como na tela)
      diretos.forEach((sv, i) => servico(sv, cE + '.' + (i + 1), 3, e.id, [u.nome, e.nome]));
      (e.subEtapas || []).forEach((s, is) => {
        const cS = cE + '.' + (diretos.length + is + 1);
        nos.push({ tipo: 'sub', id: s.id, eap: cS, nivel: 3, paiId: e.id, nome: s.nome || '' });
        (s.servicos || []).forEach((sv, i) => servico(sv, cS + '.' + (i + 1), 4, s.id, [u.nome, e.nome, s.nome]));
      });
    });
  });
  return nos;
}

/* ---------- abertura das composições ---------- */
function tipoRecurso(nome, unidade) {
  const un = String(unidade || '').trim().toUpperCase();
  if (un === 'CHP' || un === 'CHI' || RE_LOCACAO.test(nome || '')) return 'equipamento';
  if (un === 'H') return 'maoDeObra';
  return 'material';
}

function acumular(mapa, recurso, coeficiente) {
  const atual = mapa.get(recurso.chave);
  if (atual) { atual.coeficiente += coeficiente; return; }
  mapa.set(recurso.chave, { ...recurso, coeficiente });
}

function abrirPropria(comp, fator, mapa, catalogo, profundidade) {
  for (const c of lerJson(comp.componentes, [])) {
    const coeficiente = fator * (num(c.coeficiente) || 0);
    if (!(coeficiente > 0)) continue;
    if (c.tipo === 'composicao') {
      const sub = catalogo.composicoes.get(c.composicaoId);
      const nome = sub ? sub.nome : c.nome;
      const un = String(sub ? sub.unidade : c.unidade || '').toUpperCase();
      const componentes = sub ? lerJson(sub.componentes, []) : [];
      const ehRecurso = !sub || !componentes.length || profundidade >= 8 ||
        un === 'CHP' || un === 'CHI' || (un === 'H' && RE_ENCARGOS.test(nome || ''));
      if (!ehRecurso) { abrirPropria(sub, coeficiente, mapa, catalogo, profundidade + 1); continue; }
      const ref = sub && sub.codigoReferencia;
      acumular(mapa, {
        chave: ref ? 'C:' + ref : 'PC:' + c.composicaoId, codigo: ref || (sub && sub.codigo) || '',
        base: ref ? 'SINAPI' : 'Própria', descricao: nome || '', unidade: (sub ? sub.unidade : c.unidade) || '',
        tipo: tipoRecurso(nome, un), preco: num(sub ? sub.valorUnitario : c.valorUnitario) || 0
      }, coeficiente);
      continue;
    }
    const ins = catalogo.insumos.get(c.insumoId);
    const nomeI = c.detalheId ? c.nome : (ins ? ins.nome : c.nome);
    const refI = ins && ins.codigoReferencia;
    acumular(mapa, {
      chave: refI ? 'I:' + refI : 'PI:' + c.insumoId + (c.detalheId ? ':' + c.detalheId : ''),
      codigo: refI || (ins && ins.codigo) || '', base: refI ? 'SINAPI' : 'Própria', descricao: nomeI || '',
      unidade: (ins ? ins.unidade : c.unidade) || '', tipo: tipoRecurso(nomeI, ins ? ins.unidade : c.unidade),
      preco: num(ins ? ins.valorUnitario : c.valorUnitario) || 0
    }, coeficiente);
  }
}

function recursosDe(lista) {
  const recursos = Array.from(lista);
  const custo = recursos.reduce((s, r) => s + r.coeficiente * r.preco, 0);
  return custo > 0 ? { recursos, custo } : null;
}

async function carregarCatalogo(env) {
  const [comps, ins] = await env.DB.batch([
    env.DB.prepare('SELECT id, codigo, nome, unidade, valorUnitario, codigoReferencia, componentes FROM composicoes'),
    env.DB.prepare('SELECT id, codigo, nome, unidade, valorUnitario, codigoReferencia FROM insumos')
  ]);
  return {
    composicoes: new Map(comps.results.map((c) => [c.id, c])),
    insumos: new Map(ins.results.map((i) => [i.id, i]))
  };
}

async function calcular(env, versao) {
  const unidades = lerJson(versao.conteudo, []);
  const eap = estruturaEap(unidades);
  const servicos = eap.filter((n) => n.tipo === 'servico');
  const avisos = [];
  let referencia = null;

  // SINAPI: uma abertura para todas as composições da versão
  const decomposicoes = new Map();
  const codigosSinapi = Array.from(new Set(servicos
    .filter((sv) => sv.catalogoTipo === 'sinapi' && /^\d+$/.test(sv.codigo)).map((sv) => sv.codigo)));
  if (codigosSinapi.length) {
    const escolha = await escolherReferencia(env, versao.referencia || '');
    if (escolha.erro) {
      avisos.push(`A referência SINAPI do orçamento (${versao.referencia}) não está na base: os serviços SINAPI entram sem abrir os insumos. Importe o mês em Base SINAPI.`);
    } else if (!escolha.ref) {
      avisos.push('A base SINAPI ainda não tem mês importado: os serviços SINAPI entram sem abrir os insumos.');
    } else {
      referencia = escolha.ref.mes;
      const r = await decomporDaBase(env, escolha.ref, codigosSinapi);
      for (const c of r.composicoes) decomposicoes.set(String(c.codigo), c);
    }
  }
  const catalogo = servicos.some((sv) => sv.catalogoTipo === 'composicao') ? await carregarCatalogo(env) : null;

  const insumos = new Map();
  let naoAbertos = 0;
  function somar(sv, r, quantidade, valor) {
    let item = insumos.get(r.chave);
    if (!item) {
      item = { chave: r.chave, codigo: r.codigo || '', descricao: r.descricao || '', unidade: r.unidade || '',
        tipo: r.tipo, base: r.base, quantidade: 0, valor: 0, servicos: {} };
      insumos.set(r.chave, item);
    }
    item.quantidade += quantidade;
    item.valor += valor;
    const porServico = item.servicos[sv.id] || (item.servicos[sv.id] = [0, 0]);
    porServico[0] += quantidade;
    porServico[1] += valor;
  }

  for (const sv of servicos) {
    if (!(sv.quantidade > 0)) continue;
    let base = null;
    if (sv.catalogoTipo === 'sinapi') {
      const c = decomposicoes.get(sv.codigo);
      if (c && !c.erro) {
        base = recursosDe(c.recursos.map((r) => ({
          chave: r.chave, codigo: r.codigo, base: 'SINAPI', descricao: r.descricao, unidade: r.unidade,
          tipo: r.tipo, preco: Number(r.preco) || 0, coeficiente: Number(r.coeficiente) || 0
        })));
      }
    } else if (sv.catalogoTipo === 'composicao' && catalogo) {
      const comp = catalogo.composicoes.get(sv.catalogoId);
      if (comp) {
        const mapa = new Map();
        abrirPropria(comp, 1, mapa, catalogo, 0);
        base = recursosDe(mapa.values());
      }
    }
    if (!base) {
      if (sv.catalogoTipo) naoAbertos++;
      somar(sv, { chave: 'S:' + sv.id, codigo: sv.codigo, descricao: sv.nome, unidade: sv.unidade, tipo: 'servico', base: 'Orçamento' },
        sv.quantidade, sv.valor);
      continue;
    }
    // proporções da composição aplicadas ao preço do orçamento
    const fator = sv.valorUnitario > 0 ? sv.valorUnitario / base.custo : 1;
    for (const r of base.recursos) {
      somar(sv, r, r.coeficiente * sv.quantidade, r.coeficiente * r.preco * fator * sv.quantidade);
    }
  }
  if (naoAbertos) avisos.push(`${naoAbertos} serviço(s) não puderam ser abertos em insumos e entram como um item só.`);

  const arred = (v, c) => Math.round(v * 10 ** c) / 10 ** c;
  return {
    versao: { id: versao.id, numero: versao.versaoNumero, revisao: versao.revisao || 0, referencia: versao.referencia || null },
    obra: { id: versao.orcamentoId, codigo: versao.codigo || '', nome: versao.nome || '' },
    referenciaSinapi: referencia,
    avisos,
    eap,
    insumos: Array.from(insumos.values()).map((i) => {
      for (const k of Object.keys(i.servicos)) i.servicos[k] = [arred(i.servicos[k][0], 6), arred(i.servicos[k][1], 4)];
      return { ...i, quantidade: arred(i.quantidade, 6), valor: arred(i.valor, 2) };
    }).sort((a, b) => b.valor - a.valor),
    geradoEm: agora()
  };
}

async function carimboCatalogo(env) {
  try {
    const r = await env.DB.prepare(
      `SELECT (SELECT MAX(atualizadoEm) FROM composicoes) AS comp, (SELECT COUNT(*) FROM composicoes) AS nComp,
              (SELECT MAX(atualizadoEm) FROM insumos) AS ins, (SELECT COUNT(*) FROM insumos) AS nIns,
              (SELECT MAX(mes) FROM sinapi_referencias WHERE status = 'ok') AS mes`
    ).first();
    return [r.comp, r.nComp, r.ins, r.nIns, r.mes].join('|');
  } catch (e) {
    return 'sem-catalogo';
  }
}

// Orçado da obra (EAP + insumos), do cache quando nada mudou
export async function orcadoDaObra(env, orcamentoId) {
  const versao = await exigirObra(env, orcamentoId);
  const chave = [VERSAO_CALCULO, versao.id, versao.revisao || 0, versao.referencia || '', await carimboCatalogo(env)].join('|');
  const cache = await env.DB.prepare('SELECT chave, dados FROM supr_orcado_cache WHERE orcamentoId = ?').bind(orcamentoId).first();
  if (cache && cache.chave === chave) {
    const dados = lerJson(cache.dados, null);
    if (dados) return dados;
  }
  const completa = await versaoAtiva(env, orcamentoId, true);
  const dados = await calcular(env, completa);
  await env.DB.prepare(
    `INSERT INTO supr_orcado_cache (orcamentoId, chave, dados, geradoEm) VALUES (?1, ?2, ?3, ?4)
     ON CONFLICT(orcamentoId) DO UPDATE SET chave = excluded.chave, dados = excluded.dados, geradoEm = excluded.geradoEm`
  ).bind(orcamentoId, chave, JSON.stringify(dados), dados.geradoEm).run();
  return dados;
}

export function servicosDoOrcado(orcado) {
  return new Map(orcado.eap.filter((n) => n.tipo === 'servico').map((n) => [n.id, n]));
}
