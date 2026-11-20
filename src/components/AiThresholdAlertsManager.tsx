import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  Bell,
  BellOff,
  Building2,
  CheckCircle2,
  Globe,
  Mail,
  RotateCcw,
  Save,
  ScrollText,
  ShieldAlert,
  SlidersHorizontal,
  Webhook,
} from 'lucide-react';
import { apiFetch } from '../lib/api';

export type ThresholdMark = 50 | 75 | 90 | 100;
export type AlertSeverity = 'info' | 'warning' | 'critical';
export type AlertChannel = 'dashboard' | 'audit_log' | 'email_admin' | 'webhook';
export type AlertGatewayAction =
  | 'notify'
  | 'fallback_economical'
  | 'block_non_essential'
  | 'block_all';

export interface ThresholdAlertRule {
  thresholdPct: ThresholdMark;
  enabled: boolean;
  severity: AlertSeverity;
  channels: AlertChannel[];
  action: AlertGatewayAction;
  customMessage?: string;
}

interface AiThresholdAlertsManagerProps {
  snapshot: any;
  selectedOrgId: string;
  isAdmin: boolean;
  canManage: boolean;
  onSaved: () => Promise<void> | void;
  onNotify: (msg: string, isError?: boolean) => void;
}

const MARKS: ThresholdMark[] = [50, 75, 90, 100];

const DEFAULT_RULES: ThresholdAlertRule[] = [
  {
    thresholdPct: 50,
    enabled: true,
    severity: 'info',
    channels: ['dashboard'],
    action: 'notify',
    customMessage: '',
  },
  {
    thresholdPct: 75,
    enabled: true,
    severity: 'warning',
    channels: ['dashboard', 'audit_log'],
    action: 'notify',
    customMessage: '',
  },
  {
    thresholdPct: 90,
    enabled: true,
    severity: 'warning',
    channels: ['dashboard', 'audit_log', 'email_admin'],
    action: 'notify',
    customMessage: '',
  },
  {
    thresholdPct: 100,
    enabled: true,
    severity: 'critical',
    channels: ['dashboard', 'audit_log', 'email_admin', 'webhook'],
    action: 'block_non_essential',
    customMessage: '',
  },
];

const MARK_VISUAL: Record<
  ThresholdMark,
  {
    title: string;
    subtitle: string;
    accentBorder: string;
    pillClass: string;
    barClass: string;
  }
> = {
  50: {
    title: 'Marco 50% — Alerta Inicial',
    subtitle: 'Sinalização preventiva de metade do orçamento consumido.',
    accentBorder: 'border-cyan-500/40',
    pillClass: 'bg-cyan-500/15 text-cyan-200 border-cyan-500/40',
    barClass: 'bg-cyan-500',
  },
  75: {
    title: 'Marco 75% — Atenção Moderada',
    subtitle: 'Acompanhamento próximo do ritmo de consumo para evitar estouros.',
    accentBorder: 'border-amber-500/40',
    pillClass: 'bg-amber-500/15 text-amber-200 border-amber-500/40',
    barClass: 'bg-amber-400',
  },
  90: {
    title: 'Marco 90% — Risco Iminente',
    subtitle: 'Escalonamento para gestores antes do bloqueio ou downgrade automático.',
    accentBorder: 'border-orange-500/45',
    pillClass: 'bg-orange-500/15 text-orange-200 border-orange-500/40',
    barClass: 'bg-orange-500',
  },
  100: {
    title: 'Marco 100% — Limite Atingido',
    subtitle: 'Ação de proteção financeira aplicada pelo AI Gateway.',
    accentBorder: 'border-rose-500/50',
    pillClass: 'bg-rose-500/15 text-rose-200 border-rose-500/45',
    barClass: 'bg-rose-500',
  },
};

const CHANNEL_META: { id: AlertChannel; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { id: 'dashboard', label: 'Painel AI Center', icon: Bell },
  { id: 'audit_log', label: 'Log de Auditoria', icon: ScrollText },
  { id: 'email_admin', label: 'E-mail Admin', icon: Mail },
  { id: 'webhook', label: 'Webhook / n8n', icon: Webhook },
];

const SEVERITY_LABELS: Record<AlertSeverity, string> = {
  info: 'Informativo (Info)',
  warning: 'Atenção (Warning)',
  critical: 'Crítico (Critical)',
};

const ACTION_LABELS: Record<AlertGatewayAction, string> = {
  notify: 'Apenas notificar',
  fallback_economical: 'Downgrade para modelo econômico',
  block_non_essential: 'Bloquear chamadas não-críticas',
  block_all: 'Bloquear 100% das chamadas',
};

function hydrateRules(policy: any): ThresholdAlertRule[] {
  const rawList: any[] = Array.isArray(policy?.thresholdRules) ? policy.thresholdRules : [];
  const enabledThresholds: number[] = Array.isArray(policy?.alertThresholds)
    ? policy.alertThresholds
    : [50, 75, 90, 100];
  const fallbackAction: AlertGatewayAction =
    policy?.onExceedAction === 'notify' ||
    policy?.onExceedAction === 'fallback_economical' ||
    policy?.onExceedAction === 'block_non_essential' ||
    policy?.onExceedAction === 'block_all'
      ? policy.onExceedAction
      : 'block_non_essential';

  return MARKS.map((mark) => {
    const def = DEFAULT_RULES.find((d) => d.thresholdPct === mark)!;
    const found = rawList.find((r) => Number(r?.thresholdPct) === mark);
    return {
      thresholdPct: mark,
      enabled: typeof found?.enabled === 'boolean' ? found.enabled : enabledThresholds.includes(mark),
      severity:
        found?.severity === 'info' || found?.severity === 'warning' || found?.severity === 'critical'
          ? found.severity
          : def.severity,
      channels:
        Array.isArray(found?.channels) && found.channels.length > 0
          ? found.channels
          : [...def.channels],
      action:
        found?.action === 'notify' ||
        found?.action === 'fallback_economical' ||
        found?.action === 'block_non_essential' ||
        found?.action === 'block_all'
          ? found.action
          : mark === 100
            ? fallbackAction
            : def.action,
      customMessage: typeof found?.customMessage === 'string' ? found.customMessage : '',
    };
  });
}

export function AiThresholdAlertsManager({
  snapshot,
  selectedOrgId,
  isAdmin,
  canManage,
  onSaved,
  onNotify,
}: AiThresholdAlertsManagerProps) {
  const [scope, setScope] = useState<'organization' | 'global'>('organization');
  const [orgRules, setOrgRules] = useState<ThresholdAlertRule[]>(() => hydrateRules(snapshot?.organizationPolicy));
  const [globalRules, setGlobalRules] = useState<ThresholdAlertRule[]>(() => hydrateRules(snapshot?.globalPolicy));
  const [simulatedPct, setSimulatedPct] = useState<number>(78);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (snapshot?.organizationPolicy) {
      setOrgRules(hydrateRules(snapshot.organizationPolicy));
    }
    if (snapshot?.globalPolicy) {
      setGlobalRules(hydrateRules(snapshot.globalPolicy));
    }
  }, [snapshot]);

  const activeRules = scope === 'global' ? globalRules : orgRules;
  const setActiveRules = scope === 'global' ? setGlobalRules : setOrgRules;
  const editable = scope === 'global' ? isAdmin : canManage;

  const activePolicy = scope === 'global' ? snapshot?.globalPolicy : snapshot?.organizationPolicy;
  const dailyLimitUsd = Number(activePolicy?.dailyLimitUsd || 0);
  const monthlyLimitUsd = Number(activePolicy?.monthlyLimitUsd || 0);

  const liveTriggeredByMark = useMemo(() => {
    const alerts: any[] = Array.isArray(snapshot?.activeAlerts) ? snapshot.activeAlerts : [];
    const map = new Map<number, number>();
    for (const al of alerts) {
      const isGlobalAlert = String(al.scope || '').startsWith('global_');
      if (scope === 'global' && !isGlobalAlert) continue;
      if (scope === 'organization' && isGlobalAlert) continue;
      const pct = Number(al.thresholdPct);
      map.set(pct, (map.get(pct) || 0) + 1);
    }
    return map;
  }, [snapshot, scope]);

  const updateRule = (mark: ThresholdMark, patch: Partial<ThresholdAlertRule>) => {
    setActiveRules((prev) =>
      prev.map((rule) => {
        if (rule.thresholdPct !== mark) return rule;
        if (patch.enabled === false) {
          const otherEnabled = prev.filter((r) => r.thresholdPct !== mark && r.enabled).length;
          if (otherEnabled === 0) {
            onNotify('Mantenha pelo menos um limiar de alerta (50%, 75%, 90% ou 100%) ativo.', true);
            return rule;
          }
        }
        return { ...rule, ...patch };
      })
    );
  };

  const toggleChannel = (mark: ThresholdMark, channel: AlertChannel) => {
    setActiveRules((prev) =>
      prev.map((rule) => {
        if (rule.thresholdPct !== mark) return rule;
        const exists = rule.channels.includes(channel);
        if (exists && rule.channels.length <= 1) return rule;
        const nextChannels = exists
          ? rule.channels.filter((c) => c !== channel)
          : [...rule.channels, channel];
        return { ...rule, channels: nextChannels };
      })
    );
  };

  const handleRestoreDefaults = () => {
    setActiveRules(DEFAULT_RULES.map((r) => ({ ...r, channels: [...r.channels] })));
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const enabledThresholds = activeRules.filter((r) => r.enabled).map((r) => r.thresholdPct);
      const rule100 = activeRules.find((r) => r.thresholdPct === 100);
      if (scope === 'global') {
        await apiFetch('/api/ai/global-cost-policy', {
          method: 'PUT',
          body: JSON.stringify({
            alertThresholds: enabledThresholds,
            thresholdRules: activeRules,
            ...(rule100 ? { onExceedAction: rule100.action } : {}),
          }),
        });
        onNotify('Regras de alertas de limiares (50% / 75% / 90% / 100%) globais salvas no AI Gateway.');
      } else {
        await apiFetch('/api/ai/cost-policy', {
          method: 'PUT',
          body: JSON.stringify({
            organizationId: selectedOrgId,
            alertThresholds: enabledThresholds,
            thresholdRules: activeRules,
            ...(rule100
              ? { onExceedAction: rule100.action, blockOnExceed: rule100.action !== 'notify' }
              : {}),
          }),
        });
        onNotify(
          `Regras de alertas de limiares (50% / 75% / 90% / 100%) da organização (${selectedOrgId}) atualizadas.`
        );
      }
      await onSaved();
    } catch (err: any) {
      onNotify(err?.message || 'Erro ao salvar regras de alerta de limiares.', true);
    } finally {
      setSaving(false);
    }
  };

  const simulatedMatch = useMemo(() => {
    const enabledSorted = activeRules
      .filter((r) => r.enabled)
      .sort((a, b) => a.thresholdPct - b.thresholdPct);
    const hit = enabledSorted.filter((r) => simulatedPct >= r.thresholdPct).pop();
    if (hit) return hit;
    if (simulatedPct >= 100) return activeRules.find((r) => r.thresholdPct === 100) || null;
    return null;
  }, [activeRules, simulatedPct]);

  const enabledCount = activeRules.filter((r) => r.enabled).length;

  return (
    <div className="bg-slate-950 border border-slate-800 rounded-xl p-4 space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-800 pb-3">
        <div>
          <h4 className="font-bold text-white text-sm flex items-center gap-2">
            <Bell className="w-4 h-4 text-amber-400" />
            Gestão de Alertas de Limiares (50% • 75% • 90% • 100%)
          </h4>
          <p className="text-[11px] text-slate-400 mt-1">
            Configure severidade, canais de notificação, mensagem personalizada e ação preventiva do AI Gateway para cada marco de consumo.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="inline-flex rounded-lg bg-slate-900 border border-slate-800 p-0.5">
            <button
              type="button"
              onClick={() => setScope('organization')}
              className={`px-2.5 py-1.5 rounded-md text-[11px] font-semibold flex items-center gap-1.5 transition-colors ${
                scope === 'organization'
                  ? 'bg-emerald-600/25 text-emerald-200 border border-emerald-500/40'
                  : 'text-slate-400 hover:text-white border border-transparent'
              }`}
            >
              <Building2 className="w-3.5 h-3.5" />
              Org / Dept / Modelos ({selectedOrgId})
            </button>
            <button
              type="button"
              onClick={() => setScope('global')}
              className={`px-2.5 py-1.5 rounded-md text-[11px] font-semibold flex items-center gap-1.5 transition-colors ${
                scope === 'global'
                  ? 'bg-cyan-600/25 text-cyan-200 border border-cyan-500/40'
                  : 'text-slate-400 hover:text-white border border-transparent'
              }`}
            >
              <Globe className="w-3.5 h-3.5" />
              Global (Plataforma)
            </button>
          </div>

          {editable && (
            <>
              <button
                type="button"
                onClick={handleRestoreDefaults}
                className="px-2.5 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 border border-slate-700 text-slate-300 text-[11px] font-medium flex items-center gap-1.5"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                Padrão
              </button>
              <button
                type="button"
                onClick={handleSave}
                disabled={saving}
                className="px-3.5 py-1.5 rounded-lg bg-amber-600 hover:bg-amber-500 disabled:opacity-60 text-white text-[11px] font-semibold flex items-center gap-1.5"
              >
                <Save className="w-3.5 h-3.5" />
                {saving ? 'Salvando Alertas...' : 'Salvar Regras de Alerta'}
              </button>
            </>
          )}
        </div>
      </div>

      {/* Resumo de Escopo & Status */}
      <div className="flex flex-wrap items-center justify-between gap-2 bg-slate-900/60 border border-slate-800 rounded-lg px-3 py-2 text-[11px]">
        <div className="flex flex-wrap items-center gap-3 text-slate-300">
          <span>
            Marcos ativos:{' '}
            <strong className="font-mono text-white">{enabledCount}/4</strong>
          </span>
          <span className="text-slate-600">|</span>
          <span>
            Teto Diário:{' '}
            <strong className="font-mono text-cyan-300">
              {dailyLimitUsd > 0 ? `$${dailyLimitUsd.toFixed(2)}` : 'Desativado ($0)'}
            </strong>
          </span>
          <span className="text-slate-600">|</span>
          <span>
            Teto Mensal:{' '}
            <strong className="font-mono text-cyan-300">
              {monthlyLimitUsd > 0 ? `$${monthlyLimitUsd.toFixed(2)}` : 'Desativado ($0)'}
            </strong>
          </span>
        </div>
        {!editable && (
          <span className="text-[10px] text-amber-300 bg-amber-500/10 border border-amber-500/30 px-2 py-0.5 rounded">
            {scope === 'global' ? 'Somente Administradores podem editar alertas globais' : 'Somente leitura'}
          </span>
        )}
      </div>

      {/* 4 Cards de Limiares: 50%, 75%, 90%, 100% */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        {activeRules.map((rule) => {
          const visual = MARK_VISUAL[rule.thresholdPct];
          const liveHits = liveTriggeredByMark.get(rule.thresholdPct) || 0;
          const dailyTriggerUsd = dailyLimitUsd > 0 ? (dailyLimitUsd * rule.thresholdPct) / 100 : null;
          const monthlyTriggerUsd = monthlyLimitUsd > 0 ? (monthlyLimitUsd * rule.thresholdPct) / 100 : null;

          return (
            <div
              key={`${scope}-${rule.thresholdPct}`}
              className={`rounded-xl border p-3.5 space-y-3 transition-opacity ${
                rule.enabled
                  ? `bg-slate-900/70 ${visual.accentBorder}`
                  : 'bg-slate-950/60 border-slate-800/70 opacity-65'
              }`}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="space-y-0.5">
                  <div className="flex flex-wrap items-center gap-2">
                    <span
                      className={`text-[11px] font-mono font-bold px-2 py-0.5 rounded border ${visual.pillClass}`}
                    >
                      {rule.thresholdPct}%
                    </span>
                    <span className="font-bold text-white text-xs">{visual.title}</span>
                    {liveHits > 0 && (
                      <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-rose-500/20 border border-rose-500/40 text-rose-200 flex items-center gap-1">
                        <AlertTriangle className="w-3 h-3" />
                        {liveHits} ativo{liveHits > 1 ? 's' : ''} agora
                      </span>
                    )}
                  </div>
                  <p className="text-[11px] text-slate-400">{visual.subtitle}</p>
                </div>

                <button
                  type="button"
                  disabled={!editable}
                  aria-label={`Alternar alerta ${rule.thresholdPct}%`}
                  onClick={() => updateRule(rule.thresholdPct, { enabled: !rule.enabled })}
                  className={`shrink-0 px-2.5 py-1 rounded-lg border text-[11px] font-semibold flex items-center gap-1.5 transition-colors ${
                    rule.enabled
                      ? 'bg-emerald-500/15 border-emerald-500/40 text-emerald-200 hover:bg-emerald-500/25'
                      : 'bg-slate-900 border-slate-700 text-slate-400 hover:text-slate-200'
                  }`}
                >
                  {rule.enabled ? (
                    <>
                      <Bell className="w-3 h-3" /> Ativo
                    </>
                  ) : (
                    <>
                      <BellOff className="w-3 h-3" /> Pausado
                    </>
                  )}
                </button>
              </div>

              {/* Valores de gatilho calculados */}
              <div className="flex flex-wrap items-center gap-3 text-[11px] font-mono bg-slate-950/80 border border-slate-800/80 rounded-lg px-2.5 py-1.5 text-slate-300">
                <span>
                  Gatilho Diário:{' '}
                  <strong className="text-white">
                    {dailyTriggerUsd !== null ? `$${dailyTriggerUsd.toFixed(2)}` : '—'}
                  </strong>
                </span>
                <span className="text-slate-700">•</span>
                <span>
                  Gatilho Mensal:{' '}
                  <strong className="text-white">
                    {monthlyTriggerUsd !== null ? `$${monthlyTriggerUsd.toFixed(2)}` : '—'}
                  </strong>
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                <label className="space-y-1">
                  <span className="text-[11px] text-slate-400">Severidade do Alerta</span>
                  <select
                    disabled={!editable || !rule.enabled}
                    value={rule.severity}
                    onChange={(e) =>
                      updateRule(rule.thresholdPct, { severity: e.target.value as AlertSeverity })
                    }
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1.5 text-white text-[11px]"
                  >
                    <option value="info">{SEVERITY_LABELS.info}</option>
                    <option value="warning">{SEVERITY_LABELS.warning}</option>
                    <option value="critical">{SEVERITY_LABELS.critical}</option>
                  </select>
                </label>

                <label className="space-y-1">
                  <span className="text-[11px] text-slate-400">Ação Preventiva no Gateway</span>
                  <select
                    disabled={!editable || !rule.enabled}
                    value={rule.action}
                    onChange={(e) =>
                      updateRule(rule.thresholdPct, { action: e.target.value as AlertGatewayAction })
                    }
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1.5 text-white text-[11px]"
                  >
                    <option value="notify">{ACTION_LABELS.notify}</option>
                    <option value="fallback_economical">{ACTION_LABELS.fallback_economical}</option>
                    <option value="block_non_essential">{ACTION_LABELS.block_non_essential}</option>
                    <option value="block_all">{ACTION_LABELS.block_all}</option>
                  </select>
                </label>
              </div>

              {/* Canais de notificação */}
              <div className="space-y-1.5">
                <span className="text-[11px] text-slate-400 block">Canais de Notificação</span>
                <div className="grid grid-cols-2 gap-1.5">
                  {CHANNEL_META.map(({ id, label, icon: Icon }) => {
                    const selected = rule.channels.includes(id);
                    return (
                      <button
                        key={id}
                        type="button"
                        disabled={!editable || !rule.enabled}
                        onClick={() => toggleChannel(rule.thresholdPct, id)}
                        className={`px-2 py-1.5 rounded-lg border text-[11px] flex items-center gap-1.5 transition-colors ${
                          selected
                            ? 'bg-cyan-500/15 border-cyan-500/40 text-cyan-100'
                            : 'bg-slate-950 border-slate-800 text-slate-500 hover:text-slate-300'
                        }`}
                      >
                        <Icon className="w-3 h-3 shrink-0" />
                        <span className="truncate">{label}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Mensagem customizada */}
              <label className="block space-y-1">
                <span className="text-[11px] text-slate-400">
                  Mensagem Personalizada do Alerta (opcional)
                </span>
                <input
                  type="text"
                  maxLength={220}
                  disabled={!editable || !rule.enabled}
                  value={rule.customMessage || ''}
                  onChange={(e) =>
                    updateRule(rule.thresholdPct, { customMessage: e.target.value })
                  }
                  placeholder={`Ex.: Consumo atingiu ${rule.thresholdPct}% do limite — revisar uso de IA`}
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1.5 text-white text-[11px] placeholder:text-slate-600"
                />
              </label>
            </div>
          );
        })}
      </div>

      {/* Simulador Interativo de Disparo Preventivo */}
      <div className="bg-slate-900/70 border border-slate-800 rounded-xl p-3.5 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-1.5 text-xs font-bold text-white">
            <SlidersHorizontal className="w-3.5 h-3.5 text-cyan-400" />
            Simulador de Disparo de Limiares (Preview em Tempo Real)
          </div>
          <div className="flex items-center gap-1">
            {[40, 50, 75, 90, 100, 110].map((preset) => (
              <button
                key={preset}
                type="button"
                onClick={() => setSimulatedPct(preset)}
                className={`px-2 py-0.5 rounded font-mono text-[10px] border ${
                  simulatedPct === preset
                    ? 'bg-cyan-500/20 border-cyan-500/50 text-cyan-200'
                    : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-white'
                }`}
              >
                {preset}%
              </button>
            ))}
          </div>
        </div>

        <div className="space-y-1.5">
          <div className="flex items-center justify-between text-[11px]">
            <span className="text-slate-400">Consumo simulado sobre o teto configurado</span>
            <span className="font-mono font-bold text-white">
              {simulatedPct}%
              {dailyLimitUsd > 0 && (
                <span className="text-slate-400 font-normal">
                  {' '}
                  (${((dailyLimitUsd * simulatedPct) / 100).toFixed(2)}/dia)
                </span>
              )}
            </span>
          </div>
          <input
            type="range"
            min={0}
            max={115}
            step={1}
            aria-label="Simular percentual de consumo"
            value={simulatedPct}
            onChange={(e) => setSimulatedPct(Number(e.target.value))}
            className="w-full accent-cyan-500 cursor-pointer"
          />
          <div className="relative h-2 w-full rounded-full bg-slate-950 border border-slate-800 overflow-hidden">
            <div
              className={`h-full transition-all duration-150 ${
                simulatedMatch
                  ? MARK_VISUAL[simulatedMatch.thresholdPct].barClass
                  : 'bg-emerald-500'
              }`}
              style={{ width: `${Math.min(100, simulatedPct)}%` }}
            />
            {[50, 75, 90].map((mark) => (
              <div
                key={mark}
                className="absolute top-0 bottom-0 w-px bg-slate-500/70"
                style={{ left: `${mark}%` }}
              />
            ))}
          </div>
        </div>

        {simulatedMatch ? (
          <div
            className={`rounded-lg border px-3 py-2.5 flex flex-wrap items-center justify-between gap-2 text-[11px] ${
              simulatedMatch.severity === 'critical'
                ? 'bg-rose-500/10 border-rose-500/40 text-rose-100'
                : simulatedMatch.severity === 'warning'
                  ? 'bg-amber-500/10 border-amber-500/40 text-amber-100'
                  : 'bg-cyan-500/10 border-cyan-500/40 text-cyan-100'
            }`}
          >
            <div className="space-y-0.5 min-w-0">
              <div className="font-semibold flex items-center gap-1.5">
                <ShieldAlert className="w-3.5 h-3.5 shrink-0" />
                Dispara Marco {simulatedMatch.thresholdPct}% • {SEVERITY_LABELS[simulatedMatch.severity]} •{' '}
                {ACTION_LABELS[simulatedMatch.action]}
              </div>
              <div className="text-[11px] opacity-90 truncate">
                {simulatedMatch.customMessage?.trim()
                  ? simulatedMatch.customMessage
                  : `Alerta padrão do AI Gateway: consumo atingiu ${simulatedPct}% (marco ${simulatedMatch.thresholdPct}%).`}
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-1">
              {simulatedMatch.channels.map((ch) => {
                const label = CHANNEL_META.find((m) => m.id === ch)?.label || ch;
                return (
                  <span
                    key={ch}
                    className="px-2 py-0.5 rounded bg-slate-950/70 border border-current/25 text-[10px] font-mono"
                  >
                    {label}
                  </span>
                );
              })}
            </div>
          </div>
        ) : (
          <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-[11px] text-emerald-200 flex items-center gap-2">
            <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
            Nenhum alerta disparado em {simulatedPct}% — consumo dentro da faixa saudável.
          </div>
        )}
      </div>
    </div>
  );
}
