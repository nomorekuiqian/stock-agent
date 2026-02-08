'use client';

import { useState, useRef, useEffect, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { sendPasswordResetEmail, exchangeResetPasswordCode, resetPassword } from '@/lib/auth';

type Step = 'email' | 'code' | 'password' | 'success';

export default function ForgotPasswordPage(): ReactNode {
  const router = useRouter();
  const [step, setStep] = useState<Step>('email');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState(['', '', '', '', '', '']);
  const [resetToken, setResetToken] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const codeInputRefs = useRef<(HTMLInputElement | null)[]>([]);
  const redirectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (redirectTimerRef.current) {
        clearTimeout(redirectTimerRef.current);
      }
    };
  }, []);

  async function handleSendEmail(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const result = await sendPasswordResetEmail(email);
      if (result.success) {
        setStep('code');
      } else {
        setError(result.error || '发送失败，请重试');
      }
    } catch {
      setError('发生未知错误');
    } finally {
      setLoading(false);
    }
  }

  function handleCodeChange(index: number, value: string) {
    if (value.length > 1) {
      // Handle paste: distribute digits across inputs
      const digits = value.replace(/\D/g, '').slice(0, 6);
      const newCode = [...code];
      for (let i = 0; i < digits.length && index + i < 6; i++) {
        newCode[index + i] = digits[i];
      }
      setCode(newCode);
      const nextIndex = Math.min(index + digits.length, 5);
      codeInputRefs.current[nextIndex]?.focus();
      return;
    }

    if (value && !/^\d$/.test(value)) return;

    const newCode = [...code];
    newCode[index] = value;
    setCode(newCode);

    if (value && index < 5) {
      codeInputRefs.current[index + 1]?.focus();
    }
  }

  function handleCodeKeyDown(index: number, e: React.KeyboardEvent) {
    if (e.key === 'Backspace' && !code[index] && index > 0) {
      codeInputRefs.current[index - 1]?.focus();
    }
  }

  async function handleVerifyCode(e: React.FormEvent) {
    e.preventDefault();
    setError('');

    const codeStr = code.join('');
    if (codeStr.length !== 6) {
      setError('请输入完整的6位验证码');
      return;
    }

    setLoading(true);

    try {
      const result = await exchangeResetPasswordCode(email, codeStr);
      if (result.success && result.token) {
        setResetToken(result.token);
        setStep('password');
      } else {
        setError(result.error || '验证码无效或已过期');
      }
    } catch {
      setError('发生未知错误');
    } finally {
      setLoading(false);
    }
  }

  async function handleResetPassword(e: React.FormEvent) {
    e.preventDefault();
    setError('');

    if (newPassword !== confirmPassword) {
      setError('两次输入的密码不一致');
      return;
    }

    if (newPassword.length < 8) {
      setError('密码长度至少为8位');
      return;
    }

    setLoading(true);

    try {
      const result = await resetPassword(newPassword, resetToken);
      if (result.success) {
        setStep('success');
        redirectTimerRef.current = setTimeout(() => {
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

  async function handleResendCode() {
    setError('');
    setLoading(true);
    try {
      const result = await sendPasswordResetEmail(email);
      if (!result.success) {
        setError(result.error || '重新发送失败');
      }
    } catch {
      setError('发生未知错误');
    } finally {
      setLoading(false);
    }
  }

  // Success state
  if (step === 'success') {
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
            <h1 className="text-2xl font-editorial text-foreground">
              密码已重置
            </h1>
            <p className="text-muted-foreground text-sm">
              你的密码已成功重置。正在跳转到登录页面...
            </p>
          </div>
          <Link
            href="/login"
            className="inline-flex items-center gap-2 text-sm text-emerald-400 hover:text-emerald-300 transition-colors"
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
            {step === 'email' && '找回密码'}
            {step === 'code' && '输入验证码'}
            {step === 'password' && '设置新密码'}
          </h1>

          <p className="text-muted-foreground text-sm max-w-xs mx-auto">
            {step === 'email' && '输入你的邮箱地址，我们会发送验证码'}
            {step === 'code' && (
              <>
                我们已向 <span className="text-foreground font-medium">{email}</span> 发送了6位验证码
              </>
            )}
            {step === 'password' && '请输入你的新密码'}
          </p>

          {/* Step indicators */}
          <div className="flex items-center justify-center gap-2 pt-2">
            {(['email', 'code', 'password'] as const).map((s, i) => (
              <div
                key={s}
                className={`h-1 rounded-full transition-all duration-300 ${
                  s === step
                    ? 'w-8 bg-emerald-500'
                    : i < ['email', 'code', 'password'].indexOf(step)
                      ? 'w-8 bg-emerald-500/40'
                      : 'w-8 bg-border'
                }`}
              />
            ))}
          </div>
        </div>

        {/* Error Message */}
        {error && (
          <div className="p-4 rounded-lg bg-red-500/10 border border-red-500/20 animate-scale-in">
            <p className="text-red-400 text-sm text-center">{error}</p>
          </div>
        )}

        {/* Step 1: Email */}
        {step === 'email' && (
          <form onSubmit={handleSendEmail} className="space-y-6 animate-fade-in-up delay-100">
            <div>
              <label htmlFor="email" className="block text-sm font-medium text-foreground/90 mb-2">
                邮箱地址
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
                  发送中...
                </>
              ) : (
                '发送验证码'
              )}
            </button>
          </form>
        )}

        {/* Step 2: Code verification */}
        {step === 'code' && (
          <form onSubmit={handleVerifyCode} className="space-y-6 animate-fade-in-up delay-100">
            <div>
              <label className="block text-sm font-medium text-foreground/90 mb-4 text-center">
                输入6位验证码
              </label>
              <div className="flex justify-center gap-2">
                {code.map((digit, index) => (
                  <input
                    key={index}
                    ref={(el) => { codeInputRefs.current[index] = el; }}
                    type="text"
                    inputMode="numeric"
                    maxLength={6}
                    value={digit}
                    onChange={(e) => handleCodeChange(index, e.target.value)}
                    onKeyDown={(e) => handleCodeKeyDown(index, e)}
                    className="w-12 h-14 text-center text-lg font-data bg-card border border-border rounded-lg text-foreground focus:border-emerald-500/50 focus:ring-2 focus:ring-emerald-500/10 outline-none transition-all duration-200"
                  />
                ))}
              </div>
            </div>

            <button
              type="submit"
              disabled={loading || code.join('').length !== 6}
              className="w-full px-4 py-3.5 bg-emerald-600 text-white rounded-lg font-medium text-sm hover:bg-emerald-500 hover:shadow-lg hover:shadow-emerald-500/20 disabled:opacity-50 disabled:cursor-not-allowed disabled:shadow-none transition-all duration-200 flex items-center justify-center gap-2"
            >
              {loading ? (
                <>
                  <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  验证中...
                </>
              ) : (
                '验证'
              )}
            </button>

            <p className="text-center text-xs text-muted-foreground">
              没有收到验证码？{' '}
              <button
                type="button"
                onClick={handleResendCode}
                disabled={loading}
                className="text-emerald-400 hover:text-emerald-300 transition-colors disabled:opacity-50"
              >
                重新发送
              </button>
            </p>
          </form>
        )}

        {/* Step 3: New password */}
        {step === 'password' && (
          <form onSubmit={handleResetPassword} className="space-y-4 animate-fade-in-up delay-100">
            <div>
              <label htmlFor="newPassword" className="block text-sm font-medium text-foreground/90 mb-2">
                新密码
              </label>
              <input
                id="newPassword"
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="至少8位"
                required
                minLength={8}
                className="w-full px-4 py-3 bg-card border border-border rounded-lg text-sm text-foreground placeholder:text-muted-foreground/50 focus:border-emerald-500/50 focus:ring-2 focus:ring-emerald-500/10 outline-none transition-all duration-200"
              />
            </div>

            <div>
              <label htmlFor="confirmPassword" className="block text-sm font-medium text-foreground/90 mb-2">
                确认密码
              </label>
              <input
                id="confirmPassword"
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="再次输入新密码"
                required
                minLength={8}
                className="w-full px-4 py-3 bg-card border border-border rounded-lg text-sm text-foreground placeholder:text-muted-foreground/50 focus:border-emerald-500/50 focus:ring-2 focus:ring-emerald-500/10 outline-none transition-all duration-200"
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full px-4 py-3.5 bg-emerald-600 text-white rounded-lg font-medium text-sm hover:bg-emerald-500 hover:shadow-lg hover:shadow-emerald-500/20 disabled:opacity-50 disabled:cursor-not-allowed disabled:shadow-none transition-all duration-200 flex items-center justify-center gap-2 mt-6"
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
        )}

        {/* Back to Login */}
        <p className="text-center text-sm text-muted-foreground animate-fade-in delay-200">
          <Link
            href="/login"
            className="inline-flex items-center gap-2 text-emerald-400 hover:text-emerald-300 transition-colors"
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
