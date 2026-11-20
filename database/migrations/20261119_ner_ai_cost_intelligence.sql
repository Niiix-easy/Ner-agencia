-- Non-destructive migration for NER AI COST INTELLIGENCE
-- Preserves all existing tables, AI providers, routing rules, and usage logs.

ALTER TABLE "AiModel"
  ADD COLUMN IF NOT EXISTS "cacheInputCostPer1M" DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS "reasoningCostPer1M" DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS "currency" TEXT NOT NULL DEFAULT 'USD',
  ADD COLUMN IF NOT EXISTS "effectiveFrom" TEXT,
  ADD COLUMN IF NOT EXISTS "priceSource" TEXT,
  ADD COLUMN IF NOT EXISTS "updatedAt" TIMESTAMP(3);

ALTER TABLE "AiCostPolicy"
  ADD COLUMN IF NOT EXISTS "alertThresholds" JSONB NOT NULL DEFAULT '[50,75,90,100]'::jsonb,
  ADD COLUMN IF NOT EXISTS "onExceedAction" TEXT NOT NULL DEFAULT 'block_non_essential',
  ADD COLUMN IF NOT EXISTS "providerLimitsUsd" JSONB,
  ADD COLUMN IF NOT EXISTS "modelLimitsUsd" JSONB,
  ADD COLUMN IF NOT EXISTS "actionLimitsUsd" JSONB,
  ADD COLUMN IF NOT EXISTS "restrictedActions" JSONB;

ALTER TABLE "AiUsageLog"
  ADD COLUMN IF NOT EXISTS "idempotencyKey" TEXT,
  ADD COLUMN IF NOT EXISTS "billingCategory" TEXT NOT NULL DEFAULT 'internal_agency',
  ADD COLUMN IF NOT EXISTS "action" TEXT NOT NULL DEFAULT 'general.assistant',
  ADD COLUMN IF NOT EXISTS "rawInputTokens" INTEGER,
  ADD COLUMN IF NOT EXISTS "rawOutputTokens" INTEGER,
  ADD COLUMN IF NOT EXISTS "rawTotalTokens" INTEGER,
  ADD COLUMN IF NOT EXISTS "cachedInputTokens" INTEGER,
  ADD COLUMN IF NOT EXISTS "reasoningTokens" INTEGER,
  ADD COLUMN IF NOT EXISTS "usageStatus" TEXT NOT NULL DEFAULT 'confirmed',
  ADD COLUMN IF NOT EXISTS "inputCost" DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS "outputCost" DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS "cacheCost" DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS "reasoningCost" DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS "costStatus" TEXT NOT NULL DEFAULT 'unavailable',
  ADD COLUMN IF NOT EXISTS "currency" TEXT NOT NULL DEFAULT 'USD',
  ADD COLUMN IF NOT EXISTS "exchangeRate" DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS "exchangeRateDate" TEXT,
  ADD COLUMN IF NOT EXISTS "exchangeRateSource" TEXT,
  ADD COLUMN IF NOT EXISTS "totalCostBRL" DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS "isCritical" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "responseCached" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "reconciledWithProvider" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "reconciledAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "startedAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "completedAt" TIMESTAMP(3);

CREATE UNIQUE INDEX IF NOT EXISTS "AiUsageLog_idempotencyKey_key" ON "AiUsageLog"("idempotencyKey") WHERE "idempotencyKey" IS NOT NULL;
CREATE INDEX IF NOT EXISTS "AiUsageLog_dept_action_status_idx" ON "AiUsageLog"("department", "action", "status");
CREATE INDEX IF NOT EXISTS "AiUsageLog_provider_model_idx" ON "AiUsageLog"("providerId", "modelId");
CREATE INDEX IF NOT EXISTS "AiUsageLog_client_billing_idx" ON "AiUsageLog"("clientId", "billingCategory");

CREATE TABLE IF NOT EXISTS "AiActionCatalog" (
  "id" TEXT PRIMARY KEY,
  "department" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "purpose" TEXT NOT NULL,
  "description" TEXT,
  "isCritical" BOOLEAN NOT NULL DEFAULT false,
  "cacheable" BOOLEAN NOT NULL DEFAULT false,
  "isSystem" BOOLEAN NOT NULL DEFAULT true,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "AiActionCatalog_department_idx" ON "AiActionCatalog"("department");

CREATE TABLE IF NOT EXISTS "AiExchangeRate" (
  "id" TEXT PRIMARY KEY DEFAULT 'USD-BRL',
  "baseCurrency" TEXT NOT NULL DEFAULT 'USD',
  "targetCurrency" TEXT NOT NULL DEFAULT 'BRL',
  "rate" DOUBLE PRECISION NOT NULL,
  "rateDate" TEXT NOT NULL,
  "source" TEXT NOT NULL,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS "AiLimitException" (
  "id" TEXT PRIMARY KEY,
  "organizationId" TEXT NOT NULL,
  "scope" TEXT NOT NULL,
  "targetKey" TEXT NOT NULL,
  "extraBudgetUsd" DOUBLE PRECISION NOT NULL,
  "grantedByUserId" TEXT NOT NULL,
  "reason" TEXT NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "AiLimitException_org_scope_idx" ON "AiLimitException"("organizationId", "scope", "targetKey");

CREATE TABLE IF NOT EXISTS "AiAccountingAlert" (
  "id" TEXT PRIMARY KEY,
  "organizationId" TEXT NOT NULL,
  "requestId" TEXT NOT NULL,
  "message" TEXT NOT NULL,
  "resolved" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "AiAccountingAlert_org_resolved_idx" ON "AiAccountingAlert"("organizationId", "resolved");

CREATE TABLE IF NOT EXISTS "AiUsageAggregation" (
  "id" TEXT PRIMARY KEY,
  "organizationId" TEXT NOT NULL,
  "dateKey" TEXT NOT NULL,
  "department" TEXT NOT NULL,
  "action" TEXT NOT NULL,
  "providerId" TEXT NOT NULL,
  "modelId" TEXT NOT NULL,
  "requestsCount" INTEGER NOT NULL DEFAULT 0,
  "inputTokens" INTEGER NOT NULL DEFAULT 0,
  "outputTokens" INTEGER NOT NULL DEFAULT 0,
  "totalCostUsd" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "totalCostBrl" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX IF NOT EXISTS "AiUsageAggregation_uniq_idx"
  ON "AiUsageAggregation"("organizationId", "dateKey", "department", "action", "providerId", "modelId");
