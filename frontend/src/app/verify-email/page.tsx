'use client';

import { Suspense, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { insforge } from '@/lib/insforge';
import {
  clearPendingVerification,
  getPendingVerification,
} from '@/lib/auth-verification';
import { DEFAULT_AUTH_REDIRECT, sanitizeRedirectPath } from '@/lib/auth-redirect';

function LoadingSpinner(): ReactNode {
  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <div className="relative">
        <div className="w-12 h-12 rounded-full border-2 border-emerald-500/20 border-t-emerald-500 animate-spin" />
        <div className="absolute inset-0 w-12 h-12 rounded-full border-2 border-transparent border-r-emerald-400/40 animate-spin" style={{ animationDirection: 'reverse', animationDuration: '1.5s' }} />
      </div>
    </div>
  );
}

function usePublicAuthConfig() {
  const [config, setConfig] = useState<{ verifyEmailMethod?: string } | null>(null);
  useEffect(() => {
    insforge.auth.getPublicAuthConfig().then(({ data }: { data: unknown }) => {
      if (data) setConfig(data as { verifyEmailMethod?: string });
    }).catch(() => {});
  }, []);
  return config;
}

function VerifyEmailContent(): ReactNode {
  const router = useRouter();
  const searchParams = useSearchParams();
  const authConfig = usePublicAuthConfig();
  const { verifyEmail, resendVerificationEmail, updateProfile } = useAuth();

  const redirectPath = sanitizeRedirectPath(searchParams.get('redirect'), DEFAULT_AUTH_REDIRECT);
  const token = searchParams.get('token') || searchParams.get('otp');
  const pendingState = useMemo(() => getPendingVerification(), []);
  const email = searchParams.get('email') || pendingState?.email || '';
  const verificationMethod = authConfig?.verifyEmailMethod || 'code';

  const [code, setCode] = useState(['', '', '', '', '', '']);
  const [loading, setLoading] = useState(false);
  const [resent, setResent] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState('');
  const [tokenFailed, setTokenFailed] = useState(false);

  const codeInputRefs = useRef<(HTMLInputElement | null)[]>([]);
  const redirectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const tokenHandledRef = useRef(false);

  useEffect(() => {
    return () => {
      if (redirectTimerRef.current) {
        clearTimeout(redirectTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (verificationMethod !== 'code' || token) {
      return;
    }

    codeInputRefs.current[0]?.focus();
  }, [token, verificationMethod]);

  const applyPendingProfile = useCallback(async () => {
    const pending = getPendingVerification();
    if (!pending) {
      return;
    }

    try {
      if (!pending.name?.trim()) {
        return;
      }

      const result = await updateProfile({ name: pending.name.trim() });
      if (!result.success) {
        console.warn('[VerifyEmailPage] Applying pending profile failed:', result.error);
      }
    } finally {
      clearPendingVerification();
    }
  }, [updateProfile]);

  const scheduleRedirect = useCallback(() => {
    redirectTimerRef.current = setTimeout(() => {
      router.push(redirectPath);
    }, 2000);
  }, [redirectPath, router]);

  const handleVerification = useCallback(async (otp: string, emailArg?: string) => {
    setLoading(true);
    setError('');

    const result = await verifyEmail(otp, emailArg);
    if (!result.success) {
      setError(result.error || '邮箱验证失败，请重试');
      setTokenFailed(true);
      setLoading(false);
      return;
    }

    await applyPendingProfile();
    setSuccess(true);
    setLoading(false);
    scheduleRedirect();
  }, [applyPendingProfile, scheduleRedirect, verifyEmail]);

  useEffect(() => {
    if (!token || tokenHandledRef.current) {
      return;
    }

    tokenHandledRef.current = true;
    void handleVerification(token);
  }, [handleVerification, token]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const otp = code.join('');

    if (otp.length !== 6) {
      setError('请输入完整的 6 位验证码');
      return;
    }

    await handleVerification(otp, email || undefined);
  }

  function handleCodeChange(index: number, rawValue: string) {
    const digits = rawValue.replace(/\D/g, '');
    if (!digits) {
      const nextCode = [...code];
      nextCode[index] = '';
      setCode(nextCode);
      return;
    }

    if (digits.length > 1) {
      const nextCode = [...code];
      for (let offset = 0; offset < digits.length && index + offset < 6; offset += 1) {
        nextCode[index + offset] = digits[offset];
      }
      setCode(nextCode);
      const nextIndex = Math.min(index + digits.length, 5);
      codeInputRefs.current[nextIndex]?.focus();
      codeInputRefs.current[nextIndex]?.select();
      return;
    }

    const nextCode = [...code];
    nextCode[index] = digits;
    setCode(nextCode);

    if (index < 5) {
      codeInputRefs.current[index + 1]?.focus();
      codeInputRefs.current[index + 1]?.select();
    }
  }

  function applyPastedCode(startIndex: number, pastedText: string) {
    const digits = pastedText.replace(/\D/g, '').slice(0, 6);
    if (!digits) {
      return;
    }

    const nextCode = [...code];
    for (let offset = 0; offset < digits.length && startIndex + offset < 6; offset += 1) {
      nextCode[startIndex + offset] = digits[offset];
    }
    setCode(nextCode);

    const nextIndex = Math.min(startIndex + digits.length, 5);
    codeInputRefs.current[nextIndex]?.focus();
    codeInputRefs.current[nextIndex]?.select();
  }

  function handleCodeKeyDown(index: number, event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'Backspace' && !code[index] && index > 0) {
      codeInputRefs.current[index - 1]?.focus();
      codeInputRefs.current[index - 1]?.select();
    }
  }

  function handleCodePaste(index: number, event: React.ClipboardEvent<HTMLInputElement>) {
    const pastedText = event.clipboardData.getData('text');
    const digits = pastedText.replace(/\D/g, '');
    if (!digits) {
      return;
    }

    event.preventDefault();
    applyPastedCode(index, digits);
  }

  async function handleResend() {
    if (!email) {
      setError('缺少邮箱地址，请返回重新注册');
      return;
    }

    setLoading(true);
    setError('');

    const result = await resendVerificationEmail(email);
    if (!result.success) {
      setError(result.error || '重新发送失败，请稍后重试');
      setLoading(false);
      return;
    }

    setResent(true);
    setLoading(false);
  }

  if (success) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background py-12 px-4 sm:px-6 lg:px-8">
        <div className="fixed inset-0 bg-gradient-mesh opacity-30" />
        <div className="relative max-w-md w-full space-y-8 text-center">
          <div className="mx-auto w-16 h-16 rounded-full bg-emerald-500/10 flex items-center justify-center">
            <svg className="w-8 h-8 text-emerald-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <div className="space-y-4">
            <h1 className="text-2xl font-editorial text-foreground">邮箱已验证</h1>
            <p className="text-muted-foreground text-sm">
              你的账户已完成验证，正在跳转...
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background py-12 px-4 sm:px-6 lg:px-8">
      <div className="fixed inset-0 bg-gradient-mesh opacity-30" />
      <div className="relative max-w-md w-full space-y-8">
        <div className="text-center space-y-4 animate-fade-in-up">
          <div className="flex items-center justify-center gap-3">
            <div className="h-px flex-1 max-w-[60px] bg-gradient-to-r from-transparent to-primary" />
            <span className="text-primary text-xs font-medium tracking-[0.2em] uppercase">THEMARKETBREW</span>
            <div className="h-px flex-1 max-w-[60px] bg-gradient-to-l from-transparent to-primary" />
          </div>

          <div className="inline-flex items-center gap-2 rounded-full border border-emerald-500/20 bg-emerald-500/10 px-3 py-1 text-xs font-medium text-emerald-400">
            <span className="h-2 w-2 rounded-full bg-emerald-400" />
            验证邮件已发送
          </div>

          <h1 className="text-3xl font-editorial text-foreground tracking-tight">
            查收验证邮件
          </h1>

          <p className="text-muted-foreground text-sm max-w-sm mx-auto leading-6">
            {email
              ? <>我们已向 <span className="text-foreground font-medium">{email}</span> 发送验证邮件。</>
              : '我们已向你的邮箱发送验证邮件。'}
            {verificationMethod === 'code' ? ' 输入 6 位验证码完成验证。' : ' 点击邮件中的链接完成验证。'}
          </p>
        </div>

        {error && (
          <div className="p-4 rounded-lg bg-red-500/10 border border-red-500/20 animate-scale-in">
            <p className="text-red-400 text-sm text-center">{error}</p>
          </div>
        )}

        {resent && !error && (
          <div className="p-4 rounded-lg bg-emerald-500/10 border border-emerald-500/20 animate-scale-in">
            <p className="text-emerald-400 text-sm text-center">验证邮件已重新发送</p>
          </div>
        )}

        {verificationMethod === 'code' && (!token || tokenFailed) && (
          <form onSubmit={handleSubmit} className="space-y-6 animate-fade-in-up delay-100">
            <div className="rounded-2xl border border-border/60 bg-card/70 p-6 backdrop-blur-sm">
              <label className="block text-sm font-medium text-foreground/90 mb-2 text-center">
                输入 6 位验证码
              </label>
              <p className="mb-5 text-center text-xs text-muted-foreground">
                输入后会自动跳到下一格，支持一次性粘贴完整验证码
              </p>
              <div className="flex justify-center gap-2">
                {code.map((digit, index) => (
                  <input
                    key={index}
                    ref={(element) => {
                      codeInputRefs.current[index] = element;
                    }}
                    type="text"
                    inputMode="numeric"
                    maxLength={1}
                    value={digit}
                    onChange={(e) => handleCodeChange(index, e.target.value)}
                    onKeyDown={(e) => handleCodeKeyDown(index, e)}
                    onPaste={(e) => handleCodePaste(index, e)}
                    onFocus={(e) => e.target.select()}
                    className="h-14 w-12 rounded-xl border border-border bg-background text-center text-lg font-data text-foreground shadow-sm outline-none transition-all duration-200 focus:border-emerald-500/60 focus:ring-2 focus:ring-emerald-500/10"
                  />
                ))}
              </div>
            </div>

            <button
              type="submit"
              disabled={loading || code.join('').length !== 6}
              className="w-full px-4 py-3.5 bg-emerald-600 text-white rounded-lg font-medium text-sm hover:bg-emerald-500 hover:shadow-lg hover:shadow-emerald-500/20 disabled:opacity-50 disabled:cursor-not-allowed disabled:shadow-none transition-all duration-200 flex items-center justify-center gap-2"
            >
              {loading ? '验证中...' : '验证邮箱'}
            </button>
          </form>
        )}

        {(verificationMethod === 'link' || !token || tokenFailed) && (
          <div className="space-y-4 animate-fade-in-up delay-150">
            <button
              type="button"
              onClick={handleResend}
              disabled={loading || !email}
              className="w-full px-4 py-3.5 border border-border rounded-lg bg-card text-foreground font-medium text-sm hover:border-border/80 hover:bg-card/80 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200"
            >
              {loading ? '发送中...' : '重新发送验证邮件'}
            </button>

            <p className="text-center text-sm text-muted-foreground">
              没收到邮件？先检查垃圾邮箱或 Promotions 分类。
            </p>
          </div>
        )}

        <p className="text-center text-sm text-muted-foreground animate-fade-in delay-200">
          <Link
            href="/login"
            className="inline-flex items-center gap-2 text-emerald-400 hover:text-emerald-300 transition-colors"
          >
            返回登录
          </Link>
        </p>
      </div>
    </div>
  );
}

export default function VerifyEmailPage(): ReactNode {
  return (
    <Suspense fallback={<LoadingSpinner />}>
      <VerifyEmailContent />
    </Suspense>
  );
}
