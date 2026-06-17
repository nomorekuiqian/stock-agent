'use client';

import { ReactNode, useEffect, useState } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { useSubscription } from '@/contexts/SubscriptionContext';
import { useEntitlements } from '@/contexts/EntitlementsContext';
import { Crown } from 'lucide-react';
import { STRIPE_LIVE } from '@/lib/pricing';
import {
  trackPaywallView,
  trackPaywallCtaClick,
  trackCheckoutOpen,
  type CheckoutProduct,
} from '@/lib/paywall-analytics';
import { UnlockCTA } from '@/components/UnlockCTA';

const PAYWALL_ENABLED = process.env.NEXT_PUBLIC_ENABLE_PAYWALL === 'true';

interface PaywallGuardProps {
  children: ReactNode;
  /** Minimum plan required: 'pro' (Pro or Max) or 'max' (Max only). Default: 'pro'. */
  requiredPlan?: 'pro' | 'max';
  /** Feature key to check via entitlements API. Takes precedence over requiredPlan. */
  requiredFeature?: string;
  /** Checkout product to open when locked. Defaults to max. */
  checkoutProduct?: CheckoutProduct;
  lockTitle?: string;
  lockDescription?: string;
  lockCtaLabel?: string;
  /** Preview content to show behind a gradient overlay instead of the full lock screen. */
  preview?: ReactNode;
}

const MAX_ONLY_FEATURES = new Set([
  'stock_research',
  'ai_research_engine',
]);

export default function PaywallGuard({
  children,
  requiredPlan = 'pro',
  requiredFeature,
  checkoutProduct = 'max',
  lockTitle,
  lockDescription,
  lockCtaLabel,
  preview,
}: PaywallGuardProps) {
  const router = useRouter();
  const pathname = usePathname();
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
      />
    );
  }

  const handleUpgradeToMax = async () => {
    trackPaywallCtaClick({
      source: 'paywall_guard_pro_to_max',
      tier: checkoutProduct,
      authenticated: isAuthenticated,
    });
    if (!isAuthenticated) {
      router.push(`/login?redirect=${encodeURIComponent(pathname || '/')}`);
      return;
    }
    if (!STRIPE_LIVE) return;
    setCheckoutLoading(true);
    trackCheckoutOpen({ source: 'paywall_guard_pro_to_max', tier: checkoutProduct });
    await createCheckout(checkoutProduct, pathname || undefined);
    setCheckoutLoading(false);
  };

  // --- Pro user needs Max upgrade ---
  if (isProNeedsMax) {
    return (
      <ProToMaxLockScreen
        onUpgrade={handleUpgradeToMax}
        loading={checkoutLoading}
      />
    );
  }

  // --- Free / unauthenticated user needs any paid plan ---
  return (
    <LockScreen
      checkoutProduct={checkoutProduct}
      title={lockTitle}
      description={lockDescription}
      ctaLabel={lockCtaLabel}
    />
  );
}

// ---------------------------------------------------------------------------
// Pro → Max lock screen — keeps the bespoke "row card" treatment so the page
// reads differently from the free→max lock. Still amber + direct-to-Stripe.
// ---------------------------------------------------------------------------

function ProToMaxLockScreen({
  onUpgrade,
  loading,
}: {
  onUpgrade: () => void;
  loading: boolean;
}) {
  useEffect(() => {
    trackPaywallView({ source: 'paywall_guard_pro_to_max', tier: 'max' });
  }, []);

  return (
    <main className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="w-12 h-12 rounded-full bg-amber-400/10 border border-amber-400/20 flex items-center justify-center mx-auto mb-4">
            <Crown className="w-5 h-5 text-amber-400" />
          </div>
          <p className="text-xs font-semibold tracking-[0.25em] uppercase text-amber-500 mb-2">Max</p>
          <h1 className="text-2xl font-editorial text-foreground mb-2">解锁全部功能</h1>
          <p className="text-sm text-muted-foreground">
            AI 投研引擎无限使用和 AI 深度个股分析
          </p>
        </div>

        <button
          type="button"
          onClick={onUpgrade}
          disabled={!STRIPE_LIVE || loading}
          className="w-full flex items-center gap-4 p-4 rounded-xl bg-amber-500 hover:bg-amber-500/90 transition-colors cursor-pointer disabled:opacity-70 disabled:cursor-not-allowed mb-6"
        >
          <div className="w-10 h-10 rounded-lg bg-white/15 flex items-center justify-center shrink-0">
            <Crown className="w-5 h-5 text-white" />
          </div>
          <div className="flex-1 min-w-0 text-left">
            <p className="text-sm font-semibold text-white">
              {!STRIPE_LIVE ? '订阅功能即将上线' : loading ? '跳转中...' : '解锁全部功能'}
            </p>
            <p className="text-sm text-white/80">一次解锁所有内容</p>
          </div>
          {loading && (
            <div className="w-4 h-4 rounded-full border-2 border-white/30 border-t-white animate-spin shrink-0" />
          )}
        </button>

        <div className="text-center">
          <p className="text-xs text-muted-foreground/70">
            包含：Pro 全部权益 · AI 投研引擎（无限使用）· AI 深度个股分析
          </p>
        </div>
      </div>
    </main>
  );
}

// ---------------------------------------------------------------------------
// Preview overlay — gradient mask over the preview content + centered CTA.
// ---------------------------------------------------------------------------

function PreviewOverlay({
  preview,
  isAuthenticated,
}: {
  preview: ReactNode;
  isAuthenticated: boolean;
}) {
  useEffect(() => {
    trackPaywallView({ source: 'paywall_guard', tier: 'max' });
  }, []);

  return (
    <div className="relative overflow-hidden">
      <div className="pointer-events-none select-none" aria-hidden="true">
        {preview}
      </div>
      <div className="absolute inset-x-0 bottom-0 h-48 md:h-80 bg-gradient-to-t from-background via-background/95 to-transparent" />
      <div className="absolute inset-x-0 bottom-0 text-center pb-12 space-y-3">
        <p className="text-lg font-medium text-foreground">
          {!isAuthenticated ? '登录后即可解锁全部功能' : '解锁全部功能'}
        </p>
        <div className="flex justify-center">
          <UnlockCTA source="paywall_guard" variant="primary" size="md" hideArrow />
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Lock screen — full-page free→max upsell.
// ---------------------------------------------------------------------------

function LockScreen({
  checkoutProduct,
  title,
  description,
  ctaLabel,
}: {
  checkoutProduct: CheckoutProduct;
  title?: string;
  description?: string;
  ctaLabel?: string;
}) {
  useEffect(() => {
    trackPaywallView({ source: 'paywall_guard', tier: checkoutProduct });
  }, [checkoutProduct]);

  const supportText =
    checkoutProduct === 'pro'
      ? '升级后即可使用专属日报和 AI 监控台'
      : '一次解锁所有内容';
  const includedText =
    checkoutProduct === 'pro'
      ? '包含：盘前早报 · 宏观周报 · 专属持仓日报 · 推特 KOL 日报 · AI 监控台'
      : '包含：Pro 全部权益 · AI 投研引擎（无限使用）· AI 深度个股分析';
  const fallbackDescription =
    checkoutProduct === 'pro'
      ? '盘前早报、宏观周报、专属持仓日报和推特 KOL 日报'
      : 'Pro 全部权益、AI 投研无限使用与深度个股分析';

  return (
    <main className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="w-12 h-12 rounded-full bg-amber-400/10 border border-amber-400/20 flex items-center justify-center mx-auto mb-4">
            <Crown className="w-5 h-5 text-amber-400" />
          </div>
          <p className="text-xs font-semibold tracking-[0.25em] uppercase text-amber-500 mb-2">TheMarketBrew</p>
          <h1 className="text-2xl font-editorial text-foreground mb-2">
            {title || '解锁全部功能'}
          </h1>
          <p className="text-sm text-muted-foreground">
            {description || fallbackDescription}
          </p>
        </div>

        <div className="flex flex-col items-center gap-3 mb-6">
          <UnlockCTA
            source="paywall_guard"
            tier={checkoutProduct}
            variant="primary"
            size="lg"
            label={ctaLabel}
            hideArrow
          />
          <p className="text-sm text-muted-foreground">{supportText}</p>
        </div>

        <div className="text-center">
          <p className="text-xs text-muted-foreground/70">
            {includedText}
          </p>
        </div>
      </div>
    </main>
  );
}
