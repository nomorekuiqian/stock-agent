'use client';

import { useState } from 'react';
import {
  useNewsFeed,
  useAnalystActivity,
  useMarketOverview,
  usePressReleases,
} from '@/hooks/queries/use-stock-data';
import { AnalystRatingsCard } from '@/components/market/AnalystRatingsCard';
import { MarketHeaderStrip } from '@/components/market/MarketHeaderStrip';
import { MarketKpiRow } from '@/components/market/MarketKpiRow';
import { MarketHeatCard } from '@/components/market/MarketHeatCard';
import { NewsAndReleasesCard } from '@/components/market/NewsAndReleasesCard';
import { PeersComparisonCard } from '@/components/market/PeersComparisonCard';

type SubTab = 'analyst' | 'news' | 'market';

const SUB_TABS: { key: SubTab; label: string }[] = [
  { key: 'analyst', label: '分析师' },
  { key: 'news', label: '新闻舆情' },
  { key: 'market', label: '市场结构' },
];

export default function PanelMarketTab({ symbol }: { symbol: string }) {
  const [subTab, setSubTab] = useState<SubTab>('analyst');

  const { data: overview, isLoading: overviewLoading } = useMarketOverview(symbol);
  const { data: analyst, isLoading: analystLoading } = useAnalystActivity(symbol);
  const { data: newsFeed } = useNewsFeed(symbol);
  const { data: releases } = usePressReleases(symbol, 30);

  const currentPrice = overview?.kpis?.current_price ?? null;

  return (
    <div className="px-4 py-4 space-y-4">
      {/* Header strip */}
      <MarketHeaderStrip overview={overview} />

      {/* KPI row */}
      <MarketKpiRow overview={overview} loading={overviewLoading} />

      {/* Sub-tab switcher */}
      <div className="flex items-center border-b border-border/30 overflow-x-auto -mx-1 px-1 scrollbar-none">
        {SUB_TABS.map((t) => {
          const active = t.key === subTab;
          return (
            <button
              key={t.key}
              onClick={() => setSubTab(t.key)}
              className={`relative px-4 py-2.5 text-sm font-medium whitespace-nowrap transition-colors cursor-pointer shrink-0
                focus-visible:ring-2 focus-visible:ring-emerald-500/40 focus-visible:outline-none
                ${active ? 'text-emerald-400' : 'text-muted-foreground hover:text-foreground'}`}
            >
              {t.label}
              {active && (
                <span className="absolute bottom-[-1px] left-2 right-2 h-0.5 bg-emerald-400 rounded-t" />
              )}
            </button>
          );
        })}
      </div>

      {/* Sub-tab content */}
      <div key={subTab} className="animate-in fade-in-0 duration-200">
        {subTab === 'analyst' && (
          <AnalystRatingsCard data={analyst} currentPrice={currentPrice} loading={analystLoading} />
        )}
        {subTab === 'news' && (
          <NewsAndReleasesCard articles={newsFeed?.news ?? []} releases={releases?.releases ?? []} />
        )}
        {subTab === 'market' && (
          <div className="space-y-4">
            <MarketHeatCard overview={overview} />
            <PeersComparisonCard overview={overview} />
          </div>
        )}
      </div>
    </div>
  );
}
