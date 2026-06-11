import type { Metadata } from 'next';
import { Suspense } from 'react';
import FrankAgentLandingClient from './_components/FrankAgentLandingClient';

export const metadata: Metadata = {
  title: 'Frank AI 投研助手 Beta',
  description: 'TheMarketBrew 的 Frank AI 投研助手。查 Frank 旧观点，用他的框架看新闻、财报和股票。',
  alternates: {
    canonical: '/frank-agent',
  },
  openGraph: {
    title: 'Frank AI 投研助手 Beta | TheMarketBrew',
    description: '查 Frank 旧观点，用他的框架看新闻、财报和股票。',
    url: '/frank-agent',
    images: [
      {
        url: '/kol-avatars/qinbafrank.png',
        width: 400,
        height: 400,
        alt: 'Frank Agent Beta',
      },
    ],
  },
  twitter: {
    card: 'summary',
    title: 'Frank AI 投研助手 Beta | TheMarketBrew',
    description: '查旧观点，问框架，做复盘。',
    images: ['/kol-avatars/qinbafrank.png'],
  },
};

export default function FrankAgentPage() {
  return (
    <Suspense fallback={<div className="min-h-[70dvh] bg-background" />}>
      <FrankAgentLandingClient />
    </Suspense>
  );
}
