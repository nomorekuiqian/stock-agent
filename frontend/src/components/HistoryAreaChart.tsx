'use client';

import { useEffect, useRef, useState } from 'react';
import { createChart, AreaSeries, HistogramSeries, Time } from 'lightweight-charts';

interface HistoryDataPoint {
  date: string;
  close: number;
}

interface HistoryAreaChartProps {
  symbol: string;
  timeRange: string;
  height?: number;
  invertColor?: boolean;
  fetcher: (symbol: string, days: number) => Promise<{
    success: boolean;
    data: Array<{ date: string; close: number }>;
  }>;
  /**
   * Optional custom formatter for the Y-axis price labels and crosshair tooltip.
   * If provided, replaces the default numeric display so e.g. raw millions values
   * like 7,234,000 render as "$7.23T" instead of "7,234,000.00" — matching the
   * compact unit (T/B/M) used on accompanying metric cards.
   */
  valueFormatter?: (value: number) => string;
  /**
   * Chart render style.
   *  - 'area' (default): smooth area chart, best for high-frequency data
   *  - 'histogram': vertical bars, best for low-frequency discrete series
   *    (e.g. quarterly GDP growth rate). Each bar colors itself green for
   *    positive values and red for negative ones.
   */
  chartType?: 'area' | 'histogram';
}

const TIME_RANGE_DAYS: Record<string, number> = {
  '1M': 30,
  '3M': 90,
  '6M': 180,
  '1Y': 365,
  '2Y': 730,
  '5Y': 1825,
  'ALL': 9999,
};

function filterByTimeRange(data: HistoryDataPoint[], timeRange: string): HistoryDataPoint[] {
  if (!data.length) return [];
  const daysToShow = TIME_RANGE_DAYS[timeRange] ?? 730;
  const cutoff = new Date(Date.now() - daysToShow * 86400000);
  return data.filter(d => new Date(d.date) >= cutoff);
}

const CHART_COLORS = {
  positive: {
    line: '#10b981',
    top: 'rgba(16, 185, 129, 0.2)',
    bottom: 'rgba(16, 185, 129, 0.0)',
  },
  negative: {
    line: '#ef4444',
    top: 'rgba(239, 68, 68, 0.2)',
    bottom: 'rgba(239, 68, 68, 0.0)',
  },
} as const;

export function HistoryAreaChart({
  symbol,
  timeRange,
  height = 280,
  invertColor = false,
  fetcher,
  valueFormatter,
  chartType = 'area',
}: HistoryAreaChartProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const rawDataRef = useRef<HistoryDataPoint[]>([]);

  // Track fetch result keyed by symbol so loading/error are derived without
  // synchronous setState in the effect body.
  const [fetchResult, setFetchResult] = useState<{
    symbol: string;
    status: 'success' | 'error';
    message?: string;
  } | null>(null);

  const loading = !fetchResult || fetchResult.symbol !== symbol;
  const error = fetchResult?.symbol === symbol && fetchResult.status === 'error'
    ? (fetchResult.message ?? 'Failed to load') : null;
  const dataReady = fetchResult?.symbol === symbol && fetchResult.status === 'success';

  useEffect(() => {
    let cancelled = false;

    fetcher(symbol, 1825)
      .then((res) => {
        if (!cancelled && res.success) {
          rawDataRef.current = res.data.map(d => ({ date: d.date, close: d.close }));
          setFetchResult({ symbol, status: 'success' });
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setFetchResult({ symbol, status: 'error', message: err instanceof Error ? err.message : 'Failed to load' });
        }
      });

    return () => { cancelled = true; };
  }, [symbol, fetcher]);

  useEffect(() => {
    if (!containerRef.current || !dataReady) return;

    const filtered = filterByTimeRange(rawDataRef.current, timeRange);
    if (filtered.length === 0) return;

    const isUp = filtered[filtered.length - 1].close >= filtered[0].close;
    const isPositive = invertColor ? !isUp : isUp;
    const colors = isPositive ? CHART_COLORS.positive : CHART_COLORS.negative;

    const chart = createChart(containerRef.current, {
      height,
      layout: {
        background: { color: 'transparent' },
        textColor: '#9ca3af',
      },
      grid: {
        vertLines: { color: 'rgba(255, 255, 255, 0.03)' },
        horzLines: { color: 'rgba(255, 255, 255, 0.03)' },
      },
      crosshair: {
        mode: 1,
        vertLine: { color: '#10b981', width: 1, style: 2, labelBackgroundColor: '#10b981' },
        horzLine: { color: '#10b981', width: 1, style: 2, labelBackgroundColor: '#10b981' },
      },
      rightPriceScale: {
        borderColor: 'rgba(255, 255, 255, 0.1)',
        scaleMargins: { top: 0.1, bottom: 0.1 },
      },
      timeScale: {
        borderColor: 'rgba(255, 255, 255, 0.1)',
        timeVisible: true,
      },
      handleScroll: { vertTouchDrag: false },
    });

    const priceFormat = valueFormatter
      ? { type: 'custom' as const, formatter: valueFormatter, minMove: 0.01 }
      : { type: 'price' as const, precision: 2, minMove: 0.01 };

    if (chartType === 'histogram') {
      const series = chart.addSeries(HistogramSeries, {
        color: colors.line,
        priceFormat,
      });
      // Color each bar by sign: positive = green, negative = red. Respect
      // invertColor for indicators where "down is good" (currently unused for
      // histograms but kept for API symmetry).
      series.setData(filtered.map(d => ({
        time: d.date as Time,
        value: d.close,
        color: (invertColor ? d.close < 0 : d.close >= 0)
          ? CHART_COLORS.positive.line
          : CHART_COLORS.negative.line,
      })));
    } else {
      const series = chart.addSeries(AreaSeries, {
        lineColor: colors.line,
        topColor: colors.top,
        bottomColor: colors.bottom,
        lineWidth: 2,
        priceFormat,
      });
      series.setData(filtered.map(d => ({ time: d.date as Time, value: d.close })));
    }

    chart.timeScale().fitContent();

    function handleResize() {
      if (containerRef.current) {
        chart.applyOptions({ width: containerRef.current.clientWidth });
      }
    }
    window.addEventListener('resize', handleResize, { passive: true });
    handleResize();

    return () => {
      window.removeEventListener('resize', handleResize);
      chart.remove();
    };
  }, [dataReady, timeRange, height, symbol, invertColor, valueFormatter, chartType]);

  if (loading) {
    return (
      <div style={{ height }} className="flex items-center justify-center">
        <div className="flex items-center gap-2 text-muted-foreground">
          <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
          <span className="text-xs">Loading chart...</span>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ height }} className="flex items-center justify-center">
        <span className="text-xs text-muted-foreground">{error}</span>
      </div>
    );
  }

  return <div ref={containerRef} className="w-full" style={{ height }} />;
}
