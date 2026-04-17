'use client';

import type { MarketOverviewResponse } from '@/hooks/queries/use-stock-data';

export function MarketHeaderStrip({
  overview,
}: {
  overview: MarketOverviewResponse | undefined;
}) {
  const earnings = overview?.header?.next_earnings;
  const badges = overview?.header?.market_badges;

  const hasAnything = earnings || (badges && (
    badges.most_active_rank != null || badges.gainers_rank != null || badges.losers_rank != null
  ));

  if (!hasAnything) return null;

  return (
    <div className="bg-card/40 border border-border/25 rounded-xl px-4 py-3 flex flex-wrap items-center gap-x-5 gap-y-2">
      {/* Earnings countdown */}
      {earnings && (
        <div className="flex items-center gap-2">
          <span className="text-sm">📅</span>
          <div>
            <div className="text-xs text-muted-foreground uppercase tracking-wider">下次财报</div>
            <div className="text-sm font-data text-foreground">
              {earnings.date}
              {earnings.days_until != null && (
                <span className="ml-2 text-emerald-400">T-{earnings.days_until}d</span>
              )}
              {earnings.eps_estimate != null && (
                <span className="ml-3 text-muted-foreground">
                  EPS 预期 ${earnings.eps_estimate.toFixed(2)}
                </span>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Market badges */}
      {badges && (
        <div className="flex items-center gap-2 flex-wrap">
          {badges.most_active_rank != null && (
            <Badge color="amber" label={`今日成交 Top #${badges.most_active_rank}`} />
          )}
          {badges.gainers_rank != null && (
            <Badge color="emerald" label={`今日涨幅 Top #${badges.gainers_rank}`} />
          )}
          {badges.losers_rank != null && (
            <Badge color="red" label={`今日跌幅 Top #${badges.losers_rank}`} />
          )}
        </div>
      )}
    </div>
  );
}

function Badge({ color, label }: { color: 'emerald' | 'red' | 'amber'; label: string }) {
  const colorMap = {
    emerald: 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400',
    red: 'bg-red-500/10 border-red-500/30 text-red-400',
    amber: 'bg-amber-500/10 border-amber-500/30 text-amber-400',
  };
  return (
    <span className={`text-xs px-2 py-1 rounded-md border font-medium ${colorMap[color]}`}>
      {label}
    </span>
  );
}
