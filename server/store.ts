import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { DatabaseState, AuditLog } from './types.ts';
import { createInitialAiGatewayState } from './ai/seed.ts';
import { DEFAULT_AI_ACTIONS } from './ai/actions.ts';

export function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString('hex');
  const derived = crypto.scryptSync(password, salt, 64).toString('hex');
  return `scrypt:${salt}:${derived}`;
}

export function verifyPassword(password: string, storedHash: string): boolean {
  const parts = storedHash.split(':');
  if (parts.length !== 3 || parts[0] !== 'scrypt') return false;
  const [, salt, keyHex] = parts;
  const keyBuf = Buffer.from(keyHex, 'hex');
  const derivedBuf = crypto.scryptSync(password, salt, 64);
  if (keyBuf.length !== derivedBuf.length) return false;
  return crypto.timingSafeEqual(keyBuf, derivedBuf);
}

export function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

export function createInitialSeedState(): DatabaseState {
  const now = new Date().toISOString();
  // Dev/bootstrap password configurable via env var (never hardcoded for prod; dev fallback clearly documented)
  const devBootstrapPass = process.env.NER_DEV_BOOTSTRAP_PASSWORD || 'NerAgency@2026';
  const defaultHash = hashPassword(devBootstrapPass);

  return {
    organizations: [
      {
        id: 'org-1',
        name: 'NER Agency Matriz',
        legalName: 'NER Marketing Intelligence LTDA',
        document: '45.123.789/0001-01',
        slug: 'ner-matriz',
        status: 'Ativo',
        createdAt: now,
      },
      {
        id: 'org-2',
        name: 'NER Filial São Paulo',
        legalName: 'NER SP Performance LTDA',
        document: '45.123.789/0002-85',
        slug: 'ner-sp',
        status: 'Ativo',
        createdAt: now,
      },
    ],
    users: [
      {
        id: 'usr-1',
        organizationId: 'org-1',
        clientId: null,
        name: 'Maycon Quevedo',
        email: 'maycon@neragency.com',
        passwordHash: defaultHash,
        role: 'Super Admin',
        status: 'Ativo',
        emailVerifiedAt: now,
        createdAt: now,
      },
      {
        id: 'usr-2',
        organizationId: 'org-1',
        clientId: null,
        name: 'Carlos Silva',
        email: 'carlos@neragency.com',
        passwordHash: defaultHash,
        role: 'Gestor de Tráfego',
        status: 'Ativo',
        emailVerifiedAt: now,
        createdAt: now,
      },
      {
        id: 'usr-3',
        organizationId: 'org-1',
        clientId: null,
        name: 'Ana Souza',
        email: 'ana@neragency.com',
        passwordHash: defaultHash,
        role: 'Comercial',
        status: 'Ativo',
        emailVerifiedAt: now,
        createdAt: now,
      },
      {
        id: 'usr-4',
        organizationId: 'org-1',
        clientId: 'cli-1',
        name: 'Lucas (Cliente TechFlow)',
        email: 'lucas@techflow.io',
        passwordHash: defaultHash,
        role: 'Cliente',
        status: 'Ativo',
        emailVerifiedAt: now,
        createdAt: now,
      },
      {
        id: 'usr-5',
        organizationId: 'org-2',
        clientId: null,
        name: 'Marcos Lima',
        email: 'marcos@nersp.com',
        passwordHash: defaultHash,
        role: 'Administrador',
        status: 'Ativo',
        emailVerifiedAt: now,
        createdAt: now,
      },
    ],
    sessions: [],
    clients: [
      {
        id: 'cli-1',
        organizationId: 'org-1',
        name: 'TechFlow SaaS',
        legalName: 'TechFlow Tecnologia LTDA',
        document: '12.345.678/0001-99',
        email: 'contato@techflow.io',
        phone: '+55 11 98888-1111',
        website: 'https://techflow.io',
        segment: 'Tecnologia / B2B',
        category: 'Média Empresa',
        status: 'Ativo',
        mrr: 12500,
        health: 'Excelente',
        manager: 'Carlos Silva',
        createdAt: now,
      },
      {
        id: 'cli-2',
        organizationId: 'org-1',
        name: 'Lumina Cosméticos',
        legalName: 'Lumina Beauty Commerce S.A.',
        document: '98.765.432/0001-11',
        email: 'ads@lumina.com.br',
        phone: '+55 11 97777-2222',
        website: 'https://lumina.com.br',
        segment: 'Beleza & E-commerce',
        category: 'Pequena Empresa',
        status: 'Ativo',
        mrr: 18000,
        health: 'Bom',
        manager: 'Ana Souza',
        createdAt: now,
      },
      {
        id: 'cli-3',
        organizationId: 'org-2',
        name: 'Alpha Imóveis Luxo',
        legalName: 'Alpha Real Estate LTDA',
        document: '33.444.555/0001-22',
        email: 'diretoria@alphaimoveis.com',
        phone: '+55 11 96666-3333',
        website: 'https://alphaimoveis.com',
        segment: 'Imobiliárias',
        category: 'Grande Empresa',
        status: 'Ativo',
        mrr: 15000,
        health: 'Atenção',
        manager: 'Marcos Lima',
        createdAt: now,
      },
    ],
    commercialPlans: [
      {
        id: 'plan-1',
        code: 'NER_PRODUCT_START',
        name: 'NER Product Start',
        targetAudience: 'Vendedores Individuais (Shopee, ML, Afiliados)',
        category: 'Landing Pages',
        serviceTemplateType: 'Landing Page',
        setupPrice: 997,
        recurringPrice: 99,
        recurrence: 'Mensal',
        deliverables: [
          '1 Landing Page de Produto Responsiva',
          'Galeria de Imagens & Copy Comercial',
          'Botão WhatsApp + Checkout Externo',
          'Configuração Domínio, SSL & Pixel Básico',
        ],
        limits: { landingPages: 1, sites: 0, users: 1, storageGb: 2 },
        isActive: true,
        updatedAt: now,
      },
      {
        id: 'plan-2',
        code: 'NER_MICRO',
        name: 'NER Micro',
        targetAudience: 'MEIs, Profissionais Autônomos e Microempresas',
        category: 'Sites',
        serviceTemplateType: 'Site',
        setupPrice: 1490,
        recurringPrice: 199,
        recurrence: 'Mensal',
        deliverables: [
          'Site One-Page (até 5 seções)',
          'Formulário de Contato & Botão WhatsApp',
          'SEO Técnico Básico & Google Analytics',
          'Hospedagem e Suporte Técnico Básico',
        ],
        limits: { landingPages: 1, sites: 1, users: 2, storageGb: 5 },
        isActive: true,
        updatedAt: now,
      },
      {
        id: 'plan-3',
        code: 'NER_BUSINESS_GROWTH',
        name: 'NER Business Growth',
        targetAudience: 'Pequenas Empresas',
        category: 'Sites',
        serviceTemplateType: 'Site',
        setupPrice: 3490,
        recurringPrice: 349,
        recurrence: 'Mensal',
        deliverables: [
          'Site Institucional até 5 Páginas',
          'Integração de Leads direta com NER Business',
          'NER Tracking + Preparação para Campanhas',
          'Monitoramento Técnico Contínuo',
        ],
        limits: { landingPages: 3, sites: 1, users: 5, storageGb: 15 },
        isActive: true,
        updatedAt: now,
      },
      {
        id: 'plan-4',
        code: 'NER_PERFORMANCE_WEB',
        name: 'NER Performance Web',
        targetAudience: 'Empresas com Foco em Tráfego Pago e Conversão',
        category: 'Landing Pages',
        serviceTemplateType: 'Landing Page',
        setupPrice: 1990,
        recurringPrice: 499,
        recurrence: 'Mensal',
        deliverables: [
          'Landing Page de Alta Conversão (CRO)',
          'Meta Pixel + CAPI + GA4 + UTMs',
          'Integração Direta NER Tracking & Performance',
          'Manutenção e Otimização Contínua',
        ],
        limits: { landingPages: 5, sites: 1, users: 5, storageGb: 20 },
        isActive: true,
        updatedAt: now,
      },
      {
        id: 'plan-5',
        code: 'NER_BUSINESS_PRO',
        name: 'NER Business Pro',
        targetAudience: 'Médias Empresas',
        category: 'Sites',
        serviceTemplateType: 'Site',
        setupPrice: 6900,
        recurringPrice: 699,
        recurrence: 'Mensal',
        deliverables: [
          'Site Profissional até 10 Páginas + Painel Admin',
          'Formulários Avançados & Integração CRM',
          'SEO Técnico Avançado & Suporte Prioritário',
          'Tracking Completo & Monitoramento SLA',
        ],
        limits: { landingPages: 10, sites: 3, users: 15, storageGb: 50 },
        isActive: true,
        updatedAt: now,
      },
      {
        id: 'plan-6',
        code: 'NER_ENTERPRISE',
        name: 'NER Enterprise',
        targetAudience: 'Grandes Empresas e Corporações',
        category: 'E-commerce',
        serviceTemplateType: 'E-commerce',
        setupPrice: 15000,
        recurringPrice: 1990,
        recurrence: 'Mensal',
        deliverables: [
          'Portal / E-commerce Corporativo Multicanal',
          'Integrações ERP/CRM & RBAC Avançado',
          'Backups Dedicados, Segurança & SLA Contratual',
          'Evolução Contínua de Arquitetura',
        ],
        limits: { landingPages: 50, sites: 10, users: 100, storageGb: 250 },
        isActive: true,
        updatedAt: now,
      },
      {
        id: 'plan-7',
        code: 'NER_SOFTWARE_FACTORY',
        name: 'NER Software Factory',
        targetAudience: 'Empresas que necessitam de Sistemas Web e SaaS Sob Medida',
        category: 'Software',
        serviceTemplateType: 'Software',
        setupPrice: 12000,
        recurringPrice: 1490,
        recurrence: 'Mensal',
        deliverables: [
          'Documento de Descoberta & Arquitetura de Dados',
          'Desenvolvimento MVP Frontend + Backend + APIs',
          'Homologação Staging, Testes Automatizados & Deploy',
          'Manutenção Evolutiva & SLA de Engenharia',
        ],
        limits: { landingPages: 20, sites: 5, users: 50, storageGb: 100 },
        isActive: true,
        updatedAt: now,
      },
    ],
    leads: [
      {
        id: 'lead-1',
        organizationId: 'org-1',
        name: 'Roberto Dias',
        email: 'roberto@globallogistics.com',
        phone: '+55 11 99999-1234',
        company: 'Global Logistics Corp',
        segment: 'B2B',
        source: 'Meta Ads',
        utmCampaign: 'b2b_q4_escala',
        status: 'Qualificado',
        estimatedValue: 25000,
        assignedUserId: 'usr-3',
        createdAt: now,
      },
      {
        id: 'lead-2',
        organizationId: 'org-1',
        name: 'Juliana Paes',
        email: 'juliana@modavita.com',
        phone: '+55 11 98888-5678',
        company: 'Moda Vita E-commerce',
        segment: 'E-commerce',
        source: 'Google Ads',
        utmCampaign: 'search_ecommerce',
        status: 'Novo',
        estimatedValue: 14000,
        assignedUserId: 'usr-3',
        createdAt: now,
      },
      {
        id: 'lead-3',
        organizationId: 'org-2',
        name: 'Ricardo Mendes',
        email: 'ricardo@construtoracentral.com',
        phone: '+55 11 95555-0000',
        company: 'Construtora Central',
        segment: 'Construção',
        source: 'Indicação',
        status: 'Novo',
        estimatedValue: 19000,
        assignedUserId: 'usr-5',
        createdAt: now,
      },
    ],
    opportunities: [
      {
        id: 'opp-1',
        organizationId: 'org-1',
        name: 'Escala Meta & Google Q4',
        clientId: 'cli-1',
        leadId: 'lead-1',
        stage: 'Proposta enviada',
        value: 25000,
        probability: 75,
        responsible: 'Ana Souza',
        expectedClose: '2026-12-15',
        history: [{ stage: 'Proposta enviada', changedAt: now, changedBy: 'Ana Souza' }],
      },
      {
        id: 'opp-2',
        organizationId: 'org-1',
        name: 'LP Produto Start • Loja Beleza MT',
        clientId: 'cli-2',
        stage: 'Negociação',
        value: 997,
        probability: 80,
        responsible: 'Ana Souza',
        expectedClose: '2026-11-30',
        history: [{ stage: 'Negociação', changedAt: now, changedBy: 'Ana Souza' }],
      },
    ],
    proposals: [
      {
        id: 'prop-1',
        organizationId: 'org-1',
        number: 'PROP-2026-001',
        clientId: 'cli-1',
        planCode: 'NER_PERFORMANCE_WEB',
        title: 'Escala de Aquisição & Landing Pages Q4',
        setupValue: 1990,
        recurringValue: 499,
        totalValue: 2489,
        status: 'Enviada',
        validUntil: '2026-12-15',
        responsible: 'Ana Souza',
        acceptedAt: null,
        acceptedBy: null,
        createdAt: now,
      },
    ],
    contracts: [
      {
        id: 'cnt-1',
        organizationId: 'org-1',
        number: 'CNT-2026-010',
        clientId: 'cli-1',
        planCode: 'NER_PERFORMANCE_WEB',
        serviceType: 'Performance',
        title: 'Contrato Gestão de Tráfego TechFlow',
        setupValue: 0,
        recurringValue: 12500,
        value: 12500,
        recurrence: 'Mensal',
        status: 'Ativo',
        startDate: '2026-01-01',
        endDate: '2027-01-01',
      },
    ],
    receivables: [
      {
        id: 'rec-1',
        organizationId: 'org-1',
        clientId: 'cli-1',
        clientName: 'TechFlow SaaS',
        contractId: 'cnt-1',
        description: 'Honorários Gestão de Tráfego - Nov/2026',
        amount: 12500,
        paidAmount: 12500,
        dueDate: '2026-11-10',
        status: 'Pago',
        paymentMethod: 'PIX / Transferência',
        paymentRef: 'TX-NER-20261110',
        paidAt: now,
        mediaBudget: 45200,
      },
      {
        id: 'rec-2',
        organizationId: 'org-1',
        clientId: 'cli-2',
        clientName: 'Lumina Cosméticos',
        description: 'Honorários E-commerce Growth - Nov/2026',
        amount: 18000,
        paidAmount: 0,
        dueDate: '2026-12-05',
        status: 'Pendente',
        paidAt: null,
        mediaBudget: 68900,
      },
    ],
    payables: [
      {
        id: 'pay-1',
        organizationId: 'org-1',
        supplier: 'AWS / Cloud Infrastructure',
        description: 'Servidores NER OS & PostgreSQL',
        category: 'Infraestrutura',
        amount: 1450,
        dueDate: '2026-12-01',
        status: 'Pendente',
      },
      {
        id: 'pay-2',
        organizationId: 'org-1',
        supplier: 'Estúdio Motion & UGC',
        description: 'Produção Audiovisual Terceirizada',
        category: 'Produção',
        amount: 4200,
        dueDate: '2026-12-05',
        status: 'Pendente',
      },
    ],
    commissions: [
      {
        id: 'com-1',
        organizationId: 'org-1',
        responsible: 'Ana Souza',
        clientName: 'TechFlow SaaS',
        contractId: 'cnt-1',
        baseAmount: 12500,
        percentage: 10,
        commissionValue: 1250,
        status: 'Disponível',
      },
    ],
    projects: [
      {
        id: 'prj-1',
        organizationId: 'org-1',
        clientId: 'cli-1',
        contractId: 'cnt-1',
        planCode: 'NER_PERFORMANCE_WEB',
        name: 'Operação de Performance TechFlow Q4',
        projectType: 'NER Performance',
        status: 'Em andamento',
        priority: 'Alta',
        startDate: '2026-11-01',
        dueDate: '2026-12-31',
        managerId: 'usr-2',
        progress: 33,
        createdAt: now,
      },
      {
        id: 'prj-2',
        organizationId: 'org-2',
        clientId: 'cli-3',
        contractId: null,
        planCode: null,
        name: 'Portal Imobiliário Alpha Luxo',
        projectType: 'Site',
        status: 'Planejamento',
        priority: 'Normal',
        startDate: '2026-11-15',
        dueDate: '2026-12-30',
        managerId: 'usr-5',
        progress: 0,
        createdAt: now,
      },
    ],
    briefings: [
      {
        id: 'brf-1',
        organizationId: 'org-1',
        projectId: 'prj-1',
        clientId: 'cli-1',
        title: 'Briefing Campanhas Black Friday TechFlow',
        objective: 'Aumentar cadastros trial B2B em 35%',
        targetAudience: 'CTOs, Heads de Engenharia e Founders',
        offerDetails: '14 dias grátis + diagnóstico técnico',
        status: 'Aprovado',
        createdAt: now,
      },
    ],
    tasks: [
      {
        id: 'tsk-1',
        organizationId: 'org-1',
        projectId: 'prj-1',
        title: 'Auditoria de Pixels e API de Conversões (CAPI)',
        status: 'Concluída',
        priority: 'Crítica',
        assigneeId: 'usr-2',
        dueDate: '2026-11-05',
        estimatedHours: 8,
        actualHours: 7,
      },
      {
        id: 'tsk-2',
        organizationId: 'org-1',
        projectId: 'prj-1',
        title: 'Produção de 6 criativos UGC em vídeo 9:16',
        status: 'Em andamento',
        priority: 'Alta',
        assigneeId: 'usr-2',
        dueDate: '2026-11-25',
        estimatedHours: 16,
        actualHours: 6,
      },
      {
        id: 'tsk-3',
        organizationId: 'org-1',
        projectId: 'prj-1',
        title: 'Publicação de Landing Page B2B com UTMs',
        status: 'A fazer',
        priority: 'Normal',
        assigneeId: 'usr-2',
        dueDate: '2026-11-28',
        estimatedHours: 6,
        actualHours: 0,
      },
    ],
    deliverables: [
      {
        id: 'del-1',
        organizationId: 'org-1',
        projectId: 'prj-1',
        name: 'Relatório de Configuração de Tracking & CAPI',
        type: 'Tracking',
        version: 'v1.0',
        status: 'Aprovado',
        dueDate: '2026-11-08',
      },
      {
        id: 'del-2',
        organizationId: 'org-1',
        projectId: 'prj-1',
        name: 'Pacote de Criativos UGC Q4',
        type: 'Criativo',
        version: 'v1.0',
        status: 'Em revisão pelo cliente',
        dueDate: '2026-11-26',
      },
    ],
    approvals: [
      {
        id: 'app-1',
        organizationId: 'org-1',
        projectId: 'prj-1',
        clientId: 'cli-1',
        deliverableId: 'del-1',
        title: 'Aprovação Roteiros & Conceito Criativo',
        version: 'v1.2',
        requester: 'Carlos Silva',
        approver: 'Lucas (Cliente TechFlow)',
        status: 'Aprovado',
        comment: 'Aprovado para gravação.',
        decidedAt: now,
        decidedByUserId: 'usr-4',
      },
      {
        id: 'app-2',
        organizationId: 'org-1',
        projectId: 'prj-1',
        clientId: 'cli-1',
        deliverableId: 'del-2',
        title: 'Aprovação Criativos Vídeo UGC Nov/2026',
        version: 'v1.0',
        requester: 'Carlos Silva',
        approver: 'Lucas (Cliente TechFlow)',
        status: 'Pendente',
        decidedAt: null,
        decidedByUserId: null,
      },
    ],
    timeTracking: [
      {
        id: 'tim-1',
        organizationId: 'org-1',
        projectId: 'prj-1',
        taskId: 'tsk-1',
        userId: 'usr-2',
        description: 'Auditoria CAPI & Deduplicação',
        duration: 7,
        billable: true,
        date: '2026-11-04',
      },
    ],
    creatives: [
      {
        id: 'crt-1',
        organizationId: 'org-1',
        clientId: 'cli-1',
        projectId: 'prj-1',
        name: 'UGC Depoimento B2B - TechFlow',
        client: 'TechFlow SaaS',
        format: '9:16',
        platform: 'Meta Ads / TikTok',
        type: 'UGC',
        version: 'v1.0',
        status: 'Em Revisão',
        usageRights: 'Fornecido pelo cliente',
        scriptSummary: 'Gancho sobre redução de tempo de deploy + prova técnica + CTA Trial.',
      },
      {
        id: 'crt-2',
        organizationId: 'org-1',
        clientId: 'cli-2',
        name: 'Carrossel Oferta Linha Verão',
        client: 'Lumina Cosméticos',
        format: '1:1',
        platform: 'Instagram Feed',
        type: 'Carrossel',
        version: 'v1.1',
        status: 'Aprovado',
        usageRights: 'Próprio',
        scriptSummary: 'Benefícios dermatológicos + oferta de kit.',
      },
    ],
    adAccounts: [
      {
        id: 'acc-1',
        organizationId: 'org-1',
        clientId: 'cli-1',
        platform: 'Meta Ads',
        name: 'TechFlow - Conta Principal (Demo)',
        externalAccountId: 'act_demo_102938',
        connectionStatus: 'Conectado (Demo)',
        spend: 45200,
        impressions: 980000,
        clicks: 24500,
        conversions: 612,
        roas: 4.32,
        cpa: 73.85,
        dailyLimit: 2000,
        lastSyncAt: now,
      },
      {
        id: 'acc-2',
        organizationId: 'org-1',
        clientId: 'cli-2',
        platform: 'Google Ads',
        name: 'Lumina - Search & PMax',
        externalAccountId: 'gads_pending_oauth',
        connectionStatus: 'Pendente de Credenciais',
        spend: 68900,
        impressions: 1240000,
        clicks: 38200,
        conversions: 1180,
        roas: 5.12,
        cpa: 58.39,
        dailyLimit: 3000,
        lastSyncAt: now,
      },
    ],
    trackingEvents: [
      {
        id: 'evt-1',
        organizationId: 'org-1',
        clientId: 'cli-1',
        eventId: 'ev_lead_99812',
        eventName: 'Lead',
        source: 'Meta CAPI + Browser',
        utmCampaign: 'b2b_q4_escala',
        value: 0,
        currency: 'BRL',
        confirmedByPayment: false,
        deduplicatedCount: 2,
        timestamp: now,
      },
      {
        id: 'evt-2',
        organizationId: 'org-1',
        clientId: 'cli-2',
        eventId: 'ev_pur_77410',
        eventName: 'Purchase',
        source: 'Checkout Webhook',
        utmCampaign: 'lumina_verao',
        value: 489.9,
        currency: 'BRL',
        confirmedByPayment: true,
        deduplicatedCount: 1,
        timestamp: now,
      },
    ],
    workflows: [
      {
        id: 'wf-1',
        organizationId: 'org-1',
        name: 'Workflow A — Novo Lead → Qualificação & Tarefa',
        category: 'NER Business',
        trigger: 'lead.created',
        status: 'Ativo',
        executions: 142,
        lastRunAt: now,
      },
      {
        id: 'wf-2',
        organizationId: 'org-1',
        name: 'Workflow C — Contrato Digital Studio → Criar Projeto',
        category: 'NER Projects',
        trigger: 'contract.digital_studio.created',
        status: 'Ativo',
        executions: 18,
        lastRunAt: now,
      },
      {
        id: 'wf-3',
        organizationId: 'org-1',
        name: 'Orquestrador Externo n8n (Webhook Bridge)',
        category: 'n8n',
        trigger: 'external.n8n.sync',
        status: 'Pendente de Configuração n8n',
        executions: 0,
        lastRunAt: now,
      },
    ],
    webPages: [
      {
        id: 'wp-1',
        organizationId: 'org-1',
        clientId: 'cli-1',
        projectId: 'prj-1',
        title: 'Landing Page Trial B2B — TechFlow',
        slug: 'techflow-trial-q4',
        segment: 'Tecnologia / B2B',
        pageType: 'Landing Page Captura',
        domain: 'lp.techflow.io',
        sslStatus: 'Pendente DNS',
        status: 'Publicado',
        version: 'v1.2',
        seoTitle: 'TechFlow SaaS — Automatize sua Engenharia',
        seoDescription: 'Teste grátis por 14 dias sem cartão de crédito.',
        whatsappNumber: '5511988881111',
        pixelConfigured: true,
        sections: [
          { id: 'sec-1', type: 'Hero', headline: 'Reduza em 40% o tempo de operação do seu time', subheadline: 'Plataforma B2B auditada para escala corporativa.', ctaText: 'Solicitar Diagnóstico' },
          { id: 'sec-2', type: 'Benefícios', headline: 'Integração nativa e métricas em tempo real', subheadline: 'Conecte seu stack em menos de 10 minutos.', ctaText: 'Começar Agora' },
        ],
        visits: 4280,
        leadsCaptured: 312,
      },
    ],
    tickets: [
      {
        id: 'tkt-1',
        organizationId: 'org-1',
        clientId: 'cli-1',
        category: 'Criativos',
        priority: 'Normal',
        subject: 'Ajuste de legenda no vídeo UGC v1.0',
        description: 'Solicitamos destacar o prazo de 14 dias grátis nos primeiros 3 segundos.',
        status: 'Em atendimento',
        createdAt: now,
      },
    ],
    subscriptions: [
      {
        id: 'sub-1',
        organizationId: 'org-1',
        planCode: 'NER_ENTERPRISE',
        planName: 'NER Agency OS Enterprise (SaaS)',
        provider: 'stripe',
        externalSubId: null,
        externalCustomerId: null,
        status: 'trialing',
        amountMonthly: 1990,
        currentPeriodEnd: null,
        updatedAt: now,
      },
    ],
    billingWebhookEvents: [],
    incidents: [
      {
        id: 'inc-1',
        organizationId: 'org-1',
        category: 'Integração Pendente',
        severity: 'Média',
        service: 'Google Ads API / n8n / Stripe',
        description: 'Credenciais OAuth/Webhook externas aguardando configuração de variáveis de ambiente para sincronização real.',
        status: 'Aberto',
        createdAt: now,
      },
    ],
    auditLogs: [
      {
        id: 'aud-1',
        organizationId: 'org-1',
        userId: 'usr-1',
        action: 'SYSTEM_AUDIT_STABILIZATION',
        resource: 'Platform',
        resourceId: 'ner-agency-os',
        metadata: { note: 'Auditoria técnica e persistência inicializada' },
        createdAt: now,
      },
    ],
    aiGateway: createInitialAiGatewayState(),
  };
}

export class PersistentStore {
  private filePath: string | null;
  private state: DatabaseState;

  constructor(filePath: string | null = path.resolve(process.cwd(), 'database/data/ner-db.json')) {
    this.filePath = filePath;
    if (this.filePath && fs.existsSync(this.filePath)) {
      try {
        const raw = fs.readFileSync(this.filePath, 'utf-8');
        this.state = JSON.parse(raw) as DatabaseState;
        if (!this.state.aiGateway) {
          this.state.aiGateway = createInitialAiGatewayState();
          this.save();
        } else {
          let dirty = false;
          const ai = this.state.aiGateway;
          if (!Array.isArray(ai.actions) || ai.actions.length === 0) {
            ai.actions = DEFAULT_AI_ACTIONS.map((a) => ({ ...a }));
            dirty = true;
          }
          if (!Array.isArray(ai.limitExceptions)) {
            ai.limitExceptions = [];
            dirty = true;
          }
          if (!Array.isArray(ai.accountingAlerts)) {
            ai.accountingAlerts = [];
            dirty = true;
          }
          if (!ai.exchangeConfig) {
            const now = new Date().toISOString();
            ai.exchangeConfig = {
              baseCurrency: 'USD',
              targetCurrency: 'BRL',
              rate: 5.75,
              rateDate: now.slice(0, 10),
              source: 'Referência Administrativa Configurável',
              updatedAt: now,
            };
            dirty = true;
          }
          for (const pol of ai.costPolicies || []) {
            if (!Array.isArray(pol.alertThresholds)) {
              pol.alertThresholds = [50, 75, 90, 100];
              dirty = true;
            }
            if (!pol.onExceedAction) {
              pol.onExceedAction = pol.blockOnExceed ? 'block_non_essential' : 'notify';
              dirty = true;
            }
          }
          if (dirty) this.save();
        }
      } catch {
        this.state = createInitialSeedState();
        this.save();
      }
    } else {
      this.state = createInitialSeedState();
      this.save();
    }
  }

  public getState(): DatabaseState {
    return this.state;
  }

  public save(): void {
    if (!this.filePath) return;
    const dir = path.dirname(this.filePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    const tmpPath = `${this.filePath}.tmp`;
    fs.writeFileSync(tmpPath, JSON.stringify(this.state, null, 2), 'utf-8');
    fs.renameSync(tmpPath, this.filePath);
  }

  public resetForTests(): void {
    this.state = createInitialSeedState();
    this.save();
  }

  public audit(
    organizationId: string,
    userId: string,
    action: string,
    resource: string,
    resourceId: string,
    metadata: Record<string, unknown> = {}
  ): AuditLog {
    // Strip any potential secret fields from audit metadata
    const safeMetadata = { ...metadata };
    for (const k of Object.keys(safeMetadata)) {
      if (/password|secret|token|key|hash/i.test(k)) {
        safeMetadata[k] = '[REDACTED]';
      }
    }
    const entry: AuditLog = {
      id: `aud-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      organizationId,
      userId,
      action,
      resource,
      resourceId,
      metadata: safeMetadata,
      createdAt: new Date().toISOString(),
    };
    this.state.auditLogs.unshift(entry);
    if (this.state.auditLogs.length > 500) {
      this.state.auditLogs.length = 500;
    }
    this.save();
    return entry;
  }
}
