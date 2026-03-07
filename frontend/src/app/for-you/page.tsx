'use client';

import { useState, useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '@/contexts/AuthContext';
import PaywallGuard from '@/components/PaywallGuard';
import { api, DigestResponse } from '@/lib/api';
import { marketTodayStr } from '@/lib/timezone';
import { userDigestToResponse } from '@/lib/digest-utils';
import DigestInlineReport from '@/components/for-you/DigestInlineReport';
import RecentReports from '@/components/for-you/RecentReports';
import { useWatchlist } from '@/hooks/queries/use-watchlist';
import { useDigestList, useGenerateDigest } from '@/hooks/queries/use-digest-data';

function ForYouPageContent() {
  const router = useRouter();
  const { user, isLoading: authLoading, isAuthenticated } = useAuth();

  // --- TanStack Query hooks ---
  const { data: watchlistData, isLoading: loadingWatchlist, isError: watchlistLoadFailed } = useWatchlist(user?.id, !!user?.id);
  const { data: digestData } = useDigestList(user?.id ?? '', 10, 0, !!user?.id);
  const generateDigestMutation = useGenerateDigest();

  const symbols = useMemo(() => {
    if (!watchlistData?.symbols || watchlistData.symbols.length === 0) return [];
    return [...new Set(watchlistData.symbols.map((s: string) => s.toUpperCase()))];
  }, [watchlistData]);

  const history = digestData?.data ?? [];
  const totalHistory = digestData?.total ?? 0;

  const displayDigest: DigestResponse | null = useMemo(() => {
    if (history.length === 0) return null;
    return userDigestToResponse(history[0]);
  }, [history]);

  // Subscription state (kept as-is, simple boolean toggle)
  const [isSubscribed, setIsSubscribed] = useState(false);
  const [subscribing, setSubscribing] = useState(false);
  const [checkingSubscription, setCheckingSubscription] = useState(false);

  // Today's digest detection
  const todayDigest = useMemo(() => {
    if (history.length === 0) return null;
    return history[0].digest_date === marketTodayStr() ? history[0] : null;
  }, [history]);

  // History items for RecentReports, skipping the first item when it's displayed inline
  const filteredHistory = useMemo(() => {
    if (!displayDigest || history.length === 0) return history;
    return history.slice(1);
  }, [history, displayDigest]);

  const generating = generateDigestMutation.isPending;
  const error = generateDigestMutation.error
    ? (generateDigestMutation.error instanceof Error ? generateDigestMutation.error.message : 'Failed to generate digest')
    : null;

  // --- Effects ---

  useEffect(() => {
    if (!authLoading && !isAuthenticated) {
      router.push('/login?redirect=/for-you');
    }
  }, [authLoading, isAuthenticated, router]);

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

  const handleGenerateDigest = () => {
    if (!user?.id) return;
    generateDigestMutation.mutate({ symbols });
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

  // Only show onboarding if watchlist loaded successfully AND is empty.
  // Never show onboarding when the load failed - that would let the user
  // accidentally overwrite their existing watchlist via template selection.
  const isOnboarding = !loadingWatchlist && !watchlistLoadFailed && symbols.length === 0;
  const subscriptionLoading = subscribing || checkingSubscription;

  return (
    <main className="min-h-screen bg-background">
      {/* Page Header */}
      <section className="border-b border-border/50">
        <div className="max-w-5xl mx-auto px-4 md:px-6 py-8 md:py-12">
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <div className="h-px flex-1 max-w-[60px] bg-gradient-to-r from-primary to-transparent" />
              <span className="text-primary text-xs font-medium tracking-[0.2em] uppercase">MYBREW</span>
              {symbols.length > 0 && (
                <span className="text-muted-foreground text-xs font-medium tracking-[0.15em] ml-2">/ {symbols.length} STOCKS</span>
              )}
            </div>
            <h1 className="text-3xl md:text-4xl font-editorial text-foreground tracking-tight">
              {isOnboarding ? 'MyBrew' : '持仓总览'}
            </h1>
            <p className="text-muted-foreground text-sm md:text-base max-w-lg">
              {isOnboarding
                ? '添加你的持仓，获取专属投资日报'
                : '你的持仓和市场动态，一目了然'}
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

      {/* State: Load failed */}
      {!loadingWatchlist && watchlistLoadFailed && (
        <div className="max-w-5xl mx-auto px-4 md:px-6 py-12">
          <div className="flex flex-col items-center justify-center gap-4 py-12 rounded-xl border border-dashed border-red-500/30 bg-red-500/5">
            <div className="w-12 h-12 rounded-full bg-red-500/10 flex items-center justify-center">
              <svg className="w-6 h-6 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4.5c-.77-.833-2.694-.833-3.464 0L3.34 16.5c-.77.833.192 2.5 1.732 2.5z" />
              </svg>
            </div>
            <p className="text-sm text-red-400 font-medium">加载持仓数据失败</p>
            <p className="text-xs text-muted-foreground text-center max-w-xs">
              无法连接到服务器，请刷新页面重试。
            </p>
            <button
              onClick={() => window.location.reload()}
              className="mt-2 inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-card border border-border/50 text-sm text-foreground hover:border-emerald-500/30 transition-colors cursor-pointer"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
              刷新页面
            </button>
          </div>

          {/* Still show existing digest history if available */}
          {displayDigest && <DigestInlineReport digest={displayDigest} />}
          {history.length > 0 && <RecentReports history={history} totalHistory={totalHistory} />}
        </div>
      )}

      {/* State A: Empty watchlist - direct to watchlist management */}
      {!loadingWatchlist && isOnboarding && user && (
        <div className="max-w-5xl mx-auto px-4 md:px-6 py-16">
          <div className="flex flex-col items-center justify-center gap-6 py-16 rounded-xl border border-dashed border-border/50 bg-card/30">
            <div className="w-14 h-14 rounded-full bg-emerald-500/10 flex items-center justify-center">
              <svg className="w-7 h-7 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 4v16m8-8H4" />
              </svg>
            </div>
            <div className="text-center space-y-2">
              <h2 className="text-lg font-medium text-foreground">
                添加你的持仓
              </h2>
              <p className="text-sm text-muted-foreground max-w-sm">
                搜索并添加你关注的股票，我们将为你生成专属的每日投资分析
              </p>
            </div>
            <Link
              href="/for-you/watchlist"
              className="inline-flex items-center gap-2 px-6 py-3 rounded-lg bg-emerald-600 text-white text-sm font-medium transition-all hover:bg-emerald-500 hover:shadow-lg hover:shadow-emerald-500/20"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
              </svg>
              管理我的持仓
            </Link>
          </div>
        </div>
      )}

      {/* State B/C: Dashboard */}
      {!loadingWatchlist && symbols.length > 0 && (
        <>
          {/* Error */}
          {error && (
            <div className="max-w-5xl mx-auto px-4 md:px-6 py-4">
              <div className="p-4 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-sm text-center">
                {error}
              </div>
            </div>
          )}

          {/* Full Digest Report */}
          {displayDigest && (
            <DigestInlineReport digest={displayDigest} />
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
