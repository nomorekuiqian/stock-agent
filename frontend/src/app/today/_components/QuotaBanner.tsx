'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { api } from '@/lib/api';
import { useAuth } from '@/contexts/AuthContext';

interface QuotaState {
  used: number;
  limit: number;
  remaining: number;
  unlimited: boolean;
}

export function QuotaBanner() {
  const { user, isLoading: authLoading } = useAuth();
  const [quota, setQuota] = useState<QuotaState | null>(null);
  const quotaScope = user?.id ?? 'anonymous';

  useEffect(() => {
    if (authLoading) return;
    let cancelled = false;
    api.research
      .quota({ requiredAuth: quotaScope !== 'anonymous' })
      .then((q) => {
        if (cancelled) return;
        setQuota({ used: q.used, limit: q.limit, remaining: q.remaining, unlimited: q.unlimited });
      })
      .catch(() => {
        // Network error — hide banner rather than show stale info
      });
    return () => {
      cancelled = true;
    };
  }, [authLoading, quotaScope]);

  if (!quota || quota.unlimited) return null;

  const exhausted = quota.remaining <= 0;

  return (
    <div className="mt-5 flex max-w-xl flex-wrap items-center gap-3 rounded-lg border border-border/40 bg-card/50 px-4 py-2.5 text-sm animate-fade-in-up">
      <span className="text-muted-foreground">
        今天还可以:{' '}
        <span className={exhausted ? 'text-red-400 font-medium' : 'text-foreground font-medium'}>
          {quota.remaining} 次
        </span>{' '}
        AI 投研对话
      </span>
      <Link
        href="/pricing?plan=max"
        className="ml-auto text-primary transition-colors hover:text-primary/80"
      >
        升级 Max 无限使用 →
      </Link>
    </div>
  );
}
