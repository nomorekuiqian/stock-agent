'use client';

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

function nearestTradingDate(sortedDates: string[], d: string): string | null {
  // largest date <= d (binary search); fallback to earliest
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
  return ans ?? (sortedDates.length ? sortedDates[0] : null);
}

type Row = {
  date: string;
  close: number;
  mentionY: number | null;
  count: number;
  likes: number;
};

function ChartTooltip({ active, payload }: { active?: boolean; payload?: Array<{ payload: Row }> }) {
  if (!active || !payload?.length) return null;
  const row = payload[0].payload;
  return (
    <div className="rounded-md border border-border bg-background px-3 py-2 text-xs shadow-sm">
      <div className="font-data text-foreground">{row.date}</div>
      <div className="text-muted-foreground">收盘 ${row.close?.toFixed(2)}</div>
      {row.count > 0 && (
        <div className="mt-1 text-primary">提及 {row.count} 条 · ♥ {row.likes}</div>
      )}
    </div>
  );
}

export default function MentionTimelineChart({
  priceSeries,
  tweets,
}: {
  priceSeries: KolCockpitPricePoint[];
  tweets: KolCockpitTweet[];
}) {
  if (!priceSeries.length) {
    return (
      <div className="flex h-72 items-center justify-center rounded-lg border border-border/60 bg-card text-sm text-muted-foreground">
        暂无价格数据，下方为原文时间线
      </div>
    );
  }

  const sortedDates = priceSeries.map((p) => p.date);
  const priceByDate = new Map(priceSeries.map((p) => [p.date, p.close]));
  const agg = new Map<string, { count: number; likes: number }>();
  for (const t of tweets) {
    const raw = t.created_at?.slice(0, 10);
    if (!raw) continue;
    const anchor = priceByDate.has(raw) ? raw : nearestTradingDate(sortedDates, raw);
    if (!anchor) continue;
    const cur = agg.get(anchor) || { count: 0, likes: 0 };
    cur.count += 1;
    cur.likes += t.like_count || 0;
    agg.set(anchor, cur);
  }

  const data: Row[] = priceSeries.map((p) => {
    const a = agg.get(p.date);
    return {
      date: p.date,
      close: p.close,
      mentionY: a ? p.close : null,
      count: a?.count || 0,
      likes: a?.likes || 0,
    };
  });

  return (
    <div className="h-72 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={data} margin={{ top: 8, right: 12, bottom: 4, left: 4 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
          <XAxis
            dataKey="date"
            tick={{ fontSize: 11 }}
            minTickGap={48}
            tickFormatter={(d: string) => (d || '').slice(0, 7)}
            stroke="hsl(var(--muted-foreground))"
          />
          <YAxis
            domain={['auto', 'auto']}
            tick={{ fontSize: 11 }}
            width={48}
            tickFormatter={(v: number) => `$${v}`}
            stroke="hsl(var(--muted-foreground))"
          />
          <ZAxis dataKey="likes" range={[30, 320]} />
          <Tooltip content={<ChartTooltip />} />
          <Line
            type="monotone"
            dataKey="close"
            stroke="#059669"
            strokeWidth={1.5}
            dot={false}
            isAnimationActive={false}
          />
          <Scatter
            dataKey="mentionY"
            fill="#059669"
            fillOpacity={0.35}
            stroke="#059669"
            strokeOpacity={0.6}
            isAnimationActive={false}
          />
        </ComposedChart>
      </ResponsiveContainer>
      <p className="mt-1 text-center text-xs text-muted-foreground">
        绿点 = 一次提及 · 点越大 = 当日点赞越多
      </p>
    </div>
  );
}
