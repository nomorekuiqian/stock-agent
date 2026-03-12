'use client';

import * as Popover from '@radix-ui/react-popover';
import { ChevronDown, Check, Bell, TrendingUp } from 'lucide-react';
import { useState } from 'react';

export interface SectorOption {
  id: string;
  name_en: string;
  name_zh: string;
  description: string;
  symbols: string[];
  symbol_count: number;
}

interface SectorSelectorProps {
  sectors: SectorOption[];
  selectedSectorId: string | null;
  onSelect: (sectorId: string) => void;
  subscribedSectorIds?: string[];
  loading?: boolean;
}

export function SectorSelector({
  sectors,
  selectedSectorId,
  onSelect,
  subscribedSectorIds = [],
  loading = false,
}: SectorSelectorProps) {
  const [open, setOpen] = useState(false);
  const selectedSector = sectors.find((s) => s.id === selectedSectorId);

  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Trigger asChild>
        <button
          disabled={loading}
          className="flex items-center gap-3 px-4 py-3 bg-card border border-border/50 rounded-xl transition-all hover:border-emerald-500/30 hover:bg-card/80 min-w-[280px] disabled:opacity-50"
        >
          <div className="flex items-center justify-center w-10 h-10 rounded-lg bg-emerald-500/10 border border-emerald-500/20">
            <TrendingUp className="w-5 h-5 text-emerald-400" />
          </div>
          <div className="flex-1 text-left">
            <div className="text-sm text-muted-foreground">{loading ? '...' : ''}</div>
            <div className="font-medium text-foreground">
              {loading ? '...' : selectedSector ? selectedSector.name_zh : ''}
            </div>
            {selectedSector && (
              <div className="text-xs text-muted-foreground mt-0.5">
                {selectedSector.symbol_count}
              </div>
            )}
          </div>
          <ChevronDown
            className={`w-5 h-5 text-muted-foreground transition-transform ${open ? 'rotate-180' : ''}`}
          />
        </button>
      </Popover.Trigger>

      <Popover.Portal>
        <Popover.Content
          align="start"
          sideOffset={8}
          className="w-[480px] max-h-[70vh] overflow-y-auto bg-card border border-border/50 rounded-xl shadow-2xl shadow-black/20 z-50 data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95"
        >
          <div className="p-3 border-b border-border/50">
            <div className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
              {sectors.length}
            </div>
          </div>

          <div className="p-2">
            {sectors.map((sector) => {
              const isSelected = sector.id === selectedSectorId;
              const isSubscribed = subscribedSectorIds.includes(sector.id);

              return (
                <button
                  key={sector.id}
                  onClick={() => {
                    onSelect(sector.id);
                    setOpen(false);
                  }}
                  className={`w-full text-left p-4 rounded-lg transition-all mb-1 last:mb-0 ${
                    isSelected
                      ? 'bg-emerald-500/10 border border-emerald-500/30'
                      : 'hover:bg-card/80 border border-transparent hover:border-border/50'
                  }`}
                >
                  {/* Header Row */}
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-foreground">{sector.name_zh}</span>
                      <span className="text-xs text-muted-foreground">{sector.name_en}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      {isSubscribed && (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                          <Bell className="w-3 h-3" />
                        </span>
                      )}
                      {isSelected && <Check className="w-4 h-4 text-emerald-400" />}
                    </div>
                  </div>

                  {/* Description */}
                  <p className="text-sm text-muted-foreground mb-3 line-clamp-2">
                    {sector.description}
                  </p>

                  {/* Stock Tags */}
                  <div className="flex flex-wrap gap-1.5">
                    {sector.symbols.slice(0, 8).map((symbol) => (
                      <span
                        key={symbol}
                        className="px-2 py-0.5 text-xs font-data bg-card border border-border/50 rounded text-muted-foreground"
                      >
                        {symbol}
                      </span>
                    ))}
                    {sector.symbols.length > 8 && (
                      <span className="px-2 py-0.5 text-xs text-muted-foreground">
                        +{sector.symbols.length - 8}
                      </span>
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
