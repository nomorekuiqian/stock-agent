'use client';

import { useEffect, useRef, useState } from 'react';
import { createChart, AreaSeries, Time } from 'lightweight-charts';

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
}

const TIME_RANGE_DAYS: Record<string, number> = {
  '1M': 30,
  '3M': 90,
  '6M': 180,
  '1Y': 365,
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

    fetcher(symbol, 730)
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
        timeVisible: false,
      },
      handleScroll: { vertTouchDrag: false },
    });

    const series = chart.addSeries(AreaSeries, {
      lineColor: colors.line,
      topColor: colors.top,
      bottomColor: colors.bottom,
      lineWidth: 2,
      priceFormat: { type: 'price', precision: 2, minMove: 0.01 },
    });

    series.setData(filtered.map(d => ({ time: d.date as Time, value: d.close })));
    chart.timeScale().fitContent();

    function handleResize() {
      if (containerRef.current) {
        chart.applyOptions({ width: containerRef.current.clientWidth });
      }
    }
    window.addEventListener('resize', handleResize);
    handleResize();

    return () => {
      window.removeEventListener('resize', handleResize);
      chart.remove();
    };
  }, [dataReady, timeRange, height, symbol, invertColor]);

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
