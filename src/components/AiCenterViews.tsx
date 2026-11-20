import React, { useEffect, useState } from 'react';
import {
  Activity,
  AlertTriangle,
  BarChart3,
  Bot,
  CheckCircle2,
  ChevronRight,
  Clock,
  Cpu,
  Database,
  DollarSign,
  Download,
  Eye,
  EyeOff,
  FileText,
  Filter,
  History,
  KeyRound,
  Layers,
  Lock,
  Play,
  Plus,
  RefreshCw,
  Route,
  Save,
  Search,
  Server,
  Settings,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  Trash2,
  TrendingUp,
  X,
  Zap,
} from 'lucide-react';
import { apiFetch } from '../lib/api';
import { ConsumoECustos } from './ConsumoECustos';
import { AiSettingsLimitsPanel } from './AiSettingsLimitsPanel';

export type AiTabId =
  | 'ai-dashboard'
  | 'ai-providers'
  | 'ai-models'
  | 'ai-routing'
  | 'ai-prompts'
  | 'ai-costs'
  | 'ai-history'
  | 'ai-settings';

interface AiCenterProps {
  activeTab: AiTabId;
  activeOrgId: string;
  currentUser: any;
  clients: any[];
  permissions: string[];
  onNotify: (message: string, isError?: boolean) => void;
}

const PROVIDER_META: Record<string, { badge: string; accent: string; docsHint: string }> = {
  openai: { badge: 'OAI', accent: 'text-emerald-300 bg-emerald-500/15 border-emerald-500/30', docsHint: 'OPENAI_API_KEY' },
  anthropic: { badge: 'CLD', accent: 'text-amber-300 bg-amber-500/15 border-amber-500/30', docsHint: 'ANTHROPIC_API_KEY' },
  deepseek: { badge: 'DSK', accent: 'text-blue-300 bg-blue-500/15 border-blue-500/30', docsHint: 'DEEPSEEK_API_KEY' },
  gemini: { badge: 'GEM', accent: 'text-cyan-300 bg-cyan-500/15 border-cyan-500/30', docsHint: 'GOOGLE_AI_API_KEY / GEMINI_API_KEY' },
  openrouter: { badge: 'OR', accent: 'text-violet-300 bg-violet-500/15 border-violet-500/30', docsHint: 'OPENROUTER_API_KEY' },
  ollama: { badge: 'OLL', accent: 'text-slate-200 bg-slate-700/60 border-slate-600', docsHint: 'OLLAMA_BASE_URL' },
  vllm: { badge: 'VLM', accent: 'text-indigo-300 bg-indigo-500/15 border-indigo-500/30', docsHint: 'VLLM_BASE_URL' },
  huggingface: { badge: 'HF', accent: 'text-yellow-300 bg-yellow-500/15 border-yellow-500/30', docsHint: 'HUGGINGFACE_API_TOKEN' },
};

function formatUsd(val: number | null | undefined): string {
  if (val === null || val === undefined || !Number.isFinite(val)) return '—';
  return `$${val.toFixed(4)}`;
}

function formatBrl(val: number | null | undefined): string {
  if (val === null || val === undefined || !Number.isFinite(val)) return '—';
  return `R$ ${val.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 4 })}`;
}

export interface CostFilterState {
  period: 'today' | 'yesterday' | '7d' | '30d' | 'current_month' | 'previous_month' | 'custom' | 'all';
  startDate: string;
  endDate: string;
  providerId: string;
  modelId: string;
  department: string;
  action: string;
  clientId: string;
  status: string;
  billingCategory: string;
}

const DEFAULT_COST_FILTERS: CostFilterState = {
  period: 'all',
  startDate: '',
  endDate: '',
  providerId: 'all',
  modelId: 'all',
  department: 'all',
  action: 'all',
  clientId: 'all',
  status: 'all',
  billingCategory: 'all',
};

function buildFilterQuery(activeOrgId: string, filters: CostFilterState): string {
  const params = new URLSearchParams();
  params.set('organizationId', activeOrgId);
  params.set('period', filters.period);
  if (filters.period === 'custom') {
    if (filters.startDate) params.set('startDate', filters.startDate);
    if (filters.endDate) params.set('endDate', filters.endDate);
  }
  if (filters.providerId !== 'all') params.set('providerId', filters.providerId);
  if (filters.modelId !== 'all') params.set('modelId', filters.modelId);
  if (filters.department !== 'all') params.set('department', filters.department);
  if (filters.action !== 'all') params.set('action', filters.action);
  if (filters.clientId !== 'all') params.set('clientId', filters.clientId);
  if (filters.status !== 'all') params.set('status', filters.status);
  if (filters.billingCategory !== 'all') params.set('billingCategory', filters.billingCategory);
  return params.toString();
}

function buildPeriodOnlyQuery(activeOrgId: string, filters: CostFilterState): string {
  const params = new URLSearchParams();
  params.set('organizationId', activeOrgId);
  params.set('period', filters.period);
  if (filters.period === 'custom') {
    if (filters.startDate) params.set('startDate', filters.startDate);
    if (filters.endDate) params.set('endDate', filters.endDate);
  }
  if (filters.action !== 'all') params.set('action', filters.action);
  if (filters.clientId !== 'all') params.set('clientId', filters.clientId);
  if (filters.status !== 'all') params.set('status', filters.status);
  if (filters.billingCategory !== 'all') params.set('billingCategory', filters.billingCategory);
  return params.toString();
}

export function AiCenterView({
  activeTab,
  activeOrgId,
  currentUser,
  clients,
  permissions,
  onNotify,
}: AiCenterProps) {
  const canManage = permissions.includes('*') || permissions.includes('ai.manage');
  const isSuperAdmin = currentUser?.role === 'Super Admin';
  const isAdmin = isSuperAdmin || currentUser?.role === 'Administrador';

  const [loading, setLoading] = useState(false);
  const [dashboard, setDashboard] = useState<any>(null);
  const [configStatus, setConfigStatus] = useState<any>(null);
  const [providers, setProviders] = useState<any[]>([]);
  const [models, setModels] = useState<any[]>([]);
  const [routingRules, setRoutingRules] = useState<any[]>([]);
  const [purposeRules, setPurposeRules] = useState<Record<string, any>>({});
  const [prompts, setPrompts] = useState<any[]>([]);
  const [costPolicy, setCostPolicy] = useState<any>(null);
  const [usageLogs, setUsageLogs] = useState<any[]>([]);
  const [periodUsageLogs, setPeriodUsageLogs] = useState<any[]>([]);
  const [knowledgeDocs, setKnowledgeDocs] = useState<any[]>([]);
  const [costFilters, setCostFilters] = useState<CostFilterState>(DEFAULT_COST_FILTERS);
  const [selectedLogId, setSelectedLogId] = useState<string | null>(null);

  const loadCostSlice = async (filtersOverride?: CostFilterState) => {
    const activeFilters = filtersOverride || costFilters;
    const fq = buildFilterQuery(activeOrgId, activeFilters);
    const pq = buildPeriodOnlyQuery(activeOrgId, activeFilters);
    const hasDimensionLock =
      activeFilters.providerId !== 'all' ||
      activeFilters.department !== 'all' ||
      activeFilters.modelId !== 'all';

    if (hasDimensionLock) {
      const [dash, logs, pLogs] = await Promise.all([
        apiFetch(`/api/ai/dashboard?${fq}`),
        apiFetch(`/api/ai/usage-logs?${fq}`),
        apiFetch(`/api/ai/usage-logs?${pq}`),
      ]);
      setDashboard(dash);
      setUsageLogs(logs);
      setPeriodUsageLogs(pLogs);
    } else {
      const [dash, logs] = await Promise.all([
        apiFetch(`/api/ai/dashboard?${fq}`),
        apiFetch(`/api/ai/usage-logs?${fq}`),
      ]);
      setDashboard(dash);
      setUsageLogs(logs);
      setPeriodUsageLogs(logs);
    }
  };

  const loadConfig = async () => {
    const q = `organizationId=${encodeURIComponent(activeOrgId)}`;
    const [cfg, prvs, mods, routes, purpRules, prms, pol, kdocs] = await Promise.all([
      apiFetch('/api/ai/config/status'),
      apiFetch(`/api/ai/providers?${q}`),
      apiFetch('/api/ai/models'),
      apiFetch('/api/ai/routing'),
      apiFetch('/api/ai/purposes').catch(() => ({})),
      apiFetch(`/api/ai/prompts?${q}`),
      apiFetch(`/api/ai/cost-policy?${q}`),
      apiFetch(`/api/ai/knowledge?${q}`),
    ]);
    setConfigStatus(cfg);
    setProviders(prvs);
    setModels(mods);
    setRoutingRules(routes);
    setPurposeRules(purpRules || {});
    setPrompts(prms);
    setCostPolicy(pol);
    setKnowledgeDocs(kdocs);
  };

  const loadAll = async (filtersOverride?: CostFilterState) => {
    setLoading(true);
    try {
      await Promise.all([loadConfig(), loadCostSlice(filtersOverride)]);
    } catch (err: any) {
      onNotify(err.message || 'Erro ao carregar dados do NER AI Center.', true);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    let active = true;
    setLoading(true);
    loadConfig()
      .catch((err: any) => {
        if (active) onNotify(err.message || 'Erro ao carregar configurações do NER AI Center.', true);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [activeOrgId, activeTab]);

  useEffect(() => {
    let active = true;
    loadCostSlice().catch((err: any) => {
      if (active) onNotify(err.message || 'Erro ao carregar dados de consumo do NER AI Center.', true);
    });
    return () => {
      active = false;
    };
  }, [activeOrgId, costFilters]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-800 pb-4">
        <div>
          <h2 className="text-2xl font-bold text-white tracking-tight flex items-center gap-2.5">
            <Bot className="w-6 h-6 text-cyan-400" />
            NER AI CENTER
            <span className="text-[11px] font-mono px-2.5 py-0.5 rounded bg-cyan-500/15 text-cyan-300 border border-cyan-500/30">
              NER AI GATEWAY
            </span>
          </h2>
          <p className="text-xs text-slate-400 mt-1">
            Infraestrutura unificada de provedores, roteamento inteligente, governança BYOK, custos e observabilidade.
          </p>
        </div>

        <div className="flex items-center gap-2">
          {configStatus && (
            <span
              className={`text-[11px] px-2.5 py-1 rounded-lg border flex items-center gap-1.5 ${
                configStatus.encryptionKeyConfigured
                  ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
                  : 'bg-amber-500/10 border-amber-500/30 text-amber-300'
              }`}
            >
              <Lock className="w-3.5 h-3.5" />
              {configStatus.encryptionKeyConfigured
                ? 'AES-256-GCM Ativo'
                : 'NER_AI_ENCRYPTION_KEY pendente'}
            </span>
          )}
          <button
            onClick={() => loadAll()}
            disabled={loading}
            className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs text-slate-200 flex items-center gap-1.5"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            Atualizar
          </button>
        </div>
      </div>

      {activeTab === 'ai-dashboard' && (
        <AiDashboardTab dashboard={dashboard} providers={providers} />
      )}
      {activeTab === 'ai-providers' && (
        <AiProvidersTab
          providers={providers}
          models={models}
          activeOrgId={activeOrgId}
          canManage={canManage}
          isAdmin={isAdmin}
          encryptionConfigured={Boolean(configStatus?.encryptionKeyConfigured)}
          onRefresh={loadAll}
          onNotify={onNotify}
        />
      )}
      {activeTab === 'ai-models' && (
        <AiModelsTab
          models={models}
          providers={providers}
          routingRules={routingRules}
          purposeRules={purposeRules}
          dashboard={dashboard}
          canManage={canManage}
          onRefresh={loadAll}
          onNotify={onNotify}
        />
      )}
      {activeTab === 'ai-routing' && (
        <AiRoutingTab
          routingRules={routingRules}
          providers={providers}
          models={models}
          canManage={canManage}
          onRefresh={loadAll}
          onNotify={onNotify}
        />
      )}
      {activeTab === 'ai-prompts' && (
        <AiPromptsTab
          prompts={prompts}
          providers={providers}
          models={models}
          activeOrgId={activeOrgId}
          canManage={canManage}
          onRefresh={loadAll}
          onNotify={onNotify}
        />
      )}
      {activeTab === 'ai-costs' && (
        <AiCostsTab
          dashboard={dashboard}
          costPolicy={costPolicy}
          providers={providers}
          models={models}
          clients={clients}
          usageLogs={usageLogs}
          chartUsageLogs={periodUsageLogs}
          configStatus={configStatus}
          filters={costFilters}
          onChangeFilters={setCostFilters}
          onInspectLog={(id: string) => setSelectedLogId(id)}
          activeOrgId={activeOrgId}
          canManage={canManage}
          onRefresh={() => loadAll()}
          onNotify={onNotify}
        />
      )}
      {activeTab === 'ai-history' && (
        <AiHistoryTab
          usageLogs={usageLogs}
          onInspectLog={(id: string) => setSelectedLogId(id)}
        />
      )}
      {activeTab === 'ai-settings' && (
        <AiSettingsTab
          configStatus={configStatus}
          knowledgeDocs={knowledgeDocs}
          clients={clients}
          activeOrgId={activeOrgId}
          isSuperAdmin={isSuperAdmin}
          isAdmin={isAdmin}
          canManage={canManage}
          onRefresh={loadAll}
          onNotify={onNotify}
        />
      )}

      {selectedLogId && (
        <UsageDetailModal
          logId={selectedLogId}
          activeOrgId={activeOrgId}
          canManage={canManage}
          onClose={() => setSelectedLogId(null)}
          onReconciled={() => loadAll()}
          onNotify={onNotify}
        />
      )}
    </div>
  );
}

/* ----------------------------------------------------------
 * 1. DASHBOARD DE IA
 * --------------------------------------------------------*/
function AiDashboardTab({ dashboard, providers }: { dashboard: any; providers: any[] }) {
  const s = dashboard?.summary || {
    totalRequests: 0,
    requestsToday: 0,
    totalTokens: 0,
    totalCostUsd: 0,
    dailyCostUsd: 0,
    successRatePct: 100,
    avgLatencyMs: 0,
  };
  const ps = dashboard?.providersSummary || {
    total: providers.length,
    connected: 0,
    awaiting: providers.length,
    error: 0,
  };
  const circuits = dashboard?.circuits || {};

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-5">
          <div className="text-xs text-slate-400">Provedores Conectados</div>
          <div className="text-2xl font-bold text-white mt-1">
            {ps.connected} <span className="text-sm text-slate-400">/ {ps.total}</span>
          </div>
          <div className="text-[11px] text-amber-400 mt-1">
            {ps.awaiting} aguardando • {ps.error} em erro
          </div>
        </div>
        <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-5">
          <div className="text-xs text-slate-400">Requisições Reais Executadas</div>
          <div className="text-2xl font-bold text-cyan-400 mt-1">{s.totalRequests}</div>
          <div className="text-[11px] text-slate-400 mt-1">
            Hoje: {s.requestsToday} • Sucesso: {s.successRatePct}%
          </div>
        </div>
        <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-5">
          <div className="text-xs text-slate-400">Tokens & Latência Média</div>
          <div className="text-2xl font-bold text-white mt-1">{s.totalTokens.toLocaleString('pt-BR')}</div>
          <div className="text-[11px] text-slate-400 mt-1">Latência média: {s.avgLatencyMs} ms</div>
        </div>
        <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-5">
          <div className="text-xs text-slate-400">Custo Acumulado (USD)</div>
          <div className="text-2xl font-bold text-emerald-400 mt-1">{formatUsd(s.totalCostUsd)}</div>
          <div className="text-[11px] text-slate-400 mt-1">Hoje: {formatUsd(s.dailyCostUsd)}</div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-5 space-y-3">
          <h3 className="font-bold text-white text-sm flex items-center gap-2">
            <Server className="w-4 h-4 text-cyan-400" /> Status Real dos Provedores & Circuit Breakers
          </h3>
          <div className="space-y-2">
            {providers.map((p) => {
              const cb = circuits[p.providerId];
              return (
                <div
                  key={p.providerId}
                  className="p-3 rounded-xl bg-slate-950 border border-slate-800 flex items-center justify-between gap-3 text-xs"
                >
                  <div>
                    <div className="font-semibold text-white">{p.displayName}</div>
                    <div className="text-[11px] text-slate-400 font-mono">
                      Modelo padrão: {p.defaultModel} • Chave: {p.keyMask || 'Não configurada'}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span
                      className={`px-2 py-0.5 rounded text-[10px] font-mono ${
                        cb?.state === 'OPEN'
                          ? 'bg-rose-500/20 text-rose-300'
                          : cb?.state === 'HALF_OPEN'
                            ? 'bg-amber-500/20 text-amber-300'
                            : 'bg-slate-800 text-slate-300'
                      }`}
                    >
                      CB: {cb?.state || 'CLOSED'}
                    </span>
                    <StatusBadge status={p.status} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-5 space-y-3">
          <h3 className="font-bold text-white text-sm flex items-center gap-2">
            <Activity className="w-4 h-4 text-cyan-400" /> Uso por Departamento & Provedor
          </h3>
          {(dashboard?.byDepartment || []).length === 0 ? (
            <div className="p-6 rounded-xl bg-slate-950 border border-slate-800 text-center text-xs text-slate-400">
              Nenhuma chamada de IA registrada ainda nesta organização. Os contadores reais aparecerão após o primeiro uso.
            </div>
          ) : (
            <div className="space-y-2">
              {dashboard.byDepartment.map((d: any) => (
                <div
                  key={d.key}
                  className="p-3 rounded-xl bg-slate-950 border border-slate-800 flex items-center justify-between text-xs"
                >
                  <div>
                    <div className="font-semibold text-white">{d.key}</div>
                    <div className="text-[11px] text-slate-400">
                      {d.requests} reqs • {d.tokens.toLocaleString('pt-BR')} tokens • {d.errors} erros
                    </div>
                  </div>
                  <span className="font-mono text-emerald-400">{formatUsd(d.costUsd)}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/* ----------------------------------------------------------
 * 2. PROVEDORES (8 Adaptadores + AES-256-GCM + Test + Discover)
 * --------------------------------------------------------*/
function AiProvidersTab({
  providers,
  models,
  activeOrgId,
  canManage,
  isAdmin,
  encryptionConfigured,
  onRefresh,
  onNotify,
}: any) {
  const [editing, setEditing] = useState<any | null>(null);
  const [scopeMode, setScopeMode] = useState<'global' | 'organization'>('global');
  const [apiKeyInput, setApiKeyInput] = useState('');
  const [showKey, setShowKey] = useState(false);
  const [baseUrlInput, setBaseUrlInput] = useState('');
  const [defaultModelInput, setDefaultModelInput] = useState('');
  const [rateLimitInput, setRateLimitInput] = useState(60);
  const [confirmOverwrite, setConfirmOverwrite] = useState(false);
  const [testingId, setTestingId] = useState<string | null>(null);
  const [discoveringId, setDiscoveringId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [confirmRevokeId, setConfirmRevokeId] = useState<string | null>(null);

  const openEditor = (p: any) => {
    setEditing(p);
    setScopeMode(p.hasOrgOverride ? 'organization' : isAdmin ? 'global' : 'organization');
    setApiKeyInput('');
    setShowKey(false);
    setBaseUrlInput(p.baseUrl || '');
    setDefaultModelInput(p.defaultModel || '');
    setRateLimitInput(p.rateLimitPerMin || 60);
    setConfirmOverwrite(false);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editing) return;
    setSaving(true);
    try {
      await apiFetch(`/api/ai/providers/${editing.providerId}`, {
        method: 'PUT',
        body: JSON.stringify({
          organizationId: activeOrgId,
          scope: scopeMode,
          apiKey: apiKeyInput.trim() || undefined,
          baseUrl: baseUrlInput.trim(),
          defaultModel: defaultModelInput.trim(),
          rateLimitPerMin: Number(rateLimitInput),
          confirmOverwrite: editing.hasKeyConfigured && apiKeyInput.trim() ? confirmOverwrite : true,
        }),
      });
      onNotify(`Configuração de ${editing.displayName} salva. Execute "Testar Conexão" para validar.`);
      setEditing(null);
      onRefresh();
    } catch (err: any) {
      onNotify(err.message, true);
    } finally {
      setSaving(false);
    }
  };

  const handleTest = async (p: any) => {
    setTestingId(p.providerId);
    try {
      const res = await apiFetch<any>(`/api/ai/providers/${p.providerId}/test`, {
        method: 'POST',
        body: JSON.stringify({ organizationId: activeOrgId }),
      });
      if (res.ok) {
        onNotify(`${p.displayName} conectado com sucesso (${res.latencyMs}ms)!`);
      } else {
        onNotify(`${p.displayName}: ${res.message || res.error || 'Falha na validação'}`, true);
      }
      onRefresh();
    } catch (err: any) {
      onNotify(err.message, true);
    } finally {
      setTestingId(null);
    }
  };

  const handleDiscover = async (p: any) => {
    setDiscoveringId(p.providerId);
    try {
      const res = await apiFetch<any>(`/api/ai/providers/${p.providerId}/discover-models`, {
        method: 'POST',
        body: JSON.stringify({ organizationId: activeOrgId }),
      });
      onNotify(`${res.models?.length || 0} modelos sincronizados para ${p.displayName}.`);
      onRefresh();
    } catch (err: any) {
      onNotify(err.message, true);
    } finally {
      setDiscoveringId(null);
    }
  };

  const handleRevoke = async (p: any) => {
    try {
      const targetScope = p.hasOrgOverride ? 'organization' : 'global';
      await apiFetch(
        `/api/ai/providers/${p.providerId}/credential?scope=${targetScope}&organizationId=${encodeURIComponent(activeOrgId)}`,
        { method: 'DELETE' }
      );
      setConfirmRevokeId(null);
      onNotify(`Credencial de ${p.displayName} revogada.`);
      onRefresh();
    } catch (err: any) {
      onNotify(err.message, true);
    }
  };

  return (
    <div className="space-y-5">
      {!encryptionConfigured && (
        <div className="bg-amber-500/10 border border-amber-500/30 rounded-2xl p-4 text-xs text-amber-200 flex items-start gap-3">
          <ShieldAlert className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
          <div>
            <div className="font-bold">Variável NER_AI_ENCRYPTION_KEY não configurada no servidor</div>
            <p className="text-amber-200/80 mt-0.5">
              Para criptografar e salvar novas chaves API pela interface, defina <code className="font-mono bg-slate-900 px-1.5 py-0.5 rounded">NER_AI_ENCRYPTION_KEY</code> nas variáveis de ambiente do backend. Alternativamente, defina as chaves diretamente via variáveis de ambiente (ex.: <code className="font-mono">OPENAI_API_KEY</code>, <code className="font-mono">GEMINI_API_KEY</code>).
            </p>
          </div>
        </div>
      )}

      {editing && (
        <form
          onSubmit={handleSave}
          className="bg-slate-900 border border-cyan-500/40 rounded-2xl p-5 space-y-4 shadow-2xl"
        >
          <div className="flex items-center justify-between">
            <h3 className="font-bold text-white text-sm flex items-center gap-2">
              <KeyRound className="w-4 h-4 text-cyan-400" /> Configurar {editing.displayName}
            </h3>
            <button
              type="button"
              onClick={() => setEditing(null)}
              className="text-xs text-slate-400 hover:text-white"
            >
              Fechar
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs">
            <div>
              <label className="text-slate-400 block mb-1">Escopo da Credencial</label>
              <select
                value={scopeMode}
                onChange={(e) => setScopeMode(e.target.value as any)}
                className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-white"
              >
                {isAdmin && <option value="global">Global (Plataforma)</option>}
                <option value="organization">BYOK (Organização {activeOrgId})</option>
              </select>
            </div>

            <div>
              <label className="text-slate-400 block mb-1">Modelo Padrão</label>
              <input
                type="text"
                value={defaultModelInput}
                onChange={(e) => setDefaultModelInput(e.target.value)}
                list={`models-${editing.providerId}`}
                className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-white font-mono"
              />
              <datalist id={`models-${editing.providerId}`}>
                {models
                  .filter((m: any) => m.providerId === editing.providerId)
                  .map((m: any) => (
                    <option key={m.id} value={m.modelId} />
                  ))}
              </datalist>
            </div>

            <div>
              <label className="text-slate-400 block mb-1">Rate Limit (req/min)</label>
              <input
                type="number"
                min={1}
                value={rateLimitInput}
                onChange={(e) => setRateLimitInput(Number(e.target.value))}
                className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-white font-mono"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
            {editing.requiresKey || editing.providerId === 'vllm' ? (
              <div>
                <label className="text-slate-400 block mb-1">
                  API Key / Token ({editing.keyMask ? `Atual: ${editing.keyMask}` : 'Nenhuma salva'})
                </label>
                <div className="flex gap-2">
                  <input
                    type={showKey ? 'text' : 'password'}
                    placeholder={editing.hasKeyConfigured ? 'Deixe em branco para manter a chave atual' : 'Cole sua API Key aqui...'}
                    value={apiKeyInput}
                    onChange={(e) => setApiKeyInput(e.target.value)}
                    className="flex-1 bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-white font-mono"
                  />
                  <button
                    type="button"
                    onClick={() => setShowKey(!showKey)}
                    className="px-2.5 rounded-lg bg-slate-800 text-slate-300"
                    title="Mostrar/ocultar entrada"
                  >
                    {showKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>
            ) : (
              <div className="text-slate-400 flex items-center">
                Este provedor self-hosted usa endpoint HTTP/local e não exige chave obrigatória.
              </div>
            )}

            <div>
              <label className="text-slate-400 block mb-1">Base URL / Endpoint</label>
              <input
                type="text"
                value={baseUrlInput}
                onChange={(e) => setBaseUrlInput(e.target.value)}
                placeholder="https://..."
                className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-white font-mono"
              />
            </div>
          </div>

          {editing.hasKeyConfigured && apiKeyInput.trim() && (
            <label className="flex items-center gap-2 text-xs text-amber-300 cursor-pointer">
              <input
                type="checkbox"
                checked={confirmOverwrite}
                onChange={(e) => setConfirmOverwrite(e.target.checked)}
              />
              Confirmo a substituição segura da credencial existente deste provedor.
            </label>
          )}

          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setEditing(null)}
              className="px-3 py-2 rounded-lg bg-slate-800 text-xs text-slate-300"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={saving}
              className="px-4 py-2 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-xs font-semibold text-white flex items-center gap-1.5"
            >
              <Save className="w-3.5 h-3.5" />
              {saving ? 'Criptografando...' : 'Salvar Configuração'}
            </button>
          </div>
        </form>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {providers.map((p: any) => {
          const meta = PROVIDER_META[p.providerId] || {
            badge: 'AI',
            accent: 'text-cyan-300 bg-cyan-500/15 border-cyan-500/30',
            docsHint: '',
          };
          return (
            <div key={p.providerId} className="bg-slate-900/60 border border-slate-800 rounded-2xl p-5 space-y-3">
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className={`w-10 h-10 rounded-xl border flex items-center justify-center font-black text-xs ${meta.accent}`}>
                    {meta.badge}
                  </div>
                  <div>
                    <h3 className="font-bold text-white text-sm">{p.displayName}</h3>
                    <div className="text-[11px] text-slate-400 font-mono">
                      Env: {meta.docsHint} • Escopo: {p.hasOrgOverride ? 'BYOK Org' : 'Global'}
                    </div>
                  </div>
                </div>
                <StatusBadge status={p.status} />
              </div>

              <div className="bg-slate-950 border border-slate-800 rounded-xl p-3 text-[11px] space-y-1">
                <div className="flex justify-between">
                  <span className="text-slate-400">Credencial:</span>
                  <span className="font-mono text-slate-200">{p.keyMask || 'Não configurada'}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">Endpoint:</span>
                  <span className="font-mono text-cyan-300 truncate max-w-[230px]">{p.baseUrl || 'SDK Padrão'}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">Modelo Padrão:</span>
                  <span className="font-mono text-white">{p.defaultModel}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">Última Verificação:</span>
                  <span className="text-slate-300">
                    {p.lastCheckedAt ? new Date(p.lastCheckedAt).toLocaleString('pt-BR') : 'Nunca testado'}
                  </span>
                </div>
                {p.lastError && (
                  <div className="text-rose-400 pt-1 border-t border-slate-800">
                    Erro: {p.lastError}
                  </div>
                )}
              </div>

              <div className="flex flex-wrap gap-1.5 text-[10px]">
                {p.capabilities?.chat && <CapTag label="Chat" />}
                {p.capabilities?.streaming && <CapTag label="Streaming" />}
                {p.capabilities?.embeddings && <CapTag label="Embeddings" />}
                {p.capabilities?.imageUnderstanding && <CapTag label="Visão" />}
                {p.capabilities?.structuredOutput && <CapTag label="JSON" />}
                {p.capabilities?.toolCalling && <CapTag label="Tools" />}
                {p.capabilities?.modelListing && <CapTag label="Model List" />}
              </div>

              {canManage && (
                <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-slate-800">
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => openEditor(p)}
                      className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs text-white font-medium"
                    >
                      Configurar
                    </button>
                    {p.credentialSource === 'admin_encrypted' && (
                      confirmRevokeId === p.providerId ? (
                        <div className="flex items-center gap-1">
                          <button
                            onClick={() => handleRevoke(p)}
                            className="px-2 py-1 rounded-lg bg-rose-600 hover:bg-rose-500 text-white text-[11px] font-semibold"
                          >
                            Confirmar
                          </button>
                          <button
                            onClick={() => setConfirmRevokeId(null)}
                            className="px-2 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-[11px]"
                          >
                            Cancelar
                          </button>
                        </div>
                      ) : (
                        <button
                          onClick={() => setConfirmRevokeId(p.providerId)}
                          className="p-1.5 rounded-lg bg-rose-500/15 hover:bg-rose-500/25 text-rose-300"
                          title="Revogar credencial salva"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => handleDiscover(p)}
                      disabled={discoveringId === p.providerId}
                      className="px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs text-slate-200"
                    >
                      {discoveringId === p.providerId ? 'Listando...' : 'Listar Modelos'}
                    </button>
                    <button
                      onClick={() => handleTest(p)}
                      disabled={testingId === p.providerId}
                      className="px-3 py-1.5 rounded-lg bg-cyan-600/20 hover:bg-cyan-600/30 border border-cyan-500/30 text-xs text-cyan-300 font-semibold flex items-center gap-1"
                    >
                      <Zap className="w-3.5 h-3.5" />
                      {testingId === p.providerId ? 'Testando...' : 'Testar Conexão'}
                    </button>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ----------------------------------------------------------
 * 3. MODELOS (Ativos, Limites de Tokens & Preferencial por Finalidade)
 * --------------------------------------------------------*/
const GATEWAY_CAPABILITY_LABELS: { key: string; label: string }[] = [
  { key: 'chat', label: 'Chat' },
  { key: 'textGeneration', label: 'Texto' },
  { key: 'streaming', label: 'Streaming' },
  { key: 'structuredOutput', label: 'JSON Estruturado' },
  { key: 'toolCalling', label: 'Tools' },
  { key: 'imageUnderstanding', label: 'Visão' },
  { key: 'documentAnalysis', label: 'Documentos' },
  { key: 'embeddings', label: 'Embeddings' },
];

const FALLBACK_PURPOSE_CAPABILITIES: Record<
  string,
  { requiredAny: string[]; recommended: string[]; description: string }
> = {
  general_assistant: { requiredAny: ['chat', 'textGeneration'], recommended: ['streaming'], description: 'Assistente geral conversacional' },
  marketing_strategy: { requiredAny: ['chat', 'textGeneration'], recommended: ['structuredOutput', 'toolCalling'], description: 'Diagnóstico e estratégia de marketing' },
  copywriting: { requiredAny: ['textGeneration', 'chat'], recommended: ['streaming'], description: 'Copywriting persuasivo, anúncios e páginas' },
  creatives: { requiredAny: ['textGeneration', 'chat'], recommended: ['imageUnderstanding', 'streaming'], description: 'Roteiros, hooks, VSLs e peças criativas' },
  campaign_analysis: { requiredAny: ['chat', 'textGeneration'], recommended: ['structuredOutput', 'toolCalling'], description: 'Análise de performance e mídia paga' },
  data_analysis: { requiredAny: ['chat', 'textGeneration'], recommended: ['structuredOutput'], description: 'Análise de dados, KPIs e anomalias' },
  coding: { requiredAny: ['textGeneration', 'chat'], recommended: ['toolCalling', 'structuredOutput'], description: 'Programação e revisão de código' },
  software_dev: { requiredAny: ['textGeneration', 'chat'], recommended: ['structuredOutput', 'toolCalling'], description: 'Arquitetura e especificação de software' },
  document_analysis: { requiredAny: ['documentAnalysis', 'imageUnderstanding', 'textGeneration', 'chat'], recommended: ['documentAnalysis', 'imageUnderstanding'], description: 'Leitura e extração de documentos' },
  customer_support: { requiredAny: ['chat', 'textGeneration'], recommended: ['streaming'], description: 'Atendimento contextualizado ao cliente' },
  automation: { requiredAny: ['textGeneration', 'chat'], recommended: ['structuredOutput', 'toolCalling'], description: 'Classificação e automação de fluxos' },
  embeddings: { requiredAny: ['embeddings'], recommended: ['embeddings'], description: 'Vetorização semântica e RAG' },
};

function AiModelsTab({
  models,
  providers,
  routingRules,
  purposeRules,
  dashboard,
  canManage,
  onRefresh,
  onNotify,
}: any) {
  const [statusFilter, setStatusFilter] = useState<'active' | 'all' | 'inactive'>('active');
  const [filterProvider, setFilterProvider] = useState('all');
  const [filterCapability, setFilterCapability] = useState('all');
  const [search, setSearch] = useState('');
  const [limitDrafts, setLimitDrafts] = useState<
    Record<string, { contextWindow: string; maxInputTokens: string; maxOutputTokens: string; dailyTokenLimit: string }>
  >({});
  const [savingModelId, setSavingModelId] = useState<string | null>(null);
  const [purposeDrafts, setPurposeDrafts] = useState<
    Record<string, { primaryProviderId: string; primaryModelId: string; fallbackProviderId: string; fallbackModelId: string }>
  >({});
  const [savingPurpose, setSavingPurpose] = useState<string | null>(null);
  const [showCreateForm, setShowCreateForm] = useState(false);

  const [newModel, setNewModel] = useState({
    providerId: 'ollama',
    modelId: '',
    displayName: '',
    contextWindow: 32768,
    maxInputTokens: '',
    maxOutputTokens: '4096',
    dailyTokenLimit: '',
    capabilities: {
      chat: true,
      textGeneration: true,
      streaming: true,
      structuredOutput: false,
      toolCalling: false,
      imageUnderstanding: false,
      documentAnalysis: false,
      embeddings: false,
    } as Record<string, boolean>,
  });

  const providerCapMap = new Map<string, Record<string, boolean>>(
    (providers || []).map((p: any) => [p.providerId, p.capabilities || {}])
  );
  const tokenUsageMap = new Map<string, any>(
    (dashboard?.modelTokenProgress || []).map((t: any) => [`${t.providerId}/${t.modelId}`, t])
  );
  const effectivePurposeRules =
    purposeRules && Object.keys(purposeRules).length > 0 ? purposeRules : FALLBACK_PURPOSE_CAPABILITIES;

  useEffect(() => {
    const nextLimits: Record<string, any> = {};
    for (const m of models || []) {
      nextLimits[m.id] = {
        contextWindow: String(m.contextWindow || 32768),
        maxInputTokens: m.maxInputTokens ? String(m.maxInputTokens) : '',
        maxOutputTokens: m.maxOutputTokens ? String(m.maxOutputTokens) : '',
        dailyTokenLimit: m.dailyTokenLimit ? String(m.dailyTokenLimit) : '',
      };
    }
    setLimitDrafts(nextLimits);
  }, [models]);

  useEffect(() => {
    const nextPurpose: Record<string, any> = {};
    for (const r of routingRules || []) {
      nextPurpose[r.purpose] = {
        primaryProviderId: r.primaryProviderId,
        primaryModelId: r.primaryModelId,
        fallbackProviderId: r.fallbackProviderId || '',
        fallbackModelId: r.fallbackModelId || '',
      };
    }
    setPurposeDrafts(nextPurpose);
  }, [routingRules]);

  const getEffectiveCapabilities = (m: any): Record<string, boolean> => {
    if (m.capabilities && Object.keys(m.capabilities).length > 0) {
      return m.capabilities;
    }
    return providerCapMap.get(m.providerId) || {};
  };

  const isModelCompatibleForPurpose = (m: any, purpose: string): boolean => {
    if (!m.isActive) return false;
    const rule = effectivePurposeRules[purpose];
    const reqAny: string[] = rule?.requiredAny || ['chat', 'textGeneration'];
    const caps = getEffectiveCapabilities(m);
    return reqAny.some((cap) => Boolean(caps[cap]));
  };

  const activeModels = (models || []).filter((m: any) => m.isActive);
  const inactiveModels = (models || []).filter((m: any) => !m.isActive);
  const modelsWithLimitsCount = (models || []).filter(
    (m: any) => m.maxInputTokens || m.maxOutputTokens || m.dailyTokenLimit
  ).length;

  const filtered = (models || []).filter((m: any) => {
    if (statusFilter === 'active' && !m.isActive) return false;
    if (statusFilter === 'inactive' && m.isActive) return false;
    if (filterProvider !== 'all' && m.providerId !== filterProvider) return false;
    if (filterCapability !== 'all') {
      const caps = getEffectiveCapabilities(m);
      if (!caps[filterCapability]) return false;
    }
    if (search && !`${m.modelId} ${m.displayName} ${m.providerId}`.toLowerCase().includes(search.toLowerCase())) {
      return false;
    }
    return true;
  });

  const toggleActive = async (m: any) => {
    try {
      await apiFetch(`/api/ai/models/${m.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ isActive: !m.isActive }),
      });
      onNotify(`Modelo ${m.modelId} ${!m.isActive ? 'ativado' : 'desativado'}.`);
      onRefresh();
    } catch (err: any) {
      onNotify(err.message, true);
    }
  };

  const handleSaveModelLimits = async (m: any) => {
    const d = limitDrafts[m.id];
    if (!d) return;
    setSavingModelId(m.id);
    try {
      await apiFetch(`/api/ai/models/${m.id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          contextWindow: Number(d.contextWindow) || m.contextWindow,
          maxInputTokens: d.maxInputTokens.trim() ? Number(d.maxInputTokens) : null,
          maxOutputTokens: d.maxOutputTokens.trim() ? Number(d.maxOutputTokens) : null,
          dailyTokenLimit: d.dailyTokenLimit.trim() ? Number(d.dailyTokenLimit) : null,
        }),
      });
      onNotify(`Limites de tokens de ${m.modelId} atualizados no AI Gateway.`);
      onRefresh();
    } catch (err: any) {
      onNotify(err.message, true);
    } finally {
      setSavingModelId(null);
    }
  };

  const handleSavePreferredPurpose = async (rule: any) => {
    const d = purposeDrafts[rule.purpose];
    if (!d) return;
    setSavingPurpose(rule.purpose);
    try {
      await apiFetch(`/api/ai/routing/${rule.purpose}`, {
        method: 'PATCH',
        body: JSON.stringify({
          primaryProviderId: d.primaryProviderId,
          primaryModelId: d.primaryModelId,
          fallbackProviderId: d.fallbackProviderId || null,
          fallbackModelId: d.fallbackModelId || null,
        }),
      });
      onNotify(`Modelo preferencial de "${rule.label}" atualizado (${d.primaryProviderId}/${d.primaryModelId}).`);
      onRefresh();
    } catch (err: any) {
      onNotify(err.message, true);
    } finally {
      setSavingPurpose(null);
    }
  };

  const handleAddCustom = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await apiFetch('/api/ai/models', {
        method: 'POST',
        body: JSON.stringify({
          providerId: newModel.providerId,
          modelId: newModel.modelId,
          displayName: newModel.displayName,
          contextWindow: Number(newModel.contextWindow) || 32768,
          maxInputTokens: newModel.maxInputTokens.trim() ? Number(newModel.maxInputTokens) : null,
          maxOutputTokens: newModel.maxOutputTokens.trim() ? Number(newModel.maxOutputTokens) : null,
          dailyTokenLimit: newModel.dailyTokenLimit.trim() ? Number(newModel.dailyTokenLimit) : null,
          capabilities: newModel.capabilities,
          source: 'custom',
          isActive: true,
        }),
      });
      setNewModel({
        ...newModel,
        modelId: '',
        displayName: '',
        maxInputTokens: '',
        dailyTokenLimit: '',
      });
      setShowCreateForm(false);
      onNotify('Modelo customizado cadastrado no registro central.');
      onRefresh();
    } catch (err: any) {
      onNotify(err.message, true);
    }
  };

  return (
    <div className="space-y-6">
      {/* Resumo de Modelos Ativos, Limites & Capacidades */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
        <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-4">
          <div className="text-slate-400">Modelos Ativos</div>
          <div className="text-xl font-bold text-emerald-400 mt-1">
            {activeModels.length} <span className="text-xs text-slate-400 font-normal">/ {models.length}</span>
          </div>
          <div className="text-[11px] text-slate-400 mt-0.5">{inactiveModels.length} desativado(s)</div>
        </div>
        <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-4">
          <div className="text-slate-400">Com Limite de Tokens</div>
          <div className="text-xl font-bold text-cyan-300 mt-1">{modelsWithLimitsCount}</div>
          <div className="text-[11px] text-slate-400 mt-0.5">Entrada, saída e cota diária</div>
        </div>
        <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-4">
          <div className="text-slate-400">Finalidades Mapeadas</div>
          <div className="text-xl font-bold text-white mt-1">{(routingRules || []).length}</div>
          <div className="text-[11px] text-slate-400 mt-0.5">Copy, roteiros, dados, código...</div>
        </div>
        <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-4 flex items-center justify-between gap-2">
          <div>
            <div className="text-slate-400">Novo Modelo</div>
            <div className="text-[11px] text-slate-300 mt-1">Registro no AI Gateway</div>
          </div>
          {canManage && (
            <button
              type="button"
              onClick={() => setShowCreateForm(!showCreateForm)}
              className="px-3 py-2 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-white font-semibold flex items-center gap-1"
            >
              <Plus className="w-3.5 h-3.5" /> {showCreateForm ? 'Fechar' : 'Cadastrar'}
            </button>
          )}
        </div>
      </div>

      {canManage && showCreateForm && (
        <form onSubmit={handleAddCustom} className="bg-slate-900 border border-cyan-500/40 rounded-2xl p-5 space-y-4 text-xs">
          <h3 className="font-bold text-white text-sm flex items-center gap-2">
            <Cpu className="w-4 h-4 text-cyan-400" /> Registrar Novo Modelo com Limites e Capacidades
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-6 gap-2.5">
            <select
              value={newModel.providerId}
              onChange={(e) => setNewModel({ ...newModel, providerId: e.target.value })}
              className="bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-white"
            >
              {providers.map((p: any) => (
                <option key={p.providerId} value={p.providerId}>{p.displayName}</option>
              ))}
            </select>
            <input
              type="text"
              required
              placeholder="ID do modelo (ex: qwen2.5:14b)"
              value={newModel.modelId}
              onChange={(e) => setNewModel({ ...newModel, modelId: e.target.value })}
              className="bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-white font-mono"
            />
            <input
              type="text"
              required
              placeholder="Nome de exibição"
              value={newModel.displayName}
              onChange={(e) => setNewModel({ ...newModel, displayName: e.target.value })}
              className="bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-white"
            />
            <input
              type="number"
              min={1024}
              placeholder="Contexto"
              value={newModel.contextWindow}
              onChange={(e) => setNewModel({ ...newModel, contextWindow: Number(e.target.value) })}
              className="bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-white font-mono"
              title="Janela de contexto total"
            />
            <input
              type="number"
              min={1}
              placeholder="Máx. In / Req (opc.)"
              value={newModel.maxInputTokens}
              onChange={(e) => setNewModel({ ...newModel, maxInputTokens: e.target.value })}
              className="bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-white font-mono"
            />
            <input
              type="number"
              min={1}
              placeholder="Máx. Out / Req (opc.)"
              value={newModel.maxOutputTokens}
              onChange={(e) => setNewModel({ ...newModel, maxOutputTokens: e.target.value })}
              className="bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-white font-mono"
            />
          </div>
          <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-slate-800">
            <div className="flex flex-wrap items-center gap-3">
              <span className="text-slate-400 font-semibold">Capacidades:</span>
              {GATEWAY_CAPABILITY_LABELS.map((cap) => (
                <label key={cap.key} className="flex items-center gap-1.5 text-slate-300 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={Boolean(newModel.capabilities[cap.key])}
                    onChange={(e) =>
                      setNewModel({
                        ...newModel,
                        capabilities: { ...newModel.capabilities, [cap.key]: e.target.checked },
                      })
                    }
                  />
                  {cap.label}
                </label>
              ))}
            </div>
            <div className="flex items-center gap-2">
              <input
                type="number"
                min={1}
                placeholder="Cota diária tokens (opc.)"
                value={newModel.dailyTokenLimit}
                onChange={(e) => setNewModel({ ...newModel, dailyTokenLimit: e.target.value })}
                className="w-44 bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-white font-mono"
              />
              <button type="submit" className="px-4 py-2 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white font-semibold flex items-center gap-1.5">
                <Plus className="w-3.5 h-3.5" /> Registrar Modelo
              </button>
            </div>
          </div>
        </form>
      )}

      {/* Filtros: Modelos Ativos / Provedor / Capacidade / Busca */}
      <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-4 flex flex-wrap gap-3 items-center justify-between text-xs">
        <div className="flex items-center gap-1.5">
          {(
            [
              ['active', `Ativos (${activeModels.length})`],
              ['all', `Todos (${models.length})`],
              ['inactive', `Desativados (${inactiveModels.length})`],
            ] as const
          ).map(([st, lbl]) => (
            <button
              key={st}
              type="button"
              onClick={() => setStatusFilter(st)}
              className={`px-3 py-1.5 rounded-lg font-semibold ${
                statusFilter === st
                  ? 'bg-cyan-600 text-white'
                  : 'bg-slate-950 border border-slate-800 text-slate-300 hover:text-white'
              }`}
            >
              {lbl}
            </button>
          ))}
        </div>

        <div className="flex flex-wrap gap-2.5 items-center flex-1 justify-end">
          <div className="relative min-w-[200px] flex-1 max-w-xs">
            <Search className="w-4 h-4 text-slate-500 absolute left-3 top-2" />
            <input
              type="text"
              placeholder="Buscar modelo ou provedor..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full bg-slate-950 border border-slate-800 rounded-lg pl-9 pr-3 py-1.5 text-white"
            />
          </div>
          <select
            value={filterProvider}
            onChange={(e) => setFilterProvider(e.target.value)}
            className="bg-slate-950 border border-slate-800 rounded-lg px-3 py-1.5 text-white"
          >
            <option value="all">Todos os Provedores</option>
            {providers.map((p: any) => (
              <option key={p.providerId} value={p.providerId}>{p.displayName}</option>
            ))}
          </select>
          <select
            value={filterCapability}
            onChange={(e) => setFilterCapability(e.target.value)}
            className="bg-slate-950 border border-slate-800 rounded-lg px-3 py-1.5 text-white"
          >
            <option value="all">Todas as Capacidades</option>
            {GATEWAY_CAPABILITY_LABELS.map((c) => (
              <option key={c.key} value={c.key}>{c.label}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Tabela de Modelos Ativos + Limites de Tokens Configuráveis + Capacidades */}
      <div className="bg-slate-900/60 border border-slate-800 rounded-2xl overflow-hidden">
        <div className="p-4 border-b border-slate-800 flex flex-wrap items-center justify-between gap-2">
          <div>
            <h3 className="font-bold text-white text-sm flex items-center gap-2">
              <Cpu className="w-4 h-4 text-cyan-400" /> Catálogo de Modelos e Limites de Tokens
            </h3>
            <p className="text-[11px] text-slate-400">
              Defina limites máximos por requisição (Entrada/Saída) e cota diária de tokens por modelo diretamente no Gateway.
            </p>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-950 text-slate-400 border-b border-slate-800">
              <tr>
                <th className="p-3">Modelo & Provedor</th>
                <th className="p-3">Capacidades no Gateway</th>
                <th className="p-3">Contexto / Máx. In / Máx. Out</th>
                <th className="p-3">Cota Diária de Tokens</th>
                <th className="p-3">Custo / 1M</th>
                <th className="p-3 text-right">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800">
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={6} className="p-6 text-center text-slate-400">
                    Nenhum modelo encontrado para os filtros aplicados.
                  </td>
                </tr>
              ) : (
                filtered.map((m: any) => {
                  const caps = getEffectiveCapabilities(m);
                  const draft = limitDrafts[m.id] || {
                    contextWindow: String(m.contextWindow || 32768),
                    maxInputTokens: '',
                    maxOutputTokens: '',
                    dailyTokenLimit: '',
                  };
                  const tokUsage = tokenUsageMap.get(`${m.providerId}/${m.modelId}`);
                  return (
                    <tr key={m.id} className="hover:bg-slate-900/40 align-top">
                      <td className="p-3">
                        <div className="flex items-center gap-1.5">
                          <span className="font-mono text-[10px] px-1.5 py-0.5 rounded bg-slate-800 text-cyan-300">
                            {m.providerId}
                          </span>
                          <span className="font-semibold text-white">{m.displayName}</span>
                        </div>
                        <div className="text-[11px] font-mono text-slate-400 mt-0.5">{m.modelId}</div>
                        <div className="text-[10px] text-slate-500 mt-0.5">
                          Origem: {m.source} {m.isDefaultForProvider ? '• Padrão do provedor' : ''}
                        </div>
                      </td>

                      <td className="p-3">
                        <div className="flex flex-wrap gap-1 max-w-[240px]">
                          {GATEWAY_CAPABILITY_LABELS.filter((c) => Boolean(caps[c.key])).map((c) => (
                            <CapTag key={c.key} label={c.label} />
                          ))}
                        </div>
                      </td>

                      <td className="p-3">
                        <div className="grid grid-cols-3 gap-1.5 min-w-[255px]">
                          <div>
                            <label className="text-[9px] text-slate-500 block">Contexto</label>
                            <input
                              type="number"
                              min={1024}
                              disabled={!canManage}
                              value={draft.contextWindow}
                              onChange={(e) =>
                                setLimitDrafts((prev) => ({
                                  ...prev,
                                  [m.id]: { ...draft, contextWindow: e.target.value },
                                }))
                              }
                              className="w-full bg-slate-950 border border-slate-800 rounded px-2 py-1 text-white font-mono"
                            />
                          </div>
                          <div>
                            <label className="text-[9px] text-slate-500 block">Máx. Entrada</label>
                            <input
                              type="number"
                              min={1}
                              disabled={!canManage}
                              placeholder="Sem teto"
                              value={draft.maxInputTokens}
                              onChange={(e) =>
                                setLimitDrafts((prev) => ({
                                  ...prev,
                                  [m.id]: { ...draft, maxInputTokens: e.target.value },
                                }))
                              }
                              className="w-full bg-slate-950 border border-slate-800 rounded px-2 py-1 text-white font-mono"
                            />
                          </div>
                          <div>
                            <label className="text-[9px] text-slate-500 block">Máx. Saída</label>
                            <input
                              type="number"
                              min={1}
                              disabled={!canManage}
                              placeholder="2048+"
                              value={draft.maxOutputTokens}
                              onChange={(e) =>
                                setLimitDrafts((prev) => ({
                                  ...prev,
                                  [m.id]: { ...draft, maxOutputTokens: e.target.value },
                                }))
                              }
                              className="w-full bg-slate-950 border border-slate-800 rounded px-2 py-1 text-white font-mono"
                            />
                          </div>
                        </div>
                      </td>

                      <td className="p-3">
                        <div className="space-y-1 min-w-[140px]">
                          <input
                            type="number"
                            min={1}
                            disabled={!canManage}
                            placeholder="Ilimitado"
                            value={draft.dailyTokenLimit}
                            onChange={(e) =>
                              setLimitDrafts((prev) => ({
                                ...prev,
                                [m.id]: { ...draft, dailyTokenLimit: e.target.value },
                              }))
                            }
                            className="w-full bg-slate-950 border border-slate-800 rounded px-2 py-1 text-white font-mono"
                          />
                          {tokUsage && (
                            <div className="text-[10px] font-mono">
                              <span
                                className={
                                  tokUsage.percentageUsed >= 100
                                    ? 'text-rose-400'
                                    : tokUsage.percentageUsed >= 75
                                      ? 'text-amber-300'
                                      : 'text-emerald-400'
                                }
                              >
                                Hoje: {tokUsage.usedTokensToday.toLocaleString('pt-BR')} ({tokUsage.percentageUsed}%)
                              </span>
                            </div>
                          )}
                        </div>
                      </td>

                      <td className="p-3 font-mono text-slate-300 whitespace-nowrap">
                        {m.pricingVerified && m.inputCostPer1M !== null
                          ? `$${m.inputCostPer1M} / $${m.outputCostPer1M}`
                          : 'Não verificado'}
                      </td>

                      <td className="p-3 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          {canManage && (
                            <button
                              type="button"
                              disabled={savingModelId === m.id}
                              onClick={() => handleSaveModelLimits(m)}
                              className="px-2.5 py-1 rounded bg-cyan-600/20 hover:bg-cyan-600/30 border border-cyan-500/30 text-cyan-300 text-[11px] font-semibold flex items-center gap-1"
                            >
                              <Save className="w-3 h-3" />
                              {savingModelId === m.id ? 'Salvando...' : 'Limites'}
                            </button>
                          )}
                          <button
                            type="button"
                            disabled={!canManage}
                            onClick={() => toggleActive(m)}
                            className={`px-2.5 py-1 rounded text-[11px] font-medium ${
                              m.isActive
                                ? 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/30'
                                : 'bg-slate-800 text-slate-400'
                            }`}
                          >
                            {m.isActive ? 'Ativo' : 'Desativado'}
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modelo Preferencial por Finalidade usando Capacidades Registradas no AI Gateway */}
      <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-5 space-y-4">
        <div>
          <h3 className="font-bold text-white text-sm flex items-center gap-2">
            <Layers className="w-4 h-4 text-cyan-400" /> Modelo Preferencial por Finalidade (Capacidades do AI Gateway)
          </h3>
          <p className="text-xs text-slate-400 mt-0.5">
            Selecione o modelo ativo preferencial para cada finalidade operacional (ex.: Copywriting, Roteiros/Criativos, Análise de Dados). Apenas modelos ativos compatíveis com a capacidade exigida pelo Gateway são listados.
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 text-xs">
          {(routingRules || []).map((rule: any) => {
            const capRule = effectivePurposeRules[rule.purpose] || {
              requiredAny: ['chat', 'textGeneration'],
              recommended: [],
              description: rule.label,
            };
            const compatibleModels = (models || []).filter((m: any) => isModelCompatibleForPurpose(m, rule.purpose));
            const draft = purposeDrafts[rule.purpose] || {
              primaryProviderId: rule.primaryProviderId,
              primaryModelId: rule.primaryModelId,
              fallbackProviderId: rule.fallbackProviderId || '',
              fallbackModelId: rule.fallbackModelId || '',
            };
            const selectedKey = `${draft.primaryProviderId}::${draft.primaryModelId}`;
            const fallbackKey =
              draft.fallbackProviderId && draft.fallbackModelId
                ? `${draft.fallbackProviderId}::${draft.fallbackModelId}`
                : '';

            return (
              <div key={rule.purpose} className="bg-slate-950 border border-slate-800 rounded-xl p-4 space-y-3">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <div className="font-bold text-white text-sm">{rule.label}</div>
                    <div className="text-[11px] text-slate-400">{capRule.description}</div>
                  </div>
                  <div className="flex flex-wrap gap-1 justify-end">
                    {(capRule.requiredAny || []).map((cap: string) => (
                      <span
                        key={cap}
                        className="px-2 py-0.5 rounded bg-cyan-500/15 border border-cyan-500/30 text-cyan-300 font-mono text-[10px]"
                      >
                        {cap}
                      </span>
                    ))}
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  <div>
                    <label className="text-[10px] text-slate-400 block mb-1">
                      Modelo Preferencial ({compatibleModels.length} compatíveis ativos)
                    </label>
                    <select
                      disabled={!canManage}
                      value={selectedKey}
                      onChange={(e) => {
                        const [pid, mid] = e.target.value.split('::');
                        setPurposeDrafts((prev) => ({
                          ...prev,
                          [rule.purpose]: { ...draft, primaryProviderId: pid, primaryModelId: mid },
                        }));
                      }}
                      className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-white font-mono"
                    >
                      {!compatibleModels.some((m: any) => `${m.providerId}::${m.modelId}` === selectedKey) && (
                        <option value={selectedKey}>
                          {draft.primaryProviderId}/{draft.primaryModelId} (atual)
                        </option>
                      )}
                      {compatibleModels.map((m: any) => (
                        <option key={m.id} value={`${m.providerId}::${m.modelId}`}>
                          {m.providerId}/{m.modelId} • ctx {Math.round((m.contextWindow || 0) / 1000)}k
                          {m.maxOutputTokens ? ` • out≤${m.maxOutputTokens}` : ''}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="text-[10px] text-slate-400 block mb-1">Fallback Compatível</label>
                    <select
                      disabled={!canManage}
                      value={fallbackKey}
                      onChange={(e) => {
                        if (!e.target.value) {
                          setPurposeDrafts((prev) => ({
                            ...prev,
                            [rule.purpose]: { ...draft, fallbackProviderId: '', fallbackModelId: '' },
                          }));
                        } else {
                          const [pid, mid] = e.target.value.split('::');
                          setPurposeDrafts((prev) => ({
                            ...prev,
                            [rule.purpose]: { ...draft, fallbackProviderId: pid, fallbackModelId: mid },
                          }));
                        }
                      }}
                      className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-white font-mono"
                    >
                      <option value="">Sem fallback</option>
                      {compatibleModels.map((m: any) => (
                        <option key={m.id} value={`${m.providerId}::${m.modelId}`}>
                          {m.providerId}/{m.modelId}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                {canManage && (
                  <div className="flex items-center justify-between pt-1">
                    <span className="text-[10px] font-mono text-slate-500">finalidade: {rule.purpose}</span>
                    <button
                      type="button"
                      disabled={savingPurpose === rule.purpose}
                      onClick={() => handleSavePreferredPurpose(rule)}
                      className="px-3 py-1.5 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white font-semibold flex items-center gap-1"
                    >
                      <Save className="w-3 h-3" />
                      {savingPurpose === rule.purpose ? 'Salvando...' : 'Definir Preferencial'}
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

/* ----------------------------------------------------------
 * 4. ROTEAMENTO INTELIGENTE (12 Finalidades + Fallback)
 * --------------------------------------------------------*/
function AiRoutingTab({ routingRules, providers, models, canManage, onRefresh, onNotify }: any) {
  const [drafts, setDrafts] = useState<Record<string, any>>({});

  useEffect(() => {
    const map: Record<string, any> = {};
    for (const r of routingRules) {
      map[r.purpose] = { ...r };
    }
    setDrafts(map);
  }, [routingRules]);

  const updateDraft = (purpose: string, field: string, value: any) => {
    setDrafts((prev) => ({
      ...prev,
      [purpose]: { ...prev[purpose], [field]: value },
    }));
  };

  const saveRule = async (purpose: string) => {
    const rule = drafts[purpose];
    if (!rule) return;
    try {
      await apiFetch(`/api/ai/routing/${purpose}`, {
        method: 'PATCH',
        body: JSON.stringify(rule),
      });
      onNotify(`Roteamento de "${rule.label}" atualizado.`);
      onRefresh();
    } catch (err: any) {
      onNotify(err.message, true);
    }
  };

  return (
    <div className="space-y-4">
      <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-4 text-xs text-slate-300 flex items-center gap-2">
        <Route className="w-4 h-4 text-cyan-400 shrink-0" />
        Configure o provedor/modelo primário e fallback para cada uma das 12 finalidades operacionais sem alterar código.
      </div>

      <div className="space-y-3">
        {routingRules.map((r: any) => {
          const d = drafts[r.purpose] || r;
          const primaryModels = models.filter((m: any) => m.providerId === d.primaryProviderId);
          const fallbackModels = models.filter((m: any) => m.providerId === d.fallbackProviderId);

          return (
            <div key={r.purpose} className="bg-slate-900/60 border border-slate-800 rounded-2xl p-4 space-y-3 text-xs">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <span className="font-bold text-white text-sm">{r.label}</span>
                  <span className="ml-2 font-mono text-[11px] text-cyan-400">{r.purpose}</span>
                </div>
                {canManage && (
                  <button
                    onClick={() => saveRule(r.purpose)}
                    className="px-3 py-1.5 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white font-semibold flex items-center gap-1"
                  >
                    <Save className="w-3.5 h-3.5" /> Salvar Regra
                  </button>
                )}
              </div>

              <div className="grid grid-cols-1 md:grid-cols-6 gap-2.5">
                <div>
                  <label className="text-[10px] text-slate-400 block mb-1">Provedor Primário</label>
                  <select
                    disabled={!canManage}
                    value={d.primaryProviderId}
                    onChange={(e) => {
                      const nextPid = e.target.value;
                      const firstModel = models.find((m: any) => m.providerId === nextPid)?.modelId || '';
                      updateDraft(r.purpose, 'primaryProviderId', nextPid);
                      if (firstModel) updateDraft(r.purpose, 'primaryModelId', firstModel);
                    }}
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1.5 text-white"
                  >
                    {providers.map((p: any) => (
                      <option key={p.providerId} value={p.providerId}>{p.displayName}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="text-[10px] text-slate-400 block mb-1">Modelo Primário</label>
                  <select
                    disabled={!canManage}
                    value={d.primaryModelId}
                    onChange={(e) => updateDraft(r.purpose, 'primaryModelId', e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1.5 text-white font-mono"
                  >
                    {primaryModels.map((m: any) => (
                      <option key={m.id} value={m.modelId}>{m.modelId}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="text-[10px] text-slate-400 block mb-1">Fallback Provedor</label>
                  <select
                    disabled={!canManage}
                    value={d.fallbackProviderId || ''}
                    onChange={(e) => {
                      const nextPid = e.target.value || null;
                      updateDraft(r.purpose, 'fallbackProviderId', nextPid);
                      const firstM = nextPid ? models.find((m: any) => m.providerId === nextPid)?.modelId || null : null;
                      updateDraft(r.purpose, 'fallbackModelId', firstM);
                    }}
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1.5 text-white"
                  >
                    <option value="">Sem fallback</option>
                    {providers.map((p: any) => (
                      <option key={p.providerId} value={p.providerId}>{p.displayName}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="text-[10px] text-slate-400 block mb-1">Fallback Modelo</label>
                  <select
                    disabled={!canManage || !d.fallbackProviderId}
                    value={d.fallbackModelId || ''}
                    onChange={(e) => updateDraft(r.purpose, 'fallbackModelId', e.target.value || null)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1.5 text-white font-mono"
                  >
                    <option value="">—</option>
                    {fallbackModels.map((m: any) => (
                      <option key={m.id} value={m.modelId}>{m.modelId}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="text-[10px] text-slate-400 block mb-1">Timeout (ms) / Retries</label>
                  <div className="flex gap-1.5">
                    <input
                      type="number"
                      disabled={!canManage}
                      value={d.timeoutMs}
                      onChange={(e) => updateDraft(r.purpose, 'timeoutMs', Number(e.target.value))}
                      className="w-2/3 bg-slate-950 border border-slate-800 rounded-lg px-2 py-1.5 text-white font-mono"
                    />
                    <input
                      type="number"
                      min={0}
                      max={3}
                      disabled={!canManage}
                      value={d.maxRetries}
                      onChange={(e) => updateDraft(r.purpose, 'maxRetries', Number(e.target.value))}
                      className="w-1/3 bg-slate-950 border border-slate-800 rounded-lg px-2 py-1.5 text-white font-mono"
                    />
                  </div>
                </div>

                <div className="flex items-end pb-1">
                  <label className="flex items-center gap-2 text-[11px] text-slate-300 cursor-pointer">
                    <input
                      type="checkbox"
                      disabled={!canManage}
                      checked={Boolean(d.allowMoreExpensiveFallback)}
                      onChange={(e) => updateDraft(r.purpose, 'allowMoreExpensiveFallback', e.target.checked)}
                    />
                    Permitir fallback mais caro
                  </label>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ----------------------------------------------------------
 * 5. PROMPTS VERSIONADOS + PLAYGROUND
 * --------------------------------------------------------*/
function AiPromptsTab({ prompts, providers, activeOrgId, canManage, onRefresh, onNotify }: any) {
  const [form, setForm] = useState({
    code: 'CUSTOM_STRATEGY_BRIEF',
    name: 'Novo Prompt Departamental',
    department: 'NER Strategy',
    purpose: 'marketing_strategy',
    systemPrompt: 'Você é um estrategista sênior da NER AGENCY OS. Seja objetivo e orientado a dados.',
    userTemplate: '{{input}}',
    temperature: 0.4,
    maxOutputTokens: 1200,
  });
  const [testInput, setTestInput] = useState('Analise oportunidades de aquisição B2B para ticket de R$ 3.000.');
  const [testOverrideProvider, setTestOverrideProvider] = useState('');
  const [testResult, setTestResult] = useState<any>(null);
  const [running, setRunning] = useState(false);

  const handleSavePrompt = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const saved = await apiFetch<any>('/api/ai/prompts', {
        method: 'POST',
        body: JSON.stringify({ ...form, organizationId: activeOrgId }),
      });
      onNotify(`Prompt ${saved.code} salvo na versão v${saved.version}.`);
      onRefresh();
    } catch (err: any) {
      onNotify(err.message, true);
    }
  };

  const handleTestPrompt = async (promptCode: string) => {
    setRunning(true);
    setTestResult(null);
    try {
      const res = await apiFetch<any>('/api/ai/generate', {
        method: 'POST',
        body: JSON.stringify({
          organizationId: activeOrgId,
          prompt: testInput,
          promptCode,
          department: form.department,
          purpose: form.purpose,
          overrideProviderId: testOverrideProvider || undefined,
        }),
      });
      setTestResult(res);
      onRefresh();
    } catch (err: any) {
      onNotify(err.message, true);
    } finally {
      setRunning(false);
    }
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      <div className="space-y-4">
        <h3 className="font-bold text-white text-sm flex items-center gap-2">
          <FileText className="w-4 h-4 text-cyan-400" /> Biblioteca de Prompts Versionados ({prompts.length})
        </h3>
        <div className="space-y-3">
          {prompts.map((p: any) => (
            <div key={p.id} className="bg-slate-900/60 border border-slate-800 rounded-2xl p-4 space-y-2 text-xs">
              <div className="flex items-center justify-between">
                <div>
                  <span className="font-bold text-white">{p.name}</span>
                  <span className="ml-2 font-mono text-[10px] text-cyan-400">{p.code}</span>
                </div>
                <span className="px-2 py-0.5 rounded bg-slate-800 font-mono text-emerald-300">v{p.version}</span>
              </div>
              <div className="text-[11px] text-slate-400">
                {p.department} • {p.purpose} • Histórico: {p.history?.length || 0} versões anteriores
              </div>
              <p className="text-slate-300 bg-slate-950 p-2.5 rounded-lg border border-slate-800">{p.systemPrompt}</p>
              <div className="flex justify-end gap-2">
                {canManage && (
                  <button
                    onClick={() =>
                      setForm({
                        code: p.code,
                        name: p.name,
                        department: p.department,
                        purpose: p.purpose,
                        systemPrompt: p.systemPrompt,
                        userTemplate: p.userTemplate,
                        temperature: p.temperature,
                        maxOutputTokens: p.maxOutputTokens,
                      })
                    }
                    className="px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-200"
                  >
                    Editar / Nova Versão
                  </button>
                )}
                <button
                  onClick={() => handleTestPrompt(p.code)}
                  disabled={running}
                  className="px-3 py-1 rounded bg-cyan-600/20 text-cyan-300 border border-cyan-500/30 flex items-center gap-1"
                >
                  <Play className="w-3 h-3" /> Testar
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="space-y-4">
        {canManage && (
          <form onSubmit={handleSavePrompt} className="bg-slate-900/60 border border-slate-800 rounded-2xl p-5 space-y-3 text-xs">
            <h3 className="font-bold text-white text-sm">Criar / Versionar Prompt</h3>
            <div className="grid grid-cols-2 gap-2.5">
              <input
                type="text"
                required
                placeholder="Código único"
                value={form.code}
                onChange={(e) => setForm({ ...form, code: e.target.value.toUpperCase() })}
                className="bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-white font-mono"
              />
              <input
                type="text"
                required
                placeholder="Nome do prompt"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                className="bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-white"
              />
            </div>
            <div className="grid grid-cols-2 gap-2.5">
              <select
                value={form.department}
                onChange={(e) => setForm({ ...form, department: e.target.value })}
                className="bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-white"
              >
                <option value="NER Strategy">NER Strategy</option>
                <option value="NER Creative">NER Creative</option>
                <option value="NER Performance">NER Performance</option>
                <option value="NER Tracking">NER Tracking</option>
                <option value="NER Automation">NER Automation</option>
                <option value="NER Intelligence">NER Intelligence</option>
                <option value="NER Web">NER Web</option>
                <option value="NER Digital Studio">NER Digital Studio</option>
                <option value="NER Client Experience">NER Client Experience</option>
              </select>
              <input
                type="number"
                step={0.1}
                min={0}
                max={2}
                value={form.temperature}
                onChange={(e) => setForm({ ...form, temperature: Number(e.target.value) })}
                className="bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-white font-mono"
              />
            </div>
            <textarea
              rows={3}
              required
              value={form.systemPrompt}
              onChange={(e) => setForm({ ...form, systemPrompt: e.target.value })}
              className="w-full bg-slate-950 border border-slate-800 rounded-lg p-3 text-white"
            />
            <button type="submit" className="px-4 py-2 rounded-lg bg-cyan-600 text-white font-semibold">
              Salvar / Incrementar Versão
            </button>
          </form>
        )}

        <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-5 space-y-3 text-xs">
          <h3 className="font-bold text-white text-sm flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-cyan-400" /> Playground do Gateway Central
          </h3>
          <div className="flex gap-2">
            <select
              value={testOverrideProvider}
              onChange={(e) => setTestOverrideProvider(e.target.value)}
              className="bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-white"
            >
              <option value="">Roteamento Automático</option>
              {providers.map((p: any) => (
                <option key={p.providerId} value={p.providerId}>{p.displayName}</option>
              ))}
            </select>
            <button
              onClick={() => handleTestPrompt(form.code)}
              disabled={running}
              className="px-4 py-2 rounded-lg bg-emerald-600 text-white font-semibold"
            >
              {running ? 'Executando...' : 'Executar Teste'}
            </button>
          </div>
          <textarea
            rows={2}
            value={testInput}
            onChange={(e) => setTestInput(e.target.value)}
            className="w-full bg-slate-950 border border-slate-800 rounded-lg p-3 text-white"
          />
          {testResult && (
            <div className="bg-slate-950 border border-slate-800 rounded-xl p-4 space-y-2">
              <div className="flex flex-wrap gap-2 text-[10px] font-mono text-cyan-300">
                <span>{testResult.providerId}/{testResult.modelId}</span>
                <span>• {testResult.latencyMs}ms</span>
                <span>• Tokens: {testResult.inputTokens} in / {testResult.outputTokens} out</span>
                <span>• Custo: {formatUsd(testResult.estimatedCostUsd)}</span>
                {testResult.fallbackUsed && <span className="text-amber-300">• Fallback de {testResult.fallbackFrom}</span>}
              </div>
              <div className="text-slate-200 whitespace-pre-wrap">{testResult.text}</div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/* ----------------------------------------------------------
/* ----------------------------------------------------------
 * 6. NER AI COST INTELLIGENCE — CONSUMO E CUSTOS
 * --------------------------------------------------------*/
const DEPT_LIST_FOR_CAPS = [
  'NER Strategy',
  'NER Creative',
  'NER Performance',
  'NER Tracking',
  'NER Automation',
  'NER Intelligence',
  'NER Web',
  'NER Digital Studio',
  'NER Client Experience',
];

const BILLING_CATEGORY_LABELS: Record<string, string> = {
  internal_agency: 'Uso Interno da Agência',
  client_included: 'Incluído no Plano do Cliente',
  client_additional: 'Consumo Adicional',
  client_overage: 'Excedente de Franquia',
};

function AiCostsTab({
  dashboard,
  costPolicy,
  providers,
  models,
  clients,
  usageLogs,
  chartUsageLogs,
  configStatus,
  filters,
  onChangeFilters,
  onInspectLog,
  activeOrgId,
  canManage,
  onRefresh,
  onNotify,
}: any) {
  const [subTab, setSubTab] = useState<'overview' | 'actions' | 'providers' | 'clients' | 'governance'>('overview');
  const [selectedDeptDrill, setSelectedDeptDrill] = useState<string>('all');
  const [selectedActionKey, setSelectedActionKey] = useState<string>('');
  const [exporting, setExporting] = useState<string | null>(null);
  const [exportSegment, setExportSegment] = useState<
    'client_provider_department' | 'provider_client' | 'client' | 'provider' | 'department' | 'detailed'
  >('client_provider_department');

  const [policyForm, setPolicyForm] = useState({
    dailyLimitUsd: 25,
    monthlyLimitUsd: 500,
    userDailyLimitUsd: 10,
    alertThresholdPct: 80,
    blockOnExceed: true,
    onExceedAction: 'block_non_essential',
    departmentLimitsUsd: {} as Record<string, string>,
    providerLimitsUsd: {} as Record<string, string>,
    modelLimitsUsdText: '',
    actionLimitsUsdText: '',
    restrictedActionsText: '',
  });

  const [exchangeForm, setExchangeForm] = useState({
    rate: 5.75,
    rateDate: new Date().toISOString().slice(0, 10),
    source: 'Referência Administrativa Configurável',
  });

  const [exceptionForm, setExceptionForm] = useState({
    scope: 'department',
    targetKey: 'NER Creative',
    extraBudgetUsd: 10,
    reason: 'Aprovação para campanha prioritária',
    hoursValid: 24,
  });

  const [newActionForm, setNewActionForm] = useState({
    id: '',
    department: 'NER Strategy',
    name: '',
    purpose: 'marketing_strategy',
    description: '',
    isCritical: false,
    cacheable: false,
  });

  const [pricingDrafts, setPricingDrafts] = useState<
    Record<
      string,
      {
        inputCostPer1M: string;
        outputCostPer1M: string;
        cacheInputCostPer1M: string;
        reasoningCostPer1M: string;
        priceSource: string;
        pricingVerified: boolean;
      }
    >
  >({});
  const [pricingFilter, setPricingFilter] = useState<'all' | 'used' | 'unpriced'>('all');
  const [savingPricing, setSavingPricing] = useState(false);

  const mapToKeyLines = (obj: Record<string, number> | undefined) =>
    Object.entries(obj || {})
      .map(([k, v]) => `${k}=${v}`)
      .join('\n');

  const parseKeyLines = (text: string): Record<string, number> => {
    const out: Record<string, number> = {};
    for (const line of text.split(/\n|,/)) {
      const [k, v] = line.split('=').map((s) => s?.trim());
      const num = Number(v);
      if (k && Number.isFinite(num) && num > 0) out[k] = num;
    }
    return out;
  };

  useEffect(() => {
    if (costPolicy) {
      const deptMap: Record<string, string> = {};
      for (const [k, v] of Object.entries(costPolicy.departmentLimitsUsd || {})) {
        if (v !== undefined && v !== null && Number(v) > 0) deptMap[k] = String(v);
      }
      const provMap: Record<string, string> = {};
      for (const [k, v] of Object.entries(costPolicy.providerLimitsUsd || {})) {
        if (v !== undefined && v !== null && Number(v) > 0) provMap[k] = String(v);
      }
      setPolicyForm({
        dailyLimitUsd: costPolicy.dailyLimitUsd,
        monthlyLimitUsd: costPolicy.monthlyLimitUsd,
        userDailyLimitUsd: costPolicy.userDailyLimitUsd,
        alertThresholdPct: costPolicy.alertThresholdPct,
        blockOnExceed: costPolicy.blockOnExceed,
        onExceedAction: costPolicy.onExceedAction || 'block_non_essential',
        departmentLimitsUsd: deptMap,
        providerLimitsUsd: provMap,
        modelLimitsUsdText: mapToKeyLines(costPolicy.modelLimitsUsd),
        actionLimitsUsdText: mapToKeyLines(costPolicy.actionLimitsUsd),
        restrictedActionsText: (costPolicy.restrictedActions || []).join(', '),
      });
    }
  }, [costPolicy]);

  useEffect(() => {
    if (dashboard?.exchangeConfig) {
      setExchangeForm({
        rate: dashboard.exchangeConfig.rate,
        rateDate: dashboard.exchangeConfig.rateDate,
        source: dashboard.exchangeConfig.source,
      });
    }
  }, [dashboard?.exchangeConfig]);

  useEffect(() => {
    const map: Record<string, any> = {};
    for (const m of models || []) {
      map[m.id] = {
        inputCostPer1M: m.inputCostPer1M !== null && m.inputCostPer1M !== undefined ? String(m.inputCostPer1M) : '',
        outputCostPer1M: m.outputCostPer1M !== null && m.outputCostPer1M !== undefined ? String(m.outputCostPer1M) : '',
        cacheInputCostPer1M:
          m.cacheInputCostPer1M !== null && m.cacheInputCostPer1M !== undefined ? String(m.cacheInputCostPer1M) : '',
        reasoningCostPer1M:
          m.reasoningCostPer1M !== null && m.reasoningCostPer1M !== undefined ? String(m.reasoningCostPer1M) : '',
        priceSource: m.priceSource || '',
        pricingVerified: Boolean(m.pricingVerified),
      };
    }
    setPricingDrafts(map);
  }, [models]);

  const handleExport = async (format: 'csv' | 'xlsx' | 'pdf') => {
    setExporting(format);
    try {
      const token = sessionStorage.getItem('ner_token');
      const fq = buildFilterQuery(activeOrgId, filters);
      const res = await fetch(
        `/api/ai/reports/export?format=${format}&segmentBy=${encodeURIComponent(exportSegment)}&${fq}`,
        {
          headers: {
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
          credentials: 'include',
        }
      );
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || `Falha ao exportar ${format.toUpperCase()}`);
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `ner-ai-cost-${exportSegment}-${activeOrgId}-${new Date().toISOString().slice(0, 10)}.${format}`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      onNotify(`Relatório ${format.toUpperCase()} (${exportSegment}) exportado com filtros aplicados.`);
    } catch (err: any) {
      onNotify(err.message, true);
    } finally {
      setExporting(null);
    }
  };

  const handleSavePolicy = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const parsedDeptLimits: Record<string, number> = {};
      for (const [dept, val] of Object.entries(policyForm.departmentLimitsUsd)) {
        const num = Number(val);
        if (Number.isFinite(num) && num > 0) parsedDeptLimits[dept] = num;
      }
      const parsedProvLimits: Record<string, number> = {};
      for (const [prov, val] of Object.entries(policyForm.providerLimitsUsd)) {
        const num = Number(val);
        if (Number.isFinite(num) && num > 0) parsedProvLimits[prov] = num;
      }
      await apiFetch('/api/ai/cost-policy', {
        method: 'PUT',
        body: JSON.stringify({
          organizationId: activeOrgId,
          dailyLimitUsd: policyForm.dailyLimitUsd,
          monthlyLimitUsd: policyForm.monthlyLimitUsd,
          userDailyLimitUsd: policyForm.userDailyLimitUsd,
          alertThresholdPct: policyForm.alertThresholdPct,
          alertThresholds: [50, 75, 90, 100],
          blockOnExceed: policyForm.onExceedAction !== 'notify',
          onExceedAction: policyForm.onExceedAction,
          departmentLimitsUsd: parsedDeptLimits,
          providerLimitsUsd: parsedProvLimits,
          modelLimitsUsd: parseKeyLines(policyForm.modelLimitsUsdText),
          actionLimitsUsd: parseKeyLines(policyForm.actionLimitsUsdText),
          restrictedActions: policyForm.restrictedActionsText
            .split(',')
            .map((s) => s.trim())
            .filter(Boolean),
        }),
      });
      onNotify('Política multi-escopo de limites e ações atualizada.');
      onRefresh();
    } catch (err: any) {
      onNotify(err.message, true);
    }
  };

  const handleSaveExchange = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await apiFetch('/api/ai/exchange-rate', {
        method: 'PUT',
        body: JSON.stringify(exchangeForm),
      });
      onNotify(`Taxa de câmbio USD→BRL atualizada para ${exchangeForm.rate}.`);
      onRefresh();
    } catch (err: any) {
      onNotify(err.message, true);
    }
  };

  const handleGrantException = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const expiresAt = new Date(Date.now() + Number(exceptionForm.hoursValid || 24) * 3600_000).toISOString();
      await apiFetch('/api/ai/limit-exceptions', {
        method: 'POST',
        body: JSON.stringify({
          organizationId: activeOrgId,
          scope: exceptionForm.scope,
          targetKey: exceptionForm.targetKey,
          extraBudgetUsd: Number(exceptionForm.extraBudgetUsd),
          reason: exceptionForm.reason,
          expiresAt,
        }),
      });
      onNotify('Exceção temporária de orçamento autorizada e auditada.');
      onRefresh();
    } catch (err: any) {
      onNotify(err.message, true);
    }
  };

  const handleRevokeException = async (id: string) => {
    try {
      await apiFetch(`/api/ai/limit-exceptions/${id}?organizationId=${encodeURIComponent(activeOrgId)}`, {
        method: 'DELETE',
      });
      onNotify('Exceção temporária revogada.');
      onRefresh();
    } catch (err: any) {
      onNotify(err.message, true);
    }
  };

  const handleSaveAction = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await apiFetch('/api/ai/actions', {
        method: 'POST',
        body: JSON.stringify(newActionForm),
      });
      setNewActionForm({
        id: '',
        department: 'NER Strategy',
        name: '',
        purpose: 'marketing_strategy',
        description: '',
        isCritical: false,
        cacheable: false,
      });
      onNotify('Identificador de ação registrado no catálogo do Gateway.');
      onRefresh();
    } catch (err: any) {
      onNotify(err.message, true);
    }
  };

  const handleResolveAccountingAlert = async (alertId: string) => {
    try {
      await apiFetch(`/api/ai/accounting-alerts/${alertId}/resolve`, {
        method: 'PATCH',
        body: JSON.stringify({ organizationId: activeOrgId }),
      });
      onNotify('Alerta contábil marcado como reconciliado.');
      onRefresh();
    } catch (err: any) {
      onNotify(err.message, true);
    }
  };

  const handleSavePricingTable = async () => {
    setSavingPricing(true);
    try {
      const items = (models || []).map((m: any) => {
        const d = pricingDrafts[m.id];
        const inVal = d?.inputCostPer1M?.trim();
        const outVal = d?.outputCostPer1M?.trim();
        const cacheVal = d?.cacheInputCostPer1M?.trim();
        const reasonVal = d?.reasoningCostPer1M?.trim();
        const hasValues = inVal !== '' && outVal !== '' && inVal !== undefined && outVal !== undefined;
        return {
          providerId: m.providerId,
          modelId: m.modelId,
          inputCostPer1M: hasValues ? Number(inVal) : null,
          outputCostPer1M: hasValues ? Number(outVal) : null,
          cacheInputCostPer1M: cacheVal ? Number(cacheVal) : null,
          reasoningCostPer1M: reasonVal ? Number(reasonVal) : null,
          priceSource: d?.priceSource || 'Tabela Administrativa',
          pricingVerified: hasValues ? Boolean(d?.pricingVerified ?? true) : false,
        };
      });
      const res = await apiFetch<any>('/api/ai/pricing', {
        method: 'PUT',
        body: JSON.stringify({ items }),
      });
      onNotify(`Tabela de preços atualizada (${res.updatedCount} modelos). Estimativas recalculadas pelos logs reais.`);
      onRefresh();
    } catch (err: any) {
      onNotify(err.message, true);
    } finally {
      setSavingPricing(false);
    }
  };

  const summary = dashboard?.summary || {
    totalRequests: 0,
    requestsToday: 0,
    totalInputTokens: 0,
    totalOutputTokens: 0,
    totalCachedInputTokens: 0,
    totalReasoningTokens: 0,
    totalTokens: 0,
    totalCostUsd: 0,
    totalCostBrl: 0,
    dailyCostUsd: 0,
    dailyCostBrl: 0,
    weeklyCostUsd: 0,
    weeklyCostBrl: 0,
    monthlyCostUsd: 0,
    monthlyCostBrl: 0,
    projectedNextMonthUsd: 0,
    projectedNextMonthBrl: 0,
    avgCostPerRequestUsd: 0,
    avgCostPerRequestBrl: 0,
    budgetBlockedCount: 0,
    unpricedRequestsCount: 0,
    unavailableUsageCount: 0,
    successRatePct: 100,
    avgLatencyMs: 0,
  };
  const progress = dashboard?.budgetProgress;
  const alerts: any[] = dashboard?.alerts || [];
  const anomalies: any[] = dashboard?.anomalies || [];
  const actionsList: any[] = dashboard?.actions || [];
  const limitExceptions: any[] = dashboard?.limitExceptions || [];
  const accountingAlerts: any[] = (dashboard?.accountingAlerts || []).filter((a: any) => !a.resolved);
  const byAction: any[] = dashboard?.byAction || [];
  const filteredActions =
    selectedDeptDrill === 'all' ? byAction : byAction.filter((a) => a.department === selectedDeptDrill);
  const activeActionDetail =
    filteredActions.find((a) => a.key === selectedActionKey) || filteredActions[0] || null;

  const usedModelKeys = new Set((usageLogs || []).map((l: any) => `${l.providerId}/${l.modelId}`));
  const filteredModelsForPricing = (models || []).filter((m: any) => {
    const key = `${m.providerId}/${m.modelId}`;
    if (pricingFilter === 'used') return usedModelKeys.has(key);
    if (pricingFilter === 'unpriced') return !m.pricingVerified && m.providerId !== 'ollama' && m.providerId !== 'vllm';
    return true;
  });

  const clientNameMap = new Map<string, string>((clients || []).map((c: any) => [c.id, c.name]));

  return (
    <div className="space-y-5">
      {/* Cabeçalho NER AI Cost Intelligence + Barra Completa de Filtros & Exportação */}
      <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-4 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="text-xs text-slate-300 flex flex-wrap items-center gap-2">
            <span className="font-bold text-white flex items-center gap-1.5">
              <BarChart3 className="w-4 h-4 text-cyan-400" /> NER AI COST INTELLIGENCE
            </span>
            <span className="text-slate-600">•</span>
            <span>{usageLogs.length} registros filtrados</span>
            <span className="text-slate-600">•</span>
            <span className="font-mono text-cyan-400">
              Câmbio: 1 USD = R$ {(dashboard?.exchangeConfig?.rate || exchangeForm.rate).toFixed(2)} ({dashboard?.exchangeConfig?.rateDate || exchangeForm.rateDate})
            </span>
            <span className="text-slate-600">•</span>
            <span className="font-mono text-slate-400">Tabela: {configStatus?.pricingVersion || 'padrão'}</span>
          </div>

          <div className="flex flex-wrap items-center gap-1.5 text-xs">
            <select
              aria-label="Segmentação do relatório de faturamento"
              value={exportSegment}
              onChange={(e) => setExportSegment(e.target.value as any)}
              className="bg-slate-950 border border-slate-700 rounded-lg px-2.5 py-1.5 text-slate-200 font-medium"
            >
              <option value="client_provider_department">Faturamento: Cliente, Provedor & Depto</option>
              <option value="provider_client">Provedor & Cliente</option>
              <option value="client">Segmentado por Cliente</option>
              <option value="provider">Segmentado por Provedor</option>
              <option value="department">Segmentado por Departamento</option>
              <option value="detailed">Detalhado Completo</option>
            </select>
            {(['csv', 'xlsx', 'pdf'] as const).map((fmt) => (
              <button
                key={fmt}
                type="button"
                disabled={exporting !== null}
                onClick={() => handleExport(fmt)}
                className="px-3 py-1.5 rounded-lg bg-slate-950 hover:bg-slate-800 border border-slate-700 text-slate-200 font-medium flex items-center gap-1.5"
              >
                <Download className="w-3.5 h-3.5 text-cyan-400" />
                {exporting === fmt ? 'Gerando...' : `Exportar ${fmt.toUpperCase()}`}
              </button>
            ))}
          </div>
        </div>

        {/* Filtros Completos */}
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-2 text-xs pt-2 border-t border-slate-800">
          <select
            value={filters.period}
            onChange={(e) => onChangeFilters({ ...filters, period: e.target.value as any })}
            className="bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1.5 text-white"
          >
            <option value="today">Hoje</option>
            <option value="yesterday">Ontem</option>
            <option value="7d">Últimos 7 dias</option>
            <option value="30d">Últimos 30 dias</option>
            <option value="current_month">Mês atual</option>
            <option value="previous_month">Mês anterior</option>
            <option value="custom">Personalizado</option>
            <option value="all">Todo histórico</option>
          </select>

          <select
            value={filters.providerId}
            onChange={(e) => onChangeFilters({ ...filters, providerId: e.target.value })}
            className="bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1.5 text-white"
          >
            <option value="all">Todos Provedores</option>
            {(providers || []).map((p: any) => (
              <option key={p.providerId} value={p.providerId}>{p.displayName}</option>
            ))}
          </select>

          <select
            value={filters.modelId}
            onChange={(e) => onChangeFilters({ ...filters, modelId: e.target.value })}
            className="bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1.5 text-white font-mono"
          >
            <option value="all">Todos Modelos</option>
            {(models || []).map((m: any) => (
              <option key={m.id} value={m.modelId}>{m.modelId}</option>
            ))}
          </select>

          <select
            value={filters.department}
            onChange={(e) => onChangeFilters({ ...filters, department: e.target.value })}
            className="bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1.5 text-white"
          >
            <option value="all">Todos Deptos</option>
            {DEPT_LIST_FOR_CAPS.map((d) => (
              <option key={d} value={d}>{d}</option>
            ))}
          </select>

          <select
            value={filters.action}
            onChange={(e) => onChangeFilters({ ...filters, action: e.target.value })}
            className="bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1.5 text-white font-mono"
          >
            <option value="all">Todas Ações</option>
            {actionsList.map((a: any) => (
              <option key={a.id} value={a.id}>{a.id}</option>
            ))}
          </select>

          <select
            value={filters.clientId}
            onChange={(e) => onChangeFilters({ ...filters, clientId: e.target.value })}
            className="bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1.5 text-white"
          >
            <option value="all">Todos Clientes</option>
            <option value="internal">Agência (Interno)</option>
            {(clients || []).map((c: any) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>

          <select
            value={filters.status}
            onChange={(e) => onChangeFilters({ ...filters, status: e.target.value })}
            className="bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1.5 text-white"
          >
            <option value="all">Todos Status</option>
            <option value="success">Sucesso</option>
            <option value="error">Erro</option>
            <option value="budget_blocked">Bloqueado Orçamento</option>
            <option value="rate_limited">Rate Limited</option>
          </select>

          <select
            value={filters.billingCategory}
            onChange={(e) => onChangeFilters({ ...filters, billingCategory: e.target.value })}
            className="bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1.5 text-white"
          >
            <option value="all">Todas Categorias</option>
            <option value="internal_agency">Uso Interno</option>
            <option value="client_included">Incluído no Plano</option>
            <option value="client_additional">Adicional</option>
            <option value="client_overage">Excedente</option>
          </select>
        </div>

        {filters.period === 'custom' && (
          <div className="flex flex-wrap items-center gap-3 text-xs pt-2 border-t border-slate-800">
            <Filter className="w-3.5 h-3.5 text-cyan-400" />
            <label className="text-slate-400">De:</label>
            <input
              type="date"
              value={filters.startDate}
              onChange={(e) => onChangeFilters({ ...filters, startDate: e.target.value })}
              className="bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1 text-white font-mono"
            />
            <label className="text-slate-400">Até:</label>
            <input
              type="date"
              value={filters.endDate}
              onChange={(e) => onChangeFilters({ ...filters, endDate: e.target.value })}
              className="bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1 text-white font-mono"
            />
          </div>
        )}
      </div>

      {/* Sub-navegação interna de Consumo & Custos */}
      <div className="flex flex-wrap gap-2 text-xs">
        {(
          [
            ['overview', 'Visão Geral & KPIs'],
            ['actions', 'Departamentos & Ações'],
            ['providers', 'Provedores & Modelos'],
            ['clients', 'Custo por Cliente'],
            ['governance', 'Preços, Câmbio, Limites & Exceções'],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            onClick={() => setSubTab(id)}
            className={`px-3.5 py-2 rounded-xl font-semibold transition-all ${
              subTab === id
                ? 'bg-cyan-600 text-white shadow'
                : 'bg-slate-900/60 border border-slate-800 text-slate-400 hover:text-white'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Alertas de Limites, Anomalias e Reconciliação Contábil */}
      <div className="space-y-2">
        {alerts.length === 0 && accountingAlerts.length === 0 ? (
          <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-2xl p-3.5 text-xs text-emerald-200 flex items-center gap-3">
            <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
            <span>
              <strong>Consumo dentro dos limites configurados.</strong> Sem alertas de marcos (50/75/90/100%), bloqueios ou divergências contábeis no período.
            </span>
          </div>
        ) : (
          <>
            {alerts.map((al) => (
              <div
                key={al.id}
                className={`rounded-2xl p-3.5 border text-xs flex items-start gap-3 ${
                  al.severity === 'critical'
                    ? 'bg-rose-500/10 border-rose-500/40 text-rose-200'
                    : al.severity === 'warning'
                      ? 'bg-amber-500/10 border-amber-500/40 text-amber-200'
                      : 'bg-cyan-500/10 border-cyan-500/30 text-cyan-200'
                }`}
              >
                {al.severity === 'critical' ? (
                  <ShieldAlert className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
                ) : (
                  <AlertTriangle className={`w-4 h-4 shrink-0 mt-0.5 ${al.severity === 'warning' ? 'text-amber-400' : 'text-cyan-400'}`} />
                )}
                <div className="flex-1">
                  <div className="font-bold flex items-center justify-between gap-2">
                    <span>{al.title}</span>
                    {al.percentageUsed !== undefined && (
                      <span className="font-mono px-2 py-0.5 rounded bg-slate-950/60">
                        {al.percentageUsed}% usado
                      </span>
                    )}
                  </div>
                  <p className="mt-0.5 opacity-90">{al.message}</p>
                </div>
              </div>
            ))}
            {accountingAlerts.map((aa: any) => (
              <div
                key={aa.id}
                className="rounded-2xl p-3.5 border border-amber-500/40 bg-amber-500/10 text-amber-200 text-xs flex items-center justify-between gap-3"
              >
                <div>
                  <div className="font-bold">Alerta Contábil ({aa.requestId})</div>
                  <div className="opacity-90">{aa.message}</div>
                </div>
                {canManage && (
                  <button
                    onClick={() => handleResolveAccountingAlert(aa.id)}
                    className="px-3 py-1 rounded-lg bg-amber-500/20 hover:bg-amber-500/30 text-amber-200 font-semibold shrink-0"
                  >
                    Reconciliar
                  </button>
                )}
              </div>
            ))}
          </>
        )}
      </div>

      {/* SUB-ABA 1: CONSUMO E CUSTOS (RECHARTS) + 12 KPIS */}
      {subTab === 'overview' && (
        <div className="space-y-5">
          {/* Componente Consumo e Custos em destaque acima da dobra: Gráficos Recharts (aiGateway.usageLogs) + Alertas de Projeção */}
          <ConsumoECustos
            usageLogs={usageLogs}
            chartUsageLogs={chartUsageLogs}
            exchangeRate={dashboard?.exchangeConfig?.rate || exchangeForm.rate || 5.75}
            filters={filters}
            onChangeFilters={onChangeFilters}
            budgetProgress={progress}
            costPolicy={costPolicy}
            summary={summary}
            alerts={alerts}
          />

          {/* 12 KPIs Completos (USD, BRL, Tokens, Cache, Reasoning, Projeção, Latência, Sucesso) */}
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
            <KpiCostCard
              label="Custo Total (Período)"
              primary={formatUsd(summary.totalCostUsd)}
              secondary={formatBrl(summary.totalCostBrl)}
              accent="text-emerald-400"
            />
            <KpiCostCard
              label="Custo Hoje"
              primary={formatUsd(summary.dailyCostUsd)}
              secondary={formatBrl(summary.dailyCostBrl)}
              accent="text-cyan-300"
            />
            <KpiCostCard
              label="Custo Semana (7d)"
              primary={formatUsd(summary.weeklyCostUsd)}
              secondary={formatBrl(summary.weeklyCostBrl)}
              accent="text-cyan-300"
            />
            <KpiCostCard
              label="Custo Mês Atual"
              primary={formatUsd(summary.monthlyCostUsd)}
              secondary={formatBrl(summary.monthlyCostBrl)}
              accent="text-white"
            />
            <KpiCostCard
              label="Projeção Próx. Mês"
              primary={formatUsd(summary.projectedNextMonthUsd)}
              secondary={`Run-rate: ${formatBrl(summary.projectedNextMonthBrl)}`}
              accent="text-amber-300"
            />
            <KpiCostCard
              label="Custo Médio / Req"
              primary={formatUsd(summary.avgCostPerRequestUsd)}
              secondary={formatBrl(summary.avgCostPerRequestBrl)}
              accent="text-emerald-300"
            />
            <KpiCostCard
              label="Total de Tokens"
              primary={Number(summary.totalTokens || 0).toLocaleString('pt-BR')}
              secondary={`${summary.unavailableUsageCount || 0} sem telemetria`}
              accent="text-white"
            />
            <KpiCostCard
              label="Tokens de Entrada"
              primary={Number(summary.totalInputTokens || 0).toLocaleString('pt-BR')}
              secondary="Prompt / Contexto"
              accent="text-cyan-300"
            />
            <KpiCostCard
              label="Tokens de Saída"
              primary={Number(summary.totalOutputTokens || 0).toLocaleString('pt-BR')}
              secondary="Completion"
              accent="text-blue-300"
            />
            <KpiCostCard
              label="Tokens em Cache"
              primary={Number(summary.totalCachedInputTokens || 0).toLocaleString('pt-BR')}
              secondary="Leitura otimizada"
              accent="text-emerald-300"
            />
            <KpiCostCard
              label="Tokens de Raciocínio"
              primary={Number(summary.totalReasoningTokens || 0).toLocaleString('pt-BR')}
              secondary="Thinking / CoT"
              accent="text-violet-300"
            />
            <KpiCostCard
              label="Requisições & Saúde"
              primary={`${summary.totalRequests} (${summary.successRatePct}%)`}
              secondary={`Latência média: ${summary.avgLatencyMs}ms`}
              accent="text-white"
            />
          </div>

          {/* Dashboards Segmentados por Provedor, Departamento e Modelo */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 text-xs">
            <SegmentedDashboardCard
              title="Consumo por Provedor"
              subtitle="Segmentação pelos provedores reais registrados"
              items={dashboard?.byProvider || []}
              emptyText="Nenhum consumo por provedor no período."
            />
            <SegmentedDashboardCard
              title="Consumo por Departamento"
              subtitle="Segmentação pelos módulos da agência"
              items={dashboard?.byDepartment || []}
              deptLimits={costPolicy?.departmentLimitsUsd}
              emptyText="Nenhum consumo departamental no período."
            />
            <SegmentedDashboardCard
              title="Consumo por Modelo"
              subtitle="Custo estimado pela tabela de preços configurável"
              items={dashboard?.byModel || []}
              emptyText="Nenhum consumo por modelo no período."
            />
          </div>

          {/* Detecção de Anomalias + Evolução Diária */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 text-xs">
            <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-5 space-y-3">
              <h4 className="font-bold text-white text-sm flex items-center gap-2">
                <TrendingUp className="w-4 h-4 text-amber-400" /> Detecção de Anomalias ({anomalies.length})
              </h4>
              {anomalies.length === 0 ? (
                <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 text-slate-400">
                  Nenhuma anomalia estatística de tokens, rajada, cliente ou loop de falhas detectada.
                </div>
              ) : (
                <div className="space-y-2 max-h-60 overflow-y-auto">
                  {anomalies.map((an: any) => (
                    <div
                      key={an.id}
                      className={`p-3 rounded-xl border space-y-1 ${
                        an.confidence === 'confirmed'
                          ? 'bg-rose-500/10 border-rose-500/30'
                          : 'bg-amber-500/10 border-amber-500/30'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-bold text-white">{an.title}</span>
                        <span
                          className={`px-2 py-0.5 rounded text-[10px] font-mono ${
                            an.confidence === 'confirmed'
                              ? 'bg-rose-500/20 text-rose-200'
                              : 'bg-amber-500/20 text-amber-200'
                          }`}
                        >
                          {an.confidence === 'confirmed' ? 'Confirmada' : 'Possível anomalia'} ({an.sampleCount} amostras)
                        </span>
                      </div>
                      <div className="text-slate-300">{an.description}</div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-5 space-y-3">
              <h4 className="font-bold text-white text-sm">Evolução Diária de Consumo e Custos</h4>
              {(dashboard?.dailySeries || []).length === 0 ? (
                <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 text-slate-400">
                  Sem histórico diário no período filtrado.
                </div>
              ) : (
                <div className="space-y-2 max-h-60 overflow-y-auto">
                  {(dashboard?.dailySeries || []).map((d: any) => (
                    <div key={d.date} className="p-2.5 rounded-xl bg-slate-950 border border-slate-800 flex justify-between items-center">
                      <div>
                        <div className="font-mono font-semibold text-white">{d.date}</div>
                        <div className="text-[11px] text-slate-400">
                          {d.requests} reqs • {d.tokens.toLocaleString('pt-BR')} tokens
                        </div>
                      </div>
                      <div className="text-right font-mono">
                        <div className="text-emerald-400">{formatUsd(d.costUsd)}</div>
                        <div className="text-[10px] text-slate-400">{formatBrl(d.costBrl)}</div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Tabela Resumida de Execuções com Auditoria / Detalhe */}
          <div className="bg-slate-900/60 border border-slate-800 rounded-2xl overflow-hidden">
            <div className="p-4 border-b border-slate-800 flex items-center justify-between">
              <h4 className="font-bold text-white text-sm">Execuções Auditáveis ({usageLogs.length})</h4>
              <span className="text-[11px] text-slate-400">Clique em "Detalhar" para ver breakdown de tokens, cache, câmbio e reconciliação</span>
            </div>
            <div className="overflow-x-auto max-h-72 overflow-y-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-950 text-slate-400 border-b border-slate-800 sticky top-0">
                  <tr>
                    <th className="p-2.5">Data / Request</th>
                    <th className="p-2.5">Depto / Ação</th>
                    <th className="p-2.5">Provedor / Modelo</th>
                    <th className="p-2.5">Tokens (In/Out/Cache)</th>
                    <th className="p-2.5">Custo USD / BRL</th>
                    <th className="p-2.5">Status</th>
                    <th className="p-2.5 text-right">Auditoria</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800">
                  {usageLogs.slice(0, 40).map((l: any) => (
                    <tr key={l.id} className="hover:bg-slate-950/60">
                      <td className="p-2.5">
                        <div className="text-white">{new Date(l.createdAt).toLocaleString('pt-BR')}</div>
                        <div className="text-[10px] font-mono text-slate-400">{l.requestId}</div>
                      </td>
                      <td className="p-2.5">
                        <div className="text-white">{l.department}</div>
                        <div className="text-[10px] font-mono text-cyan-400">{l.action || l.purpose}</div>
                      </td>
                      <td className="p-2.5 font-mono text-slate-200">{l.providerId}/{l.modelId}</td>
                      <td className="p-2.5 font-mono text-slate-300">
                        {l.usageStatus === 'unavailable'
                          ? 'Indisponível (provedor)'
                          : `${l.inputTokens} / ${l.outputTokens} / ${l.cachedInputTokens ?? l.cachedTokens ?? 0}`}
                      </td>
                      <td className="p-2.5 font-mono">
                        <div className="text-emerald-400">
                          {l.costReliable ? formatUsd(l.providerReportedCostUsd ?? l.estimatedCostUsd) : 'Indisponível'}
                        </div>
                        {l.totalCostBRL !== null && l.totalCostBRL !== undefined && (
                          <div className="text-[10px] text-slate-400">{formatBrl(l.totalCostBRL)}</div>
                        )}
                      </td>
                      <td className="p-2.5">
                        <span
                          className={`px-2 py-0.5 rounded text-[10px] font-mono ${
                            l.status === 'success'
                              ? 'bg-emerald-500/15 text-emerald-300'
                              : 'bg-rose-500/15 text-rose-300'
                          }`}
                        >
                          {l.status}
                        </span>
                      </td>
                      <td className="p-2.5 text-right">
                        <button
                          onClick={() => onInspectLog(l.id)}
                          className="px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-cyan-300 text-[11px] font-medium"
                        >
                          Detalhar
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* SUB-ABA 2: DEPARTAMENTOS & ANÁLISE DE CONSUMO POR AÇÃO */}
      {subTab === 'actions' && (
        <div className="space-y-5 text-xs">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            {/* Departamentos Clicáveis (Drilldown) */}
            <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-5 space-y-3">
              <div className="flex items-center justify-between">
                <h4 className="font-bold text-white text-sm">Departamentos (Clique p/ Drilldown)</h4>
                {selectedDeptDrill !== 'all' && (
                  <button
                    onClick={() => setSelectedDeptDrill('all')}
                    className="text-[11px] text-cyan-400 hover:underline"
                  >
                    Ver todos
                  </button>
                )}
              </div>
              {(dashboard?.byDepartment || []).length === 0 ? (
                <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 text-slate-400">
                  Sem consumo departamental registrado.
                </div>
              ) : (
                <div className="space-y-2 max-h-96 overflow-y-auto">
                  {(dashboard?.byDepartment || []).map((dept: any) => {
                    const active = selectedDeptDrill === dept.key;
                    const cap = costPolicy?.departmentLimitsUsd?.[dept.key];
                    return (
                      <button
                        key={dept.key}
                        type="button"
                        onClick={() => setSelectedDeptDrill(active ? 'all' : dept.key)}
                        className={`w-full text-left p-3 rounded-xl border transition-all space-y-1.5 ${
                          active
                            ? 'bg-cyan-500/10 border-cyan-500/50'
                            : 'bg-slate-950 border-slate-800 hover:border-slate-700'
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <span className="font-bold text-white flex items-center gap-1">
                            {dept.key} <ChevronRight className="w-3.5 h-3.5 text-slate-500" />
                          </span>
                          <span className="font-mono text-emerald-400">{formatUsd(dept.costUsd)}</span>
                        </div>
                        <div className="flex justify-between text-[11px] text-slate-400 font-mono">
                          <span>{dept.requests} reqs • {dept.tokens.toLocaleString('pt-BR')} tokens</span>
                          <span>{formatBrl(dept.costBrl)} {cap ? `• Teto $${cap}` : ''}</span>
                        </div>
                        {dept.actions && dept.actions.length > 0 && (
                          <div className="flex flex-wrap gap-1 pt-1">
                            {dept.actions.slice(0, 3).map((act: any) => (
                              <span key={act.action} className="text-[10px] px-1.5 py-0.5 rounded bg-slate-900 text-cyan-300 font-mono">
                                {act.action}: {act.requests}
                              </span>
                            ))}
                          </div>
                        )}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Análise de Consumo por Ação */}
            <div className="lg:col-span-2 bg-slate-900/60 border border-slate-800 rounded-2xl p-5 space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h4 className="font-bold text-white text-sm">
                    Análise de Consumo por Ação {selectedDeptDrill !== 'all' ? `• ${selectedDeptDrill}` : ''}
                  </h4>
                  <p className="text-[11px] text-slate-400">
                    Ranking por custo e tokens, média, P95 tokens, custo sucesso vs erro e comparativo de modelos.
                  </p>
                </div>
              </div>

              {filteredActions.length === 0 ? (
                <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 text-slate-400">
                  Nenhuma ação executada no filtro selecionado.
                </div>
              ) : (
                <div className="overflow-x-auto max-h-64 overflow-y-auto border border-slate-800 rounded-xl">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-slate-950 text-slate-400 border-b border-slate-800 sticky top-0">
                      <tr>
                        <th className="p-2.5">Ação</th>
                        <th className="p-2.5">Reqs</th>
                        <th className="p-2.5">Média / P95 Tokens</th>
                        <th className="p-2.5">Sucesso vs Erro ($)</th>
                        <th className="p-2.5">Total USD / BRL</th>
                        <th className="p-2.5">Anomalia</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800">
                      {filteredActions.map((act: any) => (
                        <tr
                          key={act.key}
                          onClick={() => setSelectedActionKey(act.key)}
                          className={`cursor-pointer hover:bg-slate-950/70 ${
                            activeActionDetail?.key === act.key ? 'bg-cyan-500/10' : ''
                          }`}
                        >
                          <td className="p-2.5">
                            <div className="font-mono font-semibold text-cyan-300">{act.key}</div>
                            <div className="text-[10px] text-slate-400">{act.department}</div>
                          </td>
                          <td className="p-2.5 font-mono text-white">{act.requests}</td>
                          <td className="p-2.5 font-mono text-slate-300">
                            {act.avgTokensPerRequest.toLocaleString('pt-BR')} / {act.p95Tokens.toLocaleString('pt-BR')}
                          </td>
                          <td className="p-2.5 font-mono">
                            <span className="text-emerald-400">{formatUsd(act.successCostUsd)}</span>
                            <span className="text-slate-600 mx-1">/</span>
                            <span className="text-rose-400">{formatUsd(act.errorCostUsd)}</span>
                          </td>
                          <td className="p-2.5 font-mono">
                            <div className="text-emerald-400">{formatUsd(act.costUsd)}</div>
                            <div className="text-[10px] text-slate-400">{formatBrl(act.costBrl)}</div>
                          </td>
                          <td className="p-2.5">
                            {act.anomalyDetected ? (
                              <span className="px-2 py-0.5 rounded bg-rose-500/20 text-rose-300 text-[10px]">Pico</span>
                            ) : (
                              <span className="text-slate-500 text-[10px]">Normal</span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {activeActionDetail && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-2 border-t border-slate-800">
                  <div className="bg-slate-950 border border-slate-800 rounded-xl p-3 space-y-2">
                    <div className="font-semibold text-white">
                      Comparativo de Modelos na Ação <span className="font-mono text-cyan-400">{activeActionDetail.key}</span>
                    </div>
                    {activeActionDetail.modelBreakdown.map((m: any) => (
                      <div key={m.modelKey} className="flex justify-between items-center text-[11px] border-b border-slate-800/70 pb-1 last:border-0">
                        <div>
                          <div className="font-mono text-white">{m.modelKey}</div>
                          <div className="text-slate-400">{m.requests} reqs • {m.avgTokens} tok/req • {m.avgLatencyMs}ms</div>
                        </div>
                        <div className="text-right font-mono">
                          <div className="text-emerald-400">{formatUsd(m.avgCostUsd)}/req</div>
                          <div className="text-slate-400">{formatBrl(m.totalCostBrl)}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                  <div className="bg-slate-950 border border-slate-800 rounded-xl p-3 space-y-2">
                    <div className="font-semibold text-white">Evolução Diária da Ação</div>
                    {activeActionDetail.dailyEvolution.map((ev: any) => (
                      <div key={ev.date} className="flex justify-between text-[11px] font-mono border-b border-slate-800/70 pb-1 last:border-0">
                        <span className="text-slate-300">{ev.date}</span>
                        <span className="text-slate-400">{ev.requests} reqs • {ev.tokens} tok</span>
                        <span className="text-emerald-400">{formatUsd(ev.costUsd)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Catálogo Administrável de Identificadores de Ação */}
          {canManage && (
            <form onSubmit={handleSaveAction} className="bg-slate-900/60 border border-slate-800 rounded-2xl p-5 space-y-3">
              <h4 className="font-bold text-white text-sm">Cadastrar / Editar Ação Padronizada (Extensível)</h4>
              <div className="grid grid-cols-1 md:grid-cols-5 gap-2.5">
                <input
                  type="text"
                  required
                  placeholder="ID (ex: creative.banner.generate)"
                  value={newActionForm.id}
                  onChange={(e) => setNewActionForm({ ...newActionForm, id: e.target.value })}
                  className="bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-white font-mono"
                />
                <input
                  type="text"
                  required
                  placeholder="Nome legível"
                  value={newActionForm.name}
                  onChange={(e) => setNewActionForm({ ...newActionForm, name: e.target.value })}
                  className="bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-white"
                />
                <select
                  value={newActionForm.department}
                  onChange={(e) => setNewActionForm({ ...newActionForm, department: e.target.value })}
                  className="bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-white"
                >
                  {DEPT_LIST_FOR_CAPS.map((d) => (
                    <option key={d} value={d}>{d}</option>
                  ))}
                </select>
                <div className="flex items-center gap-3 px-2">
                  <label className="flex items-center gap-1.5 text-slate-300 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={newActionForm.isCritical}
                      onChange={(e) => setNewActionForm({ ...newActionForm, isCritical: e.target.checked })}
                    />
                    Crítica
                  </label>
                  <label className="flex items-center gap-1.5 text-slate-300 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={newActionForm.cacheable}
                      onChange={(e) => setNewActionForm({ ...newActionForm, cacheable: e.target.checked })}
                    />
                    Cacheável
                  </label>
                </div>
                <button type="submit" className="px-4 py-2 rounded-lg bg-cyan-600 text-white font-semibold">
                  Salvar Ação
                </button>
              </div>
            </form>
          )}
        </div>
      )}

      {/* SUB-ABA 3: PROVEDORES & MODELOS */}
      {subTab === 'providers' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 text-xs">
          <SegmentedDashboardCard
            title="Comparativo por Provedor"
            subtitle="Tokens, cache, USD/BRL, latência média e taxa de sucesso"
            items={dashboard?.byProvider || []}
            emptyText="Sem execuções registradas para provedores."
          />
          <SegmentedDashboardCard
            title="Comparativo por Modelo"
            subtitle="Custo médio por requisição, tokens e confiabilidade"
            items={dashboard?.byModel || []}
            emptyText="Sem modelos utilizados nos logs."
          />
        </div>
      )}

      {/* SUB-ABA 4: CUSTO POR CLIENTE (SEPARADO DE RECEITA DA AGÊNCIA) */}
      {subTab === 'clients' && (
        <div className="space-y-4 text-xs">
          <div className="bg-cyan-500/10 border border-cyan-500/30 rounded-2xl p-4 text-cyan-200 flex items-center gap-3">
            <ShieldCheck className="w-5 h-5 text-cyan-400 shrink-0" />
            <div>
              <strong>Centro de Custo Operacional de IA (Separado da Receita da Agência):</strong> Os valores abaixo contabilizam exclusivamente o custo técnico de tokens de IA por cliente e categoria contratual, sem misturar com honorários ou receita comercial.
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {(dashboard?.byClient || []).map((cl: any) => {
              const displayName =
                cl.clientId === 'Agência (Interno)'
                  ? 'Agência (Interno)'
                  : clientNameMap.get(cl.clientId) || cl.clientId;
              return (
                <div key={cl.clientId} className="bg-slate-900/60 border border-slate-800 rounded-2xl p-5 space-y-3">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="font-bold text-white text-sm">{displayName}</div>
                      <div className="text-[11px] text-slate-400">
                        Top Depto: <span className="text-cyan-300">{cl.topDepartment}</span> • {cl.requests} reqs
                      </div>
                    </div>
                    <div className="text-right font-mono">
                      <div className="text-emerald-400 font-bold">{formatUsd(cl.costUsd)}</div>
                      <div className="text-[10px] text-slate-400">{formatBrl(cl.costBrl)}</div>
                    </div>
                  </div>
                  <div className="text-[11px] font-mono text-slate-300">
                    {cl.tokens.toLocaleString('pt-BR')} tokens • Média {formatUsd(cl.avgCostPerRequestUsd)}/req
                  </div>
                  <div className="space-y-1 pt-2 border-t border-slate-800">
                    {Object.entries(cl.byCategory || {}).map(([cat, val]: [string, any]) =>
                      val.requests > 0 ? (
                        <div key={cat} className="flex justify-between text-[11px]">
                          <span className="text-slate-400">{BILLING_CATEGORY_LABELS[cat] || cat} ({val.requests})</span>
                          <span className="font-mono text-slate-200">{formatUsd(val.costUsd)} / {formatBrl(val.costBrl)}</span>
                        </div>
                      ) : null
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* SUB-ABA 5: PREÇOS, CÂMBIO USD→BRL, LIMITES MULTI-ESCOPO & EXCEÇÕES */}
      {subTab === 'governance' && (
        <div className="space-y-6 text-xs">
          {/* Câmbio USD → BRL */}
          <form onSubmit={handleSaveExchange} className="bg-slate-900/60 border border-slate-800 rounded-2xl p-5 space-y-3">
            <h3 className="font-bold text-white text-sm flex items-center gap-2">
              <DollarSign className="w-4 h-4 text-emerald-400" /> Câmbio Configurável USD → BRL
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
              <div>
                <label className="text-slate-400 block mb-1">Taxa (1 USD em BRL)</label>
                <input
                  type="number"
                  step="0.0001"
                  min={0.01}
                  disabled={!canManage}
                  value={exchangeForm.rate}
                  onChange={(e) => setExchangeForm({ ...exchangeForm, rate: Number(e.target.value) })}
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-white font-mono"
                />
              </div>
              <div>
                <label className="text-slate-400 block mb-1">Data de Referência</label>
                <input
                  type="date"
                  disabled={!canManage}
                  value={exchangeForm.rateDate}
                  onChange={(e) => setExchangeForm({ ...exchangeForm, rateDate: e.target.value })}
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-white font-mono"
                />
              </div>
              <div>
                <label className="text-slate-400 block mb-1">Fonte da Taxa</label>
                <input
                  type="text"
                  disabled={!canManage}
                  value={exchangeForm.source}
                  onChange={(e) => setExchangeForm({ ...exchangeForm, source: e.target.value })}
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-white"
                />
              </div>
              {canManage && (
                <div className="flex items-end">
                  <button type="submit" className="w-full px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-semibold">
                    Atualizar Câmbio BRL
                  </button>
                </div>
              )}
            </div>
          </form>

          {/* Tabela de Preços Completa (Input, Output, Cache, Reasoning, Fonte) */}
          <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-5 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h3 className="font-bold text-white text-sm flex items-center gap-2">
                  <DollarSign className="w-4 h-4 text-cyan-400" /> Catálogo de Preços por Modelo (USD por 1M Tokens)
                </h3>
                <p className="text-slate-400 mt-0.5">
                  Configure Input, Output, Cache Input e Reasoning sem dupla cobrança. Modelos locais permanecem em $0 salvo customização.
                </p>
              </div>
              <div className="flex items-center gap-2">
                <select
                  value={pricingFilter}
                  onChange={(e) => setPricingFilter(e.target.value as any)}
                  className="bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1.5 text-white"
                >
                  <option value="all">Todos ({models.length})</option>
                  <option value="used">Modelos em uso</option>
                  <option value="unpriced">Sem tarifa</option>
                </select>
                {canManage && (
                  <button
                    type="button"
                    onClick={handleSavePricingTable}
                    disabled={savingPricing}
                    className="px-3.5 py-1.5 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white font-semibold flex items-center gap-1.5"
                  >
                    <Save className="w-3.5 h-3.5" />
                    {savingPricing ? 'Recalculando...' : 'Salvar Tabela de Preços'}
                  </button>
                )}
              </div>
            </div>

            <div className="overflow-x-auto max-h-80 overflow-y-auto border border-slate-800 rounded-xl">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-950 text-slate-400 border-b border-slate-800 sticky top-0">
                  <tr>
                    <th className="p-2.5">Provedor / Modelo</th>
                    <th className="p-2.5">Input $/1M</th>
                    <th className="p-2.5">Output $/1M</th>
                    <th className="p-2.5">Cache In $/1M</th>
                    <th className="p-2.5">Reasoning $/1M</th>
                    <th className="p-2.5">Fonte / Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800">
                  {filteredModelsForPricing.map((m: any) => {
                    const draft = pricingDrafts[m.id] || {
                      inputCostPer1M: '',
                      outputCostPer1M: '',
                      cacheInputCostPer1M: '',
                      reasoningCostPer1M: '',
                      priceSource: '',
                      pricingVerified: false,
                    };
                    const isLocal = m.providerId === 'ollama' || m.providerId === 'vllm';
                    return (
                      <tr key={m.id} className="hover:bg-slate-950/50">
                        <td className="p-2.5">
                          <span className="font-mono text-cyan-400 mr-1.5">{m.providerId}</span>
                          <span className="font-semibold text-white">{m.modelId}</span>
                        </td>
                        <td className="p-2.5">
                          <input
                            type="number"
                            step="0.001"
                            min={0}
                            disabled={!canManage}
                            placeholder={isLocal ? '0.00' : 'Ex: 0.15'}
                            value={draft.inputCostPer1M}
                            onChange={(e) =>
                              setPricingDrafts((prev) => ({
                                ...prev,
                                [m.id]: { ...draft, inputCostPer1M: e.target.value, pricingVerified: true },
                              }))
                            }
                            className="w-24 bg-slate-950 border border-slate-800 rounded px-2 py-1 text-white font-mono"
                          />
                        </td>
                        <td className="p-2.5">
                          <input
                            type="number"
                            step="0.001"
                            min={0}
                            disabled={!canManage}
                            placeholder={isLocal ? '0.00' : 'Ex: 0.60'}
                            value={draft.outputCostPer1M}
                            onChange={(e) =>
                              setPricingDrafts((prev) => ({
                                ...prev,
                                [m.id]: { ...draft, outputCostPer1M: e.target.value, pricingVerified: true },
                              }))
                            }
                            className="w-24 bg-slate-950 border border-slate-800 rounded px-2 py-1 text-white font-mono"
                          />
                        </td>
                        <td className="p-2.5">
                          <input
                            type="number"
                            step="0.001"
                            min={0}
                            disabled={!canManage}
                            placeholder="Opcional"
                            value={draft.cacheInputCostPer1M}
                            onChange={(e) =>
                              setPricingDrafts((prev) => ({
                                ...prev,
                                [m.id]: { ...draft, cacheInputCostPer1M: e.target.value },
                              }))
                            }
                            className="w-24 bg-slate-950 border border-slate-800 rounded px-2 py-1 text-white font-mono"
                          />
                        </td>
                        <td className="p-2.5">
                          <input
                            type="number"
                            step="0.001"
                            min={0}
                            disabled={!canManage}
                            placeholder="Opcional"
                            value={draft.reasoningCostPer1M}
                            onChange={(e) =>
                              setPricingDrafts((prev) => ({
                                ...prev,
                                [m.id]: { ...draft, reasoningCostPer1M: e.target.value },
                              }))
                            }
                            className="w-24 bg-slate-950 border border-slate-800 rounded px-2 py-1 text-white font-mono"
                          />
                        </td>
                        <td className="p-2.5">
                          <span
                            className={`text-[10px] px-2 py-0.5 rounded ${
                              isLocal && draft.inputCostPer1M === ''
                                ? 'bg-slate-800 text-slate-300'
                                : draft.pricingVerified && draft.inputCostPer1M !== '' && draft.outputCostPer1M !== ''
                                  ? 'bg-emerald-500/15 text-emerald-300'
                                  : 'bg-amber-500/15 text-amber-300'
                            }`}
                          >
                            {isLocal && draft.inputCostPer1M === ''
                              ? 'Self-hosted ($0)'
                              : draft.pricingVerified && draft.inputCostPer1M !== '' && draft.outputCostPer1M !== ''
                                ? m.priceSource || 'Configurada'
                                : 'Sem tarifa'}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* Política Multi-Escopo & Ação ao Exceder */}
          <form onSubmit={handleSavePolicy} className="bg-slate-900/60 border border-slate-800 rounded-2xl p-5 space-y-4">
            <h3 className="font-bold text-white text-sm flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-emerald-400" /> Política Multi-Escopo, Marcos (50/75/90/100%) e Ações Automáticas
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
              <div>
                <label className="text-slate-400 block mb-1">Limite Diário Org (USD)</label>
                <input
                  type="number"
                  step={0.5}
                  min={0}
                  disabled={!canManage}
                  value={policyForm.dailyLimitUsd}
                  onChange={(e) => setPolicyForm({ ...policyForm, dailyLimitUsd: Number(e.target.value) })}
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-white font-mono"
                />
              </div>
              <div>
                <label className="text-slate-400 block mb-1">Limite Mensal Org (USD)</label>
                <input
                  type="number"
                  step={1}
                  min={0}
                  disabled={!canManage}
                  value={policyForm.monthlyLimitUsd}
                  onChange={(e) => setPolicyForm({ ...policyForm, monthlyLimitUsd: Number(e.target.value) })}
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-white font-mono"
                />
              </div>
              <div>
                <label className="text-slate-400 block mb-1">Limite Diário Usuário (USD)</label>
                <input
                  type="number"
                  step={0.5}
                  min={0}
                  disabled={!canManage}
                  value={policyForm.userDailyLimitUsd}
                  onChange={(e) => setPolicyForm({ ...policyForm, userDailyLimitUsd: Number(e.target.value) })}
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-white font-mono"
                />
              </div>
              <div>
                <label className="text-slate-400 block mb-1">Gatilho Alerta Principal (%)</label>
                <input
                  type="number"
                  min={1}
                  max={100}
                  disabled={!canManage}
                  value={policyForm.alertThresholdPct}
                  onChange={(e) => setPolicyForm({ ...policyForm, alertThresholdPct: Number(e.target.value) })}
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-white font-mono"
                />
              </div>
              <div>
                <label className="text-slate-400 block mb-1">Ação ao Exceder Limite</label>
                <select
                  disabled={!canManage}
                  value={policyForm.onExceedAction}
                  onChange={(e) => setPolicyForm({ ...policyForm, onExceedAction: e.target.value })}
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-2 text-white"
                >
                  <option value="notify">Apenas notificar</option>
                  <option value="require_authorization">Exigir autorização/exceção</option>
                  <option value="restrict_action">Restringir operações</option>
                  <option value="block_non_essential">Bloquear não essenciais (preserva críticas)</option>
                  <option value="fallback_economical">Trocar para modelo econômico</option>
                </select>
              </div>
            </div>

            <div className="pt-3 border-t border-slate-800 space-y-2">
              <div className="text-[11px] font-semibold text-slate-300">Limites Diários por Departamento (USD)</div>
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-2.5">
                {DEPT_LIST_FOR_CAPS.map((dept) => (
                  <div key={dept}>
                    <label className="text-[10px] text-slate-400 block mb-1 truncate">{dept}</label>
                    <input
                      type="number"
                      step={0.5}
                      min={0}
                      disabled={!canManage}
                      placeholder="Sem teto"
                      value={policyForm.departmentLimitsUsd[dept] || ''}
                      onChange={(e) =>
                        setPolicyForm((prev) => ({
                          ...prev,
                          departmentLimitsUsd: { ...prev.departmentLimitsUsd, [dept]: e.target.value },
                        }))
                      }
                      className="w-full bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1.5 text-white font-mono"
                    />
                  </div>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 pt-3 border-t border-slate-800">
              <div>
                <label className="text-[11px] text-slate-300 block mb-1">Limites por Modelo (`modelo=usd` por linha)</label>
                <textarea
                  rows={2}
                  disabled={!canManage}
                  placeholder="gpt-4.1=15"
                  value={policyForm.modelLimitsUsdText}
                  onChange={(e) => setPolicyForm({ ...policyForm, modelLimitsUsdText: e.target.value })}
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2 text-white font-mono"
                />
              </div>
              <div>
                <label className="text-[11px] text-slate-300 block mb-1">Limites por Ação (`acao=usd` por linha)</label>
                <textarea
                  rows={2}
                  disabled={!canManage}
                  placeholder="creative.copy.generate=5"
                  value={policyForm.actionLimitsUsdText}
                  onChange={(e) => setPolicyForm({ ...policyForm, actionLimitsUsdText: e.target.value })}
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2 text-white font-mono"
                />
              </div>
              <div>
                <label className="text-[11px] text-slate-300 block mb-1">Ações Restritas (separadas por vírgula)</label>
                <textarea
                  rows={2}
                  disabled={!canManage}
                  placeholder="creative.script.generate"
                  value={policyForm.restrictedActionsText}
                  onChange={(e) => setPolicyForm({ ...policyForm, restrictedActionsText: e.target.value })}
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2 text-white font-mono"
                />
              </div>
            </div>

            {canManage && (
              <button type="submit" className="px-4 py-2 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white font-semibold">
                Salvar Política de Governança
              </button>
            )}
          </form>

          {/* Exceções Temporárias Autorizadas */}
          <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-5 space-y-4">
            <h3 className="font-bold text-white text-sm">Exceções Temporárias de Orçamento (Auditadas)</h3>
            {canManage && (
              <form onSubmit={handleGrantException} className="grid grid-cols-1 md:grid-cols-6 gap-2.5">
                <select
                  value={exceptionForm.scope}
                  onChange={(e) => setExceptionForm({ ...exceptionForm, scope: e.target.value })}
                  className="bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-2 text-white"
                >
                  <option value="organization">Organização</option>
                  <option value="department">Departamento</option>
                  <option value="user">Usuário</option>
                  <option value="provider">Provedor</option>
                  <option value="model">Modelo</option>
                  <option value="action">Ação</option>
                </select>
                <input
                  type="text"
                  required
                  placeholder="Alvo (ex: NER Creative)"
                  value={exceptionForm.targetKey}
                  onChange={(e) => setExceptionForm({ ...exceptionForm, targetKey: e.target.value })}
                  className="bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-2 text-white font-mono"
                />
                <input
                  type="number"
                  step={0.5}
                  min={0.5}
                  required
                  placeholder="Extra USD"
                  value={exceptionForm.extraBudgetUsd}
                  onChange={(e) => setExceptionForm({ ...exceptionForm, extraBudgetUsd: Number(e.target.value) })}
                  className="bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-2 text-white font-mono"
                />
                <input
                  type="number"
                  min={1}
                  required
                  placeholder="Validade (h)"
                  value={exceptionForm.hoursValid}
                  onChange={(e) => setExceptionForm({ ...exceptionForm, hoursValid: Number(e.target.value) })}
                  className="bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-2 text-white font-mono"
                />
                <input
                  type="text"
                  required
                  placeholder="Justificativa"
                  value={exceptionForm.reason}
                  onChange={(e) => setExceptionForm({ ...exceptionForm, reason: e.target.value })}
                  className="bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-2 text-white"
                />
                <button type="submit" className="px-3 py-2 rounded-lg bg-emerald-600 text-white font-semibold">
                  Autorizar Exceção
                </button>
              </form>
            )}
            <div className="space-y-2">
              {limitExceptions.length === 0 ? (
                <div className="text-slate-400">Nenhuma exceção temporária ativa no momento.</div>
              ) : (
                limitExceptions.map((ex: any) => (
                  <div key={ex.id} className="p-3 rounded-xl bg-slate-950 border border-slate-800 flex items-center justify-between gap-2">
                    <div>
                      <span className="font-mono text-cyan-300">{ex.scope}: {ex.targetKey}</span>
                      <span className="ml-2 text-emerald-400 font-mono">+${ex.extraBudgetUsd} USD</span>
                      <div className="text-[11px] text-slate-400">
                        Motivo: {ex.reason} • Expira em: {new Date(ex.expiresAt).toLocaleString('pt-BR')}
                      </div>
                    </div>
                    {canManage && (
                      <button
                        onClick={() => handleRevokeException(ex.id)}
                        className="px-2.5 py-1 rounded bg-rose-500/15 text-rose-300 hover:bg-rose-500/25"
                      >
                        Revogar
                      </button>
                    )}
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function KpiCostCard({
  label,
  primary,
  secondary,
  accent,
}: {
  label: string;
  primary: string;
  secondary: string;
  accent: string;
}) {
  return (
    <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-4 space-y-1">
      <div className="text-[11px] text-slate-400 truncate">{label}</div>
      <div className={`text-base font-bold font-mono truncate ${accent}`}>{primary}</div>
      <div className="text-[10px] text-slate-400 font-mono truncate">{secondary}</div>
    </div>
  );
}



function SegmentedDashboardCard({
  title,
  subtitle,
  items,
  deptLimits,
  emptyText,
}: {
  title: string;
  subtitle: string;
  items: any[];
  deptLimits?: Record<string, number>;
  emptyText: string;
}) {
  const maxCost = Math.max(...items.map((i) => i.costUsd || 0), 0.000001);
  const maxTokens = Math.max(...items.map((i) => i.tokens || 0), 1);

  return (
    <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-5 space-y-3">
      <div>
        <h4 className="font-bold text-white text-sm">{title}</h4>
        <p className="text-[11px] text-slate-400">{subtitle}</p>
      </div>
      {items.length === 0 ? (
        <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 text-slate-400 text-xs">
          {emptyText}
        </div>
      ) : (
        <div className="space-y-2.5 max-h-96 overflow-y-auto">
          {items.map((item) => {
            const widthPct =
              item.costUsd > 0
                ? Math.max(4, Math.round((item.costUsd / maxCost) * 100))
                : Math.max(4, Math.round((item.tokens / maxTokens) * 100));
            const deptCap = deptLimits?.[item.key];
            return (
              <div key={item.key} className="p-3 rounded-xl bg-slate-950 border border-slate-800 space-y-1.5">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-semibold text-white truncate" title={item.key}>
                    {item.key}
                  </span>
                  <span className="font-mono text-emerald-400 shrink-0">
                    {formatUsd(item.costUsd)} • {formatBrl(item.costBrl)}
                  </span>
                </div>
                <div className="w-full h-1.5 bg-slate-900 rounded-full overflow-hidden">
                  <div className="h-full bg-cyan-500 rounded-full" style={{ width: `${widthPct}%` }} />
                </div>
                <div className="flex flex-wrap items-center justify-between gap-2 text-[10px] text-slate-400 font-mono">
                  <span>
                    {item.requests} reqs • {Number(item.inputTokens || 0).toLocaleString('pt-BR')} in /{' '}
                    {Number(item.outputTokens || 0).toLocaleString('pt-BR')} out •{' '}
                    {Number(item.cachedInputTokens || 0).toLocaleString('pt-BR')} cache
                  </span>
                  <div className="flex items-center gap-1.5">
                    <span>{item.avgLatencyMs}ms • {item.successRatePct}% ok</span>
                    {deptCap && <span className="text-cyan-400">Teto: ${deptCap}</span>}
                    {item.unpricedRequests > 0 && (
                      <span className="text-amber-300">{item.unpricedRequests} s/ tarifa</span>
                    )}
                    {item.errors > 0 && <span className="text-rose-400">{item.errors} err</span>}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

/* ----------------------------------------------------------
 * MODAL DE DETALHE DA REQUISIÇÃO (SANITIZADO + RECONCILIAÇÃO)
 * --------------------------------------------------------*/
function UsageDetailModal({
  logId,
  activeOrgId,
  canManage,
  onClose,
  onReconciled,
  onNotify,
}: {
  logId: string;
  activeOrgId: string;
  canManage: boolean;
  onClose: () => void;
  onReconciled: () => void;
  onNotify: (m: string, isError?: boolean) => void;
}) {
  const [detail, setDetail] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [reconcileUsd, setReconcileUsd] = useState('');

  useEffect(() => {
    setLoading(true);
    apiFetch<any>(`/api/ai/usage-logs/${encodeURIComponent(logId)}?organizationId=${encodeURIComponent(activeOrgId)}`)
      .then((res) => {
        setDetail(res);
        setReconcileUsd(res.providerReportedCostUsd !== null ? String(res.providerReportedCostUsd) : '');
      })
      .catch((err: any) => onNotify(err.message, true))
      .finally(() => setLoading(false));
  }, [logId, activeOrgId]);

  const handleReconcile = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await apiFetch(`/api/ai/usage-logs/${encodeURIComponent(logId)}/reconcile`, {
        method: 'PATCH',
        body: JSON.stringify({
          organizationId: activeOrgId,
          providerReportedCostUsd: reconcileUsd.trim() !== '' ? Number(reconcileUsd) : undefined,
          reconciledWithProvider: true,
        }),
      });
      onNotify('Registro reconciliado com valor oficial do provedor.');
      onReconciled();
      onClose();
    } catch (err: any) {
      onNotify(err.message, true);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-slate-900 border border-slate-700 rounded-2xl max-w-2xl w-full p-6 space-y-4 text-xs shadow-2xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between border-b border-slate-800 pb-3">
          <div>
            <h3 className="text-base font-bold text-white">Auditoria Detalhada da Requisição de IA</h3>
            <p className="text-[11px] font-mono text-cyan-400">{detail?.requestId || logId}</p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300">
            <X className="w-4 h-4" />
          </button>
        </div>

        {loading || !detail ? (
          <div className="py-8 text-center text-slate-400">Carregando detalhes sanitizados...</div>
        ) : (
          <div className="space-y-4">
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3 bg-slate-950 border border-slate-800 rounded-xl p-3.5">
              <div><span className="text-slate-400 block">Departamento</span><span className="text-white font-semibold">{detail.department}</span></div>
              <div><span className="text-slate-400 block">Ação</span><span className="text-cyan-300 font-mono">{detail.action}</span></div>
              <div><span className="text-slate-400 block">Provedor / Modelo</span><span className="text-white font-mono">{detail.providerId}/{detail.modelId}</span></div>
              <div><span className="text-slate-400 block">Usuário / Cliente</span><span className="text-white">{detail.userId} • {detail.clientId || 'Agência'}</span></div>
              <div><span className="text-slate-400 block">Categoria</span><span className="text-slate-200">{BILLING_CATEGORY_LABELS[detail.billingCategory] || detail.billingCategory}</span></div>
              <div><span className="text-slate-400 block">Latência / Status</span><span className="font-mono text-white">{detail.latencyMs}ms • {detail.status}</span></div>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 bg-slate-950 border border-slate-800 rounded-xl p-3.5 font-mono">
              <div><span className="text-slate-400 block">Input Tokens</span><span className="text-white">{detail.rawInputTokens ?? 'Indisponível'}</span></div>
              <div><span className="text-slate-400 block">Output Tokens</span><span className="text-white">{detail.rawOutputTokens ?? 'Indisponível'}</span></div>
              <div><span className="text-slate-400 block">Cache Tokens</span><span className="text-emerald-300">{detail.cachedInputTokens ?? 0}</span></div>
              <div><span className="text-slate-400 block">Reasoning Tokens</span><span className="text-violet-300">{detail.reasoningTokens ?? 0}</span></div>
            </div>

            <div className="bg-slate-950 border border-slate-800 rounded-xl p-3.5 space-y-2 font-mono">
              <div className="text-slate-300 font-sans font-semibold">Composição Financeira ({detail.costStatus})</div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-[11px]">
                <div>Input: {formatUsd(detail.inputCost)}</div>
                <div>Output: {formatUsd(detail.outputCost)}</div>
                <div>Cache: {formatUsd(detail.cacheCost)}</div>
                <div>Reasoning: {formatUsd(detail.reasoningCost)}</div>
              </div>
              <div className="flex flex-wrap justify-between pt-2 border-t border-slate-800">
                <span className="text-emerald-400 font-bold">Total USD: {formatUsd(detail.estimatedCostUsd)}</span>
                <span className="text-cyan-300 font-bold">Total BRL: {formatBrl(detail.totalCostBRL)} (taxa {detail.exchangeRate})</span>
              </div>
              {detail.fallbackUsed && (
                <div className="text-amber-300">Fallback acionado a partir de: {detail.fallbackFrom}</div>
              )}
              {detail.errorMessage && (
                <div className="text-rose-400">Erro registrado: {detail.errorMessage}</div>
              )}
            </div>

            {canManage && (
              <form onSubmit={handleReconcile} className="bg-slate-950 border border-slate-800 rounded-xl p-3.5 flex flex-wrap items-end gap-2">
                <div className="flex-1 min-w-[180px]">
                  <label className="text-slate-400 block mb-1">Reconciliar Custo Oficial do Provedor (USD)</label>
                  <input
                    type="number"
                    step="0.000001"
                    min={0}
                    placeholder="Ex: 0.0042"
                    value={reconcileUsd}
                    onChange={(e) => setReconcileUsd(e.target.value)}
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-white font-mono"
                  />
                </div>
                <button type="submit" className="px-3.5 py-1.5 rounded-lg bg-emerald-600 text-white font-semibold">
                  {detail.reconciledWithProvider ? 'Atualizar Reconciliação' : 'Marcar Reconciliado'}
                </button>
              </form>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

/* ----------------------------------------------------------
 * 7. HISTÓRICO & OBSERVABILIDADE
 * --------------------------------------------------------*/
function AiHistoryTab({ usageLogs, onInspectLog }: { usageLogs: any[]; onInspectLog: (id: string) => void }) {
  return (
    <div className="bg-slate-900/60 border border-slate-800 rounded-2xl overflow-hidden">
      <div className="p-4 border-b border-slate-800 flex items-center justify-between">
        <h3 className="font-bold text-white text-sm flex items-center gap-2">
          <History className="w-4 h-4 text-cyan-400" /> Log Auditável de Execuções ({usageLogs.length})
        </h3>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-left text-xs">
          <thead className="bg-slate-900 text-slate-400 border-b border-slate-800">
            <tr>
              <th className="p-3">Data / Trace</th>
              <th className="p-3">Departamento / Ação</th>
              <th className="p-3">Provedor / Modelo</th>
              <th className="p-3">Tokens</th>
              <th className="p-3">Custo USD / BRL</th>
              <th className="p-3">Latência</th>
              <th className="p-3">Status</th>
              <th className="p-3 text-right">Detalhes</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800">
            {usageLogs.length === 0 ? (
              <tr>
                <td colSpan={8} className="p-6 text-center text-slate-400">
                  Nenhuma chamada registrada ainda.
                </td>
              </tr>
            ) : (
              usageLogs.map((l) => (
                <tr key={l.id} className="hover:bg-slate-900/40">
                  <td className="p-3">
                    <div className="text-white">{new Date(l.createdAt).toLocaleString('pt-BR')}</div>
                    <div className="text-[10px] font-mono text-slate-400">{l.requestId}</div>
                  </td>
                  <td className="p-3">
                    <div className="text-white">{l.department}</div>
                    <div className="text-[10px] font-mono text-cyan-400">{l.action || l.purpose}</div>
                  </td>
                  <td className="p-3 font-mono">
                    <div className="text-slate-200">{l.providerId}/{l.modelId}</div>
                    {l.fallbackUsed && (
                      <div className="text-[10px] text-amber-300">Fallback de: {l.fallbackFrom}</div>
                    )}
                  </td>
                  <td className="p-3 font-mono text-slate-300">
                    {l.usageStatus === 'unavailable'
                      ? 'Indisponível'
                      : `${l.inputTokens} in / ${l.outputTokens} out`}
                  </td>
                  <td className="p-3 font-mono">
                    <div className="text-emerald-400">
                      {l.costReliable ? formatUsd(l.providerReportedCostUsd ?? l.estimatedCostUsd) : 'Não verificado'}
                    </div>
                    {l.totalCostBRL !== null && l.totalCostBRL !== undefined && (
                      <div className="text-[10px] text-slate-400">{formatBrl(l.totalCostBRL)}</div>
                    )}
                  </td>
                  <td className="p-3 font-mono text-slate-300">{l.latencyMs} ms</td>
                  <td className="p-3">
                    <span
                      className={`px-2 py-0.5 rounded text-[10px] font-mono ${
                        l.status === 'success'
                          ? 'bg-emerald-500/15 text-emerald-300'
                          : 'bg-rose-500/15 text-rose-300'
                      }`}
                    >
                      {l.status}
                    </span>
                    {l.errorMessage && (
                      <div className="text-[10px] text-rose-400 mt-0.5 max-w-[200px] truncate" title={l.errorMessage}>
                        {l.errorMessage}
                      </div>
                    )}
                  </td>
                  <td className="p-3 text-right">
                    <button
                      onClick={() => onInspectLog(l.id)}
                      className="px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-cyan-300 text-[11px]"
                    >
                      Inspecionar
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* ----------------------------------------------------------
 * 8. CONFIGURAÇÕES (Rotação de Chave + RAG / Base de Conhecimento)
 * --------------------------------------------------------*/
function AiSettingsTab({
  configStatus,
  knowledgeDocs,
  clients,
  activeOrgId,
  isSuperAdmin,
  isAdmin,
  canManage,
  onRefresh,
  onNotify,
}: any) {
  const [rotateForm, setRotateForm] = useState({ oldMasterKey: '', newMasterKey: '' });
  const [docForm, setDocForm] = useState({ title: '', clientId: '', content: '' });

  const handleRotate = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await apiFetch<any>('/api/ai/security/rotate-key', {
        method: 'POST',
        body: JSON.stringify(rotateForm),
      });
      setRotateForm({ oldMasterKey: '', newMasterKey: '' });
      onNotify(`Rotação concluída! ${res.rotatedCredentialsCount} credenciais re-criptografadas.`);
    } catch (err: any) {
      onNotify(err.message, true);
    }
  };

  const handleAddDoc = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await apiFetch('/api/ai/knowledge', {
        method: 'POST',
        body: JSON.stringify({
          organizationId: activeOrgId,
          clientId: docForm.clientId || null,
          title: docForm.title,
          content: docForm.content,
        }),
      });
      setDocForm({ title: '', clientId: '', content: '' });
      onNotify('Documento adicionado à Base de Conhecimento isolada do tenant.');
      onRefresh();
    } catch (err: any) {
      onNotify(err.message, true);
    }
  };

  return (
    <div className="space-y-6">
      <AiSettingsLimitsPanel
        activeOrgId={activeOrgId}
        isSuperAdmin={isSuperAdmin}
        isAdmin={isAdmin}
        canManage={canManage}
        onRefresh={onRefresh}
        onNotify={onNotify}
      />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 text-xs">
        <div className="space-y-4">
        <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-5 space-y-3">
          <h3 className="font-bold text-white text-sm flex items-center gap-2">
            <Settings className="w-4 h-4 text-cyan-400" /> Segurança & Variáveis de Ambiente
          </h3>
          <div className="bg-slate-950 border border-slate-800 rounded-xl p-3 space-y-1.5">
            <div className="flex justify-between">
              <span className="text-slate-400">Chave Mestra AES-256-GCM:</span>
              <span className={configStatus?.encryptionKeyConfigured ? 'text-emerald-400 font-semibold' : 'text-amber-400 font-semibold'}>
                {configStatus?.encryptionKeyConfigured ? 'Configurada' : 'Ausente (NER_AI_ENCRYPTION_KEY)'}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-400">Catálogo de Preços:</span>
              <span className="font-mono text-cyan-400">{configStatus?.pricingVersion || '—'}</span>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            {Object.entries(configStatus?.envVariablesPresent || {}).map(([pid, present]) => (
              <div key={pid} className="p-2 rounded-lg bg-slate-950 border border-slate-800 flex justify-between">
                <span className="font-mono text-slate-300">{pid}</span>
                <span className={present ? 'text-emerald-400' : 'text-slate-500'}>
                  {present ? 'Env detectada' : 'Não definida'}
                </span>
              </div>
            ))}
          </div>
        </div>

        {isSuperAdmin && (
          <form onSubmit={handleRotate} className="bg-slate-900/60 border border-slate-800 rounded-2xl p-5 space-y-3">
            <h3 className="font-bold text-white text-sm flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-emerald-400" /> Rotação de Chave Mestra (Super Admin)
            </h3>
            <input
              type="password"
              required
              placeholder="Chave mestra atual"
              value={rotateForm.oldMasterKey}
              onChange={(e) => setRotateForm({ ...rotateForm, oldMasterKey: e.target.value })}
              className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-white font-mono"
            />
            <input
              type="password"
              required
              minLength={16}
              placeholder="Nova chave mestra (mín. 16 caracteres)"
              value={rotateForm.newMasterKey}
              onChange={(e) => setRotateForm({ ...rotateForm, newMasterKey: e.target.value })}
              className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-white font-mono"
            />
            <button type="submit" className="px-4 py-2 rounded-lg bg-emerald-600 text-white font-semibold">
              Rotacionar Credenciais Criptografadas
            </button>
          </form>
        )}
      </div>

      <div className="space-y-4">
        {canManage && (
          <form onSubmit={handleAddDoc} className="bg-slate-900/60 border border-slate-800 rounded-2xl p-5 space-y-3">
            <h3 className="font-bold text-white text-sm flex items-center gap-2">
              <Database className="w-4 h-4 text-cyan-400" /> Base de Conhecimento / RAG Isolada (Tenant)
            </h3>
            <div className="grid grid-cols-2 gap-2.5">
              <input
                type="text"
                required
                placeholder="Título do documento / playbook"
                value={docForm.title}
                onChange={(e) => setDocForm({ ...docForm, title: e.target.value })}
                className="bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-white"
              />
              <select
                value={docForm.clientId}
                onChange={(e) => setDocForm({ ...docForm, clientId: e.target.value })}
                className="bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-white"
              >
                <option value="">Toda Organização ({activeOrgId})</option>
                {clients.map((c: any) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </div>
            <textarea
              rows={4}
              required
              placeholder="Cole diretrizes de marca, ICP, oferta ou arquitetura técnica para citações..."
              value={docForm.content}
              onChange={(e) => setDocForm({ ...docForm, content: e.target.value })}
              className="w-full bg-slate-950 border border-slate-800 rounded-lg p-3 text-white"
            />
            <button type="submit" className="px-4 py-2 rounded-lg bg-cyan-600 text-white font-semibold">
              Indexar Documento no Tenant
            </button>
          </form>
        )}

        <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-5 space-y-2">
          <h4 className="font-bold text-white text-sm">Documentos Indexados ({knowledgeDocs.length})</h4>
          {knowledgeDocs.map((d: any) => (
            <div key={d.id} className="p-3 rounded-xl bg-slate-950 border border-slate-800">
              <div className="font-semibold text-white">{d.title}</div>
              <div className="text-[11px] text-slate-400 line-clamp-2 mt-0.5">{d.content}</div>
            </div>
          ))}
        </div>
      </div>
      </div>
    </div>
  );
}

/* ----------------------------------------------------------
 * WIDGET REUTILIZÁVEL PARA MÓDULOS DEPARTAMENTAIS (COM AÇÃO)
 * --------------------------------------------------------*/
const DEPT_DEFAULT_ACTIONS: Record<string, { id: string; name: string }[]> = {
  'NER Strategy': [
    { id: 'strategy.diagnosis', name: 'Diagnóstico Estratégico' },
    { id: 'strategy.funnel.plan', name: 'Planejamento de Funil' },
  ],
  'NER Creative': [
    { id: 'creative.copy.generate', name: 'Geração de Copy' },
    { id: 'creative.headline.generate', name: 'Geração de Headlines' },
    { id: 'creative.script.generate', name: 'Roteiro / Vídeo' },
  ],
  'NER Performance': [
    { id: 'performance.campaign.audit', name: 'Auditoria de Campanha' },
    { id: 'performance.anomaly.explain', name: 'Explicação de Anomalia' },
  ],
  'NER Tracking': [{ id: 'tracking.capi.audit', name: 'Auditoria CAPI & Pixel' }],
  'NER Automation': [{ id: 'automation.workflow.classify', name: 'Classificação de Workflow' }],
  'NER Intelligence': [{ id: 'intelligence.executive.summary', name: 'Resumo Executivo' }],
  'NER Web': [
    { id: 'web.lp.structure', name: 'Estruturação de LP' },
    { id: 'web.seo.optimize', name: 'Otimização SEO' },
  ],
  'NER Digital Studio': [
    { id: 'studio.requirements.analyze', name: 'Requisitos Técnicos' },
    { id: 'studio.qa.checklist', name: 'Checklist de QA' },
  ],
  'NER Client Experience': [
    { id: 'client.portal.summary', name: 'Resumo Portal Cliente' },
    { id: 'client.support.reply', name: 'Resposta ao Cliente' },
  ],
};

export function DepartmentAiWidget({
  department,
  title,
  placeholder,
  defaultInput,
  clientId,
  projectId,
  onNotify,
}: {
  department: string;
  title: string;
  placeholder: string;
  defaultInput?: string;
  clientId?: string;
  projectId?: string;
  onNotify: (m: string, isError?: boolean) => void;
}) {
  const deptOptions = DEPT_DEFAULT_ACTIONS[department] || [];
  const [selectedAction, setSelectedAction] = useState<string>(deptOptions[0]?.id || '');
  const [availableActions, setAvailableActions] = useState<{ id: string; name: string }[]>(deptOptions);
  const [input, setInput] = useState(defaultInput || '');
  const [loading, setLoading] = useState(false);
  const [output, setOutput] = useState<any>(null);

  useEffect(() => {
    apiFetch<any[]>('/api/ai/actions')
      .then((list) => {
        const filtered = (list || [])
          .filter((a) => a.department === department)
          .map((a) => ({ id: a.id, name: a.name }));
        if (filtered.length > 0) {
          setAvailableActions(filtered);
          setSelectedAction((prev) => (filtered.some((f) => f.id === prev) ? prev : filtered[0].id));
        }
      })
      .catch(() => {
        // Fallback to built-in options silently if user only has basic assistant access
      });
  }, [department]);

  const runAi = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim()) return;
    setLoading(true);
    setOutput(null);
    try {
      const res = await apiFetch<any>('/api/ai/department/execute', {
        method: 'POST',
        body: JSON.stringify({
          department,
          action: selectedAction || undefined,
          taskInput: input,
          clientId,
          projectId,
        }),
      });
      setOutput(res);
    } catch (err: any) {
      onNotify(err.message, true);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="bg-slate-900/60 border border-cyan-500/25 rounded-2xl p-5 space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-cyan-400" />
          <h3 className="font-bold text-white text-sm">{title}</h3>
        </div>
        <div className="flex items-center gap-2">
          {availableActions.length > 0 && (
            <select
              value={selectedAction}
              onChange={(e) => setSelectedAction(e.target.value)}
              className="bg-slate-950 border border-slate-800 rounded-lg px-2 py-1 text-[11px] font-mono text-cyan-300"
            >
              {availableActions.map((a) => (
                <option key={a.id} value={a.id}>{a.name} ({a.id})</option>
              ))}
            </select>
          )}
          <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-cyan-500/10 text-cyan-300 border border-cyan-500/20">
            NER AI Gateway • {department}
          </span>
        </div>
      </div>
      <form onSubmit={runAi} className="flex flex-col md:flex-row gap-2">
        <input
          type="text"
          required
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder={placeholder}
          className="flex-1 bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-white"
        />
        <button
          type="submit"
          disabled={loading}
          className="px-4 py-2 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-semibold flex items-center justify-center gap-1.5 shrink-0"
        >
          {loading ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Cpu className="w-3.5 h-3.5" />}
          {loading ? 'Processando...' : 'Executar IA'}
        </button>
      </form>
      {output && (
        <div className="bg-slate-950 border border-slate-800 rounded-xl p-4 space-y-2 text-xs">
          <div className="flex flex-wrap gap-2 text-[10px] font-mono text-cyan-400">
            <span>{output.providerId}/{output.modelId}</span>
            <span>• Ação: {output.action}</span>
            <span>• {output.latencyMs}ms</span>
            <span>• {output.inputTokens + output.outputTokens} tokens ({output.cachedTokens || 0} cache)</span>
            {output.estimatedCostUsd !== null && output.estimatedCostUsd !== undefined && (
              <span className="text-emerald-400">
                • {formatUsd(output.estimatedCostUsd)} ({formatBrl(output.totalCostBRL)})
              </span>
            )}
            {output.fallbackUsed && <span className="text-amber-300">• Fallback de {output.fallbackFrom}</span>}
          </div>
          <div className="text-slate-200 whitespace-pre-wrap leading-relaxed">{output.text}</div>
        </div>
      )}
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  if (status === 'CONECTADO') {
    return (
      <span className="px-2.5 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 flex items-center gap-1">
        <CheckCircle2 className="w-3 h-3" /> CONECTADO
      </span>
    );
  }
  if (status === 'ERRO') {
    return (
      <span className="px-2.5 py-0.5 rounded-full text-[10px] font-semibold bg-rose-500/15 text-rose-300 border border-rose-500/30 flex items-center gap-1">
        <AlertTriangle className="w-3 h-3" /> ERRO
      </span>
    );
  }
  return (
    <span className="px-2.5 py-0.5 rounded-full text-[10px] font-semibold bg-amber-500/15 text-amber-300 border border-amber-500/30">
      AGUARDANDO CONFIGURAÇÃO
    </span>
  );
}

function CapTag({ label }: { label: string }) {
  return (
    <span className="px-2 py-0.5 rounded bg-slate-800/80 text-slate-300 border border-slate-700/60">
      {label}
    </span>
  );
}
