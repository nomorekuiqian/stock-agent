'use client';

import { useState, useEffect, useCallback, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { useFeatureFlags } from '@/hooks/use-feature-flags';
import { useStockSearch } from '@/hooks/useStockSearch';
import { useSaveInvestmentProfile, useInvestmentProfile } from '@/hooks/queries/use-portfolio';
import { Progress } from '@/components/ui/progress';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { RadioGroup } from '@/components/ui/radio-group';
import { Command } from 'cmdk';
import StockSearchDropdown from '@/components/StockSearchDropdown';
import { Search, X, ArrowLeft, ArrowRight, Check, TrendingUp, Scale, Zap, Shield, Target, Flame } from 'lucide-react';
import { ForYouBreadcrumb } from '@/components/for-you/ForYouBreadcrumb';
import type { StockSearchResult, InvestmentStyle, InvestmentHorizon, RiskTolerance } from '@/lib/api';
import { api } from '@/lib/api';
import { getCurrency } from '@/lib/currency';

// Local type extending StockSearchResult with optional amount for onboarding
interface OnboardingStock extends StockSearchResult {
  amount: number | null;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const MAX_STOCKS = 30;

const STYLE_OPTIONS: {
  value: InvestmentStyle;
  label: string;
  description: string;
  icon: typeof TrendingUp;
  horizon: InvestmentHorizon;
}[] = [
  {
    value: 'passive',
    label: '被动投资',
    description: '以指数和ETF为主，长期持有',
    icon: TrendingUp,
    horizon: 'long',
  },
  {
    value: 'balanced',
    label: '平衡投资',
    description: '指数打底，适度配置个股',
    icon: Scale,
    horizon: 'mid',
  },
  {
    value: 'active',
    label: '主动投资',
    description: '深度研究个股，积极交易',
    icon: Zap,
    horizon: 'short',
  },
];

const RISK_OPTIONS: {
  value: RiskTolerance;
  label: string;
  description: string;
  icon: typeof Shield;
}[] = [
  {
    value: 'low',
    label: '保守',
    description: '亏10%就会焦虑，优先保本',
    icon: Shield,
  },
  {
    value: 'moderate',
    label: '适中',
    description: '能接受20%回撤，追求合理回报',
    icon: Target,
  },
  {
    value: 'high',
    label: '激进',
    description: '能承受大波动，追求高收益',
    icon: Flame,
  },
];

const STEP_TITLES = ['投资风格', '风险偏好', '添加持仓'];

// ---------------------------------------------------------------------------
// Step 1: Investment Style
// ---------------------------------------------------------------------------

function StepStyle({
  value,
  onChange,
}: {
  value: InvestmentStyle | null;
  onChange: (v: InvestmentStyle) => void;
}) {
  return (
    <div className="space-y-6">
      <div className="space-y-2 text-center">
        <h2 className="text-xl font-semibold text-foreground">选择你的投资风格</h2>
        <p className="text-sm text-muted-foreground">我们会根据风格为你调整分析内容</p>
      </div>
      <RadioGroup
        value={value ?? ''}
        onValueChange={(v) => onChange(v as InvestmentStyle)}
        className="grid gap-3"
      >
        {STYLE_OPTIONS.map((opt) => {
          const Icon = opt.icon;
          const selected = value === opt.value;
          return (
            <Card
              key={opt.value}
              className={`relative cursor-pointer p-4 transition-all ${
                selected
                  ? 'border-primary bg-primary/5 shadow-md shadow-primary/10'
                  : 'border-border hover:border-primary/40 hover:bg-card/80'
              }`}
              onClick={() => onChange(opt.value)}
            >
              <div className="flex items-center gap-4">
                <div
                  className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${
                    selected ? 'bg-primary/15 text-primary' : 'bg-muted text-muted-foreground'
                  }`}
                >
                  <Icon className="h-5 w-5" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-foreground">{opt.label}</span>
                    {selected && <Check className="h-4 w-4 text-primary" />}
                  </div>
                  <p className="text-sm text-muted-foreground">{opt.description}</p>
                </div>
              </div>
            </Card>
          );
        })}
      </RadioGroup>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Step 2: Risk Tolerance
// ---------------------------------------------------------------------------

function StepRisk({
  value,
  onChange,
}: {
  value: RiskTolerance | null;
  onChange: (v: RiskTolerance) => void;
}) {
  return (
    <div className="space-y-6">
      <div className="space-y-2 text-center">
        <h2 className="text-xl font-semibold text-foreground">你的风险承受能力</h2>
        <p className="text-sm text-muted-foreground">帮助我们为你匹配更合适的资讯</p>
      </div>
      <RadioGroup
        value={value ?? ''}
        onValueChange={(v) => onChange(v as RiskTolerance)}
        className="grid gap-3"
      >
        {RISK_OPTIONS.map((opt) => {
          const Icon = opt.icon;
          const selected = value === opt.value;
          return (
            <Card
              key={opt.value}
              className={`relative cursor-pointer p-4 transition-all ${
                selected
                  ? 'border-primary bg-primary/5 shadow-md shadow-primary/10'
                  : 'border-border hover:border-primary/40 hover:bg-card/80'
              }`}
              onClick={() => onChange(opt.value)}
            >
              <div className="flex items-center gap-4">
                <div
                  className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${
                    selected ? 'bg-primary/15 text-primary' : 'bg-muted text-muted-foreground'
                  }`}
                >
                  <Icon className="h-5 w-5" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-foreground">{opt.label}</span>
                    {selected && <Check className="h-4 w-4 text-primary" />}
                  </div>
                  <p className="text-sm text-muted-foreground">{opt.description}</p>
                </div>
              </div>
            </Card>
          );
        })}
      </RadioGroup>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Step 3: Add Stocks
// ---------------------------------------------------------------------------

function StepStocks({
  stocks,
  onAdd,
  onRemove,
  onAmountChange,
}: {
  stocks: OnboardingStock[];
  onAdd: (stock: StockSearchResult) => void;
  onRemove: (symbol: string) => void;
  onAmountChange: (symbol: string, amount: number | null) => void;
}) {
  const {
    query,
    results,
    isSearching,
    open,
    containerRef,
    onQueryChange,
    inputHandlers,
    resetAfterSelect,
  } = useStockSearch({ limit: 8 });

  const addedSymbols = stocks.map((s) => s.symbol);
  const atLimit = stocks.length >= MAX_STOCKS;

  const handleSelect = useCallback(
    (result: StockSearchResult) => {
      if (!addedSymbols.includes(result.symbol) && !atLimit) {
        onAdd(result);
      }
      resetAfterSelect();
    },
    [addedSymbols, atLimit, onAdd, resetAfterSelect],
  );

  return (
    <div className="space-y-6">
      <div className="space-y-2 text-center">
        <h2 className="text-xl font-semibold text-foreground">添加关注股票</h2>
        <p className="text-sm text-muted-foreground">
          这些股票将加入你的关注列表。填写模拟金额可获得更精准的分析（可选）
        </p>
      </div>

      {/* Search Input */}
      <Command className="relative" shouldFilter={false}>
        <div ref={containerRef} className="relative">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Command.Input
              value={query}
              onValueChange={onQueryChange}
              onCompositionStart={inputHandlers.onCompositionStart}
              onCompositionEnd={inputHandlers.onCompositionEnd}
              onFocus={inputHandlers.onFocus}
              placeholder="搜索股票代码或名称..."
              className="w-full rounded-lg border border-border bg-background py-2.5 pl-9 pr-4 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none"
            />
          </div>
          {open && (
            <StockSearchDropdown
              results={results}
              isSearching={isSearching}
              showEmpty={query.length > 0}
              mode="watchlist"
              inListSymbols={addedSymbols}
              onSelect={handleSelect}
              onAdd={handleSelect}
              atLimit={atLimit}
            />
          )}
        </div>
      </Command>

      {/* Stock count */}
      {stocks.length > 0 && (
        <p className="text-xs text-muted-foreground text-center">
          已添加 {stocks.length} / {MAX_STOCKS}
        </p>
      )}

      {/* Added stocks as rows with optional amount input */}
      {stocks.length > 0 && (
        <div className="space-y-2">
          {stocks.map((stock) => {
            const currency = getCurrency(stock.symbol);
            return (
              <div
                key={stock.symbol}
                className="flex items-center gap-3 rounded-lg border border-border bg-card px-3 py-2"
              >
                <span className="font-mono font-medium text-xs text-foreground w-16 shrink-0">
                  {stock.symbol}
                </span>
                <span className="text-sm text-muted-foreground truncate min-w-0 flex-1">
                  {stock.name}
                </span>
                <div className="flex items-center gap-1.5 shrink-0">
                  <span className="text-xs text-muted-foreground">{currency.symbol}</span>
                  <input
                    type="number"
                    placeholder="可选"
                    value={stock.amount ?? ''}
                    onChange={(e) => {
                      const val = e.target.value;
                      onAmountChange(stock.symbol, val === '' ? null : Math.max(0, Math.round(Number(val) || 0)));
                    }}
                    className="w-24 rounded-md border border-border bg-background px-2 py-1 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                    min={0}
                  />
                </div>
                <button
                  type="button"
                  onClick={() => onRemove(stock.symbol)}
                  className="shrink-0 rounded-full p-1 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
                  aria-label={`移除 ${stock.symbol}`}
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            );
          })}
        </div>
      )}

      {/* Empty state */}
      {stocks.length === 0 && (
        <div className="rounded-xl border border-dashed border-border/50 bg-card/30 py-10 text-center">
          <p className="text-sm text-muted-foreground">搜索并添加你感兴趣的股票</p>
          <p className="mt-1 text-sm text-muted-foreground/70">也可以跳过此步骤，稍后再添加</p>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main Onboarding Content (needs useSearchParams, so wrapped in Suspense)
// ---------------------------------------------------------------------------

function OnboardingContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user, isLoading: authLoading, isAuthenticated } = useAuth();
  const { has: hasFlag, isLoading: flagsLoading } = useFeatureFlags();

  // Parse step from URL, default to 1
  const rawStep = searchParams.get('step');
  const step = rawStep ? Math.min(3, Math.max(1, parseInt(rawStep, 10) || 1)) : 1;

  // Fetch existing profile to prefill for returning users
  const { data: existingProfile } = useInvestmentProfile(user?.id);

  // Local state
  const [style, setStyle] = useState<InvestmentStyle | null>(null);
  const [riskTolerance, setRiskTolerance] = useState<RiskTolerance | null>(null);
  const [stocks, setStocks] = useState<OnboardingStock[]>([]);
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [prefilled, setPrefilled] = useState(false);

  // Prefill from existing profile (for returning users editing their profile)
  useEffect(() => {
    if (prefilled || !existingProfile?.onboarded_at) return;
    if (!style && existingProfile.style) setStyle(existingProfile.style);
    if (!riskTolerance && existingProfile.risk_tolerance) setRiskTolerance(existingProfile.risk_tolerance);
    setPrefilled(true);
  }, [existingProfile, prefilled, style, riskTolerance]);

  // Mutations
  const saveProfile = useSaveInvestmentProfile();

  // Auth redirect
  useEffect(() => {
    if (!authLoading && !isAuthenticated) {
      router.push('/login?redirect=/for-you/onboarding');
    }
  }, [authLoading, isAuthenticated, router]);

  // Navigation helpers
  const goToStep = useCallback(
    (s: number) => {
      router.push(`/for-you/onboarding?step=${s}`, { scroll: false });
    },
    [router],
  );

  const canProceed = step === 1 ? !!style : step === 2 ? !!riskTolerance : true;

  const handleNext = useCallback(() => {
    if (step < 3) {
      goToStep(step + 1);
    }
  }, [step, goToStep]);

  const handleBack = useCallback(() => {
    if (step > 1) {
      goToStep(step - 1);
    }
  }, [step, goToStep]);

  // Stock management
  const handleAddStock = useCallback((stock: StockSearchResult) => {
    setStocks((prev) => {
      if (prev.length >= MAX_STOCKS) return prev;
      if (prev.some((s) => s.symbol === stock.symbol)) return prev;
      return [...prev, { ...stock, amount: null }];
    });
  }, []);

  const handleAmountChange = useCallback((symbol: string, amount: number | null) => {
    setStocks((prev) =>
      prev.map((s) => (s.symbol === symbol ? { ...s, amount } : s)),
    );
  }, []);

  const handleRemoveStock = useCallback((symbol: string) => {
    setStocks((prev) => prev.filter((s) => s.symbol !== symbol));
  }, []);

  // Complete onboarding
  const handleComplete = useCallback(async () => {
    if (!user || !style || !riskTolerance) return;
    let portfolioSaveFailed = false;
    setIsSaving(true);
    setSaveError(null);

    // Derive horizon from style
    const horizon: InvestmentHorizon =
      style === 'passive' ? 'long' : style === 'balanced' ? 'mid' : 'short';

    try {
      const promises: Promise<unknown>[] = [
        saveProfile.mutateAsync({
          userId: user.id,
          data: { style, horizon, risk_tolerance: riskTolerance },
        }),
      ];

      if (stocks.length > 0) {
        const symbols = stocks.map((s) => s.symbol);
        promises.push(
          api.watchlist.save(user.id, symbols),
        );
      }

      await Promise.all(promises);

      // If any stock has an amount, also save as portfolio rows with cost_basis
      const portfolioRows = stocks
        .filter((s) => s.amount != null && s.amount > 0)
        .map((s) => ({ symbol: s.symbol, cost_basis: s.amount }));

      if (portfolioRows.length > 0 && user.id) {
        // Save portfolio (will fail silently if user doesn't have Max entitlement)
        try {
          await api.portfolio.bulkSave(portfolioRows);
        } catch {
          portfolioSaveFailed = true;
        }
      }

      const params = new URLSearchParams();
      params.set('just_onboarded', '1');
      if (portfolioSaveFailed) params.set('portfolio_skipped', '1');
      router.push(`/for-you?${params.toString()}`);
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : '保存失败，请重试');
    } finally {
      setIsSaving(false);
    }
  }, [user, style, riskTolerance, stocks, saveProfile, router]);

  // Feature flag guard: redirect V1 users back to /for-you
  if (!flagsLoading && !hasFlag('for_you_v2')) {
    router.push('/for-you');
    return null;
  }

  // Loading / auth guard
  if (authLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    );
  }

  if (!isAuthenticated) {
    return null;
  }

  // Progress value: each completed step is 33.3%
  const progressValue = (step / 3) * 100;

  return (
    <main className="min-h-screen bg-background">
      {/* Breadcrumb */}
      <div className="mx-auto max-w-lg px-4 pt-6">
        <ForYouBreadcrumb current="投资画像" />
      </div>
      {/* Top progress bar */}
      <div className="sticky top-0 z-10 border-b border-border/50 bg-background/95 backdrop-blur-sm">
        <div className="mx-auto max-w-lg px-4 py-4">
          <div className="mb-3 flex items-center justify-between text-xs text-muted-foreground">
            <span>
              步骤 {step} / 3 &mdash; {STEP_TITLES[step - 1]}
            </span>
            {step === 3 && (
              <span className="text-muted-foreground/70">可选</span>
            )}
          </div>
          <Progress value={progressValue} className="h-1.5" />
        </div>
      </div>

      {/* Step content */}
      <div className="mx-auto max-w-lg px-4 py-8">
        {step === 1 && <StepStyle value={style} onChange={setStyle} />}
        {step === 2 && <StepRisk value={riskTolerance} onChange={setRiskTolerance} />}
        {step === 3 && (
          <StepStocks stocks={stocks} onAdd={handleAddStock} onRemove={handleRemoveStock} onAmountChange={handleAmountChange} />
        )}

        {/* Error display */}
        {saveError && (
          <div className="mt-4 rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
            {saveError}
          </div>
        )}

        {/* Navigation buttons */}
        <div className="mt-8 flex items-center justify-between gap-3">
          {/* Left side: Back */}
          <div>
            {step > 1 && (
              <Button variant="ghost" onClick={handleBack} className="gap-1.5">
                <ArrowLeft className="h-4 w-4" />
                上一步
              </Button>
            )}
          </div>

          {/* Right side: Next / Skip / Complete */}
          <div className="flex items-center gap-2">
            {step === 3 && stocks.length === 0 && (
              <Button
                variant="ghost"
                onClick={handleComplete}
                disabled={isSaving}
                className="text-muted-foreground"
              >
                跳过
              </Button>
            )}

            {step < 3 ? (
              <Button onClick={handleNext} disabled={!canProceed} className="gap-1.5">
                下一步
                <ArrowRight className="h-4 w-4" />
              </Button>
            ) : (
              <Button onClick={handleComplete} disabled={isSaving} className="gap-1.5">
                {isSaving ? (
                  <>
                    <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
                    保存中...
                  </>
                ) : (
                  <>
                    完成
                    <Check className="h-4 w-4" />
                  </>
                )}
              </Button>
            )}
          </div>
        </div>
      </div>
    </main>
  );
}

// ---------------------------------------------------------------------------
// Page export — wrap in Suspense for useSearchParams
// ---------------------------------------------------------------------------

export default function OnboardingPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center bg-background">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
        </div>
      }
    >
      <OnboardingContent />
    </Suspense>
  );
}
