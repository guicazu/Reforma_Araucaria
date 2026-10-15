-- Suprimentos no padrão do SIENGE: solicitação de compra por insumo do orçamento, cotação com mapa e
-- rodadas, pedido com alçadas, entrada de nota fiscal, contratos e medições, estoque por obra e
-- contas a pagar. A obra é o orçamento (orcamentoId); a apropriação é o serviço da EAP (servicoId).
-- Idempotente. Aplicar:
--   wrangler d1 execute ibuild-orcamentos --remote --file=db/migrations/20261017_suprimentos.sql
-- As tabelas antigas do módulo (requisicoes, itens_requisicao, cotacoes, cotacao_*, fornecedores)
-- não são usadas mais e ficam como estão.

/* ---------- cadastros e parâmetros ---------- */
-- Numeração dos documentos (chaves supr_solicitacao, supr_cotacao, supr_pedido, supr_contrato)
CREATE TABLE IF NOT EXISTS contadores (
  chave TEXT PRIMARY KEY,
  valor INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS supr_fornecedores (
  id TEXT PRIMARY KEY,
  nome TEXT NOT NULL,                       -- razão social
  nomeFantasia TEXT,
  documento TEXT,                           -- CNPJ ou CPF, só dígitos
  inscricaoEstadual TEXT,
  email TEXT,
  telefone TEXT,
  contato TEXT,
  endereco TEXT,
  cidade TEXT,
  uf TEXT,
  cep TEXT,
  categorias TEXT,                          -- o que fornece (texto livre)
  dadosBancarios TEXT,
  observacoes TEXT,
  ativo INTEGER NOT NULL DEFAULT 1,
  criadoEm TEXT NOT NULL,
  atualizadoEm TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_supr_fornecedores_nome ON supr_fornecedores (nome);
CREATE UNIQUE INDEX IF NOT EXISTS idx_supr_fornecedores_documento
  ON supr_fornecedores (documento) WHERE documento IS NOT NULL AND documento <> '';

CREATE TABLE IF NOT EXISTS supr_condicoes_pagamento (
  id TEXT PRIMARY KEY,
  descricao TEXT NOT NULL,
  parcelas TEXT NOT NULL DEFAULT '[]',      -- [{"dias":30,"percentual":50}, ...]
  ativo INTEGER NOT NULL DEFAULT 1,
  criadoEm TEXT NOT NULL,
  atualizadoEm TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS supr_parametros (
  chave TEXT PRIMARY KEY,
  valor TEXT NOT NULL
);

-- Quem autoriza o quê e até quanto (administradores autorizam tudo)
CREATE TABLE IF NOT EXISTS supr_alcadas (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL,
  tipo TEXT NOT NULL,                       -- solicitacao | pedido | contrato | medicao
  valorLimite REAL,                         -- vazio = sem limite
  criadoEm TEXT NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_supr_alcadas_email_tipo ON supr_alcadas (email, tipo);

CREATE TABLE IF NOT EXISTS supr_historico (
  id TEXT PRIMARY KEY,
  entidade TEXT NOT NULL,                   -- solicitacao | cotacao | pedido | nota | contrato | medicao | titulo
  entidadeId TEXT NOT NULL,
  acao TEXT NOT NULL,
  detalhe TEXT,
  usuarioEmail TEXT,
  usuarioNome TEXT,
  criadoEm TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_supr_historico_entidade ON supr_historico (entidade, entidadeId);

-- Insumos orçados da obra (composições abertas até os insumos), refeito quando a versão do
-- orçamento, a referência SINAPI ou o catálogo próprio mudam
CREATE TABLE IF NOT EXISTS supr_orcado_cache (
  orcamentoId TEXT PRIMARY KEY,
  chave TEXT NOT NULL,
  dados TEXT NOT NULL,
  geradoEm TEXT NOT NULL
);

/* ---------- solicitações de compra ---------- */
CREATE TABLE IF NOT EXISTS supr_solicitacoes (
  id TEXT PRIMARY KEY,
  numero INTEGER NOT NULL,
  orcamentoId TEXT NOT NULL,
  data TEXT NOT NULL,
  solicitanteEmail TEXT NOT NULL,
  solicitanteNome TEXT,
  observacoes TEXT,
  status TEXT NOT NULL,                     -- pendente | autorizada | reprovada | cancelada
  excedeOrcamento INTEGER NOT NULL DEFAULT 0,
  valorEstimado REAL NOT NULL DEFAULT 0,    -- quantidades pelo preço orçado
  autorizadoPor TEXT,
  autorizadoEm TEXT,
  motivoReprovacao TEXT,
  criadoEm TEXT NOT NULL,
  atualizadoEm TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_supr_solicitacoes_obra ON supr_solicitacoes (orcamentoId, status);

CREATE TABLE IF NOT EXISTS supr_solicitacao_itens (
  id TEXT PRIMARY KEY,
  solicitacaoId TEXT NOT NULL,
  orcamentoId TEXT NOT NULL,
  seq INTEGER NOT NULL,
  insumoChave TEXT NOT NULL,                -- I:<sinapi> | C:<sinapi> | PI:<id> | PC:<id> | S:<servico>
  insumoCodigo TEXT,
  descricao TEXT NOT NULL,
  unidade TEXT,
  tipo TEXT,                                -- material | maoDeObra | equipamento | servico
  quantidade REAL NOT NULL,
  precoOrcado REAL,
  dataNecessidade TEXT,
  apropriacoes TEXT NOT NULL DEFAULT '[]',  -- [{"servicoId":"...","percentual":100}]
  foraOrcamento INTEGER NOT NULL DEFAULT 0,
  excedeOrcamento INTEGER NOT NULL DEFAULT 0,
  observacao TEXT,
  status TEXT NOT NULL,                     -- pendente | autorizado | reprovado | cancelado
  encerrado INTEGER NOT NULL DEFAULT 0      -- saldo não comprado foi encerrado
);
CREATE INDEX IF NOT EXISTS idx_supr_solicitacao_itens_sc ON supr_solicitacao_itens (solicitacaoId);
CREATE INDEX IF NOT EXISTS idx_supr_solicitacao_itens_obra ON supr_solicitacao_itens (orcamentoId, status);

/* ---------- cotações ---------- */
CREATE TABLE IF NOT EXISTS supr_cotacoes (
  id TEXT PRIMARY KEY,
  numero INTEGER NOT NULL,
  orcamentoId TEXT NOT NULL,
  data TEXT NOT NULL,
  prazoResposta TEXT,
  compradorEmail TEXT NOT NULL,
  compradorNome TEXT,
  observacoes TEXT,
  status TEXT NOT NULL,                     -- aberta | finalizada | cancelada
  rodada INTEGER NOT NULL DEFAULT 1,
  criadoEm TEXT NOT NULL,
  atualizadoEm TEXT NOT NULL,
  finalizadaEm TEXT
);
CREATE INDEX IF NOT EXISTS idx_supr_cotacoes_obra ON supr_cotacoes (orcamentoId, status);

CREATE TABLE IF NOT EXISTS supr_cotacao_itens (
  id TEXT PRIMARY KEY,
  cotacaoId TEXT NOT NULL,
  solicitacaoItemId TEXT NOT NULL,
  seq INTEGER NOT NULL,
  quantidade REAL NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_supr_cotacao_itens_cotacao ON supr_cotacao_itens (cotacaoId);
CREATE INDEX IF NOT EXISTS idx_supr_cotacao_itens_sc ON supr_cotacao_itens (solicitacaoItemId);

CREATE TABLE IF NOT EXISTS supr_cotacao_fornecedores (
  id TEXT PRIMARY KEY,
  cotacaoId TEXT NOT NULL,
  fornecedorId TEXT NOT NULL,
  token TEXT NOT NULL,                      -- link do portal do fornecedor
  condicaoPagamentoId TEXT,                 -- condição do cadastro, quando escolhida
  condicaoPagamento TEXT,                   -- descrição (a do cadastro ou a que o fornecedor digitou)
  prazoEntregaDias INTEGER,
  frete TEXT,                               -- CIF | FOB
  valorFrete REAL NOT NULL DEFAULT 0,
  validade TEXT,
  observacoes TEXT,
  conviteEnviadoEm TEXT,
  respondidoEm TEXT,
  declinou INTEGER NOT NULL DEFAULT 0
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_supr_cotacao_fornecedores_unico ON supr_cotacao_fornecedores (cotacaoId, fornecedorId);
CREATE UNIQUE INDEX IF NOT EXISTS idx_supr_cotacao_fornecedores_token ON supr_cotacao_fornecedores (token);

CREATE TABLE IF NOT EXISTS supr_cotacao_precos (
  id TEXT PRIMARY KEY,
  cotacaoId TEXT NOT NULL,
  cotacaoItemId TEXT NOT NULL,
  fornecedorId TEXT NOT NULL,
  rodada INTEGER NOT NULL,
  precoUnitario REAL,
  marca TEXT,
  observacao TEXT,
  atualizadoEm TEXT NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_supr_cotacao_precos_celula ON supr_cotacao_precos (cotacaoItemId, fornecedorId, rodada);
CREATE INDEX IF NOT EXISTS idx_supr_cotacao_precos_cotacao ON supr_cotacao_precos (cotacaoId);

-- Vencedores do mapa (um item pode ser dividido entre fornecedores)
CREATE TABLE IF NOT EXISTS supr_cotacao_selecao (
  cotacaoItemId TEXT NOT NULL,
  fornecedorId TEXT NOT NULL,
  cotacaoId TEXT NOT NULL,
  quantidade REAL NOT NULL,
  PRIMARY KEY (cotacaoItemId, fornecedorId)
);
CREATE INDEX IF NOT EXISTS idx_supr_cotacao_selecao_cotacao ON supr_cotacao_selecao (cotacaoId);

/* ---------- pedidos de compra ---------- */
CREATE TABLE IF NOT EXISTS supr_pedidos (
  id TEXT PRIMARY KEY,
  numero INTEGER NOT NULL,
  orcamentoId TEXT NOT NULL,
  fornecedorId TEXT NOT NULL,
  cotacaoId TEXT,
  data TEXT NOT NULL,
  dataEntrega TEXT,
  localEntrega TEXT,
  condicaoPagamentoId TEXT,
  condicaoPagamento TEXT,
  parcelas TEXT NOT NULL DEFAULT '[]',      -- [{"dias":30,"percentual":100}]
  frete TEXT,                               -- CIF | FOB
  valorFrete REAL NOT NULL DEFAULT 0,
  valorDesconto REAL NOT NULL DEFAULT 0,
  valorItens REAL NOT NULL DEFAULT 0,
  valorTotal REAL NOT NULL DEFAULT 0,
  observacoes TEXT,
  status TEXT NOT NULL,                     -- pendente | autorizado | reprovado | parcial | entregue | encerrado | cancelado
  compradorEmail TEXT NOT NULL,
  compradorNome TEXT,
  autorizadoPor TEXT,
  autorizadoEm TEXT,
  motivoReprovacao TEXT,
  enviadoEm TEXT,
  emailDestino TEXT,
  token TEXT NOT NULL,                      -- link de confirmação do fornecedor
  confirmadoEm TEXT,
  criadoEm TEXT NOT NULL,
  atualizadoEm TEXT NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_supr_pedidos_token ON supr_pedidos (token);
CREATE INDEX IF NOT EXISTS idx_supr_pedidos_obra ON supr_pedidos (orcamentoId, status);
CREATE INDEX IF NOT EXISTS idx_supr_pedidos_fornecedor ON supr_pedidos (fornecedorId);

CREATE TABLE IF NOT EXISTS supr_pedido_itens (
  id TEXT PRIMARY KEY,
  pedidoId TEXT NOT NULL,
  seq INTEGER NOT NULL,
  solicitacaoItemId TEXT,
  cotacaoItemId TEXT,
  insumoChave TEXT NOT NULL,
  insumoCodigo TEXT,
  descricao TEXT NOT NULL,
  unidade TEXT,
  tipo TEXT,
  quantidade REAL NOT NULL,
  precoUnitario REAL NOT NULL,
  valorTotal REAL NOT NULL,
  quantidadeEncerrada REAL NOT NULL DEFAULT 0,  -- saldo não entregue que foi encerrado
  apropriacoes TEXT NOT NULL DEFAULT '[]',
  marca TEXT,
  observacao TEXT
);
CREATE INDEX IF NOT EXISTS idx_supr_pedido_itens_pedido ON supr_pedido_itens (pedidoId);
CREATE INDEX IF NOT EXISTS idx_supr_pedido_itens_sc ON supr_pedido_itens (solicitacaoItemId);

/* ---------- notas fiscais de entrada ---------- */
CREATE TABLE IF NOT EXISTS supr_notas (
  id TEXT PRIMARY KEY,
  orcamentoId TEXT NOT NULL,
  fornecedorId TEXT NOT NULL,
  tipoDocumento TEXT NOT NULL DEFAULT 'nfe', -- nfe | nfse | recibo | outro
  numero TEXT NOT NULL,
  serie TEXT,
  chaveAcesso TEXT,
  dataEmissao TEXT NOT NULL,
  dataEntrada TEXT NOT NULL,
  valorProdutos REAL NOT NULL DEFAULT 0,
  valorFrete REAL NOT NULL DEFAULT 0,
  valorDesconto REAL NOT NULL DEFAULT 0,
  valorIpi REAL NOT NULL DEFAULT 0,
  valorIcmsSt REAL NOT NULL DEFAULT 0,
  valorOutras REAL NOT NULL DEFAULT 0,
  valorTotal REAL NOT NULL DEFAULT 0,
  entradaEstoque INTEGER NOT NULL DEFAULT 1,
  observacoes TEXT,
  status TEXT NOT NULL DEFAULT 'lancada',    -- lancada | cancelada
  lancadoPorEmail TEXT NOT NULL,
  lancadoPorNome TEXT,
  criadoEm TEXT NOT NULL,
  canceladoEm TEXT
);
CREATE INDEX IF NOT EXISTS idx_supr_notas_obra ON supr_notas (orcamentoId, status);
CREATE INDEX IF NOT EXISTS idx_supr_notas_fornecedor ON supr_notas (fornecedorId);
CREATE UNIQUE INDEX IF NOT EXISTS idx_supr_notas_chave
  ON supr_notas (chaveAcesso) WHERE chaveAcesso IS NOT NULL AND chaveAcesso <> '' AND status = 'lancada';

CREATE TABLE IF NOT EXISTS supr_nota_itens (
  id TEXT PRIMARY KEY,
  notaId TEXT NOT NULL,
  seq INTEGER NOT NULL,
  pedidoItemId TEXT,
  insumoChave TEXT NOT NULL,
  insumoCodigo TEXT,
  descricao TEXT NOT NULL,
  unidade TEXT,
  tipo TEXT,
  quantidade REAL NOT NULL,
  precoUnitario REAL NOT NULL,
  valorTotal REAL NOT NULL,
  apropriacoes TEXT NOT NULL DEFAULT '[]',
  descricaoFornecedor TEXT,                 -- como veio no XML da NF-e
  codigoFornecedor TEXT,
  ncm TEXT,
  cfop TEXT
);
CREATE INDEX IF NOT EXISTS idx_supr_nota_itens_nota ON supr_nota_itens (notaId);
CREATE INDEX IF NOT EXISTS idx_supr_nota_itens_pedido ON supr_nota_itens (pedidoItemId);

/* ---------- contratos e medições ---------- */
CREATE TABLE IF NOT EXISTS supr_contratos (
  id TEXT PRIMARY KEY,
  numero INTEGER NOT NULL,
  orcamentoId TEXT NOT NULL,
  fornecedorId TEXT NOT NULL,
  objeto TEXT NOT NULL,
  tipo TEXT NOT NULL DEFAULT 'empreitada',  -- empreitada | servico | fornecimento | locacao
  dataAssinatura TEXT,
  dataInicio TEXT,
  dataFim TEXT,
  retencaoPercentual REAL NOT NULL DEFAULT 0, -- caução retida de cada medição
  inssPercentual REAL NOT NULL DEFAULT 0,
  issPercentual REAL NOT NULL DEFAULT 0,
  irPercentual REAL NOT NULL DEFAULT 0,
  pccPercentual REAL NOT NULL DEFAULT 0,      -- PIS/COFINS/CSLL
  diasPagamento INTEGER NOT NULL DEFAULT 0,   -- vencimento = data da medição + dias
  valorTotal REAL NOT NULL DEFAULT 0,         -- itens vigentes (originais + aditivos autorizados)
  observacoes TEXT,
  status TEXT NOT NULL,                       -- pendente | autorizado | reprovado | encerrado | cancelado
  criadoPorEmail TEXT NOT NULL,
  criadoPorNome TEXT,
  autorizadoPor TEXT,
  autorizadoEm TEXT,
  motivoReprovacao TEXT,
  encerradoEm TEXT,
  criadoEm TEXT NOT NULL,
  atualizadoEm TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_supr_contratos_obra ON supr_contratos (orcamentoId, status);

CREATE TABLE IF NOT EXISTS supr_contrato_itens (
  id TEXT PRIMARY KEY,
  contratoId TEXT NOT NULL,
  aditivoId TEXT,                             -- item incluído por aditivo
  seq INTEGER NOT NULL,
  servicoId TEXT,                             -- apropriação: serviço da EAP
  descricao TEXT NOT NULL,
  unidade TEXT,
  quantidade REAL NOT NULL,
  precoUnitario REAL NOT NULL,
  valorTotal REAL NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_supr_contrato_itens_contrato ON supr_contrato_itens (contratoId);

CREATE TABLE IF NOT EXISTS supr_contrato_aditivos (
  id TEXT PRIMARY KEY,
  contratoId TEXT NOT NULL,
  numero INTEGER NOT NULL,
  descricao TEXT,
  novaDataFim TEXT,
  valor REAL NOT NULL DEFAULT 0,              -- variação do valor do contrato
  itens TEXT NOT NULL DEFAULT '[]',           -- aplicados quando autorizado
  status TEXT NOT NULL,                       -- pendente | autorizado | reprovado | cancelado
  criadoPorEmail TEXT NOT NULL,
  criadoPorNome TEXT,
  autorizadoPor TEXT,
  autorizadoEm TEXT,
  motivoReprovacao TEXT,
  criadoEm TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_supr_contrato_aditivos_contrato ON supr_contrato_aditivos (contratoId);

CREATE TABLE IF NOT EXISTS supr_medicoes (
  id TEXT PRIMARY KEY,
  contratoId TEXT NOT NULL,
  orcamentoId TEXT NOT NULL,
  numero INTEGER NOT NULL,                    -- sequencial dentro do contrato
  periodoInicio TEXT,
  periodoFim TEXT,
  data TEXT NOT NULL,
  dataVencimento TEXT,
  valorBruto REAL NOT NULL DEFAULT 0,
  valorRetencao REAL NOT NULL DEFAULT 0,
  valorInss REAL NOT NULL DEFAULT 0,
  valorIss REAL NOT NULL DEFAULT 0,
  valorIr REAL NOT NULL DEFAULT 0,
  valorPcc REAL NOT NULL DEFAULT 0,
  valorDescontos REAL NOT NULL DEFAULT 0,
  valorLiquido REAL NOT NULL DEFAULT 0,
  observacoes TEXT,
  status TEXT NOT NULL,                       -- pendente | autorizada | reprovada | cancelada
  criadoPorEmail TEXT NOT NULL,
  criadoPorNome TEXT,
  autorizadoPor TEXT,
  autorizadoEm TEXT,
  motivoReprovacao TEXT,
  criadoEm TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_supr_medicoes_contrato ON supr_medicoes (contratoId);
CREATE INDEX IF NOT EXISTS idx_supr_medicoes_obra ON supr_medicoes (orcamentoId, status);

CREATE TABLE IF NOT EXISTS supr_medicao_itens (
  id TEXT PRIMARY KEY,
  medicaoId TEXT NOT NULL,
  contratoItemId TEXT NOT NULL,
  quantidade REAL NOT NULL,
  precoUnitario REAL NOT NULL,
  valor REAL NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_supr_medicao_itens_medicao ON supr_medicao_itens (medicaoId);
CREATE INDEX IF NOT EXISTS idx_supr_medicao_itens_item ON supr_medicao_itens (contratoItemId);

/* ---------- estoque da obra ---------- */
CREATE TABLE IF NOT EXISTS supr_estoque_movimentos (
  id TEXT PRIMARY KEY,
  orcamentoId TEXT NOT NULL,
  data TEXT NOT NULL,
  tipo TEXT NOT NULL,                         -- entrada | saida | transferencia_entrada | transferencia_saida | ajuste_entrada | ajuste_saida
  insumoChave TEXT NOT NULL,
  insumoCodigo TEXT,
  descricao TEXT NOT NULL,
  unidade TEXT,
  quantidade REAL NOT NULL,                   -- sempre positiva; o tipo diz se entra ou sai
  valorUnitario REAL NOT NULL DEFAULT 0,
  valorTotal REAL NOT NULL DEFAULT 0,
  servicoId TEXT,                             -- apropriação do consumo (saída)
  origemTipo TEXT,                            -- nota | transferencia | inventario | manual | estorno
  origemId TEXT,
  documento TEXT,
  observacao TEXT,
  estornado INTEGER NOT NULL DEFAULT 0,
  usuarioEmail TEXT NOT NULL,
  usuarioNome TEXT,
  criadoEm TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_supr_estoque_obra_insumo ON supr_estoque_movimentos (orcamentoId, insumoChave);
CREATE INDEX IF NOT EXISTS idx_supr_estoque_origem ON supr_estoque_movimentos (origemTipo, origemId);

/* ---------- contas a pagar ---------- */
CREATE TABLE IF NOT EXISTS fin_titulos (
  id TEXT PRIMARY KEY,
  orcamentoId TEXT NOT NULL,
  fornecedorId TEXT NOT NULL,
  origemTipo TEXT NOT NULL,                   -- nota | medicao | caucao
  origemId TEXT,
  documento TEXT,
  parcela INTEGER NOT NULL DEFAULT 1,
  totalParcelas INTEGER NOT NULL DEFAULT 1,
  dataEmissao TEXT,
  dataVencimento TEXT NOT NULL,
  valor REAL NOT NULL,
  valorPago REAL,
  dataPagamento TEXT,
  status TEXT NOT NULL DEFAULT 'aberto',      -- aberto | pago | cancelado
  observacoes TEXT,
  criadoEm TEXT NOT NULL,
  atualizadoEm TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_fin_titulos_obra ON fin_titulos (orcamentoId, status);
CREATE INDEX IF NOT EXISTS idx_fin_titulos_vencimento ON fin_titulos (status, dataVencimento);
CREATE INDEX IF NOT EXISTS idx_fin_titulos_origem ON fin_titulos (origemTipo, origemId);

/* ---------- valores iniciais ---------- */
INSERT OR IGNORE INTO supr_parametros (chave, valor) VALUES
  ('solicitacao_exige_autorizacao', '1'),
  ('pedido_exige_autorizacao', '1'),
  ('contrato_exige_autorizacao', '1'),
  ('medicao_exige_autorizacao', '1'),
  ('bloquear_acima_orcado', '0'),
  ('empresa_nome', 'Cazú Projetos e Construções'),
  ('empresa_documento', ''),
  ('empresa_endereco', ''),
  ('local_entrega_padrao', '');

INSERT OR IGNORE INTO supr_condicoes_pagamento (id, descricao, parcelas, ativo, criadoEm, atualizadoEm) VALUES
  ('cond-avista', 'À vista', '[{"dias":0,"percentual":100}]', 1, '2026-10-17T00:00:00.000Z', '2026-10-17T00:00:00.000Z'),
  ('cond-28', '28 dias', '[{"dias":28,"percentual":100}]', 1, '2026-10-17T00:00:00.000Z', '2026-10-17T00:00:00.000Z'),
  ('cond-30', '30 dias', '[{"dias":30,"percentual":100}]', 1, '2026-10-17T00:00:00.000Z', '2026-10-17T00:00:00.000Z'),
  ('cond-30-60', '30/60 dias', '[{"dias":30,"percentual":50},{"dias":60,"percentual":50}]', 1, '2026-10-17T00:00:00.000Z', '2026-10-17T00:00:00.000Z'),
  ('cond-30-60-90', '30/60/90 dias', '[{"dias":30,"percentual":33.34},{"dias":60,"percentual":33.33},{"dias":90,"percentual":33.33}]', 1, '2026-10-17T00:00:00.000Z', '2026-10-17T00:00:00.000Z'),
  ('cond-entrada-30', 'Entrada + 30 dias', '[{"dias":0,"percentual":50},{"dias":30,"percentual":50}]', 1, '2026-10-17T00:00:00.000Z', '2026-10-17T00:00:00.000Z');
