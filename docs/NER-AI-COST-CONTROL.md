# NER AI COST CONTROL — Contabilização, Políticas e Limites Financeiros

## 1. Contabilização Transparente de Custos (`server/ai/cost-usage.ts`)

O NER AI Gateway adota regra estrita de transparência financeira:

1. **Custo reportado pelo provedor**: quando retornado pela API (ex.: OpenRouter), tem prioridade absoluta (`providerReportedCostUsd`, `costReliable: true`).
2. **Modelos locais (`ollama`, `vllm`)**: custo de API igual a `$0.00` (`costReliable: true`).
3. **Tabela de preços verificada**: calcula `(inputTokens / 1_000_000) * inputCostPer1M + (outputTokens / 1_000_000) * outputCostPer1M` somente quando `pricingVerified === true`.
4. **Preços não verificados**: para modelos customizados/descobertos sem tarifa cadastrada, grava `estimatedCostUsd: null` e `costReliable: false` — **nunca inventa estimativas fictícias**.

## 2. Política de Limites (`AiCostPolicy`)

Configurável por organização em `PUT /api/ai/cost-policy` (ou via **NER AI CENTER → Consumo e custos**):

- `dailyLimitUsd`: teto diário da organização.
- `monthlyLimitUsd`: teto mensal da organização.
- `userDailyLimitUsd`: teto diário por usuário.
- `departmentLimitsUsd`: tetos diários específicos por departamento.
- `alertThresholdPct`: percentual (1–100%) que dispara `budgetAlert` na resposta quando atingido.
- `blockOnExceed`: quando `true`, bloqueia novas chamadas preventivamente antes de acionar o provedor externo, registrando `status: 'budget_blocked'` e retornando HTTP `429`.

## 3. Agregações Analíticas Reais

`buildUsageAnalytics` consolida exclusivamente a partir de `usageLogs` reais da organização ativa:
- Total de requisições, requisições do dia, taxa de sucesso (%) e latência média (ms).
- Quebra por **Provedor**, **Modelo**, **Departamento**, **Cliente** e **Usuário**.
