# 08 — Relatório de Áreas Ausentes, Incompletas e Quebradas — NER AGENCY OS

Inventário consolidado de todas as ausências, pendências, defeitos funcionais, falhas de segurança e desalinhamentos arquiteturais encontrados na auditoria.

---

## 1. Áreas Planejadas NÃO CRIADAS (3 de 19)
1. **NER Integration & Quality Assurance** — Inexistente como módulo na aplicação (sem interface, rotas, entidades ou painel QA; existem apenas 4 arquivos de teste CLI em `tests/` e docs estáticos em `docs/review/`).
2. **NER Production Readiness & Launch** — Inexistente como módulo dedicado (existe apenas `/api/health` e um card simples de presença de variáveis de ambiente dentro de `OperationsBillingView`).
3. **NER Final Validation & Delivery** — Inexistente na aplicação (existem apenas relatórios estáticos em `docs/audit-final/` e `docs/review/`).

---

## 2. Áreas Criadas Mas com Pendências Estruturais (14 de 19)
- **NER Core:** Sem tela de Clientes, reset de senha é stub/no-op, sem edição/exclusão de usuários, sem Postgres.
- **NER Strategy:** Sem persistência de planos/OKRs/estratégias; apenas prompt volátil no AI Gateway.
- **NER Creative:** Sem upload/armazenamento de arquivos (mídia), sem edição completa, sem exclusão e sem filtros.
- **NER Performance:** Dados de mídia 100% seed/demo; zero integração real com Meta/Google/TikTok Ads.
- **NER Web:** Sem renderização pública de páginas (`/:slug`), sem editor visual/SEO na UI, sem DNS/SSL e sem enforcement de limites de plano.
- **NER Automation:** Fluxos internos apenas incrementam contador (`wf.executions += 1`); sem engine/Redis/BullMQ; sem CRUD de workflows; n8n sem credenciais.
- **NER Intelligence:** Depende de dados Ads seed; sem filtros de período, gráficos temporais ou exportação de relatórios.
- **NER Business:** Vazamento de `mediaBudgetSeparated` ao `Cliente`; sem edição/exclusão na maioria das entidades; `ContractsView` somente leitura; `FinanceView` sem criação manual de títulos; `ProposalsView` sem seletor de `planCode`.
- **NER Projects:** **Bug ativo `Backlog` -> HTTP 400**; endpoints `POST /api/projects`, `POST /api/deliverables` e `POST /api/approvals` sem UI; sem edição/exclusão e sem filtros.
- **NER Tracking:** Sem aba própria; não envia eventos reais para Meta CAPI ou GA4 Measurement Protocol.
- **NER Client Experience:** `PATCH /api/tickets/:id` sem UI para a equipe responder/fechar chamados; perfil `Cliente` tem acesso indevido a `/api/billing/subscription`.
- **NER Operations & Governance:** `operations.incidents` não é exibido na UI nem possui CRUD; Postgres/Redis inativos.
- **NER Billing & Subscription Management:** Checkout Stripe não chama API HTTP real da Stripe; entitlements não bloqueiam criação de recursos; sem credenciais Stripe.
- **NER AI Gateway:** Arquitetura e UI maduras, porém 0/8 provedores com credenciais configuradas e sem `NER_AI_ENCRYPTION_KEY`; `/api/ai/embeddings` e `DELETE /api/ai/memory/:conversationId` sem UI.

---

## 3. Funcionalidades Quebradas ou Enganosas Confirmadas por Evidência

| ID | Severidade | Local | Descrição Comprovada |
|---|---|---|---|
| **BUG-01** | **P0/P1** | `src/components/OperationsViews.tsx:236` vs `server/app.ts:52` | Dropdown de tarefa envia status `Backlog`, rejeitado pelo backend com **HTTP 400** (`Status de tarefa inválido.`). |
| **SEC-01** | **P1 (Segurança)** | `server/app.ts` (`GET /api/finance/summary`) | Para o perfil `Cliente`, soma `adAccounts` de toda a organização (`R$ 45.200`), vazando gasto de mídia de outro cliente (`cli-2`). |
| **SEC-02** | **P1 (Segurança)** | `server/types.ts` + `server/app.ts` (`GET /api/billing/subscription`) | Perfil `Cliente` possui `billing.read` e lê a assinatura SaaS interna, plano e contagem de usuários da agência (`HTTP 200`). |
| **BILL-01** | **P1** | `server/app.ts` (`POST /api/web/pages`, `POST /api/users`) | Entitlements calculados em `NER Billing` (`isEntitled: false`, `landingPages: 0`) **não são aplicados**; `org-2` criou página com `HTTP 201`. |
| **STUB-01** | **P2** | `server/app.ts:135-146` (`POST /api/auth/forgot-password`) | Retorna `200 OK` de sucesso sem criar token, persistir estado nem disparar e-mail. |
| **BILL-02** | **P1** | `server/services/billing-stripe.ts:107-152` | `createSaaSCheckoutSession` gera ID local `cs_sandbox_*`/`cs_live_*` sem invocar a Stripe Live Checkout API. |

---

## 4. Áreas/Funcionalidades Presentes no Backend Mas Inacessíveis na Interface
1. `GET/POST/PATCH /api/clients` (Gestão direta de Clientes)
2. `POST /api/projects` (Criação manual de Projeto)
3. `POST /api/deliverables` (Criação manual de Entregável)
4. `POST /api/approvals` (Criação/solicitação de Aprovação)
5. `PATCH /api/web/pages/:id` campos `sections`, `seoTitle`, `seoDescription`, `whatsappNumber`, `checkoutUrl`, `domain`
6. `PATCH /api/tickets/:id` (Gestão/fechamento de chamados pela equipe)
7. `operations.incidents` de `GET /api/operations/overview`
8. `planCode` em `POST /api/proposals`
9. `POST /api/ai/embeddings` e `DELETE /api/ai/memory/:conversationId`

---

## 5. Integrações Ausentes (8 Não Implementadas + 10 Sem Credenciais / Parciais)
- **Não implementadas (8):** Meta Ads, Google Ads, TikTok Ads, WhatsApp, CRM Externo, Chatwoot, Armazenamento/Uploads (S3/MinIO), Analytics Externo (GA4 / Meta CAPI).
- **Parcialmente implementada (1):** Stripe (webhook real, checkout sem HTTP API, sem credenciais).
- **Implementadas mas sem credenciais no ambiente (9):** OpenAI, Anthropic, DeepSeek, Gemini, OpenRouter, Ollama, vLLM, Hugging Face, n8n (mais `NER_AI_ENCRYPTION_KEY`).
- **Infraestrutura ausente no runtime:** PostgreSQL/Prisma, Redis/BullMQ e serviço SMTP.

---

## 6. Funcionalidades Duplicadas ou Sobreposições
- **Duplicação de Modelo de Persistência:** Existem definições paralelas e divergentes entre `server/types.ts` (usado pelo `PersistentStore` JSON) e `database/schema/schema.prisma` (referência PostgreSQL inativa e incompleta para 15 entidades).
- **Sobreposição de Menus Agrupados:** `NER Tracking` está mesclado em `NER Intelligence & Tracking` e `NER Billing` está mesclado em `NER Operations & Billing`, sem prejuízo funcional grave, mas reduzindo clareza departamental.
