'use client';

import { Suspense, useMemo, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { api, type SubscriptionChannel } from '@/lib/api';

export default function UnsubscribePage() {
  return (
    <Suspense fallback={
      <main className="min-h-screen bg-white flex items-center justify-center px-4">
        <div className="w-8 h-8 rounded-full border-2 border-gray-200 border-t-primary animate-spin" />
      </main>
    }>
      <UnsubscribeContent />
    </Suspense>
  );
}

type ManagedChannel = Extract<SubscriptionChannel, 'daily_report' | 'weekly_report' | 'twitter_digest'>;

const CHANNEL_COPY: Record<ManagedChannel, {
  title: string;
  description: string;
  successTitle: string;
  successMessage: string;
  resubscribeHref: string;
  resubscribeLabel: string;
  footer: string;
}> = {
  daily_report: {
    title: '退订每日报告',
    description: '请输入您的邮箱以退订每日市场报告。',
    successTitle: '您已成功退订每日报告',
    successMessage: '我们已将该邮箱从每日市场报告中移除。',
    resubscribeHref: '/#subscribe',
    resubscribeLabel: '重新订阅日报',
    footer: '你可以随时在首页重新订阅。',
  },
  weekly_report: {
    title: '退订宏观周报',
    description: '请输入您的邮箱以退订宏观周报。',
    successTitle: '您已成功退订宏观周报',
    successMessage: '我们已将该邮箱从宏观周报中移除。',
    resubscribeHref: '/profile?tab=email',
    resubscribeLabel: '管理邮件偏好',
    footer: '你可以随时在个人资料页重新开启。',
  },
  twitter_digest: {
    title: '退订推特日报',
    description: '请输入您的邮箱以退订推特 KOL 日报邮件。',
    successTitle: '您已成功退订推特日报',
    successMessage: '我们已将该邮箱从推特 KOL 日报中移除。',
    resubscribeHref: '/profile?tab=email',
    resubscribeLabel: '管理邮件偏好',
    footer: 'Max 用户可随时在个人资料页重新开启。',
  },
};

function parseChannel(value: string | null): ManagedChannel {
  return value === 'weekly_report' || value === 'twitter_digest'
    ? value
    : 'daily_report';
}

function UnsubscribeContent() {
  const searchParams = useSearchParams();
  const channel = useMemo(
    () => parseChannel(searchParams.get('channel')),
    [searchParams]
  );
  const copy = CHANNEL_COPY[channel];
  const initialEmail = searchParams.get('email') || '';

  const [email, setEmail] = useState(initialEmail);
  const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const [message, setMessage] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!email) {
      setStatus('error');
      setMessage('请输入您的邮箱地址');
      return;
    }

    setStatus('loading');
    setMessage('');

    try {
      await api.subscriptions.unsubscribe(channel, email);
      setStatus('success');
      setMessage(copy.successMessage);
    } catch (error) {
      setStatus('error');
      setMessage(error instanceof Error ? error.message : '退订失败，请重试');
    }
  };

  return (
    <main className="min-h-screen bg-white flex items-center justify-center px-4">
      <div className="max-w-md w-full">
        <div className="text-center mb-8">
          <div className="w-16 h-16 rounded-2xl bg-gray-100 flex items-center justify-center mx-auto mb-4">
            <svg className="w-8 h-8 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
            </svg>
          </div>
          <h1 className="text-2xl font-semibold text-gray-900 mb-2">
            {copy.title}
          </h1>
          <p className="text-sm text-gray-500">
            {copy.description}
          </p>
        </div>

        {status === 'success' ? (
          <div className="bg-white rounded-2xl border border-gray-200 p-8 text-center">
            <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-4">
              <svg className="w-6 h-6 text-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <h2 className="text-lg font-semibold text-gray-900 mb-2">
              {copy.successTitle}
            </h2>
            <p className="text-sm text-gray-500 mb-6">
              {message}
            </p>
            <div className="space-y-3">
              <p className="text-xs text-gray-400">
                改变主意了？
              </p>
              <Link
                href={copy.resubscribeHref}
                className="inline-block px-6 py-2.5 bg-primary text-primary-foreground rounded-xl font-medium text-sm transition-all hover:bg-primary/90"
              >
                {copy.resubscribeLabel}
              </Link>
            </div>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="bg-white rounded-2xl border border-gray-200 p-6 space-y-4">
            <div>
              <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-1">
                邮箱地址
              </label>
              <input
                type="email"
                id="email"
                placeholder="your@email.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                disabled={status === 'loading'}
                required
                className="w-full px-4 py-3 rounded-xl border border-gray-200 text-sm text-gray-900 bg-white placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent disabled:bg-gray-50 disabled:text-gray-400"
              />
            </div>

            {status === 'error' && message && (
              <div className="bg-red-50 border border-red-100 rounded-lg px-4 py-3">
                <p className="text-sm text-red-600">{message}</p>
              </div>
            )}

            <button
              type="submit"
              disabled={status === 'loading'}
              className="w-full px-6 py-3 bg-gray-900 text-white rounded-xl font-medium text-sm transition-all hover:bg-gray-800 disabled:bg-gray-400 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {status === 'loading' ? (
                <>
                  <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                  </svg>
                  处理中...
                </>
              ) : (
                '退订'
              )}
            </button>

            <p className="text-xs text-gray-400 text-center pt-2">
              {copy.footer}
            </p>
          </form>
        )}

        <div className="text-center mt-6">
          <Link
            href="/"
            className="text-sm text-gray-500 hover:text-gray-700 transition-colors"
          >
            返回首页
          </Link>
        </div>
      </div>
    </main>
  );
}
