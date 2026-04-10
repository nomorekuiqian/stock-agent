'use client';

import { ReactNode, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { useSubscription } from '@/contexts/SubscriptionContext';
import { useEntitlements } from '@/contexts/EntitlementsContext';
import { Lock, Zap, ArrowRight, Crown } from 'lucide-react';
import { PRICING } from '@/lib/pricing';

const PAYWALL_ENABLED = process.env.NEXT_PUBLIC_ENABLE_PAYWALL === 'true';

interface PaywallGuardProps {
  children: ReactNode;
  /** Minimum plan required: 'pro' (Pro or Max) or 'max' (Max only). Default: 'pro'. */
  requiredPlan?: 'pro' | 'max';
  /** Feature key to check via entitlements API. Takes precedence over requiredPlan. */
  requiredFeature?: string;
}

export default function PaywallGuard({ children, requiredPlan = 'pro', requiredFeature }: PaywallGuardProps) {
  const router = useRouter();
  const { isAuthenticated, isLoading: authLoading } = useAuth();
  const { isPro, isMax, isLoading: subLoading, redeemInviteCode, createCheckout } = useSubscription();
  const { has: hasEntitlement, isLoading: entLoading, refresh: refreshEntitlements } = useEntitlements();

  const [showCodeInput, setShowCodeInput] = useState(false);
  const [codeInput, setCodeInput] = useState('');
  const [codeError, setCodeError] = useState('');
  const [isRedeeming, setIsRedeeming] = useState(false);
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
  const MAX_ONLY_FEATURES = new Set([
    'macro_dashboard', 'stock_research', 'ai_research_engine',
  ]);

  // User is a Pro subscriber but page requires Max
  const isProNeedsMax = requiredFeature
    ? isPro && MAX_ONLY_FEATURES.has(requiredFeature)
    : isPro && requiredPlan === 'max';

  const handleRedeem = async () => {
    if (!codeInput.trim()) return;
    if (!isAuthenticated) {
      const redirect = typeof window !== 'undefined' ? window.location.pathname : '/';
      router.push(`/login?redirect=${encodeURIComponent(redirect)}`);
      return;
    }
    setIsRedeeming(true);
    setCodeError('');
    const result = await redeemInviteCode(codeInput.trim());
    setIsRedeeming(false);
    if (result.success) {
      await refreshEntitlements({ fresh: true });
    } else {
      setCodeError(result.error || '...');
    }
  };

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
    <main className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="w-12 h-12 rounded-full bg-primary/10 border border-primary/20 flex items-center justify-center mx-auto mb-4">
            <Lock className="w-5 h-5 text-primary" />
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

        {/* Action Cards */}
        <div className="space-y-3 mb-6">
          {/* Primary: View Pricing */}
          <Link
            href="/pricing"
            className="group flex items-center gap-4 p-4 rounded-xl border border-primary/30 bg-primary/5 hover:bg-primary/10 transition-colors"
          >
            <div className="w-10 h-10 rounded-lg bg-primary/15 flex items-center justify-center shrink-0">
              <Zap className="w-5 h-5 text-primary" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-foreground">查看订阅方案</p>
              <p className="text-xs text-muted-foreground">Pro {PRICING.proPerMonth} 起</p>
            </div>
            <ArrowRight className="w-4 h-4 text-primary shrink-0 transition-transform group-hover:translate-x-0.5" />
          </Link>

          {/* Invite Code */}
          {!showCodeInput ? (
            <button
              onClick={() => setShowCodeInput(true)}
              className="w-full flex items-center gap-4 p-4 rounded-xl border border-border/50 bg-card/50 hover:border-border transition-colors cursor-pointer text-left"
            >
              <div className="w-10 h-10 rounded-lg bg-muted/50 flex items-center justify-center shrink-0">
                <svg className="w-5 h-5 text-muted-foreground" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 5v2m0 4v2m0 4v2M5 5a2 2 0 00-2 2v3a2 2 0 110 4v3a2 2 0 002 2h14a2 2 0 002-2v-3a2 2 0 110-4V7a2 2 0 00-2-2H5z" />
                </svg>
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-foreground">有邀请码?</p>
                <p className="text-xs text-muted-foreground">输入邀请码获得 14 天免费体验</p>
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
                      兑换中
                    </>
                  ) : isAuthenticated ? '兑换' : '登录后兑换'}
                </button>
              </div>
              {codeError && <p className="text-xs text-red-400 mt-2">{codeError}</p>}
            </div>
          )}

          {/* Get invite code via questionnaire */}
          <Link
            href="/request-access"
            className="group flex items-center gap-4 p-4 rounded-xl border border-border/50 bg-card/50 hover:border-border transition-colors"
          >
            <div className="w-10 h-10 rounded-lg bg-muted/50 flex items-center justify-center shrink-0">
              <svg className="w-5 h-5 text-muted-foreground" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-foreground">没有邀请码?</p>
              <p className="text-xs text-muted-foreground">填写问卷免费获取邀请码</p>
            </div>
            <ArrowRight className="w-4 h-4 text-muted-foreground shrink-0 transition-transform group-hover:translate-x-0.5" />
          </Link>
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
