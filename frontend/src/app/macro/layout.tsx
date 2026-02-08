import { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Macro Dashboard - TheMarketBrew',
  description:
    'Monitor liquidity, economic fundamentals, inflation, and market sentiment in one place.',
};

export default function MacroLayout({ children }: { children: React.ReactNode }) {
  return children;
}
