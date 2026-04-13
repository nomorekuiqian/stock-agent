'use client';

import { useEffect, useState } from 'react';
import { useInflationRates, useCpiBreakdown } from '@/hooks/queries/use-macro-data';
import type { SubDimension } from '@/lib/api';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface InflationContextPayload {
  type: 'macro_inflation';
  overall_score: number;
  overall_level: string;
  overall_headline: string;
  dimensions: { name_zh: string; score: number; risk_level: string; headline: string }[];
  cpi_components: { name_zh: string; yoy_pct: number | null; mom_pct: number | null }[];
}

interface InflationViewProps {
  onContextReady?: (payload: InflationContextPayload) => void;
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

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function InflationView({ onContextReady }: InflationViewProps) {
  const { data: inflResponse, isLoading: inflLoading, error: inflError } = useInflationRates();
  const { data: cpiResponse } = useCpiBreakdown();

  const inflation = inflResponse?.success ? inflResponse.data : null;
  const cpiComponents = cpiResponse?.success ? cpiResponse.components : null;
  const [selectedDim, setSelectedDim] = useState(0);

  useEffect(() => {
    if (!onContextReady || !inflation) return;
    onContextReady({
      type: 'macro_inflation',
      overall_score: inflation.overall_score,
      overall_level: inflation.overall_level,
      overall_headline: inflation.overall_headline,
      dimensions: inflation.sub_dimensions.map((d) => ({
        name_zh: d.name_zh,
        score: d.score,
        risk_level: d.risk_level,
        headline: d.headline,
      })),
      cpi_components: (cpiComponents || []).map((c) => ({
        name_zh: c.name_zh,
        yoy_pct: c.yoy_pct,
        mom_pct: c.mom_pct,
      })),
    });
  }, [inflation, cpiComponents, onContextReady]);

  if (inflLoading) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-4">
        <div className="relative w-12 h-12">
          <div className="absolute inset-0 rounded-full border border-primary/20" />
          <div className="absolute inset-0 rounded-full border-t border-primary animate-spin" />
        </div>
        <span className="text-xs text-muted-foreground">加载通胀数据</span>
      </div>
    );
  }

  if (inflError || !inflation) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-3 px-6 text-center">
        <p className="text-sm text-muted-foreground">无法加载通胀与利率数据</p>
      </div>
    );
  }

  const dims = inflation.sub_dimensions;
  const activeDim: SubDimension | undefined = dims[selectedDim];

  return (
    <div className="h-full overflow-y-auto">
      <div className="px-5 pt-4 pb-4">
        <span className="text-primary text-xs font-semibold tracking-[0.25em] uppercase">INFLATION & RATES</span>
        <h2 className="text-xl font-editorial text-foreground leading-tight mt-1">通胀与利率</h2>
        <p className="text-sm text-muted-foreground mt-1">CPI、利率、商品信号</p>
      </div>

      <div className="border-b border-border/30" />

      <div className="px-5 py-5 space-y-6">
        {/* Overall */}
        <div className="bg-card rounded-xl border border-border p-4">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-primary/70" />
              <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">综合评估</span>
            </div>
            <div className="flex items-center gap-1.5">
              <div className={`w-2 h-2 rounded-full ${RISK_COLORS[inflation.overall_level] || 'bg-muted'}`} />
              <span className={`text-xs font-medium ${RISK_TEXT_COLORS[inflation.overall_level] || ''}`}>
                {RISK_LABELS[inflation.overall_level] || inflation.overall_level}
              </span>
            </div>
          </div>
          <p className="text-sm text-foreground/90 leading-relaxed">{inflation.overall_headline}</p>
        </div>

        {/* CPI Breakdown */}
        {cpiComponents && cpiComponents.length > 0 && (
          <section className="space-y-3">
            <div className="flex items-center gap-2.5">
              <div className="w-1 h-5 bg-primary rounded-full" />
              <h4 className="text-sm font-semibold text-foreground uppercase tracking-wider">CPI 分项</h4>
            </div>
            <div className="bg-card rounded-xl border border-border/40 overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border/30">
                    <th className="text-left text-[11px] text-muted-foreground font-medium px-4 py-2">分项</th>
                    <th className="text-right text-[11px] text-muted-foreground font-medium px-4 py-2">同比</th>
                    <th className="text-right text-[11px] text-muted-foreground font-medium px-4 py-2">环比</th>
                  </tr>
                </thead>
                <tbody>
                  {cpiComponents.map((c) => (
                    <tr key={c.series_id} className="border-b border-border/10 last:border-0">
                      <td className="px-4 py-2 text-xs text-foreground">{c.name_zh}</td>
                      <td className="px-4 py-2 text-xs text-right tabular-nums text-foreground">
                        {c.yoy_pct != null ? `${c.yoy_pct.toFixed(1)}%` : '--'}
                      </td>
                      <td className="px-4 py-2 text-xs text-right tabular-nums text-foreground">
                        {c.mom_pct != null ? `${c.mom_pct.toFixed(2)}%` : '--'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        )}

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
                风险: {activeDim.score.toFixed(1)}/10
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
