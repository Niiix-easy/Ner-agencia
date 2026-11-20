import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { AddressInfo } from 'node:net';
import { PersistentStore } from '../server/store.ts';
import { createApp } from '../server/app.ts';
import {
  GoogleTokenVerifier,
  resetLoginRateLimiter,
} from '../server/middleware/auth.ts';

const TEST_GOOGLE_CLIENT_ID = '1234567890-neragencytest.apps.googleusercontent.com';

async function withGoogleEnv(
  vars: {
    GOOGLE_CLIENT_ID?: string;
    VITE_GOOGLE_CLIENT_ID?: string;
    GOOGLE_AUTH_ALLOW_AUTO_PROVISION?: string;
    GOOGLE_AUTH_DEFAULT_ROLE?: string;
  },
  fn: () => Promise<void>
) {
  const prev = {
    GOOGLE_CLIENT_ID: process.env.GOOGLE_CLIENT_ID,
    VITE_GOOGLE_CLIENT_ID: process.env.VITE_GOOGLE_CLIENT_ID,
    GOOGLE_AUTH_ALLOW_AUTO_PROVISION: process.env.GOOGLE_AUTH_ALLOW_AUTO_PROVISION,
    GOOGLE_AUTH_DEFAULT_ROLE: process.env.GOOGLE_AUTH_DEFAULT_ROLE,
  };

  for (const [key, value] of Object.entries(vars)) {
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }

  try {
    await fn();
  } finally {
    for (const [key, value] of Object.entries(prev)) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  }
}

async function startGoogleAuthServer(googleTokenVerifier?: GoogleTokenVerifier) {
  resetLoginRateLimiter();
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ner-google-auth-'));
  const dbPath = path.join(tmpDir, 'ner-google-auth-db.json');
  const store = new PersistentStore(dbPath);
  const { app } = createApp(store, { googleTokenVerifier });

  const server = await new Promise<import('node:http').Server>((resolve) => {
    const s = app.listen(0, () => resolve(s));
  });
  const port = (server.address() as AddressInfo).port;
  const baseUrl = `http://127.0.0.1:${port}`;

  return {
    baseUrl,
    store,
    async close() {
      await new Promise<void>((resolve) => server.close(() => resolve()));
      fs.rmSync(tmpDir, { recursive: true, force: true });
    },
  };
}

test('GET /api/auth/providers reports Google disabled when GOOGLE_CLIENT_ID is unset and enabled when configured', async () => {
  const srv = await startGoogleAuthServer();
  try {
    await withGoogleEnv(
      { GOOGLE_CLIENT_ID: undefined, VITE_GOOGLE_CLIENT_ID: undefined },
      async () => {
        const res = await fetch(`${srv.baseUrl}/api/auth/providers`);
        assert.equal(res.status, 200);
        const body = await res.json();
        assert.equal(body.local, true);
        assert.equal(body.google.enabled, false);
        assert.equal(body.google.clientId, null);

        // POST /api/auth/google must return 503 when unconfigured
        const loginRes = await fetch(`${srv.baseUrl}/api/auth/google`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: 'Bearer any-token',
          },
          body: JSON.stringify({}),
        });
        assert.equal(loginRes.status, 503);
      }
    );

    await withGoogleEnv(
      {
        GOOGLE_CLIENT_ID: TEST_GOOGLE_CLIENT_ID,
        GOOGLE_AUTH_ALLOW_AUTO_PROVISION: 'false',
      },
      async () => {
        const res = await fetch(`${srv.baseUrl}/api/auth/providers`);
        assert.equal(res.status, 200);
        const body = await res.json();
        assert.equal(body.google.enabled, true);
        assert.equal(body.google.clientId, TEST_GOOGLE_CLIENT_ID);
        assert.equal(body.google.allowAutoProvision, false);
      }
    );
  } finally {
    await srv.close();
  }
});

test('POST /api/auth/google rejects missing, invalid, or unverified tokens', async () => {
  const verifier: GoogleTokenVerifier = async ({ accessToken, idToken, expectedClientId }) => {
    assert.equal(expectedClientId, TEST_GOOGLE_CLIENT_ID);
    if (accessToken === 'unverified-token') {
      return {
        sub: 'google-sub-unverified',
        email: 'maycon@neragency.com',
        emailVerified: false,
        name: 'Maycon',
      };
    }
    if (idToken === 'bad-id-token' || accessToken === 'bad-token') {
      throw new Error('Token Google inválido.');
    }
    throw new Error('Token desconhecido');
  };

  const srv = await startGoogleAuthServer(verifier);
  try {
    await withGoogleEnv({ GOOGLE_CLIENT_ID: TEST_GOOGLE_CLIENT_ID }, async () => {
      // Missing token -> 400
      const missingRes = await fetch(`${srv.baseUrl}/api/auth/google`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      assert.equal(missingRes.status, 400);

      // Invalid Bearer accessToken -> 401
      const badRes = await fetch(`${srv.baseUrl}/api/auth/google`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer bad-token',
        },
        body: JSON.stringify({}),
      });
      assert.equal(badRes.status, 401);

      // Unverified email -> 401
      const unverifiedRes = await fetch(`${srv.baseUrl}/api/auth/google`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer unverified-token',
        },
        body: JSON.stringify({}),
      });
      assert.equal(unverifiedRes.status, 401);
    });
  } finally {
    await srv.close();
  }
});

test('POST /api/auth/google authenticates existing active user, sets HttpOnly cookie, links googleSub, and audits login', async () => {
  const verifier: GoogleTokenVerifier = async ({ accessToken, expectedClientId }) => {
    assert.equal(expectedClientId, TEST_GOOGLE_CLIENT_ID);
    assert.equal(accessToken, 'valid-maycon-google-token');
    return {
      sub: 'google-sub-maycon-001',
      email: 'MAYCON@neragency.com',
      emailVerified: true,
      name: 'Maycon Silva',
      picture: 'https://lh3.googleusercontent.com/a/maycon-avatar',
    };
  };

  const srv = await startGoogleAuthServer(verifier);
  try {
    await withGoogleEnv(
      { GOOGLE_CLIENT_ID: TEST_GOOGLE_CLIENT_ID, GOOGLE_AUTH_ALLOW_AUTO_PROVISION: 'false' },
      async () => {
        const res = await fetch(`${srv.baseUrl}/api/auth/google`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: 'Bearer valid-maycon-google-token',
          },
          body: JSON.stringify({}),
        });
        assert.equal(res.status, 200);

        const setCookie = res.headers.get('set-cookie') || '';
        assert.match(setCookie, /ner_session=/);
        assert.match(setCookie, /HttpOnly/i);

        const data = await res.json();
        assert.equal(data.success, true);
        assert.equal(data.provider, 'google');
        assert.equal(data.autoProvisioned, false);
        assert.equal(data.user.email, 'maycon@neragency.com');
        assert.equal(data.user.role, 'Super Admin');
        assert.equal(data.user.googleSub, 'google-sub-maycon-001');
        assert.equal(data.user.avatarUrl, 'https://lh3.googleusercontent.com/a/maycon-avatar');
        assert.equal('passwordHash' in data.user, false);
        assert.ok(Array.isArray(data.permissions) && data.permissions.length > 0);
        assert.ok(typeof data.token === 'string' && data.token.length >= 32);

        // Verify issued session works on /api/auth/me
        const meRes = await fetch(`${srv.baseUrl}/api/auth/me`, {
          headers: { Authorization: `Bearer ${data.token}` },
        });
        assert.equal(meRes.status, 200);
        const meData = await meRes.json();
        assert.equal(meData.user.email, 'maycon@neragency.com');

        // Verify audit trail recorded Google login
        const audit = srv.store
          .getState()
          .auditLogs.find((a) => a.action === 'AUTH_GOOGLE_LOGIN_SUCCESS');
        assert.ok(audit);
        assert.equal(audit.userId, data.user.id);
      }
    );
  } finally {
    await srv.close();
  }
});

test('POST /api/auth/google enforces inactive user, suspended organization, and auto-provision least-privilege rules', async () => {
  const verifier: GoogleTokenVerifier = async ({ accessToken }) => {
    if (accessToken === 'inactive-user-token') {
      return {
        sub: 'google-sub-inactive',
        email: 'carlos@neragency.com',
        emailVerified: true,
        name: 'Carlos',
      };
    }
    if (accessToken === 'suspended-org-token') {
      return {
        sub: 'google-sub-suspended',
        email: 'marcos@nersp.com',
        emailVerified: true,
        name: 'Marcos SP',
      };
    }
    return {
      sub: 'google-sub-new-user-777',
      email: 'novo.colaborador@neragency.com',
      emailVerified: true,
      name: 'Novo Colaborador',
      picture: 'https://lh3.googleusercontent.com/a/new-user',
    };
  };

  const srv = await startGoogleAuthServer(verifier);
  try {
    // Mark Carlos as inactive & org-2 as suspended in test store
    const state = srv.store.getState();
    const carlos = state.users.find((u) => u.email === 'carlos@neragency.com');
    assert.ok(carlos);
    carlos.status = 'Inativo';

    const org2 = state.organizations.find((o) => o.id === 'org-2');
    assert.ok(org2);
    org2.status = 'Suspenso';
    srv.store.save();

    await withGoogleEnv(
      { GOOGLE_CLIENT_ID: TEST_GOOGLE_CLIENT_ID, GOOGLE_AUTH_ALLOW_AUTO_PROVISION: 'false' },
      async () => {
        const inactiveRes = await fetch(`${srv.baseUrl}/api/auth/google`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: 'Bearer inactive-user-token',
          },
          body: JSON.stringify({}),
        });
        assert.equal(inactiveRes.status, 403);

        const suspendedRes = await fetch(`${srv.baseUrl}/api/auth/google`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: 'Bearer suspended-org-token',
          },
          body: JSON.stringify({}),
        });
        assert.equal(suspendedRes.status, 403);

        // Unknown email blocked when auto-provision is false
        const unknownRes = await fetch(`${srv.baseUrl}/api/auth/google`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: 'Bearer new-user-token',
          },
          body: JSON.stringify({}),
        });
        assert.equal(unknownRes.status, 403);
      }
    );

    // Enable auto-provision and attempt privilege escalation via env default role -> must fall back to least-privilege 'Criativo'
    await withGoogleEnv(
      {
        GOOGLE_CLIENT_ID: TEST_GOOGLE_CLIENT_ID,
        GOOGLE_AUTH_ALLOW_AUTO_PROVISION: 'true',
        GOOGLE_AUTH_DEFAULT_ROLE: 'Super Admin',
      },
      async () => {
        const provRes = await fetch(`${srv.baseUrl}/api/auth/google`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: 'Bearer new-user-token',
          },
          body: JSON.stringify({}),
        });
        assert.equal(provRes.status, 200);
        const provData = await provRes.json();
        assert.equal(provData.autoProvisioned, true);
        assert.equal(provData.user.email, 'novo.colaborador@neragency.com');
        assert.equal(provData.user.role, 'Criativo');
        assert.equal(provData.user.authProvider, 'google');

        const provisionedAudit = srv.store
          .getState()
          .auditLogs.find((a) => a.action === 'AUTH_GOOGLE_USER_PROVISIONED');
        assert.ok(provisionedAudit);

        // Session works on /api/auth/me
        const meRes = await fetch(`${srv.baseUrl}/api/auth/me`, {
          headers: { Authorization: `Bearer ${provData.token}` },
        });
        assert.equal(meRes.status, 200);
      }
    );
  } finally {
    await srv.close();
  }
});
