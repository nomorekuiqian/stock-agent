'use client';

import { ReactNode, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { useSubscription } from '@/contexts/SubscriptionContext';
import { useEntitlements } from '@/contexts/EntitlementsContext';
import { Zap, ArrowRight, Crown } from 'lucide-react';
import { PRICING } from '@/lib/pricing';

const PAYWALL_ENABLED = process.env.NEXT_PUBLIC_ENABLE_PAYWALL === 'true';

interface PaywallGuardProps {
  children: ReactNode;
  /** Minimum plan required: 'pro' (Pro or Max) or 'max' (Max only). Default: 'pro'. */
  requiredPlan?: 'pro' | 'max';
  /** Feature key to check via entitlements API. Takes precedence over requiredPlan. */
  requiredFeature?: string;
  /** Preview content to show behind a gradient overlay instead of the full lock screen. */
  preview?: ReactNode;
}

const MAX_ONLY_FEATURES = new Set([
  'stock_research',
  'ai_research_engine',
  'twitter_digest',
]);

export default function PaywallGuard({ children, requiredPlan = 'pro', requiredFeature, preview }: PaywallGuardProps) {
  const router = useRouter();
  const { isAuthenticated, isLoading: authLoading } = useAuth();
  const { isPro, isMax, isLoading: subLoading, createCheckout } = useSubscription();
  const { has: hasEntitlement, isLoading: entLoading } = useEntitlements();

  const [checkoutLoading, setCheckoutLoading] = useState(false);

  if (!PAYWALL_ENABLED) {
    return <>{children}</>;
  }

  const isLoadingState = requiredFeature
    ? authLoading || entLoading
    : authLoading || subLoading;

  if (isLoadingState) {
    return (
      <main className="min-h-screen bg-background flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <div className="w-8 h-8 rounded-full border-2 border-primary/20 border-t-primary animate-spin" />
          <p className="text-muted-foreground text-sm">...</p>
        </div>
      </main>
    );
  }

  const hasAccess = requiredFeature
    ? hasEntitlement(requiredFeature)
    : requiredPlan === 'max' ? isMax : isPro;

  if (hasAccess) {
    return <>{children}</>;
  }

  const isProNeedsMax = requiredFeature
    ? isPro && MAX_ONLY_FEATURES.has(requiredFeature)
    : isPro && requiredPlan === 'max';

  // --- Preview mode: blurred preview with CTA overlay ---
  if (preview && !isProNeedsMax) {
    return (
      <PreviewOverlay
        preview={preview}
        isAuthenticated={isAuthenticated}
        requiredPlan={requiredPlan === 'max' ? 'max' : 'pro'}
      />
    );
  }

  const handleUpgradeToMax = async () => {
    if (!isAuthenticated) {
      router.push('/login?redirect=/pricing');
      return;
    }
    setCheckoutLoading(true);
    await createCheckout('max');
    setCheckoutLoading(false);
  };

  // --- Pro user needs Max upgrade ---
  if (isProNeedsMax) {
    return (
      <main className="min-h-screen bg-background flex items-center justify-center p-4">
        <div className="w-full max-w-md">
          <div className="text-center mb-8">
            <div className="w-12 h-12 rounded-full bg-amber-400/10 border border-amber-400/20 flex items-center justify-center mx-auto mb-4">
              <Crown className="w-5 h-5 text-amber-400" />
            </div>
            <p className="text-xs font-semibold tracking-[0.25em] uppercase text-amber-400 mb-2">Max</p>
            <h1 className="text-2xl font-editorial text-foreground mb-2">此功能需要 Max 订阅</h1>
            <p className="text-sm text-muted-foreground">
              升级 Max 解锁推特 KOL 日报、AI 投研引擎无限使用和 AI 深度个股分析
            </p>
          </div>

          <div className="space-y-3 mb-6">
            <button
              onClick={handleUpgradeToMax}
              disabled={checkoutLoading}
              className="w-full flex items-center gap-4 p-4 rounded-xl border border-amber-400/30 bg-amber-400/5 hover:bg-amber-400/10 transition-colors cursor-pointer"
            >
              <div className="w-10 h-10 rounded-lg bg-amber-400/15 flex items-center justify-center shrink-0">
                <Crown className="w-5 h-5 text-amber-400" />
              </div>
              <div className="flex-1 min-w-0 text-left">
                <p className="text-sm font-semibold text-foreground">升级到 Max</p>
                <p className="text-xs text-muted-foreground">{PRICING.maxPerMonth} · 全部功能解锁</p>
              </div>
              {checkoutLoading ? (
                <div className="w-4 h-4 rounded-full border-2 border-amber-400/30 border-t-amber-400 animate-spin shrink-0" />
              ) : (
                <ArrowRight className="w-4 h-4 text-amber-400 shrink-0" />
              )}
            </button>

            <Link
              href="/pricing"
              className="group flex items-center gap-4 p-4 rounded-xl border border-border/50 bg-card/50 hover:border-border transition-colors"
            >
              <div className="w-10 h-10 rounded-lg bg-muted/50 flex items-center justify-center shrink-0">
                <Zap className="w-5 h-5 text-muted-foreground" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-foreground">查看方案对比</p>
                <p className="text-xs text-muted-foreground">了解 Pro 和 Max 的区别</p>
              </div>
              <ArrowRight className="w-4 h-4 text-muted-foreground shrink-0 transition-transform group-hover:translate-x-0.5" />
            </Link>
          </div>

          <div className="text-center">
            <p className="text-xs text-muted-foreground/70">
              Max 包含：推特 KOL 日报 · AI 投研引擎（无限使用）· AI 深度个股分析 · 全部 Pro 功能
            </p>
          </div>
        </div>
      </main>
    );
  }

  // --- Free / unauthenticated user needs any paid plan ---
  return <LockScreen isAuthenticated={isAuthenticated} requiredPlan={requiredPlan} />;
}

// ---------------------------------------------------------------------------
// Preview overlay component (shown when `preview` prop is provided)
// ---------------------------------------------------------------------------

function PreviewOverlay({
  preview,
  isAuthenticated,
  requiredPlan,
}: {
  preview: ReactNode;
  isAuthenticated: boolean;
  requiredPlan: 'pro' | 'max';
}) {
  return (
    <div className="relative overflow-hidden">
      {/* Preview content, no interaction */}
      <div className="pointer-events-none select-none" aria-hidden="true">
        {preview}
      </div>
      {/* Gradient overlay */}
      <div className="absolute inset-x-0 bottom-0 h-48 md:h-80 bg-gradient-to-t from-background via-background/95 to-transparent" />
      {/* CTA overlay */}
      <div className="absolute inset-x-0 bottom-0 text-center pb-12 space-y-3">
        {!isAuthenticated ? (
          <>
            <p className="text-lg font-medium text-foreground">
              注册后免费收每日报告
            </p>
            <Link
              href="/login"
              className="inline-flex items-center gap-2 px-6 py-3 bg-primary text-primary-foreground rounded-lg text-sm font-medium transition-all hover:bg-primary/90 active:scale-[0.98]"
            >
              免费注册
              <ArrowRight className="w-4 h-4" />
            </Link>
          </>
        ) : (
          <>
            <p className="text-lg font-medium text-foreground">
              {requiredPlan === 'max' ? '升级 Max 解锁此功能' : '升级 Pro 解锁此功能'}
            </p>
            <Link
              href="/pricing"
              className="inline-flex items-center gap-2 px-6 py-3 bg-primary text-primary-foreground rounded-lg text-sm font-medium transition-all hover:bg-primary/90 active:scale-[0.98]"
            >
              查看订阅方案
              <ArrowRight className="w-4 h-4" />
            </Link>
          </>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Lock screen component (full page, no preview)
// ---------------------------------------------------------------------------

function LockScreen({
  isAuthenticated,
  requiredPlan,
}: {
  isAuthenticated: boolean;
  requiredPlan: string;
}) {
  return (
    <main className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="w-12 h-12 rounded-full bg-primary/10 border border-primary/20 flex items-center justify-center mx-auto mb-4">
            <Zap className="w-5 h-5 text-primary" />
          </div>
          <p className="text-xs font-semibold tracking-[0.25em] uppercase text-primary mb-2">TheMarketBrew</p>
          <h1 className="text-2xl font-editorial text-foreground mb-2">
            {requiredPlan === 'max' ? '此功能需要 Max 订阅' : '此功能需要订阅'}
          </h1>
          <p className="text-sm text-muted-foreground">
            {requiredPlan === 'max'
              ? '升级 Max 解锁推特 KOL 日报、AI 投研无限使用 + AI 深度个股分析'
              : '订阅 Pro 解锁专属持仓日报、盘前早报、宏观周报等邮件订阅'}
          </p>
        </div>

        <div className="space-y-3 mb-6">
          {!isAuthenticated && (
            <Link
              href="/login"
              className="group flex items-center gap-4 p-4 rounded-xl border border-primary/30 bg-primary/5 hover:bg-primary/10 transition-colors"
            >
              <div className="w-10 h-10 rounded-lg bg-primary/15 flex items-center justify-center shrink-0">
                <Zap className="w-5 h-5 text-primary" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-foreground">免费注册</p>
                <p className="text-xs text-muted-foreground">每日市场报告 · 自选股 · AI 投研体验</p>
              </div>
              <ArrowRight className="w-4 h-4 text-primary shrink-0 transition-transform group-hover:translate-x-0.5" />
            </Link>
          )}

          <Link
            href="/pricing"
            className="group flex items-center gap-4 p-4 rounded-xl border border-primary/30 bg-primary/5 hover:bg-primary/10 transition-colors"
          >
            <div className="w-10 h-10 rounded-lg bg-primary/15 flex items-center justify-center shrink-0">
              <Zap className="w-5 h-5 text-primary" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-foreground">
                {requiredPlan === 'max' ? '升级 Max' : '升级 Pro'}
              </p>
              <p className="text-xs text-muted-foreground">
                {requiredPlan === 'max' ? `${PRICING.maxPerMonth} 起` : `${PRICING.proPerMonth} 起`}
              </p>
            </div>
            <ArrowRight className="w-4 h-4 text-primary shrink-0 transition-transform group-hover:translate-x-0.5" />
          </Link>
        </div>

        <div className="text-center">
          <p className="text-xs text-muted-foreground/70">
            Pro: 每日邮件 + 网站完整功能 | Max: 全部功能 + 推特日报 + 无限 AI 投研
          </p>
        </div>
      </div>
    </main>
  );
}
