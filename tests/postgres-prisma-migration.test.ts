import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { PrismaClient } from '@prisma/client';
import { PersistentStore } from '../server/store.ts';
import {
  checkDatabaseHealth,
  disconnectDatabase,
  getActivePersistenceMode,
  isPostgresConfigured,
  sanitizeDatabaseUrl,
  withTenantTransaction,
} from '../server/db/prisma.ts';
import { createRepositories, RepositoryError, type RepositoryContext } from '../server/repositories/index.ts';
import {
  detectDataTypeConflicts,
  detectSchemaMismatches,
  flattenHierarchicalJsonDatabase,
  formatMigrationSummary,
  migrateJsonToPostgres,
  validateJsonForPostgresMigration,
  type MigrationPrismaLike,
} from '../scripts/migrate-json-to-postgres.ts';

/**
 * In-memory Prisma-compatible relational engine for deterministic testing of:
 * - batched idempotent upserts
 * - exact ID/date preservation
 * - query count / N+1 prevention
 * - transactional RLS SET LOCAL calls
 */
function createInMemoryPrismaHarness() {
  const tables = new Map<string, Map<string, Record<string, any>>>();
  const queryLog: Array<{ model: string; op: string; args?: any }> = [];
  const rawSqlCalls: string[] = [];

  const getTable = (name: string) => {
    if (!tables.has(name)) tables.set(name, new Map());
    return tables.get(name)!;
  };

  const makeDelegate = (name: string) => ({
    async findUnique({ where }: { where: Record<string, unknown> }) {
      queryLog.push({ model: name, op: 'findUnique', args: where });
      const key = String(where.id ?? where.organizationId ?? where.code ?? where.slug ?? '');
      return getTable(name).get(key) ?? null;
    },
    async findFirst({ where }: { where: Record<string, unknown> }) {
      queryLog.push({ model: name, op: 'findFirst', args: where });
      for (const row of getTable(name).values()) {
        const match = Object.entries(where || {}).every(([k, v]) => {
          if (v === undefined) return true;
          return row[k] === v;
        });
        if (match) return row;
      }
      return null;
    },
    async findMany(args: { where?: Record<string, unknown>; skip?: number; take?: number; include?: any } = {}) {
      queryLog.push({ model: name, op: 'findMany', args });
      let rows = Array.from(getTable(name).values()).filter((row) =>
        Object.entries(args.where || {}).every(([k, v]) => {
          if (v === undefined) return true;
          if (v === null) return row[k] === null || row[k] === undefined;
          return row[k] === v;
        })
      );
      if (args.skip) rows = rows.slice(args.skip);
      if (args.take) rows = rows.slice(0, args.take);
      if (args.include?._count?.select?.tasks) {
        const taskTable = getTable('task');
        return rows.map((p) => ({
          ...p,
          _count: {
            tasks: Array.from(taskTable.values()).filter((t) => t.projectId === p.id).length,
          },
        }));
      }
      return rows;
    },
    async count(args: { where?: Record<string, unknown> } = {}) {
      queryLog.push({ model: name, op: 'count', args });
      const rows = Array.from(getTable(name).values()).filter((row) =>
        Object.entries(args.where || {}).every(([k, v]) => {
          if (v === undefined) return true;
          if (v === null) return row[k] === null || row[k] === undefined;
          return row[k] === v;
        })
      );
      return rows.length;
    },
    async create({ data }: { data: Record<string, any> }) {
      queryLog.push({ model: name, op: 'create' });
      const key = String(data.id ?? data.organizationId ?? '');
      const now = new Date();
      const row = { ...data, createdAt: data.createdAt ?? now, updatedAt: data.updatedAt ?? now };
      getTable(name).set(key, row);
      return row;
    },
    async update({ where, data }: { where: Record<string, unknown>; data: Record<string, any> }) {
      queryLog.push({ model: name, op: 'update', args: where });
      const key = String(where.id ?? where.organizationId ?? '');
      const existing = getTable(name).get(key);
      if (!existing) throw new Error(`Record not found in ${name}:${key}`);
      const next = { ...existing, ...data, updatedAt: new Date() };
      getTable(name).set(key, next);
      return next;
    },
    async updateMany({ where, data }: { where: Record<string, unknown>; data: Record<string, any> }) {
      queryLog.push({ model: name, op: 'updateMany', args: where });
      let count = 0;
      for (const [key, row] of getTable(name).entries()) {
        const match = Object.entries(where || {}).every(([k, v]) => row[k] === v);
        if (match) {
          getTable(name).set(key, { ...row, ...data });
          count++;
        }
      }
      return { count };
    },
    async upsert({
      where,
      create,
      update,
    }: {
      where: Record<string, unknown>;
      create: Record<string, any>;
      update: Record<string, any>;
    }) {
      queryLog.push({ model: name, op: 'upsert', args: where });
      const key = String(where.id ?? where.organizationId ?? '');
      const table = getTable(name);
      const existing = table.get(key);
      if (existing) {
        const next = { ...existing, ...update };
        table.set(key, next);
        return next;
      }
      const row = { ...create };
      table.set(key, row);
      return row;
    },
  });

  const proxy = new Proxy(
    {
      $queryRaw: async () => [{ '?column?': 1 }],
      $executeRaw: async (strings: TemplateStringsArray, ...values: unknown[]) => {
        rawSqlCalls.push(strings.join('?') + ` :: ${JSON.stringify(values)}`);
        return 1;
      },
      $executeRawUnsafe: async (query: string) => {
        rawSqlCalls.push(query);
        return 1;
      },
      $transaction: async <T>(fn: (tx: any) => Promise<T>): Promise<T> => fn(proxy),
      $disconnect: async () => {},
    },
    {
      get(target, prop: string) {
        if (prop in target) return (target as any)[prop];
        return makeDelegate(prop);
      },
    }
  );

  return {
    prisma: proxy as unknown as PrismaClient & MigrationPrismaLike,
    tables,
    queryLog,
    rawSqlCalls,
  };
}

test('PG-A: Connection layer handles unconfigured DB, unavailable DB, sanitized URLs, healthy mock DB, and clean disconnect', async () => {
  const prevUrl = process.env.DATABASE_URL;
  try {
    // 1. Sanitize URL never exposes password or username
    const sanitized = sanitizeDatabaseUrl('postgresql://ner_admin:SuperSecretPass123@db.internal:5432/ner_os');
    assert.equal(sanitized.includes('SuperSecretPass123'), false);
    assert.equal(sanitized.includes('ner_admin'), false);
    assert.ok(sanitized.includes('db.internal:5432/ner_os'));

    // 2. When DATABASE_URL is absent -> graceful json_fallback
    delete process.env.DATABASE_URL;
    assert.equal(isPostgresConfigured(), false);
    assert.equal(getActivePersistenceMode(), 'json_fallback');
    const unconfiguredHealth = await checkDatabaseHealth();
    assert.equal(unconfiguredHealth.configured, false);
    assert.equal(unconfiguredHealth.connected, false);
    assert.equal(unconfiguredHealth.mode, 'json_fallback');

    // 3. When DATABASE_URL is set and PostgreSQL responds -> connected: true
    process.env.DATABASE_URL = 'postgresql://ner_admin:secret@localhost:5432/ner_agency_os';
    const harness = createInMemoryPrismaHarness();
    const okHealth = await checkDatabaseHealth(harness.prisma);
    assert.equal(okHealth.configured, true);
    assert.equal(okHealth.connected, true);
    assert.equal(okHealth.provider, 'postgresql');
    assert.equal(typeof okHealth.latencyMs, 'number');

    // 4. When PostgreSQL query fails -> connected: false and URL/password is redacted
    const brokenPrisma = {
      $queryRaw: async () => {
        throw new Error('connect ECONNREFUSED postgresql://ner_admin:LeakedSecret@127.0.0.1:5432/ner_os');
      },
    } as unknown as PrismaClient;
    const failedHealth = await checkDatabaseHealth(brokenPrisma);
    assert.equal(failedHealth.configured, true);
    assert.equal(failedHealth.connected, false);
    assert.equal(failedHealth.error?.includes('LeakedSecret'), false);
    assert.ok(failedHealth.error?.includes('[REDACTED_DB_URL]'));

    // 5. withTenantTransaction sets transaction-local RLS session config (SET LOCAL via set_config(..., true))
    await withTenantTransaction(
      { organizationId: 'org-1', clientId: 'cli-1', isSuperAdmin: false },
      async () => 'ok',
      harness.prisma
    );
    assert.equal(harness.rawSqlCalls.length, 3);
    assert.ok(harness.rawSqlCalls[0].includes('app.current_organization_id'));
    assert.ok(harness.rawSqlCalls[1].includes('app.current_client_id'));
    assert.ok(harness.rawSqlCalls[2].includes('app.is_super_admin'));

    await disconnectDatabase();
  } finally {
    if (prevUrl === undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = prevUrl;
  }
});

test('PG-B & PG-C: All 15 repositories enforce CRUD, archiving, financial transaction integrity, and strict multi-tenant & client isolation', async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ner-pg-repo-'));
  try {
    const store = new PersistentStore(path.join(tmpDir, 'db.json'));
    const repos = createRepositories({ store, prisma: null });

    const org1Admin: RepositoryContext = {
      organizationId: 'org-1',
      userId: 'usr-1',
      role: 'Administrador',
    };
    const org2Admin: RepositoryContext = {
      organizationId: 'org-2',
      userId: 'usr-5',
      role: 'Administrador',
    };
    const client1: RepositoryContext = {
      organizationId: 'org-1',
      userId: 'usr-4',
      role: 'Cliente',
      clientId: 'cli-1',
    };

    // 1. Persistence: Create -> Read -> Archive -> Restore on ClientRepository
    const createdClient = await repos.clients.create(org1Admin, {
      name: 'Nova Empresa PG',
      segment: 'SaaS B2B',
      email: 'finance@novaempresa.io',
      mrr: 9500,
    });
    assert.equal(createdClient.organizationId, 'org-1');

    const fetched = await repos.clients.findById(org1Admin, createdClient.id);
    assert.equal(fetched?.name, 'Nova Empresa PG');

    const archived = await repos.clients.archive(org1Admin, createdClient.id, false);
    assert.ok(archived.archivedAt);
    const activeList = await repos.clients.list(org1Admin);
    assert.equal(activeList.data.some((c) => c.id === createdClient.id), false);

    // 2. Multi-tenant isolation: Org A accesses Org A; Org B cannot access Org A
    const org2Clients = await repos.clients.list(org2Admin);
    assert.ok(org2Clients.data.every((c) => c.organizationId === 'org-2'));
    assert.equal(await repos.clients.findById(org2Admin, 'cli-1'), null);

    // 3. Altering organizationId in query/payload is blocked with CROSS_TENANT_VIOLATION
    await assert.rejects(
      () => repos.clients.list(org2Admin, { organizationId: 'org-1' }),
      (err: any) => err instanceof RepositoryError && err.code === 'CROSS_TENANT_VIOLATION'
    );
    await assert.rejects(
      () => repos.clients.create(org2Admin, { name: 'Intruder', organizationId: 'org-1' }),
      (err: any) => err instanceof RepositoryError && err.code === 'CROSS_TENANT_VIOLATION'
    );

    // 4. Cross-organization FK reference (org-2 creating contract pointing to org-1 cli-1) is blocked
    await assert.rejects(
      () => repos.contracts.create(org2Admin, { clientId: 'cli-1', title: 'Contrato Cruzado' }),
      (err: any) => err instanceof RepositoryError && err.code === 'CROSS_TENANT_VIOLATION'
    );

    // 5. Client A cannot access Client B or global agency finance/subscription
    const clientSummary = await repos.finance.getSummary(client1);
    assert.equal(clientSummary.scope, 'client');
    assert.equal(clientSummary.clientId, 'cli-1');
    assert.equal(clientSummary.agencyRevenue, undefined);

    await assert.rejects(
      () => repos.finance.getSummary(client1, { scope: 'global' }),
      (err: any) => err instanceof RepositoryError && err.status === 403
    );
    await assert.rejects(
      () => repos.finance.listReceivables(client1, { clientId: 'cli-2' }),
      (err: any) => err instanceof RepositoryError && err.code === 'CROSS_TENANT_VIOLATION'
    );
    await assert.rejects(
      () => repos.subscriptions.getByOrganization(client1),
      (err: any) => err instanceof RepositoryError && err.status === 403
    );

    // 6. Task Backlog status update + atomic project progress recalculation
    const taskUpdate = await repos.projects.updateTaskStatus(org1Admin, 'tsk-3', 'Backlog');
    assert.equal(taskUpdate.task.status, 'Backlog');
    const backlogList = await repos.projects.listTasks(org1Admin, { status: 'Backlog' });
    assert.ok(backlogList.data.some((t) => t.id === 'tsk-3'));

    // 7. Financial payment transaction releases awaiting commissions atomically
    const rec2Before = store.getState().receivables.find((r) => r.id === 'rec-2')!;
    const paidRec = await repos.finance.recordReceivablePayment(org1Admin, rec2Before.id, {
      paidAmount: rec2Before.amount,
      paymentMethod: 'PIX',
      paymentRef: 'PIX-PG-TEST-01',
    });
    assert.equal(paidRec.status, 'Pago');
    assert.equal(paidRec.paidAmount, rec2Before.amount);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('PG-D: JSON -> PostgreSQL migration imports real ner-db.json idempotently, preserves IDs/dates/checksums, and rejects invalid rows', async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ner-pg-mig-'));
  const realJsonPath = path.resolve(process.cwd(), 'database/data/ner-db.json');
  try {
    // 1. Validate real database/data/ner-db.json
    const validation = validateJsonForPostgresMigration(realJsonPath, { createBackup: false });
    assert.equal(validation.referentialIssues.length, 0, `Unexpected referential issues: ${validation.referentialIssues.join('; ')}`);
    assert.equal(validation.duplicateIds.length, 0);
    assert.equal(validation.conversionErrors.length, 0);
    assert.ok(validation.totalRecordsFound > 50);

    // 2. Full ordered import into in-memory Prisma harness with backup & checkpoint
    const harness = createInMemoryPrismaHarness();
    const checkpointPath = path.join(tmpDir, 'checkpoint.json');
    const backupDir = path.join(tmpDir, 'backups');

    const firstRun = await migrateJsonToPostgres(realJsonPath, {
      prisma: harness.prisma,
      createBackup: true,
      backupDir,
      batchSize: 10,
      checkpointPath,
    });

    assert.equal(firstRun.mode, 'live_postgres');
    assert.equal(firstRun.rlsSuperAdminContextApplied, true, 'Migration must apply SET LOCAL app.is_super_admin for RLS tables');
    assert.ok(
      harness.rawSqlCalls.some((sql) => sql.includes("set_config('app.is_super_admin', 'true', true)")),
      'Expected transaction-local RLS super-admin context call'
    );
    assert.equal(firstRun.recordsRejected, 0, `Rejected: ${JSON.stringify(firstRun.rejectedEntries)}`);
    assert.equal(firstRun.recordsImported, firstRun.recordsFound);
    assert.equal(firstRun.postImportVerification.executed, true);
    assert.equal(firstRun.postImportVerification.verified, true, `Mismatches: ${firstRun.postImportVerification.mismatches.join('; ')}`);
    assert.ok(firstRun.backupPath && fs.existsSync(firstRun.backupPath), 'Backup must be created');
    assert.ok(fs.existsSync(realJsonPath), 'Original ner-db.json must NEVER be deleted');

    // Verify exact IDs, multi-tenant relationships (Organizations, Users, Clients, Projects) and dates preserved
    const importedOrg1 = harness.tables.get('organization')?.get('org-1');
    const importedUsr4 = harness.tables.get('user')?.get('usr-4');
    const importedCli1 = harness.tables.get('client')?.get('cli-1');
    const importedPrj1 = harness.tables.get('project')?.get('prj-1');
    const sourceState = JSON.parse(fs.readFileSync(realJsonPath, 'utf-8'));
    assert.ok(importedOrg1);
    assert.equal(importedOrg1.id, 'org-1');
    assert.equal(importedOrg1.createdAt.toISOString(), new Date(sourceState.organizations[0].createdAt).toISOString());
    assert.equal(importedCli1?.organizationId, 'org-1');
    assert.equal(importedUsr4?.organizationId, 'org-1');
    assert.equal(importedUsr4?.clientId, 'cli-1');
    assert.equal(importedPrj1?.organizationId, 'org-1');
    assert.equal(importedPrj1?.clientId, 'cli-1');
    assert.equal(firstRun.postImportVerification.targetCounts.organizations, sourceState.organizations.length);
    assert.equal(firstRun.postImportVerification.targetCounts.users, sourceState.users.length);
    assert.equal(firstRun.postImportVerification.targetCounts.clients, sourceState.clients.length);
    assert.equal(firstRun.postImportVerification.targetCounts.projects, sourceState.projects.length);

    // Verify financial checksums match imported tables
    const importedReceivables = Array.from(harness.tables.get('receivable')?.values() || []);
    const importedRecSum = Number(importedReceivables.reduce((s, r) => s + Number(r.amount), 0).toFixed(2));
    assert.equal(importedRecSum, firstRun.financialChecksums.totalReceivablesAmount);

    // 3. Re-running migration WITHOUT resume updates cleanly with ZERO duplicate rows
    const secondRun = await migrateJsonToPostgres(realJsonPath, {
      prisma: harness.prisma,
      createBackup: false,
      batchSize: 10,
    });
    assert.equal(secondRun.recordsImported, 0, 'Idempotent re-run must not insert duplicate records');
    assert.equal(secondRun.recordsUpdated, firstRun.recordsFound);
    assert.equal(harness.tables.get('client')?.size, sourceState.clients.length);

    // 4. Re-running WITH checkpoint resume skips already-completed keys cleanly
    const resumedRun = await migrateJsonToPostgres(realJsonPath, {
      prisma: harness.prisma,
      createBackup: false,
      checkpointPath,
      resume: true,
    });
    assert.equal(resumedRun.resumedFromCheckpoint, true);
    assert.equal(resumedRun.recordsDuplicateSkipped, firstRun.recordsFound);

    // 5. Invalid/orphan record handling: corrupt copy with invalid client + duplicate ID
    const dirtyCopyPath = path.join(tmpDir, 'dirty-ner-db.json');
    const dirtyState = JSON.parse(fs.readFileSync(realJsonPath, 'utf-8'));
    dirtyState.clients.push({
      ...dirtyState.clients[0],
      id: 'cli-orphan-999',
      organizationId: 'org-nonexistent',
    });
    dirtyState.receivables.push({
      ...dirtyState.receivables[0],
      id: 'rec-bad-amount',
      amount: -500,
    });
    fs.writeFileSync(dirtyCopyPath, JSON.stringify(dirtyState));

    const dirtyHarness = createInMemoryPrismaHarness();
    const dirtyRun = await migrateJsonToPostgres(dirtyCopyPath, {
      prisma: dirtyHarness.prisma,
      createBackup: false,
    });
    assert.equal(dirtyRun.status, 'FAILED_INTEGRITY');
    assert.ok(dirtyRun.recordsRejected >= 2);
    assert.ok(dirtyRun.rejectedEntries.some((r) => r.id === 'cli-orphan-999'));
    assert.ok(dirtyRun.rejectedEntries.some((r) => r.id === 'rec-bad-amount'));
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('PG-E: Performance — pagination limits query size and ProjectRepository avoids N+1 queries', async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ner-pg-perf-'));
  try {
    const store = new PersistentStore(path.join(tmpDir, 'db.json'));
    const harness = createInMemoryPrismaHarness();

    // Seed 35 projects and 70 tasks into Prisma harness
    for (let i = 1; i <= 35; i++) {
      await harness.prisma.project.create({
        data: {
          id: `prj-perf-${i}`,
          organizationId: 'org-1',
          clientId: 'cli-1',
          name: `Projeto Perf ${i}`,
          projectType: 'NER Performance',
          status: 'Em andamento',
          priority: 'Normal',
          startDate: '2026-11-01',
          dueDate: '2026-12-31',
          managerId: 'usr-2',
          progress: 50,
          archivedAt: null,
          deletedAt: null,
        } as any,
      });
      await harness.prisma.task.create({
        data: {
          id: `tsk-perf-${i}-a`,
          organizationId: 'org-1',
          projectId: `prj-perf-${i}`,
          title: `Task A ${i}`,
          status: 'Backlog',
          priority: 'Normal',
          estimatedHours: 2,
          actualHours: 0,
        } as any,
      });
      await harness.prisma.task.create({
        data: {
          id: `tsk-perf-${i}-b`,
          organizationId: 'org-1',
          projectId: `prj-perf-${i}`,
          title: `Task B ${i}`,
          status: 'Concluída',
          priority: 'Normal',
          estimatedHours: 2,
          actualHours: 2,
        } as any,
      });
    }

    const repos = createRepositories({ store, prisma: harness.prisma });
    const ctx: RepositoryContext = { organizationId: 'org-1', userId: 'usr-1', role: 'Administrador' };

    harness.queryLog.length = 0;
    const page1 = await repos.projects.list(ctx, { page: 1, pageSize: 10 });
    assert.equal(page1.data.length, 10);
    assert.equal(page1.pagination.total, 35);
    assert.equal(page1.pagination.totalPages, 4);
    assert.ok(page1.data.every((p) => p.taskCount === 2));

    // Critical N+1 verification: listing 10 projects with task counts must execute strictly 2 queries (findMany + count), NEVER 1 + 10!
    assert.equal(
      harness.queryLog.length,
      2,
      `Expected strictly 2 batched queries (findMany + count), got ${harness.queryLog.length}`
    );

    // Clamping oversized pageSize prevents loading entire tables
    const clamped = await repos.projects.list(ctx, { page: 1, pageSize: 9999 });
    assert.equal(clamped.pagination.pageSize, 100);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('PG-F: Transactional SAVEPOINT isolation, atomic rollback mode, and persisted success/failure migration reports', async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ner-pg-tx-'));
  const realJsonPath = path.resolve(process.cwd(), 'database/data/ner-db.json');
  try {
    // 1. Batched SAVEPOINT mode: inject a simulated PostgreSQL unique constraint failure on one task
    const spHarness = createInMemoryPrismaHarness();
    const baseTaskDelegate = (spHarness.prisma as any).task;
    const spProxy = new Proxy(spHarness.prisma as any, {
      get(target, prop: string) {
        if (prop === '$transaction') {
          return async <T>(fn: (tx: any) => Promise<T>): Promise<T> => fn(spProxy);
        }
        if (prop === 'task') {
          return {
            ...baseTaskDelegate,
            async upsert(args: any) {
              if (args.where?.id === 'tsk-2') {
                const err: any = new Error('Unique constraint failed on Task');
                err.code = 'P2002';
                throw err;
              }
              return baseTaskDelegate.upsert(args);
            },
          };
        }
        return target[prop];
      },
    });

    const reportPath = path.join(tmpDir, 'reports/migration-report.json');
    const spReport = await migrateJsonToPostgres(realJsonPath, {
      prisma: spProxy,
      createBackup: false,
      batchSize: 15,
      reportPath,
    });

    assert.equal(spReport.transactionMode, 'batched_savepoint');
    assert.equal(spReport.rolledBack, false);
    assert.equal(spReport.failedCount, 1);
    assert.equal(spReport.succeededCount, spReport.recordsFound - 1);
    assert.equal(spReport.rejectedEntries[0].id, 'tsk-2');
    assert.equal(spReport.rejectedEntries[0].code, 'P2002');
    assert.ok(spHarness.rawSqlCalls.some((s) => s.startsWith('SAVEPOINT sp_ner_')));
    assert.ok(spHarness.rawSqlCalls.some((s) => s.startsWith('ROLLBACK TO SAVEPOINT sp_ner_')));
    assert.ok(spReport.reportPath && fs.existsSync(spReport.reportPath));

    const summaryText = formatMigrationSummary(spReport);
    assert.ok(summaryText.includes('RELATÓRIO DE MIGRAÇÃO JSON -> POSTGRESQL'));
    assert.ok(summaryText.includes('Falhas: 1'));
    assert.ok(summaryText.includes('tsk-2'));

    // 2. Atomic all-or-nothing mode: failure aborts whole transaction and flags rolledBack: true
    const atomicHarness = createInMemoryPrismaHarness();
    const atomicBaseTask = (atomicHarness.prisma as any).task;
    const atomicProxy = new Proxy(atomicHarness.prisma as any, {
      get(target, prop: string) {
        if (prop === '$transaction') {
          return async <T>(fn: (tx: any) => Promise<T>): Promise<T> => fn(atomicProxy);
        }
        if (prop === 'task') {
          return {
            ...atomicBaseTask,
            async upsert(args: any) {
              if (args.where?.id === 'tsk-1') {
                const err: any = new Error('Simulated FK violation in atomic transaction');
                err.code = 'P2003';
                throw err;
              }
              return atomicBaseTask.upsert(args);
            },
          };
        }
        return target[prop];
      },
    });

    const atomicReport = await migrateJsonToPostgres(realJsonPath, {
      prisma: atomicProxy,
      createBackup: false,
      atomic: true,
    });
    assert.equal(atomicReport.transactionMode, 'atomic_all_or_nothing');
    assert.equal(atomicReport.rolledBack, true);
    assert.equal(atomicReport.recordsImported, 0);
    assert.equal(atomicReport.status, 'FAILED_INTEGRITY');
    assert.ok(atomicReport.rejectedEntries.some((r) => r.id === 'tsk-1' && r.code === 'P2003'));
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('PG-G: Hierarchical JSON flattening, pre-existing PostgreSQL organization ID validation, and data type mapping conflict reporting', async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ner-pg-flat-'));
  const realJsonPath = path.resolve(process.cwd(), 'database/data/ner-db.json');
  try {
    const rawState = JSON.parse(fs.readFileSync(realJsonPath, 'utf-8'));

    // 1. Hierarchical JSON flattening converts nested aiGateway subtrees & singletons into flat arrays
    const flat = flattenHierarchicalJsonDatabase(rawState);
    assert.ok(Array.isArray(flat.organizations) && flat.organizations.length >= 2);
    assert.ok(Array.isArray(flat.aiProviders) && flat.aiProviders.length > 0);
    assert.ok(Array.isArray(flat.aiModels) && flat.aiModels.length > 0);
    assert.ok(Array.isArray(flat.aiExchangeRates) && flat.aiExchangeRates.length === 1);
    assert.equal(detectDataTypeConflicts(flat).length, 0, 'Clean ner-db.json should have zero data type conflicts');

    // 2. Pre-existing PostgreSQL Organization ID validation + data type mapping conflicts
    const customState = JSON.parse(fs.readFileSync(realJsonPath, 'utf-8'));
    // Add client belonging to an org that already exists in PostgreSQL (not in JSON organizations[])
    customState.clients.push({
      ...customState.clients[0],
      id: 'cli-existing-org',
      organizationId: 'org-preexisting-pg',
      mrr: '7500.50', // stringified Float conflict -> coerced
      createdAt: 'not-a-valid-date', // invalid DateTime conflict -> fallback_default
    });
    // Add client referencing a non-existent org (neither in JSON nor in PostgreSQL) -> rejected
    customState.clients.push({
      ...customState.clients[0],
      id: 'cli-missing-org',
      organizationId: 'org-ghost-999',
    });
    // Add webPage with non-boolean pixelConfigured and float visits -> Int & Boolean conflicts
    customState.webPages.push({
      ...customState.webPages[0],
      id: 'wp-type-conflict',
      slug: 'type-conflict-lp',
      visits: 42.7,
      pixelConfigured: 'true',
    });

    const customJsonPath = path.join(tmpDir, 'custom-ner-db.json');
    fs.writeFileSync(customJsonPath, JSON.stringify(customState));

    const harness = createInMemoryPrismaHarness();
    // Seed pre-existing organization in PostgreSQL target before running migration
    await harness.prisma.organization.create({
      data: {
        id: 'org-preexisting-pg',
        name: 'Pre-Existing PG Org',
        legalName: 'Pre-Existing PG Org LTDA',
        slug: 'preexisting-pg',
        status: 'Ativo',
      } as any,
    });

    const report = await migrateJsonToPostgres(customJsonPath, {
      prisma: harness.prisma,
      createBackup: false,
    });

    assert.ok(report.existingOrganizationIdsFound.includes('org-preexisting-pg'));
    assert.ok(harness.tables.get('client')?.has('cli-existing-org'), 'Client for pre-existing PG org must be imported');
    assert.equal(harness.tables.get('client')?.has('cli-missing-org'), false, 'Client for missing org must be rejected');
    assert.ok(report.rejectedEntries.some((r) => r.id === 'cli-missing-org'));

    // Verify all 4 data type mapping conflicts are captured & reported
    assert.ok(report.dataTypeConflicts.some((c) => c.entity === 'clients' && c.field === 'mrr' && c.expectedType === 'Float'));
    assert.ok(report.dataTypeConflicts.some((c) => c.entity === 'clients' && c.field === 'createdAt' && c.expectedType === 'DateTime'));
    assert.ok(report.dataTypeConflicts.some((c) => c.entity === 'webPages' && c.field === 'visits' && c.expectedType === 'Int'));
    assert.ok(report.dataTypeConflicts.some((c) => c.entity === 'webPages' && c.field === 'pixelConfigured' && c.expectedType === 'Boolean'));

    const summary = formatMigrationSummary(report);
    assert.ok(summary.includes('Conflitos de Mapeamento de Tipos'));
    assert.ok(summary.includes('clients.mrr'));
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('PG-H: Schema mismatch reporting, live cross-org consistency enforcement, and per-entity success/failure logging', async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ner-pg-schema-'));
  const realJsonPath = path.resolve(process.cwd(), 'database/data/ner-db.json');
  try {
    const cleanState = JSON.parse(fs.readFileSync(realJsonPath, 'utf-8'));
    assert.equal(
      detectSchemaMismatches(cleanState, flattenHierarchicalJsonDatabase(cleanState)).length,
      0,
      'Clean ner-db.json should have zero schema mismatches'
    );

    // Inject unmapped collection, missing required Prisma NOT NULL field, and cross-org Project -> Client reference
    const badState = JSON.parse(fs.readFileSync(realJsonPath, 'utf-8'));
    badState.unexpectedLegacyTable = [{ id: 'x-1' }];
    badState.users.push({
      ...badState.users[0],
      id: 'usr-missing-email',
      email: '',
    });
    badState.projects.push({
      ...badState.projects[0],
      id: 'prj-cross-org-violation',
      organizationId: 'org-2',
      clientId: 'cli-1', // belongs to org-1!
    });

    const badJsonPath = path.join(tmpDir, 'bad-schema-ner-db.json');
    fs.writeFileSync(badJsonPath, JSON.stringify(badState));

    const logLines: string[] = [];
    const harness = createInMemoryPrismaHarness();
    // Seed an existing client in PostgreSQL owned by org-2, while JSON attempts to import cli-1 under org-1
    await harness.prisma.client.create({
      data: {
        id: 'cli-1',
        organizationId: 'org-2',
        name: 'Locked Org-2 Client',
        segment: 'SaaS',
        status: 'Ativo',
      } as any,
    });

    const report = await migrateJsonToPostgres(badJsonPath, {
      prisma: harness.prisma,
      createBackup: false,
      logger: (line) => logLines.push(line),
    });

    assert.equal(report.status, 'FAILED_INTEGRITY');
    assert.ok(
      report.schemaMismatches.some((m) => m.kind === 'unmapped_collection' && m.entity === 'unexpectedLegacyTable')
    );
    assert.ok(
      report.schemaMismatches.some(
        (m) => m.kind === 'missing_required_field' && m.entity === 'users' && m.field === 'email'
      )
    );
    assert.ok(
      report.rejectedEntries.some((r) => r.id === 'cli-1' && r.code === 'ORG_ID_MUTATION_CONFLICT'),
      'Must block cross-org mutation of an existing PostgreSQL client record'
    );
    assert.equal(
      (harness.tables.get('client')?.get('cli-1') as any)?.organizationId,
      'org-2',
      'Existing PostgreSQL client organizationId must remain unchanged'
    );
    assert.equal(harness.tables.get('project')?.has('prj-cross-org-violation'), false);
    assert.ok(report.rejectedEntries.some((r) => r.id === 'prj-cross-org-violation'));
    assert.ok(report.organizationConsistencyErrors.some((e) => e.includes('prj-cross-org-violation')));
    assert.ok(report.organizationConsistencyErrors.some((e) => e.includes('ORG_ID_MUTATION_CONFLICT')));
    assert.ok(logLines.some((l) => l.startsWith('[MIGRATE] organizations: found=')));
    assert.ok(logLines.some((l) => l.startsWith('[MIGRATE] projects:') && l.includes('failed=1')));

    const summary = formatMigrationSummary(report);
    assert.ok(summary.includes('Contagem por Entidade'));
    assert.ok(summary.includes('Incompatibilidades de Schema'));
    assert.ok(summary.includes('Erros de Consistência de Organização'));
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});
