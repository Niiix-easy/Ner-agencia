# NER AI USAGE LIMITS — Limites Orçamentários, Ações Críticas, Exceções e Anomalias

## 1. Escopos de Limite Configuráveis (`AiCostPolicy`)

A política orçamentária por organização suporta tetos independentes em USD avaliados antes de cada execução (`evaluateCostPolicyBeforeRequest`):

| Escopo | Campo na Política | Granularidade |
| --- | --- | --- |
| Organização (Diário) | `dailyLimitUsd` | Gasto diário acumulado da organização |
| Organização (Mensal) | `monthlyLimitUsd` | Gasto mensal acumulado da organização |
| Usuário (Diário) | `userDailyLimitUsd` | Gasto diário por usuário |
| Departamento (Diário) | `departmentLimitsUsd[department]` | Gasto diário por departamento NER |
| Provedor (Diário) | `providerLimitsUsd[providerId]` | Gasto diário por provedor |
| Modelo (Diário) | `modelLimitsUsd[modelId ou provider/model]` | Gasto diário por modelo específico |
| Ação (Diário) | `actionLimitsUsd[actionId]` | Gasto diário por ação padronizada |
| Ações Restritas | `restrictedActions[]` | Bloqueio explícito de ações salvo exceção ativa |

---

## 2. Alertas Preventivos e Modos ao Atingir Limite (`onExceedAction`)

- **Limiares Preventivos**: `[50, 75, 90, 100]`% configuráveis em `alertThresholds`. Quando o consumo atinge cada patamar, um alerta estruturado (`warning` ou `critical`) é emitido no dashboard com valor atual, limite e percentual consumido.
- **Comportamentos ao Atingir 100% (`onExceedAction`)**:
  1. `notify`: Permite execução emitindo alerta administrativo.
  2. `block_non_essential`: Bloqueia requisições não-críticas com HTTP `429` (registrando evento `budget_blocked`), mas **preserva operações críticas** (`isCritical: true` na requisição ou na definição da ação em `AiActionDefinition`).
  3. `restrict_action` / `require_authorization`: Bloqueia execução padrão exigindo autorização explícita via exceção temporária (`AiLimitException`).
  4. `fallback_economical`: Redireciona automaticamente a chamada para o modelo verificado de menor custo disponível no catálogo (ex.: downgrade de `gpt-4o` para `gpt-4o-mini` ou `gemini-4-hydrogen`).

---

## 3. Exceções Temporárias (`AiLimitException`)

Administradores (`ai.manage`) podem conceder orçamento extra temporário sem alterar permanentemente a política global:

- Escopos suportados: `organization`, `user`, `department`, `provider`, `model`, `action`.
- Campos obrigatórios: `targetKey`, `extraBudgetUsd`, `reason`, `expiresAt` e `grantedByUserId`.
- Gerenciamento via `GET / POST / DELETE /api/ai/limit-exceptions` e pela sub-aba **Preços, Câmbio, Limites & Exceções**.

---

## 4. Detecção de Anomalias (`detectUsageAnomalies`)

O motor analisa logs reais filtrados evitando falsos positivos com **guarda de amostra mínima (`MIN_SAMPLE = 3`)**:

| Tipo | Regra de Detecção | Confiança |
| --- | --- | --- |
| `action_token_spike` | Execução com tokens `>= 3x` a mediana da mesma ação (`>= 2` amostras) | `possible` (2 amostras) / `confirmed` (`>= 3` amostras) |
| `user_burst` | `>= 10` requisições do mesmo usuário em janela inferior a 5 minutos | `confirmed` |
| `client_cost_spike` | Gasto diário de um cliente `>= 3x` a média dos demais dias (`>= 2` dias) | `possible` (2 dias) / `confirmed` (`>= 3` dias) |
| `retry_storm` | `>= 4` falhas (`error` ou `rate_limited`) na mesma ação/departamento | `possible` (4) / `confirmed` (`>= 5`) |
