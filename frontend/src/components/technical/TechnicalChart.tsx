'use client';

import { useEffect, useRef, useState, useMemo, useCallback, useSyncExternalStore } from 'react';
import {
  createChart,
  createSeriesMarkers,
  createTextWatermark,
  CandlestickSeries,
  LineSeries,
  HistogramSeries,
  ColorType,
  CrosshairMode,
  LineStyle,
} from 'lightweight-charts';
import type {
  IChartApi,
  Time,
  SeriesMarker,
} from 'lightweight-charts';
import type { TechnicalData, ChartAnnotation } from '@/hooks/queries/use-technical-data';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';

// ---------------------------------------------------------------------------
// Theme detection (mirrors existing pattern in this file)
// ---------------------------------------------------------------------------

function getThemeSnapshot(): 'light' | 'dark' {
  return document.documentElement.classList.contains('light') ? 'light' : 'dark';
}

function getServerTheme(): 'light' | 'dark' {
  return 'dark';
}

function subscribeTheme(callback: () => void) {
  const observer = new MutationObserver(callback);
  observer.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ['class'],
  });
  return () => observer.disconnect();
}

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface TechnicalChartProps {
  data: TechnicalData;
  annotations?: ChartAnnotation[];
  height?: number;
}

// ---------------------------------------------------------------------------
// Indicator toggle state
// ---------------------------------------------------------------------------

interface IndicatorVisibility {
  sma20: boolean;
  sma50: boolean;
  sma200: boolean;
  bb: boolean;
  volume: boolean;
  adx: boolean;
}

const INDICATOR_DEFAULTS: IndicatorVisibility = {
  sma20: true,
  sma50: true,
  sma200: false,
  bb: false,
  volume: true,
  adx: false,
};

// ---------------------------------------------------------------------------
// Toggle pill button
// ---------------------------------------------------------------------------

function TogglePill({
  label,
  active,
  color,
  onClick,
}: {
  label: string;
  active: boolean;
  color: string;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`
        inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium transition-all cursor-pointer
        focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:outline-none
        ${active
          ? 'bg-card border border-border/50 text-foreground'
          : 'text-muted-foreground hover:text-foreground/70 border border-transparent'
        }
      `}
    >
      <span
        className="inline-block w-2 h-2 rounded-full shrink-0"
        style={{ backgroundColor: active ? color : 'transparent', border: active ? 'none' : `1.5px solid ${color}` }}
      />
      {label}
    </button>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function TechnicalChart({ data, annotations, height = 600 }: TechnicalChartProps) {
  const theme = useSyncExternalStore(subscribeTheme, getThemeSnapshot, getServerTheme);
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const [indicators, setIndicators] = useState<IndicatorVisibility>(INDICATOR_DEFAULTS);

  // Memoize OHLCV data transformation
  const ohlcvData = useMemo(() => {
    if (!data?.ohlcv?.length) return [];
    return data.ohlcv.map(d => ({
      time: d.date as Time,
      open: d.open,
      high: d.high,
      low: d.low,
      close: d.close,
      volume: d.volume,
    }));
  }, [data]);

  // Memoize indicator data
  const indicatorData = useMemo(() => {
    if (!data?.indicators) return null;
    const ind = data.indicators;
    return {
      sma20: ind.sma_20?.map(d => ({ time: d.date as Time, value: d.value })) ?? [],
      sma50: ind.sma_50?.map(d => ({ time: d.date as Time, value: d.value })) ?? [],
      sma200: ind.sma_200?.map(d => ({ time: d.date as Time, value: d.value })) ?? [],
      bbUpper: ind.bb?.map(d => ({ time: d.date as Time, value: d.upper })) ?? [],
      bbMiddle: ind.bb?.map(d => ({ time: d.date as Time, value: d.middle })) ?? [],
      bbLower: ind.bb?.map(d => ({ time: d.date as Time, value: d.lower })) ?? [],
      rsi: ind.rsi_14?.map(d => ({ time: d.date as Time, value: d.value })) ?? [],
      macdLine: ind.macd?.map(d => ({ time: d.date as Time, value: d.macd })) ?? [],
      macdSignal: ind.macd?.map(d => ({ time: d.date as Time, value: d.signal })) ?? [],
      macdHist: ind.macd?.map(d => ({
        time: d.date as Time,
        value: d.histogram,
        color: d.histogram >= 0 ? 'rgba(16,185,129,0.6)' : 'rgba(239,68,68,0.6)',
      })) ?? [],
      adx: ind.adx_14?.map(d => ({ time: d.date as Time, value: d.value })) ?? [],
    };
  }, [data]);

  // Build annotation markers
  const signalMarkers = useMemo(() => {
    if (!annotations?.length) return [];
    return annotations
      .filter(a => a.type === 'signal' && a.date)
      .map<SeriesMarker<Time>>(a => ({
        time: a.date as unknown as Time,
        position: a.direction === 'bullish' ? 'belowBar' : 'aboveBar',
        shape: a.direction === 'bullish' ? 'arrowUp' : 'arrowDown',
        color: a.direction === 'bullish' ? '#10b981' : '#ef4444',
        text: a.label,
      }));
  }, [annotations]);

  // AI-provided support/resistance annotations (take priority over backend swing points)
  const aiSRLevels = useMemo(() => {
    if (!annotations?.length) return [];
    return annotations.filter(
      a => (a.type === 'support' || a.type === 'resistance') && typeof a.price === 'number'
    );
  }, [annotations]);

  const srSource: 'ai' | 'swing' = aiSRLevels.length > 0 ? 'ai' : 'swing';

  const toggle = useCallback((key: keyof IndicatorVisibility) => {
    setIndicators(prev => ({ ...prev, [key]: !prev[key] }));
  }, []);

  // -----------------------------------------------------------------------
  // Chart creation & data rendering
  // -----------------------------------------------------------------------

  useEffect(() => {
    if (!containerRef.current || !ohlcvData.length) return;

    const isLight = theme === 'light';
    const textColor = isLight ? '#374151' : '#9ca3af';
    const gridColor = isLight ? '#f3f4f6' : '#1f2937';

    // Heights: main 60%, RSI 20%, MACD 20%
    const mainHeight = Math.round(height * 0.6);
    const subHeight = Math.round(height * 0.2);

    // ---- Main chart (candlestick + overlays + volume) ----

    const chart = createChart(containerRef.current, {
      layout: {
        background: { type: ColorType.Solid, color: 'transparent' },
        textColor,
        fontSize: 11,
      },
      grid: {
        vertLines: { color: gridColor },
        horzLines: { color: gridColor },
      },
      crosshair: {
        mode: CrosshairMode.Normal,
        vertLine: {
          color: isLight ? '#d1d5db' : '#374151',
          width: 1,
          style: LineStyle.Dotted,
          labelBackgroundColor: isLight ? '#374151' : '#6b7280',
        },
        horzLine: {
          color: isLight ? '#d1d5db' : '#374151',
          width: 1,
          style: LineStyle.Dotted,
          labelBackgroundColor: isLight ? '#374151' : '#6b7280',
        },
      },
      rightPriceScale: {
        borderVisible: false,
      },
      timeScale: {
        borderVisible: false,
        timeVisible: false,
      },
      handleScroll: {
        vertTouchDrag: false,
      },
      width: containerRef.current.clientWidth,
      height: mainHeight,
    });

    chartRef.current = chart;

    // -- Candlestick --
    const candleSeries = chart.addSeries(CandlestickSeries, {
      upColor: '#10b981',
      downColor: '#ef4444',
      borderVisible: false,
      wickUpColor: '#10b981',
      wickDownColor: '#ef4444',
    });
    candleSeries.setData(ohlcvData.map(d => ({
      time: d.time,
      open: d.open,
      high: d.high,
      low: d.low,
      close: d.close,
    })));

    // -- Volume (main pane bottom overlay) --
    if (indicators.volume) {
      const volumeSeries = chart.addSeries(HistogramSeries, {
        color: '#6b7280',
        priceFormat: { type: 'volume' },
        priceScaleId: 'volume',
        lastValueVisible: false,
        priceLineVisible: false,
      });
      volumeSeries.priceScale().applyOptions({
        scaleMargins: { top: 0.8, bottom: 0 },
      });
      volumeSeries.setData(ohlcvData.map(d => ({
        time: d.time,
        value: d.volume,
        color: d.close >= d.open ? 'rgba(16,185,129,0.3)' : 'rgba(239,68,68,0.3)',
      })));
    }

    // -- SMA overlays --
    if (indicators.sma20 && indicatorData?.sma20.length) {
      const sma20Series = chart.addSeries(LineSeries, {
        color: '#f59e0b',
        lineWidth: 1,
        priceLineVisible: false,
        lastValueVisible: false,
      });
      sma20Series.setData(indicatorData.sma20);
    }

    if (indicators.sma50 && indicatorData?.sma50.length) {
      const sma50Series = chart.addSeries(LineSeries, {
        color: '#3b82f6',
        lineWidth: 1,
        priceLineVisible: false,
        lastValueVisible: false,
      });
      sma50Series.setData(indicatorData.sma50);
    }

    if (indicators.sma200 && indicatorData?.sma200.length) {
      const sma200Series = chart.addSeries(LineSeries, {
        color: '#a855f7',
        lineWidth: 1,
        priceLineVisible: false,
        lastValueVisible: false,
      });
      sma200Series.setData(indicatorData.sma200);
    }

    // -- Bollinger Bands (upper/lower solid 2px, middle dotted subtle) --
    if (indicators.bb && indicatorData) {
      const bbCommon = {
        priceLineVisible: false,
        lastValueVisible: false,
        crosshairMarkerVisible: false,
      };

      if (indicatorData.bbUpper.length) {
        const bbUpperSeries = chart.addSeries(LineSeries, {
          ...bbCommon,
          color: 'rgba(168,85,247,0.85)',
          lineWidth: 2,
          lineStyle: LineStyle.Solid,
        });
        bbUpperSeries.setData(indicatorData.bbUpper);
      }

      if (indicatorData.bbMiddle.length) {
        const bbMiddleSeries = chart.addSeries(LineSeries, {
          ...bbCommon,
          color: 'rgba(168,85,247,0.35)',
          lineWidth: 1,
          lineStyle: LineStyle.Dotted,
        });
        bbMiddleSeries.setData(indicatorData.bbMiddle);
      }

      if (indicatorData.bbLower.length) {
        const bbLowerSeries = chart.addSeries(LineSeries, {
          ...bbCommon,
          color: 'rgba(168,85,247,0.85)',
          lineWidth: 2,
          lineStyle: LineStyle.Solid,
        });
        bbLowerSeries.setData(indicatorData.bbLower);
      }
    }

    // -- Support / Resistance price lines (solid, labeled S1/S2/.. and R1/R2/..) --
    // Prefer AI-provided annotations when available; otherwise fall back to
    // backend swing-point levels. Labels are always positional (S1/R1 = nearest).
    if (aiSRLevels.length > 0) {
      // Sort so nearest-to-current-price gets S1/R1
      const supports = aiSRLevels
        .filter(a => a.type === 'support' && typeof a.price === 'number')
        .sort((a, b) => (b.price as number) - (a.price as number)); // highest support first = nearest below current
      const resistances = aiSRLevels
        .filter(a => a.type === 'resistance' && typeof a.price === 'number')
        .sort((a, b) => (a.price as number) - (b.price as number)); // lowest resistance first = nearest above current

      supports.forEach((a, i) => {
        candleSeries.createPriceLine({
          price: a.price as number,
          color: i === 0 ? '#10b981' : 'rgba(16,185,129,0.55)',
          lineWidth: 1,
          lineStyle: LineStyle.Solid,
          axisLabelVisible: true,
          title: `S${i + 1}`,
        });
      });
      resistances.forEach((a, i) => {
        candleSeries.createPriceLine({
          price: a.price as number,
          color: i === 0 ? '#ef4444' : 'rgba(239,68,68,0.55)',
          lineWidth: 1,
          lineStyle: LineStyle.Solid,
          axisLabelVisible: true,
          title: `R${i + 1}`,
        });
      });
    } else {
      const sr = data.support_resistance;
      if (sr?.support_1 != null) {
        candleSeries.createPriceLine({
          price: sr.support_1,
          color: '#10b981',
          lineWidth: 1,
          lineStyle: LineStyle.Solid,
          axisLabelVisible: true,
          title: 'S1',
        });
      }
      if (sr?.support_2 != null) {
        candleSeries.createPriceLine({
          price: sr.support_2,
          color: 'rgba(16,185,129,0.55)',
          lineWidth: 1,
          lineStyle: LineStyle.Solid,
          axisLabelVisible: true,
          title: 'S2',
        });
      }
      if (sr?.resistance_1 != null) {
        candleSeries.createPriceLine({
          price: sr.resistance_1,
          color: '#ef4444',
          lineWidth: 1,
          lineStyle: LineStyle.Solid,
          axisLabelVisible: true,
          title: 'R1',
        });
      }
      if (sr?.resistance_2 != null) {
        candleSeries.createPriceLine({
          price: sr.resistance_2,
          color: 'rgba(239,68,68,0.55)',
          lineWidth: 1,
          lineStyle: LineStyle.Solid,
          axisLabelVisible: true,
          title: 'R2',
        });
      }
    }

    // -- Signal markers via createSeriesMarkers (v5 API) --
    if (signalMarkers.length) {
      createSeriesMarkers(candleSeries, signalMarkers);
    }

    // ---- RSI sub-pane (paneIndex 1) ----
    if (indicatorData?.rsi.length) {
      const rsiSeries = chart.addSeries(LineSeries, {
        color: '#f59e0b',
        lineWidth: 1,
        priceLineVisible: false,
        lastValueVisible: true,
        priceFormat: { type: 'price', precision: 1, minMove: 0.1 },
      }, 1);

      rsiSeries.setData(indicatorData.rsi);

      // Overbought / oversold reference lines
      rsiSeries.createPriceLine({
        price: 70,
        color: 'rgba(239,68,68,0.4)',
        lineWidth: 1,
        lineStyle: LineStyle.Dotted,
        axisLabelVisible: false,
        title: '',
      });
      rsiSeries.createPriceLine({
        price: 30,
        color: 'rgba(16,185,129,0.4)',
        lineWidth: 1,
        lineStyle: LineStyle.Dotted,
        axisLabelVisible: false,
        title: '',
      });
      rsiSeries.createPriceLine({
        price: 50,
        color: gridColor,
        lineWidth: 1,
        lineStyle: LineStyle.Dotted,
        axisLabelVisible: false,
        title: '',
      });

      // Set RSI pane scale margins & size
      rsiSeries.priceScale().applyOptions({
        scaleMargins: { top: 0.05, bottom: 0.05 },
        autoScale: true,
      });

      // Pane label (top-left watermark)
      const rsiPane = chart.panes()[1];
      if (rsiPane) {
        createTextWatermark(rsiPane, {
          horzAlign: 'left',
          vertAlign: 'top',
          lines: [{
            text: 'RSI(14)',
            color: isLight ? 'rgba(75,85,99,0.70)' : 'rgba(156,163,175,0.75)',
            fontSize: 11,
            fontFamily: 'inherit',
          }],
        });
      }
    }

    // ---- MACD sub-pane (paneIndex 2) ----
    if (indicatorData?.macdHist.length) {
      // Histogram
      const macdHistSeries = chart.addSeries(HistogramSeries, {
        priceLineVisible: false,
        lastValueVisible: false,
        priceFormat: { type: 'price', precision: 2, minMove: 0.01 },
      }, 2);
      macdHistSeries.setData(indicatorData.macdHist);

      // MACD line
      if (indicatorData.macdLine.length) {
        const macdLineSeries = chart.addSeries(LineSeries, {
          color: '#3b82f6',
          lineWidth: 1,
          priceLineVisible: false,
          lastValueVisible: false,
          priceFormat: { type: 'price', precision: 2, minMove: 0.01 },
        }, 2);
        macdLineSeries.setData(indicatorData.macdLine);
      }

      // Signal line
      if (indicatorData.macdSignal.length) {
        const macdSignalSeries = chart.addSeries(LineSeries, {
          color: '#f59e0b',
          lineWidth: 1,
          priceLineVisible: false,
          lastValueVisible: false,
          priceFormat: { type: 'price', precision: 2, minMove: 0.01 },
        }, 2);
        macdSignalSeries.setData(indicatorData.macdSignal);
      }

      macdHistSeries.priceScale().applyOptions({
        scaleMargins: { top: 0.05, bottom: 0.05 },
        autoScale: true,
      });

      // Pane label (top-left watermark)
      const macdPane = chart.panes()[2];
      if (macdPane) {
        createTextWatermark(macdPane, {
          horzAlign: 'left',
          vertAlign: 'top',
          lines: [{
            text: 'MACD(12,26,9)',
            color: isLight ? 'rgba(75,85,99,0.70)' : 'rgba(156,163,175,0.75)',
            fontSize: 11,
            fontFamily: 'inherit',
          }],
        });
      }
    }

    // ---- ADX sub-pane (paneIndex 3, only when toggled) ----
    if (indicators.adx && indicatorData?.adx.length) {
      const adxSeries = chart.addSeries(LineSeries, {
        color: '#8b5cf6',
        lineWidth: 2,
        priceLineVisible: false,
        lastValueVisible: true,
        priceFormat: { type: 'price', precision: 1, minMove: 0.1 },
      }, 3);
      adxSeries.setData(indicatorData.adx);

      // ADX reference lines: 20 (weak trend), 25 (strong trend)
      adxSeries.createPriceLine({
        price: 25,
        color: 'rgba(139,92,246,0.35)',
        lineWidth: 1,
        lineStyle: LineStyle.Dotted,
        axisLabelVisible: false,
        title: '',
      });
      adxSeries.createPriceLine({
        price: 20,
        color: gridColor,
        lineWidth: 1,
        lineStyle: LineStyle.Dotted,
        axisLabelVisible: false,
        title: '',
      });

      adxSeries.priceScale().applyOptions({
        scaleMargins: { top: 0.05, bottom: 0.05 },
        autoScale: true,
      });

      // Pane label (top-left watermark)
      const adxPane = chart.panes()[3];
      if (adxPane) {
        createTextWatermark(adxPane, {
          horzAlign: 'left',
          vertAlign: 'top',
          lines: [{
            text: 'ADX(14)',
            color: isLight ? 'rgba(75,85,99,0.70)' : 'rgba(156,163,175,0.75)',
            fontSize: 11,
            fontFamily: 'inherit',
          }],
        });
      }
    }

    // ---- Resize panes ----
    // Pane 0 = main (candlestick), pane 1 = RSI, pane 2 = MACD, pane 3 = ADX
    try {
      const hasRSI = (indicatorData?.rsi.length ?? 0) > 0;
      const hasMACD = (indicatorData?.macdHist.length ?? 0) > 0;
      const hasADX = indicators.adx && (indicatorData?.adx.length ?? 0) > 0;
      const totalPanes = 1 + (hasRSI ? 1 : 0) + (hasMACD ? 1 : 0) + (hasADX ? 1 : 0);

      if (totalPanes > 1) {
        const totalHeight = mainHeight
          + (hasRSI ? subHeight : 0)
          + (hasMACD ? subHeight : 0)
          + (hasADX ? subHeight : 0);
        chart.applyOptions({ height: totalHeight });
      }
    } catch {
      // pane resizing is best-effort
    }

    chart.timeScale().fitContent();

    // ---- ResizeObserver ----
    const resizeObserver = new ResizeObserver(entries => {
      for (const entry of entries) {
        if (entry.contentBoxSize) {
          const width = entry.contentBoxSize[0]?.inlineSize ?? entry.contentRect.width;
          chart.applyOptions({ width });
        }
      }
    });
    resizeObserver.observe(containerRef.current);

    // ---- Cleanup ----
    return () => {
      resizeObserver.disconnect();
      chart.remove();
      chartRef.current = null;
    };
  }, [data, ohlcvData, indicatorData, signalMarkers, aiSRLevels, indicators, theme, height]);

  // -----------------------------------------------------------------------
  // Render
  // -----------------------------------------------------------------------

  const hasData = ohlcvData.length > 0;

  // Compute total height for container: main + sub-panes (RSI / MACD / ADX)
  const totalHeight = useMemo(() => {
    const mainH = Math.round(height * 0.6);
    const subH = Math.round(height * 0.2);
    const hasRSI = (indicatorData?.rsi.length ?? 0) > 0;
    const hasMACD = (indicatorData?.macdHist.length ?? 0) > 0;
    const hasADX = indicators.adx && (indicatorData?.adx.length ?? 0) > 0;
    const paneCount = 1 + (hasRSI ? 1 : 0) + (hasMACD ? 1 : 0) + (hasADX ? 1 : 0);
    return paneCount > 1
      ? mainH + (hasRSI ? subH : 0) + (hasMACD ? subH : 0) + (hasADX ? subH : 0)
      : mainH;
  }, [height, indicatorData, indicators.adx]);

  return (
    <div className="bg-card/50 border border-border/30 rounded-xl overflow-hidden">
      {/* Toolbar */}
      <div className="px-4 py-2.5 border-b border-border/20 bg-card/40 flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-1.5">
          <div className="w-1 h-4 bg-primary rounded-full" />
          <span className="text-sm font-medium text-foreground">K 线图</span>
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                aria-label="支撑阻力位说明"
                className="ml-1 inline-flex items-center justify-center w-6 h-6 rounded-full text-muted-foreground/70 hover:text-foreground hover:bg-muted/40 transition-colors cursor-help
                  focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:outline-none"
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-3.5 h-3.5">
                  <circle cx="12" cy="12" r="10" />
                  <line x1="12" y1="16" x2="12" y2="12" />
                  <line x1="12" y1="8" x2="12.01" y2="8" />
                </svg>
              </button>
            </TooltipTrigger>
            <TooltipContent side="bottom" className="max-w-[280px] text-xs leading-relaxed">
              <div className="space-y-1.5">
                <p className="font-medium">支撑 / 阻力位说明</p>
                <p>
                  绿色实线为支撑位（<b>S1</b> 距当前价最近，<b>S2</b> 次之），
                  红色实线为阻力位（<b>R1</b>、<b>R2</b> 同理）。
                </p>
                {srSource === 'ai' ? (
                  <p>
                    价位由左侧 <b>AI 技术分析</b>选出（综合均线、前高前低、心理关口等因素）。
                    每个价位的具体依据，详见左侧「详细总结 · 关键价位」段落。
                  </p>
                ) : (
                  <p>
                    当前使用 <b>摆动高低点</b>算法（10 日居中滚动窗口的局部极值）。
                    生成 AI 技术分析后，此处将改为显示 AI 选出的关键价位。
                  </p>
                )}
              </div>
            </TooltipContent>
          </Tooltip>
        </div>

        {/* Indicator toggles */}
        <div className="flex items-center gap-1 flex-wrap">
          <TogglePill label="SMA 20" active={indicators.sma20} color="#f59e0b" onClick={() => toggle('sma20')} />
          <TogglePill label="SMA 50" active={indicators.sma50} color="#3b82f6" onClick={() => toggle('sma50')} />
          <TogglePill label="SMA 200" active={indicators.sma200} color="#a855f7" onClick={() => toggle('sma200')} />
          <TogglePill label="BB" active={indicators.bb} color="#a855f7" onClick={() => toggle('bb')} />
          <TogglePill label="VOL" active={indicators.volume} color="#6b7280" onClick={() => toggle('volume')} />
          <TogglePill label="ADX" active={indicators.adx} color="#8b5cf6" onClick={() => toggle('adx')} />
        </div>
      </div>

      {/* Chart area */}
      <div className="relative" style={{ height: hasData ? totalHeight : height * 0.6 }}>
        {!hasData && (
          <div className="absolute inset-0 flex items-center justify-center bg-card/80 z-10">
            <p className="text-sm text-muted-foreground">
              暂无图表数据
            </p>
          </div>
        )}
        <div ref={containerRef} className="w-full h-full" />
      </div>

      {/* Legend row — color coding for lines that aren't self-explanatory */}
      {hasData && (
        <div className="px-4 py-2 border-t border-border/20 bg-card/30 flex items-center gap-4 text-xs text-muted-foreground/70">
          {(indicatorData?.macdHist.length ?? 0) > 0 && (
            <span className="font-data inline-flex items-center gap-1">
              <span className="inline-block w-2 h-0.5 rounded-full" style={{ backgroundColor: '#3b82f6' }} />
              <span>MACD</span>
              <span className="ml-2 inline-block w-2 h-0.5 rounded-full" style={{ backgroundColor: '#f59e0b' }} />
              <span>Signal</span>
            </span>
          )}
          {indicators.adx && (indicatorData?.adx.length ?? 0) > 0 && (
            <span className="font-data">ADX &gt; 25 强趋势 · &lt; 20 弱趋势</span>
          )}
        </div>
      )}
    </div>
  );
}
