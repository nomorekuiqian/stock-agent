'use client';

import ReactMarkdown from 'react-markdown';
import dynamic from 'next/dynamic';
import { useTechnicalData, type ChartAnnotation } from '@/hooks/queries/use-technical-data';
import { AIPaywall } from './shared';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';

const TechnicalChart = dynamic(
  () => import('@/components/technical/TechnicalChart').then(mod => mod.TechnicalChart),
  { ssr: false, loading: () => <div className="h-[400px] bg-card/30 animate-pulse rounded-xl" /> },
);

// =============================================================================
// Types
// =============================================================================

interface TechnicalSignalDetail {
  name: string;
  value: string;
  definition: string;
  reading: string;
}

interface TechnicalTabProps {
  symbol: string;
  companyName: string;
  // Timeframe
  timeframe: 'daily' | 'weekly';
  onTimeframeChange: (tf: 'daily' | 'weekly') => void;
  // AI Analysis
  technicalAnalysis: {
    title?: string;
    tldr?: string;
    signals?: TechnicalSignalDetail[];
    situation?: string;
    summary?: string;
    chart_annotations?: { type: string; price?: number; date?: string; label: string; direction: string }[];
  } | null;
  technicalLoading: boolean;
  onGenerate: () => void;
  onRegenerate: () => void;
  hasAIAccess?: boolean;
}

// Map situation keywords → color theme for the badge
function getSituationTheme(situation: string): { bg: string; border: string; text: string; dot: string } {
  const s = situation;
  // Bullish continuation / breakout
  if (s.includes('强势上涨') || s.includes('突破') || s.includes('反转向上') || s.includes('底部构筑')) {
    return {
      bg: 'bg-emerald-500/10',
      border: 'border-emerald-500/30',
      text: 'text-emerald-400',
      dot: 'bg-emerald-500',
    };
  }
  // Mildly bullish / oversold bounce
  if (s.includes('温和上涨') || s.includes('超卖反弹')) {
    return {
      bg: 'bg-teal-500/10',
      border: 'border-teal-500/30',
      text: 'text-teal-400',
      dot: 'bg-teal-500',
    };
  }
  // Bearish
  if (s.includes('下跌') || s.includes('反转向下') || s.includes('顶部疲态')) {
    return {
      bg: 'bg-rose-500/10',
      border: 'border-rose-500/30',
      text: 'text-rose-400',
      dot: 'bg-rose-500',
    };
  }
  // Sideways / waiting
  return {
    bg: 'bg-muted/60',
    border: 'border-border/50',
    text: 'text-muted-foreground',
    dot: 'bg-muted-foreground/70',
  };
}

// =============================================================================
// Signal Card — one per indicator. `definition` shown on hover/focus tooltip.
// =============================================================================

function SignalCard({ signal }: { signal: TechnicalSignalDetail }) {
  return (
    <div className="rounded-lg border border-border/40 bg-card/40 overflow-hidden transition-all duration-200 hover:border-border/70 hover:bg-card/60">
      {/* Header: name + info icon (tooltip) + value badge */}
      <div className="px-3.5 py-2.5 border-b border-border/30 bg-card/60 flex items-center justify-between gap-3">
        <div className="flex items-center gap-1 min-w-0">
          <span className="text-sm font-medium text-foreground truncate">{signal.name}</span>
          {signal.definition && (
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  aria-label={`${signal.name} 指标说明`}
                  className="ml-0.5 inline-flex items-center justify-center w-6 h-6 rounded-full text-muted-foreground/70 hover:text-foreground hover:bg-muted/40 transition-colors cursor-help shrink-0
                    focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:outline-none"
                >
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-3 h-3">
                    <circle cx="12" cy="12" r="10" />
                    <line x1="12" y1="16" x2="12" y2="12" />
                    <line x1="12" y1="8" x2="12.01" y2="8" />
                  </svg>
                </button>
              </TooltipTrigger>
              <TooltipContent side="top" className="max-w-[280px] text-xs leading-relaxed">
                {signal.definition}
              </TooltipContent>
            </Tooltip>
          )}
        </div>
        {signal.value && (
          <span className="text-xs font-medium text-emerald-400 bg-emerald-500/10 border border-emerald-500/25 rounded px-2 py-0.5 shrink-0">
            {signal.value}
          </span>
        )}
      </div>
      {/* Body: reading (pure observational — definition is in tooltip, reasoning is in summary) */}
      {signal.reading && (
        <div className="px-3.5 py-3">
          <p className="text-sm leading-relaxed text-muted-foreground">{signal.reading}</p>
        </div>
      )}
    </div>
  );
}

// =============================================================================
// Section Header — shared style for "信号详解" / "详细总结"
// =============================================================================

function SectionHeader({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-2 mb-2.5">
      <div className="w-1 h-4 rounded-full bg-emerald-500/60" />
      <h4 className="text-sm font-medium text-foreground">{label}</h4>
    </div>
  );
}

// =============================================================================
// TechnicalTab Component
// =============================================================================

export function TechnicalTab({
  symbol,
  companyName,
  timeframe,
  onTimeframeChange,
  technicalAnalysis,
  technicalLoading,
  onGenerate,
  onRegenerate,
  hasAIAccess = true,
}: TechnicalTabProps) {
  const { data: technicalChartData, isLoading: chartDataLoading } = useTechnicalData(symbol, timeframe);
  const annotations = (technicalAnalysis?.chart_annotations ?? []) as ChartAnnotation[];

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 items-start">

      {/* ============================================================ */}
      {/* LEFT: AI Technical Analysis                                  */}
      {/* Mobile: second, Desktop: left                                */}
      {/* ============================================================ */}
      <div className="order-2 lg:order-1 lg:sticky lg:top-4">
        <div className="bg-card/50 border border-border/30 rounded-xl overflow-hidden">
          {!hasAIAccess ? (
            <AIPaywall symbol={symbol} label="AI 技术分析" />
          ) : !technicalAnalysis && !technicalLoading ? (
            <div className="p-6 text-center">
              <div className="inline-flex items-center gap-1.5 text-xs uppercase tracking-wider text-emerald-500/70 mb-3">
                <div className="w-4 h-px bg-emerald-500/25" />
                AI 技术分析
                <div className="w-4 h-px bg-emerald-500/25" />
              </div>
              <h3 className="font-editorial text-lg text-foreground mb-2">{symbol} 技术分析</h3>
              <p className="text-sm text-muted-foreground mb-4 leading-relaxed">
                AI 分析 {companyName} 的技术指标、趋势信号、支撑阻力位和图形形态
              </p>
              <button
                onClick={onGenerate}
                className="group inline-flex items-center gap-2 px-5 py-2 bg-emerald-500/10 border border-emerald-500/25 rounded-lg
                  text-sm font-medium text-emerald-400 hover:bg-emerald-500/20 hover:border-emerald-500/40 transition-all cursor-pointer
                  focus-visible:ring-2 focus-visible:ring-emerald-500/40 focus-visible:outline-none"
              >
                <span>生成技术分析</span>
                <svg className="w-3.5 h-3.5 transition-transform group-hover:translate-x-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M17 8l4 4m0 0l-4 4m4-4H3" />
                </svg>
              </button>
            </div>
          ) : technicalLoading ? (
            <div className="p-8 text-center">
              <div className="w-6 h-6 border-2 border-emerald-500/30 border-t-emerald-500 rounded-full animate-spin mx-auto mb-3" />
              <p className="text-sm text-muted-foreground">正在生成 {symbol} 技术分析...</p>
            </div>
          ) : technicalAnalysis ? (
            <>
              <div className="px-4 py-2.5 border-b border-border/20 bg-card/40 flex items-center justify-between">
                <span className="text-sm font-medium text-foreground">AI 技术分析</span>
                <button
                  onClick={onRegenerate}
                  disabled={technicalLoading}
                  aria-label="重新生成分析"
                  className="inline-flex items-center justify-center w-7 h-7 rounded text-muted-foreground hover:text-emerald-400 hover:bg-muted/40 transition-colors cursor-pointer
                    focus-visible:ring-2 focus-visible:ring-emerald-500/40 focus-visible:outline-none disabled:opacity-50"
                  title="重新生成"
                >
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182" />
                  </svg>
                </button>
              </div>
              <div className="px-4 py-4 space-y-5">
                {technicalAnalysis.title && (
                  <h3 className="font-editorial text-base text-foreground leading-snug">
                    {technicalAnalysis.title}
                  </h3>
                )}

                {/* Legacy-format fallback: old cached analyses without the new fields */}
                {!technicalAnalysis.tldr
                  && (!technicalAnalysis.signals || technicalAnalysis.signals.length === 0)
                  && !technicalAnalysis.summary && (
                  <div className="text-center py-6 text-sm text-muted-foreground">
                    此分析为旧版本，点击右上角刷新图标重新生成
                  </div>
                )}

                {/* Section 1: 速览 (TL;DR) — calm, not overstated */}
                {technicalAnalysis.tldr && (
                  <div>
                    <SectionHeader label="速览" />
                    <div className="rounded-lg border border-border/40 bg-card/40 px-3.5 py-3 text-sm text-foreground/90 leading-relaxed prose prose-sm prose-invert max-w-none
                      prose-strong:text-foreground prose-strong:font-semibold
                      prose-p:my-0">
                      <ReactMarkdown>{technicalAnalysis.tldr}</ReactMarkdown>
                    </div>
                  </div>
                )}

                {/* Section 2: 信号详解 — 7 cards, all expanded */}
                {technicalAnalysis.signals && technicalAnalysis.signals.length > 0 && (
                  <div>
                    <SectionHeader label="信号详解" />
                    <div className="space-y-2">
                      {technicalAnalysis.signals.map((signal, i) => (
                        <SignalCard key={`${signal.name}-${i}`} signal={signal} />
                      ))}
                    </div>
                  </div>
                )}

                {/* Section 3: 详细总结 — situation badge + situation-driven reasoning */}
                {technicalAnalysis.summary && (
                  <div>
                    <SectionHeader label="详细总结" />
                    <div className="rounded-lg border border-border/40 bg-card/30 px-3.5 py-3">
                      {/* Situation badge — explicit classification drives the reading */}
                      {technicalAnalysis.situation && (() => {
                        const theme = getSituationTheme(technicalAnalysis.situation);
                        return (
                          <div className="mb-3 pb-3 border-b border-border/30 flex items-center gap-2.5">
                            <span className="text-xs text-muted-foreground">当前情境</span>
                            <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium ${theme.bg} ${theme.border} ${theme.text}`}>
                              <span className={`w-1.5 h-1.5 rounded-full ${theme.dot}`} />
                              {technicalAnalysis.situation}
                            </span>
                          </div>
                        );
                      })()}
                      <div className="text-sm text-muted-foreground leading-relaxed prose prose-sm prose-invert max-w-none
                        prose-strong:text-foreground/85 prose-strong:font-medium
                        prose-p:my-2 prose-p:first:mt-0 prose-p:last:mb-0">
                        <ReactMarkdown>{technicalAnalysis.summary}</ReactMarkdown>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </>
          ) : null}
        </div>
      </div>

      {/* ============================================================ */}
      {/* RIGHT: Chart + Signals                                       */}
      {/* Mobile: first, Desktop: right                                */}
      {/* ============================================================ */}
      <div className="order-1 lg:order-2 space-y-5">

        {/* Timeframe indicator — weekly disabled until we have a reliable
             weekly OHLCV source (FMP only supports daily, yfinance unstable) */}
        <div className="flex items-center gap-3">
          <span className="text-sm text-muted-foreground">周期</span>
          <div className="flex gap-0.5 p-0.5 bg-muted/40 rounded-lg border border-border/30">
            <span className="px-4 py-1.5 text-sm font-medium rounded-md bg-primary/15 text-primary border border-primary/30 shadow-sm">
              日线
            </span>
          </div>
        </div>

        {/* K-Line Chart with AI annotations */}
        {chartDataLoading ? (
          <div className="h-[400px] bg-card/30 animate-pulse rounded-xl" />
        ) : technicalChartData ? (
          <TechnicalChart data={technicalChartData} annotations={annotations} />
        ) : (
          <div className="h-[400px] bg-card/30 rounded-xl flex items-center justify-center">
            <p className="text-sm text-muted-foreground">暂无图表数据</p>
          </div>
        )}
      </div>
    </div>
  );
}
