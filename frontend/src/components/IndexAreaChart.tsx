'use client';

import { useCallback } from 'react';
import { HistoryAreaChart } from '@/components/HistoryAreaChart';
import { api } from '@/lib/api';

const INVERTED_SYMBOLS = new Set(['VIX', 'VVIX', 'SKEW']);

interface IndexAreaChartProps {
  symbol: string;
  timeRange: string;
  height?: number;
}

export function IndexAreaChart({ symbol, timeRange, height = 280 }: IndexAreaChartProps) {
  const fetcher = useCallback(
    (sym: string, days: number) => api.getSentimentHistory(sym, days),
    [],
  );

  return (
    <HistoryAreaChart
      symbol={symbol}
      timeRange={timeRange}
      height={height}
      invertColor={INVERTED_SYMBOLS.has(symbol.toUpperCase())}
      fetcher={fetcher}
    />
  );
}
