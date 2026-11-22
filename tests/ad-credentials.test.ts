import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import type { AddressInfo } from 'node:net';
import { PersistentStore } from '../server/store.ts';
import { createApp } from '../server/app.ts';
import { resetLoginRateLimiter } from '../server/middleware/auth.ts';
import { resolveDecryptedAdCredentials } from '../server/services/ad-credentials.ts';

const TEST_MASTER_KEY = crypto.randomBytes(32).toString('hex');

const ENV_KEYS_TO_ISOLATE = [
  'NER_AI_ENCRYPTION_KEY',
  'META_ACCESS_TOKEN',
  'META_APP_SECRET',
  'META_PIXEL_ID',
  'META_AD_ACCOUNT_ID',
  'GA4_MEASUREMENT_ID',
  'GA4_API_SECRET',
  'GOOGLE_ADS_DEVELOPER_TOKEN',
  'GOOGLE_ADS_CLIENT_SECRET',
  'GOOGLE_ADS_REFRESH_TOKEN',
  'GOOGLE_ADS_CUSTOMER_ID',
  'TIKTOK_ACCESS_TOKEN',
  'TIKTOK_APP_SECRET',
  'TIKTOK_ADVERTISER_ID',
  'TIKTOK_PIXEL_ID',
];

function snapshotAndClearEnv(): () => void {
  const saved: Record<string, string | undefined> = {};
  for (const k of ENV_KEYS_TO_ISOLATE) {
    saved[k] = process.env[k];
    delete process.env[k];
  }
  return () => {
    for (const k of ENV_KEYS_TO_ISOLATE) {
      if (saved[k] === undefined) delete process.env[k];
      else process.env[k] = saved[k];
    }
  };
}

async function startVaultServer() {
  resetLoginRateLimiter();
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ner-ad-vault-'));
  const dbPath = path.join(tmpDir, 'ner-vault-db.json');
  const store = new PersistentStore(dbPath);
  const { app } = createApp(store);

  const server = await new Promise<import('node:http').Server>((resolve) => {
    const s = app.listen(0, '127.0.0.1', () => resolve(s));
  });
  const addr = server.address() as AddressInfo;
  const baseUrl = `http://127.0.0.1:${addr.port}`;

  const cleanup = async () => {
    await new Promise<void>((resolve, reject) =>
      server.close((err) => (err ? reject(err) : resolve()))
    );
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
  assert.equal(res.status, 200, `Login failed for ${email}: ${JSON.stringify(data)}`);
  return data.token as string;
}

test('AD-VAULT-1: Refuses to persist plaintext secrets when NER_AI_ENCRYPTION_KEY is missing', async () => {
  const restoreEnv = snapshotAndClearEnv();
  const { baseUrl, dbPath, cleanup } = await startVaultServer();
  try {
    const adminToken = await loginAs(baseUrl, 'maycon@neragency.com');

    const getRes = await fetch(`${baseUrl}/api/integrations/ad-credentials?organizationId=org-1`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    assert.equal(getRes.status, 200);
    const getBody: any = await getRes.json();
    assert.equal(getBody.encryptionKeyConfigured, false);
    assert.equal(getBody.providers.length, 3);

    const secretToken = 'EAAG_SECRET_SHOULD_NEVER_BE_STORED_IN_PLAINTEXT_9911';
    const putRes = await fetch(`${baseUrl}/api/integrations/ad-credentials/meta_ads`, {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${adminToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        organizationId: 'org-1',
        publicConfig: { pixelId: '1234567890' },
        secrets: { accessToken: secretToken },
      }),
    });
    assert.equal(putRes.status, 400);
    const errBody: any = await putRes.json();
    assert.equal(errBody.code, 'NER_AI_ENCRYPTION_KEY_MISSING');

    const diskContent = fs.readFileSync(dbPath, 'utf-8');
    assert.equal(diskContent.includes(secretToken), false);
  } finally {
    await cleanup();
    restoreEnv();
  }
});

test('AD-VAULT-2: Encrypts Meta, Google, and TikTok credentials at rest with NER_AI_ENCRYPTION_KEY and never exposes secrets or ciphertexts to frontend', async () => {
  const restoreEnv = snapshotAndClearEnv();
  process.env.NER_AI_ENCRYPTION_KEY = TEST_MASTER_KEY;
  const { baseUrl, dbPath, store, cleanup } = await startVaultServer();
  try {
    const adminToken = await loginAs(baseUrl, 'maycon@neragency.com');

    const secrets = {
      metaAccess: 'EAAG_META_LIVE_TOKEN_SUPER_SECRET_11223344',
      metaAppSecret: 'meta_app_secret_top_confidential_556677',
      googleDevToken: 'gads_dev_token_sensitive_value_889900',
      ga4Secret: 'ga4_mp_api_secret_confidential_443322',
      tiktokAccess: 'tt_marketing_access_token_secret_776655',
    };

    // 1. Save Meta Ads credentials
    const metaPut = await fetch(`${baseUrl}/api/integrations/ad-credentials/meta_ads`, {
      method: 'PUT',
      headers: { Authorization: `Bearer ${adminToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        organizationId: 'org-1',
        publicConfig: { pixelId: '998877665544', adAccountId: 'act_1122334455', appId: '10101010' },
        secrets: { accessToken: secrets.metaAccess, appSecret: secrets.metaAppSecret },
      }),
    });
    assert.equal(metaPut.status, 200);
    const metaPutText = await metaPut.text();
    assert.equal(metaPutText.includes(secrets.metaAccess), false);
    assert.equal(metaPutText.includes(secrets.metaAppSecret), false);
    assert.equal(metaPutText.includes('enc:v1:'), false);

    // 2. Save Google Ads & GA4 credentials
    const googlePut = await fetch(`${baseUrl}/api/integrations/ad-credentials/google_ads`, {
      method: 'PUT',
      headers: { Authorization: `Bearer ${adminToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        organizationId: 'org-1',
        publicConfig: { customerId: '123-456-7890', ga4MeasurementId: 'G-NER9876543' },
        secrets: { developerToken: secrets.googleDevToken, ga4ApiSecret: secrets.ga4Secret },
      }),
    });
    assert.equal(googlePut.status, 200);

    // 3. Save TikTok Ads credentials
    const tiktokPut = await fetch(`${baseUrl}/api/integrations/ad-credentials/tiktok_ads`, {
      method: 'PUT',
      headers: { Authorization: `Bearer ${adminToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        organizationId: 'org-1',
        publicConfig: { advertiserId: '7012345678901234567', pixelId: 'CTIKTOK9988' },
        secrets: { accessToken: secrets.tiktokAccess },
      }),
    });
    assert.equal(tiktokPut.status, 200);

    // 4. Verify encrypted at rest directly in persisted JSON file
    const rawDisk = fs.readFileSync(dbPath, 'utf-8');
    for (const secretVal of Object.values(secrets)) {
      assert.equal(rawDisk.includes(secretVal), false, `Plaintext secret leaked to disk!`);
    }
    const parsedDisk = JSON.parse(rawDisk);
    const metaDiskRec = parsedDisk.adIntegrationCredentials.find(
      (r: any) => r.organizationId === 'org-1' && r.provider === 'meta_ads'
    );
    assert.ok(metaDiskRec, 'Meta Ads record should be persisted on disk');
    assert.ok(metaDiskRec.encryptedSecrets.accessToken.startsWith('enc:v1:'));
    assert.ok(metaDiskRec.encryptedSecrets.appSecret.startsWith('enc:v1:'));

    // 5. Verify server-side decryption roundtrip
    const resolvedMeta = resolveDecryptedAdCredentials(store, 'org-1', 'meta_ads');
    assert.equal(resolvedMeta.configured, true);
    assert.equal(resolvedMeta.source, 'encrypted_db');
    assert.equal(resolvedMeta.secrets.accessToken, secrets.metaAccess);
    assert.equal(resolvedMeta.secrets.appSecret, secrets.metaAppSecret);

    const resolvedGoogle = resolveDecryptedAdCredentials(store, 'org-1', 'google_ads');
    assert.equal(resolvedGoogle.configured, true);
    assert.equal(resolvedGoogle.secrets.developerToken, secrets.googleDevToken);
    assert.equal(resolvedGoogle.secrets.ga4ApiSecret, secrets.ga4Secret);

    const resolvedTiktok = resolveDecryptedAdCredentials(store, 'org-1', 'tiktok_ads');
    assert.equal(resolvedTiktok.configured, true);
    assert.equal(resolvedTiktok.secrets.accessToken, secrets.tiktokAccess);

    // 6. Verify GET vault, status, performance, operations, and audit logs NEVER expose secrets or ciphertexts
    const endpoints = [
      '/api/integrations/ad-credentials?organizationId=org-1',
      '/api/integrations/status?organizationId=org-1',
      '/api/performance?organizationId=org-1',
      '/api/operations/overview?organizationId=org-1',
      '/api/audit-logs?organizationId=org-1',
    ];
    for (const ep of endpoints) {
      const r = await fetch(`${baseUrl}${ep}`, {
        headers: { Authorization: `Bearer ${adminToken}` },
      });
      assert.equal(r.status, 200, `Expected 200 for ${ep}`);
      const txt = await r.text();
      for (const secretVal of Object.values(secrets)) {
        assert.equal(txt.includes(secretVal), false, `Plaintext secret leaked in ${ep}`);
      }
      assert.equal(txt.includes('enc:v1:'), false, `Raw ciphertext leaked in ${ep}`);
    }

    // 7. Verify masked preview & live readiness in /api/integrations/status and /api/performance
    const vaultRes = await fetch(`${baseUrl}/api/integrations/ad-credentials?organizationId=org-1`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    const vaultData: any = await vaultRes.json();
    assert.equal(vaultData.encryptionKeyConfigured, true);
    const metaDto = vaultData.providers.find((p: any) => p.provider === 'meta_ads');
    assert.equal(metaDto.configured, true);
    assert.equal(metaDto.credentialSource, 'encrypted_db');
    const accessMask = metaDto.secretFields.find((f: any) => f.key === 'accessToken')?.mask;
    assert.equal(accessMask, 'EAAG••••3344');

    const statusRes = await fetch(`${baseUrl}/api/integrations/status?organizationId=org-1`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    const statusData: any = await statusRes.json();
    for (const key of ['meta_ads_capi', 'google_ads_ga4', 'tiktok_ads']) {
      const item = statusData.integrations.find((i: any) => i.key === key);
      assert.equal(item.configured, true, `${key} should be configured`);
      assert.equal(item.status, 'CONFIGURADO (COFRE CRIPTOGRAFADO)');
    }

    const perfRes = await fetch(`${baseUrl}/api/performance?organizationId=org-1`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    const perfData: any = await perfRes.json();
    assert.ok(
      perfData.adAccounts.every((a: any) => a.connectionStatus === 'Conectado (Cofre Criptografado)')
    );
  } finally {
    await cleanup();
    restoreEnv();
  }
});

test('AD-VAULT-3: Partial updates preserve existing encrypted secrets and explicit clearSecrets removes targeted secret', async () => {
  const restoreEnv = snapshotAndClearEnv();
  process.env.NER_AI_ENCRYPTION_KEY = TEST_MASTER_KEY;
  const { baseUrl, store, cleanup } = await startVaultServer();
  try {
    const adminToken = await loginAs(baseUrl, 'maycon@neragency.com');

    await fetch(`${baseUrl}/api/integrations/ad-credentials/meta_ads`, {
      method: 'PUT',
      headers: { Authorization: `Bearer ${adminToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        organizationId: 'org-1',
        publicConfig: { pixelId: '111111111' },
        secrets: {
          accessToken: 'EAAG_INITIAL_TOKEN_123456',
          appSecret: 'meta_initial_app_secret_7890',
        },
      }),
    });

    // Update only pixelId with blank secrets -> must preserve existing encrypted secrets
    const partialRes = await fetch(`${baseUrl}/api/integrations/ad-credentials/meta_ads`, {
      method: 'PUT',
      headers: { Authorization: `Bearer ${adminToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        organizationId: 'org-1',
        publicConfig: { pixelId: '222222222' },
        secrets: { accessToken: '' },
      }),
    });
    assert.equal(partialRes.status, 200);

    let resolved = resolveDecryptedAdCredentials(store, 'org-1', 'meta_ads');
    assert.equal(resolved.publicConfig.pixelId, '222222222');
    assert.equal(resolved.secrets.accessToken, 'EAAG_INITIAL_TOKEN_123456');
    assert.equal(resolved.secrets.appSecret, 'meta_initial_app_secret_7890');

    // Explicitly clear only appSecret
    const clearRes = await fetch(`${baseUrl}/api/integrations/ad-credentials/meta_ads`, {
      method: 'PUT',
      headers: { Authorization: `Bearer ${adminToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        organizationId: 'org-1',
        clearSecrets: ['appSecret'],
      }),
    });
    assert.equal(clearRes.status, 200);
    resolved = resolveDecryptedAdCredentials(store, 'org-1', 'meta_ads');
    assert.equal(resolved.secrets.accessToken, 'EAAG_INITIAL_TOKEN_123456');
    assert.equal(resolved.secrets.appSecret, '');

    // Reject unknown/injected field names
    const badFieldRes = await fetch(`${baseUrl}/api/integrations/ad-credentials/meta_ads`, {
      method: 'PUT',
      headers: { Authorization: `Bearer ${adminToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        organizationId: 'org-1',
        secrets: { __proto__pollute: 'x', arbitraryKey: 'y' },
      }),
    });
    assert.equal(badFieldRes.status, 400);
  } finally {
    await cleanup();
    restoreEnv();
  }
});

test('AD-VAULT-4: Strict RBAC (401 anon, 403 Cliente/Comercial/Gestor) and multi-tenant isolation between org-1 and org-2', async () => {
  const restoreEnv = snapshotAndClearEnv();
  process.env.NER_AI_ENCRYPTION_KEY = TEST_MASTER_KEY;
  const { baseUrl, cleanup } = await startVaultServer();
  try {
    // Anonymous blocked with 401
    const anonGet = await fetch(`${baseUrl}/api/integrations/ad-credentials`);
    assert.equal(anonGet.status, 401);
    const anonPut = await fetch(`${baseUrl}/api/integrations/ad-credentials/meta_ads`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ publicConfig: { pixelId: '1' } }),
    });
    assert.equal(anonPut.status, 401);

    // Non-admin roles blocked with 403
    for (const email of ['lucas@techflow.io', 'ana@neragency.com', 'carlos@neragency.com']) {
      const tok = await loginAs(baseUrl, email);
      const rGet = await fetch(`${baseUrl}/api/integrations/ad-credentials`, {
        headers: { Authorization: `Bearer ${tok}` },
      });
      assert.equal(rGet.status, 403, `${email} must receive 403 on GET ad-credentials`);

      const rPut = await fetch(`${baseUrl}/api/integrations/ad-credentials/meta_ads`, {
        method: 'PUT',
        headers: { Authorization: `Bearer ${tok}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ publicConfig: { pixelId: '123' } }),
      });
      assert.equal(rPut.status, 403, `${email} must receive 403 on PUT ad-credentials`);

      const rDel = await fetch(`${baseUrl}/api/integrations/ad-credentials/meta_ads`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${tok}` },
      });
      assert.equal(rDel.status, 403, `${email} must receive 403 on DELETE ad-credentials`);
    }

    // Super Admin configures org-1 Meta Ads
    const superAdminToken = await loginAs(baseUrl, 'maycon@neragency.com');
    const saveOrg1 = await fetch(`${baseUrl}/api/integrations/ad-credentials/meta_ads`, {
      method: 'PUT',
      headers: { Authorization: `Bearer ${superAdminToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        organizationId: 'org-1',
        publicConfig: { pixelId: 'ORG1_PIXEL_999' },
        secrets: { accessToken: 'EAAG_ORG1_PRIVATE_TOKEN_1111' },
      }),
    });
    assert.equal(saveOrg1.status, 200);

    // Org-2 Admin (marcos@nersp.com) CANNOT access org-1 credentials (403)
    const org2AdminToken = await loginAs(baseUrl, 'marcos@nersp.com');
    const crossGet = await fetch(`${baseUrl}/api/integrations/ad-credentials?organizationId=org-1`, {
      headers: { Authorization: `Bearer ${org2AdminToken}` },
    });
    assert.equal(crossGet.status, 403);

    const crossPut = await fetch(`${baseUrl}/api/integrations/ad-credentials/meta_ads`, {
      method: 'PUT',
      headers: { Authorization: `Bearer ${org2AdminToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ organizationId: 'org-1', publicConfig: { pixelId: 'HIJACK' } }),
    });
    assert.equal(crossPut.status, 403);

    // Org-2 own status MUST remain unconfigured (org-1 credentials never bleed to org-2)
    const org2Status = await fetch(`${baseUrl}/api/integrations/status`, {
      headers: { Authorization: `Bearer ${org2AdminToken}` },
    });
    assert.equal(org2Status.status, 200);
    const org2StatusBody: any = await org2Status.json();
    const org2Meta = org2StatusBody.integrations.find((i: any) => i.key === 'meta_ads_capi');
    assert.equal(org2Meta.configured, false);
    assert.equal(org2Meta.status, 'BLOQUEADO POR CREDENCIAIS');
  } finally {
    await cleanup();
    restoreEnv();
  }
});

test('AD-VAULT-5: Config decryption test and DELETE revocation lifecycle with clean audit logs', async () => {
  const restoreEnv = snapshotAndClearEnv();
  process.env.NER_AI_ENCRYPTION_KEY = TEST_MASTER_KEY;
  const { baseUrl, cleanup } = await startVaultServer();
  try {
    const adminToken = await loginAs(baseUrl, 'maycon@neragency.com');

    await fetch(`${baseUrl}/api/integrations/ad-credentials/tiktok_ads`, {
      method: 'PUT',
      headers: { Authorization: `Bearer ${adminToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        organizationId: 'org-1',
        publicConfig: { advertiserId: '70999888777666555' },
        secrets: { accessToken: 'tt_secret_live_token_abcdef1234' },
      }),
    });

    const testRes = await fetch(`${baseUrl}/api/integrations/ad-credentials/tiktok_ads/test`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${adminToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ organizationId: 'org-1', verifyLive: false }),
    });
    assert.equal(testRes.status, 200);
    const testBody: any = await testRes.json();
    assert.equal(testBody.ok, true);
    assert.equal(testBody.mode, 'config_validation');

    const delRes = await fetch(
      `${baseUrl}/api/integrations/ad-credentials/tiktok_ads?organizationId=org-1`,
      {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${adminToken}` },
      }
    );
    assert.equal(delRes.status, 200);
    const delBody: any = await delRes.json();
    assert.equal(delBody.deleted, true);
    assert.equal(delBody.provider.configured, false);

    // Confirm status reverted to BLOQUEADO POR CREDENCIAIS
    const statusRes = await fetch(`${baseUrl}/api/integrations/status?organizationId=org-1`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    const statusData: any = await statusRes.json();
    const ttStatus = statusData.integrations.find((i: any) => i.key === 'tiktok_ads');
    assert.equal(ttStatus.configured, false);
    assert.equal(ttStatus.status, 'BLOQUEADO POR CREDENCIAIS');

    // Verify audit trail recorded actions without secret leakage
    const auditRes = await fetch(`${baseUrl}/api/audit-logs?organizationId=org-1`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    const auditLogs: any[] = await auditRes.json();
    const actions = auditLogs.map((l) => l.action);
    assert.ok(actions.includes('AD_CREDENTIALS_SAVED'));
    assert.ok(actions.includes('AD_CREDENTIALS_TESTED'));
    assert.ok(actions.includes('AD_CREDENTIALS_DELETED'));
    assert.equal(JSON.stringify(auditLogs).includes('tt_secret_live_token_abcdef1234'), false);
  } finally {
    await cleanup();
    restoreEnv();
  }
});
