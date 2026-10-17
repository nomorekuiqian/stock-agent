import { sitemapEntries, sitemapXml, XML_HEADERS } from '@/lib/sitemaps';
export const dynamic = 'force-dynamic';
export async function GET(_request: Request, { params }: { params: Promise<{ file: string }> }) {
  try {
    const entries = await sitemapEntries((await params).file);
    if (!entries?.length) return new Response('Not found', { status: 404 });
    return new Response(sitemapXml(entries), { headers: XML_HEADERS });
  } catch {
    return new Response('Sitemap temporarily unavailable', { status: 503, headers: { 'Retry-After': '300', 'Cache-Control': 'no-store' } });
  }
}
