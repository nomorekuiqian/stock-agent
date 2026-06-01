'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import { Bell, Check, Loader2, MessageCircle } from 'lucide-react';
import { api } from '@/lib/api';
import { useAuth } from '@/contexts/AuthContext';
import { useEmailPreferences } from '@/hooks/queries/use-preferences';
import { queryKeys } from '@/hooks/queries/query-keys';

interface TodayActionsProps {
  chatHref?: string;
}

function Spinner() {
  return (
    <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
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
    <div className="flex w-full flex-wrap items-center gap-3 sm:w-auto">
      {chatHref && (
        <Link
          href={chatHref}
          className="inline-flex min-h-11 flex-1 items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 sm:flex-none"
        >
          <MessageCircle className="h-4 w-4" aria-hidden="true" />
          和 AI 聊聊
        </Link>
      )}
      {prefsLoading ? (
        <div className="h-11 flex-1 rounded-lg border border-border/40 bg-muted/70 animate-pulse sm:w-24 sm:flex-none" />
      ) : (
        <button
          onClick={handleToggleSubscription}
          disabled={subscriptionLoading}
          className={`group inline-flex min-h-11 flex-1 items-center justify-center gap-2 rounded-lg border px-4 py-2.5 text-sm font-medium transition-colors sm:flex-none ${
            isSubscribed
              ? 'bg-primary/10 text-primary border-primary/25 hover:bg-red-500/10 hover:text-red-400 hover:border-red-500/25'
              : 'bg-card text-foreground border-border/40 hover:border-border/60 hover:bg-primary/10'
          } disabled:opacity-50 disabled:cursor-not-allowed`}
        >
          {subscriptionLoading ? (
            <Spinner />
          ) : isSubscribed ? (
            <>
              <Check className="h-4 w-4" aria-hidden="true" />
              <span>已订阅</span>
            </>
          ) : (
            <>
              <Bell className="h-4 w-4 text-muted-foreground transition-colors group-hover:text-primary" aria-hidden="true" />
              <span>订阅</span>
            </>
          )}
        </button>
      )}

    </div>
  );
}
