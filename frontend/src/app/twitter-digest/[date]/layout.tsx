import { pageMetadata } from '@/lib/seo';

export async function generateMetadata({ params }: { params: Promise<{ date: string }> }) {
  const { date } = await params;
  return pageMetadata(`/twitter-digest/${encodeURIComponent(date)}`, `${date} 美股博主观点简报`, '查看当日美股博主观点简报，公开预览市场线索，完整内容需订阅。');
}

export default function Layout({ children }: { children: React.ReactNode }) { return children; }
