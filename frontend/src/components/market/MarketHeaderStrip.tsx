'use client';

import type { MarketOverviewResponse } from '@/hooks/queries/use-stock-data';

export function MarketHeaderStrip({
  overview,
}: {
  overview: MarketOverviewResponse | undefined;
}) {
  const earnings = overview?.header?.next_earnings;

  if (!earnings) return null;

  return (
    <div className="bg-card/40 border border-border/25 rounded-xl px-4 py-3 flex flex-wrap items-center gap-x-5 gap-y-2">
      <div className="flex items-center gap-2">
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
    </div>
  );
}
