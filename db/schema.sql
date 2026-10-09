-- iBuild Obras — schema do banco Cloudflare D1
-- Cria a tabela única que guarda o snapshot dos orçamentos.
-- Execute este conteúdo no console do banco D1 (passo 6 abaixo).

CREATE TABLE IF NOT EXISTS app_state (
  chave          TEXT PRIMARY KEY,
  valor          TEXT NOT NULL,
  atualizado_por TEXT,
  atualizado_em  INTEGER NOT NULL
);

-- Estado inicial (orçamentos vazios)
INSERT INTO app_state (chave, valor, atualizado_em)
VALUES ('orcamentos', '[]', 0)
ON CONFLICT(chave) DO NOTHING;
