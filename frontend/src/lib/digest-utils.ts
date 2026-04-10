import { DigestResponse, StockAnalysis, UserDigestItem } from './api';

/**
 * Convert a UserDigestItem (database record) to DigestResponse (display format).
 */
export function userDigestToResponse(item: UserDigestItem): DigestResponse {
  const digestData = item.digest_data || {};
  return {
    success: true,
    timestamp: item.created_at || '',
    symbols_used: item.symbols,
    greeting: item.greeting || '',
    one_line_summary: item.one_line_summary || '',
    stocks: digestData.stocks || [],
    news: digestData.news || { headlines: [], briefs: [] },
    events: digestData.events || [],
    summary: digestData.summary || {
      content: item.bottom_line || item.analysis || '',
    },
  };
}

/**
 * Parse percentage string like "+2.35%" or "-4.2%" to number.
 */
export function parseChangePercent(change: string | undefined | null): number {
  if (!change) return 0;
  return parseFloat(change.replace('%', '').replace('+', '')) || 0;
}

/**
 * Sort stocks by absolute daily change (highest volatility first).
 */
export function sortByVolatility(stocks: StockAnalysis[]): StockAnalysis[] {
  return [...stocks].sort(
    (a, b) =>
      Math.abs(parseChangePercent(b.daily_change)) -
      Math.abs(parseChangePercent(a.daily_change))
  );
}

/**
 * Whether a stock's daily move is notable (>=3%).
 */
export function isNotableMove(change: string | undefined | null): boolean {
  return Math.abs(parseChangePercent(change)) >= 3;
}

/**
 * Get status color classes based on stock status text.
 */
export function getStatusColor(status: string): string {
  if (status.includes('up') || status.includes('strong') || status.includes('rise')) {
    return 'text-emerald-400 bg-emerald-500/10';
  } else if (status.includes('down') || status.includes('weak') || status.includes('fall')) {
    return 'text-red-400 bg-red-500/10';
  }
  return 'text-muted-foreground bg-card';
}
