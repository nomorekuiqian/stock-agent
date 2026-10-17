import { MarketSummary } from '@/components/MarketSummary';
import Link from 'next/link';
import { reportPath } from '@/lib/report-url';
import { ReportHeroBanner } from '@/components/ReportHeroBanner';
import { ReportTabs } from '@/components/ReportTabs';
import { MorningActions } from './_components/MorningActions';
import { MorningReportBody } from './_components/MorningReportBody';
import { AiChatLink } from '@/components/AiChatLink';
import { getAuthCookies } from '@/lib/auth-cookies';
import { marketTodayStr, formatReportDate, formatDateShort } from '@/lib/timezone';
import type { MorningReport, MorningReportListItem } from '@/lib/api';

// Per-user dynamic: we forward the user's access-token cookie to the
// backend so subscribers' SSR HTML contains the unlocked report rather
// than the locked shape. ISR can't be used here because the response
// depends on who's logged in.
export const dynamic = 'force-dynamic';

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8000/api';
const SERVER_FETCH_TIMEOUT_MS = 10000;

async function authHeaders(): Promise<Record<string, string>> {
  const { accessToken } = await getAuthCookies();
  return accessToken ? { Authorization: `Bearer ${accessToken}` } : {};
}

async function getMorningReportByDate(date: string): Promise<MorningReport | null> {
  try {
    const headers = await authHeaders();
    const res = await fetch(`${API_BASE}/morning/reports/date/${date}`, {
      headers,
      cache: 'no-store',
      signal: AbortSignal.timeout(SERVER_FETCH_TIMEOUT_MS),
    });
    if (!res.ok) return null;
    const json = await res.json();
    return json.data ?? null;
  } catch {
    return null;
  }
}

async function getMorningReportLatest(): Promise<MorningReport | null> {
  try {
    const headers = await authHeaders();
    const res = await fetch(`${API_BASE}/morning/reports/latest`, {
      headers,
      cache: 'no-store',
      signal: AbortSignal.timeout(SERVER_FETCH_TIMEOUT_MS),
    });
    if (!res.ok) return null;
    const json = await res.json();
    return json.data ?? null;
  } catch {
    return null;
  }
}

async function getMorningReportList(): Promise<{ data: MorningReportListItem[]; total: number }> {
  try {
    // The list endpoint returns only metadata (titles, dates) — no AI text —
    // so it doesn't need auth forwarding. Keep ISR for it.
    const res = await fetch(`${API_BASE}/morning/reports?limit=6&offset=0`, {
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

export default async function MorningPage() {
  const today = marketTodayStr();

  const [todayReport, latestReport, historyResult] = await Promise.all([
    getMorningReportByDate(today),
    getMorningReportLatest(),
    getMorningReportList(),
  ]);

  const report = todayReport ?? latestReport ?? null;
  const isToday = todayReport ? true : latestReport?.report_date === today;
  const historicalReports = (historyResult.data ?? [])
    .filter(r => r.report_date !== today)
    .slice(0, 5);
  const totalReports = historyResult.total;

  return (
    <main className="min-h-screen w-full max-w-full overflow-x-hidden bg-background">
      {/* Page Header */}
      <section className="border-b border-border/50">
        <div className="max-w-5xl mx-auto px-4 md:px-6 py-8 md:py-12">
          <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
            <div className="space-y-3">
              <div className="flex items-center gap-3 animate-fade-in-up">
                <div className="h-px flex-1 max-w-[60px] bg-gradient-to-r from-amber-400 to-transparent animate-line-expand" />
                <span className="text-amber-400 text-xs font-semibold tracking-[0.25em] uppercase">Morning Brief</span>
                {report && !isToday && (
                  <span className="text-muted-foreground text-xs font-semibold tracking-[0.2em] uppercase ml-2">/ Archive</span>
                )}
              </div>
              <h1 className="text-3xl md:text-5xl font-editorial text-foreground tracking-tight leading-[1.1] animate-fade-in-up delay-100">
                盘前早报
              </h1>
              <p className="text-muted-foreground text-sm md:text-base max-w-lg leading-relaxed animate-fade-in-up delay-200">
                盘前市场简报，快速了解隔夜要闻与今日焦点
              </p>
            </div>

            <div className="flex flex-col items-start md:items-end gap-4 animate-fade-in-up delay-300">
              <ReportTabs />
              <div className="flex items-center gap-3">
                {report && (
                  <AiChatLink href={`/research?context=morning_report&date=${report.report_date || ''}`} />
                )}
                <MorningActions />
              </div>
            </div>
          </div>

          {report && <MarketSummary morning={report} />}
          <ReportHeroBanner src="/report-banners/morning-brief-banner.png" priority />
        </div>
      </section>

      {/* Report Content */}
      {report ? (
        <div className="max-w-5xl mx-auto px-4 md:px-6 py-8 space-y-8">
          <MorningReportBody report={report} targetPath="/morning" />
        </div>
      ) : (
        <div className="max-w-5xl mx-auto px-4 md:px-6 py-20">
          <div className="text-center space-y-6 animate-fade-in-up">
            <div className="w-20 h-20 mx-auto rounded-2xl bg-card border border-border/50 flex items-center justify-center">
              <svg className="w-10 h-10 text-muted-foreground" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z" />
              </svg>
            </div>
            <div>
              <h3 className="text-xl font-editorial text-foreground mb-2">暂无早报</h3>
              <p className="text-muted-foreground text-sm max-w-sm mx-auto">
                早报在工作日开盘前发布。
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Historical Reports Section */}
      {historicalReports.length > 0 && (
        <section className="border-t border-border/50 mt-12">
          <div className="max-w-5xl mx-auto px-4 md:px-6 py-10">
            <div className="flex items-center justify-between mb-8 animate-fade-in-up">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <div className="w-1 h-5 bg-amber-500 rounded-full" />
                  <h3 className="text-xl font-editorial text-foreground">往期早报</h3>
                </div>
                <p className="text-sm text-muted-foreground pl-3 tabular-nums">{totalReports} 篇早报存档</p>
              </div>
              <Link
                href="/morning/archive"
                className="text-sm text-amber-400 hover:text-amber-300 transition-colors flex items-center gap-1 group"
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
                  href={reportPath('morning', r)}
                  className="group terminal-card p-6 hover:bg-card/80 hover:-translate-y-0.5 animate-fade-in-up"
                  style={{ animationDelay: `${200 + i * 100}ms` }}
                >
                  <h4 className="text-base font-medium text-foreground line-clamp-2 group-hover:text-amber-400 transition-colors leading-snug mb-4">
                    {r.title || formatReportDate(r.report_date)}
                  </h4>
                  <div className="flex items-center justify-between pt-4 border-t border-border/30">
                    <span className="text-xs font-data text-muted-foreground tabular-nums tracking-wide">
                      {formatDateShort(r.report_date)}
                    </span>
                    <svg className="w-4 h-4 text-muted-foreground group-hover:text-amber-400 group-hover:translate-x-0.5 transition-all" fill="none" stroke="currentColor" viewBox="0 0 24 24">
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
