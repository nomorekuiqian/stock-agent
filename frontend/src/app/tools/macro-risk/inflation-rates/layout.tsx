import { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Inflation & Rates - TheMarketBrew',
  description: 'Monitor CPI, PCE, Fed Funds Rate, Treasury yields and real rates for inflation and monetary policy assessment.',
};

export default function InflationRatesLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
