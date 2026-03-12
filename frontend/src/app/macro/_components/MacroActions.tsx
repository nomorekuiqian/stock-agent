'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
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

export function MacroActions() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const isDev = process.env.NODE_ENV === 'development';
  const { user } = useAuth();

  const { data: preferences } = useEmailPreferences(!!user);
  const isSubscribed = preferences?.weekly_report ?? false;

  const [subscriptionLoading, setSubscriptionLoading] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [generateError, setGenerateError] = useState<string | null>(null);

  async function handleToggleSubscription() {
    if (!user?.email) {
      router.push('/login?redirect=/macro');
      return;
    }
    setSubscriptionLoading(true);

    try {
      if (isSubscribed) {
        const result = await api.subscriptions.updatePreferences({ weekly_report: false });
        if (result.success) {
          queryClient.setQueryData(queryKeys.subscriptions.preferences(), result.preferences);
        }
      } else {
        try {
          const result = await api.subscriptions.updatePreferences({ weekly_report: true });
          if (result.success) {
            queryClient.setQueryData(queryKeys.subscriptions.preferences(), result.preferences);
          } else {
            throw new Error('update failed');
          }
        } catch {
          const result = await api.subscriptions.subscribe('weekly_report', {
            email: user.email,
            user_id: user.id,
            first_name: user.name,
          });
          if (result.success) {
            queryClient.invalidateQueries({ queryKey: queryKeys.subscriptions.preferences() });
          }
        }
      }
    } catch {
      // toggle failed silently
    } finally {
      setSubscriptionLoading(false);
    }
  }

  async function handleGenerate() {
    setGenerating(true);
    setGenerateError(null);
    try {
      await api.weeklyReport.generate(true);
      router.refresh();
    } catch (err) {
      setGenerateError(
        err instanceof Error ? err.message : 'Failed to generate weekly report',
      );
    } finally {
      setGenerating(false);
    }
  }

  return (
    <div className="flex items-center gap-3 shrink-0">
      <button
        onClick={handleToggleSubscription}
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

      {isDev && (
        <button
          onClick={handleGenerate}
          disabled={generating}
          className="px-4 py-2.5 bg-emerald-600 text-white rounded-lg font-medium text-sm transition-all hover:bg-emerald-500 hover:shadow-lg hover:shadow-emerald-500/20 disabled:opacity-50 disabled:cursor-not-allowed disabled:shadow-none flex items-center gap-2"
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
              <span>生成周报</span>
            </>
          )}
        </button>
      )}

      {generateError && <p className="text-sm text-red-500">{generateError}</p>}
    </div>
  );
}
