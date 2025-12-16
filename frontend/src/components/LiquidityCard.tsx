'use client';

interface LiquidityCardProps {
  title: string;
  value: string;
  change?: number;
  changeLabel?: string;
  unit?: string;
  description?: string;
  loading?: boolean;
  highlight?: boolean;
}

export function LiquidityCard({
  title,
  value,
  change,
  changeLabel,
  unit = '',
  description,
  loading = false,
  highlight = false,
}: LiquidityCardProps) {
  const isPositive = change !== undefined && change >= 0;

  if (loading) {
    return (
      <div className={`bg-card rounded-xl border border-border p-4 ${highlight ? 'ring-1 ring-emerald-500/50' : ''}`}>
        <div className="animate-pulse">
          <div className="h-3 w-20 bg-muted rounded mb-2" />
          <div className="h-8 w-24 bg-muted rounded mb-1" />
          <div className="h-3 w-16 bg-muted rounded" />
        </div>
      </div>
    );
  }

  return (
    <div className={`bg-card rounded-xl border border-border p-4 transition-all hover:border-emerald-500/30 ${highlight ? 'ring-1 ring-emerald-500/50 bg-emerald-500/5' : ''}`}>
      <p className="text-xs text-muted-foreground mb-1">{title}</p>
      <p className="text-2xl font-bold text-foreground tracking-tight">
        {value}
        {unit && <span className="text-sm font-normal text-muted-foreground ml-1">{unit}</span>}
      </p>
      {change !== undefined && (
        <div className="flex items-center gap-1 mt-1">
          <span className={`text-sm font-medium ${isPositive ? 'text-emerald-500' : 'text-red-500'}`}>
            {isPositive ? '+' : ''}{change.toFixed(2)}%
          </span>
          {changeLabel && (
            <span className="text-xs text-muted-foreground">{changeLabel}</span>
          )}
        </div>
      )}
      {description && (
        <p className="text-xs text-muted-foreground mt-2">{description}</p>
      )}
    </div>
  );
}
