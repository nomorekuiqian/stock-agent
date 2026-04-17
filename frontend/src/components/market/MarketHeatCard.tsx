'use client';

import type { MarketOverviewResponse } from '@/hooks/queries/use-stock-data';

function formatPct(v: number | null | undefined, digits = 2): string {
  if (v == null || !isFinite(v)) return '—';
  const sign = v > 0 ? '+' : '';
  return `${sign}${v.toFixed(digits)}%`;
}

export function MarketHeatCard({ overview }: { overview: MarketOverviewResponse | undefined }) {
  if (!overview) return null;

  const rankings = overview.market_heat?.rankings;
  const sectorPerf = overview.market_heat?.sector_perf;

  const anyRank =
    rankings &&
    (rankings.gainers_rank != null || rankings.losers_rank != null || rankings.most_active_rank != null);

  const stockPct = sectorPerf?.stock_change_today_pct;
  const sectorPct = sectorPerf?.sector_avg_today_pct;
  const relative =
    stockPct != null && sectorPct != null ? stockPct - sectorPct : null;

  return (
    <div className="bg-card/50 border border-border/30 rounded-xl overflow-hidden">
      <div className="px-5 py-3 border-b border-border/20 bg-card/40 flex items-center gap-2">
        <span className="text-base">🔥</span>
        <h3 className="text-sm font-medium text-foreground">市场热度</h3>
      </div>

      <div className="p-5 space-y-5">
        {/* Rankings */}
        <div>
          <h4 className="text-xs uppercase tracking-wider text-muted-foreground mb-2">市场榜单</h4>
          {anyRank ? (
            <div className="flex flex-col gap-1.5">
              {rankings.most_active_rank != null && (
                <RankRow color="amber" label="今日成交量" rank={rankings.most_active_rank} />
              )}
              {rankings.gainers_rank != null && (
                <RankRow color="emerald" label="今日涨幅榜" rank={rankings.gainers_rank} />
              )}
              {rankings.losers_rank != null && (
                <RankRow color="red" label="今日跌幅榜" rank={rankings.losers_rank} />
              )}
            </div>
          ) : (
            <div className="text-xs text-muted-foreground">今日未入榜单 (Top 50)</div>
          )}
        </div>

        {/* Sector compare */}
        <div className="pt-2 border-t border-border/15">
          <h4 className="text-xs uppercase tracking-wider text-muted-foreground mb-2">板块对比</h4>
          {sectorPerf?.sector_name ? (
            <div className="space-y-1.5 text-sm">
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">本股今日</span>
                <span className={`font-data ${(stockPct ?? 0) >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                  {formatPct(stockPct)}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">{sectorPerf.sector_name} 均值</span>
                <span className={`font-data ${(sectorPct ?? 0) >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                  {formatPct(sectorPct)}
                </span>
              </div>
              {relative != null && (
                <div className="flex items-center justify-between pt-1.5 border-t border-border/15">
                  <span className="text-xs text-muted-foreground">相对板块</span>
                  <span className={`text-sm font-data font-medium ${relative >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                    {relative >= 0 ? '+' : ''}{relative.toFixed(2)}pp
                  </span>
                </div>
              )}
            </div>
          ) : (
            <div className="text-xs text-muted-foreground">板块数据不可用</div>
          )}
        </div>
      </div>
    </div>
  );
}

function RankRow({ color, label, rank }: { color: 'emerald' | 'red' | 'amber'; label: string; rank: number }) {
  const colorMap = {
    emerald: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/25',
    red: 'text-red-400 bg-red-500/10 border-red-500/25',
    amber: 'text-amber-400 bg-amber-500/10 border-amber-500/25',
  };
  return (
    <div className="flex items-center justify-between text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className={`text-xs font-data font-medium px-2 py-0.5 rounded border ${colorMap[color]}`}>
        #{rank}
      </span>
    </div>
  );
}
