import { redirect } from 'next/navigation';
import { isFeaturePaused } from '@/lib/feature-pause';

export default function PausedFeatureLayout({ children }: { children: React.ReactNode }) {
  if (isFeaturePaused('portfolio_health')) redirect('/for-you');
  return children;
}
