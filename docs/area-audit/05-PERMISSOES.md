# 05 — Auditoria de Permissões, RBAC e Isolamento Multi-Tenant — NER AGENCY OS

---

## 1. Perfis de Acesso Existentes (`server/types.ts`)

A plataforma define **7 perfis RBAC** em `ROLE_PERMISSIONS`:
1. `Super Admin` (acesso irrestrito + troca de organização ativa)
2. `Administrador` (gestão integral restrita à própria organização)
3. `Gestor de Tráfego` (performance, tracking, intelligence, projetos, criativos, web)
4. `Comercial` (CRM, pipeline, propostas, planos, contratos, projetos leitura)
5. `Criativo` (criativos, projetos, web)
6. `Financeiro` (financeiro, billing, auditoria, clientes leitura)
7. `Cliente` (portal do cliente, projetos/criativos/performance/aprovações/recebíveis/chamados restritos ao seu `clientId`)

---

## 2. Matriz Real de Testes HTTP por Perfil (Sonda Executada ao Vivo em Store Isolado)

Todos os 7 perfis foram autenticados via `POST /api/auth/login` e testados contra 19 endpoints reais (incluindo `Administrador` da `org-1` e `Administrador` da `org-2`):

| Endpoint | Super Admin | Admin (org-1) | Admin (org-2) | Gestor de Tráfego | Comercial | Criativo | Financeiro | Cliente (`cli-1`) |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| `GET /api/organizations` | 200 | 200 | 200 | 200 | 200 | 200 | 200 | 200 *(só org-1)* |
| `GET /api/users` | 200 | 200 | 200 | 403 | 403 | 403 | 403 | 403 |
| `GET /api/clients` | 200 | 200 | 200 | 200 | 200 | 200 | 200 | 403 |
| `GET /api/leads` | 200 | 200 | 200 | 403 | 200 | 403 | 403 | 403 |
| `GET /api/finance/summary` | 200 | 200 | 200 | 403 | 403 | 403 | 200 | **200 (FALHA)** |
| `GET /api/projects` | 200 | 200 | 200 | 200 | 200 | 200 | 403 | 200 *(só cli-1)* |
| `GET /api/creatives` | 200 | 200 | 200 | 200 | 403 | 200 | 403 | 200 *(só cli-1)* |
| `GET /api/performance` | 200 | 200 | 200 | 200 | 403 | 403 | 403 | 200 *(só cli-1)* |
| `GET /api/web/pages` | 200 | 200 | 200 | 200 | 403 | 200 | 403 | 403 |
| `GET /api/workflows` | 200 | 200 | 200 | 403 | 403 | 403 | 403 | 403 |
| `GET /api/tracking/events` | 200 | 200 | 200 | 200 | 403 | 403 | 403 | 403 |
| `GET /api/intelligence/summary` | 200 | 200 | 200 | 200 | 403 | 403 | 403 | 403 |
| `GET /api/tickets` | 200 | 200 | 200 | 200 | 200 | 200 | 200 | 200 *(só cli-1)* |
| `GET /api/operations/overview` | 200 | 200 | 200 | 403 | 403 | 403 | 403 | 403 |
| `GET /api/billing/subscription` | 200 | 200 | 200 | 403 | 403 | 403 | 200 | **200 (FALHA)** |
| `GET /api/audit-logs` | 200 | 200 | 200 | 403 | 403 | 403 | 200 | 403 |
| `GET /api/ai/dashboard` | 200 | 200 | 200 | 403 | 403 | 403 | 403 | 403 |
| `GET /api/ai/providers` | 200 | 200 | 200 | 403 | 403 | 403 | 403 | 403 |
| `GET /api/ai/cost-policy` | 200 | 200 | 200 | 403 | 403 | 403 | 403 | 403 |

---

## 3. Testes de Isolamento Multi-Tenant e Escalonamento de Privilégio

| Cenário Testado | Resultado Real | Status |
|---|---|---|
| Requisições sem token/cookie | HTTP `401` (`Autenticação obrigatória.`) | **APROVADO** |
| `Administrador (org-1)` tentando ler `/api/clients?organizationId=org-2` | HTTP `403` (`Acesso negado a clientes de outra organização.`) | **APROVADO** |
| `Criativo` tentando criar usuário `Administrador` via `POST /api/users` | HTTP `403` | **APROVADO** |
| `Cliente (cli-1)` lendo `GET /api/projects` | HTTP `200`, retornou apenas 1 projeto (`clientIds: ["cli-1"]`) | **APROVADO** |
| `Cliente (cli-1)` lendo `GET /api/finance/receivables` | HTTP `200`, retornou apenas 1 recebível (`clientIds: ["cli-1"]`) | **APROVADO** |
| `Cliente (cli-1)` lendo `GET /api/creatives` e `GET /api/tickets` | HTTP `200`, retornou exclusivamente registros de `cli-1` | **APROVADO** |
| `Cliente (cli-1)` executando `/api/ai/department/execute` em `NER Strategy` | HTTP `400` (bloqueado; cliente restrito a `NER Client Experience`) | **APROVADO** |
| Isolamento de logs/knowledge/exceções IA entre `org-1` e `org-2` | Validado em `ner-ai-gateway.test.ts` e `ner-ai-cost-intelligence.test.ts` | **APROVADO** |
| **VAZAMENTO #1:** `Cliente (cli-1)` chamando `GET /api/finance/summary` | HTTP `200` com `mediaBudgetSeparated: 45200` (soma de `cli-1` `28400` + `cli-2` `16800`!) | **REPROVADO (FALHA DE ISOLAMENTO)** |
| **VAZAMENTO #2:** `Cliente (cli-1)` chamando `GET /api/billing/subscription` | HTTP `200` expondo plano SaaS interno da agência (`NER_ENTERPRISE`, status `trialing`, `users: 4`) | **REPROVADO (EXCESSO DE PERMISSÃO)** |

---

## 4. Detalhamento das Falhas de Permissão Encontradas

### Falha P1-SEC-01: Vazamento de Verba de Mídia de Outros Clientes em `GET /api/finance/summary`
- **Causa Raiz:** Em `server/app.ts` (handler `/api/finance/summary`), `receivables` é filtrado por `user.clientId` quando `user.role === 'Cliente'`, porém o cálculo de `mediaBudgetSeparated` soma `state.adAccounts` de toda a `organizationId` sem aplicar o filtro `a.clientId === user.clientId`.
- **Impacto:** O cliente `cli-1` (`lucas@techflow.io`) descobre o gasto de mídia de outro cliente (`cli-2`, `R$ 16.800`) somado ao seu (`R$ 28.400`), totalizando `R$ 45.200`.

### Falha P1-SEC-02: Exposição da Assinatura SaaS da Agência ao Perfil `Cliente`
- **Causa Raiz:** Em `server/types.ts`, `ROLE_PERMISSIONS.Cliente` inclui a permissão `billing.read`. O endpoint `GET /api/billing/subscription` protege acesso apenas com `requirePermission('billing.read')`, sem verificar se o usuário é interno da agência.
- **Impacto:** Embora a aba `NER Operations & Billing` fique oculta para `Cliente` na UI (`App.tsx`), qualquer chamada direta à API com o token do `Cliente` expõe o plano SaaS contratado pela agência, status Stripe, entitlements e contagem interna de usuários.

### Observação de Governança: Matriz RBAC Somente Leitura
- A tela `RbacView` (`src/components/CoreViews.tsx`) exibe corretamente papéis e permissões, porém não permite criar papéis customizados ou editar permissões (RBAC é estático em código em `server/types.ts`).
