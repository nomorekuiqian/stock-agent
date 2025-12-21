'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { api, DigestResponse, StockAnalysis, BrewNews, BrewEvent } from '@/lib/api';
import { getUserWatchlist, saveUserWatchlist, saveUserDigest, getUserDigests, UserDigest } from '@/lib/insforge';
import { formatDateChinese, formatTimePacific, formatCalendarDate, isTodayPacific } from '@/lib/timezone';

export default function DigestPage() {
  const router = useRouter();
  const { user, isLoading: authLoading, isAuthenticated } = useAuth();

  const [symbols, setSymbols] = useState<string[]>([]);
  const [newSymbol, setNewSymbol] = useState('');
  const [loading, setLoading] = useState(false);
  const [loadingWatchlist, setLoadingWatchlist] = useState(true);
  const [digest, setDigest] = useState<DigestResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [history, setHistory] = useState<UserDigest[]>([]);
  const [showHistory, setShowHistory] = useState(false);

  // Redirect to login if not authenticated
  useEffect(() => {
    if (!authLoading && !isAuthenticated) {
      router.push('/login?redirect=/digest');
    }
  }, [authLoading, isAuthenticated, router]);

  // Load user's watchlist and history
  useEffect(() => {
    const loadUserData = async () => {
      if (!user?.id) return;

      setLoadingWatchlist(true);
      try {
        // Load watchlist
        const watchlist = await getUserWatchlist(user.id);
        if (watchlist?.symbols) {
          setSymbols(watchlist.symbols);
        }

        // Load history
        const historyResult = await getUserDigests(user.id, 10, 0);
        if (historyResult.data) {
          setHistory(historyResult.data);
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
      // Auto-save watchlist
      if (user?.id) {
        saveUserWatchlist(user.id, newSymbols);
      }
    }
  };

  const handleRemoveSymbol = (symbolToRemove: string) => {
    const newSymbols = symbols.filter((s) => s !== symbolToRemove);
    setSymbols(newSymbols);
    // Auto-save watchlist
    if (user?.id) {
      saveUserWatchlist(user.id, newSymbols);
    }
  };

  const handleGenerateDigest = async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await api.generateDigest(symbols);
      setDigest(result);

      // Save complete digest to database
      if (user?.id) {
        const saveResult = await saveUserDigest(user.id, result);
        if (saveResult.success) {
          // Refresh history
          const historyResult = await getUserDigests(user.id, 10, 0);
          if (historyResult.data) {
            setHistory(historyResult.data);
          }
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to generate digest');
    } finally {
      setLoading(false);
    }
  };

  // Load historical digest
  const loadHistoricalDigest = (historyItem: UserDigest) => {
    // Convert UserDigest to DigestResponse format
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
    setShowHistory(false);
  };

  // Helper function to get status color
  const getStatusColor = (status: string) => {
    if (status.includes('上涨') || status.includes('强势')) {
      return 'text-emerald-500 bg-emerald-500/10';
    } else if (status.includes('下跌') || status.includes('回调')) {
      return 'text-red-500 bg-red-500/10';
    }
    return 'text-muted-foreground bg-secondary';
  };

  // Helper function to get risk level color
  const getRiskColor = (riskLevel: string) => {
    if (riskLevel.includes('低')) return 'text-emerald-500';
    if (riskLevel.includes('中低') || riskLevel.includes('中等')) return 'text-amber-500';
    if (riskLevel.includes('高')) return 'text-red-500';
    return 'text-muted-foreground';
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleAddSymbol();
    }
  };

  // Use Pacific timezone utilities for date/time formatting
  const formatDate = (dateString: string) => formatDateChinese(dateString);
  const formatTime = (dateString: string) => formatTimePacific(dateString);

  // Show loading while checking auth
  if (authLoading) {
    return (
      <main className="min-h-screen bg-background">
        <div className="max-w-5xl mx-auto px-4 md:px-6 py-12">
          <div className="flex flex-col items-center justify-center gap-3">
            <div className="w-10 h-10 rounded-full border-3 border-emerald-500/20 border-t-emerald-500 animate-spin" />
            <p className="text-muted-foreground text-sm">Loading...</p>
          </div>
        </div>
      </main>
    );
  }

  // Don't render if not authenticated (will redirect)
  if (!isAuthenticated) {
    return null;
  }

  return (
    <main className="min-h-screen bg-background">
      {/* Hero Section */}
      <section className="border-b border-border">
        <div className="max-w-5xl mx-auto px-4 md:px-6 py-8 md:py-12">
          <div className="text-center space-y-4">
            {/* Badge */}
            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-500/10 text-emerald-500 text-xs font-medium">
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z" />
              </svg>
              Personalized
            </div>

            {/* Main Title */}
            <h1 className="text-2xl md:text-3xl font-semibold tracking-tight text-foreground">
              My Daily Digest
            </h1>

            {/* Subtitle */}
            <p className="text-sm md:text-base text-muted-foreground max-w-lg mx-auto">
              Get personalized market insights based on your stock watchlist.
            </p>
          </div>
        </div>
      </section>

      {/* Watchlist Section */}
      <div className="max-w-5xl mx-auto px-4 md:px-6 py-8 space-y-8">
        <section className="bg-card rounded-xl border border-border p-5 animate-fade-in-up">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <div className="w-1 h-5 bg-foreground rounded-full" />
              <h2 className="text-sm font-semibold text-foreground uppercase tracking-wider">Your Watchlist</h2>
            </div>
            {symbols.length > 0 && (
              <span className="text-xs text-muted-foreground">
                {symbols.length} symbols
              </span>
            )}
          </div>

          {/* Watchlist Loading */}
          {loadingWatchlist ? (
            <div className="flex items-center gap-2 text-muted-foreground">
              <div className="w-4 h-4 rounded-full border-2 border-border border-t-emerald-500 animate-spin" />
              <span className="text-sm">Loading watchlist...</span>
            </div>
          ) : (
            <div className="space-y-4">
              {/* Symbol Chips */}
              <div className="flex flex-wrap gap-2">
                {symbols.map((symbol) => (
                  <div
                    key={symbol}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-emerald-500/10 text-emerald-500 rounded-lg text-sm font-medium"
                  >
                    {symbol}
                    <button
                      onClick={() => handleRemoveSymbol(symbol)}
                      className="hover:text-emerald-600 transition-colors"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  </div>
                ))}
                {symbols.length === 0 && (
                  <p className="text-sm text-muted-foreground">No symbols added yet. Add your favorite stocks below.</p>
                )}
              </div>

              {/* Add Symbol Input */}
              <div className="flex gap-2">
                <input
                  type="text"
                  value={newSymbol}
                  onChange={(e) => setNewSymbol(e.target.value.toUpperCase())}
                  onKeyDown={handleKeyDown}
                  placeholder="Enter symbol (e.g., AAPL)"
                  className="flex-1 px-4 py-2.5 border border-border bg-background rounded-lg text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
                />
                <button
                  onClick={handleAddSymbol}
                  disabled={!newSymbol.trim()}
                  className="px-4 py-2.5 bg-secondary text-foreground rounded-lg font-medium text-sm transition-all hover:bg-secondary/80 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Add
                </button>
              </div>

              {/* Popular Symbols */}
              <div className="pt-2 border-t border-border">
                <p className="text-xs text-muted-foreground mb-2">Popular symbols:</p>
                <div className="flex flex-wrap gap-1.5">
                  {['AAPL', 'MSFT', 'NVDA', 'TSLA', 'GOOGL', 'META', 'AMZN', 'AMD'].map((symbol) => (
                    <button
                      key={symbol}
                      onClick={() => {
                        if (!symbols.includes(symbol)) {
                          const newSymbols = [...symbols, symbol];
                          setSymbols(newSymbols);
                          if (user?.id) {
                            saveUserWatchlist(user.id, newSymbols);
                          }
                        }
                      }}
                      disabled={symbols.includes(symbol)}
                      className="px-2.5 py-1 text-xs text-muted-foreground border border-border rounded-lg hover:bg-secondary disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                    >
                      +{symbol}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}
        </section>

        {/* Generate Button + History Toggle */}
        <div className="flex flex-col items-center gap-4">
          <div className="flex items-center gap-3">
            <button
              onClick={handleGenerateDigest}
              disabled={loading || symbols.length === 0}
              className="px-6 py-3 bg-emerald-500 text-white rounded-lg font-medium text-sm transition-all hover:bg-emerald-600 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
            >
              {loading ? (
                <>
                  <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  Generating Digest...
                </>
              ) : (
                <>
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                  </svg>
                  Generate My Brew
                </>
              )}
            </button>
            {history.length > 0 && (
              <button
                onClick={() => setShowHistory(!showHistory)}
                className="px-4 py-3 border border-border text-muted-foreground rounded-lg font-medium text-sm transition-all hover:bg-secondary flex items-center gap-2"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                History ({history.length})
              </button>
            )}
          </div>

          {/* History Panel */}
          {showHistory && history.length > 0 && (
            <div className="w-full bg-card rounded-xl border border-border p-4 animate-fade-in-up">
              <h3 className="text-sm font-semibold text-foreground mb-3">Past Brews</h3>
              <div className="space-y-2">
                {history.map((item) => (
                  <button
                    key={item.id}
                    onClick={() => loadHistoricalDigest(item)}
                    className="w-full text-left p-3 rounded-lg border border-border hover:bg-secondary transition-colors"
                  >
                    <div className="flex items-center justify-between">
                      <div>
                        <span className="text-sm font-medium text-foreground">{item.digest_date}</span>
                        <span className="text-xs text-muted-foreground ml-2">
                          {item.symbols.length} symbols
                        </span>
                      </div>
                      <div className="flex gap-1">
                        {item.symbols.slice(0, 3).map((sym) => (
                          <span key={sym} className="px-1.5 py-0.5 bg-emerald-500/10 text-emerald-500 rounded text-xs">
                            {sym}
                          </span>
                        ))}
                        {item.symbols.length > 3 && (
                          <span className="text-xs text-muted-foreground">+{item.symbols.length - 3}</span>
                        )}
                      </div>
                    </div>
                    {item.one_line_summary && (
                      <p className="text-xs text-muted-foreground mt-1 truncate">{item.one_line_summary}</p>
                    )}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Error Message */}
        {error && (
          <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-500 text-sm text-center">
            {error}
          </div>
        )}

        {/* Loading State */}
        {loading && (
          <div className="flex flex-col items-center justify-center gap-3 py-8">
            <div className="w-10 h-10 rounded-full border-3 border-emerald-500/20 border-t-emerald-500 animate-spin" />
            <p className="text-muted-foreground text-sm">Analyzing your stocks...</p>
          </div>
        )}

        {/* Digest Content */}
        {digest && !loading && (
          <section className="space-y-5">
            {/* Header */}
            <div className="text-center space-y-2">
              <h2 className="text-xl font-semibold text-foreground">{digest.greeting}</h2>
              <p className="text-sm text-muted-foreground">{digest.one_line_summary}</p>
            </div>

            {/* Section 1: Portfolio Overview */}
            <div className="bg-card rounded-xl border border-border p-5 animate-fade-in-up">
              <div className="flex items-center gap-3 mb-5">
                <div className="w-1 h-5 bg-foreground rounded-full" />
                <h3 className="text-sm font-semibold text-foreground uppercase tracking-wider">Watchlist Overview</h3>
              </div>
              <div className="space-y-0 divide-y divide-border">
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
                        {stock.week_change}
                      </span>
                    </div>
                    <p className="text-sm text-muted-foreground leading-relaxed">{stock.quick_take}</p>
                  </div>
                ))}
              </div>
            </div>

            {/* Section 2: Relevant News */}
            {digest.news.length > 0 && (
              <div className="bg-card rounded-xl border border-border p-5 animate-fade-in-up">
                <div className="flex items-center gap-3 mb-5">
                  <div className="w-1 h-5 bg-foreground rounded-full" />
                  <h3 className="text-sm font-semibold text-foreground uppercase tracking-wider">Related News</h3>
                </div>
                <div className="space-y-0 divide-y divide-border">
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
                              <span key={sym} className="px-1.5 py-0.5 bg-emerald-500/10 text-emerald-500 rounded text-xs">
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
              </div>
            )}

            {/* Section 3: Upcoming Events */}
            {digest.events.length > 0 && (
              <div className="bg-card rounded-xl border border-border p-5 animate-fade-in-up">
                <div className="flex items-center gap-3 mb-5">
                  <div className="w-1 h-5 bg-foreground rounded-full" />
                  <h3 className="text-sm font-semibold text-foreground uppercase tracking-wider">Key Events</h3>
                </div>
                <div className="space-y-4">
                  {digest.events.map((event: BrewEvent, index: number) => {
                    const dateStr = event.date.split('T')[0];
                    const calendarDate = formatCalendarDate(dateStr);
                    const isToday = isTodayPacific(dateStr);

                    return (
                      <div key={index} className="flex gap-4">
                        {/* Date Block */}
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
                        {/* Event Details */}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-start justify-between gap-2 mb-1">
                            <span className="font-semibold text-foreground text-sm">{event.event}</span>
                            {event.related_symbols.length > 0 && (
                              <div className="flex gap-1 shrink-0">
                                {event.related_symbols.map((sym: string) => (
                                  <span key={sym} className="px-1.5 py-0.5 bg-emerald-500/10 text-emerald-500 rounded text-xs">
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
              </div>
            )}

            {/* Section 4: Macro Impact */}
            {digest.macro_impact && (
              <div className="bg-card rounded-xl border border-border p-5 animate-fade-in-up">
                <div className="flex items-center gap-3 mb-5">
                  <div className="w-1 h-5 bg-foreground rounded-full" />
                  <h3 className="text-sm font-semibold text-foreground uppercase tracking-wider">Macro Impact</h3>
                </div>
                <div className="space-y-0 divide-y divide-border">
                  <div className="pb-4">
                    <div className="flex items-center gap-3 mb-2">
                      <span className="text-sm font-semibold text-foreground">Market Environment</span>
                      <span className={`text-sm font-semibold ${getRiskColor(digest.macro_impact.risk_level)}`}>
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
              </div>
            )}

            {/* Section 5: Bottom Line */}
            {digest.bottom_line && (
              <div className="bg-emerald-500/10 rounded-xl p-5 border border-emerald-500/20 animate-fade-in-up">
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-1 h-5 bg-emerald-500 rounded-full" />
                  <h3 className="text-sm font-semibold text-emerald-500 uppercase tracking-wider">Key Takeaway</h3>
                </div>
                <p className="text-sm text-foreground leading-relaxed">{digest.bottom_line}</p>
              </div>
            )}

            {/* Timestamp & Disclaimer */}
            <div className="text-center pt-4 border-t border-border animate-fade-in">
              <p className="text-xs text-muted-foreground">
                AI-generated report for informational purposes only. Not financial advice.
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                Generated at {formatDate(digest.timestamp)} {formatTime(digest.timestamp)}
              </p>
            </div>
          </section>
        )}

        {/* Empty State */}
        {!digest && !loading && (
          <div className="text-center py-8">
            <div className="w-16 h-16 mx-auto rounded-2xl bg-secondary flex items-center justify-center mb-4">
              <svg className="w-8 h-8 text-muted-foreground" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
              </svg>
            </div>
            <h3 className="text-base font-semibold text-foreground mb-1">Ready to Generate</h3>
            <p className="text-sm text-muted-foreground max-w-sm mx-auto">
              {symbols.length === 0
                ? 'Add some stocks to your watchlist, then generate your personalized digest.'
                : 'Click the button above to generate a personalized digest for your watchlist.'}
            </p>
          </div>
        )}
      </div>
    </main>
  );
}
