import { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Twitter KOL 观点日报 - TheMarketBrew',
  description:
    '每天 5 分钟带你看清美股高质量 KOL 观点。主题视角、热门标的和历史归档，Max 用户专享。',
  keywords: [
    'Twitter KOL 日报', '金融博主观点', '英文金融推特',
    '美股深度分析', '中英对照金融日报', 'fintwit digest',
  ],
  alternates: {
    canonical: '/twitter-digest',
  },
  openGraph: {
    title: 'Twitter KOL 观点日报 - TheMarketBrew',
    description: '每天 5 分钟带你看清美股高质量 KOL 观点，Max 用户专享',
    type: 'website',
  },
};

export default function TwitterDigestLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
