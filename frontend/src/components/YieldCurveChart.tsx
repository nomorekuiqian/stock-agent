'use client';

import { useMemo } from 'react';
import type { TreasuryRate } from '@/lib/api';

const TENORS = ['1M', '2M', '3M', '6M', '1Y', '2Y', '3Y', '5Y', '7Y', '10Y', '20Y', '30Y'];

const SHAPE_LABELS: Record<string, { text: string; color: string }> = {
  normal: { text: 'Normal', color: 'text-emerald-400' },
  flat: { text: 'Flat', color: 'text-amber-400' },
  inverted: { text: 'Inverted', color: 'text-red-400' },
  unknown: { text: '--', color: 'text-muted-foreground' },
};

const SHAPE_STROKE: Record<string, string> = {
  normal: '#34d399',
  flat: '#fbbf24',
  inverted: '#f87171',
  unknown: '#6b7280',
};

interface YieldCurveChartProps {
  rates: Record<string, TreasuryRate>;
  shape: string;
  date: string | null;
}

export function YieldCurveChart({ rates, shape, date }: YieldCurveChartProps) {
  const points = useMemo(() => {
    return TENORS.map((tenor) => ({
      tenor,
      rate: rates[tenor]?.rate ?? null,
      change: rates[tenor]?.daily_change_bps ?? null,
    })).filter((p) => p.rate !== null) as { tenor: string; rate: number; change: number | null }[];
  }, [rates]);

  if (points.length === 0) return null;

  const allRates = points.map((p) => p.rate);
  const minRate = Math.min(...allRates);
  const maxRate = Math.max(...allRates);
  const rateRange = maxRate - minRate || 0.5;

  // SVG dimensions
  const width = 800;
  const height = 280;
  const padLeft = 52;
  const padRight = 24;
  const padTop = 28;
  const padBottom = 48;

  const plotW = width - padLeft - padRight;
  const plotH = height - padTop - padBottom;

  // Y axis: add 10% padding on both sides
  const yMin = minRate - rateRange * 0.15;
  const yMax = maxRate + rateRange * 0.15;
  const yRange = yMax - yMin || 1;

  const toX = (i: number) => padLeft + (i / (points.length - 1)) * plotW;
  const toY = (rate: number) => padTop + plotH - ((rate - yMin) / yRange) * plotH;

  // Build SVG path
  const pathD = points
    .map((p, i) => `${i === 0 ? 'M' : 'L'} ${toX(i).toFixed(1)} ${toY(p.rate).toFixed(1)}`)
    .join(' ');

  // Y-axis grid lines (5 ticks)
  const yTicks: number[] = [];
  const tickStep = yRange / 4;
  for (let i = 0; i <= 4; i++) {
    yTicks.push(yMin + tickStep * i);
  }

  const strokeColor = SHAPE_STROKE[shape] || SHAPE_STROKE.unknown;
  const shapeLabel = SHAPE_LABELS[shape] || SHAPE_LABELS.unknown;

  return (
    <div className="bg-card/60 rounded-xl border border-border/40 p-4">
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <div>
          <h4 className="text-sm font-medium text-foreground">
            U.S. Treasury Yield Curve
          </h4>
          {date && (
            <p className="text-xs text-muted-foreground mt-0.5">{date}</p>
          )}
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">Shape:</span>
          <span className={`text-sm font-medium font-data ${shapeLabel.color}`}>
            {shapeLabel.text}
          </span>
        </div>
      </div>

      {/* Chart */}
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="w-full"
        style={{ maxHeight: 280 }}
      >
        {/* Y-axis grid lines */}
        {yTicks.map((tick) => (
          <g key={tick}>
            <line
              x1={padLeft}
              y1={toY(tick)}
              x2={width - padRight}
              y2={toY(tick)}
              stroke="currentColor"
              strokeOpacity={0.08}
              strokeDasharray="4 4"
            />
            <text
              x={padLeft - 8}
              y={toY(tick) + 4}
              textAnchor="end"
              className="fill-muted-foreground"
              fontSize={11}
              fontFamily="var(--font-data)"
            >
              {tick.toFixed(2)}%
            </text>
          </g>
        ))}

        {/* Curve line */}
        <path
          d={pathD}
          fill="none"
          stroke={strokeColor}
          strokeWidth={2.5}
          strokeLinecap="round"
          strokeLinejoin="round"
        />

        {/* Area fill */}
        <path
          d={`${pathD} L ${toX(points.length - 1).toFixed(1)} ${(padTop + plotH).toFixed(1)} L ${padLeft.toFixed(1)} ${(padTop + plotH).toFixed(1)} Z`}
          fill={strokeColor}
          fillOpacity={0.06}
        />

        {/* Data points + labels */}
        {points.map((p, i) => (
          <g key={p.tenor}>
            {/* Point */}
            <circle
              cx={toX(i)}
              cy={toY(p.rate)}
              r={4}
              fill="var(--background)"
              stroke={strokeColor}
              strokeWidth={2}
            />

            {/* Rate value above point */}
            <text
              x={toX(i)}
              y={toY(p.rate) - 12}
              textAnchor="middle"
              className="fill-foreground"
              fontSize={10}
              fontFamily="var(--font-data)"
              fontWeight={600}
            >
              {p.rate.toFixed(2)}
            </text>

            {/* Tenor label below */}
            <text
              x={toX(i)}
              y={padTop + plotH + 18}
              textAnchor="middle"
              className="fill-muted-foreground"
              fontSize={10}
              fontFamily="var(--font-data)"
            >
              {p.tenor}
            </text>

            {/* Daily change in bps */}
            {p.change !== null && (
              <text
                x={toX(i)}
                y={padTop + plotH + 34}
                textAnchor="middle"
                fill={p.change > 0 ? '#f87171' : p.change < 0 ? '#34d399' : '#9ca3af'}
                fontSize={9}
                fontFamily="var(--font-data)"
              >
                {p.change > 0 ? '+' : ''}{p.change.toFixed(1)}bp
              </text>
            )}
          </g>
        ))}
      </svg>
    </div>
  );
}
