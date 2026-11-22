import React from 'react';
import type { AiTabId, CostFilterState } from './AiCenterViews';
import {
  AiUsageRechartsSection,
  ProjectedBudgetAlertsSection,
} from './AiCostsChartsAndAlerts';

export interface ConsumoECustosProps {
  usageLogs: any[];
  chartUsageLogs?: any[];
  exchangeRate: number;
  filters: CostFilterState;
  onChangeFilters: (next: CostFilterState) => void;
  budgetProgress?: any;
  costPolicy?: any;
  summary?: any;
  alerts?: any[];
  loading?: boolean;
  onInspectLog?: (id: string) => void;
  onNavigateTab?: (tab: AiTabId) => void;
  showBudgetAlerts?: boolean;
}

/**
 * Componente principal "Consumo e Custos" do NER AI CENTER.
 * Consome `aiGateway.usageLogs` e renderiza gráficos interativos em Recharts
 * (evolução temporal, provedor, departamento e modelo) com filtros dinâmicos de período,
 * cross-filtering bidirecional, detalhamento tabular ordenável e monitoramento projetado
 * contra limites orçamentários (50%, 75%, 90%, 100%).
 */
export function ConsumoECustos({
  usageLogs,
  chartUsageLogs,
  exchangeRate,
  filters,
  onChangeFilters,
  budgetProgress,
  costPolicy,
  summary,
  alerts = [],
  loading = false,
  onInspectLog,
  onNavigateTab,
  showBudgetAlerts = true,
}: ConsumoECustosProps) {
  return (
    <div className="space-y-5">
      {/* Gráficos Interativos Recharts sobre aiGateway.usageLogs em destaque */}
      <AiUsageRechartsSection
        usageLogs={chartUsageLogs ?? usageLogs}
        exchangeRate={exchangeRate}
        filters={filters}
        onChangeFilters={onChangeFilters}
        loading={loading}
        onInspectLog={onInspectLog}
        onNavigateTab={onNavigateTab}
      />

      {/* Projeção de Custos & Barras Color-Coded com Marcos 50%, 75%, 90%, 100% */}
      {showBudgetAlerts && (
        <ProjectedBudgetAlertsSection
          budgetProgress={budgetProgress}
          costPolicy={costPolicy}
          summary={summary}
          alerts={alerts}
          exchangeRate={exchangeRate}
          usageLogs={usageLogs}
        />
      )}
    </div>
  );
}

export { AiUsageRechartsSection, ProjectedBudgetAlertsSection };
export default ConsumoECustos;
