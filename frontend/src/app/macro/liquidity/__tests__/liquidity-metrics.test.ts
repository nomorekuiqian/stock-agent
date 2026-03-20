import { describe, expect, it } from 'vitest';
import { LiquidityMetrics } from '@/lib/api';
import {
  formatLiquidityValue,
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
    expect(formatLiquidityValue(875.83, 'Billions of U.S. Dollars')).toBe('$875.83B');
    expect(formatLiquidityValue(3020000, 'Millions of U.S. Dollars')).toBe('$3.02T');
    expect(formatLiquidityValue(875830, 'Millions of U.S. Dollars')).toBe('$875.83B');
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
