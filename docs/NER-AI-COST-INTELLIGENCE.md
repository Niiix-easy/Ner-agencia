# NER AI COST INTELLIGENCE — Arquitetura Geral

## 1. Visão Geral

O **NER AI COST INTELLIGENCE** é a camada completa de monitoramento, contabilização financeira, governança orçamentária, detecção de anomalias e exportação de relatórios executivos sobre o uso de Inteligência Artificial na plataforma **NER AGENCY OS**.

Toda medição opera diretamente sobre o **NER AI Gateway** existente (`server/ai/gateway.ts`), sem criação de um segundo gateway, sem duplicação de módulos departamentais e sem alteração ou exposição das credenciais dos provedores configurados.

---

## 2. Componentes da Arquitetura

| Camada | Arquivo / Recurso | Responsabilidade |
| --- | --- | --- |
| Catálogo de Ações | `server/ai/actions.ts` | Padronização extensível de ações (`strategy.diagnosis`, `creative.copy.generate`, etc.) com flags `isCritical` e `cacheable` |
| Motor de Custos & Analytics | `server/ai/cost-usage.ts` | Cálculo financeiro (4 taxas), câmbio USD→BRL, projeção run-rate, governança multi-escopo, exceções, anomalias e agregações |
| Gateway Central | `server/ai/gateway.ts` | Execução unificada (`execute`, `executeStream`, `embed`), idempotência, resiliência na gravação (`AiAccountingAlert`), fallback econômico |
| Adaptadores de Provedores | `server/ai/providers.ts` | Extração real de telemetria (`inputTokens`, `outputTokens`, `cachedTokens`, `reasoningTokens`, `usageReported`, `providerReportedCostUsd`) em 8 adaptadores |
| Exportadores Reais | `server/ai/exporters.ts` | Geração real em memória de CSV (UTF-8 BOM), XLSX (OOXML ZIP válido) e PDF 1.4 |
| API REST & RBAC | `server/ai/router.ts` | Endpoints de dashboard, inspeção sanitizada de logs, conciliação, catálogo de ações, câmbio, preços, exceções e exportação |
| Persistência & Schema | `database/schema/schema.prisma` + `database/migrations/20261119_ner_ai_cost_intelligence.sql` | Extensão não-destrutiva de `AiModel`, `AiCostPolicy`, `AiUsageLog` + tabelas `AiActionCatalog`, `AiExchangeRate`, `AiLimitException`, `AiAccountingAlert`, `AiUsageAggregation` |
| Interface Admin & Departamental | `src/components/AiCenterViews.tsx` + `src/components/OperationsViews.tsx` | Aba **Consumo e Custos** (5 sub-abas), `UsageDetailModal`, histórico sanitizado e seletor dinâmico de ações no `DepartmentAiWidget` |

---

## 3. Fluxo de Execução e Contabilização (End-to-End)

1. **Solicitação**: Módulo departamental (`StrategyView`, `DepartmentAiWidget` ou `/api/ai/generate`, `/api/ai/stream`, `/api/ai/embeddings`, `/api/ai/department/execute`) envia `department`, `action`, `billingCategory`, `isCritical`, `clientId` e opcionalmente `idempotencyKey`.
2. **Resolução de Ação**: `resolveActionIdentifier` resolve a ação explícita ou mapeia pelo departamento/propósito.
3. **Pré-verificação Orçamentária**: `evaluateCostPolicyBeforeRequest` avalia limites diários/mensais da organização, usuário, departamento, provedor, modelo, ação e ações restritas, considerando `AiLimitException` ativas.
   - Em `block_non_essential`: bloqueia com HTTP `429` chamadas não-críticas e preserva ações críticas (`isCritical: true`).
   - Em `fallback_economical`: redireciona automaticamente para o modelo mais econômico disponível.
4. **Execução & Telemetria**: O adaptador retorna uso real e sinaliza `usageReported: true/false`. Nunca são inventados tokens quando o provedor omite metadados (`usageStatus: 'unavailable'`).
5. **Cálculo Financeiro & Idempotência**: `estimateRequestCost` computa `inputCost`, `outputCost`, `cacheCost`, `reasoningCost`, `estimatedCostUsd` e `totalCostBRL` usando o catálogo de preços e a cotação `AiExchangeConfig`. A gravação ignora duplicatas pelo `idempotencyKey` e captura falhas em `AiAccountingAlert` sem interromper a resposta ao usuário.

---

## 4. Endpoints da API (`/api/ai`)

| Método & Rota | Permissão | Finalidade |
| --- | --- | --- |
| `GET /api/ai/dashboard` | `ai.read` | Retorna KPIs, série temporal, segmentações, projeção, alertas, anomalias e câmbio com filtros combináveis |
| `GET /api/ai/usage-logs` | `ai.read` | Lista logs filtrados respeitando isolamento de `organizationId` e `clientId` |
| `GET /api/ai/usage-logs/:id` | `ai.read` | Retorna visão sanitizada para o modal de inspeção (sem prompts completos ou segredos) |
| `PATCH /api/ai/usage-logs/:id/reconcile` | `ai.manage` | Concilia valor faturado real do provedor (`providerReportedCostUsd`, `reconciledWithProvider`) |
| `GET /api/ai/reports/export` | `ai.read` | Download real nos formatos `csv`, `xlsx` ou `pdf` com os mesmos filtros do dashboard |
| `GET /api/ai/actions` / `POST /api/ai/actions` | `ai.read` / `ai.manage` | Lista catálogo padrão + customizado e registra novas ações padronizadas |
| `GET /api/ai/exchange-rate` / `PUT /api/ai/exchange-rate` | `ai.read` / `ai.manage` | Consulta e atualiza taxa `USD -> BRL`, data de referência e fonte |
| `PUT /api/ai/pricing` | `ai.manage` | Atualiza tabela de preços (`input`, `output`, `cacheInput`, `reasoning` por 1M tokens) |
| `GET / POST / DELETE /api/ai/limit-exceptions` | `ai.read` / `ai.manage` | Gerencia exceções temporárias de orçamento por escopo |
| `GET /api/ai/accounting-alerts` / `PATCH /api/ai/accounting-alerts/:id/resolve` | `ai.read` / `ai.manage` | Lista e resolve alertas de falha de contabilização |

---

## 5. Segurança, Privacidade e Multi-Tenancy

- Segredos de provedores (`encryptedApiKey`) jamais são retornados nas rotas de dashboard, detalhes de log ou exportações.
- O endpoint `GET /api/ai/usage-logs/:id` expõe apenas metadados operacionais e financeiros sanitizados, sem conteúdo bruto de prompts ou respostas.
- Usuários com perfil `CLIENT` têm acesso estritamente limitado ao seu `organizationId` e `clientId`, impedindo vazamento entre clientes ou departamentos internos.
