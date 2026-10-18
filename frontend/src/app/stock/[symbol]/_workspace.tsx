import { STOCK_NAMES } from '@/lib/stock-names';
import { SITE_URL, serializeJsonLd } from '@/lib/seo';
import samples from '@/lib/seo-samples.json';
import Link from 'next/link';
import { DIRECTORY_SYMBOLS, relatedStocks } from '@/lib/stock-directory';
import type { Metadata } from 'next';
import { dehydrate, HydrationBoundary } from '@tanstack/react-query';
import { getQueryClient } from '@/hooks/queries/query-client';
import { queryKeys } from '@/hooks/queries/query-keys';
import StockDetailContent from './_components/StockDetailContent';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000/api';

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
  const companyNameZh = profile?.company_name_zh || STOCK_NAMES[upperSymbol]?.zh;
  const companyNameEn = profile?.company_name || upperSymbol;
  const displayName = companyNameZh || companyNameEn;
  const title = `${displayName}(${upperSymbol})股票：股价、财报与AI解读`;
  const description = `${displayName}（代码 ${upperSymbol}）最新股价、涨跌原因、财报日期、分析师预期与博主观点汇总。仅供研究参考。`;

  return {
    title,
    description,
    robots: { index: !!profile && (samples.some(item => item.symbol === upperSymbol) || DIRECTORY_SYMBOLS.includes(upperSymbol)), follow: true },
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
  let preview: { excerpt?: string; generated_at?: string } = {};
  try {
    const response = await fetch(`${API_BASE_URL}/stocks/${upperSymbol}/analysis/preview`, { next: { revalidate: 600 }, signal: AbortSignal.timeout(5000) });
    if (response.ok) preview = await response.json();
  } catch { /* A missing excerpt must not trigger paid generation. */ }
  const name = profile?.company_name_zh || STOCK_NAMES[upperSymbol]?.zh || profile?.company_name || upperSymbol;
  const aliases = samples.find(item => item.symbol === upperSymbol);
  const related = relatedStocks(upperSymbol, profile?.classification?.sector);
  return (
    <HydrationBoundary state={dehydrate(queryClient)}>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: serializeJsonLd({ '@context': 'https://schema.org', '@graph': [
        { '@type': 'WebPage', url: `${SITE_URL}/stock/${upperSymbol}`, name: `${name}（${upperSymbol}）`, inLanguage: 'zh-CN', isAccessibleForFree: false, hasPart: { '@type': 'WebPageElement', isAccessibleForFree: false, cssSelector: '.stock-ai-paywall' }, ...(profile?.updated_at ? { dateModified: profile.updated_at } : {}) },
        ...(profile ? [{ '@type': 'Corporation', name: profile.company_name, alternateName: [...new Set([name, aliases?.traditional].filter(Boolean))], tickerSymbol: profile.exchange ? `${profile.exchange}: ${upperSymbol}` : upperSymbol, ...(profile.company_details?.website ? { url: profile.company_details.website } : {}) }] : []),
        { '@type': 'BreadcrumbList', itemListElement: [{ '@type': 'ListItem', position: 1, name: '首页', item: SITE_URL }, { '@type': 'ListItem', position: 2, name: '个股', item: `${SITE_URL}/stock` }, { '@type': 'ListItem', position: 3, name, item: `${SITE_URL}/stock/${upperSymbol}` }] },
      ] }) }} />
      <nav aria-label="面包屑" className="mx-auto max-w-5xl px-4 pt-4 text-sm"><Link href="/">首页</Link> › <Link href="/stock">个股</Link> › {name}（{upperSymbol}）</nav>
      {aliases && <p className="mx-auto max-w-5xl px-4 py-2 text-sm text-muted-foreground">又称：{[...new Set([aliases.name, aliases.traditional, profile?.company_name].filter(Boolean))].join(' / ')}</p>}
      {preview.excerpt && <section className="mx-auto max-w-5xl px-4 py-6 space-y-3"><h2 className="text-xl font-medium">AI 解读摘要</h2><p className="text-sm leading-7">{preview.excerpt}</p>{preview.generated_at && <time className="text-xs text-muted-foreground" dateTime={preview.generated_at}>{new Date(preview.generated_at).toLocaleString('zh-CN', { timeZone: 'America/New_York' })} ET</time>}</section>}
      <StockDetailContent symbol={upperSymbol} />
      {related.length > 0 && <nav aria-label="同板块股票" className="mx-auto max-w-5xl px-4 py-8">
        <h2 className="mb-4 text-xl font-medium">同板块股票</h2>
        <div className="flex flex-wrap gap-4">{related.map(item => <Link prefetch={false} className="text-primary hover:underline" key={item} href={`/stock/${item}`}>{STOCK_NAMES[item]?.zh || item}（{item}）</Link>)}</div>
      </nav>}
      <p className="mx-auto max-w-5xl px-4 py-6 text-xs text-muted-foreground">本页内容由 TheMarketBrew 基于公开数据与 AI 生成，仅供研究与信息参考，不构成任何投资建议或买卖推荐。美股投资有风险，请独立判断。{preview.generated_at && ` AI 数据更新时间：${new Date(preview.generated_at).toLocaleString('zh-CN', { timeZone: 'America/New_York' })} ET。`}</p>
    </HydrationBoundary>
  );
}
