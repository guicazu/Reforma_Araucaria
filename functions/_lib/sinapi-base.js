// Consultas à base SINAPI própria (tabelas sinapi_*, importadas do arquivo oficial da Caixa).
// Quando ainda não há mês importado, referenciaAtual devolve null e as rotas usam a SINPRES.

import { SINAPI_ESTADO, SINAPI_DESONERADO } from './sinapi.js';

export const SINAPI_UF = SINAPI_ESTADO;
export const SINAPI_REGIME = SINAPI_DESONERADO === 'true' ? 'desonerado' : 'nao_desonerado';

const ENCARGOS = /encargos complementares/i;
const PROFUNDIDADE_MAXIMA = 10;

// Último mês importado por completo para a UF e o regime do site
export async function referenciaAtual(env) {
  if (!env || !env.DB) return null;
  try {
    const linha = await env.DB.prepare(
      "SELECT mes FROM sinapi_referencias WHERE uf = ?1 AND regime = ?2 AND status = 'ok' ORDER BY mes DESC LIMIT 1"
    ).bind(SINAPI_UF, SINAPI_REGIME).first();
    return linha ? { mes: linha.mes, uf: SINAPI_UF, regime: SINAPI_REGIME } : null;
  } catch (erro) {
    return null; // tabelas ainda não criadas
  }
}

function lista(codigos) { return JSON.stringify(Array.from(new Set(codigos)).map(Number)); }

async function infoComposicoes(env, ref, codigos) {
  const mapa = new Map();
  if (!codigos.length) return mapa;
  const { results } = await env.DB.prepare(
    `SELECT c.codigo, c.descricao, c.unidade, c.grupo, k.custo, k.maoDeObra, k.versao
       FROM sinapi_composicoes_custos k JOIN sinapi_composicoes c ON c.codigo = k.codigo
      WHERE k.mes = ?1 AND k.uf = ?2 AND k.regime = ?3 AND k.codigo IN (SELECT value FROM json_each(?4))`
  ).bind(ref.mes, ref.uf, ref.regime, lista(codigos)).all();
  for (const r of results) mapa.set(r.codigo, r);
  return mapa;
}

async function infoInsumos(env, ref, codigos) {
  const mapa = new Map();
  if (!codigos.length) return mapa;
  const { results } = await env.DB.prepare(
    `SELECT s.codigo, s.descricao, s.unidade, s.classificacao, p.preco
       FROM sinapi_insumos s
       LEFT JOIN sinapi_insumos_precos p ON p.codigo = s.codigo AND p.mes = ?1 AND p.uf = ?2 AND p.regime = ?3
      WHERE s.codigo IN (SELECT value FROM json_each(?4))`
  ).bind(ref.mes, ref.uf, ref.regime, lista(codigos)).all();
  for (const r of results) mapa.set(r.codigo, r);
  return mapa;
}

// Itens da versão da estrutura que valia no mês: [[tipo 'C'|'I', código, coeficiente], ...]
async function estruturas(env, ref, codigos) {
  const mapa = new Map();
  if (!codigos.length) return mapa;
  const { results } = await env.DB.prepare(
    `SELECT e.codigo, e.itens
       FROM sinapi_composicoes_custos k
       JOIN sinapi_composicoes_estruturas e ON e.codigo = k.codigo AND e.versao = k.versao
      WHERE k.mes = ?1 AND k.uf = ?2 AND k.regime = ?3 AND k.codigo IN (SELECT value FROM json_each(?4))`
  ).bind(ref.mes, ref.uf, ref.regime, lista(codigos)).all();
  for (const r of results) mapa.set(r.codigo, JSON.parse(r.itens));
  return mapa;
}

/* ---------- busca por palavras (FTS5, sem acento, prefixo) ---------- */
export async function buscarComposicoes(env, ref, palavras, limite) {
  const termos = palavras.map((p) => p.replace(/["*]/g, '').trim()).filter(Boolean).map((p) => `"${p}"*`);
  if (!termos.length) return [];
  const { results } = await env.DB.prepare(
    `SELECT c.codigo, c.descricao, c.unidade, k.custo
       FROM sinapi_composicoes_busca b
       JOIN sinapi_composicoes c ON c.codigo = b.rowid
       JOIN sinapi_composicoes_custos k ON k.codigo = c.codigo AND k.mes = ?2 AND k.uf = ?3 AND k.regime = ?4
      WHERE sinapi_composicoes_busca MATCH ?1
      ORDER BY b.rank LIMIT ?5`
  ).bind(termos.join(' OR '), ref.mes, ref.uf, ref.regime, limite).all();
  // código digitado entre as palavras também encontra a composição
  const codigos = palavras.filter((p) => /^\d{4,}$/.test(p)).map(Number);
  if (codigos.length) {
    const extras = await infoComposicoes(env, ref, codigos);
    for (const c of extras.values()) if (!results.some((r) => r.codigo === c.codigo)) results.unshift(c);
  }
  return results;
}

/* ---------- uma composição com seus itens (tela "Ver composição" e código digitado) ---------- */
export async function composicaoDaBase(env, ref, codigo) {
  const cod = Number(codigo);
  const [info, est] = await Promise.all([infoComposicoes(env, ref, [cod]), estruturas(env, ref, [cod])]);
  const c = info.get(cod);
  if (!c) return { encontrado: false };
  const itens = est.get(cod) || [];
  const [subs, insumos] = await Promise.all([
    infoComposicoes(env, ref, itens.filter((i) => i[0] === 'C').map((i) => i[1])),
    infoInsumos(env, ref, itens.filter((i) => i[0] === 'I').map((i) => i[1]))
  ]);
  return {
    encontrado: true,
    codigo: c.codigo,
    descricao: c.descricao,
    unidade: c.unidade,
    valor: c.custo,
    maoDeObra: c.maoDeObra,
    referencia: ref.mes,
    itens: itens.map(([tipo, item, coeficiente]) => {
      const x = tipo === 'C' ? subs.get(item) : insumos.get(item);
      const valorUnitario = x ? (tipo === 'C' ? x.custo : x.preco) : null;
      return {
        tipo: tipo === 'C' ? 'SUB_COMPOSITION' : 'INPUT',
        codigo: item,
        descricao: x ? x.descricao : '',
        unidade: x ? x.unidade : '',
        coeficiente,
        valorUnitario,
        valorTotal: valorUnitario == null ? null : Math.round(coeficiente * valorUnitario * 100) / 100
      };
    })
  };
}

/* ---------- abertura até os recursos (material, mão de obra, equipamento) ---------- */
// Insumos pela classificação oficial; "serviços" e "especiais" (terceirizados) contam como material.
// Profissional com encargos complementares (H) para a abertura e entra como um recurso só. O custo
// horário de equipamento (CHP/CHI) é aberto: operador vira mão de obra e combustível/energia,
// material (como no % oficial de mão de obra), e o resto volta a ser uma linha só de equipamento,
// como nos relatórios de curva ABC.
function tipoInsumo(classificacao) {
  const c = String(classificacao || '').toUpperCase();
  if (c.startsWith('MAO DE OBRA') || c.startsWith('MÃO DE OBRA')) return 'maoDeObra';
  if (c.startsWith('EQUIPAMENTO')) return 'equipamento';
  return 'material';
}
function ehProfissional(c) {
  return String(c.unidade || '').toUpperCase() === 'H' && ENCARGOS.test(c.descricao || '');
}
function ehCustoHorario(c) {
  const un = String(c.unidade || '').toUpperCase();
  return un === 'CHP' || un === 'CHI';
}
function tipoComposicaoRecurso(c) {
  const un = String(c.unidade || '').toUpperCase();
  return un === 'CHP' || un === 'CHI' ? 'equipamento' : un === 'H' ? 'maoDeObra' : 'material';
}

export async function decomporDaBase(env, ref, codigos) {
  const raizes = Array.from(new Set(codigos.map(Number)));
  const comps = await infoComposicoes(env, ref, raizes);
  const est = new Map();
  const insumos = new Map();
  let abrir = raizes.filter((c) => comps.has(c));
  for (let nivel = 0; abrir.length && nivel < PROFUNDIDADE_MAXIMA; nivel++) {
    const novas = await estruturas(env, ref, abrir);
    for (const [c, itens] of novas) est.set(c, itens);
    const subs = new Set(), ins = new Set();
    for (const c of abrir) for (const [tipo, item] of est.get(c) || []) {
      if (tipo === 'C' && !comps.has(item)) subs.add(item);
      if (tipo === 'I' && !insumos.has(item)) ins.add(item);
    }
    const [infoSubs, infoIns] = await Promise.all([infoComposicoes(env, ref, [...subs]), infoInsumos(env, ref, [...ins])]);
    for (const [k, v] of infoSubs) comps.set(k, v);
    for (const [k, v] of infoIns) insumos.set(k, v);
    abrir = [...subs].filter((c) => comps.has(c) && !ehProfissional(comps.get(c)) && !est.has(c));
  }

  // recursos por unidade de cada composição (memorizado: a mesma auxiliar aparece em várias)
  const memo = new Map();
  function recursosDe(codigo, profundidade) {
    if (memo.has(codigo)) return memo.get(codigo);
    const mapa = new Map();
    const somar = (chave, base, coeficiente) => {
      const atual = mapa.get(chave);
      if (atual) atual.coeficiente += coeficiente;
      else mapa.set(chave, { chave, ...base, coeficiente });
    };
    for (const [tipo, item, coeficiente] of est.get(codigo) || []) {
      if (tipo === 'I') {
        const x = insumos.get(item);
        somar('I:' + item, {
          codigo: String(item), descricao: x ? x.descricao : '', unidade: x ? x.unidade : '',
          tipo: tipoInsumo(x && x.classificacao), preco: x && x.preco != null ? x.preco : 0
        }, coeficiente);
        continue;
      }
      const c = comps.get(item);
      const abrirItem = c && !ehProfissional(c) && est.has(item) && profundidade < PROFUNDIDADE_MAXIMA;
      if (abrirItem && ehCustoHorario(c)) {
        // equipamento numa linha só (pelo custo da parte de equipamento); operador e insumos à parte
        let custoEquipamento = 0;
        for (const r of recursosDe(item, profundidade + 1).values()) {
          if (r.tipo === 'equipamento') custoEquipamento += r.coeficiente * r.preco;
          else somar(r.chave, r, r.coeficiente * coeficiente);
        }
        if (custoEquipamento > 0) {
          somar('C:' + item, { codigo: String(item), descricao: c.descricao, unidade: c.unidade, tipo: 'equipamento', preco: custoEquipamento }, coeficiente);
        }
        continue;
      }
      if (abrirItem) {
        for (const r of recursosDe(item, profundidade + 1).values()) somar(r.chave, r, r.coeficiente * coeficiente);
        continue;
      }
      somar('C:' + item, {
        codigo: String(item), descricao: c ? c.descricao : '', unidade: c ? c.unidade : '',
        tipo: c ? tipoComposicaoRecurso(c) : 'material', preco: c && c.custo != null ? c.custo : 0
      }, coeficiente);
    }
    memo.set(codigo, mapa);
    return mapa;
  }

  return {
    referencia: ref.mes,
    fonte: 'base',
    composicoes: raizes.map((codigo) => {
      const c = comps.get(codigo);
      if (!c) return { codigo: String(codigo), erro: 'nao_encontrado' };
      return {
        codigo: String(codigo),
        unidade: c.unidade,
        preco: c.custo,
        maoDeObra: c.maoDeObra,
        recursos: Array.from(recursosDe(codigo, 0).values())
      };
    })
  };
}
