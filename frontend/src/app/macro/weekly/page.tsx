'use client';

import type { ReactNode } from 'react';
import Link from 'next/link';
import ReactMarkdown from 'react-markdown';
import { useWeeklyReport } from '@/hooks/queries/use-weekly-report';
import type { SectionAnalysis } from '@/lib/api';
import { MacroPageHeader } from '@/components/MacroPageHeader';
import { InsightBanner } from '@/components/InsightBanner';

// ── Signal config ────────────────────────────────────────────────────────────

const SIGNAL_LABELS: Record<string, string> = {
  green: '利好',
  yellow: '中性',
  red: '利空',
};

const SIGNAL_DOT_COLORS: Record<string, string> = {
  green: 'bg-primary',
  yellow: 'bg-amber-400',
  red: 'bg-red-400',
};

const SIGNAL_TEXT_COLORS: Record<string, string> = {
  green: 'text-primary',
  yellow: 'text-amber-400',
  red: 'text-red-400',
};

interface DimensionConfig {
  id: 'liquidity' | 'economy' | 'inflation' | 'sentiment';
  nameZh: string;
  analysisKey: 'liquidity_analysis' | 'economy_analysis' | 'inflation_analysis' | 'sentiment_analysis';
}

const DIMENSIONS: DimensionConfig[] = [
  { id: 'liquidity', nameZh: '流动性环境', analysisKey: 'liquidity_analysis' },
  { id: 'economy', nameZh: '经济基本面', analysisKey: 'economy_analysis' },
  { id: 'inflation', nameZh: '通胀与利率', analysisKey: 'inflation_analysis' },
  { id: 'sentiment', nameZh: '市场情绪', analysisKey: 'sentiment_analysis' },
];

// ── Markdown rendering ───────────────────────────────────────────────────────

const MACRO_MD_COMPONENTS = {
  h3: ({ children }: { children?: ReactNode }) => (
    <h3 className="text-sm font-semibold text-foreground uppercase tracking-wider mt-6 mb-2 first:mt-0 flex items-center gap-2">
      <span className="w-1 h-4 bg-primary/60 rounded-full shrink-0" />
      {children}
    </h3>
  ),
  p: ({ children }: { children?: ReactNode }) => (
    <p className="text-foreground leading-relaxed mb-3 last:mb-0">{children}</p>
  ),
  strong: ({ children }: { children?: ReactNode }) => (
    <strong className="font-semibold text-foreground">{children}</strong>
  ),
  ul: ({ children }: { children?: ReactNode }) => (
    <ul className="list-disc space-y-1.5 my-2 pl-5">{children}</ul>
  ),
  ol: ({ children }: { children?: ReactNode }) => (
    <ol className="list-decimal pl-5 space-y-1.5 my-2">{children}</ol>
  ),
  li: ({ children }: { children?: ReactNode }) => (
    <li className="text-muted-foreground leading-relaxed pl-1">{children}</li>
  ),
  code: ({ children }: { children?: ReactNode }) => (
    <code className="font-data text-primary bg-primary/10 px-1 py-0.5 rounded text-sm">{children}</code>
  ),
};

function MacroMarkdown({ content }: { content: string }) {
  return <ReactMarkdown components={MACRO_MD_COMPONENTS}>{content}</ReactMarkdown>;
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
    <section className="space-y-4">
      <SectionHeader title={title} />
      <div className="bg-card rounded-xl border border-border p-5">
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

// ── Skeleton ─────────────────────────────────────────────────────────────────

function WeeklySkeleton() {
  return (
    <div className="space-y-8 animate-pulse">
      <div className="rounded-xl bg-card border border-border p-5 space-y-3">
        <div className="h-3 w-20 bg-muted rounded" />
        <div className="h-4 w-full bg-muted rounded" />
        <div className="h-4 w-3/4 bg-muted rounded" />
      </div>
      {[0, 1, 2].map((i) => (
        <div key={i} className="space-y-3">
          <div className="h-4 w-24 bg-muted rounded" />
          <div className="rounded-xl bg-card border border-border p-5 space-y-2">
            <div className="h-3 w-full bg-muted rounded" />
            <div className="h-3 w-5/6 bg-muted rounded" />
            <div className="h-3 w-4/6 bg-muted rounded" />
          </div>
        </div>
      ))}
    </div>
  );
}

// ── Page ─────────────────────────────────────────────────────────────────────

export default function WeeklyReportPage() {
  const { data: weeklyResponse, isLoading } = useWeeklyReport();
  const report = weeklyResponse?.success ? weeklyResponse.data : null;

  return (
    <main className="min-h-screen bg-background">
      <MacroPageHeader
        section="Weekly"
        title="宏观周报"
        question="本周宏观环境有什么变化? 下周关注什么?"
        lastUpdated={report?.generated_at ? new Date(report.generated_at).toLocaleDateString('zh-CN') : null}
        loading={isLoading}
      />

      <div className="max-w-4xl mx-auto px-4 md:px-6 py-8 space-y-10">
        {isLoading && <WeeklySkeleton />}

        {!isLoading && !report && (
          <div className="rounded-xl bg-card border border-border p-8 text-center">
            <p className="text-muted-foreground">暂无周报数据</p>
          </div>
        )}

        {report && (
          <>
            {/* Week label */}
            <div className="flex items-center gap-3">
              <div className="h-px flex-1 bg-border/40" />
              <span className="shrink-0 text-xs uppercase tracking-wider text-muted-foreground">
                周报 &middot; {formatWeekLabel(report.week_label)}
              </span>
              <div className="h-px flex-1 bg-border/40" />
            </div>

            {/* Signal lights summary */}
            <div className="flex items-center justify-center gap-6">
              {DIMENSIONS.map((dim) => {
                const color = report.signal_lights[dim.id];
                return (
                  <div key={dim.id} className="flex items-center gap-1.5">
                    <span className={`w-2 h-2 rounded-full ${SIGNAL_DOT_COLORS[color]}`} />
                    <span className="text-xs text-muted-foreground">{dim.nameZh}</span>
                    <span className={`text-xs font-medium ${SIGNAL_TEXT_COLORS[color]}`}>
                      {SIGNAL_LABELS[color]}
                    </span>
                  </div>
                );
              })}
            </div>

            {/* Verdict */}
            {report.verdict && (
              <div className="bg-card rounded-xl border border-border p-5">
                <div className="flex items-center gap-2 mb-3">
                  <span className="w-1.5 h-1.5 rounded-full bg-primary/70" />
                  <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">核心判断</span>
                </div>
                <p className="text-base text-foreground leading-relaxed">{report.verdict}</p>
              </div>
            )}

            {/* Narrative sections */}
            <NarrativeSection title="宏观格局" content={report.landscape} />
            <NarrativeSection title="本周回顾" content={report.narrative} />
            <NarrativeSection title="策略启示" content={report.takeaway} />

            {/* Dimension analyses */}
            {DIMENSIONS.map((dim) => {
              const analysis = report[dim.analysisKey] as SectionAnalysis | undefined;
              const signalColor = report.signal_lights[dim.id];
              return (
                <InsightBanner
                  key={dim.id}
                  sectionTitle={dim.nameZh}
                  analysis={analysis ?? null}
                  signalColor={signalColor}
                  weekLabel={report.week_label}
                  loading={false}
                />
              );
            })}

            {/* Week ahead */}
            {report.week_ahead && report.week_ahead.length > 0 && (
              <section className="space-y-4">
                <SectionHeader title="下周关注" />
                <div className="bg-card rounded-xl border border-border overflow-hidden">
                  <div className="hidden md:grid grid-cols-[100px_1fr_1fr_1fr] gap-4 px-5 py-3 border-b border-border bg-muted/30">
                    <span className="text-xs font-medium text-muted-foreground">日期</span>
                    <span className="text-xs font-medium text-muted-foreground">事件</span>
                    <span className="text-xs font-medium text-muted-foreground">高于预期</span>
                    <span className="text-xs font-medium text-muted-foreground">低于预期</span>
                  </div>
                  {report.week_ahead.map((event, i) => (
                    <div key={i} className={`px-5 py-4 ${i < report.week_ahead.length - 1 ? 'border-b border-border/50' : ''}`}>
                      <div className="hidden md:grid grid-cols-[100px_1fr_1fr_1fr] gap-4 items-start">
                        <span className="font-data text-sm text-primary">{event.date}</span>
                        <span className="text-sm text-foreground font-medium">{event.event}</span>
                        <span className="text-sm text-muted-foreground">{event.if_above}</span>
                        <span className="text-sm text-muted-foreground">{event.if_below}</span>
                      </div>
                      <div className="md:hidden space-y-2">
                        <div className="flex items-center gap-2">
                          <span className="font-data text-sm text-primary">{event.date}</span>
                          <span className="text-sm text-foreground font-medium">{event.event}</span>
                        </div>
                        <div className="grid grid-cols-2 gap-3 text-xs text-muted-foreground">
                          <div><span className="text-primary/70 mr-1">高于预期:</span>{event.if_above}</div>
                          <div><span className="text-red-500/70 mr-1">低于预期:</span>{event.if_below}</div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            )}

            {/* Back link */}
            <section className="text-center py-4">
              <Link
                href="/macro"
                className="group inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-primary transition-colors duration-200"
              >
                <svg className="w-4 h-4 transition-transform duration-200 group-hover:-translate-x-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 19l-7-7 7-7" />
                </svg>
                返回宏观仪表盘
              </Link>
            </section>
          </>
        )}
      </div>
    </main>
  );
}
