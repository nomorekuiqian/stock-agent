'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { DEFAULT_AUTH_REDIRECT, sanitizeRedirectPath } from '@/lib/auth-redirect';

interface AuthRecoveryInstructionsProps {
  redirectPath?: string;
}

export function AuthRecoveryInstructions({
  redirectPath = DEFAULT_AUTH_REDIRECT,
}: AuthRecoveryInstructionsProps) {
  const router = useRouter();
  const { signOut } = useAuth();
  const [isSigningOut, setIsSigningOut] = useState(false);
  const safeRedirect = sanitizeRedirectPath(redirectPath, DEFAULT_AUTH_REDIRECT);

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
    <div className="mt-4 w-full max-w-md rounded-xl border border-border/50 bg-background/60 px-4 py-4 text-left">
      <p className="text-sm font-medium text-foreground">建议这样处理</p>
      <div className="mt-2 space-y-1 text-xs text-muted-foreground">
        <p>1. 先试一下 `Command + Shift + R` 强制刷新页面。</p>
        <p>2. 如果还是不行，再退出登录后重新登录。</p>
      </div>

      <div className="mt-4 flex flex-wrap gap-3">
        <button
          onClick={() => window.location.reload()}
          className="inline-flex items-center gap-2 rounded-lg border border-border/50 bg-card px-4 py-2 text-sm text-foreground transition-colors hover:border-emerald-500/30"
        >
          刷新页面
        </button>
        <button
          onClick={handleSignOutRetry}
          disabled={isSigningOut}
          className="inline-flex items-center gap-2 rounded-lg border border-red-500/20 bg-red-500/5 px-4 py-2 text-sm text-red-300 transition-colors hover:border-red-500/40 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {isSigningOut ? '退出中...' : '退出登录后重试'}
        </button>
      </div>
    </div>
  );
}
