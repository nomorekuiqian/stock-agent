'use client';

import { useState, useEffect, Suspense, type ReactNode } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '@/contexts/AuthContext';
import { PasswordField } from '@/components/PasswordField';
import { buildVerifyEmailPath, storePendingVerification } from '@/lib/auth-verification';
import { DEFAULT_AUTH_REDIRECT, getStoredAuthRedirect, sanitizeRedirectPath } from '@/lib/auth-redirect';

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

const ERROR_TRANSLATIONS: Record<string, string> = {
  'invalid credentials': '邮箱或密码错误',
  'auth_unauthorized': '邮箱或密码错误',
  'request failed: unauthorized': '邮箱或密码错误',
  'user already exists': '该邮箱已注册，请直接登录',
  'request failed: conflict': '该邮箱已注册，请直接登录',
  'user not found': '用户不存在',
  'invalid email': '邮箱格式不正确',
  'password too short': '密码长度至少为6位',
  'network error': '网络连接失败，请检查网络',
  'too many requests': '请求过于频繁，请稍后再试',
  'name is required': '请输入姓名',
  'cookie_sync_failed': '登录状态同步失败，请重试',
  'callback_failed': '登录回调失败，请重试',
  'no_auth_data': '未收到认证数据，请重试',
  'code_exchange_failed': '授权码交换失败，请重试',
  'failed to complete authentication': '登录完成失败，请重试',
  'auth_failed': '登录完成失败，请重试',
  'oauth can only be initiated in browser': '请在浏览器中登录',
};

function translateError(error: string): string {
  const lowerError = error.toLowerCase();

  for (const [key, value] of Object.entries(ERROR_TRANSLATIONS)) {
    if (lowerError.includes(key)) {
      return value;
    }
  }

  return error;
}

function LoginPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { signIn, signUp, signInWithGoogle, isAuthenticated, isLoading } = useAuth();

  const redirectUrl = sanitizeRedirectPath(searchParams.get('redirect'), DEFAULT_AUTH_REDIRECT);
  const authError = searchParams.get('error');

  const [isSignUp, setIsSignUp] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [successMessage, setSuccessMessage] = useState('');
  const effectiveAuthError = authError;

  useEffect(() => {
    sessionStorage.setItem('auth_redirect', redirectUrl);
  }, [redirectUrl]);

  useEffect(() => {
    if (!effectiveAuthError) return;
    setSuccessMessage('');
    setError(translateError(effectiveAuthError));
  }, [effectiveAuthError]);

  useEffect(() => {
    if (!isLoading && isAuthenticated) {
      const storedRedirect = getStoredAuthRedirect(redirectUrl);
      sessionStorage.removeItem('auth_redirect');
      router.push(storedRedirect);
    }
  }, [isLoading, isAuthenticated, router, redirectUrl]);

  if (isLoading || isAuthenticated) {
    return <LoadingSpinner />;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setSuccessMessage('');
    setLoading(true);

    try {
      if (isSignUp) {
        const result = await signUp(email, password, name, redirectUrl);
        if (result.success && result.requiresEmailVerification && result.email) {
          storePendingVerification({
            email: result.email,
            name,
          });
          router.push(`${buildVerifyEmailPath(redirectUrl)}&email=${encodeURIComponent(result.email)}`);
          return;
        }

        if (result.success) {
          setSuccessMessage('注册成功，正在登录...');
        } else {
          setError(translateError(result.error || '注册失败'));
        }
      } else {
        const result = await signIn(email, password);
        if (result.success) {
          setSuccessMessage('登录成功，正在跳转...');
        } else {
          setError(translateError(result.error || '登录失败'));
        }
      }
    } catch {
      setError('发生未知错误');
    } finally {
      setLoading(false);
    }
  }

  async function handleGoogleSignIn() {
    setError('');
    setLoading(true);

    try {
      const result = await signInWithGoogle();
      if (!result.success) {
        setError(result.error || 'Google 登录失败');
      }
    } catch {
      setError('发生未知错误');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background py-12 px-4 sm:px-6 lg:px-8">
      {/* Subtle background effect */}
      <div className="fixed inset-0 bg-gradient-mesh opacity-30" />

      <div className="relative max-w-md w-full space-y-8">
        {/* Header Section */}
        <div className="text-center space-y-4 animate-fade-in-up">
          {/* Brand Label */}
          <div className="flex items-center justify-center gap-3">
            <div className="h-px flex-1 max-w-[60px] bg-gradient-to-r from-transparent to-primary" />
            <span className="text-primary text-xs font-medium tracking-[0.2em] uppercase">THEMARKETBREW</span>
            <div className="h-px flex-1 max-w-[60px] bg-gradient-to-l from-transparent to-primary" />
          </div>

          {/* Main Title */}
          <h1 className="text-3xl font-editorial text-foreground tracking-tight">
            {isSignUp ? '创建账户' : '欢迎回来'}
          </h1>

          {/* Subtitle */}
          <p className="text-muted-foreground text-sm max-w-xs mx-auto">
            {isSignUp
              ? '开始追踪市场洞察，获取个性化投资分析'
              : '访问你的市场分析仪表盘'}
          </p>
        </div>

        {/* Messages */}
        <div className="space-y-3">
          {error && (
            <div className="p-4 rounded-lg bg-red-500/10 border border-red-500/20 animate-scale-in">
              <p className="text-red-400 text-sm text-center">{error}</p>
            </div>
          )}

          {successMessage && (
            <div className="p-4 rounded-lg bg-emerald-500/10 border border-emerald-500/20 animate-scale-in">
              <p className="text-emerald-400 text-sm text-center">{successMessage}</p>
            </div>
          )}
        </div>

        {/* Google Sign In */}
        <div className="animate-fade-in-up delay-100">
          <button
            onClick={handleGoogleSignIn}
            disabled={loading}
            className="w-full flex items-center justify-center gap-3 px-4 py-3.5 border border-border rounded-lg bg-card text-foreground font-medium text-sm hover:border-border/80 hover:bg-card/80 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200"
          >
            <svg className="w-5 h-5" viewBox="0 0 24 24">
              <path
                fill="#4285F4"
                d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
              />
              <path
                fill="#34A853"
                d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
              />
              <path
                fill="#FBBC05"
                d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
              />
              <path
                fill="#EA4335"
                d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
              />
            </svg>
            使用 Google 登录
          </button>
        </div>

        {/* Divider */}
        <div className="relative animate-fade-in delay-150">
          <div className="absolute inset-0 flex items-center">
            <div className="w-full border-t border-border/50" />
          </div>
          <div className="relative flex justify-center text-sm">
            <span className="px-4 bg-background text-muted-foreground">或使用邮箱</span>
          </div>
        </div>

        {/* Email Form */}
        <form onSubmit={handleSubmit} className="space-y-4 animate-fade-in-up delay-200">
          {isSignUp && (
            <div>
              <label htmlFor="name" className="block text-sm font-medium text-foreground/90 mb-2">
                姓名
              </label>
              <input
                id="name"
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="你的姓名"
                required
                className="w-full px-4 py-3 bg-card border border-border rounded-lg text-sm text-foreground placeholder:text-muted-foreground/50 focus:border-emerald-500/50 focus:ring-2 focus:ring-emerald-500/10 outline-none transition-all duration-200"
              />
            </div>
          )}

          <div>
            <label htmlFor="email" className="block text-sm font-medium text-foreground/90 mb-2">
              邮箱
            </label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              required
              className="w-full px-4 py-3 bg-card border border-border rounded-lg text-sm text-foreground placeholder:text-muted-foreground/50 focus:border-emerald-500/50 focus:ring-2 focus:ring-emerald-500/10 outline-none transition-all duration-200"
            />
          </div>

          <PasswordField
            id="password"
            label="密码"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            minLength={isSignUp ? 6 : undefined}
            autoComplete={isSignUp ? 'new-password' : 'current-password'}
            helperText={isSignUp ? "密码至少 6 位" : undefined}
            labelAction={!isSignUp ? (
              <Link
                href="/forgot-password"
                className="text-xs text-emerald-400 hover:text-emerald-300 transition-colors"
              >
                忘记密码?
              </Link>
            ) : null}
          />

          <button
            type="submit"
            disabled={loading}
            className="w-full px-4 py-3.5 bg-emerald-600 text-white rounded-lg font-medium text-sm hover:bg-emerald-500 hover:shadow-lg hover:shadow-emerald-500/20 disabled:opacity-50 disabled:cursor-not-allowed disabled:shadow-none transition-all duration-200 flex items-center justify-center gap-2"
          >
            {loading ? (
              <>
                <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
                {isSignUp ? '创建中...' : '登录中...'}
              </>
            ) : (
              isSignUp ? '创建账户' : '登录'
            )}
          </button>
        </form>

        {/* Toggle Sign Up / Sign In */}
        <p className="text-center text-sm text-muted-foreground animate-fade-in delay-300">
          {isSignUp ? '已有账户?' : '没有账户?'}{' '}
          <button
            type="button"
            onClick={() => {
              setIsSignUp(!isSignUp);
              setError('');
              setSuccessMessage('');
            }}
            className="text-emerald-400 font-medium hover:text-emerald-300 transition-colors"
          >
            {isSignUp ? '登录' : '注册'}
          </button>
        </p>
      </div>
    </div>
  );
}

export default function LoginPage(): ReactNode {
  return (
    <Suspense fallback={<LoadingSpinner />}>
      <LoginPageContent />
    </Suspense>
  );
}
