'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { getReportsList, MarketReport } from '@/lib/insforge';

export default function ReportsPage() {
  const [reports, setReports] = useState<MarketReport[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const pageSize = 12;

  useEffect(() => {
    fetchReports();
  }, [page]);

  const fetchReports = async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await getReportsList(pageSize, page * pageSize);
      setReports(result.data);
      setTotal(result.total);
    } catch {
      setError('Failed to load reports');
    } finally {
      setLoading(false);
    }
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('zh-CN', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      weekday: 'long',
    });
  };

  const formatShortDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('zh-CN', {
      month: 'short',
      day: 'numeric',
    });
  };

  const getPreviewText = (text: string, maxLength: number = 150) => {
    if (!text) return '';
    // Remove markdown formatting for preview
    const cleaned = text
      .replace(/#{1,6}\s/g, '')
      .replace(/\*\*/g, '')
      .replace(/\*/g, '')
      .replace(/\n/g, ' ')
      .trim();
    return cleaned.length > maxLength
      ? cleaned.substring(0, maxLength) + '...'
      : cleaned;
  };

  const totalPages = Math.ceil(total / pageSize);

  return (
    <main className="min-h-screen bg-white">
      {/* Header */}
      <section className="border-b border-gray-100">
        <div className="max-w-5xl mx-auto px-4 md:px-6 py-8 md:py-12">
          <div className="text-center space-y-4">
            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-50 text-emerald-700 text-xs font-medium">
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
              </svg>
              Historical Data
            </div>
            <h1 className="text-2xl md:text-3xl font-semibold tracking-tight text-gray-900">
              Market Reports Archive
            </h1>
            <p className="text-sm md:text-base text-gray-500 max-w-lg mx-auto">
              Browse past daily market analysis reports
            </p>
            {total > 0 && (
              <p className="text-xs text-gray-400">
                {total} reports available
              </p>
            )}
          </div>
        </div>
      </section>

      {/* Loading State */}
      {loading && (
        <div className="max-w-5xl mx-auto px-4 md:px-6 py-12">
          <div className="flex flex-col items-center justify-center gap-3">
            <div className="w-10 h-10 rounded-full border-3 border-emerald-100 border-t-emerald-600 animate-spin" />
            <p className="text-gray-500 text-sm">Loading reports...</p>
          </div>
        </div>
      )}

      {/* Error State */}
      {error && (
        <div className="max-w-5xl mx-auto px-4 md:px-6 py-4">
          <div className="p-3 rounded-lg bg-red-50 border border-red-100 text-red-600 text-sm text-center">
            {error}
          </div>
        </div>
      )}

      {/* Reports Grid */}
      {!loading && !error && reports.length > 0 && (
        <div className="max-w-5xl mx-auto px-4 md:px-6 py-8">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {reports.map((report) => (
              <Link
                key={report.id || report.report_date}
                href={`/reports/${report.report_date}`}
                className="group bg-white rounded-xl border border-gray-200 p-5 hover:border-emerald-300 hover:shadow-md transition-all"
              >
                {/* Date Badge */}
                <div className="flex items-center justify-between mb-3">
                  <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-gray-50 text-gray-600 text-xs font-medium">
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                    </svg>
                    {formatShortDate(report.report_date)}
                  </div>
                  <svg className="w-4 h-4 text-gray-400 group-hover:text-emerald-600 transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                </div>

                {/* Title */}
                <h3 className="text-sm font-semibold text-gray-900 mb-2 group-hover:text-emerald-700 transition-colors">
                  {formatDate(report.report_date)}
                </h3>

                {/* Preview */}
                <p className="text-xs text-gray-500 leading-relaxed line-clamp-3">
                  {getPreviewText(report.short_analysis)}
                </p>

                {/* Footer */}
                <div className="mt-4 pt-3 border-t border-gray-100 flex items-center justify-between">
                  <span className="text-xs text-gray-400">
                    View full report
                  </span>
                  <div className="w-6 h-6 rounded-full bg-emerald-50 flex items-center justify-center group-hover:bg-emerald-100 transition-colors">
                    <svg className="w-3 h-3 text-emerald-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" />
                    </svg>
                  </div>
                </div>
              </Link>
            ))}
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-center gap-2 mt-8">
              <button
                onClick={() => setPage((p) => Math.max(0, p - 1))}
                disabled={page === 0}
                className="px-3 py-2 text-sm text-gray-600 hover:text-gray-900 disabled:text-gray-300 disabled:cursor-not-allowed transition-colors"
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
                      className={`w-8 h-8 rounded-lg text-sm font-medium transition-colors ${
                        page === pageNum
                          ? 'bg-emerald-600 text-white'
                          : 'text-gray-600 hover:bg-gray-100'
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
                className="px-3 py-2 text-sm text-gray-600 hover:text-gray-900 disabled:text-gray-300 disabled:cursor-not-allowed transition-colors"
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
        <div className="max-w-5xl mx-auto px-4 md:px-6 py-12">
          <div className="text-center space-y-4">
            <div className="w-16 h-16 mx-auto rounded-2xl bg-gray-50 flex items-center justify-center">
              <svg className="w-8 h-8 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
              </svg>
            </div>
            <div>
              <h3 className="text-base font-semibold text-gray-900 mb-1">No Reports Yet</h3>
              <p className="text-sm text-gray-500 max-w-sm mx-auto">
                Generate your first market analysis report to start building your archive.
              </p>
            </div>
            <Link
              href="/market"
              className="inline-flex items-center gap-2 px-5 py-2.5 bg-emerald-600 text-white rounded-lg font-medium text-sm transition-all hover:bg-emerald-700"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              Generate Report
            </Link>
          </div>
        </div>
      )}
    </main>
  );
}
