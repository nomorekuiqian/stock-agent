import { cache } from 'react';
import { Metadata } from 'next';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import { api } from '@/lib/api';
import { MorningReportBody } from '../_components/MorningReportBody';

// ISR: revalidate every hour (reports don't change after generation)
export const revalidate = 3600;

const getMorningReport = cache((id: string) => api.morningReports.getById(id));

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
