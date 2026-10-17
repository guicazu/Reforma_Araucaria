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

- **Avanço físico** (Planejamento): previsto × realizado de hoje, desvio, obras atrasadas, avanço por
  obra (ou curva S da obra escolhida) e os serviços mais atrasados.
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

### Planejamento (cronograma e avanço físico)

O cronograma de cada obra fica no servidor e usa a EAP da versão atual do orçamento: cada serviço é
uma tarefa. Serviço novo no orçamento entra sozinho no cronograma (com a duração padrão, depois da
etapa anterior) e fica marcado como “novo” até alguém revisar e salvar.

- **Cronograma**: cada linha tem um Nº; as predecessoras são indicadas pelo Nº da linha, separadas por
  vírgula ou ponto e vírgula, com espera opcional (`4; 7+2`; a linha de uma etapa vale para todos os
  serviços dela). “Não iniciar antes de”, caminho crítico e folga de cada serviço, Gantt com zoom e
  exportação CSV. Predecessoras em círculo são apontadas e impedem salvar; duas pessoas gravando ao
  mesmo tempo não se sobrescrevem.
- **Duração pela equipe**: as horas de mão de obra de cada serviço vêm da composição no orçamento. Se
  o serviço tem oficial, a duração é horas do oficial principal ÷ número de oficiais; só com ajudante,
  horas do ajudante ÷ número de ajudantes (encarregado, engenheiro e afins não contam). As horas viram
  dias pelo horário de cada dia do calendário (ex.: sexta mais curta). A equipe segue a proporção das
  horas (8 h de oficial e 16 h de ajudante = 1 oficial para 2 ajudantes; papel que a composição não
  tem fica 0); mudar os oficiais leva os ajudantes junto, e ajudante digitado fica fixo (com aviso se
  ficar abaixo da proporção). Digitar a duração ajusta a equipe para caber nesses dias; se nem uma
  pessoa precisa de tantos dias, o serviço fica manual. ↺ volta ao cálculo. Serviço sem mão de obra
  no orçamento tem duração digitada.
- **Avanço físico**: o % executado acumulado de cada serviço numa data (até hoje); etapas e obra
  somam pelo valor orçado. Cada apontamento fica no histórico e pode ser excluído.
- **Curva S**: previsto pelo cronograma × realizado pelos apontamentos, com tabela.

- **Calendários** (menu Engenharia): dias da semana e horário de trabalho de cada um (início, fim e
  intervalo; o turno pode passar da meia-noite), feriados nacionais (calculados,
  com Sexta-feira Santa pela Páscoa), estaduais e municipais (escolhendo o município), pontos
  facultativos (Carnaval, Cinzas, Corpus Christi, vésperas de Natal e Ano Novo), dias específicos
  parados (ex.: recesso) ou trabalhados (ex.: sábado de compensação) e **pontes sugeridas**: o dia
  de trabalho entre um feriado e o fim de semana ou entre dois feriados (feriado na terça sugere a
  segunda). Cada cronograma escolhe o seu calendário em Configurar; um deles é o padrão.

As contas ficam em `js/cronograma-motor.js` e `js/feriados.js`, os mesmos arquivos na tela, no
servidor e no Início. Os feriados estaduais e municipais vêm da base aberta
[feriados-brasil](https://github.com/joaopbini/feriados-brasil) (MIT, 3.838 dos 5.570 municípios com
feriados cadastrados), gerada por `dados/feriados/gerar.py`; a tela permite corrigir e completar.

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
- **E-mails aos fornecedores** (convite de cotação e pedido com PDF): saem do endereço de envio
  (padrão `contato@cazu.com.br`, domínio verificado no Resend) com o nome de quem envia, "Responder
  para" o e-mail de login dessa pessoa e cópia oculta para ela (opcional); quem entra com e-mail do
  mesmo domínio envia com o próprio endereço. Em **Parâmetros › Configurar e-mails** o administrador
  edita remetente, rodapé e os textos com campos `{{fornecedor.nome}}`, `{{pedido.valor}}`,
  `{{usuario.nome}}`… (trechos `[[ ]]` somem quando o campo está vazio), com prévia ao lado e e-mail
  de teste. Falhas do Resend viram mensagens claras (domínio não verificado, chave inválida, limite).
  Textos padrão, campos e montagem em `js/email-modelos.js` (o mesmo na tela e no servidor).
- **Cadastro de fornecedor**: digitar o CNPJ traz os dados públicos da Receita (razão social, nome
  fantasia, inscrição estadual, endereço, telefone, e-mail, situação cadastral) e avisa se o
  fornecedor já existe; digitar o CEP preenche rua, bairro, cidade e UF. Fontes gratuitas, com
  reserva: BrasilAPI e CNPJ.ws (CNPJ), BrasilAPI e ViaCEP (CEP), em cache por alguns dias.

### Ajuda (manual do sistema)

**Apoio › Ajuda** (para todos) reúne 23 tópicos em seis grupos — Primeiros passos, Engenharia,
Suprimentos, Financeiro, Administração e Dúvidas frequentes — com passo a passo, fotos das telas
(clique amplia) e vídeos curtos de demonstração. A busca procura em todos os textos sem diferenciar
acentos; cada tópico tem anterior/próximo e o botão **Abrir a tela** (só quando a pessoa pode ver a
tela). O botão **Ajuda** no topo abre o tópico da tela em que a pessoa está (no Suprimentos, pela
tela interna: formulário de solicitação, mapa de cotação…), e o endereço `/#ajuda/<tópico>` abre um
tópico direto, para mandar o link.

Os textos ficam em `ajuda/artigos.html` (um `<article id data-titulo data-grupo data-tela data-resumo
data-palavras>` por tópico, lido por `js/ajuda.js`); as fotos em `ajuda/img/*.webp` (1440×900) e os
vídeos em `ajuda/video/*.mp4` (H.264, 1280 px, carregados só ao tocar). Para um tópico novo, basta
acrescentar o `<article>` no grupo certo; o índice, a busca e os cartões da página inicial se montam
sozinhos. Fotos e vídeos foram gravados com dados de demonstração no banco local.

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
js/planejamento.js        Planejamento: cronograma com Gantt, avanço físico e curva S (módulo ES)
js/cronograma-motor.js    contas do cronograma (calendário, caminho crítico, avanço, curva S), também
                          usado pelo servidor
js/graficos.js            curva S e dica flutuante usadas pelo Início e pelo Planejamento
js/calendarios.js         Calendários de trabalho (módulo ES)
js/feriados.js            feriados nacionais, estaduais, facultativos, Páscoa e pontes (também no servidor)
dados/feriados/           municipais/<UF>.json (municípios e feriados municipais) e o gerador
js/suprimentos/           telas de Suprimentos (nucleo.js: API, janelas, navegação, escolha de insumo)
js/financeiro.js          Contas a pagar
js/ajuda.js               Ajuda: índice, busca, artigos e o botão Ajuda do topo
ajuda/                    artigos.html (textos da ajuda), img/ (fotos webp) e video/ (demonstrações mp4)
portal-fornecedor.html    página pública do fornecedor (responder cotação, confirmar pedido)
db/                       schema.sql dos orçamentos, schema-usuarios.sql dos usuários
functions/
  _middleware.js          bloqueia todo o site pra quem não tem sessão aprovada
  _lib/
    session.js             cookie de sessão assinado (HMAC-SHA256)
    roteador.js            tabela de rotas das APIs com a permissão de cada uma
    suprimentos/           regras de Suprimentos (orçado por insumo, SC, cotação, pedido, nota,
                           contrato, estoque, contas a pagar, portal e PDF); rotas em rotas.js
    planejamento/          cronograma e apontamentos de avanço por obra; rotas em rotas.js
    usuarios.js             cria/aprova usuário no primeiro login
  api/
    orcamentos.js           GET/POST do snapshot de orçamentos (D1)
    bloqueios.js            aquisição e liberação de bloqueios de edição
    suprimentos/[[rota]].js /api/suprimentos/* (tabela de rotas em _lib/suprimentos/rotas.js)
    planejamento/[[rota]].js /api/planejamento/* (tabela de rotas em _lib/planejamento/rotas.js)
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
| `RESEND_API_KEY` | envio de e-mail de pedidos e convites de cotação pelo [Resend](https://resend.com), com o domínio `cazu.com.br` verificado; sem ela, use "Copiar link". Endereço, nome do remetente e textos ficam em Suprimentos › Cadastros › Parâmetros › Configurar e-mails |
| `RESEND_API_URL` | só nos testes locais: aponta o envio para um servidor falso que registra os e-mails |

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

O Planejamento usa `plan_cronogramas` e `plan_avancos`, criadas por
`db/migrations/20261019_planejamento.sql` (idempotente). Os cronogramas antigos ficavam só no
navegador; ao criar o cronograma de uma obra, a tela oferece trazer as durações que encontrar ali.

```sh
wrangler d1 execute ibuild-orcamentos --remote --file=db/migrations/20261019_planejamento.sql
wrangler d1 execute ibuild-orcamentos --remote --file=db/migrations/20261020_calendarios.sql
```

As tabelas antigas do módulo de compras (`requisicoes`, `itens_requisicao`, `cotacoes`,
`cotacao_*`, `fornecedores`) não são mais usadas.
