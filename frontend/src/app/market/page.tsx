'use client';

import { useState, useEffect, useMemo } from 'react';
import ReactMarkdown from 'react-markdown';
import { api, MarketData, CalendarEvent } from '@/lib/api';
import { saveMarketReport } from '@/lib/insforge';
import { getCurrentUser, User } from '@/lib/auth';

const CACHE_KEY = 'market_analysis_cache';

// Asset category definitions
const ASSET_CATEGORIES = {
  indices: {
    label: 'Indices',
    icon: (
      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
      </svg>
    ),
    items: ['S&P 500', 'Nasdaq', 'Dow Jones', 'Russell 2000', 'S&P 400'],
  },
  bonds: {
    label: 'Bonds',
    icon: (
      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
      </svg>
    ),
    items: ['3M Treasury', '5Y Treasury', '10Y Treasury', '30Y Treasury'],
  },
  commodities: {
    label: 'Commodities',
    icon: (
      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
      </svg>
    ),
    items: ['Gold (GLD)', 'Oil (USO)'],
  },
  other: {
    label: 'Other',
    icon: (
      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 10h16M4 14h16M4 18h16" />
      </svg>
    ),
    items: ['VIX', 'US Dollar', 'HYG', 'LQD', 'XLF', 'KRE'],
  },
};

type CategoryKey = keyof typeof ASSET_CATEGORIES;

interface CachedData {
  data: MarketData;
  cachedAt: string;
}

interface IndexData {
  name: string;
  value: number;
  change_percent?: number;
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

// Helper to get relative time
function getRelativeTime(dateString: string): string {
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return 'just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  return `${diffDays}d ago`;
}

// Group calendar events by date
function groupEventsByDate(events: CalendarEvent[]): Record<string, CalendarEvent[]> {
  return events.reduce((acc, event) => {
    const dateKey = event.date.split('T')[0];
    if (!acc[dateKey]) {
      acc[dateKey] = [];
    }
    acc[dateKey].push(event);
    return acc;
  }, {} as Record<string, CalendarEvent[]>);
}

export default function MarketPage() {
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<MarketData | null>(null);
  const [cachedAt, setCachedAt] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sendingEmail, setSendingEmail] = useState(false);
  const [emailStatus, setEmailStatus] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [activeCategory, setActiveCategory] = useState<CategoryKey>('indices');
  const [analysisExpanded, setAnalysisExpanded] = useState(false);

  useEffect(() => {
    const cached = loadFromCache();
    if (cached) {
      setData(cached.data);
      setCachedAt(cached.cachedAt);
    }
    getCurrentUser().then(setUser);
  }, []);

  // Filter indices by category
  const filteredIndices = useMemo(() => {
    if (!data?.indices) return [];
    const categoryItems = ASSET_CATEGORIES[activeCategory].items;
    return data.indices.filter((index: IndexData) =>
      categoryItems.some((item) => index.name.toLowerCase().includes(item.toLowerCase().split(' ')[0]))
    );
  }, [data?.indices, activeCategory]);

  // Group calendar events
  const groupedEvents = useMemo(() => {
    if (!data?.calendar) return {};
    return groupEventsByDate(data.calendar);
  }, [data?.calendar]);

  // Calculate market sentiment from indices
  const marketSentiment = useMemo(() => {
    if (!data?.indices) return null;
    const mainIndices = data.indices.filter((idx: IndexData) =>
      ['S&P 500', 'Nasdaq', 'Dow Jones'].some((name) => idx.name.includes(name))
    );
    if (mainIndices.length === 0) return null;

    const avgChange = mainIndices.reduce((sum: number, idx: IndexData) => sum + (idx.change_percent || 0), 0) / mainIndices.length;
    const vix = data.indices.find((idx: IndexData) => idx.name.includes('VIX'));

    return {
      trend: avgChange > 0.5 ? 'bullish' : avgChange < -0.5 ? 'bearish' : 'neutral',
      avgChange,
      vix: vix?.value,
      vixLevel: vix ? (vix.value < 15 ? 'low' : vix.value < 25 ? 'medium' : 'high') : null,
    };
  }, [data?.indices]);

  const handleAnalyze = async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await api.getMarketAnalysis();
      setData(result);
      saveToCache(result);
      setCachedAt(new Date().toISOString());

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
    if (!user?.email) {
      setEmailStatus({ type: 'error', message: 'Please sign in to send email reports' });
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
  };

  return (
    <main className="min-h-screen bg-background">
      {/* Compact Header */}
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
                <h1 className="text-xl font-bold text-foreground">Market Analysis</h1>
                {cachedAt && !loading && (
                  <p className="text-xs text-muted-foreground">
                    Updated {getRelativeTime(cachedAt)}
                  </p>
                )}
              </div>
            </div>

            {/* Action Buttons */}
            <div className="flex items-center gap-2">
              <button
                onClick={handleAnalyze}
                disabled={loading || sendingEmail}
                className="px-4 py-2 bg-emerald-600 text-white rounded-lg font-medium text-sm transition-all hover:bg-emerald-500 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 glow-emerald-sm"
              >
                {loading ? (
                  <>
                    <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                    </svg>
                    Analyzing...
                  </>
                ) : (
                  <>
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                    </svg>
                    {data ? 'Refresh' : 'Generate'}
                  </>
                )}
              </button>

              {data && (
                <button
                  onClick={handleSendEmail}
                  disabled={loading || sendingEmail}
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

      {/* Loading */}
      {loading && (
        <div className="max-w-5xl mx-auto px-4 md:px-6 py-16">
          <div className="flex flex-col items-center justify-center gap-4">
            <div className="w-12 h-12 rounded-full border-3 border-emerald-500/20 border-t-emerald-500 animate-spin" />
            <p className="text-muted-foreground">Analyzing global markets...</p>
          </div>
        </div>
      )}

      {/* Main Content */}
      {data && !loading && (
        <div className="max-w-5xl mx-auto px-4 md:px-6 py-6 space-y-6">
          {/* Market Pulse - Quick Overview */}
          {marketSentiment && (
            <section className="animate-fade-in-up">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {/* Sentiment Card */}
                <div className="bg-card rounded-xl border border-border p-4">
                  <p className="text-xs text-muted-foreground mb-2">Market Sentiment</p>
                  <div className="flex items-center gap-2">
                    <span className={`w-3 h-3 rounded-full ${
                      marketSentiment.trend === 'bullish' ? 'bg-emerald-500' :
                      marketSentiment.trend === 'bearish' ? 'bg-red-500' : 'bg-yellow-500'
                    }`} />
                    <span className="text-lg font-semibold text-foreground capitalize">
                      {marketSentiment.trend}
                    </span>
                    <span className={`text-sm ${marketSentiment.avgChange >= 0 ? 'text-emerald-500' : 'text-red-500'}`}>
                      ({marketSentiment.avgChange >= 0 ? '+' : ''}{marketSentiment.avgChange.toFixed(2)}%)
                    </span>
                  </div>
                </div>

                {/* VIX Card */}
                {marketSentiment.vix && (
                  <div className="bg-card rounded-xl border border-border p-4">
                    <p className="text-xs text-muted-foreground mb-2">Fear Index (VIX)</p>
                    <div className="flex items-center gap-2">
                      <span className="text-lg font-semibold text-foreground">
                        {marketSentiment.vix.toFixed(2)}
                      </span>
                      <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                        marketSentiment.vixLevel === 'low' ? 'bg-emerald-500/10 text-emerald-500' :
                        marketSentiment.vixLevel === 'high' ? 'bg-red-500/10 text-red-500' :
                        'bg-yellow-500/10 text-yellow-500'
                      }`}>
                        {marketSentiment.vixLevel?.toUpperCase()}
                      </span>
                    </div>
                  </div>
                )}

                {/* Title/Summary Card */}
                {data.title && (
                  <div className="bg-card rounded-xl border border-border p-4 md:col-span-1">
                    <p className="text-xs text-muted-foreground mb-2">Today&apos;s Theme</p>
                    <p className="text-sm font-medium text-foreground line-clamp-2">
                      {data.title}
                    </p>
                  </div>
                )}
              </div>
            </section>
          )}

          {/* Asset Categories Tabs */}
          <section className="animate-fade-in-up delay-100">
            <div className="flex items-center gap-2 mb-4 overflow-x-auto pb-2">
              {(Object.keys(ASSET_CATEGORIES) as CategoryKey[]).map((key) => (
                <button
                  key={key}
                  onClick={() => setActiveCategory(key)}
                  className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all whitespace-nowrap ${
                    activeCategory === key
                      ? 'bg-emerald-500 text-white'
                      : 'bg-secondary text-muted-foreground hover:text-foreground hover:bg-secondary/80'
                  }`}
                >
                  {ASSET_CATEGORIES[key].icon}
                  {ASSET_CATEGORIES[key].label}
                </button>
              ))}
            </div>

            {/* Index Cards */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {filteredIndices.length > 0 ? (
                filteredIndices.map((index: IndexData, idx: number) => (
                  <div
                    key={index.name}
                    className="bg-card rounded-xl border border-border p-4 hover:border-emerald-500/50 hover-glow transition-all animate-stagger-fade-in"
                    style={{ animationDelay: `${idx * 50}ms` }}
                  >
                    <p className="text-xs text-muted-foreground font-medium mb-2 truncate">
                      {index.name}
                    </p>
                    <p className="text-xl font-bold text-foreground mb-1">
                      {index.value?.toLocaleString(undefined, { maximumFractionDigits: 2 })}
                    </p>
                    {index.change_percent !== undefined && (
                      <div className={`flex items-center gap-1 text-sm font-semibold ${
                        index.change_percent >= 0 ? 'text-emerald-500' : 'text-red-500'
                      }`}>
                        <svg
                          className={`w-4 h-4 ${index.change_percent >= 0 ? '' : 'rotate-180'}`}
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 10l7-7m0 0l7 7m-7-7v18" />
                        </svg>
                        {index.change_percent >= 0 ? '+' : ''}{index.change_percent.toFixed(2)}%
                      </div>
                    )}
                  </div>
                ))
              ) : (
                <div className="col-span-full text-center py-8 text-muted-foreground">
                  No data available for this category
                </div>
              )}
            </div>
          </section>

          {/* Analysis Section */}
          {data.in_depth_analysis && (
            <section className="animate-fade-in-up delay-200">
              <div className="bg-card rounded-xl border border-border overflow-hidden">
                {/* Header */}
                <button
                  onClick={() => setAnalysisExpanded(!analysisExpanded)}
                  className="w-full px-5 py-4 flex items-center justify-between hover:bg-secondary/50 transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-lg bg-emerald-500/10 dark:bg-emerald-500/20 flex items-center justify-center">
                      <svg className="w-4 h-4 text-emerald-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                      </svg>
                    </div>
                    <div className="text-left">
                      <h2 className="text-base font-semibold text-foreground">In-Depth Analysis</h2>
                      <p className="text-xs text-muted-foreground">AI-generated market report</p>
                    </div>
                  </div>
                  <svg
                    className={`w-5 h-5 text-muted-foreground transition-transform ${analysisExpanded ? 'rotate-180' : ''}`}
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </button>

                {/* Content */}
                <div className={`overflow-hidden transition-all duration-300 ${analysisExpanded ? 'max-h-[2000px]' : 'max-h-0'}`}>
                  <div className="px-5 pb-5">
                    <div className="prose prose-sm max-w-none prose-headings:text-foreground prose-headings:font-semibold prose-p:text-muted-foreground prose-strong:text-foreground prose-a:text-emerald-500 prose-ul:text-muted-foreground prose-li:text-muted-foreground dark:prose-invert">
                      <ReactMarkdown
                        components={{
                          a: ({ href, children }) => (
                            <a href={href} target="_blank" rel="noopener noreferrer" className="transition-colors">
                              {children}
                            </a>
                          ),
                        }}
                      >
                        {data.in_depth_analysis}
                      </ReactMarkdown>
                    </div>
                  </div>
                </div>

                {/* Preview when collapsed */}
                {!analysisExpanded && data.summary && (
                  <div className="px-5 pb-4">
                    <p className="text-sm text-muted-foreground line-clamp-2">
                      {data.summary}
                    </p>
                  </div>
                )}
              </div>
            </section>
          )}

          {/* Events Calendar - Grouped by Date */}
          {data.calendar && data.calendar.length > 0 && (
            <section className="animate-fade-in-up delay-300">
              <div className="flex items-center gap-2 mb-4">
                <div className="w-8 h-8 rounded-lg bg-emerald-500/10 dark:bg-emerald-500/20 flex items-center justify-center">
                  <svg className="w-4 h-4 text-emerald-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                  </svg>
                </div>
                <h2 className="text-base font-semibold text-foreground">Key Events</h2>
                <span className="text-xs text-muted-foreground">({data.calendar.length} events)</span>
              </div>

              <div className="space-y-4">
                {Object.entries(groupedEvents).map(([dateKey, events]) => {
                  const date = new Date(dateKey);
                  const isToday = new Date().toDateString() === date.toDateString();

                  return (
                    <div key={dateKey} className="flex gap-4">
                      {/* Date Column */}
                      <div className={`flex-shrink-0 w-16 text-center py-2 rounded-lg ${
                        isToday ? 'bg-emerald-500/10 border border-emerald-500/20' : 'bg-secondary'
                      }`}>
                        <p className={`text-xs font-medium uppercase ${isToday ? 'text-emerald-500' : 'text-muted-foreground'}`}>
                          {date.toLocaleDateString('en-US', { month: 'short' })}
                        </p>
                        <p className={`text-xl font-bold ${isToday ? 'text-emerald-500' : 'text-foreground'}`}>
                          {date.getDate()}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {date.toLocaleDateString('en-US', { weekday: 'short' })}
                        </p>
                      </div>

                      {/* Events */}
                      <div className="flex-1 space-y-2">
                        {events.map((event: CalendarEvent, idx: number) => (
                          <div
                            key={idx}
                            className="bg-card rounded-lg border border-border p-3 hover:border-emerald-500/50 transition-all"
                          >
                            <h3 className="font-medium text-foreground text-sm">{event.event}</h3>
                            <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{event.analysis}</p>
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>
          )}
        </div>
      )}

      {/* Empty State */}
      {!data && !loading && !error && (
        <div className="max-w-5xl mx-auto px-4 md:px-6 py-16">
          <div className="text-center space-y-5">
            <div className="w-20 h-20 mx-auto rounded-2xl bg-muted border border-border flex items-center justify-center">
              <svg className="w-10 h-10 text-muted-foreground" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
              </svg>
            </div>
            <div>
              <h3 className="text-lg font-semibold text-foreground mb-2">Ready to Analyze</h3>
              <p className="text-muted-foreground max-w-sm mx-auto">
                Click the Generate button to create a comprehensive AI-powered market analysis report.
              </p>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
