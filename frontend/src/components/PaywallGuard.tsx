'use client';

import { ReactNode, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { useSubscription } from '@/contexts/SubscriptionContext';
import { useEntitlements } from '@/contexts/EntitlementsContext';
import { getAccessTokenAsync as getAccessToken } from '@/contexts/AuthContext';
import { Zap, ArrowRight, Crown } from 'lucide-react';
import { PRICING } from '@/lib/pricing';

const PAYWALL_ENABLED = process.env.NEXT_PUBLIC_ENABLE_PAYWALL === 'true';
const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000/api';

interface PaywallGuardProps {
  children: ReactNode;
  /** Minimum plan required: 'pro' (Pro or Max) or 'max' (Max only). Default: 'pro'. */
  requiredPlan?: 'pro' | 'max';
  /** Feature key to check via entitlements API. Takes precedence over requiredPlan. */
  requiredFeature?: string;
  /** Preview content to show behind a gradient overlay instead of the full lock screen. */
  preview?: ReactNode;
}

export default function PaywallGuard({ children, requiredPlan = 'pro', requiredFeature, preview }: PaywallGuardProps) {
  const router = useRouter();
  const { isAuthenticated, isLoading: authLoading } = useAuth();
  const { isPro, isMax, isLoading: subLoading, status, redeemInviteCode, createCheckout, refreshSubscription } = useSubscription();
  const { has: hasEntitlement, isLoading: entLoading, refresh: refreshEntitlements } = useEntitlements();

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

  // Check if user meets the required access level
  const hasAccess = requiredFeature
    ? hasEntitlement(requiredFeature)
    : requiredPlan === 'max' ? isMax : isPro;

  if (hasAccess) {
    return <>{children}</>;
  }

  // Max-only features that trigger the "upgrade to Max" flow for Pro users
  // Must be checked BEFORE preview mode so Pro users see upgrade flow, not preview
  const MAX_ONLY_FEATURES = new Set([
    'macro_dashboard', 'stock_research', 'ai_research_engine',
  ]);

  const isProNeedsMax = requiredFeature
    ? isPro && MAX_ONLY_FEATURES.has(requiredFeature)
    : isPro && requiredPlan === 'max';

  // --- Preview mode: show blurred preview with CTA overlay ---
  // Only for non-Pro users (Pro users who need Max get the upgrade flow below)
  if (preview && !isProNeedsMax) {
    return (
      <PreviewOverlay
        preview={preview}
        isAuthenticated={isAuthenticated}
        status={status}
        isPro={isPro}
        isMax={isMax}
        refreshSubscription={refreshSubscription}
        refreshEntitlements={() => refreshEntitlements({ fresh: true })}
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
              升级到 Max 解锁个股投研、宏观仪表盘等全部功能
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
            <p className="text-xs text-muted-foreground/60">
              Max 包含：AI 深度个股分析 · AI 投研引擎 · 宏观仪表盘 · 盘前早报
            </p>
          </div>
        </div>
      </main>
    );
  }

  // --- Free user needs any paid plan ---
  return (
    <LockScreen
      isAuthenticated={isAuthenticated}
      requiredPlan={requiredPlan}
      redeemInviteCode={redeemInviteCode}
      refreshSubscription={refreshSubscription}
      refreshEntitlements={() => refreshEntitlements({ fresh: true })}
    />
  );
}

// ---------------------------------------------------------------------------
// Preview overlay component (shown when `preview` prop is provided)
// ---------------------------------------------------------------------------

function PreviewOverlay({
  preview,
  isAuthenticated,
  status,
  isPro,
  isMax,
  refreshSubscription,
  refreshEntitlements,
}: {
  preview: ReactNode;
  isAuthenticated: boolean;
  status: string;
  isPro: boolean;
  isMax: boolean;
  refreshSubscription: () => Promise<void>;
  refreshEntitlements: () => Promise<void>;
}) {
  const [isActivating, setIsActivating] = useState(false);
  const [activateError, setActivateError] = useState('');

  // Trial activation state
  const [trialUsed, setTrialUsed] = useState(false);

  const handleActivateTrial = async () => {
    setIsActivating(true);
    setActivateError('');
    try {
      const token = await getAccessToken();
      if (!token) {
        setActivateError('登录已过期，请重新登录');
        setIsActivating(false);
        return;
      }
      const res = await fetch(`${API_BASE_URL}/invites/auto-trial`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        if (data.already_active) {
          // User already had a trial before, can't get another one
          setTrialUsed(true);
        } else {
          // Trial activated successfully, refresh to unlock content
          await refreshSubscription();
          await refreshEntitlements();
        }
      } else {
        const data = await res.json().catch(() => ({}));
        setActivateError(data.detail || '激活失败，请稍后再试');
      }
    } catch {
      setActivateError('网络错误，请稍后再试');
    } finally {
      setIsActivating(false);
    }
  };

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
              注册即享 14 天全功能免费体验
            </p>
            <Link
              href="/login"
              className="inline-flex items-center gap-2 px-6 py-3 bg-primary text-primary-foreground rounded-lg text-sm font-medium transition-all hover:bg-primary/90 active:scale-[0.98]"
            >
              免费注册
              <ArrowRight className="w-4 h-4" />
            </Link>
            <p className="text-xs text-muted-foreground">
              无需信用卡 · 14 天后自动结束
            </p>
          </>
        ) : trialUsed ? (
          <>
            <p className="text-lg font-medium text-foreground">
              你的试用已结束，订阅继续使用
            </p>
            <Link
              href="/pricing"
              className="inline-flex items-center gap-2 px-6 py-3 bg-primary text-primary-foreground rounded-lg text-sm font-medium transition-all hover:bg-primary/90 active:scale-[0.98]"
            >
              查看订阅方案
              <ArrowRight className="w-4 h-4" />
            </Link>
          </>
        ) : (
          <>
            <p className="text-lg font-medium text-foreground">
              开启 14 天免费试用
            </p>
            <button
              onClick={handleActivateTrial}
              disabled={isActivating}
              className="inline-flex items-center gap-2 px-6 py-3 bg-primary text-primary-foreground rounded-lg text-sm font-medium transition-all hover:bg-primary/90 active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
            >
              {isActivating ? (
                <>
                  <div className="w-4 h-4 rounded-full border-2 border-primary-foreground/30 border-t-primary-foreground animate-spin" />
                  激活中...
                </>
              ) : (
                <>
                  立即开启
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>
            {activateError && (
              <p className="text-xs text-red-400">{activateError}</p>
            )}
            <p className="text-xs text-muted-foreground">
              无需信用卡 · 14 天后自动结束
            </p>
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
  redeemInviteCode,
  refreshSubscription,
  refreshEntitlements,
}: {
  isAuthenticated: boolean;
  requiredPlan: string;
  redeemInviteCode: (code: string) => Promise<{ success: boolean; error?: string }>;
  refreshSubscription: () => Promise<void>;
  refreshEntitlements: () => Promise<void>;
}) {
  const [isActivating, setIsActivating] = useState(false);
  const [activateError, setActivateError] = useState('');
  const [trialUsed, setTrialUsed] = useState(false);
  const [showCodeInput, setShowCodeInput] = useState(false);
  const [codeInput, setCodeInput] = useState('');
  const [codeError, setCodeError] = useState('');
  const [isRedeeming, setIsRedeeming] = useState(false);

  const handleActivateTrial = async () => {
    setIsActivating(true);
    setActivateError('');
    try {
      const token = await getAccessToken();
      if (!token) {
        setActivateError('登录已过期，请重新登录');
        setIsActivating(false);
        return;
      }
      const res = await fetch(`${API_BASE_URL}/invites/auto-trial`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        if (data.already_active) {
          setTrialUsed(true);
        } else {
          await refreshSubscription();
          await refreshEntitlements();
        }
      } else {
        const data = await res.json().catch(() => ({}));
        setActivateError(data.detail || '激活失败，请稍后再试');
      }
    } catch {
      setActivateError('网络错误，请稍后再试');
    } finally {
      setIsActivating(false);
    }
  };

  const handleRedeem = async () => {
    if (!codeInput.trim()) return;
    setIsRedeeming(true);
    setCodeError('');
    const result = await redeemInviteCode(codeInput.trim());
    setIsRedeeming(false);
    if (result.success) {
      await refreshEntitlements();
    } else {
      setCodeError(result.error || '兑换失败');
    }
  };

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
              ? '升级到 Max 解锁个股投研、宏观仪表盘等全部功能'
              : '订阅后解锁每日 AI 分析，从日报到深度投研'}
          </p>
        </div>

        <div className="space-y-3 mb-6">
          {!isAuthenticated ? (
            <Link
              href="/login"
              className="group flex items-center gap-4 p-4 rounded-xl border border-primary/30 bg-primary/5 hover:bg-primary/10 transition-colors"
            >
              <div className="w-10 h-10 rounded-lg bg-primary/15 flex items-center justify-center shrink-0">
                <Zap className="w-5 h-5 text-primary" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-foreground">注册即可免费体验 14 天</p>
                <p className="text-xs text-muted-foreground">免费注册，开始 14 天全功能体验</p>
              </div>
              <ArrowRight className="w-4 h-4 text-primary shrink-0 transition-transform group-hover:translate-x-0.5" />
            </Link>
          ) : trialUsed ? (
            <Link
              href="/pricing"
              className="group flex items-center gap-4 p-4 rounded-xl border border-primary/30 bg-primary/5 hover:bg-primary/10 transition-colors"
            >
              <div className="w-10 h-10 rounded-lg bg-primary/15 flex items-center justify-center shrink-0">
                <Zap className="w-5 h-5 text-primary" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-foreground">你的试用已结束</p>
                <p className="text-xs text-muted-foreground">订阅继续使用全部功能</p>
              </div>
              <ArrowRight className="w-4 h-4 text-primary shrink-0 transition-transform group-hover:translate-x-0.5" />
            </Link>
          ) : (
            <button
              onClick={handleActivateTrial}
              disabled={isActivating}
              className="w-full group flex items-center gap-4 p-4 rounded-xl border border-primary/30 bg-primary/5 hover:bg-primary/10 transition-colors cursor-pointer text-left"
            >
              <div className="w-10 h-10 rounded-lg bg-primary/15 flex items-center justify-center shrink-0">
                <Zap className="w-5 h-5 text-primary" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-foreground">开启 14 天免费试用</p>
                <p className="text-xs text-muted-foreground">无需信用卡，到期后自动结束</p>
              </div>
              {isActivating ? (
                <div className="w-4 h-4 rounded-full border-2 border-primary/30 border-t-primary animate-spin shrink-0" />
              ) : (
                <ArrowRight className="w-4 h-4 text-primary shrink-0" />
              )}
            </button>
          )}

          {activateError && (
            <p className="text-xs text-red-400 px-4">{activateError}</p>
          )}

          <Link
            href="/pricing"
            className="group flex items-center gap-4 p-4 rounded-xl border border-border/50 bg-card/50 hover:border-border transition-colors"
          >
            <div className="w-10 h-10 rounded-lg bg-muted/50 flex items-center justify-center shrink-0">
              <Zap className="w-5 h-5 text-muted-foreground" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-foreground">查看订阅方案</p>
              <p className="text-xs text-muted-foreground">Pro {PRICING.proPerMonth} 起</p>
            </div>
            <ArrowRight className="w-4 h-4 text-muted-foreground shrink-0 transition-transform group-hover:translate-x-0.5" />
          </Link>

          {!showCodeInput ? (
            <button
              onClick={() => setShowCodeInput(true)}
              className="w-full flex items-center gap-4 p-3 rounded-xl border border-border/30 bg-card/30 hover:border-border/50 transition-colors cursor-pointer text-left"
            >
              <div className="flex-1 min-w-0">
                <p className="text-xs text-muted-foreground">有邀请码？点击输入</p>
              </div>
            </button>
          ) : (
            <div className="p-4 rounded-xl border border-border/50 bg-card/50">
              <div className="flex gap-2">
                <input
                  type="text"
                  value={codeInput}
                  onChange={e => setCodeInput(e.target.value.toUpperCase())}
                  onKeyDown={e => e.key === 'Enter' && handleRedeem()}
                  placeholder="输入邀请码"
                  autoFocus
                  className="flex-1 px-3 py-2.5 bg-background border border-border/60 rounded-lg text-sm text-foreground placeholder:text-muted-foreground/50 font-mono tracking-wider focus:outline-none focus:border-primary/60 focus:ring-1 focus:ring-primary/20 transition-colors"
                />
                <button
                  onClick={handleRedeem}
                  disabled={isRedeeming || !codeInput.trim()}
                  className="px-4 py-2.5 bg-primary text-primary-foreground rounded-lg text-sm font-medium transition-all hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 shrink-0"
                >
                  {isRedeeming ? (
                    <>
                      <div className="w-4 h-4 rounded-full border-2 border-primary-foreground/30 border-t-primary-foreground animate-spin" />
                    </>
                  ) : '兑换'}
                </button>
              </div>
              {codeError && <p className="text-xs text-red-400 mt-2">{codeError}</p>}
            </div>
          )}
        </div>

        <div className="text-center">
          <p className="text-xs text-muted-foreground/60">
            Pro: 每日邮件 + 市场日报 | Max: 全部功能解锁
          </p>
        </div>
      </div>
    </main>
  );
}
