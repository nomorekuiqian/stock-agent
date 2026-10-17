import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: '盘前早报',
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
