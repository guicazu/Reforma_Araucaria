// functions/_lib/admin.js

// Verifica se o usuário da sessão pode editar (admin).
// Regra alinhada com usuarios.js: ADMIN_EMAILS + fallback  + tabela usuarios.isAdmin.
export async function podeEditar(payload, env) {
  if (!payload || !payload.email) return false;

  // Payload já marcado como admin
  if (payload.isAdmin) return true;

  const email = payload.email.toLowerCase().trim();

  // 1) Admins configurados por variável de ambiente
  const admins = (env.ADMIN_EMAILS || '')
    .split(',')
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
  if (admins.includes(email) || email === 'cazu89@gmail.com') return true;

  // 2) Fallback: consulta a coluna isAdmin no banco
  if (env.DB && typeof env.DB.prepare === 'function') {
    try {
      const usuario = await env.DB.prepare(
        'SELECT isAdmin FROM usuarios WHERE email = ?'
      ).bind(email).first();
      return !!usuario && usuario.isAdmin === 1;
    } catch (e) {
      console.error('[admin] falha ao consultar isAdmin:', e);
      return false;
    }
  }

  return false;
}