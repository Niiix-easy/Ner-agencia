import React, { useEffect, useState } from 'react';
import { AlertTriangle, CheckCircle2, Crown, ShieldAlert } from 'lucide-react';
import { apiFetch } from '../lib/api';

interface EntitlementsDTO {
  organizationId: string;
  organizationStatus: string;
  subscriptionStatus: string;
  planCode: string;
  planName: string;
  currentPeriodEnd: string | null;
  isEntitled: boolean;
  denialCode: string | null;
  denialReason: string | null;
  limits: {
    users: number;
    landingPages: number;
    sites: number;
    storageGb: number;
  };
  usage: {
    users: number;
    landingPages: number;
    sites: number;
    totalPages: number;
  };
  remaining: {
    users: number;
    landingPages: number;
    sites: number;
  };
  features?: {
    customDomain: boolean;
    multiSite: boolean;
    aiGateway: boolean;
    capiTracking: boolean;
    clientPortal: boolean;
  };
  warnings?: string[];
  upgradeRecommended?: boolean;
}

interface Props {
  activeOrgId: string;
  focus?: 'all' | 'users' | 'pages';
  refreshTrigger?: number;
}

const STATUS_BADGE: Record<string, { label: string; cls: string }> = {
  active: { label: 'Ativo', cls: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30' },
  trialing: { label: 'Trial Ativo', cls: 'bg-cyan-500/15 text-cyan-300 border-cyan-500/30' },
  past_due: { label: 'Inadimplente', cls: 'bg-amber-500/15 text-amber-300 border-amber-500/30' },
  canceled: { label: 'Cancelado', cls: 'bg-rose-500/15 text-rose-300 border-rose-500/30' },
  expired: { label: 'Expirado', cls: 'bg-rose-500/15 text-rose-300 border-rose-500/30' },
  incomplete: { label: 'Aguardando Pagamento', cls: 'bg-amber-500/15 text-amber-300 border-amber-500/30' },
  none: { label: 'Sem Assinatura', cls: 'bg-rose-500/15 text-rose-300 border-rose-500/30' },
};

const FEATURE_LABELS: Record<string, string> = {
  customDomain: 'Domínio Personalizado',
  multiSite: 'Sites Institucionais',
  aiGateway: 'NER AI Gateway',
  capiTracking: 'Tracking CAPI / GA4',
  clientPortal: 'Portal do Cliente',
};

function QuotaBar({ label, used, limit }: { label: string; used: number; limit: number }) {
  const pct = limit > 0 ? Math.min(100, Math.round((used / limit) * 100)) : 100;
  const barColor =
    limit === 0 || used >= limit
      ? 'bg-rose-500'
      : pct >= 80
      ? 'bg-amber-500'
      : 'bg-cyan-500';
  return (
    <div className="bg-slate-950/90 border border-slate-800 rounded-xl p-3 space-y-1.5">
      <div className="flex items-center justify-between text-[11px]">
        <span className="text-slate-400">{label}</span>
        <span className="font-mono text-white">
          {used} / {limit}
        </span>
      </div>
      <div className="w-full h-1.5 bg-slate-800 rounded-full overflow-hidden">
        <div className={`h-full transition-all ${barColor}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

export function PlanEntitlementsBanner({ activeOrgId, focus = 'all', refreshTrigger = 0 }: Props) {
  const [data, setData] = useState<EntitlementsDTO | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    const q = activeOrgId ? `?organizationId=${encodeURIComponent(activeOrgId)}` : '';
    apiFetch<EntitlementsDTO>(`/api/billing/entitlements${q}`)
      .then((res) => {
        if (!cancelled) setData(res);
      })
      .catch(() => {
        if (!cancelled) setData(null);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [activeOrgId, refreshTrigger]);

  if (loading || !data) return null;

  const badge = STATUS_BADGE[data.subscriptionStatus] || STATUS_BADGE.none;
  const warnings = data.warnings || [];
  const enabledFeatures = Object.entries(data.features || {}).filter(([, v]) => v);

  return (
    <div
      className={`rounded-2xl border p-4 space-y-3 ${
        !data.isEntitled
          ? 'bg-rose-950/20 border-rose-500/40'
          : warnings.length > 0
          ? 'bg-amber-950/15 border-amber-500/35'
          : 'bg-slate-900/60 border-slate-800'
      }`}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Crown className="w-4 h-4 text-cyan-400" />
          <span className="text-xs font-bold text-white">
            Plano Contratado: {data.planName}
          </span>
          <span className="text-[10px] font-mono text-slate-400">({data.planCode})</span>
        </div>
        <div className="flex items-center gap-2">
          {data.organizationStatus === 'Suspenso' && (
            <span className="text-[10px] px-2 py-0.5 rounded-full border bg-rose-500/20 text-rose-300 border-rose-500/40 font-mono">
              Organização Suspensa
            </span>
          )}
          <span className={`text-[10px] px-2.5 py-0.5 rounded-full border font-mono ${badge.cls}`}>
            {badge.label}
          </span>
        </div>
      </div>

      <div
        className={`grid gap-2.5 ${
          focus === 'users'
            ? 'grid-cols-1 md:grid-cols-2'
            : focus === 'pages'
            ? 'grid-cols-1 md:grid-cols-2'
            : 'grid-cols-2 md:grid-cols-4'
        }`}
      >
        {(focus === 'all' || focus === 'users') && (
          <QuotaBar label="Usuários Ativos" used={data.usage.users} limit={data.limits.users} />
        )}
        {(focus === 'all' || focus === 'pages') && (
          <QuotaBar
            label="Landing Pages Ativas"
            used={data.usage.landingPages}
            limit={data.limits.landingPages}
          />
        )}
        {(focus === 'all' || focus === 'pages') && (
          <QuotaBar label="Sites Ativos" used={data.usage.sites} limit={data.limits.sites} />
        )}
        {focus === 'all' && (
          <div className="bg-slate-950/90 border border-slate-800 rounded-xl p-3 space-y-1">
            <div className="flex items-center justify-between text-[11px]">
              <span className="text-slate-400">Storage Contratado</span>
              <span className="font-mono text-cyan-300">{data.limits.storageGb} GB</span>
            </div>
            <div className="text-[10px] text-slate-500">
              {data.currentPeriodEnd
                ? `Ciclo até ${new Date(data.currentPeriodEnd).toLocaleDateString('pt-BR')}`
                : 'Sem ciclo ativo'}
            </div>
          </div>
        )}
      </div>

      {focus === 'all' && enabledFeatures.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
          <span className="text-slate-400 mr-1">Recursos habilitados:</span>
          {enabledFeatures.map(([key]) => (
            <span
              key={key}
              className="px-2 py-0.5 rounded bg-slate-950 border border-slate-800 text-slate-200 flex items-center gap-1"
            >
              <CheckCircle2 className="w-3 h-3 text-emerald-400" />
              {FEATURE_LABELS[key] || key}
            </span>
          ))}
        </div>
      )}

      {(!data.isEntitled || warnings.length > 0) && (
        <div
          className={`p-3 rounded-xl border text-xs flex items-start gap-2 ${
            !data.isEntitled
              ? 'bg-rose-500/10 border-rose-500/30 text-rose-200'
              : 'bg-amber-500/10 border-amber-500/30 text-amber-200'
          }`}
        >
          {!data.isEntitled ? (
            <ShieldAlert className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
          ) : (
            <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
          )}
          <div className="space-y-0.5">
            {warnings.map((w, idx) => (
              <div key={idx}>{w}</div>
            ))}
            <div className="text-[11px] opacity-85">
              Para expandir limites ou regularizar a assinatura, acesse{' '}
              <strong>Operações & Billing → Assinatura SaaS Stripe</strong> e faça upgrade do plano.
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
