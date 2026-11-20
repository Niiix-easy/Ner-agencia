# NER AI USAGE REPORTS — Dashboard, Drilldowns, Segregação por Cliente e Exportação

## 1. Interface **Consumo e Custos** (`NER AI CENTER`)

Integrada em `src/components/AiCenterViews.tsx` (`AiCostsTab`), organizada em **5 sub-abas** com barra de filtros multi-dimensional persistente e botões de exportação real:

1. **Visão Geral & KPIs**:
   - Exibe os **12 KPIs executivos**: Total de Requisições, Taxa de Sucesso, Tokens de Entrada, Tokens de Saída, Tokens em Cache, Tokens de Raciocínio, Custo Total (USD e BRL), Custo Médio por Requisição, Latência Média, Bloqueios Orçamentários e Eventos com Uso Indisponível.
   - **Projeção Run-Rate do Próximo Mês** (`projectedNextMonthUsd` / `projectedNextMonthBrl`) calculada a partir da média diária do período.
   - Evolução diária de custo (USD/BRL) e requisições, além de alertas ativos e anomalias.
2. **Departamentos & Ações**:
   - Ranking de departamentos com drilldown interativo clicável para ações pertencentes àquele departamento.
   - Tabela analítica de ações contendo `p95Tokens` (percentil 95 de consumo), custo separado entre execuções com sucesso (`successCostUsd`) e com erro (`errorCostUsd`), evolução diária e comparativo entre modelos na mesma ação (`modelBreakdown`).
   - Formulário para cadastro administrativo de novas ações padronizadas (`POST /api/ai/actions`).
3. **Provedores & Modelos**:
   - Segmentação completa por provedor e por par `providerId / modelId` com participação percentual (`sharePct`), confiabilidade do preço e tokens cacheados/raciocínio.
4. **Custo por Cliente**:
   - Segregação explícita por cliente e por `billingCategory`:
     - `internal_agency`: Uso interno da agência.
     - `client_included`: Uso incluído no plano contratado do cliente.
     - `client_additional`: Uso adicional sob demanda.
     - `client_overage`: Excedente faturável do cliente.
5. **Preços, Câmbio, Limites & Exceções**:
   - Edição da taxa USD→BRL, edição das 4 taxas por modelo, configuração de limites multi-escopo, concessão/revogação de exceções (`AiLimitException`) e resolução de alertas contábeis (`AiAccountingAlert`).

---

## 2. Filtros Multi-Dimensionais

Suportados simultaneamente no dashboard, na listagem de logs e na exportação (`parseUsageFilter` em `server/ai/router.ts` + `filterLogs` em `server/ai/cost-usage.ts`):

- **Período**: `today`, `yesterday`, `7d`, `30d`, `current_month`, `previous_month`, `custom` (`startDate` + `endDate`) e `all`.
- **Dimensões**: `providerId`, `modelId`, `department`, `action`, `userId`, `clientId` (incluindo `'internal'`), `status` (`success`, `error`, `rate_limited`, `budget_blocked`) e `billingCategory`.

---

## 3. Modal de Inspeção Sanitizada (`UsageDetailModal`)

Acessível pelo botão **Inspecionar** na aba de Histórico via `GET /api/ai/usage-logs/:id`:

- Exibe `requestId`, `traceId`, `idempotencyKey`, departamento, ação, cliente, categoria de faturamento, provedor/modelo, latência, quebra completa de tokens (`input`, `output`, `cached`, `reasoning`, `usageStatus`), decomposição financeira (`inputCost`, `outputCost`, `cacheCost`, `reasoningCost`, `totalCostUsd`, `totalCostBRL`, câmbio aplicado) e status de conciliação.
- Permite que administradores registrem o custo oficial da fatura do provedor (`PATCH /api/ai/usage-logs/:id/reconcile`).
- **Privacidade**: não armazena nem retorna chaves de API ou conteúdo completo dos prompts/respostas.

---

## 4. Exportação Real de Relatórios (`server/ai/exporters.ts`)

Endpoint `GET /api/ai/reports/export?format=csv|xlsx|pdf` respeitando os filtros ativos e o escopo RBAC/multi-tenant do usuário:

- **CSV**: UTF-8 com BOM (`\uFEFF`) para compatibilidade imediata com Excel, escapamento RFC-4180 e todas as colunas de tokens, USD, BRL e natureza do custo (`confirmed`, `estimated`, `unavailable`).
- **XLSX**: Arquivo OOXML válido montado via ZIP (`[Content_Types].xml`, `_rels/.rels`, `xl/workbook.xml`, `xl/_rels/workbook.xml.rels`, `xl/worksheets/sheet1.xml`) sem dependências externas.
- **PDF**: Documento PDF 1.4 válido com cabeçalho executivo, resumo de totais (requisições, USD, BRL) e linhas tabulares paginadas.
