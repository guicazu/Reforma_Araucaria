CREATE TABLE IF NOT EXISTS orcamentos_versoes (
  id            TEXT PRIMARY KEY,
  orcamentoId   TEXT NOT NULL,
  revisao       INTEGER NOT NULL DEFAULT 0,
  versaoNumero  INTEGER NOT NULL DEFAULT 1,
  rotulo        TEXT,
  codigo        TEXT,
  nome          TEXT,
  criadoEm      TEXT,
  conteudo      TEXT NOT NULL,
  atualizadoEm  TEXT
);
CREATE INDEX IF NOT EXISTS idx_orcamentos_versoes_orcamento ON orcamentos_versoes(orcamentoId);
CREATE INDEX IF NOT EXISTS idx_orcamentos_versoes_rev ON orcamentos_versoes(orcamentoId, revisao);
CREATE INDEX IF NOT EXISTS idx_orcamentos_versoes_versao ON orcamentos_versoes(orcamentoId, versaoNumero);
