import { describe, expect, it, vi } from 'vitest';
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
    expect(html.match(/<li>/g)).toBeNull(); // No fabricated event bullets when sources are absent.
  });
});

vi.mock('@/lib/seo-data',()=>({seoData:vi.fn(async()=>null)}));
import { KolPublicProfile } from '@/components/KolPublicProfile';
it.each(['serenity', 'qinbafrank'] as const)('public %s has substantive visible Chinese content', async (slug) => {
  const html = renderToStaticMarkup(await KolPublicProfile({slug}));
  const text = html.replace(/<script[\s\S]*?<\/script>/g, '').replace(/<[^>]*>/g, '');
  expect((text.match(/[\u4e00-\u9fff]/g) || []).length).toBeGreaterThanOrEqual(800);
  expect(text).not.toMatch(/必涨|推荐买入|稳赚|保证收益|喊单/);
  expect(html).toContain('ProfilePage');
});

it('renders PageShell content exactly once in server HTML', async () => {
  const { PageShell } = await import('@/components/PageShell');
  const html = renderToStaticMarkup(<PageShell><h1>Unique SEO heading</h1></PageShell>);
  expect(html.match(/Unique SEO heading/g)).toHaveLength(1);
});
