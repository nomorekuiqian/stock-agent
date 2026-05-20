'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';

import { useAuth } from '@/contexts/AuthContext';
import { api } from '@/lib/api';
import { marketTodayStr } from '@/lib/timezone';

import PaywallGuard from '@/components/PaywallGuard';

import { DigestView } from './_components/DigestView';
import { GenerateButton } from './_components/GenerateButton';
import type { DailyDigest } from './_components/types';

export default function TwitterDigestLatestPage() {
  const { isAuthenticated, isLoading: authLoading } = useAuth();
  const [digest, setDigest] = useState<DailyDigest | null>(null);
  const [date, setDate] = useState<string>(marketTodayStr());
  const [fetching, setFetching] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  const refetchLatest = useCallback(() => {
    setRefreshKey((k) => k + 1);
  }, []);

  useEffect(() => {
    if (authLoading || !isAuthenticated) return;

    let cancelled = false;
    api.twitterDigest
      .getLatest()
      .then((result) => {
        if (cancelled) return;
        setDigest(result);
        setError(null);
        // Prefer the authoritative BJT business date from the backend. Legacy
        // rows without `date` fall back to slicing the UTC generated_at, which
        // can be off by a day around the 22:00 UTC cron — accept that for the
        // small historical window where date is empty.
        const explicit = result?.date;
        if (explicit && /^\d{4}-\d{2}-\d{2}$/.test(explicit)) {
          setDate(explicit);
        } else if (result?.generated_at) {
          const isoDate = result.generated_at.slice(0, 10);
          if (/^\d{4}-\d{2}-\d{2}$/.test(isoDate)) {
            setDate(isoDate);
          }
        }
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : '加载失败');
      })
      .finally(() => {
        if (!cancelled) setFetching(false);
      });

    return () => {
      cancelled = true;
    };
  }, [authLoading, isAuthenticated, refreshKey]);

  if (authLoading || (isAuthenticated && fetching)) {
    return (
      <main className="min-h-screen bg-background">
        <div className="max-w-5xl mx-auto px-4 md:px-6 py-20">
          <div className="flex flex-col items-center justify-center gap-4">
            <div className="w-10 h-10 rounded-full border-2 border-primary/20 border-t-primary animate-spin" />
            <p className="text-muted-foreground text-sm">加载中...</p>
          </div>
        </div>
      </main>
    );
  }

  if (!isAuthenticated) {
    return (
      <main className="min-h-screen bg-background relative overflow-hidden">
        {/* Soft emerald wash from the top — sets editorial tone without flash. */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 top-0 h-[60vh]"
          style={{
            background:
              'radial-gradient(ellipse 60% 50% at 50% 0%, color-mix(in srgb, var(--primary) 12%, transparent), transparent 65%)',
          }}
        />
        <div className="relative max-w-5xl mx-auto px-4 md:px-6 py-20 text-center space-y-4">
          <span
            aria-hidden
            className="block w-12 h-px mx-auto"
            style={{
              background:
                'linear-gradient(to right, transparent, color-mix(in srgb, var(--primary) 65%, transparent), transparent)',
            }}
          />
          <h1 className="text-xl font-editorial">请先登录</h1>
          <p className="text-muted-foreground text-sm max-w-sm mx-auto">
            登录后查看每日 KOL 观点日报 — 我们从优质金融博主的发声中筛选，只保留带数据或可证伪结论的观点。
          </p>
          <Link
            href="/login?redirect=/twitter-digest"
            className="inline-block mt-4 px-5 py-2.5 bg-primary text-white rounded-lg font-medium text-sm transition-colors hover:bg-primary/90"
          >
            前往登录
          </Link>
        </div>
      </main>
    );
  }

  if (error) {
    return (
      <main className="min-h-screen bg-background">
        <div className="max-w-5xl mx-auto px-4 md:px-6 py-20 text-center">
          <h1 className="text-xl font-editorial">加载失败</h1>
          <p className="text-muted-foreground mt-2 text-sm">{error}</p>
          <Link href="/today" className="inline-block mt-6 text-primary hover:underline">
            返回日报
          </Link>
        </div>
      </main>
    );
  }

  return (
    <PaywallGuard requiredPlan="pro">
      <div className="max-w-4xl mx-auto px-4 md:px-6 pt-4">
        <GenerateButton onGenerated={refetchLatest} />
      </div>
      <DigestView date={date} digest={digest} />
    </PaywallGuard>
  );
}
