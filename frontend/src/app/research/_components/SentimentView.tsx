'use client';

import { useEffect, useState } from 'react';
import { useMarketSentiment } from '@/hooks/queries/use-macro-data';
import type { SubDimension } from '@/lib/api';
import {
  DIM_ORDER,
  getRatingZh,
  DeepDiveSection,
} from '@/app/macro/sentiment/components';

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
  embedded?: boolean;
  onContextReady?: (payload: SentimentContextPayload) => void;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function SentimentView({ embedded, onContextReady }: SentimentViewProps) {
  const { data: response, isLoading, error } = useMarketSentiment();
  const sentiment = response?.success ? response.data : null;
  const [selectedDim, setSelectedDim] = useState('cnn_indicators');

  useEffect(() => {
    if (!onContextReady || !sentiment) return;
    onContextReady({
      type: 'macro_sentiment',
      overall_score: sentiment.overall_score,
      overall_level: sentiment.overall_level,
      overall_headline: sentiment.overall_headline,
      dimensions: sentiment.sub_dimensions.map((d) => ({
        name_zh: d.name_zh, score: d.score, risk_level: d.risk_level, headline: d.headline,
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

  const overallScore = sentiment.overall_score;
  const { label: sentimentLabel, color: sentimentColor } = getRatingZh(overallScore);
  const colorClass = sentimentColor === 'emerald' ? 'text-emerald-500' : sentimentColor === 'red' ? 'text-red-500' : 'text-amber-400';
  const barBg = sentimentColor === 'emerald' ? 'rgb(16 185 129)' : sentimentColor === 'red' ? 'rgb(239 68 68)' : 'rgb(251 191 36)';

  const orderedDims = DIM_ORDER
    .map((name) => sentiment.sub_dimensions.find((d) => d.name === name))
    .filter((d): d is SubDimension => d != null);

  const activeDim = orderedDims.find((d) => d.name === selectedDim);

  return (
    <div className={embedded ? '' : 'h-full overflow-y-auto'}>
      {!embedded && (
        <>
          <div className="px-5 pt-4 pb-4">
            <span className="text-primary text-xs font-semibold tracking-[0.25em] uppercase">SENTIMENT</span>
            <h2 className="text-xl font-editorial text-foreground leading-tight mt-1">市场情绪</h2>
            <p className="text-sm text-muted-foreground mt-1">恐惧贪婪指数、波动率</p>
          </div>
          <div className="border-b border-border/30" />
        </>
      )}

      <div className="px-5 py-5 space-y-6">
        {/* Overall Sentiment Score */}
        <div className="bg-card rounded-xl border border-border p-5">
          <div className="flex items-center gap-2 mb-4">
            <span className="w-1.5 h-1.5 rounded-full bg-primary/70" />
            <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">市场情绪总分</span>
          </div>
          <div className="flex items-end gap-3 mb-3">
            <span className={`text-4xl font-bold tabular-nums ${colorClass}`}>{Math.round(overallScore)}</span>
            <span className={`text-sm font-medium mb-1 ${colorClass}`}>{sentimentLabel}</span>
          </div>
          <div className="w-full h-2 rounded-full bg-muted/30 overflow-hidden">
            <div className="h-full rounded-full transition-all duration-500" style={{ width: `${overallScore}%`, background: barBg }} />
          </div>
          <div className="flex justify-between mt-1.5">
            <span className="text-micro text-red-500/60">极度恐惧</span>
            <span className="text-micro text-emerald-500/60">极度贪婪</span>
          </div>
          <p className="text-sm text-foreground leading-relaxed mt-4">{sentiment.overall_headline}</p>
        </div>

        {/* Dimension Tabs */}
        <div className="flex gap-2 overflow-x-auto pb-1">
          {orderedDims.map((dim) => (
            <button
              key={dim.name}
              onClick={() => setSelectedDim(dim.name)}
              className={`shrink-0 flex items-center gap-2 rounded-full border px-3 py-1.5 text-sm transition-colors cursor-pointer ${
                selectedDim === dim.name
                  ? 'border-primary/40 bg-primary/10 text-foreground'
                  : 'border-border/60 bg-card text-muted-foreground hover:text-foreground'
              }`}
            >
              {dim.name === 'cnn_indicators' ? '恐慌贪婪' : '波动率'}
            </button>
          ))}
        </div>

        {/* Deep dive section with full charts */}
        {activeDim && (
          <DeepDiveSection dim={activeDim} theme="dark" interval="W" timeRange="1Y" />
        )}
      </div>
    </div>
  );
}
