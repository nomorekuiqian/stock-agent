'use client';

import { useState, useEffect, Suspense, type ReactNode } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { PasswordField } from '@/components/PasswordField';
import { resetPasswordAction as resetPassword } from '@/app/actions/auth';

function LoadingSpinner(): ReactNode {
  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <div className="relative">
        <div className="w-12 h-12 rounded-full border-2 border-primary/20 border-t-primary animate-spin" />
        <div className="absolute inset-0 w-12 h-12 rounded-full border-2 border-transparent border-r-primary/40 animate-spin" style={{ animationDirection: 'reverse', animationDuration: '1.5s' }} />
      </div>
    </div>
  );
}

function ResetPasswordContent(): ReactNode {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [token, setToken] = useState<string | null>(null);

  useEffect(() => {
    // Get token from URL - Insforge sends it as 'token' or 'otp' parameter
    const urlToken = searchParams.get('token') || searchParams.get('otp');
    if (urlToken) {
      setToken(urlToken);
    } else {
      setError('无效的重置链接。请重新申请密码重置。');
    }
  }, [searchParams]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');

    // Validate passwords match
    if (newPassword !== confirmPassword) {
      setError('两次输入的密码不一致');
      return;
    }

    // Validate password length
    if (newPassword.length < 6) {
      setError('密码长度至少为6位');
      return;
    }

    if (!token) {
      setError('无效的重置链接');
      return;
    }

    setLoading(true);

    try {
      const result = await resetPassword(newPassword, token);
      if (result.success) {
        setSuccess(true);
        // Redirect to login after 3 seconds
        setTimeout(() => {
          router.push('/login');
        }, 3000);
      } else {
        setError(result.error || '重置失败，请重试');
      }
    } catch {
      setError('发生未知错误');
    } finally {
      setLoading(false);
    }
  }

  // Success state
  if (success) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background py-12 px-4 sm:px-6 lg:px-8">
        <div className="fixed inset-0 bg-gradient-mesh opacity-30" />

        <div className="relative max-w-md w-full space-y-8 text-center">
          {/* Success Icon */}
          <div className="mx-auto w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center">
            <svg className="w-8 h-8 text-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          </div>

          <div className="space-y-4">
            <h1 className="text-2xl font-editorial text-foreground">
              密码已重置
            </h1>
            <p className="text-muted-foreground text-sm">
              你的密码已成功重置。正在跳转到登录页面...
            </p>
          </div>

          <Link
            href="/login"
            className="inline-flex items-center gap-2 text-sm text-primary hover:text-primary/80 transition-colors"
          >
            立即登录
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" />
            </svg>
          </Link>
        </div>
      </div>
    );
  }

  // No token error state
  if (!token && error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background py-12 px-4 sm:px-6 lg:px-8">
        <div className="fixed inset-0 bg-gradient-mesh opacity-30" />

        <div className="relative max-w-md w-full space-y-8 text-center">
          {/* Error Icon */}
          <div className="mx-auto w-16 h-16 rounded-full bg-red-500/10 flex items-center justify-center">
            <svg className="w-8 h-8 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
          </div>

          <div className="space-y-4">
            <h1 className="text-2xl font-editorial text-foreground">
              链接无效
            </h1>
            <p className="text-muted-foreground text-sm">
              {error}
            </p>
          </div>

          <Link
            href="/forgot-password"
            className="inline-flex items-center gap-2 px-6 py-3 bg-primary text-white rounded-lg font-medium text-sm hover:bg-primary/90 transition-colors"
          >
            重新申请重置
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background py-12 px-4 sm:px-6 lg:px-8">
      <div className="fixed inset-0 bg-gradient-mesh opacity-30" />

      <div className="relative max-w-md w-full space-y-8">
        {/* Header */}
        <div className="text-center space-y-4 animate-fade-in-up">
          <div className="flex items-center justify-center gap-3">
            <div className="h-px flex-1 max-w-[60px] bg-gradient-to-r from-transparent to-primary" />
            <span className="text-primary text-xs font-medium tracking-[0.2em] uppercase">THEMARKETBREW</span>
            <div className="h-px flex-1 max-w-[60px] bg-gradient-to-l from-transparent to-primary" />
          </div>

          <h1 className="text-3xl font-editorial text-foreground tracking-tight">
            设置新密码
          </h1>

          <p className="text-muted-foreground text-sm max-w-xs mx-auto">
            请输入你的新密码
          </p>
        </div>

        {/* Error Message */}
        {error && (
          <div className="p-4 rounded-lg bg-red-500/10 border border-red-500/20 animate-scale-in">
            <p className="text-red-400 text-sm text-center">{error}</p>
          </div>
        )}

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-4 animate-fade-in-up delay-100">
          <PasswordField
            id="newPassword"
            label="新密码"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            required
            minLength={6}
            autoComplete="new-password"
            helperText="密码至少 6 位"
          />

          <PasswordField
            id="confirmPassword"
            label="确认密码"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            required
            minLength={6}
            autoComplete="new-password"
          />

          <button
            type="submit"
            disabled={loading}
            className="w-full px-4 py-3.5 bg-primary text-white rounded-lg font-medium text-sm hover:bg-primary/90 hover:shadow-lg hover:shadow-primary/20 disabled:opacity-50 disabled:cursor-not-allowed disabled:shadow-none transition-all duration-200 flex items-center justify-center gap-2 mt-6"
          >
            {loading ? (
              <>
                <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
                重置中...
              </>
            ) : (
              '重置密码'
            )}
          </button>
        </form>

        {/* Back to Login */}
        <p className="text-center text-sm text-muted-foreground animate-fade-in delay-200">
          <Link
            href="/login"
            className="inline-flex items-center gap-2 text-primary hover:text-primary/80 transition-colors"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
            </svg>
            返回登录
          </Link>
        </p>
      </div>
    </div>
  );
}

export default function ResetPasswordPage(): ReactNode {
  return (
    <Suspense fallback={<LoadingSpinner />}>
      <ResetPasswordContent />
    </Suspense>
  );
}
