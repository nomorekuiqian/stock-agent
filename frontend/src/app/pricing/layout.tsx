import { pageMetadata } from '@/lib/seo';

export const metadata = pageMetadata('/pricing', '订阅方案与价格', '比较 TheMarketBrew 免费版、Pro 和 Max 的美股日报、邮件推送与 AI 投研功能。');

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
