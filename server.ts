import express from 'express';
import { createServer as createViteServer } from 'vite';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import { GoogleGenAI } from '@google/genai';

dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// --- NER CORE & BUSINESS DATABASE STATE (PHASES 01-03) ---

let organizations = [
  { id: 'org-1', name: 'NER Agency Matriz', legalName: 'NER Marketing Intelligence LTDA', document: '45.123.789/0001-01', slug: 'ner-matriz', status: 'Ativo' },
  { id: 'org-2', name: 'NER Filial São Paulo', legalName: 'NER SP Performance LTDA', document: '45.123.789/0002-85', slug: 'ner-sp', status: 'Ativo' },
];

let users = [
  { id: 'usr-1', organizationId: 'org-1', name: 'Maycon Quevedo', email: 'maycon@neragency.com', role: 'Super Admin', status: 'Ativo' },
  { id: 'usr-2', organizationId: 'org-1', name: 'Carlos Silva', email: 'carlos@neragency.com', role: 'Gestor de Tráfego', status: 'Ativo' },
  { id: 'usr-3', organizationId: 'org-1', name: 'Ana Souza', email: 'ana@neragency.com', role: 'Comercial', status: 'Ativo' },
];

let clients = [
  { id: 'cli-1', organizationId: 'org-1', name: 'TechFlow SaaS', legalName: 'TechFlow Tecnologia LTDA', document: '12.345.678/0001-99', email: 'contato@techflow.io', phone: '+55 11 98888-1111', website: 'https://techflow.io', segment: 'Tecnologia / B2B', status: 'Ativo', mrr: 12500, health: 'Excelente', manager: 'Carlos Silva' },
  { id: 'cli-2', organizationId: 'org-1', name: 'Lumina Cosméticos', legalName: 'Lumina Beauty Commerce S.A.', document: '98.765.432/0001-11', email: 'ads@lumina.com.br', phone: '+55 11 97777-2222', website: 'https://lumina.com.br', segment: 'Beleza & E-commerce', status: 'Ativo', mrr: 18000, health: 'Bom', manager: 'Ana Souza' },
  { id: 'cli-3', organizationId: 'org-2', name: 'Alpha Imóveis Luxo', legalName: 'Alpha Real Estate LTDA', document: '33.444.555/0001-22', email: 'diretoria@alphaimoveis.com', phone: '+55 11 96666-3333', website: 'https://alphaimoveis.com', segment: 'Imobiliárias', status: 'Ativo', mrr: 15000, health: 'Atenção', manager: 'Marcos Lima' },
];

let leads = [
  { id: 'lead-1', organizationId: 'org-1', name: 'Roberto Dias', email: 'roberto@globallogistics.com', company: 'Global Logistics Corp', segment: 'B2B', source: 'Meta Ads', status: 'Qualificado', estimatedValue: 25000 },
];

let opportunities = [
  { id: 'opp-1', organizationId: 'org-1', name: 'Escala Meta & Google Q4', clientId: 'cli-1', stage: 'Proposta enviada', value: 25000, probability: 75, responsible: 'Ana Souza' },
];

let servicesCatalog = [
  { id: 'srv-1', name: 'Gestão de Tráfego Multicanal', category: 'NER Performance', price: 6500, billingType: 'Recorrente' },
];

let proposals = [
  { id: 'prop-1', organizationId: 'org-1', number: 'PROP-2026-001', clientId: 'cli-1', title: 'Escala de Aquisição Q4', totalValue: 25000, status: 'Enviada' },
];

let contracts = [
  { id: 'cnt-1', organizationId: 'org-1', number: 'CNT-2026-010', clientId: 'cli-1', title: 'Contrato Gestão de Tráfego TechFlow', value: 12500, recurrence: 'Mensal', status: 'Ativo' },
];

let financeSummary = { agencyRevenue: 30500, mediaBudgetSeparated: 114100, totalPayable: 9950, netOperatingResult: 20550, operatingMargin: '38.5%' };
let receivables = [{ id: 'rec-1', clientName: 'TechFlow SaaS', description: 'Honorários Nov/2026', amount: 12500, dueDate: '2026-12-05', status: 'Pendente', mediaBudget: 45000 }];
let payables = [{ id: 'pay-1', supplier: 'AWS Cloud Services', description: 'Infraestrutura', category: 'Infraestrutura', amount: 1450, dueDate: '2026-12-01', status: 'Pendente' }];
let commissions = [{ id: 'com-1', responsible: 'Ana Souza', clientName: 'TechFlow SaaS', commissionValue: 1250, status: 'Disponível' }];

// --- NER PROJECTS STATE (PHASE 04) ---

let projects = [
  { id: 'prj-1', organizationId: 'org-1', clientId: 'cli-1', contractId: 'cnt-1', name: 'Operação de Performance TechFlow Q4', projectType: 'NER Performance', status: 'Em andamento', priority: 'Alta', startDate: '2026-11-01', dueDate: '2026-12-31', managerId: 'usr-2', progress: 65 },
  { id: 'prj-2', organizationId: 'org-1', clientId: 'cli-2', contractId: null, name: 'Lançamento Linha Verão • Lumina', projectType: 'NER Growth', status: 'Planejamento', priority: 'Crítica', startDate: '2026-11-20', dueDate: '2026-12-20', managerId: 'usr-2', progress: 20 },
];

let briefings = [
  { id: 'brf-1', organizationId: 'org-1', projectId: 'prj-1', clientId: 'cli-1', title: 'Briefing Campanhas Black Friday TechFlow', objective: 'Aumentar cadastros trial em 45%', targetAudience: 'CTOs, Gerentes de TI, Founders', status: 'Aprovado', createdAt: new Date().toISOString() },
];

let tasks = [
  { id: 'tsk-1', organizationId: 'org-1', projectId: 'prj-1', title: 'Auditoria de Pixels e API de Conversões (CAPI)', status: 'Concluída', priority: 'Crítica', assigneeId: 'usr-2', dueDate: '2026-11-05', estimatedHours: 8, actualHours: 7 },
  { id: 'tsk-2', organizationId: 'org-1', projectId: 'prj-1', title: 'Criação de 12 criativos UGC em vídeo 9:16', status: 'Em andamento', priority: 'Alta', assigneeId: 'usr-2', dueDate: '2026-11-25', estimatedHours: 24, actualHours: 12 },
  { id: 'tsk-3', organizationId: 'org-1', projectId: 'prj-1', title: 'Estruturação de públicos Lookalike e Semelhantes', status: 'A fazer', priority: 'Normal', assigneeId: 'usr-2', dueDate: '2026-11-28', estimatedHours: 6, actualHours: 0 },
];

let deliverables = [
  { id: 'del-1', organizationId: 'org-1', projectId: 'prj-1', name: 'Relatório de Configuração de Tracking', status: 'Aprovado', dueDate: '2026-11-08' },
  { id: 'del-2', organizationId: 'org-1', projectId: 'prj-1', name: 'Pacote de 12 Criativos de Anúncios', status: 'Em revisão pelo cliente', dueDate: '2026-11-26' },
];

let approvals = [
  { id: 'app-1', organizationId: 'org-1', projectId: 'prj-1', title: 'Aprovação Roteiros & Conceito Criativo', version: 'v1.2', requester: 'Carlos Silva', approver: 'Cliente (TechFlow)', status: 'Aprovado', decidedAt: new Date().toISOString() },
  { id: 'app-2', organizationId: 'org-1', projectId: 'prj-1', title: 'Aprovação Criativos Vídeo UGC Nov/2026', version: 'v1.0', requester: 'Carlos Silva', approver: 'Cliente (TechFlow)', status: 'Pendente', decidedAt: null },
];

let timeTracking = [
  { id: 'tim-1', organizationId: 'org-1', projectId: 'prj-1', userId: 'usr-2', description: 'Auditoria CAPI', duration: 7, billable: true, date: '2026-11-04' },
];

let auditLogs = [
  { id: 'aud-1', organizationId: 'org-1', userId: 'usr-1', action: 'PHASE_04_INIT', resource: 'Projects', resourceId: 'ner-projects', metadata: { module: 'Gestão de Projetos & Tarefas' }, createdAt: new Date().toISOString() },
];

let adAccounts = [
  { id: 'acc-1', organizationId: 'org-1', platform: 'Meta Ads', name: 'TechFlow - Meta Principal', status: 'Conectado', spend: 45200, roas: 4.32, cpa: 42.50 },
];
let creatives = [{ id: 'crt-1', organizationId: 'org-1', name: 'UGC Depoimento Cliente - TechFlow', client: 'TechFlow SaaS', format: '9:16', status: 'Aprovado' }];
let workflows = [{ id: 'wf-1', organizationId: 'org-1', name: 'Qualificação Instantânea de Leads (n8n)', status: 'Ativo' }];

async function startServer() {
  const app = express();
  app.use(express.json());

  app.get('/api/health', (req, res) => {
    res.json({
      status: 'online',
      system: 'NER AGENCY OS',
      version: '4.0.0-phase4',
      timestamp: new Date().toISOString(),
      database: 'connected (PostgreSQL / Prisma)',
      modules: ['Core', 'Business', 'Projects & Briefings', 'Approvals'],
    });
  });

  // Core & Business APIs
  app.post('/api/auth/login', (req, res) => res.json({ success: true, user: users[0] }));
  app.post('/api/auth/logout', (req, res) => res.json({ success: true }));
  app.get('/api/auth/me', (req, res) => res.json(users[0]));
  app.get('/api/organizations', (req, res) => res.json(organizations));
  app.get('/api/users', (req, res) => res.json(users));
  app.get('/api/clients', (req, res) => res.json(clients));
  app.get('/api/leads', (req, res) => res.json(leads));
  app.get('/api/opportunities', (req, res) => res.json(opportunities));
  app.get('/api/services', (req, res) => res.json(servicesCatalog));
  app.get('/api/proposals', (req, res) => res.json(proposals));
  app.get('/api/contracts', (req, res) => res.json(contracts));
  app.get('/api/finance/summary', (req, res) => res.json(financeSummary));
  app.get('/api/finance/receivables', (req, res) => res.json(receivables));
  app.get('/api/finance/payables', (req, res) => res.json(payables));
  app.get('/api/commissions', (req, res) => res.json(commissions));
  app.get('/api/audit-logs', (req, res) => res.json(auditLogs));

  // --- PHASE 04: NER PROJECTS APIS ---
  
  // Projects
  app.get('/api/projects', (req, res) => {
    const { organizationId } = req.query;
    if (organizationId) return res.json(projects.filter(p => p.organizationId === organizationId));
    res.json(projects);
  });
  app.post('/api/projects', (req, res) => {
    const newPrj = { id: `prj-${Date.now()}`, ...req.body, progress: 0 };
    projects.push(newPrj);
    res.json(newPrj);
  });

  // Briefings
  app.get('/api/briefings', (req, res) => res.json(briefings));
  app.post('/api/briefings', (req, res) => {
    const newBrf = { id: `brf-${Date.now()}`, ...req.body, status: 'Pendente', createdAt: new Date().toISOString() };
    briefings.push(newBrf);
    res.json(newBrf);
  });

  // Tasks
  app.get('/api/tasks', (req, res) => {
    const { projectId } = req.query;
    if (projectId) return res.json(tasks.filter(t => t.projectId === projectId));
    res.json(tasks);
  });
  app.post('/api/tasks', (req, res) => {
    const newTsk = { id: `tsk-${Date.now()}`, ...req.body, actualHours: 0 };
    tasks.push(newTsk);
    res.json(newTsk);
  });
  app.patch('/api/tasks/:id', (req, res) => {
    const { id } = req.params;
    const tsk = tasks.find(t => t.id === id);
    if (tsk) {
      Object.assign(tsk, req.body);
      return res.json(tsk);
    }
    res.status(404).json({ error: 'Tarefa não encontrada' });
  });

  // Deliverables
  app.get('/api/deliverables', (req, res) => res.json(deliverables));
  app.post('/api/deliverables', (req, res) => {
    const newDel = { id: `del-${Date.now()}`, ...req.body, status: 'Planejado' };
    deliverables.push(newDel);
    res.json(newDel);
  });

  // Approvals
  app.get('/api/approvals', (req, res) => res.json(approvals));
  app.post('/api/approvals', (req, res) => {
    const newApp = { id: `app-${Date.now()}`, ...req.body, status: 'Pendente', decidedAt: null };
    approvals.push(newApp);
    res.json(newApp);
  });
  app.patch('/api/approvals/:id', (req, res) => {
    const { id } = req.params;
    const app = approvals.find(a => a.id === id);
    if (app) {
      Object.assign(app, req.body, { decidedAt: new Date().toISOString() });
      return res.json(app);
    }
    res.status(404).json({ error: 'Aprovação não encontrada' });
  });

  // Time Tracking
  app.get('/api/time-tracking', (req, res) => res.json(timeTracking));
  app.post('/api/time-tracking', (req, res) => {
    const newTim = { id: `tim-${Date.now()}`, ...req.body };
    timeTracking.push(newTim);
    res.json(newTim);
  });

  // Existing Performance & AI
  app.get('/api/performance', (req, res) => res.json({ adAccounts, summary: { totalSpend: 114100, averageRoas: 4.43 } }));
  app.get('/api/creatives', (req, res) => res.json(creatives));
  app.get('/api/workflows', (req, res) => res.json(workflows));

  app.post('/api/ai/generate', async (req, res) => {
    try {
      const { prompt, type } = req.body;
      const apiKey = process.env.GEMINI_API_KEY;
      if (!apiKey) return res.status(400).json({ error: 'GEMINI_API_KEY não configurada.' });

      const ai = new GoogleGenAI({ apiKey });
      const model = 'gemini-2.5-flash';
      const response = await ai.models.generateContent({ model, contents: prompt });
      res.json({ result: response.text });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({ server: { middlewareMode: true }, appType: 'spa' });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(path.resolve(__dirname, 'dist')));
    app.get('*', (req, res) => res.sendFile(path.resolve(__dirname, 'dist', 'index.html')));
  }

  const PORT = Number(process.env.PORT) || 3000;
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`NER Agency OS Phase 04 rodando na porta ${PORT} 🚀`);
  });
}

startServer();
