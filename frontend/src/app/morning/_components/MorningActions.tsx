'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { useAuth } from '@/contexts/AuthContext';
import { useEmailPreferences } from '@/hooks/queries/use-preferences';
import { queryKeys } from '@/hooks/queries/query-keys';

interface MorningActionsProps {
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

export function MorningActions({ reportExists }: MorningActionsProps) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const isDev = process.env.NODE_ENV === 'development';
  const { user, isLoading: authLoading } = useAuth();

  const { data: preferences } = useEmailPreferences(!!user);
  const isSubscribed = preferences?.morning_report ?? false;
  const prefsLoading = authLoading || (!!user && preferences === undefined);

  const [subscriptionLoading, setSubscriptionLoading] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [sendingEmail, setSendingEmail] = useState(false);

  async function handleToggleSubscription() {
    if (!user?.email) {
      router.push('/login?redirect=/morning');
      return;
    }
    setSubscriptionLoading(true);

    try {
      if (isSubscribed) {
        const result = await api.subscriptions.updatePreferences({ morning_report: false });
        if (result.success) {
          queryClient.setQueryData(queryKeys.subscriptions.preferences(), result.preferences);
        }
      } else {
        try {
          const result = await api.subscriptions.updatePreferences({ morning_report: true });
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

  async function handleGenerate() {
    setGenerating(true);
    try {
      await api.generateMorningReport(true);
      queryClient.invalidateQueries({ queryKey: queryKeys.morningReports.all });
    } catch {
      // generation error is non-critical for dev tool
    } finally {
      setGenerating(false);
    }
  }

  async function handleSendEmail() {
    if (!user?.email) {
      router.push('/login?redirect=/morning');
      return;
    }
    setSendingEmail(true);
    try {
      await api.sendMorningReportEmail(user.email);
    } catch {
      // send error is non-critical
    } finally {
      setSendingEmail(false);
    }
  }

  return (
    <div className="flex items-center gap-3">
      {prefsLoading ? (
        <div className="w-24 h-9 rounded-lg bg-muted animate-pulse" />
      ) : (
      <button
        onClick={handleToggleSubscription}
        disabled={subscriptionLoading}
        className={`px-4 py-2.5 rounded-lg font-medium text-sm border transition-all flex items-center gap-2 group ${
          isSubscribed
            ? 'bg-amber-500/10 text-amber-400 border-amber-500/20 hover:bg-red-500/10 hover:text-red-400 hover:border-red-500/20'
            : 'bg-card text-foreground border-border/50 hover:border-amber-500/30'
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
            <svg className="w-4 h-4 text-muted-foreground group-hover:text-amber-400 transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
            </svg>
            <span>订阅</span>
          </>
        )}
      </button>
      )}

      {isDev && user && (
        <button
          onClick={handleSendEmail}
          disabled={sendingEmail || !reportExists}
          className="px-4 py-2.5 bg-card text-foreground rounded-lg font-medium text-sm border border-border/50 transition-all hover:border-amber-500/30 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
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
          className="px-5 py-2.5 bg-amber-600 text-white rounded-lg font-medium text-sm transition-all hover:bg-amber-500 hover:shadow-lg hover:shadow-amber-500/20 disabled:opacity-50 disabled:cursor-not-allowed disabled:shadow-none flex items-center gap-2"
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
  );
}
