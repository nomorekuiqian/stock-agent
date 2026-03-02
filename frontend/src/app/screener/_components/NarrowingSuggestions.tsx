'use client';

import type { ScreenerSuggestion } from '@/lib/api';

interface NarrowingSuggestionsProps {
  suggestions: ScreenerSuggestion[];
  onApply: (dimension: string, value: string, label: string) => void;
  onSort: (dimension: string, label: string) => void;
  loading: boolean;
}

export default function NarrowingSuggestions({
  suggestions,
  onApply,
  onSort,
  loading,
}: NarrowingSuggestionsProps) {
  if (suggestions.length === 0) return null;

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <div className="h-px flex-1 max-w-[40px] bg-gradient-to-r from-emerald-500/50 to-transparent" />
        <span className="text-xs font-medium text-muted-foreground tracking-wide">
          继续收窄
        </span>
        <div className="h-px flex-1 bg-gradient-to-l from-transparent to-border/30" />
      </div>

      {suggestions.map((s) => (
        <div key={s.dimension} className="space-y-1.5">
          <div className="flex items-center gap-2">
            <span className="text-xs font-medium text-foreground">{s.label}</span>
            {s.type === 'sort' && s.description && (
              <span className="text-xs text-muted-foreground">- {s.description}</span>
            )}
          </div>

          {s.type === 'categorical' && s.options && (
            <div className="flex flex-wrap gap-2">
              {s.options.map((opt) => (
                <button
                  key={opt.value}
                  onClick={() => onApply(s.dimension, opt.value, opt.label)}
                  disabled={loading}
                  className="
                    inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs
                    border border-border/50 bg-card
                    hover:border-emerald-500/30 hover:bg-emerald-500/[0.03]
                    transition-all duration-150
                    disabled:opacity-50 disabled:pointer-events-none
                  "
                >
                  <span className="text-foreground">{opt.label}</span>
                  {opt.count !== undefined && (
                    <span className="text-muted-foreground font-data tabular-nums">
                      {opt.count}
                    </span>
                  )}
                </button>
              ))}
            </div>
          )}

          {s.type === 'sort' && (
            <button
              onClick={() => onSort(s.dimension, s.label)}
              disabled={loading}
              className="
                inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs
                border border-border/50 bg-card
                hover:border-emerald-500/30 hover:bg-emerald-500/[0.03]
                transition-all duration-150
                disabled:opacity-50 disabled:pointer-events-none
              "
            >
              <svg className="w-3.5 h-3.5 text-emerald-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4h13M3 8h9m-9 4h9m5-4v12m0 0l-4-4m4 4l4-4" />
              </svg>
              <span className="text-foreground">{s.label}</span>
            </button>
          )}
        </div>
      ))}
    </div>
  );
}
