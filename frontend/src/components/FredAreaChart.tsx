'use client';

import { useCallback } from 'react';
import { HistoryAreaChart } from '@/components/HistoryAreaChart';
import { api } from '@/lib/api';

interface FredAreaChartProps {
  seriesId: string;
  timeRange: string;
  height?: number;
  invertColor?: boolean;
  units?: string;
}

export function FredAreaChart({ seriesId, timeRange, height = 280, invertColor = false, units }: FredAreaChartProps) {
  const fetcher = useCallback(
    (sid: string, days: number) => api.getFredHistory(sid, days, units),
    [units],
  );

  return (
    <HistoryAreaChart
      symbol={seriesId}
      timeRange={timeRange}
      height={height}
      invertColor={invertColor}
      fetcher={fetcher}
    />
  );
}
