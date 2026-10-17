import HomePage from './HomePage';
import { pageMetadata, serializeJsonLd, SITE_URL } from '@/lib/seo';

export const metadata = pageMetadata('/', 'TheMarketBrew - AI 美股分析平台', 'AI 驱动的中文美股投研平台，提供每日市场复盘、盘前情报、宏观指标、个股研究和 AI 投研助手。');

export default function Page() {
  const jsonLd = {
    '@context': 'https://schema.org',
    '@graph': [
      { '@type': 'Organization', '@id': `${SITE_URL}/#organization`, name: 'TheMarketBrew', url: SITE_URL, logo: `${SITE_URL}/logo-avatar.png` },
      { '@type': 'WebSite', '@id': `${SITE_URL}/#website`, name: 'TheMarketBrew', url: SITE_URL, inLanguage: 'zh-CN', publisher: { '@id': `${SITE_URL}/#organization` } },
    ],
  };
  return <><script type="application/ld+json" dangerouslySetInnerHTML={{ __html: serializeJsonLd(jsonLd) }} /><HomePage /></>;
}
