interface ScoreBarProps {
  /** Raw risk score 0-10 (high = bad). Displayed inverted as health score (high = good). */
  value: number;
  max?: number;
  showLabel?: boolean;
}

function getHealthLevel(health: number, max: number): { label: string; color: string } {
  const ratio = health / max;
  if (ratio >= 0.7) return { label: '状态良好', color: 'text-emerald-500' };
  if (ratio >= 0.4) return { label: '需要关注', color: 'text-amber-500' };
  return { label: '风险偏高', color: 'text-red-500' };
}

export function ScoreBar({ value, max = 10, showLabel = true }: ScoreBarProps) {
  // Invert: risk score -> health score (high = good)
  const health = Math.min(Math.max(max - value, 0), max);
  const pct = (health / max) * 100;
  const level = getHealthLevel(health, max);

  return (
    <div className="flex items-center gap-3">
      {/* Health score number */}
      <div className="flex items-baseline gap-0.5 shrink-0">
        <span className={`text-lg font-data font-bold tabular-nums ${level.color}`}>{health.toFixed(1)}</span>
        <span className="text-xs text-muted-foreground/50">/{max}</span>
      </div>

      {/* Bar: left=bad(red), right=good(green) */}
      <div className="flex-1 min-w-0">
        <div className="relative h-2 rounded-full bg-muted/30 overflow-hidden">
          {/* Gradient: red -> yellow -> green */}
          <div className="absolute inset-0 rounded-full opacity-30"
            style={{ background: 'linear-gradient(to right, #ef4444, #f59e0b, #10b981)' }}
          />
          {/* Indicator dot */}
          <div
            className="absolute top-1/2 -translate-y-1/2 w-3 h-3 rounded-full border-2 border-background shadow-md transition-all duration-700 ease-out"
            style={{
              left: `calc(${pct}% - 6px)`,
              backgroundColor: pct >= 70 ? '#10b981' : pct >= 40 ? '#f59e0b' : '#ef4444',
            }}
          />
        </div>
        {showLabel && (
          <div className="flex justify-between mt-1">
            <span className={`text-xs font-medium ${level.color}`}>{level.label}</span>
          </div>
        )}
      </div>
    </div>
  );
}
