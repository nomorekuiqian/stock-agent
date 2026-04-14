interface MetricRowProps {
  label: string;
  value: string;
  change?: number | null;
  changePeriod?: string;
}

export function MetricRow({ label, value, change, changePeriod }: MetricRowProps) {
  const hasChange = change != null;
  const isPositive = hasChange && change >= 0;

  return (
    <div className="flex items-baseline justify-between py-1.5 group">
      <span className="text-sm text-muted-foreground group-hover:text-foreground transition-colors">
        {label}
      </span>
      <div className="flex items-baseline gap-2">
        <span className="text-sm font-data font-semibold text-foreground tabular-nums">{value}</span>
        {hasChange && (
          <span className={`text-xs font-data font-medium tabular-nums ${isPositive ? 'text-emerald-500' : 'text-red-500'}`}>
            {isPositive ? '+' : ''}{change.toFixed(1)}%
            {changePeriod && <span className="text-muted-foreground/70 ml-0.5">{changePeriod}</span>}
          </span>
        )}
      </div>
    </div>
  );
}
