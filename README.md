# Reforma Araucária — Acompanhamento de Obra

Site da iBuild Construtora para orçamentos de obra, publicado em
[araucaria.cazu.com.br](https://araucaria.cazu.com.br) via **Cloudflare Pages**.

## Funcionalidades

- Múltiplos orçamentos, com EAP em 4 níveis: Unidade Construtiva → Etapa → Sub Etapa → Serviço
- Colunas: EAP, descrição, quantidade, unidade, valor unitário, valor total
- Memória de cálculo por serviço (soma automática das quantidades)
- Subtotais por sub etapa, etapa e unidade construtiva
- Dados salvos no navegador (localStorage) **e sincronizados automaticamente** com um
  banco de dados compartilhado, pra equipe ver os mesmos orçamentos em qualquer aparelho
- Login obrigatório, com cadastro aprovado manualmente pelo administrador

## Stack

- Front-end: HTML / CSS / JavaScript puro (sem build step)
- Back-end: [Cloudflare Pages Functions](https://developers.cloudflare.com/pages/functions/)
- Banco de dados: [Cloudflare D1](https://developers.cloudflare.com/d1/) (`ibuild-orcamentos`)
- Autenticação: OAuth com Google e Microsoft, sessão por cookie assinado (HMAC)

## Estrutura

```
css/                      estilos
js/                       app.js (lógica dos orçamentos) e sync.js (sincronização com o servidor)
db/                       schema.sql dos orçamentos, schema-usuarios.sql dos usuários
functions/
  _middleware.js          bloqueia todo o site pra quem não tem sessão aprovada
  _lib/
    session.js             cookie de sessão assinado (HMAC-SHA256)
    usuarios.js             cria/aprova usuário no primeiro login
  api/
    orcamentos.js           GET/POST do snapshot de orçamentos (D1)
    auth/
      google.js / google-callback.js         fluxo OAuth Google
      microsoft.js / microsoft-callback.js   fluxo OAuth Microsoft
    admin/
      usuarios.js            lista e aprova/bloqueia usuários (só pra quem está em ADMIN_EMAILS)
index.html                 app principal (orçamentos)
login.html                 tela de login (Google / Microsoft)
aguardando-aprovacao.html  tela pra quem já logou mas ainda não foi aprovado
admin.html                 painel pra aprovar/bloquear usuários
```

## Autenticação e aprovação de acesso

1. A pessoa acessa o site e é redirecionada pra `/login`
2. Entra com Google ou Microsoft
3. No primeiro login, é criado um registro em `usuarios` com status `pendente`,
   e a pessoa vê a tela "aguardando aprovação"
4. O administrador entra em `/admin.html` e aprova (ou bloqueia) o acesso
5. A partir da aprovação, a pessoa tem sessão de 30 dias

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
```
Execute pelo console do D1 (**Workers e Pages → D1 → ibuild-orcamentos → Console**).
