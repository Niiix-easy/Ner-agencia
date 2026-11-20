# 06 — Auditoria de Fluxos e Conexões Entre Áreas — NER AGENCY OS

Validação dos **6 cenários de relacionamento interdepartamental** previstos na auditoria, verificando compartilhamento real de dados, ausência de duplicação, integridade referencial e pontos de quebra.

---

## 1. Fluxo de Clientes
**Cadeia:** `NER Business → NER Core → NER Projects → NER Client Experience`

- **Status:** `PARCIALMENTE CONECTADO`
- **O que funciona com dados reais compartilhados:**
  1. `NER Business` (`POST /api/leads/:id/convert`) cria um registro real em `state.clients` (`NER Core`) e uma `Opportunity` referenciando o mesmo `clientId` (sem duplicar organização).
  2. `NER Projects` vincula projetos, entregáveis e aprovações ao mesmo `clientId` (com validação de pertencimento à organização `organizationId`).
  3. `NER Client Experience` autentica o usuário `Cliente` vinculado via `user.clientId` (`cli-1`) e exibe apenas projetos, aprovações, títulos a receber e chamados daquele cliente.
- **Pontos de quebra / lacunas:**
  - `NER Core` **não possui tela de gestão de Clientes** para editar dados cadastrais ou vincular/criar um usuário `Cliente` diretamente ao cliente recém-convertido.
  - `GET /api/finance/summary` vaza `mediaBudgetSeparated` de outros clientes da mesma organização para o perfil `Cliente`.

---

## 2. Fluxo de Projetos
**Cadeia:** `NER Business → NER Projects → NER Strategy → NER Creative → NER Performance → NER Web → NER Tracking → NER Intelligence`

- **Status:** `PARCIALMENTE CONECTADO`
- **O que funciona com dados reais compartilhados:**
  1. `NER Business` (`POST /api/proposals/:id/accept`) cria automaticamente Contrato + Conta a Receber + Projeto + Entregáveis + Tarefas em `NER Projects`.
  2. `NER Creative` vincula peças criativas a `clientId` + `projectId`.
  3. `NER Web` cria páginas vinculadas a `clientId` e, na captura pública (`POST /api/web/pages/:id/submit-lead`), grava um `Lead` em `NER Business` e um `TrackingEvent` em `NER Tracking` com deduplicação por `eventId`.
  4. `NER Intelligence` (`GET /api/intelligence/summary`) agrega dados reais de Leads, Projetos, Recebíveis, Contas Ads e Eventos de Tracking.
- **Pontos de quebra / lacunas:**
  - `NER Strategy` é um playground de IA efêmero — **não grava planos/estratégias nem se vincula a `clientId`/`projectId`** no banco.
  - `NER Performance` consome dados **seed/demo** (`acc-1`, `acc-2`), desconectados de campanhas reais de Meta/Google/TikTok Ads.
  - `NER Tracking` não encaminha eventos para Meta CAPI ou GA4.
  - `ProjectsView` falha com HTTP `400` ao selecionar status `Backlog` em tarefas.

---

## 3. Fluxo de Produção Digital
**Cadeia:** `NER Digital Studio → NER Projects → NER Web → NER Client Experience → NER Billing`

- **Status:** `CONECTADO COM RESSALVAS EM WEB E BILLING`
- **O que funciona com dados reais compartilhados:**
  1. `NER Digital Studio` (`POST /api/digital-studio/contract` via `server/services/digital-studio.ts`) executa transação em memória com persistência atômica gerando **Contrato + Conta a Receber + Projeto + Entregáveis (template do serviço) + Tarefas + incremento de Workflow + AuditLog** — validado em `ner-os.test.ts` (teste 26) e `ner-audit-e2e.test.ts` (teste 18).
  2. `NER Projects` atualiza progresso do projeto conforme tarefas são concluídas e disponibiliza aprovações.
  3. `NER Client Experience` exibe o projeto gerado, permite aprovar/solicitar ajustes e visualizar a fatura (`receivables`).
  4. `NER Billing` calcula entitlements usando o catálogo de planos de `NER Digital Studio` e a contagem real de usuários/páginas em `NER Web`.
- **Pontos de quebra / lacunas:**
  - A criação do projeto de `Landing Page`/`Site` no `NER Digital Studio` **não cria automaticamente** uma página correspondente em `NER Web` (criação em `NER Web` é manual).
  - `NER Billing` calcula limites (`landingPages`, `sites`, `users`), **mas não os impõe** ao criar recursos em `NER Web` ou `NER Core` (confirmado em sonda: `org-2` sem assinatura ativa criou página com HTTP `201`).

---

## 4. Fluxo de Automações
**Cadeia:** `NER Automation → NER Core → NER Projects → NER Business → NER Intelligence`

- **Status:** `PARCIALMENTE CONECTADO (CONTADOR INTERNO + N8N SEM CREDENCIAL)`
- **O que funciona:**
  - Criação de Lead em `NER Business` / `NER Web` incrementa `executions` do `wf-1` (`lead.created`).
  - Contratação no `NER Digital Studio` incrementa `executions` do `wf-2` (`contract.digital_studio.created`).
  - Disparo manual de teste em `wf-3` executa `fetch(N8N_WEBHOOK_URL, { method: 'POST' })` com payload estruturado da organização (validado em teste automatizado com servidor mock).
- **Pontos de quebra / lacunas:**
  - `wf-1` e `wf-2` **não executam ações reais** em `NER Projects`, `NER Core` (notificações/e-mails) ou `NER Intelligence` — são apenas contadores locais.
  - Ausência de fila assíncrona (`Redis`/`BullMQ` inativos) e ausência de `N8N_WEBHOOK_URL` configurada no ambiente.

---

## 5. Fluxo de Inteligência Artificial
**Cadeia:** `NER AI Gateway → NER AI Cost Intelligence → departamentos que utilizam IA`

- **Status:** `FORTEMENTE CONECTADO EM CÓDIGO (BLOQUEADO APENAS POR CHAVES LIVE)`
- **O que funciona com evidência em código e testes:**
  1. `DepartmentAiWidget` (`AiCenterViews.tsx:4183`) está embutido em `NER Projects`, `NER Creative`, `NER Performance`, `NER Intelligence` e `NER Client Experience`, e `StrategyView` consome `/api/ai/stream` e `/api/ai/generate`.
  2. Todas as execuções passam pelo núcleo central (`server/ai/gateway.ts`), que consulta `NER AI Cost Intelligence` **antes** da chamada (limites preventivos global/org/dept/modelo/usuário, `AiLimitException`, `block_non_essential`, `fallback_economical`) e **depois** da chamada (contabilidade de tokens sem invenção, cálculo USD/BRL, detecção de anomalias, alertas 50/75/90/100%, gravação em `aiGateway.usageLogs`).
  3. Tudo isolado por `organizationId` e `clientId` (validado em `ner-ai-gateway.test.ts`, `ner-ai-cost-intelligence.test.ts` e `ner-audit-e2e.test.ts`).
- **Ponto de bloqueio no ambiente:**
  - Sem `NER_AI_ENCRYPTION_KEY` e sem chaves de provedores (`OPENAI_API_KEY`, `GEMINI_API_KEY`, etc.), chamadas ao vivo não completam contra provedores externos.

---

## 6. Fluxo de Governança e Operação
**Cadeia:** `NER Operations & Governance → NER Core → NER Integration & Quality Assurance → NER Production Readiness & Launch`

- **Status:** `QUEBRADO NA SEGUNDA METADE (ÁREAS 14 E 15 INEXISTENTES COMO MÓDULOS)`
- **O que funciona:**
  - `NER Core` grava logs em `auditLogs` em todas as mutações sensíveis (com redação de segredos) e executa exportação/anonimização LGPD.
  - `NER Operations & Governance` monitora processo Node, headers de segurança e presença de variáveis de ambiente.
- **Pontos de quebra:**
  - `NER Integration & Quality Assurance` e `NER Production Readiness & Launch` **não existem como módulos runtime** na aplicação, interrompendo a cadeia operacional dentro do sistema.
  - `operations.incidents` não possui UI nem fluxo de abertura/resolução.
