'use client';

import { ReactNode, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { useSubscription } from '@/contexts/SubscriptionContext';
import { Lock, Zap, ArrowRight } from 'lucide-react';
import { PRICING } from '@/lib/pricing';

const PAYWALL_ENABLED = process.env.NEXT_PUBLIC_ENABLE_PAYWALL === 'true';

export default function PaywallGuard({ children }: { children: ReactNode }) {
  const router = useRouter();
  const { isAuthenticated, isLoading: authLoading } = useAuth();
  const { isPro, isLoading: subLoading, redeemInviteCode } = useSubscription();

  const [showCodeInput, setShowCodeInput] = useState(false);
  const [codeInput, setCodeInput] = useState('');
  const [codeError, setCodeError] = useState('');
  const [isRedeeming, setIsRedeeming] = useState(false);

  if (!PAYWALL_ENABLED) {
    return <>{children}</>;
  }

  if (authLoading || subLoading) {
    return (
      <main className="min-h-screen bg-background flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <div className="w-8 h-8 rounded-full border-2 border-primary/20 border-t-primary animate-spin" />
          <p className="text-muted-foreground text-sm">加载中...</p>
        </div>
      </main>
    );
  }

  if (!isPro) {
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
      if (!result.success) {
        setCodeError(result.error || '兑换失败，请稍后再试');
      }
    };

    return (
      <main className="min-h-screen bg-background flex items-center justify-center p-4">
        <div className="w-full max-w-md">
          {/* Header */}
          <div className="text-center mb-8">
            <div className="w-12 h-12 rounded-full bg-primary/10 border border-primary/20 flex items-center justify-center mx-auto mb-4">
              <Lock className="w-5 h-5 text-primary" />
            </div>
            <p className="text-xs font-medium tracking-[0.2em] uppercase text-primary mb-2">TheMarketBrew</p>
            <h1 className="text-2xl font-editorial text-foreground mb-2">此功能需要 Pro 订阅</h1>
            <p className="text-sm text-muted-foreground">
              升级 Pro 解锁全部 AI 分析工具，从日报到深度投研
            </p>
          </div>

          {/* Two Action Cards */}
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
                <p className="text-sm font-semibold text-foreground">升级到 Pro</p>
                <p className="text-xs text-muted-foreground">{PRICING.proPerMonth} · 抢先体验价</p>
              </div>
              <ArrowRight className="w-4 h-4 text-primary shrink-0 transition-transform group-hover:translate-x-0.5" />
            </Link>

            {/* Secondary: Invite Code (collapsed by default) */}
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
                  <p className="text-sm font-medium text-foreground">有邀请码？</p>
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

            {/* Tertiary: Get invite code via questionnaire */}
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
                <p className="text-sm font-medium text-foreground">没有邀请码？</p>
                <p className="text-xs text-muted-foreground">填写问卷免费获取邀请码</p>
              </div>
              <ArrowRight className="w-4 h-4 text-muted-foreground shrink-0 transition-transform group-hover:translate-x-0.5" />
            </Link>
          </div>

          {/* What you'll unlock */}
          <div className="text-center">
            <p className="text-xs text-muted-foreground/60">
              Pro 包含：市场日报 · AI 专属分析 · 个股深研 · 宏观仪表盘 · 投研助手
            </p>
          </div>
        </div>
      </main>
    );
  }

  return <>{children}</>;
}
