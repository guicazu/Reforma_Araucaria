-- Calendários de trabalho (tela Calendários): dias da semana trabalhados, feriados nacionais,
-- estaduais e municipais, pontos facultativos e dias parados ou trabalhados por exceção. O
-- cronograma de cada obra pode usar um deles (plan_cronogramas.calendarioId).
-- Aplicar uma vez: wrangler d1 execute ibuild-orcamentos --remote --file=db/migrations/20261020_calendarios.sql
-- (o ALTER TABLE falha se a coluna já existir)

CREATE TABLE IF NOT EXISTS plan_calendarios (
  id TEXT PRIMARY KEY,
  nome TEXT NOT NULL,
  config TEXT NOT NULL DEFAULT '{}',          -- ver normalizar() em js/feriados.js
  padrao INTEGER NOT NULL DEFAULT 0,          -- sugerido ao criar um cronograma
  revisao INTEGER NOT NULL DEFAULT 1,
  criadoEm TEXT NOT NULL,
  atualizadoEm TEXT NOT NULL,
  atualizadoPorNome TEXT
);

ALTER TABLE plan_cronogramas ADD COLUMN calendarioId TEXT;
