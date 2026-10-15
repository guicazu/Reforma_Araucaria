// Permissões por módulo: o administrador marca, para cada usuário, se ele pode visualizar e/ou
// editar cada módulo do menu (tela Usuários › Editar permissões). Fica em usuarios.permissoes (JSON
// { modulo: { visualizar, editar } }). Usuário ainda não configurado (permissoes vazio) segue a
// regra antiga: visualiza tudo e edita tudo se usuarios.podeEditar = 1. Administrador pode tudo.
// Usuários, Liberação e Base SINAPI continuam só para administradores e não entram na matriz.

export const MODULOS = [
  { chave: 'orcamento', nome: 'Orçamento', grupo: 'Engenharia' },
  { chave: 'planejamento', nome: 'Planejamento', grupo: 'Engenharia' },
  { chave: 'composicoes', nome: 'Composições', grupo: 'Engenharia' },
  { chave: 'insumos', nome: 'Insumos', grupo: 'Engenharia' },
  { chave: 'unidades', nome: 'Unidades', grupo: 'Engenharia' },
  { chave: 'solicitacoes', nome: 'Solicitações de compra', grupo: 'Suprimentos' },
  { chave: 'cotacoes', nome: 'Cotações', grupo: 'Suprimentos' },
  { chave: 'pedidos', nome: 'Pedidos de compra', grupo: 'Suprimentos' },
  { chave: 'notas', nome: 'Notas fiscais', grupo: 'Suprimentos' },
  { chave: 'contratos', nome: 'Contratos e medições', grupo: 'Suprimentos' },
  { chave: 'estoque', nome: 'Estoque', grupo: 'Suprimentos' },
  { chave: 'acompanhamento', nome: 'Acompanhamento de custos', grupo: 'Suprimentos', soVisualizar: true },
  { chave: 'cadastros', nome: 'Cadastros de suprimentos', grupo: 'Suprimentos', detalhe: 'fornecedores e condições de pagamento' },
  { chave: 'financeiro', nome: 'Contas a pagar', grupo: 'Financeiro' },
  { chave: 'backup', nome: 'Backup', grupo: 'Apoio', detalhe: 'editar = importar backup' }
];

// Módulos de Suprimentos e Financeiro: quem vê algum deles vê o Painel e as Autorizações
export const MODULOS_SUPRIMENTOS = ['solicitacoes', 'cotacoes', 'pedidos', 'notas', 'contratos', 'estoque', 'acompanhamento', 'cadastros', 'financeiro'];

function lerJson(texto) {
  if (!texto) return null;
  try {
    const v = JSON.parse(texto);
    return v && typeof v === 'object' && !Array.isArray(v) ? v : null;
  } catch (e) { return null; }
}

// { modulo: { visualizar, editar } } de um registro de usuarios (com permissoes e podeEditar)
export function resolverPermissoes(usuario, isAdmin) {
  const salvas = isAdmin ? null : lerJson(usuario && usuario.permissoes);
  const legado = Boolean(usuario && usuario.podeEditar);
  const r = {};
  for (const m of MODULOS) {
    if (isAdmin) { r[m.chave] = { visualizar: true, editar: !m.soVisualizar }; continue; }
    if (!salvas) { r[m.chave] = { visualizar: true, editar: !m.soVisualizar && legado }; continue; }
    const p = salvas[m.chave] || {};
    r[m.chave] = { visualizar: Boolean(p.visualizar || p.editar), editar: !m.soVisualizar && Boolean(p.editar) };
  }
  return r;
}

export function pode(permissoes, modulo, acao) {
  const p = permissoes && permissoes[modulo];
  if (!p) return false;
  return acao === 'editar' ? p.editar : p.visualizar;
}

export function veSuprimentos(permissoes) {
  return MODULOS_SUPRIMENTOS.some((m) => pode(permissoes, m, 'visualizar'));
}

// Usuário da sessão com as permissões resolvidas (null se não existir)
export async function permissoesDoEmail(env, email) {
  const e = String(email || '').toLowerCase();
  const admins = (env.ADMIN_EMAILS || '').split(',').map((x) => x.trim().toLowerCase()).filter(Boolean);
  const usuario = await env.DB.prepare('SELECT nome, status, isAdmin, podeEditar, permissoes FROM usuarios WHERE email = ?').bind(e).first();
  const isAdmin = admins.includes(e) || Boolean(usuario && usuario.isAdmin);
  return { usuario, isAdmin, permissoes: resolverPermissoes(usuario, isAdmin) };
}

// Matriz enviada pela tela: só módulos conhecidos; editar implica visualizar
export function normalizarMatriz(entrada) {
  if (!entrada || typeof entrada !== 'object' || Array.isArray(entrada)) return null;
  const r = {};
  for (const m of MODULOS) {
    const p = entrada[m.chave] || {};
    r[m.chave] = { visualizar: Boolean(p.visualizar || p.editar), editar: !m.soVisualizar && Boolean(p.editar) };
  }
  return r;
}
