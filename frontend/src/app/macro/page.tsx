'use client';

import type { ReactNode } from 'react';
import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import ReactMarkdown from 'react-markdown';
import {
  api,
  WeeklyMacroReport,
  SectionAnalysis,
  SignalLights,
} from '@/lib/api';
import { getCurrentUser, User } from '@/lib/auth';


const SIGNAL_LABELS: Record<string, string> = {
  green: '利好',
  yellow: '中性',
  red: '利空',
};

const SIGNAL_COLORS: Record<string, string> = {
  green: 'bg-emerald-500',
  yellow: 'bg-amber-400',
  red: 'bg-rose-500',
};

const SIGNAL_TEXT_COLORS: Record<string, string> = {
  green: 'text-emerald-500',
  yellow: 'text-amber-400',
  red: 'text-rose-500',
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
  // "2025.W06" -> "2025 年第 6 周"
  const match = label.match(/^(\d{4})\.W(\d{2})$/);
  if (!match) return label;
  return `${match[1]} 年第 ${parseInt(match[2], 10)} 周`;
}

const MACRO_MD_COMPONENTS = {
  h3: ({ children }: { children?: ReactNode }) => (
    <h3 className="text-sm font-semibold text-foreground uppercase tracking-wider mt-6 mb-2 first:mt-0 flex items-center gap-2">
      <span className="w-1 h-4 bg-emerald-500/60 rounded-full shrink-0" />
      {children}
    </h3>
  ),
  p: ({ children }: { children?: ReactNode }) => (
    <p className="text-foreground/90 leading-relaxed mb-3 last:mb-0">
      {children}
    </p>
  ),
  strong: ({ children }: { children?: ReactNode }) => (
    <strong className="font-semibold text-foreground">
      {children}
    </strong>
  ),
  ul: ({ children }: { children?: ReactNode }) => (
    <ul className="pl-4 space-y-1.5 my-2 border-l-2 border-border/30">
      {children}
    </ul>
  ),
  ol: ({ children }: { children?: ReactNode }) => (
    <ol className="list-decimal pl-5 space-y-1.5 my-2">
      {children}
    </ol>
  ),
  li: ({ children }: { children?: ReactNode }) => (
    <li className="text-foreground/80 leading-relaxed pl-1">
      {children}
    </li>
  ),
  code: ({ children }: { children?: ReactNode }) => (
    <code className="font-data text-emerald-400 bg-emerald-500/10 px-1 py-0.5 rounded text-sm">
      {children}
    </code>
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
      <div className="w-1 h-5 bg-emerald-500 rounded-full" />
      <h4 className="text-sm font-semibold text-foreground uppercase tracking-wider">{title}</h4>
    </div>
  );
}

function DimensionNav({
  report,
}: {
  report: WeeklyMacroReport;
}) {
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
            <div className="relative rounded-xl border border-border/40 bg-card/60 p-4 h-full flex flex-col hover:border-emerald-500/40 hover:bg-card transition-all duration-300 cursor-pointer">
              {/* Top: name + signal */}
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-sm font-semibold text-foreground group-hover:text-emerald-400 transition-colors duration-300">
                  {dim.nameZh}
                </h3>
                <div className="flex items-center gap-1.5">
                  <div className={`w-2 h-2 rounded-full ${dotClass}`} />
                  {signalLabel && (
                    <span className={`text-[11px] font-medium ${signalTextColor}`}>{signalLabel}</span>
                  )}
                </div>
              </div>

              {/* Summary or fallback question */}
              <p className={`text-xs leading-relaxed line-clamp-2 flex-1 ${summary ? 'text-muted-foreground' : 'text-muted-foreground/50'}`}>
                {summary || dim.question}
              </p>

              {/* Bottom: CTA */}
              <div className="flex items-center gap-1 mt-3 pt-2.5 border-t border-border/30">
                <span className="text-xs font-medium text-emerald-500/70 group-hover:text-emerald-400 transition-colors duration-300">
                  查看详情
                </span>
                <svg className="w-3.5 h-3.5 text-emerald-500/70 group-hover:text-emerald-400 group-hover:translate-x-0.5 transition-all duration-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
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

function ReportSkeleton() {
  return (
    <div className="space-y-8 animate-pulse">
      <div className="h-5 w-48 bg-muted rounded" />
      <div className="space-y-2">
        <div className="h-4 w-full bg-muted rounded" />
        <div className="h-4 w-4/5 bg-muted rounded" />
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="rounded-xl bg-card/60 border border-border/40 p-4 space-y-2">
            <div className="h-4 w-20 bg-muted rounded" />
            <div className="h-3 w-full bg-muted rounded" />
            <div className="h-3 w-3/4 bg-muted rounded" />
          </div>
        ))}
      </div>
    </div>
  );
}


export default function MacroPage() {
  const router = useRouter();
  const isDev = process.env.NODE_ENV === 'development';

  const [report, setReport] = useState<WeeklyMacroReport | null>(null);
  const [reportLoading, setReportLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [generateError, setGenerateError] = useState<string | null>(null);

  // Subscription state
  const [user, setUser] = useState<User | null>(null);
  const [isSubscribed, setIsSubscribed] = useState(false);
  const [subscriptionLoading, setSubscriptionLoading] = useState(false);

  const checkSubscriptionStatus = useCallback(async (email: string) => {
    try {
      const result = await api.subscriptions.getStatus('weekly_report', email);
      setIsSubscribed(result.subscribed);
    } catch {
      setIsSubscribed(false);
    }
  }, []);

  async function handleSubscribe() {
    if (!user?.email) {
      router.push('/login?redirect=/macro');
      return;
    }
    setSubscriptionLoading(true);
    try {
      const result = await api.subscriptions.subscribe('weekly_report', {
        email: user.email,
        user_id: user.id,
        first_name: user.name,
      });
      if (result.success) {
        setIsSubscribed(true);
      }
    } catch {
      // ignore
    } finally {
      setSubscriptionLoading(false);
    }
  }

  async function handleUnsubscribe() {
    if (!user?.email) return;
    setSubscriptionLoading(true);
    try {
      const result = await api.subscriptions.unsubscribe('weekly_report', user.email);
      if (result.success) {
        setIsSubscribed(false);
      }
    } catch {
      // ignore
    } finally {
      setSubscriptionLoading(false);
    }
  }

  async function handleGenerate() {
    setGenerating(true);
    setGenerateError(null);
    try {
      const res = await api.weeklyReport.generate(true);
      if (res.success && res.data) {
        setReport(res.data);
      }
    } catch (err) {
      setGenerateError(err instanceof Error ? err.message : 'Failed to generate weekly report');
    } finally {
      setGenerating(false);
    }
  }

  useEffect(() => {
    api.weeklyReport
      .getLatest()
      .then((res) => {
        if (res.success) setReport(res.data);
      })
      .catch(() => {})
      .finally(() => setReportLoading(false));

    getCurrentUser().then((u) => {
      setUser(u);
      if (u?.email) {
        checkSubscriptionStatus(u.email);
      }
    });
  }, [checkSubscriptionStatus]);

  return (
    <main className="min-h-screen bg-background">
      {/* Header */}
      <section className="border-b border-border/50">
        <div className="max-w-4xl mx-auto px-4 md:px-6 py-8 md:py-12">
          <div className="flex items-center gap-3 mb-3">
            <div className="h-px flex-1 max-w-[60px] bg-gradient-to-r from-primary to-transparent" />
            <span className="text-primary text-xs font-medium tracking-[0.2em] uppercase">MACRO WEEKLY</span>
          </div>
          <div className="flex items-start justify-between gap-4">
            <div>
              <h1 className="font-editorial text-3xl md:text-4xl text-foreground tracking-tight mb-1">
                {report?.title || '宏观周报'}
              </h1>
              {report && (
                <p className="text-muted-foreground text-sm">
                  {formatWeekLabel(report.week_label)} &middot; {new Date(report.generated_at).toLocaleDateString('zh-CN')}
                </p>
              )}
            </div>
            <div className="flex items-center gap-3 shrink-0">
              {/* Subscribe button */}
              <button
                onClick={isSubscribed ? handleUnsubscribe : handleSubscribe}
                disabled={subscriptionLoading}
                className={`px-4 py-2.5 rounded-lg font-medium text-sm border transition-all flex items-center gap-2 group ${
                  isSubscribed
                    ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20 hover:bg-red-500/10 hover:text-red-400 hover:border-red-500/20'
                    : 'bg-card text-foreground border-border/50 hover:border-emerald-500/30'
                } disabled:opacity-50 disabled:cursor-not-allowed`}
              >
                {subscriptionLoading ? (
                  <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                ) : isSubscribed ? (
                  <>
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M5 13l4 4L19 7" />
                    </svg>
                    <span>已订阅周报</span>
                  </>
                ) : (
                  <>
                    <svg className="w-4 h-4 text-muted-foreground group-hover:text-emerald-400 transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
                    </svg>
                    <span>订阅周报</span>
                  </>
                )}
              </button>

              {isDev && (
                <button
                  onClick={handleGenerate}
                  disabled={generating}
                  className="px-4 py-2 bg-emerald-600 text-white rounded-lg font-medium text-sm transition-all hover:bg-emerald-500 hover:shadow-lg hover:shadow-emerald-500/20 disabled:opacity-50 disabled:cursor-not-allowed disabled:shadow-none flex items-center gap-2"
                >
                  {generating ? (
                    <>
                      <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                      </svg>
                      <span>生成中...</span>
                    </>
                  ) : (
                    <span>生成周报</span>
                  )}
                </button>
              )}
            </div>
          </div>
          {generateError && (
            <p className="mt-2 text-sm text-red-500">{generateError}</p>
          )}
        </div>
      </section>

      <div className="max-w-4xl mx-auto px-4 md:px-6 py-8 space-y-10">
        {reportLoading ? (
          <ReportSkeleton />
        ) : !report ? (
          <div className="rounded-xl bg-card border border-border p-8 text-center">
            <p className="text-muted-foreground">暂无周报数据</p>
          </div>
        ) : (
          <>
            {/* ── LAYER 1: Verdict + Signal Lights ── */}
            <section className="space-y-5">
              {/* Verdict */}
              {report.verdict && (
                <div className="bg-card rounded-xl border border-border p-5">
                  <div className="flex items-center gap-2 mb-3">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500/70" />
                    <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                      核心判断
                    </span>
                  </div>
                  <p className="text-base text-foreground/90 leading-relaxed">
                    {report.verdict}
                  </p>
                </div>
              )}

              {/* Signal Lights */}
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

            {/* ── Dimension Navigation (immediately visible) ── */}
            <section className="space-y-4">
              <div className="flex items-center gap-2.5">
                <div className="w-1 h-5 bg-emerald-500 rounded-full" />
                <h4 className="text-sm font-semibold text-foreground uppercase tracking-wider">四维分析</h4>
                <span className="text-xs text-muted-foreground/60 ml-1">点击查看详情</span>
              </div>
              <DimensionNav report={report} />
            </section>

            {/* ── LAYER 2: Full Narrative ── */}

            {/* Landscape */}
            {report.landscape && (
              <section className="space-y-4">
                <SectionHeader title="宏观格局" />
                <div className="bg-card rounded-xl border border-border p-5">
                  <MacroMarkdown content={report.landscape} />
                </div>
              </section>
            )}

            {/* Narrative */}
            {report.narrative && (
              <section className="space-y-4">
                <SectionHeader title="本周回顾" />
                <div className="bg-card rounded-xl border border-border p-5">
                  <MacroMarkdown content={report.narrative} />
                </div>
              </section>
            )}

            {/* Takeaway */}
            {report.takeaway && (
              <section className="space-y-4">
                <SectionHeader title="策略启示" />
                <div className="bg-card rounded-xl border border-border p-5">
                  <MacroMarkdown content={report.takeaway} />
                </div>
              </section>
            )}

            {/* Week Ahead */}
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
                        <span className="font-data text-sm text-emerald-500">{event.date}</span>
                        <span className="text-sm text-foreground font-medium">{event.event}</span>
                        <span className="text-sm text-muted-foreground">{event.if_above}</span>
                        <span className="text-sm text-muted-foreground">{event.if_below}</span>
                      </div>
                      <div className="md:hidden space-y-2">
                        <div className="flex items-center gap-2">
                          <span className="font-data text-sm text-emerald-500">{event.date}</span>
                          <span className="text-sm text-foreground font-medium">{event.event}</span>
                        </div>
                        <div className="grid grid-cols-2 gap-3 text-xs text-muted-foreground">
                          <div>
                            <span className="text-emerald-500/70 mr-1">高于预期:</span>
                            {event.if_above}
                          </div>
                          <div>
                            <span className="text-rose-500/70 mr-1">低于预期:</span>
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
        )}
      </div>
    </main>
  );
}
