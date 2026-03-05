'use client';

import { useState } from 'react';
import Link from 'next/link';
import { formatDateShort, formatTimePacific } from '@/lib/timezone';
import { useMorningReportList } from '@/hooks/queries/use-morning-report-data';

export default function MorningArchivePage() {
  const [page, setPage] = useState(0);
  const pageSize = 12;

  const { data, isLoading: loading, error: queryError } = useMorningReportList(pageSize, page * pageSize);

  const reports = data?.data ?? [];
  const total = data?.total ?? 0;
  const error = queryError ? 'Failed to load reports' : null;
  const totalPages = Math.ceil(total / pageSize);

  return (
    <main className="min-h-screen bg-background">
      {/* Header */}
      <section className="border-b border-border">
        <div className="max-w-5xl mx-auto px-4 md:px-6 py-10 md:py-14">
          <div className="text-center space-y-5">
            <div className="flex items-center justify-center gap-3">
              <div className="h-px flex-1 max-w-[60px] bg-gradient-to-r from-amber-400 to-transparent" />
              <span className="text-amber-400 text-xs font-medium tracking-[0.2em] uppercase">ARCHIVE</span>
              <div className="h-px flex-1 max-w-[60px] bg-gradient-to-l from-amber-400 to-transparent" />
            </div>
            <h1 className="text-3xl md:text-4xl font-editorial tracking-tight text-foreground">
              盘前早报归档
            </h1>
            <p className="text-muted-foreground max-w-lg mx-auto">
              浏览往期盘前市场分析早报
            </p>
            {total > 0 && (
              <p className="text-xs text-muted-foreground">
                共 {total} 篇早报
              </p>
            )}
          </div>
        </div>
      </section>

      {/* Loading State */}
      {loading && (
        <div className="max-w-5xl mx-auto px-4 md:px-6 py-16">
          <div className="flex flex-col items-center justify-center gap-4">
            <div className="w-12 h-12 rounded-full border-3 border-amber-400/20 border-t-amber-400 animate-spin" />
            <p className="text-muted-foreground">Loading...</p>
          </div>
        </div>
      )}

      {/* Error State */}
      {error && (
        <div className="max-w-5xl mx-auto px-4 md:px-6 py-4">
          <div className="p-4 rounded-xl bg-red-500/10 border border-red-500/20 text-red-500 text-sm text-center">
            {error}
          </div>
        </div>
      )}

      {/* Reports Grid */}
      {!loading && !error && reports.length > 0 && (
        <div className="max-w-5xl mx-auto px-4 md:px-6 py-8">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            {reports.map((report) => (
              <Link
                key={report.id || report.report_date}
                href={`/morning/${report.id}`}
                className="group bg-card rounded-xl border border-border p-5 hover:border-amber-500/50 hover-glow transition-all"
              >
                {/* Date Badge */}
                <div className="flex items-center justify-between mb-4">
                  <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-muted text-muted-foreground text-xs font-medium">
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                    </svg>
                    {formatDateShort(report.report_date)}
                  </div>
                  <svg className="w-4 h-4 text-muted-foreground group-hover:text-amber-400 transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                </div>

                {/* Title */}
                <h3 className="text-sm font-semibold text-foreground mb-2 group-hover:text-amber-400 transition-colors">
                  {report.title || formatDateShort(report.report_date)}
                </h3>

                {/* Preview */}
                <p className="text-xs text-muted-foreground leading-relaxed line-clamp-3">
                  {report.market_pulse || ''}
                </p>

                {/* Footer */}
                <div className="mt-4 pt-3 border-t border-border flex items-center justify-between">
                  <span className="text-xs text-muted-foreground">
                    {report.timestamp ? formatTimePacific(report.timestamp) : ''}
                  </span>
                  <div className="w-7 h-7 rounded-full bg-amber-500/10 dark:bg-amber-500/20 flex items-center justify-center group-hover:bg-amber-500/20 dark:group-hover:bg-amber-500/30 transition-all">
                    <svg className="w-3.5 h-3.5 text-amber-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" />
                    </svg>
                  </div>
                </div>
              </Link>
            ))}
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-center gap-2 mt-10">
              <button
                onClick={() => setPage((p) => Math.max(0, p - 1))}
                disabled={page === 0}
                className="px-3 py-2 text-muted-foreground hover:text-foreground disabled:text-muted-foreground/30 disabled:cursor-not-allowed transition-colors"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                </svg>
              </button>

              <div className="flex items-center gap-1">
                {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                  let pageNum = i;
                  if (totalPages > 5) {
                    if (page < 3) {
                      pageNum = i;
                    } else if (page > totalPages - 4) {
                      pageNum = totalPages - 5 + i;
                    } else {
                      pageNum = page - 2 + i;
                    }
                  }
                  return (
                    <button
                      key={pageNum}
                      onClick={() => setPage(pageNum)}
                      className={`w-9 h-9 rounded-lg text-sm font-medium transition-all ${
                        page === pageNum
                          ? 'bg-amber-500 text-white'
                          : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                      }`}
                    >
                      {pageNum + 1}
                    </button>
                  );
                })}
              </div>

              <button
                onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
                disabled={page >= totalPages - 1}
                className="px-3 py-2 text-muted-foreground hover:text-foreground disabled:text-muted-foreground/30 disabled:cursor-not-allowed transition-colors"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </button>
            </div>
          )}
        </div>
      )}

      {/* Empty State */}
      {!loading && !error && reports.length === 0 && (
        <div className="max-w-5xl mx-auto px-4 md:px-6 py-16">
          <div className="text-center space-y-5">
            <div className="w-20 h-20 mx-auto rounded-2xl bg-muted border border-border flex items-center justify-center">
              <svg className="w-10 h-10 text-muted-foreground" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z" />
              </svg>
            </div>
            <div>
              <h3 className="text-lg font-semibold text-foreground mb-2">暂无早报</h3>
              <p className="text-muted-foreground max-w-sm mx-auto">
                早报在工作日开盘前发布。
              </p>
            </div>
            <Link
              href="/morning"
              className="inline-flex items-center gap-2 px-6 py-3 bg-amber-500 text-white rounded-xl font-medium text-sm transition-all hover:bg-amber-400"
            >
              返回早报
            </Link>
          </div>
        </div>
      )}
    </main>
  );
}
