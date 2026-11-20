# 02 — Status dos Departamentos e Relatório Individual — NER AGENCY OS

**Classificações Oficiais Aplicadas:**
- **CRIADA E FUNCIONANDO:** interface, lógica, persistência e operações reais validadas.
- **CRIADA E PARCIALMENTE FUNCIONAL:** existe e funciona parcialmente, mas possui pendências estruturais, de CRUD, de segurança ou de integração.
- **CRIADA, MAS NÃO FUNCIONAL:** estrutura criada sem comportamento operacional.
- **APENAS INTERFACE:** tela existente sem lógica ou persistência.
- **APENAS BACKEND:** endpoints/regras existem sem interface acessível.
- **NÃO CRIADA:** área planejada inexistente como módulo funcional da plataforma.
- **NÃO FOI POSSÍVEL VALIDAR:** impedimento técnico que inviabilizou verificação.

---

## 1. Matriz Geral da Auditoria (19 Áreas Planejadas + 3 Subáreas Adicionais)

| Área | Criada | Interface | Backend | Banco (Runtime) | Integrações | Testes | Pontuação Ponderada | Status Oficial |
|---|---|---|---|---|---|---|---:|---|
| 1. **NER Core** | Sim | Parcial (sem UI Clientes) | Sim (reset senha stub) | JSON Atômico (sem Postgres) | Nenhuma externa | Sim | 74% | **CRIADA E PARCIALMENTE FUNCIONAL** |
| 2. **NER Strategy** | Sim | Sim | Reutiliza AI Gateway | Não persiste planos | AI Gateway (sem chaves) | Parcial (AI mock) | 56% | **CRIADA E PARCIALMENTE FUNCIONAL** |
| 3. **NER Creative** | Sim | Sim | Sim (básico) | JSON (sem storage mídia) | AI Widget (sem S3) | Parcial | 65% | **CRIADA E PARCIALMENTE FUNCIONAL** |
| 4. **NER Performance** | Sim | Sim | Sim (guardrail + teto local) | JSON (dados Ads seed/demo) | Nenhuma real (Ads demo) | Parcial | 59% | **CRIADA E PARCIALMENTE FUNCIONAL** |
| 5. **NER Web** | Sim | Parcial (sem editor visual) | Sim (sem rota pública `/:slug`) | JSON Atômico | Nenhuma externa | Sim (lead capture) | 66% | **CRIADA E PARCIALMENTE FUNCIONAL** |
| 6. **NER Automation** | Sim | Sim (sem CRUD workflows) | Parcial (contador interno) | JSON Atômico | n8n HTTP real (sem env) | Sim (n8n mock) | 62% | **CRIADA E PARCIALMENTE FUNCIONAL** |
| 7. **NER Intelligence** | Sim | Compartilhada | Sim (agregação) | Lê coleções JSON | AI Widget (sem GA4) | Indireto | 65% | **CRIADA E PARCIALMENTE FUNCIONAL** |
| 8. **NER Business** | Sim | Sim (5 abas; lacunas CRUD) | Sim (fluxo comercial real) | JSON Atômico | Nenhuma externa | Sim | 75% | **CRIADA E PARCIALMENTE FUNCIONAL** |
| 9. **NER Projects** | Sim | Parcial (bug `Backlog`, falta UI POST) | Sim (completo p/ entregas) | JSON Atômico | AI Widget | Sim | 75% | **CRIADA E PARCIALMENTE FUNCIONAL** |
| 10. **NER Tracking** | Sim | Compartilhada | Sim (dedup real) | JSON Atômico | Nenhuma externa (sem CAPI/GA4) | Sim (dedup) | 63% | **CRIADA E PARCIALMENTE FUNCIONAL** |
| 11. **NER Client Experience** | Sim | Parcial (sem gestão status ticket) | Sim (client-scoped) | JSON Atômico | AI Widget isolado | Sim | 69% | **CRIADA E PARCIALMENTE FUNCIONAL** |
| 12. **NER Operations & Governance** | Sim | Parcial (sem UI incidentes) | Sim (saúde + LGPD) | JSON Atômico | Check env vars | Sim (LGPD/headers) | 66% | **CRIADA E PARCIALMENTE FUNCIONAL** |
| 13. **NER Billing & Subscription Management** | Sim | Compartilhada | Parcial (checkout local; entitlements não bloqueiam) | JSON Atômico | Stripe HMAC real / Checkout sem API live | Sim (HMAC/idemp.) | 66% | **CRIADA E PARCIALMENTE FUNCIONAL** |
| 14. **NER Integration & Quality Assurance** | **Não** | Não | Não | Não | N/A | 28 testes em `tests/` | 10% | **NÃO CRIADA** |
| 15. **NER Production Readiness & Launch** | **Não** | Não (card simples em Ops) | Não (apenas `/api/health`) | Não | N/A | Indireto | 9% | **NÃO CRIADA** |
| 16. **NER Final Validation & Delivery** | **Não** | Não | Não | Não | N/A | Não | 2% | **NÃO CRIADA** |
| 17. **NER Digital Studio** | **Sim** | Sim | Sim (4 templates reais) | JSON Atômico | Interna (Contratos/Projetos/Fin.) | Sim (2 testes E2E) | 88% | **CRIADA E FUNCIONANDO** |
| 18. **NER AI Gateway** | Sim | Sim (6 abas + widget) | Sim (8 adaptadores reais) | JSON Atômico | 8 provedores sem credenciais | Sim (7+ testes mock) | 86% | **CRIADA E PARCIALMENTE FUNCIONAL** |
| 19. **NER AI Cost Intelligence** | **Sim** | Sim (Recharts, alertas, limites, export) | Sim (motor contábil completo) | JSON Atômico | Recharts + Export nativo CSV/XLSX/PDF | Sim (10/10 testes) | 94% | **CRIADA E FUNCIONANDO** |
| *A1. NER Dashboard Executivo* | Sim | Sim | Reutiliza APIs | JSON | Nenhuma | Indireto | 70% | **CRIADA E PARCIALMENTE FUNCIONAL** |
| *A2. NER Finance (subárea Business)* | Sim | Sim (sem criar títulos) | Sim (separação receita/mídia) | JSON | Nenhuma | Sim | 74% | **CRIADA E PARCIALMENTE FUNCIONAL** |
| *A3. NER LGPD & Privacidade (subárea Core)* | Sim | Sim (em Auditoria) | Sim (export + anonimização) | JSON | Nenhuma | Sim | 90% | **CRIADA E FUNCIONANDO** |

---

## 2. Relatórios Individuais das 19 Áreas Planejadas

### 1. NER Core
- **Nome da área:** NER Core (Identidade, Organizações, Usuários, RBAC, Clientes, Auditoria)
- **Status:** `CRIADA E PARCIALMENTE FUNCIONAL`
- **O que existe:** Login com senha `scrypt` + cookie `HttpOnly` + Bearer token, revogação de sessão no logout, rate limit de login (8 tentativas/10min), telas `UsersManagementView`, `OrganizationsView`, `RbacView`, `AuditLogsView` (`src/components/CoreViews.tsx`), backend em `server/app.ts` e `server/middleware/auth.ts`, além de exportação/anonimização LGPD.
- **O que funciona:** Autenticação real, isolamento multi-tenant entre `org-1` e `org-2`, criação/alteração de status de usuários, criação de organizações (Super Admin), visualização de papéis/permissões, trilha de auditoria com redação de campos sensíveis.
- **O que não funciona / está ausente:** (1) `POST /api/auth/forgot-password` (`server/app.ts:135-146`) retorna sucesso sem gerar token nem enviar e-mail; (2) **Não existe tela dedicada de Gestão de Clientes**, apesar de existirem `GET/POST/PATCH /api/clients`; (3) Sem `DELETE` para usuários, organizações ou clientes; (4) Sem edição de perfil/papel de usuário na UI; (5) Persistência roda em JSON local e não em PostgreSQL/Prisma.
- **Interface:** `LoginScreen.tsx`, `CoreViews.tsx` (responsiva com drawer mobile no `App.tsx`).
- **Backend:** `server/app.ts:109-435`, `server/middleware/auth.ts`.
- **Banco de dados:** `database/data/ner-db.json` (`organizations`, `users`, `sessions`, `clients`, `auditLogs`). Integridade: 0 duplicados, 0 órfãos.
- **Permissões:** 7 perfis com validação real no backend e filtragem de menu no frontend.
- **Integrações:** Sem provedor SMTP/e-mail para recuperação de senha ou verificação de conta.
- **Conexão com outras áreas:** Fornece `organizationId`, `clientId`, `userId`, sessões e auditoria para todos os módulos.
- **Testes realizados:** `ner-os.test.ts` (P0 Auth, RBAC, Persistence), `ner-audit-e2e.test.ts` (LGPD, FK ownership) + sonda RBAC ao vivo nos 7 perfis.
- **Evidências:** `server/app.ts:135-146` (stub forgot-password); `src/App.tsx` (ausência de aba `clients`); sonda ao vivo confirmando `DELETE /api/users/usr-2` -> `404` e `GET /api/clients?organizationId=org-2` por Admin `org-1` -> `403`.
- **Problemas encontrados:** Falta de UI de Clientes, stub de reset de senha, ausência de deleção/edição de usuários e ausência de driver PostgreSQL em runtime.

### 2. NER Strategy
- **Nome da área:** NER Strategy
- **Status:** `CRIADA E PARCIALMENTE FUNCIONAL`
- **O que existe:** Aba `NER Strategy & IA` (`StrategyView` em `src/components/OperationsViews.tsx:1073-1191`) com execução via SSE (`/api/ai/stream`) ou síncrona (`/api/ai/generate`), seleção de prompt e visualização de metadados de latência/tokens.
- **O que funciona:** Interface de prompt e consumo de SSE/JSON do AI Gateway.
- **O que não funciona / está ausente:** (1) Não possui banco de dados nem entidades próprias (OKRs, planos estratégicos, ICP, posicionamento, histórico salvo de diagnósticos); (2) Sem credenciais de IA configuradas no ambiente, a execução retorna erro de provedor não configurado; (3) Saída gerada se perde ao trocar de aba.
- **Interface:** `StrategyView` (`OperationsViews.tsx:1073-1191`).
- **Backend:** Nenhum endpoint próprio; delega a `/api/ai/stream` e `/api/ai/generate`.
- **Banco de dados:** Nenhum.
- **Permissões:** Protegida por `ai.use` no backend; oculta para `Cliente` na sidebar.
- **Integrações:** Dependente exclusivamente do `NER AI Gateway` (sem chaves live no ambiente).
- **Conexão com outras áreas:** Apenas com `NER AI Gateway`; não vincula saídas a `Clients` ou `Projects`.
- **Testes realizados:** Coberta indiretamente em `ner-ai-gateway.test.ts` (teste de execução departamental mockada).
- **Evidências:** `OperationsViews.tsx:1073-1191` mostra apenas estado React volátil (`output`, `meta`).
- **Problemas encontrados:** Módulo resumido a um playground de IA sem persistência estratégica ou vínculo a clientes/projetos.

### 3. NER Creative
- **Nome da área:** NER Creative
- **Status:** `CRIADA E PARCIALMENTE FUNCIONAL`
- **O que existe:** `CreativeView` (`OperationsViews.tsx:332-425`), rotas `GET/POST /api/creatives` e `PATCH /api/creatives/:id` (`server/app.ts:1416-1488`), e `DepartmentAiWidget`.
- **O que funciona:** Cadastro de peças criativas vinculadas a cliente/projeto, alteração de status (`Em produção` -> `Aguardando aprovação` -> `Aprovado` -> `Reprovado`), persistência em JSON e isolamento por organização/cliente.
- **O que não funciona / está ausente:** (1) Sem upload real de arquivos/imagens/vídeos (nenhuma integração com MinIO/S3); (2) Sem edição de título/canal/formato/copy após criação; (3) Sem exclusão, versionamento ou filtros/busca.
- **Interface:** `CreativeView` (`OperationsViews.tsx:332-425`).
- **Backend:** `server/app.ts:1416-1488`.
- **Banco de dados:** Coleção `creatives` em `ner-db.json` (ausente em `schema.prisma`).
- **Permissões:** `creative.read` e `creative.manage` validados na sonda (`Criativo`: 200, `Comercial`: 403, `Cliente`: 200 filtrado para `cli-1`).
- **Integrações:** `DepartmentAiWidget` (sem chaves IA); sem storage de mídia.
- **Conexão com outras áreas:** Referencia `clientId` e `projectId` (validados quanto ao pertencimento à organização).
- **Testes realizados:** Sonda RBAC ao vivo + teste de `NER Creative` via AI Gateway (`ner-ai-gateway.test.ts`). Sem teste unitário/API dedicado às rotas `/api/creatives`.
- **Evidências:** `server/types.ts` (`CreativeAsset`) só guarda strings de metadados, sem URL de arquivo armazenado.
- **Problemas encontrados:** Ausência de storage/upload, edição, exclusão, filtros e testes dedicados.

### 4. NER Performance
- **Nome da área:** NER Performance
- **Status:** `CRIADA E PARCIALMENTE FUNCIONAL`
- **O que existe:** `PerformanceView` (`OperationsViews.tsx:427-527`), `GET /api/performance`, `PATCH /api/performance/:id/budget` (`server/app.ts:1490-1564`), regras de guardrail estatístico (ROAS só recomenda escala com gasto >= R$ 500 e >= 10 conversões) e `DepartmentAiWidget`.
- **O que funciona:** Exibição das contas cadastradas, cálculo do guardrail estatístico, incremento de teto diário (+R$ 250) persistido localmente e auditado.
- **O que não funciona / está ausente:** (1) **Dados de tráfego são estáticos/seed de demonstração** (`acc-1` com `connectionStatus: 'Conectado (Demo)'`, `acc-2` `'Pendente de Credenciais'`); (2) **Nenhuma integração real** com Meta Ads API, Google Ads API ou TikTok Ads API (nem OAuth nem sincronização); (3) Sem CRUD de contas/campanhas e sem filtros de data.
- **Interface:** `PerformanceView` (`OperationsViews.tsx:427-527`).
- **Backend:** `server/app.ts:1490-1564`.
- **Banco de dados:** `adAccounts` em `ner-db.json` (ausente em `schema.prisma`).
- **Permissões:** `performance.read` / `performance.manage` (sonda: `Gestor de Tráfego` 200, `Comercial` 403, `Criativo` 403).
- **Integrações:** Meta/Google/TikTok Ads **NÃO IMPLEMENTADAS** (apenas checagem booleana de env em `/api/health`).
- **Conexão com outras áreas:** `adAccounts.spend30d` alimenta `NER Intelligence` e `NER Business / Finance` (`mediaBudgetSeparated`).
- **Testes realizados:** Sonda RBAC ao vivo + teste AI dept (`ner-ai-gateway.test.ts`).
- **Evidências:** `server/store.ts` contém valores fixos (`spend30d: 28400`, `roas: 4.8`); grep confirmou zero chamadas HTTP para Graph API / Google Ads / TikTok.
- **Problemas encontrados:** Métricas demonstrativas sem integração real de mídia paga e sem CRUD completo.

### 5. NER Web
- **Nome da área:** NER Web
- **Status:** `CRIADA E PARCIALMENTE FUNCIONAL`
- **O que existe:** `WebView` (`OperationsViews.tsx:529-640`), `GET/POST /api/web/pages`, `PATCH /api/web/pages/:id`, e rota pública `POST /api/web/pages/:id/submit-lead` (`server/app.ts:1674-1823`).
- **O que funciona:** Criação de páginas (Landing Page, Site, E-commerce) com validação de slug único, alternância Rascunho/Publicado, e simulação/envio público de formulário de lead que grava de verdade em `Leads` e `TrackingEvents` + incrementa workflow.
- **O que não funciona / está ausente:** (1) **Não existe rota pública de renderização da página (`/:slug`)**; (2) Não há editor visual de seções/SEO/WhatsApp na UI (apesar do backend aceitar `sections`, `seoTitle`, `seoDescription`, `whatsappNumber` no `PATCH`); (3) Sem provisionamento real de domínio/DNS/SSL; (4) Sem exclusão; (5) Limites de plano SaaS (`landingPages: 0`) não bloqueiam criação (`HTTP 201` comprovado em sonda).
- **Interface:** `WebView` (`OperationsViews.tsx:529-640`).
- **Backend:** `server/app.ts:1674-1823`.
- **Banco de dados:** `webPages` em `ner-db.json` (ausente em `schema.prisma`).
- **Permissões:** `web.read`, `web.manage` (`Criativo` e `Gestor de Tráfego`: 200; `Comercial` e `Cliente`: 403).
- **Integrações:** Nenhuma externa (WhatsApp é apenas campo texto).
- **Conexão com outras áreas:** Conecta diretamente com `NER Business` (cria `Lead`), `NER Tracking` (cria `TrackingEvent`) e `NER Automation` (incrementa contador de workflow).
- **Testes realizados:** `ner-os.test.ts` (teste 27) + sonda ao vivo (`POST /api/web/pages/wp-1/submit-lead` -> `201`).
- **Evidências:** `server.ts:24-28` serve apenas o SPA `index.html`, sem renderizador de landing pages; sonda `org2CreateWebPageDespiteZeroLimit: 201`.
- **Problemas encontrados:** Falta de publicação real de páginas, ausência de editor de conteúdo/SEO na UI e ausência de enforcement de entitlements.

### 6. NER Automation
- **Nome da área:** NER Automation
- **Status:** `CRIADA E PARCIALMENTE FUNCIONAL`
- **O que existe:** `AutomationView` (`OperationsViews.tsx:642-718`), `GET /api/workflows`, `PATCH /api/workflows/:id/toggle`, `POST /api/workflows/:id/test` (`server/app.ts:1605-1672`).
- **O que funciona:** Ativar/pausar workflows seedados (`wf-1`, `wf-2`, `wf-3`), disparo HTTP `POST` real para `N8N_WEBHOOK_URL` quando configurado (com tratamento de timeout e erro 502), e contabilização de gatilhos internos.
- **O que não funciona / está ausente:** (1) Workflows internos (`wf-1`, `wf-2`) **não executam ações reais** — apenas fazem `wf.executions += 1` (`server/app.ts:471`, `server/services/digital-studio.ts:251`); (2) Sem motor de filas (Redis/BullMQ não instalados no runtime); (3) Sem CRUD para criar, editar ou excluir fluxos/regras; (4) `N8N_WEBHOOK_URL` não configurado no ambiente (retorna `400`).
- **Interface:** `AutomationView` (`OperationsViews.tsx:642-718`).
- **Backend:** `server/app.ts:1605-1672`.
- **Banco de dados:** `workflows` em `ner-db.json` (ausente em `schema.prisma`).
- **Permissões:** `automation.read` / `automation.manage` (apenas `Super Admin` e `Administrador` têm 200).
- **Integrações:** Bridge n8n implementado em HTTP real (`SEM CREDENCIAIS` no ambiente).
- **Conexão com outras áreas:** `wf-1` recebe contagem de novos leads; `wf-2` recebe contagem de contratos Digital Studio.
- **Testes realizados:** `ner-audit-e2e.test.ts` (teste 20: servidor HTTP mock validando envio real e erro 502) + sonda ao vivo (`n8nTest` -> `400`).
- **Evidências:** `server/app.ts:1643-1671`; sonda `n8nTest.json.error`.
- **Problemas encontrados:** Automação interna apenas contadora, sem engine de ações/filas e sem construtor/CRUD de workflows.

### 7. NER Intelligence
- **Nome da área:** NER Intelligence
- **Status:** `CRIADA E PARCIALMENTE FUNCIONAL`
- **O que existe:** Bloco analítico em `IntelligenceTrackingView` (`OperationsViews.tsx:720-818`), `GET /api/intelligence/summary` (`server/app.ts:1825-1865`) e `DepartmentAiWidget`.
- **O que funciona:** Agregação em tempo real sobre dados reais de Leads, Contratos, Recebíveis, Projetos, Eventos de Tracking e Contas de Anúncio da organização.
- **O que não funciona / está ausente:** (1) Métricas de mídia/ROAS derivam de `adAccounts` estáticos (seed); (2) Sem filtros por período/cliente/canal; (3) Sem gráficos temporais ou exportação de relatórios executivos (PDF/CSV); (4) Sem integração com Google Analytics 4 / Looker.
- **Interface:** Compartilhada com `NER Tracking` em `IntelligenceTrackingView`.
- **Backend:** `server/app.ts:1825-1865`.
- **Banco de dados:** Consultas sobre coleções existentes (sem views/tabelas analíticas).
- **Permissões:** `intelligence.read` (`Super Admin`, `Administrador`, `Gestor de Tráfego`: 200; demais: 403).
- **Integrações:** AI Widget (sem chaves); sem GA4.
- **Conexão com outras áreas:** Lê dados reais de `Business`, `Projects`, `Performance` e `Tracking`.
- **Testes realizados:** Sonda RBAC ao vivo; sem teste automatizado específico para `/api/intelligence/summary`.
- **Evidências:** `server/app.ts:1825-1865` não aceita query params de data ou cliente.
- **Problemas encontrados:** Falta de filtros temporais, gráficos, exportação e dependência de dados seed de performance.

### 8. NER Business
- **Nome da área:** NER Business (CRM, Pipeline, Propostas, Contratos, Financeiro)
- **Status:** `CRIADA E PARCIALMENTE FUNCIONAL`
- **O que existe:** 5 abas dedicadas (`crm`, `pipeline`, `proposals`, `contracts`, `finance`) em `src/components/BusinessViews.tsx` (977 linhas) + rotas completas em `server/app.ts:437-1102`.
- **O que funciona:** Criação de Leads, conversão de Lead em Cliente + Oportunidade, movimentação de Oportunidades no Kanban, criação e aceite de Propostas (gerando automaticamente Contrato + Projeto + Entregáveis + Tarefas + Conta a Receber), baixa parcial/total de Contas a Receber com registro de Pagamento, baixa de Contas a Pagar, visualização de Comissões e separação contábil Receita da Agência vs Verba de Mídia.
- **O que não funciona / está ausente:** (1) Sem busca/filtros em todas as 5 telas; (2) Sem edição ou exclusão de Leads, Oportunidades, Propostas e Contratos; (3) `ProposalsView` não permite selecionar `planCode` na criação (mesmo o backend suportando); (4) `ContractsView` é somente leitura (sem criação manual/edição/distrato); (5) `FinanceView` não possui formulários para criar novas contas a receber, contas a pagar ou comissões; (6) **Vazamento de dados confirmado**: `GET /api/finance/summary` retorna `mediaBudgetSeparated: 45200` (soma de todos os clientes da `org-1`) quando chamado pelo usuário `Cliente` (`cli-1`).
- **Interface:** `BusinessViews.tsx`.
- **Backend:** `server/app.ts:437-1102`.
- **Banco de dados:** `leads`, `opportunities`, `proposals`, `contracts`, `receivables`, `payables`, `commissions` em `ner-db.json` (3 coleções financeiras ausentes em `schema.prisma`).
- **Permissões:** `crm.*`, `proposals.*`, `contracts.*`, `finance.*` validados na sonda (`Comercial` bloqueado em financeiro; `Financeiro` bloqueado em leads).
- **Integrações:** Sem integração com CRM externo (HubSpot/Pipedrive/RD) nem gateway bancário/NF-e.
- **Conexão com outras áreas:** Alta integração real com `NER Core`, `NER Digital Studio`, `NER Projects`, `NER Web` e `NER Intelligence`.
- **Testes realizados:** `ner-os.test.ts` (teste 27) + `ner-audit-e2e.test.ts` (teste 18) + sonda RBAC/vazamento ao vivo.
- **Evidências:** Sonda `clientFinanceSummary.mediaBudgetSeparated === 45200` (`acc-1: 28400 + acc-2: 16800`); `BusinessViews.tsx:668-976`.
- **Problemas encontrados:** Vazamento de verba de mídia agregada ao perfil Cliente, falta de CRUD completo (edição/exclusão/lançamento manual financeiro) e ausência de busca/filtros.

### 9. NER Projects
- **Nome da área:** NER Projects
- **Status:** `CRIADA E PARCIALMENTE FUNCIONAL`
- **O que existe:** `ProjectsView` (`OperationsViews.tsx:62-330`), backend em `server/app.ts:1104-1414` (Projetos, Briefings, Tarefas, Entregáveis, Aprovações com controle otimista de versão `409`, Time Tracking) e `DepartmentAiWidget`.
- **O que funciona:** Criação de tarefas, atualização de status de tarefas com recálculo automático do `%` de progresso do projeto, criação de briefings, apontamento de horas, decisão de aprovações (Aprovado / Ajustes solicitados) com trava de conflito de versão, geração automática via Digital Studio/Propostas.
- **O que não funciona / está ausente:** (1) **BUG ATIVO UI→Backend**: o dropdown de status de tarefa (`OperationsViews.tsx:236`) contém a opção `Backlog`, mas o backend (`server/app.ts:52`) só aceita `['A fazer', 'Em andamento', 'Em revisão', 'Concluída']`, retornando **HTTP 400** (`Status de tarefa inválido.`); (2) **Endpoints sem interface**: `POST /api/projects`, `POST /api/deliverables` e `POST /api/approvals` existem no backend mas não possuem formulários na UI; (3) Sem edição/exclusão de projetos, tarefas ou entregáveis; (4) Sem filtros/pesquisa ou visão Kanban/Gantt.
- **Interface:** `ProjectsView` (`OperationsViews.tsx:62-330`).
- **Backend:** `server/app.ts:1104-1414`.
- **Banco de dados:** `projects`, `briefings`, `tasks`, `deliverables`, `approvals`, `timeTracking` (`briefings` e `timeTracking` ausentes em `schema.prisma`).
- **Permissões:** `projects.read/manage`, `approvals.read/decide` com escopo estrito por cliente para o perfil `Cliente`.
- **Integrações:** `DepartmentAiWidget`.
- **Conexão com outras áreas:** Recebe projetos do `NER Digital Studio`/`NER Business` e alimenta `NER Client Experience`, `NER Creative` e `NER Intelligence`.
- **Testes realizados:** `ner-os.test.ts` (testes 26 e 27) + sonda ao vivo confirmando `taskBacklogBug.status === 400`.
- **Evidências:** `src/components/OperationsViews.tsx:236` vs `server/app.ts:52`.
- **Problemas encontrados:** Bug `Backlog` -> 400, rotas POST sem tela, ausência de edição/exclusão e filtros.

### 10. NER Tracking
- **Nome da área:** NER Tracking
- **Status:** `CRIADA E PARCIALMENTE FUNCIONAL`
- **O que existe:** Seção em `IntelligenceTrackingView` (`OperationsViews.tsx:720-818`), rotas `GET/POST /api/tracking/events` (`server/app.ts:1566-1603`).
- **O que funciona:** Ingestão de eventos server-side com deduplicação real por `eventId` (retorna `{ deduplicated: true }` sem duplicar registro) e gravação automática de evento `Lead` quando um formulário do `NER Web` é enviado.
- **O que não funciona / está ausente:** (1) Sem página/aba independente na navegação (embutido em `NER Intelligence & Tracking`); (2) **Não envia eventos reais para Meta CAPI, Google Ads ou GA4 Measurement Protocol** (apenas armazena localmente); (3) Sem filtros por período/evento/fonte ou gerador de snippet de pixel.
- **Interface:** Seção inferior de `IntelligenceTrackingView`.
- **Backend:** `server/app.ts:1566-1603`.
- **Banco de dados:** `trackingEvents` em `ner-db.json` (ausente em `schema.prisma`).
- **Permissões:** `tracking.read`, `tracking.manage`.
- **Integrações:** Nenhuma externa implementada.
- **Conexão com outras áreas:** Recebe eventos de `NER Web` e alimenta `NER Intelligence`.
- **Testes realizados:** `ner-os.test.ts` (teste 27: deduplicação) + sonda ao vivo (`submit-lead` gerando `trackingEventId`).
- **Evidências:** `server/app.ts:1566-1603` apenas grava em `state.trackingEvents`, sem qualquer `fetch` externo.
- **Problemas encontrados:** Falta de despacho real CAPI/GA4, ausência de tela própria e de filtros.

### 11. NER Client Experience
- **Nome da área:** NER Client Experience (Portal do Cliente)
- **Status:** `CRIADA E PARCIALMENTE FUNCIONAL`
- **O que existe:** `ClientPortalView` (`OperationsViews.tsx:820-938`), rotas `/api/tickets` (`GET/POST`), `PATCH /api/tickets/:id` (`server/app.ts:1867-1940`), visualização isolada de projetos, aprovações, faturas do cliente e `DepartmentAiWidget` restrito ao cliente.
- **O que funciona:** Isolamento real por `clientId` (`cli-1` vê apenas 1 projeto, 1 recebível, 1 criativo, 1 chamado), aprovação/solicitação de ajuste direto pelo cliente com auditoria, abertura de chamados e isolamento no AI Gateway (bloqueia acesso do cliente a outros departamentos).
- **O que não funciona / está ausente:** (1) `PATCH /api/tickets/:id` (alterar status do chamado para `Em atendimento`/`Resolvido`) **não possui interface para a equipe interna**; (2) Perfil `Cliente` obtém **HTTP 200** em `GET /api/billing/subscription` (expondo dados da assinatura SaaS interna da agência) e recebe `mediaBudgetSeparated` agregado de toda a agência em `GET /api/finance/summary`; (3) Sem download/pré-visualização de entregáveis reais.
- **Interface:** `ClientPortalView` (`OperationsViews.tsx:820-938`).
- **Backend:** `server/app.ts:1867-1940` + filtros `canAccessClientResource` em rotas compartilhadas.
- **Banco de dados:** `tickets` em `ner-db.json` (ausente em `schema.prisma`).
- **Permissões:** `portal.read`, `approvals.decide`, mas com permissão excessiva `billing.read` em `ROLE_PERMISSIONS.Cliente` (`server/types.ts`).
- **Integrações:** `DepartmentAiWidget` (`NER Client Experience`, sem chaves live).
- **Conexão com outras áreas:** Integra `NER Projects`, `NER Business/Finance` e `NER AI Gateway`.
- **Testes realizados:** `ner-os.test.ts` (teste 24), `ner-audit-e2e.test.ts` (teste 21) + sondas ao vivo de escopo do `Cliente`.
- **Evidências:** Sonda confirmando `clientBillingSubHasOrgStripeInfo.planCode === 'NER_ENTERPRISE'` e `clientFinanceSummary.mediaBudgetSeparated === 45200`.
- **Problemas encontrados:** Vazamento de assinatura SaaS da agência e gasto total de mídia para o perfil `Cliente`, além da falta de UI para gestão de chamados.

### 12. NER Operations & Governance
- **Nome da área:** NER Operations & Governance
- **Status:** `CRIADA E PARCIALMENTE FUNCIONAL`
- **O que existe:** Coluna de infraestrutura em `OperationsBillingView` (`OperationsViews.tsx:990-1021`), `GET /api/operations/overview` (`server/app.ts:1942-1975`), `GET /api/health`, headers HTTP de segurança (`server/app.ts:72-80`), auditoria (`AuditLogsView`) e governança LGPD (`lgpd-export` e `lgpd-anonymize`).
- **O que funciona:** Métricas reais do processo Node (`uptimeSeconds`, `memoryRssMb`, `nodeVersion`), diagnóstico honesto de variáveis de ambiente, headers de segurança, auditoria com redação de segredos e ferramentas LGPD funcionais na UI.
- **O que não funciona / está ausente:** (1) `operations.incidents` retornado pela API **não é renderizado na interface**; (2) Não há endpoints nem UI para criar, atualizar ou resolver incidentes; (3) PostgreSQL/Prisma e Redis/BullMQ constam explicitamente como `configured: false`; (4) Sem automação de backup, métricas Prometheus ou alertas operacionais.
- **Interface:** Metade esquerda de `OperationsBillingView` + `AuditLogsView`.
- **Backend:** `server/app.ts:72-108, 390-435, 1942-1975`.
- **Banco de dados:** `incidents`, `auditLogs` em `ner-db.json` (`incidents` ausente em `schema.prisma`).
- **Permissões:** `operations.read` (apenas `Super Admin` e `Administrador`); `audit.read` (`Super Admin`, `Administrador`, `Financeiro`).
- **Integrações:** Checagem de presença de env vars de serviços externos.
- **Conexão com outras áreas:** Recebe registros `store.audit(...)` de toda a plataforma.
- **Testes realizados:** `ner-audit-e2e.test.ts` (testes 17 e 22: headers de segurança e LGPD).
- **Evidências:** `OperationsViews.tsx:1000-1021` omite `operations.incidents`.
- **Problemas encontrados:** Gestão de incidentes ausente na UI/API e infraestrutura rodando sem Postgres/Redis reais.

### 13. NER Billing & Subscription Management
- **Nome da área:** NER Billing & Subscription Management
- **Status:** `CRIADA E PARCIALMENTE FUNCIONAL`
- **O que existe:** Coluna direita de `OperationsBillingView` (`OperationsViews.tsx:1023-1068`), `server/services/billing-stripe.ts`, rotas `/api/billing/subscription`, `/api/billing/checkout`, `/api/webhooks/stripe`, `/api/billing/sandbox-webhook` (`server/app.ts:1977-2085`).
- **O que funciona:** Verificação real de assinatura `HMAC-SHA256` do Stripe com tolerância de 5 minutos (anti-replay), falha fechada em produção sem secret, processamento idempotente por `eventId`, regra transacional onde checkout mantém status `incomplete` até webhook válido, e cálculo de entitlements.
- **O que não funciona / está ausente:** (1) `createSaaSCheckoutSession` (`server/services/billing-stripe.ts:107-152`) **não realiza chamada HTTP à Stripe API** (`api.stripe.com/v1/checkout/sessions`), gerando apenas ID local (`cs_sandbox_*` / `cs_live_*`); (2) Credenciais Stripe não configuradas no ambiente; (3) **Entitlements não são aplicados no backend** (sonda comprovou `org-2` com `isEntitled: false` e `landingPages: 0` criando página com HTTP `201`); (4) Perfil `Cliente` acessa `/api/billing/subscription` com HTTP `200`; (5) Sem cancelamento/upgrade/portal do assinante Stripe.
- **Interface:** Metade direita de `OperationsBillingView`.
- **Backend:** `server/services/billing-stripe.ts` + `server/app.ts:1977-2085`.
- **Banco de dados:** `subscriptions`, `billingWebhookEvents` (presentes em `ner-db.json` e `schema.prisma`).
- **Permissões:** `billing.read`, `billing.manage` (com excesso de `billing.read` atribuído a `Cliente`).
- **Integrações:** Stripe `PARCIALMENTE IMPLEMENTADA` + `SEM CREDENCIAIS`.
- **Conexão com outras áreas:** Lê planos de `NER Digital Studio` e conta uso de `Users`/`WebPages`, sem bloquear excedentes.
- **Testes realizados:** `ner-os.test.ts` (teste 28) + `ner-audit-e2e.test.ts` (teste 17) + sonda de entitlements ao vivo.
- **Evidências:** `server/services/billing-stripe.ts:135-152`; sonda `org2CreateWebPageDespiteZeroLimit: 201`.
- **Problemas encontrados:** Checkout sem API real da Stripe, entitlements meramente informativos e acesso indevido do perfil `Cliente`.

### 14. NER Integration & Quality Assurance
- **Nome da área:** NER Integration & Quality Assurance
- **Status:** `NÃO CRIADA`
- **O que existe:** Apenas artefatos de engenharia no repositório: 4 suítes automatizadas (`tests/ner-os.test.ts`, `tests/ner-ai-gateway.test.ts`, `tests/ner-ai-cost-intelligence.test.ts`, `tests/ner-audit-e2e.test.ts` — 28/28 passando) e documentos estáticos em `docs/review/`.
- **O que funciona:** Os 28 testes automatizados em CLI (`npm test`).
- **O que não funciona / está ausente:** Não existe como área ou módulo da plataforma NER AGENCY OS — não possui página, item de menu, rotas de API, tabelas de QA/casos de teste/bugs, painel de status de integrações testáveis ou governança de qualidade na UI.
- **Interface / Backend / Banco / Permissões / Integrações / Conexão:** Inexistentes como módulo de runtime.
- **Evidências:** `src/App.tsx` (ausência total de rota/aba); `server/app.ts` (ausência de rotas `/api/qa/*`).

### 15. NER Production Readiness & Launch
- **Nome da área:** NER Production Readiness & Launch
- **Status:** `NÃO CRIADA`
- **O que existe:** Apenas endpoint `/api/health`, card simples de presença de env vars (`integrationsReadiness`) dentro de `OperationsBillingView`, `docker-compose.yml` não conectado ao runtime e relatórios estáticos em `docs/audit-final/`.
- **O que não funciona / está ausente:** Não há área/módulo de Production Readiness & Launch na plataforma (sem checklist de go-live, gates de lançamento, verificador de migrations PostgreSQL, smoke tests acionáveis ou status de publicação).
- **Evidências:** `src/App.tsx` e `server/app.ts` não possuem módulo dedicado; `/api/operations/overview` reporta `PostgreSQL / Prisma: false` e `Redis / BullMQ: false`.

### 16. NER Final Validation & Delivery
- **Nome da área:** NER Final Validation & Delivery
- **Status:** `NÃO CRIADA`
- **O que existe:** Apenas relatórios estáticos em markdown (`docs/review/NER-AGENCY-OS-FINAL-VALIDATION.md` e `docs/audit-final/13-VALIDACAO-FINAL.md`).
- **O que não funciona / está ausente:** Nenhum módulo, tela, endpoint, tabela ou fluxo de validação final, termo de aceite/handoff de projeto ou certificação de entrega existe no aplicativo.
- **Evidências:** `src/App.tsx`, `server/app.ts` e `database/schema/schema.prisma` sem qualquer entidade ou tela correspondente.

### 17. NER Digital Studio
- **Nome da área:** NER Digital Studio
- **Status:** `CRIADA E FUNCIONANDO`
- **O que existe:** Aba `NER Digital Studio` (`CommercialPlansView` em `src/components/BusinessViews.tsx:314-666`), serviço dedicado `server/services/digital-studio.ts` (304 linhas) com 4 templates completos (`Landing Page`, `Site`, `E-commerce`, `Software`), e rotas `/api/plans` + `/api/digital-studio/contract`.
- **O que funciona:** Listagem dos 7 planos comerciais, criação de novos planos, edição separada de preço de setup e recorrência, contratação atômica de plano para cliente criando simultaneamente Contrato + Conta a Receber + Projeto + Entregáveis + Tarefas + incremento de Workflow + Log de Auditoria, tudo persistido em disco e validado contra recarga do store.
- **Pendências menores (não bloqueantes):** Sem exclusão/arquivamento de planos, sem busca/filtros de planos e persistência atual em JSON local (alinhada ao runtime da plataforma).
- **Interface:** `CommercialPlansView` (`BusinessViews.tsx:314-666`).
- **Backend:** `server/services/digital-studio.ts` + `server/app.ts:696-789`.
- **Banco de dados:** `commercialPlans` (`ner-db.json` e `schema.prisma`).
- **Permissões:** `plans.read`, `plans.manage`, `contracts.manage`.
- **Integrações:** Integrada nativamente a `NER Business`, `NER Projects`, `NER Automation` e `NER Core`.
- **Testes realizados:** `ner-os.test.ts` (teste 26) e `ner-audit-e2e.test.ts` (teste 18 — unicidade de IDs em burst).
- **Evidências:** 100% dos fluxos de contratação e templates validados nos testes automatizados e em inspeção de código.

### 18. NER AI Gateway
- **Nome da área:** NER AI Gateway (NER AI Center)
- **Status:** `CRIADA E PARCIALMENTE FUNCIONAL`
- **O que existe:** Suite completa em `src/components/AiCenterViews.tsx` (4.339 linhas) + 8 arquivos em `server/ai/` (`providers.ts`, `router.ts`, `gateway.ts`, `security.ts`, `seed.ts`, `actions.ts`, `types.ts`, `cost-usage.ts`): 8 adaptadores HTTP/SDK reais, criptografia AES-256-GCM com rotação de chave, descoberta de modelos, 12 regras de roteamento com fallback seguro em custo, circuit breaker, streaming SSE, embeddings, versionamento de prompts, memória/conhecimento isolados por tenant e `DepartmentAiWidget`.
- **O que funciona:** Toda a arquitetura de roteamento, segurança, criptografia, RBAC, isolamento multi-tenant, streaming SSE, fallback e gestão de prompts/modelos foi validada em testes com mock HTTP.
- **O que não funciona / está ausente:** (1) **Nenhum dos 8 provedores possui credenciais configuradas no ambiente auditado** e `NER_AI_ENCRYPTION_KEY` não está definida (`encryptionKeyConfigured: false`), impedindo execução real de LLM sem provisionamento prévio; (2) Endpoints `/api/ai/embeddings` e `DELETE /api/ai/memory/:conversationId` existem apenas no backend (sem botão/UI).
- **Interface:** Abas `ai-dashboard`, `ai-providers`, `ai-models`, `ai-routing`, `ai-prompts`, `ai-history`, `ai-settings` + `DepartmentAiWidget`.
- **Backend:** `server/ai/router.ts` (962 linhas), `server/ai/providers.ts` (1.005 linhas), `server/ai/gateway.ts`, `server/ai/security.ts`.
- **Banco de dados:** 13 coleções em `aiGateway` (`ner-db.json`); 10 delas modeladas em `schema.prisma` (faltam `AiKnowledgeDoc`, `AiMemory`, `AiGlobalCostPolicy`).
- **Permissões:** 7 permissões granulares `ai.*` com isolamento estrito por organização e por cliente.
- **Integrações:** 8 provedores implementados em código real (`SEM CREDENCIAIS` no ambiente).
- **Conexão com outras áreas:** Consumido por `Strategy`, `Creative`, `Performance`, `Projects`, `Intelligence`, `Client Experience` e governado por `NER AI Cost Intelligence`.
- **Testes realizados:** `ner-ai-gateway.test.ts` (6/6), `ner-audit-e2e.test.ts` (teste 21), sonda `/api/ai/config/status` e `/api/ai/providers`.
- **Evidências:** Sonda ao vivo `aiConfigStatus.encryptionKeyConfigured === false` e todos os 8 `envVariablesPresent === false`.

### 19. NER AI Cost Intelligence
- **Nome da área:** NER AI Cost Intelligence (Consumo, Custos, Alertas e Limites Preventivos)
- **Status:** `CRIADA E FUNCIONANDO`
- **O que existe:** Abas `Consumo e Custos` (`ai-costs`) e `Configurações` (`ai-settings`) integrando `AiCostsChartsAndAlerts.tsx`, `AiSettingsLimitsPanel.tsx`, `AiThresholdAlertsManager.tsx`, `server/ai/cost-usage.ts` e `server/ai/cost-reports.ts`.
- **O que funciona:** Gráficos interativos Recharts (por provedor, modelo, departamento e período dinâmico), cálculo de projeção mensal (run-rate) vs teto orçamentário com barras coloridas de 50%/75%/90%/100%, gestão completa dos limiares 50/75/90/100% (canais, severidade, ação automática, mensagem customizada e simulador), limites preventivos global/organização/departamento/modelo/usuário, exceções temporárias (`AiLimitException`), detecção de anomalias, alertas contábeis, conciliação de logs, catálogo de preços e câmbio USD→BRL, e exportação real em **CSV, XLSX e PDF** segmentada por provedor, cliente e departamento.
- **Observações menores:** `usageLogs` inicia vazio (`0` registros) no seed limpo até ocorrerem execuções de IA; persistência em JSON atômico alinhada ao runtime.
- **Interface:** `AiCenterViews.tsx` (`AiCostsTab`, `AiSettingsTab`) + 3 subcomponentes dedicados.
- **Backend:** `server/ai/cost-usage.ts`, `server/ai/cost-reports.ts`, `server/ai/router.ts`.
- **Banco de dados:** `aiGateway.usageLogs`, `costPolicies`, `globalCostPolicy`, `pricingVersion`, `exchangeConfig`, `actions`, `limitExceptions`, `accountingAlerts`.
- **Permissões:** `ai.costs.read`, `ai.costs.manage`, `ai.admin` + isolamento multi-tenant.
- **Integrações:** Recharts + gerador binário nativo de CSV/XLSX/PDF.
- **Testes realizados:** `tests/ner-ai-cost-intelligence.test.ts` — **10/10 aprovados** cobrindo motor de custos, tokens indisponíveis nunca fabricados, run-rate, alertas 50/75/90/100%, limites preventivos, anomalias, idempotência e exports CSV/XLSX/PDF.
- **Evidências:** Execução real `npm test` (testes 1 a 10 passando integralmente em 1.1s).
