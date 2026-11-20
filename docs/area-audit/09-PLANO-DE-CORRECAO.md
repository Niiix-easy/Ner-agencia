# 09 — Plano Priorizado de Correção (Roadmap de Remediação) — NER AGENCY OS

> **Nota:** Conforme determinação expressa desta etapa de auditoria, **nenhuma correção foi executada no código**. Este plano documenta as ações recomendadas em ordem de prioridade para a etapa seguinte de remediação.

---

## Fase P0 — Bloqueios Críticos de Segurança, Dados e Contrato (Correção Imediata)

1. **Corrigir Vazamento de Verba de Mídia no Perfil `Cliente` (`SEC-01`)**
   - Em `server/app.ts` (`GET /api/finance/summary`), filtrar `adAccounts` por `a.clientId === req.auth.user.clientId` quando `req.auth.user.role === 'Cliente'` (ou restringir `/api/finance/summary` a perfis internos).
   - Adicionar teste de regressão em `tests/ner-os.test.ts` garantindo que `cli-1` nunca veja gastos de `cli-2`.

2. **Remover Acesso do Perfil `Cliente` à Assinatura SaaS da Agência (`SEC-02`)**
   - Remover `billing.read` de `ROLE_PERMISSIONS.Cliente` em `server/types.ts` (mantendo apenas `finance.read` client-scoped para suas próprias faturas em `/api/finance/receivables`) ou bloquear explicitamente `role === 'Cliente'` em `/api/billing/subscription`.

3. **Corrigir Bug de Status `Backlog` em Tarefas (`BUG-01`)**
   - Alinhar `src/components/OperationsViews.tsx:236` e `VALID_TASK_STATUS` em `server/app.ts:52` (incluindo `'Backlog'` no conjunto válido ou removendo a opção inválida do `<select>`).

4. **Impor Entitlements SaaS no Backend (`BILL-01`)**
   - Validar `getOrganizationEntitlements(store, orgId)` em `POST /api/users` (limite `users`) e `POST /api/web/pages` (limites `landingPages` / `sites`), retornando `HTTP 402` ou `HTTP 403` quando o plano estiver inativo ou excedido.

---

## Fase P1 — Persistência de Produção, Cobrança Real e Fluxos Essenciais

5. **Migração Real de `PersistentStore` (JSON) para PostgreSQL + Prisma**
   - Completar `database/schema/schema.prisma` com as **15 entidades faltantes** (`Receivable`, `Payable`, `Commission`, `Briefing`, `TimeEntry`, `CreativeAsset`, `AdAccount`, `TrackingEvent`, `Workflow`, `WebPage`, `Ticket`, `Incident`, `AiKnowledgeDoc`, `AiMemory`, `AiGlobalCostPolicy`).
   - Instalar `prisma` / `@prisma/client`, gerar migrations versionadas e substituir o armazenamento JSON por repositório transacional PostgreSQL com constraints reais (`UNIQUE`, `FK`, `ON DELETE`).

6. **Implementar Checkout Live Real da Stripe (`BILL-02`)**
   - Atualizar `server/services/billing-stripe.ts` para chamar `https://api.stripe.com/v1/checkout/sessions` com `STRIPE_SECRET_KEY` quando em modo live, retornar `checkoutUrl` real, implementar portal de gestão de assinatura (`billing_portal/sessions`) e cancelamento.

7. **Criar Telas e Controles para Endpoints Já Existentes no Backend**
   - Criar tela dedicada **Gestão de Clientes** (`GET/POST/PATCH /api/clients`) em `CoreViews.tsx` + item na sidebar.
   - Adicionar formulários em `ProjectsView` para `POST /api/projects`, `POST /api/deliverables` e `POST /api/approvals`.
   - Adicionar seletor de status de chamados (`PATCH /api/tickets/:id`) para equipe interna.
   - Renderizar e permitir CRUD de `incidents` em `OperationsBillingView`.
   - Adicionar seletor de `planCode` em `ProposalsView` e editor de seções/SEO/WhatsApp em `WebView`.

8. **Implementar Recuperação de Senha Real (`STUB-01`)**
   - Criar tabela/entidade de tokens de reset com hash + expiração + uso único, rota `POST /api/auth/reset-password` e disparo via provedor SMTP/transacional (Resend/SendGrid/SES).

---

## Fase P2 — Integrações Externas, CRUD Completo e Qualidade

9. **Provisionar Credenciais de IA e Chave Mestra**
   - Configurar `NER_AI_ENCRYPTION_KEY` (32+ bytes aleatórios) e ao menos 1–2 provedores reais (ex.: `GEMINI_API_KEY`, `OPENAI_API_KEY`) para validar smoke tests ao vivo no `NER AI Gateway`.

10. **Implementar Integrações Reais de Mídia, Tracking, Storage e Automação**
    - **Storage (S3/MinIO):** Endpoint `multipart/form-data` para uploads em `NER Creative`, `NER Projects` (entregáveis) e `NER Web`.
    - **Tracking Outbound:** Despacho server-side real para Meta CAPI e GA4 Measurement Protocol com fila e retry.
    - **Ads (Meta/Google/TikTok):** Fluxo OAuth real + job agendado de sincronização de métricas em `adAccounts` (eliminando dados demo).
    - **Automação (Redis/BullMQ + n8n):** Motor real de execução de regras internas e CRUD de workflows.
    - **Mensageria / Atendimento:** Integrar WhatsApp Cloud API / Chatwoot caso façam parte do escopo comercial imediato.

11. **Completar CRUD, Busca, Filtros e Persistência de Estratégia**
    - Adicionar busca, filtros por status/data/cliente e exclusão segura (soft-delete/arquivamento com auditoria e RBAC) em CRM, Pipeline, Propostas, Contratos, Financeiro, Projetos, Criativos e Web.
    - Criar persistência de documentos estratégicos/OKRs vinculados a Clientes/Projetos em `NER Strategy`.
    - Implementar rota pública de renderização de páginas (`/:slug`) em `NER Web`.

---

## Fase P3 — Áreas 14, 15, 16, Testes E2E de Browser e Performance

12. **Definir e Implementar (se aplicável ao produto) os Módulos de QA, Prontidão e Entrega Final**
    - **NER Integration & QA:** Painel de saúde/testes de integrações e gestão de bugs/checklists de entrega.
    - **NER Production Readiness & Launch:** Checklist interativo de go-live (SSL, DNS, Pixel, Migrations, Backup, Billing).
    - **NER Final Validation & Delivery:** Termo formal de aceite e handoff de projeto com assinatura/log no Portal do Cliente.

13. **Testes E2E em Navegador + Code-Splitting**
    - Adicionar suíte Playwright cobrindo login, troca de tenant, criação/edição de tarefas, Portal do Cliente e responsividade mobile/desktop.
    - Aplicar `React.lazy` / `manualChunks` no Vite para reduzir o bundle inicial abaixo de `500 kB`.
