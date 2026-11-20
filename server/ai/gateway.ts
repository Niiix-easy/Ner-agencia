import { PersistentStore } from '../store.ts';
import {
  decryptSecret,
  encryptSecret,
  hasMasterEncryptionKey,
  maskSecret,
  resolveProviderCredentials,
  sanitizeProviderForClient,
} from './credentials.ts';
import {
  buildUsageAnalytics,
  estimateRequestCost,
  evaluateCostPolicyBeforeRequest,
  filterLogs,
  UsageFilterOptions,
  UsagePeriodFilter,
} from './cost-usage.ts';
import { AiActionDefinition, DEFAULT_AI_ACTIONS, resolveActionIdentifier } from './actions.ts';
import { ExportRow, ExportSegmentMode, exportUsageCsv, exportUsagePdf, exportUsageXlsx } from './exporters.ts';
import { AiObservabilityService, AiUpstreamError, sanitizeErrorText } from './observability.ts';
import { AI_PROVIDER_ADAPTERS, AiProviderAdapter } from './providers.ts';
import {
  AiAdapterResponse,
  AiAlertChannel,
  AiBillingCategory,
  AiChatMessage,
  AiCostPolicy,
  AiDepartment,
  AiEmbeddingResponse,
  AiExchangeConfig,
  AiGlobalCostPolicy,
  AiLimitExceedAction,
  AiLimitException,
  AiMemoryEntry,
  AiModelEntry,
  AiPromptTemplate,
  AiProviderId,
  AiPurpose,
  AiRoutingRule,
  AiThresholdAlertRule,
  AiUsageLog,
  AiUsageStatus,
  PURPOSE_CAPABILITY_RULES,
} from './types.ts';

const CANONICAL_THRESHOLD_MARKS: Array<50 | 75 | 90 | 100> = [50, 75, 90, 100];
const VALID_ALERT_CHANNELS: AiAlertChannel[] = ['dashboard', 'audit_log', 'email_admin', 'webhook'];
const VALID_SEVERITIES = new Set(['info', 'warning', 'critical']);
const VALID_EXCEED_ACTIONS = new Set(['notify', 'fallback_economical', 'block_non_essential', 'block_all']);

function mapDefaultActionForExceed(action?: AiLimitExceedAction): 'notify' | 'fallback_economical' | 'block_non_essential' | 'block_all' {
  if (action === 'notify' || action === 'fallback_economical' || action === 'block_non_essential' || action === 'block_all') {
    return action;
  }
  return 'block_non_essential';
}

function normalizeThresholdRules(
  rawRules: Partial<AiThresholdAlertRule>[] | undefined,
  enabledThresholds?: number[],
  exceedAction?: AiLimitExceedAction
): AiThresholdAlertRule[] {
  const defaultAction100 = mapDefaultActionForExceed(exceedAction);
  const defaults: Record<50 | 75 | 90 | 100, AiThresholdAlertRule> = {
    50: {
      thresholdPct: 50,
      enabled: true,
      severity: 'info',
      channels: ['dashboard'],
      action: 'notify',
      customMessage: '',
    },
    75: {
      thresholdPct: 75,
      enabled: true,
      severity: 'warning',
      channels: ['dashboard', 'audit_log'],
      action: 'notify',
      customMessage: '',
    },
    90: {
      thresholdPct: 90,
      enabled: true,
      severity: 'warning',
      channels: ['dashboard', 'audit_log', 'email_admin'],
      action: 'notify',
      customMessage: '',
    },
    100: {
      thresholdPct: 100,
      enabled: true,
      severity: 'critical',
      channels: ['dashboard', 'audit_log', 'email_admin', 'webhook'],
      action: defaultAction100,
      customMessage: '',
    },
  };

  const rawByPct = new Map<number, Partial<AiThresholdAlertRule>>();
  if (Array.isArray(rawRules)) {
    for (const r of rawRules) {
      const pct = Number(r?.thresholdPct);
      if (pct === 50 || pct === 75 || pct === 90 || pct === 100) {
        rawByPct.set(pct, r);
      }
    }
  }

  const enabledSet = Array.isArray(enabledThresholds) && enabledThresholds.length > 0
    ? new Set(enabledThresholds.map((n) => Number(n)))
    : null;

  return CANONICAL_THRESHOLD_MARKS.map((mark) => {
    const base = defaults[mark];
    const incoming = rawByPct.get(mark);
    const enabled =
      typeof incoming?.enabled === 'boolean'
        ? incoming.enabled
        : enabledSet
          ? enabledSet.has(mark)
          : base.enabled;
    const severity =
      incoming?.severity && VALID_SEVERITIES.has(incoming.severity)
        ? (incoming.severity as 'info' | 'warning' | 'critical')
        : base.severity;
    const channels = Array.isArray(incoming?.channels)
      ? Array.from(
          new Set(
            incoming.channels.filter((c): c is AiAlertChannel =>
              VALID_ALERT_CHANNELS.includes(c as AiAlertChannel)
            )
          )
        )
      : [...base.channels];
    const action =
      incoming?.action && VALID_EXCEED_ACTIONS.has(incoming.action)
        ? (incoming.action as 'notify' | 'fallback_economical' | 'block_non_essential' | 'block_all')
        : base.action;
    const customMessage =
      typeof incoming?.customMessage === 'string' ? incoming.customMessage.trim().slice(0, 220) : base.customMessage;

    return {
      thresholdPct: mark,
      enabled,
      severity,
      channels: channels.length > 0 ? channels : ['dashboard'],
      action,
      ...(customMessage ? { customMessage } : {}),
    };
  });
}

export interface AiGatewayExecuteParams {
  organizationId: string;
  userId: string;
  clientId?: string | null;
  billingCategory?: AiBillingCategory;
  department: AiDepartment;
  action?: string;
  purpose: AiPurpose;
  messages: AiChatMessage[];
  systemInstruction?: string;
  overrideProviderId?: AiProviderId;
  overrideModelId?: string;
  promptCode?: string;
  conversationId?: string;
  projectId?: string;
  structuredJsonSchema?: Record<string, unknown>;
  temperature?: number;
  maxOutputTokens?: number;
  stream?: boolean;
  onChunk?: (delta: string) => void;
  allowRetry?: boolean; // Set false for external side-effecting operations unless idempotent
  idempotencyKey?: string;
  isCritical?: boolean;
  cacheable?: boolean;
}

export interface AiGatewayExecuteResult {
  requestId: string;
  traceId: string;
  providerId: AiProviderId;
  modelId: string;
  action: string;
  effectiveProvider?: string;
  fallbackUsed: boolean;
  fallbackFrom: string | null;
  text: string;
  inputTokens: number;
  outputTokens: number;
  cachedTokens: number;
  reasoningTokens: number | null;
  usageStatus: AiUsageStatus;
  inputCost: number | null;
  outputCost: number | null;
  cacheCost: number | null;
  reasoningCost: number | null;
  estimatedCostUsd: number | null;
  costReliable: boolean;
  costStatus: AiUsageStatus;
  totalCostBRL: number | null;
  exchangeRate: number | null;
  responseCached: boolean;
  latencyMs: number;
  citations: { sourceId: string; title: string }[];
  budgetAlert?: string;
}

const PROMPT_INJECTION_PATTERNS = [
  /ignore\s+(all\s+)?previous\s+instructions/gi,
  /reveal\s+(your\s+)?(system\s+prompt|api\s+key|secret)/gi,
];

export function sanitizePromptInput(text: string): string {
  let clean = text;
  for (const rx of PROMPT_INJECTION_PATTERNS) {
    clean = clean.replace(rx, '[FILTERED_INSTRUCTION]');
  }
  return clean;
}

export class AiGatewayService {
  private readonly store: PersistentStore;
  private readonly adapters: Record<AiProviderId, AiProviderAdapter>;
  public readonly observability: AiObservabilityService;
  private readonly masterKeyOverride?: string;
  private readonly safeResponseCache = new Map<
    string,
    { text: string; modelId: string; providerId: AiProviderId; expiresAt: number }
  >();

  constructor(
    store: PersistentStore,
    options: {
      adapters?: Record<AiProviderId, AiProviderAdapter>;
      masterKeyOverride?: string;
    } = {}
  ) {
    this.store = store;
    this.adapters = options.adapters || AI_PROVIDER_ADAPTERS;
    this.observability = new AiObservabilityService();
    this.masterKeyOverride = options.masterKeyOverride;
  }

  private aiState() {
    return this.store.getState().aiGateway;
  }

  // --- PROVIDERS & CREDENTIALS ---
  public listProviders(organizationId: string) {
    const ai = this.aiState();
    const globals = ai.providers.filter((p) => p.scope === 'global');
    return globals.map((g) => {
      const orgOverride = ai.providers.find(
        (p) => p.providerId === g.providerId && p.scope === 'organization' && p.organizationId === organizationId
      );
      const effective = orgOverride || g;
      return {
        ...sanitizeProviderForClient(effective, organizationId),
        hasOrgOverride: Boolean(orgOverride),
      };
    });
  }

  public saveProviderConfig(params: {
    providerId: AiProviderId;
    organizationId: string;
    actorUserId: string;
    scope: 'global' | 'organization';
    apiKey?: string;
    baseUrl?: string;
    defaultModel?: string;
    organizationHeader?: string;
    projectIdHeader?: string;
    rateLimitPerMin?: number;
    confirmOverwrite?: boolean;
  }) {
    const ai = this.aiState();
    const targetOrg = params.scope === 'organization' ? params.organizationId : null;
    let record = ai.providers.find(
      (p) => p.providerId === params.providerId && p.scope === params.scope && p.organizationId === targetOrg
    );

    if (!record) {
      const baseGlobal = ai.providers.find((p) => p.providerId === params.providerId && p.scope === 'global');
      if (!baseGlobal) throw new Error('PROVEDOR_NAO_ENCONTRADO');
      record = {
        ...baseGlobal,
        id: `aiprv-${params.providerId}-${params.scope}-${targetOrg || 'global'}`,
        scope: params.scope,
        organizationId: targetOrg,
        encryptedApiKey: null,
        keyMask: null,
        status: 'AGUARDANDO CONFIGURAÇÃO',
        lastCheckedAt: null,
        lastError: null,
        updatedAt: new Date().toISOString(),
      };
      ai.providers.push(record);
    }

    if (params.apiKey !== undefined && params.apiKey.trim() !== '') {
      if (record.encryptedApiKey && params.confirmOverwrite === false) {
        throw new Error('OVERWRITE_CONFIRMATION_REQUIRED');
      }
      if (!hasMasterEncryptionKey(this.masterKeyOverride)) {
        throw new Error('NER_AI_ENCRYPTION_KEY_MISSING');
      }
      const cleanKey = params.apiKey.trim();
      record.encryptedApiKey = encryptSecret(cleanKey, this.masterKeyOverride);
      record.keyMask = maskSecret(cleanKey);
      // Do not mark CONECTADO until a real connection check succeeds!
      record.status = 'AGUARDANDO CONFIGURAÇÃO';
      record.lastError = null;
    }

    if (params.baseUrl !== undefined) record.baseUrl = params.baseUrl.trim();
    if (params.defaultModel !== undefined && params.defaultModel.trim()) {
      record.defaultModel = params.defaultModel.trim();
    }
    if (params.organizationHeader !== undefined) record.organizationHeader = params.organizationHeader.trim();
    if (params.projectIdHeader !== undefined) record.projectIdHeader = params.projectIdHeader.trim();
    if (params.rateLimitPerMin !== undefined) record.rateLimitPerMin = Math.max(1, Number(params.rateLimitPerMin));
    record.updatedAt = new Date().toISOString();

    this.store.audit(params.organizationId, params.actorUserId, 'AI_PROVIDER_CONFIG_SAVED', 'AiProvider', record.id, {
      providerId: params.providerId,
      scope: params.scope,
      keyUpdated: Boolean(params.apiKey?.trim()),
      defaultModel: record.defaultModel,
    });
    this.store.save();

    return sanitizeProviderForClient(record, params.organizationId);
  }

  public deleteProviderCredential(params: {
    providerId: AiProviderId;
    organizationId: string;
    actorUserId: string;
    scope: 'global' | 'organization';
  }) {
    const ai = this.aiState();
    const targetOrg = params.scope === 'organization' ? params.organizationId : null;
    const record = ai.providers.find(
      (p) => p.providerId === params.providerId && p.scope === params.scope && p.organizationId === targetOrg
    );
    if (!record) throw new Error('PROVEDOR_NAO_ENCONTRADO');
    record.encryptedApiKey = null;
    record.keyMask = null;
    record.status = 'AGUARDANDO CONFIGURAÇÃO';
    record.lastError = null;
    record.lastCheckedAt = null;
    record.updatedAt = new Date().toISOString();
    this.store.audit(params.organizationId, params.actorUserId, 'AI_PROVIDER_KEY_REVOKED', 'AiProvider', record.id, {
      providerId: params.providerId,
      scope: params.scope,
    });
    this.store.save();
    return sanitizeProviderForClient(record, params.organizationId);
  }

  public rotateEncryptionKey(params: {
    oldMasterKey: string;
    newMasterKey: string;
    organizationId: string;
    actorUserId: string;
  }): number {
    const ai = this.aiState();
    let rotated = 0;
    for (const p of ai.providers) {
      if (p.encryptedApiKey) {
        const plain = decryptSecret(p.encryptedApiKey, params.oldMasterKey);
        p.encryptedApiKey = encryptSecret(plain, params.newMasterKey);
        p.updatedAt = new Date().toISOString();
        rotated += 1;
      }
    }
    this.store.audit(params.organizationId, params.actorUserId, 'AI_ENCRYPTION_KEY_ROTATED', 'AiSecurity', 'master-key', {
      rotatedCount: rotated,
    });
    this.store.save();
    return rotated;
  }

  public async testProviderConnection(params: {
    providerId: AiProviderId;
    organizationId: string;
    actorUserId: string;
  }) {
    const ai = this.aiState();
    const adapter = this.adapters[params.providerId];
    if (!adapter) throw new Error('PROVEDOR_NAO_ENCONTRADO');

    const record =
      ai.providers.find(
        (p) => p.providerId === params.providerId && p.scope === 'organization' && p.organizationId === params.organizationId
      ) || ai.providers.find((p) => p.providerId === params.providerId && p.scope === 'global');

    if (!record) throw new Error('PROVEDOR_NAO_ENCONTRADO');

    const now = new Date().toISOString();
    try {
      const creds = resolveProviderCredentials(ai.providers, params.providerId, params.organizationId, this.masterKeyOverride);
      if (record.requiresKey && !creds.apiKey) {
        record.status = 'AGUARDANDO CONFIGURAÇÃO';
        record.lastCheckedAt = now;
        record.lastError = 'Nenhuma API Key configurada para este provedor.';
        this.store.save();
        return { ok: false, status: record.status, message: record.lastError, latencyMs: 0 };
      }

      const result = await adapter.testConnection(creds, record.defaultModel);
      record.status = 'CONECTADO';
      record.lastCheckedAt = now;
      record.lastError = null;
      this.observability.recordSuccess(params.providerId);

      // Try syncing real models when supported
      if (adapter.capabilities.modelListing) {
        try {
          const discovered = await adapter.listModels(creds);
          this.mergeDiscoveredModels(params.providerId, discovered);
        } catch {
          // non-fatal if model list fails after auth succeeded
        }
      }

      this.store.audit(params.organizationId, params.actorUserId, 'AI_PROVIDER_TEST_OK', 'AiProvider', record.id, {
        providerId: params.providerId,
        latencyMs: result.latencyMs,
      });
      this.store.save();
      return { ...result, status: record.status };
    } catch (err: any) {
      const safeErr = sanitizeErrorText(err?.message || 'Erro desconhecido ao validar provedor.');
      record.status = 'ERRO';
      record.lastCheckedAt = now;
      record.lastError = safeErr;
      this.observability.recordFailure(params.providerId, safeErr);
      this.store.audit(params.organizationId, params.actorUserId, 'AI_PROVIDER_TEST_FAILED', 'AiProvider', record.id, {
        providerId: params.providerId,
        error: safeErr,
      });
      this.store.save();
      return { ok: false, status: record.status, message: safeErr, latencyMs: 0 };
    }
  }

  public async discoverModelsForProvider(providerId: AiProviderId, organizationId: string) {
    const ai = this.aiState();
    const adapter = this.adapters[providerId];
    if (!adapter) throw new Error('PROVEDOR_NAO_ENCONTRADO');
    const creds = resolveProviderCredentials(ai.providers, providerId, organizationId, this.masterKeyOverride);
    const list = await adapter.listModels(creds);
    this.mergeDiscoveredModels(providerId, list);
    this.store.save();
    return ai.models.filter((m) => m.providerId === providerId);
  }

  private mergeDiscoveredModels(
    providerId: AiProviderId,
    discovered: { modelId: string; displayName: string; contextWindow?: number }[]
  ) {
    const ai = this.aiState();
    const now = new Date().toISOString();
    for (const d of discovered.slice(0, 60)) {
      const existing = ai.models.find((m) => m.providerId === providerId && m.modelId === d.modelId);
      if (existing) {
        existing.lastVerifiedAt = now;
        if (d.contextWindow) existing.contextWindow = d.contextWindow;
      } else {
        ai.models.push({
          id: `mdl-${providerId}-${d.modelId.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 40)}`,
          providerId,
          modelId: d.modelId,
          displayName: d.displayName,
          isActive: true,
          isDefaultForProvider: false,
          priority: 50,
          contextWindow: d.contextWindow || 32768,
          capabilities: this.adapters[providerId].capabilities,
          inputCostPer1M: null,
          outputCostPer1M: null,
          pricingVerified: false,
          source: 'discovered',
          lastVerifiedAt: now,
        });
      }
    }
  }

  // --- MODELS & ROUTING ---
  public listModels(activeOnly = false) {
    const models = activeOnly ? this.aiState().models.filter((m) => m.isActive) : this.aiState().models;
    return [...models].sort((a, b) => a.priority - b.priority);
  }

  public isModelCompatibleWithPurpose(model: AiModelEntry, purpose: AiPurpose): boolean {
    const reqCaps = PURPOSE_CAPABILITY_RULES[purpose]?.requiredAny || ['chat', 'textGeneration'];
    const hasModelCaps = Boolean(model.capabilities && Object.keys(model.capabilities).length > 0);
    const effectiveCaps = hasModelCaps
      ? model.capabilities
      : this.adapters[model.providerId]?.capabilities || {};
    return reqCaps.some((cap) => Boolean(effectiveCaps[cap]));
  }

  private normalizeNullableTokenLimit(val: unknown): number | null | undefined {
    if (val === undefined) return undefined;
    if (val === null || val === '') return null;
    const num = Math.floor(Number(val));
    if (!Number.isFinite(num) || num <= 0) return null;
    return num;
  }

  public upsertModel(params: Partial<AiModelEntry> & { providerId: AiProviderId; modelId: string }, organizationId: string, actorUserId: string) {
    const ai = this.aiState();
    const now = new Date().toISOString();
    let model = ai.models.find((m) => m.providerId === params.providerId && m.modelId === params.modelId);
    const normMaxIn = this.normalizeNullableTokenLimit(params.maxInputTokens);
    const normMaxOut = this.normalizeNullableTokenLimit(params.maxOutputTokens);
    const normDailyTok = this.normalizeNullableTokenLimit(params.dailyTokenLimit);

    if (!model) {
      model = {
        id: `mdl-${Date.now()}`,
        providerId: params.providerId,
        modelId: params.modelId.trim(),
        displayName: params.displayName?.trim() || params.modelId.trim(),
        isActive: params.isActive !== false,
        isDefaultForProvider: Boolean(params.isDefaultForProvider),
        priority: Number(params.priority) || 10,
        contextWindow: Number(params.contextWindow) || 32768,
        maxInputTokens: normMaxIn ?? null,
        maxOutputTokens: normMaxOut ?? null,
        dailyTokenLimit: normDailyTok ?? null,
        capabilities: params.capabilities || this.adapters[params.providerId].capabilities,
        inputCostPer1M: params.inputCostPer1M ?? null,
        outputCostPer1M: params.outputCostPer1M ?? null,
        cacheInputCostPer1M: params.cacheInputCostPer1M ?? null,
        reasoningCostPer1M: params.reasoningCostPer1M ?? null,
        currency: params.currency || 'USD',
        effectiveFrom: params.effectiveFrom ?? now.slice(0, 10),
        priceSource: params.priceSource ?? 'Configuração Administrativa',
        pricingVerified: params.inputCostPer1M !== undefined && params.outputCostPer1M !== undefined,
        source: 'custom',
        lastVerifiedAt: null,
        updatedAt: now,
      };
      ai.models.push(model);
    } else {
      if (params.displayName !== undefined) model.displayName = params.displayName;
      if (params.isActive !== undefined) model.isActive = params.isActive;
      if (params.priority !== undefined) model.priority = Number(params.priority);
      if (params.contextWindow !== undefined) model.contextWindow = Number(params.contextWindow);
      if (normMaxIn !== undefined) model.maxInputTokens = normMaxIn;
      if (normMaxOut !== undefined) model.maxOutputTokens = normMaxOut;
      if (normDailyTok !== undefined) model.dailyTokenLimit = normDailyTok;
      if (params.capabilities !== undefined) {
        model.capabilities = { ...model.capabilities, ...params.capabilities };
      }
      if (params.inputCostPer1M !== undefined) {
        model.inputCostPer1M = params.inputCostPer1M === null ? null : Math.max(0, Number(params.inputCostPer1M));
        model.pricingVerified = model.inputCostPer1M !== null && model.outputCostPer1M !== null;
      }
      if (params.outputCostPer1M !== undefined) {
        model.outputCostPer1M = params.outputCostPer1M === null ? null : Math.max(0, Number(params.outputCostPer1M));
        model.pricingVerified = model.inputCostPer1M !== null && model.outputCostPer1M !== null;
      }
      if (params.cacheInputCostPer1M !== undefined) {
        model.cacheInputCostPer1M =
          params.cacheInputCostPer1M === null ? null : Math.max(0, Number(params.cacheInputCostPer1M));
      }
      if (params.reasoningCostPer1M !== undefined) {
        model.reasoningCostPer1M =
          params.reasoningCostPer1M === null ? null : Math.max(0, Number(params.reasoningCostPer1M));
      }
      if (params.currency !== undefined) model.currency = params.currency;
      if (params.effectiveFrom !== undefined) model.effectiveFrom = params.effectiveFrom;
      if (params.priceSource !== undefined) model.priceSource = params.priceSource;
      if (typeof params.pricingVerified === 'boolean') {
        model.pricingVerified = params.pricingVerified && model.inputCostPer1M !== null && model.outputCostPer1M !== null;
      }
      if (params.isDefaultForProvider) {
        ai.models.filter((m) => m.providerId === model!.providerId).forEach((m) => {
          m.isDefaultForProvider = false;
        });
        model.isDefaultForProvider = true;
      }
      model.updatedAt = now;
    }
    this.store.audit(organizationId, actorUserId, 'AI_MODEL_UPDATED', 'AiModel', model.id, {
      providerId: model.providerId,
      modelId: model.modelId,
      isActive: model.isActive,
      maxInputTokens: model.maxInputTokens ?? null,
      maxOutputTokens: model.maxOutputTokens ?? null,
      dailyTokenLimit: model.dailyTokenLimit ?? null,
    });
    this.store.save();
    return model;
  }

  public listRoutingRules() {
    return this.aiState().routingRules;
  }

  public updateRoutingRule(purpose: AiPurpose, patch: Partial<AiRoutingRule>, organizationId: string, actorUserId: string) {
    const ai = this.aiState();
    const rule = ai.routingRules.find((r) => r.purpose === purpose);
    if (!rule) throw new Error('REGRA_DE_ROTEAMENTO_NAO_ENCONTRADA');

    const nextPrimaryPid = (patch.primaryProviderId ?? rule.primaryProviderId) as AiProviderId;
    const nextPrimaryMid = patch.primaryModelId ?? rule.primaryModelId;
    const primaryCatalogModel = ai.models.find(
      (m) => m.providerId === nextPrimaryPid && m.modelId === nextPrimaryMid
    );
    if (primaryCatalogModel) {
      if (!primaryCatalogModel.isActive) {
        throw new Error(`MODELO_INATIVO: O modelo ${nextPrimaryMid} está desativado e não pode ser definido como preferencial.`);
      }
      if (!this.isModelCompatibleWithPurpose(primaryCatalogModel, purpose)) {
        const reqCaps = PURPOSE_CAPABILITY_RULES[purpose]?.requiredAny.join(' ou ') || 'chat';
        throw new Error(
          `MODELO_INCOMPATIVEL_CAPACIDADE: O modelo ${nextPrimaryMid} não possui a capacidade necessária (${reqCaps}) para a finalidade "${rule.label}".`
        );
      }
    }

    const nextFallbackPid = (patch.fallbackProviderId !== undefined ? patch.fallbackProviderId : rule.fallbackProviderId) as AiProviderId | null;
    const nextFallbackMid = patch.fallbackModelId !== undefined ? patch.fallbackModelId : rule.fallbackModelId;
    if (nextFallbackPid && nextFallbackMid) {
      const fbCatalogModel = ai.models.find(
        (m) => m.providerId === nextFallbackPid && m.modelId === nextFallbackMid
      );
      if (fbCatalogModel && !this.isModelCompatibleWithPurpose(fbCatalogModel, purpose)) {
        const reqCaps = PURPOSE_CAPABILITY_RULES[purpose]?.requiredAny.join(' ou ') || 'chat';
        throw new Error(
          `MODELO_INCOMPATIVEL_CAPACIDADE: O fallback ${nextFallbackMid} não possui a capacidade necessária (${reqCaps}) para "${rule.label}".`
        );
      }
    }

    const fields: (keyof AiRoutingRule)[] = [
      'primaryProviderId',
      'primaryModelId',
      'fallbackProviderId',
      'fallbackModelId',
      'allowMoreExpensiveFallback',
      'maxCostUsdPerRequest',
      'timeoutMs',
      'maxRetries',
      'isActive',
    ];
    for (const f of fields) {
      if (patch[f] !== undefined) {
        (rule as unknown as Record<string, unknown>)[f] = patch[f];
      }
    }
    rule.updatedAt = new Date().toISOString();
    this.store.audit(organizationId, actorUserId, 'AI_ROUTING_UPDATED', 'AiRoutingRule', rule.id, {
      purpose: rule.purpose,
      primary: `${rule.primaryProviderId}/${rule.primaryModelId}`,
      fallback: rule.fallbackProviderId ? `${rule.fallbackProviderId}/${rule.fallbackModelId}` : null,
    });
    this.store.save();
    return rule;
  }

  // --- PROMPTS ---
  public listPrompts(organizationId: string) {
    return this.aiState().prompts.filter((p) => p.organizationId === organizationId || p.organizationId === 'org-1');
  }

  public savePrompt(
    params: Partial<AiPromptTemplate> & { code: string; name: string; department: AiDepartment; purpose: AiPurpose; systemPrompt: string },
    organizationId: string,
    actorUserId: string
  ) {
    const ai = this.aiState();
    const existing = ai.prompts.find((p) => p.code === params.code && p.organizationId === organizationId);
    const now = new Date().toISOString();
    if (existing) {
      existing.history.unshift({
        version: existing.version,
        systemPrompt: existing.systemPrompt,
        userTemplate: existing.userTemplate,
        temperature: existing.temperature,
        maxOutputTokens: existing.maxOutputTokens,
        updatedAt: existing.updatedAt,
        updatedBy: actorUserId,
      });
      existing.version += 1;
      existing.name = params.name;
      existing.department = params.department;
      existing.purpose = params.purpose;
      existing.systemPrompt = params.systemPrompt;
      existing.userTemplate = params.userTemplate ?? existing.userTemplate;
      existing.temperature = params.temperature ?? existing.temperature;
      existing.maxOutputTokens = params.maxOutputTokens ?? existing.maxOutputTokens;
      existing.preferredProviderId = params.preferredProviderId ?? existing.preferredProviderId;
      existing.preferredModelId = params.preferredModelId ?? existing.preferredModelId;
      existing.isActive = params.isActive ?? existing.isActive;
      existing.updatedAt = now;
      this.store.audit(organizationId, actorUserId, 'AI_PROMPT_VERSIONED', 'AiPrompt', existing.id, {
        code: existing.code,
        version: existing.version,
      });
      this.store.save();
      return existing;
    }

    const created: AiPromptTemplate = {
      id: `prm-${Date.now()}`,
      organizationId,
      code: params.code.trim().toUpperCase(),
      name: params.name.trim(),
      department: params.department,
      purpose: params.purpose,
      version: 1,
      isActive: params.isActive !== false,
      systemPrompt: params.systemPrompt,
      userTemplate: params.userTemplate || '{{input}}',
      preferredProviderId: params.preferredProviderId || null,
      preferredModelId: params.preferredModelId || null,
      temperature: params.temperature ?? 0.5,
      maxOutputTokens: params.maxOutputTokens ?? 1500,
      history: [],
      updatedAt: now,
    };
    ai.prompts.push(created);
    this.store.audit(organizationId, actorUserId, 'AI_PROMPT_CREATED', 'AiPrompt', created.id, { code: created.code });
    this.store.save();
    return created;
  }

  // --- ACTIONS, EXCHANGE RATE, EXCEPTIONS, COST POLICIES & USAGE ---
  public listActions(): AiActionDefinition[] {
    const ai = this.aiState();
    return ai.actions && ai.actions.length > 0 ? ai.actions : DEFAULT_AI_ACTIONS;
  }

  public upsertAction(
    params: Partial<AiActionDefinition> & { id: string; department: AiDepartment; name: string; purpose: AiPurpose },
    organizationId: string,
    actorUserId: string
  ): AiActionDefinition {
    const ai = this.aiState();
    if (!ai.actions) ai.actions = DEFAULT_AI_ACTIONS.map((a) => ({ ...a }));
    const cleanId = params.id.trim().toLowerCase().replace(/[^a-z0-9._-]/g, '_');
    let existing = ai.actions.find((a) => a.id === cleanId);
    if (existing) {
      existing.department = params.department;
      existing.name = params.name.trim();
      existing.purpose = params.purpose;
      existing.description = params.description ?? existing.description;
      if (typeof params.isCritical === 'boolean') existing.isCritical = params.isCritical;
      if (typeof params.cacheable === 'boolean') existing.cacheable = params.cacheable;
    } else {
      existing = {
        id: cleanId,
        department: params.department,
        name: params.name.trim(),
        purpose: params.purpose,
        description: params.description || '',
        isCritical: Boolean(params.isCritical),
        cacheable: Boolean(params.cacheable),
        isSystem: false,
      };
      ai.actions.push(existing);
    }
    this.store.audit(organizationId, actorUserId, 'AI_ACTION_SAVED', 'AiAction', cleanId, {
      department: existing.department,
      purpose: existing.purpose,
    });
    this.store.save();
    return existing;
  }

  public getExchangeConfig(): AiExchangeConfig {
    const ai = this.aiState();
    if (!ai.exchangeConfig) {
      const now = new Date().toISOString();
      ai.exchangeConfig = {
        baseCurrency: 'USD',
        targetCurrency: 'BRL',
        rate: 5.75,
        rateDate: now.slice(0, 10),
        source: 'Referência Administrativa Configurável',
        updatedAt: now,
      };
    }
    return ai.exchangeConfig;
  }

  public updateExchangeConfig(
    patch: { rate: number; rateDate?: string; source?: string },
    organizationId: string,
    actorUserId: string
  ): AiExchangeConfig {
    const rate = Number(patch.rate);
    if (!Number.isFinite(rate) || rate <= 0) {
      throw new Error('Taxa de câmbio USD→BRL inválida.');
    }
    const ai = this.aiState();
    const now = new Date().toISOString();
    ai.exchangeConfig = {
      baseCurrency: 'USD',
      targetCurrency: 'BRL',
      rate: Number(rate.toFixed(4)),
      rateDate: patch.rateDate || now.slice(0, 10),
      source: patch.source?.trim() || 'Configuração Administrativa Manual',
      updatedAt: now,
    };
    this.store.audit(organizationId, actorUserId, 'AI_EXCHANGE_RATE_UPDATED', 'AiExchangeConfig', 'USD-BRL', {
      rate: ai.exchangeConfig.rate,
      rateDate: ai.exchangeConfig.rateDate,
    });
    this.store.save();
    return ai.exchangeConfig;
  }

  public listLimitExceptions(organizationId: string): AiLimitException[] {
    return (this.aiState().limitExceptions || []).filter((e) => e.organizationId === organizationId);
  }

  public createLimitException(
    params: {
      organizationId: string;
      scope: AiLimitException['scope'];
      targetKey: string;
      extraBudgetUsd: number;
      reason: string;
      expiresAt?: string;
    },
    actorUserId: string
  ): AiLimitException {
    const ai = this.aiState();
    if (!ai.limitExceptions) ai.limitExceptions = [];
    const now = new Date();
    const ex: AiLimitException = {
      id: `aiexc-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      organizationId: params.organizationId,
      scope: params.scope,
      targetKey: params.targetKey.trim(),
      extraBudgetUsd: Math.max(0, Number(params.extraBudgetUsd) || 0),
      grantedByUserId: actorUserId,
      reason: params.reason.trim() || 'Autorização excepcional administrativa',
      expiresAt: params.expiresAt || new Date(now.getTime() + 24 * 60 * 60_000).toISOString(),
      createdAt: now.toISOString(),
    };
    ai.limitExceptions.unshift(ex);
    this.store.audit(params.organizationId, actorUserId, 'AI_LIMIT_EXCEPTION_GRANTED', 'AiLimitException', ex.id, {
      scope: ex.scope,
      targetKey: ex.targetKey,
      extraBudgetUsd: ex.extraBudgetUsd,
      expiresAt: ex.expiresAt,
    });
    this.store.save();
    return ex;
  }

  public revokeLimitException(organizationId: string, exceptionId: string, actorUserId: string): boolean {
    const ai = this.aiState();
    if (!ai.limitExceptions) return false;
    const before = ai.limitExceptions.length;
    ai.limitExceptions = ai.limitExceptions.filter(
      (e) => !(e.organizationId === organizationId && e.id === exceptionId)
    );
    if (ai.limitExceptions.length < before) {
      this.store.audit(organizationId, actorUserId, 'AI_LIMIT_EXCEPTION_REVOKED', 'AiLimitException', exceptionId, {});
      this.store.save();
      return true;
    }
    return false;
  }

  public listAccountingAlerts(organizationId: string) {
    return (this.aiState().accountingAlerts || []).filter((a) => a.organizationId === organizationId);
  }

  public resolveAccountingAlert(organizationId: string, alertId: string, actorUserId: string) {
    const ai = this.aiState();
    const alert = (ai.accountingAlerts || []).find(
      (a) => a.organizationId === organizationId && a.id === alertId
    );
    if (!alert) return null;
    alert.resolved = true;
    this.store.audit(organizationId, actorUserId, 'AI_ACCOUNTING_ALERT_RESOLVED', 'AiAccountingAlert', alert.id, {
      requestId: alert.requestId,
    });
    this.store.save();
    return alert;
  }

  public getCostPolicy(organizationId: string): AiCostPolicy {
    const ai = this.aiState();
    let policy = ai.costPolicies.find((c) => c.organizationId === organizationId);
    if (!policy) {
      policy = {
        organizationId,
        dailyLimitUsd: 20,
        monthlyLimitUsd: 250,
        userDailyLimitUsd: 10,
        alertThresholdPct: 80,
        alertThresholds: [50, 75, 90, 100],
        thresholdRules: normalizeThresholdRules(undefined, [50, 75, 90, 100], 'block_non_essential'),
        blockOnExceed: true,
        onExceedAction: 'block_non_essential',
        departmentLimitsUsd: {},
        providerLimitsUsd: {},
        modelLimitsUsd: {},
        actionLimitsUsd: {},
        restrictedActions: [],
        updatedAt: new Date().toISOString(),
      };
      ai.costPolicies.push(policy);
    } else if (!Array.isArray(policy.thresholdRules) || policy.thresholdRules.length < 4) {
      policy.thresholdRules = normalizeThresholdRules(
        policy.thresholdRules,
        policy.alertThresholds,
        policy.onExceedAction
      );
    }
    return policy;
  }

  public updateCostPolicy(organizationId: string, patch: Partial<AiCostPolicy>, actorUserId: string) {
    const policy = this.getCostPolicy(organizationId);
    if (patch.dailyLimitUsd !== undefined) policy.dailyLimitUsd = Math.max(0, Number(patch.dailyLimitUsd));
    if (patch.monthlyLimitUsd !== undefined) policy.monthlyLimitUsd = Math.max(0, Number(patch.monthlyLimitUsd));
    if (patch.userDailyLimitUsd !== undefined) policy.userDailyLimitUsd = Math.max(0, Number(patch.userDailyLimitUsd));
    if (patch.alertThresholdPct !== undefined) policy.alertThresholdPct = Math.min(100, Math.max(1, Number(patch.alertThresholdPct)));
    if (typeof patch.blockOnExceed === 'boolean') policy.blockOnExceed = patch.blockOnExceed;
    if (patch.onExceedAction) policy.onExceedAction = patch.onExceedAction;

    if (Array.isArray(patch.thresholdRules)) {
      const normalized = normalizeThresholdRules(patch.thresholdRules, undefined, policy.onExceedAction);
      policy.thresholdRules = normalized;
      const enabledMarks = normalized.filter((r) => r.enabled).map((r) => r.thresholdPct);
      policy.alertThresholds = enabledMarks.length > 0 ? enabledMarks : [100];
      const rule100 = normalized.find((r) => r.thresholdPct === 100);
      if (rule100 && !patch.onExceedAction) {
        policy.onExceedAction = rule100.action;
        policy.blockOnExceed = rule100.action !== 'notify';
      }
    } else if (Array.isArray(patch.alertThresholds)) {
      policy.alertThresholds = patch.alertThresholds
        .map((n) => Number(n))
        .filter((n) => Number.isFinite(n) && n > 0 && n <= 100)
        .sort((a, b) => a - b);
      policy.thresholdRules = normalizeThresholdRules(
        policy.thresholdRules?.map((r) => ({
          ...r,
          enabled: policy.alertThresholds!.includes(r.thresholdPct),
          action: r.thresholdPct === 100 && patch.onExceedAction ? mapDefaultActionForExceed(patch.onExceedAction) : r.action,
        })),
        policy.alertThresholds,
        policy.onExceedAction
      );
    } else if (patch.onExceedAction && Array.isArray(policy.thresholdRules)) {
      policy.thresholdRules = policy.thresholdRules.map((r) =>
        r.thresholdPct === 100 ? { ...r, action: mapDefaultActionForExceed(patch.onExceedAction) } : r
      );
    }

    const cleanNumericMap = (raw: Record<string, unknown> | undefined) => {
      const cleaned: Record<string, number> = {};
      if (!raw) return cleaned;
      for (const [k, v] of Object.entries(raw)) {
        const num = Number(v);
        if (Number.isFinite(num) && num > 0) cleaned[k] = num;
      }
      return cleaned;
    };

    if (patch.departmentLimitsUsd) {
      policy.departmentLimitsUsd = cleanNumericMap(patch.departmentLimitsUsd) as Partial<Record<AiDepartment, number>>;
    }
    if (patch.providerLimitsUsd) {
      policy.providerLimitsUsd = cleanNumericMap(patch.providerLimitsUsd) as Partial<Record<AiProviderId, number>>;
    }
    if (patch.modelLimitsUsd) policy.modelLimitsUsd = cleanNumericMap(patch.modelLimitsUsd);
    if (patch.actionLimitsUsd) policy.actionLimitsUsd = cleanNumericMap(patch.actionLimitsUsd);
    if (Array.isArray(patch.restrictedActions)) {
      policy.restrictedActions = patch.restrictedActions.map((s) => String(s).trim()).filter(Boolean);
    }

    policy.updatedAt = new Date().toISOString();
    this.store.audit(organizationId, actorUserId, 'AI_COST_POLICY_UPDATED', 'AiCostPolicy', organizationId, {
      dailyLimitUsd: policy.dailyLimitUsd,
      monthlyLimitUsd: policy.monthlyLimitUsd,
      onExceedAction: policy.onExceedAction,
      alertThresholds: policy.alertThresholds,
      departmentLimitsUsd: policy.departmentLimitsUsd,
    });
    this.store.save();
    return policy;
  }

  public getGlobalCostPolicy(): AiGlobalCostPolicy {
    const ai = this.aiState();
    if (!ai.globalCostPolicy) {
      ai.globalCostPolicy = {
        dailyLimitUsd: 0,
        monthlyLimitUsd: 0,
        alertThresholds: [50, 75, 90, 100],
        thresholdRules: normalizeThresholdRules(undefined, [50, 75, 90, 100], 'block_non_essential'),
        onExceedAction: 'block_non_essential',
        updatedAt: new Date().toISOString(),
      };
    } else if (!Array.isArray(ai.globalCostPolicy.thresholdRules) || ai.globalCostPolicy.thresholdRules.length < 4) {
      ai.globalCostPolicy.thresholdRules = normalizeThresholdRules(
        ai.globalCostPolicy.thresholdRules,
        ai.globalCostPolicy.alertThresholds,
        ai.globalCostPolicy.onExceedAction
      );
    }
    return ai.globalCostPolicy;
  }

  public updateGlobalCostPolicy(
    patch: Partial<AiGlobalCostPolicy>,
    actorUserId: string,
    actorOrgId: string
  ): AiGlobalCostPolicy {
    const current = this.getGlobalCostPolicy();
    if (patch.dailyLimitUsd !== undefined) {
      current.dailyLimitUsd = Math.max(0, Number(patch.dailyLimitUsd) || 0);
    }
    if (patch.monthlyLimitUsd !== undefined) {
      current.monthlyLimitUsd = Math.max(0, Number(patch.monthlyLimitUsd) || 0);
    }
    if (patch.onExceedAction) {
      current.onExceedAction = patch.onExceedAction;
    }
    if (Array.isArray(patch.thresholdRules)) {
      const normalized = normalizeThresholdRules(patch.thresholdRules, undefined, current.onExceedAction);
      current.thresholdRules = normalized;
      const enabledMarks = normalized.filter((r) => r.enabled).map((r) => r.thresholdPct);
      current.alertThresholds = enabledMarks.length > 0 ? enabledMarks : [100];
      const rule100 = normalized.find((r) => r.thresholdPct === 100);
      if (rule100 && !patch.onExceedAction) {
        current.onExceedAction = rule100.action;
      }
    } else if (Array.isArray(patch.alertThresholds)) {
      current.alertThresholds = patch.alertThresholds
        .map((n) => Number(n))
        .filter((n) => Number.isFinite(n) && n > 0 && n <= 100)
        .sort((a, b) => a - b);
      current.thresholdRules = normalizeThresholdRules(
        current.thresholdRules?.map((r) => ({
          ...r,
          enabled: current.alertThresholds.includes(r.thresholdPct),
          action: r.thresholdPct === 100 && patch.onExceedAction ? mapDefaultActionForExceed(patch.onExceedAction) : r.action,
        })),
        current.alertThresholds,
        current.onExceedAction
      );
    } else if (patch.onExceedAction && Array.isArray(current.thresholdRules)) {
      current.thresholdRules = current.thresholdRules.map((r) =>
        r.thresholdPct === 100 ? { ...r, action: mapDefaultActionForExceed(patch.onExceedAction) } : r
      );
    }
    current.updatedAt = new Date().toISOString();
    current.updatedBy = actorUserId;
    this.store.audit(actorOrgId, actorUserId, 'AI_GLOBAL_COST_POLICY_UPDATED', 'AiGlobalCostPolicy', 'global', {
      dailyLimitUsd: current.dailyLimitUsd,
      monthlyLimitUsd: current.monthlyLimitUsd,
      onExceedAction: current.onExceedAction,
      alertThresholds: current.alertThresholds,
    });
    this.store.save();
    return current;
  }

  public getPreventiveMonitoringSnapshot(organizationId: string, includeAllOrgs = false) {
    const ai = this.aiState();
    const globalPolicy = this.getGlobalCostPolicy();
    const now = new Date();
    const todayPrefix = now.toISOString().slice(0, 10);
    const monthPrefix = now.toISOString().slice(0, 7);

    const successLogs = ai.usageLogs.filter((l) => l.status === 'success');
    const resolveLogUsd = (l: AiUsageLog) => {
      if (typeof l.providerReportedCostUsd === 'number') return l.providerReportedCostUsd;
      if (ai.models.length > 0 && l.usageStatus !== 'unavailable') {
        const calc = estimateRequestCost(
          ai.models,
          l.providerId,
          l.modelId,
          l.inputTokens,
          l.outputTokens,
          null,
          l.cachedInputTokens ?? l.cachedTokens ?? 0,
          l.reasoningTokens ?? 0,
          true
        );
        if (calc.estimatedCostUsd !== null) return calc.estimatedCostUsd;
      }
      return l.estimatedCostUsd ?? 0;
    };

    const globalDailySpentUsd = Number(
      successLogs
        .filter((l) => l.createdAt.startsWith(todayPrefix))
        .reduce((s, l) => s + resolveLogUsd(l), 0)
        .toFixed(6)
    );
    const globalMonthlySpentUsd = Number(
      successLogs
        .filter((l) => l.createdAt.startsWith(monthPrefix))
        .reduce((s, l) => s + resolveLogUsd(l), 0)
        .toFixed(6)
    );

    const orgPolicy = this.getCostPolicy(organizationId);
    const orgDailyLogs = successLogs.filter(
      (l) => l.organizationId === organizationId && l.createdAt.startsWith(todayPrefix)
    );
    const orgMonthLogs = successLogs.filter(
      (l) => l.organizationId === organizationId && l.createdAt.startsWith(monthPrefix)
    );
    const orgDailySpentUsd = Number(orgDailyLogs.reduce((s, l) => s + resolveLogUsd(l), 0).toFixed(6));
    const orgMonthlySpentUsd = Number(orgMonthLogs.reduce((s, l) => s + resolveLogUsd(l), 0).toFixed(6));

    const departmentStatus = Object.entries(orgPolicy.departmentLimitsUsd || {})
      .filter(([, cap]) => Number(cap) > 0)
      .map(([dept, cap]) => {
        const spent = Number(
          orgDailyLogs
            .filter((l) => l.department === dept)
            .reduce((s, l) => s + resolveLogUsd(l), 0)
            .toFixed(6)
        );
        const limitUsd = Number(cap);
        return {
          department: dept,
          spentTodayUsd: spent,
          limitUsd,
          pct: limitUsd > 0 ? Number(((spent / limitUsd) * 100).toFixed(1)) : 0,
        };
      });

    const orgList = includeAllOrgs
      ? this.store.getState().organizations.map((o) => {
          const pol = this.getCostPolicy(o.id);
          const dSpent = Number(
            successLogs
              .filter((l) => l.organizationId === o.id && l.createdAt.startsWith(todayPrefix))
              .reduce((s, l) => s + resolveLogUsd(l), 0)
              .toFixed(6)
          );
          const mSpent = Number(
            successLogs
              .filter((l) => l.organizationId === o.id && l.createdAt.startsWith(monthPrefix))
              .reduce((s, l) => s + resolveLogUsd(l), 0)
              .toFixed(6)
          );
          return {
            organizationId: o.id,
            organizationName: o.name,
            dailySpentUsd: dSpent,
            dailyLimitUsd: pol.dailyLimitUsd,
            monthlySpentUsd: mSpent,
            monthlyLimitUsd: pol.monthlyLimitUsd,
          };
        })
      : [];

    const globalDailyPct =
      globalPolicy.dailyLimitUsd > 0
        ? Number(((globalDailySpentUsd / globalPolicy.dailyLimitUsd) * 100).toFixed(1))
        : 0;
    const globalMonthlyPct =
      globalPolicy.monthlyLimitUsd > 0
        ? Number(((globalMonthlySpentUsd / globalPolicy.monthlyLimitUsd) * 100).toFixed(1))
        : 0;
    const organizationDailyPct =
      orgPolicy.dailyLimitUsd > 0
        ? Number(((orgDailySpentUsd / orgPolicy.dailyLimitUsd) * 100).toFixed(1))
        : 0;
    const organizationMonthlyPct =
      orgPolicy.monthlyLimitUsd > 0
        ? Number(((orgMonthlySpentUsd / orgPolicy.monthlyLimitUsd) * 100).toFixed(1))
        : 0;

    const globalThresholds = (
      globalPolicy.alertThresholds?.length ? globalPolicy.alertThresholds : [50, 75, 90, 100]
    ).sort((a, b) => a - b);
    const orgThresholds = (
      orgPolicy.alertThresholds?.length ? orgPolicy.alertThresholds : [50, 75, 90, 100]
    ).sort((a, b) => a - b);

    const activeAlerts: {
      id: string;
      scope: string;
      label: string;
      thresholdPct: number;
      percentageUsed: number;
      spentUsd: number;
      limitUsd: number;
      severity: 'info' | 'warning' | 'critical';
      channels: AiAlertChannel[];
      action: 'notify' | 'fallback_economical' | 'block_non_essential' | 'block_all';
      customMessage?: string;
    }[] = [];

    const pushPreventiveAlert = (
      id: string,
      scope: string,
      label: string,
      spentUsd: number,
      limitUsd: number,
      pct: number,
      thresholdsList: number[],
      rules?: AiThresholdAlertRule[]
    ) => {
      if (!limitUsd || limitUsd <= 0) return;
      const hit = thresholdsList.filter((t) => pct >= t).pop();
      if (hit === undefined && pct < 100) return;
      const effectiveThreshold = pct >= 100 ? 100 : hit!;
      const matchedRule = rules?.find((r) => r.thresholdPct === effectiveThreshold);
      activeAlerts.push({
        id,
        scope,
        label,
        thresholdPct: effectiveThreshold,
        percentageUsed: pct,
        spentUsd,
        limitUsd,
        severity:
          matchedRule?.severity ??
          (pct >= 100 ? 'critical' : pct >= 75 ? 'warning' : 'info'),
        channels: matchedRule?.channels?.length ? matchedRule.channels : ['dashboard'],
        action: matchedRule?.action ?? (effectiveThreshold >= 100 ? 'block_non_essential' : 'notify'),
        ...(matchedRule?.customMessage ? { customMessage: matchedRule.customMessage } : {}),
      });
    };

    pushPreventiveAlert(
      'prev-global-daily',
      'global_daily',
      'Global Diário',
      globalDailySpentUsd,
      globalPolicy.dailyLimitUsd,
      globalDailyPct,
      globalThresholds,
      globalPolicy.thresholdRules
    );
    pushPreventiveAlert(
      'prev-global-monthly',
      'global_monthly',
      'Global Mensal',
      globalMonthlySpentUsd,
      globalPolicy.monthlyLimitUsd,
      globalMonthlyPct,
      globalThresholds,
      globalPolicy.thresholdRules
    );
    pushPreventiveAlert(
      'prev-org-daily',
      'organization_daily',
      `Organização Diário (${organizationId})`,
      orgDailySpentUsd,
      orgPolicy.dailyLimitUsd,
      organizationDailyPct,
      orgThresholds,
      orgPolicy.thresholdRules
    );
    pushPreventiveAlert(
      'prev-org-monthly',
      'organization_monthly',
      `Organização Mensal (${organizationId})`,
      orgMonthlySpentUsd,
      orgPolicy.monthlyLimitUsd,
      organizationMonthlyPct,
      orgThresholds,
      orgPolicy.thresholdRules
    );
    for (const d of departmentStatus) {
      pushPreventiveAlert(
        `prev-dept-${d.department}`,
        'department_daily',
        `Departamento ${d.department}`,
        d.spentTodayUsd,
        d.limitUsd,
        d.pct,
        orgThresholds,
        orgPolicy.thresholdRules
      );
    }

    const modelUsdLimits = orgPolicy.modelLimitsUsd || {};
    const modelStatusMap = new Map<
      string,
      {
        modelKey: string;
        providerId: string;
        modelId: string;
        spentTodayUsd: number;
        limitUsd: number;
        usdPct: number;
        tokensToday: number;
        dailyTokenLimit: number | null;
        tokenPct: number;
      }
    >();

    for (const m of ai.models) {
      const mKey = `${m.providerId}/${m.modelId}`;
      const usdCap = Number(modelUsdLimits[mKey] ?? modelUsdLimits[m.modelId] ?? 0);
      const hasTokenCap = Boolean(m.dailyTokenLimit && m.dailyTokenLimit > 0);
      if (usdCap > 0 || hasTokenCap) {
        const mLogs = orgDailyLogs.filter(
          (l) => l.providerId === m.providerId && l.modelId === m.modelId
        );
        const spentTodayUsd = Number(mLogs.reduce((s, l) => s + resolveLogUsd(l), 0).toFixed(6));
        const tokensToday = mLogs.reduce((s, l) => s + l.inputTokens + l.outputTokens, 0);
        const usdPct = usdCap > 0 ? Number(((spentTodayUsd / usdCap) * 100).toFixed(1)) : 0;
        const tokenPct =
          hasTokenCap && m.dailyTokenLimit
            ? Number(((tokensToday / m.dailyTokenLimit) * 100).toFixed(1))
            : 0;
        modelStatusMap.set(mKey, {
          modelKey: mKey,
          providerId: m.providerId,
          modelId: m.modelId,
          spentTodayUsd,
          limitUsd: usdCap,
          usdPct,
          tokensToday,
          dailyTokenLimit: m.dailyTokenLimit ?? null,
          tokenPct,
        });
      }
    }

    for (const [rawKey, rawCap] of Object.entries(modelUsdLimits)) {
      const cap = Number(rawCap);
      if (!cap || cap <= 0) continue;
      if (modelStatusMap.has(rawKey)) continue;
      const mLogs = orgDailyLogs.filter(
        (l) => `${l.providerId}/${l.modelId}` === rawKey || l.modelId === rawKey
      );
      const spentTodayUsd = Number(mLogs.reduce((s, l) => s + resolveLogUsd(l), 0).toFixed(6));
      const tokensToday = mLogs.reduce((s, l) => s + l.inputTokens + l.outputTokens, 0);
      const parts = rawKey.split('/');
      modelStatusMap.set(rawKey, {
        modelKey: rawKey,
        providerId: parts.length > 1 ? parts[0] : 'all',
        modelId: parts.length > 1 ? parts.slice(1).join('/') : rawKey,
        spentTodayUsd,
        limitUsd: cap,
        usdPct: Number(((spentTodayUsd / cap) * 100).toFixed(1)),
        tokensToday,
        dailyTokenLimit: null,
        tokenPct: 0,
      });
    }

    const modelStatus = Array.from(modelStatusMap.values());
    for (const ms of modelStatus) {
      if (ms.limitUsd > 0) {
        pushPreventiveAlert(
          `prev-model-usd-${ms.modelKey}`,
          'model_daily',
          `Modelo ${ms.modelKey} (USD)`,
          ms.spentTodayUsd,
          ms.limitUsd,
          ms.usdPct,
          orgThresholds,
          orgPolicy.thresholdRules
        );
      }
      if (ms.dailyTokenLimit && ms.dailyTokenLimit > 0) {
        pushPreventiveAlert(
          `prev-model-tok-${ms.modelKey}`,
          'model_token_daily',
          `Modelo ${ms.modelKey} (Tokens)`,
          ms.tokensToday,
          ms.dailyTokenLimit,
          ms.tokenPct,
          orgThresholds,
          orgPolicy.thresholdRules
        );
      }
    }

    return {
      globalPolicy,
      globalDailySpentUsd,
      globalMonthlySpentUsd,
      globalDailyPct,
      globalMonthlyPct,
      organizationPolicy: orgPolicy,
      organizationDailySpentUsd: orgDailySpentUsd,
      organizationMonthlySpentUsd: orgMonthlySpentUsd,
      organizationDailyPct,
      organizationMonthlyPct,
      departmentStatus,
      modelStatus,
      organizationsSummary: orgList,
      activeAlerts,
    };
  }

  public evaluatePreventiveGuard(params: {
    organizationId: string;
    userId: string;
    department: AiDepartment;
    providerId?: AiProviderId;
    modelId?: string;
    action?: string;
    isCritical?: boolean;
  }) {
    const ai = this.aiState();
    const policy = this.getCostPolicy(params.organizationId);
    const globalPolicy = this.getGlobalCostPolicy();
    const result = evaluateCostPolicyBeforeRequest(
      policy,
      ai.usageLogs,
      params.organizationId,
      params.userId,
      params.department,
      ai.models,
      {
        providerId: params.providerId,
        modelId: params.modelId,
        action: params.action,
        isCritical: Boolean(params.isCritical),
        exceptions: ai.limitExceptions || [],
        globalPolicy,
      }
    );
    const economicalTarget = result.recommendEconomicalFallback
      ? this.pickMostEconomicalModel(params.organizationId)
      : null;

    const reasonStr = String(result.reason || '');
    const exceededScope = !reasonStr
      ? null
      : reasonStr.includes('global diário')
        ? 'global_daily'
        : reasonStr.includes('global mensal')
          ? 'global_monthly'
          : reasonStr.includes('da organização') && reasonStr.includes('diário')
            ? 'organization_daily'
            : reasonStr.includes('da organização') && reasonStr.includes('mensal')
              ? 'organization_monthly'
              : reasonStr.includes('do departamento')
                ? 'department_daily'
                : reasonStr.includes('do provedor')
                  ? 'provider_daily'
                  : reasonStr.includes('do modelo')
                    ? 'model_daily'
                    : reasonStr.includes('do usuário')
                      ? 'user_daily'
                      : 'policy_limit';

    return {
      ...result,
      exceededScope,
      organizationId: params.organizationId,
      department: params.department,
      providerId: params.providerId || null,
      modelId: params.modelId || null,
      isCritical: Boolean(params.isCritical),
      economicalFallbackTarget: economicalTarget
        ? `${economicalTarget.providerId}/${economicalTarget.modelId}`
        : null,
      evaluatedPolicies: {
        globalDailyLimitUsd: globalPolicy.dailyLimitUsd,
        globalMonthlyLimitUsd: globalPolicy.monthlyLimitUsd,
        globalOnExceedAction: globalPolicy.onExceedAction,
        orgDailyLimitUsd: policy.dailyLimitUsd,
        orgMonthlyLimitUsd: policy.monthlyLimitUsd,
        orgOnExceedAction: policy.onExceedAction,
        departmentDailyLimitUsd: policy.departmentLimitsUsd?.[params.department] ?? 0,
      },
      checkedAt: new Date().toISOString(),
    };
  }

  public getDashboardAnalytics(organizationId: string, filterOrPeriod: UsagePeriodFilter | UsageFilterOptions = 'all') {
    const ai = this.aiState();
    const providers = this.listProviders(organizationId);
    const policy = this.getCostPolicy(organizationId);
    const fx = this.getExchangeConfig();
    const analytics = buildUsageAnalytics(
      ai.usageLogs,
      organizationId,
      ai.models,
      policy,
      filterOrPeriod,
      fx,
      ai.limitExceptions || [],
      ai.accountingAlerts || []
    );
    return {
      providersSummary: {
        total: providers.length,
        connected: providers.filter((p) => p.status === 'CONECTADO').length,
        awaiting: providers.filter((p) => p.status === 'AGUARDANDO CONFIGURAÇÃO').length,
        error: providers.filter((p) => p.status === 'ERRO').length,
      },
      activeModelsCount: ai.models.filter((m) => m.isActive).length,
      encryptionConfigured: hasMasterEncryptionKey(this.masterKeyOverride),
      circuits: this.observability.getAllCircuits(),
      policy,
      actions: this.listActions(),
      limitExceptions: this.listLimitExceptions(organizationId),
      accountingAlerts: (ai.accountingAlerts || []).filter((a) => a.organizationId === organizationId),
      ...analytics,
    };
  }

  public listUsageLogs(organizationId: string, filter: UsageFilterOptions = {}) {
    const orgLogs = this.aiState().usageLogs.filter((l) => l.organizationId === organizationId);
    return filterLogs(orgLogs, filter);
  }

  public getUsageLogDetail(organizationId: string, idOrRequestId: string) {
    const log = this.aiState().usageLogs.find(
      (l) => l.organizationId === organizationId && (l.id === idOrRequestId || l.requestId === idOrRequestId)
    );
    if (!log) return null;
    const fx = this.getExchangeConfig();
    const calc =
      log.usageStatus === 'unavailable'
        ? null
        : estimateRequestCost(
            this.aiState().models,
            log.providerId,
            log.modelId,
            log.inputTokens,
            log.outputTokens,
            log.providerReportedCostUsd,
            log.cachedInputTokens ?? log.cachedTokens ?? 0,
            log.reasoningTokens ?? 0,
            true,
            fx
          );
    const effectiveUsd = log.providerReportedCostUsd ?? calc?.estimatedCostUsd ?? log.estimatedCostUsd ?? null;
    const effectiveBrl =
      effectiveUsd !== null ? Number((effectiveUsd * (log.exchangeRate || fx.rate)).toFixed(4)) : null;

    // Sanitized request detail — never exposes raw API keys or sensitive prompt text
    return {
      id: log.id,
      requestId: log.requestId,
      traceId: log.traceId,
      organizationId: log.organizationId,
      userId: log.userId,
      clientId: log.clientId || null,
      billingCategory: log.billingCategory || (log.clientId ? 'client_included' : 'internal_agency'),
      department: log.department,
      action: log.action || log.purpose,
      purpose: log.purpose,
      providerId: log.providerId,
      modelId: log.modelId,
      effectiveProvider: log.effectiveProvider || log.providerId,
      fallbackUsed: log.fallbackUsed,
      fallbackFrom: log.fallbackFrom || null,
      operation: log.operation,
      rawInputTokens: log.rawInputTokens ?? (log.usageStatus === 'unavailable' ? null : log.inputTokens),
      rawOutputTokens: log.rawOutputTokens ?? (log.usageStatus === 'unavailable' ? null : log.outputTokens),
      cachedInputTokens: log.cachedInputTokens ?? log.cachedTokens ?? 0,
      reasoningTokens: log.reasoningTokens ?? null,
      usageStatus: log.usageStatus || 'confirmed',
      inputCost: log.inputCost ?? calc?.inputCost ?? null,
      outputCost: log.outputCost ?? calc?.outputCost ?? null,
      cacheCost: log.cacheCost ?? calc?.cacheCost ?? null,
      reasoningCost: log.reasoningCost ?? calc?.reasoningCost ?? null,
      estimatedCostUsd: effectiveUsd,
      providerReportedCostUsd: log.providerReportedCostUsd ?? null,
      costStatus: log.costStatus || (log.costReliable ? 'estimated' : 'unavailable'),
      costReliable: calc ? calc.costReliable : log.costReliable,
      currency: log.currency || 'USD',
      exchangeRate: log.exchangeRate || fx.rate,
      exchangeRateDate: log.exchangeRateDate || fx.rateDate,
      exchangeRateSource: log.exchangeRateSource || fx.source,
      totalCostBRL: effectiveBrl,
      latencyMs: log.latencyMs,
      status: log.status,
      errorMessage: log.errorMessage || null,
      isCritical: Boolean(log.isCritical),
      responseCached: Boolean(log.responseCached),
      reconciledWithProvider: Boolean(log.reconciledWithProvider),
      reconciledAt: log.reconciledAt || null,
      startedAt: log.startedAt || log.createdAt,
      completedAt: log.completedAt || log.createdAt,
      createdAt: log.createdAt,
    };
  }

  public reconcileUsageLog(
    organizationId: string,
    idOrRequestId: string,
    patch: { providerReportedCostUsd?: number; reconciledWithProvider?: boolean },
    actorUserId: string
  ) {
    const ai = this.aiState();
    const log = ai.usageLogs.find(
      (l) => l.organizationId === organizationId && (l.id === idOrRequestId || l.requestId === idOrRequestId)
    );
    if (!log) throw new Error('REGISTRO_NAO_ENCONTRADO');
    const fx = this.getExchangeConfig();
    if (typeof patch.providerReportedCostUsd === 'number' && Number.isFinite(patch.providerReportedCostUsd)) {
      log.providerReportedCostUsd = Number(patch.providerReportedCostUsd.toFixed(6));
      log.estimatedCostUsd = log.providerReportedCostUsd;
      log.costStatus = 'confirmed';
      log.costReliable = true;
      log.totalCostBRL = Number((log.providerReportedCostUsd * (log.exchangeRate || fx.rate)).toFixed(4));
    }
    log.reconciledWithProvider = patch.reconciledWithProvider ?? true;
    log.reconciledAt = new Date().toISOString();
    this.store.audit(organizationId, actorUserId, 'AI_USAGE_RECONCILED', 'AiUsageLog', log.requestId, {
      providerReportedCostUsd: log.providerReportedCostUsd,
      reconciledWithProvider: log.reconciledWithProvider,
    });
    this.store.save();
    return log;
  }

  public exportUsageReport(
    organizationId: string,
    format: 'csv' | 'xlsx' | 'pdf',
    filter: UsageFilterOptions = {},
    segmentBy: ExportSegmentMode = 'detailed'
  ): { buffer: Buffer; contentType: string; filename: string } {
    const ai = this.aiState();
    const fx = this.getExchangeConfig();
    const filtered = this.listUsageLogs(organizationId, filter);
    const clientNameMap = new Map(
      (this.store.getState().clients || []).map((c) => [c.id, c.name])
    );

    const rows: ExportRow[] = filtered.map((l) => {
      const calc =
        l.usageStatus === 'unavailable'
          ? null
          : estimateRequestCost(
              ai.models,
              l.providerId,
              l.modelId,
              l.inputTokens,
              l.outputTokens,
              l.providerReportedCostUsd,
              l.cachedInputTokens ?? l.cachedTokens ?? 0,
              l.reasoningTokens ?? 0,
              true,
              fx
            );
      const costUsd = l.providerReportedCostUsd ?? calc?.estimatedCostUsd ?? l.estimatedCostUsd ?? null;
      const costBrl = costUsd !== null ? Number((costUsd * (l.exchangeRate || fx.rate)).toFixed(4)) : null;
      const unavailableTokens = l.usageStatus === 'unavailable';
      const resolvedClientName = l.clientId
        ? clientNameMap.get(l.clientId) || l.clientId
        : 'Agência (Interno)';
      return {
        requestId: l.requestId,
        date: l.createdAt,
        organizationId: l.organizationId,
        userId: l.userId,
        clientId: l.clientId || 'Agência (Interno)',
        clientName: resolvedClientName,
        billingCategory: l.billingCategory || (l.clientId ? 'client_included' : 'internal_agency'),
        department: l.department,
        action: l.action || l.purpose,
        provider: l.providerId,
        model: l.modelId,
        inputTokens: unavailableTokens ? null : l.inputTokens,
        outputTokens: unavailableTokens ? null : l.outputTokens,
        cachedInputTokens: unavailableTokens ? null : l.cachedInputTokens ?? l.cachedTokens ?? 0,
        reasoningTokens: unavailableTokens ? null : l.reasoningTokens ?? null,
        costUsd,
        costBrl,
        costStatus:
          l.costStatus ||
          (l.providerReportedCostUsd !== null ? 'confirmed' : costUsd !== null ? 'estimated' : 'unavailable'),
        latencyMs: l.latencyMs,
        status: l.status,
      };
    });

    const dateTag = new Date().toISOString().slice(0, 10);
    const segSuffix = segmentBy === 'detailed' ? '' : `-${segmentBy}`;
    if (format === 'csv') {
      return {
        buffer: exportUsageCsv(rows, segmentBy),
        contentType: 'text/csv; charset=utf-8',
        filename: `ner-ai-faturamento-${organizationId}${segSuffix}-${dateTag}.csv`,
      };
    }
    if (format === 'xlsx') {
      return {
        buffer: exportUsageXlsx(rows),
        contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        filename: `ner-ai-cost-intelligence-${organizationId}-${dateTag}.xlsx`,
      };
    }
    const analytics = this.getDashboardAnalytics(organizationId, filter);
    const summaryLines = [
      `Organizacao: ${organizationId} | Periodo: ${filter.period || 'all'} | Registros: ${rows.length}`,
      `Total Tokens: ${analytics.summary.totalTokens.toLocaleString('pt-BR')} (In: ${analytics.summary.totalInputTokens} | Out: ${analytics.summary.totalOutputTokens} | Cache: ${analytics.summary.totalCachedInputTokens})`,
      `Custo Total USD: $${analytics.summary.totalCostUsd.toFixed(6)} | Custo Total BRL: R$${analytics.summary.totalCostBrl.toFixed(4)} (Taxa: ${fx.rate})`,
      `Taxa de Sucesso: ${analytics.summary.successRatePct}% | Latencia Media: ${analytics.summary.avgLatencyMs}ms`,
    ];
    return {
      buffer: exportUsagePdf(summaryLines, rows, segmentBy),
      contentType: 'application/pdf',
      filename: `ner-ai-faturamento-${organizationId}${segSuffix}-${dateTag}.pdf`,
    };
  }

  // --- MEMORY & KNOWLEDGE (STRICT MULTI-TENANT ISOLATION) ---
  public addKnowledgeDoc(params: {
    organizationId: string;
    projectId?: string | null;
    clientId?: string | null;
    title: string;
    content: string;
    tags?: string[];
  }) {
    const ai = this.aiState();
    const doc = {
      id: `kdoc-${Date.now()}`,
      organizationId: params.organizationId,
      projectId: params.projectId || null,
      clientId: params.clientId || null,
      title: params.title.trim(),
      content: params.content,
      tags: params.tags || [],
      createdAt: new Date().toISOString(),
    };
    ai.knowledgeDocs.push(doc);
    this.store.save();
    return doc;
  }

  public purgeConversationMemory(organizationId: string, conversationId: string, clientId?: string | null) {
    const ai = this.aiState();
    const before = ai.memories.length;
    ai.memories = ai.memories.filter((m) => {
      if (m.organizationId !== organizationId || m.conversationId !== conversationId) return true;
      if (clientId !== undefined && m.clientId !== clientId) return true;
      return false;
    });
    this.store.save();
    return before - ai.memories.length;
  }

  public pruneExpiredMemories(): number {
    const ai = this.aiState();
    const now = Date.now();
    const before = ai.memories.length;
    ai.memories = ai.memories.filter((m) => {
      const ttlMs = Math.max(1, Number(m.retentionDays) || 30) * 86400_000;
      const created = new Date(m.createdAt).getTime();
      return Number.isFinite(created) && now - created <= ttlMs;
    });
    return before - ai.memories.length;
  }

  // --- CENTRAL GATEWAY EXECUTION ---
  public async execute(params: AiGatewayExecuteParams): Promise<AiGatewayExecuteResult> {
    const ai = this.aiState();
    const { requestId, traceId } = this.observability.generateIds();
    const startedAt = Date.now();
    const startedAtIso = new Date(startedAt).toISOString();
    const fx = this.getExchangeConfig();

    const { actionId, definition: actionDef } = resolveActionIdentifier(
      params.action,
      params.department,
      params.purpose,
      this.listActions()
    );
    const isCritical = params.isCritical ?? Boolean(actionDef?.isCritical);
    const billingCategory: AiBillingCategory =
      params.billingCategory || (params.clientId ? 'client_included' : 'internal_agency');

    const rule = ai.routingRules.find((r) => r.purpose === params.purpose);
    const promptTpl = params.promptCode
      ? ai.prompts.find(
          (p) =>
            p.code === params.promptCode &&
            p.isActive &&
            (p.organizationId === params.organizationId || p.organizationId === 'org-1')
        )
      : undefined;

    let primaryProvider: AiProviderId =
      params.overrideProviderId ||
      promptTpl?.preferredProviderId ||
      rule?.primaryProviderId ||
      'gemini';
    let primaryModel: string =
      params.overrideModelId ||
      promptTpl?.preferredModelId ||
      rule?.primaryModelId ||
      'gemini-4-hydrogen';

    // 1. Evaluate Global + Organization + Multi-scope Cost Policy BEFORE calling upstream AI provider
    const policy = this.getCostPolicy(params.organizationId);
    const globalPolicy = this.getGlobalCostPolicy();
    const budgetCheck = evaluateCostPolicyBeforeRequest(
      policy,
      ai.usageLogs,
      params.organizationId,
      params.userId,
      params.department,
      ai.models,
      {
        providerId: primaryProvider,
        modelId: primaryModel,
        action: actionId,
        isCritical,
        exceptions: ai.limitExceptions || [],
        globalPolicy,
      }
    );

    if (!budgetCheck.allowed) {
      this.recordUsage({
        requestId,
        idempotencyKey: params.idempotencyKey,
        traceId,
        organizationId: params.organizationId,
        userId: params.userId,
        clientId: params.clientId,
        billingCategory,
        department: params.department,
        action: actionId,
        purpose: params.purpose,
        providerId: primaryProvider,
        modelId: primaryModel,
        fallbackUsed: false,
        operation: params.stream ? 'stream' : params.structuredJsonSchema ? 'structured' : 'chat',
        inputTokens: 0,
        outputTokens: 0,
        cachedTokens: 0,
        rawInputTokens: 0,
        rawOutputTokens: 0,
        rawTotalTokens: 0,
        cachedInputTokens: 0,
        reasoningTokens: 0,
        usageStatus: 'confirmed',
        inputCost: 0,
        outputCost: 0,
        cacheCost: 0,
        reasoningCost: 0,
        estimatedCostUsd: 0,
        providerReportedCostUsd: null,
        costStatus: 'confirmed',
        costReliable: true,
        currency: 'USD',
        exchangeRate: fx.rate,
        exchangeRateDate: fx.rateDate,
        exchangeRateSource: fx.source,
        totalCostBRL: 0,
        isCritical,
        responseCached: false,
        reconciledWithProvider: false,
        startedAt: startedAtIso,
        completedAt: new Date().toISOString(),
        latencyMs: Date.now() - startedAt,
        status: 'budget_blocked',
        errorMessage: budgetCheck.reason,
      });
      throw new AiUpstreamError(primaryProvider, budgetCheck.reason || 'Limite de orçamento atingido.', 429, 'rate_limit');
    }

    // Automatic economical downgrade if policy specifies 'fallback_economical'
    let forcedEconomicalFrom: string | null = null;
    if (budgetCheck.recommendEconomicalFallback) {
      const cheapest = this.pickMostEconomicalModel(params.organizationId);
      if (cheapest && (cheapest.providerId !== primaryProvider || cheapest.modelId !== primaryModel)) {
        forcedEconomicalFrom = `${primaryProvider}/${primaryModel}`;
        primaryProvider = cheapest.providerId;
        primaryModel = cheapest.modelId;
      }
    }

    // 2. Build sanitized messages + History Compaction + Tenant-Isolated Memory + Knowledge Citations
    const sanitizedMessages: AiChatMessage[] = [];
    let compactedSummary = '';
    if (params.conversationId) {
      const fullHistory = ai.memories.filter(
        (m) => m.organizationId === params.organizationId && m.conversationId === params.conversationId
      );
      if (fullHistory.length > 6) {
        const older = fullHistory.slice(0, fullHistory.length - 4);
        compactedSummary = `\n[Resumo compacto do histórico (${older.length} mensagens anteriores)]\n${older
          .map((m) => `${m.role}: ${m.content.slice(0, 120)}`)
          .join(' | ')}`;
      }
      const recent = fullHistory.slice(-4);
      for (const h of recent) {
        if (h.role === 'user' || h.role === 'assistant') {
          sanitizedMessages.push({ role: h.role, content: h.content });
        }
      }
    }

    const citations: { sourceId: string; title: string }[] = [];
    let knowledgeContext = '';
    const relevantDocs = ai.knowledgeDocs
      .filter((d) => {
        if (d.organizationId !== params.organizationId) return false;
        if (params.projectId && d.projectId && d.projectId !== params.projectId) return false;
        if (params.clientId && d.clientId && d.clientId !== params.clientId) return false;
        return true;
      })
      .slice(-3);

    if (relevantDocs.length > 0) {
      knowledgeContext = `\n\n[Base de Conhecimento Autorizada da Organização]\n${relevantDocs
        .map((d) => {
          citations.push({ sourceId: d.id, title: d.title });
          return `Fonte (${d.title}): ${d.content.slice(0, 600)}`;
        })
        .join('\n')}`;
    }

    for (const msg of params.messages) {
      sanitizedMessages.push({
        ...msg,
        content: sanitizePromptInput(msg.content),
      });
    }

    const systemInstruction = [
      promptTpl?.systemPrompt || '',
      params.systemInstruction || '',
      compactedSummary,
      knowledgeContext,
    ]
      .filter(Boolean)
      .join('\n')
      .trim() || undefined;

    // Optional safe cache ONLY when explicitly cacheable and non-client-specific
    const canUseSafeCache =
      Boolean(params.cacheable || actionDef?.cacheable) &&
      !params.clientId &&
      !params.stream &&
      !params.structuredJsonSchema &&
      sanitizedMessages.length === 1;
    const cacheKey = canUseSafeCache
      ? `${params.organizationId}:${actionId}:${primaryProvider}:${primaryModel}:${sanitizedMessages[0].content.trim()}`
      : null;

    if (cacheKey) {
      const hit = this.safeResponseCache.get(cacheKey);
      if (hit && hit.expiresAt > Date.now()) {
        const latencyMs = Date.now() - startedAt;
        this.recordUsage({
          requestId,
          idempotencyKey: params.idempotencyKey,
          traceId,
          organizationId: params.organizationId,
          userId: params.userId,
          clientId: params.clientId,
          billingCategory,
          department: params.department,
          action: actionId,
          purpose: params.purpose,
          providerId: hit.providerId,
          modelId: hit.modelId,
          effectiveProvider: hit.providerId,
          fallbackUsed: Boolean(forcedEconomicalFrom),
          fallbackFrom: forcedEconomicalFrom,
          operation: 'chat',
          inputTokens: 0,
          outputTokens: 0,
          cachedTokens: 0,
          rawInputTokens: 0,
          rawOutputTokens: 0,
          rawTotalTokens: 0,
          cachedInputTokens: 0,
          reasoningTokens: 0,
          usageStatus: 'confirmed',
          inputCost: 0,
          outputCost: 0,
          cacheCost: 0,
          reasoningCost: 0,
          estimatedCostUsd: 0,
          providerReportedCostUsd: 0,
          costStatus: 'confirmed',
          costReliable: true,
          currency: 'USD',
          exchangeRate: fx.rate,
          exchangeRateDate: fx.rateDate,
          exchangeRateSource: fx.source,
          totalCostBRL: 0,
          isCritical,
          responseCached: true,
          reconciledWithProvider: true,
          startedAt: startedAtIso,
          completedAt: new Date().toISOString(),
          latencyMs,
          status: 'success',
          errorMessage: null,
        });
        return {
          requestId,
          traceId,
          providerId: hit.providerId,
          modelId: hit.modelId,
          action: actionId,
          effectiveProvider: hit.providerId,
          fallbackUsed: Boolean(forcedEconomicalFrom),
          fallbackFrom: forcedEconomicalFrom,
          text: hit.text,
          inputTokens: 0,
          outputTokens: 0,
          cachedTokens: 0,
          reasoningTokens: 0,
          usageStatus: 'confirmed',
          inputCost: 0,
          outputCost: 0,
          cacheCost: 0,
          reasoningCost: 0,
          estimatedCostUsd: 0,
          costReliable: true,
          costStatus: 'confirmed',
          totalCostBRL: 0,
          exchangeRate: fx.rate,
          responseCached: true,
          latencyMs,
          citations,
          budgetAlert: budgetCheck.alertMessage,
        };
      }
    }

    // 3. Build candidate targets (Primary -> Optional Fallback respecting cost rules)
    const candidates: { providerId: AiProviderId; modelId: string; isFallback: boolean }[] = [
      { providerId: primaryProvider, modelId: primaryModel, isFallback: Boolean(forcedEconomicalFrom) },
    ];

    if (
      !params.overrideProviderId &&
      rule?.fallbackProviderId &&
      rule?.fallbackModelId &&
      (rule.fallbackProviderId !== primaryProvider || rule.fallbackModelId !== primaryModel)
    ) {
      const pCost = this.getModelUnitCost(primaryProvider, primaryModel);
      const fCost = this.getModelUnitCost(rule.fallbackProviderId, rule.fallbackModelId);
      const isMoreExpensive = pCost !== null && fCost !== null && fCost > pCost;
      if (!isMoreExpensive || rule.allowMoreExpensiveFallback) {
        candidates.push({
          providerId: rule.fallbackProviderId,
          modelId: rule.fallbackModelId,
          isFallback: true,
        });
      }
    }

    let lastError: Error | null = null;
    const timeoutMs = rule?.timeoutMs || 35_000;
    const maxRetries = params.allowRetry === false ? 0 : Math.min(2, rule?.maxRetries ?? 1);

    for (const candidate of candidates) {
      const modelRecord = ai.models.find(
        (m) => m.providerId === candidate.providerId && m.modelId === candidate.modelId
      );
      if (modelRecord && !modelRecord.isActive) {
        lastError = new AiUpstreamError(
          candidate.providerId,
          `Modelo ${candidate.modelId} está desativado no gerenciador.`,
          400,
          'bad_request'
        );
        continue;
      }

      if (!this.observability.isCircuitAllowed(candidate.providerId)) {
        lastError = new AiUpstreamError(
          candidate.providerId,
          `Circuit breaker aberto para ${candidate.providerId} devido a falhas consecutivas.`,
          503,
          'unavailable'
        );
        continue;
      }

      const adapter = this.adapters[candidate.providerId];
      const creds = resolveProviderCredentials(
        ai.providers,
        candidate.providerId,
        params.organizationId,
        this.masterKeyOverride
      );

      const providerCfg = ai.providers.find((p) => p.providerId === candidate.providerId);
      if (providerCfg?.requiresKey && !creds.apiKey) {
        lastError = new AiUpstreamError(
          candidate.providerId,
          `Provedor ${providerCfg.displayName} está AGUARDANDO CONFIGURAÇÃO (sem chave configurada).`,
          503,
          'auth'
        );
        continue;
      }

      for (let attempt = 0; attempt <= maxRetries; attempt++) {
        try {
          if (modelRecord?.maxInputTokens && modelRecord.maxInputTokens > 0) {
            const totalChars =
              (systemInstruction?.length || 0) +
              sanitizedMessages.reduce((s, m) => s + (m.content?.length || 0), 0);
            const approxInputTokens = Math.ceil(totalChars / 3.5);
            if (approxInputTokens > modelRecord.maxInputTokens) {
              throw new AiUpstreamError(
                candidate.providerId,
                `Limite de tokens de entrada do modelo ${candidate.modelId} (${modelRecord.maxInputTokens} tokens) excedido (~${approxInputTokens} tokens estimados).`,
                400,
                'bad_request'
              );
            }
          }

          const desiredMaxOut = params.maxOutputTokens ?? promptTpl?.maxOutputTokens ?? 2048;
          const enforcedMaxOut =
            modelRecord?.maxOutputTokens && modelRecord.maxOutputTokens > 0
              ? Math.min(desiredMaxOut, modelRecord.maxOutputTokens)
              : desiredMaxOut;

          const reqPayload = {
            modelId: candidate.modelId,
            messages: sanitizedMessages,
            systemInstruction,
            temperature: params.temperature ?? promptTpl?.temperature,
            maxOutputTokens: enforcedMaxOut,
            structuredJsonSchema: params.structuredJsonSchema,
            timeoutMs,
          };

          const adapterRes: AiAdapterResponse =
            params.stream && params.onChunk
              ? await adapter.generateStream(creds, reqPayload, params.onChunk)
              : await adapter.generate(creds, reqPayload);

          this.observability.recordSuccess(candidate.providerId);

          const usageReported = adapterRes.usageReported !== false;
          const usageStatus: AiUsageStatus = usageReported ? 'confirmed' : 'unavailable';
          const cachedIn = adapterRes.cachedTokens || 0;
          const reasoningTok = adapterRes.reasoningTokens ?? null;

          const costInfo = estimateRequestCost(
            ai.models,
            candidate.providerId,
            adapterRes.modelUsed,
            adapterRes.inputTokens,
            adapterRes.outputTokens,
            adapterRes.providerReportedCostUsd,
            cachedIn,
            reasoningTok ?? 0,
            usageReported,
            fx
          );

          const completedAtIso = new Date().toISOString();
          const latencyMs = Date.now() - startedAt;
          const fallbackFrom = forcedEconomicalFrom || (candidate.isFallback ? `${primaryProvider}/${primaryModel}` : null);

          this.recordUsage({
            requestId,
            idempotencyKey: params.idempotencyKey,
            traceId,
            organizationId: params.organizationId,
            userId: params.userId,
            clientId: params.clientId,
            billingCategory,
            department: params.department,
            action: actionId,
            purpose: params.purpose,
            providerId: candidate.providerId,
            modelId: adapterRes.modelUsed,
            effectiveProvider: adapterRes.providerReportedVendor || candidate.providerId,
            fallbackUsed: candidate.isFallback,
            fallbackFrom,
            operation: params.stream ? 'stream' : params.structuredJsonSchema ? 'structured' : 'chat',
            inputTokens: usageReported ? adapterRes.inputTokens : 0,
            outputTokens: usageReported ? adapterRes.outputTokens : 0,
            cachedTokens: usageReported ? cachedIn : 0,
            rawInputTokens: usageReported ? adapterRes.inputTokens : null,
            rawOutputTokens: usageReported ? adapterRes.outputTokens : null,
            rawTotalTokens: usageReported ? adapterRes.inputTokens + adapterRes.outputTokens : null,
            cachedInputTokens: usageReported ? cachedIn : null,
            reasoningTokens: usageReported ? reasoningTok : null,
            usageStatus,
            inputCost: costInfo.inputCost,
            outputCost: costInfo.outputCost,
            cacheCost: costInfo.cacheCost,
            reasoningCost: costInfo.reasoningCost,
            estimatedCostUsd: costInfo.estimatedCostUsd,
            providerReportedCostUsd: adapterRes.providerReportedCostUsd ?? null,
            costStatus: costInfo.costStatus,
            costReliable: costInfo.costReliable,
            currency: 'USD',
            exchangeRate: costInfo.exchangeRate,
            exchangeRateDate: costInfo.exchangeRateDate,
            exchangeRateSource: costInfo.exchangeRateSource,
            totalCostBRL: costInfo.totalCostBRL,
            isCritical,
            responseCached: false,
            reconciledWithProvider: typeof adapterRes.providerReportedCostUsd === 'number',
            startedAt: startedAtIso,
            completedAt: completedAtIso,
            latencyMs,
            status: 'success',
            errorMessage: null,
          });

          if (cacheKey) {
            this.safeResponseCache.set(cacheKey, {
              text: adapterRes.text,
              modelId: adapterRes.modelUsed,
              providerId: candidate.providerId,
              expiresAt: Date.now() + 5 * 60_000,
            });
          }

          if (params.conversationId) {
            const lastUserMsg = params.messages[params.messages.length - 1];
            if (lastUserMsg) {
              this.saveMemoryEntry(params.organizationId, params.conversationId, 'user', lastUserMsg.content, [], params.projectId, params.clientId);
            }
            this.saveMemoryEntry(params.organizationId, params.conversationId, 'assistant', adapterRes.text, citations, params.projectId, params.clientId);
          }

          return {
            requestId,
            traceId,
            providerId: candidate.providerId,
            modelId: adapterRes.modelUsed,
            action: actionId,
            effectiveProvider: adapterRes.providerReportedVendor || candidate.providerId,
            fallbackUsed: candidate.isFallback,
            fallbackFrom,
            text: adapterRes.text,
            inputTokens: usageReported ? adapterRes.inputTokens : 0,
            outputTokens: usageReported ? adapterRes.outputTokens : 0,
            cachedTokens: usageReported ? cachedIn : 0,
            reasoningTokens: usageReported ? reasoningTok : null,
            usageStatus,
            inputCost: costInfo.inputCost,
            outputCost: costInfo.outputCost,
            cacheCost: costInfo.cacheCost,
            reasoningCost: costInfo.reasoningCost,
            estimatedCostUsd: costInfo.estimatedCostUsd,
            costReliable: costInfo.costReliable,
            costStatus: costInfo.costStatus,
            totalCostBRL: costInfo.totalCostBRL,
            exchangeRate: costInfo.exchangeRate,
            responseCached: false,
            latencyMs,
            citations,
            budgetAlert: budgetCheck.alertMessage,
          };
        } catch (err: any) {
          const upstreamErr =
            err instanceof AiUpstreamError
              ? err
              : new AiUpstreamError(candidate.providerId, err?.message || 'Erro no provedor de IA', 500, 'unavailable');
          lastError = upstreamErr;
          this.observability.recordFailure(candidate.providerId, upstreamErr.message);

          // Never retry auth errors or bad requests
          if (!upstreamErr.retryable || attempt === maxRetries) {
            break;
          }
        }
      }
    }

    const finalErr = lastError || new AiUpstreamError(primaryProvider, 'Nenhum provedor disponível para atender a requisição.', 503, 'unavailable');
    const finalStatus = finalErr instanceof AiUpstreamError && finalErr.category === 'rate_limit' ? 'rate_limited' : 'error';
    this.recordUsage({
      requestId,
      idempotencyKey: params.idempotencyKey,
      traceId,
      organizationId: params.organizationId,
      userId: params.userId,
      clientId: params.clientId,
      billingCategory,
      department: params.department,
      action: actionId,
      purpose: params.purpose,
      providerId: primaryProvider,
      modelId: primaryModel,
      fallbackUsed: false,
      operation: params.stream ? 'stream' : 'chat',
      inputTokens: 0,
      outputTokens: 0,
      cachedTokens: 0,
      rawInputTokens: 0,
      rawOutputTokens: 0,
      rawTotalTokens: 0,
      cachedInputTokens: 0,
      reasoningTokens: 0,
      usageStatus: 'unavailable',
      inputCost: 0,
      outputCost: 0,
      cacheCost: 0,
      reasoningCost: 0,
      estimatedCostUsd: 0,
      providerReportedCostUsd: null,
      costStatus: 'unavailable',
      costReliable: false,
      currency: 'USD',
      exchangeRate: fx.rate,
      exchangeRateDate: fx.rateDate,
      exchangeRateSource: fx.source,
      totalCostBRL: 0,
      isCritical,
      responseCached: false,
      reconciledWithProvider: false,
      startedAt: startedAtIso,
      completedAt: new Date().toISOString(),
      latencyMs: Date.now() - startedAt,
      status: finalStatus,
      errorMessage: sanitizeErrorText(finalErr.message),
    });

    throw finalErr;
  }

  public async embed(params: {
    organizationId: string;
    userId: string;
    department: AiDepartment;
    action?: string;
    texts: string[];
    overrideProviderId?: AiProviderId;
    overrideModelId?: string;
  }): Promise<AiEmbeddingResponse & { providerId: AiProviderId; requestId: string }> {
    const ai = this.aiState();
    const { requestId, traceId } = this.observability.generateIds();
    const startedAt = Date.now();
    const fx = this.getExchangeConfig();
    const rule = ai.routingRules.find((r) => r.purpose === 'embeddings');
    const providerId: AiProviderId = params.overrideProviderId || rule?.primaryProviderId || 'gemini';
    const modelId: string = params.overrideModelId || rule?.primaryModelId || 'gemini-embedding-2';

    const adapter = this.adapters[providerId];
    const creds = resolveProviderCredentials(ai.providers, providerId, params.organizationId, this.masterKeyOverride);
    const res = await adapter.embed(creds, { modelId, texts: params.texts });
    const usageReported = res.usageReported !== false;
    const costInfo = estimateRequestCost(ai.models, providerId, res.modelUsed, res.inputTokens, 0, null, 0, 0, usageReported, fx);

    this.recordUsage({
      requestId,
      traceId,
      organizationId: params.organizationId,
      userId: params.userId,
      billingCategory: 'internal_agency',
      department: params.department,
      action: params.action || 'intelligence.embeddings.generate',
      purpose: 'embeddings',
      providerId,
      modelId: res.modelUsed,
      fallbackUsed: false,
      operation: 'embedding',
      inputTokens: res.inputTokens,
      outputTokens: 0,
      cachedTokens: 0,
      rawInputTokens: usageReported ? res.inputTokens : null,
      rawOutputTokens: 0,
      rawTotalTokens: usageReported ? res.inputTokens : null,
      cachedInputTokens: 0,
      reasoningTokens: 0,
      usageStatus: usageReported ? 'confirmed' : 'estimated',
      inputCost: costInfo.inputCost,
      outputCost: 0,
      cacheCost: 0,
      reasoningCost: 0,
      estimatedCostUsd: costInfo.estimatedCostUsd,
      providerReportedCostUsd: null,
      costStatus: costInfo.costStatus,
      costReliable: costInfo.costReliable,
      currency: 'USD',
      exchangeRate: costInfo.exchangeRate,
      exchangeRateDate: costInfo.exchangeRateDate,
      exchangeRateSource: costInfo.exchangeRateSource,
      totalCostBRL: costInfo.totalCostBRL,
      startedAt: new Date(startedAt).toISOString(),
      completedAt: new Date().toISOString(),
      latencyMs: Date.now() - startedAt,
      status: 'success',
      errorMessage: null,
    });

    return { ...res, providerId, requestId };
  }

  private pickMostEconomicalModel(organizationId: string): { providerId: AiProviderId; modelId: string } | null {
    const ai = this.aiState();
    const candidates = ai.models
      .filter((m) => m.isActive && !m.capabilities?.embeddings && m.inputCostPer1M !== null && m.outputCostPer1M !== null)
      .filter((m) => {
        const prov = ai.providers.find((p) => p.providerId === m.providerId);
        if (!prov || !prov.requiresKey) return true;
        const creds = resolveProviderCredentials(ai.providers, m.providerId, organizationId, this.masterKeyOverride);
        return Boolean(creds.apiKey);
      })
      .sort((a, b) => (a.inputCostPer1M! + a.outputCostPer1M!) - (b.inputCostPer1M! + b.outputCostPer1M!));
    if (candidates.length === 0) return null;
    return { providerId: candidates[0].providerId, modelId: candidates[0].modelId };
  }

  private getModelUnitCost(providerId: AiProviderId, modelId: string): number | null {
    const m = this.aiState().models.find((x) => x.providerId === providerId && x.modelId === modelId);
    if (!m || m.inputCostPer1M === null || m.outputCostPer1M === null) return null;
    return m.inputCostPer1M + m.outputCostPer1M;
  }

  private saveMemoryEntry(
    organizationId: string,
    conversationId: string,
    role: 'user' | 'assistant',
    content: string,
    citations: { sourceId: string; title: string }[],
    projectId?: string | null,
    clientId?: string | null
  ) {
    const ai = this.aiState();
    const entry: AiMemoryEntry = {
      id: `mem-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      organizationId,
      projectId: projectId || null,
      clientId: clientId || null,
      conversationId,
      role,
      content: content.slice(0, 4000),
      citations,
      retentionDays: 30,
      createdAt: new Date().toISOString(),
    };
    this.pruneExpiredMemories();
    ai.memories.push(entry);
    if (ai.memories.length > 500) {
      ai.memories = ai.memories.slice(-400);
    }
    try {
      this.store.save();
    } catch {
      // non-fatal memory persistence error
    }
  }

  public recordUsage(entry: Omit<AiUsageLog, 'id' | 'createdAt'>): AiUsageLog {
    const ai = this.aiState();
    // Idempotency check by requestId or explicit idempotencyKey to guarantee zero double-charging
    const duplicate = ai.usageLogs.find(
      (l) =>
        l.requestId === entry.requestId ||
        (entry.idempotencyKey && l.idempotencyKey === entry.idempotencyKey)
    );
    if (duplicate) {
      return duplicate;
    }

    const log: AiUsageLog = {
      ...entry,
      id: `aiuse-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      createdAt: new Date().toISOString(),
    };
    ai.usageLogs.unshift(log);
    if (ai.usageLogs.length > 2500) {
      ai.usageLogs.length = 2500;
    }

    // Resilient accounting persistence: never fail or discard an already-returned AI response
    try {
      this.store.save();
    } catch (err: any) {
      if (!ai.accountingAlerts) ai.accountingAlerts = [];
      ai.accountingAlerts.unshift({
        id: `acc-alert-${Date.now()}`,
        organizationId: entry.organizationId,
        requestId: entry.requestId,
        message: `Falha ao persistir contabilização no armazenamento (${err?.message || 'erro I/O'}); mantido em memória para reconciliação.`,
        resolved: false,
        createdAt: new Date().toISOString(),
      });
    }
    return log;
  }
}
