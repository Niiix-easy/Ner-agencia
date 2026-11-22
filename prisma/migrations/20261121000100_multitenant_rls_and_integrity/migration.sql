-- ==============================================================================
-- NER AGENCY OS & NER AI CENTER — Migration 20261121000100
-- Multi-Tenant Row Level Security (RLS), Financial Constraints & Cross-Org Guards
-- ==============================================================================
-- Non-destructive & idempotent SQL migration.
-- Rollback strategy: DROP POLICY IF EXISTS ... / ALTER TABLE ... DISABLE ROW LEVEL SECURITY.

-- 1. Safe session context helpers (transaction-local via SET LOCAL inside Prisma $transaction)
CREATE OR REPLACE FUNCTION ner_current_org_id() RETURNS TEXT AS $$
  SELECT NULLIF(current_setting('app.current_organization_id', true), '');
$$ LANGUAGE SQL STABLE;

CREATE OR REPLACE FUNCTION ner_current_client_id() RETURNS TEXT AS $$
  SELECT NULLIF(current_setting('app.current_client_id', true), '');
$$ LANGUAGE SQL STABLE;

CREATE OR REPLACE FUNCTION ner_is_super_admin() RETURNS BOOLEAN AS $$
  SELECT COALESCE(current_setting('app.is_super_admin', true), 'false') = 'true';
$$ LANGUAGE SQL STABLE;

-- 2. Financial & commercial non-negative CHECK constraints (idempotent)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_receivable_non_negative') THEN
    ALTER TABLE "Receivable"
      ADD CONSTRAINT chk_receivable_non_negative
      CHECK ("amount" >= 0 AND "paidAmount" >= 0 AND "mediaBudget" >= 0);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_payable_non_negative') THEN
    ALTER TABLE "Payable"
      ADD CONSTRAINT chk_payable_non_negative
      CHECK ("amount" >= 0);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_commission_non_negative') THEN
    ALTER TABLE "Commission"
      ADD CONSTRAINT chk_commission_non_negative
      CHECK ("baseAmount" >= 0 AND "percentage" >= 0 AND "commissionValue" >= 0);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_proposal_non_negative') THEN
    ALTER TABLE "Proposal"
      ADD CONSTRAINT chk_proposal_non_negative
      CHECK ("setupValue" >= 0 AND "recurringValue" >= 0 AND "discountValue" >= 0 AND "totalValue" >= 0);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_task_valid_status') THEN
    ALTER TABLE "Task"
      ADD CONSTRAINT chk_task_valid_status
      CHECK ("status" IN ('Backlog', 'A fazer', 'Em andamento', 'Em revisão', 'Concluída'));
  END IF;
END $$;

-- 3. Cross-organization FK integrity trigger (prevents org A record referencing org B client/project)
CREATE OR REPLACE FUNCTION ner_enforce_same_org_client() RETURNS TRIGGER AS $$
DECLARE
  v_client_org TEXT;
BEGIN
  IF NEW."clientId" IS NOT NULL THEN
    SELECT "organizationId" INTO v_client_org FROM "Client" WHERE "id" = NEW."clientId";
    IF v_client_org IS NULL OR v_client_org <> NEW."organizationId" THEN
      RAISE EXCEPTION 'CROSS_TENANT_VIOLATION: clientId % does not belong to organizationId %', NEW."clientId", NEW."organizationId"
        USING ERRCODE = '23514';
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION ner_enforce_same_org_project() RETURNS TRIGGER AS $$
DECLARE
  v_project_org TEXT;
BEGIN
  IF NEW."projectId" IS NOT NULL THEN
    SELECT "organizationId" INTO v_project_org FROM "Project" WHERE "id" = NEW."projectId";
    IF v_project_org IS NULL OR v_project_org <> NEW."organizationId" THEN
      RAISE EXCEPTION 'CROSS_TENANT_VIOLATION: projectId % does not belong to organizationId %', NEW."projectId", NEW."organizationId"
        USING ERRCODE = '23514';
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DO $$
DECLARE
  tbl TEXT;
BEGIN
  FOREACH tbl IN ARRAY ARRAY[
    'User', 'Opportunity', 'Proposal', 'Contract', 'Receivable',
    'Project', 'Briefing', 'Approval', 'CreativeAsset', 'AdAccount',
    'TrackingEvent', 'WebPage', 'Ticket', 'StrategyPlan', 'DeliveryHandoff'
  ]
  LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS trg_same_org_client_%s ON %I;', lower(tbl), tbl);
    EXECUTE format(
      'CREATE TRIGGER trg_same_org_client_%s BEFORE INSERT OR UPDATE ON %I FOR EACH ROW EXECUTE FUNCTION ner_enforce_same_org_client();',
      lower(tbl), tbl
    );
  END LOOP;

  FOREACH tbl IN ARRAY ARRAY[
    'Briefing', 'Task', 'Deliverable', 'Approval', 'TimeEntry',
    'CreativeAsset', 'WebPage', 'StrategyPlan', 'QaCheckItem', 'LaunchChecklistItem', 'DeliveryHandoff'
  ]
  LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS trg_same_org_project_%s ON %I;', lower(tbl), tbl);
    EXECUTE format(
      'CREATE TRIGGER trg_same_org_project_%s BEFORE INSERT OR UPDATE ON %I FOR EACH ROW EXECUTE FUNCTION ner_enforce_same_org_project();',
      lower(tbl), tbl
    );
  END LOOP;
END $$;

-- 4. Enable PostgreSQL Row Level Security (RLS) on all organization-scoped tables
DO $$
DECLARE
  tbl TEXT;
  policy_name TEXT;
BEGIN
  FOREACH tbl IN ARRAY ARRAY[
    'User', 'Role', 'OrganizationMember', 'Invitation', 'Session',
    'Client', 'Lead', 'Opportunity', 'Proposal', 'Contract',
    'Receivable', 'Payable', 'Commission',
    'Project', 'Briefing', 'Task', 'Deliverable', 'Approval', 'TimeEntry',
    'CreativeAsset', 'StoredAsset', 'WebPage',
    'AdAccount', 'AdIntegrationCredential', 'TrackingEvent',
    'Workflow', 'WorkflowExecution', 'AuditLog',
    'Ticket', 'Incident', 'Notification',
    'StrategyPlan', 'QaCheckItem', 'LaunchChecklistItem', 'DeliveryHandoff',
    'Subscription', 'Invoice', 'Payment',
    'AiPromptTemplate', 'AiCostPolicy', 'AiKnowledgeDoc', 'AiMemory',
    'AiLimitException', 'AiAccountingAlert', 'AiUsageAggregation', 'AiUsageLog'
  ]
  LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY;', tbl);
    policy_name := 'rls_tenant_isolation_' || lower(tbl);
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I;', policy_name, tbl);
    EXECUTE format(
      'CREATE POLICY %I ON %I USING (ner_is_super_admin() OR "organizationId" = ner_current_org_id()) WITH CHECK (ner_is_super_admin() OR "organizationId" = ner_current_org_id());',
      policy_name, tbl
    );
  END LOOP;
END $$;

-- 5. Client-scoped extra isolation policy for Receivable (Cliente sees ONLY own clientId)
DROP POLICY IF EXISTS rls_client_isolation_receivable ON "Receivable";
CREATE POLICY rls_client_isolation_receivable ON "Receivable"
  AS RESTRICTIVE
  FOR SELECT
  USING (
    ner_is_super_admin()
    OR ner_current_client_id() IS NULL
    OR "clientId" = ner_current_client_id()
  );
