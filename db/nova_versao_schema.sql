-- Cada versão do orçamento é uma nova linha no D1
-- O registro 'atual' continua existindo para compatibilidade
CREATE TABLE IF NOT EXISTS orcamentos_versoes (
  id            TEXT PRIMARY KEY,
  orcamentoId   TEXT NOT NULL,
  versaoNumero  INTEGER NOT NULL,
  rotulo        TEXT,
  codigo        TEXT,
  nome          TEXT,
  criadoEm      TEXT,
  conteudo      TEXT NOT NULL,
  atualizadoEm  TEXT
);
CREATE INDEX IF NOT EXISTS idx_orcamentos_versoes_orcamento ON orcamentos_versoes(orcamentoId);
CREATE INDEX IF NOT EXISTS idx_orcamentos_versoes_versao ON orcamentos_versoes(orcamentoId, versaoNumero);
