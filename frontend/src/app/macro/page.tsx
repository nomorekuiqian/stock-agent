import { Suspense } from 'react';
import type { ReactNode } from 'react';
import type { Metadata } from 'next';
import Link from 'next/link';
import ReactMarkdown from 'react-markdown';
import {
  WeeklyMacroReport,
  SectionAnalysis,
  SignalLights,
} from '@/lib/api';
import { MacroActions } from './_components/MacroActions';
import { AiChatLink } from '@/components/AiChatLink';
import PaywallGuard from '@/components/PaywallGuard';

export const metadata: Metadata = {
  title: '美股宏观周报 - 经济、流动性、通胀与市场情绪',
  description: '每周更新的美股宏观分析报告。涵盖经济基本面、流动性环境、通胀与利率、市场情绪四大维度，AI 解读宏观趋势与投资策略。',
  alternates: {
    canonical: '/macro',
  },
};

// ISR: revalidate every 10 minutes
export const revalidate = 600;

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000/api';

const SIGNAL_LABELS: Record<string, string> = {
  green: '利好',
  yellow: '中性',
  red: '利空',
};

const SIGNAL_COLORS: Record<string, string> = {
  green: 'bg-primary',
  yellow: 'bg-amber-400',
  red: 'bg-red-500',
};

const SIGNAL_TEXT_COLORS: Record<string, string> = {
  green: 'text-primary',
  yellow: 'text-amber-400',
  red: 'text-red-500',
};

const DIMENSION_NAMES: Record<string, string> = {
  liquidity: '流动性',
  economy: '经济',
  inflation: '通胀',
  sentiment: '情绪',
};

interface DimensionLink {
  id: keyof SignalLights;
  nameZh: string;
  question: string;
  href: string;
  analysisKey: 'liquidity_analysis' | 'economy_analysis' | 'inflation_analysis' | 'sentiment_analysis';
}

const DIMENSION_LINKS: DimensionLink[] = [
  { id: 'liquidity', nameZh: '流动性环境', question: '市场上的钱是多了还是少了?', href: '/macro/liquidity', analysisKey: 'liquidity_analysis' },
  { id: 'economy', nameZh: '经济基本面', question: '经济是在变好还是变差?', href: '/macro/economy', analysisKey: 'economy_analysis' },
  { id: 'inflation', nameZh: '通胀与利率', question: '物价压力如何? 美联储会怎么做?', href: '/macro/inflation-rates', analysisKey: 'inflation_analysis' },
  { id: 'sentiment', nameZh: '市场情绪', question: '市场参与者现在是贪婪还是恐惧?', href: '/macro/sentiment', analysisKey: 'sentiment_analysis' },
];

function formatWeekLabel(label: string): string {
  const match = label.match(/^(\d{4})\.W(\d{2})$/);
  if (!match) return label;
  return `${match[1]} 年第 ${parseInt(match[2], 10)} 周`;
}

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
    <section className="space-y-4">
      <SectionHeader title={title} />
      <div className="bg-card rounded-xl border border-border p-5">
        <MacroMarkdown content={content} />
      </div>
    </section>
  );
}

function DimensionNav({ report }: { report: WeeklyMacroReport }) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
      {DIMENSION_LINKS.map((dim) => {
        const signalColor = report.signal_lights[dim.id];
        const dotClass = signalColor ? SIGNAL_COLORS[signalColor] : 'bg-muted';
        const signalLabel = signalColor ? SIGNAL_LABELS[signalColor] : '';
        const signalTextColor = signalColor ? SIGNAL_TEXT_COLORS[signalColor] : '';
        const analysis = report[dim.analysisKey] as SectionAnalysis | undefined;
        const summary = analysis?.summary || null;

        return (
          <Link key={dim.id} href={dim.href} className="group">
            <div className="relative rounded-xl border border-border/40 bg-card/60 p-4 h-full flex flex-col hover:border-primary/40 hover:bg-card transition-all duration-300 cursor-pointer">
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-sm font-semibold text-foreground group-hover:text-primary transition-colors duration-300">
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
              <div className="flex items-center gap-1 mt-3 pt-2.5 border-t border-border/30">
                <span className="text-xs font-medium text-primary/70 group-hover:text-primary transition-colors duration-300">
                  查看详情
                </span>
                <svg className="w-3.5 h-3.5 text-primary/70 group-hover:text-primary group-hover:translate-x-0.5 transition-all duration-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </div>
            </div>
          </Link>
        );
      })}
    </div>
  );
}

// Weekly report lives in backend API (not Insforge), so we use raw fetch with ISR caching.
async function fetchWeeklyReport(): Promise<WeeklyMacroReport | null> {
  try {
    const response = await fetch(`${API_BASE_URL}/weekly-report`, {
      next: { revalidate: 600 },
    });
    if (!response.ok) return null;
    const result = await response.json();
    return result.success ? result.data : null;
  } catch {
    return null;
  }
}

export default function MacroPage() {
  return (
    <PaywallGuard>
    <main className="min-h-screen bg-background">
      {/* Header — static shell, renders immediately without waiting for data */}
      <section className="border-b border-border/50">
        <div className="max-w-4xl mx-auto px-4 md:px-6 py-8 md:py-12">
          <div className="flex items-center gap-3 mb-3 animate-fade-in-up">
            <div className="h-px flex-1 max-w-[60px] bg-gradient-to-r from-primary to-transparent animate-line-expand" />
            <span className="text-primary text-xs font-semibold tracking-[0.25em] uppercase">Macro Weekly</span>
          </div>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
            <h1 className="font-editorial text-3xl md:text-5xl text-foreground tracking-tight leading-[1.1] animate-fade-in-up delay-100">
              宏观周报
            </h1>
            <div className="flex items-center gap-2 sm:gap-3 shrink-0 animate-fade-in-up delay-200">
              <AiChatLink href="/research?context=macro" />
              <MacroActions />
            </div>
          </div>
        </div>
      </section>

      {/* Report body — streams in after header */}
      <div className="max-w-4xl mx-auto px-4 md:px-6 py-8 space-y-10">
        <Suspense fallback={<MacroReportSkeleton />}>
          <MacroReportContent />
        </Suspense>
      </div>
    </main>
    </PaywallGuard>
  );
}

function MacroReportSkeleton() {
  return (
    <div className="space-y-10 animate-pulse">
      {/* Verdict skeleton */}
      <div className="rounded-xl bg-card border border-border p-5 space-y-3">
        <div className="h-3 w-20 bg-muted rounded" />
        <div className="h-4 w-full bg-muted rounded" />
        <div className="h-4 w-3/4 bg-muted rounded" />
      </div>
      {/* Signal lights skeleton */}
      <div className="flex flex-wrap gap-2.5">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="h-8 w-24 rounded-full bg-muted" />
        ))}
      </div>
      {/* Dimension nav skeleton */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="h-32 rounded-xl bg-card border border-border" />
        ))}
      </div>
      {/* Narrative sections skeleton */}
      {[0, 1, 2].map((i) => (
        <div key={i} className="space-y-3">
          <div className="h-3 w-16 bg-muted rounded" />
          <div className="rounded-xl bg-card border border-border p-5 space-y-2">
            <div className="h-4 w-full bg-muted rounded" />
            <div className="h-4 w-5/6 bg-muted rounded" />
            <div className="h-4 w-4/5 bg-muted rounded" />
          </div>
        </div>
      ))}
    </div>
  );
}

async function MacroReportContent() {
  const report = await fetchWeeklyReport();

  if (!report) {
    return (
      <div className="rounded-xl bg-card border border-border p-8 text-center">
        <p className="text-muted-foreground">暂无周报数据</p>
      </div>
    );
  }

  return (
    <>
      {/* Week label + date subtitle */}
      <p className="text-muted-foreground text-sm -mt-6">
        {formatWeekLabel(report.week_label)} &middot; {new Date(report.generated_at).toLocaleDateString('zh-CN')}
      </p>

      {/* LAYER 1: Verdict + Signal Lights */}
      <section className="space-y-5">
        {report.verdict && (
          <div className="bg-card rounded-xl border border-border p-5">
            <div className="flex items-center gap-2 mb-3">
              <span className="w-1.5 h-1.5 rounded-full bg-primary/70" />
              <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                核心判断
              </span>
            </div>
            <p className="text-base text-foreground/90 leading-relaxed">
              {report.verdict}
            </p>
          </div>
        )}

        <div className="flex flex-wrap gap-2.5">
          {(Object.entries(report.signal_lights) as [keyof SignalLights, string][]).map(([key, color]) => (
            <div key={key} className="flex items-center gap-2 rounded-full bg-card border border-border/60 px-3.5 py-1.5">
              <div className={`w-2 h-2 rounded-full ${SIGNAL_COLORS[color] || 'bg-muted'}`} />
              <span className="text-sm text-foreground">{DIMENSION_NAMES[key]}</span>
              <span className={`text-xs font-medium ${SIGNAL_TEXT_COLORS[color] || 'text-muted-foreground'}`}>
                {SIGNAL_LABELS[color] || color}
              </span>
            </div>
          ))}
        </div>
      </section>

      {/* Dimension Navigation */}
      <section className="space-y-4">
        <div className="flex items-center gap-2.5">
          <div className="w-1 h-5 bg-primary rounded-full" />
          <h4 className="text-sm font-semibold text-foreground uppercase tracking-wider">四维分析</h4>
          <span className="text-xs text-muted-foreground/60 ml-1">点击查看详情</span>
        </div>
        <DimensionNav report={report} />
      </section>

      <NarrativeSection title="宏观格局" content={report.landscape} />
      <NarrativeSection title="本周回顾" content={report.narrative} />
      <NarrativeSection title="策略启示" content={report.takeaway} />

      {report.week_ahead && report.week_ahead.length > 0 && (
        <section className="space-y-4">
          <SectionHeader title="下周关注" />
          <div className="bg-card rounded-xl border border-border overflow-hidden">
            <div className="hidden md:grid grid-cols-[100px_1fr_1fr_1fr] gap-4 px-5 py-3 border-b border-border bg-muted/30">
              <span className="font-data text-xs text-muted-foreground uppercase tracking-wider">日期</span>
              <span className="font-data text-xs text-muted-foreground uppercase tracking-wider">事件</span>
              <span className="font-data text-xs text-muted-foreground uppercase tracking-wider">高于预期</span>
              <span className="font-data text-xs text-muted-foreground uppercase tracking-wider">低于预期</span>
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
                    <div>
                      <span className="text-primary/70 mr-1">高于预期:</span>
                      {event.if_above}
                    </div>
                    <div>
                      <span className="text-red-500/70 mr-1">低于预期:</span>
                      {event.if_below}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}
    </>
  );
}
