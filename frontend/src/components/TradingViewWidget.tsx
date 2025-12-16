'use client';

import { useEffect, useRef, memo } from 'react';

interface TradingViewWidgetProps {
  symbol: string;
  title?: string;
  height?: number;
  interval?: string;
  theme?: 'light' | 'dark';
  showToolbar?: boolean;
}

function TradingViewWidgetComponent({
  symbol,
  title,
  height = 300,
  interval = 'W',
  theme = 'dark',
  showToolbar = false,
}: TradingViewWidgetProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const scriptRef = useRef<HTMLScriptElement | null>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    // Clear previous widget
    container.innerHTML = '';

    // Create widget container
    const widgetContainer = document.createElement('div');
    widgetContainer.className = 'tradingview-widget-container__widget';
    widgetContainer.style.height = `${height}px`;
    container.appendChild(widgetContainer);

    // Create script
    const script = document.createElement('script');
    script.src = 'https://s3.tradingview.com/external-embedding/embed-widget-advanced-chart.js';
    script.type = 'text/javascript';
    script.async = true;
    script.innerHTML = JSON.stringify({
      autosize: false,
      width: '100%',
      height: height,
      symbol: symbol,
      interval: interval,
      timezone: 'America/New_York',
      theme: theme,
      style: '2', // Line chart
      locale: 'en',
      hide_top_toolbar: !showToolbar,
      hide_legend: false,
      save_image: false,
      hide_volume: true,
      support_host: 'https://www.tradingview.com',
    });

    container.appendChild(script);
    scriptRef.current = script;

    return () => {
      container.innerHTML = '';
    };
  }, [symbol, height, interval, theme, showToolbar]);

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
