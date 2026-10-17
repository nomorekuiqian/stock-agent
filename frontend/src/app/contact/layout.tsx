import { pageMetadata } from '@/lib/seo';

export const metadata = pageMetadata('/contact', '联系 TheMarketBrew', '联系 TheMarketBrew，提交产品反馈、使用问题和合作咨询。');

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
