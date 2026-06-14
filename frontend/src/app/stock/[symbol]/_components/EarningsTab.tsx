'use client';

import { useMemo, useState } from 'react';
import { AnalysisSection, AIPaywall } from './shared';
import { SectionCard, SubsectionHeader } from './StockDetailContent';
import { useTranscript } from '@/hooks/queries/use-stock-data';
import { formatCurrencyAmount } from '@/lib/currency';

// =============================================================================
// Types
// =============================================================================

interface EarningsSurprise {
  quarter: string;
  eps_actual: number | null;
  eps_estimate: number | null;
  surprise_percent: number | null;
}

interface RevenueSegment {
  fiscal_year: number | null;
  period: string | null;
  date: string | null;
  data: Record<string, number>;
}

interface GrowthData {
  date: string;
  revenueGrowth: number | null;
  grossProfitGrowth: number | null;
  operatingIncomeGrowth: number | null;
  netIncomeGrowth: number | null;
  epsdilutedGrowth: number | null;
  freeCashFlowGrowth: number | null;
  [key: string]: string | number | null;
}

interface AnalystEstimate {
  date: string;
  eps_avg: number | null;
  eps_low: number | null;
  eps_high: number | null;
  revenue_avg: number | null;
  revenue_low: number | null;
  revenue_high: number | null;
  ebitda_avg: number | null;
  net_income_avg: number | null;
  num_analysts_eps: number | null;
  num_analysts_revenue: number | null;
}

interface EarningsAnalysis {
  title: string;
  earnings_overview: string;
  guidance_outlook?: string;
  key_drivers?: string;
  revenue_and_segments?: string;
  financial_quality?: string;
  earnings_verdict: string;
  // Legacy fields (backward compat with cached analyses)
  transcript_insights?: string;
  key_debates?: string;
  revenue_breakdown?: string;
  profitability_cashflow?: string;
  balance_sheet_capital?: string;
  growth_trends?: string;
}

interface EarningsTabProps {
  symbol: string;
  companyName: string;
  currency?: string;
  earningsHistory: EarningsSurprise[];
  revenueSegments: RevenueSegment[];
  revenueGeoSegments?: RevenueSegment[];
  financialGrowth: GrowthData[];
  analystEstimates?: AnalystEstimate[];
  dcfValue?: number | null;
  stockPrice?: number | null;
  nextEarningsDate?: string | null;
  incomeStatements?: Array<Record<string, unknown>>;
  cashflowStatements?: Array<Record<string, unknown>>;
  balanceSheets?: Array<Record<string, unknown>>;
  earningsAnalysis: EarningsAnalysis | null;
  analysisLoading: boolean;
  onGenerate: () => void;
  onRegenerate: () => void;
  hasAIAccess?: boolean;
}

// =============================================================================
// Helpers
// =============================================================================

function fmt(v: number | null | undefined, opts?: { pct?: boolean; bn?: boolean; sign?: boolean; currency?: string }): string {
  if (v === null || v === undefined) return '--';
  if (opts?.pct) {
    const s = (v * 100).toFixed(1);
    return opts.sign && v > 0 ? `+${s}%` : `${s}%`;
  }
  if (opts?.bn) {
    return formatCurrencyAmount(v, { currency: opts?.currency, compact: true, maximumFractionDigits: 0 });
  }
  const formatted = opts?.currency ? formatCurrencyAmount(v, { currency: opts.currency }) : v.toFixed(2);
  return opts?.sign && v > 0 ? `+${formatted}` : formatted;
}

function qLabel(q: string): string {
  const parts = q.split('-');
  if (parts.length < 2) return q;
  const month = parseInt(parts[1], 10);
  const year = parts[0].slice(2);
  const qNum = month <= 3 ? 'Q1' : month <= 6 ? 'Q2' : month <= 9 ? 'Q3' : 'Q4';
  return `${qNum}'${year}`;
}

function daysUntil(dateStr: string): number | null {
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return null;
    return Math.max(0, Math.ceil((d.getTime() - Date.now()) / (1000 * 60 * 60 * 24)));
  } catch { return null; }
}

function colorForGrowth(v: number | null | undefined): string {
  if (v === null || v === undefined) return 'text-muted-foreground';
  return v >= 0 ? 'text-emerald-400' : 'text-red-400';
}

// =============================================================================
// Quarter Dropdown
// =============================================================================

function QuarterDropdown({ quarters, selected, onSelect, labelMap }: {
  quarters: string[];
  selected: string;
  onSelect: (q: string) => void;
  labelMap: Map<string, string>;
}) {
  return (
    <select
      value={selected}
      onChange={(e) => onSelect(e.target.value)}
      className="bg-card/60 border border-border/30 rounded-lg px-3 py-1.5 text-sm font-data text-foreground
        focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-500/40 cursor-pointer appearance-none
        bg-[url('data:image/svg+xml;charset=utf-8,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%2212%22%20height%3D%2212%22%20viewBox%3D%220%200%2024%2024%22%20fill%3D%22none%22%20stroke%3D%22%23a1a1aa%22%20stroke-width%3D%222%22%3E%3Cpath%20d%3D%22M6%209l6%206%206-6%22%2F%3E%3C%2Fsvg%3E')]
        bg-[length:12px] bg-[position:right_8px_center] bg-no-repeat pr-7"
    >
      {quarters.map((q) => (
        <option key={q} value={q}>{labelMap.get(q) || qLabel(q)}</option>
      ))}
    </select>
  );
}

// =============================================================================
// Data Components
// =============================================================================

/** Revenue breakdown table (product or geo) */
function SegmentTable({ segment, prev, type, currency }: {
  segment: RevenueSegment;
  prev: RevenueSegment | undefined;
  type: 'product' | 'geo';
  currency?: string;
}) {
  const entries = Object.entries(segment.data).sort((a, b) => b[1] - a[1]);
  const total = entries.reduce((sum, [, v]) => sum + v, 0);

  return (
    <table className="w-full text-sm">
      <thead>
        <tr className="bg-card/60">
          <th className="text-left py-2 px-3 text-xs uppercase tracking-wider text-muted-foreground font-medium">
            {type === 'product' ? '产品线' : '地区'}
          </th>
          <th className="text-right py-2 px-3 text-xs uppercase tracking-wider text-muted-foreground font-medium">营收</th>
          <th className="text-right py-2 px-3 text-xs uppercase tracking-wider text-muted-foreground font-medium">占比</th>
          {prev && <th className="text-right py-2 px-3 text-xs uppercase tracking-wider text-muted-foreground font-medium">QoQ</th>}
        </tr>
      </thead>
      <tbody>
        {entries.map(([name, revenue]) => {
          const share = total > 0 ? revenue / total : 0;
          const prevRev = prev?.data[name];
          const qoq = prevRev ? (revenue - prevRev) / prevRev : null;
          return (
            <tr key={name} className="border-t border-border/20">
              <td className="py-2 px-3 text-foreground/90">{name}</td>
              <td className="py-2 px-3 text-right font-data text-foreground">{fmt(revenue, { bn: true, currency })}</td>
              <td className="py-2 px-3 text-right font-data text-muted-foreground">{(share * 100).toFixed(1)}%</td>
              {prev && (
                <td className={`py-2 px-3 text-right font-data ${qoq === null ? 'text-muted-foreground' : colorForGrowth(qoq)}`}>
                  {qoq !== null ? fmt(qoq, { pct: true, sign: true }) : '--'}
                </td>
              )}
            </tr>
          );
        })}
      </tbody>
      <tfoot>
        <tr className="border-t border-border/30 bg-card/40">
          <td className="py-2 px-3 text-foreground/80 font-medium">合计</td>
          <td className="py-2 px-3 text-right font-data font-medium text-foreground">{fmt(total, { bn: true, currency })}</td>
          <td className="py-2 px-3 text-right font-data text-muted-foreground">100%</td>
          {prev && <td />}
        </tr>
      </tfoot>
    </table>
  );
}

// =============================================================================
// StatementSection (table-style financial statement section)
// =============================================================================

function fmtStatementVal(v: unknown, key: string, currency?: string): string {
  if (v === null || v === undefined) return '--';
  const n = Number(v);
  if (isNaN(n)) return '--';
  if (key.includes('shares')) return `${(n / 1e6).toFixed(0)}M`;
  return formatCurrencyAmount(n, { currency, compact: true, maximumFractionDigits: 0 });
}

function StatementSection({ title, titleEn, items, data, currency }: {
  title: string;
  titleEn: string;
  items: Array<{ label: string; key: string; bold?: boolean; indent?: boolean }>;
  data: Record<string, unknown>;
  currency?: string;
}) {
  // Filter to items that have data
  const visibleItems = items.filter(item => {
    const v = data[item.key];
    return v !== null && v !== undefined && v !== 0;
  });

  if (visibleItems.length === 0) return null;

  return (
    <div>
      <div className="text-xs font-medium text-muted-foreground mb-2">
        {title} <span className="text-muted-foreground/70">{titleEn}</span>
      </div>
      <div className="space-y-0">
        {visibleItems.map(item => {
          const val = data[item.key];
          const numVal = Number(val);
          const isNegative = !isNaN(numVal) && numVal < 0;

          return (
            <div key={item.key} className={`flex items-baseline justify-between py-1.5 ${item.bold ? 'border-t border-border/20' : ''}`}>
              <span className={`text-sm ${item.indent ? 'pl-4' : ''} ${item.bold ? 'font-medium text-foreground' : 'text-foreground/80'}`}>
                {item.label}
              </span>
              <span className={`font-data text-sm ${item.bold ? 'font-semibold' : ''} ${
                isNegative ? 'text-red-400' : 'text-foreground'
              }`}>
                {fmtStatementVal(val, item.key, currency)}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// =============================================================================
// MetricBox (reusable metric display)
// =============================================================================

function MetricBox({ label, value, sub, positive }: {
  label: string; value: string; sub?: string; positive?: boolean;
}) {
  return (
    <div className="bg-card/40 border border-border/25 rounded-lg px-3 py-2.5">
      <div className="text-xs text-muted-foreground mb-1">{label}</div>
      <div className={`text-lg font-data font-semibold ${
        positive === undefined ? 'text-foreground' : positive ? 'text-emerald-400' : 'text-red-400'
      }`}>{value}</div>
      {sub && <div className={`text-xs font-data mt-0.5 ${positive ? 'text-emerald-400' : 'text-red-400'}`}>{sub}</div>}
    </div>
  );
}

// =============================================================================
// Main Component
// =============================================================================

export function EarningsTab({
  symbol,
  currency,
  earningsHistory,
  revenueSegments,
  revenueGeoSegments,
  financialGrowth,
  analystEstimates,
  dcfValue,
  stockPrice,
  nextEarningsDate,
  incomeStatements = [],
  cashflowStatements = [],
  balanceSheets = [],
  earningsAnalysis,
  analysisLoading,
  onGenerate,
  onRegenerate,
  hasAIAccess = true,
}: EarningsTabProps) {

  // Quarter selection — use income statements as the authoritative source.
  // Label with fiscal year format (e.g. "FY26 Q1") using fiscal_year and fiscal_period.
  const quarterEntries = useMemo(() => {
    const ymMap = new Map<string, { date: string; label: string }>();

    // Income statements as primary source
    for (const s of incomeStatements) {
      const d = typeof s.date === 'string' ? s.date : '';
      if (!d || d.length < 7) continue;
      const ym = d.slice(0, 7);
      if (!ymMap.has(ym)) {
        const fy = s.fiscal_year as number | null;
        const fp = s.fiscal_period as string | null;
        const label = fy && fp ? `FY${String(fy).slice(-2)} ${fp}` : d.slice(0, 7);
        ymMap.set(ym, { date: d, label });
      }
    }

    // Fallback: earningsHistory (no fiscal year info, use date-based label)
    if (ymMap.size === 0) {
      const monthNames = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
      for (const e of earningsHistory) {
        if (!e.quarter || e.quarter.length < 7) continue;
        const ym = e.quarter.slice(0, 7);
        if (!ymMap.has(ym)) {
          const month = parseInt(e.quarter.slice(5, 7), 10) - 1;
          const year = e.quarter.slice(0, 4);
          ymMap.set(ym, { date: e.quarter, label: `${monthNames[month]} ${year}` });
        }
      }
    }

    return [...ymMap.values()].sort((a, b) => b.date.localeCompare(a.date));
  }, [earningsHistory, incomeStatements]);

  const availableQuarters = useMemo(() => quarterEntries.map(e => e.date), [quarterEntries]);
  const quarterLabelMap = useMemo(() => {
    const m = new Map<string, string>();
    quarterEntries.forEach(e => m.set(e.date, e.label));
    return m;
  }, [quarterEntries]);
  const [selectedQuarter, setSelectedQuarter] = useState<string | null>(null);
  const activeQuarter = selectedQuarter || availableQuarters[0] || null;

  // Helper: match data by date proximity (handles different date formats between sources)
  function findByDate<T extends { date?: string | null }>(arr: T[], targetDate: string): T | undefined {
    // Exact match first
    const exact = arr.find(item => item.date === targetDate);
    if (exact) return exact;
    // Try matching by year-month (ignore day differences: "2025-12-31" vs "2025-12-27")
    const targetYM = targetDate.slice(0, 7); // "2025-12"
    return arr.find(item => item.date?.slice(0, 7) === targetYM);
  }

  // Data for selected quarter — match by DATE, not index
  const selectedEps = useMemo(() => {
    if (!activeQuarter) return undefined;
    const targetYM = activeQuarter.slice(0, 7);
    return earningsHistory.find(e => e.quarter?.slice(0, 7) === targetYM);
  }, [earningsHistory, activeQuarter]);
  const selectedRevenue = useMemo(() => {
    if (!activeQuarter || !revenueSegments.length) return undefined;
    // Revenue segments use "date" field
    return findByDate(revenueSegments, activeQuarter) || revenueSegments[0];
  }, [revenueSegments, activeQuarter]);
  const prevRevenue = useMemo(() => {
    if (!activeQuarter || revenueSegments.length < 2) return undefined;
    // Find the segment AFTER the selected one (previous quarter)
    const sorted = [...revenueSegments].sort((a, b) => (b.date || '').localeCompare(a.date || ''));
    const idx = sorted.findIndex(s => s.date?.slice(0, 7) === activeQuarter.slice(0, 7));
    return idx >= 0 && idx < sorted.length - 1 ? sorted[idx + 1] : undefined;
  }, [revenueSegments, activeQuarter]);
  const selectedGeo = useMemo(() => {
    if (!activeQuarter || !revenueGeoSegments?.length) return undefined;
    return findByDate(revenueGeoSegments, activeQuarter) || revenueGeoSegments[0];
  }, [revenueGeoSegments, activeQuarter]);
  const prevGeo = useMemo(() => {
    if (!activeQuarter || !revenueGeoSegments || revenueGeoSegments.length < 2) return undefined;
    const sorted = [...revenueGeoSegments].sort((a, b) => (b.date || '').localeCompare(a.date || ''));
    const idx = sorted.findIndex(s => s.date?.slice(0, 7) === activeQuarter.slice(0, 7));
    return idx >= 0 && idx < sorted.length - 1 ? sorted[idx + 1] : undefined;
  }, [revenueGeoSegments, activeQuarter]);
  const selectedGrowth = useMemo(() => {
    if (!activeQuarter || !financialGrowth.length) return undefined;
    // Financial growth uses "date" field — match by date
    return findByDate(financialGrowth as Array<GrowthData & { date: string }>, activeQuarter) || undefined;
  }, [financialGrowth, activeQuarter]);

  // Transcript: fetch based on selected quarter's fiscal year/period
  const selectedIS = useMemo(() => {
    if (!activeQuarter || !incomeStatements.length) return undefined;
    return findByDate(
      incomeStatements as Array<Record<string, unknown> & { date?: string }>,
      activeQuarter
    ) as Record<string, unknown> | undefined;
  }, [incomeStatements, activeQuarter]);

  const tFiscalYear = selectedIS?.fiscal_year as number | null ?? null;
  const tFiscalPeriod = selectedIS?.fiscal_period as string | null ?? null;
  const tQuarter = tFiscalPeriod?.startsWith('Q')
    ? parseInt(tFiscalPeriod.replace('Q', ''), 10) : null;
  const { data: transcriptData, isLoading: transcriptLoading } = useTranscript(
    symbol, tFiscalYear, tQuarter
  );
  const transcript = transcriptData?.available ? transcriptData.content : null;

  const hasData = earningsHistory.length > 0 || revenueSegments.length > 0 || financialGrowth.length > 0 || incomeStatements.length > 0;

  // Right panel tab
  type RightTab = 'transcript' | 'income' | 'cashflow' | 'balance';
  const [rightTab, setRightTab] = useState<RightTab>('income');

  // Find cash flow and balance sheet for selected quarter
  const selectedCashflow = useMemo(() => {
    if (!activeQuarter || !cashflowStatements.length) return undefined;
    return findByDate(cashflowStatements as Array<Record<string, unknown> & { date?: string }>, activeQuarter) as Record<string, unknown> | undefined;
  }, [cashflowStatements, activeQuarter]);
  const selectedBalance = useMemo(() => {
    if (!activeQuarter || !balanceSheets.length) return undefined;
    return findByDate(balanceSheets as Array<Record<string, unknown> & { date?: string }>, activeQuarter) as Record<string, unknown> | undefined;
  }, [balanceSheets, activeQuarter]);


  const nextEarningsDays = nextEarningsDate ? daysUntil(nextEarningsDate) : null;

  return (
    <div className="space-y-5">
      {/* Quarter Selector - top right */}
      {availableQuarters.length > 1 && (
        <div className="flex items-center justify-end">
          <QuarterDropdown quarters={availableQuarters} selected={activeQuarter || ''} onSelect={setSelectedQuarter} labelMap={quarterLabelMap} />
        </div>
      )}

      {/* Main Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 items-start">

        {/* LEFT: AI Analysis */}
        <div className="order-2 lg:order-1 lg:sticky lg:top-4">
          <div className="bg-card/50 border border-border/30 rounded-xl overflow-hidden">
            {!hasAIAccess ? (
              <AIPaywall symbol={symbol} label="AI 财报解读" />
            ) : analysisLoading ? (
              <div className="p-8 text-center">
                <div className="w-6 h-6 border-2 border-teal-500/30 border-t-teal-500 rounded-full animate-spin mx-auto mb-3" />
                <p className="text-xs text-muted-foreground">正在解读 {symbol} {activeQuarter ? (quarterLabelMap.get(activeQuarter) || qLabel(activeQuarter)) : ''} 财报...</p>
              </div>
            ) : earningsAnalysis ? (
              <>
                <div className="px-4 py-2.5 border-b border-border/20 bg-card/40 flex items-center justify-between">
                  <span className="text-sm font-medium text-foreground">AI 财报解读</span>
                  <button onClick={onRegenerate} className="text-muted-foreground hover:text-teal-400 transition-colors p-1 rounded cursor-pointer focus-visible:ring-2 focus-visible:ring-teal-500/40 focus-visible:outline-none" title="重新生成">
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182" />
                    </svg>
                  </button>
                </div>
                <div className="px-4 py-3">
                  {earningsAnalysis.title && (
                    <h3 className="font-editorial text-base text-foreground leading-snug mb-3">
                      {earningsAnalysis.title}
                    </h3>
                  )}
                  <AnalysisSection label="财报概览" content={earningsAnalysis.earnings_overview} accentColor="emerald" />
                  <AnalysisSection label="前瞻指引" content={earningsAnalysis.guidance_outlook || ''} accentColor="sky" />
                  <AnalysisSection label="驱动因素" content={earningsAnalysis.key_drivers || ''} accentColor="amber" />
                  <AnalysisSection label="营收与分部" content={earningsAnalysis.revenue_and_segments || earningsAnalysis.revenue_breakdown || ''} accentColor="teal" />
                  <AnalysisSection label="财务质量" content={earningsAnalysis.financial_quality || earningsAnalysis.profitability_cashflow || ''} accentColor="teal" />
                  <AnalysisSection label="综合判断" content={earningsAnalysis.earnings_verdict} accentColor="emerald" />
                </div>
              </>
            ) : (
              <div className="p-6 text-center">
                <div className="inline-flex items-center gap-1.5 text-xs uppercase tracking-[0.15em] text-teal-500/50 mb-3">
                  <div className="w-4 h-px bg-teal-500/25" />
                  AI 财报解读
                  <div className="w-4 h-px bg-teal-500/25" />
                </div>
                <h3 className="font-editorial text-lg text-foreground mb-2">{symbol} 财报解读</h3>
                <p className="text-xs text-muted-foreground mb-4 leading-relaxed">
                  AI 从损益表、现金流和资产负债表三个维度深度解读财报
                </p>
                <button
                  onClick={onGenerate}
                  className="group inline-flex items-center gap-2 px-5 py-2 bg-teal-500/10 border border-teal-500/25 rounded-lg
                    text-sm font-medium text-teal-400 hover:bg-teal-500/20 hover:border-teal-500/40 transition-all cursor-pointer
                    focus-visible:ring-2 focus-visible:ring-teal-500/40 focus-visible:outline-none"
                >
                  <span>生成财报解读</span>
                  <svg className="w-3.5 h-3.5 transition-transform group-hover:translate-x-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M17 8l4 4m0 0l-4 4m4-4H3" />
                  </svg>
                </button>
              </div>
            )}
          </div>

          {/* Next earnings date */}
          {nextEarningsDate && nextEarningsDays !== null && (
            <div className="mt-3 flex items-center justify-between bg-card/50 border border-border/30 rounded-xl px-4 py-3">
              <span className="text-xs text-muted-foreground">下次财报发布</span>
              <div className="flex items-center gap-2">
                <span className="text-xs font-data text-foreground">{nextEarningsDate}</span>
                <span className={`px-2 py-0.5 rounded-md text-xs font-data font-medium border ${
                  nextEarningsDays <= 7 ? 'text-amber-400 bg-amber-500/10 border-amber-500/20' :
                  nextEarningsDays <= 30 ? 'text-teal-400 bg-teal-500/10 border-teal-500/20' :
                  'text-muted-foreground bg-muted/40 border-border/30'
                }`}>{nextEarningsDays}天</span>
              </div>
            </div>
          )}
        </div>

        {/* RIGHT: Data tabs (statements + transcript) */}
        <div className="order-1 lg:order-2 space-y-5">
          {!hasData && !transcript && !transcriptLoading ? (
            <div className="bg-card/50 border border-border/30 rounded-xl p-8 text-center">
              <div className="w-6 h-6 border-2 border-border/40 border-t-muted-foreground rounded-full animate-spin mx-auto mb-3" />
              <p className="text-sm text-muted-foreground">正在加载财报数据...</p>
            </div>
          ) : (
            <>
              {/* Tab Switcher */}
              <div className="flex bg-card/50 light:bg-card border border-border/40 rounded-xl overflow-hidden overflow-x-auto">
                {([
                  { id: 'income' as RightTab, label: '损益表', en: 'Income' },
                  { id: 'cashflow' as RightTab, label: '现金流', en: 'Cash Flow' },
                  { id: 'balance' as RightTab, label: '资产负债表', en: 'Balance' },
                  { id: 'transcript' as RightTab, label: '电话会议', en: 'Transcript' },
                ] as const).map((tab) => (
                  <button
                    key={tab.id}
                    onClick={() => setRightTab(tab.id)}
                    className={`flex-1 min-w-0 px-3 py-3 text-sm font-medium transition-all cursor-pointer relative
                      focus-visible:ring-2 focus-visible:ring-teal-500/40 focus-visible:outline-none
                      ${rightTab === tab.id
                        ? 'text-foreground bg-card/40 light:bg-muted/50'
                        : 'text-muted-foreground hover:text-foreground hover:bg-card/20'}`}
                  >
                    <span>{tab.label}</span>
                    <span className="text-xs text-muted-foreground ml-1 hidden sm:inline">{tab.en}</span>
                    {rightTab === tab.id && <div className="absolute bottom-0 left-0 right-0 h-[2px] bg-teal-500" />}
                  </button>
                ))}
              </div>

              {/* TRANSCRIPT VIEW */}
              {rightTab === 'transcript' && (
                <div className="bg-card/50 border border-border/30 rounded-xl overflow-hidden">
                  <div className="px-4 py-3">
                    {transcriptLoading ? (
                      <div className="p-6 text-center">
                        <div className="w-5 h-5 border-2 border-teal-500/30 border-t-teal-500 rounded-full animate-spin mx-auto mb-2" />
                        <p className="text-xs text-muted-foreground">加载电话会纪要...</p>
                      </div>
                    ) : transcript ? (
                      <div className="max-h-[calc(100vh-200px)] overflow-y-auto pr-1">
                        <pre className="text-xs text-muted-foreground leading-6 whitespace-pre-wrap font-sans">
                          {transcript}
                        </pre>
                      </div>
                    ) : (
                      <div className="p-6 text-center">
                        <p className="text-sm text-muted-foreground">该季度暂无电话会纪要</p>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* INCOME STATEMENT VIEW */}
              {rightTab === 'income' && (
                <>
                  {/* 本季表现 — single unified template; missing fields render as '--' */}
                  <SectionCard title="本季表现" titleEn={activeQuarter ? (quarterLabelMap.get(activeQuarter) || qLabel(activeQuarter)) : 'Performance'} numberLabel="01">
                    {(() => {
                      // EPS: prefer yfinance history (rich surprise data); fall back to
                      // calendar-derived value on the income statement when only the
                      // calendar entry is available.
                      const epsActual = selectedEps?.eps_actual ?? (selectedIS?.eps_diluted as number | null) ?? null;
                      const epsEst = selectedEps?.eps_estimate ?? (selectedIS?.eps_estimated as number | null) ?? null;
                      const epsSurprise = selectedEps?.surprise_percent ?? (
                        epsActual != null && epsEst != null && epsEst !== 0
                          ? (epsActual - epsEst) / Math.abs(epsEst) : null
                      );

                      // Revenue: prefer the income statement value; fall back to the
                      // calendar actual stored on the same statement.
                      const revActual = (selectedIS?.revenue as number | null)
                        ?? (selectedIS?.revenue_calendar_actual as number | null) ?? null;
                      const revEst = (selectedIS?.revenue_estimated as number | null) ?? null;
                      const revSurprise = revActual != null && revEst != null && revEst !== 0
                        ? (revActual - revEst) / Math.abs(revEst) : null;

                      // YoY metrics come from financial_growth (only computed for
                      // statements with detailed line items). Stubs simply omit them
                      // by rendering '--', which fmt(undefined) does naturally.
                      return (
                        <div className="grid grid-cols-2 gap-3">
                          <MetricBox label="EPS" value={epsActual != null ? fmt(epsActual, { currency }) : '--'}
                            sub={epsSurprise != null
                              ? `${epsSurprise >= 0 ? 'Beat' : 'Miss'} ${fmt(epsSurprise, { pct: true, sign: true })}`
                              : (epsEst != null ? `Est. ${fmt(epsEst, { currency })}` : undefined)}
                            positive={epsSurprise != null ? epsSurprise >= 0 : undefined} />
                          <MetricBox label="Revenue" value={revActual != null ? fmt(revActual, { bn: true, currency }) : '--'}
                            sub={revSurprise != null
                              ? `${revSurprise >= 0 ? 'Beat' : 'Miss'} ${fmt(revSurprise, { pct: true, sign: true })}`
                              : (revEst != null ? `Est. ${fmt(revEst, { bn: true, currency })}` : undefined)}
                            positive={revSurprise != null ? revSurprise >= 0 : undefined} />
                          <MetricBox label="净利 YoY" value={fmt(selectedGrowth?.netIncomeGrowth, { pct: true, sign: true })}
                            positive={selectedGrowth?.netIncomeGrowth != null ? selectedGrowth.netIncomeGrowth >= 0 : undefined} />
                          <MetricBox label="EPS YoY" value={fmt(selectedGrowth?.epsdilutedGrowth, { pct: true, sign: true })}
                            positive={selectedGrowth?.epsdilutedGrowth != null ? selectedGrowth.epsdilutedGrowth >= 0 : undefined} />
                        </div>
                      );
                    })()}
                  </SectionCard>

                  {/* 营收结构 */}
                  {(selectedRevenue || selectedGeo) && (
                    <SectionCard title="营收结构" titleEn="Revenue Breakdown" numberLabel="02">
                      {selectedRevenue && (
                        <div>
                          <SubsectionHeader title="按产品线" titleEn="By Product" />
                          <div className="overflow-x-auto"><SegmentTable segment={selectedRevenue} prev={prevRevenue} type="product" currency={currency} /></div>
                        </div>
                      )}
                      {selectedGeo && (
                        <div>
                          <SubsectionHeader title="按地区" titleEn="By Region" />
                          <div className="overflow-x-auto"><SegmentTable segment={selectedGeo} prev={prevGeo} type="geo" currency={currency} /></div>
                        </div>
                      )}
                    </SectionCard>
                  )}

                  {/* 增长趋势 */}
                  {financialGrowth.length > 0 && (
                    <SectionCard title="增长趋势" titleEn="Growth Trends YoY" numberLabel="03">
                      <div className="overflow-x-auto">
                        <table className="w-full text-sm min-w-[500px]">
                          <thead><tr className="bg-card/60">
                            <th className="text-left py-2 px-2 text-xs uppercase tracking-wider text-muted-foreground font-medium">季度</th>
                            <th className="text-right py-2 px-2 text-xs uppercase tracking-wider text-muted-foreground font-medium">营收</th>
                            <th className="text-right py-2 px-2 text-xs uppercase tracking-wider text-muted-foreground font-medium">毛利</th>
                            <th className="text-right py-2 px-2 text-xs uppercase tracking-wider text-muted-foreground font-medium">经营利润</th>
                            <th className="text-right py-2 px-2 text-xs uppercase tracking-wider text-muted-foreground font-medium">净利</th>
                            <th className="text-right py-2 px-2 text-xs uppercase tracking-wider text-muted-foreground font-medium">EPS</th>
                          </tr></thead>
                          <tbody>
                            {financialGrowth.slice(0, 6).map((item, i) => (
                              <tr key={item.date} className={`border-t border-border/20 ${i === 0 ? 'bg-card/30' : ''}`}>
                                <td className="py-2 px-2 font-data text-foreground/90">{item.date.slice(0, 7)}</td>
                                <td className={`py-2 px-2 text-right font-data ${colorForGrowth(item.revenueGrowth)}`}>{fmt(item.revenueGrowth, { pct: true, sign: true })}</td>
                                <td className={`py-2 px-2 text-right font-data ${colorForGrowth(item.grossProfitGrowth)}`}>{fmt(item.grossProfitGrowth, { pct: true, sign: true })}</td>
                                <td className={`py-2 px-2 text-right font-data ${colorForGrowth(item.operatingIncomeGrowth)}`}>{fmt(item.operatingIncomeGrowth, { pct: true, sign: true })}</td>
                                <td className={`py-2 px-2 text-right font-data ${colorForGrowth(item.netIncomeGrowth)}`}>{fmt(item.netIncomeGrowth, { pct: true, sign: true })}</td>
                                <td className={`py-2 px-2 text-right font-data ${colorForGrowth(item.epsdilutedGrowth)}`}>{fmt(item.epsdilutedGrowth, { pct: true, sign: true })}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </SectionCard>
                  )}

                  {/* EPS 历史 */}
                  {earningsHistory.length > 1 && (
                    <SectionCard title="EPS 历史表现" titleEn="EPS History" numberLabel="04">
                      <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                          <thead><tr className="bg-card/60">
                            <th className="text-left py-2 px-3 text-xs uppercase tracking-wider text-muted-foreground font-medium">季度</th>
                            <th className="text-right py-2 px-3 text-xs uppercase tracking-wider text-muted-foreground font-medium">EPS</th>
                            <th className="text-right py-2 px-3 text-xs uppercase tracking-wider text-muted-foreground font-medium">预期</th>
                            <th className="text-right py-2 px-3 text-xs uppercase tracking-wider text-muted-foreground font-medium">Surprise</th>
                          </tr></thead>
                          <tbody>
                            {earningsHistory.slice(0, 8).map((item, i) => (
                              <tr key={item.quarter} className={`border-t border-border/20 ${i === 0 ? 'bg-card/30' : ''}`}>
                                <td className="py-2 px-3 font-data text-foreground/90">{qLabel(item.quarter)}</td>
                                <td className="py-2 px-3 text-right font-data text-foreground">{fmt(item.eps_actual, { currency })}</td>
                                <td className="py-2 px-3 text-right font-data text-muted-foreground">{fmt(item.eps_estimate, { currency })}</td>
                                <td className={`py-2 px-3 text-right font-data font-medium ${colorForGrowth(item.surprise_percent)}`}>
                                  {fmt(item.surprise_percent, { pct: true, sign: true })}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </SectionCard>
                  )}

                  {/* 预期 vs 实际 / 分析师预期 */}
                  {(analystEstimates?.length || selectedEps || dcfValue || selectedIS?.eps_diluted != null) && (() => {
                    // Strict date match for estimates
                    const matchedEstimate = activeQuarter && analystEstimates
                      ? analystEstimates.find(e => e.date?.slice(0, 7) === activeQuarter.slice(0, 7))
                      : null;

                    const selectedIncomeStmt = activeQuarter
                      ? (findByDate(incomeStatements as Array<Record<string, unknown> & { date?: string }>, activeQuarter) as Record<string, unknown> | undefined)
                      : undefined;
                    const isReported = selectedEps?.eps_actual != null
                      || selectedIncomeStmt?.eps_calendar_actual != null
                      || selectedIS?.eps_diluted != null;
                    const actualRevenue = selectedIncomeStmt?.revenue as number | null ?? null;

                    // For reported quarters: show EPS beat/miss from yfinance (always available)
                    // + estimate comparison only if we have matching FMP estimate
                    // For future quarters: show next upcoming estimate
                    const futureEstimate = !isReported
                      ? (matchedEstimate || (analystEstimates?.[0] ?? null))
                      : null;

                    return (
                      <SectionCard
                        title={isReported ? '预期 vs 实际' : '分析师预期'}
                        titleEn={isReported ? 'Estimate vs Actual' : 'Consensus'}
                        numberLabel="05"
                      >
                        {/* REPORTED QUARTER: EPS beat/miss from yfinance + optional estimate comparison */}
                        {isReported && (
                          <div className="overflow-x-auto">
                            <table className="w-full text-sm">
                              <thead>
                                <tr className="bg-card/60">
                                  <th className="text-left py-2 px-3 text-xs uppercase tracking-wider text-muted-foreground font-medium">指标</th>
                                  <th className="text-right py-2 px-3 text-xs uppercase tracking-wider text-muted-foreground font-medium">预期</th>
                                  <th className="text-right py-2 px-3 text-xs uppercase tracking-wider text-muted-foreground font-medium">实际</th>
                                  <th className="text-right py-2 px-3 text-xs uppercase tracking-wider text-muted-foreground font-medium">结果</th>
                                </tr>
                              </thead>
                              <tbody>
                                {/* EPS: prefer yfinance history, fall back to calendar
                                    fields on the income statement (always populated when
                                    the calendar carries actuals, even for stub statements). */}
                                {(() => {
                                  const epsA = selectedEps?.eps_actual
                                    ?? (selectedIncomeStmt?.eps_calendar_actual as number | null)
                                    ?? (selectedIS?.eps_diluted as number | null)
                                    ?? null;
                                  const epsE = selectedEps?.eps_estimate
                                    ?? (selectedIncomeStmt?.eps_estimated as number | null)
                                    ?? (selectedIS?.eps_estimated as number | null)
                                    ?? null;
                                  const surprise = selectedEps?.surprise_percent ?? (
                                    epsA != null && epsE != null && epsE !== 0 ? (epsA - epsE) / Math.abs(epsE) : null
                                  );
                                  return (
                                    <tr className="border-t border-border/20">
                                      <td className="py-2 px-3 text-foreground/90">EPS</td>
                                      <td className="py-2 px-3 text-right font-data text-muted-foreground">
                                        {epsE != null ? fmt(epsE, { currency }) : '--'}
                                      </td>
                                      <td className="py-2 px-3 text-right font-data font-medium text-foreground">
                                        {epsA != null ? fmt(epsA, { currency }) : '--'}
                                      </td>
                                      <td className={`py-2 px-3 text-right font-data font-medium text-xs ${
                                        surprise != null ? (surprise >= 0 ? 'text-emerald-400' : 'text-red-400') : 'text-muted-foreground'
                                      }`}>
                                        {surprise != null ? `${surprise >= 0 ? 'Beat' : 'Miss'} ${fmt(surprise, { pct: true, sign: true })}` : '--'}
                                      </td>
                                    </tr>
                                  );
                                })()}
                                {/* Revenue: compare actual revenue with estimate */}
                                {actualRevenue != null && (() => {
                                  const revEst = matchedEstimate?.revenue_avg ?? (selectedIncomeStmt?.revenue_estimated as number | null) ?? null;
                                  return (
                                    <tr className="border-t border-border/20">
                                      <td className="py-2 px-3 text-foreground/90">营收</td>
                                      <td className="py-2 px-3 text-right font-data text-muted-foreground">
                                        {revEst != null ? fmt(revEst, { bn: true, currency }) : '--'}
                                      </td>
                                      <td className="py-2 px-3 text-right font-data font-medium text-foreground">
                                        {fmt(actualRevenue, { bn: true, currency })}
                                      </td>
                                      {revEst != null ? (() => {
                                        const beat = actualRevenue >= revEst;
                                        const pct = (actualRevenue - revEst) / Math.abs(revEst);
                                        return (
                                          <td className={`py-2 px-3 text-right font-data font-medium text-xs ${beat ? 'text-emerald-400' : 'text-red-400'}`}>
                                            {beat ? 'Beat' : 'Miss'} {fmt(pct, { pct: true, sign: true })}
                                          </td>
                                        );
                                      })() : <td className="py-2 px-3 text-right font-data text-muted-foreground text-xs">--</td>}
                                    </tr>
                                  );
                                })()}
                              </tbody>
                            </table>
                          </div>
                        )}

                        {/* FUTURE QUARTER: show consensus estimates */}
                        {!isReported && futureEstimate && (
                          <div className="overflow-x-auto">
                            <table className="w-full text-sm">
                              <thead>
                                <tr className="bg-card/60">
                                  <th className="text-left py-2 px-3 text-xs uppercase tracking-wider text-muted-foreground font-medium">指标</th>
                                  <th className="text-right py-2 px-3 text-xs uppercase tracking-wider text-muted-foreground font-medium">预期</th>
                                  <th className="text-right py-2 px-3 text-xs uppercase tracking-wider text-muted-foreground font-medium">范围</th>
                                </tr>
                              </thead>
                              <tbody>
                                {futureEstimate.eps_avg != null && (
                                  <tr className="border-t border-border/20">
                                    <td className="py-2 px-3 text-foreground/90">EPS</td>
                                    <td className="py-2 px-3 text-right font-data text-foreground">{fmt(futureEstimate.eps_avg, { currency })}</td>
                                    <td className="py-2 px-3 text-right font-data text-muted-foreground text-xs">{fmt(futureEstimate.eps_low, { currency })} - {fmt(futureEstimate.eps_high, { currency })}</td>
                                  </tr>
                                )}
                                {futureEstimate.revenue_avg != null && (
                                  <tr className="border-t border-border/20">
                                    <td className="py-2 px-3 text-foreground/90">营收</td>
                                    <td className="py-2 px-3 text-right font-data text-foreground">{fmt(futureEstimate.revenue_avg, { bn: true, currency })}</td>
                                    <td className="py-2 px-3 text-right font-data text-muted-foreground text-xs">{fmt(futureEstimate.revenue_low, { bn: true, currency })} - {fmt(futureEstimate.revenue_high, { bn: true, currency })}</td>
                                  </tr>
                                )}
                                {futureEstimate.net_income_avg != null && (
                                  <tr className="border-t border-border/20">
                                    <td className="py-2 px-3 text-foreground/90">净利润</td>
                                    <td className="py-2 px-3 text-right font-data text-foreground">{fmt(futureEstimate.net_income_avg, { bn: true, currency })}</td>
                                    <td className="py-2 px-3 text-right font-data text-muted-foreground text-xs">--</td>
                                  </tr>
                                )}
                              </tbody>
                              {futureEstimate.num_analysts_eps && (
                                <tfoot>
                                  <tr className="border-t border-border/30">
                                    <td colSpan={3} className="py-2 px-3 text-xs text-muted-foreground">
                                      {futureEstimate.num_analysts_eps} 位分析师覆盖 EPS{futureEstimate.num_analysts_revenue ? `, ${futureEstimate.num_analysts_revenue} 位覆盖营收` : ''}
                                    </td>
                                  </tr>
                                </tfoot>
                              )}
                            </table>
                          </div>
                        )}

                        {dcfValue && stockPrice && (
                          <div className="flex items-baseline justify-between mt-3 pt-3 border-t border-border/20">
                            <span className="text-sm text-muted-foreground">DCF 估值</span>
                            <div className="text-right">
                              <span className="text-base font-data font-semibold text-foreground">{fmt(dcfValue, { currency })}</span>
                              <span className={`text-xs font-data ml-2 ${dcfValue > stockPrice ? 'text-emerald-400' : 'text-red-400'}`}>
                                vs {fmt(stockPrice, { currency })} ({dcfValue > stockPrice ? '+' : ''}{((dcfValue - stockPrice) / stockPrice * 100).toFixed(1)}%)
                              </span>
                            </div>
                          </div>
                        )}
                      </SectionCard>
                    );
                  })()}
                </>
              )}

          {/* CASH FLOW VIEW */}
          {rightTab === 'cashflow' && !selectedCashflow && (
            <div className="bg-card/50 border border-border/30 rounded-xl p-8 text-center">
              <p className="text-sm text-muted-foreground">该季度暂无现金流量表数据</p>
              <p className="mt-1 text-sm text-muted-foreground">完整数据通常在公司提交 10-Q 后 1-3 个工作日内补全</p>
            </div>
          )}
          {rightTab === 'cashflow' && selectedCashflow && (
                <SectionCard title="现金流量表" titleEn={activeQuarter ? (quarterLabelMap.get(activeQuarter) || qLabel(activeQuarter)) : 'Cash Flow'} numberLabel="01">
                  <StatementSection title="经营活动" titleEn="Operating Activities" items={[
                    { label: '净利润 Net Income', key: 'net_income', bold: true },
                    { label: '折旧摊销 D&A', key: 'depreciation_and_amortization', indent: true },
                    { label: '股权激励 SBC', key: 'stock_based_compensation', indent: true },
                    { label: '递延所得税', key: 'deferred_income_tax', indent: true },
                    { label: '营运资本变动', key: 'change_in_working_capital', indent: true },
                    { label: '应收账款变动', key: 'accounts_receivables', indent: true },
                    { label: '应付账款变动', key: 'accounts_payables', indent: true },
                    { label: '经营活动现金流 OCF', key: 'operating_cash_flow', bold: true },
                  ]} data={selectedCashflow} currency={currency} />
                  <StatementSection title="投资活动" titleEn="Investing Activities" items={[
                    { label: '资本支出 CapEx', key: 'capital_expenditure' },
                    { label: '收购 Acquisitions', key: 'acquisitions', indent: true },
                    { label: '购买投资', key: 'purchases_of_investments', indent: true },
                    { label: '出售投资', key: 'sales_of_investments', indent: true },
                    { label: '投资活动现金流', key: 'net_cash_from_investing', bold: true },
                  ]} data={selectedCashflow} currency={currency} />
                  <StatementSection title="融资活动" titleEn="Financing Activities" items={[
                    { label: '债务净发行', key: 'net_debt_issuance' },
                    { label: '股票回购 Buyback', key: 'stock_repurchase', indent: true },
                    { label: '股息支付 Dividends', key: 'dividends_paid', indent: true },
                    { label: '融资活动现金流', key: 'net_cash_from_financing', bold: true },
                  ]} data={selectedCashflow} currency={currency} />
                  <StatementSection title="汇总" titleEn="Summary" items={[
                    { label: '现金净变动', key: 'net_change_in_cash', bold: true },
                    { label: '自由现金流 FCF', key: 'free_cash_flow', bold: true },
                    { label: '期末现金', key: 'cash_at_end' },
                    { label: '已付所得税', key: 'income_taxes_paid', indent: true },
                    { label: '已付利息', key: 'interest_paid', indent: true },
                  ]} data={selectedCashflow} currency={currency} />
                </SectionCard>
              )}

          {/* BALANCE SHEET VIEW */}
          {rightTab === 'balance' && !selectedBalance && (
            <div className="bg-card/50 border border-border/30 rounded-xl p-8 text-center">
              <p className="text-sm text-muted-foreground">该季度暂无资产负债表数据</p>
              <p className="mt-1 text-sm text-muted-foreground">完整数据通常在公司提交 10-Q 后 1-3 个工作日内补全</p>
            </div>
          )}
          {rightTab === 'balance' && selectedBalance && (
                <SectionCard title="资产负债表" titleEn={activeQuarter ? (quarterLabelMap.get(activeQuarter) || qLabel(activeQuarter)) : 'Balance Sheet'} numberLabel="01">
                  <StatementSection title="资产" titleEn="Assets" items={[
                    { label: '现金 Cash', key: 'cash_and_equivalents' },
                    { label: '短期投资', key: 'short_term_investments' },
                    { label: '现金+短投合计', key: 'cash_and_short_term_investments', bold: true },
                    { label: '应收账款', key: 'net_receivables', indent: true },
                    { label: '存货', key: 'inventory', indent: true },
                    { label: '流动资产合计', key: 'total_current_assets', bold: true },
                    { label: '固定资产 PP&E', key: 'property_plant_equipment' },
                    { label: '商誉 Goodwill', key: 'goodwill', indent: true },
                    { label: '无形资产 Intangibles', key: 'intangible_assets', indent: true },
                    { label: '长期投资', key: 'long_term_investments', indent: true },
                    { label: '非流动资产合计', key: 'total_non_current_assets', bold: true },
                    { label: '总资产 Total Assets', key: 'total_assets', bold: true },
                  ]} data={selectedBalance} currency={currency} />
                  <StatementSection title="负债" titleEn="Liabilities" items={[
                    { label: '应付账款', key: 'accounts_payable' },
                    { label: '流动负债合计', key: 'total_current_liabilities', bold: true },
                    { label: '长期负债 LT Debt', key: 'long_term_debt' },
                    { label: '非流动负债合计', key: 'total_non_current_liabilities', bold: true },
                    { label: '负债合计', key: 'total_liabilities', bold: true },
                    { label: '总债务 Total Debt', key: 'total_debt' },
                    { label: '净债务 Net Debt', key: 'net_debt' },
                  ]} data={selectedBalance} currency={currency} />
                  <StatementSection title="股东权益" titleEn="Equity" items={[
                    { label: '留存收益', key: 'retained_earnings' },
                    { label: '资本公积', key: 'additional_paid_in_capital' },
                    { label: '股东权益合计', key: 'total_equity', bold: true },
                    { label: '流通股数 Shares', key: 'shares_outstanding' },
                  ]} data={selectedBalance} currency={currency} />
                </SectionCard>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
