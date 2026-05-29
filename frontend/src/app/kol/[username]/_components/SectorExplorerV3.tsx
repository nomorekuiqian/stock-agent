'use client';

import { useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';

import { useKolCockpitSectorsV3 } from '@/hooks/queries/use-kol-data';
import SectorListV3 from './SectorListV3';
import SectorDetailV3 from './SectorDetailV3';
import IndustryChainView from './IndustryChainView';
import MacroPerspectivePanel from './MacroPerspectivePanel';

// Boards that have a dedicated industry-chain visualization instead of the
// text-framework view. Mirror of cockpit_v3.INDUSTRY_CHAIN_REGISTRY keys.
const CHAIN_BOARDS = new Set([
  'ai-infrastructure',
  'crypto-stablecoin-rwa',
  'defense-and-space',
]);

interface Props {
  username: string;
}

export default function SectorExplorerV3({ username }: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const initialKey = searchParams?.get('key') ?? null;
  const isLegacyMacroRoute = initialKey === 'macro-regime';

  const { data, isError } = useKolCockpitSectorsV3(username);
  const sectors = data?.sectors ?? null;
  const [selectedKey, setSelectedKey] = useState<string | null>(initialKey);
  const selected =
    sectors && selectedKey && sectors.some((s) => s.key === selectedKey)
      ? selectedKey
      : sectors?.find((s) => s.layer === 'sector')?.key ?? null;

  useEffect(() => {
    if (isLegacyMacroRoute) {
      router.replace(`/kol/${username}/macro`, { scroll: false });
    }
  }, [isLegacyMacroRoute, router, username]);

  function pickSector(k: string) {
    setSelectedKey(k);
    const params = new URLSearchParams(searchParams?.toString() ?? '');
    params.set('key', k);
    router.replace(`?${params.toString()}`, { scroll: false });
  }

  if (isLegacyMacroRoute) {
    return <MacroPerspectivePanel username={username} />;
  }

  if (isError) {
    return (
      <div className="py-16 text-center">
        <p className="text-sm text-destructive">无法获取板块列表 · 请检查网络或稍后重试</p>
      </div>
    );
  }

  if (!sectors) {
    return <LoadingPlaceholder />;
  }

  if (sectors.length === 0) {
    return (
      <div className="py-16 text-center font-data text-xs uppercase tracking-[0.18em] text-muted-foreground">
        这个博主还没整理出板块框架
      </div>
    );
  }

  return (
    <div className="grid gap-6 py-6 lg:grid-cols-[280px_minmax(0,1fr)] lg:gap-8 lg:py-8">
      <aside className="order-2 lg:sticky lg:top-24 lg:order-1 lg:max-h-[calc(100vh-7rem)]">
        <SectorListV3 sectors={sectors} selected={selected} onSelect={pickSector} />
      </aside>
      <div className="order-1 min-w-0 lg:order-2">
        {selected && CHAIN_BOARDS.has(selected) ? (
          <IndustryChainView username={username} boardKey={selected} />
        ) : (
          <SectorDetailV3 username={username} sectorKey={selected} />
        )}
      </div>
    </div>
  );
}

function LoadingPlaceholder() {
  return (
    <div className="grid gap-6 py-6 lg:grid-cols-[280px_minmax(0,1fr)] lg:gap-8 lg:py-8">
      <div className="space-y-2">
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="border-b border-border/30 py-3">
            <div className="h-3 w-2/3 rounded bg-muted/40" />
            <div className="mt-2 h-[2px] w-full rounded bg-muted/30" />
            <div className="mt-2 h-3 w-1/2 rounded bg-muted/30" />
          </div>
        ))}
      </div>
      <div className="space-y-5">
        <div className="h-8 w-48 rounded bg-muted/40" />
        <div className="h-4 w-72 rounded bg-muted/30" />
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="h-4 w-[90%] rounded bg-muted/30" />
          ))}
        </div>
        <div className="grid grid-cols-3 gap-3 pt-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="h-32 rounded-md bg-muted/20" />
          ))}
        </div>
      </div>
    </div>
  );
}
