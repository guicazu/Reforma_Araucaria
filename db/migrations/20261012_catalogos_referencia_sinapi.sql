CREATE UNIQUE INDEX IF NOT EXISTS idx_composicoes_proprias_codigo_referencia
  ON composicoes (codigoReferencia COLLATE NOCASE)
  WHERE base = 'propria' AND codigoReferencia <> '';

CREATE UNIQUE INDEX IF NOT EXISTS idx_insumos_proprios_codigo_referencia
  ON insumos (codigoReferencia COLLATE NOCASE)
  WHERE base = 'propria' AND codigoReferencia <> '';
