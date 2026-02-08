'use client';

import { useState } from 'react';
import { SectionAnalysis } from '@/lib/api';
import { Sparkles, ChevronDown } from 'lucide-react';

interface InsightBannerProps {
  sectionTitle: string;
  analysis: SectionAnalysis | null;
  signalColor: 'green' | 'yellow' | 'red' | null;
  weekLabel: string | null;
  loading: boolean;
}

const SIGNAL_STYLES = {
  green: {
    dot: 'bg-emerald-500',
    border: 'border-l-emerald-500',
    bg: 'bg-emerald-500/[0.03]',
  },
  yellow: {
    dot: 'bg-amber-400',
    border: 'border-l-amber-400',
    bg: 'bg-amber-400/[0.03]',
  },
  red: {
    dot: 'bg-red-500',
    border: 'border-l-red-500',
    bg: 'bg-red-500/[0.03]',
  },
};

const SECTIONS = [
  { key: 'data_changes', label: '数据变动' },
  { key: 'trend_interpretation', label: '趋势解读' },
  { key: 'market_implication', label: '市场影响' },
] as const;

export function InsightBanner({
  sectionTitle,
  analysis,
  signalColor,
  weekLabel,
  loading,
}: InsightBannerProps) {
  const [expanded, setExpanded] = useState(true);

  if (loading) {
    return (
      <div className="rounded-xl border border-border/40 bg-muted/20 p-5 animate-pulse">
        <div className="flex items-center gap-2 mb-4">
          <div className="w-2 h-2 rounded-full bg-muted" />
          <div className="h-4 w-32 bg-muted rounded" />
        </div>
        <div className="space-y-3">
          <div className="h-3 w-full bg-muted/60 rounded" />
          <div className="h-3 w-4/5 bg-muted/60 rounded" />
          <div className="h-3 w-3/4 bg-muted/60 rounded" />
        </div>
      </div>
    );
  }

  if (!analysis) {
    return (
      <div className="rounded-xl border border-border/40 border-l-2 border-l-muted-foreground/20 bg-muted/[0.03] px-5 py-3.5">
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-muted-foreground/20 shrink-0" />
          <Sparkles
            className="w-3.5 h-3.5 text-muted-foreground/30"
            strokeWidth={1.5}
          />
          <span className="text-sm text-muted-foreground/40">
            {sectionTitle} &middot; AI 解读
          </span>
          <span className="text-[10px] text-muted-foreground/30 ml-auto">
            暂无数据
          </span>
        </div>
      </div>
    );
  }

  const colors = signalColor ? SIGNAL_STYLES[signalColor] : SIGNAL_STYLES.yellow;

  return (
    <div
      className={`rounded-xl border border-border/40 border-l-2 ${colors.border} ${colors.bg} transition-all duration-300`}
    >
      {/* Header */}
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        className="w-full px-5 py-3.5 flex items-center justify-between cursor-pointer"
      >
        <div className="flex items-center gap-2">
          <div className={`w-2 h-2 rounded-full ${colors.dot} shrink-0`} />
          <Sparkles
            className="w-3.5 h-3.5 text-muted-foreground/50"
            strokeWidth={1.5}
          />
          <span className="text-sm font-medium text-foreground">
            {sectionTitle} &middot; AI 解读
          </span>
        </div>
        <div className="flex items-center gap-2">
          {weekLabel && (
            <span className="text-[10px] font-data text-muted-foreground/50 tracking-wider">
              {weekLabel}
            </span>
          )}
          <ChevronDown
            className={`w-4 h-4 text-muted-foreground/40 transition-transform duration-200 ${
              expanded ? 'rotate-180' : ''
            }`}
            strokeWidth={1.5}
          />
        </div>
      </button>

      {/* Content */}
      <div
        className={`overflow-hidden transition-all duration-300 ease-out ${
          expanded ? 'max-h-[600px] opacity-100' : 'max-h-0 opacity-0'
        }`}
      >
        <div className="px-5 pb-4 space-y-0">
          {SECTIONS.map((section, i) => {
            const content = analysis[section.key];
            if (!content) return null;
            return (
              <div
                key={section.key}
                className={i > 0 ? 'pt-3 mt-3 border-t border-border/20' : ''}
              >
                <p className="text-[10px] font-medium text-muted-foreground/50 uppercase tracking-[0.15em] mb-1.5">
                  {section.label}
                </p>
                <p className="text-sm text-muted-foreground leading-relaxed">
                  {content}
                </p>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
