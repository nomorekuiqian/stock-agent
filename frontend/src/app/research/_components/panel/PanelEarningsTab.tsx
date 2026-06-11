'use client';

import { useMemo, useState } from 'react';
import { useEarningsData, useTranscript } from '@/hooks/queries/use-stock-data';
import { SectionCard } from '@/app/stock/[symbol]/_components/StockDetailContent';
import { formatCurrencyAmount, resolveCurrency } from '@/lib/currency';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function fmt(v: number | null | undefined, opts?: { pct?: boolean; bn?: boolean; sign?: boolean; currency?: string }): string {
  if (v === null || v === undefined) return '--';
  if (opts?.pct) {
    const s = (v * 100).toFixed(1);
    return opts.sign && v > 0 ? `+${s}%` : `${s}%`;
  }
  if (opts?.bn) {
    return formatCurrencyAmount(v, { currency: opts?.currency, compact: true, maximumFractionDigits: 0 });
  }
  return opts?.currency ? formatCurrencyAmount(v, { currency: opts.currency }) : v.toFixed(2);
}

function fmtStmt(v: unknown, key: string, currency?: string): string {
  if (v === null || v === undefined) return '--';
  const n = Number(v);
  if (isNaN(n)) return '--';
  if (key.includes('shares')) return `${(n / 1e6).toFixed(0)}M`;
  return formatCurrencyAmount(n, { currency, compact: true, maximumFractionDigits: 0 });
}

function colorForGrowth(v: number | null | undefined): string {
  if (v === null || v === undefined) return 'text-muted-foreground';
  return v >= 0 ? 'text-emerald-400' : 'text-red-400';
}

function qLabel(q: string): string {
  const parts = q.split('-');
  if (parts.length < 2) return q;
  const month = parseInt(parts[1], 10);
  const year = parts[0].slice(2);
  const qNum = month <= 3 ? 'Q1' : month <= 6 ? 'Q2' : month <= 9 ? 'Q3' : 'Q4';
  return `${qNum}'${year}`;
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

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

function StatementSection({ title, titleEn, items, data, currency }: {
  title: string;
  titleEn: string;
  items: Array<{ label: string; key: string; bold?: boolean; indent?: boolean }>;
  data: Record<string, unknown>;
  currency?: string;
}) {
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
          const isNeg = !isNaN(numVal) && numVal < 0;
          return (
            <div key={item.key} className={`flex items-baseline justify-between py-1.5 ${item.bold ? 'border-t border-border/20' : ''}`}>
              <span className={`text-sm ${item.indent ? 'pl-4' : ''} ${item.bold ? 'font-medium text-foreground' : 'text-foreground/80'}`}>
                {item.label}
              </span>
              <span className={`font-data text-sm ${item.bold ? 'font-semibold' : ''} ${isNeg ? 'text-red-400' : 'text-foreground'}`}>
                {fmtStmt(val, item.key, currency)}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function SegmentTable({ segment, prev, type, currency }: {
  segment: { data: Record<string, number> };
  prev: { data: Record<string, number> } | undefined;
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
    </table>
  );
}

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export default function PanelEarningsTab({ symbol, stockData }: { symbol: string; stockData: any }) {
  const { data: earningsData } = useEarningsData(symbol);
  const currency = resolveCurrency(symbol, stockData?.profile?.currency).code;
  // Financial statements come from the earnings-data API, not the stock detail API
  const incomeStatements: Array<Record<string, unknown>> = earningsData?.income_statements || [];
  const cashflowStatements: Array<Record<string, unknown>> = earningsData?.cashflow_statements || [];
  const balanceSheets: Array<Record<string, unknown>> = earningsData?.balance_sheets || [];

  const earningsHistory = earningsData?.earnings_history || [];
  const revenueSegments = earningsData?.revenue_segments || [];
  const financialGrowth = earningsData?.financial_growth || [];

  // Quarter selection
  const quarterEntries = useMemo(() => {
    const ymMap = new Map<string, { date: string; label: string }>();
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
    if (ymMap.size === 0) {
      for (const e of earningsHistory) {
        const q = (e as Record<string, unknown>).quarter as string;
        if (!q || q.length < 7) continue;
        const ym = q.slice(0, 7);
        if (!ymMap.has(ym)) ymMap.set(ym, { date: q, label: qLabel(q) });
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

  function findByDate<T extends Record<string, unknown>>(arr: T[], targetDate: string): T | undefined {
    const exact = arr.find(item => item.date === targetDate);
    if (exact) return exact;
    const targetYM = targetDate.slice(0, 7);
    return arr.find(item => (item.date as string)?.slice(0, 7) === targetYM);
  }

  // Selected quarter data
  const selectedIS = useMemo(() => activeQuarter ? findByDate(incomeStatements, activeQuarter) : undefined, [incomeStatements, activeQuarter]);
  const selectedCashflow = useMemo(() => activeQuarter ? findByDate(cashflowStatements, activeQuarter) : undefined, [cashflowStatements, activeQuarter]);
  const selectedBalance = useMemo(() => activeQuarter ? findByDate(balanceSheets, activeQuarter) : undefined, [balanceSheets, activeQuarter]);
  const selectedEps = useMemo(() => {
    if (!activeQuarter) return undefined;
    return earningsHistory.find((e: Record<string, unknown>) => (e.quarter as string)?.slice(0, 7) === activeQuarter.slice(0, 7)) as Record<string, unknown> | undefined;
  }, [earningsHistory, activeQuarter]);

  const selectedRevenue = useMemo(() => {
    if (!activeQuarter || !revenueSegments.length) return undefined;
    return findByDate(revenueSegments as Array<Record<string, unknown>>, activeQuarter) as { data: Record<string, number> } | undefined || revenueSegments[0];
  }, [revenueSegments, activeQuarter]);
  const prevRevenue = useMemo(() => {
    if (!activeQuarter || revenueSegments.length < 2) return undefined;
    const sorted = [...revenueSegments].sort((a, b) => ((b as Record<string, unknown>).date as string || '').localeCompare((a as Record<string, unknown>).date as string || ''));
    const idx = sorted.findIndex(s => ((s as Record<string, unknown>).date as string)?.slice(0, 7) === activeQuarter.slice(0, 7));
    return idx >= 0 && idx < sorted.length - 1 ? sorted[idx + 1] as { data: Record<string, number> } : undefined;
  }, [revenueSegments, activeQuarter]);

  const selectedGrowth = useMemo(() => {
    if (!activeQuarter || !financialGrowth.length) return undefined;
    return findByDate(financialGrowth as Array<Record<string, unknown>>, activeQuarter);
  }, [financialGrowth, activeQuarter]);

  // Transcript
  const tFiscalYear = selectedIS?.fiscal_year as number | null ?? null;
  const tFiscalPeriod = selectedIS?.fiscal_period as string | null ?? null;
  const tQuarter = tFiscalPeriod?.startsWith('Q') ? parseInt(tFiscalPeriod.replace('Q', ''), 10) : null;
  const { data: transcriptData, isLoading: transcriptLoading } = useTranscript(symbol, tFiscalYear, tQuarter);
  const transcript = transcriptData?.available ? transcriptData.content : null;

  // Statement tab
  type StmtTab = 'income' | 'cashflow' | 'balance' | 'transcript';
  const [stmtTab, setStmtTab] = useState<StmtTab>('income');

  return (
    <div className="px-4 py-4 space-y-4">
      {/* Quarter selector */}
      {availableQuarters.length > 1 && (
        <div className="flex items-center justify-end">
          <select
            value={activeQuarter || ''}
            onChange={(e) => setSelectedQuarter(e.target.value)}
            className="bg-card/60 border border-border/30 rounded-lg px-3 py-1.5 text-sm font-data text-foreground
              focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-500/40 cursor-pointer appearance-none pr-7
              bg-[url('data:image/svg+xml;charset=utf-8,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%2212%22%20height%3D%2212%22%20viewBox%3D%220%200%2024%2024%22%20fill%3D%22none%22%20stroke%3D%22%23a1a1aa%22%20stroke-width%3D%222%22%3E%3Cpath%20d%3D%22M6%209l6%206%206-6%22%2F%3E%3C%2Fsvg%3E')]
              bg-[length:12px] bg-[position:right_8px_center] bg-no-repeat"
          >
            {quarterEntries.map((e) => (
              <option key={e.date} value={e.date}>{e.label}</option>
            ))}
          </select>
        </div>
      )}

      {/* Statement tab switcher */}
      <div className="flex bg-card/50 border border-border/40 rounded-xl overflow-hidden overflow-x-auto">
        {([
          { id: 'income' as StmtTab, label: '损益表' },
          { id: 'cashflow' as StmtTab, label: '现金流' },
          { id: 'balance' as StmtTab, label: '资产负债' },
          { id: 'transcript' as StmtTab, label: '电话会议' },
        ]).map((tab) => (
          <button
            key={tab.id}
            onClick={() => setStmtTab(tab.id)}
            className={`flex-1 min-w-0 px-2 py-2.5 text-xs font-medium transition-all cursor-pointer relative
              focus-visible:ring-2 focus-visible:ring-teal-500/40 focus-visible:outline-none
              ${stmtTab === tab.id ? 'text-foreground bg-card/40' : 'text-muted-foreground hover:text-foreground'}`}
          >
            {tab.label}
            {stmtTab === tab.id && <div className="absolute bottom-0 left-0 right-0 h-[2px] bg-teal-500" />}
          </button>
        ))}
      </div>

      {/* INCOME STATEMENT */}
      {stmtTab === 'income' && (
        <>
          {/* Current quarter performance */}
          <SectionCard title="本季表现" titleEn={activeQuarter ? (quarterLabelMap.get(activeQuarter) || qLabel(activeQuarter)) : ''} numberLabel="01">
            <div className="grid grid-cols-2 gap-3">
              <MetricBox label="EPS"
                value={(() => { const v = selectedEps?.eps_actual as number | null; return v != null ? fmt(v, { currency }) : '--'; })()}
                positive={(() => { const v = selectedEps?.surprise_percent as number | null; return v != null ? v >= 0 : undefined; })()} />
              <MetricBox label="营收 YoY" value={fmt(selectedGrowth?.revenueGrowth as number | null, { pct: true, sign: true })}
                positive={(selectedGrowth?.revenueGrowth as number | null) != null ? (selectedGrowth?.revenueGrowth as number) >= 0 : undefined} />
            </div>
          </SectionCard>

          {/* Revenue breakdown */}
          {selectedRevenue && (selectedRevenue as { data?: Record<string, number> }).data && Object.keys((selectedRevenue as { data: Record<string, number> }).data).length > 0 && (
            <SectionCard title="营收结构" titleEn="Revenue Breakdown" numberLabel="02">
              <div className="overflow-x-auto">
                <SegmentTable segment={selectedRevenue as { data: Record<string, number> }} prev={prevRevenue} type="product" currency={currency} />
              </div>
            </SectionCard>
          )}

          {/* Growth trends */}
          {financialGrowth.length > 0 && (
            <SectionCard title="增长趋势" titleEn="Growth YoY" numberLabel="03">
              <div className="overflow-x-auto">
                <table className="w-full text-xs min-w-[400px]">
                  <thead><tr className="bg-card/60">
                    <th className="text-left py-2 px-2 text-muted-foreground font-medium">季度</th>
                    <th className="text-right py-2 px-2 text-muted-foreground font-medium">营收</th>
                    <th className="text-right py-2 px-2 text-muted-foreground font-medium">净利</th>
                    <th className="text-right py-2 px-2 text-muted-foreground font-medium">EPS</th>
                  </tr></thead>
                  <tbody>
                    {financialGrowth.slice(0, 6).map((item: Record<string, unknown>, i: number) => (
                      <tr key={item.date as string} className={`border-t border-border/20 ${i === 0 ? 'bg-card/30' : ''}`}>
                        <td className="py-2 px-2 font-data text-foreground/90">{(item.date as string).slice(0, 7)}</td>
                        <td className={`py-2 px-2 text-right font-data ${colorForGrowth(item.revenueGrowth as number | null)}`}>{fmt(item.revenueGrowth as number | null, { pct: true, sign: true })}</td>
                        <td className={`py-2 px-2 text-right font-data ${colorForGrowth(item.netIncomeGrowth as number | null)}`}>{fmt(item.netIncomeGrowth as number | null, { pct: true, sign: true })}</td>
                        <td className={`py-2 px-2 text-right font-data ${colorForGrowth(item.epsdilutedGrowth as number | null)}`}>{fmt(item.epsdilutedGrowth as number | null, { pct: true, sign: true })}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </SectionCard>
          )}

          {/* EPS history */}
          {earningsHistory.length > 1 && (
            <SectionCard title="EPS 历史" titleEn="EPS History" numberLabel="04">
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead><tr className="bg-card/60">
                    <th className="text-left py-2 px-3 text-muted-foreground font-medium">季度</th>
                    <th className="text-right py-2 px-3 text-muted-foreground font-medium">EPS</th>
                    <th className="text-right py-2 px-3 text-muted-foreground font-medium">预期</th>
                    <th className="text-right py-2 px-3 text-muted-foreground font-medium">Surprise</th>
                  </tr></thead>
                  <tbody>
                    {earningsHistory.slice(0, 8).map((item: Record<string, unknown>, i: number) => (
                      <tr key={item.quarter as string} className={`border-t border-border/20 ${i === 0 ? 'bg-card/30' : ''}`}>
                        <td className="py-2 px-3 font-data text-foreground/90">{qLabel(item.quarter as string)}</td>
                        <td className="py-2 px-3 text-right font-data text-foreground">{fmt(item.eps_actual as number | null, { currency })}</td>
                        <td className="py-2 px-3 text-right font-data text-muted-foreground">{fmt(item.eps_estimate as number | null, { currency })}</td>
                        <td className={`py-2 px-3 text-right font-data font-medium ${colorForGrowth(item.surprise_percent as number | null)}`}>
                          {fmt(item.surprise_percent as number | null, { pct: true, sign: true })}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </SectionCard>
          )}
        </>
      )}

      {/* CASH FLOW */}
      {stmtTab === 'cashflow' && (selectedCashflow ? (
        <SectionCard title="现金流量表" titleEn={activeQuarter ? (quarterLabelMap.get(activeQuarter) || qLabel(activeQuarter)) : 'Cash Flow'} numberLabel="01">
          <StatementSection title="经营活动" titleEn="Operating" items={[
            { label: '净利润', key: 'net_income', bold: true },
            { label: '折旧摊销', key: 'depreciation_and_amortization', indent: true },
            { label: '股权激励', key: 'stock_based_compensation', indent: true },
            { label: '营运资本变动', key: 'change_in_working_capital', indent: true },
            { label: '经营现金流 OCF', key: 'operating_cash_flow', bold: true },
          ]} data={selectedCashflow} currency={currency} />
          <StatementSection title="投资活动" titleEn="Investing" items={[
            { label: '资本支出 CapEx', key: 'capital_expenditure' },
            { label: '收购', key: 'acquisitions', indent: true },
            { label: '购买投资', key: 'purchases_of_investments', indent: true },
            { label: '投资活动现金流', key: 'net_cash_from_investing', bold: true },
          ]} data={selectedCashflow} currency={currency} />
          <StatementSection title="融资活动" titleEn="Financing" items={[
            { label: '债务净发行', key: 'net_debt_issuance' },
            { label: '股票回购', key: 'stock_repurchase', indent: true },
            { label: '股息支付', key: 'dividends_paid', indent: true },
            { label: '融资活动现金流', key: 'net_cash_from_financing', bold: true },
          ]} data={selectedCashflow} currency={currency} />
          <StatementSection title="汇总" titleEn="Summary" items={[
            { label: '现金净变动', key: 'net_change_in_cash', bold: true },
            { label: '自由现金流 FCF', key: 'free_cash_flow', bold: true },
            { label: '期末现金', key: 'cash_at_end' },
          ]} data={selectedCashflow} currency={currency} />
        </SectionCard>
      ) : (
        <div className="bg-card/50 border border-border/30 rounded-xl p-8 text-center">
          <p className="text-sm text-muted-foreground">该季度暂无现金流数据</p>
        </div>
      ))}

      {/* BALANCE SHEET */}
      {stmtTab === 'balance' && (selectedBalance ? (
        <SectionCard title="资产负债表" titleEn={activeQuarter ? (quarterLabelMap.get(activeQuarter) || qLabel(activeQuarter)) : 'Balance Sheet'} numberLabel="01">
          <StatementSection title="资产" titleEn="Assets" items={[
            { label: '现金', key: 'cash_and_equivalents' },
            { label: '短期投资', key: 'short_term_investments' },
            { label: '现金+短投', key: 'cash_and_short_term_investments', bold: true },
            { label: '应收账款', key: 'net_receivables', indent: true },
            { label: '存货', key: 'inventory', indent: true },
            { label: '流动资产合计', key: 'total_current_assets', bold: true },
            { label: '固定资产 PP&E', key: 'property_plant_equipment' },
            { label: '商誉', key: 'goodwill', indent: true },
            { label: '非流动资产合计', key: 'total_non_current_assets', bold: true },
            { label: '总资产', key: 'total_assets', bold: true },
          ]} data={selectedBalance} currency={currency} />
          <StatementSection title="负债" titleEn="Liabilities" items={[
            { label: '应付账款', key: 'accounts_payable' },
            { label: '流动负债合计', key: 'total_current_liabilities', bold: true },
            { label: '长期负债', key: 'long_term_debt' },
            { label: '非流动负债合计', key: 'total_non_current_liabilities', bold: true },
            { label: '负债合计', key: 'total_liabilities', bold: true },
            { label: '总债务', key: 'total_debt' },
            { label: '净债务', key: 'net_debt' },
          ]} data={selectedBalance} currency={currency} />
          <StatementSection title="股东权益" titleEn="Equity" items={[
            { label: '留存收益', key: 'retained_earnings' },
            { label: '股东权益合计', key: 'total_equity', bold: true },
            { label: '流通股数', key: 'shares_outstanding' },
          ]} data={selectedBalance} currency={currency} />
        </SectionCard>
      ) : (
        <div className="bg-card/50 border border-border/30 rounded-xl p-8 text-center">
          <p className="text-sm text-muted-foreground">该季度暂无资产负债数据</p>
        </div>
      ))}

      {/* TRANSCRIPT */}
      {stmtTab === 'transcript' && (
        <div className="bg-card/50 border border-border/30 rounded-xl overflow-hidden">
          <div className="px-4 py-3">
            {transcriptLoading ? (
              <div className="p-6 text-center">
                <div className="w-5 h-5 border-2 border-teal-500/30 border-t-teal-500 rounded-full animate-spin mx-auto mb-2" />
                <p className="text-xs text-muted-foreground">加载电话会纪要...</p>
              </div>
            ) : transcript ? (
              <div className="max-h-[60vh] overflow-y-auto pr-1">
                <pre className="text-xs text-muted-foreground leading-6 whitespace-pre-wrap font-sans">
                  {transcript}
                </pre>
              </div>
            ) : (
              <div className="p-6 text-center">
                <p className="text-xs text-muted-foreground">该季度暂无电话会纪要</p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
