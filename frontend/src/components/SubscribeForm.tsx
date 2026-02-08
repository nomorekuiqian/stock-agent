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
      <form onSubmit={handleSubmit} className={`flex flex-col sm:flex-row gap-3 ${className}`}>
        <input
          type="email"
          placeholder="输入你的邮箱"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          disabled={status === 'loading'}
          className="flex-1 px-4 py-3 rounded-lg border border-border/50 bg-card/50 backdrop-blur-sm text-foreground text-sm placeholder:text-muted-foreground/60 focus:outline-none focus:ring-1 focus:ring-emerald-500/50 focus:border-emerald-500/50 disabled:bg-muted disabled:text-muted-foreground transition-all"
        />
        <button
          type="submit"
          disabled={status === 'loading'}
          className="px-6 py-3 bg-emerald-600 text-white rounded-lg font-medium text-sm transition-all hover:bg-emerald-500 hover:shadow-lg hover:shadow-emerald-500/20 disabled:bg-emerald-900 disabled:text-emerald-300/50 disabled:cursor-not-allowed disabled:shadow-none flex items-center justify-center gap-2"
        >
          {status === 'loading' ? (
            <>
              <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
              </svg>
              订阅中...
            </>
          ) : (
            '订阅'
          )}
        </button>
        {message && (
          <p className={`text-xs mt-1 sm:mt-0 sm:ml-2 self-center ${status === 'success' ? 'text-emerald-400' : 'text-red-400'}`}>
            {message}
          </p>
        )}
      </form>
    );
  }

  // Card variant - Refined dark
  return (
    <div className={`relative rounded-xl border border-[#2a2a2e] bg-[#141416] overflow-hidden ${className}`}>
      {/* Top accent line */}
      <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-emerald-500/40 to-transparent" />

      <div className="p-7">
        {/* Header - Editorial style */}
        <div className="mb-6">
          <p className="text-[11px] font-medium tracking-[0.15em] uppercase text-emerald-500/80 mb-2">
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
          <div className="rounded-lg bg-emerald-500/5 border border-emerald-500/15 p-5 text-center">
            <div className="w-10 h-10 rounded-full bg-emerald-500/10 flex items-center justify-center mx-auto mb-3">
              <svg className="w-5 h-5 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <p className="text-sm font-medium text-emerald-400">订阅成功</p>
            <p className="text-xs text-muted-foreground mt-1">{message}</p>
            <button
              onClick={() => setStatus('idle')}
              className="mt-4 text-xs text-emerald-400/70 hover:text-emerald-400 transition-colors cursor-pointer"
            >
              订阅其他邮箱
            </button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-3.5">
            {/* Name Field */}
            <div>
              <label htmlFor="firstName" className="block text-xs text-muted-foreground/70 mb-1.5">
                姓名 <span className="text-muted-foreground/40">(可选)</span>
              </label>
              <input
                type="text"
                id="firstName"
                placeholder="你的姓名"
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                disabled={status === 'loading'}
                className="w-full px-3.5 py-2.5 rounded-lg border border-[#2a2a2e] bg-[#1a1a1d] text-foreground text-sm placeholder:text-muted-foreground/30 focus:outline-none focus:border-emerald-500/40 disabled:opacity-50 transition-colors"
              />
            </div>

            {/* Email Field */}
            <div>
              <label htmlFor="email" className="block text-xs text-muted-foreground/70 mb-1.5">
                邮箱地址 <span className="text-emerald-500/70">*</span>
              </label>
              <input
                type="email"
                id="email"
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                disabled={status === 'loading'}
                required
                className="w-full px-3.5 py-2.5 rounded-lg border border-[#2a2a2e] bg-[#1a1a1d] text-foreground text-sm placeholder:text-muted-foreground/30 focus:outline-none focus:border-emerald-500/40 disabled:opacity-50 transition-colors"
              />
            </div>

            {/* Error Message */}
            {status === 'error' && message && (
              <p className="text-xs text-red-400 px-1">{message}</p>
            )}

            {/* Submit Button */}
            <button
              type="submit"
              disabled={status === 'loading'}
              className="w-full py-3 bg-emerald-600 text-white rounded-lg font-medium text-sm transition-all hover:bg-emerald-500 hover:shadow-lg hover:shadow-emerald-500/15 disabled:bg-emerald-900/50 disabled:text-emerald-300/40 disabled:cursor-not-allowed disabled:shadow-none flex items-center justify-center gap-2 cursor-pointer mt-1"
            >
              {status === 'loading' ? (
                <>
                  <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                  </svg>
                  订阅中...
                </>
              ) : (
                '免费订阅'
              )}
            </button>

            {/* Privacy Note */}
            <p className="text-[10px] text-muted-foreground/40 text-center pt-0.5">
              随时可退订，我们尊重你的隐私
            </p>
          </form>
        )}
      </div>
    </div>
  );
}
