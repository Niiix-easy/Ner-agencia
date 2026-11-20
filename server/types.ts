import { AiGatewayState } from './ai/types.ts';

export type RoleName =
  | 'Super Admin'
  | 'Administrador'
  | 'Gestor de Tráfego'
  | 'Comercial'
  | 'Criativo'
  | 'Financeiro'
  | 'Cliente';

export const ROLE_PERMISSIONS: Record<RoleName, string[]> = {
  'Super Admin': ['*'],
  'Administrador': [
    'users.read', 'users.create', 'users.update',
    'organizations.read', 'organizations.update',
    'clients.read', 'clients.create', 'clients.update',
    'leads.read', 'leads.create', 'leads.update',
    'opportunities.read', 'opportunities.manage',
    'proposals.read', 'proposals.manage',
    'contracts.read', 'contracts.manage',
    'plans.read', 'plans.manage',
    'finance.read', 'finance.manage',
    'projects.read', 'projects.create', 'projects.update', 'projects.manage',
    'tasks.read', 'tasks.create', 'tasks.update',
    'approvals.read', 'approvals.request', 'approvals.decide',
    'creative.read', 'creative.manage',
    'performance.read', 'performance.manage',
    'tracking.read', 'tracking.manage',
    'automation.read', 'automation.manage',
    'intelligence.read',
    'web.read', 'web.manage',
    'operations.read', 'operations.manage',
    'billing.read', 'billing.manage',
    'audit.read',
    'ai.read', 'ai.use', 'ai.manage',
  ],
  'Gestor de Tráfego': [
    'clients.read', 'projects.read', 'projects.create', 'projects.update',
    'tasks.read', 'tasks.create', 'tasks.update',
    'approvals.read', 'approvals.request',
    'creative.read', 'performance.read', 'performance.manage',
    'tracking.read', 'intelligence.read', 'web.read',
    'ai.use',
  ],
  'Comercial': [
    'clients.read', 'clients.create', 'clients.update',
    'leads.read', 'leads.create', 'leads.update',
    'opportunities.read', 'opportunities.manage',
    'proposals.read', 'proposals.manage',
    'contracts.read', 'contracts.manage',
    'plans.read', 'projects.read', 'projects.create',
    'ai.use',
  ],
  'Criativo': [
    'clients.read', 'projects.read',
    'tasks.read', 'tasks.update',
    'approvals.read', 'approvals.request',
    'creative.read', 'creative.manage',
    'web.read', 'web.manage',
    'ai.use',
  ],
  'Financeiro': [
    'clients.read', 'contracts.read',
    'finance.read', 'finance.manage',
    'billing.read', 'billing.manage',
    'plans.read', 'audit.read',
    'ai.use',
  ],
  'Cliente': [
    'portal.read',
    'projects.read',
    'approvals.read', 'approvals.decide',
    'creative.read',
    'performance.read',
    'finance.read',
    'billing.read',
    'tickets.create', 'tickets.read',
    'ai.client_assist',
  ],
};

export interface Organization {
  id: string;
  name: string;
  legalName: string;
  document: string;
  slug: string;
  status: 'Ativo' | 'Suspenso';
  createdAt: string;
}

export interface User {
  id: string;
  organizationId: string;
  clientId?: string | null;
  name: string;
  email: string;
  passwordHash: string;
  role: RoleName;
  status: 'Ativo' | 'Inativo';
  emailVerifiedAt: string | null;
  createdAt: string;
}

export interface SessionRecord {
  id: string;
  userId: string;
  organizationId: string;
  tokenHash: string;
  expiresAt: string;
  revokedAt: string | null;
  createdAt: string;
}

export interface Client {
  id: string;
  organizationId: string;
  name: string;
  legalName: string;
  document: string;
  email: string;
  phone: string;
  website: string;
  segment: string;
  category: string;
  status: 'Ativo' | 'Em Onboarding' | 'Inativo';
  mrr: number;
  health: 'Excelente' | 'Bom' | 'Atenção' | 'Novo';
  manager: string;
  createdAt: string;
}

export interface CommercialPlan {
  id: string;
  code: string;
  name: string;
  targetAudience: string;
  category: 'Landing Pages' | 'Sites' | 'E-commerce' | 'Software' | 'Manutenção';
  serviceTemplateType: 'Landing Page' | 'Site' | 'E-commerce' | 'Software';
  setupPrice: number;
  recurringPrice: number;
  recurrence: 'Mensal' | 'Anual' | 'Avulso';
  deliverables: string[];
  limits: {
    landingPages: number;
    sites: number;
    users: number;
    storageGb: number;
  };
  isActive: boolean;
  updatedAt: string;
}

export interface Lead {
  id: string;
  organizationId: string;
  name: string;
  email: string;
  phone: string;
  company: string;
  segment: string;
  source: string;
  utmCampaign?: string;
  status: string;
  estimatedValue: number;
  assignedUserId?: string;
  createdAt: string;
}

export interface Opportunity {
  id: string;
  organizationId: string;
  name: string;
  clientId?: string;
  leadId?: string;
  stage: string;
  value: number;
  probability: number;
  responsible: string;
  expectedClose?: string;
  history: { stage: string; changedAt: string; changedBy: string }[];
}

export interface Proposal {
  id: string;
  organizationId: string;
  number: string;
  clientId: string;
  planCode?: string;
  title: string;
  setupValue: number;
  recurringValue: number;
  totalValue: number;
  status: 'Rascunho' | 'Enviada' | 'Aceita' | 'Recusada';
  validUntil: string;
  responsible: string;
  acceptedAt?: string | null;
  acceptedBy?: string | null;
  createdAt: string;
}

export interface Contract {
  id: string;
  organizationId: string;
  number: string;
  clientId: string;
  proposalId?: string;
  planCode?: string;
  serviceType: 'Landing Page' | 'Site' | 'E-commerce' | 'Software' | 'Performance';
  title: string;
  setupValue: number;
  recurringValue: number;
  value: number;
  recurrence: string;
  status: 'Ativo' | 'Aguardando assinatura' | 'Encerrado';
  startDate: string;
  endDate: string;
}

export interface Receivable {
  id: string;
  organizationId: string;
  clientId: string;
  clientName: string;
  contractId?: string;
  description: string;
  amount: number;
  paidAmount: number;
  dueDate: string;
  status: 'Pendente' | 'Parcialmente pago' | 'Pago' | 'Vencido';
  paymentMethod?: string;
  paymentRef?: string;
  paidAt?: string | null;
  mediaBudget: number;
}

export interface Payable {
  id: string;
  organizationId: string;
  supplier: string;
  description: string;
  category: string;
  amount: number;
  dueDate: string;
  status: 'Pendente' | 'Pago';
}

export interface Commission {
  id: string;
  organizationId: string;
  responsible: string;
  clientName: string;
  contractId?: string;
  baseAmount: number;
  percentage: number;
  commissionValue: number;
  status: 'Aguardando recebimento' | 'Disponível' | 'Pago';
}

export interface Project {
  id: string;
  organizationId: string;
  clientId: string;
  contractId?: string | null;
  planCode?: string | null;
  name: string;
  projectType: 'Landing Page' | 'Site' | 'E-commerce' | 'Software' | 'NER Performance' | 'NER Growth';
  status: string;
  priority: 'Baixa' | 'Normal' | 'Alta' | 'Crítica';
  startDate: string;
  dueDate: string;
  managerId: string;
  progress: number;
  createdAt: string;
}

export interface Briefing {
  id: string;
  organizationId: string;
  projectId: string;
  clientId: string;
  title: string;
  objective: string;
  targetAudience: string;
  offerDetails?: string;
  status: 'Rascunho' | 'Pendente' | 'Aprovado';
  createdAt: string;
}

export interface Task {
  id: string;
  organizationId: string;
  projectId: string;
  title: string;
  status: 'Backlog' | 'A fazer' | 'Em andamento' | 'Em revisão' | 'Concluída';
  priority: 'Baixa' | 'Normal' | 'Alta' | 'Crítica';
  assigneeId: string;
  dueDate: string;
  estimatedHours: number;
  actualHours: number;
}

export interface Deliverable {
  id: string;
  organizationId: string;
  projectId: string;
  name: string;
  type: string;
  version: string;
  status: 'Planejado' | 'Em produção' | 'Em revisão pelo cliente' | 'Aprovado' | 'Entregue';
  dueDate: string;
}

export interface Approval {
  id: string;
  organizationId: string;
  projectId: string;
  clientId: string;
  deliverableId?: string;
  title: string;
  version: string;
  requester: string;
  approver: string;
  status: 'Pendente' | 'Aprovado' | 'Alterações solicitadas' | 'Reprovado';
  comment?: string;
  decidedAt: string | null;
  decidedByUserId?: string | null;
}

export interface TimeEntry {
  id: string;
  organizationId: string;
  projectId: string;
  taskId?: string;
  userId: string;
  description: string;
  duration: number;
  billable: boolean;
  date: string;
}

export interface CreativeAsset {
  id: string;
  organizationId: string;
  clientId: string;
  projectId?: string;
  name: string;
  client: string;
  format: '9:16' | '1:1' | '4:5' | '16:9';
  platform: string;
  type: string;
  version: string;
  status: 'Rascunho' | 'Em Revisão' | 'Aprovado' | 'Entregue';
  usageRights: 'Próprio' | 'Fornecido pelo cliente' | 'IA (Revisão pendente)' | 'Licenciado';
  scriptSummary?: string;
}

export interface AdAccount {
  id: string;
  organizationId: string;
  clientId: string;
  platform: 'Meta Ads' | 'Google Ads' | 'TikTok Ads';
  name: string;
  externalAccountId: string;
  connectionStatus: 'Pendente de Credenciais' | 'Conectado (Demo)' | 'Conectado (OAuth)';
  spend: number;
  impressions: number;
  clicks: number;
  conversions: number;
  roas: number;
  cpa: number;
  dailyLimit: number;
  lastSyncAt: string;
}

export interface TrackingEvent {
  id: string;
  organizationId: string;
  clientId: string;
  eventId: string;
  eventName: 'PageView' | 'ViewContent' | 'Lead' | 'InitiateCheckout' | 'Purchase';
  source: string;
  utmCampaign?: string;
  value: number;
  currency: string;
  confirmedByPayment: boolean;
  deduplicatedCount: number;
  timestamp: string;
}

export interface AutomationWorkflow {
  id: string;
  organizationId: string;
  name: string;
  category: string;
  trigger: string;
  status: 'Ativo' | 'Pausado' | 'Pendente de Configuração n8n';
  executions: number;
  lastRunAt: string;
}

export interface WebPage {
  id: string;
  organizationId: string;
  clientId: string;
  projectId?: string;
  title: string;
  slug: string;
  segment: string;
  pageType: 'Landing Page Produto' | 'Landing Page Captura' | 'Site Institucional' | 'E-commerce';
  domain: string;
  sslStatus: 'Pendente DNS' | 'Ativo';
  status: 'Rascunho' | 'Em revisão' | 'Aprovado' | 'Publicado';
  version: string;
  seoTitle: string;
  seoDescription: string;
  whatsappNumber?: string;
  checkoutUrl?: string;
  pixelConfigured: boolean;
  sections: { id: string; type: string; headline: string; subheadline: string; ctaText: string }[];
  visits: number;
  leadsCaptured: number;
}

export interface ClientTicket {
  id: string;
  organizationId: string;
  clientId: string;
  category: string;
  priority: 'Baixa' | 'Normal' | 'Alta';
  subject: string;
  description: string;
  status: 'Aberto' | 'Em atendimento' | 'Resolvido';
  createdAt: string;
}

export interface SaaSSubscription {
  id: string;
  organizationId: string;
  planCode: string;
  planName: string;
  provider: 'stripe' | 'manual';
  externalSubId: string | null;
  externalCustomerId: string | null;
  status: 'incomplete' | 'trialing' | 'active' | 'past_due' | 'canceled';
  amountMonthly: number;
  currentPeriodEnd: string | null;
  updatedAt: string;
}

export interface BillingWebhookEventRecord {
  id: string;
  provider: string;
  eventId: string;
  eventType: string;
  organizationId?: string;
  status: 'processed' | 'ignored_duplicate' | 'failed';
  summary: string;
  processedAt: string;
}

export interface IncidentRecord {
  id: string;
  organizationId: string;
  category: string;
  severity: 'Baixa' | 'Média' | 'Alta' | 'Crítica';
  service: string;
  description: string;
  status: 'Aberto' | 'Em investigação' | 'Resolvido';
  createdAt: string;
}

export interface AuditLog {
  id: string;
  organizationId: string;
  userId: string;
  action: string;
  resource: string;
  resourceId: string;
  metadata: Record<string, unknown>;
  createdAt: string;
}

export interface DatabaseState {
  organizations: Organization[];
  users: User[];
  sessions: SessionRecord[];
  clients: Client[];
  commercialPlans: CommercialPlan[];
  leads: Lead[];
  opportunities: Opportunity[];
  proposals: Proposal[];
  contracts: Contract[];
  receivables: Receivable[];
  payables: Payable[];
  commissions: Commission[];
  projects: Project[];
  briefings: Briefing[];
  tasks: Task[];
  deliverables: Deliverable[];
  approvals: Approval[];
  timeTracking: TimeEntry[];
  creatives: CreativeAsset[];
  adAccounts: AdAccount[];
  trackingEvents: TrackingEvent[];
  workflows: AutomationWorkflow[];
  webPages: WebPage[];
  tickets: ClientTicket[];
  subscriptions: SaaSSubscription[];
  billingWebhookEvents: BillingWebhookEventRecord[];
  incidents: IncidentRecord[];
  auditLogs: AuditLog[];
  aiGateway: AiGatewayState;
}
