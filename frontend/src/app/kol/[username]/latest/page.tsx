'use client';

import { use } from 'react';

import { useKolCockpitTickers } from '@/hooks/queries/use-kol-data';
import LiveFeed from '../_components/LiveFeed';

export default function LatestPage({
  params,
}: {
  params: Promise<{ username: string }>;
}) {
  const { username } = use(params);
  const { data } = useKolCockpitTickers(username);
  const tickers = data?.tickers ?? [];

  return (
    <div className="pt-4 md:pt-6">
      <SectionHeader />
      <LiveFeed username={username} tickers={tickers} />
    </div>
  );
}

function SectionHeader() {
  return (
    <div className="mb-1 flex items-baseline justify-between gap-4">
      <h2 className="font-editorial text-2xl text-foreground md:text-[28px]">
        最新观点
      </h2>
      <div className="hidden font-data text-[10px] uppercase tracking-[0.18em] text-muted-foreground/70 md:block">
        时间倒序 · 含 reply / quote · 原文逐字
      </div>
    </div>
  );
}
