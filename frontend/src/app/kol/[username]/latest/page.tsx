'use client';

import { use } from 'react';

import { useKolCockpitTickers } from '@/hooks/queries/use-kol-data';
import KolPanelHeader from '../_components/KolPanelHeader';
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
    <KolPanelHeader title="原文流" meta="时间倒序 · 含 reply / quote · 原文逐字" />
  );
}
