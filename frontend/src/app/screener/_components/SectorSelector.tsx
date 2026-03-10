'use client';

import { useState, useEffect } from 'react';
import { api, type ScreenerSector } from '@/lib/api';

interface SectorSelectorProps {
  onSelect: (sector: string) => void;
  loading: boolean;
}

export default function SectorSelector({ onSelect, loading }: SectorSelectorProps) {
  const [sectors, setSectors] = useState<ScreenerSector[]>([]);
  const [fetchError, setFetchError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    api.screener.sectors()
      .then((res) => {
        if (!cancelled && res.success) {
          setSectors(res.sectors);
        }
      })
      .catch((err) => {
        if (!cancelled) setFetchError(err.message);
      });
    return () => { cancelled = true; };
  }, []);

  if (fetchError) {
    return <p className="text-xs text-red-400">{fetchError}</p>;
  }

  if (sectors.length === 0) {
    return (
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <div className="w-3 h-3 rounded-full border border-muted-foreground/30 border-t-muted-foreground animate-spin" />
        加载板块...
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <p className="text-xs text-muted-foreground">选择板块:</p>
      <div className="flex flex-wrap gap-2">
        {sectors.map((s) => (
          <button
            key={s.value}
            onClick={() => onSelect(s.value)}
            disabled={loading}
            className="
              inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs
              border border-border/50 bg-card
              hover:border-emerald-500/30 hover:bg-emerald-500/[0.03]
              transition-all duration-150
              disabled:opacity-50 disabled:pointer-events-none
            "
          >
            <span className="text-foreground">{s.label_zh}</span>
            <span className="text-muted-foreground font-data tabular-nums">{s.count}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
