"use client";

import { useEffect, useMemo } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import { useFeatureFlags } from "@/hooks/use-feature-flags";
import { useAuth } from "@/contexts/AuthContext";
import { useEntitlements } from "@/contexts/EntitlementsContext";
import { useWatchlist } from "@/hooks/queries/use-watchlist";
import { usePortfolio } from "@/hooks/queries/use-portfolio";
import LockedDigestPreview from "./LockedDigestPreview";
import { ForYouPageContentV1 } from "./ForYouContentV1";
import { ForYouPageContentV2 } from "./ForYouContentV2";
import { ForYouSkeleton } from "./ForYouSkeleton";

export function ForYouContent() {
  const router = useRouter();
  const { has, isLoading: flagsLoading } = useFeatureFlags();
  const { isAuthenticated, isLoading: authLoading } = useAuth();
  const { has: hasEntitlement, isLoading: entLoading } = useEntitlements();
  const hasAccess = hasEntitlement("for_you_website");

  useEffect(() => {
    if (!authLoading && !isAuthenticated) {
      router.push("/login?redirect=/for-you");
    }
  }, [authLoading, isAuthenticated, router]);

  if (!authLoading && !isAuthenticated) {
    return <ForYouSkeleton />;
  }

  if (authLoading || entLoading || flagsLoading) {
    return <ForYouSkeleton />;
  }

  // Paid: hand off to the existing flow.
  if (hasAccess) {
    return has("for_you_v2") ? (
      <ForYouPageContentV2 />
    ) : (
      <ForYouPageContentV1 />
    );
  }

  // Logged-in but no entitlement: soft-lock preview (portfolio visible,
  // every AI section blurred + MAX upgrade CTAs).
  return <LockedDigestShell />;
}

function LockedDigestShell() {
  const { user } = useAuth();
  const { data: watchlistData } = useWatchlist(user?.id, !!user?.id);
  const { data: portfolioData } = usePortfolio(user?.id);

  const symbols = useMemo(() => {
    const portfolioSyms = (portfolioData?.holdings ?? []).map(
      (h: { symbol: string }) => h.symbol.toUpperCase(),
    );
    const watchlistSyms = (watchlistData?.symbols ?? []).map((s: string) =>
      s.toUpperCase(),
    );
    return [...new Set([...portfolioSyms, ...watchlistSyms])];
  }, [portfolioData, watchlistData]);

  return (
    <main className="min-h-screen bg-background">
      <section className="border-b border-border/50">
        <div className="max-w-5xl mx-auto px-4 md:px-6 py-8 md:py-12">
          <div className="flex items-center gap-3 mb-3">
            <div className="h-px flex-1 max-w-[60px] bg-gradient-to-r from-indigo-500 to-transparent" />
            <span className="text-indigo-600 dark:text-indigo-400 text-xs font-semibold tracking-[0.25em] uppercase">
              专属日报
            </span>
          </div>
          <h1 className="text-3xl md:text-5xl font-editorial text-foreground tracking-tight leading-[1.1]">
            MyBrew · 专属日报
          </h1>
          <p className="text-muted-foreground text-sm md:text-base max-w-lg leading-relaxed mt-3">
            升级 Pro 后,每天美股收盘后为你自动生成持仓 + 自选股的完整 AI
            分析,并推送专属日报。
          </p>
        </div>
      </section>

      {symbols.length === 0 ? (
        <EmptyWatchlistPrompt />
      ) : (
        <LockedDigestPreview symbols={symbols} />
      )}
    </main>
  );
}

function EmptyWatchlistPrompt() {
  return (
    <div className="max-w-5xl mx-auto px-4 md:px-6 py-16">
      <div className="flex flex-col items-center justify-center gap-3 py-16 rounded-xl border border-dashed border-border/50 bg-card/30">
        <p className="text-sm text-muted-foreground text-center max-w-sm">
          添加你的持仓或自选股,然后升级 MAX 即可解锁每日 AI 专属日报。
        </p>
        <Link
          href="/for-you/watchlist"
          className="inline-flex items-center gap-2 rounded-md border border-primary/30 bg-primary/10 px-4 py-2 text-sm font-medium text-primary transition hover:border-primary"
        >
          添加自选股
        </Link>
      </div>
    </div>
  );
}
