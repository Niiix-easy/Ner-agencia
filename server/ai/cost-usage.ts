import {
  AiAccountingAlert,
  AiBillingCategory,
  AiCostPolicy,
  AiDepartment,
  AiExchangeConfig,
  AiGlobalCostPolicy,
  AiLimitException,
  AiModelEntry,
  AiProviderId,
  AiUsageLog,
  AiUsageStatus,
} from './types.ts';

export type UsagePeriodFilter =
  | 'today'
  | 'yesterday'
  | '7d'
  | '30d'
  | 'current_month'
  | 'previous_month'
  | 'custom'
  | 'all';

export interface UsageFilterOptions {
  period?: UsagePeriodFilter;
  startDate?: string;
  endDate?: string;
  providerId?: string;
  modelId?: string;
  department?: string;
  action?: string;
  userId?: string;
  clientId?: string;
  status?: string;
  billingCategory?: string;
}

export interface AiUsageAlert {
  id: string;
  severity: 'critical' | 'warning' | 'info';
  scope:
    | 'global_daily'
    | 'global_monthly'
    | 'organization_daily'
    | 'organization_monthly'
    | 'projected_daily'
    | 'projected_monthly'
    | 'projected_department'
    | 'projected_provider'
    | 'department_daily'
    | 'provider_daily'
    | 'model_daily'
    | 'model_token_daily'
    | 'action_daily'
    | 'budget_blocked'
    | 'unpriced_models'
    | 'unavailable_tokens'
    | 'accounting_failure';
  isProjected?: boolean;
  thresholdPct?: number;
  title: string;
  message: string;
  currentValueUsd?: number;
  limitValueUsd?: number;
  percentageUsed?: number;
  department?: string;
}

export interface AiAnomalyFinding {
  id: string;
  type: 'action_token_spike' | 'user_burst' | 'client_cost_spike' | 'model_error_spike' | 'retry_storm';
  confidence: 'confirmed' | 'possible';
  severity: 'critical' | 'warning';
  subject: string;
  title: string;
  description: string;
  sampleCount: number;
  baselineValue: number;
  observedValue: number;
  detectedAt: string;
}

export interface UsageSegmentRow {
  key: string;
  requests: number;
  successCount: number;
  inputTokens: number;
  outputTokens: number;
  cachedInputTokens: number;
  reasoningTokens: number;
  tokens: number;
  costUsd: number;
  costBrl: number;
  avgCostPerRequestUsd: number;
  avgLatencyMs: number;
  successRatePct: number;
  costReliableCount: number;
  unpricedRequests: number;
  errors: number;
  budgetBlocked: number;
  sharePct: number;
  actions?: { action: string; requests: number; tokens: number; costUsd: number; costBrl: number }[];
}

export interface ActionAnalyticsRow extends UsageSegmentRow {
  department: string;
  avgTokensPerRequest: number;
  p95Tokens: number;
  successCostUsd: number;
  errorCostUsd: number;
  anomalyDetected: boolean;
  modelBreakdown: {
    modelKey: string;
    providerId: string;
    modelId: string;
    requests: number;
    avgTokens: number;
    avgCostUsd: number;
    totalCostUsd: number;
    totalCostBrl: number;
    avgLatencyMs: number;
  }[];
  dailyEvolution: { date: string; requests: number; tokens: number; costUsd: number }[];
}

export interface ClientAnalyticsRow extends UsageSegmentRow {
  clientId: string;
  topDepartment: string;
  byCategory: Record<AiBillingCategory, { requests: number; costUsd: number; costBrl: number }>;
}

export interface CostEstimateResult {
  inputCost: number | null;
  outputCost: number | null;
  cacheCost: number | null;
  reasoningCost: number | null;
  estimatedCostUsd: number | null;
  costReliable: boolean;
  costStatus: AiUsageStatus;
  exchangeRate: number | null;
  exchangeRateDate: string | null;
  exchangeRateSource: string | null;
  totalCostBRL: number | null;
}

const DEFAULT_EXCHANGE: AiExchangeConfig = {
  baseCurrency: 'USD',
  targetCurrency: 'BRL',
  rate: 5.75,
  rateDate: new Date().toISOString().slice(0, 10),
  source: 'Referência Administrativa Configurável',
  updatedAt: new Date().toISOString(),
};

export function estimateRequestCost(
  models: AiModelEntry[],
  providerId: AiProviderId,
  modelId: string,
  inputTokens: number,
  outputTokens: number,
  providerReportedCostUsd?: number | null,
  cachedInputTokens = 0,
  reasoningTokens = 0,
  usageReported = true,
  exchangeConfig?: AiExchangeConfig
): CostEstimateResult {
  const fx = exchangeConfig && exchangeConfig.rate > 0 ? exchangeConfig : DEFAULT_EXCHANGE;
  const toBrl = (usd: number | null) =>
    usd !== null ? Number((usd * fx.rate).toFixed(4)) : null;

  // 1. Confirmed cost directly reported by the upstream provider
  if (typeof providerReportedCostUsd === 'number' && Number.isFinite(providerReportedCostUsd)) {
    const usd = Number(providerReportedCostUsd.toFixed(6));
    return {
      inputCost: null,
      outputCost: null,
      cacheCost: null,
      reasoningCost: null,
      estimatedCostUsd: usd,
      costReliable: true,
      costStatus: 'confirmed',
      exchangeRate: fx.rate,
      exchangeRateDate: fx.rateDate,
      exchangeRateSource: fx.source,
      totalCostBRL: toBrl(usd),
    };
  }

  // 2. If provider did NOT report tokens, never fabricate cost
  if (!usageReported) {
    return {
      inputCost: null,
      outputCost: null,
      cacheCost: null,
      reasoningCost: null,
      estimatedCostUsd: null,
      costReliable: false,
      costStatus: 'unavailable',
      exchangeRate: fx.rate,
      exchangeRateDate: fx.rateDate,
      exchangeRateSource: fx.source,
      totalCostBRL: null,
    };
  }

  // 3. Pricing table lookup with cache & reasoning token safeguards (no double billing)
  const entry = models.find((m) => m.providerId === providerId && m.modelId === modelId);
  if (
    entry &&
    entry.pricingVerified &&
    entry.inputCostPer1M !== null &&
    entry.outputCostPer1M !== null
  ) {
    const safeIn = Math.max(0, inputTokens || 0);
    const safeOut = Math.max(0, outputTokens || 0);
    const safeCached = Math.min(Math.max(0, cachedInputTokens || 0), safeIn);
    const safeReason = Math.max(0, reasoningTokens || 0);

    let inputCost = 0;
    let cacheCost = 0;
    if (entry.cacheInputCostPer1M !== null && entry.cacheInputCostPer1M !== undefined && safeCached > 0) {
      const uncachedIn = Math.max(0, safeIn - safeCached);
      inputCost = (uncachedIn / 1_000_000) * entry.inputCostPer1M;
      cacheCost = (safeCached / 1_000_000) * entry.cacheInputCostPer1M;
    } else {
      inputCost = (safeIn / 1_000_000) * entry.inputCostPer1M;
      cacheCost = 0;
    }

    let outputCost = 0;
    let reasoningCost = 0;
    if (entry.reasoningCostPer1M !== null && entry.reasoningCostPer1M !== undefined && safeReason > 0) {
      if (safeReason <= safeOut) {
        // Reasoning tokens reported inside completion_tokens -> split cleanly without double billing
        const regularOut = Math.max(0, safeOut - safeReason);
        outputCost = (regularOut / 1_000_000) * entry.outputCostPer1M;
        reasoningCost = (safeReason / 1_000_000) * entry.reasoningCostPer1M;
      } else {
        outputCost = (safeOut / 1_000_000) * entry.outputCostPer1M;
        reasoningCost = (safeReason / 1_000_000) * entry.reasoningCostPer1M;
      }
    } else {
      outputCost = (safeOut / 1_000_000) * entry.outputCostPer1M;
      reasoningCost = 0;
    }

    const total = Number((inputCost + outputCost + cacheCost + reasoningCost).toFixed(6));
    return {
      inputCost: Number(inputCost.toFixed(6)),
      outputCost: Number(outputCost.toFixed(6)),
      cacheCost: Number(cacheCost.toFixed(6)),
      reasoningCost: Number(reasoningCost.toFixed(6)),
      estimatedCostUsd: total,
      costReliable: true,
      costStatus: 'estimated',
      exchangeRate: fx.rate,
      exchangeRateDate: fx.rateDate,
      exchangeRateSource: fx.source,
      totalCostBRL: toBrl(total),
    };
  }

  // 4. Local engines (Ollama / vLLM) have $0 token fee unless custom priced
  if (providerId === 'ollama' || providerId === 'vllm') {
    return {
      inputCost: 0,
      outputCost: 0,
      cacheCost: 0,
      reasoningCost: 0,
      estimatedCostUsd: 0,
      costReliable: true,
      costStatus: 'estimated',
      exchangeRate: fx.rate,
      exchangeRateDate: fx.rateDate,
      exchangeRateSource: fx.source,
      totalCostBRL: 0,
    };
  }

  return {
    inputCost: null,
    outputCost: null,
    cacheCost: null,
    reasoningCost: null,
    estimatedCostUsd: null,
    costReliable: false,
    costStatus: 'unavailable',
    exchangeRate: fx.rate,
    exchangeRateDate: fx.rateDate,
    exchangeRateSource: fx.source,
    totalCostBRL: null,
  };
}

function getActiveExceptionExtra(
  exceptions: AiLimitException[] | undefined,
  organizationId: string,
  scope: AiLimitException['scope'],
  targetKey: string,
  nowIso: string
): number {
  if (!exceptions || exceptions.length === 0) return 0;
  return exceptions
    .filter(
      (ex) =>
        ex.organizationId === organizationId &&
        ex.scope === scope &&
        ex.targetKey === targetKey &&
        ex.expiresAt > nowIso
    )
    .reduce((sum, ex) => sum + Math.max(0, ex.extraBudgetUsd || 0), 0);
}

export function evaluateCostPolicyBeforeRequest(
  policy: AiCostPolicy | undefined,
  logs: AiUsageLog[],
  organizationId: string,
  userId: string,
  department: AiDepartment,
  models: AiModelEntry[] = [],
  options: {
    providerId?: AiProviderId;
    modelId?: string;
    action?: string;
    isCritical?: boolean;
    exceptions?: AiLimitException[];
    globalPolicy?: AiGlobalCostPolicy;
  } = {}
): {
  allowed: boolean;
  reason?: string;
  alertMessage?: string;
  recommendEconomicalFallback?: boolean;
  dailySpentUsd: number;
  monthlySpentUsd: number;
  globalDailySpentUsd?: number;
  globalMonthlySpentUsd?: number;
} {
  if (!policy && !options.globalPolicy) {
    return { allowed: true, dailySpentUsd: 0, monthlySpentUsd: 0 };
  }

  const now = new Date();
  const nowIso = now.toISOString();
  const todayPrefix = nowIso.slice(0, 10);
  const monthPrefix = nowIso.slice(0, 7);

  const orgLogs = logs.filter((l) => l.organizationId === organizationId && l.status === 'success');
  const monthLogs = orgLogs.filter((l) => l.createdAt.startsWith(monthPrefix));
  const dayLogs = orgLogs.filter((l) => l.createdAt.startsWith(todayPrefix));

  const logCost = (l: AiUsageLog) => {
    if (typeof l.providerReportedCostUsd === 'number') return l.providerReportedCostUsd;
    if (models.length > 0 && l.usageStatus !== 'unavailable') {
      const recalculated = estimateRequestCost(
        models,
        l.providerId,
        l.modelId,
        l.inputTokens,
        l.outputTokens,
        null,
        l.cachedInputTokens ?? l.cachedTokens ?? 0,
        l.reasoningTokens ?? 0,
        true
      );
      if (recalculated.estimatedCostUsd !== null) return recalculated.estimatedCostUsd;
    }
    return l.estimatedCostUsd ?? 0;
  };

  const sumCost = (arr: AiUsageLog[]) => arr.reduce((sum, l) => sum + logCost(l), 0);

  const dailySpentUsd = Number(sumCost(dayLogs).toFixed(6));
  const monthlySpentUsd = Number(sumCost(monthLogs).toFixed(6));
  const userDailySpent = sumCost(dayLogs.filter((l) => l.userId === userId));
  const deptDailySpent = sumCost(dayLogs.filter((l) => l.department === department));

  const providerId = options.providerId;
  const modelId = options.modelId;
  const action = options.action;
  const isCritical = Boolean(options.isCritical);
  const exceptions = options.exceptions;

  const orgExtra = getActiveExceptionExtra(exceptions, organizationId, 'organization', organizationId, nowIso);
  const userExtra = getActiveExceptionExtra(exceptions, organizationId, 'user', userId, nowIso);
  const deptExtra = getActiveExceptionExtra(exceptions, organizationId, 'department', department, nowIso);
  const provExtra = providerId
    ? getActiveExceptionExtra(exceptions, organizationId, 'provider', providerId, nowIso)
    : 0;
  const modelExtra = modelId
    ? getActiveExceptionExtra(exceptions, organizationId, 'model', modelId, nowIso)
    : 0;
  const actionExtra = action
    ? getActiveExceptionExtra(exceptions, organizationId, 'action', action, nowIso)
    : 0;

  const globalDailyLogs = logs.filter((l) => l.status === 'success' && l.createdAt.startsWith(todayPrefix));
  const globalMonthLogs = logs.filter((l) => l.status === 'success' && l.createdAt.startsWith(monthPrefix));
  const globalDailySpentUsd = Number(sumCost(globalDailyLogs).toFixed(6));
  const globalMonthlySpentUsd = Number(sumCost(globalMonthLogs).toFixed(6));

  let exceededReason: string | undefined;
  let exceededByGlobal = false;

  if (options.globalPolicy) {
    if (options.globalPolicy.dailyLimitUsd > 0 && globalDailySpentUsd >= options.globalPolicy.dailyLimitUsd) {
      exceededReason = `Limite diário GLOBAL de IA atingido (USD ${globalDailySpentUsd.toFixed(4)} / ${options.globalPolicy.dailyLimitUsd.toFixed(2)}).`;
      exceededByGlobal = true;
    } else if (
      options.globalPolicy.monthlyLimitUsd > 0 &&
      globalMonthlySpentUsd >= options.globalPolicy.monthlyLimitUsd
    ) {
      exceededReason = `Limite mensal GLOBAL de IA atingido (USD ${globalMonthlySpentUsd.toFixed(4)} / ${options.globalPolicy.monthlyLimitUsd.toFixed(2)}).`;
      exceededByGlobal = true;
    }
  }

  if (!exceededReason && policy) {
    if (action && policy.restrictedActions?.includes(action) && actionExtra <= 0) {
      exceededReason = `Ação "${action}" está restrita pela política de custos da organização.`;
    } else if (policy.dailyLimitUsd > 0 && dailySpentUsd >= policy.dailyLimitUsd + orgExtra) {
      exceededReason = `Limite diário de IA da organização atingido (USD ${dailySpentUsd.toFixed(4)} / ${(policy.dailyLimitUsd + orgExtra).toFixed(2)}).`;
    } else if (policy.monthlyLimitUsd > 0 && monthlySpentUsd >= policy.monthlyLimitUsd + orgExtra) {
      exceededReason = `Limite mensal de IA da organização atingido (USD ${monthlySpentUsd.toFixed(4)} / ${(policy.monthlyLimitUsd + orgExtra).toFixed(2)}).`;
    } else if (policy.userDailyLimitUsd > 0 && userDailySpent >= policy.userDailyLimitUsd + userExtra) {
      exceededReason = `Limite diário do usuário atingido (USD ${userDailySpent.toFixed(4)} / ${(policy.userDailyLimitUsd + userExtra).toFixed(2)}).`;
    } else {
      const deptCap = policy.departmentLimitsUsd?.[department];
      if (deptCap && deptCap > 0 && deptDailySpent >= deptCap + deptExtra) {
        exceededReason = `Limite diário do departamento ${department} atingido (USD ${deptDailySpent.toFixed(4)} / ${(deptCap + deptExtra).toFixed(2)}).`;
      }
    }
  }

  if (!exceededReason && policy && providerId) {
    const provCap = policy.providerLimitsUsd?.[providerId];
    if (provCap && provCap > 0) {
      const provSpent = sumCost(dayLogs.filter((l) => l.providerId === providerId));
      if (provSpent >= provCap + provExtra) {
        exceededReason = `Limite diário do provedor ${providerId} atingido (USD ${provSpent.toFixed(4)} / ${(provCap + provExtra).toFixed(2)}).`;
      }
    }
  }

  if (!exceededReason && policy && modelId) {
    const modelCap =
      (providerId ? policy.modelLimitsUsd?.[`${providerId}/${modelId}`] : undefined) ??
      policy.modelLimitsUsd?.[modelId];
    if (modelCap && modelCap > 0) {
      const modelSpent = sumCost(dayLogs.filter((l) => l.modelId === modelId));
      if (modelSpent >= modelCap + modelExtra) {
        exceededReason = `Limite diário do modelo ${modelId} atingido (USD ${modelSpent.toFixed(4)} / ${(modelCap + modelExtra).toFixed(2)}).`;
      }
    }
  }

  if (!exceededReason && policy && action) {
    const actCap = policy.actionLimitsUsd?.[action];
    if (actCap && actCap > 0) {
      const actSpent = sumCost(dayLogs.filter((l) => l.action === action));
      if (actSpent >= actCap + actionExtra) {
        exceededReason = `Limite diário da ação ${action} atingido (USD ${actSpent.toFixed(4)} / ${(actCap + actionExtra).toFixed(2)}).`;
      }
    }
  }

  if (!exceededReason && modelId) {
    const modelEntry = models.find(
      (m) => m.modelId === modelId && (!providerId || m.providerId === providerId)
    );
    if (modelEntry?.dailyTokenLimit && modelEntry.dailyTokenLimit > 0) {
      const usedTokensToday = dayLogs
        .filter((l) => l.modelId === modelId && (!providerId || l.providerId === providerId))
        .reduce((sum, l) => sum + l.inputTokens + l.outputTokens, 0);
      if (usedTokensToday >= modelEntry.dailyTokenLimit) {
        exceededReason = `Limite diário de tokens do modelo ${modelId} atingido (${usedTokensToday.toLocaleString('pt-BR')} / ${modelEntry.dailyTokenLimit.toLocaleString('pt-BR')} tokens).`;
      }
    }
  }

  if (exceededReason) {
    const actionMode = exceededByGlobal
      ? options.globalPolicy!.onExceedAction
      : policy?.onExceedAction || (policy?.blockOnExceed ? 'block_non_essential' : 'notify');
    if (!exceededByGlobal && policy?.blockOnExceed === false && actionMode === 'notify') {
      return {
        allowed: true,
        alertMessage: exceededReason,
        dailySpentUsd,
        monthlySpentUsd,
        globalDailySpentUsd,
        globalMonthlySpentUsd,
      };
    }
    if (actionMode === 'notify') {
      return {
        allowed: true,
        alertMessage: exceededReason,
        dailySpentUsd,
        monthlySpentUsd,
        globalDailySpentUsd,
        globalMonthlySpentUsd,
      };
    }
    if (actionMode === 'fallback_economical') {
      return {
        allowed: true,
        recommendEconomicalFallback: true,
        alertMessage: `${exceededReason} Fallback automático para modelo econômico ativado.`,
        dailySpentUsd,
        monthlySpentUsd,
        globalDailySpentUsd,
        globalMonthlySpentUsd,
      };
    }
    if (actionMode === 'block_non_essential' && isCritical) {
      return {
        allowed: true,
        alertMessage: `${exceededReason} Execução mantida por se tratar de operação crítica.`,
        dailySpentUsd,
        monthlySpentUsd,
        globalDailySpentUsd,
        globalMonthlySpentUsd,
      };
    }
    return {
      allowed: false,
      reason: exceededReason,
      dailySpentUsd,
      monthlySpentUsd,
      globalDailySpentUsd,
      globalMonthlySpentUsd,
    };
  }

  // Multi-threshold preventive alert check (50, 75, 90, 100% or custom configured)
  let alertMessage: string | undefined;
  const thresholds = (policy?.alertThresholds?.length ? policy.alertThresholds : [50, 75, 90, 100]).sort(
    (a, b) => a - b
  );
  if (policy && policy.monthlyLimitUsd > 0) {
    const pct = (monthlySpentUsd / policy.monthlyLimitUsd) * 100;
    const hit = thresholds.filter((t) => pct >= t).pop();
    if (hit !== undefined || pct >= (policy.alertThresholdPct || 80)) {
      alertMessage = `Consumo mensal em ${pct.toFixed(1)}% do limite configurado (${hit ?? policy.alertThresholdPct}% atingido).`;
    }
  } else if (options.globalPolicy) {
    const globalThresholds = (
      options.globalPolicy.alertThresholds?.length ? options.globalPolicy.alertThresholds : [50, 75, 90, 100]
    ).sort((a, b) => a - b);
    if (options.globalPolicy.monthlyLimitUsd > 0) {
      const gPct = (globalMonthlySpentUsd / options.globalPolicy.monthlyLimitUsd) * 100;
      const gHit = globalThresholds.filter((t) => gPct >= t).pop();
      if (gHit !== undefined) {
        alertMessage = `Consumo mensal global em ${gPct.toFixed(1)}% do teto global (${gHit}% atingido).`;
      }
    } else if (options.globalPolicy.dailyLimitUsd > 0) {
      const gDayPct = (globalDailySpentUsd / options.globalPolicy.dailyLimitUsd) * 100;
      const gDayHit = globalThresholds.filter((t) => gDayPct >= t).pop();
      if (gDayHit !== undefined) {
        alertMessage = `Consumo diário global em ${gDayPct.toFixed(1)}% do teto global (${gDayHit}% atingido).`;
      }
    }
  }

  return {
    allowed: true,
    alertMessage,
    dailySpentUsd,
    monthlySpentUsd,
    globalDailySpentUsd,
    globalMonthlySpentUsd,
  };
}

export function filterLogs(logs: AiUsageLog[], filter: UsageFilterOptions = {}): AiUsageLog[] {
  const period = filter.period || 'all';
  const now = new Date();
  const todayStr = now.toISOString().slice(0, 10);
  const yesterdayStr = new Date(now.getTime() - 86_400_000).toISOString().slice(0, 10);
  const currentMonthStr = todayStr.slice(0, 7);
  const prevMonthDate = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1));
  const prevMonthStr = prevMonthDate.toISOString().slice(0, 7);

  return logs.filter((l) => {
    const createdDate = l.createdAt.slice(0, 10);
    const createdTs = new Date(l.createdAt).getTime();

    if (period === 'today' && !l.createdAt.startsWith(todayStr)) return false;
    if (period === 'yesterday' && !l.createdAt.startsWith(yesterdayStr)) return false;
    if (period === '7d' && createdTs < now.getTime() - 7 * 86_400_000) return false;
    if (period === '30d' && createdTs < now.getTime() - 30 * 86_400_000) return false;
    if (period === 'current_month' && !l.createdAt.startsWith(currentMonthStr)) return false;
    if (period === 'previous_month' && !l.createdAt.startsWith(prevMonthStr)) return false;
    if (period === 'custom') {
      if (filter.startDate && createdDate < filter.startDate) return false;
      if (filter.endDate && createdDate > filter.endDate) return false;
    }

    if (filter.providerId && filter.providerId !== 'all' && l.providerId !== filter.providerId) return false;
    if (filter.modelId && filter.modelId !== 'all' && l.modelId !== filter.modelId) return false;
    if (filter.department && filter.department !== 'all' && l.department !== filter.department) return false;
    if (filter.action && filter.action !== 'all' && (l.action || l.purpose) !== filter.action) return false;
    if (filter.userId && filter.userId !== 'all' && l.userId !== filter.userId) return false;
    if (filter.clientId && filter.clientId !== 'all') {
      if (filter.clientId === 'internal') {
        if (l.clientId) return false;
      } else if (l.clientId !== filter.clientId) {
        return false;
      }
    }
    if (filter.status && filter.status !== 'all' && l.status !== filter.status) return false;
    if (filter.billingCategory && filter.billingCategory !== 'all') {
      const cat = l.billingCategory || (l.clientId ? 'client_included' : 'internal_agency');
      if (cat !== filter.billingCategory) return false;
    }

    return true;
  });
}

function percentile95(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const idx = Math.min(sorted.length - 1, Math.ceil(sorted.length * 0.95) - 1);
  return sorted[idx];
}

export function detectUsageAnomalies(
  orgLogs: AiUsageLog[],
  resolveCostFn: (l: AiUsageLog) => { costUsd: number; costBrl: number; reliable: boolean }
): AiAnomalyFinding[] {
  const anomalies: AiAnomalyFinding[] = [];
  const MIN_SAMPLE = 3;

  // 1. Action token spike (> 3x median / avg of other calls)
  const byAction: Record<string, AiUsageLog[]> = {};
  for (const l of orgLogs) {
    if (l.status !== 'success') continue;
    const act = l.action || l.purpose;
    if (!byAction[act]) byAction[act] = [];
    byAction[act].push(l);
  }

  for (const [act, arr] of Object.entries(byAction)) {
    if (arr.length < 2) continue;
    const tokenCounts = arr.map((x) => x.inputTokens + x.outputTokens);
    const maxTokens = Math.max(...tokenCounts);
    const sorted = [...tokenCounts].sort((a, b) => a - b);
    const baseline = sorted[Math.floor((sorted.length - 1) / 2)] || 0;
    if (baseline > 0 && maxTokens >= baseline * 3) {
      const confidence = arr.length >= MIN_SAMPLE ? 'confirmed' : 'possible';
      anomalies.push({
        id: `anom-action-${act}`,
        type: 'action_token_spike',
        confidence,
        severity: confidence === 'confirmed' ? 'critical' : 'warning',
        subject: act,
        title: `Pico de tokens na ação ${act}`,
        description: `Execução atingiu ${maxTokens.toLocaleString('pt-BR')} tokens vs mediana de ${baseline.toLocaleString('pt-BR')} tokens (${arr.length} amostras).`,
        sampleCount: arr.length,
        baselineValue: baseline,
        observedValue: maxTokens,
        detectedAt: arr[0].createdAt,
      });
    }
  }

  // 2. High burst by user (>= 10 calls inside 5 minutes)
  const byUser: Record<string, AiUsageLog[]> = {};
  for (const l of orgLogs) {
    if (!byUser[l.userId]) byUser[l.userId] = [];
    byUser[l.userId].push(l);
  }
  for (const [uid, arr] of Object.entries(byUser)) {
    if (arr.length < 10) continue;
    const times = arr.map((x) => new Date(x.createdAt).getTime()).sort((a, b) => a - b);
    for (let i = 0; i <= times.length - 10; i++) {
      if (times[i + 9] - times[i] <= 5 * 60_000) {
        anomalies.push({
          id: `anom-burst-${uid}`,
          type: 'user_burst',
          confidence: 'confirmed',
          severity: 'warning',
          subject: uid,
          title: `Rajada incomum de requisições por ${uid}`,
          description: `Pelo menos 10 requisições em janela inferior a 5 minutos.`,
          sampleCount: arr.length,
          baselineValue: 5,
          observedValue: 10,
          detectedAt: new Date(times[i + 9]).toISOString(),
        });
        break;
      }
    }
  }

  // 3. Client daily cost spike (> 3x client daily baseline)
  const byClientDay: Record<string, Record<string, number>> = {};
  for (const l of orgLogs) {
    if (!l.clientId || l.status !== 'success') continue;
    const day = l.createdAt.slice(0, 10);
    if (!byClientDay[l.clientId]) byClientDay[l.clientId] = {};
    byClientDay[l.clientId][day] = (byClientDay[l.clientId][day] || 0) + resolveCostFn(l).costUsd;
  }
  for (const [cid, dayMap] of Object.entries(byClientDay)) {
    const days = Object.values(dayMap);
    if (days.length < 2) continue;
    const maxDay = Math.max(...days);
    const others = days.filter((v) => v < maxDay);
    const avgOthers = others.length > 0 ? others.reduce((s, v) => s + v, 0) / others.length : 0;
    if (avgOthers > 0 && maxDay >= avgOthers * 3) {
      const confidence = days.length >= MIN_SAMPLE ? 'confirmed' : 'possible';
      anomalies.push({
        id: `anom-client-${cid}`,
        type: 'client_cost_spike',
        confidence,
        severity: confidence === 'confirmed' ? 'critical' : 'warning',
        subject: cid,
        title: `Disparo de custo de IA no cliente ${cid}`,
        description: `Gasto diário atingiu USD ${maxDay.toFixed(4)} vs média histórica de USD ${avgOthers.toFixed(4)}.`,
        sampleCount: days.length,
        baselineValue: Number(avgOthers.toFixed(6)),
        observedValue: Number(maxDay.toFixed(6)),
        detectedAt: new Date().toISOString(),
      });
    }
  }

  // 4. Retry storm / repeated error pattern (>= 4 non-success errors on same action)
  const errByAction: Record<string, number> = {};
  for (const l of orgLogs) {
    if (l.status === 'error' || l.status === 'rate_limited') {
      const key = `${l.department}:${l.action || l.purpose}`;
      errByAction[key] = (errByAction[key] || 0) + 1;
    }
  }
  for (const [key, cnt] of Object.entries(errByAction)) {
    if (cnt >= 4) {
      anomalies.push({
        id: `anom-retry-${key}`,
        type: 'retry_storm',
        confidence: cnt >= 5 ? 'confirmed' : 'possible',
        severity: 'warning',
        subject: key,
        title: `Possível loop de retentativas / falhas em ${key}`,
        description: `${cnt} execuções com erro ou rate limit detectadas no período analisado.`,
        sampleCount: cnt,
        baselineValue: 1,
        observedValue: cnt,
        detectedAt: new Date().toISOString(),
      });
    }
  }

  return anomalies;
}

export function buildUsageAnalytics(
  logs: AiUsageLog[],
  organizationId: string,
  models: AiModelEntry[] = [],
  policy?: AiCostPolicy,
  filterOrPeriod: UsagePeriodFilter | UsageFilterOptions = 'all',
  exchangeConfig?: AiExchangeConfig,
  _exceptions: AiLimitException[] = [],
  accountingAlerts: AiAccountingAlert[] = []
) {
  const filter: UsageFilterOptions =
    typeof filterOrPeriod === 'string' ? { period: filterOrPeriod } : filterOrPeriod;

  const fx = exchangeConfig && exchangeConfig.rate > 0 ? exchangeConfig : DEFAULT_EXCHANGE;
  const allOrgLogs = logs.filter((l) => l.organizationId === organizationId);
  const periodLogs = filterLogs(allOrgLogs, filter);

  const now = new Date();
  const todayPrefix = now.toISOString().slice(0, 10);
  const weekCutoff = now.getTime() - 7 * 86_400_000;
  const monthPrefix = now.toISOString().slice(0, 7);

  const resolveCost = (log: AiUsageLog): { costUsd: number; costBrl: number; reliable: boolean } => {
    if (typeof log.providerReportedCostUsd === 'number' && Number.isFinite(log.providerReportedCostUsd)) {
      const usd = log.providerReportedCostUsd;
      return { costUsd: usd, costBrl: Number((usd * fx.rate).toFixed(4)), reliable: true };
    }
    if (log.usageStatus === 'unavailable') {
      return { costUsd: 0, costBrl: 0, reliable: false };
    }
    if (models.length > 0) {
      const calc = estimateRequestCost(
        models,
        log.providerId,
        log.modelId,
        log.inputTokens,
        log.outputTokens,
        null,
        log.cachedInputTokens ?? log.cachedTokens ?? 0,
        log.reasoningTokens ?? 0,
        true,
        fx
      );
      if (calc.estimatedCostUsd !== null) {
        return {
          costUsd: calc.estimatedCostUsd,
          costBrl: calc.totalCostBRL ?? Number((calc.estimatedCostUsd * fx.rate).toFixed(4)),
          reliable: calc.costReliable,
        };
      }
      return { costUsd: 0, costBrl: 0, reliable: false };
    }
    if (log.estimatedCostUsd !== null && log.estimatedCostUsd !== undefined) {
      return {
        costUsd: log.estimatedCostUsd,
        costBrl: Number((log.estimatedCostUsd * fx.rate).toFixed(4)),
        reliable: log.costReliable,
      };
    }
    return { costUsd: 0, costBrl: 0, reliable: false };
  };

  const todayLogsAll = allOrgLogs.filter((l) => l.createdAt.startsWith(todayPrefix));
  const weekLogsAll = allOrgLogs.filter((l) => new Date(l.createdAt).getTime() >= weekCutoff);
  const monthLogsAll = allOrgLogs.filter((l) => l.createdAt.startsWith(monthPrefix));

  const dailyCostUsd = Number(todayLogsAll.reduce((s, l) => s + resolveCost(l).costUsd, 0).toFixed(6));
  const weeklyCostUsd = Number(weekLogsAll.reduce((s, l) => s + resolveCost(l).costUsd, 0).toFixed(6));
  const monthlyCostUsd = Number(monthLogsAll.reduce((s, l) => s + resolveCost(l).costUsd, 0).toFixed(6));

  const dailyCostBrl = Number((dailyCostUsd * fx.rate).toFixed(4));
  const weeklyCostBrl = Number((weeklyCostUsd * fx.rate).toFixed(4));
  const monthlyCostBrl = Number((monthlyCostUsd * fx.rate).toFixed(4));

  // Run-rate projections: current month end + next 30d + daily 24h pace
  const dayOfMonth = Math.max(1, now.getUTCDate());
  const daysInMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0)).getUTCDate();
  const hoursElapsedToday = Math.max(1, now.getUTCHours() + now.getUTCMinutes() / 60);
  const projectedDailyUsd = Number(((dailyCostUsd / hoursElapsedToday) * 24).toFixed(6));
  const projectedDailyBrl = Number((projectedDailyUsd * fx.rate).toFixed(4));
  const projectedMonthEndUsd = Number(((monthlyCostUsd / dayOfMonth) * daysInMonth).toFixed(6));
  const projectedMonthEndBrl = Number((projectedMonthEndUsd * fx.rate).toFixed(4));
  const projectedNextMonthUsd = Number(((monthlyCostUsd / dayOfMonth) * 30).toFixed(6));
  const projectedNextMonthBrl = Number((projectedNextMonthUsd * fx.rate).toFixed(4));

  const successLogs = periodLogs.filter((l) => l.status === 'success');
  const errorLogs = periodLogs.filter((l) => l.status !== 'success');
  const budgetBlockedLogs = periodLogs.filter((l) => l.status === 'budget_blocked');

  const totalRequests = periodLogs.length;
  const totalInputTokens = periodLogs.reduce((s, l) => s + l.inputTokens, 0);
  const totalOutputTokens = periodLogs.reduce((s, l) => s + l.outputTokens, 0);
  const totalCachedInputTokens = periodLogs.reduce(
    (s, l) => s + (l.cachedInputTokens ?? l.cachedTokens ?? 0),
    0
  );
  const totalReasoningTokens = periodLogs.reduce((s, l) => s + (l.reasoningTokens ?? 0), 0);
  const totalTokens = totalInputTokens + totalOutputTokens;

  let unpricedRequestsCount = 0;
  let unavailableUsageCount = 0;
  const unpricedModelsSet = new Set<string>();
  let totalCostAccumulator = 0;

  for (const l of periodLogs) {
    if (l.usageStatus === 'unavailable' && l.status === 'success') {
      unavailableUsageCount += 1;
    }
    const c = resolveCost(l);
    totalCostAccumulator += c.costUsd;
    if (!c.reliable && l.status === 'success') {
      unpricedRequestsCount += 1;
      unpricedModelsSet.add(`${l.providerId}/${l.modelId}`);
    }
  }

  const totalCostUsd = Number(totalCostAccumulator.toFixed(6));
  const totalCostBrl = Number((totalCostUsd * fx.rate).toFixed(4));
  const avgCostPerRequestUsd = totalRequests > 0 ? Number((totalCostUsd / totalRequests).toFixed(6)) : 0;
  const avgCostPerRequestBrl = Number((avgCostPerRequestUsd * fx.rate).toFixed(4));

  const avgLatencyMs =
    totalRequests > 0 ? Math.round(periodLogs.reduce((s, l) => s + l.latencyMs, 0) / totalRequests) : 0;
  const successRatePct =
    totalRequests > 0 ? Number(((successLogs.length / totalRequests) * 100).toFixed(1)) : 100;

  const anomalies = detectUsageAnomalies(allOrgLogs, resolveCost);
  const anomalyActionSet = new Set(
    anomalies.filter((a) => a.type === 'action_token_spike').map((a) => a.subject)
  );

  const groupBy = <T extends string>(getter: (l: AiUsageLog) => T, includeActions = false): UsageSegmentRow[] => {
    const map: Record<
      string,
      Omit<UsageSegmentRow, 'key' | 'sharePct' | 'avgCostPerRequestUsd' | 'avgLatencyMs' | 'successRatePct'> & {
        latencySum: number;
        actionsMap: Record<string, { action: string; requests: number; tokens: number; costUsd: number; costBrl: number }>;
      }
    > = {};

    for (const log of periodLogs) {
      const k = getter(log) || 'N/A';
      if (!map[k]) {
        map[k] = {
          requests: 0,
          successCount: 0,
          inputTokens: 0,
          outputTokens: 0,
          cachedInputTokens: 0,
          reasoningTokens: 0,
          tokens: 0,
          costUsd: 0,
          costBrl: 0,
          costReliableCount: 0,
          unpricedRequests: 0,
          errors: 0,
          budgetBlocked: 0,
          latencySum: 0,
          actionsMap: {},
        };
      }
      const c = resolveCost(log);
      const cached = log.cachedInputTokens ?? log.cachedTokens ?? 0;
      const reason = log.reasoningTokens ?? 0;
      map[k].requests += 1;
      if (log.status === 'success') map[k].successCount += 1;
      map[k].inputTokens += log.inputTokens;
      map[k].outputTokens += log.outputTokens;
      map[k].cachedInputTokens += cached;
      map[k].reasoningTokens += reason;
      map[k].tokens += log.inputTokens + log.outputTokens;
      map[k].costUsd = Number((map[k].costUsd + c.costUsd).toFixed(6));
      map[k].costBrl = Number((map[k].costUsd * fx.rate).toFixed(4));
      map[k].latencySum += log.latencyMs;
      if (c.reliable) map[k].costReliableCount += 1;
      else if (log.status === 'success') map[k].unpricedRequests += 1;
      if (log.status !== 'success') map[k].errors += 1;
      if (log.status === 'budget_blocked') map[k].budgetBlocked += 1;

      if (includeActions) {
        const act = log.action || log.purpose;
        if (!map[k].actionsMap[act]) {
          map[k].actionsMap[act] = { action: act, requests: 0, tokens: 0, costUsd: 0, costBrl: 0 };
        }
        map[k].actionsMap[act].requests += 1;
        map[k].actionsMap[act].tokens += log.inputTokens + log.outputTokens;
        map[k].actionsMap[act].costUsd = Number((map[k].actionsMap[act].costUsd + c.costUsd).toFixed(6));
        map[k].actionsMap[act].costBrl = Number((map[k].actionsMap[act].costUsd * fx.rate).toFixed(4));
      }
    }

    return Object.entries(map)
      .map(([key, stats]) => ({
        key,
        requests: stats.requests,
        successCount: stats.successCount,
        inputTokens: stats.inputTokens,
        outputTokens: stats.outputTokens,
        cachedInputTokens: stats.cachedInputTokens,
        reasoningTokens: stats.reasoningTokens,
        tokens: stats.tokens,
        costUsd: stats.costUsd,
        costBrl: stats.costBrl,
        avgCostPerRequestUsd: stats.requests > 0 ? Number((stats.costUsd / stats.requests).toFixed(6)) : 0,
        avgLatencyMs: stats.requests > 0 ? Math.round(stats.latencySum / stats.requests) : 0,
        successRatePct: stats.requests > 0 ? Number(((stats.successCount / stats.requests) * 100).toFixed(1)) : 100,
        costReliableCount: stats.costReliableCount,
        unpricedRequests: stats.unpricedRequests,
        errors: stats.errors,
        budgetBlocked: stats.budgetBlocked,
        sharePct: totalCostUsd > 0 ? Number(((stats.costUsd / totalCostUsd) * 100).toFixed(1)) : 0,
        ...(includeActions
          ? {
              actions: Object.values(stats.actionsMap).sort((a, b) => b.costUsd - a.costUsd || b.tokens - a.tokens),
            }
          : {}),
      }))
      .sort((a, b) => b.costUsd - a.costUsd || b.tokens - a.tokens);
  };

  // Detailed Action Consumption & Model Comparison Analysis
  const actionBuckets: Record<string, AiUsageLog[]> = {};
  for (const log of periodLogs) {
    const act = log.action || log.purpose;
    if (!actionBuckets[act]) actionBuckets[act] = [];
    actionBuckets[act].push(log);
  }
  const byAction: ActionAnalyticsRow[] = Object.entries(actionBuckets)
    .map(([act, arr]) => {
      let costSum = 0;
      let successCost = 0;
      let errorCost = 0;
      let reliableCount = 0;
      let unpriced = 0;
      let errors = 0;
      let blocked = 0;
      let latSum = 0;
      let inSum = 0;
      let outSum = 0;
      let cacheSum = 0;
      let reasonSum = 0;
      const tokenSamples: number[] = [];
      const modelMap: Record<
        string,
        { providerId: string; modelId: string; requests: number; tokens: number; costUsd: number; latencySum: number }
      > = {};
      const dayMap: Record<string, { date: string; requests: number; tokens: number; costUsd: number }> = {};

      for (const l of arr) {
        const c = resolveCost(l);
        const tot = l.inputTokens + l.outputTokens;
        inSum += l.inputTokens;
        outSum += l.outputTokens;
        cacheSum += l.cachedInputTokens ?? l.cachedTokens ?? 0;
        reasonSum += l.reasoningTokens ?? 0;
        latSum += l.latencyMs;
        costSum += c.costUsd;
        if (l.status === 'success') {
          successCost += c.costUsd;
          tokenSamples.push(tot);
        } else {
          errors += 1;
          errorCost += c.costUsd;
        }
        if (l.status === 'budget_blocked') blocked += 1;
        if (c.reliable) reliableCount += 1;
        else if (l.status === 'success') unpriced += 1;

        const mKey = `${l.providerId}/${l.modelId}`;
        if (!modelMap[mKey]) {
          modelMap[mKey] = {
            providerId: l.providerId,
            modelId: l.modelId,
            requests: 0,
            tokens: 0,
            costUsd: 0,
            latencySum: 0,
          };
        }
        modelMap[mKey].requests += 1;
        modelMap[mKey].tokens += tot;
        modelMap[mKey].costUsd = Number((modelMap[mKey].costUsd + c.costUsd).toFixed(6));
        modelMap[mKey].latencySum += l.latencyMs;

        const day = l.createdAt.slice(0, 10);
        if (!dayMap[day]) dayMap[day] = { date: day, requests: 0, tokens: 0, costUsd: 0 };
        dayMap[day].requests += 1;
        dayMap[day].tokens += tot;
        dayMap[day].costUsd = Number((dayMap[day].costUsd + c.costUsd).toFixed(6));
      }

      const finalCost = Number(costSum.toFixed(6));
      const finalBrl = Number((finalCost * fx.rate).toFixed(4));
      const succCnt = arr.length - errors;
      return {
        key: act,
        department: arr[0]?.department || 'NER AI Center',
        requests: arr.length,
        successCount: succCnt,
        inputTokens: inSum,
        outputTokens: outSum,
        cachedInputTokens: cacheSum,
        reasoningTokens: reasonSum,
        tokens: inSum + outSum,
        avgTokensPerRequest: arr.length > 0 ? Math.round((inSum + outSum) / arr.length) : 0,
        p95Tokens: percentile95(tokenSamples),
        costUsd: finalCost,
        costBrl: finalBrl,
        successCostUsd: Number(successCost.toFixed(6)),
        errorCostUsd: Number(errorCost.toFixed(6)),
        avgCostPerRequestUsd: arr.length > 0 ? Number((finalCost / arr.length).toFixed(6)) : 0,
        avgLatencyMs: arr.length > 0 ? Math.round(latSum / arr.length) : 0,
        successRatePct: arr.length > 0 ? Number(((succCnt / arr.length) * 100).toFixed(1)) : 100,
        costReliableCount: reliableCount,
        unpricedRequests: unpriced,
        errors,
        budgetBlocked: blocked,
        sharePct: totalCostUsd > 0 ? Number(((finalCost / totalCostUsd) * 100).toFixed(1)) : 0,
        anomalyDetected: anomalyActionSet.has(act),
        modelBreakdown: Object.entries(modelMap)
          .map(([modelKey, m]) => ({
            modelKey,
            providerId: m.providerId,
            modelId: m.modelId,
            requests: m.requests,
            avgTokens: m.requests > 0 ? Math.round(m.tokens / m.requests) : 0,
            avgCostUsd: m.requests > 0 ? Number((m.costUsd / m.requests).toFixed(6)) : 0,
            totalCostUsd: m.costUsd,
            totalCostBrl: Number((m.costUsd * fx.rate).toFixed(4)),
            avgLatencyMs: m.requests > 0 ? Math.round(m.latencySum / m.requests) : 0,
          }))
          .sort((a, b) => a.avgCostUsd - b.avgCostUsd),
        dailyEvolution: Object.values(dayMap).sort((a, b) => a.date.localeCompare(b.date)),
      };
    })
    .sort((a, b) => b.costUsd - a.costUsd || b.tokens - a.tokens);

  // Client cost breakdown separating billingCategory cleanly (never mixed with agency revenue)
  const clientBuckets: Record<string, AiUsageLog[]> = {};
  for (const l of periodLogs) {
    const cid = l.clientId || 'Agência (Interno)';
    if (!clientBuckets[cid]) clientBuckets[cid] = [];
    clientBuckets[cid].push(l);
  }
  const byClient: ClientAnalyticsRow[] = Object.entries(clientBuckets)
    .map(([cid, arr]) => {
      const catInit = () => ({ requests: 0, costUsd: 0, costBrl: 0 });
      const byCategory: Record<AiBillingCategory, { requests: number; costUsd: number; costBrl: number }> = {
        internal_agency: catInit(),
        client_included: catInit(),
        client_additional: catInit(),
        client_overage: catInit(),
      };
      const deptCount: Record<string, number> = {};
      let costSum = 0;
      let inSum = 0;
      let outSum = 0;
      let cacheSum = 0;
      let reasonSum = 0;
      let latSum = 0;
      let errors = 0;
      let blocked = 0;
      let reliableCount = 0;
      let unpriced = 0;

      for (const l of arr) {
        const c = resolveCost(l);
        const cat: AiBillingCategory =
          l.billingCategory || (l.clientId ? 'client_included' : 'internal_agency');
        byCategory[cat].requests += 1;
        byCategory[cat].costUsd = Number((byCategory[cat].costUsd + c.costUsd).toFixed(6));
        byCategory[cat].costBrl = Number((byCategory[cat].costUsd * fx.rate).toFixed(4));
        deptCount[l.department] = (deptCount[l.department] || 0) + 1;

        costSum += c.costUsd;
        inSum += l.inputTokens;
        outSum += l.outputTokens;
        cacheSum += l.cachedInputTokens ?? l.cachedTokens ?? 0;
        reasonSum += l.reasoningTokens ?? 0;
        latSum += l.latencyMs;
        if (l.status !== 'success') errors += 1;
        if (l.status === 'budget_blocked') blocked += 1;
        if (c.reliable) reliableCount += 1;
        else if (l.status === 'success') unpriced += 1;
      }
      const topDepartment = Object.entries(deptCount).sort((a, b) => b[1] - a[1])[0]?.[0] || '—';
      const finalCost = Number(costSum.toFixed(6));
      return {
        key: cid,
        clientId: cid,
        topDepartment,
        byCategory,
        requests: arr.length,
        successCount: arr.length - errors,
        inputTokens: inSum,
        outputTokens: outSum,
        cachedInputTokens: cacheSum,
        reasoningTokens: reasonSum,
        tokens: inSum + outSum,
        costUsd: finalCost,
        costBrl: Number((finalCost * fx.rate).toFixed(4)),
        avgCostPerRequestUsd: arr.length > 0 ? Number((finalCost / arr.length).toFixed(6)) : 0,
        avgLatencyMs: arr.length > 0 ? Math.round(latSum / arr.length) : 0,
        successRatePct: arr.length > 0 ? Number((((arr.length - errors) / arr.length) * 100).toFixed(1)) : 100,
        costReliableCount: reliableCount,
        unpricedRequests: unpriced,
        errors,
        budgetBlocked: blocked,
        sharePct: totalCostUsd > 0 ? Number(((finalCost / totalCostUsd) * 100).toFixed(1)) : 0,
      };
    })
    .sort((a, b) => b.costUsd - a.costUsd || b.tokens - a.tokens);

  // Daily trend series
  const dailyMap: Record<string, { date: string; requests: number; tokens: number; costUsd: number; costBrl: number }> = {};
  for (const log of periodLogs) {
    const day = log.createdAt.slice(0, 10);
    if (!dailyMap[day]) dailyMap[day] = { date: day, requests: 0, tokens: 0, costUsd: 0, costBrl: 0 };
    dailyMap[day].requests += 1;
    dailyMap[day].tokens += log.inputTokens + log.outputTokens;
    dailyMap[day].costUsd = Number((dailyMap[day].costUsd + resolveCost(log).costUsd).toFixed(6));
    dailyMap[day].costBrl = Number((dailyMap[day].costUsd * fx.rate).toFixed(4));
  }
  const dailySeries = Object.values(dailyMap).sort((a, b) => a.date.localeCompare(b.date));

  // Alerts across 50 / 75 / 90 / 100% thresholds & multi-scope caps
  const alerts: AiUsageAlert[] = [];
  if (policy) {
    const thresholds = (policy.alertThresholds?.length ? policy.alertThresholds : [50, 75, 90, 100]).sort(
      (a, b) => a - b
    );
    const rulesByPct = new Map(
      (policy.thresholdRules || []).map((r) => [r.thresholdPct, r])
    );
    const evaluateLimitAlert = (
      id: string,
      scope: AiUsageAlert['scope'],
      label: string,
      spent: number,
      cap: number,
      dept?: string
    ) => {
      if (!cap || cap <= 0) return;
      const pct = Number(((spent / cap) * 100).toFixed(1));
      const highestThreshold = thresholds.filter((t) => pct >= t).pop();
      const customMin = policy.alertThresholdPct || 80;
      if (pct >= 100 || (highestThreshold !== undefined && highestThreshold >= 50) || pct >= customMin) {
        const effectiveThreshold = pct >= 100 ? 100 : highestThreshold ?? customMin;
        const matchedRule = rulesByPct.get(effectiveThreshold as 50 | 75 | 90 | 100);
        const defaultMsg = `Consumo de ${label}: USD ${spent.toFixed(4)} / USD ${cap.toFixed(2)} (${pct}%).`;
        alerts.push({
          id,
          severity: matchedRule?.severity || (pct >= 100 ? 'critical' : pct >= 75 ? 'warning' : 'info'),
          scope,
          thresholdPct: effectiveThreshold,
          department: dept,
          title:
            pct >= 100
              ? `Limite atingido/excedido (${label})`
              : `Marco de ${effectiveThreshold}% atingido (${label})`,
          message: matchedRule?.customMessage
            ? `${matchedRule.customMessage} — ${defaultMsg}`
            : defaultMsg,
          currentValueUsd: Number(spent.toFixed(6)),
          limitValueUsd: cap,
          percentageUsed: pct,
        });
      }
    };

    evaluateLimitAlert('alert-org-daily', 'organization_daily', 'Organização Diário', dailyCostUsd, policy.dailyLimitUsd);
    evaluateLimitAlert(
      'alert-org-monthly',
      'organization_monthly',
      'Organização Mensal',
      monthlyCostUsd,
      policy.monthlyLimitUsd
    );

    for (const [dept, cap] of Object.entries(policy.departmentLimitsUsd || {})) {
      if (!cap || cap <= 0) continue;
      const spent = todayLogsAll
        .filter((l) => l.department === dept && l.status === 'success')
        .reduce((s, l) => s + resolveCost(l).costUsd, 0);
      evaluateLimitAlert(`alert-dept-${dept}`, 'department_daily', dept, spent, cap, dept);
    }

    for (const [prov, cap] of Object.entries(policy.providerLimitsUsd || {})) {
      if (!cap || cap <= 0) continue;
      const spent = todayLogsAll
        .filter((l) => l.providerId === prov && l.status === 'success')
        .reduce((s, l) => s + resolveCost(l).costUsd, 0);
      evaluateLimitAlert(`alert-prov-${prov}`, 'provider_daily', `Provedor ${prov}`, spent, cap);
    }

    for (const [modKey, cap] of Object.entries(policy.modelLimitsUsd || {})) {
      if (!cap || cap <= 0) continue;
      const spent = todayLogsAll
        .filter((l) => (`${l.providerId}/${l.modelId}` === modKey || l.modelId === modKey) && l.status === 'success')
        .reduce((s, l) => s + resolveCost(l).costUsd, 0);
      evaluateLimitAlert(`alert-model-${modKey}`, 'model_daily', `Modelo ${modKey}`, spent, cap);
    }

    for (const [actKey, cap] of Object.entries(policy.actionLimitsUsd || {})) {
      if (!cap || cap <= 0) continue;
      const spent = todayLogsAll
        .filter((l) => (l.action || l.purpose) === actKey && l.status === 'success')
        .reduce((s, l) => s + resolveCost(l).costUsd, 0);
      evaluateLimitAlert(`alert-act-${actKey}`, 'action_daily', `Ação ${actKey}`, spent, cap);
    }

    // Projected-cost alerts against configured limits (50 / 75 / 90 / 100%)
    const thresholdRuleMap = new Map(
      (policy.thresholdRules || []).map((r) => [r.thresholdPct, r])
    );
    const evaluateProjectedAlert = (
      id: string,
      scope: 'projected_daily' | 'projected_monthly' | 'projected_department' | 'projected_provider',
      label: string,
      projectedUsd: number,
      cap: number,
      dept?: string
    ) => {
      if (!cap || cap <= 0 || projectedUsd <= 0) return;
      const pct = Number(((projectedUsd / cap) * 100).toFixed(1));
      const hit = thresholds.filter((t) => pct >= t).pop();
      if (hit !== undefined) {
        const rule = thresholdRuleMap.get(hit as 50 | 75 | 90 | 100);
        if (rule && rule.enabled === false) return;
        const severity: 'critical' | 'warning' | 'info' =
          rule?.severity || (pct >= 100 ? 'critical' : pct >= 75 ? 'warning' : 'info');
        const baseMsg = `Custo projetado de ${label}: USD ${projectedUsd.toFixed(4)} vs limite USD ${cap.toFixed(2)} (${pct}%).`;
        alerts.push({
          id,
          severity,
          scope,
          isProjected: true,
          thresholdPct: hit,
          department: dept,
          title:
            pct >= 100
              ? `Projeção ultrapassa 100% do limite (${label})`
              : `Projeção atinge marco de ${hit}% (${label})`,
          message: rule?.customMessage ? `${baseMsg} ${rule.customMessage}` : baseMsg,
          currentValueUsd: projectedUsd,
          limitValueUsd: cap,
          percentageUsed: pct,
        });
      }
    };

    evaluateProjectedAlert(
      'alert-proj-daily',
      'projected_daily',
      'Projeção Diária (24h)',
      projectedDailyUsd,
      policy.dailyLimitUsd
    );
    evaluateProjectedAlert(
      'alert-proj-monthly',
      'projected_monthly',
      'Projeção Fim do Mês',
      projectedMonthEndUsd,
      policy.monthlyLimitUsd
    );
    for (const [dept, cap] of Object.entries(policy.departmentLimitsUsd || {})) {
      if (!cap || cap <= 0) continue;
      const spentToday = todayLogsAll
        .filter((l) => l.department === dept && l.status === 'success')
        .reduce((s, l) => s + resolveCost(l).costUsd, 0);
      const projDeptUsd = Number(((spentToday / hoursElapsedToday) * 24).toFixed(6));
      evaluateProjectedAlert(
        `alert-proj-dept-${dept}`,
        'projected_department',
        `Projeção 24h • ${dept}`,
        projDeptUsd,
        cap,
        dept
      );
    }
    for (const [prov, cap] of Object.entries(policy.providerLimitsUsd || {})) {
      if (!cap || cap <= 0) continue;
      const spentToday = todayLogsAll
        .filter((l) => l.providerId === prov && l.status === 'success')
        .reduce((s, l) => s + resolveCost(l).costUsd, 0);
      const projProvUsd = Number(((spentToday / hoursElapsedToday) * 24).toFixed(6));
      evaluateProjectedAlert(
        `alert-proj-prov-${prov}`,
        'projected_provider',
        `Projeção 24h • Provedor ${prov}`,
        projProvUsd,
        cap
      );
    }
  }

  // Per-model daily token limit alerts (near-limit & exceeded)
  const modelTokenProgress: {
    id: string;
    providerId: string;
    modelId: string;
    displayName: string;
    usedTokensToday: number;
    dailyTokenLimit: number;
    percentageUsed: number;
  }[] = [];

  for (const m of models) {
    const usedTokensToday = todayLogsAll
      .filter((l) => l.providerId === m.providerId && l.modelId === m.modelId && l.status === 'success')
      .reduce((s, l) => s + l.inputTokens + l.outputTokens, 0);
    if (m.dailyTokenLimit && m.dailyTokenLimit > 0) {
      const pct = Number(((usedTokensToday / m.dailyTokenLimit) * 100).toFixed(1));
      modelTokenProgress.push({
        id: m.id,
        providerId: m.providerId,
        modelId: m.modelId,
        displayName: m.displayName,
        usedTokensToday,
        dailyTokenLimit: m.dailyTokenLimit,
        percentageUsed: pct,
      });
      if (pct >= 50) {
        const thresholdHit = pct >= 100 ? 100 : pct >= 90 ? 90 : pct >= 75 ? 75 : 50;
        alerts.push({
          id: `alert-model-tok-${m.id}`,
          severity: pct >= 100 ? 'critical' : pct >= 75 ? 'warning' : 'info',
          scope: 'model_token_daily',
          thresholdPct: thresholdHit,
          title:
            pct >= 100
              ? `Limite diário de tokens excedido (${m.modelId})`
              : `Uso de tokens próximo do limite (${m.modelId})`,
          message: `Modelo ${m.providerId}/${m.modelId} consumiu ${usedTokensToday.toLocaleString('pt-BR')} de ${m.dailyTokenLimit.toLocaleString('pt-BR')} tokens hoje (${pct}%).`,
          percentageUsed: pct,
        });
      }
    }
  }

  if (budgetBlockedLogs.length > 0) {
    alerts.push({
      id: 'alert-budget-blocked-logs',
      severity: 'critical',
      scope: 'budget_blocked',
      title: `${budgetBlockedLogs.length} requisição(ões) bloqueada(s) por orçamento`,
      message: `Último bloqueio registrado em ${new Date(budgetBlockedLogs[0].createdAt).toLocaleString('pt-BR')}: ${budgetBlockedLogs[0].errorMessage || 'Teto de gasto atingido.'}`,
    });
  }

  if (unpricedRequestsCount > 0) {
    const list = Array.from(unpricedModelsSet).join(', ');
    alerts.push({
      id: 'alert-unpriced-models',
      severity: 'info',
      scope: 'unpriced_models',
      title: `${unpricedRequestsCount} execução(ões) sem cálculo completo de custo`,
      message: `Verifique tarifas na Tabela de Preços para: ${list}.`,
    });
  }

  if (unavailableUsageCount > 0) {
    alerts.push({
      id: 'alert-unavailable-tokens',
      severity: 'warning',
      scope: 'unavailable_tokens',
      title: `${unavailableUsageCount} execução(ões) com telemetria de tokens indisponível pelo provedor`,
      message: `Provedor não retornou usage metadata; os tokens não foram inventados (status: indisponível).`,
    });
  }

  const openAccAlerts = accountingAlerts.filter((a) => a.organizationId === organizationId && !a.resolved);
  if (openAccAlerts.length > 0) {
    alerts.push({
      id: 'alert-accounting-reconcile',
      severity: 'warning',
      scope: 'accounting_failure',
      title: `${openAccAlerts.length} registro(s) pendente(s) de reconciliação contábil`,
      message: openAccAlerts[0].message,
    });
  }

  return {
    period: filter.period || 'all',
    exchangeConfig: fx,
    summary: {
      totalRequests,
      requestsToday: todayLogsAll.length,
      totalInputTokens,
      totalOutputTokens,
      totalCachedInputTokens,
      totalReasoningTokens,
      totalTokens,
      totalCostUsd,
      totalCostBrl,
      dailyCostUsd,
      dailyCostBrl,
      weeklyCostUsd,
      weeklyCostBrl,
      monthlyCostUsd,
      monthlyCostBrl,
      projectedNextMonthUsd,
      projectedNextMonthBrl,
      avgCostPerRequestUsd,
      avgCostPerRequestBrl,
      successCount: successLogs.length,
      errorCount: errorLogs.length,
      budgetBlockedCount: budgetBlockedLogs.length,
      unpricedRequestsCount,
      unavailableUsageCount,
      successRatePct,
      avgLatencyMs,
    },
    budgetProgress: policy
      ? {
          dailySpentUsd: dailyCostUsd,
          dailySpentBrl: dailyCostBrl,
          dailyLimitUsd: policy.dailyLimitUsd,
          dailyPct: policy.dailyLimitUsd > 0 ? Number(((dailyCostUsd / policy.dailyLimitUsd) * 100).toFixed(1)) : 0,
          projectedDailyUsd,
          projectedDailyBrl,
          projectedDailyPct:
            policy.dailyLimitUsd > 0 ? Number(((projectedDailyUsd / policy.dailyLimitUsd) * 100).toFixed(1)) : 0,
          monthlySpentUsd: monthlyCostUsd,
          monthlySpentBrl: monthlyCostBrl,
          monthlyLimitUsd: policy.monthlyLimitUsd,
          monthlyPct:
            policy.monthlyLimitUsd > 0 ? Number(((monthlyCostUsd / policy.monthlyLimitUsd) * 100).toFixed(1)) : 0,
          projectedMonthEndUsd,
          projectedMonthEndBrl,
          projectedMonthlyPct:
            policy.monthlyLimitUsd > 0
              ? Number(((projectedMonthEndUsd / policy.monthlyLimitUsd) * 100).toFixed(1))
              : 0,
          alertThresholdPct: policy.alertThresholdPct,
          alertThresholds: policy.alertThresholds || [50, 75, 90, 100],
          onExceedAction: policy.onExceedAction || (policy.blockOnExceed ? 'block_non_essential' : 'notify'),
        }
      : null,
    modelTokenProgress,
    alerts,
    anomalies,
    unpricedModels: Array.from(unpricedModelsSet),
    dailySeries,
    byProvider: groupBy((l) => l.providerId),
    byModel: groupBy((l) => `${l.providerId}/${l.modelId}`),
    byDepartment: groupBy((l) => l.department, true),
    byAction,
    byClient,
    byBillingCategory: groupBy((l) => l.billingCategory || (l.clientId ? 'client_included' : 'internal_agency')),
    byUser: groupBy((l) => l.userId),
  };
}
