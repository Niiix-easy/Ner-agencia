import { Router, Request, Response } from 'express';
import { PersistentStore } from '../store.ts';
import {
  hasPermission,
  requireAuth,
  requirePermission,
  resolveScopedOrg,
} from '../middleware/auth.ts';
import { hasMasterEncryptionKey, getEnvFallbackForProvider } from './credentials.ts';
import { AiGatewayService } from './gateway.ts';
import { AiUpstreamError } from './observability.ts';
import { UsageFilterOptions, UsagePeriodFilter } from './cost-usage.ts';
import { ExportSegmentMode } from './exporters.ts';
import { AiBillingCategory, AiDepartment, AiProviderId, AiPurpose, PURPOSE_CAPABILITY_RULES } from './types.ts';

const VALID_PROVIDERS = new Set<AiProviderId>([
  'openai',
  'anthropic',
  'deepseek',
  'gemini',
  'openrouter',
  'ollama',
  'vllm',
  'huggingface',
]);

const VALID_PERIODS = new Set<UsagePeriodFilter>([
  'today',
  'yesterday',
  '7d',
  '30d',
  'current_month',
  'previous_month',
  'custom',
  'all',
]);

function parseUsageFilter(query: Request['query']): UsageFilterOptions {
  const rawPeriod = String(query.period || 'all') as UsagePeriodFilter;
  return {
    period: VALID_PERIODS.has(rawPeriod) ? rawPeriod : 'all',
    startDate: query.startDate ? String(query.startDate) : undefined,
    endDate: query.endDate ? String(query.endDate) : undefined,
    providerId: query.providerId ? String(query.providerId) : undefined,
    modelId: query.modelId ? String(query.modelId) : undefined,
    department: query.department ? String(query.department) : undefined,
    action: query.action ? String(query.action) : undefined,
    userId: query.userId ? String(query.userId) : undefined,
    clientId: query.clientId ? String(query.clientId) : undefined,
    status: query.status ? String(query.status) : undefined,
    billingCategory: query.billingCategory ? String(query.billingCategory) : undefined,
  };
}

export function createAiGatewayRouter(
  store: PersistentStore,
  gateway: AiGatewayService
): Router {
  const router = Router();

  // --- DASHBOARD & OBSERVABILITY ---
  router.get('/dashboard', requirePermission('ai.read'), (req: Request, res: Response) => {
    const scope = resolveScopedOrg(req, req.query.organizationId as string | undefined);
    if (!scope.allowed) {
      res.status(403).json({ error: 'Acesso negado ao painel de IA de outra organização.' });
      return;
    }
    const filter = parseUsageFilter(req.query);
    res.json(gateway.getDashboardAnalytics(scope.organizationId, filter));
  });

  router.get('/usage-logs', requirePermission('ai.read'), (req: Request, res: Response) => {
    const scope = resolveScopedOrg(req, req.query.organizationId as string | undefined);
    if (!scope.allowed) {
      res.status(403).json({ error: 'Acesso negado.' });
      return;
    }
    const filter = parseUsageFilter(req.query);
    res.json(gateway.listUsageLogs(scope.organizationId, filter));
  });

  router.get('/usage-logs/:id', requirePermission('ai.read'), (req: Request, res: Response) => {
    const scope = resolveScopedOrg(req, req.query.organizationId as string | undefined);
    if (!scope.allowed) {
      res.status(403).json({ error: 'Acesso negado.' });
      return;
    }
    const detail = gateway.getUsageLogDetail(scope.organizationId, req.params.id);
    if (!detail) {
      res.status(404).json({ error: 'Registro de uso de IA não encontrado.' });
      return;
    }
    res.json(detail);
  });

  router.patch('/usage-logs/:id/reconcile', requirePermission('ai.manage'), (req: Request, res: Response) => {
    const scope = resolveScopedOrg(req, req.body?.organizationId || (req.query.organizationId as string | undefined));
    if (!scope.allowed) {
      res.status(403).json({ error: 'Acesso negado.' });
      return;
    }
    try {
      const updated = gateway.reconcileUsageLog(
        scope.organizationId,
        req.params.id,
        {
          providerReportedCostUsd:
            req.body?.providerReportedCostUsd !== undefined && req.body?.providerReportedCostUsd !== null
              ? Number(req.body.providerReportedCostUsd)
              : undefined,
          reconciledWithProvider: req.body?.reconciledWithProvider ?? true,
        },
        req.auth!.user.id
      );
      res.json(updated);
    } catch (err: any) {
      res.status(404).json({ error: err?.message || 'Registro não encontrado.' });
    }
  });

  router.get('/reports/export', requirePermission('ai.read'), (req: Request, res: Response) => {
    const scope = resolveScopedOrg(req, req.query.organizationId as string | undefined);
    if (!scope.allowed) {
      res.status(403).json({ error: 'Acesso negado.' });
      return;
    }
    const rawFormat = String(req.query.format || 'csv').toLowerCase();
    const format = rawFormat === 'xlsx' || rawFormat === 'pdf' ? rawFormat : 'csv';
    const rawSeg = String(req.query.segmentBy || 'detailed').toLowerCase();
    const segmentBy: ExportSegmentMode =
      rawSeg === 'provider' ||
      rawSeg === 'client' ||
      rawSeg === 'department' ||
      rawSeg === 'provider_client' ||
      rawSeg === 'client_provider_department'
        ? rawSeg
        : 'detailed';
    const filter = parseUsageFilter(req.query);
    const report = gateway.exportUsageReport(scope.organizationId, format, filter, segmentBy);
    res.setHeader('Content-Type', report.contentType);
    res.setHeader('Content-Disposition', `attachment; filename="${report.filename}"`);
    res.send(report.buffer);
  });

  router.get('/config/status', requirePermission('ai.read'), (_req: Request, res: Response) => {
    const envStatus: Record<string, boolean> = {};
    for (const pid of VALID_PROVIDERS) {
      const env = getEnvFallbackForProvider(pid);
      envStatus[pid] = Boolean(env.apiKey || env.baseUrl);
    }
    res.json({
      encryptionKeyConfigured: hasMasterEncryptionKey(),
      pricingVersion: store.getState().aiGateway.pricingVersion,
      envVariablesPresent: envStatus,
    });
  });

  // --- PROVIDERS & CREDENTIALS ---
  router.get('/providers', requirePermission('ai.read'), (req: Request, res: Response) => {
    const scope = resolveScopedOrg(req, req.query.organizationId as string | undefined);
    if (!scope.allowed) {
      res.status(403).json({ error: 'Acesso negado.' });
      return;
    }
    res.json(gateway.listProviders(scope.organizationId));
  });

  router.put('/providers/:providerId', requirePermission('ai.manage'), (req: Request, res: Response) => {
    const providerId = req.params.providerId as AiProviderId;
    if (!VALID_PROVIDERS.has(providerId)) {
      res.status(404).json({ error: 'Provedor de IA desconhecido.' });
      return;
    }
    const scopeMode = req.body?.scope === 'organization' ? 'organization' : 'global';
    if (scopeMode === 'global' && !['Super Admin', 'Administrador'].includes(req.auth!.user.role)) {
      res.status(403).json({ error: 'Apenas Administradores podem alterar credenciais globais.' });
      return;
    }
    const orgScope = resolveScopedOrg(req, req.body?.organizationId);
    if (!orgScope.allowed) {
      res.status(403).json({ error: 'Acesso negado.' });
      return;
    }

    try {
      const updated = gateway.saveProviderConfig({
        providerId,
        organizationId: orgScope.organizationId,
        actorUserId: req.auth!.user.id,
        scope: scopeMode,
        apiKey: req.body?.apiKey,
        baseUrl: req.body?.baseUrl,
        defaultModel: req.body?.defaultModel,
        organizationHeader: req.body?.organizationHeader,
        projectIdHeader: req.body?.projectIdHeader,
        rateLimitPerMin: req.body?.rateLimitPerMin,
        confirmOverwrite: req.body?.confirmOverwrite,
      });
      res.json(updated);
    } catch (err: any) {
      if (err?.message === 'NER_AI_ENCRYPTION_KEY_MISSING') {
        res.status(400).json({
          error: 'Variável NER_AI_ENCRYPTION_KEY não configurada no servidor. Defina NER_AI_ENCRYPTION_KEY no ambiente para criptografar novas credenciais em repouso.',
        });
        return;
      }
      if (err?.message === 'OVERWRITE_CONFIRMATION_REQUIRED') {
        res.status(409).json({
          error: 'Já existe uma credencial salva para este provedor. Confirme a substituição antes de sobrescrever.',
        });
        return;
      }
      res.status(400).json({ error: err?.message || 'Erro ao salvar configuração do provedor.' });
    }
  });

  router.delete('/providers/:providerId/credential', requirePermission('ai.manage'), (req: Request, res: Response) => {
    const providerId = req.params.providerId as AiProviderId;
    if (!VALID_PROVIDERS.has(providerId)) {
      res.status(404).json({ error: 'Provedor desconhecido.' });
      return;
    }
    const scopeMode = req.query.scope === 'organization' ? 'organization' : 'global';
    const orgScope = resolveScopedOrg(req, req.query.organizationId as string | undefined);
    if (!orgScope.allowed) {
      res.status(403).json({ error: 'Acesso negado.' });
      return;
    }
    try {
      const updated = gateway.deleteProviderCredential({
        providerId,
        organizationId: orgScope.organizationId,
        actorUserId: req.auth!.user.id,
        scope: scopeMode,
      });
      res.json(updated);
    } catch (err: any) {
      res.status(404).json({ error: err?.message || 'Credencial não encontrada.' });
    }
  });

  router.post('/providers/:providerId/test', requirePermission('ai.manage'), async (req: Request, res: Response) => {
    const providerId = req.params.providerId as AiProviderId;
    if (!VALID_PROVIDERS.has(providerId)) {
      res.status(404).json({ error: 'Provedor desconhecido.' });
      return;
    }
    const orgScope = resolveScopedOrg(req, req.body?.organizationId);
    if (!orgScope.allowed) {
      res.status(403).json({ error: 'Acesso negado.' });
      return;
    }
    const result = await gateway.testProviderConnection({
      providerId,
      organizationId: orgScope.organizationId,
      actorUserId: req.auth!.user.id,
    });
    res.json(result);
  });

  router.post('/providers/:providerId/discover-models', requirePermission('ai.manage'), async (req: Request, res: Response) => {
    const providerId = req.params.providerId as AiProviderId;
    if (!VALID_PROVIDERS.has(providerId)) {
      res.status(404).json({ error: 'Provedor desconhecido.' });
      return;
    }
    const orgScope = resolveScopedOrg(req, req.body?.organizationId);
    if (!orgScope.allowed) {
      res.status(403).json({ error: 'Acesso negado.' });
      return;
    }
    try {
      const models = await gateway.discoverModelsForProvider(providerId, orgScope.organizationId);
      res.json({ providerId, models });
    } catch (err: any) {
      const status = err instanceof AiUpstreamError ? err.statusCode : 400;
      res.status(status).json({ error: err?.message || 'Falha ao listar modelos do provedor.' });
    }
  });

  router.post('/security/rotate-key', requirePermission('ai.manage'), (req: Request, res: Response) => {
    if (req.auth!.user.role !== 'Super Admin') {
      res.status(403).json({ error: 'Apenas Super Admin pode rotacionar a chave mestra.' });
      return;
    }
    const { oldMasterKey, newMasterKey } = req.body || {};
    if (!oldMasterKey || !newMasterKey || String(newMasterKey).length < 16) {
      res.status(400).json({ error: 'Informe oldMasterKey e newMasterKey válida (mín. 16 caracteres).' });
      return;
    }
    try {
      const rotated = gateway.rotateEncryptionKey({
        oldMasterKey: String(oldMasterKey),
        newMasterKey: String(newMasterKey),
        organizationId: req.auth!.organizationId,
        actorUserId: req.auth!.user.id,
      });
      res.json({ success: true, rotatedCredentialsCount: rotated });
    } catch (err: any) {
      res.status(400).json({ error: err?.message || 'Falha ao rotacionar chave mestra.' });
    }
  });

  // --- MODELS ---
  router.get('/models', requirePermission('ai.read'), (req: Request, res: Response) => {
    const activeOnly = req.query.activeOnly === 'true' || req.query.activeOnly === '1';
    res.json(gateway.listModels(activeOnly));
  });

  router.post('/models', requirePermission('ai.manage'), (req: Request, res: Response) => {
    const { providerId, modelId } = req.body || {};
    if (!VALID_PROVIDERS.has(providerId) || !modelId) {
      res.status(400).json({ error: 'providerId válido e modelId são obrigatórios.' });
      return;
    }
    const model = gateway.upsertModel(req.body, req.auth!.organizationId, req.auth!.user.id);
    res.status(201).json(model);
  });

  router.patch('/models/:id', requirePermission('ai.manage'), (req: Request, res: Response) => {
    const existing = store.getState().aiGateway.models.find((m) => m.id === req.params.id);
    if (!existing) {
      res.status(404).json({ error: 'Modelo não encontrado.' });
      return;
    }
    const updated = gateway.upsertModel(
      { ...req.body, providerId: existing.providerId, modelId: existing.modelId },
      req.auth!.organizationId,
      req.auth!.user.id
    );
    res.json(updated);
  });

  // --- ROUTING & PURPOSE CAPABILITIES ---
  router.get('/purposes', requirePermission('ai.read'), (_req: Request, res: Response) => {
    res.json(PURPOSE_CAPABILITY_RULES);
  });

  router.get('/routing', requirePermission('ai.read'), (_req: Request, res: Response) => {
    res.json(gateway.listRoutingRules());
  });

  router.patch('/routing/:purpose', requirePermission('ai.manage'), (req: Request, res: Response) => {
    try {
      const updated = gateway.updateRoutingRule(
        req.params.purpose as AiPurpose,
        req.body || {},
        req.auth!.organizationId,
        req.auth!.user.id
      );
      res.json(updated);
    } catch (err: any) {
      const msg = err?.message || 'Erro ao atualizar regra.';
      if (msg.includes('REGRA_DE_ROTEAMENTO_NAO_ENCONTRADA')) {
        res.status(404).json({ error: 'Regra de roteamento não encontrada.' });
        return;
      }
      res.status(400).json({ error: msg });
    }
  });

  // --- PROMPTS ---
  router.get('/prompts', requirePermission('ai.read'), (req: Request, res: Response) => {
    const scope = resolveScopedOrg(req, req.query.organizationId as string | undefined);
    if (!scope.allowed) {
      res.status(403).json({ error: 'Acesso negado.' });
      return;
    }
    res.json(gateway.listPrompts(scope.organizationId));
  });

  router.post('/prompts', requirePermission('ai.manage'), (req: Request, res: Response) => {
    const scope = resolveScopedOrg(req, req.body?.organizationId);
    if (!scope.allowed) {
      res.status(403).json({ error: 'Acesso negado.' });
      return;
    }
    const { code, name, department, purpose, systemPrompt } = req.body || {};
    if (!code || !name || !department || !purpose || !systemPrompt) {
      res.status(400).json({ error: 'code, name, department, purpose e systemPrompt são obrigatórios.' });
      return;
    }
    const saved = gateway.savePrompt(req.body, scope.organizationId, req.auth!.user.id);
    res.json(saved);
  });

  // --- COST POLICY ---
  router.get('/cost-policy', requirePermission('ai.read'), (req: Request, res: Response) => {
    const scope = resolveScopedOrg(req, req.query.organizationId as string | undefined);
    if (!scope.allowed) {
      res.status(403).json({ error: 'Acesso negado.' });
      return;
    }
    res.json(gateway.getCostPolicy(scope.organizationId));
  });

  router.put('/cost-policy', requirePermission('ai.manage'), (req: Request, res: Response) => {
    const scope = resolveScopedOrg(req, req.body?.organizationId);
    if (!scope.allowed) {
      res.status(403).json({ error: 'Acesso negado.' });
      return;
    }
    const updated = gateway.updateCostPolicy(scope.organizationId, req.body || {}, req.auth!.user.id);
    res.json(updated);
  });

  // --- GLOBAL COST POLICY & PREVENTIVE GATEWAY MONITORING ---
  router.get('/global-cost-policy', requirePermission('ai.read'), (_req: Request, res: Response) => {
    res.json(gateway.getGlobalCostPolicy());
  });

  router.put('/global-cost-policy', requirePermission('ai.manage'), (req: Request, res: Response) => {
    if (!['Super Admin', 'Administrador'].includes(req.auth!.user.role)) {
      res.status(403).json({ error: 'Apenas Administradores podem definir limites globais de IA.' });
      return;
    }
    const updated = gateway.updateGlobalCostPolicy(req.body || {}, req.auth!.user.id, req.auth!.organizationId);
    res.json(updated);
  });

  router.get('/preventive-monitoring', requirePermission('ai.read'), (req: Request, res: Response) => {
    const scope = resolveScopedOrg(req, req.query.organizationId as string | undefined);
    if (!scope.allowed) {
      res.status(403).json({ error: 'Acesso negado.' });
      return;
    }
    const isSuperAdmin = req.auth!.user.role === 'Super Admin';
    res.json(gateway.getPreventiveMonitoringSnapshot(scope.organizationId, isSuperAdmin));
  });

  router.put('/pricing', requirePermission('ai.manage'), (req: Request, res: Response) => {
    const items = Array.isArray(req.body?.items) ? req.body.items : null;
    if (!items || items.length === 0) {
      res.status(400).json({ error: 'Informe items com providerId, modelId, inputCostPer1M e outputCostPer1M.' });
      return;
    }
    const updatedModels = [];
    for (const item of items) {
      if (!VALID_PROVIDERS.has(item.providerId) || !item.modelId) continue;
      updatedModels.push(
        gateway.upsertModel(
          {
            providerId: item.providerId,
            modelId: String(item.modelId),
            inputCostPer1M:
              item.inputCostPer1M === null || item.inputCostPer1M === '' || item.inputCostPer1M === undefined
                ? null
                : Number(item.inputCostPer1M),
            outputCostPer1M:
              item.outputCostPer1M === null || item.outputCostPer1M === '' || item.outputCostPer1M === undefined
                ? null
                : Number(item.outputCostPer1M),
            cacheInputCostPer1M:
              item.cacheInputCostPer1M === null || item.cacheInputCostPer1M === '' || item.cacheInputCostPer1M === undefined
                ? null
                : Number(item.cacheInputCostPer1M),
            reasoningCostPer1M:
              item.reasoningCostPer1M === null || item.reasoningCostPer1M === '' || item.reasoningCostPer1M === undefined
                ? null
                : Number(item.reasoningCostPer1M),
            currency: item.currency || 'USD',
            effectiveFrom: item.effectiveFrom || new Date().toISOString().slice(0, 10),
            priceSource: item.priceSource || 'Tabela Administrativa',
            pricingVerified: item.pricingVerified ?? (item.inputCostPer1M !== null && item.outputCostPer1M !== null),
          },
          req.auth!.organizationId,
          req.auth!.user.id
        )
      );
    }
    store.getState().aiGateway.pricingVersion = `custom-${new Date().toISOString().slice(0, 10)}`;
    store.save();
    res.json({
      pricingVersion: store.getState().aiGateway.pricingVersion,
      updatedCount: updatedModels.length,
      models: updatedModels,
    });
  });

  // --- ACTIONS, EXCHANGE RATE, LIMIT EXCEPTIONS & ACCOUNTING ALERTS ---
  router.get('/actions', requirePermission('ai.read'), (_req: Request, res: Response) => {
    res.json(gateway.listActions());
  });

  router.post('/actions', requirePermission('ai.manage'), (req: Request, res: Response) => {
    const { id, department, name, purpose, description, isCritical, cacheable } = req.body || {};
    if (!id || !department || !name || !purpose) {
      res.status(400).json({ error: 'id, department, name e purpose são obrigatórios.' });
      return;
    }
    const saved = gateway.upsertAction(
      { id, department, name, purpose, description, isCritical, cacheable },
      req.auth!.organizationId,
      req.auth!.user.id
    );
    res.status(201).json(saved);
  });

  router.get('/exchange-rate', requirePermission('ai.read'), (_req: Request, res: Response) => {
    res.json(gateway.getExchangeConfig());
  });

  router.put('/exchange-rate', requirePermission('ai.manage'), (req: Request, res: Response) => {
    try {
      const updated = gateway.updateExchangeConfig(
        {
          rate: Number(req.body?.rate),
          rateDate: req.body?.rateDate,
          source: req.body?.source,
        },
        req.auth!.organizationId,
        req.auth!.user.id
      );
      res.json(updated);
    } catch (err: any) {
      res.status(400).json({ error: err?.message || 'Taxa de câmbio inválida.' });
    }
  });

  router.get('/limit-exceptions', requirePermission('ai.read'), (req: Request, res: Response) => {
    const scope = resolveScopedOrg(req, req.query.organizationId as string | undefined);
    if (!scope.allowed) {
      res.status(403).json({ error: 'Acesso negado.' });
      return;
    }
    res.json(gateway.listLimitExceptions(scope.organizationId));
  });

  router.post('/limit-exceptions', requirePermission('ai.manage'), (req: Request, res: Response) => {
    const scope = resolveScopedOrg(req, req.body?.organizationId);
    if (!scope.allowed) {
      res.status(403).json({ error: 'Acesso negado.' });
      return;
    }
    const { scope: limitScope, targetKey, extraBudgetUsd, reason, expiresAt } = req.body || {};
    if (!limitScope || !targetKey || extraBudgetUsd === undefined) {
      res.status(400).json({ error: 'scope, targetKey e extraBudgetUsd são obrigatórios.' });
      return;
    }
    const created = gateway.createLimitException(
      {
        organizationId: scope.organizationId,
        scope: limitScope,
        targetKey,
        extraBudgetUsd: Number(extraBudgetUsd),
        reason: reason || 'Autorização excepcional administrativa',
        expiresAt,
      },
      req.auth!.user.id
    );
    res.status(201).json(created);
  });

  router.delete('/limit-exceptions/:id', requirePermission('ai.manage'), (req: Request, res: Response) => {
    const scope = resolveScopedOrg(req, req.query.organizationId as string | undefined);
    if (!scope.allowed) {
      res.status(403).json({ error: 'Acesso negado.' });
      return;
    }
    const ok = gateway.revokeLimitException(scope.organizationId, req.params.id, req.auth!.user.id);
    if (!ok) {
      res.status(404).json({ error: 'Exceção de limite não encontrada.' });
      return;
    }
    res.json({ success: true });
  });

  router.get('/accounting-alerts', requirePermission('ai.read'), (req: Request, res: Response) => {
    const scope = resolveScopedOrg(req, req.query.organizationId as string | undefined);
    if (!scope.allowed) {
      res.status(403).json({ error: 'Acesso negado.' });
      return;
    }
    res.json(gateway.listAccountingAlerts(scope.organizationId));
  });

  router.patch('/accounting-alerts/:id/resolve', requirePermission('ai.manage'), (req: Request, res: Response) => {
    const scope = resolveScopedOrg(req, req.body?.organizationId || (req.query.organizationId as string | undefined));
    if (!scope.allowed) {
      res.status(403).json({ error: 'Acesso negado.' });
      return;
    }
    const resolved = gateway.resolveAccountingAlert(scope.organizationId, req.params.id, req.auth!.user.id);
    if (!resolved) {
      res.status(404).json({ error: 'Alerta contábil não encontrado.' });
      return;
    }
    res.json(resolved);
  });

  // --- KNOWLEDGE BASE & MEMORY (TENANT-ISOLATED) ---
  router.get('/knowledge', requireAuth, (req: Request, res: Response) => {
    const scope = resolveScopedOrg(req, req.query.organizationId as string | undefined);
    if (!scope.allowed) {
      res.status(403).json({ error: 'Acesso negado.' });
      return;
    }
    let docs = store.getState().aiGateway.knowledgeDocs.filter((d) => d.organizationId === scope.organizationId);
    if (req.auth!.user.role === 'Cliente') {
      docs = docs.filter((d) => d.clientId === req.auth!.clientId);
    }
    res.json(docs);
  });

  router.post('/knowledge', requirePermission('ai.manage'), (req: Request, res: Response) => {
    const scope = resolveScopedOrg(req, req.body?.organizationId);
    if (!scope.allowed) {
      res.status(403).json({ error: 'Acesso negado.' });
      return;
    }
    const { title, content, projectId, clientId, tags } = req.body || {};
    if (!title || !content) {
      res.status(400).json({ error: 'Título e conteúdo documental são obrigatórios.' });
      return;
    }
    if (clientId) {
      const cli = store.getState().clients.find((c) => c.id === clientId && c.organizationId === scope.organizationId);
      if (!cli) {
        res.status(404).json({ error: 'Cliente não encontrado na organização.' });
        return;
      }
    }
    if (projectId) {
      const prj = store.getState().projects.find((p) => p.id === projectId && p.organizationId === scope.organizationId);
      if (!prj) {
        res.status(404).json({ error: 'Projeto não encontrado na organização.' });
        return;
      }
    }
    const doc = gateway.addKnowledgeDoc({
      organizationId: scope.organizationId,
      projectId,
      clientId,
      title,
      content,
      tags,
    });
    res.status(201).json(doc);
  });

  router.delete('/memory/:conversationId', requireAuth, (req: Request, res: Response) => {
    if (!hasPermission(req.auth!.permissions, 'ai.use') && !hasPermission(req.auth!.permissions, 'ai.client_assist')) {
      res.status(403).json({ error: 'Permissão de IA requerida para limpar memória.' });
      return;
    }
    const scope = resolveScopedOrg(req, req.query.organizationId as string | undefined);
    if (!scope.allowed) {
      res.status(403).json({ error: 'Acesso negado a memória de outra organização.' });
      return;
    }
    const clientScope = req.auth!.user.role === 'Cliente' ? req.auth!.clientId : undefined;
    const removed = gateway.purgeConversationMemory(scope.organizationId, req.params.conversationId, clientScope);
    res.json({ success: true, removedEntries: removed });
  });

  // --- CENTRAL EXECUTION (TEXT / CHAT / STREAMING / EMBEDDINGS / DEPARTMENTS) ---
  router.post('/generate', requireAuth, async (req: Request, res: Response) => {
    if (!hasPermission(req.auth!.permissions, 'ai.use') && !hasPermission(req.auth!.permissions, 'ai.client_assist')) {
      res.status(403).json({ error: 'Permissão ai.use requerida.' });
      return;
    }
    const scope = resolveScopedOrg(req, req.body?.organizationId);
    if (!scope.allowed) {
      res.status(403).json({ error: 'Acesso negado a outra organização.' });
      return;
    }

    const {
      prompt,
      messages,
      department = 'NER Strategy',
      purpose = 'marketing_strategy',
      action,
      billingCategory,
      isCritical,
      idempotencyKey,
      cacheable,
      overrideProviderId,
      overrideModelId,
      promptCode,
      conversationId,
      projectId,
      clientId,
      systemInstruction,
      structuredJsonSchema,
      temperature,
      maxOutputTokens,
    } = req.body || {};

    const resolvedMessages = Array.isArray(messages) && messages.length > 0
      ? messages
      : typeof prompt === 'string' && prompt.trim()
        ? [{ role: 'user' as const, content: prompt.trim() }]
        : null;

    if (!resolvedMessages) {
      res.status(400).json({ error: 'Informe prompt ou messages.' });
      return;
    }

    // Strict client boundary for Cliente role
    const effectiveClientId =
      req.auth!.user.role === 'Cliente' ? req.auth!.clientId : (clientId || null);

    try {
      const result = await gateway.execute({
        organizationId: scope.organizationId,
        userId: req.auth!.user.id,
        clientId: effectiveClientId,
        billingCategory: billingCategory as AiBillingCategory | undefined,
        department: department as AiDepartment,
        action,
        purpose: purpose as AiPurpose,
        messages: resolvedMessages,
        systemInstruction,
        overrideProviderId,
        overrideModelId,
        promptCode,
        conversationId,
        projectId,
        structuredJsonSchema,
        temperature,
        maxOutputTokens,
        idempotencyKey,
        isCritical,
        cacheable,
      });
      res.json({ ...result, result: result.text });
    } catch (err: any) {
      const status = err instanceof AiUpstreamError ? err.statusCode : 500;
      res.status(status).json({ error: err?.message || 'Erro no NER AI Gateway.' });
    }
  });

  router.post('/stream', requireAuth, async (req: Request, res: Response) => {
    if (!hasPermission(req.auth!.permissions, 'ai.use')) {
      res.status(403).json({ error: 'Permissão ai.use requerida.' });
      return;
    }
    const scope = resolveScopedOrg(req, req.body?.organizationId);
    if (!scope.allowed) {
      res.status(403).json({ error: 'Acesso negado a outra organização.' });
      return;
    }
    const {
      prompt,
      messages,
      department = 'NER Strategy',
      purpose = 'general_assistant',
      action,
      clientId,
      billingCategory,
      isCritical,
      idempotencyKey,
      overrideProviderId,
      overrideModelId,
      systemInstruction,
    } = req.body || {};

    const resolvedMessages = Array.isArray(messages) && messages.length > 0
      ? messages
      : typeof prompt === 'string' && prompt.trim()
        ? [{ role: 'user' as const, content: prompt.trim() }]
        : null;

    if (!resolvedMessages) {
      res.status(400).json({ error: 'Informe prompt ou messages.' });
      return;
    }

    res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    try {
      const result = await gateway.execute({
        organizationId: scope.organizationId,
        userId: req.auth!.user.id,
        clientId: clientId || null,
        billingCategory: billingCategory as AiBillingCategory | undefined,
        department,
        action,
        purpose,
        messages: resolvedMessages,
        systemInstruction,
        overrideProviderId,
        overrideModelId,
        idempotencyKey,
        isCritical,
        stream: true,
        onChunk: (delta) => {
          res.write(`data: ${JSON.stringify({ type: 'delta', text: delta })}\n\n`);
        },
      });
      res.write(`data: ${JSON.stringify({ type: 'done', metadata: result })}\n\n`);
      res.end();
    } catch (err: any) {
      res.write(`data: ${JSON.stringify({ type: 'error', error: err?.message || 'Erro no stream.' })}\n\n`);
      res.end();
    }
  });

  router.post('/embeddings', requirePermission('ai.use'), async (req: Request, res: Response) => {
    const scope = resolveScopedOrg(req, req.body?.organizationId);
    if (!scope.allowed) {
      res.status(403).json({ error: 'Acesso negado a outra organização.' });
      return;
    }
    const { texts, department = 'NER Intelligence', action, overrideProviderId, overrideModelId } = req.body || {};
    if (!Array.isArray(texts) || texts.length === 0) {
      res.status(400).json({ error: 'Informe um array de texts para gerar embeddings.' });
      return;
    }
    try {
      const result = await gateway.embed({
        organizationId: scope.organizationId,
        userId: req.auth!.user.id,
        department,
        action,
        texts: texts.map(String),
        overrideProviderId,
        overrideModelId,
      });
      res.json(result);
    } catch (err: any) {
      const status = err instanceof AiUpstreamError ? err.statusCode : 500;
      res.status(status).json({ error: err?.message || 'Erro ao gerar embeddings.' });
    }
  });

  // Department-scoped unified AI execution
  router.post('/department/execute', requireAuth, async (req: Request, res: Response) => {
    if (!hasPermission(req.auth!.permissions, 'ai.use') && !hasPermission(req.auth!.permissions, 'ai.client_assist')) {
      res.status(403).json({ error: 'Permissão de execução de IA requerida.' });
      return;
    }
    const scope = resolveScopedOrg(req, req.body?.organizationId);
    if (!scope.allowed) {
      res.status(403).json({ error: 'Acesso negado a outra organização.' });
      return;
    }

    const {
      department,
      taskInput,
      action,
      clientId,
      projectId,
      billingCategory,
      isCritical,
      idempotencyKey,
      overrideProviderId,
      overrideModelId,
    } = req.body || {};
    if (!department || !taskInput) {
      res.status(400).json({ error: 'department e taskInput são obrigatórios.' });
      return;
    }

    const isClientRole = req.auth!.user.role === 'Cliente';
    if (isClientRole && department !== 'NER Client Experience') {
      res.status(403).json({ error: 'Clientes só podem utilizar o assistente do NER Client Experience.' });
      return;
    }

    const departmentSpecs: Record<string, { purpose: AiPurpose; promptCode?: string; guardrails: string }> = {
      'NER Strategy': {
        purpose: 'marketing_strategy',
        promptCode: 'STRATEGY_GROWTH_DIAGNOSIS',
        guardrails: 'Foque em estratégia de crescimento, posicionamento e metas mensuráveis.',
      },
      'NER Creative': {
        purpose: 'creatives',
        promptCode: 'CREATIVE_AD_COPY_VARIATIONS',
        guardrails: 'Crie headlines, roteiros, hooks e variações mantendo compliance.',
      },
      'NER Performance': {
        purpose: 'campaign_analysis',
        promptCode: 'PERFORMANCE_CAMPAIGN_AUDIT',
        guardrails: 'Diagnóstico e recomendações apenas. NUNCA altere orçamentos ou pause campanhas automaticamente.',
      },
      'NER Tracking': {
        purpose: 'data_analysis',
        guardrails: 'Analise eventos CAPI/Pixel, deduplicação, UTMs e atribuição.',
      },
      'NER Automation': {
        purpose: 'automation',
        guardrails: 'Classifique eventos e gere resumos para workflows autorizados sem executar efeitos colaterais.',
      },
      'NER Intelligence': {
        purpose: 'data_analysis',
        guardrails: 'Distinga fatos observados, métricas calculadas e hipóteses.',
      },
      'NER Web': {
        purpose: 'copywriting',
        guardrails: 'Estruture seções de LP, copy e SEO. A publicação continua dependendo de aprovação humana.',
      },
      'NER Digital Studio': {
        purpose: 'software_dev',
        guardrails: 'Levantamento de requisitos, arquitetura, revisão de código, testes e documentação.',
      },
      'NER Client Experience': {
        purpose: 'customer_support',
        guardrails: 'Assistente de atendimento respeitando estritamente o escopo do cliente.',
      },
    };

    const spec = departmentSpecs[department];
    if (!spec) {
      res.status(400).json({ error: 'Departamento inválido.' });
      return;
    }

    if (isClientRole && clientId && clientId !== req.auth!.clientId) {
      res.status(403).json({ error: 'Cliente não pode executar IA em nome de outro cliente.' });
      return;
    }
    const effectiveClientId = isClientRole ? req.auth!.clientId : (clientId || null);
    if (effectiveClientId) {
      const cli = store.getState().clients.find((c) => c.id === effectiveClientId && c.organizationId === scope.organizationId);
      if (!cli) {
        res.status(404).json({ error: 'Cliente informado não pertence à organização ativa.' });
        return;
      }
    }
    if (projectId) {
      const prj = store.getState().projects.find((p) => p.id === projectId && p.organizationId === scope.organizationId);
      if (!prj || (isClientRole && prj.clientId !== req.auth!.clientId)) {
        res.status(404).json({ error: 'Projeto informado não pertence ao escopo autorizado.' });
        return;
      }
    }

    try {
      const result = await gateway.execute({
        organizationId: scope.organizationId,
        userId: req.auth!.user.id,
        clientId: effectiveClientId,
        billingCategory: billingCategory as AiBillingCategory | undefined,
        projectId: projectId || undefined,
        department: department as AiDepartment,
        action,
        purpose: spec.purpose,
        promptCode: spec.promptCode,
        systemInstruction: spec.guardrails,
        messages: [{ role: 'user', content: String(taskInput) }],
        overrideProviderId,
        overrideModelId,
        idempotencyKey,
        isCritical,
        allowRetry: department !== 'NER Automation', // no automatic retry on side-effect contexts
      });
      res.json(result);
    } catch (err: any) {
      const status = err instanceof AiUpstreamError ? err.statusCode : 500;
      res.status(status).json({ error: err?.message || 'Erro ao executar IA departamental.' });
    }
  });

  return router;
}
