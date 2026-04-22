'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { createChart, HistogramSeries, Time } from 'lightweight-charts';
import { api } from '@/lib/api';

interface FredBarChartProps {
  seriesId: string;
  timeRange: string;
  height?: number;
  units?: string;
}

interface DataPoint {
  date: string;
  close: number;
}

const TIME_RANGE_DAYS: Record<string, number> = {
  '1Y': 365,
  '2Y': 730,
  '3Y': 1095,
  '5Y': 1825,
  '10Y': 3650,
  'ALL': 9999,
};

export function FredBarChart({ seriesId, timeRange, height = 200, units }: FredBarChartProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const rawDataRef = useRef<DataPoint[]>([]);

  const [fetchResult, setFetchResult] = useState<{
    symbol: string;
    status: 'success' | 'error';
    message?: string;
  } | null>(null);

  const loading = !fetchResult || fetchResult.symbol !== seriesId;
  const error = fetchResult?.symbol === seriesId && fetchResult.status === 'error'
    ? (fetchResult.message ?? 'Failed to load') : null;
  const dataReady = fetchResult?.symbol === seriesId && fetchResult.status === 'success';

  const fetcher = useCallback(
    (sid: string, days: number) => api.getFredHistory(sid, days, units),
    [units],
  );

  useEffect(() => {
    let cancelled = false;

    fetcher(seriesId, 1825)
      .then((res) => {
        if (!cancelled && res.success) {
          rawDataRef.current = res.data.map(d => ({ date: d.date, close: d.close }));
          setFetchResult({ symbol: seriesId, status: 'success' });
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setFetchResult({ symbol: seriesId, status: 'error', message: err instanceof Error ? err.message : 'Failed to load' });
        }
      });

    return () => { cancelled = true; };
  }, [seriesId, fetcher]);

  useEffect(() => {
    if (!containerRef.current || !dataReady) return;

    const daysToShow = TIME_RANGE_DAYS[timeRange] ?? 730;
    const cutoff = new Date(Date.now() - daysToShow * 86400000);
    const filtered = rawDataRef.current.filter(d => new Date(d.date) >= cutoff);
    if (filtered.length === 0) return;

    const chart = createChart(containerRef.current, {
      height,
      layout: {
        background: { color: 'transparent' },
        textColor: '#9ca3af',
      },
      grid: {
        vertLines: { color: 'rgba(255, 255, 255, 0.03)' },
        horzLines: { color: 'rgba(255, 255, 255, 0.05)' },
      },
      crosshair: {
        mode: 1,
        vertLine: { color: '#10b981', width: 1, style: 2, labelBackgroundColor: '#10b981' },
        horzLine: { color: '#10b981', width: 1, style: 2, labelBackgroundColor: '#10b981' },
      },
      rightPriceScale: {
        borderColor: 'rgba(255, 255, 255, 0.1)',
        scaleMargins: { top: 0.1, bottom: 0.05 },
      },
      timeScale: {
        borderColor: 'rgba(255, 255, 255, 0.1)',
        timeVisible: true,
      },
      handleScroll: { vertTouchDrag: false },
    });

    const series = chart.addSeries(HistogramSeries, {
      priceFormat: { type: 'price', precision: 2, minMove: 0.01 },
    });

    series.setData(filtered.map(d => ({
      time: d.date as Time,
      value: d.close,
      color: d.close >= 0 ? 'rgba(16, 185, 129, 0.7)' : 'rgba(239, 68, 68, 0.7)',
    })));

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
  }, [dataReady, timeRange, height, seriesId]);

  if (loading) {
    return (
      <div style={{ height }} className="flex items-center justify-center">
        <div className="text-xs text-muted-foreground/50">Loading chart...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ height }} className="flex items-center justify-center">
        <div className="text-xs text-red-500/70">{error}</div>
      </div>
    );
  }

  return <div ref={containerRef} style={{ height }} />;
}
