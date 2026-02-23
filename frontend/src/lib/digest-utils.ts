import { DigestResponse } from './api';
import { UserDigest } from './insforge';

/**
 * Convert a UserDigest (database record) to DigestResponse (display format).
 */
export function userDigestToResponse(item: UserDigest): DigestResponse {
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
