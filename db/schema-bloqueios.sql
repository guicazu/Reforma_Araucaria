-- Rodar no console D1 (Cloudflare > D1 > ibuild-orcamentos > Console)
CREATE TABLE IF NOT EXISTS bloqueios (
  orcamentoId   TEXT PRIMARY KEY,
  usuarioEmail  TEXT NOT NULL,
  usuarioNome   TEXT,
  criadoEm      TEXT NOT NULL
);