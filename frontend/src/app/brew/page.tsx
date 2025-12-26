'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Coffee } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { api, DigestResponse, StockAnalysis, BrewNews, BrewEvent, UserPreferences, InvestmentStyle, ContentFocus } from '@/lib/api';
import { getUserWatchlist, saveUserWatchlist, getUserDigests, UserDigest } from '@/lib/insforge';
import { formatDateChinese, formatTimePacific, formatCalendarDate, isTodayPacific, formatDateShort } from '@/lib/timezone';

// Investment style options
const STYLE_OPTIONS: { value: InvestmentStyle; label: string; description: string }[] = [
  { value: 'trader', label: 'Short-term', description: 'Daily/weekly' },
  { value: 'swing', label: 'Swing', description: '1-4 weeks' },
  { value: 'long_term', label: 'Long-term', description: 'Fundamentals' },
];

// Content focus options
const FOCUS_OPTIONS: { value: ContentFocus; label: string }[] = [
  { value: 'earnings', label: 'Earnings' },
  { value: 'macro', label: 'Macro' },
  { value: 'industry', label: 'Industry' },
  { value: 'technical', label: 'Technical' },
  { value: 'deals', label: 'M&A' },
];

// Default preferences
const DEFAULT_PREFERENCES: UserPreferences = {
  style: 'long_term',
  focus: ['earnings', 'macro'],
};

// Popular symbols
const POPULAR_SYMBOLS = ['AAPL', 'MSFT', 'NVDA', 'TSLA', 'GOOGL', 'META', 'AMZN', 'AMD'];

export default function BrewPage() {
  const router = useRouter();
  const { user, isLoading: authLoading, isAuthenticated } = useAuth();

  const [symbols, setSymbols] = useState<string[]>([]);
  const [newSymbol, setNewSymbol] = useState('');
  const [loading, setLoading] = useState(false);
  const [loadingWatchlist, setLoadingWatchlist] = useState(true);
  const [digest, setDigest] = useState<DigestResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [history, setHistory] = useState<UserDigest[]>([]);
  const [totalHistory, setTotalHistory] = useState(0);

  // UI state
  const [showSettings, setShowSettings] = useState(true);
  const [preferences, setPreferences] = useState<UserPreferences>(DEFAULT_PREFERENCES);

  // Redirect to login if not authenticated
  useEffect(() => {
    if (!authLoading && !isAuthenticated) {
      router.push('/login?redirect=/brew');
    }
  }, [authLoading, isAuthenticated, router]);

  // Load user's watchlist, preferences and history
  useEffect(() => {
    const loadUserData = async () => {
      if (!user?.id) return;

      setLoadingWatchlist(true);
      try {
        // Load watchlist and preferences
        const watchlist = await getUserWatchlist(user.id);
        if (watchlist?.symbols) {
          setSymbols(watchlist.symbols);
        }
        if (watchlist?.preferences) {
          setPreferences(watchlist.preferences as UserPreferences);
        }

        // Load history
        const historyResult = await getUserDigests(user.id, 10, 0);
        if (historyResult.data) {
          setHistory(historyResult.data);
          setTotalHistory(historyResult.total);

          // Load the latest digest if available
          if (historyResult.data.length > 0) {
            loadHistoricalDigest(historyResult.data[0]);
          }
        }
      } catch (err) {
        console.error('Failed to load user data:', err);
      } finally {
        setLoadingWatchlist(false);
      }
    };

    if (user?.id) {
      loadUserData();
    }
  }, [user?.id]);

  const handleAddSymbol = () => {
    const symbol = newSymbol.trim().toUpperCase();
    if (symbol && !symbols.includes(symbol)) {
      const newSymbols = [...symbols, symbol];
      setSymbols(newSymbols);
      setNewSymbol('');
      if (user?.id) {
        saveUserWatchlist(user.id, newSymbols, preferences);
      }
    }
  };

  const handleRemoveSymbol = (symbolToRemove: string) => {
    const newSymbols = symbols.filter((s) => s !== symbolToRemove);
    setSymbols(newSymbols);
    if (user?.id) {
      saveUserWatchlist(user.id, newSymbols, preferences);
    }
  };

  const handleStyleChange = (style: InvestmentStyle) => {
    const newPrefs = { ...preferences, style };
    setPreferences(newPrefs);
    if (user?.id) {
      saveUserWatchlist(user.id, symbols, newPrefs);
    }
  };

  const handleFocusToggle = (focus: ContentFocus) => {
    let newFocus: ContentFocus[];
    if (preferences.focus.includes(focus)) {
      newFocus = preferences.focus.filter(f => f !== focus);
      if (newFocus.length === 0) return;
    } else {
      if (preferences.focus.length >= 3) {
        newFocus = [...preferences.focus.slice(1), focus];
      } else {
        newFocus = [...preferences.focus, focus];
      }
    }
    const newPrefs = { ...preferences, focus: newFocus };
    setPreferences(newPrefs);
    if (user?.id) {
      saveUserWatchlist(user.id, symbols, newPrefs);
    }
  };

  const handleGenerateDigest = async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await api.generateDigest(symbols, preferences, user?.id);
      setDigest(result);

      // Refresh history
      if (user?.id) {
        const historyResult = await getUserDigests(user.id, 10, 0);
        if (historyResult.data) {
          setHistory(historyResult.data);
          setTotalHistory(historyResult.total);
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to generate digest');
    } finally {
      setLoading(false);
    }
  };

  const loadHistoricalDigest = (historyItem: UserDigest) => {
    const brewData = historyItem.brew_data || {};
    const digestFromHistory: DigestResponse = {
      success: true,
      timestamp: historyItem.created_at || '',
      symbols_used: historyItem.symbols,
      greeting: historyItem.greeting || '',
      one_line_summary: historyItem.one_line_summary || '',
      stocks: brewData.stocks || [],
      news: brewData.news || [],
      events: brewData.events || [],
      macro_impact: brewData.macro_impact || null,
      bottom_line: historyItem.bottom_line || historyItem.analysis || '',
    };
    setDigest(digestFromHistory);
  };

  const getStatusColor = (status: string) => {
    if (status.includes('up') || status.includes('strong') || status.includes('rise')) {
      return 'text-emerald-500 bg-emerald-500/10';
    } else if (status.includes('down') || status.includes('weak') || status.includes('fall')) {
      return 'text-red-500 bg-red-500/10';
    }
    return 'text-muted-foreground bg-secondary';
  };

  const getRiskColor = (riskLevel: string) => {
    const level = riskLevel.toLowerCase();
    if (level.includes('low')) return 'text-emerald-500';
    if (level.includes('medium') || level.includes('moderate')) return 'text-amber-500';
    if (level.includes('high')) return 'text-red-500';
    return 'text-muted-foreground';
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleAddSymbol();
    }
  };

  // Show loading while checking auth
  if (authLoading) {
    return (
      <main className="min-h-screen bg-background">
        <div className="max-w-5xl mx-auto px-4 md:px-6 py-16">
          <div className="flex flex-col items-center justify-center gap-4">
            <div className="w-12 h-12 rounded-full border-3 border-emerald-500/20 border-t-emerald-500 animate-spin" />
            <p className="text-muted-foreground">Loading...</p>
          </div>
        </div>
      </main>
    );
  }

  if (!isAuthenticated) {
    return null;
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
                <Coffee className="w-5 h-5 text-emerald-500" strokeWidth={2} />
              </div>
              <div>
                <h1 className="text-xl font-bold text-foreground">My Brew</h1>
                <div className="flex items-center gap-2 mt-0.5">
                  {symbols.length > 0 ? (
                    <span className="inline-flex items-center gap-1.5 text-xs text-emerald-600 dark:text-emerald-400">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                      {symbols.length} stocks tracked
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
                      <span className="w-1.5 h-1.5 rounded-full bg-muted-foreground" />
                      No watchlist
                    </span>
                  )}
                </div>
              </div>
            </div>

            {/* Action Buttons */}
            <div className="flex items-center gap-2">
              <button
                onClick={() => setShowSettings(!showSettings)}
                className={`px-3 py-2 rounded-lg font-medium text-sm transition-all flex items-center gap-2 ${
                  showSettings
                    ? 'bg-emerald-500 text-white'
                    : 'bg-secondary text-foreground hover:bg-secondary/80'
                }`}
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
                Settings
              </button>
              <button
                onClick={handleGenerateDigest}
                disabled={loading || symbols.length === 0}
                className="px-4 py-2 bg-emerald-600 text-white rounded-lg font-medium text-sm transition-all hover:bg-emerald-500 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
              >
                {loading ? (
                  <>
                    <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                    </svg>
                    Brewing...
                  </>
                ) : (
                  <>
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                    </svg>
                    Generate
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* Settings Panel (Collapsible) */}
      {showSettings && (
        <section className="border-b border-border bg-card/50">
          <div className="max-w-5xl mx-auto px-4 md:px-6 py-6">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Watchlist */}
              <div className="space-y-4">
                <div className="flex items-center gap-2">
                  <div className="w-1 h-4 bg-emerald-500 rounded-full" />
                  <h3 className="text-sm font-semibold text-foreground uppercase tracking-wider">Watchlist</h3>
                </div>

                {loadingWatchlist ? (
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <div className="w-4 h-4 rounded-full border-2 border-border border-t-emerald-500 animate-spin" />
                    <span className="text-sm">Loading...</span>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {/* Current symbols */}
                    <div className="flex flex-wrap gap-2">
                      {symbols.map((symbol) => (
                        <div
                          key={symbol}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 rounded-lg text-sm font-medium"
                        >
                          {symbol}
                          <button
                            onClick={() => handleRemoveSymbol(symbol)}
                            className="hover:text-emerald-700 dark:hover:text-emerald-300 transition-colors"
                          >
                            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                            </svg>
                          </button>
                        </div>
                      ))}
                      {symbols.length === 0 && (
                        <p className="text-sm text-muted-foreground">Add stocks to track</p>
                      )}
                    </div>

                    {/* Add input */}
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={newSymbol}
                        onChange={(e) => setNewSymbol(e.target.value.toUpperCase())}
                        onKeyDown={handleKeyDown}
                        placeholder="Enter symbol (e.g., AAPL)"
                        className="flex-1 px-3 py-2 border border-border bg-background rounded-lg text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
                      />
                      <button
                        onClick={handleAddSymbol}
                        disabled={!newSymbol.trim()}
                        className="px-4 py-2 bg-secondary text-foreground rounded-lg font-medium text-sm transition-all hover:bg-secondary/80 disabled:opacity-50"
                      >
                        Add
                      </button>
                    </div>

                    {/* Quick add */}
                    <div className="flex flex-wrap gap-1.5">
                      {POPULAR_SYMBOLS.filter(s => !symbols.includes(s)).slice(0, 6).map((symbol) => (
                        <button
                          key={symbol}
                          onClick={() => {
                            const newSymbols = [...symbols, symbol];
                            setSymbols(newSymbols);
                            if (user?.id) {
                              saveUserWatchlist(user.id, newSymbols, preferences);
                            }
                          }}
                          className="px-2 py-1 text-xs text-muted-foreground border border-border rounded hover:bg-secondary transition-colors"
                        >
                          +{symbol}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* Preferences */}
              <div className="space-y-4">
                <div className="flex items-center gap-2">
                  <div className="w-1 h-4 bg-emerald-500 rounded-full" />
                  <h3 className="text-sm font-semibold text-foreground uppercase tracking-wider">Preferences</h3>
                </div>

                {/* Investment Style */}
                <div>
                  <p className="text-xs text-muted-foreground mb-2">Investment Style</p>
                  <div className="flex flex-wrap gap-2">
                    {STYLE_OPTIONS.map((option) => (
                      <button
                        key={option.value}
                        onClick={() => handleStyleChange(option.value)}
                        className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${
                          preferences.style === option.value
                            ? 'bg-emerald-500 text-white'
                            : 'bg-secondary text-foreground hover:bg-secondary/80'
                        }`}
                      >
                        {option.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Focus Areas */}
                <div>
                  <p className="text-xs text-muted-foreground mb-2">Focus Areas (1-3)</p>
                  <div className="flex flex-wrap gap-2">
                    {FOCUS_OPTIONS.map((option) => (
                      <button
                        key={option.value}
                        onClick={() => handleFocusToggle(option.value)}
                        className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${
                          preferences.focus.includes(option.value)
                            ? 'bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30'
                            : 'bg-secondary text-muted-foreground hover:bg-secondary/80 border border-transparent'
                        }`}
                      >
                        {option.label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>
      )}

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
            <p className="text-muted-foreground">Analyzing your portfolio...</p>
          </div>
        </div>
      )}

      {/* Main Content */}
      {!loading && digest && (
        <div className="max-w-5xl mx-auto px-4 md:px-6 py-6 space-y-6">
          {/* Report Header */}
          <section className="animate-fade-in-up">
            <div className="flex items-center gap-2 text-xs text-muted-foreground mb-2">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
              <span>{formatDateChinese(digest.timestamp)}</span>
              <span className="text-muted-foreground/50">|</span>
              <span>{formatTimePacific(digest.timestamp)}</span>
            </div>
            <h2 className="text-xl md:text-2xl font-bold text-foreground">
              {digest.greeting}
            </h2>
            <p className="text-sm text-muted-foreground mt-2">
              {digest.one_line_summary}
            </p>
          </section>

          {/* Portfolio Overview */}
          {digest.stocks.length > 0 && (
            <section className="bg-card rounded-xl border border-border p-5 animate-fade-in-up">
              <div className="flex items-center gap-2 mb-4">
                <div className="w-1 h-4 bg-emerald-500 rounded-full" />
                <h3 className="text-sm font-semibold text-foreground uppercase tracking-wider">Portfolio Overview</h3>
              </div>
              <div className="divide-y divide-border">
                {digest.stocks.map((stock: StockAnalysis) => (
                  <div key={stock.symbol} className="py-4 first:pt-0 last:pb-0">
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-3">
                        <span className="font-semibold text-foreground">{stock.symbol}</span>
                        <span className="text-sm text-muted-foreground">{stock.name}</span>
                      </div>
                      <span className={`px-2 py-0.5 rounded text-xs font-medium ${getStatusColor(stock.status)}`}>
                        {stock.status}
                      </span>
                    </div>
                    <div className="flex items-center gap-4 text-sm mb-2">
                      <span className="text-foreground font-medium">${stock.price.toFixed(2)}</span>
                      <span className={stock.daily_change.startsWith('+') ? 'text-emerald-500' : 'text-red-500'}>
                        {stock.daily_change}
                      </span>
                      <span className="text-muted-foreground">|</span>
                      <span className={stock.week_change.startsWith('+') ? 'text-emerald-500' : 'text-red-500'}>
                        {stock.week_change} (week)
                      </span>
                    </div>
                    <p className="text-sm text-muted-foreground leading-relaxed">{stock.quick_take}</p>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* Related News */}
          {digest.news.length > 0 && (
            <section className="bg-card rounded-xl border border-border p-5 animate-fade-in-up">
              <div className="flex items-center gap-2 mb-4">
                <div className="w-1 h-4 bg-emerald-500 rounded-full" />
                <h3 className="text-sm font-semibold text-foreground uppercase tracking-wider">Related News</h3>
              </div>
              <div className="divide-y divide-border">
                {digest.news.map((item: BrewNews, index: number) => (
                  <div key={index} className="py-4 first:pt-0 last:pb-0">
                    <div className="flex items-start justify-between gap-2 mb-2">
                      <a
                        href={item.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="font-semibold text-foreground hover:text-emerald-500 transition-colors text-sm"
                      >
                        {item.title}
                      </a>
                      {item.related_symbols.length > 0 && (
                        <div className="flex gap-1 shrink-0">
                          {item.related_symbols.map((sym: string) => (
                            <span key={sym} className="px-1.5 py-0.5 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 rounded text-xs">
                              {sym}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                    <p className="text-sm text-muted-foreground mb-1">{item.summary}</p>
                    <p className="text-sm text-muted-foreground leading-relaxed">{item.analysis}</p>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* Key Events */}
          {digest.events.length > 0 && (
            <section className="bg-card rounded-xl border border-border p-5 animate-fade-in-up">
              <div className="flex items-center gap-2 mb-4">
                <div className="w-1 h-4 bg-emerald-500 rounded-full" />
                <h3 className="text-sm font-semibold text-foreground uppercase tracking-wider">Key Events</h3>
              </div>
              <div className="space-y-4">
                {digest.events.map((event: BrewEvent, index: number) => {
                  const dateStr = event.date.split('T')[0];
                  const calendarDate = formatCalendarDate(dateStr);
                  const isToday = isTodayPacific(dateStr);

                  return (
                    <div key={index} className="flex gap-4">
                      <div className={`flex-shrink-0 w-14 rounded-lg p-2 text-center ${
                        isToday
                          ? 'bg-emerald-500/10 border border-emerald-500/20'
                          : 'bg-secondary border border-border'
                      }`}>
                        <p className={`text-xs uppercase ${isToday ? 'text-emerald-500' : 'text-muted-foreground'}`}>
                          {calendarDate.month}
                        </p>
                        <p className={`text-xl font-semibold ${isToday ? 'text-emerald-500' : 'text-foreground'}`}>
                          {calendarDate.day}
                        </p>
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-start justify-between gap-2 mb-1">
                          <span className="font-semibold text-foreground text-sm">{event.event}</span>
                          {event.related_symbols.length > 0 && (
                            <div className="flex gap-1 shrink-0">
                              {event.related_symbols.map((sym: string) => (
                                <span key={sym} className="px-1.5 py-0.5 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 rounded text-xs">
                                  {sym}
                                </span>
                              ))}
                            </div>
                          )}
                        </div>
                        <p className="text-sm text-muted-foreground leading-relaxed">{event.why_important}</p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>
          )}

          {/* Macro Impact */}
          {digest.macro_impact && (
            <section className="bg-card rounded-xl border border-border p-5 animate-fade-in-up">
              <div className="flex items-center gap-2 mb-4">
                <div className="w-1 h-4 bg-emerald-500 rounded-full" />
                <h3 className="text-sm font-semibold text-foreground uppercase tracking-wider">Macro Impact</h3>
              </div>
              <div className="divide-y divide-border">
                <div className="pb-4">
                  <div className="flex items-center gap-3 mb-2">
                    <span className="text-sm font-semibold text-foreground">Market Environment</span>
                    <span className={`text-sm font-medium ${getRiskColor(digest.macro_impact.risk_level)}`}>
                      Risk: {digest.macro_impact.risk_level}
                    </span>
                  </div>
                  <p className="text-sm text-muted-foreground leading-relaxed">{digest.macro_impact.overall_environment}</p>
                </div>
                <div className="py-4">
                  <span className="text-sm font-semibold text-foreground">Portfolio Impact</span>
                  <p className="text-sm text-muted-foreground leading-relaxed mt-2">{digest.macro_impact.impact_on_portfolio}</p>
                </div>
                <div className="pt-4">
                  <span className="text-sm font-semibold text-foreground">Risk Factors</span>
                  <p className="text-sm text-muted-foreground leading-relaxed mt-2">{digest.macro_impact.risk_factors}</p>
                </div>
              </div>
            </section>
          )}

          {/* Key Takeaway */}
          {digest.bottom_line && (
            <section className="bg-emerald-500/10 rounded-xl p-5 border border-emerald-500/20 animate-fade-in-up">
              <div className="flex items-center gap-2 mb-3">
                <div className="w-1 h-4 bg-emerald-500 rounded-full" />
                <h3 className="text-sm font-semibold text-emerald-600 dark:text-emerald-400 uppercase tracking-wider">Key Takeaway</h3>
              </div>
              <p className="text-sm text-foreground leading-relaxed">{digest.bottom_line}</p>
            </section>
          )}

          {/* Disclaimer */}
          <div className="text-center pt-4 border-t border-border">
            <p className="text-xs text-muted-foreground">
              AI-generated report for informational purposes only. Not financial advice.
            </p>
          </div>
        </div>
      )}

      {/* Empty State */}
      {!loading && !digest && (
        <div className="max-w-5xl mx-auto px-4 md:px-6 py-16">
          <div className="text-center space-y-5">
            <div className="w-20 h-20 mx-auto rounded-2xl bg-muted border border-border flex items-center justify-center">
              <Coffee className="w-10 h-10 text-muted-foreground" strokeWidth={1.5} />
            </div>
            <div>
              <h3 className="text-lg font-semibold text-foreground mb-2">Create Your Personalized Brew</h3>
              <p className="text-muted-foreground max-w-sm mx-auto">
                {symbols.length === 0
                  ? 'Click Settings to add stocks to your watchlist, then generate your personalized digest.'
                  : 'Click Generate to create a personalized market analysis for your watchlist.'}
              </p>
            </div>
            {symbols.length === 0 && (
              <button
                onClick={() => setShowSettings(true)}
                className="inline-flex items-center gap-2 px-6 py-3 bg-emerald-600 text-white rounded-xl font-medium transition-all hover:bg-emerald-500"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                </svg>
                Add Stocks
              </button>
            )}
          </div>
        </div>
      )}

      {/* Historical Reports Section */}
      {history.length > 0 && (
        <section className="border-t border-border mt-8">
          <div className="max-w-5xl mx-auto px-4 md:px-6 py-8">
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-muted flex items-center justify-center">
                  <svg className="w-4 h-4 text-muted-foreground" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </div>
                <div>
                  <h3 className="text-lg font-semibold text-foreground">Past Brews</h3>
                  <p className="text-xs text-muted-foreground">{totalHistory} brews available</p>
                </div>
              </div>
              <Link
                href="/brew/archive"
                className="text-sm text-emerald-600 dark:text-emerald-400 hover:underline flex items-center gap-1"
              >
                View all
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </Link>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4">
              {history.slice(0, 5).map((item) => (
                <button
                  key={item.id}
                  onClick={() => loadHistoricalDigest(item)}
                  className="group bg-card rounded-xl border border-border p-4 hover:border-emerald-500/50 transition-all text-left"
                >
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-xs font-medium text-muted-foreground bg-muted px-2 py-1 rounded">
                      {formatDateShort(item.digest_date)}
                    </span>
                    <svg className="w-4 h-4 text-muted-foreground group-hover:text-emerald-500 transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                    </svg>
                  </div>
                  <div className="flex flex-wrap gap-1 mb-2">
                    {item.symbols.slice(0, 3).map((sym) => (
                      <span key={sym} className="px-1.5 py-0.5 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 rounded text-xs">
                        {sym}
                      </span>
                    ))}
                    {item.symbols.length > 3 && (
                      <span className="text-xs text-muted-foreground">+{item.symbols.length - 3}</span>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground line-clamp-2">
                    {item.one_line_summary || `${item.symbols.length} stocks analyzed`}
                  </p>
                </button>
              ))}
            </div>
          </div>
        </section>
      )}
    </main>
  );
}
