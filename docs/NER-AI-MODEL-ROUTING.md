# NER AI MODEL ROUTING — Catálogo de Modelos e Roteamento por Finalidade

## 1. Gerenciador Central de Modelos

O catálogo de modelos (`AiModelEntry[]`) combina:
- **Catálogo curado inicial** (ex.: `gemini-4-hydrogen`, `gemini-4-neon`, `gemini-embedding-2`, `gpt-4o-mini`, `gpt-4o`, `text-embedding-3-small`, modelos Anthropic, DeepSeek, OpenRouter, Ollama, vLLM e Hugging Face).
- **Descoberta dinâmica real** via `POST /api/ai/providers/:providerId/discover-models`.
- **Registro manual** via `POST /api/ai/models` para modelos locais ou proprietários.

Cada modelo mantém: `isActive`, `isDefaultForProvider`, `priority`, `contextWindow`, `capabilities`, `inputCostPer1M`, `outputCostPer1M` e `pricingVerified`.

## 2. As 12 Finalidades Configuráveis (`AiRoutingRule`)

Cada finalidade abaixo possui provedor/modelo primário, provedor/modelo fallback, política `allowMoreExpensiveFallback`, `timeoutMs` e `maxRetries` configuráveis em tempo real pelo painel **NER AI CENTER → Roteamento**:

| Finalidade (`purpose`) | Rótulo na Interface |
| :--- | :--- |
| `general_assistant` | Assistente geral |
| `marketing_strategy` | Estratégia de marketing |
| `copywriting` | Copywriting |
| `creatives` | Criativos |
| `campaign_analysis` | Análise de campanhas |
| `data_analysis` | Análise de dados |
| `coding` | Programação |
| `software_dev` | Desenvolvimento de software |
| `document_analysis` | Análise de documentos |
| `customer_support` | Atendimento ao cliente |
| `automation` | Automação |
| `embeddings` | Embeddings |

## 3. Política de Fallback Seguro e Resiliência

1. **Bloqueio de fallback mais caro**: Quando `allowMoreExpensiveFallback = false`, o Gateway compara o custo unitário conhecido do modelo fallback frente ao primário. Se o fallback for mais caro, ele não é acionado automaticamente.
2. **Retries seletivos**: Erros de autenticação (`401/403`) ou requisição inválida (`400`) nunca sofrem retry automático. Apenas falhas transitórias (`429`, `504`, `5xx`) executam até `maxRetries` (desabilitado quando `allowRetry = false`).
3. **Circuit Breaker por provedor**: Após 3 falhas consecutivas, o circuito abre por 60 segundos (`OPEN`), evitando cascata de timeouts e permitindo recuperação controlada em `HALF_OPEN`.
4. **Auditoria de Fallback**: Toda execução que utilizou fallback grava `fallbackUsed: true` e `fallbackFrom: "<primaryProvider>/<primaryModel>"` no `AiUsageLog`.
