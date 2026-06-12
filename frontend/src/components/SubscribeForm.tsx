'use client';

import { useState } from 'react';
import { api } from '@/lib/api';

interface SubscribeFormProps {
  variant?: 'inline' | 'card';
  className?: string;
}

export default function SubscribeForm({ variant = 'card', className = '' }: SubscribeFormProps) {
  const [email, setEmail] = useState('');
  const [firstName, setFirstName] = useState('');
  const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const [message, setMessage] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!email) {
      setStatus('error');
      setMessage('请输入邮箱地址');
      return;
    }

    setStatus('loading');
    setMessage('');

    try {
      const result = await api.subscribe(email, firstName || undefined);
      setStatus('success');
      setMessage(result.message);
      setEmail('');
      setFirstName('');
    } catch (error) {
      setStatus('error');
      setMessage(error instanceof Error ? error.message : '订阅失败');
    }
  };

  if (variant === 'inline') {
    return (
      <form onSubmit={handleSubmit} className={`flex flex-col gap-3 sm:flex-row ${className}`}>
        <input
          type="email"
          aria-label="订阅邮箱"
          placeholder="输入你的邮箱"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          disabled={status === 'loading'}
          className="min-h-11 flex-1 rounded-lg border border-border/55 bg-background/70 px-4 py-3 text-sm text-foreground transition-all placeholder:text-muted-foreground focus:border-primary/50 focus:outline-none focus:ring-1 focus:ring-primary/40 disabled:bg-muted disabled:text-muted-foreground"
        />
        <button
          type="submit"
          disabled={status === 'loading'}
          data-delight-action
          className="flex min-h-11 items-center justify-center gap-2 rounded-lg bg-primary px-6 py-3 text-sm font-medium text-primary-foreground transition-all hover:bg-primary/90 hover:shadow-lg hover:shadow-primary/15 disabled:cursor-not-allowed disabled:opacity-50 disabled:shadow-none"
        >
          {status === 'loading' ? (
            <>
              <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
              </svg>
              正在登记日报...
            </>
          ) : (
            '订阅'
          )}
        </button>
        {message && (
          <p
            aria-live="polite"
            className={`self-center text-sm animate-fade-in-up sm:ml-2 ${status === 'success' ? 'text-primary' : 'text-destructive'}`}
          >
            {message}
          </p>
        )}
      </form>
    );
  }

  // Card variant - Refined dark
  return (
    <div
      data-delight-card
      className={`relative rounded-xl border border-[#2a2a2e] bg-[#141416] overflow-hidden ${className}`}
    >
      {/* Top accent line */}
      <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-primary/40 to-transparent" />

      <div className="p-7">
        {/* Header - Editorial style */}
        <div className="mb-6">
          <p className="mb-2 text-sm font-medium text-primary">
            免费订阅 / 收盘后送达
          </p>
          <h3 className="font-editorial text-xl text-foreground leading-tight">
            每日市场报告
          </h3>
          <p className="text-sm text-muted-foreground mt-1">
            收盘后自动发送，洞察直达邮箱
          </p>
        </div>

        {status === 'success' ? (
          <div
            aria-live="polite"
            className="rounded-lg bg-primary/5 border border-primary/15 p-5 text-center animate-fade-in-up"
          >
            <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-3 animate-pulse-subtle">
              <svg className="w-5 h-5 text-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <p className="text-sm font-medium text-primary">订阅成功</p>
            <p className="mt-1 text-sm text-muted-foreground">{message}</p>
            <button
              onClick={() => setStatus('idle')}
              data-delight-action
              className="mt-4 cursor-pointer text-sm text-primary transition-colors hover:text-primary/80"
            >
              订阅其他邮箱
            </button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-3.5">
            {/* Name Field */}
            <div>
              <label htmlFor="firstName" className="mb-1.5 block text-sm text-muted-foreground">
                姓名 <span className="text-muted-foreground/70">(可选)</span>
              </label>
              <input
                type="text"
                id="firstName"
                placeholder="你的姓名"
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                disabled={status === 'loading'}
                className="min-h-11 w-full rounded-lg border border-[#2a2a2e] bg-[#1a1a1d] px-3.5 py-2.5 text-sm text-foreground transition-colors placeholder:text-muted-foreground focus:border-primary/40 focus:outline-none disabled:opacity-50"
              />
            </div>

            {/* Email Field */}
            <div>
              <label htmlFor="email" className="mb-1.5 block text-sm text-muted-foreground">
                邮箱地址 <span className="text-primary/70">*</span>
              </label>
              <input
                type="email"
                id="email"
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                disabled={status === 'loading'}
                required
                className="min-h-11 w-full rounded-lg border border-[#2a2a2e] bg-[#1a1a1d] px-3.5 py-2.5 text-sm text-foreground transition-colors placeholder:text-muted-foreground focus:border-primary/40 focus:outline-none disabled:opacity-50"
              />
            </div>

            {/* Error Message */}
            {status === 'error' && message && (
              <p aria-live="polite" className="px-1 text-sm text-red-400 animate-fade-in-up">{message}</p>
            )}

            {/* Submit Button */}
            <button
              type="submit"
              disabled={status === 'loading'}
              data-delight-action
              className="mt-1 flex min-h-11 w-full cursor-pointer items-center justify-center gap-2 rounded-lg bg-primary py-3 text-sm font-medium text-primary-foreground transition-all hover:bg-primary/90 hover:shadow-lg hover:shadow-primary/15 disabled:cursor-not-allowed disabled:opacity-50 disabled:shadow-none"
            >
              {status === 'loading' ? (
                <>
                  <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                  </svg>
                  正在登记日报...
                </>
              ) : (
                '免费订阅'
              )}
            </button>

            {/* Privacy Note */}
            <p className="pt-0.5 text-center text-sm text-muted-foreground">
              随时可退订，我们尊重你的隐私
            </p>
          </form>
        )}
      </div>
    </div>
  );
}
