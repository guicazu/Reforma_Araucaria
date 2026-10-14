import { lerCookie, validarSessao } from '../../../_lib/session.js';
import { podeEditar } from '../../../_lib/admin.js';

export async function onRequestGet({ env, params }) {
  const requisicao = await env.DB.prepare('SELECT * FROM requisicoes WHERE id = ?').bind(params.id).first();
  if (!requisicao) return Response.json({ erro: 'nao_encontrada' }, { status: 404 });
  const { results: itens } = await env.DB.prepare(
    'SELECT * FROM itens_requisicao WHERE requisicaoId = ?'
  ).bind(params.id).all();
  requisicao.itens = itens;
  return Response.json({ requisicao });
}

// PUT body: { status: 'cancelada' }  (único update direto suportado por aqui;
// status "em_cotacao"/"pedido_gerado" são setados automaticamente pelo fluxo de cotação)
export async function onRequestPut({ request, env, params }) {
  const token = lerCookie(request, 'sessao');
  const payload = token ? await validarSessao(token, env.SESSION_SECRET) : null;
  if (!payload) return Response.json({ erro: 'nao_autenticado' }, { status: 401 });
  if (!(await podeEditar(payload, env))) {
    return Response.json({ erro: 'somente_visualizacao' }, { status: 403 });
  }
  const corpo = await request.json();
  if (!corpo || corpo.status !== 'cancelada') {
    return Response.json({ erro: 'status_invalido' }, { status: 400 });
  }
  const agora = new Date().toISOString();
  const result = await env.DB.batch([
    env.DB.prepare('UPDATE requisicoes SET status = ?, atualizadoEm = ? WHERE id = ?').bind('cancelada', agora, params.id),
    env.DB.prepare("UPDATE itens_requisicao SET status = 'cancelado' WHERE requisicaoId = ?").bind(params.id),
  ]);
  if (!result[0].meta || result[0].meta.changes !== 1) {
    return Response.json({ erro: 'nao_encontrada' }, { status: 404 });
  }
  return Response.json({ ok: true });
}
