import Link from 'next/link';
import { ReportContent } from '@/components/ReportContent';
import { ReportTabs } from '@/components/ReportTabs';
import { TodayActions } from './_components/TodayActions';
import { marketTodayStr, formatReportDate, formatDateShort } from '@/lib/timezone';
import type { MarketData, ReportListItem, TwitterDigestTeaser } from '@/lib/api';

export const dynamic = 'force-dynamic';
export const revalidate = 300; // ISR: 5 分钟

interface IndexData {
  name: string;
  value: number;
  change_percent?: number;
}

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8000/api';
const SERVER_FETCH_TIMEOUT_MS = 10000;

async function getReportByDate(date: string): Promise<MarketData | null> {
  try {
    const res = await fetch(`${API_BASE}/market/reports/date/${date}`, {
      next: { revalidate: 300 },
      signal: AbortSignal.timeout(SERVER_FETCH_TIMEOUT_MS),
    });
    if (!res.ok) return null;
    const json = await res.json();
    return json.data ?? null;
  } catch {
    return null;
  }
}

async function getLatestReport(): Promise<MarketData | null> {
  try {
    const res = await fetch(`${API_BASE}/market/reports/latest`, {
      next: { revalidate: 300 },
      signal: AbortSignal.timeout(SERVER_FETCH_TIMEOUT_MS),
    });
    if (!res.ok) return null;
    const json = await res.json();
    return json.data ?? null;
  } catch {
    return null;
  }
}

async function getReportList(): Promise<{ data: ReportListItem[]; total: number }> {
  try {
    const res = await fetch(`${API_BASE}/market/reports?limit=6&offset=0`, {
      next: { revalidate: 300 },
      signal: AbortSignal.timeout(SERVER_FETCH_TIMEOUT_MS),
    });
    if (!res.ok) return { data: [], total: 0 };
    const json = await res.json();
    return { data: json.data ?? [], total: json.total ?? json.data?.length ?? 0 };
  } catch {
    return { data: [], total: 0 };
  }
}

async function getTwitterDigestTeaser(): Promise<TwitterDigestTeaser | null> {
  try {
    const res = await fetch(`${API_BASE}/twitter-digest/teaser/latest`, {
      next: { revalidate: 300 },
      signal: AbortSignal.timeout(SERVER_FETCH_TIMEOUT_MS),
    });
    if (!res.ok) return null;
    return res.json();
  } catch {
    return null;
  }
}

export default async function TodayPage() {
  const today = marketTodayStr();

  const [todayReport, latestReport, historyResult, twitterDigestTeaser] = await Promise.all([
    getReportByDate(today),
    getLatestReport(),
    getReportList(),
    getTwitterDigestTeaser(),
  ]);

  const report = todayReport ?? latestReport ?? null;
  const isToday = todayReport ? true : latestReport?.report_date === today;
  const historicalReports = (historyResult.data ?? [])
    .filter(r => r.report_date !== today)
    .slice(0, 5);
  const totalReports = historyResult.total;

  return (
    <main className="min-h-screen bg-background">
      {/* Page Header */}
      <section className="border-b border-border/50">
        <div className="max-w-5xl mx-auto px-4 md:px-6 py-8 md:py-12">
          <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
            <div className="space-y-3">
              <div className="flex items-center gap-3 animate-fade-in-up">
                <div className="h-px flex-1 max-w-[60px] bg-gradient-to-r from-primary to-transparent animate-line-expand" />
                <span className="text-primary text-xs font-semibold tracking-[0.25em] uppercase">Daily Report</span>
                {report && !isToday && (
                  <span className="text-amber-500 text-xs font-semibold tracking-[0.2em] ml-2">/ Archive</span>
                )}
              </div>
              <h1 className="text-3xl md:text-5xl font-editorial text-foreground tracking-tight leading-[1.1] animate-fade-in-up delay-100">
                今日日报
              </h1>
              <p className="text-muted-foreground text-sm md:text-base max-w-lg leading-relaxed animate-fade-in-up delay-200">
                AI 驱动的市场分析，提供可操作的投资洞察，助力明智决策
              </p>
            </div>

            <div className="flex flex-col items-start md:items-end gap-4 animate-fade-in-up delay-300">
              <ReportTabs />
              <TodayActions
                chatHref={report ? `/research?context=daily_report&date=${report.report_date || ''}` : undefined}
              />
            </div>
          </div>
        </div>
      </section>

      {/* Report Content */}
      {report ? (
        <div className="max-w-5xl mx-auto px-4 md:px-6 py-8 space-y-8">
          <section className="animate-fade-in-up delay-150">
            <div className="flex items-center gap-3 mb-4">
              <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-card border border-border/50">
                <svg className="w-4 h-4 text-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
                <span className="text-sm font-data text-foreground tabular-nums">{formatReportDate(report.report_date)}</span>
              </div>
            </div>

            {report.title && (
              <h2 className="text-2xl md:text-3xl font-editorial text-foreground leading-[1.15]">
                {report.title}
              </h2>
            )}

            {report.summary && (
              <p className="text-muted-foreground mt-3 leading-relaxed max-w-2xl">
                {report.summary}
              </p>
            )}
          </section>

          <ReportContent
            indices={report.indices as IndexData[] | undefined}
            intro={report.intro}
            news={report.news}
            report_summary={report.report_summary}
            calendar={report.calendar}
            showDisclaimer={false}
          />
        </div>
      ) : (
        <div className="max-w-5xl mx-auto px-4 md:px-6 py-20">
          <div className="text-center space-y-6 animate-fade-in-up">
            <div className="w-20 h-20 mx-auto rounded-2xl bg-card border border-border/50 flex items-center justify-center animate-float">
              <svg className="w-10 h-10 text-muted-foreground" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
              </svg>
            </div>
            <div>
              <h3 className="text-xl font-editorial text-foreground mb-2">暂无报告</h3>
              <p className="text-muted-foreground text-sm max-w-sm mx-auto">
                市场报告每日生成，请稍后再来查看
              </p>
            </div>
          </div>
        </div>
      )}

      {twitterDigestTeaser && (
        <TwitterDigestConversion teaser={twitterDigestTeaser} />
      )}

      {/* Historical Reports Section */}
      {historicalReports.length > 0 && (
        <section className="border-t border-border/50 mt-12">
          <div className="max-w-5xl mx-auto px-4 md:px-6 py-10">
            <div className="flex items-center justify-between mb-8 animate-fade-in-up">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <div className="w-1 h-5 bg-primary rounded-full" />
                  <h3 className="text-xl font-editorial text-foreground">往期报告</h3>
                </div>
                <p className="text-sm text-muted-foreground pl-3 tabular-nums">{totalReports} 份报告存档</p>
              </div>
              <Link
                href="/today/archive"
                className="text-sm text-primary hover:text-primary/80 transition-colors flex items-center gap-1 group"
              >
                查看全部
                <svg className="w-4 h-4 transition-transform group-hover:translate-x-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </Link>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
              {historicalReports.map((r, i) => (
                <Link
                  key={r.id}
                  href={`/today/${r.id}`}
                  className="group terminal-card p-6 hover:bg-card/80 hover:-translate-y-0.5 hover-glow animate-fade-in-up"
                  style={{ animationDelay: `${200 + i * 100}ms` }}
                >
                  <h4 className="text-base font-medium text-foreground line-clamp-2 group-hover:text-primary transition-colors leading-snug mb-4">
                    {r.title || formatReportDate(r.report_date)}
                  </h4>
                  <div className="flex items-center justify-between pt-4 border-t border-border/30">
                    <span className="text-xs font-data text-muted-foreground tabular-nums tracking-wide">
                      {formatDateShort(r.report_date)}
                    </span>
                    <svg className="w-4 h-4 text-muted-foreground group-hover:text-primary group-hover:translate-x-0.5 transition-all" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                    </svg>
                  </div>
                </Link>
              ))}
            </div>
          </div>
        </section>
      )}
    </main>
  );
}

function TwitterDigestConversion({ teaser }: { teaser: TwitterDigestTeaser }) {
  const tickerLabels = teaser.hot_tickers
    .slice(0, 4)
    .map((item) => item.label)
    .filter(Boolean);

  return (
    <section className="border-t border-border/50 mt-12">
      <div className="max-w-5xl mx-auto px-4 md:px-6 py-10">
        <div className="rounded-lg border border-amber-400/30 bg-amber-400/5 p-5 md:p-6">
          <div className="grid md:grid-cols-[1fr_240px] gap-6 md:items-center">
            <div className="space-y-4">
              <div className="flex items-center gap-3">
                <div className="h-px flex-1 max-w-[48px] bg-gradient-to-r from-amber-400 to-transparent" />
                <span className="text-amber-400 text-xs font-semibold tracking-[0.22em] uppercase">
                  Max Intelligence
                </span>
              </div>
              <div className="space-y-2">
                <p className="text-xs text-muted-foreground font-data tabular-nums">
                  {formatDateShort(teaser.date)}
                </p>
                <h3 className="text-xl md:text-2xl font-editorial text-foreground leading-tight">
                  {teaser.headline || '推特 KOL 日报：盘后观点浓缩'}
                </h3>
                <p className="text-sm text-muted-foreground leading-relaxed max-w-2xl">
                  {teaser.intro_preview || '从优质金融博主的公开观点里提炼市场主线、个股分歧和后续观察点。'}
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                {tickerLabels.length > 0 ? tickerLabels.map((label) => (
                  <span
                    key={label}
                    className="inline-flex items-center rounded-md border border-amber-400/20 bg-background/70 px-2.5 py-1 text-xs font-data text-foreground"
                  >
                    {label.startsWith('$') ? label : `$${label}`}
                  </span>
                )) : (
                  <span className="text-xs text-muted-foreground">暂无热门 ticker 预览</span>
                )}
              </div>
            </div>
            <div className="space-y-3">
              <Link
                href="/twitter-digest"
                className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-amber-600 px-4 py-3 text-sm font-semibold text-white transition-colors hover:bg-amber-600/90"
              >
                查看推特日报
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </Link>
              <Link
                href="/twitter-digest/archive"
                className="inline-flex w-full items-center justify-center rounded-lg border border-border/60 px-4 py-2.5 text-xs text-muted-foreground transition-colors hover:text-foreground"
              >
                浏览往期归档
              </Link>
              <p className="text-[11px] text-muted-foreground text-center">
                全文、邮件推送和历史归档为 Max 专属
              </p>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
