import React, { useState, useEffect } from 'react';
import {
  LayoutDashboard,
  Briefcase,
  Target,
  Clapperboard,
  TrendingUp,
  Globe,
  Cpu,
  Users,
  ShieldCheck,
  Server,
  DollarSign,
  Plus,
  Search,
  CheckCircle2,
  AlertTriangle,
  RefreshCw,
  Sparkles,
  ExternalLink,
  Lock,
  LogOut,
  Send,
  Filter,
  BarChart3,
  Layers,
  ArrowUpRight,
  Check,
  X,
  FileText,
  Building2,
  Key,
  Activity,
  CreditCard,
  PieChart,
  FileCheck
} from 'lucide-react';

export default function App() {
  const [isAuthenticated, setIsAuthenticated] = useState(true);
  const [currentUser, setCurrentUser] = useState<any>({
    id: 'usr-1',
    name: 'Maycon Quevedo',
    email: 'maycon@neragency.com',
    role: 'Super Admin',
    organizationId: 'org-1'
  });

  // Navigation state (Fases 01, 02 & 03)
  const [activeTab, setActiveTab] = useState<'dashboard' | 'business-crm' | 'business-pipeline' | 'business-services' | 'business-proposals' | 'business-contracts' | 'business-finance' | 'strategy' | 'creative' | 'performance' | 'web' | 'automation' | 'client-portal' | 'core-users' | 'core-orgs' | 'core-rbac' | 'core-audit' | 'infra'>('business-crm');
  const [roleMode, setRoleMode] = useState<'agency' | 'client'>('agency');
  const [healthStatus, setHealthStatus] = useState<any>(null);

  // Data state
  const [organizations, setOrganizations] = useState<any[]>([]);
  const [usersList, setUsersList] = useState<any[]>([]);
  const [clients, setClients] = useState<any[]>([]);
  const [leads, setLeads] = useState<any[]>([]);
  const [opportunities, setOpportunities] = useState<any[]>([]);
  const [servicesCatalog, setServicesCatalog] = useState<any[]>([]);
  const [proposals, setProposals] = useState<any[]>([]);
  const [contracts, setContracts] = useState<any[]>([]);
  const [financeSummary, setFinanceSummary] = useState<any>(null);
  const [receivables, setReceivables] = useState<any[]>([]);
  const [payables, setPayables] = useState<any[]>([]);
  const [commissions, setCommissions] = useState<any[]>([]);
  const [performanceData, setPerformanceData] = useState<any>(null);
  const [creatives, setCreatives] = useState<any[]>([]);
  const [workflows, setWorkflows] = useState<any[]>([]);
  const [auditLogs, setAuditLogs] = useState<any[]>([]);
  const [roles, setRoles] = useState<any[]>([]);
  const [permissions, setPermissions] = useState<any[]>([]);

  const [activeOrgId, setActiveOrgId] = useState('org-1');

  // Modals
  const [showLeadModal, setShowLeadModal] = useState(false);
  const [newLead, setNewLead] = useState({ name: '', email: '', phone: '', company: '', segment: 'B2B', source: 'Meta Ads', estimatedValue: 15000 });

  const [showProposalModal, setShowProposalModal] = useState(false);
  const [newProp, setNewProp] = useState({ number: 'PROP-2026-002', clientId: 'cli-1', title: 'Expansão de Tráfego', totalValue: 18000, validUntil: '2026-12-30', responsible: 'Ana Souza' });

  useEffect(() => {
    fetchAllData();
  }, [activeOrgId]);

  const fetchAllData = async () => {
    try {
      const [hRes, orgRes, uRes, cRes, lRes, oppRes, srvRes, propRes, cntRes, finSumRes, recRes, payRes, comRes, pRes, crRes, wRes, audRes, rRes, permRes] = await Promise.all([
        fetch('/api/health').then(r => r.json()).catch(() => ({ status: 'online' })),
        fetch('/api/organizations').then(r => r.json()).catch(() => []),
        fetch(`/api/users?organizationId=${activeOrgId}`).then(r => r.json()).catch(() => []),
        fetch(`/api/clients?organizationId=${activeOrgId}`).then(r => r.json()).catch(() => []),
        fetch(`/api/leads?organizationId=${activeOrgId}`).then(r => r.json()).catch(() => []),
        fetch('/api/opportunities').then(r => r.json()).catch(() => []),
        fetch('/api/services').then(r => r.json()).catch(() => []),
        fetch('/api/proposals').then(r => r.json()).catch(() => []),
        fetch('/api/contracts').then(r => r.json()).catch(() => []),
        fetch('/api/finance/summary').then(r => r.json()).catch(() => null),
        fetch('/api/finance/receivables').then(r => r.json()).catch(() => []),
        fetch('/api/finance/payables').then(r => r.json()).catch(() => []),
        fetch('/api/commissions').then(r => r.json()).catch(() => []),
        fetch('/api/performance').then(r => r.json()).catch(() => null),
        fetch('/api/creatives').then(r => r.json()).catch(() => []),
        fetch('/api/workflows').then(r => r.json()).catch(() => []),
        fetch('/api/audit-logs').then(r => r.json()).catch(() => []),
        fetch('/api/roles').then(r => r.json()).catch(() => []),
        fetch('/api/permissions').then(r => r.json()).catch(() => []),
      ]);
      setHealthStatus(hRes);
      setOrganizations(orgRes);
      setUsersList(uRes);
      setClients(cRes);
      setLeads(lRes);
      setOpportunities(oppRes);
      setServicesCatalog(srvRes);
      setProposals(propRes);
      setContracts(cntRes);
      setFinanceSummary(finSumRes);
      setReceivables(recRes);
      setPayables(payRes);
      setCommissions(comRes);
      setPerformanceData(pRes);
      setCreatives(crRes);
      setWorkflows(wRes);
      setAuditLogs(audRes);
      setRoles(rRes);
      setPermissions(permRes);
    } catch (e) {
      console.error(e);
    }
  };

  const handleCreateLead = async (e: React.FormEvent) => {
    e.preventDefault();
    const res = await fetch('/api/leads', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...newLead, organizationId: activeOrgId, status: 'Novo' })
    });
    const data = await res.json();
    setLeads([...leads, data]);
    setShowLeadModal(false);
    setNewLead({ name: '', email: '', phone: '', company: '', segment: 'B2B', source: 'Meta Ads', estimatedValue: 15000 });
  };

  const handleCreateProposal = async (e: React.FormEvent) => {
    e.preventDefault();
    const res = await fetch('/api/proposals', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...newProp, organizationId: activeOrgId, status: 'Enviada' })
    });
    const data = await res.json();
    setProposals([...proposals, data]);
    setShowProposalModal(false);
  };

  const currentOrg = organizations.find(o => o.id === activeOrgId) || organizations[0] || { name: 'NER Agency' };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans selection:bg-cyan-500 selection:text-black">
      {/* Header */}
      <header className="border-b border-slate-800 bg-slate-900/80 backdrop-blur sticky top-0 z-50 px-6 py-3 flex items-center justify-between">
        <div className="flex items-center space-x-6">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-cyan-600 to-blue-600 flex items-center justify-center shadow-lg shadow-cyan-900/40">
              <span className="font-black text-white text-lg tracking-wider">NER</span>
            </div>
            <div>
              <h1 className="font-bold text-sm tracking-wide text-white flex items-center gap-2">
                NER AGENCY OS <span className="text-[10px] px-2 py-0.5 rounded bg-cyan-500/20 text-cyan-400 border border-cyan-500/30">Fase 03 Business</span>
              </h1>
              <p className="text-xs text-slate-400">{currentOrg.name}</p>
            </div>
          </div>

          <div className="flex items-center space-x-2 bg-slate-950 border border-slate-800 px-3 py-1.5 rounded-lg text-xs">
            <Building2 className="w-4 h-4 text-cyan-400" />
            <span className="text-slate-400">Escopo:</span>
            <select
              value={activeOrgId}
              onChange={e => setActiveOrgId(e.target.value)}
              className="bg-transparent text-white font-semibold focus:outline-none cursor-pointer"
            >
              {organizations.map(org => (
                <option key={org.id} value={org.id} className="bg-slate-900 text-white">{org.name}</option>
              ))}
            </select>
          </div>
        </div>

        <div className="flex items-center space-x-4">
          <div className="flex items-center bg-slate-800 p-1 rounded-lg border border-slate-700">
            <button onClick={() => setRoleMode('agency')} className={`px-3 py-1.5 text-xs font-medium rounded-md transition-all ${roleMode === 'agency' ? 'bg-cyan-600 text-white shadow' : 'text-slate-400 hover:text-white'}`}>
              Visão Agência
            </button>
            <button onClick={() => { setRoleMode('client'); setActiveTab('client-portal'); }} className={`px-3 py-1.5 text-xs font-medium rounded-md transition-all ${roleMode === 'client' ? 'bg-cyan-600 text-white shadow' : 'text-slate-400 hover:text-white'}`}>
              Portal do Cliente
            </button>
          </div>

          <div className="flex items-center space-x-3 bg-slate-900 px-3 py-1.5 rounded-lg border border-slate-800 text-xs">
            <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></div>
            <span className="text-slate-300">{currentUser.name} ({currentUser.role})</span>
          </div>

          <button onClick={() => setIsAuthenticated(false)} className="p-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-rose-400 transition-all" title="Encerrar Sessão">
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </header>

      {/* Main Layout */}
      <div className="flex flex-1 overflow-hidden">
        {/* Sidebar Navigation */}
        <aside className="w-64 border-r border-slate-800 bg-slate-900/40 p-4 flex flex-col justify-between overflow-y-auto">
          <nav className="space-y-1.5">
            <div className="text-[10px] uppercase font-semibold text-cyan-400 px-3 pb-1 tracking-wider flex items-center gap-1.5">
              <Briefcase className="w-3.5 h-3.5" /> NER Business (Fase 03)
            </div>
            <SidebarItem icon={<Users className="w-4 h-4" />} label="CRM & Leads" active={activeTab === 'business-crm'} onClick={() => setActiveTab('business-crm')} />
            <SidebarItem icon={<Target className="w-4 h-4" />} label="Pipeline Comercial" active={activeTab === 'business-pipeline'} onClick={() => setActiveTab('business-pipeline')} />
            <SidebarItem icon={<Layers className="w-4 h-4" />} label="Catálogo de Serviços" active={activeTab === 'business-services'} onClick={() => setActiveTab('business-services')} />
            <SidebarItem icon={<FileText className="w-4 h-4" />} label="Propostas Comerciais" active={activeTab === 'business-proposals'} onClick={() => setActiveTab('business-proposals')} />
            <SidebarItem icon={<FileCheck className="w-4 h-4" />} label="Contratos & Assinaturas" active={activeTab === 'business-contracts'} onClick={() => setActiveTab('business-contracts')} />
            <SidebarItem icon={<DollarSign className="w-4 h-4" />} label="Financeiro & P&L" active={activeTab === 'business-finance'} onClick={() => setActiveTab('business-finance')} />

            <div className="pt-4 text-[10px] uppercase font-semibold text-slate-500 px-3 pb-1 tracking-wider">Unidades Operacionais</div>
            <SidebarItem icon={<LayoutDashboard className="w-4 h-4" />} label="Dashboard Executivo" active={activeTab === 'dashboard'} onClick={() => setActiveTab('dashboard')} />
            <SidebarItem icon={<Sparkles className="w-4 h-4" />} label="NER Strategy & IA" active={activeTab === 'strategy'} onClick={() => setActiveTab('strategy')} />
            <SidebarItem icon={<Clapperboard className="w-4 h-4" />} label="NER Creative (Criativos)" active={activeTab === 'creative'} onClick={() => setActiveTab('creative')} />
            <SidebarItem icon={<TrendingUp className="w-4 h-4" />} label="NER Performance (Ads)" active={activeTab === 'performance'} onClick={() => setActiveTab('performance')} />
            <SidebarItem icon={<Globe className="w-4 h-4" />} label="NER Web (LPs & E-com)" active={activeTab === 'web'} onClick={() => setActiveTab('web')} />
            <SidebarItem icon={<Cpu className="w-4 h-4" />} label="NER Automation (n8n)" active={activeTab === 'automation'} onClick={() => setActiveTab('automation')} />
            <SidebarItem icon={<Users className="w-4 h-4" />} label="Portal do Cliente" active={activeTab === 'client-portal'} onClick={() => setActiveTab('client-portal')} />

            <div className="pt-4 text-[10px] uppercase font-semibold text-slate-500 px-3 pb-1 tracking-wider">NER Core & Infra</div>
            <SidebarItem icon={<Users className="w-4 h-4" />} label="Gestão de Usuários" active={activeTab === 'core-users'} onClick={() => setActiveTab('core-users')} />
            <SidebarItem icon={<Building2 className="w-4 h-4" />} label="Organizações" active={activeTab === 'core-orgs'} onClick={() => setActiveTab('core-orgs')} />
            <SidebarItem icon={<Key className="w-4 h-4" />} label="Perfis & RBAC" active={activeTab === 'core-rbac'} onClick={() => setActiveTab('core-rbac')} />
            <SidebarItem icon={<Activity className="w-4 h-4" />} label="Logs de Auditoria" active={activeTab === 'core-audit'} onClick={() => setActiveTab('core-audit')} />
            <SidebarItem icon={<Server className="w-4 h-4" />} label="Fases & DevOps" active={activeTab === 'infra'} onClick={() => setActiveTab('infra')} />
          </nav>

          <div className="p-3 bg-slate-900/80 rounded-xl border border-slate-800 text-xs space-y-1">
            <div className="flex items-center justify-between">
              <span className="text-slate-400">Fase Ativa</span>
              <span className="text-cyan-400 font-mono">03 Business</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-slate-400">P&L Financeiro</span>
              <span className="text-emerald-400 font-mono">Separado</span>
            </div>
          </div>
        </aside>

        {/* Content Area */}
        <main className="flex-1 overflow-y-auto p-8 bg-slate-950">
          {activeTab === 'business-crm' && (
            <CrmLeadsView leads={leads} onOpenModal={() => setShowLeadModal(true)} />
          )}
          {activeTab === 'business-pipeline' && (
            <PipelineKanbanView opportunities={opportunities} />
          )}
          {activeTab === 'business-services' && (
            <ServicesCatalogView services={servicesCatalog} />
          )}
          {activeTab === 'business-proposals' && (
            <ProposalsView proposals={proposals} onOpenModal={() => setShowProposalModal(true)} clients={clients} />
          )}
          {activeTab === 'business-contracts' && (
            <ContractsView contracts={contracts} />
          )}
          {activeTab === 'business-finance' && (
            <FinanceView financeSummary={financeSummary} receivables={receivables} payables={payables} commissions={commissions} />
          )}
          {activeTab === 'dashboard' && <DashboardView clients={clients} leads={leads} performanceData={performanceData} currentOrg={currentOrg} />}
          {activeTab === 'strategy' && <StrategyView />}
          {activeTab === 'creative' && <CreativeView creatives={creatives} clients={clients} />}
          {activeTab === 'performance' && <PerformanceView performanceData={performanceData} />}
          {activeTab === 'web' && <WebView />}
          {activeTab === 'automation' && <AutomationView workflows={workflows} />}
          {activeTab === 'client-portal' && <ClientPortalView clients={clients} creatives={creatives} />}
          {activeTab === 'core-users' && <UsersManagementView usersList={usersList} organizations={organizations} />}
          {activeTab === 'core-orgs' && <OrganizationsView organizations={organizations} />}
          {activeTab === 'core-rbac' && <RbacView roles={roles} permissions={permissions} />}
          {activeTab === 'core-audit' && <AuditLogsView auditLogs={auditLogs} />}
          {activeTab === 'infra' && <InfraView healthStatus={healthStatus} />}
        </main>
      </div>

      {/* New Lead Modal */}
      {showLeadModal && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-lg p-6 shadow-2xl">
            <div className="flex items-center justify-between pb-4 border-b border-slate-800 mb-4">
              <h3 className="font-bold text-lg text-white flex items-center gap-2">
                <Briefcase className="w-5 h-5 text-cyan-400" /> Novo Lead • CRM Comercial
              </h3>
              <button onClick={() => setShowLeadModal(false)} className="text-slate-400 hover:text-white"><X className="w-5 h-5" /></button>
            </div>
            <form onSubmit={handleCreateLead} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-slate-400 mb-1">Nome do Contato</label>
                  <input type="text" required value={newLead.name} onChange={e => setNewLead({ ...newLead, name: e.target.value })} className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-sm text-white" placeholder="Nome" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-400 mb-1">Empresa</label>
                  <input type="text" required value={newLead.company} onChange={e => setNewLead({ ...newLead, company: e.target.value })} className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-sm text-white" placeholder="Empresa S.A." />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-slate-400 mb-1">E-mail</label>
                  <input type="email" required value={newLead.email} onChange={e => setNewLead({ ...newLead, email: e.target.value })} className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-sm text-white" placeholder="email@empresa.com" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-400 mb-1">Telefone / WhatsApp</label>
                  <input type="text" required value={newLead.phone} onChange={e => setNewLead({ ...newLead, phone: e.target.value })} className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-sm text-white" placeholder="+55 11 99999-9999" />
                </div>
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-400 mb-1">Segmento</label>
                  <input type="text" value={newLead.segment} onChange={e => setNewLead({ ...newLead, segment: e.target.value })} className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-sm text-white" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-400 mb-1">Origem</label>
                  <select value={newLead.source} onChange={e => setNewLead({ ...newLead, source: e.target.value })} className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-sm text-white">
                    <option value="Meta Ads">Meta Ads</option>
                    <option value="Google Search">Google Search</option>
                    <option value="TikTok Ads">TikTok Ads</option>
                    <option value="Outbound">Outbound</option>
                    <option value="Indicação">Indicação</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-400 mb-1">Valor (R$)</label>
                  <input type="number" value={newLead.estimatedValue} onChange={e => setNewLead({ ...newLead, estimatedValue: Number(e.target.value) })} className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-sm text-white" />
                </div>
              </div>
              <div className="flex justify-end space-x-3 pt-4 border-t border-slate-800">
                <button type="button" onClick={() => setShowLeadModal(false)} className="px-4 py-2 rounded-lg bg-slate-800 text-slate-300 text-xs font-medium">Cancelar</button>
                <button type="submit" className="px-4 py-2 rounded-lg bg-cyan-600 text-white text-xs font-semibold">Cadastrar Lead</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* New Proposal Modal */}
      {showProposalModal && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-md p-6 shadow-2xl">
            <div className="flex items-center justify-between pb-4 border-b border-slate-800 mb-4">
              <h3 className="font-bold text-lg text-white flex items-center gap-2">
                <FileText className="w-5 h-5 text-cyan-400" /> Nova Proposta Comercial
              </h3>
              <button onClick={() => setShowProposalModal(false)} className="text-slate-400 hover:text-white"><X className="w-5 h-5" /></button>
            </div>
            <form onSubmit={handleCreateProposal} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1">Título / Escopo</label>
                <input type="text" required value={newProp.title} onChange={e => setNewProp({ ...newProp, title: e.target.value })} className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-sm text-white" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-slate-400 mb-1">Valor Total (R$)</label>
                  <input type="number" required value={newProp.totalValue} onChange={e => setNewProp({ ...newProp, totalValue: Number(e.target.value) })} className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-sm text-white" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-400 mb-1">Validade</label>
                  <input type="date" required value={newProp.validUntil} onChange={e => setNewProp({ ...newProp, validUntil: e.target.value })} className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-sm text-white" />
                </div>
              </div>
              <div className="flex justify-end space-x-3 pt-4 border-t border-slate-800">
                <button type="button" onClick={() => setShowProposalModal(false)} className="px-4 py-2 rounded-lg bg-slate-800 text-slate-300 text-xs font-medium">Cancelar</button>
                <button type="submit" className="px-4 py-2 rounded-lg bg-cyan-600 text-white text-xs font-semibold">Emitir Proposta</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

function SidebarItem({ icon, label, active, onClick }: any) {
  return (
    <button
      onClick={onClick}
      className={`w-full flex items-center space-x-3 px-3 py-2.5 rounded-xl text-xs font-medium transition-all ${
        active
          ? 'bg-gradient-to-r from-cyan-600/20 to-blue-600/10 text-cyan-400 border border-cyan-500/30 shadow-lg shadow-cyan-950'
          : 'text-slate-400 hover:text-white hover:bg-slate-800/60'
      }`}
    >
      {icon}
      <span>{label}</span>
    </button>
  );
}

// --- NER BUSINESS VIEWS (PHASE 03) ---

function CrmLeadsView({ leads, onOpenModal }: any) {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-white tracking-tight">NER Business • CRM & Gestão de Leads</h2>
          <p className="text-sm text-slate-400">Prospecção multicanal, captura com UTMs e qualificação comercial.</p>
        </div>
        <button onClick={onOpenModal} className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-white font-semibold text-xs shadow-lg shadow-cyan-950 transition-all">
          <Plus className="w-4 h-4" /> Novo Lead
        </button>
      </div>

      <div className="bg-slate-900/60 border border-slate-800 rounded-2xl overflow-hidden shadow-xl">
        <table className="w-full text-left text-xs">
          <thead className="bg-slate-950 border-b border-slate-800 text-slate-400 uppercase font-semibold">
            <tr>
              <th className="p-4">Empresa / Contato</th>
              <th className="p-4">Segmento</th>
              <th className="p-4">Origem</th>
              <th className="p-4">Valor Estimado</th>
              <th className="p-4">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800/60">
            {leads.map((l: any) => (
              <tr key={l.id} className="hover:bg-slate-800/30 transition-all">
                <td className="p-4">
                  <div className="font-semibold text-white">{l.company}</div>
                  <div className="text-slate-400 mt-0.5">{l.name} • {l.email}</div>
                </td>
                <td className="p-4 text-slate-300">{l.segment}</td>
                <td className="p-4"><span className="px-2.5 py-1 rounded-full bg-slate-800 text-cyan-400 font-mono">{l.source}</span></td>
                <td className="p-4 font-mono font-bold text-emerald-400">R$ {l.estimatedValue?.toLocaleString('pt-BR')}</td>
                <td className="p-4"><span className="px-2.5 py-1 rounded-full bg-cyan-500/20 text-cyan-400 border border-cyan-500/30 font-medium">{l.status}</span></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function PipelineKanbanView({ opportunities }: any) {
  const stages = ['Novo lead', 'Qualificação', 'Reunião', 'Proposta enviada', 'Negociação', 'Ganho'];

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-white tracking-tight">NER Business • Pipeline Comercial Kanban</h2>
        <p className="text-sm text-slate-400">Movimentação de oportunidades e controle do funil de vendas.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-6 gap-3 overflow-x-auto pb-4">
        {stages.map((stage) => {
          const stageOpps = opportunities.filter((o: any) => o.stage === stage);
          return (
            <div key={stage} className="bg-slate-900/40 border border-slate-800/80 rounded-2xl p-3 flex flex-col min-w-[200px]">
              <div className="flex items-center justify-between mb-3 pb-2 border-b border-slate-800">
                <span className="text-[11px] font-bold text-slate-300 uppercase">{stage}</span>
                <span className="text-[10px] bg-slate-800 px-2 py-0.5 rounded text-cyan-400 font-mono">{stageOpps.length}</span>
              </div>
              <div className="space-y-3 flex-1">
                {stageOpps.map((opp: any) => (
                  <div key={opp.id} className="bg-slate-900 border border-slate-800 rounded-xl p-3 shadow hover:border-cyan-500/50 transition-all">
                    <div className="font-semibold text-xs text-white">{opp.name}</div>
                    <div className="text-[10px] text-slate-400 mt-1">Resp: {opp.responsible}</div>
                    <div className="mt-3 flex items-center justify-between pt-2 border-t border-slate-800 text-xs">
                      <span className="text-cyan-400 font-mono font-bold">R$ {opp.value?.toLocaleString('pt-BR')}</span>
                      <span className="text-[10px] bg-emerald-500/20 text-emerald-400 px-1.5 py-0.5 rounded">{opp.probability}%</span>
                    </div>
                  </div>
                ))}
                {stageOpps.length === 0 && (
                  <div className="h-20 flex items-center justify-center text-[10px] text-slate-600 italic border border-dashed border-slate-800 rounded-xl">
                    Vazio
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function ServicesCatalogView({ services }: any) {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-white tracking-tight">NER Business • Catálogo de Serviços & Pacotes</h2>
        <p className="text-sm text-slate-400">Níveis oficiais de atendimento: Performance, Growth e Enterprise.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {services.map((srv: any) => (
          <div key={srv.id} className="bg-slate-900/60 border border-slate-800 rounded-2xl p-6 shadow-xl space-y-4 flex flex-col justify-between">
            <div>
              <span className="text-xs px-2.5 py-1 rounded-full bg-cyan-500/20 text-cyan-400 border border-cyan-500/30 font-mono">
                {srv.category}
              </span>
              <h3 className="font-bold text-white text-lg mt-3">{srv.name}</h3>
              <p className="text-xs text-slate-400 mt-2 leading-relaxed">{srv.deliverables}</p>
            </div>
            <div className="pt-4 border-t border-slate-800 flex items-center justify-between">
              <div>
                <span className="text-[10px] text-slate-500 block">Preço Base ({srv.billingType})</span>
                <span className="text-lg font-bold font-mono text-emerald-400">R$ {srv.price?.toLocaleString('pt-BR')}</span>
              </div>
              <button className="px-3 py-1.5 rounded-lg bg-cyan-600 text-white text-xs font-semibold hover:bg-cyan-500">
                Selecionar
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function ProposalsView({ proposals, onOpenModal, clients }: any) {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-white tracking-tight">NER Business • Propostas Comerciais</h2>
          <p className="text-sm text-slate-400">Emissão, histórico e controle de aceite de propostas.</p>
        </div>
        <button onClick={onOpenModal} className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-white font-semibold text-xs shadow-lg">
          <Plus className="w-4 h-4" /> Nova Proposta
        </button>
      </div>

      <div className="bg-slate-900/60 border border-slate-800 rounded-2xl overflow-hidden shadow-xl">
        <table className="w-full text-left text-xs">
          <thead className="bg-slate-950 border-b border-slate-800 text-slate-400 uppercase font-semibold">
            <tr>
              <th className="p-4">Número</th>
              <th className="p-4">Título / Escopo</th>
              <th className="p-4">Valor Total</th>
              <th className="p-4">Validade</th>
              <th className="p-4">Responsável</th>
              <th className="p-4">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800/60">
            {proposals.map((p: any) => (
              <tr key={p.id} className="hover:bg-slate-800/30 transition-all">
                <td className="p-4 font-mono font-bold text-cyan-400">{p.number}</td>
                <td className="p-4 font-semibold text-white">{p.title}</td>
                <td className="p-4 font-mono font-bold text-emerald-400">R$ {p.totalValue?.toLocaleString('pt-BR')}</td>
                <td className="p-4 text-slate-400">{p.validUntil}</td>
                <td className="p-4 text-slate-300">{p.responsible}</td>
                <td className="p-4"><span className="px-2.5 py-1 rounded-full bg-cyan-500/20 text-cyan-400 border border-cyan-500/30 font-medium">{p.status}</span></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function ContractsView({ contracts }: any) {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-white tracking-tight">NER Business • Contratos & Vigência</h2>
        <p className="text-sm text-slate-400">Gestão de contratos recorrentes e prazos de prestação de serviços.</p>
      </div>

      <div className="bg-slate-900/60 border border-slate-800 rounded-2xl overflow-hidden shadow-xl">
        <table className="w-full text-left text-xs">
          <thead className="bg-slate-950 border-b border-slate-800 text-slate-400 uppercase font-semibold">
            <tr>
              <th className="p-4">Contrato</th>
              <th className="p-4">Título</th>
              <th className="p-4">Valor</th>
              <th className="p-4">Recorrência</th>
              <th className="p-4">Vigência</th>
              <th className="p-4">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800/60">
            {contracts.map((c: any) => (
              <tr key={c.id} className="hover:bg-slate-800/30 transition-all">
                <td className="p-4 font-mono font-bold text-cyan-400">{c.number}</td>
                <td className="p-4 font-semibold text-white">{c.title}</td>
                <td className="p-4 font-mono font-bold text-emerald-400">R$ {c.value?.toLocaleString('pt-BR')}</td>
                <td className="p-4 text-slate-300">{c.recurrence}</td>
                <td className="p-4 text-slate-400">{c.startDate} até {c.endDate}</td>
                <td className="p-4"><span className="px-2.5 py-1 rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 font-medium">{c.status}</span></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function KpiCard({ title, value, change, isPositive, icon }: any) {
  return (
    <div className="bg-slate-900/60 border border-slate-800/80 rounded-2xl p-5 shadow-xl flex flex-col justify-between">
      <div className="flex items-center justify-between pb-3">
        <span className="text-xs font-medium text-slate-400">{title}</span>
        <div className="p-2 rounded-xl bg-slate-800/80 border border-slate-700/50">{icon}</div>
      </div>
      <div>
        <div className="text-2xl font-bold text-white tracking-tight">{value}</div>
        <div className={`text-xs mt-1 flex items-center gap-1 ${isPositive ? 'text-emerald-400' : 'text-rose-400'}`}>
          <ArrowUpRight className="w-3.5 h-3.5" /> {change}
        </div>
      </div>
    </div>
  );
}

function FinanceView({ financeSummary, receivables, payables, commissions }: any) {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-white tracking-tight">NER Business • Financeiro & P&L</h2>
        <p className="text-sm text-slate-400">Separação rigorosa entre Honorários da Agência e Verba de Mídia Paga pelo Cliente.</p>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <KpiCard title="Receita (Honorários Agência)" value={`R$ ${financeSummary?.agencyRevenue?.toLocaleString('pt-BR') || '0'}`} change="Faturamento líquido" isPositive={true} icon={<DollarSign className="w-5 h-5 text-cyan-400" />} />
        <KpiCard title="Verba de Mídia (Separada)" value={`R$ ${financeSummary?.mediaBudgetSeparated?.toLocaleString('pt-BR') || '0'}`} change="Direto nas plataformas" isPositive={true} icon={<TrendingUp className="w-5 h-5 text-blue-400" />} />
        <KpiCard title="Contas a Pagar" value={`R$ ${payables.reduce((a:number,b:any)=>a+b.amount,0).toLocaleString('pt-BR')}`} change="Despesas operacionais" isPositive={false} icon={<CreditCard className="w-5 h-5 text-rose-400" />} />
        <KpiCard title="Resultado Operacional (P&L)" value={`R$ ${financeSummary?.netOperatingResult?.toLocaleString('pt-BR') || '0'}`} change={`Margem: ${financeSummary?.operatingMargin}`} isPositive={true} icon={<PieChart className="w-5 h-5 text-emerald-400" />} />
      </div>

      {/* Receivables & Payables Tables */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-6 shadow-xl space-y-4">
          <h3 className="font-semibold text-white text-base">Contas a Receber (Honorários)</h3>
          <div className="space-y-3">
            {receivables.map((r: any) => (
              <div key={r.id} className="p-3.5 rounded-xl bg-slate-950 border border-slate-800 flex items-center justify-between text-xs">
                <div>
                  <div className="font-bold text-white">{r.clientName}</div>
                  <div className="text-slate-400 mt-0.5">{r.description} • Vencimento: {r.dueDate}</div>
                </div>
                <div className="text-right">
                  <div className="font-mono font-bold text-emerald-400">R$ {r.amount?.toLocaleString('pt-BR')}</div>
                  <span className="text-[10px] text-slate-500">Mídia Ads: R$ {r.mediaBudget?.toLocaleString('pt-BR')}</span>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-6 shadow-xl space-y-4">
          <h3 className="font-semibold text-white text-base">Contas a Pagar & Despesas</h3>
          <div className="space-y-3">
            {payables.map((p: any) => (
              <div key={p.id} className="p-3.5 rounded-xl bg-slate-950 border border-slate-800 flex items-center justify-between text-xs">
                <div>
                  <div className="font-bold text-white">{p.supplier}</div>
                  <div className="text-slate-400 mt-0.5">{p.description} • Categoria: {p.category}</div>
                </div>
                <div className="text-right">
                  <div className="font-mono font-bold text-rose-400">R$ {p.amount?.toLocaleString('pt-BR')}</div>
                  <span className="text-[10px] text-slate-500">Vence: {p.dueDate}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

// --- OTHER MODULES & CORE VIEWS ---
function DashboardView({ clients, leads, performanceData, currentOrg }: any) {
  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold text-white">Dashboard Executivo • {currentOrg.name}</h2>
      <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-6 shadow-xl">
        <p className="text-xs text-slate-400">Visão consolidada alimentada pelo NER Business e NER Performance.</p>
      </div>
    </div>
  );
}
function StrategyView() { return <div className="text-white text-lg">NER Strategy & IA</div>; }
function CreativeView({ creatives, clients }: any) { return <div className="text-white text-lg">NER Creative Factory</div>; }
function PerformanceView({ performanceData }: any) { return <div className="text-white text-lg">NER Performance Ads</div>; }
function WebView() { return <div className="text-white text-lg">NER Web Landing Pages</div>; }
function AutomationView({ workflows }: any) { return <div className="text-white text-lg">NER Automation n8n</div>; }
function ClientPortalView({ clients, creatives }: any) { return <div className="text-white text-lg">Portal do Cliente</div>; }
function UsersManagementView({ usersList, organizations }: any) { return <div className="text-white text-lg">Gestão de Usuários (NER Core)</div>; }
function OrganizationsView({ organizations }: any) { return <div className="text-white text-lg">Organizações (NER Core)</div>; }
function RbacView({ roles, permissions }: any) { return <div className="text-white text-lg">RBAC (NER Core)</div>; }
function AuditLogsView({ auditLogs }: any) { return <div className="text-white text-lg">Logs de Auditoria (NER Core)</div>; }
function InfraView({ healthStatus }: any) { return <div className="text-white text-lg">Infra & DevOps (Fases 01-12)</div>; }
