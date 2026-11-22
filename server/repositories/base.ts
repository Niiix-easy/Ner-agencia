import type { PrismaClient } from '@prisma/client';
import type { PersistentStore } from '../store.ts';
import type { RoleName } from '../types.ts';

export interface RepositoryContext {
  organizationId: string;
  userId: string;
  role: RoleName;
  clientId?: string | null;
  isSuperAdmin?: boolean;
}

export interface PaginationOptions {
  page?: number;
  pageSize?: number;
  search?: string;
  status?: string;
  clientId?: string;
  projectId?: string;
  includeArchived?: boolean;
}

export interface PaginatedResult<T> {
  data: T[];
  pagination: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
  };
}

export type RepositoryErrorCode =
  | 'FORBIDDEN'
  | 'CROSS_TENANT_VIOLATION'
  | 'NOT_FOUND'
  | 'VALIDATION_ERROR'
  | 'DATABASE_UNAVAILABLE';

export class RepositoryError extends Error {
  public readonly code: RepositoryErrorCode;
  public readonly status: number;

  constructor(code: RepositoryErrorCode, message: string, status?: number) {
    super(message);
    this.name = 'RepositoryError';
    this.code = code;
    this.status =
      status ??
      (code === 'NOT_FOUND'
        ? 404
        : code === 'VALIDATION_ERROR'
          ? 400
          : code === 'DATABASE_UNAVAILABLE'
            ? 503
            : 403);
  }
}

export interface RepositoryDeps {
  store: PersistentStore;
  prisma?: PrismaClient | null;
}

export const MAX_PAGE_SIZE = 100;
export const DEFAULT_PAGE_SIZE = 25;

export function normalizePagination(opts?: PaginationOptions): {
  page: number;
  pageSize: number;
  skip: number;
  take: number;
} {
  const page = Math.max(1, Math.floor(Number(opts?.page) || 1));
  const pageSize = Math.min(
    MAX_PAGE_SIZE,
    Math.max(1, Math.floor(Number(opts?.pageSize) || DEFAULT_PAGE_SIZE))
  );
  return {
    page,
    pageSize,
    skip: (page - 1) * pageSize,
    take: pageSize,
  };
}

export function paginateArray<T>(items: T[], opts?: PaginationOptions): PaginatedResult<T> {
  const { page, pageSize, skip, take } = normalizePagination(opts);
  const total = items.length;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  return {
    data: items.slice(skip, skip + take),
    pagination: {
      page,
      pageSize,
      total,
      totalPages,
    },
  };
}

/**
 * Enforces organization tenant boundary.
 * Blocks any attempt by a non-Super-Admin user to query or mutate another organizationId.
 */
export function resolveTenantOrganizationId(
  ctx: RepositoryContext,
  requestedOrgId?: string | null
): string {
  if (!ctx.organizationId) {
    throw new RepositoryError('FORBIDDEN', 'Contexto organizacional ausente.');
  }
  if (requestedOrgId && requestedOrgId !== ctx.organizationId) {
    if (!ctx.isSuperAdmin && ctx.role !== 'Super Admin') {
      throw new RepositoryError(
        'CROSS_TENANT_VIOLATION',
        'Alteração ou acesso a outra organização não permitido.'
      );
    }
    return requestedOrgId;
  }
  return ctx.organizationId;
}

/**
 * Enforces strict Cliente isolation: Cliente users can NEVER access another client's resources
 * and fail closed when their account is not bound to a clientId.
 */
export function resolveScopedClientId(
  ctx: RepositoryContext,
  requestedClientId?: string | null
): string | undefined {
  if (ctx.role === 'Cliente') {
    if (!ctx.clientId) {
      throw new RepositoryError(
        'FORBIDDEN',
        'Conta de cliente sem vínculo organizacional ativo.'
      );
    }
    if (requestedClientId && requestedClientId !== ctx.clientId) {
      throw new RepositoryError(
        'CROSS_TENANT_VIOLATION',
        'Acesso negado a dados de outro cliente.'
      );
    }
    return ctx.clientId;
  }
  return requestedClientId || undefined;
}

/**
 * Blocks cross-organization payload mutation attempts (e.g. client trying to inject organizationId of Org B).
 */
export function assertNoOrganizationTampering(
  ctx: RepositoryContext,
  payloadOrganizationId?: string | null
): void {
  if (
    payloadOrganizationId &&
    payloadOrganizationId !== ctx.organizationId &&
    !ctx.isSuperAdmin &&
    ctx.role !== 'Super Admin'
  ) {
    throw new RepositoryError(
      'CROSS_TENANT_VIOLATION',
      'Não é permitido alterar ou vincular registros a outra organização.'
    );
  }
}
