-- iBuild Obras — Cloudflare D1
-- Tabela única guardando o snapshot dos orçamentos (registro "atual").

CREATE TABLE IF NOT EXISTS orcamentos (
  id            TEXT PRIMARY KEY,
  codigo        TEXT,
  nome          TEXT,
  criadoEm      TEXT,
  conteudo      TEXT NOT NULL,
  atualizadoEm  TEXT
);
