'use client';

import { useCallback } from 'react';
import { HistoryAreaChart } from '@/components/HistoryAreaChart';
import { api } from '@/lib/api';

interface CommodityAreaChartProps {
  symbol: string;
  timeRange: string;
  height?: number;
}

export function CommodityAreaChart({ symbol, timeRange, height = 280 }: CommodityAreaChartProps) {
  const fetcher = useCallback(
    (sym: string, days: number) => api.getCommodityHistory(sym, days),
    [],
  );

  return (
    <HistoryAreaChart
      symbol={symbol}
      timeRange={timeRange}
      height={height}
      fetcher={fetcher}
    />
  );
}
