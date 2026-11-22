import crypto from 'node:crypto';
import type {
  AdAccount,
  AutomationWorkflow,
  ClientTicket,
  CreativeAsset,
  Project,
  Task,
  TrackingEvent,
  WebPage,
} from '../types.ts';
import type { AiKnowledgeDoc, AiMemoryEntry, AiUsageLog } from '../ai/types.ts';
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

export const VALID_TASK_STATUSES: ReadonlySet<Task['status']> = new Set([
  'Backlog',
  'A fazer',
  'Em andamento',
  'Em revisão',
  'Concluída',
]);

export class ProjectRepository {
  constructor(private readonly deps: RepositoryDeps) {}

  /**
   * Lists projects with task counts in a single batched query (no N+1 per-project queries).
   */
  async list(
    ctx: RepositoryContext,
    opts?: PaginationOptions
  ): Promise<PaginatedResult<Project & { taskCount?: number }>> {
    const orgId = resolveTenantOrganizationId(ctx);
    const clientId = resolveScopedClientId(ctx, opts?.clientId);
    const { page, pageSize, skip, take } = normalizePagination(opts);

    if (this.deps.prisma) {
      const where: Record<string, unknown> = { organizationId: orgId, deletedAt: null };
      if (!opts?.includeArchived) where.archivedAt = null;
      if (clientId) where.clientId = clientId;
      if (opts?.status) where.status = opts.status;

      const [rows, total] = await Promise.all([
        this.deps.prisma.project.findMany({
          where,
          include: { _count: { select: { tasks: true } } },
          orderBy: { createdAt: 'desc' },
          skip,
          take,
        }),
        this.deps.prisma.project.count({ where }),
      ]);

      return {
        data: rows.map((p: any) => ({
          id: p.id,
          organizationId: p.organizationId,
          clientId: p.clientId,
          contractId: p.contractId,
          planCode: p.planCode,
          name: p.name,
          projectType: p.projectType as Project['projectType'],
          status: p.status,
          priority: p.priority as Project['priority'],
          startDate: p.startDate,
          dueDate: p.dueDate,
          managerId: p.managerId,
          progress: p.progress,
          archivedAt: p.archivedAt ? p.archivedAt.toISOString() : null,
          createdAt: p.createdAt.toISOString(),
          taskCount: p._count?.tasks ?? 0,
        })),
        pagination: { page, pageSize, total, totalPages: Math.max(1, Math.ceil(total / pageSize)) },
      };
    }

    const state = this.deps.store.getState();
    let list = state.projects.filter((p) => p.organizationId === orgId);
    if (!opts?.includeArchived) list = list.filter((p) => !p.archivedAt);
    if (clientId) list = list.filter((p) => p.clientId === clientId);
    if (opts?.status) list = list.filter((p) => p.status === opts.status);

    // Single pass count map (zero N+1)
    const countMap = new Map<string, number>();
    for (const t of state.tasks) {
      if (t.organizationId === orgId) {
        countMap.set(t.projectId, (countMap.get(t.projectId) || 0) + 1);
      }
    }
    return paginateArray(
      list.map((p) => ({ ...p, taskCount: countMap.get(p.id) || 0 })),
      opts
    );
  }

  async listTasks(ctx: RepositoryContext, opts?: PaginationOptions): Promise<PaginatedResult<Task>> {
    const orgId = resolveTenantOrganizationId(ctx);
    const { page, pageSize, skip, take } = normalizePagination(opts);
    if (opts?.status && !VALID_TASK_STATUSES.has(opts.status as Task['status'])) {
      throw new RepositoryError('VALIDATION_ERROR', `Status de tarefa inválido: ${opts.status}`);
    }

    if (this.deps.prisma) {
      const where: Record<string, unknown> = { organizationId: orgId };
      if (opts?.projectId) where.projectId = opts.projectId;
      if (opts?.status) where.status = opts.status;

      const [rows, total] = await Promise.all([
        this.deps.prisma.task.findMany({ where, orderBy: { createdAt: 'desc' }, skip, take }),
        this.deps.prisma.task.count({ where }),
      ]);
      return {
        data: rows.map((t) => ({
          id: t.id,
          organizationId: t.organizationId,
          projectId: t.projectId,
          title: t.title,
          status: t.status as Task['status'],
          priority: t.priority as Task['priority'],
          assigneeId: t.assigneeId || '',
          dueDate: t.dueDate || '',
          estimatedHours: t.estimatedHours,
          actualHours: t.actualHours,
          comments: (t.comments as unknown as Task['comments']) || undefined,
          history: (t.history as unknown as Task['history']) || undefined,
        })),
        pagination: { page, pageSize, total, totalPages: Math.max(1, Math.ceil(total / pageSize)) },
      };
    }

    let list = this.deps.store.getState().tasks.filter((t) => t.organizationId === orgId);
    if (opts?.projectId) list = list.filter((t) => t.projectId === opts.projectId);
    if (opts?.status) list = list.filter((t) => t.status === opts.status);
    return paginateArray(list, opts);
  }

  async updateTaskStatus(
    ctx: RepositoryContext,
    taskId: string,
    status: Task['status']
  ): Promise<{ task: Task; projectProgress: number }> {
    if (!VALID_TASK_STATUSES.has(status)) {
      throw new RepositoryError('VALIDATION_ERROR', `Status inválido: ${status}`);
    }
    const orgId = resolveTenantOrganizationId(ctx);

    if (this.deps.prisma) {
      return this.deps.prisma.$transaction(async (tx) => {
        const existing = await tx.task.findFirst({ where: { id: taskId, organizationId: orgId } });
        if (!existing) throw new RepositoryError('NOT_FOUND', 'Tarefa não encontrada no escopo.');

        const updated = await tx.task.update({
          where: { id: existing.id },
          data: { status, updatedBy: ctx.userId },
        });
        const siblings = await tx.task.findMany({
          where: { organizationId: orgId, projectId: existing.projectId },
          select: { status: true },
        });
        const done = siblings.filter((s) => s.status === 'Concluída').length;
        const progress = siblings.length ? Math.round((done / siblings.length) * 100) : 0;
        await tx.project.update({ where: { id: existing.projectId }, data: { progress } });

        return {
          task: {
            id: updated.id,
            organizationId: updated.organizationId,
            projectId: updated.projectId,
            title: updated.title,
            status: updated.status as Task['status'],
            priority: updated.priority as Task['priority'],
            assigneeId: updated.assigneeId || '',
            dueDate: updated.dueDate || '',
            estimatedHours: updated.estimatedHours,
            actualHours: updated.actualHours,
          },
          projectProgress: progress,
        };
      });
    }

    return this.deps.store.runTransaction((state) => {
      const task = state.tasks.find((t) => t.id === taskId && t.organizationId === orgId);
      if (!task) throw new RepositoryError('NOT_FOUND', 'Tarefa não encontrada no escopo.');
      task.status = status;
      const siblings = state.tasks.filter((t) => t.projectId === task.projectId && t.organizationId === orgId);
      const done = siblings.filter((s) => s.status === 'Concluída').length;
      const progress = siblings.length ? Math.round((done / siblings.length) * 100) : 0;
      const proj = state.projects.find((p) => p.id === task.projectId && p.organizationId === orgId);
      if (proj) proj.progress = progress;
      return { task, projectProgress: progress };
    });
  }
}

export class TicketRepository {
  constructor(private readonly deps: RepositoryDeps) {}

  async list(ctx: RepositoryContext, opts?: PaginationOptions): Promise<PaginatedResult<ClientTicket>> {
    const orgId = resolveTenantOrganizationId(ctx);
    const clientId = resolveScopedClientId(ctx, opts?.clientId);
    const { page, pageSize, skip, take } = normalizePagination(opts);

    if (this.deps.prisma) {
      const where: Record<string, unknown> = { organizationId: orgId };
      if (clientId) where.clientId = clientId;
      if (opts?.status) where.status = opts.status;
      const [rows, total] = await Promise.all([
        this.deps.prisma.ticket.findMany({ where, orderBy: { createdAt: 'desc' }, skip, take }),
        this.deps.prisma.ticket.count({ where }),
      ]);
      return {
        data: rows.map((t) => ({
          id: t.id,
          organizationId: t.organizationId,
          clientId: t.clientId,
          category: t.category,
          priority: t.priority as ClientTicket['priority'],
          subject: t.subject,
          description: t.description,
          status: t.status as ClientTicket['status'],
          assigneeId: t.assigneeId,
          assigneeName: t.assigneeName,
          replies: (t.replies as unknown as ClientTicket['replies']) || [],
          createdAt: t.createdAt.toISOString(),
          updatedAt: t.updatedAt.toISOString(),
        })),
        pagination: { page, pageSize, total, totalPages: Math.max(1, Math.ceil(total / pageSize)) },
      };
    }

    let list = this.deps.store.getState().tickets.filter((t) => t.organizationId === orgId);
    if (clientId) list = list.filter((t) => t.clientId === clientId);
    if (opts?.status) list = list.filter((t) => t.status === opts.status);
    return paginateArray(list, opts);
  }
}

export class CreativeRepository {
  constructor(private readonly deps: RepositoryDeps) {}

  async list(ctx: RepositoryContext, opts?: PaginationOptions): Promise<PaginatedResult<CreativeAsset>> {
    const orgId = resolveTenantOrganizationId(ctx);
    const clientId = resolveScopedClientId(ctx, opts?.clientId);
    const { page, pageSize, skip, take } = normalizePagination(opts);

    if (this.deps.prisma) {
      const where: Record<string, unknown> = { organizationId: orgId };
      if (!opts?.includeArchived) where.archivedAt = null;
      if (clientId) where.clientId = clientId;
      if (opts?.status) where.status = opts.status;
      const [rows, total] = await Promise.all([
        this.deps.prisma.creativeAsset.findMany({ where, orderBy: { createdAt: 'desc' }, skip, take }),
        this.deps.prisma.creativeAsset.count({ where }),
      ]);
      return {
        data: rows.map((c) => ({
          id: c.id,
          organizationId: c.organizationId,
          clientId: c.clientId,
          projectId: c.projectId || undefined,
          name: c.name,
          client: c.clientName,
          format: c.format as CreativeAsset['format'],
          platform: c.platform,
          type: c.type,
          version: c.version,
          status: c.status as CreativeAsset['status'],
          usageRights: c.usageRights as CreativeAsset['usageRights'],
          scriptSummary: c.scriptSummary || undefined,
          fileAssetId: c.fileAssetId || undefined,
          archivedAt: c.archivedAt ? c.archivedAt.toISOString() : null,
        })),
        pagination: { page, pageSize, total, totalPages: Math.max(1, Math.ceil(total / pageSize)) },
      };
    }

    let list = this.deps.store.getState().creatives.filter((c) => c.organizationId === orgId);
    if (!opts?.includeArchived) list = list.filter((c) => !c.archivedAt);
    if (clientId) list = list.filter((c) => c.clientId === clientId);
    if (opts?.status) list = list.filter((c) => c.status === opts.status);
    return paginateArray(list, opts);
  }
}

export class LandingPageRepository {
  constructor(private readonly deps: RepositoryDeps) {}

  async list(ctx: RepositoryContext, opts?: PaginationOptions): Promise<PaginatedResult<WebPage>> {
    const orgId = resolveTenantOrganizationId(ctx);
    const clientId = resolveScopedClientId(ctx, opts?.clientId);
    const { page, pageSize, skip, take } = normalizePagination(opts);

    if (this.deps.prisma) {
      const where: Record<string, unknown> = { organizationId: orgId };
      if (!opts?.includeArchived) where.archivedAt = null;
      if (clientId) where.clientId = clientId;
      if (opts?.status) where.status = opts.status;
      const [rows, total] = await Promise.all([
        this.deps.prisma.webPage.findMany({ where, orderBy: { createdAt: 'desc' }, skip, take }),
        this.deps.prisma.webPage.count({ where }),
      ]);
      return {
        data: rows.map((w) => this.mapPrismaWebPage(w)),
        pagination: { page, pageSize, total, totalPages: Math.max(1, Math.ceil(total / pageSize)) },
      };
    }

    let list = this.deps.store.getState().webPages.filter((w) => w.organizationId === orgId);
    if (!opts?.includeArchived) list = list.filter((w) => !w.archivedAt);
    if (clientId) list = list.filter((w) => w.clientId === clientId);
    if (opts?.status) list = list.filter((w) => w.status === opts.status);
    return paginateArray(list, opts);
  }

  async findPublishedBySlug(slug: string): Promise<WebPage | null> {
    if (this.deps.prisma) {
      const w = await this.deps.prisma.webPage.findUnique({ where: { slug } });
      if (!w || w.archivedAt || w.status !== 'Publicado') return null;
      return this.mapPrismaWebPage(w);
    }
    return (
      this.deps.store
        .getState()
        .webPages.find((w) => w.slug === slug && !w.archivedAt && w.status === 'Publicado') || null
    );
  }

  private mapPrismaWebPage(w: any): WebPage {
    return {
      id: w.id,
      organizationId: w.organizationId,
      clientId: w.clientId,
      projectId: w.projectId || undefined,
      title: w.title,
      slug: w.slug,
      segment: w.segment,
      pageType: w.pageType as WebPage['pageType'],
      domain: w.domain,
      sslStatus: w.sslStatus as WebPage['sslStatus'],
      status: w.status as WebPage['status'],
      version: w.version,
      seoTitle: w.seoTitle,
      seoDescription: w.seoDescription,
      whatsappNumber: w.whatsappNumber || undefined,
      checkoutUrl: w.checkoutUrl || undefined,
      pixelConfigured: w.pixelConfigured,
      sections: (w.sections as WebPage['sections']) || [],
      visits: w.visits,
      leadsCaptured: w.leadsCaptured,
      archivedAt: w.archivedAt ? w.archivedAt.toISOString() : null,
    };
  }
}

export class WorkflowRepository {
  constructor(private readonly deps: RepositoryDeps) {}

  async list(ctx: RepositoryContext, opts?: PaginationOptions): Promise<PaginatedResult<AutomationWorkflow>> {
    const orgId = resolveTenantOrganizationId(ctx);
    const { page, pageSize, skip, take } = normalizePagination(opts);

    if (this.deps.prisma) {
      const where: Record<string, unknown> = { organizationId: orgId };
      if (opts?.status) where.status = opts.status;
      const [rows, total] = await Promise.all([
        this.deps.prisma.workflow.findMany({ where, orderBy: { createdAt: 'desc' }, skip, take }),
        this.deps.prisma.workflow.count({ where }),
      ]);
      return {
        data: rows.map((w) => ({
          id: w.id,
          organizationId: w.organizationId,
          name: w.name,
          category: w.category,
          trigger: w.trigger,
          status: w.status as AutomationWorkflow['status'],
          executions: w.executions,
          lastRunAt: w.lastRunAt.toISOString(),
        })),
        pagination: { page, pageSize, total, totalPages: Math.max(1, Math.ceil(total / pageSize)) },
      };
    }

    let list = this.deps.store.getState().workflows.filter((w) => w.organizationId === orgId);
    if (opts?.status) list = list.filter((w) => w.status === opts.status);
    return paginateArray(list, opts);
  }
}

export class IntegrationRepository {
  constructor(private readonly deps: RepositoryDeps) {}

  async listAdAccounts(ctx: RepositoryContext, opts?: PaginationOptions): Promise<PaginatedResult<AdAccount>> {
    const orgId = resolveTenantOrganizationId(ctx);
    const clientId = resolveScopedClientId(ctx, opts?.clientId);
    const { page, pageSize, skip, take } = normalizePagination(opts);

    if (this.deps.prisma) {
      const where: Record<string, unknown> = { organizationId: orgId };
      if (clientId) where.clientId = clientId;
      const [rows, total] = await Promise.all([
        this.deps.prisma.adAccount.findMany({ where, orderBy: { updatedAt: 'desc' }, skip, take }),
        this.deps.prisma.adAccount.count({ where }),
      ]);
      return {
        data: rows.map((a) => ({
          id: a.id,
          organizationId: a.organizationId,
          clientId: a.clientId,
          platform: a.platform as AdAccount['platform'],
          name: a.name,
          externalAccountId: a.externalAccountId,
          connectionStatus: a.connectionStatus as AdAccount['connectionStatus'],
          spend: a.spend,
          impressions: a.impressions,
          clicks: a.clicks,
          conversions: a.conversions,
          roas: a.roas,
          cpa: a.cpa,
          dailyLimit: a.dailyLimit,
          lastSyncAt: a.lastSyncAt.toISOString(),
        })),
        pagination: { page, pageSize, total, totalPages: Math.max(1, Math.ceil(total / pageSize)) },
      };
    }

    let list = this.deps.store.getState().adAccounts.filter((a) => a.organizationId === orgId);
    if (clientId) list = list.filter((a) => a.clientId === clientId);
    return paginateArray(list, opts);
  }

  async listTrackingEvents(
    ctx: RepositoryContext,
    opts?: PaginationOptions
  ): Promise<PaginatedResult<TrackingEvent>> {
    const orgId = resolveTenantOrganizationId(ctx);
    const clientId = resolveScopedClientId(ctx, opts?.clientId);
    const { page, pageSize, skip, take } = normalizePagination(opts);

    if (this.deps.prisma) {
      const where: Record<string, unknown> = { organizationId: orgId };
      if (clientId) where.clientId = clientId;
      const [rows, total] = await Promise.all([
        this.deps.prisma.trackingEvent.findMany({ where, orderBy: { timestamp: 'desc' }, skip, take }),
        this.deps.prisma.trackingEvent.count({ where }),
      ]);
      return {
        data: rows.map((e) => ({
          id: e.id,
          organizationId: e.organizationId,
          clientId: e.clientId,
          eventId: e.eventId,
          eventName: e.eventName as TrackingEvent['eventName'],
          source: e.source,
          utmCampaign: e.utmCampaign || undefined,
          value: e.value,
          currency: e.currency,
          confirmedByPayment: e.confirmedByPayment,
          deduplicatedCount: e.deduplicatedCount,
          dispatchStatus: e.dispatchStatus as TrackingEvent['dispatchStatus'],
          timestamp: e.timestamp.toISOString(),
        })),
        pagination: { page, pageSize, total, totalPages: Math.max(1, Math.ceil(total / pageSize)) },
      };
    }

    let list = this.deps.store.getState().trackingEvents.filter((e) => e.organizationId === orgId);
    if (clientId) list = list.filter((e) => e.clientId === clientId);
    return paginateArray(list, opts);
  }
}

export class AIRepository {
  constructor(private readonly deps: RepositoryDeps) {}

  async listUsageLogs(
    ctx: RepositoryContext,
    opts?: PaginationOptions & { department?: string; providerId?: string }
  ): Promise<PaginatedResult<AiUsageLog>> {
    const orgId = resolveTenantOrganizationId(ctx);
    const clientId = resolveScopedClientId(ctx, opts?.clientId);
    const { page, pageSize, skip, take } = normalizePagination(opts);

    if (this.deps.prisma) {
      const where: Record<string, unknown> = { organizationId: orgId };
      if (clientId) where.clientId = clientId;
      if (opts?.department) where.department = opts.department;
      if (opts?.providerId) where.providerId = opts.providerId;
      if (opts?.status) where.status = opts.status;

      const [rows, total] = await Promise.all([
        this.deps.prisma.aiUsageLog.findMany({ where, orderBy: { createdAt: 'desc' }, skip, take }),
        this.deps.prisma.aiUsageLog.count({ where }),
      ]);
      return {
        data: rows.map((l) => ({
          id: l.id,
          requestId: l.requestId,
          idempotencyKey: l.idempotencyKey || undefined,
          traceId: l.traceId,
          organizationId: l.organizationId,
          userId: l.userId,
          clientId: l.clientId,
          billingCategory: l.billingCategory as AiUsageLog['billingCategory'],
          department: l.department as AiUsageLog['department'],
          action: l.action,
          purpose: l.purpose as AiUsageLog['purpose'],
          providerId: l.providerId as AiUsageLog['providerId'],
          modelId: l.modelId,
          effectiveProvider: l.effectiveProvider || undefined,
          fallbackUsed: l.fallbackUsed,
          fallbackFrom: l.fallbackFrom,
          operation: l.operation as AiUsageLog['operation'],
          inputTokens: l.inputTokens,
          outputTokens: l.outputTokens,
          cachedTokens: l.cachedTokens,
          estimatedCostUsd: l.estimatedCostUsd,
          providerReportedCostUsd: l.providerReportedCostUsd,
          costReliable: l.costReliable,
          totalCostBRL: l.totalCostBRL,
          latencyMs: l.latencyMs,
          status: l.status as AiUsageLog['status'],
          errorMessage: l.errorMessage,
          createdAt: l.createdAt.toISOString(),
        })),
        pagination: { page, pageSize, total, totalPages: Math.max(1, Math.ceil(total / pageSize)) },
      };
    }

    let list = this.deps.store.getState().aiGateway.usageLogs.filter((l) => l.organizationId === orgId);
    if (clientId) list = list.filter((l) => l.clientId === clientId);
    if (opts?.department) list = list.filter((l) => l.department === opts.department);
    if (opts?.providerId) list = list.filter((l) => l.providerId === opts.providerId);
    if (opts?.status) list = list.filter((l) => l.status === opts.status);
    return paginateArray(list, opts);
  }

  async listMemories(
    ctx: RepositoryContext,
    opts?: PaginationOptions & { conversationId?: string }
  ): Promise<PaginatedResult<AiMemoryEntry>> {
    const orgId = resolveTenantOrganizationId(ctx);
    const clientId = resolveScopedClientId(ctx, opts?.clientId);
    const { page, pageSize, skip, take } = normalizePagination(opts);

    if (this.deps.prisma) {
      const where: Record<string, unknown> = { organizationId: orgId };
      if (clientId) where.clientId = clientId;
      if (opts?.conversationId) where.conversationId = opts.conversationId;
      const [rows, total] = await Promise.all([
        this.deps.prisma.aiMemory.findMany({ where, orderBy: { createdAt: 'desc' }, skip, take }),
        this.deps.prisma.aiMemory.count({ where }),
      ]);
      return {
        data: rows.map((m) => ({
          id: m.id,
          organizationId: m.organizationId,
          projectId: m.projectId,
          clientId: m.clientId,
          conversationId: m.conversationId,
          role: m.role as AiMemoryEntry['role'],
          content: m.content,
          citations: (m.citations as AiMemoryEntry['citations']) || [],
          retentionDays: m.retentionDays,
          createdAt: m.createdAt.toISOString(),
        })),
        pagination: { page, pageSize, total, totalPages: Math.max(1, Math.ceil(total / pageSize)) },
      };
    }

    let list = this.deps.store.getState().aiGateway.memories.filter((m) => m.organizationId === orgId);
    if (clientId) list = list.filter((m) => m.clientId === clientId);
    if (opts?.conversationId) list = list.filter((m) => m.conversationId === opts.conversationId);
    return paginateArray(list, opts);
  }

  async addKnowledgeDoc(
    ctx: RepositoryContext,
    input: { title: string; content: string; tags?: string[]; clientId?: string | null; projectId?: string | null; organizationId?: string }
  ): Promise<AiKnowledgeDoc> {
    assertNoOrganizationTampering(ctx, input.organizationId);
    const orgId = resolveTenantOrganizationId(ctx, input.organizationId);
    const id = uid('kdoc');

    if (this.deps.prisma) {
      const created = await this.deps.prisma.aiKnowledgeDoc.create({
        data: {
          id,
          organizationId: orgId,
          clientId: input.clientId || null,
          projectId: input.projectId || null,
          title: input.title.trim(),
          content: input.content.trim(),
          tags: input.tags || [],
        },
      });
      return {
        id: created.id,
        organizationId: created.organizationId,
        clientId: created.clientId,
        projectId: created.projectId,
        title: created.title,
        content: created.content,
        tags: (created.tags as string[]) || [],
        createdAt: created.createdAt.toISOString(),
      };
    }

    const doc: AiKnowledgeDoc = {
      id,
      organizationId: orgId,
      clientId: input.clientId || null,
      projectId: input.projectId || null,
      title: input.title.trim(),
      content: input.content.trim(),
      tags: input.tags || [],
      createdAt: new Date().toISOString(),
    };
    this.deps.store.getState().aiGateway.knowledgeDocs.unshift(doc);
    this.deps.store.save();
    return doc;
  }
}
