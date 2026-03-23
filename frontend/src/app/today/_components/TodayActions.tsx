'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { useAuth } from '@/contexts/AuthContext';
import { useEmailPreferences } from '@/hooks/queries/use-preferences';
import { queryKeys } from '@/hooks/queries/query-keys';

interface TodayActionsProps {
  chatHref?: string;
}

function Spinner() {
  return (
    <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
    </svg>
  );
}

export function TodayActions({ chatHref }: TodayActionsProps) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { user, isLoading: authLoading } = useAuth();

  const { data: preferences } = useEmailPreferences(!!user);
  const isSubscribed = preferences?.daily_report ?? false;
  const prefsLoading = authLoading || (!!user && preferences === undefined);

  const [subscriptionLoading, setSubscriptionLoading] = useState(false);

  async function handleToggleSubscription() {
    if (!user?.email) {
      router.push('/login?redirect=/today');
      return;
    }
    setSubscriptionLoading(true);

    try {
      if (isSubscribed) {
        const result = await api.subscriptions.updatePreferences({ daily_report: false });
        if (result.success) {
          queryClient.setQueryData(queryKeys.subscriptions.preferences(), result.preferences);
        }
      } else {
        try {
          const result = await api.subscriptions.updatePreferences({ daily_report: true });
          if (result.success) {
            queryClient.setQueryData(queryKeys.subscriptions.preferences(), result.preferences);
          } else {
            throw new Error('update failed');
          }
        } catch {
          const result = await api.subscriptions.subscribe('daily_report', {
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
      // toggle failed silently — button state reflects server truth via React Query
    } finally {
      setSubscriptionLoading(false);
    }
  }

  return (
    <div className="flex items-center gap-3">
      {chatHref && (
        <Link
          href={chatHref}
          className="group inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium transition-all duration-200 hover:bg-primary/90 shadow-sm hover:shadow-lg hover:shadow-primary/20 shrink-0"
        >
          <svg
            className="w-4 h-4 transition-transform duration-300 group-hover:scale-110"
            viewBox="0 0 24 24"
            fill="currentColor"
          >
            <path d="M9.813 15.904 9 18.75l-.813-2.846a4.5 4.5 0 0 0-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 0 0 3.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 0 0 3.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 0 0-3.09 3.09ZM18.259 8.715 18 9.75l-.259-1.035a3.375 3.375 0 0 0-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 0 0 2.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 0 0 2.456 2.456L21.75 6l-1.035.259a3.375 3.375 0 0 0-2.456 2.456ZM16.894 20.567 16.5 21.75l-.394-1.183a2.25 2.25 0 0 0-1.423-1.423L13.5 18.75l1.183-.394a2.25 2.25 0 0 0 1.423-1.423l.394-1.183.394 1.183a2.25 2.25 0 0 0 1.423 1.423l1.183.394-1.183.394a2.25 2.25 0 0 0-1.423 1.423Z" />
          </svg>
          和 AI 聊聊
        </Link>
      )}
      {prefsLoading ? (
        <div className="w-24 h-9 rounded-lg bg-muted animate-pulse" />
      ) : (
      <button
        onClick={handleToggleSubscription}
        disabled={subscriptionLoading}
        className={`px-4 py-2.5 rounded-lg font-medium text-sm border transition-all flex items-center gap-2 group ${
          isSubscribed
            ? 'bg-primary/10 text-primary border-primary/20 hover:bg-red-500/10 hover:text-red-400 hover:border-red-500/20'
            : 'bg-card text-foreground border-border/50 hover:border-primary/30'
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
            <svg className="w-4 h-4 text-muted-foreground group-hover:text-primary transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
            </svg>
            <span>订阅</span>
          </>
        )}
      </button>
      )}

    </div>
  );
}
