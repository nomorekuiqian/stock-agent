'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import Link from 'next/link';
import ReactMarkdown from 'react-markdown';
import { useAuth } from '@/contexts/AuthContext';
import { useWatchlist, useSaveWatchlist } from '@/hooks/queries/use-watchlist';
import {
  useStockDetail,
  useStockAnalysisCache,
  useGenerateStockAnalysis,
} from '@/hooks/queries/use-stock-data';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Data payload passed to parent for Agent context injection. */
export interface StockContextPayload {
  type: 'stock';
  symbol: string;
  quote: Record<string, unknown> | null;
  fundamentals: Record<string, unknown> | null;
  ai_analysis: string | null;
}

interface StockResearchViewProps {
  symbol: string;
  /** Called when stock data is loaded/updated, so parent can send context to Agent. */
  onContextReady?: (payload: StockContextPayload) => void;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatPrice(val: number | null | undefined): string {
  if (val == null || isNaN(val)) return '-';
  return `$${val.toFixed(2)}`;
}

function formatMarketCap(val: number | null | undefined): string {
  if (val == null || isNaN(val)) return '-';
  if (val >= 1e12) return `$${(val / 1e12).toFixed(1)}T`;
  if (val >= 1e9) return `$${(val / 1e9).toFixed(1)}B`;
  if (val >= 1e6) return `$${(val / 1e6).toFixed(0)}M`;
  return `$${val.toFixed(0)}`;
}

function formatPercent(val: number | null | undefined): string {
  if (val == null || isNaN(val)) return '-';
  if (Math.abs(val) < 0.0001) return '-';
  return `${(val * 100).toFixed(1)}%`;
}

function formatRatio(val: number | null | undefined): string {
  if (val == null || isNaN(val)) return '-';
  return val.toFixed(1);
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function StockResearchView({
  symbol,
  onContextReady,
}: StockResearchViewProps) {
  const { user } = useAuth();
  const { data: watchlistData } = useWatchlist(user?.id);
  const saveWatchlist = useSaveWatchlist();
  const [justAdded, setJustAdded] = useState(false);

  const isInWatchlist = watchlistData?.symbols?.includes(symbol) ?? false;

  const handleAddToWatchlist = useCallback(() => {
    if (!user || isInWatchlist) return;
    const current = watchlistData?.symbols ?? [];
    saveWatchlist.mutate({
      userId: user.id,
      symbols: [...current, symbol],
      email: user.email,
      baseUpdatedAt: watchlistData?.updated_at,
    });
    setJustAdded(true);
  }, [user, isInWatchlist, watchlistData, saveWatchlist, symbol]);

  // Data hooks
  const { data: stockData, isLoading: detailLoading, error: detailError } = useStockDetail(symbol);
  const { data: analysisCache } = useStockAnalysisCache(symbol);

  // Generation mutations
  const generateAnalysis = useGenerateStockAnalysis(symbol);

  // Extract data
  const profile = stockData?.profile;
  const quote = stockData?.quote;
  const fundamentals = stockData?.fundamentals;

  // AI analysis content
  const aiAnalysis = analysisCache || generateAnalysis.data;

  // Auto-trigger fundamental analysis on first load
  const autoTriggered = useRef(false);
  useEffect(() => {
    if (stockData && !analysisCache && !generateAnalysis.data && !generateAnalysis.isPending && !autoTriggered.current) {
      autoTriggered.current = true;
      generateAnalysis.mutate({});
    }
  }, [stockData, analysisCache, generateAnalysis]);

  // Build context payload for parent
  useEffect(() => {
    if (!onContextReady || !stockData) return;

    let aiText: string | null = null;
    if (aiAnalysis) {
      const sections = [
        aiAnalysis.company_profile,
        aiAnalysis.financial_health,
        aiAnalysis.valuation_judgment,
        aiAnalysis.catalysts_and_risks,
        aiAnalysis.investment_summary,
      ].filter(Boolean);
      if (sections.length > 0) {
        aiText = sections.join('\n\n');
      }
    }

    onContextReady({
      type: 'stock',
      symbol,
      quote: quote || null,
      fundamentals: fundamentals || null,
      ai_analysis: aiText,
    });
  }, [symbol, stockData, aiAnalysis, onContextReady, quote, fundamentals]);

  // Loading state
  if (detailLoading) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-4">
        <div className="relative w-12 h-12">
          <div className="absolute inset-0 rounded-full border border-primary/20" />
          <div className="absolute inset-0 rounded-full border-t border-primary animate-spin" />
          <span className="absolute inset-0 flex items-center justify-center font-data text-xs text-primary">
            {symbol.slice(0, 3)}
          </span>
        </div>
        <span className="text-xs text-muted-foreground">
          加载研究数据
        </span>
      </div>
    );
  }

  // Error state
  if (detailError || !stockData) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-3 px-6 text-center">
        <div className="w-10 h-10 rounded-full bg-red-500/10 flex items-center justify-center">
          <svg className="w-5 h-5 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
          </svg>
        </div>
        <p className="text-sm text-muted-foreground">
          无法加载 {symbol} 数据
        </p>
      </div>
    );
  }

  const companyName = profile?.company_name_zh || profile?.company_name || symbol;
  const changePercent = quote?.change_percent ?? 0;
  const changeColor = Math.abs(changePercent) < 0.01
    ? 'text-muted-foreground'
    : changePercent > 0
      ? 'text-emerald-500 dark:text-emerald-400'
      : 'text-red-500 dark:text-red-400';

  return (
    <div className="h-full overflow-y-auto">
      {/* Stock Hero Header */}
      <div className="px-5 pt-4 pb-4">
        {/* Symbol + Price hero */}
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="flex items-baseline gap-2.5">
              <h2 className="font-data text-2xl font-semibold text-foreground tracking-tight">
                {symbol}
              </h2>
              <span className={`font-data text-sm ${changeColor} tabular-nums`}>
                {changePercent > 0 ? '+' : ''}{changePercent?.toFixed(2)}%
              </span>
            </div>
            <p className="text-sm text-muted-foreground mt-0.5 truncate">
              {companyName}
            </p>
          </div>
          <div className="text-right shrink-0">
            <div className="font-data text-2xl font-semibold text-foreground tabular-nums tracking-tight">
              {formatPrice(quote?.price)}
            </div>
            <div className="text-xs text-muted-foreground/70 mt-0.5">
              USD
            </div>
          </div>
        </div>

        {/* Key stats strip */}
        <div className="flex items-center gap-1 mt-4">
          <StatPill label="市值" value={formatMarketCap(quote?.market_cap)} />
          {fundamentals?.valuation?.pe != null && (
            <StatPill label="PE" value={formatRatio(fundamentals.valuation.pe)} />
          )}
          {fundamentals?.profitability?.roe != null && (
            <StatPill label="ROE" value={formatPercent(fundamentals.profitability.roe)} />
          )}
          {fundamentals?.growth?.revenue_yoy != null && (
            <StatPill label="营收增速" value={formatPercent(fundamentals.growth.revenue_yoy)} accent />
          )}
        </div>

        {/* Action buttons */}
        <div className="flex items-center gap-2 mt-4">
          <Link
            href={`/stock/${symbol}`}
            className="flex items-center gap-1.5 px-4 py-2 text-xs font-medium rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 transition-colors cursor-pointer shadow-sm shadow-primary/20"
          >
            <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M2 3h6a4 4 0 014 4v14a3 3 0 00-3-3H2z" strokeLinecap="round" strokeLinejoin="round" />
              <path d="M22 3h-6a4 4 0 00-4 4v14a3 3 0 013-3h7z" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            深度研究
          </Link>
          <button
            onClick={handleAddToWatchlist}
            disabled={isInWatchlist || saveWatchlist.isPending}
            className={`flex items-center gap-1.5 px-4 py-2 text-xs font-medium rounded-lg transition-colors cursor-pointer ${
              isInWatchlist || justAdded
                ? 'bg-primary/10 border border-primary/30 text-primary'
                : 'bg-card/80 border border-border/50 text-foreground hover:border-primary/40 hover:text-primary'
            }`}
          >
            {isInWatchlist || justAdded ? (
              <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <polyline points="20 6 9 17 4 12" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            ) : (
              <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <line x1="12" y1="5" x2="12" y2="19" strokeLinecap="round" />
                <line x1="5" y1="12" x2="19" y2="12" strokeLinecap="round" />
              </svg>
            )}
            {isInWatchlist || justAdded ? '已在持仓' : '加入持仓'}
          </button>
        </div>
      </div>

      {/* Divider */}
      <div className="border-b border-border/30" />

      {/* Fundamental content */}
      <div className="px-5 py-5 space-y-5">
        <FundamentalTab
          fundamentals={fundamentals}
          financials={stockData?.financials}
          analysis={aiAnalysis}
          generating={generateAnalysis.isPending}
          onGenerate={() => generateAnalysis.mutate({})}
        />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

/** Compact stat pill for the header strip */
function StatPill({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs ${
      accent
        ? 'bg-primary/10 border border-primary/20'
        : 'bg-card/80 border border-border/30'
    }`}>
      <span className="text-muted-foreground/60">{label}</span>
      <span className={`font-data tabular-nums ${accent ? 'text-primary' : 'text-foreground'}`}>
        {value}
      </span>
    </div>
  );
}

/** Fundamental tab: key metrics + quarterly + AI analysis */
function FundamentalTab({
  fundamentals,
  financials,
  analysis,
  generating,
  onGenerate,
}: {
  fundamentals: Record<string, Record<string, number | null | undefined>> | null | undefined;
  financials: { quarters?: Array<Record<string, unknown>> } | null | undefined;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  analysis: any;
  generating: boolean;
  onGenerate: () => void;
}) {
  const valuation = fundamentals?.valuation || {};
  const profitability = fundamentals?.profitability || {};
  const growth = fundamentals?.growth || {};
  const balanceSheet = fundamentals?.balance_sheet || {};

  // Color helper: green for good, red for bad, neutral for normal
  function metricColor(val: number | null | undefined, thresholds: { green?: number; red?: number; invert?: boolean }): string | undefined {
    if (val == null || isNaN(val)) return undefined;
    const v = thresholds.invert ? -val : val;
    if (thresholds.green != null && v >= thresholds.green) return 'text-emerald-500 dark:text-emerald-400';
    if (thresholds.red != null && v <= thresholds.red) return 'text-red-500 dark:text-red-400';
    return undefined;
  }

  const metricGroups = [
    {
      title: '估值',
      items: [
        { label: 'P/E', value: formatRatio(valuation.pe as number) },
        { label: 'P/B', value: formatRatio(valuation.pb as number) },
        { label: 'P/S', value: formatRatio(valuation.ps as number) },
        { label: 'EV/EBITDA', value: formatRatio(valuation.ev_to_ebitda as number) },
      ],
    },
    {
      title: '盈利能力',
      items: [
        { label: '毛利率', value: formatPercent(profitability.gross_margin as number), color: metricColor(profitability.gross_margin as number, { green: 0.4, red: 0.1 }) },
        { label: '净利率', value: formatPercent(profitability.net_margin as number), color: metricColor(profitability.net_margin as number, { green: 0.2, red: 0 }) },
        { label: 'ROE', value: formatPercent(profitability.roe as number), color: metricColor(profitability.roe as number, { green: 0.15, red: 0.05 }) },
        { label: 'ROA', value: formatPercent(profitability.roa as number), color: metricColor(profitability.roa as number, { green: 0.1, red: 0.02 }) },
      ],
    },
    {
      title: '增长与健康',
      items: [
        { label: '营收增速', value: formatPercent(growth.revenue_yoy as number), color: metricColor(growth.revenue_yoy as number, { green: 0.1, red: 0 }) },
        { label: '净利增速', value: formatPercent(growth.net_income_yoy as number), color: metricColor(growth.net_income_yoy as number, { green: 0.1, red: 0 }) },
        { label: '负债率', value: formatRatio(balanceSheet.debt_to_equity as number), color: metricColor(balanceSheet.debt_to_equity as number, { red: 100, invert: true }) },
        { label: '流动比', value: formatRatio(balanceSheet.current_ratio as number), color: metricColor(balanceSheet.current_ratio as number, { green: 1.5, red: 1.0 }) },
      ],
    },
  ];

  const analysisSections = analysis ? [
    { label: '公司概况', content: analysis.company_profile },
    { label: '财务健康', content: analysis.financial_health },
    { label: '估值判断', content: analysis.valuation_judgment },
    { label: '催化剂与风险', content: analysis.catalysts_and_risks },
    { label: '投资总结', content: analysis.investment_summary, highlight: true },
  ] : [];

  return (
    <div className="space-y-5">
      {/* Metrics Grid — grouped by category */}
      {metricGroups.map((group) => (
        <div key={group.title}>
          <div className="flex items-center gap-2 mb-2.5">
            <div className="w-1 h-3.5 rounded-full bg-primary/60" />
            <h3 className="text-xs font-medium text-muted-foreground">
              {group.title}
            </h3>
          </div>
          <div className="grid grid-cols-4 gap-px bg-border/20 rounded-lg overflow-hidden">
            {group.items.map((m) => (
              <div key={m.label} className="bg-card/80 px-3 py-2.5 flex flex-col items-center">
                <div className="text-xs text-muted-foreground/60">{m.label}</div>
                <div className={`font-data text-sm mt-1 tabular-nums ${('color' in m && m.color) || 'text-foreground'}`}>{m.value}</div>
              </div>
            ))}
          </div>
        </div>
      ))}

      {/* Quarterly Financials */}
      {financials?.quarters && financials.quarters.length > 0 && (
        <div>
          <div className="flex items-center gap-2 mb-2.5">
            <div className="w-1 h-3.5 rounded-full bg-amber-500/60" />
            <h3 className="text-xs font-medium text-muted-foreground">
              季度财报
            </h3>
          </div>
          <div className="bg-card/50 border border-border/30 rounded-lg overflow-hidden">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-border/30 bg-card/60">
                  <ThCol>季度</ThCol>
                  <ThCol align="right">营收</ThCol>
                  <ThCol align="right">净利润</ThCol>
                  <ThCol align="right">EPS</ThCol>
                </tr>
              </thead>
              <tbody>
                {financials.quarters.slice(0, 4).map((q: Record<string, unknown>, i: number) => {
                  const is = q.income_statement as Record<string, number> | undefined;
                  return (
                    <tr key={i} className="border-b border-border/15 last:border-0 hover:bg-card/40 transition-colors">
                      <td className="py-2 px-3 font-data text-muted-foreground tabular-nums">
                        {q.fiscal_year ? `FY${String(q.fiscal_year).slice(-2)} ` : ''}{(q.fiscal_quarter as string) || (q.period as string) || '-'}
                      </td>
                      <td className="py-2 px-3 text-right font-data text-foreground tabular-nums">
                        {formatMarketCap(is?.revenue)}
                      </td>
                      <td className="py-2 px-3 text-right font-data text-foreground tabular-nums">
                        {formatMarketCap(is?.net_income)}
                      </td>
                      <td className="py-2 px-3 text-right font-data text-foreground tabular-nums">
                        {is?.eps != null ? `$${is.eps.toFixed(2)}` : '-'}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* AI Investment Analysis */}
      <AnalysisSection
        title="AI 投研分析"
        analysis={analysis}
        sections={analysisSections}
        generating={generating}
        onGenerate={onGenerate}
      />
    </div>
  );
}

/** Table header cell */
function ThCol({ children, align = 'left' }: { children: React.ReactNode; align?: 'left' | 'right' }) {
  return (
    <th className={`py-2 px-3 text-muted-foreground/70 font-medium text-${align} text-xs`}>
      {children}
    </th>
  );
}

/** Reusable AI analysis section with Generate button */
function AnalysisSection({
  title,
  subtitle,
  analysis,
  sections,
  generating,
  onGenerate,
}: {
  title: string;
  subtitle?: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  analysis: any;
  sections: { label: string; content?: string; highlight?: boolean }[];
  generating: boolean;
  onGenerate: () => void;
}) {
  if (generating) {
    return (
      <div className="flex flex-col items-center gap-3 py-10">
        <div className="relative w-10 h-10">
          <div className="absolute inset-0 rounded-full border border-primary/20" />
          <div className="absolute inset-0 rounded-full border-t border-primary animate-spin" />
          <svg className="absolute inset-0 m-auto w-4 h-4 text-primary/60" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
            <path d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z" />
          </svg>
        </div>
        <span className="text-xs text-muted-foreground">
          正在生成分析
        </span>
      </div>
    );
  }

  if (!analysis) {
    return (
      <div className="flex flex-col items-center gap-4 py-10">
        <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-primary/10 to-primary/5 border border-primary/20 flex items-center justify-center">
          <svg className="w-6 h-6 text-primary/50" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="1.5">
            <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.455 2.456L21.75 6l-1.036.259a3.375 3.375 0 00-2.455 2.456z" />
          </svg>
        </div>
        <div className="text-center">
          <p className="text-sm text-foreground font-medium">{title}</p>
          {subtitle && <p className="text-xs text-muted-foreground/70 mt-0.5">{subtitle}</p>}
        </div>
        <button
          onClick={onGenerate}
          className="px-5 py-2 text-xs font-medium rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 transition-colors cursor-pointer shadow-sm shadow-primary/20"
        >
          生成分析
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-1 h-3.5 rounded-full bg-primary/60" />
          <h3 className="text-xs font-medium text-muted-foreground">
            {title}
          </h3>
          {subtitle && (
            <span className="text-xs text-muted-foreground/50">{subtitle}</span>
          )}
        </div>
        <button
          onClick={onGenerate}
          className="text-xs text-muted-foreground/50 hover:text-muted-foreground transition-colors cursor-pointer flex items-center gap-1"
        >
          <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" strokeLinecap="round" strokeLinejoin="round" />
            <path d="M3 3v5h5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          重新生成
        </button>
      </div>

      {sections.map((section) => {
        if (!section.content) return null;
        return (
          <div
            key={section.label}
            className={`rounded-lg border p-4 ${
              section.highlight
                ? 'border-amber-500/25 bg-amber-500/5'
                : 'border-border/25 bg-card/40'
            }`}
          >
            <div className="flex items-center gap-1.5 mb-2">
              {section.highlight && (
                <svg className="w-3 h-3 text-amber-500/70" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
                </svg>
              )}
              <h4 className={`text-xs font-medium ${
                section.highlight ? 'text-amber-600 dark:text-amber-400' : 'text-muted-foreground'
              }`}>
                {section.label}
              </h4>
            </div>
            <div className="prose prose-sm prose-neutral dark:prose-invert max-w-none text-sm leading-relaxed [&_strong]:text-foreground">
              <ReactMarkdown>{section.content}</ReactMarkdown>
            </div>
          </div>
        );
      })}
    </div>
  );
}
