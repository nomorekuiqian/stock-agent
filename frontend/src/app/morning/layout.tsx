import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: '美股盘前分析：今日美股期货、隔夜要闻与盘前异动（每日更新）',
  description: '盘前市场简报，助你快速了解隔夜要闻与今日焦点',
  alternates: {
    canonical: '/morning',
  },
};

export default function MorningLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
