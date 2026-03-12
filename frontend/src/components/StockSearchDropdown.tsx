import { Command } from 'cmdk';
import { StockSearchResult } from '@/lib/api';
import { Check, Plus, ArrowRight } from 'lucide-react';

interface StockSearchDropdownProps {
  results: StockSearchResult[];
  isSearching: boolean;
  showEmpty?: boolean;
  mode?: 'navigate' | 'add' | 'watchlist';
  inListSymbols?: string[];
  onSelect: (result: StockSearchResult) => void;
  onAdd?: (result: StockSearchResult) => void;
  atLimit?: boolean;
}

export default function StockSearchDropdown({
  results,
  isSearching,
  showEmpty = false,
  mode = 'navigate',
  inListSymbols = [],
  onSelect,
  onAdd,
  atLimit = false,
}: StockSearchDropdownProps) {
  if (!isSearching && results.length === 0 && !showEmpty) return null;

  const inListSet = mode === 'watchlist' ? new Set(inListSymbols) : null;

  return (
    <Command.List
      className="absolute left-0 right-0 mt-2 rounded-xl overflow-hidden border border-border shadow-2xl"
      style={{ maxHeight: 400, zIndex: 9999 }}
    >
      {isSearching && results.length === 0 && (
        <div className="px-4 py-3 text-sm text-muted-foreground text-center bg-popover">
          搜索中...
        </div>
      )}

      {!isSearching && results.length === 0 && showEmpty && (
        <div className="px-4 py-3 text-sm text-muted-foreground text-center bg-popover">
          无结果
        </div>
      )}

      {mode === 'watchlist'
        ? results.map((result) => {
            const inList = inListSet!.has(result.symbol);
            return (
              <Command.Item
                key={result.symbol}
                value={result.symbol}
                keywords={[result.name]}
                onSelect={() => onAdd?.(result)}
                className="flex items-center justify-between gap-2 transition-colors bg-popover data-[selected=true]:bg-accent hover:bg-accent"
              >
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onSelect(result);
                  }}
                  className="flex-1 min-w-0 px-4 py-3 text-left flex items-center gap-4"
                >
                  <span className="font-mono font-semibold text-sm text-foreground shrink-0">
                    {result.symbol}
                  </span>
                  <span className="text-sm text-muted-foreground truncate">
                    {result.name}
                  </span>
                </button>

                <div className="pr-3 shrink-0">
                  {inList ? (
                    <span className="inline-flex items-center gap-1 px-2 py-1 text-xs text-emerald-500/70">
                      <Check className="w-3 h-3" />
                      已添加
                    </span>
                  ) : (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onAdd?.(result);
                      }}
                      disabled={atLimit}
                      className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-md text-xs font-medium text-emerald-500 hover:bg-emerald-500/10 transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      <Plus className="w-3 h-3" />
                      添加
                    </button>
                  )}
                </div>
              </Command.Item>
            );
          })
        : results.map((result) => {
            const Icon = mode === 'add' ? Plus : ArrowRight;
            return (
              <Command.Item
                key={result.symbol}
                value={result.symbol}
                keywords={[result.name]}
                onSelect={() => onSelect(result)}
                className="w-full px-4 py-3 text-left flex items-center justify-between gap-3 group/item transition-colors bg-popover data-[selected=true]:bg-accent hover:bg-accent"
              >
                <div className="flex items-center gap-4 min-w-0">
                  <span className="font-mono font-semibold text-sm text-foreground shrink-0">
                    {result.symbol}
                  </span>
                  <span className="text-sm text-muted-foreground truncate group-hover/item:text-foreground/80">
                    {result.name}
                  </span>
                </div>
                <Icon className="w-4 h-4 text-emerald-500 shrink-0 opacity-0 group-hover/item:opacity-100" />
              </Command.Item>
            );
          })}
    </Command.List>
  );
}
