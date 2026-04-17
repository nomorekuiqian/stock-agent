'use client';

import { useMemo, useState } from 'react';
import type {
  AnalystActivityResponse,
  AnalystGradeChange,
  AnalystHistoricalPoint,
  AnalystPriceTarget,
  AnalystGradeSummary,
} from '@/hooks/queries/use-stock-data';

// =============================================================================
// Sub-blocks
// =============================================================================

function formatPrice(v: number | null | undefined): string {
  if (v == null || !isFinite(v)) return '--';
  if (v >= 1000) return `$${v.toFixed(0)}`;
  return `$${v.toFixed(2)}`;
}

function PriceTargetBlock({
  priceTarget,
  currentPrice,
}: {
  priceTarget: AnalystPriceTarget;
  currentPrice: number | null;
}) {
  const { low, average, median, high, last_quarter_count, last_year_count } = priceTarget;

  if (low == null || high == null || average == null) {
    return (
      <div className="text-xs text-muted-foreground">暂无分析师目标价数据</div>
    );
  }

  const anchor = currentPrice ?? average;
  const min = Math.min(low, anchor) * 0.95;
  const max = Math.max(high, anchor) * 1.05;
  const range = max - min || 1;
  const toPct = (v: number) => ((v - min) / range) * 100;

  const upsidePct =
    currentPrice && average ? ((average - currentPrice) / currentPrice) * 100 : null;
  const isUp = upsidePct != null && upsidePct > 0;

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <h4 className="text-xs uppercase tracking-wider text-muted-foreground">目标价</h4>
        {upsidePct != null && (
          <span className={`text-xs font-data ${isUp ? 'text-emerald-400' : 'text-red-400'}`}>
            {isUp ? '+' : ''}{upsidePct.toFixed(1)}% 上行空间
          </span>
        )}
      </div>

      {/* Bar */}
      <div className="relative h-8 mb-2">
        <div className="absolute top-3 left-0 right-0 h-2 bg-muted/25 rounded-full" />
        {/* Range between low and high */}
        <div
          className="absolute top-3 h-2 bg-blue-500/30 rounded-full"
          style={{
            left: `${toPct(low)}%`,
            width: `${toPct(high) - toPct(low)}%`,
          }}
        />
        {/* Median marker */}
        {median != null && (
          <div
            className="absolute top-2 w-0.5 h-4 bg-blue-300 rounded-full"
            style={{ left: `${toPct(median)}%` }}
            title={`中位 ${formatPrice(median)}`}
          />
        )}
        {/* Average marker (consensus) */}
        <div
          className="absolute top-1.5 w-1 h-5 bg-blue-400 rounded-full"
          style={{ left: `${toPct(average)}%` }}
          title={`共识 ${formatPrice(average)}`}
        />
        {/* Current price */}
        {currentPrice != null && (
          <div
            className="absolute top-1 w-2.5 h-6 rounded bg-foreground border border-background shadow-sm"
            style={{ left: `${toPct(currentPrice)}%`, transform: 'translateX(-50%)' }}
            title={`当前 ${formatPrice(currentPrice)}`}
          />
        )}
      </div>

      {/* Labels under bar */}
      <div className="flex justify-between text-xs font-data">
        <div className="text-muted-foreground">
          <div>低</div>
          <div className="text-foreground/80">{formatPrice(low)}</div>
        </div>
        <div className="text-blue-400 text-center">
          <div>共识</div>
          <div>{formatPrice(average)}</div>
        </div>
        <div className="text-muted-foreground text-right">
          <div>高</div>
          <div className="text-foreground/80">{formatPrice(high)}</div>
        </div>
      </div>

      {/* Coverage */}
      <div className="mt-3 text-xs text-muted-foreground font-data flex items-center gap-3">
        {currentPrice != null && <span>当前 {formatPrice(currentPrice)}</span>}
        {last_quarter_count > 0 && <span>近 3 月 {last_quarter_count} 位分析师</span>}
        {last_year_count > 0 && <span>近 12 月 {last_year_count} 位</span>}
      </div>
    </div>
  );
}

const CONSENSUS_LABEL: Record<string, string> = {
  'Strong Buy': '强势买入',
  'Buy': '买入',
  'Hold': '持有',
  'Sell': '卖出',
  'Strong Sell': '强势卖出',
};

function consensusColor(c: string): string {
  if (c === 'Strong Buy' || c === 'Buy') return 'text-emerald-400';
  if (c === 'Sell' || c === 'Strong Sell') return 'text-red-400';
  return 'text-amber-400';
}

function ConsensusBar({ summary }: { summary: AnalystGradeSummary }) {
  const { strong_buy, buy, hold, sell, strong_sell, consensus, total } = summary;

  if (total === 0) {
    return <div className="text-xs text-muted-foreground">暂无分析师评级</div>;
  }

  const pct = (v: number) => (v / total) * 100;

  const buckets = [
    { key: 'sb', label: '强买', value: strong_buy, color: 'bg-emerald-500' },
    { key: 'b', label: '买入', value: buy, color: 'bg-emerald-500/70' },
    { key: 'h', label: '持有', value: hold, color: 'bg-amber-500/60' },
    { key: 's', label: '卖出', value: sell, color: 'bg-red-500/60' },
    { key: 'ss', label: '强卖', value: strong_sell, color: 'bg-red-500' },
  ];

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <h4 className="text-xs uppercase tracking-wider text-muted-foreground">评级共识</h4>
        <span className={`text-sm font-medium ${consensusColor(consensus)}`}>
          {CONSENSUS_LABEL[consensus] || consensus || '—'}
        </span>
      </div>

      {/* Stacked bar */}
      <div className="flex w-full h-2.5 rounded-full overflow-hidden mb-2 bg-muted/25">
        {buckets.map(b =>
          b.value > 0 ? (
            <div
              key={b.key}
              className={b.color}
              style={{ width: `${pct(b.value)}%` }}
              title={`${b.label} ${b.value}`}
            />
          ) : null,
        )}
      </div>

      {/* Legend */}
      <div className="grid grid-cols-5 gap-1 text-xs font-data">
        {buckets.map(b => (
          <div key={b.key} className="flex flex-col items-center">
            <div className="text-muted-foreground">{b.label}</div>
            <div className="text-foreground font-medium">{b.value}</div>
          </div>
        ))}
      </div>
      <div className="mt-2 text-xs text-muted-foreground font-data">
        总计 {total} 位分析师
      </div>
    </div>
  );
}

const ACTION_LABEL: Record<string, { text: string; color: string }> = {
  upgrade: { text: '上调', color: 'text-emerald-400' },
  downgrade: { text: '下调', color: 'text-red-400' },
  maintain: { text: '维持', color: 'text-muted-foreground' },
  initialise: { text: '首次', color: 'text-blue-400' },
  initialize: { text: '首次', color: 'text-blue-400' },
  reiterate: { text: '重申', color: 'text-muted-foreground' },
  hold: { text: '维持', color: 'text-muted-foreground' },
};

function GradeChangesFeed({ changes }: { changes: AnalystGradeChange[] }) {
  const [showAll, setShowAll] = useState(false);
  const [filter, setFilter] = useState<'all' | 'changed'>('all');

  const filtered = useMemo(() => {
    if (filter === 'changed') {
      return changes.filter(c => c.action !== 'maintain' && c.action !== 'reiterate');
    }
    return changes;
  }, [changes, filter]);

  if (changes.length === 0) {
    return (
      <div>
        <h4 className="text-xs uppercase tracking-wider text-muted-foreground mb-2">评级变动</h4>
        <div className="text-xs text-muted-foreground">近期无评级变动</div>
      </div>
    );
  }

  const visible = showAll ? filtered : filtered.slice(0, 8);

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <h4 className="text-xs uppercase tracking-wider text-muted-foreground">评级变动</h4>
        <div className="flex items-center gap-1 text-xs">
          <button
            onClick={() => setFilter('all')}
            className={`px-2.5 py-1 rounded cursor-pointer transition-colors focus-visible:ring-2 focus-visible:ring-emerald-500/40 focus-visible:outline-none ${
              filter === 'all' ? 'bg-emerald-500/15 text-emerald-400' : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            全部
          </button>
          <button
            onClick={() => setFilter('changed')}
            className={`px-2.5 py-1 rounded cursor-pointer transition-colors focus-visible:ring-2 focus-visible:ring-emerald-500/40 focus-visible:outline-none ${
              filter === 'changed' ? 'bg-emerald-500/15 text-emerald-400' : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            仅升/降级
          </button>
        </div>
      </div>

      <div className="divide-y divide-border/15 border border-border/20 rounded-lg bg-card/30">
        {visible.length === 0 ? (
          <div className="py-3 px-3 text-xs text-muted-foreground text-center">暂无记录</div>
        ) : (
          visible.map((c, i) => {
            const actionInfo = ACTION_LABEL[c.action] || { text: c.action || '—', color: 'text-muted-foreground' };
            return (
              <div key={i} className="flex items-center gap-3 py-2 px-3">
                <div className="text-xs font-data text-muted-foreground w-14 shrink-0">
                  {c.date.slice(5)}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm text-foreground truncate">{c.firm || '—'}</div>
                  <div className="text-xs text-muted-foreground truncate">
                    {c.previous_grade ? (
                      <>
                        <span className="text-muted-foreground/80">{c.previous_grade}</span>
                        <span className="mx-1">→</span>
                        <span className="text-foreground/90">{c.new_grade}</span>
                      </>
                    ) : (
                      <span className="text-foreground/90">{c.new_grade}</span>
                    )}
                  </div>
                </div>
                <span className={`text-xs font-medium shrink-0 ${actionInfo.color}`}>
                  {actionInfo.text}
                </span>
              </div>
            );
          })
        )}
      </div>

      {filtered.length > 8 && (
        <button
          onClick={() => setShowAll(!showAll)}
          className="w-full mt-2 py-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors cursor-pointer rounded focus-visible:ring-2 focus-visible:ring-emerald-500/40 focus-visible:outline-none"
        >
          {showAll ? '收起' : `查看全部 ${filtered.length} 条`}
        </button>
      )}
    </div>
  );
}

// Stacked monthly bar chart (SVG)
function HistoricalChart({ timeline }: { timeline: AnalystHistoricalPoint[] }) {
  // Keep last 12 points
  const data = useMemo(() => timeline.slice(-12), [timeline]);

  if (data.length === 0) {
    return (
      <div>
        <h4 className="text-xs uppercase tracking-wider text-muted-foreground mb-2">12 月评级历史</h4>
        <div className="text-xs text-muted-foreground">暂无历史评级数据</div>
      </div>
    );
  }

  // Compute max total for y-scale
  const maxTotal = Math.max(
    1,
    ...data.map(d => d.strong_buy + d.buy + d.hold + d.sell + d.strong_sell),
  );

  const width = 100; // percent
  const barWidth = width / data.length;
  const gap = barWidth * 0.18;
  const usableBar = barWidth - gap;

  const stack = (d: AnalystHistoricalPoint) => [
    { v: d.strong_buy, color: '#10b981' },
    { v: d.buy, color: 'rgba(16,185,129,0.55)' },
    { v: d.hold, color: 'rgba(245,158,11,0.55)' },
    { v: d.sell, color: 'rgba(239,68,68,0.55)' },
    { v: d.strong_sell, color: '#ef4444' },
  ];

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <h4 className="text-xs uppercase tracking-wider text-muted-foreground">近 12 月评级趋势</h4>
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <span className="flex items-center gap-1">
            <span className="w-2 h-2 rounded-sm bg-emerald-500" /> 强买
          </span>
          <span className="flex items-center gap-1">
            <span className="w-2 h-2 rounded-sm bg-emerald-500/55" /> 买
          </span>
          <span className="flex items-center gap-1">
            <span className="w-2 h-2 rounded-sm bg-amber-500/55" /> 持
          </span>
          <span className="flex items-center gap-1">
            <span className="w-2 h-2 rounded-sm bg-red-500/55" /> 卖
          </span>
          <span className="flex items-center gap-1">
            <span className="w-2 h-2 rounded-sm bg-red-500" /> 强卖
          </span>
        </div>
      </div>

      <svg viewBox={`0 0 ${width} 100`} preserveAspectRatio="none" className="w-full h-28">
        {data.map((d, i) => {
          const total = d.strong_buy + d.buy + d.hold + d.sell + d.strong_sell;
          const totalH = (total / maxTotal) * 100;
          let yOffset = 100 - totalH;
          const x = i * barWidth + gap / 2;

          return (
            <g key={d.date}>
              {stack(d).map((seg, si) => {
                if (seg.v === 0) return null;
                const h = (seg.v / maxTotal) * 100;
                const rect = (
                  <rect
                    key={si}
                    x={x}
                    y={yOffset}
                    width={usableBar}
                    height={h}
                    fill={seg.color}
                  />
                );
                yOffset += h;
                return rect;
              })}
            </g>
          );
        })}
      </svg>

      {/* Month labels */}
      <div className="flex justify-between text-xs font-data text-muted-foreground/80 mt-1">
        {data.map((d, i) => (
          <div
            key={d.date}
            className="text-center"
            style={{ width: `${100 / data.length}%` }}
          >
            {i % 2 === 0 ? d.date.slice(2, 7) : ''}
          </div>
        ))}
      </div>
    </div>
  );
}

// =============================================================================
// Main Card
// =============================================================================

export function AnalystRatingsCard({
  data,
  currentPrice,
  loading,
}: {
  data: AnalystActivityResponse | undefined;
  currentPrice?: number | null;
  loading?: boolean;
}) {
  if (loading) {
    return (
      <div className="bg-card/50 border border-border/30 rounded-xl p-6">
        <div className="flex items-center gap-2 mb-4">
          <span className="text-base">📊</span>
          <h3 className="text-sm font-medium text-foreground">分析师评级</h3>
        </div>
        <div className="space-y-3">
          <div className="h-8 bg-muted/20 animate-pulse rounded" />
          <div className="h-4 bg-muted/20 animate-pulse rounded" />
          <div className="h-20 bg-muted/20 animate-pulse rounded" />
        </div>
      </div>
    );
  }

  if (!data || !data.success) return null;

  const hasAnyCoverage =
    data.summary.total > 0 || (data.price_target.average ?? null) != null;

  if (!hasAnyCoverage) {
    return (
      <div className="bg-card/50 border border-border/30 rounded-xl p-6 text-center">
        <div className="flex items-center justify-center gap-2 mb-2">
          <span className="text-base">📊</span>
          <h3 className="text-sm font-medium text-foreground">分析师评级</h3>
        </div>
        <p className="text-xs text-muted-foreground">该股票暂无分析师覆盖</p>
      </div>
    );
  }

  return (
    <div className="bg-card/50 border border-border/30 rounded-xl overflow-hidden">
      <div className="px-5 py-3 border-b border-border/20 bg-card/40 flex items-center gap-2">
        <span className="text-base">📊</span>
        <h3 className="text-sm font-medium text-foreground">分析师评级</h3>
      </div>
      <div className="divide-y divide-border/20">
        <div className="p-5">
          <PriceTargetBlock
            priceTarget={data.price_target}
            currentPrice={currentPrice ?? null}
          />
        </div>
        <div className="p-5">
          <ConsensusBar summary={data.summary} />
        </div>
        <div className="p-5">
          <GradeChangesFeed changes={data.grade_changes} />
        </div>
        <div className="p-5">
          <HistoricalChart timeline={data.historical_timeline} />
        </div>
      </div>
    </div>
  );
}
