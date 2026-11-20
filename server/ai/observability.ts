import crypto from 'node:crypto';
import { AiProviderId } from './types.ts';

export type CircuitState = 'CLOSED' | 'OPEN' | 'HALF_OPEN';

interface CircuitRecord {
  state: CircuitState;
  consecutiveFailures: number;
  openedAt: number | null;
  lastError: string | null;
}

const FAILURE_THRESHOLD = 3;
const COOLDOWN_MS = 30_000;

export class AiObservabilityService {
  private circuits = new Map<AiProviderId, CircuitRecord>();

  public generateIds(): { requestId: string; traceId: string } {
    return {
      requestId: `aireq_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`,
      traceId: `aitrc_${crypto.randomBytes(6).toString('hex')}`,
    };
  }

  public getCircuitState(providerId: AiProviderId): CircuitRecord {
    const current = this.circuits.get(providerId) || {
      state: 'CLOSED' as CircuitState,
      consecutiveFailures: 0,
      openedAt: null,
      lastError: null,
    };
    if (
      current.state === 'OPEN' &&
      current.openedAt !== null &&
      Date.now() - current.openedAt >= COOLDOWN_MS
    ) {
      current.state = 'HALF_OPEN';
      this.circuits.set(providerId, current);
    }
    return current;
  }

  public isCircuitAllowed(providerId: AiProviderId): boolean {
    const rec = this.getCircuitState(providerId);
    return rec.state !== 'OPEN';
  }

  public recordSuccess(providerId: AiProviderId): void {
    this.circuits.set(providerId, {
      state: 'CLOSED',
      consecutiveFailures: 0,
      openedAt: null,
      lastError: null,
    });
  }

  public recordFailure(providerId: AiProviderId, errorMessage: string): CircuitRecord {
    const current = this.getCircuitState(providerId);
    const failures = current.consecutiveFailures + 1;
    const isOpen = failures >= FAILURE_THRESHOLD;
    const updated: CircuitRecord = {
      state: isOpen ? 'OPEN' : current.state,
      consecutiveFailures: failures,
      openedAt: isOpen ? Date.now() : current.openedAt,
      lastError: sanitizeErrorText(errorMessage),
    };
    this.circuits.set(providerId, updated);
    return updated;
  }

  public resetAllCircuits(): void {
    this.circuits.clear();
  }

  public getAllCircuits(): Record<string, CircuitRecord> {
    const result: Record<string, CircuitRecord> = {};
    for (const [k] of this.circuits) {
      result[k] = this.getCircuitState(k);
    }
    return result;
  }
}

export function sanitizeErrorText(input: string): string {
  // Never leak Bearer tokens or sk- keys in logs or UI messages
  return input
    .replace(/(sk-[a-zA-Z0-9_-]{6,}|AIza[a-zA-Z0-9_-]{10,}|hf_[a-zA-Z0-9]{8,}|Bearer\s+[a-zA-Z0-9._-]{8,})/g, '[REDACTED_CREDENTIAL]')
    .slice(0, 400);
}

export class AiUpstreamError extends Error {
  public readonly statusCode: number;
  public readonly retryable: boolean;
  public readonly providerId: AiProviderId;
  public readonly category: 'auth' | 'rate_limit' | 'timeout' | 'context_limit' | 'unavailable' | 'bad_request';

  constructor(
    providerId: AiProviderId,
    message: string,
    statusCode: number,
    category: 'auth' | 'rate_limit' | 'timeout' | 'context_limit' | 'unavailable' | 'bad_request'
  ) {
    super(sanitizeErrorText(message));
    this.name = 'AiUpstreamError';
    this.providerId = providerId;
    this.statusCode = statusCode;
    this.category = category;
    this.retryable = category === 'rate_limit' || category === 'timeout' || category === 'unavailable';
  }
}
