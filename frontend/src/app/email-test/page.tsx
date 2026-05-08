'use client';

import { useState, useEffect, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { api } from '@/lib/api';
import { useAuth } from '@/contexts/AuthContext';
import { formatTimestamp } from '@/lib/timezone';

type EmailChannel = 'daily_report' | 'personal_digest' | 'weekly_report' | 'twitter_digest' | 'onboarding';

function EmailTestContent() {
  const searchParams = useSearchParams();
  const reportIdParam = searchParams.get('report_id');
  const digestIdParam = searchParams.get('digest_id');
  const weekParam = searchParams.get('week');
  const { user } = useAuth();

  // Active channel tab
  const [activeChannel, setActiveChannel] = useState<EmailChannel>(
    weekParam ? 'weekly_report' : digestIdParam ? 'personal_digest' : 'daily_report'
  );

  // Daily Report state
  const [emailHtml, setEmailHtml] = useState<string>('');
  const [reportInfo, setReportInfo] = useState<{ id: string; date: string } | null>(null);
  const [reportId, setReportId] = useState(reportIdParam || '');

  // Personal Digest state
  const [digestHtml, setDigestHtml] = useState<string>('');
  const [digestInfo, setDigestInfo] = useState<{
    id: string;
    date: string;
    userId: string;
    symbols: string[];
  } | null>(null);
  const [digestId, setDigestId] = useState(digestIdParam || '');

  // Weekly Report state
  const [weeklyHtml, setWeeklyHtml] = useState<string>('');
  const [weeklyInfo, setWeeklyInfo] = useState<{
    weekLabel: string;
    title: string;
    reportId: string;
    generatedAt: string;
  } | null>(null);
  const [weekLabel, setWeekLabel] = useState(weekParam || '');

  // Twitter Digest state
  const [twitterDigestHtml, setTwitterDigestHtml] = useState<string>('');
  const [twitterDigestInfo, setTwitterDigestInfo] = useState<{
    digestDate: string | null;
    inputTweetCount: number;
    trackedKolCount: number;
  } | null>(null);
  const [twitterDigestDate, setTwitterDigestDate] = useState('');

  // Onboarding state (-1 = welcome email, 0+ = drip days)
  const [onboardingHtml, setOnboardingHtml] = useState<string>('');
  const [onboardingDay, setOnboardingDay] = useState(-1);
  const [onboardingSubject, setOnboardingSubject] = useState('');
  const [onboardingDays, setOnboardingDays] = useState<number[]>([1, 3, 7, 11, 14]);

  // Common state
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<'preview' | 'html'>('preview');

  // Send test email state
  const [email, setEmail] = useState('');
  const [sending, setSending] = useState(false);
  const [sendResult, setSendResult] = useState<{ success: boolean; message: string } | null>(null);

  useEffect(() => {
    if (activeChannel === 'daily_report') {
      loadEmailPreview(reportIdParam || undefined, user?.name);
    } else if (activeChannel === 'personal_digest') {
      loadDigestPreview({ userId: user?.id, digestId: digestIdParam || undefined });
    } else if (activeChannel === 'weekly_report') {
      loadWeeklyPreview({ week: weekParam || undefined, firstName: user?.name });
    } else if (activeChannel === 'twitter_digest') {
      loadTwitterDigestPreview(twitterDigestDate || undefined);
    } else {
      loadOnboardingPreview(onboardingDay);
    }
  }, [reportIdParam, digestIdParam, weekParam, activeChannel, user?.name, user?.id]);

  const loadEmailPreview = async (id?: string, firstName?: string) => {
    setLoading(true);
    setError(null);
    try {
      const result = await api.getEmailPreview(id, firstName);
      setEmailHtml(result.html);
      setReportInfo({ id: result.report_id, date: result.report_date });
      setReportId(result.report_id);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load preview');
    } finally {
      setLoading(false);
    }
  };

  const loadDigestPreview = async (params?: { userId?: string; digestId?: string }) => {
    setLoading(true);
    setError(null);
    try {
      const result = await api.getDigestPreview(params);
      setDigestHtml(result.html);
      setDigestInfo({
        id: result.digest_id,
        date: result.digest_date,
        userId: result.user_id,
        symbols: result.symbols,
      });
      setDigestId(result.digest_id);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load digest preview');
    } finally {
      setLoading(false);
    }
  };

  const loadWeeklyPreview = async (params?: { week?: string; firstName?: string }) => {
    setLoading(true);
    setError(null);
    try {
      const result = await api.getWeeklyPreview(params);
      setWeeklyHtml(result.html);
      setWeeklyInfo({
        weekLabel: result.week_label,
        title: result.title,
        reportId: result.report_id,
        generatedAt: result.generated_at,
      });
      setWeekLabel(result.week_label);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load weekly report preview');
    } finally {
      setLoading(false);
    }
  };

  const loadTwitterDigestPreview = async (date?: string) => {
    setLoading(true);
    setError(null);
    try {
      const result = await api.getTwitterDigestPreview(date);
      setTwitterDigestHtml(result.html);
      setTwitterDigestInfo({
        digestDate: result.digest_date,
        inputTweetCount: result.input_tweet_count,
        trackedKolCount: result.tracked_kol_count,
      });
      if (result.digest_date) setTwitterDigestDate(result.digest_date);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load twitter digest preview');
    } finally {
      setLoading(false);
    }
  };

  const loadOnboardingPreview = async (day: number = -1) => {
    setLoading(true);
    setError(null);
    try {
      if (day === -1) {
        // Welcome email
        const result = await api.getWelcomePreview({ firstName: user?.name, email: user?.email });
        setOnboardingHtml(result.html);
        setOnboardingSubject(result.subject);
        setOnboardingDay(-1);
      } else {
        const result = await api.getOnboardingPreview(day, user?.name);
        setOnboardingHtml(result.html);
        setOnboardingSubject(result.subject);
        setOnboardingDay(result.day);
        if (result.valid_days) setOnboardingDays(result.valid_days);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load onboarding preview');
    } finally {
      setLoading(false);
    }
  };

  const sendTestEmail = async () => {
    if (!email) {
      setSendResult({ success: false, message: '请输入邮箱地址' });
      return;
    }

    setSending(true);
    setSendResult(null);
    try {
      if (activeChannel === 'daily_report') {
        const result = await api.sendReportEmail(email);
        setSendResult({
          success: result.success,
          message: result.success
            ? `邮件已发送至 ${result.sent_to}`
            : result.message || '发送失败',
        });
      } else if (activeChannel === 'weekly_report') {
        const result = await api.sendWeeklyReportEmail(email);
        setSendResult({
          success: result.success,
          message: result.success
            ? `周报已发送至 ${result.sent_to}`
            : result.message || '发送失败',
        });
      } else if (activeChannel === 'personal_digest') {
        setSendResult({
          success: false,
          message: '个人摘要暂不支持发送测试，请使用广播功能。',
        });
      } else if (activeChannel === 'twitter_digest') {
        setSendResult({
          success: false,
          message: '推特日报邮件发送链路尚未实现，仅支持预览。',
        });
      } else {
        setSendResult({
          success: false,
          message: 'Onboarding 邮件暂不支持发送测试，请通过 cron 端点触发。',
        });
      }
    } catch (err) {
      setSendResult({
        success: false,
        message: err instanceof Error ? err.message : '发送失败',
      });
    } finally {
      setSending(false);
    }
  };

  const handleChannelChange = (channel: EmailChannel) => {
    setActiveChannel(channel);
    setError(null);
    setSendResult(null);
    if (channel === 'daily_report') {
      loadEmailPreview(reportId || undefined, user?.name);
    } else if (channel === 'personal_digest') {
      loadDigestPreview({ userId: user?.id, digestId: digestId || undefined });
    } else if (channel === 'weekly_report') {
      loadWeeklyPreview({ week: weekLabel || undefined, firstName: user?.name });
    } else if (channel === 'twitter_digest') {
      loadTwitterDigestPreview(twitterDigestDate || undefined);
    } else {
      loadOnboardingPreview(onboardingDay);
    }
  };

  const handleRefresh = () => {
    if (activeChannel === 'daily_report') {
      loadEmailPreview(reportId || undefined, user?.name);
    } else if (activeChannel === 'personal_digest') {
      loadDigestPreview({ userId: user?.id, digestId: digestId || undefined });
    } else if (activeChannel === 'weekly_report') {
      loadWeeklyPreview({ week: weekLabel || undefined, firstName: user?.name });
    } else if (activeChannel === 'twitter_digest') {
      loadTwitterDigestPreview(twitterDigestDate || undefined);
    } else {
      loadOnboardingPreview(onboardingDay);
    }
  };

  const currentHtml =
    activeChannel === 'daily_report'
      ? emailHtml
      : activeChannel === 'personal_digest'
        ? digestHtml
        : activeChannel === 'weekly_report'
          ? weeklyHtml
          : activeChannel === 'twitter_digest'
            ? twitterDigestHtml
            : onboardingHtml;

  const channelLabel =
    activeChannel === 'daily_report'
      ? 'Daily Report'
      : activeChannel === 'personal_digest'
        ? 'Personal Digest'
        : activeChannel === 'weekly_report'
          ? 'Weekly Report'
          : activeChannel === 'twitter_digest'
            ? 'Twitter KOL Digest'
            : onboardingDay === -1
              ? 'Welcome Email'
              : `Onboarding (Day ${onboardingDay})`;

  return (
    <main className="min-h-screen bg-gray-50">
      {/* Header */}
      <section className="bg-white border-b border-gray-100">
        <div className="max-w-6xl mx-auto px-4 md:px-6 py-6">
          <div className="flex items-center justify-between">
            <div>
              <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-50 text-amber-700 text-xs font-medium mb-2">
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                </svg>
                Email Testing
              </div>
              <h1 className="text-xl font-semibold text-gray-900">Email Template Preview</h1>
              <p className="text-sm text-gray-500 mt-1">
                Preview and test email templates (rendered by backend)
              </p>
            </div>
            <button
              onClick={handleRefresh}
              disabled={loading}
              className="inline-flex items-center gap-2 px-4 py-2 bg-white border border-gray-200 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 transition-colors"
            >
              <svg className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
              刷新
            </button>
          </div>

          {/* Channel Tabs */}
          <div className="flex gap-2 mt-4">
            <button
              onClick={() => handleChannelChange('daily_report')}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                activeChannel === 'daily_report'
                  ? 'bg-primary/10 text-primary border-primary/30'
                  : 'bg-gray-50 text-gray-600 border border-gray-200 hover:bg-gray-100'
              }`}
            >
              <div className="flex items-center gap-2">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
                Daily Report
              </div>
            </button>
            <button
              onClick={() => handleChannelChange('personal_digest')}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                activeChannel === 'personal_digest'
                  ? 'bg-primary/10 text-primary border-primary/30'
                  : 'bg-gray-50 text-gray-600 border border-gray-200 hover:bg-gray-100'
              }`}
            >
              <div className="flex items-center gap-2">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                </svg>
                Personal Digest
              </div>
            </button>
            <button
              onClick={() => handleChannelChange('weekly_report')}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                activeChannel === 'weekly_report'
                  ? 'bg-primary/10 text-primary border-primary/30'
                  : 'bg-gray-50 text-gray-600 border border-gray-200 hover:bg-gray-100'
              }`}
            >
              <div className="flex items-center gap-2">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
                Weekly Report
              </div>
            </button>
            <button
              onClick={() => handleChannelChange('twitter_digest')}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                activeChannel === 'twitter_digest'
                  ? 'bg-primary/10 text-primary border-primary/30'
                  : 'bg-gray-50 text-gray-600 border border-gray-200 hover:bg-gray-100'
              }`}
            >
              <div className="flex items-center gap-2">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                </svg>
                Twitter Digest
              </div>
            </button>
            <button
              onClick={() => handleChannelChange('onboarding')}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                activeChannel === 'onboarding'
                  ? 'bg-primary/10 text-primary border-primary/30'
                  : 'bg-gray-50 text-gray-600 border border-gray-200 hover:bg-gray-100'
              }`}
            >
              <div className="flex items-center gap-2">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                </svg>
                Onboarding
              </div>
            </button>
          </div>
        </div>
      </section>

      <div className="max-w-6xl mx-auto px-4 md:px-6 py-6">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left Panel - Controls */}
          <div className="lg:col-span-1 space-y-4">
            {/* Send Test Card */}
            <div className="bg-white rounded-xl border border-gray-200 p-5">
              <h2 className="text-sm font-semibold text-gray-900 mb-4">发送测试邮件</h2>
              <div className="space-y-4">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1.5">
                    收件人邮箱
                  </label>
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="test@example.com"
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm text-gray-900 bg-white placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
                  />
                </div>
                <button
                  onClick={sendTestEmail}
                  disabled={sending || !email}
                  className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  {sending ? (
                    <>
                      <svg className="w-4 h-4 animate-spin" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                      </svg>
                      发送中...
                    </>
                  ) : (
                    <>
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
                      </svg>
                      发送测试邮件
                    </>
                  )}
                </button>

                {sendResult && (
                  <div
                    className={`p-3 rounded-lg text-sm ${
                      sendResult.success
                        ? 'bg-primary/10 text-primary border border-primary/20'
                        : 'bg-red-50 text-red-700 border border-red-100'
                    }`}
                  >
                    {sendResult.message}
                  </div>
                )}
              </div>
            </div>

            {/* Info Card */}
            <div className="bg-white rounded-xl border border-gray-200 p-5">
              <h2 className="text-sm font-semibold text-gray-900 mb-4">
                {activeChannel === 'daily_report' ? 'Report Info' : activeChannel === 'personal_digest' ? 'Digest Info' : activeChannel === 'weekly_report' ? 'Weekly Report Info' : activeChannel === 'twitter_digest' ? 'Twitter Digest Info' : 'Onboarding Info'}
              </h2>
              {loading ? (
                <div className="flex items-center gap-2 text-gray-400 text-sm">
                  <div className="w-4 h-4 rounded-full border-2 border-gray-200 border-t-gray-400 animate-spin" />
                  加载中...
                </div>
              ) : error ? (
                <p className="text-sm text-red-500">{error}</p>
              ) : activeChannel === 'daily_report' && reportInfo ? (
                <div className="space-y-3 text-sm">
                  <div className="flex justify-between">
                    <span className="text-gray-500">Report Date</span>
                    <span className="text-gray-900 font-medium">{reportInfo.date}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-500">Report ID</span>
                    <span className="text-gray-900 font-medium font-mono text-xs">
                      {reportInfo.id.slice(0, 8)}...
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-500">Source</span>
                    <span className="text-primary font-medium">Backend API</span>
                  </div>
                </div>
              ) : activeChannel === 'personal_digest' && digestInfo ? (
                <div className="space-y-3 text-sm">
                  <div className="flex justify-between">
                    <span className="text-gray-500">Digest Date</span>
                    <span className="text-gray-900 font-medium">{digestInfo.date}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-500">Digest ID</span>
                    <span className="text-gray-900 font-medium font-mono text-xs">
                      {digestInfo.id.slice(0, 8)}...
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-500">User ID</span>
                    <span className="text-gray-900 font-medium font-mono text-xs">
                      {digestInfo.userId.slice(0, 8)}...
                    </span>
                  </div>
                  <div>
                    <span className="text-gray-500 block mb-1">Symbols</span>
                    <div className="flex flex-wrap gap-1">
                      {digestInfo.symbols.map((sym) => (
                        <span
                          key={sym}
                          className="px-2 py-0.5 bg-primary/10 text-primary rounded text-xs font-medium"
                        >
                          {sym}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>
              ) : activeChannel === 'weekly_report' && weeklyInfo ? (
                <div className="space-y-3 text-sm">
                  <div className="flex justify-between">
                    <span className="text-gray-500">Week</span>
                    <span className="text-gray-900 font-medium">{weeklyInfo.weekLabel}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-500">Title</span>
                    <span className="text-gray-900 font-medium text-xs">{weeklyInfo.title}</span>
                  </div>
                  {weeklyInfo.reportId && (
                    <div className="flex justify-between">
                      <span className="text-gray-500">Report ID</span>
                      <span className="text-gray-900 font-medium font-mono text-xs">
                        {weeklyInfo.reportId.slice(0, 8)}...
                      </span>
                    </div>
                  )}
                  <div className="flex justify-between">
                    <span className="text-gray-500">Generated</span>
                    <span className="text-gray-900 font-medium text-xs">
                      {weeklyInfo.generatedAt ? formatTimestamp(weeklyInfo.generatedAt) : '-'}
                    </span>
                  </div>
                </div>
              ) : activeChannel === 'twitter_digest' && twitterDigestInfo ? (
                <div className="space-y-3 text-sm">
                  <div className="flex justify-between">
                    <span className="text-gray-500">Digest Date</span>
                    <span className="text-gray-900 font-medium">{twitterDigestInfo.digestDate || '-'}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-500">Input Tweets</span>
                    <span className="text-gray-900 font-medium">{twitterDigestInfo.inputTweetCount}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-500">Tracked KOLs</span>
                    <span className="text-gray-900 font-medium">{twitterDigestInfo.trackedKolCount}</span>
                  </div>
                </div>
              ) : activeChannel === 'onboarding' ? (
                <div className="space-y-3 text-sm">
                  <div className="flex justify-between">
                    <span className="text-gray-500">Type</span>
                    <span className="text-gray-900 font-medium">
                      {onboardingDay === -1 ? 'Welcome' : `Day ${onboardingDay}`}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-500">Subject</span>
                    <span className="text-gray-900 font-medium text-xs">{onboardingSubject}</span>
                  </div>
                </div>
              ) : (
                <p className="text-sm text-gray-400">暂无数据</p>
              )}

              {/* Load Specific Report/Digest/Weekly */}
              <div className="mt-4 pt-4 border-t border-gray-100">
                {activeChannel === 'daily_report' ? (
                  <>
                    <label className="block text-xs font-medium text-gray-600 mb-1.5">
                      Load Specific Report
                    </label>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={reportId}
                        onChange={(e) => setReportId(e.target.value)}
                        placeholder="Report ID (UUID)"
                        className="flex-1 px-2 py-1.5 border border-gray-200 rounded text-xs font-mono text-gray-900 bg-white placeholder:text-gray-400 focus:outline-none focus:ring-1 focus:ring-primary"
                      />
                      <button
                        onClick={() => loadEmailPreview(reportId || undefined, user?.name)}
                        disabled={loading}
                        className="px-3 py-1.5 bg-gray-100 text-gray-700 rounded text-xs font-medium hover:bg-gray-200 disabled:opacity-50"
                      >
                        Load
                      </button>
                    </div>
                  </>
                ) : activeChannel === 'personal_digest' ? (
                  <>
                    <label className="block text-xs font-medium text-gray-600 mb-1.5">
                      Logged-in User
                    </label>
                    <div className="px-3 py-2 bg-gray-50 rounded text-xs mb-3">
                      {user ? (
                        <div className="space-y-1">
                          <div className="font-medium text-gray-900">{user.name || 'No name'}</div>
                          <div className="text-gray-500 font-mono">{user.email}</div>
                        </div>
                      ) : (
                        <div className="text-gray-500">Not logged in - please sign in to preview your digest</div>
                      )}
                    </div>
                    <label className="block text-xs font-medium text-gray-600 mb-1.5">
                      Load Specific Digest (optional)
                    </label>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={digestId}
                        onChange={(e) => setDigestId(e.target.value)}
                        placeholder="Digest ID (UUID)"
                        className="flex-1 px-2 py-1.5 border border-gray-200 rounded text-xs font-mono text-gray-900 bg-white placeholder:text-gray-400 focus:outline-none focus:ring-1 focus:ring-primary"
                      />
                      <button
                        onClick={() => loadDigestPreview({ userId: user?.id, digestId: digestId || undefined })}
                        disabled={loading || !digestId}
                        className="px-3 py-1.5 bg-gray-100 text-gray-700 rounded text-xs font-medium hover:bg-gray-200 disabled:opacity-50"
                      >
                        Load
                      </button>
                    </div>
                  </>
                ) : activeChannel === 'twitter_digest' ? (
                  <>
                    <label className="block text-xs font-medium text-gray-600 mb-1.5">
                      Load Specific Date
                    </label>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={twitterDigestDate}
                        onChange={(e) => setTwitterDigestDate(e.target.value)}
                        placeholder="YYYY-MM-DD"
                        className="flex-1 px-2 py-1.5 border border-gray-200 rounded text-xs font-mono text-gray-900 bg-white placeholder:text-gray-400 focus:outline-none focus:ring-1 focus:ring-primary"
                      />
                      <button
                        onClick={() => loadTwitterDigestPreview(twitterDigestDate || undefined)}
                        disabled={loading}
                        className="px-3 py-1.5 bg-gray-100 text-gray-700 rounded text-xs font-medium hover:bg-gray-200 disabled:opacity-50"
                      >
                        Load
                      </button>
                    </div>
                    <p className="text-xs text-gray-400 mt-2">留空加载最新一期</p>
                  </>
                ) : activeChannel === 'weekly_report' ? (
                  <>
                    <label className="block text-xs font-medium text-gray-600 mb-1.5">
                      Load Specific Week
                    </label>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={weekLabel}
                        onChange={(e) => setWeekLabel(e.target.value)}
                        placeholder="e.g. 2025.W06"
                        className="flex-1 px-2 py-1.5 border border-gray-200 rounded text-xs font-mono text-gray-900 bg-white placeholder:text-gray-400 focus:outline-none focus:ring-1 focus:ring-primary"
                      />
                      <button
                        onClick={() => loadWeeklyPreview({ week: weekLabel || undefined, firstName: user?.name })}
                        disabled={loading}
                        className="px-3 py-1.5 bg-gray-100 text-gray-700 rounded text-xs font-medium hover:bg-gray-200 disabled:opacity-50"
                      >
                        Load
                      </button>
                    </div>
                  </>
                ) : (
                  <>
                    <label className="block text-xs font-medium text-gray-600 mb-1.5">
                      Select Email
                    </label>
                    <div className="flex flex-wrap gap-2">
                      <button
                        onClick={() => { setOnboardingDay(-1); loadOnboardingPreview(-1); }}
                        disabled={loading}
                        className={`px-3 py-1.5 rounded text-xs font-medium transition-colors ${
                          onboardingDay === -1
                            ? 'bg-primary text-white'
                            : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                        } disabled:opacity-50`}
                      >
                        Welcome
                      </button>
                      {onboardingDays.map((d) => (
                        <button
                          key={d}
                          onClick={() => { setOnboardingDay(d); loadOnboardingPreview(d); }}
                          disabled={loading}
                          className={`px-3 py-1.5 rounded text-xs font-medium transition-colors ${
                            onboardingDay === d
                              ? 'bg-primary text-white'
                              : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                          } disabled:opacity-50`}
                        >
                          Day {d}
                        </button>
                      ))}
                    </div>
                  </>
                )}
              </div>
            </div>

            {/* View Mode Toggle */}
            <div className="bg-white rounded-xl border border-gray-200 p-5">
              <h2 className="text-sm font-semibold text-gray-900 mb-4">查看模式</h2>
              <div className="flex gap-2">
                <button
                  onClick={() => setViewMode('preview')}
                  className={`flex-1 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                    viewMode === 'preview'
                      ? 'bg-primary/10 text-primary border-primary/30'
                      : 'bg-gray-50 text-gray-600 border border-gray-200 hover:bg-gray-100'
                  }`}
                >
                  预览
                </button>
                <button
                  onClick={() => setViewMode('html')}
                  className={`flex-1 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                    viewMode === 'html'
                      ? 'bg-primary/10 text-primary border-primary/30'
                      : 'bg-gray-50 text-gray-600 border border-gray-200 hover:bg-gray-100'
                  }`}
                >
                  HTML 源码
                </button>
              </div>
            </div>
          </div>

          {/* Right Panel - Email Preview */}
          <div className="lg:col-span-2">
            <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
              {/* Preview Header */}
              <div className="px-5 py-3 bg-gray-50 border-b border-gray-200 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="flex items-center gap-1.5">
                    <div className="w-3 h-3 rounded-full bg-red-400" />
                    <div className="w-3 h-3 rounded-full bg-yellow-400" />
                    <div className="w-3 h-3 rounded-full bg-green-400" />
                  </div>
                  <span className="text-xs text-gray-500">
                    {viewMode === 'preview' ? `${channelLabel} Preview` : 'HTML Source'}
                  </span>
                </div>
                {viewMode === 'html' && currentHtml && (
                  <button
                    onClick={() => {
                      navigator.clipboard.writeText(currentHtml);
                      alert('HTML copied to clipboard!');
                    }}
                    className="text-xs text-gray-500 hover:text-gray-700 flex items-center gap-1"
                  >
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                    </svg>
                    Copy
                  </button>
                )}
              </div>

              {/* Preview Content */}
              <div className="max-h-[700px] overflow-y-auto">
                {loading ? (
                  <div className="flex flex-col items-center justify-center py-20 text-gray-400">
                    <div className="w-8 h-8 rounded-full border-2 border-gray-200 border-t-gray-400 animate-spin mb-3" />
                    <p className="text-sm">Loading email preview from backend...</p>
                  </div>
                ) : error ? (
                  <div className="flex flex-col items-center justify-center py-20 text-red-400">
                    <svg className="w-12 h-12 mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                    </svg>
                    <p className="text-sm font-medium">{error}</p>
                    <p className="text-xs text-gray-400 mt-1">
                      {activeChannel === 'personal_digest'
                        ? 'Make sure you have generated a digest for this user'
                        : activeChannel === 'weekly_report'
                          ? 'Make sure a weekly report has been generated'
                          : activeChannel === 'twitter_digest'
                            ? 'Make sure /api/twitter-digest/generate has run at least once'
                            : 'Make sure the backend is running'}
                    </p>
                  </div>
                ) : viewMode === 'preview' ? (
                  <div dangerouslySetInnerHTML={{ __html: currentHtml }} />
                ) : (
                  <pre className="p-4 text-xs text-gray-700 bg-gray-50 overflow-x-auto whitespace-pre-wrap font-mono">
                    {currentHtml}
                  </pre>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}

export default function EmailTestPage() {
  return (
    <Suspense
      fallback={
        <main className="min-h-screen bg-gray-50 flex items-center justify-center">
          <div className="text-gray-500">Loading...</div>
        </main>
      }
    >
      <EmailTestContent />
    </Suspense>
  );
}
