'use client';

import { useEffect } from 'react';
import type { ReactNode } from 'react';
import ReactMarkdown from 'react-markdown';
import type { SignalLights, SectionAnalysis } from '@/lib/api';
import { useWeeklyReport } from '@/hooks/queries/use-weekly-report';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Data payload passed to parent for Agent context injection. */
export interface MacroContextPayload {
  type: 'macro';
  week_label: string | null;
  verdict: string | null;
  signal_lights: { liquidity: string; economy: string; inflation: string; sentiment: string } | null;
  landscape: string | null;
  narrative: string | null;
  takeaway: string | null;
}

interface MacroOverviewProps {
  onContextReady?: (payload: MacroContextPayload) => void;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const SIGNAL_LABELS: Record<string, string> = {
  green: '利好',
  yellow: '中性',
  red: '利空',
};

const SIGNAL_COLORS: Record<string, string> = {
  green: 'bg-emerald-500',
  yellow: 'bg-amber-400',
  red: 'bg-red-500',
};

const SIGNAL_TEXT_COLORS: Record<string, string> = {
  green: 'text-emerald-500',
  yellow: 'text-amber-400',
  red: 'text-red-500',
};

const DIMENSION_NAMES: Record<string, string> = {
  liquidity: '流动性',
  economy: '经济',
  inflation: '通胀',
  sentiment: '情绪',
};

interface DimensionInfo {
  id: keyof SignalLights;
  nameZh: string;
  question: string;
  analysisKey: 'liquidity_analysis' | 'economy_analysis' | 'inflation_analysis' | 'sentiment_analysis';
}

const DIMENSIONS: DimensionInfo[] = [
  { id: 'liquidity', nameZh: '流动性环境', question: '市场上的钱是多了还是少了?', analysisKey: 'liquidity_analysis' },
  { id: 'economy', nameZh: '经济基本面', question: '经济是在变好还是变差?', analysisKey: 'economy_analysis' },
  { id: 'inflation', nameZh: '通胀与利率', question: '物价压力如何? 美联储会怎么做?', analysisKey: 'inflation_analysis' },
  { id: 'sentiment', nameZh: '市场情绪', question: '市场参与者现在是贪婪还是恐惧?', analysisKey: 'sentiment_analysis' },
];

// ---------------------------------------------------------------------------
// Markdown components (matching /macro/page.tsx style)
// ---------------------------------------------------------------------------

const MACRO_MD_COMPONENTS = {
  h3: ({ children }: { children?: ReactNode }) => (
    <h3 className="text-sm font-semibold text-foreground uppercase tracking-wider mt-6 mb-2 first:mt-0 flex items-center gap-2">
      <span className="w-1 h-4 bg-primary/60 rounded-full shrink-0" />
      {children}
    </h3>
  ),
  p: ({ children }: { children?: ReactNode }) => (
    <p className="text-foreground/90 leading-relaxed mb-3 last:mb-0">{children}</p>
  ),
  strong: ({ children }: { children?: ReactNode }) => (
    <strong className="font-semibold text-foreground">{children}</strong>
  ),
  ul: ({ children }: { children?: ReactNode }) => (
    <ul className="pl-4 space-y-1.5 my-2 border-l-2 border-border/30">{children}</ul>
  ),
  ol: ({ children }: { children?: ReactNode }) => (
    <ol className="list-decimal pl-5 space-y-1.5 my-2">{children}</ol>
  ),
  li: ({ children }: { children?: ReactNode }) => (
    <li className="text-foreground/80 leading-relaxed pl-1">{children}</li>
  ),
  code: ({ children }: { children?: ReactNode }) => (
    <code className="font-data text-primary bg-primary/10 px-1 py-0.5 rounded text-sm">{children}</code>
  ),
};

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function MacroMarkdown({ content }: { content: string }) {
  return (
    <ReactMarkdown components={MACRO_MD_COMPONENTS}>
      {content}
    </ReactMarkdown>
  );
}

function SectionHeader({ title }: { title: string }) {
  return (
    <div className="flex items-center gap-2.5">
      <div className="w-1 h-5 bg-primary rounded-full" />
      <h4 className="text-sm font-semibold text-foreground uppercase tracking-wider">{title}</h4>
    </div>
  );
}

function NarrativeSection({ title, content }: { title: string; content: string | undefined }) {
  if (!content) return null;
  return (
    <section className="space-y-3">
      <SectionHeader title={title} />
      <div className="bg-card rounded-xl border border-border p-4">
        <MacroMarkdown content={content} />
      </div>
    </section>
  );
}

function formatWeekLabel(label: string): string {
  const match = label.match(/^(\d{4})\.W(\d{2})$/);
  if (!match) return label;
  return `${match[1]} 年第 ${parseInt(match[2], 10)} 周`;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function MacroOverview({ onContextReady }: MacroOverviewProps) {
  const { data: response, isLoading, error } = useWeeklyReport();
  const report = response?.success ? response.data : null;

  // Push context to parent when data is ready
  useEffect(() => {
    if (!onContextReady || !report) return;

    onContextReady({
      type: 'macro',
      week_label: report.week_label ?? null,
      verdict: report.verdict ?? null,
      signal_lights: report.signal_lights ?? null,
      landscape: report.landscape ?? null,
      narrative: report.narrative ?? null,
      takeaway: report.takeaway ?? null,
    });
  }, [report, onContextReady]);

  // Loading state
  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-4">
        <div className="relative w-12 h-12">
          <div className="absolute inset-0 rounded-full border border-primary/20" />
          <div className="absolute inset-0 rounded-full border-t border-primary animate-spin" />
          <svg
            className="absolute inset-0 m-auto w-5 h-5 text-primary/60"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
            strokeWidth="1.5"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M3.75 3v11.25A2.25 2.25 0 006 16.5h2.25M3.75 3h-1.5m1.5 0h16.5m0 0h1.5m-1.5 0v11.25A2.25 2.25 0 0118 16.5h-2.25m-7.5 0h7.5m-7.5 0l-1 3m8.5-3l1 3m0 0l.5 1.5m-.5-1.5h-9.5m0 0l-.5 1.5"
            />
          </svg>
        </div>
        <span className="text-xs text-muted-foreground">
          加载宏观数据
        </span>
      </div>
    );
  }

  // Error / empty state
  if (error || !report) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-3 px-6 text-center">
        <div className="w-10 h-10 rounded-full bg-red-500/10 flex items-center justify-center">
          <svg className="w-5 h-5 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={1.5}
              d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z"
            />
          </svg>
        </div>
        <p className="text-sm text-muted-foreground">
          无法加载宏观周报数据
        </p>
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto">
      {/* Header */}
      <div className="px-5 pt-4 pb-4">
        <div className="flex items-center gap-2 mb-3">
          <span className="text-primary text-xs font-semibold tracking-[0.25em] uppercase">MACRO WEEKLY</span>
        </div>
        <h2 className="text-xl font-editorial text-foreground leading-tight">
          {report.title || '宏观周报'}
        </h2>
        <p className="text-sm text-muted-foreground mt-1">
          {formatWeekLabel(report.week_label)} &middot; {report.generated_at ? new Date(report.generated_at).toLocaleDateString('zh-CN') : ''}
        </p>
      </div>

      {/* Divider */}
      <div className="border-b border-border/30" />

      {/* Content */}
      <div className="px-5 py-5 space-y-6">
        {/* Verdict */}
        {report.verdict && (
          <div className="bg-card rounded-xl border border-border p-4">
            <div className="flex items-center gap-2 mb-2.5">
              <span className="w-1.5 h-1.5 rounded-full bg-primary/70" />
              <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                核心判断
              </span>
            </div>
            <p className="text-sm text-foreground/90 leading-relaxed">
              {report.verdict}
            </p>
          </div>
        )}

        {/* Signal Lights */}
        {report.signal_lights && (
          <div className="flex flex-wrap gap-2">
            {(Object.entries(report.signal_lights) as [keyof SignalLights, string][]).map(([key, color]) => (
              <div key={key} className="flex items-center gap-2 rounded-full bg-card border border-border/60 px-3 py-1.5">
                <div className={`w-2 h-2 rounded-full ${SIGNAL_COLORS[color] || 'bg-muted'}`} />
                <span className="text-sm text-foreground">{DIMENSION_NAMES[key]}</span>
                <span className={`text-xs font-medium ${SIGNAL_TEXT_COLORS[color] || 'text-muted-foreground'}`}>
                  {SIGNAL_LABELS[color] || color}
                </span>
              </div>
            ))}
          </div>
        )}

        {/* Dimension Cards */}
        <section className="space-y-3">
          <div className="flex items-center gap-2.5">
            <div className="w-1 h-5 bg-primary rounded-full" />
            <h4 className="text-sm font-semibold text-foreground uppercase tracking-wider">四维分析</h4>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {DIMENSIONS.map((dim) => {
              const signalColor = report.signal_lights?.[dim.id];
              const dotClass = signalColor ? SIGNAL_COLORS[signalColor] : 'bg-muted';
              const signalLabel = signalColor ? SIGNAL_LABELS[signalColor] : '';
              const signalTextColor = signalColor ? SIGNAL_TEXT_COLORS[signalColor] : '';
              const analysis = report[dim.analysisKey] as SectionAnalysis | undefined;
              const summary = analysis?.summary || null;

              return (
                <div
                  key={dim.id}
                  className="relative rounded-xl border border-border/40 bg-card/60 p-4 flex flex-col"
                >
                  <div className="flex items-center justify-between mb-2">
                    <h3 className="text-sm font-semibold text-foreground">
                      {dim.nameZh}
                    </h3>
                    <div className="flex items-center gap-1.5">
                      <div className={`w-2 h-2 rounded-full ${dotClass}`} />
                      {signalLabel && (
                        <span className={`text-[11px] font-medium ${signalTextColor}`}>{signalLabel}</span>
                      )}
                    </div>
                  </div>
                  <p className={`text-xs leading-relaxed line-clamp-2 flex-1 ${summary ? 'text-muted-foreground' : 'text-muted-foreground/50'}`}>
                    {summary || dim.question}
                  </p>
                </div>
              );
            })}
          </div>
        </section>

        {/* Narratives */}
        <NarrativeSection title="宏观格局" content={report.landscape} />
        <NarrativeSection title="本周回顾" content={report.narrative} />
        <NarrativeSection title="策略启示" content={report.takeaway} />
      </div>
    </div>
  );
}
