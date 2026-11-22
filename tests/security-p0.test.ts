import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { AddressInfo } from 'node:net';
import { PersistentStore, hashPassword } from '../server/store.ts';
import { createApp } from '../server/app.ts';
import { resetLoginRateLimiter } from '../server/middleware/auth.ts';
import { assertEntitlement } from '../server/services/entitlements.ts';

async function startP0Server() {
  resetLoginRateLimiter();
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ner-p0-sec-'));
  const dbPath = path.join(tmpDir, 'ner-p0-db.json');
  const store = new PersistentStore(dbPath);
  const { app } = createApp(store, { stripeWebhookSecret: 'whsec_p0_test_secret' });

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
  return { status: res.status, data: await res.json() };
}

test('P0-SEC: Anonymous users receive 401 on all protected financial, billing, user, project, and web endpoints', async () => {
  const { baseUrl, cleanup } = await startP0Server();
  try {
    const endpoints: Array<{ method: string; path: string; body?: unknown }> = [
      { method: 'GET', path: '/api/finance/summary' },
      { method: 'GET', path: '/api/finance/receivables' },
      { method: 'GET', path: '/api/billing/subscription' },
      { method: 'GET', path: '/api/billing/entitlements' },
      { method: 'GET', path: '/api/users' },
      { method: 'POST', path: '/api/users', body: { name: 'X', email: 'x@x.com', password: 'Password123', role: 'Comercial' } },
      { method: 'GET', path: '/api/projects' },
      { method: 'PATCH', path: '/api/tasks/tsk-1', body: { status: 'Backlog' } },
      { method: 'POST', path: '/api/web/pages', body: { clientId: 'cli-1', title: 'X', slug: 'x' } },
    ];

    for (const ep of endpoints) {
      const res = await fetch(`${baseUrl}${ep.path}`, {
        method: ep.method,
        headers: ep.body ? { 'Content-Type': 'application/json' } : undefined,
        body: ep.body ? JSON.stringify(ep.body) : undefined,
      });
      assert.equal(res.status, 401, `Expected 401 for anonymous ${ep.method} ${ep.path}, got ${res.status}`);
    }
  } finally {
    await cleanup();
  }
});

test('P0-SEC: Cliente isolation on /api/finance/summary, /api/billing/subscription, receivables, time-tracking, and cross-client ID manipulation', async () => {
  const { baseUrl, store, cleanup } = await startP0Server();
  try {
    // Seed a project, approval, and time-tracking entry for cli-2 (same org-1, DIFFERENT client)
    const state = store.getState();
    state.projects.push({
      id: 'prj-cli2',
      organizationId: 'org-1',
      clientId: 'cli-2',
      contractId: null,
      planCode: null,
      name: 'Projeto Confidencial Lumina',
      projectType: 'NER Performance',
      status: 'Em andamento',
      priority: 'Alta',
      startDate: '2026-11-01',
      dueDate: '2026-12-31',
      managerId: 'usr-2',
      progress: 50,
      createdAt: new Date().toISOString(),
    });
    state.approvals.push({
      id: 'app-cli2',
      organizationId: 'org-1',
      projectId: 'prj-cli2',
      clientId: 'cli-2',
      title: 'Aprovação Confidencial Lumina',
      version: 'v1.0',
      requester: 'Carlos Silva',
      approver: 'Lumina',
      status: 'Pendente',
      decidedAt: null,
      decidedByUserId: null,
    });
    state.timeTracking.push({
      id: 'tim-cli2',
      organizationId: 'org-1',
      projectId: 'prj-cli2',
      userId: 'usr-2',
      description: 'Horas confidenciais Lumina',
      duration: 5,
      billable: true,
      date: '2026-11-10',
    });
    // Also add an orphan Cliente user with clientId = null to verify fail-closed behavior
    state.users.push({
      id: 'usr-orphan-client',
      organizationId: 'org-1',
      clientId: null,
      name: 'Cliente Sem Vínculo',
      email: 'orphan@client.io',
      passwordHash: hashPassword('NerAgency@2026'),
      role: 'Cliente',
      status: 'Ativo',
      emailVerifiedAt: new Date().toISOString(),
      createdAt: new Date().toISOString(),
    });
    store.save();

    // 1. Admin sees full agency-level financial summary
    const admin = await loginAs(baseUrl, 'maycon@neragency.com');
    const adminFinRes = await fetch(`${baseUrl}/api/finance/summary`, {
      headers: { Authorization: `Bearer ${admin.data.token}` },
    });
    assert.equal(adminFinRes.status, 200);
    const adminFin = await adminFinRes.json();
    assert.equal(adminFin.scope, 'organization');
    assert.ok(adminFin.agencyRevenue > 12500, 'Admin must see aggregated agency revenue across all org-1 clients');
    assert.ok(adminFin.totalPayable > 0);

    // 2. Cliente (Lucas / cli-1) on /api/finance/summary sees ONLY cli-1 isolated totals, NEVER agency P&L or cli-2
    const client = await loginAs(baseUrl, 'lucas@techflow.io');
    assert.equal(client.status, 200);
    const clientHeaders = { Authorization: `Bearer ${client.data.token}` };

    const cliFinRes = await fetch(`${baseUrl}/api/finance/summary`, { headers: clientHeaders });
    assert.equal(cliFinRes.status, 200);
    const cliFin = await cliFinRes.json();
    assert.equal(cliFin.scope, 'client');
    assert.equal(cliFin.clientId, 'cli-1');
    assert.equal(cliFin.agencyRevenue, undefined, 'Must NOT expose agencyRevenue to Cliente');
    assert.equal(cliFin.totalPayable, undefined, 'Must NOT expose totalPayable to Cliente');
    assert.equal(cliFin.netOperatingResult, undefined, 'Must NOT expose netOperatingResult to Cliente');
    assert.equal(cliFin.operatingMargin, undefined, 'Must NOT expose operatingMargin to Cliente');
    // cli-1 receivable amount is 12500 (not 12500 + 18000 = 30500), adSpend is 45200 (not + 68900)
    assert.equal(cliFin.totalBilled, 12500);
    assert.equal(cliFin.clientAdSpend, 45200);

    // 3. Cliente attempting to query another client's finance or receivables gets 403
    const cliOtherFin = await fetch(`${baseUrl}/api/finance/summary?clientId=cli-2`, { headers: clientHeaders });
    assert.equal(cliOtherFin.status, 403);

    const cliOtherRec = await fetch(`${baseUrl}/api/finance/receivables?clientId=cli-2`, { headers: clientHeaders });
    assert.equal(cliOtherRec.status, 403);

    const cliOwnRecRes = await fetch(`${baseUrl}/api/finance/receivables`, { headers: clientHeaders });
    assert.equal(cliOwnRecRes.status, 200);
    const cliOwnRec = await cliOwnRecRes.json();
    assert.ok(cliOwnRec.length > 0);
    assert.ok(cliOwnRec.every((r: any) => r.clientId === 'cli-1'));

    // 4. Cliente is strictly forbidden (403) from SaaS subscription, entitlements, payables, commissions
    assert.equal((await fetch(`${baseUrl}/api/billing/subscription`, { headers: clientHeaders })).status, 403);
    assert.equal((await fetch(`${baseUrl}/api/billing/entitlements`, { headers: clientHeaders })).status, 403);
    assert.equal((await fetch(`${baseUrl}/api/finance/payables`, { headers: clientHeaders })).status, 403);
    assert.equal((await fetch(`${baseUrl}/api/commissions`, { headers: clientHeaders })).status, 403);

    // 5. Cliente time-tracking is isolated to cli-1's projects (never leaks tim-cli2)
    const cliTimeRes = await fetch(`${baseUrl}/api/time-tracking`, { headers: clientHeaders });
    assert.equal(cliTimeRes.status, 200);
    const cliTime = await cliTimeRes.json();
    assert.ok(cliTime.every((t: any) => t.projectId === 'prj-1'));
    assert.equal(cliTime.some((t: any) => t.id === 'tim-cli2'), false);

    // 6. Cliente ID manipulation against cli-2 approval and LGPD export gets 403
    const tamperApp = await fetch(`${baseUrl}/api/approvals/app-cli2`, {
      method: 'PATCH',
      headers: { ...clientHeaders, 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'Aprovado' }),
    });
    assert.equal(tamperApp.status, 403);

    const tamperLgpd = await fetch(`${baseUrl}/api/lgpd/clients/cli-2/export`, { headers: clientHeaders });
    assert.equal(tamperLgpd.status, 403);

    // 7. Orphan Cliente without clientId fails closed (403)
    const orphan = await loginAs(baseUrl, 'orphan@client.io');
    assert.equal(orphan.status, 200);
    const orphanHeaders = { Authorization: `Bearer ${orphan.data.token}` };
    assert.equal((await fetch(`${baseUrl}/api/finance/summary`, { headers: orphanHeaders })).status, 403);
    assert.equal((await fetch(`${baseUrl}/api/finance/receivables`, { headers: orphanHeaders })).status, 403);
    assert.equal((await fetch(`${baseUrl}/api/projects`, { headers: orphanHeaders })).status, 403);
  } finally {
    await cleanup();
  }
});

test('P0-SEC: RBAC role enforcement, SaaS subscription admin-only gate, privilege escalation block, and cross-tenant org isolation', async () => {
  const { baseUrl, store, cleanup } = await startP0Server();
  try {
    // Seed Financeiro and Criativo users in org-1 to test employee roles
    const state = store.getState();
    state.users.push(
      {
        id: 'usr-fin',
        organizationId: 'org-1',
        clientId: null,
        name: 'Fernanda Financeiro',
        email: 'financeiro@neragency.com',
        passwordHash: hashPassword('NerAgency@2026'),
        role: 'Financeiro',
        status: 'Ativo',
        emailVerifiedAt: new Date().toISOString(),
        createdAt: new Date().toISOString(),
      },
      {
        id: 'usr-cri',
        organizationId: 'org-1',
        clientId: null,
        name: 'Diego Criativo',
        email: 'criativo@neragency.com',
        passwordHash: hashPassword('NerAgency@2026'),
        role: 'Criativo',
        status: 'Ativo',
        emailVerifiedAt: new Date().toISOString(),
        createdAt: new Date().toISOString(),
      }
    );
    store.save();

    const superAdmin = await loginAs(baseUrl, 'maycon@neragency.com');
    const org2Admin = await loginAs(baseUrl, 'marcos@nersp.com');
    const gestor = await loginAs(baseUrl, 'carlos@neragency.com');
    const comercial = await loginAs(baseUrl, 'ana@neragency.com');
    const financeiro = await loginAs(baseUrl, 'financeiro@neragency.com');
    const criativo = await loginAs(baseUrl, 'criativo@neragency.com');

    // Positive: Super Admin & Administrador CAN read their own SaaS subscription
    assert.equal(
      (await fetch(`${baseUrl}/api/billing/subscription`, { headers: { Authorization: `Bearer ${superAdmin.data.token}` } })).status,
      200
    );
    const org2SubRes = await fetch(`${baseUrl}/api/billing/subscription`, {
      headers: { Authorization: `Bearer ${org2Admin.data.token}` },
    });
    assert.equal(org2SubRes.status, 200);
    const org2Sub = await org2SubRes.json();
    assert.equal(org2Sub.subscription.organizationId, 'org-2');

    // Negative: Non-admin employees receive 403 on SaaS subscription endpoint
    for (const emp of [gestor, comercial, financeiro, criativo]) {
      const subRes = await fetch(`${baseUrl}/api/billing/subscription`, {
        headers: { Authorization: `Bearer ${emp.data.token}` },
      });
      assert.equal(subRes.status, 403, `Expected 403 on /api/billing/subscription for role ${emp.data.user.role}`);
    }

    // Privilege escalation: org-2 Administrador cannot create a Super Admin
    const escRes = await fetch(`${baseUrl}/api/users`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${org2Admin.data.token}` },
      body: JSON.stringify({
        name: 'Fake SuperAdmin',
        email: 'fake-sa@nersp.com',
        password: 'StrongPassword@1',
        role: 'Super Admin',
      }),
    });
    assert.equal(escRes.status, 403);

    // Employee cannot create users or organizations
    assert.equal(
      (
        await fetch(`${baseUrl}/api/users`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${gestor.data.token}` },
          body: JSON.stringify({ name: 'X', email: 'x@ner.com', password: 'Password123', role: 'Criativo' }),
        })
      ).status,
      403
    );
    assert.equal(
      (
        await fetch(`${baseUrl}/api/organizations`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${org2Admin.data.token}` },
          body: JSON.stringify({ name: 'Rogue Org' }),
        })
      ).status,
      403
    );

    // Cross-tenant isolation: Org B (org-2) attempting to read/mutate Org A (org-1) resources
    const org2Headers = { 'Content-Type': 'application/json', Authorization: `Bearer ${org2Admin.data.token}` };
    assert.equal((await fetch(`${baseUrl}/api/finance/summary?organizationId=org-1`, { headers: org2Headers })).status, 403);
    assert.equal((await fetch(`${baseUrl}/api/billing/subscription?organizationId=org-1`, { headers: org2Headers })).status, 403);
    assert.equal(
      (
        await fetch(`${baseUrl}/api/clients`, {
          method: 'POST',
          headers: org2Headers,
          body: JSON.stringify({ organizationId: 'org-1', name: 'Intruder', email: 'i@x.com' }),
        })
      ).status,
      403
    );
    // ID manipulation against org-1 task, client, web page -> 404 (not leaked or mutated)
    assert.equal(
      (
        await fetch(`${baseUrl}/api/tasks/tsk-1`, {
          method: 'PATCH',
          headers: org2Headers,
          body: JSON.stringify({ status: 'Backlog' }),
        })
      ).status,
      404
    );
    assert.equal(
      (
        await fetch(`${baseUrl}/api/clients/cli-1`, {
          method: 'PATCH',
          headers: org2Headers,
          body: JSON.stringify({ name: 'Hacked' }),
        })
      ).status,
      404
    );
    assert.equal(
      (
        await fetch(`${baseUrl}/api/web/pages/wp-1`, {
          method: 'PATCH',
          headers: org2Headers,
          body: JSON.stringify({ title: 'Defaced' }),
        })
      ).status,
      404
    );
    assert.equal(store.getState().clients.find((c) => c.id === 'cli-1')?.name, 'TechFlow SaaS');
  } finally {
    await cleanup();
  }
});

test('P0-BUG-01: NER Projects tasks accept and persist Backlog and all valid statuses (Backlog, A fazer, Em andamento, Em revisão, Concluída)', async () => {
  const { baseUrl, dbPath, cleanup } = await startP0Server();
  try {
    const gestor = await loginAs(baseUrl, 'carlos@neragency.com');
    const headers = { 'Content-Type': 'application/json', Authorization: `Bearer ${gestor.data.token}` };

    // 1. Create a task directly with status 'Backlog'
    const createRes = await fetch(`${baseUrl}/api/tasks`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        projectId: 'prj-1',
        title: 'Definir arquitetura de funil Q1',
        status: 'Backlog',
        priority: 'Alta',
        estimatedHours: 6,
      }),
    });
    assert.equal(createRes.status, 201);
    const created = await createRes.json();
    assert.equal(created.status, 'Backlog');

    // 2. Reject invalid status on POST and PATCH
    const badPost = await fetch(`${baseUrl}/api/tasks`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ projectId: 'prj-1', title: 'Inválida', status: 'StatusDesconhecido' }),
    });
    assert.equal(badPost.status, 400);

    const badPatch = await fetch(`${baseUrl}/api/tasks/${created.id}`, {
      method: 'PATCH',
      headers,
      body: JSON.stringify({ status: 'ArchivedInvalid' }),
    });
    assert.equal(badPatch.status, 400);

    // 3. Cycle through EVERY valid status and verify response + persistence
    const allValidStatuses = ['Backlog', 'A fazer', 'Em andamento', 'Em revisão', 'Concluída', 'Backlog'] as const;
    for (const st of allValidStatuses) {
      const patchRes = await fetch(`${baseUrl}/api/tasks/${created.id}`, {
        method: 'PATCH',
        headers,
        body: JSON.stringify({ status: st }),
      });
      assert.equal(patchRes.status, 200, `Expected 200 when setting task status to "${st}"`);
      const body = await patchRes.json();
      assert.equal(body.task.status, st);
      assert.equal(typeof body.projectProgress, 'number');
    }

    // 4. Reload PersistentStore from disk and verify 'Backlog' persisted
    const reloaded = new PersistentStore(dbPath);
    const persisted = reloaded.getState().tasks.find((t) => t.id === created.id);
    assert.ok(persisted);
    assert.equal(persisted.status, 'Backlog');
  } finally {
    await cleanup();
  }
});

test('P0-BILL-01: Centralized Entitlements service enforces plan limits (users, landingPages, sites) and subscription lifecycle states server-side', async () => {
  const { baseUrl, store, cleanup } = await startP0Server();
  try {
    // org-2 starts with NER_BUSINESS_GROWTH (active): users=5 (1 used), landingPages=3 (0 used), sites=1 (0 used)
    const org2Admin = await loginAs(baseUrl, 'marcos@nersp.com');
    const headers = { 'Content-Type': 'application/json', Authorization: `Bearer ${org2Admin.data.token}` };

    // Verify entitlements endpoint reflects exact limits & usage
    const entRes = await fetch(`${baseUrl}/api/billing/entitlements`, { headers });
    assert.equal(entRes.status, 200);
    const ent = await entRes.json();
    assert.equal(ent.isEntitled, true);
    assert.equal(ent.limits.users, 5);
    assert.equal(ent.usage.users, 1);
    assert.equal(ent.limits.landingPages, 3);
    assert.equal(ent.limits.sites, 1);

    // 1. User limit enforcement: create 4 users (total 5 -> OK), 6th user -> 402 PLAN_USER_LIMIT_EXCEEDED
    let lastCreatedUserId = '';
    for (let i = 1; i <= 4; i++) {
      const uRes = await fetch(`${baseUrl}/api/users`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          name: `Membro SP ${i}`,
          email: `membro${i}@nersp.com`,
          password: 'StrongPassword@1',
          role: 'Criativo',
        }),
      });
      assert.equal(uRes.status, 201, `User ${i} within quota should succeed`);
      lastCreatedUserId = (await uRes.json()).id;
    }

    const overUserRes = await fetch(`${baseUrl}/api/users`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        name: 'Excedente SP',
        email: 'excedente@nersp.com',
        password: 'StrongPassword@1',
        role: 'Criativo',
      }),
    });
    assert.equal(overUserRes.status, 402);
    const overUserBody = await overUserRes.json();
    assert.equal(overUserBody.code, 'PLAN_USER_LIMIT_EXCEEDED');

    // Deactivate 1 user, create 1 replacement (now 5/5), then try reactivating the inactive user -> 402
    assert.equal(
      (
        await fetch(`${baseUrl}/api/users/${lastCreatedUserId}/status`, {
          method: 'PATCH',
          headers,
          body: JSON.stringify({ status: 'Inativo' }),
        })
      ).status,
      200
    );
    assert.equal(
      (
        await fetch(`${baseUrl}/api/users`, {
          method: 'POST',
          headers,
          body: JSON.stringify({
            name: 'Substituto SP',
            email: 'substituto@nersp.com',
            password: 'StrongPassword@1',
            role: 'Comercial',
          }),
        })
      ).status,
      201
    );
    const reactivateBlocked = await fetch(`${baseUrl}/api/users/${lastCreatedUserId}/status`, {
      method: 'PATCH',
      headers,
      body: JSON.stringify({ status: 'Ativo' }),
    });
    assert.equal(reactivateBlocked.status, 402);
    assert.equal((await reactivateBlocked.json()).code, 'PLAN_USER_LIMIT_EXCEEDED');

    // 2. Landing Pages & Sites quota enforcement on org-2 (landingPages: 3, sites: 1)
    for (let i = 1; i <= 3; i++) {
      const lpRes = await fetch(`${baseUrl}/api/web/pages`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          clientId: 'cli-3',
          title: `LP Alpha ${i}`,
          slug: `lp-alpha-${i}`,
          pageType: 'Landing Page Captura',
        }),
      });
      assert.equal(lpRes.status, 201);
    }
    const overLp = await fetch(`${baseUrl}/api/web/pages`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        clientId: 'cli-3',
        title: 'LP Alpha Excedente',
        slug: 'lp-alpha-4',
        pageType: 'Landing Page Captura',
      }),
    });
    assert.equal(overLp.status, 402);
    assert.equal((await overLp.json()).code, 'PLAN_LANDING_PAGE_LIMIT_EXCEEDED');

    const site1 = await fetch(`${baseUrl}/api/web/pages`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        clientId: 'cli-3',
        title: 'Site Alpha',
        slug: 'site-alpha-1',
        pageType: 'Site Institucional',
      }),
    });
    assert.equal(site1.status, 201);
    const site1Data = await site1.json();

    const overSite = await fetch(`${baseUrl}/api/web/pages`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        clientId: 'cli-3',
        title: 'Site Alpha 2',
        slug: 'site-alpha-2',
        pageType: 'Site Institucional',
      }),
    });
    assert.equal(overSite.status, 402);
    assert.equal((await overSite.json()).code, 'PLAN_SITE_LIMIT_EXCEEDED');

    // 3. Subscription lifecycle states: past_due, canceled, incomplete, expired, suspended org
    const sub2 = store.getState().subscriptions.find((s) => s.organizationId === 'org-2')!;
    const org2 = store.getState().organizations.find((o) => o.id === 'org-2')!;

    // 3a. Delinquency (past_due) blocks new project AND publishing web page
    sub2.status = 'past_due';
    store.save();
    const pastDueProj = await fetch(`${baseUrl}/api/projects`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ clientId: 'cli-3', name: 'Blocked Past Due' }),
    });
    assert.equal(pastDueProj.status, 402);
    assert.equal((await pastDueProj.json()).code, 'SUBSCRIPTION_PAST_DUE');

    const pastDuePub = await fetch(`${baseUrl}/api/web/pages/${site1Data.id}`, {
      method: 'PATCH',
      headers,
      body: JSON.stringify({ status: 'Publicado' }),
    });
    assert.equal(pastDuePub.status, 402);
    assert.equal((await pastDuePub.json()).code, 'SUBSCRIPTION_PAST_DUE');

    // 3b. Canceled subscription blocks with 403
    sub2.status = 'canceled';
    store.save();
    const canceledCli = await fetch(`${baseUrl}/api/clients`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ name: 'Blocked Canceled', email: 'c@c.com' }),
    });
    assert.equal(canceledCli.status, 403);
    assert.equal((await canceledCli.json()).code, 'SUBSCRIPTION_CANCELED');

    // 3c. Incomplete checkout blocks with 402
    sub2.status = 'incomplete';
    store.save();
    const incompleteLead = await fetch(`${baseUrl}/api/leads`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ name: 'L', email: 'l@l.com', company: 'Co' }),
    });
    assert.equal(incompleteLead.status, 402);
    assert.equal((await incompleteLead.json()).code, 'SUBSCRIPTION_INCOMPLETE');

    // 3d. Expired subscription (active status but currentPeriodEnd in the past) blocks with 402
    sub2.status = 'active';
    sub2.currentPeriodEnd = new Date(Date.now() - 86400000).toISOString();
    store.save();
    const expiredProj = await fetch(`${baseUrl}/api/projects`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ clientId: 'cli-3', name: 'Blocked Expired' }),
    });
    assert.equal(expiredProj.status, 402);
    assert.equal((await expiredProj.json()).code, 'SUBSCRIPTION_EXPIRED');

    // 3e. Suspended organization blocks with 403 even if subscription is valid
    sub2.currentPeriodEnd = new Date(Date.now() + 30 * 86400000).toISOString();
    org2.status = 'Suspenso';
    store.save();
    const superAdmin = await loginAs(baseUrl, 'maycon@neragency.com');
    const suspRes = await fetch(`${baseUrl}/api/projects`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${superAdmin.data.token}` },
      body: JSON.stringify({ organizationId: 'org-2', clientId: 'cli-3', name: 'Blocked Suspended' }),
    });
    assert.equal(suspRes.status, 403);
    assert.equal((await suspRes.json()).code, 'ORG_SUSPENDED');

    // 3f. Restoring active org + active non-expired subscription restores access!
    org2.status = 'Ativo';
    store.save();
    const okProj = await fetch(`${baseUrl}/api/projects`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ clientId: 'cli-3', name: 'Projeto Pós-Regularização' }),
    });
    assert.equal(okProj.status, 201);

    // 4. Verify ENTITLEMENT_DENIED audit trail was recorded
    const deniedAudits = store.getState().auditLogs.filter(
      (a) => a.organizationId === 'org-2' && a.action === 'ENTITLEMENT_DENIED'
    );
    assert.ok(deniedAudits.length >= 6, `Expected >= 6 ENTITLEMENT_DENIED audit entries, found ${deniedAudits.length}`);
  } finally {
    await cleanup();
  }
});

test('P0-HARDENING-1: Cliente global finance scope returns 403 and unauthorized access attempts on billing/finance are audited without leaking secrets', async () => {
  const { baseUrl, store, cleanup } = await startP0Server();
  try {
    const client = await loginAs(baseUrl, 'lucas@techflow.io');
    const clientHeaders = { Authorization: `Bearer ${client.data.token}` };

    // Cliente requesting global or organization scope on /api/finance/summary receives 403
    const globalRes = await fetch(`${baseUrl}/api/finance/summary?scope=global`, { headers: clientHeaders });
    assert.equal(globalRes.status, 403);

    const orgScopeRes = await fetch(`${baseUrl}/api/finance/summary?scope=organization`, { headers: clientHeaders });
    assert.equal(orgScopeRes.status, 403);

    // Cliente and non-admin employee roles attempting /api/billing/subscription receive 403
    const cliSubRes = await fetch(`${baseUrl}/api/billing/subscription`, { headers: clientHeaders });
    assert.equal(cliSubRes.status, 403);

    const gestor = await loginAs(baseUrl, 'carlos@neragency.com');
    const gestorSubRes = await fetch(`${baseUrl}/api/billing/subscription`, {
      headers: { Authorization: `Bearer ${gestor.data.token}` },
    });
    assert.equal(gestorSubRes.status, 403);

    // Verify SECURITY_UNAUTHORIZED_ACCESS audit logs recorded and do not leak tokens or passwords
    const secLogs = store
      .getState()
      .auditLogs.filter((a) => a.action === 'SECURITY_UNAUTHORIZED_ACCESS');
    assert.ok(secLogs.length >= 4, `Expected >= 4 SECURITY_UNAUTHORIZED_ACCESS audit logs, found ${secLogs.length}`);

    const serialized = JSON.stringify(secLogs);
    assert.equal(serialized.includes(client.data.token), false, 'Audit logs must never contain bearer tokens');
    assert.equal(serialized.includes(gestor.data.token), false, 'Audit logs must never contain bearer tokens');
    assert.equal(serialized.includes('NerAgency@2026'), false, 'Audit logs must never contain passwords');
    assert.equal(serialized.includes('passwordHash'), false, 'Audit logs must never contain password hashes');
  } finally {
    await cleanup();
  }
});

test('P0-HARDENING-2: GET /api/tasks?status=Backlog filters accurately, rejects invalid status with 400, and survives reload', async () => {
  const { baseUrl, dbPath, cleanup } = await startP0Server();
  try {
    const gestor = await loginAs(baseUrl, 'carlos@neragency.com');
    const headers = { 'Content-Type': 'application/json', Authorization: `Bearer ${gestor.data.token}` };

    const createRes = await fetch(`${baseUrl}/api/tasks`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        projectId: 'prj-1',
        title: 'Tarefa filtrável em Backlog',
        status: 'Backlog',
        priority: 'Normal',
      }),
    });
    assert.equal(createRes.status, 201);
    const created = await createRes.json();

    const backlogRes = await fetch(`${baseUrl}/api/tasks?status=Backlog`, { headers });
    assert.equal(backlogRes.status, 200);
    const backlogTasks = await backlogRes.json();
    assert.ok(Array.isArray(backlogTasks) && backlogTasks.length >= 1);
    assert.ok(backlogTasks.every((t: any) => t.status === 'Backlog'));
    assert.ok(backlogTasks.some((t: any) => t.id === created.id));

    const invalidQuery = await fetch(`${baseUrl}/api/tasks?status=InvalidStatus`, { headers });
    assert.equal(invalidQuery.status, 400);

    const reloaded = new PersistentStore(dbPath);
    const reloadedBacklog = reloaded.getState().tasks.filter((t) => t.status === 'Backlog');
    assert.ok(reloadedBacklog.some((t) => t.id === created.id));
  } finally {
    await cleanup();
  }
});

test('P0-HARDENING-3: Concurrent creations cannot bypass user or landing page plan quotas (race-condition protection)', async () => {
  const { baseUrl, store, cleanup } = await startP0Server();
  try {
    const org2Admin = await loginAs(baseUrl, 'marcos@nersp.com');
    const headers = { 'Content-Type': 'application/json', Authorization: `Bearer ${org2Admin.data.token}` };

    // org-2 starts with 1/5 active users -> create 3 to reach 4/5
    for (let i = 1; i <= 3; i++) {
      const r = await fetch(`${baseUrl}/api/users`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          name: `PreUser ${i}`,
          email: `preuser${i}@nersp.com`,
          password: 'StrongPassword@1',
          role: 'Criativo',
        }),
      });
      assert.equal(r.status, 201);
    }

    // Fire 2 simultaneous POST /api/users requests competing for the final 5th slot
    const [uRaceA, uRaceB] = await Promise.all([
      fetch(`${baseUrl}/api/users`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          name: 'Race User A',
          email: 'race-a@nersp.com',
          password: 'StrongPassword@1',
          role: 'Criativo',
        }),
      }),
      fetch(`${baseUrl}/api/users`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          name: 'Race User B',
          email: 'race-b@nersp.com',
          password: 'StrongPassword@1',
          role: 'Criativo',
        }),
      }),
    ]);

    const userStatuses = [uRaceA.status, uRaceB.status].sort((a, b) => a - b);
    assert.deepEqual(userStatuses, [201, 402], `Expected exactly one 201 and one 402, got ${userStatuses.join(', ')}`);
    const blockedUserBody = uRaceA.status === 402 ? await uRaceA.json() : await uRaceB.json();
    assert.equal(blockedUserBody.code, 'PLAN_USER_LIMIT_EXCEEDED');

    const activeOrg2Users = store
      .getState()
      .users.filter((u) => u.organizationId === 'org-2' && u.status === 'Ativo').length;
    assert.equal(activeOrg2Users, 5);

    // org-2 starts with 0/3 landing pages -> create 2 to reach 2/3
    for (let i = 1; i <= 2; i++) {
      const r = await fetch(`${baseUrl}/api/web/pages`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          clientId: 'cli-3',
          title: `Pre LP ${i}`,
          slug: `pre-lp-${i}`,
          pageType: 'Landing Page Captura',
        }),
      });
      assert.equal(r.status, 201);
    }

    // Fire 2 simultaneous POST /api/web/pages competing for the 3rd LP slot
    const [lpRaceA, lpRaceB] = await Promise.all([
      fetch(`${baseUrl}/api/web/pages`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          clientId: 'cli-3',
          title: 'Race LP A',
          slug: 'race-lp-a',
          pageType: 'Landing Page Captura',
        }),
      }),
      fetch(`${baseUrl}/api/web/pages`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          clientId: 'cli-3',
          title: 'Race LP B',
          slug: 'race-lp-b',
          pageType: 'Landing Page Captura',
        }),
      }),
    ]);

    const lpStatuses = [lpRaceA.status, lpRaceB.status].sort((a, b) => a - b);
    assert.deepEqual(lpStatuses, [201, 402], `Expected exactly one 201 and one 402, got ${lpStatuses.join(', ')}`);
    const blockedLpBody = lpRaceA.status === 402 ? await lpRaceA.json() : await lpRaceB.json();
    assert.equal(blockedLpBody.code, 'PLAN_LANDING_PAGE_LIMIT_EXCEEDED');

    const activeOrg2Lps = store
      .getState()
      .webPages.filter((w) => w.organizationId === 'org-2' && !w.archivedAt).length;
    assert.equal(activeOrg2Lps, 3);
  } finally {
    await cleanup();
  }
});

test('P0-HARDENING-4: Archive/restore cannot bypass web page quota and FEATURE_NOT_IN_PLAN enforces plan feature flags', async () => {
  const { baseUrl, store, cleanup } = await startP0Server();
  try {
    const org2Admin = await loginAs(baseUrl, 'marcos@nersp.com');
    const headers = { 'Content-Type': 'application/json', Authorization: `Bearer ${org2Admin.data.token}` };

    // Fill org-2 landing pages to 3/3
    const createdIds: string[] = [];
    for (let i = 1; i <= 3; i++) {
      const r = await fetch(`${baseUrl}/api/web/pages`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          clientId: 'cli-3',
          title: `Archive Test LP ${i}`,
          slug: `archive-lp-${i}`,
          pageType: 'Landing Page Captura',
        }),
      });
      assert.equal(r.status, 201);
      createdIds.push((await r.json()).id);
    }

    // Archive 1 LP -> frees a slot (now 2/3)
    const archiveRes = await fetch(`${baseUrl}/api/archive/web-pages/${createdIds[0]}`, {
      method: 'PATCH',
      headers,
      body: JSON.stringify({ restore: false, reason: 'Pausa sazonal' }),
    });
    assert.equal(archiveRes.status, 200);

    // Creating a new LP now succeeds (back to 3/3)
    const replacementRes = await fetch(`${baseUrl}/api/web/pages`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        clientId: 'cli-3',
        title: 'Replacement LP',
        slug: 'archive-lp-replacement',
        pageType: 'Landing Page Captura',
      }),
    });
    assert.equal(replacementRes.status, 201);

    // Attempting to restore the archived LP when at 3/3 MUST be blocked with 402
    const restoreBlocked = await fetch(`${baseUrl}/api/archive/web-pages/${createdIds[0]}`, {
      method: 'PATCH',
      headers,
      body: JSON.stringify({ restore: true }),
    });
    assert.equal(restoreBlocked.status, 402);
    assert.equal((await restoreBlocked.json()).code, 'PLAN_LANDING_PAGE_LIMIT_EXCEEDED');

    // Verify FEATURE_NOT_IN_PLAN when plan lacks a feature (NER_PRODUCT_START has sites: 0 -> multiSite: false)
    const sub2 = store.getState().subscriptions.find((s) => s.organizationId === 'org-2')!;
    sub2.planCode = 'NER_PRODUCT_START';
    sub2.planName = 'NER Product Start';
    store.save();

    const featCheck = assertEntitlement(store, {
      organizationId: 'org-2',
      resource: 'feature',
      featureKey: 'multiSite',
      actorUserId: org2Admin.data.user.id,
      actionContext: 'test:multiSite',
    });
    assert.equal(featCheck.allowed, false);
    if (!featCheck.allowed) {
      assert.equal(featCheck.httpStatus, 403);
      assert.equal(featCheck.code, 'FEATURE_NOT_IN_PLAN');
    }
  } finally {
    await cleanup();
  }
});

test('P0-HARDENING-5: Malformed JSON returns clean 400, malformed non-hex signed URL returns 403, and untrusted Origin is denied CORS', async () => {
  const { baseUrl, cleanup } = await startP0Server();
  try {
    const admin = await loginAs(baseUrl, 'maycon@neragency.com');
    const authHeaders = { Authorization: `Bearer ${admin.data.token}` };

    // 1. Malformed JSON returns clean 400 without leaking stack traces
    const badJsonRes = await fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{"email": "broken-json',
    });
    assert.equal(badJsonRes.status, 400);
    const badJsonText = await badJsonRes.text();
    assert.equal(badJsonText.includes('SyntaxError'), false, 'Response must not leak stack/error internals');
    assert.equal(badJsonText.includes('at '), false, 'Response must not leak stack frames');

    // 2. Upload a real asset and probe download with a malformed 64-char non-hex signature -> must return 403 (not 500 RangeError)
    const uploadRes = await fetch(`${baseUrl}/api/storage/upload`, {
      method: 'POST',
      headers: { ...authHeaders, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        fileName: 'p0-check.txt',
        mimeType: 'text/plain',
        contentBase64: Buffer.from('ok').toString('base64'),
        module: 'general',
      }),
    });
    assert.equal(uploadRes.status, 201);
    const uploaded = await uploadRes.json();

    const futureExp = Date.now() + 60_000;
    const nonHexSig = 'z'.repeat(64);
    const badSigRes = await fetch(
      `${baseUrl}/api/storage/assets/${uploaded.id}/download?exp=${futureExp}&sig=${nonHexSig}`
    );
    assert.equal(badSigRes.status, 403, 'Non-hex 64-char signature must return 403 without crashing timingSafeEqual');

    // Clean up uploaded test file via delete endpoint
    const delRes = await fetch(`${baseUrl}/api/storage/assets/${uploaded.id}`, {
      method: 'DELETE',
      headers: authHeaders,
    });
    assert.equal(delRes.status, 200);

    // 3. Untrusted CORS Origin must NOT receive Access-Control-Allow-Origin
    const corsRes = await fetch(`${baseUrl}/api/health`, {
      headers: { Origin: 'https://evil.example' },
    });
    assert.equal(corsRes.status, 200);
    assert.equal(corsRes.headers.get('access-control-allow-origin'), null);
  } finally {
    await cleanup();
  }
});

