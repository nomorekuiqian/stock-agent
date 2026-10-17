import { pageMetadata } from '@/lib/seo';

export const metadata = pageMetadata('/macro/weekly', '宏观经济周报', '阅读每周宏观市场分析，关注流动性、经济、利率与风险变化。');

export default function Layout({ children }: { children: React.ReactNode }) { return children; }
