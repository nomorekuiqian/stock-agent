'use client';

import { ReactNode, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { useSubscription } from '@/contexts/SubscriptionContext';

const PAYWALL_ENABLED = process.env.NEXT_PUBLIC_ENABLE_PAYWALL === 'true';

export default function PaywallGuard({ children }: { children: ReactNode }) {
  const router = useRouter();
  const { isAuthenticated, isLoading: authLoading } = useAuth();
  const { isPro, isLoading: subLoading, redeemInviteCode } = useSubscription();

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
          <div className="text-center mb-8">
            <p className="text-xs font-medium tracking-[0.2em] uppercase text-primary mb-2">TheMarketBrew</p>
            <h1 className="text-2xl font-editorial text-foreground">专业级市场分析</h1>
            <p className="text-sm text-muted-foreground mt-1">需要邀请码才能访问</p>
          </div>

          <div className="terminal-card p-6 shadow-xl shadow-black/40">
            <div className="mb-5">
              <label className="text-sm font-medium text-foreground block mb-2">邀请码</label>
              <input
                type="text"
                value={codeInput}
                onChange={e => setCodeInput(e.target.value.toUpperCase())}
                onKeyDown={e => e.key === 'Enter' && handleRedeem()}
                placeholder="输入邀请码"
                className="w-full px-3 py-2.5 bg-background border border-border/60 rounded-lg text-sm text-foreground placeholder:text-muted-foreground/50 font-mono tracking-wider focus:outline-none focus:border-primary/60 focus:ring-1 focus:ring-primary/20 transition-colors"
              />
              {codeError && <p className="text-xs text-red-400 mt-1.5">{codeError}</p>}
            </div>

            <button
              onClick={handleRedeem}
              disabled={isRedeeming || !codeInput.trim()}
              className="w-full px-4 py-2.5 bg-primary text-primary-foreground rounded-lg text-sm font-medium transition-all hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {isRedeeming ? (
                <>
                  <div className="w-4 h-4 rounded-full border-2 border-primary-foreground/30 border-t-primary-foreground animate-spin" />
                  兑换中...
                </>
              ) : isAuthenticated ? '立即兑换' : '登录后兑换'}
            </button>

            <div className="mt-4 pt-4 border-t border-border/30 text-center">
              <p className="text-xs text-muted-foreground mb-2">没有邀请码？</p>
              <Link
                href="/request-access"
                className="text-xs text-primary hover:text-primary/80 transition-colors underline-offset-2 hover:underline"
              >
                填写问卷，立即获取邀请码
              </Link>
            </div>
          </div>
        </div>
      </main>
    );
  }

  return <>{children}</>;
}
