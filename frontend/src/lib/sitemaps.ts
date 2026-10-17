import { SITE_URL } from './seo';
import { DIRECTORY_SYMBOLS } from './stock-directory';
import { reportPath, validReportDate } from './report-url';

// Small shards bound API work as well as staying below Google's 50,000 URL limit.
export const SHARD_SIZE = 1000;
// Content/template revision date, never the request or build time. Update when visible content changes.
const PUBLIC_TEMPLATE_MODIFIED = '2026-10-17';
const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000/api';
const endpoints = { today: 'market/reports', morning: 'morning/reports', 'twitter-digest': 'twitter-digest/archive' };
type Kind = keyof typeof endpoints;
type Row = { id: string; report_date?: string; timestamp?: string; date?: string; generated_at?: string };
export type Entry = { url: string; lastModified?: string };
export const STATIC_PATHS = ['', '/today', '/today/archive', '/morning', '/morning/archive', '/macro', '/macro/economy', '/macro/inflation-rates', '/macro/liquidity', '/macro/sentiment', '/macro/weekly', '/stock', '/pricing', '/contact', '/about', '/terms', '/privacy', '/twitter-digest', '/twitter-digest/archive'];
async function page(kind: Kind, limit: number, offset: number): Promise<{ data: Row[]; total?: number }> {
  const response = await fetch(`${API_BASE}/${endpoints[kind]}?limit=${limit}&offset=${offset}`, { next: { revalidate: 3600 }, signal: AbortSignal.timeout(10000) });
  if (!response.ok) throw new Error(`Sitemap ${kind}: HTTP ${response.status}`);
  return response.json();
}
export async function sitemapFiles(): Promise<string[]> {
  const files = ['static.xml', 'stock-0.xml'];
  for (const kind of Object.keys(endpoints) as Kind[]) {
    // An unavailable source must not publish a successful incomplete index.
    const first = await page(kind, 1, 0);
    const count = Math.ceil((first.total ?? first.data.length) / SHARD_SIZE);
    for (let i = 0; i < count; i++) files.push(`${kind}-${i}.xml`);
  }
  return files;
}
export async function sitemapEntries(file: string): Promise<Entry[] | null> {
  if (file === 'static.xml') return STATIC_PATHS.map(path => ({ url: `${SITE_URL}${path}`, lastModified: PUBLIC_TEMPLATE_MODIFIED }));
  if (file === 'stock-0.xml') return DIRECTORY_SYMBOLS.map(symbol => ({ url: `${SITE_URL}/stock/${symbol}`, lastModified: PUBLIC_TEMPLATE_MODIFIED }));
  const match = /^(today|morning|twitter-digest)-(0|[1-9]\d*)\.xml$/.exec(file);
  if (!match) return null;
  const kind = match[1] as Kind;
  const start = Number(match[2]) * SHARD_SIZE;
  if (!Number.isSafeInteger(start)) return null;
  const entries: Entry[] = [];
  const limit = kind === 'twitter-digest' ? 50 : 100;
  for (let offset = start; offset < start + SHARD_SIZE; offset += limit) {
    const result = await page(kind, limit, offset);
    for (const row of result.data) {
      const date = row.date || row.generated_at?.slice(0, 10);
      if (kind === 'twitter-digest' && !validReportDate(date)) continue;
      const path = kind === 'twitter-digest' ? `/twitter-digest/${date}` : reportPath(kind, row);
      const modified = row.timestamp || row.generated_at || row.report_date || date;
      entries.push({ url: `${SITE_URL}${path}`, ...(modified && Number.isFinite(Date.parse(modified)) ? { lastModified: new Date(modified).toISOString() } : {}) });
    }
    if (result.data.length < limit || (result.total !== undefined && offset + result.data.length >= result.total)) break;
  }
  return [...new Map(entries.map(entry => [entry.url, entry])).values()];
}
export function xmlEscape(value: string) { return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;'); }
export function sitemapXml(entries: Entry[]) {
  return `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${entries.map(entry => `<url><loc>${xmlEscape(entry.url)}</loc>${entry.lastModified ? `<lastmod>${xmlEscape(entry.lastModified)}</lastmod>` : ''}</url>`).join('')}</urlset>`;
}
export const XML_HEADERS = { 'Content-Type': 'application/xml; charset=utf-8', 'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=300' };
