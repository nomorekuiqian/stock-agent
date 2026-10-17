import { pageMetadata } from '@/lib/seo';

export const metadata = pageMetadata('/today/archive', '美股日报历史归档', '按日期浏览历史美股盘后总览，回顾市场动态、新闻与关键指标。');

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
