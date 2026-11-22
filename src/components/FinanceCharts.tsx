import React, { useMemo, useState } from 'react';
import {
  Area,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ComposedChart,
  Line,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { formatCurrencyBRL } from '../lib/api';

export interface FinanceMonthlyPoint {
  month: string;
  receivables: number;
  received: number;
  pendingReceivables: number;
  payables: number;
  paidPayables: number;
  pendingPayables: number;
  mediaBudget: number;
  netResult: number;
  cashNetResult: number;
  marginPct: number;
}

export interface FinanceSummaryPayload {
  scope?: 'organization' | 'client';
  agencyRevenue?: number;
  receivedRevenue?: number;
  pendingReceivables?: number;
  mediaBudgetSeparated?: number;
  totalPayable?: number;
  paidPayables?: number;
  pendingPayables?: number;
  netOperatingResult?: number;
  operatingMargin?: string;
  monthlySeries?: FinanceMonthlyPoint[];
  separationRule?: string;
}

interface FinanceChartsProps {
  financeSummary: FinanceSummaryPayload | null;
  receivables?: Array<{
    amount?: number;
    paidAmount?: number;
    dueDate?: string;
    paidAt?: string | null;
    mediaBudget?: number;
  }>;
  payables?: Array<{
    amount?: number;
    dueDate?: string;
    status?: string;
  }>;
}

const MONTH_LABELS_PT = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];

function formatMonthLabel(monthKey: string): string {
  const match = /^(\d{4})-(\d{2})$/.exec(monthKey);
  if (!match) return monthKey;
  const yearShort = match[1].slice(2);
  const monthIdx = Number(match[2]) - 1;
  const label = MONTH_LABELS_PT[monthIdx] || match[2];
  return `${label}/${yearShort}`;
}

function formatCompactBrlAxis(value: number): string {
  const abs = Math.abs(value);
  const sign = value < 0 ? '-' : '';
  if (abs >= 1_000_000) return `${sign}R$ ${(abs / 1_000_000).toFixed(1)}M`;
  if (abs >= 1_000) {
    const k = abs / 1_000;
    return `${sign}R$ ${Number.isInteger(k) ? k.toFixed(0) : k.toFixed(1)}k`;
  }
  return `${sign}R$ ${abs.toFixed(0)}`;
}

function deriveMonthlySeriesFromRecords(
  receivables: NonNullable<FinanceChartsProps['receivables']>,
  payables: NonNullable<FinanceChartsProps['payables']>
): FinanceMonthlyPoint[] {
  const map = new Map<string, FinanceMonthlyPoint>();
  const getMonthKey = (dateStr?: string | null): string => {
    if (typeof dateStr === 'string' && /^\d{4}-\d{2}/.test(dateStr.trim())) {
      return dateStr.trim().slice(0, 7);
    }
    return new Date().toISOString().slice(0, 7);
  };
  const ensure = (month: string): FinanceMonthlyPoint => {
    let row = map.get(month);
    if (!row) {
      row = {
        month,
        receivables: 0,
        received: 0,
        pendingReceivables: 0,
        payables: 0,
        paidPayables: 0,
        pendingPayables: 0,
        mediaBudget: 0,
        netResult: 0,
        cashNetResult: 0,
        marginPct: 0,
      };
      map.set(month, row);
    }
    return row;
  };

  for (const r of receivables) {
    const row = ensure(getMonthKey(r.dueDate || r.paidAt));
    const amt = Number(r.amount || 0);
    const paid = Number(r.paidAmount || 0);
    row.receivables += amt;
    row.received += paid;
    row.pendingReceivables += Math.max(0, amt - paid);
    row.mediaBudget += Number(r.mediaBudget || 0);
  }

  for (const p of payables) {
    const row = ensure(getMonthKey(p.dueDate));
    const amt = Number(p.amount || 0);
    row.payables += amt;
    if (p.status === 'Pago') {
      row.paidPayables += amt;
    } else {
      row.pendingPayables += amt;
    }
  }

  return Array.from(map.values())
    .sort((a, b) => a.month.localeCompare(b.month))
    .map((item) => {
      const netResult = Number((item.receivables - item.payables).toFixed(2));
      const cashNetResult = Number((item.received - item.paidPayables).toFixed(2));
      const marginPct =
        item.receivables > 0 ? Number(((netResult / item.receivables) * 100).toFixed(1)) : 0;
      return {
        ...item,
        receivables: Number(item.receivables.toFixed(2)),
        received: Number(item.received.toFixed(2)),
        pendingReceivables: Number(item.pendingReceivables.toFixed(2)),
        payables: Number(item.payables.toFixed(2)),
        paidPayables: Number(item.paidPayables.toFixed(2)),
        pendingPayables: Number(item.pendingPayables.toFixed(2)),
        mediaBudget: Number(item.mediaBudget.toFixed(2)),
        netResult,
        cashNetResult,
        marginPct,
      };
    });
}

function PnlTooltip({ active, payload, label, basis }: any) {
  if (!active || !payload || payload.length === 0) return null;
  const row = payload[0]?.payload;
  const rev = basis === 'cash' ? Number(row?.received || 0) : Number(row?.receivables || 0);
  const exp = basis === 'cash' ? Number(row?.paidPayables || 0) : Number(row?.payables || 0);
  const net = basis === 'cash' ? Number(row?.cashNetResult || 0) : Number(row?.netResult || 0);
  const margin = rev > 0 ? ((net / rev) * 100).toFixed(1) : '0.0';

  return (
    <div className="bg-slate-950/95 border border-slate-700 rounded-xl px-3.5 py-2.5 shadow-xl text-xs space-y-1.5 min-w-[205px]">
      <div className="font-semibold text-white border-b border-slate-800 pb-1 flex items-center justify-between gap-4">
        <span>{label}</span>
        <span className="text-slate-400 font-normal">
          {basis === 'cash' ? 'Regime de Caixa' : 'Competência'}
        </span>
      </div>
      <div className="flex items-center justify-between gap-4">
        <span className="text-cyan-300">Receita Agência</span>
        <span className="font-mono tabular-nums text-white">{formatCurrencyBRL(rev)}</span>
      </div>
      <div className="flex items-center justify-between gap-4">
        <span className="text-rose-300">Contas a Pagar</span>
        <span className="font-mono tabular-nums text-white">{formatCurrencyBRL(exp)}</span>
      </div>
      <div className="flex items-center justify-between gap-4 pt-1 border-t border-slate-800">
        <span className={net >= 0 ? 'text-emerald-300 font-medium' : 'text-rose-300 font-medium'}>
          Resultado (P&L)
        </span>
        <span className={`font-mono tabular-nums font-semibold ${net >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
          {formatCurrencyBRL(net)}
        </span>
      </div>
      <div className="flex items-center justify-between gap-4 text-[11px] text-slate-400">
        <span>Margem Operacional</span>
        <span className="font-mono tabular-nums text-slate-200">{margin}%</span>
      </div>
    </div>
  );
}

function ComparisonTooltip({ active, payload, label, mode }: any) {
  if (!active || !payload || payload.length === 0) return null;
  const row = payload[0]?.payload;

  if (mode === 'summary') {
    return (
      <div className="bg-slate-950/95 border border-slate-700 rounded-xl px-3.5 py-2.5 shadow-xl text-xs space-y-1.5 min-w-[200px]">
        <div className="font-semibold text-white border-b border-slate-800 pb-1">{label}</div>
        {row.settled > 0 && (
          <div className="flex items-center justify-between gap-4">
            <span className="text-emerald-300">{row.settledLabel}</span>
            <span className="font-mono tabular-nums text-white">{formatCurrencyBRL(row.settled)}</span>
          </div>
        )}
        {row.open > 0 && (
          <div className="flex items-center justify-between gap-4">
            <span className="text-amber-300">{row.openLabel}</span>
            <span className="font-mono tabular-nums text-white">{formatCurrencyBRL(row.open)}</span>
          </div>
        )}
        <div className="flex items-center justify-between gap-4 pt-1 border-t border-slate-800">
          <span className="text-slate-300 font-medium">Total</span>
          <span className="font-mono tabular-nums font-semibold text-white">
            {formatCurrencyBRL(row.total)}
          </span>
        </div>
      </div>
    );
  }

  const diff = Number(row?.receivables || 0) - Number(row?.payables || 0);
  return (
    <div className="bg-slate-950/95 border border-slate-700 rounded-xl px-3.5 py-2.5 shadow-xl text-xs space-y-1.5 min-w-[200px]">
      <div className="font-semibold text-white border-b border-slate-800 pb-1">{label}</div>
      <div className="flex items-center justify-between gap-4">
        <span className="text-cyan-300">Recebíveis</span>
        <span className="font-mono tabular-nums text-white">{formatCurrencyBRL(row?.receivables || 0)}</span>
      </div>
      <div className="flex items-center justify-between gap-4">
        <span className="text-rose-300">Pagáveis</span>
        <span className="font-mono tabular-nums text-white">{formatCurrencyBRL(row?.payables || 0)}</span>
      </div>
      <div className="flex items-center justify-between gap-4 pt-1 border-t border-slate-800">
        <span className="text-slate-300">Saldo do Mês</span>
        <span className={`font-mono tabular-nums font-semibold ${diff >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
          {formatCurrencyBRL(diff)}
        </span>
      </div>
    </div>
  );
}

export function FinanceCharts({
  financeSummary,
  receivables = [],
  payables = [],
}: FinanceChartsProps) {
  const [pnlBasis, setPnlBasis] = useState<'accrual' | 'cash'>('accrual');
  const [comparisonView, setComparisonView] = useState<'summary' | 'monthly'>('summary');

  const monthlyData = useMemo(() => {
    const rawSeries =
      Array.isArray(financeSummary?.monthlySeries) && financeSummary.monthlySeries.length > 0
        ? financeSummary.monthlySeries
        : deriveMonthlySeriesFromRecords(receivables, payables);

    return rawSeries.map((pt) => ({
      ...pt,
      label: formatMonthLabel(pt.month),
      activeRevenue: pnlBasis === 'cash' ? pt.received : pt.receivables,
      activeExpenses: pnlBasis === 'cash' ? pt.paidPayables : pt.payables,
      activeNet: pnlBasis === 'cash' ? pt.cashNetResult : pt.netResult,
    }));
  }, [financeSummary?.monthlySeries, receivables, payables, pnlBasis]);

  const agencyRevenue = Number(financeSummary?.agencyRevenue || 0);
  const receivedRevenue = Number(financeSummary?.receivedRevenue || 0);
  const pendingReceivables =
    financeSummary?.pendingReceivables !== undefined
      ? Number(financeSummary.pendingReceivables)
      : Math.max(0, agencyRevenue - receivedRevenue);
  const totalPayable = Number(financeSummary?.totalPayable || 0);
  const paidPayables =
    financeSummary?.paidPayables !== undefined
      ? Number(financeSummary.paidPayables)
      : payables
          .filter((p) => p.status === 'Pago')
          .reduce((sum, p) => sum + Number(p.amount || 0), 0);
  const pendingPayables =
    financeSummary?.pendingPayables !== undefined
      ? Number(financeSummary.pendingPayables)
      : Math.max(0, totalPayable - paidPayables);
  const netOperatingResult =
    financeSummary?.netOperatingResult !== undefined
      ? Number(financeSummary.netOperatingResult)
      : agencyRevenue - totalPayable;

  const summaryComparisonData = useMemo(
    () => [
      {
        category: 'A Receber',
        settled: Number(receivedRevenue.toFixed(2)),
        open: Number(pendingReceivables.toFixed(2)),
        total: Number(agencyRevenue.toFixed(2)),
        settledLabel: 'Recebido',
        openLabel: 'Em Aberto',
        settledColor: '#10b981',
        openColor: '#f59e0b',
      },
      {
        category: 'A Pagar',
        settled: Number(paidPayables.toFixed(2)),
        open: Number(pendingPayables.toFixed(2)),
        total: Number(totalPayable.toFixed(2)),
        settledLabel: 'Pago',
        openLabel: 'Em Aberto',
        settledColor: '#fb7185',
        openColor: '#e11d48',
      },
      {
        category: 'P&L Líquido',
        settled: Number(Math.max(0, netOperatingResult).toFixed(2)),
        open: Number(netOperatingResult < 0 ? Math.abs(netOperatingResult).toFixed(2) : 0),
        total: Number(netOperatingResult.toFixed(2)),
        settledLabel: 'Lucro Operacional',
        openLabel: 'Déficit Operacional',
        settledColor: '#06b6d4',
        openColor: '#dc2626',
      },
    ],
    [agencyRevenue, receivedRevenue, pendingReceivables, totalPayable, paidPayables, pendingPayables, netOperatingResult]
  );

  const hasData =
    monthlyData.length > 0 || agencyRevenue > 0 || totalPayable > 0 || receivedRevenue > 0;

  const collectionRatePct =
    agencyRevenue > 0 ? ((receivedRevenue / agencyRevenue) * 100).toFixed(1) : '0.0';
  const coverageRatio =
    totalPayable > 0 ? `${(agencyRevenue / totalPayable).toFixed(2)}x` : agencyRevenue > 0 ? '∞' : '0.00x';

  if (!hasData) {
    return (
      <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-8 text-center space-y-2">
        <h3 className="text-base font-semibold text-white">Gráficos Financeiros & Tendência de P&L</h3>
        <p className="text-sm text-slate-400 max-w-lg mx-auto">
          Assim que títulos a receber ou contas a pagar forem registrados para a organização, as curvas mensais de P&L e o comparativo entre recebíveis e pagáveis serão exibidos aqui.
        </p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
      {/* Chart 1: Monthly P&L Trends */}
      <section className="bg-slate-900/60 border border-slate-800 rounded-2xl p-6 flex flex-col justify-between gap-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="space-y-1">
            <h3 className="text-base font-semibold text-white tracking-tight">
              Tendência Mensal de P&L
            </h3>
            <div className="flex flex-wrap items-center gap-2 text-xs text-slate-400">
              <span className="text-cyan-400">Receita Agência</span>
              <span aria-hidden="true">·</span>
              <span className="text-rose-400">Contas a Pagar</span>
              <span aria-hidden="true">·</span>
              <span className="text-emerald-400">Resultado Líquido</span>
            </div>
          </div>

          <div
            className="flex items-center gap-1 p-1 bg-slate-950 border border-slate-800 rounded-lg shrink-0"
            role="tablist"
            aria-label="Base de cálculo do P&L"
          >
            <button
              type="button"
              role="tab"
              aria-selected={pnlBasis === 'accrual'}
              onClick={() => setPnlBasis('accrual')}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
                pnlBasis === 'accrual'
                  ? 'bg-slate-800 text-white'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Competência
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={pnlBasis === 'cash'}
              onClick={() => setPnlBasis('cash')}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
                pnlBasis === 'cash'
                  ? 'bg-slate-800 text-white'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Caixa
            </button>
          </div>
        </div>

        <div className="w-full h-[270px]">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={monthlyData} margin={{ top: 10, right: 12, left: 4, bottom: 4 }}>
              <defs>
                <linearGradient id="nerPnlNetGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#10b981" stopOpacity={0.28} />
                  <stop offset="100%" stopColor="#10b981" stopOpacity={0.02} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} />
              <XAxis
                dataKey="label"
                stroke="#64748b"
                tick={{ fill: '#94a3b8', fontSize: 12 }}
                axisLine={{ stroke: '#1e293b' }}
                tickLine={false}
              />
              <YAxis
                stroke="#64748b"
                tick={{ fill: '#94a3b8', fontSize: 11 }}
                tickFormatter={formatCompactBrlAxis}
                axisLine={false}
                tickLine={false}
                width={68}
              />
              <ReferenceLine y={0} stroke="#334155" strokeWidth={1} />
              <Tooltip
                content={<PnlTooltip basis={pnlBasis} />}
                cursor={{ fill: 'rgba(148, 163, 184, 0.06)' }}
              />
              <Area
                type="monotone"
                dataKey="activeNet"
                name="Resultado (P&L)"
                fill="url(#nerPnlNetGradient)"
                stroke="none"
              />
              <Bar
                dataKey="activeRevenue"
                name="Receita Agência"
                fill="#06b6d4"
                radius={[4, 4, 0, 0]}
                maxBarSize={32}
              />
              <Bar
                dataKey="activeExpenses"
                name="Contas a Pagar"
                fill="#f43f5e"
                radius={[4, 4, 0, 0]}
                maxBarSize={32}
              />
              <Line
                type="monotone"
                dataKey="activeNet"
                name="Resultado (P&L)"
                stroke="#10b981"
                strokeWidth={2.5}
                dot={{ r: 4, fill: '#10b981', stroke: '#0f172a', strokeWidth: 2 }}
                activeDot={{ r: 6, fill: '#34d399', stroke: '#0f172a', strokeWidth: 2 }}
              />
            </ComposedChart>
          </ResponsiveContainer>
        </div>

        <div className="pt-4 border-t border-slate-800/80 grid grid-cols-3 gap-4 text-xs">
          <div>
            <div className="text-slate-400">
              {pnlBasis === 'cash' ? 'Receita Recebida' : 'Receita Faturada'}
            </div>
            <div className="font-mono tabular-nums text-sm font-semibold text-cyan-300 mt-0.5">
              {formatCurrencyBRL(pnlBasis === 'cash' ? receivedRevenue : agencyRevenue)}
            </div>
          </div>
          <div>
            <div className="text-slate-400">
              {pnlBasis === 'cash' ? 'Despesas Pagas' : 'Total Despesas'}
            </div>
            <div className="font-mono tabular-nums text-sm font-semibold text-rose-300 mt-0.5">
              {formatCurrencyBRL(pnlBasis === 'cash' ? paidPayables : totalPayable)}
            </div>
          </div>
          <div>
            <div className="text-slate-400">Margem P&L</div>
            <div className="font-mono tabular-nums text-sm font-semibold text-emerald-400 mt-0.5">
              {pnlBasis === 'cash'
                ? receivedRevenue > 0
                  ? `${(((receivedRevenue - paidPayables) / receivedRevenue) * 100).toFixed(1)}%`
                  : '0.0%'
                : financeSummary?.operatingMargin || '0.0%'}
            </div>
          </div>
        </div>
      </section>

      {/* Chart 2: Receivables vs Payables */}
      <section className="bg-slate-900/60 border border-slate-800 rounded-2xl p-6 flex flex-col justify-between gap-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="space-y-1">
            <h3 className="text-base font-semibold text-white tracking-tight">
              Recebíveis vs Pagáveis
            </h3>
            <div className="flex flex-wrap items-center gap-2 text-xs text-slate-400">
              {comparisonView === 'summary' ? (
                <>
                  <span className="text-emerald-400">Liquidado</span>
                  <span aria-hidden="true">·</span>
                  <span className="text-amber-400">Em Aberto</span>
                  <span aria-hidden="true">·</span>
                  <span className="text-cyan-400">Saldo Operacional</span>
                </>
              ) : (
                <>
                  <span className="text-cyan-400">Recebíveis (Honorários)</span>
                  <span aria-hidden="true">·</span>
                  <span className="text-rose-400">Pagáveis (Custos)</span>
                </>
              )}
            </div>
          </div>

          <div
            className="flex items-center gap-1 p-1 bg-slate-950 border border-slate-800 rounded-lg shrink-0"
            role="tablist"
            aria-label="Visão de Recebíveis vs Pagáveis"
          >
            <button
              type="button"
              role="tab"
              aria-selected={comparisonView === 'summary'}
              onClick={() => setComparisonView('summary')}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
                comparisonView === 'summary'
                  ? 'bg-slate-800 text-white'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Consolidado
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={comparisonView === 'monthly'}
              onClick={() => setComparisonView('monthly')}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
                comparisonView === 'monthly'
                  ? 'bg-slate-800 text-white'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Por Mês
            </button>
          </div>
        </div>

        <div className="w-full h-[270px]">
          <ResponsiveContainer width="100%" height="100%">
            {comparisonView === 'summary' ? (
              <BarChart
                data={summaryComparisonData}
                margin={{ top: 10, right: 12, left: 4, bottom: 4 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} />
                <XAxis
                  dataKey="category"
                  stroke="#64748b"
                  tick={{ fill: '#94a3b8', fontSize: 12 }}
                  axisLine={{ stroke: '#1e293b' }}
                  tickLine={false}
                />
                <YAxis
                  stroke="#64748b"
                  tick={{ fill: '#94a3b8', fontSize: 11 }}
                  tickFormatter={formatCompactBrlAxis}
                  axisLine={false}
                  tickLine={false}
                  width={68}
                />
                <Tooltip
                  content={<ComparisonTooltip mode="summary" />}
                  cursor={{ fill: 'rgba(148, 163, 184, 0.06)' }}
                />
                <Bar dataKey="settled" stackId="a" radius={[0, 0, 4, 4]} maxBarSize={54}>
                  {summaryComparisonData.map((entry) => (
                    <Cell key={`settled-${entry.category}`} fill={entry.settledColor} />
                  ))}
                </Bar>
                <Bar dataKey="open" stackId="a" radius={[4, 4, 0, 0]} maxBarSize={54}>
                  {summaryComparisonData.map((entry) => (
                    <Cell key={`open-${entry.category}`} fill={entry.openColor} />
                  ))}
                </Bar>
              </BarChart>
            ) : (
              <BarChart data={monthlyData} margin={{ top: 10, right: 12, left: 4, bottom: 4 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} />
                <XAxis
                  dataKey="label"
                  stroke="#64748b"
                  tick={{ fill: '#94a3b8', fontSize: 12 }}
                  axisLine={{ stroke: '#1e293b' }}
                  tickLine={false}
                />
                <YAxis
                  stroke="#64748b"
                  tick={{ fill: '#94a3b8', fontSize: 11 }}
                  tickFormatter={formatCompactBrlAxis}
                  axisLine={false}
                  tickLine={false}
                  width={68}
                />
                <Tooltip
                  content={<ComparisonTooltip mode="monthly" />}
                  cursor={{ fill: 'rgba(148, 163, 184, 0.06)' }}
                />
                <Bar
                  dataKey="receivables"
                  name="Recebíveis"
                  fill="#06b6d4"
                  radius={[4, 4, 0, 0]}
                  maxBarSize={36}
                />
                <Bar
                  dataKey="payables"
                  name="Pagáveis"
                  fill="#f43f5e"
                  radius={[4, 4, 0, 0]}
                  maxBarSize={36}
                />
              </BarChart>
            )}
          </ResponsiveContainer>
        </div>

        <div className="pt-4 border-t border-slate-800/80 grid grid-cols-3 gap-4 text-xs">
          <div>
            <div className="text-slate-400">Taxa de Recebimento</div>
            <div className="font-mono tabular-nums text-sm font-semibold text-emerald-400 mt-0.5">
              {collectionRatePct}%
            </div>
          </div>
          <div>
            <div className="text-slate-400">Pendente a Receber</div>
            <div className="font-mono tabular-nums text-sm font-semibold text-amber-300 mt-0.5">
              {formatCurrencyBRL(pendingReceivables)}
            </div>
          </div>
          <div>
            <div className="text-slate-400">Cobertura Rec / Pag</div>
            <div className="font-mono tabular-nums text-sm font-semibold text-white mt-0.5">
              {coverageRatio}
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
