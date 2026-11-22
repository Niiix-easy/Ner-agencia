import crypto from 'node:crypto';
import type { Commission, Contract, Lead, Opportunity, Payable, Proposal, Receivable } from '../types.ts';
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

export interface FinanceSummaryResult {
  scope: 'organization' | 'client';
  organizationId: string;
  clientId?: string;
  agencyRevenue?: number;
  pendingReceivables?: number;
  totalPayable?: number;
  pendingCommissions?: number;
  netOperatingResult?: number;
  operatingMargin?: number;
  totalBilled?: number;
  totalPaid?: number;
  totalPending?: number;
  clientAdSpend: number;
}

export class FinanceRepository {
  constructor(private readonly deps: RepositoryDeps) {}

  async getSummary(
    ctx: RepositoryContext,
    opts?: { organizationId?: string; clientId?: string; scope?: string }
  ): Promise<FinanceSummaryResult> {
    const orgId = resolveTenantOrganizationId(ctx, opts?.organizationId);

    if (ctx.role === 'Cliente') {
      if (opts?.scope === 'global' || opts?.scope === 'organization') {
        throw new RepositoryError(
          'FORBIDDEN',
          'Perfil Cliente não possui acesso a dados financeiros agregados da organização.'
        );
      }
      const clientId = resolveScopedClientId(ctx, opts?.clientId)!;

      if (this.deps.prisma) {
        const [receivables, adAccounts] = await Promise.all([
          this.deps.prisma.receivable.findMany({
            where: { organizationId: orgId, clientId, deletedAt: null },
            select: { amount: true, paidAmount: true },
          }),
          this.deps.prisma.adAccount.findMany({
            where: { organizationId: orgId, clientId },
            select: { spend: true },
          }),
        ]);
        const totalBilled = receivables.reduce((s, r) => s + r.amount, 0);
        const totalPaid = receivables.reduce((s, r) => s + r.paidAmount, 0);
        const clientAdSpend = adAccounts.reduce((s, a) => s + a.spend, 0);
        return {
          scope: 'client',
          organizationId: orgId,
          clientId,
          totalBilled,
          totalPaid,
          totalPending: Math.max(0, totalBilled - totalPaid),
          clientAdSpend,
        };
      }

      const state = this.deps.store.getState();
      const recs = state.receivables.filter((r) => r.organizationId === orgId && r.clientId === clientId);
      const ads = state.adAccounts.filter((a) => a.organizationId === orgId && a.clientId === clientId);
      const totalBilled = recs.reduce((s, r) => s + r.amount, 0);
      const totalPaid = recs.reduce((s, r) => s + r.paidAmount, 0);
      return {
        scope: 'client',
        organizationId: orgId,
        clientId,
        totalBilled,
        totalPaid,
        totalPending: Math.max(0, totalBilled - totalPaid),
        clientAdSpend: ads.reduce((s, a) => s + a.spend, 0),
      };
    }

    if (this.deps.prisma) {
      const [receivables, payables, commissions, adAccounts] = await Promise.all([
        this.deps.prisma.receivable.findMany({
          where: { organizationId: orgId, deletedAt: null },
          select: { amount: true, paidAmount: true },
        }),
        this.deps.prisma.payable.findMany({
          where: { organizationId: orgId, deletedAt: null },
          select: { amount: true },
        }),
        this.deps.prisma.commission.findMany({
          where: { organizationId: orgId },
          select: { commissionValue: true, status: true },
        }),
        this.deps.prisma.adAccount.findMany({
          where: { organizationId: orgId },
          select: { spend: true },
        }),
      ]);
      const agencyRevenue = receivables.reduce((s, r) => s + r.amount, 0);
      const totalPaid = receivables.reduce((s, r) => s + r.paidAmount, 0);
      const totalPayable = payables.reduce((s, p) => s + p.amount, 0);
      const pendingCommissions = commissions
        .filter((c) => c.status !== 'Pago')
        .reduce((s, c) => s + c.commissionValue, 0);
      const netOperatingResult = totalPaid - totalPayable;
      return {
        scope: 'organization',
        organizationId: orgId,
        agencyRevenue,
        pendingReceivables: Math.max(0, agencyRevenue - totalPaid),
        totalPayable,
        pendingCommissions,
        netOperatingResult,
        operatingMargin: agencyRevenue > 0 ? Number(((netOperatingResult / agencyRevenue) * 100).toFixed(1)) : 0,
        clientAdSpend: adAccounts.reduce((s, a) => s + a.spend, 0),
      };
    }

    const state = this.deps.store.getState();
    const recs = state.receivables.filter((r) => r.organizationId === orgId);
    const pays = state.payables.filter((p) => p.organizationId === orgId);
    const comms = state.commissions.filter((c) => c.organizationId === orgId);
    const ads = state.adAccounts.filter((a) => a.organizationId === orgId);
    const agencyRevenue = recs.reduce((s, r) => s + r.amount, 0);
    const totalPaid = recs.reduce((s, r) => s + r.paidAmount, 0);
    const totalPayable = pays.reduce((s, p) => s + p.amount, 0);
    const netOperatingResult = totalPaid - totalPayable;
    return {
      scope: 'organization',
      organizationId: orgId,
      agencyRevenue,
      pendingReceivables: Math.max(0, agencyRevenue - totalPaid),
      totalPayable,
      pendingCommissions: comms.filter((c) => c.status !== 'Pago').reduce((s, c) => s + c.commissionValue, 0),
      netOperatingResult,
      operatingMargin: agencyRevenue > 0 ? Number(((netOperatingResult / agencyRevenue) * 100).toFixed(1)) : 0,
      clientAdSpend: ads.reduce((s, a) => s + a.spend, 0),
    };
  }

  async listReceivables(
    ctx: RepositoryContext,
    opts?: PaginationOptions & { organizationId?: string }
  ): Promise<PaginatedResult<Receivable>> {
    const orgId = resolveTenantOrganizationId(ctx, opts?.organizationId);
    const clientId = resolveScopedClientId(ctx, opts?.clientId);
    const { page, pageSize, skip, take } = normalizePagination(opts);

    if (this.deps.prisma) {
      const where: Record<string, unknown> = { organizationId: orgId, deletedAt: null };
      if (clientId) where.clientId = clientId;
      if (opts?.status) where.status = opts.status;

      const [rows, total] = await Promise.all([
        this.deps.prisma.receivable.findMany({
          where,
          orderBy: { dueDate: 'asc' },
          skip,
          take,
        }),
        this.deps.prisma.receivable.count({ where }),
      ]);
      return {
        data: rows.map((r) => this.mapPrismaReceivable(r)),
        pagination: { page, pageSize, total, totalPages: Math.max(1, Math.ceil(total / pageSize)) },
      };
    }

    let list = this.deps.store.getState().receivables.filter((r) => r.organizationId === orgId);
    if (clientId) list = list.filter((r) => r.clientId === clientId);
    if (opts?.status) list = list.filter((r) => r.status === opts.status);
    return paginateArray(list, opts);
  }

  async recordReceivablePayment(
    ctx: RepositoryContext,
    receivableId: string,
    input: { paidAmount: number; paymentMethod?: string; paymentRef?: string }
  ): Promise<Receivable> {
    if (ctx.role === 'Cliente') {
      throw new RepositoryError('FORBIDDEN', 'Perfil Cliente não pode registrar baixas financeiras.');
    }
    const orgId = resolveTenantOrganizationId(ctx);
    const addAmount = Number(input.paidAmount);
    if (!Number.isFinite(addAmount) || addAmount <= 0) {
      throw new RepositoryError('VALIDATION_ERROR', 'Valor pago deve ser maior que zero.');
    }

    if (this.deps.prisma) {
      return this.deps.prisma.$transaction(async (tx) => {
        const existing = await tx.receivable.findFirst({
          where: { id: receivableId, organizationId: orgId, deletedAt: null },
        });
        if (!existing) throw new RepositoryError('NOT_FOUND', 'Recebível não encontrado no escopo.');

        const nextPaid = Math.min(existing.amount, existing.paidAmount + addAmount);
        const nextStatus = nextPaid >= existing.amount ? 'Pago' : 'Parcialmente pago';
        const updated = await tx.receivable.update({
          where: { id: existing.id },
          data: {
            paidAmount: nextPaid,
            status: nextStatus,
            paymentMethod: input.paymentMethod || existing.paymentMethod,
            paymentRef: input.paymentRef || existing.paymentRef,
            paidAt: nextStatus === 'Pago' ? new Date() : existing.paidAt,
            updatedBy: ctx.userId,
          },
        });
        if (nextStatus === 'Pago' && existing.contractId) {
          await tx.commission.updateMany({
            where: {
              organizationId: orgId,
              contractId: existing.contractId,
              status: 'Aguardando recebimento',
            },
            data: { status: 'Disponível', updatedBy: ctx.userId },
          });
        }
        return this.mapPrismaReceivable(updated);
      });
    }

    return this.deps.store.runTransaction((state) => {
      const existing = state.receivables.find((r) => r.id === receivableId && r.organizationId === orgId);
      if (!existing) throw new RepositoryError('NOT_FOUND', 'Recebível não encontrado no escopo.');
      existing.paidAmount = Math.min(existing.amount, existing.paidAmount + addAmount);
      existing.status = existing.paidAmount >= existing.amount ? 'Pago' : 'Parcialmente pago';
      if (input.paymentMethod) existing.paymentMethod = input.paymentMethod;
      if (input.paymentRef) existing.paymentRef = input.paymentRef;
      if (existing.status === 'Pago') {
        existing.paidAt = new Date().toISOString();
        if (existing.contractId) {
          for (const c of state.commissions) {
            if (
              c.organizationId === orgId &&
              c.contractId === existing.contractId &&
              c.status === 'Aguardando recebimento'
            ) {
              c.status = 'Disponível';
            }
          }
        }
      }
      return existing;
    });
  }

  async listPayables(ctx: RepositoryContext, opts?: PaginationOptions): Promise<PaginatedResult<Payable>> {
    if (ctx.role === 'Cliente') {
      throw new RepositoryError('FORBIDDEN', 'Contas a pagar da agência são restritas à equipe interna.');
    }
    const orgId = resolveTenantOrganizationId(ctx);
    const { page, pageSize, skip, take } = normalizePagination(opts);

    if (this.deps.prisma) {
      const where: Record<string, unknown> = { organizationId: orgId, deletedAt: null };
      if (opts?.status) where.status = opts.status;
      const [rows, total] = await Promise.all([
        this.deps.prisma.payable.findMany({ where, orderBy: { dueDate: 'asc' }, skip, take }),
        this.deps.prisma.payable.count({ where }),
      ]);
      return {
        data: rows.map((p) => ({
          id: p.id,
          organizationId: p.organizationId,
          supplier: p.supplier,
          description: p.description,
          category: p.category,
          amount: p.amount,
          dueDate: p.dueDate,
          status: p.status as Payable['status'],
        })),
        pagination: { page, pageSize, total, totalPages: Math.max(1, Math.ceil(total / pageSize)) },
      };
    }

    let list = this.deps.store.getState().payables.filter((p) => p.organizationId === orgId);
    if (opts?.status) list = list.filter((p) => p.status === opts.status);
    return paginateArray(list, opts);
  }

  async listCommissions(ctx: RepositoryContext, opts?: PaginationOptions): Promise<PaginatedResult<Commission>> {
    if (ctx.role === 'Cliente') {
      throw new RepositoryError('FORBIDDEN', 'Comissões comerciais são restritas à equipe interna.');
    }
    const orgId = resolveTenantOrganizationId(ctx);
    const { page, pageSize, skip, take } = normalizePagination(opts);

    if (this.deps.prisma) {
      const where: Record<string, unknown> = { organizationId: orgId };
      if (opts?.status) where.status = opts.status;
      const [rows, total] = await Promise.all([
        this.deps.prisma.commission.findMany({ where, orderBy: { createdAt: 'desc' }, skip, take }),
        this.deps.prisma.commission.count({ where }),
      ]);
      return {
        data: rows.map((c) => ({
          id: c.id,
          organizationId: c.organizationId,
          responsible: c.responsible,
          clientName: c.clientName,
          contractId: c.contractId || undefined,
          baseAmount: c.baseAmount,
          percentage: c.percentage,
          commissionValue: c.commissionValue,
          status: c.status as Commission['status'],
        })),
        pagination: { page, pageSize, total, totalPages: Math.max(1, Math.ceil(total / pageSize)) },
      };
    }

    let list = this.deps.store.getState().commissions.filter((c) => c.organizationId === orgId);
    if (opts?.status) list = list.filter((c) => c.status === opts.status);
    return paginateArray(list, opts);
  }

  private mapPrismaReceivable(r: any): Receivable {
    return {
      id: r.id,
      organizationId: r.organizationId,
      clientId: r.clientId,
      clientName: r.clientName,
      contractId: r.contractId || undefined,
      description: r.description,
      amount: r.amount,
      paidAmount: r.paidAmount,
      dueDate: r.dueDate,
      status: r.status as Receivable['status'],
      paymentMethod: r.paymentMethod || undefined,
      paymentRef: r.paymentRef || undefined,
      paidAt: r.paidAt ? r.paidAt.toISOString() : null,
      mediaBudget: r.mediaBudget,
    };
  }
}

export class CRMRepository {
  constructor(private readonly deps: RepositoryDeps) {}

  async listLeads(ctx: RepositoryContext, opts?: PaginationOptions): Promise<PaginatedResult<Lead>> {
    const orgId = resolveTenantOrganizationId(ctx);
    const { page, pageSize, skip, take } = normalizePagination(opts);

    if (this.deps.prisma) {
      const where: Record<string, unknown> = { organizationId: orgId, deletedAt: null };
      if (!opts?.includeArchived) where.archivedAt = null;
      if (opts?.status) where.status = opts.status;
      const [rows, total] = await Promise.all([
        this.deps.prisma.lead.findMany({ where, orderBy: { createdAt: 'desc' }, skip, take }),
        this.deps.prisma.lead.count({ where }),
      ]);
      return {
        data: rows.map((l) => ({
          id: l.id,
          organizationId: l.organizationId,
          name: l.name,
          email: l.email,
          phone: l.phone || '',
          company: l.company,
          segment: l.segment || '',
          source: l.source,
          utmCampaign: l.utmCampaign || undefined,
          status: l.status,
          estimatedValue: l.estimatedValue,
          assignedUserId: l.assignedUserId || undefined,
          archivedAt: l.archivedAt ? l.archivedAt.toISOString() : null,
          createdAt: l.createdAt.toISOString(),
        })),
        pagination: { page, pageSize, total, totalPages: Math.max(1, Math.ceil(total / pageSize)) },
      };
    }

    let list = this.deps.store.getState().leads.filter((l) => l.organizationId === orgId);
    if (!opts?.includeArchived) list = list.filter((l) => !l.archivedAt);
    if (opts?.status) list = list.filter((l) => l.status === opts.status);
    return paginateArray(list, opts);
  }

  async listOpportunities(
    ctx: RepositoryContext,
    opts?: PaginationOptions
  ): Promise<PaginatedResult<Opportunity>> {
    const orgId = resolveTenantOrganizationId(ctx);
    const { page, pageSize, skip, take } = normalizePagination(opts);

    if (this.deps.prisma) {
      const where: Record<string, unknown> = { organizationId: orgId, deletedAt: null };
      if (!opts?.includeArchived) where.archivedAt = null;
      const [rows, total] = await Promise.all([
        this.deps.prisma.opportunity.findMany({ where, orderBy: { createdAt: 'desc' }, skip, take }),
        this.deps.prisma.opportunity.count({ where }),
      ]);
      return {
        data: rows.map((o) => ({
          id: o.id,
          organizationId: o.organizationId,
          name: o.name,
          clientId: o.clientId || undefined,
          leadId: o.leadId || undefined,
          stage: o.stage,
          value: o.value,
          probability: o.probability,
          responsible: o.responsible,
          expectedClose: o.expectedClose || undefined,
          history: (o.history as Opportunity['history']) || [],
          archivedAt: o.archivedAt ? o.archivedAt.toISOString() : null,
        })),
        pagination: { page, pageSize, total, totalPages: Math.max(1, Math.ceil(total / pageSize)) },
      };
    }

    let list = this.deps.store.getState().opportunities.filter((o) => o.organizationId === orgId);
    if (!opts?.includeArchived) list = list.filter((o) => !o.archivedAt);
    return paginateArray(list, opts);
  }
}

export class ProposalRepository {
  constructor(private readonly deps: RepositoryDeps) {}

  async list(ctx: RepositoryContext, opts?: PaginationOptions): Promise<PaginatedResult<Proposal>> {
    const orgId = resolveTenantOrganizationId(ctx);
    const clientId = resolveScopedClientId(ctx, opts?.clientId);
    const { page, pageSize, skip, take } = normalizePagination(opts);

    if (this.deps.prisma) {
      const where: Record<string, unknown> = { organizationId: orgId };
      if (!opts?.includeArchived) where.archivedAt = null;
      if (clientId) where.clientId = clientId;
      if (opts?.status) where.status = opts.status;
      const [rows, total] = await Promise.all([
        this.deps.prisma.proposal.findMany({ where, orderBy: { createdAt: 'desc' }, skip, take }),
        this.deps.prisma.proposal.count({ where }),
      ]);
      return {
        data: rows.map((p) => ({
          id: p.id,
          organizationId: p.organizationId,
          number: p.number,
          clientId: p.clientId,
          planCode: p.planCode || undefined,
          title: p.title,
          setupValue: p.setupValue,
          recurringValue: p.recurringValue,
          discountValue: p.discountValue,
          totalValue: p.totalValue,
          conditions: p.conditions || undefined,
          status: p.status as Proposal['status'],
          validUntil: p.validUntil,
          responsible: p.responsible,
          acceptedAt: p.acceptedAt ? p.acceptedAt.toISOString() : null,
          acceptedBy: p.acceptedBy || null,
          archivedAt: p.archivedAt ? p.archivedAt.toISOString() : null,
          createdAt: p.createdAt.toISOString(),
        })),
        pagination: { page, pageSize, total, totalPages: Math.max(1, Math.ceil(total / pageSize)) },
      };
    }

    let list = this.deps.store.getState().proposals.filter((p) => p.organizationId === orgId);
    if (!opts?.includeArchived) list = list.filter((p) => !p.archivedAt);
    if (clientId) list = list.filter((p) => p.clientId === clientId);
    if (opts?.status) list = list.filter((p) => p.status === opts.status);
    return paginateArray(list, opts);
  }
}

export class ContractRepository {
  constructor(private readonly deps: RepositoryDeps) {}

  async list(ctx: RepositoryContext, opts?: PaginationOptions): Promise<PaginatedResult<Contract>> {
    const orgId = resolveTenantOrganizationId(ctx);
    const clientId = resolveScopedClientId(ctx, opts?.clientId);
    const { page, pageSize, skip, take } = normalizePagination(opts);

    if (this.deps.prisma) {
      const where: Record<string, unknown> = { organizationId: orgId };
      if (!opts?.includeArchived) where.archivedAt = null;
      if (clientId) where.clientId = clientId;
      if (opts?.status) where.status = opts.status;
      const [rows, total] = await Promise.all([
        this.deps.prisma.contract.findMany({ where, orderBy: { createdAt: 'desc' }, skip, take }),
        this.deps.prisma.contract.count({ where }),
      ]);
      return {
        data: rows.map((c) => ({
          id: c.id,
          organizationId: c.organizationId,
          number: c.number,
          clientId: c.clientId,
          proposalId: c.proposalId || undefined,
          planCode: c.planCode || undefined,
          serviceType: c.serviceType as Contract['serviceType'],
          title: c.title,
          setupValue: c.setupValue,
          recurringValue: c.recurringValue,
          value: c.value,
          recurrence: c.recurrence,
          status: c.status as Contract['status'],
          startDate: c.startDate,
          endDate: c.endDate || '',
          archivedAt: c.archivedAt ? c.archivedAt.toISOString() : null,
        })),
        pagination: { page, pageSize, total, totalPages: Math.max(1, Math.ceil(total / pageSize)) },
      };
    }

    let list = this.deps.store.getState().contracts.filter((c) => c.organizationId === orgId);
    if (!opts?.includeArchived) list = list.filter((c) => !c.archivedAt);
    if (clientId) list = list.filter((c) => c.clientId === clientId);
    if (opts?.status) list = list.filter((c) => c.status === opts.status);
    return paginateArray(list, opts);
  }

  async create(
    ctx: RepositoryContext,
    input: Partial<Contract> & { clientId: string; title: string; organizationId?: string }
  ): Promise<Contract> {
    assertNoOrganizationTampering(ctx, input.organizationId);
    const orgId = resolveTenantOrganizationId(ctx, input.organizationId);

    // Prevent cross-tenant clientId reference
    if (this.deps.prisma) {
      const client = await this.deps.prisma.client.findFirst({
        where: { id: input.clientId, organizationId: orgId },
        select: { id: true },
      });
      if (!client) {
        throw new RepositoryError(
          'CROSS_TENANT_VIOLATION',
          'Cliente informado não pertence à organização autenticada.'
        );
      }
      const created = await this.deps.prisma.contract.create({
        data: {
          id: uid('cnt'),
          organizationId: orgId,
          number: input.number || `CNT-${Date.now().toString().slice(-6)}`,
          clientId: input.clientId,
          proposalId: input.proposalId || null,
          planCode: input.planCode || null,
          serviceType: input.serviceType || 'Performance',
          title: input.title.trim(),
          setupValue: Number(input.setupValue || 0),
          recurringValue: Number(input.recurringValue || 0),
          value: Number(input.value || 0),
          recurrence: input.recurrence || 'Mensal',
          status: input.status || 'Ativo',
          startDate: input.startDate || new Date().toISOString().slice(0, 10),
          endDate: input.endDate || null,
          createdBy: ctx.userId,
          updatedBy: ctx.userId,
        },
      });
      return {
        id: created.id,
        organizationId: created.organizationId,
        number: created.number,
        clientId: created.clientId,
        proposalId: created.proposalId || undefined,
        planCode: created.planCode || undefined,
        serviceType: created.serviceType as Contract['serviceType'],
        title: created.title,
        setupValue: created.setupValue,
        recurringValue: created.recurringValue,
        value: created.value,
        recurrence: created.recurrence,
        status: created.status as Contract['status'],
        startDate: created.startDate,
        endDate: created.endDate || '',
        archivedAt: null,
      };
    }

    const client = this.deps.store
      .getState()
      .clients.find((c) => c.id === input.clientId && c.organizationId === orgId);
    if (!client) {
      throw new RepositoryError(
        'CROSS_TENANT_VIOLATION',
        'Cliente informado não pertence à organização autenticada.'
      );
    }
    const record: Contract = {
      id: uid('cnt'),
      organizationId: orgId,
      number: input.number || `CNT-${Date.now().toString().slice(-6)}`,
      clientId: input.clientId,
      proposalId: input.proposalId,
      planCode: input.planCode,
      serviceType: input.serviceType || 'Performance',
      title: input.title.trim(),
      setupValue: Number(input.setupValue || 0),
      recurringValue: Number(input.recurringValue || 0),
      value: Number(input.value || 0),
      recurrence: input.recurrence || 'Mensal',
      status: input.status || 'Ativo',
      startDate: input.startDate || new Date().toISOString().slice(0, 10),
      endDate: input.endDate || '',
      archivedAt: null,
    };
    this.deps.store.getState().contracts.unshift(record);
    this.deps.store.save();
    return record;
  }
}
