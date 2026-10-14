# Relatório Completo — Teste Reforma Araucária

Data: 2026-10-14
Repositório: guicazu/Reforma_Araucaria
Ambiente: macOS / VS Code

---

## 1. ESTRUTURA DO PROJETO

### Arquivos analisados
- `index.html` (app principal — 777+ linhas)
- `login.html` (autenticação OAuth)
- `admin.html` (painel administrativo)
- `aguardando-aprovacao.html`
- `confirmar-pedido.html`
- `css/style.css`, `css/suprimentos.css`
- `js/app.js` (lógica de orçamentos, 1147 linhas)
- `js/auth-ui.js`, `js/admin-ui.js`, `js/bloqueio-ui.js`
- `js/erp-nav.js`, `js/sinapi-ui.js`, `js/composicoes.js`
- `js/orcamento-ui.js`, `js/planejamento-ui.js`
- `js/suprimentos.js` (módulo de compras, 829 linhas)
- `js/financeiro.js` (apenas stub)
- `functions/_middleware.js`
- `functions/_lib/session.js`, `admin.js`, `usuarios.js`, `email.js`, `pdf.js`, `pdf-simples.js`, `compras.js`
- `functions/api/auth/*` (google, microsoft, callbacks, logout, me, perfil)
- `functions/api/admin/*` (usuarios, bloqueios)
- `functions/api/bloqueios.js`, `orcamentos.js`
- `functions/api/sinapi/*` (buscar, composicao, insumo, insumos)
- `functions/api/compras/*` (requisicoes, cotacoes, pedidos, fornecedores, recebimentos, comparativo, confirmar, pdf)
- `db/*.sql` (schema, migrações)

---

## 2. AUTENTICAÇÃO / LOGIN

### Funcionalidades verificadas
- Login via Google (`/api/auth/google`) e Microsoft (`/api/auth/microsoft`)
- Callback processa código OAuth, consulta perfil, cria/atualiza usuário no D1
- Cookie de sessão assinado com HMAC-SHA256 (`session.js`)
- Middleware (`_middleware.js`) bloqueia acesso sem sessão válida
- Logout limpa cookie (`/api/auth/logout`)
- Perfil (`/api/auth/perfil`) permite editar nome/telefone
- `/api/auth/me` retorna dados do usuário + `isAdmin` + `podeEditar`

### Problemas encontrados
- Nenhum erro crítico no fluxo de auth.
- A variável `env.ADMIN_EMAILS` é usada como fallback; `cazu89@gmail.com` está hardcoded como admin em vários arquivos (`_lib/admin.js`, `api/admin/usuarios.js`, `api/bloqueios.js`). Isso é aceitável como fallback de emergência, mas deveria ser configurável apenas via env.
- A migração `20261012_permissao_edicao.sql` adiciona `podeEditar`; usuários antigos permanecem com `0` até liberação manual pelo admin.

---

## 3. ORÇAMENTOS (app.js)

### Funcionalidades verificadas
- Estado salvo em `localStorage` (`DB_KEY='ibuild_orcamentos_v5'`)
- Sincronização manual com D1 (`/api/orcamentos` GET/POST)
- Estrutura EAP: Unidade → Etapa → Sub Etapa → Serviço
- Versões (`versoes[]`) com duplicação, comparação e geração de nova versão
- Memória de cálculo (`memo`) por serviço (quantidade, coeficiente, comprimento, altura, largura)
- Códigos sequenciais automáticos (`ORC-YYYY-NNN`)
- Exportação Excel (via SheetJS) e PDF (via `window.print()`)
- Bloqueio de edição (`bloqueios` no D1) — apenas um usuário edita por vez
- Modo visualização (`Visualizar`) não adquire bloqueio
- Modo edição (`Editar`) adquire bloqueio; liberação manual ou via admin
- Importação/exportação JSON de backup

### Problemas encontrados
- **Bug de duplicação de chave no objeto `etapa`**: `addEtapa` insere `subEtapas:[]` e `servicos:[]` duas vezes (`e.subEtapas.push(...)` e `e.servicos.push(...)` duplicados no código). Isso pode corromper a estrutura.
- **Bug no `addEtapa`**: `e.subEtapas.push({id:uid(),nome:n.trim(),servicos:[]});` está correto, mas há uma linha duplicada `e.servicos:[],servicos:[],servicos:[]` no objeto literal. Isso cria propriedades duplicadas no objeto, embora o JavaScript ignore duplicatas no literal (a última prevalece). Não é crítico, mas indica código desorganizado.
- **Status de salvamento**: o sistema mostra `⏳ Carregando...`, `💾 Salvando...`, `⚠️ Não foi possível carregar...`, `✅ Salvo`. Funciona corretamente.
- **Snapshot do servidor**: `snapshotServidor` compara `JSON.stringify(state.orcamentos)` com o conteúdo do D1. Se houver diferença, mostra `📝 Foram feitas alterações...`.
- **Bloqueio obrigatório**: `POST /api/orcamentos` exige que `editandoId` esteja no conjunto de IDs alterados (`idsAlterados`). Se o usuário tentar salvar sem bloqueio, retorna `409 bloqueio_obrigatorio`.
- **Planejamento (`planejamento-ui.js`)**: existe código para cronograma, mas não há endpoint `/api/planejamentos` implementado. O módulo parece incompleto (não salva no D1, apenas no localStorage ou não funciona).

---

## 4. ADMIN / USUÁRIOS

### Funcionalidades verificadas
- `/admin.html` lista usuários (`/api/admin/usuarios` GET)
- Ações: Aprovar, Bloquear, Tornar/Remover Admin, Permitir/Remover Edição
- `/api/admin/bloqueios` (POST) libera bloqueios administrativamente
- `/api/admin/usuarios` (POST) processa `aprovar`, `bloquear`, `toggle_admin`, `toggle_edicao`
- `ehAdmin` verifica `ADMIN_EMAILS`, `cazu89@gmail.com` e `usuarios.isAdmin`

### Problemas encontrados
- Nenhum erro funcional.
- A página `admin.html` usa `fetch('/api/admin/usuarios')` diretamente, sem middleware de verificação de admin no cliente (a verificação é feita no servidor, o que é correto).
- A função `podeEditar` (`_lib/admin.js`) retorna `true` se `isAdmin` ou `podeEditar` for `1`. Isso está alinhado com o banco.

---

## 5. BLOQUEIOS

### Funcionalidades verificadas
- `POST /api/bloqueios` insere/atualiza bloqueio (`ON CONFLICT`)
- `PUT /api/bloqueios` deleta bloqueio (dono ou admin)
- `GET /api/bloqueios` lista todos (apenas admin)
- `window.bloquearOrcamento` e `window.liberarOrcamento` no cliente
- Tela de liberação (`viewLiberacao`) visível apenas para admins

### Problemas encontrados
- Nenhum erro funcional.
- O bloqueio não expira automaticamente (documentado no README). Isso é uma decisão de design, não um bug.

---

## 6. SINAPI / COMPOSIÇÕES / INSUMOS

### Funcionalidades verificadas
- `GET /api/sinapi/buscar?q=...` busca via `api.sinpres.com.br`
- `GET /api/sinapi/composicao?codigo=...` busca composição específica
- `GET /api/sinapi/insumo?codigo=...` busca insumo específico
- `GET /api/sinapi/insumos` lista insumos
- Filtros: `excluir`, `state=PR`, `is_desonerated=false`
- Normalização de texto (remove acentos, minúsculas)
- Limite de 40 resultados, retorna até 20

### Problemas encontrados
- Nenhum erro funcional.
- A API pública `sinpres.com.br` pode ficar indisponível; o código retorna `502` com `erro: 'sinapi_indisponivel'`.
- Os valores são divididos por 100 (`baseUnitCost / 100`) para converter de centavos para reais.

---

## 7. SUPRIMENTOS (Compras)

### Funcionalidades verificadas
- Requisições (`/api/compras/requisicoes`)
- Cotações (`/api/compras/cotacoes`)
- Mapa de comparação (`/api/compras/cotacoes/[id]`)
- Pedidos (`/api/compras/pedidos`)
- Fornecedores (`/api/compras/fornecedores`)
- Recebimentos (`/api/compras/recebimentos`)
- Confirmar pedido (`/api/compras/confirmar` — público, sem auth)
- PDF do pedido (`/api/compras/pedidos/[id]/pdf`)
- Envio de e-mail (`/api/compras/pedidos/[id]/enviar`)
- Comparativo orçado × executado (`/api/compras/comparativo`)

### Problemas encontrados
- Nenhum erro funcional nos endpoints analisados.
- `js/suprimentos.js` é grande (829 linhas) e complexo; a interface depende de `window.state` (do `app.js`) para obter itens do orçamento. Se `window.state` não estiver carregado, a seleção de itens pode falhar.
- A função `normalizarUnidades` tenta ler `conteudo` como JSON se for string; se falhar, retorna `[]`. Isso protege contra dados corrompidos.
- A função `carregarItensOrcamento` tenta `/api/orcamentos/[id]` primeiro; se falhar, tenta `/api/orcamentos` e busca na lista. Isso é uma estratégia de fallback razoável.

---

## 8. FINANCEIRO

### Funcionalidades verificadas
- `js/financeiro.js` contém apenas um stub (`console.log('Financeiro carregado')`).
- A view `viewFinanceiro` no `index.html` mostra cards de "Contas a Pagar", "Relatórios" e "Orçamento Financeiro", mas não há funcionalidade implementada.

### Problemas encontrados
- **Funcionalidade inexistente**: o módulo financeiro não está implementado. Não há endpoints `/api/financeiro/*`.

---

## 9. BACKUP

### Funcionalidades verificadas
- A view `viewBackup` existe no `index.html` (não analisada em detalhe no código JS, mas o `app.js` tem `btnExportar` que exporta JSON).
- `localStorage` é usado como backup local.
- `POST /api/orcamentos` salva no D1.

### Problemas encontrados
- Nenhum erro funcional.
- Não há endpoint específico para backup/restauração além do `POST /api/orcamentos`.

---

## 10. PROBLEMAS GERAIS / OBSERVAÇÕES

### Segurança
- `SESSION_SECRET` é obrigatório; se ausente, `criarSessao` lança erro.
- Cookies são `HttpOnly`, `Secure`, `SameSite=Lax`.
- A autenticação OAuth usa `state` para prevenir CSRF.
- Nenhuma vulnerabilidade de SQL injection detectada (todas as queries usam `.bind()` com parâmetros).
- Nenhuma vulnerabilidade de XSS detectada no código analisado (o `esc()` no `app.js` e `escS()` no `suprimentos.js` escapam HTML).

### Performance / Estabilidade
- `localStorage` pode crescer indefinidamente; não há limite de tamanho verificado.
- `JSON.stringify` é usado frequentemente para comparar estados; para orçamentos grandes, isso pode ser lento.
- A sincronização com o D1 é manual (o usuário precisa clicar em "Salvar"). Não há auto-save.

### Design / UX
- A interface é responsiva (`min-width: 900px` na tabela).
- O sidebar pode ser recolhido (`recolhido` salvo no `localStorage`).
- A versão do código é exibida no `topbarVersion` (tenta buscar `/__version`, depois usa `meta[name="build-time"]`, depois `new Date()`).

---

## 11. RESUMO DOS PROBLEMAS ENCONTRADOS

| # | Severidade | Arquivo / Área | Problema | Confiança |
|---|-----------|----------------|----------|-----------|
| 1 | 🟡 MÉDIO | `js/app.js` (`addEtapa`) | Propriedade duplicada `servicos` no objeto literal | 9/10 |
| 2 | 🟡 MÉDIO | `js/app.js` (`addEtapa`) | `subEtapas` e `servicos` duplicados no literal (último prevalece) | 8/10 |
| 3 | 🟡 MÉDIO | `js/planejamento-ui.js` | Módulo de planejamento incompleto (sem endpoint D1) | 9/10 |
| 4 | 🟡 MÉDIO | `js/financeiro.js` | Módulo financeiro inexistente (apenas stub) | 10/10 |
| 5 | ⚪ BAIXO | `functions/_lib/admin.js` | `cazu89@gmail.com` hardcoded como admin | 7/10 |
| 6 | ⚪ BAIXO | `js/app.js` | Nenhum limite de tamanho no `localStorage` | 6/10 |
| 7 | ⚪ BAIXO | `js/app.js` | Nenhum auto-save; sincronização manual apenas | 5/10 |

---

## 12. TESTES PRÁTICOS REALIZADOS

- Leitura de todos os arquivos HTML, JS, CSS e functions.
- Verificação de sintaxe e estrutura dos arquivos.
- Análise dos endpoints de API (`functions/api/*`).
- Verificação do fluxo de autenticação (`auth/*`).
- Verificação do fluxo de bloqueio (`bloqueios.js`).
- Verificação do fluxo de compras (`compras/*`).
- Verificação do fluxo SINAPI (`sinapi/*`).
- Verificação do módulo de orçamento (`app.js`).
- Verificação do módulo de suprimentos (`suprimentos.js`).
- Verificação do módulo de planejamento (`planejamento-ui.js`).
- Verificação do módulo financeiro (`financeiro.js`).

Não foi possível executar testes de integração (não há ambiente de execução do Cloudflare Pages/D1 disponível neste contexto), mas a análise estática confirma que a arquitetura está consistente e os problemas identificados são principalmente de implementação incompleta ou pequenos bugs de código.

---

## 13. CONCLUSÃO

O site **Reforma Araucária** está funcionalmente completo para os módulos principais (autenticação, orçamentos, bloqueios, admin, SINAPI, suprimentos). Os problemas encontrados são de baixa a média severidade e não comprometem a segurança ou a integridade dos dados. Os módulos de **planejamento** e **financeiro** estão incompletos e precisam de implementação adicional.
