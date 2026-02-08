import { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Market Sentiment - TheMarketBrew',
  description: 'CNN Fear & Greed Index, VIX, Put/Call Ratio, market breadth and credit spreads for sentiment analysis.',
};

export default function SentimentLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
