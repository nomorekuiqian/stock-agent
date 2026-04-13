'use client';

import { useEffect } from 'react';
import { useLiquidityMetrics } from '@/hooks/queries/use-liquidity-data';
import type { LiquidityMetric } from '@/lib/api';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface LiquidityContextPayload {
  type: 'macro_liquidity';
  net_liquidity: number | null;
  net_liquidity_change: number | null;
  fed_assets: number | null;
  tga: number | null;
  rrp: number | null;
  reserves: number | null;
  nfci: number | null;
  sofr: number | null;
  effr: number | null;
}

interface LiquidityViewProps {
  onContextReady?: (payload: LiquidityContextPayload) => void;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatBillions(val: number | null): string {
  if (val == null) return '--';
  if (Math.abs(val) >= 1000) return `$${(val / 1000).toFixed(2)}T`;
  return `$${val.toFixed(0)}B`;
}

function formatRate(val: number | null): string {
  if (val == null) return '--';
  return `${val.toFixed(2)}%`;
}

function formatChange(val: number | null): string {
  if (val == null) return '';
  const sign = val >= 0 ? '+' : '';
  return `${sign}${val.toFixed(2)}%`;
}

function changeColor(val: number | null): string {
  if (val == null) return 'text-muted-foreground';
  return val >= 0 ? 'text-emerald-500' : 'text-red-500';
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function MetricCard({ label, metric, formatter }: {
  label: string;
  metric: LiquidityMetric;
  formatter: (v: number | null) => string;
}) {
  return (
    <div className="rounded-xl border border-border/40 bg-card/60 p-3.5">
      <p className="text-[11px] text-muted-foreground mb-1.5">{label}</p>
      <p className="text-lg font-semibold text-foreground tabular-nums">
        {formatter(metric.value)}
      </p>
      {metric.change != null && (
        <p className={`text-xs tabular-nums mt-0.5 ${changeColor(metric.change)}`}>
          {formatChange(metric.change)}
        </p>
      )}
      {metric.date && (
        <p className="text-[10px] text-muted-foreground/50 mt-1">{metric.date}</p>
      )}
    </div>
  );
}

function SectionHeader({ title }: { title: string }) {
  return (
    <div className="flex items-center gap-2.5">
      <div className="w-1 h-5 bg-primary rounded-full" />
      <h4 className="text-sm font-semibold text-foreground uppercase tracking-wider">{title}</h4>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function LiquidityView({ onContextReady }: LiquidityViewProps) {
  const { data: response, isLoading, error } = useLiquidityMetrics();
  const metrics = response?.success ? response.metrics : null;

  useEffect(() => {
    if (!onContextReady || !metrics) return;
    onContextReady({
      type: 'macro_liquidity',
      net_liquidity: metrics.net_liquidity?.value ?? null,
      net_liquidity_change: metrics.net_liquidity?.change ?? null,
      fed_assets: metrics.fed_assets?.value ?? null,
      tga: metrics.tga?.value ?? null,
      rrp: metrics.rrp?.value ?? null,
      reserves: metrics.reserves?.value ?? null,
      nfci: metrics.nfci?.value ?? null,
      sofr: metrics.sofr?.value ?? null,
      effr: metrics.effr?.value ?? null,
    });
  }, [metrics, onContextReady]);

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-4">
        <div className="relative w-12 h-12">
          <div className="absolute inset-0 rounded-full border border-primary/20" />
          <div className="absolute inset-0 rounded-full border-t border-primary animate-spin" />
        </div>
        <span className="text-xs text-muted-foreground">加载流动性数据</span>
      </div>
    );
  }

  if (error || !metrics) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-3 px-6 text-center">
        <p className="text-sm text-muted-foreground">无法加载流动性数据</p>
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto">
      <div className="px-5 pt-4 pb-4">
        <span className="text-primary text-xs font-semibold tracking-[0.25em] uppercase">LIQUIDITY</span>
        <h2 className="text-xl font-editorial text-foreground leading-tight mt-1">流动性环境</h2>
        <p className="text-sm text-muted-foreground mt-1">Fed 资产负债表与货币市场指标</p>
      </div>

      <div className="border-b border-border/30" />

      <div className="px-5 py-5 space-y-6">
        {/* Net Liquidity Hero */}
        <div className="bg-card rounded-xl border border-border p-4">
          <div className="flex items-center gap-2 mb-2.5">
            <span className="w-1.5 h-1.5 rounded-full bg-primary/70" />
            <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">净流动性</span>
          </div>
          <p className="text-2xl font-bold text-foreground tabular-nums">
            {formatBillions(metrics.net_liquidity?.value ?? null)}
          </p>
          {metrics.net_liquidity?.change != null && (
            <p className={`text-sm tabular-nums mt-1 ${changeColor(metrics.net_liquidity.change)}`}>
              {formatChange(metrics.net_liquidity.change)}
            </p>
          )}
          <p className="text-[11px] text-muted-foreground/60 mt-2">
            Fed Assets - TGA - RRP
          </p>
        </div>

        {/* Balance Sheet Components */}
        <section className="space-y-3">
          <SectionHeader title="资产负债表组件" />
          <div className="grid grid-cols-2 gap-3">
            <MetricCard label="Fed 总资产" metric={metrics.fed_assets} formatter={formatBillions} />
            <MetricCard label="财政部账户 (TGA)" metric={metrics.tga} formatter={formatBillions} />
            <MetricCard label="隔夜逆回购 (RRP)" metric={metrics.rrp} formatter={formatBillions} />
            <MetricCard label="银行准备金" metric={metrics.reserves} formatter={formatBillions} />
          </div>
        </section>

        {/* Rates */}
        <section className="space-y-3">
          <SectionHeader title="货币市场利率" />
          <div className="grid grid-cols-3 gap-3">
            <MetricCard label="SOFR" metric={metrics.sofr} formatter={formatRate} />
            <MetricCard label="EFFR" metric={metrics.effr} formatter={formatRate} />
            <MetricCard label="NFCI" metric={metrics.nfci} formatter={(v) => v?.toFixed(2) ?? '--'} />
          </div>
        </section>
      </div>
    </div>
  );
}
