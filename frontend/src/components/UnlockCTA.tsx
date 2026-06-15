'use client';

import { useState } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { LockKeyhole, ArrowRight } from 'lucide-react';

import { useAuth } from '@/contexts/AuthContext';
import { useSubscription } from '@/contexts/SubscriptionContext';
import { STRIPE_LIVE } from '@/lib/pricing';
import {
  trackPaywallCtaClick,
  trackCheckoutOpen,
  type CheckoutProduct,
  type PaywallSource,
} from '@/lib/paywall-analytics';

/**
 * Unified unlock / upgrade CTA used across the in-product paywall surfaces.
 *
 * Replaces the per-component CTA buttons in:
 *   - morning / twitter-digest LockedBlur (Banner / Section / Bottom)
 *   - stock AIPaywall
 *   - PaywallGuard (LockScreen / PreviewOverlay / ProToMaxLockScreen)
 *   - for-you DigestLockedBlur
 *   - research quota nudge
 *   - morning|twitter-digest archive locks
 *
 * Behavior contract (same across all variants):
 *   1. signed-in + STRIPE_LIVE  → createCheckout(tier, returnPath) → Checkout or Portal upgrade
 *   2. signed-out               → /login?redirect=<returnPath>
 *   3. !STRIPE_LIVE             → disabled, copy: "订阅功能即将上线"
 *   4. mid-checkout             → spinner + "跳转中..."
 *
 * Analytics: paywall_cta_click on press, checkout_open on actual Stripe call.
 * Use `<UnlockCTAImpressionTracker source tier />` (separate component below)
 * to fire `paywall_view` from the parent container — keeps view-tracking
 * decoupled from the button itself.
 */

export type UnlockCTAVariant = 'primary' | 'secondary' | 'inline';
export type UnlockCTASize = 'sm' | 'md' | 'lg';

interface Props {
  /** Visual treatment. Pick by where the button lives. */
  variant?: UnlockCTAVariant;
  /** Plan to upgrade to. */
  tier?: CheckoutProduct;
  /** Where this CTA lives — used for funnel attribution. */
  source: PaywallSource;
  /** Button size. */
  size?: UnlockCTASize;
  /** Override copy. Defaults to "解锁全部功能" / auth-aware variants. */
  label?: string;
  /** Where to return after Stripe. Defaults to current pathname. */
  returnPath?: string;
  /** Extra className for the root <button>. */
  className?: string;
  /** Hide the trailing arrow icon (primary/secondary include one by default). */
  hideArrow?: boolean;
}

// ---------- visual style maps ----------

const VARIANT_CLASSES: Record<UnlockCTAVariant, string> = {
  // Solid amber — primary conversion button on banners / lock screens
  primary:
    'inline-flex items-center justify-center gap-2 rounded-lg bg-amber-500 text-white shadow-md shadow-amber-500/20 font-semibold ' +
    'transition-colors hover:bg-amber-500/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400/60 focus-visible:ring-offset-2 focus-visible:ring-offset-background ' +
    'disabled:opacity-70 disabled:cursor-not-allowed',
  // Ghost amber — inline/AI-paywall style, lower visual weight
  secondary:
    'group inline-flex items-center justify-center gap-2 rounded-lg bg-amber-400/10 border border-amber-400/30 text-amber-600 dark:text-amber-400 font-medium ' +
    'transition-colors hover:bg-amber-400/20 hover:border-amber-400/50 ' +
    'disabled:opacity-70 disabled:cursor-not-allowed',
  // Solid amber pill — short nudge (e.g. quota exhausted)
  inline:
    'shrink-0 inline-flex items-center gap-1.5 rounded-full bg-amber-500 text-white font-medium ' +
    'transition-colors hover:bg-amber-500/90 ' +
    'disabled:opacity-70 disabled:cursor-not-allowed',
};

const SIZE_CLASSES: Record<UnlockCTASize, string> = {
  sm: 'px-3 py-1.5 text-xs',
  md: 'px-5 py-3 text-sm',
  lg: 'px-6 py-4 text-base',
};

// ---------- copy resolver ----------

function resolveLabel({
  override,
  isAuthenticated,
  loading,
}: {
  override?: string;
  isAuthenticated: boolean;
  loading: boolean;
}): string {
  if (!STRIPE_LIVE) return '订阅功能即将上线';
  if (loading) return '跳转中...';
  if (override) return override;
  if (!isAuthenticated) return '登录后解锁全部功能';
  return '解锁全部功能';
}

// ---------- main component ----------

export function UnlockCTA({
  variant = 'primary',
  tier = 'max',
  source,
  size = 'md',
  label,
  returnPath,
  className = '',
  hideArrow = false,
}: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const { isAuthenticated } = useAuth();
  const { createCheckout, isCheckoutLoading } = useSubscription();
  const [localLoading, setLocalLoading] = useState(false);

  const loading = localLoading || isCheckoutLoading;
  const resolvedReturnPath = returnPath ?? pathname ?? '/';

  const handleClick = async () => {
    trackPaywallCtaClick({ source, tier, authenticated: isAuthenticated });
    if (!STRIPE_LIVE) return;
    if (!isAuthenticated) {
      router.push(`/login?redirect=${encodeURIComponent(resolvedReturnPath)}`);
      return;
    }
    setLocalLoading(true);
    trackCheckoutOpen({ source, tier });
    await createCheckout(tier, resolvedReturnPath);
    setLocalLoading(false);
  };

  const buttonText = resolveLabel({
    override: label,
    isAuthenticated,
    loading,
  });

  const iconSize = size === 'sm' ? 'w-3.5 h-3.5' : size === 'lg' ? 'w-5 h-5' : 'w-4 h-4';
  const showLeadingIcon = variant !== 'inline';
  const showTrailingArrow = !hideArrow;

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={!STRIPE_LIVE || loading}
      className={[VARIANT_CLASSES[variant], SIZE_CLASSES[size], className].join(' ')}
    >
      {loading ? (
        <span
          className={`${iconSize} rounded-full border-2 border-white/30 border-t-white animate-spin`}
        />
      ) : (
        showLeadingIcon && <LockKeyhole className={iconSize} aria-hidden />
      )}
      <span>{buttonText}</span>
      {!loading && showTrailingArrow && (
        <ArrowRight
          className={`${iconSize} transition-transform group-hover:translate-x-0.5`}
          aria-hidden
        />
      )}
    </button>
  );
}
