'use client';

import Link from 'next/link';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import { Archive } from 'lucide-react';

import { api } from '@/lib/api';
import { useAuth } from '@/contexts/AuthContext';
import { useEmailPreferences } from '@/hooks/queries/use-preferences';
import { queryKeys } from '@/hooks/queries/query-keys';

function Spinner() {
  return (
    <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
    </svg>
  );
}

interface Props {
  /** Hide the subscribe toggle (e.g. for locked/teaser users who can't receive the email yet). */
  showSubscribe?: boolean;
}

export function TwitterDigestActions({ showSubscribe = true }: Props) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { user, isLoading: authLoading } = useAuth();

  const { data: preferences } = useEmailPreferences(!!user);
  const isSubscribed = preferences?.twitter_digest ?? false;
  const prefsLoading = authLoading || (!!user && preferences === undefined);

  const [subscriptionLoading, setSubscriptionLoading] = useState(false);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  async function handleToggleSubscription() {
    if (!user?.email) {
      router.push('/login?redirect=/twitter-digest');
      return;
    }
    setSubscriptionLoading(true);
    setFeedback(null);
    try {
      const next = !isSubscribed;
      const result = await api.subscriptions.updatePreferences({ twitter_digest: next });
      if (result.success) {
        queryClient.setQueryData(queryKeys.subscriptions.preferences(), result.preferences);
        setFeedback({ type: 'success', text: next ? '已订阅推特日报' : '已退订推特日报' });
      } else {
        setFeedback({ type: 'error', text: '操作失败,请稍后再试' });
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : '操作失败';
      // 403 from the entitlement gate surfaces here too — show the real reason.
      setFeedback({ type: 'error', text: msg.includes('entitlement') ? '需要 Pro 权益才能订阅' : msg });
    } finally {
      setSubscriptionLoading(false);
    }
  }

  return (
    <div className="flex flex-col items-end gap-2">
      <div className="flex items-center gap-3">
        <Link
          href="/twitter-digest/archive"
          className="px-4 py-2.5 rounded-lg font-medium text-sm border border-border/50 bg-card text-foreground hover:border-sky-500/30 transition-all flex items-center gap-2"
        >
          <Archive className="w-4 h-4 text-muted-foreground" />
          <span>往期归档</span>
        </Link>

        {!showSubscribe ? null : prefsLoading ? (
          <div className="w-24 h-9 rounded-lg bg-muted animate-pulse" />
        ) : (
          <button
            onClick={handleToggleSubscription}
            disabled={subscriptionLoading}
            className={`px-4 py-2.5 rounded-lg font-medium text-sm border transition-all flex items-center gap-2 group cursor-pointer ${
              isSubscribed
                ? 'bg-sky-500/10 text-sky-400 border-sky-500/20 hover:bg-red-500/10 hover:text-red-400 hover:border-red-500/20'
                : 'bg-card text-foreground border-border/50 hover:border-sky-500/30'
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
                <svg className="w-4 h-4 text-muted-foreground group-hover:text-sky-400 transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
                </svg>
                <span>订阅</span>
              </>
            )}
          </button>
        )}
      </div>
      {feedback && (
        <span
          className={`text-xs ${
            feedback.type === 'success' ? 'text-sky-400' : 'text-red-400'
          }`}
          role="status"
        >
          {feedback.text}
        </span>
      )}
    </div>
  );
}
