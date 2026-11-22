-- NER AGENCY OS & NER AI CENTER — Versioned PostgreSQL Migration 0001
-- Non-destructive, idempotent DDL creating the 15 previously missing entities + P1-P3 production tables,
-- foreign keys, unique constraints, and composite indexes matching database/schema/schema.prisma.

BEGIN;

CREATE TABLE IF NOT EXISTS "PasswordResetToken" (
  "id" TEXT PRIMARY KEY,
  "userId" TEXT NOT NULL REFERENCES "User"("id") ON DELETE CASCADE,
  "tokenHash" TEXT NOT NULL UNIQUE,
  "expiresAt" TIMESTAMPTZ NOT NULL,
  "usedAt" TIMESTAMPTZ,
  "requestedIp" TEXT,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS "idx_password_reset_user_exp" ON "PasswordResetToken"("userId", "expiresAt");

CREATE TABLE IF NOT EXISTS "Receivable" (
  "id" TEXT PRIMARY KEY,
  "organizationId" TEXT NOT NULL REFERENCES "Organization"("id") ON DELETE CASCADE,
  "clientId" TEXT NOT NULL REFERENCES "Client"("id"),
  "clientName" TEXT NOT NULL,
  "contractId" TEXT REFERENCES "Contract"("id") ON DELETE SET NULL,
  "description" TEXT NOT NULL,
  "amount" DOUBLE PRECISION NOT NULL,
  "paidAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "mediaBudget" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "dueDate" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'Pendente',
  "paymentMethod" TEXT,
  "paymentRef" TEXT,
  "paidAt" TIMESTAMPTZ,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS "idx_receivable_org_status_due" ON "Receivable"("organizationId", "status", "dueDate");
CREATE INDEX IF NOT EXISTS "idx_receivable_org_client" ON "Receivable"("organizationId", "clientId");

CREATE TABLE IF NOT EXISTS "Payable" (
  "id" TEXT PRIMARY KEY,
  "organizationId" TEXT NOT NULL REFERENCES "Organization"("id") ON DELETE CASCADE,
  "supplier" TEXT NOT NULL,
  "description" TEXT NOT NULL,
  "category" TEXT NOT NULL,
  "amount" DOUBLE PRECISION NOT NULL,
  "dueDate" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'Pendente',
  "paidAt" TIMESTAMPTZ,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS "idx_payable_org_status_due" ON "Payable"("organizationId", "status", "dueDate");

CREATE TABLE IF NOT EXISTS "Commission" (
  "id" TEXT PRIMARY KEY,
  "organizationId" TEXT NOT NULL REFERENCES "Organization"("id") ON DELETE CASCADE,
  "responsible" TEXT NOT NULL,
  "clientName" TEXT NOT NULL,
  "contractId" TEXT REFERENCES "Contract"("id") ON DELETE SET NULL,
  "baseAmount" DOUBLE PRECISION NOT NULL,
  "percentage" DOUBLE PRECISION NOT NULL,
  "commissionValue" DOUBLE PRECISION NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'Aguardando recebimento',
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS "idx_commission_org_status" ON "Commission"("organizationId", "status");

CREATE TABLE IF NOT EXISTS "Briefing" (
  "id" TEXT PRIMARY KEY,
  "organizationId" TEXT NOT NULL REFERENCES "Organization"("id") ON DELETE CASCADE,
  "projectId" TEXT NOT NULL REFERENCES "Project"("id") ON DELETE CASCADE,
  "clientId" TEXT NOT NULL REFERENCES "Client"("id"),
  "title" TEXT NOT NULL,
  "objective" TEXT NOT NULL,
  "targetAudience" TEXT NOT NULL,
  "offerDetails" TEXT,
  "status" TEXT NOT NULL DEFAULT 'Pendente',
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS "idx_briefing_org_project" ON "Briefing"("organizationId", "projectId");

CREATE TABLE IF NOT EXISTS "TimeEntry" (
  "id" TEXT PRIMARY KEY,
  "organizationId" TEXT NOT NULL REFERENCES "Organization"("id") ON DELETE CASCADE,
  "projectId" TEXT NOT NULL REFERENCES "Project"("id") ON DELETE CASCADE,
  "taskId" TEXT REFERENCES "Task"("id") ON DELETE SET NULL,
  "userId" TEXT NOT NULL REFERENCES "User"("id"),
  "description" TEXT NOT NULL,
  "duration" DOUBLE PRECISION NOT NULL,
  "billable" BOOLEAN NOT NULL DEFAULT TRUE,
  "date" TEXT NOT NULL,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS "idx_timeentry_org_project_date" ON "TimeEntry"("organizationId", "projectId", "date");

CREATE TABLE IF NOT EXISTS "CreativeAsset" (
  "id" TEXT PRIMARY KEY,
  "organizationId" TEXT NOT NULL REFERENCES "Organization"("id") ON DELETE CASCADE,
  "clientId" TEXT NOT NULL REFERENCES "Client"("id"),
  "projectId" TEXT REFERENCES "Project"("id") ON DELETE SET NULL,
  "name" TEXT NOT NULL,
  "clientName" TEXT NOT NULL,
  "format" TEXT NOT NULL,
  "platform" TEXT NOT NULL,
  "type" TEXT NOT NULL,
  "version" TEXT NOT NULL DEFAULT 'v1.0',
  "status" TEXT NOT NULL DEFAULT 'Em Revisão',
  "usageRights" TEXT NOT NULL DEFAULT 'Próprio',
  "scriptSummary" TEXT,
  "fileAssetId" TEXT,
  "archivedAt" TIMESTAMPTZ,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS "idx_creative_org_client_status" ON "CreativeAsset"("organizationId", "clientId", "status");

CREATE TABLE IF NOT EXISTS "AdAccount" (
  "id" TEXT PRIMARY KEY,
  "organizationId" TEXT NOT NULL REFERENCES "Organization"("id") ON DELETE CASCADE,
  "clientId" TEXT NOT NULL REFERENCES "Client"("id"),
  "platform" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "externalAccountId" TEXT NOT NULL,
  "connectionStatus" TEXT NOT NULL DEFAULT 'Pendente de Credenciais',
  "spend" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "impressions" INTEGER NOT NULL DEFAULT 0,
  "clicks" INTEGER NOT NULL DEFAULT 0,
  "conversions" INTEGER NOT NULL DEFAULT 0,
  "roas" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "cpa" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "dailyLimit" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "lastSyncAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE ("organizationId", "platform", "externalAccountId")
);

CREATE TABLE IF NOT EXISTS "TrackingEvent" (
  "id" TEXT PRIMARY KEY,
  "organizationId" TEXT NOT NULL REFERENCES "Organization"("id") ON DELETE CASCADE,
  "clientId" TEXT NOT NULL REFERENCES "Client"("id"),
  "eventId" TEXT NOT NULL,
  "eventName" TEXT NOT NULL,
  "source" TEXT NOT NULL,
  "utmCampaign" TEXT,
  "value" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "currency" TEXT NOT NULL DEFAULT 'BRL',
  "confirmedByPayment" BOOLEAN NOT NULL DEFAULT FALSE,
  "deduplicatedCount" INTEGER NOT NULL DEFAULT 1,
  "dispatchStatus" TEXT NOT NULL DEFAULT 'recorded',
  "timestamp" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE ("organizationId", "eventId")
);
CREATE INDEX IF NOT EXISTS "idx_tracking_org_ts" ON "TrackingEvent"("organizationId", "timestamp");

CREATE TABLE IF NOT EXISTS "Workflow" (
  "id" TEXT PRIMARY KEY,
  "organizationId" TEXT NOT NULL REFERENCES "Organization"("id") ON DELETE CASCADE,
  "name" TEXT NOT NULL,
  "category" TEXT NOT NULL,
  "trigger" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'Ativo',
  "executions" INTEGER NOT NULL DEFAULT 0,
  "lastRunAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "config" JSONB,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS "WebPage" (
  "id" TEXT PRIMARY KEY,
  "organizationId" TEXT NOT NULL REFERENCES "Organization"("id") ON DELETE CASCADE,
  "clientId" TEXT NOT NULL REFERENCES "Client"("id"),
  "projectId" TEXT REFERENCES "Project"("id") ON DELETE SET NULL,
  "title" TEXT NOT NULL,
  "slug" TEXT NOT NULL UNIQUE,
  "segment" TEXT NOT NULL,
  "pageType" TEXT NOT NULL,
  "domain" TEXT NOT NULL,
  "sslStatus" TEXT NOT NULL DEFAULT 'Pendente DNS',
  "status" TEXT NOT NULL DEFAULT 'Rascunho',
  "version" TEXT NOT NULL DEFAULT 'v1.0',
  "seoTitle" TEXT NOT NULL,
  "seoDescription" TEXT NOT NULL,
  "whatsappNumber" TEXT,
  "checkoutUrl" TEXT,
  "pixelConfigured" BOOLEAN NOT NULL DEFAULT FALSE,
  "sections" JSONB NOT NULL,
  "visits" INTEGER NOT NULL DEFAULT 0,
  "leadsCaptured" INTEGER NOT NULL DEFAULT 0,
  "archivedAt" TIMESTAMPTZ,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS "Ticket" (
  "id" TEXT PRIMARY KEY,
  "organizationId" TEXT NOT NULL REFERENCES "Organization"("id") ON DELETE CASCADE,
  "clientId" TEXT NOT NULL REFERENCES "Client"("id"),
  "category" TEXT NOT NULL,
  "priority" TEXT NOT NULL DEFAULT 'Normal',
  "subject" TEXT NOT NULL,
  "description" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'Aberto',
  "assigneeId" TEXT,
  "assigneeName" TEXT,
  "replies" JSONB,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS "idx_ticket_org_status_priority" ON "Ticket"("organizationId", "status", "priority");

CREATE TABLE IF NOT EXISTS "Incident" (
  "id" TEXT PRIMARY KEY,
  "organizationId" TEXT NOT NULL REFERENCES "Organization"("id") ON DELETE CASCADE,
  "category" TEXT NOT NULL,
  "severity" TEXT NOT NULL,
  "service" TEXT NOT NULL,
  "description" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'Aberto',
  "assigneeId" TEXT,
  "assigneeName" TEXT,
  "resolutionPlan" TEXT,
  "history" JSONB,
  "resolvedAt" TIMESTAMPTZ,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS "AiGlobalCostPolicy" (
  "id" TEXT PRIMARY KEY DEFAULT 'global',
  "dailyLimitUsd" DOUBLE PRECISION NOT NULL DEFAULT 150,
  "monthlyLimitUsd" DOUBLE PRECISION NOT NULL DEFAULT 3000,
  "alertThresholds" JSONB NOT NULL DEFAULT '[50,75,90,100]'::jsonb,
  "thresholdRules" JSONB,
  "onExceedAction" TEXT NOT NULL DEFAULT 'block_non_essential',
  "updatedBy" TEXT,
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS "AiKnowledgeDoc" (
  "id" TEXT PRIMARY KEY,
  "organizationId" TEXT NOT NULL REFERENCES "Organization"("id") ON DELETE CASCADE,
  "projectId" TEXT,
  "clientId" TEXT,
  "title" TEXT NOT NULL,
  "content" TEXT NOT NULL,
  "tags" JSONB NOT NULL DEFAULT '[]'::jsonb,
  "embeddingModel" TEXT,
  "embeddingJson" JSONB,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS "AiMemory" (
  "id" TEXT PRIMARY KEY,
  "organizationId" TEXT NOT NULL REFERENCES "Organization"("id") ON DELETE CASCADE,
  "projectId" TEXT,
  "clientId" TEXT,
  "conversationId" TEXT NOT NULL,
  "role" TEXT NOT NULL,
  "content" TEXT NOT NULL,
  "citations" JSONB NOT NULL DEFAULT '[]'::jsonb,
  "retentionDays" INTEGER NOT NULL DEFAULT 90,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS "idx_aimemory_org_conv" ON "AiMemory"("organizationId", "conversationId", "createdAt");

CREATE TABLE IF NOT EXISTS "StoredAsset" (
  "id" TEXT PRIMARY KEY,
  "organizationId" TEXT NOT NULL REFERENCES "Organization"("id") ON DELETE CASCADE,
  "clientId" TEXT,
  "projectId" TEXT,
  "module" TEXT NOT NULL,
  "fileName" TEXT NOT NULL,
  "mimeType" TEXT NOT NULL,
  "sizeBytes" INTEGER NOT NULL,
  "storageDriver" TEXT NOT NULL DEFAULT 'local',
  "storageKey" TEXT NOT NULL UNIQUE,
  "sha256" TEXT NOT NULL,
  "uploadedById" TEXT NOT NULL,
  "deletedAt" TIMESTAMPTZ,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS "StrategyPlan" (
  "id" TEXT PRIMARY KEY,
  "organizationId" TEXT NOT NULL REFERENCES "Organization"("id") ON DELETE CASCADE,
  "clientId" TEXT NOT NULL REFERENCES "Client"("id"),
  "projectId" TEXT REFERENCES "Project"("id") ON DELETE SET NULL,
  "title" TEXT NOT NULL,
  "quarter" TEXT NOT NULL,
  "objective" TEXT NOT NULL,
  "positioning" TEXT,
  "channels" JSONB NOT NULL DEFAULT '[]'::jsonb,
  "okrs" JSONB NOT NULL DEFAULT '[]'::jsonb,
  "status" TEXT NOT NULL DEFAULT 'Ativo',
  "createdById" TEXT NOT NULL,
  "archivedAt" TIMESTAMPTZ,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS "QaCheckItem" (
  "id" TEXT PRIMARY KEY,
  "organizationId" TEXT NOT NULL REFERENCES "Organization"("id") ON DELETE CASCADE,
  "projectId" TEXT REFERENCES "Project"("id") ON DELETE SET NULL,
  "title" TEXT NOT NULL,
  "category" TEXT NOT NULL,
  "severity" TEXT NOT NULL DEFAULT 'Média',
  "status" TEXT NOT NULL DEFAULT 'Pendente',
  "assigneeName" TEXT,
  "evidence" TEXT,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS "LaunchChecklistItem" (
  "id" TEXT PRIMARY KEY,
  "organizationId" TEXT NOT NULL REFERENCES "Organization"("id") ON DELETE CASCADE,
  "projectId" TEXT REFERENCES "Project"("id") ON DELETE SET NULL,
  "domain" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "required" BOOLEAN NOT NULL DEFAULT TRUE,
  "status" TEXT NOT NULL DEFAULT 'Pendente',
  "verifiedBy" TEXT,
  "verifiedAt" TIMESTAMPTZ,
  "notes" TEXT,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS "DeliveryHandoff" (
  "id" TEXT PRIMARY KEY,
  "organizationId" TEXT NOT NULL REFERENCES "Organization"("id") ON DELETE CASCADE,
  "projectId" TEXT NOT NULL REFERENCES "Project"("id") ON DELETE CASCADE,
  "clientId" TEXT NOT NULL REFERENCES "Client"("id"),
  "title" TEXT NOT NULL,
  "version" TEXT NOT NULL DEFAULT 'v1.0',
  "summary" TEXT NOT NULL,
  "deliverablesList" JSONB NOT NULL DEFAULT '[]'::jsonb,
  "acceptanceTerms" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'Aguardando aceite',
  "acceptedByName" TEXT,
  "acceptedByUserId" TEXT,
  "acceptedAt" TIMESTAMPTZ,
  "signatureHash" TEXT,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMIT;
