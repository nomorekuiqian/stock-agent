'use client';

interface IndicatorBarProps {
  name: string;
  value: number | null | undefined;
  min: number;
  max: number;
  zones?: { value: number; label?: string }[];
  format?: (v: number) => string;
  interpretation?: string;
}

export function IndicatorBar({ name, value, min, max, zones = [], format, interpretation }: IndicatorBarProps) {
  if (value === null || value === undefined) return null;

  const range = max - min;
  const position = Math.min(Math.max(((value - min) / range) * 100, 0), 100);

  let barColor = 'bg-foreground/60';
  if (name === 'RSI') {
    if (value > 70) barColor = 'bg-red-400';
    else if (value < 30) barColor = 'bg-emerald-400';
    else barColor = 'bg-amber-400';
  } else if (name === 'ADX') {
    if (value > 25) barColor = 'bg-emerald-400';
    else if (value > 20) barColor = 'bg-amber-400';
    else barColor = 'bg-muted-foreground/40';
  }

  const displayValue = format ? format(value) : value.toFixed(1);

  return (
    <div className="space-y-1.5">
      {/* Label + value: text-sm, foreground/90 */}
      <div className="flex items-center justify-between">
        <span className="text-sm text-foreground/90">{name}</span>
        <span className="text-sm font-data font-medium text-foreground">{displayValue}</span>
      </div>
      {/* Bar */}
      <div className="relative h-1.5 bg-muted/40 rounded-full overflow-visible">
        {zones.map((zone, i) => {
          const zonePos = ((zone.value - min) / range) * 100;
          return (
            <div
              key={i}
              className="absolute top-0 w-px h-1.5 bg-muted-foreground/30"
              style={{ left: `${zonePos}%` }}
            />
          );
        })}
        <div
          className={`absolute top-0 left-0 h-full rounded-full transition-all duration-500 ${barColor}`}
          style={{ width: `${position}%` }}
        />
        <div
          className={`absolute top-1/2 -translate-y-1/2 w-2.5 h-2.5 rounded-full border-2 border-background shadow-sm transition-all duration-500 ${barColor}`}
          style={{ left: `calc(${position}% - 5px)` }}
        />
      </div>
      {/* Zone labels: text-micro */}
      {zones.length > 0 && (
        <div className="flex justify-between text-micro text-muted-foreground/70">
          <span>{min}</span>
          {zones.map((zone, i) => (
            <span key={i}>{zone.label || zone.value}</span>
          ))}
          <span>{max}</span>
        </div>
      )}
      {/* Interpretation: text-xs, muted-foreground */}
      {interpretation && (
        <p className="text-xs text-muted-foreground leading-relaxed">
          {interpretation}
        </p>
      )}
    </div>
  );
}
