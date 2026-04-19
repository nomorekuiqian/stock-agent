'use client';

import { useEffect, useState } from 'react';
import { useEconomicFundamentals } from '@/hooks/queries/use-macro-data';
import type { SubDimension } from '@/lib/api';
import { DeepDiveSection } from '@/app/macro/economy/components';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface EconomyContextPayload {
  type: 'macro_economy';
  overall_score: number;
  overall_level: string;
  overall_headline: string;
  dimensions: { name_zh: string; score: number; risk_level: string; headline: string }[];
}

interface EconomyViewProps {
  embedded?: boolean;
  onContextReady?: (payload: EconomyContextPayload) => void;
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

const DIM_TABS: { key: string; label: string }[] = [
  { key: 'growth', label: '增长' },
  { key: 'employment', label: '就业' },
  { key: 'credit', label: '信用' },
];

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function EconomyView({ embedded, onContextReady }: EconomyViewProps) {
  const { data: response, isLoading, error } = useEconomicFundamentals();
  const econ = response?.success ? response.data : null;
  const [selectedDim, setSelectedDim] = useState('growth');

  useEffect(() => {
    if (!onContextReady || !econ) return;
    onContextReady({
      type: 'macro_economy',
      overall_score: econ.overall_score,
      overall_level: econ.overall_level,
      overall_headline: econ.overall_headline,
      dimensions: econ.sub_dimensions.map((d) => ({
        name_zh: d.name_zh,
        score: d.score,
        risk_level: d.risk_level,
        headline: d.headline,
      })),
    });
  }, [econ, onContextReady]);

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-4">
        <div className="relative w-12 h-12">
          <div className="absolute inset-0 rounded-full border border-primary/20" />
          <div className="absolute inset-0 rounded-full border-t border-primary animate-spin" />
        </div>
        <span className="text-xs text-muted-foreground">加载经济数据</span>
      </div>
    );
  }

  if (error || !econ) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-3 px-6 text-center">
        <p className="text-sm text-muted-foreground">无法加载经济基本面数据</p>
      </div>
    );
  }

  const activeDim: SubDimension | undefined = econ.sub_dimensions.find((d) => d.name === selectedDim);

  return (
    <div className={embedded ? '' : 'h-full overflow-y-auto'}>
      {!embedded && (
        <>
          <div className="px-5 pt-4 pb-4">
            <span className="text-primary text-xs font-semibold tracking-[0.25em] uppercase">ECONOMY</span>
            <h2 className="text-xl font-editorial text-foreground leading-tight mt-1">经济基本面</h2>
            <p className="text-sm text-muted-foreground mt-1">增长、就业、信用风险</p>
          </div>

          <div className="border-b border-border/30" />
        </>
      )}

      <div className="px-5 py-5 space-y-6">
        {/* Overall Score */}
        <div className="bg-card rounded-xl border border-border p-4">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-primary/70" />
              <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">综合评估</span>
            </div>
            <div className="flex items-center gap-1.5">
              <div className={`w-2 h-2 rounded-full ${RISK_COLORS[econ.overall_level] || 'bg-muted'}`} />
              <span className={`text-xs font-medium ${RISK_TEXT_COLORS[econ.overall_level] || ''}`}>
                {RISK_LABELS[econ.overall_level] || econ.overall_level}
              </span>
            </div>
          </div>
          <p className="text-sm text-foreground leading-relaxed">{econ.overall_headline}</p>
        </div>

        {/* Dimension Tabs */}
        <div className="flex gap-2 overflow-x-auto pb-1">
          {DIM_TABS.map((t) => (
            <button
              key={t.key}
              onClick={() => setSelectedDim(t.key)}
              className={`shrink-0 flex items-center gap-2 rounded-full border px-3 py-1.5 text-sm transition-colors cursor-pointer ${
                selectedDim === t.key
                  ? 'border-primary/40 bg-primary/10 text-foreground'
                  : 'border-border/60 bg-card text-muted-foreground hover:text-foreground'
              }`}
            >
              <div className={`w-2 h-2 rounded-full ${RISK_COLORS[econ.sub_dimensions.find(d => d.name === t.key)?.risk_level ?? ''] || 'bg-muted'}`} />
              {t.label}
            </button>
          ))}
        </div>

        {/* Deep dive section with full charts */}
        {activeDim && (
          <DeepDiveSection dim={activeDim} theme="dark" interval="W" />
        )}
      </div>
    </div>
  );
}
