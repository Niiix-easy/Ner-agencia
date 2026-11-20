import crypto from 'node:crypto';
import express, { Express, Request, Response, NextFunction } from 'express';
import { PersistentStore, hashPassword } from './store.ts';
import {
  GoogleTokenVerifier,
  canAccessClientResource,
  canAccessResourceOrg,
  createAuthMiddleware,
  getGoogleAuthConfig,
  handleGoogleLogin,
  handleLogin,
  handleLogout,
  hasPermission,
  requireAuth,
  requirePermission,
  resolveScopedOrg,
  sanitizeUser,
} from './middleware/auth.ts';
import { contractPlanAndCreateProject, recalculateProjectProgress } from './services/digital-studio.ts';
import {
  StripePaymentAdapter,
  buildStripeSignatureHeader,
  createSaaSCheckoutSession,
  getOrganizationEntitlements,
  processPaymentWebhook,
} from './services/billing-stripe.ts';
import { ROLE_PERMISSIONS, RoleName } from './types.ts';
import { AiGatewayService } from './ai/gateway.ts';
import { createAiGatewayRouter } from './ai/router.ts';
import { AiProviderAdapter } from './ai/providers.ts';
import { AiProviderId } from './ai/types.ts';

function uid(prefix: string): string {
  return `${prefix}-${Date.now()}-${crypto.randomBytes(3).toString('hex')}`;
}

export interface CreateAppOptions {
  stripeWebhookSecret?: string;
  aiAdapters?: Record<AiProviderId, AiProviderAdapter>;
  aiMasterKeyOverride?: string;
  googleTokenVerifier?: GoogleTokenVerifier;
}

const VALID_ROLES = new Set<RoleName>([
  'Super Admin',
  'Administrador',
  'Gestor de Tráfego',
  'Comercial',
  'Criativo',
  'Financeiro',
  'Cliente',
]);

const VALID_CLIENT_STATUS = new Set(['Ativo', 'Em Onboarding', 'Inativo']);
const VALID_CLIENT_HEALTH = new Set(['Excelente', 'Bom', 'Atenção', 'Novo']);
const VALID_TASK_STATUS = new Set(['A fazer', 'Em andamento', 'Em revisão', 'Concluída']);
const VALID_TASK_PRIORITY = new Set(['Baixa', 'Normal', 'Alta', 'Crítica']);
const VALID_WEB_STATUS = new Set(['Rascunho', 'Em revisão', 'Aprovado', 'Publicado']);
const VALID_TICKET_STATUS = new Set(['Aberto', 'Em atendimento', 'Resolvido']);
const VALID_TICKET_PRIORITY = new Set(['Baixa', 'Normal', 'Alta']);

export function createApp(
  store: PersistentStore,
  options: CreateAppOptions = {}
): { app: Express; store: PersistentStore; aiGateway: AiGatewayService } {
  const app = express();
  const stripeAdapter = new StripePaymentAdapter();
  const getWebhookSecret = (): string | null => {
    if (options.stripeWebhookSecret) return options.stripeWebhookSecret;
    if (process.env.STRIPE_WEBHOOK_SECRET) return process.env.STRIPE_WEBHOOK_SECRET;
    if (process.env.NODE_ENV === 'production') return null;
    return 'whsec_ner_local_dev_sandbox';
  };

  // Security headers baseline
  app.use((_req: Request, res: Response, next: NextFunction) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'SAMEORIGIN');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
    next();
  });

  // Capture rawBody buffer for Stripe HMAC signature verification
  app.use(
    express.json({
      limit: '2mb',
      verify: (req, _res, buf) => {
        (req as Request).rawBody = buf;
      },
    })
  );

  // Attach authenticated user/session context if present
  app.use(createAuthMiddleware(store));

  // --- HEALTH ---
  app.get('/api/health', (_req: Request, res: Response) => {
    const persistenceMode = process.env.DATABASE_URL ? 'PostgreSQL / Prisma configured' : 'Local Atomic JSON Store (database/data/ner-db.json)';
    res.json({
      status: 'online',
      system: 'NER AGENCY OS',
      version: '16.0.0-reviewed',
      timestamp: new Date().toISOString(),
      database: persistenceMode,
      integrations: {
        gemini: Boolean(process.env.GEMINI_API_KEY),
        stripeLive: Boolean(process.env.STRIPE_SECRET_KEY && process.env.STRIPE_WEBHOOK_SECRET),
        n8nWebhook: Boolean(process.env.N8N_WEBHOOK_URL),
        metaAdsOAuth: Boolean(process.env.META_APP_ID && process.env.META_APP_SECRET),
        googleAdsOAuth: Boolean(process.env.GOOGLE_ADS_CLIENT_ID),
      },
      modules: [
        'NER Core',
        'NER Business',
        'NER Digital Studio',
        'NER Projects',
        'NER Creative',
        'NER Performance',
        'NER Tracking',
        'NER Automation',
        'NER Intelligence',
        'NER Web',
        'NER Client Portal',
        'NER Operations & Billing',
      ],
    });
  });

  // --- AUTH ---
  app.get('/api/auth/providers', (_req: Request, res: Response) => {
    const googleCfg = getGoogleAuthConfig();
    res.json({
      local: true,
      google: {
        enabled: googleCfg.enabled,
        clientId: googleCfg.clientId,
        allowAutoProvision: googleCfg.allowAutoProvision,
      },
    });
  });

  app.post('/api/auth/login', (req: Request, res: Response) => {
    handleLogin(store, req, res);
  });

  app.post('/api/auth/google', (req: Request, res: Response) => {
    void handleGoogleLogin(store, req, res, options.googleTokenVerifier);
  });

  app.post('/api/auth/logout', (req: Request, res: Response) => {
    handleLogout(store, req, res);
  });

  app.post('/api/auth/forgot-password', (req: Request, res: Response) => {
    const { email } = req.body || {};
    if (typeof email !== 'string' || !email.trim()) {
      res.status(400).json({ error: 'Informe um e-mail válido.' });
      return;
    }
    // Always generic response to avoid user enumeration
    res.json({
      success: true,
      message: 'Se o e-mail estiver cadastrado e ativo, as instruções de redefinição foram registradas.',
    });
  });

  app.get('/api/auth/me', requireAuth, (req: Request, res: Response) => {
    res.json({
      user: req.auth!.user,
      organizationId: req.auth!.organizationId,
      clientId: req.auth!.clientId,
      permissions: req.auth!.permissions,
    });
  });

  // --- ORGANIZATIONS ---
  app.get('/api/organizations', requireAuth, (req: Request, res: Response) => {
    const orgs = store.getState().organizations;
    if (req.auth!.user.role === 'Super Admin') {
      res.json(orgs);
      return;
    }
    res.json(orgs.filter((o) => o.id === req.auth!.organizationId));
  });

  app.post('/api/organizations', requireAuth, (req: Request, res: Response) => {
    if (req.auth!.user.role !== 'Super Admin') {
      res.status(403).json({ error: 'Apenas Super Admin pode criar organizações.' });
      return;
    }
    const { name, legalName, document, slug } = req.body || {};
    if (!name || !slug) {
      res.status(400).json({ error: 'Nome e slug são obrigatórios.' });
      return;
    }
    const state = store.getState();
    if (state.organizations.some((o) => o.slug === slug)) {
      res.status(409).json({ error: 'Slug de organização já em uso.' });
      return;
    }
    const org = {
      id: uid('org'),
      name: String(name).trim(),
      legalName: String(legalName || name).trim(),
      document: String(document || '00.000.000/0001-00').trim(),
      slug: String(slug).trim().toLowerCase(),
      status: 'Ativo' as const,
      createdAt: new Date().toISOString(),
    };
    state.organizations.push(org);
    store.audit(org.id, req.auth!.user.id, 'ORGANIZATION_CREATED', 'Organization', org.id, { slug: org.slug });
    res.status(201).json(org);
  });

  app.patch('/api/organizations/:id/status', requireAuth, (req: Request, res: Response) => {
    if (req.auth!.user.role !== 'Super Admin') {
      res.status(403).json({ error: 'Apenas Super Admin pode alterar o status da organização.' });
      return;
    }
    const org = store.getState().organizations.find((o) => o.id === req.params.id);
    if (!org) {
      res.status(404).json({ error: 'Organização não encontrada.' });
      return;
    }
    const { status } = req.body || {};
    if (status !== 'Ativo' && status !== 'Suspenso') {
      res.status(400).json({ error: 'Status inválido.' });
      return;
    }
    org.status = status;
    store.audit(org.id, req.auth!.user.id, 'ORGANIZATION_STATUS_UPDATED', 'Organization', org.id, { status });
    res.json(org);
  });

  // --- USERS & RBAC ---
  app.get('/api/users', requirePermission('users.read'), (req: Request, res: Response) => {
    const scope = resolveScopedOrg(req, req.query.organizationId as string | undefined);
    if (!scope.allowed) {
      res.status(403).json({ error: 'Acesso negado a usuários de outra organização.' });
      return;
    }
    const users = store
      .getState()
      .users.filter((u) => u.organizationId === scope.organizationId)
      .map(sanitizeUser);
    res.json(users);
  });

  app.post('/api/users', requirePermission('users.create'), (req: Request, res: Response) => {
    const scope = resolveScopedOrg(req, req.body?.organizationId);
    if (!scope.allowed) {
      res.status(403).json({ error: 'Não é permitido criar usuário em outra organização.' });
      return;
    }
    const { name, email, password, role, clientId } = req.body || {};
    if (!name || !email || !password || !role) {
      res.status(400).json({ error: 'Nome, e-mail, senha e perfil são obrigatórios.' });
      return;
    }
    if (!VALID_ROLES.has(role)) {
      res.status(400).json({ error: 'Perfil RBAC inválido.' });
      return;
    }
    if (role === 'Super Admin' && req.auth!.user.role !== 'Super Admin') {
      res.status(403).json({ error: 'Apenas Super Admin pode criar outro Super Admin.' });
      return;
    }
    if (String(password).length < 6) {
      res.status(400).json({ error: 'Senha deve ter no mínimo 6 caracteres.' });
      return;
    }
    const state = store.getState();
    const normEmail = String(email).trim().toLowerCase();
    if (state.users.some((u) => u.email.toLowerCase() === normEmail)) {
      res.status(409).json({ error: 'E-mail já cadastrado.' });
      return;
    }
    let resolvedClientId: string | null = null;
    if (role === 'Cliente') {
      if (!clientId) {
        res.status(400).json({ error: 'Usuários com perfil Cliente devem estar vinculados a um clientId.' });
        return;
      }
      const cli = state.clients.find((c) => c.id === clientId && c.organizationId === scope.organizationId);
      if (!cli) {
        res.status(404).json({ error: 'Cliente informado não pertence à organização ativa.' });
        return;
      }
      resolvedClientId = cli.id;
    }
    const newUser = {
      id: uid('usr'),
      organizationId: scope.organizationId,
      clientId: resolvedClientId,
      name: String(name).trim(),
      email: normEmail,
      passwordHash: hashPassword(String(password)),
      role: role as RoleName,
      status: 'Ativo' as const,
      emailVerifiedAt: new Date().toISOString(),
      createdAt: new Date().toISOString(),
    };
    state.users.push(newUser);
    store.audit(scope.organizationId, req.auth!.user.id, 'USER_CREATED', 'User', newUser.id, {
      email: newUser.email,
      role: newUser.role,
    });
    res.status(201).json(sanitizeUser(newUser));
  });

  app.patch('/api/users/:id/status', requirePermission('users.update'), (req: Request, res: Response) => {
    const user = store.getState().users.find((u) => u.id === req.params.id);
    if (!user || !canAccessResourceOrg(req, user.organizationId)) {
      res.status(404).json({ error: 'Usuário não encontrado no escopo.' });
      return;
    }
    if (user.id === req.auth!.user.id) {
      res.status(400).json({ error: 'Não é permitido desativar o próprio usuário ativo.' });
      return;
    }
    const { status } = req.body || {};
    if (status !== 'Ativo' && status !== 'Inativo') {
      res.status(400).json({ error: 'Status inválido.' });
      return;
    }
    user.status = status;
    store.audit(user.organizationId, req.auth!.user.id, 'USER_STATUS_UPDATED', 'User', user.id, { status });
    res.json(sanitizeUser(user));
  });

  app.get('/api/roles', requireAuth, (_req: Request, res: Response) => {
    const list = Object.entries(ROLE_PERMISSIONS).map(([name, permissions]) => ({
      id: name.toLowerCase().replace(/\s+/g, '-'),
      name,
      permissionsCount: permissions.length,
      permissions,
    }));
    res.json(list);
  });

  app.get('/api/permissions', requireAuth, (_req: Request, res: Response) => {
    const allPerms = Array.from(
      new Set(Object.values(ROLE_PERMISSIONS).flat().filter((p) => p !== '*'))
    ).sort();
    res.json(
      allPerms.map((code) => ({
        code,
        module: code.split('.')[0],
        action: code.split('.')[1] || 'access',
      }))
    );
  });

  // --- CLIENTS ---
  app.get('/api/clients', requirePermission('clients.read'), (req: Request, res: Response) => {
    const scope = resolveScopedOrg(req, req.query.organizationId as string | undefined);
    if (!scope.allowed) {
      res.status(403).json({ error: 'Acesso negado a clientes de outra organização.' });
      return;
    }
    let list = store.getState().clients.filter((c) => c.organizationId === scope.organizationId);
    if (req.auth!.user.role === 'Cliente') {
      list = list.filter((c) => c.id === req.auth!.clientId);
    }
    res.json(list);
  });

  app.post('/api/clients', requirePermission('clients.create'), (req: Request, res: Response) => {
    const scope = resolveScopedOrg(req, req.body?.organizationId);
    if (!scope.allowed) {
      res.status(403).json({ error: 'Não é permitido criar cliente em outra organização.' });
      return;
    }
    const { name, legalName, document, email, phone, website, segment, category, mrr } = req.body || {};
    if (!name || !email) {
      res.status(400).json({ error: 'Nome fantasia e e-mail do cliente são obrigatórios.' });
      return;
    }
    const client = {
      id: uid('cli'),
      organizationId: scope.organizationId,
      name: String(name).trim(),
      legalName: String(legalName || name).trim(),
      document: String(document || '').trim(),
      email: String(email).trim(),
      phone: String(phone || '').trim(),
      website: String(website || '').trim(),
      segment: String(segment || 'Geral').trim(),
      category: String(category || 'Pequena Empresa').trim(),
      status: 'Em Onboarding' as const,
      mrr: Math.max(0, Number(mrr) || 0),
      health: 'Novo' as const,
      manager: req.auth!.user.name,
      createdAt: new Date().toISOString(),
    };
    store.getState().clients.push(client);
    store.audit(scope.organizationId, req.auth!.user.id, 'CLIENT_CREATED', 'Client', client.id, { name: client.name });
    res.status(201).json(client);
  });

  app.patch('/api/clients/:id', requirePermission('clients.update'), (req: Request, res: Response) => {
    const client = store.getState().clients.find((c) => c.id === req.params.id);
    if (!client || !canAccessResourceOrg(req, client.organizationId)) {
      res.status(404).json({ error: 'Cliente não encontrado no escopo.' });
      return;
    }
    if (req.body?.status !== undefined && !VALID_CLIENT_STATUS.has(req.body.status)) {
      res.status(400).json({ error: 'Status de cliente inválido.' });
      return;
    }
    if (req.body?.health !== undefined && !VALID_CLIENT_HEALTH.has(req.body.health)) {
      res.status(400).json({ error: 'Health de cliente inválido.' });
      return;
    }
    if (req.body?.mrr !== undefined && (!Number.isFinite(Number(req.body.mrr)) || Number(req.body.mrr) < 0)) {
      res.status(400).json({ error: 'MRR inválido.' });
      return;
    }
    const allowedFields = ['name', 'legalName', 'document', 'email', 'phone', 'website', 'segment', 'category', 'status', 'mrr', 'health', 'manager'];
    for (const f of allowedFields) {
      if (req.body?.[f] !== undefined) {
        (client as unknown as Record<string, unknown>)[f] = f === 'mrr' ? Number(req.body[f]) : req.body[f];
      }
    }
    store.audit(client.organizationId, req.auth!.user.id, 'CLIENT_UPDATED', 'Client', client.id, {});
    res.json(client);
  });

  // --- LGPD GOVERNANCE (PORTABILITY EXPORT & PII ANONYMIZATION) ---
  app.get('/api/lgpd/clients/:id/export', requireAuth, (req: Request, res: Response) => {
    const state = store.getState();
    const client = state.clients.find((c) => c.id === req.params.id);
    if (!client) {
      res.status(404).json({ error: 'Titular/cliente não encontrado.' });
      return;
    }
    const isClientOwner = req.auth!.user.role === 'Cliente' && req.auth!.clientId === client.id && canAccessResourceOrg(req, client.organizationId);
    const isAuthorizedInternal = hasPermission(req.auth!.permissions, 'clients.read') && canAccessResourceOrg(req, client.organizationId);
    if (!isClientOwner && !isAuthorizedInternal) {
      res.status(403).json({ error: 'Acesso negado à exportação LGPD deste cliente.' });
      return;
    }

    const bundle = {
      exportedAt: new Date().toISOString(),
      legalBasis: 'LGPD Art. 18 (Portabilidade e Acesso aos Dados)',
      organizationId: client.organizationId,
      client,
      contracts: state.contracts.filter((c) => c.clientId === client.id && c.organizationId === client.organizationId),
      receivables: state.receivables.filter((r) => r.clientId === client.id && r.organizationId === client.organizationId),
      projects: state.projects.filter((p) => p.clientId === client.id && p.organizationId === client.organizationId),
      briefings: state.briefings.filter((b) => b.clientId === client.id && b.organizationId === client.organizationId),
      tickets: state.tickets.filter((t) => t.clientId === client.id && t.organizationId === client.organizationId),
      webPages: state.webPages.filter((w) => w.clientId === client.id && w.organizationId === client.organizationId),
      aiUsageCount: state.aiGateway.usageLogs.filter(
        (u) => u.clientId === client.id && u.organizationId === client.organizationId
      ).length,
    };

    store.audit(client.organizationId, req.auth!.user.id, 'LGPD_DATA_EXPORTED', 'Client', client.id, {
      exportedByRole: req.auth!.user.role,
    });
    res.json(bundle);
  });

  app.post('/api/lgpd/clients/:id/anonymize', requirePermission('clients.update'), (req: Request, res: Response) => {
    if (!['Super Admin', 'Administrador'].includes(req.auth!.user.role)) {
      res.status(403).json({ error: 'Apenas Administradores podem executar anonimização LGPD.' });
      return;
    }
    const state = store.getState();
    const client = state.clients.find((c) => c.id === req.params.id);
    if (!client || !canAccessResourceOrg(req, client.organizationId)) {
      res.status(404).json({ error: 'Cliente não encontrado no escopo.' });
      return;
    }

    const origEmail = client.email.toLowerCase();
    const anonTag = `ANONIMIZADO_${client.id}`;

    // Anonymize PII on Client while preserving financial/fiscal foreign keys & audit integrity
    client.name = `Cliente Anonimizado (${client.id})`;
    client.legalName = anonTag;
    client.document = '***.***.***-**';
    client.email = `${client.id}@anonimizado.lgpd.local`;
    client.phone = '';
    client.website = '';
    client.status = 'Inativo';

    // Anonymize matching Leads & Receivables client display name
    for (const lead of state.leads) {
      if (lead.organizationId === client.organizationId && lead.email.toLowerCase() === origEmail) {
        lead.name = 'Titular Anonimizado (LGPD)';
        lead.email = `${lead.id}@anonimizado.lgpd.local`;
        lead.phone = '';
      }
    }
    for (const rec of state.receivables) {
      if (rec.organizationId === client.organizationId && rec.clientId === client.id) {
        rec.clientName = client.name;
      }
    }

    // Deactivate linked portal users & revoke active sessions + purge client AI memory
    const affectedUserIds = new Set<string>();
    for (const usr of state.users) {
      if (usr.organizationId === client.organizationId && usr.clientId === client.id) {
        usr.name = 'Usuário Anonimizado (LGPD)';
        usr.email = `${usr.id}@anonimizado.lgpd.local`;
        usr.status = 'Inativo';
        affectedUserIds.add(usr.id);
      }
    }
    for (const ses of state.sessions) {
      if (affectedUserIds.has(ses.userId) && !ses.revokedAt) {
        ses.revokedAt = new Date().toISOString();
      }
    }
    state.aiGateway.memories = state.aiGateway.memories.filter(
      (m) => !(m.organizationId === client.organizationId && m.clientId === client.id)
    );

    store.audit(client.organizationId, req.auth!.user.id, 'LGPD_CLIENT_ANONYMIZED', 'Client', client.id, {
      deactivatedUsers: affectedUserIds.size,
      legalRetentionNote: 'Registros fiscais/financeiros mantidos sem PII pessoal conforme obrigação legal.',
    });
    res.json({ success: true, clientId: client.id, deactivatedUsers: affectedUserIds.size });
  });

  // --- AUDIT LOGS ---
  app.get('/api/audit-logs', requirePermission('audit.read'), (req: Request, res: Response) => {
    const scope = resolveScopedOrg(req, req.query.organizationId as string | undefined);
    if (!scope.allowed) {
      res.status(403).json({ error: 'Acesso negado aos logs de outra organização.' });
      return;
    }
    res.json(store.getState().auditLogs.filter((l) => l.organizationId === scope.organizationId));
  });

  // --- NER BUSINESS: LEADS, PIPELINE, DIGITAL STUDIO PLANS, PROPOSALS, CONTRACTS, FINANCE ---
  app.get('/api/leads', requirePermission('leads.read'), (req: Request, res: Response) => {
    const scope = resolveScopedOrg(req, req.query.organizationId as string | undefined);
    if (!scope.allowed) {
      res.status(403).json({ error: 'Acesso negado a leads de outra organização.' });
      return;
    }
    res.json(store.getState().leads.filter((l) => l.organizationId === scope.organizationId));
  });

  app.post('/api/leads', requirePermission('leads.create'), (req: Request, res: Response) => {
    const scope = resolveScopedOrg(req, req.body?.organizationId);
    if (!scope.allowed) {
      res.status(403).json({ error: 'Não é permitido criar lead em outra organização.' });
      return;
    }
    const { name, email, phone, company, segment, source, estimatedValue, utmCampaign } = req.body || {};
    if (!name || !email || !company) {
      res.status(400).json({ error: 'Nome, e-mail e empresa são obrigatórios.' });
      return;
    }
    const state = store.getState();
    const lead = {
      id: uid('lead'),
      organizationId: scope.organizationId,
      name: String(name).trim(),
      email: String(email).trim(),
      phone: String(phone || '').trim(),
      company: String(company).trim(),
      segment: String(segment || 'Geral').trim(),
      source: String(source || 'Direto').trim(),
      utmCampaign: utmCampaign ? String(utmCampaign).trim() : undefined,
      status: 'Novo',
      estimatedValue: Math.max(0, Number(estimatedValue) || 0),
      assignedUserId: req.auth!.user.id,
      createdAt: new Date().toISOString(),
    };
    state.leads.unshift(lead);

    const wf = state.workflows.find(
      (w) => w.organizationId === scope.organizationId && w.trigger === 'lead.created' && w.status === 'Ativo'
    );
    if (wf) {
      wf.executions += 1;
      wf.lastRunAt = new Date().toISOString();
    }

    store.audit(scope.organizationId, req.auth!.user.id, 'LEAD_CREATED', 'Lead', lead.id, { company: lead.company });
    res.status(201).json(lead);
  });

  app.post('/api/leads/:id/convert', requirePermission('leads.update'), (req: Request, res: Response) => {
    const state = store.getState();
    const lead = state.leads.find((l) => l.id === req.params.id);
    if (!lead || !canAccessResourceOrg(req, lead.organizationId)) {
      res.status(404).json({ error: 'Lead não encontrado no escopo.' });
      return;
    }
    lead.status = 'Convertido';
    const existingClient = state.clients.find(
      (c) => c.organizationId === lead.organizationId && c.email.toLowerCase() === lead.email.toLowerCase()
    );
    const client =
      existingClient ||
      (() => {
        const c = {
          id: uid('cli'),
          organizationId: lead.organizationId,
          name: lead.company,
          legalName: lead.company,
          document: '',
          email: lead.email,
          phone: lead.phone,
          website: '',
          segment: lead.segment,
          category: 'Pequena Empresa',
          status: 'Em Onboarding' as const,
          mrr: 0,
          health: 'Novo' as const,
          manager: req.auth!.user.name,
          createdAt: new Date().toISOString(),
        };
        state.clients.push(c);
        return c;
      })();

    const opportunity = {
      id: uid('opp'),
      organizationId: lead.organizationId,
      name: `${lead.company} • Oportunidade Comercial`,
      clientId: client.id,
      leadId: lead.id,
      stage: 'Qualificação',
      value: lead.estimatedValue,
      probability: 40,
      responsible: req.auth!.user.name,
      expectedClose: new Date(Date.now() + 15 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10),
      history: [{ stage: 'Qualificação', changedAt: new Date().toISOString(), changedBy: req.auth!.user.name }],
    };
    state.opportunities.push(opportunity);
    store.audit(lead.organizationId, req.auth!.user.id, 'LEAD_CONVERTED', 'Lead', lead.id, {
      clientId: client.id,
      opportunityId: opportunity.id,
    });
    res.json({ lead, client, opportunity });
  });

  app.get('/api/opportunities', requirePermission('opportunities.read'), (req: Request, res: Response) => {
    const scope = resolveScopedOrg(req, req.query.organizationId as string | undefined);
    if (!scope.allowed) {
      res.status(403).json({ error: 'Acesso negado a oportunidades de outra organização.' });
      return;
    }
    res.json(store.getState().opportunities.filter((o) => o.organizationId === scope.organizationId));
  });

  app.post('/api/opportunities', requirePermission('opportunities.manage'), (req: Request, res: Response) => {
    const scope = resolveScopedOrg(req, req.body?.organizationId);
    if (!scope.allowed) {
      res.status(403).json({ error: 'Acesso negado.' });
      return;
    }
    const { name, clientId, stage, value, probability } = req.body || {};
    if (!name) {
      res.status(400).json({ error: 'Nome da oportunidade é obrigatório.' });
      return;
    }
    if (clientId) {
      const cli = store.getState().clients.find((c) => c.id === clientId && c.organizationId === scope.organizationId);
      if (!cli) {
        res.status(404).json({ error: 'Cliente informado não pertence à organização ativa.' });
        return;
      }
    }
    const opp = {
      id: uid('opp'),
      organizationId: scope.organizationId,
      name: String(name).trim(),
      clientId: clientId || undefined,
      stage: String(stage || 'Novo lead'),
      value: Math.max(0, Number(value) || 0),
      probability: Math.min(100, Math.max(0, Number(probability) || 30)),
      responsible: req.auth!.user.name,
      expectedClose: new Date(Date.now() + 20 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10),
      history: [{ stage: String(stage || 'Novo lead'), changedAt: new Date().toISOString(), changedBy: req.auth!.user.name }],
    };
    store.getState().opportunities.push(opp);
    store.audit(scope.organizationId, req.auth!.user.id, 'OPPORTUNITY_CREATED', 'Opportunity', opp.id, {});
    res.status(201).json(opp);
  });

  app.patch('/api/opportunities/:id', requirePermission('opportunities.manage'), (req: Request, res: Response) => {
    const opp = store.getState().opportunities.find((o) => o.id === req.params.id);
    if (!opp || !canAccessResourceOrg(req, opp.organizationId)) {
      res.status(404).json({ error: 'Oportunidade não encontrada no escopo.' });
      return;
    }
    const { stage, probability, value } = req.body || {};
    if (stage && stage !== opp.stage) {
      opp.stage = String(stage);
      opp.history.push({ stage: opp.stage, changedAt: new Date().toISOString(), changedBy: req.auth!.user.name });
    }
    if (probability !== undefined) opp.probability = Math.min(100, Math.max(0, Number(probability)));
    if (value !== undefined) opp.value = Math.max(0, Number(value));
    store.audit(opp.organizationId, req.auth!.user.id, 'OPPORTUNITY_UPDATED', 'Opportunity', opp.id, { stage: opp.stage });
    res.json(opp);
  });

  // --- COMMERCIAL PLANS (NER DIGITAL STUDIO) ---
  app.get('/api/plans', requirePermission('plans.read'), (_req: Request, res: Response) => {
    res.json(store.getState().commercialPlans);
  });

  // Backward-compatible alias
  app.get('/api/services', requirePermission('plans.read'), (_req: Request, res: Response) => {
    res.json(store.getState().commercialPlans);
  });

  app.post('/api/plans', requirePermission('plans.manage'), (req: Request, res: Response) => {
    const { code, name, targetAudience, category, serviceTemplateType, setupPrice, recurringPrice, recurrence, deliverables, limits } =
      req.body || {};
    if (!code || !name) {
      res.status(400).json({ error: 'Código e nome do plano são obrigatórios.' });
      return;
    }
    const state = store.getState();
    const normCode = String(code).trim().toUpperCase();
    if (state.commercialPlans.some((p) => p.code === normCode)) {
      res.status(409).json({ error: 'Já existe um plano com este código.' });
      return;
    }
    const plan = {
      id: uid('plan'),
      code: normCode,
      name: String(name).trim(),
      targetAudience: String(targetAudience || 'Empresas').trim(),
      category: category || 'Landing Pages',
      serviceTemplateType: serviceTemplateType || 'Landing Page',
      setupPrice: Math.max(0, Number(setupPrice) || 0),
      recurringPrice: Math.max(0, Number(recurringPrice) || 0),
      recurrence: recurrence || 'Mensal',
      deliverables: Array.isArray(deliverables) ? deliverables : ['Entrega padrão configurada'],
      limits: limits || { landingPages: 1, sites: 1, users: 2, storageGb: 5 },
      isActive: true,
      updatedAt: new Date().toISOString(),
    };
    state.commercialPlans.push(plan);
    store.audit(req.auth!.organizationId, req.auth!.user.id, 'COMMERCIAL_PLAN_CREATED', 'CommercialPlan', plan.id, {
      code: plan.code,
      setupPrice: plan.setupPrice,
      recurringPrice: plan.recurringPrice,
    });
    res.status(201).json(plan);
  });

  app.patch('/api/plans/:id', requirePermission('plans.manage'), (req: Request, res: Response) => {
    const plan = store.getState().commercialPlans.find((p) => p.id === req.params.id);
    if (!plan) {
      res.status(404).json({ error: 'Plano comercial não encontrado.' });
      return;
    }
    const { name, targetAudience, category, serviceTemplateType, setupPrice, recurringPrice, recurrence, deliverables, limits, isActive } =
      req.body || {};
    if (name !== undefined) plan.name = String(name).trim();
    if (targetAudience !== undefined) plan.targetAudience = String(targetAudience).trim();
    if (category !== undefined) plan.category = category;
    if (serviceTemplateType !== undefined) plan.serviceTemplateType = serviceTemplateType;
    if (setupPrice !== undefined) plan.setupPrice = Math.max(0, Number(setupPrice));
    if (recurringPrice !== undefined) plan.recurringPrice = Math.max(0, Number(recurringPrice));
    if (recurrence !== undefined) plan.recurrence = recurrence;
    if (Array.isArray(deliverables)) plan.deliverables = deliverables;
    if (limits && typeof limits === 'object') plan.limits = { ...plan.limits, ...limits };
    if (typeof isActive === 'boolean') plan.isActive = isActive;
    plan.updatedAt = new Date().toISOString();

    store.audit(req.auth!.organizationId, req.auth!.user.id, 'COMMERCIAL_PLAN_UPDATED', 'CommercialPlan', plan.id, {
      code: plan.code,
      setupPrice: plan.setupPrice,
      recurringPrice: plan.recurringPrice,
    });
    res.json(plan);
  });

  // Plan contraction -> Auto Contract + Project + Template Deliverables + Tasks
  app.post('/api/digital-studio/contract', requirePermission('contracts.manage'), (req: Request, res: Response) => {
    const scope = resolveScopedOrg(req, req.body?.organizationId);
    if (!scope.allowed) {
      res.status(403).json({ error: 'Não é permitido contratar plano em outra organização.' });
      return;
    }
    const { clientId, planId, planCode, customProjectName, dueDate } = req.body || {};
    if (!clientId || (!planId && !planCode)) {
      res.status(400).json({ error: 'clientId e planId/planCode são obrigatórios.' });
      return;
    }
    try {
      const result = contractPlanAndCreateProject(store, {
        organizationId: scope.organizationId,
        clientId,
        planId,
        planCode,
        customProjectName,
        dueDate,
        actorUserId: req.auth!.user.id,
      });
      res.status(201).json(result);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : '';
      if (msg === 'CLIENT_NOT_FOUND_IN_ORG') {
        res.status(404).json({ error: 'Cliente não encontrado na organização ativa.' });
        return;
      }
      if (msg === 'PLAN_NOT_FOUND_OR_INACTIVE') {
        res.status(404).json({ error: 'Plano comercial não encontrado ou inativo.' });
        return;
      }
      res.status(500).json({ error: 'Erro ao contratar plano e criar projeto.' });
    }
  });

  // --- PROPOSALS ---
  app.get('/api/proposals', requirePermission('proposals.read'), (req: Request, res: Response) => {
    const scope = resolveScopedOrg(req, req.query.organizationId as string | undefined);
    if (!scope.allowed) {
      res.status(403).json({ error: 'Acesso negado a propostas de outra organização.' });
      return;
    }
    res.json(store.getState().proposals.filter((p) => p.organizationId === scope.organizationId));
  });

  app.post('/api/proposals', requirePermission('proposals.manage'), (req: Request, res: Response) => {
    const scope = resolveScopedOrg(req, req.body?.organizationId);
    if (!scope.allowed) {
      res.status(403).json({ error: 'Acesso negado.' });
      return;
    }
    const { clientId, title, setupValue, recurringValue, totalValue, validUntil, planCode } = req.body || {};
    if (!clientId || !title) {
      res.status(400).json({ error: 'Cliente e título da proposta são obrigatórios.' });
      return;
    }
    const state = store.getState();
    const client = state.clients.find((c) => c.id === clientId && c.organizationId === scope.organizationId);
    if (!client) {
      res.status(404).json({ error: 'Cliente não pertence à organização ativa.' });
      return;
    }
    const setup = Math.max(0, Number(setupValue) || 0);
    const recurring = Math.max(0, Number(recurringValue) || 0);
    const total = totalValue !== undefined ? Math.max(0, Number(totalValue)) : setup + recurring;
    const prop = {
      id: uid('prop'),
      organizationId: scope.organizationId,
      number: `PROP-${new Date().getFullYear()}-${String(state.proposals.length + 1).padStart(3, '0')}`,
      clientId,
      planCode: planCode || undefined,
      title: String(title).trim(),
      setupValue: setup,
      recurringValue: recurring,
      totalValue: total,
      status: 'Enviada' as const,
      validUntil: String(validUntil || new Date(Date.now() + 15 * 86400000).toISOString().slice(0, 10)),
      responsible: req.auth!.user.name,
      acceptedAt: null,
      acceptedBy: null,
      createdAt: new Date().toISOString(),
    };
    state.proposals.push(prop);
    store.audit(scope.organizationId, req.auth!.user.id, 'PROPOSAL_CREATED', 'Proposal', prop.id, { number: prop.number });
    res.status(201).json(prop);
  });

  app.patch('/api/proposals/:id/accept', requirePermission('proposals.manage'), (req: Request, res: Response) => {
    const state = store.getState();
    const prop = state.proposals.find((p) => p.id === req.params.id);
    if (!prop || !canAccessResourceOrg(req, prop.organizationId)) {
      res.status(404).json({ error: 'Proposta não encontrada no escopo.' });
      return;
    }
    if (prop.status === 'Aceita') {
      res.status(409).json({ error: 'Proposta já foi aceita anteriormente.' });
      return;
    }
    prop.status = 'Aceita';
    prop.acceptedAt = new Date().toISOString();
    prop.acceptedBy = req.auth!.user.name;

    const matchedPlan = prop.planCode
      ? state.commercialPlans.find((pl) => pl.code === prop.planCode)
      : undefined;

    const contract = {
      id: uid('cnt'),
      organizationId: prop.organizationId,
      number: `CNT-${new Date().getFullYear()}-${String(state.contracts.length + 11).padStart(3, '0')}`,
      clientId: prop.clientId,
      proposalId: prop.id,
      planCode: prop.planCode,
      serviceType: (matchedPlan?.serviceTemplateType || 'Performance') as 'Performance' | 'Landing Page' | 'Site' | 'E-commerce' | 'Software',
      title: prop.title,
      setupValue: prop.setupValue,
      recurringValue: prop.recurringValue,
      value: prop.totalValue,
      recurrence: matchedPlan?.recurrence || 'Mensal',
      status: 'Ativo' as const,
      startDate: new Date().toISOString().slice(0, 10),
      endDate: new Date(Date.now() + 365 * 86400000).toISOString().slice(0, 10),
    };
    state.contracts.push(contract);

    // Create corresponding honorários receivable if proposal has positive value (preserving zero mediaBudget)
    let receivable = null;
    if (prop.totalValue > 0) {
      const client = state.clients.find((c) => c.id === prop.clientId);
      receivable = {
        id: uid('rec'),
        organizationId: prop.organizationId,
        clientId: prop.clientId,
        clientName: client?.name || prop.clientId,
        contractId: contract.id,
        description: `Proposta ${prop.number} • ${prop.title}`,
        amount: prop.totalValue,
        paidAmount: 0,
        dueDate: new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10),
        status: 'Pendente' as const,
        paidAt: null,
        mediaBudget: 0,
      };
      state.receivables.push(receivable);
    }

    store.audit(prop.organizationId, req.auth!.user.id, 'PROPOSAL_ACCEPTED', 'Proposal', prop.id, { contractId: contract.id });
    res.json({ proposal: prop, contract, receivable });
  });

  // --- CONTRACTS ---
  app.get('/api/contracts', requirePermission('contracts.read'), (req: Request, res: Response) => {
    const scope = resolveScopedOrg(req, req.query.organizationId as string | undefined);
    if (!scope.allowed) {
      res.status(403).json({ error: 'Acesso negado a contratos de outra organização.' });
      return;
    }
    let list = store.getState().contracts.filter((c) => c.organizationId === scope.organizationId);
    if (req.auth!.user.role === 'Cliente') {
      list = list.filter((c) => c.clientId === req.auth!.clientId);
    }
    res.json(list);
  });

  // --- FINANCE (STRICT AGENCY REVENUE VS CLIENT MEDIA BUDGET SEPARATION) ---
  app.get('/api/finance/summary', requirePermission('finance.read'), (req: Request, res: Response) => {
    const scope = resolveScopedOrg(req, req.query.organizationId as string | undefined);
    if (!scope.allowed) {
      res.status(403).json({ error: 'Acesso negado ao financeiro de outra organização.' });
      return;
    }
    const state = store.getState();
    let orgReceivables = state.receivables.filter((r) => r.organizationId === scope.organizationId);
    if (req.auth!.user.role === 'Cliente') {
      orgReceivables = orgReceivables.filter((r) => r.clientId === req.auth!.clientId);
    }
    const orgPayables =
      req.auth!.user.role === 'Cliente'
        ? []
        : state.payables.filter((p) => p.organizationId === scope.organizationId);

    // Strictly sum ONLY agency fees/setup; mediaBudget NEVER enters agencyRevenue!
    const agencyRevenue = orgReceivables.reduce((sum, r) => sum + r.amount, 0);
    const receivedRevenue = orgReceivables.reduce((sum, r) => sum + r.paidAmount, 0);
    const pendingReceivables = orgReceivables.reduce((sum, r) => sum + Math.max(0, r.amount - r.paidAmount), 0);
    const mediaBudgetSeparated = orgReceivables.reduce((sum, r) => sum + (r.mediaBudget || 0), 0);
    const totalPayable = orgPayables.reduce((sum, p) => sum + p.amount, 0);
    const netOperatingResult = agencyRevenue - totalPayable;
    const operatingMarginPct = agencyRevenue > 0 ? ((netOperatingResult / agencyRevenue) * 100).toFixed(1) : '0.0';

    res.json({
      agencyRevenue,
      receivedRevenue,
      pendingReceivables,
      mediaBudgetSeparated,
      totalPayable,
      netOperatingResult,
      operatingMargin: `${operatingMarginPct}%`,
      separationRule: 'Verba de Mídia (Ads) contabilizada exclusivamente em conta separada do cliente.',
    });
  });

  app.get('/api/finance/receivables', requirePermission('finance.read'), (req: Request, res: Response) => {
    const scope = resolveScopedOrg(req, req.query.organizationId as string | undefined);
    if (!scope.allowed) {
      res.status(403).json({ error: 'Acesso negado.' });
      return;
    }
    let list = store.getState().receivables.filter((r) => r.organizationId === scope.organizationId);
    if (req.auth!.user.role === 'Cliente') {
      list = list.filter((r) => r.clientId === req.auth!.clientId);
    }
    res.json(list);
  });

  app.post('/api/finance/receivables/:id/payments', requirePermission('finance.manage'), (req: Request, res: Response) => {
    const state = store.getState();
    const rec = state.receivables.find((r) => r.id === req.params.id);
    if (!rec || !canAccessResourceOrg(req, rec.organizationId)) {
      res.status(404).json({ error: 'Título a receber não encontrado no escopo.' });
      return;
    }
    const { amount, method, reference } = req.body || {};
    const payAmt = Number(amount);
    if (!Number.isFinite(payAmt) || payAmt <= 0) {
      res.status(400).json({ error: 'Valor de pagamento inválido.' });
      return;
    }
    if (!method) {
      res.status(400).json({ error: 'Método de pagamento obrigatório.' });
      return;
    }
    rec.paidAmount = Math.min(rec.amount, rec.paidAmount + payAmt);
    rec.paymentMethod = String(method);
    rec.paymentRef = reference ? String(reference) : `PAY-${Date.now()}`;
    rec.paidAt = new Date().toISOString();
    rec.status = rec.paidAmount >= rec.amount ? 'Pago' : 'Parcialmente pago';

    // Unlock commissions tied to same contract if fully paid
    if (rec.status === 'Pago' && rec.contractId) {
      state.commissions
        .filter((c) => c.contractId === rec.contractId && c.status === 'Aguardando recebimento')
        .forEach((c) => {
          c.status = 'Disponível';
        });
    }

    store.audit(rec.organizationId, req.auth!.user.id, 'RECEIVABLE_PAYMENT_RECORDED', 'Receivable', rec.id, {
      amountPaid: payAmt,
      method: rec.paymentMethod,
      status: rec.status,
    });
    res.json(rec);
  });

  app.get('/api/finance/payables', requirePermission('finance.read'), (req: Request, res: Response) => {
    if (req.auth!.user.role === 'Cliente') {
      res.status(403).json({ error: 'Clientes não têm acesso às contas a pagar da agência.' });
      return;
    }
    const scope = resolveScopedOrg(req, req.query.organizationId as string | undefined);
    if (!scope.allowed) {
      res.status(403).json({ error: 'Acesso negado.' });
      return;
    }
    res.json(store.getState().payables.filter((p) => p.organizationId === scope.organizationId));
  });

  app.patch('/api/finance/payables/:id/pay', requirePermission('finance.manage'), (req: Request, res: Response) => {
    const pay = store.getState().payables.find((p) => p.id === req.params.id);
    if (!pay || !canAccessResourceOrg(req, pay.organizationId)) {
      res.status(404).json({ error: 'Despesa não encontrada.' });
      return;
    }
    pay.status = 'Pago';
    store.audit(pay.organizationId, req.auth!.user.id, 'PAYABLE_MARKED_PAID', 'Payable', pay.id, {});
    res.json(pay);
  });

  app.get('/api/commissions', requirePermission('finance.read'), (req: Request, res: Response) => {
    if (req.auth!.user.role === 'Cliente') {
      res.status(403).json({ error: 'Acesso negado.' });
      return;
    }
    const scope = resolveScopedOrg(req, req.query.organizationId as string | undefined);
    if (!scope.allowed) {
      res.status(403).json({ error: 'Acesso negado.' });
      return;
    }
    res.json(store.getState().commissions.filter((c) => c.organizationId === scope.organizationId));
  });

  // --- NER PROJECTS ---
  app.get('/api/projects', requirePermission('projects.read'), (req: Request, res: Response) => {
    const scope = resolveScopedOrg(req, req.query.organizationId as string | undefined);
    if (!scope.allowed) {
      res.status(403).json({ error: 'Acesso negado a projetos de outra organização.' });
      return;
    }
    let list = store.getState().projects.filter((p) => p.organizationId === scope.organizationId);
    if (req.auth!.user.role === 'Cliente') {
      list = list.filter((p) => p.clientId === req.auth!.clientId);
    }
    res.json(list);
  });

  app.post('/api/projects', requirePermission('projects.create'), (req: Request, res: Response) => {
    const scope = resolveScopedOrg(req, req.body?.organizationId);
    if (!scope.allowed) {
      res.status(403).json({ error: 'Acesso negado.' });
      return;
    }
    const { clientId, name, projectType, priority, dueDate } = req.body || {};
    if (!clientId || !name) {
      res.status(400).json({ error: 'Cliente e nome do projeto são obrigatórios.' });
      return;
    }
    const state = store.getState();
    const client = state.clients.find((c) => c.id === clientId && c.organizationId === scope.organizationId);
    if (!client) {
      res.status(404).json({ error: 'Cliente não encontrado na organização ativa.' });
      return;
    }
    const project = {
      id: uid('prj'),
      organizationId: scope.organizationId,
      clientId,
      contractId: null,
      planCode: null,
      name: String(name).trim(),
      projectType: projectType || 'NER Performance',
      status: 'Planejamento',
      priority: priority || 'Normal',
      startDate: new Date().toISOString().slice(0, 10),
      dueDate: String(dueDate || new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10)),
      managerId: req.auth!.user.id,
      progress: 0,
      createdAt: new Date().toISOString(),
    };
    state.projects.push(project);
    store.audit(scope.organizationId, req.auth!.user.id, 'PROJECT_CREATED', 'Project', project.id, { name: project.name });
    res.status(201).json(project);
  });

  app.get('/api/briefings', requirePermission('projects.read'), (req: Request, res: Response) => {
    const scope = resolveScopedOrg(req, req.query.organizationId as string | undefined);
    if (!scope.allowed) {
      res.status(403).json({ error: 'Acesso negado.' });
      return;
    }
    let list = store.getState().briefings.filter((b) => b.organizationId === scope.organizationId);
    if (req.auth!.user.role === 'Cliente') {
      list = list.filter((b) => b.clientId === req.auth!.clientId);
    }
    res.json(list);
  });

  app.post('/api/briefings', requirePermission('projects.update'), (req: Request, res: Response) => {
    const scope = resolveScopedOrg(req, req.body?.organizationId);
    if (!scope.allowed) {
      res.status(403).json({ error: 'Acesso negado.' });
      return;
    }
    const { projectId, title, objective, targetAudience, offerDetails } = req.body || {};
    const project = store.getState().projects.find((p) => p.id === projectId && p.organizationId === scope.organizationId);
    if (!project || !title || !objective) {
      res.status(400).json({ error: 'Projeto válido, título e objetivo são obrigatórios.' });
      return;
    }
    const brf = {
      id: uid('brf'),
      organizationId: scope.organizationId,
      projectId: project.id,
      clientId: project.clientId,
      title: String(title).trim(),
      objective: String(objective).trim(),
      targetAudience: String(targetAudience || '').trim(),
      offerDetails: offerDetails ? String(offerDetails) : undefined,
      status: 'Pendente' as const,
      createdAt: new Date().toISOString(),
    };
    store.getState().briefings.push(brf);
    store.audit(scope.organizationId, req.auth!.user.id, 'BRIEFING_CREATED', 'Briefing', brf.id, { projectId: project.id });
    res.status(201).json(brf);
  });

  app.get('/api/tasks', requirePermission('tasks.read'), (req: Request, res: Response) => {
    const scope = resolveScopedOrg(req, req.query.organizationId as string | undefined);
    if (!scope.allowed) {
      res.status(403).json({ error: 'Acesso negado.' });
      return;
    }
    let list = store.getState().tasks.filter((t) => t.organizationId === scope.organizationId);
    if (req.query.projectId) {
      list = list.filter((t) => t.projectId === req.query.projectId);
    }
    res.json(list);
  });

  app.post('/api/tasks', requirePermission('tasks.create'), (req: Request, res: Response) => {
    const scope = resolveScopedOrg(req, req.body?.organizationId);
    if (!scope.allowed) {
      res.status(403).json({ error: 'Acesso negado.' });
      return;
    }
    const { projectId, title, priority, dueDate, estimatedHours } = req.body || {};
    const project = store.getState().projects.find((p) => p.id === projectId && p.organizationId === scope.organizationId);
    if (!project || !title) {
      res.status(400).json({ error: 'Projeto válido e título da tarefa são obrigatórios.' });
      return;
    }
    const resolvedPriority = priority && VALID_TASK_PRIORITY.has(priority) ? priority : 'Normal';
    const task = {
      id: uid('tsk'),
      organizationId: scope.organizationId,
      projectId: project.id,
      title: String(title).trim(),
      status: 'A fazer' as const,
      priority: resolvedPriority,
      assigneeId: req.auth!.user.id,
      dueDate: String(dueDate || project.dueDate),
      estimatedHours: Math.max(0, Number(estimatedHours) || 4),
      actualHours: 0,
    };
    store.getState().tasks.push(task);
    recalculateProjectProgress(store, project.id);
    store.audit(scope.organizationId, req.auth!.user.id, 'TASK_CREATED', 'Task', task.id, { projectId: project.id });
    res.status(201).json(task);
  });

  app.patch('/api/tasks/:id', requirePermission('tasks.update'), (req: Request, res: Response) => {
    const task = store.getState().tasks.find((t) => t.id === req.params.id);
    if (!task || !canAccessResourceOrg(req, task.organizationId)) {
      res.status(404).json({ error: 'Tarefa não encontrada no escopo.' });
      return;
    }
    const { status, priority, actualHours, title } = req.body || {};
    if (status !== undefined) {
      if (!VALID_TASK_STATUS.has(status)) {
        res.status(400).json({ error: 'Status de tarefa inválido.' });
        return;
      }
      task.status = status;
    }
    if (priority !== undefined) {
      if (!VALID_TASK_PRIORITY.has(priority)) {
        res.status(400).json({ error: 'Prioridade de tarefa inválida.' });
        return;
      }
      task.priority = priority;
    }
    if (actualHours !== undefined) task.actualHours = Math.max(0, Number(actualHours) || 0);
    if (title !== undefined) task.title = String(title).trim();

    const progress = recalculateProjectProgress(store, task.projectId);
    store.audit(task.organizationId, req.auth!.user.id, 'TASK_UPDATED', 'Task', task.id, {
      status: task.status,
      projectProgress: progress,
    });
    res.json({ task, projectProgress: progress });
  });

  app.get('/api/deliverables', requirePermission('projects.read'), (req: Request, res: Response) => {
    const scope = resolveScopedOrg(req, req.query.organizationId as string | undefined);
    if (!scope.allowed) {
      res.status(403).json({ error: 'Acesso negado.' });
      return;
    }
    const state = store.getState();
    let list = state.deliverables.filter((d) => d.organizationId === scope.organizationId);
    if (req.auth!.user.role === 'Cliente') {
      const clientProjectIds = new Set(
        state.projects.filter((p) => p.clientId === req.auth!.clientId).map((p) => p.id)
      );
      list = list.filter((d) => clientProjectIds.has(d.projectId));
    }
    if (req.query.projectId) {
      list = list.filter((d) => d.projectId === req.query.projectId);
    }
    res.json(list);
  });

  app.post('/api/deliverables', requirePermission('projects.update'), (req: Request, res: Response) => {
    const scope = resolveScopedOrg(req, req.body?.organizationId);
    if (!scope.allowed) {
      res.status(403).json({ error: 'Acesso negado.' });
      return;
    }
    const { projectId, name, type, dueDate } = req.body || {};
    const project = store.getState().projects.find((p) => p.id === projectId && p.organizationId === scope.organizationId);
    if (!project || !name) {
      res.status(400).json({ error: 'Projeto válido e nome do entregável são obrigatórios.' });
      return;
    }
    const del = {
      id: uid('del'),
      organizationId: scope.organizationId,
      projectId: project.id,
      name: String(name).trim(),
      type: String(type || 'Entrega').trim(),
      version: 'v1.0',
      status: 'Planejado' as const,
      dueDate: String(dueDate || project.dueDate),
    };
    store.getState().deliverables.push(del);
    store.audit(scope.organizationId, req.auth!.user.id, 'DELIVERABLE_CREATED', 'Deliverable', del.id, { projectId: project.id });
    res.status(201).json(del);
  });

  // --- APPROVALS (VERSION-BOUND + CLIENT SCOPED) ---
  app.get('/api/approvals', requirePermission('approvals.read'), (req: Request, res: Response) => {
    const scope = resolveScopedOrg(req, req.query.organizationId as string | undefined);
    if (!scope.allowed) {
      res.status(403).json({ error: 'Acesso negado.' });
      return;
    }
    let list = store.getState().approvals.filter((a) => a.organizationId === scope.organizationId);
    if (req.auth!.user.role === 'Cliente') {
      list = list.filter((a) => a.clientId === req.auth!.clientId);
    }
    res.json(list);
  });

  app.post('/api/approvals', requirePermission('approvals.request'), (req: Request, res: Response) => {
    const scope = resolveScopedOrg(req, req.body?.organizationId);
    if (!scope.allowed) {
      res.status(403).json({ error: 'Acesso negado.' });
      return;
    }
    const { projectId, deliverableId, title, version } = req.body || {};
    const state = store.getState();
    const project = state.projects.find((p) => p.id === projectId && p.organizationId === scope.organizationId);
    if (!project || !title) {
      res.status(400).json({ error: 'Projeto válido e título da aprovação são obrigatórios.' });
      return;
    }
    if (deliverableId) {
      const del = state.deliverables.find(
        (d) => d.id === deliverableId && d.projectId === project.id && d.organizationId === scope.organizationId
      );
      if (!del) {
        res.status(404).json({ error: 'Entregável não encontrado neste projeto.' });
        return;
      }
    }
    const approval = {
      id: uid('app'),
      organizationId: scope.organizationId,
      projectId: project.id,
      clientId: project.clientId,
      deliverableId: deliverableId || undefined,
      title: String(title).trim(),
      version: String(version || 'v1.0'),
      requester: req.auth!.user.name,
      approver: 'Cliente',
      status: 'Pendente' as const,
      decidedAt: null,
      decidedByUserId: null,
    };
    state.approvals.push(approval);
    store.audit(scope.organizationId, req.auth!.user.id, 'APPROVAL_REQUESTED', 'Approval', approval.id, {
      version: approval.version,
    });
    res.status(201).json(approval);
  });

  app.patch('/api/approvals/:id', requirePermission('approvals.decide'), (req: Request, res: Response) => {
    const state = store.getState();
    const approval = state.approvals.find((a) => a.id === req.params.id);
    if (!approval || !canAccessClientResource(req, approval.organizationId, approval.clientId)) {
      res.status(403).json({ error: 'Aprovação não encontrada ou fora do escopo do cliente/organização.' });
      return;
    }
    const { status, comment, expectedVersion } = req.body || {};
    if (expectedVersion && expectedVersion !== approval.version) {
      res.status(409).json({
        error: `Conflito de versão: aprovação atual está em ${approval.version}, recebido ${expectedVersion}.`,
      });
      return;
    }
    if (!['Aprovado', 'Alterações solicitadas', 'Reprovado'].includes(status)) {
      res.status(400).json({ error: 'Status de decisão inválido.' });
      return;
    }
    approval.status = status;
    approval.comment = comment ? String(comment) : undefined;
    approval.decidedAt = new Date().toISOString();
    approval.decidedByUserId = req.auth!.user.id;
    approval.approver = req.auth!.user.name;

    if (approval.deliverableId) {
      const del = state.deliverables.find((d) => d.id === approval.deliverableId);
      if (del) {
        del.status = status === 'Aprovado' ? 'Aprovado' : 'Em produção';
      }
    }

    store.audit(approval.organizationId, req.auth!.user.id, 'APPROVAL_DECIDED', 'Approval', approval.id, {
      status,
      version: approval.version,
    });
    res.json(approval);
  });

  // --- TIME TRACKING ---
  app.get('/api/time-tracking', requirePermission('projects.read'), (req: Request, res: Response) => {
    const scope = resolveScopedOrg(req, req.query.organizationId as string | undefined);
    if (!scope.allowed) {
      res.status(403).json({ error: 'Acesso negado.' });
      return;
    }
    res.json(store.getState().timeTracking.filter((t) => t.organizationId === scope.organizationId));
  });

  app.post('/api/time-tracking', requirePermission('tasks.update'), (req: Request, res: Response) => {
    const scope = resolveScopedOrg(req, req.body?.organizationId);
    if (!scope.allowed) {
      res.status(403).json({ error: 'Acesso negado.' });
      return;
    }
    const { projectId, taskId, description, duration, billable, date } = req.body || {};
    const state = store.getState();
    const project = state.projects.find((p) => p.id === projectId && p.organizationId === scope.organizationId);
    if (!project || !description || Number(duration) <= 0) {
      res.status(400).json({ error: 'Projeto válido, descrição e duração positiva são obrigatórios.' });
      return;
    }
    if (taskId) {
      const tsk = state.tasks.find((t) => t.id === taskId && t.projectId === project.id && t.organizationId === scope.organizationId);
      if (!tsk) {
        res.status(404).json({ error: 'Tarefa informada não pertence ao projeto.' });
        return;
      }
    }
    const entry = {
      id: uid('tim'),
      organizationId: scope.organizationId,
      projectId: project.id,
      taskId: taskId || undefined,
      userId: req.auth!.user.id,
      description: String(description).trim(),
      duration: Number(duration),
      billable: billable !== false,
      date: String(date || new Date().toISOString().slice(0, 10)),
    };
    state.timeTracking.push(entry);
    store.audit(scope.organizationId, req.auth!.user.id, 'TIME_LOGGED', 'TimeEntry', entry.id, { duration: entry.duration });
    res.status(201).json(entry);
  });

  // --- CREATIVES ---
  app.get('/api/creatives', requirePermission('creative.read'), (req: Request, res: Response) => {
    const scope = resolveScopedOrg(req, req.query.organizationId as string | undefined);
    if (!scope.allowed) {
      res.status(403).json({ error: 'Acesso negado.' });
      return;
    }
    let list = store.getState().creatives.filter((c) => c.organizationId === scope.organizationId);
    if (req.auth!.user.role === 'Cliente') {
      list = list.filter((c) => c.clientId === req.auth!.clientId);
    }
    res.json(list);
  });

  app.post('/api/creatives', requirePermission('creative.manage'), (req: Request, res: Response) => {
    const scope = resolveScopedOrg(req, req.body?.organizationId);
    if (!scope.allowed) {
      res.status(403).json({ error: 'Acesso negado.' });
      return;
    }
    const { clientId, name, format, platform, type, usageRights, scriptSummary } = req.body || {};
    const client = store.getState().clients.find((c) => c.id === clientId && c.organizationId === scope.organizationId);
    if (!client || !name) {
      res.status(400).json({ error: 'Cliente válido e nome do criativo são obrigatórios.' });
      return;
    }
    const asset = {
      id: uid('crt'),
      organizationId: scope.organizationId,
      clientId: client.id,
      name: String(name).trim(),
      client: client.name,
      format: format || '9:16',
      platform: String(platform || 'Meta Ads'),
      type: String(type || 'UGC'),
      version: 'v1.0',
      status: 'Em Revisão' as const,
      usageRights: usageRights || 'Próprio',
      scriptSummary: scriptSummary ? String(scriptSummary) : undefined,
    };
    store.getState().creatives.push(asset);
    store.audit(scope.organizationId, req.auth!.user.id, 'CREATIVE_CREATED', 'CreativeAsset', asset.id, {});
    res.status(201).json(asset);
  });

  app.patch('/api/creatives/:id', requirePermission('creative.manage'), (req: Request, res: Response) => {
    const asset = store.getState().creatives.find((c) => c.id === req.params.id);
    if (!asset || !canAccessResourceOrg(req, asset.organizationId)) {
      res.status(404).json({ error: 'Criativo não encontrado.' });
      return;
    }
    const { status, scriptSummary, bumpVersion } = req.body || {};
    if (bumpVersion) {
      const minor = Number(asset.version.split('.')[1] || 0) + 1;
      asset.version = `v1.${minor}`;
      asset.status = 'Em Revisão';
    } else if (status) {
      asset.status = status;
    }
    if (scriptSummary !== undefined) asset.scriptSummary = String(scriptSummary);
    store.audit(asset.organizationId, req.auth!.user.id, 'CREATIVE_UPDATED', 'CreativeAsset', asset.id, {
      version: asset.version,
      status: asset.status,
    });
    res.json(asset);
  });

  // --- PERFORMANCE (WITH STATISTICAL GUARDRAILS) ---
  app.get('/api/performance', requirePermission('performance.read'), (req: Request, res: Response) => {
    const scope = resolveScopedOrg(req, req.query.organizationId as string | undefined);
    if (!scope.allowed) {
      res.status(403).json({ error: 'Acesso negado.' });
      return;
    }
    let accounts = store.getState().adAccounts.filter((a) => a.organizationId === scope.organizationId);
    if (req.auth!.user.role === 'Cliente') {
      accounts = accounts.filter((a) => a.clientId === req.auth!.clientId);
    }
    const totalSpend = accounts.reduce((s, a) => s + a.spend, 0);
    const totalConversions = accounts.reduce((s, a) => s + a.conversions, 0);
    const averageRoas =
      accounts.length > 0 ? Number((accounts.reduce((s, a) => s + a.roas, 0) / accounts.length).toFixed(2)) : 0;

    const recommendations = accounts.map((a) => {
      if (a.conversions < 30 || a.clicks < 500) {
        return {
          accountId: a.id,
          accountName: a.name,
          status: 'DADOS INSUFICIENTES PARA RECOMENDAÇÃO',
          reason: `Amostra atual (${a.conversions} conversões / ${a.clicks} cliques) abaixo do mínimo estatístico (30 conversões e 500 cliques).`,
        };
      }
      if (a.roas >= 4.0) {
        return {
          accountId: a.id,
          accountName: a.name,
          status: 'ESCALA SUGERIDA (+15%)',
          reason: `ROAS observado de ${a.roas}x em ${a.conversions} conversões sustenta aumento gradual de teto diário.`,
        };
      }
      return {
        accountId: a.id,
        accountName: a.name,
        status: 'MANTER & OTIMIZAR CRIATIVOS',
        reason: `ROAS de ${a.roas}x dentro da meta operacional.`,
      };
    });

    res.json({
      adAccounts: accounts,
      summary: { totalSpend, totalConversions, averageRoas },
      recommendations,
    });
  });

  app.patch('/api/performance/accounts/:id/budget', requirePermission('performance.manage'), (req: Request, res: Response) => {
    const acc = store.getState().adAccounts.find((a) => a.id === req.params.id);
    if (!acc || !canAccessResourceOrg(req, acc.organizationId)) {
      res.status(404).json({ error: 'Conta de anúncio não encontrada.' });
      return;
    }
    const limit = Number(req.body?.dailyLimit);
    if (!Number.isFinite(limit) || limit <= 0) {
      res.status(400).json({ error: 'Limite diário deve ser maior que zero.' });
      return;
    }
    acc.dailyLimit = limit;
    store.audit(acc.organizationId, req.auth!.user.id, 'AD_ACCOUNT_BUDGET_UPDATED', 'AdAccount', acc.id, { dailyLimit: limit });
    res.json(acc);
  });

  // --- TRACKING & CAPI DEDUPLICATION ---
  app.get('/api/tracking/events', requirePermission('tracking.read'), (req: Request, res: Response) => {
    const scope = resolveScopedOrg(req, req.query.organizationId as string | undefined);
    if (!scope.allowed) {
      res.status(403).json({ error: 'Acesso negado.' });
      return;
    }
    res.json(store.getState().trackingEvents.filter((e) => e.organizationId === scope.organizationId));
  });

  app.post('/api/tracking/events', requirePermission('tracking.manage'), (req: Request, res: Response) => {
    const scope = resolveScopedOrg(req, req.body?.organizationId);
    if (!scope.allowed) {
      res.status(403).json({ error: 'Acesso negado.' });
      return;
    }
    const { clientId, eventId, eventName, source, utmCampaign, value, confirmedByPayment } = req.body || {};
    if (!clientId || !eventId || !eventName) {
      res.status(400).json({ error: 'clientId, eventId e eventName são obrigatórios para deduplicação.' });
      return;
    }
    const state = store.getState();
    const clientExists = state.clients.some((c) => c.id === clientId && c.organizationId === scope.organizationId);
    if (!clientExists) {
      res.status(404).json({ error: 'Cliente informado não pertence à organização ativa.' });
      return;
    }
    const existing = state.trackingEvents.find(
      (e) => e.organizationId === scope.organizationId && e.eventId === eventId
    );
    if (existing) {
      existing.deduplicatedCount += 1;
      store.save();
      res.json({ deduplicated: true, event: existing });
      return;
    }

    const evt = {
      id: uid('evt'),
      organizationId: scope.organizationId,
      clientId,
      eventId: String(eventId),
      eventName,
      source: String(source || 'Server CAPI'),
      utmCampaign: utmCampaign ? String(utmCampaign) : undefined,
      value: Math.max(0, Number(value) || 0),
      currency: 'BRL',
      // Purchase is only confirmed if payment confirmation flag is explicitly true
      confirmedByPayment: eventName === 'Purchase' ? Boolean(confirmedByPayment) : false,
      deduplicatedCount: 1,
      timestamp: new Date().toISOString(),
    };
    state.trackingEvents.unshift(evt);
    store.audit(scope.organizationId, req.auth!.user.id, 'TRACKING_EVENT_INGESTED', 'TrackingEvent', evt.id, {
      eventId: evt.eventId,
      eventName: evt.eventName,
    });
    res.status(201).json({ deduplicated: false, event: evt });
  });

  // --- AUTOMATION WORKFLOWS ---
  app.get('/api/workflows', requirePermission('automation.read'), (req: Request, res: Response) => {
    const scope = resolveScopedOrg(req, req.query.organizationId as string | undefined);
    if (!scope.allowed) {
      res.status(403).json({ error: 'Acesso negado.' });
      return;
    }
    res.json(store.getState().workflows.filter((w) => w.organizationId === scope.organizationId));
  });

  app.patch('/api/workflows/:id/toggle', requirePermission('automation.manage'), (req: Request, res: Response) => {
    const wf = store.getState().workflows.find((w) => w.id === req.params.id);
    if (!wf || !canAccessResourceOrg(req, wf.organizationId)) {
      res.status(404).json({ error: 'Workflow não encontrado.' });
      return;
    }
    if (wf.category === 'n8n' && !process.env.N8N_WEBHOOK_URL) {
      wf.status = 'Pendente de Configuração n8n';
      res.status(400).json({ error: 'N8N_WEBHOOK_URL não configurada no ambiente.' });
      return;
    }
    wf.status = wf.status === 'Ativo' ? 'Pausado' : 'Ativo';
    store.audit(wf.organizationId, req.auth!.user.id, 'WORKFLOW_TOGGLED', 'Workflow', wf.id, { status: wf.status });
    res.json(wf);
  });

  app.post('/api/workflows/:id/test', requirePermission('automation.manage'), async (req: Request, res: Response) => {
    const wf = store.getState().workflows.find((w) => w.id === req.params.id);
    if (!wf || !canAccessResourceOrg(req, wf.organizationId)) {
      res.status(404).json({ error: 'Workflow não encontrado.' });
      return;
    }
    if (wf.status === 'Pendente de Configuração n8n') {
      res.status(400).json({ error: 'Workflow externo n8n aguardando configuração de credenciais N8N_WEBHOOK_URL.' });
      return;
    }
    if (wf.category === 'n8n') {
      const targetUrl = process.env.N8N_WEBHOOK_URL;
      if (!targetUrl) {
        res.status(400).json({ error: 'N8N_WEBHOOK_URL não configurada no ambiente.' });
        return;
      }
      try {
        const dispatchRes = await fetch(targetUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            workflowId: wf.id,
            name: wf.name,
            trigger: wf.trigger,
            organizationId: wf.organizationId,
            test: true,
            dispatchedAt: new Date().toISOString(),
          }),
          signal: AbortSignal.timeout(8000),
        });
        if (!dispatchRes.ok) {
          res.status(502).json({ error: `Webhook n8n retornou HTTP ${dispatchRes.status}.` });
          return;
        }
      } catch (err: any) {
        res.status(502).json({ error: `Falha ao contatar N8N_WEBHOOK_URL: ${err?.message || 'erro de rede'}` });
        return;
      }
    }
    wf.executions += 1;
    wf.lastRunAt = new Date().toISOString();
    store.audit(wf.organizationId, req.auth!.user.id, 'WORKFLOW_TEST_EXECUTED', 'Workflow', wf.id, { executions: wf.executions });
    res.json({ success: true, workflow: wf });
  });

  // --- NER WEB (PAGES BUILDER + REAL LEAD CAPTURE) ---
  app.get('/api/web/pages', requirePermission('web.read'), (req: Request, res: Response) => {
    const scope = resolveScopedOrg(req, req.query.organizationId as string | undefined);
    if (!scope.allowed) {
      res.status(403).json({ error: 'Acesso negado.' });
      return;
    }
    res.json(store.getState().webPages.filter((w) => w.organizationId === scope.organizationId));
  });

  app.post('/api/web/pages', requirePermission('web.manage'), (req: Request, res: Response) => {
    const scope = resolveScopedOrg(req, req.body?.organizationId);
    if (!scope.allowed) {
      res.status(403).json({ error: 'Acesso negado.' });
      return;
    }
    const { clientId, title, slug, segment, pageType, domain, whatsappNumber, checkoutUrl } = req.body || {};
    if (!clientId || !title || !slug) {
      res.status(400).json({ error: 'clientId, título e slug são obrigatórios.' });
      return;
    }
    const state = store.getState();
    const clientExists = state.clients.some((c) => c.id === clientId && c.organizationId === scope.organizationId);
    if (!clientExists) {
      res.status(404).json({ error: 'Cliente informado não pertence à organização ativa.' });
      return;
    }
    const cleanSlug = String(slug).trim().toLowerCase().replace(/[^a-z0-9-]/g, '-');
    if (state.webPages.some((w) => w.slug === cleanSlug)) {
      res.status(409).json({ error: 'Slug já em uso por outra página.' });
      return;
    }
    const page = {
      id: uid('wp'),
      organizationId: scope.organizationId,
      clientId,
      title: String(title).trim(),
      slug: cleanSlug,
      segment: String(segment || 'Geral'),
      pageType: pageType || 'Landing Page Captura',
      domain: String(domain || `${cleanSlug}.nerpages.com`),
      sslStatus: 'Pendente DNS' as const,
      status: 'Rascunho' as const,
      version: 'v1.0',
      seoTitle: String(title).trim(),
      seoDescription: `Página oficial ${String(title).trim()}`,
      whatsappNumber: whatsappNumber ? String(whatsappNumber) : undefined,
      checkoutUrl: checkoutUrl ? String(checkoutUrl) : undefined,
      pixelConfigured: false,
      sections: [
        {
          id: uid('sec'),
          type: 'Hero',
          headline: String(title).trim(),
          subheadline: 'Oferta comercial estruturada no NER Digital Studio.',
          ctaText: 'Solicitar Orçamento',
        },
      ],
      visits: 0,
      leadsCaptured: 0,
    };
    state.webPages.push(page);
    store.audit(scope.organizationId, req.auth!.user.id, 'WEB_PAGE_CREATED', 'WebPage', page.id, { slug: page.slug });
    res.status(201).json(page);
  });

  app.patch('/api/web/pages/:id', requirePermission('web.manage'), (req: Request, res: Response) => {
    const page = store.getState().webPages.find((w) => w.id === req.params.id);
    if (!page || !canAccessResourceOrg(req, page.organizationId)) {
      res.status(404).json({ error: 'Página não encontrada.' });
      return;
    }
    if (req.body?.status !== undefined && !VALID_WEB_STATUS.has(req.body.status)) {
      res.status(400).json({ error: 'Status de página web inválido.' });
      return;
    }
    const fields = ['title', 'status', 'seoTitle', 'seoDescription', 'whatsappNumber', 'checkoutUrl', 'pixelConfigured', 'sections', 'domain'];
    for (const f of fields) {
      if (req.body?.[f] !== undefined) {
        (page as unknown as Record<string, unknown>)[f] = req.body[f];
      }
    }
    const minor = Number(page.version.split('.')[1] || 0) + 1;
    page.version = `v1.${minor}`;
    store.audit(page.organizationId, req.auth!.user.id, 'WEB_PAGE_UPDATED', 'WebPage', page.id, {
      status: page.status,
      version: page.version,
    });
    res.json(page);
  });

  // Public/form capture endpoint linking Web Page -> Business Lead + Tracking Event
  app.post('/api/web/pages/:id/submit-lead', (req: Request, res: Response) => {
    const state = store.getState();
    const page = state.webPages.find((w) => w.id === req.params.id);
    if (!page) {
      res.status(404).json({ error: 'Página não encontrada.' });
      return;
    }
    const { name, email, phone, company, utmCampaign } = req.body || {};
    if (!name || !email) {
      res.status(400).json({ error: 'Nome e e-mail são obrigatórios no formulário.' });
      return;
    }
    page.leadsCaptured += 1;
    const lead = {
      id: uid('lead'),
      organizationId: page.organizationId,
      name: String(name).trim(),
      email: String(email).trim(),
      phone: String(phone || '').trim(),
      company: String(company || name).trim(),
      segment: page.segment,
      source: `Landing Page (${page.slug})`,
      utmCampaign: utmCampaign ? String(utmCampaign) : undefined,
      status: 'Novo',
      estimatedValue: 3500,
      createdAt: new Date().toISOString(),
    };
    state.leads.unshift(lead);

    const eventId = `ev_lp_${page.id}_${Date.now()}_${crypto.randomBytes(2).toString('hex')}`;
    state.trackingEvents.unshift({
      id: uid('evt'),
      organizationId: page.organizationId,
      clientId: page.clientId,
      eventId,
      eventName: 'Lead',
      source: `Web Form (${page.slug})`,
      utmCampaign: utmCampaign ? String(utmCampaign) : undefined,
      value: 0,
      currency: 'BRL',
      confirmedByPayment: false,
      deduplicatedCount: 1,
      timestamp: new Date().toISOString(),
    });
    store.save();
    res.status(201).json({ success: true, leadId: lead.id, trackingEventId: eventId });
  });

  // --- NER INTELLIGENCE (EVIDENCE-BASED ANALYTICS) ---
  app.get('/api/intelligence/summary', requirePermission('intelligence.read'), (req: Request, res: Response) => {
    const scope = resolveScopedOrg(req, req.query.organizationId as string | undefined);
    if (!scope.allowed) {
      res.status(403).json({ error: 'Acesso negado.' });
      return;
    }
    const state = store.getState();
    const orgClients = state.clients.filter((c) => c.organizationId === scope.organizationId);
    const orgProjects = state.projects.filter((p) => p.organizationId === scope.organizationId);
    const orgReceivables = state.receivables.filter((r) => r.organizationId === scope.organizationId);
    const orgAccounts = state.adAccounts.filter((a) => a.organizationId === scope.organizationId);

    const observed = {
      activeClients: orgClients.filter((c) => c.status === 'Ativo').length,
      activeProjects: orgProjects.filter((p) => p.status !== 'Concluído').length,
      totalMediaSpend: orgAccounts.reduce((s, a) => s + a.spend, 0),
      totalConversions: orgAccounts.reduce((s, a) => s + a.conversions, 0),
      agencyBilled: orgReceivables.reduce((s, r) => s + r.amount, 0),
    };

    const calculated = {
      averageTicketAgency: orgClients.length > 0 ? Math.round(observed.agencyBilled / orgClients.length) : 0,
      blendedCpa: observed.totalConversions > 0 ? Number((observed.totalMediaSpend / observed.totalConversions).toFixed(2)) : 0,
      pendingApprovals: state.approvals.filter((a) => a.organizationId === scope.organizationId && a.status === 'Pendente').length,
    };

    const anomalies = [];
    const pendingCredentialsAccounts = orgAccounts.filter((a) => a.connectionStatus === 'Pendente de Credenciais');
    if (pendingCredentialsAccounts.length > 0) {
      anomalies.push({
        severity: 'Média',
        title: `${pendingCredentialsAccounts.length} conta(s) de anúncios pendente(s) de credenciais OAuth`,
        evidence: pendingCredentialsAccounts.map((a) => a.name).join(', '),
      });
    }
    const overdueRecs = orgReceivables.filter((r) => r.status === 'Pendente' && r.dueDate < new Date().toISOString().slice(0, 10));
    if (overdueRecs.length > 0) {
      anomalies.push({
        severity: 'Alta',
        title: `${overdueRecs.length} fatura(s) de honorários com vencimento expirado`,
        evidence: overdueRecs.map((r) => `${r.clientName} (R$ ${r.amount})`).join(', '),
      });
    }

    res.json({
      period: 'Últimos 30 dias (Dados Reais do Banco)',
      observed,
      calculated,
      anomalies,
    });
  });

  // --- CLIENT PORTAL TICKETS ---
  app.get('/api/tickets', requireAuth, (req: Request, res: Response) => {
    const scope = resolveScopedOrg(req, req.query.organizationId as string | undefined);
    if (!scope.allowed) {
      res.status(403).json({ error: 'Acesso negado.' });
      return;
    }
    let list = store.getState().tickets.filter((t) => t.organizationId === scope.organizationId);
    if (req.auth!.user.role === 'Cliente') {
      list = list.filter((t) => t.clientId === req.auth!.clientId);
    }
    res.json(list);
  });

  app.post('/api/tickets', requireAuth, (req: Request, res: Response) => {
    const scope = resolveScopedOrg(req, req.body?.organizationId);
    if (!scope.allowed) {
      res.status(403).json({ error: 'Acesso negado.' });
      return;
    }
    const { category, priority, subject, description, clientId } = req.body || {};
    const resolvedClientId = req.auth!.user.role === 'Cliente' ? req.auth!.clientId : clientId;
    if (!resolvedClientId || !subject || !description) {
      res.status(400).json({ error: 'Cliente, assunto e descrição são obrigatórios.' });
      return;
    }
    const clientExists = store.getState().clients.some(
      (c) => c.id === resolvedClientId && c.organizationId === scope.organizationId
    );
    if (!clientExists) {
      res.status(404).json({ error: 'Cliente informado não pertence à organização ativa.' });
      return;
    }
    const resolvedPriority = priority && VALID_TICKET_PRIORITY.has(priority) ? priority : 'Normal';
    const ticket = {
      id: uid('tkt'),
      organizationId: scope.organizationId,
      clientId: resolvedClientId,
      category: String(category || 'Geral'),
      priority: resolvedPriority,
      subject: String(subject).trim(),
      description: String(description).trim(),
      status: 'Aberto' as const,
      createdAt: new Date().toISOString(),
    };
    store.getState().tickets.unshift(ticket);
    store.audit(scope.organizationId, req.auth!.user.id, 'TICKET_CREATED', 'ClientTicket', ticket.id, { subject: ticket.subject });
    res.status(201).json(ticket);
  });

  app.patch('/api/tickets/:id', requireAuth, (req: Request, res: Response) => {
    if (req.auth!.user.role === 'Cliente') {
      res.status(403).json({ error: 'Apenas equipe interna pode alterar o status operacional do chamado.' });
      return;
    }
    const ticket = store.getState().tickets.find((t) => t.id === req.params.id);
    if (!ticket || !canAccessResourceOrg(req, ticket.organizationId)) {
      res.status(404).json({ error: 'Chamado não encontrado.' });
      return;
    }
    const { status } = req.body || {};
    if (status !== undefined) {
      if (!VALID_TICKET_STATUS.has(status)) {
        res.status(400).json({ error: 'Status de chamado inválido.' });
        return;
      }
      ticket.status = status;
    }
    store.audit(ticket.organizationId, req.auth!.user.id, 'TICKET_UPDATED', 'ClientTicket', ticket.id, { status: ticket.status });
    res.json(ticket);
  });

  // --- NER OPERATIONS & INCIDENTS ---
  app.get('/api/operations/overview', requirePermission('operations.read'), (req: Request, res: Response) => {
    const scope = resolveScopedOrg(req, req.query.organizationId as string | undefined);
    if (!scope.allowed) {
      res.status(403).json({ error: 'Acesso negado.' });
      return;
    }
    const state = store.getState();
    const mem = process.memoryUsage();
    res.json({
      uptimeSeconds: Math.floor(process.uptime()),
      memoryRssMb: Math.round(mem.rss / 1024 / 1024),
      nodeVersion: process.version,
      persistence: 'Atomic JSON File (database/data/ner-db.json)',
      incidents: state.incidents.filter((i) => i.organizationId === scope.organizationId),
      integrationsReadiness: [
        { name: 'Gemini AI (@google/genai)', configured: Boolean(process.env.GEMINI_API_KEY) },
        { name: 'Stripe Billing & Webhooks', configured: Boolean(process.env.STRIPE_SECRET_KEY && process.env.STRIPE_WEBHOOK_SECRET) },
        { name: 'PostgreSQL / Prisma (runtime driver)', configured: false },
        { name: 'Redis / BullMQ (runtime worker)', configured: false },
        { name: 'n8n External Automations', configured: Boolean(process.env.N8N_WEBHOOK_URL) },
      ],
    });
  });

  // --- NER SAAS BILLING & STRIPE WEBHOOKS ---
  app.get('/api/billing/subscription', requirePermission('billing.read'), (req: Request, res: Response) => {
    const scope = resolveScopedOrg(req, req.query.organizationId as string | undefined);
    if (!scope.allowed) {
      res.status(403).json({ error: 'Acesso negado.' });
      return;
    }
    const state = store.getState();
    const subscription = state.subscriptions.find((s) => s.organizationId === scope.organizationId) || null;
    const entitlements = getOrganizationEntitlements(store, scope.organizationId);
    const webhookEvents = state.billingWebhookEvents.filter(
      (e) => !e.organizationId || e.organizationId === scope.organizationId
    );
    res.json({
      subscription,
      entitlements,
      webhookEvents,
      stripeLiveConfigured: Boolean(process.env.STRIPE_SECRET_KEY && process.env.STRIPE_WEBHOOK_SECRET),
    });
  });

  app.post('/api/billing/checkout', requirePermission('billing.manage'), (req: Request, res: Response) => {
    const scope = resolveScopedOrg(req, req.body?.organizationId);
    if (!scope.allowed) {
      res.status(403).json({ error: 'Acesso negado.' });
      return;
    }
    const { planCode } = req.body || {};
    if (!planCode) {
      res.status(400).json({ error: 'planCode é obrigatório.' });
      return;
    }
    try {
      const result = createSaaSCheckoutSession(store, {
        organizationId: scope.organizationId,
        planCode: String(planCode),
        actorUserId: req.auth!.user.id,
      });
      res.json(result);
    } catch {
      res.status(404).json({ error: 'Plano SaaS não encontrado.' });
    }
  });

  // Real Stripe Webhook endpoint: HMAC-SHA256 signature verification + idempotent event processing
  app.post('/api/webhooks/stripe', (req: Request, res: Response) => {
    const sigHeader = req.headers['stripe-signature'] as string | undefined;
    const rawPayload = req.rawBody ?? Buffer.from(JSON.stringify(req.body || {}), 'utf8');
    const secret = getWebhookSecret();
    if (!secret) {
      res.status(503).json({ error: 'STRIPE_WEBHOOK_SECRET não configurado no ambiente de produção.' });
      return;
    }

    if (!stripeAdapter.verifySignature(rawPayload, sigHeader, secret)) {
      res.status(401).json({ error: 'Assinatura Stripe webhook inválida ou expirada.' });
      return;
    }

    try {
      const event = stripeAdapter.parseEvent(rawPayload);
      if (!event?.id || !event?.type) {
        res.status(400).json({ error: 'Payload Stripe malformado.' });
        return;
      }
      const outcome = processPaymentWebhook(store, event);
      res.json({
        received: true,
        duplicate: outcome.duplicate,
        eventRecord: outcome.record,
        subscription: outcome.subscription,
      });
    } catch {
      res.status(400).json({ error: 'Erro ao interpretar evento Stripe.' });
    }
  });

  // Dev/Sandbox webhook tester (uses real signature + idempotency service; disabled in production)
  app.post('/api/billing/sandbox-webhook', requirePermission('billing.manage'), (req: Request, res: Response) => {
    if (process.env.NODE_ENV === 'production') {
      res.status(403).json({ error: 'Simulador desabilitado em produção.' });
      return;
    }
    const scope = resolveScopedOrg(req, req.body?.organizationId);
    if (!scope.allowed) {
      res.status(403).json({ error: 'Acesso negado.' });
      return;
    }
    const { eventId, eventType, planCode } = req.body || {};
    const payload = JSON.stringify({
      id: eventId || `evt_sandbox_${Date.now()}`,
      type: eventType || 'invoice.payment_succeeded',
      data: {
        object: {
          subscription: `sub_sandbox_${scope.organizationId}`,
          customer: `cus_sandbox_${scope.organizationId}`,
          payment_status: 'paid',
          amount_paid: 199000,
          current_period_end: Math.floor((Date.now() + 30 * 86400000) / 1000),
          metadata: {
            organizationId: scope.organizationId,
            planCode: planCode || undefined,
          },
        },
      },
    });
    const secret = getWebhookSecret();
    if (!secret || !stripeAdapter.verifySignature(payload, buildStripeSignatureHeader(payload, secret), secret)) {
      res.status(500).json({ error: 'Falha interna de verificação HMAC.' });
      return;
    }
    const outcome = processPaymentWebhook(store, stripeAdapter.parseEvent(payload));
    res.json({
      sandbox: true,
      duplicate: outcome.duplicate,
      eventRecord: outcome.record,
      subscription: outcome.subscription,
    });
  });

  // --- NER AI GATEWAY (CENTRALIZED MULTI-PROVIDER INFRASTRUCTURE) ---
  const aiGateway = new AiGatewayService(store, {
    adapters: options.aiAdapters,
    masterKeyOverride: options.aiMasterKeyOverride,
  });
  app.use('/api/ai', createAiGatewayRouter(store, aiGateway));

  return { app, store, aiGateway };
}
