'use client';

import {
  useNewsFeed,
  useMarketOverview,
  usePressReleases,
} from '@/hooks/queries/use-stock-data';
import { MarketHeaderStrip } from '@/components/market/MarketHeaderStrip';
import { MarketKpiRow } from '@/components/market/MarketKpiRow';
import { NewsAndReleasesCard } from '@/components/market/NewsAndReleasesCard';
import { AIMarketAnalysisCard } from '@/components/market/AIMarketAnalysisCard';

interface MarketTabProps {
  symbol: string;
  companyName: string;
  hasAIAccess?: boolean;
}

/**
 * Market Tab — two-column layout matching Overview/Earnings tabs.
 *
 * Layout (desktop):
 *   ┌── Header Strip (full-width, conditional) ──────────────────────┐
 *   ├─ Left (sticky) ──────────┬─ Right (scroll) ───────────────────┤
 *   │                          │ KPI Row                             │
 *   │ AI 综合解读 Card          │ News + press releases timeline      │
 *   │ (stays on-screen while   │ Active tab content                   │
 *   │  user scrolls right col) │                                      │
 *   └──────────────────────────┴──────────────────────────────────────┘
 *
 * Mobile: right column displays first (order-1), AI below (order-2).
 */
export function MarketTab({ symbol, hasAIAccess = true }: MarketTabProps) {
  const { data: overview, isLoading: overviewLoading } = useMarketOverview(symbol);
  const { data: newsFeed } = useNewsFeed(symbol);
  const { data: releases } = usePressReleases(symbol, 30);

  return (
    <div className="space-y-5">
      {/* Header strip — full width above the split */}
      <MarketHeaderStrip overview={overview} />

      {/* Two-column layout */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 items-start">

        {/* ============================================================ */}
        {/* LEFT: AI analysis (sticky on desktop, below on mobile)         */}
        {/* ============================================================ */}
        <div className="order-2 lg:order-1 lg:sticky lg:top-4">
          <AIMarketAnalysisCard symbol={symbol} hasAIAccess={hasAIAccess} />
        </div>

        {/* ============================================================ */}
        {/* RIGHT: KPI + sub-tab content                                   */}
        {/* ============================================================ */}
        <div className="order-1 lg:order-2 space-y-5">
          <MarketKpiRow overview={overview} loading={overviewLoading} />

          <NewsAndReleasesCard
            articles={newsFeed?.news ?? []}
            releases={releases?.releases ?? []}
          />
        </div>
      </div>
    </div>
  );
}
