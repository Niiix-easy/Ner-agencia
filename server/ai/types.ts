export type AiProviderId =
  | 'openai'
  | 'anthropic'
  | 'deepseek'
  | 'gemini'
  | 'openrouter'
  | 'ollama'
  | 'vllm'
  | 'huggingface';

export type AiPurpose =
  | 'general_assistant'
  | 'marketing_strategy'
  | 'copywriting'
  | 'creatives'
  | 'campaign_analysis'
  | 'data_analysis'
  | 'coding'
  | 'software_dev'
  | 'document_analysis'
  | 'customer_support'
  | 'automation'
  | 'embeddings';

export type AiDepartment =
  | 'NER Strategy'
  | 'NER Creative'
  | 'NER Performance'
  | 'NER Tracking'
  | 'NER Automation'
  | 'NER Intelligence'
  | 'NER Web'
  | 'NER Digital Studio'
  | 'NER Client Experience'
  | 'NER AI Center';

export type AiProviderStatus = 'AGUARDANDO CONFIGURAÇÃO' | 'CONECTADO' | 'ERRO';

export interface AiProviderCapabilities {
  chat: boolean;
  textGeneration: boolean;
  streaming: boolean;
  embeddings: boolean;
  imageUnderstanding: boolean;
  structuredOutput: boolean;
  toolCalling: boolean;
  modelListing: boolean;
  documentAnalysis: boolean;
}

export interface AiProviderConfigRecord {
  id: string;
  providerId: AiProviderId;
  displayName: string;
  scope: 'global' | 'organization';
  organizationId: string | null;
  requiresKey: boolean;
  requiresEndpoint: boolean;
  encryptedApiKey: string | null;
  keyMask: string | null;
  baseUrl: string;
  organizationHeader?: string;
  projectIdHeader?: string;
  defaultModel: string;
  rateLimitPerMin: number;
  status: AiProviderStatus;
  lastCheckedAt: string | null;
  lastError: string | null;
  capabilities: AiProviderCapabilities;
  updatedAt: string;
}

export type AiCapabilityKey = keyof AiProviderCapabilities;

export const PURPOSE_CAPABILITY_RULES: Record<
  AiPurpose,
  { requiredAny: AiCapabilityKey[]; recommended: AiCapabilityKey[]; description: string }
> = {
  general_assistant: {
    requiredAny: ['chat', 'textGeneration'],
    recommended: ['streaming'],
    description: 'Assistente geral conversacional',
  },
  marketing_strategy: {
    requiredAny: ['chat', 'textGeneration'],
    recommended: ['structuredOutput', 'toolCalling'],
    description: 'Diagnóstico e estratégia de marketing',
  },
  copywriting: {
    requiredAny: ['textGeneration', 'chat'],
    recommended: ['streaming'],
    description: 'Copywriting persuasivo, anúncios e páginas',
  },
  creatives: {
    requiredAny: ['textGeneration', 'chat'],
    recommended: ['imageUnderstanding', 'streaming'],
    description: 'Roteiros, hooks, VSLs e peças criativas',
  },
  campaign_analysis: {
    requiredAny: ['chat', 'textGeneration'],
    recommended: ['structuredOutput', 'toolCalling'],
    description: 'Análise de performance e mídia paga',
  },
  data_analysis: {
    requiredAny: ['chat', 'textGeneration'],
    recommended: ['structuredOutput'],
    description: 'Análise de dados, KPIs e anomalias',
  },
  coding: {
    requiredAny: ['textGeneration', 'chat'],
    recommended: ['toolCalling', 'structuredOutput'],
    description: 'Programação e revisão de código',
  },
  software_dev: {
    requiredAny: ['textGeneration', 'chat'],
    recommended: ['structuredOutput', 'toolCalling'],
    description: 'Arquitetura e especificação de software',
  },
  document_analysis: {
    requiredAny: ['documentAnalysis', 'imageUnderstanding', 'textGeneration', 'chat'],
    recommended: ['documentAnalysis', 'imageUnderstanding'],
    description: 'Leitura e extração estruturada de documentos',
  },
  customer_support: {
    requiredAny: ['chat', 'textGeneration'],
    recommended: ['streaming'],
    description: 'Atendimento contextualizado ao cliente',
  },
  automation: {
    requiredAny: ['textGeneration', 'chat'],
    recommended: ['structuredOutput', 'toolCalling'],
    description: 'Classificação e automação de fluxos',
  },
  embeddings: {
    requiredAny: ['embeddings'],
    recommended: ['embeddings'],
    description: 'Vetorização semântica e busca RAG',
  },
};

export interface AiModelEntry {
  id: string;
  providerId: AiProviderId;
  modelId: string;
  displayName: string;
  isActive: boolean;
  isDefaultForProvider: boolean;
  priority: number;
  contextWindow: number;
  maxInputTokens?: number | null; // Configurable per-request input token limit
  maxOutputTokens?: number | null; // Configurable per-request output token limit
  dailyTokenLimit?: number | null; // Configurable daily token quota for this model
  capabilities: Partial<AiProviderCapabilities>;
  inputCostPer1M: number | null; // USD per 1M input tokens (null if unknown/local)
  outputCostPer1M: number | null; // USD per 1M output tokens
  cacheInputCostPer1M?: number | null; // USD per 1M cached input tokens
  reasoningCostPer1M?: number | null; // USD per 1M reasoning tokens (when billed separately)
  currency?: string; // default 'USD'
  effectiveFrom?: string | null;
  priceSource?: string | null;
  pricingVerified: boolean;
  source: 'catalog' | 'discovered' | 'custom';
  lastVerifiedAt: string | null;
  updatedAt?: string;
}

export interface AiRoutingRule {
  id: string;
  purpose: AiPurpose;
  label: string;
  primaryProviderId: AiProviderId;
  primaryModelId: string;
  fallbackProviderId: AiProviderId | null;
  fallbackModelId: string | null;
  allowMoreExpensiveFallback: boolean;
  maxCostUsdPerRequest: number | null;
  timeoutMs: number;
  maxRetries: number;
  isActive: boolean;
  updatedAt: string;
}

export interface AiPromptVersion {
  version: number;
  systemPrompt: string;
  userTemplate: string;
  temperature: number;
  maxOutputTokens: number;
  updatedAt: string;
  updatedBy: string;
}

export interface AiPromptTemplate {
  id: string;
  organizationId: string;
  code: string;
  name: string;
  department: AiDepartment;
  purpose: AiPurpose;
  version: number;
  isActive: boolean;
  systemPrompt: string;
  userTemplate: string;
  preferredProviderId?: AiProviderId | null;
  preferredModelId?: string | null;
  temperature: number;
  maxOutputTokens: number;
  history: AiPromptVersion[];
  updatedAt: string;
}

export type AiLimitExceedAction =
  | 'notify'
  | 'require_authorization'
  | 'restrict_action'
  | 'block_non_essential'
  | 'block_all'
  | 'fallback_economical';

export type AiAlertChannel = 'dashboard' | 'audit_log' | 'email_admin' | 'webhook';

export interface AiThresholdAlertRule {
  thresholdPct: 50 | 75 | 90 | 100;
  enabled: boolean;
  severity: 'info' | 'warning' | 'critical';
  channels: AiAlertChannel[];
  action: 'notify' | 'fallback_economical' | 'block_non_essential' | 'block_all';
  customMessage?: string;
}

export interface AiCostPolicy {
  organizationId: string;
  dailyLimitUsd: number;
  monthlyLimitUsd: number;
  userDailyLimitUsd: number;
  alertThresholdPct: number;
  alertThresholds?: number[]; // e.g. [50, 75, 90, 100]
  thresholdRules?: AiThresholdAlertRule[];
  blockOnExceed: boolean;
  onExceedAction?: AiLimitExceedAction;
  departmentLimitsUsd: Partial<Record<AiDepartment, number>>;
  providerLimitsUsd?: Partial<Record<AiProviderId, number>>;
  modelLimitsUsd?: Record<string, number>;
  actionLimitsUsd?: Record<string, number>;
  restrictedActions?: string[];
  updatedAt: string;
}

export interface AiGlobalCostPolicy {
  dailyLimitUsd: number;
  monthlyLimitUsd: number;
  alertThresholds: number[];
  thresholdRules?: AiThresholdAlertRule[];
  onExceedAction: AiLimitExceedAction;
  updatedAt: string;
  updatedBy?: string;
}

export interface AiLimitException {
  id: string;
  organizationId: string;
  scope: 'organization' | 'department' | 'action' | 'provider' | 'model' | 'user';
  targetKey: string;
  extraBudgetUsd: number;
  grantedByUserId: string;
  reason: string;
  expiresAt: string;
  createdAt: string;
}

export interface AiExchangeConfig {
  baseCurrency: 'USD';
  targetCurrency: 'BRL';
  rate: number;
  rateDate: string;
  source: string;
  updatedAt: string;
}

export interface AiAccountingAlert {
  id: string;
  organizationId: string;
  requestId: string;
  message: string;
  resolved: boolean;
  createdAt: string;
}

export type AiBillingCategory =
  | 'internal_agency'
  | 'client_included'
  | 'client_additional'
  | 'client_overage';

export type AiUsageStatus = 'confirmed' | 'estimated' | 'unavailable';

export interface AiUsageLog {
  id: string;
  requestId: string;
  idempotencyKey?: string;
  traceId: string;
  organizationId: string;
  userId: string;
  clientId?: string | null;
  billingCategory?: AiBillingCategory;
  department: AiDepartment;
  action?: string;
  purpose: AiPurpose;
  providerId: AiProviderId;
  modelId: string;
  effectiveProvider?: string;
  fallbackUsed: boolean;
  fallbackFrom?: string | null;
  operation: 'chat' | 'stream' | 'embedding' | 'structured' | 'test';
  // Token accounting (0 kept when provider omits? NO: raw* preserves null when unavailable)
  inputTokens: number;
  outputTokens: number;
  cachedTokens: number;
  rawInputTokens?: number | null;
  rawOutputTokens?: number | null;
  rawTotalTokens?: number | null;
  cachedInputTokens?: number | null;
  reasoningTokens?: number | null;
  usageStatus?: AiUsageStatus;
  // Financial breakdown
  inputCost?: number | null;
  outputCost?: number | null;
  cacheCost?: number | null;
  reasoningCost?: number | null;
  estimatedCostUsd: number | null;
  providerReportedCostUsd: number | null;
  costStatus?: AiUsageStatus;
  costReliable: boolean;
  currency?: string;
  exchangeRate?: number | null;
  exchangeRateDate?: string | null;
  exchangeRateSource?: string | null;
  totalCostBRL?: number | null;
  latencyMs: number;
  status: 'success' | 'error' | 'rate_limited' | 'budget_blocked';
  errorMessage?: string | null;
  isCritical?: boolean;
  responseCached?: boolean;
  reconciledWithProvider?: boolean;
  reconciledAt?: string | null;
  startedAt?: string;
  completedAt?: string | null;
  createdAt: string;
}

export interface AiMemoryEntry {
  id: string;
  organizationId: string;
  projectId?: string | null;
  clientId?: string | null;
  conversationId: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  citations: { sourceId: string; title: string }[];
  retentionDays: number;
  createdAt: string;
}

export interface AiKnowledgeDoc {
  id: string;
  organizationId: string;
  projectId?: string | null;
  clientId?: string | null;
  title: string;
  content: string;
  tags: string[];
  createdAt: string;
}

export interface AiGatewayState {
  providers: AiProviderConfigRecord[];
  models: AiModelEntry[];
  routingRules: AiRoutingRule[];
  prompts: AiPromptTemplate[];
  globalCostPolicy?: AiGlobalCostPolicy;
  costPolicies: AiCostPolicy[];
  usageLogs: AiUsageLog[];
  memories: AiMemoryEntry[];
  knowledgeDocs: AiKnowledgeDoc[];
  actions?: {
    id: string;
    department: AiDepartment;
    name: string;
    purpose: AiPurpose;
    description: string;
    isCritical: boolean;
    cacheable: boolean;
    isSystem: boolean;
  }[];
  limitExceptions?: AiLimitException[];
  accountingAlerts?: AiAccountingAlert[];
  exchangeConfig?: AiExchangeConfig;
  pricingVersion: string;
}

export interface AiChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
  imageBase64?: string;
  imageMimeType?: string;
}

export interface AiToolDefinition {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
}

export interface AiAdapterRequest {
  modelId: string;
  messages: AiChatMessage[];
  systemInstruction?: string;
  temperature?: number;
  maxOutputTokens?: number;
  structuredJsonSchema?: Record<string, unknown>;
  tools?: AiToolDefinition[];
  timeoutMs?: number;
}

export interface AiAdapterResponse {
  text: string;
  modelUsed: string;
  providerReportedVendor?: string;
  inputTokens: number;
  outputTokens: number;
  cachedTokens: number;
  reasoningTokens?: number | null;
  usageReported?: boolean;
  providerReportedCostUsd?: number | null;
  toolCalls?: { name: string; arguments: Record<string, unknown> }[];
  finishReason?: string;
}

export interface AiEmbeddingRequest {
  modelId: string;
  texts: string[];
  timeoutMs?: number;
}

export interface AiEmbeddingResponse {
  embeddings: number[][];
  modelUsed: string;
  inputTokens: number;
  usageReported?: boolean;
}
