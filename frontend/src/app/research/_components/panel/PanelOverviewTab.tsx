'use client';

import { useMemo } from 'react';
import dynamic from 'next/dynamic';
import { usePriceHistory, useValuationComparison } from '@/hooks/queries/use-stock-data';
import {
  ValuationComparisonSection,
  MetricCard,
  SubsectionHeader,
  FinancialsTable,
  SectionCard,
  formatNumber,
} from '@/app/stock/[symbol]/_components/StockDetailContent';

const StockPriceChart = dynamic(
  () => import('@/components/StockPriceChart').then(m => ({ default: m.StockPriceChart })),
  { ssr: false, loading: () => <div className="h-[240px] bg-muted/10 animate-pulse rounded-lg" /> },
);

// ---------------------------------------------------------------------------
// Helpers (mirrored from stock page OverviewTab)
// ---------------------------------------------------------------------------

function fmtNum(v: number | null | undefined, decimals = 2): string {
  if (v === null || v === undefined) return '--';
  return v.toFixed(decimals);
}

function fmtPct(v: number | null | undefined, sign = false): string {
  if (v === null || v === undefined) return '--';
  const s = (v * 100).toFixed(1);
  return sign && v > 0 ? `+${s}%` : `${s}%`;
}

function computeHealthScore(fundamentals: StockFundamentals | null): {
  score: number;
  details: Array<{ label: string; passed: boolean }>;
} {
  if (!fundamentals) return { score: 0, details: [] };
  const checks: Array<{ label: string; passed: boolean }> = [];
  checks.push({ label: '净利率 > 0', passed: (fundamentals.profitability.net_margin ?? -1) > 0 });
  checks.push({ label: 'ROE > 10%', passed: (fundamentals.profitability.roe ?? -1) > 0.10 });
  checks.push({ label: '毛利率 > 30%', passed: (fundamentals.profitability.gross_margin ?? -1) > 0.30 });
  checks.push({ label: '营收增长', passed: (fundamentals.growth.revenue_yoy ?? -1) > 0 });
  checks.push({ label: '流动比率 > 1', passed: (fundamentals.balance_sheet?.current_ratio ?? -1) > 1 });
  checks.push({ label: '低负债率', passed: (fundamentals.balance_sheet?.debt_to_equity ?? 999) < 1.5 });
  checks.push({ label: 'FCF 为正', passed: (fundamentals.ttm.free_cash_flow ?? -1) > 0 });
  checks.push({ label: '经营现金流为正', passed: (fundamentals.ttm.operating_cash_flow ?? -1) > 0 });
  const passed = checks.filter(c => c.passed).length;
  return { score: Math.round((passed / checks.length) * 10), details: checks };
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface StockFundamentals {
  ttm: { revenue?: number; net_income?: number; eps?: number; ebitda?: number; free_cash_flow?: number; operating_cash_flow?: number };
  valuation: { pe?: number; forward_pe?: number; ps?: number; pb?: number; ev_to_ebitda?: number; dividend_yield?: number; peg?: number };
  growth: { revenue_yoy?: number; net_income_yoy?: number; revenue_qoq?: number };
  profitability: { gross_margin?: number; operating_margin?: number; net_margin?: number; roe?: number; roa?: number };
  balance_sheet?: { current_ratio?: number; debt_to_equity?: number; total_debt?: number; total_cash?: number };
  market_data?: { beta?: number; short_ratio?: number; insider_ownership?: number; institutional_ownership?: number };
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export default function PanelOverviewTab({ symbol, stockData }: { symbol: string; stockData: any }) {
  const quote = stockData?.quote;
  const fundamentals: StockFundamentals | null = stockData?.fundamentals;
  const financials = stockData?.financials;
  const currency = stockData?.profile?.currency || 'USD';

  const { data: priceHistory, isLoading: priceLoading } = usePriceHistory(symbol, 365);
  const { data: valuationData, isLoading: valuationLoading } = useValuationComparison(symbol);

  const healthData = useMemo(() => computeHealthScore(fundamentals), [fundamentals]);

  // Health ring
  const ringR = 22, ringStroke = 3.5;
  const ringCirc = 2 * Math.PI * ringR;
  const ringProgress = (healthData.score / 10) * ringCirc;
  const ringColor = healthData.score >= 7 ? 'stroke-emerald-500' : healthData.score >= 4 ? 'stroke-amber-500' : 'stroke-red-500';
  const ringTextColor = healthData.score >= 7 ? 'text-emerald-400' : healthData.score >= 4 ? 'text-amber-400' : 'text-red-400';

  return (
    <div className="px-4 py-4 space-y-5">
      {/* Price chart */}
      <div className="bg-card/50 border border-border/30 rounded-xl overflow-hidden">
        <div className="h-[240px]">
          {priceLoading ? (
            <div className="h-full flex items-center justify-center">
              <div className="w-5 h-5 border-2 border-emerald-500/30 border-t-emerald-500 rounded-full animate-spin" />
            </div>
          ) : priceHistory && priceHistory.length > 0 ? (
            <StockPriceChart symbol={symbol} data={priceHistory} height={220} />
          ) : (
            <div className="h-full flex items-center justify-center text-sm text-muted-foreground">
              暂无价格数据
            </div>
          )}
        </div>
      </div>

      {/* Health score + key metrics snapshot */}
      <div className="bg-card/50 border border-border/30 rounded-xl p-4 space-y-3">
        <div className="flex items-center gap-3">
          <div className="relative flex-shrink-0">
            <svg width={(ringR + ringStroke) * 2} height={(ringR + ringStroke) * 2} className="transform -rotate-90">
              <circle cx={ringR + ringStroke} cy={ringR + ringStroke} r={ringR} fill="none" stroke="currentColor" strokeOpacity="0.08" strokeWidth={ringStroke} />
              <circle cx={ringR + ringStroke} cy={ringR + ringStroke} r={ringR} fill="none" className={ringColor} strokeWidth={ringStroke}
                strokeDasharray={ringCirc} strokeDashoffset={ringCirc - ringProgress} strokeLinecap="round" />
            </svg>
            <div className="absolute inset-0 flex items-center justify-center">
              <span className={`text-sm font-data font-bold ${ringTextColor}`}>{healthData.score}</span>
            </div>
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-xs uppercase tracking-wider text-muted-foreground mb-1">健康评分</div>
            <div className="grid grid-cols-2 gap-x-3 gap-y-0.5">
              {healthData.details.map(d => (
                <div key={d.label} className="flex items-center gap-1 text-xs">
                  <span className={d.passed ? 'text-emerald-400' : 'text-muted-foreground/60'}>
                    {d.passed ? '+' : '-'}
                  </span>
                  <span className="text-muted-foreground truncate">{d.label}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
        {/* Key growth metrics */}
        <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 pt-3 border-t border-border/20">
          <MetricRow label="营收增速" value={fmtPct(fundamentals?.growth.revenue_yoy, true)}
            positive={fundamentals?.growth.revenue_yoy ? fundamentals.growth.revenue_yoy > 0 : undefined} />
          <MetricRow label="EPS 增速" value={fmtPct(fundamentals?.growth.net_income_yoy, true)}
            positive={fundamentals?.growth.net_income_yoy ? fundamentals.growth.net_income_yoy > 0 : undefined} />
          <MetricRow label={fundamentals?.valuation.pe != null ? "P/E" : "Fwd P/E"} value={fmtNum(fundamentals?.valuation.pe ?? fundamentals?.valuation.forward_pe, 1)} />
          <MetricRow label="P/S" value={fmtNum(fundamentals?.valuation.ps, 1)} />
        </div>
      </div>

      {/* Section 01: Company Overview */}
      {quote && (
        <SectionCard title="公司概览" titleEn="Overview" numberLabel="01">
          <div className="grid grid-cols-2 gap-3">
            <MetricCard metricKey="market_cap" value={formatNumber(quote.market_cap, { style: 'currency', compact: true, currency })} />
            <MetricCard metricKey={fundamentals?.valuation.pe != null ? "pe" : "forward_pe"} value={formatNumber(fundamentals?.valuation.pe ?? fundamentals?.valuation.forward_pe)} />
            <MetricCard metricKey="eps" value={formatNumber(quote.eps ?? fundamentals?.ttm.eps ?? null, { style: 'currency', maximumFractionDigits: 2, currency })} />
            <MetricCard metricKey="dividend_yield" value={fundamentals?.valuation.dividend_yield ? `${fundamentals.valuation.dividend_yield.toFixed(2)}%` : '--'} />
            <MetricCard metricKey="volume" value={formatNumber(quote.volume, { compact: true })} />
          </div>

          {/* 52-Week Range */}
          {quote.week_52_low && quote.week_52_high && quote.price && (() => {
            const pos = ((quote.price - quote.week_52_low) / (quote.week_52_high - quote.week_52_low)) * 100;
            return (
              <div>
                <div className="text-xs text-muted-foreground mb-2">52 周价格区间</div>
                <div className="relative h-5 mb-1">
                  <div className="absolute top-2 left-0 right-0 h-1.5 bg-muted/30 rounded-full" />
                  <div className="absolute top-0.5 w-2.5 h-4 rounded bg-foreground/90 border border-background"
                    style={{ left: `${Math.min(Math.max(pos, 2), 98)}%`, transform: 'translateX(-50%)' }} />
                </div>
                <div className="flex justify-between text-xs font-data text-muted-foreground">
                  <span>{formatNumber(quote.week_52_low, { style: 'currency', currency, maximumFractionDigits: 0 })}</span>
                  <span className="text-foreground font-medium">{formatNumber(quote.price, { style: 'currency', currency })}</span>
                  <span>{formatNumber(quote.week_52_high, { style: 'currency', currency, maximumFractionDigits: 0 })}</span>
                </div>
              </div>
            );
          })()}

          {/* Market Data */}
          {fundamentals?.market_data && (
            <div className="grid grid-cols-2 gap-3 pt-4 border-t border-border/20">
              {fundamentals.market_data.beta != null && <MetricCard metricKey="beta" value={formatNumber(fundamentals.market_data.beta)} />}
              {fundamentals.market_data.short_ratio != null && <MetricCard metricKey="short_ratio" value={formatNumber(fundamentals.market_data.short_ratio)} />}
              {fundamentals.market_data.insider_ownership != null && <MetricCard metricKey="insider_ownership" value={formatNumber(fundamentals.market_data.insider_ownership, { style: 'percent' })} />}
              {fundamentals.market_data.institutional_ownership != null && <MetricCard metricKey="institutional_ownership" value={formatNumber(fundamentals.market_data.institutional_ownership, { style: 'percent' })} />}
            </div>
          )}
        </SectionCard>
      )}

      {/* Section 02: Financial Health */}
      {fundamentals && (
        <SectionCard title="财务体检" titleEn="Financial Health" numberLabel="02">
          <div>
            <SubsectionHeader title="增长指标" titleEn="Growth" />
            <div className="grid grid-cols-2 gap-3">
              <MetricCard metricKey="revenue_yoy" value={formatNumber(fundamentals.growth.revenue_yoy, { style: 'percent' })}
                trend={fundamentals.growth.revenue_yoy ? (fundamentals.growth.revenue_yoy > 0 ? 'up' : 'down') : 'neutral'} />
              <MetricCard metricKey="net_income_yoy" value={formatNumber(fundamentals.growth.net_income_yoy, { style: 'percent' })}
                trend={fundamentals.growth.net_income_yoy ? (fundamentals.growth.net_income_yoy > 0 ? 'up' : 'down') : 'neutral'} />
              <MetricCard metricKey="revenue_qoq" value={formatNumber(fundamentals.growth.revenue_qoq, { style: 'percent' })}
                trend={fundamentals.growth.revenue_qoq ? (fundamentals.growth.revenue_qoq > 0 ? 'up' : 'down') : 'neutral'} />
            </div>
          </div>
          <div>
            <SubsectionHeader title="盈利能力" titleEn="Profitability" />
            <div className="grid grid-cols-2 gap-3">
              <MetricCard metricKey="gross_margin" value={formatNumber(fundamentals.profitability.gross_margin, { style: 'percent' })} />
              <MetricCard metricKey="net_margin" value={formatNumber(fundamentals.profitability.net_margin, { style: 'percent' })} />
              <MetricCard metricKey="roe" value={formatNumber(fundamentals.profitability.roe, { style: 'percent' })} />
              <MetricCard metricKey="roa" value={formatNumber(fundamentals.profitability.roa, { style: 'percent' })} />
            </div>
          </div>
          {fundamentals.balance_sheet && Object.keys(fundamentals.balance_sheet).length > 0 && (
            <div>
              <SubsectionHeader title="资产负债" titleEn="Balance Sheet" />
              <div className="grid grid-cols-2 gap-3">
                {fundamentals.balance_sheet.current_ratio != null && <MetricCard metricKey="current_ratio" value={formatNumber(fundamentals.balance_sheet.current_ratio)} />}
                {fundamentals.balance_sheet.debt_to_equity != null && <MetricCard metricKey="debt_to_equity" value={formatNumber(fundamentals.balance_sheet.debt_to_equity)} />}
                {fundamentals.balance_sheet.total_debt != null && <MetricCard metricKey="total_debt" value={formatNumber(fundamentals.balance_sheet.total_debt, { style: 'currency', compact: true, currency })} />}
                {fundamentals.balance_sheet.total_cash != null && <MetricCard metricKey="total_cash" value={formatNumber(fundamentals.balance_sheet.total_cash, { style: 'currency', compact: true, currency })} />}
              </div>
            </div>
          )}
          <div>
            <SubsectionHeader title="过去十二个月" titleEn="TTM" />
            <div className="grid grid-cols-2 gap-3">
              <MetricCard metricKey="revenue" value={formatNumber(fundamentals.ttm.revenue, { style: 'currency', compact: true, currency })} />
              <MetricCard metricKey="net_income" value={formatNumber(fundamentals.ttm.net_income, { style: 'currency', compact: true, currency })} />
              <MetricCard metricKey="ebitda" value={formatNumber(fundamentals.ttm.ebitda, { style: 'currency', compact: true, currency })} />
              <MetricCard metricKey="operating_cash_flow" value={formatNumber(fundamentals.ttm.operating_cash_flow, { style: 'currency', compact: true, currency })} />
              <MetricCard metricKey="free_cash_flow" value={formatNumber(fundamentals.ttm.free_cash_flow, { style: 'currency', compact: true, currency })} />
              <MetricCard metricKey="eps" value={formatNumber(fundamentals.ttm.eps, { style: 'currency', maximumFractionDigits: 2, currency })} />
            </div>
          </div>
          {financials && financials.quarters?.length > 0 && (
            <div>
              <SubsectionHeader title="季度数据" titleEn="Quarterly" />
              <FinancialsTable quarters={financials.quarters} currency={currency} />
            </div>
          )}
        </SectionCard>
      )}

      {/* Section 03: Valuation */}
      {fundamentals && (
        <SectionCard title="估值判断" titleEn="Valuation" numberLabel="03">
          <div className="grid grid-cols-2 gap-3">
            <MetricCard metricKey={fundamentals.valuation.pe != null ? "pe" : "forward_pe"} value={formatNumber(fundamentals.valuation.pe ?? fundamentals.valuation.forward_pe)} />
            <MetricCard metricKey="ps" value={formatNumber(fundamentals.valuation.ps)} />
            <MetricCard metricKey="pb" value={formatNumber(fundamentals.valuation.pb)} />
            <MetricCard metricKey="ev_ebitda" value={formatNumber(fundamentals.valuation.ev_to_ebitda)} />
            <MetricCard metricKey="peg" value={formatNumber(fundamentals.valuation.peg)} />
            <MetricCard metricKey="dividend_yield" value={fundamentals.valuation.dividend_yield ? `${fundamentals.valuation.dividend_yield.toFixed(2)}%` : '--'} />
          </div>
          {valuationData && !valuationLoading && (
            <ValuationComparisonSection data={valuationData} loading={valuationLoading} />
          )}
        </SectionCard>
      )}
    </div>
  );
}

function MetricRow({ label, value, positive }: { label: string; value: string; positive?: boolean }) {
  return (
    <div className="flex justify-between items-baseline">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className={`text-sm font-data font-medium ${
        positive === undefined ? 'text-muted-foreground' : positive ? 'text-emerald-400' : 'text-red-400'
      }`}>{value}</span>
    </div>
  );
}
