import { Metadata } from 'next';

export const metadata: Metadata = {
  title: '市场情绪 - 恐惧贪婪指数、VIX 与资金流向',
  description: '实时追踪美股市场情绪指标：CNN 恐惧贪婪指数、VIX 波动率、看跌看涨比率、市场宽度与信用利差，判断市场多空情绪变化。',
};

export default function SentimentLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
