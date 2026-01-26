'use client';

import { useState, useEffect, Suspense, type ReactNode } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Coffee } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';

function LoadingSpinner(): ReactNode {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="w-8 h-8 border-2 border-emerald-600 border-t-transparent rounded-full animate-spin" />
    </div>
  );
}

const ERROR_TRANSLATIONS: Record<string, string> = {
  'invalid credentials': '邮箱或密码错误',
  'user already exists': '该邮箱已注册，请直接登录',
  'user not found': '用户不存在',
  'invalid email': '邮箱格式不正确',
  'password too short': '密码长度至少为6位',
  'email not confirmed': '请先验证邮箱',
  'invalid token': '验证码无效或已过期',
  'token expired': '验证码已过期，请重新发送',
  'network error': '网络连接失败，请检查网络',
  'too many requests': '请求过于频繁，请稍后再试',
  'name is required': '请输入姓名',
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

  // Get redirect URL from query params, default to /market
  const redirectUrl = searchParams.get('redirect') || '/market';

  const [isSignUp, setIsSignUp] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [successMessage, setSuccessMessage] = useState('');
  const [needsVerification, setNeedsVerification] = useState(false);
  const [verificationCode, setVerificationCode] = useState('');
  const [verifyingCode, setVerifyingCode] = useState(false);

  // Store redirect URL in sessionStorage for OAuth callback
  useEffect(() => {
    if (redirectUrl && redirectUrl !== '/market') {
      sessionStorage.setItem('auth_redirect', redirectUrl);
    }
  }, [redirectUrl]);

  // Redirect if already authenticated
  useEffect(() => {
    if (!isLoading && isAuthenticated) {
      // Clear stored redirect and navigate
      const storedRedirect = sessionStorage.getItem('auth_redirect');
      sessionStorage.removeItem('auth_redirect');
      router.push(storedRedirect || redirectUrl);
    }
  }, [isLoading, isAuthenticated, router, redirectUrl]);

  if (isLoading || isAuthenticated) {
    return <LoadingSpinner />;
  }

  const handleVerifyCode = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !verificationCode) {
      setError('请输入邮箱和验证码');
      return;
    }

    setVerifyingCode(true);
    setError('');

    try {
      const response = await fetch(`${process.env.NEXT_PUBLIC_INSFORGE_URL}/api/auth/email/verify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, otp: verificationCode }),
      });

      const data = await response.json();

      if (!response.ok) {
        setError(data.message || '验证码无效');
      } else {
        setSuccessMessage('邮箱验证成功!现在可以登录了。');
        setNeedsVerification(false);
        setVerificationCode('');
        setIsSignUp(false);
      }
    } catch {
      setError('验证失败,请重试。');
    } finally {
      setVerifyingCode(false);
    }
  };

  const handleResendCode = async () => {
    if (!email) return;
    setError('');
    try {
      await fetch(`${process.env.NEXT_PUBLIC_INSFORGE_URL}/api/auth/email/resend`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });
      setSuccessMessage('验证码已发送!请查收邮箱。');
    } catch {
      setError('发送失败,请重试。');
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccessMessage('');
    setLoading(true);

    try {
      if (isSignUp) {
        const result = await signUp(email, password, name);
        if (result.success) {
          if (result.needsVerification) {
            setNeedsVerification(true);
            setSuccessMessage('账户创建成功!请查收邮箱中的验证码。');
          } else {
            sessionStorage.removeItem('auth_redirect');
            router.push(redirectUrl);
          }
        } else {
          setError(translateError(result.error || '注册失败'));
        }
      } else {
        const result = await signIn(email, password);
        if (result.success) {
          sessionStorage.removeItem('auth_redirect');
          router.push(redirectUrl);
        } else {
          const errorLower = (result.error || '').toLowerCase();
          if (errorLower.includes('verif') || errorLower.includes('confirm')) {
            setNeedsVerification(true);
            setError('请先验证邮箱。');
          } else {
            setError(translateError(result.error || '登录失败'));
          }
        }
      }
    } catch {
      setError('发生未知错误');
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleSignIn = async () => {
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
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-md w-full space-y-8">
        <div className="text-center">
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-emerald-50 text-emerald-700 text-sm font-medium mb-4">
            <Coffee className="w-4 h-4" strokeWidth={2} />
            TheMarketBrew
          </div>
          <h2 className="text-2xl font-semibold text-gray-900">
            {isSignUp ? '创建账户' : '登录账户'}
          </h2>
          <p className="mt-2 text-sm text-gray-500">
            {isSignUp
              ? '开始追踪市场洞察'
              : '访问你的市场分析仪表盘'}
          </p>
        </div>

        {error && (
          <div className="p-3 rounded-lg bg-red-50 border border-red-100 text-red-600 text-sm text-center">
            {error}
          </div>
        )}

        {successMessage && (
          <div className="p-3 rounded-lg bg-green-50 border border-green-100 text-green-600 text-sm text-center">
            {successMessage}
          </div>
        )}

        {needsVerification && email && (
          <div className="p-4 rounded-lg bg-emerald-50 border border-emerald-100">
            <p className="text-sm text-emerald-800 mb-3 text-center">
              请输入发送到 <strong>{email}</strong> 的验证码
            </p>
            <form onSubmit={handleVerifyCode} className="space-y-3">
              <input
                type="text"
                inputMode="numeric"
                maxLength={6}
                value={verificationCode}
                onChange={(e) => setVerificationCode(e.target.value.replace(/\D/g, ''))}
                placeholder="6 位验证码"
                className="w-full px-4 py-3 border border-gray-300 rounded-lg text-gray-900 bg-white text-center tracking-widest font-mono text-lg"
              />
              <button
                type="submit"
                disabled={verifyingCode || verificationCode.length !== 6}
                className="w-full px-4 py-2.5 bg-emerald-600 text-white rounded-lg font-medium text-sm hover:bg-emerald-700 disabled:opacity-50"
              >
                {verifyingCode ? '验证中...' : '验证'}
              </button>
            </form>
            <button
              onClick={handleResendCode}
              className="w-full mt-2 text-sm text-emerald-700 hover:underline"
            >
              重新发送验证码
            </button>
          </div>
        )}

        <button
          onClick={handleGoogleSignIn}
          disabled={loading || needsVerification}
          className="w-full flex items-center justify-center gap-3 px-4 py-3 border border-gray-300 rounded-lg bg-white text-gray-700 font-medium text-sm hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
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

        <div className="relative">
          <div className="absolute inset-0 flex items-center">
            <div className="w-full border-t border-gray-200" />
          </div>
          <div className="relative flex justify-center text-sm">
            <span className="px-4 bg-gray-50 text-gray-500">或使用邮箱</span>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {isSignUp && (
            <div>
              <label htmlFor="name" className="block text-sm font-medium text-gray-700 mb-1">
                姓名
              </label>
              <input
                id="name"
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="你的姓名"
                required
                className="w-full px-4 py-3 border border-gray-300 rounded-lg text-sm text-gray-900 bg-white placeholder:text-gray-400 focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none transition-colors"
              />
            </div>
          )}

          <div>
            <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-1">
              邮箱
            </label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              required
              className="w-full px-4 py-3 border border-gray-300 rounded-lg text-sm text-gray-900 bg-white placeholder:text-gray-400 focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none transition-colors"
            />
          </div>

          <div>
            <label htmlFor="password" className="block text-sm font-medium text-gray-700 mb-1">
              密码
            </label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              required
              minLength={6}
              className="w-full px-4 py-3 border border-gray-300 rounded-lg text-sm text-gray-900 bg-white placeholder:text-gray-400 focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none transition-colors"
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full px-4 py-3 bg-emerald-600 text-white rounded-lg font-medium text-sm hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2"
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

        <p className="text-center text-sm text-gray-500">
          {isSignUp ? '已有账户?' : '没有账户?'}{' '}
          <button
            type="button"
            onClick={() => {
              setIsSignUp(!isSignUp);
              setError('');
              setSuccessMessage('');
              setNeedsVerification(false);
              setVerificationCode('');
            }}
            className="text-emerald-600 font-medium hover:text-emerald-700"
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
