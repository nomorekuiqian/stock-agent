'use client';

export interface FunnelStep {
  count: number;
  label: string;
}

interface FunnelProgressProps {
  steps: FunnelStep[];
}

export default function FunnelProgress({ steps }: FunnelProgressProps) {
  if (steps.length < 2) return null;

  return (
    <div className="flex items-center gap-2 flex-wrap text-sm">
      {steps.map((step, i) => (
        <span key={i} className="flex items-center gap-2">
          <span className={`
            font-data tabular-nums
            ${i === steps.length - 1
              ? 'text-emerald-500 font-semibold'
              : 'text-muted-foreground'
            }
          `}>
            {step.count.toLocaleString()}
          </span>
          <span className="text-xs text-muted-foreground/60">{step.label}</span>
          {i < steps.length - 1 && (
            <svg className="w-3.5 h-3.5 text-muted-foreground/40" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          )}
        </span>
      ))}
    </div>
  );
}
