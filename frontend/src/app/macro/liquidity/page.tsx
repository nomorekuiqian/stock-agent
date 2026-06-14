'use client';

import { useState, useEffect, useMemo, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { MacroPageHeader } from '@/components/MacroPageHeader';
import type {
  LiquidityMetrics,
  LiquidityHistoryObservation,
  GlobalLiquidityMetrics,
  GlobalLiquidityHistoryObservation,
} from '@/lib/api';
import { useLiquidityMetrics, useLiquidityHistory, useGlobalLiquidity, useGlobalLiquidityHistory } from '@/hooks/queries/use-liquidity-data';
import { useWeeklyReport } from '@/hooks/queries/use-weekly-report';
import { queryKeys } from '@/hooks/queries/query-keys';
import { InsightBanner } from '@/components/InsightBanner';
import { formatDateTimePacific } from '@/lib/timezone';
import {
  formatLiquidityValue,
  getLatestNonNullObservation,
  mergeLiquidityMetricsForDisplay,
} from './liquidity-metrics';
import {
  type LiquidityTabId,
  TAB_ORDER,
  TAB_META,
  EMPTY_METRIC,
  EMPTY_METRICS,
  INTERVAL_MAP,
  getColorClass,
  interpretChange,
  USLiquidityDeepDive,
  GlobalLiquidityDeepDive,
} from './components';

// ---------------------------------------------------------------------------
// Page-local components
// ---------------------------------------------------------------------------

type TabId = LiquidityTabId;

function HeroCardSkeleton({ index }: { index: number }) {
  return (
    <div
      className="bg-card rounded-2xl border border-border/50 p-5"
      style={{ animationDelay: `${index * 100}ms` }}
    >
      <div className="animate-pulse">
        <div className="h-3 w-12 bg-muted rounded mb-3" />
        <div className="h-10 w-28 bg-muted rounded mb-2" />
        <div className="h-3 w-24 bg-muted rounded mb-3" />
        <div className="h-px bg-border my-3" />
        <div className="h-3 w-32 bg-muted rounded" />
      </div>
    </div>
  );
}

function LiquidityHeroCard({
  tabId,
  primaryLabel,
  primaryFormatted,
  secondaryLabel,
  secondaryFormatted,
  accentColor,
  index,
  selected,
  onSelect,
}: {
  tabId: TabId;
  primaryLabel: string;
  primaryFormatted: string;
  secondaryLabel: string;
  secondaryFormatted: string;
  accentColor: string;
  index: number;
  selected: boolean;
  onSelect: () => void;
}) {
  const config = TAB_META[tabId];

  return (
    <button
      type="button"
      onClick={onSelect}
      className={`
        group relative rounded-2xl p-5 flex flex-col text-left
        transition-all duration-300 ease-out cursor-pointer
        ${
          selected
            ? 'bg-card border-2 translate-y-[-3px]'
            : 'bg-card/60 border border-border/40 hover:bg-card hover:border-border/60 hover:translate-y-[-2px]'
        }
        ${
          selected
            ? accentColor === 'emerald'
              ? 'border-emerald-500'
              : accentColor === 'amber'
                ? 'border-amber-500'
                : 'border-red-500'
            : ''
        }
      `}
      style={{
        boxShadow: selected
          ? accentColor === 'emerald'
            ? '0 8px 32px rgba(16,185,129,0.15), 0 0 0 1px rgba(16,185,129,0.1)'
            : accentColor === 'amber'
              ? '0 8px 32px rgba(245,158,11,0.15), 0 0 0 1px rgba(245,158,11,0.1)'
              : '0 8px 32px rgba(239,68,68,0.15), 0 0 0 1px rgba(239,68,68,0.1)'
          : undefined,
        animationDelay: `${index * 120}ms`,
      }}
    >
      {/* Tab label */}
      <div className="mb-3">
        <span className="text-xs font-medium uppercase tracking-[0.15em] text-muted-foreground">
          {config.name}
        </span>
      </div>

      {/* Primary big number */}
      <div className="mb-1">
        <span
          className={`text-data-hero font-bold font-data tracking-tighter leading-tight transition-colors duration-300 ${
            selected
              ? getColorClass(accentColor)
              : 'text-foreground group-hover:text-foreground'
          }`}
        >
          {primaryFormatted}
        </span>
      </div>

      {/* Label */}
      <p className="text-xs text-muted-foreground mb-3">{primaryLabel}</p>

      {/* Divider */}
      <div className="h-px bg-border/50 mb-3 mt-auto" />

      {/* Secondary metric */}
      <div className="flex items-center justify-between text-xs">
        <span className="text-muted-foreground">{secondaryLabel}</span>
        <span className="font-data font-medium text-foreground">
          {secondaryFormatted}
        </span>
      </div>

      {/* Hover hint */}
      <div
        className={`absolute inset-x-0 bottom-2 flex justify-center transition-opacity duration-200 ${
          selected
            ? 'opacity-0'
            : 'opacity-0 group-hover:opacity-100'
        }`}
      >
        <span className="text-micro text-muted-foreground bg-background/80 px-2 py-0.5 rounded-full">
          点击查看详情
        </span>
      </div>
    </button>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function LiquidityPage() {
  const [timeRange, setTimeRange] = useState<
    '1M' | '3M' | '6M' | '1Y' | 'ALL'
  >('6M');
  const [theme] = useState<'light' | 'dark'>('dark');

  // Tab state
  const [selectedTab, setSelectedTab] = useState<TabId>('us_liquidity');
  const [isTransitioning, setIsTransitioning] = useState(false);
  const queryClient = useQueryClient();

  // TanStack Query hooks — defer heavy global history until that tab is selected
  const isGlobalTab = selectedTab === 'global_liquidity';
  const { data: metricsResponse } = useLiquidityMetrics();
  const { data: historyResponse, isLoading: historyLoading, error: historyError } = useLiquidityHistory(365);
  const { data: globalResponse, isLoading: globalLoading } = useGlobalLiquidity();
  const { data: globalHistoryResponse, isLoading: globalHistoryLoading, error: globalHistoryErr } = useGlobalLiquidityHistory(365, isGlobalTab);
  const { data: weeklyResponse, isLoading: weeklyLoading } = useWeeklyReport();

  // Derived state from query results
  const loading = historyLoading;
  const error = historyError ? 'Failed to fetch liquidity data' : null;
  const weeklyReport = weeklyResponse?.success ? weeklyResponse.data : null;

  const { metrics, historyData, lastUpdated, dataUnavailable } = useMemo(() => {
    const res = historyResponse;
    if (!res?.success || !res?.data) {
      if (historyError) {
        return { metrics: EMPTY_METRICS as LiquidityMetrics, historyData: [] as LiquidityHistoryObservation[], lastUpdated: null as string | null, dataUnavailable: true };
      }
      return { metrics: null as LiquidityMetrics | null, historyData: [] as LiquidityHistoryObservation[], lastUpdated: null as string | null, dataUnavailable: false };
    }
    const obs = res.data.observations ?? [];
    const m = res.data.metrics ?? EMPTY_METRICS;
    const unavailable = !res.data.metrics || obs.length === 0;
    return { metrics: m, historyData: obs, lastUpdated: res.timestamp, dataUnavailable: unavailable };
  }, [historyResponse, historyError]);

  const latestMetrics = metricsResponse?.success ? metricsResponse.metrics : null;
  const displayMetrics = useMemo(
    () => mergeLiquidityMetricsForDisplay(metrics, latestMetrics),
    [metrics, latestMetrics],
  );
  const globalMetrics: GlobalLiquidityMetrics | null = globalResponse?.success ? globalResponse.data : null;
  const globalHistoryData: GlobalLiquidityHistoryObservation[] = globalHistoryResponse?.success ? globalHistoryResponse.data.observations : [];
  const globalHistoryError: string | null = globalHistoryErr ? 'Failed to load global liquidity history' : null;
  const latestGlobalObservation = useMemo(
    () => getLatestNonNullObservation(globalHistoryData),
    [globalHistoryData],
  );

  const getInterval = () => INTERVAL_MAP[timeRange] ?? 'W';

  const tabTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (tabTimerRef.current) {
        clearTimeout(tabTimerRef.current);
      }
    };
  }, []);

  const handleTabSelect = (tabId: TabId) => {
    if (selectedTab === tabId) return;
    setIsTransitioning(true);
    tabTimerRef.current = setTimeout(() => {
      setSelectedTab(tabId);
      setIsTransitioning(false);
    }, 200);
  };

  // Build hero card data for each tab
  const getHeroProps = (tabId: TabId) => {
    if (tabId === 'us_liquidity') {
      const primary = displayMetrics?.net_liquidity ?? EMPTY_METRIC;
      const secondary = displayMetrics?.sofr ?? EMPTY_METRIC;
      return {
        primaryLabel: 'WALCL - TGA - RRP',
        primaryFormatted: formatLiquidityValue(primary.value, primary.units),
        secondaryLabel: 'SOFR',
        secondaryFormatted: secondary.value !== null ? `${secondary.value.toFixed(2)}%` : 'N/A',
        accentColor: interpretChange(primary.change),
      };
    }
    // Keep the global-liquidity headline number aligned with the history chart's latest point.
    const glIndex = latestGlobalObservation
      ? {
          value: latestGlobalObservation.value,
          units: 'Billions of U.S. Dollars',
        }
      : globalMetrics?.global_liquidity;
    const secondary = globalMetrics?.ecb_assets;
    return {
      primaryLabel: 'Fed + ECB + BOJ - TGA - RRP',
      primaryFormatted: glIndex?.value != null
        ? formatLiquidityValue(glIndex.value, 'Billions of U.S. Dollars')
        : globalLoading ? '...' : 'N/A',
      secondaryLabel: '欧洲央行 (ECB) 总资产',
      secondaryFormatted: secondary?.value != null
        ? formatLiquidityValue(secondary.value, 'Billions of U.S. Dollars')
        : 'N/A',
      accentColor: glIndex?.value != null ? 'emerald' : 'amber',
    };
  };

  return (
    <main className="min-h-screen bg-background">
      <MacroPageHeader
        section="Liquidity"
        title="流动性环境"
        question="市场上的钱是多了还是少了?"
        lastUpdated={lastUpdated ? formatDateTimePacific(lastUpdated) : null}
        loading={loading}
        onRefresh={() => queryClient.invalidateQueries({ queryKey: queryKeys.liquidity.all })}
      />

      {/* Error Message */}
      {error && (
        <div className="max-w-6xl mx-auto px-4 md:px-6 py-4">
          <div className="p-4 rounded-2xl bg-red-500/10 border border-red-500/20 text-red-500 text-sm">
            {error}
          </div>
        </div>
      )}

      {/* FRED Data Unavailable Banner */}
      {dataUnavailable && !loading && (
        <div className="max-w-6xl mx-auto px-4 md:px-6 py-4">
          <div className="p-4 rounded-2xl bg-amber-500/10 border border-amber-500/20 text-amber-400 text-sm flex items-start gap-3">
            <svg className="w-5 h-5 shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
            </svg>
            <div>
              <p className="font-medium">FRED 数据源暂时不可用</p>
              <p className="text-amber-400/80 mt-1">
                实时数值数据暂时无法加载。下方的 TradingView 图表和 AI 分析仍然可用。
              </p>
            </div>
          </div>
        </div>
      )}

      <div className="max-w-6xl mx-auto px-4 md:px-6 py-6 space-y-8">
        {/* Hero Section: 2 big-number cards (tabs) */}
        <section>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {loading
              ? [0, 1].map((i) => <HeroCardSkeleton key={i} index={i} />)
              : TAB_ORDER.map((tabId, i) => {
                  const heroProps = getHeroProps(tabId);
                  return (
                    <LiquidityHeroCard
                      key={tabId}
                      tabId={tabId}
                      {...heroProps}
                      index={i}
                      selected={selectedTab === tabId}
                      onSelect={() => handleTabSelect(tabId)}
                    />
                  );
                })}
          </div>
        </section>

        {/* Insight Banner */}
        <InsightBanner
          sectionTitle="流动性"
          analysis={weeklyReport?.liquidity_analysis ?? null}
          signalColor={weeklyReport?.signal_lights.liquidity ?? null}
          weekLabel={weeklyReport?.week_label ?? null}
          loading={weeklyLoading}
        />

        {/* Deep Dive: Selected tab content */}
        <div
          className={`transition-all duration-300 ease-out ${
            isTransitioning
              ? 'opacity-0 translate-y-4'
              : 'opacity-100 translate-y-0'
          }`}
        >
          {selectedTab === 'us_liquidity' && displayMetrics && (
            <USLiquidityDeepDive
              metrics={displayMetrics}
              historyData={historyData}
              historyLoading={loading}
              historyError={error}
              onRetry={() => queryClient.invalidateQueries({ queryKey: queryKeys.liquidity.all })}
              timeRange={timeRange}
              onTimeRangeChange={(r) =>
                setTimeRange(r as typeof timeRange)
              }
              theme={theme}
              interval={getInterval()}
              loading={loading}
            />
          )}
          {selectedTab === 'global_liquidity' && (
            <GlobalLiquidityDeepDive
              globalMetrics={globalMetrics}
              globalLoading={globalLoading}
              globalHistoryData={globalHistoryData}
              globalHistoryLoading={globalHistoryLoading}
              globalHistoryError={globalHistoryError}
              onRetryHistory={() => queryClient.invalidateQueries({ queryKey: queryKeys.liquidity.all })}
              timeRange={timeRange}
              onTimeRangeChange={(r) =>
                setTimeRange(r as typeof timeRange)
              }
              theme={theme}
            />
          )}
        </div>

        {/* Footer */}
        <section className="text-center py-4">
          <Link
            href="/macro"
            className="group inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-primary transition-colors duration-200"
          >
            <svg
              className="w-4 h-4 transition-transform duration-200 group-hover:-translate-x-1"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1.5}
                d="M15 19l-7-7 7-7"
              />
            </svg>
            返回宏观总览
          </Link>
          <p className="text-xs text-muted-foreground/70 mt-3">
            数据来源{' '}
            <a
              href="https://fred.stlouisfed.org/"
              target="_blank"
              rel="noopener noreferrer"
              className="text-primary hover:text-primary/80 transition-colors"
            >
              FRED
            </a>
            {' '}&middot;{' '}图表{' '}
            <a
              href="https://www.tradingview.com/"
              target="_blank"
              rel="noopener noreferrer"
              className="text-primary hover:text-primary/80 transition-colors"
            >
              TradingView
            </a>
          </p>
        </section>
      </div>
    </main>
  );
}
