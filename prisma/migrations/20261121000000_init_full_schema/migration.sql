-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateTable
CREATE TABLE "Organization" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "legalName" TEXT NOT NULL,
    "document" TEXT,
    "slug" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'Ativo',
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Organization_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "clientId" TEXT,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'Criativo',
    "avatarUrl" TEXT,
    "googleSub" TEXT,
    "authProvider" TEXT NOT NULL DEFAULT 'local',
    "status" TEXT NOT NULL DEFAULT 'Ativo',
    "emailVerifiedAt" TIMESTAMP(3),
    "deletedAt" TIMESTAMP(3),
    "createdBy" TEXT,
    "updatedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PasswordResetToken" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "requestedIp" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PasswordResetToken_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Role" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "isSystem" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Role_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Permission" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "module" TEXT NOT NULL,

    CONSTRAINT "Permission_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RolePermission" (
    "id" TEXT NOT NULL,
    "roleId" TEXT NOT NULL,
    "permissionId" TEXT NOT NULL,

    CONSTRAINT "RolePermission_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrganizationMember" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "roleId" TEXT NOT NULL,
    "clientId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'Ativo',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OrganizationMember_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Invitation" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "clientId" TEXT,
    "tokenHash" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'Pendente',
    "invitedByUserId" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "acceptedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Invitation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Session" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Client" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "legalName" TEXT,
    "document" TEXT,
    "email" TEXT,
    "phone" TEXT,
    "website" TEXT,
    "segment" TEXT NOT NULL,
    "category" TEXT NOT NULL DEFAULT 'Pequena Empresa',
    "status" TEXT NOT NULL DEFAULT 'Ativo',
    "mrr" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "health" TEXT NOT NULL DEFAULT 'Bom',
    "manager" TEXT,
    "notes" TEXT,
    "archivedAt" TIMESTAMP(3),
    "deletedAt" TIMESTAMP(3),
    "createdBy" TEXT,
    "updatedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Client_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Lead" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "phone" TEXT,
    "company" TEXT NOT NULL,
    "segment" TEXT,
    "source" TEXT NOT NULL,
    "utmSource" TEXT,
    "utmCampaign" TEXT,
    "utmMedium" TEXT,
    "status" TEXT NOT NULL DEFAULT 'Novo',
    "estimatedValue" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "assignedUserId" TEXT,
    "archivedAt" TIMESTAMP(3),
    "deletedAt" TIMESTAMP(3),
    "createdBy" TEXT,
    "updatedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Lead_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Opportunity" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "clientId" TEXT,
    "leadId" TEXT,
    "name" TEXT NOT NULL,
    "stage" TEXT NOT NULL DEFAULT 'Novo lead',
    "value" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "probability" INTEGER NOT NULL DEFAULT 20,
    "responsible" TEXT NOT NULL,
    "expectedClose" TEXT,
    "history" JSONB,
    "archivedAt" TIMESTAMP(3),
    "deletedAt" TIMESTAMP(3),
    "createdBy" TEXT,
    "updatedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Opportunity_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CommercialPlan" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "targetAudience" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "serviceTemplateType" TEXT NOT NULL DEFAULT 'Landing Page',
    "setupPrice" DOUBLE PRECISION NOT NULL,
    "recurringPrice" DOUBLE PRECISION NOT NULL,
    "recurrence" TEXT NOT NULL DEFAULT 'Mensal',
    "stripePriceId" TEXT,
    "deliverables" JSONB NOT NULL,
    "limits" JSONB NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CommercialPlan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Proposal" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "planCode" TEXT,
    "setupValue" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "recurringValue" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "discountValue" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "totalValue" DOUBLE PRECISION NOT NULL,
    "conditions" TEXT,
    "status" TEXT NOT NULL DEFAULT 'Rascunho',
    "validUntil" TEXT NOT NULL,
    "responsible" TEXT NOT NULL,
    "acceptedAt" TIMESTAMP(3),
    "acceptedBy" TEXT,
    "archivedAt" TIMESTAMP(3),
    "createdBy" TEXT,
    "updatedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Proposal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Contract" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "proposalId" TEXT,
    "planCode" TEXT,
    "serviceType" TEXT NOT NULL DEFAULT 'Landing Page',
    "title" TEXT NOT NULL,
    "setupValue" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "recurringValue" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "value" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "recurrence" TEXT NOT NULL DEFAULT 'Mensal',
    "status" TEXT NOT NULL DEFAULT 'Ativo',
    "startDate" TEXT NOT NULL,
    "endDate" TEXT,
    "archivedAt" TIMESTAMP(3),
    "createdBy" TEXT,
    "updatedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Contract_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Receivable" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "clientName" TEXT NOT NULL,
    "contractId" TEXT,
    "description" TEXT NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "paidAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "mediaBudget" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "dueDate" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'Pendente',
    "paymentMethod" TEXT,
    "paymentRef" TEXT,
    "paidAt" TIMESTAMP(3),
    "deletedAt" TIMESTAMP(3),
    "createdBy" TEXT,
    "updatedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Receivable_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Payable" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "supplier" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "dueDate" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'Pendente',
    "paidAt" TIMESTAMP(3),
    "deletedAt" TIMESTAMP(3),
    "createdBy" TEXT,
    "updatedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Payable_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Commission" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "responsible" TEXT NOT NULL,
    "clientName" TEXT NOT NULL,
    "contractId" TEXT,
    "baseAmount" DOUBLE PRECISION NOT NULL,
    "percentage" DOUBLE PRECISION NOT NULL,
    "commissionValue" DOUBLE PRECISION NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'Aguardando recebimento',
    "createdBy" TEXT,
    "updatedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Commission_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Project" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "contractId" TEXT,
    "planCode" TEXT,
    "name" TEXT NOT NULL,
    "projectType" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'Planejamento',
    "priority" TEXT NOT NULL DEFAULT 'Normal',
    "startDate" TEXT NOT NULL,
    "dueDate" TEXT NOT NULL,
    "managerId" TEXT NOT NULL,
    "progress" INTEGER NOT NULL DEFAULT 0,
    "archivedAt" TIMESTAMP(3),
    "deletedAt" TIMESTAMP(3),
    "createdBy" TEXT,
    "updatedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Project_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Briefing" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "objective" TEXT NOT NULL,
    "targetAudience" TEXT NOT NULL,
    "offerDetails" TEXT,
    "status" TEXT NOT NULL DEFAULT 'Pendente',
    "createdBy" TEXT,
    "updatedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Briefing_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Task" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'A fazer',
    "priority" TEXT NOT NULL DEFAULT 'Normal',
    "assigneeId" TEXT,
    "dueDate" TEXT,
    "estimatedHours" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "actualHours" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "comments" JSONB,
    "history" JSONB,
    "createdBy" TEXT,
    "updatedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Task_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Deliverable" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'Entregável',
    "version" TEXT NOT NULL DEFAULT 'v1.0',
    "status" TEXT NOT NULL DEFAULT 'Planejado',
    "dueDate" TEXT,
    "assetUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Deliverable_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Approval" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "deliverableId" TEXT,
    "title" TEXT NOT NULL,
    "version" TEXT NOT NULL,
    "requester" TEXT NOT NULL,
    "approver" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'Pendente',
    "comment" TEXT,
    "decidedAt" TIMESTAMP(3),
    "decidedByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Approval_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TimeEntry" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "taskId" TEXT,
    "userId" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "duration" DOUBLE PRECISION NOT NULL,
    "billable" BOOLEAN NOT NULL DEFAULT true,
    "date" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TimeEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CreativeAsset" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "projectId" TEXT,
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
    "archivedAt" TIMESTAMP(3),
    "createdBy" TEXT,
    "updatedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CreativeAsset_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StoredAsset" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "clientId" TEXT,
    "projectId" TEXT,
    "module" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "storageDriver" TEXT NOT NULL DEFAULT 'local',
    "storageKey" TEXT NOT NULL,
    "sha256" TEXT NOT NULL,
    "uploadedById" TEXT NOT NULL,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StoredAsset_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WebPage" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "projectId" TEXT,
    "title" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
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
    "pixelConfigured" BOOLEAN NOT NULL DEFAULT false,
    "sections" JSONB NOT NULL,
    "visits" INTEGER NOT NULL DEFAULT 0,
    "leadsCaptured" INTEGER NOT NULL DEFAULT 0,
    "archivedAt" TIMESTAMP(3),
    "createdBy" TEXT,
    "updatedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WebPage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AdAccount" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
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
    "lastSyncAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AdAccount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AdIntegrationCredential" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "publicConfig" JSONB NOT NULL,
    "encryptedSecrets" JSONB NOT NULL,
    "secretMasks" JSONB NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDENTE',
    "lastTestedAt" TIMESTAMP(3),
    "lastTestStatus" TEXT,
    "lastTestMessage" TEXT,
    "updatedByUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AdIntegrationCredential_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TrackingEvent" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "eventName" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "utmCampaign" TEXT,
    "value" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "currency" TEXT NOT NULL DEFAULT 'BRL',
    "confirmedByPayment" BOOLEAN NOT NULL DEFAULT false,
    "deduplicatedCount" INTEGER NOT NULL DEFAULT 1,
    "dispatchStatus" TEXT NOT NULL DEFAULT 'recorded',
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TrackingEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Workflow" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "trigger" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'Ativo',
    "executions" INTEGER NOT NULL DEFAULT 0,
    "lastRunAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "config" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Workflow_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorkflowExecution" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "workflowId" TEXT NOT NULL,
    "triggerEvent" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'running',
    "durationMs" INTEGER,
    "payloadSummary" JSONB,
    "errorMessage" TEXT,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),

    CONSTRAINT "WorkflowExecution_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "resource" TEXT NOT NULL,
    "resourceId" TEXT NOT NULL,
    "metadata" JSONB,
    "ipAddress" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SystemEvent" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT,
    "category" TEXT NOT NULL,
    "severity" TEXT NOT NULL DEFAULT 'info',
    "eventCode" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SystemEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Ticket" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "priority" TEXT NOT NULL DEFAULT 'Normal',
    "subject" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'Aberto',
    "assigneeId" TEXT,
    "assigneeName" TEXT,
    "replies" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Ticket_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Incident" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "severity" TEXT NOT NULL,
    "service" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'Aberto',
    "assigneeId" TEXT,
    "assigneeName" TEXT,
    "resolutionPlan" TEXT,
    "history" JSONB,
    "resolvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Incident_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Notification" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "userId" TEXT,
    "channel" TEXT NOT NULL DEFAULT 'in_app',
    "title" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "severity" TEXT NOT NULL DEFAULT 'info',
    "readAt" TIMESTAMP(3),
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StrategyPlan" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "projectId" TEXT,
    "title" TEXT NOT NULL,
    "quarter" TEXT NOT NULL,
    "objective" TEXT NOT NULL,
    "positioning" TEXT,
    "channels" JSONB NOT NULL,
    "okrs" JSONB NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'Ativo',
    "createdById" TEXT NOT NULL,
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StrategyPlan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "QaCheckItem" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "projectId" TEXT,
    "title" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "severity" TEXT NOT NULL DEFAULT 'Média',
    "status" TEXT NOT NULL DEFAULT 'Pendente',
    "assigneeName" TEXT,
    "evidence" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "QaCheckItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LaunchChecklistItem" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "projectId" TEXT,
    "domain" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "required" BOOLEAN NOT NULL DEFAULT true,
    "status" TEXT NOT NULL DEFAULT 'Pendente',
    "verifiedBy" TEXT,
    "verifiedAt" TIMESTAMP(3),
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LaunchChecklistItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DeliveryHandoff" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "version" TEXT NOT NULL DEFAULT 'v1.0',
    "summary" TEXT NOT NULL,
    "deliverablesList" JSONB NOT NULL,
    "acceptanceTerms" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'Aguardando aceite',
    "acceptedByName" TEXT,
    "acceptedByUserId" TEXT,
    "acceptedAt" TIMESTAMP(3),
    "signatureHash" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DeliveryHandoff_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Subscription" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "planCode" TEXT NOT NULL,
    "planName" TEXT NOT NULL,
    "provider" TEXT NOT NULL DEFAULT 'stripe',
    "externalSubId" TEXT,
    "externalCustomerId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'incomplete',
    "amountMonthly" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "currentPeriodEnd" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Subscription_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Invoice" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "subscriptionId" TEXT,
    "externalInvoiceId" TEXT,
    "amountDue" DOUBLE PRECISION NOT NULL,
    "amountPaid" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "currency" TEXT NOT NULL DEFAULT 'BRL',
    "status" TEXT NOT NULL DEFAULT 'open',
    "dueDate" TIMESTAMP(3),
    "paidAt" TIMESTAMP(3),
    "hostedInvoiceUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Invoice_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Payment" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "subscriptionId" TEXT,
    "invoiceId" TEXT,
    "provider" TEXT NOT NULL DEFAULT 'stripe',
    "externalPaymentId" TEXT,
    "amount" DOUBLE PRECISION NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'BRL',
    "status" TEXT NOT NULL DEFAULT 'pending',
    "paidAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Payment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BillingWebhookEvent" (
    "id" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "organizationId" TEXT,
    "payload" JSONB,
    "status" TEXT NOT NULL DEFAULT 'processed',
    "summary" TEXT,
    "processedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BillingWebhookEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AiProviderConfig" (
    "id" TEXT NOT NULL,
    "providerId" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "scope" TEXT NOT NULL DEFAULT 'global',
    "organizationId" TEXT,
    "requiresKey" BOOLEAN NOT NULL DEFAULT true,
    "requiresEndpoint" BOOLEAN NOT NULL DEFAULT false,
    "encryptedApiKey" TEXT,
    "keyMask" TEXT,
    "baseUrl" TEXT NOT NULL,
    "organizationHeader" TEXT,
    "projectIdHeader" TEXT,
    "defaultModel" TEXT NOT NULL,
    "rateLimitPerMin" INTEGER NOT NULL DEFAULT 60,
    "status" TEXT NOT NULL DEFAULT 'AGUARDANDO CONFIGURAÇÃO',
    "lastCheckedAt" TIMESTAMP(3),
    "lastError" TEXT,
    "capabilities" JSONB NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AiProviderConfig_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AiModel" (
    "id" TEXT NOT NULL,
    "providerId" TEXT NOT NULL,
    "modelId" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "isDefaultForProvider" BOOLEAN NOT NULL DEFAULT false,
    "priority" INTEGER NOT NULL DEFAULT 1,
    "contextWindow" INTEGER NOT NULL DEFAULT 128000,
    "maxInputTokens" INTEGER,
    "maxOutputTokens" INTEGER,
    "dailyTokenLimit" INTEGER,
    "capabilities" JSONB NOT NULL,
    "inputCostPer1M" DOUBLE PRECISION,
    "outputCostPer1M" DOUBLE PRECISION,
    "cacheInputCostPer1M" DOUBLE PRECISION,
    "reasoningCostPer1M" DOUBLE PRECISION,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "effectiveFrom" TEXT,
    "priceSource" TEXT,
    "pricingVerified" BOOLEAN NOT NULL DEFAULT false,
    "source" TEXT NOT NULL DEFAULT 'catalog',
    "lastVerifiedAt" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3),

    CONSTRAINT "AiModel_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AiRoutingRule" (
    "id" TEXT NOT NULL,
    "purpose" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "primaryProviderId" TEXT NOT NULL,
    "primaryModelId" TEXT NOT NULL,
    "fallbackProviderId" TEXT,
    "fallbackModelId" TEXT,
    "allowMoreExpensiveFallback" BOOLEAN NOT NULL DEFAULT false,
    "maxCostUsdPerRequest" DOUBLE PRECISION,
    "timeoutMs" INTEGER NOT NULL DEFAULT 30000,
    "maxRetries" INTEGER NOT NULL DEFAULT 1,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AiRoutingRule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AiPromptTemplate" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "department" TEXT NOT NULL,
    "purpose" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "systemPrompt" TEXT NOT NULL,
    "userTemplate" TEXT NOT NULL,
    "preferredProviderId" TEXT,
    "preferredModelId" TEXT,
    "temperature" DOUBLE PRECISION NOT NULL DEFAULT 0.4,
    "maxOutputTokens" INTEGER NOT NULL DEFAULT 1200,
    "history" JSONB NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AiPromptTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AiGlobalCostPolicy" (
    "id" TEXT NOT NULL DEFAULT 'global',
    "dailyLimitUsd" DOUBLE PRECISION NOT NULL DEFAULT 150,
    "monthlyLimitUsd" DOUBLE PRECISION NOT NULL DEFAULT 3000,
    "alertThresholds" JSONB NOT NULL DEFAULT '[50,75,90,100]',
    "thresholdRules" JSONB,
    "onExceedAction" TEXT NOT NULL DEFAULT 'block_non_essential',
    "updatedBy" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AiGlobalCostPolicy_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AiCostPolicy" (
    "organizationId" TEXT NOT NULL,
    "dailyLimitUsd" DOUBLE PRECISION NOT NULL DEFAULT 25,
    "monthlyLimitUsd" DOUBLE PRECISION NOT NULL DEFAULT 500,
    "userDailyLimitUsd" DOUBLE PRECISION NOT NULL DEFAULT 10,
    "alertThresholdPct" INTEGER NOT NULL DEFAULT 80,
    "alertThresholds" JSONB NOT NULL DEFAULT '[50,75,90,100]',
    "thresholdRules" JSONB,
    "blockOnExceed" BOOLEAN NOT NULL DEFAULT true,
    "onExceedAction" TEXT NOT NULL DEFAULT 'block_non_essential',
    "departmentLimitsUsd" JSONB NOT NULL,
    "providerLimitsUsd" JSONB,
    "modelLimitsUsd" JSONB,
    "actionLimitsUsd" JSONB,
    "restrictedActions" JSONB,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AiCostPolicy_pkey" PRIMARY KEY ("organizationId")
);

-- CreateTable
CREATE TABLE "AiKnowledgeDoc" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "projectId" TEXT,
    "clientId" TEXT,
    "title" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "tags" JSONB NOT NULL,
    "embeddingModel" TEXT,
    "embeddingJson" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AiKnowledgeDoc_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AiMemory" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "projectId" TEXT,
    "clientId" TEXT,
    "conversationId" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "citations" JSONB NOT NULL,
    "retentionDays" INTEGER NOT NULL DEFAULT 90,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AiMemory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AiActionCatalog" (
    "id" TEXT NOT NULL,
    "department" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "purpose" TEXT NOT NULL,
    "description" TEXT,
    "isCritical" BOOLEAN NOT NULL DEFAULT false,
    "cacheable" BOOLEAN NOT NULL DEFAULT false,
    "isSystem" BOOLEAN NOT NULL DEFAULT true,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AiActionCatalog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AiExchangeRate" (
    "id" TEXT NOT NULL DEFAULT 'USD-BRL',
    "baseCurrency" TEXT NOT NULL DEFAULT 'USD',
    "targetCurrency" TEXT NOT NULL DEFAULT 'BRL',
    "rate" DOUBLE PRECISION NOT NULL,
    "rateDate" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AiExchangeRate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AiLimitException" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "scope" TEXT NOT NULL,
    "targetKey" TEXT NOT NULL,
    "extraBudgetUsd" DOUBLE PRECISION NOT NULL,
    "grantedByUserId" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AiLimitException_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AiAccountingAlert" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "resolved" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AiAccountingAlert_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AiUsageAggregation" (
    "id" TEXT NOT NULL,
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
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AiUsageAggregation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AiUsageLog" (
    "id" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "idempotencyKey" TEXT,
    "traceId" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "clientId" TEXT,
    "billingCategory" TEXT NOT NULL DEFAULT 'internal_agency',
    "department" TEXT NOT NULL,
    "action" TEXT NOT NULL DEFAULT 'general.assistant',
    "purpose" TEXT NOT NULL,
    "providerId" TEXT NOT NULL,
    "modelId" TEXT NOT NULL,
    "effectiveProvider" TEXT,
    "fallbackUsed" BOOLEAN NOT NULL DEFAULT false,
    "fallbackFrom" TEXT,
    "operation" TEXT NOT NULL,
    "inputTokens" INTEGER NOT NULL DEFAULT 0,
    "outputTokens" INTEGER NOT NULL DEFAULT 0,
    "cachedTokens" INTEGER NOT NULL DEFAULT 0,
    "rawInputTokens" INTEGER,
    "rawOutputTokens" INTEGER,
    "rawTotalTokens" INTEGER,
    "cachedInputTokens" INTEGER,
    "reasoningTokens" INTEGER,
    "usageStatus" TEXT NOT NULL DEFAULT 'confirmed',
    "inputCost" DOUBLE PRECISION,
    "outputCost" DOUBLE PRECISION,
    "cacheCost" DOUBLE PRECISION,
    "reasoningCost" DOUBLE PRECISION,
    "estimatedCostUsd" DOUBLE PRECISION,
    "providerReportedCostUsd" DOUBLE PRECISION,
    "costStatus" TEXT NOT NULL DEFAULT 'unavailable',
    "costReliable" BOOLEAN NOT NULL DEFAULT false,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "exchangeRate" DOUBLE PRECISION,
    "exchangeRateDate" TEXT,
    "exchangeRateSource" TEXT,
    "totalCostBRL" DOUBLE PRECISION,
    "isCritical" BOOLEAN NOT NULL DEFAULT false,
    "responseCached" BOOLEAN NOT NULL DEFAULT false,
    "reconciledWithProvider" BOOLEAN NOT NULL DEFAULT false,
    "reconciledAt" TIMESTAMP(3),
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "latencyMs" INTEGER NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL,
    "errorMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AiUsageLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Organization_slug_key" ON "Organization"("slug");

-- CreateIndex
CREATE INDEX "Organization_status_idx" ON "Organization"("status");

-- CreateIndex
CREATE INDEX "Organization_deletedAt_idx" ON "Organization"("deletedAt");

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "User_googleSub_key" ON "User"("googleSub");

-- CreateIndex
CREATE INDEX "User_organizationId_status_idx" ON "User"("organizationId", "status");

-- CreateIndex
CREATE INDEX "User_organizationId_role_idx" ON "User"("organizationId", "role");

-- CreateIndex
CREATE INDEX "User_organizationId_clientId_idx" ON "User"("organizationId", "clientId");

-- CreateIndex
CREATE INDEX "User_deletedAt_idx" ON "User"("deletedAt");

-- CreateIndex
CREATE UNIQUE INDEX "PasswordResetToken_tokenHash_key" ON "PasswordResetToken"("tokenHash");

-- CreateIndex
CREATE INDEX "PasswordResetToken_userId_expiresAt_idx" ON "PasswordResetToken"("userId", "expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "Role_organizationId_name_key" ON "Role"("organizationId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "Permission_key_key" ON "Permission"("key");

-- CreateIndex
CREATE UNIQUE INDEX "RolePermission_roleId_permissionId_key" ON "RolePermission"("roleId", "permissionId");

-- CreateIndex
CREATE INDEX "OrganizationMember_userId_idx" ON "OrganizationMember"("userId");

-- CreateIndex
CREATE INDEX "OrganizationMember_organizationId_status_idx" ON "OrganizationMember"("organizationId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "OrganizationMember_organizationId_userId_key" ON "OrganizationMember"("organizationId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "Invitation_tokenHash_key" ON "Invitation"("tokenHash");

-- CreateIndex
CREATE INDEX "Invitation_organizationId_status_idx" ON "Invitation"("organizationId", "status");

-- CreateIndex
CREATE INDEX "Invitation_email_idx" ON "Invitation"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Session_tokenHash_key" ON "Session"("tokenHash");

-- CreateIndex
CREATE INDEX "Session_organizationId_userId_revokedAt_idx" ON "Session"("organizationId", "userId", "revokedAt");

-- CreateIndex
CREATE INDEX "Session_expiresAt_idx" ON "Session"("expiresAt");

-- CreateIndex
CREATE INDEX "Client_organizationId_status_idx" ON "Client"("organizationId", "status");

-- CreateIndex
CREATE INDEX "Client_organizationId_archivedAt_idx" ON "Client"("organizationId", "archivedAt");

-- CreateIndex
CREATE INDEX "Client_organizationId_deletedAt_idx" ON "Client"("organizationId", "deletedAt");

-- CreateIndex
CREATE INDEX "Lead_organizationId_status_idx" ON "Lead"("organizationId", "status");

-- CreateIndex
CREATE INDEX "Lead_organizationId_archivedAt_idx" ON "Lead"("organizationId", "archivedAt");

-- CreateIndex
CREATE INDEX "Lead_organizationId_createdAt_idx" ON "Lead"("organizationId", "createdAt");

-- CreateIndex
CREATE INDEX "Opportunity_organizationId_stage_idx" ON "Opportunity"("organizationId", "stage");

-- CreateIndex
CREATE INDEX "Opportunity_organizationId_clientId_idx" ON "Opportunity"("organizationId", "clientId");

-- CreateIndex
CREATE INDEX "Opportunity_organizationId_archivedAt_idx" ON "Opportunity"("organizationId", "archivedAt");

-- CreateIndex
CREATE UNIQUE INDEX "CommercialPlan_code_key" ON "CommercialPlan"("code");

-- CreateIndex
CREATE INDEX "CommercialPlan_category_isActive_idx" ON "CommercialPlan"("category", "isActive");

-- CreateIndex
CREATE UNIQUE INDEX "Proposal_number_key" ON "Proposal"("number");

-- CreateIndex
CREATE INDEX "Proposal_organizationId_status_idx" ON "Proposal"("organizationId", "status");

-- CreateIndex
CREATE INDEX "Proposal_organizationId_clientId_idx" ON "Proposal"("organizationId", "clientId");

-- CreateIndex
CREATE UNIQUE INDEX "Contract_number_key" ON "Contract"("number");

-- CreateIndex
CREATE INDEX "Contract_organizationId_status_idx" ON "Contract"("organizationId", "status");

-- CreateIndex
CREATE INDEX "Contract_organizationId_clientId_idx" ON "Contract"("organizationId", "clientId");

-- CreateIndex
CREATE INDEX "Receivable_organizationId_status_dueDate_idx" ON "Receivable"("organizationId", "status", "dueDate");

-- CreateIndex
CREATE INDEX "Receivable_organizationId_clientId_idx" ON "Receivable"("organizationId", "clientId");

-- CreateIndex
CREATE INDEX "Receivable_organizationId_deletedAt_idx" ON "Receivable"("organizationId", "deletedAt");

-- CreateIndex
CREATE INDEX "Payable_organizationId_status_dueDate_idx" ON "Payable"("organizationId", "status", "dueDate");

-- CreateIndex
CREATE INDEX "Payable_organizationId_category_idx" ON "Payable"("organizationId", "category");

-- CreateIndex
CREATE INDEX "Commission_organizationId_status_idx" ON "Commission"("organizationId", "status");

-- CreateIndex
CREATE INDEX "Commission_organizationId_contractId_idx" ON "Commission"("organizationId", "contractId");

-- CreateIndex
CREATE INDEX "Project_organizationId_clientId_idx" ON "Project"("organizationId", "clientId");

-- CreateIndex
CREATE INDEX "Project_organizationId_status_idx" ON "Project"("organizationId", "status");

-- CreateIndex
CREATE INDEX "Project_organizationId_archivedAt_idx" ON "Project"("organizationId", "archivedAt");

-- CreateIndex
CREATE INDEX "Briefing_organizationId_projectId_idx" ON "Briefing"("organizationId", "projectId");

-- CreateIndex
CREATE INDEX "Briefing_organizationId_clientId_idx" ON "Briefing"("organizationId", "clientId");

-- CreateIndex
CREATE INDEX "Task_organizationId_projectId_status_idx" ON "Task"("organizationId", "projectId", "status");

-- CreateIndex
CREATE INDEX "Task_organizationId_status_idx" ON "Task"("organizationId", "status");

-- CreateIndex
CREATE INDEX "Task_organizationId_assigneeId_idx" ON "Task"("organizationId", "assigneeId");

-- CreateIndex
CREATE INDEX "Deliverable_organizationId_projectId_idx" ON "Deliverable"("organizationId", "projectId");

-- CreateIndex
CREATE INDEX "Deliverable_organizationId_status_idx" ON "Deliverable"("organizationId", "status");

-- CreateIndex
CREATE INDEX "Approval_organizationId_clientId_status_idx" ON "Approval"("organizationId", "clientId", "status");

-- CreateIndex
CREATE INDEX "Approval_organizationId_projectId_idx" ON "Approval"("organizationId", "projectId");

-- CreateIndex
CREATE INDEX "TimeEntry_organizationId_projectId_date_idx" ON "TimeEntry"("organizationId", "projectId", "date");

-- CreateIndex
CREATE INDEX "TimeEntry_organizationId_userId_date_idx" ON "TimeEntry"("organizationId", "userId", "date");

-- CreateIndex
CREATE INDEX "CreativeAsset_organizationId_clientId_status_idx" ON "CreativeAsset"("organizationId", "clientId", "status");

-- CreateIndex
CREATE INDEX "CreativeAsset_organizationId_archivedAt_idx" ON "CreativeAsset"("organizationId", "archivedAt");

-- CreateIndex
CREATE UNIQUE INDEX "StoredAsset_storageKey_key" ON "StoredAsset"("storageKey");

-- CreateIndex
CREATE INDEX "StoredAsset_organizationId_module_deletedAt_idx" ON "StoredAsset"("organizationId", "module", "deletedAt");

-- CreateIndex
CREATE INDEX "StoredAsset_organizationId_clientId_idx" ON "StoredAsset"("organizationId", "clientId");

-- CreateIndex
CREATE UNIQUE INDEX "WebPage_slug_key" ON "WebPage"("slug");

-- CreateIndex
CREATE INDEX "WebPage_organizationId_status_idx" ON "WebPage"("organizationId", "status");

-- CreateIndex
CREATE INDEX "WebPage_organizationId_clientId_idx" ON "WebPage"("organizationId", "clientId");

-- CreateIndex
CREATE INDEX "WebPage_organizationId_archivedAt_idx" ON "WebPage"("organizationId", "archivedAt");

-- CreateIndex
CREATE INDEX "AdAccount_organizationId_clientId_idx" ON "AdAccount"("organizationId", "clientId");

-- CreateIndex
CREATE UNIQUE INDEX "AdAccount_organizationId_platform_externalAccountId_key" ON "AdAccount"("organizationId", "platform", "externalAccountId");

-- CreateIndex
CREATE INDEX "AdIntegrationCredential_organizationId_status_idx" ON "AdIntegrationCredential"("organizationId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "AdIntegrationCredential_organizationId_provider_key" ON "AdIntegrationCredential"("organizationId", "provider");

-- CreateIndex
CREATE INDEX "TrackingEvent_organizationId_timestamp_idx" ON "TrackingEvent"("organizationId", "timestamp");

-- CreateIndex
CREATE INDEX "TrackingEvent_organizationId_clientId_eventName_idx" ON "TrackingEvent"("organizationId", "clientId", "eventName");

-- CreateIndex
CREATE UNIQUE INDEX "TrackingEvent_organizationId_eventId_key" ON "TrackingEvent"("organizationId", "eventId");

-- CreateIndex
CREATE INDEX "Workflow_organizationId_status_idx" ON "Workflow"("organizationId", "status");

-- CreateIndex
CREATE INDEX "Workflow_organizationId_trigger_idx" ON "Workflow"("organizationId", "trigger");

-- CreateIndex
CREATE INDEX "WorkflowExecution_organizationId_workflowId_startedAt_idx" ON "WorkflowExecution"("organizationId", "workflowId", "startedAt");

-- CreateIndex
CREATE INDEX "WorkflowExecution_organizationId_status_idx" ON "WorkflowExecution"("organizationId", "status");

-- CreateIndex
CREATE INDEX "AuditLog_organizationId_createdAt_idx" ON "AuditLog"("organizationId", "createdAt");

-- CreateIndex
CREATE INDEX "AuditLog_organizationId_resource_action_idx" ON "AuditLog"("organizationId", "resource", "action");

-- CreateIndex
CREATE INDEX "SystemEvent_organizationId_category_createdAt_idx" ON "SystemEvent"("organizationId", "category", "createdAt");

-- CreateIndex
CREATE INDEX "SystemEvent_eventCode_createdAt_idx" ON "SystemEvent"("eventCode", "createdAt");

-- CreateIndex
CREATE INDEX "Ticket_organizationId_status_priority_idx" ON "Ticket"("organizationId", "status", "priority");

-- CreateIndex
CREATE INDEX "Ticket_organizationId_clientId_idx" ON "Ticket"("organizationId", "clientId");

-- CreateIndex
CREATE INDEX "Incident_organizationId_status_severity_idx" ON "Incident"("organizationId", "status", "severity");

-- CreateIndex
CREATE INDEX "Notification_organizationId_userId_readAt_idx" ON "Notification"("organizationId", "userId", "readAt");

-- CreateIndex
CREATE INDEX "Notification_organizationId_createdAt_idx" ON "Notification"("organizationId", "createdAt");

-- CreateIndex
CREATE INDEX "StrategyPlan_organizationId_clientId_status_idx" ON "StrategyPlan"("organizationId", "clientId", "status");

-- CreateIndex
CREATE INDEX "QaCheckItem_organizationId_status_idx" ON "QaCheckItem"("organizationId", "status");

-- CreateIndex
CREATE INDEX "QaCheckItem_organizationId_projectId_idx" ON "QaCheckItem"("organizationId", "projectId");

-- CreateIndex
CREATE INDEX "LaunchChecklistItem_organizationId_domain_status_idx" ON "LaunchChecklistItem"("organizationId", "domain", "status");

-- CreateIndex
CREATE INDEX "DeliveryHandoff_organizationId_clientId_status_idx" ON "DeliveryHandoff"("organizationId", "clientId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "Subscription_externalSubId_key" ON "Subscription"("externalSubId");

-- CreateIndex
CREATE INDEX "Subscription_organizationId_status_idx" ON "Subscription"("organizationId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "Invoice_externalInvoiceId_key" ON "Invoice"("externalInvoiceId");

-- CreateIndex
CREATE INDEX "Invoice_organizationId_status_idx" ON "Invoice"("organizationId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "Payment_externalPaymentId_key" ON "Payment"("externalPaymentId");

-- CreateIndex
CREATE INDEX "Payment_organizationId_status_createdAt_idx" ON "Payment"("organizationId", "status", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "BillingWebhookEvent_eventId_key" ON "BillingWebhookEvent"("eventId");

-- CreateIndex
CREATE INDEX "BillingWebhookEvent_organizationId_processedAt_idx" ON "BillingWebhookEvent"("organizationId", "processedAt");

-- CreateIndex
CREATE INDEX "BillingWebhookEvent_provider_eventType_idx" ON "BillingWebhookEvent"("provider", "eventType");

-- CreateIndex
CREATE INDEX "AiProviderConfig_organizationId_providerId_idx" ON "AiProviderConfig"("organizationId", "providerId");

-- CreateIndex
CREATE INDEX "AiProviderConfig_scope_providerId_idx" ON "AiProviderConfig"("scope", "providerId");

-- CreateIndex
CREATE INDEX "AiModel_providerId_isActive_idx" ON "AiModel"("providerId", "isActive");

-- CreateIndex
CREATE UNIQUE INDEX "AiModel_providerId_modelId_key" ON "AiModel"("providerId", "modelId");

-- CreateIndex
CREATE UNIQUE INDEX "AiRoutingRule_purpose_key" ON "AiRoutingRule"("purpose");

-- CreateIndex
CREATE INDEX "AiPromptTemplate_organizationId_department_isActive_idx" ON "AiPromptTemplate"("organizationId", "department", "isActive");

-- CreateIndex
CREATE UNIQUE INDEX "AiPromptTemplate_organizationId_code_key" ON "AiPromptTemplate"("organizationId", "code");

-- CreateIndex
CREATE INDEX "AiKnowledgeDoc_organizationId_clientId_projectId_idx" ON "AiKnowledgeDoc"("organizationId", "clientId", "projectId");

-- CreateIndex
CREATE INDEX "AiMemory_organizationId_conversationId_createdAt_idx" ON "AiMemory"("organizationId", "conversationId", "createdAt");

-- CreateIndex
CREATE INDEX "AiMemory_organizationId_clientId_idx" ON "AiMemory"("organizationId", "clientId");

-- CreateIndex
CREATE INDEX "AiActionCatalog_department_idx" ON "AiActionCatalog"("department");

-- CreateIndex
CREATE INDEX "AiLimitException_organizationId_scope_targetKey_idx" ON "AiLimitException"("organizationId", "scope", "targetKey");

-- CreateIndex
CREATE INDEX "AiLimitException_organizationId_expiresAt_idx" ON "AiLimitException"("organizationId", "expiresAt");

-- CreateIndex
CREATE INDEX "AiAccountingAlert_organizationId_resolved_idx" ON "AiAccountingAlert"("organizationId", "resolved");

-- CreateIndex
CREATE INDEX "AiUsageAggregation_organizationId_dateKey_idx" ON "AiUsageAggregation"("organizationId", "dateKey");

-- CreateIndex
CREATE UNIQUE INDEX "AiUsageAggregation_organizationId_dateKey_department_action_key" ON "AiUsageAggregation"("organizationId", "dateKey", "department", "action", "providerId", "modelId");

-- CreateIndex
CREATE UNIQUE INDEX "AiUsageLog_requestId_key" ON "AiUsageLog"("requestId");

-- CreateIndex
CREATE UNIQUE INDEX "AiUsageLog_idempotencyKey_key" ON "AiUsageLog"("idempotencyKey");

-- CreateIndex
CREATE INDEX "AiUsageLog_organizationId_createdAt_idx" ON "AiUsageLog"("organizationId", "createdAt");

-- CreateIndex
CREATE INDEX "AiUsageLog_organizationId_department_action_status_idx" ON "AiUsageLog"("organizationId", "department", "action", "status");

-- CreateIndex
CREATE INDEX "AiUsageLog_organizationId_providerId_modelId_idx" ON "AiUsageLog"("organizationId", "providerId", "modelId");

-- CreateIndex
CREATE INDEX "AiUsageLog_organizationId_clientId_billingCategory_idx" ON "AiUsageLog"("organizationId", "clientId", "billingCategory");

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PasswordResetToken" ADD CONSTRAINT "PasswordResetToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Role" ADD CONSTRAINT "Role_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RolePermission" ADD CONSTRAINT "RolePermission_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "Role"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RolePermission" ADD CONSTRAINT "RolePermission_permissionId_fkey" FOREIGN KEY ("permissionId") REFERENCES "Permission"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrganizationMember" ADD CONSTRAINT "OrganizationMember_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrganizationMember" ADD CONSTRAINT "OrganizationMember_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrganizationMember" ADD CONSTRAINT "OrganizationMember_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "Role"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Invitation" ADD CONSTRAINT "Invitation_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Session" ADD CONSTRAINT "Session_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Session" ADD CONSTRAINT "Session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Client" ADD CONSTRAINT "Client_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Lead" ADD CONSTRAINT "Lead_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Opportunity" ADD CONSTRAINT "Opportunity_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Opportunity" ADD CONSTRAINT "Opportunity_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Opportunity" ADD CONSTRAINT "Opportunity_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "Lead"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Proposal" ADD CONSTRAINT "Proposal_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Proposal" ADD CONSTRAINT "Proposal_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Contract" ADD CONSTRAINT "Contract_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Contract" ADD CONSTRAINT "Contract_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Contract" ADD CONSTRAINT "Contract_proposalId_fkey" FOREIGN KEY ("proposalId") REFERENCES "Proposal"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Receivable" ADD CONSTRAINT "Receivable_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Receivable" ADD CONSTRAINT "Receivable_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Receivable" ADD CONSTRAINT "Receivable_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "Contract"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payable" ADD CONSTRAINT "Payable_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Commission" ADD CONSTRAINT "Commission_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Commission" ADD CONSTRAINT "Commission_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "Contract"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Project" ADD CONSTRAINT "Project_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Project" ADD CONSTRAINT "Project_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Project" ADD CONSTRAINT "Project_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "Contract"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Briefing" ADD CONSTRAINT "Briefing_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Briefing" ADD CONSTRAINT "Briefing_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Briefing" ADD CONSTRAINT "Briefing_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Task" ADD CONSTRAINT "Task_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Task" ADD CONSTRAINT "Task_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Deliverable" ADD CONSTRAINT "Deliverable_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Deliverable" ADD CONSTRAINT "Deliverable_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Approval" ADD CONSTRAINT "Approval_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Approval" ADD CONSTRAINT "Approval_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Approval" ADD CONSTRAINT "Approval_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Approval" ADD CONSTRAINT "Approval_deliverableId_fkey" FOREIGN KEY ("deliverableId") REFERENCES "Deliverable"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TimeEntry" ADD CONSTRAINT "TimeEntry_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TimeEntry" ADD CONSTRAINT "TimeEntry_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TimeEntry" ADD CONSTRAINT "TimeEntry_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "Task"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TimeEntry" ADD CONSTRAINT "TimeEntry_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CreativeAsset" ADD CONSTRAINT "CreativeAsset_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CreativeAsset" ADD CONSTRAINT "CreativeAsset_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CreativeAsset" ADD CONSTRAINT "CreativeAsset_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StoredAsset" ADD CONSTRAINT "StoredAsset_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WebPage" ADD CONSTRAINT "WebPage_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WebPage" ADD CONSTRAINT "WebPage_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WebPage" ADD CONSTRAINT "WebPage_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AdAccount" ADD CONSTRAINT "AdAccount_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AdAccount" ADD CONSTRAINT "AdAccount_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AdIntegrationCredential" ADD CONSTRAINT "AdIntegrationCredential_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TrackingEvent" ADD CONSTRAINT "TrackingEvent_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TrackingEvent" ADD CONSTRAINT "TrackingEvent_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Workflow" ADD CONSTRAINT "Workflow_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkflowExecution" ADD CONSTRAINT "WorkflowExecution_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkflowExecution" ADD CONSTRAINT "WorkflowExecution_workflowId_fkey" FOREIGN KEY ("workflowId") REFERENCES "Workflow"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SystemEvent" ADD CONSTRAINT "SystemEvent_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Ticket" ADD CONSTRAINT "Ticket_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Ticket" ADD CONSTRAINT "Ticket_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Incident" ADD CONSTRAINT "Incident_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StrategyPlan" ADD CONSTRAINT "StrategyPlan_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StrategyPlan" ADD CONSTRAINT "StrategyPlan_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StrategyPlan" ADD CONSTRAINT "StrategyPlan_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QaCheckItem" ADD CONSTRAINT "QaCheckItem_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QaCheckItem" ADD CONSTRAINT "QaCheckItem_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LaunchChecklistItem" ADD CONSTRAINT "LaunchChecklistItem_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LaunchChecklistItem" ADD CONSTRAINT "LaunchChecklistItem_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeliveryHandoff" ADD CONSTRAINT "DeliveryHandoff_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeliveryHandoff" ADD CONSTRAINT "DeliveryHandoff_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeliveryHandoff" ADD CONSTRAINT "DeliveryHandoff_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Subscription" ADD CONSTRAINT "Subscription_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_subscriptionId_fkey" FOREIGN KEY ("subscriptionId") REFERENCES "Subscription"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_subscriptionId_fkey" FOREIGN KEY ("subscriptionId") REFERENCES "Subscription"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BillingWebhookEvent" ADD CONSTRAINT "BillingWebhookEvent_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AiProviderConfig" ADD CONSTRAINT "AiProviderConfig_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AiPromptTemplate" ADD CONSTRAINT "AiPromptTemplate_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AiCostPolicy" ADD CONSTRAINT "AiCostPolicy_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AiKnowledgeDoc" ADD CONSTRAINT "AiKnowledgeDoc_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AiMemory" ADD CONSTRAINT "AiMemory_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AiLimitException" ADD CONSTRAINT "AiLimitException_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AiAccountingAlert" ADD CONSTRAINT "AiAccountingAlert_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AiUsageAggregation" ADD CONSTRAINT "AiUsageAggregation_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AiUsageLog" ADD CONSTRAINT "AiUsageLog_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

