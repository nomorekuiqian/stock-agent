'use client';

import { useState } from 'react';
import type { ReactNode } from 'react';
import Link from 'next/link';
import ReactMarkdown from 'react-markdown';

export interface MetricTrend {
  type: 'daily' | 'weekly' | 'monthly' | 'quarterly';
  direction?: 'up' | 'down' | 'flat';
  label?: string;
}

export interface MetricItem {
  key: string;
  label: string;
  value: string;
  trend?: MetricTrend;
  chart?: ReactNode;
}

const DIRECTION_ARROWS: Record<string, { icon: string; color: string }> = {
  up: { icon: '\u2191', color: 'text-emerald-500' },
  down: { icon: '\u2193', color: 'text-red-500' },
  flat: { icon: '\u2192', color: 'text-muted-foreground/70' },
};

function TrendBadge({ trend }: { trend: MetricTrend }) {
  if (trend.label) {
    const dir = DIRECTION_ARROWS[trend.direction ?? 'flat'];
    return (
      <span className={`text-xs font-data ${dir.color}`}>
        {trend.label}
      </span>
    );
  }
  if (trend.direction) {
    const dir = DIRECTION_ARROWS[trend.direction];
    return <span className={`text-xs ${dir.color}`}>{dir.icon}</span>;
  }
  return null;
}

interface MacroQuadrantProps {
  title: string;
  subtitle?: string | null;
  detailHref: string;
  detailLabel?: string;
  metrics: MetricItem[];
  defaultChart?: string;
  aiText?: string | null;
  loading?: boolean;
}

function QuadrantSkeleton() {
  return (
    <div className="rounded-xl border border-border/40 bg-card/60 p-5 animate-pulse">
      <div className="flex items-center justify-between mb-2">
        <div className="h-5 w-28 bg-muted rounded" />
        <div className="h-8 w-24 bg-muted rounded-lg" />
      </div>
      <div className="h-4 w-3/4 bg-muted/50 rounded mb-4" />
      <div className="flex gap-2 mb-3">
        {[0, 1, 2].map((i) => (
          <div key={i} className="h-14 flex-1 bg-muted/30 rounded-lg" />
        ))}
      </div>
      <div className="h-[200px] bg-muted/20 rounded-lg mb-3" />
      <div className="h-16 bg-muted/20 rounded-lg" />
    </div>
  );
}

export function MacroQuadrant({
  title,
  subtitle,
  detailHref,
  detailLabel = '深入分析',
  metrics,
  defaultChart,
  aiText,
  loading,
}: MacroQuadrantProps) {
  const firstChartKey = defaultChart || metrics.find(m => m.chart)?.key || '';
  const [activeChart, setActiveChart] = useState(firstChartKey);

  if (loading) return <QuadrantSkeleton />;

  const activeMetric = metrics.find(m => m.key === activeChart);
  const chartNode = activeMetric?.chart || null;

  return (
    <div className="rounded-xl border border-border/40 bg-card/60 overflow-hidden flex flex-col">
      {/* Header - clickable */}
      <Link href={detailHref} className="block px-5 pt-4 pb-3 group hover:bg-muted/20 transition-colors">
        <div className="flex items-center justify-between mb-1">
          <h3 className="text-base font-semibold text-foreground tracking-tight group-hover:text-primary transition-colors">
            {title}
          </h3>
          <span className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium bg-primary/10 text-primary group-hover:bg-primary/20 transition-colors">
            {detailLabel}
            <svg className="w-4 h-4 group-hover:translate-x-0.5 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </span>
        </div>
        {subtitle && (
          <p className="text-sm text-muted-foreground leading-relaxed">{subtitle}</p>
        )}
      </Link>

      {/* Metric tabs - horizontal row of small buttons */}
      <div className="px-4 pb-2 flex gap-2 overflow-x-auto">
        {metrics.map((m) => {
          const isActive = m.key === activeChart;
          const hasChart = !!m.chart;
          return (
            <button
              key={m.key}
              type="button"
              onClick={() => hasChart && setActiveChart(m.key)}
              disabled={!hasChart}
              className={`flex-1 min-w-0 px-3 py-2 rounded-lg text-left transition-all ${
                isActive
                  ? 'bg-primary/10 border border-primary/30 shadow-sm'
                  : hasChart
                    ? 'bg-muted/20 border border-transparent hover:bg-muted/40 cursor-pointer'
                    : 'bg-muted/10 border border-transparent opacity-60'
              }`}
            >
              <div className="flex items-baseline gap-1.5">
                <span className="text-sm font-data font-bold text-foreground tabular-nums">{m.value}</span>
                {m.trend && <TrendBadge trend={m.trend} />}
              </div>
              <span className={`text-xs ${isActive ? 'text-primary' : 'text-muted-foreground/70'} line-clamp-1 flex items-center gap-1`}>
                {m.label}
                {hasChart && !isActive && (
                  <span className="w-1 h-1 rounded-full bg-primary/50 shrink-0" aria-hidden="true" />
                )}
              </span>
            </button>
          );
        })}
      </div>

      {/* Chart area - full width */}
      <div className="px-3 pb-2">
        {activeMetric && metrics.filter(m => m.chart).length > 1 && (
          <p className="px-2 pb-1.5 text-xs text-muted-foreground">
            正在看 <span className="text-foreground/80 font-medium">{activeMetric.label}</span> 的历史趋势 · 点击上方切换其他指标
          </p>
        )}
        <div className="h-[200px] overflow-hidden rounded-lg">
          {chartNode || (
            <div className="h-full w-full flex items-center justify-center text-sm text-muted-foreground">
              选择指标查看趋势
            </div>
          )}
        </div>
      </div>

      {/* AI analysis text */}
      {aiText && (
        <div className="px-5 py-3 border-t border-border/20">
          <div className="text-sm text-foreground/70 leading-7 [&_strong]:text-foreground [&_strong]:font-semibold [&_p]:mb-2 [&_p:last-child]:mb-0">
            <ReactMarkdown>{aiText}</ReactMarkdown>
          </div>
        </div>
      )}
    </div>
  );
}
