import { StockSearchResult } from '@/lib/api';
import { Check, Plus, ArrowRight } from 'lucide-react';

const DROPDOWN_STYLE = { zIndex: 9999, backgroundColor: 'var(--popover)' } as const;
const POPOVER_BG = { backgroundColor: 'var(--popover)' } as const;

function DropdownShell({ role, children }: { role?: string; children: React.ReactNode }) {
  return (
    <div
      className="absolute left-0 right-0 mt-2 rounded-xl overflow-hidden border border-border shadow-2xl"
      style={DROPDOWN_STYLE}
      role={role}
    >
      {children}
    </div>
  );
}

function DropdownMessage({ text }: { text: string }) {
  return (
    <DropdownShell>
      <div className="px-4 py-3 text-sm text-muted-foreground text-center">
        {text}
      </div>
    </DropdownShell>
  );
}

interface StockSearchDropdownProps {
  results: StockSearchResult[];
  highlightedIndex: number;
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
  highlightedIndex,
  isSearching,
  showEmpty = false,
  mode = 'navigate',
  inListSymbols = [],
  onSelect,
  onAdd,
  atLimit = false,
}: StockSearchDropdownProps) {
  if (isSearching && results.length === 0) {
    return <DropdownMessage text="搜索中..." />;
  }

  if (results.length === 0) {
    if (!showEmpty) return null;
    return <DropdownMessage text="无结果" />;
  }

  if (mode === 'watchlist') {
    const inListSet = new Set(inListSymbols);

    return (
      <DropdownShell role="listbox">
        <div className="max-h-[400px] overflow-y-auto" style={POPOVER_BG}>
          {results.map((result, index) => {
            const inList = inListSet.has(result.symbol);

            return (
              <div
                key={result.symbol}
                role="option"
                aria-selected={index === highlightedIndex}
                className={`flex items-center justify-between gap-2 transition-colors ${
                  index === highlightedIndex ? 'bg-accent' : ''
                } hover:bg-accent`}
                style={index !== highlightedIndex ? POPOVER_BG : undefined}
              >
                <button
                  onClick={() => onSelect(result)}
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
              </div>
            );
          })}
        </div>
      </DropdownShell>
    );
  }

  const Icon = mode === 'add' ? Plus : ArrowRight;

  return (
    <DropdownShell role="listbox">
      <div className="max-h-[400px] overflow-y-auto" style={POPOVER_BG}>
        {results.map((result, index) => (
          <button
            key={result.symbol}
            role="option"
            aria-selected={index === highlightedIndex}
            onClick={() => onSelect(result)}
            className={`w-full px-4 py-3 text-left flex items-center justify-between gap-3 group/item transition-colors ${
              index === highlightedIndex ? 'bg-accent' : ''
            } hover:bg-accent`}
            style={index !== highlightedIndex ? POPOVER_BG : undefined}
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
          </button>
        ))}
      </div>
    </DropdownShell>
  );
}
