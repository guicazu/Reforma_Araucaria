-- Rodar no console D1 (Workers e Pages > D1 > ibuild-orcamentos > Console)
-- ou via: wrangler d1 execute ibuild-orcamentos --remote --file=./db/schema-usuarios.sql

CREATE TABLE IF NOT EXISTS usuarios (
  id TEXT PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  nome TEXT,
  telefone TEXT,
  provedor TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pendente',
  isAdmin INTEGER NOT NULL DEFAULT 0,
  podeEditar INTEGER NOT NULL DEFAULT 0,
  criadoEm TEXT NOT NULL,
  aprovadoEm TEXT
);

CREATE INDEX IF NOT EXISTS idx_usuarios_status ON usuarios (status);
CREATE INDEX IF NOT EXISTS idx_usuarios_is_admin ON usuarios (isAdmin);
