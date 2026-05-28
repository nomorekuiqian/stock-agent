'use client';

import { useMemo } from 'react';
import {
  CartesianGrid,
  ComposedChart,
  Line,
  ResponsiveContainer,
  Scatter,
  Tooltip,
  XAxis,
  YAxis,
  ZAxis,
} from 'recharts';

import type { KolCockpitPricePoint, KolCockpitTweet } from '@/lib/api';

interface Props {
  priceSeries: KolCockpitPricePoint[];
  tweets: KolCockpitTweet[];
}

interface Row {
  date: string;
  close: number;
  mentionY: number | null;
  count: number;
  likes: number;
}

function nearestTradingDate(sortedDates: string[], d: string): string | null {
  let lo = 0;
  let hi = sortedDates.length - 1;
  let ans: string | null = null;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (sortedDates[mid] <= d) {
      ans = sortedDates[mid];
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }
  return ans ?? (sortedDates[0] ?? null);
}

function ChartTooltip({ active, payload }: { active?: boolean; payload?: Array<{ payload: Row }> }) {
  if (!active || !payload?.length) return null;
  const row = payload[0].payload;
  return (
    <div className="rounded-md border border-border bg-popover px-3 py-2 font-data text-xs shadow-lg">
      <div className="tabular-nums text-foreground">{row.date}</div>
      <div className="mt-0.5 tabular-nums text-muted-foreground">收盘 ${row.close?.toFixed(2)}</div>
      {row.count > 0 ? (
        <div className="mt-1 tabular-nums text-primary">
          提及 {row.count} · ♥ {row.likes}
        </div>
      ) : null}
    </div>
  );
}

export default function PriceTimelineChart({ priceSeries, tweets }: Props) {
  const data = useMemo<Row[]>(() => {
    if (!priceSeries.length) return [];
    const sortedDates = priceSeries.map((p) => p.date);
    const priceByDate = new Map(priceSeries.map((p) => [p.date, p.close]));
    const agg = new Map<string, { count: number; likes: number }>();
    for (const t of tweets) {
      const raw = t.created_at?.slice(0, 10);
      if (!raw) continue;
      const anchor = priceByDate.has(raw) ? raw : nearestTradingDate(sortedDates, raw);
      if (!anchor) continue;
      const cur = agg.get(anchor) ?? { count: 0, likes: 0 };
      cur.count += 1;
      cur.likes += t.like_count || 0;
      agg.set(anchor, cur);
    }
    return priceSeries.map((p) => {
      const a = agg.get(p.date);
      return {
        date: p.date,
        close: p.close,
        mentionY: a ? p.close : null,
        count: a?.count || 0,
        likes: a?.likes || 0,
      };
    });
  }, [priceSeries, tweets]);

  if (!priceSeries.length) {
    return (
      <div className="flex h-72 items-center justify-center rounded-md border border-dashed border-border/60 bg-card/30 text-sm text-muted-foreground">
        暂无价格数据，下方为原文时间线
      </div>
    );
  }

  return (
    <div>
      <div className="h-72 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={data} margin={{ top: 8, right: 4, bottom: 4, left: 4 }}>
            <CartesianGrid stroke="var(--border)" strokeOpacity={0.4} vertical={false} />
            <XAxis
              dataKey="date"
              tick={{ fontSize: 10, fill: 'var(--muted-foreground)' }}
              tickLine={false}
              axisLine={{ stroke: 'var(--border)', strokeOpacity: 0.6 }}
              minTickGap={56}
              tickFormatter={(d: string) => (d || '').slice(0, 7)}
            />
            <YAxis
              domain={['auto', 'auto']}
              tick={{ fontSize: 10, fill: 'var(--muted-foreground)' }}
              tickLine={false}
              axisLine={false}
              width={42}
              tickFormatter={(v: number) => `$${v}`}
            />
            <ZAxis dataKey="likes" range={[24, 280]} />
            <Tooltip content={<ChartTooltip />} cursor={{ stroke: 'var(--border)', strokeDasharray: '3 3' }} />
            <Line
              type="monotone"
              dataKey="close"
              stroke="var(--primary)"
              strokeWidth={1.25}
              dot={false}
              isAnimationActive={false}
            />
            <Scatter
              dataKey="mentionY"
              fill="var(--primary)"
              fillOpacity={0.4}
              stroke="var(--primary)"
              strokeOpacity={0.8}
              strokeWidth={1}
              isAnimationActive={false}
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
      <p className="mt-2 text-center font-data text-[10px] uppercase tracking-[0.18em] text-muted-foreground/70">
        emerald 点 = 一次提及 · 点越大 = 当日赞越多
      </p>
    </div>
  );
}
