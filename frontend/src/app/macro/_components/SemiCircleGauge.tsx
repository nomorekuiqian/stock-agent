'use client';

import dynamic from 'next/dynamic';

const GaugeComponent = dynamic(() => import('react-gauge-component'), {
  ssr: false,
  loading: () => <div className="animate-pulse bg-muted/30 rounded-full" />,
});

interface SemiCircleGaugeProps {
  value: number;
  max?: number;
  size?: 'sm' | 'lg';
  sublabel?: string;
}

function getLevelZh(value: number, max: number): string {
  const ratio = value / max;
  if (ratio < 0.4) return '低风险';
  if (ratio < 0.7) return '中等风险';
  return '高风险';
}

function getLevelColor(value: number, max: number): string {
  const ratio = value / max;
  if (ratio < 0.4) return '#10b981';
  if (ratio < 0.7) return '#f59e0b';
  return '#ef4444';
}

export function SemiCircleGauge({ value, max = 10, size = 'lg', sublabel }: SemiCircleGaugeProps) {
  const clampedValue = Math.min(Math.max(value, 0), max);
  const levelColor = getLevelColor(clampedValue, max);

  if (size === 'sm') {
    return (
      <div className="flex items-center gap-2 shrink-0">
        <div className="w-[56px] h-[36px]">
          <GaugeComponent
            type="semicircle"
            value={clampedValue}
            minValue={0}
            maxValue={max}
            arc={{
              width: 0.2,
              padding: 0,
              cornerRadius: 4,
              subArcs: [
                { limit: max * 0.4, color: '#10b981' },
                { limit: max * 0.7, color: '#f59e0b' },
                { limit: max, color: '#ef4444' },
              ],
            }}
            pointer={{
              type: 'arrow',
              width: 8,
              color: '#888888',
              baseColor: '#aaaaaa',
              animationDelay: 0,
            }}
            labels={{
              valueLabel: {
                formatTextValue: (v: number) => v.toFixed(1),
                style: { fontSize: '22px', fill: 'currentColor', textShadow: 'none' },
              },
              tickLabels: { hideMinMax: true },
            }}
            style={{ width: '100%', height: '100%' }}
          />
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center">
      <div className="w-[180px] h-[110px]">
        <GaugeComponent
          type="semicircle"
          value={clampedValue}
          minValue={0}
          maxValue={max}
          arc={{
            width: 0.22,
            padding: 0.01,
            cornerRadius: 6,
            subArcs: [
              { limit: max * 0.4, color: '#10b981' },
              { limit: max * 0.7, color: '#f59e0b' },
              { limit: max, color: '#ef4444' },
            ],
          }}
          pointer={{
            type: 'needle',
            width: 15,
            color: '#ffffff',
            baseColor: '#ffffff',
            animationDelay: 200,
          }}
          labels={{
            valueLabel: {
              formatTextValue: (v: number) => v.toFixed(1),
              style: { fontSize: '36px', fill: 'currentColor', textShadow: 'none' },
            },
            tickLabels: {
              hideMinMax: false,
              ticks: [
                { value: 0 },
                { value: max / 2 },
                { value: max },
              ],
              defaultTickValueConfig: {
                style: { fontSize: '12px', fill: '#999999' },
              },
            },
          }}
          style={{ width: '100%', height: '100%' }}
        />
      </div>
      <div className="text-center -mt-1">
        <span className="text-sm font-semibold" style={{ color: levelColor }}>
          {getLevelZh(clampedValue, max)}
        </span>
        {sublabel && (
          <p className="text-xs text-muted-foreground/70 mt-0.5">{sublabel}</p>
        )}
      </div>
    </div>
  );
}
