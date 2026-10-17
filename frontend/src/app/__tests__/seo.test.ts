import { afterEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import middleware from '../../../middleware';
import sitemap from '../sitemap';
import robots from '../robots';
import { serializeJsonLd, SITE_URL } from '@/lib/seo';

afterEach(() => vi.unstubAllGlobals());

describe('crawler access and authentication boundary', () => {
  it.each(['/robots.txt', '/sitemap.xml'])('allows anonymous %s without cookies or redirects', (path) => {
    const response = middleware(new NextRequest(`${SITE_URL}${path}`));
    expect(response.status).toBe(200);
    expect(response.headers.get('location')).toBeNull();
    expect(response.cookies.getAll()).toHaveLength(0);
  });
  it.each(['/admin', '/profile', '/settings', '/for-you', '/private.xml', '/sitemap.xml/private'])('keeps %s protected', (path) => {
    const response = middleware(new NextRequest(`${SITE_URL}${path}`));
    expect(response.status).toBe(307);
    expect(new URL(response.headers.get('location')!).pathname).toBe('/login');
  });
  it.each(['/login', '/forgot-password', '/pricing/success', '/verify-email', '/admin'])('excludes utility %s from indexing', (path) => {
    const response = middleware(new NextRequest(`${SITE_URL}${path}`));
    expect(response.headers.get('X-Robots-Tag')).toBe('noindex, follow');
  });
  it('keeps public pricing indexable and protected session routing unchanged', () => {
    expect(middleware(new NextRequest(`${SITE_URL}/pricing`)).headers.get('X-Robots-Tag')).toBeNull();
    const response = middleware(new NextRequest(`${SITE_URL}/profile`, { headers: { cookie: 'app_access_token=test' } }));
    expect(response.status).toBe(200);
    expect(response.headers.get('X-Robots-Tag')).toBe('noindex, follow');
  });
});

describe('sitemap', () => {
  it('paginates within API limits and includes public morning details', async () => {
    const fetchMock = vi.fn(async (input: string) => {
      const url = new URL(input);
      expect(url.searchParams.get('limit')).toBe('100');
      const offset = Number(url.searchParams.get('offset'));
      const data = url.pathname.includes('/morning/')
        ? [{ id: 'morning-1', report_date: '2026-10-16' }]
        : Array.from({ length: offset === 0 ? 100 : 1 }, (_, i) => ({ id: `daily-${offset + i}`, timestamp: '2026-10-16T20:00:00Z' }));
      return Response.json({ data, total: url.pathname.includes('/morning/') ? 1 : 101 });
    });
    vi.stubGlobal('fetch', fetchMock);
    const result = await sitemap();
    expect(result.some((entry) => entry.url === `${SITE_URL}/today/daily-100`)).toBe(true);
    expect(result.some((entry) => entry.url === `${SITE_URL}/morning/morning-1`)).toBe(true);
    expect(result.find((entry) => entry.url === SITE_URL)).not.toHaveProperty('lastModified');
    expect(result.every((entry) => entry.url.startsWith(SITE_URL))).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });
  it('preserves static pages and the healthy archive when one API fails', async () => {
    vi.stubGlobal('fetch', vi.fn(async (input: string) => input.includes('/market/')
      ? new Response('', { status: 503 })
      : Response.json({ data: [{ id: 'ok', timestamp: 'invalid' }] })));
    const result = await sitemap();
    expect(result.some((entry) => entry.url === `${SITE_URL}/pricing`)).toBe(true);
    expect(result.find((entry) => entry.url === `${SITE_URL}/morning/ok`)).not.toHaveProperty('lastModified');
  });
  it('advertises the production sitemap and allows reading utility noindex headers', () => {
    expect(robots().sitemap).toBe(`${SITE_URL}/sitemap.xml`);
    expect(robots().rules).toEqual([{ userAgent: '*', allow: '/', disallow: ['/api/'] }]);
  });
});

it('JSON-LD round-trips text without allowing HTML script termination', () => {
  const value = { headline: '</script><script>alert(1)</script>' };
  const json = serializeJsonLd(value);
  expect(json).not.toContain('<');
  expect(JSON.parse(json)).toEqual(value);
});
