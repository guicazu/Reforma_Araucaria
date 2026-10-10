-- Rodar no console D1 (Workers e Pages > D1 > ibuild-orcamentos > Console)
-- ou via: wrangler d1 execute ibuild-orcamentos --remote --file=./db/schema-usuarios.sql

CREATE TABLE IF NOT EXISTS usuarios (
  id TEXT PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  nome TEXT,
  provedor TEXT NOT NULL,          -- 'google' ou 'microsoft'
  status TEXT NOT NULL DEFAULT 'pendente', -- pendente | aprovado | bloqueado
  criadoEm TEXT NOT NULL,
  aprovadoEm TEXT
);

CREATE INDEX IF NOT EXISTS idx_usuarios_status ON usuarios (status);
