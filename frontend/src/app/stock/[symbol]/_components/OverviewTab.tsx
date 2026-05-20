'use client';

import { useMemo } from 'react';
import dynamic from 'next/dynamic';
import {
  ValuationComparisonSection,
  MetricCard,
  SubsectionHeader,
  FinancialsTable,
  SectionCard,
  formatNumber,
} from './StockDetailContent';
import { AnalysisSection, AIPaywall } from './shared';

const StockPriceChart = dynamic(
  () => import('@/components/StockPriceChart').then(mod => mod.StockPriceChart),
  { ssr: false, loading: () => <div className="h-[340px] bg-card/30 animate-pulse rounded-xl" /> },
);

// =============================================================================
// Types
// =============================================================================

interface OverviewTabProps {
  symbol: string;
  companyName: string;
  currency?: string;
  quote: {
    price: number | null;
    market_cap: number | null;
    volume: number | null;
    week_52_high: number | null;
    week_52_low: number | null;
    eps: number | null;
    change_percent?: number;
  } | null;
  fundamentals: {
    ttm: { revenue?: number; net_income?: number; eps?: number; ebitda?: number; free_cash_flow?: number; operating_cash_flow?: number };
    valuation: { pe?: number; forward_pe?: number; ps?: number; pb?: number; ev_to_ebitda?: number; dividend_yield?: number; peg?: number };
    growth: { revenue_yoy?: number; net_income_yoy?: number; revenue_qoq?: number };
    profitability: { gross_margin?: number; operating_margin?: number; net_margin?: number; roe?: number; roa?: number };
    balance_sheet?: { current_ratio?: number; debt_to_equity?: number; total_debt?: number; total_cash?: number; quick_ratio?: number };
    market_data?: { beta?: number; short_ratio?: number; insider_ownership?: number; institutional_ownership?: number };
  } | null;
  financials: {
    latest_quarter: string | null;
    quarters: Array<{
      period: string;
      income_statement?: { revenue?: number; gross_profit?: number; net_income?: number; eps?: number };
      cash_flow?: { free_cash_flow?: number };
    }>;
  } | null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  valuationData: any;
  valuationLoading: boolean;
  analysis: {
    company_overview?: string; financial_health?: string; valuation_judgment?: string;
    catalysts_and_risks?: string; investment_summary?: string;
    company_profile?: string;
  } | null;
  analysisLoading: boolean;
  onGenerate: () => void;
  onRegenerate: () => void;
  priceHistory: Array<{ date: string; open: number; high: number; low: number; close: number; volume: number }>;
  priceHistoryLoading: boolean;
  analystTargets?: { target_low?: number; target_median?: number; target_high?: number } | null;
  dcfValue?: number | null;
  hasAIAccess?: boolean;
}

// =============================================================================
// Helpers
// =============================================================================

function fmtNum(v: number | null | undefined, decimals = 2): string {
  if (v === null || v === undefined) return '--';
  return v.toFixed(decimals);
}

function fmtPct(v: number | null | undefined, sign = false): string {
  if (v === null || v === undefined) return '--';
  const s = (v * 100).toFixed(1);
  return sign && v > 0 ? `+${s}%` : `${s}%`;
}

function getCurrencySymbol(currency?: string): string {
  if (!currency || currency === 'USD') return '$';
  try {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency })
      .formatToParts(0).find(p => p.type === 'currency')?.value || currency;
  } catch { return currency; }
}

function fmtBig(v: number | null | undefined, currency?: string): string {
  if (v === null || v === undefined) return '--';
  const sym = getCurrencySymbol(currency);
  if (Math.abs(v) >= 1e12) return `${sym}${(v / 1e12).toFixed(2)}T`;
  if (Math.abs(v) >= 1e9) return `${sym}${(v / 1e9).toFixed(1)}B`;
  if (Math.abs(v) >= 1e6) return `${sym}${(v / 1e6).toFixed(0)}M`;
  return `${sym}${v.toFixed(0)}`;
}

function computeHealthScore(fundamentals: OverviewTabProps['fundamentals']): {
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

// =============================================================================
// Stock Snapshot Card (右上, 图表旁边)
// =============================================================================

function StockSnapshot({ quote, fundamentals, analystTargets, dcfValue, currency }: {
  quote: OverviewTabProps['quote'];
  fundamentals: OverviewTabProps['fundamentals'];
  analystTargets?: OverviewTabProps['analystTargets'];
  dcfValue?: number | null;
  currency?: string;
}) {
  const price = quote?.price ?? 0;
  const pe = fundamentals?.valuation.pe ?? fundamentals?.valuation.forward_pe;
  const w52High = quote?.week_52_high;
  const w52Low = quote?.week_52_low;
  const healthData = useMemo(() => computeHealthScore(fundamentals), [fundamentals]);

  // 52-week position
  const w52Pos = (w52Low && w52High && price && w52High > w52Low)
    ? ((price - w52Low) / (w52High - w52Low)) * 100
    : null;

  // Fair value position
  const tLow = analystTargets?.target_low;
  const tMed = analystTargets?.target_median;
  const tHigh = analystTargets?.target_high;
  const hasFairValue = tLow && tHigh && price;
  let fvMin = 0, fvRange = 1, fvPricePos = 50, fvLowPos = 0, fvHighPos = 100, fvMedPos = 50;
  if (hasFairValue) {
    fvMin = Math.min(tLow, price) * 0.92;
    const fvMax = Math.max(tHigh, price) * 1.08;
    fvRange = fvMax - fvMin;
    fvPricePos = ((price - fvMin) / fvRange) * 100;
    fvLowPos = ((tLow - fvMin) / fvRange) * 100;
    fvHighPos = ((tHigh - fvMin) / fvRange) * 100;
    if (tMed) fvMedPos = ((tMed - fvMin) / fvRange) * 100;
  }
  const upside = tMed ? ((tMed - price) / price * 100).toFixed(1) : null;

  // Health ring
  const ringR = 24, ringStroke = 4;
  const ringCirc = 2 * Math.PI * ringR;
  const ringProgress = (healthData.score / 10) * ringCirc;
  const ringColor = healthData.score >= 7 ? 'stroke-emerald-500' : healthData.score >= 4 ? 'stroke-amber-500' : 'stroke-red-500';
  const ringTextColor = healthData.score >= 7 ? 'text-emerald-400' : healthData.score >= 4 ? 'text-amber-400' : 'text-red-400';

  return (
    <div className="bg-card/50 border border-border/30 rounded-xl p-4 flex flex-col gap-4 h-full">

      {/* Block 1: Valuation Position */}
      <div>
        <div className="text-xs uppercase tracking-wider text-muted-foreground mb-2">估值定位</div>
        <div className="flex items-baseline gap-2 mb-3">
          <span className="text-2xl font-data font-bold text-foreground">
            {pe ? fmtNum(pe, 1) : '--'}
          </span>
          <span className="text-xs text-muted-foreground">{fundamentals?.valuation.pe != null ? 'P/E' : 'Fwd P/E'}</span>
          {fundamentals?.valuation.ps && (
            <span className="text-xs font-data text-muted-foreground ml-2">
              P/S {fmtNum(fundamentals.valuation.ps, 1)}
            </span>
          )}
        </div>

        {/* Fair Value Bar */}
        {hasFairValue && (
          <div className="mb-1">
            <div className="relative h-5">
              <div className="absolute top-2 left-0 right-0 h-1.5 bg-muted/30 rounded-full" />
              <div
                className="absolute top-2 h-1.5 bg-emerald-500/25 rounded-full"
                style={{ left: `${fvLowPos}%`, width: `${fvHighPos - fvLowPos}%` }}
              />
              {tMed && <div className="absolute top-1.5 w-0.5 h-2.5 bg-emerald-400 rounded-full" style={{ left: `${fvMedPos}%` }} />}
              <div
                className="absolute top-0.5 w-2.5 h-4 rounded bg-foreground/90 border border-background"
                style={{ left: `${fvPricePos}%`, transform: 'translateX(-50%)' }}
              />
            </div>
            <div className="flex justify-between text-xs font-data text-muted-foreground mt-0.5">
              <span>{formatNumber(tLow, { style: 'currency', currency, maximumFractionDigits: 0 })}</span>
              {upside && (
                <span className={Number(upside) > 0 ? 'text-emerald-400' : 'text-red-400'}>
                  {Number(upside) > 0 ? '+' : ''}{upside}%
                </span>
              )}
              <span>{formatNumber(tHigh, { style: 'currency', currency, maximumFractionDigits: 0 })}</span>
            </div>
          </div>
        )}
        {dcfValue && (
          <div className="flex justify-between text-xs mt-1">
            <span className="text-muted-foreground">DCF 估值</span>
            <span className="font-data text-foreground">{formatNumber(dcfValue, { style: 'currency', currency, maximumFractionDigits: 0 })}</span>
          </div>
        )}
      </div>

      {/* Divider */}
      <div className="border-t border-border/20" />

      {/* Block 2: Financial Health */}
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
            {healthData.details.slice(0, 4).map(d => (
              <div key={d.label} className="flex items-center gap-1 text-xs">
                <span className={d.passed ? 'text-emerald-400' : 'text-muted-foreground'}>
                  {d.passed ? '+' : '-'}
                </span>
                <span className="text-muted-foreground truncate">{d.label}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Divider */}
      <div className="border-t border-border/20" />

      {/* Block 3: Trend & Position */}
      <div>
        <div className="text-xs uppercase tracking-wider text-muted-foreground mb-2">趋势方位</div>

        {/* 52-week range */}
        {w52Pos !== null && (
          <div className="mb-2">
            <div className="relative h-4">
              <div className="absolute top-1.5 left-0 right-0 h-1 bg-muted/30 rounded-full" />
              <div
                className="absolute top-0.5 w-2 h-3 rounded bg-foreground/80 border border-background"
                style={{ left: `${w52Pos}%`, transform: 'translateX(-50%)' }}
              />
            </div>
            <div className="flex justify-between text-xs font-data text-muted-foreground">
              <span>{formatNumber(w52Low, { style: 'currency', currency, maximumFractionDigits: 0 })} (52周低)</span>
              <span>{formatNumber(w52High, { style: 'currency', currency, maximumFractionDigits: 0 })} (52周高)</span>
            </div>
          </div>
        )}

        {/* Key growth metrics */}
        <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 mt-2">
          <MetricRow label="营收增速" value={fmtPct(fundamentals?.growth.revenue_yoy, true)}
            positive={fundamentals?.growth.revenue_yoy ? fundamentals.growth.revenue_yoy > 0 : undefined} />
          <MetricRow label="EPS 增速" value={fmtPct(fundamentals?.growth.net_income_yoy, true)}
            positive={fundamentals?.growth.net_income_yoy ? fundamentals.growth.net_income_yoy > 0 : undefined} />
          <MetricRow label="市值" value={fmtBig(quote?.market_cap, currency)} />
          <MetricRow label="股息率" value={fundamentals?.valuation.dividend_yield ? fmtPct(fundamentals.valuation.dividend_yield) : '--'} />
        </div>
      </div>
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

// =============================================================================
// Main Component
// =============================================================================

export function OverviewTab({
  symbol,
  companyName,
  currency,
  quote,
  fundamentals,
  financials,
  valuationData,
  valuationLoading,
  analysis,
  analysisLoading,
  onGenerate,
  onRegenerate,
  priceHistory,
  priceHistoryLoading,
  analystTargets,
  dcfValue,
  hasAIAccess = true,
}: OverviewTabProps) {

  const hasAnalysis = analysis && (
    analysis.company_profile || analysis.company_overview ||
    analysis.financial_health || analysis.valuation_judgment
  );

  const getAI = (key: string) => {
    if (!analysis) return '';
    return (analysis as Record<string, string | undefined>)[key] || '';
  };

  // Error state
  if (!quote && !fundamentals && !priceHistoryLoading && !analysisLoading) {
    return (
      <div className="bg-card/50 border border-border/30 rounded-xl p-8 text-center">
        <p className="text-sm text-muted-foreground">数据加载失败，请稍后重试</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">

      {/* ================================================================ */}
      {/* ROW 1: Price Chart (60%) + Stock Snapshot (40%)                  */}
      {/* ================================================================ */}
      <div className="grid grid-cols-1 lg:grid-cols-[1.4fr_1fr] gap-5">
        {/* Price Chart */}
        <div className="bg-card/50 border border-border/30 rounded-xl overflow-hidden">
          <div className="h-[340px]">
            {priceHistoryLoading ? (
              <div className="h-full flex items-center justify-center">
                <div className="w-5 h-5 border-2 border-emerald-500/30 border-t-emerald-500 rounded-full animate-spin" />
              </div>
            ) : priceHistory.length > 0 ? (
              <StockPriceChart symbol={symbol} data={priceHistory} height={320} />
            ) : (
              <div className="h-full flex items-center justify-center text-sm text-muted-foreground">
                暂无价格数据
              </div>
            )}
          </div>
        </div>

        {/* Stock Snapshot */}
        <StockSnapshot
          quote={quote}
          fundamentals={fundamentals}
          analystTargets={analystTargets}
          dcfValue={dcfValue}
          currency={currency}
        />
      </div>

      {/* ================================================================ */}
      {/* ROW 3: Left AI Analysis + Right Data Tables                      */}
      {/* ================================================================ */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 items-start">

        {/* LEFT: AI Analysis */}
        <div className="order-2 lg:order-1">
          <div className="bg-card/50 border border-border/30 rounded-xl overflow-hidden">
            {!hasAIAccess ? (
              <AIPaywall symbol={symbol} label="AI 投研分析" />
            ) : hasAnalysis ? (
              <>
                <div className="px-4 py-2.5 border-b border-border/20 bg-card/40 flex items-center justify-between">
                  <span className="text-sm font-medium text-foreground">AI 投研分析</span>
                  {hasAIAccess && (
                    <button onClick={onRegenerate} disabled={analysisLoading}
                      className="text-muted-foreground hover:text-emerald-400 transition-colors p-1 rounded cursor-pointer focus-visible:ring-2 focus-visible:ring-emerald-500/40 focus-visible:outline-none disabled:opacity-50" title="重新生成">
                      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182" />
                      </svg>
                    </button>
                  )}
                </div>
                <div className="px-4 py-3">
                  <AnalysisSection label="公司概览" content={getAI('company_profile') || getAI('company_overview')} accentColor="emerald" />
                  <AnalysisSection label="财务健康" content={getAI('financial_health')} accentColor="emerald" />
                  <AnalysisSection label="估值判断" content={getAI('valuation_judgment')} accentColor="emerald" />
                  <AnalysisSection label="催化剂与风险" content={getAI('catalysts_and_risks')} accentColor="emerald" />
                  <AnalysisSection label="投资摘要" content={getAI('investment_summary')} accentColor="emerald" />
                </div>
              </>
            ) : analysisLoading ? (
              <div className="p-8 text-center">
                <div className="w-6 h-6 border-2 border-emerald-500/30 border-t-emerald-500 rounded-full animate-spin mx-auto mb-3" />
                <p className="text-xs text-muted-foreground">正在生成 {symbol} 投资分析...</p>
              </div>
            ) : (
              <div className="p-6 text-center">
                <div className="inline-flex items-center gap-1.5 text-xs uppercase tracking-[0.15em] text-emerald-500/50 mb-3">
                  <div className="w-4 h-px bg-emerald-500/25" />
                  AI 投研分析
                  <div className="w-4 h-px bg-emerald-500/25" />
                </div>
                <h3 className="font-editorial text-lg text-foreground mb-2">{symbol} 投资分析</h3>
                <p className="text-xs text-muted-foreground mb-4 leading-relaxed">
                  AI 从公司概况、财务健康、估值和催化剂四个维度分析 {companyName}
                </p>
                <button onClick={onGenerate}
                  className="group inline-flex items-center gap-2 px-5 py-2 bg-emerald-500/10 border border-emerald-500/25 rounded-lg
                    text-sm font-medium text-emerald-400 hover:bg-emerald-500/20 hover:border-emerald-500/40 transition-all cursor-pointer
                    focus-visible:ring-2 focus-visible:ring-emerald-500/40 focus-visible:outline-none">
                  <span>生成投资分析</span>
                  <svg className="w-3.5 h-3.5 transition-transform group-hover:translate-x-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M17 8l4 4m0 0l-4 4m4-4H3" />
                  </svg>
                </button>
              </div>
            )}
          </div>
        </div>

        {/* RIGHT: Categorized Data (3 big sections matching AI) */}
        <div className="order-1 lg:order-2 space-y-5">

          {/* ── 01 公司概览 ── */}
          {quote && (
            <SectionCard title="公司概览" titleEn="Overview" numberLabel="01">

              <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                <MetricCard metricKey="market_cap" value={formatNumber(quote.market_cap, { style: 'currency', compact: true, currency })} />
                <MetricCard metricKey={fundamentals?.valuation.pe != null ? "pe" : "forward_pe"} value={formatNumber(fundamentals?.valuation.pe ?? fundamentals?.valuation.forward_pe)} />
                <MetricCard metricKey="eps" value={formatNumber(quote.eps ?? fundamentals?.ttm.eps ?? null, { style: 'currency', maximumFractionDigits: 2, currency })} />
                <MetricCard metricKey="dividend_yield" value={fundamentals?.valuation.dividend_yield ? `${fundamentals.valuation.dividend_yield.toFixed(2)}%` : '--'} />
                <MetricCard metricKey="volume" value={formatNumber(quote.volume, { compact: true })} />
              </div>

              {/* 52-Week Range */}
              {quote.week_52_low && quote.week_52_high && quote.price && (() => {
                const pos = ((quote.price! - quote.week_52_low!) / (quote.week_52_high! - quote.week_52_low!)) * 100;
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
                <div className="grid grid-cols-2 md:grid-cols-3 gap-3 pt-4 border-t border-border/20">
                  {fundamentals.market_data.beta != null && <MetricCard metricKey="beta" value={formatNumber(fundamentals.market_data.beta)} />}
                  {fundamentals.market_data.short_ratio != null && <MetricCard metricKey="short_ratio" value={formatNumber(fundamentals.market_data.short_ratio)} />}
                  {fundamentals.market_data.insider_ownership != null && <MetricCard metricKey="insider_ownership" value={formatNumber(fundamentals.market_data.insider_ownership, { style: 'percent' })} />}
                  {fundamentals.market_data.institutional_ownership != null && <MetricCard metricKey="institutional_ownership" value={formatNumber(fundamentals.market_data.institutional_ownership, { style: 'percent' })} />}
                </div>
              )}
            </SectionCard>
          )}

          {/* ── 02 财务体检 ── */}
          {fundamentals && (
            <SectionCard title="财务体检" titleEn="Financial Health" numberLabel="02">

              {/* Growth */}
              <div>
                <SubsectionHeader title="增长指标" titleEn="Growth" />
                <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                  <MetricCard metricKey="revenue_yoy" value={formatNumber(fundamentals.growth.revenue_yoy, { style: 'percent' })}
                    trend={fundamentals.growth.revenue_yoy ? (fundamentals.growth.revenue_yoy > 0 ? 'up' : 'down') : 'neutral'} />
                  <MetricCard metricKey="net_income_yoy" value={formatNumber(fundamentals.growth.net_income_yoy, { style: 'percent' })}
                    trend={fundamentals.growth.net_income_yoy ? (fundamentals.growth.net_income_yoy > 0 ? 'up' : 'down') : 'neutral'} />
                  <MetricCard metricKey="revenue_qoq" value={formatNumber(fundamentals.growth.revenue_qoq, { style: 'percent' })}
                    trend={fundamentals.growth.revenue_qoq ? (fundamentals.growth.revenue_qoq > 0 ? 'up' : 'down') : 'neutral'} />
                </div>
              </div>

              {/* Profitability */}
              <div>
                <SubsectionHeader title="盈利能力" titleEn="Profitability" />
                <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                  <MetricCard metricKey="gross_margin" value={formatNumber(fundamentals.profitability.gross_margin, { style: 'percent' })} />
                  <MetricCard metricKey="net_margin" value={formatNumber(fundamentals.profitability.net_margin, { style: 'percent' })} />
                  <MetricCard metricKey="roe" value={formatNumber(fundamentals.profitability.roe, { style: 'percent' })} />
                  <MetricCard metricKey="roa" value={formatNumber(fundamentals.profitability.roa, { style: 'percent' })} />
                </div>
              </div>

              {/* Balance Sheet */}
              {fundamentals.balance_sheet && Object.keys(fundamentals.balance_sheet).length > 0 && (
                <div>
                  <SubsectionHeader title="资产负债" titleEn="Balance Sheet" />
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                    {fundamentals.balance_sheet.current_ratio != null && <MetricCard metricKey="current_ratio" value={formatNumber(fundamentals.balance_sheet.current_ratio)} />}
                    {fundamentals.balance_sheet.debt_to_equity != null && <MetricCard metricKey="debt_to_equity" value={formatNumber(fundamentals.balance_sheet.debt_to_equity)} />}
                    {fundamentals.balance_sheet.total_debt != null && <MetricCard metricKey="total_debt" value={formatNumber(fundamentals.balance_sheet.total_debt, { style: 'currency', compact: true, currency })} />}
                    {fundamentals.balance_sheet.total_cash != null && <MetricCard metricKey="total_cash" value={formatNumber(fundamentals.balance_sheet.total_cash, { style: 'currency', compact: true, currency })} />}
                  </div>
                </div>
              )}

              {/* TTM */}
              <div>
                <SubsectionHeader title="过去十二个月" titleEn="TTM" />
                <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                  <MetricCard metricKey="revenue" value={formatNumber(fundamentals.ttm.revenue, { style: 'currency', compact: true, currency })} />
                  <MetricCard metricKey="net_income" value={formatNumber(fundamentals.ttm.net_income, { style: 'currency', compact: true, currency })} />
                  <MetricCard metricKey="ebitda" value={formatNumber(fundamentals.ttm.ebitda, { style: 'currency', compact: true, currency })} />
                  <MetricCard metricKey="operating_cash_flow" value={formatNumber(fundamentals.ttm.operating_cash_flow, { style: 'currency', compact: true, currency })} />
                  <MetricCard metricKey="free_cash_flow" value={formatNumber(fundamentals.ttm.free_cash_flow, { style: 'currency', compact: true, currency })} />
                  <MetricCard metricKey="eps" value={formatNumber(fundamentals.ttm.eps, { style: 'currency', maximumFractionDigits: 2, currency })} />
                </div>
              </div>

              {/* Quarterly Table */}
              {financials && financials.quarters.length > 0 && (
                <div>
                  <SubsectionHeader title="季度数据" titleEn="Quarterly" />
                  <FinancialsTable quarters={financials.quarters} currency={currency} />
                </div>
              )}
            </SectionCard>
          )}

          {/* ── 03 估值判断 ── */}
          {fundamentals && (
            <SectionCard title="估值判断" titleEn="Valuation" numberLabel="03">

              <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
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
      </div>
    </div>
  );
}

export default OverviewTab;
