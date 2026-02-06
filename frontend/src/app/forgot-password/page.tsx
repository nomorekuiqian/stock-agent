'use client';

import { useState, type ReactNode } from 'react';
import Link from 'next/link';
import { sendPasswordResetEmail } from '@/lib/auth';

export default function ForgotPasswordPage(): ReactNode {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const result = await sendPasswordResetEmail(email);
      if (result.success) {
        setSuccess(true);
      } else {
        setError(result.error || '发送失败，请重试');
      }
    } catch {
      setError('发生未知错误');
    } finally {
      setLoading(false);
    }
  }

  if (success) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background py-12 px-4 sm:px-6 lg:px-8">
        <div className="fixed inset-0 bg-gradient-mesh opacity-30" />

        <div className="relative max-w-md w-full space-y-8 text-center">
          {/* Success Icon */}
          <div className="mx-auto w-16 h-16 rounded-full bg-emerald-500/10 flex items-center justify-center">
            <svg className="w-8 h-8 text-emerald-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
            </svg>
          </div>

          <div className="space-y-4">
            <h1 className="text-2xl font-editorial text-foreground">
              查看你的邮箱
            </h1>
            <p className="text-muted-foreground text-sm">
              我们已向 <span className="text-foreground font-medium">{email}</span> 发送了密码重置链接。
              <br />
              请点击邮件中的链接重置密码。
            </p>
          </div>

          <div className="space-y-3 pt-4">
            <p className="text-muted-foreground text-xs">
              没有收到邮件？请检查垃圾邮件文件夹。
            </p>
            <Link
              href="/login"
              className="inline-flex items-center gap-2 text-sm text-emerald-400 hover:text-emerald-300 transition-colors"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
              </svg>
              返回登录
            </Link>
          </div>
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
            找回密码
          </h1>

          <p className="text-muted-foreground text-sm max-w-xs mx-auto">
            输入你的邮箱地址，我们会发送密码重置链接
          </p>
        </div>

        {/* Error Message */}
        {error && (
          <div className="p-4 rounded-lg bg-red-500/10 border border-red-500/20 animate-scale-in">
            <p className="text-red-400 text-sm text-center">{error}</p>
          </div>
        )}

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-6 animate-fade-in-up delay-100">
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
              '发送重置链接'
            )}
          </button>
        </form>

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
