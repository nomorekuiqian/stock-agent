'use client';

import { useKolCockpitSectorV3 } from '@/hooks/queries/use-kol-data';
import MacroRegimeFramework from './MacroRegimeFramework';

const MACRO_REGIME_KEY = 'macro-regime';

interface Props {
  username: string;
}

export default function MacroPerspectivePanel({ username }: Props) {
  const { data: detail, isLoading, isError } = useKolCockpitSectorV3(
    username,
    MACRO_REGIME_KEY,
  );

  if (isError) {
    return (
      <div className="py-20 text-center">
        <p className="text-sm text-destructive">无法获取宏观视角 · 请检查网络或稍后重试</p>
      </div>
    );
  }

  if (isLoading || !detail) {
    return <MacroPerspectiveSkeleton />;
  }

  return <MacroRegimeFramework detail={detail} username={username} />;
}

function MacroPerspectiveSkeleton() {
  return (
    <div className="space-y-6 pb-10">
      <div className="rounded-lg border border-border/45 bg-card/25 p-5 md:p-6">
        <div className="h-4 w-28 rounded bg-muted/40" />
        <div className="mt-4 h-9 w-56 rounded bg-muted/40" />
        <div className="mt-3 h-4 w-full max-w-2xl rounded bg-muted/30" />
        <div className="mt-2 h-4 w-2/3 rounded bg-muted/30" />
      </div>
      <div className="grid gap-4 lg:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)]">
        <div className="h-72 rounded-lg border border-border/40 bg-card/20" />
        <div className="h-72 rounded-lg border border-border/40 bg-card/20" />
      </div>
    </div>
  );
}
