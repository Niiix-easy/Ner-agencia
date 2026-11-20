import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { AddressInfo } from 'node:net';
import { PersistentStore } from '../server/store.ts';
import { createApp } from '../server/app.ts';
import { resetLoginRateLimiter } from '../server/middleware/auth.ts';
import { buildStripeSignatureHeader } from '../server/services/billing-stripe.ts';

const TEST_WEBHOOK_SECRET = 'whsec_test_ner_integration_secret';

async function startTestServer() {
  resetLoginRateLimiter();
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ner-os-test-'));
  const dbPath = path.join(tmpDir, 'ner-test-db.json');
  const store = new PersistentStore(dbPath);
  const { app } = createApp(store, { stripeWebhookSecret: TEST_WEBHOOK_SECRET });

  const server = await new Promise<import('node:http').Server>((resolve) => {
    const s = app.listen(0, '127.0.0.1', () => resolve(s));
  });
  const addr = server.address() as AddressInfo;
  const baseUrl = `http://127.0.0.1:${addr.port}`;

  const cleanup = async () => {
    await new Promise<void>((resolve, reject) => server.close((err) => (err ? reject(err) : resolve())));
    fs.rmSync(tmpDir, { recursive: true, force: true });
  };

  return { baseUrl, dbPath, store, cleanup };
}

async function loginAs(baseUrl: string, email: string, password = 'NerAgency@2026') {
  const res = await fetch(`${baseUrl}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  const data = await res.json();
  return { status: res.status, data, setCookie: res.headers.get('set-cookie') };
}

test('P0 Auth: rejects unauthenticated calls, rejects invalid password, issues HttpOnly session, and revokes on logout', async () => {
  const { baseUrl, cleanup } = await startTestServer();
  try {
    const unauth = await fetch(`${baseUrl}/api/clients`);
    assert.equal(unauth.status, 401);

    const badPass = await loginAs(baseUrl, 'maycon@neragency.com', 'WrongPassword123');
    assert.equal(badPass.status, 401);
    assert.equal(badPass.data.error, 'Credenciais inválidas.');

    const noUser = await loginAs(baseUrl, 'unknown@neragency.com', 'WrongPassword123');
    assert.equal(noUser.status, 401);
    assert.equal(noUser.data.error, 'Credenciais inválidas.');

    const ok = await loginAs(baseUrl, 'maycon@neragency.com');
    assert.equal(ok.status, 200);
    assert.ok(ok.data.token);
    assert.equal(ok.data.user.passwordHash, undefined);
    assert.match(ok.setCookie || '', /HttpOnly/i);

    const meRes = await fetch(`${baseUrl}/api/auth/me`, {
      headers: { Authorization: `Bearer ${ok.data.token}` },
    });
    assert.equal(meRes.status, 200);

    const logoutRes = await fetch(`${baseUrl}/api/auth/logout`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${ok.data.token}` },
    });
    assert.equal(logoutRes.status, 200);

    const afterLogout = await fetch(`${baseUrl}/api/auth/me`, {
      headers: { Authorization: `Bearer ${ok.data.token}` },
    });
    assert.equal(afterLogout.status, 401);
  } finally {
    await cleanup();
  }
});

test('P0 RBAC & Multi-Tenant IDOR: strictly isolates organizations and client scope', async () => {
  const { baseUrl, cleanup } = await startTestServer();
  try {
    // Admin SP belongs to org-2; must be blocked from org-1
    const adminSp = await loginAs(baseUrl, 'marcos@nersp.com');
    assert.equal(adminSp.status, 200);

    const crossOrgClients = await fetch(`${baseUrl}/api/clients?organizationId=org-1`, {
      headers: { Authorization: `Bearer ${adminSp.data.token}` },
    });
    assert.equal(crossOrgClients.status, 403);

    const ownClients = await fetch(`${baseUrl}/api/clients`, {
      headers: { Authorization: `Bearer ${adminSp.data.token}` },
    });
    assert.equal(ownClients.status, 200);
    const ownClientsBody = await ownClients.json();
    assert.equal(ownClientsBody.length, 1);
    assert.equal(ownClientsBody[0].organizationId, 'org-2');

    // Gestor cannot mutate commercial plans
    const gestor = await loginAs(baseUrl, 'carlos@neragency.com');
    const planEditDenied = await fetch(`${baseUrl}/api/plans/plan-1`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${gestor.data.token}`,
      },
      body: JSON.stringify({ setupPrice: 1 }),
    });
    assert.equal(planEditDenied.status, 403);

    // Client user cannot read agency payables and sees only own client approvals
    const clientLogin = await loginAs(baseUrl, 'lucas@techflow.io');
    assert.equal(clientLogin.status, 200);

    const payablesDenied = await fetch(`${baseUrl}/api/finance/payables`, {
      headers: { Authorization: `Bearer ${clientLogin.data.token}` },
    });
    assert.equal(payablesDenied.status, 403);

    const approvalsRes = await fetch(`${baseUrl}/api/approvals`, {
      headers: { Authorization: `Bearer ${clientLogin.data.token}` },
    });
    assert.equal(approvalsRes.status, 200);
    const approvals = await approvalsRes.json();
    assert.ok(approvals.every((a: any) => a.clientId === 'cli-1'));
  } finally {
    await cleanup();
  }
});

test('P0 Persistence: writes mutations atomically to disk and survives store reload', async () => {
  const { baseUrl, dbPath, cleanup } = await startTestServer();
  try {
    const login = await loginAs(baseUrl, 'ana@neragency.com');
    const createRes = await fetch(`${baseUrl}/api/leads`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${login.data.token}`,
      },
      body: JSON.stringify({
        name: 'Mariana Persistência',
        email: 'mariana@persist.com',
        company: 'Persist Ltda',
        estimatedValue: 9000,
      }),
    });
    assert.equal(createRes.status, 201);
    const createdLead = await createRes.json();

    // Reload a brand-new PersistentStore instance from same file
    const reloadedStore = new PersistentStore(dbPath);
    const found = reloadedStore.getState().leads.find((l) => l.id === createdLead.id);
    assert.ok(found);
    assert.equal(found.company, 'Persist Ltda');
  } finally {
    await cleanup();
  }
});

test('P1 Digital Studio & Projects: edits plan prices separately, contracts plan -> auto-creates project/deliverables/tasks, and recalculates progress', async () => {
  const { baseUrl, cleanup } = await startTestServer();
  try {
    const admin = await loginAs(baseUrl, 'maycon@neragency.com');
    const authHeaders = {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${admin.data.token}`,
    };

    const patchPlan = await fetch(`${baseUrl}/api/plans/plan-1`, {
      method: 'PATCH',
      headers: authHeaders,
      body: JSON.stringify({ setupPrice: 1290, recurringPrice: 149 }),
    });
    assert.equal(patchPlan.status, 200);
    const updatedPlan = await patchPlan.json();
    assert.equal(updatedPlan.setupPrice, 1290);
    assert.equal(updatedPlan.recurringPrice, 149);

    const contractRes = await fetch(`${baseUrl}/api/digital-studio/contract`, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({
        clientId: 'cli-1',
        planCode: 'NER_SOFTWARE_FACTORY',
        customProjectName: 'Portal SaaS TechFlow v2',
      }),
    });
    assert.equal(contractRes.status, 201);
    const contracted = await contractRes.json();
    assert.equal(contracted.project.projectType, 'Software');
    assert.equal(contracted.deliverables.length, 3);
    assert.equal(contracted.tasks.length, 3);
    assert.equal(contracted.receivable.mediaBudget, 0);

    // Complete all 3 tasks and assert progress reaches 100%
    let lastProgress = 0;
    for (const tsk of contracted.tasks) {
      const upd = await fetch(`${baseUrl}/api/tasks/${tsk.id}`, {
        method: 'PATCH',
        headers: authHeaders,
        body: JSON.stringify({ status: 'Concluída' }),
      });
      assert.equal(upd.status, 200);
      const updBody = await upd.json();
      lastProgress = updBody.projectProgress;
    }
    assert.equal(lastProgress, 100);
  } finally {
    await cleanup();
  }
});

test('P1 Approvals, Finance separation, Web Lead capture, and Tracking deduplication', async () => {
  const { baseUrl, cleanup } = await startTestServer();
  try {
    const admin = await loginAs(baseUrl, 'maycon@neragency.com');
    const headers = {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${admin.data.token}`,
    };

    // Version conflict on approval
    const conflict = await fetch(`${baseUrl}/api/approvals/app-2`, {
      method: 'PATCH',
      headers,
      body: JSON.stringify({ status: 'Aprovado', expectedVersion: 'v0.1' }),
    });
    assert.equal(conflict.status, 409);

    const approveOk = await fetch(`${baseUrl}/api/approvals/app-2`, {
      method: 'PATCH',
      headers,
      body: JSON.stringify({ status: 'Aprovado', expectedVersion: 'v1.0' }),
    });
    assert.equal(approveOk.status, 200);

    // Finance: verify mediaBudget never leaks into agencyRevenue
    const finBefore = await (await fetch(`${baseUrl}/api/finance/summary`, { headers })).json();
    assert.equal(finBefore.agencyRevenue, 30500);
    assert.equal(finBefore.mediaBudgetSeparated, 114100);

    const payRec = await fetch(`${baseUrl}/api/finance/receivables/rec-2/payments`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ amount: 18000, method: 'PIX' }),
    });
    assert.equal(payRec.status, 200);
    const paidBody = await payRec.json();
    assert.equal(paidBody.status, 'Pago');

    // Web LP lead capture -> CRM + Tracking
    const lpSubmit = await fetch(`${baseUrl}/api/web/pages/wp-1/submit-lead`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Carlos LP', email: 'carlos.lp@cliente.com', utmCampaign: 'test_utm' }),
    });
    assert.equal(lpSubmit.status, 201);

    // Tracking deduplication
    const t1 = await fetch(`${baseUrl}/api/tracking/events`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        clientId: 'cli-1',
        eventId: 'evt_unique_100',
        eventName: 'Purchase',
        value: 299,
        confirmedByPayment: false,
      }),
    });
    const b1 = await t1.json();
    assert.equal(b1.deduplicated, false);
    assert.equal(b1.event.confirmedByPayment, false);

    const t2 = await fetch(`${baseUrl}/api/tracking/events`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        clientId: 'cli-1',
        eventId: 'evt_unique_100',
        eventName: 'Purchase',
      }),
    });
    const b2 = await t2.json();
    assert.equal(b2.deduplicated, true);
    assert.equal(b2.event.deduplicatedCount, 2);
  } finally {
    await cleanup();
  }
});

test('P1 Stripe Billing: checkout stays incomplete, rejects invalid webhook HMAC, and activates idempotently on valid signed webhook', async () => {
  const { baseUrl, cleanup } = await startTestServer();
  try {
    const admin = await loginAs(baseUrl, 'maycon@neragency.com');
    const headers = {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${admin.data.token}`,
    };

    const checkoutRes = await fetch(`${baseUrl}/api/billing/checkout`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ planCode: 'NER_BUSINESS_PRO' }),
    });
    assert.equal(checkoutRes.status, 200);
    const checkoutData = await checkoutRes.json();
    assert.equal(checkoutData.subscription.status, 'incomplete');

    const payload = JSON.stringify({
      id: 'evt_stripe_real_9001',
      type: 'invoice.payment_succeeded',
      data: {
        object: {
          subscription: 'sub_live_9001',
          customer: 'cus_live_9001',
          amount_paid: 69900,
          metadata: {
            organizationId: 'org-1',
            planCode: 'NER_BUSINESS_PRO',
          },
        },
      },
    });

    // Invalid signature rejected
    const badSig = await fetch(`${baseUrl}/api/webhooks/stripe`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'stripe-signature': 't=123,v1=deadbeef',
      },
      body: payload,
    });
    assert.equal(badSig.status, 401);

    // Valid HMAC-SHA256 signature activates subscription
    const sigHeader = buildStripeSignatureHeader(payload, TEST_WEBHOOK_SECRET);
    const validRes = await fetch(`${baseUrl}/api/webhooks/stripe`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'stripe-signature': sigHeader,
      },
      body: payload,
    });
    assert.equal(validRes.status, 200);
    const validBody = await validRes.json();
    assert.equal(validBody.duplicate, false);
    assert.equal(validBody.subscription.status, 'active');

    // Replay same eventId is idempotently ignored
    const replayRes = await fetch(`${baseUrl}/api/webhooks/stripe`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'stripe-signature': sigHeader,
      },
      body: payload,
    });
    assert.equal(replayRes.status, 200);
    const replayBody = await replayRes.json();
    assert.equal(replayBody.duplicate, true);
  } finally {
    await cleanup();
  }
});
