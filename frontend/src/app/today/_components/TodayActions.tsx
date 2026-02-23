'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/api';
import { getCurrentUser, User } from '@/lib/auth';

interface StatusMessage {
  type: 'success' | 'error';
  message: string;
}

interface TodayActionsProps {
  reportExists: boolean;
}

function Spinner() {
  return (
    <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
    </svg>
  );
}

function StatusBadge({ status }: { status: StatusMessage }) {
  const isSuccess = status.type === 'success';
  return (
    <div className={`inline-flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-medium ${
      isSuccess
        ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
        : 'bg-red-500/10 text-red-400 border border-red-500/20'
    }`}>
      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        {isSuccess ? (
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
        ) : (
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
        )}
      </svg>
      {status.message}
    </div>
  );
}

export function TodayActions({ reportExists }: TodayActionsProps) {
  const router = useRouter();
  const isDev = process.env.NODE_ENV === 'development';

  const [user, setUser] = useState<User | null>(null);
  const [isSubscribed, setIsSubscribed] = useState(false);
  const [subscriptionLoading, setSubscriptionLoading] = useState(false);
  const [subscriptionStatus, setSubscriptionStatus] = useState<StatusMessage | null>(null);
  const [generating, setGenerating] = useState(false);
  const [sendingEmail, setSendingEmail] = useState(false);
  const [emailStatus, setEmailStatus] = useState<StatusMessage | null>(null);

  const checkSubscriptionStatus = useCallback(async (email: string) => {
    try {
      const result = await api.subscriptions.getStatus('daily_report', email);
      setIsSubscribed(result.subscribed);
    } catch {
      setIsSubscribed(false);
    }
  }, []);

  useEffect(() => {
    getCurrentUser().then((u) => {
      setUser(u);
      if (u?.email) checkSubscriptionStatus(u.email);
    });
  }, [checkSubscriptionStatus]);

  async function handleSubscribe() {
    if (!user?.email) {
      router.push('/login?redirect=/today');
      return;
    }
    setSubscriptionLoading(true);
    setSubscriptionStatus(null);
    try {
      const result = await api.subscriptions.subscribe('daily_report', {
        email: user.email,
        user_id: user.id,
        first_name: user.name,
      });
      if (result.success) {
        setIsSubscribed(true);
        setSubscriptionStatus({ type: 'success', message: 'Subscribed to daily reports!' });
      } else {
        setSubscriptionStatus({ type: 'error', message: result.error || 'Failed to subscribe' });
      }
    } catch (err) {
      setSubscriptionStatus({ type: 'error', message: err instanceof Error ? err.message : 'Failed to subscribe' });
    } finally {
      setSubscriptionLoading(false);
    }
  }

  async function handleUnsubscribe() {
    if (!user?.email) return;
    setSubscriptionLoading(true);
    setSubscriptionStatus(null);
    try {
      const result = await api.subscriptions.unsubscribe('daily_report', user.email);
      if (result.success) {
        setIsSubscribed(false);
        setSubscriptionStatus({ type: 'success', message: 'Unsubscribed successfully' });
      } else {
        setSubscriptionStatus({ type: 'error', message: result.error || 'Failed to unsubscribe' });
      }
    } catch (err) {
      setSubscriptionStatus({ type: 'error', message: err instanceof Error ? err.message : 'Failed to unsubscribe' });
    } finally {
      setSubscriptionLoading(false);
    }
  }

  async function handleGenerate() {
    setGenerating(true);
    try {
      await api.getMarketAnalysis(true);
      router.refresh();
    } catch {
      // generation error is non-critical for dev tool
    } finally {
      setGenerating(false);
    }
  }

  async function handleSendEmail() {
    if (!user?.email) {
      router.push('/login?redirect=/today');
      return;
    }
    setSendingEmail(true);
    setEmailStatus(null);
    try {
      await api.sendReportEmail(user.email);
      setEmailStatus({ type: 'success', message: `Sent to ${user.email}` });
    } catch (err) {
      setEmailStatus({ type: 'error', message: err instanceof Error ? err.message : 'Failed to send' });
    } finally {
      setSendingEmail(false);
    }
  }

  return (
    <div>
      <div className="flex items-center gap-3">
        <button
          onClick={isSubscribed ? handleUnsubscribe : handleSubscribe}
          disabled={subscriptionLoading}
          className={`px-4 py-2.5 rounded-lg font-medium text-sm border transition-all flex items-center gap-2 group ${
            isSubscribed
              ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20 hover:bg-red-500/10 hover:text-red-400 hover:border-red-500/20'
              : 'bg-card text-foreground border-border/50 hover:border-emerald-500/30'
          } disabled:opacity-50 disabled:cursor-not-allowed`}
        >
          {subscriptionLoading ? (
            <Spinner />
          ) : isSubscribed ? (
            <>
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M5 13l4 4L19 7" />
              </svg>
              <span>已订阅</span>
            </>
          ) : (
            <>
              <svg className="w-4 h-4 text-muted-foreground group-hover:text-emerald-400 transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
              </svg>
              <span>订阅</span>
            </>
          )}
        </button>

        {user && (
          <button
            onClick={handleSendEmail}
            disabled={sendingEmail || !reportExists}
            className="px-4 py-2.5 bg-card text-foreground rounded-lg font-medium text-sm border border-border/50 transition-all hover:border-emerald-500/30 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
          >
            {sendingEmail ? (
              <>
                <Spinner />
                <span>发送中...</span>
              </>
            ) : (
              <>
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                </svg>
                <span>发送邮件</span>
              </>
            )}
          </button>
        )}

        {isDev && (
          <button
            onClick={handleGenerate}
            disabled={generating}
            className="px-5 py-2.5 bg-emerald-600 text-white rounded-lg font-medium text-sm transition-all hover:bg-emerald-500 hover:shadow-lg hover:shadow-emerald-500/20 disabled:opacity-50 disabled:cursor-not-allowed disabled:shadow-none flex items-center gap-2"
          >
            {generating ? (
              <>
                <Spinner />
                <span>生成中...</span>
              </>
            ) : (
              <>
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                </svg>
                <span>生成报告</span>
              </>
            )}
          </button>
        )}
      </div>

      {(subscriptionStatus || emailStatus) && (
        <div className="flex flex-wrap gap-2 mt-4">
          {subscriptionStatus && <StatusBadge status={subscriptionStatus} />}
          {emailStatus && <StatusBadge status={emailStatus} />}
        </div>
      )}
    </div>
  );
}
