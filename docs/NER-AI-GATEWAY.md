# NER AI GATEWAY — Unified Artificial Intelligence Infrastructure

## 1. Visão Geral Arquitetural

O **NER AI GATEWAY** é a camada única e centralizada de Inteligência Artificial da plataforma **NER AGENCY OS**. Ele substituiu a antiga rota isolada de geração de texto por um barramento corporativo multi-provedor com governança, criptografia em repouso, roteamento por finalidade, fallback seguro, controle de custos e isolamento multi-tenant.

Todos os módulos internos da plataforma comunicam-se exclusivamente com os endpoints `/api/ai/*` no backend (`server/ai/router.ts`), nunca diretamente do navegador para provedores externos.

## 2. Componentes do Núcleo (`server/ai/`)

| Arquivo | Responsabilidade |
| :--- | :--- |
| `server/ai/types.ts` | Contratos de domínio para provedores, capacidades, modelos, regras de roteamento, prompts versionados, políticas financeiras, logs, memória e documentos RAG. |
| `server/ai/credentials.ts` | Criptografia/descriptografia AES-256-GCM com `NER_AI_ENCRYPTION_KEY`, mascaramento de segredos, resolução com precedência (BYOK Organização → Global Criptografada → Variável de Ambiente) e sanitização antes de enviar ao cliente. |
| `server/ai/providers.ts` | 8 adaptadores padronizados (`OpenAiAdapter`, `AnthropicAdapter`, `DeepSeekAdapter`, `GeminiAdapter`, `OpenRouterAdapter`, `OllamaAdapter`, `VllmAdapter`, `HuggingFaceAdapter`) com `testConnection`, `listModels`, `generate`, `generateStream` e `embed`. |
| `server/ai/observability.ts` | `AiObservabilityService` com `requestId`/`traceId`, Circuit Breaker por provedor (`CLOSED`, `OPEN`, `HALF_OPEN`), sanitização de mensagens de erro e classe tipada `AiUpstreamError`. |
| `server/ai/cost-usage.ts` | Estimativa de custo por token ou custo reportado pelo provedor (marcando `costReliable: false` quando a tabela não estiver verificada), bloqueio preventivo por orçamento e consolidação analítica. |
| `server/ai/seed.ts` | Estado inicial limpo: todos os 8 provedores iniciam em `AGUARDANDO CONFIGURAÇÃO`, catálogo inicial de modelos, 12 regras de roteamento e `usageLogs: []` (zero métricas fictícias). |
| `server/ai/gateway.ts` | Orquestrador `AiGatewayService`: validação de orçamento, filtro anti prompt-injection, recuperação de memória/conhecimento isolada por tenant, execução com retries/fallback e auditoria. |
| `server/ai/router.ts` | Endpoints REST e SSE (`/api/ai/dashboard`, `/providers`, `/models`, `/routing`, `/prompts`, `/cost-policy`, `/knowledge`, `/generate`, `/stream`, `/embeddings`, `/department/execute`). |

## 3. Fluxo de Execução de uma Requisição

1. O middleware `requireAuth` e a permissão `ai.use` (ou `ai.client_assist` para `Cliente` em `NER Client Experience`) autenticam e validam o escopo da organização (`resolveScopedOrg`).
2. `evaluateCostPolicyBeforeRequest` verifica tetos diário, mensal, por usuário e por departamento. Se excedido e `blockOnExceed = true`, registra `status: 'budget_blocked'` e retorna HTTP `429`.
3. O Gateway aplica `sanitizePromptInput`, carrega histórico de conversa e documentos da organização/cliente autorizados (gerando `citations`).
4. Seleciona o par primário (`overrideProviderId` → `promptTpl.preferredProviderId` → `AiRoutingRule`) e avalia eventual fallback respeitando `allowMoreExpensiveFallback`.
5. Verifica se o modelo está ativo, se o Circuit Breaker permite e se há credencial válida (caso contrário falha sem mascarar erro).
6. Executa com timeout configurável e retries apenas para falhas transitórias (`rate_limit`, `timeout`, `unavailable`, exceto em contextos sem idempotência como `NER Automation`).
7. Registra `AiUsageLog` real com latência, tokens, custo e eventual uso de fallback.
