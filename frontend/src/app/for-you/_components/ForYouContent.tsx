'use client';

import { useState, useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '@/contexts/AuthContext';
import PaywallGuard from '@/components/PaywallGuard';
import { useQueryClient } from '@tanstack/react-query';
import { api, DigestResponse } from '@/lib/api';
import { clearStaleAuthAction } from '@/app/actions/auth';
import { getAuthErrorPresentation } from '@/lib/auth-error-presentation';
import { userDigestToResponse } from '@/lib/digest-utils';
import DigestInlineReport from '@/components/for-you/DigestInlineReport';
import RecentReports from '@/components/for-you/RecentReports';
import { AiChatLink } from '@/components/AiChatLink';
import { useWatchlist } from '@/hooks/queries/use-watchlist';
import { useDigestList } from '@/hooks/queries/use-digest-data';
import { useEmailPreferences } from '@/hooks/queries/use-preferences';
import { queryKeys } from '@/hooks/queries/query-keys';
import { ForYouSkeleton } from './ForYouSkeleton';

function ForYouPageContent() {
  const router = useRouter();
  const { user, isLoading: authLoading, isAuthenticated } = useAuth();

  // --- TanStack Query hooks ---
  const {
    data: watchlistData,
    isLoading: loadingWatchlist,
    isError: watchlistLoadFailed,
    error: watchlistError,
  } = useWatchlist(user?.id, !!user?.id);
  const { data: digestData, isLoading: loadingDigest, error: digestError } = useDigestList(user?.id ?? '', 10, 0, !!user?.id);

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

  const queryClient = useQueryClient();
  const { data: emailPrefs } = useEmailPreferences(isAuthenticated);
  const isSubscribed = emailPrefs?.personal_digest ?? false;
  const prefsLoading = isAuthenticated && emailPrefs === undefined;
  const [subscribing, setSubscribing] = useState(false);
  const [isReauthenticating, setIsReauthenticating] = useState(false);

  // History items for RecentReports, skipping the first item when it's displayed inline
  const filteredHistory = useMemo(() => {
    if (!displayDigest || history.length === 0) return history;
    return history.slice(1);
  }, [history, displayDigest]);

  const loadErrorMessage = getAuthErrorPresentation(
    watchlistError ?? digestError,
    '无法连接到服务器，请刷新页面重试。'
  ).message;

  // --- Effects ---

  useEffect(() => {
    if (!authLoading && !isAuthenticated) {
      router.push('/login?redirect=/for-you');
    }
  }, [authLoading, isAuthenticated, router]);

  // --- Handlers ---

  const handleSubscription = async () => {
    if (!user?.email) return;

    setSubscribing(true);
    try {
      if (isSubscribed) {
        const result = await api.subscriptions.updatePreferences({ personal_digest: false });
        if (result.success) {
          queryClient.setQueryData(queryKeys.subscriptions.preferences(), result.preferences);
        }
      } else {
        try {
          const result = await api.subscriptions.updatePreferences({ personal_digest: true });
          if (result.success) {
            queryClient.setQueryData(queryKeys.subscriptions.preferences(), result.preferences);
          } else {
            throw new Error('update failed');
          }
        } catch {
          const result = await api.subscriptions.subscribe('personal_digest', {
            email: user.email,
            user_id: user.id,
          });
          if (result.success) {
            queryClient.invalidateQueries({ queryKey: queryKeys.subscriptions.preferences() });
          }
        }
      }
    } catch (err) {
      console.error('Subscription action failed:', err);
    } finally {
      setSubscribing(false);
    }
  };

  const handleReLogin = async () => {
    setIsReauthenticating(true);
    try {
      await clearStaleAuthAction();
    } finally {
      window.location.assign('/login?redirect=/for-you');
    }
  };

  // Auth loading — show skeleton matching Suspense fallback for seamless transition
  if (authLoading) {
    return <ForYouSkeleton />;
  }

  if (!isAuthenticated) {
    return null;
  }

  // --- Three-state rendering ---

  const dataLoading = loadingWatchlist || loadingDigest;
  const isOnboarding = !dataLoading && !watchlistLoadFailed && symbols.length === 0;
  const subscriptionLoading = subscribing;

  return (
    <main className="min-h-screen bg-background">
      {/* Page Header */}
      <section className="border-b border-border/50">
        <div className="max-w-5xl mx-auto px-4 md:px-6 py-8 md:py-12">
          <div className="space-y-4">
            <div className="flex items-center gap-3 animate-fade-in-up">
              <div className="h-px flex-1 max-w-[60px] bg-gradient-to-r from-primary to-transparent animate-line-expand" />
              <span className="text-primary text-xs font-semibold tracking-[0.25em] uppercase">MyBrew</span>
              {!dataLoading && symbols.length > 0 && (
                <span className="text-muted-foreground text-xs font-semibold tracking-[0.2em] ml-2">/ {symbols.length} Stocks</span>
              )}
            </div>

            {dataLoading ? (
              <>
                <div className="h-10 w-44 bg-muted rounded-lg animate-pulse" />
                <div className="h-4 w-60 bg-muted rounded-lg animate-pulse" />
                <div className="flex items-center gap-3 pt-1">
                  <div className="h-9 w-24 bg-muted rounded-lg animate-pulse" />
                  <div className="h-9 w-24 bg-muted rounded-lg animate-pulse" />
                  <div className="h-9 w-28 bg-muted rounded-lg animate-pulse" />
                </div>
              </>
            ) : (
              <>
                <h1 className="text-3xl md:text-5xl font-editorial text-foreground tracking-tight leading-[1.1] animate-fade-in-up delay-100">
                  {isOnboarding ? 'MyBrew' : '持仓总览'}
                </h1>
                <p className="text-muted-foreground text-sm md:text-base max-w-lg leading-relaxed animate-fade-in-up delay-200">
                  {isOnboarding
                    ? '添加你的持仓，获取专属投资日报'
                    : '你的持仓和市场动态，一目了然'}
                </p>

                {/* Toolbar buttons - only show for dashboard state */}
                {!isOnboarding && symbols.length > 0 && (
                  <div className="flex flex-wrap items-center gap-3 pt-1 animate-fade-in-up delay-300">
                    {/* Manage watchlist */}
                    <Link
                      href="/for-you/watchlist"
                      className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-border/50 bg-card hover:border-primary/30 hover:bg-card/80 text-sm text-foreground transition-all"
                    >
                      <svg className="w-4 h-4 text-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 6h16M4 10h16M4 14h16M4 18h16" />
                      </svg>
                      管理持仓
                    </Link>

                    {/* Chat with AI about digest */}
                    {displayDigest && (
                      <AiChatLink href="/research?context=brew" />
                    )}

                    {/* Subscription toggle */}
                    {prefsLoading ? (
                      <div className="w-28 h-9 rounded-lg bg-muted animate-pulse" />
                    ) : (
                      <button
                        onClick={handleSubscription}
                        disabled={subscriptionLoading}
                        className={`inline-flex items-center gap-2 px-4 py-2 rounded-lg border text-sm transition-all cursor-pointer disabled:cursor-not-allowed disabled:opacity-50 ${
                          isSubscribed
                            ? 'border-primary/20 bg-primary/5 text-primary hover:border-red-500/20 hover:text-red-400'
                            : 'border-border/50 bg-card text-muted-foreground hover:border-primary/30 hover:text-foreground'
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
                    )}

                  </div>
                )}
              </>
            )}
          </div>
        </div>
      </section>

      {/* Loading skeleton */}
      {dataLoading && (
        <div className="max-w-5xl mx-auto px-4 md:px-6 py-8 space-y-4">
          <div className="h-72 bg-muted/60 rounded-xl animate-pulse" />
          <div className="h-32 bg-muted/40 rounded-xl animate-pulse" />
          <div className="h-32 bg-muted/40 rounded-xl animate-pulse" />
        </div>
      )}

      {/* State: Load failed */}
      {!dataLoading && watchlistLoadFailed && (
        <div className="max-w-5xl mx-auto px-4 md:px-6 py-12">
          <div className="flex flex-col items-center justify-center gap-4 py-12 rounded-xl border border-dashed border-red-500/30 bg-red-500/5">
            <div className="w-12 h-12 rounded-full bg-red-500/10 flex items-center justify-center">
              <svg className="w-6 h-6 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4.5c-.77-.833-2.694-.833-3.464 0L3.34 16.5c-.77.833.192 2.5 1.732 2.5z" />
              </svg>
            </div>
            <p className="text-sm text-red-400 font-medium">加载持仓数据失败</p>
            <p className="text-xs text-muted-foreground text-center max-w-sm">
              {loadErrorMessage}
            </p>
            <button
              type="button"
              onClick={handleReLogin}
              disabled={isReauthenticating}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-red-500/20 bg-background/80 text-sm font-medium text-foreground transition-all hover:border-primary/30 hover:text-primary disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isReauthenticating ? '跳转中...' : '重新登录'}
            </button>
          </div>
          {/* Still show existing digest history if available */}
          {displayDigest && <DigestInlineReport digest={displayDigest} />}
          {history.length > 0 && <RecentReports history={history} totalHistory={totalHistory} />}
        </div>
      )}

      {/* State A: Empty watchlist - direct to watchlist management */}
      {!dataLoading && isOnboarding && user && (
        <div className="max-w-5xl mx-auto px-4 md:px-6 py-16">
          <div className="flex flex-col items-center justify-center gap-6 py-16 rounded-xl border border-dashed border-border/50 bg-card/30 animate-fade-in-up">
            <div className="w-14 h-14 rounded-full bg-primary/10 flex items-center justify-center animate-float">
              <svg className="w-7 h-7 text-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 4v16m8-8H4" />
              </svg>
            </div>
            <div className="text-center space-y-2">
              <h2 className="text-lg font-editorial text-foreground">
                添加你的持仓
              </h2>
              <p className="text-sm text-muted-foreground max-w-sm">
                搜索并添加你关注的股票，我们将为你生成专属的每日投资分析
              </p>
            </div>
            <Link
              href="/for-you/watchlist"
              className="inline-flex items-center gap-2 px-6 py-3 rounded-lg bg-primary text-primary-foreground text-sm font-medium transition-all hover:bg-primary/90 hover:shadow-lg hover:shadow-primary/20 active:scale-[0.97]"
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
      {!dataLoading && symbols.length > 0 && (
        <>
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

export function ForYouContent() {
  return (
    <PaywallGuard requiredFeature="for_you_website">
      <ForYouPageContent />
    </PaywallGuard>
  );
}
