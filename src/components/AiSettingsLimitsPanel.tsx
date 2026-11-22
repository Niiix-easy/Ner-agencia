import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Activity,
  AlertTriangle,
  Bell,
  Building2,
  CheckCircle2,
  Cpu,
  Globe,
  Layers,
  Play,
  RefreshCw,
  Save,
  ShieldAlert,
  ShieldCheck,
  Database,
  Trash2,
} from 'lucide-react';
import { apiFetch } from '../lib/api';
import { AiThresholdAlertsManager } from './AiThresholdAlertsManager';

const DEPT_LIST = [
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

const ON_EXCEED_LABELS: Record<string, string> = {
  block_non_essential: 'Bloquear não-críticas (preservar críticas)',
  block_all: 'Bloquear 100% das chamadas',
  fallback_economical: 'Downgrade automático para modelo econômico',
  notify: 'Apenas alertar e notificar (não bloquear)',
};

function getThresholdBarVisual(pct: number) {
  if (pct >= 100) {
    return {
      bar: 'bg-rose-500',
      badge: 'bg-rose-500/20 text-rose-200 border-rose-500/40',
      label: '100%+ Bloqueio/Limite',
    };
  }
  if (pct >= 90) {
    return {
      bar: 'bg-orange-500',
      badge: 'bg-orange-500/20 text-orange-200 border-orange-500/40',
      label: 'Marco 90%',
    };
  }
  if (pct >= 75) {
    return {
      bar: 'bg-amber-400',
      badge: 'bg-amber-500/20 text-amber-200 border-amber-500/40',
      label: 'Marco 75%',
    };
  }
  if (pct >= 50) {
    return {
      bar: 'bg-cyan-500',
      badge: 'bg-cyan-500/20 text-cyan-200 border-cyan-500/40',
      label: 'Marco 50%',
    };
  }
  return {
    bar: 'bg-emerald-500',
    badge: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30',
    label: 'Saudável',
  };
}

const AVAILABLE_THRESHOLDS = [50, 75, 90, 100] as const;

function toggleThresholdValue(current: number[], mark: number): number[] {
  const exists = current.includes(mark);
  if (exists && current.length <= 1) return current;
  return exists
    ? current.filter((t) => t !== mark).sort((a, b) => a - b)
    : [...current, mark].sort((a, b) => a - b);
}

function PreventiveGaugeRow({
  label,
  sublabel,
  spentUsd,
  limitUsd,
  pct,
  activeThresholds = [50, 75, 90, 100],
}: {
  label: string;
  sublabel: string;
  spentUsd: number;
  limitUsd: number;
  pct: number;
  activeThresholds?: number[];
}) {
  const hasLimit = limitUsd > 0;
  const visual = getThresholdBarVisual(hasLimit ? pct : 0);
  const clampedWidth = hasLimit ? Math.min(100, Math.max(0, pct)) : 0;

  return (
    <div className="bg-slate-950 border border-slate-800 rounded-xl p-3 space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <div className="text-xs font-bold text-white">{label}</div>
          <div className="text-[11px] text-slate-400">{sublabel}</div>
        </div>
        <div className="flex items-center gap-2">
          <span className="font-mono text-xs text-slate-200">
            ${spentUsd.toFixed(4)}{' '}
            <span className="text-slate-500">
              / {hasLimit ? `$${limitUsd.toFixed(2)}` : 'Sem teto'}
            </span>
          </span>
          <span
            className={`text-[10px] font-mono px-2 py-0.5 rounded border ${
              hasLimit
                ? visual.badge
                : 'bg-slate-800/60 text-slate-400 border-slate-700'
            }`}
          >
            {hasLimit ? `${pct.toFixed(1)}% • ${visual.label}` : 'Monitorando'}
          </span>
        </div>
      </div>

      <div className="relative h-2.5 w-full rounded-full bg-slate-900 border border-slate-800 overflow-hidden">
        {hasLimit && (
          <div
            className={`h-full transition-all duration-300 ${visual.bar}`}
            style={{ width: `${clampedWidth}%` }}
          />
        )}
        {[50, 75, 90].map((mark) => (
          <div
            key={mark}
            title={`Marco ${mark}%`}
            className={`absolute top-0 bottom-0 w-px ${
              activeThresholds.includes(mark) ? 'bg-slate-400/80' : 'bg-slate-700/40'
            }`}
            style={{ left: `${mark}%` }}
          />
        ))}
      </div>
      <div className="flex items-center justify-between text-[9px] font-mono text-slate-500">
        <span>0%</span>
        {AVAILABLE_THRESHOLDS.map((mark) => {
          const enabled = activeThresholds.includes(mark);
          const hit = hasLimit && pct >= mark;
          return (
            <span
              key={mark}
              className={
                hit && enabled
                  ? 'text-amber-300 font-bold'
                  : enabled
                    ? 'text-slate-300'
                    : 'text-slate-600 line-through'
              }
            >
              {mark}%
            </span>
          );
        })}
      </div>
    </div>
  );
}

interface AiSettingsLimitsPanelProps {
  activeOrgId: string;
  isSuperAdmin: boolean;
  isAdmin: boolean;
  canManage: boolean;
  onRefresh: () => void;
  onNotify: (msg: string, isError?: boolean) => void;
}

export function AiSettingsLimitsPanel({
  activeOrgId,
  isSuperAdmin,
  isAdmin,
  canManage,
  onRefresh,
  onNotify,
}: AiSettingsLimitsPanelProps) {
  const [activeSection, setActiveSection] = useState<'limits' | 'monitoring' | 'alerts' | 'models' | 'memory'>('limits');
  const [selectedOrgId, setSelectedOrgId] = useState<string>(activeOrgId);
  const [memoryItems, setMemoryItems] = useState<any[]>([]);
  const [retentionDays, setRetentionDays] = useState(30);
  const [embeddingInput, setEmbeddingInput] = useState('Resumo executivo de campanha de aquisição B2B');
  const [embeddingResult, setEmbeddingResult] = useState<any>(null);
  const [testingEmbedding, setTestingEmbedding] = useState(false);
  const [orgs, setOrgs] = useState<{ id: string; name: string }[]>([]);
  const [models, setModels] = useState<any[]>([]);
  const [modelSearch, setModelSearch] = useState('');
  const [snapshot, setSnapshot] = useState<any>(null);
  const [loadingSnapshot, setLoadingSnapshot] = useState(false);
  const [savingGlobal, setSavingGlobal] = useState(false);
  const [savingOrg, setSavingOrg] = useState(false);
  const [savingModels, setSavingModels] = useState(false);
  const [guardCheckForm, setGuardCheckForm] = useState({
    department: 'NER Creative',
    modelKey: '',
    isCritical: false,
  });
  const [guardChecking, setGuardChecking] = useState(false);
  const [guardResult, setGuardResult] = useState<any>(null);

  const [globalForm, setGlobalForm] = useState({
    dailyLimitUsd: '0',
    monthlyLimitUsd: '0',
    onExceedAction: 'block_non_essential',
    alertThresholds: [50, 75, 90, 100] as number[],
  });

  const [orgForm, setOrgForm] = useState({
    dailyLimitUsd: '20',
    monthlyLimitUsd: '250',
    userDailyLimitUsd: '10',
    alertThresholdPct: '80',
    onExceedAction: 'block_non_essential',
    alertThresholds: [50, 75, 90, 100] as number[],
    departmentLimitsUsd: {} as Record<string, string>,
    modelLimitsUsd: {} as Record<string, string>,
  });

  const [modelTokenDrafts, setModelTokenDrafts] = useState<
    Record<string, { dailyTokenLimit: string; maxInputTokens: string; maxOutputTokens: string }>
  >({});

  useEffect(() => {
    setSelectedOrgId(activeOrgId);
  }, [activeOrgId]);

  const loadMonitoringData = useCallback(async () => {
    setLoadingSnapshot(true);
    try {
      const targetOrg = selectedOrgId || activeOrgId;
      const requests: Promise<any>[] = [
        apiFetch(`/api/ai/preventive-monitoring?organizationId=${encodeURIComponent(targetOrg)}`),
        apiFetch('/api/ai/models').catch(() => []),
      ];
      if (isSuperAdmin) {
        requests.push(apiFetch('/api/organizations').catch(() => []));
      }
      const [snap, modelsList, orgList] = await Promise.all(requests);
      setSnapshot(snap);
      if (Array.isArray(modelsList)) {
        setModels(modelsList);
        const tokDrafts: Record<
          string,
          { dailyTokenLimit: string; maxInputTokens: string; maxOutputTokens: string }
        > = {};
        for (const m of modelsList) {
          tokDrafts[m.id] = {
            dailyTokenLimit: m.dailyTokenLimit ? String(m.dailyTokenLimit) : '',
            maxInputTokens: m.maxInputTokens ? String(m.maxInputTokens) : '',
            maxOutputTokens: m.maxOutputTokens ? String(m.maxOutputTokens) : '',
          };
        }
        setModelTokenDrafts(tokDrafts);
      }
      if (Array.isArray(orgList)) {
        setOrgs(orgList.map((o: any) => ({ id: o.id, name: o.name })));
      }
      if (snap?.globalPolicy) {
        setGlobalForm({
          dailyLimitUsd: String(snap.globalPolicy.dailyLimitUsd ?? 0),
          monthlyLimitUsd: String(snap.globalPolicy.monthlyLimitUsd ?? 0),
          onExceedAction: snap.globalPolicy.onExceedAction || 'block_non_essential',
          alertThresholds:
            Array.isArray(snap.globalPolicy.alertThresholds) && snap.globalPolicy.alertThresholds.length > 0
              ? snap.globalPolicy.alertThresholds
              : [50, 75, 90, 100],
        });
      }
      if (snap?.organizationPolicy) {
        const deptMap: Record<string, string> = {};
        for (const dept of DEPT_LIST) {
          const val = snap.organizationPolicy.departmentLimitsUsd?.[dept];
          deptMap[dept] = val !== undefined && val !== null && Number(val) > 0 ? String(val) : '';
        }
        const modUsdMap: Record<string, string> = {};
        for (const [k, v] of Object.entries(snap.organizationPolicy.modelLimitsUsd || {})) {
          if (v !== undefined && v !== null && Number(v) > 0) modUsdMap[k] = String(v);
        }
        setOrgForm({
          dailyLimitUsd: String(snap.organizationPolicy.dailyLimitUsd ?? 20),
          monthlyLimitUsd: String(snap.organizationPolicy.monthlyLimitUsd ?? 250),
          userDailyLimitUsd: String(snap.organizationPolicy.userDailyLimitUsd ?? 10),
          alertThresholdPct: String(snap.organizationPolicy.alertThresholdPct ?? 80),
          onExceedAction: snap.organizationPolicy.onExceedAction || 'block_non_essential',
          alertThresholds:
            Array.isArray(snap.organizationPolicy.alertThresholds) &&
            snap.organizationPolicy.alertThresholds.length > 0
              ? snap.organizationPolicy.alertThresholds
              : [50, 75, 90, 100],
          departmentLimitsUsd: deptMap,
          modelLimitsUsd: modUsdMap,
        });
      }
    } catch (err: any) {
      onNotify(err?.message || 'Erro ao carregar monitoramento preventivo de limites.', true);
    } finally {
      setLoadingSnapshot(false);
    }
  }, [selectedOrgId, activeOrgId, isSuperAdmin, onNotify]);

  useEffect(() => {
    loadMonitoringData();
  }, [loadMonitoringData]);

  const handleSaveGlobal = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingGlobal(true);
    try {
      await apiFetch('/api/ai/global-cost-policy', {
        method: 'PUT',
        body: JSON.stringify({
          dailyLimitUsd: Math.max(0, Number(globalForm.dailyLimitUsd) || 0),
          monthlyLimitUsd: Math.max(0, Number(globalForm.monthlyLimitUsd) || 0),
          alertThresholds: globalForm.alertThresholds,
          onExceedAction: globalForm.onExceedAction,
        }),
      });
      onNotify('Limites globais e limiares de alerta do AI Gateway salvos com sucesso.');
      await loadMonitoringData();
      onRefresh();
    } catch (err: any) {
      onNotify(err?.message || 'Erro ao salvar limites globais.', true);
    } finally {
      setSavingGlobal(false);
    }
  };

  const buildParsedModelUsdLimits = () => {
    const parsed: Record<string, number> = {};
    for (const [mKey, rawVal] of Object.entries(orgForm.modelLimitsUsd)) {
      const num = Number(rawVal);
      if (Number.isFinite(num) && num > 0) parsed[mKey] = num;
    }
    return parsed;
  };

  const handleSaveOrgAndDepartments = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingOrg(true);
    try {
      const parsedDepartments: Record<string, number> = {};
      for (const [dept, rawVal] of Object.entries(orgForm.departmentLimitsUsd)) {
        const num = Number(rawVal);
        if (Number.isFinite(num) && num > 0) parsedDepartments[dept] = num;
      }
      await apiFetch('/api/ai/cost-policy', {
        method: 'PUT',
        body: JSON.stringify({
          organizationId: selectedOrgId,
          dailyLimitUsd: Math.max(0, Number(orgForm.dailyLimitUsd) || 0),
          monthlyLimitUsd: Math.max(0, Number(orgForm.monthlyLimitUsd) || 0),
          userDailyLimitUsd: Math.max(0, Number(orgForm.userDailyLimitUsd) || 0),
          alertThresholdPct: Math.min(100, Math.max(1, Number(orgForm.alertThresholdPct) || 80)),
          alertThresholds: orgForm.alertThresholds,
          blockOnExceed: orgForm.onExceedAction !== 'notify',
          onExceedAction: orgForm.onExceedAction,
          departmentLimitsUsd: parsedDepartments,
          modelLimitsUsd: buildParsedModelUsdLimits(),
        }),
      });
      onNotify(
        `Limites preventivos e limiares da organização (${selectedOrgId}) atualizados no AI Gateway.`
      );
      await loadMonitoringData();
      onRefresh();
    } catch (err: any) {
      onNotify(err?.message || 'Erro ao salvar limites de organização e departamento.', true);
    } finally {
      setSavingOrg(false);
    }
  };

  const handleSavePerModelLimits = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingModels(true);
    try {
      const parsedModelUsd = buildParsedModelUsdLimits();
      await apiFetch('/api/ai/cost-policy', {
        method: 'PUT',
        body: JSON.stringify({
          organizationId: selectedOrgId,
          modelLimitsUsd: parsedModelUsd,
        }),
      });

      const changedModels = models.filter((m) => {
        const draft = modelTokenDrafts[m.id];
        if (!draft) return false;
        const nextDailyTok = draft.dailyTokenLimit.trim() ? Number(draft.dailyTokenLimit) : null;
        const nextIn = draft.maxInputTokens.trim() ? Number(draft.maxInputTokens) : null;
        const nextOut = draft.maxOutputTokens.trim() ? Number(draft.maxOutputTokens) : null;
        return (
          (m.dailyTokenLimit ?? null) !== nextDailyTok ||
          (m.maxInputTokens ?? null) !== nextIn ||
          (m.maxOutputTokens ?? null) !== nextOut
        );
      });

      for (const m of changedModels) {
        const draft = modelTokenDrafts[m.id];
        await apiFetch(`/api/ai/models/${encodeURIComponent(m.id)}`, {
          method: 'PATCH',
          body: JSON.stringify({
            dailyTokenLimit: draft.dailyTokenLimit.trim() ? Number(draft.dailyTokenLimit) : null,
            maxInputTokens: draft.maxInputTokens.trim() ? Number(draft.maxInputTokens) : null,
            maxOutputTokens: draft.maxOutputTokens.trim() ? Number(draft.maxOutputTokens) : null,
          }),
        });
      }

      onNotify('Limites por modelo (USD/dia e tokens) salvos no AI Gateway.');
      await loadMonitoringData();
      onRefresh();
    } catch (err: any) {
      onNotify(err?.message || 'Erro ao salvar limites por modelo.', true);
    } finally {
      setSavingModels(false);
    }
  };

  const handleRunGuardCheck = async (e: React.FormEvent) => {
    e.preventDefault();
    setGuardChecking(true);
    try {
      let providerId: string | undefined;
      let modelId: string | undefined;
      if (guardCheckForm.modelKey.includes('/')) {
        const idx = guardCheckForm.modelKey.indexOf('/');
        providerId = guardCheckForm.modelKey.slice(0, idx);
        modelId = guardCheckForm.modelKey.slice(idx + 1);
      }
      const res = await apiFetch('/api/ai/preventive-monitoring/check', {
        method: 'POST',
        body: JSON.stringify({
          organizationId: selectedOrgId,
          department: guardCheckForm.department,
          providerId,
          modelId,
          isCritical: guardCheckForm.isCritical,
        }),
      });
      setGuardResult(res);
    } catch (err: any) {
      onNotify(err?.message || 'Erro ao executar validação preventiva no AI Gateway.', true);
    } finally {
      setGuardChecking(false);
    }
  };

  const loadMemoryData = useCallback(async () => {
    try {
      const targetOrg = selectedOrgId || activeOrgId;
      const list = await apiFetch<any[]>(`/api/ai/memory?organizationId=${encodeURIComponent(targetOrg)}`);
      setMemoryItems(Array.isArray(list) ? list : []);
    } catch {
      setMemoryItems([]);
    }
  }, [selectedOrgId, activeOrgId]);

  useEffect(() => {
    if (activeSection === 'memory') {
      loadMemoryData();
    }
  }, [activeSection, loadMemoryData]);

  const handleClearConversation = async (conversationId: string) => {
    try {
      const targetOrg = selectedOrgId || activeOrgId;
      await apiFetch(
        `/api/ai/memory/${encodeURIComponent(conversationId)}?organizationId=${encodeURIComponent(targetOrg)}`,
        { method: 'DELETE' }
      );
      onNotify(`Memória da conversa "${conversationId}" removida com auditoria.`);
      loadMemoryData();
    } catch (err: any) {
      onNotify(err?.message || 'Erro ao limpar memória.', true);
    }
  };

  const handlePruneMemory = async () => {
    try {
      const targetOrg = selectedOrgId || activeOrgId;
      const res = await apiFetch<any>('/api/ai/memory/prune', {
        method: 'POST',
        body: JSON.stringify({ organizationId: targetOrg, retentionDays: Number(retentionDays) }),
      });
      onNotify(`Retenção aplicada (${retentionDays} dias): ${res.removed} registro(s) expirados removidos.`);
      loadMemoryData();
    } catch (err: any) {
      onNotify(err?.message || 'Erro ao aplicar retenção de memória.', true);
    }
  };

  const handleTestEmbedding = async (e: React.FormEvent) => {
    e.preventDefault();
    setTestingEmbedding(true);
    setEmbeddingResult(null);
    try {
      const res = await apiFetch<any>('/api/ai/embeddings', {
        method: 'POST',
        body: JSON.stringify({
          organizationId: selectedOrgId || activeOrgId,
          department: 'NER Intelligence',
          input: embeddingInput,
        }),
      });
      setEmbeddingResult(res);
      onNotify(`Embedding gerado (${res.dimensions || res.vectors?.[0]?.length || 0} dimensões).`);
    } catch (err: any) {
      onNotify(err?.message || 'Falha ao gerar embeddings (verifique credenciais do provedor).', true);
    } finally {
      setTestingEmbedding(false);
    }
  };

  const deptStatus: any[] = snapshot?.departmentStatus || [];
  const deptStatusMap = useMemo(() => {
    const map: Record<string, { spentTodayUsd: number; limitUsd: number; pct: number }> = {};
    for (const d of deptStatus) {
      map[d.department] = d;
    }
    return map;
  }, [deptStatus]);
  const totalDeptCapsUsd = useMemo(
    () =>
      Object.values(orgForm.departmentLimitsUsd).reduce((sum, raw) => {
        const val = Number(raw);
        return sum + (Number.isFinite(val) && val > 0 ? val : 0);
      }, 0),
    [orgForm.departmentLimitsUsd]
  );
  const modelStatus: any[] = snapshot?.modelStatus || [];
  const orgSummaryList: any[] = snapshot?.organizationsSummary || [];
  const activePreventiveAlerts: any[] = snapshot?.activeAlerts || [];
  const filteredModels = models.filter((m) => {
    if (!modelSearch.trim()) return true;
    const q = modelSearch.trim().toLowerCase();
    return (
      String(m.modelId || '').toLowerCase().includes(q) ||
      String(m.providerId || '').toLowerCase().includes(q) ||
      String(m.displayName || '').toLowerCase().includes(q)
    );
  });

  return (
    <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-5 space-y-5 text-xs">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-800 pb-4">
        <div>
          <h3 className="font-bold text-white text-sm flex items-center gap-2">
            <ShieldAlert className="w-4 h-4 text-cyan-400" />
            Limites de Consumo & Monitoramento Preventivo (AI Gateway)
          </h3>
          <p className="text-[11px] text-slate-400 mt-1">
            O AI Gateway avalia estes tetos antes de cada chamada aos provedores para bloquear excedentes ou aplicar downgrade econômico.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {isSuperAdmin && orgs.length > 0 && (
            <select
              aria-label="Organização selecionada"
              value={selectedOrgId}
              onChange={(e) => setSelectedOrgId(e.target.value)}
              className="bg-slate-950 border border-slate-700 rounded-lg px-2.5 py-1.5 text-white text-xs"
            >
              {orgs.map((o) => (
                <option key={o.id} value={o.id}>
                  Org: {o.name} ({o.id})
                </option>
              ))}
            </select>
          )}
          <button
            type="button"
            onClick={loadMonitoringData}
            disabled={loadingSnapshot}
            className="px-2.5 py-1.5 rounded-lg bg-slate-950 hover:bg-slate-800 border border-slate-700 text-slate-200 flex items-center gap-1.5"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loadingSnapshot ? 'animate-spin' : ''}`} />
            Atualizar Snapshot
          </button>
        </div>
      </div>

      {/* Faixa Compacta de Status Preventivo do AI Gateway (Sempre Visível) */}
      {snapshot && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {[
            {
              label: 'Global Diário',
              spent: Number(snapshot.globalDailySpentUsd || 0),
              limit: Number(snapshot.globalPolicy?.dailyLimitUsd || 0),
              pct: Number(snapshot.globalDailyPct || 0),
              sub: ON_EXCEED_LABELS[snapshot.globalPolicy?.onExceedAction] || 'Padrão',
            },
            {
              label: 'Global Mensal',
              spent: Number(snapshot.globalMonthlySpentUsd || 0),
              limit: Number(snapshot.globalPolicy?.monthlyLimitUsd || 0),
              pct: Number(snapshot.globalMonthlyPct || 0),
              sub: 'Soma de todas as organizações',
            },
            {
              label: `Org Diário (${selectedOrgId})`,
              spent: Number(snapshot.organizationDailySpentUsd || 0),
              limit: Number(snapshot.organizationPolicy?.dailyLimitUsd || 0),
              pct: Number(snapshot.organizationDailyPct || 0),
              sub: ON_EXCEED_LABELS[snapshot.organizationPolicy?.onExceedAction] || 'Padrão',
            },
            {
              label: `Org Mensal (${selectedOrgId})`,
              spent: Number(snapshot.organizationMonthlySpentUsd || 0),
              limit: Number(snapshot.organizationPolicy?.monthlyLimitUsd || 0),
              pct: Number(snapshot.organizationMonthlyPct || 0),
              sub: `${deptStatus.length} depto(s) com teto ativo`,
            },
          ].map((kpi) => {
            const hasLimit = kpi.limit > 0;
            const visual = getThresholdBarVisual(hasLimit ? kpi.pct : 0);
            return (
              <div
                key={kpi.label}
                className="bg-slate-950 border border-slate-800 rounded-xl p-3 space-y-1.5"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[11px] text-slate-400 truncate">{kpi.label}</span>
                  <span className="font-mono tabular-nums text-[11px] text-slate-300 shrink-0">
                    {hasLimit ? `${kpi.pct.toFixed(1)}%` : 'Sem teto'}
                  </span>
                </div>
                <div className="font-mono tabular-nums text-sm font-bold text-white">
                  ${kpi.spent.toFixed(4)}{' '}
                  <span className="text-[11px] font-normal text-slate-500">
                    / {hasLimit ? `$${kpi.limit.toFixed(2)}` : '∞'}
                  </span>
                </div>
                <div className="h-1.5 w-full rounded-full bg-slate-900 overflow-hidden">
                  <div
                    className={`h-full transition-all duration-300 ${hasLimit ? visual.bar : 'bg-slate-700'}`}
                    style={{ width: `${hasLimit ? Math.min(100, Math.max(0, kpi.pct)) : 0}%` }}
                  />
                </div>
                <div className="text-[10px] text-slate-400 truncate">{kpi.sub}</div>
              </div>
            );
          })}
        </div>
      )}

      {/* Navegação Interna da Administração de Limites & Monitoramento Preventivo */}
      <div className="flex flex-wrap items-center gap-1.5 border-b border-slate-800 pb-3">
        {(
          [
            { id: 'limits', label: 'Limites: Global, Org & Depto', icon: Building2 },
            {
              id: 'monitoring',
              label: `Monitoramento & Simulador (${activePreventiveAlerts.length})`,
              icon: Activity,
            },
            { id: 'alerts', label: 'Alertas (50% · 75% · 90% · 100%)', icon: Bell },
            { id: 'models', label: `Limites por Modelo (${models.length})`, icon: Cpu },
            { id: 'memory', label: 'Memória & Embeddings', icon: Database },
          ] as const
        ).map((tab) => {
          const Icon = tab.icon;
          const active = activeSection === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveSection(tab.id)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 whitespace-nowrap shrink-0 transition-colors ${
                active
                  ? 'bg-cyan-600 text-white'
                  : 'bg-slate-950 border border-slate-800 text-slate-400 hover:text-white'
              }`}
            >
              <Icon className="w-3.5 h-3.5" />
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* SEÇÃO: MONITORAMENTO PREVENTIVO EM TEMPO REAL + SIMULADOR PRE-FLIGHT */}
      {activeSection === 'monitoring' && snapshot && (
        <div className="space-y-4">
          {/* Simulador Pre-Flight Real do AI Gateway */}
          <form
            onSubmit={handleRunGuardCheck}
            className="bg-slate-950 border border-cyan-500/30 rounded-xl p-4 space-y-3"
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h4 className="font-bold text-white text-xs flex items-center gap-1.5">
                  <ShieldCheck className="w-4 h-4 text-cyan-400" />
                  Validador Pre-Flight do AI Gateway (Teste de Regras Ativas)
                </h4>
                <p className="text-[11px] text-slate-400 mt-0.5">
                  Simula a verificação preventiva real do AI Gateway contra limites globais, da organização, do departamento e do modelo antes de enviar chamadas.
                </p>
              </div>
              <button
                type="submit"
                disabled={guardChecking}
                className="px-3.5 py-1.5 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white font-semibold flex items-center gap-1.5 whitespace-nowrap shrink-0"
              >
                <Play className="w-3.5 h-3.5" />
                {guardChecking ? 'Validando...' : 'Testar Regra no Gateway'}
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
              <label className="space-y-1">
                <span className="text-slate-400 text-[11px]">Departamento</span>
                <select
                  value={guardCheckForm.department}
                  onChange={(e) => setGuardCheckForm({ ...guardCheckForm, department: e.target.value })}
                  className="w-full bg-slate-900 border border-slate-800 rounded-lg px-2.5 py-1.5 text-white"
                >
                  {DEPT_LIST.map((dept) => (
                    <option key={dept} value={dept}>
                      {dept}
                    </option>
                  ))}
                </select>
              </label>
              <label className="space-y-1">
                <span className="text-slate-400 text-[11px]">Modelo (opcional)</span>
                <select
                  value={guardCheckForm.modelKey}
                  onChange={(e) => setGuardCheckForm({ ...guardCheckForm, modelKey: e.target.value })}
                  className="w-full bg-slate-900 border border-slate-800 rounded-lg px-2.5 py-1.5 text-white font-mono"
                >
                  <option value="">Qualquer modelo (padrão da rota)</option>
                  {models.map((m) => (
                    <option key={m.id} value={`${m.providerId}/${m.modelId}`}>
                      {m.providerId}/{m.modelId}
                    </option>
                  ))}
                </select>
              </label>
              <label className="flex items-center gap-2 bg-slate-900 border border-slate-800 rounded-lg px-3 py-1.5 self-end h-[34px] cursor-pointer">
                <input
                  type="checkbox"
                  checked={guardCheckForm.isCritical}
                  onChange={(e) => setGuardCheckForm({ ...guardCheckForm, isCritical: e.target.checked })}
                  className="rounded border-slate-700 bg-slate-950"
                />
                <span className="text-slate-200 text-[11px]">Chamada Crítica (preservada em bloqueio parcial)</span>
              </label>
            </div>

            {guardResult && (
              <div
                className={`rounded-xl border p-3 space-y-1.5 ${
                  !guardResult.allowed
                    ? 'bg-rose-500/10 border-rose-500/40 text-rose-200'
                    : guardResult.recommendEconomicalFallback
                      ? 'bg-amber-500/10 border-amber-500/40 text-amber-200'
                      : 'bg-emerald-500/10 border-emerald-500/40 text-emerald-200'
                }`}
              >
                <div className="flex flex-wrap items-center justify-between gap-2 font-bold">
                  <span className="flex items-center gap-1.5">
                    {guardResult.allowed ? (
                      <CheckCircle2 className="w-4 h-4 shrink-0" />
                    ) : (
                      <ShieldAlert className="w-4 h-4 shrink-0" />
                    )}
                    Decisão do AI Gateway:{' '}
                    {!guardResult.allowed
                      ? 'BLOQUEADO PREVENTIVAMENTE'
                      : guardResult.recommendEconomicalFallback
                        ? 'DOWNGRADE AUTOMÁTICO PARA MODELO ECONÔMICO'
                        : 'CHAMADA PERMITIDA'}
                  </span>
                  {guardResult.exceededScope && (
                    <span className="font-mono text-[11px]">Escopo: {guardResult.exceededScope}</span>
                  )}
                </div>
                {guardResult.reason && <p className="text-[11px] opacity-90">{guardResult.reason}</p>}
                {guardResult.economicalFallbackTarget && (
                  <p className="text-[11px] font-mono">
                    Alvo econômico selecionado: {guardResult.economicalFallbackTarget}
                  </p>
                )}
                {Array.isArray(guardResult.warnings) && guardResult.warnings.length > 0 && (
                  <div className="pt-1 space-y-0.5 text-[11px]">
                    {guardResult.warnings.map((w: string, i: number) => (
                      <div key={i} className="flex items-center gap-1.5">
                        <AlertTriangle className="w-3 h-3 shrink-0" />
                        <span>{w}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </form>

          <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
            Medidores Preventivos em Tempo Real (Marcos 50% / 75% / 90% / 100%)
          </div>

          {activePreventiveAlerts.length > 0 && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
              {activePreventiveAlerts.map((al) => (
                <div
                  key={al.id}
                  className={`rounded-xl px-3 py-2 border flex flex-col gap-1 text-[11px] ${
                    al.severity === 'critical'
                      ? 'bg-rose-500/10 border-rose-500/40 text-rose-200'
                      : al.severity === 'warning'
                        ? 'bg-amber-500/10 border-amber-500/40 text-amber-200'
                        : 'bg-cyan-500/10 border-cyan-500/30 text-cyan-200'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                      <span className="truncate font-semibold">{al.label}</span>
                    </div>
                    <span className="font-mono shrink-0">
                      {al.percentageUsed}% (Marco {al.thresholdPct}%)
                    </span>
                  </div>
                  {(al.customMessage || (Array.isArray(al.channels) && al.channels.length > 0)) && (
                    <div className="flex flex-wrap items-center justify-between gap-2 text-[10px] opacity-85">
                      <span className="truncate">{al.customMessage || ''}</span>
                      {Array.isArray(al.channels) && al.channels.length > 0 && (
                        <span className="font-mono shrink-0">
                          Canais: {al.channels.join(', ')}
                        </span>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <PreventiveGaugeRow
              label="Consumo Global Diário (Plataforma)"
              sublabel={`Ação ao exceder: ${ON_EXCEED_LABELS[snapshot.globalPolicy?.onExceedAction] || 'Padrão'}`}
              spentUsd={snapshot.globalDailySpentUsd || 0}
              limitUsd={snapshot.globalPolicy?.dailyLimitUsd || 0}
              pct={snapshot.globalDailyPct || 0}
              activeThresholds={snapshot.globalPolicy?.alertThresholds || [50, 75, 90, 100]}
            />
            <PreventiveGaugeRow
              label="Consumo Global Mensal (Plataforma)"
              sublabel="Soma consolidada de todas as organizações no mês atual"
              spentUsd={snapshot.globalMonthlySpentUsd || 0}
              limitUsd={snapshot.globalPolicy?.monthlyLimitUsd || 0}
              pct={snapshot.globalMonthlyPct || 0}
              activeThresholds={snapshot.globalPolicy?.alertThresholds || [50, 75, 90, 100]}
            />
            <PreventiveGaugeRow
              label={`Organização Diário (${selectedOrgId})`}
              sublabel={`Ação ao exceder: ${ON_EXCEED_LABELS[snapshot.organizationPolicy?.onExceedAction] || 'Padrão'}`}
              spentUsd={snapshot.organizationDailySpentUsd || 0}
              limitUsd={snapshot.organizationPolicy?.dailyLimitUsd || 0}
              pct={snapshot.organizationDailyPct || 0}
              activeThresholds={snapshot.organizationPolicy?.alertThresholds || [50, 75, 90, 100]}
            />
            <PreventiveGaugeRow
              label={`Organização Mensal (${selectedOrgId})`}
              sublabel="Limite mensal do tenant ativo no AI Gateway"
              spentUsd={snapshot.organizationMonthlySpentUsd || 0}
              limitUsd={snapshot.organizationPolicy?.monthlyLimitUsd || 0}
              pct={snapshot.organizationMonthlyPct || 0}
              activeThresholds={snapshot.organizationPolicy?.alertThresholds || [50, 75, 90, 100]}
            />
          </div>

          {deptStatus.length > 0 && (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5 pt-1">
              {deptStatus.map((d) => (
                <PreventiveGaugeRow
                  key={d.department}
                  label={d.department}
                  sublabel="Teto diário departamental"
                  spentUsd={d.spentTodayUsd}
                  limitUsd={d.limitUsd}
                  pct={d.pct}
                  activeThresholds={snapshot.organizationPolicy?.alertThresholds || [50, 75, 90, 100]}
                />
              ))}
            </div>
          )}

          {modelStatus.length > 0 && (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5 pt-1">
              {modelStatus.map((ms) =>
                ms.limitUsd > 0 ? (
                  <PreventiveGaugeRow
                    key={`usd-${ms.modelKey}`}
                    label={`Modelo: ${ms.modelKey}`}
                    sublabel={
                      ms.dailyTokenLimit
                        ? `Tokens hoje: ${ms.tokensToday.toLocaleString('pt-BR')} / ${ms.dailyTokenLimit.toLocaleString('pt-BR')}`
                        : 'Teto diário por modelo (USD)'
                    }
                    spentUsd={ms.spentTodayUsd}
                    limitUsd={ms.limitUsd}
                    pct={ms.usdPct}
                    activeThresholds={snapshot.organizationPolicy?.alertThresholds || [50, 75, 90, 100]}
                  />
                ) : null
              )}
            </div>
          )}
        </div>
      )}

      {/* SEÇÃO: GESTÃO DEDICADA DE ALERTAS DE LIMIARES (50%, 75%, 90%, 100%) */}
      {activeSection === 'alerts' && (
        <AiThresholdAlertsManager
          snapshot={snapshot}
          selectedOrgId={selectedOrgId}
          isAdmin={isAdmin}
          canManage={canManage}
          onSaved={async () => {
            await loadMonitoringData();
            onRefresh();
          }}
          onNotify={onNotify}
        />
      )}

      {/* SEÇÃO: FORMULÁRIOS DE LIMITES (GLOBAL, ORGANIZAÇÃO E DEPARTAMENTO) */}
      {activeSection === 'limits' && (
      <div className="space-y-5">
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-5">
        {/* 1. Limites Globais */}
        <form
          onSubmit={handleSaveGlobal}
          className="bg-slate-950 border border-slate-800 rounded-xl p-4 space-y-3"
        >
          <div className="flex items-center justify-between gap-2">
            <h4 className="font-bold text-white text-xs flex items-center gap-1.5">
              <Globe className="w-4 h-4 text-cyan-400" />
              Limites Globais (Toda a Plataforma)
            </h4>
            {!isAdmin && (
              <span className="text-[10px] text-amber-300 bg-amber-500/10 border border-amber-500/30 px-2 py-0.5 rounded">
                Somente Admin
              </span>
            )}
          </div>
          <p className="text-[11px] text-slate-400">
            Defina 0 para desativar o teto global. Valores positivos protegem todas as organizações somadas no AI Gateway.
          </p>

          <div className="space-y-2.5">
            <label className="block space-y-1">
              <span className="text-slate-300">Teto Global Diário (USD)</span>
              <input
                type="number"
                step="0.01"
                min="0"
                disabled={!isAdmin}
                value={globalForm.dailyLimitUsd}
                onChange={(e) => setGlobalForm({ ...globalForm, dailyLimitUsd: e.target.value })}
                className="w-full bg-slate-900 border border-slate-800 rounded-lg px-3 py-2 text-white font-mono"
              />
            </label>
            <label className="block space-y-1">
              <span className="text-slate-300">Teto Global Mensal (USD)</span>
              <input
                type="number"
                step="0.01"
                min="0"
                disabled={!isAdmin}
                value={globalForm.monthlyLimitUsd}
                onChange={(e) => setGlobalForm({ ...globalForm, monthlyLimitUsd: e.target.value })}
                className="w-full bg-slate-900 border border-slate-800 rounded-lg px-3 py-2 text-white font-mono"
              />
            </label>
            <label className="block space-y-1">
              <span className="text-slate-300">Ação Preventiva ao Exceder Global</span>
              <select
                disabled={!isAdmin}
                value={globalForm.onExceedAction}
                onChange={(e) => setGlobalForm({ ...globalForm, onExceedAction: e.target.value })}
                className="w-full bg-slate-900 border border-slate-800 rounded-lg px-3 py-2 text-white"
              >
                <option value="block_non_essential">Bloquear não-críticas (preservar críticas)</option>
                <option value="block_all">Bloquear 100% das chamadas</option>
                <option value="fallback_economical">Downgrade automático para modelo econômico</option>
                <option value="notify">Apenas notificar (não bloquear)</option>
              </select>
            </label>
            <div className="space-y-1.5 pt-1">
              <span className="text-slate-300 block">Limiares de Alerta Global (%)</span>
              <div className="grid grid-cols-4 gap-1.5">
                {AVAILABLE_THRESHOLDS.map((mark) => {
                  const active = globalForm.alertThresholds.includes(mark);
                  return (
                    <button
                      key={mark}
                      type="button"
                      disabled={!isAdmin}
                      onClick={() =>
                        setGlobalForm({
                          ...globalForm,
                          alertThresholds: toggleThresholdValue(globalForm.alertThresholds, mark),
                        })
                      }
                      className={`py-1.5 rounded-lg border font-mono text-[11px] font-semibold transition-colors ${
                        active
                          ? 'bg-cyan-500/20 border-cyan-500/50 text-cyan-200'
                          : 'bg-slate-900 border-slate-800 text-slate-500 hover:text-slate-300'
                      }`}
                    >
                      {mark}%
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          {isAdmin && (
            <button
              type="submit"
              disabled={savingGlobal}
              className="w-full py-2 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white font-semibold flex items-center justify-center gap-1.5"
            >
              <Save className="w-3.5 h-3.5" />
              {savingGlobal ? 'Salvando...' : 'Salvar Limites Globais'}
            </button>
          )}
        </form>

        {/* 2. Limites por Organização e por Departamento */}
        <form
          onSubmit={handleSaveOrgAndDepartments}
          className="xl:col-span-2 bg-slate-950 border border-slate-800 rounded-xl p-4 space-y-4"
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h4 className="font-bold text-white text-xs flex items-center gap-1.5">
              <Building2 className="w-4 h-4 text-emerald-400" />
              Limites por Organização ({selectedOrgId}) & Por Departamento
            </h4>
            {!canManage && (
              <span className="text-[10px] text-amber-300 bg-amber-500/10 border border-amber-500/30 px-2 py-0.5 rounded">
                Somente leitura
              </span>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-2.5">
            <label className="space-y-1">
              <span className="text-slate-300">Org Diário (USD)</span>
              <input
                type="number"
                step="0.01"
                min="0"
                disabled={!canManage}
                value={orgForm.dailyLimitUsd}
                onChange={(e) => setOrgForm({ ...orgForm, dailyLimitUsd: e.target.value })}
                className="w-full bg-slate-900 border border-slate-800 rounded-lg px-2.5 py-2 text-white font-mono"
              />
            </label>
            <label className="space-y-1">
              <span className="text-slate-300">Org Mensal (USD)</span>
              <input
                type="number"
                step="0.01"
                min="0"
                disabled={!canManage}
                value={orgForm.monthlyLimitUsd}
                onChange={(e) => setOrgForm({ ...orgForm, monthlyLimitUsd: e.target.value })}
                className="w-full bg-slate-900 border border-slate-800 rounded-lg px-2.5 py-2 text-white font-mono"
              />
            </label>
            <label className="space-y-1">
              <span className="text-slate-300">Usuário Diário (USD)</span>
              <input
                type="number"
                step="0.01"
                min="0"
                disabled={!canManage}
                value={orgForm.userDailyLimitUsd}
                onChange={(e) => setOrgForm({ ...orgForm, userDailyLimitUsd: e.target.value })}
                className="w-full bg-slate-900 border border-slate-800 rounded-lg px-2.5 py-2 text-white font-mono"
              />
            </label>
            <label className="space-y-1">
              <span className="text-slate-300">Alerta Padrão (%)</span>
              <input
                type="number"
                min="1"
                max="100"
                disabled={!canManage}
                value={orgForm.alertThresholdPct}
                onChange={(e) => setOrgForm({ ...orgForm, alertThresholdPct: e.target.value })}
                className="w-full bg-slate-900 border border-slate-800 rounded-lg px-2.5 py-2 text-white font-mono"
              />
            </label>
            <label className="space-y-1">
              <span className="text-slate-300">Ação ao Exceder</span>
              <select
                disabled={!canManage}
                value={orgForm.onExceedAction}
                onChange={(e) => setOrgForm({ ...orgForm, onExceedAction: e.target.value })}
                className="w-full bg-slate-900 border border-slate-800 rounded-lg px-2.5 py-2 text-white"
              >
                <option value="block_non_essential">Bloquear não-críticas</option>
                <option value="block_all">Bloquear tudo</option>
                <option value="fallback_economical">Downgrade econômico</option>
                <option value="notify">Apenas notificar</option>
              </select>
            </label>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 bg-slate-900/60 border border-slate-800 rounded-lg px-3 py-2">
            <span className="text-[11px] text-slate-300 font-medium">
              Limiares de Alerta Preventivo (Organização & Departamentos):
            </span>
            <div className="flex items-center gap-1.5">
              {AVAILABLE_THRESHOLDS.map((mark) => {
                const active = orgForm.alertThresholds.includes(mark);
                return (
                  <button
                    key={mark}
                    type="button"
                    disabled={!canManage}
                    onClick={() =>
                      setOrgForm({
                        ...orgForm,
                        alertThresholds: toggleThresholdValue(orgForm.alertThresholds, mark),
                      })
                    }
                    className={`px-2.5 py-1 rounded-md border font-mono text-[11px] font-semibold transition-colors ${
                      active
                        ? 'bg-emerald-500/20 border-emerald-500/50 text-emerald-200'
                        : 'bg-slate-950 border-slate-800 text-slate-500 hover:text-slate-300'
                    }`}
                  >
                    {mark}%
                  </button>
                );
              })}
            </div>
          </div>

          <div className="space-y-2 border-t border-slate-800 pt-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="text-[11px] font-semibold text-slate-300 flex items-center gap-1.5">
                <Layers className="w-3.5 h-3.5 text-violet-400" />
                Limites Diários por Departamento (USD/dia — deixe vazio para herdar o teto da organização)
              </div>
              <div className="flex items-center gap-2 text-[11px] font-mono tabular-nums">
                <span className="text-slate-400">
                  Soma deptos:{' '}
                  <strong className="text-white">${totalDeptCapsUsd.toFixed(2)}</strong>
                  {Number(orgForm.dailyLimitUsd) > 0 && (
                    <span
                      className={
                        totalDeptCapsUsd > Number(orgForm.dailyLimitUsd)
                          ? 'text-amber-300'
                          : 'text-emerald-400'
                      }
                    >
                      {' '}
                      / Org ${Number(orgForm.dailyLimitUsd).toFixed(2)}
                    </span>
                  )}
                </span>
                {canManage && totalDeptCapsUsd > 0 && (
                  <button
                    type="button"
                    onClick={() => setOrgForm({ ...orgForm, departmentLimitsUsd: {} })}
                    className="px-2 py-0.5 rounded bg-slate-900 border border-slate-700 text-slate-400 hover:text-white font-sans text-[10px]"
                  >
                    Limpar deptos
                  </button>
                )}
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
              {DEPT_LIST.map((dept) => {
                const liveDept = deptStatusMap[dept];
                const pct = liveDept?.pct || 0;
                const visual = getThresholdBarVisual(liveDept?.limitUsd > 0 ? pct : 0);
                return (
                  <div
                    key={dept}
                    className="bg-slate-900/80 border border-slate-800 rounded-lg px-2.5 py-2 space-y-1.5"
                  >
                    <label className="flex items-center justify-between gap-2">
                      <span className="text-slate-200 truncate font-medium">{dept}</span>
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        placeholder="Sem limite"
                        disabled={!canManage}
                        value={orgForm.departmentLimitsUsd[dept] || ''}
                        onChange={(e) =>
                          setOrgForm({
                            ...orgForm,
                            departmentLimitsUsd: {
                              ...orgForm.departmentLimitsUsd,
                              [dept]: e.target.value,
                            },
                          })
                        }
                        className="w-24 bg-slate-950 border border-slate-700 rounded px-2 py-1 text-right text-white font-mono"
                      />
                    </label>
                    <div className="flex items-center justify-between text-[10px] font-mono tabular-nums text-slate-400">
                      <span>Hoje: ${(liveDept?.spentTodayUsd || 0).toFixed(4)}</span>
                      <span>{liveDept?.limitUsd > 0 ? `${pct.toFixed(1)}%` : 'Herda Org'}</span>
                    </div>
                    {liveDept?.limitUsd > 0 && (
                      <div className="h-1 w-full rounded-full bg-slate-950 overflow-hidden">
                        <div
                          className={`h-full ${visual.bar}`}
                          style={{ width: `${Math.min(100, Math.max(0, pct))}%` }}
                        />
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {canManage && (
            <div className="flex justify-end">
              <button
                type="submit"
                disabled={savingOrg}
                className="px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-semibold flex items-center gap-1.5"
              >
                <Save className="w-3.5 h-3.5" />
                {savingOrg ? 'Aplicando no Gateway...' : 'Salvar Limites de Organização e Departamentos'}
              </button>
            </div>
          )}
        </form>
      </div>

      {/* Visão Consolidada por Organização (Super Admin) */}
      {isSuperAdmin && orgSummaryList.length > 0 && (
        <div className="bg-slate-950 border border-slate-800 rounded-xl p-4 space-y-2.5">
          <div className="flex items-center justify-between">
            <h4 className="font-bold text-white text-xs flex items-center gap-1.5">
              <Building2 className="w-4 h-4 text-cyan-400" />
              Resumo Multi-Organização (Consumo vs Limites)
            </h4>
            <span className="text-[11px] text-slate-400">Clique em uma organização para editar seus tetos</span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-[11px]">
              <thead>
                <tr className="text-slate-400 border-b border-slate-800">
                  <th className="py-2 pr-3">Organização</th>
                  <th className="py-2 px-3">Gasto Diário</th>
                  <th className="py-2 px-3">Limite Diário</th>
                  <th className="py-2 px-3">Gasto Mensal</th>
                  <th className="py-2 px-3">Limite Mensal</th>
                </tr>
              </thead>
              <tbody className="font-mono tabular-nums">
                {orgSummaryList.map((orgRow) => (
                  <tr
                    key={orgRow.organizationId}
                    onClick={() => setSelectedOrgId(orgRow.organizationId)}
                    className={`border-b border-slate-900 cursor-pointer hover:bg-slate-900/70 ${
                      selectedOrgId === orgRow.organizationId ? 'bg-cyan-500/10' : ''
                    }`}
                  >
                    <td className="py-2 pr-3 font-sans font-semibold text-white">
                      {orgRow.organizationName}{' '}
                      <span className="text-slate-500 font-mono">({orgRow.organizationId})</span>
                    </td>
                    <td className="py-2 px-3 text-slate-200">
                      ${Number(orgRow.dailySpentUsd || 0).toFixed(4)}
                    </td>
                    <td className="py-2 px-3 text-cyan-300">
                      ${Number(orgRow.dailyLimitUsd || 0).toFixed(2)}
                    </td>
                    <td className="py-2 px-3 text-slate-200">
                      ${Number(orgRow.monthlySpentUsd || 0).toFixed(4)}
                    </td>
                    <td className="py-2 px-3 text-cyan-300">
                      ${Number(orgRow.monthlyLimitUsd || 0).toFixed(2)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
      </div>
      )}

      {/* SEÇÃO: LIMITES ESPECÍFICOS POR MODELO (USD/DIA & TOKENS) */}
      {activeSection === 'models' && (
      <form
        onSubmit={handleSavePerModelLimits}
        className="bg-slate-950 border border-slate-800 rounded-xl p-4 space-y-3"
      >
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h4 className="font-bold text-white text-xs flex items-center gap-1.5">
              <Cpu className="w-4 h-4 text-violet-400" />
              Limites por Modelo (Custo Diário USD & Limites de Tokens)
            </h4>
            <p className="text-[11px] text-slate-400 mt-0.5">
              Defina tetos financeiros diários por modelo na organização ({selectedOrgId}) e limites de tokens aplicados pelo AI Gateway antes da execução.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <input
              type="text"
              placeholder="Filtrar modelo ou provedor..."
              value={modelSearch}
              onChange={(e) => setModelSearch(e.target.value)}
              className="bg-slate-900 border border-slate-800 rounded-lg px-2.5 py-1.5 text-white text-xs w-52"
            />
            {canManage && (
              <button
                type="submit"
                disabled={savingModels}
                className="px-3 py-1.5 rounded-lg bg-violet-600 hover:bg-violet-500 text-white font-semibold flex items-center gap-1.5"
              >
                <Save className="w-3.5 h-3.5" />
                {savingModels ? 'Salvando...' : 'Salvar Limites por Modelo'}
              </button>
            )}
          </div>
        </div>

        <div className="overflow-x-auto max-h-64 overflow-y-auto border border-slate-800/80 rounded-lg">
          <table className="w-full text-left border-collapse text-[11px]">
            <thead className="bg-slate-900/90 sticky top-0 text-slate-400 border-b border-slate-800">
              <tr>
                <th className="py-2 px-3">Provedor / Modelo</th>
                <th className="py-2 px-3 text-right">Limite Diário (USD)</th>
                <th className="py-2 px-3 text-right">Limite Diário (Tokens)</th>
                <th className="py-2 px-3 text-right">Max Input Tokens</th>
                <th className="py-2 px-3 text-right">Max Output Tokens</th>
              </tr>
            </thead>
            <tbody>
              {filteredModels.slice(0, 30).map((m) => {
                const mKey = `${m.providerId}/${m.modelId}`;
                const usdVal = orgForm.modelLimitsUsd[mKey] ?? orgForm.modelLimitsUsd[m.modelId] ?? '';
                const tokDraft = modelTokenDrafts[m.id] || {
                  dailyTokenLimit: '',
                  maxInputTokens: '',
                  maxOutputTokens: '',
                };
                return (
                  <tr key={m.id} className="border-b border-slate-900 hover:bg-slate-900/40">
                    <td className="py-1.5 px-3">
                      <div className="font-mono text-white font-semibold">{mKey}</div>
                      <div className="text-[10px] text-slate-400">
                        {m.displayName} • {m.isActive ? 'Ativo' : 'Inativo'}
                      </div>
                    </td>
                    <td className="py-1.5 px-3 text-right">
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        placeholder="Sem teto"
                        disabled={!canManage}
                        value={usdVal}
                        onChange={(e) =>
                          setOrgForm({
                            ...orgForm,
                            modelLimitsUsd: {
                              ...orgForm.modelLimitsUsd,
                              [mKey]: e.target.value,
                            },
                          })
                        }
                        className="w-24 bg-slate-900 border border-slate-700 rounded px-2 py-1 text-right text-white font-mono"
                      />
                    </td>
                    <td className="py-1.5 px-3 text-right">
                      <input
                        type="number"
                        step="1000"
                        min="0"
                        placeholder="Ilimitado"
                        disabled={!canManage}
                        value={tokDraft.dailyTokenLimit}
                        onChange={(e) =>
                          setModelTokenDrafts({
                            ...modelTokenDrafts,
                            [m.id]: { ...tokDraft, dailyTokenLimit: e.target.value },
                          })
                        }
                        className="w-28 bg-slate-900 border border-slate-700 rounded px-2 py-1 text-right text-white font-mono"
                      />
                    </td>
                    <td className="py-1.5 px-3 text-right">
                      <input
                        type="number"
                        step="512"
                        min="0"
                        placeholder="Padrão"
                        disabled={!canManage}
                        value={tokDraft.maxInputTokens}
                        onChange={(e) =>
                          setModelTokenDrafts({
                            ...modelTokenDrafts,
                            [m.id]: { ...tokDraft, maxInputTokens: e.target.value },
                          })
                        }
                        className="w-24 bg-slate-900 border border-slate-700 rounded px-2 py-1 text-right text-white font-mono"
                      />
                    </td>
                    <td className="py-1.5 px-3 text-right">
                      <input
                        type="number"
                        step="256"
                        min="0"
                        placeholder="Padrão"
                        disabled={!canManage}
                        value={tokDraft.maxOutputTokens}
                        onChange={(e) =>
                          setModelTokenDrafts({
                            ...modelTokenDrafts,
                            [m.id]: { ...tokDraft, maxOutputTokens: e.target.value },
                          })
                        }
                        className="w-24 bg-slate-900 border border-slate-700 rounded px-2 py-1 text-right text-white font-mono"
                      />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </form>
      )}

      {/* SEÇÃO: GESTÃO DE MEMÓRIA DE CONVERSAÇÃO, RETENÇÃO & EMBEDDINGS (FASE 3G) */}
      {activeSection === 'memory' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div className="bg-slate-950 border border-slate-800 rounded-xl p-4 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h4 className="font-bold text-white text-xs flex items-center gap-1.5">
                  <Database className="w-4 h-4 text-cyan-400" /> Memória de Conversação & Retenção ({memoryItems.length})
                </h4>
                <p className="text-[11px] text-slate-400 mt-0.5">
                  Inspecione conversas persistidas por organização e aplique limpeza controlada ou política de retenção.
                </p>
              </div>
              <button
                type="button"
                onClick={loadMemoryData}
                className="px-2.5 py-1 rounded bg-slate-900 border border-slate-700 text-slate-300 text-[11px]"
              >
                Atualizar
              </button>
            </div>

            {canManage && (
              <div className="flex flex-wrap items-center gap-2 bg-slate-900/70 border border-slate-800 rounded-lg p-2.5">
                <span className="text-[11px] text-slate-300">Remover conversas com mais de</span>
                <input
                  type="number"
                  min={0}
                  max={365}
                  value={retentionDays}
                  onChange={(e) => setRetentionDays(Number(e.target.value))}
                  className="w-16 bg-slate-950 border border-slate-700 rounded px-2 py-1 text-white font-mono text-xs"
                />
                <span className="text-[11px] text-slate-400">dias</span>
                <button
                  type="button"
                  onClick={handlePruneMemory}
                  className="ml-auto px-3 py-1 rounded bg-amber-600/20 hover:bg-amber-600/30 text-amber-300 border border-amber-500/30 text-[11px] font-semibold"
                >
                  Aplicar Retenção
                </button>
              </div>
            )}

            <div className="space-y-2 max-h-64 overflow-y-auto">
              {memoryItems.length === 0 && (
                <div className="p-4 rounded-lg border border-dashed border-slate-800 text-center text-slate-500 text-[11px]">
                  Nenhuma memória de conversação ativa nesta organização.
                </div>
              )}
              {memoryItems.map((m) => (
                <div key={m.conversationId} className="p-2.5 rounded-lg bg-slate-900 border border-slate-800 flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <div className="font-mono text-white text-[11px] truncate">{m.conversationId}</div>
                    <div className="text-[10px] text-slate-400">
                      {m.department} • {m.messagesCount} mensagens • Atualizado: {String(m.updatedAt || '').slice(0, 16)}
                    </div>
                  </div>
                  {canManage && (
                    <button
                      type="button"
                      onClick={() => handleClearConversation(m.conversationId)}
                      className="px-2 py-1 rounded bg-rose-600/20 hover:bg-rose-600/30 text-rose-300 text-[11px] flex items-center gap-1 shrink-0"
                    >
                      <Trash2 className="w-3 h-3" /> Limpar
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>

          <form onSubmit={handleTestEmbedding} className="bg-slate-950 border border-slate-800 rounded-xl p-4 space-y-3">
            <div>
              <h4 className="font-bold text-white text-xs flex items-center gap-1.5">
                <Layers className="w-4 h-4 text-violet-400" /> Configuração & Validação de Embeddings
              </h4>
              <p className="text-[11px] text-slate-400 mt-0.5">
                Valida o roteamento de embeddings via <code className="text-cyan-400">POST /api/ai/embeddings</code> usando o provedor configurado.
              </p>
            </div>
            <textarea
              rows={3}
              required
              value={embeddingInput}
              onChange={(e) => setEmbeddingInput(e.target.value)}
              className="w-full bg-slate-900 border border-slate-800 rounded-lg p-2.5 text-xs text-white"
              placeholder="Texto para vetorização..."
            />
            <button
              type="submit"
              disabled={testingEmbedding}
              className="px-3.5 py-2 rounded-lg bg-violet-600 hover:bg-violet-500 text-white font-semibold text-xs"
            >
              {testingEmbedding ? 'Gerando Embedding...' : 'Testar Geração de Embedding'}
            </button>
            {embeddingResult && (
              <div className="p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/30 text-[11px] text-emerald-200 space-y-1 font-mono">
                <div>Provedor/Modelo: {embeddingResult.providerId}/{embeddingResult.modelId}</div>
                <div>Dimensões: {embeddingResult.dimensions || embeddingResult.vectors?.[0]?.length || 0}</div>
                <div>Latência: {embeddingResult.latencyMs}ms • Custo: ${Number(embeddingResult.costUsd || 0).toFixed(6)}</div>
              </div>
            )}
          </form>
        </div>
      )}
    </div>
  );
}
