import { PrismaClient, Prisma } from '@prisma/client';
import { Pool, type PoolConfig } from 'pg';

export type PersistenceMode = 'postgres' | 'json_fallback';

export interface TenantTransactionContext {
  organizationId: string;
  userId?: string;
  clientId?: string | null;
  isSuperAdmin?: boolean;
}

export interface DatabaseHealthStatus {
  mode: PersistenceMode;
  configured: boolean;
  connected: boolean;
  provider: 'postgresql' | 'json_file';
  latencyMs: number | null;
  poolStats: {
    totalCount: number;
    idleCount: number;
    waitingCount: number;
  } | null;
  error: string | null;
}

declare global {
  var __nerPrismaClient: PrismaClient | undefined;
  var __nerPgPool: Pool | undefined;
}

/**
 * Strips credentials from a PostgreSQL connection URL before logging or returning diagnostics.
 */
export function sanitizeDatabaseUrl(rawUrl?: string | null): string {
  if (!rawUrl) return '(not configured)';
  try {
    const parsed = new URL(rawUrl);
    if (parsed.password) parsed.password = '***';
    if (parsed.username) parsed.username = '***';
    return parsed.toString();
  } catch {
    return '(invalid DATABASE_URL format)';
  }
}

export function isPostgresConfigured(): boolean {
  const url = process.env.DATABASE_URL?.trim();
  return Boolean(url && (url.startsWith('postgres://') || url.startsWith('postgresql://')));
}

export function getActivePersistenceMode(): PersistenceMode {
  if (process.env.NER_FORCE_JSON_STORE === 'true') {
    return 'json_fallback';
  }
  return isPostgresConfigured() ? 'postgres' : 'json_fallback';
}

function buildPgPoolConfig(): PoolConfig {
  const connectionString = process.env.DATABASE_URL?.trim();
  const sslMode = process.env.DATABASE_SSL?.trim().toLowerCase();
  const max = Math.max(2, Math.min(50, Number(process.env.PG_POOL_MAX) || 10));
  const idleTimeoutMillis = Math.max(1000, Number(process.env.PG_IDLE_TIMEOUT_MS) || 30_000);
  const connectionTimeoutMillis = Math.max(1000, Number(process.env.PG_CONNECT_TIMEOUT_MS) || 10_000);

  const config: PoolConfig = {
    connectionString,
    max,
    idleTimeoutMillis,
    connectionTimeoutMillis,
  };

  if (sslMode === 'true' || sslMode === 'require') {
    config.ssl = {
      rejectUnauthorized: process.env.DATABASE_SSL_REJECT_UNAUTHORIZED !== 'false',
    };
  }

  return config;
}

/**
 * Centralized singleton pg.Pool (never creates duplicate pools across hot reloads).
 */
export function getPgPool(): Pool {
  if (!isPostgresConfigured()) {
    throw new Error('DATABASE_UNAVAILABLE: DATABASE_URL não configurada para PostgreSQL.');
  }
  if (!globalThis.__nerPgPool) {
    const pool = new Pool(buildPgPoolConfig());
    pool.on('error', (err) => {
      // Never log connection strings or secrets
      console.error('[NER-DB] Unexpected idle PostgreSQL pool error:', err.message);
    });
    globalThis.__nerPgPool = pool;
  }
  return globalThis.__nerPgPool;
}

/**
 * Centralized singleton PrismaClient.
 * Compatible with Cloud SQL, Managed PostgreSQL, Lovable Cloud / Supabase / Neon, and self-hosted PostgreSQL.
 */
export function getPrismaClient(): PrismaClient {
  if (!isPostgresConfigured()) {
    throw new Error('DATABASE_UNAVAILABLE: DATABASE_URL não configurada para PrismaClient.');
  }
  if (!globalThis.__nerPrismaClient) {
    globalThis.__nerPrismaClient = new PrismaClient({
      log:
        process.env.NODE_ENV === 'development'
          ? ['warn', 'error']
          : ['error'],
    });
  }
  return globalThis.__nerPrismaClient;
}

/**
 * Executes a Prisma interactive transaction with PostgreSQL transaction-local RLS context
 * (`SET LOCAL app.current_organization_id`, `app.current_client_id`, `app.is_super_admin`).
 * Because `SET LOCAL` is strictly transaction-scoped, pooled connections never leak tenant state.
 */
export async function withTenantTransaction<T>(
  ctx: TenantTransactionContext,
  fn: (tx: Prisma.TransactionClient) => Promise<T>,
  prismaOverride?: PrismaClient
): Promise<T> {
  if (!ctx.organizationId && !ctx.isSuperAdmin) {
    throw new Error('TENANT_CONTEXT_REQUIRED: organizationId obrigatório para transação multi-tenant.');
  }

  const client = prismaOverride || getPrismaClient();
  return client.$transaction(async (tx) => {
    const orgId = ctx.organizationId || '';
    const clientId = ctx.clientId || '';
    const isSuperAdmin = ctx.isSuperAdmin ? 'true' : 'false';

    await tx.$executeRaw`SELECT set_config('app.current_organization_id', ${orgId}, true)`;
    await tx.$executeRaw`SELECT set_config('app.current_client_id', ${clientId}, true)`;
    await tx.$executeRaw`SELECT set_config('app.is_super_admin', ${isSuperAdmin}, true)`;

    return fn(tx);
  });
}

/**
 * Safe, sanitized health probe (never exposes credentials or internal stack traces).
 */
export async function checkDatabaseHealth(prismaOverride?: PrismaClient): Promise<DatabaseHealthStatus> {
  const configured = isPostgresConfigured();
  const mode = getActivePersistenceMode();

  if (!configured) {
    return {
      mode: 'json_fallback',
      configured: false,
      connected: false,
      provider: 'json_file',
      latencyMs: null,
      poolStats: null,
      error: 'DATABASE_URL não configurada (operando em modo JSON fallback até provisionamento do PostgreSQL).',
    };
  }

  const start = Date.now();
  try {
    const prisma = prismaOverride || getPrismaClient();
    await prisma.$queryRaw`SELECT 1`;
    const pool = globalThis.__nerPgPool;
    return {
      mode,
      configured: true,
      connected: true,
      provider: 'postgresql',
      latencyMs: Date.now() - start,
      poolStats: pool
        ? {
            totalCount: pool.totalCount,
            idleCount: pool.idleCount,
            waitingCount: pool.waitingCount,
          }
        : null,
      error: null,
    };
  } catch (err: any) {
    const safeMsg = String(err?.message || 'Falha de conexão com PostgreSQL').replace(
      /postgres(?:ql)?:\/\/[^\s'"]+/gi,
      '[REDACTED_DB_URL]'
    );
    return {
      mode,
      configured: true,
      connected: false,
      provider: 'postgresql',
      latencyMs: Date.now() - start,
      poolStats: null,
      error: safeMsg,
    };
  }
}

/**
 * Graceful disconnect for PrismaClient and pg.Pool (called on SIGINT/SIGTERM and test teardown).
 */
export async function disconnectDatabase(): Promise<void> {
  if (globalThis.__nerPrismaClient) {
    const client = globalThis.__nerPrismaClient;
    globalThis.__nerPrismaClient = undefined;
    await client.$disconnect().catch(() => {});
  }
  if (globalThis.__nerPgPool) {
    const pool = globalThis.__nerPgPool;
    globalThis.__nerPgPool = undefined;
    await pool.end().catch(() => {});
  }
}

let shutdownHooksRegistered = false;
export function registerDatabaseShutdownHooks(): void {
  if (shutdownHooksRegistered) return;
  shutdownHooksRegistered = true;

  const handleSignal = () => {
    void disconnectDatabase().finally(() => {
      process.exit(0);
    });
  };

  process.once('SIGINT', handleSignal);
  process.once('SIGTERM', handleSignal);
}
