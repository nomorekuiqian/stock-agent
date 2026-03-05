'use client';

import { type StockAIAnalysis } from '@/components/StockAnalysisCard';
import {
  MetricCard,
  StatRow,
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
// Internal Components
// =============================================================================

function ReportSection({
  number,
  title,
  titleEn,
  children,
}: {
  number: string;
  title: string;
  titleEn: string;
  children: React.ReactNode;
}) {
  return (
    <SectionCard
      title={title}
      titleEn={titleEn}
      numberLabel={number}
    >
      {children}
    </SectionCard>
  );
}

function AICallout({ content }: { content: string }) {
  return (
    <div className="p-4 bg-amber-500/[0.04] border-l-2 border-amber-500/40 rounded-r-lg">
      <MarkdownContent content={content} />
    </div>
  );
}

function AISkeleton() {
  return (
    <div className="animate-pulse space-y-2">
      <div className="h-4 w-full bg-muted rounded" />
      <div className="h-4 w-4/5 bg-muted rounded" />
      <div className="h-4 w-3/5 bg-muted rounded" />
    </div>
  );
}

function AICta({
  symbol,
  companyName,
  isAuthenticated,
  isPro,
  onGenerate,
  onLoginRequired,
  onUpgradeRequired,
}: {
  symbol: string;
  companyName: string;
  isAuthenticated: boolean;
  isPro: boolean;
  onGenerate: () => void;
  onLoginRequired: () => void;
  onUpgradeRequired: () => void;
}) {
  const handleClick = () => {
    if (!isAuthenticated) {
      onLoginRequired();
      return;
    }
    if (!isPro) {
      onUpgradeRequired();
      return;
    }
    onGenerate();
  };

  return (
    <div className="relative bg-card/30 border border-border/50 rounded-xl overflow-hidden">
      <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-amber-500/50 to-transparent" />
      <div className="px-6 py-8 md:px-10 md:py-10">
        <div className="max-w-2xl mx-auto text-center">
          <p className="text-xs uppercase tracking-[0.2em] text-amber-500/80 light:text-amber-600 mb-4">
            Investment Research
          </p>
          <h3 className="font-editorial text-2xl md:text-3xl text-foreground mb-3 leading-tight">
            Unlock Insights for <span className="text-amber-400 light:text-amber-600">{symbol}</span>
          </h3>
          <p className="text-sm md:text-base text-muted-foreground leading-relaxed mb-8 max-w-lg mx-auto">
            Generate a comprehensive analysis of {companyName}&apos;s fundamentals, financials, opportunities and risks.
          </p>
          <button
            onClick={handleClick}
            className="group inline-flex items-center gap-3 px-8 py-4 bg-foreground text-background font-medium rounded-lg transition-all hover:opacity-90"
          >
            {!isAuthenticated ? (
              <>
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                </svg>
                <span>Sign in to Analyze</span>
              </>
            ) : !isPro ? (
              <>
                <svg className="w-4 h-4 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z" />
                </svg>
                <span>Upgrade to Pro</span>
              </>
            ) : (
              <>
                <span>Generate Analysis</span>
                <svg className="w-4 h-4 transition-transform group-hover:translate-x-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M17 8l4 4m0 0l-4 4m4-4H3" />
                </svg>
              </>
            )}
          </button>
          {!isAuthenticated && (
            <p className="mt-4 text-xs text-muted-foreground">
              AI Analysis is available for registered users
            </p>
          )}
          {isAuthenticated && !isPro && (
            <p className="mt-4 text-xs text-muted-foreground">
              AI Analysis is a Pro feature
            </p>
          )}
        </div>
      </div>
      <div className="absolute bottom-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-border/50 to-transparent" />
    </div>
  );
}

// Helper: should we show AI content (user is logged in + Pro, and analysis exists or is loading)
function useAIVisibility(
  analysis: StockAIAnalysis | null,
  analysisLoading: boolean,
  isAuthenticated: boolean,
  isPro: boolean,
) {
  const canShowAI = isAuthenticated && isPro;
  const hasAnalysis = !!analysis;
  const showSkeleton = canShowAI && analysisLoading && !hasAnalysis;
  const showContent = canShowAI && hasAnalysis;
  const showCta = !canShowAI && !hasAnalysis && !analysisLoading;
  return { canShowAI, showSkeleton, showContent, showCta };
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
  const ai = useAIVisibility(analysis, analysisLoading, isAuthenticated, isPro);

  // Calculate 52-week position
  const pricePosition = quote?.week_52_low && quote?.week_52_high && quote?.price
    ? ((quote.price - quote.week_52_low) / (quote.week_52_high - quote.week_52_low)) * 100
    : 50;

  return (
    <div className="space-y-5">
      {/* CTA for non-Pro users - shown once at the top */}
      {ai.showCta && (
        <AICta
          symbol={symbol}
          companyName={companyName}
          isAuthenticated={isAuthenticated}
          isPro={isPro}
          onGenerate={onGenerate}
          onLoginRequired={onLoginRequired}
          onUpgradeRequired={onUpgradeRequired}
        />
      )}

      {/* Regenerate button (floating, only when analysis exists) */}
      {ai.showContent && (
        <div className="flex justify-end">
          <button
            onClick={onRegenerate}
            disabled={analysisLoading}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs text-muted-foreground hover:text-amber-400 transition-colors disabled:opacity-50"
            title="Regenerate analysis"
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
            <span>Regenerate</span>
          </button>
        </div>
      )}

      {/* ================================================================ */}
      {/* 01 Executive Summary */}
      {/* ================================================================ */}
      <ReportSection number="01" title="投资总结" titleEn="Executive Summary">
        {/* AI: investment_summary */}
        {ai.showContent && analysis?.investment_summary && (
          <div className="mb-5">
            <AICallout content={analysis.investment_summary} />
          </div>
        )}
        {ai.showSkeleton && (
          <div className="mb-5">
            <AISkeleton />
          </div>
        )}

        {/* Data: Key metrics strip + 52-week range */}
        {!quote ? (
          <div className="animate-pulse space-y-3">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
              {[1, 2, 3, 4].map(i => <div key={i} className="h-16 bg-muted rounded-lg" />)}
            </div>
            <div className="h-20 bg-muted rounded-lg" />
          </div>
        ) : (
          <>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mb-3">
              <MetricCard metricKey="market_cap" value={formatNumber(quote.market_cap, { style: 'currency', compact: true })} />
              <MetricCard metricKey="eps" value={formatNumber(quote.eps, { style: 'currency', maximumFractionDigits: 2 })} />
              <MetricCard metricKey="pe" value={formatNumber(fundamentals?.valuation.pe)} />
              <MetricCard metricKey="dividend_yield" value={fundamentals?.valuation.dividend_yield ? `${fundamentals.valuation.dividend_yield.toFixed(2)}%` : '--'} />
            </div>

            {/* 52-Week Range */}
            {quote.week_52_low && quote.week_52_high && (
              <div className="bg-card/30 border border-border/30 rounded-lg p-4">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm text-foreground/70">52 周区间</span>
                  <span className="text-sm text-muted-foreground font-data">at {pricePosition.toFixed(0)}%</span>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-sm font-data font-medium text-red-400 w-18">${quote.week_52_low.toFixed(2)}</span>
                  <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
                    <div className="h-full bg-gradient-to-r from-red-500/70 via-amber-500/70 to-emerald-500/70 relative rounded-full">
                      <div
                        className="absolute top-1/2 -translate-y-1/2 w-3.5 h-3.5 bg-emerald-500 rounded-full border-2 border-background shadow-sm"
                        style={{ left: `calc(${Math.min(Math.max(pricePosition, 5), 95)}% - 7px)` }}
                      />
                    </div>
                  </div>
                  <span className="text-sm font-data font-medium text-emerald-400 w-18 text-right">${quote.week_52_high.toFixed(2)}</span>
                </div>
              </div>
            )}
          </>
        )}
      </ReportSection>

      {/* ================================================================ */}
      {/* 02 Business Model & Competitive Advantage */}
      {/* ================================================================ */}
      {(ai.showContent && analysis?.company_overview) || ai.showSkeleton ? (
        <ReportSection number="02" title="盈利模式与竞争优势" titleEn="Business Model">
          {ai.showContent && analysis?.company_overview && (
            <MarkdownContent content={analysis.company_overview} />
          )}
          {ai.showSkeleton && <AISkeleton />}
        </ReportSection>
      ) : null}

      {/* ================================================================ */}
      {/* 03 Valuation Analysis */}
      {/* ================================================================ */}
      <ReportSection number="03" title="估值分析" titleEn="Valuation">
        {/* AI: valuation_range */}
        {ai.showContent && analysis?.valuation_range && (
          <div className="mb-5">
            <AICallout content={analysis.valuation_range} />
          </div>
        )}
        {ai.showSkeleton && (
          <div className="mb-5">
            <AISkeleton />
          </div>
        )}

        {/* Data: Valuation metrics */}
        {!fundamentals ? (
          <div className="animate-pulse space-y-3">
            <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
              {[1, 2, 3].map(i => <div key={i} className="h-16 bg-muted rounded-lg" />)}
            </div>
          </div>
        ) : (
          <div className="mb-5">
            <SubsectionHeader title="估值指标" titleEn="Valuation Multiples" />
            <p className="text-xs font-medium text-muted-foreground/80 uppercase tracking-wider mb-2">Trailing (TTM)</p>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
              <MetricCard metricKey="pe" value={formatNumber(fundamentals.valuation.pe)} />
              <MetricCard metricKey="ps" value={formatNumber(fundamentals.valuation.ps)} />
              <MetricCard metricKey="pb" value={formatNumber(fundamentals.valuation.pb)} />
            </div>
            {stockDataMeta?.latest_quarter && (
              <p className="text-xs text-muted-foreground/60 mt-1.5">
                TTM (latest: {stockDataMeta.latest_quarter})
              </p>
            )}
          </div>
        )}

        {/* Data: Historical + Industry + Peer comparison */}
        <ValuationComparisonSection
          data={valuationData}
          loading={valuationLoading}
          currentValuation={fundamentals?.valuation}
        />
      </ReportSection>

      {/* ================================================================ */}
      {/* 04 Growth & Profitability */}
      {/* ================================================================ */}
      <ReportSection number="04" title="增长与盈利" titleEn="Growth & Profitability">
        {/* AI: fundamentals_analysis */}
        {ai.showContent && analysis?.fundamentals_analysis && (
          <div className="mb-5">
            <MarkdownContent content={analysis.fundamentals_analysis} />
          </div>
        )}
        {ai.showSkeleton && (
          <div className="mb-5">
            <AISkeleton />
          </div>
        )}

        {/* Data: Growth metrics */}
        {!fundamentals ? (
          <div className="animate-pulse space-y-3">
            <div className="grid grid-cols-2 gap-2">
              {[1, 2, 3, 4].map(i => <div key={i} className="h-12 bg-muted rounded-lg" />)}
            </div>
          </div>
        ) : (
          <>
            <div className="mb-5 pb-5 border-b border-border/40">
              <SubsectionHeader title="增长指标" titleEn="Growth" />
              <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6">
                <StatRow
                  metricKey="revenue_yoy"
                  value={formatNumber(fundamentals.growth.revenue_yoy, { style: 'percent' })}
                  trend={fundamentals.growth.revenue_yoy ? (fundamentals.growth.revenue_yoy > 0 ? 'up' : 'down') : 'neutral'}
                />
                <StatRow
                  metricKey="net_income_yoy"
                  value={formatNumber(fundamentals.growth.net_income_yoy, { style: 'percent' })}
                  trend={fundamentals.growth.net_income_yoy ? (fundamentals.growth.net_income_yoy > 0 ? 'up' : 'down') : 'neutral'}
                />
                <StatRow
                  metricKey="revenue_qoq"
                  value={formatNumber(fundamentals.growth.revenue_qoq, { style: 'percent' })}
                  trend={fundamentals.growth.revenue_qoq ? (fundamentals.growth.revenue_qoq > 0 ? 'up' : 'down') : 'neutral'}
                />
              </div>
            </div>

            <div>
              <SubsectionHeader title="盈利能力" titleEn="Profitability" />
              <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                <MetricCard metricKey="gross_margin" value={formatNumber(fundamentals.profitability.gross_margin, { style: 'percent' })} />
                <MetricCard metricKey="net_margin" value={formatNumber(fundamentals.profitability.net_margin, { style: 'percent' })} />
                <MetricCard metricKey="roe" value={formatNumber(fundamentals.profitability.roe, { style: 'percent' })} />
                <MetricCard metricKey="roa" value={formatNumber(fundamentals.profitability.roa, { style: 'percent' })} />
              </div>
            </div>
          </>
        )}
      </ReportSection>

      {/* ================================================================ */}
      {/* 05 Financial Statements */}
      {/* ================================================================ */}
      <ReportSection number="05" title="财务报表" titleEn="Financial Statements">
        {/* AI: financials_analysis */}
        {ai.showContent && analysis?.financials_analysis && (
          <div className="mb-5">
            <MarkdownContent content={analysis.financials_analysis} />
          </div>
        )}
        {ai.showSkeleton && (
          <div className="mb-5">
            <AISkeleton />
          </div>
        )}

        {/* Data: TTM cards + quarterly table */}
        {!fundamentals || !financials ? (
          <div className="animate-pulse space-y-4">
            <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
              {[1, 2, 3, 4, 5, 6].map(i => <div key={i} className="h-16 bg-muted rounded-lg" />)}
            </div>
            <div className="h-48 bg-muted rounded-lg" />
          </div>
        ) : (
          <>
            <div className="mb-5 pb-5 border-b border-border/40">
              <SubsectionHeader title="过去十二个月" titleEn="TTM" />
              <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                <MetricCard metricKey="revenue" value={formatNumber(fundamentals.ttm.revenue, { style: 'currency', compact: true })} />
                <MetricCard metricKey="net_income" value={formatNumber(fundamentals.ttm.net_income, { style: 'currency', compact: true })} />
                <MetricCard metricKey="ebitda" value={formatNumber(fundamentals.ttm.ebitda, { style: 'currency', compact: true })} />
                <MetricCard metricKey="operating_cash_flow" value={formatNumber(fundamentals.ttm.operating_cash_flow, { style: 'currency', compact: true })} />
                <MetricCard metricKey="free_cash_flow" value={formatNumber(fundamentals.ttm.free_cash_flow, { style: 'currency', compact: true })} />
                <MetricCard metricKey="eps" value={formatNumber(fundamentals.ttm.eps, { style: 'currency', maximumFractionDigits: 2 })} />
              </div>
            </div>

            <div>
              <SubsectionHeader title="季度数据" titleEn="Quarterly" />
              <FinancialsTable quarters={financials.quarters} />
            </div>
          </>
        )}
      </ReportSection>

      {/* ================================================================ */}
      {/* 06 Catalysts & Risks */}
      {/* ================================================================ */}
      {(ai.showContent && (analysis?.opportunities || analysis?.risks)) || ai.showSkeleton ? (
        <ReportSection number="06" title="投资机会与风险" titleEn="Catalysts & Risks">
          {ai.showSkeleton && <AISkeleton />}
          {ai.showContent && (
            <div className="grid md:grid-cols-2 gap-5">
              {analysis?.opportunities && (
                <div>
                  <h3 className="flex items-center gap-2 text-sm font-medium tracking-wide mb-3">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400/80" />
                    <span className="text-emerald-400">投资机会</span>
                    <span className="text-muted-foreground/50 text-xs font-normal">Catalysts</span>
                  </h3>
                  <MarkdownContent content={analysis.opportunities} />
                </div>
              )}
              {analysis?.risks && (
                <div>
                  <h3 className="flex items-center gap-2 text-sm font-medium tracking-wide mb-3">
                    <span className="w-1.5 h-1.5 rounded-full bg-red-400/80" />
                    <span className="text-red-400">风险因素</span>
                    <span className="text-muted-foreground/50 text-xs font-normal">Risks</span>
                  </h3>
                  <MarkdownContent content={analysis.risks} />
                </div>
              )}
            </div>
          )}
        </ReportSection>
      ) : null}
    </div>
  );
}
