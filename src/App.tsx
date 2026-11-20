import React, { useEffect, useState } from 'react';
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
  LogOut,
  Layers,
  FileText,
  Building2,
  Key,
  Activity,
  FileCheck,
  FolderKanban,
  BarChart3,
  Sparkles,
  CheckCircle2,
  AlertCircle,
  Bot,
  KeyRound,
  Route,
  History,
  Settings,
  Menu,
  X,
} from 'lucide-react';
import { apiFetch } from './lib/api';
import { LoginScreen } from './components/LoginScreen';
import { UsersManagementView, OrganizationsView, RbacView, AuditLogsView } from './components/CoreViews';
import {
  CrmLeadsView,
  PipelineKanbanView,
  CommercialPlansView,
  ProposalsView,
  ContractsView,
  FinanceView,
} from './components/BusinessViews';
import {
  DashboardView,
  ProjectsView,
  CreativeView,
  PerformanceView,
  WebView,
  AutomationView,
  IntelligenceTrackingView,
  ClientPortalView,
  OperationsBillingView,
  StrategyView,
} from './components/OperationsViews';
import { AiCenterView, AiTabId } from './components/AiCenterViews';

type TabId =
  | 'dashboard'
  | 'business-crm'
  | 'business-pipeline'
  | 'business-plans'
  | 'business-proposals'
  | 'business-contracts'
  | 'business-finance'
  | 'projects'
  | 'strategy'
  | 'creative'
  | 'performance'
  | 'web'
  | 'automation'
  | 'intelligence-tracking'
  | 'client-portal'
  | 'core-users'
  | 'core-orgs'
  | 'core-rbac'
  | 'core-audit'
  | 'ops-billing'
  | AiTabId;

export default function App() {
  const [authChecking, setAuthChecking] = useState(true);
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [permissions, setPermissions] = useState<string[]>([]);
  const [activeOrgId, setActiveOrgId] = useState<string>('org-1');
  const [activeTab, setActiveTab] = useState<TabId>('dashboard');
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [toast, setToast] = useState<{ message: string; isError?: boolean } | null>(null);

  // Domain State
  const [organizations, setOrganizations] = useState<any[]>([]);
  const [usersList, setUsersList] = useState<any[]>([]);
  const [clients, setClients] = useState<any[]>([]);
  const [leads, setLeads] = useState<any[]>([]);
  const [opportunities, setOpportunities] = useState<any[]>([]);
  const [plans, setPlans] = useState<any[]>([]);
  const [proposals, setProposals] = useState<any[]>([]);
  const [contracts, setContracts] = useState<any[]>([]);
  const [financeSummary, setFinanceSummary] = useState<any>(null);
  const [receivables, setReceivables] = useState<any[]>([]);
  const [payables, setPayables] = useState<any[]>([]);
  const [commissions, setCommissions] = useState<any[]>([]);
  const [projects, setProjects] = useState<any[]>([]);
  const [briefings, setBriefings] = useState<any[]>([]);
  const [tasks, setTasks] = useState<any[]>([]);
  const [deliverables, setDeliverables] = useState<any[]>([]);
  const [approvals, setApprovals] = useState<any[]>([]);
  const [timeEntries, setTimeEntries] = useState<any[]>([]);
  const [creatives, setCreatives] = useState<any[]>([]);
  const [performanceData, setPerformanceData] = useState<any>(null);
  const [webPages, setWebPages] = useState<any[]>([]);
  const [workflows, setWorkflows] = useState<any[]>([]);
  const [intelligence, setIntelligence] = useState<any>(null);
  const [trackingEvents, setTrackingEvents] = useState<any[]>([]);
  const [tickets, setTickets] = useState<any[]>([]);
  const [operations, setOperations] = useState<any>(null);
  const [billing, setBilling] = useState<any>(null);
  const [roles, setRoles] = useState<any[]>([]);
  const [allPermissions, setAllPermissions] = useState<any[]>([]);
  const [auditLogs, setAuditLogs] = useState<any[]>([]);

  const notify = (message: string, isError = false) => {
    setToast({ message, isError });
    setTimeout(() => setToast(null), 4500);
  };

  const hasPerm = (perm: string) => permissions.includes('*') || permissions.includes(perm);

  useEffect(() => {
    (async () => {
      try {
        const me = await apiFetch<any>('/api/auth/me');
        setCurrentUser(me.user);
        setPermissions(me.permissions || []);
        setActiveOrgId(me.organizationId);
        if (me.user.role === 'Cliente') {
          setActiveTab('client-portal');
        }
      } catch {
        setCurrentUser(null);
      } finally {
        setAuthChecking(false);
      }
    })();
  }, []);

  useEffect(() => {
    if (currentUser) {
      loadScopedData();
    }
  }, [currentUser, activeOrgId]);

  const safeFetch = async <T,>(url: string, fallback: T): Promise<T> => {
    try {
      return await apiFetch<T>(url);
    } catch {
      return fallback;
    }
  };

  const loadScopedData = async () => {
    if (!currentUser) return;
    const q = `organizationId=${encodeURIComponent(activeOrgId)}`;
    const [
      orgs,
      users,
      cls,
      lds,
      opps,
      pls,
      props,
      cnts,
      finSum,
      recs,
      pays,
      coms,
      prjs,
      brfs,
      tsks,
      dels,
      apps,
      tims,
      crts,
      perf,
      wps,
      wfs,
      intl,
      evts,
      tkts,
      ops,
      bil,
      rls,
      permsList,
      auds,
    ] = await Promise.all([
      safeFetch('/api/organizations', []),
      hasPerm('users.read') ? safeFetch(`/api/users?${q}`, []) : Promise.resolve([]),
      hasPerm('clients.read') ? safeFetch(`/api/clients?${q}`, []) : Promise.resolve([]),
      hasPerm('leads.read') ? safeFetch(`/api/leads?${q}`, []) : Promise.resolve([]),
      hasPerm('opportunities.read') ? safeFetch(`/api/opportunities?${q}`, []) : Promise.resolve([]),
      hasPerm('plans.read') ? safeFetch('/api/plans', []) : Promise.resolve([]),
      hasPerm('proposals.read') ? safeFetch(`/api/proposals?${q}`, []) : Promise.resolve([]),
      hasPerm('contracts.read') ? safeFetch(`/api/contracts?${q}`, []) : Promise.resolve([]),
      hasPerm('finance.read') ? safeFetch(`/api/finance/summary?${q}`, null) : Promise.resolve(null),
      hasPerm('finance.read') ? safeFetch(`/api/finance/receivables?${q}`, []) : Promise.resolve([]),
      hasPerm('finance.read') ? safeFetch(`/api/finance/payables?${q}`, []) : Promise.resolve([]),
      hasPerm('finance.read') ? safeFetch(`/api/commissions?${q}`, []) : Promise.resolve([]),
      hasPerm('projects.read') ? safeFetch(`/api/projects?${q}`, []) : Promise.resolve([]),
      hasPerm('projects.read') ? safeFetch(`/api/briefings?${q}`, []) : Promise.resolve([]),
      hasPerm('tasks.read') ? safeFetch(`/api/tasks?${q}`, []) : Promise.resolve([]),
      hasPerm('projects.read') ? safeFetch(`/api/deliverables?${q}`, []) : Promise.resolve([]),
      hasPerm('approvals.read') ? safeFetch(`/api/approvals?${q}`, []) : Promise.resolve([]),
      hasPerm('projects.read') ? safeFetch(`/api/time-tracking?${q}`, []) : Promise.resolve([]),
      hasPerm('creative.read') ? safeFetch(`/api/creatives?${q}`, []) : Promise.resolve([]),
      hasPerm('performance.read') ? safeFetch(`/api/performance?${q}`, null) : Promise.resolve(null),
      hasPerm('web.read') ? safeFetch(`/api/web/pages?${q}`, []) : Promise.resolve([]),
      hasPerm('automation.read') ? safeFetch(`/api/workflows?${q}`, []) : Promise.resolve([]),
      hasPerm('intelligence.read') ? safeFetch(`/api/intelligence/summary?${q}`, null) : Promise.resolve(null),
      hasPerm('tracking.read') ? safeFetch(`/api/tracking/events?${q}`, []) : Promise.resolve([]),
      safeFetch(`/api/tickets?${q}`, []),
      hasPerm('operations.read') ? safeFetch(`/api/operations/overview?${q}`, null) : Promise.resolve(null),
      hasPerm('billing.read') ? safeFetch(`/api/billing/subscription?${q}`, null) : Promise.resolve(null),
      safeFetch('/api/roles', []),
      safeFetch('/api/permissions', []),
      hasPerm('audit.read') ? safeFetch(`/api/audit-logs?${q}`, []) : Promise.resolve([]),
    ]);

    setOrganizations(orgs);
    setUsersList(users);
    setClients(cls);
    setLeads(lds);
    setOpportunities(opps);
    setPlans(pls);
    setProposals(props);
    setContracts(cnts);
    setFinanceSummary(finSum);
    setReceivables(recs);
    setPayables(pays);
    setCommissions(coms);
    setProjects(prjs);
    setBriefings(brfs);
    setTasks(tsks);
    setDeliverables(dels);
    setApprovals(apps);
    setTimeEntries(tims);
    setCreatives(crts);
    setPerformanceData(perf);
    setWebPages(wps);
    setWorkflows(wfs);
    setIntelligence(intl);
    setTrackingEvents(evts);
    setTickets(tkts);
    setOperations(ops);
    setBilling(bil);
    setRoles(rls);
    setAllPermissions(permsList);
    setAuditLogs(auds);
  };

  const handleLogout = async () => {
    try {
      await apiFetch('/api/auth/logout', { method: 'POST' });
    } catch {
      // ignore
    }
    sessionStorage.removeItem('ner_token');
    setCurrentUser(null);
    setPermissions([]);
  };

  if (authChecking) {
    return (
      <div className="min-h-screen bg-slate-950 text-slate-300 flex items-center justify-center text-sm">
        Validando sessão segura...
      </div>
    );
  }

  if (!currentUser) {
    return (
      <LoginScreen
        onLoginSuccess={({ user, permissions: perms }) => {
          setCurrentUser(user);
          setPermissions(perms);
          setActiveOrgId(user.organizationId);
          setActiveTab(user.role === 'Cliente' ? 'client-portal' : 'dashboard');
        }}
      />
    );
  }

  const currentOrg = organizations.find((o) => o.id === activeOrgId) || organizations[0] || { name: 'NER Agency' };
  const isSuperAdmin = currentUser.role === 'Super Admin';
  const isClient = currentUser.role === 'Cliente';

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans selection:bg-cyan-500 selection:text-black">
      {toast && (
        <div
          className={`fixed bottom-5 right-5 z-50 px-4 py-3 rounded-xl border shadow-2xl text-xs font-medium flex items-center gap-2 ${
            toast.isError
              ? 'bg-rose-950/95 border-rose-500/40 text-rose-200'
              : 'bg-emerald-950/95 border-emerald-500/40 text-emerald-200'
          }`}
        >
          {toast.isError ? <AlertCircle className="w-4 h-4 text-rose-400" /> : <CheckCircle2 className="w-4 h-4 text-emerald-400" />}
          <span>{toast.message}</span>
        </div>
      )}

      <header className="border-b border-slate-800 bg-slate-900/80 backdrop-blur sticky top-0 z-40 px-6 py-3 flex items-center justify-between gap-4">
        <div className="flex items-center space-x-3 md:space-x-5">
          <button
            type="button"
            onClick={() => setMobileNavOpen((v) => !v)}
            className="md:hidden p-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200"
            aria-label="Alternar menu de navegação"
          >
            {mobileNavOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-cyan-600 to-blue-600 flex items-center justify-center shadow-lg shadow-cyan-900/40">
              <span className="font-black text-white text-lg tracking-wider">NER</span>
            </div>
            <div>
              <h1 className="font-bold text-sm tracking-wide text-white flex items-center gap-2">
                NER AGENCY OS
                <span className="hidden sm:inline text-[10px] px-2 py-0.5 rounded bg-cyan-500/20 text-cyan-400 border border-cyan-500/30">
                  Digital Studio + RBAC
                </span>
              </h1>
              <p className="text-xs text-slate-400">{currentOrg.name}</p>
            </div>
          </div>

          <div className="flex items-center space-x-2 bg-slate-950 border border-slate-800 px-3 py-1.5 rounded-lg text-xs">
            <Building2 className="w-4 h-4 text-cyan-400" />
            <span className="text-slate-400">Tenant:</span>
            {isSuperAdmin ? (
              <select
                value={activeOrgId}
                onChange={(e) => setActiveOrgId(e.target.value)}
                className="bg-transparent text-white font-semibold focus:outline-none cursor-pointer"
              >
                {organizations.map((org) => (
                  <option key={org.id} value={org.id} className="bg-slate-900 text-white">
                    {org.name}
                  </option>
                ))}
              </select>
            ) : (
              <span className="text-white font-semibold">{currentOrg.name}</span>
            )}
          </div>
        </div>

        <div className="flex items-center space-x-3">
          <div className="flex items-center space-x-2 bg-slate-900 px-3 py-1.5 rounded-lg border border-slate-800 text-xs">
            <div className="w-2 h-2 rounded-full bg-emerald-500" />
            <span className="text-slate-200">{currentUser.name}</span>
            <span className="text-cyan-400 font-mono">({currentUser.role})</span>
          </div>

          <button
            onClick={handleLogout}
            className="p-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-rose-400 transition-all"
            title="Encerrar Sessão"
          >
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden relative">
        {mobileNavOpen && (
          <div
            className="fixed inset-0 bg-black/60 z-30 md:hidden"
            onClick={() => setMobileNavOpen(false)}
          />
        )}
        <aside
          className={`${
            mobileNavOpen ? 'fixed inset-y-0 left-0 z-40 flex pt-16' : 'hidden'
          } md:static md:flex w-64 border-r border-slate-800 bg-slate-900/95 md:bg-slate-900/40 p-4 flex-col justify-between overflow-y-auto shrink-0`}
        >
          <nav className="space-y-1" onClick={() => setMobileNavOpen(false)}>
            {!isClient && (
              <>
                <SidebarItem icon={<LayoutDashboard className="w-4 h-4" />} label="Dashboard Executivo" active={activeTab === 'dashboard'} onClick={() => setActiveTab('dashboard')} />

                <div className="pt-3 text-[10px] uppercase font-semibold text-cyan-400 px-3 pb-1 tracking-wider">
                  NER Business & Studio
                </div>
                {hasPerm('leads.read') && <SidebarItem icon={<Briefcase className="w-4 h-4" />} label="CRM & Leads" active={activeTab === 'business-crm'} onClick={() => setActiveTab('business-crm')} />}
                {hasPerm('opportunities.read') && <SidebarItem icon={<Target className="w-4 h-4" />} label="Pipeline Comercial" active={activeTab === 'business-pipeline'} onClick={() => setActiveTab('business-pipeline')} />}
                {hasPerm('plans.read') && <SidebarItem icon={<Layers className="w-4 h-4" />} label="Planos Digital Studio" active={activeTab === 'business-plans'} onClick={() => setActiveTab('business-plans')} />}
                {hasPerm('proposals.read') && <SidebarItem icon={<FileText className="w-4 h-4" />} label="Propostas" active={activeTab === 'business-proposals'} onClick={() => setActiveTab('business-proposals')} />}
                {hasPerm('contracts.read') && <SidebarItem icon={<FileCheck className="w-4 h-4" />} label="Contratos" active={activeTab === 'business-contracts'} onClick={() => setActiveTab('business-contracts')} />}
                {hasPerm('finance.read') && <SidebarItem icon={<DollarSign className="w-4 h-4" />} label="Financeiro & P&L" active={activeTab === 'business-finance'} onClick={() => setActiveTab('business-finance')} />}

                <div className="pt-3 text-[10px] uppercase font-semibold text-slate-500 px-3 pb-1 tracking-wider">
                  Operação & Delivery
                </div>
                {hasPerm('projects.read') && <SidebarItem icon={<FolderKanban className="w-4 h-4" />} label="NER Projects" active={activeTab === 'projects'} onClick={() => setActiveTab('projects')} />}
                {hasPerm('creative.read') && <SidebarItem icon={<Clapperboard className="w-4 h-4" />} label="NER Creative" active={activeTab === 'creative'} onClick={() => setActiveTab('creative')} />}
                {hasPerm('performance.read') && <SidebarItem icon={<TrendingUp className="w-4 h-4" />} label="NER Performance" active={activeTab === 'performance'} onClick={() => setActiveTab('performance')} />}
                {hasPerm('web.read') && <SidebarItem icon={<Globe className="w-4 h-4" />} label="NER Web (LPs & Sites)" active={activeTab === 'web'} onClick={() => setActiveTab('web')} />}
                {hasPerm('automation.read') && <SidebarItem icon={<Cpu className="w-4 h-4" />} label="NER Automation" active={activeTab === 'automation'} onClick={() => setActiveTab('automation')} />}
                {(hasPerm('intelligence.read') || hasPerm('tracking.read')) && (
                  <SidebarItem icon={<BarChart3 className="w-4 h-4" />} label="Intelligence & Tracking" active={activeTab === 'intelligence-tracking'} onClick={() => setActiveTab('intelligence-tracking')} />
                )}
                <SidebarItem icon={<Sparkles className="w-4 h-4" />} label="NER Strategy & IA" active={activeTab === 'strategy'} onClick={() => setActiveTab('strategy')} />
              </>
            )}

            <div className="pt-3 text-[10px] uppercase font-semibold text-slate-500 px-3 pb-1 tracking-wider">
              Cliente & Governança
            </div>
            <SidebarItem icon={<ShieldCheck className="w-4 h-4" />} label="Portal do Cliente" active={activeTab === 'client-portal'} onClick={() => setActiveTab('client-portal')} />
            {hasPerm('users.read') && <SidebarItem icon={<Users className="w-4 h-4" />} label="Usuários" active={activeTab === 'core-users'} onClick={() => setActiveTab('core-users')} />}
            {!isClient && <SidebarItem icon={<Building2 className="w-4 h-4" />} label="Organizações" active={activeTab === 'core-orgs'} onClick={() => setActiveTab('core-orgs')} />}
            {!isClient && <SidebarItem icon={<Key className="w-4 h-4" />} label="Perfis & RBAC" active={activeTab === 'core-rbac'} onClick={() => setActiveTab('core-rbac')} />}
            {hasPerm('audit.read') && <SidebarItem icon={<Activity className="w-4 h-4" />} label="Logs de Auditoria" active={activeTab === 'core-audit'} onClick={() => setActiveTab('core-audit')} />}
            {(hasPerm('operations.read') || hasPerm('billing.read')) && !isClient && (
              <SidebarItem icon={<Server className="w-4 h-4" />} label="Operações & Billing" active={activeTab === 'ops-billing'} onClick={() => setActiveTab('ops-billing')} />
            )}

            {hasPerm('ai.read') && !isClient && (
              <>
                <div className="pt-3 text-[10px] uppercase font-semibold text-cyan-400 px-3 pb-1 tracking-wider">
                  NER AI CENTER
                </div>
                <SidebarItem icon={<Bot className="w-4 h-4" />} label="Dashboard de IA" active={activeTab === 'ai-dashboard'} onClick={() => setActiveTab('ai-dashboard')} />
                <SidebarItem icon={<KeyRound className="w-4 h-4" />} label="Provedores" active={activeTab === 'ai-providers'} onClick={() => setActiveTab('ai-providers')} />
                <SidebarItem icon={<Layers className="w-4 h-4" />} label="Modelos" active={activeTab === 'ai-models'} onClick={() => setActiveTab('ai-models')} />
                <SidebarItem icon={<Route className="w-4 h-4" />} label="Roteamento" active={activeTab === 'ai-routing'} onClick={() => setActiveTab('ai-routing')} />
                <SidebarItem icon={<FileText className="w-4 h-4" />} label="Prompts" active={activeTab === 'ai-prompts'} onClick={() => setActiveTab('ai-prompts')} />
                <SidebarItem icon={<DollarSign className="w-4 h-4" />} label="Consumo e Custos" active={activeTab === 'ai-costs'} onClick={() => setActiveTab('ai-costs')} />
                <SidebarItem icon={<History className="w-4 h-4" />} label="Histórico" active={activeTab === 'ai-history'} onClick={() => setActiveTab('ai-history')} />
                <SidebarItem icon={<Settings className="w-4 h-4" />} label="Configurações" active={activeTab === 'ai-settings'} onClick={() => setActiveTab('ai-settings')} />
              </>
            )}
          </nav>

          <div className="mt-4 p-3 bg-slate-900/80 rounded-xl border border-slate-800 text-[11px] space-y-1">
            <div className="flex justify-between">
              <span className="text-slate-400">Persistência</span>
              <span className="text-emerald-400 font-mono">Atômica Disco</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-400">Isolamento</span>
              <span className="text-cyan-400 font-mono">{activeOrgId}</span>
            </div>
          </div>
        </aside>

        <main className="flex-1 overflow-y-auto p-6 md:p-8 bg-slate-950">
          {activeTab === 'dashboard' && (
            <DashboardView
              clients={clients}
              leads={leads}
              projects={projects}
              financeSummary={financeSummary}
              performanceData={performanceData}
              currentOrg={currentOrg}
            />
          )}
          {activeTab === 'business-crm' && (
            <CrmLeadsView leads={leads} activeOrgId={activeOrgId} onRefresh={loadScopedData} onNotify={notify} />
          )}
          {activeTab === 'business-pipeline' && (
            <PipelineKanbanView
              opportunities={opportunities}
              clients={clients}
              activeOrgId={activeOrgId}
              onRefresh={loadScopedData}
              onNotify={notify}
            />
          )}
          {activeTab === 'business-plans' && (
            <CommercialPlansView
              plans={plans}
              clients={clients}
              activeOrgId={activeOrgId}
              currentUser={currentUser}
              onRefresh={loadScopedData}
              onNotify={notify}
              onNavigateProjects={() => setActiveTab('projects')}
            />
          )}
          {activeTab === 'business-proposals' && (
            <ProposalsView
              proposals={proposals}
              clients={clients}
              activeOrgId={activeOrgId}
              onRefresh={loadScopedData}
              onNotify={notify}
            />
          )}
          {activeTab === 'business-contracts' && <ContractsView contracts={contracts} />}
          {activeTab === 'business-finance' && (
            <FinanceView
              financeSummary={financeSummary}
              receivables={receivables}
              payables={payables}
              commissions={commissions}
              onRefresh={loadScopedData}
              onNotify={notify}
            />
          )}
          {activeTab === 'projects' && (
            <ProjectsView
              projects={projects}
              tasks={tasks}
              deliverables={deliverables}
              briefings={briefings}
              approvals={approvals}
              timeEntries={timeEntries}
              clients={clients}
              activeOrgId={activeOrgId}
              onRefresh={loadScopedData}
              onNotify={notify}
            />
          )}
          {activeTab === 'creative' && (
            <CreativeView
              creatives={creatives}
              clients={clients}
              activeOrgId={activeOrgId}
              onRefresh={loadScopedData}
              onNotify={notify}
            />
          )}
          {activeTab === 'performance' && (
            <PerformanceView performanceData={performanceData} onRefresh={loadScopedData} onNotify={notify} />
          )}
          {activeTab === 'web' && (
            <WebView
              webPages={webPages}
              clients={clients}
              activeOrgId={activeOrgId}
              onRefresh={loadScopedData}
              onNotify={notify}
            />
          )}
          {activeTab === 'automation' && (
            <AutomationView workflows={workflows} onRefresh={loadScopedData} onNotify={notify} />
          )}
          {activeTab === 'intelligence-tracking' && (
            <IntelligenceTrackingView
              intelligence={intelligence}
              trackingEvents={trackingEvents}
              clients={clients}
              activeOrgId={activeOrgId}
              onRefresh={loadScopedData}
              onNotify={notify}
            />
          )}
          {activeTab === 'strategy' && <StrategyView activeOrgId={activeOrgId} onNotify={notify} />}
          {activeTab === 'client-portal' && (
            <ClientPortalView
              projects={projects}
              approvals={approvals}
              receivables={receivables}
              tickets={tickets}
              clients={clients}
              activeOrgId={activeOrgId}
              currentUser={currentUser}
              onRefresh={loadScopedData}
              onNotify={notify}
            />
          )}
          {activeTab === 'core-users' && (
            <UsersManagementView
              usersList={usersList}
              organizations={organizations}
              clients={clients}
              activeOrgId={activeOrgId}
              currentUser={currentUser}
              onRefresh={loadScopedData}
              onNotify={notify}
            />
          )}
          {activeTab === 'core-orgs' && (
            <OrganizationsView
              organizations={organizations}
              currentUser={currentUser}
              onRefresh={loadScopedData}
              onNotify={notify}
            />
          )}
          {activeTab === 'core-rbac' && <RbacView roles={roles} permissions={allPermissions} />}
          {activeTab === 'core-audit' && (
            <AuditLogsView
              auditLogs={auditLogs}
              clients={clients}
              currentUser={currentUser}
              onRefresh={loadScopedData}
              onNotify={notify}
            />
          )}
          {activeTab === 'ops-billing' && (
            <OperationsBillingView
              operations={operations}
              billing={billing}
              plans={plans}
              activeOrgId={activeOrgId}
              onRefresh={loadScopedData}
              onNotify={notify}
            />
          )}
          {activeTab.startsWith('ai-') && (
            <AiCenterView
              activeTab={activeTab as AiTabId}
              activeOrgId={activeOrgId}
              currentUser={currentUser}
              clients={clients}
              permissions={permissions}
              onNotify={notify}
            />
          )}
        </main>
      </div>
    </div>
  );
}

function SidebarItem({ icon, label, active, onClick }: { icon: React.ReactNode; label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={`w-full flex items-center space-x-3 px-3 py-2 rounded-xl text-xs font-medium transition-all ${
        active
          ? 'bg-gradient-to-r from-cyan-600/20 to-blue-600/10 text-cyan-400 border border-cyan-500/30'
          : 'text-slate-400 hover:text-white hover:bg-slate-800/60'
      }`}
    >
      {icon}
      <span>{label}</span>
    </button>
  );
}
