import { Metadata } from 'next';

export const metadata: Metadata = {
  alternates: { canonical: '/macro/inflation-rates' },
  openGraph: { url: '/macro/inflation-rates' },
  title: '通胀与利率 - CPI、PCE、美联储利率与国债收益率',
  description: '监控美国通胀与利率核心数据：CPI、核心 PCE、联邦基金利率、国债收益率曲线与实际利率，分析美联储货币政策走向。',
};

export default function InflationRatesLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
