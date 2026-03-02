'use client';

export interface AppliedFilter {
  id: string;
  label: string;
  // For reconstructing: strategy name or filter field
  type: 'strategy' | 'narrowing';
  // The original filter data (for re-applying after removal)
  filterData?: Record<string, unknown>;
}

interface AppliedFiltersProps {
  filters: AppliedFilter[];
  onRemove: (id: string) => void;
  onClearAll: () => void;
}

export default function AppliedFilters({ filters, onRemove, onClearAll }: AppliedFiltersProps) {
  if (filters.length === 0) return null;

  return (
    <div className="flex items-center gap-2 flex-wrap">
      {filters.map((f) => (
        <span
          key={f.id}
          className={`
            inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium
            transition-colors duration-150
            ${f.type === 'strategy'
              ? 'bg-emerald-500/10 text-emerald-500 border border-emerald-500/20'
              : 'bg-muted/50 text-foreground border border-border/50'
            }
          `}
        >
          {f.label}
          <button
            onClick={() => onRemove(f.id)}
            className="ml-0.5 p-0.5 rounded-full hover:bg-foreground/10 transition-colors"
            aria-label={`Remove ${f.label}`}
          >
            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </span>
      ))}
      {filters.length > 1 && (
        <button
          onClick={onClearAll}
          className="text-xs text-muted-foreground hover:text-foreground transition-colors px-2 py-1"
        >
          清除全部
        </button>
      )}
    </div>
  );
}
