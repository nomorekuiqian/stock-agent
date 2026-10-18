'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';

import { useAuth } from '@/contexts/AuthContext';
import { useEntitlements } from '@/contexts/EntitlementsContext';
import { api } from '@/lib/api';

import { DigestView } from '../_components/DigestView';
import type { DailyDigest } from '../_components/types';

export default function TwitterDigestDetailPage() {
  const params = useParams<{ date: string }>();
  const date = typeof params?.date === 'string' ? params.date : '';
  const { isAuthenticated, isLoading: authLoading } = useAuth();
  const { has: hasEntitlement, isLoading: entitlementLoading } = useEntitlements();
  const hasTwitterDigestAccess = isAuthenticated && hasEntitlement('twitter_digest');
  const [digest, setDigest] = useState<DailyDigest | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loadedKey, setLoadedKey] = useState('');
  const requestKey = `${hasTwitterDigestAccess ? 'full' : 'locked'}:${date}`;

  useEffect(() => {
    if (authLoading || (isAuthenticated && entitlementLoading) || !date) return;

    let cancelled = false;

    api.twitterDigest
      .getByDate(date)
      .then((result) => {
        if (cancelled) return;
        setDigest(result);
        setError(null);
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
  }, [authLoading, entitlementLoading, hasTwitterDigestAccess, isAuthenticated, date, requestKey]);

  if (!date) {
    return (
      <main className="min-h-screen bg-background">
        <div className="max-w-5xl mx-auto px-4 md:px-6 py-20 text-center">
          <h2 className="text-xl font-editorial">日期无效</h2>
          <Link href="/twitter-digest" className="inline-block mt-6 text-sky-400 hover:underline">
            查看最新一期
          </Link>
        </div>
      </main>
    );
  }

  if (authLoading || (isAuthenticated && entitlementLoading) || loadedKey !== requestKey) {
    return (
      <main className="min-h-screen bg-background">
        <div className="max-w-5xl mx-auto px-4 md:px-6 py-20">
          <div className="flex flex-col items-center justify-center gap-4">
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

  return <DigestView date={date} digest={digest} isAuthenticated={isAuthenticated} />;
}
