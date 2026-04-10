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

export const revalidate = 600;

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000/api';

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

const SIGNAL_BG_COLORS: Record<string, string> = {
  green: 'border-primary/30 bg-primary/5',
  yellow: 'border-amber-400/30 bg-amber-400/5',
  red: 'border-red-400/30 bg-red-400/5',
};

const SIGNAL_TEXT_COLORS: Record<string, string> = {
  green: 'text-primary',
  yellow: 'text-amber-400',
  red: 'text-red-400',
};

// ── Dimension config ─────────────────────────────────────────────────────────

interface DimensionConfig {
  id: keyof SignalLights;
  nameZh: string;
  href: string;
  analysisKey: 'liquidity_analysis' | 'economy_analysis' | 'inflation_analysis' | 'sentiment_analysis';
}

const DIMENSIONS: DimensionConfig[] = [
  { id: 'liquidity', nameZh: '流动性环境', href: '/macro/liquidity', analysisKey: 'liquidity_analysis' },
  { id: 'economy', nameZh: '经济基本面', href: '/macro/economy', analysisKey: 'economy_analysis' },
  { id: 'inflation', nameZh: '通胀与利率', href: '/macro/inflation-rates', analysisKey: 'inflation_analysis' },
  { id: 'sentiment', nameZh: '市场情绪', href: '/macro/sentiment', analysisKey: 'sentiment_analysis' },
];

// ── Data fetching ────────────────────────────────────────────────────────────

interface DashboardData {
  composite_score: number;
  composite_level: string;
  categories: Array<{
    category_name: string;
    risk_score: number;
    risk_level: string;
    headline: string;
    indicators: Array<{ name: string; value: number | null; units: string; series_id: string }>;
  }>;
  liquidity_summary?: {
    net_liquidity?: { value: number | null; change: number | null };
    nfci?: { value: number | null };
  };
}

interface SentimentData {
  overall_score: number;
  overall_level: string;
  sub_dimensions: Array<{
    name: string;
    indicators: Array<{ series_id: string; value: number | null }>;
  }>;
}

async function fetchWeeklyReport(): Promise<WeeklyMacroReport | null> {
  try {
    const response = await fetch(`${API_BASE_URL}/weekly-report`, { next: { revalidate: 600 } });
    if (!response.ok) return null;
    const result = await response.json();
    return result.success ? result.data : null;
  } catch { return null; }
}

async function fetchDashboard(): Promise<DashboardData | null> {
  try {
    const response = await fetch(`${API_BASE_URL}/macro-risk/dashboard`, { next: { revalidate: 600 } });
    if (!response.ok) return null;
    const result = await response.json();
    return result.success ? result : null;
  } catch { return null; }
}

async function fetchSentiment(): Promise<SentimentData | null> {
  try {
    const response = await fetch(`${API_BASE_URL}/macro-risk/sentiment`, { next: { revalidate: 600 } });
    if (!response.ok) return null;
    const result = await response.json();
    return result.success ? result.data : null;
  } catch { return null; }
}

// ── Metric extraction ────────────────────────────────────────────────────────

interface DimensionMetrics {
  primary: { label: string; value: string; suffix?: string };
  secondary?: { label: string; value: string };
}

function extractMetrics(
  dashboard: DashboardData | null,
  sentiment: SentimentData | null,
): Record<string, DimensionMetrics> {
  const metrics: Record<string, DimensionMetrics> = {};

  if (dashboard) {
    const liq = dashboard.liquidity_summary;
    if (liq?.net_liquidity?.value) {
      const val = liq.net_liquidity.value;
      const formatted = val >= 1000 ? `$${(val / 1000).toFixed(2)}T` : `$${val.toFixed(0)}B`;
      const change = liq.net_liquidity.change;
      metrics.liquidity = {
        primary: { label: '净流动性', value: formatted },
        secondary: change != null ? { label: 'NFCI', value: liq.nfci?.value?.toFixed(2) || 'N/A' } : undefined,
      };
    }

    const empCat = dashboard.categories.find(c => c.category_name === 'Employment');
    const econCat = dashboard.categories.find(c => c.category_name === 'Economic Deterioration');
    if (empCat || econCat) {
      const unemp = empCat?.indicators.find(i => i.series_id === 'UNRATE');
      const recession = econCat?.indicators.find(i => i.series_id === 'RECPROUSM156N');
      metrics.economy = {
        primary: { label: '失业率', value: unemp?.value != null ? `${unemp.value}%` : 'N/A' },
        secondary: recession?.value != null ? { label: '衰退概率', value: `${recession.value}%` } : undefined,
      };
    }

    const creditCat = dashboard.categories.find(c => c.category_name === 'Credit / Default Risk');
    if (creditCat) {
      const hy = creditCat.indicators.find(i => i.series_id === 'BAMLH0A0HYM2');
      const bbb = creditCat.indicators.find(i => i.series_id === 'BAMLC0A4CBBB');
      metrics.inflation = {
        primary: { label: '高收益利差', value: hy?.value != null ? `${hy.value.toFixed(2)}%` : 'N/A' },
        secondary: bbb?.value != null ? { label: 'BBB 利差', value: `${bbb.value.toFixed(2)}%` } : undefined,
      };
    }
  }

  if (sentiment) {
    const vixInd = sentiment.sub_dimensions.find(d => d.name === 'volatility')?.indicators.find(i => i.series_id === 'VIX');
    metrics.sentiment = {
      primary: { label: '恐贪指数', value: sentiment.overall_score != null ? Math.round(sentiment.overall_score).toString() : 'N/A', suffix: '/100' },
      secondary: vixInd?.value != null ? { label: 'VIX', value: vixInd.value.toFixed(1) } : undefined,
    };
  }

  return metrics;
}

// ── Markdown rendering ───────────────────────────────────────────────────────

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

// ── Page ─────────────────────────────────────────────────────────────────────

export default function MacroPage() {
  return (
    <PaywallGuard requiredFeature="macro_dashboard">
    <main className="min-h-screen bg-background">
      <section className="border-b border-border/50">
        <div className="max-w-4xl mx-auto px-4 md:px-6 py-8 md:py-12">
          <div className="flex items-center gap-3 mb-3 animate-fade-in-up">
            <div className="h-px flex-1 max-w-[60px] bg-gradient-to-r from-primary to-transparent animate-line-expand" />
            <span className="text-primary text-xs font-semibold tracking-[0.25em] uppercase">Macro</span>
          </div>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
            <h1 className="font-editorial text-3xl md:text-5xl text-foreground tracking-tight leading-[1.1] animate-fade-in-up delay-100">
              宏观仪表盘
            </h1>
            <div className="flex items-center gap-2 sm:gap-3 shrink-0">
              <AiChatLink href="/research?context=macro" />
              <MacroActions />
            </div>
          </div>
        </div>
      </section>

      <div className="max-w-4xl mx-auto px-4 md:px-6 py-8 space-y-10">
        <Suspense fallback={<MacroSkeleton />}>
          <MacroContent />
        </Suspense>
      </div>
    </main>
    </PaywallGuard>
  );
}

function MacroSkeleton() {
  return (
    <div className="space-y-10 animate-pulse">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="h-36 rounded-xl bg-card border border-border" />
        ))}
      </div>
      <div className="rounded-xl bg-card border border-border p-5 space-y-3">
        <div className="h-3 w-20 bg-muted rounded" />
        <div className="h-4 w-full bg-muted rounded" />
        <div className="h-4 w-3/4 bg-muted rounded" />
      </div>
    </div>
  );
}

async function MacroContent() {
  const [report, dashboard, sentiment] = await Promise.all([
    fetchWeeklyReport(),
    fetchDashboard(),
    fetchSentiment(),
  ]);

  const metrics = extractMetrics(dashboard, sentiment);

  return (
    <>
      {/* ── HERO: Four Dimension Dashboard ── */}
      {dashboard && (
        <div className="flex items-center justify-between mb-1 -mt-4">
          <div className="flex items-baseline gap-2">
            <span className="text-3xl font-data font-bold text-foreground">{dashboard.composite_score}</span>
            <span className="text-sm text-muted-foreground">/10 综合风险</span>
          </div>
          <span className={`text-xs font-medium px-2 py-0.5 rounded-full border ${
            dashboard.composite_level === 'low' ? 'text-primary border-primary/30 bg-primary/5'
            : dashboard.composite_level === 'high' ? 'text-red-400 border-red-400/30 bg-red-400/5'
            : 'text-amber-400 border-amber-400/30 bg-amber-400/5'
          }`}>
            {dashboard.composite_level === 'low' ? '低风险' : dashboard.composite_level === 'high' ? '高风险' : '中等风险'}
          </span>
        </div>
      )}

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {DIMENSIONS.map((dim, idx) => {
          const signalColor = report?.signal_lights[dim.id];
          const analysis = report?.[dim.analysisKey] as SectionAnalysis | undefined;
          const summary = analysis?.summary;
          const m = metrics[dim.id];

          return (
            <Link key={dim.id} href={dim.href} className="group" style={{ animationDelay: `${idx * 75}ms` }}>
              <div className={`relative rounded-xl border p-4 h-full flex flex-col transition-all duration-300 hover:-translate-y-1 hover:shadow-lg motion-reduce:hover:translate-y-0 motion-reduce:hover:shadow-none animate-fade-in-up ${
                signalColor ? SIGNAL_BG_COLORS[signalColor] : 'border-border/40 bg-card/60'
              }`} style={{ animationDelay: `${idx * 75}ms`, animationFillMode: 'both' }}>
                {/* Header: name + signal */}
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-sm font-semibold text-foreground group-hover:text-primary transition-colors duration-200">
                    {dim.nameZh}
                  </h3>
                  {signalColor && (
                    <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium ${SIGNAL_TEXT_COLORS[signalColor]}`}>
                      <span className={`w-1.5 h-1.5 rounded-full ${SIGNAL_DOT_COLORS[signalColor]}`} />
                      {SIGNAL_LABELS[signalColor]}
                    </span>
                  )}
                </div>

                {/* Primary metric */}
                {m ? (
                  <div className="flex-1">
                    <div className="flex items-baseline gap-1">
                      <span className="text-2xl font-data font-bold text-foreground tracking-tight">{m.primary.value}</span>
                      {m.primary.suffix && <span className="text-xs text-muted-foreground/60">{m.primary.suffix}</span>}
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5">{m.primary.label}</p>

                    {m.secondary && (
                      <div className="flex items-baseline gap-1.5 mt-2.5 pt-2.5 border-t border-border/30">
                        <span className="text-sm font-data font-medium text-foreground">{m.secondary.value}</span>
                        <span className="text-xs text-muted-foreground">{m.secondary.label}</span>
                      </div>
                    )}
                  </div>
                ) : (
                  <p className="text-xs text-muted-foreground/50 flex-1 leading-relaxed line-clamp-2">
                    {summary || '...'}
                  </p>
                )}

                {/* Footer arrow */}
                <div className="flex items-center gap-1 mt-3 pt-2 border-t border-border/10">
                  <span className="text-xs text-primary/50 group-hover:text-primary transition-colors duration-200">详情</span>
                  <svg className="w-3.5 h-3.5 text-primary/50 group-hover:text-primary group-hover:translate-x-0.5 transition-all duration-200" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                </div>
              </div>
            </Link>
          );
        })}
      </div>

      {/* ── Weekly Report ── */}
      {report && (
        <>
          {/* Week label */}
          <div className="flex items-center gap-3">
            <div className="h-px flex-1 bg-border/40" />
            <span className="text-xs text-muted-foreground/60 uppercase tracking-wider shrink-0">
              周报 &middot; {formatWeekLabel(report.week_label)}
            </span>
            <div className="h-px flex-1 bg-border/40" />
          </div>

          {/* Verdict */}
          {report.verdict && (
            <div className="bg-card rounded-xl border border-border p-5">
              <div className="flex items-center gap-2 mb-3">
                <span className="w-1.5 h-1.5 rounded-full bg-primary/70" />
                <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">核心判断</span>
              </div>
              <p className="text-base text-foreground/90 leading-relaxed">{report.verdict}</p>
            </div>
          )}

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
                        <div><span className="text-primary/70 mr-1">高于预期:</span>{event.if_above}</div>
                        <div><span className="text-red-500/70 mr-1">低于预期:</span>{event.if_below}</div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}
        </>
      )}

      {!report && (
        <div className="rounded-xl bg-card border border-border p-8 text-center">
          <p className="text-muted-foreground">暂无周报数据</p>
        </div>
      )}
    </>
  );
}
