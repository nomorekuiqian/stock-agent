'use client';

import { useState } from 'react';
import Link from 'next/link';
import { ArrowUpRight, TrendingUp, TrendingDown } from 'lucide-react';

import { useKolTickerDetail } from '@/hooks/queries/use-kol-data';
import type { KolCockpitTweet } from '@/lib/api';
import PriceTimelineChart from './PriceTimelineChart';
import TweetFeedCard from './TweetFeedCard';
import TickerNarrative from './TickerNarrative';
import { IndustryChainSkeleton } from './Skeletons';

interface Props {
  username: string;
  ticker: string | null;
}

type ExcerptTab = 'latest' | 'top';

export default function TickerDetail({ username, ticker }: Props) {
  const { data: detail, isLoading, isError } = useKolTickerDetail(username, ticker);
  const [tab, setTab] = useState<ExcerptTab>('latest');

  if (!ticker) {
    return <EmptyState />;
  }

  if (isLoading || !detail) {
    if (isError) {
      return (
        <div className="py-20 text-center">
          <p className="text-sm text-destructive">无法获取个股详情 · 请检查网络或稍后重试</p>
        </div>
      );
    }
    return <IndustryChainSkeleton />;
  }

  const tweetsByLikes = [...detail.tweets].sort(
    (a, b) => (b.like_count || 0) - (a.like_count || 0),
  );
  const visible = (tab === 'latest' ? detail.tweets : tweetsByLikes).slice(0, 8);
  const chatHref = `/research?agent=kol&persona=${encodeURIComponent(username)}&symbol=${encodeURIComponent(detail.ticker)}`;

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="border-b border-border/40 pb-5">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <p className="font-data text-[10px] uppercase tracking-[0.22em] text-muted-foreground">
                {detail.market.sector || '—'} · 提及 {detail.count} 次
              </p>
              {detail.summary?.coverage ? (
                <span className="rounded-sm border border-border/60 bg-card/50 px-1.5 py-0.5 font-data text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
                  {detail.summary.coverage === 'high'
                    ? '深度覆盖'
                    : detail.summary.coverage === 'medium'
                      ? '中度覆盖'
                      : '轻度提及'}
                </span>
              ) : null}
            </div>
            <div className="mt-1 flex flex-wrap items-baseline gap-3">
              <h2 className="font-editorial text-3xl tracking-tight text-foreground md:text-[34px]">
                ${detail.ticker}
              </h2>
              <PriceDisplay
                price={detail.market.price}
                change={detail.market.daily_change}
              />
            </div>
            {detail.market.name ? (
              <p className="mt-1 text-sm text-muted-foreground">{detail.market.name}</p>
            ) : null}
          </div>
          <Link
            href={chatHref}
            className="inline-flex shrink-0 items-center gap-1.5 rounded-md border border-primary/30 bg-primary/10 px-3.5 py-2 text-sm font-medium text-primary transition hover:border-primary hover:bg-primary/15"
          >
            问问他怎么看
            <ArrowUpRight className="h-3.5 w-3.5" />
          </Link>
        </div>

        {/* Basics row */}
        <div className="mt-5 grid grid-cols-2 gap-x-6 gap-y-3 border-t border-border/40 pt-4 md:grid-cols-4">
          <Stat label="提及次数" value={`${detail.count}`} />
          <Stat label="PE (TTM)" value={detail.market.pe_ttm != null ? detail.market.pe_ttm.toFixed(1) : '—'} />
          <Stat label="首次提及" value={shortDate(detail.first)} />
          <Stat label="最新提及" value={shortDate(detail.latest)} />
        </div>
      </div>

      {/* Plain-prose narrative — 3-4 short paragraphs of his actual logic */}
      {detail.summary ? (
        <TickerNarrative summary={detail.summary} />
      ) : null}

      {/* Chart */}
      <div className="border-b border-border/40 py-6">
        <div className="mb-3 flex items-baseline justify-between">
          <p className="font-data text-[10px] uppercase tracking-[0.22em] text-muted-foreground">
            价格 × 提及时间线
          </p>
          {detail.priceable ? null : (
            <p className="font-data text-[10px] uppercase tracking-[0.14em] text-muted-foreground/70">
              非美股 · 无报价
            </p>
          )}
        </div>
        <PriceTimelineChart priceSeries={detail.price_series} tweets={detail.tweets} />
      </div>

      {/* Tweet excerpts */}
      <div className="pt-6">
        <div className="mb-3 flex items-center justify-between">
          <p className="font-data text-[10px] uppercase tracking-[0.22em] text-muted-foreground">
            原文摘录
          </p>
          <div className="flex items-center gap-1 rounded-md border border-border/60 p-0.5">
            <TabButton active={tab === 'latest'} onClick={() => setTab('latest')}>
              最新表态
            </TabButton>
            <TabButton active={tab === 'top'} onClick={() => setTab('top')}>
              高赞观点
            </TabButton>
          </div>
        </div>

        {visible.length === 0 ? (
          <p className="py-8 text-center font-data text-[11px] uppercase tracking-[0.14em] text-muted-foreground">
            暂无相关原文
          </p>
        ) : (
          <div className="divide-y divide-border/40">
            {visible.map((tweet, idx) => (
              <TweetFeedCard
                key={tweet.id}
                item={toFeedItem(tweet)}
                staggerMs={idx < 4 ? idx * 60 : undefined}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function toFeedItem(t: KolCockpitTweet) {
  return {
    id: t.id,
    text: t.text,
    created_at: t.created_at,
    url: t.url,
    like_count: t.like_count,
    retweet_count: t.retweet_count,
    reply_count: t.reply_count,
    tweet_type: t.tweet_type,
    tickers: t.tickers,
    sectors: [] as string[],
    reply_kind: t.reply_kind ?? null,
  };
}

function PriceDisplay({ price, change }: { price: number | null; change: number | null }) {
  if (price == null) {
    return (
      <span className="font-data text-sm text-muted-foreground">无报价</span>
    );
  }
  const hasChange = change != null;
  const up = (change ?? 0) > 0;
  const flat = (change ?? 0) === 0;
  const ChangeIcon = !hasChange || flat ? null : up ? TrendingUp : TrendingDown;
  const color = !hasChange || flat
    ? 'text-muted-foreground'
    : up
      ? 'text-primary'
      : 'text-destructive';
  return (
    <span className={`flex items-baseline gap-2 font-data text-xl tabular-nums ${color}`}>
      {price.toFixed(2)}
      {hasChange && ChangeIcon ? (
        <span className="inline-flex items-center gap-0.5 text-sm">
          <ChangeIcon className="h-3.5 w-3.5" />
          {Math.abs(change!).toFixed(2)}%
        </span>
      ) : null}
    </span>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="font-data text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
        {label}
      </p>
      <p className="mt-1 font-data text-sm text-foreground tabular-nums">{value}</p>
    </div>
  );
}

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={`rounded-sm px-2.5 py-1 font-data text-[11px] uppercase tracking-[0.14em] transition ${
        active ? 'bg-primary/10 text-primary' : 'text-muted-foreground hover:text-foreground'
      }`}
    >
      {children}
    </button>
  );
}

function EmptyState() {
  return (
    <div className="flex h-96 items-center justify-center text-center">
      <p className="font-data text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
        左侧选择标的查看他的历史观点
      </p>
    </div>
  );
}

function shortDate(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  const y = String(d.getFullYear()).slice(2);
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}
