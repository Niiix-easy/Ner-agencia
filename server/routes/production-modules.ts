import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import express, { Request, Response, Router } from 'express';
import { PersistentStore } from '../store.ts';
import {
  canAccessClientResource,
  canAccessResourceOrg,
  requireAuth,
  requirePermission,
  resolveScopedOrg,
} from '../middleware/auth.ts';
import {
  assertEntitlement,
  classifyWebPageQuotaResource,
  evaluateOrganizationEntitlements,
  withOrgQuotaLock,
} from '../services/entitlements.ts';
import { applyListQuery, parseListQuery } from '../services/query-utils.ts';
import { confirmPasswordReset, requestPasswordReset } from '../services/password-reset.ts';
import {
  cancelOrganizationSubscription,
  createLiveStripeCheckoutSession,
  createStripePortalSession,
} from '../services/billing-stripe.ts';
import {
  deleteAdIntegrationCredential,
  getAdPlatformReadiness,
  isValidAdProvider,
  listSanitizedAdCredentials,
  resolveDecryptedAdCredentials,
  testAdIntegrationCredential,
  upsertAdIntegrationCredential,
} from '../services/ad-credentials.ts';

function uid(prefix: string): string {
  return `${prefix}-${Date.now()}-${crypto.randomBytes(3).toString('hex')}`;
}

const ALLOWED_MIME_TYPES = new Set([
  'image/png',
  'image/jpeg',
  'image/webp',
  'image/gif',
  'image/svg+xml',
  'application/pdf',
  'video/mp4',
  'text/plain',
  'text/csv',
  'application/json',
]);

const MAX_UPLOAD_BYTES = 10 * 1024 * 1024; // 10 MB per asset
const EPHEMERAL_STORAGE_SIGN_SECRET = crypto.randomBytes(32).toString('hex');
function getStorageSignSecret(): string {
  return process.env.STORAGE_SIGNING_SECRET?.trim() || EPHEMERAL_STORAGE_SIGN_SECRET;
}

function signStorageUrl(assetId: string, orgId: string, expMs: number): string {
  return crypto
    .createHmac('sha256', getStorageSignSecret())
    .update(`${assetId}:${orgId}:${expMs}`)
    .digest('hex');
}

function resolveConfinedUploadPath(storageKey: string): string | null {
  const uploadsRoot = path.resolve(process.cwd(), 'database/uploads');
  const fullPath = path.resolve(uploadsRoot, storageKey);
  if (!fullPath.startsWith(uploadsRoot + path.sep)) {
    return null;
  }
  return fullPath;
}

function escapeHtml(value: string): string {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function createProductionModulesRouter(store: PersistentStore): Router {
  const router = express.Router();

  // ============================================================================
  // 1. PASSWORD RESET (REAL TOKEN + EXPIRY + SINGLE-USE + SESSION REVOCATION)
  // ============================================================================
  router.post('/api/auth/forgot-password', async (req: Request, res: Response) => {
    const email = String(req.body?.email || '').trim();
    if (!email || !email.includes('@')) {
      res.status(400).json({ error: 'Informe um e-mail válido.' });
      return;
    }
    const result = await requestPasswordReset(store, {
      email,
      ip: req.ip,
      appBaseUrl: `${req.protocol}://${req.get('host')}`,
    });
    if (result.rateLimited) {
      res.status(429).json({ error: result.message });
      return;
    }
    res.json({
      success: true,
      message: result.message,
      deliveryMode: result.deliveryMode,
      ...(result.testOnlyToken ? { testOnlyToken: result.testOnlyToken } : {}),
    });
  });

  router.post('/api/auth/reset-password', (req: Request, res: Response) => {
    const { token, newPassword } = req.body || {};
    const outcome = confirmPasswordReset(store, {
      token: String(token || ''),
      newPassword: String(newPassword || ''),
    });
    if (!outcome.ok) {
      res.status(outcome.status).json({ error: outcome.error });
      return;
    }
    res.json({
      success: true,
      message: 'Senha redefinida com sucesso. Todas as sessões anteriores foram encerradas.',
      revokedSessions: outcome.revokedSessions,
    });
  });

  // ============================================================================
  // 2. STRIPE LIVE CHECKOUT, CUSTOMER PORTAL & CANCELATION (FASE 4)
  // ============================================================================
  router.post('/api/billing/checkout-live', requirePermission('billing.manage'), async (req: Request, res: Response) => {
    const scope = resolveScopedOrg(req, req.body?.organizationId);
    if (!scope.allowed) {
      res.status(403).json({ error: 'Acesso negado.' });
      return;
    }
    const { planCode, successUrl, cancelUrl } = req.body || {};
    if (!planCode) {
      res.status(400).json({ error: 'planCode é obrigatório.' });
      return;
    }
    try {
      const result = await createLiveStripeCheckoutSession(store, {
        organizationId: scope.organizationId,
        planCode: String(planCode),
        actorUserId: req.auth!.user.id,
        successUrl: typeof successUrl === 'string' ? successUrl : undefined,
        cancelUrl: typeof cancelUrl === 'string' ? cancelUrl : undefined,
      });
      res.json(result);
    } catch (err: any) {
      if (String(err?.message).includes('SAAS_PLAN_NOT_FOUND')) {
        res.status(404).json({ error: 'Plano SaaS não encontrado.' });
        return;
      }
      res.status(502).json({ error: 'Falha ao iniciar Checkout Stripe.' });
    }
  });

  router.post('/api/billing/portal', requirePermission('billing.manage'), async (req: Request, res: Response) => {
    const scope = resolveScopedOrg(req, req.body?.organizationId);
    if (!scope.allowed) {
      res.status(403).json({ error: 'Acesso negado.' });
      return;
    }
    const result = await createStripePortalSession(store, {
      organizationId: scope.organizationId,
      actorUserId: req.auth!.user.id,
      returnUrl: typeof req.body?.returnUrl === 'string' ? req.body.returnUrl : undefined,
    });
    if (!result.ok) {
      res.status(result.status).json({ error: result.error });
      return;
    }
    res.json({ url: result.url });
  });

  router.post('/api/billing/cancel', requirePermission('billing.manage'), async (req: Request, res: Response) => {
    const scope = resolveScopedOrg(req, req.body?.organizationId);
    if (!scope.allowed) {
      res.status(403).json({ error: 'Acesso negado.' });
      return;
    }
    const result = await cancelOrganizationSubscription(store, {
      organizationId: scope.organizationId,
      actorUserId: req.auth!.user.id,
      reason: typeof req.body?.reason === 'string' ? req.body.reason : undefined,
    });
    if (!result.ok) {
      res.status(result.status).json({ error: result.error });
      return;
    }
    res.json({
      success: true,
      subscription: result.subscription,
      stripeRemoteCanceled: result.stripeRemoteCanceled,
    });
  });

  // ============================================================================
  // 3. FASE 3 & 7 ENHANCEMENTS: CLIENTS DETAIL/ARCHIVE, TASK COMMENTS, TICKETS REPLIES, INCIDENTS CRUD, PROPOSALS EDIT, SOFT-DELETE
  // ============================================================================
  router.get('/api/clients/:id/details', requirePermission('clients.read'), (req: Request, res: Response) => {
    const state = store.getState();
    const client = state.clients.find((c) => c.id === req.params.id);
    if (!client || !canAccessClientResource(req, client.organizationId, client.id)) {
      res.status(404).json({ error: 'Cliente não encontrado no escopo.' });
      return;
    }
    const projects = state.projects.filter((p) => p.clientId === client.id && !p.archivedAt);
    const contracts = state.contracts.filter((c) => c.clientId === client.id && !c.archivedAt);
    const receivables = state.receivables.filter((r) => r.clientId === client.id);
    const tickets = state.tickets.filter((t) => t.clientId === client.id);
    const auditHistory = state.auditLogs
      .filter((a) => a.organizationId === client.organizationId && (a.resourceId === client.id || a.metadata?.clientId === client.id))
      .slice(0, 20);
    res.json({ client, projects, contracts, receivables, tickets, auditHistory });
  });

  router.patch('/api/clients/:id/archive', requirePermission('clients.update'), (req: Request, res: Response) => {
    const client = store.getState().clients.find((c) => c.id === req.params.id);
    if (!client || !canAccessResourceOrg(req, client.organizationId)) {
      res.status(404).json({ error: 'Cliente não encontrado.' });
      return;
    }
    const restore = Boolean(req.body?.restore);
    client.archivedAt = restore ? null : new Date().toISOString();
    client.status = restore ? 'Ativo' : 'Inativo';
    store.audit(client.organizationId, req.auth!.user.id, restore ? 'CLIENT_RESTORED' : 'CLIENT_ARCHIVED', 'Client', client.id, {
      reason: req.body?.reason || null,
    });
    res.json(client);
  });

  router.post('/api/tasks/:id/comments', requirePermission('tasks.update'), (req: Request, res: Response) => {
    const task = store.getState().tasks.find((t) => t.id === req.params.id);
    if (!task || !canAccessResourceOrg(req, task.organizationId)) {
      res.status(404).json({ error: 'Tarefa não encontrada no escopo.' });
      return;
    }
    const body = String(req.body?.body || '').trim();
    if (!body) {
      res.status(400).json({ error: 'Comentário não pode estar vazio.' });
      return;
    }
    if (!Array.isArray(task.comments)) task.comments = [];
    if (!Array.isArray(task.history)) task.history = [];
    const comment = {
      id: uid('cmt'),
      userId: req.auth!.user.id,
      authorName: req.auth!.user.name,
      body,
      createdAt: new Date().toISOString(),
    };
    task.comments.push(comment);
    task.history.unshift({ action: 'COMMENT_ADDED', by: req.auth!.user.name, at: comment.createdAt });
    store.audit(task.organizationId, req.auth!.user.id, 'TASK_COMMENT_ADDED', 'Task', task.id, {});
    res.status(201).json({ comment, task });
  });

  router.post('/api/tickets/:id/replies', requireAuth, (req: Request, res: Response) => {
    const ticket = store.getState().tickets.find((t) => t.id === req.params.id);
    if (!ticket || !canAccessClientResource(req, ticket.organizationId, ticket.clientId)) {
      res.status(404).json({ error: 'Chamado não encontrado no escopo.' });
      return;
    }
    const message = String(req.body?.message || '').trim();
    if (!message) {
      res.status(400).json({ error: 'Mensagem de resposta obrigatória.' });
      return;
    }
    if (!Array.isArray(ticket.replies)) ticket.replies = [];
    const now = new Date().toISOString();
    const reply = {
      id: uid('rep'),
      userId: req.auth!.user.id,
      authorName: req.auth!.user.name,
      authorRole: req.auth!.user.role,
      message,
      createdAt: now,
    };
    ticket.replies.push(reply);
    ticket.updatedAt = now;
    if (req.auth!.user.role !== 'Cliente' && ticket.status === 'Aberto') {
      ticket.status = 'Em atendimento';
    }
    store.audit(ticket.organizationId, req.auth!.user.id, 'TICKET_REPLIED', 'ClientTicket', ticket.id, {
      status: ticket.status,
    });
    res.status(201).json({ reply, ticket });
  });

  router.patch('/api/tickets/:id/manage', requireAuth, (req: Request, res: Response) => {
    if (req.auth!.user.role === 'Cliente') {
      res.status(403).json({ error: 'Apenas equipe interna pode gerenciar chamados.' });
      return;
    }
    const state = store.getState();
    const ticket = state.tickets.find((t) => t.id === req.params.id);
    if (!ticket || !canAccessResourceOrg(req, ticket.organizationId)) {
      res.status(404).json({ error: 'Chamado não encontrado.' });
      return;
    }
    const { status, priority, assigneeId } = req.body || {};
    if (status && ['Aberto', 'Em atendimento', 'Resolvido'].includes(status)) {
      ticket.status = status;
    }
    if (priority && ['Baixa', 'Normal', 'Alta'].includes(priority)) {
      ticket.priority = priority;
    }
    if (assigneeId !== undefined) {
      if (assigneeId === null || assigneeId === '') {
        ticket.assigneeId = null;
        ticket.assigneeName = null;
      } else {
        const assignee = state.users.find((u) => u.id === assigneeId && u.organizationId === ticket.organizationId);
        if (!assignee) {
          res.status(404).json({ error: 'Responsável não encontrado na organização.' });
          return;
        }
        ticket.assigneeId = assignee.id;
        ticket.assigneeName = assignee.name;
      }
    }
    ticket.updatedAt = new Date().toISOString();
    store.audit(ticket.organizationId, req.auth!.user.id, 'TICKET_MANAGED', 'ClientTicket', ticket.id, {
      status: ticket.status,
      priority: ticket.priority,
      assigneeId: ticket.assigneeId,
    });
    res.json(ticket);
  });

  // --- OPERATIONS: FULL INCIDENTS MANAGEMENT ---
  router.get('/api/incidents', requirePermission('operations.read'), (req: Request, res: Response) => {
    const scope = resolveScopedOrg(req, req.query.organizationId as string | undefined);
    if (!scope.allowed) {
      res.status(403).json({ error: 'Acesso negado.' });
      return;
    }
    const list = store.getState().incidents.filter((i) => i.organizationId === scope.organizationId);
    res.json(applyListQuery(list, parseListQuery(req.query as Record<string, unknown>, ['service', 'category', 'description', 'assigneeName'])));
  });

  router.post('/api/incidents', requirePermission('operations.manage'), (req: Request, res: Response) => {
    const scope = resolveScopedOrg(req, req.body?.organizationId);
    if (!scope.allowed) {
      res.status(403).json({ error: 'Acesso negado.' });
      return;
    }
    const { category, severity, service, description, resolutionPlan, assigneeName } = req.body || {};
    if (!service || !description) {
      res.status(400).json({ error: 'Serviço afetado e descrição são obrigatórios.' });
      return;
    }
    const validSev = ['Baixa', 'Média', 'Alta', 'Crítica'].includes(severity) ? severity : 'Média';
    const now = new Date().toISOString();
    const incident = {
      id: uid('inc'),
      organizationId: scope.organizationId,
      category: String(category || 'Operacional').trim(),
      severity: validSev as 'Baixa' | 'Média' | 'Alta' | 'Crítica',
      service: String(service).trim(),
      description: String(description).trim(),
      status: 'Aberto' as const,
      assigneeId: req.auth!.user.id,
      assigneeName: String(assigneeName || req.auth!.user.name).trim(),
      resolutionPlan: resolutionPlan ? String(resolutionPlan).trim() : '',
      history: [{ action: 'INCIDENT_OPENED', by: req.auth!.user.name, note: `Severidade ${validSev}`, at: now }],
      resolvedAt: null,
      createdAt: now,
    };
    store.getState().incidents.unshift(incident);
    store.audit(scope.organizationId, req.auth!.user.id, 'INCIDENT_CREATED', 'Incident', incident.id, {
      severity: incident.severity,
      service: incident.service,
    });
    res.status(201).json(incident);
  });

  router.patch('/api/incidents/:id', requirePermission('operations.manage'), (req: Request, res: Response) => {
    const incident = store.getState().incidents.find((i) => i.id === req.params.id);
    if (!incident || !canAccessResourceOrg(req, incident.organizationId)) {
      res.status(404).json({ error: 'Incidente não encontrado.' });
      return;
    }
    const { status, severity, resolutionPlan, assigneeName, note } = req.body || {};
    const now = new Date().toISOString();
    if (!Array.isArray(incident.history)) incident.history = [];
    if (status && ['Aberto', 'Em investigação', 'Resolvido'].includes(status)) {
      incident.status = status;
      if (status === 'Resolvido') incident.resolvedAt = now;
    }
    if (severity && ['Baixa', 'Média', 'Alta', 'Crítica'].includes(severity)) {
      incident.severity = severity;
    }
    if (resolutionPlan !== undefined) incident.resolutionPlan = String(resolutionPlan).trim();
    if (assigneeName !== undefined) incident.assigneeName = String(assigneeName).trim();
    incident.history.unshift({
      action: `UPDATED_${incident.status.toUpperCase().replace(/\s+/g, '_')}`,
      by: req.auth!.user.name,
      note: note ? String(note).trim() : undefined,
      at: now,
    });
    store.audit(incident.organizationId, req.auth!.user.id, 'INCIDENT_UPDATED', 'Incident', incident.id, {
      status: incident.status,
      severity: incident.severity,
    });
    res.json(incident);
  });

  // --- PROPOSALS UPDATE (DISCOUNT, CONDITIONS, PLAN ASSOCIATION) ---
  router.patch('/api/proposals/:id', requirePermission('proposals.manage'), (req: Request, res: Response) => {
    const state = store.getState();
    const prop = state.proposals.find((p) => p.id === req.params.id);
    if (!prop || !canAccessResourceOrg(req, prop.organizationId)) {
      res.status(404).json({ error: 'Proposta não encontrada.' });
      return;
    }
    const { title, planCode, setupValue, recurringValue, discountValue, conditions, validUntil, status } = req.body || {};
    if (title !== undefined) prop.title = String(title).trim();
    if (planCode !== undefined) {
      if (planCode) {
        const plan = state.commercialPlans.find((pl) => pl.code === planCode);
        if (!plan) {
          res.status(404).json({ error: 'Plano comercial não encontrado.' });
          return;
        }
        prop.planCode = plan.code;
      } else {
        prop.planCode = undefined;
      }
    }
    if (setupValue !== undefined) prop.setupValue = Math.max(0, Number(setupValue) || 0);
    if (recurringValue !== undefined) prop.recurringValue = Math.max(0, Number(recurringValue) || 0);
    if (discountValue !== undefined) prop.discountValue = Math.max(0, Number(discountValue) || 0);
    if (conditions !== undefined) prop.conditions = String(conditions).trim();
    if (validUntil !== undefined) prop.validUntil = String(validUntil).trim();
    if (status && ['Rascunho', 'Enviada', 'Recusada'].includes(status) && prop.status !== 'Aceita') {
      prop.status = status;
    }
    prop.totalValue = Math.max(0, prop.setupValue + prop.recurringValue - (prop.discountValue || 0));
    store.audit(prop.organizationId, req.auth!.user.id, 'PROPOSAL_UPDATED', 'Proposal', prop.id, {
      planCode: prop.planCode,
      totalValue: prop.totalValue,
    });
    res.json(prop);
  });

  // --- GENERIC SOFT-ARCHIVE WITH AUDIT & RBAC ---
  const ARCHIVABLE_MAP: Record<string, { collection: keyof ReturnType<PersistentStore['getState']>; perm: string; resource: string }> = {
    leads: { collection: 'leads', perm: 'leads.update', resource: 'Lead' },
    opportunities: { collection: 'opportunities', perm: 'opportunities.manage', resource: 'Opportunity' },
    proposals: { collection: 'proposals', perm: 'proposals.manage', resource: 'Proposal' },
    contracts: { collection: 'contracts', perm: 'contracts.manage', resource: 'Contract' },
    projects: { collection: 'projects', perm: 'projects.manage', resource: 'Project' },
    creatives: { collection: 'creatives', perm: 'creative.manage', resource: 'CreativeAsset' },
    'web-pages': { collection: 'webPages', perm: 'web.manage', resource: 'WebPage' },
  };

  router.patch('/api/archive/:entity/:id', requireAuth, async (req: Request, res: Response) => {
    const cfg = ARCHIVABLE_MAP[req.params.entity];
    if (!cfg) {
      res.status(404).json({ error: 'Entidade não suporta arquivamento.' });
      return;
    }
    const perms = req.auth!.permissions;
    if (!perms.includes('*') && !perms.includes(cfg.perm)) {
      req.auditSecurityEvent?.('SECURITY_UNAUTHORIZED_ACCESS', 'Archive', {
        requiredPermission: cfg.perm,
        entity: req.params.entity,
      });
      res.status(403).json({ error: `Acesso negado. Permissão requerida: ${cfg.perm}` });
      return;
    }
    const list = store.getState()[cfg.collection] as unknown as Array<Record<string, any>>;
    const existing = list.find((i) => i.id === req.params.id);
    if (!existing || !canAccessResourceOrg(req, existing.organizationId)) {
      res.status(404).json({ error: `${cfg.resource} não encontrado no escopo.` });
      return;
    }
    const restore = Boolean(req.body?.restore);
    if (req.params.entity === 'web-pages' && restore && existing.archivedAt) {
      const outcome = await withOrgQuotaLock(existing.organizationId, () => {
        const quotaResource = classifyWebPageQuotaResource(existing.pageType);
        const entitlementCheck = assertEntitlement(store, {
          organizationId: existing.organizationId,
          resource: quotaResource,
          increment: 1,
          actorUserId: req.auth!.user.id,
          actionContext: 'PATCH /api/archive/web-pages/:id (restore)',
        });
        if (!entitlementCheck.allowed) {
          return {
            status: entitlementCheck.httpStatus,
            body: {
              error: entitlementCheck.error,
              code: entitlementCheck.code,
              entitlements: entitlementCheck.entitlements,
            },
          };
        }
        existing.archivedAt = null;
        store.audit(existing.organizationId, req.auth!.user.id, 'WEBPAGE_RESTORED', cfg.resource, existing.id, {
          reason: req.body?.reason || null,
        });
        return { status: 200 as const, body: { success: true, id: existing.id, archivedAt: null } };
      });
      res.status(outcome.status).json(outcome.body);
      return;
    }

    existing.archivedAt = restore ? null : new Date().toISOString();
    store.audit(
      existing.organizationId,
      req.auth!.user.id,
      restore ? `${cfg.resource.toUpperCase()}_RESTORED` : `${cfg.resource.toUpperCase()}_ARCHIVED`,
      cfg.resource,
      existing.id,
      {
        reason: req.body?.reason || null,
      }
    );
    res.json({ success: true, id: existing.id, archivedAt: existing.archivedAt });
  });

  // ============================================================================
  // 4. FASE 5 — STORAGE SERVICE (VALIDATED UPLOAD, PLAN QUOTA, SIGNED URL, S3/GCS READY)
  // ============================================================================
  router.get('/api/storage/assets', requireAuth, (req: Request, res: Response) => {
    const scope = resolveScopedOrg(req, req.query.organizationId as string | undefined);
    if (!scope.allowed) {
      res.status(403).json({ error: 'Acesso negado.' });
      return;
    }
    const state = store.getState();
    let assets = state.storedAssets.filter((a) => a.organizationId === scope.organizationId && !a.deletedAt);
    if (req.auth!.user.role === 'Cliente') {
      assets = assets.filter((a) => a.clientId === req.auth!.clientId);
    }
    if (req.query.module) {
      assets = assets.filter((a) => a.module === req.query.module);
    }
    const usedBytes = state.storedAssets
      .filter((a) => a.organizationId === scope.organizationId && !a.deletedAt)
      .reduce((sum, a) => sum + a.sizeBytes, 0);
    const entitlements = evaluateOrganizationEntitlements(store, scope.organizationId);
    const limitBytes = entitlements.limits.storageGb * 1024 * 1024 * 1024;
    const exp = Date.now() + 15 * 60 * 1000;

    res.json({
      driver: process.env.S3_BUCKET ? 's3' : process.env.GCS_BUCKET ? 'gcs' : 'local',
      s3Configured: Boolean(process.env.S3_BUCKET && process.env.S3_ACCESS_KEY_ID && process.env.S3_SECRET_ACCESS_KEY),
      usageBytes: usedBytes,
      limitBytes,
      limitGb: entitlements.limits.storageGb,
      assets: assets.map((a) => ({
        ...a,
        signedUrl: `/api/storage/assets/${a.id}/download?exp=${exp}&sig=${signStorageUrl(a.id, a.organizationId, exp)}`,
      })),
    });
  });

  router.post('/api/storage/upload', requireAuth, (req: Request, res: Response) => {
    if (req.auth!.user.role === 'Cliente') {
      res.status(403).json({ error: 'Upload de ativos operacionais restrito à equipe interna.' });
      return;
    }
    const scope = resolveScopedOrg(req, req.body?.organizationId);
    if (!scope.allowed) {
      res.status(403).json({ error: 'Acesso negado.' });
      return;
    }
    const entitlement = assertEntitlement(store, {
      organizationId: scope.organizationId,
      resource: 'feature',
      increment: 0,
      actorUserId: req.auth!.user.id,
      actionContext: 'POST /api/storage/upload',
    });
    if (!entitlement.allowed) {
      res.status(entitlement.httpStatus).json({ error: entitlement.error, code: entitlement.code });
      return;
    }

    const { fileName, mimeType, contentBase64, module: mod, clientId, projectId } = req.body || {};
    if (!fileName || !mimeType || !contentBase64) {
      res.status(400).json({ error: 'fileName, mimeType e contentBase64 são obrigatórios.' });
      return;
    }
    if (!ALLOWED_MIME_TYPES.has(String(mimeType))) {
      res.status(415).json({ error: `Tipo de arquivo não permitido: ${mimeType}` });
      return;
    }
    const buf = Buffer.from(String(contentBase64), 'base64');
    if (buf.length === 0 || buf.length > MAX_UPLOAD_BYTES) {
      res.status(413).json({ error: `Tamanho inválido. Limite por arquivo: ${MAX_UPLOAD_BYTES / (1024 * 1024)} MB.` });
      return;
    }

    const state = store.getState();
    const currentUsageBytes = state.storedAssets
      .filter((a) => a.organizationId === scope.organizationId && !a.deletedAt)
      .reduce((s, a) => s + a.sizeBytes, 0);
    const maxOrgBytes = entitlement.entitlements.limits.storageGb * 1024 * 1024 * 1024;
    if (currentUsageBytes + buf.length > maxOrgBytes) {
      res.status(402).json({
        error: `Limite de armazenamento do plano (${entitlement.entitlements.limits.storageGb} GB) excedido.`,
        code: 'PLAN_STORAGE_LIMIT_EXCEEDED',
      });
      return;
    }

    const safeName = path.basename(String(fileName)).replace(/[^a-zA-Z0-9._-]/g, '_');
    const assetId = uid('ast');
    const resolvedModule = ['creative', 'deliverable', 'web', 'general'].includes(mod) ? mod : 'general';
    const storageKey = `${scope.organizationId}/${resolvedModule}/${assetId}-${safeName}`;
    const fullDiskPath = resolveConfinedUploadPath(storageKey);
    if (!fullDiskPath) {
      res.status(400).json({ error: 'Caminho de armazenamento inválido.' });
      return;
    }
    fs.mkdirSync(path.dirname(fullDiskPath), { recursive: true });
    fs.writeFileSync(fullDiskPath, buf);

    const sha256 = crypto.createHash('sha256').update(buf).digest('hex');
    const asset = {
      id: assetId,
      organizationId: scope.organizationId,
      clientId: clientId ? String(clientId) : null,
      projectId: projectId ? String(projectId) : null,
      module: resolvedModule as 'creative' | 'deliverable' | 'web' | 'general',
      fileName: safeName,
      mimeType: String(mimeType),
      sizeBytes: buf.length,
      storageDriver: (process.env.S3_BUCKET ? 's3' : process.env.GCS_BUCKET ? 'gcs' : 'local') as 's3' | 'gcs' | 'minio' | 'local',
      storageKey,
      sha256,
      uploadedById: req.auth!.user.id,
      deletedAt: null,
      createdAt: new Date().toISOString(),
    };
    state.storedAssets.unshift(asset);
    store.audit(scope.organizationId, req.auth!.user.id, 'STORAGE_ASSET_UPLOADED', 'StoredAsset', asset.id, {
      fileName: asset.fileName,
      sizeBytes: asset.sizeBytes,
      mimeType: asset.mimeType,
    });
    const exp = Date.now() + 15 * 60 * 1000;
    res.status(201).json({
      ...asset,
      signedUrl: `/api/storage/assets/${asset.id}/download?exp=${exp}&sig=${signStorageUrl(asset.id, asset.organizationId, exp)}`,
    });
  });

  router.get('/api/storage/assets/:id/download', (req: Request, res: Response) => {
    const asset = store.getState().storedAssets.find((a) => a.id === req.params.id && !a.deletedAt);
    if (!asset) {
      res.status(404).json({ error: 'Arquivo não encontrado.' });
      return;
    }
    const exp = Number(req.query.exp || 0);
    const sig = String(req.query.sig || '');
    const isValidHexSig = /^[a-f0-9]{64}$/i.test(sig);
    const validSigned =
      exp > Date.now() &&
      isValidHexSig &&
      crypto.timingSafeEqual(Buffer.from(sig, 'hex'), Buffer.from(signStorageUrl(asset.id, asset.organizationId, exp), 'hex'));

    const validAuth = Boolean(req.auth && canAccessClientResource(req, asset.organizationId, asset.clientId));
    if (!validSigned && !validAuth) {
      res.status(403).json({ error: 'URL assinada expirada ou acesso não autorizado.' });
      return;
    }
    const fullDiskPath = resolveConfinedUploadPath(asset.storageKey);
    if (!fullDiskPath || !fs.existsSync(fullDiskPath)) {
      res.status(404).json({ error: 'Objeto físico não encontrado no storage.' });
      return;
    }
    res.setHeader('Content-Type', asset.mimeType);
    res.setHeader('Content-Disposition', `inline; filename="${asset.fileName}"`);
    res.sendFile(fullDiskPath);
  });

  router.delete('/api/storage/assets/:id', requireAuth, (req: Request, res: Response) => {
    if (req.auth!.user.role === 'Cliente') {
      res.status(403).json({ error: 'Acesso negado.' });
      return;
    }
    const asset = store.getState().storedAssets.find((a) => a.id === req.params.id && !a.deletedAt);
    if (!asset || !canAccessResourceOrg(req, asset.organizationId)) {
      res.status(404).json({ error: 'Arquivo não encontrado.' });
      return;
    }
    asset.deletedAt = new Date().toISOString();
    const fullDiskPath = resolveConfinedUploadPath(asset.storageKey);
    if (fullDiskPath && fs.existsSync(fullDiskPath)) {
      fs.rmSync(fullDiskPath, { force: true });
    }
    store.audit(asset.organizationId, req.auth!.user.id, 'STORAGE_ASSET_DELETED', 'StoredAsset', asset.id, {
      fileName: asset.fileName,
    });
    res.json({ success: true, id: asset.id });
  });

  // ============================================================================
  // 5. FASE 6 — EXTERNAL INTEGRATIONS STATUS, ENCRYPTED AD VAULT & DISPATCHERS
  // ============================================================================

  // Centralized Encrypted Ad Credentials Vault (Meta Ads, Google Ads, TikTok Ads)
  // Strictly restricted to administrators with operations.manage; NEVER exposes plaintext or ciphertext.
  router.get('/api/integrations/ad-credentials', requirePermission('operations.manage'), (req: Request, res: Response) => {
    const scope = resolveScopedOrg(req, req.query.organizationId as string | undefined);
    if (!scope.allowed) {
      res.status(403).json({ error: 'Acesso negado à organização solicitada.' });
      return;
    }
    res.json(listSanitizedAdCredentials(store, scope.organizationId));
  });

  router.put('/api/integrations/ad-credentials/:provider', requirePermission('operations.manage'), (req: Request, res: Response) => {
    const provider = String(req.params.provider || '').trim();
    if (!isValidAdProvider(provider)) {
      res.status(404).json({ error: 'Provedor de anúncios inválido. Utilize meta_ads, google_ads ou tiktok_ads.' });
      return;
    }
    const scope = resolveScopedOrg(req, req.body?.organizationId);
    if (!scope.allowed) {
      res.status(403).json({ error: 'Acesso negado à organização solicitada.' });
      return;
    }
    try {
      const sanitized = upsertAdIntegrationCredential(store, {
        organizationId: scope.organizationId,
        provider,
        actorUserId: req.auth!.user.id,
        enabled: typeof req.body?.enabled === 'boolean' ? req.body.enabled : undefined,
        publicConfig: req.body?.publicConfig,
        secrets: req.body?.secrets,
        clearSecrets: Array.isArray(req.body?.clearSecrets) ? req.body.clearSecrets : undefined,
      });
      res.json({
        success: true,
        provider: sanitized,
      });
    } catch (err: any) {
      if (err?.message === 'NER_AI_ENCRYPTION_KEY_MISSING') {
        res.status(400).json({
          error:
            'Variável NER_AI_ENCRYPTION_KEY não configurada no servidor. Defina NER_AI_ENCRYPTION_KEY no ambiente para criptografar tokens de anúncios com AES-256-GCM.',
          code: 'NER_AI_ENCRYPTION_KEY_MISSING',
        });
        return;
      }
      res.status(400).json({ error: err?.message || 'Erro ao salvar credenciais de integração.' });
    }
  });

  router.delete('/api/integrations/ad-credentials/:provider', requirePermission('operations.manage'), (req: Request, res: Response) => {
    const provider = String(req.params.provider || '').trim();
    if (!isValidAdProvider(provider)) {
      res.status(404).json({ error: 'Provedor de anúncios inválido. Utilize meta_ads, google_ads ou tiktok_ads.' });
      return;
    }
    const scope = resolveScopedOrg(req, (req.query.organizationId as string | undefined) || req.body?.organizationId);
    if (!scope.allowed) {
      res.status(403).json({ error: 'Acesso negado à organização solicitada.' });
      return;
    }
    const result = deleteAdIntegrationCredential(store, scope.organizationId, provider, req.auth!.user.id);
    res.json({
      success: true,
      deleted: result.deleted,
      provider: result.sanitized,
    });
  });

  router.post('/api/integrations/ad-credentials/:provider/test', requirePermission('operations.manage'), async (req: Request, res: Response) => {
    const provider = String(req.params.provider || '').trim();
    if (!isValidAdProvider(provider)) {
      res.status(404).json({ error: 'Provedor de anúncios inválido. Utilize meta_ads, google_ads ou tiktok_ads.' });
      return;
    }
    const scope = resolveScopedOrg(req, req.body?.organizationId);
    if (!scope.allowed) {
      res.status(403).json({ error: 'Acesso negado à organização solicitada.' });
      return;
    }
    const verifyLive = req.body?.verifyLive === true;
    const result = await testAdIntegrationCredential(store, scope.organizationId, provider, req.auth!.user.id, {
      verifyLive,
    });
    res.status(result.ok ? 200 : 422).json(result);
  });

  router.get('/api/integrations/status', requireAuth, (req: Request, res: Response) => {
    if (req.auth!.user.role === 'Cliente') {
      res.status(403).json({ error: 'Acesso restrito à equipe interna.' });
      return;
    }
    const scope = resolveScopedOrg(req, req.query.organizationId as string | undefined);
    if (!scope.allowed) {
      res.status(403).json({ error: 'Acesso negado.' });
      return;
    }
    const metaReadiness = getAdPlatformReadiness(store, scope.organizationId, 'meta_ads');
    const googleReadiness = getAdPlatformReadiness(store, scope.organizationId, 'google_ads');
    const tiktokReadiness = getAdPlatformReadiness(store, scope.organizationId, 'tiktok_ads');

    const integrations = [
      {
        key: 'stripe',
        name: 'Stripe Billing & Webhooks',
        configured: Boolean(process.env.STRIPE_SECRET_KEY && process.env.STRIPE_WEBHOOK_SECRET),
        requiredEnv: ['STRIPE_SECRET_KEY', 'STRIPE_WEBHOOK_SECRET'],
        status: process.env.STRIPE_SECRET_KEY && process.env.STRIPE_WEBHOOK_SECRET ? 'CONFIGURADO' : 'BLOQUEADO POR CREDENCIAIS',
      },
      {
        key: 'postgresql',
        name: 'PostgreSQL / Prisma Runtime',
        configured: Boolean(process.env.DATABASE_URL),
        requiredEnv: ['DATABASE_URL'],
        status: process.env.DATABASE_URL ? 'CONFIGURADO' : 'BLOQUEADO POR CREDENCIAIS',
      },
      {
        key: 'meta_ads_capi',
        name: 'Meta Ads & Conversions API (CAPI)',
        configured: metaReadiness.configured,
        source: metaReadiness.source,
        requiredEnv: ['META_ACCESS_TOKEN', 'META_PIXEL_ID', 'META_AD_ACCOUNT_ID'],
        status: metaReadiness.statusLabel,
      },
      {
        key: 'google_ads_ga4',
        name: 'Google Ads & GA4 Measurement Protocol',
        configured: googleReadiness.configured,
        source: googleReadiness.source,
        requiredEnv: ['GOOGLE_ADS_DEVELOPER_TOKEN', 'GA4_MEASUREMENT_ID', 'GA4_API_SECRET'],
        status: googleReadiness.statusLabel,
      },
      {
        key: 'tiktok_ads',
        name: 'TikTok Marketing API',
        configured: tiktokReadiness.configured,
        source: tiktokReadiness.source,
        requiredEnv: ['TIKTOK_ACCESS_TOKEN', 'TIKTOK_ADVERTISER_ID'],
        status: tiktokReadiness.statusLabel,
      },
      {
        key: 'whatsapp_cloud',
        name: 'WhatsApp Cloud API',
        configured: Boolean(process.env.WHATSAPP_ACCESS_TOKEN && process.env.WHATSAPP_PHONE_NUMBER_ID),
        requiredEnv: ['WHATSAPP_ACCESS_TOKEN', 'WHATSAPP_PHONE_NUMBER_ID'],
        status: process.env.WHATSAPP_ACCESS_TOKEN && process.env.WHATSAPP_PHONE_NUMBER_ID ? 'CONFIGURADO' : 'BLOQUEADO POR CREDENCIAIS',
      },
      {
        key: 'storage_s3',
        name: 'Object Storage S3 / GCS / MinIO',
        configured: Boolean(process.env.S3_BUCKET || process.env.GCS_BUCKET),
        requiredEnv: ['S3_BUCKET', 'S3_ACCESS_KEY_ID', 'S3_SECRET_ACCESS_KEY'],
        status: process.env.S3_BUCKET || process.env.GCS_BUCKET ? 'CONFIGURADO' : 'STORAGE LOCAL ATIVO (S3 PENDENTE)',
      },
      {
        key: 'email_resend',
        name: 'E-mail Transacional (Reset de Senha)',
        configured: Boolean(process.env.RESEND_API_KEY),
        requiredEnv: ['RESEND_API_KEY', 'MAIL_FROM'],
        status: process.env.RESEND_API_KEY ? 'CONFIGURADO' : 'BLOQUEADO POR CREDENCIAIS',
      },
      {
        key: 'redis_bullmq',
        name: 'Redis / BullMQ Filas & Retries',
        configured: Boolean(process.env.REDIS_URL),
        requiredEnv: ['REDIS_URL'],
        status: process.env.REDIS_URL ? 'CONFIGURADO' : 'BLOQUEADO POR CREDENCIAIS',
      },
    ];
    res.json({ integrations });
  });

  router.post('/api/integrations/tracking/dispatch', requirePermission('tracking.manage'), async (req: Request, res: Response) => {
    const scope = resolveScopedOrg(req, req.body?.organizationId);
    if (!scope.allowed) {
      res.status(403).json({ error: 'Acesso negado.' });
      return;
    }
    const { eventId, target } = req.body || {};
    const event = store.getState().trackingEvents.find((e) => e.id === eventId && e.organizationId === scope.organizationId);
    if (!event) {
      res.status(404).json({ error: 'Evento de tracking não encontrado.' });
      return;
    }

    if (target === 'meta_capi') {
      const metaCreds = resolveDecryptedAdCredentials(store, scope.organizationId, 'meta_ads');
      const token = metaCreds.secrets.accessToken;
      const pixelId = metaCreds.publicConfig.pixelId;
      if (!metaCreds.enabled || !token || !pixelId) {
        event.dispatchStatus = 'blocked_credentials';
        store.save();
        res.status(503).json({
          error:
            metaCreds.decryptError ||
            'Meta CAPI bloqueado por credenciais (configure no Cofre de Integrações Ads ou defina META_ACCESS_TOKEN e META_PIXEL_ID).',
          status: 'BLOQUEADO POR CREDENCIAIS',
        });
        return;
      }
      const resp = await fetch(`https://graph.facebook.com/v20.0/${encodeURIComponent(pixelId)}/events`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        signal: AbortSignal.timeout(10000),
        body: JSON.stringify({
          data: [
            {
              event_name: event.eventName,
              event_time: Math.floor(new Date(event.timestamp).getTime() / 1000),
              event_id: event.eventId,
              action_source: 'website',
              custom_data: { currency: event.currency, value: event.value },
            },
          ],
        }),
      });
      event.dispatchStatus = resp.ok ? 'dispatched' : 'failed';
      store.audit(scope.organizationId, req.auth!.user.id, 'TRACKING_META_CAPI_DISPATCH', 'TrackingEvent', event.id, {
        ok: resp.ok,
        httpStatus: resp.status,
        credentialSource: metaCreds.source,
      });
      res.status(resp.ok ? 200 : 502).json({ dispatched: resp.ok, provider: 'meta_capi', event });
      return;
    }

    if (target === 'ga4') {
      const googleCreds = resolveDecryptedAdCredentials(store, scope.organizationId, 'google_ads');
      const mid = googleCreds.publicConfig.ga4MeasurementId;
      const secret = googleCreds.secrets.ga4ApiSecret;
      if (!googleCreds.enabled || !mid || !secret) {
        event.dispatchStatus = 'blocked_credentials';
        store.save();
        res.status(503).json({
          error:
            googleCreds.decryptError ||
            'GA4 Measurement Protocol bloqueado por credenciais (configure no Cofre de Integrações Ads ou defina GA4_MEASUREMENT_ID e GA4_API_SECRET).',
          status: 'BLOQUEADO POR CREDENCIAIS',
        });
        return;
      }
      const resp = await fetch(
        `https://www.google-analytics.com/mp/collect?measurement_id=${encodeURIComponent(mid)}&api_secret=${encodeURIComponent(secret)}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          signal: AbortSignal.timeout(10000),
          body: JSON.stringify({
            client_id: event.clientId,
            events: [{ name: event.eventName.toLowerCase(), params: { value: event.value, currency: event.currency, event_id: event.eventId } }],
          }),
        }
      );
      event.dispatchStatus = resp.ok ? 'dispatched' : 'failed';
      store.audit(scope.organizationId, req.auth!.user.id, 'TRACKING_GA4_DISPATCH', 'TrackingEvent', event.id, {
        ok: resp.ok,
        credentialSource: googleCreds.source,
      });
      res.status(resp.ok ? 200 : 502).json({ dispatched: resp.ok, provider: 'ga4', event });
      return;
    }

    res.status(400).json({ error: 'Target inválido. Utilize meta_capi ou ga4.' });
  });

  // ============================================================================
  // 6. FASE 7 — NER STRATEGY PERSISTENCE (PLANS & OKRS) + PUBLIC WEB RENDERING
  // ============================================================================
  router.get('/api/strategy/plans', requireAuth, (req: Request, res: Response) => {
    const scope = resolveScopedOrg(req, req.query.organizationId as string | undefined);
    if (!scope.allowed) {
      res.status(403).json({ error: 'Acesso negado.' });
      return;
    }
    let list = store.getState().strategyPlans.filter((s) => s.organizationId === scope.organizationId);
    if (req.auth!.user.role === 'Cliente') {
      if (!req.auth!.clientId) {
        res.status(403).json({ error: 'Acesso negado.' });
        return;
      }
      list = list.filter((s) => s.clientId === req.auth!.clientId);
    }
    res.json(applyListQuery(list, parseListQuery(req.query as Record<string, unknown>, ['title', 'quarter', 'objective'])));
  });

  router.post('/api/strategy/plans', requirePermission('projects.create'), (req: Request, res: Response) => {
    const scope = resolveScopedOrg(req, req.body?.organizationId);
    if (!scope.allowed) {
      res.status(403).json({ error: 'Acesso negado.' });
      return;
    }
    const { clientId, projectId, title, quarter, objective, positioning, channels, okrs } = req.body || {};
    if (!clientId || !title || !objective) {
      res.status(400).json({ error: 'clientId, título e objetivo estratégico são obrigatórios.' });
      return;
    }
    const state = store.getState();
    const client = state.clients.find((c) => c.id === clientId && c.organizationId === scope.organizationId);
    if (!client) {
      res.status(404).json({ error: 'Cliente não encontrado na organização ativa.' });
      return;
    }
    const now = new Date().toISOString();
    const plan = {
      id: uid('str'),
      organizationId: scope.organizationId,
      clientId: client.id,
      projectId: projectId ? String(projectId) : null,
      title: String(title).trim(),
      quarter: String(quarter || 'Q1 2027').trim(),
      objective: String(objective).trim(),
      positioning: positioning ? String(positioning).trim() : '',
      channels: Array.isArray(channels) ? channels.map(String) : [],
      okrs: Array.isArray(okrs)
        ? okrs.map((o: any, idx: number) => ({
            id: o.id || uid(`okr${idx}`),
            objective: String(o.objective || ''),
            keyResult: String(o.keyResult || ''),
            target: String(o.target || ''),
            current: String(o.current || '0'),
            progress: Math.min(100, Math.max(0, Number(o.progress) || 0)),
          }))
        : [],
      status: 'Ativo' as const,
      createdById: req.auth!.user.id,
      archivedAt: null,
      createdAt: now,
      updatedAt: now,
    };
    state.strategyPlans.unshift(plan);
    store.audit(scope.organizationId, req.auth!.user.id, 'STRATEGY_PLAN_CREATED', 'StrategyPlan', plan.id, { title: plan.title });
    res.status(201).json(plan);
  });

  router.patch('/api/strategy/plans/:id', requirePermission('projects.update'), (req: Request, res: Response) => {
    const plan = store.getState().strategyPlans.find((s) => s.id === req.params.id);
    if (!plan || !canAccessResourceOrg(req, plan.organizationId)) {
      res.status(404).json({ error: 'Plano estratégico não encontrado.' });
      return;
    }
    const { title, quarter, objective, positioning, channels, okrs, status, archived } = req.body || {};
    if (title !== undefined) plan.title = String(title).trim();
    if (quarter !== undefined) plan.quarter = String(quarter).trim();
    if (objective !== undefined) plan.objective = String(objective).trim();
    if (positioning !== undefined) plan.positioning = String(positioning).trim();
    if (Array.isArray(channels)) plan.channels = channels.map(String);
    if (Array.isArray(okrs)) plan.okrs = okrs;
    if (status && ['Rascunho', 'Ativo', 'Concluído', 'Arquivado'].includes(status)) plan.status = status;
    if (archived !== undefined) plan.archivedAt = archived ? new Date().toISOString() : null;
    plan.updatedAt = new Date().toISOString();
    store.audit(plan.organizationId, req.auth!.user.id, 'STRATEGY_PLAN_UPDATED', 'StrategyPlan', plan.id, { status: plan.status });
    res.json(plan);
  });

  // Public Web Page JSON & Server-Rendered HTML (/p/:slug)
  router.get('/api/public/pages/:slug', (req: Request, res: Response) => {
    const page = store.getState().webPages.find(
      (w) => w.slug === req.params.slug && w.status === 'Publicado' && !w.archivedAt
    );
    if (!page) {
      res.status(404).json({ error: 'Página pública não encontrada ou não publicada.' });
      return;
    }
    page.visits += 1;
    store.save();
    res.json({
      id: page.id,
      title: page.title,
      slug: page.slug,
      seoTitle: page.seoTitle,
      seoDescription: page.seoDescription,
      whatsappNumber: page.whatsappNumber,
      checkoutUrl: page.checkoutUrl,
      sections: page.sections,
      visits: page.visits,
    });
  });

  router.get('/p/:slug', (req: Request, res: Response) => {
    const page = store.getState().webPages.find(
      (w) => w.slug === req.params.slug && w.status === 'Publicado' && !w.archivedAt
    );
    if (!page) {
      res.status(404).send('<!doctype html><html><body style="font-family:sans-serif;background:#020617;color:#e2e8f0;padding:48px;text-align:center"><h1>Página não encontrada</h1><p>Esta página ainda não foi publicada.</p></body></html>');
      return;
    }
    page.visits += 1;
    store.save();
    const sectionsHtml = (page.sections || [])
      .map(
        (s) => `
      <section style="max-width:860px;margin:24px auto;padding:32px;background:#0f172a;border:1px solid #1e293b;border-radius:16px">
        <div style="font-size:11px;text-transform:uppercase;letter-spacing:0.12em;color:#22d3ee;margin-bottom:8px">${escapeHtml(s.type)}</div>
        <h2 style="margin:0 0 12px;font-size:28px;color:#ffffff">${escapeHtml(s.headline)}</h2>
        <p style="margin:0 0 20px;font-size:16px;color:#94a3b8;line-height:1.6">${escapeHtml(s.subheadline)}</p>
        <a href="#captura" style="display:inline-block;padding:12px 22px;background:#0891b2;color:#fff;text-decoration:none;border-radius:10px;font-weight:600">${escapeHtml(s.ctaText || 'Solicitar Contato')}</a>
      </section>`
      )
      .join('');
    const waLink = page.whatsappNumber
      ? `<a href="https://wa.me/${escapeHtml(page.whatsappNumber.replace(/\D/g, ''))}" target="_blank" rel="noreferrer" style="display:inline-block;margin-top:12px;padding:10px 18px;background:#16a34a;color:#fff;text-decoration:none;border-radius:10px;font-weight:600">Falar no WhatsApp</a>`
      : '';
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.send(`<!doctype html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <title>${escapeHtml(page.seoTitle || page.title)}</title>
  <meta name="description" content="${escapeHtml(page.seoDescription || '')}" />
  <meta property="og:title" content="${escapeHtml(page.seoTitle || page.title)}" />
  <meta property="og:description" content="${escapeHtml(page.seoDescription || '')}" />
</head>
<body style="margin:0;background:#020617;color:#e2e8f0;font-family:system-ui,-apple-system,sans-serif;padding:24px">
  <main>
    ${sectionsHtml}
    <section id="captura" style="max-width:860px;margin:28px auto;padding:32px;background:#0f172a;border:1px solid #1e293b;border-radius:16px">
      <h3 style="margin-top:0;color:#fff">Solicite um diagnóstico</h3>
      <form id="leadForm" style="display:grid;gap:12px;max-width:480px">
        <input name="name" required placeholder="Seu nome" style="padding:10px;border-radius:8px;border:1px solid #334155;background:#020617;color:#fff" />
        <input name="email" type="email" required placeholder="Seu e-mail" style="padding:10px;border-radius:8px;border:1px solid #334155;background:#020617;color:#fff" />
        <input name="phone" placeholder="WhatsApp / Telefone" style="padding:10px;border-radius:8px;border:1px solid #334155;background:#020617;color:#fff" />
        <button type="submit" style="padding:12px;border:none;border-radius:8px;background:#06b6d4;color:#020617;font-weight:700;cursor:pointer">Enviar</button>
        <div id="status" style="font-size:13px;color:#34d399"></div>
      </form>
      ${waLink}
    </section>
  </main>
  <script>
    document.getElementById('leadForm').addEventListener('submit', async function(e) {
      e.preventDefault();
      var fd = new FormData(e.target);
      var res = await fetch('/api/web/pages/${escapeHtml(page.id)}/submit-lead', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: fd.get('name'), email: fd.get('email'), phone: fd.get('phone') })
      });
      var el = document.getElementById('status');
      el.textContent = res.ok ? 'Recebido com sucesso! Nossa equipe entrará em contato.' : 'Erro ao enviar. Tente novamente.';
      if (res.ok) e.target.reset();
    });
  </script>
</body>
</html>`);
  });

  // ============================================================================
  // 7. FASE 8 — 3 NEW MODULES: QA, PRODUCTION READINESS & LAUNCH, FINAL VALIDATION & DELIVERY
  // ============================================================================
  router.get('/api/qa/items', requireAuth, (req: Request, res: Response) => {
    if (req.auth!.user.role === 'Cliente') {
      res.status(403).json({ error: 'Módulo de QA restrito à equipe interna.' });
      return;
    }
    const scope = resolveScopedOrg(req, req.query.organizationId as string | undefined);
    if (!scope.allowed) {
      res.status(403).json({ error: 'Acesso negado.' });
      return;
    }
    const items = store.getState().qaItems.filter((q) => q.organizationId === scope.organizationId);
    res.json(items);
  });

  router.post('/api/qa/items', requirePermission('operations.manage'), (req: Request, res: Response) => {
    const scope = resolveScopedOrg(req, req.body?.organizationId);
    if (!scope.allowed) {
      res.status(403).json({ error: 'Acesso negado.' });
      return;
    }
    const { title, category, severity, projectId, evidence } = req.body || {};
    if (!title) {
      res.status(400).json({ error: 'Título do item de QA é obrigatório.' });
      return;
    }
    const now = new Date().toISOString();
    const item = {
      id: uid('qa'),
      organizationId: scope.organizationId,
      projectId: projectId ? String(projectId) : null,
      title: String(title).trim(),
      category: (['API', 'Integração', 'Segurança', 'Performance', 'UX'].includes(category) ? category : 'API') as
        | 'API'
        | 'Integração'
        | 'Segurança'
        | 'Performance'
        | 'UX',
      severity: (['Baixa', 'Média', 'Alta', 'Crítica'].includes(severity) ? severity : 'Média') as
        | 'Baixa'
        | 'Média'
        | 'Alta'
        | 'Crítica',
      status: 'Pendente' as const,
      assigneeName: req.auth!.user.name,
      evidence: evidence ? String(evidence).trim() : '',
      createdAt: now,
      updatedAt: now,
    };
    store.getState().qaItems.unshift(item);
    store.audit(scope.organizationId, req.auth!.user.id, 'QA_ITEM_CREATED', 'QaCheckItem', item.id, { category: item.category });
    res.status(201).json(item);
  });

  router.patch('/api/qa/items/:id', requirePermission('operations.manage'), (req: Request, res: Response) => {
    const item = store.getState().qaItems.find((q) => q.id === req.params.id);
    if (!item || !canAccessResourceOrg(req, item.organizationId)) {
      res.status(404).json({ error: 'Item de QA não encontrado.' });
      return;
    }
    const { status, evidence, severity } = req.body || {};
    if (status && ['Pendente', 'Aprovado', 'Falhou', 'Corrigido'].includes(status)) item.status = status;
    if (severity && ['Baixa', 'Média', 'Alta', 'Crítica'].includes(severity)) item.severity = severity;
    if (evidence !== undefined) item.evidence = String(evidence).trim();
    item.updatedAt = new Date().toISOString();
    store.audit(item.organizationId, req.auth!.user.id, 'QA_ITEM_UPDATED', 'QaCheckItem', item.id, { status: item.status });
    res.json(item);
  });

  router.get('/api/launch/checklist', requireAuth, (req: Request, res: Response) => {
    if (req.auth!.user.role === 'Cliente') {
      res.status(403).json({ error: 'Módulo de Prontidão restrito à equipe interna.' });
      return;
    }
    const scope = resolveScopedOrg(req, req.query.organizationId as string | undefined);
    if (!scope.allowed) {
      res.status(403).json({ error: 'Acesso negado.' });
      return;
    }
    const items = store.getState().launchItems.filter((i) => i.organizationId === scope.organizationId);
    const requiredItems = items.filter((i) => i.required);
    const doneRequired = requiredItems.filter((i) => i.status === 'Concluído').length;
    const readinessPct = requiredItems.length > 0 ? Math.round((doneRequired / requiredItems.length) * 100) : 100;
    res.json({ items, readinessPct, readyForGoLive: readinessPct === 100 && !items.some((i) => i.status === 'Bloqueado') });
  });

  router.post('/api/launch/checklist', requirePermission('operations.manage'), (req: Request, res: Response) => {
    const scope = resolveScopedOrg(req, req.body?.organizationId);
    if (!scope.allowed) {
      res.status(403).json({ error: 'Acesso negado.' });
      return;
    }
    const { domain, title, required, notes, projectId } = req.body || {};
    if (!title) {
      res.status(400).json({ error: 'Título do item de prontidão é obrigatório.' });
      return;
    }
    const validDomains = ['SSL', 'DNS', 'Pixel', 'Migrations', 'Backup', 'Billing', 'Monitoring', 'Security'];
    const now = new Date().toISOString();
    const item = {
      id: uid('lch'),
      organizationId: scope.organizationId,
      projectId: projectId ? String(projectId) : null,
      domain: (validDomains.includes(domain) ? domain : 'Security') as any,
      title: String(title).trim(),
      required: required !== false,
      status: 'Pendente' as const,
      verifiedBy: null,
      verifiedAt: null,
      notes: notes ? String(notes).trim() : '',
      createdAt: now,
      updatedAt: now,
    };
    store.getState().launchItems.unshift(item);
    store.audit(scope.organizationId, req.auth!.user.id, 'LAUNCH_ITEM_CREATED', 'LaunchChecklistItem', item.id, { domain: item.domain });
    res.status(201).json(item);
  });

  router.patch('/api/launch/checklist/:id', requirePermission('operations.manage'), (req: Request, res: Response) => {
    const item = store.getState().launchItems.find((i) => i.id === req.params.id);
    if (!item || !canAccessResourceOrg(req, item.organizationId)) {
      res.status(404).json({ error: 'Item de checklist não encontrado.' });
      return;
    }
    const { status, notes } = req.body || {};
    const now = new Date().toISOString();
    if (status && ['Pendente', 'Concluído', 'Bloqueado'].includes(status)) {
      item.status = status;
      if (status === 'Concluído') {
        item.verifiedBy = req.auth!.user.name;
        item.verifiedAt = now;
      }
    }
    if (notes !== undefined) item.notes = String(notes).trim();
    item.updatedAt = now;
    store.audit(item.organizationId, req.auth!.user.id, 'LAUNCH_ITEM_UPDATED', 'LaunchChecklistItem', item.id, { status: item.status });
    res.json(item);
  });

  router.get('/api/delivery/handoffs', requireAuth, (req: Request, res: Response) => {
    const scope = resolveScopedOrg(req, req.query.organizationId as string | undefined);
    if (!scope.allowed) {
      res.status(403).json({ error: 'Acesso negado.' });
      return;
    }
    let list = store.getState().deliveryHandoffs.filter((d) => d.organizationId === scope.organizationId);
    if (req.auth!.user.role === 'Cliente') {
      if (!req.auth!.clientId) {
        res.status(403).json({ error: 'Acesso negado.' });
        return;
      }
      list = list.filter((d) => d.clientId === req.auth!.clientId);
    }
    res.json(list);
  });

  router.post('/api/delivery/handoffs', requirePermission('projects.manage'), (req: Request, res: Response) => {
    const scope = resolveScopedOrg(req, req.body?.organizationId);
    if (!scope.allowed) {
      res.status(403).json({ error: 'Acesso negado.' });
      return;
    }
    const { projectId, title, summary, deliverablesList, acceptanceTerms, version } = req.body || {};
    const state = store.getState();
    const project = state.projects.find((p) => p.id === projectId && p.organizationId === scope.organizationId);
    if (!project || !title || !summary) {
      res.status(400).json({ error: 'Projeto válido, título e resumo da entrega são obrigatórios.' });
      return;
    }
    const now = new Date().toISOString();
    const handoff = {
      id: uid('dlv'),
      organizationId: scope.organizationId,
      projectId: project.id,
      clientId: project.clientId,
      title: String(title).trim(),
      version: String(version || 'v1.0'),
      summary: String(summary).trim(),
      deliverablesList: Array.isArray(deliverablesList) ? deliverablesList.map(String) : [],
      acceptanceTerms: String(
        acceptanceTerms || 'Declaro aceite formal dos entregáveis listados neste termo de handoff.'
      ).trim(),
      status: 'Aguardando aceite' as const,
      acceptedByName: null,
      acceptedByUserId: null,
      acceptedAt: null,
      signatureHash: null,
      createdAt: now,
      updatedAt: now,
    };
    state.deliveryHandoffs.unshift(handoff);
    store.audit(scope.organizationId, req.auth!.user.id, 'DELIVERY_HANDOFF_CREATED', 'DeliveryHandoff', handoff.id, {
      projectId: project.id,
    });
    res.status(201).json(handoff);
  });

  router.patch('/api/delivery/handoffs/:id/decide', requireAuth, (req: Request, res: Response) => {
    const handoff = store.getState().deliveryHandoffs.find((d) => d.id === req.params.id);
    if (!handoff || !canAccessClientResource(req, handoff.organizationId, handoff.clientId)) {
      res.status(403).json({ error: 'Termo de entrega não encontrado ou fora do escopo.' });
      return;
    }
    const { status } = req.body || {};
    if (!['Aceito', 'Ajustes solicitados'].includes(status)) {
      res.status(400).json({ error: 'Decisão inválida. Utilize Aceito ou Ajustes solicitados.' });
      return;
    }
    const now = new Date().toISOString();
    handoff.status = status;
    handoff.acceptedByName = req.auth!.user.name;
    handoff.acceptedByUserId = req.auth!.user.id;
    handoff.acceptedAt = now;
    handoff.updatedAt = now;
    handoff.signatureHash = crypto
      .createHash('sha256')
      .update(`${handoff.id}:${handoff.version}:${req.auth!.user.id}:${status}:${now}`)
      .digest('hex');
    store.audit(handoff.organizationId, req.auth!.user.id, 'DELIVERY_HANDOFF_DECIDED', 'DeliveryHandoff', handoff.id, {
      status,
      signatureHash: handoff.signatureHash,
    });
    res.json(handoff);
  });

  return router;
}
