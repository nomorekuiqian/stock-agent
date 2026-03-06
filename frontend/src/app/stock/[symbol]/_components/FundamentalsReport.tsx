'use client';

import { useEffect, useRef, useState } from 'react';
import { type StockAIAnalysis } from '@/components/StockAnalysisCard';
import {
  MetricCard,
  SubsectionHeader,
  MarkdownContent,
  FinancialsTable,
  ValuationComparisonSection,
  SectionCard,
  formatNumber,
} from './StockDetailContent';

// =============================================================================
// Types
// =============================================================================

interface FundamentalsReportProps {
  symbol: string;
  companyName: string;
  // AI
  analysis: StockAIAnalysis | null;
  analysisLoading: boolean;
  onGenerate: () => void;
  onRegenerate: () => void;
  // Auth
  isAuthenticated: boolean;
  isPro: boolean;
  onLoginRequired: () => void;
  onUpgradeRequired: () => void;
  // Data
  quote: {
    price: number | null;
    market_cap: number | null;
    volume: number | null;
    week_52_high: number | null;
    week_52_low: number | null;
    eps: number | null;
  } | null;
  fundamentals: {
    ttm: {
      revenue?: number;
      net_income?: number;
      eps?: number;
      ebitda?: number;
      free_cash_flow?: number;
      operating_cash_flow?: number;
    };
    valuation: {
      pe?: number;
      ps?: number;
      pb?: number;
      ev_to_ebitda?: number;
      dividend_yield?: number;
      peg?: number;
    };
    growth: {
      revenue_yoy?: number;
      revenue_qoq?: number;
      net_income_yoy?: number;
    };
    profitability: {
      gross_margin?: number;
      operating_margin?: number;
      net_margin?: number;
      roe?: number;
      roa?: number;
    };
    balance_sheet?: {
      current_ratio?: number;
      quick_ratio?: number;
      debt_to_equity?: number;
      total_debt?: number;
      total_cash?: number;
    };
    market_data?: {
      beta?: number;
      short_ratio?: number;
      insider_ownership?: number;
      institutional_ownership?: number;
    };
  } | null;
  financials: {
    latest_quarter: string | null;
    quarters: Array<{
      period: string;
      fiscal_quarter?: string;
      income_statement?: {
        revenue?: number;
        gross_profit?: number;
        operating_income?: number;
        net_income?: number;
        eps?: number;
      };
      balance_sheet?: {
        total_assets?: number;
        total_liabilities?: number;
        total_equity?: number;
        cash_and_equivalents?: number;
      };
      cash_flow?: {
        operating_cash_flow?: number;
        free_cash_flow?: number;
      };
    }>;
  } | null;
  valuationData: Parameters<typeof ValuationComparisonSection>[0]['data'];
  valuationLoading: boolean;
  stockDataMeta: { latest_quarter?: string } | null;
}

// =============================================================================
// Hooks
// =============================================================================

/** Intersection observer for staggered reveal animations */
function useReveal(delay = 0) {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    // Check prefers-reduced-motion
    const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (prefersReducedMotion) {
      requestAnimationFrame(() => setVisible(true));
      return;
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setTimeout(() => setVisible(true), delay);
          observer.unobserve(el);
        }
      },
      { threshold: 0.1, rootMargin: '0px 0px -40px 0px' },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [delay]);

  return { ref, visible };
}

// =============================================================================
// Internal Components
// =============================================================================

function ReportSection({
  number,
  title,
  titleEn,
  children,
  delay = 0,
}: {
  number: string;
  title: string;
  titleEn: string;
  children: React.ReactNode;
  delay?: number;
}) {
  const { ref, visible } = useReveal(delay);

  return (
    <div
      ref={ref}
      className={`transition-all duration-700 ease-out ${visible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-3'}`}
    >
      <SectionCard title={title} titleEn={titleEn} numberLabel={number}>
        {children}
      </SectionCard>
    </div>
  );
}

/** AI insight block - amber-accented editorial callout */
function AICallout({ content }: { content: string }) {
  return (
    <div className="relative overflow-hidden rounded-lg">
      {/* Gradient top border */}
      <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-amber-500/60 to-transparent" />
      <div className="p-5 bg-amber-500/[0.03] border border-amber-500/20 rounded-lg light:bg-amber-50/50 light:border-amber-200/60">
        <div className="flex items-start gap-3">
          <div className="mt-0.5 shrink-0 w-5 h-5 rounded-full bg-amber-500/10 flex items-center justify-center light:bg-amber-100">
            <svg className="w-3 h-3 text-amber-500 light:text-amber-600" fill="currentColor" viewBox="0 0 20 20">
              <path d="M11.3 1.046A1 1 0 0112 2v5h4a1 1 0 01.82 1.573l-7 10A1 1 0 018 18v-5H4a1 1 0 01-.82-1.573l7-10a1 1 0 011.12-.38z" />
            </svg>
          </div>
          <div className="flex-1 min-w-0">
            <MarkdownContent content={content} />
          </div>
        </div>
      </div>
    </div>
  );
}

/** Premium shimmer skeleton */
function AISkeleton() {
  return (
    <div className="space-y-3 p-5 bg-card/20 rounded-lg border border-border/20">
      <div className="flex items-center gap-2 mb-1">
        <div className="w-4 h-4 rounded-full bg-amber-500/10 animate-pulse" />
        <div className="h-3 w-20 bg-muted/60 rounded animate-shimmer" />
      </div>
      <div className="space-y-2.5">
        <div className="h-3.5 w-full bg-muted/40 rounded animate-shimmer" style={{ animationDelay: '100ms' }} />
        <div className="h-3.5 w-[92%] bg-muted/40 rounded animate-shimmer" style={{ animationDelay: '200ms' }} />
        <div className="h-3.5 w-4/5 bg-muted/40 rounded animate-shimmer" style={{ animationDelay: '300ms' }} />
        <div className="h-3.5 w-3/5 bg-muted/40 rounded animate-shimmer" style={{ animationDelay: '400ms' }} />
      </div>
    </div>
  );
}

/** Generate analysis CTA - editorial luxury style */
function AICta({
  symbol,
  companyName,
  onGenerate,
}: {
  symbol: string;
  companyName: string;
  isAuthenticated: boolean;
  isPro: boolean;
  onGenerate: () => void;
  onLoginRequired: () => void;
  onUpgradeRequired: () => void;
}) {
  return (
    <div className="relative bg-card/30 border border-border/30 rounded-xl overflow-hidden">
      {/* Decorative gradient lines */}
      <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-amber-500/50 to-transparent" />
      <div className="absolute bottom-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-border/50 to-transparent" />

      <div className="px-6 py-10 md:px-10 md:py-14">
        <div className="max-w-2xl mx-auto text-center">
          <p className="text-xs uppercase tracking-[0.25em] text-amber-500/70 light:text-amber-600 mb-5 font-medium">
            AI 投研
          </p>
          <h3 className="font-editorial text-2xl md:text-3xl text-foreground mb-4 leading-tight tracking-tight">
            解锁{' '}
            <span className="text-amber-400 light:text-amber-600 font-data">{symbol}</span>
            {' '}深度洞察
          </h3>
          <p className="text-sm text-muted-foreground leading-relaxed mb-10 max-w-md mx-auto">
            为 {companyName} 生成全面的基本面分析，涵盖财务体检、估值判断、催化剂与风险等维度。
          </p>
          <button
            onClick={onGenerate}
            className="group relative inline-flex items-center gap-3 px-8 py-4 bg-foreground text-background font-medium rounded-lg transition-all duration-300 hover:shadow-lg hover:shadow-emerald-500/10"
          >
            {/* TODO: temporarily bypass auth/pro check for dev */}
            <span className="text-sm">生成分析报告</span>
            <svg className="w-4 h-4 transition-transform duration-300 group-hover:translate-x-1" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M17 8l4 4m0 0l-4 4m4-4H3" />
            </svg>
          </button>
        </div>
      </div>
    </div>
  );
}

// Helper: should we show AI content
function useAIVisibility(
  analysis: StockAIAnalysis | null,
  analysisLoading: boolean,
) {
  // TODO: temporarily bypass auth/pro check for dev
  const canShowAI = true;
  const hasAnalysis = !!analysis;
  const showSkeleton = canShowAI && analysisLoading && !hasAnalysis;
  const showContent = canShowAI && hasAnalysis;
  const showCta = !hasAnalysis && !analysisLoading;
  return { canShowAI, showSkeleton, showContent, showCta };
}

// Helper: get AI content with V4 legacy fallback
function getAI(analysis: StockAIAnalysis | null, field: 'company_profile' | 'financial_health' | 'valuation_judgment' | 'catalysts_and_risks' | 'investment_summary'): string | undefined {
  if (!analysis) return undefined;
  // V5 fields
  if (analysis[field]) return analysis[field];
  // V4 legacy fallback
  const legacyMap: Record<string, string | undefined> = {
    company_profile: analysis.company_overview,
    financial_health: analysis.financials_analysis,
    valuation_judgment: analysis.valuation_range || analysis.fundamentals_analysis,
    catalysts_and_risks: [analysis.opportunities, analysis.risks].filter(Boolean).join('\n\n---\n\n') || undefined,
    investment_summary: analysis.investment_summary,
  };
  return legacyMap[field];
}

/** 52-week range visualization */
function WeekRangeBar({
  low,
  high,
  current,
  position,
}: {
  low: number;
  high: number;
  current: number;
  position: number;
}) {
  const { ref, visible } = useReveal(100);

  return (
    <div ref={ref} className="bg-card/30 border border-border/30 rounded-lg p-4 hover:border-border/50 transition-colors duration-300">
      <div className="flex items-center justify-between mb-3">
        <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground/80">52 周区间</span>
        <span className="text-xs text-muted-foreground font-data">
          {current.toFixed(2)} <span className="text-muted-foreground/50">at</span> {position.toFixed(0)}%
        </span>
      </div>
      <div className="flex items-center gap-3">
        <span className="text-sm font-data font-semibold text-red-400 light:text-red-600 w-20 shrink-0">
          ${low.toFixed(2)}
        </span>
        <div className="flex-1 relative h-2.5 bg-muted/60 rounded-full overflow-hidden">
          {/* Gradient fill */}
          <div
            className="absolute inset-y-0 left-0 rounded-full bg-gradient-to-r from-red-500/50 via-amber-500/50 to-emerald-500/50 transition-all duration-1000 ease-out"
            style={{ width: visible ? '100%' : '0%' }}
          />
          {/* Position indicator */}
          <div
            className="absolute top-1/2 -translate-y-1/2 transition-all duration-1000 ease-out"
            style={{ left: visible ? `calc(${Math.min(Math.max(position, 3), 97)}% - 7px)` : '0%' }}
          >
            <div className="w-3.5 h-3.5 rounded-full bg-foreground border-2 border-background shadow-md" />
          </div>
        </div>
        <span className="text-sm font-data font-semibold text-emerald-400 light:text-emerald-600 w-20 text-right shrink-0">
          ${high.toFixed(2)}
        </span>
      </div>
    </div>
  );
}

/** Data loading skeleton for metric grids */
function DataGridSkeleton({ count = 4 }: { count?: number }) {
  return (
    <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className="p-3 bg-muted/20 rounded-lg border border-border/20 animate-pulse" style={{ animationDelay: `${i * 75}ms` }}>
          <div className="h-3 w-16 bg-muted/40 rounded mb-2" />
          <div className="h-5 w-20 bg-muted/40 rounded" />
        </div>
      ))}
    </div>
  );
}

// =============================================================================
// Main Component
// =============================================================================

export default function FundamentalsReport({
  symbol,
  companyName,
  analysis,
  analysisLoading,
  onGenerate,
  onRegenerate,
  isAuthenticated,
  isPro,
  onLoginRequired,
  onUpgradeRequired,
  quote,
  fundamentals,
  financials,
  valuationData,
  valuationLoading,
  stockDataMeta,
}: FundamentalsReportProps) {
  const ai = useAIVisibility(analysis, analysisLoading);

  // Calculate 52-week position
  const pricePosition = quote?.week_52_low && quote?.week_52_high && quote?.price
    ? ((quote.price - quote.week_52_low) / (quote.week_52_high - quote.week_52_low)) * 100
    : 50;

  return (
    <div className="space-y-5">
      {/* CTA for non-Pro users - shown once at the top */}
      {ai.showCta && (
        <div className="animate-fade-in-up">
          <AICta
            symbol={symbol}
            companyName={companyName}
            isAuthenticated={isAuthenticated}
            isPro={isPro}
            onGenerate={onGenerate}
            onLoginRequired={onLoginRequired}
            onUpgradeRequired={onUpgradeRequired}
          />
        </div>
      )}

      {/* Regenerate button */}
      {ai.showContent && (
        <div className="flex justify-end animate-fade-in">
          <button
            onClick={onRegenerate}
            disabled={analysisLoading}
            className="group inline-flex items-center gap-1.5 px-3 py-1.5 text-xs text-muted-foreground hover:text-amber-400 light:hover:text-amber-600 transition-colors duration-200 disabled:opacity-50"
            title="重新生成分析"
          >
            <svg className={`w-3.5 h-3.5 transition-transform duration-500 ${analysisLoading ? 'animate-spin' : 'group-hover:rotate-180'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
            <span>重新生成</span>
          </button>
        </div>
      )}

      {/* ================================================================ */}
      {/* 01 Company Profile */}
      {/* ================================================================ */}
      <ReportSection number="01" title="公司画像" titleEn="Company Profile" delay={0}>
        {/* AI: company_profile */}
        {ai.showContent && getAI(analysis, 'company_profile') && (
          <div className="mb-6">
            <MarkdownContent content={getAI(analysis, 'company_profile')!} />
          </div>
        )}
        {ai.showSkeleton && <div className="mb-6"><AISkeleton /></div>}

        {/* Data: Key metrics + 52-week range */}
        {!quote ? (
          <div className="space-y-6">
            <DataGridSkeleton />
            <div className="h-16 bg-muted/20 rounded-lg animate-pulse" />
          </div>
        ) : (
          <div className="space-y-6">
            {/* Key Metrics */}
            <div>
              <SubsectionHeader title="关键指标" titleEn="Key Metrics" />
              <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                <MetricCard metricKey="market_cap" value={formatNumber(quote.market_cap, { style: 'currency', compact: true })} />
                <MetricCard metricKey="eps" value={formatNumber(quote.eps ?? fundamentals?.ttm.eps ?? null, { style: 'currency', maximumFractionDigits: 2 })} />
                <MetricCard metricKey="pe" value={formatNumber(fundamentals?.valuation.pe)} />
                <MetricCard metricKey="dividend_yield" value={fundamentals?.valuation.dividend_yield ? `${fundamentals.valuation.dividend_yield.toFixed(2)}%` : '--'} />
                <MetricCard metricKey="volume" value={formatNumber(quote.volume, { compact: true })} />
              </div>
            </div>

            {/* 52-Week Range */}
            {quote.week_52_low && quote.week_52_high && quote.price && (
              <WeekRangeBar
                low={quote.week_52_low}
                high={quote.week_52_high}
                current={quote.price}
                position={pricePosition}
              />
            )}

            {/* Market Data: Beta, Short Ratio, Ownership */}
            {fundamentals?.market_data && Object.keys(fundamentals.market_data).length > 0 && (
              <div>
                <SubsectionHeader title="市场数据" titleEn="Market Data" />
                <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                  {fundamentals.market_data.beta != null && (
                    <MetricCard metricKey="beta" value={formatNumber(fundamentals.market_data.beta)} />
                  )}
                  {fundamentals.market_data.short_ratio != null && (
                    <MetricCard metricKey="short_ratio" value={formatNumber(fundamentals.market_data.short_ratio)} />
                  )}
                  {fundamentals.market_data.insider_ownership != null && (
                    <MetricCard metricKey="insider_ownership" value={formatNumber(fundamentals.market_data.insider_ownership, { style: 'percent' })} />
                  )}
                  {fundamentals.market_data.institutional_ownership != null && (
                    <MetricCard metricKey="institutional_ownership" value={formatNumber(fundamentals.market_data.institutional_ownership, { style: 'percent' })} />
                  )}
                </div>
              </div>
            )}
          </div>
        )}
      </ReportSection>

      {/* ================================================================ */}
      {/* 02 Financial Health */}
      {/* ================================================================ */}
      <ReportSection number="02" title="财务体检" titleEn="Financial Health" delay={80}>
        {/* AI: financial_health */}
        {ai.showContent && getAI(analysis, 'financial_health') && (
          <div className="mb-6">
            <MarkdownContent content={getAI(analysis, 'financial_health')!} />
          </div>
        )}
        {ai.showSkeleton && <div className="mb-6"><AISkeleton /></div>}

        {/* Data: Growth + Profitability + Balance Sheet + TTM + Quarterly */}
        {!fundamentals ? (
          <div className="space-y-5">
            <DataGridSkeleton count={3} />
            <DataGridSkeleton />
          </div>
        ) : (
          <div className="space-y-6">
            {/* Growth */}
            <div>
              <SubsectionHeader title="增长指标" titleEn="Growth" />
              <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                <MetricCard
                  metricKey="revenue_yoy"
                  value={formatNumber(fundamentals.growth.revenue_yoy, { style: 'percent' })}
                  trend={fundamentals.growth.revenue_yoy ? (fundamentals.growth.revenue_yoy > 0 ? 'up' : 'down') : 'neutral'}
                />
                <MetricCard
                  metricKey="net_income_yoy"
                  value={formatNumber(fundamentals.growth.net_income_yoy, { style: 'percent' })}
                  trend={fundamentals.growth.net_income_yoy ? (fundamentals.growth.net_income_yoy > 0 ? 'up' : 'down') : 'neutral'}
                />
                <MetricCard
                  metricKey="revenue_qoq"
                  value={formatNumber(fundamentals.growth.revenue_qoq, { style: 'percent' })}
                  trend={fundamentals.growth.revenue_qoq ? (fundamentals.growth.revenue_qoq > 0 ? 'up' : 'down') : 'neutral'}
                />
              </div>
            </div>

            {/* Profitability */}
            <div>
              <SubsectionHeader title="盈利能力" titleEn="Profitability" />
              <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                <MetricCard metricKey="gross_margin" value={formatNumber(fundamentals.profitability.gross_margin, { style: 'percent' })} />
                <MetricCard metricKey="net_margin" value={formatNumber(fundamentals.profitability.net_margin, { style: 'percent' })} />
                <MetricCard metricKey="roe" value={formatNumber(fundamentals.profitability.roe, { style: 'percent' })} />
                <MetricCard metricKey="roa" value={formatNumber(fundamentals.profitability.roa, { style: 'percent' })} />
              </div>
            </div>

            {/* Balance Sheet Health */}
            {fundamentals.balance_sheet && Object.keys(fundamentals.balance_sheet).length > 0 && (
              <div>
                <SubsectionHeader title="资产负债" titleEn="Balance Sheet" />
                <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                  {fundamentals.balance_sheet.current_ratio != null && (
                    <MetricCard metricKey="current_ratio" value={formatNumber(fundamentals.balance_sheet.current_ratio)} />
                  )}
                  {fundamentals.balance_sheet.quick_ratio != null && (
                    <MetricCard metricKey="quick_ratio" value={formatNumber(fundamentals.balance_sheet.quick_ratio)} />
                  )}
                  {fundamentals.balance_sheet.debt_to_equity != null && (
                    <MetricCard metricKey="debt_to_equity" value={formatNumber(fundamentals.balance_sheet.debt_to_equity)} />
                  )}
                  {fundamentals.balance_sheet.total_debt != null && (
                    <MetricCard metricKey="total_debt" value={formatNumber(fundamentals.balance_sheet.total_debt, { style: 'currency', compact: true })} />
                  )}
                  {fundamentals.balance_sheet.total_cash != null && (
                    <MetricCard metricKey="total_cash" value={formatNumber(fundamentals.balance_sheet.total_cash, { style: 'currency', compact: true })} />
                  )}
                </div>
              </div>
            )}

            {/* TTM Key Financials */}
            <div>
              <SubsectionHeader title="过去十二个月" titleEn="TTM" />
              <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                <MetricCard metricKey="revenue" value={formatNumber(fundamentals.ttm.revenue, { style: 'currency', compact: true })} />
                <MetricCard metricKey="net_income" value={formatNumber(fundamentals.ttm.net_income, { style: 'currency', compact: true })} />
                <MetricCard metricKey="ebitda" value={formatNumber(fundamentals.ttm.ebitda, { style: 'currency', compact: true })} />
                <MetricCard metricKey="operating_cash_flow" value={formatNumber(fundamentals.ttm.operating_cash_flow, { style: 'currency', compact: true })} />
                <MetricCard metricKey="free_cash_flow" value={formatNumber(fundamentals.ttm.free_cash_flow, { style: 'currency', compact: true })} />
                <MetricCard metricKey="eps" value={formatNumber(fundamentals.ttm.eps, { style: 'currency', maximumFractionDigits: 2 })} />
              </div>
              {stockDataMeta?.latest_quarter && (
                <p className="text-xs text-muted-foreground/50 mt-2 font-data">
                  TTM (latest: {stockDataMeta.latest_quarter})
                </p>
              )}
            </div>
            {/* Quarterly Table */}
            {financials && (
              <div>
                <SubsectionHeader title="季度数据" titleEn="Quarterly" />
                <FinancialsTable quarters={financials.quarters} />
              </div>
            )}
          </div>
        )}
      </ReportSection>

      {/* ================================================================ */}
      {/* 03 Valuation Judgment */}
      {/* ================================================================ */}
      <ReportSection number="03" title="估值判断" titleEn="Valuation" delay={160}>
        {/* AI: valuation_judgment */}
        {ai.showContent && getAI(analysis, 'valuation_judgment') && (
          <div className="mb-6">
            <AICallout content={getAI(analysis, 'valuation_judgment')!} />
          </div>
        )}
        {ai.showSkeleton && <div className="mb-6"><AISkeleton /></div>}

        {/* Data: Valuation metrics + Historical + Industry + Peer */}
        {!fundamentals ? (
          <DataGridSkeleton count={6} />
        ) : (
          <div className="space-y-6">
            {/* Valuation Multiples */}
            <div>
              <SubsectionHeader title="估值指标" titleEn="Valuation Multiples" />
              <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                <MetricCard metricKey="pe" value={formatNumber(fundamentals.valuation.pe)} />
                <MetricCard metricKey="ps" value={formatNumber(fundamentals.valuation.ps)} />
                <MetricCard metricKey="pb" value={formatNumber(fundamentals.valuation.pb)} />
                <MetricCard metricKey="ev_ebitda" value={formatNumber(fundamentals.valuation.ev_to_ebitda)} />
                <MetricCard metricKey="peg" value={formatNumber(fundamentals.valuation.peg)} />
                <MetricCard metricKey="dividend_yield" value={fundamentals.valuation.dividend_yield ? `${fundamentals.valuation.dividend_yield.toFixed(2)}%` : '--'} />
              </div>
            </div>

            {/* Historical + Industry + Peer comparison */}
            <ValuationComparisonSection
              data={valuationData}
              loading={valuationLoading}
              currentValuation={fundamentals?.valuation}
            />
          </div>
        )}
      </ReportSection>

      {/* ================================================================ */}
      {/* 04 Catalysts & Risks */}
      {/* ================================================================ */}
      {(ai.showContent && getAI(analysis, 'catalysts_and_risks')) || ai.showSkeleton ? (
        <ReportSection number="04" title="催化剂与风险" titleEn="Catalysts & Risks" delay={240}>
          {ai.showSkeleton && <AISkeleton />}
          {ai.showContent && getAI(analysis, 'catalysts_and_risks') && (
            <MarkdownContent content={getAI(analysis, 'catalysts_and_risks')!} />
          )}
        </ReportSection>
      ) : null}

      {/* ================================================================ */}
      {/* 05 Investment Summary */}
      {/* ================================================================ */}
      {(ai.showContent && analysis?.investment_summary) || ai.showSkeleton ? (
        <ReportSection number="05" title="投资总结" titleEn="Investment Summary" delay={320}>
          {ai.showSkeleton && <AISkeleton />}
          {ai.showContent && analysis?.investment_summary && (
            <AICallout content={analysis.investment_summary} />
          )}
        </ReportSection>
      ) : null}
    </div>
  );
}
