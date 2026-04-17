import { describe, expect, it } from 'vitest';
import { LiquidityMetrics } from '@/lib/api';
import {
  formatLiquidityValue,
  formatCompactCurrencyFromMillions,
  formatCompactCurrencyFromBillions,
  getLatestNonNullObservation,
  mergeLiquidityMetricsForDisplay,
} from '../liquidity-metrics';

const historyMetrics: LiquidityMetrics = {
  fed_assets: { series_id: 'WALCL', title: 'Fed', value: 6610, date: '2026-03-12', units: 'Billions of U.S. Dollars', change: 0.1 },
  tga: { series_id: 'WDTGAL', title: 'TGA', value: 908, date: '2026-03-12', units: 'Billions of U.S. Dollars', change: -4.7 },
  rrp: { series_id: 'RRPONTSYD', title: 'RRP', value: 1, date: '2026-03-12', units: 'Billions of U.S. Dollars', change: -58 },
  reserves: { series_id: 'WRESBAL', title: 'Reserves', value: 2930, date: '2026-03-12', units: 'Billions of U.S. Dollars', change: 0.8 },
  sofr: { series_id: 'SOFR', title: 'SOFR', value: 4.2, date: '2026-03-18', units: 'Percent', change: 0 },
  effr: { series_id: 'EFFR', title: 'EFFR', value: 4.1, date: '2026-03-18', units: 'Percent', change: 0 },
  nfci: { series_id: 'NFCI', title: 'NFCI', value: -0.5, date: '2026-03-12', units: 'Index', change: 0 },
  net_liquidity: { series_id: 'CALCULATED', title: 'Net', value: 5701, date: '2026-03-12', units: 'Billions of Dollars', change: 0.2 },
};

const latestMetrics: LiquidityMetrics = {
  fed_assets: { series_id: 'WALCL', title: 'Fed', value: 6660, date: '2026-03-19', units: 'Billions of U.S. Dollars', change: 0.14 },
  tga: { series_id: 'WDTGAL', title: 'TGA', value: 875.83, date: '2026-03-19', units: 'Billions of U.S. Dollars', change: 8.69 },
  rrp: { series_id: 'RRPONTSYD', title: 'RRP', value: 0.637, date: '2026-03-19', units: 'Billions of U.S. Dollars', change: 49.18 },
  reserves: { series_id: 'WRESBAL', title: 'Reserves', value: 3020, date: '2026-03-19', units: 'Billions of U.S. Dollars', change: -0.58 },
  sofr: { series_id: 'SOFR', title: 'SOFR', value: 4.33, date: '2026-03-19', units: 'Percent', change: 0.1 },
  effr: { series_id: 'EFFR', title: 'EFFR', value: 4.31, date: '2026-03-19', units: 'Percent', change: 0.1 },
  nfci: { series_id: 'NFCI', title: 'NFCI', value: -0.45, date: '2026-03-19', units: 'Index', change: 0.2 },
  net_liquidity: { series_id: 'CALCULATED', title: 'Net', value: 5783, date: '2026-03-19', units: 'Billions of Dollars', change: 1.2 },
};

describe('mergeLiquidityMetricsForDisplay', () => {
  it('prefers latest single-series values while keeping historical net liquidity', () => {
    const merged = mergeLiquidityMetricsForDisplay(historyMetrics, latestMetrics);

    expect(merged?.fed_assets.value).toBe(6660);
    expect(merged?.tga.value).toBe(875.83);
    expect(merged?.rrp.value).toBe(0.637);
    expect(merged?.reserves.value).toBe(3020);
    expect(merged?.sofr.value).toBe(4.33);
    expect(merged?.net_liquidity.value).toBe(5701);
    expect(merged?.net_liquidity.date).toBe('2026-03-12');
  });

  it('falls back cleanly when only one source exists', () => {
    expect(mergeLiquidityMetricsForDisplay(historyMetrics, null)).toEqual(historyMetrics);
    expect(mergeLiquidityMetricsForDisplay(null, latestMetrics)).toEqual(latestMetrics);
    expect(mergeLiquidityMetricsForDisplay(null, null)).toBeNull();
  });
});

describe('formatLiquidityValue', () => {
  it('keeps liquidity figures granular enough to match charts', () => {
    expect(formatLiquidityValue(0.637, 'Billions of U.S. Dollars')).toBe('$637M');
    // B range: integer precision (876B, not 875.83B) — matches chart Y-axis format
    expect(formatLiquidityValue(875.83, 'Billions of U.S. Dollars')).toBe('$876B');
    // T range: 2 decimal places (was 3, simplified for readability)
    expect(formatLiquidityValue(3020000, 'Millions of U.S. Dollars')).toBe('$3.02T');
    expect(formatLiquidityValue(875830, 'Millions of U.S. Dollars')).toBe('$876B');
  });
});

describe('formatCompactCurrencyFromMillions', () => {
  it('converts millions to T/B/M', () => {
    expect(formatCompactCurrencyFromMillions(7_234_000)).toBe('$7.23T');
    expect(formatCompactCurrencyFromMillions(1_000_000)).toBe('$1.00T');
    expect(formatCompactCurrencyFromMillions(800_000)).toBe('$800B');
    expect(formatCompactCurrencyFromMillions(1_500)).toBe('$2B');
    expect(formatCompactCurrencyFromMillions(500)).toBe('$500M');
  });

  it('handles negative values', () => {
    expect(formatCompactCurrencyFromMillions(-2_500_000)).toBe('$-2.50T');
  });

  it('handles zero', () => {
    expect(formatCompactCurrencyFromMillions(0)).toBe('$0M');
  });
});

describe('formatCompactCurrencyFromBillions', () => {
  it('converts billions to T/B/M', () => {
    expect(formatCompactCurrencyFromBillions(5_500)).toBe('$5.50T');
    expect(formatCompactCurrencyFromBillions(1_000)).toBe('$1.00T');
    expect(formatCompactCurrencyFromBillions(637)).toBe('$637B');
    expect(formatCompactCurrencyFromBillions(0.637)).toBe('$637M');
  });

  it('handles negative values', () => {
    expect(formatCompactCurrencyFromBillions(-120)).toBe('$-120B');
  });

  it('handles zero', () => {
    expect(formatCompactCurrencyFromBillions(0)).toBe('$0M');
  });
});

describe('formatLiquidityValue edge cases', () => {
  it('returns N/A for null', () => {
    expect(formatLiquidityValue(null, 'Billions')).toBe('N/A');
  });

  it('formats percent units', () => {
    expect(formatLiquidityValue(4.33, 'Percent')).toBe('4.33%');
  });

  it('formats rate units', () => {
    expect(formatLiquidityValue(0.0532, 'rate')).toBe('0.0532');
  });

  it('falls back to 2 decimals for unknown units', () => {
    expect(formatLiquidityValue(102.456, 'Index')).toBe('102.46');
  });
});

describe('getLatestNonNullObservation', () => {
  it('returns the latest non-null history point for headline cards', () => {
    expect(
      getLatestNonNullObservation([
        { time: '2026-03-01', value: null },
        { time: '2026-03-08', value: 10 },
        { time: '2026-03-15', value: 12 },
      ]),
    ).toEqual({ time: '2026-03-15', value: 12 });
  });
});
