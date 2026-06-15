'use client';

interface Props {
  values: number[];
  width?: number;
  height?: number;
  /** Tailwind color class for the stroke (e.g. 'stroke-primary'). */
  strokeClass?: string;
  /** Whether to draw a filled area beneath the line. */
  fill?: boolean;
  /** Adjusts y-baseline if you want a single flat 0 line for empty data. */
  emptyHint?: string;
}

/**
 * Tiny inline SVG sparkline. No deps, no charts library. Values normalized
 * to [min, max] within the box. Sparse data (all zeros) renders as a flat
 * baseline.
 */
export default function SparklineMini({
  values,
  width = 140,
  height = 28,
  strokeClass = 'stroke-primary',
  fill = false,
  emptyHint,
}: Props) {
  if (!values.length) {
    return (
      <div
        className="flex items-center justify-center font-data text-micro uppercase tracking-wider text-muted-foreground/70"
        style={{ width, height }}
      >
        {emptyHint ?? '—'}
      </div>
    );
  }

  const max = Math.max(...values);
  const min = Math.min(...values);
  const range = max - min;

  // Render flat line at baseline when all values are the same (incl. all zero)
  const yFor = (v: number) => {
    if (range === 0) return height - 4;
    return height - 4 - ((v - min) / range) * (height - 8);
  };

  const stepX = values.length > 1 ? (width - 4) / (values.length - 1) : 0;
  const points = values.map((v, i) => `${2 + i * stepX},${yFor(v)}`);
  const pathD = `M ${points.join(' L ')}`;
  const areaD = `M 2,${height - 2} L ${points.join(' L ')} L ${width - 2},${height - 2} Z`;

  const allZero = max === 0;

  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} className="block">
      {fill && !allZero ? (
        <path
          d={areaD}
          className={`${strokeClass} fill-current`}
          fillOpacity={0.12}
          stroke="none"
        />
      ) : null}
      <path
        d={pathD}
        className={strokeClass}
        fill="none"
        strokeWidth={1.25}
        strokeLinejoin="round"
        strokeLinecap="round"
        opacity={allZero ? 0.25 : 1}
      />
      {/* End-point dot */}
      {!allZero && values.length > 0 ? (
        <circle
          cx={2 + (values.length - 1) * stepX}
          cy={yFor(values[values.length - 1])}
          r={1.5}
          className={`${strokeClass} fill-current`}
        />
      ) : null}
    </svg>
  );
}
