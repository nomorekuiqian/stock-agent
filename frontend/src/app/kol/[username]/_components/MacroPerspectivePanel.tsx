'use client';

import { useKolCockpitSector } from '@/hooks/queries/use-kol-data';
import MacroRegimeFramework from './MacroRegimeFramework';

const MACRO_REGIME_KEY = 'macro-regime';

interface Props {
  username: string;
}

export default function MacroPerspectivePanel({ username }: Props) {
  const { data: detail, isLoading, isError } = useKolCockpitSector(
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
      <div className="grid gap-4 xl:grid-cols-[300px_minmax(0,1fr)] 2xl:grid-cols-[320px_minmax(0,1fr)]">
        <div className="grid grid-cols-2 gap-2 sm:gap-3 xl:grid-cols-1">
          {Array.from({ length: 4 }).map((_, index) => (
            <div
              key={index}
              className="min-h-32 rounded-lg border border-border/40 bg-card/20 p-3 sm:min-h-36 sm:p-4 xl:min-h-0"
            >
              <div className="h-4 w-24 rounded bg-muted/35" />
              <div className="mt-4 h-3 w-16 rounded bg-muted/25" />
              <div className="mt-2 h-3 w-20 rounded bg-muted/25" />
            </div>
          ))}
        </div>
        <div className="min-h-96 rounded-lg border border-border/40 bg-card/20">
          <div className="h-1 rounded-t-lg bg-muted/35" />
          <div className="p-4 md:p-5">
            <div className="h-4 w-32 rounded bg-muted/35" />
            <div className="mt-4 h-8 w-48 rounded bg-muted/35" />
            <div className="mt-3 h-4 w-full max-w-lg rounded bg-muted/25" />
            <div className="mt-8 grid gap-5 xl:grid-cols-2">
              <div className="h-56 rounded bg-muted/20" />
              <div className="h-56 rounded bg-muted/20" />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
