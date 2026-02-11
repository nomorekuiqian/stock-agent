'use client';

import { useEffect, useRef, useMemo } from 'react';
import { createChart, IChartApi, ISeriesApi, AreaSeries, Time } from 'lightweight-charts';

function formatBillions(v: number): string {
  if (v >= 1000) return `$${(v / 1000).toFixed(2)}T`;
  return `$${v.toFixed(0)}B`;
}

interface Observation {
  time: string;
  value: number | null;
}

interface GlobalLiquidityChartProps {
  height?: number;
  data?: Observation[];
  loading?: boolean;
  error?: string | null;
  onRetry?: () => void;
}

export function GlobalLiquidityChart({
  height = 400,
  data,
  loading = false,
  error = null,
  onRetry,
}: GlobalLiquidityChartProps) {
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const seriesRef = useRef<ISeriesApi<any> | null>(null);
  const dataRef = useRef(data);

  useEffect(() => {
    dataRef.current = data;
  }, [data]);

  const latestValue = useMemo(() => {
    if (!data || data.length === 0) return null;
    const last = data[data.length - 1];
    return last.value;
  }, [data]);

  useEffect(() => {
    if (!data || data.length === 0 || !seriesRef.current) return;

    const chartData = data
      .filter(obs => obs.value != null)
      .map(obs => ({
        time: obs.time as Time,
        value: obs.value as number,
      }));

    seriesRef.current.setData(chartData);

    if (chartRef.current) {
      chartRef.current.timeScale().fitContent();
    }
  }, [data]);

  useEffect(() => {
    if (!chartContainerRef.current) return;

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

    const series = chart.addSeries(AreaSeries, {
      lineColor: '#10b981',
      topColor: 'rgba(16, 185, 129, 0.4)',
      bottomColor: 'rgba(16, 185, 129, 0.0)',
      lineWidth: 2,
      priceFormat: {
        type: 'custom',
        formatter: formatBillions,
      },
    });

    seriesRef.current = series;

    if (dataRef.current && dataRef.current.length > 0) {
      const chartData = dataRef.current
        .filter(obs => obs.value != null)
        .map(obs => ({
          time: obs.time as Time,
          value: obs.value as number,
        }));
      series.setData(chartData);
      chart.timeScale().fitContent();
    }

    const handleResize = () => {
      if (chartContainerRef.current && chartRef.current) {
        chartRef.current.applyOptions({
          width: chartContainerRef.current.clientWidth,
        });
      }
    };

    window.addEventListener('resize', handleResize);
    handleResize();

    return () => {
      window.removeEventListener('resize', handleResize);
      if (chartRef.current) {
        chartRef.current.remove();
        chartRef.current = null;
      }
      seriesRef.current = null;
    };
  }, [height]);

  return (
    <div className="bg-card rounded-xl border border-border overflow-hidden">
      <div className="px-4 py-3 border-b border-border flex items-center justify-between">
        <div>
          <h3 className="text-sm font-medium text-foreground">全球流动性指数趋势</h3>
          <p className="text-xs text-muted-foreground">Fed + ECB + BOJ - TGA - RRP</p>
        </div>
        <div className="text-right">
          {latestValue !== null && (
            <span className="text-lg font-semibold text-emerald-500 font-data">
              {formatBillions(latestValue)}
            </span>
          )}
        </div>
      </div>

      <div className="relative" style={{ height }}>
        {loading && (
          <div className="absolute inset-0 flex items-center justify-center bg-card/80 z-10">
            <div className="flex items-center gap-2 text-muted-foreground">
              <svg className="w-5 h-5 animate-spin" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
              <span className="text-sm">loading...</span>
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
                  className="px-3 py-1.5 text-xs font-medium rounded-lg bg-emerald-500/10 text-emerald-500 hover:bg-emerald-500/20 transition-colors"
                >
                  retry
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
