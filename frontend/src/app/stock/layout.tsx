import { pageMetadata } from '@/lib/seo';

export const metadata = pageMetadata('/stock', '美股个股研究', '搜索股票，查看公司基本面、财务数据、行情和 AI 投研分析。');

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
