'use client';

import { useEffect, useRef, useMemo, useState } from 'react';
import { createChart, IChartApi, ISeriesApi, CandlestickSeries, AreaSeries, Time } from 'lightweight-charts';

interface PriceData {
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

interface StockPriceChartProps {
  symbol: string;
  data?: PriceData[];
  loading?: boolean;
  error?: string | null;
  height?: number;
  onRetry?: () => void;
}

type ChartType = 'area' | 'candle';

export function StockPriceChart({
  symbol,
  data,
  loading = false,
  error = null,
  height = 300,
  onRetry,
}: StockPriceChartProps) {
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const seriesRef = useRef<ISeriesApi<any> | null>(null);
  const [chartType, setChartType] = useState<ChartType>('area');
  const [timeRange, setTimeRange] = useState<string>('1Y');

  // Filter data by time range
  const filteredData = useMemo(() => {
    if (!data) return [];
    const now = new Date();
    let daysToShow = 365;
    switch (timeRange) {
      case '1W': daysToShow = 7; break;
      case '1M': daysToShow = 30; break;
      case '3M': daysToShow = 90; break;
      case '6M': daysToShow = 180; break;
      case '1Y': daysToShow = 365; break;
      case '5Y': daysToShow = 1825; break;
    }
    const cutoffDate = new Date(now.getTime() - daysToShow * 24 * 60 * 60 * 1000);
    return data.filter(d => new Date(d.date) >= cutoffDate);
  }, [data, timeRange]);

  // Compute price change from filtered data (reflects current time range)
  const priceStats = useMemo(() => {
    if (!filteredData || filteredData.length < 2) return null;
    const latest = filteredData[filteredData.length - 1];
    const first = filteredData[0];
    const change = latest.close - first.close;
    const changePercent = (change / first.close) * 100;
    const isPositive = change >= 0;
    return {
      latestPrice: latest.close,
      change,
      changePercent,
      isPositive,
      high: Math.max(...filteredData.map(d => d.high)),
      low: Math.min(...filteredData.map(d => d.low)),
    };
  }, [filteredData]);

  // Initialize chart (must run before data effect so chartRef.current is set)
  useEffect(() => {
    if (!chartContainerRef.current) return;

    const chart = createChart(chartContainerRef.current, {
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
        vertLine: {
          color: '#10b981',
          width: 1,
          style: 2,
          labelBackgroundColor: '#10b981',
        },
        horzLine: {
          color: '#10b981',
          width: 1,
          style: 2,
          labelBackgroundColor: '#10b981',
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
      seriesRef.current = null;
      if (chartRef.current) {
        chartRef.current.remove();
        chartRef.current = null;
      }
    };
  }, [height]);

  // Update chart when data or type changes
  useEffect(() => {
    if (!filteredData || filteredData.length === 0 || !chartRef.current) return;

    // Remove old series
    if (seriesRef.current) {
      chartRef.current.removeSeries(seriesRef.current);
      seriesRef.current = null;
    }

    const isPositive = priceStats?.isPositive ?? true;
    const lineColor = isPositive ? '#10b981' : '#ef4444';
    const topColor = isPositive ? 'rgba(16, 185, 129, 0.3)' : 'rgba(239, 68, 68, 0.3)';
    const bottomColor = isPositive ? 'rgba(16, 185, 129, 0.0)' : 'rgba(239, 68, 68, 0.0)';

    if (chartType === 'candle') {
      const series = chartRef.current.addSeries(CandlestickSeries, {
        upColor: '#10b981',
        downColor: '#ef4444',
        borderUpColor: '#10b981',
        borderDownColor: '#ef4444',
        wickUpColor: '#10b981',
        wickDownColor: '#ef4444',
      });

      const candleData = filteredData.map(d => ({
        time: d.date as Time,
        open: d.open,
        high: d.high,
        low: d.low,
        close: d.close,
      }));

      series.setData(candleData);
      seriesRef.current = series;
    } else {
      const series = chartRef.current.addSeries(AreaSeries, {
        lineColor,
        topColor,
        bottomColor,
        lineWidth: 2,
        priceFormat: {
          type: 'price',
          precision: 2,
          minMove: 0.01,
        },
      });

      const areaData = filteredData.map(d => ({
        time: d.date as Time,
        value: d.close,
      }));

      series.setData(areaData);
      seriesRef.current = series;
    }

    chartRef.current.timeScale().fitContent();
  }, [filteredData, chartType, priceStats?.isPositive]);

  const timeRanges = ['1W', '1M', '3M', '6M', '1Y', '5Y'];

  return (
    <div className="v2-card overflow-hidden">
      {/* Header */}
      <div className="px-4 py-3 border-b border-border/10 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <div className="w-1 h-5 bg-primary rounded-full" />
            <h3 className="text-sm font-medium text-foreground">股价走势</h3>
          </div>
          {priceStats && (
            <span className={`text-sm font-data ${priceStats.isPositive ? 'text-emerald-400' : 'text-red-400'}`}>
              {priceStats.isPositive ? '+' : ''}{priceStats.changePercent.toFixed(2)}%
              <span className="text-muted-foreground/60 ml-1">({timeRange})</span>
            </span>
          )}
        </div>

        <div className="flex items-center gap-2">
          {/* Time Range Selector */}
          <div className="flex items-center bg-card rounded-lg border border-border/50 p-0.5">
            {timeRanges.map((range) => (
              <button
                key={range}
                onClick={() => setTimeRange(range)}
                className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors ${
                  timeRange === range
                    ? 'bg-primary/20 text-primary'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                {range}
              </button>
            ))}
          </div>

          {/* Chart Type Toggle */}
          <div className="flex items-center bg-card rounded-lg border border-border/50 p-0.5">
            <button
              onClick={() => setChartType('area')}
              className={`p-1.5 rounded-md transition-colors ${
                chartType === 'area' ? 'bg-primary/20 text-primary' : 'text-muted-foreground hover:text-foreground'
              }`}
              title="面积图"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 12l3-3 3 3 4-4M8 21l4-4 4 4M3 4h18M4 4h16v12a1 1 0 01-1 1H5a1 1 0 01-1-1V4z" />
              </svg>
            </button>
            <button
              onClick={() => setChartType('candle')}
              className={`p-1.5 rounded-md transition-colors ${
                chartType === 'candle' ? 'bg-primary/20 text-primary' : 'text-muted-foreground hover:text-foreground'
              }`}
              title="K 线图"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
              </svg>
            </button>
          </div>
        </div>
      </div>

      {/* Chart */}
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
