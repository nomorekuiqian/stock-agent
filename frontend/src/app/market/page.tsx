'use client';

import { useState, useEffect } from 'react';
import { api, MarketData } from '@/lib/api';
import { saveMarketReport } from '@/lib/insforge';
import { getCurrentUser, User } from '@/lib/auth';
import { ReportContent } from '@/components/ReportContent';

const CACHE_KEY = 'market_analysis_cache';

interface CachedData {
  data: MarketData;
  cachedAt: string;
}

function loadFromCache(): CachedData | null {
  if (typeof window === 'undefined') return null;
  try {
    const cached = localStorage.getItem(CACHE_KEY);
    if (cached) {
      return JSON.parse(cached);
    }
  } catch {
    // Ignore parse errors
  }
  return null;
}

function saveToCache(data: MarketData): void {
  if (typeof window === 'undefined') return;
  const cacheData: CachedData = {
    data,
    cachedAt: new Date().toISOString(),
  };
  localStorage.setItem(CACHE_KEY, JSON.stringify(cacheData));
}

export default function MarketPage() {
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<MarketData | null>(null);
  const [cachedAt, setCachedAt] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sendingEmail, setSendingEmail] = useState(false);
  const [emailStatus, setEmailStatus] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [user, setUser] = useState<User | null>(null);

  useEffect(() => {
    const cached = loadFromCache();
    if (cached) {
      setData(cached.data);
      setCachedAt(cached.cachedAt);
    }

    // Load current user
    getCurrentUser().then(setUser);
  }, []);

  const handleAnalyze = async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await api.getMarketAnalysis();
      setData(result);
      saveToCache(result);
      setCachedAt(new Date().toISOString());

      // Save to Insforge database
      const reportDate = new Date(result.timestamp).toISOString().split('T')[0];
      const saveResult = await saveMarketReport({
        report_date: reportDate,
        timestamp: result.timestamp,
        short_analysis: result.short_analysis,
        in_depth_analysis: result.in_depth_analysis,
        title: result.title,
        summary: result.summary,
        calendar: result.calendar,
        indices: result.indices,
        economic_calendar: result.economic_calendar,
        earnings_calendar: result.earnings_calendar,
        news_data: result.news_data,
        market_data: result.market_data,
      });

      if (saveResult.success) {
        console.log('Report saved to database:', reportDate);
      } else {
        console.error('Failed to save report:', saveResult.error);
      }
    } catch {
      setError('Failed to fetch market analysis. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleSendEmail = async () => {
    // Check if user is logged in
    if (!user?.email) {
      setEmailStatus({
        type: 'error',
        message: 'Please sign in to send email reports',
      });
      return;
    }

    setSendingEmail(true);
    setEmailStatus(null);
    try {
      const result = await api.sendReportEmail(user.email);
      setEmailStatus({
        type: 'success',
        message: `Report sent to ${result.sent_to}`,
      });
    } catch (err) {
      setEmailStatus({
        type: 'error',
        message: err instanceof Error ? err.message : 'Failed to send email',
      });
    } finally {
      setSendingEmail(false);
    }
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
  };

  const formatTime = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  return (
    <main className="min-h-screen bg-white">
      {/* Hero Section */}
      <section className="border-b border-gray-100">
        <div className="max-w-5xl mx-auto px-4 md:px-6 py-8 md:py-12">
          <div className="text-center space-y-4">
            {/* Badge */}
            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-50 text-emerald-700 text-xs font-medium">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
              AI-Powered Analysis
            </div>

            {/* Main Title */}
            <h1 className="text-2xl md:text-3xl font-semibold tracking-tight text-gray-900">
              Market Intelligence
            </h1>

            {/* Subtitle */}
            <p className="text-sm md:text-base text-gray-500 max-w-lg mx-auto">
              Real-time market analysis powered by AI. Stay ahead with comprehensive insights.
            </p>

            {/* Action Buttons */}
            <div className="flex flex-col sm:flex-row items-center justify-center gap-3 pt-2">
              <button
                onClick={handleAnalyze}
                disabled={loading || sendingEmail}
                className="px-5 py-2.5 bg-emerald-600 text-white rounded-lg font-medium text-sm transition-all hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
              >
                {loading ? (
                  <>
                    <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                    </svg>
                    Analyzing...
                  </>
                ) : data ? (
                  'Refresh Analysis'
                ) : (
                  'Generate Report'
                )}
              </button>

              {data && (
                <button
                  onClick={handleSendEmail}
                  disabled={loading || sendingEmail}
                  className="px-5 py-2.5 bg-gray-100 text-gray-700 rounded-lg font-medium text-sm transition-all hover:bg-gray-200 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                  title={user?.email ? `Send to ${user.email}` : 'Sign in to send email'}
                >
                  {sendingEmail ? (
                    <>
                      <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                      </svg>
                      Sending...
                    </>
                  ) : (
                    <>
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                      </svg>
                      {user?.email ? 'Send to My Email' : 'Send Email'}
                    </>
                  )}
                </button>
              )}
            </div>

            {/* Status Messages */}
            <div className="space-y-1.5">
              {cachedAt && !loading && (
                <p className="text-xs text-gray-400">
                  Last updated: {formatDate(cachedAt)} at {formatTime(cachedAt)}
                </p>
              )}
              {emailStatus && (
                <div className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium ${
                  emailStatus.type === 'success'
                    ? 'bg-green-50 text-green-700'
                    : 'bg-red-50 text-red-700'
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
          </div>
        </div>
      </section>

      {/* Error Message */}
      {error && (
        <div className="max-w-5xl mx-auto px-4 md:px-6 py-4">
          <div className="p-3 rounded-lg bg-red-50 border border-red-100 text-red-600 text-sm text-center">
            {error}
          </div>
        </div>
      )}

      {/* Loading State */}
      {loading && (
        <div className="max-w-5xl mx-auto px-4 md:px-6 py-12">
          <div className="flex flex-col items-center justify-center gap-3">
            <div className="w-10 h-10 rounded-full border-3 border-emerald-100 border-t-emerald-600 animate-spin" />
            <p className="text-gray-500 text-sm">Analyzing global markets...</p>
          </div>
        </div>
      )}

      {/* Content */}
      {data && !loading && (
        <div className="max-w-5xl mx-auto px-4 md:px-6 py-8">
          <ReportContent
            indices={data.indices}
            inDepthAnalysis={data.in_depth_analysis}
            calendar={data.calendar}
            timestamp={data.timestamp}
            showTimestamp={true}
          />
        </div>
      )}

      {/* Empty State */}
      {!data && !loading && !error && (
        <div className="max-w-5xl mx-auto px-4 md:px-6 py-12">
          <div className="text-center space-y-4">
            <div className="w-16 h-16 mx-auto rounded-2xl bg-gray-50 flex items-center justify-center">
              <svg className="w-8 h-8 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
              </svg>
            </div>
            <div>
              <h3 className="text-base font-semibold text-gray-900 mb-1">Ready to Analyze</h3>
              <p className="text-sm text-gray-500 max-w-sm mx-auto">
                Click the button above to generate a comprehensive AI-powered market analysis report.
              </p>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
