'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

import {
  api,
  type KolCockpitFeedItem,
  type KolCockpitTickerSummary,
} from '@/lib/api';
import { useKolCockpitSectorsV3 } from '@/hooks/queries/use-kol-data';
import FeedFilterBar, { type FeedFilterValue } from './FeedFilterBar';
import HotTickersRail from './HotTickersRail';
import TweetFeedCard from './TweetFeedCard';
import { FeedListSkeleton } from './Skeletons';

interface Props {
  username: string;
  tickers: KolCockpitTickerSummary[];
}

const PAGE_SIZE = 20;

export default function LiveFeed({ username, tickers }: Props) {
  const [filter, setFilter] = useState<FeedFilterValue>({ sector: null, ticker: null });
  const [items, setItems] = useState<KolCockpitFeedItem[]>([]);
  const [total, setTotal] = useState<number | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const loadKey = useRef(0);
  const sentinelRef = useRef<HTMLDivElement | null>(null);

  // Shared with sector page & overview via TanStack Query cache.
  const sectorsQ = useKolCockpitSectorsV3(username);
  const sectors = sectorsQ.data?.sectors ?? [];

  // Initial + filter-change fetch.
  useEffect(() => {
    const myKey = ++loadKey.current;
    setLoading(true);
    setError(null);
    api.kolResearch
      .cockpitFeed(username, {
        limit: PAGE_SIZE,
        offset: 0,
        sector: filter.sector,
        ticker: filter.ticker,
      })
      .then((res) => {
        if (myKey !== loadKey.current) return;
        setItems(res.tweets);
        setTotal(res.total);
        setHasMore(res.has_more);
      })
      .catch(() => {
        if (myKey !== loadKey.current) return;
        setError('加载失败');
      })
      .finally(() => {
        if (myKey !== loadKey.current) return;
        setLoading(false);
      });
  }, [username, filter.sector, filter.ticker]);

  const loadMore = useCallback(async () => {
    if (loadingMore || !hasMore || loading) return;
    setLoadingMore(true);
    const myKey = loadKey.current;
    try {
      const res = await api.kolResearch.cockpitFeed(username, {
        limit: PAGE_SIZE,
        offset: items.length,
        sector: filter.sector,
        ticker: filter.ticker,
      });
      if (myKey !== loadKey.current) return;
      setItems((prev) => [...prev, ...res.tweets]);
      setHasMore(res.has_more);
    } catch {
      // swallow — user can manually retry by scrolling again
    } finally {
      if (myKey === loadKey.current) setLoadingMore(false);
    }
  }, [username, items.length, filter.sector, filter.ticker, hasMore, loadingMore, loading]);

  // Intersection observer for infinite scroll.
  useEffect(() => {
    const node = sentinelRef.current;
    if (!node) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) loadMore();
      },
      { rootMargin: '320px 0px' },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [loadMore]);

  return (
    <div className="pb-12">
      <FeedFilterBar
        value={filter}
        onChange={setFilter}
        sectors={sectors}
        resultCount={total}
      />

      <div className="flex gap-10">
        {/* Feed column */}
        <div className="min-w-0 flex-1">
          {loading ? (
            <FeedListSkeleton rows={5} />
          ) : error ? (
            <FeedError onRetry={() => setFilter({ ...filter })} />
          ) : items.length === 0 ? (
            <FeedEmpty onClear={() => setFilter({ sector: null, ticker: null })} />
          ) : (
            <>
              <div className="divide-y divide-border/40">
                {items.map((item, idx) => (
                  <TweetFeedCard
                    key={item.id}
                    item={item}
                    staggerMs={idx < 6 ? idx * 60 : undefined}
                  />
                ))}
              </div>

              {/* Infinite scroll sentinel + manual trigger */}
              <div ref={sentinelRef} className="pt-8 text-center">
                {hasMore ? (
                  <button
                    onClick={loadMore}
                    disabled={loadingMore}
                    className="inline-flex items-center gap-1.5 rounded-md border border-border/60 px-4 py-2 font-data text-xs uppercase tracking-[0.14em] text-muted-foreground transition hover:border-primary/40 hover:text-foreground disabled:opacity-50"
                  >
                    {loadingMore ? '载入中' : '加载更多'}
                  </button>
                ) : (
                  <div className="font-data text-[11px] uppercase tracking-[0.18em] text-muted-foreground/70">
                    已到底
                  </div>
                )}
              </div>
            </>
          )}
        </div>

        {/* Right rail */}
        <HotTickersRail
          tickers={tickers}
          activeTicker={filter.ticker}
          onSelectTicker={(tk) =>
            setFilter((f) => ({ sector: null, ticker: f.ticker === tk ? null : tk }))
          }
        />
      </div>
    </div>
  );
}

function FeedEmpty({ onClear }: { onClear: () => void }) {
  return (
    <div className="py-20 text-center">
      <p className="font-data text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
        当前筛选无命中推文
      </p>
      <button
        onClick={onClear}
        className="mt-4 rounded-md border border-border/60 px-4 py-2 text-sm text-muted-foreground transition hover:border-primary/40 hover:text-foreground"
      >
        清除筛选
      </button>
    </div>
  );
}

function FeedError({ onRetry }: { onRetry: () => void }) {
  return (
    <div className="py-20 text-center">
      <p className="text-sm text-destructive">无法获取最新推文 · 请检查网络或稍后重试</p>
      <button
        onClick={onRetry}
        className="mt-4 rounded-md border border-border/60 px-4 py-2 text-sm text-muted-foreground transition hover:border-primary/40 hover:text-foreground"
      >
        重新加载
      </button>
    </div>
  );
}
