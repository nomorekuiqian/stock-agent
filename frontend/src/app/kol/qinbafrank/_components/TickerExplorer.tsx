'use client';

import { useEffect, useMemo, useState } from 'react';
import { Loader2, Search } from 'lucide-react';

import {
  api,
  type KolCockpitTickerSummary,
  type KolCockpitTickerDetail,
  type KolCockpitTweet,
} from '@/lib/api';
import { cn } from '@/lib/utils';
import MentionTimelineChart from './MentionTimelineChart';
import TweetCard from './TweetCard';
import AskFrankButton from './AskFrankButton';

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-3">
      <div className="h-px w-12 bg-gradient-to-r from-primary to-transparent" />
      <span className="text-xs font-medium tracking-[0.2em] uppercase text-primary">{children}</span>
    </div>
  );
}

function changeColor(v: number | null | undefined) {
  if (v == null) return 'text-muted-foreground';
  return v >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400';
}

export default function TickerExplorer({
  username,
  tickers,
}: {
  username: string;
  tickers: KolCockpitTickerSummary[];
}) {
  const [selected, setSelected] = useState<string | null>(tickers[0]?.ticker ?? null);
  const [detail, setDetail] = useState<KolCockpitTickerDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [query, setQuery] = useState('');

  useEffect(() => {
    if (!selected) return;
    let cancelled = false;
    setLoading(true);
    setDetail(null);
    api.kolResearch
      .cockpitTickerDetail(username, selected)
      .then((d) => {
        if (!cancelled) setDetail(d);
      })
      .catch(() => {
        if (!cancelled) setDetail(null);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [username, selected]);

  const filtered = useMemo(() => {
    const q = query.trim().toUpperCase();
    if (!q) return tickers;
    return tickers.filter(
      (t) => t.ticker.includes(q) || t.aliases.some((a) => a.toUpperCase().includes(q)),
    );
  }, [tickers, query]);

  const latest = detail ? detail.tweets.slice(0, 6) : [];
  const topLiked = detail
    ? [...detail.tweets].sort((a, b) => (b.like_count || 0) - (a.like_count || 0)).slice(0, 6)
    : [];

  return (
    <section className="mx-auto max-w-6xl px-4 py-10 md:px-6">
      <div className="mb-6">
        <SectionLabel>STOCK HISTORY · 个股历史观点</SectionLabel>
        <h2 className="mt-3 text-2xl font-semibold tracking-tight text-foreground">他在个股上的历史足迹</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          价格曲线叠加他每次提及的时点。所有摘录均为推文原文逐字，多空情绪未标注，以原文为准。非投资建议。
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-[280px_minmax(0,1fr)]">
        {/* Left: ticker list */}
        <div className="space-y-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="搜索 NVDA / 英伟达…"
              className="w-full rounded-lg border border-border bg-background py-2 pl-9 pr-3 text-sm text-foreground outline-none focus:border-primary"
            />
          </div>
          <div className="max-h-[560px] space-y-1 overflow-y-auto pr-1">
            {filtered.map((t) => {
              const active = selected === t.ticker;
              return (
                <button
                  key={t.ticker}
                  type="button"
                  onClick={() => setSelected(t.ticker)}
                  className={cn(
                    'flex w-full items-center justify-between gap-2 rounded-lg border px-3 py-2 text-left transition-colors',
                    active
                      ? 'border-primary/50 bg-primary/10'
                      : 'border-border/60 bg-card hover:border-border',
                  )}
                >
                  <div>
                    <p className="font-data text-sm font-semibold text-foreground">{t.ticker}</p>
                    <p className="text-xs text-muted-foreground">
                      {t.count} 次 · {(t.latest || '').slice(0, 10)}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="font-data text-sm text-foreground">
                      {t.price != null ? `$${t.price.toFixed(2)}` : '—'}
                    </p>
                    {t.daily_change != null && (
                      <p className={cn('text-xs', changeColor(t.daily_change))}>
                        {t.daily_change >= 0 ? '+' : ''}
                        {t.daily_change.toFixed(2)}%
                      </p>
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Right: detail */}
        <div className="rounded-lg border border-border/60 bg-card p-5">
          {loading && (
            <div className="flex h-72 items-center justify-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin text-primary" /> 加载中
            </div>
          )}

          {!loading && detail && (
            <div className="space-y-5">
              <div className="flex flex-wrap items-end justify-between gap-3">
                <div>
                  <div className="flex items-center gap-3">
                    <h3 className="font-data text-2xl font-bold text-foreground">{detail.ticker}</h3>
                    {detail.market.price != null && (
                      <span className="font-data text-lg text-foreground">${detail.market.price.toFixed(2)}</span>
                    )}
                    {detail.market.daily_change != null && (
                      <span className={cn('text-sm', changeColor(detail.market.daily_change))}>
                        {detail.market.daily_change >= 0 ? '+' : ''}
                        {detail.market.daily_change.toFixed(2)}%
                      </span>
                    )}
                  </div>
                  {detail.market.name && (
                    <p className="mt-0.5 text-sm text-muted-foreground">{detail.market.name}</p>
                  )}
                </div>
                <AskFrankButton
                  context={{ symbol: detail.ticker, q: `按你的框架，现在怎么看 ${detail.ticker}？` }}
                  variant="ghost"
                  label={`问问他怎么看 ${detail.ticker} →`}
                />
              </div>

              {/* basics row */}
              <div className="grid grid-cols-2 gap-3 rounded-lg border border-border/50 bg-background p-3 sm:grid-cols-4">
                <Basic label="提及次数" value={`${detail.count}`} />
                <Basic label="板块" value={detail.market.sector || '—'} />
                <Basic label="PE (TTM)" value={detail.market.pe_ttm != null ? detail.market.pe_ttm.toFixed(1) : '—'} />
                <Basic
                  label="提及区间"
                  value={`${(detail.first || '').slice(2, 10)} ~ ${(detail.latest || '').slice(2, 10)}`}
                />
              </div>

              <MentionTimelineChart priceSeries={detail.price_series} tweets={detail.tweets} />

              <Excerpts latest={latest} topLiked={topLiked} />
            </div>
          )}

          {!loading && !detail && (
            <div className="flex h-72 items-center justify-center text-sm text-muted-foreground">
              选择左侧标的查看他的历史观点
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

function Basic({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs tracking-[0.12em] text-muted-foreground uppercase">{label}</p>
      <p className="mt-1 font-data text-sm text-foreground">{value}</p>
    </div>
  );
}

function Excerpts({
  latest,
  topLiked,
}: {
  latest: KolCockpitTweet[];
  topLiked: KolCockpitTweet[];
}) {
  const [tab, setTab] = useState<'latest' | 'top'>('latest');
  const list = tab === 'latest' ? latest : topLiked;
  return (
    <div>
      <div className="mb-3 flex gap-2">
        <TabBtn active={tab === 'latest'} onClick={() => setTab('latest')}>
          最新表态
        </TabBtn>
        <TabBtn active={tab === 'top'} onClick={() => setTab('top')}>
          高赞观点
        </TabBtn>
      </div>
      <div className="space-y-2">
        {list.length ? (
          list.map((t) => <TweetCard key={t.id} tweet={t} />)
        ) : (
          <p className="text-sm text-muted-foreground">暂无相关原文</p>
        )}
      </div>
    </div>
  );
}

function TabBtn({
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
      type="button"
      onClick={onClick}
      className={cn(
        'rounded-md px-3 py-1.5 text-sm font-medium transition-colors',
        active ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground hover:text-foreground',
      )}
    >
      {children}
    </button>
  );
}
