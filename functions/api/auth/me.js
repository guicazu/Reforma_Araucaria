import { lerCookie, validarSessao } from '../../_lib/session.js';
import { permissoesDoEmail } from '../../_lib/permissoes.js';

export async function onRequestGet({ request, env }) {
  const token = lerCookie(request, 'sessao');
  const payload = token ? await validarSessao(token, env.SESSION_SECRET) : null;

  if (!payload) {
    return new Response('Não autenticado', { status: 401 });
  }

  const { usuario, isAdmin, permissoes } = await permissoesDoEmail(env, payload.email);
  const extra = await env.DB.prepare('SELECT telefone FROM usuarios WHERE email = ?').bind(payload.email.toLowerCase()).first();

  return Response.json({
    email: payload.email,
    nome: (usuario && usuario.nome) || payload.nome,
    telefone: extra ? extra.telefone : null,
    isAdmin,
    // permissão por módulo; podeEditar = pode editar orçamento (telas antigas usam este campo)
    podeEditar: permissoes.orcamento.editar,
    permissoes
  });
}
