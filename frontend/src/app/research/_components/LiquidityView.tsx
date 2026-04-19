'use client';

import { useEffect, useState, useMemo } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import {
  useLiquidityMetrics,
  useLiquidityHistory,
  useGlobalLiquidity,
  useGlobalLiquidityHistory,
} from '@/hooks/queries/use-liquidity-data';
import { queryKeys } from '@/hooks/queries/query-keys';
import type { LiquidityMetrics, LiquidityHistoryObservation, GlobalLiquidityMetrics, GlobalLiquidityHistoryObservation } from '@/lib/api';
import { mergeLiquidityMetricsForDisplay } from '@/app/macro/liquidity/liquidity-metrics';
import {
  type LiquidityTabId,
  EMPTY_METRICS,
  INTERVAL_MAP,
  USLiquidityDeepDive,
  GlobalLiquidityDeepDive,
} from '@/app/macro/liquidity/components';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface LiquidityContextPayload {
  type: 'macro_liquidity';
  net_liquidity: number | null;
  net_liquidity_change: number | null;
  fed_assets: number | null;
  tga: number | null;
  rrp: number | null;
  reserves: number | null;
  nfci: number | null;
  sofr: number | null;
  effr: number | null;
}

interface LiquidityViewProps {
  embedded?: boolean;
  onContextReady?: (payload: LiquidityContextPayload) => void;
}

// ---------------------------------------------------------------------------
// Sub-tab switcher for US / Global
// ---------------------------------------------------------------------------

const SUB_TABS: { key: LiquidityTabId; label: string }[] = [
  { key: 'us_liquidity', label: '美国流动性' },
  { key: 'global_liquidity', label: '全球流动性' },
];

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function LiquidityView({ embedded, onContextReady }: LiquidityViewProps) {
  const queryClient = useQueryClient();
  const [subTab, setSubTab] = useState<LiquidityTabId>('us_liquidity');
  const [timeRange, setTimeRange] = useState<'1M' | '3M' | '6M' | '1Y' | 'ALL'>('6M');

  // Data hooks — same as the full page
  const { data: metricsResponse, isLoading, error } = useLiquidityMetrics();
  const { data: historyResponse, isLoading: historyLoading, error: historyError } = useLiquidityHistory(365);
  const { data: globalResponse, isLoading: globalLoading } = useGlobalLiquidity();
  const { data: globalHistoryResponse, isLoading: globalHistoryLoading, error: globalHistoryErr } = useGlobalLiquidityHistory(365);

  const metrics = metricsResponse?.success ? metricsResponse.metrics : null;

  const { histMetrics, historyData } = useMemo(() => {
    const res = historyResponse;
    if (!res?.success || !res?.data) {
      return { histMetrics: null as LiquidityMetrics | null, historyData: [] as LiquidityHistoryObservation[] };
    }
    return {
      histMetrics: res.data.metrics ?? EMPTY_METRICS,
      historyData: res.data.observations ?? [],
    };
  }, [historyResponse]);

  const displayMetrics = useMemo(
    () => mergeLiquidityMetricsForDisplay(histMetrics, metrics),
    [histMetrics, metrics],
  );

  const globalMetrics: GlobalLiquidityMetrics | null = globalResponse?.success ? globalResponse.data : null;
  const globalHistoryData: GlobalLiquidityHistoryObservation[] = globalHistoryResponse?.success ? globalHistoryResponse.data.observations : [];
  const globalHistoryError: string | null = globalHistoryErr ? 'Failed to load global liquidity history' : null;

  const getInterval = () => INTERVAL_MAP[timeRange] ?? 'W';

  // Context payload for Agent
  useEffect(() => {
    if (!onContextReady || !metrics) return;
    onContextReady({
      type: 'macro_liquidity',
      net_liquidity: metrics.net_liquidity?.value ?? null,
      net_liquidity_change: metrics.net_liquidity?.change ?? null,
      fed_assets: metrics.fed_assets?.value ?? null,
      tga: metrics.tga?.value ?? null,
      rrp: metrics.rrp?.value ?? null,
      reserves: metrics.reserves?.value ?? null,
      nfci: metrics.nfci?.value ?? null,
      sofr: metrics.sofr?.value ?? null,
      effr: metrics.effr?.value ?? null,
    });
  }, [metrics, onContextReady]);

  // Loading state
  if (isLoading && !metrics) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-4">
        <div className="relative w-12 h-12">
          <div className="absolute inset-0 rounded-full border border-primary/20" />
          <div className="absolute inset-0 rounded-full border-t border-primary animate-spin" />
        </div>
        <span className="text-xs text-muted-foreground">加载流动性数据</span>
      </div>
    );
  }

  if (error || !metrics) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-3 px-6 text-center">
        <p className="text-sm text-muted-foreground">无法加载流动性数据</p>
      </div>
    );
  }

  return (
    <div className={embedded ? '' : 'h-full overflow-y-auto'}>
      {!embedded && (
        <>
          <div className="px-5 pt-4 pb-4">
            <span className="text-primary text-xs font-semibold tracking-[0.25em] uppercase">LIQUIDITY</span>
            <h2 className="text-xl font-editorial text-foreground leading-tight mt-1">流动性环境</h2>
            <p className="text-sm text-muted-foreground mt-1">Fed 资产负债表与货币市场指标</p>
          </div>

          <div className="border-b border-border/30" />
        </>
      )}

      <div className="px-5 py-5 space-y-6">
        {/* Sub-tab switcher: US / Global */}
        <div className="flex gap-2 overflow-x-auto pb-1">
          {SUB_TABS.map((t) => (
            <button
              key={t.key}
              onClick={() => setSubTab(t.key)}
              className={`shrink-0 flex items-center gap-2 rounded-full border px-3 py-1.5 text-sm transition-colors cursor-pointer ${
                subTab === t.key
                  ? 'border-primary/40 bg-primary/10 text-foreground'
                  : 'border-border/60 bg-card text-muted-foreground hover:text-foreground'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* Deep dive content */}
        {subTab === 'us_liquidity' && displayMetrics && (
          <USLiquidityDeepDive
            metrics={displayMetrics}
            historyData={historyData}
            historyLoading={historyLoading}
            historyError={historyError ? 'Failed to fetch liquidity data' : null}
            onRetry={() => queryClient.invalidateQueries({ queryKey: queryKeys.liquidity.all })}
            timeRange={timeRange}
            onTimeRangeChange={(r) => setTimeRange(r as typeof timeRange)}
            theme="dark"
            interval={getInterval()}
            loading={historyLoading}
          />
        )}

        {subTab === 'global_liquidity' && (
          <GlobalLiquidityDeepDive
            globalMetrics={globalMetrics}
            globalLoading={globalLoading}
            globalHistoryData={globalHistoryData}
            globalHistoryLoading={globalHistoryLoading}
            globalHistoryError={globalHistoryError}
            onRetryHistory={() => queryClient.invalidateQueries({ queryKey: queryKeys.liquidity.all })}
            timeRange={timeRange}
            onTimeRangeChange={(r) => setTimeRange(r as typeof timeRange)}
            theme="dark"
          />
        )}
      </div>
    </div>
  );
}
