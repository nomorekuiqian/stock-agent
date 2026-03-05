import type { Metadata } from 'next';
import Link from 'next/link';
import { api } from '@/lib/api';
import { MorningReportContent } from '@/components/MorningReportContent';
import { ReportTabs } from '@/components/ReportTabs';
import { MorningActions } from './_components/MorningActions';
import { marketTodayStr, formatReportDate, formatDateShort } from '@/lib/timezone';

export const metadata: Metadata = {
  title: '盘前早报 - TheMarketBrew',
  description: '盘前市场简报，助你快速了解隔夜要闻与今日焦点',
  alternates: {
    canonical: '/morning',
  },
};

// ISR: revalidate every 5 minutes
export const revalidate = 300;

export default async function MorningPage() {
  const today = marketTodayStr();

  // Fetch report + historical data in parallel on server
  const [reportResult, historicalResult] = await Promise.all([
    (async () => {
      try {
        const todayReport = await api.morningReports.getByDate(today);
        if (todayReport) return { report: todayReport, isToday: true };
        const latestReport = await api.morningReports.getLatest();
        return { report: latestReport, isToday: latestReport?.report_date === today };
      } catch {
        return { report: null, isToday: false };
      }
    })(),
    api.morningReports.list(6, 0).catch(() => ({ data: [], total: 0 })),
  ]);

  const { report, isToday } = reportResult;
  const historicalReports = historicalResult.data.filter(r => r.report_date !== today).slice(0, 5);
  const totalReports = historicalResult.total;

  return (
    <main className="min-h-screen bg-background">
      {/* Page Header */}
      <section className="border-b border-border/50">
        <div className="max-w-5xl mx-auto px-4 md:px-6 py-8 md:py-12">
          <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
            <div className="space-y-3">
              <div className="flex items-center gap-3">
                <div className="h-px flex-1 max-w-[60px] bg-gradient-to-r from-amber-400 to-transparent" />
                <span className="text-amber-400 text-xs font-medium tracking-[0.2em] uppercase">盘前早报</span>
                {report && !isToday && (
                  <span className="text-muted-foreground text-xs font-medium tracking-[0.15em] uppercase ml-2">/ 归档</span>
                )}
              </div>
              <h1 className="text-3xl md:text-4xl font-editorial text-foreground tracking-tight">
                盘前早报
              </h1>
              <p className="text-muted-foreground text-sm md:text-base max-w-lg">
                盘前市场简报，快速了解隔夜要闻与今日焦点
              </p>
            </div>

            <div className="flex flex-col items-start md:items-end gap-4">
              <ReportTabs />
              <MorningActions reportExists={!!report} />
            </div>
          </div>
        </div>
      </section>

      {/* Report Content */}
      {report ? (
        <div className="max-w-5xl mx-auto px-4 md:px-6 py-8 space-y-8">
          {/* Report Header */}
          <section>
            <div className="flex items-center gap-3 mb-4">
              <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-card border border-border/50">
                <svg className="w-4 h-4 text-amber-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z" />
                </svg>
                <span className="text-sm font-data text-foreground">{formatReportDate(report.report_date)}</span>
              </div>
            </div>

            {report.title && (
              <h2 className="text-2xl md:text-3xl font-editorial text-foreground leading-tight">
                {report.title}
              </h2>
            )}

            {report.market_pulse && (
              <div className="mt-4 p-4 rounded-lg bg-emerald-500/5 border border-emerald-500/10">
                <p className="text-foreground/80 leading-relaxed text-sm">
                  {report.market_pulse}
                </p>
              </div>
            )}
          </section>

          <MorningReportContent
            futures={report.futures || []}
            futures_analysis={report.futures_analysis}
            global_markets={report.global_markets || { asia: [], europe: [], other: [] }}
            global_markets_analysis={report.global_markets_analysis}
            overnight_news={report.overnight_news || []}
            today_focus={report.today_focus || []}
            summary={report.summary || []}
          />
        </div>
      ) : (
        /* Empty State */
        <div className="max-w-5xl mx-auto px-4 md:px-6 py-20">
          <div className="text-center space-y-6">
            <div className="w-20 h-20 mx-auto rounded-2xl bg-card border border-border/50 flex items-center justify-center">
              <svg className="w-10 h-10 text-muted-foreground" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z" />
              </svg>
            </div>
            <div>
              <h3 className="text-xl font-medium text-foreground mb-2">暂无早报</h3>
              <p className="text-muted-foreground text-sm max-w-sm mx-auto">
                早报在工作日开盘前发布。
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Historical Reports Section */}
      <section className="border-t border-border/50 mt-12">
        <div className="max-w-5xl mx-auto px-4 md:px-6 py-10">
          <div className="flex items-center justify-between mb-8">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <div className="w-1 h-5 bg-amber-500 rounded-full" />
                <h3 className="text-xl font-medium text-foreground">往期早报</h3>
              </div>
              <p className="text-sm text-muted-foreground pl-3">{totalReports} 篇早报存档</p>
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

          {historicalReports.length > 0 ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
              {historicalReports.map((r) => (
                <Link
                  key={r.id}
                  href={`/morning/${r.id}`}
                  className="group terminal-card p-6 hover:border-amber-500/30 hover:bg-card/80 transition-all"
                >
                  <h4 className="text-base font-medium text-foreground line-clamp-2 group-hover:text-amber-400 transition-colors leading-relaxed mb-4">
                    {r.title || formatReportDate(r.report_date)}
                  </h4>
                  <div className="flex items-center justify-between pt-4 border-t border-border/30">
                    <span className="text-xs font-data text-muted-foreground">
                      {formatDateShort(r.report_date)}
                    </span>
                    <svg className="w-4 h-4 text-muted-foreground group-hover:text-amber-400 group-hover:translate-x-0.5 transition-all" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                    </svg>
                  </div>
                </Link>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">暂无往期早报</p>
          )}
        </div>
      </section>
    </main>
  );
}
