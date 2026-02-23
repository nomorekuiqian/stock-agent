'use client';

import { SIGNAL_LABELS, SIGNAL_COLORS } from './constants';

interface SignalCardProps {
  label: string;
  signal: string;
  score?: number | null;
}

export function SignalCard({ label, signal, score }: SignalCardProps) {
  const colors = SIGNAL_COLORS[signal] || SIGNAL_COLORS.NEUTRAL;
  const zhLabel = SIGNAL_LABELS[signal] || signal;

  return (
    <div className={`p-3 rounded-lg border ${colors.bg} ${colors.border} transition-colors`}>
      <div className="text-xs text-muted-foreground mb-1.5">{label}</div>
      <div className="flex items-center gap-2">
        <span className={`w-2 h-2 rounded-full ${colors.dot}`} />
        <span className={`text-sm font-medium ${colors.text}`}>{zhLabel}</span>
      </div>
      {score !== null && score !== undefined && (
        <div className="mt-1.5">
          <div className="h-1 bg-muted/50 rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full transition-all duration-500 ${
                score > 0 ? 'bg-emerald-500/60' : score < 0 ? 'bg-red-500/60' : 'bg-amber-500/60'
              }`}
              style={{ width: `${Math.min(Math.abs(score) * 50 + 50, 100)}%` }}
            />
          </div>
        </div>
      )}
    </div>
  );
}
