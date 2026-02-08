import { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Macro Risk Monitor - TheMarketBrew',
  description: 'Monitor economic deterioration, credit risk, employment, and AI sector health in real-time.',
};

export default function MacroRiskLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
