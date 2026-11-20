# 03 — Auditoria de Funcionalidades, Interface e Navegação — NER AGENCY OS

---

## 1. Matriz de Funcionamento por Área

| Área | Abre & Navega? | Botões Reais? | Validação de Formulários | Persiste & Recupera? | Edição | Exclusão | Filtros / Busca | Indicadores Reais? | Relatórios | Erros Tratados? | Auditoria |
|---|---|---|---|---|---|---|---|---|---|---|---|
| **NER Core** | Sim | Parcial (reset senha é stub) | Sim (e-mail, senha, slug) | Sim (JSON) | Parcial (status usuário; sem editar usuário/cliente) | Não | Não | Sim | LGPD JSON | Sim | Sim |
| **NER Strategy** | Sim | Sim (depende chave IA) | Sim | Não (volátil) | N/A | N/A | Não | N/A | Não | Sim | Via AI logs |
| **NER Creative** | Sim | Sim | Sim | Sim (JSON) | Apenas status | Não | Não | Sim | Não | Sim | Sim |
| **NER Performance** | Sim | Parcial (teto local; sem sync Ads) | Sim | Sim (JSON) | Apenas teto diário | Não | Não | **Não (seed/demo)** | Não | Sim | Sim |
| **NER Web** | Sim | Parcial (sem editor visual/preview real) | Sim (slug único) | Sim (JSON) | Apenas status na UI | Não | Não | Sim (conversões) | Não | Sim | Sim |
| **NER Automation** | Sim | Parcial (n8n real; internos só contam) | N/A | Sim (JSON) | Apenas toggle ativo | Não | Não | Contadores locais | Não | Sim | Sim |
| **NER Intelligence** | Sim | Sim | N/A | Sim (leitura) | N/A | N/A | Não | Parcial (Ads é seed) | Não | Sim | Não |
| **NER Business** | Sim | Sim | Sim | Sim (JSON) | Parcial (estágio opp, baixa fin.) | Não | Não | Sim | Resumo financeiro | Sim | Sim |
| **NER Projects** | Sim | **Bug em `Backlog` (400)** | Sim | Sim (JSON) | Parcial (status tarefa, aprovação) | Não | Não | Sim (`%` real) | Não | Sim | Sim |
| **NER Tracking** | Sim (em Intelligence) | Sim | Sim | Sim (JSON) | Não | Não | Não | Sim (dedup real) | Não | Sim | Sim |
| **NER Client Experience** | Sim | Sim (sem alterar status chamado) | Sim | Sim (JSON) | Apenas decisão aprovação | Não | Não | Sim | Não | Sim | Sim |
| **NER Operations & Gov.** | Sim | Sim (sem gerir incidentes) | Sim (LGPD) | Sim (JSON) | Não (incidentes) | Não | Não | Sim (Node/RSS/uptime) | LGPD JSON | Sim | Sim |
| **NER Billing** | Sim | Parcial (checkout local; sandbox HMAC) | Sim | Sim (JSON) | Via webhook | Não | Não | Sim | Histórico webhooks | Sim | Sim |
| **NER Digital Studio** | Sim | Sim | Sim (preços >= 0) | Sim (JSON) | Sim (setup e recorrência) | Não | Não | Sim | Não | Sim | Sim |
| **NER AI Gateway** | Sim | Sim (sem chaves live) | Sim | Sim (JSON) | Sim | Sim (credenciais, memória API) | Sim (modelos, histórico) | Sim | Sim | Sim | Sim |
| **NER AI Cost Intelligence** | Sim | Sim | Sim | Sim (JSON) | Sim (políticas, preços, alertas) | Sim (exceções) | Sim (período, provedor, modelo, dept, cliente) | Sim | **CSV, XLSX, PDF** | Sim | Sim |

---

## 2. Bugs Reais, Telas Demonstrativas e Botões com Comportamento Enganoso

### 2.1 Bug Funcional Confirmado (UI envia valor rejeitado pelo Backend)
- **Local:** `src/components/OperationsViews.tsx:236` vs `server/app.ts:52`
- **Descrição:** Na tela `NER Projects`, o seletor de status da tarefa inclui `<option value="Backlog">Backlog</option>`. Ao selecionar `Backlog`, o frontend dispara `PATCH /api/tasks/:id`, mas `VALID_TASK_STATUS` no backend só aceita `['A fazer', 'Em andamento', 'Em revisão', 'Concluída']`.
- **Evidência ao vivo:** Sonda `PATCH /api/tasks/tsk-1` com `{ "status": "Backlog" }` retornou **HTTP 400** (`{"error":"Status de tarefa inválido."}`).

### 2.2 Ação que Retorna Sucesso Sem Executar Operação (Stub/No-Op)
- **Local:** `server/app.ts:135-146` e `src/components/LoginScreen.tsx:53-68`
- **Descrição:** O fluxo "Esqueci minha senha" (`POST /api/auth/forgot-password`) valida formato de e-mail e retorna `200 OK` com mensagem `"Se o e-mail estiver cadastrado e ativo, as instruções de redefinição foram registradas."`, **porém não gera token, não grava registro em banco nem envia e-mail**.

### 2.3 Dados Estáticos / Demonstrativos Apresentados na Interface
- **NER Performance (`PerformanceView` / `server/store.ts`):** As contas `acc-1` (Meta Ads — `R$ 28.400`, `ROAS 4.8x`, `Conectado (Demo)`) e `acc-2` (Google Ads — `R$ 16.800`, `ROAS 3.9x`, `Pendente de Credenciais`) são estáticas. O botão `+ R$ 250 Teto Diário` apenas altera o número no JSON local sem se comunicar com Meta/Google.
- **NER Automation (`AutomationView`):** Os workflows `wf-1` e `wf-2` exibem contador de execuções que é incrementado diretamente na rota de criação de lead / contrato sem execução de motor de automação real.
- **NER Billing (`OperationsBillingView`):** O botão `Iniciar Checkout` gera um ID local (`cs_sandbox_*` ou `cs_live_*`) em `server/services/billing-stripe.ts:135` sem criar sessão real na API do Stripe; os botões `Simular Webhook Pago (HMAC)` e `Simular Falha` usam o endpoint de desenvolvimento `/api/billing/sandbox-webhook` (que é bloqueado com `403` quando `NODE_ENV=production`).

---

## 3. Discrepâncias Entre Backend e Interface

### 3.1 Funcionalidades Existentes no Backend SEM Acesso na Interface
1. **Gestão Direta de Clientes (`GET/POST/PATCH /api/clients`)** — `server/app.ts:336-408`: Não existe aba ou tela de Clientes na sidebar (`src/App.tsx`). Clientes só podem ser criados indiretamente via conversão de Lead e não podem ser editados pela UI.
2. **Criação Manual de Projeto (`POST /api/projects`)** — `server/app.ts:1126`: `ProjectsView` não possui botão/modal de novo projeto (projetos só nascem via Digital Studio ou aceite de Proposta).
3. **Criação de Entregável (`POST /api/deliverables`)** — `server/app.ts:1265`: Sem formulário na UI.
4. **Solicitação de Aprovação (`POST /api/approvals`)** — `server/app.ts:1303`: Sem formulário na UI (apenas decisão de aprovações já existentes).
5. **Edição de Conteúdo/SEO/WhatsApp de Páginas Web (`PATCH /api/web/pages/:id`)** — `server/app.ts:1754`: Backend aceita `sections`, `seoTitle`, `seoDescription`, `whatsappNumber`, `checkoutUrl`, `domain`, `pixelConfigured`, mas `WebView` só altera `status` (`Publicado`/`Rascunho`).
6. **Atualização de Status de Chamados (`PATCH /api/tickets/:id`)** — `server/app.ts:1912`: Sem controle na UI (`ClientPortalView` apenas lista chamados e abre novos).
7. **Lista de Incidentes Operacionais (`operations.incidents`)** — `server/app.ts:1968`: Retornada por `/api/operations/overview`, mas não renderizada em `OperationsBillingView`.
8. **Vinculação de Plano em Nova Proposta (`planCode` em `POST /api/proposals`)** — `server/app.ts:816`: Backend aceita `planCode`, mas o modal em `ProposalsView` não expõe seletor de plano.
9. **Embeddings e Limpeza de Memória IA (`POST /api/ai/embeddings`, `DELETE /api/ai/memory/:conversationId`)** — `server/ai/router.ts`: Disponíveis via API, sem controles na interface do `NER AI Center`.

### 3.2 Operações Ausentes Tanto no Frontend Quanto no Backend
- **Operações `DELETE`** em todas as entidades de negócio/operação (`users`, `organizations`, `clients`, `leads`, `opportunities`, `plans`, `proposals`, `contracts`, `projects`, `tasks`, `deliverables`, `creatives`, `webPages`, `workflows`, `tickets`). Confirmado em sonda (`404` para `/api/users/:id`, `/api/clients/:id`, `/api/projects/:id`).
- **Pesquisa e filtros dinâmicos** em quase todas as telas fora do `NER AI Center` (CRM, Pipeline, Propostas, Contratos, Financeiro, Projetos, Criativos, Web, Usuários, Auditoria).
- **Criação manual** de Contratos, Contas a Receber, Contas a Pagar, Comissões, Workflows e Incidentes.

---

## 4. Auditoria de Interface, Navegação e Responsividade

- **Sidebar & Navegação (`src/App.tsx`):** 28 abas organizadas em 4 grupos (`Visão & Núcleo`, `NER Business & Studio`, `Operação & Entrega`, `NER AI Center`). Filtragem de menu baseada em `can(permission)` do usuário autenticado.
- **Desktop e Mobile:** Implementa sidebar fixa em `lg:` (`w-72`) e drawer deslizante mobile (`mobileNavOpen`) com backdrop e botão hambúrguer no header (`App.tsx:444-530`). Tabelas possuem wrappers `overflow-x-auto`.
- **Seletor Multi-Tenant:** Exibido apenas para `Super Admin`; a troca de `activeOrgId` dispara recarga de dados e sincroniza formulários (`useEffect` corrigido em revisões anteriores).
- **Notificações:** Toast temporário de feedback (`notice` / `isError`) no canto superior/inferior para ações de sucesso e erro.
- **Bundle Frontend:** `vite build` gera chunk único `dist/assets/index-*.js` acima de `500 kB` (com aviso do bundler recomendando code-splitting por rota/módulo).
