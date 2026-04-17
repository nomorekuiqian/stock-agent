'use client';

import type { MarketOverviewResponse } from '@/hooks/queries/use-stock-data';

export function PeersComparisonCard({ overview }: { overview: MarketOverviewResponse | undefined }) {
  const peers = overview?.peers_comparison || [];

  if (peers.length === 0) return null;

  return (
    <div className="bg-card/50 border border-border/30 rounded-xl overflow-hidden">
      <div className="px-5 py-3 border-b border-border/20 bg-card/40 flex items-center gap-2">
        <span className="text-base">🎯</span>
        <h3 className="text-sm font-medium text-foreground">同行对比</h3>
        <span className="text-xs text-muted-foreground ml-auto">Top {peers.length} 同业</span>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-card/40 border-b border-border/15">
              <th className="text-left py-2.5 px-5 text-xs uppercase tracking-wider text-muted-foreground font-medium">标的</th>
              <th className="text-right py-2.5 px-3 text-xs uppercase tracking-wider text-muted-foreground font-medium">当前</th>
              <th className="text-right py-2.5 px-5 text-xs uppercase tracking-wider text-muted-foreground font-medium">今日</th>
            </tr>
          </thead>
          <tbody>
            {peers.map((p, i) => {
              const changeTone = p.change_pct_today != null
                ? (p.change_pct_today >= 0 ? 'text-emerald-400' : 'text-red-400')
                : 'text-muted-foreground';
              return (
                <tr key={i} className="border-t border-border/15 hover:bg-card/40 transition-colors">
                  <td className="py-2.5 px-5">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-foreground">{p.symbol}</span>
                      {p.name && <span className="text-xs text-muted-foreground truncate">{p.name}</span>}
                    </div>
                  </td>
                  <td className="py-2.5 px-3 text-right font-data text-muted-foreground">
                    {p.price != null ? `$${p.price.toFixed(2)}` : '—'}
                  </td>
                  <td className={`py-2.5 px-5 text-right font-data ${changeTone}`}>
                    {p.change_pct_today != null
                      ? `${p.change_pct_today >= 0 ? '+' : ''}${p.change_pct_today.toFixed(2)}%`
                      : '—'}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
