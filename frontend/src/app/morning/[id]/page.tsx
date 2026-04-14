import { cache } from 'react';
import { Metadata } from 'next';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import { api } from '@/lib/api';
import { MorningReportContent } from '@/components/MorningReportContent';
import { formatReportDate } from '@/lib/timezone';

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
          <section className="space-y-4">
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-card border border-border/50">
                <svg className="w-4 h-4 text-amber-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z" />
                </svg>
                <span className="text-sm font-data text-foreground">{formatReportDate(report.report_date || '')}</span>
              </div>
            </div>

            {report.title && (
              <h1 className="text-2xl md:text-3xl font-editorial text-foreground leading-tight">
                {report.title}
              </h1>
            )}

            {report.market_pulse && (
              <div className="p-4 rounded-lg bg-primary/5 border border-primary/10">
                <p className="text-muted-foreground leading-relaxed text-sm">
                  {report.market_pulse}
                </p>
              </div>
            )}
          </section>

          <MorningReportContent
            futures={report.futures || []}
            futures_analysis={report.futures_analysis}
            global_markets={report.global_markets || { asia: [], europe: [], other: [] }}
            global_markets_analysis={report.global_markets_analysis}
            overnight_news={report.overnight_news || []}
            today_focus={report.today_focus || []}
            summary={report.summary || []}
          />
        </div>
      </main>
    </>
  );
}
