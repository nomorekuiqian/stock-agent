import { Metadata } from 'next';

export const metadata: Metadata = {
  title: '美股每日报告 - AI 智能市场分析',
  description: 'AI 生成的美股每日分析报告。涵盖三大指数、VIX、国债收益率、黄金等核心指标，深度解读市场动态，每日更新。',
  keywords: [
    '美股日报', '美股每日报告', 'AI 美股分析', '今日美股',
    '美股行情分析', '股市日报', 'S&P 500 分析', '纳斯达克分析',
    'daily stock market report', 'US stock analysis'
  ],
  alternates: {
    canonical: '/today',
  },
  openGraph: {
    title: '美股每日报告 - TheMarketBrew',
    description: 'AI 生成的美股每日分析报告，深度解读市场动态',
    type: 'website',
  },
};

export default function TodayLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
