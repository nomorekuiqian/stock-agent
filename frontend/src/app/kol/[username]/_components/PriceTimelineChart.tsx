'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  CartesianGrid,
  ComposedChart,
  Line,
  Scatter,
  Tooltip,
  XAxis,
  YAxis,
  ZAxis,
} from 'recharts';

import type { KolCockpitPricePoint, KolCockpitTweet } from '@/lib/api';
import { formatStockPrice } from '@/lib/currency';

interface Props {
  ticker: string;
  priceSeries: KolCockpitPricePoint[];
  tweets: KolCockpitTweet[];
}

interface MentionExcerpt {
  id: string;
  /** ISO timestamp of the tweet (not the chart anchor date). */
  ts: string | null;
  /** One-line summary: prefers enrichment key_claim, falls back to text excerpt. */
  summary: string;
}

interface Row {
  date: string;
  close: number;
  mentionY: number | null;
  count: number;
  likes: number;
  excerpts: MentionExcerpt[];
}

interface ChartSize {
  width: number;
  height: number;
}

const EXCERPT_MAX = 80;
const TOOLTIP_SHOW = 2;

function summarize(t: KolCockpitTweet): string {
  const claim = (t.key_claim || '').trim();
  if (claim) return claim;
  const text = (t.text || '').replace(/\s+/g, ' ').trim();
  return text.length > EXCERPT_MAX ? `${text.slice(0, EXCERPT_MAX)}…` : text;
}

function formatTweetTime(ts: string | null): string {
  if (!ts) return '';
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return '';
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  return `${d.getFullYear()}-${m}-${day} ${hh}:${mm}`;
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

function ChartTooltip({ active, payload, ticker }: { active?: boolean; payload?: Array<{ payload: Row }>; ticker: string }) {
  if (!active || !payload?.length) return null;
  const row = payload[0].payload;
  const shown = row.excerpts.slice(0, TOOLTIP_SHOW);
  const more = Math.max(0, row.excerpts.length - shown.length);
  return (
    <div className="max-w-[22rem] rounded-md border border-border bg-popover px-3 py-2 text-xs shadow-lg">
      <div className="flex items-baseline justify-between gap-3">
        <span className="font-data tabular-nums text-foreground">{row.date}</span>
        <span className="text-muted-foreground">
          收盘 <span className="font-data tabular-nums">{formatStockPrice(row.close, ticker, undefined, { compactPrice: true })}</span>
        </span>
      </div>
      {row.count > 0 ? (
        <div className="mt-1.5 space-y-1.5 border-t border-border/40 pt-1.5">
          {shown.map((ex) => (
            <div key={ex.id} className="space-y-0.5">
              <p className="font-data text-micro font-medium uppercase tracking-[0.14em] text-muted-foreground">
                {formatTweetTime(ex.ts)}
              </p>
              <p className="leading-snug text-foreground">{ex.summary || '(无摘要)'}</p>
            </div>
          ))}
          {more > 0 ? (
            <p className="font-data text-micro font-medium uppercase tracking-[0.14em] text-muted-foreground">
              +{more} 条
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

export default function PriceTimelineChart({ ticker, priceSeries, tweets }: Props) {
  const chartFrameRef = useRef<HTMLDivElement | null>(null);
  const [chartSize, setChartSize] = useState<ChartSize | null>(null);

  const data = useMemo<Row[]>(() => {
    if (!priceSeries.length) return [];
    const sortedDates = priceSeries.map((p) => p.date);
    const priceByDate = new Map(priceSeries.map((p) => [p.date, p.close]));
    const agg = new Map<string, { count: number; likes: number; excerpts: MentionExcerpt[] }>();
    for (const t of tweets) {
      const raw = t.created_at?.slice(0, 10);
      if (!raw) continue;
      const anchor = priceByDate.has(raw) ? raw : nearestTradingDate(sortedDates, raw);
      if (!anchor) continue;
      const cur = agg.get(anchor) ?? { count: 0, likes: 0, excerpts: [] };
      cur.count += 1;
      cur.likes += t.like_count || 0;
      cur.excerpts.push({ id: t.id, ts: t.created_at, summary: summarize(t) });
      agg.set(anchor, cur);
    }
    // Newest-first within an anchor day so the tooltip leads with the most recent take.
    for (const v of agg.values()) {
      v.excerpts.sort((a, b) => (b.ts || '').localeCompare(a.ts || ''));
    }
    return priceSeries.map((p) => {
      const a = agg.get(p.date);
      return {
        date: p.date,
        close: p.close,
        mentionY: a ? p.close : null,
        count: a?.count || 0,
        likes: a?.likes || 0,
        excerpts: a?.excerpts ?? [],
      };
    });
  }, [priceSeries, tweets]);

  useEffect(() => {
    const node = chartFrameRef.current;
    if (!node) return;

    const updateSize = () => {
      const rect = node.getBoundingClientRect();
      const width = Math.round(rect.width);
      const height = Math.round(rect.height);
      if (width <= 0 || height <= 0) return;
      setChartSize((prev) => (prev?.width === width && prev.height === height ? prev : { width, height }));
    };

    updateSize();

    if (typeof ResizeObserver === 'undefined') {
      window.addEventListener('resize', updateSize);
      return () => window.removeEventListener('resize', updateSize);
    }

    const observer = new ResizeObserver(updateSize);
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  if (!priceSeries.length) {
    return (
      <div className="flex h-72 items-center justify-center rounded-md border border-dashed border-border/60 bg-card/30 text-sm text-muted-foreground">
        暂无价格数据，下方为原文时间线
      </div>
    );
  }

  return (
    <div>
      <div ref={chartFrameRef} className="h-72 w-full">
        {chartSize ? (
          <ComposedChart
            data={data}
            height={chartSize.height}
            margin={{ top: 8, right: 4, bottom: 4, left: 4 }}
            width={chartSize.width}
          >
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
              width={64}
              tickFormatter={(v: number) => formatStockPrice(v, ticker, undefined, { compactPrice: true })}
            />
            <ZAxis dataKey="likes" range={[24, 280]} />
            <Tooltip content={<ChartTooltip ticker={ticker} />} cursor={{ stroke: 'var(--border)', strokeDasharray: '3 3' }} />
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
        ) : null}
      </div>
      <div className="mt-2 flex flex-wrap items-center justify-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full border border-primary bg-primary/40" aria-hidden />
          提及时点
        </span>
        <span>点越大，当日赞越多</span>
      </div>
    </div>
  );
}
