-- Tabelas para catálogos compartilhados no D1.

CREATE TABLE IF NOT EXISTS unidades_medida (
  id TEXT PRIMARY KEY,
  simbolo TEXT NOT NULL,
  nome TEXT NOT NULL,
  grupo TEXT NOT NULL DEFAULT 'Outros',
  criadoEm TEXT NOT NULL,
  atualizadoEm TEXT NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_unidades_medida_simbolo
  ON unidades_medida (lower(simbolo));

CREATE TABLE IF NOT EXISTS composicoes (
  id TEXT PRIMARY KEY,
  codigo TEXT NOT NULL UNIQUE,
  nome TEXT NOT NULL,
  descricao TEXT NOT NULL DEFAULT '',
  unidade TEXT NOT NULL DEFAULT 'un',
  valorUnitario REAL NOT NULL DEFAULT 0,
  base TEXT NOT NULL DEFAULT 'propria',
  codigoReferencia TEXT NOT NULL DEFAULT '',
  componentes TEXT NOT NULL DEFAULT '[]',
  criadoEm TEXT NOT NULL,
  atualizadoEm TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_composicoes_base_nome
  ON composicoes (base, nome);

CREATE TABLE IF NOT EXISTS insumos (
  id TEXT PRIMARY KEY,
  codigo TEXT NOT NULL UNIQUE,
  nome TEXT NOT NULL,
  descricao TEXT NOT NULL DEFAULT '',
  unidade TEXT NOT NULL DEFAULT 'un',
  valorUnitario REAL NOT NULL DEFAULT 0,
  base TEXT NOT NULL DEFAULT 'propria',
  codigoReferencia TEXT NOT NULL DEFAULT '',
  unidadeBaseId TEXT NOT NULL DEFAULT '',
  conversoes TEXT NOT NULL DEFAULT '[]',
  detalhes TEXT NOT NULL DEFAULT '[]',
  criadoEm TEXT NOT NULL,
  atualizadoEm TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_insumos_base_nome
  ON insumos (base, nome);
