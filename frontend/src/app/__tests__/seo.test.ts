import { afterEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import middleware from '../../../middleware';
import { sitemapEntries, sitemapFiles, sitemapXml, SHARD_SIZE } from '@/lib/sitemaps';
import { GET as sitemapIndex } from '../sitemap.xml/route';
import robots from '../robots';
import { serializeJsonLd, SITE_URL } from '@/lib/seo';

afterEach(() => vi.unstubAllGlobals());

describe('crawler access and authentication boundary', () => {
  it.each(['/about', '/terms', '/privacy', '/contact'])('allows anonymous access to %s', async (path) => {
    const response = await middleware(new NextRequest(`${SITE_URL}${path}`));
    expect(response.status).toBe(200);
    expect(response.headers.get('location')).toBeNull();
  });
  it.each(['/robots.txt', '/sitemap.xml', '/sitemaps/static.xml', '/sitemaps/today-0.xml'])('allows anonymous %s without cookies or redirects', async (path) => {
    const response = await middleware(new NextRequest(`${SITE_URL}${path}`));
    expect(response.status).toBe(200);
    expect(response.headers.get('location')).toBeNull();
    expect(response.cookies.getAll()).toHaveLength(0);
  });
  it.each(['/admin', '/profile', '/settings', '/for-you', '/private.xml', '/sitemap.xml/private', '/sitemaps/private.xml'])('keeps %s protected', async (path) => {
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
      const limit = Number(url.searchParams.get('limit'));
      const offset = Number(url.searchParams.get('offset'));
      expect(limit).toBeLessThanOrEqual(100);
      return Response.json({ data: Array.from({ length: Math.min(limit, 601 - offset) }, (_, i) => ({ id: `daily-${offset + i}`, timestamp: '2026-10-16T20:00:00Z' })), total: 601 });
    });
    vi.stubGlobal('fetch', fetchMock);
    const result = await sitemapEntries('today-0.xml');
    expect(result).toHaveLength(601);
    expect(result?.at(-1)?.url).toBe(`${SITE_URL}/today/daily-600`);
    expect(result?.length).toBeLessThanOrEqual(SHARD_SIZE);
  });
  it('discovers additional shards and keeps KOL excluded', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => Response.json({ data: [], total: 1001 })));
    const files = await sitemapFiles();
    expect(files).toContain('today-1.xml');
    expect(files).toContain('twitter-digest-1.xml');
    expect(files.some(file => file.includes('kol'))).toBe(false);
  });
  it('uses digest limit 50 and actual dates', async () => {
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      expect(new URL(url).searchParams.get('limit')).toBe('50');
      return Response.json({ data: [{ id: 'digest', date: '2026-10-16', generated_at: '2026-10-17T01:00:00Z' }], total: 1 });
    }));
    expect((await sitemapEntries('twitter-digest-0.xml'))?.[0].url).toBe(`${SITE_URL}/twitter-digest/2026-10-16`);
  });
  it('returns retryable 503 rather than a successful incomplete index', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('', { status: 503 })));
    expect((await sitemapIndex()).status).toBe(503);
  });
  it('keeps stock links discoverable and rejects unknown files', async () => {
    expect((await sitemapEntries('stock-0.xml'))?.some(entry => entry.url.endsWith('/NVDA'))).toBe(true);
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
