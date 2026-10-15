-- Referência SINAPI (mês AAAA-MM da base própria) escolhida para cada versão do orçamento.
-- Só muda quando o usuário pede ("Alterar referência"); importar um mês novo não altera orçamentos.
-- Aplicar: wrangler d1 execute ibuild-orcamentos --remote --file=db/migrations/20261016_orcamento_referencia.sql
ALTER TABLE orcamentos_versoes ADD COLUMN referencia TEXT;

-- Busca por palavras nas descrições dos insumos SINAPI (telas Insumos e composições próprias)
CREATE VIRTUAL TABLE IF NOT EXISTS sinapi_insumos_busca USING fts5(
  descricao,
  content='sinapi_insumos',
  content_rowid='codigo',
  tokenize='unicode61 remove_diacritics 2'
);
INSERT INTO sinapi_insumos_busca(sinapi_insumos_busca) VALUES ('rebuild');
