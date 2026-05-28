'use client';

import { use, useEffect, useState } from 'react';

import { api, type KolCockpitTickerSummary } from '@/lib/api';
import LiveFeed from '../_components/LiveFeed';

export default function LatestPage({
  params,
}: {
  params: Promise<{ username: string }>;
}) {
  const { username } = use(params);
  const [tickers, setTickers] = useState<KolCockpitTickerSummary[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    api.kolResearch
      .cockpitTickers(username)
      .then((res) => {
        if (cancelled) return;
        setTickers(res.tickers);
      })
      .catch(() => {
        if (!cancelled) setTickers([]);
      });
    return () => {
      cancelled = true;
    };
  }, [username]);

  return (
    <div className="pt-4 md:pt-6">
      <SectionHeader />
      <LiveFeed username={username} tickers={tickers ?? []} />
    </div>
  );
}

function SectionHeader() {
  return (
    <div className="mb-1 flex items-baseline justify-between gap-4">
      <div>
        <p className="font-data text-[11px] uppercase tracking-[0.22em] text-muted-foreground">
          MODULE 01
        </p>
        <h2 className="mt-1 font-editorial text-2xl text-foreground md:text-[28px]">
          他在说什么
        </h2>
      </div>
      <div className="hidden font-data text-[10px] uppercase tracking-[0.18em] text-muted-foreground/70 md:block">
        时间倒序 · 含 reply / quote · 原文逐字
      </div>
    </div>
  );
}
