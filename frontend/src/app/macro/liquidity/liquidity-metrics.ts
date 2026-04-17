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

/**
 * Format a raw numeric value (in `units`) as a compact US-dollar string
 * with a T/B/M suffix. Shared between text cards and chart Y-axis so that
 * "$6.52T" on the card matches "$6.52T" on the Y-axis label without any
 * mental unit conversion.
 *
 * Precision rules:
 *  - Trillion  (≥ 1T): 2 decimals (e.g. "$6.52T")
 *  - Billion   (≥ 1B): integer    (e.g. "$637B") — keep粒度 between 1B and 999B
 *  - Million   (< 1B): integer    (e.g. "$637M") — preserves the 0.637B → 637M case
 *  - Percent:         2 decimals  (e.g. "3.25%")
 */
export function formatLiquidityValue(value: number | null, units: string): string {
  if (value === null) return 'N/A';

  const normalizedUnits = units.toLowerCase();

  if (normalizedUnits.includes('billion')) {
    return formatCompactCurrencyFromBillions(value);
  }

  if (normalizedUnits.includes('million')) {
    return formatCompactCurrencyFromMillions(value);
  }

  if (normalizedUnits.includes('percent')) return `${value.toFixed(2)}%`;
  if (normalizedUnits === 'rate') return value.toFixed(4);
  return value.toFixed(2);
}

/** Format when the source value is in millions of USD (e.g. FRED WALCL, WDTGAL, WRESBAL). */
export function formatCompactCurrencyFromMillions(value: number): string {
  const abs = Math.abs(value);
  if (abs >= 1_000_000) return `$${(value / 1_000_000).toFixed(2)}T`;
  if (abs >= 1000) return `$${(value / 1000).toFixed(0)}B`;
  return `$${value.toFixed(0)}M`;
}

/** Format when the source value is in billions of USD (e.g. FRED RRPONTSYD, calculated net liquidity). */
export function formatCompactCurrencyFromBillions(value: number): string {
  const abs = Math.abs(value);
  if (abs >= 1000) return `$${(value / 1000).toFixed(2)}T`;
  if (abs >= 1) return `$${value.toFixed(0)}B`;
  return `$${(value * 1000).toFixed(0)}M`;
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
