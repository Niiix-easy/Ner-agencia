import crypto from 'node:crypto';
import type { Client, CommercialPlan, Organization, SaaSSubscription, User } from '../types.ts';
import {
  assertNoOrganizationTampering,
  normalizePagination,
  paginateArray,
  type PaginatedResult,
  type PaginationOptions,
  type RepositoryContext,
  type RepositoryDeps,
  RepositoryError,
  resolveScopedClientId,
  resolveTenantOrganizationId,
} from './base.ts';

function uid(prefix: string): string {
  return `${prefix}-${Date.now()}-${crypto.randomBytes(3).toString('hex')}`;
}

export class OrganizationRepository {
  constructor(private readonly deps: RepositoryDeps) {}

  async list(ctx: RepositoryContext, opts?: PaginationOptions): Promise<PaginatedResult<Organization>> {
    const isSuper = ctx.isSuperAdmin || ctx.role === 'Super Admin';
    const { page, pageSize, skip, take } = normalizePagination(opts);

    if (this.deps.prisma) {
      const where: Record<string, unknown> = { deletedAt: null };
      if (!isSuper) where.id = ctx.organizationId;
      if (opts?.status) where.status = opts.status;

      const [rows, total] = await Promise.all([
        this.deps.prisma.organization.findMany({
          where,
          orderBy: { createdAt: 'desc' },
          skip,
          take,
        }),
        this.deps.prisma.organization.count({ where }),
      ]);

      return {
        data: rows.map((o) => ({
          id: o.id,
          name: o.name,
          legalName: o.legalName,
          document: o.document || '',
          slug: o.slug,
          status: o.status as Organization['status'],
          createdAt: o.createdAt.toISOString(),
        })),
        pagination: { page, pageSize, total, totalPages: Math.max(1, Math.ceil(total / pageSize)) },
      };
    }

    let list = this.deps.store.getState().organizations;
    if (!isSuper) list = list.filter((o) => o.id === ctx.organizationId);
    if (opts?.status) list = list.filter((o) => o.status === opts.status);
    return paginateArray(list, opts);
  }

  async findById(ctx: RepositoryContext, id: string): Promise<Organization | null> {
    const orgId = resolveTenantOrganizationId(ctx, id);
    if (this.deps.prisma) {
      const o = await this.deps.prisma.organization.findUnique({ where: { id: orgId } });
      if (!o || o.deletedAt) return null;
      return {
        id: o.id,
        name: o.name,
        legalName: o.legalName,
        document: o.document || '',
        slug: o.slug,
        status: o.status as Organization['status'],
        createdAt: o.createdAt.toISOString(),
      };
    }
    return this.deps.store.getState().organizations.find((o) => o.id === orgId) || null;
  }

  async create(
    ctx: RepositoryContext,
    input: { name: string; legalName: string; document?: string; slug: string }
  ): Promise<Organization> {
    if (!ctx.isSuperAdmin && ctx.role !== 'Super Admin') {
      throw new RepositoryError('FORBIDDEN', 'Somente Super Admin pode criar organizações.');
    }
    const id = uid('org');
    if (this.deps.prisma) {
      const created = await this.deps.prisma.organization.create({
        data: {
          id,
          name: input.name.trim(),
          legalName: input.legalName.trim(),
          document: input.document?.trim() || '',
          slug: input.slug.trim().toLowerCase(),
          status: 'Ativo',
        },
      });
      return {
        id: created.id,
        name: created.name,
        legalName: created.legalName,
        document: created.document || '',
        slug: created.slug,
        status: created.status as Organization['status'],
        createdAt: created.createdAt.toISOString(),
      };
    }
    const record: Organization = {
      id,
      name: input.name.trim(),
      legalName: input.legalName.trim(),
      document: input.document?.trim() || '',
      slug: input.slug.trim().toLowerCase(),
      status: 'Ativo',
      createdAt: new Date().toISOString(),
    };
    this.deps.store.getState().organizations.push(record);
    this.deps.store.save();
    return record;
  }
}

export class UserRepository {
  constructor(private readonly deps: RepositoryDeps) {}

  async list(
    ctx: RepositoryContext,
    opts?: PaginationOptions & { organizationId?: string }
  ): Promise<PaginatedResult<Omit<User, 'passwordHash'>>> {
    if (ctx.role === 'Cliente') {
      throw new RepositoryError('FORBIDDEN', 'Perfil Cliente não pode listar usuários da organização.');
    }
    const orgId = resolveTenantOrganizationId(ctx, opts?.organizationId);
    const { page, pageSize, skip, take } = normalizePagination(opts);

    if (this.deps.prisma) {
      const where: Record<string, unknown> = { organizationId: orgId, deletedAt: null };
      if (opts?.status) where.status = opts.status;

      const [rows, total] = await Promise.all([
        this.deps.prisma.user.findMany({
          where,
          select: {
            id: true,
            organizationId: true,
            clientId: true,
            name: true,
            email: true,
            role: true,
            status: true,
            emailVerifiedAt: true,
            googleSub: true,
            avatarUrl: true,
            authProvider: true,
            createdAt: true,
          },
          orderBy: { createdAt: 'desc' },
          skip,
          take,
        }),
        this.deps.prisma.user.count({ where }),
      ]);

      return {
        data: rows.map((u) => ({
          id: u.id,
          organizationId: u.organizationId,
          clientId: u.clientId,
          name: u.name,
          email: u.email,
          role: u.role as User['role'],
          status: u.status as User['status'],
          emailVerifiedAt: u.emailVerifiedAt ? u.emailVerifiedAt.toISOString() : null,
          googleSub: u.googleSub,
          avatarUrl: u.avatarUrl,
          authProvider: u.authProvider as User['authProvider'],
          createdAt: u.createdAt.toISOString(),
        })),
        pagination: { page, pageSize, total, totalPages: Math.max(1, Math.ceil(total / pageSize)) },
      };
    }

    let list = this.deps.store
      .getState()
      .users.filter((u) => u.organizationId === orgId)
      .map(({ passwordHash: _ph, ...safe }) => safe);
    if (opts?.status) list = list.filter((u) => u.status === opts.status);
    return paginateArray(list, opts);
  }

  async countActiveByOrganization(organizationId: string): Promise<number> {
    if (this.deps.prisma) {
      return this.deps.prisma.user.count({
        where: { organizationId, status: 'Ativo', deletedAt: null },
      });
    }
    return this.deps.store
      .getState()
      .users.filter((u) => u.organizationId === organizationId && u.status === 'Ativo').length;
  }
}

export class ClientRepository {
  constructor(private readonly deps: RepositoryDeps) {}

  async list(
    ctx: RepositoryContext,
    opts?: PaginationOptions & { organizationId?: string }
  ): Promise<PaginatedResult<Client>> {
    const orgId = resolveTenantOrganizationId(ctx, opts?.organizationId);
    const scopedClientId = resolveScopedClientId(ctx, opts?.clientId);
    const { page, pageSize, skip, take } = normalizePagination(opts);

    if (this.deps.prisma) {
      const where: Record<string, unknown> = { organizationId: orgId, deletedAt: null };
      if (!opts?.includeArchived) where.archivedAt = null;
      if (scopedClientId) where.id = scopedClientId;
      if (opts?.status) where.status = opts.status;
      if (opts?.search) {
        where.OR = [
          { name: { contains: opts.search, mode: 'insensitive' } },
          { segment: { contains: opts.search, mode: 'insensitive' } },
          { email: { contains: opts.search, mode: 'insensitive' } },
        ];
      }

      const [rows, total] = await Promise.all([
        this.deps.prisma.client.findMany({
          where,
          orderBy: { createdAt: 'desc' },
          skip,
          take,
        }),
        this.deps.prisma.client.count({ where }),
      ]);

      return {
        data: rows.map((c) => this.mapPrismaClient(c)),
        pagination: { page, pageSize, total, totalPages: Math.max(1, Math.ceil(total / pageSize)) },
      };
    }

    let list = this.deps.store.getState().clients.filter((c) => c.organizationId === orgId);
    if (!opts?.includeArchived) list = list.filter((c) => !c.archivedAt);
    if (scopedClientId) list = list.filter((c) => c.id === scopedClientId);
    if (opts?.status) list = list.filter((c) => c.status === opts.status);
    if (opts?.search) {
      const q = opts.search.toLowerCase();
      list = list.filter(
        (c) =>
          c.name.toLowerCase().includes(q) ||
          c.segment.toLowerCase().includes(q) ||
          c.email.toLowerCase().includes(q)
      );
    }
    return paginateArray(list, opts);
  }

  async findById(ctx: RepositoryContext, id: string): Promise<Client | null> {
    const orgId = resolveTenantOrganizationId(ctx);
    const scopedClientId = resolveScopedClientId(ctx, id);

    if (this.deps.prisma) {
      const c = await this.deps.prisma.client.findFirst({
        where: {
          id: scopedClientId || id,
          organizationId: orgId,
          deletedAt: null,
        },
      });
      return c ? this.mapPrismaClient(c) : null;
    }

    return (
      this.deps.store
        .getState()
        .clients.find((c) => c.id === (scopedClientId || id) && c.organizationId === orgId) || null
    );
  }

  async create(
    ctx: RepositoryContext,
    input: Partial<Client> & { name: string; organizationId?: string }
  ): Promise<Client> {
    assertNoOrganizationTampering(ctx, input.organizationId);
    const orgId = resolveTenantOrganizationId(ctx, input.organizationId);
    const id = uid('cli');

    if (this.deps.prisma) {
      const created = await this.deps.prisma.client.create({
        data: {
          id,
          organizationId: orgId,
          name: input.name.trim(),
          legalName: input.legalName?.trim() || input.name.trim(),
          document: input.document?.trim() || '',
          email: input.email?.trim() || '',
          phone: input.phone?.trim() || '',
          website: input.website?.trim() || '',
          segment: input.segment?.trim() || 'Geral',
          category: input.category?.trim() || 'Pequena Empresa',
          status: input.status || 'Ativo',
          mrr: Number(input.mrr || 0),
          health: input.health || 'Novo',
          manager: input.manager?.trim() || '',
          notes: input.notes || null,
          createdBy: ctx.userId,
          updatedBy: ctx.userId,
        },
      });
      return this.mapPrismaClient(created);
    }

    const record: Client = {
      id,
      organizationId: orgId,
      name: input.name.trim(),
      legalName: input.legalName?.trim() || input.name.trim(),
      document: input.document?.trim() || '',
      email: input.email?.trim() || '',
      phone: input.phone?.trim() || '',
      website: input.website?.trim() || '',
      segment: input.segment?.trim() || 'Geral',
      category: input.category?.trim() || 'Pequena Empresa',
      status: input.status || 'Ativo',
      mrr: Number(input.mrr || 0),
      health: input.health || 'Novo',
      manager: input.manager?.trim() || '',
      notes: input.notes,
      archivedAt: null,
      createdAt: new Date().toISOString(),
    };
    this.deps.store.getState().clients.unshift(record);
    this.deps.store.save();
    return record;
  }

  async archive(ctx: RepositoryContext, id: string, restore = false): Promise<Client> {
    const orgId = resolveTenantOrganizationId(ctx);
    const archivedAt = restore ? null : new Date();

    if (this.deps.prisma) {
      const existing = await this.deps.prisma.client.findFirst({
        where: { id, organizationId: orgId },
      });
      if (!existing) throw new RepositoryError('NOT_FOUND', 'Cliente não encontrado no escopo.');
      const updated = await this.deps.prisma.client.update({
        where: { id },
        data: { archivedAt, updatedBy: ctx.userId },
      });
      return this.mapPrismaClient(updated);
    }

    const existing = this.deps.store
      .getState()
      .clients.find((c) => c.id === id && c.organizationId === orgId);
    if (!existing) throw new RepositoryError('NOT_FOUND', 'Cliente não encontrado no escopo.');
    existing.archivedAt = archivedAt ? archivedAt.toISOString() : null;
    this.deps.store.save();
    return existing;
  }

  private mapPrismaClient(c: any): Client {
    return {
      id: c.id,
      organizationId: c.organizationId,
      name: c.name,
      legalName: c.legalName || '',
      document: c.document || '',
      email: c.email || '',
      phone: c.phone || '',
      website: c.website || '',
      segment: c.segment,
      category: c.category,
      status: c.status as Client['status'],
      mrr: c.mrr,
      health: c.health as Client['health'],
      manager: c.manager || '',
      notes: c.notes || undefined,
      archivedAt: c.archivedAt ? c.archivedAt.toISOString() : null,
      createdAt: c.createdAt.toISOString(),
    };
  }
}

export class SubscriptionRepository {
  constructor(private readonly deps: RepositoryDeps) {}

  async getByOrganization(
    ctx: RepositoryContext,
    requestedOrgId?: string
  ): Promise<{ subscription: SaaSSubscription | null; plan: CommercialPlan | null }> {
    if (ctx.role !== 'Super Admin' && ctx.role !== 'Administrador') {
      throw new RepositoryError(
        'FORBIDDEN',
        'Acesso aos dados internos da assinatura SaaS restrito a administradores.'
      );
    }
    const orgId = resolveTenantOrganizationId(ctx, requestedOrgId);

    if (this.deps.prisma) {
      const sub = await this.deps.prisma.subscription.findFirst({
        where: { organizationId: orgId },
        orderBy: { updatedAt: 'desc' },
      });
      const plan = sub
        ? await this.deps.prisma.commercialPlan.findUnique({ where: { code: sub.planCode } })
        : null;

      return {
        subscription: sub
          ? {
              id: sub.id,
              organizationId: sub.organizationId,
              planCode: sub.planCode,
              planName: sub.planName,
              provider: sub.provider as SaaSSubscription['provider'],
              externalSubId: sub.externalSubId,
              externalCustomerId: sub.externalCustomerId,
              status: sub.status as SaaSSubscription['status'],
              amountMonthly: sub.amountMonthly,
              currentPeriodEnd: sub.currentPeriodEnd ? sub.currentPeriodEnd.toISOString() : null,
              updatedAt: sub.updatedAt.toISOString(),
            }
          : null,
        plan: plan
          ? {
              id: plan.id,
              code: plan.code,
              name: plan.name,
              targetAudience: plan.targetAudience,
              category: plan.category as CommercialPlan['category'],
              serviceTemplateType: plan.serviceTemplateType as CommercialPlan['serviceTemplateType'],
              setupPrice: plan.setupPrice,
              recurringPrice: plan.recurringPrice,
              recurrence: plan.recurrence as CommercialPlan['recurrence'],
              deliverables: (plan.deliverables as string[]) || [],
              limits: plan.limits as CommercialPlan['limits'],
              isActive: plan.isActive,
              updatedAt: plan.updatedAt.toISOString(),
            }
          : null,
      };
    }

    const state = this.deps.store.getState();
    const sub = state.subscriptions.find((s) => s.organizationId === orgId) || null;
    const plan = sub ? state.commercialPlans.find((p) => p.code === sub.planCode) || null : null;
    return { subscription: sub, plan };
  }
}
