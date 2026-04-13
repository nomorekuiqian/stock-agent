'use client';

import { useEffect, useState } from 'react';
import { useMarketSentiment } from '@/hooks/queries/use-macro-data';
import type { SubDimension } from '@/lib/api';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface SentimentContextPayload {
  type: 'macro_sentiment';
  overall_score: number;
  overall_level: string;
  overall_headline: string;
  dimensions: { name_zh: string; score: number; risk_level: string; headline: string }[];
}

interface SentimentViewProps {
  onContextReady?: (payload: SentimentContextPayload) => void;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const RISK_COLORS: Record<string, string> = {
  low: 'bg-emerald-500',
  medium: 'bg-amber-400',
  high: 'bg-red-500',
};

const RISK_TEXT_COLORS: Record<string, string> = {
  low: 'text-emerald-500',
  medium: 'text-amber-400',
  high: 'text-red-500',
};

const RISK_LABELS: Record<string, string> = {
  low: '低风险',
  medium: '中等',
  high: '高风险',
};

// Score label for CNN Fear & Greed (0-100 scale, inverted from risk)
function sentimentLabel(score: number): string {
  if (score >= 80) return '极度贪婪';
  if (score >= 60) return '贪婪';
  if (score >= 40) return '中性';
  if (score >= 20) return '恐惧';
  return '极度恐惧';
}

function sentimentColor(score: number): string {
  if (score >= 70) return 'text-emerald-500';
  if (score >= 40) return 'text-amber-400';
  return 'text-red-500';
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function SentimentView({ onContextReady }: SentimentViewProps) {
  const { data: response, isLoading, error } = useMarketSentiment();
  const sentiment = response?.success ? response.data : null;
  const [selectedDim, setSelectedDim] = useState(0);

  useEffect(() => {
    if (!onContextReady || !sentiment) return;
    onContextReady({
      type: 'macro_sentiment',
      overall_score: sentiment.overall_score,
      overall_level: sentiment.overall_level,
      overall_headline: sentiment.overall_headline,
      dimensions: sentiment.sub_dimensions.map((d) => ({
        name_zh: d.name_zh,
        score: d.score,
        risk_level: d.risk_level,
        headline: d.headline,
      })),
    });
  }, [sentiment, onContextReady]);

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-4">
        <div className="relative w-12 h-12">
          <div className="absolute inset-0 rounded-full border border-primary/20" />
          <div className="absolute inset-0 rounded-full border-t border-primary animate-spin" />
        </div>
        <span className="text-xs text-muted-foreground">加载市场情绪数据</span>
      </div>
    );
  }

  if (error || !sentiment) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-3 px-6 text-center">
        <p className="text-sm text-muted-foreground">无法加载市场情绪数据</p>
      </div>
    );
  }

  const dims = sentiment.sub_dimensions;
  const activeDim: SubDimension | undefined = dims[selectedDim];

  return (
    <div className="h-full overflow-y-auto">
      <div className="px-5 pt-4 pb-4">
        <span className="text-primary text-xs font-semibold tracking-[0.25em] uppercase">SENTIMENT</span>
        <h2 className="text-xl font-editorial text-foreground leading-tight mt-1">市场情绪</h2>
        <p className="text-sm text-muted-foreground mt-1">恐惧贪婪指数、波动率</p>
      </div>

      <div className="border-b border-border/30" />

      <div className="px-5 py-5 space-y-6">
        {/* Overall Sentiment Score */}
        <div className="bg-card rounded-xl border border-border p-5">
          <div className="flex items-center gap-2 mb-4">
            <span className="w-1.5 h-1.5 rounded-full bg-primary/70" />
            <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">市场情绪总分</span>
          </div>
          <div className="flex items-end gap-3 mb-3">
            <span className={`text-4xl font-bold tabular-nums ${sentimentColor(sentiment.overall_score)}`}>
              {Math.round(sentiment.overall_score)}
            </span>
            <span className={`text-sm font-medium mb-1 ${sentimentColor(sentiment.overall_score)}`}>
              {sentimentLabel(sentiment.overall_score)}
            </span>
          </div>
          {/* Score bar */}
          <div className="w-full h-2 rounded-full bg-muted/30 overflow-hidden">
            <div
              className="h-full rounded-full transition-all duration-500"
              style={{
                width: `${sentiment.overall_score}%`,
                background: sentiment.overall_score >= 70
                  ? 'rgb(16 185 129)'
                  : sentiment.overall_score >= 40
                  ? 'rgb(251 191 36)'
                  : 'rgb(239 68 68)',
              }}
            />
          </div>
          <div className="flex justify-between mt-1.5">
            <span className="text-[10px] text-red-500/60">极度恐惧</span>
            <span className="text-[10px] text-emerald-500/60">极度贪婪</span>
          </div>
          <p className="text-sm text-foreground/90 leading-relaxed mt-4">{sentiment.overall_headline}</p>
        </div>

        {/* Dimension Tabs */}
        <div className="flex gap-2 overflow-x-auto pb-1">
          {dims.map((dim, i) => (
            <button
              key={dim.name}
              onClick={() => setSelectedDim(i)}
              className={`shrink-0 flex items-center gap-2 rounded-full border px-3 py-1.5 text-sm transition-colors ${
                selectedDim === i
                  ? 'border-primary/40 bg-primary/10 text-foreground'
                  : 'border-border/60 bg-card text-muted-foreground hover:text-foreground'
              }`}
            >
              <div className={`w-2 h-2 rounded-full ${RISK_COLORS[dim.risk_level] || 'bg-muted'}`} />
              {dim.name_zh}
            </button>
          ))}
        </div>

        {/* Active Dimension Detail */}
        {activeDim && (
          <div className="bg-card rounded-xl border border-border/40 p-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold text-foreground">{activeDim.name_zh}</h3>
              <span className={`text-xs font-medium ${RISK_TEXT_COLORS[activeDim.risk_level] || ''}`}>
                {RISK_LABELS[activeDim.risk_level] || activeDim.risk_level}
              </span>
            </div>
            <p className="text-sm text-foreground/90 leading-relaxed mb-4">{activeDim.headline}</p>
            <div className="space-y-2">
              {activeDim.indicators.map((ind) => (
                <div key={ind.series_id} className="flex items-center justify-between py-1.5 border-b border-border/20 last:border-0">
                  <span className="text-xs text-muted-foreground">{ind.name}</span>
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-medium text-foreground tabular-nums">
                      {ind.value != null ? ind.value.toLocaleString() : '--'}
                    </span>
                    {ind.change != null && (
                      <span className={`text-[11px] tabular-nums ${ind.change >= 0 ? 'text-emerald-500' : 'text-red-500'}`}>
                        {ind.change >= 0 ? '+' : ''}{ind.change.toFixed(2)}%
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
