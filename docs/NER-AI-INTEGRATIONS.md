# NER AI INTEGRATIONS — Conexão dos Departamentos ao Gateway Central

Todos os módulos operacionais da **NER AGENCY OS** consomem o **NER AI Gateway** através do endpoint unificado `POST /api/ai/department/execute` (além de `/api/ai/generate` e `/api/ai/stream`), utilizando o componente reutilizável `DepartmentAiWidget` (`src/components/AiCenterViews.tsx`) e `StrategyView` (`src/components/OperationsViews.tsx`).

## Mapa de Integrações Departamentais

| Módulo | Finalidade Roteada | Guardrails Aplicados |
| :--- | :--- | :--- |
| **NER Strategy** (`StrategyView`) | `marketing_strategy` (`STRATEGY_GROWTH_DIAGNOSIS`) | Suporte a streaming SSE (`/api/ai/stream`) e telemetria de tokens/latência/provedor. |
| **NER Digital Studio** (`ProjectsView`) | `software_dev` | Levantamento de requisitos, arquitetura, critérios de aceite e QA vinculados ao `projectId`/`clientId`. |
| **NER Creative** (`CreativeView`) | `creatives` (`CREATIVE_AD_COPY_VARIATIONS`) | Geração de hooks, roteiros, headlines e variações mantendo compliance. |
| **NER Performance** (`PerformanceView`) | `campaign_analysis` (`PERFORMANCE_CAMPAIGN_AUDIT`) | **Somente leitura / consultivo**: recomenda hipóteses respeitando significância estatística; **nunca altera orçamentos ou pausa campanhas automaticamente**. |
| **NER Web** (`WebView`) | `copywriting` | Estruturação de LPs, headlines e SEO; **publicação continua dependendo de aprovação humana**. |
| **NER Automation** (`AutomationView`) | `automation` | Classificação e resumo de eventos; **`allowRetry = false`** no backend para evitar reexecuções indevidas sem idempotência. |
| **NER Intelligence** (`IntelligenceTrackingView`) | `data_analysis` | Separa fatos observados, métricas calculadas e hipóteses sobre anomalias. |
| **NER Tracking** (`IntelligenceTrackingView`) | `data_analysis` | Diagnóstico de eventos CAPI/Pixel, `event_id` e deduplicação. |
| **NER Client Experience** (`ClientPortalView`) | `customer_support` | Assistente exclusivo para o portal com **isolamento estrito ao `clientId` e `organizationId` do usuário autenticado**; papel `Cliente` é bloqueado (`403`) em qualquer outro departamento. |
