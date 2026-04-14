'use client';

import { useEffect, useRef, useMemo } from 'react';
import { createChart, IChartApi, ISeriesApi, AreaSeries, Time } from 'lightweight-charts';

interface HistoryObservation {
  time: string;
  value: number;
  fed_assets: number;
  tga: number;
  rrp: number;
}

interface NetLiquidityChartProps {
  height?: number;
  data?: HistoryObservation[];
  loading?: boolean;
  error?: string | null;
  onRetry?: () => void;
  compact?: boolean;
}

export function NetLiquidityChart({
  height = 400,
  data,
  loading = false,
  error = null,
  onRetry,
  compact = false,
}: NetLiquidityChartProps) {
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const seriesRef = useRef<ISeriesApi<any> | null>(null);
  const dataRef = useRef(data);

  useEffect(() => {
    dataRef.current = data;
  }, [data]);

  // Compute latest value from data
  const latestValue = useMemo(() => {
    if (!data || data.length === 0) return null;
    return data[data.length - 1].value;
  }, [data]);

  // Update chart when data changes after chart is already created
  useEffect(() => {
    if (!data || data.length === 0 || !seriesRef.current) return;

    const chartData = data.map(obs => ({
      time: obs.time as Time,
      value: obs.value,
    }));

    seriesRef.current.setData(chartData);

    if (chartRef.current) {
      chartRef.current.timeScale().fitContent();
    }
  }, [data]);

  useEffect(() => {
    if (!chartContainerRef.current) return;

    // Create chart
    const chart = createChart(chartContainerRef.current, {
      height,
      layout: {
        background: { color: 'transparent' },
        textColor: '#9ca3af',
      },
      grid: {
        vertLines: { color: 'rgba(255, 255, 255, 0.05)' },
        horzLines: { color: 'rgba(255, 255, 255, 0.05)' },
      },
      crosshair: {
        mode: 1,
        vertLine: {
          color: '#10b981',
          width: 1,
          style: 2,
        },
        horzLine: {
          color: '#10b981',
          width: 1,
          style: 2,
        },
      },
      rightPriceScale: {
        borderColor: 'rgba(255, 255, 255, 0.1)',
        scaleMargins: {
          top: 0.1,
          bottom: 0.1,
        },
      },
      timeScale: {
        borderColor: 'rgba(255, 255, 255, 0.1)',
        timeVisible: true,
        secondsVisible: false,
      },
      handleScroll: {
        vertTouchDrag: false,
      },
    });

    chartRef.current = chart;

    // Create area series using v5 API
    const series = chart.addSeries(AreaSeries, {
      lineColor: '#10b981',
      topColor: 'rgba(16, 185, 129, 0.4)',
      bottomColor: 'rgba(16, 185, 129, 0.0)',
      lineWidth: 2,
      priceFormat: {
        type: 'custom',
        formatter: (price: number) => `$${(price / 1000).toFixed(3)}T`,
      },
    });

    seriesRef.current = series;

    // Set data immediately if already available (handles tab-based lazy mount)
    if (dataRef.current && dataRef.current.length > 0) {
      series.setData(
        dataRef.current.map(obs => ({
          time: obs.time as Time,
          value: obs.value,
        }))
      );
      chart.timeScale().fitContent();
    }

    // Handle resize
    const handleResize = () => {
      if (chartContainerRef.current && chartRef.current) {
        chartRef.current.applyOptions({
          width: chartContainerRef.current.clientWidth,
        });
      }
    };

    window.addEventListener('resize', handleResize, { passive: true });
    handleResize();

    return () => {
      window.removeEventListener('resize', handleResize);
      if (chartRef.current) {
        chartRef.current.remove();
        chartRef.current = null;
      }
    };
  }, [height]);

  return (
    <div className={compact ? '' : 'bg-card rounded-xl border border-border overflow-hidden'}>
      {!compact && (
        <div className="px-4 py-3 border-b border-border flex items-center justify-between">
          <div>
            <h3 className="text-sm font-medium text-foreground">净流动性趋势</h3>
            <p className="text-xs text-muted-foreground">WALCL - TGA - RRP (历史数据)</p>
          </div>
          <div className="text-right">
            {latestValue !== null && (
              <span className="text-lg font-semibold text-primary">
                ${(latestValue / 1000).toFixed(2)}T
              </span>
            )}
          </div>
        </div>
      )}

      <div className="relative" style={{ height }}>
        {loading && (
          <div className="absolute inset-0 flex items-center justify-center bg-card/80 z-10">
            <div className="flex items-center gap-2 text-muted-foreground">
              <svg className="w-5 h-5 animate-spin" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
              <span className="text-sm">加载图表数据...</span>
            </div>
          </div>
        )}

        {error && (
          <div className="absolute inset-0 flex items-center justify-center bg-card/80 z-10">
            <div className="text-center">
              <p className="text-red-500 text-sm mb-2">{error}</p>
              {onRetry && (
                <button
                  onClick={onRetry}
                  className="px-3 py-1.5 text-xs font-medium rounded-lg bg-primary/10 text-primary hover:bg-primary/20 transition-colors"
                >
                  重试
                </button>
              )}
            </div>
          </div>
        )}

        <div ref={chartContainerRef} className="w-full h-full" />
      </div>
    </div>
  );
}
