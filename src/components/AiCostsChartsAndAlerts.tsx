import React, { useMemo, useState } from 'react';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ComposedChart,
  Legend,
  Line,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import {
  Activity,
  AlertTriangle,
  Calendar,
  Cpu,
  DollarSign,
  Layers,
  RotateCcw,
  Server,
  ShieldAlert,
  TrendingUp,
} from 'lucide-react';
import type { CostFilterState } from './AiCenterViews';

const CHART_PALETTE = [
  '#06b6d4', // cyan-500
  '#10b981', // emerald-500
  '#8b5cf6', // violet-500
  '#f59e0b', // amber-500
  '#ec4899', // pink-500
  '#3b82f6', // blue-500
  '#f97316', // orange-500
  '#14b8a6', // teal-500
];

const THRESHOLD_MARKS = [50, 75, 90, 100] as const;

function getThresholdVisual(pct: number) {
  if (pct >= 100) {
    return {
      barClass: 'bg-rose-500',
      projBarClass: 'bg-rose-500/45',
      badgeClass: 'bg-rose-500/20 text-rose-200 border-rose-500/40',
      textClass: 'text-rose-300',
      label: '100%+ Crítico',
      milestone: 100,
    };
  }
  if (pct >= 90) {
    return {
      barClass: 'bg-orange-500',
      projBarClass: 'bg-orange-500/45',
      badgeClass: 'bg-orange-500/20 text-orange-200 border-orange-500/40',
      textClass: 'text-orange-300',
      label: 'Marco 90%',
      milestone: 90,
    };
  }
  if (pct >= 75) {
    return {
      barClass: 'bg-amber-400',
      projBarClass: 'bg-amber-400/45',
      badgeClass: 'bg-amber-500/20 text-amber-200 border-amber-500/40',
      textClass: 'text-amber-300',
      label: 'Marco 75%',
      milestone: 75,
    };
  }
  if (pct >= 50) {
    return {
      barClass: 'bg-cyan-500',
      projBarClass: 'bg-cyan-500/45',
      badgeClass: 'bg-cyan-500/20 text-cyan-200 border-cyan-500/40',
      textClass: 'text-cyan-300',
      label: 'Marco 50%',
      milestone: 50,
    };
  }
  return {
    barClass: 'bg-emerald-500',
    projBarClass: 'bg-emerald-500/35',
    badgeClass: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30',
    textClass: 'text-emerald-300',
    label: 'Normal (<50%)',
    milestone: 0,
  };
}

function fmtUsd(val: number): string {
  return `$${val.toFixed(4)}`;
}

function fmtBrl(val: number): string {
  return `R$ ${val.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function fmtCompactTokens(val: number): string {
  if (val >= 1_000_000) return `${(val / 1_000_000).toFixed(1)}M`;
  if (val >= 1_000) return `${(val / 1_000).toFixed(1)}k`;
  return String(val);
}

interface ThresholdProgressRowProps {
  title: string;
  subtitle: string;
  actualUsd: number;
  projectedUsd: number;
  limitUsd: number;
  exchangeRate: number;
  activeThresholds?: number[];
}

function ThresholdProgressRow({
  title,
  subtitle,
  actualUsd,
  projectedUsd,
  limitUsd,
  exchangeRate,
  activeThresholds = [50, 75, 90, 100],
}: ThresholdProgressRowProps) {
  const actualPct = limitUsd > 0 ? Number(((actualUsd / limitUsd) * 100).toFixed(1)) : 0;
  const projectedPct = limitUsd > 0 ? Number(((projectedUsd / limitUsd) * 100).toFixed(1)) : 0;
  const effectivePct = Math.max(actualPct, projectedPct);
  const actualStyle = getThresholdVisual(actualPct);
  const projStyle = getThresholdVisual(projectedPct);
  const activeStyle = getThresholdVisual(effectivePct);
  const deltaUsd = limitUsd > 0 ? Number((limitUsd - projectedUsd).toFixed(4)) : 0;

  return (
    <div className="bg-slate-950 border border-slate-800 rounded-xl p-4 space-y-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="text-xs font-bold text-white truncate">{title}</div>
          <div className="text-[11px] text-slate-400">{subtitle}</div>
        </div>
        <div className="text-right text-[11px] font-mono tabular-nums shrink-0">
          <span className={`font-semibold ${projStyle.textClass}`}>
            Proj. {projectedPct}% · {projStyle.label}
          </span>
          <div className="text-slate-400">Real: {actualPct}%</div>
        </div>
      </div>

      {/* Valores Real vs Projetado vs Limite + Saldo/Excesso */}
      <div className="grid grid-cols-3 gap-2 text-xs font-mono tabular-nums">
        <div className="bg-slate-900/70 border border-slate-800/80 rounded-lg px-2.5 py-2">
          <div className="text-[10px] text-slate-400 font-sans">Consumo Real</div>
          <div className="text-white font-bold">{fmtUsd(actualUsd)}</div>
          <div className="text-[10px] text-slate-400">{fmtBrl(actualUsd * exchangeRate)}</div>
        </div>
        <div className="bg-slate-900/70 border border-slate-800/80 rounded-lg px-2.5 py-2">
          <div className="text-[10px] text-slate-400 font-sans">Custo Projetado</div>
          <div className={`font-bold ${projStyle.textClass}`}>{fmtUsd(projectedUsd)}</div>
          <div className="text-[10px] text-slate-400">{fmtBrl(projectedUsd * exchangeRate)}</div>
        </div>
        <div className="bg-slate-900/70 border border-slate-800/80 rounded-lg px-2.5 py-2">
          <div className="text-[10px] text-slate-400 font-sans">Limite &amp; Margem</div>
          <div className="text-cyan-300 font-bold">{limitUsd > 0 ? `$${limitUsd.toFixed(2)}` : 'Sem limite'}</div>
          <div className={`text-[10px] ${deltaUsd < 0 ? 'text-rose-400 font-semibold' : 'text-slate-400'}`}>
            {limitUsd > 0
              ? deltaUsd < 0
                ? `Excesso: +$${Math.abs(deltaUsd).toFixed(2)}`
                : `Folga: $${deltaUsd.toFixed(2)}`
              : '—'}
          </div>
        </div>
      </div>

      {/* Barra de Progresso Color-Coded com Marcos 50% / 75% / 90% / 100% */}
      <div className="space-y-2">
        <div
          role="progressbar"
          aria-label={`${title} — projeção ${projectedPct}% do limite`}
          aria-valuenow={Math.min(100, Math.round(projectedPct))}
          aria-valuemin={0}
          aria-valuemax={100}
          className="relative w-full h-4 bg-slate-900 rounded-md overflow-hidden border border-slate-800"
        >
          {/* Faixa de projeção (run-rate) */}
          <div
            className={`absolute inset-y-0 left-0 transition-all duration-300 ${projStyle.projBarClass}`}
            style={{ width: `${Math.min(100, Math.max(0, projectedPct))}%` }}
            title={`Projeção: ${projectedPct}%`}
          />
          {/* Faixa de consumo real sólido */}
          <div
            className={`absolute inset-y-0 left-0 transition-all duration-300 ${actualStyle.barClass}`}
            style={{ width: `${Math.min(100, Math.max(0, actualPct))}%` }}
            title={`Consumo real: ${actualPct}%`}
          />
          {/* Marcadores de 50%, 75%, 90% */}
          <div className="absolute inset-y-0 left-[50%] w-px bg-cyan-300/70" title="Alerta 50%" />
          <div className="absolute inset-y-0 left-[75%] w-px bg-amber-300/80" title="Alerta 75%" />
          <div className="absolute inset-y-0 left-[90%] w-px bg-orange-400/90" title="Alerta 90%" />
        </div>

        {/* Régua Individual de Status por Limiar (50% / 75% / 90% / 100%) */}
        <div className="grid grid-cols-4 gap-1.5 text-[10px] font-mono tabular-nums">
          {THRESHOLD_MARKS.map((mark) => {
            const enabled = activeThresholds.includes(mark);
            const hitByActual = actualPct >= mark;
            const hitByProjected = projectedPct >= mark;
            const markStyle = getThresholdVisual(mark);
            const fillPct = mark > 0 ? Math.min(100, Math.max(0, (projectedPct / mark) * 100)) : 0;

            return (
              <div
                key={mark}
                className={`rounded-md border px-2 py-1 space-y-1 transition-colors ${
                  !enabled
                    ? 'bg-slate-900/40 border-slate-800/60 text-slate-600'
                    : hitByActual
                      ? markStyle.badgeClass
                      : hitByProjected
                        ? `border-dashed ${markStyle.badgeClass}`
                        : 'bg-slate-900/70 border-slate-800 text-slate-400'
                }`}
              >
                <div className="flex items-center justify-between gap-1">
                  <span className="font-bold">{mark}%</span>
                  <span className="truncate">
                    {!enabled ? 'Off' : hitByActual ? 'Real' : hitByProjected ? 'Proj.' : 'OK'}
                  </span>
                </div>
                <div className="w-full h-1 bg-slate-950 rounded-full overflow-hidden">
                  <div
                    className={`h-full transition-all duration-300 ${
                      hitByActual || hitByProjected ? markStyle.barClass : 'bg-slate-700'
                    }`}
                    style={{ width: `${fillPct}%` }}
                  />
                </div>
              </div>
            );
          })}
        </div>

        <div className="flex items-center justify-between gap-2 text-[11px] text-slate-400">
          <span>
            Sólido: real ({actualPct}%) · Sombreado: projeção ({projectedPct}%)
          </span>
          <span className={`font-mono font-semibold ${activeStyle.textClass}`}>
            {effectivePct >= 100
              ? 'Limite ultrapassado (100%+)'
              : effectivePct >= 90
                ? 'Risco crítico (≥90%)'
                : effectivePct >= 75
                  ? 'Atenção elevada (≥75%)'
                  : effectivePct >= 50
                    ? 'Metade do orçamento (≥50%)'
                    : 'Dentro do orçamento (<50%)'}
          </span>
        </div>
      </div>
    </div>
  );
}

export function ProjectedBudgetAlertsSection({
  budgetProgress,
  costPolicy,
  summary,
  alerts,
  exchangeRate,
  usageLogs,
}: {
  budgetProgress: any;
  costPolicy: any;
  summary: any;
  alerts: any[];
  exchangeRate: number;
  usageLogs: any[];
}) {
  const [tierFilter, setTierFilter] = useState<'all' | 50 | 75 | 90 | 100>('all');
  const [runRateMultiplier, setRunRateMultiplier] = useState<1 | 1.25 | 1.5 | 2>(1);

  const now = new Date();
  const todayStr = now.toISOString().slice(0, 10);
  const currentMonthStr = now.toISOString().slice(0, 7);
  const hoursElapsed = Math.max(1, now.getUTCHours() + now.getUTCMinutes() / 60);
  const dayOfMonth = Math.max(1, now.getUTCDate());
  const daysInMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0)).getUTCDate();

  const activeThresholds: number[] = useMemo(() => {
    const raw = costPolicy?.alertThresholds;
    if (Array.isArray(raw) && raw.length > 0) return raw.map(Number);
    return [50, 75, 90, 100];
  }, [costPolicy?.alertThresholds]);

  const { dailyActual, dailyProjected, monthlyActual, monthlyProjected, deptRows, provRows } = useMemo(() => {
    const logs = Array.isArray(usageLogs) ? usageLogs : [];
    let todaySpend = 0;
    let monthSpend = 0;
    const deptTodayMap: Record<string, number> = {};
    const provTodayMap: Record<string, number> = {};

    for (const l of logs) {
      if (l.status !== 'success') continue;
      const cost = Number(l.estimatedCostUsd ?? l.totalCostUsd ?? 0);
      const day = String(l.createdAt || '').slice(0, 10);
      const month = String(l.createdAt || '').slice(0, 7);
      if (day === todayStr) {
        todaySpend += cost;
        const dept = l.department || 'NER AI Center';
        deptTodayMap[dept] = (deptTodayMap[dept] || 0) + cost;
        const prov = l.providerId || 'desconhecido';
        provTodayMap[prov] = (provTodayMap[prov] || 0) + cost;
      }
      if (month === currentMonthStr) {
        monthSpend += cost;
      }
    }

    const dActual = Number(budgetProgress?.dailySpentUsd ?? summary?.dailyCostUsd ?? todaySpend);
    const dProjBase = Number(
      budgetProgress?.projectedDailyUsd ?? Number(((dActual / hoursElapsed) * 24).toFixed(6))
    );
    const mActual = Number(budgetProgress?.monthlySpentUsd ?? summary?.monthlyCostUsd ?? monthSpend);
    const mProjBase = Number(
      budgetProgress?.projectedMonthEndUsd ?? Number(((mActual / dayOfMonth) * daysInMonth).toFixed(6))
    );

    const deptLimits: Record<string, number> = costPolicy?.departmentLimitsUsd || {};
    const depts = Object.entries(deptLimits)
      .filter(([, cap]) => Number(cap) > 0)
      .map(([dept, cap]) => {
        const spent = Number((deptTodayMap[dept] || 0).toFixed(6));
        const proj = Number((((spent / hoursElapsed) * 24) * runRateMultiplier).toFixed(6));
        return {
          department: dept,
          spentUsd: spent,
          projectedUsd: proj,
          limitUsd: Number(cap),
        };
      });

    const provLimits: Record<string, number> = costPolicy?.providerLimitsUsd || {};
    const provs = Object.entries(provLimits)
      .filter(([, cap]) => Number(cap) > 0)
      .map(([prov, cap]) => {
        const spent = Number((provTodayMap[prov] || 0).toFixed(6));
        const proj = Number((((spent / hoursElapsed) * 24) * runRateMultiplier).toFixed(6));
        return {
          providerId: prov,
          spentUsd: spent,
          projectedUsd: proj,
          limitUsd: Number(cap),
        };
      });

    return {
      dailyActual: dActual,
      dailyProjected: Number((dProjBase * runRateMultiplier).toFixed(6)),
      monthlyActual: mActual,
      monthlyProjected: Number((mProjBase * runRateMultiplier).toFixed(6)),
      deptRows: depts,
      provRows: provs,
    };
  }, [
    usageLogs,
    budgetProgress,
    summary,
    costPolicy,
    todayStr,
    currentMonthStr,
    hoursElapsed,
    dayOfMonth,
    daysInMonth,
    runRateMultiplier,
  ]);

  const dailyLimit = Number(budgetProgress?.dailyLimitUsd ?? costPolicy?.dailyLimitUsd ?? 0);
  const monthlyLimit = Number(budgetProgress?.monthlyLimitUsd ?? costPolicy?.monthlyLimitUsd ?? 0);
  const projectedAlerts = (alerts || []).filter((a) => a.isProjected || String(a.scope || '').startsWith('projected_'));

  const allBudgetEntries = useMemo(() => {
    const entries: Array<{ key: string; projectedPct: number }> = [
      { key: 'daily', projectedPct: dailyLimit > 0 ? (dailyProjected / dailyLimit) * 100 : 0 },
      { key: 'monthly', projectedPct: monthlyLimit > 0 ? (monthlyProjected / monthlyLimit) * 100 : 0 },
      ...deptRows.map((d) => ({
        key: `dept:${d.department}`,
        projectedPct: d.limitUsd > 0 ? (d.projectedUsd / d.limitUsd) * 100 : 0,
      })),
      ...provRows.map((p) => ({
        key: `prov:${p.providerId}`,
        projectedPct: p.limitUsd > 0 ? (p.projectedUsd / p.limitUsd) * 100 : 0,
      })),
    ];
    return entries;
  }, [dailyLimit, dailyProjected, monthlyLimit, monthlyProjected, deptRows, provRows]);

  const tierCounts = useMemo(() => {
    const counts: Record<50 | 75 | 90 | 100, number> = { 50: 0, 75: 0, 90: 0, 100: 0 };
    for (const item of allBudgetEntries) {
      if (item.projectedPct >= 100) counts[100] += 1;
      if (item.projectedPct >= 90) counts[90] += 1;
      if (item.projectedPct >= 75) counts[75] += 1;
      if (item.projectedPct >= 50) counts[50] += 1;
    }
    return counts;
  }, [allBudgetEntries]);

  const matchesTier = (projectedUsd: number, limitUsd: number) => {
    if (tierFilter === 'all') return true;
    const pct = limitUsd > 0 ? (projectedUsd / limitUsd) * 100 : 0;
    return pct >= tierFilter;
  };

  const filteredDeptRows = deptRows.filter((d) => matchesTier(d.projectedUsd, d.limitUsd));
  const filteredProvRows = provRows.filter((p) => matchesTier(p.projectedUsd, p.limitUsd));

  return (
    <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-5 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-slate-800">
        <div>
          <h4 className="font-bold text-white text-sm flex items-center gap-2">
            <TrendingUp className="w-4 h-4 text-cyan-400" />
            Sistema de Alertas de Custo Projetado (50% · 75% · 90% · 100%)
          </h4>
          <p className="text-[11px] text-slate-400 mt-0.5">
            Calcula o ritmo projetado (run-rate 24h e fechamento mensal) contra os limites configurados, com barras de progresso por faixa de alerta.
          </p>
        </div>

        {/* Controle de Sensibilidade do Run-Rate */}
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <span className="text-[11px] text-slate-400">Ritmo projetado:</span>
          <div className="flex items-center gap-1 bg-slate-950 border border-slate-800 rounded-xl p-1">
            {([1, 1.25, 1.5, 2] as const).map((mult) => (
              <button
                key={mult}
                type="button"
                onClick={() => setRunRateMultiplier(mult)}
                className={`px-2.5 py-1 rounded-lg font-mono text-[11px] whitespace-nowrap shrink-0 transition-colors ${
                  runRateMultiplier === mult
                    ? 'bg-cyan-600 text-white font-semibold'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                {mult === 1 ? '1.0x Real' : `${mult}x`}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* 4 Indicadores Visuais Interativos dos Limiares (50%, 75%, 90%, 100%) */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-2.5 text-xs">
        <button
          type="button"
          onClick={() => setTierFilter('all')}
          className={`text-left rounded-xl border p-3 transition-colors ${
            tierFilter === 'all'
              ? 'bg-slate-800/80 border-cyan-500/60 text-white'
              : 'bg-slate-950 border-slate-800 text-slate-300 hover:border-slate-700'
          }`}
        >
          <div className="text-[11px] text-slate-400">Todos os Limites</div>
          <div className="text-lg font-bold font-mono tabular-nums mt-0.5">{allBudgetEntries.length}</div>
          <div className="text-[10px] text-slate-400">Monitorados em tempo real</div>
        </button>

        {([
          { tier: 50 as const, title: 'Alerta 50%', desc: 'Aviso preventivo', bar: 'bg-cyan-500', accent: 'text-cyan-300', activeBorder: 'border-cyan-500/70 bg-cyan-500/10' },
          { tier: 75 as const, title: 'Alerta 75%', desc: 'Atenção orçamentária', bar: 'bg-amber-400', accent: 'text-amber-300', activeBorder: 'border-amber-400/70 bg-amber-500/10' },
          { tier: 90 as const, title: 'Alerta 90%', desc: 'Risco crítico', bar: 'bg-orange-500', accent: 'text-orange-300', activeBorder: 'border-orange-500/70 bg-orange-500/10' },
          { tier: 100 as const, title: 'Alerta 100%', desc: 'Teto excedido', bar: 'bg-rose-500', accent: 'text-rose-300', activeBorder: 'border-rose-500/70 bg-rose-500/10' },
        ]).map((card) => {
          const hitCount = tierCounts[card.tier];
          const isSelected = tierFilter === card.tier;
          const pctAffected =
            allBudgetEntries.length > 0 ? Math.round((hitCount / allBudgetEntries.length) * 100) : 0;

          return (
            <button
              key={card.tier}
              type="button"
              onClick={() => setTierFilter(isSelected ? 'all' : card.tier)}
              className={`text-left rounded-xl border p-3 space-y-1.5 transition-colors ${
                isSelected
                  ? card.activeBorder
                  : 'bg-slate-950 border-slate-800 hover:border-slate-700'
              }`}
            >
              <div className="flex items-center justify-between gap-2">
                <span className={`font-bold text-xs ${card.accent}`}>{card.title}</span>
                <span className="font-mono tabular-nums text-[11px] text-slate-300">
                  {hitCount}/{allBudgetEntries.length}
                </span>
              </div>
              <div className="w-full h-1.5 bg-slate-900 rounded-full overflow-hidden">
                <div
                  className={`h-full transition-all duration-300 ${card.bar}`}
                  style={{ width: `${pctAffected}%` }}
                />
              </div>
              <div className="text-[10px] text-slate-400 flex items-center justify-between">
                <span>{card.desc}</span>
                <span className="font-mono tabular-nums">{hitCount > 0 ? 'Ativo' : 'OK'}</span>
              </div>
            </button>
          );
        })}
      </div>

      {/* Alertas Específicos de Custo Projetado Emitidos pelo AI Gateway */}
      {projectedAlerts.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
          {projectedAlerts.map((al: any) => (
            <div
              key={al.id}
              className={`rounded-xl p-3 border text-xs flex items-start gap-2.5 ${
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
                <AlertTriangle
                  className={`w-4 h-4 shrink-0 mt-0.5 ${al.severity === 'warning' ? 'text-amber-400' : 'text-cyan-400'}`}
                />
              )}
              <div className="flex-1 min-w-0">
                <div className="font-bold flex items-center justify-between gap-2">
                  <span className="truncate">{al.title}</span>
                  <span className="font-mono tabular-nums shrink-0">{al.percentageUsed}% proj.</span>
                </div>
                <p className="text-[11px] opacity-90 mt-0.5">{al.message}</p>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Barras da Organização (Diário + Mensal) */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {matchesTier(dailyProjected, dailyLimit) && (
          <ThresholdProgressRow
            title="Orçamento Diário da Organização"
            subtitle={`Projeção 24h (${hoursElapsed.toFixed(1)}h UTC decorridas${runRateMultiplier !== 1 ? ` · cenário ${runRateMultiplier}x` : ''})`}
            actualUsd={dailyActual}
            projectedUsd={dailyProjected}
            limitUsd={dailyLimit}
            exchangeRate={exchangeRate}
            activeThresholds={activeThresholds}
          />
        )}
        {matchesTier(monthlyProjected, monthlyLimit) && (
          <ThresholdProgressRow
            title="Orçamento Mensal da Organização"
            subtitle={`Projeção de fechamento (${dayOfMonth}/${daysInMonth} dias${runRateMultiplier !== 1 ? ` · cenário ${runRateMultiplier}x` : ''})`}
            actualUsd={monthlyActual}
            projectedUsd={monthlyProjected}
            limitUsd={monthlyLimit}
            exchangeRate={exchangeRate}
            activeThresholds={activeThresholds}
          />
        )}
      </div>

      {/* Barras por Departamento Configurado */}
      {filteredDeptRows.length > 0 && (
        <div className="space-y-2 pt-2 border-t border-slate-800/80">
          <div className="text-xs font-semibold text-slate-300">
            Limites e Projeção Diária por Departamento ({filteredDeptRows.length})
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {filteredDeptRows.map((d) => (
              <ThresholdProgressRow
                key={d.department}
                title={d.department}
                subtitle="Teto diário departamental"
                actualUsd={d.spentUsd}
                projectedUsd={d.projectedUsd}
                limitUsd={d.limitUsd}
                exchangeRate={exchangeRate}
                activeThresholds={activeThresholds}
              />
            ))}
          </div>
        </div>
      )}

      {/* Barras por Provedor Configurado */}
      {filteredProvRows.length > 0 && (
        <div className="space-y-2 pt-2 border-t border-slate-800/80">
          <div className="text-xs font-semibold text-slate-300">
            Limites e Projeção Diária por Provedor ({filteredProvRows.length})
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {filteredProvRows.map((p) => (
              <ThresholdProgressRow
                key={p.providerId}
                title={p.providerId}
                subtitle="Teto diário por provedor"
                actualUsd={p.spentUsd}
                projectedUsd={p.projectedUsd}
                limitUsd={p.limitUsd}
                exchangeRate={exchangeRate}
                activeThresholds={activeThresholds}
              />
            ))}
          </div>
        </div>
      )}

      {tierFilter !== 'all' &&
        !matchesTier(dailyProjected, dailyLimit) &&
        !matchesTier(monthlyProjected, monthlyLimit) &&
        filteredDeptRows.length === 0 &&
        filteredProvRows.length === 0 && (
          <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 text-center text-xs text-slate-400">
            Nenhum limite atingiu o marco projetado de <strong className="text-white">{tierFilter}%</strong> neste momento.
          </div>
        )}
    </div>
  );
}

function CustomUsageTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: any[];
  label?: string;
}) {
  if (!active || !payload || payload.length === 0) return null;
  const row = payload[0]?.payload;
  if (!row) return null;
  return (
    <div className="bg-slate-950/95 border border-slate-700 rounded-xl px-3 py-2.5 text-xs shadow-xl space-y-1.5 min-w-[190px]">
      <div className="font-bold text-white font-mono border-b border-slate-800 pb-1">
        {label || row.name || row.date}
      </div>
      <div className="grid grid-cols-2 gap-x-3 gap-y-1 font-mono text-[11px]">
        <span className="text-slate-400 font-sans">Custo USD:</span>
        <span className="text-emerald-400 text-right font-semibold">{fmtUsd(Number(row.costUsd || 0))}</span>
        <span className="text-slate-400 font-sans">Custo BRL:</span>
        <span className="text-emerald-300 text-right">{fmtBrl(Number(row.costBrl || 0))}</span>
        <span className="text-slate-400 font-sans">Tokens Totais:</span>
        <span className="text-white text-right font-semibold">{Number(row.tokens || 0).toLocaleString('pt-BR')}</span>
        <span className="text-slate-400 font-sans">Entrada / Saída:</span>
        <span className="text-cyan-300 text-right">
          {Number(row.inputTokens || 0).toLocaleString('pt-BR')} / {Number(row.outputTokens || 0).toLocaleString('pt-BR')}
        </span>
        {Number(row.cachedTokens || 0) > 0 && (
          <>
            <span className="text-slate-400 font-sans">Cache:</span>
            <span className="text-teal-300 text-right">{Number(row.cachedTokens).toLocaleString('pt-BR')}</span>
          </>
        )}
        <span className="text-slate-400 font-sans">Requisições:</span>
        <span className="text-slate-200 text-right">{Number(row.requests || 0)}</span>
      </div>
    </div>
  );
}

export function AiUsageRechartsSection({
  usageLogs,
  exchangeRate,
  filters,
  onChangeFilters,
}: {
  usageLogs: any[];
  exchangeRate: number;
  filters: CostFilterState;
  onChangeFilters: (next: CostFilterState) => void;
}) {
  const [metricMode, setMetricMode] = useState<'both' | 'cost' | 'costBrl' | 'tokens'>('both');
  const [timeGranularity, setTimeGranularity] = useState<'day' | 'week' | 'month'>('day');
  const [breakdownTab, setBreakdownTab] = useState<'provider' | 'department' | 'model'>('provider');

  // Filtra client-side sobre aiGateway.usageLogs preservando irmãos para cross-filtering imediato
  const basePeriodLogs = useMemo(() => {
    const logs = Array.isArray(usageLogs) ? usageLogs : [];
    const nowDate = new Date();
    const now = nowDate.getTime();
    const todayStr = nowDate.toISOString().slice(0, 10);
    const yesterdayStr = new Date(now - 86_400_000).toISOString().slice(0, 10);
    const currentMonth = todayStr.slice(0, 7);
    const prevMonthStr = new Date(Date.UTC(nowDate.getUTCFullYear(), nowDate.getUTCMonth() - 1, 1))
      .toISOString()
      .slice(0, 7);

    return logs.filter((l) => {
      const created = String(l.createdAt || '');
      const day = created.slice(0, 10);
      const ts = new Date(created).getTime();

      if (filters.period === 'today' && day !== todayStr) return false;
      if (filters.period === 'yesterday' && day !== yesterdayStr) return false;
      if (filters.period === '7d' && (!Number.isFinite(ts) || ts < now - 7 * 86_400_000)) return false;
      if (filters.period === '30d' && (!Number.isFinite(ts) || ts < now - 30 * 86_400_000)) return false;
      if (filters.period === 'current_month' && created.slice(0, 7) !== currentMonth) return false;
      if (filters.period === 'previous_month' && created.slice(0, 7) !== prevMonthStr) return false;
      if (filters.period === 'custom') {
        if (filters.startDate && day < filters.startDate) return false;
        if (filters.endDate && day > filters.endDate) return false;
      }
      if (filters.action && filters.action !== 'all' && l.action !== filters.action) return false;
      if (filters.status && filters.status !== 'all' && l.status !== filters.status) return false;
      if (
        filters.billingCategory &&
        filters.billingCategory !== 'all' &&
        (l.billingCategory || 'internal_agency') !== filters.billingCategory
      ) {
        return false;
      }
      if (filters.clientId && filters.clientId !== 'all') {
        if (filters.clientId === 'internal' && l.clientId) return false;
        if (filters.clientId !== 'internal' && l.clientId !== filters.clientId) return false;
      }
      return true;
    });
  }, [
    usageLogs,
    filters.period,
    filters.startDate,
    filters.endDate,
    filters.action,
    filters.status,
    filters.billingCategory,
    filters.clientId,
  ]);

  const filteredLogs = useMemo(() => {
    return basePeriodLogs.filter((l) => {
      if (filters.providerId !== 'all' && l.providerId !== filters.providerId) return false;
      if (filters.department !== 'all' && l.department !== filters.department) return false;
      if (filters.modelId !== 'all' && l.modelId !== filters.modelId) return false;
      return true;
    });
  }, [basePeriodLogs, filters.providerId, filters.department, filters.modelId]);

  const { dailyData, providerData, departmentData, modelData } = useMemo(() => {
    const dayMap: Record<
      string,
      {
        date: string;
        costUsd: number;
        costBrl: number;
        tokens: number;
        inputTokens: number;
        outputTokens: number;
        cachedTokens: number;
        requests: number;
      }
    > = {};
    const provMap: Record<
      string,
      {
        name: string;
        costUsd: number;
        costBrl: number;
        tokens: number;
        inputTokens: number;
        outputTokens: number;
        cachedTokens: number;
        requests: number;
      }
    > = {};
    const deptMap: Record<
      string,
      {
        name: string;
        costUsd: number;
        costBrl: number;
        tokens: number;
        inputTokens: number;
        outputTokens: number;
        cachedTokens: number;
        requests: number;
      }
    > = {};
    const modelMap: Record<
      string,
      {
        name: string;
        providerId: string;
        modelId: string;
        costUsd: number;
        costBrl: number;
        tokens: number;
        inputTokens: number;
        outputTokens: number;
        cachedTokens: number;
        requests: number;
      }
    > = {};

    const toBucketKey = (isoDate: string): string => {
      const day = isoDate.slice(0, 10) || '—';
      if (timeGranularity === 'month') return day.slice(0, 7) || '—';
      if (timeGranularity === 'week') {
        const dt = new Date(`${day}T00:00:00Z`);
        if (Number.isNaN(dt.getTime())) return day;
        const weekday = dt.getUTCDay() || 7;
        dt.setUTCDate(dt.getUTCDate() - (weekday - 1));
        return `Sem ${dt.toISOString().slice(0, 10)}`;
      }
      return day;
    };

    // Série temporal reflete todos os filtros ativos na granularidade escolhida
    for (const l of filteredLogs) {
      const costUsd = Number(l.estimatedCostUsd ?? l.totalCostUsd ?? 0);
      const inTok = Number(l.inputTokens || 0);
      const outTok = Number(l.outputTokens || 0);
      const cacheTok = Number(l.cachedInputTokens ?? l.cachedTokens ?? 0);
      const totTok = inTok + outTok;

      const bucket = toBucketKey(String(l.createdAt || ''));
      if (!dayMap[bucket]) {
        dayMap[bucket] = {
          date: bucket,
          costUsd: 0,
          costBrl: 0,
          tokens: 0,
          inputTokens: 0,
          outputTokens: 0,
          cachedTokens: 0,
          requests: 0,
        };
      }
      dayMap[bucket].costUsd = Number((dayMap[bucket].costUsd + costUsd).toFixed(6));
      dayMap[bucket].costBrl = Number((dayMap[bucket].costUsd * exchangeRate).toFixed(4));
      dayMap[bucket].tokens += totTok;
      dayMap[bucket].inputTokens += inTok;
      dayMap[bucket].outputTokens += outTok;
      dayMap[bucket].cachedTokens += cacheTok;
      dayMap[bucket].requests += 1;
    }

    // Dimensões comparativas preservam itens irmãos para cross-filtering direto com um clique
    for (const l of basePeriodLogs) {
      const costUsd = Number(l.estimatedCostUsd ?? l.totalCostUsd ?? 0);
      const inTok = Number(l.inputTokens || 0);
      const outTok = Number(l.outputTokens || 0);
      const cacheTok = Number(l.cachedInputTokens ?? l.cachedTokens ?? 0);
      const totTok = inTok + outTok;
      const prov = l.providerId || 'desconhecido';
      const dept = l.department || 'NER AI Center';
      const rawModelId = l.modelId || 'default';

      const matchesProvider = filters.providerId === 'all' || prov === filters.providerId;
      const matchesDept = filters.department === 'all' || dept === filters.department;
      const matchesModel = filters.modelId === 'all' || rawModelId === filters.modelId;

      if (matchesDept && matchesModel) {
        if (!provMap[prov]) {
          provMap[prov] = {
            name: prov,
            costUsd: 0,
            costBrl: 0,
            tokens: 0,
            inputTokens: 0,
            outputTokens: 0,
            cachedTokens: 0,
            requests: 0,
          };
        }
        provMap[prov].costUsd = Number((provMap[prov].costUsd + costUsd).toFixed(6));
        provMap[prov].costBrl = Number((provMap[prov].costUsd * exchangeRate).toFixed(4));
        provMap[prov].tokens += totTok;
        provMap[prov].inputTokens += inTok;
        provMap[prov].outputTokens += outTok;
        provMap[prov].cachedTokens += cacheTok;
        provMap[prov].requests += 1;
      }

      if (matchesProvider && matchesModel) {
        if (!deptMap[dept]) {
          deptMap[dept] = {
            name: dept,
            costUsd: 0,
            costBrl: 0,
            tokens: 0,
            inputTokens: 0,
            outputTokens: 0,
            cachedTokens: 0,
            requests: 0,
          };
        }
        deptMap[dept].costUsd = Number((deptMap[dept].costUsd + costUsd).toFixed(6));
        deptMap[dept].costBrl = Number((deptMap[dept].costUsd * exchangeRate).toFixed(4));
        deptMap[dept].tokens += totTok;
        deptMap[dept].inputTokens += inTok;
        deptMap[dept].outputTokens += outTok;
        deptMap[dept].cachedTokens += cacheTok;
        deptMap[dept].requests += 1;
      }

      if (matchesProvider && matchesDept) {
        const modelKey = `${prov}/${rawModelId}`;
        if (!modelMap[modelKey]) {
          modelMap[modelKey] = {
            name: modelKey,
            providerId: prov,
            modelId: rawModelId,
            costUsd: 0,
            costBrl: 0,
            tokens: 0,
            inputTokens: 0,
            outputTokens: 0,
            cachedTokens: 0,
            requests: 0,
          };
        }
        modelMap[modelKey].costUsd = Number((modelMap[modelKey].costUsd + costUsd).toFixed(6));
        modelMap[modelKey].costBrl = Number((modelMap[modelKey].costUsd * exchangeRate).toFixed(4));
        modelMap[modelKey].tokens += totTok;
        modelMap[modelKey].inputTokens += inTok;
        modelMap[modelKey].outputTokens += outTok;
        modelMap[modelKey].cachedTokens += cacheTok;
        modelMap[modelKey].requests += 1;
      }
    }

    return {
      dailyData: Object.values(dayMap).sort((a, b) => a.date.localeCompare(b.date)),
      providerData: Object.values(provMap).sort((a, b) => b.costUsd - a.costUsd || b.tokens - a.tokens),
      departmentData: Object.values(deptMap).sort((a, b) => b.costUsd - a.costUsd || b.tokens - a.tokens),
      modelData: Object.values(modelMap)
        .sort((a, b) => b.costUsd - a.costUsd || b.tokens - a.tokens)
        .slice(0, 10),
    };
  }, [filteredLogs, basePeriodLogs, exchangeRate, filters.providerId, filters.department, filters.modelId, timeGranularity]);

  const sliceTotals = useMemo(() => {
    let costUsd = 0;
    let inputTokens = 0;
    let outputTokens = 0;
    let cachedTokens = 0;
    for (const l of filteredLogs) {
      costUsd += Number(l.estimatedCostUsd ?? l.totalCostUsd ?? 0);
      inputTokens += Number(l.inputTokens || 0);
      outputTokens += Number(l.outputTokens || 0);
      cachedTokens += Number(l.cachedInputTokens ?? l.cachedTokens ?? 0);
    }
    return {
      costUsd: Number(costUsd.toFixed(6)),
      costBrl: Number((costUsd * exchangeRate).toFixed(4)),
      inputTokens,
      outputTokens,
      cachedTokens,
      totalTokens: inputTokens + outputTokens,
      requests: filteredLogs.length,
    };
  }, [filteredLogs, exchangeRate]);

  const datePresets: Array<{ id: CostFilterState['period']; label: string }> = [
    { id: 'today', label: 'Hoje' },
    { id: 'yesterday', label: 'Ontem' },
    { id: '7d', label: '7 dias' },
    { id: '30d', label: '30 dias' },
    { id: 'current_month', label: 'Mês atual' },
    { id: 'previous_month', label: 'Mês anterior' },
    { id: 'all', label: 'Tudo' },
  ];

  const costDataKey = metricMode === 'costBrl' ? 'costBrl' : 'costUsd';
  const costAxisPrefix = metricMode === 'costBrl' ? 'R$' : '$';
  const costLabelSuffix =
    metricMode === 'both'
      ? 'Tokens & Custo USD'
      : metricMode === 'costBrl'
        ? 'Custo BRL'
        : metricMode === 'cost'
          ? 'Custo USD'
          : 'Tokens';

  const formatCostAxis = (v: number) =>
    `${costAxisPrefix}${Number(v).toFixed(metricMode === 'costBrl' ? 2 : 3)}`;

  const formatYAxis = (v: number) =>
    metricMode === 'tokens' ? fmtCompactTokens(Number(v)) : formatCostAxis(v);

  const extractName = (data: any): string | undefined => data?.payload?.name ?? data?.name;
  const extractModelId = (data: any): string | undefined => data?.payload?.modelId ?? data?.modelId;

  const toggleProviderFilter = (providerId?: string) => {
    if (!providerId) return;
    onChangeFilters({
      ...filters,
      providerId: filters.providerId === providerId ? 'all' : providerId,
    });
  };

  const toggleDepartmentFilter = (department?: string) => {
    if (!department) return;
    onChangeFilters({
      ...filters,
      department: filters.department === department ? 'all' : department,
    });
  };

  const toggleModelFilter = (modelId?: string) => {
    if (!modelId) return;
    onChangeFilters({
      ...filters,
      modelId: filters.modelId === modelId ? 'all' : modelId,
    });
  };

  const resetChartFilters = () => {
    onChangeFilters({
      ...filters,
      period: 'all',
      startDate: '',
      endDate: '',
      providerId: 'all',
      department: 'all',
      modelId: 'all',
    });
  };

  const hasChartSelection =
    filters.providerId !== 'all' || filters.department !== 'all' || filters.modelId !== 'all';

  return (
    <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-5 space-y-5">
      {/* Barra de Filtros Dinâmicos de Período + Seletor de Métrica */}
      <div className="flex flex-wrap items-center justify-between gap-3 pb-4 border-b border-slate-800">
        <div>
          <h4 className="font-bold text-white text-sm flex items-center gap-2">
            <Activity className="w-4 h-4 text-cyan-400" />
            Gráficos Interativos de Consumo e Custos
          </h4>
          <p className="text-[11px] text-slate-400 mt-0.5">
            Segmentação interativa por provedor, departamento, modelo e série diária sobre os registros de{' '}
            <span className="font-mono text-slate-300">aiGateway.usageLogs</span> ({filteredLogs.length} registros no recorte).
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 text-xs">
          {/* Atalhos Dinâmicos de Período */}
          <div className="flex flex-wrap items-center gap-1 bg-slate-950 border border-slate-800 rounded-xl p-1">
            <Calendar className="w-3.5 h-3.5 text-cyan-400 ml-1.5 mr-1 shrink-0" />
            {datePresets.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => onChangeFilters({ ...filters, period: p.id })}
                className={`px-2.5 py-1 rounded-lg font-medium whitespace-nowrap shrink-0 transition-colors ${
                  filters.period === p.id
                    ? 'bg-cyan-600 text-white'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>

          {/* Inputs Dinâmicos de Intervalo de Datas */}
          <div className="flex items-center gap-1.5 bg-slate-950 border border-slate-800 rounded-xl px-2.5 py-1">
            <span className="text-[11px] text-slate-400">De:</span>
            <input
              type="date"
              aria-label="Data inicial"
              value={filters.startDate}
              onChange={(e) =>
                onChangeFilters({
                  ...filters,
                  period: 'custom',
                  startDate: e.target.value,
                })
              }
              className="bg-transparent text-white font-mono text-[11px] focus:outline-none"
            />
            <span className="text-[11px] text-slate-400">Até:</span>
            <input
              type="date"
              aria-label="Data final"
              value={filters.endDate}
              onChange={(e) =>
                onChangeFilters({
                  ...filters,
                  period: 'custom',
                  endDate: e.target.value,
                })
              }
              className="bg-transparent text-white font-mono text-[11px] focus:outline-none"
            />
          </div>

          {/* Toggle Métrica: Tokens + Custo / USD / BRL / Tokens */}
          <div className="flex items-center gap-1 bg-slate-950 border border-slate-800 rounded-xl p-1">
            <button
              type="button"
              onClick={() => setMetricMode('both')}
              className={`px-2.5 py-1 rounded-lg font-semibold whitespace-nowrap shrink-0 flex items-center gap-1 transition-colors ${
                metricMode === 'both' ? 'bg-cyan-600 text-white' : 'text-slate-400 hover:text-white'
              }`}
            >
              <TrendingUp className="w-3 h-3" /> Tokens + Custo
            </button>
            <button
              type="button"
              onClick={() => setMetricMode('cost')}
              className={`px-2.5 py-1 rounded-lg font-semibold whitespace-nowrap shrink-0 flex items-center gap-1 transition-colors ${
                metricMode === 'cost' ? 'bg-emerald-600 text-white' : 'text-slate-400 hover:text-white'
              }`}
            >
              <DollarSign className="w-3 h-3" /> USD
            </button>
            <button
              type="button"
              onClick={() => setMetricMode('costBrl')}
              className={`px-2.5 py-1 rounded-lg font-semibold whitespace-nowrap shrink-0 transition-colors ${
                metricMode === 'costBrl' ? 'bg-emerald-600 text-white' : 'text-slate-400 hover:text-white'
              }`}
            >
              R$ BRL
            </button>
            <button
              type="button"
              onClick={() => setMetricMode('tokens')}
              className={`px-2.5 py-1 rounded-lg font-semibold whitespace-nowrap shrink-0 flex items-center gap-1 transition-colors ${
                metricMode === 'tokens' ? 'bg-violet-600 text-white' : 'text-slate-400 hover:text-white'
              }`}
            >
              <Cpu className="w-3 h-3" /> Tokens
            </button>
          </div>
        </div>
      </div>

      {/* Faixa de Resumo Tabular do Recorte Atual */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 text-xs">
        <div className="bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5">
          <div className="text-[11px] text-slate-400">Tokens no Recorte</div>
          <div className="text-base font-bold font-mono tabular-nums text-white mt-0.5">
            {sliceTotals.totalTokens.toLocaleString('pt-BR')}
          </div>
          <div className="text-[11px] font-mono tabular-nums text-slate-400">
            In {sliceTotals.inputTokens.toLocaleString('pt-BR')} · Out {sliceTotals.outputTokens.toLocaleString('pt-BR')}
          </div>
        </div>
        <div className="bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5">
          <div className="text-[11px] text-slate-400">Custo Estimado (USD / BRL)</div>
          <div className="text-base font-bold font-mono tabular-nums text-emerald-400 mt-0.5">
            {fmtUsd(sliceTotals.costUsd)}
          </div>
          <div className="text-[11px] font-mono tabular-nums text-slate-400">
            {fmtBrl(sliceTotals.costBrl)}
          </div>
        </div>
        <div className="bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5">
          <div className="text-[11px] text-slate-400">Dimensões Ativas</div>
          <div className="text-base font-bold font-mono tabular-nums text-cyan-300 mt-0.5">
            {providerData.length} prov. · {departmentData.length} dept.
          </div>
          <div className="text-[11px] font-mono tabular-nums text-slate-400">
            {modelData.length} modelo(s) distinto(s)
          </div>
        </div>
        <div className="bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5">
          <div className="text-[11px] text-slate-400">Requisições & Cache</div>
          <div className="text-base font-bold font-mono tabular-nums text-white mt-0.5">
            {sliceTotals.requests.toLocaleString('pt-BR')} req(s)
          </div>
          <div className="text-[11px] font-mono tabular-nums text-slate-400">
            Cache: {sliceTotals.cachedTokens.toLocaleString('pt-BR')} tok
          </div>
        </div>
      </div>

      {/* Filtros Ativos via Clique nos Gráficos */}
      {hasChartSelection && (
        <div className="flex flex-wrap items-center gap-2 text-[11px]">
          <span className="text-slate-400">Filtros ativos via gráfico:</span>
          {filters.providerId !== 'all' && (
            <button
              type="button"
              onClick={() => toggleProviderFilter(filters.providerId)}
              className="px-2.5 py-1 rounded-lg bg-cyan-500/15 border border-cyan-500/30 text-cyan-200 font-mono whitespace-nowrap hover:bg-cyan-500/25 transition-colors"
            >
              Provedor: {filters.providerId} ×
            </button>
          )}
          {filters.department !== 'all' && (
            <button
              type="button"
              onClick={() => toggleDepartmentFilter(filters.department)}
              className="px-2.5 py-1 rounded-lg bg-amber-500/15 border border-amber-500/30 text-amber-200 font-mono whitespace-nowrap hover:bg-amber-500/25 transition-colors"
            >
              Depto: {filters.department} ×
            </button>
          )}
          {filters.modelId !== 'all' && (
            <button
              type="button"
              onClick={() => toggleModelFilter(filters.modelId)}
              className="px-2.5 py-1 rounded-lg bg-violet-500/15 border border-violet-500/30 text-violet-200 font-mono whitespace-nowrap hover:bg-violet-500/25 transition-colors"
            >
              Modelo: {filters.modelId} ×
            </button>
          )}
          <button
            type="button"
            onClick={resetChartFilters}
            className="px-2.5 py-1 rounded-lg bg-slate-950 border border-slate-700 text-slate-300 hover:text-white flex items-center gap-1 whitespace-nowrap transition-colors"
          >
            <RotateCcw className="w-3 h-3" /> Limpar filtros
          </button>
        </div>
      )}

      {filteredLogs.length === 0 && (
        <div className="px-4 py-3 rounded-xl bg-slate-950/90 border border-slate-800 flex flex-wrap items-center justify-between gap-3 text-xs">
          <p className="text-slate-400">
            Nenhum registro encontrado em <span className="font-mono text-slate-300">aiGateway.usageLogs</span> para o recorte atual. Os gráficos Recharts abaixo serão preenchidos automaticamente assim que novas chamadas forem executadas no NER AI Gateway.
          </p>
          {(filters.period !== 'all' || hasChartSelection) && (
            <button
              type="button"
              onClick={resetChartFilters}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-semibold whitespace-nowrap shrink-0 transition-colors"
            >
              <RotateCcw className="w-3.5 h-3.5" /> Exibir todo o histórico
            </button>
          )}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* Gráfico 1: Evolução Temporal (Tokens + Custo ou Série Dedicada) */}
          <div className="bg-slate-950 border border-slate-800 rounded-xl p-4 min-w-0 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h5 className="text-xs font-bold text-white flex items-center gap-1.5">
                <TrendingUp className="w-3.5 h-3.5 text-emerald-400" />
                Evolução {timeGranularity === 'day' ? 'Diária' : timeGranularity === 'week' ? 'Semanal' : 'Mensal'} ({metricMode === 'tokens' ? 'Tokens Input / Output' : costLabelSuffix})
              </h5>
              <div className="flex items-center gap-1.5">
                <div className="flex items-center bg-slate-900 border border-slate-800 rounded-lg p-0.5 text-[10px]">
                  {([
                    ['day', 'Dia'],
                    ['week', 'Sem'],
                    ['month', 'Mês'],
                  ] as const).map(([g, label]) => (
                    <button
                      key={g}
                      type="button"
                      onClick={() => setTimeGranularity(g)}
                      className={`px-2 py-0.5 rounded font-medium whitespace-nowrap transition-colors ${
                        timeGranularity === g ? 'bg-cyan-600 text-white' : 'text-slate-400 hover:text-white'
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
                <span className="text-[11px] font-mono tabular-nums text-slate-400">
                  {dailyData.length} ponto(s)
                </span>
              </div>
            </div>
            <div className="relative w-full h-[270px]">
              {dailyData.length === 0 && (
                <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center">
                  <span className="px-3 py-1.5 rounded-lg bg-slate-900/90 border border-slate-800 text-[11px] text-slate-400 font-mono">
                    Sem pontos na série para o período
                  </span>
                </div>
              )}
              <ResponsiveContainer width="100%" height="100%" minWidth={0}>
                {metricMode === 'both' ? (
                  <ComposedChart data={dailyData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                    <XAxis dataKey="date" stroke="#94a3b8" fontSize={11} />
                    <YAxis
                      yAxisId="left"
                      stroke="#06b6d4"
                      fontSize={11}
                      tickFormatter={(v) => fmtCompactTokens(Number(v))}
                    />
                    <YAxis
                      yAxisId="right"
                      orientation="right"
                      stroke="#10b981"
                      fontSize={11}
                      tickFormatter={(v) => `$${Number(v).toFixed(3)}`}
                    />
                    <Tooltip content={<CustomUsageTooltip />} />
                    <Legend wrapperStyle={{ fontSize: '11px' }} />
                    <Bar
                      yAxisId="left"
                      dataKey="inputTokens"
                      name="Tokens Entrada"
                      stackId="dailyTok"
                      fill="#06b6d4"
                      fillOpacity={0.8}
                    />
                    <Bar
                      yAxisId="left"
                      dataKey="outputTokens"
                      name="Tokens Saída"
                      stackId="dailyTok"
                      fill="#8b5cf6"
                      fillOpacity={0.8}
                      radius={[4, 4, 0, 0]}
                    />
                    <Line
                      yAxisId="right"
                      type="monotone"
                      dataKey="costUsd"
                      name="Custo Estimado (USD)"
                      stroke="#10b981"
                      strokeWidth={2.5}
                      dot={{ r: 3, fill: '#10b981' }}
                      activeDot={{ r: 5 }}
                    />
                  </ComposedChart>
                ) : (
                  <AreaChart data={dailyData} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
                    <defs>
                      <linearGradient id="nerCostGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#10b981" stopOpacity={0.45} />
                        <stop offset="95%" stopColor="#10b981" stopOpacity={0.02} />
                      </linearGradient>
                      <linearGradient id="nerTokenInGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#06b6d4" stopOpacity={0.45} />
                        <stop offset="95%" stopColor="#06b6d4" stopOpacity={0.02} />
                      </linearGradient>
                      <linearGradient id="nerTokenOutGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#8b5cf6" stopOpacity={0.45} />
                        <stop offset="95%" stopColor="#8b5cf6" stopOpacity={0.02} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                    <XAxis dataKey="date" stroke="#94a3b8" fontSize={11} />
                    <YAxis stroke="#94a3b8" fontSize={11} tickFormatter={formatYAxis} />
                    <Tooltip content={<CustomUsageTooltip />} />
                    <Legend wrapperStyle={{ fontSize: '11px' }} />
                    {metricMode !== 'tokens' ? (
                      <Area
                        type="monotone"
                        dataKey={costDataKey}
                        name={costLabelSuffix}
                        stroke="#10b981"
                        strokeWidth={2}
                        fillOpacity={1}
                        fill="url(#nerCostGrad)"
                      />
                    ) : (
                      <>
                        <Area
                          type="monotone"
                          dataKey="inputTokens"
                          name="Entrada (Tokens)"
                          stroke="#06b6d4"
                          strokeWidth={2}
                          fillOpacity={1}
                          fill="url(#nerTokenInGrad)"
                        />
                        <Area
                          type="monotone"
                          dataKey="outputTokens"
                          name="Saída (Tokens)"
                          stroke="#8b5cf6"
                          strokeWidth={2}
                          fillOpacity={1}
                          fill="url(#nerTokenOutGrad)"
                        />
                      </>
                    )}
                  </AreaChart>
                )}
              </ResponsiveContainer>
            </div>
          </div>

          {/* Gráfico 2: Consumo & Custo por Provedor (BarChart + Donut Share) */}
          <div className="bg-slate-950 border border-slate-800 rounded-xl p-4 min-w-0 space-y-3">
            <div className="flex items-center justify-between gap-2">
              <h5 className="text-xs font-bold text-white flex items-center gap-1.5">
                <Server className="w-3.5 h-3.5 text-cyan-400" />
                Segmentação por Provedor ({costLabelSuffix})
              </h5>
              <span className="text-[11px] font-mono tabular-nums text-slate-400">
                {providerData.length} provedor(es) · clique p/ filtrar
              </span>
            </div>
            <div className="relative grid grid-cols-1 sm:grid-cols-5 gap-2 items-center">
              {providerData.length === 0 && (
                <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center">
                  <span className="px-3 py-1.5 rounded-lg bg-slate-900/90 border border-slate-800 text-[11px] text-slate-400 font-mono">
                    Aguardando logs por provedor
                  </span>
                </div>
              )}
              <div className="sm:col-span-3 h-[270px]">
                <ResponsiveContainer width="100%" height="100%" minWidth={0}>
                  {metricMode === 'both' ? (
                    <ComposedChart data={providerData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                      <XAxis dataKey="name" stroke="#94a3b8" fontSize={11} />
                      <YAxis
                        yAxisId="left"
                        stroke="#06b6d4"
                        fontSize={11}
                        tickFormatter={(v) => fmtCompactTokens(Number(v))}
                      />
                      <YAxis
                        yAxisId="right"
                        orientation="right"
                        stroke="#10b981"
                        fontSize={11}
                        tickFormatter={(v) => `$${Number(v).toFixed(3)}`}
                      />
                      <Tooltip content={<CustomUsageTooltip />} />
                      <Bar
                        yAxisId="left"
                        dataKey="tokens"
                        name="Tokens Totais"
                        radius={[6, 6, 0, 0]}
                        className="cursor-pointer"
                        onClick={(data: any) => toggleProviderFilter(extractName(data))}
                      >
                        {providerData.map((entry, idx) => (
                          <Cell
                            key={entry.name}
                            fill={CHART_PALETTE[idx % CHART_PALETTE.length]}
                            fillOpacity={
                              filters.providerId === 'all' || filters.providerId === entry.name ? 0.95 : 0.28
                            }
                          />
                        ))}
                      </Bar>
                      <Line
                        yAxisId="right"
                        type="monotone"
                        dataKey="costUsd"
                        name="Custo USD"
                        stroke="#10b981"
                        strokeWidth={2}
                        dot={{ r: 3.5, fill: '#10b981' }}
                      />
                    </ComposedChart>
                  ) : (
                    <BarChart data={providerData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                      <XAxis dataKey="name" stroke="#94a3b8" fontSize={11} />
                      <YAxis stroke="#94a3b8" fontSize={11} tickFormatter={formatYAxis} />
                      <Tooltip content={<CustomUsageTooltip />} />
                      {metricMode !== 'tokens' ? (
                        <Bar
                          dataKey={costDataKey}
                          name={costLabelSuffix}
                          radius={[6, 6, 0, 0]}
                          className="cursor-pointer"
                          onClick={(data: any) => toggleProviderFilter(extractName(data))}
                        >
                          {providerData.map((entry, idx) => (
                            <Cell
                              key={entry.name}
                              fill={CHART_PALETTE[idx % CHART_PALETTE.length]}
                              fillOpacity={
                                filters.providerId === 'all' || filters.providerId === entry.name ? 0.95 : 0.28
                              }
                            />
                          ))}
                        </Bar>
                      ) : (
                        <>
                          <Bar
                            dataKey="inputTokens"
                            name="Entrada"
                            stackId="tok"
                            fill="#06b6d4"
                            className="cursor-pointer"
                            onClick={(data: any) => toggleProviderFilter(extractName(data))}
                          >
                            {providerData.map((entry) => (
                              <Cell
                                key={entry.name}
                                fill="#06b6d4"
                                fillOpacity={
                                  filters.providerId === 'all' || filters.providerId === entry.name ? 0.95 : 0.28
                                }
                              />
                            ))}
                          </Bar>
                          <Bar
                            dataKey="outputTokens"
                            name="Saída"
                            stackId="tok"
                            fill="#8b5cf6"
                            radius={[6, 6, 0, 0]}
                            className="cursor-pointer"
                            onClick={(data: any) => toggleProviderFilter(extractName(data))}
                          >
                            {providerData.map((entry) => (
                              <Cell
                                key={entry.name}
                                fill="#8b5cf6"
                                fillOpacity={
                                  filters.providerId === 'all' || filters.providerId === entry.name ? 0.95 : 0.28
                                }
                              />
                            ))}
                          </Bar>
                        </>
                      )}
                    </BarChart>
                  )}
                </ResponsiveContainer>
              </div>
              <div className="sm:col-span-2 h-[270px]">
                <ResponsiveContainer width="100%" height="100%" minWidth={0}>
                  <PieChart>
                    <Pie
                      data={providerData}
                      dataKey={metricMode === 'tokens' ? 'tokens' : costDataKey}
                      nameKey="name"
                      cx="50%"
                      cy="46%"
                      innerRadius={42}
                      outerRadius={72}
                      paddingAngle={3}
                      className="cursor-pointer"
                      onClick={(data: any) => toggleProviderFilter(extractName(data))}
                    >
                      {providerData.map((entry, idx) => (
                        <Cell
                          key={entry.name}
                          fill={CHART_PALETTE[idx % CHART_PALETTE.length]}
                          fillOpacity={
                            filters.providerId === 'all' || filters.providerId === entry.name ? 0.95 : 0.28
                          }
                        />
                      ))}
                    </Pie>
                    <Tooltip content={<CustomUsageTooltip />} />
                    <Legend wrapperStyle={{ fontSize: '10px' }} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>

          {/* Gráfico 3: Consumo & Custo por Departamento */}
          <div className="bg-slate-950 border border-slate-800 rounded-xl p-4 min-w-0 space-y-3">
            <div className="flex items-center justify-between gap-2">
              <h5 className="text-xs font-bold text-white flex items-center gap-1.5">
                <Layers className="w-3.5 h-3.5 text-amber-400" />
                Consumo por Departamento ({costLabelSuffix})
              </h5>
              <span className="text-[11px] font-mono tabular-nums text-slate-400">
                {departmentData.length} depto(s) · clique p/ filtrar
              </span>
            </div>
            <div className="relative w-full h-[270px]">
              {departmentData.length === 0 && (
                <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center">
                  <span className="px-3 py-1.5 rounded-lg bg-slate-900/90 border border-slate-800 text-[11px] text-slate-400 font-mono">
                    Aguardando logs por departamento
                  </span>
                </div>
              )}
              <ResponsiveContainer width="100%" height="100%" minWidth={0}>
                {metricMode === 'both' ? (
                  <ComposedChart data={departmentData} margin={{ top: 8, right: 8, left: 0, bottom: 20 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                    <XAxis
                      dataKey="name"
                      stroke="#94a3b8"
                      fontSize={10}
                      interval={0}
                      angle={-15}
                      textAnchor="end"
                      height={48}
                    />
                    <YAxis
                      yAxisId="left"
                      stroke="#06b6d4"
                      fontSize={11}
                      tickFormatter={(v) => fmtCompactTokens(Number(v))}
                    />
                    <YAxis
                      yAxisId="right"
                      orientation="right"
                      stroke="#f59e0b"
                      fontSize={11}
                      tickFormatter={(v) => `$${Number(v).toFixed(3)}`}
                    />
                    <Tooltip content={<CustomUsageTooltip />} />
                    <Legend wrapperStyle={{ fontSize: '11px' }} />
                    <Bar
                      yAxisId="left"
                      dataKey="tokens"
                      name="Tokens Totais"
                      fill="#06b6d4"
                      radius={[6, 6, 0, 0]}
                      className="cursor-pointer"
                      onClick={(data: any) => toggleDepartmentFilter(extractName(data))}
                    >
                      {departmentData.map((entry) => (
                        <Cell
                          key={entry.name}
                          fill="#06b6d4"
                          fillOpacity={
                            filters.department === 'all' || filters.department === entry.name ? 0.95 : 0.28
                          }
                        />
                      ))}
                    </Bar>
                    <Line
                      yAxisId="right"
                      type="monotone"
                      dataKey="costUsd"
                      name="Custo Estimado (USD)"
                      stroke="#f59e0b"
                      strokeWidth={2.5}
                      dot={{ r: 3.5, fill: '#f59e0b' }}
                    />
                  </ComposedChart>
                ) : (
                  <BarChart data={departmentData} margin={{ top: 8, right: 12, left: 0, bottom: 20 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                    <XAxis
                      dataKey="name"
                      stroke="#94a3b8"
                      fontSize={10}
                      interval={0}
                      angle={-15}
                      textAnchor="end"
                      height={48}
                    />
                    <YAxis stroke="#94a3b8" fontSize={11} tickFormatter={formatYAxis} />
                    <Tooltip content={<CustomUsageTooltip />} />
                    <Legend wrapperStyle={{ fontSize: '11px' }} />
                    {metricMode !== 'tokens' ? (
                      <Bar
                        dataKey={costDataKey}
                        name={costLabelSuffix}
                        fill="#f59e0b"
                        radius={[6, 6, 0, 0]}
                        className="cursor-pointer"
                        onClick={(data: any) => toggleDepartmentFilter(extractName(data))}
                      >
                        {departmentData.map((entry) => (
                          <Cell
                            key={entry.name}
                            fill="#f59e0b"
                            fillOpacity={
                              filters.department === 'all' || filters.department === entry.name ? 0.95 : 0.28
                            }
                          />
                        ))}
                      </Bar>
                    ) : (
                      <>
                        <Bar
                          dataKey="inputTokens"
                          name="Tokens Entrada"
                          stackId="deptTok"
                          fill="#06b6d4"
                          className="cursor-pointer"
                          onClick={(data: any) => toggleDepartmentFilter(extractName(data))}
                        >
                          {departmentData.map((entry) => (
                            <Cell
                              key={entry.name}
                              fill="#06b6d4"
                              fillOpacity={
                                filters.department === 'all' || filters.department === entry.name ? 0.95 : 0.28
                              }
                            />
                          ))}
                        </Bar>
                        <Bar
                          dataKey="outputTokens"
                          name="Tokens Saída"
                          stackId="deptTok"
                          fill="#10b981"
                          radius={[6, 6, 0, 0]}
                          className="cursor-pointer"
                          onClick={(data: any) => toggleDepartmentFilter(extractName(data))}
                        >
                          {departmentData.map((entry) => (
                            <Cell
                              key={entry.name}
                              fill="#10b981"
                              fillOpacity={
                                filters.department === 'all' || filters.department === entry.name ? 0.95 : 0.28
                              }
                            />
                          ))}
                        </Bar>
                      </>
                    )}
                  </BarChart>
                )}
              </ResponsiveContainer>
            </div>
          </div>

          {/* Gráfico 4: Ranking de Modelos */}
          <div className="bg-slate-950 border border-slate-800 rounded-xl p-4 min-w-0 space-y-3">
            <div className="flex items-center justify-between gap-2">
              <h5 className="text-xs font-bold text-white flex items-center gap-1.5">
                <Cpu className="w-3.5 h-3.5 text-violet-400" />
                Top Modelos ({costLabelSuffix})
              </h5>
              <span className="text-[11px] font-mono tabular-nums text-slate-400">
                Top {modelData.length} · clique p/ filtrar
              </span>
            </div>
            <div className="relative w-full h-[270px]">
              {modelData.length === 0 && (
                <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center">
                  <span className="px-3 py-1.5 rounded-lg bg-slate-900/90 border border-slate-800 text-[11px] text-slate-400 font-mono">
                    Aguardando logs por modelo
                  </span>
                </div>
              )}
              <ResponsiveContainer width="100%" height="100%" minWidth={0}>
                {metricMode === 'both' ? (
                  <BarChart
                    data={modelData}
                    layout="vertical"
                    margin={{ top: 4, right: 16, left: 10, bottom: 4 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                    <XAxis
                      xAxisId="cost"
                      type="number"
                      orientation="top"
                      stroke="#10b981"
                      fontSize={10}
                      tickFormatter={(v) => `$${Number(v).toFixed(3)}`}
                    />
                    <XAxis
                      xAxisId="tokens"
                      type="number"
                      orientation="bottom"
                      stroke="#06b6d4"
                      fontSize={10}
                      tickFormatter={(v) => fmtCompactTokens(Number(v))}
                    />
                    <YAxis type="category" dataKey="name" stroke="#cbd5e1" fontSize={10} width={145} />
                    <Tooltip content={<CustomUsageTooltip />} />
                    <Legend wrapperStyle={{ fontSize: '11px' }} />
                    <Bar
                      xAxisId="cost"
                      dataKey="costUsd"
                      name="Custo Estimado (USD)"
                      fill="#10b981"
                      radius={[0, 4, 4, 0]}
                      barSize={9}
                      className="cursor-pointer"
                      onClick={(data: any) => toggleModelFilter(extractModelId(data))}
                    >
                      {modelData.map((entry) => (
                        <Cell
                          key={entry.name}
                          fill="#10b981"
                          fillOpacity={
                            filters.modelId === 'all' || filters.modelId === entry.modelId ? 0.95 : 0.28
                          }
                        />
                      ))}
                    </Bar>
                    <Bar
                      xAxisId="tokens"
                      dataKey="tokens"
                      name="Tokens Totais"
                      fill="#8b5cf6"
                      radius={[0, 4, 4, 0]}
                      barSize={9}
                      className="cursor-pointer"
                      onClick={(data: any) => toggleModelFilter(extractModelId(data))}
                    >
                      {modelData.map((entry) => (
                        <Cell
                          key={entry.name}
                          fill="#8b5cf6"
                          fillOpacity={
                            filters.modelId === 'all' || filters.modelId === entry.modelId ? 0.9 : 0.25
                          }
                        />
                      ))}
                    </Bar>
                  </BarChart>
                ) : (
                  <BarChart
                    data={modelData}
                    layout="vertical"
                    margin={{ top: 4, right: 16, left: 10, bottom: 4 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                    <XAxis
                      type="number"
                      stroke="#94a3b8"
                      fontSize={11}
                      tickFormatter={(v) =>
                        metricMode === 'tokens' ? fmtCompactTokens(Number(v)) : formatCostAxis(Number(v))
                      }
                    />
                    <YAxis type="category" dataKey="name" stroke="#cbd5e1" fontSize={10} width={145} />
                    <Tooltip content={<CustomUsageTooltip />} />
                    <Legend wrapperStyle={{ fontSize: '11px' }} />
                    {metricMode !== 'tokens' ? (
                      <Bar
                        dataKey={costDataKey}
                        name={costLabelSuffix}
                        fill="#8b5cf6"
                        radius={[0, 6, 6, 0]}
                        className="cursor-pointer"
                        onClick={(data: any) => toggleModelFilter(extractModelId(data))}
                      >
                        {modelData.map((entry) => (
                          <Cell
                            key={entry.name}
                            fill="#8b5cf6"
                            fillOpacity={
                              filters.modelId === 'all' || filters.modelId === entry.modelId ? 0.95 : 0.28
                            }
                          />
                        ))}
                      </Bar>
                    ) : (
                      <>
                        <Bar
                          dataKey="inputTokens"
                          name="Entrada"
                          stackId="modTok"
                          fill="#06b6d4"
                          className="cursor-pointer"
                          onClick={(data: any) => toggleModelFilter(extractModelId(data))}
                        >
                          {modelData.map((entry) => (
                            <Cell
                              key={entry.name}
                              fill="#06b6d4"
                              fillOpacity={
                                filters.modelId === 'all' || filters.modelId === entry.modelId ? 0.95 : 0.28
                              }
                            />
                          ))}
                        </Bar>
                        <Bar
                          dataKey="outputTokens"
                          name="Saída"
                          stackId="modTok"
                          fill="#ec4899"
                          radius={[0, 6, 6, 0]}
                          className="cursor-pointer"
                          onClick={(data: any) => toggleModelFilter(extractModelId(data))}
                        >
                          {modelData.map((entry) => (
                            <Cell
                              key={entry.name}
                              fill="#ec4899"
                              fillOpacity={
                                filters.modelId === 'all' || filters.modelId === entry.modelId ? 0.95 : 0.28
                              }
                            />
                          ))}
                        </Bar>
                      </>
                    )}
                  </BarChart>
                )}
              </ResponsiveContainer>
            </div>
          </div>
      </div>

      {/* Tabela Comparativa Sincronizada (Provedor / Departamento / Modelo) */}
      <div className="bg-slate-950 border border-slate-800 rounded-xl p-4 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="text-xs font-bold text-white">Detalhamento Tabular por Dimensão</div>
          <div className="flex items-center gap-1 bg-slate-900 border border-slate-800 rounded-lg p-0.5 text-[11px]">
            {([
              ['provider', `Provedores (${providerData.length})`],
              ['department', `Departamentos (${departmentData.length})`],
              ['model', `Modelos (${modelData.length})`],
            ] as const).map(([tabId, label]) => (
              <button
                key={tabId}
                type="button"
                onClick={() => setBreakdownTab(tabId)}
                className={`px-2.5 py-1 rounded-md font-medium whitespace-nowrap transition-colors ${
                  breakdownTab === tabId ? 'bg-cyan-600 text-white' : 'text-slate-400 hover:text-white'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="border-b border-slate-800 text-[11px] text-slate-400">
                <th className="py-2 pr-3 font-medium">
                  {breakdownTab === 'provider' ? 'Provedor' : breakdownTab === 'department' ? 'Departamento' : 'Provedor / Modelo'}
                </th>
                <th className="py-2 px-3 text-right font-medium">Requisições</th>
                <th className="py-2 px-3 text-right font-medium">Entrada (tok)</th>
                <th className="py-2 px-3 text-right font-medium">Saída (tok)</th>
                <th className="py-2 px-3 text-right font-medium">Total Tokens</th>
                <th className="py-2 px-3 text-right font-medium">Custo USD</th>
                <th className="py-2 pl-3 text-right font-medium">Custo BRL</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/70 font-mono tabular-nums">
              {(() => {
                const rows =
                  breakdownTab === 'provider'
                    ? providerData
                    : breakdownTab === 'department'
                      ? departmentData
                      : modelData;
                if (rows.length === 0) {
                  return (
                    <tr>
                      <td colSpan={7} className="py-4 text-center font-sans text-slate-500">
                        Nenhum registro de consumo para esta segmentação no período selecionado.
                      </td>
                    </tr>
                  );
                }
                return rows.map((row: any) => {
                  const isActive =
                    (breakdownTab === 'provider' && filters.providerId === row.name) ||
                    (breakdownTab === 'department' && filters.department === row.name) ||
                    (breakdownTab === 'model' && filters.modelId === row.modelId);
                  return (
                    <tr
                      key={row.name}
                      onClick={() => {
                        if (breakdownTab === 'provider') toggleProviderFilter(row.name);
                        else if (breakdownTab === 'department') toggleDepartmentFilter(row.name);
                        else toggleModelFilter(row.modelId);
                      }}
                      className={`cursor-pointer transition-colors ${
                        isActive ? 'bg-cyan-500/10 text-cyan-200' : 'hover:bg-slate-900/70 text-slate-200'
                      }`}
                    >
                      <td className="py-2 pr-3 font-sans font-medium text-white">{row.name}</td>
                      <td className="py-2 px-3 text-right text-slate-300">{row.requests.toLocaleString('pt-BR')}</td>
                      <td className="py-2 px-3 text-right text-cyan-300">{row.inputTokens.toLocaleString('pt-BR')}</td>
                      <td className="py-2 px-3 text-right text-violet-300">{row.outputTokens.toLocaleString('pt-BR')}</td>
                      <td className="py-2 px-3 text-right font-semibold text-white">{row.tokens.toLocaleString('pt-BR')}</td>
                      <td className="py-2 px-3 text-right text-emerald-400 font-semibold">{fmtUsd(row.costUsd)}</td>
                      <td className="py-2 pl-3 text-right text-emerald-300">{fmtBrl(row.costBrl)}</td>
                    </tr>
                  );
                });
              })()}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
