import crypto from 'node:crypto';
import { PersistentStore } from '../store.ts';
import { AdIntegrationCredential, AdIntegrationProviderId } from '../types.ts';
import {
  decryptSecret,
  encryptSecret,
  hasMasterEncryptionKey,
  maskSecret,
} from '../ai/credentials.ts';

export interface AdFieldDefinition {
  key: string;
  label: string;
  placeholder: string;
  envVar: string;
  required: boolean;
  helperText?: string;
}

export interface AdProviderDefinition {
  provider: AdIntegrationProviderId;
  displayName: string;
  platformLabel: 'Meta Ads' | 'Google Ads' | 'TikTok Ads';
  description: string;
  publicFields: AdFieldDefinition[];
  secretFields: AdFieldDefinition[];
}

export const AD_PROVIDER_DEFINITIONS: Record<AdIntegrationProviderId, AdProviderDefinition> = {
  meta_ads: {
    provider: 'meta_ads',
    displayName: 'Meta Ads & Conversions API (CAPI)',
    platformLabel: 'Meta Ads',
    description: 'Credenciais para Meta Marketing API, Graph API e envio server-side via Conversions API.',
    publicFields: [
      {
        key: 'appId',
        label: 'Meta App ID',
        placeholder: 'Ex: 123456789012345',
        envVar: 'META_APP_ID',
        required: false,
      },
      {
        key: 'pixelId',
        label: 'Meta Pixel ID',
        placeholder: 'Ex: 987654321098765',
        envVar: 'META_PIXEL_ID',
        required: true,
        helperText: 'Obrigatório para envio de eventos server-side (CAPI).',
      },
      {
        key: 'adAccountId',
        label: 'Ad Account ID',
        placeholder: 'Ex: act_1234567890',
        envVar: 'META_AD_ACCOUNT_ID',
        required: false,
      },
      {
        key: 'businessId',
        label: 'Business Manager ID',
        placeholder: 'Ex: 102938475610293',
        envVar: 'META_BUSINESS_ID',
        required: false,
      },
    ],
    secretFields: [
      {
        key: 'accessToken',
        label: 'System User Access Token',
        placeholder: 'EAAG... (Token permanente do System User)',
        envVar: 'META_ACCESS_TOKEN',
        required: true,
        helperText: 'Criptografado com AES-256-GCM usando NER_AI_ENCRYPTION_KEY.',
      },
      {
        key: 'appSecret',
        label: 'Meta App Secret',
        placeholder: 'Segredo do aplicativo Meta para appsecret_proof',
        envVar: 'META_APP_SECRET',
        required: false,
      },
    ],
  },
  google_ads: {
    provider: 'google_ads',
    displayName: 'Google Ads & GA4 Measurement Protocol',
    platformLabel: 'Google Ads',
    description: 'Credenciais OAuth/Developer Token para Google Ads API e segredos de disparo GA4 Measurement Protocol.',
    publicFields: [
      {
        key: 'customerId',
        label: 'Google Ads Customer ID',
        placeholder: 'Ex: 123-456-7890',
        envVar: 'GOOGLE_ADS_CUSTOMER_ID',
        required: false,
      },
      {
        key: 'loginCustomerId',
        label: 'MCC / Login Customer ID',
        placeholder: 'Ex: 999-888-7777 (opcional)',
        envVar: 'GOOGLE_ADS_LOGIN_CUSTOMER_ID',
        required: false,
      },
      {
        key: 'clientId',
        label: 'OAuth Client ID',
        placeholder: 'xxxxx.apps.googleusercontent.com',
        envVar: 'GOOGLE_ADS_CLIENT_ID',
        required: false,
      },
      {
        key: 'ga4MeasurementId',
        label: 'GA4 Measurement ID',
        placeholder: 'Ex: G-XXXXXXXXXX',
        envVar: 'GA4_MEASUREMENT_ID',
        required: true,
        helperText: 'Utilizado para envio server-side no GA4 Measurement Protocol.',
      },
    ],
    secretFields: [
      {
        key: 'developerToken',
        label: 'Google Ads Developer Token',
        placeholder: 'Token de desenvolvedor do Google Ads MCC',
        envVar: 'GOOGLE_ADS_DEVELOPER_TOKEN',
        required: false,
      },
      {
        key: 'clientSecret',
        label: 'OAuth Client Secret',
        placeholder: 'GOCSPX-...',
        envVar: 'GOOGLE_ADS_CLIENT_SECRET',
        required: false,
      },
      {
        key: 'refreshToken',
        label: 'OAuth Refresh Token',
        placeholder: '1//0g...',
        envVar: 'GOOGLE_ADS_REFRESH_TOKEN',
        required: false,
      },
      {
        key: 'ga4ApiSecret',
        label: 'GA4 API Secret',
        placeholder: 'Segredo da Measurement Protocol API',
        envVar: 'GA4_API_SECRET',
        required: true,
        helperText: 'Obrigatório para autenticar eventos server-side no GA4.',
      },
    ],
  },
  tiktok_ads: {
    provider: 'tiktok_ads',
    displayName: 'TikTok Ads & Events API',
    platformLabel: 'TikTok Ads',
    description: 'Credenciais do TikTok for Business Marketing API e TikTok Events API.',
    publicFields: [
      {
        key: 'appId',
        label: 'TikTok App ID',
        placeholder: 'Ex: 7123456789012345678',
        envVar: 'TIKTOK_APP_ID',
        required: false,
      },
      {
        key: 'advertiserId',
        label: 'Advertiser ID',
        placeholder: 'Ex: 7098765432109876543',
        envVar: 'TIKTOK_ADVERTISER_ID',
        required: true,
        helperText: 'Obrigatório para consultas e gestão de campanhas no TikTok Ads.',
      },
      {
        key: 'pixelId',
        label: 'TikTok Pixel Code / ID',
        placeholder: 'Ex: CXXXXXXXXXXXXXXX',
        envVar: 'TIKTOK_PIXEL_ID',
        required: false,
      },
    ],
    secretFields: [
      {
        key: 'accessToken',
        label: 'TikTok Access Token',
        placeholder: 'Token de acesso da TikTok Business API',
        envVar: 'TIKTOK_ACCESS_TOKEN',
        required: true,
        helperText: 'Criptografado com AES-256-GCM usando NER_AI_ENCRYPTION_KEY.',
      },
      {
        key: 'appSecret',
        label: 'TikTok App Secret',
        placeholder: 'Segredo do App no TikTok for Business',
        envVar: 'TIKTOK_APP_SECRET',
        required: false,
      },
    ],
  },
};

export const AD_PROVIDER_LIST: AdIntegrationProviderId[] = ['meta_ads', 'google_ads', 'tiktok_ads'];

export function isValidAdProvider(provider: string): provider is AdIntegrationProviderId {
  return AD_PROVIDER_LIST.includes(provider as AdIntegrationProviderId);
}

export interface SanitizedSecretFieldState {
  key: string;
  label: string;
  placeholder: string;
  envVar: string;
  required: boolean;
  helperText?: string;
  configured: boolean;
  source: 'encrypted_db' | 'env' | 'none';
  mask: string | null;
}

export interface SanitizedPublicFieldState {
  key: string;
  label: string;
  placeholder: string;
  envVar: string;
  required: boolean;
  helperText?: string;
  value: string;
  source: 'encrypted_db' | 'env' | 'none';
}

export interface SanitizedAdIntegrationCredential {
  provider: AdIntegrationProviderId;
  displayName: string;
  platformLabel: 'Meta Ads' | 'Google Ads' | 'TikTok Ads';
  description: string;
  organizationId: string;
  enabled: boolean;
  configured: boolean;
  credentialSource: 'encrypted_db' | 'env' | 'mixed' | 'none';
  status: 'CONFIGURADO' | 'PENDENTE' | 'ERRO';
  publicFields: SanitizedPublicFieldState[];
  secretFields: SanitizedSecretFieldState[];
  hasStoredRecord: boolean;
  lastTestedAt: string | null;
  lastTestStatus: 'ok' | 'error' | 'config_only' | null;
  lastTestMessage: string | null;
  updatedAt: string | null;
}

function getEnvTrimmed(envVar: string): string {
  const val = process.env[envVar];
  return typeof val === 'string' ? val.trim() : '';
}

function findOrgRecord(
  store: PersistentStore,
  organizationId: string,
  provider: AdIntegrationProviderId
): AdIntegrationCredential | undefined {
  return (store.getState().adIntegrationCredentials || []).find(
    (r) => r.organizationId === organizationId && r.provider === provider
  );
}

function sanitizePublicInput(raw: unknown): string {
  if (typeof raw !== 'string') return '';
  const cleaned = raw.trim();
  if (cleaned.length > 256) {
    throw new Error('Identificador público excede o limite máximo de 256 caracteres.');
  }
  if (/[\r\n\0]/.test(cleaned)) {
    throw new Error('Caracteres de controle inválidos em campo de configuração.');
  }
  return cleaned;
}

function sanitizeSecretInput(raw: unknown): string {
  if (typeof raw !== 'string') return '';
  const cleaned = raw.trim();
  if (cleaned.length > 4096) {
    throw new Error('Credencial excede o tamanho máximo permitido (4096 caracteres).');
  }
  if (/[\r\n\0]/.test(cleaned)) {
    throw new Error('Caracteres de controle inválidos em credencial secreta.');
  }
  return cleaned;
}

/**
 * Evaluates whether a provider has the required configuration to operate.
 * For Google Ads, either (GA4 Measurement ID + GA4 API Secret) OR
 * (Google Ads Developer Token + Customer ID + Refresh Token) counts as configured.
 */
function evaluateProviderCompleteness(
  provider: AdIntegrationProviderId,
  publicValues: Record<string, string>,
  secretPresence: Record<string, boolean>
): boolean {
  if (provider === 'meta_ads') {
    const hasToken = Boolean(secretPresence.accessToken);
    const hasTarget = Boolean(publicValues.pixelId || publicValues.adAccountId);
    return hasToken && hasTarget;
  }
  if (provider === 'google_ads') {
    const hasGa4 = Boolean(publicValues.ga4MeasurementId && secretPresence.ga4ApiSecret);
    const hasGoogleAdsApi = Boolean(
      secretPresence.developerToken && (publicValues.customerId || secretPresence.refreshToken)
    );
    return hasGa4 || hasGoogleAdsApi;
  }
  if (provider === 'tiktok_ads') {
    return Boolean(secretPresence.accessToken && (publicValues.advertiserId || publicValues.pixelId));
  }
  return false;
}

/**
 * Returns a strictly sanitized view for the frontend.
 * NEVER includes decrypted secret values or raw AES-256-GCM ciphertexts.
 */
export function getSanitizedAdCredential(
  store: PersistentStore,
  organizationId: string,
  provider: AdIntegrationProviderId
): SanitizedAdIntegrationCredential {
  const def = AD_PROVIDER_DEFINITIONS[provider];
  const record = findOrgRecord(store, organizationId, provider);

  const publicValues: Record<string, string> = {};
  const secretPresence: Record<string, boolean> = {};
  let hasDbSource = false;
  let hasEnvSource = false;

  const publicFields: SanitizedPublicFieldState[] = def.publicFields.map((f) => {
    const dbVal = record?.publicConfig?.[f.key]?.trim() || '';
    const envVal = getEnvTrimmed(f.envVar);
    if (dbVal) {
      publicValues[f.key] = dbVal;
      hasDbSource = true;
      return {
        ...f,
        value: dbVal,
        source: 'encrypted_db',
      };
    }
    if (envVal) {
      publicValues[f.key] = envVal;
      hasEnvSource = true;
      return {
        ...f,
        value: envVal,
        source: 'env',
      };
    }
    publicValues[f.key] = '';
    return {
      ...f,
      value: '',
      source: 'none',
    };
  });

  const secretFields: SanitizedSecretFieldState[] = def.secretFields.map((f) => {
    const hasCipher = Boolean(record?.encryptedSecrets?.[f.key]);
    const envVal = getEnvTrimmed(f.envVar);
    if (hasCipher) {
      secretPresence[f.key] = true;
      hasDbSource = true;
      return {
        ...f,
        configured: true,
        source: 'encrypted_db',
        mask: record?.secretMasks?.[f.key] || '••••••••',
      };
    }
    if (envVal) {
      secretPresence[f.key] = true;
      hasEnvSource = true;
      return {
        ...f,
        configured: true,
        source: 'env',
        mask: `${maskSecret(envVal)} (env)`,
      };
    }
    secretPresence[f.key] = false;
    return {
      ...f,
      configured: false,
      source: 'none',
      mask: null,
    };
  });

  const enabled = record ? record.enabled : true;
  const configured = enabled && evaluateProviderCompleteness(provider, publicValues, secretPresence);

  let credentialSource: 'encrypted_db' | 'env' | 'mixed' | 'none' = 'none';
  if (hasDbSource && hasEnvSource) credentialSource = 'mixed';
  else if (hasDbSource) credentialSource = 'encrypted_db';
  else if (hasEnvSource) credentialSource = 'env';

  let status: 'CONFIGURADO' | 'PENDENTE' | 'ERRO' = configured ? 'CONFIGURADO' : 'PENDENTE';
  if (record?.lastTestStatus === 'error' && configured) {
    status = 'ERRO';
  }

  return {
    provider: def.provider,
    displayName: def.displayName,
    platformLabel: def.platformLabel,
    description: def.description,
    organizationId,
    enabled,
    configured,
    credentialSource,
    status,
    publicFields,
    secretFields,
    hasStoredRecord: Boolean(record),
    lastTestedAt: record?.lastTestedAt ?? null,
    lastTestStatus: record?.lastTestStatus ?? null,
    lastTestMessage: record?.lastTestMessage ?? null,
    updatedAt: record?.updatedAt ?? null,
  };
}

export function listSanitizedAdCredentials(
  store: PersistentStore,
  organizationId: string
): {
  encryptionKeyConfigured: boolean;
  organizationId: string;
  providers: SanitizedAdIntegrationCredential[];
} {
  return {
    encryptionKeyConfigured: hasMasterEncryptionKey(),
    organizationId,
    providers: AD_PROVIDER_LIST.map((provider) =>
      getSanitizedAdCredential(store, organizationId, provider)
    ),
  };
}

export interface UpsertAdCredentialInput {
  organizationId: string;
  provider: AdIntegrationProviderId;
  actorUserId: string;
  enabled?: boolean;
  publicConfig?: Record<string, unknown>;
  secrets?: Record<string, unknown>;
  clearSecrets?: string[];
}

export function upsertAdIntegrationCredential(
  store: PersistentStore,
  input: UpsertAdCredentialInput
): SanitizedAdIntegrationCredential {
  const def = AD_PROVIDER_DEFINITIONS[input.provider];
  if (!def) {
    throw new Error('Provedor de anúncios inválido.');
  }

  const allowedPublicKeys = new Set(def.publicFields.map((f) => f.key));
  const allowedSecretKeys = new Set(def.secretFields.map((f) => f.key));

  const state = store.getState();
  if (!Array.isArray(state.adIntegrationCredentials)) {
    state.adIntegrationCredentials = [];
  }

  let record = findOrgRecord(store, input.organizationId, input.provider);
  const now = new Date().toISOString();

  // Validate incoming public fields against strict allowlist
  const incomingPublic: Record<string, string> = {};
  if (input.publicConfig && typeof input.publicConfig === 'object') {
    for (const [k, v] of Object.entries(input.publicConfig)) {
      if (!allowedPublicKeys.has(k)) {
        throw new Error(`Campo de configuração não permitido para ${input.provider}: ${k}`);
      }
      incomingPublic[k] = sanitizePublicInput(v);
    }
  }

  // Validate incoming secrets against strict allowlist
  const incomingSecrets: Record<string, string> = {};
  if (input.secrets && typeof input.secrets === 'object') {
    for (const [k, v] of Object.entries(input.secrets)) {
      if (!allowedSecretKeys.has(k)) {
        throw new Error(`Campo secreto não permitido para ${input.provider}: ${k}`);
      }
      const cleaned = sanitizeSecretInput(v);
      if (cleaned) {
        incomingSecrets[k] = cleaned;
      }
    }
  }

  const secretKeysToEncrypt = Object.keys(incomingSecrets);
  if (secretKeysToEncrypt.length > 0 && !hasMasterEncryptionKey()) {
    throw new Error('NER_AI_ENCRYPTION_KEY_MISSING');
  }

  const clearList = Array.isArray(input.clearSecrets)
    ? input.clearSecrets.filter((k) => typeof k === 'string' && allowedSecretKeys.has(k))
    : [];

  if (!record) {
    record = {
      id: `adcred-${Date.now()}-${crypto.randomBytes(3).toString('hex')}`,
      organizationId: input.organizationId,
      provider: input.provider,
      enabled: input.enabled !== false,
      publicConfig: {},
      encryptedSecrets: {},
      secretMasks: {},
      status: 'PENDENTE',
      lastTestedAt: null,
      lastTestStatus: null,
      lastTestMessage: null,
      updatedByUserId: input.actorUserId,
      createdAt: now,
      updatedAt: now,
    };
    state.adIntegrationCredentials.push(record);
  }

  if (typeof input.enabled === 'boolean') {
    record.enabled = input.enabled;
  }

  // Apply public field updates
  for (const [k, v] of Object.entries(incomingPublic)) {
    if (v) {
      record.publicConfig[k] = v;
    } else {
      delete record.publicConfig[k];
    }
  }

  // Explicitly clear requested secret fields
  for (const key of clearList) {
    delete record.encryptedSecrets[key];
    delete record.secretMasks[key];
  }

  // Encrypt and persist any new secret values using NER_AI_ENCRYPTION_KEY (AES-256-GCM)
  for (const [k, plaintext] of Object.entries(incomingSecrets)) {
    record.encryptedSecrets[k] = encryptSecret(plaintext);
    record.secretMasks[k] = maskSecret(plaintext);
  }

  record.updatedByUserId = input.actorUserId;
  record.updatedAt = now;

  // Recompute status based on sanitized completeness
  const sanitizedPreview = getSanitizedAdCredential(store, input.organizationId, input.provider);
  record.status = sanitizedPreview.configured ? 'CONFIGURADO' : 'PENDENTE';

  store.audit(
    input.organizationId,
    input.actorUserId,
    'AD_CREDENTIALS_SAVED',
    'AdIntegrationCredential',
    record.id,
    {
      provider: input.provider,
      enabled: record.enabled,
      updatedPublicFields: Object.keys(incomingPublic),
      rotatedSecretFields: secretKeysToEncrypt,
      clearedSecretFields: clearList,
      status: record.status,
    }
  );

  return getSanitizedAdCredential(store, input.organizationId, input.provider);
}

export function deleteAdIntegrationCredential(
  store: PersistentStore,
  organizationId: string,
  provider: AdIntegrationProviderId,
  actorUserId: string
): { deleted: boolean; sanitized: SanitizedAdIntegrationCredential } {
  const state = store.getState();
  const list = state.adIntegrationCredentials || [];
  const idx = list.findIndex(
    (r) => r.organizationId === organizationId && r.provider === provider
  );

  if (idx === -1) {
    return {
      deleted: false,
      sanitized: getSanitizedAdCredential(store, organizationId, provider),
    };
  }

  const [removed] = list.splice(idx, 1);
  store.audit(
    organizationId,
    actorUserId,
    'AD_CREDENTIALS_DELETED',
    'AdIntegrationCredential',
    removed.id,
    { provider }
  );

  return {
    deleted: true,
    sanitized: getSanitizedAdCredential(store, organizationId, provider),
  };
}

/**
 * SERVER-INTERNAL ONLY: Resolves decrypted credentials for an organization's ad provider,
 * falling back to server environment variables when not stored in the encrypted DB vault.
 * NEVER return the output of this function to any client HTTP response.
 */
export function resolveDecryptedAdCredentials(
  store: PersistentStore,
  organizationId: string,
  provider: AdIntegrationProviderId
): {
  configured: boolean;
  enabled: boolean;
  source: 'encrypted_db' | 'env' | 'mixed' | 'none';
  publicConfig: Record<string, string>;
  secrets: Record<string, string>;
  decryptError: string | null;
} {
  const def = AD_PROVIDER_DEFINITIONS[provider];
  const record = findOrgRecord(store, organizationId, provider);
  const enabled = record ? record.enabled : true;

  const publicConfig: Record<string, string> = {};
  const secrets: Record<string, string> = {};
  const secretPresence: Record<string, boolean> = {};
  let hasDb = false;
  let hasEnv = false;
  let decryptError: string | null = null;

  for (const f of def.publicFields) {
    const dbVal = record?.publicConfig?.[f.key]?.trim() || '';
    const envVal = getEnvTrimmed(f.envVar);
    if (dbVal) {
      publicConfig[f.key] = dbVal;
      hasDb = true;
    } else if (envVal) {
      publicConfig[f.key] = envVal;
      hasEnv = true;
    } else {
      publicConfig[f.key] = '';
    }
  }

  for (const f of def.secretFields) {
    const ciphertext = record?.encryptedSecrets?.[f.key];
    const envVal = getEnvTrimmed(f.envVar);
    if (ciphertext) {
      try {
        secrets[f.key] = decryptSecret(ciphertext);
        secretPresence[f.key] = true;
        hasDb = true;
      } catch (err: any) {
        decryptError =
          err?.message === 'NER_AI_ENCRYPTION_KEY_MISSING'
            ? 'NER_AI_ENCRYPTION_KEY ausente para descriptografar credenciais salvas.'
            : 'Falha ao descriptografar credencial salva (verifique se NER_AI_ENCRYPTION_KEY foi alterada).';
        secrets[f.key] = '';
        secretPresence[f.key] = false;
      }
    } else if (envVal) {
      secrets[f.key] = envVal;
      secretPresence[f.key] = true;
      hasEnv = true;
    } else {
      secrets[f.key] = '';
      secretPresence[f.key] = false;
    }
  }

  const configured =
    enabled && !decryptError && evaluateProviderCompleteness(provider, publicConfig, secretPresence);

  let source: 'encrypted_db' | 'env' | 'mixed' | 'none' = 'none';
  if (hasDb && hasEnv) source = 'mixed';
  else if (hasDb) source = 'encrypted_db';
  else if (hasEnv) source = 'env';

  return {
    configured,
    enabled,
    source,
    publicConfig,
    secrets,
    decryptError,
  };
}

export function getAdPlatformReadiness(
  store: PersistentStore,
  organizationId: string,
  provider: AdIntegrationProviderId
): {
  configured: boolean;
  source: 'encrypted_db' | 'env' | 'mixed' | 'none';
  statusLabel: string;
} {
  const sanitized = getSanitizedAdCredential(store, organizationId, provider);
  if (!sanitized.configured) {
    return {
      configured: false,
      source: sanitized.credentialSource,
      statusLabel: 'BLOQUEADO POR CREDENCIAIS',
    };
  }
  const sourceSuffix =
    sanitized.credentialSource === 'encrypted_db'
      ? 'COFRE CRIPTOGRAFADO'
      : sanitized.credentialSource === 'mixed'
      ? 'COFRE + ENV'
      : 'ENV';
  return {
    configured: true,
    source: sanitized.credentialSource,
    statusLabel: `CONFIGURADO (${sourceSuffix})`,
  };
}

export function mapAdAccountPlatformToProvider(
  platform: string
): AdIntegrationProviderId | null {
  if (platform === 'Meta Ads') return 'meta_ads';
  if (platform === 'Google Ads') return 'google_ads';
  if (platform === 'TikTok Ads') return 'tiktok_ads';
  return null;
}

/**
 * Validates stored/env credentials server-side (decryption integrity + required fields).
 * Optionally probes hardcoded official provider endpoints when `verifyLive` is true.
 * Never returns or logs plaintext secrets.
 */
export async function testAdIntegrationCredential(
  store: PersistentStore,
  organizationId: string,
  provider: AdIntegrationProviderId,
  actorUserId: string,
  options: { verifyLive?: boolean } = {}
): Promise<{
  ok: boolean;
  mode: 'config_validation' | 'live_probe';
  message: string;
  sanitized: SanitizedAdIntegrationCredential;
}> {
  const resolved = resolveDecryptedAdCredentials(store, organizationId, provider);
  const record = findOrgRecord(store, organizationId, provider);
  const now = new Date().toISOString();

  let ok = false;
  let mode: 'config_validation' | 'live_probe' = 'config_validation';
  let message = '';

  if (resolved.decryptError) {
    ok = false;
    message = resolved.decryptError;
  } else if (!resolved.enabled) {
    ok = false;
    message = 'Integração desativada para esta organização.';
  } else if (!resolved.configured) {
    ok = false;
    message =
      provider === 'meta_ads'
        ? 'Informe o Access Token e o Pixel ID ou Ad Account ID para ativar Meta Ads.'
        : provider === 'google_ads'
        ? 'Informe GA4 Measurement ID + GA4 API Secret ou Developer Token + Customer ID para ativar Google Ads.'
        : 'Informe o Access Token e o Advertiser ID ou Pixel ID para ativar TikTok Ads.';
  } else if (!options.verifyLive) {
    ok = true;
    message =
      resolved.source === 'encrypted_db' || resolved.source === 'mixed'
        ? 'Credenciais validadas e descriptografadas com sucesso a partir do cofre AES-256-GCM.'
        : 'Credenciais validadas via variáveis de ambiente do servidor.';
  } else {
    mode = 'live_probe';
    try {
      if (provider === 'meta_ads') {
        const resp = await fetch('https://graph.facebook.com/v20.0/me?fields=id,name', {
          method: 'GET',
          headers: { Authorization: `Bearer ${resolved.secrets.accessToken}` },
          signal: AbortSignal.timeout(8000),
        });
        ok = resp.ok;
        message = resp.ok
          ? 'Conexão autenticada com sucesso na Meta Graph API (v20.0).'
          : `Meta Graph API retornou HTTP ${resp.status}. Verifique permissões e validade do token.`;
      } else if (provider === 'google_ads') {
        if (resolved.publicConfig.ga4MeasurementId && resolved.secrets.ga4ApiSecret) {
          const debugUrl =
            `https://www.google-analytics.com/debug/mp/collect` +
            `?measurement_id=${encodeURIComponent(resolved.publicConfig.ga4MeasurementId)}` +
            `&api_secret=${encodeURIComponent(resolved.secrets.ga4ApiSecret)}`;
          const resp = await fetch(debugUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              client_id: 'ner_vault_healthcheck',
              events: [{ name: 'ner_healthcheck', params: {} }],
            }),
            signal: AbortSignal.timeout(8000),
          });
          ok = resp.ok;
          message = resp.ok
            ? 'GA4 Measurement Protocol validado com sucesso no endpoint de diagnóstico do Google.'
            : `GA4 Measurement Protocol retornou HTTP ${resp.status}.`;
        } else {
          ok = true;
          message = 'Credenciais Google Ads descriptografadas e validadas estruturalmente.';
        }
      } else if (provider === 'tiktok_ads') {
        const resp = await fetch('https://business-api.tiktok.com/open_api/v1.3/user/info/', {
          method: 'GET',
          headers: { 'Access-Token': resolved.secrets.accessToken },
          signal: AbortSignal.timeout(8000),
        });
        const body: any = await resp.json().catch(() => ({}));
        ok = resp.ok && body?.code === 0;
        message = ok
          ? 'Conexão autenticada com sucesso na TikTok Business API (v1.3).'
          : `TikTok Business API recusou a validação (HTTP ${resp.status}${body?.code !== undefined ? `, código ${body.code}` : ''}).`;
      }
    } catch {
      ok = false;
      message = 'Falha de conectividade externa ao validar credenciais no provedor (timeout ou rede indisponível).';
    }
  }

  if (record) {
    record.lastTestedAt = now;
    record.lastTestStatus = ok ? (mode === 'live_probe' ? 'ok' : 'config_only') : 'error';
    record.lastTestMessage = message;
    record.status = ok ? 'CONFIGURADO' : resolved.configured ? 'ERRO' : 'PENDENTE';
    record.updatedAt = now;
  }

  store.audit(
    organizationId,
    actorUserId,
    'AD_CREDENTIALS_TESTED',
    'AdIntegrationCredential',
    record?.id || `${organizationId}:${provider}`,
    {
      provider,
      mode,
      ok,
    }
  );

  return {
    ok,
    mode,
    message,
    sanitized: getSanitizedAdCredential(store, organizationId, provider),
  };
}
