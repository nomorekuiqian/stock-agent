import { Metadata } from 'next';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import { getAuthCookies } from '@/lib/auth-cookies';
import type { MorningReport } from '@/lib/api';
import { MorningReportBody } from '../_components/MorningReportBody';

// Per-user dynamic: the backend strips paid AI fields when called without
// a token. We forward the access-token cookie so authenticated subscribers
// get the unlocked payload in the SSR HTML (no client-side flicker).
export const dynamic = 'force-dynamic';

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8000/api';

async function getMorningReport(id: string): Promise<MorningReport | null> {
  const { accessToken } = await getAuthCookies();
  const headers: Record<string, string> = {};
  if (accessToken) {
    headers.Authorization = `Bearer ${accessToken}`;
  }
  try {
    const res = await fetch(`${API_BASE}/morning/reports/${id}`, {
      headers,
      cache: 'no-store',
    });
    if (!res.ok) {
      if (res.status === 404) return null;
      return null;
    }
    const json = await res.json();
    return (json.data ?? null) as MorningReport | null;
  } catch {
    return null;
  }
}

interface PageProps {
  params: Promise<{ id: string }>;
}

function formatDateForSEO(dateStr: string): string {
  try {
    const [year, month, day] = dateStr.split('-').map(Number);
    return `${year}年${month}月${day}日`;
  } catch {
    return dateStr;
  }
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { id } = await params;
  const report = await getMorningReport(id);

  if (!report) {
    return {
      title: '未找到早报',
      description: '未找到该盘前早报。',
    };
  }

  const title = report.title || `${formatDateForSEO(report.report_date || '')} 盘前早报`;
  const description = report.market_pulse || '盘前市场简报，快速了解隔夜要闻与今日焦点。';

  return {
    title,
    description,
    openGraph: {
      title,
      description,
      type: 'article',
      publishedTime: report.timestamp || report.report_date || '',
      siteName: 'TheMarketBrew',
      locale: 'zh_CN',
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
    },
    alternates: {
      canonical: `/morning/${id}`,
    },
  };
}

function generateJsonLd(report: { title?: string; report_date?: string; timestamp?: string; market_pulse?: string }, id: string) {
  return {
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline: report.title || `${formatDateForSEO(report.report_date || '')} 盘前早报`,
    description: report.market_pulse || '盘前市场简报',
    datePublished: report.timestamp || `${report.report_date || ''}T00:00:00Z`,
    dateModified: report.timestamp || `${report.report_date || ''}T00:00:00Z`,
    author: {
      '@type': 'Organization',
      name: 'TheMarketBrew',
      url: 'https://themarketbrew.com',
    },
    publisher: {
      '@type': 'Organization',
      name: 'TheMarketBrew',
      url: 'https://themarketbrew.com',
    },
    mainEntityOfPage: {
      '@type': 'WebPage',
      '@id': `https://themarketbrew.com/morning/${id}`,
    },
    articleSection: '盘前早报',
    inLanguage: 'zh-CN',
  };
}

export default async function MorningReportDetailPage({ params }: PageProps) {
  const { id } = await params;
  const report = await getMorningReport(id);

  if (!report) {
    notFound();
  }

  const jsonLd = generateJsonLd(report, id);

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />

      <main className="min-h-screen bg-background">
        <div className="border-b border-border">
          <div className="max-w-5xl mx-auto px-4 md:px-6 py-3">
            <Link
              href="/morning"
              className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
              返回早报
            </Link>
          </div>
        </div>

        <div className="max-w-5xl mx-auto px-4 md:px-6 py-8 space-y-8">
          <MorningReportBody report={report} targetPath={`/morning/${id}`} />
        </div>
      </main>
    </>
  );
}
