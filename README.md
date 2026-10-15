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
  subcomposições, valores e coeficientes da referência de São Paulo, desonerada
- **Novidades:**
  - Código do serviço exibido na tela de orçamento (formato: unidade.etapa.sub-etapa.sequencial)
  - Estilização hierárquica na EAP (tamanhos e pesos de fonte diferenciados por nível)
  - Possibilidade de mover serviços entre sub-etapas e entre etapas
  - Possibilidade de mover sub-etapas entre etapas
  - Adicionar serviço diretamente sob uma etapa (sub-etapa opcional)
  - Menus "Composições" e "Insumos" no sidebar para gerenciamento de materiais

### Início (painel de acompanhamento)

A tela de entrada reúne indicadores e gráficos das obras e dos setores, com filtro de período
(3, 6 ou 12 meses) e de obra numa linha só. Cada seção aparece só para quem pode ver o módulo:

- **Custos das obras** (Acompanhamento): orçado, realizado, comprometido e saldo; medidores por obra
  (ou por etapa da EAP, com uma obra escolhida) com aviso de estouro; realizado por mês (notas e
  medições). Clicar numa obra abre o Acompanhamento dela.
- **Suprimentos**: autorizações pendentes, itens aguardando compra, cotações abertas, entregas
  atrasadas, comprado no período, economia sobre o preço orçado, entregas no prazo, prazo médio da
  solicitação ao pedido, compras por mês e maiores fornecedores.
- **Financeiro** (Contas a pagar): em aberto, vencido, a vencer em 7 dias, pago no mês, a pagar nas
  próximas 8 semanas e pago por mês.
- **Engenharia** (Orçamento): orçamentos e valor orçado das versões atuais, base SINAPI, catálogo
  próprio, maiores serviços (curva ABC), orçado por etapa e lista de orçamentos.

Os números vêm de `GET /api/suprimentos/inicio` (`functions/_lib/suprimentos/inicio.js`) e usam a
mesma conta do Acompanhamento; cada gráfico tem a tabela equivalente.

### Suprimentos (no padrão do SIENGE)

Cada obra é um orçamento; toda compra é apropriada a serviços da EAP da versão ativa.

- **Solicitação de compra** por insumo do orçamento: as composições (SINAPI pela base própria e
  composições próprias) são abertas até os insumos, com quantidade e saldo orçado por serviço.
  Item acima do saldo ou fora do orçamento sempre vai para autorização (ou é bloqueado, pelo
  parâmetro). A autorização é por item: os desmarcados são reprovados com motivo.
- **Cotação** com mapa comparativo (preço, pagamento, prazo, frete, validade), menor preço em
  destaque, rodadas de negociação, vencedor por item ou pelo menor total e divisão de um item entre
  fornecedores. O fornecedor responde pelo **portal** (`/portal-fornecedor?t=...`, sem login).
- **Pedido de compra** gerado pela cotação ou por compra direta, autorizado por **alçada** (tipo de
  documento e valor por usuário), enviado ao fornecedor por e-mail com PDF ou por link de
  confirmação; encerramento de saldo e cancelamento.
- **Entrada de nota fiscal** com entrega parcial, importação do XML da NF-e (fornecedor pelo CNPJ,
  itens casados com o pedido, impostos e duplicatas), parcelas no contas a pagar e entrada no
  estoque com frete e impostos rateados no custo. Cancelar a nota estorna tudo.
- **Contratos e medições**: itens apropriados nos serviços, aditivos (acréscimo, supressão, item
  novo, prazo), medições com caução, INSS, ISS, IR e PIS/COFINS/CSLL retidos; o líquido vira título
  a pagar e a caução é liberada no encerramento.
- **Estoque por obra**: saldo e custo médio, saída para serviço (requisição de material),
  transferência entre obras, entrada avulsa, inventário e estorno.
- **Autorizações**, **Painel** (pendências, atrasos, entregas e pagamentos) e **Acompanhamento**
  (orçado × comprometido × realizado por serviço e por insumo, com CSV).
- **Financeiro › Contas a pagar**: baixa, estorno e alteração de vencimento dos títulos.

## Stack

- Front-end: HTML / CSS / JavaScript puro (sem build step)
- Back-end: [Cloudflare Pages Functions](https://developers.cloudflare.com/pages/functions/)
- Banco de dados: [Cloudflare D1](https://developers.cloudflare.com/d1/) (`ibuild-orcamentos`)
- Autenticação: OAuth com Google e Microsoft, sessão por cookie assinado (HMAC)

## Estrutura

```
css/                      estilos (suprimentos.css: telas de Suprimentos e Contas a pagar; inicio.css: painel de Início)
js/                       app.js (lógica dos orçamentos e sincronização manual com o servidor)
js/inicio.js              painel de Início (indicadores e gráficos das obras e dos setores)
js/suprimentos/           telas de Suprimentos (nucleo.js: API, janelas, navegação, escolha de insumo)
js/financeiro.js          Contas a pagar
portal-fornecedor.html    página pública do fornecedor (responder cotação, confirmar pedido)
db/                       schema.sql dos orçamentos, schema-usuarios.sql dos usuários
functions/
  _middleware.js          bloqueia todo o site pra quem não tem sessão aprovada
  _lib/
    session.js             cookie de sessão assinado (HMAC-SHA256)
    suprimentos/           regras de Suprimentos (orçado por insumo, SC, cotação, pedido, nota,
                           contrato, estoque, contas a pagar, portal e PDF); rotas em rotas.js
    usuarios.js             cria/aprova usuário no primeiro login
  api/
    orcamentos.js           GET/POST do snapshot de orçamentos (D1)
    bloqueios.js            aquisição e liberação de bloqueios de edição
    suprimentos/[[rota]].js /api/suprimentos/* (tabela de rotas em _lib/suprimentos/rotas.js)
    portal/[[rota]].js      /api/portal/<token> — rota pública do portal do fornecedor
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

## Permissões por módulo

Em **Usuários › Editar permissões** o administrador marca, para cada pessoa, se ela pode
**visualizar** e/ou **editar** cada módulo do menu (Orçamento, Planejamento, Composições, Insumos,
Unidades, cada área de Suprimentos, Contas a pagar e Backup). Editar inclui visualizar; o que a pessoa
não pode visualizar some do menu e a API recusa. Quem ainda não teve a matriz salva segue a regra
antiga (visualiza tudo e edita se tinha "Permitir edição"). Administradores têm acesso total; quem
autoriza compras é definido pelas alçadas (Suprimentos › Cadastros). A regra fica em
`functions/_lib/permissoes.js` (coluna `usuarios.permissoes`, migração
`db/migrations/20261018_permissoes_modulos.sql`).

## Autenticação e aprovação de acesso

1. A pessoa acessa o site e é redirecionada pra `/login`
2. Entra com Google ou Microsoft
3. No primeiro login, é criado um registro em `usuarios` com status `pendente`,
   e a pessoa vê a tela "aguardando aprovação"
4. O administrador entra em `/admin.html` e aprova (ou bloqueia) o acesso
5. Usuários aprovados começam somente com visualização; o administrador define o que cada um
   visualiza e edita em **Editar permissões**
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
| `RESEND_API_KEY` | (opcional) envio de e-mail de pedidos e convites de cotação pelo [Resend](https://resend.com); sem ela, use "Copiar link" |
| `REMETENTE_EMAIL` | (opcional) remetente dos e-mails, ex.: `Compras <compras@seudominio.com.br>` |

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

Suprimentos usa as tabelas `supr_*` e `fin_titulos`, criadas por
`db/migrations/20261017_suprimentos.sql` (idempotente, só cria e preenche valores iniciais):

```sh
wrangler d1 execute ibuild-orcamentos --remote --file=db/migrations/20261017_suprimentos.sql
```

As tabelas antigas do módulo de compras (`requisicoes`, `itens_requisicao`, `cotacoes`,
`cotacao_*`, `fornecedores`) não são mais usadas.
