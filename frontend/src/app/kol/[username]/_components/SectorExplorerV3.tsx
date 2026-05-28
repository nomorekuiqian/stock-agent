'use client';

import { useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';

import { api, type KolSectorV3Summary } from '@/lib/api';
import SectorListV3 from './SectorListV3';
import SectorDetailV3 from './SectorDetailV3';
import IndustryChainView from './IndustryChainView';

// Boards that have a dedicated industry-chain visualization instead of the
// text-framework view. Mirror of cockpit_v3.INDUSTRY_CHAIN_REGISTRY keys.
const CHAIN_BOARDS = new Set([
  'ai-infrastructure',
  'crypto-stablecoin-rwa',
  'defense-and-space',
  'software-ai-disruption',
]);

interface Props {
  username: string;
}

export default function SectorExplorerV3({ username }: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const initialKey = searchParams?.get('key') ?? null;

  const [sectors, setSectors] = useState<KolSectorV3Summary[] | null>(null);
  const [selected, setSelected] = useState<string | null>(initialKey);
  const [listError, setListError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    api.kolResearch
      .cockpitSectorsV3(username)
      .then((res) => {
        if (cancelled) return;
        setSectors(res.sectors);
        setSelected((cur) => {
          if (cur && res.sectors.some((s) => s.key === cur)) return cur;
          return res.sectors[0]?.key ?? null;
        });
      })
      .catch(() => {
        if (!cancelled) setListError(true);
      });
    return () => {
      cancelled = true;
    };
  }, [username]);

  function pickSector(k: string) {
    setSelected(k);
    const params = new URLSearchParams(searchParams?.toString() ?? '');
    params.set('key', k);
    router.replace(`?${params.toString()}`, { scroll: false });
  }

  if (listError) {
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
      <div className="py-16 text-center font-data text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
        这个博主还没有 v3 板块蒸馏数据
      </div>
    );
  }

  return (
    <div className="grid gap-6 py-6 lg:grid-cols-[280px_minmax(0,1fr)] lg:gap-8 lg:py-8">
      <aside className="lg:sticky lg:top-24 lg:max-h-[calc(100vh-7rem)]">
        <SectorListV3 sectors={sectors} selected={selected} onSelect={pickSector} />
      </aside>
      <div className="min-w-0">
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
