import { LiquidityMetrics } from '@/lib/api';

const LATEST_SERIES_KEYS = [
  'fed_assets',
  'tga',
  'rrp',
  'reserves',
  'sofr',
  'effr',
  'nfci',
] as const;

export function mergeLiquidityMetricsForDisplay(
  historyMetrics: LiquidityMetrics | null,
  latestMetrics: LiquidityMetrics | null,
): LiquidityMetrics | null {
  if (!historyMetrics && !latestMetrics) {
    return null;
  }

  if (!historyMetrics) {
    return latestMetrics;
  }

  if (!latestMetrics) {
    return historyMetrics;
  }

  return {
    ...historyMetrics,
    ...Object.fromEntries(
      LATEST_SERIES_KEYS.map((key) => [key, latestMetrics[key]]),
    ),
    // Net liquidity should stay aligned with the historical chart's latest point.
    net_liquidity: historyMetrics.net_liquidity,
  };
}

export function formatLiquidityValue(value: number | null, units: string): string {
  if (value === null) return 'N/A';

  const normalizedUnits = units.toLowerCase();
  const abs = Math.abs(value);

  if (normalizedUnits.includes('billion')) {
    if (abs >= 1000) return `$${(value / 1000).toFixed(2)}T`;
    if (abs >= 1) return `$${value.toFixed(2)}B`;
    return `$${(value * 1000).toFixed(0)}M`;
  }

  if (normalizedUnits.includes('million')) {
    if (abs >= 1_000_000) return `$${(value / 1_000_000).toFixed(2)}T`;
    if (abs >= 1000) return `$${(value / 1000).toFixed(2)}B`;
    return `$${value.toFixed(0)}M`;
  }

  if (normalizedUnits.includes('percent')) return `${value.toFixed(2)}%`;
  if (normalizedUnits === 'rate') return value.toFixed(4);
  return value.toFixed(2);
}

export function getLatestNonNullObservation<T extends { time: string; value: number | null }>(
  observations: T[],
): T | null {
  for (let index = observations.length - 1; index >= 0; index -= 1) {
    if (observations[index].value !== null) {
      return observations[index];
    }
  }

  return null;
}
