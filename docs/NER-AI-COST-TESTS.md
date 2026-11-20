# NER AI COST TESTS — Suíte Automatizada e Comandos de Verificação

## 1. Cobertura de Testes Automatizados (`tests/ner-ai-cost-intelligence.test.ts`)

A suíte dedicada do **NER AI COST INTELLIGENCE** valida ponta a ponta os 6 blocos abaixo usando instâncias isoladas em `os.tmpdir()` e mocks de provedores controlados:

1. **Cost Engine (`estimateRequestCost`)**:
   - Decomposição `inputCost`, `outputCost`, `cacheCost` e `reasoningCost` sem dupla cobrança quando `reasoningTokens <= outputTokens` e `cachedInputTokens <= inputTokens`.
   - Custo `$0` explícito para modelos self-hosted (`ollama`).
   - Recusa absoluta em inventar tokens/custos quando `usageReported: false` (`costStatus: 'unavailable'`, `estimatedCostUsd: null`).
2. **Provider Adapters (`AI_PROVIDER_ADAPTERS`)**:
   - Extração real de `cachedTokens` e `reasoningTokens` em OpenAI e Google Gemini (`thoughtsTokenCount`, `cachedContentTokenCount`).
   - Retorno `usageReported: false` e contadores zerados quando Anthropic omite o campo `usage`.
3. **Cost Intelligence API**:
   - Atualização de cotação `USD -> BRL` (`PUT /api/ai/exchange-rate`).
   - Registro de ação customizada (`POST /api/ai/actions`).
   - Comparativo multi-modelo (`gpt-4o-mini` vs `gemini-4-hydrogen`) na mesma ação, cálculo de `p95Tokens` e evolução diária.
   - Atualização dinâmica de preços (`PUT /api/ai/pricing`).
   - Segregação por cliente e `billingCategory` (`client_included` vs `client_overage` vs `internal_agency`).
   - Endpoint sanitizado `GET /api/ai/usage-logs/:id` sem exposição de prompts brutos ou `encryptedApiKey`.
   - Conciliação com fatura do provedor (`PATCH /api/ai/usage-logs/:id/reconcile`).
4. **Cost Intelligence Governance**:
   - Emissão de alertas nos limiares `50%` e `>= 100%` (`organization_daily` / `organization_monthly`).
   - Bloqueio HTTP `429` em chamadas não-críticas sob `block_non_essential` preservando execuções marcadas com `isCritical: true`.
   - Desbloqueio via `AiLimitException` temporária e revogação via `DELETE`.
   - Downgrade automático para modelo econômico sob `fallback_economical`.
5. **Cost Intelligence Reliability**:
   - Deduplicação idempotente por `idempotencyKey`.
   - Detecção de anomalias com transição correta de `confidence: 'possible'` (2 amostras) para `'confirmed'` (3+ amostras).
   - Criação e resolução de `AiAccountingAlert` quando `store.save()` falha durante a contabilização, sem derrubar a resposta da chamada.
6. **Cost Intelligence Exports & Security**:
   - Downloads reais de relatórios em **CSV** (UTF-8 BOM), **XLSX** (assinatura ZIP `PK` válida) e **PDF** (assinatura `%PDF-1.4`).
   - Filtros multi-dimensionais combinados (`department`, `providerId`, `period`, `clientId`).
   - Isolamento RBAC e multi-tenant bloqueando acesso de cliente de outra organização/conta.

---

## 2. Como Executar

| Verificação | Comando |
| --- | --- |
| Suíte completa de testes | `npm test` |
| Verificação estrita de tipos TypeScript | `npm run lint` |
| Build de produção do frontend/bundle | `npm run build` |

Os resultados observados após todas as edições são registrados no resumo final de entrega após a execução completa de verificação.
