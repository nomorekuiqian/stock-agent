'use client';

import {
  useNewsFeed,
  useMarketOverview,
  usePressReleases,
} from '@/hooks/queries/use-stock-data';
import { MarketHeaderStrip } from '@/components/market/MarketHeaderStrip';
import { MarketKpiRow } from '@/components/market/MarketKpiRow';
import { NewsAndReleasesCard } from '@/components/market/NewsAndReleasesCard';

export default function PanelMarketTab({ symbol }: { symbol: string }) {
  const { data: overview, isLoading: overviewLoading } = useMarketOverview(symbol);
  const { data: newsFeed } = useNewsFeed(symbol);
  const { data: releases } = usePressReleases(symbol, 30);

  return (
    <div className="px-4 py-4 space-y-4">
      <MarketHeaderStrip overview={overview} />

      <MarketKpiRow overview={overview} loading={overviewLoading} />

      <NewsAndReleasesCard articles={newsFeed?.news ?? []} releases={releases?.releases ?? []} />
    </div>
  );
}
