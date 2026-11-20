# 05 — Auditoria de Tokens, Custos e AI Cost Intelligence — NER AGENCY OS

## 1. Princípio de Medição Sem Fabricação
Verificado em `server/ai/cost-usage.ts` e `server/ai/gateway.ts`:
- Toda chamada executada pelo Gateway passa pelo motor de custos (`estimateRequestCost`) e registra um `AiUsageLog` com `requestId` e `idempotencyKey`.
- Quando o provedor reporta `usageReported: false` ou omite `reasoningTokens`/`cachedTokens`, o sistema **não fabrica contagens** (`usageStatus: 'unavailable'` ou `'partial'`, `costStatus: 'unavailable'`, `costReliable: false`).
- **Prevenção de Dupla Cobrança**: `cachedTokens` e `reasoningTokens` são descontados/calculados de forma segregada sobre o total reportado, sem somar em duplicidade ao custo de input/output base.

---

## 2. Conversão USD → BRL, Governança e Limites
- **Taxa de Câmbio**: Configurável via `PUT /api/ai/exchange-rate` com metadados (`exchangeRate`, `exchangeRateDate`, `exchangeRateSource`) preservados em cada log histórico (mudanças futuras não distorcem relatórios passados).
- **Políticas de Custo (`AiCostPolicy`)**:
  - Alertas progressivos em **50%, 75%, 90% e 100%** dos tetos diário e mensal por organização, cliente, departamento ou usuário.
  - Ações configuráveis ao atingir limite: `warn`, `block_non_essential` (preserva ações marcadas `isCritical: true`), `fallback_economical` (redireciona para modelo mais barato com capacidades compatíveis) e `block_all` (lança `AiLimitException`).
  - Exceções auditáveis temporárias via `/api/ai/limit-exceptions`.
- **Confiabilidade Contábil**: Falha de persistência ao registrar custo gera `AiAccountingAlert` resiliente sem silenciar divergências; anomalias estatísticas classificadas entre `possible` e `confirmed`.

---

## 3. Dashboards, Segmentação e Exportações Reais
- `GET /api/ai/dashboard` entrega visão segmentada por:
  - **Provedor**, **Modelo**, **Departamento**, **Funcionalidade/Ação**, **Cliente vs Operação Interna** (`billingCategory`), **Latência p95** e **Comparativo de custo entre modelos**.
- `GET /api/ai/reports/export` gera downloads reais em **CSV**, **XLSX** (planilha XML/ZIP válida sem dependências inseguras) e **PDF** binário válido, todos submetidos a filtros multi-dimensionais, RBAC e isolamento multi-tenant.
- **Cobertura de Testes**: 7/7 cenários de Cost Intelligence validados em `tests/ner-ai-cost-intelligence.test.ts`.
