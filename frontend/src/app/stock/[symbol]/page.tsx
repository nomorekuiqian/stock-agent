import Link from 'next/link';
import { relatedStocks } from '@/lib/stock-directory';
import type { Metadata } from 'next';
import { dehydrate, HydrationBoundary } from '@tanstack/react-query';
import { getQueryClient } from '@/hooks/queries/query-client';
import { queryKeys } from '@/hooks/queries/query-keys';
import StockDetailContent from './_components/StockDetailContent';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000/api';

// Sector translations for SEO metadata (subset of client-side translations)
const SECTOR_ZH: Record<string, string> = {
  'Technology': '科技', 'Healthcare': '医疗保健', 'Financial Services': '金融服务',
  'Consumer Cyclical': '可选消费', 'Consumer Defensive': '必需消费', 'Industrials': '工业',
  'Energy': '能源', 'Utilities': '公用事业', 'Real Estate': '房地产',
  'Basic Materials': '基础材料', 'Communication Services': '通信服务',
};

interface PageProps {
  params: Promise<{ symbol: string }>;
}

async function fetchProfile(symbol: string) {
  try {
    const response = await fetch(`${API_BASE_URL}/stocks/${symbol}/profile`, {
      next: { revalidate: 600 },
    });
    if (!response.ok) return null;
    const result = await response.json();
    return result.success && result.profile ? result.profile : null;
  } catch {
    return null;
  }
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { symbol } = await params;
  const upperSymbol = symbol.toUpperCase();
  const profile = await fetchProfile(upperSymbol);

  // Prefer Chinese company name for SEO, fall back to English
  const companyNameZh = profile?.company_name_zh;
  const companyNameEn = profile?.company_name || upperSymbol;
  const displayName = companyNameZh
    ? `${companyNameZh} ${companyNameEn}`
    : companyNameEn;

  const sector = profile?.classification?.sector || '';
  const sectorZh = SECTOR_ZH[sector] || sector;

  const title = `${displayName} (${upperSymbol}) 个股分析`;
  const description = sectorZh
    ? `${displayName} (${upperSymbol}) 深度分析：实时行情、财务数据、估值对比、同行比较与 AI 投研报告。${sectorZh}板块。`
    : `${displayName} (${upperSymbol}) 深度分析：实时行情、财务数据、估值对比、同行比较与 AI 投研报告。`;

  return {
    title,
    description,
    alternates: {
      canonical: `/stock/${upperSymbol}`,
    },
    openGraph: {
      url: `/stock/${upperSymbol}`,
      title,
      description,
    },
  };
}

export default async function StockPage({ params }: PageProps) {
  const { symbol } = await params;
  const upperSymbol = symbol.toUpperCase();

  const queryClient = getQueryClient();

  // Prefetch profile + detail in parallel; failures don't block render
  await Promise.allSettled([
    queryClient.prefetchQuery({
      queryKey: queryKeys.stocks.profile(upperSymbol),
      queryFn: async () => {
        const response = await fetch(`${API_BASE_URL}/stocks/${upperSymbol}/profile`);
        if (!response.ok) return null;
        const result = await response.json();
        return result.success && result.profile ? result.profile : null;
      },
      staleTime: 10 * 60 * 1000,
    }),
    queryClient.prefetchQuery({
      queryKey: queryKeys.stocks.detail(upperSymbol),
      queryFn: async () => {
        const response = await fetch(`${API_BASE_URL}/stocks/${upperSymbol}`);
        if (!response.ok) throw new Error(`Failed to fetch stock data: ${response.status}`);
        return response.json();
      },
      staleTime: 10 * 60 * 1000,
    }),
  ]);

  const profile = await fetchProfile(upperSymbol);
  const related = relatedStocks(upperSymbol, profile?.classification?.sector);
  return (
    <HydrationBoundary state={dehydrate(queryClient)}>
      <StockDetailContent symbol={upperSymbol} />
      {related.length > 0 && <nav aria-label="同板块股票" className="mx-auto max-w-5xl px-4 py-8">
        <h2 className="mb-4 text-xl font-medium">同板块股票</h2>
        <div className="flex flex-wrap gap-4">{related.map(item => <Link prefetch={false} className="text-primary hover:underline" key={item} href={`/stock/${item}`}>{item}</Link>)}</div>
      </nav>}
    </HydrationBoundary>
  );
}
