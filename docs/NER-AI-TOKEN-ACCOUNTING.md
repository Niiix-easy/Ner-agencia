# NER AI TOKEN ACCOUNTING — Extração de Telemetria, Idempotência e Resiliência

## 1. Princípio Fundamental: Zero Tokens Inventados

O sistema distingue explicitamente dados reais reportados pelo provedor de métricas indisponíveis:

- Quando o provedor retorna metadados de uso (`usage`, `usageMetadata`, `meta.tokens`, etc.), o adaptador marca `usageReported: true`.
- Quando o provedor omite contagem de tokens (ex.: resposta sem bloco `usage` ou stream sem evento de uso), o adaptador retorna `usageReported: false` e contadores zerados — **jamais** estimando tokens por contagem de caracteres.
- O campo `usageStatus` registra:
  - `'confirmed'`: provedor reportou tokens reais na resposta/stream.
  - `'estimated'`: uso derivado quando aplicável sem fabricação arbitrária.
  - `'unavailable'`: provedor não informou telemetria; `rawInputTokens`, `rawOutputTokens`, `estimatedCostUsd` e `totalCostBRL` permanecem `null` / indisponíveis e o contador `unavailableUsageCount` alerta na interface.

---

## 2. Normalização Entre os 8 Adaptadores (`server/ai/providers.ts`)

| Provedor | Campos Extraídos (Chat / Stream / Embeddings) |
| --- | --- |
| **OpenAI** | `prompt_tokens` / `input_tokens`, `completion_tokens` / `output_tokens`, `prompt_tokens_details.cached_tokens`, `completion_tokens_details.reasoning_tokens`, `stream_options: { include_usage: true }` |
| **Anthropic** | `usage.input_tokens`, `usage.output_tokens`, `cache_read_input_tokens`, `cache_creation_input_tokens` |
| **Google Gemini** | `usageMetadata.promptTokenCount`, `candidatesTokenCount`, `cachedContentTokenCount`, `thoughtsTokenCount` |
| **OpenRouter** | `usage.prompt_tokens`, `completion_tokens`, `prompt_tokens_details.cached_tokens`, `completion_tokens_details.reasoning_tokens`, `usage.cost` (custo confirmado pelo provedor) |
| **Groq / DeepSeek** | `usage.prompt_tokens`, `completion_tokens`, `prompt_cache_hit_tokens`, `completion_tokens_details.reasoning_tokens` |
| **HuggingFace** | `usage.prompt_tokens`, `completion_tokens` quando retornados pela Inference API; `usageReported: false` quando omitidos |
| **Ollama (Local)** | `prompt_eval_count` (`inputTokens`), `eval_count` (`outputTokens`); `usageReported: true` apenas quando presentes |

---

## 3. Padronização de Ações (`server/ai/actions.ts`)

Cada requisição carrega uma ação padronizada (`department.entity.verb`), evitando rótulos genéricos como `"IA"`:

- `strategy.diagnosis`, `strategy.planning`
- `creative.copy.generate`, `creative.headline.generate`, `creative.script.generate`, `creative.ad.analyze`
- `performance.campaign.analyze`, `performance.optimization.recommend`
- `tracking.events.diagnose` (crítica)
- `intelligence.report.generate`, `intelligence.metrics.query` (cacheável)
- `web.landing.generate`, `web.copy.generate`
- `studio.software.specification`, `studio.code.review`
- `client.response.generate` (crítica)
- `automation.request.classify` (crítica)

Novas ações podem ser criadas administrativamente via `POST /api/ai/actions` ou diretamente pela sub-aba **Departamentos & Ações**.

---

## 4. Idempotência e Resiliência Contábil

- **Idempotência**: Cada execução possui `requestId` único e aceita `idempotencyKey`. Antes de inserir um `AiUsageLog`, `gateway.recordUsage` verifica se já existe log com o mesmo `idempotencyKey` (protegido também por índice único parcial no banco SQL `AiUsageLog_idempotencyKey_key`), evitando cobrança dupla em retentativas ou reenvios.
- **Resiliência (`try/catch`)**: Caso a gravação persistente (`store.save()`) falhe após uma chamada já concluída no provedor, o gateway **não** derruba a resposta da IA ao usuário; em vez disso, cria um registro em `AiAccountingAlert` (`resolved: false`) visível ao administrador na aba **Consumo e Custos**, permitindo auditoria e resolução posterior (`PATCH /api/ai/accounting-alerts/:id/resolve`).
- **Conciliação**: Valores estimados podem ser reconciliados posteriormente contra a fatura oficial do provedor via `PATCH /api/ai/usage-logs/:id/reconcile`, atualizando `providerReportedCostUsd`, `reconciledWithProvider = true`, `reconciledAt` e `costStatus = 'confirmed'`.
