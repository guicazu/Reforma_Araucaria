-- Permissões por módulo (visualizar / editar), definidas em Usuários › Editar permissões.
-- JSON { "modulo": { "visualizar": true, "editar": false } }; vazio = regra antiga (visualiza tudo
-- e edita tudo se podeEditar = 1). Ver functions/_lib/permissoes.js.
-- Aplicar uma vez (não é idempotente):
--   wrangler d1 execute ibuild-orcamentos --remote --file=db/migrations/20261018_permissoes_modulos.sql
ALTER TABLE usuarios ADD COLUMN permissoes TEXT;
