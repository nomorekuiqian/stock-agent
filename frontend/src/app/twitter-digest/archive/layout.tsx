import { pageMetadata } from '@/lib/seo';

export const metadata = pageMetadata('/twitter-digest/archive', '美股博主观点简报归档', '按日期浏览美股博主观点简报，回顾历史市场线索。');

export default function Layout({ children }: { children: React.ReactNode }) { return children; }
