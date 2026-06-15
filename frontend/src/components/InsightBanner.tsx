'use client';

import type { ReactNode } from 'react';
import { useState } from 'react';
import MarkdownBody from './MarkdownBody';
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
    border: 'border-emerald-500/30',
    bg: 'bg-emerald-500/[0.03]',
  },
  yellow: {
    dot: 'bg-amber-400',
    border: 'border-amber-400/30',
    bg: 'bg-amber-400/[0.03]',
  },
  red: {
    dot: 'bg-red-500',
    border: 'border-red-500/30',
    bg: 'bg-red-500/[0.03]',
  },
};

const SECTIONS = [
  { key: 'data_changes', label: '当前状况' },
  { key: 'trend_interpretation', label: '近期趋势' },
  { key: 'market_implication', label: '未来展望' },
] as const;

const INSIGHT_MD_COMPONENTS = {
  p: ({ children }: { children?: ReactNode }) => (
    <p className="text-sm text-muted-foreground leading-relaxed mb-2 last:mb-0">
      {children}
    </p>
  ),
  strong: ({ children }: { children?: ReactNode }) => (
    <strong className="font-semibold text-foreground">
      {children}
    </strong>
  ),
  ul: ({ children }: { children?: ReactNode }) => (
    <ul className="list-disc pl-5 space-y-1 my-2">
      {children}
    </ul>
  ),
  ol: ({ children }: { children?: ReactNode }) => (
    <ol className="list-decimal pl-5 space-y-1 my-2">
      {children}
    </ol>
  ),
  li: ({ children }: { children?: ReactNode }) => (
    <li className="text-sm text-muted-foreground leading-relaxed pl-1">
      {children}
    </li>
  ),
  code: ({ children }: { children?: ReactNode }) => (
    <code className="font-data text-primary bg-primary/10 px-1 py-0.5 rounded text-xs">
      {children}
    </code>
  ),
};

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

  // 没有 AI 分析时直接隐藏,避免"暂无数据"破坏用户对数据可信度的观感
  if (!analysis) {
    return null;
  }

  const colors = signalColor ? SIGNAL_STYLES[signalColor] : SIGNAL_STYLES.yellow;

  return (
    <div className={`rounded-xl border ${colors.border} ${colors.bg} transition-all duration-300`}>
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        className="w-full px-5 py-3.5 flex items-center justify-between cursor-pointer"
      >
        <div className="flex items-center gap-2">
          <div className={`w-2 h-2 rounded-full ${colors.dot} shrink-0`} />
          <Sparkles
            className="w-3.5 h-3.5 text-muted-foreground/70"
            strokeWidth={1.5}
          />
          <span className="text-sm font-medium text-foreground">
            {sectionTitle} &middot; AI 解读
          </span>
        </div>
        <div className="flex items-center gap-2">
          {weekLabel && (
            <span className="text-micro font-data text-muted-foreground/70 tracking-wider">
              {weekLabel}
            </span>
          )}
          <ChevronDown
            className={`w-4 h-4 text-muted-foreground/70 transition-transform duration-200 ${
              expanded ? 'rotate-180' : ''
            }`}
            strokeWidth={1.5}
          />
        </div>
      </button>

      <div
        className={`grid transition-all duration-300 ease-out ${
          expanded ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0'
        }`}
      >
        <div className="overflow-hidden">
          <div className="px-5 pb-4 space-y-0">
            {SECTIONS.map((section, i) => {
              const content = analysis[section.key];
              if (!content) return null;
              return (
                <div
                  key={section.key}
                  className={i > 0 ? 'pt-4 mt-4 border-t border-border/30' : ''}
                >
                  <div className="flex items-center gap-2 mb-2.5">
                    <div className="w-0.5 h-3.5 bg-primary/60 rounded-full" />
                    <span className="text-xs font-semibold text-muted-foreground tracking-wide">
                      {section.label}
                    </span>
                  </div>
                  <div className="text-sm text-muted-foreground leading-relaxed">
                    <MarkdownBody components={INSIGHT_MD_COMPONENTS}>
                      {content}
                    </MarkdownBody>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
