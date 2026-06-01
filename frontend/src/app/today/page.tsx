import Link from 'next/link';
import { ReportContent } from '@/components/ReportContent';
import { ReportHeroBanner } from '@/components/ReportHeroBanner';
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
  const reportTitle = report?.title || '今日日报';

  return (
    <main className="min-h-screen w-full max-w-full overflow-x-hidden bg-background">
      <div className="mx-auto max-w-5xl px-4 md:px-6">
        <section className="border-b border-border/50 py-8 md:py-12">
          <div className="flex flex-col gap-8 lg:grid lg:grid-cols-[minmax(0,1fr)_280px] lg:items-end">
            <div className="max-w-4xl space-y-4 animate-fade-in-up">
              <div className="flex items-center gap-3">
                <div className="h-px flex-1 max-w-[60px] bg-gradient-to-r from-primary to-transparent" />
                <span className="text-xs font-medium uppercase tracking-[0.2em] text-primary">
                  Daily Report
                </span>
                {report && !isToday && (
                  <span className="ml-1 text-xs font-medium uppercase tracking-[0.15em] text-muted-foreground">
                    · Archive
                  </span>
                )}
              </div>

              <div className="space-y-3">
                <p className="font-data text-xs tabular-nums text-muted-foreground">
                  {formatReportDate(report?.report_date ?? today)}
                </p>
                <h1 className="max-w-4xl font-editorial text-3xl leading-tight text-foreground md:text-5xl">
                  {reportTitle}
                </h1>
                <p className="max-w-2xl text-sm leading-relaxed text-muted-foreground md:text-base">
                  {report?.summary || 'AI 驱动的市场分析，提供可操作的投资洞察，助力明智决策。'}
                </p>
              </div>
            </div>

            <div className="flex flex-col items-start gap-4 lg:items-end animate-fade-in-up delay-100">
              <ReportTabs />
              <TodayActions
                chatHref={report ? `/research?context=daily_report&date=${report.report_date || ''}` : undefined}
              />
            </div>
          </div>

          <ReportHeroBanner src="/report-banners/evening-report-banner.png" priority />
        </section>

        {report ? (
          <article className="py-8 md:py-10">
            <ReportContent
              indices={report.indices as IndexData[] | undefined}
              intro={report.intro}
              news={report.news}
              report_summary={report.report_summary}
              calendar={report.calendar}
              showDisclaimer={false}
            />
          </article>
        ) : (
          <div className="py-20">
            <div className="mx-auto max-w-sm space-y-3 text-center animate-fade-in-up">
              <h2 className="text-2xl font-medium text-foreground">暂无报告</h2>
              <p className="text-sm leading-6 text-muted-foreground">
                市场报告每日生成，请稍后再来查看。
              </p>
            </div>
          </div>
        )}
      </div>

      {twitterDigestTeaser && (
        <TwitterDigestConversion teaser={twitterDigestTeaser} />
      )}

      {historicalReports.length > 0 && (
        <section className="mt-4 border-t border-border/60">
          <div className="mx-auto max-w-5xl px-4 py-10 md:px-6">
            <div className="mb-6 flex items-end justify-between gap-4 animate-fade-in-up">
              <div className="space-y-1">
                <h2 className="text-xl font-medium text-foreground">往期报告</h2>
                <p className="text-sm text-muted-foreground tabular-nums">{totalReports} 份报告存档</p>
              </div>
              <Link
                href="/today/archive"
                className="group inline-flex items-center gap-1 text-sm text-primary transition-colors hover:text-primary/80"
              >
                查看全部
                <svg className="h-4 w-4 transition-transform group-hover:translate-x-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </Link>
            </div>

            <div className="divide-y divide-border/50 rounded-lg border border-border/40 bg-card/50">
              {historicalReports.map((r, i) => (
                <Link
                  key={r.id}
                  href={`/today/${r.id}`}
                  className="group grid gap-2 px-4 py-4 transition-colors hover:bg-card/60 sm:grid-cols-[1fr_auto] sm:items-center md:px-5 animate-fade-in-up"
                  style={{ animationDelay: `${200 + i * 100}ms` }}
                >
                  <h3 className="line-clamp-1 text-sm font-medium leading-6 text-foreground transition-colors group-hover:text-primary">
                    {r.title || formatReportDate(r.report_date)}
                  </h3>
                  <span className="font-data text-xs text-muted-foreground tabular-nums">
                    {formatDateShort(r.report_date)}
                  </span>
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
                <span className="text-amber-400 text-xs font-medium tracking-[0.2em] uppercase">
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
              <p className="text-xs text-muted-foreground text-center">
                全文、邮件推送和历史归档为 Max 专属
              </p>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
