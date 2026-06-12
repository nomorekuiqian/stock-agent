'use client';

import Link from 'next/link';
import { useMemo } from 'react';

import { useStockQuotes } from '@/hooks/queries/use-stock-data';
import { formatStockPrice } from '@/lib/currency';
import { STOCK_NAMES } from '@/lib/stock-names';
import {
  DigestLockedBlur,
  DigestBottomUpgradeCard,
  DigestUpgradeBanner,
} from './DigestLockedBlur';

interface Props {
  symbols: string[];
}

/**
 * Locked variant of the personal-digest page. Section-for-section mirror of
 * `DigestInlineReport` so the layout reads exactly like the paid page:
 *
 *   1. Report header (greeting + symbol chips) — chips show the user's real
 *      tickers because that's their own data, not paid content
 *   2. 持仓概览 — one row per ticker: real ticker + live price + blurred
 *      headlines for that ticker
 *   3. 给你的复盘笔记 — one big prose-style blur
 *   4. 头条新闻 — 3 blurred headline cards (title + fact + analysis)
 *   5. 更多新闻 — 4 blurred brief lines
 *   6. 重要事件 — 3 blurred calendar rows
 *
 * Two MAX-upgrade CTAs anchor the page (mid + bottom).
 */
export default function LockedDigestPreview({ symbols }: Props) {
  const { data: quotesResponse, isLoading: loadingQuotes } = useStockQuotes(symbols);

  const quotes = useMemo(() => {
    const map: Record<string, { symbol: string; price?: number; daily_change?: number; name?: string }> = {};
    if (quotesResponse?.quotes) {
      for (const q of quotesResponse.quotes) {
        map[q.symbol] = q;
      }
    }
    return map;
  }, [quotesResponse]);

  const getDisplayName = (symbol: string) => {
    const names = STOCK_NAMES[symbol];
    return names?.zh || names?.en || quotes[symbol]?.name || symbol;
  };

  return (
    <div className="max-w-5xl mx-auto px-4 md:px-6 py-8 space-y-6">
      {/* 1. Report header — symbol chips visible, greeting prose blurred */}
      <section>
        <DigestLockedBlur label="今日开场白" lines={2} />
        <div className="mt-4 flex flex-wrap gap-1.5">
          {symbols.map((sym) => (
            <Link
              key={sym}
              href={`/stock/${sym}`}
              className="px-2 py-1 bg-primary/10 text-primary border border-primary/20 rounded text-xs font-data hover:bg-primary/20 transition-colors"
            >
              {sym}
            </Link>
          ))}
        </div>
      </section>

      {/* 2. 持仓概览 */}
      <section className="terminal-card p-6">
        <SectionHeader title="持仓概览" />
        <div className="divide-y divide-border/30">
          {symbols.map((symbol) => (
            <HoldingPlaceholder
              key={symbol}
              symbol={symbol}
              name={getDisplayName(symbol)}
              price={quotes[symbol]?.price}
              change={quotes[symbol]?.daily_change}
              loading={loadingQuotes}
            />
          ))}
        </div>
      </section>

      {/* Mid-page CTA — placed after the user has scrolled their holdings */}
      <DigestUpgradeBanner />

      {/* 3. 给你的复盘笔记 */}
      <section className="terminal-card p-6">
        <SectionHeader title="给你的复盘笔记" subtitle="综合你的持仓、关注列表与今日相关新闻" />
        <DigestLockedBlur label="今日复盘" lines={6} />
      </section>

      {/* 4. 头条新闻 — 3 cards, each = title + fact_summary + deep_analysis */}
      <section className="terminal-card p-6">
        <SectionHeader title="头条新闻" />
        <div className="divide-y divide-border/30">
          {[0, 1, 2].map((i) => (
            <div key={i} className="py-4 first:pt-0 last:pb-0 space-y-2">
              <DigestLockedBlur label={i === 0 ? '今日头条' : undefined} lines={1} />
              <DigestLockedBlur lines={2} />
              <DigestLockedBlur lines={3} />
            </div>
          ))}
        </div>
      </section>

      {/* 5. 更多新闻 — shorter rows */}
      <section className="terminal-card p-6">
        <SectionHeader title="更多新闻" />
        <div className="divide-y divide-border/30">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="py-3 first:pt-0 last:pb-0 space-y-1.5">
              <DigestLockedBlur lines={1} />
              <DigestLockedBlur lines={2} />
            </div>
          ))}
        </div>
      </section>

      {/* 6. 重要事件 — calendar rows */}
      <section className="terminal-card p-6">
        <SectionHeader title="重要事件" />
        <div className="space-y-4">
          {[0, 1, 2].map((i) => (
            <div key={i} className="flex gap-4">
              <div className="flex-shrink-0 w-14 rounded-lg p-2 text-center border border-border/30 bg-card">
                <p className="text-xs font-data uppercase text-muted-foreground/60">···</p>
                <p className="text-xl font-semibold font-data text-muted-foreground/40">··</p>
              </div>
              <div className="flex-1 min-w-0 space-y-1.5">
                <DigestLockedBlur lines={1} />
                <DigestLockedBlur lines={2} />
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Bottom CTA */}
      <DigestBottomUpgradeCard />
    </div>
  );
}

function SectionHeader({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <div className="mb-5">
      <div className="flex items-center gap-2">
        <div className="w-1 h-5 bg-primary rounded-full" />
        <h3 className="text-sm font-medium text-foreground uppercase tracking-wider">{title}</h3>
      </div>
      {subtitle && <p className="mt-2 text-xs text-muted-foreground">{subtitle}</p>}
    </div>
  );
}

/**
 * Per-holding placeholder — mirrors the real `HoldingFallbackPanel` shell:
 *   - header: 公司名 + ticker link
 *   - position snapshot blur (would carry shares/cost/P&L for paid users)
 *   - 今日相关头条 blur (filtered headlines for this symbol)
 *
 * Live ticker price + daily change are real and shown unblurred.
 */
function HoldingPlaceholder({
  symbol,
  name,
  price,
  change,
  loading,
}: {
  symbol: string;
  name: string;
  price?: number;
  change?: number;
  loading: boolean;
}) {
  const hasChange = change != null;
  const up = (change ?? 0) > 0;
  const color = !hasChange
    ? 'text-muted-foreground'
    : up
      ? 'text-emerald-500'
      : (change ?? 0) === 0
        ? 'text-muted-foreground'
        : 'text-red-500';

  return (
    <div className="py-4 first:pt-0 last:pb-0">
      <div className="flex items-center justify-between gap-3 mb-3">
        <div className="flex items-center gap-3 min-w-0">
          <span className="text-base font-semibold text-foreground truncate">{name}</span>
          <Link
            href={`/stock/${symbol}`}
            className="font-data text-sm text-primary hover:text-primary/80 transition-colors"
          >
            {symbol}
          </Link>
        </div>
        <span className={`shrink-0 font-data text-sm tabular-nums ${color}`}>
          {loading ? (
            '—'
          ) : price != null ? (
            <>
              {formatStockPrice(price, symbol, undefined, { compactPrice: true })}
              {hasChange && (
                <span className="ml-1.5">
                  {up ? '+' : ''}
                  {change!.toFixed(2)}%
                </span>
              )}
            </>
          ) : (
            '—'
          )}
        </span>
      </div>

      <div className="space-y-2">
        <DigestLockedBlur label="持仓快照" lines={3} />
        <DigestLockedBlur label="今日相关头条" lines={3} />
      </div>
    </div>
  );
}
