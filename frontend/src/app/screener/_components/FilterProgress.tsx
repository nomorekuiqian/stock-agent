'use client';

import type { FilterStep } from '../_lib/researchReducer';

export type { FilterStep };

interface FilterProgressProps {
  steps: FilterStep[];
  appliedFilters?: { field: string; op: string; value: unknown }[];
}

/** Human-readable label for filter fields */
const FIELD_LABELS: Record<string, string> = {
  market_cap_tier: '市值',
  beta_1y: '波动性',
  dividend_yield: '股息率',
  dividend_payout_years: '派息年数',
  sector: '行业',
  pe_ttm: 'PE',
  roe: 'ROE',
  revenue_growth_ttm: '营收增长',
  eps_growth_ttm: '利润增长',
  rsi: 'RSI',
  above_sma50: '趋势',
  market_cap: '市值',
  change_3m: '3月涨幅',
  position_52w: '52周位置',
};

const OP_LABELS: Record<string, string> = {
  gt: '>',
  gte: '>=',
  lt: '<',
  lte: '<=',
  eq: '=',
  neq: '!=',
  in: '=',
};

function formatFilterValue(value: unknown): string {
  if (Array.isArray(value)) return value.join(', ');
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  if (typeof value === 'number') {
    if (value >= 1e9) return `$${(value / 1e9).toFixed(0)}B`;
    return String(value);
  }
  return String(value);
}

/**
 * FilterProgress - Funnel visualization + applied filter chips.
 *
 * Shows the narrowing journey: 3,680 -> 45 -> 12 -> 5
 * with animated numbers and removable filter condition chips.
 */
export default function FilterProgress({ steps, appliedFilters }: FilterProgressProps) {
  if (steps.length === 0 && (!appliedFilters || appliedFilters.length === 0)) {
    return null;
  }

  return (
    <div className="space-y-3">
      {/* Funnel steps */}
      {steps.length > 0 && (
        <div className="flex items-center gap-2 flex-wrap text-sm">
          {steps.map((step, i) => (
            <span key={i} className="flex items-center gap-2">
              {i > 0 && (
                <svg className="w-3 h-3 text-muted-foreground/50" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M9 18l6-6-6-6" />
                </svg>
              )}
              <span
                className={`animate-number-pop font-data tabular-nums ${
                  i === steps.length - 1
                    ? 'text-primary font-medium'
                    : 'text-muted-foreground'
                }`}
                style={{ animationDelay: `${i * 100}ms` }}
              >
                {step.count.toLocaleString()}
              </span>
              {step.label && (
                <span className="text-muted-foreground/60 text-xs">{step.label}</span>
              )}
            </span>
          ))}
        </div>
      )}

      {/* Applied filter chips */}
      {appliedFilters && appliedFilters.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {appliedFilters.map((f, i) => (
            <span
              key={i}
              className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs bg-primary/8 border border-primary/15 text-primary/80"
            >
              <span>{FIELD_LABELS[f.field] || f.field}</span>
              <span className="text-primary/50">{OP_LABELS[f.op] || f.op}</span>
              <span className="font-data">{formatFilterValue(f.value)}</span>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
