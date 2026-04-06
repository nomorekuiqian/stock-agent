'use client';

import { useEffect, useRef, memo } from 'react';

interface TradingViewWidgetProps {
  symbol: string;
  title?: string;
  height?: number;
  interval?: string;
  range?: string;
  theme?: 'light' | 'dark';
  showToolbar?: boolean;
  style?: '1' | '2'; // '1' = candlestick, '2' = line
  studies?: string[];  // TradingView study IDs to preload
  hideVolume?: boolean;
}

function TradingViewWidgetComponent({
  symbol,
  title,
  height = 300,
  interval = 'W',
  range,
  theme = 'dark',
  showToolbar = false,
  style = '2',
  studies,
  hideVolume = true,
}: TradingViewWidgetProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    let mounted = true;

    // Clear previous widget
    container.innerHTML = '';

    // Create widget container — TradingView script looks for this child
    const widgetContainer = document.createElement('div');
    widgetContainer.className = 'tradingview-widget-container__widget';
    widgetContainer.style.height = `${height}px`;
    widgetContainer.style.width = '100%';
    container.appendChild(widgetContainer);

    // Create script
    const script = document.createElement('script');
    script.src = 'https://s3.tradingview.com/external-embedding/embed-widget-advanced-chart.js';
    script.type = 'text/javascript';
    script.async = true;
    const config: Record<string, unknown> = {
      autosize: false,
      width: '100%',
      height: height,
      symbol: symbol,
      interval: interval,
      timezone: 'America/New_York',
      theme: theme,
      style: style,
      locale: 'en',
      hide_top_toolbar: !showToolbar,
      hide_legend: false,
      save_image: false,
      hide_volume: hideVolume,
      support_host: 'https://www.tradingview.com',
    };
    if (range) {
      config.range = range;
    }
    if (studies && studies.length > 0) {
      config.studies = studies;
    }
    script.innerHTML = JSON.stringify(config);

    // Only append if still mounted (guard against strict mode double-invoke)
    if (mounted) {
      container.appendChild(script);
    }

    return () => {
      mounted = false;
      // Remove script first to prevent it from running querySelector on removed DOM
      if (script.parentNode) {
        script.parentNode.removeChild(script);
      }
      // Then clear the rest
      if (container) {
        container.innerHTML = '';
      }
    };
  }, [symbol, height, interval, range, theme, showToolbar, style, studies, hideVolume]);

  return (
    <div className="bg-card rounded-xl border border-border overflow-hidden">
      {title && (
        <div className="px-4 py-3 border-b border-border flex items-center justify-between">
          <h3 className="text-sm font-medium text-foreground">{title}</h3>
          <span className="text-xs text-muted-foreground font-mono">{symbol}</span>
        </div>
      )}
      <div
        ref={containerRef}
        className="tradingview-widget-container"
        style={{ height: `${height}px` }}
      />
    </div>
  );
}

export const TradingViewWidget = memo(TradingViewWidgetComponent);
