import React, { useState, useEffect } from 'react';
import {
  Briefcase,
  Plus,
  ArrowRightCircle,
  Target,
  Layers,
  Edit3,
  Rocket,
  FileText,
  FileCheck,
  CheckCircle2,
  DollarSign,
  TrendingUp,
  CreditCard,
  PieChart,
  X,
} from 'lucide-react';
import { apiFetch, formatCurrencyBRL } from '../lib/api';

export function CrmLeadsView({ leads, activeOrgId, onRefresh, onNotify }: any) {
  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState({
    name: '',
    email: '',
    phone: '',
    company: '',
    segment: 'B2B',
    source: 'Meta Ads',
    estimatedValue: 15000,
  });

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await apiFetch('/api/leads', {
        method: 'POST',
        body: JSON.stringify({ ...form, organizationId: activeOrgId }),
      });
      setShowModal(false);
      setForm({ name: '', email: '', phone: '', company: '', segment: 'B2B', source: 'Meta Ads', estimatedValue: 15000 });
      onNotify('Lead cadastrado no CRM.');
      onRefresh();
    } catch (err: any) {
      onNotify(err.message, true);
    }
  };

  const handleConvert = async (leadId: string) => {
    try {
      const res = await apiFetch<any>(`/api/leads/${leadId}/convert`, { method: 'POST' });
      onNotify(`Lead convertido em Cliente (${res.client.name}) e Oportunidade no Pipeline!`);
      onRefresh();
    } catch (err: any) {
      onNotify(err.message, true);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-white tracking-tight">NER Business • CRM & Gestão de Leads</h2>
          <p className="text-sm text-slate-400">Prospecção multicanal, captura com UTMs e conversão para Pipeline.</p>
        </div>
        <button
          onClick={() => setShowModal(true)}
          className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-white font-semibold text-xs"
        >
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
              <th className="p-4 text-right">Ações</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800/60">
            {leads.map((l: any) => (
              <tr key={l.id} className="hover:bg-slate-800/30">
                <td className="p-4">
                  <div className="font-semibold text-white">{l.company}</div>
                  <div className="text-slate-400 mt-0.5">{l.name} • {l.email}</div>
                </td>
                <td className="p-4 text-slate-300">{l.segment}</td>
                <td className="p-4">
                  <span className="px-2.5 py-1 rounded-full bg-slate-800 text-cyan-400 font-mono">{l.source}</span>
                </td>
                <td className="p-4 font-mono font-bold text-emerald-400">{formatCurrencyBRL(l.estimatedValue)}</td>
                <td className="p-4">
                  <span className="px-2.5 py-1 rounded-full bg-cyan-500/15 text-cyan-300 border border-cyan-500/30 font-medium">
                    {l.status}
                  </span>
                </td>
                <td className="p-4 text-right">
                  {l.status !== 'Convertido' && (
                    <button
                      onClick={() => handleConvert(l.id)}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-300 border border-emerald-500/30 text-xs"
                    >
                      <ArrowRightCircle className="w-3.5 h-3.5" /> Converter
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {showModal && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-lg p-6 shadow-2xl">
            <div className="flex items-center justify-between pb-4 border-b border-slate-800 mb-4">
              <h3 className="font-bold text-lg text-white flex items-center gap-2">
                <Briefcase className="w-5 h-5 text-cyan-400" /> Novo Lead • CRM Comercial
              </h3>
              <button onClick={() => setShowModal(false)} className="text-slate-400 hover:text-white"><X className="w-5 h-5" /></button>
            </div>
            <form onSubmit={handleCreate} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <input type="text" required placeholder="Nome" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-sm text-white" />
                <input type="text" required placeholder="Empresa" value={form.company} onChange={(e) => setForm({ ...form, company: e.target.value })} className="bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-sm text-white" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <input type="email" required placeholder="E-mail" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} className="bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-sm text-white" />
                <input type="text" required placeholder="WhatsApp" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} className="bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-sm text-white" />
              </div>
              <div className="grid grid-cols-3 gap-3">
                <input type="text" placeholder="Segmento" value={form.segment} onChange={(e) => setForm({ ...form, segment: e.target.value })} className="bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-sm text-white" />
                <select value={form.source} onChange={(e) => setForm({ ...form, source: e.target.value })} className="bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-sm text-white">
                  <option value="Meta Ads">Meta Ads</option>
                  <option value="Google Ads">Google Ads</option>
                  <option value="TikTok Ads">TikTok Ads</option>
                  <option value="Outbound">Outbound</option>
                  <option value="Indicação">Indicação</option>
                </select>
                <input type="number" min={0} value={form.estimatedValue} onChange={(e) => setForm({ ...form, estimatedValue: Number(e.target.value) })} className="bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-sm text-white" />
              </div>
              <div className="flex justify-end gap-3 pt-2">
                <button type="button" onClick={() => setShowModal(false)} className="px-4 py-2 rounded-lg bg-slate-800 text-xs">Cancelar</button>
                <button type="submit" className="px-4 py-2 rounded-lg bg-cyan-600 text-white text-xs font-semibold">Cadastrar Lead</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

export function PipelineKanbanView({ opportunities, clients, activeOrgId, onRefresh, onNotify }: any) {
  const stages = ['Novo lead', 'Qualificação', 'Reunião', 'Proposta enviada', 'Negociação', 'Ganho'];
  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState({ name: '', clientId: clients[0]?.id || '', stage: 'Novo lead', value: 5000, probability: 35 });

  useEffect(() => {
    setForm((prev) => ({
      ...prev,
      clientId: clients.some((c: any) => c.id === prev.clientId) ? prev.clientId : (clients[0]?.id || ''),
    }));
  }, [activeOrgId, clients]);

  const moveStage = async (oppId: string, nextStage: string) => {
    try {
      await apiFetch(`/api/opportunities/${oppId}`, {
        method: 'PATCH',
        body: JSON.stringify({ stage: nextStage }),
      });
      onNotify(`Oportunidade movida para "${nextStage}".`);
      onRefresh();
    } catch (err: any) {
      onNotify(err.message, true);
    }
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await apiFetch('/api/opportunities', {
        method: 'POST',
        body: JSON.stringify({ ...form, organizationId: activeOrgId }),
      });
      setShowModal(false);
      onNotify('Oportunidade adicionada ao pipeline.');
      onRefresh();
    } catch (err: any) {
      onNotify(err.message, true);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-white tracking-tight flex items-center gap-2">
            <Target className="w-6 h-6 text-cyan-400" /> NER Business • Pipeline Comercial Kanban
          </h2>
          <p className="text-sm text-slate-400">Movimentação persistente de etapas com histórico de auditoria.</p>
        </div>
        <button onClick={() => setShowModal(true)} className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-white font-semibold text-xs">
          <Plus className="w-4 h-4" /> Nova Oportunidade
        </button>
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
                  <div key={opp.id} className="bg-slate-900 border border-slate-800 rounded-xl p-3 space-y-2">
                    <div className="font-semibold text-xs text-white">{opp.name}</div>
                    <div className="text-[10px] text-slate-400">Resp: {opp.responsible}</div>
                    <div className="flex items-center justify-between pt-2 border-t border-slate-800 text-xs">
                      <span className="text-cyan-400 font-mono font-bold">{formatCurrencyBRL(opp.value)}</span>
                      <span className="text-[10px] bg-emerald-500/20 text-emerald-400 px-1.5 py-0.5 rounded">{opp.probability}%</span>
                    </div>
                    <select
                      value={opp.stage}
                      onChange={(e) => moveStage(opp.id, e.target.value)}
                      className="w-full bg-slate-950 border border-slate-800 rounded px-2 py-1 text-[10px] text-slate-300"
                    >
                      {stages.map((s) => (
                        <option key={s} value={s}>{s}</option>
                      ))}
                    </select>
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

      {showModal && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <form onSubmit={handleCreate} className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-md p-6 space-y-4">
            <h3 className="text-lg font-bold text-white">Nova Oportunidade</h3>
            <input type="text" required placeholder="Título" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-sm text-white" />
            <select value={form.clientId} onChange={(e) => setForm({ ...form, clientId: e.target.value })} className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-sm text-white">
              <option value="">Sem cliente vinculado</option>
              {clients.map((c: any) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
            <div className="grid grid-cols-2 gap-3">
              <input type="number" min={0} placeholder="Valor (R$)" value={form.value} onChange={(e) => setForm({ ...form, value: Number(e.target.value) })} className="bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-sm text-white" />
              <input type="number" min={0} max={100} placeholder="Probabilidade %" value={form.probability} onChange={(e) => setForm({ ...form, probability: Number(e.target.value) })} className="bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-sm text-white" />
            </div>
            <div className="flex justify-end gap-3">
              <button type="button" onClick={() => setShowModal(false)} className="px-4 py-2 rounded-lg bg-slate-800 text-xs">Cancelar</button>
              <button type="submit" className="px-4 py-2 rounded-lg bg-cyan-600 text-white text-xs font-semibold">Salvar</button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}

export function CommercialPlansView({ plans, clients, activeOrgId, currentUser, onRefresh, onNotify, onNavigateProjects }: any) {
  const canManagePlans = ['Super Admin', 'Administrador'].includes(currentUser?.role);
  const [editingPlan, setEditingPlan] = useState<any>(null);
  const [creatingPlan, setCreatingPlan] = useState(false);
  const [contractingPlan, setContractingPlan] = useState<any>(null);
  const [contractForm, setContractForm] = useState({
    clientId: clients[0]?.id || '',
    customProjectName: '',
    dueDate: new Date(Date.now() + 21 * 86400000).toISOString().slice(0, 10),
  });

  useEffect(() => {
    setContractForm((prev) => ({
      ...prev,
      clientId: clients.some((c: any) => c.id === prev.clientId) ? prev.clientId : (clients[0]?.id || ''),
    }));
  }, [activeOrgId, clients]);

  const [planForm, setPlanForm] = useState({
    code: '',
    name: '',
    targetAudience: '',
    category: 'Landing Pages',
    serviceTemplateType: 'Landing Page',
    setupPrice: 997,
    recurringPrice: 99,
    recurrence: 'Mensal',
    deliverablesText: '',
  });

  const openEdit = (plan: any) => {
    setEditingPlan(plan);
    setPlanForm({
      code: plan.code,
      name: plan.name,
      targetAudience: plan.targetAudience,
      category: plan.category,
      serviceTemplateType: plan.serviceTemplateType,
      setupPrice: plan.setupPrice,
      recurringPrice: plan.recurringPrice,
      recurrence: plan.recurrence,
      deliverablesText: (plan.deliverables || []).join('\n'),
    });
  };

  const openCreate = () => {
    setCreatingPlan(true);
    setPlanForm({
      code: '',
      name: '',
      targetAudience: '',
      category: 'Landing Pages',
      serviceTemplateType: 'Landing Page',
      setupPrice: 1490,
      recurringPrice: 199,
      recurrence: 'Mensal',
      deliverablesText: 'Landing Page responsiva\nPixel + GA4 + UTMs',
    });
  };

  const handleSavePlan = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const deliverables = planForm.deliverablesText
        .split('\n')
        .map((s) => s.trim())
        .filter(Boolean);
      if (editingPlan) {
        await apiFetch(`/api/plans/${editingPlan.id}`, {
          method: 'PATCH',
          body: JSON.stringify({
            name: planForm.name,
            targetAudience: planForm.targetAudience,
            category: planForm.category,
            serviceTemplateType: planForm.serviceTemplateType,
            setupPrice: Number(planForm.setupPrice),
            recurringPrice: Number(planForm.recurringPrice),
            recurrence: planForm.recurrence,
            deliverables,
          }),
        });
        setEditingPlan(null);
        onNotify('Plano comercial atualizado com preços de implantação e recorrência.');
      } else {
        await apiFetch('/api/plans', {
          method: 'POST',
          body: JSON.stringify({
            ...planForm,
            setupPrice: Number(planForm.setupPrice),
            recurringPrice: Number(planForm.recurringPrice),
            deliverables,
          }),
        });
        setCreatingPlan(false);
        onNotify('Novo plano comercial cadastrado.');
      }
      onRefresh();
    } catch (err: any) {
      onNotify(err.message, true);
    }
  };

  const handleContractAndCreateProject = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await apiFetch<any>('/api/digital-studio/contract', {
        method: 'POST',
        body: JSON.stringify({
          organizationId: activeOrgId,
          clientId: contractForm.clientId || clients[0]?.id,
          planId: contractingPlan.id,
          customProjectName: contractForm.customProjectName,
          dueDate: contractForm.dueDate,
        }),
      });
      setContractingPlan(null);
      onNotify(
        `Plano "${res.plan.name}" contratado! Projeto "${res.project.name}" criado com ${res.deliverables.length} entregáveis e ${res.tasks.length} tarefas.`
      );
      onRefresh();
      if (onNavigateProjects) onNavigateProjects();
    } catch (err: any) {
      onNotify(err.message, true);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-white tracking-tight flex items-center gap-2">
            <Layers className="w-6 h-6 text-cyan-400" /> NER Digital Studio • Planos Comerciais
          </h2>
          <p className="text-sm text-slate-400">
            Implantação (Setup) e Recorrência separados por plano, com automação direta para NER Projects.
          </p>
        </div>
        {canManagePlans && (
          <button
            onClick={openCreate}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-white font-semibold text-xs"
          >
            <Plus className="w-4 h-4" /> Cadastrar Plano
          </button>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
        {plans.map((plan: any) => (
          <div key={plan.id} className="bg-slate-900/60 border border-slate-800 rounded-2xl p-6 flex flex-col justify-between space-y-4 shadow-xl">
            <div className="space-y-3">
              <div className="flex items-center justify-between gap-2">
                <span className="text-[10px] px-2.5 py-1 rounded-full bg-cyan-500/15 text-cyan-300 border border-cyan-500/30 font-mono">
                  {plan.serviceTemplateType} • {plan.code}
                </span>
                {canManagePlans && (
                  <button
                    onClick={() => openEdit(plan)}
                    className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300"
                    title="Editar plano e preços"
                  >
                    <Edit3 className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
              <div>
                <h3 className="font-bold text-white text-lg">{plan.name}</h3>
                <p className="text-xs text-slate-400 mt-1">{plan.targetAudience}</p>
              </div>
              <ul className="space-y-1.5 pt-2">
                {(plan.deliverables || []).map((d: string, i: number) => (
                  <li key={i} className="text-xs text-slate-300 flex items-start gap-2">
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0 mt-0.5" />
                    <span>{d}</span>
                  </li>
                ))}
              </ul>
            </div>

            <div className="pt-4 border-t border-slate-800 space-y-3">
              <div className="grid grid-cols-2 gap-3 bg-slate-950 rounded-xl p-3 border border-slate-800">
                <div>
                  <span className="text-[10px] text-slate-400 block uppercase">Implantação (Setup)</span>
                  <span className="text-sm font-bold font-mono text-white">{formatCurrencyBRL(plan.setupPrice)}</span>
                </div>
                <div>
                  <span className="text-[10px] text-slate-400 block uppercase">Recorrência ({plan.recurrence})</span>
                  <span className="text-sm font-bold font-mono text-emerald-400">{formatCurrencyBRL(plan.recurringPrice)}</span>
                </div>
              </div>
              <button
                onClick={() => {
                  setContractingPlan(plan);
                  setContractForm({
                    clientId: clients[0]?.id || '',
                    customProjectName: `${plan.name} • ${clients[0]?.name || 'Novo Projeto'}`,
                    dueDate: new Date(Date.now() + 21 * 86400000).toISOString().slice(0, 10),
                  });
                }}
                disabled={clients.length === 0}
                className="w-full py-2.5 rounded-xl bg-cyan-600 hover:bg-cyan-500 disabled:opacity-50 text-white text-xs font-semibold flex items-center justify-center gap-2"
              >
                <Rocket className="w-4 h-4" /> Contratar Plano → Criar Projeto
              </button>
            </div>
          </div>
        ))}
      </div>

      {(editingPlan || creatingPlan) && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <form onSubmit={handleSavePlan} className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-lg p-6 space-y-4">
            <h3 className="text-lg font-bold text-white">
              {editingPlan ? `Editar Plano: ${editingPlan.name}` : 'Cadastrar Novo Plano Comercial'}
            </h3>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-[11px] text-slate-400 block mb-1">Código</label>
                <input
                  type="text"
                  required
                  disabled={Boolean(editingPlan)}
                  value={planForm.code}
                  onChange={(e) => setPlanForm({ ...planForm, code: e.target.value })}
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-sm text-white disabled:opacity-60"
                  placeholder="NER_CUSTOM"
                />
              </div>
              <div>
                <label className="text-[11px] text-slate-400 block mb-1">Nome do Plano</label>
                <input
                  type="text"
                  required
                  value={planForm.name}
                  onChange={(e) => setPlanForm({ ...planForm, name: e.target.value })}
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-sm text-white"
                />
              </div>
            </div>
            <input
              type="text"
              required
              placeholder="Público-alvo"
              value={planForm.targetAudience}
              onChange={(e) => setPlanForm({ ...planForm, targetAudience: e.target.value })}
              className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-sm text-white"
            />
            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="text-[11px] text-slate-400 block mb-1">Template de Projeto</label>
                <select
                  value={planForm.serviceTemplateType}
                  onChange={(e) => setPlanForm({ ...planForm, serviceTemplateType: e.target.value })}
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-sm text-white"
                >
                  <option value="Landing Page">Landing Page</option>
                  <option value="Site">Site</option>
                  <option value="E-commerce">E-commerce</option>
                  <option value="Software">Software</option>
                </select>
              </div>
              <div>
                <label className="text-[11px] text-slate-400 block mb-1">Implantação (R$)</label>
                <input
                  type="number"
                  min={0}
                  required
                  value={planForm.setupPrice}
                  onChange={(e) => setPlanForm({ ...planForm, setupPrice: Number(e.target.value) })}
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-sm text-white"
                />
              </div>
              <div>
                <label className="text-[11px] text-slate-400 block mb-1">Recorrência (R$)</label>
                <input
                  type="number"
                  min={0}
                  required
                  value={planForm.recurringPrice}
                  onChange={(e) => setPlanForm({ ...planForm, recurringPrice: Number(e.target.value) })}
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-sm text-white"
                />
              </div>
            </div>
            <div>
              <label className="text-[11px] text-slate-400 block mb-1">Entregáveis (1 por linha)</label>
              <textarea
                rows={4}
                value={planForm.deliverablesText}
                onChange={(e) => setPlanForm({ ...planForm, deliverablesText: e.target.value })}
                className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-white"
              />
            </div>
            <div className="flex justify-end gap-3">
              <button
                type="button"
                onClick={() => {
                  setEditingPlan(null);
                  setCreatingPlan(false);
                }}
                className="px-4 py-2 rounded-lg bg-slate-800 text-xs"
              >
                Cancelar
              </button>
              <button type="submit" className="px-4 py-2 rounded-lg bg-cyan-600 text-white text-xs font-semibold">
                Salvar Plano
              </button>
            </div>
          </form>
        </div>
      )}

      {contractingPlan && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <form onSubmit={handleContractAndCreateProject} className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-md p-6 space-y-4">
            <h3 className="text-lg font-bold text-white">Contratar {contractingPlan.name}</h3>
            <p className="text-xs text-slate-400">
              Esta ação gera Contrato + Título Financeiro + Projeto automático com template de entregáveis{' '}
              <strong className="text-cyan-400">{contractingPlan.serviceTemplateType}</strong>.
            </p>
            <div>
              <label className="text-[11px] text-slate-400 block mb-1">Cliente</label>
              <select
                required
                value={contractForm.clientId}
                onChange={(e) => setContractForm({ ...contractForm, clientId: e.target.value })}
                className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-sm text-white"
              >
                {clients.map((c: any) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-[11px] text-slate-400 block mb-1">Nome do Projeto</label>
              <input
                type="text"
                required
                value={contractForm.customProjectName}
                onChange={(e) => setContractForm({ ...contractForm, customProjectName: e.target.value })}
                className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-sm text-white"
              />
            </div>
            <div>
              <label className="text-[11px] text-slate-400 block mb-1">Prazo de Entrega</label>
              <input
                type="date"
                required
                value={contractForm.dueDate}
                onChange={(e) => setContractForm({ ...contractForm, dueDate: e.target.value })}
                className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-sm text-white"
              />
            </div>
            <div className="flex justify-end gap-3 pt-2">
              <button type="button" onClick={() => setContractingPlan(null)} className="px-4 py-2 rounded-lg bg-slate-800 text-xs">Cancelar</button>
              <button type="submit" className="px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold">
                Confirmar Contratação
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}

export function ProposalsView({ proposals, clients, activeOrgId, onRefresh, onNotify }: any) {
  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState({
    clientId: clients[0]?.id || '',
    title: '',
    setupValue: 1990,
    recurringValue: 499,
    validUntil: new Date(Date.now() + 15 * 86400000).toISOString().slice(0, 10),
  });

  useEffect(() => {
    setForm((prev) => ({
      ...prev,
      clientId: clients.some((c: any) => c.id === prev.clientId) ? prev.clientId : (clients[0]?.id || ''),
    }));
  }, [activeOrgId, clients]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await apiFetch('/api/proposals', {
        method: 'POST',
        body: JSON.stringify({ ...form, clientId: form.clientId || clients[0]?.id, organizationId: activeOrgId }),
      });
      setShowModal(false);
      onNotify('Proposta emitida.');
      onRefresh();
    } catch (err: any) {
      onNotify(err.message, true);
    }
  };

  const handleAccept = async (id: string) => {
    try {
      const res = await apiFetch<any>(`/api/proposals/${id}/accept`, { method: 'PATCH' });
      onNotify(`Proposta aceita! Contrato ${res.contract.number} gerado.`);
      onRefresh();
    } catch (err: any) {
      onNotify(err.message, true);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-white tracking-tight flex items-center gap-2">
            <FileText className="w-6 h-6 text-cyan-400" /> NER Business • Propostas Comerciais
          </h2>
          <p className="text-sm text-slate-400">Emissão e aceite com geração automática de contrato.</p>
        </div>
        <button onClick={() => setShowModal(true)} className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-white font-semibold text-xs">
          <Plus className="w-4 h-4" /> Nova Proposta
        </button>
      </div>

      <div className="bg-slate-900/60 border border-slate-800 rounded-2xl overflow-hidden shadow-xl">
        <table className="w-full text-left text-xs">
          <thead className="bg-slate-950 border-b border-slate-800 text-slate-400 uppercase font-semibold">
            <tr>
              <th className="p-4">Número</th>
              <th className="p-4">Título / Escopo</th>
              <th className="p-4">Setup / Recorrente</th>
              <th className="p-4">Validade</th>
              <th className="p-4">Status</th>
              <th className="p-4 text-right">Ações</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800/60">
            {proposals.map((p: any) => (
              <tr key={p.id} className="hover:bg-slate-800/30">
                <td className="p-4 font-mono font-bold text-cyan-400">{p.number}</td>
                <td className="p-4 font-semibold text-white">{p.title}</td>
                <td className="p-4 font-mono text-emerald-400">
                  {formatCurrencyBRL(p.setupValue)} + {formatCurrencyBRL(p.recurringValue)}/mês
                </td>
                <td className="p-4 text-slate-400">{p.validUntil}</td>
                <td className="p-4">
                  <span className="px-2.5 py-1 rounded-full bg-cyan-500/15 text-cyan-300 border border-cyan-500/30">
                    {p.status}
                  </span>
                </td>
                <td className="p-4 text-right">
                  {p.status !== 'Aceita' && (
                    <button
                      onClick={() => handleAccept(p.id)}
                      className="px-3 py-1.5 rounded-lg bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-300 border border-emerald-500/30 text-xs"
                    >
                      Registrar Aceite
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {showModal && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <form onSubmit={handleCreate} className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-md p-6 space-y-4">
            <h3 className="text-lg font-bold text-white">Nova Proposta Comercial</h3>
            <select value={form.clientId} onChange={(e) => setForm({ ...form, clientId: e.target.value })} className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-sm text-white">
              {clients.map((c: any) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
            <input type="text" required placeholder="Título do escopo" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-sm text-white" />
            <div className="grid grid-cols-2 gap-3">
              <input type="number" min={0} placeholder="Setup (R$)" value={form.setupValue} onChange={(e) => setForm({ ...form, setupValue: Number(e.target.value) })} className="bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-sm text-white" />
              <input type="number" min={0} placeholder="Recorrente (R$)" value={form.recurringValue} onChange={(e) => setForm({ ...form, recurringValue: Number(e.target.value) })} className="bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-sm text-white" />
            </div>
            <input type="date" value={form.validUntil} onChange={(e) => setForm({ ...form, validUntil: e.target.value })} className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-sm text-white" />
            <div className="flex justify-end gap-3">
              <button type="button" onClick={() => setShowModal(false)} className="px-4 py-2 rounded-lg bg-slate-800 text-xs">Cancelar</button>
              <button type="submit" className="px-4 py-2 rounded-lg bg-cyan-600 text-white text-xs font-semibold">Emitir Proposta</button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}

export function ContractsView({ contracts }: any) {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-white tracking-tight flex items-center gap-2">
          <FileCheck className="w-6 h-6 text-cyan-400" /> NER Business • Contratos & Vigência
        </h2>
        <p className="text-sm text-slate-400">Contratos ativos com implantação, recorrência e vínculo de serviço.</p>
      </div>

      <div className="bg-slate-900/60 border border-slate-800 rounded-2xl overflow-hidden shadow-xl">
        <table className="w-full text-left text-xs">
          <thead className="bg-slate-950 border-b border-slate-800 text-slate-400 uppercase font-semibold">
            <tr>
              <th className="p-4">Contrato</th>
              <th className="p-4">Título / Tipo</th>
              <th className="p-4">Setup</th>
              <th className="p-4">Recorrente</th>
              <th className="p-4">Vigência</th>
              <th className="p-4">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800/60">
            {contracts.map((c: any) => (
              <tr key={c.id} className="hover:bg-slate-800/30">
                <td className="p-4 font-mono font-bold text-cyan-400">{c.number}</td>
                <td className="p-4">
                  <div className="font-semibold text-white">{c.title}</div>
                  <div className="text-[11px] text-slate-400">{c.serviceType} {c.planCode ? `• ${c.planCode}` : ''}</div>
                </td>
                <td className="p-4 font-mono text-slate-200">{formatCurrencyBRL(c.setupValue)}</td>
                <td className="p-4 font-mono font-bold text-emerald-400">{formatCurrencyBRL(c.recurringValue)}</td>
                <td className="p-4 text-slate-400">{c.startDate} até {c.endDate}</td>
                <td className="p-4">
                  <span className="px-2.5 py-1 rounded-full bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">{c.status}</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export function FinanceView({ financeSummary, receivables, payables, commissions, onRefresh, onNotify }: any) {
  const [payingRec, setPayingRec] = useState<any>(null);
  const [payAmount, setPayAmount] = useState(0);
  const [payMethod, setPayMethod] = useState('PIX / Transferência');

  const handleConfirmPayment = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await apiFetch(`/api/finance/receivables/${payingRec.id}/payments`, {
        method: 'POST',
        body: JSON.stringify({ amount: Number(payAmount), method: payMethod }),
      });
      setPayingRec(null);
      onNotify('Recebimento registrado com baixa financeira.');
      onRefresh();
    } catch (err: any) {
      onNotify(err.message, true);
    }
  };

  const handlePayExpense = async (id: string) => {
    try {
      await apiFetch(`/api/finance/payables/${id}/pay`, { method: 'PATCH' });
      onNotify('Despesa marcada como paga.');
      onRefresh();
    } catch (err: any) {
      onNotify(err.message, true);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-white tracking-tight">NER Business • Financeiro & P&L</h2>
        <p className="text-sm text-slate-400">
          Cálculo dinâmico com separação contábil estrita entre Honorários da Agência e Verba de Mídia do Cliente.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-5">
          <div className="flex justify-between text-xs text-slate-400 mb-2">
            <span>Receita Agência (Honorários)</span>
            <DollarSign className="w-4 h-4 text-cyan-400" />
          </div>
          <div className="text-2xl font-bold text-white">{formatCurrencyBRL(financeSummary?.agencyRevenue)}</div>
          <div className="text-xs text-emerald-400 mt-1">Recebido: {formatCurrencyBRL(financeSummary?.receivedRevenue)}</div>
        </div>
        <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-5">
          <div className="flex justify-between text-xs text-slate-400 mb-2">
            <span>Verba de Mídia (Separada)</span>
            <TrendingUp className="w-4 h-4 text-blue-400" />
          </div>
          <div className="text-2xl font-bold text-blue-300">{formatCurrencyBRL(financeSummary?.mediaBudgetSeparated)}</div>
          <div className="text-xs text-slate-400 mt-1">Excluída do faturamento próprio</div>
        </div>
        <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-5">
          <div className="flex justify-between text-xs text-slate-400 mb-2">
            <span>Contas a Pagar</span>
            <CreditCard className="w-4 h-4 text-rose-400" />
          </div>
          <div className="text-2xl font-bold text-white">{formatCurrencyBRL(financeSummary?.totalPayable)}</div>
          <div className="text-xs text-rose-400 mt-1">Custos operacionais</div>
        </div>
        <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-5">
          <div className="flex justify-between text-xs text-slate-400 mb-2">
            <span>Resultado Operacional (P&L)</span>
            <PieChart className="w-4 h-4 text-emerald-400" />
          </div>
          <div className="text-2xl font-bold text-emerald-400">{formatCurrencyBRL(financeSummary?.netOperatingResult)}</div>
          <div className="text-xs text-emerald-300 mt-1">Margem: {financeSummary?.operatingMargin || '0.0%'}</div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-6 space-y-4">
          <h3 className="font-semibold text-white text-base">Contas a Receber (Honorários)</h3>
          <div className="space-y-3">
            {receivables.map((r: any) => (
              <div key={r.id} className="p-3.5 rounded-xl bg-slate-950 border border-slate-800 flex items-center justify-between text-xs">
                <div>
                  <div className="font-bold text-white">{r.clientName}</div>
                  <div className="text-slate-400 mt-0.5">{r.description} • Venc: {r.dueDate}</div>
                  <span className="text-[10px] text-slate-500">Mídia Ads Cliente: {formatCurrencyBRL(r.mediaBudget)}</span>
                </div>
                <div className="text-right space-y-1">
                  <div className="font-mono font-bold text-emerald-400">{formatCurrencyBRL(r.amount)}</div>
                  <div>
                    <span className={`px-2 py-0.5 rounded-full text-[10px] ${r.status === 'Pago' ? 'bg-emerald-500/20 text-emerald-300' : 'bg-amber-500/20 text-amber-300'}`}>
                      {r.status}
                    </span>
                  </div>
                  {r.status !== 'Pago' && (
                    <button
                      onClick={() => {
                        setPayingRec(r);
                        setPayAmount(Math.max(0, r.amount - r.paidAmount));
                      }}
                      className="px-2.5 py-1 rounded bg-cyan-600/20 hover:bg-cyan-600/30 text-cyan-300 text-[10px]"
                    >
                      Registrar Baixa
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-6 space-y-4">
          <h3 className="font-semibold text-white text-base">Contas a Pagar & Comissões</h3>
          <div className="space-y-3">
            {payables.map((p: any) => (
              <div key={p.id} className="p-3.5 rounded-xl bg-slate-950 border border-slate-800 flex items-center justify-between text-xs">
                <div>
                  <div className="font-bold text-white">{p.supplier}</div>
                  <div className="text-slate-400">{p.description} • Vence: {p.dueDate}</div>
                </div>
                <div className="text-right space-y-1">
                  <div className="font-mono font-bold text-rose-400">{formatCurrencyBRL(p.amount)}</div>
                  {p.status !== 'Pago' ? (
                    <button onClick={() => handlePayExpense(p.id)} className="px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-[10px] text-slate-200">
                      Marcar Pago
                    </button>
                  ) : (
                    <span className="text-[10px] text-emerald-400">Pago</span>
                  )}
                </div>
              </div>
            ))}
          </div>
          {commissions.length > 0 && (
            <div className="pt-3 border-t border-slate-800 space-y-2">
              <div className="text-xs font-semibold text-slate-400">Comissões Comerciais</div>
              {commissions.map((c: any) => (
                <div key={c.id} className="flex items-center justify-between text-xs bg-slate-950 p-2.5 rounded-lg border border-slate-800">
                  <span>{c.responsible} ({c.clientName})</span>
                  <span className="font-mono text-cyan-400">{formatCurrencyBRL(c.commissionValue)} • {c.status}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {payingRec && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <form onSubmit={handleConfirmPayment} className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-sm p-6 space-y-4">
            <h3 className="text-lg font-bold text-white">Registrar Pagamento</h3>
            <p className="text-xs text-slate-400">{payingRec.clientName} — {payingRec.description}</p>
            <input type="number" min={1} step="0.01" required value={payAmount} onChange={(e) => setPayAmount(Number(e.target.value))} className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-sm text-white" />
            <select value={payMethod} onChange={(e) => setPayMethod(e.target.value)} className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-sm text-white">
              <option value="PIX / Transferência">PIX / Transferência</option>
              <option value="Boleto Bancário">Boleto Bancário</option>
              <option value="Cartão Corporativo">Cartão Corporativo</option>
            </select>
            <div className="flex justify-end gap-3">
              <button type="button" onClick={() => setPayingRec(null)} className="px-4 py-2 rounded-lg bg-slate-800 text-xs">Cancelar</button>
              <button type="submit" className="px-4 py-2 rounded-lg bg-emerald-600 text-white text-xs font-semibold">Confirmar Baixa</button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
