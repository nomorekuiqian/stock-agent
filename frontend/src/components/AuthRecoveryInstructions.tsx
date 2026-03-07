'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { DEFAULT_AUTH_REDIRECT, sanitizeRedirectPath } from '@/lib/auth-redirect';

interface AuthRecoveryInstructionsProps {
  redirectPath?: string;
  variant?: 'help' | 'error';
}

const DEVICE_GUIDANCE = [
  {
    label: 'MAC',
    title: '强制刷新',
    detail: '按下 Command + Shift + R，让页面和登录状态完整重载。',
  },
  {
    label: 'WINDOWS',
    title: '强制刷新',
    detail: '按下 Ctrl + Shift + R，重新拉取最新页面和会话状态。',
  },
  {
    label: 'MOBILE',
    title: '重新加载',
    detail: '手机端没有统一快捷键。请先下拉刷新或点浏览器菜单里的重新加载；如果还不行，关闭当前页面后重新打开。',
  },
] as const;

function GuidanceCard({ label, title, detail }: { label: string; title: string; detail: string }) {
  return (
    <div className="rounded-xl border border-border/40 bg-background/70 p-4">
      <div className="flex items-center gap-2">
        <span className="text-[11px] font-medium tracking-[0.22em] text-primary uppercase">{label}</span>
        <div className="h-px flex-1 bg-gradient-to-r from-primary/40 to-transparent" />
      </div>
      <p className="mt-3 text-sm font-medium text-foreground">{title}</p>
      <p className="mt-2 text-sm leading-6 text-muted-foreground">{detail}</p>
    </div>
  );
}

export function AuthRecoveryInstructions({
  redirectPath = DEFAULT_AUTH_REDIRECT,
  variant = 'error',
}: AuthRecoveryInstructionsProps) {
  const router = useRouter();
  const { signOut } = useAuth();
  const [isSigningOut, setIsSigningOut] = useState(false);
  const safeRedirect = sanitizeRedirectPath(redirectPath, DEFAULT_AUTH_REDIRECT);
  const isErrorVariant = variant === 'error';

  async function handleSignOutRetry() {
    setIsSigningOut(true);
    try {
      await signOut();
    } finally {
      setIsSigningOut(false);
      router.push(`/login?redirect=${encodeURIComponent(safeRedirect)}`);
    }
  }

  return (
    <section
      className={`relative overflow-hidden rounded-2xl border ${
        isErrorVariant
          ? 'border-amber-500/20 bg-card/85 shadow-[0_24px_80px_-48px_rgba(245,158,11,0.35)]'
          : 'border-border/50 bg-card/75'
      } backdrop-blur-sm`}
    >
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(16,185,129,0.12),transparent_36%),radial-gradient(circle_at_bottom_left,rgba(245,158,11,0.08),transparent_30%)]" />

      <div className="relative p-5 md:p-6">
        <div className="space-y-4">
          <div className="space-y-3">
            <div className="flex items-center gap-3">
              <div className="h-px flex-1 max-w-[56px] bg-gradient-to-r from-primary to-transparent" />
              <span className="text-primary text-xs font-medium tracking-[0.2em] uppercase">AUTH RECOVERY</span>
            </div>
            <div className="space-y-2">
              <h3 className="text-xl md:text-2xl font-editorial text-foreground tracking-tight">
                {isErrorVariant ? '页面还没恢复正常？' : '登录遇到卡住？'}
              </h3>
              <p className="max-w-2xl text-sm md:text-base text-muted-foreground leading-6">
                {isErrorVariant
                  ? '这通常是浏览器里还残留了旧的登录状态，或者当前页面缓存还没完全更新。先做一次彻底刷新，通常就能恢复。'
                  : '如果你点击登录后页面一直没进入，或者刚退出登录又卡在原页面，通常不是密码错了，而是浏览器还在沿用旧的页面状态。'}
              </p>
            </div>
          </div>

          <div className="grid gap-3 md:grid-cols-3">
            {DEVICE_GUIDANCE.map((item) => (
              <GuidanceCard key={item.label} {...item} />
            ))}
          </div>

          <div className="rounded-xl border border-border/40 bg-background/60 px-4 py-3">
            <p className="text-xs font-medium tracking-[0.18em] text-muted-foreground uppercase">WHEN TO USE THIS</p>
            <p className="mt-2 text-sm leading-6 text-foreground/88">
              当你看到页面一直加载不出来、退出登录后又卡在原页面，或者登录成功后专属页还是进不去时，
              先按上面的步骤处理；如果仍然失败，再清理当前登录状态后重试。
            </p>
          </div>

          {isErrorVariant && (
            <div className="flex flex-wrap gap-3 pt-1">
              <button
                onClick={() => window.location.reload()}
                className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-border/50 bg-background px-4 py-2 text-sm text-foreground transition-colors hover:border-emerald-500/30"
              >
                刷新页面
              </button>
              <button
                onClick={handleSignOutRetry}
                disabled={isSigningOut}
                className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-amber-500/25 bg-amber-500/8 px-4 py-2 text-sm text-amber-200 transition-colors hover:border-amber-400/40 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isSigningOut ? '清理中...' : '退出登录后重试'}
              </button>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
