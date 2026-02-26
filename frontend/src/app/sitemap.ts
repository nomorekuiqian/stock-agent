import { MetadataRoute } from 'next';
import { api } from '@/lib/api';

const BASE_URL = 'https://themarketbrew.com';

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  // Static pages
  const staticPages: MetadataRoute.Sitemap = [
    {
      url: BASE_URL,
      lastModified: new Date(),
      changeFrequency: 'daily',
      priority: 1,
    },
    {
      url: `${BASE_URL}/today`,
      lastModified: new Date(),
      changeFrequency: 'daily',
      priority: 0.9,
    },
    {
      url: `${BASE_URL}/today/archive`,
      lastModified: new Date(),
      changeFrequency: 'daily',
      priority: 0.7,
    },
    {
      url: `${BASE_URL}/macro`,
      lastModified: new Date(),
      changeFrequency: 'weekly',
      priority: 0.8,
    },
    {
      url: `${BASE_URL}/stock`,
      lastModified: new Date(),
      changeFrequency: 'daily',
      priority: 0.7,
    },
  ];

  // Dynamic report pages
  let reportPages: MetadataRoute.Sitemap = [];

  try {
    // Fetch all reports (up to 500)
    const { data: reports } = await api.reports.list(500, 0);

    reportPages = reports.map((report) => ({
      url: `${BASE_URL}/today/${report.id}`,
      lastModified: report.timestamp ? new Date(report.timestamp) : new Date(report.report_date),
      changeFrequency: 'weekly' as const,
      priority: 0.6,
    }));
  } catch (error) {
    console.error('[Sitemap] Error fetching reports:', error);
  }

  return [...staticPages, ...reportPages];
}
