"use client";

import { useState, useCallback } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { Suspense } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useStockSearch } from "@/hooks/useStockSearch";
import { useSaveWatchlist } from "@/hooks/queries/use-watchlist";
import { StockSearchResult } from "@/lib/api";
import { STOCK_NAMES } from "@/lib/stock-names";
import {
  X,
  Search,
  ArrowRight,
  Check,
  BarChart3,
  LineChart,
  MessageSquare,
  Newspaper,
  Star,
} from "lucide-react";

const POPULAR_GROUPS: { label: string; symbols: string[] }[] = [
  {
    label: "Mag 7",
    symbols: ["AAPL", "MSFT", "GOOGL", "AMZN", "META", "NVDA", "TSLA"],
  },
  {
    label: "AI & Chips",
    symbols: ["AMD", "AVGO", "TSM", "ARM", "QCOM", "MU"],
  },
  {
    label: "Cloud & SaaS",
    symbols: ["CRM", "ORCL", "NOW", "PLTR", "SNOW", "CRWD"],
  },
  {
    label: "Finance",
    symbols: ["JPM", "GS", "V", "MA", "BRK.B"],
  },
];

const MAX_WATCHLIST = 10;

const FEATURES = [
  {
    icon: Newspaper,
    title: "每日市场日报",
    desc: "每天收盘后，AI 为你提炼当日市场要点，直达邮箱",
    href: "/today",
  },
  {
    icon: BarChart3,
    title: "宏观仪表盘",
    desc: "流动性、经济、通胀、情绪四维信号灯，一眼看懂市场环境",
    href: "/macro",
  },
  {
    icon: LineChart,
    title: "个股深度研究",
    desc: "基本面、技术面、新闻舆情、宏观关联，AI 全方位分析每一只股票",
    href: "/stock",
  },
  {
    icon: MessageSquare,
    title: "AI 投研助手",
    desc: "用自然语言对话，像跟分析师聊天一样做投研",
    href: "/research",
  },
  {
    icon: Star,
    title: "专属持仓日报",
    desc: "添加自选股后，每天收到只分析你持仓的个性化报告",
    href: "/for-you",
  },
];

function OnboardingContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user, isLoading: authLoading, isAuthenticated } = useAuth();
  const saveWatchlistMutation = useSaveWatchlist();

  const currentStep = Number(searchParams.get("step") || "1");

  // Step 2 state: watchlist
  const [selectedSymbols, setSelectedSymbols] = useState<string[]>([]);
  const [extraNames, setExtraNames] = useState<
    Record<string, { en: string; zh: string }>
  >({});

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const {
    query: searchQuery,
    results: searchResults,
    isSearching,
    open: showDropdown,
    containerRef: searchContainerRef,
    onQueryChange,
    inputHandlers,
    resetAfterSelect,
  } = useStockSearch({ limit: 6 });

  const atLimit = selectedSymbols.length >= MAX_WATCHLIST;

  const addSymbol = useCallback(
    (symbol: string, name?: string) => {
      if (selectedSymbols.length >= MAX_WATCHLIST) return;
      const sym = symbol.trim().toUpperCase();
      if (sym && !selectedSymbols.includes(sym)) {
        setSelectedSymbols((prev) => [...prev, sym]);
        if (name && !STOCK_NAMES[sym] && !extraNames[sym]) {
          setExtraNames((prev) => ({ ...prev, [sym]: { en: name, zh: "" } }));
        }
      }
    },
    [selectedSymbols, extraNames]
  );

  const removeSymbol = useCallback((symbol: string) => {
    setSelectedSymbols((prev) => prev.filter((s) => s !== symbol));
  }, []);

  const handleSearchSelect = useCallback(
    (result: StockSearchResult) => {
      addSymbol(result.symbol, result.name);
      resetAfterSelect();
    },
    [addSymbol, resetAfterSelect]
  );

  const handleComplete = useCallback(async () => {
    if (!user?.id) return;
    setSaving(true);
    setError(null);
    try {
      if (selectedSymbols.length > 0) {
        await saveWatchlistMutation.mutateAsync({
          userId: user.id,
          symbols: selectedSymbols,
        });
      }
      router.push("/today");
    } catch {
      setError("保存失败，请重试");
      setSaving(false);
    }
  }, [user, selectedSymbols, saveWatchlistMutation, router]);

  const firstName = user?.name?.split(" ")[0] || user?.email?.split("@")[0] || "";

  // Auth loading state
  if (authLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="w-8 h-8 rounded-full border-2 border-primary/20 border-t-primary animate-spin" />
      </div>
    );
  }

  // Not logged in
  if (!isAuthenticated) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center px-4">
        <div className="max-w-md w-full text-center space-y-6">
          <p className="text-xs text-muted-foreground uppercase tracking-widest">
            TheMarketBrew
          </p>
          <h1 className="text-2xl font-editorial text-foreground">
            请先登录
          </h1>
          <p className="text-sm text-muted-foreground">
            登录后即可开始设置你的个性化体验
          </p>
          <Link
            href="/login?redirect=/onboarding"
            className="inline-block px-6 py-3 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90 transition-colors"
          >
            前往登录
          </Link>
        </div>
      </div>
    );
  }

  // ── Step 1: Welcome + Feature Introduction ──
  if (currentStep === 1) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center px-4 py-12">
        <div className="max-w-lg w-full">
          {/* Progress */}
          <div className="flex items-center gap-2 mb-10">
            <div className="h-1 flex-1 rounded-full bg-primary" />
            <div className="h-1 flex-1 rounded-full bg-border" />
          </div>

          {/* Welcome header */}
          <div className="text-center mb-10">
            <div className="w-14 h-14 rounded-full bg-primary/10 border border-primary/20 flex items-center justify-center mx-auto mb-5">
              <Check className="w-6 h-6 text-primary" />
            </div>
            <h1 className="text-2xl md:text-3xl font-editorial text-foreground mb-3">
              {firstName ? `${firstName}，欢迎加入` : "欢迎加入 TheMarketBrew"}
            </h1>
            <p className="text-base text-muted-foreground leading-relaxed max-w-md mx-auto">
              你的 <span className="text-primary font-medium">14 天 Max 全功能体验</span>已经开始了。
              接下来的两周里，你可以自由探索我们为你准备的一切。
            </p>
            <p className="text-xs text-muted-foreground/70 mt-2">
              无需信用卡，到期后自动结束
            </p>
          </div>

          {/* Feature list */}
          <div className="space-y-3 mb-10">
            <p className="text-xs text-muted-foreground/70 font-medium uppercase tracking-wider px-1">
              你可以使用的功能
            </p>
            {FEATURES.map((feat) => (
              <Link
                key={feat.title}
                href={feat.href}
                className="group flex items-start gap-4 p-4 rounded-xl border border-border/40 bg-card/50 hover:border-primary/30 hover:bg-primary/5 transition-colors"
              >
                <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center shrink-0 mt-0.5">
                  <feat.icon className="w-4.5 h-4.5 text-primary" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-foreground group-hover:text-primary transition-colors">{feat.title}</p>
                  <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">
                    {feat.desc}
                  </p>
                </div>
                <ArrowRight className="w-4 h-4 text-muted-foreground/70 group-hover:text-primary shrink-0 mt-1 transition-colors" />
              </Link>
            ))}
          </div>

          {/* CTA */}
          <button
            type="button"
            onClick={() => router.push("/onboarding?step=2")}
            className="w-full px-4 py-3 bg-primary text-primary-foreground rounded-lg font-medium text-sm hover:bg-primary/90 transition-all duration-200 flex items-center justify-center gap-2"
          >
            设置我的自选股
            <ArrowRight className="w-4 h-4" />
          </button>

          <p className="mt-4 text-center text-xs text-muted-foreground">
            <Link
              href="/today"
              className="hover:text-foreground transition-colors"
            >
              跳过，直接开始
            </Link>
          </p>
        </div>
      </div>
    );
  }

  // ── Step 2: Add Watchlist ──
  return (
    <div className="min-h-screen bg-background flex items-center justify-center px-4 py-12">
      <div className="max-w-lg w-full">
        {/* Progress */}
        <div className="flex items-center gap-2 mb-8">
          <div className="h-1 flex-1 rounded-full bg-primary" />
          <div className="h-1 flex-1 rounded-full bg-primary" />
        </div>

        <div className="space-y-2 mb-8">
          <p className="text-xs text-muted-foreground uppercase tracking-widest">
            TheMarketBrew
          </p>
          <h1 className="text-2xl font-editorial text-foreground">
            添加你关注的股票
          </h1>
          <p className="text-sm text-muted-foreground leading-relaxed">
            告诉我们你在关注哪些股票，我们会每天为你生成专属持仓日报。
            你也可以随时在设置中修改。
          </p>
        </div>

        {/* Search input */}
        <div ref={searchContainerRef} className="relative mb-6">
          <div
            className={`flex items-center gap-3 px-4 py-3 rounded-xl border transition-colors ${
              atLimit
                ? "border-amber-500/30 bg-amber-500/5"
                : "border-border/50 bg-card/80 focus-within:border-primary/40"
            }`}
          >
            <Search className="w-5 h-5 text-muted-foreground shrink-0" />
            <input
              value={searchQuery}
              onChange={(e) => onQueryChange(e.target.value)}
              {...inputHandlers}
              placeholder="搜索股票代码或公司名称..."
              className="flex-1 bg-transparent text-sm text-foreground placeholder:text-muted-foreground/70 outline-none"
              autoComplete="off"
              autoCorrect="off"
              spellCheck={false}
              style={{ textTransform: "uppercase" }}
            />
            <span
              className={`text-xs font-mono tabular-nums shrink-0 ${
                atLimit ? "text-amber-400" : "text-muted-foreground"
              }`}
            >
              {selectedSymbols.length}/{MAX_WATCHLIST}
            </span>
          </div>

          {/* Search dropdown */}
          {showDropdown && (
            <div className="absolute z-50 w-full mt-1 rounded-xl border border-border/50 bg-card shadow-lg overflow-hidden">
              {isSearching ? (
                <div className="px-4 py-3 text-sm text-muted-foreground">
                  搜索中...
                </div>
              ) : searchResults.length === 0 ? (
                <div className="px-4 py-3 text-sm text-muted-foreground">
                  未找到结果
                </div>
              ) : (
                searchResults.map((result) => {
                  const inList = selectedSymbols.includes(result.symbol);
                  return (
                    <button
                      key={result.symbol}
                      type="button"
                      onClick={() => !inList && handleSearchSelect(result)}
                      disabled={inList || atLimit}
                      className="w-full flex items-center gap-3 px-4 py-2.5 text-left hover:bg-muted/50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      <span className="text-sm font-data font-semibold text-foreground w-16">
                        {result.symbol}
                      </span>
                      <span className="text-sm text-muted-foreground flex-1 truncate">
                        {result.name}
                      </span>
                      {inList ? (
                        <Check className="w-4 h-4 text-primary shrink-0" />
                      ) : (
                        <span className="text-xs text-muted-foreground/70 shrink-0">
                          {result.exchange}
                        </span>
                      )}
                    </button>
                  );
                })
              )}
            </div>
          )}
        </div>

        {/* Selected chips */}
        {selectedSymbols.length > 0 && (
          <div className="flex flex-wrap gap-2 mb-6">
            {selectedSymbols.map((sym) => (
              <span
                key={sym}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full border border-primary/40 bg-primary/10 text-sm text-primary"
              >
                <span className="font-data font-semibold">{sym}</span>
                {STOCK_NAMES[sym]?.zh && (
                  <span className="text-primary/70 text-xs">
                    {STOCK_NAMES[sym].zh}
                  </span>
                )}
                <button
                  type="button"
                  onClick={() => removeSymbol(sym)}
                  className="ml-0.5 hover:text-foreground transition-colors"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </span>
            ))}
          </div>
        )}

        {/* Popular groups */}
        <div className="space-y-4 mb-8">
          <p className="text-xs text-muted-foreground/70 font-medium uppercase tracking-wider">
            快速添加热门板块
          </p>
          {POPULAR_GROUPS.map((group) => (
            <div key={group.label}>
              <p className="text-xs text-muted-foreground/70 mb-2">
                {group.label}
              </p>
              <div className="flex flex-wrap gap-2">
                {group.symbols.map((sym) => {
                  const inList = selectedSymbols.includes(sym);
                  return (
                    <button
                      key={sym}
                      type="button"
                      onClick={() =>
                        inList
                          ? removeSymbol(sym)
                          : addSymbol(sym, STOCK_NAMES[sym]?.en)
                      }
                      disabled={!inList && atLimit}
                      className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs border transition-all duration-200 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed ${
                        inList
                          ? "border-primary/40 bg-primary/10 text-primary hover:bg-primary/5"
                          : "border-border/50 bg-card/50 text-muted-foreground hover:border-primary/40 hover:text-primary hover:bg-primary/5"
                      }`}
                    >
                      {inList && <Check className="w-3 h-3 shrink-0" />}
                      <span className="font-data font-semibold">{sym}</span>
                      {STOCK_NAMES[sym]?.zh && (
                        <span className="text-muted-foreground/70">
                          {STOCK_NAMES[sym].zh}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>

        {error && <p className="text-sm text-red-400 mb-4">{error}</p>}

        {/* Complete button */}
        <button
          type="button"
          onClick={handleComplete}
          disabled={saving}
          className="w-full px-4 py-3 bg-primary text-primary-foreground rounded-lg font-medium text-sm hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200 flex items-center justify-center gap-2"
        >
          {saving ? (
            <>
              <div className="w-4 h-4 rounded-full border-2 border-primary-foreground/30 border-t-primary-foreground animate-spin" />
              保存中...
            </>
          ) : (
            <>
              {selectedSymbols.length > 0 ? "保存并开始探索" : "跳过，直接开始"}
              <ArrowRight className="w-4 h-4" />
            </>
          )}
        </button>
      </div>
    </div>
  );
}

export default function OnboardingPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-background flex items-center justify-center">
          <div className="w-8 h-8 rounded-full border-2 border-primary/20 border-t-primary animate-spin" />
        </div>
      }
    >
      <OnboardingContent />
    </Suspense>
  );
}
