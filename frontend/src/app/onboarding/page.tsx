"use client";

import { useState, useCallback } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { Suspense } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useSubscription } from "@/contexts/SubscriptionContext";
import { useStockSearch } from "@/hooks/useStockSearch";
import { useSaveWatchlist } from "@/hooks/queries/use-watchlist";
import { api, StockSearchResult } from "@/lib/api";
import { STOCK_NAMES } from "@/lib/stock-names";
import {
  X,
  Search,
  ArrowRight,
  Check,
  BarChart3,
  Newspaper,
  Star,
  Sparkles,
  Mail,
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

const MAX_WATCHLIST = 25;
const MIN_WATCHLIST = 3;
const MAG7 = ["AAPL", "MSFT", "GOOGL", "AMZN", "META", "NVDA", "TSLA"];

// Used for the Step 3 modal sample digest copy (one of these stocks shown).
const SAMPLE_TICKERS: Record<string, { name: string; sampleHeadline: string; sampleInsight: string }> = {
  NVDA: {
    name: "NVIDIA",
    sampleHeadline: "数据中心 GPU 需求超预期 / 估值压力上升",
    sampleInsight: "短期: 财报后 AI 资本开支信号偏暖; 中期: 关注 hyperscaler 订单节奏 + 中美芯片关税演绎",
  },
  AAPL: {
    name: "Apple",
    sampleHeadline: "iPhone 17 销售温和 / 服务业务持续强劲",
    sampleInsight: "短期: 中国份额承压但服务利润率扩张; 中期: AI on-device 节奏决定明年估值",
  },
  TSLA: {
    name: "Tesla",
    sampleHeadline: "Cybercab 落地节奏 / 中国销量回暖",
    sampleInsight: "短期: 4Q 交付指引乐观; 中期: FSD 订阅渗透 + 储能业务双引擎",
  },
  MSFT: {
    name: "Microsoft",
    sampleHeadline: "Azure AI 营收占比突破 30% / Copilot 商业化加速",
    sampleInsight: "短期: AI 资本开支拖累毛利率; 中期: 企业 AI 标准化卡位优势明显",
  },
};

function OnboardingContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user, isLoading: authLoading, isAuthenticated } = useAuth();
  const { createCheckout } = useSubscription();
  const saveWatchlistMutation = useSaveWatchlist();

  const currentStep = Number(searchParams.get("step") || "1");

  const [selectedSymbols, setSelectedSymbols] = useState<string[]>([]);
  const [, setExtraNames] = useState<Record<string, { en: string; zh: string }>>({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [showStep3, setShowStep3] = useState(false);
  const [checkoutPending, setCheckoutPending] = useState(false);

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
  const belowMin = selectedSymbols.length < MIN_WATCHLIST;

  const addSymbol = useCallback(
    (symbol: string, name?: string) => {
      if (selectedSymbols.length >= MAX_WATCHLIST) return;
      const sym = symbol.trim().toUpperCase();
      if (sym && !selectedSymbols.includes(sym)) {
        setSelectedSymbols((prev) => [...prev, sym]);
        if (name && !STOCK_NAMES[sym]) {
          setExtraNames((prev) => ({ ...prev, [sym]: { en: name, zh: "" } }));
        }
      }
    },
    [selectedSymbols]
  );

  const removeSymbol = useCallback((symbol: string) => {
    setSelectedSymbols((prev) => prev.filter((s) => s !== symbol));
  }, []);

  const addGroup = useCallback((symbols: string[]) => {
    setSelectedSymbols((prev) => {
      const merged = [...prev];
      for (const sym of symbols) {
        if (merged.length >= MAX_WATCHLIST) break;
        if (!merged.includes(sym)) merged.push(sym);
      }
      return merged;
    });
  }, []);

  const handleSearchSelect = useCallback(
    (result: StockSearchResult) => {
      addSymbol(result.symbol, result.name);
      resetAfterSelect();
    },
    [addSymbol, resetAfterSelect]
  );

  const handleSaveWatchlist = useCallback(async () => {
    if (!user?.id) return;
    if (belowMin) return;
    setSaving(true);
    setError(null);
    try {
      await saveWatchlistMutation.mutateAsync({
        userId: user.id,
        symbols: selectedSymbols,
      });
      setShowStep3(true);
    } catch {
      setError("保存失败，请重试");
    } finally {
      setSaving(false);
    }
  }, [user, belowMin, selectedSymbols, saveWatchlistMutation]);

  const handleStep3Upgrade = useCallback(async () => {
    setCheckoutPending(true);
    try {
      // Mark onboarding complete first so the user doesn't bounce back here
      // if they cancel the Stripe checkout.
      await api.user.completeOnboarding().catch(() => {});
      // Stripe Checkout redirect — never returns control to this page.
      await createCheckout("pro");
    } catch {
      setCheckoutPending(false);
      setError("跳转支付失败，请稍后再试");
    }
  }, [createCheckout]);

  const handleStep3Skip = useCallback(async () => {
    setCheckoutPending(true);
    try {
      await api.user.completeOnboarding();
    } catch {
      // Non-blocking — let the user through even if marking failed; the
      // middleware will catch them next time if not.
    }
    router.push("/today");
  }, [router]);

  const firstName = user?.name?.split(" ")[0] || user?.email?.split("@")[0] || "";

  // Auth loading
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
          <h1 className="text-2xl font-editorial text-foreground">请先登录</h1>
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

  // ── Step 1: Welcome ──
  if (currentStep === 1 && !showStep3) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center px-4 py-12">
        <div className="max-w-lg w-full">
          <div className="flex items-center gap-2 mb-10">
            <div className="h-1 flex-1 rounded-full bg-primary" />
            <div className="h-1 flex-1 rounded-full bg-border" />
          </div>

          <div className="text-center mb-10">
            <div className="w-14 h-14 rounded-full bg-primary/10 border border-primary/20 flex items-center justify-center mx-auto mb-5">
              <Sparkles className="w-6 h-6 text-primary" />
            </div>
            <h1 className="text-2xl md:text-3xl font-editorial text-foreground mb-3">
              {firstName ? `${firstName}，欢迎加入` : "欢迎加入 TheMarketBrew"}
            </h1>
            <p className="text-base text-muted-foreground leading-relaxed max-w-md mx-auto">
              我们会先帮你把自选股录进系统，然后每天给你推送和持仓相关的市场情报。
            </p>
          </div>

          <div className="space-y-3 mb-10">
            <p className="text-xs text-muted-foreground/70 font-medium uppercase tracking-wider px-1">
              注册后即可使用
            </p>
            <div className="flex items-start gap-4 p-4 rounded-xl border border-border/40 bg-card/50">
              <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center shrink-0 mt-0.5">
                <Newspaper className="w-4 h-4 text-primary" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-foreground">每日市场日报</p>
                <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">
                  AI 提炼当日市场要点，每天收盘后直达邮箱
                </p>
              </div>
            </div>
            <div className="flex items-start gap-4 p-4 rounded-xl border border-border/40 bg-card/50">
              <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center shrink-0 mt-0.5">
                <Mail className="w-4 h-4 text-primary" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-foreground">推特日报（前 3 封免费）</p>
                <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">
                  注册后 3 天，每天发一份华尔街 KOL 观点聚合
                </p>
              </div>
            </div>
            <div className="flex items-start gap-4 p-4 rounded-xl border border-border/40 bg-card/50">
              <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center shrink-0 mt-0.5">
                <BarChart3 className="w-4 h-4 text-primary" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-foreground">AI 投研对话（每天 2 次）</p>
                <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">
                  自然语言问任何个股或宏观，AI 即刻给答案
                </p>
              </div>
            </div>
            <div className="flex items-start gap-4 p-4 rounded-xl border border-border/40 bg-card/50">
              <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center shrink-0 mt-0.5">
                <Star className="w-4 h-4 text-primary" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-foreground">自选股 25 只</p>
                <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">
                  下一步建好后，可订阅每日「专属日报」追踪你的持仓
                </p>
              </div>
            </div>
          </div>

          <button
            type="button"
            onClick={() => router.push("/onboarding?step=2")}
            className="w-full px-4 py-3 bg-primary text-primary-foreground rounded-lg font-medium text-sm hover:bg-primary/90 transition-all duration-200 flex items-center justify-center gap-2"
          >
            开始设置自选股
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      </div>
    );
  }

  // ── Step 3: Personal-digest upsell modal ──
  if (showStep3) {
    const sampleSymbol =
      selectedSymbols.find((s) => SAMPLE_TICKERS[s]) ??
      selectedSymbols.find((s) => MAG7.includes(s)) ??
      "NVDA";
    const sample = SAMPLE_TICKERS[sampleSymbol] ?? SAMPLE_TICKERS.NVDA;

    return (
      <div className="min-h-screen bg-background flex items-center justify-center px-4 py-12">
        <div className="max-w-lg w-full">
          <div className="text-center mb-6">
            <div className="w-14 h-14 rounded-full bg-primary/10 border border-primary/20 flex items-center justify-center mx-auto mb-4">
              <Star className="w-6 h-6 text-primary" />
            </div>
            <h2 className="text-2xl font-editorial text-foreground mb-2">
              为你的 {selectedSymbols.length} 只自选股，每天生成专属日报
            </h2>
            <p className="text-sm text-muted-foreground max-w-md mx-auto leading-relaxed">
              每天根据你的持仓 + 当日新闻，由 AI 生成一份个性化分析。
              不订阅，你建好的自选股没有日常 ROI。
            </p>
          </div>

          {/* Sample preview */}
          <div className="rounded-xl border border-border/50 bg-card/60 p-5 mb-6">
            <p className="text-xs text-muted-foreground/70 font-medium uppercase tracking-wider mb-3">
              专属日报示例 · {sample.name} ({sampleSymbol})
            </p>
            <div className="space-y-3">
              <div>
                <p className="text-xs text-muted-foreground/70 mb-1">今日要闻</p>
                <p className="text-sm text-foreground leading-relaxed">{sample.sampleHeadline}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground/70 mb-1">AI 视角</p>
                <p className="text-sm text-foreground leading-relaxed">{sample.sampleInsight}</p>
              </div>
            </div>
          </div>

          {error && <p className="text-sm text-red-400 mb-4 text-center">{error}</p>}

          <button
            type="button"
            onClick={handleStep3Upgrade}
            disabled={checkoutPending}
            className="w-full px-4 py-3 bg-primary text-primary-foreground rounded-lg font-medium text-sm hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200 flex items-center justify-center gap-2 mb-3"
          >
            {checkoutPending ? (
              <>
                <div className="w-4 h-4 rounded-full border-2 border-primary-foreground/30 border-t-primary-foreground animate-spin" />
                跳转中...
              </>
            ) : (
              <>
                升级 Pro 立即激活
                <ArrowRight className="w-4 h-4" />
              </>
            )}
          </button>

          <button
            type="button"
            onClick={handleStep3Skip}
            disabled={checkoutPending}
            className="w-full px-4 py-3 text-sm text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50"
          >
            稍后再说
          </button>
        </div>
      </div>
    );
  }

  // ── Step 2: Build watchlist ──
  return (
    <div className="min-h-screen bg-background flex items-center justify-center px-4 py-12">
      <div className="max-w-lg w-full">
        <div className="flex items-center gap-2 mb-8">
          <div className="h-1 flex-1 rounded-full bg-primary" />
          <div className="h-1 flex-1 rounded-full bg-primary" />
        </div>

        <div className="space-y-2 mb-8">
          <p className="text-xs text-muted-foreground uppercase tracking-widest">
            TheMarketBrew
          </p>
          <h1 className="text-2xl font-editorial text-foreground">添加你关注的股票</h1>
          <p className="text-sm text-muted-foreground leading-relaxed">
            录入你正在关注的股票（至少 {MIN_WATCHLIST} 只）。下一步我们会展示「专属日报」长什么样。
          </p>
        </div>

        {/* Search */}
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

          {showDropdown && (
            <div className="absolute z-50 w-full mt-1 rounded-xl border border-border/50 bg-card shadow-lg overflow-hidden">
              {isSearching ? (
                <div className="px-4 py-3 text-sm text-muted-foreground">搜索中...</div>
              ) : searchResults.length === 0 ? (
                <div className="px-4 py-3 text-sm text-muted-foreground">未找到结果</div>
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

        {selectedSymbols.length > 0 && (
          <div className="flex flex-wrap gap-2 mb-6">
            {selectedSymbols.map((sym) => (
              <span
                key={sym}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full border border-primary/40 bg-primary/10 text-sm text-primary"
              >
                <span className="font-data font-semibold">{sym}</span>
                {STOCK_NAMES[sym]?.zh && (
                  <span className="text-primary/70 text-xs">{STOCK_NAMES[sym].zh}</span>
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

        <div className="space-y-4 mb-8">
          <p className="text-xs text-muted-foreground/70 font-medium uppercase tracking-wider">
            快速添加热门板块
          </p>
          {POPULAR_GROUPS.map((group) => (
            <div key={group.label}>
              <div className="flex items-center justify-between mb-2">
                <p className="text-xs text-muted-foreground/70">{group.label}</p>
                <button
                  type="button"
                  onClick={() => addGroup(group.symbols)}
                  className="text-xs text-primary hover:text-primary/80 transition-colors"
                >
                  一键加全部 ({group.symbols.length})
                </button>
              </div>
              <div className="flex flex-wrap gap-2">
                {group.symbols.map((sym) => {
                  const inList = selectedSymbols.includes(sym);
                  return (
                    <button
                      key={sym}
                      type="button"
                      onClick={() =>
                        inList ? removeSymbol(sym) : addSymbol(sym, STOCK_NAMES[sym]?.en)
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
                        <span className="text-muted-foreground/70">{STOCK_NAMES[sym].zh}</span>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>

        {error && <p className="text-sm text-red-400 mb-4">{error}</p>}

        <button
          type="button"
          onClick={handleSaveWatchlist}
          disabled={saving || belowMin}
          className="w-full px-4 py-3 bg-primary text-primary-foreground rounded-lg font-medium text-sm hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200 flex items-center justify-center gap-2"
        >
          {saving ? (
            <>
              <div className="w-4 h-4 rounded-full border-2 border-primary-foreground/30 border-t-primary-foreground animate-spin" />
              保存中...
            </>
          ) : belowMin ? (
            <>还需添加 {MIN_WATCHLIST - selectedSymbols.length} 只</>
          ) : (
            <>
              下一步
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
