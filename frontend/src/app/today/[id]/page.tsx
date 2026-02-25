import { Metadata } from 'next';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import { getReportById, MarketReport } from '@/lib/insforge';
import { ReportContent } from '@/components/ReportContent';
import { formatReportDate } from '@/lib/timezone';

// ISR: revalidate every hour (reports don't change after generation)
export const revalidate = 3600;

interface PageProps {
  params: Promise<{ id: string }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { id } = await params;
  const report = await getReportById(id);

  if (!report) {
    return {
      title: 'Report Not Found - TheMarketBrew',
      description: 'The requested market report could not be found.',
    };
  }

  const title = report.title || `${formatDateForSEO(report.report_date)} Market Report`;
  const description = report.summary || 'AI-powered daily market analysis and insights for smart investors.';

  return {
    title: `${title} - TheMarketBrew`,
    description,
    openGraph: {
      title,
      description,
      type: 'article',
      publishedTime: report.timestamp || report.report_date,
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
    const date = new Date(year, month - 1, day);
    return date.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
  } catch {
    return dateStr;
  }
}

function generateJsonLd(report: MarketReport, id: string) {
  return {
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline: report.title || `${formatDateForSEO(report.report_date)} Market Report`,
    description: report.summary || 'AI-powered daily market analysis',
    datePublished: report.timestamp || `${report.report_date}T00:00:00Z`,
    dateModified: report.timestamp || `${report.report_date}T00:00:00Z`,
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
    articleSection: 'Market Analysis',
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
  const report = await getReportById(id);

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
              {formatReportDate(report.report_date)}
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
