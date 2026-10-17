import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { reportPath, reportSlugDate, reportTitle } from '@/lib/report-url';
import { relatedStocks } from '@/lib/stock-directory';
import { StockLinkedText } from '@/components/StockLinkedText';
import { MarketSummary } from '@/components/MarketSummary';
import type { MorningReport } from '@/lib/api';
describe('SEO content boundaries', () => {
  it('resolves valid date URLs and rejects impossible dates', () => {
    expect(reportPath('today', { id: 'old', report_date: '2026-10-16' })).toBe('/today/2026-10-16-market-report');
    expect(reportSlugDate('today', '2026-02-30-market-report')).toBeNull();
    expect(reportSlugDate('morning', '2026-10-16-market-report')).toBeNull();
    expect(reportTitle('today', { title: '科技股回调', report_date: '2026-10-16' })).toContain('美股全市场日报｜2026-10-16');
  });
  it('links known stock codes without turning AI prose or unknown tickers into links', () => {
    const html = renderToStaticMarkup(<StockLinkedText text="AI 基建，NVDA 与 $ARM，(C)，UNKNOWN" />);
    expect(html).toContain('href="/stock/NVDA"');
    expect(html).toContain('href="/stock/ARM"');
    expect(html).toContain('href="/stock/C"');
    expect(html).not.toContain('/stock/AI');
    expect(html).not.toContain('/stock/UNKNOWN');
  });
  it('excludes self and unrelated fallback peers', () => {
    expect(relatedStocks('NVDA')).not.toContain('NVDA');
    expect(relatedStocks('NVDA')).toContain('AMD');
    expect(relatedStocks('UNKNOWN')).toEqual([]);
    expect(relatedStocks('NVDA').length).toBeLessThanOrEqual(10);
  });
  it('public morning summary never reads paid narrative and never fabricates missing rates', () => {
    const morning = { report_date: '2026-10-16', timestamp: '2026-10-16T13:00:00Z', futures: [{ name: 'S&P', value: 6000, daily_change: -1 }], global_markets: { other: [] }, summary: [{ content: 'SECRET' }], market_pulse: 'SECRET', is_locked: true } as unknown as MorningReport;
    const html = renderToStaticMarkup(<MarketSummary morning={morning} />);
    expect(html).not.toContain('SECRET');
    expect(html).toContain('本期未提供');
    expect(html).toContain('-1.00%');
    expect(html.match(/<li>/g)).toHaveLength(3);
  });
});
