'use client';

import { useState, useEffect } from 'react';
import { api } from '@/lib/api';
import { getReportByDate, getLatestReport, MarketReport } from '@/lib/insforge';
import { ReportContent } from '@/components/ReportContent';
import { CalendarEvent } from '@/lib/api';
import { getCurrentUser, User } from '@/lib/auth';
import { todayStr, formatDateChinese, formatTimePacific } from '@/lib/timezone';

interface IndexData {
  name: string;
  value: number;
  change_percent?: number;
}

export default function MarketPage() {
  const [report, setReport] = useState<MarketReport | null>(null);
  const [isToday, setIsToday] = useState(false);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [sendingEmail, setSendingEmail] = useState(false);
  const [emailStatus, setEmailStatus] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  // Check if running in development environment
  const isDevelopment = process.env.NODE_ENV === 'development';

  // Load report on mount
  useEffect(() => {
    loadReport();
    getCurrentUser().then(setUser);
  }, []);

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

  async function handleGenerate(force: boolean = false) {
    setGenerating(true);
    setError(null);
    setEmailStatus(null);

    try {
      const result = await api.getMarketAnalysis(force);

      // Convert API response to MarketReport format
      const newReport: MarketReport = {
        id: result.report_id,
        report_date: todayStr(),
        timestamp: result.timestamp,
        // New structured fields
        title: result.title,
        summary: result.summary,
        quick_take: result.quick_take,
        market_narrative: result.market_narrative,
        macro: result.macro,
        news: result.news,
        conclusion: result.conclusion,
        calendar: result.calendar,
        // Legacy fields for backward compatibility
        short_analysis: result.short_analysis,
        in_depth_analysis: result.in_depth_analysis,
        // Raw data
        indices: result.indices,
        economic_calendar: result.economic_calendar,
        earnings_calendar: result.earnings_calendar,
        news_data: result.news_data,
        market_data: result.market_data,
      };

      // Update state directly - no redirect!
      setReport(newReport);
      setIsToday(true);
    } catch (err) {
      console.error('Failed to generate report:', err);
      setError('Failed to generate report. Please try again.');
    } finally {
      setGenerating(false);
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
              {/* Refresh button - only show if we have a report */}
              {report && !generating && (
                <button
                  onClick={() => loadReport()}
                  disabled={loading}
                  className="px-3 py-2 text-muted-foreground hover:text-foreground rounded-lg transition-colors disabled:opacity-50"
                  title="Refresh"
                >
                  <svg className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                  </svg>
                </button>
              )}

              {/* Generate button */}
              <button
                onClick={() => handleGenerate(false)}
                disabled={generating || sendingEmail}
                className="px-4 py-2 bg-emerald-600 text-white rounded-lg font-medium text-sm transition-all hover:bg-emerald-500 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 glow-emerald-sm"
              >
                {generating ? (
                  <>
                    <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                    </svg>
                    Generating...
                  </>
                ) : (
                  <>
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                    </svg>
                    {isToday ? 'Regenerate' : 'Generate Today'}
                  </>
                )}
              </button>

              {/* Force generate - dev only */}
              {isDevelopment && (
                <button
                  onClick={() => handleGenerate(true)}
                  disabled={generating || sendingEmail}
                  className="px-3 py-2 bg-amber-500/10 text-amber-600 dark:text-amber-400 rounded-lg font-medium text-xs border border-amber-500/20 transition-all hover:bg-amber-500/20 disabled:opacity-50"
                  title="Force generate (bypass cache)"
                >
                  Force
                </button>
              )}

              {/* Email button */}
              {report && (
                <button
                  onClick={handleSendEmail}
                  disabled={generating || sendingEmail}
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

          {/* Today's report not available banner */}
          {report && !isToday && !generating && (
            <div className="mt-4 p-3 rounded-lg bg-amber-500/10 border border-amber-500/20 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <svg className="w-4 h-4 text-amber-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <span className="text-sm text-amber-700 dark:text-amber-300">
                  Today&apos;s report not available yet. Showing latest report from {formatDateChinese(report.report_date)}.
                </span>
              </div>
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

      {/* Generating Overlay - shows while generating but keeps content visible */}
      {generating && report && (
        <div className="max-w-5xl mx-auto px-4 md:px-6 py-4">
          <div className="p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center gap-3">
            <div className="w-5 h-5 rounded-full border-2 border-emerald-500/30 border-t-emerald-500 animate-spin" />
            <span className="text-sm text-emerald-700 dark:text-emerald-300">
              Generating today&apos;s report... This may take 30-60 seconds.
            </span>
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
              <h3 className="text-lg font-semibold text-foreground mb-2">No Reports Yet</h3>
              <p className="text-muted-foreground max-w-sm mx-auto">
                Generate your first AI-powered market analysis report to get started.
              </p>
            </div>
            <button
              onClick={() => handleGenerate(false)}
              disabled={generating}
              className="inline-flex items-center gap-2 px-6 py-3 bg-emerald-600 text-white rounded-xl font-medium transition-all hover:bg-emerald-500 disabled:opacity-50 glow-emerald-sm"
            >
              {generating ? (
                <>
                  <svg className="w-5 h-5 animate-spin" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  Generating...
                </>
              ) : (
                <>
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                  </svg>
                  Generate Report
                </>
              )}
            </button>
          </div>
        </div>
      )}
    </main>
  );
}
