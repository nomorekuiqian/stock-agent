'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import ReactMarkdown from 'react-markdown';
import { useAuth } from '@/contexts/AuthContext';
import { api, DigestResponse } from '@/lib/api';
import { getUserWatchlist, saveUserWatchlist, saveUserDigest } from '@/lib/insforge';

export default function DigestPage() {
  const router = useRouter();
  const { user, isLoading: authLoading, isAuthenticated } = useAuth();

  const [symbols, setSymbols] = useState<string[]>([]);
  const [newSymbol, setNewSymbol] = useState('');
  const [loading, setLoading] = useState(false);
  const [loadingWatchlist, setLoadingWatchlist] = useState(true);
  const [savingWatchlist, setSavingWatchlist] = useState(false);
  const [digest, setDigest] = useState<DigestResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Redirect to login if not authenticated
  useEffect(() => {
    if (!authLoading && !isAuthenticated) {
      router.push('/login?redirect=/digest');
    }
  }, [authLoading, isAuthenticated, router]);

  // Load user's watchlist
  useEffect(() => {
    const loadWatchlist = async () => {
      if (!user?.id) return;

      setLoadingWatchlist(true);
      try {
        const watchlist = await getUserWatchlist(user.id);
        if (watchlist?.symbols) {
          setSymbols(watchlist.symbols);
        }
      } catch (err) {
        console.error('Failed to load watchlist:', err);
      } finally {
        setLoadingWatchlist(false);
      }
    };

    if (user?.id) {
      loadWatchlist();
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

  const handleSaveWatchlist = async () => {
    if (!user?.id) return;

    setSavingWatchlist(true);
    try {
      const result = await saveUserWatchlist(user.id, symbols);
      if (!result.success) {
        setError('Failed to save watchlist');
      }
    } catch {
      setError('Failed to save watchlist');
    } finally {
      setSavingWatchlist(false);
    }
  };

  const handleGenerateDigest = async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await api.generateDigest(symbols);
      setDigest(result);

      // Save digest to database
      if (user?.id) {
        await saveUserDigest(user.id, {
          symbols: result.symbols_used,
          analysis: result.analysis,
          news_data: result.news_data,
        });
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to generate digest');
    } finally {
      setLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleAddSymbol();
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

  // Show loading while checking auth
  if (authLoading) {
    return (
      <main className="min-h-screen bg-white">
        <div className="max-w-5xl mx-auto px-4 md:px-6 py-12">
          <div className="flex flex-col items-center justify-center gap-3">
            <div className="w-10 h-10 rounded-full border-3 border-emerald-100 border-t-emerald-600 animate-spin" />
            <p className="text-gray-500 text-sm">Loading...</p>
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
    <main className="min-h-screen bg-white">
      {/* Hero Section */}
      <section className="border-b border-gray-100">
        <div className="max-w-5xl mx-auto px-4 md:px-6 py-8 md:py-12">
          <div className="text-center space-y-4">
            {/* Badge */}
            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-50 text-emerald-700 text-xs font-medium">
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z" />
              </svg>
              Personalized
            </div>

            {/* Main Title */}
            <h1 className="text-2xl md:text-3xl font-semibold tracking-tight text-gray-900">
              My Daily Digest
            </h1>

            {/* Subtitle */}
            <p className="text-sm md:text-base text-gray-500 max-w-lg mx-auto">
              Get personalized market insights based on your stock watchlist.
            </p>
          </div>
        </div>
      </section>

      {/* Watchlist Section */}
      <div className="max-w-5xl mx-auto px-4 md:px-6 py-8 space-y-8">
        <section>
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <svg className="w-5 h-5 text-emerald-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
              </svg>
              <h2 className="text-lg font-semibold text-gray-900">Your Watchlist</h2>
            </div>
            {symbols.length > 0 && (
              <span className="text-xs text-gray-400">
                {symbols.length} symbols
              </span>
            )}
          </div>

          {/* Watchlist Loading */}
          {loadingWatchlist ? (
            <div className="bg-white rounded-xl border border-gray-200 p-6">
              <div className="flex items-center gap-2 text-gray-500">
                <div className="w-4 h-4 rounded-full border-2 border-gray-200 border-t-emerald-600 animate-spin" />
                <span className="text-sm">Loading watchlist...</span>
              </div>
            </div>
          ) : (
            <div className="bg-white rounded-xl border border-gray-200 p-5 md:p-6 space-y-4">
              {/* Symbol Chips */}
              <div className="flex flex-wrap gap-2">
                {symbols.map((symbol) => (
                  <div
                    key={symbol}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-emerald-50 text-emerald-700 rounded-lg text-sm font-medium"
                  >
                    {symbol}
                    <button
                      onClick={() => handleRemoveSymbol(symbol)}
                      className="hover:text-emerald-900 transition-colors"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  </div>
                ))}
                {symbols.length === 0 && (
                  <p className="text-sm text-gray-400">No symbols added yet. Add your favorite stocks below.</p>
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
                  className="flex-1 px-4 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
                />
                <button
                  onClick={handleAddSymbol}
                  disabled={!newSymbol.trim()}
                  className="px-4 py-2.5 bg-gray-100 text-gray-700 rounded-lg font-medium text-sm transition-all hover:bg-gray-200 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Add
                </button>
              </div>

              {/* Popular Symbols */}
              <div className="pt-2 border-t border-gray-100">
                <p className="text-xs text-gray-400 mb-2">Popular symbols:</p>
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
                      className="px-2.5 py-1 text-xs text-gray-500 border border-gray-200 rounded-lg hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                    >
                      +{symbol}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}
        </section>

        {/* Generate Button */}
        <div className="flex justify-center">
          <button
            onClick={handleGenerateDigest}
            disabled={loading || symbols.length === 0}
            className="px-6 py-3 bg-emerald-600 text-white rounded-lg font-medium text-sm transition-all hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
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
                Generate My Digest
              </>
            )}
          </button>
        </div>

        {/* Error Message */}
        {error && (
          <div className="p-3 rounded-lg bg-red-50 border border-red-100 text-red-600 text-sm text-center">
            {error}
          </div>
        )}

        {/* Loading State */}
        {loading && (
          <div className="flex flex-col items-center justify-center gap-3 py-8">
            <div className="w-10 h-10 rounded-full border-3 border-emerald-100 border-t-emerald-600 animate-spin" />
            <p className="text-gray-500 text-sm">Analyzing your stocks...</p>
          </div>
        )}

        {/* Digest Content */}
        {digest && !loading && (
          <section>
            <div className="flex items-center gap-2 mb-4">
              <svg className="w-5 h-5 text-emerald-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
              <div>
                <h2 className="text-lg font-semibold text-gray-900">Your Personalized Digest</h2>
                <p className="text-xs text-gray-500">
                  Based on {digest.symbols_used.length} symbols
                </p>
              </div>
            </div>

            <div className="bg-white rounded-xl border border-gray-200 p-5 md:p-6">
              <div className="prose prose-sm max-w-none prose-headings:text-gray-900 prose-headings:font-semibold prose-headings:text-base prose-p:text-gray-600 prose-p:text-sm prose-p:leading-relaxed prose-strong:text-gray-900 prose-a:text-emerald-600 prose-ul:text-gray-600 prose-ul:text-sm prose-li:text-gray-600 prose-li:text-sm prose-h2:mt-6 prose-h2:mb-3 prose-h3:mt-4 prose-h3:mb-2">
                <ReactMarkdown
                  components={{
                    a: ({ href, children }) => (
                      <a href={href} target="_blank" rel="noopener noreferrer">
                        {children}
                      </a>
                    ),
                  }}
                >
                  {digest.analysis}
                </ReactMarkdown>
              </div>
            </div>

            {/* Timestamp */}
            <div className="text-center pt-4">
              <p className="text-xs text-gray-400">
                Generated on {formatDate(digest.timestamp)} at {formatTime(digest.timestamp)}
              </p>
            </div>
          </section>
        )}

        {/* Empty State */}
        {!digest && !loading && (
          <div className="text-center py-8">
            <div className="w-16 h-16 mx-auto rounded-2xl bg-gray-50 flex items-center justify-center mb-4">
              <svg className="w-8 h-8 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
              </svg>
            </div>
            <h3 className="text-base font-semibold text-gray-900 mb-1">Ready to Generate</h3>
            <p className="text-sm text-gray-500 max-w-sm mx-auto">
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
