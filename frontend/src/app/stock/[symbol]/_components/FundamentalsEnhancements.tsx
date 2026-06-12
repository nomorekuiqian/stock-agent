'use client';

import { useMemo } from 'react';
import { formatCurrencyAmount } from '@/lib/currency';

// =============================================================================
// Sparkline Component
// =============================================================================

interface SparklineProps {
  data: number[];
  label: string;
  format?: 'currency' | 'percent' | 'number';
  color?: string;
  currency?: string;
}

function formatSparklineValue(value: number, format: string, currency?: string): string {
  if (format === 'currency') {
    return formatCurrencyAmount(value, { currency, compact: true, maximumFractionDigits: 0 });
  }
  if (format === 'percent') return `${(value * 100).toFixed(1)}%`;
  return value.toFixed(1);
}

export function Sparkline({ data, label, format = 'currency', color = 'rgb(16, 185, 129)', currency }: SparklineProps) {
  const { path, lastValue, trend } = useMemo(() => {
    if (data.length < 2) return { path: '', lastValue: data[0] ?? 0, trend: 0 };

    const min = Math.min(...data);
    const max = Math.max(...data);
    const range = max - min || 1;
    const w = 100;
    const h = 32;
    const padding = 2;

    const points = data.map((v, i) => {
      const x = padding + (i / (data.length - 1)) * (w - padding * 2);
      const y = padding + (1 - (v - min) / range) * (h - padding * 2);
      return `${x},${y}`;
    });

    return {
      path: `M${points.join('L')}`,
      lastValue: data[data.length - 1],
      trend: data[data.length - 1] - data[data.length - 2],
    };
  }, [data]);

  if (data.length === 0) return null;

  const isUp = trend >= 0;

  return (
    <div className="bg-card/50 border border-border/40 rounded-xl p-3 flex-1 min-w-[140px]">
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs text-muted-foreground">{label}</span>
        <span className={`text-xs font-data ${isUp ? 'text-emerald-400' : 'text-red-400'}`}>
          {isUp ? '+' : ''}{format === 'percent' ? `${(trend * 100).toFixed(1)}pp` : formatSparklineValue(trend, format, currency)}
        </span>
      </div>
      <div className="flex items-end gap-2">
        <span className="text-sm font-data font-medium text-foreground">
          {formatSparklineValue(lastValue, format, currency)}
        </span>
        <svg viewBox="0 0 100 32" className="flex-1 h-6" preserveAspectRatio="none">
          <path d={path} fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" />
        </svg>
      </div>
    </div>
  );
}

export function SparklineRow({ quarters, currency }: {
  quarters: Array<{
    income_statement?: { revenue?: number; gross_profit?: number; net_income?: number };
    cash_flow?: { free_cash_flow?: number };
  }>;
  currency?: string;
}) {
  const reversed = useMemo(() => [...quarters].reverse(), [quarters]);

  const revenue = reversed.map(q => q.income_statement?.revenue ?? 0).filter(v => v !== 0);
  const netIncome = reversed.map(q => q.income_statement?.net_income ?? 0).filter(v => v !== 0);
  const grossMargin = reversed.map(q => {
    const rev = q.income_statement?.revenue;
    const gp = q.income_statement?.gross_profit;
    return rev && gp ? gp / rev : 0;
  }).filter(v => v !== 0);
  const fcf = reversed.map(q => q.cash_flow?.free_cash_flow ?? 0).filter(v => v !== 0);

  if (revenue.length < 2) return null;

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-5">
      <Sparkline data={revenue} label="季度营收" format="currency" color="rgb(16, 185, 129)" currency={currency} />
      <Sparkline data={netIncome} label="季度净利" format="currency" color="rgb(59, 130, 246)" currency={currency} />
      <Sparkline data={grossMargin} label="毛利率" format="percent" color="rgb(245, 158, 11)" />
      <Sparkline data={fcf} label="自由现金流" format="currency" color="rgb(139, 92, 246)" currency={currency} />
    </div>
  );
}

// =============================================================================
// Financial Health Score Ring
// =============================================================================

interface HealthScoreProps {
  score: number; // 0-10
  details?: Array<{ label: string; passed: boolean }>;
}

export function FinancialHealthScore({ score, details }: HealthScoreProps) {
  const radius = 36;
  const stroke = 5;
  const circumference = 2 * Math.PI * radius;
  const progress = (score / 10) * circumference;

  const color = score >= 7 ? 'text-emerald-400' :
                score >= 4 ? 'text-amber-400' :
                'text-red-400';
  const strokeColor = score >= 7 ? 'stroke-emerald-500' :
                      score >= 4 ? 'stroke-amber-500' :
                      'stroke-red-500';

  return (
    <div className="bg-card/50 border border-border/40 rounded-xl p-4">
      <h4 className="text-xs text-muted-foreground mb-3 flex items-center gap-2">
        财务健康评分
      </h4>
      <div className="flex items-center gap-4">
        {/* Ring */}
        <div className="relative flex-shrink-0">
          <svg width={radius * 2 + stroke * 2} height={radius * 2 + stroke * 2} className="transform -rotate-90">
            <circle
              cx={radius + stroke}
              cy={radius + stroke}
              r={radius}
              fill="none"
              stroke="currentColor"
              strokeOpacity="0.08"
              strokeWidth={stroke}
            />
            <circle
              cx={radius + stroke}
              cy={radius + stroke}
              r={radius}
              fill="none"
              className={strokeColor}
              strokeWidth={stroke}
              strokeDasharray={circumference}
              strokeDashoffset={circumference - progress}
              strokeLinecap="round"
            />
          </svg>
          <div className="absolute inset-0 flex items-center justify-center">
            <span className={`text-xl font-data font-bold ${color}`}>{score}</span>
          </div>
        </div>

        {/* Details */}
        {details && details.length > 0 && (
          <div className="grid grid-cols-2 gap-x-4 gap-y-0.5 flex-1">
            {details.map(d => (
              <div key={d.label} className="flex items-center gap-1.5 text-xs">
                <span className={d.passed ? 'text-emerald-400' : 'text-red-400/60'}>
                  {d.passed ? '+' : '-'}
                </span>
                <span className="text-muted-foreground">{d.label}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// =============================================================================
// Fair Value Range Bar
// =============================================================================

interface FairValueBarProps {
  currentPrice: number;
  targetLow: number | null;
  targetMedian: number | null;
  targetHigh: number | null;
  dcfValue: number | null;
  currency?: string;
}

export function FairValueBar({ currentPrice, targetLow, targetMedian, targetHigh, dcfValue, currency }: FairValueBarProps) {
  if (!targetLow || !targetHigh) return null;

  const min = Math.min(targetLow, currentPrice) * 0.95;
  const max = Math.max(targetHigh, currentPrice) * 1.05;
  const range = max - min;

  const toPercent = (v: number) => ((v - min) / range) * 100;

  const currentPos = toPercent(currentPrice);
  const lowPos = toPercent(targetLow);
  const highPos = toPercent(targetHigh);
  const medianPos = targetMedian ? toPercent(targetMedian) : null;

  const isUndervalued = targetMedian ? currentPrice < targetMedian : false;
  const valuationLabel = isUndervalued ? '低估' : '高估';
  const valuationColor = isUndervalued ? 'text-emerald-400' : 'text-red-400';
  const upside = targetMedian ? ((targetMedian - currentPrice) / currentPrice * 100).toFixed(1) : null;

  return (
    <div className="bg-card/50 border border-border/40 rounded-xl p-4">
      <div className="flex items-center justify-between mb-3">
        <h4 className="text-xs text-muted-foreground flex items-center gap-2">
          估值区间
        </h4>
        {upside && (
          <span className={`text-xs font-data ${valuationColor}`}>
            {valuationLabel} {isUndervalued ? '+' : ''}{upside}%
          </span>
        )}
      </div>

      {/* Bar */}
      <div className="relative h-8 mb-2">
        {/* Track */}
        <div className="absolute top-3 left-0 right-0 h-2 bg-muted/30 rounded-full" />

        {/* Analyst range */}
        <div
          className="absolute top-3 h-2 bg-violet-500/25 rounded-full"
          style={{ left: `${lowPos}%`, width: `${highPos - lowPos}%` }}
        />

        {/* Median marker */}
        {medianPos !== null && (
          <div
            className="absolute top-2 w-0.5 h-4 bg-violet-400 rounded-full"
            style={{ left: `${medianPos}%` }}
          />
        )}

        {/* Current price marker */}
        <div
          className="absolute top-1 w-3 h-6 rounded-md bg-foreground/90 border border-background shadow-sm"
          style={{ left: `${currentPos}%`, transform: 'translateX(-50%)' }}
        />
      </div>

      {/* Labels */}
      <div className="flex justify-between text-xs font-data text-muted-foreground">
        <span>{formatCurrencyAmount(targetLow, { currency, maximumFractionDigits: 0 })}</span>
        {targetMedian && <span className="text-violet-400">{formatCurrencyAmount(targetMedian, { currency, maximumFractionDigits: 0 })}</span>}
        <span>{formatCurrencyAmount(targetHigh, { currency, maximumFractionDigits: 0 })}</span>
      </div>

      {/* DCF reference */}
      {dcfValue !== null && (
        <div className="mt-2 pt-2 border-t border-border/30 flex items-center justify-between text-xs">
          <span className="text-muted-foreground">DCF 估值</span>
          <span className="font-data text-foreground">{formatCurrencyAmount(dcfValue, { currency })}</span>
        </div>
      )}
    </div>
  );
}
