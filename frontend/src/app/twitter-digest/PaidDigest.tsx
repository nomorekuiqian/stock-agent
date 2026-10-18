'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';

import { useAuth } from '@/contexts/AuthContext';
import { useEntitlements } from '@/contexts/EntitlementsContext';
import { api } from '@/lib/api';
import { marketTodayStr } from '@/lib/timezone';

import { DigestView } from './_components/DigestView';
import { GenerateButton } from './_components/GenerateButton';
import type { DailyDigest } from './_components/types';

export default function TwitterDigestLatestPage() {
  const { isAuthenticated, isLoading: authLoading } = useAuth();
  const { has: hasEntitlement, isLoading: entitlementLoading } = useEntitlements();
  const hasTwitterDigestAccess = isAuthenticated && hasEntitlement('twitter_digest');
  const [digest, setDigest] = useState<DailyDigest | null>(null);
  const [date, setDate] = useState<string>(marketTodayStr());
  const [error, setError] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [loadedKey, setLoadedKey] = useState('');
  const requestKey = `${hasTwitterDigestAccess ? 'full' : 'locked'}:${refreshKey}`;

  const refetchLatest = useCallback(() => {
    setRefreshKey((k) => k + 1);
  }, []);

  useEffect(() => {
    if (authLoading || (isAuthenticated && entitlementLoading)) return;

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
        setDigest(null);
        setError(err instanceof Error ? err.message : '加载失败');
      })
      .finally(() => {
        if (!cancelled) setLoadedKey(requestKey);
      });

    return () => {
      cancelled = true;
    };
  }, [authLoading, entitlementLoading, hasTwitterDigestAccess, isAuthenticated, requestKey]);

  if (authLoading || (isAuthenticated && entitlementLoading) || loadedKey !== requestKey) {
    return (
      <main className="min-h-screen bg-background">
        <div className="max-w-5xl mx-auto px-4 md:px-6 py-20">
          <div className="flex flex-col items-center justify-center gap-4">
            <h2 className="text-3xl font-editorial">推特 KOL 日报</h2>
            <p className="text-sm text-muted-foreground">按主题整理公开博主观点、提及个股与研究线索。观点不代表投资建议；完整日报按账户权益提供。</p>
            <Link href="/kol" className="text-primary">阅读公开博主观点与原帖</Link>
            <div className="w-10 h-10 rounded-full border-2 border-sky-400/20 border-t-sky-400 animate-spin" />
            <p className="text-muted-foreground text-sm">加载中...</p>
          </div>
        </div>
      </main>
    );
  }

  if (error) {
    return (
      <main className="min-h-screen bg-background">
        <div className="max-w-5xl mx-auto px-4 md:px-6 py-20 text-center">
          <h2 className="text-xl font-editorial">加载失败</h2>
          <p className="text-muted-foreground mt-2 text-sm">{error}</p>
          <Link href="/today" className="inline-block mt-6 text-sky-400 hover:underline">
            返回日报
          </Link>
        </div>
      </main>
    );
  }

  return (
    <>
      {hasTwitterDigestAccess && (
        <div className="max-w-4xl mx-auto px-4 md:px-6 pt-4">
          <GenerateButton onGenerated={refetchLatest} />
        </div>
      )}
      <DigestView date={date} digest={digest} isAuthenticated={isAuthenticated} />
    </>
  );
}
