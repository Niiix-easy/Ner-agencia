# 11 — Registro de Correções Realizadas na Auditoria — NER AGENCY OS

Todas as correções abaixo foram implementadas sem duplicar módulos, compiladas (`tsc --noEmit` + `vite build`) e cobertas por regressão (`25/25`).

## 1. Infraestrutura & Runtime
1. **`/package.json`**: `"start": "node server.ts"` → `"start": "tsx server.ts"` (causa raiz: Node 22 strip-types quebrava em re-exports de tipos TS).
2. **`/.env.example`**: `DATABASE_URL` alinhada às credenciais do `docker-compose.yml` (`ner_admin:ner_secure_password`).
3. **`/server/app.ts` (`GET /api/operations/overview`)**: Corrigida detecção enganosa que reportava `'PostgreSQL'` apenas pela existência de `DATABASE_URL`; agora informa fielmente `'Atomic JSON File (database/data/ner-db.json)'` e `PostgreSQL / Prisma (runtime driver): false`, `Redis / BullMQ (runtime worker): false`.

## 2. Backend — Core, Segurança, Fluxos e LGPD
4. **`/server/services/digital-studio.ts`, `/server/services/billing-stripe.ts`, `/server/app.ts`**: Substituídos geradores de ID baseados em `Date.now()` por `uid(prefix)` com `crypto.randomBytes(3).toString('hex')` (evita colisão em requisições concorrentes).
5. **`/server/app.ts`**:
   - Middleware global de cabeçalhos de segurança (`X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy`, `Permissions-Policy`).
   - Hardening `getWebhookSecret()`: em `NODE_ENV=production` não utiliza segredo sandbox; `/api/webhooks/stripe` retorna `503` sem `STRIPE_WEBHOOK_SECRET`.
   - `PATCH /api/proposals/:id/accept`: herda `serviceTemplateType` e `recurrence` do `CommercialPlan` (`planCode`) e cria `Receivable` pendente (`mediaBudget: 0`).
   - `POST /api/workflows/:id/test`: workflows `n8n` executam `fetch POST` real para `N8N_WEBHOOK_URL` (timeout 8s) e retornam `502` em erro upstream sem falsificar execuções.
   - Validação cross-tenant de FKs e enums em usuários (`password >= 6` + `clientId` org-scoped para `Cliente`), clientes, oportunidades, tarefas, aprovações, time-tracking, tracking, web pages e chamados.
   - **LGPD Art. 18**: endpoints `GET /api/lgpd/clients/:id/export` e `POST /api/lgpd/clients/:id/anonymize`.

## 3. Backend — NER AI Gateway
6. **`/server/ai/gateway.ts`**: `pruneExpiredMemories()` implementado e chamado em `saveMemoryEntry()` respeitando `retentionDays`; `purgeConversationMemory()` aceita `clientId` para escopo seguro.
7. **`/server/ai/router.ts`**:
   - `POST /api/ai/department/execute`: exige `ai.use`/`ai.client_assist`, usa `resolveScopedOrg`, valida `clientId`/`projectId` no tenant e retorna **`403`** explícito se `Cliente` informar `clientId` divergente.
   - `POST /api/ai/knowledge`, `DELETE /api/ai/memory/:conversationId` e `POST /api/ai/embeddings`: corrigido isolamento multi-tenant/cliente.

## 4. Frontend — UX/UI, Responsividade, Multi-Tenant e LGPD
8. **`/src/App.tsx`**: Adicionado menu drawer responsivo para mobile (`mobileNavOpen` + botões `Menu`/`X`) e passado `activeOrgId` para `StrategyView` e props LGPD para `AuditLogsView`.
9. **`/src/components/OperationsViews.tsx` (`StrategyView` e views operacionais)**: `StrategyView` agora envia `organizationId: activeOrgId` para `/api/ai/stream` e `/api/ai/generate`; sincronização via `useEffect` de `selectedProjectId`, `clientId`, `pageId` e `selectedPlanCode` ao trocar de tenant.
10. **`/src/components/BusinessViews.tsx`**: Sincronização via `useEffect` de `clientId` em `PipelineKanbanView`, `CommercialPlansView` e `ProposalsView` ao trocar `activeOrgId`.
11. **`/src/components/AiCenterViews.tsx`**: `handleTest` exibe `res.message || res.error`; `window.confirm` substituído por confirmação inline na revogação de chaves.
12. **`/src/components/CoreViews.tsx`**: Painel "Direitos do Titular (LGPD Art. 18)" em `AuditLogsView` com exportação JSON e anonimização em duas etapas.
