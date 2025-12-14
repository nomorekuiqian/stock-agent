'use client';

import { useState, useEffect, use } from 'react';
import Link from 'next/link';
import ReactMarkdown from 'react-markdown';
import { getReportById, MarketReport } from '@/lib/insforge';

interface IndexData {
  name: string;
  value: number;
  change_percent?: number;
}

export default function ReportDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const [report, setReport] = useState<MarketReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchReport = async () => {
      setLoading(true);
      setError(null);
      try {
        const data = await getReportById(id);
        if (data) {
          setReport(data);
        } else {
          setError('Report not found');
        }
      } catch {
        setError('Failed to load report');
      } finally {
        setLoading(false);
      }
    };

    fetchReport();
  }, [id]);

  const formatDate = (dateString: string) => {
    const d = new Date(dateString);
    return d.toLocaleDateString('zh-CN', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      weekday: 'long',
    });
  };

  const formatTime = (dateString: string) => {
    const d = new Date(dateString);
    return d.toLocaleTimeString('zh-CN', {
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  return (
    <main className="min-h-screen bg-white">
      {/* Back Navigation */}
      <div className="border-b border-gray-100">
        <div className="max-w-5xl mx-auto px-4 md:px-6 py-3">
          <Link
            href="/reports"
            className="inline-flex items-center gap-2 text-sm text-gray-500 hover:text-gray-900 transition-colors"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
            Back to Reports
          </Link>
        </div>
      </div>

      {/* Loading State */}
      {loading && (
        <div className="max-w-5xl mx-auto px-4 md:px-6 py-12">
          <div className="flex flex-col items-center justify-center gap-3">
            <div className="w-10 h-10 rounded-full border-3 border-emerald-100 border-t-emerald-600 animate-spin" />
            <p className="text-gray-500 text-sm">Loading report...</p>
          </div>
        </div>
      )}

      {/* Error State */}
      {error && (
        <div className="max-w-5xl mx-auto px-4 md:px-6 py-12">
          <div className="text-center space-y-4">
            <div className="w-16 h-16 mx-auto rounded-2xl bg-red-50 flex items-center justify-center">
              <svg className="w-8 h-8 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
            </div>
            <div>
              <h3 className="text-base font-semibold text-gray-900 mb-1">{error}</h3>
              <p className="text-sm text-gray-500">
                The requested report could not be found.
              </p>
            </div>
            <Link
              href="/reports"
              className="inline-flex items-center gap-2 px-5 py-2.5 bg-gray-100 text-gray-700 rounded-lg font-medium text-sm transition-all hover:bg-gray-200"
            >
              View All Reports
            </Link>
          </div>
        </div>
      )}

      {/* Report Content */}
      {!loading && !error && report && (
        <div className="max-w-5xl mx-auto px-4 md:px-6 py-8 space-y-8">
          {/* Header */}
          <section className="text-center space-y-4">
            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-50 text-emerald-700 text-xs font-medium">
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
              {formatDate(report.report_date)}
            </div>
            <h1 className="text-2xl md:text-3xl font-semibold tracking-tight text-gray-900">
              Market Report
            </h1>
            {report.timestamp && (
              <p className="text-sm text-gray-500">
                Generated at {formatTime(report.timestamp)}
              </p>
            )}
          </section>

          {/* Market Indices */}
          {report.indices && Array.isArray(report.indices) && report.indices.length > 0 && (
            <section>
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-semibold text-gray-900">Market Overview</h2>
                <span className="text-xs text-gray-400">
                  {report.indices.length} indices
                </span>
              </div>

              <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                {(report.indices as IndexData[]).map((index: IndexData) => (
                  <div
                    key={index.name}
                    className="bg-white rounded-lg border border-gray-200 p-4 hover:border-gray-300 transition-colors"
                  >
                    <p className="text-xs text-gray-500 font-medium mb-1 truncate">{index.name}</p>
                    <p className="text-lg font-semibold text-gray-900 mb-1">
                      {index.value?.toLocaleString(undefined, { maximumFractionDigits: 2 })}
                    </p>
                    {index.change_percent !== undefined && (
                      <div className={`inline-flex items-center gap-0.5 text-xs font-medium ${
                        index.change_percent >= 0 ? 'text-green-600' : 'text-red-600'
                      }`}>
                        <svg
                          className={`w-3 h-3 ${index.change_percent >= 0 ? '' : 'rotate-180'}`}
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 10l7-7m0 0l7 7m-7-7v18" />
                        </svg>
                        {Math.abs(index.change_percent).toFixed(2)}%
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* In-Depth Analysis */}
          {report.in_depth_analysis && (
            <section>
              <div className="flex items-center gap-2 mb-4">
                <svg className="w-5 h-5 text-emerald-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
                <div>
                  <h2 className="text-lg font-semibold text-gray-900">In-Depth Analysis</h2>
                  <p className="text-xs text-gray-500">AI-generated market report</p>
                </div>
              </div>

              <div className="bg-white rounded-xl border border-gray-200 p-5 md:p-6">
                <div className="prose prose-sm max-w-none prose-headings:text-gray-900 prose-headings:font-semibold prose-headings:text-base prose-p:text-gray-600 prose-p:text-sm prose-p:leading-relaxed prose-strong:text-gray-900 prose-a:text-emerald-600 prose-ul:text-gray-600 prose-ul:text-sm prose-li:text-gray-600 prose-li:text-sm prose-h2:mt-6 prose-h2:mb-3 prose-h3:mt-4 prose-h3:mb-2">
                  <ReactMarkdown>{report.in_depth_analysis}</ReactMarkdown>
                </div>
              </div>
            </section>
          )}

          {/* Short Analysis */}
          {report.short_analysis && !report.in_depth_analysis && (
            <section>
              <div className="flex items-center gap-2 mb-4">
                <svg className="w-5 h-5 text-emerald-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <h2 className="text-lg font-semibold text-gray-900">Summary</h2>
              </div>

              <div className="bg-white rounded-xl border border-gray-200 p-5 md:p-6">
                <div className="prose prose-sm max-w-none prose-p:text-gray-600 prose-p:text-sm prose-p:leading-relaxed">
                  <ReactMarkdown>{report.short_analysis}</ReactMarkdown>
                </div>
              </div>
            </section>
          )}

          {/* Footer */}
          <div className="text-center pt-4 border-t border-gray-100">
            <p className="text-xs text-gray-400">
              Report for {formatDate(report.report_date)}
            </p>
          </div>
        </div>
      )}
    </main>
  );
}
