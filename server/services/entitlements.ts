import { PersistentStore } from '../store.ts';
import { CommercialPlan, SaaSSubscription } from '../types.ts';

export type EntitlementDenialCode =
  | 'ORG_NOT_FOUND'
  | 'ORG_SUSPENDED'
  | 'NO_SUBSCRIPTION'
  | 'SUBSCRIPTION_PAST_DUE'
  | 'SUBSCRIPTION_CANCELED'
  | 'SUBSCRIPTION_INCOMPLETE'
  | 'SUBSCRIPTION_EXPIRED'
  | 'PLAN_USER_LIMIT_EXCEEDED'
  | 'PLAN_LANDING_PAGE_LIMIT_EXCEEDED'
  | 'PLAN_SITE_LIMIT_EXCEEDED'
  | 'FEATURE_NOT_IN_PLAN';

export type QuotaResourceType = 'users' | 'landingPages' | 'sites' | 'feature';

export type PlanFeatureKey =
  | 'customDomain'
  | 'multiSite'
  | 'aiGateway'
  | 'capiTracking'
  | 'clientPortal';

export interface OrganizationEntitlements {
  organizationId: string;
  organizationStatus: 'Ativo' | 'Suspenso' | 'Inexistente';
  subscriptionStatus: SaaSSubscription['status'] | 'expired' | 'none';
  rawSubscriptionStatus: SaaSSubscription['status'] | 'none';
  planCode: string;
  planName: string;
  currentPeriodEnd: string | null;
  isExpired: boolean;
  isSuspended: boolean;
  isDelinquent: boolean;
  isCanceled: boolean;
  isEntitled: boolean;
  denialCode: EntitlementDenialCode | null;
  denialReason: string | null;
  limits: CommercialPlan['limits'];
  usage: {
    users: number;
    landingPages: number;
    sites: number;
    totalPages: number;
  };
  remaining: {
    users: number;
    landingPages: number;
    sites: number;
  };
  features: Record<PlanFeatureKey, boolean>;
  warnings: string[];
  upgradeRecommended: boolean;
}

export type EntitlementCheckResult =
  | {
      allowed: true;
      entitlements: OrganizationEntitlements;
    }
  | {
      allowed: false;
      httpStatus: 402 | 403;
      code: EntitlementDenialCode;
      error: string;
      entitlements: OrganizationEntitlements;
    };

// Per-organization async mutex queue to prevent concurrent requests from racing past quota limits
const orgQuotaLocks = new Map<string, Promise<void>>();

export async function withOrgQuotaLock<T>(
  organizationId: string,
  fn: () => T | Promise<T>
): Promise<T> {
  const previous = orgQuotaLocks.get(organizationId) || Promise.resolve();
  let release!: () => void;
  const current = new Promise<void>((resolve) => {
    release = resolve;
  });
  const chained = previous.then(() => current);
  orgQuotaLocks.set(organizationId, chained);

  await previous;
  try {
    return await fn();
  } finally {
    release();
    if (orgQuotaLocks.get(organizationId) === chained) {
      orgQuotaLocks.delete(organizationId);
    }
  }
}

export function classifyWebPageQuotaResource(pageType?: string | null): 'landingPages' | 'sites' {
  if (!pageType || pageType.toLowerCase().includes('landing')) {
    return 'landingPages';
  }
  return 'sites';
}

function resolvePlanFeatures(
  isEntitled: boolean,
  plan: CommercialPlan | null
): Record<PlanFeatureKey, boolean> {
  if (!isEntitled || !plan) {
    return {
      customDomain: false,
      multiSite: false,
      aiGateway: false,
      capiTracking: false,
      clientPortal: false,
    };
  }
  return {
    customDomain: plan.limits.landingPages >= 1 || plan.limits.sites >= 1,
    multiSite: plan.limits.sites >= 1,
    aiGateway: plan.limits.users >= 2 || plan.recurringPrice >= 199,
    capiTracking: plan.limits.landingPages >= 2 || plan.recurringPrice >= 299,
    clientPortal: plan.limits.users >= 2,
  };
}

export function evaluateOrganizationEntitlements(
  store: PersistentStore,
  organizationId: string,
  nowMs: number = Date.now()
): OrganizationEntitlements {
  const state = store.getState();
  const org = state.organizations.find((o) => o.id === organizationId) || null;
  const sub = state.subscriptions.find((s) => s.organizationId === organizationId) || null;
  const plan = sub ? state.commercialPlans.find((p) => p.code === sub.planCode) || null : null;

  // Count only active users and active (non-archived) web pages
  const orgUsers = state.users.filter(
    (u) => u.organizationId === organizationId && u.status === 'Ativo'
  ).length;
  const orgWebPages = state.webPages.filter(
    (w) => w.organizationId === organizationId && !w.archivedAt
  );
  const landingPagesCount = orgWebPages.filter(
    (w) => classifyWebPageQuotaResource(w.pageType) === 'landingPages'
  ).length;
  const sitesCount = orgWebPages.filter(
    (w) => classifyWebPageQuotaResource(w.pageType) === 'sites'
  ).length;

  const isSuspended = Boolean(org && org.status === 'Suspenso');
  const rawStatus: SaaSSubscription['status'] | 'none' = sub ? sub.status : 'none';
  const periodEndMs = sub?.currentPeriodEnd ? new Date(sub.currentPeriodEnd).getTime() : null;
  const isExpired = Boolean(
    sub &&
      (sub.status === 'active' || sub.status === 'trialing') &&
      periodEndMs !== null &&
      Number.isFinite(periodEndMs) &&
      periodEndMs <= nowMs
  );
  const isDelinquent = rawStatus === 'past_due';
  const isCanceled = rawStatus === 'canceled';

  let denialCode: EntitlementDenialCode | null = null;
  let denialReason: string | null = null;

  if (!org) {
    denialCode = 'ORG_NOT_FOUND';
    denialReason = 'Organização não encontrada.';
  } else if (isSuspended) {
    denialCode = 'ORG_SUSPENDED';
    denialReason =
      'Organização suspensa. Regularize a situação junto ao administrador para continuar operando.';
  } else if (!sub) {
    denialCode = 'NO_SUBSCRIPTION';
    denialReason = 'Organização sem assinatura SaaS ativa. Contrate um plano para liberar recursos.';
  } else if (sub.status === 'past_due') {
    denialCode = 'SUBSCRIPTION_PAST_DUE';
    denialReason =
      'Assinatura em inadimplência (past_due). Regularize o pagamento para criar ou ativar recursos.';
  } else if (sub.status === 'canceled') {
    denialCode = 'SUBSCRIPTION_CANCELED';
    denialReason = 'Assinatura cancelada. Reative um plano SaaS para criar ou ativar recursos.';
  } else if (sub.status === 'incomplete') {
    denialCode = 'SUBSCRIPTION_INCOMPLETE';
    denialReason = 'Checkout iniciado, mas pagamento ainda não confirmado via webhook.';
  } else if (isExpired) {
    denialCode = 'SUBSCRIPTION_EXPIRED';
    denialReason =
      'Período da assinatura expirado. Renove o plano SaaS para continuar criando recursos.';
  }

  const isEntitled = denialCode === null;
  const effectiveStatus: OrganizationEntitlements['subscriptionStatus'] = isExpired
    ? 'expired'
    : rawStatus;

  const limits: CommercialPlan['limits'] =
    isEntitled && plan ? { ...plan.limits } : { landingPages: 0, sites: 0, users: 0, storageGb: 0 };

  const usage = {
    users: orgUsers,
    landingPages: landingPagesCount,
    sites: sitesCount,
    totalPages: orgWebPages.length,
  };

  const remaining = {
    users: Math.max(0, limits.users - usage.users),
    landingPages: Math.max(0, limits.landingPages - usage.landingPages),
    sites: Math.max(0, limits.sites - usage.sites),
  };

  const features = resolvePlanFeatures(isEntitled, plan);
  const warnings: string[] = [];
  if (!isEntitled && denialReason) {
    warnings.push(denialReason);
  } else {
    if (limits.users > 0 && usage.users >= limits.users) {
      warnings.push(`Limite de usuários atingido (${usage.users}/${limits.users}).`);
    } else if (limits.users > 0 && usage.users / limits.users >= 0.8) {
      warnings.push(`Uso de usuários acima de 80% (${usage.users}/${limits.users}).`);
    }
    if (limits.landingPages > 0 && usage.landingPages >= limits.landingPages) {
      warnings.push(
        `Limite de Landing Pages atingido (${usage.landingPages}/${limits.landingPages}).`
      );
    }
    if (limits.sites > 0 && usage.sites >= limits.sites) {
      warnings.push(`Limite de Sites atingido (${usage.sites}/${limits.sites}).`);
    }
  }

  return {
    organizationId,
    organizationStatus: org ? org.status : 'Inexistente',
    subscriptionStatus: effectiveStatus,
    rawSubscriptionStatus: rawStatus,
    planCode: sub?.planCode || 'NONE',
    planName: sub?.planName || 'Sem Assinatura Ativa',
    currentPeriodEnd: sub?.currentPeriodEnd || null,
    isExpired,
    isSuspended,
    isDelinquent,
    isCanceled,
    isEntitled,
    denialCode,
    denialReason,
    limits,
    usage,
    remaining,
    features,
    warnings,
    upgradeRecommended: !isEntitled || warnings.length > 0,
  };
}

export function assertEntitlement(
  store: PersistentStore,
  params: {
    organizationId: string;
    resource: QuotaResourceType;
    featureKey?: PlanFeatureKey;
    increment?: number;
    actorUserId?: string;
    actionContext?: string;
  }
): EntitlementCheckResult {
  const increment = params.increment ?? (params.resource === 'feature' ? 0 : 1);
  const entitlements = evaluateOrganizationEntitlements(store, params.organizationId);

  const deny = (
    httpStatus: 402 | 403,
    code: EntitlementDenialCode,
    error: string
  ): EntitlementCheckResult => {
    if (params.actorUserId) {
      store.audit(params.organizationId, params.actorUserId, 'ENTITLEMENT_DENIED', 'Entitlement', code, {
        resource: params.resource,
        featureKey: params.featureKey || null,
        actionContext: params.actionContext || params.resource,
        planCode: entitlements.planCode,
        subscriptionStatus: entitlements.subscriptionStatus,
        usage: entitlements.usage,
        limits: entitlements.limits,
      });
    }
    return {
      allowed: false,
      httpStatus,
      code,
      error,
      entitlements,
    };
  };

  if (!entitlements.isEntitled && entitlements.denialCode) {
    const status: 402 | 403 =
      entitlements.denialCode === 'ORG_SUSPENDED' ||
      entitlements.denialCode === 'ORG_NOT_FOUND' ||
      entitlements.denialCode === 'SUBSCRIPTION_CANCELED'
        ? 403
        : 402;
    return deny(
      status,
      entitlements.denialCode,
      entitlements.denialReason || 'Assinatura sem permissão para esta operação.'
    );
  }

  if (params.featureKey && !entitlements.features[params.featureKey]) {
    return deny(
      403,
      'FEATURE_NOT_IN_PLAN',
      `Funcionalidade "${params.featureKey}" não disponível no plano ${entitlements.planName}. Faça upgrade da assinatura.`
    );
  }

  if (params.resource === 'users' && entitlements.usage.users + increment > entitlements.limits.users) {
    return deny(
      402,
      'PLAN_USER_LIMIT_EXCEEDED',
      `Limite de usuários do plano ${entitlements.planName} atingido (${entitlements.usage.users}/${entitlements.limits.users}). Faça upgrade da assinatura.`
    );
  }

  if (
    params.resource === 'landingPages' &&
    entitlements.usage.landingPages + increment > entitlements.limits.landingPages
  ) {
    return deny(
      402,
      'PLAN_LANDING_PAGE_LIMIT_EXCEEDED',
      `Limite de Landing Pages do plano ${entitlements.planName} atingido (${entitlements.usage.landingPages}/${entitlements.limits.landingPages}). Faça upgrade da assinatura.`
    );
  }

  if (params.resource === 'sites' && entitlements.usage.sites + increment > entitlements.limits.sites) {
    return deny(
      402,
      'PLAN_SITE_LIMIT_EXCEEDED',
      `Limite de Sites do plano ${entitlements.planName} atingido (${entitlements.usage.sites}/${entitlements.limits.sites}). Faça upgrade da assinatura.`
    );
  }

  return { allowed: true, entitlements };
}
