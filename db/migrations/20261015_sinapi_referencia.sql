-- Base de referência SINAPI: o arquivo oficial mensal da Caixa (ZIP "formato xlsx"), importado
-- pela tela "Base SINAPI". Guarda o mês de cada preço; o cadastro (descrições) fica com a versão
-- mais recente e a estrutura das composições só ganha linha nova quando a Caixa a altera.
-- Aplicar: wrangler d1 execute ibuild-orcamentos --remote --file=db/migrations/20261015_sinapi_referencia.sql

-- Um registro por mês importado (uf/regime: hoje só SP desonerado, ver functions/_lib/sinapi.js)
CREATE TABLE IF NOT EXISTS sinapi_referencias (
  mes TEXT NOT NULL,                       -- AAAA-MM
  uf TEXT NOT NULL,
  regime TEXT NOT NULL,                    -- desonerado | nao_desonerado
  emissao TEXT,                            -- data de emissão do relatório da Caixa
  arquivo TEXT,
  status TEXT NOT NULL DEFAULT 'importando', -- importando | ok
  insumos INTEGER NOT NULL DEFAULT 0,
  composicoes INTEGER NOT NULL DEFAULT 0,
  importadoEm TEXT,
  importadoPor TEXT,
  PRIMARY KEY (mes, uf, regime)
);

-- Cadastro de insumos; classificacao é a oficial (MATERIAL, MAO DE OBRA, EQUIPAMENTO...)
CREATE TABLE IF NOT EXISTS sinapi_insumos (
  codigo INTEGER PRIMARY KEY,
  descricao TEXT NOT NULL,
  unidade TEXT NOT NULL,
  classificacao TEXT,
  mes TEXT NOT NULL                        -- mês de onde vieram descrição e classificação
);

CREATE TABLE IF NOT EXISTS sinapi_insumos_precos (
  mes TEXT NOT NULL,
  uf TEXT NOT NULL,
  regime TEXT NOT NULL,
  codigo INTEGER NOT NULL,
  preco REAL,                              -- vazio quando a Caixa não publica preço para a UF
  origem TEXT,                             -- C = coletado, CR = coeficiente de representatividade
  PRIMARY KEY (mes, uf, regime, codigo)
) WITHOUT ROWID;

CREATE TABLE IF NOT EXISTS sinapi_composicoes (
  codigo INTEGER PRIMARY KEY,
  descricao TEXT NOT NULL,
  unidade TEXT NOT NULL,
  grupo TEXT,
  mes TEXT NOT NULL
);

-- Custo do mês, % oficial de mão de obra e qual versão da estrutura valia naquele mês
CREATE TABLE IF NOT EXISTS sinapi_composicoes_custos (
  mes TEXT NOT NULL,
  uf TEXT NOT NULL,
  regime TEXT NOT NULL,
  codigo INTEGER NOT NULL,
  custo REAL,
  maoDeObra REAL,                          -- fração do custo (0 a 1)
  versao TEXT NOT NULL,
  PRIMARY KEY (mes, uf, regime, codigo)
) WITHOUT ROWID;

-- Estrutura (aba Analítico): uma linha por composição e versão, itens em JSON
-- [[tipo 'C'|'I', código, coeficiente], ...]; a versão é um resumo dos itens
CREATE TABLE IF NOT EXISTS sinapi_composicoes_estruturas (
  codigo INTEGER NOT NULL,
  versao TEXT NOT NULL,
  itens TEXT NOT NULL,
  PRIMARY KEY (codigo, versao)
) WITHOUT ROWID;

-- Busca por palavras nas descrições, sem acento (refeita a cada importação)
CREATE VIRTUAL TABLE IF NOT EXISTS sinapi_composicoes_busca USING fts5(
  descricao,
  content='sinapi_composicoes',
  content_rowid='codigo',
  tokenize='unicode61 remove_diacritics 2'
);
