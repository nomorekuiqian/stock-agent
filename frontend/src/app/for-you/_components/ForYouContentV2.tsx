"use client";

import { isFeaturePaused } from '@/lib/feature-pause';
import { useState, useEffect, useMemo, useCallback } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/contexts/AuthContext";
import { DigestResponse } from "@/lib/api";
import { clearStaleAuthAction } from "@/app/actions/auth";
import { getAuthErrorPresentation } from "@/lib/auth-error-presentation";
import { userDigestToResponse, parseChangePercent } from "@/lib/digest-utils";
import DigestInlineReport from "@/components/for-you/DigestInlineReport";
import RecentReports from "@/components/for-you/RecentReports";
import { AiChatLink } from "@/components/AiChatLink";
import { useWatchlist } from "@/hooks/queries/use-watchlist";
import { useDigestList } from "@/hooks/queries/use-digest-data";
import {
  useInvestmentProfile,
  usePortfolio,
} from "@/hooks/queries/use-portfolio";
import { ActionBar } from "@/components/for-you/ActionBar";
import { useQueryClient } from "@tanstack/react-query";
import { queryKeys } from "@/hooks/queries/query-keys";
import { ArrowRight, CheckCircle2, Lightbulb, Target } from "lucide-react";

import { ForYouSkeleton } from "./ForYouSkeleton";
import WatchlistPreview from "./WatchlistPreview";

export function ForYouPageContentV2() {
  const router = useRouter();
  const { user, isLoading: authLoading, isAuthenticated } = useAuth();
  const queryClient = useQueryClient();
  const searchParams = useSearchParams();
  const justOnboarded = searchParams.get("just_onboarded") === "1";
  const portfolioSkipped = searchParams.get("portfolio_skipped") === "1";

  // --- TanStack Query hooks ---
  const {
    data: watchlistData,
    isLoading: loadingWatchlist,
    isError: watchlistLoadFailed,
    error: watchlistError,
  } = useWatchlist(user?.id, !!user?.id);
  const {
    data: digestData,
    isLoading: loadingDigest,
    error: digestError,
  } = useDigestList(user?.id ?? "", 10, 0, !!user?.id);
  const { data: profileData } = useInvestmentProfile(user?.id);
  const { data: portfolioData, isLoading: loadingPortfolio } = usePortfolio(
    user?.id,
  );

  const symbols = useMemo(() => {
    const portfolioSyms = (portfolioData?.holdings ?? []).map(
      (h: { symbol: string }) => h.symbol.toUpperCase(),
    );
    const watchlistSyms = (watchlistData?.symbols ?? []).map((s: string) =>
      s.toUpperCase(),
    );
    return [...new Set([...portfolioSyms, ...watchlistSyms])];
  }, [portfolioData, watchlistData]);

  const history = digestData?.data ?? [];
  const totalHistory = digestData?.total ?? 0;

  const displayDigest: DigestResponse | null = useMemo(() => {
    if (history.length === 0) return null;
    const best =
      history.find((d) => d.analysis && d.analysis.length > 0) ?? history[0];
    return userDigestToResponse(best);
  }, [history]);

  const thesisMap = useMemo(() => {
    const map: Record<string, string> = {};
    for (const h of portfolioData?.holdings ?? []) {
      if (h.thesis) map[h.symbol] = h.thesis;
    }
    return map;
  }, [portfolioData]);

  // Visible (non-ghost) holdings — full HoldingView rows. Passed to
  // DigestInlineReport so 我的持仓 renders from truth (shares × price)
  // instead of digest.stocks ∩ portfolioSymbols.
  const visibleHoldings = useMemo(
    () =>
      (portfolioData?.holdings ?? []).filter(
        (h) =>
          (h.effective_weight_pct ?? 0) > 0 ||
          h.shares != null ||
          h.cost_basis != null ||
          h.weight_pct != null,
      ),
    [portfolioData?.holdings],
  );

  const portfolioSymbolSet = useMemo(
    () => new Set(visibleHoldings.map((h) => h.symbol)),
    [visibleHoldings],
  );

  const portfolioWeightMap = useMemo(
    () =>
      Object.fromEntries(
        (portfolioData?.holdings ?? [])
          // Drop 0% rows so watchlist items don't render a misleading "0.0%" tag.
          .filter((h) => (h.effective_weight_pct ?? 0) > 0)
          .map((h) => [h.symbol, h.effective_weight_pct]),
      ),
    [portfolioData?.holdings],
  );

  const portfolioTotals = useMemo(() => {
    const holdings = portfolioData?.holdings ?? [];
    if (holdings.length === 0)
      return {
        totalMV: undefined,
        dailyChg: undefined,
        dailyChgPct: undefined,
      };
    const mvValues = holdings
      .map((h) => h.market_value)
      .filter((v): v is number => v != null);
    if (mvValues.length === 0)
      return {
        totalMV: undefined,
        dailyChg: undefined,
        dailyChgPct: undefined,
      };
    const totalMV = mvValues.reduce((a, b) => a + b, 0);
    const digestStocks = displayDigest?.stocks ?? [];
    const changeMap = new Map(
      digestStocks.map((s) => [s.symbol, parseChangePercent(s.daily_change)]),
    );
    let dailyChgPct = 0;
    for (const h of holdings) {
      if (h.symbol === "$CASH") continue;
      const pct = changeMap.get(h.symbol) ?? 0;
      dailyChgPct += (h.effective_weight_pct / 100) * pct;
    }
    const dailyChg = (totalMV * (dailyChgPct / 100)) / (1 + dailyChgPct / 100);
    return {
      totalMV: Math.round(totalMV),
      dailyChg: Math.round(dailyChg),
      dailyChgPct: Number(dailyChgPct.toFixed(1)),
    };
  }, [portfolioData?.holdings, displayDigest?.stocks]);

  const handleThesisSaved = useCallback(
    (_symbol: string, _thesis: string) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.portfolio.all });
    },
    [queryClient],
  );

  const [isReauthenticating, setIsReauthenticating] = useState(false);
  const [showOnboardedBanner, setShowOnboardedBanner] = useState(justOnboarded);

  useEffect(() => {
    if (justOnboarded) {
      window.history.replaceState(null, "", "/for-you");
      const timer = setTimeout(() => setShowOnboardedBanner(false), 5000);
      return () => clearTimeout(timer);
    }
  }, [justOnboarded]);

  const filteredHistory = useMemo(() => {
    if (!displayDigest || history.length === 0) return history;
    return history.slice(1);
  }, [history, displayDigest]);

  const loadErrorMessage = getAuthErrorPresentation(
    watchlistError ?? digestError,
    "无法连接到服务器，请刷新页面重试。",
  ).message;

  useEffect(() => {
    if (!authLoading && !isAuthenticated) {
      router.push("/login?redirect=/for-you");
    }
  }, [authLoading, isAuthenticated, router]);

  const handleReLogin = async () => {
    setIsReauthenticating(true);
    try {
      await clearStaleAuthAction();
    } finally {
      window.location.assign("/login?redirect=/for-you");
    }
  };

  if (authLoading) {
    return <ForYouSkeleton />;
  }

  if (!isAuthenticated) {
    return null;
  }

  const dataLoading = loadingWatchlist || loadingDigest || loadingPortfolio;
  const needsOnboarding =
    !dataLoading &&
    !watchlistLoadFailed &&
    !profileData?.onboarded_at &&
    symbols.length === 0;
  const isOnboarding = needsOnboarding;

  return (
    <main className="min-h-screen bg-background">
      {/* Page Header */}
      <section className="border-b border-border/50">
        <div className="max-w-5xl mx-auto px-4 md:px-6 py-8 md:py-12">
          <div className="space-y-4">
            <div className="flex items-center gap-3 animate-fade-in-up">
              <div className="h-px flex-1 max-w-[60px] bg-gradient-to-r from-primary to-transparent animate-line-expand" />
              <span className="text-primary text-xs font-semibold tracking-[0.25em] uppercase">
                专属日报
              </span>
              {!dataLoading && symbols.length > 0 && (
                <span className="text-muted-foreground text-xs font-semibold tracking-[0.2em] ml-2">
                  / {symbols.length} Stocks
                </span>
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
                  MyBrew · 专属日报
                </h1>
                <p className="text-muted-foreground text-sm md:text-base max-w-lg leading-relaxed animate-fade-in-up delay-200">
                  {isOnboarding
                    ? "完成画像设置，解锁专属投资分析"
                    : displayDigest
                      ? "基于你的偏好和持仓，为你定制"
                      : "添加关注股票，获取第一份专属日报"}
                </p>

                {/* AI Chat link */}
                {!dataLoading && symbols.length > 0 && displayDigest && (
                  <div className="flex flex-wrap items-center gap-3 pt-1 animate-fade-in-up delay-300">
                    <AiChatLink href="/research?context=brew" />
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      </section>

      {showOnboardedBanner && (
        <div className="max-w-5xl mx-auto px-4 md:px-6 pt-4 animate-fade-in-up">
          <div className="flex items-center gap-3 px-4 py-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-700 dark:text-emerald-400">
            <CheckCircle2 className="h-5 w-5 flex-shrink-0" aria-hidden />
            <span className="text-sm flex-1">
              {symbols.length > 0
                ? "自选股已保存，首份专属日报将在今晚收盘后自动生成"
                : portfolioSkipped
                  ? "导览已完成，添加关注股票后开始接收专属分析"
                  : "导览已完成，添加你的第一只关注股票"}
            </span>
            <button
              type="button"
              onClick={() => setShowOnboardedBanner(false)}
              className="p-1 rounded-full hover:bg-emerald-500/10 transition-colors"
              aria-label="关闭"
            >
              <svg
                className="w-4 h-4"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M6 18L18 6M6 6l12 12"
                />
              </svg>
            </button>
          </div>
        </div>
      )}

      {/* Action Bar — independent query, renders after header */}
      {isAuthenticated && !dataLoading && symbols.length > 0 && <ActionBar />}

      {/* Nudge: has stocks but hasn't completed profile */}
      {!isFeaturePaused('onboarding') && !dataLoading && symbols.length > 0 && !profileData?.onboarded_at && (
        <div className="max-w-5xl mx-auto px-4 md:px-6 pt-4">
          <Link
            href="/for-you/onboarding"
            className="flex items-center gap-3 px-4 py-3 rounded-lg bg-amber-500/10 border border-amber-500/20 hover:bg-amber-500/15 transition-colors group"
          >
            <Lightbulb
              className="h-5 w-5 shrink-0 text-amber-500"
              aria-hidden
            />
            <span className="text-sm text-foreground/80 group-hover:text-foreground transition-colors">
              完善专属日报设置，让自选股监控更准确
            </span>
            <ArrowRight
              className="ml-auto h-4 w-4 text-muted-foreground"
              aria-hidden
            />
          </Link>
        </div>
      )}

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
              <svg
                className="w-6 h-6 text-red-400"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={1.5}
                  d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4.5c-.77-.833-2.694-.833-3.464 0L3.34 16.5c-.77.833.192 2.5 1.732 2.5z"
                />
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
              {isReauthenticating ? "跳转中..." : "重新登录"}
            </button>
          </div>
          {displayDigest && (
            <DigestInlineReport
              digest={displayDigest}
              variant="v2"
              thesisMap={thesisMap}
              onThesisSaved={handleThesisSaved}
              portfolioSymbols={portfolioSymbolSet}
              holdings={visibleHoldings}
              portfolioWeightMap={portfolioWeightMap}
              totalMarketValue={portfolioTotals.totalMV}
              totalDailyChange={portfolioTotals.dailyChg}
              totalDailyChangePct={portfolioTotals.dailyChgPct}
            />
          )}
          {history.length > 0 && (
            <RecentReports history={history} totalHistory={totalHistory} />
          )}
        </div>
      )}

      {/* State A: Empty — no stocks, prompt to set up */}
      {!dataLoading && isOnboarding && user && (
        <div className="max-w-5xl mx-auto px-4 md:px-6 py-16">
          <div className="flex flex-col items-center justify-center gap-4 py-16 rounded-xl border border-dashed border-border/50 bg-card/30 animate-fade-in-up">
            <div className="w-14 h-14 rounded-full bg-primary/10 flex items-center justify-center">
              <Target className="h-7 w-7 text-primary" aria-hidden />
            </div>
            <div className="text-center space-y-2">
              <h2 className="text-lg font-editorial text-foreground">
                开始你的专属日报
              </h2>
              <p className="text-sm text-muted-foreground text-center max-w-sm">
                添加至少 3 只自选股，系统会围绕它们监控新闻、风险和催化剂。
              </p>
            </div>
            <Link
              href="/for-you/watchlist"
              className="inline-flex min-h-11 items-center gap-2 rounded-lg bg-primary px-5 text-sm font-medium text-primary-foreground transition hover:bg-primary/90 active:scale-[0.98]"
            >
              开始设置我的日报
              <ArrowRight className="h-4 w-4" aria-hidden />
            </Link>
          </div>
        </div>
      )}

      {/* State B: Has stocks but no digest yet — show watchlist with live quotes */}
      {!dataLoading && symbols.length > 0 && !displayDigest && (
        <WatchlistPreview symbols={symbols} />
      )}

      {/* State C: Full dashboard with digest */}
      {!dataLoading && symbols.length > 0 && displayDigest && (
        <>
          <DigestInlineReport
            digest={displayDigest}
            variant="v2"
            thesisMap={thesisMap}
            onThesisSaved={handleThesisSaved}
            portfolioSymbols={portfolioSymbolSet}
            holdings={visibleHoldings}
            portfolioWeightMap={portfolioWeightMap}
            totalMarketValue={portfolioTotals.totalMV}
            totalDailyChange={portfolioTotals.dailyChg}
            totalDailyChangePct={portfolioTotals.dailyChgPct}
          />
          <RecentReports
            history={filteredHistory}
            totalHistory={totalHistory}
          />
        </>
      )}
    </main>
  );
}
