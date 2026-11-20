import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { AddressInfo } from 'node:net';
import { PersistentStore } from '../server/store.ts';
import { createApp } from '../server/app.ts';
import { resetLoginRateLimiter } from '../server/middleware/auth.ts';
import { encryptSecret, decryptSecret, maskSecret } from '../server/ai/credentials.ts';
import { AiProviderAdapter } from '../server/ai/providers.ts';
import { AiUpstreamError } from '../server/ai/observability.ts';
import { AiProviderCapabilities, AiProviderId } from '../server/ai/types.ts';

const TEST_MASTER_KEY = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';

const DEFAULT_CAPS: AiProviderCapabilities = {
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

/**
 * TEST-ONLY MOCK ADAPTER FACTORY
 * Used exclusively inside automated unit/integration tests to simulate external AI HTTP providers
 * (including rate limits, timeouts, invalid credentials, streaming, and embeddings) without external network calls.
 */
function createMockAdapter(
  providerId: AiProviderId,
  behavior: {
    failTestConnection?: boolean;
    failGenerateCategory?: 'rate_limit' | 'timeout' | 'auth' | 'unavailable';
    failAttemptsBeforeSuccess?: number;
    responsePrefix?: string;
  } = {}
): AiProviderAdapter {
  let calls = 0;
  return {
    providerId,
    displayName: `Mock ${providerId}`,
    capabilities: DEFAULT_CAPS,
    async testConnection(creds) {
      if (behavior.failTestConnection || (!creds.apiKey && providerId !== 'ollama')) {
        return { ok: false, latencyMs: 5, message: 'Credencial ausente ou inválida no teste.' };
      }
      return { ok: true, latencyMs: 12, modelsCount: 2, message: 'Conectado com sucesso.' };
    },
    async listModels() {
      return [
        { modelId: `${providerId}-discovered-v1`, displayName: `${providerId} Discovered v1`, contextWindow: 128000 },
      ];
    },
    async generate(_creds, req) {
      calls += 1;
      if (behavior.failAttemptsBeforeSuccess && calls <= behavior.failAttemptsBeforeSuccess) {
        throw new AiUpstreamError(providerId, 'Rate limit temporário simulado (429)', 429, 'rate_limit');
      }
      if (behavior.failGenerateCategory) {
        const status =
          behavior.failGenerateCategory === 'rate_limit'
            ? 429
            : behavior.failGenerateCategory === 'timeout'
              ? 504
              : behavior.failGenerateCategory === 'auth'
                ? 401
                : 503;
        throw new AiUpstreamError(
          providerId,
          `Falha simulada (${behavior.failGenerateCategory})`,
          status,
          behavior.failGenerateCategory
        );
      }
      const lastMsg = req.messages[req.messages.length - 1]?.content || '';
      return {
        text: `${behavior.responsePrefix || providerId.toUpperCase()}: ${lastMsg}`,
        modelUsed: req.modelId,
        inputTokens: 100,
        outputTokens: 50,
        cachedTokens: 0,
      };
    },
    async generateStream(creds, req, onChunk) {
      const res = await this.generate(creds, req);
      const half = Math.ceil(res.text.length / 2);
      onChunk(res.text.slice(0, half));
      onChunk(res.text.slice(half));
      return res;
    },
    async embed(_creds, req) {
      return {
        embeddings: req.texts.map(() => [0.11, 0.22, 0.33]),
        modelUsed: req.modelId,
        inputTokens: req.texts.length * 10,
      };
    },
  };
}

function buildMockAdapters(
  overrides: Partial<Record<AiProviderId, AiProviderAdapter>> = {}
): Record<AiProviderId, AiProviderAdapter> {
  return {
    openai: createMockAdapter('openai'),
    anthropic: createMockAdapter('anthropic'),
    deepseek: createMockAdapter('deepseek'),
    gemini: createMockAdapter('gemini'),
    openrouter: createMockAdapter('openrouter'),
    ollama: createMockAdapter('ollama'),
    vllm: createMockAdapter('vllm'),
    huggingface: createMockAdapter('huggingface'),
    ...overrides,
  };
}

async function startAiTestServer(
  overrides: Partial<Record<AiProviderId, AiProviderAdapter>> = {},
  masterKeyOverride: string | undefined = TEST_MASTER_KEY
) {
  resetLoginRateLimiter();
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ner-ai-test-'));
  const dbPath = path.join(tmpDir, 'ner-ai-db.json');
  const store = new PersistentStore(dbPath);
  const { app } = createApp(store, {
    aiAdapters: buildMockAdapters(overrides),
    aiMasterKeyOverride: masterKeyOverride,
  });

  const server = await new Promise<import('node:http').Server>((resolve) => {
    const s = app.listen(0, '127.0.0.1', () => resolve(s));
  });
  const addr = server.address() as AddressInfo;
  const baseUrl = `http://127.0.0.1:${addr.port}`;

  const cleanup = async () => {
    await new Promise<void>((resolve, reject) => server.close((err) => (err ? reject(err) : resolve())));
    fs.rmSync(tmpDir, { recursive: true, force: true });
  };

  return { baseUrl, store, cleanup };
}

async function loginAs(baseUrl: string, email: string, password = 'NerAgency@2026') {
  const res = await fetch(`${baseUrl}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  const data = await res.json();
  return { status: res.status, data };
}

test('AI Security: AES-256-GCM encrypts/decrypts, masks secrets, rejects missing master key, and rotates keys', async () => {
  const secret = 'sk-proj-secret-token-987654321';
  const encrypted = encryptSecret(secret, TEST_MASTER_KEY);
  assert.ok(encrypted.startsWith('enc:v1:'));
  assert.equal(encrypted.includes(secret), false);
  assert.equal(decryptSecret(encrypted, TEST_MASTER_KEY), secret);
  assert.equal(maskSecret(secret), 'sk-p••••4321');

  assert.throws(() => encryptSecret(secret, ''), /NER_AI_ENCRYPTION_KEY_MISSING/);

  const { baseUrl, store, cleanup } = await startAiTestServer();
  try {
    const admin = await loginAs(baseUrl, 'maycon@neragency.com');
    const token = admin.data.token;

    // Save OpenAI key
    const saveRes = await fetch(`${baseUrl}/api/ai/providers/openai`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ scope: 'global', apiKey: secret }),
    });
    assert.equal(saveRes.status, 200);
    const saved = await saveRes.json();
    assert.equal(saved.status, 'AGUARDANDO CONFIGURAÇÃO'); // never connected until tested
    assert.equal(saved.keyMask, 'sk-p••••4321');
    assert.equal((saved as any).encryptedApiKey, undefined);

    // Ensure GET /api/ai/providers never leaks plaintext or encrypted ciphertext
    const listRes = await fetch(`${baseUrl}/api/ai/providers`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const listText = await listRes.text();
    assert.equal(listText.includes(secret), false);
    assert.equal(listText.includes('enc:v1:'), false);

    // Overwrite without confirmOverwrite=true must return 409
    const overwriteConflict = await fetch(`${baseUrl}/api/ai/providers/openai`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ scope: 'global', apiKey: 'sk-other-key-11112222', confirmOverwrite: false }),
    });
    assert.equal(overwriteConflict.status, 409);

    // Rotate master encryption key as Super Admin
    const newMasterKey = 'fedcba9876543210fedcba9876543210fedcba9876543210fedcba9876543210';
    const rotateRes = await fetch(`${baseUrl}/api/ai/security/rotate-key`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ oldMasterKey: TEST_MASTER_KEY, newMasterKey }),
    });
    assert.equal(rotateRes.status, 200);
    const rotateBody = await rotateRes.json();
    assert.equal(rotateBody.rotatedCredentialsCount, 1);

    const openaiRec = store.getState().aiGateway.providers.find((p) => p.providerId === 'openai');
    assert.equal(decryptSecret(openaiRec!.encryptedApiKey!, newMasterKey), secret);

    // Revoke credential
    const delRes = await fetch(`${baseUrl}/api/ai/providers/openai/credential?scope=global`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` },
    });
    assert.equal(delRes.status, 200);
    const delBody = await delRes.json();
    assert.equal(delBody.hasKeyConfigured, false);
    assert.equal(delBody.status, 'AGUARDANDO CONFIGURAÇÃO');
  } finally {
    await cleanup();
  }
});

test('AI RBAC & Multi-Tenant Isolation: enforces roles, blocks client cross-department access, isolates org logs/knowledge', async () => {
  const { baseUrl, cleanup } = await startAiTestServer();
  try {
    const superAdmin = await loginAs(baseUrl, 'maycon@neragency.com');
    const adminSp = await loginAs(baseUrl, 'marcos@nersp.com'); // org-2
    const clientUser = await loginAs(baseUrl, 'lucas@techflow.io'); // Cliente in org-1

    // Cliente cannot read/manage AI Center providers or cost policies
    const clientProviders = await fetch(`${baseUrl}/api/ai/providers`, {
      headers: { Authorization: `Bearer ${clientUser.data.token}` },
    });
    assert.equal(clientProviders.status, 403);

    // Cliente cannot call NER Performance AI, only NER Client Experience
    const clientPerfDenied = await fetch(`${baseUrl}/api/ai/department/execute`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${clientUser.data.token}` },
      body: JSON.stringify({ department: 'NER Performance', taskInput: 'Analise contas' }),
    });
    assert.equal(clientPerfDenied.status, 403);

    // Admin SP (org-2) cannot view org-1 usage logs or knowledge docs
    const crossOrgLogs = await fetch(`${baseUrl}/api/ai/usage-logs?organizationId=org-1`, {
      headers: { Authorization: `Bearer ${adminSp.data.token}` },
    });
    assert.equal(crossOrgLogs.status, 403);

    // Add knowledge doc to org-1; org-2 must not see it
    await fetch(`${baseUrl}/api/ai/knowledge`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${superAdmin.data.token}` },
      body: JSON.stringify({ organizationId: 'org-1', title: 'Playbook Secreto Org1', content: 'Segredo Org1' }),
    });

    const org2DocsRes = await fetch(`${baseUrl}/api/ai/knowledge`, {
      headers: { Authorization: `Bearer ${adminSp.data.token}` },
    });
    assert.equal(org2DocsRes.status, 200);
    const org2Docs = await org2DocsRes.json();
    assert.equal(org2Docs.length, 0);
  } finally {
    await cleanup();
  }
});

test('AI Providers, Model Discovery, Generation, Streaming SSE, Embeddings & Prompt Versioning', async () => {
  const { baseUrl, cleanup } = await startAiTestServer();
  try {
    const admin = await loginAs(baseUrl, 'maycon@neragency.com');
    const token = admin.data.token;

    // Configure Gemini & OpenAI keys
    await fetch(`${baseUrl}/api/ai/providers/gemini`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ scope: 'global', apiKey: 'AIzaTestFakeKeyForUnitTest12345' }),
    });

    // Test connection -> transitions to CONECTADO
    const testRes = await fetch(`${baseUrl}/api/ai/providers/gemini/test`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ organizationId: 'org-1' }),
    });
    const testBody = await testRes.json();
    assert.equal(testBody.ok, true);
    assert.equal(testBody.status, 'CONECTADO');

    // Discover models
    const discRes = await fetch(`${baseUrl}/api/ai/providers/gemini/discover-models`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ organizationId: 'org-1' }),
    });
    assert.equal(discRes.status, 200);
    const discBody = await discRes.json();
    assert.ok(discBody.models.some((m: any) => m.modelId === 'gemini-discovered-v1'));

    // Generate text via central gateway
    const genRes = await fetch(`${baseUrl}/api/ai/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        prompt: 'Planejar campanha SaaS',
        department: 'NER Strategy',
        purpose: 'marketing_strategy',
        conversationId: 'conv-1',
      }),
    });
    assert.equal(genRes.status, 200);
    const genBody = await genRes.json();
    assert.equal(genBody.providerId, 'gemini');
    assert.match(genBody.text, /GEMINI: Planejar campanha SaaS/);
    assert.equal(genBody.result, genBody.text);
    assert.equal(genBody.inputTokens, 100);
    assert.equal(genBody.outputTokens, 50);

    // Streaming SSE
    const streamRes = await fetch(`${baseUrl}/api/ai/stream`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ prompt: 'Stream test', department: 'NER Strategy' }),
    });
    assert.equal(streamRes.status, 200);
    const sseText = await streamRes.text();
    assert.match(sseText, /"type":"delta"/);
    assert.match(sseText, /"type":"done"/);

    // Embeddings
    const embRes = await fetch(`${baseUrl}/api/ai/embeddings`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ texts: ['Documento NER 1', 'Documento NER 2'] }),
    });
    assert.equal(embRes.status, 200);
    const embBody = await embRes.json();
    assert.equal(embBody.embeddings.length, 2);

    // Prompt versioning
    const p1 = await fetch(`${baseUrl}/api/ai/prompts`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        code: 'TEST_PROMPT_V',
        name: 'Prompt Teste',
        department: 'NER Creative',
        purpose: 'creatives',
        systemPrompt: 'Versão 1 do prompt',
      }),
    });
    const p1Body = await p1.json();
    assert.equal(p1Body.version, 1);

    const p2 = await fetch(`${baseUrl}/api/ai/prompts`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        code: 'TEST_PROMPT_V',
        name: 'Prompt Teste',
        department: 'NER Creative',
        purpose: 'creatives',
        systemPrompt: 'Versão 2 atualizada',
      }),
    });
    const p2Body = await p2.json();
    assert.equal(p2Body.version, 2);
    assert.equal(p2Body.history.length, 1);
  } finally {
    await cleanup();
  }
});

test('AI Routing Resilience: retries 429, executes cost-safe fallback, blocks expensive fallback, and enforces cost caps', async () => {
  // Primary gemini fails with 504 timeout; fallback openai succeeds when allowMoreExpensiveFallback=true
  const { baseUrl, cleanup } = await startAiTestServer({
    gemini: createMockAdapter('gemini', { failGenerateCategory: 'timeout' }),
    deepseek: createMockAdapter('deepseek', { failAttemptsBeforeSuccess: 1, responsePrefix: 'RETRY_OK' }),
    openai: createMockAdapter('openai', { responsePrefix: 'FALLBACK_OPENAI' }),
  });
  try {
    const admin = await loginAs(baseUrl, 'maycon@neragency.com');
    const token = admin.data.token;

    await fetch(`${baseUrl}/api/ai/providers/gemini`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ scope: 'global', apiKey: 'AIzaTestFakeKey1' }),
    });
    await fetch(`${baseUrl}/api/ai/providers/openai`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ scope: 'global', apiKey: 'sk-test-openai-key' }),
    });
    await fetch(`${baseUrl}/api/ai/providers/deepseek`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ scope: 'global', apiKey: 'sk-test-deepseek-key' }),
    });

    // Configure fallback to openai/gpt-4o (more expensive than gemini-4-hydrogen) with allowMoreExpensiveFallback=false
    await fetch(`${baseUrl}/api/ai/routing/marketing_strategy`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ fallbackProviderId: 'openai', fallbackModelId: 'gpt-4o', allowMoreExpensiveFallback: false }),
    });

    const blockedFallbackRes = await fetch(`${baseUrl}/api/ai/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ prompt: 'Teste fallback caro bloqueado', purpose: 'marketing_strategy' }),
    });
    assert.equal(blockedFallbackRes.status, 504);

    // Enable allowMoreExpensiveFallback=true -> fallback executes and records fallbackUsed=true
    await fetch(`${baseUrl}/api/ai/routing/marketing_strategy`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ allowMoreExpensiveFallback: true }),
    });

    const fallbackOkRes = await fetch(`${baseUrl}/api/ai/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ prompt: 'Teste fallback autorizado', purpose: 'marketing_strategy' }),
    });
    assert.equal(fallbackOkRes.status, 200);
    const fallbackOkBody = await fallbackOkRes.json();
    assert.equal(fallbackOkBody.providerId, 'openai');
    assert.equal(fallbackOkBody.fallbackUsed, true);
    assert.match(fallbackOkBody.text, /FALLBACK_OPENAI/);

    // Rate-limit retry test on coding (DeepSeek primary fails once with 429, retry succeeds)
    const retryRes = await fetch(`${baseUrl}/api/ai/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ prompt: 'Gerar endpoint', department: 'NER Digital Studio', purpose: 'coding' }),
    });
    assert.equal(retryRes.status, 200);
    const retryBody = await retryRes.json();
    assert.match(retryBody.text, /RETRY_OK/);

    // Cost policy enforcement: set dailyLimitUsd to 0.0001 -> next request must be blocked with budget_blocked
    await fetch(`${baseUrl}/api/ai/cost-policy`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ organizationId: 'org-1', dailyLimitUsd: 0.0001, blockOnExceed: true }),
    });

    const budgetBlocked = await fetch(`${baseUrl}/api/ai/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ prompt: 'Deve bloquear por orcamento', purpose: 'coding' }),
    });
    assert.equal(budgetBlocked.status, 429);

    const logsRes = await fetch(`${baseUrl}/api/ai/usage-logs`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const logs = await logsRes.json();
    assert.ok(logs.some((l: any) => l.status === 'budget_blocked'));
  } finally {
    await cleanup();
  }
});

test('AI Department Integrations: NER Strategy, Creative, Performance, Client Experience execute via central gateway', async () => {
  const { baseUrl, cleanup } = await startAiTestServer();
  try {
    const admin = await loginAs(baseUrl, 'maycon@neragency.com');
    const client = await loginAs(baseUrl, 'lucas@techflow.io');

    for (const pid of ['gemini', 'anthropic', 'openai'] as const) {
      await fetch(`${baseUrl}/api/ai/providers/${pid}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${admin.data.token}` },
        body: JSON.stringify({ scope: 'global', apiKey: `key-for-${pid}-testing-1234` }),
      });
    }

    for (const dept of ['NER Strategy', 'NER Creative', 'NER Performance', 'NER Digital Studio']) {
      const res = await fetch(`${baseUrl}/api/ai/department/execute`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${admin.data.token}` },
        body: JSON.stringify({ department: dept, taskInput: `Tarefa para ${dept}` }),
      });
      assert.equal(res.status, 200);
      const body = await res.json();
      assert.ok(body.text);
      assert.ok(body.requestId);
    }

    // Client user allowed for NER Client Experience
    const cxRes = await fetch(`${baseUrl}/api/ai/department/execute`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${client.data.token}` },
      body: JSON.stringify({ department: 'NER Client Experience', taskInput: 'Status do meu projeto?' }),
    });
    assert.equal(cxRes.status, 200);
  } finally {
    await cleanup();
  }
});

test('AI Cost & Usage Dashboard: segments by provider/department/model, recalculates from configurable pricing, and emits alerts', async () => {
  const { baseUrl, cleanup } = await startAiTestServer();
  try {
    const admin = await loginAs(baseUrl, 'maycon@neragency.com');
    const token = admin.data.token;

    await fetch(`${baseUrl}/api/ai/providers/openai`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ scope: 'global', apiKey: 'sk-test-cost-dashboard-1234' }),
    });

    // Register an unpriced custom model and run requests across departments
    await fetch(`${baseUrl}/api/ai/models`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        providerId: 'openai',
        modelId: 'gpt-custom-unpriced',
        displayName: 'GPT Custom Unpriced',
      }),
    });

    await fetch(`${baseUrl}/api/ai/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        prompt: 'Copy de teste',
        department: 'NER Creative',
        purpose: 'copywriting',
        overrideProviderId: 'openai',
        overrideModelId: 'gpt-custom-unpriced',
      }),
    });

    await fetch(`${baseUrl}/api/ai/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        prompt: 'Estratégia de teste',
        department: 'NER Strategy',
        purpose: 'marketing_strategy',
        overrideProviderId: 'openai',
        overrideModelId: 'gpt-4o',
      }),
    });

    // Before configuring gpt-custom-unpriced price -> unpriced_models alert must be present
    const dashBefore = await (
      await fetch(`${baseUrl}/api/ai/dashboard?organizationId=org-1&period=today`, {
        headers: { Authorization: `Bearer ${token}` },
      })
    ).json();

    assert.equal(dashBefore.byProvider[0].key, 'openai');
    assert.ok(dashBefore.byDepartment.some((d: any) => d.key === 'NER Creative'));
    assert.ok(dashBefore.byDepartment.some((d: any) => d.key === 'NER Strategy'));
    assert.ok(dashBefore.byModel.some((m: any) => m.key === 'openai/gpt-custom-unpriced'));
    assert.ok(dashBefore.alerts.some((a: any) => a.scope === 'unpriced_models'));

    // Configure pricing table for gpt-custom-unpriced via PUT /api/ai/pricing
    const priceRes = await fetch(`${baseUrl}/api/ai/pricing`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        items: [
          {
            providerId: 'openai',
            modelId: 'gpt-custom-unpriced',
            inputCostPer1M: 10,
            outputCostPer1M: 20,
            pricingVerified: true,
          },
        ],
      }),
    });
    assert.equal(priceRes.status, 200);

    // Lower daily limit to trigger daily_limit alert
    await fetch(`${baseUrl}/api/ai/cost-policy`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        organizationId: 'org-1',
        dailyLimitUsd: 0.001,
        monthlyLimitUsd: 100,
        alertThresholdPct: 80,
        departmentLimitsUsd: { 'NER Creative': 0.0005 },
      }),
    });

    const dashAfter = await (
      await fetch(`${baseUrl}/api/ai/dashboard?organizationId=org-1&period=today`, {
        headers: { Authorization: `Bearer ${token}` },
      })
    ).json();

    const customModelRow = dashAfter.byModel.find((m: any) => m.key === 'openai/gpt-custom-unpriced');
    assert.ok(customModelRow);
    // 100 in @ $10/1M ($0.001) + 50 out @ $20/1M ($0.001) = $0.002
    assert.equal(customModelRow.costUsd, 0.002);
    assert.equal(customModelRow.unpricedRequests, 0);
    assert.ok(dashAfter.alerts.some((a: any) => a.scope === 'organization_daily' && a.severity === 'critical'));
    assert.ok(dashAfter.alerts.some((a: any) => a.scope === 'department_daily' && a.department === 'NER Creative'));
  } finally {
    await cleanup();
  }
});

