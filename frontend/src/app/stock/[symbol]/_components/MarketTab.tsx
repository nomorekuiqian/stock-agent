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
import { AIMarketAnalysisCard } from '@/components/market/AIMarketAnalysisCard';

interface MarketTabProps {
  symbol: string;
  companyName: string;
  hasAIAccess?: boolean;
}

type SubTab = 'analyst' | 'news' | 'market';

const SUB_TABS: { key: SubTab; label: string; icon: string }[] = [
  { key: 'analyst', label: '分析师', icon: '📊' },
  { key: 'news', label: '新闻舆情', icon: '📰' },
  { key: 'market', label: '市场结构', icon: '🔥' },
];

/**
 * Market Tab — two-column layout matching Overview/Earnings tabs.
 *
 * Layout (desktop):
 *   ┌── Header Strip (full-width, conditional) ──────────────────────┐
 *   ├─ Left (sticky) ──────────┬─ Right (scroll) ───────────────────┤
 *   │                          │ KPI Row (4 cards)                   │
 *   │ 🤖 AI 综合解读 Card       │ ─── Sub-tabs [分析师|新闻|市场] ──── │
 *   │ (stays on-screen while   │ Active tab content                   │
 *   │  user scrolls right col) │                                      │
 *   └──────────────────────────┴──────────────────────────────────────┘
 *
 * Mobile: right column displays first (order-1), AI below (order-2).
 */
export function MarketTab({ symbol, hasAIAccess = true }: MarketTabProps) {
  const [subTab, setSubTab] = useState<SubTab>('analyst');

  const { data: overview, isLoading: overviewLoading } = useMarketOverview(symbol);
  const { data: analyst, isLoading: analystLoading } = useAnalystActivity(symbol);
  const { data: newsFeed } = useNewsFeed(symbol);
  const { data: releases } = usePressReleases(symbol, 30);

  const currentPrice = overview?.kpis?.current_price ?? null;

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
                    ${active
                      ? 'text-emerald-400'
                      : 'text-muted-foreground hover:text-foreground'
                    }`}
                >
                  <span className="mr-1.5">{t.icon}</span>
                  {t.label}
                  {active && (
                    <span className="absolute bottom-[-1px] left-2 right-2 h-0.5 bg-emerald-400 rounded-t" />
                  )}
                </button>
              );
            })}
          </div>

          {/* Sub-tab content with soft fade-in on switch */}
          <div key={subTab} className="animate-in fade-in-0 duration-200">
            {subTab === 'analyst' && (
              <AnalystRatingsCard
                data={analyst}
                currentPrice={currentPrice}
                loading={analystLoading}
              />
            )}

            {subTab === 'news' && (
              <NewsAndReleasesCard
                articles={newsFeed?.news ?? []}
                releases={releases?.releases ?? []}
              />
            )}

            {subTab === 'market' && (
              <div className="space-y-5">
                <MarketHeatCard overview={overview} />
                <PeersComparisonCard overview={overview} />
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
