import crypto from 'node:crypto';
import { AiProviderConfigRecord, AiProviderId } from './types.ts';

const ALGO = 'aes-256-gcm';
const PREFIX = 'enc:v1:';

export interface ResolvedCredentials {
  apiKey: string | null;
  baseUrl: string;
  organizationHeader?: string;
  projectIdHeader?: string;
  source: 'admin_encrypted' | 'env' | 'none';
}

function getMasterKeyBuffer(overrideMasterKey?: string): Buffer | null {
  const raw = overrideMasterKey ?? process.env.NER_AI_ENCRYPTION_KEY;
  if (!raw || !raw.trim()) return null;
  const trimmed = raw.trim();
  // Accept 64-char hex directly, otherwise derive a deterministic 32-byte key from the user-supplied master secret
  if (/^[a-f0-9]{64}$/i.test(trimmed)) {
    return Buffer.from(trimmed, 'hex');
  }
  return crypto.createHash('sha256').update(trimmed, 'utf8').digest();
}

export function hasMasterEncryptionKey(overrideMasterKey?: string): boolean {
  return getMasterKeyBuffer(overrideMasterKey) !== null;
}

export function encryptSecret(plaintext: string, overrideMasterKey?: string): string {
  const key = getMasterKeyBuffer(overrideMasterKey);
  if (!key) {
    throw new Error('NER_AI_ENCRYPTION_KEY_MISSING');
  }
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(ALGO, key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${PREFIX}${iv.toString('hex')}:${tag.toString('hex')}:${encrypted.toString('hex')}`;
}

export function decryptSecret(ciphertext: string, overrideMasterKey?: string): string {
  if (!ciphertext || !ciphertext.startsWith(PREFIX)) {
    throw new Error('INVALID_ENCRYPTED_SECRET_FORMAT');
  }
  const key = getMasterKeyBuffer(overrideMasterKey);
  if (!key) {
    throw new Error('NER_AI_ENCRYPTION_KEY_MISSING');
  }
  const parts = ciphertext.slice(PREFIX.length).split(':');
  if (parts.length !== 3) {
    throw new Error('CORRUPT_ENCRYPTED_SECRET');
  }
  const [ivHex, tagHex, dataHex] = parts;
  const iv = Buffer.from(ivHex, 'hex');
  const tag = Buffer.from(tagHex, 'hex');
  const data = Buffer.from(dataHex, 'hex');
  const decipher = crypto.createDecipheriv(ALGO, key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(data), decipher.final()]).toString('utf8');
}

export function maskSecret(secret: string): string {
  const trimmed = secret.trim();
  if (trimmed.length <= 8) return '••••••••';
  const prefix = trimmed.slice(0, 4);
  const suffix = trimmed.slice(-4);
  return `${prefix}••••${suffix}`;
}

export function getEnvFallbackForProvider(providerId: AiProviderId): {
  apiKey: string | null;
  baseUrl?: string;
} {
  switch (providerId) {
    case 'openai':
      return { apiKey: process.env.OPENAI_API_KEY?.trim() || null };
    case 'anthropic':
      return { apiKey: process.env.ANTHROPIC_API_KEY?.trim() || null };
    case 'deepseek':
      return {
        apiKey: process.env.DEEPSEEK_API_KEY?.trim() || null,
        baseUrl: process.env.DEEPSEEK_BASE_URL?.trim() || undefined,
      };
    case 'gemini':
      return {
        apiKey: (process.env.GOOGLE_AI_API_KEY || process.env.GEMINI_API_KEY)?.trim() || null,
      };
    case 'openrouter':
      return { apiKey: process.env.OPENROUTER_API_KEY?.trim() || null };
    case 'ollama':
      return {
        apiKey: null,
        baseUrl: process.env.OLLAMA_BASE_URL?.trim() || undefined,
      };
    case 'vllm':
      return {
        apiKey: process.env.VLLM_API_KEY?.trim() || null,
        baseUrl: process.env.VLLM_BASE_URL?.trim() || undefined,
      };
    case 'huggingface':
      return { apiKey: process.env.HUGGINGFACE_API_TOKEN?.trim() || null };
  }
}

/**
 * Precedence:
 * 1. Organization BYOK encrypted credential (if exists & decryptable)
 * 2. Global admin encrypted credential (if exists & decryptable)
 * 3. Environment variable fallback
 */
export function resolveProviderCredentials(
  providers: AiProviderConfigRecord[],
  providerId: AiProviderId,
  organizationId: string,
  overrideMasterKey?: string
): ResolvedCredentials {
  const orgRecord = providers.find(
    (p) => p.providerId === providerId && p.scope === 'organization' && p.organizationId === organizationId
  );
  const globalRecord = providers.find(
    (p) => p.providerId === providerId && p.scope === 'global'
  );
  const record = orgRecord || globalRecord;
  const env = getEnvFallbackForProvider(providerId);

  const effectiveBaseUrl = (record?.baseUrl?.trim() || env.baseUrl || '').trim();

  if (record?.encryptedApiKey) {
    const apiKey = decryptSecret(record.encryptedApiKey, overrideMasterKey);
    return {
      apiKey,
      baseUrl: effectiveBaseUrl,
      organizationHeader: record.organizationHeader,
      projectIdHeader: record.projectIdHeader,
      source: 'admin_encrypted',
    };
  }

  if (env.apiKey || (!record?.requiresKey && effectiveBaseUrl)) {
    return {
      apiKey: env.apiKey,
      baseUrl: effectiveBaseUrl,
      organizationHeader: record?.organizationHeader,
      projectIdHeader: record?.projectIdHeader,
      source: env.apiKey || env.baseUrl ? 'env' : 'none',
    };
  }

  return {
    apiKey: null,
    baseUrl: effectiveBaseUrl,
    organizationHeader: record?.organizationHeader,
    projectIdHeader: record?.projectIdHeader,
    source: 'none',
  };
}

export function sanitizeProviderForClient(
  record: AiProviderConfigRecord,
  organizationId: string
): Omit<AiProviderConfigRecord, 'encryptedApiKey'> & {
  hasKeyConfigured: boolean;
  credentialSource: 'admin_encrypted' | 'env' | 'none';
} {
  const { encryptedApiKey, ...safe } = record;
  const env = getEnvFallbackForProvider(record.providerId);
  let credentialSource: 'admin_encrypted' | 'env' | 'none' = 'none';
  let hasKeyConfigured = false;
  let keyMask = record.keyMask;

  if (encryptedApiKey) {
    credentialSource = 'admin_encrypted';
    hasKeyConfigured = true;
  } else if (env.apiKey) {
    credentialSource = 'env';
    hasKeyConfigured = true;
    keyMask = maskSecret(env.apiKey) + ' (env)';
  } else if (!record.requiresKey && (record.baseUrl || env.baseUrl)) {
    credentialSource = env.baseUrl ? 'env' : 'admin_encrypted';
    hasKeyConfigured = true;
  }

  return {
    ...safe,
    baseUrl: record.baseUrl || env.baseUrl || '',
    keyMask,
    hasKeyConfigured,
    credentialSource,
    // Keep organizationId accurate for context
    organizationId: record.scope === 'organization' ? organizationId : null,
  };
}
