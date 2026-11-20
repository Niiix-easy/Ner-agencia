import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { AddressInfo } from 'node:net';
import { PersistentStore } from '../server/store.ts';
import { createApp } from '../server/app.ts';
import { resetLoginRateLimiter } from '../server/middleware/auth.ts';
import {
  AI_PROVIDER_ADAPTERS,
  AiProviderAdapter,
} from '../server/ai/providers.ts';
import { AiUpstreamError } from '../server/ai/observability.ts';
import { buildUsageAnalytics, estimateRequestCost } from '../server/ai/cost-usage.ts';
import {
  AiModelEntry,
  AiProviderCapabilities,
  AiProviderId,
  AiUsageLog,
} from '../server/ai/types.ts';

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
 * Used exclusively inside automated tests to simulate provider telemetry (cached tokens,
 * reasoning tokens, missing usage metadata, upstream errors) without real external API calls.
 */
function createCostMockAdapter(
  providerId: AiProviderId,
  config: {
    inputTokens?: number;
    outputTokens?: number;
    cachedTokens?: number;
    reasoningTokens?: number;
    usageReported?: boolean;
    providerReportedCostUsd?: number | null;
    failNext?: boolean;
  } = {}
): AiProviderAdapter {
  let failFlag = Boolean(config.failNext);
  return {
    providerId,
    displayName: `TestMock ${providerId}`,
    capabilities: DEFAULT_CAPS,
    async testConnection() {
      return { ok: true, latencyMs: 10, modelsCount: 1, message: 'OK' };
    },
    async listModels() {
      return [];
    },
    async generate(_creds, req) {
      if (failFlag) {
        failFlag = false;
        throw new AiUpstreamError(providerId, 'Erro upstream simulado', 503, 'unavailable');
      }
      const last = req.messages[req.messages.length - 1]?.content || '';
      const usageReported = config.usageReported !== false;
      return {
        text: `[${providerId}/${req.modelId}] ${last}`,
        modelUsed: req.modelId,
        inputTokens: usageReported ? (config.inputTokens ?? 1000) : 0,
        outputTokens: usageReported ? (config.outputTokens ?? 500) : 0,
        cachedTokens: usageReported ? (config.cachedTokens ?? 0) : 0,
        reasoningTokens: usageReported ? (config.reasoningTokens ?? 0) : 0,
        usageReported,
        providerReportedCostUsd: config.providerReportedCostUsd ?? null,
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
        inputTokens: req.texts.length * 25,
        usageReported: true,
      };
    },
  };
}

async function startCostTestServer(
  overrides: Partial<Record<AiProviderId, AiProviderAdapter>> = {}
) {
  resetLoginRateLimiter();
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ner-ai-cost-'));
  const dbPath = path.join(tmpDir, 'ner-ai-cost-db.json');
  const store = new PersistentStore(dbPath);
  const adapters: Record<AiProviderId, AiProviderAdapter> = {
    openai: createCostMockAdapter('openai'),
    anthropic: createCostMockAdapter('anthropic'),
    deepseek: createCostMockAdapter('deepseek'),
    gemini: createCostMockAdapter('gemini'),
    openrouter: createCostMockAdapter('openrouter'),
    ollama: createCostMockAdapter('ollama'),
    vllm: createCostMockAdapter('vllm'),
    huggingface: createCostMockAdapter('huggingface'),
    ...overrides,
  };
  const { app, aiGateway } = createApp(store, {
    aiAdapters: adapters,
    aiMasterKeyOverride: TEST_MASTER_KEY,
  });

  for (const pid of ['openai', 'gemini', 'anthropic', 'huggingface'] as AiProviderId[]) {
    aiGateway.saveProviderConfig({
      providerId: pid,
      organizationId: 'org-1',
      actorUserId: 'usr-1',
      scope: 'global',
      apiKey: `test-key-${pid}-1234567890`,
    });
  }

  const server = await new Promise<import('node:http').Server>((resolve) => {
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
  const data = await res.json();
  return { status: res.status, data };
}

test('Cost Engine: computes input/output/cached/reasoning breakdown without double billing and avoids inventing unavailable tokens', () => {
  const models: AiModelEntry[] = [
    {
      id: 'm1',
      providerId: 'openai',
      modelId: 'gpt-4.1',
      displayName: 'GPT-4.1',
      isActive: true,
      isDefaultForProvider: true,
      priority: 1,
      contextWindow: 1000000,
      capabilities: DEFAULT_CAPS,
      inputCostPer1M: 2.0,
      outputCostPer1M: 8.0,
      cacheInputCostPer1M: 0.5,
      reasoningCostPer1M: 12.0,
      currency: 'USD',
      pricingVerified: true,
      source: 'catalog',
      lastVerifiedAt: null,
    },
  ];

  // 1M input (400k cached -> 600k uncached), 500k output (100k reasoning -> 400k regular output)
  const fx = {
    baseCurrency: 'USD' as const,
    targetCurrency: 'BRL' as const,
    rate: 6.0,
    rateDate: '2026-11-19',
    source: 'Test FX',
    updatedAt: new Date().toISOString(),
  };

  const res = estimateRequestCost(models, 'openai', 'gpt-4.1', 1_000_000, 500_000, null, 400_000, 100_000, true, fx);
  // Expected:
  // input: 0.6M * $2.0 = $1.20
  // cache: 0.4M * $0.5 = $0.20
  // regular output: 0.4M * $8.0 = $3.20
  // reasoning: 0.1M * $12.0 = $1.20
  // total = $5.80 USD -> R$ 34.80 BRL
  assert.equal(res.inputCost, 1.2);
  assert.equal(res.cacheCost, 0.2);
  assert.equal(res.outputCost, 3.2);
  assert.equal(res.reasoningCost, 1.2);
  assert.equal(res.estimatedCostUsd, 5.8);
  assert.equal(res.totalCostBRL, 34.8);
  assert.equal(res.costStatus, 'estimated');

  // Missing provider usage -> unavailable, never fabricated
  const unavail = estimateRequestCost(models, 'openai', 'gpt-4.1', 0, 0, null, 0, 0, false, fx);
  assert.equal(unavail.estimatedCostUsd, null);
  assert.equal(unavail.totalCostBRL, null);
  assert.equal(unavail.costStatus, 'unavailable');
  assert.equal(unavail.costReliable, false);
});

test('Provider Adapters: extract cached/reasoning tokens and usageReported across OpenAI, Anthropic, and Gemini responses', async () => {
  const originalFetch = globalThis.fetch;
  try {
    // 1. OpenAI-compatible response with reasoning & cached tokens
    globalThis.fetch = (async () =>
      new Response(
        JSON.stringify({
          model: 'gpt-4.1',
          choices: [{ message: { content: 'ok-oai' } }],
          usage: {
            prompt_tokens: 1200,
            completion_tokens: 300,
            prompt_tokens_details: { cached_tokens: 400 },
            completion_tokens_details: { reasoning_tokens: 80 },
          },
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      )) as typeof fetch;

    const oai = AI_PROVIDER_ADAPTERS.openai;
    const oaiRes = await oai.generate(
      { apiKey: 'test-key', baseUrl: 'https://api.openai.com/v1', source: 'env' },
      { modelId: 'gpt-4.1', messages: [{ role: 'user', content: 'hi' }] }
    );
    assert.equal(oaiRes.inputTokens, 1200);
    assert.equal(oaiRes.outputTokens, 300);
    assert.equal(oaiRes.cachedTokens, 400);
    assert.equal(oaiRes.reasoningTokens, 80);
    assert.equal(oaiRes.usageReported, true);

    // 2. Gemini response with thoughtsTokenCount & cachedContentTokenCount
    globalThis.fetch = (async () =>
      new Response(
        JSON.stringify({
          candidates: [{ content: { parts: [{ text: 'ok-gem' }] } }],
          usageMetadata: {
            promptTokenCount: 900,
            candidatesTokenCount: 250,
            cachedContentTokenCount: 150,
            thoughtsTokenCount: 60,
          },
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      )) as typeof fetch;

    const gem = AI_PROVIDER_ADAPTERS.gemini;
    const gemRes = await gem.generate(
      { apiKey: 'gem-key', baseUrl: 'https://generativelanguage.googleapis.com/v1beta', source: 'env' },
      { modelId: 'gemini-2.5-flash', messages: [{ role: 'user', content: 'hi' }] }
    );
    assert.equal(gemRes.inputTokens, 900);
    assert.equal(gemRes.outputTokens, 250);
    assert.equal(gemRes.cachedTokens, 150);
    assert.equal(gemRes.reasoningTokens, 60);
    assert.equal(gemRes.usageReported, true);

    // 3. Anthropic missing usage -> usageReported: false
    globalThis.fetch = (async () =>
      new Response(
        JSON.stringify({
          model: 'claude-sonnet-4-5',
          content: [{ type: 'text', text: 'ok-ant' }],
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      )) as typeof fetch;

    const ant = AI_PROVIDER_ADAPTERS.anthropic;
    const antRes = await ant.generate(
      { apiKey: 'ant-key', baseUrl: 'https://api.anthropic.com', source: 'env' },
      { modelId: 'claude-sonnet-4-5', messages: [{ role: 'user', content: 'hi' }] }
    );
    assert.equal(antRes.usageReported, false);
    assert.equal(antRes.inputTokens, 0);
    assert.equal(antRes.outputTokens, 0);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('Cost Intelligence API: telemetry recording, unavailable tokens never fabricated, USD->BRL, actions drilldown, p95, model comparison & client billing segregation', async () => {
  const { baseUrl, store, cleanup } = await startCostTestServer({
    openai: createCostMockAdapter('openai', {
      inputTokens: 2000,
      outputTokens: 1000,
      cachedTokens: 500,
      reasoningTokens: 200,
      usageReported: true,
    }),
    gemini: createCostMockAdapter('gemini', {
      inputTokens: 1000,
      outputTokens: 400,
      cachedTokens: 100,
      reasoningTokens: 0,
      usageReported: true,
    }),
    huggingface: createCostMockAdapter('huggingface', {
      usageReported: false, // provider omits usage metadata
    }),
  });

  try {
    const admin = await loginAs(baseUrl, 'maycon@neragency.com');
    const token = admin.data.token;

    // Configure exchange rate USD->BRL = 6.00
    const fxRes = await fetch(`${baseUrl}/api/ai/exchange-rate`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ rate: 6.0, rateDate: '2026-11-19', source: 'Banco Central Teste' }),
    });
    assert.equal(fxRes.status, 200);

    // Register a custom standardized action
    const actRes = await fetch(`${baseUrl}/api/ai/actions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        id: 'creative.carousel.generate',
        department: 'NER Creative',
        name: 'Carrossel Instagram',
        purpose: 'creatives',
        isCritical: false,
      }),
    });
    assert.equal(actRes.status, 201);

    // Run same action across 2 models (OpenAI gpt-4o-mini vs Gemini gemini-4-hydrogen) and 2 client billing categories
    await fetch(`${baseUrl}/api/ai/department/execute`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        department: 'NER Creative',
        action: 'creative.copy.generate',
        taskInput: 'Gerar copy A',
        clientId: 'cli-1',
        billingCategory: 'client_included',
        overrideProviderId: 'openai',
        overrideModelId: 'gpt-4o-mini',
      }),
    });

    await fetch(`${baseUrl}/api/ai/department/execute`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        department: 'NER Creative',
        action: 'creative.copy.generate',
        taskInput: 'Gerar copy B',
        clientId: 'cli-1',
        billingCategory: 'client_overage',
        overrideProviderId: 'gemini',
        overrideModelId: 'gemini-4-hydrogen',
      }),
    });

    // Unavailable usage call via HuggingFace
    const hfExec = await fetch(`${baseUrl}/api/ai/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        department: 'NER Intelligence',
        action: 'intelligence.executive.summary',
        prompt: 'Resuma dados sem usage',
        overrideProviderId: 'huggingface',
        overrideModelId: 'meta-llama/Llama-3.3-70B-Instruct',
      }),
    });
    assert.equal(hfExec.status, 200);
    const hfBody = await hfExec.json();
    assert.equal(hfBody.usageStatus, 'unavailable');
    assert.equal(hfBody.costStatus, 'unavailable');
    assert.equal(hfBody.estimatedCostUsd, null);

    // Fetch dashboard analytics
    const dashRes = await fetch(`${baseUrl}/api/ai/dashboard?period=today`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    assert.equal(dashRes.status, 200);
    const dash = await dashRes.json();

    assert.equal(dash.summary.totalRequests, 3);
    assert.equal(dash.summary.totalCachedInputTokens, 600);
    assert.equal(dash.summary.totalReasoningTokens, 200);
    assert.equal(dash.summary.unavailableUsageCount, 1);
    assert.ok(dash.summary.totalCostUsd > 0);
    assert.ok(Math.abs(dash.summary.totalCostBrl - dash.summary.totalCostUsd * 6.0) < 0.01);
    assert.ok(dash.summary.projectedNextMonthUsd > 0);

    // Verify dynamic pricing catalog update via PUT /api/ai/pricing
    const priceRes = await fetch(`${baseUrl}/api/ai/pricing`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        items: [
          {
            providerId: 'openai',
            modelId: 'gpt-4o-mini',
            inputCostPer1M: 0.3,
            outputCostPer1M: 1.2,
            cacheInputCostPer1M: 0.1,
            reasoningCostPer1M: 1.2,
          },
        ],
      }),
    });
    assert.equal(priceRes.status, 200);
    const priceJson = await priceRes.json();
    assert.equal(priceJson.updatedCount, 1);
    assert.equal(priceJson.models[0].inputCostPer1M, 0.3);
    assert.equal(priceJson.models[0].reasoningCostPer1M, 1.2);

    // Department drilldown includes actions
    const creativeDept = dash.byDepartment.find((d: any) => d.key === 'NER Creative');
    assert.ok(creativeDept);
    assert.ok(creativeDept.actions.some((a: any) => a.action === 'creative.copy.generate'));

    // Action analytics includes model comparison & p95
    const copyAction = dash.byAction.find((a: any) => a.key === 'creative.copy.generate');
    assert.ok(copyAction);
    assert.equal(copyAction.modelBreakdown.length, 2);
    assert.ok(copyAction.p95Tokens >= 1400);
    assert.equal(copyAction.dailyEvolution.length, 1);

    // Client billing categories separated
    const cli1 = dash.byClient.find((c: any) => c.clientId === 'cli-1');
    assert.ok(cli1);
    assert.equal(cli1.byCategory.client_included.requests, 1);
    assert.equal(cli1.byCategory.client_overage.requests, 1);
    assert.equal(cli1.byCategory.internal_agency.requests, 0);

    // Inspect sanitized detail modal endpoint -> must NOT expose any secrets or raw prompts
    const firstLog = store.getState().aiGateway.usageLogs[0];
    const detailRes = await fetch(`${baseUrl}/api/ai/usage-logs/${firstLog.id}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    assert.equal(detailRes.status, 200);
    const detailText = await detailRes.text();
    assert.equal(detailText.includes('Gerar copy'), false);
    assert.equal(detailText.includes('encryptedApiKey'), false);

    // Reconcile usage log with provider reported cost
    const recRes = await fetch(`${baseUrl}/api/ai/usage-logs/${firstLog.id}/reconcile`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ providerReportedCostUsd: 0.0123, reconciledWithProvider: true }),
    });
    assert.equal(recRes.status, 200);
    const recJson = await recRes.json();
    assert.equal(recJson.reconciledWithProvider, true);
    assert.equal(recJson.costStatus, 'confirmed');
  } finally {
    await cleanup();
  }
});

test('Cost Intelligence Governance: 50/75/90/100% alerts, block_non_essential preserving critical ops, fallback_economical, and AiLimitException', async () => {
  const { baseUrl, aiGateway, cleanup } = await startCostTestServer({
    openai: createCostMockAdapter('openai', {
      inputTokens: 500_000,
      outputTokens: 100_000, // gpt-4o: 0.5*2.5 + 0.1*10 = $2.25 per call
      usageReported: true,
    }),
    gemini: createCostMockAdapter('gemini', {
      inputTokens: 500_000,
      outputTokens: 100_000, // gemini-4-hydrogen: 0.5*0.15 + 0.1*0.60 = $0.135 per call
      usageReported: true,
    }),
  });

  try {
    const admin = await loginAs(baseUrl, 'maycon@neragency.com');
    const token = admin.data.token;

    // 1. Set strict daily limit = $1.50, monthly = $4.00, onExceedAction = 'block_non_essential'
    await fetch(`${baseUrl}/api/ai/cost-policy`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        organizationId: 'org-1',
        dailyLimitUsd: 1.5,
        monthlyLimitUsd: 4.0,
        userDailyLimitUsd: 50,
        alertThresholds: [50, 75, 90, 100],
        onExceedAction: 'block_non_essential',
      }),
    });

    // First call spends $2.25 (56.25% of $4.00 monthly limit -> triggers 50% threshold alert AND exceeds $1.50 daily limit)
    const first = await fetch(`${baseUrl}/api/ai/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        department: 'NER Strategy',
        action: 'strategy.diagnosis',
        prompt: 'Call 1',
        overrideProviderId: 'openai',
        overrideModelId: 'gpt-4o',
      }),
    });
    assert.equal(first.status, 200);

    const dashAfterOne = await (
      await fetch(`${baseUrl}/api/ai/dashboard`, { headers: { Authorization: `Bearer ${token}` } })
    ).json();
    assert.ok(dashAfterOne.alerts.some((a: any) => a.scope === 'organization_daily' && a.percentageUsed >= 100));
    assert.ok(dashAfterOne.alerts.some((a: any) => a.scope === 'organization_monthly' && a.thresholdPct === 50));

    // Second call (non-critical) must be blocked (429)
    const nonCritBlocked = await fetch(`${baseUrl}/api/ai/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        department: 'NER Creative',
        action: 'creative.copy.generate',
        isCritical: false,
        prompt: 'Call 2 non critical',
        overrideProviderId: 'openai',
        overrideModelId: 'gpt-4o',
      }),
    });
    assert.equal(nonCritBlocked.status, 429);

    // Critical operation must still be allowed under 'block_non_essential'
    const critAllowed = await fetch(`${baseUrl}/api/ai/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        department: 'NER Client Experience',
        action: 'client.support.reply',
        isCritical: true,
        prompt: 'Call 3 critical',
        overrideProviderId: 'gemini',
        overrideModelId: 'gemini-4-hydrogen',
      }),
    });
    assert.equal(critAllowed.status, 200);

    // Grant temporary AiLimitException (+$10 org budget) -> non-critical succeeds!
    const excRes = await fetch(`${baseUrl}/api/ai/limit-exceptions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        organizationId: 'org-1',
        scope: 'organization',
        targetKey: 'org-1',
        extraBudgetUsd: 10,
        reason: 'Lançamento urgente',
      }),
    });
    assert.equal(excRes.status, 201);
    const exc = await excRes.json();

    const unblocked = await fetch(`${baseUrl}/api/ai/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        department: 'NER Creative',
        action: 'creative.copy.generate',
        isCritical: false,
        prompt: 'Call 4 with exception',
        overrideProviderId: 'gemini',
        overrideModelId: 'gemini-4-hydrogen',
      }),
    });
    assert.equal(unblocked.status, 200);

    // Revoke exception and switch policy to fallback_economical
    await fetch(`${baseUrl}/api/ai/limit-exceptions/${exc.id}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` },
    });
    aiGateway.updateCostPolicy('org-1', { onExceedAction: 'fallback_economical' }, 'usr-admin');

    const ecoRes = await fetch(`${baseUrl}/api/ai/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        department: 'NER Strategy',
        action: 'strategy.diagnosis',
        prompt: 'Call 5 economical downgrade',
        overrideProviderId: 'openai',
        overrideModelId: 'gpt-4o',
      }),
    });
    assert.equal(ecoRes.status, 200);
    const ecoBody = await ecoRes.json();
    assert.notEqual(ecoBody.modelId, 'gpt-4o'); // Downgraded to cheaper model
  } finally {
    await cleanup();
  }
});

test('Cost Intelligence Reliability: anomaly detection (possible vs confirmed), idempotencyKey deduplication, and resilient accounting alert on store failure', async () => {
  const { baseUrl, store, aiGateway, cleanup } = await startCostTestServer();
  try {
    const admin = await loginAs(baseUrl, 'maycon@neragency.com');
    const token = admin.data.token;

    // 1. Idempotency deduplication test
    const idemKey = 'idem-cost-test-001';
    const r1 = await aiGateway.execute({
      organizationId: 'org-1',
      userId: 'usr-1',
      department: 'NER Strategy',
      action: 'strategy.diagnosis',
      purpose: 'marketing_strategy',
      idempotencyKey: idemKey,
      messages: [{ role: 'user', content: 'A' }],
    });
    assert.ok(r1.requestId);
    // Simulate duplicate recordUsage with same idempotencyKey
    const existingCount = store.getState().aiGateway.usageLogs.length;
    aiGateway.recordUsage({
      ...store.getState().aiGateway.usageLogs[0],
      requestId: 'req-dup-attempt',
      idempotencyKey: idemKey,
    });
    assert.equal(store.getState().aiGateway.usageLogs.length, existingCount);

    // 2. Anomaly detection with sample guard (2 samples = possible, 3+ samples = confirmed)
    aiGateway.recordUsage({
      requestId: 'req-anom-1',
      traceId: 'tr-1',
      organizationId: 'org-1',
      userId: 'usr-1',
      department: 'NER Web',
      action: 'web.seo.optimize',
      purpose: 'copywriting',
      providerId: 'openai',
      modelId: 'gpt-4.1-mini',
      fallbackUsed: false,
      operation: 'chat',
      inputTokens: 500,
      outputTokens: 500,
      cachedTokens: 0,
      estimatedCostUsd: 0.001,
      providerReportedCostUsd: null,
      costReliable: true,
      latencyMs: 100,
      status: 'success',
      errorMessage: null,
    });
    aiGateway.recordUsage({
      requestId: 'req-anom-2',
      traceId: 'tr-2',
      organizationId: 'org-1',
      userId: 'usr-1',
      department: 'NER Web',
      action: 'web.seo.optimize',
      purpose: 'copywriting',
      providerId: 'openai',
      modelId: 'gpt-4.1-mini',
      fallbackUsed: false,
      operation: 'chat',
      inputTokens: 5000,
      outputTokens: 5000,
      cachedTokens: 0,
      estimatedCostUsd: 0.01,
      providerReportedCostUsd: null,
      costReliable: true,
      latencyMs: 100,
      status: 'success',
      errorMessage: null,
    });

    const dash2 = aiGateway.getDashboardAnalytics('org-1');
    const anomPossible = dash2.anomalies.find((a) => a.subject === 'web.seo.optimize');
    assert.ok(anomPossible);
    assert.equal(anomPossible.confidence, 'possible');

    // Add 3rd baseline sample -> confidence upgrades to 'confirmed'
    aiGateway.recordUsage({
      requestId: 'req-anom-3',
      traceId: 'tr-3',
      organizationId: 'org-1',
      userId: 'usr-1',
      department: 'NER Web',
      action: 'web.seo.optimize',
      purpose: 'copywriting',
      providerId: 'openai',
      modelId: 'gpt-4.1-mini',
      fallbackUsed: false,
      operation: 'chat',
      inputTokens: 450,
      outputTokens: 450,
      cachedTokens: 0,
      estimatedCostUsd: 0.0009,
      providerReportedCostUsd: null,
      costReliable: true,
      latencyMs: 100,
      status: 'success',
      errorMessage: null,
    });
    const dash3 = aiGateway.getDashboardAnalytics('org-1');
    const anomConfirmed = dash3.anomalies.find((a) => a.subject === 'web.seo.optimize');
    assert.equal(anomConfirmed?.confidence, 'confirmed');

    // 3. Resilient persistence: failing store.save() must NOT drop AI response & must create accountingAlert
    const origSave = store.save.bind(store);
    store.save = () => {
      throw new Error('DISK_FULL_SIMULATED');
    };
    const resSurvives = await aiGateway.execute({
      organizationId: 'org-1',
      userId: 'usr-1',
      department: 'NER Strategy',
      action: 'strategy.diagnosis',
      purpose: 'marketing_strategy',
      messages: [{ role: 'user', content: 'Must still return text' }],
    });
    store.save = origSave;
    assert.ok(resSurvives.text.includes('Must still return text'));
    const accAlerts = aiGateway.listAccountingAlerts('org-1');
    assert.ok(accAlerts.length >= 1);
    assert.equal(accAlerts[0].resolved, false);

    // Resolve accounting alert via API
    const resolveRes = await fetch(`${baseUrl}/api/ai/accounting-alerts/${accAlerts[0].id}/resolve`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ organizationId: 'org-1' }),
    });
    assert.equal(resolveRes.status, 200);
    assert.equal((await resolveRes.json()).resolved, true);
  } finally {
    await cleanup();
  }
});

test('Cost Intelligence Exports & Security: CSV/XLSX/PDF real downloads, multi-dimensional filters, RBAC and tenant isolation', async () => {
  const { baseUrl, aiGateway, cleanup } = await startCostTestServer();
  try {
    const admin1 = await loginAs(baseUrl, 'maycon@neragency.com'); // org-1
    const admin2 = await loginAs(baseUrl, 'marcos@nersp.com'); // org-2
    const clientUser = await loginAs(baseUrl, 'lucas@techflow.io'); // Cliente org-1

    await aiGateway.execute({
      organizationId: 'org-1',
      userId: admin1.data.user.id,
      clientId: 'cli-1',
      billingCategory: 'client_additional',
      department: 'NER Creative',
      action: 'creative.copy.generate',
      purpose: 'creatives',
      messages: [{ role: 'user', content: 'Export test' }],
    });

    // CSV Export
    const csvRes = await fetch(
      `${baseUrl}/api/ai/reports/export?format=csv&department=${encodeURIComponent('NER Creative')}&billingCategory=client_additional`,
      { headers: { Authorization: `Bearer ${admin1.data.token}` } }
    );
    assert.equal(csvRes.status, 200);
    assert.ok(csvRes.headers.get('content-type')?.includes('text/csv'));
    const csvBuf = Buffer.from(await csvRes.arrayBuffer());
    assert.equal(csvBuf.slice(0, 3).equals(Buffer.from([0xef, 0xbb, 0xbf])), true); // UTF-8 BOM
    const csvText = csvBuf.toString('utf8');
    assert.ok(csvText.includes('creative.copy.generate'));

    // XLSX Export (valid ZIP PK signature)
    const xlsxRes = await fetch(`${baseUrl}/api/ai/reports/export?format=xlsx`, {
      headers: { Authorization: `Bearer ${admin1.data.token}` },
    });
    assert.equal(xlsxRes.status, 200);
    const xlsxBuf = Buffer.from(await xlsxRes.arrayBuffer());
    assert.equal(xlsxBuf.slice(0, 4).equals(Buffer.from([0x50, 0x4b, 0x03, 0x04])), true);

    // PDF Export (valid %PDF-1.4 header)
    const pdfRes = await fetch(`${baseUrl}/api/ai/reports/export?format=pdf`, {
      headers: { Authorization: `Bearer ${admin1.data.token}` },
    });
    assert.equal(pdfRes.status, 200);
    const pdfBuf = Buffer.from(await pdfRes.arrayBuffer());
    assert.equal(pdfBuf.subarray(0, 8).toString('ascii'), '%PDF-1.4');

    // RBAC: Cliente role cannot access cost dashboard or export reports
    const cliDash = await fetch(`${baseUrl}/api/ai/dashboard`, {
      headers: { Authorization: `Bearer ${clientUser.data.token}` },
    });
    assert.equal(cliDash.status, 403);

    const cliExport = await fetch(`${baseUrl}/api/ai/reports/export?format=csv`, {
      headers: { Authorization: `Bearer ${clientUser.data.token}` },
    });
    assert.equal(cliExport.status, 403);

    // Multi-tenant isolation: Org-2 admin cannot query Org-1 cost intelligence
    const crossTenant = await fetch(`${baseUrl}/api/ai/dashboard?organizationId=org-1`, {
      headers: { Authorization: `Bearer ${admin2.data.token}` },
    });
    assert.equal(crossTenant.status, 403);
  } finally {
    await cleanup();
  }
});

test('Models Governance: lists active models, enforces per-model token limits + near-limit alerts, and validates preferred model by Gateway capabilities', async () => {
  const { baseUrl, store, cleanup } = await startCostTestServer({
    gemini: createCostMockAdapter('gemini', {
      inputTokens: 1500,
      outputTokens: 500, // 2000 tokens per call
      usageReported: true,
    }),
  });

  try {
    const admin = await loginAs(baseUrl, 'maycon@neragency.com');
    const token = admin.data.token;

    // 1. Deactivate one model and verify activeOnly=true filters it out
    const targetToDisable = store.getState().aiGateway.models.find((m) => m.modelId === 'gpt-4o');
    assert.ok(targetToDisable);
    await fetch(`${baseUrl}/api/ai/models/${targetToDisable.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ isActive: false }),
    });

    const activeRes = await fetch(`${baseUrl}/api/ai/models?activeOnly=true`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    assert.equal(activeRes.status, 200);
    const activeModels = await activeRes.json();
    assert.equal(activeModels.some((m: any) => m.modelId === 'gpt-4o'), false);
    assert.equal(activeModels.every((m: any) => m.isActive === true), true);

    // 2. Define per-model token limits on gemini-4-hydrogen (maxInputTokens=500, maxOutputTokens=800, dailyTokenLimit=2500)
    const gemModel = store.getState().aiGateway.models.find((m) => m.modelId === 'gemini-4-hydrogen');
    assert.ok(gemModel);
    const patchLim = await fetch(`${baseUrl}/api/ai/models/${gemModel.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        maxInputTokens: 500,
        maxOutputTokens: 800,
        dailyTokenLimit: 2500,
      }),
    });
    assert.equal(patchLim.status, 200);
    const patchedModel = await patchLim.json();
    assert.equal(patchedModel.maxInputTokens, 500);
    assert.equal(patchedModel.maxOutputTokens, 800);
    assert.equal(patchedModel.dailyTokenLimit, 2500);

    // Oversized prompt (> 500 estimated input tokens = > ~1750 chars) must be rejected with 400
    const oversized = await fetch(`${baseUrl}/api/ai/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        department: 'NER Creative',
        purpose: 'copywriting',
        prompt: 'A'.repeat(2200),
        overrideProviderId: 'gemini',
        overrideModelId: 'gemini-4-hydrogen',
      }),
    });
    assert.equal(oversized.status, 400);

    // Normal call consumes 2000 tokens of 2500 dailyTokenLimit (80%) -> emits near-limit visual alert
    const okCall = await fetch(`${baseUrl}/api/ai/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        department: 'NER Creative',
        purpose: 'copywriting',
        prompt: 'Crie uma headline curta',
        overrideProviderId: 'gemini',
        overrideModelId: 'gemini-4-hydrogen',
      }),
    });
    assert.equal(okCall.status, 200);

    const dash = await (
      await fetch(`${baseUrl}/api/ai/dashboard`, { headers: { Authorization: `Bearer ${token}` } })
    ).json();
    const tokenNearAlert = dash.alerts.find((a: any) => a.scope === 'model_token_daily');
    assert.ok(tokenNearAlert);
    assert.equal(tokenNearAlert.percentageUsed, 80);

    // 3. Purpose capability governance: GET /purposes + reject incompatible model (embeddings-only for copywriting)
    const purposesRes = await fetch(`${baseUrl}/api/ai/purposes`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    assert.equal(purposesRes.status, 200);
    const purposesJson = await purposesRes.json();
    assert.ok(purposesJson.copywriting.requiredAny.includes('textGeneration'));
    assert.ok(purposesJson.embeddings.requiredAny.includes('embeddings'));

    const invalidAssign = await fetch(`${baseUrl}/api/ai/routing/copywriting`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        primaryProviderId: 'gemini',
        primaryModelId: 'gemini-embedding-2',
      }),
    });
    assert.equal(invalidAssign.status, 400);

    // Reject assigning disabled model
    const inactiveAssign = await fetch(`${baseUrl}/api/ai/routing/copywriting`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        primaryProviderId: 'openai',
        primaryModelId: 'gpt-4o',
      }),
    });
    assert.equal(inactiveAssign.status, 400);

    // Valid compatible active model assignment succeeds
    const validAssign = await fetch(`${baseUrl}/api/ai/routing/copywriting`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        primaryProviderId: 'gemini',
        primaryModelId: 'gemini-4-hydrogen',
      }),
    });
    assert.equal(validAssign.status, 200);
    const updatedRule = await validAssign.json();
    assert.equal(updatedRule.primaryModelId, 'gemini-4-hydrogen');
  } finally {
    await cleanup();
  }
});

test('NER AI Cost Intelligence — Projected Cost Run-Rate & 50/75/90/100% Threshold Alerts', () => {
  const nowIso = new Date().toISOString();
  const models: AiModelEntry[] = [
    {
      id: 'openai:gpt-4o',
      providerId: 'openai',
      modelId: 'gpt-4o',
      displayName: 'GPT-4o',
      isActive: true,
      isDefaultForProvider: true,
      priority: 1,
      contextWindow: 128_000,
      capabilities: DEFAULT_CAPS,
      inputCostPer1M: 2.5,
      outputCostPer1M: 10,
      pricingVerified: true,
      priceSource: 'Test',
      source: 'catalog',
      lastVerifiedAt: nowIso,
    },
  ];

  const logs: AiUsageLog[] = [
    {
      id: 'log-proj-1',
      requestId: 'req-proj-1',
      traceId: 'trace-proj-1',
      organizationId: 'org-proj',
      userId: 'usr-1',
      department: 'NER Creative',
      purpose: 'copywriting',
      action: 'create_copy',
      providerId: 'openai',
      modelId: 'gpt-4o',
      fallbackUsed: false,
      operation: 'chat',
      inputTokens: 100_000,
      outputTokens: 55_000, // 0.25 + 0.55 = $0.80 USD
      cachedTokens: 0,
      usageStatus: 'confirmed',
      costReliable: true,
      estimatedCostUsd: 0.8,
      providerReportedCostUsd: null,
      latencyMs: 320,
      status: 'success',
      createdAt: nowIso,
    },
  ];

  const dashboard = buildUsageAnalytics(
    logs,
    'org-proj',
    models,
    {
      organizationId: 'org-proj',
      dailyLimitUsd: 1.0, // actual = 80%, projected 24h >= 80%
      monthlyLimitUsd: 2.0, // actual = 40% (<50% actual), projected month-end >= 50%/100%
      userDailyLimitUsd: 5.0,
      alertThresholdPct: 80,
      alertThresholds: [50, 75, 90, 100],
      blockOnExceed: false,
      onExceedAction: 'notify',
      departmentLimitsUsd: {
        'NER Creative': 1.0,
      },
      updatedAt: nowIso,
    },
    { period: 'all' },
    {
      baseCurrency: 'USD',
      targetCurrency: 'BRL',
      rate: 5.5,
      rateDate: nowIso.slice(0, 10),
      source: 'Test FX',
      updatedAt: nowIso,
    }
  );

  assert.ok(dashboard.budgetProgress, 'budgetProgress should be present');
  assert.ok(dashboard.budgetProgress.projectedDailyUsd >= 0.8);
  assert.ok(dashboard.budgetProgress.projectedMonthEndUsd >= 0.8);
  assert.ok(dashboard.budgetProgress.projectedDailyPct >= 80);
  assert.ok(dashboard.budgetProgress.projectedMonthlyPct >= 50);

  const projDailyAlert = dashboard.alerts.find((a: any) => a.scope === 'projected_daily');
  const projMonthlyAlert = dashboard.alerts.find((a: any) => a.scope === 'projected_monthly');
  const projDeptAlert = dashboard.alerts.find((a: any) => a.scope === 'projected_department');

  assert.ok(projDailyAlert, 'should emit projected_daily alert');
  assert.equal(projDailyAlert.isProjected, true);
  assert.ok([50, 75, 90, 100].includes(projDailyAlert.thresholdPct!));

  assert.ok(projMonthlyAlert, 'should emit projected_monthly alert');
  assert.equal(projMonthlyAlert.isProjected, true);

  assert.ok(projDeptAlert, 'should emit projected_department alert');
  assert.equal(projDeptAlert.department, 'NER Creative');
});

test('Segmented CSV/PDF Billing Reports (Provider & Client) and Global/Org/Department Preventive Limits in AI Gateway', async () => {
  const { baseUrl, aiGateway, cleanup } = await startCostTestServer({
    openai: createCostMockAdapter('openai', {
      inputTokens: 200_000,
      outputTokens: 100_000, // gpt-4o: 0.2*2.5 + 0.1*10 = $1.50 per call
      usageReported: true,
    }),
  });

  try {
    const superAdmin = await loginAs(baseUrl, 'maycon@neragency.com'); // Super Admin org-1
    const nonAdmin = await loginAs(baseUrl, 'carlos@neragency.com'); // Gestor de Tráfego
    const token = superAdmin.data.token;

    // Generate spend tagged to client cli-1 (TechFlow) and NER Creative
    const exec1 = await aiGateway.execute({
      organizationId: 'org-1',
      userId: superAdmin.data.user.id,
      clientId: 'cli-1',
      billingCategory: 'client_additional',
      department: 'NER Creative',
      action: 'creative.copy.generate',
      purpose: 'creatives',
      overrideProviderId: 'openai',
      overrideModelId: 'gpt-4o',
      messages: [{ role: 'user', content: 'Campanha TechFlow' }],
    });
    assert.ok(exec1.requestId);

    // 1. Segmented CSV exports: provider_client, provider, client
    const csvProvClientRes = await fetch(
      `${baseUrl}/api/ai/reports/export?format=csv&segmentBy=provider_client`,
      { headers: { Authorization: `Bearer ${token}` } }
    );
    assert.equal(csvProvClientRes.status, 200);
    const csvProvClientText = await csvProvClientRes.text();
    assert.ok(csvProvClientText.includes('RESUMO DE FATURAMENTO POR PROVEDOR'));
    assert.ok(csvProvClientText.includes('RESUMO DE FATURAMENTO POR CLIENTE'));
    assert.ok(csvProvClientText.includes('FATURAMENTO CRUZADO: PROVEDOR x CLIENTE'));
    assert.ok(csvProvClientText.includes('TechFlow'));
    assert.ok(csvProvClientText.includes('openai'));

    const csvProvRes = await fetch(
      `${baseUrl}/api/ai/reports/export?format=csv&segmentBy=provider`,
      { headers: { Authorization: `Bearer ${token}` } }
    );
    assert.equal(csvProvRes.status, 200);
    const csvProvText = await csvProvRes.text();
    assert.ok(csvProvText.includes('Provedor,Requisicoes,Tokens Entrada'));
    assert.ok(csvProvText.includes('openai'));

    const csvCliRes = await fetch(
      `${baseUrl}/api/ai/reports/export?format=csv&segmentBy=client`,
      { headers: { Authorization: `Bearer ${token}` } }
    );
    assert.equal(csvCliRes.status, 200);
    const csvCliText = await csvCliRes.text();
    assert.ok(csvCliText.includes('Cliente ID,Cliente Nome,Categoria Faturamento'));
    assert.ok(csvCliText.includes('TechFlow'));

    const csvDeptRes = await fetch(
      `${baseUrl}/api/ai/reports/export?format=csv&segmentBy=department`,
      { headers: { Authorization: `Bearer ${token}` } }
    );
    assert.equal(csvDeptRes.status, 200);
    const csvDeptText = await csvDeptRes.text();
    assert.ok(csvDeptText.includes('Departamento,Requisicoes,Tokens Entrada'));
    assert.ok(csvDeptText.includes('NER Creative'));

    const csvFullSegRes = await fetch(
      `${baseUrl}/api/ai/reports/export?format=csv&segmentBy=client_provider_department`,
      { headers: { Authorization: `Bearer ${token}` } }
    );
    assert.equal(csvFullSegRes.status, 200);
    const csvFullSegText = await csvFullSegRes.text();
    assert.ok(csvFullSegText.includes('RESUMO DE FATURAMENTO POR DEPARTAMENTO'));
    assert.ok(csvFullSegText.includes('FATURAMENTO CRUZADO: CLIENTE x PROVEDOR x DEPARTAMENTO'));

    // 2. Segmented PDF export (valid PDF containing client, provider & department billing sections)
    const pdfSegRes = await fetch(
      `${baseUrl}/api/ai/reports/export?format=pdf&segmentBy=client_provider_department`,
      { headers: { Authorization: `Bearer ${token}` } }
    );
    assert.equal(pdfSegRes.status, 200);
    const pdfBuf = Buffer.from(await pdfSegRes.arrayBuffer());
    const pdfAscii = pdfBuf.toString('latin1');
    assert.equal(pdfBuf.subarray(0, 8).toString('ascii'), '%PDF-1.4');
    assert.ok(pdfAscii.includes('FATURAMENTO SEGMENTADO POR PROVEDOR'));
    assert.ok(pdfAscii.includes('FATURAMENTO SEGMENTADO POR CLIENTE'));
    assert.ok(pdfAscii.includes('FATURAMENTO SEGMENTADO POR DEPARTAMENTO'));
    assert.ok(pdfAscii.includes('MATRIZ DE FATURAMENTO: CLIENTE x PROVEDOR x DEPARTAMENTO'));

    // 3. RBAC check: non-admin cannot change global cost policy
    const nonAdminPut = await fetch(`${baseUrl}/api/ai/global-cost-policy`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${nonAdmin.data.token}`,
      },
      body: JSON.stringify({ dailyLimitUsd: 999 }),
    });
    assert.equal(nonAdminPut.status, 403);

    // 4. Configure department limit, per-model limit, alertThresholds & global daily limit ($1.00, already exceeded by $1.50 spend)
    const deptPut = await fetch(`${baseUrl}/api/ai/cost-policy`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        organizationId: 'org-1',
        dailyLimitUsd: 50,
        monthlyLimitUsd: 500,
        alertThresholds: [50, 75, 90, 100],
        departmentLimitsUsd: { 'NER Creative': 1.0 },
        modelLimitsUsd: { 'openai/gpt-4o': 1.0 },
      }),
    });
    assert.equal(deptPut.status, 200);

    const globalPut = await fetch(`${baseUrl}/api/ai/global-cost-policy`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        dailyLimitUsd: 1.0,
        monthlyLimitUsd: 10.0,
        alertThresholds: [50, 90, 100],
        onExceedAction: 'block_all',
      }),
    });
    assert.equal(globalPut.status, 200);
    const savedGlobal = await globalPut.json();
    assert.equal(savedGlobal.dailyLimitUsd, 1.0);
    assert.equal(savedGlobal.onExceedAction, 'block_all');
    assert.deepEqual(savedGlobal.alertThresholds, [50, 90, 100]);

    // 5. Preventive monitoring snapshot accurately reflects global, org, department, modelStatus, activeAlerts & all orgs
    const snapRes = await fetch(
      `${baseUrl}/api/ai/preventive-monitoring?organizationId=org-1`,
      { headers: { Authorization: `Bearer ${token}` } }
    );
    assert.equal(snapRes.status, 200);
    const snap = await snapRes.json();
    assert.ok(snap.globalDailySpentUsd >= 1.49);
    assert.ok(snap.globalDailyPct >= 100);
    assert.ok(snap.organizationDailySpentUsd >= 1.49);
    assert.deepEqual(snap.globalPolicy.alertThresholds, [50, 90, 100]);
    assert.deepEqual(snap.organizationPolicy.alertThresholds, [50, 75, 90, 100]);
    assert.ok(snap.departmentStatus.some((d: any) => d.department === 'NER Creative' && d.pct >= 100));
    assert.ok(snap.modelStatus.some((m: any) => m.modelKey === 'openai/gpt-4o' && m.usdPct >= 100));
    assert.ok(snap.activeAlerts.some((a: any) => a.scope === 'global_daily' && a.thresholdPct === 100));
    assert.ok(snap.activeAlerts.some((a: any) => a.scope === 'department_daily' && a.thresholdPct === 100));
    assert.ok(snap.activeAlerts.some((a: any) => a.scope === 'model_daily' && a.thresholdPct === 100));
    assert.ok(Array.isArray(snap.organizationsSummary) && snap.organizationsSummary.length >= 2);

    // 6. AI Gateway preventive check blocks new execution even in org-2 because global limit is exceeded!
    const org2Admin = await loginAs(baseUrl, 'marcos@nersp.com');
    const blockedGlobal = await fetch(`${baseUrl}/api/ai/generate`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${org2Admin.data.token}`,
      },
      body: JSON.stringify({
        department: 'NER Strategy',
        action: 'strategy.diagnosis',
        prompt: 'Deve ser bloqueado pelo teto global',
        overrideProviderId: 'openai',
        overrideModelId: 'gpt-4o',
      }),
    });
    assert.equal(blockedGlobal.status, 429);
  } finally {
    await cleanup();
  }
});

test('Threshold Alerts Management (50/75/90/100%): per-tier rules, channels, severity, customMessage, and alertThresholds sync', async () => {
  const { baseUrl, aiGateway, cleanup } = await startCostTestServer({
    openai: createCostMockAdapter('openai', {
      inputTokens: 200_000,
      outputTokens: 50_000, // gpt-4o: 0.2*2.5 + 0.05*10 = $1.00 per call
      usageReported: true,
    }),
  });

  try {
    const superAdmin = await loginAs(baseUrl, 'maycon@neragency.com');
    const token = superAdmin.data.token;

    // Spend $1.00 in org-1
    const exec = await aiGateway.execute({
      organizationId: 'org-1',
      userId: superAdmin.data.user.id,
      department: 'NER Strategy',
      action: 'strategy.diagnosis',
      purpose: 'marketing_strategy',
      overrideProviderId: 'openai',
      overrideModelId: 'gpt-4o',
      messages: [{ role: 'user', content: 'Diagnóstico para testar limiares' }],
    });
    assert.ok(exec.requestId);

    // 1. Configure org thresholdRules (dailyLimit=$1.25 -> $1.00 is 80% -> hits 75% rule; 50% disabled)
    const orgPut = await fetch(`${baseUrl}/api/ai/cost-policy`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        organizationId: 'org-1',
        dailyLimitUsd: 1.25,
        monthlyLimitUsd: 100,
        thresholdRules: [
          {
            thresholdPct: 50,
            enabled: false,
            severity: 'info',
            channels: ['dashboard'],
            action: 'notify',
          },
          {
            thresholdPct: 75,
            enabled: true,
            severity: 'critical',
            channels: ['dashboard', 'email_admin', 'webhook'],
            action: 'notify',
            customMessage: 'Alerta 75% customizado: revisar prompts de estrategia',
          },
          {
            thresholdPct: 90,
            enabled: true,
            severity: 'warning',
            channels: ['dashboard', 'audit_log'],
            action: 'notify',
          },
          {
            thresholdPct: 100,
            enabled: true,
            severity: 'critical',
            channels: ['dashboard', 'audit_log', 'email_admin', 'webhook'],
            action: 'fallback_economical',
            customMessage: 'Teto 100% atingido: downgrade economico acionado',
          },
        ],
      }),
    });
    assert.equal(orgPut.status, 200);
    const savedOrgPolicy = await orgPut.json();
    assert.deepEqual(savedOrgPolicy.alertThresholds, [75, 90, 100]);
    assert.equal(savedOrgPolicy.onExceedAction, 'fallback_economical');
    assert.equal(savedOrgPolicy.thresholdRules.length, 4);
    assert.equal(savedOrgPolicy.thresholdRules[0].enabled, false);
    assert.equal(
      savedOrgPolicy.thresholdRules[1].customMessage,
      'Alerta 75% customizado: revisar prompts de estrategia'
    );

    // 2. Configure global thresholdRules (dailyLimit=$1.05 -> $1.00 is 95.2% -> hits 90% rule)
    const globalPut = await fetch(`${baseUrl}/api/ai/global-cost-policy`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        dailyLimitUsd: 1.05,
        monthlyLimitUsd: 50,
        thresholdRules: [
          { thresholdPct: 50, enabled: true, severity: 'info', channels: ['dashboard'], action: 'notify' },
          { thresholdPct: 75, enabled: true, severity: 'warning', channels: ['dashboard'], action: 'notify' },
          {
            thresholdPct: 90,
            enabled: true,
            severity: 'critical',
            channels: ['dashboard', 'audit_log', 'webhook'],
            action: 'notify',
            customMessage: 'Plataforma em 90% do orcamento global diario',
          },
          {
            thresholdPct: 100,
            enabled: true,
            severity: 'critical',
            channels: ['dashboard', 'audit_log', 'email_admin', 'webhook'],
            action: 'block_all',
          },
        ],
      }),
    });
    assert.equal(globalPut.status, 200);
    const savedGlobalPolicy = await globalPut.json();
    assert.deepEqual(savedGlobalPolicy.alertThresholds, [50, 75, 90, 100]);
    assert.equal(savedGlobalPolicy.onExceedAction, 'block_all');

    // 3. Preventive monitoring snapshot surfaces custom severity, channels & customMessage
    const snapRes = await fetch(
      `${baseUrl}/api/ai/preventive-monitoring?organizationId=org-1`,
      { headers: { Authorization: `Bearer ${token}` } }
    );
    assert.equal(snapRes.status, 200);
    const snap = await snapRes.json();

    const orgDailyAlert = snap.activeAlerts.find((a: any) => a.scope === 'organization_daily');
    assert.ok(orgDailyAlert);
    assert.equal(orgDailyAlert.thresholdPct, 75);
    assert.equal(orgDailyAlert.severity, 'critical');
    assert.deepEqual(orgDailyAlert.channels, ['dashboard', 'email_admin', 'webhook']);
    assert.equal(
      orgDailyAlert.customMessage,
      'Alerta 75% customizado: revisar prompts de estrategia'
    );

    const globalDailyAlert = snap.activeAlerts.find((a: any) => a.scope === 'global_daily');
    assert.ok(globalDailyAlert);
    assert.equal(globalDailyAlert.thresholdPct, 90);
    assert.equal(globalDailyAlert.severity, 'critical');
    assert.deepEqual(globalDailyAlert.channels, ['dashboard', 'audit_log', 'webhook']);
    assert.equal(globalDailyAlert.customMessage, 'Plataforma em 90% do orcamento global diario');

    // 4. Dashboard analytics also reflects custom severity & message from thresholdRules
    const dashRes = await fetch(`${baseUrl}/api/ai/dashboard?organizationId=org-1`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    assert.equal(dashRes.status, 200);
    const dash = await dashRes.json();
    const dashOrgDaily = dash.alerts.find((a: any) => a.scope === 'organization_daily');
    assert.ok(dashOrgDaily);
    assert.equal(dashOrgDaily.thresholdPct, 75);
    assert.equal(dashOrgDaily.severity, 'critical');
    assert.ok(dashOrgDaily.message.includes('Alerta 75% customizado: revisar prompts de estrategia'));
    assert.ok(dashOrgDaily.message.includes('USD 1.0000 / USD 1.25'));

    // 5. Pre-flight preventive guard check: allowed with warning at 80% / 95%, then blocked when department limit exceeded
    const checkOkRes = await fetch(`${baseUrl}/api/ai/preventive-monitoring/check`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        organizationId: 'org-1',
        department: 'NER Strategy',
        providerId: 'openai',
        modelId: 'gpt-4o',
        isCritical: false,
      }),
    });
    assert.equal(checkOkRes.status, 200);
    const checkOk = await checkOkRes.json();
    assert.equal(checkOk.allowed, true);
    assert.equal(checkOk.evaluatedPolicies.globalDailyLimitUsd, 1.05);
    assert.equal(checkOk.evaluatedPolicies.orgDailyLimitUsd, 1.25);

    // Lower NER Strategy department cap below $1.00 spent -> pre-flight check detects breach (fallback_economical on org)
    await fetch(`${baseUrl}/api/ai/cost-policy`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        organizationId: 'org-1',
        onExceedAction: 'block_non_essential',
        blockOnExceed: true,
        departmentLimitsUsd: { 'NER Strategy': 0.5 },
      }),
    });

    const checkBlockedNonCrit = await (
      await fetch(`${baseUrl}/api/ai/preventive-monitoring/check`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          organizationId: 'org-1',
          department: 'NER Strategy',
          isCritical: false,
        }),
      })
    ).json();
    assert.equal(checkBlockedNonCrit.allowed, false);
    assert.equal(checkBlockedNonCrit.exceededScope, 'department_daily');

    const checkAllowedCrit = await (
      await fetch(`${baseUrl}/api/ai/preventive-monitoring/check`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          organizationId: 'org-1',
          department: 'NER Strategy',
          isCritical: true,
        }),
      })
    ).json();
    assert.equal(checkAllowedCrit.allowed, true);
  } finally {
    await cleanup();
  }
});
