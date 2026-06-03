'use client';

import { useCallback, useMemo } from 'react';
import { HistoryAreaChart, type HistoryDataPoint } from '@/components/HistoryAreaChart';
import { api } from '@/lib/api';
import {
  formatCompactCurrencyFromMillions,
  formatCompactCurrencyFromBillions,
} from '@/app/macro/liquidity/liquidity-metrics';

/**
 * Presets that tell the chart how to format its Y-axis labels based on the
 * semantic meaning of the underlying FRED series values.
 *
 *  - 'currency_millions': raw values are in millions of USD (e.g. WALCL 7234000 → "$7.23T")
 *  - 'currency_billions': raw values are in billions of USD (e.g. RRPONTSYD 120 → "$120B")
 *  - 'percent': values are already percentages (e.g. UNRATE 4.2 → "4.2%")
 *  - 'thousands': raw count reported in thousands (e.g. PAYEMS 157000 → "157.0M people")
 *  - 'index': unitless index (e.g. LEI 102.5 → "102.5")
 *  - undefined (default): falls back to lightweight-charts default numeric display
 */
export type FredValueFormat =
  | 'currency_millions'
  | 'currency_billions'
  | 'percent'
  | 'thousands'
  | 'index';

interface FredAreaChartProps {
  seriesId: string;
  timeRange: string;
  height?: number;
  invertColor?: boolean;
  units?: string;
  valueFormat?: FredValueFormat;
  fallbackData?: HistoryDataPoint[];
  /** Render as area (default) or histogram bars (good for quarterly data like GDP). */
  chartType?: 'area' | 'histogram';
}

function formatPercent(value: number): string {
  return `${value.toFixed(2)}%`;
}

function formatThousandsAsPeople(value: number): string {
  // Raw data is thousands of persons (e.g. PAYEMS). Convert to millions for display.
  const abs = Math.abs(value);
  if (abs >= 1000) return `${(value / 1000).toFixed(1)}M`;
  return `${value.toFixed(0)}K`;
}

function formatIndex(value: number): string {
  return value.toFixed(2);
}

function resolveFormatter(valueFormat?: FredValueFormat): ((v: number) => string) | undefined {
  switch (valueFormat) {
    case 'currency_millions': return formatCompactCurrencyFromMillions;
    case 'currency_billions': return formatCompactCurrencyFromBillions;
    case 'percent': return formatPercent;
    case 'thousands': return formatThousandsAsPeople;
    case 'index': return formatIndex;
    default: return undefined;
  }
}

export function FredAreaChart({
  seriesId,
  timeRange,
  height = 280,
  invertColor = false,
  units,
  valueFormat,
  fallbackData,
  chartType = 'area',
}: FredAreaChartProps) {
  const fetcher = useCallback(
    (sid: string, days: number) => api.getFredHistory(sid, days, units),
    [units],
  );

  const valueFormatter = useMemo(() => resolveFormatter(valueFormat), [valueFormat]);

  return (
    <HistoryAreaChart
      symbol={seriesId}
      timeRange={timeRange}
      height={height}
      invertColor={invertColor}
      fetcher={fetcher}
      fallbackData={fallbackData}
      valueFormatter={valueFormatter}
      chartType={chartType}
    />
  );
}
