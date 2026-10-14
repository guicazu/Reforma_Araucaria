-- iBuild Obras — module de Compras/Suprimentos (Cloudflare D1)
-- Idempotente: roda por cima do banco existente sem duplicar nada.
-- Aplicar via: wrangler d1 execute ibuild-orcamentos --remote --file=./db/schema-compras.sql
-- ou colando no console D1 (Workers & Pages > D1 > ibuild-orcamentos > Console).

CREATE TABLE IF NOT EXISTS contadores (
  chave TEXT PRIMARY KEY,
  valor INTEGER NOT NULL DEFAULT 0
);
INSERT INTO contadores (chave, valor) VALUES ('pedido_numero', 0)
ON CONFLICT(chave) DO NOTHING;

CREATE TABLE IF NOT EXISTS requisicoes (
  id TEXT PRIMARY KEY,
  orcamentoId TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'aberta',
  solicitanteEmail TEXT NOT NULL,
  solicitanteNome TEXT,
  observacoes TEXT,
  criadoEm TEXT NOT NULL,
  atualizadoEm TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_requisicoes_orcamento ON requisicoes (orcamentoId);

CREATE TABLE IF NOT EXISTS itens_requisicao (
  id TEXT PRIMARY KEY,
  requisicaoId TEXT NOT NULL REFERENCES requisicoes(id),
  itemOrcamentoId TEXT NOT NULL,
  descricao TEXT NOT NULL,
  unidade TEXT,
  quantidadeOrcamento REAL,
  quantidadeSolicitada REAL NOT NULL,
  status TEXT NOT NULL DEFAULT 'pendente'
);
CREATE INDEX IF NOT EXISTS idx_itens_requisicao_req ON itens_requisicao (requisicaoId);

CREATE TABLE IF NOT EXISTS fornecedores (
  id TEXT PRIMARY KEY,
  nome TEXT NOT NULL,
  cnpj TEXT,
  telefone TEXT,
  email TEXT,
  criadoEm TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS cotacoes (
  id TEXT PRIMARY KEY,
  orcamentoId TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'aberta',
  criadoPorEmail TEXT NOT NULL,
  criadoEm TEXT NOT NULL,
  finalizadaEm TEXT
);
CREATE INDEX IF NOT EXISTS idx_cotacoes_orcamento ON cotacoes (orcamentoId);

CREATE TABLE IF NOT EXISTS cotacao_fornecedores (
  id TEXT PRIMARY KEY,
  cotacaoId TEXT NOT NULL REFERENCES cotacoes(id),
  fornecedorId TEXT NOT NULL REFERENCES fornecedores(id),
  condicaoPagamento TEXT,
  rodada INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS cotacao_itens (
  id TEXT PRIMARY KEY,
  cotacaoId TEXT NOT NULL REFERENCES cotacoes(id),
  itemRequisicaoId TEXT NOT NULL REFERENCES itens_requisicao(id),
  quantidade REAL NOT NULL
);

CREATE TABLE IF NOT EXISTS cotacao_precos (
  id TEXT PRIMARY KEY,
  cotacaoId TEXT NOT NULL REFERENCES cotacoes(id),
  cotacaoItemId TEXT NOT NULL REFERENCES cotacao_itens(id),
  fornecedorId TEXT NOT NULL REFERENCES fornecedores(id),
  precoUnitario REAL NOT NULL,
  vencedora INTEGER NOT NULL DEFAULT 0,
  quantidadeComprada REAL,
  atualizadoEm TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_cotacao_precos_item ON cotacao_precos (cotacaoItemId);

CREATE TABLE IF NOT EXISTS pedidos (
  id TEXT PRIMARY KEY,
  numero TEXT NOT NULL,
  cotacaoId TEXT NOT NULL REFERENCES cotacoes(id),
  orcamentoId TEXT NOT NULL,
  fornecedorId TEXT NOT NULL REFERENCES fornecedores(id),
  status TEXT NOT NULL DEFAULT 'emitido',
  valorTotal REAL NOT NULL,
  condicaoPagamento TEXT,
  dataEmissao TEXT NOT NULL,
  pdfGeradoEm TEXT,
  emailEnviadoEm TEXT,
  emailDestino TEXT,
  confirmacaoToken TEXT,
  confirmadoEm TEXT,
  criadoPorEmail TEXT NOT NULL,
  criadoEm TEXT NOT NULL,
  pdfBase64 TEXT
);
CREATE INDEX IF NOT EXISTS idx_pedidos_orcamento ON pedidos (orcamentoId);

CREATE TABLE IF NOT EXISTS itens_pedido (
  id TEXT PRIMARY KEY,
  pedidoId TEXT NOT NULL REFERENCES pedidos(id),
  itemRequisicaoId TEXT NOT NULL REFERENCES itens_requisicao(id),
  descricao TEXT NOT NULL,
  unidade TEXT,
  quantidade REAL NOT NULL,
  precoUnitario REAL NOT NULL,
  valorTotal REAL NOT NULL
);

CREATE TABLE IF NOT EXISTS recebimentos (
  id TEXT PRIMARY KEY,
  pedidoId TEXT NOT NULL REFERENCES pedidos(id),
  notaFiscalNumero TEXT,
  notaFiscalChave TEXT,
  dataRecebimento TEXT NOT NULL,
  valorNota REAL NOT NULL,
  recebidoPorEmail TEXT NOT NULL,
  observacoes TEXT,
  criadoEm TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS itens_recebimento (
  id TEXT PRIMARY KEY,
  recebimentoId TEXT NOT NULL REFERENCES recebimentos(id),
  itemPedidoId TEXT NOT NULL REFERENCES itens_pedido(id),
  quantidadeRecebida REAL NOT NULL
);