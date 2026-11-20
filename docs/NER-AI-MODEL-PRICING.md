# NER AI MODEL PRICING — Precificação Configurável e Câmbio USD → BRL

## 1. Estrutura da Tabela de Preços (`AiModelEntry`)

Os preços não são fixos no código de cálculo: cada modelo em `store.getState().aiGateway.models` (e na tabela SQL `AiModel`) armazena 4 taxas configuráveis em USD por 1 milhão de tokens:

| Campo | Descrição |
| --- | --- |
| `inputCostPer1M` | Preço por 1M tokens de entrada padrão (não cacheados) |
| `outputCostPer1M` | Preço por 1M tokens de saída padrão |
| `cacheInputCostPer1M` | Preço reduzido por 1M tokens lidos em cache (`cachedInputTokens`) |
| `reasoningCostPer1M` | Preço específico por 1M tokens de raciocínio (`reasoningTokens`) |
| `currency` / `effectiveFrom` / `priceSource` | Moeda base (`USD`), data de vigência e referência da tabela |
| `pricingVerified` | Indica se o modelo possui tabela de preços verificada para cálculo confiável |

A atualização administrativa ocorre em tempo real via `PUT /api/ai/pricing` e recalcula imediatamente projeções e agregações no dashboard.

---

## 2. Fórmulas Sem Dupla Contagem (`estimateRequestCost`)

Implementado em `server/ai/cost-usage.ts`:

1. **Custo confirmado pelo provedor (`providerReportedCostUsd`)**:
   - Quando informado pelo adaptador (ex.: OpenRouter) ou reconciliado manualmente, assume `costStatus = 'confirmed'`, `costReliable = true`.
2. **Telemetria indisponível (`usageReported === false`)**:
   - Retorna `costStatus = 'unavailable'`, `costReliable = false`, `estimatedCostUsd = null`, `totalCostBRL = null`. Nunca inventa valores.
3. **Cálculo por tabela verificada (`pricingVerified === true`)**:
   - **Entrada + Cache (sem cobrança duplicada)**:
     - `uncachedIn = max(0, inputTokens - cachedInputTokens)`
     - `inputCost = (uncachedIn / 1_000_000) * inputCostPer1M`
     - `cacheCost = (cachedInputTokens / 1_000_000) * cacheInputCostPer1M` (quando `cacheInputCostPer1M` definido)
   - **Saída + Raciocínio (sem cobrança duplicada)**:
     - Quando `reasoningCostPer1M` está definido e `reasoningTokens <= outputTokens`, os tokens de raciocínio são subtraídos de `outputTokens` antes de aplicar `outputCostPer1M`, evitando cobrança dupla sobre `completion_tokens`:
       - `regularOut = max(0, outputTokens - reasoningTokens)`
       - `outputCost = (regularOut / 1_000_000) * outputCostPer1M`
       - `reasoningCost = (reasoningTokens / 1_000_000) * reasoningCostPer1M`
   - **Total USD**: `inputCost + outputCost + cacheCost + reasoningCost` (`costStatus = 'estimated'`).
4. **Modelos Self-Hosted (ex.: Ollama)**:
   - Configurados com taxas `0` (`pricingVerified: true`, `inputCostPer1M: 0`, `outputCostPer1M: 0`), resultando em `$0.00` explícito e confiável.
5. **Modelos Sem Preço Configurado**:
   - Retornam `estimatedCostUsd = null`, `costStatus = 'unavailable'` e disparam o alerta `unpriced_models` na interface.

---

## 3. Conversão Cambial Configurável (`AiExchangeConfig`)

- Armazena `baseCurrency: 'USD'`, `targetCurrency: 'BRL'`, `rate` (cotação configurável pelo administrador), `rateDate` e `source` (ex.: PTAX / Banco Central / Referência Administrativa).
- Gerenciada via `GET /api/ai/exchange-rate` e `PUT /api/ai/exchange-rate` (sub-aba **Preços, Câmbio, Limites & Exceções**).
- Cada `AiUsageLog` registra o snapshot cambial utilizado no momento da contabilização (`exchangeRate`, `exchangeRateDate`, `exchangeRateSource`, `totalCostBRL`) e o dashboard exibe os totais consolidados em USD e BRL lado a lado.
