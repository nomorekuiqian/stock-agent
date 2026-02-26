import { Metadata } from 'next';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import { api, MarketData } from '@/lib/api';
import { ReportContent } from '@/components/ReportContent';
import { formatReportDate } from '@/lib/timezone';

// ISR: revalidate every hour (reports don't change after generation)
export const revalidate = 3600;

interface PageProps {
  params: Promise<{ id: string }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { id } = await params;
  const report = await api.reports.getById(id);

  if (!report) {
    return {
      title: '未找到报告',
      description: '未找到该市场分析报告，请查看最新的美股日报。',
    };
  }

  const title = report.title || `${formatDateForSEO(report.report_date || '')} 美股日报`;
  const description = report.summary || 'AI 生成的美股每日分析报告，深度解读市场动态与投资机会。';

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
      canonical: `/today/${id}`,
    },
  };
}

function formatDateForSEO(dateStr: string): string {
  try {
    const [year, month, day] = dateStr.split('-').map(Number);
    return `${year}年${month}月${day}日`;
  } catch {
    return dateStr;
  }
}

function generateJsonLd(report: MarketData, id: string) {
  return {
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline: report.title || `${formatDateForSEO(report.report_date || '')} 美股日报`,
    description: report.summary || 'AI 生成的美股每日分析报告',
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
      '@id': `https://themarketbrew.com/today/${id}`,
    },
    articleSection: '美股市场分析',
    inLanguage: 'zh-CN',
  };
}

interface IndexData {
  name: string;
  value: number;
  change_percent?: number;
}

export default async function ReportDetailPage({ params }: PageProps) {
  const { id } = await params;
  const report = await api.reports.getById(id);

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
              href="/today"
              className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
              Back to Today
            </Link>
          </div>
        </div>

        <div className="max-w-5xl mx-auto px-4 md:px-6 py-8 space-y-8">
          <section className="text-center space-y-4 animate-fade-in-up">
            <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-emerald-500/10 dark:bg-emerald-500/20 border border-emerald-500/20 dark:border-emerald-500/30 text-emerald-600 dark:text-emerald-400 text-xs font-medium">
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
              {formatReportDate(report.report_date || '')}
            </div>
            <h1 className="text-2xl md:text-3xl font-bold tracking-tight text-foreground">
              {report.title || 'Market Report'}
            </h1>
            {report.summary && (
              <p className="text-base text-muted-foreground max-w-2xl mx-auto">
                {report.summary}
              </p>
            )}
          </section>

          <ReportContent
            indices={report.indices as IndexData[] | undefined}
            intro={report.intro}
            news={report.news}
            report_summary={report.report_summary}
            calendar={report.calendar}
            showDisclaimer={true}
          />
        </div>
      </main>
    </>
  );
}
