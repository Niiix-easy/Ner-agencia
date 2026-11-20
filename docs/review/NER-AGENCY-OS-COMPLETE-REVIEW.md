# NER AGENCY OS — Relatório de Revisão Técnica, Funcional, Arquitetural e de Segurança

## 1. Resumo Executivo

A revisão técnica completa do repositório **NER AGENCY OS** constatou que, apesar da presença de arquivos estruturais de monorepo na raiz (`docker-compose.yml`, `pnpm-workspace.yaml`, `turbo.json`), a aplicação executável encontrava-se consolidada em um único servidor Express + Vite + React SPA (`server.ts` e `src/App.tsx`).

Durante a auditoria do código-fonte original, foram identificadas **falhas críticas (`P0`)** de autenticação, autorização (RBAC), isolamento multi-tenant, IDOR e ausência de persistência real, além de **falhas altas (`P1`)** envolvendo 11 telas reduzidas a stubs no frontend e rotas chamadas pela interface que retornavam `404`.

Todas as falhas críticas e altas dentro do escopo executável da aplicação foram corrigidas de forma incremental sobre a arquitetura existente, preservando o tema visual, as rotas principais e consolidando os módulos:
- **NER Core** (Auth, Sessões HttpOnly, RBAC, Multi-Tenant, Usuários, Organizações, Audit Logs)
- **NER Business** (CRM/Leads, Pipeline Kanban, Propostas, Contratos, Financeiro P&L com separação estrita de Verba de Mídia)
- **NER Digital Studio** (7 planos comerciais com setup e recorrência separados + automação de contratação → criação automática de Projeto, Entregáveis e Tarefas)
- **NER Projects** (Projetos, Briefings, Tarefas com recálculo automático de progresso, Entregáveis, Aprovações versionadas e Time Tracking)
- **NER Creative, Performance, Tracking (CAPI/Deduplicação), Automation, Intelligence, Web (Builder + Captura de Lead), Portal do Cliente e Operations & SaaS Billing (Stripe Webhooks)**.

---

## 2. Diagnóstico Arquitetural Real vs. Documentação Histórica

| Camada | Estado Antes da Revisão | Estado Após Correção |
| :--- | :--- | :--- |
| **Backend / API** | Arquivo único `server.ts` (241 linhas) sem middlewares de auth ou RBAC. | Modularizado em `server/types.ts`, `server/store.ts`, `server/middleware/auth.ts`, `server/services/digital-studio.ts`, `server/services/billing-stripe.ts`, `server/app.ts` e `server.ts`. |
| **Persistência** | Arrays voláteis em memória RAM; perda total de dados ao reiniciar. | `PersistentStore` com escrita atômica em disco (`database/data/ner-db.json`) e schema Prisma consolidado em `database/schema/schema.prisma`. |
| **Frontend** | `src/App.tsx` (708 linhas) com 11 views stubadas e sem tela de login ao deslogar. | Modularizado em `src/lib/api.ts`, `src/components/LoginScreen.tsx`, `CoreViews.tsx`, `BusinessViews.tsx`, `OperationsViews.tsx` e `App.tsx`. |
| **Testes Automatizados** | Nenhum arquivo ou script de teste existente. | Suíte real de integração HTTP em `tests/ner-os.test.ts` executada via `npm test` (`tsx --test`). |

---

## 3. Problemas Identificados na Auditoria Inicial

### Severidade P0 (Críticos)
1. **Bypass total de autenticação (`server.ts:113`)**: `POST /api/auth/login` ignorava e-mail/senha e retornava sempre o usuário `Super Admin` (`users[0]`).
2. **Ausência de sessões e RBAC no backend**: Rotas `/api/*` não exigiam cookie/token nem validavam permissões por perfil.
3. **Vazamento Multi-Tenant e IDOR**: Endpoints como `/api/clients`, `/api/leads`, `/api/users`, `/api/tasks/:id` e `/api/approvals/:id` não filtravam nem validavam `organizationId` nem `clientId`.
4. **Lockout no Logout (`src/App.tsx:208`)**: Ao clicar em sair, `isAuthenticated` virava `false`, mas não havia componente de login renderizado.
5. **Estado volátil em memória**: Todos os registros criados eram perdidos ao reiniciar o servidor.

### Severidade P1 (Altos)
6. **Endpoints 404 chamados pelo frontend**: `POST /api/leads`, `POST /api/proposals`, `GET /api/roles` e `GET /api/permissions` não existiam no backend.
7. **11 Views stubadas no `App.tsx`**: `DashboardView`, `StrategyView`, `CreativeView`, `PerformanceView`, `WebView`, `AutomationView`, `ClientPortalView`, `UsersManagementView`, `OrganizationsView`, `RbacView`, `AuditLogsView`, `InfraView`.
8. **Ausência de fluxo completo NER Digital Studio + Stripe Webhooks**: Faltava gestão editável dos 7 planos com setup/recorrência separados, criação automática de projeto/entregáveis por tipo de serviço, e receptor de webhook Stripe com verificação HMAC-SHA256 e idempotência.

### Severidade P2 (Médios)
9. **Resumo financeiro hardcoded (`server.ts:51`)**: `financeSummary` era estático em vez de calculado a partir de `receivables` e `payables` com exclusão rigorosa de `mediaBudget`.
10. **Falta de guardrails estatísticos em Performance e deduplicação em Tracking**.

---

## 4. Classificação Honesta de Prontidão

- **Núcleo da Aplicação Web (Auth, RBAC, Multi-Tenant, NER Business, Digital Studio, Projects, Web, Portal, Billing Webhooks)**: **Funcional e validado por testes automatizados** com persistência atômica local.
- **Integrações Externas e Infraestrutura Cloud (PostgreSQL ativo, Redis/BullMQ, Stripe Live Keys, Meta/Google Ads OAuth, n8n externo, Gemini Key em produção)**: **Pendentes de credenciais e provisionamento de containers externos**, devidamente sinalizadas na UI e em `NER-AGENCY-OS-OPEN-ISSUES.md` (nenhuma simulação oculta disfarçada de conexão real).
