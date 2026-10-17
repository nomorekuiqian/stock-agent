import { SITE_URL } from '@/lib/seo';
import { sitemapFiles, xmlEscape, XML_HEADERS } from '@/lib/sitemaps';
export const dynamic = 'force-dynamic';
export async function GET() {
  try {
    const files = await sitemapFiles();
    return new Response(`<?xml version="1.0" encoding="UTF-8"?><sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${files.map(file => `<sitemap><loc>${xmlEscape(`${SITE_URL}/sitemaps/${file}`)}</loc></sitemap>`).join('')}</sitemapindex>`, { headers: XML_HEADERS });
  } catch {
    return new Response('Sitemap temporarily unavailable', { status: 503, headers: { 'Retry-After': '300', 'Cache-Control': 'no-store' } });
  }
}
