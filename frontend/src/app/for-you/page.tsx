'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '@/contexts/AuthContext';
import PaywallGuard from '@/components/PaywallGuard';
import { api, StockQuote, DigestResponse } from '@/lib/api';
import { getUserWatchlist, saveUserWatchlist, getUserDigests, UserDigest } from '@/lib/insforge';
import { marketTodayStr } from '@/lib/timezone';
import { userDigestToResponse } from '@/lib/digest-utils';
import OnboardingSection from '@/components/for-you/OnboardingSection';
import PortfolioSnapshotBar from '@/components/for-you/PortfolioSnapshotBar';
import DigestInlineReport from '@/components/for-you/DigestInlineReport';
import RecentReports from '@/components/for-you/RecentReports';

function ForYouPageContent() {
  const router = useRouter();
  const { user, isLoading: authLoading, isAuthenticated } = useAuth();

  // Core state
  const [symbols, setSymbols] = useState<string[]>([]);
  const [loadingWatchlist, setLoadingWatchlist] = useState(true);
  const [history, setHistory] = useState<UserDigest[]>([]);
  const [totalHistory, setTotalHistory] = useState(0);
  const [error, setError] = useState<string | null>(null);

  // Dashboard state
  const [generating, setGenerating] = useState(false);
  const [displayDigest, setDisplayDigest] = useState<DigestResponse | null>(null);

  // Subscription state
  const [isSubscribed, setIsSubscribed] = useState(false);
  const [subscribing, setSubscribing] = useState(false);
  const [checkingSubscription, setCheckingSubscription] = useState(false);

  // Stock quotes
  const [quotes, setQuotes] = useState<Record<string, StockQuote>>({});
  const [loadingQuotes, setLoadingQuotes] = useState(false);

  // Today's digest detection
  const todayDigest = useMemo(() => {
    if (history.length === 0) return null;
    return history[0].digest_date === marketTodayStr() ? history[0] : null;
  }, [history]);

  // History items to show in RecentReports, skipping the one already displayed inline
  const filteredHistory = useMemo(() => {
    if (!displayDigest || history.length === 0) return history;
    // Skip the first item if it's the one being displayed inline
    const displayId = todayDigest?.id || history[0]?.id;
    return history.filter(item => item.id !== displayId);
  }, [history, displayDigest, todayDigest]);

  // --- Effects ---

  useEffect(() => {
    if (!authLoading && !isAuthenticated) {
      router.push('/login?redirect=/for-you');
    }
  }, [authLoading, isAuthenticated, router]);

  useEffect(() => {
    const loadUserData = async () => {
      if (!user?.id) return;

      setLoadingWatchlist(true);
      try {
        const watchlist = await getUserWatchlist(user.id);
        if (watchlist?.symbols) {
          const uniqueSymbols = [...new Set(watchlist.symbols.map(s => s.toUpperCase()))];
          setSymbols(uniqueSymbols);
        }

        const historyResult = await getUserDigests(user.id, 10, 0);
        if (historyResult.data) {
          setHistory(historyResult.data);
          setTotalHistory(historyResult.total);

          // Set display digest: today's or latest
          if (historyResult.data.length > 0) {
            const latest = historyResult.data[0];
            setDisplayDigest(userDigestToResponse(latest));
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

  useEffect(() => {
    const fetchQuotes = async () => {
      if (symbols.length === 0) {
        setQuotes({});
        return;
      }

      setLoadingQuotes(true);
      try {
        const result = await api.getStockQuotes(symbols);
        const quotesMap: Record<string, StockQuote> = {};
        result.quotes.forEach((q) => {
          quotesMap[q.symbol] = q;
        });
        setQuotes(quotesMap);
      } catch (err) {
        console.error('Failed to fetch quotes:', err);
      } finally {
        setLoadingQuotes(false);
      }
    };

    fetchQuotes();
  }, [symbols]);

  useEffect(() => {
    const checkSubscription = async () => {
      if (!user?.email) return;

      setCheckingSubscription(true);
      try {
        const result = await api.subscriptions.getStatus('personal_digest', user.email);
        setIsSubscribed(result.subscribed);
      } catch (err) {
        console.error('Failed to check subscription:', err);
      } finally {
        setCheckingSubscription(false);
      }
    };

    if (user?.email) {
      checkSubscription();
    }
  }, [user?.email]);

  // Refetch watchlist + quotes when returning from watchlist page
  const refetchWatchlist = useCallback(async () => {
    if (!user?.id) return;
    try {
      const watchlist = await getUserWatchlist(user.id);
      if (watchlist?.symbols) {
        const uniqueSymbols = [...new Set(watchlist.symbols.map(s => s.toUpperCase()))];
        setSymbols(uniqueSymbols);
      } else {
        setSymbols([]);
      }
    } catch (err) {
      console.error('Failed to refetch watchlist:', err);
    }
  }, [user?.id]);

  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        refetchWatchlist();
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, [refetchWatchlist]);

  // --- Handlers ---

  const handleSubscription = async () => {
    if (!user?.email) return;

    setSubscribing(true);
    try {
      if (isSubscribed) {
        const result = await api.subscriptions.unsubscribe('personal_digest', user.email);
        if (result.success) {
          setIsSubscribed(false);
        }
      } else {
        const result = await api.subscriptions.subscribe('personal_digest', {
          email: user.email,
          user_id: user.id,
          symbols: symbols,
        });
        if (result.success) {
          setIsSubscribed(true);
        }
      }
    } catch (err) {
      console.error('Subscription action failed:', err);
    } finally {
      setSubscribing(false);
    }
  };

  const handleGenerateDigest = async () => {
    if (!user?.id) return;

    setGenerating(true);
    setError(null);
    try {
      await api.generateDigest(symbols, user.id);

      // Refresh history and update display digest in-place
      const historyResult = await getUserDigests(user.id, 10, 0);
      if (historyResult.data) {
        setHistory(historyResult.data);
        setTotalHistory(historyResult.total);
        if (historyResult.data.length > 0) {
          setDisplayDigest(userDigestToResponse(historyResult.data[0]));
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to generate digest');
    } finally {
      setGenerating(false);
    }
  };

  const handleSelectTemplate = async (newSymbols: string[]) => {
    if (!user?.id) throw new Error('Not authenticated');

    // 1. Save watchlist
    await saveUserWatchlist(user.id, newSymbols);

    // 2. Subscribe to email (non-blocking)
    if (user.email) {
      try {
        await api.subscriptions.subscribe('personal_digest', {
          email: user.email,
          user_id: user.id,
          symbols: newSymbols,
        });
      } catch {
        // Subscription failure should not block onboarding
      }
    }

    // 3. Update local state
    setSymbols(newSymbols);
    setIsSubscribed(true);

    // 4. Generate digest
    setGenerating(true);
    try {
      await api.generateDigest(newSymbols, user.id);

      // 5. Refresh history and display inline
      const historyResult = await getUserDigests(user.id, 10, 0);
      if (historyResult.data) {
        setHistory(historyResult.data);
        setTotalHistory(historyResult.total);
        if (historyResult.data.length > 0) {
          setDisplayDigest(userDigestToResponse(historyResult.data[0]));
        }
      }
    } finally {
      setGenerating(false);
    }
  };

  // --- Auth loading / unauthenticated ---

  if (authLoading) {
    return (
      <main className="min-h-screen bg-background">
        <div className="max-w-5xl mx-auto px-4 md:px-6 py-20">
          <div className="flex flex-col items-center justify-center gap-4">
            <div className="w-10 h-10 rounded-full border-2 border-emerald-500/20 border-t-emerald-500 animate-spin" />
            <p className="text-muted-foreground text-sm">加载中...</p>
          </div>
        </div>
      </main>
    );
  }

  if (!isAuthenticated) {
    return null;
  }

  // --- Three-state rendering ---

  const isOnboarding = !loadingWatchlist && symbols.length === 0;
  const subscriptionLoading = subscribing || checkingSubscription;

  return (
    <main className="min-h-screen bg-background">
      {/* Page Header */}
      <section className="border-b border-border/50">
        <div className="max-w-5xl mx-auto px-4 md:px-6 py-8 md:py-12">
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <div className="h-px flex-1 max-w-[60px] bg-gradient-to-r from-primary to-transparent" />
              <span className="text-primary text-xs font-medium tracking-[0.2em] uppercase">FOR YOU</span>
              {symbols.length > 0 && (
                <span className="text-muted-foreground text-xs font-medium tracking-[0.15em] ml-2">/ {symbols.length} STOCKS</span>
              )}
            </div>
            <h1 className="text-3xl md:text-4xl font-editorial text-foreground tracking-tight">
              {isOnboarding ? '专属日报' : '你的专属日报'}
            </h1>
            <p className="text-muted-foreground text-sm md:text-base max-w-lg">
              {isOnboarding
                ? '根据你的关注列表定制的市场洞察'
                : '基于你的持仓定制的每日市场洞察'}
            </p>

            {/* Toolbar buttons - only show for dashboard state */}
            {!isOnboarding && symbols.length > 0 && (
              <div className="flex flex-wrap items-center gap-3 pt-1">
                {/* Manage watchlist */}
                <Link
                  href="/for-you/watchlist"
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-border/50 bg-card hover:border-emerald-500/30 hover:bg-card/80 text-sm text-foreground transition-all"
                >
                  <svg className="w-4 h-4 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 6h16M4 10h16M4 14h16M4 18h16" />
                  </svg>
                  管理持仓
                </Link>

                {/* Subscription toggle */}
                <button
                  onClick={handleSubscription}
                  disabled={subscriptionLoading}
                  className={`inline-flex items-center gap-2 px-4 py-2 rounded-lg border text-sm transition-all cursor-pointer disabled:cursor-not-allowed disabled:opacity-50 ${
                    isSubscribed
                      ? 'border-emerald-500/20 bg-emerald-500/5 text-emerald-400 hover:border-red-500/20 hover:text-red-400'
                      : 'border-border/50 bg-card text-muted-foreground hover:border-emerald-500/30 hover:text-foreground'
                  }`}
                >
                  {subscriptionLoading ? (
                    <div className="w-4 h-4 rounded-full border-2 border-current/20 border-t-current animate-spin" />
                  ) : (
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                    </svg>
                  )}
                  {isSubscribed ? '已订阅邮件' : '订阅邮件'}
                </button>

                {/* Generate today's digest - only when no today digest */}
                {!todayDigest && !generating && (
                  <button
                    onClick={handleGenerateDigest}
                    className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-emerald-600 text-white text-sm font-medium transition-all hover:bg-emerald-500 hover:shadow-lg hover:shadow-emerald-500/20 cursor-pointer"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                    </svg>
                    生成今日日报
                  </button>
                )}

                {/* Generating spinner */}
                {generating && (
                  <div className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-emerald-600/50 text-white text-sm font-medium">
                    <div className="w-4 h-4 rounded-full border-2 border-white/20 border-t-white animate-spin" />
                    生成中...
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </section>

      {/* Loading Watchlist */}
      {loadingWatchlist && (
        <div className="max-w-5xl mx-auto px-4 md:px-6 py-20">
          <div className="flex flex-col items-center justify-center gap-4">
            <div className="w-10 h-10 rounded-full border-2 border-emerald-500/20 border-t-emerald-500 animate-spin" />
            <p className="text-muted-foreground text-sm">加载你的数据...</p>
          </div>
        </div>
      )}

      {/* State A: Onboarding */}
      {!loadingWatchlist && isOnboarding && user && (
        <OnboardingSection
          onSelectTemplate={handleSelectTemplate}
          userId={user.id}
          userEmail={user.email}
        />
      )}

      {/* State B/C: Dashboard */}
      {!loadingWatchlist && symbols.length > 0 && (
        <>
          {/* Portfolio Snapshot Bar */}
          <PortfolioSnapshotBar
            symbols={symbols}
            quotes={quotes}
            isLoading={loadingQuotes}
          />

          {/* Error */}
          {error && (
            <div className="max-w-5xl mx-auto px-4 md:px-6 py-4">
              <div className="p-4 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-sm text-center">
                {error}
              </div>
            </div>
          )}

          {/* Inline Digest Report */}
          {displayDigest ? (
            <DigestInlineReport digest={displayDigest} />
          ) : (
            /* Empty state when no reports exist yet */
            <div className="max-w-5xl mx-auto px-4 md:px-6 py-16">
              <div className="flex flex-col items-center justify-center gap-4 text-center">
                <div className="w-16 h-16 rounded-full bg-emerald-500/10 flex items-center justify-center">
                  <svg className="w-8 h-8 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                </div>
                <h3 className="text-lg font-medium text-foreground">还没有日报</h3>
                <p className="text-sm text-muted-foreground max-w-sm">
                  点击上方"生成今日日报"按钮，AI 将基于你的 {symbols.length} 只持仓生成专属市场分析
                </p>
              </div>
            </div>
          )}

          {/* Recent Reports */}
          <RecentReports history={filteredHistory} totalHistory={totalHistory} />

        </>
      )}
    </main>
  );
}

export default function ForYouPage() {
  return (
    <PaywallGuard>
      <ForYouPageContent />
    </PaywallGuard>
  );
}
