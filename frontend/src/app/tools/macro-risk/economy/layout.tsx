import { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Economic Fundamentals - TheMarketBrew',
  description: 'Monitor GDP growth, employment, and credit risk indicators for economic health assessment.',
};

export default function EconomyLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
