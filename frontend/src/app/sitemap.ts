import { MetadataRoute } from 'next';
import { SITE_URL } from '@/lib/seo';

export const revalidate = 3600;
const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000/api';

interface ReportEntry {
  id: string;
  timestamp?: string;
  report_date?: string;
}

async function reportEntries(endpoint: string, route: string): Promise<MetadataRoute.Sitemap> {
  const entries: MetadataRoute.Sitemap = [];
  // Both public list endpoints cap limit at 100. Bound each archive to 500 URLs.
  for (let offset = 0; offset < 500; offset += 100) {
    const response = await fetch(`${API_BASE}/${endpoint}?limit=100&offset=${offset}`, {
      next: { revalidate: 3600 },
      signal: AbortSignal.timeout(10000),
    });
    if (!response.ok) throw new Error(`Sitemap ${route}: HTTP ${response.status}`);
    const { data = [], total } = await response.json() as { data?: ReportEntry[]; total?: number };
    for (const report of data) {
      const modified = report.timestamp || report.report_date;
      const date = modified ? new Date(modified) : undefined;
      entries.push({
        url: `${SITE_URL}/${route}/${encodeURIComponent(report.id)}`,
        ...(date && Number.isFinite(date.getTime()) ? { lastModified: date } : {}),
      });
    }
    if (data.length < 100 || (typeof total === 'number' && offset + data.length >= total)) break;
  }
  return entries;
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const paths = [
    '', '/today', '/today/archive', '/morning', '/morning/archive',
    '/macro', '/macro/economy', '/macro/inflation-rates', '/macro/liquidity',
    '/macro/sentiment', '/macro/weekly', '/stock', '/pricing', '/contact', '/about', '/terms', '/privacy',
  ];
  // Do not label every request/build time as a content modification.
  const pages: MetadataRoute.Sitemap = paths.map((path) => ({ url: `${SITE_URL}${path}` }));
  const archives = await Promise.allSettled([
    reportEntries('market/reports', 'today'),
    reportEntries('morning/reports', 'morning'),
  ]);
  for (const archive of archives) {
    if (archive.status === 'fulfilled') pages.push(...archive.value);
  }
  return pages;
}
