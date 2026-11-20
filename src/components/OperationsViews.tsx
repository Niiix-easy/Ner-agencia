import React, { useState, useEffect } from 'react';
import {
  LayoutDashboard,
  FolderKanban,
  CheckCircle2,
  Clock,
  Sparkles,
  Clapperboard,
  TrendingUp,
  Globe,
  Cpu,
  BarChart3,
  ShieldCheck,
  Server,
  CreditCard,
  Plus,
  Send,
  AlertTriangle,
  RefreshCw,
} from 'lucide-react';
import { apiFetch, formatCurrencyBRL } from '../lib/api';
import { DepartmentAiWidget } from './AiCenterViews';

export function DashboardView({ clients, leads, projects, financeSummary, performanceData, currentOrg }: any) {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-white tracking-tight flex items-center gap-2">
          <LayoutDashboard className="w-6 h-6 text-cyan-400" /> Dashboard Executivo • {currentOrg?.name}
        </h2>
        <p className="text-sm text-slate-400">Métricas consolidadas diretamente da camada transacional da organização ativa.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-5">
          <div className="text-xs text-slate-400">Clientes Ativos</div>
          <div className="text-2xl font-bold text-white mt-1">{clients.length}</div>
          <div className="text-xs text-cyan-400 mt-1">{leads.length} leads no CRM</div>
        </div>
        <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-5">
          <div className="text-xs text-slate-400">Projetos em Operação</div>
          <div className="text-2xl font-bold text-white mt-1">{projects.length}</div>
          <div className="text-xs text-emerald-400 mt-1">
            {projects.filter((p: any) => p.progress === 100).length} concluídos
          </div>
        </div>
        <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-5">
          <div className="text-xs text-slate-400">Receita Honorários (Agência)</div>
          <div className="text-2xl font-bold text-emerald-400 mt-1">{formatCurrencyBRL(financeSummary?.agencyRevenue)}</div>
          <div className="text-xs text-slate-400 mt-1">P&L: {formatCurrencyBRL(financeSummary?.netOperatingResult)}</div>
        </div>
        <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-5">
          <div className="text-xs text-slate-400">Investimento Mídia Gerenciada</div>
          <div className="text-2xl font-bold text-blue-300 mt-1">{formatCurrencyBRL(performanceData?.summary?.totalSpend)}</div>
          <div className="text-xs text-cyan-400 mt-1">ROAS Médio: {performanceData?.summary?.averageRoas || 0}x</div>
        </div>
      </div>
    </div>
  );
}

export function ProjectsView({
  projects,
  tasks,
  deliverables,
  briefings,
  approvals,
  timeEntries,
  clients,
  activeOrgId,
  onRefresh,
  onNotify,
}: any) {
  const [selectedProjectId, setSelectedProjectId] = useState<string>(projects[0]?.id || '');
  const [newTaskTitle, setNewTaskTitle] = useState('');
  const [newBriefing, setNewBriefing] = useState({ title: '', objective: '', targetAudience: '' });
  const [newTime, setNewTime] = useState({ description: '', duration: 2 });

  useEffect(() => {
    setSelectedProjectId((prev) => (projects.some((p: any) => p.id === prev) ? prev : (projects[0]?.id || '')));
  }, [activeOrgId, projects]);

  const activeProject = projects.find((p: any) => p.id === selectedProjectId) || projects[0];
  const prjTasks = tasks.filter((t: any) => t.projectId === activeProject?.id);
  const prjDeliverables = deliverables.filter((d: any) => d.projectId === activeProject?.id);
  const prjBriefings = briefings.filter((b: any) => b.projectId === activeProject?.id);
  const prjApprovals = approvals.filter((a: any) => a.projectId === activeProject?.id);
  const prjTime = timeEntries.filter((t: any) => t.projectId === activeProject?.id);

  const handleTaskStatus = async (taskId: string, status: string) => {
    try {
      const res = await apiFetch<any>(`/api/tasks/${taskId}`, {
        method: 'PATCH',
        body: JSON.stringify({ status }),
      });
      onNotify(`Tarefa atualizada. Progresso do projeto recalculado: ${res.projectProgress}%`);
      onRefresh();
    } catch (err: any) {
      onNotify(err.message, true);
    }
  };

  const handleCreateTask = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeProject) return;
    try {
      await apiFetch('/api/tasks', {
        method: 'POST',
        body: JSON.stringify({ organizationId: activeOrgId, projectId: activeProject.id, title: newTaskTitle }),
      });
      setNewTaskTitle('');
      onNotify('Tarefa adicionada ao projeto.');
      onRefresh();
    } catch (err: any) {
      onNotify(err.message, true);
    }
  };

  const handleCreateBriefing = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeProject) return;
    try {
      await apiFetch('/api/briefings', {
        method: 'POST',
        body: JSON.stringify({ organizationId: activeOrgId, projectId: activeProject.id, ...newBriefing }),
      });
      setNewBriefing({ title: '', objective: '', targetAudience: '' });
      onNotify('Briefing estruturado e salvo.');
      onRefresh();
    } catch (err: any) {
      onNotify(err.message, true);
    }
  };

  const handleLogTime = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeProject) return;
    try {
      await apiFetch('/api/time-tracking', {
        method: 'POST',
        body: JSON.stringify({ organizationId: activeOrgId, projectId: activeProject.id, ...newTime }),
      });
      setNewTime({ description: '', duration: 2 });
      onNotify('Horas lançadas no projeto.');
      onRefresh();
    } catch (err: any) {
      onNotify(err.message, true);
    }
  };

  const handleApprovalDecision = async (app: any, status: string) => {
    try {
      await apiFetch(`/api/approvals/${app.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ status, expectedVersion: app.version }),
      });
      onNotify(`Aprovação marcada como "${status}".`);
      onRefresh();
    } catch (err: any) {
      onNotify(err.message, true);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-white tracking-tight flex items-center gap-2">
          <FolderKanban className="w-6 h-6 text-cyan-400" /> NER Projects • Operação, Tarefas & Entregáveis
        </h2>
        <p className="text-sm text-slate-400">
          Projetos alimentados por contratos do NER Digital Studio com cálculo automático de progresso.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="space-y-3">
          <div className="text-xs font-semibold uppercase text-slate-400">Projetos na Organização</div>
          {projects.map((p: any) => {
            const client = clients.find((c: any) => c.id === p.clientId);
            const selected = activeProject?.id === p.id;
            return (
              <button
                key={p.id}
                onClick={() => setSelectedProjectId(p.id)}
                className={`w-full text-left p-4 rounded-2xl border transition-all space-y-2 ${
                  selected ? 'bg-slate-900 border-cyan-500/60 shadow-lg' : 'bg-slate-900/50 border-slate-800 hover:border-slate-700'
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[10px] px-2 py-0.5 rounded bg-cyan-500/15 text-cyan-300 font-mono">{p.projectType}</span>
                  <span className="text-[10px] text-slate-400">{p.status}</span>
                </div>
                <div className="font-bold text-sm text-white">{p.name}</div>
                <div className="text-xs text-slate-400">{client?.name || p.clientId} • Entrega: {p.dueDate}</div>
                <div className="w-full h-1.5 bg-slate-800 rounded-full overflow-hidden">
                  <div className="h-full bg-emerald-500 transition-all" style={{ width: `${p.progress || 0}%` }} />
                </div>
                <div className="text-[10px] text-right font-mono text-emerald-400">{p.progress || 0}% concluído</div>
              </button>
            );
          })}
        </div>

        {activeProject && (
          <div className="lg:col-span-2 space-y-5">
            <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-5 space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="font-bold text-white text-base">Tarefas & Checklists ({prjTasks.length})</h3>
                <span className="text-xs font-mono text-cyan-400">Progresso: {activeProject.progress}%</span>
              </div>
              <form onSubmit={handleCreateTask} className="flex gap-2">
                <input
                  type="text"
                  required
                  value={newTaskTitle}
                  onChange={(e) => setNewTaskTitle(e.target.value)}
                  placeholder="Nova tarefa operacional..."
                  className="flex-1 bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-white"
                />
                <button type="submit" className="px-3 py-2 rounded-lg bg-cyan-600 text-white text-xs font-semibold">
                  <Plus className="w-4 h-4" />
                </button>
              </form>
              <div className="space-y-2">
                {prjTasks.map((t: any) => (
                  <div key={t.id} className="p-3 rounded-xl bg-slate-950 border border-slate-800 flex items-center justify-between gap-3 text-xs">
                    <div>
                      <div className="font-medium text-white">{t.title}</div>
                      <div className="text-[10px] text-slate-400">Prioridade: {t.priority} • Est: {t.estimatedHours}h</div>
                    </div>
                    <select
                      value={t.status}
                      onChange={(e) => handleTaskStatus(t.id, e.target.value)}
                      className="bg-slate-900 border border-slate-700 rounded px-2 py-1 text-xs text-cyan-300"
                    >
                      <option value="Backlog">Backlog</option>
                      <option value="A fazer">A fazer</option>
                      <option value="Em andamento">Em andamento</option>
                      <option value="Em revisão">Em revisão</option>
                      <option value="Concluída">Concluída</option>
                    </select>
                  </div>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-5 space-y-3">
                <h4 className="font-bold text-white text-sm">Entregáveis do Template ({prjDeliverables.length})</h4>
                {prjDeliverables.map((d: any) => (
                  <div key={d.id} className="p-3 rounded-xl bg-slate-950 border border-slate-800 text-xs flex justify-between items-center">
                    <div>
                      <div className="text-white font-medium">{d.name}</div>
                      <div className="text-[10px] text-slate-400">{d.type} • {d.version}</div>
                    </div>
                    <span className="px-2 py-0.5 rounded bg-slate-800 text-cyan-300 text-[10px]">{d.status}</span>
                  </div>
                ))}
              </div>

              <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-5 space-y-3">
                <h4 className="font-bold text-white text-sm">Aprovações Vinculadas à Versão ({prjApprovals.length})</h4>
                {prjApprovals.map((a: any) => (
                  <div key={a.id} className="p-3 rounded-xl bg-slate-950 border border-slate-800 text-xs space-y-2">
                    <div className="flex justify-between">
                      <span className="font-medium text-white">{a.title} ({a.version})</span>
                      <span className="text-[10px] text-cyan-400">{a.status}</span>
                    </div>
                    {a.status === 'Pendente' && (
                      <div className="flex gap-2">
                        <button onClick={() => handleApprovalDecision(a, 'Aprovado')} className="px-2 py-1 rounded bg-emerald-600/20 text-emerald-300 text-[10px]">
                          Aprovar
                        </button>
                        <button onClick={() => handleApprovalDecision(a, 'Alterações solicitadas')} className="px-2 py-1 rounded bg-amber-600/20 text-amber-300 text-[10px]">
                          Solicitar Ajuste
                        </button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <form onSubmit={handleCreateBriefing} className="bg-slate-900/60 border border-slate-800 rounded-2xl p-5 space-y-3">
                <h4 className="font-bold text-white text-sm">Briefings ({prjBriefings.length})</h4>
                {prjBriefings.map((b: any) => (
                  <div key={b.id} className="p-2.5 rounded-lg bg-slate-950 border border-slate-800 text-xs">
                    <div className="font-semibold text-white">{b.title}</div>
                    <div className="text-slate-400 text-[11px]">{b.objective}</div>
                  </div>
                ))}
                <input type="text" required placeholder="Título do briefing" value={newBriefing.title} onChange={(e) => setNewBriefing({ ...newBriefing, title: e.target.value })} className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-1.5 text-xs text-white" />
                <input type="text" required placeholder="Objetivo principal" value={newBriefing.objective} onChange={(e) => setNewBriefing({ ...newBriefing, objective: e.target.value })} className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-1.5 text-xs text-white" />
                <button type="submit" className="px-3 py-1.5 rounded-lg bg-cyan-600 text-white text-xs font-semibold">Salvar Briefing</button>
              </form>

              <form onSubmit={handleLogTime} className="bg-slate-900/60 border border-slate-800 rounded-2xl p-5 space-y-3">
                <h4 className="font-bold text-white text-sm flex items-center gap-1.5">
                  <Clock className="w-4 h-4 text-cyan-400" /> Time Tracking ({prjTime.reduce((s: number, t: any) => s + t.duration, 0)}h)
                </h4>
                {prjTime.map((t: any) => (
                  <div key={t.id} className="p-2 rounded-lg bg-slate-950 border border-slate-800 text-xs flex justify-between">
                    <span className="text-slate-300">{t.description}</span>
                    <span className="font-mono text-cyan-400">{t.duration}h</span>
                  </div>
                ))}
                <div className="flex gap-2">
                  <input type="text" required placeholder="Atividade" value={newTime.description} onChange={(e) => setNewTime({ ...newTime, description: e.target.value })} className="flex-1 bg-slate-950 border border-slate-800 rounded-lg px-3 py-1.5 text-xs text-white" />
                  <input type="number" min={0.5} step={0.5} required value={newTime.duration} onChange={(e) => setNewTime({ ...newTime, duration: Number(e.target.value) })} className="w-20 bg-slate-950 border border-slate-800 rounded-lg px-2 py-1.5 text-xs text-white" />
                </div>
                <button type="submit" className="px-3 py-1.5 rounded-lg bg-cyan-600 text-white text-xs font-semibold">Lançar Horas</button>
              </form>
            </div>
          </div>
        )}
      </div>

      <DepartmentAiWidget
        department="NER Digital Studio"
        title="Assistente IA • NER Digital Studio (Requisitos, Arquitetura & QA)"
        placeholder="Ex: Gere critérios de aceite e plano de testes para esta entrega..."
        defaultInput="Estruture os requisitos técnicos, critérios de aceite e checklist de segurança para este projeto."
        clientId={activeProject?.clientId}
        projectId={activeProject?.id}
        onNotify={onNotify}
      />
    </div>
  );
}

export function CreativeView({ creatives, clients, activeOrgId, onRefresh, onNotify }: any) {
  const [form, setForm] = useState({ clientId: clients[0]?.id || '', name: '', format: '9:16', platform: 'Meta Ads', usageRights: 'Próprio' });

  useEffect(() => {
    setForm((prev) => ({
      ...prev,
      clientId: clients.some((c: any) => c.id === prev.clientId) ? prev.clientId : (clients[0]?.id || ''),
    }));
  }, [activeOrgId, clients]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await apiFetch('/api/creatives', {
        method: 'POST',
        body: JSON.stringify({ ...form, clientId: form.clientId || clients[0]?.id, organizationId: activeOrgId }),
      });
      setForm({ ...form, name: '' });
      onNotify('Criativo cadastrado na fábrica.');
      onRefresh();
    } catch (err: any) {
      onNotify(err.message, true);
    }
  };

  const bumpVersion = async (id: string) => {
    try {
      await apiFetch(`/api/creatives/${id}`, { method: 'PATCH', body: JSON.stringify({ bumpVersion: true }) });
      onNotify('Nova versão gerada e enviada para revisão.');
      onRefresh();
    } catch (err: any) {
      onNotify(err.message, true);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-white tracking-tight flex items-center gap-2">
          <Clapperboard className="w-6 h-6 text-cyan-400" /> NER Creative • Fábrica de Criativos & Direitos
        </h2>
        <p className="text-sm text-slate-400">Versionamento, revisão obrigatória e controle de direitos de imagem/uso.</p>
      </div>

      <form onSubmit={handleCreate} className="bg-slate-900/60 border border-slate-800 rounded-2xl p-4 grid grid-cols-1 md:grid-cols-5 gap-3">
        <select value={form.clientId} onChange={(e) => setForm({ ...form, clientId: e.target.value })} className="bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-white">
          {clients.map((c: any) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <input type="text" required placeholder="Nome da peça / roteiro" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="md:col-span-2 bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-white" />
        <select value={form.usageRights} onChange={(e) => setForm({ ...form, usageRights: e.target.value })} className="bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-white">
          <option value="Próprio">Uso Próprio</option>
          <option value="Fornecido pelo cliente">Fornecido pelo cliente</option>
          <option value="IA (Revisão pendente)">IA (Revisão pendente)</option>
          <option value="Licenciado">Licenciado</option>
        </select>
        <button type="submit" className="px-4 py-2 rounded-lg bg-cyan-600 text-white text-xs font-semibold">Adicionar Criativo</button>
      </form>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {creatives.map((c: any) => (
          <div key={c.id} className="bg-slate-900/60 border border-slate-800 rounded-2xl p-5 space-y-2">
            <div className="flex justify-between items-start">
              <div>
                <h3 className="font-bold text-white text-sm">{c.name}</h3>
                <p className="text-xs text-slate-400">{c.client} • {c.platform} • Formato {c.format}</p>
              </div>
              <span className="text-xs font-mono text-cyan-400">{c.version}</span>
            </div>
            <div className="flex items-center justify-between pt-2 border-t border-slate-800 text-xs">
              <span className="text-slate-300">Direitos: <strong>{c.usageRights}</strong></span>
              <div className="flex items-center gap-2">
                <span className="px-2 py-0.5 rounded bg-slate-800 text-cyan-300">{c.status}</span>
                <button onClick={() => bumpVersion(c.id)} className="px-2 py-1 rounded bg-slate-800 hover:bg-slate-700 text-xs text-slate-200">
                  Nova Versão
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>

      <DepartmentAiWidget
        department="NER Creative"
        title="Assistente IA • NER Creative (Copies, Hooks & Roteiros)"
        placeholder="Ex: Gere 3 variações de hook e copy para Reels 9:16..."
        defaultInput="Crie 3 variações de hook (3s), headline e CTA para campanha de conversão."
        clientId={form.clientId || clients[0]?.id}
        onNotify={onNotify}
      />
    </div>
  );
}

export function PerformanceView({ performanceData, onRefresh, onNotify }: any) {
  const accounts = performanceData?.adAccounts || [];
  const recommendations = performanceData?.recommendations || [];

  const updateBudget = async (acc: any) => {
    const next = acc.dailyLimit + 250;
    try {
      await apiFetch(`/api/performance/accounts/${acc.id}/budget`, {
        method: 'PATCH',
        body: JSON.stringify({ dailyLimit: next }),
      });
      onNotify(`Limite diário de ${acc.name} ajustado para ${formatCurrencyBRL(next)}.`);
      onRefresh();
    } catch (err: any) {
      onNotify(err.message, true);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-white tracking-tight flex items-center gap-2">
          <TrendingUp className="w-6 h-6 text-cyan-400" /> NER Performance • Mídia Paga & Guardrails
        </h2>
        <p className="text-sm text-slate-400">
          Status real de integração das contas e recomendações bloqueadas por significância estatística.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {accounts.map((acc: any) => (
          <div key={acc.id} className="bg-slate-900/60 border border-slate-800 rounded-2xl p-5 space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <span className="text-[10px] font-mono text-cyan-400">{acc.platform}</span>
                <h3 className="font-bold text-white text-base">{acc.name}</h3>
              </div>
              <span
                className={`text-[10px] px-2.5 py-1 rounded-full border ${
                  acc.connectionStatus === 'Conectado (OAuth)'
                    ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30'
                    : 'bg-amber-500/15 text-amber-300 border-amber-500/30'
                }`}
              >
                {acc.connectionStatus}
              </span>
            </div>
            <div className="grid grid-cols-4 gap-2 bg-slate-950 p-3 rounded-xl border border-slate-800 text-xs">
              <div><span className="text-slate-400 block text-[10px]">Spend</span><span className="font-mono text-white">{formatCurrencyBRL(acc.spend)}</span></div>
              <div><span className="text-slate-400 block text-[10px]">Conversões</span><span className="font-mono text-white">{acc.conversions}</span></div>
              <div><span className="text-slate-400 block text-[10px]">ROAS</span><span className="font-mono text-emerald-400">{acc.roas}x</span></div>
              <div><span className="text-slate-400 block text-[10px]">Teto Diário</span><span className="font-mono text-cyan-400">{formatCurrencyBRL(acc.dailyLimit)}</span></div>
            </div>
            <div className="flex justify-end">
              <button onClick={() => updateBudget(acc)} className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs text-slate-200">
                + R$ 250 Teto Diário
              </button>
            </div>
          </div>
        ))}
      </div>

      <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-5 space-y-3">
        <h3 className="font-bold text-white text-sm">Recomendações com Validação Estatística</h3>
        {recommendations.map((r: any) => (
          <div key={r.accountId} className="p-3 rounded-xl bg-slate-950 border border-slate-800 text-xs">
            <div className="font-semibold text-cyan-400">{r.accountName} — {r.status}</div>
            <div className="text-slate-300 mt-1">{r.reason}</div>
          </div>
        ))}
      </div>

      <DepartmentAiWidget
        department="NER Performance"
        title="Assistente IA • NER Performance (Análise Consultiva Somente Leitura)"
        placeholder="Ex: Diagnostique CPA e sugira hipóteses de otimização..."
        defaultInput="Analise o desempenho atual das contas e liste hipóteses de otimização mantendo guardrails estatísticos."
        onNotify={onNotify}
      />
    </div>
  );
}

export function WebView({ webPages, clients, activeOrgId, onRefresh, onNotify }: any) {
  const [form, setForm] = useState({ clientId: clients[0]?.id || '', title: '', slug: '', pageType: 'Landing Page Produto' });
  const [leadTest, setLeadTest] = useState({ pageId: webPages[0]?.id || '', name: 'Lead Teste LP', email: 'lead.lp@empresa.com' });

  useEffect(() => {
    setForm((prev) => ({
      ...prev,
      clientId: clients.some((c: any) => c.id === prev.clientId) ? prev.clientId : (clients[0]?.id || ''),
    }));
  }, [activeOrgId, clients]);

  useEffect(() => {
    setLeadTest((prev) => ({
      ...prev,
      pageId: webPages.some((p: any) => p.id === prev.pageId) ? prev.pageId : (webPages[0]?.id || ''),
    }));
  }, [activeOrgId, webPages]);

  const handleCreatePage = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await apiFetch('/api/web/pages', {
        method: 'POST',
        body: JSON.stringify({ ...form, clientId: form.clientId || clients[0]?.id, organizationId: activeOrgId }),
      });
      setForm({ ...form, title: '', slug: '' });
      onNotify('Página criada no NER Web.');
      onRefresh();
    } catch (err: any) {
      onNotify(err.message, true);
    }
  };

  const handlePublish = async (page: any) => {
    try {
      const nextStatus = page.status === 'Publicado' ? 'Em revisão' : 'Publicado';
      await apiFetch(`/api/web/pages/${page.id}`, { method: 'PATCH', body: JSON.stringify({ status: nextStatus }) });
      onNotify(`Página alterada para ${nextStatus}.`);
      onRefresh();
    } catch (err: any) {
      onNotify(err.message, true);
    }
  };

  const handleSimulateLeadCapture = async (e: React.FormEvent) => {
    e.preventDefault();
    const targetId = leadTest.pageId || webPages[0]?.id;
    if (!targetId) return;
    try {
      const res = await apiFetch<any>(`/api/web/pages/${targetId}/submit-lead`, {
        method: 'POST',
        body: JSON.stringify({ name: leadTest.name, email: leadTest.email, utmCampaign: 'lp_live_test' }),
      });
      onNotify(`Lead capturado na LP e enviado para CRM + Tracking (${res.trackingEventId})!`);
      onRefresh();
    } catch (err: any) {
      onNotify(err.message, true);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-white tracking-tight flex items-center gap-2">
          <Globe className="w-6 h-6 text-cyan-400" /> NER Web • Landing Pages, Sites & Captura Integrada
        </h2>
        <p className="text-sm text-slate-400">Builder com versionamento, SEO e captura real de leads integrada ao CRM e NER Tracking.</p>
      </div>

      <form onSubmit={handleCreatePage} className="bg-slate-900/60 border border-slate-800 rounded-2xl p-4 grid grid-cols-1 md:grid-cols-5 gap-3">
        <select value={form.clientId} onChange={(e) => setForm({ ...form, clientId: e.target.value })} className="bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-white">
          {clients.map((c: any) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <input type="text" required placeholder="Título da página" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} className="bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-white" />
        <input type="text" required placeholder="slug-da-pagina" value={form.slug} onChange={(e) => setForm({ ...form, slug: e.target.value })} className="bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-white" />
        <select value={form.pageType} onChange={(e) => setForm({ ...form, pageType: e.target.value })} className="bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-white">
          <option value="Landing Page Produto">Landing Page Produto</option>
          <option value="Landing Page Captura">Landing Page Captura</option>
          <option value="Site Institucional">Site Institucional</option>
          <option value="E-commerce">E-commerce</option>
        </select>
        <button type="submit" className="px-4 py-2 rounded-lg bg-cyan-600 text-white text-xs font-semibold">Criar Página</button>
      </form>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {webPages.map((wp: any) => (
          <div key={wp.id} className="bg-slate-900/60 border border-slate-800 rounded-2xl p-5 space-y-3">
            <div className="flex justify-between items-start">
              <div>
                <h3 className="font-bold text-white text-base">{wp.title}</h3>
                <p className="text-xs font-mono text-cyan-400">{wp.domain} • /{wp.slug} ({wp.version})</p>
              </div>
              <span className="px-2.5 py-1 rounded-full bg-slate-800 text-xs text-emerald-300">{wp.status}</span>
            </div>
            <div className="text-xs text-slate-400 flex justify-between">
              <span>Leads capturados: <strong className="text-white">{wp.leadsCaptured}</strong></span>
              <span>SSL: {wp.sslStatus}</span>
            </div>
            <div className="flex justify-end">
              <button onClick={() => handlePublish(wp)} className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs text-slate-200">
                {wp.status === 'Publicado' ? 'Mover para Revisão' : 'Publicar Página'}
              </button>
            </div>
          </div>
        ))}
      </div>

      {webPages.length > 0 && (
        <form onSubmit={handleSimulateLeadCapture} className="bg-slate-900/60 border border-slate-800 rounded-2xl p-5 space-y-3">
          <h4 className="font-bold text-white text-sm">Testar Captura de Formulário Web → CRM + NER Tracking</h4>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
            <select value={leadTest.pageId || webPages[0]?.id} onChange={(e) => setLeadTest({ ...leadTest, pageId: e.target.value })} className="bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-white">
              {webPages.map((w: any) => <option key={w.id} value={w.id}>{w.title}</option>)}
            </select>
            <input type="text" required value={leadTest.name} onChange={(e) => setLeadTest({ ...leadTest, name: e.target.value })} className="bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-white" />
            <input type="email" required value={leadTest.email} onChange={(e) => setLeadTest({ ...leadTest, email: e.target.value })} className="bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-white" />
            <button type="submit" className="px-4 py-2 rounded-lg bg-emerald-600 text-white text-xs font-semibold">Enviar Lead da LP</button>
          </div>
        </form>
      )}

      <DepartmentAiWidget
        department="NER Web"
        title="Assistente IA • NER Web (Copy de LP, Estrutura & SEO)"
        placeholder="Ex: Estruture seções Hero, Prova Social e FAQ com SEO..."
        defaultInput="Estruture uma Landing Page de alta conversão (Hero, Benefícios, Prova Social, Oferta, FAQ e Meta Tags SEO)."
        clientId={form.clientId || clients[0]?.id}
        onNotify={onNotify}
      />
    </div>
  );
}

export function AutomationView({ workflows, onRefresh, onNotify }: any) {
  const toggleWorkflow = async (id: string) => {
    try {
      await apiFetch(`/api/workflows/${id}/toggle`, { method: 'PATCH' });
      onNotify('Status do workflow atualizado.');
      onRefresh();
    } catch (err: any) {
      onNotify(err.message, true);
    }
  };

  const testWorkflow = async (id: string) => {
    try {
      await apiFetch(`/api/workflows/${id}/test`, { method: 'POST' });
      onNotify('Workflow disparado com sucesso.');
      onRefresh();
    } catch (err: any) {
      onNotify(err.message, true);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-white tracking-tight flex items-center gap-2">
          <Cpu className="w-6 h-6 text-cyan-400" /> NER Automation • Workflows & Orquestração
        </h2>
        <p className="text-sm text-slate-400">Automações internas ativas e pontes externas n8n com verificação real de credenciais.</p>
      </div>

      <div className="space-y-3">
        {workflows.map((wf: any) => (
          <div key={wf.id} className="bg-slate-900/60 border border-slate-800 rounded-2xl p-5 flex flex-wrap items-center justify-between gap-4">
            <div>
              <div className="font-bold text-white text-sm">{wf.name}</div>
              <div className="text-xs text-slate-400 mt-0.5">Gatilho: <code className="text-cyan-400">{wf.trigger}</code> • Execuções: {wf.executions}</div>
            </div>
            <div className="flex items-center gap-2">
              <span className={`px-2.5 py-1 rounded-full text-xs ${wf.status === 'Ativo' ? 'bg-emerald-500/15 text-emerald-300' : 'bg-amber-500/15 text-amber-300'}`}>
                {wf.status}
              </span>
              <button onClick={() => toggleWorkflow(wf.id)} className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs text-slate-200">
                Alternar
              </button>
              <button onClick={() => testWorkflow(wf.id)} className="px-3 py-1.5 rounded-lg bg-cyan-600/20 hover:bg-cyan-600/30 text-xs text-cyan-300">
                Executar Teste
              </button>
            </div>
          </div>
        ))}
      </div>

      <DepartmentAiWidget
        department="NER Automation"
        title="Assistente IA • NER Automation (Classificação & Resumo de Workflows)"
        placeholder="Ex: Classifique um lead recebido via webhook e sugira roteamento..."
        defaultInput="Classifique o evento de entrada (lead inbound B2B) e recomende etapas seguras de automação."
        onNotify={onNotify}
      />
    </div>
  );
}

export function IntelligenceTrackingView({ intelligence, trackingEvents, clients, activeOrgId, onRefresh, onNotify }: any) {
  const [evtId, setEvtId] = useState('ev_dedup_demo_001');

  const ingestEvent = async (eventName: string, confirmedByPayment: boolean) => {
    try {
      const res = await apiFetch<any>('/api/tracking/events', {
        method: 'POST',
        body: JSON.stringify({
          organizationId: activeOrgId,
          clientId: clients[0]?.id || 'cli-1',
          eventId: evtId,
          eventName,
          value: eventName === 'Purchase' ? 499 : 0,
          confirmedByPayment,
        }),
      });
      onNotify(
        res.deduplicated
          ? `Evento ${evtId} deduplicado! Contagem evitada: ${res.event.deduplicatedCount}`
          : `Evento ${res.event.eventName} registrado com ID ${res.event.eventId}.`
      );
      onRefresh();
    } catch (err: any) {
      onNotify(err.message, true);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-white tracking-tight flex items-center gap-2">
          <BarChart3 className="w-6 h-6 text-cyan-400" /> NER Intelligence & Tracking (CAPI / Deduplicação)
        </h2>
        <p className="text-sm text-slate-400">Separação entre Fato Observado, Métrica Calculada e Anomalias com evidência real.</p>
      </div>

      {intelligence && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-5 space-y-2 text-xs">
            <div className="font-bold text-cyan-400 uppercase">Fatos Observados</div>
            <div>Clientes Ativos: <strong className="text-white">{intelligence.observed.activeClients}</strong></div>
            <div>Projetos Ativos: <strong className="text-white">{intelligence.observed.activeProjects}</strong></div>
            <div>Conversões Mídia: <strong className="text-white">{intelligence.observed.totalConversions}</strong></div>
          </div>
          <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-5 space-y-2 text-xs">
            <div className="font-bold text-emerald-400 uppercase">Métricas Calculadas</div>
            <div>Ticket Médio Agência: <strong className="text-white">{formatCurrencyBRL(intelligence.calculated.averageTicketAgency)}</strong></div>
            <div>CPA Combinado: <strong className="text-white">{formatCurrencyBRL(intelligence.calculated.blendedCpa)}</strong></div>
            <div>Aprovações Pendentes: <strong className="text-white">{intelligence.calculated.pendingApprovals}</strong></div>
          </div>
          <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-5 space-y-2 text-xs">
            <div className="font-bold text-amber-400 uppercase">Alertas & Anomalias</div>
            {(intelligence.anomalies || []).map((a: any, i: number) => (
              <div key={i} className="text-slate-300">
                <AlertTriangle className="w-3.5 h-3.5 inline text-amber-400 mr-1" />
                {a.title}
              </div>
            ))}
            {(intelligence.anomalies || []).length === 0 && <div className="text-emerald-400">Nenhuma anomalia crítica detectada.</div>}
          </div>
        </div>
      )}

      <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-5 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h3 className="font-bold text-white text-sm">Log de Eventos Server-Side & Deduplicação</h3>
          <div className="flex items-center gap-2">
            <input type="text" value={evtId} onChange={(e) => setEvtId(e.target.value)} className="bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1.5 text-xs font-mono text-white" />
            <button onClick={() => ingestEvent('Purchase', false)} className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs text-slate-200">
              Enviar Purchase (Não Confirmado)
            </button>
            <button onClick={() => ingestEvent('Purchase', true)} className="px-3 py-1.5 rounded-lg bg-cyan-600 text-xs text-white font-semibold">
              Testar Deduplicação / Confirmar
            </button>
          </div>
        </div>
        <div className="space-y-2">
          {trackingEvents.map((e: any) => (
            <div key={e.id} className="p-3 rounded-xl bg-slate-950 border border-slate-800 flex items-center justify-between text-xs">
              <div>
                <span className="font-mono font-bold text-cyan-400">{e.eventName}</span> • <span className="font-mono text-slate-300">{e.eventId}</span>
                <div className="text-[11px] text-slate-400">{e.source} • Pagamento confirmado: {e.confirmedByPayment ? 'Sim' : 'Não'}</div>
              </div>
              <span className="px-2 py-0.5 rounded bg-slate-800 font-mono text-emerald-300">Recepções: {e.deduplicatedCount}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <DepartmentAiWidget
          department="NER Intelligence"
          title="Assistente IA • NER Intelligence (Fatos vs Hipóteses)"
          placeholder="Ex: Resuma anomalias de receita e churn..."
          defaultInput="Separe fatos observados de hipóteses estratégicas para a operação atual da agência."
          onNotify={onNotify}
        />
        <DepartmentAiWidget
          department="NER Tracking"
          title="Assistente IA • NER Tracking (Diagnóstico CAPI & UTMs)"
          placeholder="Ex: Verifique boas práticas de deduplicação event_id..."
          defaultInput="Audite o fluxo de deduplicação Pixel + CAPI e recomendações de integridade de atribuição."
          onNotify={onNotify}
        />
      </div>
    </div>
  );
}

export function ClientPortalView({ projects, approvals, receivables, tickets, clients, activeOrgId, currentUser, onRefresh, onNotify }: any) {
  const [ticketForm, setTicketForm] = useState({ subject: '', description: '', category: 'Suporte', clientId: currentUser?.clientId || clients[0]?.id || '' });

  useEffect(() => {
    const validClientId = currentUser?.clientId || (clients.some((c: any) => c.id === ticketForm.clientId) ? ticketForm.clientId : (clients[0]?.id || ''));
    if (validClientId !== ticketForm.clientId) {
      setTicketForm((prev) => ({ ...prev, clientId: validClientId }));
    }
  }, [activeOrgId, clients, currentUser?.clientId, ticketForm.clientId]);

  const handleDecide = async (app: any, status: string) => {
    try {
      await apiFetch(`/api/approvals/${app.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ status, expectedVersion: app.version }),
      });
      onNotify(`Decisão "${status}" registrada para ${app.title} (${app.version}).`);
      onRefresh();
    } catch (err: any) {
      onNotify(err.message, true);
    }
  };

  const handleOpenTicket = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await apiFetch('/api/tickets', {
        method: 'POST',
        body: JSON.stringify({
          ...ticketForm,
          organizationId: activeOrgId,
          clientId: currentUser?.clientId || ticketForm.clientId || clients[0]?.id,
        }),
      });
      setTicketForm({ ...ticketForm, subject: '', description: '' });
      onNotify('Chamado enviado à equipe da agência.');
      onRefresh();
    } catch (err: any) {
      onNotify(err.message, true);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-white tracking-tight flex items-center gap-2">
          <ShieldCheck className="w-6 h-6 text-cyan-400" /> Portal do Cliente (Escopo Isolado)
        </h2>
        <p className="text-sm text-slate-400">
          Visão exclusiva de projetos, aprovações versionadas, faturas e chamados do cliente autenticado.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-5 space-y-3">
          <h3 className="font-bold text-white text-sm">Aprovações Pendentes & Histórico</h3>
          {approvals.map((a: any) => (
            <div key={a.id} className="p-3.5 rounded-xl bg-slate-950 border border-slate-800 text-xs space-y-2">
              <div className="flex justify-between">
                <span className="font-semibold text-white">{a.title} ({a.version})</span>
                <span className="text-cyan-400">{a.status}</span>
              </div>
              {a.status === 'Pendente' && (
                <div className="flex gap-2">
                  <button onClick={() => handleDecide(a, 'Aprovado')} className="px-3 py-1 rounded bg-emerald-600 text-white text-xs font-semibold">
                    Aprovar Versão
                  </button>
                  <button onClick={() => handleDecide(a, 'Alterações solicitadas')} className="px-3 py-1 rounded bg-amber-600/30 text-amber-300 text-xs">
                    Solicitar Ajustes
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>

        <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-5 space-y-3">
          <h3 className="font-bold text-white text-sm">Projetos & Faturamento</h3>
          {projects.map((p: any) => (
            <div key={p.id} className="p-3 rounded-xl bg-slate-950 border border-slate-800 text-xs flex justify-between">
              <span className="text-white font-medium">{p.name}</span>
              <span className="font-mono text-emerald-400">{p.progress}% • {p.status}</span>
            </div>
          ))}
          {receivables.map((r: any) => (
            <div key={r.id} className="p-3 rounded-xl bg-slate-950 border border-slate-800 text-xs flex justify-between">
              <span className="text-slate-300">{r.description}</span>
              <span className="font-mono text-cyan-400">{formatCurrencyBRL(r.amount)} ({r.status})</span>
            </div>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <form onSubmit={handleOpenTicket} className="bg-slate-900/60 border border-slate-800 rounded-2xl p-5 space-y-3">
          <h3 className="font-bold text-white text-sm">Abrir Chamado de Suporte / Solicitação</h3>
          <input type="text" required placeholder="Assunto" value={ticketForm.subject} onChange={(e) => setTicketForm({ ...ticketForm, subject: e.target.value })} className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-white" />
          <textarea rows={3} required placeholder="Descreva sua solicitação..." value={ticketForm.description} onChange={(e) => setTicketForm({ ...ticketForm, description: e.target.value })} className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-white" />
          <button type="submit" className="px-4 py-2 rounded-lg bg-cyan-600 text-white text-xs font-semibold">Enviar Chamado</button>
        </form>

        <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-5 space-y-3">
          <h3 className="font-bold text-white text-sm">Chamados Registrados ({tickets.length})</h3>
          {tickets.map((t: any) => (
            <div key={t.id} className="p-3 rounded-xl bg-slate-950 border border-slate-800 text-xs flex justify-between">
              <div>
                <div className="font-semibold text-white">{t.subject}</div>
                <div className="text-slate-400">{t.description}</div>
              </div>
              <span className="text-cyan-400 shrink-0">{t.status}</span>
            </div>
          ))}
        </div>
      </div>

      <DepartmentAiWidget
        department="NER Client Experience"
        title="Assistente do Portal • NER Client Experience (Escopo Isolado do Cliente)"
        placeholder="Tire dúvidas sobre andamento, aprovações ou entregáveis..."
        defaultInput="Resuma o status dos meus projetos atuais e próximos passos de aprovação."
        clientId={currentUser?.clientId || clients[0]?.id}
        onNotify={onNotify}
      />
    </div>
  );
}

export function OperationsBillingView({ operations, billing, plans, activeOrgId, onRefresh, onNotify }: any) {
  const [selectedPlanCode, setSelectedPlanCode] = useState(plans[4]?.code || plans[0]?.code || 'NER_BUSINESS_PRO');
  const [webhookEventId, setWebhookEventId] = useState(`evt_stripe_demo_${Date.now().toString().slice(-5)}`);

  useEffect(() => {
    if (plans.length > 0 && !plans.some((p: any) => p.code === selectedPlanCode)) {
      setSelectedPlanCode(plans[4]?.code || plans[0]?.code || 'NER_BUSINESS_PRO');
    }
  }, [activeOrgId, plans, selectedPlanCode]);

  const handleCheckout = async () => {
    try {
      const res = await apiFetch<any>('/api/billing/checkout', {
        method: 'POST',
        body: JSON.stringify({ organizationId: activeOrgId, planCode: selectedPlanCode }),
      });
      onNotify(`Checkout iniciado (${res.checkoutSessionId}). Status mantido em "${res.subscription.status}" até confirmação real via webhook.`);
      onRefresh();
    } catch (err: any) {
      onNotify(err.message, true);
    }
  };

  const handleSandboxWebhook = async (eventType: string) => {
    try {
      const res = await apiFetch<any>('/api/billing/sandbox-webhook', {
        method: 'POST',
        body: JSON.stringify({
          organizationId: activeOrgId,
          eventId: webhookEventId,
          eventType,
          planCode: selectedPlanCode,
        }),
      });
      onNotify(
        res.duplicate
          ? `Webhook duplicado (${webhookEventId}) ignorado com idempotência!`
          : `Webhook ${eventType} verificado (HMAC-SHA256) e processado! Assinatura: ${res.subscription?.status}`
      );
      onRefresh();
    } catch (err: any) {
      onNotify(err.message, true);
    }
  };

  const sub = billing?.subscription;
  const entitlements = billing?.entitlements;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-white tracking-tight flex items-center gap-2">
          <Server className="w-6 h-6 text-cyan-400" /> NER Operations & Billing (SaaS + Stripe Webhooks)
        </h2>
        <p className="text-sm text-slate-400">
          Saúde operacional, prontidão de variáveis de ambiente e ativação transacional de assinaturas via webhook assinado.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-5 space-y-4">
          <h3 className="font-bold text-white text-sm">Saúde & Prontidão de Infraestrutura</h3>
          {operations && (
            <>
              <div className="grid grid-cols-3 gap-3 text-xs bg-slate-950 p-3 rounded-xl border border-slate-800">
                <div><span className="text-slate-400 block">Uptime</span><span className="font-mono text-white">{operations.uptimeSeconds}s</span></div>
                <div><span className="text-slate-400 block">Memória RSS</span><span className="font-mono text-white">{operations.memoryRssMb} MB</span></div>
                <div><span className="text-slate-400 block">Node</span><span className="font-mono text-cyan-400">{operations.nodeVersion}</span></div>
              </div>
              <div className="space-y-2 text-xs">
                {(operations.integrationsReadiness || []).map((item: any) => (
                  <div key={item.name} className="flex justify-between p-2.5 rounded-lg bg-slate-950 border border-slate-800">
                    <span className="text-slate-200">{item.name}</span>
                    <span className={item.configured ? 'text-emerald-400' : 'text-amber-400'}>
                      {item.configured ? 'Configurado (Env)' : 'Pendente de Credenciais'}
                    </span>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>

        <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="font-bold text-white text-sm flex items-center gap-2">
              <CreditCard className="w-4 h-4 text-cyan-400" /> Assinatura SaaS & Entitlements
            </h3>
            <span className="px-2.5 py-1 rounded-full bg-cyan-500/15 text-cyan-300 text-xs font-mono">
              {sub?.status || 'none'}
            </span>
          </div>
          <div className="text-xs bg-slate-950 p-3 rounded-xl border border-slate-800 space-y-1">
            <div>Plano Atual: <strong className="text-white">{sub?.planName || 'Nenhum'}</strong></div>
            <div>Entitlement Ativo: <strong className={entitlements?.isEntitled ? 'text-emerald-400' : 'text-rose-400'}>{entitlements?.isEntitled ? 'Liberado' : 'Bloqueado / Pendente'}</strong></div>
            <div>Uso vs Limite: Usuários {entitlements?.usage?.users}/{entitlements?.limits?.users} • Sites {entitlements?.usage?.sites}/{entitlements?.limits?.sites}</div>
          </div>

          <div className="space-y-2 pt-2 border-t border-slate-800">
            <div className="flex gap-2">
              <select value={selectedPlanCode} onChange={(e) => setSelectedPlanCode(e.target.value)} className="flex-1 bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-white">
                {plans.map((p: any) => <option key={p.id} value={p.code}>{p.name} ({formatCurrencyBRL(p.recurringPrice)}/mês)</option>)}
              </select>
              <button onClick={handleCheckout} className="px-3 py-2 rounded-lg bg-cyan-600 text-white text-xs font-semibold">
                Iniciar Checkout
              </button>
            </div>

            <div className="flex flex-wrap gap-2 items-center pt-2">
              <input type="text" value={webhookEventId} onChange={(e) => setWebhookEventId(e.target.value)} className="flex-1 bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1.5 text-xs font-mono text-white" />
              <button onClick={() => handleSandboxWebhook('invoice.payment_succeeded')} className="px-3 py-1.5 rounded-lg bg-emerald-600/20 text-emerald-300 text-xs">
                Simular Webhook Pago (HMAC)
              </button>
              <button onClick={() => handleSandboxWebhook('invoice.payment_failed')} className="px-3 py-1.5 rounded-lg bg-rose-600/20 text-rose-300 text-xs">
                Simular Falha
              </button>
            </div>
          </div>

          <div className="space-y-1.5 max-h-36 overflow-y-auto">
            {(billing?.webhookEvents || []).map((ev: any) => (
              <div key={ev.id} className="text-[11px] bg-slate-950 p-2 rounded border border-slate-800 flex justify-between">
                <span className="font-mono text-cyan-400">{ev.eventId} ({ev.eventType})</span>
                <span className="text-slate-300">{ev.status}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

export function StrategyView({ activeOrgId, onNotify }: any) {
  const [prompt, setPrompt] = useState('Estruture um funil de aquisição B2B para SaaS com ticket médio de R$ 2.500/mês.');
  const [useStream, setUseStream] = useState(true);
  const [result, setResult] = useState<string | null>(null);
  const [meta, setMeta] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  const handleGenerate = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setResult('');
    setMeta(null);
    try {
      if (useStream) {
        const token = sessionStorage.getItem('ner_token');
        const res = await fetch('/api/ai/stream', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
          credentials: 'include',
          body: JSON.stringify({
            organizationId: activeOrgId,
            prompt,
            department: 'NER Strategy',
            purpose: 'marketing_strategy',
            action: 'strategy.diagnosis',
          }),
        });
        if (!res.ok || !res.body) {
          const errJson = await res.json().catch(() => ({}));
          throw new Error(errJson.error || `Erro HTTP ${res.status}`);
        }
        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const events = buffer.split('\n\n');
          buffer = events.pop() || '';
          for (const evt of events) {
            const line = evt.trim();
            if (!line.startsWith('data:')) continue;
            const payload = JSON.parse(line.slice(5).trim());
            if (payload.type === 'delta') {
              setResult((prev) => (prev || '') + payload.text);
            } else if (payload.type === 'done') {
              setMeta(payload.metadata);
            } else if (payload.type === 'error') {
              throw new Error(payload.error);
            }
          }
        }
      } else {
        const res = await apiFetch<any>('/api/ai/generate', {
          method: 'POST',
          body: JSON.stringify({
            organizationId: activeOrgId,
            prompt,
            department: 'NER Strategy',
            purpose: 'marketing_strategy',
            action: 'strategy.diagnosis',
            promptCode: 'STRATEGY_GROWTH_DIAGNOSIS',
          }),
        });
        setResult(res.text || res.result);
        setMeta(res);
      }
    } catch (err: any) {
      onNotify(err.message, true);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-white tracking-tight flex items-center gap-2">
          <Sparkles className="w-6 h-6 text-cyan-400" /> NER Strategy & IA (Centralized NER AI Gateway)
        </h2>
        <p className="text-sm text-slate-400">
          Execução roteada pelo NER AI Gateway com suporte a streaming SSE, fallback automático, controle de custos e auditoria.
        </p>
      </div>

      <form onSubmit={handleGenerate} className="bg-slate-900/60 border border-slate-800 rounded-2xl p-5 space-y-4">
        <textarea rows={4} required value={prompt} onChange={(e) => setPrompt(e.target.value)} className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-sm text-white" />
        <div className="flex flex-wrap items-center justify-between gap-3">
          <label className="flex items-center gap-2 text-xs text-slate-300 cursor-pointer">
            <input type="checkbox" checked={useStream} onChange={(e) => setUseStream(e.target.checked)} />
            Streaming em tempo real (SSE)
          </label>
          <button type="submit" disabled={loading} className="px-4 py-2.5 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-semibold flex items-center gap-2">
            {loading ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
            {loading ? 'Processando no Gateway...' : 'Gerar Estratégia'}
          </button>
        </div>
      </form>

      {result && (
        <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-6 space-y-3">
          {meta && (
            <div className="flex flex-wrap gap-3 text-[11px] font-mono text-cyan-400 border-b border-slate-800 pb-2">
              <span>Provedor: {meta.providerId}/{meta.modelId}</span>
              <span>• Latência: {meta.latencyMs}ms</span>
              <span>• Tokens: {meta.inputTokens} in / {meta.outputTokens} out</span>
              {meta.fallbackUsed && <span className="text-amber-300">• Fallback de {meta.fallbackFrom}</span>}
            </div>
          )}
          <div className="text-sm text-slate-200 whitespace-pre-wrap leading-relaxed">{result}</div>
        </div>
      )}
    </div>
  );
}

