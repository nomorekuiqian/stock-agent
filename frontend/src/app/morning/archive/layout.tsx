import { pageMetadata } from '@/lib/seo';

export const metadata = pageMetadata('/morning/archive', '盘前早报历史归档', '按日期浏览盘前早报，查看历史市场行情与当日焦点。');

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
