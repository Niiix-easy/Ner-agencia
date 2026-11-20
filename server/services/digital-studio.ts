import crypto from 'node:crypto';
import { PersistentStore } from '../store.ts';
import { CommercialPlan, Contract, Deliverable, Project, Receivable, Task } from '../types.ts';

function uid(prefix: string): string {
  return `${prefix}-${Date.now()}-${crypto.randomBytes(3).toString('hex')}`;
}

interface TemplateItem {
  deliverableName: string;
  deliverableType: string;
  taskTitle: string;
  estimatedHours: number;
  priority: 'Baixa' | 'Normal' | 'Alta' | 'Crítica';
}

export function getServiceDeliverableTemplates(
  serviceType: 'Landing Page' | 'Site' | 'E-commerce' | 'Software'
): TemplateItem[] {
  switch (serviceType) {
    case 'Landing Page':
      return [
        {
          deliverableName: 'Wireframe & Copy de Conversão (CRO)',
          deliverableType: 'Design & Copy',
          taskTitle: 'Estruturar wireframe, headline, prova social e CTA da Landing Page',
          estimatedHours: 6,
          priority: 'Alta',
        },
        {
          deliverableName: 'Desenvolvimento Responsivo + WhatsApp/Checkout',
          deliverableType: 'Desenvolvimento Web',
          taskTitle: 'Implementar layout responsivo, formulário de leads e botão WhatsApp/Checkout',
          estimatedHours: 10,
          priority: 'Alta',
        },
        {
          deliverableName: 'Configuração Domínio, SSL, Pixel & GA4',
          deliverableType: 'Tracking & Infra',
          taskTitle: 'Configurar DNS/SSL, Meta Pixel, GA4, UTMs e testar captura no NER Business',
          estimatedHours: 4,
          priority: 'Crítica',
        },
      ];
    case 'Site':
      return [
        {
          deliverableName: 'Arquitetura de Informação & UI Design',
          deliverableType: 'Design',
          taskTitle: 'Definir sitemap institucional, identidade visual e protótipo de telas',
          estimatedHours: 12,
          priority: 'Alta',
        },
        {
          deliverableName: 'Desenvolvimento Multi-páginas & Painel Admin',
          deliverableType: 'Desenvolvimento Web',
          taskTitle: 'Construir páginas institucionais, formulários CRM e painel administrativo',
          estimatedHours: 24,
          priority: 'Alta',
        },
        {
          deliverableName: 'SEO Técnico, Performance & Tracking',
          deliverableType: 'SEO & Tracking',
          taskTitle: 'Aplicar meta tags, sitemap.xml, Core Web Vitals e eventos NER Tracking',
          estimatedHours: 6,
          priority: 'Normal',
        },
      ];
    case 'E-commerce':
      return [
        {
          deliverableName: 'Arquitetura de Catálogo & UX Checkout',
          deliverableType: 'Design & UX',
          taskTitle: 'Estruturar categorias, fichas de produto e fluxo de checkout de alta conversão',
          estimatedHours: 16,
          priority: 'Alta',
        },
        {
          deliverableName: 'Integração Pagamento, Frete & ERP',
          deliverableType: 'Integrações',
          taskTitle: 'Integrar gateway de pagamento, cálculo de frete e sincronização de pedidos',
          estimatedHours: 28,
          priority: 'Crítica',
        },
        {
          deliverableName: 'Tracking E-commerce (ViewContent, AddToCart, Purchase)',
          deliverableType: 'Tracking & CAPI',
          taskTitle: 'Configurar eventos server-side deduplicados vinculados à confirmação de pagamento',
          estimatedHours: 8,
          priority: 'Crítica',
        },
      ];
    case 'Software':
      return [
        {
          deliverableName: 'Documento de Descoberta & Arquitetura de Dados',
          deliverableType: 'Arquitetura',
          taskTitle: 'Mapear requisitos funcionais, modelagem de banco e contratos de API',
          estimatedHours: 16,
          priority: 'Crítica',
        },
        {
          deliverableName: 'Desenvolvimento MVP (Frontend + Backend + RBAC)',
          deliverableType: 'Engenharia',
          taskTitle: 'Implementar módulos core, autenticação segura e regras de negócio',
          estimatedHours: 60,
          priority: 'Alta',
        },
        {
          deliverableName: 'Homologação Staging, Testes & Deploy',
          deliverableType: 'QA & DevOps',
          taskTitle: 'Executar suíte de testes automatizados, hardening e publicação em produção',
          estimatedHours: 16,
          priority: 'Crítica',
        },
      ];
  }
}

export function recalculateProjectProgress(store: PersistentStore, projectId: string): number {
  const state = store.getState();
  const project = state.projects.find((p) => p.id === projectId);
  if (!project) return 0;
  const projectTasks = state.tasks.filter((t) => t.projectId === projectId);
  if (projectTasks.length === 0) {
    project.progress = 0;
    return 0;
  }
  const doneCount = projectTasks.filter((t) => t.status === 'Concluída').length;
  const pct = Math.round((doneCount / projectTasks.length) * 100);
  project.progress = pct;
  if (pct === 100) {
    project.status = 'Concluído';
  } else if (pct > 0 && project.status === 'Planejamento') {
    project.status = 'Em andamento';
  }
  return pct;
}

export interface ContractPlanInput {
  organizationId: string;
  clientId: string;
  planId?: string;
  planCode?: string;
  customProjectName?: string;
  managerId?: string;
  dueDate?: string;
  actorUserId: string;
}

export function contractPlanAndCreateProject(
  store: PersistentStore,
  input: ContractPlanInput
): {
  plan: CommercialPlan;
  contract: Contract;
  project: Project;
  deliverables: Deliverable[];
  tasks: Task[];
  receivable: Receivable | null;
} {
  const state = store.getState();
  const client = state.clients.find(
    (c) => c.id === input.clientId && c.organizationId === input.organizationId
  );
  if (!client) {
    throw new Error('CLIENT_NOT_FOUND_IN_ORG');
  }

  const plan = state.commercialPlans.find(
    (p) => (input.planId && p.id === input.planId) || (input.planCode && p.code === input.planCode)
  );
  if (!plan || !plan.isActive) {
    throw new Error('PLAN_NOT_FOUND_OR_INACTIVE');
  }

  const now = new Date();
  const todayStr = now.toISOString().slice(0, 10);
  const nextYear = new Date(now.getTime() + 365 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const defaultDue = new Date(now.getTime() + 21 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const dueDate = input.dueDate || defaultDue;

  const contractNumber = `CNT-${now.getFullYear()}-${String(state.contracts.length + 11).padStart(3, '0')}`;
  const contract: Contract = {
    id: uid('cnt'),
    organizationId: input.organizationId,
    number: contractNumber,
    clientId: client.id,
    planCode: plan.code,
    serviceType: plan.serviceTemplateType,
    title: `${plan.name} • ${client.name}`,
    setupValue: plan.setupPrice,
    recurringValue: plan.recurringPrice,
    value: plan.setupPrice + plan.recurringPrice,
    recurrence: plan.recurrence,
    status: 'Ativo',
    startDate: todayStr,
    endDate: nextYear,
  };
  state.contracts.push(contract);

  // Separate financial receivable (Agency honorários / setup; Media budget strictly 0)
  let receivable: Receivable | null = null;
  if (plan.setupPrice > 0 || plan.recurringPrice > 0) {
    const dueInv = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    receivable = {
      id: uid('rec'),
      organizationId: input.organizationId,
      clientId: client.id,
      clientName: client.name,
      contractId: contract.id,
      description: `Implantação + 1ª Recorrência (${plan.name})`,
      amount: plan.setupPrice + plan.recurringPrice,
      paidAmount: 0,
      dueDate: dueInv,
      status: 'Pendente',
      paidAt: null,
      mediaBudget: 0,
    };
    state.receivables.push(receivable);
  }

  const projectId = uid('prj');
  const project: Project = {
    id: projectId,
    organizationId: input.organizationId,
    clientId: client.id,
    contractId: contract.id,
    planCode: plan.code,
    name: input.customProjectName?.trim() || `${plan.name} • ${client.name}`,
    projectType: plan.serviceTemplateType,
    status: 'Planejamento',
    priority: 'Alta',
    startDate: todayStr,
    dueDate,
    managerId: input.managerId || input.actorUserId,
    progress: 0,
    createdAt: now.toISOString(),
  };
  state.projects.push(project);

  const templateItems = getServiceDeliverableTemplates(plan.serviceTemplateType);
  const createdDeliverables: Deliverable[] = [];
  const createdTasks: Task[] = [];

  templateItems.forEach((tpl, idx) => {
    const del: Deliverable = {
      id: `${uid('del')}-${idx + 1}`,
      organizationId: input.organizationId,
      projectId: project.id,
      name: tpl.deliverableName,
      type: tpl.deliverableType,
      version: 'v1.0',
      status: 'Planejado',
      dueDate,
    };
    createdDeliverables.push(del);
    state.deliverables.push(del);

    const tsk: Task = {
      id: `${uid('tsk')}-${idx + 1}`,
      organizationId: input.organizationId,
      projectId: project.id,
      title: tpl.taskTitle,
      status: 'A fazer',
      priority: tpl.priority,
      assigneeId: input.managerId || input.actorUserId,
      dueDate,
      estimatedHours: tpl.estimatedHours,
      actualHours: 0,
    };
    createdTasks.push(tsk);
    state.tasks.push(tsk);
  });

  // Update active Workflow C counter if enabled in this org
  const wf = state.workflows.find(
    (w) => w.organizationId === input.organizationId && w.trigger === 'contract.digital_studio.created' && w.status === 'Ativo'
  );
  if (wf) {
    wf.executions += 1;
    wf.lastRunAt = now.toISOString();
  }

  store.audit(input.organizationId, input.actorUserId, 'DIGITAL_STUDIO_CONTRACT_CREATED', 'Project', project.id, {
    planCode: plan.code,
    contractId: contract.id,
    serviceTemplateType: plan.serviceTemplateType,
    deliverablesCreated: createdDeliverables.length,
    tasksCreated: createdTasks.length,
  });

  store.save();

  return {
    plan,
    contract,
    project,
    deliverables: createdDeliverables,
    tasks: createdTasks,
    receivable,
  };
}
