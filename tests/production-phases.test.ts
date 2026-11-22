import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { AddressInfo } from 'node:net';
import { PersistentStore } from '../server/store.ts';
import { createApp } from '../server/app.ts';
import { resetLoginRateLimiter } from '../server/middleware/auth.ts';
import { resetPasswordRateLimiter } from '../server/services/password-reset.ts';

async function startTestServer() {
  resetLoginRateLimiter();
  resetPasswordRateLimiter();
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ner-prod-phases-'));
  const dbPath = path.join(tmpDir, 'ner-prod-db.json');
  const store = new PersistentStore(dbPath);
  const webhookSecret = 'whsec_prod_phases_secret';
  const { app } = createApp(store, { stripeWebhookSecret: webhookSecret });

  const server = await new Promise<import('node:http').Server>((resolve) => {
    const s = app.listen(0, '127.0.0.1', () => resolve(s));
  });
  const addr = server.address() as AddressInfo;
  const baseUrl = `http://127.0.0.1:${addr.port}`;

  const cleanup = async () => {
    await new Promise<void>((resolve, reject) => server.close((err) => (err ? reject(err) : resolve())));
    fs.rmSync(tmpDir, { recursive: true, force: true });
  };

  return { baseUrl, dbPath, store, webhookSecret, cleanup };
}

async function loginAs(baseUrl: string, email: string, password = 'NerAgency@2026') {
  const res = await fetch(`${baseUrl}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  return { status: res.status, data: await res.json() };
}

function signStripeWebhook(rawBody: string, secret: string): string {
  const ts = Math.floor(Date.now() / 1000);
  const sig = crypto.createHmac('sha256', secret).update(`${ts}.${rawBody}`).digest('hex');
  return `t=${ts},v1=${sig}`;
}

test('FASE 2: PersistentStore runTransaction rolls back in-memory mutations on error and commits on success', async () => {
  const { store, cleanup } = await startTestServer();
  try {
    const beforeCount = store.getState().clients.length;
    assert.throws(() => {
      store.runTransaction((draft) => {
        draft.clients.push({
          ...draft.clients[0],
          id: 'cli-rollback-test',
          name: 'Rollback Inc',
        });
        throw new Error('SIMULATED_TX_FAILURE');
      });
    }, /SIMULATED_TX_FAILURE/);
    assert.equal(store.getState().clients.length, beforeCount, 'Failed transaction must roll back mutations');

    store.runTransaction((draft) => {
      draft.clients.push({
        ...draft.clients[0],
        id: 'cli-commit-test',
        name: 'Committed Inc',
      });
    });
    assert.equal(store.getState().clients.length, beforeCount + 1, 'Successful transaction must commit mutations');
  } finally {
    await cleanup();
  }
});

test('FASE 4: Real Password Recovery enforces single-use hashed token, strength rules, and revokes all active sessions', async () => {
  const prevNodeEnv = process.env.NODE_ENV;
  process.env.NODE_ENV = 'test';
  const { baseUrl, cleanup } = await startTestServer();
  try {
    // 1. User logs in and obtains an active session
    const initialLogin = await loginAs(baseUrl, 'ana@neragency.com');
    assert.equal(initialLogin.status, 200);
    const oldToken = initialLogin.data.token;

    const meBefore = await fetch(`${baseUrl}/api/auth/me`, {
      headers: { Authorization: `Bearer ${oldToken}` },
    });
    assert.equal(meBefore.status, 200);

    // 2. Unknown email still returns generic 200 (anti-enumeration)
    const unknownForgot = await fetch(`${baseUrl}/api/auth/forgot-password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'nobody@unknown-domain.example' }),
    });
    assert.equal(unknownForgot.status, 200);
    const unknownData = await unknownForgot.json();
    assert.equal(unknownData.testOnlyToken, undefined);

    // 3. Request reset token for real user
    const forgotRes = await fetch(`${baseUrl}/api/auth/forgot-password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'ana@neragency.com' }),
    });
    assert.equal(forgotRes.status, 200);
    const forgotData = await forgotRes.json();
    assert.ok(typeof forgotData.testOnlyToken === 'string' && forgotData.testOnlyToken.length >= 32);
    const resetToken = forgotData.testOnlyToken;

    // 4. Reject weak password
    const weakRes = await fetch(`${baseUrl}/api/auth/reset-password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: resetToken, newPassword: '123' }),
    });
    assert.equal(weakRes.status, 400);

    // 5. Reject invalid token
    const badTokRes = await fetch(`${baseUrl}/api/auth/reset-password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: 'invalid-token-value', newPassword: 'NewStrongPassword2027' }),
    });
    assert.equal(badTokRes.status, 400);

    // 6. Succeed with valid token + strong password
    const okReset = await fetch(`${baseUrl}/api/auth/reset-password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: resetToken, newPassword: 'NewStrongPassword2027' }),
    });
    assert.equal(okReset.status, 200);
    const okData = await okReset.json();
    assert.ok(okData.revokedSessions >= 1, 'Previous session must be revoked');

    // 7. Reject single-use token reuse
    const reuseRes = await fetch(`${baseUrl}/api/auth/reset-password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: resetToken, newPassword: 'AnotherPassword2027' }),
    });
    assert.equal(reuseRes.status, 400);

    // 8. Old session token is now invalid (401)
    const meAfter = await fetch(`${baseUrl}/api/auth/me`, {
      headers: { Authorization: `Bearer ${oldToken}` },
    });
    assert.equal(meAfter.status, 401);

    // 9. Login with old password fails; login with new password succeeds
    const oldPwdLogin = await loginAs(baseUrl, 'ana@neragency.com', 'NerAgency@2026');
    assert.equal(oldPwdLogin.status, 401);
    const newPwdLogin = await loginAs(baseUrl, 'ana@neragency.com', 'NewStrongPassword2027');
    assert.equal(newPwdLogin.status, 200);
  } finally {
    process.env.NODE_ENV = prevNodeEnv;
    await cleanup();
  }
});

test('FASE 4: Stripe Billing webhooks handle all 6 lifecycle events with HMAC verification, idempotency, and cancelation', async () => {
  const { baseUrl, webhookSecret, cleanup } = await startTestServer();
  try {
    const admin = await loginAs(baseUrl, 'maycon@neragency.com');
    const authHeaders = {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${admin.data.token}`,
    };

    // Start live checkout (without STRIPE_SECRET_KEY returns honest awaiting_stripe_credentials mode)
    const checkoutRes = await fetch(`${baseUrl}/api/billing/checkout-live`, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({ organizationId: 'org-1', planCode: 'NER_BUSINESS_PRO' }),
    });
    assert.equal(checkoutRes.status, 200);
    const checkoutData = await checkoutRes.json();
    assert.ok(checkoutData.checkoutSessionId);

    // Invalid signature must be rejected (401)
    const badWebhook = await fetch(`${baseUrl}/api/webhooks/stripe`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'stripe-signature': 't=123,v1=deadbeef',
      },
      body: JSON.stringify({ id: 'evt_bad', type: 'invoice.paid', data: { object: {} } }),
    });
    assert.equal(badWebhook.status, 401);

    const events: Array<{ id: string; type: string; expectedStatus: string }> = [
      { id: 'evt_1_checkout', type: 'checkout.session.completed', expectedStatus: 'active' },
      { id: 'evt_2_sub_created', type: 'customer.subscription.created', expectedStatus: 'active' },
      { id: 'evt_3_sub_updated', type: 'customer.subscription.updated', expectedStatus: 'active' },
      { id: 'evt_4_inv_failed', type: 'invoice.payment_failed', expectedStatus: 'past_due' },
      { id: 'evt_5_inv_paid', type: 'invoice.paid', expectedStatus: 'active' },
      { id: 'evt_6_sub_deleted', type: 'customer.subscription.deleted', expectedStatus: 'canceled' },
    ];

    for (const ev of events) {
      const payload = JSON.stringify({
        id: ev.id,
        type: ev.type,
        data: {
          object: {
            id: 'sub_stripe_live_1',
            customer: 'cus_stripe_live_1',
            status: ev.expectedStatus,
            metadata: { organizationId: 'org-1', planCode: 'NER_BUSINESS_PRO' },
          },
        },
      });
      const res = await fetch(`${baseUrl}/api/webhooks/stripe`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'stripe-signature': signStripeWebhook(payload, webhookSecret),
        },
        body: payload,
      });
      assert.equal(res.status, 200, `Webhook ${ev.type} should return 200`);
      const body = await res.json();
      assert.equal(body.subscription.status, ev.expectedStatus, `Expected status ${ev.expectedStatus} after ${ev.type}`);
    }

    // Duplicate event idempotency check
    const dupPayload = JSON.stringify({
      id: 'evt_5_inv_paid',
      type: 'invoice.paid',
      data: { object: { metadata: { organizationId: 'org-1', planCode: 'NER_BUSINESS_PRO' } } },
    });
    const dupRes = await fetch(`${baseUrl}/api/webhooks/stripe`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'stripe-signature': signStripeWebhook(dupPayload, webhookSecret),
      },
      body: dupPayload,
    });
    assert.equal(dupRes.status, 200);
    const dupBody = await dupRes.json();
    assert.equal(dupBody.duplicate, true, 'Duplicate webhook event must be idempotently skipped');

    // Explicit cancel endpoint
    const cancelRes = await fetch(`${baseUrl}/api/billing/cancel`, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({ organizationId: 'org-1', reason: 'Teste de cancelamento' }),
    });
    assert.equal(cancelRes.status, 200);
    const cancelData = await cancelRes.json();
    assert.equal(cancelData.subscription.status, 'canceled');
  } finally {
    await cleanup();
  }
});

test('FASE 3, 5, 6, 7 & 8: Clients, Pagination, Task Comments, Tickets, Incidents, Storage, Integrations, Strategy, SSR /p/:slug, and QA/Launch/Delivery', async () => {
  const { baseUrl, cleanup } = await startTestServer();
  let uploadedAssetId: string | null = null;
  try {
    const admin = await loginAs(baseUrl, 'maycon@neragency.com');
    const clientUser = await loginAs(baseUrl, 'lucas@techflow.io');
    const adminHeaders = {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${admin.data.token}`,
    };
    const clientHeaders = {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${clientUser.data.token}`,
    };

    // 1. Backend pagination & client details + archive/restore
    const pagedClients = await fetch(`${baseUrl}/api/clients?organizationId=org-1&page=1&limit=1&paginated=true`, {
      headers: adminHeaders,
    });
    assert.equal(pagedClients.status, 200);
    const pagedBody = await pagedClients.json();
    assert.equal(pagedBody.data.length, 1);
    assert.ok(pagedBody.meta.total >= 1);

    const detailRes = await fetch(`${baseUrl}/api/clients/cli-1/details`, { headers: adminHeaders });
    assert.equal(detailRes.status, 200);
    const detailData = await detailRes.json();
    assert.equal(detailData.client.id, 'cli-1');

    const archRes = await fetch(`${baseUrl}/api/clients/cli-1/archive`, {
      method: 'PATCH',
      headers: adminHeaders,
      body: JSON.stringify({ restore: false, reason: 'Auditoria teste' }),
    });
    assert.equal(archRes.status, 200);
    assert.ok((await archRes.json()).archivedAt);

    const restoreRes = await fetch(`${baseUrl}/api/clients/cli-1/archive`, {
      method: 'PATCH',
      headers: adminHeaders,
      body: JSON.stringify({ restore: true }),
    });
    assert.equal(restoreRes.status, 200);
    assert.equal((await restoreRes.json()).archivedAt, null);

    // 2. Task comments
    const commentRes = await fetch(`${baseUrl}/api/tasks/tsk-1/comments`, {
      method: 'POST',
      headers: adminHeaders,
      body: JSON.stringify({ body: 'Validado em staging.' }),
    });
    assert.equal(commentRes.status, 201);

    // 3. Tickets: client opens -> team manages & replies -> client blocked from /manage (403)
    const ticketRes = await fetch(`${baseUrl}/api/tickets`, {
      method: 'POST',
      headers: clientHeaders,
      body: JSON.stringify({ subject: 'Ajuda Pixel', description: 'Validar evento Purchase', clientId: 'cli-1' }),
    });
    assert.equal(ticketRes.status, 201);
    const ticket = await ticketRes.json();

    const clientManageBlocked = await fetch(`${baseUrl}/api/tickets/${ticket.id}/manage`, {
      method: 'PATCH',
      headers: clientHeaders,
      body: JSON.stringify({ status: 'Resolvido' }),
    });
    assert.equal(clientManageBlocked.status, 403);

    const teamReply = await fetch(`${baseUrl}/api/tickets/${ticket.id}/replies`, {
      method: 'POST',
      headers: adminHeaders,
      body: JSON.stringify({ message: 'Estamos analisando o evento CAPI.' }),
    });
    assert.equal(teamReply.status, 201);

    const teamManage = await fetch(`${baseUrl}/api/tickets/${ticket.id}/manage`, {
      method: 'PATCH',
      headers: adminHeaders,
      body: JSON.stringify({ status: 'Resolvido', priority: 'Alta' }),
    });
    assert.equal(teamManage.status, 200);
    assert.equal((await teamManage.json()).status, 'Resolvido');

    // 4. Incidents CRUD
    const incCreate = await fetch(`${baseUrl}/api/incidents`, {
      method: 'POST',
      headers: adminHeaders,
      body: JSON.stringify({
        organizationId: 'org-1',
        service: 'Webhook Stripe',
        severity: 'Alta',
        description: 'Latência acima de 2s',
        resolutionPlan: 'Ativar fila com retry exponencial',
      }),
    });
    assert.equal(incCreate.status, 201);
    const inc = await incCreate.json();

    const incResolve = await fetch(`${baseUrl}/api/incidents/${inc.id}`, {
      method: 'PATCH',
      headers: adminHeaders,
      body: JSON.stringify({ status: 'Resolvido', note: 'Normalizado' }),
    });
    assert.equal(incResolve.status, 200);
    assert.ok((await incResolve.json()).resolvedAt);

    // 5. Storage: reject disallowed MIME (415), upload valid PNG, download via signed URL, delete
    const badUpload = await fetch(`${baseUrl}/api/storage/upload`, {
      method: 'POST',
      headers: adminHeaders,
      body: JSON.stringify({
        organizationId: 'org-1',
        fileName: 'malware.exe',
        mimeType: 'application/x-msdownload',
        contentBase64: Buffer.from('MZ').toString('base64'),
      }),
    });
    assert.equal(badUpload.status, 415);

    const goodUpload = await fetch(`${baseUrl}/api/storage/upload`, {
      method: 'POST',
      headers: adminHeaders,
      body: JSON.stringify({
        organizationId: 'org-1',
        clientId: 'cli-1',
        module: 'creative',
        fileName: 'banner.txt',
        mimeType: 'text/plain',
        contentBase64: Buffer.from('NER Creative Asset Test').toString('base64'),
      }),
    });
    assert.equal(goodUpload.status, 201);
    const asset = await goodUpload.json();
    uploadedAssetId = asset.id;
    assert.ok(asset.signedUrl);
    assert.equal(asset.sha256.length, 64);

    // Signed URL download works without auth header
    const signedDownload = await fetch(`${baseUrl}${asset.signedUrl}`);
    assert.equal(signedDownload.status, 200);
    assert.equal(await signedDownload.text(), 'NER Creative Asset Test');

    // Unsigned download without auth is rejected (403)
    const unsignedDownload = await fetch(`${baseUrl}/api/storage/assets/${asset.id}/download`);
    assert.equal(unsignedDownload.status, 403);

    // Delete asset cleanly
    const delAsset = await fetch(`${baseUrl}/api/storage/assets/${asset.id}`, {
      method: 'DELETE',
      headers: adminHeaders,
    });
    assert.equal(delAsset.status, 200);
    uploadedAssetId = null;

    // 6. External integrations readiness + honest 503 BLOQUEADO POR CREDENCIAIS
    const intStatus = await fetch(`${baseUrl}/api/integrations/status`, { headers: adminHeaders });
    assert.equal(intStatus.status, 200);
    const intBody = await intStatus.json();
    assert.ok(Array.isArray(intBody.integrations) && intBody.integrations.length >= 6);

    const evListRes = await fetch(`${baseUrl}/api/tracking/events?organizationId=org-1`, { headers: adminHeaders });
    const evList = await evListRes.json();
    assert.ok(Array.isArray(evList) && evList.length > 0);

    const capiDispatch = await fetch(`${baseUrl}/api/integrations/tracking/dispatch`, {
      method: 'POST',
      headers: adminHeaders,
      body: JSON.stringify({ organizationId: 'org-1', eventId: evList[0].id, target: 'meta_capi' }),
    });
    assert.equal(capiDispatch.status, 503);
    assert.equal((await capiDispatch.json()).status, 'BLOQUEADO POR CREDENCIAIS');

    // 7. Strategy Plans & OKRs persistence
    const stratCreate = await fetch(`${baseUrl}/api/strategy/plans`, {
      method: 'POST',
      headers: adminHeaders,
      body: JSON.stringify({
        organizationId: 'org-1',
        clientId: 'cli-1',
        title: 'Plano Crescimento Q1',
        quarter: 'Q1 2027',
        objective: 'Dobrar MQLs qualificados',
        okrs: [{ objective: 'Aquisição', keyResult: '120 leads/mês', target: '120', current: '45', progress: 38 }],
      }),
    });
    assert.equal(stratCreate.status, 201);

    // 8. Public SSR Web Page (/p/:slug) renders real HTML + meta tags + increments visits
    const pageCreate = await fetch(`${baseUrl}/api/web/pages`, {
      method: 'POST',
      headers: adminHeaders,
      body: JSON.stringify({
        organizationId: 'org-1',
        clientId: 'cli-1',
        title: 'Oferta SaaS 2027',
        slug: 'oferta-saas-2027',
        pageType: 'Landing Page Produto',
      }),
    });
    assert.equal(pageCreate.status, 201);
    const page = await pageCreate.json();

    // Draft page returns 404 publicly
    const draftSsr = await fetch(`${baseUrl}/p/oferta-saas-2027`);
    assert.equal(draftSsr.status, 404);

    // Publish with SEO + WhatsApp
    const publishRes = await fetch(`${baseUrl}/api/web/pages/${page.id}`, {
      method: 'PATCH',
      headers: adminHeaders,
      body: JSON.stringify({
        status: 'Publicado',
        seoTitle: 'Oferta SaaS 2027 | TechFlow',
        seoDescription: 'Landing page SSR oficial.',
        whatsappNumber: '5511999998888',
      }),
    });
    assert.equal(publishRes.status, 200);

    const liveSsr = await fetch(`${baseUrl}/p/oferta-saas-2027`);
    assert.equal(liveSsr.status, 200);
    const html = await liveSsr.text();
    assert.ok(html.includes('<title>Oferta SaaS 2027 | TechFlow</title>'));
    assert.ok(html.includes('wa.me/5511999998888'));

    // 9. FASE 8: QA, Launch Checklist, and Delivery Handoff with SHA-256 signature + client isolation
    const qaCreate = await fetch(`${baseUrl}/api/qa/items`, {
      method: 'POST',
      headers: adminHeaders,
      body: JSON.stringify({ organizationId: 'org-1', title: 'Validar RBAC Billing', category: 'Segurança', severity: 'Crítica' }),
    });
    assert.equal(qaCreate.status, 201);

    const clientQaBlocked = await fetch(`${baseUrl}/api/qa/items`, { headers: clientHeaders });
    assert.equal(clientQaBlocked.status, 403);

    const launchCreate = await fetch(`${baseUrl}/api/launch/checklist`, {
      method: 'POST',
      headers: adminHeaders,
      body: JSON.stringify({ organizationId: 'org-1', domain: 'SSL', title: 'Certificado TLS ativo' }),
    });
    assert.equal(launchCreate.status, 201);
    const launchItem = await launchCreate.json();

    const launchDone = await fetch(`${baseUrl}/api/launch/checklist/${launchItem.id}`, {
      method: 'PATCH',
      headers: adminHeaders,
      body: JSON.stringify({ status: 'Concluído' }),
    });
    assert.equal(launchDone.status, 200);

    const handoffCreate = await fetch(`${baseUrl}/api/delivery/handoffs`, {
      method: 'POST',
      headers: adminHeaders,
      body: JSON.stringify({
        organizationId: 'org-1',
        projectId: 'prj-1',
        title: 'Entrega Oficial v1.0',
        summary: 'Plataforma validada e pronta para operação.',
        deliverablesList: ['LP SSR', 'CRM', 'AI Gateway'],
      }),
    });
    assert.equal(handoffCreate.status, 201);
    const handoff = await handoffCreate.json();

    // Client of cli-1 accepts handoff and receives SHA-256 signature hash
    const handoffAccept = await fetch(`${baseUrl}/api/delivery/handoffs/${handoff.id}/decide`, {
      method: 'PATCH',
      headers: clientHeaders,
      body: JSON.stringify({ status: 'Aceito' }),
    });
    assert.equal(handoffAccept.status, 200);
    const signedHandoff = await handoffAccept.json();
    assert.equal(signedHandoff.status, 'Aceito');
    assert.equal(signedHandoff.signatureHash.length, 64);

    // AI Memory inspection & prune endpoint
    const memList = await fetch(`${baseUrl}/api/ai/memory?organizationId=org-1`, { headers: adminHeaders });
    assert.equal(memList.status, 200);
    const memPrune = await fetch(`${baseUrl}/api/ai/memory/prune`, {
      method: 'POST',
      headers: adminHeaders,
      body: JSON.stringify({ organizationId: 'org-1', retentionDays: 30 }),
    });
    assert.equal(memPrune.status, 200);
  } finally {
    if (uploadedAssetId) {
      fs.rmSync(path.resolve(process.cwd(), 'database/uploads'), { recursive: true, force: true });
    }
    await cleanup();
  }
});
