// Roteador das APIs functions/api/<área>/[[rota]].js: uma tabela método + caminho -> função, com
// a permissão de cada rota conferida antes de chamar a função (Usuários › Editar permissões). As
// funções recebem { request, env, ctx (usuário), params, corpo, url } e devolvem a Response; erros
// esperados são ErroApi (status + código + mensagem para a tela).
import { json, ErroApi, contextoUsuario, lerCorpo } from './suprimentos/base.js';
import { MODULOS, pode, veSuprimentos } from './permissoes.js';

const NOMES_MODULOS = Object.fromEntries(MODULOS.map((m) => [m.chave, m.nome]));

// Permissão: 'livre' (qualquer usuário aprovado), 'admin', '*' (vê algum módulo de Suprimentos ou
// Financeiro) ou 'modulo:ver' / 'modulo:editar'. Devolve a resposta de recusa ou null.
function recusa(ctx, permissao) {
  if (permissao === 'livre') return null;
  if (permissao === 'admin') return ctx.isAdmin ? null : falhaPermissao('Só administradores podem fazer isso.');
  if (permissao === '*') return veSuprimentos(ctx.permissoes) ? null : falhaPermissao('Você não tem acesso a Suprimentos. Peça ao administrador.');
  const [modulo, acao] = permissao.split(':');
  ctx.podeEditarModulo = pode(ctx.permissoes, modulo, 'editar');
  if (acao === 'editar' && !ctx.podeEditarModulo) {
    return falhaPermissao(`Você não tem permissão para editar ${NOMES_MODULOS[modulo] || modulo}. Peça ao administrador (Usuários › Editar permissões).`);
  }
  if (!pode(ctx.permissoes, modulo, 'visualizar')) return falhaPermissao(`Você não tem acesso a ${NOMES_MODULOS[modulo] || modulo}.`);
  return null;
}
function falhaPermissao(mensagem) {
  return json({ erro: 'sem_permissao', mensagem }, 403);
}

// rotas: [[metodo, caminho ('obras/:id/avancos'), funcao, permissao]]; area e migracao entram na
// mensagem de banco sem as tabelas
export function criarRoteador(rotas, { area, migracao }) {
  const tabela = rotas.map(([metodo, caminho, funcao, permissao]) => ({ metodo, partes: caminho.split('/'), funcao, permissao }));
  function encontrar(metodo, partes) {
    for (const r of tabela) {
      if (r.metodo !== metodo || r.partes.length !== partes.length) continue;
      const params = {};
      let ok = true;
      for (let i = 0; i < partes.length && ok; i++) {
        if (r.partes[i].startsWith(':')) params[r.partes[i].slice(1)] = decodeURIComponent(partes[i]);
        else ok = r.partes[i] === partes[i];
      }
      if (ok) return { funcao: r.funcao, params, permissao: r.permissao };
    }
    return null;
  }
  return async function tratarRota({ request, env, params }) {
    const url = new URL(request.url);
    const partes = (Array.isArray(params.rota) ? params.rota : params.rota ? [params.rota] : []).filter(Boolean);
    try {
      const ctx = await contextoUsuario(request, env);
      if (!ctx) return json({ erro: 'nao_autenticado', mensagem: 'Sua sessão expirou. Entre de novo.' }, 401);
      const rota = encontrar(request.method, partes);
      if (!rota) return json({ erro: 'rota_inexistente', mensagem: 'Operação não encontrada.' }, 404);
      const negado = recusa(ctx, rota.permissao);
      if (negado) return negado;
      const comCorpo = ['POST', 'PUT', 'DELETE'].includes(request.method) && (request.headers.get('content-type') || '').includes('json');
      const corpo = comCorpo ? await lerCorpo(request) : {};
      return await rota.funcao({ request, env, ctx, params: rota.params, corpo, url });
    } catch (e) {
      if (e instanceof ErroApi) return json({ erro: e.codigo, mensagem: e.message, ...(e.extra ? { detalhes: e.extra } : {}) }, e.status);
      console.error('[' + area + ']', request.method, url.pathname, e);
      if (/no such table|no such column/i.test(String(e && e.message))) {
        return json({ erro: 'banco_desatualizado', mensagem: `O banco ainda não tem as tabelas de ${area}: aplique ${migracao}.` }, 500);
      }
      return json({ erro: 'erro_interno', mensagem: 'Erro inesperado no servidor. Tente de novo; se continuar, avise o administrador.' }, 500);
    }
  };
}
