# Reforma Araucária — Acompanhamento de Obra

Site da iBuild Construtora para orçamentos de obra, publicado em
[araucaria.cazu.com.br](https://araucaria.cazu.com.br) via **Cloudflare Pages**.

## Funcionalidades

- Múltiplos orçamentos, com EAP em 4 níveis: Unidade Construtiva → Etapa → Sub Etapa → Serviço
- Colunas EAP, descrição, quantidade, unidade, valor unitário, valor total
- Memória de cálculo por serviço (soma automática das quantidades)
- Subtotais por sub etapa, etapa e unidade construtiva
- Dados salvos no navegador (localStorage) e enviados ao banco compartilhado ao clicar em
  **Salvar**, com aviso de alterações pendentes, salvamento em andamento e confirmação
- Login obrigatório, com cadastro aprovado manualmente pelo administrador
- Orçamentos podem ser abertos em **Visualizar** sem adquirir bloqueio; usuários autorizados podem
  entrar em **Editar**, que bloqueia o orçamento para os demais até liberação explícita
- Novos usuários têm somente visualização; o administrador concede ou remove edição globalmente
  no painel de usuários. Bloqueios podem ser liberados pelo editor ou pelo painel administrativo
- Busca de composições SINAPI por código ou descrição, com exibição dos insumos e
  subcomposições, valores e coeficientes da referência do Paraná não desonerada
- **Novidades:**
  - Código do serviço exibido na tela de orçamento (formato: unidade.etapa.sub-etapa.sequencial)
  - Estilização hierárquica na EAP (tamanhos e pesos de fonte diferenciados por nível)
  - Possibilidade de mover serviços entre sub-etapas e entre etapas
  - Possibilidade de mover sub-etapas entre etapas
  - Adicionar serviço diretamente sob uma etapa (sub-etapa opcional)
  - Menus "Composições" e "Insumos" no sidebar para gerenciamento de materiais
- **Novidades:**
  - Código do serviço exibido na tela de orçamento (formato: unidade.etapa.sub-etapa.sequencial)
  - Estilização hierárquica na EAP (tamanhos e pesos de fonte diferenciados por nível)
  - Possibilidade de mover serviços entre sub-etapas e entre etapas
  - Possibilidade de mover sub-etapas entre etapas
  - Adicionar serviço diretamente sob uma etapa (sub-etapa opcional)
  - Menus "Composições" e "Insumos" no sidebar para gerenciamento de materiais.

## Stack

- Front-end: HTML / CSS / JavaScript puro (sem build step)
- Back-end: [Cloudflare Pages Functions](https://developers.cloudflare.com/pages/functions/)
- Banco de dados: [Cloudflare D1](https://developers.cloudflare.com/d1/) (`ibuild-orcamentos`)
- Autenticação: OAuth com Google e Microsoft, sessão por cookie assinado (HMAC)

## Estrutura

```
css/                      estilos
js/                       app.js (lógica dos orçamentos e sincronização manual com o servidor)
db/                       schema.sql dos orçamentos, schema-usuarios.sql dos usuários
functions/
  _middleware.js          bloqueia todo o site pra quem não tem sessão aprovada
  _lib/
    session.js             cookie de sessão assinado (HMAC-SHA256)
    usuarios.js             cria/aprova usuário no primeiro login
  api/
    orcamentos.js           GET/POST do snapshot de orçamentos (D1)
    bloqueios.js            aquisição e liberação de bloqueios de edição
    auth/
      google.js / google-callback.js         fluxo OAuth Google
      microsoft.js / microsoft-callback.js   fluxo OAuth Microsoft
    admin/
      usuarios.js            aprova/bloqueia usuários e concede edição (só para admins)
      bloqueios.js           liberação administrativa de bloqueios
index.html                 app principal (orçamentos)
login.html                 tela de login (Google / Microsoft)
aguardando-aprovacao.html  tela pra quem já logou mas ainda não foi aprovado
admin.html                 painel pra aprovar/bloquear usuários e gerenciar bloqueios
```

## Autenticação e aprovação de acesso

1. A pessoa acessa o site e é redirecionada pra `/login`
2. Entra com Google ou Microsoft
3. No primeiro login, é criado um registro em `usuarios` com status `pendente`,
   e a pessoa vê a tela "aguardando aprovação"
4. O administrador entra em `/admin.html` e aprova (ou bloqueia) o acesso
5. Usuários aprovados começam somente com visualização; o administrador pode habilitar
   edição globalmente na lista de usuários
6. Para editar, a pessoa seleciona **Editar** no orçamento; **Visualizar** não adquire bloqueio
7. O bloqueio permanece até o editor clicar em **Liberar orçamento** ou um administrador
   liberá-lo no painel. Não há expiração automática.

## Deploy e configuração

O deploy é automático a cada push na branch `main` (Cloudflare Pages).

Variáveis de ambiente necessárias (**Workers e Pages → Settings → Environment variables**):

| Variável | Descrição |
|---|---|
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | credenciais OAuth do Google Cloud Console |
| `MICROSOFT_CLIENT_ID` / `MICROSOFT_CLIENT_SECRET` | credenciais OAuth do Microsoft Entra |
| `SESSION_SECRET` | string aleatória usada para assinar o cookie de sessão |
| `ADMIN_EMAILS` | e-mails (separados por vírgula) com acesso ao painel `/admin.html` |

Associação de banco de dados (**Settings → Functions → D1 database bindings**):
nome `DB` → banco `ibuild-orcamentos`.

## Rodando o schema do banco

```sql
-- db/schema.sql         (tabela orcamentos)
-- db/schema-usuarios.sql (tabela usuarios)
-- db/migrations/20261012_permissao_edicao.sql (banco existente)
```
Execute pelo console do D1 (**Workers e Pages → D1 → ibuild-orcamentos → Console**).
Não execute a migração em bancos que já tenham a coluna `usuarios.podeEditar`. A migração foi
aplicada ao D1 de produção; usuários existentes permanecem somente com visualização até a liberação
de edição pelo administrador.
