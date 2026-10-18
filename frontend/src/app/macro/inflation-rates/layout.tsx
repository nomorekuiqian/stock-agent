import { SITE_URL, serializeJsonLd } from '@/lib/seo';
import { Metadata } from 'next';

export const metadata: Metadata = {
  alternates: { canonical: '/macro/inflation-rates' },
  openGraph: { url: '/macro/inflation-rates' },
  title: '美债收益率（10年期）、CPI与美联储利率实时',
  description: '监控美国通胀与利率核心数据：CPI、核心 PCE、联邦基金利率、国债收益率曲线与实际利率，分析美联储货币政策走向。',
};

export default function InflationRatesLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <><script type="application/ld+json" dangerouslySetInnerHTML={{ __html: serializeJsonLd({ '@context': 'https://schema.org', '@graph': [{'@type': 'WebPage', url: `${SITE_URL}/macro/inflation-rates`, name: '美债收益率（10年期）、CPI与美联储利率实时', inLanguage: 'zh-CN' }] }) }} />{children}</>;
}
