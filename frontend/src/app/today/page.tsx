'use client';

import { useMemo } from 'react';
import Link from 'next/link';
import { ReportContent } from '@/components/ReportContent';
import { ReportTabs } from '@/components/ReportTabs';
import { marketTodayStr, formatDateChinese, formatDateShort } from '@/lib/timezone';
import { TodayActions } from './_components/TodayActions';
import { useReportByDate, useLatestReport, useReportList } from '@/hooks/queries/use-report-data';

interface IndexData {
  name: string;
  value: number;
  change_percent?: number;
}

export default function TodayPage() {
  const today = marketTodayStr();

  const { data: todayReport, isLoading: loadingToday } = useReportByDate(today);
  const { data: latestReport, isLoading: loadingLatest } = useLatestReport();
  const { data: historicalResult, isLoading: loadingHistory } = useReportList(6, 0);

  const report = todayReport ?? latestReport ?? null;
  const isToday = todayReport ? true : (latestReport?.report_date === today);
  const isLoading = loadingToday || (loadingLatest && !todayReport);

  const historicalReports = useMemo(() => {
    if (!historicalResult?.data) return [];
    return historicalResult.data.filter(r => r.report_date !== today).slice(0, 5);
  }, [historicalResult, today]);
  const totalReports = historicalResult?.total ?? 0;

  return (
    <main className="min-h-screen bg-background">
      {/* Page Header */}
      <section className="border-b border-border/50">
        <div className="max-w-5xl mx-auto px-4 md:px-6 py-8 md:py-12">
          <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
            <div className="space-y-3">
              <div className="flex items-center gap-3">
                <div className="h-px flex-1 max-w-[60px] bg-gradient-to-r from-primary to-transparent" />
                <span className="text-primary text-xs font-medium tracking-[0.2em] uppercase">DAILY REPORT</span>
                {report && !isToday && (
                  <span className="text-amber-500 text-xs font-medium tracking-[0.15em] uppercase ml-2">/ ARCHIVE</span>
                )}
              </div>
              <h1 className="text-3xl md:text-4xl font-editorial text-foreground tracking-tight">
                今日日报
              </h1>
              <p className="text-muted-foreground text-sm md:text-base max-w-lg">
                AI 驱动的市场分析,提供可操作的投资洞察,助力明智决策
              </p>
            </div>

            <div className="flex flex-col items-start md:items-end gap-4">
              <ReportTabs />
              <TodayActions reportExists={!!report} />
            </div>
          </div>
        </div>
      </section>

      {/* Loading State */}
      {isLoading && (
        <div className="max-w-5xl mx-auto px-4 md:px-6 py-20">
          <div className="flex flex-col items-center justify-center gap-4">
            <div className="w-10 h-10 rounded-full border-2 border-emerald-500/20 border-t-emerald-500 animate-spin" />
            <p className="text-muted-foreground text-sm">加载报告中...</p>
          </div>
        </div>
      )}

      {/* Report Content */}
      {!isLoading && report ? (
        <div className="max-w-5xl mx-auto px-4 md:px-6 py-8 space-y-8">
          {/* Report Header */}
          <section>
            <div className="flex items-center gap-3 mb-4">
              <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-card border border-border/50">
                <svg className="w-4 h-4 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
                <span className="text-sm font-data text-foreground">{formatDateChinese(report.report_date)}</span>
              </div>
            </div>

            {report.title && (
              <h2 className="text-2xl md:text-3xl font-editorial text-foreground leading-tight">
                {report.title}
              </h2>
            )}

            {report.summary && (
              <p className="text-muted-foreground mt-3 leading-relaxed">
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
      ) : !isLoading ? (
        /* Empty State */
        <div className="max-w-5xl mx-auto px-4 md:px-6 py-20">
          <div className="text-center space-y-6">
            <div className="w-20 h-20 mx-auto rounded-2xl bg-card border border-border/50 flex items-center justify-center">
              <svg className="w-10 h-10 text-muted-foreground" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
              </svg>
            </div>
            <div>
              <h3 className="text-xl font-medium text-foreground mb-2">暂无报告</h3>
              <p className="text-muted-foreground text-sm max-w-sm mx-auto">
                市场报告每日生成,请稍后再来查看
              </p>
            </div>
          </div>
        </div>
      ) : null}

      {/* Historical Reports Section */}
      {!loadingHistory && historicalReports.length > 0 && (
        <section className="border-t border-border/50 mt-12">
          <div className="max-w-5xl mx-auto px-4 md:px-6 py-10">
            <div className="flex items-center justify-between mb-8">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <div className="w-1 h-5 bg-emerald-500 rounded-full" />
                  <h3 className="text-xl font-medium text-foreground">往期报告</h3>
                </div>
                <p className="text-sm text-muted-foreground pl-3">{totalReports} 份报告存档</p>
              </div>
              <Link
                href="/today/archive"
                className="text-sm text-emerald-400 hover:text-emerald-300 transition-colors flex items-center gap-1 group"
              >
                查看全部
                <svg className="w-4 h-4 transition-transform group-hover:translate-x-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </Link>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
              {historicalReports.map((r) => (
                <Link
                  key={r.id}
                  href={`/today/${r.id}`}
                  className="group terminal-card p-6 hover:border-emerald-500/30 hover:bg-card/80 transition-all"
                >
                  <h4 className="text-base font-medium text-foreground line-clamp-2 group-hover:text-emerald-400 transition-colors leading-relaxed mb-4">
                    {r.title || formatDateChinese(r.report_date)}
                  </h4>
                  <div className="flex items-center justify-between pt-4 border-t border-border/30">
                    <span className="text-xs font-data text-muted-foreground">
                      {formatDateShort(r.report_date)}
                    </span>
                    <svg className="w-4 h-4 text-muted-foreground group-hover:text-emerald-400 group-hover:translate-x-0.5 transition-all" fill="none" stroke="currentColor" viewBox="0 0 24 24">
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
