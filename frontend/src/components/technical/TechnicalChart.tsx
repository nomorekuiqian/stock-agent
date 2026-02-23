'use client';

import { useEffect, useState, useSyncExternalStore } from 'react';
import { TradingViewWidget } from '@/components/TradingViewWidget';

interface TechnicalChartProps {
  symbol: string;
  interval?: 'D' | 'W';
}

// Embed widget studies: each adds an indicator pane or overlay.
// MASimple = SMA overlay (default period 9; user can adjust via chart Settings).
// Users can add more indicators (e.g. extra SMAs with different periods)
// via the Indicators button in the chart toolbar.
const TECHNICAL_STUDIES = [
  'MASimple@tv-basicstudies',
  'MACD@tv-basicstudies',
  'RSI@tv-basicstudies',
];

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

function useIsMobile() {
  const [isMobile, setIsMobile] = useState(false);
  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 640);
    check();
    window.addEventListener('resize', check);
    return () => window.removeEventListener('resize', check);
  }, []);
  return isMobile;
}

export function TechnicalChart({ symbol, interval = 'D' }: TechnicalChartProps) {
  const theme = useSyncExternalStore(subscribeTheme, getThemeSnapshot, getServerTheme);
  const isMobile = useIsMobile();

  return (
    <TradingViewWidget
      symbol={symbol}
      height={isMobile ? 460 : 600}
      interval={interval}
      theme={theme}
      style="1"
      showToolbar={true}
      studies={TECHNICAL_STUDIES}
      hideVolume={false}
    />
  );
}
