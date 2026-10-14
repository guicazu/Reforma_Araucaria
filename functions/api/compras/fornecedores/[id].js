import { lerCookie, validarSessao } from '../../../_lib/session.js';
import { podeEditar } from '../../../_lib/admin.js';

export async function onRequestDelete({ request, env }) {
  const token = lerCookie(request, 'sessao');
  const payload = token ? await validarSessao(token, env.SESSION_SECRET) : null;
  if (!payload) return Response.json({ erro: 'nao_autenticado' }, { status: 401 });
  if (!(await podeEditar(payload, env))) {
    return Response.json({ erro: 'somente_visualizacao' }, { status: 403 });
  }

  const url = new URL(request.url);
  const id = url.pathname.split('/').pop();
  if (!id) return Response.json({ erro: 'parametros_invalidos' }, { status: 400 });

  try {
    await env.DB.prepare('DELETE FROM fornecedores WHERE id = ?').bind(id).run();
    return Response.json({ ok: true });
  } catch (e) {
    // Fornecedor com histórico (cotação/pedido): não exclui para não quebrar referências
    return Response.json({ erro: 'fornecedor_em_uso' }, { status: 409 });
  }
}