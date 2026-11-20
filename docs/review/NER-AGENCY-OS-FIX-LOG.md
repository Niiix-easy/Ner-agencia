# NER AGENCY OS — Registro de Correções Executadas (Fix Log)

Este documento registra exclusivamente correções aplicadas e verificadas no código-fonte.

---

## Correções P0 — Segurança, Autenticação, Multi-Tenant e Persistência

1. **Autenticação Real e Sessões Seguras (`server/middleware/auth.ts`, `server/store.ts`)**
   - Implementado hashing de senhas com `crypto.scryptSync` + salt aleatório de 16 bytes e comparação `crypto.timingSafeEqual`.
   - `POST /api/auth/login` valida credenciais, verifica status ativo do usuário e organização, aplica rate limit contra força bruta (`429` após tentativas falhas), registra auditoria e emite token com hash SHA-256 salvo em sessão + cookie `HttpOnly; SameSite=Lax`.
   - Erros de credencial retornam sempre `401 Credenciais inválidas.` (sem enumeração de usuários).
   - `POST /api/auth/logout` revoga a sessão no servidor e limpa o cookie.
   - `POST /api/auth/forgot-password` responde de forma genérica sem vazar existência do e-mail.

2. **RBAC Granular e Isolamento Multi-Tenant Estrito (`server/types.ts`, `server/middleware/auth.ts`, `server/app.ts`)**
   - Matriz `ROLE_PERMISSIONS` aplicada via `requireAuth` e `requirePermission(...)` em todas as rotas de negócio.
   - `resolveScopedOrg(req)` impede usuários não-`Super Admin` de consultarem ou gravarem dados em outra `organizationId` (retorna `403`).
   - Usuários com perfil `Cliente` têm acesso bloqueado a recursos internos da agência (ex.: `/api/finance/payables`, `/api/plans` mutação) e têm leituras e aprovações restritas ao seu `clientId`.

3. **Persistência Atômica e Schema Prisma (`server/store.ts`, `database/schema/schema.prisma`)**
   - `PersistentStore` grava e recarrega o estado completo em `database/data/ner-db.json` usando escrita temporária + `fs.renameSync` (evita corrupção).
   - Schema Prisma consolidado em `database/schema/schema.prisma` cobrindo Core, Business, Digital Studio, Projects e Billing.

4. **Tela de Login Real e Hidratação de Sessão (`src/components/LoginScreen.tsx`, `src/App.tsx`)**
   - Sessão verificada via `GET /api/auth/me` ao iniciar; logout retorna imediatamente à tela de login.
   - Perfis de teste rotulados explicitamente como "Ambiente Dev / Demo".

---

## Correções P1 — Módulos Funcionais, NER Digital Studio e Stripe Billing

5. **NER Digital Studio (`server/services/digital-studio.ts`, `src/components/BusinessViews.tsx`)**
   - Catálogo com os 7 planos comerciais (`NER Product Start`, `NER Micro`, `NER Business Growth`, `NER Performance Web`, `NER Business Pro`, `NER Enterprise`, `NER Software Factory`).
   - Endpoints `GET /api/plans`, `POST /api/plans` e `PATCH /api/plans/:id` permitem ao Administrador cadastrar e editar preços de **Implantação (`setupPrice`)** e **Recorrência (`recurringPrice`)** separadamente.
   - Endpoint `POST /api/digital-studio/contract` vincula a contratação de um plano à criação automática de: **Contrato + Título a Receber (sem verba de mídia) + Projeto em NER Projects + Entregáveis e Tarefas específicas** para `Landing Page`, `Site`, `E-commerce` ou `Software`.

6. **NER Projects & Aprovações Versionadas (`server/app.ts`, `src/components/OperationsViews.tsx`)**
   - Criadas rotas completas para projetos, briefings, tarefas, entregáveis, aprovações e time tracking.
   - Alterar status de tarefa via `PATCH /api/tasks/:id` recalcula automaticamente `project.progress` (e altera status para `Concluído` ao atingir 100%).
   - `PATCH /api/approvals/:id` valida `expectedVersion` (retornando `409` em conflito) e atualiza o entregável vinculado.

7. **Serviço Desacoplado de Billing Stripe & Webhooks (`server/services/billing-stripe.ts`)**
   - `StripePaymentAdapter` valida assinatura `stripe-signature` (`t=...,v1=...`) usando HMAC-SHA256 com tolerância de timestamp (300s) sobre o `rawBody` capturado no Express.
   - Iniciar checkout (`POST /api/billing/checkout`) cria/atualiza a assinatura como `incomplete` (nunca `active`).
   - `POST /api/webhooks/stripe` verifica assinatura e processa eventos de forma **idempotente** por `eventId` em `billingWebhookEvents`, ativando a assinatura apenas após `invoice.payment_succeeded` ou `checkout.session.completed` confirmado.

8. **Substituição de todas as Views Stubadas no Frontend (`src/components/*`)**
   - Todas as 11 telas anteriormente reduzidas a uma linha foram implementadas com estado real conectado ao backend.

---

## Correções P2 — Consistência Financeira, Performance, Tracking e Web

9. **Financeiro Dinâmico (`server/app.ts`)**
   - `GET /api/finance/summary` calcula dinamicamente `agencyRevenue`, `receivedRevenue`, `pendingReceivables`, `mediaBudgetSeparated`, `totalPayable` e `netOperatingResult`, garantindo que `mediaBudget` nunca componha a receita da agência.
   - `POST /api/finance/receivables/:id/payments` valida valor positivo e método antes de dar baixa parcial/total e liberar comissões vinculadas.

10. **Web Capture, Tracking Deduplication e Guardrails de Performance**
    - `POST /api/web/pages/:id/submit-lead` cria Lead real no CRM e evento no NER Tracking.
    - `POST /api/tracking/events` deduplica por `(organizationId, eventId)` e não marca `Purchase` como confirmado sem sinalização explícita de pagamento.
    - `GET /api/performance` aplica trava estatística (`DADOS INSUFICIENTES PARA RECOMENDAÇÃO` abaixo de 30 conversões ou 500 cliques) e sinaliza contas como `Conectado (Demo)` ou `Pendente de Credenciais`.
