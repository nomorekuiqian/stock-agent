const RECENT_STOCKS_KEY = 'marketbrew_recent_stocks';
const MAX_RECENT = 6;

export interface RecentStock {
  symbol: string;
  name: string;
  viewedAt: number;
}

export function getRecentStocks(): RecentStock[] {
  if (typeof window === 'undefined') return [];
  try {
    const stored = localStorage.getItem(RECENT_STOCKS_KEY);
    return stored ? JSON.parse(stored) : [];
  } catch {
    return [];
  }
}

export function addRecentStock(symbol: string, name: string): void {
  if (typeof window === 'undefined') return;
  try {
    const recent = getRecentStocks().filter(s => s.symbol !== symbol);
    recent.unshift({ symbol, name, viewedAt: Date.now() });
    localStorage.setItem(RECENT_STOCKS_KEY, JSON.stringify(recent.slice(0, MAX_RECENT)));
  } catch {
    // Ignore localStorage errors
  }
}
