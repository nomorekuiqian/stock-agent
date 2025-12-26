'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { api, CalendarEvent } from '@/lib/api';
import { getReportByDate, getLatestReport, getReportsList, MarketReport } from '@/lib/insforge';
import { ReportContent } from '@/components/ReportContent';
import { getCurrentUser, User } from '@/lib/auth';
import { todayStr, formatDateChinese, formatTimePacific, formatDateShort } from '@/lib/timezone';

interface IndexData {
  name: string;
  value: number;
  change_percent?: number;
}

export default function TodayPage() {
  const [report, setReport] = useState<MarketReport | null>(null);
  const [isToday, setIsToday] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [sendingEmail, setSendingEmail] = useState(false);
  const [emailStatus, setEmailStatus] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [historicalReports, setHistoricalReports] = useState<MarketReport[]>([]);
  const [totalReports, setTotalReports] = useState(0);

  // Load report and historical reports on mount
  useEffect(() => {
    loadReport();
    loadHistoricalReports();
    getCurrentUser().then(setUser);
  }, []);

  async function loadHistoricalReports() {
    try {
      const result = await getReportsList(6, 0);
      // Filter out today's report from historical list
      const today = todayStr();
      const filtered = result.data.filter(r => r.report_date !== today);
      setHistoricalReports(filtered.slice(0, 5));
      setTotalReports(result.total);
    } catch (err) {
      console.error('Failed to load historical reports:', err);
    }
  }

  async function loadReport() {
    setLoading(true);
    setError(null);
    try {
      const today = todayStr();

      // Try to get today's report first
      const todayReport = await getReportByDate(today);
      if (todayReport) {
        setReport(todayReport);
        setIsToday(true);
        setLoading(false);
        return;
      }

      // Fall back to latest report
      const latestReport = await getLatestReport();
      if (latestReport) {
        setReport(latestReport);
        setIsToday(latestReport.report_date === today);
      }
    } catch (err) {
      console.error('Failed to load report:', err);
      setError('Failed to load report');
    } finally {
      setLoading(false);
    }
  }

  async function handleSendEmail() {
    if (!user?.email) {
      setEmailStatus({ type: 'error', message: 'Please login to send email report' });
      return;
    }

    setSendingEmail(true);
    setEmailStatus(null);
    try {
      const result = await api.sendReportEmail(user.email);
      setEmailStatus({ type: 'success', message: `Report sent to ${result.sent_to}` });
    } catch (err) {
      setEmailStatus({ type: 'error', message: err instanceof Error ? err.message : 'Failed to send email' });
    } finally {
      setSendingEmail(false);
    }
  }

  return (
    <main className="min-h-screen bg-background">
      {/* Header */}
      <section className="border-b border-border">
        <div className="max-w-5xl mx-auto px-4 md:px-6 py-4">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            {/* Title + Status */}
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-emerald-500/10 dark:bg-emerald-500/20 flex items-center justify-center">
                <svg className="w-5 h-5 text-emerald-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
                </svg>
              </div>
              <div>
                <h1 className="text-xl font-bold text-foreground">Market Dashboard</h1>
                {/* Status indicator */}
                {report && !loading && (
                  <div className="flex items-center gap-2 mt-0.5">
                    {isToday ? (
                      <span className="inline-flex items-center gap-1.5 text-xs text-emerald-600 dark:text-emerald-400">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                        Today&apos;s Report
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1.5 text-xs text-amber-600 dark:text-amber-400">
                        <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
                        Historical Report ({formatDateChinese(report.report_date)})
                      </span>
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* Action Buttons */}
            <div className="flex items-center gap-2">
              {/* Email button */}
              {report && (
                <button
                  onClick={handleSendEmail}
                  disabled={sendingEmail}
                  className="px-4 py-2 bg-secondary text-foreground rounded-lg font-medium text-sm border border-border transition-all hover:bg-secondary/80 hover:border-emerald-500/50 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                >
                  {sendingEmail ? (
                    <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                    </svg>
                  ) : (
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                    </svg>
                  )}
                  Email
                </button>
              )}
            </div>
          </div>

          {/* Email Status */}
          {emailStatus && (
            <div className={`mt-3 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium ${
              emailStatus.type === 'success'
                ? 'bg-emerald-500/10 text-emerald-500 border border-emerald-500/20'
                : 'bg-red-500/10 text-red-500 border border-red-500/20'
            }`}>
              {emailStatus.message}
            </div>
          )}

        </div>
      </section>

      {/* Error */}
      {error && (
        <div className="max-w-5xl mx-auto px-4 md:px-6 py-4">
          <div className="p-4 rounded-xl bg-red-500/10 border border-red-500/20 text-red-500 text-sm text-center">
            {error}
          </div>
        </div>
      )}

      {/* Loading State */}
      {loading && (
        <div className="max-w-5xl mx-auto px-4 md:px-6 py-16">
          <div className="flex flex-col items-center justify-center gap-4">
            <div className="w-12 h-12 rounded-full border-3 border-emerald-500/20 border-t-emerald-500 animate-spin" />
            <p className="text-muted-foreground">Loading market data...</p>
          </div>
        </div>
      )}

      {/* Report Content */}
      {!loading && report && (
        <div className="max-w-5xl mx-auto px-4 md:px-6 py-6 space-y-6">
          {/* Report Header */}
          <section className="animate-fade-in-up">
            <div className="flex items-center gap-2 text-xs text-muted-foreground mb-2">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
              <span>{formatDateChinese(report.report_date)}</span>
              {report.timestamp && (
                <>
                  <span className="text-muted-foreground/50">|</span>
                  <span>{formatTimePacific(report.timestamp)}</span>
                </>
              )}
            </div>
            {report.title && (
              <h2 className="text-xl md:text-2xl font-bold text-foreground">
                {report.title}
              </h2>
            )}
            {report.summary && (
              <p className="text-sm text-muted-foreground mt-2">
                {report.summary}
              </p>
            )}
          </section>

          {/* Shared Report Content Component */}
          <ReportContent
            indices={report.indices as IndexData[] | undefined}
            // New structured fields
            quickTake={report.quick_take}
            marketNarrative={report.market_narrative}
            macro={report.macro}
            news={report.news}
            conclusion={report.conclusion}
            calendar={report.calendar as CalendarEvent[] | undefined}
            // Legacy field for backward compatibility
            inDepthAnalysis={report.in_depth_analysis}
            showTimestamp={false}
          />
        </div>
      )}

      {/* Empty State - No reports at all */}
      {!loading && !report && !error && (
        <div className="max-w-5xl mx-auto px-4 md:px-6 py-16">
          <div className="text-center space-y-5">
            <div className="w-20 h-20 mx-auto rounded-2xl bg-muted border border-border flex items-center justify-center">
              <svg className="w-10 h-10 text-muted-foreground" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
              </svg>
            </div>
            <div>
              <h3 className="text-lg font-semibold text-foreground mb-2">No Reports Available</h3>
              <p className="text-muted-foreground max-w-sm mx-auto">
                Market reports are generated daily. Please check back later.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Historical Reports Section */}
      {historicalReports.length > 0 && (
        <section className="border-t border-border mt-8">
          <div className="max-w-5xl mx-auto px-4 md:px-6 py-8">
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-muted flex items-center justify-center">
                  <svg className="w-4 h-4 text-muted-foreground" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
                  </svg>
                </div>
                <div>
                  <h3 className="text-lg font-semibold text-foreground">Historical Reports</h3>
                  <p className="text-xs text-muted-foreground">{totalReports} reports available</p>
                </div>
              </div>
              <Link
                href="/today/archive"
                className="text-sm text-emerald-600 dark:text-emerald-400 hover:underline flex items-center gap-1"
              >
                View all
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </Link>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4">
              {historicalReports.map((r) => (
                <Link
                  key={r.id}
                  href={`/today/${r.id}`}
                  className="group bg-card rounded-xl border border-border p-4 hover:border-emerald-500/50 hover-glow transition-all"
                >
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-xs font-medium text-muted-foreground bg-muted px-2 py-1 rounded">
                      {formatDateShort(r.report_date)}
                    </span>
                    <svg className="w-4 h-4 text-muted-foreground group-hover:text-emerald-500 transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                    </svg>
                  </div>
                  <h4 className="text-sm font-medium text-foreground line-clamp-2 group-hover:text-emerald-600 dark:group-hover:text-emerald-400 transition-colors">
                    {r.title || formatDateChinese(r.report_date)}
                  </h4>
                </Link>
              ))}
            </div>
          </div>
        </section>
      )}
    </main>
  );
}
