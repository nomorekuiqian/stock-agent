import type { Metadata } from 'next';
import { Suspense } from 'react';
import QinbafrankAgentLandingClient from './_components/FrankAgentLandingClient';

export const metadata: Metadata = {
  title: 'Qinbafrank AI 投研助手 Waitlist',
  description: 'TheMarketBrew 的 Qinbafrank AI 投研助手试用申请。查 Qinbafrank 旧观点，用他的框架看新闻、财报和股票。',
  alternates: {
    canonical: '/frank-agent',
  },
  openGraph: {
    title: 'Qinbafrank AI 投研助手 Waitlist | TheMarketBrew',
    description: '查 Qinbafrank 旧观点，用他的框架看新闻、财报和股票。',
    url: '/frank-agent',
    images: [
      {
        url: '/kol-avatars/qinbafrank.png',
        width: 400,
        height: 400,
        alt: 'Qinbafrank Agent Waitlist',
      },
    ],
  },
  twitter: {
    card: 'summary',
    title: 'Qinbafrank AI 投研助手 Waitlist | TheMarketBrew',
    description: '查旧观点，问框架，做复盘。',
    images: ['/kol-avatars/qinbafrank.png'],
  },
};

export default function QinbafrankAgentPage() {
  return (
    <Suspense fallback={<div className="min-h-[70dvh] bg-background" />}>
      <QinbafrankAgentLandingClient />
    </Suspense>
  );
}
