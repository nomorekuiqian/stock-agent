'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { api } from '@/lib/api';
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
  const router = useRouter();
  const [report, setReport] = useState<MarketReport | null>(null);
  const [isToday, setIsToday] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [historicalReports, setHistoricalReports] = useState<MarketReport[]>([]);
  const [totalReports, setTotalReports] = useState(0);

  // Subscription state
  const [isSubscribed, setIsSubscribed] = useState(false);
  const [subscriptionLoading, setSubscriptionLoading] = useState(false);
  const [subscriptionStatus, setSubscriptionStatus] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  // Generate state (dev only)
  const [generating, setGenerating] = useState(false);
  const [sendingEmail, setSendingEmail] = useState(false);
  const [emailStatus, setEmailStatus] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const isDev = process.env.NODE_ENV === 'development';

  // Check subscription status
  const checkSubscriptionStatus = useCallback(async (email: string) => {
    try {
      const result = await api.subscriptions.getStatus('daily_report', email);
      setIsSubscribed(result.subscribed);
    } catch {
      // Ignore errors - assume not subscribed
      setIsSubscribed(false);
    }
  }, []);

  // Load report and historical reports on mount
  useEffect(() => {
    loadReport();
    loadHistoricalReports();
    getCurrentUser().then((u) => {
      setUser(u);
      if (u?.email) {
        checkSubscriptionStatus(u.email);
      }
    });
  }, [checkSubscriptionStatus]);

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

  async function handleSubscribe() {
    if (!user?.email) {
      // Redirect to login page if user is not logged in
      router.push('/login?redirect=/today');
      return;
    }

    setSubscriptionLoading(true);
    setSubscriptionStatus(null);
    try {
      const result = await api.subscriptions.subscribe('daily_report', {
        email: user.email,
        user_id: user.id,
        first_name: user.name,
      });
      if (result.success) {
        setIsSubscribed(true);
        setSubscriptionStatus({ type: 'success', message: 'Subscribed to daily reports!' });
      } else {
        setSubscriptionStatus({ type: 'error', message: result.error || 'Failed to subscribe' });
      }
    } catch (err) {
      setSubscriptionStatus({ type: 'error', message: err instanceof Error ? err.message : 'Failed to subscribe' });
    } finally {
      setSubscriptionLoading(false);
    }
  }

  async function handleUnsubscribe() {
    if (!user?.email) return;

    setSubscriptionLoading(true);
    setSubscriptionStatus(null);
    try {
      const result = await api.subscriptions.unsubscribe('daily_report', user.email);
      if (result.success) {
        setIsSubscribed(false);
        setSubscriptionStatus({ type: 'success', message: 'Unsubscribed successfully' });
      } else {
        setSubscriptionStatus({ type: 'error', message: result.error || 'Failed to unsubscribe' });
      }
    } catch (err) {
      setSubscriptionStatus({ type: 'error', message: err instanceof Error ? err.message : 'Failed to unsubscribe' });
    } finally {
      setSubscriptionLoading(false);
    }
  }

  // Force generate new report (dev only)
  async function handleGenerate() {
    setGenerating(true);
    setError(null);
    try {
      const data = await api.getMarketAnalysis(true); // force=true
      const newReport: MarketReport = {
        id: data.report_id || '',
        report_date: todayStr(),
        timestamp: data.timestamp,
        title: data.title || '',
        summary: data.summary || '',
        intro: data.intro || '',
        macro: data.macro,
        news: data.news,
        report_summary: data.report_summary || '',
        calendar: data.calendar || [],
        indices: data.indices,
      };
      setReport(newReport);
      setIsToday(true);
      // Reload historical reports list
      loadHistoricalReports();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to generate report');
    } finally {
      setGenerating(false);
    }
  }

  // Send report to user's email (dev only)
  async function handleSendEmail() {
    if (!user?.email) {
      router.push('/login?redirect=/today');
      return;
    }

    setSendingEmail(true);
    setEmailStatus(null);
    try {
      await api.sendReportEmail(user.email);
      setEmailStatus({ type: 'success', message: `Sent to ${user.email}` });
    } catch (err) {
      setEmailStatus({ type: 'error', message: err instanceof Error ? err.message : 'Failed to send' });
    } finally {
      setSendingEmail(false);
    }
  }

  return (
    <main className="min-h-screen bg-background">
      {/* Page Header */}
      <section className="border-b border-border/50">
        <div className="max-w-5xl mx-auto px-4 md:px-6 py-8 md:py-12">
          <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
            {/* Title Section */}
            <div className="space-y-3">
              {/* Section Label */}
              <div className="flex items-center gap-2">
                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                  每日分析
                </span>
                {report && !loading && !isToday && (
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-amber-500/10 text-amber-400 border border-amber-500/20">
                    历史报告
                  </span>
                )}
              </div>

              {/* Main Title */}
              <h1 className="text-3xl md:text-4xl font-editorial text-foreground tracking-tight">
                今日日报
              </h1>

              {/* Subtitle */}
              <p className="text-muted-foreground text-sm md:text-base max-w-lg">
                AI 驱动的市场分析,提供可操作的投资洞察,助力明智决策
              </p>
            </div>

            {/* Action Buttons */}
            <div className="flex items-center gap-3">
              {/* Subscribe button */}
              <button
                onClick={isSubscribed ? handleUnsubscribe : handleSubscribe}
                disabled={subscriptionLoading}
                className={`px-4 py-2.5 rounded-lg font-medium text-sm border transition-all flex items-center gap-2 group ${
                  isSubscribed
                    ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20 hover:bg-red-500/10 hover:text-red-400 hover:border-red-500/20'
                    : 'bg-card text-foreground border-border/50 hover:border-emerald-500/30'
                } disabled:opacity-50 disabled:cursor-not-allowed`}
              >
                {subscriptionLoading ? (
                  <>
                    <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                    </svg>
                  </>
                ) : isSubscribed ? (
                  <>
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M5 13l4 4L19 7" />
                    </svg>
                    <span>已订阅</span>
                  </>
                ) : (
                  <>
                    <svg className="w-4 h-4 text-muted-foreground group-hover:text-emerald-400 transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
                    </svg>
                    <span>订阅</span>
                  </>
                )}
              </button>

              {/* Send to Email button (requires login) */}
              {user && (
                <button
                  onClick={handleSendEmail}
                  disabled={sendingEmail || loading || !report}
                  className="px-4 py-2.5 bg-card text-foreground rounded-lg font-medium text-sm border border-border/50 transition-all hover:border-emerald-500/30 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                >
                  {sendingEmail ? (
                    <>
                      <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                      </svg>
                      <span>发送中...</span>
                    </>
                  ) : (
                    <>
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                      </svg>
                      <span>发送邮件</span>
                    </>
                  )}
                </button>
              )}

              {/* Dev only: Generate button */}
              {isDev && (
                <button
                  onClick={handleGenerate}
                  disabled={generating || loading}
                  className="px-5 py-2.5 bg-emerald-600 text-white rounded-lg font-medium text-sm transition-all hover:bg-emerald-500 hover:shadow-lg hover:shadow-emerald-500/20 disabled:opacity-50 disabled:cursor-not-allowed disabled:shadow-none flex items-center gap-2"
                >
                  {generating ? (
                    <>
                      <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                      </svg>
                      <span>生成中...</span>
                    </>
                  ) : (
                    <>
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                      </svg>
                      <span>生成报告</span>
                    </>
                  )}
                </button>
              )}
            </div>
          </div>

          {/* Subscription Status */}
          {subscriptionStatus && (
            <div className={`mt-4 inline-flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-medium ${
              subscriptionStatus.type === 'success'
                ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                : 'bg-red-500/10 text-red-400 border border-red-500/20'
            }`}>
              {subscriptionStatus.type === 'success' ? (
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              ) : (
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              )}
              {subscriptionStatus.message}
            </div>
          )}

          {/* Email Send Status */}
          {emailStatus && (
            <div className={`mt-4 ml-2 inline-flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-medium ${
              emailStatus.type === 'success'
                ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                : 'bg-red-500/10 text-red-400 border border-red-500/20'
            }`}>
              {emailStatus.type === 'success' ? (
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              ) : (
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              )}
              {emailStatus.message}
            </div>
          )}
        </div>
      </section>

      {/* Error */}
      {error && (
        <div className="max-w-5xl mx-auto px-4 md:px-6 py-4">
          <div className="p-4 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-sm text-center">
            {error}
          </div>
        </div>
      )}

      {/* Loading State */}
      {loading && (
        <div className="max-w-5xl mx-auto px-4 md:px-6 py-20">
          <div className="flex flex-col items-center justify-center gap-4">
            <div className="w-10 h-10 rounded-full border-2 border-emerald-500/20 border-t-emerald-500 animate-spin" />
            <p className="text-muted-foreground text-sm">加载市场数据...</p>
          </div>
        </div>
      )}

      {/* Report Content */}
      {!loading && report && (
        <div className="max-w-5xl mx-auto px-4 md:px-6 py-8 space-y-8">
          {/* Report Header */}
          <section className="animate-fade-in-up">
            {/* Date & Time */}
            <div className="flex items-center gap-3 mb-4">
              <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-card border border-border/50">
                <svg className="w-4 h-4 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
                <span className="text-sm font-data text-foreground">{formatDateChinese(report.report_date)}</span>
              </div>
              {report.timestamp && (
                <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-card border border-border/50">
                  <svg className="w-4 h-4 text-muted-foreground" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <span className="text-sm font-data text-muted-foreground">{formatTimePacific(report.timestamp)}</span>
                </div>
              )}
            </div>

            {/* Title */}
            {report.title && (
              <h2 className="text-2xl md:text-3xl font-editorial text-foreground leading-tight">
                {report.title}
              </h2>
            )}

            {/* Summary */}
            {report.summary && (
              <p className="text-muted-foreground mt-3 leading-relaxed">
                {report.summary}
              </p>
            )}
          </section>

          {/* Shared Report Content Component */}
          <ReportContent
            indices={report.indices as IndexData[] | undefined}
            intro={report.intro}
            macro={report.macro}
            news={report.news}
            report_summary={report.report_summary}
            calendar={report.calendar}
            showTimestamp={false}
          />
        </div>
      )}

      {/* Empty State - No reports at all */}
      {!loading && !report && !error && (
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
      )}

      {/* Historical Reports Section */}
      {historicalReports.length > 0 && (
        <section className="border-t border-border/50 mt-12">
          <div className="max-w-5xl mx-auto px-4 md:px-6 py-10">
            {/* Section Header */}
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

            {/* Report Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4">
              {historicalReports.map((r) => (
                <Link
                  key={r.id}
                  href={`/today/${r.id}`}
                  className="group terminal-card p-4 hover:border-emerald-500/30 transition-all"
                >
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-xs font-data text-emerald-400 bg-emerald-500/10 px-2 py-1 rounded">
                      {formatDateShort(r.report_date)}
                    </span>
                    <svg className="w-4 h-4 text-muted-foreground group-hover:text-emerald-400 transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                    </svg>
                  </div>
                  <h4 className="text-sm font-medium text-foreground line-clamp-2 group-hover:text-emerald-400 transition-colors leading-snug">
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
