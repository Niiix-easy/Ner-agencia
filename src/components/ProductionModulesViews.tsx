import React, { useEffect, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  ClipboardCheck,
  Compass,
  Download,
  FileCheck2,
  HardDrive,
  LifeBuoy,
  MessageSquare,
  Plus,
  Rocket,
  Send,
  ShieldCheck,
  Trash2,
  Upload,
} from 'lucide-react';
import { apiFetch } from '../lib/api';

// ============================================================================
// 1. INTERNAL TICKETS MANAGEMENT VIEW (FASE 3C)
// ============================================================================
export function TicketsManagementView({
  tickets,
  usersList,
  clients,
  activeOrgId,
  onRefresh,
  onNotify,
}: any) {
  const [statusFilter, setStatusFilter] = useState('all');
  const [replyText, setReplyText] = useState<Record<string, string>>({});
  const [busyId, setBusyId] = useState<string | null>(null);

  const visible = tickets.filter((t: any) => statusFilter === 'all' || t.status === statusFilter);
  const clientName = (id: string) => clients.find((c: any) => c.id === id)?.name || id;

  const updateTicket = async (id: string, patch: Record<string, unknown>) => {
    setBusyId(id);
    try {
      await apiFetch(`/api/tickets/${id}/manage`, {
        method: 'PATCH',
        body: JSON.stringify(patch),
      });
      onNotify('Chamado atualizado.');
      onRefresh();
    } catch (err: any) {
      onNotify(err.message, true);
    } finally {
      setBusyId(null);
    }
  };

  const sendReply = async (id: string) => {
    const msg = (replyText[id] || '').trim();
    if (!msg) return;
    setBusyId(id);
    try {
      await apiFetch(`/api/tickets/${id}/replies`, {
        method: 'POST',
        body: JSON.stringify({ message: msg, organizationId: activeOrgId }),
      });
      setReplyText((prev) => ({ ...prev, [id]: '' }));
      onNotify('Resposta registrada no histórico do chamado.');
      onRefresh();
    } catch (err: any) {
      onNotify(err.message, true);
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-2xl font-bold text-white flex items-center gap-2">
            <LifeBuoy className="w-6 h-6 text-cyan-400" /> Gestão de Chamados (Tickets)
          </h2>
          <p className="text-sm text-slate-400">
            Atendimento da equipe interna com atribuição de responsável, prioridade, status e histórico de respostas.
          </p>
        </div>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="bg-slate-900 border border-slate-800 rounded-lg px-3 py-2 text-xs text-white"
        >
          <option value="all">Todos os status</option>
          <option value="Aberto">Aberto</option>
          <option value="Em atendimento">Em atendimento</option>
          <option value="Resolvido">Resolvido</option>
        </select>
      </div>

      {visible.length === 0 ? (
        <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-8 text-center text-xs text-slate-400">
          Nenhum chamado encontrado neste filtro.
        </div>
      ) : (
        <div className="space-y-4">
          {visible.map((t: any) => (
            <div key={t.id} className="bg-slate-900/60 border border-slate-800 rounded-2xl p-5 space-y-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="text-sm font-bold text-white">{t.subject}</div>
                  <div className="text-xs text-slate-400 mt-0.5">
                    Cliente: <span className="text-cyan-300">{clientName(t.clientId)}</span> • Categoria: {t.category} • Aberto em {new Date(t.createdAt).toLocaleString('pt-BR')}
                  </div>
                  <p className="text-xs text-slate-300 mt-2">{t.description}</p>
                </div>
                <div className="flex flex-wrap gap-2 text-xs">
                  <select
                    disabled={busyId === t.id}
                    value={t.status}
                    onChange={(e) => void updateTicket(t.id, { status: e.target.value })}
                    className="bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1.5 text-white"
                  >
                    <option value="Aberto">Aberto</option>
                    <option value="Em atendimento">Em atendimento</option>
                    <option value="Resolvido">Resolvido</option>
                  </select>
                  <select
                    disabled={busyId === t.id}
                    value={t.priority}
                    onChange={(e) => void updateTicket(t.id, { priority: e.target.value })}
                    className="bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1.5 text-white"
                  >
                    <option value="Baixa">Prioridade: Baixa</option>
                    <option value="Normal">Prioridade: Normal</option>
                    <option value="Alta">Prioridade: Alta</option>
                  </select>
                  <select
                    disabled={busyId === t.id}
                    value={t.assigneeId || ''}
                    onChange={(e) => void updateTicket(t.id, { assigneeId: e.target.value || null })}
                    className="bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1.5 text-white"
                  >
                    <option value="">Sem responsável</option>
                    {usersList
                      .filter((u: any) => u.role !== 'Cliente')
                      .map((u: any) => (
                        <option key={u.id} value={u.id}>{u.name}</option>
                      ))}
                  </select>
                </div>
              </div>

              {/* Replies thread */}
              {Array.isArray(t.replies) && t.replies.length > 0 && (
                <div className="space-y-2 border-t border-slate-800 pt-3">
                  {t.replies.map((r: any) => (
                    <div key={r.id} className="p-2.5 rounded-lg bg-slate-950 border border-slate-800 text-xs">
                      <div className="flex justify-between text-[11px] text-slate-400">
                        <span className="font-semibold text-cyan-300">{r.authorName} ({r.authorRole})</span>
                        <span>{new Date(r.createdAt).toLocaleString('pt-BR')}</span>
                      </div>
                      <p className="text-slate-200 mt-1">{r.message}</p>
                    </div>
                  ))}
                </div>
              )}

              <div className="flex gap-2">
                <input
                  type="text"
                  placeholder="Responder ao cliente e registrar no histórico..."
                  value={replyText[t.id] || ''}
                  onChange={(e) => setReplyText((prev) => ({ ...prev, [t.id]: e.target.value }))}
                  className="flex-1 bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-white"
                />
                <button
                  disabled={busyId === t.id}
                  onClick={() => void sendReply(t.id)}
                  className="px-3.5 py-2 rounded-lg bg-cyan-500 text-slate-950 font-semibold text-xs flex items-center gap-1.5"
                >
                  <Send className="w-3.5 h-3.5" /> Enviar
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ============================================================================
// 2. OPERATIONS INCIDENTS PANEL (FASE 3D)
// ============================================================================
export function IncidentsManagementPanel({ activeOrgId, onNotify }: any) {
  const [incidents, setIncidents] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState({
    service: '',
    category: 'Infraestrutura',
    severity: 'Média',
    description: '',
    resolutionPlan: '',
  });

  const loadIncidents = async () => {
    setLoading(true);
    try {
      const data = await apiFetch<any[]>(`/api/incidents?organizationId=${encodeURIComponent(activeOrgId)}`);
      setIncidents(Array.isArray(data) ? data : []);
    } catch {
      setIncidents([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadIncidents();
  }, [activeOrgId]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await apiFetch('/api/incidents', {
        method: 'POST',
        body: JSON.stringify({ ...form, organizationId: activeOrgId }),
      });
      setForm({ service: '', category: 'Infraestrutura', severity: 'Média', description: '', resolutionPlan: '' });
      onNotify('Incidente registrado e auditado.');
      await loadIncidents();
    } catch (err: any) {
      onNotify(err.message, true);
    }
  };

  const handleUpdateStatus = async (id: string, status: string) => {
    try {
      await apiFetch(`/api/incidents/${id}`, {
        method: 'PATCH',
        body: JSON.stringify({ status }),
      });
      onNotify(`Incidente atualizado para ${status}.`);
      await loadIncidents();
    } catch (err: any) {
      onNotify(err.message, true);
    }
  };

  return (
    <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-5 space-y-4">
      <h3 className="text-sm font-bold text-white flex items-center gap-2">
        <AlertTriangle className="w-4 h-4 text-amber-400" /> Gestão de Incidentes Operacionais
      </h3>

      <form onSubmit={handleCreate} className="grid grid-cols-1 md:grid-cols-4 gap-2.5 text-xs">
        <input required placeholder="Serviço afetado *" value={form.service} onChange={(e) => setForm({ ...form, service: e.target.value })} className="bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-white" />
        <input placeholder="Categoria" value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} className="bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-white" />
        <select value={form.severity} onChange={(e) => setForm({ ...form, severity: e.target.value })} className="bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-white">
          <option value="Baixa">Severidade: Baixa</option>
          <option value="Média">Severidade: Média</option>
          <option value="Alta">Severidade: Alta</option>
          <option value="Crítica">Severidade: Crítica</option>
        </select>
        <button type="submit" className="px-3 py-2 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 font-semibold">
          Abrir Incidente
        </button>
        <input required placeholder="Descrição técnica do incidente *" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} className="md:col-span-2 bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-white" />
        <input placeholder="Plano de resolução" value={form.resolutionPlan} onChange={(e) => setForm({ ...form, resolutionPlan: e.target.value })} className="md:col-span-2 bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-white" />
      </form>

      {loading ? (
        <div className="text-xs text-slate-400">Carregando incidentes...</div>
      ) : incidents.length === 0 ? (
        <div className="text-xs text-slate-500">Nenhum incidente aberto nesta organização.</div>
      ) : (
        <div className="space-y-2.5">
          {incidents.map((inc) => (
            <div key={inc.id} className="p-3.5 rounded-xl bg-slate-950 border border-slate-800 text-xs flex flex-wrap justify-between gap-3">
              <div className="space-y-1 flex-1 min-w-[240px]">
                <div className="flex items-center gap-2">
                  <span className="font-bold text-white">{inc.service}</span>
                  <span className={`px-2 py-0.5 rounded text-[10px] font-semibold ${
                    inc.severity === 'Crítica' ? 'bg-rose-500/20 text-rose-300' :
                    inc.severity === 'Alta' ? 'bg-amber-500/20 text-amber-300' : 'bg-slate-800 text-slate-300'
                  }`}>{inc.severity}</span>
                  <span className="text-[11px] text-slate-500">{inc.category}</span>
                </div>
                <p className="text-slate-300">{inc.description}</p>
                {inc.resolutionPlan && <p className="text-[11px] text-cyan-300">Plano: {inc.resolutionPlan}</p>}
              </div>
              <div className="flex items-center gap-2">
                <select
                  value={inc.status}
                  onChange={(e) => void handleUpdateStatus(inc.id, e.target.value)}
                  className="bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-white text-xs"
                >
                  <option value="Aberto">Aberto</option>
                  <option value="Em investigação">Em investigação</option>
                  <option value="Resolvido">Resolvido</option>
                </select>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ============================================================================
// 3. STORAGE ASSETS PANEL (FASE 5)
// ============================================================================
export function StorageAssetsPanel({ activeOrgId, clients, onNotify }: any) {
  const [storageInfo, setStorageInfo] = useState<any>(null);
  const [moduleName, setModuleName] = useState('creative');
  const [clientId, setClientId] = useState(clients?.[0]?.id || '');
  const [uploading, setUploading] = useState(false);

  const loadAssets = async () => {
    try {
      const data = await apiFetch<any>(`/api/storage/assets?organizationId=${encodeURIComponent(activeOrgId)}`);
      setStorageInfo(data);
    } catch {
      setStorageInfo(null);
    }
  };

  useEffect(() => {
    void loadAssets();
  }, [activeOrgId]);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const base64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
          const result = String(reader.result || '');
          const idx = result.indexOf(',');
          resolve(idx >= 0 ? result.slice(idx + 1) : result);
        };
        reader.onerror = () => reject(new Error('Falha ao ler arquivo local.'));
        reader.readAsDataURL(file);
      });
      await apiFetch('/api/storage/upload', {
        method: 'POST',
        body: JSON.stringify({
          organizationId: activeOrgId,
          clientId: clientId || null,
          module: moduleName,
          fileName: file.name,
          mimeType: file.type || 'application/octet-stream',
          contentBase64: base64,
        }),
      });
      onNotify(`Arquivo "${file.name}" enviado com sucesso.`);
      await loadAssets();
    } catch (err: any) {
      onNotify(err.message || 'Erro no upload.', true);
    } finally {
      setUploading(false);
      e.target.value = '';
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await apiFetch(`/api/storage/assets/${id}`, { method: 'DELETE' });
      onNotify('Arquivo removido com auditoria.');
      await loadAssets();
    } catch (err: any) {
      onNotify(err.message, true);
    }
  };

  return (
    <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-5 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-sm font-bold text-white flex items-center gap-2">
            <HardDrive className="w-4 h-4 text-cyan-400" /> Storage de Ativos (Criativos, Entregáveis & Web)
          </h3>
          <p className="text-xs text-slate-400">
            Driver ativo: <span className="font-mono text-cyan-300">{storageInfo?.driver || 'local'}</span> • Uso: {((storageInfo?.usageBytes || 0) / (1024 * 1024)).toFixed(2)} MB / {storageInfo?.limitGb ?? 0} GB do plano
          </p>
        </div>
        <div className="flex items-center gap-2 text-xs">
          <select value={moduleName} onChange={(e) => setModuleName(e.target.value)} className="bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1.5 text-white">
            <option value="creative">NER Creative</option>
            <option value="deliverable">NER Projects</option>
            <option value="web">NER Web</option>
            <option value="general">Geral</option>
          </select>
          <select value={clientId} onChange={(e) => setClientId(e.target.value)} className="bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1.5 text-white">
            <option value="">Sem cliente</option>
            {(clients || []).map((c: any) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          <label className="px-3 py-1.5 rounded-lg bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-semibold cursor-pointer flex items-center gap-1.5">
            <Upload className="w-3.5 h-3.5" /> {uploading ? 'Enviando...' : 'Upload'}
            <input type="file" className="hidden" disabled={uploading} onChange={(e) => void handleFileChange(e)} />
          </label>
        </div>
      </div>

      {!storageInfo?.assets?.length ? (
        <div className="text-xs text-slate-500">Nenhum arquivo enviado ainda para esta organização.</div>
      ) : (
        <div className="space-y-2">
          {storageInfo.assets.map((a: any) => (
            <div key={a.id} className="p-3 rounded-xl bg-slate-950 border border-slate-800 flex items-center justify-between text-xs">
              <div>
                <div className="font-semibold text-white">{a.fileName}</div>
                <div className="text-[11px] text-slate-400">
                  {a.module} • {a.mimeType} • {(a.sizeBytes / 1024).toFixed(1)} KB • SHA-256: {String(a.sha256).slice(0, 12)}...
                </div>
              </div>
              <div className="flex items-center gap-2">
                <a href={a.signedUrl} target="_blank" rel="noreferrer" className="px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-cyan-300 flex items-center gap-1">
                  <Download className="w-3.5 h-3.5" /> Baixar
                </a>
                <button onClick={() => void handleDelete(a.id)} className="p-1.5 rounded bg-slate-800 hover:bg-rose-900/50 text-rose-300">
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ============================================================================
// 4. NER STRATEGY PERSISTENT PLANS & OKRS (FASE 7)
// ============================================================================
export function StrategyPersistentSection({ activeOrgId, clients, projects, onNotify }: any) {
  const [plans, setPlans] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState({
    clientId: clients?.[0]?.id || '',
    projectId: '',
    title: '',
    quarter: 'Q1 2027',
    objective: '',
    channels: 'Meta Ads, Google Search, Landing Page CRO',
    okrObjective: 'Aquisição',
    okrKeyResult: 'Meta de leads qualificados',
    okrTarget: '500',
  });

  const loadPlans = async () => {
    setLoading(true);
    try {
      const data = await apiFetch<any[]>(`/api/strategy/plans?organizationId=${encodeURIComponent(activeOrgId)}`);
      setPlans(Array.isArray(data) ? data : []);
    } catch {
      setPlans([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadPlans();
  }, [activeOrgId]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await apiFetch('/api/strategy/plans', {
        method: 'POST',
        body: JSON.stringify({
          organizationId: activeOrgId,
          clientId: form.clientId || clients?.[0]?.id,
          projectId: form.projectId || null,
          title: form.title,
          quarter: form.quarter,
          objective: form.objective,
          channels: form.channels.split(',').map((s) => s.trim()).filter(Boolean),
          okrs: [
            {
              objective: form.okrObjective,
              keyResult: form.okrKeyResult,
              target: form.okrTarget,
              current: '0',
              progress: 0,
            },
          ],
        }),
      });
      setForm({ ...form, title: '', objective: '' });
      onNotify('Plano estratégico e OKRs salvos com persistência real.');
      await loadPlans();
    } catch (err: any) {
      onNotify(err.message, true);
    }
  };

  const updateOkrProgress = async (plan: any, okrId: string, progress: number) => {
    const nextOkrs = (plan.okrs || []).map((o: any) => (o.id === okrId ? { ...o, progress } : o));
    try {
      await apiFetch(`/api/strategy/plans/${plan.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ okrs: nextOkrs }),
      });
      await loadPlans();
    } catch (err: any) {
      onNotify(err.message, true);
    }
  };

  return (
    <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-5 space-y-4">
      <h3 className="text-sm font-bold text-white flex items-center gap-2">
        <Compass className="w-4 h-4 text-cyan-400" /> Planos Estratégicos & OKRs Persistidos
      </h3>
      <form onSubmit={handleCreate} className="grid grid-cols-1 md:grid-cols-3 gap-2.5 text-xs">
        <select value={form.clientId} onChange={(e) => setForm({ ...form, clientId: e.target.value })} className="bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-white">
          {(clients || []).map((c: any) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <input required placeholder="Título do Plano Estratégico *" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} className="bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-white" />
        <input placeholder="Trimestre (ex: Q1 2027)" value={form.quarter} onChange={(e) => setForm({ ...form, quarter: e.target.value })} className="bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-white" />
        <input required placeholder="Objetivo central *" value={form.objective} onChange={(e) => setForm({ ...form, objective: e.target.value })} className="md:col-span-2 bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-white" />
        <button type="submit" className="px-3 py-2 rounded-lg bg-cyan-500 text-slate-950 font-semibold flex items-center justify-center gap-1.5">
          <Plus className="w-4 h-4" /> Salvar Plano & OKR
        </button>
      </form>

      {loading ? (
        <div className="text-xs text-slate-400">Carregando planos estratégicos...</div>
      ) : plans.length === 0 ? (
        <div className="text-xs text-slate-500">Nenhum plano estratégico cadastrado.</div>
      ) : (
        <div className="space-y-3">
          {plans.map((p) => (
            <div key={p.id} className="p-4 rounded-xl bg-slate-950 border border-slate-800 space-y-2.5 text-xs">
              <div className="flex justify-between">
                <div>
                  <div className="font-bold text-white">{p.title}</div>
                  <div className="text-slate-400">{p.quarter} • {p.objective}</div>
                </div>
                <span className="px-2 py-0.5 rounded bg-emerald-500/15 text-emerald-300 h-fit">{p.status}</span>
              </div>
              <div className="space-y-2">
                {(p.okrs || []).map((okr: any) => (
                  <div key={okr.id} className="flex items-center gap-3">
                    <span className="text-slate-300 flex-1">{okr.objective}: <strong className="text-white">{okr.keyResult}</strong> (Meta: {okr.target})</span>
                    <input
                      type="range"
                      min={0}
                      max={100}
                      value={okr.progress}
                      onChange={(e) => void updateOkrProgress(p, okr.id, Number(e.target.value))}
                      className="w-28 accent-cyan-400"
                    />
                    <span className="font-mono text-cyan-300 w-10 text-right">{okr.progress}%</span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ============================================================================
// 5. FASE 8 — 3 NEW MODULES: QA, LAUNCH READINESS, FINAL VALIDATION & DELIVERY
// ============================================================================
export function QaLaunchDeliveryHubView({
  mode,
  activeOrgId,
  projects,
  clients,
  currentUser,
  onNotify,
}: {
  mode: 'qa' | 'launch' | 'delivery';
  activeOrgId: string;
  projects: any[];
  clients: any[];
  currentUser: any;
  onNotify: (msg: string, isError?: boolean) => void;
}) {
  const [qaItems, setQaItems] = useState<any[]>([]);
  const [integrations, setIntegrations] = useState<any[]>([]);
  const [launchData, setLaunchData] = useState<{ items: any[]; readinessPct: number; readyForGoLive: boolean }>({ items: [], readinessPct: 0, readyForGoLive: false });
  const [handoffs, setHandoffs] = useState<any[]>([]);

  const [qaForm, setQaForm] = useState({ title: '', category: 'API', severity: 'Média', evidence: '' });
  const [launchForm, setLaunchForm] = useState({ domain: 'SSL', title: '', notes: '' });
  const [handoffForm, setHandoffForm] = useState({ projectId: projects?.[0]?.id || '', title: '', summary: '', deliverablesText: '' });

  const loadAll = async () => {
    const q = `organizationId=${encodeURIComponent(activeOrgId)}`;
    if (mode === 'qa') {
      const [items, intRes] = await Promise.all([
        apiFetch<any[]>(`/api/qa/items?${q}`).catch(() => []),
        apiFetch<any>('/api/integrations/status').catch(() => ({ integrations: [] })),
      ]);
      setQaItems(items);
      setIntegrations(intRes.integrations || []);
    } else if (mode === 'launch') {
      const res = await apiFetch<any>(`/api/launch/checklist?${q}`).catch(() => ({ items: [], readinessPct: 0, readyForGoLive: false }));
      setLaunchData(res);
    } else {
      const res = await apiFetch<any[]>(`/api/delivery/handoffs?${q}`).catch(() => []);
      setHandoffs(res);
    }
  };

  useEffect(() => {
    void loadAll();
  }, [mode, activeOrgId]);

  if (mode === 'qa') {
    return (
      <div className="space-y-6">
        <div>
          <h2 className="text-2xl font-bold text-white flex items-center gap-2">
            <ClipboardCheck className="w-6 h-6 text-cyan-400" /> NER Integration & QA
          </h2>
          <p className="text-sm text-slate-400">
            Matriz real de saúde de integrações (sem credenciais fictícias) + gestão de checklists de QA e bugs.
          </p>
        </div>

        <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-5 space-y-3">
          <h3 className="text-sm font-bold text-white">Matriz Real de Integrações Externas</h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs">
            {integrations.map((intg) => (
              <div key={intg.key} className="p-3.5 rounded-xl bg-slate-950 border border-slate-800 space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-white">{intg.name}</span>
                  <span className={`px-2 py-0.5 rounded text-[10px] font-semibold ${
                    intg.configured ? 'bg-emerald-500/20 text-emerald-300' : 'bg-amber-500/20 text-amber-300'
                  }`}>
                    {intg.status}
                  </span>
                </div>
                <div className="text-[11px] text-slate-500 font-mono">Env: {intg.requiredEnv.join(', ')}</div>
              </div>
            ))}
          </div>
        </div>

        <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-5 space-y-4">
          <h3 className="text-sm font-bold text-white">Checklist de QA & Rastreamento de Defeitos</h3>
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              try {
                await apiFetch('/api/qa/items', { method: 'POST', body: JSON.stringify({ ...qaForm, organizationId: activeOrgId }) });
                setQaForm({ title: '', category: 'API', severity: 'Média', evidence: '' });
                onNotify('Item de QA adicionado.');
                await loadAll();
              } catch (err: any) {
                onNotify(err.message, true);
              }
            }}
            className="grid grid-cols-1 md:grid-cols-4 gap-2.5 text-xs"
          >
            <input required placeholder="Caso de teste / Bug *" value={qaForm.title} onChange={(e) => setQaForm({ ...qaForm, title: e.target.value })} className="md:col-span-2 bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-white" />
            <select value={qaForm.category} onChange={(e) => setQaForm({ ...qaForm, category: e.target.value })} className="bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-white">
              <option value="API">API</option>
              <option value="Integração">Integração</option>
              <option value="Segurança">Segurança</option>
              <option value="Performance">Performance</option>
              <option value="UX">UX</option>
            </select>
            <button type="submit" className="px-3 py-2 rounded-lg bg-cyan-500 text-slate-950 font-semibold">Adicionar QA</button>
          </form>

          <div className="space-y-2">
            {qaItems.map((q) => (
              <div key={q.id} className="p-3.5 rounded-xl bg-slate-950 border border-slate-800 flex flex-wrap items-center justify-between gap-3 text-xs">
                <div>
                  <div className="font-semibold text-white">{q.title}</div>
                  <div className="text-[11px] text-slate-400">{q.category} • Severidade: {q.severity} • {q.evidence || 'Sem evidência registrada'}</div>
                </div>
                <select
                  value={q.status}
                  onChange={async (e) => {
                    await apiFetch(`/api/qa/items/${q.id}`, { method: 'PATCH', body: JSON.stringify({ status: e.target.value }) });
                    onNotify('Status de QA atualizado.');
                    await loadAll();
                  }}
                  className="bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-white"
                >
                  <option value="Pendente">Pendente</option>
                  <option value="Aprovado">Aprovado</option>
                  <option value="Falhou">Falhou</option>
                  <option value="Corrigido">Corrigido</option>
                </select>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (mode === 'launch') {
    return (
      <div className="space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h2 className="text-2xl font-bold text-white flex items-center gap-2">
              <Rocket className="w-6 h-6 text-cyan-400" /> NER Production Readiness & Launch
            </h2>
            <p className="text-sm text-slate-400">
              Checklist interativo de go-live (SSL, DNS, Pixel, Migrations, Backup, Billing, Segurança).
            </p>
          </div>
          <div className="px-4 py-2 rounded-xl bg-slate-900 border border-slate-800 text-right">
            <div className="text-[11px] text-slate-400">Prontidão de Go-Live</div>
            <div className={`text-xl font-bold font-mono ${launchData.readyForGoLive ? 'text-emerald-400' : 'text-amber-300'}`}>
              {launchData.readinessPct}% {launchData.readyForGoLive ? '• PRONTO' : '• PENDÊNCIAS'}
            </div>
          </div>
        </div>

        <form
          onSubmit={async (e) => {
            e.preventDefault();
            try {
              await apiFetch('/api/launch/checklist', { method: 'POST', body: JSON.stringify({ ...launchForm, organizationId: activeOrgId }) });
              setLaunchForm({ domain: 'SSL', title: '', notes: '' });
              onNotify('Item de prontidão adicionado.');
              await loadAll();
            } catch (err: any) {
              onNotify(err.message, true);
            }
          }}
          className="bg-slate-900/60 border border-slate-800 rounded-2xl p-4 grid grid-cols-1 md:grid-cols-4 gap-2.5 text-xs"
        >
          <select value={launchForm.domain} onChange={(e) => setLaunchForm({ ...launchForm, domain: e.target.value })} className="bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-white">
            {['SSL', 'DNS', 'Pixel', 'Migrations', 'Backup', 'Billing', 'Monitoring', 'Security'].map((d) => (
              <option key={d} value={d}>{d}</option>
            ))}
          </select>
          <input required placeholder="Item obrigatório de Go-Live *" value={launchForm.title} onChange={(e) => setLaunchForm({ ...launchForm, title: e.target.value })} className="md:col-span-2 bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-white" />
          <button type="submit" className="px-3 py-2 rounded-lg bg-cyan-500 text-slate-950 font-semibold">Adicionar Item</button>
        </form>

        <div className="space-y-2.5">
          {launchData.items.map((item) => (
            <div key={item.id} className="p-4 rounded-xl bg-slate-900/60 border border-slate-800 flex flex-wrap items-center justify-between gap-3 text-xs">
              <div>
                <div className="flex items-center gap-2">
                  <span className="px-2 py-0.5 rounded bg-cyan-500/15 text-cyan-300 font-mono text-[10px]">{item.domain}</span>
                  <span className="font-semibold text-white">{item.title}</span>
                </div>
                <div className="text-[11px] text-slate-400 mt-1">
                  {item.notes || 'Sem observações'} {item.verifiedBy ? `• Verificado por ${item.verifiedBy}` : ''}
                </div>
              </div>
              <select
                value={item.status}
                onChange={async (e) => {
                  await apiFetch(`/api/launch/checklist/${item.id}`, { method: 'PATCH', body: JSON.stringify({ status: e.target.value }) });
                  onNotify('Checklist de go-live atualizado.');
                  await loadAll();
                }}
                className="bg-slate-950 border border-slate-700 rounded-lg px-2.5 py-1.5 text-white"
              >
                <option value="Pendente">Pendente</option>
                <option value="Concluído">Concluído</option>
                <option value="Bloqueado">Bloqueado</option>
              </select>
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-white flex items-center gap-2">
          <FileCheck2 className="w-6 h-6 text-cyan-400" /> NER Final Validation & Delivery
        </h2>
        <p className="text-sm text-slate-400">
          Termo formal de aceite e handoff de projeto com hash criptográfico SHA-256 e trilha auditada.
        </p>
      </div>

      {currentUser?.role !== 'Cliente' && (
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            try {
              await apiFetch('/api/delivery/handoffs', {
                method: 'POST',
                body: JSON.stringify({
                  organizationId: activeOrgId,
                  projectId: handoffForm.projectId || projects?.[0]?.id,
                  title: handoffForm.title,
                  summary: handoffForm.summary,
                  deliverablesList: handoffForm.deliverablesText.split('\n').map((s) => s.trim()).filter(Boolean),
                }),
              });
              setHandoffForm({ ...handoffForm, title: '', summary: '', deliverablesText: '' });
              onNotify('Termo de entrega gerado e enviado para aceite.');
              await loadAll();
            } catch (err: any) {
              onNotify(err.message, true);
            }
          }}
          className="bg-slate-900/60 border border-slate-800 rounded-2xl p-5 grid grid-cols-1 md:grid-cols-2 gap-3 text-xs"
        >
          <select value={handoffForm.projectId} onChange={(e) => setHandoffForm({ ...handoffForm, projectId: e.target.value })} className="bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-white">
            {(projects || []).map((p: any) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
          <input required placeholder="Título do Termo de Handoff *" value={handoffForm.title} onChange={(e) => setHandoffForm({ ...handoffForm, title: e.target.value })} className="bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-white" />
          <textarea required rows={2} placeholder="Resumo executivo da entrega *" value={handoffForm.summary} onChange={(e) => setHandoffForm({ ...handoffForm, summary: e.target.value })} className="bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-white" />
          <textarea rows={2} placeholder="Lista de entregáveis (1 por linha)" value={handoffForm.deliverablesText} onChange={(e) => setHandoffForm({ ...handoffForm, deliverablesText: e.target.value })} className="bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-white" />
          <div className="md:col-span-2 flex justify-end">
            <button type="submit" className="px-4 py-2 rounded-lg bg-cyan-500 text-slate-950 font-semibold">
              Emitir Termo de Entrega
            </button>
          </div>
        </form>
      )}

      <div className="space-y-4">
        {handoffs.map((h) => (
          <div key={h.id} className="bg-slate-900/60 border border-slate-800 rounded-2xl p-5 space-y-3 text-xs">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <div className="text-sm font-bold text-white">{h.title} ({h.version})</div>
                <div className="text-slate-400 mt-0.5">{h.summary}</div>
              </div>
              <span className={`px-2.5 py-1 rounded font-semibold ${
                h.status === 'Aceito' ? 'bg-emerald-500/20 text-emerald-300' :
                h.status === 'Ajustes solicitados' ? 'bg-amber-500/20 text-amber-300' : 'bg-cyan-500/20 text-cyan-300'
              }`}>
                {h.status}
              </span>
            </div>
            {Array.isArray(h.deliverablesList) && h.deliverablesList.length > 0 && (
              <ul className="list-disc pl-5 text-slate-300 space-y-1">
                {h.deliverablesList.map((d: string, i: number) => <li key={i}>{d}</li>)}
              </ul>
            )}
            <div className="p-3 rounded-xl bg-slate-950 border border-slate-800 text-slate-400">
              {h.acceptanceTerms}
            </div>
            {h.signatureHash ? (
              <div className="flex items-center gap-2 text-emerald-400 font-mono text-[11px]">
                <ShieldCheck className="w-4 h-4" /> Assinado por {h.acceptedByName} em {new Date(h.acceptedAt).toLocaleString('pt-BR')} • SHA-256: {h.signatureHash.slice(0, 24)}...
              </div>
            ) : (
              <div className="flex gap-2">
                <button
                  onClick={async () => {
                    await apiFetch(`/api/delivery/handoffs/${h.id}/decide`, { method: 'PATCH', body: JSON.stringify({ status: 'Aceito' }) });
                    onNotify('Termo de entrega aceito e assinado criptograficamente.');
                    await loadAll();
                  }}
                  className="px-3.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-semibold flex items-center gap-1.5"
                >
                  <CheckCircle2 className="w-3.5 h-3.5" /> Assinar Aceite Formal
                </button>
                <button
                  onClick={async () => {
                    await apiFetch(`/api/delivery/handoffs/${h.id}/decide`, { method: 'PATCH', body: JSON.stringify({ status: 'Ajustes solicitados' }) });
                    onNotify('Solicitação de ajustes registrada.');
                    await loadAll();
                  }}
                  className="px-3.5 py-1.5 rounded-lg bg-amber-600/30 text-amber-300 font-semibold"
                >
                  Solicitar Ajustes
                </button>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
