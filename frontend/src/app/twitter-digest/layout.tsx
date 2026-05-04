import { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Twitter KOL 观点日报 - TheMarketBrew',
  description:
    '把英文 Twitter 上少数优质金融博主的当前思考翻译、聚类、解释清楚的每日早晨阅读。中英对照,主题视角,Pro 用户专享。',
  keywords: [
    'Twitter KOL 日报', '金融博主观点', '英文金融推特',
    '美股深度分析', '中英对照金融日报', 'fintwit digest',
  ],
  alternates: {
    canonical: '/twitter-digest',
  },
  openGraph: {
    title: 'Twitter KOL 观点日报 - TheMarketBrew',
    description: '每日整理优质英文金融博主的核心观点,中英对照',
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
