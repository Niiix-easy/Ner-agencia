import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { PersistentStore } from '../server/store.ts';
import { createApp } from '../server/app.ts';
import { resetLoginRateLimiter } from '../server/middleware/auth.ts';
import type { AiProviderAdapter } from '../server/ai/providers.ts';
import type { AiProviderCapabilities, AiProviderId } from '../server/ai/types.ts';

const TEST_MASTER_KEY = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';

const CAPS: AiProviderCapabilities = {
  chat: true,
  textGeneration: true,
  streaming: true,
  embeddings: true,
  imageUnderstanding: true,
  structuredOutput: true,
  toolCalling: true,
  modelListing: true,
  documentAnalysis: true,
};

function createFakeAdapter(providerId: AiProviderId): AiProviderAdapter {
  return {
    providerId,
    displayName: `AuditFake ${providerId}`,
    capabilities: CAPS,
    async testConnection() {
      return { ok: true, latencyMs: 5, modelsCount: 1, message: 'OK' };
    },
    async listModels() {
      return [];
    },
    async generate(_creds, req) {
      const last = req.messages[req.messages.length - 1]?.content || '';
      return {
        text: `[${providerId}] ${last}`,
        modelUsed: req.modelId,
        inputTokens: 120,
        outputTokens: 60,
        cachedTokens: 0,
        reasoningTokens: 0,
        usageReported: true,
        providerReportedCostUsd: null,
      };
    },
    async generateStream(creds, req, onChunk) {
      const res = await this.generate(creds, req);
      onChunk(res.text);
      return res;
    },
    async embed(_creds, req) {
      return {
        embeddings: req.texts.map(() => [0.1, 0.2]),
        modelUsed: req.modelId,
        inputTokens: 10,
        usageReported: true,
      };
    },
  };
}

async function startAuditServer(opts: { stripeWebhookSecret?: string } = {}) {
  resetLoginRateLimiter();
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ner-audit-e2e-'));
  const dbPath = path.join(tmpDir, 'ner-audit-db.json');
  const store = new PersistentStore(dbPath);
  const aiAdapters: Record<AiProviderId, AiProviderAdapter> = {
    openai: createFakeAdapter('openai'),
    anthropic: createFakeAdapter('anthropic'),
    deepseek: createFakeAdapter('deepseek'),
    gemini: createFakeAdapter('gemini'),
    openrouter: createFakeAdapter('openrouter'),
    ollama: createFakeAdapter('ollama'),
    vllm: createFakeAdapter('vllm'),
    huggingface: createFakeAdapter('huggingface'),
  };

  const { app, aiGateway } = createApp(store, {
    stripeWebhookSecret: opts.stripeWebhookSecret,
    aiAdapters,
    aiMasterKeyOverride: TEST_MASTER_KEY,
  });

  const server = await new Promise<http.Server>((resolve) => {
    const s = app.listen(0, '127.0.0.1', () => resolve(s));
  });
  const addr = server.address() as AddressInfo;
  const baseUrl = `http://127.0.0.1:${addr.port}`;

  const cleanup = async () => {
    await new Promise<void>((resolve, reject) => server.close((err) => (err ? reject(err) : resolve())));
    fs.rmSync(tmpDir, { recursive: true, force: true });
  };

  return { baseUrl, store, aiGateway, cleanup };
}

async function loginAs(baseUrl: string, email: string, password = 'NerAgency@2026') {
  const res = await fetch(`${baseUrl}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  return { status: res.status, data: await res.json() };
}

test('Audit Security Headers & Stripe Production Webhook Guard', async () => {
  const prevEnv = process.env.NODE_ENV;
  const prevSecret = process.env.STRIPE_WEBHOOK_SECRET;
  process.env.NODE_ENV = 'production';
  delete process.env.STRIPE_WEBHOOK_SECRET;

  const { baseUrl, cleanup } = await startAuditServer();
  try {
    const health = await fetch(`${baseUrl}/api/health`);
    assert.equal(health.status, 200);
    assert.equal(health.headers.get('x-content-type-options'), 'nosniff');
    assert.equal(health.headers.get('x-frame-options'), 'SAMEORIGIN');
    assert.ok(health.headers.get('referrer-policy'));

    // In production without STRIPE_WEBHOOK_SECRET, webhook must fail closed (503) instead of falling back to sandbox secret
    const webhookRes = await fetch(`${baseUrl}/api/webhooks/stripe`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'stripe-signature': 't=123,v1=abc' },
      body: JSON.stringify({ id: 'evt_test', type: 'invoice.paid' }),
    });
    assert.equal(webhookRes.status, 503);

    const admin = await loginAs(baseUrl, 'maycon@neragency.com');
    const sandboxRes = await fetch(`${baseUrl}/api/billing/sandbox-webhook`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${admin.data.token}` },
      body: JSON.stringify({ eventType: 'invoice.paid' }),
    });
    assert.equal(sandboxRes.status, 403);
  } finally {
    process.env.NODE_ENV = prevEnv;
    if (prevSecret !== undefined) process.env.STRIPE_WEBHOOK_SECRET = prevSecret;
    await cleanup();
  }
});

test('Audit Proposal Acceptance -> Contract ServiceType & Pending Receivable + Burst Digital Studio ID Uniqueness', async () => {
  const { baseUrl, cleanup } = await startAuditServer();
  try {
    const admin = await loginAs(baseUrl, 'maycon@neragency.com');
    const headers = { 'Content-Type': 'application/json', Authorization: `Bearer ${admin.data.token}` };

    // Create proposal linked to Digital Studio Growth plan (Site)
    const propRes = await fetch(`${baseUrl}/api/proposals`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        clientId: 'cli-1',
        planCode: 'NER_BUSINESS_GROWTH',
        title: 'Site Institucional Growth 2026',
        setupValue: 2990,
        recurringValue: 299,
      }),
    });
    assert.equal(propRes.status, 201);
    const prop = await propRes.json();

    const acceptRes = await fetch(`${baseUrl}/api/proposals/${prop.id}/accept`, {
      method: 'PATCH',
      headers,
    });
    assert.equal(acceptRes.status, 200);
    const accepted = await acceptRes.json();
    assert.equal(accepted.contract.serviceType, 'Site');
    assert.equal(accepted.contract.recurrence, 'Mensal');
    assert.ok(accepted.receivable);
    assert.equal(accepted.receivable.amount, 3289);
    assert.equal(accepted.receivable.mediaBudget, 0);

    // Rapid burst of 5 Digital Studio contractions must yield 100% unique IDs
    const burst = await Promise.all(
      Array.from({ length: 5 }, (_, i) =>
        fetch(`${baseUrl}/api/digital-studio/contract`, {
          method: 'POST',
          headers,
          body: JSON.stringify({
            clientId: 'cli-1',
            planCode: 'NER_PRODUCT_START',
            customProjectName: `Burst LP #${i + 1}`,
          }),
        }).then((r) => r.json())
      )
    );
    const contractIds = new Set(burst.map((b) => b.contract.id));
    const projectIds = new Set(burst.map((b) => b.project.id));
    const taskIds = new Set(burst.flatMap((b) => b.tasks.map((t: any) => t.id)));
    assert.equal(contractIds.size, 5);
    assert.equal(projectIds.size, 5);
    assert.equal(taskIds.size, 15);
  } finally {
    await cleanup();
  }
});

test('Audit Cross-Tenant FK Ownership & Input Validation', async () => {
  const { baseUrl, cleanup } = await startAuditServer();
  try {
    const admin = await loginAs(baseUrl, 'maycon@neragency.com');
    const headers = { 'Content-Type': 'application/json', Authorization: `Bearer ${admin.data.token}` };

    // Cross-org clientId (cli-3 belongs to org-2, calling in org-1)
    const oppErr = await fetch(`${baseUrl}/api/opportunities`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ name: 'Cross-tenant', clientId: 'cli-3', value: 1000 }),
    });
    assert.equal(oppErr.status, 404);

    const webErr = await fetch(`${baseUrl}/api/web/pages`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ clientId: 'cli-3', title: 'LP Intruder', slug: 'lp-intruder' }),
    });
    assert.equal(webErr.status, 404);

    const tktErr = await fetch(`${baseUrl}/api/tickets`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ clientId: 'cli-3', subject: 'Cross Org', description: 'Teste' }),
    });
    assert.equal(tktErr.status, 404);

    // User validation: short password & Cliente without valid clientId
    const shortPassErr = await fetch(`${baseUrl}/api/users`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ name: 'Weak', email: 'weak@ner.com', password: '123', role: 'Comercial' }),
    });
    assert.equal(shortPassErr.status, 400);

    const clientMissingErr = await fetch(`${baseUrl}/api/users`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ name: 'NoClient', email: 'nocli@ner.com', password: 'Strong@123', role: 'Cliente' }),
    });
    assert.equal(clientMissingErr.status, 400);

    const clientUserErr = await fetch(`${baseUrl}/api/users`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ name: 'BadClient', email: 'badcli@ner.com', password: 'Strong@123', role: 'Cliente', clientId: 'cli-3' }),
    });
    assert.equal(clientUserErr.status, 404);

    // Invalid status enum on task
    const taskEnumErr = await fetch(`${baseUrl}/api/tasks/tsk-1`, {
      method: 'PATCH',
      headers,
      body: JSON.stringify({ status: 'StatusInventado' }),
    });
    assert.equal(taskEnumErr.status, 400);
  } finally {
    await cleanup();
  }
});

test('Audit n8n Real HTTP Webhook Dispatch & Upstream Failure Handling', async () => {
  const prevWebhookUrl = process.env.N8N_WEBHOOK_URL;
  let receivedBody: any = null;
  let respondOk = true;

  const mockN8n = http.createServer((req, res) => {
    let raw = '';
    req.on('data', (chunk) => (raw += chunk));
    req.on('end', () => {
      receivedBody = JSON.parse(raw || '{}');
      res.statusCode = respondOk ? 200 : 500;
      res.end(JSON.stringify({ ok: respondOk }));
    });
  });
  await new Promise<void>((resolve) => mockN8n.listen(0, '127.0.0.1', resolve));
  const port = (mockN8n.address() as AddressInfo).port;
  process.env.N8N_WEBHOOK_URL = `http://127.0.0.1:${port}/webhook/ner-test`;

  const { baseUrl, store, cleanup } = await startAuditServer();
  try {
    const admin = await loginAs(baseUrl, 'maycon@neragency.com');
    const headers = { 'Content-Type': 'application/json', Authorization: `Bearer ${admin.data.token}` };
    const n8nWf = store.getState().workflows.find((w) => w.category === 'n8n');
    assert.ok(n8nWf);

    const toggleRes = await fetch(`${baseUrl}/api/workflows/${n8nWf.id}/toggle`, { method: 'PATCH', headers });
    assert.equal(toggleRes.status, 200);

    const testOk = await fetch(`${baseUrl}/api/workflows/${n8nWf.id}/test`, { method: 'POST', headers });
    assert.equal(testOk.status, 200);
    assert.equal(receivedBody.workflowId, n8nWf.id);
    assert.equal(receivedBody.test, true);

    // Upstream HTTP 500 must fail with 502 and not increment execution counter
    respondOk = false;
    const prevCount = store.getState().workflows.find((w) => w.id === n8nWf.id)!.executions;
    const testFail = await fetch(`${baseUrl}/api/workflows/${n8nWf.id}/test`, { method: 'POST', headers });
    assert.equal(testFail.status, 502);
    assert.equal(store.getState().workflows.find((w) => w.id === n8nWf.id)!.executions, prevCount);
  } finally {
    if (prevWebhookUrl === undefined) delete process.env.N8N_WEBHOOK_URL;
    else process.env.N8N_WEBHOOK_URL = prevWebhookUrl;
    await new Promise<void>((resolve) => mockN8n.close(() => resolve()));
    await cleanup();
  }
});

test('Audit AI Gateway Department Execute RBAC, Client Isolation & Retention Pruning', async () => {
  const { baseUrl, store, aiGateway, cleanup } = await startAuditServer();
  try {
    for (const [pid, model] of [
      ['openai', 'gpt-4o-mini'],
      ['anthropic', 'claude-3-5-sonnet-20241022'],
      ['gemini', 'gemini-2.5-flash'],
    ] as const) {
      aiGateway.saveProviderConfig({
        providerId: pid,
        scope: 'organization',
        organizationId: 'org-1',
        apiKey: `sk-test-audit-${pid}`,
        defaultModel: model,
        actorUserId: 'usr-1',
      });
    }

    // Seed an expired memory (retentionDays = 1, createdAt 10 days ago) -> next persisted AI call prunes it
    store.getState().aiGateway.memories.push({
      id: 'mem-expired-1',
      organizationId: 'org-1',
      projectId: null,
      clientId: 'cli-1',
      conversationId: 'conv-expired',
      role: 'user',
      content: 'Memória antiga expirada',
      citations: [],
      retentionDays: 1,
      createdAt: new Date(Date.now() - 10 * 86400000).toISOString(),
    });

    const adminLogin = await loginAs(baseUrl, 'maycon@neragency.com');
    const freshCall = await fetch(`${baseUrl}/api/ai/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminLogin.data.token}` },
      body: JSON.stringify({
        purpose: 'general_assistant',
        department: 'NER Strategy',
        feature: 'audit_retention_check',
        action: 'analyze',
        prompt: 'Verificar limpeza de memória expirada',
        conversationId: 'conv-fresh',
        persistMemory: true,
        clientId: 'cli-1',
      }),
    });
    assert.equal(freshCall.status, 200);

    const remainingMemories = store.getState().aiGateway.memories;
    assert.equal(remainingMemories.some((m) => m.conversationId === 'conv-expired'), false);
    assert.equal(remainingMemories.some((m) => m.conversationId === 'conv-fresh'), true);

    // Cliente user (lucas -> cli-1) can execute for cli-1, blocked from cli-2 & cli-3
    const clientLogin = await loginAs(baseUrl, 'lucas@techflow.io');
    const cliHeaders = { 'Content-Type': 'application/json', Authorization: `Bearer ${clientLogin.data.token}` };

    const deniedOtherClient = await fetch(`${baseUrl}/api/ai/department/execute`, {
      method: 'POST',
      headers: cliHeaders,
      body: JSON.stringify({
        department: 'NER Client Experience',
        taskInput: 'Resuma projeto',
        clientId: 'cli-2',
      }),
    });
    assert.equal(deniedOtherClient.status, 403);

    const okClient = await fetch(`${baseUrl}/api/ai/department/execute`, {
      method: 'POST',
      headers: cliHeaders,
      body: JSON.stringify({
        department: 'NER Client Experience',
        taskInput: 'Resuma o andamento do portal',
        clientId: 'cli-1',
      }),
    });
    assert.equal(okClient.status, 200);
    const aiOut = await okClient.json();
    assert.ok(aiOut.text);
    assert.ok(aiOut.requestId);
    assert.ok(aiOut.inputTokens > 0);
    assert.equal(typeof aiOut.totalCostBRL, 'number');
    const recordedLog = store.getState().aiGateway.usageLogs.find((l) => l.requestId === aiOut.requestId);
    assert.ok(recordedLog);
    assert.equal(recordedLog.organizationId, 'org-1');
    assert.equal(recordedLog.clientId, 'cli-1');

    // Cross-tenant client on department/execute as Super Admin in org-1 must return 404
    const admin = await loginAs(baseUrl, 'maycon@neragency.com');
    const crossTenantAi = await fetch(`${baseUrl}/api/ai/department/execute`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${admin.data.token}` },
      body: JSON.stringify({
        department: 'NER Creative',
        taskInput: 'Gerar copy',
        organizationId: 'org-1',
        clientId: 'cli-3',
      }),
    });
    assert.equal(crossTenantAi.status, 404);
  } finally {
    await cleanup();
  }
});

test('Audit LGPD Governance: Client Portability Export & Admin Irreversible Anonymization', async () => {
  const { baseUrl, store, cleanup } = await startAuditServer();
  try {
    store.getState().aiGateway.memories.push({
      id: 'mem-cli-1-lgpd',
      organizationId: 'org-1',
      projectId: null,
      clientId: 'cli-1',
      conversationId: 'conv-cli-1',
      role: 'user',
      content: 'Dados confidenciais cli-1',
      citations: [],
      retentionDays: 30,
      createdAt: new Date().toISOString(),
    });

    const lucas = await loginAs(baseUrl, 'lucas@techflow.io');
    const lucasHeaders = { Authorization: `Bearer ${lucas.data.token}` };

    // Lucas can export cli-1 (own data) but not cli-2
    const exportOwn = await fetch(`${baseUrl}/api/lgpd/clients/cli-1/export`, { headers: lucasHeaders });
    assert.equal(exportOwn.status, 200);
    const bundle = await exportOwn.json();
    assert.equal(bundle.client.id, 'cli-1');
    assert.ok(Array.isArray(bundle.contracts));

    const exportOther = await fetch(`${baseUrl}/api/lgpd/clients/cli-2/export`, { headers: lucasHeaders });
    assert.equal(exportOther.status, 403);

    // Comercial user cannot anonymize client PII
    const comercial = await loginAs(baseUrl, 'ana@neragency.com');
    const comDenied = await fetch(`${baseUrl}/api/lgpd/clients/cli-1/anonymize`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${comercial.data.token}` },
    });
    assert.equal(comDenied.status, 403);

    // Admin anonymizes cli-1 -> scrubs PII, preserves receivables FK, deactivates Lucas + revokes session + purges AI memory
    const admin = await loginAs(baseUrl, 'maycon@neragency.com');
    const anonRes = await fetch(`${baseUrl}/api/lgpd/clients/cli-1/anonymize`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${admin.data.token}` },
    });
    assert.equal(anonRes.status, 200);
    const anonBody = await anonRes.json();
    assert.equal(anonBody.deactivatedUsers, 1);

    const state = store.getState();
    const cli1 = state.clients.find((c) => c.id === 'cli-1')!;
    assert.equal(cli1.email, 'cli-1@anonimizado.lgpd.local');
    assert.equal(cli1.document, '***.***.***-**');
    assert.equal(state.aiGateway.memories.filter((m) => m.clientId === 'cli-1').length, 0);

    // Lucas's existing session must now be invalid (401)
    const lucasAfter = await fetch(`${baseUrl}/api/auth/me`, { headers: lucasHeaders });
    assert.equal(lucasAfter.status, 401);

    // Financial receivables remain intact for fiscal accounting without PII name
    const cli1Recs = state.receivables.filter((r) => r.clientId === 'cli-1');
    assert.ok(cli1Recs.length > 0);
    assert.match(cli1Recs[0].clientName, /Anonimizado/);
  } finally {
    await cleanup();
  }
});
