-- Planejamento no servidor: um cronograma por obra (orçamento) e os apontamentos de avanço físico.
-- Substitui os cronogramas que ficavam só no navegador. As tarefas são os serviços da versão atual
-- do orçamento; aqui fica só o que é do cronograma (js/cronograma-motor.js faz as contas).
-- Aplicar com: wrangler d1 execute ibuild-orcamentos --remote --file=db/migrations/20261019_planejamento.sql

CREATE TABLE IF NOT EXISTS plan_cronogramas (
  orcamentoId TEXT PRIMARY KEY,               -- uma obra, um cronograma
  dataInicio TEXT NOT NULL,                   -- início da obra (AAAA-MM-DD)
  calendario TEXT NOT NULL DEFAULT 'uteis',   -- uteis (segunda a sexta) | corridos
  feriados TEXT NOT NULL DEFAULT '[]',        -- datas sem trabalho
  duracaoPadrao INTEGER NOT NULL DEFAULT 5,   -- dias de trabalho de serviço novo no orçamento
  tarefas TEXT NOT NULL DEFAULT '{}',         -- { servicoId: { duracao, predecessoras: [{ id, espera }], inicioMinimo } }
  revisao INTEGER NOT NULL DEFAULT 1,         -- conta as gravações (uma não sobrescreve a outra)
  criadoEm TEXT NOT NULL,
  criadoPorNome TEXT,
  atualizadoEm TEXT NOT NULL,
  atualizadoPorEmail TEXT,
  atualizadoPorNome TEXT
);

-- % executado acumulado de cada serviço numa data (um apontamento por serviço e dia)
CREATE TABLE IF NOT EXISTS plan_avancos (
  id TEXT PRIMARY KEY,
  orcamentoId TEXT NOT NULL,
  servicoId TEXT NOT NULL,
  data TEXT NOT NULL,
  percentual REAL NOT NULL,
  usuarioEmail TEXT,
  usuarioNome TEXT,
  criadoEm TEXT NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_plan_avancos_dia ON plan_avancos (orcamentoId, servicoId, data);
