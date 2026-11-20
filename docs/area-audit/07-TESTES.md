# 07 — Auditoria de Testes e Integridade do Banco de Dados — NER AGENCY OS

**Execução Realizada em:** 19/11/2026 (modo estritamente não destrutivo, sem desativação ou alteração de testes).

---

## 1. Resumo dos Comandos Executados

| Categoria | Comando / Procedimento | Resultado Real | Detalhes / Observações |
|---|---|---|---|
| **Lint / Typecheck** | `npm run lint` (`tsc --noEmit`) | **APROVADO (exit 0)** | `0` erros TypeScript em todo o projeto (`src/`, `server/`, `tests/`). |
| **Build de Produção** | `npm run build` (`vite build`) | **APROVADO (exit 0)** | Compilado em `1.27s`. Aviso de bundler: chunk JS único acima de `500 kB` (recomenda code-splitting). |
| **Testes Automatizados (Unit + Integração + API + E2E em memória)** | `npm test` (`tsx --test tests/*.test.ts`) | **28/28 APROVADOS (100%)** | Duração total: `6.67s`, `0` falhas, `0` pulados, `0` cancelados. |
| **Auditoria de Integridade do Banco (`database/data/ner-db.json`)** | Sonda read-only sobre o arquivo real em disco | **APROVADO (0 inconsistências)** | `0` chaves únicas duplicadas (`users.email`, `organizations.slug`, `commercialPlans.code`, `proposals.number`, `contracts.number`); `0` chaves estrangeiras órfãs (`clients`, `projects`, `tasks`, `deliverables`, `approvals`, `leads`, `memberships`). |
| **Auditoria RBAC & Isolamento Multi-Tenant (7 Perfis)** | Sonda HTTP ao vivo em store efêmero (`/tmp`) contra 19 endpoints | **PARCIAL (2 falhas de isolamento/permissão)** | Isolamento `org-1` vs `org-2` aprovado; **2 falhas descobertas** no perfil `Cliente` (`/api/finance/summary` vazando `mediaBudgetSeparated` global e `/api/billing/subscription` retornando `200`). |
| **Auditoria Funcional Adicional (Sondas Exploratórias)** | Sonda HTTP ao vivo em store efêmero (`/tmp`) | **3 falhas funcionais confirmadas** | (1) `PATCH /api/tasks/tsk-1` com `Backlog` -> `400`; (2) `POST /api/web/pages` na `org-2` sem entitlement (`landingPages: 0`) -> `201`; (3) `DELETE` inexistente (`404`) em users/clients/projects. |
| **Testes E2E de Navegador (Playwright / Cypress)** | Verificação de `package.json` e `tests/` | **NÃO EXISTEM** | Não há testes automatizados de browser/UI (DOM, formulários, responsividade mobile/desktop) — apenas testes HTTP/API e de motor em Node. |
| **Testes de Banco PostgreSQL / Migrations** | Verificação de `package.json` e `server.ts` | **NÃO EXISTEM** | `schema.prisma` e `database/migrations/*.sql` nunca são aplicados nem testados contra um PostgreSQL real no projeto. |

---

## 2. Detalhamento dos 28 Testes Automatizados (`npm test`)

### `tests/ner-ai-cost-intelligence.test.ts` (10/10 aprovados)
1. Cost Engine: cálculo input/output/cached/reasoning sem dupla cobrança e sem fabricar tokens indisponíveis (`1.4ms`)
2. Provider Adapters: extração de tokens cached/reasoning e `usageReported` (OpenAI, Anthropic, Gemini) (`32.3ms`)
3. Cost Intelligence API: telemetria, USD→BRL, drilldown por ação, p95, comparativo de modelos e segregação por cliente (`251.5ms`)
4. Cost Intelligence Governance: alertas 50/75/90/100%, `block_non_essential`, `fallback_economical`, `AiLimitException` (`150.3ms`)
5. Cost Intelligence Reliability: detecção de anomalias, deduplicação por `idempotencyKey` e alerta contábil resiliente (`116.9ms`)
6. Cost Intelligence Exports & Security: downloads reais CSV/XLSX/PDF, filtros multidimensionais, RBAC e isolamento multi-tenant (`206.3ms`)
7. Models Governance: modelos ativos, limites de token por modelo, alertas de proximidade e validação de capacidades (`133.3ms`)
8. Projected Cost Run-Rate & 50/75/90/100% Threshold Alerts (`0.7ms`)
9. Segmented CSV/PDF Billing Reports (Provider & Client) and Global/Org/Department Preventive Limits (`207.1ms`)
10. Threshold Alerts Management (50/75/90/100%): regras por faixa, canais, severidade, `customMessage` e sincronia (`119.8ms`)

### `tests/ner-ai-gateway.test.ts` (6/6 aprovados)
11. AI Security: AES-256-GCM criptografia/descriptografia, mascaramento, rejeição sem chave mestra e rotação (`242.0ms`)
12. AI RBAC & Multi-Tenant Isolation: bloqueio de cliente em outros departamentos e isolamento de logs/knowledge (`204.7ms`)
13. AI Providers, Model Discovery, Generation, Streaming SSE, Embeddings & Prompt Versioning (`135.8ms`)
14. AI Routing Resilience: retry 429, fallback econômico, bloqueio de fallback mais caro e teto por requisição (`138.8ms`)
15. AI Department Integrations: Strategy, Creative, Performance, Client Experience via gateway central (`176.7ms`)
16. AI Cost & Usage Dashboard: segmentação e alertas (`142.3ms`)

### `tests/ner-audit-e2e.test.ts` (6/6 aprovados)
17. Security Headers & Stripe Production Webhook Guard (`205.6ms`)
18. Proposal Acceptance → Contract ServiceType & Pending Receivable + Burst Digital Studio ID Uniqueness (`137.2ms`)
19. Cross-Tenant FK Ownership & Input Validation (`116.8ms`)
20. n8n Real HTTP Webhook Dispatch & Upstream Failure Handling (`103.3ms`)
21. AI Gateway Department Execute RBAC, Client Isolation & Retention Pruning (`191.8ms`)
22. LGPD Governance: Client Portability Export & Admin Irreversible Anonymization (`204.4ms`)

### `tests/ner-os.test.ts` (6/6 aprovados)
23. P0 Auth: rejeita sem auth, rejeita senha inválida, emite sessão HttpOnly e revoga no logout (`284.1ms`)
24. P0 RBAC & Multi-Tenant IDOR: isola organizações e escopo de cliente (`236.1ms`)
25. P0 Persistence: grava mutações atomicamente em disco e sobrevive à recarga do store (`103.4ms`)
26. P1 Digital Studio & Projects: edição separada de preços, contratação gerando projeto/entregáveis/tarefas e recálculo de progresso (`109.1ms`)
27. P1 Approvals, Finance separation, Web Lead capture, and Tracking deduplication (`116.1ms`)
28. P1 Stripe Billing: checkout permanece `incomplete`, rejeita HMAC inválido e ativa idempotentemente com webhook válido (`111.2ms`)

---

## 3. Auditoria Detalhada do Banco de Dados (`database/data/ner-db.json` vs `schema.prisma`)

### 3.1 Contagem Atual de Registros no Arquivo Real (`database/data/ner-db.json`)
- **Núcleo & Negócio:** `organizations: 2`, `users: 5`, `sessions: 0`, `clients: 3`, `commercialPlans: 7`, `leads: 3`, `opportunities: 2`, `proposals: 1`, `contracts: 1`, `receivables: 2`, `payables: 2`, `commissions: 1`, `auditLogs: 1`
- **Operação & Entrega:** `projects: 2`, `briefings: 1`, `tasks: 3`, `deliverables: 2`, `approvals: 2`, `timeTracking: 1`, `creatives: 2`, `adAccounts: 2`, `trackingEvents: 2`, `workflows: 3`, `webPages: 1`, `tickets: 1`, `subscriptions: 1`, `billingWebhookEvents: 0`, `incidents: 1`
- **AI Gateway & Cost Intelligence:** `providers: 8`, `models: 13`, `routingRules: 12`, `prompts: 3`, `costPolicies: 2`, `actions: 17`, `usageLogs: 0`, `memories: 0`, `knowledgeDocs: 0`, `limitExceptions: 0`, `accountingAlerts: 0`

### 3.2 Divergências Arquiteturais Críticas de Banco de Dados
1. **Motor em Runtime é JSON Flat-File (`PersistentStore`):** Toda a aplicação grava em `database/data/ner-db.json` via `writeFileSync` + `renameSync` (`server/store.ts:853-967`). Não há pool de conexões SQL, transações ACID concorrentes entre múltiplos processos/instâncias ou índices de banco.
2. **Schema Prisma Desincronizado com o Runtime:** `database/schema/schema.prisma` (617 linhas) **não modela 15 entidades existentes em `server/types.ts`**: `Receivable`, `Payable`, `Commission`, `Briefing`, `TimeEntry`, `CreativeAsset`, `AdAccount`, `TrackingEvent`, `Workflow`, `WebPage`, `Ticket`, `Incident`, `AiKnowledgeDoc`, `AiMemory`, `AiGlobalCostPolicy`.
3. **Migrations Não Executáveis no Runtime:** Existem 2 arquivos SQL em `database/migrations/` (`20261119_ai_model_token_limits.sql`, `20261119_ner_ai_cost_intelligence.sql`), porém `prisma` e `@prisma/client` nem constam no `package.json`.
4. **Cobertura de Testes Faltante:** Não há testes dedicados para `/api/creatives`, `/api/performance`, `/api/intelligence/summary`, `/api/tickets`, `/api/operations/overview`, nem testes E2E em browser (que teriam detectado o bug do `Backlog` na tela `ProjectsView`).
