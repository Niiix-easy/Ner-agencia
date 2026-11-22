import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import dotenv from 'dotenv';
import type { PrismaClient } from '@prisma/client';
import type { DatabaseState } from '../server/types.ts';
import { disconnectDatabase, getPrismaClient, isPostgresConfigured } from '../server/db/prisma.ts';

dotenv.config();

export interface DataTypeMappingConflict {
  entity: string;
  id: string;
  field: string;
  expectedType: 'DateTime' | 'Float' | 'Int' | 'Boolean' | 'String' | 'Json';
  actualType: string;
  rawValuePreview: string;
  resolution: 'coerced' | 'fallback_default' | 'rejected';
  message: string;
}

export interface SchemaMismatchError {
  kind: 'missing_required_field' | 'unmapped_collection' | 'prisma_schema_error';
  entity: string;
  id?: string;
  field?: string;
  code?: string;
  message: string;
}

export interface FlattenedDatabaseCollections {
  organizations: DatabaseState['organizations'];
  commercialPlans: DatabaseState['commercialPlans'];
  clients: DatabaseState['clients'];
  users: DatabaseState['users'];
  sessions: DatabaseState['sessions'];
  passwordResetTokens: DatabaseState['passwordResetTokens'];
  leads: DatabaseState['leads'];
  opportunities: DatabaseState['opportunities'];
  proposals: DatabaseState['proposals'];
  contracts: DatabaseState['contracts'];
  receivables: DatabaseState['receivables'];
  payables: DatabaseState['payables'];
  commissions: DatabaseState['commissions'];
  projects: DatabaseState['projects'];
  briefings: DatabaseState['briefings'];
  tasks: DatabaseState['tasks'];
  deliverables: DatabaseState['deliverables'];
  approvals: DatabaseState['approvals'];
  timeTracking: DatabaseState['timeTracking'];
  storedAssets: DatabaseState['storedAssets'];
  creatives: DatabaseState['creatives'];
  webPages: DatabaseState['webPages'];
  adAccounts: DatabaseState['adAccounts'];
  adIntegrationCredentials: DatabaseState['adIntegrationCredentials'];
  trackingEvents: DatabaseState['trackingEvents'];
  workflows: DatabaseState['workflows'];
  tickets: DatabaseState['tickets'];
  incidents: DatabaseState['incidents'];
  strategyPlans: DatabaseState['strategyPlans'];
  qaItems: DatabaseState['qaItems'];
  launchItems: DatabaseState['launchItems'];
  deliveryHandoffs: DatabaseState['deliveryHandoffs'];
  subscriptions: DatabaseState['subscriptions'];
  billingWebhookEvents: DatabaseState['billingWebhookEvents'];
  auditLogs: DatabaseState['auditLogs'];
  aiProviders: NonNullable<DatabaseState['aiGateway']>['providers'];
  aiModels: NonNullable<DatabaseState['aiGateway']>['models'];
  aiRoutingRules: NonNullable<DatabaseState['aiGateway']>['routingRules'];
  aiPrompts: NonNullable<DatabaseState['aiGateway']>['prompts'];
  aiGlobalCostPolicies: Array<NonNullable<NonNullable<DatabaseState['aiGateway']>['globalCostPolicy']>>;
  aiCostPolicies: NonNullable<DatabaseState['aiGateway']>['costPolicies'];
  aiActions: NonNullable<DatabaseState['aiGateway']>['actions'];
  aiExchangeRates: Array<NonNullable<NonNullable<DatabaseState['aiGateway']>['exchangeConfig']>>;
  aiLimitExceptions: NonNullable<DatabaseState['aiGateway']>['limitExceptions'];
  aiAccountingAlerts: NonNullable<DatabaseState['aiGateway']>['accountingAlerts'];
  aiUsageLogs: NonNullable<DatabaseState['aiGateway']>['usageLogs'];
  aiMemories: NonNullable<DatabaseState['aiGateway']>['memories'];
  aiKnowledgeDocs: NonNullable<DatabaseState['aiGateway']>['knowledgeDocs'];
}

export interface MigrationIntegrityReport {
  sourcePath: string;
  backupPath: string | null;
  sourceSha256: string;
  entityCounts: Record<string, number>;
  totalRecordsFound: number;
  financialChecksums: {
    totalReceivablesAmount: number;
    totalReceivablesPaid: number;
    totalPayablesAmount: number;
    totalAiCostUsd: number;
  };
  referentialIssues: string[];
  duplicateIds: string[];
  conversionErrors: string[];
  dataTypeConflicts: DataTypeMappingConflict[];
  schemaMismatches: SchemaMismatchError[];
  organizationConsistencyErrors: string[];
  postgresTargetConfigured: boolean;
  status: 'VALIDATED_DRY_RUN' | 'FAILED_INTEGRITY' | 'READY_FOR_POSTGRES_IMPORT';
}

export interface PostImportVerification {
  executed: boolean;
  verified: boolean;
  targetCounts: Record<string, number>;
  mismatches: string[];
}

export type MigrationTransactionMode = 'batched_savepoint' | 'atomic_all_or_nothing';

export interface PostgresImportReport extends MigrationIntegrityReport {
  mode: 'live_postgres' | 'dry_run' | 'blocked_infrastructure';
  transactionMode: MigrationTransactionMode;
  rlsSuperAdminContextApplied: boolean;
  rolledBack: boolean;
  existingOrganizationIdsFound: string[];
  batchSize: number;
  checkpointPath: string | null;
  reportPath: string | null;
  resumedFromCheckpoint: boolean;
  recordsFound: number;
  recordsImported: number;
  recordsUpdated: number;
  succeededCount: number;
  recordsDuplicateSkipped: number;
  recordsRejected: number;
  failedCount: number;
  rejectedEntries: Array<{ entity: string; id: string; reason: string; code?: string }>;
  entitySummary: Record<string, { found: number; imported: number; updated: number; rejected: number }>;
  postImportVerification: PostImportVerification;
  durationMs: number;
  startedAt: string;
  completedAt: string;
}

/**
 * Parses the hierarchical `database/data/ner-db.json` structure (including nested `aiGateway`
 * sub-collections and singleton configuration nodes) into flat relational arrays aligned with
 * the Prisma PostgreSQL schema tables.
 */
export function flattenHierarchicalJsonDatabase(state: DatabaseState): FlattenedDatabaseCollections {
  const ai = state.aiGateway || ({} as DatabaseState['aiGateway']);
  return {
    organizations: Array.isArray(state.organizations) ? state.organizations : [],
    commercialPlans: Array.isArray(state.commercialPlans) ? state.commercialPlans : [],
    clients: Array.isArray(state.clients) ? state.clients : [],
    users: Array.isArray(state.users) ? state.users : [],
    sessions: Array.isArray(state.sessions) ? state.sessions : [],
    passwordResetTokens: Array.isArray(state.passwordResetTokens) ? state.passwordResetTokens : [],
    leads: Array.isArray(state.leads) ? state.leads : [],
    opportunities: Array.isArray(state.opportunities) ? state.opportunities : [],
    proposals: Array.isArray(state.proposals) ? state.proposals : [],
    contracts: Array.isArray(state.contracts) ? state.contracts : [],
    receivables: Array.isArray(state.receivables) ? state.receivables : [],
    payables: Array.isArray(state.payables) ? state.payables : [],
    commissions: Array.isArray(state.commissions) ? state.commissions : [],
    projects: Array.isArray(state.projects) ? state.projects : [],
    briefings: Array.isArray(state.briefings) ? state.briefings : [],
    tasks: Array.isArray(state.tasks) ? state.tasks : [],
    deliverables: Array.isArray(state.deliverables) ? state.deliverables : [],
    approvals: Array.isArray(state.approvals) ? state.approvals : [],
    timeTracking: Array.isArray(state.timeTracking) ? state.timeTracking : [],
    storedAssets: Array.isArray(state.storedAssets) ? state.storedAssets : [],
    creatives: Array.isArray(state.creatives) ? state.creatives : [],
    webPages: Array.isArray(state.webPages) ? state.webPages : [],
    adAccounts: Array.isArray(state.adAccounts) ? state.adAccounts : [],
    adIntegrationCredentials: Array.isArray(state.adIntegrationCredentials) ? state.adIntegrationCredentials : [],
    trackingEvents: Array.isArray(state.trackingEvents) ? state.trackingEvents : [],
    workflows: Array.isArray(state.workflows) ? state.workflows : [],
    tickets: Array.isArray(state.tickets) ? state.tickets : [],
    incidents: Array.isArray(state.incidents) ? state.incidents : [],
    strategyPlans: Array.isArray(state.strategyPlans) ? state.strategyPlans : [],
    qaItems: Array.isArray(state.qaItems) ? state.qaItems : [],
    launchItems: Array.isArray(state.launchItems) ? state.launchItems : [],
    deliveryHandoffs: Array.isArray(state.deliveryHandoffs) ? state.deliveryHandoffs : [],
    subscriptions: Array.isArray(state.subscriptions) ? state.subscriptions : [],
    billingWebhookEvents: Array.isArray(state.billingWebhookEvents) ? state.billingWebhookEvents : [],
    auditLogs: Array.isArray(state.auditLogs) ? state.auditLogs : [],
    aiProviders: Array.isArray(ai.providers) ? ai.providers : [],
    aiModels: Array.isArray(ai.models) ? ai.models : [],
    aiRoutingRules: Array.isArray(ai.routingRules) ? ai.routingRules : [],
    aiPrompts: Array.isArray(ai.prompts) ? ai.prompts : [],
    aiGlobalCostPolicies: ai.globalCostPolicy ? [ai.globalCostPolicy] : [],
    aiCostPolicies: Array.isArray(ai.costPolicies) ? ai.costPolicies : [],
    aiActions: Array.isArray(ai.actions) ? ai.actions : [],
    aiExchangeRates: ai.exchangeConfig ? [ai.exchangeConfig] : [],
    aiLimitExceptions: Array.isArray(ai.limitExceptions) ? ai.limitExceptions : [],
    aiAccountingAlerts: Array.isArray(ai.accountingAlerts) ? ai.accountingAlerts : [],
    aiUsageLogs: Array.isArray(ai.usageLogs) ? ai.usageLogs : [],
    aiMemories: Array.isArray(ai.memories) ? ai.memories : [],
    aiKnowledgeDocs: Array.isArray(ai.knowledgeDocs) ? ai.knowledgeDocs : [],
  };
}

export function createJsonBackup(sourcePath: string, backupDir: string): { backupPath: string; sha256: string } {
  const raw = fs.readFileSync(sourcePath);
  const sha256 = crypto.createHash('sha256').update(raw).digest('hex');
  if (!fs.existsSync(backupDir)) {
    fs.mkdirSync(backupDir, { recursive: true });
  }
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backupPath = path.join(backupDir, `ner-db-backup-${stamp}.json`);
  fs.writeFileSync(backupPath, raw);
  fs.writeFileSync(
    `${backupPath}.manifest.json`,
    JSON.stringify({ sourcePath, backupPath, sha256, createdAt: new Date().toISOString() }, null, 2)
  );
  return { backupPath, sha256 };
}

export function rollbackFromBackup(backupPath: string, targetPath: string): { restoredSha256: string } {
  if (!fs.existsSync(backupPath)) {
    throw new Error(`Backup não encontrado: ${backupPath}`);
  }
  const raw = fs.readFileSync(backupPath);
  const sha256 = crypto.createHash('sha256').update(raw).digest('hex');
  const manifestPath = `${backupPath}.manifest.json`;
  if (fs.existsSync(manifestPath)) {
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
    if (manifest.sha256 && manifest.sha256 !== sha256) {
      throw new Error('Falha de integridade SHA-256 no arquivo de backup durante rollback.');
    }
  }
  const tmpPath = `${targetPath}.rollback.tmp`;
  fs.writeFileSync(tmpPath, raw);
  fs.renameSync(tmpPath, targetPath);
  return { restoredSha256: sha256 };
}

function toSafeDate(value: unknown, fallbackNow = false): Date | null {
  if (value === null || value === undefined || value === '') {
    return fallbackNow ? new Date() : null;
  }
  const d = new Date(String(value));
  if (Number.isNaN(d.getTime())) {
    return fallbackNow ? new Date() : null;
  }
  return d;
}

function toSafeNumber(value: unknown, fallback = 0): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function toSafeInt(value: unknown, fallback = 0): number {
  return Math.trunc(toSafeNumber(value, fallback));
}

function sanitizePrismaValue(value: unknown): unknown {
  if (value === null || value === undefined) return null;
  if (value instanceof Date) return value;
  if (Array.isArray(value)) {
    return value.map((item) => (item === undefined ? null : sanitizePrismaValue(item)));
  }
  if (typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (v !== undefined) {
        out[k] = sanitizePrismaValue(v);
      }
    }
    return out;
  }
  if (typeof value === 'number' && !Number.isFinite(value)) {
    return 0;
  }
  return value;
}

function sanitizePrismaPayload(data: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(data)) {
    if (v !== undefined) {
      out[k] = sanitizePrismaValue(v);
    }
  }
  return out;
}

function isValidIsoDateOrEmpty(value: unknown): boolean {
  if (value === null || value === undefined || value === '') return true;
  const d = new Date(String(value));
  return !Number.isNaN(d.getTime());
}

function previewRawValue(value: unknown): string {
  if (value === null) return 'null';
  if (value === undefined) return 'undefined';
  const str = typeof value === 'object' ? JSON.stringify(value) : String(value);
  return str.length > 60 ? `${str.slice(0, 57)}...` : str;
}

/**
 * Inspects flattened JSON collections for data type mapping conflicts against
 * PostgreSQL/Prisma target column types (DateTime, Float, Int, Boolean, Json).
 */
export function detectDataTypeConflicts(flat: FlattenedDatabaseCollections): DataTypeMappingConflict[] {
  const conflicts: DataTypeMappingConflict[] = [];

  const checkDateField = (entity: string, id: string, field: string, value: unknown) => {
    if (value === null || value === undefined || value === '') return;
    const d = new Date(String(value));
    if (Number.isNaN(d.getTime())) {
      conflicts.push({
        entity,
        id,
        field,
        expectedType: 'DateTime',
        actualType: typeof value,
        rawValuePreview: previewRawValue(value),
        resolution: 'fallback_default',
        message: `Invalid ISO DateTime string on ${entity}.${field}; coerced to safe fallback.`,
      });
    }
  };

  const checkNumericField = (
    entity: string,
    id: string,
    field: string,
    value: unknown,
    expectedType: 'Float' | 'Int',
    allowNegative = true
  ) => {
    if (value === null || value === undefined) return;
    if (typeof value !== 'number' || !Number.isFinite(value)) {
      const parsed = Number(value);
      const isValidCoercion = typeof value === 'string' && value.trim() !== '' && Number.isFinite(parsed);
      conflicts.push({
        entity,
        id,
        field,
        expectedType,
        actualType: typeof value,
        rawValuePreview: previewRawValue(value),
        resolution: isValidCoercion ? 'coerced' : 'fallback_default',
        message: isValidCoercion
          ? `Stringified numeric value on ${entity}.${field} coerced to ${expectedType}.`
          : `Non-numeric value on ${entity}.${field}; cannot map cleanly to ${expectedType}.`,
      });
      return;
    }
    if (expectedType === 'Int' && !Number.isInteger(value)) {
      conflicts.push({
        entity,
        id,
        field,
        expectedType: 'Int',
        actualType: 'float',
        rawValuePreview: previewRawValue(value),
        resolution: 'coerced',
        message: `Floating-point value on integer column ${entity}.${field} truncated to Int.`,
      });
    }
    if (!allowNegative && value < 0) {
      conflicts.push({
        entity,
        id,
        field,
        expectedType,
        actualType: 'negative_number',
        rawValuePreview: previewRawValue(value),
        resolution: 'rejected',
        message: `Negative numeric value on non-negative column ${entity}.${field}.`,
      });
    }
  };

  const checkBooleanField = (entity: string, id: string, field: string, value: unknown) => {
    if (value === null || value === undefined) return;
    if (typeof value !== 'boolean') {
      conflicts.push({
        entity,
        id,
        field,
        expectedType: 'Boolean',
        actualType: typeof value,
        rawValuePreview: previewRawValue(value),
        resolution: 'coerced',
        message: `Non-boolean value on ${entity}.${field} coerced via Boolean().`,
      });
    }
  };

  for (const o of flat.organizations) checkDateField('organizations', o.id, 'createdAt', o.createdAt);
  for (const u of flat.users) {
    checkDateField('users', u.id, 'createdAt', u.createdAt);
    checkDateField('users', u.id, 'emailVerifiedAt', u.emailVerifiedAt);
  }
  for (const c of flat.clients) {
    checkDateField('clients', c.id, 'createdAt', c.createdAt);
    checkDateField('clients', c.id, 'archivedAt', c.archivedAt);
    checkNumericField('clients', c.id, 'mrr', c.mrr, 'Float', false);
  }
  for (const p of flat.commercialPlans) {
    checkNumericField('commercialPlans', p.id, 'setupPrice', p.setupPrice, 'Float', false);
    checkNumericField('commercialPlans', p.id, 'recurringPrice', p.recurringPrice, 'Float', false);
    checkBooleanField('commercialPlans', p.id, 'isActive', p.isActive);
  }
  for (const r of flat.receivables) {
    checkNumericField('receivables', r.id, 'amount', r.amount, 'Float', false);
    checkNumericField('receivables', r.id, 'paidAmount', r.paidAmount, 'Float', false);
    checkNumericField('receivables', r.id, 'mediaBudget', r.mediaBudget, 'Float', false);
    checkDateField('receivables', r.id, 'paidAt', r.paidAt);
  }
  for (const pay of flat.payables) {
    checkNumericField('payables', pay.id, 'amount', pay.amount, 'Float', false);
  }
  for (const prj of flat.projects) {
    checkNumericField('projects', prj.id, 'progress', prj.progress, 'Int', false);
    checkDateField('projects', prj.id, 'createdAt', prj.createdAt);
  }
  for (const t of flat.tasks) {
    checkNumericField('tasks', t.id, 'estimatedHours', t.estimatedHours, 'Float', false);
    checkNumericField('tasks', t.id, 'actualHours', t.actualHours, 'Float', false);
  }
  for (const w of flat.webPages) {
    checkNumericField('webPages', w.id, 'visits', w.visits, 'Int', false);
    checkNumericField('webPages', w.id, 'leadsCaptured', w.leadsCaptured, 'Int', false);
    checkBooleanField('webPages', w.id, 'pixelConfigured', w.pixelConfigured);
  }
  for (const l of flat.aiUsageLogs) {
    checkNumericField('aiUsageLogs', l.id, 'inputTokens', l.inputTokens, 'Int', false);
    checkNumericField('aiUsageLogs', l.id, 'outputTokens', l.outputTokens, 'Int', false);
    checkNumericField('aiUsageLogs', l.id, 'latencyMs', l.latencyMs, 'Int', false);
    checkDateField('aiUsageLogs', l.id, 'createdAt', l.createdAt);
  }

  return conflicts;
}

const KNOWN_TOP_LEVEL_KEYS = new Set([
  'organizations',
  'users',
  'sessions',
  'passwordResetTokens',
  'clients',
  'commercialPlans',
  'leads',
  'opportunities',
  'proposals',
  'contracts',
  'receivables',
  'payables',
  'commissions',
  'projects',
  'briefings',
  'tasks',
  'deliverables',
  'approvals',
  'timeTracking',
  'creatives',
  'storedAssets',
  'adAccounts',
  'adIntegrationCredentials',
  'trackingEvents',
  'workflows',
  'webPages',
  'tickets',
  'subscriptions',
  'billingWebhookEvents',
  'incidents',
  'strategyPlans',
  'qaItems',
  'launchItems',
  'deliveryHandoffs',
  'auditLogs',
  'aiGateway',
]);

const KNOWN_AI_GATEWAY_KEYS = new Set([
  'providers',
  'models',
  'routingRules',
  'prompts',
  'costPolicies',
  'globalCostPolicy',
  'actions',
  'exchangeConfig',
  'limitExceptions',
  'accountingAlerts',
  'usageLogs',
  'memories',
  'knowledgeDocs',
  'pricingVersion',
]);

/**
 * Inspects the raw hierarchical JSON and flattened collections for schema mismatches
 * against Prisma's PostgreSQL models (unmapped collections and missing required NOT NULL fields).
 */
export function detectSchemaMismatches(
  rawState: Record<string, unknown>,
  flat: FlattenedDatabaseCollections
): SchemaMismatchError[] {
  const mismatches: SchemaMismatchError[] = [];

  for (const key of Object.keys(rawState || {})) {
    if (!KNOWN_TOP_LEVEL_KEYS.has(key)) {
      mismatches.push({
        kind: 'unmapped_collection',
        entity: key,
        message: `Top-level JSON key "${key}" has no mapped Prisma model in migration pipeline.`,
      });
    }
  }

  const aiObj = rawState?.aiGateway;
  if (aiObj && typeof aiObj === 'object' && !Array.isArray(aiObj)) {
    for (const key of Object.keys(aiObj as Record<string, unknown>)) {
      if (!KNOWN_AI_GATEWAY_KEYS.has(key)) {
        mismatches.push({
          kind: 'unmapped_collection',
          entity: `aiGateway.${key}`,
          message: `Nested JSON key "aiGateway.${key}" has no mapped Prisma model in migration pipeline.`,
        });
      }
    }
  }

  const checkRequiredFields = (
    entity: string,
    rows: Array<Record<string, any>>,
    requiredFields: string[]
  ) => {
    for (const row of rows) {
      const id = String(row?.id || '(missing-id)');
      for (const field of requiredFields) {
        const val = row?.[field];
        if (val === undefined || val === null || (typeof val === 'string' && val.trim() === '')) {
          mismatches.push({
            kind: 'missing_required_field',
            entity,
            id,
            field,
            message: `Required Prisma NOT NULL column "${entity}.${field}" is missing or empty on record ${id}.`,
          });
        }
      }
    }
  };

  checkRequiredFields('organizations', flat.organizations, ['id', 'name', 'legalName', 'slug']);
  checkRequiredFields('users', flat.users, ['id', 'organizationId', 'name', 'email', 'passwordHash']);
  checkRequiredFields('clients', flat.clients, ['id', 'organizationId', 'name', 'segment']);
  checkRequiredFields('projects', flat.projects, ['id', 'organizationId', 'clientId', 'name']);
  checkRequiredFields('tasks', flat.tasks, ['id', 'organizationId', 'projectId', 'title']);
  checkRequiredFields('proposals', flat.proposals, ['id', 'organizationId', 'clientId', 'title']);
  checkRequiredFields('contracts', flat.contracts, ['id', 'organizationId', 'clientId', 'title']);
  checkRequiredFields('receivables', flat.receivables, ['id', 'organizationId', 'clientId', 'description']);
  checkRequiredFields('webPages', flat.webPages, ['id', 'organizationId', 'clientId', 'slug', 'title']);

  return mismatches;
}

function collectDuplicateIds(entity: string, list: Array<{ id?: string }> | undefined, out: string[]): void {
  const seen = new Set<string>();
  for (const item of list || []) {
    if (!item?.id) continue;
    if (seen.has(item.id)) {
      out.push(`${entity}:${item.id}`);
    } else {
      seen.add(item.id);
    }
  }
}

export function validateJsonForPostgresMigration(
  sourcePath: string,
  options: { createBackup?: boolean; backupDir?: string } = {}
): MigrationIntegrityReport {
  const raw = fs.readFileSync(sourcePath, 'utf-8');
  const sourceSha256 = crypto.createHash('sha256').update(raw, 'utf8').digest('hex');
  const state = JSON.parse(raw) as DatabaseState;

  let backupPath: string | null = null;
  if (options.createBackup) {
    const backup = createJsonBackup(
      sourcePath,
      options.backupDir || path.resolve(path.dirname(sourcePath), '../backups')
    );
    backupPath = backup.backupPath;
  }

  const orgIds = new Set((state.organizations || []).map((o) => o.id));
  const userIds = new Set((state.users || []).map((u) => u.id));
  const clientMap = new Map((state.clients || []).map((c) => [c.id, c]));
  const projectMap = new Map((state.projects || []).map((p) => [p.id, p]));
  const contractMap = new Map((state.contracts || []).map((c) => [c.id, c]));

  const referentialIssues: string[] = [];
  const duplicateIds: string[] = [];
  const conversionErrors: string[] = [];

  for (const u of state.users || []) {
    if (!orgIds.has(u.organizationId)) referentialIssues.push(`User ${u.id}: missing organizationId ${u.organizationId}`);
    if (u.clientId) {
      const cli = clientMap.get(u.clientId);
      if (!cli) referentialIssues.push(`User ${u.id}: missing clientId ${u.clientId}`);
      else if (cli.organizationId !== u.organizationId) {
        referentialIssues.push(`User ${u.id}: cross-org clientId ${u.clientId}`);
      }
    }
    if (!isValidIsoDateOrEmpty(u.createdAt)) conversionErrors.push(`User ${u.id}: invalid createdAt`);
  }
  for (const s of state.sessions || []) {
    if (!orgIds.has(s.organizationId)) referentialIssues.push(`Session ${s.id}: missing organizationId ${s.organizationId}`);
    if (!userIds.has(s.userId)) referentialIssues.push(`Session ${s.id}: missing userId ${s.userId}`);
  }
  for (const c of state.clients || []) {
    if (!orgIds.has(c.organizationId)) referentialIssues.push(`Client ${c.id}: missing organizationId ${c.organizationId}`);
    if (!isValidIsoDateOrEmpty(c.createdAt)) conversionErrors.push(`Client ${c.id}: invalid createdAt`);
  }
  for (const p of state.projects || []) {
    if (!orgIds.has(p.organizationId)) referentialIssues.push(`Project ${p.id}: missing organizationId ${p.organizationId}`);
    const cli = clientMap.get(p.clientId);
    if (!cli) referentialIssues.push(`Project ${p.id}: missing clientId ${p.clientId}`);
    else if (cli.organizationId !== p.organizationId) {
      referentialIssues.push(`Project ${p.id}: cross-org clientId ${p.clientId}`);
    }
  }
  for (const t of state.tasks || []) {
    const proj = projectMap.get(t.projectId);
    if (!proj) referentialIssues.push(`Task ${t.id}: missing projectId ${t.projectId}`);
    else if (proj.organizationId !== t.organizationId) {
      referentialIssues.push(`Task ${t.id}: cross-org projectId ${t.projectId}`);
    }
  }
  for (const r of state.receivables || []) {
    if (!orgIds.has(r.organizationId)) referentialIssues.push(`Receivable ${r.id}: missing organizationId ${r.organizationId}`);
    const cli = clientMap.get(r.clientId);
    if (!cli) referentialIssues.push(`Receivable ${r.id}: missing clientId ${r.clientId}`);
    else if (cli.organizationId !== r.organizationId) {
      referentialIssues.push(`Receivable ${r.id}: cross-org clientId ${r.clientId}`);
    }
    if (r.contractId && !contractMap.has(r.contractId)) {
      referentialIssues.push(`Receivable ${r.id}: missing contractId ${r.contractId}`);
    }
    if (!Number.isFinite(Number(r.amount)) || Number(r.amount) < 0) {
      conversionErrors.push(`Receivable ${r.id}: invalid negative/NaN amount`);
    }
  }
  for (const w of state.webPages || []) {
    if (!orgIds.has(w.organizationId)) referentialIssues.push(`WebPage ${w.id}: missing organizationId ${w.organizationId}`);
    const cli = clientMap.get(w.clientId);
    if (!cli) referentialIssues.push(`WebPage ${w.id}: missing clientId ${w.clientId}`);
    else if (cli.organizationId !== w.organizationId) {
      referentialIssues.push(`WebPage ${w.id}: cross-org clientId ${w.clientId}`);
    }
  }
  for (const a of state.auditLogs || []) {
    if (!orgIds.has(a.organizationId)) referentialIssues.push(`AuditLog ${a.id}: missing organizationId ${a.organizationId}`);
    if (!userIds.has(a.userId)) referentialIssues.push(`AuditLog ${a.id}: missing userId ${a.userId}`);
  }
  for (const prop of state.proposals || []) {
    const cli = clientMap.get(prop.clientId);
    if (!cli || cli.organizationId !== prop.organizationId) {
      referentialIssues.push(`Proposal ${prop.id}: invalid or cross-org clientId ${prop.clientId}`);
    }
  }
  for (const cnt of state.contracts || []) {
    const cli = clientMap.get(cnt.clientId);
    if (!cli || cli.organizationId !== cnt.organizationId) {
      referentialIssues.push(`Contract ${cnt.id}: invalid or cross-org clientId ${cnt.clientId}`);
    }
  }
  for (const b of state.briefings || []) {
    const proj = projectMap.get(b.projectId);
    const cli = clientMap.get(b.clientId);
    if (!proj || proj.organizationId !== b.organizationId || !cli || cli.organizationId !== b.organizationId) {
      referentialIssues.push(`Briefing ${b.id}: invalid or cross-org projectId/clientId`);
    }
  }
  for (const app of state.approvals || []) {
    const proj = projectMap.get(app.projectId);
    const cli = clientMap.get(app.clientId);
    if (!proj || proj.organizationId !== app.organizationId || !cli || cli.organizationId !== app.organizationId) {
      referentialIssues.push(`Approval ${app.id}: invalid or cross-org projectId/clientId`);
    }
  }
  for (const cr of state.creatives || []) {
    const cli = clientMap.get(cr.clientId);
    if (!cli || cli.organizationId !== cr.organizationId) {
      referentialIssues.push(`CreativeAsset ${cr.id}: invalid or cross-org clientId ${cr.clientId}`);
    }
  }
  for (const tk of state.tickets || []) {
    const cli = clientMap.get(tk.clientId);
    if (!cli || cli.organizationId !== tk.organizationId) {
      referentialIssues.push(`Ticket ${tk.id}: invalid or cross-org clientId ${tk.clientId}`);
    }
  }

  const ai = state.aiGateway || ({} as DatabaseState['aiGateway']);

  // Validate organizationId presence on all remaining tenant-scoped collections
  const checkOrgMembership = (entity: string, list: Array<{ id?: string; organizationId?: string }> | undefined) => {
    for (const item of list || []) {
      if (item?.organizationId && !orgIds.has(item.organizationId)) {
        referentialIssues.push(`${entity} ${item.id || '(missing-id)'}: missing organizationId ${item.organizationId}`);
      }
    }
  };
  checkOrgMembership('Lead', state.leads);
  checkOrgMembership('Opportunity', state.opportunities);
  checkOrgMembership('Payable', state.payables);
  checkOrgMembership('Commission', state.commissions);
  checkOrgMembership('Deliverable', state.deliverables);
  checkOrgMembership('TimeEntry', state.timeTracking);
  checkOrgMembership('StoredAsset', state.storedAssets);
  checkOrgMembership('AdAccount', state.adAccounts);
  checkOrgMembership('AdIntegrationCredential', state.adIntegrationCredentials);
  checkOrgMembership('TrackingEvent', state.trackingEvents);
  checkOrgMembership('Workflow', state.workflows);
  checkOrgMembership('Incident', state.incidents);
  checkOrgMembership('StrategyPlan', state.strategyPlans);
  checkOrgMembership('QaItem', state.qaItems);
  checkOrgMembership('LaunchItem', state.launchItems);
  checkOrgMembership('DeliveryHandoff', state.deliveryHandoffs);
  checkOrgMembership('Subscription', state.subscriptions);
  checkOrgMembership('AiCostPolicy', ai.costPolicies);
  checkOrgMembership('AiLimitException', ai.limitExceptions);
  checkOrgMembership('AiAccountingAlert', ai.accountingAlerts);
  checkOrgMembership('AiUsageLog', ai.usageLogs);
  checkOrgMembership('AiMemory', ai.memories);
  checkOrgMembership('AiKnowledgeDoc', ai.knowledgeDocs);

  // Check duplicate IDs across all array collections
  collectDuplicateIds('organizations', state.organizations, duplicateIds);
  collectDuplicateIds('users', state.users, duplicateIds);
  collectDuplicateIds('sessions', state.sessions, duplicateIds);
  collectDuplicateIds('passwordResetTokens', state.passwordResetTokens, duplicateIds);
  collectDuplicateIds('clients', state.clients, duplicateIds);
  collectDuplicateIds('commercialPlans', state.commercialPlans, duplicateIds);
  collectDuplicateIds('leads', state.leads, duplicateIds);
  collectDuplicateIds('opportunities', state.opportunities, duplicateIds);
  collectDuplicateIds('proposals', state.proposals, duplicateIds);
  collectDuplicateIds('contracts', state.contracts, duplicateIds);
  collectDuplicateIds('receivables', state.receivables, duplicateIds);
  collectDuplicateIds('payables', state.payables, duplicateIds);
  collectDuplicateIds('commissions', state.commissions, duplicateIds);
  collectDuplicateIds('projects', state.projects, duplicateIds);
  collectDuplicateIds('briefings', state.briefings, duplicateIds);
  collectDuplicateIds('tasks', state.tasks, duplicateIds);
  collectDuplicateIds('deliverables', state.deliverables, duplicateIds);
  collectDuplicateIds('approvals', state.approvals, duplicateIds);
  collectDuplicateIds('timeTracking', state.timeTracking, duplicateIds);
  collectDuplicateIds('creatives', state.creatives, duplicateIds);
  collectDuplicateIds('storedAssets', state.storedAssets, duplicateIds);
  collectDuplicateIds('adAccounts', state.adAccounts, duplicateIds);
  collectDuplicateIds('adIntegrationCredentials', state.adIntegrationCredentials, duplicateIds);
  collectDuplicateIds('trackingEvents', state.trackingEvents, duplicateIds);
  collectDuplicateIds('workflows', state.workflows, duplicateIds);
  collectDuplicateIds('webPages', state.webPages, duplicateIds);
  collectDuplicateIds('tickets', state.tickets, duplicateIds);
  collectDuplicateIds('subscriptions', state.subscriptions, duplicateIds);
  collectDuplicateIds('billingWebhookEvents', state.billingWebhookEvents, duplicateIds);
  collectDuplicateIds('incidents', state.incidents, duplicateIds);
  collectDuplicateIds('strategyPlans', state.strategyPlans, duplicateIds);
  collectDuplicateIds('qaItems', state.qaItems, duplicateIds);
  collectDuplicateIds('launchItems', state.launchItems, duplicateIds);
  collectDuplicateIds('deliveryHandoffs', state.deliveryHandoffs, duplicateIds);
  collectDuplicateIds('auditLogs', state.auditLogs, duplicateIds);
  collectDuplicateIds('aiProviders', ai.providers, duplicateIds);
  collectDuplicateIds('aiModels', ai.models, duplicateIds);
  collectDuplicateIds('aiRoutingRules', ai.routingRules, duplicateIds);
  collectDuplicateIds('aiPrompts', ai.prompts, duplicateIds);
  collectDuplicateIds('aiActions', ai.actions, duplicateIds);
  collectDuplicateIds('aiLimitExceptions', ai.limitExceptions, duplicateIds);
  collectDuplicateIds('aiAccountingAlerts', ai.accountingAlerts, duplicateIds);
  collectDuplicateIds('aiUsageLogs', ai.usageLogs, duplicateIds);
  collectDuplicateIds('aiMemories', ai.memories, duplicateIds);
  collectDuplicateIds('aiKnowledgeDocs', ai.knowledgeDocs, duplicateIds);

  const entityCounts: Record<string, number> = {
    organizations: (state.organizations || []).length,
    users: (state.users || []).length,
    sessions: (state.sessions || []).length,
    passwordResetTokens: (state.passwordResetTokens || []).length,
    clients: (state.clients || []).length,
    commercialPlans: (state.commercialPlans || []).length,
    leads: (state.leads || []).length,
    opportunities: (state.opportunities || []).length,
    proposals: (state.proposals || []).length,
    contracts: (state.contracts || []).length,
    receivables: (state.receivables || []).length,
    payables: (state.payables || []).length,
    commissions: (state.commissions || []).length,
    projects: (state.projects || []).length,
    briefings: (state.briefings || []).length,
    tasks: (state.tasks || []).length,
    deliverables: (state.deliverables || []).length,
    approvals: (state.approvals || []).length,
    timeTracking: (state.timeTracking || []).length,
    creatives: (state.creatives || []).length,
    adAccounts: (state.adAccounts || []).length,
    adIntegrationCredentials: (state.adIntegrationCredentials || []).length,
    trackingEvents: (state.trackingEvents || []).length,
    workflows: (state.workflows || []).length,
    webPages: (state.webPages || []).length,
    tickets: (state.tickets || []).length,
    subscriptions: (state.subscriptions || []).length,
    billingWebhookEvents: (state.billingWebhookEvents || []).length,
    incidents: (state.incidents || []).length,
    storedAssets: (state.storedAssets || []).length,
    strategyPlans: (state.strategyPlans || []).length,
    qaItems: (state.qaItems || []).length,
    launchItems: (state.launchItems || []).length,
    deliveryHandoffs: (state.deliveryHandoffs || []).length,
    auditLogs: (state.auditLogs || []).length,
    aiProviders: (ai.providers || []).length,
    aiModels: (ai.models || []).length,
    aiRoutingRules: (ai.routingRules || []).length,
    aiPrompts: (ai.prompts || []).length,
    aiCostPolicies: (ai.costPolicies || []).length,
    aiGlobalCostPolicy: ai.globalCostPolicy ? 1 : 0,
    aiActions: (ai.actions || []).length,
    aiExchangeRate: ai.exchangeConfig ? 1 : 0,
    aiLimitExceptions: (ai.limitExceptions || []).length,
    aiAccountingAlerts: (ai.accountingAlerts || []).length,
    aiUsageLogs: (ai.usageLogs || []).length,
    aiMemories: (ai.memories || []).length,
    aiKnowledgeDocs: (ai.knowledgeDocs || []).length,
  };

  const totalRecordsFound = Object.values(entityCounts).reduce((sum, n) => sum + n, 0);

  const financialChecksums = {
    totalReceivablesAmount: Number(
      (state.receivables || []).reduce((s, r) => s + Number(r.amount || 0), 0).toFixed(2)
    ),
    totalReceivablesPaid: Number(
      (state.receivables || []).reduce((s, r) => s + Number(r.paidAmount || 0), 0).toFixed(2)
    ),
    totalPayablesAmount: Number(
      (state.payables || []).reduce((s, p) => s + Number(p.amount || 0), 0).toFixed(2)
    ),
    totalAiCostUsd: Number(
      (ai.usageLogs || []).reduce((s, l) => s + Number(l.estimatedCostUsd || 0), 0).toFixed(6)
    ),
  };

  const flattened = flattenHierarchicalJsonDatabase(state);
  const dataTypeConflicts = detectDataTypeConflicts(flattened);
  const schemaMismatches = detectSchemaMismatches(state as unknown as Record<string, unknown>, flattened);
  const organizationConsistencyErrors = referentialIssues.filter(
    (msg) => msg.includes('cross-org') || msg.includes('organizationId')
  );

  const postgresTargetConfigured = isPostgresConfigured();
  const status =
    referentialIssues.length > 0 ||
    duplicateIds.length > 0 ||
    conversionErrors.length > 0 ||
    schemaMismatches.some((m) => m.kind === 'missing_required_field') ||
    dataTypeConflicts.some((c) => c.resolution === 'rejected')
      ? 'FAILED_INTEGRITY'
      : postgresTargetConfigured
        ? 'READY_FOR_POSTGRES_IMPORT'
        : 'VALIDATED_DRY_RUN';

  return {
    sourcePath,
    backupPath,
    sourceSha256,
    entityCounts,
    totalRecordsFound,
    financialChecksums,
    referentialIssues,
    duplicateIds,
    conversionErrors,
    dataTypeConflicts,
    schemaMismatches,
    organizationConsistencyErrors,
    postgresTargetConfigured,
    status,
  };
}

/**
 * Minimal Prisma delegate shape required for batched idempotent upserts.
 * Accepts either a real PrismaClient or an in-memory relational harness during tests.
 */
export type UpsertDelegate = {
  findUnique: (args: { where: Record<string, unknown> }) => Promise<unknown>;
  findMany?: (args?: { select?: Record<string, boolean>; where?: Record<string, unknown> }) => Promise<Array<Record<string, unknown>>>;
  upsert: (args: { where: Record<string, unknown>; create: Record<string, unknown>; update: Record<string, unknown> }) => Promise<unknown>;
  count?: (args?: { where?: Record<string, unknown> }) => Promise<number>;
};

export type MigrationPrismaLike = Record<string, UpsertDelegate | any> & {
  $transaction?: <T>(fn: (tx: any) => Promise<T>, options?: { maxWait?: number; timeout?: number }) => Promise<T>;
  $executeRaw?: (strings: TemplateStringsArray, ...values: unknown[]) => Promise<unknown>;
  $executeRawUnsafe?: (query: string, ...values: unknown[]) => Promise<unknown>;
};

interface CheckpointData {
  sourceSha256: string;
  completedKeys: string[];
  updatedAt: string;
}

export function writeMigrationReport(report: PostgresImportReport, reportPath: string): string {
  fs.mkdirSync(path.dirname(reportPath), { recursive: true });
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2), 'utf-8');
  return reportPath;
}

export function formatMigrationSummary(report: PostgresImportReport): string {
  const lines: string[] = [
    '==============================================================',
    '  NER AI CENTER — RELATÓRIO DE MIGRAÇÃO JSON -> POSTGRESQL',
    '==============================================================',
    `Modo: ${report.mode} | Transação: ${report.transactionMode} | RLS SuperAdmin: ${report.rlsSuperAdminContextApplied ? 'SIM' : 'NÃO'}`,
    `Status: ${report.status} | Rollback: ${report.rolledBack ? 'SIM' : 'NÃO'} | Duração: ${report.durationMs}ms`,
    `Origem: ${report.sourcePath} (SHA-256: ${report.sourceSha256.slice(0, 16)}...)`,
    `Backup: ${report.backupPath || '(não gerado)'}`,
    `Encontrados: ${report.recordsFound} | Importados: ${report.recordsImported} | Atualizados: ${report.recordsUpdated} | Ignorados (dup/resume): ${report.recordsDuplicateSkipped} | Falhas: ${report.failedCount}`,
    `Checksums Financeiros: Receivables=R$ ${report.financialChecksums.totalReceivablesAmount.toFixed(2)} | Pago=R$ ${report.financialChecksums.totalReceivablesPaid.toFixed(2)} | Payables=R$ ${report.financialChecksums.totalPayablesAmount.toFixed(2)} | IA=US$ ${report.financialChecksums.totalAiCostUsd.toFixed(4)}`,
  ];

  if (report.postImportVerification.executed) {
    lines.push(
      `Reconciliação Pós-Import: ${report.postImportVerification.verified ? 'APROVADA' : 'DIVERGÊNCIAS ENCONTRADAS'}`
    );
    if (report.postImportVerification.mismatches.length > 0) {
      for (const m of report.postImportVerification.mismatches) {
        lines.push(`  [MISMATCH] ${m}`);
      }
    }
  }

  const summaryEntries = Object.entries(report.entitySummary).filter(([, s]) => s.found > 0);
  if (summaryEntries.length > 0) {
    lines.push('Contagem por Entidade (Encontrados / Importados / Atualizados / Falhas):');
    for (const [entity, s] of summaryEntries) {
      lines.push(`  - ${entity}: found=${s.found} imported=${s.imported} updated=${s.updated} failed=${s.rejected}`);
    }
  }

  if (report.schemaMismatches.length > 0) {
    lines.push(`Incompatibilidades de Schema (${report.schemaMismatches.length}):`);
    for (const sm of report.schemaMismatches.slice(0, 20)) {
      lines.push(
        `  - [${sm.kind}] ${sm.entity}${sm.field ? `.${sm.field}` : ''}${sm.id ? ` id=${sm.id}` : ''}: ${sm.message}`
      );
    }
  }

  if (report.organizationConsistencyErrors.length > 0) {
    lines.push(`Erros de Consistência de Organização (${report.organizationConsistencyErrors.length}):`);
    for (const err of report.organizationConsistencyErrors.slice(0, 20)) {
      lines.push(`  - ${err}`);
    }
  }

  if (report.dataTypeConflicts.length > 0) {
    lines.push(`Conflitos de Mapeamento de Tipos (${report.dataTypeConflicts.length}):`);
    for (const c of report.dataTypeConflicts.slice(0, 20)) {
      lines.push(
        `  - [${c.entity}.${c.field}] id=${c.id}: esperado=${c.expectedType}, encontrado=${c.actualType} (${c.rawValuePreview}) -> ${c.resolution}`
      );
    }
    if (report.dataTypeConflicts.length > 20) {
      lines.push(`  ... e mais ${report.dataTypeConflicts.length - 20} conflitos de tipo.`);
    }
  }

  if (report.rejectedEntries.length > 0) {
    lines.push('Registros com Falha/Rejeitados:');
    for (const r of report.rejectedEntries.slice(0, 25)) {
      lines.push(`  - [${r.entity}] id=${r.id}${r.code ? ` (${r.code})` : ''}: ${r.reason}`);
    }
    if (report.rejectedEntries.length > 25) {
      lines.push(`  ... e mais ${report.rejectedEntries.length - 25} falhas (consulte o relatório JSON).`);
    }
  }

  if (report.reportPath) {
    lines.push(`Relatório salvo em: ${report.reportPath}`);
  }
  lines.push('==============================================================');
  return lines.join('\n');
}

/**
 * Executes an idempotent, dependency-ordered, transactional JSON -> PostgreSQL import.
 * Supports:
 * - Default `batched_savepoint` mode: batches run inside `$transaction` with `SET LOCAL app.is_super_admin = 'true'`
 *   and per-record PostgreSQL `SAVEPOINT` so a single bad record never aborts the batch (`25P02`).
 * - `atomic: true` mode: executes the entire import inside a single all-or-nothing PostgreSQL `$transaction`.
 * Never deletes the original JSON file. Creates a SHA-256 verified backup when enabled.
 */
export async function migrateJsonToPostgres(
  sourcePath: string,
  options: {
    prisma?: PrismaClient | MigrationPrismaLike;
    createBackup?: boolean;
    backupDir?: string;
    batchSize?: number;
    checkpointPath?: string;
    reportPath?: string;
    resume?: boolean;
    dryRun?: boolean;
    atomic?: boolean;
    logger?: (line: string) => void;
  } = {}
): Promise<PostgresImportReport> {
  const log = options.logger;
  const startedMs = Date.now();
  const startedAt = new Date(startedMs).toISOString();
  const batchSize = Math.max(1, Math.min(500, Number(options.batchSize) || 50));
  const transactionMode: MigrationTransactionMode = options.atomic ? 'atomic_all_or_nothing' : 'batched_savepoint';
  const validation = validateJsonForPostgresMigration(sourcePath, {
    createBackup: options.createBackup,
    backupDir: options.backupDir,
  });

  const finalizeReport = (rep: PostgresImportReport): PostgresImportReport => {
    rep.succeededCount = rep.recordsImported + rep.recordsUpdated;
    rep.failedCount = rep.recordsRejected;
    rep.completedAt = new Date().toISOString();
    rep.durationMs = Math.max(0, Date.now() - startedMs);
    if (options.reportPath) {
      rep.reportPath = writeMigrationReport(rep, options.reportPath);
    }
    return rep;
  };

  const baseReport: PostgresImportReport = {
    ...validation,
    mode: options.dryRun ? 'dry_run' : 'blocked_infrastructure',
    transactionMode,
    rlsSuperAdminContextApplied: false,
    rolledBack: false,
    existingOrganizationIdsFound: [],
    batchSize,
    checkpointPath: options.checkpointPath || null,
    reportPath: null,
    resumedFromCheckpoint: false,
    recordsFound: validation.totalRecordsFound,
    recordsImported: 0,
    recordsUpdated: 0,
    succeededCount: 0,
    recordsDuplicateSkipped: 0,
    recordsRejected: 0,
    failedCount: 0,
    rejectedEntries: [],
    entitySummary: Object.fromEntries(
      Object.entries(validation.entityCounts).map(([entity, found]) => [
        entity,
        { found, imported: 0, updated: 0, rejected: 0 },
      ])
    ),
    postImportVerification: {
      executed: false,
      verified: false,
      targetCounts: {},
      mismatches: [],
    },
    durationMs: 0,
    startedAt,
    completedAt: new Date().toISOString(),
  };

  if (options.dryRun) {
    for (const [entity, found] of Object.entries(validation.entityCounts)) {
      if (found > 0) {
        log?.(`[NER-MIGRATE][DRY-RUN] ${entity}: found=${found}`);
      }
    }
    log?.(
      `[NER-MIGRATE] Dry-run complete: status=${baseReport.status} recordsFound=${baseReport.recordsFound} schemaMismatches=${baseReport.schemaMismatches.length} orgErrors=${baseReport.organizationConsistencyErrors.length} typeConflicts=${baseReport.dataTypeConflicts.length}`
    );
    return finalizeReport(baseReport);
  }

  let prismaClient: MigrationPrismaLike | null = (options.prisma as MigrationPrismaLike | undefined) || null;
  if (!prismaClient) {
    if (!isPostgresConfigured()) {
      baseReport.mode = 'blocked_infrastructure';
      log?.('[NER-MIGRATE] PostgreSQL DATABASE_URL not configured — skipping live import (mode=blocked_infrastructure).');
      return finalizeReport(baseReport);
    }
    log?.('[NER-MIGRATE] Initializing Prisma client for PostgreSQL import...');
    prismaClient = getPrismaClient() as unknown as MigrationPrismaLike;
    if (typeof prismaClient.$connect === 'function') {
      await prismaClient.$connect();
    }
  }

  baseReport.mode = 'live_postgres';
  const state = JSON.parse(fs.readFileSync(sourcePath, 'utf-8')) as DatabaseState;
  const flat = flattenHierarchicalJsonDatabase(state);
  log?.(
    `[NER-MIGRATE] Parsed hierarchical JSON into 48 flat collections (${baseReport.recordsFound} total records, mode=${transactionMode}).`
  );

  const completedKeys = new Set<string>();
  if (options.resume && options.checkpointPath && fs.existsSync(options.checkpointPath)) {
    try {
      const cp = JSON.parse(fs.readFileSync(options.checkpointPath, 'utf-8')) as CheckpointData;
      if (cp.sourceSha256 === validation.sourceSha256 && Array.isArray(cp.completedKeys)) {
        for (const k of cp.completedKeys) completedKeys.add(k);
        baseReport.resumedFromCheckpoint = true;
      }
    } catch {
      // ignore corrupted checkpoint and re-run idempotently
    }
  }

  const saveCheckpoint = () => {
    if (!options.checkpointPath) return;
    fs.mkdirSync(path.dirname(options.checkpointPath), { recursive: true });
    fs.writeFileSync(
      options.checkpointPath,
      JSON.stringify(
        {
          sourceSha256: validation.sourceSha256,
          completedKeys: Array.from(completedKeys),
          updatedAt: new Date().toISOString(),
        } satisfies CheckpointData,
        null,
        2
      )
    );
  };

  const validOrgIds = new Set(flat.organizations.map((o) => o.id));
  const validClientIds = new Set(flat.clients.map((c) => c.id));
  const validLeadIds = new Set(flat.leads.map((l) => l.id));
  const validProposalIds = new Set(flat.proposals.map((p) => p.id));
  const validContractIds = new Set(flat.contracts.map((c) => c.id));
  const validProjectIds = new Set(flat.projects.map((p) => p.id));
  const validDeliverableIds = new Set(flat.deliverables.map((d) => d.id));
  const validTaskIds = new Set(flat.tasks.map((t) => t.id));
  const validStoredAssetIds = new Set(flat.storedAssets.map((a) => a.id));
  const validUserIds = new Set(flat.users.map((u) => u.id));

  // Organization ownership maps to guarantee strict cross-entity tenant consistency during import
  const clientOrgMap = new Map(flat.clients.map((c) => [c.id, c.organizationId]));
  const projectOrgMap = new Map(flat.projects.map((p) => [p.id, p.organizationId]));
  const userOrgMap = new Map(flat.users.map((u) => [u.id, u.organizationId]));

  const isClientConsistentWithOrg = (clientId: string | null | undefined, orgId: string): boolean => {
    if (!clientId) return true;
    return validClientIds.has(clientId) && clientOrgMap.get(clientId) === orgId;
  };
  const isProjectConsistentWithOrg = (projectId: string | null | undefined, orgId: string): boolean => {
    if (!projectId) return true;
    return validProjectIds.has(projectId) && projectOrgMap.get(projectId) === orgId;
  };
  const isUserConsistentWithOrg = (userId: string | null | undefined, orgId: string): boolean => {
    if (!userId) return true;
    return validUserIds.has(userId) && userOrgMap.get(userId) === orgId;
  };

  const PRISMA_SCHEMA_ERROR_CODES = new Set(['P2000', 'P2002', 'P2003', 'P2011', 'P2021', 'P2022']);

  let activeAtomicTx: MigrationPrismaLike | null = null;

  /**
   * Executes a database operation inside a transaction-local PostgreSQL RLS super-admin context
   * (`SET LOCAL app.is_super_admin = 'true'`) so migrations work seamlessly on managed PostgreSQL
   * instances (Supabase / Lovable Cloud / Neon / Cloud SQL) with RLS enabled.
   */
  async function runWithRlsMigrationContext<R>(fn: (tx: MigrationPrismaLike) => Promise<R>): Promise<R> {
    if (activeAtomicTx) {
      return fn(activeAtomicTx);
    }
    if (prismaClient && typeof prismaClient.$transaction === 'function') {
      return prismaClient.$transaction(
        async (tx: MigrationPrismaLike) => {
          if (typeof tx.$executeRaw === 'function') {
            await tx.$executeRaw`SELECT set_config('app.is_super_admin', 'true', true)`;
            baseReport.rlsSuperAdminContextApplied = true;
          }
          return fn(tx);
        },
        { maxWait: 15_000, timeout: 60_000 }
      );
    }
    return fn(prismaClient!);
  }

  // Validate & preload existing Organization IDs and tenant ownership already stored in target PostgreSQL
  const existingDbEntityOrg = new Map<string, string>();
  await runWithRlsMigrationContext(async (tx) => {
    const orgDelegate = tx.organization as UpsertDelegate | undefined;
    if (orgDelegate && typeof orgDelegate.findMany === 'function') {
      const existingOrgs = await orgDelegate.findMany({ select: { id: true } });
      for (const row of existingOrgs) {
        if (typeof row?.id === 'string' && row.id.length > 0) {
          baseReport.existingOrganizationIdsFound.push(row.id);
          validOrgIds.add(row.id);
        }
      }
    }

    const preloadOwnership = async (
      entityKey: string,
      delegateName: string,
      targetMap?: Map<string, string>,
      targetIdSet?: Set<string>
    ) => {
      const del = tx[delegateName] as UpsertDelegate | undefined;
      if (!del || typeof del.findMany !== 'function') return;
      const rows = await del.findMany({ select: { id: true, organizationId: true } });
      for (const row of rows) {
        if (typeof row?.id === 'string' && typeof row?.organizationId === 'string') {
          existingDbEntityOrg.set(`${entityKey}:${row.id}`, row.organizationId);
          if (targetMap && !targetMap.has(row.id)) targetMap.set(row.id, row.organizationId);
          if (targetIdSet) targetIdSet.add(row.id);
        }
      }
    };

    await preloadOwnership('clients', 'client', clientOrgMap, validClientIds);
    await preloadOwnership('projects', 'project', projectOrgMap, validProjectIds);
    await preloadOwnership('users', 'user', userOrgMap, validUserIds);
  });

  const recordOrgConsistencyError = (msg: string) => {
    if (!baseReport.organizationConsistencyErrors.includes(msg)) {
      baseReport.organizationConsistencyErrors.push(msg);
    }
  };

  async function importCollection<T>(
    entityName: string,
    delegateName: string,
    items: T[] | undefined,
    mapper: (item: T) => { id: string; where: Record<string, unknown>; data: Record<string, unknown> } | { rejectReason: string; id: string }
  ) {
    const list = items || [];
    const summary = { found: list.length, imported: 0, updated: 0, rejected: 0 };
    baseReport.entitySummary[entityName] = summary;

    const rootDelegate = (activeAtomicTx?.[delegateName] || prismaClient?.[delegateName]) as UpsertDelegate | undefined;
    if (!rootDelegate || typeof rootDelegate.upsert !== 'function') {
      for (const item of list) {
        const id = String((item as any)?.id || 'unknown');
        summary.rejected++;
        baseReport.recordsRejected++;
        baseReport.rejectedEntries.push({
          entity: entityName,
          id,
          reason: `Prisma delegate "${delegateName}" indisponível`,
        });
      }
      log?.(`[MIGRATE] ${entityName}: found=${summary.found} imported=0 updated=0 failed=${summary.rejected} (delegate unavailable)`);
      return;
    }

    const seenInSource = new Set<string>();
    for (let i = 0; i < list.length; i += batchSize) {
      const batch = list.slice(i, i + batchSize);
      const validEntries: Array<{ id: string; uniqueKey: string; where: Record<string, unknown>; data: Record<string, unknown> }> = [];

      for (const item of batch) {
        if (!item || typeof item !== 'object') {
          const reason = 'MAPPING_ERROR: registro inválido (nulo ou não-objeto) no JSON de origem';
          summary.rejected++;
          baseReport.recordsRejected++;
          baseReport.conversionErrors.push(`${entityName}: ${reason}`);
          baseReport.rejectedEntries.push({
            entity: entityName,
            id: '(invalid-item)',
            code: 'MAPPING_ERROR',
            reason,
          });
          if (options.atomic) {
            throw new Error(`[${entityName}] ${reason}`);
          }
          continue;
        }

        let mapped: { id: string; where: Record<string, unknown>; data: Record<string, unknown> } | { rejectReason: string; id: string };
        try {
          mapped = mapper(item);
        } catch (mapErr: any) {
          const itemId = String((item as any)?.id || '(missing-id)');
          const reason = `MAPPING_ERROR: ${mapErr?.message || String(mapErr)}`;
          summary.rejected++;
          baseReport.recordsRejected++;
          baseReport.conversionErrors.push(`${entityName}:${itemId} -> ${reason}`);
          baseReport.rejectedEntries.push({
            entity: entityName,
            id: itemId,
            code: 'MAPPING_ERROR',
            reason,
          });
          if (options.atomic) {
            throw mapErr;
          }
          continue;
        }

        if ('rejectReason' in mapped) {
          summary.rejected++;
          baseReport.recordsRejected++;
          baseReport.rejectedEntries.push({
            entity: entityName,
            id: mapped.id,
            reason: mapped.rejectReason,
          });
          if (mapped.rejectReason.includes('CROSS_TENANT') || mapped.rejectReason.includes('organizationId')) {
            recordOrgConsistencyError(`${entityName}:${mapped.id} -> ${mapped.rejectReason}`);
          }
          continue;
        }

        // Prevent mutating an existing PostgreSQL record's organizationId across tenants
        const incomingOrgId = typeof mapped.data.organizationId === 'string' ? mapped.data.organizationId : undefined;
        const existingOrgId = existingDbEntityOrg.get(`${entityName}:${mapped.id}`);
        if (incomingOrgId && existingOrgId && existingOrgId !== incomingOrgId) {
          const reason = `ORG_ID_MUTATION_CONFLICT: existing PostgreSQL ${entityName} ${mapped.id} belongs to organization "${existingOrgId}", cannot reassign to "${incomingOrgId}"`;
          summary.rejected++;
          baseReport.recordsRejected++;
          baseReport.rejectedEntries.push({
            entity: entityName,
            id: mapped.id,
            code: 'ORG_ID_MUTATION_CONFLICT',
            reason,
          });
          recordOrgConsistencyError(`${entityName}:${mapped.id} -> ${reason}`);
          continue;
        }

        const uniqueKey = `${entityName}:${mapped.id}`;
        if (seenInSource.has(uniqueKey)) {
          baseReport.recordsDuplicateSkipped++;
          continue;
        }
        seenInSource.add(uniqueKey);

        if (completedKeys.has(uniqueKey)) {
          baseReport.recordsDuplicateSkipped++;
          continue;
        }
        validEntries.push({
          id: mapped.id,
          uniqueKey,
          where: mapped.where,
          data: sanitizePrismaPayload(mapped.data),
        });
      }

      if (validEntries.length > 0) {
        await runWithRlsMigrationContext(async (tx) => {
          const delegate = (tx[delegateName] || rootDelegate) as UpsertDelegate;
          const supportsSavepoints = !options.atomic && typeof tx.$executeRawUnsafe === 'function';

          for (let idx = 0; idx < validEntries.length; idx++) {
            const entry = validEntries[idx];
            const savepointName = `sp_ner_${idx}`;
            try {
              if (supportsSavepoints) {
                await tx.$executeRawUnsafe!(`SAVEPOINT ${savepointName}`);
              }
              const existing = await delegate.findUnique({ where: entry.where });
              await delegate.upsert({
                where: entry.where,
                create: entry.data,
                update: entry.data,
              });
              if (supportsSavepoints) {
                await tx.$executeRawUnsafe!(`RELEASE SAVEPOINT ${savepointName}`);
              }
              if (existing) {
                summary.updated++;
                baseReport.recordsUpdated++;
              } else {
                summary.imported++;
                baseReport.recordsImported++;
              }
              completedKeys.add(entry.uniqueKey);
            } catch (err: any) {
              if (supportsSavepoints) {
                await tx.$executeRawUnsafe!(`ROLLBACK TO SAVEPOINT ${savepointName}`).catch(() => {});
              }
              const errCode = typeof err?.code === 'string' ? err.code : undefined;
              const errMsg = err?.message || 'Erro de persistência no PostgreSQL';
              summary.rejected++;
              baseReport.recordsRejected++;
              baseReport.rejectedEntries.push({
                entity: entityName,
                id: entry.id,
                code: errCode,
                reason: errMsg,
              });
              if (errCode && PRISMA_SCHEMA_ERROR_CODES.has(errCode)) {
                baseReport.schemaMismatches.push({
                  kind: 'prisma_schema_error',
                  entity: entityName,
                  id: entry.id,
                  code: errCode,
                  message: errMsg,
                });
              }
              if (options.atomic) {
                throw err;
              }
            }
          }
        });
      }
      if (!options.atomic) {
        saveCheckpoint();
      }
    }
    if (summary.found > 0) {
      log?.(
        `[MIGRATE] ${entityName}: found=${summary.found} imported=${summary.imported} updated=${summary.updated} failed=${summary.rejected}`
      );
    }
  }

  const executeAllCollections = async () => {

  // Dependency-ordered import matching FK graph in prisma/schema.prisma
  await importCollection('organizations', 'organization', flat.organizations, (o) => ({
    id: o.id,
    where: { id: o.id },
    data: {
      id: o.id,
      name: o.name,
      legalName: o.legalName,
      document: o.document || null,
      slug: o.slug,
      status: o.status,
      createdAt: toSafeDate(o.createdAt, true),
    },
  }));

  await importCollection('commercialPlans', 'commercialPlan', flat.commercialPlans, (p) => ({
    id: p.id,
    where: { id: p.id },
    data: {
      id: p.id,
      code: p.code,
      name: p.name,
      targetAudience: p.targetAudience,
      category: p.category,
      serviceTemplateType: p.serviceTemplateType,
      setupPrice: Number(p.setupPrice || 0),
      recurringPrice: Number(p.recurringPrice || 0),
      recurrence: p.recurrence,
      deliverables: p.deliverables || [],
      limits: p.limits,
      isActive: Boolean(p.isActive),
      updatedAt: toSafeDate(p.updatedAt, true),
    },
  }));

  await importCollection('clients', 'client', flat.clients, (c) => {
    if (!validOrgIds.has(c.organizationId)) {
      return { id: c.id, rejectReason: `organizationId ausente: ${c.organizationId}` };
    }
    return {
      id: c.id,
      where: { id: c.id },
      data: {
        id: c.id,
        organizationId: c.organizationId,
        name: c.name,
        legalName: c.legalName || null,
        document: c.document || null,
        email: c.email || null,
        phone: c.phone || null,
        website: c.website || null,
        segment: c.segment,
        category: c.category,
        status: c.status,
        mrr: Number(c.mrr || 0),
        health: c.health,
        manager: c.manager || null,
        notes: c.notes || null,
        archivedAt: toSafeDate(c.archivedAt),
        createdAt: toSafeDate(c.createdAt, true),
      },
    };
  });

  await importCollection('users', 'user', flat.users, (u) => {
    if (!validOrgIds.has(u.organizationId)) {
      return { id: u.id, rejectReason: `organizationId ausente: ${u.organizationId}` };
    }
    if (u.clientId && !isClientConsistentWithOrg(u.clientId, u.organizationId)) {
      return { id: u.id, rejectReason: `CROSS_TENANT_ORG_MISMATCH: clientId ${u.clientId} incompatível com organizationId ${u.organizationId}` };
    }
    return {
      id: u.id,
      where: { id: u.id },
      data: {
        id: u.id,
        organizationId: u.organizationId,
        clientId: u.clientId || null,
        name: u.name,
        email: u.email,
        passwordHash: u.passwordHash,
        role: u.role,
        status: u.status,
        emailVerifiedAt: toSafeDate(u.emailVerifiedAt),
        googleSub: u.googleSub || null,
        avatarUrl: u.avatarUrl || null,
        authProvider: u.authProvider || 'local',
        createdAt: toSafeDate(u.createdAt, true),
      },
    };
  });

  await importCollection('sessions', 'session', flat.sessions, (s) => {
    if (!validOrgIds.has(s.organizationId) || !isUserConsistentWithOrg(s.userId, s.organizationId)) {
      return { id: s.id, rejectReason: 'CROSS_TENANT_ORG_MISMATCH: organizationId ou userId incompatível' };
    }
    return {
      id: s.id,
      where: { id: s.id },
      data: {
        id: s.id,
        userId: s.userId,
        organizationId: s.organizationId,
        tokenHash: s.tokenHash,
        expiresAt: toSafeDate(s.expiresAt, true),
        revokedAt: toSafeDate(s.revokedAt),
        createdAt: toSafeDate(s.createdAt, true),
      },
    };
  });

  await importCollection('passwordResetTokens', 'passwordResetToken', flat.passwordResetTokens, (t) => {
    if (!validUserIds.has(t.userId)) return { id: t.id, rejectReason: `userId ausente: ${t.userId}` };
    return {
      id: t.id,
      where: { id: t.id },
      data: {
        id: t.id,
        userId: t.userId,
        tokenHash: t.tokenHash,
        expiresAt: toSafeDate(t.expiresAt, true),
        usedAt: toSafeDate(t.usedAt),
        requestedIp: t.requestedIp || null,
        createdAt: toSafeDate(t.createdAt, true),
      },
    };
  });

  await importCollection('leads', 'lead', flat.leads, (l) => {
    if (!validOrgIds.has(l.organizationId)) return { id: l.id, rejectReason: 'organizationId inválido' };
    return {
      id: l.id,
      where: { id: l.id },
      data: {
        id: l.id,
        organizationId: l.organizationId,
        name: l.name,
        email: l.email,
        phone: l.phone || null,
        company: l.company,
        segment: l.segment || null,
        source: l.source,
        utmCampaign: l.utmCampaign || null,
        status: l.status,
        estimatedValue: Number(l.estimatedValue || 0),
        assignedUserId: l.assignedUserId || null,
        archivedAt: toSafeDate(l.archivedAt),
        createdAt: toSafeDate(l.createdAt, true),
      },
    };
  });

  await importCollection('opportunities', 'opportunity', flat.opportunities, (o) => {
    if (!validOrgIds.has(o.organizationId)) return { id: o.id, rejectReason: 'organizationId inválido' };
    if (o.clientId && !isClientConsistentWithOrg(o.clientId, o.organizationId)) {
      return { id: o.id, rejectReason: 'CROSS_TENANT_ORG_MISMATCH: clientId incompatível em Opportunity' };
    }
    return {
      id: o.id,
      where: { id: o.id },
      data: {
        id: o.id,
        organizationId: o.organizationId,
        clientId: o.clientId && validClientIds.has(o.clientId) ? o.clientId : null,
        leadId: o.leadId && validLeadIds.has(o.leadId) ? o.leadId : null,
        name: o.name,
        stage: o.stage,
        value: Number(o.value || 0),
        probability: Number(o.probability || 0),
        responsible: o.responsible,
        expectedClose: o.expectedClose || null,
        history: o.history || [],
        archivedAt: toSafeDate(o.archivedAt),
      },
    };
  });

  await importCollection('proposals', 'proposal', flat.proposals, (p) => {
    if (!validOrgIds.has(p.organizationId) || !isClientConsistentWithOrg(p.clientId, p.organizationId)) {
      return { id: p.id, rejectReason: 'CROSS_TENANT_ORG_MISMATCH: organizationId ou clientId incompatível em Proposal' };
    }
    return {
      id: p.id,
      where: { id: p.id },
      data: {
        id: p.id,
        organizationId: p.organizationId,
        number: p.number,
        clientId: p.clientId,
        planCode: p.planCode || null,
        title: p.title,
        setupValue: Number(p.setupValue || 0),
        recurringValue: Number(p.recurringValue || 0),
        discountValue: Number(p.discountValue || 0),
        totalValue: Number(p.totalValue || 0),
        conditions: p.conditions || null,
        status: p.status,
        validUntil: p.validUntil,
        responsible: p.responsible,
        acceptedAt: toSafeDate(p.acceptedAt),
        acceptedBy: p.acceptedBy || null,
        archivedAt: toSafeDate(p.archivedAt),
        createdAt: toSafeDate(p.createdAt, true),
      },
    };
  });

  await importCollection('contracts', 'contract', flat.contracts, (c) => {
    if (!validOrgIds.has(c.organizationId) || !isClientConsistentWithOrg(c.clientId, c.organizationId)) {
      return { id: c.id, rejectReason: 'CROSS_TENANT_ORG_MISMATCH: organizationId ou clientId incompatível em Contract' };
    }
    return {
      id: c.id,
      where: { id: c.id },
      data: {
        id: c.id,
        organizationId: c.organizationId,
        number: c.number,
        clientId: c.clientId,
        proposalId: c.proposalId && validProposalIds.has(c.proposalId) ? c.proposalId : null,
        planCode: c.planCode || null,
        serviceType: c.serviceType,
        title: c.title,
        setupValue: Number(c.setupValue || 0),
        recurringValue: Number(c.recurringValue || 0),
        value: Number(c.value || 0),
        recurrence: c.recurrence,
        status: c.status,
        startDate: c.startDate,
        endDate: c.endDate || null,
        archivedAt: toSafeDate(c.archivedAt),
      },
    };
  });

  await importCollection('receivables', 'receivable', flat.receivables, (r) => {
    if (!validOrgIds.has(r.organizationId) || !isClientConsistentWithOrg(r.clientId, r.organizationId)) {
      return { id: r.id, rejectReason: 'CROSS_TENANT_ORG_MISMATCH: organizationId ou clientId incompatível em Receivable' };
    }
    if (!Number.isFinite(Number(r.amount)) || Number(r.amount) < 0) {
      return { id: r.id, rejectReason: 'Valor financeiro inválido' };
    }
    return {
      id: r.id,
      where: { id: r.id },
      data: {
        id: r.id,
        organizationId: r.organizationId,
        clientId: r.clientId,
        clientName: r.clientName,
        contractId: r.contractId && validContractIds.has(r.contractId) ? r.contractId : null,
        description: r.description,
        amount: Number(r.amount),
        paidAmount: Number(r.paidAmount || 0),
        mediaBudget: Number(r.mediaBudget || 0),
        dueDate: r.dueDate,
        status: r.status,
        paymentMethod: r.paymentMethod || null,
        paymentRef: r.paymentRef || null,
        paidAt: toSafeDate(r.paidAt),
      },
    };
  });

  await importCollection('payables', 'payable', flat.payables, (p) => {
    if (!validOrgIds.has(p.organizationId)) return { id: p.id, rejectReason: 'organizationId inválido' };
    return {
      id: p.id,
      where: { id: p.id },
      data: {
        id: p.id,
        organizationId: p.organizationId,
        supplier: p.supplier,
        description: p.description,
        category: p.category,
        amount: Number(p.amount || 0),
        dueDate: p.dueDate,
        status: p.status,
      },
    };
  });

  await importCollection('commissions', 'commission', flat.commissions, (c) => {
    if (!validOrgIds.has(c.organizationId)) return { id: c.id, rejectReason: 'organizationId inválido' };
    return {
      id: c.id,
      where: { id: c.id },
      data: {
        id: c.id,
        organizationId: c.organizationId,
        responsible: c.responsible,
        clientName: c.clientName,
        contractId: c.contractId && validContractIds.has(c.contractId) ? c.contractId : null,
        baseAmount: Number(c.baseAmount || 0),
        percentage: Number(c.percentage || 0),
        commissionValue: Number(c.commissionValue || 0),
        status: c.status,
      },
    };
  });

  await importCollection('projects', 'project', flat.projects, (p) => {
    if (!validOrgIds.has(p.organizationId) || !isClientConsistentWithOrg(p.clientId, p.organizationId)) {
      return { id: p.id, rejectReason: 'CROSS_TENANT_ORG_MISMATCH: organizationId ou clientId incompatível em Project' };
    }
    return {
      id: p.id,
      where: { id: p.id },
      data: {
        id: p.id,
        organizationId: p.organizationId,
        clientId: p.clientId,
        contractId: p.contractId && validContractIds.has(p.contractId) ? p.contractId : null,
        planCode: p.planCode || null,
        name: p.name,
        projectType: p.projectType,
        status: p.status,
        priority: p.priority,
        startDate: p.startDate,
        dueDate: p.dueDate,
        managerId: p.managerId,
        progress: Number(p.progress || 0),
        archivedAt: toSafeDate(p.archivedAt),
        createdAt: toSafeDate(p.createdAt, true),
      },
    };
  });

  await importCollection('briefings', 'briefing', flat.briefings, (b) => {
    if (
      !validOrgIds.has(b.organizationId) ||
      !isProjectConsistentWithOrg(b.projectId, b.organizationId) ||
      !isClientConsistentWithOrg(b.clientId, b.organizationId)
    ) {
      return { id: b.id, rejectReason: 'CROSS_TENANT_ORG_MISMATCH: Relacionamento inválido em Briefing' };
    }
    return {
      id: b.id,
      where: { id: b.id },
      data: {
        id: b.id,
        organizationId: b.organizationId,
        projectId: b.projectId,
        clientId: b.clientId,
        title: b.title,
        objective: b.objective,
        targetAudience: b.targetAudience,
        offerDetails: b.offerDetails || null,
        status: b.status,
        createdAt: toSafeDate(b.createdAt, true),
      },
    };
  });

  await importCollection('tasks', 'task', flat.tasks, (t) => {
    if (!validOrgIds.has(t.organizationId) || !isProjectConsistentWithOrg(t.projectId, t.organizationId)) {
      return { id: t.id, rejectReason: 'CROSS_TENANT_ORG_MISMATCH: organizationId ou projectId incompatível em Task' };
    }
    return {
      id: t.id,
      where: { id: t.id },
      data: {
        id: t.id,
        organizationId: t.organizationId,
        projectId: t.projectId,
        title: t.title,
        status: t.status,
        priority: t.priority,
        assigneeId: t.assigneeId || null,
        dueDate: t.dueDate || null,
        estimatedHours: Number(t.estimatedHours || 0),
        actualHours: Number(t.actualHours || 0),
        comments: t.comments || null,
        history: t.history || null,
      },
    };
  });

  await importCollection('deliverables', 'deliverable', flat.deliverables, (d) => {
    if (!validOrgIds.has(d.organizationId) || !isProjectConsistentWithOrg(d.projectId, d.organizationId)) {
      return { id: d.id, rejectReason: 'CROSS_TENANT_ORG_MISMATCH: organizationId ou projectId incompatível em Deliverable' };
    }
    return {
      id: d.id,
      where: { id: d.id },
      data: {
        id: d.id,
        organizationId: d.organizationId,
        projectId: d.projectId,
        name: d.name,
        type: d.type,
        version: d.version,
        status: d.status,
        dueDate: d.dueDate || null,
        assetUrl: d.assetUrl || null,
      },
    };
  });

  await importCollection('approvals', 'approval', flat.approvals, (a) => {
    if (
      !validOrgIds.has(a.organizationId) ||
      !isProjectConsistentWithOrg(a.projectId, a.organizationId) ||
      !isClientConsistentWithOrg(a.clientId, a.organizationId)
    ) {
      return { id: a.id, rejectReason: 'CROSS_TENANT_ORG_MISMATCH: Relacionamento inválido em Approval' };
    }
    return {
      id: a.id,
      where: { id: a.id },
      data: {
        id: a.id,
        organizationId: a.organizationId,
        projectId: a.projectId,
        clientId: a.clientId,
        deliverableId: a.deliverableId && validDeliverableIds.has(a.deliverableId) ? a.deliverableId : null,
        title: a.title,
        version: a.version,
        requester: a.requester,
        approver: a.approver,
        status: a.status,
        comment: a.comment || null,
        decidedAt: toSafeDate(a.decidedAt),
        decidedByUserId: a.decidedByUserId || null,
      },
    };
  });

  await importCollection('timeTracking', 'timeEntry', flat.timeTracking, (t) => {
    if (
      !validOrgIds.has(t.organizationId) ||
      !isProjectConsistentWithOrg(t.projectId, t.organizationId) ||
      !isUserConsistentWithOrg(t.userId, t.organizationId)
    ) {
      return { id: t.id, rejectReason: 'CROSS_TENANT_ORG_MISMATCH: Relacionamento inválido em TimeEntry' };
    }
    return {
      id: t.id,
      where: { id: t.id },
      data: {
        id: t.id,
        organizationId: t.organizationId,
        projectId: t.projectId,
        taskId: t.taskId && validTaskIds.has(t.taskId) ? t.taskId : null,
        userId: t.userId,
        description: t.description,
        duration: Number(t.duration || 0),
        billable: Boolean(t.billable),
        date: t.date,
      },
    };
  });

  // Import storedAssets before creatives so CreativeAsset.fileAssetId references are already present
  await importCollection('storedAssets', 'storedAsset', flat.storedAssets, (a) => {
    if (!validOrgIds.has(a.organizationId)) return { id: a.id, rejectReason: 'organizationId inválido' };
    return {
      id: a.id,
      where: { id: a.id },
      data: {
        id: a.id,
        organizationId: a.organizationId,
        clientId: a.clientId && isClientConsistentWithOrg(a.clientId, a.organizationId) ? a.clientId : null,
        projectId: a.projectId && isProjectConsistentWithOrg(a.projectId, a.organizationId) ? a.projectId : null,
        module: a.module,
        fileName: a.fileName,
        mimeType: a.mimeType,
        sizeBytes: Number(a.sizeBytes || 0),
        storageDriver: a.storageDriver,
        storageKey: a.storageKey,
        sha256: a.sha256,
        uploadedById: a.uploadedById,
        deletedAt: toSafeDate(a.deletedAt),
        createdAt: toSafeDate(a.createdAt, true),
      },
    };
  });

  await importCollection('creatives', 'creativeAsset', flat.creatives, (c) => {
    if (!validOrgIds.has(c.organizationId) || !isClientConsistentWithOrg(c.clientId, c.organizationId)) {
      return { id: c.id, rejectReason: 'CROSS_TENANT_ORG_MISMATCH: organizationId ou clientId incompatível em CreativeAsset' };
    }
    return {
      id: c.id,
      where: { id: c.id },
      data: {
        id: c.id,
        organizationId: c.organizationId,
        clientId: c.clientId,
        projectId: c.projectId && isProjectConsistentWithOrg(c.projectId, c.organizationId) ? c.projectId : null,
        name: c.name,
        clientName: c.client,
        format: c.format,
        platform: c.platform,
        type: c.type,
        version: c.version,
        status: c.status,
        usageRights: c.usageRights,
        scriptSummary: c.scriptSummary || null,
        fileAssetId: c.fileAssetId && validStoredAssetIds.has(c.fileAssetId) ? c.fileAssetId : null,
        archivedAt: toSafeDate(c.archivedAt),
      },
    };
  });

  await importCollection('webPages', 'webPage', flat.webPages, (w) => {
    if (!validOrgIds.has(w.organizationId) || !isClientConsistentWithOrg(w.clientId, w.organizationId)) {
      return { id: w.id, rejectReason: 'CROSS_TENANT_ORG_MISMATCH: organizationId ou clientId incompatível em WebPage' };
    }
    return {
      id: w.id,
      where: { id: w.id },
      data: {
        id: w.id,
        organizationId: w.organizationId,
        clientId: w.clientId,
        projectId: w.projectId && validProjectIds.has(w.projectId) ? w.projectId : null,
        title: w.title,
        slug: w.slug,
        segment: w.segment,
        pageType: w.pageType,
        domain: w.domain,
        sslStatus: w.sslStatus,
        status: w.status,
        version: w.version,
        seoTitle: w.seoTitle,
        seoDescription: w.seoDescription,
        whatsappNumber: w.whatsappNumber || null,
        checkoutUrl: w.checkoutUrl || null,
        pixelConfigured: Boolean(w.pixelConfigured),
        sections: w.sections || [],
        visits: Number(w.visits || 0),
        leadsCaptured: Number(w.leadsCaptured || 0),
        archivedAt: toSafeDate(w.archivedAt),
      },
    };
  });

  await importCollection('adAccounts', 'adAccount', flat.adAccounts, (a) => {
    if (!validOrgIds.has(a.organizationId) || !isClientConsistentWithOrg(a.clientId, a.organizationId)) {
      return { id: a.id, rejectReason: 'CROSS_TENANT_ORG_MISMATCH: organizationId ou clientId incompatível em AdAccount' };
    }
    return {
      id: a.id,
      where: { id: a.id },
      data: {
        id: a.id,
        organizationId: a.organizationId,
        clientId: a.clientId,
        platform: a.platform,
        name: a.name,
        externalAccountId: a.externalAccountId,
        connectionStatus: a.connectionStatus,
        spend: Number(a.spend || 0),
        impressions: Number(a.impressions || 0),
        clicks: Number(a.clicks || 0),
        conversions: Number(a.conversions || 0),
        roas: Number(a.roas || 0),
        cpa: Number(a.cpa || 0),
        dailyLimit: Number(a.dailyLimit || 0),
        lastSyncAt: toSafeDate(a.lastSyncAt, true),
      },
    };
  });

  await importCollection('adIntegrationCredentials', 'adIntegrationCredential', flat.adIntegrationCredentials, (c) => {
    if (!validOrgIds.has(c.organizationId)) return { id: c.id, rejectReason: 'organizationId inválido' };
    return {
      id: c.id,
      where: { id: c.id },
      data: {
        id: c.id,
        organizationId: c.organizationId,
        provider: c.provider,
        enabled: Boolean(c.enabled),
        publicConfig: c.publicConfig || {},
        encryptedSecrets: c.encryptedSecrets || {},
        secretMasks: c.secretMasks || {},
        status: c.status,
        lastTestedAt: toSafeDate(c.lastTestedAt),
        lastTestStatus: c.lastTestStatus || null,
        lastTestMessage: c.lastTestMessage || null,
        updatedByUserId: c.updatedByUserId,
        createdAt: toSafeDate(c.createdAt, true),
        updatedAt: toSafeDate(c.updatedAt, true),
      },
    };
  });

  await importCollection('trackingEvents', 'trackingEvent', flat.trackingEvents, (e) => {
    if (!validOrgIds.has(e.organizationId) || !isClientConsistentWithOrg(e.clientId, e.organizationId)) {
      return { id: e.id, rejectReason: 'CROSS_TENANT_ORG_MISMATCH: organizationId ou clientId incompatível em TrackingEvent' };
    }
    return {
      id: e.id,
      where: { id: e.id },
      data: {
        id: e.id,
        organizationId: e.organizationId,
        clientId: e.clientId,
        eventId: e.eventId,
        eventName: e.eventName,
        source: e.source,
        utmCampaign: e.utmCampaign || null,
        value: Number(e.value || 0),
        currency: e.currency || 'BRL',
        confirmedByPayment: Boolean(e.confirmedByPayment),
        deduplicatedCount: Number(e.deduplicatedCount || 1),
        dispatchStatus: e.dispatchStatus || 'recorded',
        timestamp: toSafeDate(e.timestamp, true),
      },
    };
  });

  await importCollection('workflows', 'workflow', flat.workflows, (w) => {
    if (!validOrgIds.has(w.organizationId)) return { id: w.id, rejectReason: 'organizationId inválido' };
    return {
      id: w.id,
      where: { id: w.id },
      data: {
        id: w.id,
        organizationId: w.organizationId,
        name: w.name,
        category: w.category,
        trigger: w.trigger,
        status: w.status,
        executions: Number(w.executions || 0),
        lastRunAt: toSafeDate(w.lastRunAt, true),
      },
    };
  });

  await importCollection('tickets', 'ticket', flat.tickets, (t) => {
    if (!validOrgIds.has(t.organizationId) || !isClientConsistentWithOrg(t.clientId, t.organizationId)) {
      return { id: t.id, rejectReason: 'CROSS_TENANT_ORG_MISMATCH: organizationId ou clientId incompatível em Ticket' };
    }
    return {
      id: t.id,
      where: { id: t.id },
      data: {
        id: t.id,
        organizationId: t.organizationId,
        clientId: t.clientId,
        category: t.category,
        priority: t.priority,
        subject: t.subject,
        description: t.description,
        status: t.status,
        assigneeId: t.assigneeId || null,
        assigneeName: t.assigneeName || null,
        replies: t.replies || [],
        createdAt: toSafeDate(t.createdAt, true),
      },
    };
  });

  await importCollection('incidents', 'incident', flat.incidents, (inc) => {
    if (!validOrgIds.has(inc.organizationId)) return { id: inc.id, rejectReason: 'organizationId inválido' };
    return {
      id: inc.id,
      where: { id: inc.id },
      data: {
        id: inc.id,
        organizationId: inc.organizationId,
        category: inc.category,
        severity: inc.severity,
        service: inc.service,
        description: inc.description,
        status: inc.status,
        assigneeId: inc.assigneeId || null,
        assigneeName: inc.assigneeName || null,
        resolutionPlan: inc.resolutionPlan || null,
        history: inc.history || [],
        resolvedAt: toSafeDate(inc.resolvedAt),
        createdAt: toSafeDate(inc.createdAt, true),
      },
    };
  });

  await importCollection('strategyPlans', 'strategyPlan', flat.strategyPlans, (s) => {
    if (!validOrgIds.has(s.organizationId) || !isClientConsistentWithOrg(s.clientId, s.organizationId)) {
      return { id: s.id, rejectReason: 'CROSS_TENANT_ORG_MISMATCH: organizationId ou clientId incompatível em StrategyPlan' };
    }
    return {
      id: s.id,
      where: { id: s.id },
      data: {
        id: s.id,
        organizationId: s.organizationId,
        clientId: s.clientId,
        projectId: s.projectId && isProjectConsistentWithOrg(s.projectId, s.organizationId) ? s.projectId : null,
        title: s.title,
        quarter: s.quarter,
        objective: s.objective,
        positioning: s.positioning || null,
        channels: s.channels || [],
        okrs: s.okrs || [],
        status: s.status,
        createdById: s.createdById,
        archivedAt: toSafeDate(s.archivedAt),
        createdAt: toSafeDate(s.createdAt, true),
        updatedAt: toSafeDate(s.updatedAt, true),
      },
    };
  });

  await importCollection('qaItems', 'qaCheckItem', flat.qaItems, (q) => {
    if (!validOrgIds.has(q.organizationId)) return { id: q.id, rejectReason: 'organizationId inválido' };
    return {
      id: q.id,
      where: { id: q.id },
      data: {
        id: q.id,
        organizationId: q.organizationId,
        projectId: q.projectId && isProjectConsistentWithOrg(q.projectId, q.organizationId) ? q.projectId : null,
        title: q.title,
        category: q.category,
        severity: q.severity,
        status: q.status,
        assigneeName: q.assigneeName || null,
        evidence: q.evidence || null,
        createdAt: toSafeDate(q.createdAt, true),
        updatedAt: toSafeDate(q.updatedAt, true),
      },
    };
  });

  await importCollection('launchItems', 'launchChecklistItem', flat.launchItems, (l) => {
    if (!validOrgIds.has(l.organizationId)) return { id: l.id, rejectReason: 'organizationId inválido' };
    return {
      id: l.id,
      where: { id: l.id },
      data: {
        id: l.id,
        organizationId: l.organizationId,
        projectId: l.projectId && isProjectConsistentWithOrg(l.projectId, l.organizationId) ? l.projectId : null,
        domain: l.domain,
        title: l.title,
        required: Boolean(l.required),
        status: l.status,
        verifiedBy: l.verifiedBy || null,
        verifiedAt: toSafeDate(l.verifiedAt),
        notes: l.notes || null,
        createdAt: toSafeDate(l.createdAt, true),
        updatedAt: toSafeDate(l.updatedAt, true),
      },
    };
  });

  await importCollection('deliveryHandoffs', 'deliveryHandoff', flat.deliveryHandoffs, (d) => {
    if (
      !validOrgIds.has(d.organizationId) ||
      !isProjectConsistentWithOrg(d.projectId, d.organizationId) ||
      !isClientConsistentWithOrg(d.clientId, d.organizationId)
    ) {
      return { id: d.id, rejectReason: 'CROSS_TENANT_ORG_MISMATCH: Relacionamento inválido em DeliveryHandoff' };
    }
    return {
      id: d.id,
      where: { id: d.id },
      data: {
        id: d.id,
        organizationId: d.organizationId,
        projectId: d.projectId,
        clientId: d.clientId,
        title: d.title,
        version: d.version,
        summary: d.summary,
        deliverablesList: d.deliverablesList || [],
        acceptanceTerms: d.acceptanceTerms,
        status: d.status,
        acceptedByName: d.acceptedByName || null,
        acceptedByUserId: d.acceptedByUserId || null,
        acceptedAt: toSafeDate(d.acceptedAt),
        signatureHash: d.signatureHash || null,
        createdAt: toSafeDate(d.createdAt, true),
        updatedAt: toSafeDate(d.updatedAt, true),
      },
    };
  });

  await importCollection('subscriptions', 'subscription', flat.subscriptions, (s) => {
    if (!validOrgIds.has(s.organizationId)) return { id: s.id, rejectReason: 'organizationId inválido' };
    return {
      id: s.id,
      where: { id: s.id },
      data: {
        id: s.id,
        organizationId: s.organizationId,
        planCode: s.planCode,
        planName: s.planName,
        provider: s.provider,
        externalSubId: s.externalSubId || null,
        externalCustomerId: s.externalCustomerId || null,
        status: s.status,
        amountMonthly: Number(s.amountMonthly || 0),
        currentPeriodEnd: toSafeDate(s.currentPeriodEnd),
        updatedAt: toSafeDate(s.updatedAt, true),
      },
    };
  });

  await importCollection('billingWebhookEvents', 'billingWebhookEvent', flat.billingWebhookEvents, (e) => ({
    id: e.id,
    where: { id: e.id },
    data: {
      id: e.id,
      provider: e.provider,
      eventId: e.eventId,
      eventType: e.eventType,
      organizationId: e.organizationId && validOrgIds.has(e.organizationId) ? e.organizationId : null,
      status: e.status,
      summary: e.summary || null,
      processedAt: toSafeDate(e.processedAt, true),
    },
  }));

  await importCollection('auditLogs', 'auditLog', flat.auditLogs, (a) => {
    if (!validOrgIds.has(a.organizationId) || !validUserIds.has(a.userId)) {
      return { id: a.id, rejectReason: 'organizationId ou userId inválido em AuditLog' };
    }
    return {
      id: a.id,
      where: { id: a.id },
      data: {
        id: a.id,
        organizationId: a.organizationId,
        userId: a.userId,
        action: a.action,
        resource: a.resource,
        resourceId: a.resourceId,
        metadata: a.metadata || {},
        createdAt: toSafeDate(a.createdAt, true),
      },
    };
  });

  // AI Gateway domain (flattened arrays from hierarchical aiGateway subtree)
  await importCollection('aiProviders', 'aiProviderConfig', flat.aiProviders, (p) => ({
    id: p.id,
    where: { id: p.id },
    data: {
      id: p.id,
      providerId: p.providerId,
      displayName: p.displayName,
      scope: p.scope,
      organizationId: p.organizationId && validOrgIds.has(p.organizationId) ? p.organizationId : null,
      requiresKey: Boolean(p.requiresKey),
      requiresEndpoint: Boolean(p.requiresEndpoint),
      encryptedApiKey: p.encryptedApiKey || null,
      keyMask: p.keyMask || null,
      baseUrl: p.baseUrl,
      organizationHeader: p.organizationHeader || null,
      projectIdHeader: p.projectIdHeader || null,
      defaultModel: p.defaultModel,
      rateLimitPerMin: Number(p.rateLimitPerMin || 60),
      status: p.status,
      lastCheckedAt: toSafeDate(p.lastCheckedAt),
      lastError: p.lastError || null,
      capabilities: p.capabilities || {},
      updatedAt: toSafeDate(p.updatedAt, true),
    },
  }));

  await importCollection('aiModels', 'aiModel', flat.aiModels, (m) => ({
    id: m.id,
    where: { id: m.id },
    data: {
      id: m.id,
      providerId: m.providerId,
      modelId: m.modelId,
      displayName: m.displayName,
      isActive: Boolean(m.isActive),
      isDefaultForProvider: Boolean(m.isDefaultForProvider),
      priority: Number(m.priority || 1),
      contextWindow: Number(m.contextWindow || 128000),
      maxInputTokens: m.maxInputTokens ?? null,
      maxOutputTokens: m.maxOutputTokens ?? null,
      dailyTokenLimit: m.dailyTokenLimit ?? null,
      capabilities: m.capabilities || {},
      inputCostPer1M: m.inputCostPer1M ?? null,
      outputCostPer1M: m.outputCostPer1M ?? null,
      cacheInputCostPer1M: m.cacheInputCostPer1M ?? null,
      reasoningCostPer1M: m.reasoningCostPer1M ?? null,
      currency: m.currency || 'USD',
      effectiveFrom: m.effectiveFrom || null,
      priceSource: m.priceSource || null,
      pricingVerified: Boolean(m.pricingVerified),
      source: m.source || 'catalog',
      lastVerifiedAt: toSafeDate(m.lastVerifiedAt),
    },
  }));

  await importCollection('aiRoutingRules', 'aiRoutingRule', flat.aiRoutingRules, (r) => ({
    id: r.id,
    where: { id: r.id },
    data: {
      id: r.id,
      purpose: r.purpose,
      label: r.label,
      primaryProviderId: r.primaryProviderId,
      primaryModelId: r.primaryModelId,
      fallbackProviderId: r.fallbackProviderId || null,
      fallbackModelId: r.fallbackModelId || null,
      allowMoreExpensiveFallback: Boolean(r.allowMoreExpensiveFallback),
      maxCostUsdPerRequest: r.maxCostUsdPerRequest ?? null,
      timeoutMs: Number(r.timeoutMs || 30000),
      maxRetries: Number(r.maxRetries || 1),
      isActive: Boolean(r.isActive),
      updatedAt: toSafeDate(r.updatedAt, true),
    },
  }));

  await importCollection('aiPrompts', 'aiPromptTemplate', flat.aiPrompts, (p) => {
    if (!validOrgIds.has(p.organizationId)) return { id: p.id, rejectReason: 'organizationId inválido' };
    return {
      id: p.id,
      where: { id: p.id },
      data: {
        id: p.id,
        organizationId: p.organizationId,
        code: p.code,
        name: p.name,
        department: p.department,
        purpose: p.purpose,
        version: Number(p.version || 1),
        isActive: Boolean(p.isActive),
        systemPrompt: p.systemPrompt,
        userTemplate: p.userTemplate,
        preferredProviderId: p.preferredProviderId || null,
        preferredModelId: p.preferredModelId || null,
        temperature: Number(p.temperature ?? 0.4),
        maxOutputTokens: Number(p.maxOutputTokens || 1200),
        history: p.history || [],
        updatedAt: toSafeDate(p.updatedAt, true),
      },
    };
  });

  if (flat.aiGlobalCostPolicies.length > 0) {
    await importCollection('aiGlobalCostPolicy', 'aiGlobalCostPolicy', flat.aiGlobalCostPolicies, (g) => ({
      id: 'global',
      where: { id: 'global' },
      data: {
        id: 'global',
        dailyLimitUsd: Number(g.dailyLimitUsd || 150),
        monthlyLimitUsd: Number(g.monthlyLimitUsd || 3000),
        alertThresholds: g.alertThresholds || [50, 75, 90, 100],
        thresholdRules: g.thresholdRules || null,
        onExceedAction: g.onExceedAction || 'block_non_essential',
        updatedBy: g.updatedBy || null,
        updatedAt: toSafeDate(g.updatedAt, true),
      },
    }));
  }

  await importCollection('aiCostPolicies', 'aiCostPolicy', flat.aiCostPolicies, (c) => {
    if (!validOrgIds.has(c.organizationId)) {
      return { id: c.organizationId, rejectReason: 'organizationId inválido' };
    }
    return {
      id: c.organizationId,
      where: { organizationId: c.organizationId },
      data: {
        organizationId: c.organizationId,
        dailyLimitUsd: Number(c.dailyLimitUsd || 25),
        monthlyLimitUsd: Number(c.monthlyLimitUsd || 500),
        userDailyLimitUsd: Number(c.userDailyLimitUsd || 10),
        alertThresholdPct: Number(c.alertThresholdPct || 80),
        alertThresholds: c.alertThresholds || [50, 75, 90, 100],
        thresholdRules: c.thresholdRules || null,
        blockOnExceed: Boolean(c.blockOnExceed),
        onExceedAction: c.onExceedAction || 'block_non_essential',
        departmentLimitsUsd: c.departmentLimitsUsd || {},
        providerLimitsUsd: c.providerLimitsUsd || null,
        modelLimitsUsd: c.modelLimitsUsd || null,
        actionLimitsUsd: c.actionLimitsUsd || null,
        restrictedActions: c.restrictedActions || null,
        updatedAt: toSafeDate(c.updatedAt, true),
      },
    };
  });

  await importCollection('aiActions', 'aiActionCatalog', flat.aiActions, (a) => ({
    id: a.id,
    where: { id: a.id },
    data: {
      id: a.id,
      department: a.department,
      name: a.name,
      purpose: a.purpose,
      description: a.description || null,
      isCritical: Boolean(a.isCritical),
      cacheable: Boolean(a.cacheable),
      isSystem: Boolean(a.isSystem),
    },
  }));

  if (flat.aiExchangeRates.length > 0) {
    await importCollection('aiExchangeRate', 'aiExchangeRate', flat.aiExchangeRates, (ex) => ({
      id: 'USD-BRL',
      where: { id: 'USD-BRL' },
      data: {
        id: 'USD-BRL',
        baseCurrency: ex.baseCurrency || 'USD',
        targetCurrency: ex.targetCurrency || 'BRL',
        rate: Number(ex.rate || 5.75),
        rateDate: ex.rateDate,
        source: ex.source,
        updatedAt: toSafeDate(ex.updatedAt, true),
      },
    }));
  }

  await importCollection('aiLimitExceptions', 'aiLimitException', flat.aiLimitExceptions, (ex) => {
    if (!validOrgIds.has(ex.organizationId)) return { id: ex.id, rejectReason: 'organizationId inválido' };
    return {
      id: ex.id,
      where: { id: ex.id },
      data: {
        id: ex.id,
        organizationId: ex.organizationId,
        scope: ex.scope,
        targetKey: ex.targetKey,
        extraBudgetUsd: Number(ex.extraBudgetUsd || 0),
        grantedByUserId: ex.grantedByUserId,
        reason: ex.reason,
        expiresAt: toSafeDate(ex.expiresAt, true),
        createdAt: toSafeDate(ex.createdAt, true),
      },
    };
  });

  await importCollection('aiAccountingAlerts', 'aiAccountingAlert', flat.aiAccountingAlerts, (al) => {
    if (!validOrgIds.has(al.organizationId)) return { id: al.id, rejectReason: 'organizationId inválido' };
    return {
      id: al.id,
      where: { id: al.id },
      data: {
        id: al.id,
        organizationId: al.organizationId,
        requestId: al.requestId,
        message: al.message,
        resolved: Boolean(al.resolved),
        createdAt: toSafeDate(al.createdAt, true),
      },
    };
  });

  await importCollection('aiUsageLogs', 'aiUsageLog', flat.aiUsageLogs, (l) => {
    if (!validOrgIds.has(l.organizationId)) return { id: l.id, rejectReason: 'organizationId inválido' };
    if (l.clientId && !isClientConsistentWithOrg(l.clientId, l.organizationId)) {
      return { id: l.id, rejectReason: 'CROSS_TENANT_ORG_MISMATCH: clientId incompatível em AiUsageLog' };
    }
    return {
      id: l.id,
      where: { id: l.id },
      data: {
        id: l.id,
        requestId: l.requestId,
        idempotencyKey: l.idempotencyKey || null,
        traceId: l.traceId,
        organizationId: l.organizationId,
        userId: l.userId,
        clientId: l.clientId || null,
        billingCategory: l.billingCategory || 'internal_agency',
        department: l.department,
        action: l.action || 'general.assistant',
        purpose: l.purpose,
        providerId: l.providerId,
        modelId: l.modelId,
        effectiveProvider: l.effectiveProvider || null,
        fallbackUsed: Boolean(l.fallbackUsed),
        fallbackFrom: l.fallbackFrom || null,
        operation: l.operation,
        inputTokens: Number(l.inputTokens || 0),
        outputTokens: Number(l.outputTokens || 0),
        cachedTokens: Number(l.cachedTokens || 0),
        rawInputTokens: l.rawInputTokens ?? null,
        rawOutputTokens: l.rawOutputTokens ?? null,
        rawTotalTokens: l.rawTotalTokens ?? null,
        cachedInputTokens: l.cachedInputTokens ?? null,
        reasoningTokens: l.reasoningTokens ?? null,
        usageStatus: l.usageStatus || 'confirmed',
        inputCost: l.inputCost ?? null,
        outputCost: l.outputCost ?? null,
        cacheCost: l.cacheCost ?? null,
        reasoningCost: l.reasoningCost ?? null,
        estimatedCostUsd: l.estimatedCostUsd ?? null,
        providerReportedCostUsd: l.providerReportedCostUsd ?? null,
        costStatus: l.costStatus || 'unavailable',
        costReliable: Boolean(l.costReliable),
        currency: l.currency || 'USD',
        exchangeRate: l.exchangeRate ?? null,
        exchangeRateDate: l.exchangeRateDate || null,
        exchangeRateSource: l.exchangeRateSource || null,
        totalCostBRL: l.totalCostBRL ?? null,
        isCritical: Boolean(l.isCritical),
        responseCached: Boolean(l.responseCached),
        reconciledWithProvider: Boolean(l.reconciledWithProvider),
        reconciledAt: toSafeDate(l.reconciledAt),
        startedAt: toSafeDate(l.startedAt),
        completedAt: toSafeDate(l.completedAt),
        latencyMs: Number(l.latencyMs || 0),
        status: l.status,
        errorMessage: l.errorMessage || null,
        createdAt: toSafeDate(l.createdAt, true),
      },
    };
  });

  await importCollection('aiMemories', 'aiMemory', flat.aiMemories, (m) => {
    if (!validOrgIds.has(m.organizationId)) return { id: m.id, rejectReason: 'organizationId inválido' };
    return {
      id: m.id,
      where: { id: m.id },
      data: {
        id: m.id,
        organizationId: m.organizationId,
        projectId: m.projectId && isProjectConsistentWithOrg(m.projectId, m.organizationId) ? m.projectId : null,
        clientId: m.clientId && isClientConsistentWithOrg(m.clientId, m.organizationId) ? m.clientId : null,
        conversationId: m.conversationId,
        role: m.role,
        content: m.content,
        citations: m.citations || [],
        retentionDays: Number(m.retentionDays || 90),
        createdAt: toSafeDate(m.createdAt, true),
      },
    };
  });

  await importCollection('aiKnowledgeDocs', 'aiKnowledgeDoc', flat.aiKnowledgeDocs, (k) => {
    if (!validOrgIds.has(k.organizationId)) return { id: k.id, rejectReason: 'organizationId inválido' };
    return {
      id: k.id,
      where: { id: k.id },
      data: {
        id: k.id,
        organizationId: k.organizationId,
        projectId: k.projectId && isProjectConsistentWithOrg(k.projectId, k.organizationId) ? k.projectId : null,
        clientId: k.clientId && isClientConsistentWithOrg(k.clientId, k.organizationId) ? k.clientId : null,
        title: k.title,
        content: k.content,
        tags: k.tags || [],
        createdAt: toSafeDate(k.createdAt, true),
      },
    };
  });

    // Post-import verification: reconcile target PostgreSQL counts against expected imported totals
    const verificationPairs: Array<[string, string]> = [
      ['organizations', 'organization'],
      ['users', 'user'],
      ['clients', 'client'],
      ['commercialPlans', 'commercialPlan'],
      ['leads', 'lead'],
      ['opportunities', 'opportunity'],
      ['proposals', 'proposal'],
      ['contracts', 'contract'],
      ['receivables', 'receivable'],
      ['payables', 'payable'],
      ['projects', 'project'],
      ['tasks', 'task'],
      ['webPages', 'webPage'],
      ['aiProviders', 'aiProviderConfig'],
      ['aiModels', 'aiModel'],
      ['aiRoutingRules', 'aiRoutingRule'],
      ['aiUsageLogs', 'aiUsageLog'],
    ];

    await runWithRlsMigrationContext(async (tx) => {
      const targetCounts: Record<string, number> = {};
      const mismatches: string[] = [];
      for (const [entityName, delegateName] of verificationPairs) {
        const delegate = tx[delegateName] as UpsertDelegate | undefined;
        if (delegate && typeof delegate.count === 'function') {
          const dbCount = await delegate.count();
          targetCounts[entityName] = dbCount;
          const summary = baseReport.entitySummary[entityName];
          const expectedValid = summary ? summary.found - summary.rejected : 0;
          if (dbCount < expectedValid) {
            mismatches.push(`${entityName}: esperado >= ${expectedValid}, encontrado ${dbCount} no PostgreSQL`);
          }
        }
      }
      baseReport.postImportVerification = {
        executed: true,
        verified: mismatches.length === 0,
        targetCounts,
        mismatches,
      };
    });
  };

  if (options.atomic && typeof prismaClient.$transaction === 'function') {
    try {
      await prismaClient.$transaction(
        async (tx: MigrationPrismaLike) => {
          if (typeof tx.$executeRaw === 'function') {
            await tx.$executeRaw`SELECT set_config('app.is_super_admin', 'true', true)`;
            baseReport.rlsSuperAdminContextApplied = true;
          }
          activeAtomicTx = tx;
          try {
            await executeAllCollections();
          } finally {
            activeAtomicTx = null;
          }
        },
        { maxWait: 15_000, timeout: 120_000 }
      );
      saveCheckpoint();
    } catch {
      baseReport.rolledBack = true;
      baseReport.recordsImported = 0;
      baseReport.recordsUpdated = 0;
      baseReport.status = 'FAILED_INTEGRITY';
    }
  } else {
    await executeAllCollections();
  }

  return finalizeReport(baseReport);
}

// CLI entry point:
// `npx tsx scripts/migrate-json-to-postgres.ts [--backup] [--dry-run] [--atomic] [--resume] [--report <path>] [--summary] [--rollback <path>]`
const isDirectRun = process.argv[1] && path.resolve(process.argv[1]).endsWith('migrate-json-to-postgres.ts');
if (isDirectRun) {
  (async () => {
    const dbPath = path.resolve(process.cwd(), 'database/data/ner-db.json');
    const rollbackIdx = process.argv.indexOf('--rollback');
    if (rollbackIdx !== -1 && process.argv[rollbackIdx + 1]) {
      const res = rollbackFromBackup(path.resolve(process.argv[rollbackIdx + 1]), dbPath);
      console.log(JSON.stringify({ action: 'rollback', ...res }, null, 2));
      return;
    }

    const dryRun = process.argv.includes('--dry-run');
    const atomic = process.argv.includes('--atomic');
    const reportIdx = process.argv.indexOf('--report');
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const reportPath =
      reportIdx !== -1 && process.argv[reportIdx + 1]
        ? path.resolve(process.cwd(), process.argv[reportIdx + 1])
        : !dryRun
          ? path.resolve(process.cwd(), `database/backups/migration-report-${stamp}.json`)
          : undefined;

    const report = await migrateJsonToPostgres(dbPath, {
      createBackup: process.argv.includes('--backup') || !dryRun,
      dryRun,
      atomic,
      resume: process.argv.includes('--resume'),
      checkpointPath: path.resolve(process.cwd(), 'database/backups/migrate-json-checkpoint.json'),
      reportPath,
      logger: process.argv.includes('--quiet') ? undefined : (line) => console.error(line),
    });

    if (process.argv.includes('--summary')) {
      console.log(formatMigrationSummary(report));
    } else {
      console.log(JSON.stringify(report, null, 2));
    }

    await disconnectDatabase();
    if (report.status === 'FAILED_INTEGRITY' || report.rolledBack) {
      process.exit(1);
    }
  })().catch(async (err) => {
    console.error('[NER-MIGRATE] Error:', err?.message || err);
    await disconnectDatabase();
    process.exit(1);
  });
}
