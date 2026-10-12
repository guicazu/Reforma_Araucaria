WITH unidades(id, simbolo, nome, grupo) AS (
  VALUES
    ('std-h', 'H', 'Hora', 'Tempo'),
    ('std-kg', 'KG', 'Quilograma', 'Massa'),
    ('sinapi-kgxkm', 'KGXKM', 'Quilograma-quilômetro', 'Transporte'),
    ('std-l', 'L', 'Litro', 'Volume'),
    ('sinapi-lxkm', 'LXKM', 'Litro-quilômetro', 'Transporte'),
    ('std-m', 'M', 'Metro', 'Comprimento'),
    ('std-m2', 'M2', 'Metro quadrado', 'Área'),
    ('sinapi-m2xkm', 'M2XKM', 'Metro quadrado-quilômetro', 'Transporte'),
    ('sinapi-m2xmes', 'M2XMES', 'Metro quadrado-mês', 'Tempo'),
    ('std-m3', 'M3', 'Metro cúbico', 'Volume'),
    ('sinapi-m3xkm', 'M3XKM', 'Metro cúbico-quilômetro', 'Transporte'),
    ('std-mes', 'MES', 'Mês', 'Tempo'),
    ('sinapi-mxkm', 'MXKM', 'Metro-quilômetro', 'Transporte'),
    ('sinapi-mxmes', 'MXMES', 'Metro-mês', 'Tempo'),
    ('std-t', 'T', 'Tonelada', 'Massa'),
    ('sinapi-txkm', 'TXKM', 'Tonelada-quilômetro', 'Transporte'),
    ('std-un', 'UN', 'Unidade', 'Quantidade'),
    ('sinapi-unxkm', 'UNXKM', 'Unidade-quilômetro', 'Transporte'),
    ('sinapi-chi', 'CHI', 'Custo horário improdutivo', 'Tempo'),
    ('sinapi-chp', 'CHP', 'Custo horário produtivo', 'Tempo'),
    ('sinapi-100m', '100M', 'Centena de metros', 'Comprimento'),
    ('sinapi-310ml', '310ML', 'Cartucho de 310 mililitros', 'Embalagem'),
    ('std-cento', 'CENTO', 'Cento', 'Quantidade'),
    ('std-cj', 'CJ', 'Conjunto', 'Quantidade'),
    ('std-jg', 'JG', 'Jogo', 'Quantidade'),
    ('std-kwh', 'KWH', 'Quilowatt-hora', 'Energia'),
    ('std-mil', 'MIL', 'Milheiro', 'Quantidade'),
    ('std-par', 'PAR', 'Par', 'Quantidade'),
    ('sinapi-unxmes', 'UNXMES', 'Unidade-mês', 'Tempo')
)
INSERT OR IGNORE INTO unidades_medida
  (id, simbolo, nome, grupo, criadoEm, atualizadoEm)
SELECT id, simbolo, nome, grupo, '2026-10-12T00:00:00.000Z', '2026-10-12T00:00:00.000Z'
FROM unidades;
