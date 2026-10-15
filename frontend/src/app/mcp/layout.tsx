import { redirect } from 'next/navigation';
import { isFeaturePaused } from '@/lib/feature-pause';

export default function PausedFeatureLayout({ children }: { children: React.ReactNode }) {
  if (isFeaturePaused('mcp')) redirect('/research');
  return children;
}
