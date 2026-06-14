'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

import {
  api,
  type KolCockpitFeedItem,
  type KolCockpitTickerSummary,
} from '@/lib/api';
import { useKolCockpitSectors } from '@/hooks/queries/use-kol-data';
import FeedFilterBar, { type FeedFilterValue } from './FeedFilterBar';
import HotTickersRail from './HotTickersRail';
import TweetFeedCard from './TweetFeedCard';
import { FeedListSkeleton } from './Skeletons';

interface Props {
  username: string;
  tickers: KolCockpitTickerSummary[];
  /** Optional topic-tree filter (e.g. 'industry/ai_infra'). Controlled by parent. */
  topic?: string | null;
  /** If provided, ticker filter is controlled by the parent. */
  ticker?: string | null;
  /** Hide the internal top filter bar (used when parent renders its own filters). */
  hideFilterBar?: boolean;
  /** Hide the right hot-tickers rail (used when parent renders a left ticker list). */
  hideTickerRail?: boolean;
  /** Called when the empty-state "清除筛选" button is pressed in controlled mode. */
  onClearFilter?: () => void;
}

const PAGE_SIZE = 20;

export default function LiveFeed({
  username,
  tickers,
  topic = null,
  ticker: controlledTicker,
  hideFilterBar = false,
  hideTickerRail = false,
  onClearFilter,
}: Props) {
  const tickerControlled = controlledTicker !== undefined;
  const [filter, setFilter] = useState<FeedFilterValue>({ sector: null, ticker: null });
  const activeTicker = tickerControlled ? (controlledTicker ?? null) : filter.ticker;
  const activeSector = filter.sector;
  const [items, setItems] = useState<KolCockpitFeedItem[]>([]);
  const [total, setTotal] = useState<number | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const loadKey = useRef(0);
  const sentinelRef = useRef<HTMLDivElement | null>(null);

  // Shared with sector page & overview via TanStack Query cache.
  const sectorsQ = useKolCockpitSectors(username);
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
        sector: activeSector,
        ticker: activeTicker,
        topic,
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
  }, [username, activeSector, activeTicker, topic]);

  const loadMore = useCallback(async () => {
    if (loadingMore || !hasMore || loading) return;
    setLoadingMore(true);
    const myKey = loadKey.current;
    try {
      const res = await api.kolResearch.cockpitFeed(username, {
        limit: PAGE_SIZE,
        offset: items.length,
        sector: activeSector,
        ticker: activeTicker,
        topic,
      });
      if (myKey !== loadKey.current) return;
      setItems((prev) => [...prev, ...res.tweets]);
      setHasMore(res.has_more);
    } catch {
      // swallow — user can manually retry by scrolling again
    } finally {
      if (myKey === loadKey.current) setLoadingMore(false);
    }
  }, [username, items.length, activeSector, activeTicker, topic, hasMore, loadingMore, loading]);

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

  const clearAll = () => {
    if (tickerControlled) {
      onClearFilter?.();
      setFilter({ sector: null, ticker: null });
    } else {
      setFilter({ sector: null, ticker: null });
    }
  };

  return (
    <div className="pb-12">
      {hideFilterBar ? null : (
        <FeedFilterBar
          value={filter}
          onChange={setFilter}
          sectors={sectors}
          resultCount={total}
        />
      )}

      <div className="flex gap-10">
        {/* Feed column */}
        <div className="min-w-0 flex-1">
          {loading ? (
            <FeedListSkeleton rows={5} />
          ) : error ? (
            <FeedError onRetry={() => setFilter({ ...filter })} />
          ) : items.length === 0 ? (
            <FeedEmpty onClear={clearAll} />
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
                    className="inline-flex items-center gap-1.5 rounded-md border border-border/60 px-4 py-2 text-xs font-medium uppercase tracking-[0.14em] text-muted-foreground transition hover:border-primary/40 hover:text-foreground disabled:opacity-50"
                  >
                    {loadingMore ? '载入中' : '加载更多'}
                  </button>
                ) : (
                  <div className="text-xs font-medium uppercase tracking-[0.16em] text-muted-foreground">
                    已到底
                  </div>
                )}
              </div>
            </>
          )}
        </div>

        {/* Right rail */}
        {hideTickerRail ? null : (
          <HotTickersRail
            tickers={tickers}
            activeTicker={activeTicker}
            onSelectTicker={(tk) =>
              setFilter((f) => ({ sector: null, ticker: f.ticker === tk ? null : tk }))
            }
          />
        )}
      </div>
    </div>
  );
}

function FeedEmpty({ onClear }: { onClear: () => void }) {
  return (
    <div className="py-20 text-center">
      <p className="text-xs font-medium uppercase tracking-[0.16em] text-muted-foreground">
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
