import React, { useCallback, useEffect, useState } from 'react';
import {
  AlertTriangle,
  Building2,
  Cpu,
  Globe,
  Layers,
  RefreshCw,
  Save,
  ShieldAlert,
  ShieldCheck,
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
  const [selectedOrgId, setSelectedOrgId] = useState<string>(activeOrgId);
  const [orgs, setOrgs] = useState<{ id: string; name: string }[]>([]);
  const [models, setModels] = useState<any[]>([]);
  const [modelSearch, setModelSearch] = useState('');
  const [snapshot, setSnapshot] = useState<any>(null);
  const [loadingSnapshot, setLoadingSnapshot] = useState(false);
  const [savingGlobal, setSavingGlobal] = useState(false);
  const [savingOrg, setSavingOrg] = useState(false);
  const [savingModels, setSavingModels] = useState(false);

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

  const deptStatus: any[] = snapshot?.departmentStatus || [];
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

      {/* Monitoramento Preventivo em Tempo Real */}
      {snapshot && (
        <div className="space-y-3">
          <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
            Monitoramento Preventivo em Tempo Real (Marcos 50% / 75% / 90% / 100%)
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

      {/* Gestão Dedicada de Alertas de Limiares (50%, 75%, 90%, 100%) */}
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

      {/* Formulários de Limites */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-5 pt-2">
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
            <div className="text-[11px] font-semibold text-slate-300 flex items-center gap-1.5">
              <Layers className="w-3.5 h-3.5 text-violet-400" />
              Limites Diários por Departamento (USD/dia — deixe vazio para herdar apenas o teto da organização)
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
              {DEPT_LIST.map((dept) => (
                <label
                  key={dept}
                  className="flex items-center justify-between gap-2 bg-slate-900/80 border border-slate-800 rounded-lg px-2.5 py-1.5"
                >
                  <span className="text-slate-200 truncate">{dept}</span>
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
              ))}
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

      {/* 3. Limites Específicos por Modelo (USD/dia & Tokens) */}
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

      {/* Visão Consolidada por Organização (Super Admin) */}
      {isSuperAdmin && orgSummaryList.length > 0 && (
        <div className="bg-slate-950 border border-slate-800 rounded-xl p-4 space-y-2.5">
          <div className="flex items-center justify-between">
            <h4 className="font-bold text-white text-xs flex items-center gap-1.5">
              <AlertTriangle className="w-4 h-4 text-amber-400" />
              Resumo Multi-Organização (Consumo vs Limites)
            </h4>
            <span className="text-[11px] text-slate-400">Clique em uma linha para editar seus tetos</span>
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
              <tbody>
                {orgSummaryList.map((orgRow) => (
                  <tr
                    key={orgRow.organizationId}
                    onClick={() => setSelectedOrgId(orgRow.organizationId)}
                    className={`border-b border-slate-900 cursor-pointer hover:bg-slate-900/70 ${
                      selectedOrgId === orgRow.organizationId ? 'bg-cyan-500/10' : ''
                    }`}
                  >
                    <td className="py-2 pr-3 font-semibold text-white">
                      {orgRow.organizationName}{' '}
                      <span className="text-slate-500 font-mono">({orgRow.organizationId})</span>
                    </td>
                    <td className="py-2 px-3 font-mono text-slate-200">
                      ${Number(orgRow.dailySpentUsd || 0).toFixed(4)}
                    </td>
                    <td className="py-2 px-3 font-mono text-cyan-300">
                      ${Number(orgRow.dailyLimitUsd || 0).toFixed(2)}
                    </td>
                    <td className="py-2 px-3 font-mono text-slate-200">
                      ${Number(orgRow.monthlySpentUsd || 0).toFixed(4)}
                    </td>
                    <td className="py-2 px-3 font-mono text-cyan-300">
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
  );
}
