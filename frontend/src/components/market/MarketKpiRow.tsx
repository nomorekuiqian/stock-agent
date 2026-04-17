'use client';

import type { MarketOverviewResponse } from '@/hooks/queries/use-stock-data';

function formatPct(v: number | null | undefined, digits = 1): string {
  if (v == null || !isFinite(v)) return '—';
  const sign = v > 0 ? '+' : '';
  return `${sign}${v.toFixed(digits)}%`;
}

function KpiCard({
  label,
  value,
  sub,
  tone,
}: {
  label: string;
  value: string;
  sub?: string;
  tone?: 'positive' | 'negative' | 'neutral';
}) {
  const toneCls =
    tone === 'positive' ? 'text-emerald-400'
    : tone === 'negative' ? 'text-red-400'
    : 'text-foreground';

  return (
    <div className="bg-card/40 border border-border/25 rounded-xl px-3 py-2.5">
      <div className="text-xs text-muted-foreground uppercase tracking-wider">{label}</div>
      <div className={`text-base font-data font-medium ${toneCls} leading-tight`}>{value}</div>
      {sub && <div className="text-xs text-muted-foreground mt-0.5 truncate">{sub}</div>}
    </div>
  );
}

export function MarketKpiRow({
  overview,
  loading,
}: {
  overview: MarketOverviewResponse | undefined;
  loading?: boolean;
}) {
  if (loading || !overview) {
    return (
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="bg-card/40 border border-border/25 rounded-xl px-3 py-2.5">
            <div className="h-3 bg-muted/20 rounded animate-pulse mb-2" />
            <div className="h-5 bg-muted/20 rounded animate-pulse" />
          </div>
        ))}
      </div>
    );
  }

  const k = overview.kpis;

  const targetUpsidePct = k.target_upside_pct;
  const isTargetUp = targetUpsidePct != null && targetUpsidePct > 0;

  const sectorTone: 'positive' | 'negative' | 'neutral' =
    k.sector_relative_perf_today != null
      ? (k.sector_relative_perf_today > 0 ? 'positive' : k.sector_relative_perf_today < 0 ? 'negative' : 'neutral')
      : 'neutral';

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
      <KpiCard
        label="24h 新闻"
        value={String(k.news_24h)}
        sub="过去一天"
      />
      <KpiCard
        label="7d 评级变动"
        value={String(k.grade_changes_7d)}
        sub="升降级数"
      />
      <KpiCard
        label="目标价共识"
        value={k.target_consensus != null ? `$${k.target_consensus.toFixed(0)}` : '—'}
        sub={targetUpsidePct != null ? `${formatPct(targetUpsidePct)} vs 现价` : undefined}
        tone={isTargetUp ? 'positive' : targetUpsidePct != null && targetUpsidePct < 0 ? 'negative' : 'neutral'}
      />
      <KpiCard
        label="今日 vs 板块"
        value={formatPct(k.sector_relative_perf_today)}
        sub={k.stock_sector || undefined}
        tone={sectorTone}
      />
    </div>
  );
}
