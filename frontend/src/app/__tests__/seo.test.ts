import { afterEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import middleware from '../../../middleware';
import { sitemapEntries, sitemapFiles, sitemapXml, SHARD_SIZE } from '@/lib/sitemaps';
import { GET as sitemapIndex } from '../sitemap.xml/route';
import robots from '../robots';
vi.mock('@/lib/seo-data',()=>({seoData:vi.fn(async()=>null)}));
import { seoData } from '@/lib/seo-data';
import { stockContent } from '@/lib/stock-seo-content';
import type { StockSeoData } from '@/lib/seo-data';
import { serializeJsonLd, SITE_URL } from '@/lib/seo';

afterEach(() => vi.unstubAllGlobals());

describe('crawler access and authentication boundary', () => {
  it.each(['/about', '/terms', '/privacy', '/contact'])('allows anonymous access to %s', async (path) => {
    const response = await middleware(new NextRequest(`${SITE_URL}${path}`));
    expect(response.status).toBe(200);
    expect(response.headers.get('location')).toBeNull();
  });
  it.each(['/robots.txt', '/sitemap.xml', '/sitemaps/static.xml', '/sitemaps/today-0.xml', '/llms.txt', '/sitemaps/kol-0.xml'])('allows anonymous %s without cookies or redirects', async (path) => {
    const response = await middleware(new NextRequest(`${SITE_URL}${path}`));
    expect(response.status).toBe(200);
    expect(response.headers.get('location')).toBeNull();
    expect(response.cookies.getAll()).toHaveLength(0);
  });
  it.each(['/admin', '/profile', '/settings', '/for-you', '/for-you/watchlist'])('keeps %s protected', async (path) => {
    const response = await middleware(new NextRequest(`${SITE_URL}${path}`));
    expect(response.status).toBe(307);
    expect(new URL(response.headers.get('location')!).pathname).toBe('/login');
  });
  it.each(['/research', '/research?agent=kol&persona=qinbafrank', '/today?utm_source=test', '/login', '/forgot-password', '/pricing/success', '/verify-email', '/admin'])('excludes utility %s from indexing', async (path) => {
    const response = await middleware(new NextRequest(`${SITE_URL}${path}`));
    expect(response.headers.get('X-Robots-Tag')).toBe('noindex, follow');
  });
  it('keeps public pricing indexable and protected session routing unchanged', async () => {
    expect((await middleware(new NextRequest(`${SITE_URL}/pricing`))).headers.get('X-Robots-Tag')).toBeNull();
    const response = await middleware(new NextRequest(`${SITE_URL}/profile`, { headers: { cookie: 'app_access_token=test' } }));
    expect(response.status).toBe(200);
    expect(response.headers.get('X-Robots-Tag')).toBe('noindex, follow');
  });
});

describe('sitemap', () => {
  it('includes full archives past the old 500 URL cap, with date URLs and API limits', async () => {
    const fetchMock = vi.fn(async (input: string) => {
      const url = new URL(input);
      if(url.pathname.includes('/date/'))return Response.json({data:{timestamp:'2026-10-16T20:00:00Z',intro:'真实公开正文。'.repeat(60)}});
      const limit = Number(url.searchParams.get('limit'));
      const offset = Number(url.searchParams.get('offset'));
      expect(limit).toBeLessThanOrEqual(100);
      return Response.json({ data: Array.from({ length: Math.min(limit, 601 - offset) }, (_, i) => ({ id: `daily-${offset + i}`, report_date:new Date(Date.UTC(2024,0,1)+86400000*(offset+i)).toISOString().slice(0,10), timestamp: '2026-10-16T20:00:00Z' })), total: 601 });
    });
    vi.stubGlobal('fetch', fetchMock);
    const result = await sitemapEntries('today-0.xml');
    expect(result).toHaveLength(601);
    expect(result?.at(-1)?.url).toBe(`${SITE_URL}/today/${new Date(Date.UTC(2024,0,1)+600*86400000).toISOString().slice(0,10)}-market-report`);
    expect(result?.length).toBeLessThanOrEqual(SHARD_SIZE);
  });
  it('discovers report shards and public KOL, excluding noindex digest dates', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => Response.json({ data: [], total: 1001 })));
    const files = await sitemapFiles();
    expect(files).toContain('today-1.xml');
    expect(files).toContain('twitter-digest-1.xml');
    expect(files).toContain('kol-0.xml');
  });
  it('omits thin digest dates from their shard', async () => {vi.stubGlobal('fetch',vi.fn(async()=>Response.json({data:[],total:0})));expect(await sitemapEntries('twitter-digest-0.xml')).toEqual([]);});
  it('returns retryable 503 rather than a successful incomplete index', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('', { status: 503 })));
    expect((await sitemapIndex()).status).toBe(503);
  });
  it('keeps stock links discoverable and rejects unknown files', async () => {
    expect(await sitemapEntries('stock-0.xml')).toEqual([]);
    expect(await sitemapEntries('private.xml')).toBeNull();
    expect(sitemapXml([{ url: `${SITE_URL}/?a=1&b=2` }])).toContain('&amp;');
  });
  it('advertises the production sitemap and allows reading utility noindex headers', async () => {
    expect(robots().sitemap).toBe(`${SITE_URL}/sitemap.xml`);
    expect(robots().rules).toEqual([{ userAgent: '*', allow: '/', disallow: ['/api/'] }]);
  });
});

it('JSON-LD round-trips text without allowing HTML script termination', async () => {
  const value = { headline: '</script><script>alert(1)</script>' };
  const json = serializeJsonLd(value);
  expect(json).not.toContain('<');
  expect(JSON.parse(json)).toEqual(value);
});

it('permanently redirects the bare host while preserving path and query', async () => {
  const response = await middleware(new NextRequest('https://themarketbrew.com/today?utm_source=test'));
  expect(response.status).toBe(308);
  expect(response.headers.get('location')).toBe(`${SITE_URL}/today?utm_source=test`);
});

it.each(['today', 'morning'] as const)('redirects legacy %s IDs with a real 308 before streaming', async (kind) => {
  vi.stubGlobal('fetch', vi.fn(async () => Response.json({ data: { report_date: '2026-10-16' } })));
  const response = await middleware(new NextRequest(`${SITE_URL}/${kind}/11111111-1111-4111-8111-111111111111`));
  expect(response.status).toBe(308);
  expect(response.headers.get('location')).toContain(`/2026-10-16-${kind === 'today' ? 'market-report' : 'morning-brief'}`);
});
it('retries a legacy report resolution outage without caching a false redirect', async () => {
  vi.stubGlobal('fetch', vi.fn(async () => new Response('', { status: 503 })));
  const response = await middleware(new NextRequest(`${SITE_URL}/today/11111111-1111-4111-8111-111111111111`));
  expect(response.status).toBe(503);
  expect(response.headers.get('location')).toBeNull();
});

it('lets unknown paths reach Next 404 without redirecting to login', async () => {
  const response = await middleware(new NextRequest(`${SITE_URL}/random-missing-page`));
  expect(response.headers.get('location')).toBeNull();
});
it('returns a real noindex 404 for missing stocks and 503 for outages', async () => {
  vi.stubGlobal('fetch', vi.fn(async () => Response.json({ profile: null, source: 'none' })));
  const missing = await middleware(new NextRequest(`${SITE_URL}/stock/ZZZZQ`));
  expect(missing.status).toBe(404);
  expect(missing.headers.get('X-Robots-Tag')).toContain('noindex');
  vi.stubGlobal('fetch', vi.fn(async () => Response.json({ profile: null, source: 'error' })));
  expect((await middleware(new NextRequest(`${SITE_URL}/stock/NVDA`))).status).toBe(503);
});
it('canonicalizes only confirmed stock symbols', async () => {
  vi.stubGlobal('fetch', vi.fn(async () => Response.json({ profile: { company_name: 'NVIDIA' } })));
  expect((await middleware(new NextRequest(`${SITE_URL}/stock/nvda`))).status).toBe(308);
  expect((await middleware(new NextRequest(`${SITE_URL}/stock/NVDA`))).status).toBe(200);
});

it('keeps stock sitemap membership equal to the public quality gate', async () => {
  const doc: StockSeoData = {symbol:'NVDA',updated_at:'2026-10-16T00:00:00Z',content_hash:'a',about:'公司业务资料。'.repeat(35),ai_summary:'',earnings_analysis:'本季度业绩资料。'.repeat(100),earnings_notes:'',profile:{company_name:'NVIDIA'},stock:{quote:{}},reports:[],why:[],kol:[],earnings:{},next_earnings:null,analyst:{},dividend_yield:null};
  vi.mocked(seoData).mockImplementation(async path => path==='stock/NVDA'?doc:null);
  const entries = await sitemapEntries('stock-0.xml');
  expect(stockContent(doc).quality.index).toBe(true);
  expect(entries).toEqual([{url:`${SITE_URL}/stock/NVDA`,lastModified:doc.updated_at}]);
  vi.mocked(seoData).mockImplementation(async () => null);
});
