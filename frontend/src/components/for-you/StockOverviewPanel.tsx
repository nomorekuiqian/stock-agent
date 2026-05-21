'use client';

import { useState, useEffect, useMemo } from 'react';
import {
  StockAnalysis,
  HoldingView,
  DigestHeadlineNews,
  DigestBriefNews,
  DigestEvent,
} from '@/lib/api';
import { sortByVolatility, isNotableMove, parseChangePercent } from '@/lib/digest-utils';
import { formatCalendarDate, isMarketToday } from '@/lib/timezone';
import { STOCK_NAMES } from '@/lib/stock-names';
import StockListItem from './StockListItem';
import StockDetailPanel from './StockDetailPanel';
import Link from 'next/link';
import { FeedbackBar } from '@/components/memory/FeedbackBar';

interface StockOverviewPanelProps {
  stocks: StockAnalysis[];
  digestDate?: string;
  thesisMap?: Record<string, string>;
  onThesisSaved?: (symbol: string, thesis: string) => void;
  /**
   * V1 callers (legacy `/for-you` page) omit this — entire `stocks` array is
   * rendered flat, no portfolio sectioning.
   *
   * V2 callers pass either:
   *   - `portfolioSymbols` (legacy V2 shape): a Set used to split `stocks`
   *     into portfolio vs watchlist sections. Kept for backward compat with
   *     V1 → V2 migration; new code should prefer `holdings`.
   *   - `holdings` (new V2 shape): the full HoldingView list (truth source).
   *     Renders 我的持仓 from `holdings` directly so it stays correct even
   *     when the cached digest is stale or the LLM dropped a symbol.
   */
  portfolioSymbols?: Set<string>;
  holdings?: HoldingView[];
  portfolioWeightMap?: Record<string, number>;
  portfolioSummary?: string;
  totalMarketValue?: number;
  totalDailyChange?: number;
  totalDailyChangePct?: number;
  /**
   * Optional digest news/events passed through from `DigestInlineReport`. Used
   * by the per-holding fallback panel (when `digest.stocks` doesn't include
   * a holding) to filter by symbol — pure data composition, no extra LLM
   * call. Without these the fallback degrades to thesis/PnL only.
   */
  headlines?: DigestHeadlineNews[];
  briefs?: DigestBriefNews[];
  events?: DigestEvent[];
}

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

/** Filter ghost rows: a holding is "visible" if it has any quantitative data. */
function isVisibleHolding(h: HoldingView): boolean {
  return (
    (h.effective_weight_pct ?? 0) > 0
    || h.shares != null
    || h.cost_basis != null
    || h.weight_pct != null
  );
}

function getDisplayName(symbol: string, fallbackName?: string): string {
  if (symbol === '$CASH') return '现金';
  const info = STOCK_NAMES[symbol];
  return info?.zh || info?.en || fallbackName || symbol;
}

function filterBySymbol<T extends { related_symbols: string[] }>(
  items: T[] | undefined,
  symbol: string,
): T[] {
  if (!items || items.length === 0) return [];
  return items.filter((i) => i.related_symbols?.includes(symbol));
}

/* ------------------------------------------------------------------ */
/* HoldingFallbackPanel — shown when digest.stocks has no entry for    */
/* this holding. Composes thesis / P&L / news / events from existing   */
/* data — zero extra LLM cost.                                          */
/* ------------------------------------------------------------------ */

function HoldingFallbackPanel({
  holding,
  thesis,
  headlines,
  briefs,
  events,
}: {
  holding: HoldingView;
  thesis?: string;
  headlines?: DigestHeadlineNews[];
  briefs?: DigestBriefNews[];
  events?: DigestEvent[];
}) {
  const isCash = holding.symbol === '$CASH';
  const displayName = getDisplayName(holding.symbol);
  // Prefer caller-provided thesisMap entry, fall back to the thesis stored on
  // the holding row itself. Either source is fine — both come from
  // user_portfolios.thesis ultimately.
  const effectiveThesis = thesis ?? holding.thesis ?? undefined;

  const relatedHeadlines = useMemo(
    () => filterBySymbol(headlines, holding.symbol),
    [headlines, holding.symbol],
  );
  const relatedBriefs = useMemo(
    () => filterBySymbol(briefs, holding.symbol),
    [briefs, holding.symbol],
  );
  const relatedEvents = useMemo(
    () => filterBySymbol(events, holding.symbol),
    [events, holding.symbol],
  );

  const hasAnyRelated =
    relatedHeadlines.length > 0
    || relatedBriefs.length > 0
    || relatedEvents.length > 0;

  const pnl = holding.unrealized_pnl;
  const pnlPct =
    pnl != null && holding.cost_basis && holding.cost_basis > 0
      ? (pnl / holding.cost_basis) * 100
      : null;

  return (
    <div className="text-sm text-muted-foreground leading-relaxed animate-fade-in">
      {/* Header */}
      <div className="flex items-center gap-3 mb-3">
        <span className="text-lg font-semibold text-foreground">{displayName}</span>
        {!isCash && (
          <Link
            href={`/stock/${holding.symbol}`}
            className="font-data text-sm text-primary hover:text-primary/80 transition-colors"
          >
            {holding.symbol}
          </Link>
        )}
      </div>

      {/* Position snapshot — always visible */}
      {!isCash && (holding.shares != null || holding.cost_basis != null) && (
        <div className="rounded-lg border border-border/30 bg-card/40 p-3 mb-3">
          <div className="grid grid-cols-2 gap-y-1.5 text-xs font-data tabular-nums">
            {holding.shares != null && holding.price != null && (
              <>
                <span className="text-muted-foreground/70">持仓</span>
                <span className="text-right text-foreground">
                  {holding.shares.toLocaleString(undefined, { maximumFractionDigits: 2 })} 股 × $
                  {holding.price.toFixed(2)}
                </span>
              </>
            )}
            {holding.market_value != null && (
              <>
                <span className="text-muted-foreground/70">市值</span>
                <span className="text-right text-foreground font-semibold">
                  ${holding.market_value.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                </span>
              </>
            )}
            {holding.cost_basis != null && holding.cost_basis > 0 && (
              <>
                <span className="text-muted-foreground/70">成本</span>
                <span className="text-right text-foreground">
                  ${holding.cost_basis.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                  {holding.entry_price && holding.entry_price > 0 && (
                    <span className="text-muted-foreground/60 ml-1">
                      (@ ${holding.entry_price.toFixed(2)})
                    </span>
                  )}
                </span>
              </>
            )}
            {pnl != null && (
              <>
                <span className="text-muted-foreground/70">浮盈/亏</span>
                <span
                  className={`text-right font-semibold ${
                    pnl >= 0 ? 'text-emerald-500' : 'text-red-500'
                  }`}
                >
                  {pnl >= 0 ? '+' : ''}${Math.abs(pnl).toLocaleString(undefined, { maximumFractionDigits: 0 })}
                  {pnlPct != null && (
                    <span className="ml-1 font-normal">
                      ({pnl >= 0 ? '+' : ''}{pnlPct.toFixed(1)}%)
                    </span>
                  )}
                </span>
              </>
            )}
          </div>
        </div>
      )}

      {isCash && holding.market_value != null && (
        <div className="rounded-lg border border-border/30 bg-card/40 p-3 mb-3 text-xs">
          <span className="text-muted-foreground/70">现金头寸</span>
          <span className="ml-2 text-foreground font-data font-semibold">
            ${holding.market_value.toLocaleString(undefined, { maximumFractionDigits: 0 })}
          </span>
        </div>
      )}

      {/* User thesis (if recorded) */}
      {effectiveThesis && (
        <div className="rounded-lg border-l-2 border-primary bg-primary/5 px-3 py-2 mb-3">
          <p className="text-[10px] text-primary/80 font-semibold uppercase tracking-wider mb-1">
            你的投资观点
          </p>
          <p className="text-xs text-foreground italic leading-relaxed">{effectiveThesis}</p>
        </div>
      )}

      {/* Related news from today's digest */}
      {relatedHeadlines.length > 0 && (
        <div className="mb-3">
          <p className="text-[10px] text-muted-foreground/70 font-semibold uppercase tracking-wider mb-2">
            今日相关头条
          </p>
          <div className="space-y-2">
            {relatedHeadlines.slice(0, 3).map((n, i) => (
              <div key={`hl-${i}`} className="border-l-2 border-border/50 pl-2.5">
                <a
                  href={n.url || '#'}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs font-medium text-foreground hover:text-primary transition-colors block leading-snug"
                >
                  {n.title}
                </a>
                {n.fact_summary && (
                  <p className="text-[11px] text-muted-foreground mt-1 leading-relaxed">
                    {n.fact_summary}
                  </p>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {relatedBriefs.length > 0 && (
        <div className="mb-3">
          <p className="text-[10px] text-muted-foreground/70 font-semibold uppercase tracking-wider mb-2">
            其他相关新闻
          </p>
          <ul className="space-y-1.5 text-[11px]">
            {relatedBriefs.slice(0, 3).map((n, i) => (
              <li key={`bf-${i}`}>
                <a
                  href={n.url || '#'}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-foreground/80 hover:text-primary transition-colors leading-snug"
                >
                  · {n.title}
                </a>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Related upcoming events */}
      {relatedEvents.length > 0 && (
        <div className="mb-3">
          <p className="text-[10px] text-muted-foreground/70 font-semibold uppercase tracking-wider mb-2">
            临近事件
          </p>
          <div className="space-y-1.5">
            {relatedEvents.slice(0, 3).map((e, i) => {
              const dateStr = e.date?.split('T')[0] ?? '';
              const cal = dateStr ? formatCalendarDate(dateStr) : null;
              const today = dateStr ? isMarketToday(dateStr) : false;
              return (
                <div key={`ev-${i}`} className="flex items-start gap-2">
                  {cal && (
                    <div
                      className={`shrink-0 w-9 rounded text-center text-[9px] py-0.5 border ${
                        today
                          ? 'bg-primary/10 border-primary/30 text-primary'
                          : 'bg-card border-border/40 text-muted-foreground'
                      }`}
                    >
                      <div className="uppercase font-data">{cal.month}</div>
                      <div className="text-sm font-semibold font-data">{cal.day}</div>
                    </div>
                  )}
                  <div className="text-xs text-foreground leading-snug">
                    <span className="font-medium">{e.event}</span>
                    {e.why_important && (
                      <p className="text-[11px] text-muted-foreground mt-0.5">{e.why_important}</p>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Status note + link out */}
      <div className="mt-4 pt-3 border-t border-border/30">
        <p className="text-[11px] text-muted-foreground/70 leading-relaxed">
          {isCash
            ? '现金持仓不参与日报 AI 分析。'
            : hasAnyRelated
              ? '今日日报暂未包含该持仓的 AI 分析，以上是已有的相关数据。'
              : '今日日报暂未包含该持仓的 AI 分析。'}
        </p>
        {!isCash && (
          <Link
            href={`/stock/${holding.symbol}`}
            className="inline-flex items-center gap-1 mt-2 text-xs text-primary hover:text-primary/80 transition-colors"
          >
            查看 {holding.symbol} 完整分析
            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </Link>
        )}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Holding row — sourced from portfolio.holdings (not digest.stocks)   */
/* ------------------------------------------------------------------ */

interface HoldingRowProps {
  holding: HoldingView;
  digestStock?: StockAnalysis;
  isSelected: boolean;
  onSelect: () => void;
}

/**
 * Desktop row for 我的持仓. Shows truth data (shares × price = market_value)
 * always; the digest's daily_change/status is overlaid if the LLM produced
 * an entry for this symbol today, otherwise the row stays informative
 * without that overlay.
 */
function HoldingRow({ holding, digestStock, isSelected, onSelect }: HoldingRowProps) {
  const dailyChangeStr = digestStock?.daily_change;
  const changeValue = dailyChangeStr ? parseChangePercent(dailyChangeStr) : null;
  const isPositive = changeValue != null ? changeValue >= 0 : null;
  const highlight = dailyChangeStr ? isNotableMove(dailyChangeStr) : false;

  let bgClass = '';
  if (isSelected) {
    bgClass = 'bg-card/80';
  } else if (highlight && isPositive != null) {
    bgClass = isPositive ? 'bg-emerald-500/5' : 'bg-red-500/5';
  }

  const displayName = getDisplayName(holding.symbol, digestStock?.name);
  const isCash = holding.symbol === '$CASH';

  return (
    <button
      id={`stock-${holding.symbol}`}
      type="button"
      onClick={onSelect}
      className={`relative w-full text-left transition-colors cursor-pointer hover:bg-card/60 px-3 py-2.5 ${bgClass}`}
    >
      {isSelected && (
        <div className="absolute left-0 top-1/2 -translate-y-1/2 w-0.5 h-5 bg-primary rounded-full" />
      )}

      {/* Row 1: symbol + weight + daily change */}
      <div className="flex items-center justify-between gap-2 mb-1">
        <div className="flex items-center gap-2 min-w-0">
          {isPositive != null ? (
            <span className={`shrink-0 w-1.5 h-1.5 rounded-full ${isPositive ? 'bg-emerald-400' : 'bg-red-400'}`} />
          ) : (
            <span className="shrink-0 w-1.5 h-1.5 rounded-full bg-muted-foreground/30" />
          )}
          <span className="font-semibold font-data text-sm text-foreground truncate">
            {holding.symbol}
          </span>
          {holding.effective_weight_pct > 0 && (
            <span className="text-[11px] text-muted-foreground/70 font-data">
              {holding.effective_weight_pct.toFixed(1)}%
            </span>
          )}
        </div>
        {dailyChangeStr && isPositive != null && (
          <span className={`text-xs font-data font-medium shrink-0 ${isPositive ? 'text-emerald-400' : 'text-red-400'}`}>
            {dailyChangeStr}
          </span>
        )}
      </div>

      {/* Row 2: shares × price = market_value (the new requirement) */}
      <div className="flex items-center justify-between text-[11px] font-data text-muted-foreground/80 tabular-nums">
        <span className="truncate">{displayName}</span>
        <span className="shrink-0 ml-2">
          {isCash ? (
            holding.market_value != null ? `$${holding.market_value.toLocaleString(undefined, { maximumFractionDigits: 0 })}` : '—'
          ) : holding.shares != null && holding.price != null ? (
            <>
              {holding.shares.toLocaleString(undefined, { maximumFractionDigits: 2 })} 股 × $
              {holding.price.toFixed(2)} ={' '}
              <span className="text-foreground font-medium">
                ${(holding.market_value ?? holding.shares * holding.price).toLocaleString(undefined, { maximumFractionDigits: 0 })}
              </span>
            </>
          ) : holding.market_value != null ? (
            <span className="text-foreground font-medium">
              ${holding.market_value.toLocaleString(undefined, { maximumFractionDigits: 0 })}
            </span>
          ) : holding.cost_basis != null ? (
            <>成本 ${holding.cost_basis.toLocaleString(undefined, { maximumFractionDigits: 0 })}</>
          ) : (
            '—'
          )}
        </span>
      </div>
    </button>
  );
}

/* ------------------------------------------------------------------ */
/* Mobile accordion item (legacy — used by watchlist section)          */
/* ------------------------------------------------------------------ */

function MobileStockItem({
  stock,
  isOpen,
  isHighlighted,
  onToggle,
  digestDate,
  weightPct,
}: {
  stock: StockAnalysis;
  isOpen: boolean;
  isHighlighted: boolean;
  onToggle: () => void;
  digestDate?: string;
  weightPct?: number;
}) {
  const changeValue = parseChangePercent(stock.daily_change);
  const isPositive = changeValue >= 0;
  let bgClass = '';
  if (isHighlighted && !isOpen) {
    bgClass = isPositive ? 'bg-emerald-500/5' : 'bg-red-500/5';
  }

  return (
    <div id={`stock-${stock.symbol}`} className={bgClass}>
      {/* Header row — always visible */}
      <button
        type="button"
        onClick={onToggle}
        className="w-full flex items-center justify-between px-1 py-3 text-left cursor-pointer"
      >
        <div className="flex items-center gap-2 min-w-0">
          <span className={`shrink-0 w-1.5 h-1.5 rounded-full ${isPositive ? 'bg-emerald-400' : 'bg-red-400'}`} />
          <span className="font-semibold font-data text-sm text-foreground">{stock.symbol}</span>
          {weightPct != null && (
            <span className="text-[11px] text-muted-foreground/70 font-data">{weightPct.toFixed(1)}%</span>
          )}
          <span className="text-xs text-muted-foreground truncate">{stock.name}</span>
        </div>

        <div className="flex items-center gap-2 shrink-0 ml-2">
          <span className="text-xs font-data text-muted-foreground">${(stock.price ?? 0).toFixed(2)}</span>
          <span className={`text-xs font-data font-medium ${isPositive ? 'text-emerald-400' : 'text-red-400'}`}>
            {stock.daily_change}
          </span>
          <svg
            className={`w-3.5 h-3.5 text-muted-foreground transition-transform ${isOpen ? 'rotate-180' : ''}`}
            fill="none" stroke="currentColor" viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </div>
      </button>

      {isOpen && (
        <div className="pb-4 px-1 animate-fade-in">
          <div className="flex items-center gap-3 mb-2">
            <span className={`font-data text-xs ${isPositive ? 'text-emerald-400' : 'text-red-400'}`}>
              {stock.daily_change}
            </span>
            {stock.week_change && (
              <>
                <span className="text-muted-foreground/70 text-xs">|</span>
                <span className={`font-data text-xs ${(stock.week_change ?? '').startsWith('+') ? 'text-emerald-400' : 'text-red-400'}`}>
                  {stock.week_change} (周)
                </span>
              </>
            )}
          </div>

          <p className="text-base font-medium text-foreground leading-relaxed mb-2">{stock.status}</p>
          <p className="text-sm text-muted-foreground leading-relaxed mb-3">{stock.quick_take}</p>

          <Link
            href={`/stock/${stock.symbol}`}
            className="inline-flex items-center gap-1 text-xs text-primary hover:text-primary/80 transition-colors"
          >
            查看 {stock.symbol} 完整分析
            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </Link>

          {digestDate && (
            <FeedbackBar
              targetType="digest_quick_take"
              targetId={`quick_take:${stock.symbol}:${digestDate}`}
              snapshot={{ text: stock.quick_take?.slice(0, 200) }}
            />
          )}
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Mobile accordion for holding rows (mirrors HoldingRow desktop)      */
/* ------------------------------------------------------------------ */

function MobileHoldingItem({
  holding,
  digestStock,
  isOpen,
  onToggle,
  digestDate,
  thesis,
  headlines,
  briefs,
  events,
}: {
  holding: HoldingView;
  digestStock?: StockAnalysis;
  isOpen: boolean;
  onToggle: () => void;
  digestDate?: string;
  thesis?: string;
  headlines?: DigestHeadlineNews[];
  briefs?: DigestBriefNews[];
  events?: DigestEvent[];
}) {
  const dailyChangeStr = digestStock?.daily_change;
  const changeValue = dailyChangeStr ? parseChangePercent(dailyChangeStr) : null;
  const isPositive = changeValue != null ? changeValue >= 0 : null;
  const highlight = dailyChangeStr ? isNotableMove(dailyChangeStr) : false;
  const displayName = getDisplayName(holding.symbol, digestStock?.name);
  const isCash = holding.symbol === '$CASH';

  let bgClass = '';
  if (highlight && !isOpen && isPositive != null) {
    bgClass = isPositive ? 'bg-emerald-500/5' : 'bg-red-500/5';
  }

  return (
    <div id={`stock-${holding.symbol}`} className={bgClass}>
      <button
        type="button"
        onClick={onToggle}
        className="w-full flex flex-col items-stretch text-left cursor-pointer px-1 py-3 gap-1"
      >
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            {isPositive != null ? (
              <span className={`shrink-0 w-1.5 h-1.5 rounded-full ${isPositive ? 'bg-emerald-400' : 'bg-red-400'}`} />
            ) : (
              <span className="shrink-0 w-1.5 h-1.5 rounded-full bg-muted-foreground/30" />
            )}
            <span className="font-semibold font-data text-sm text-foreground">{holding.symbol}</span>
            {holding.effective_weight_pct > 0 && (
              <span className="text-[11px] text-muted-foreground/70 font-data">
                {holding.effective_weight_pct.toFixed(1)}%
              </span>
            )}
            <span className="text-xs text-muted-foreground truncate">{displayName}</span>
          </div>
          <div className="flex items-center gap-2 shrink-0 ml-2">
            {dailyChangeStr && isPositive != null && (
              <span className={`text-xs font-data font-medium ${isPositive ? 'text-emerald-400' : 'text-red-400'}`}>
                {dailyChangeStr}
              </span>
            )}
            <svg
              className={`w-3.5 h-3.5 text-muted-foreground transition-transform ${isOpen ? 'rotate-180' : ''}`}
              fill="none" stroke="currentColor" viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </div>
        </div>

        <div className="text-[11px] font-data text-muted-foreground/80 tabular-nums pl-4">
          {isCash ? (
            holding.market_value != null ? `$${holding.market_value.toLocaleString(undefined, { maximumFractionDigits: 0 })}` : '—'
          ) : holding.shares != null && holding.price != null ? (
            <>
              {holding.shares.toLocaleString(undefined, { maximumFractionDigits: 2 })} 股 × $
              {holding.price.toFixed(2)} ={' '}
              <span className="text-foreground font-medium">
                ${(holding.market_value ?? holding.shares * holding.price).toLocaleString(undefined, { maximumFractionDigits: 0 })}
              </span>
            </>
          ) : holding.market_value != null ? (
            <span className="text-foreground font-medium">
              ${holding.market_value.toLocaleString(undefined, { maximumFractionDigits: 0 })}
            </span>
          ) : holding.cost_basis != null ? (
            <>成本 ${holding.cost_basis.toLocaleString(undefined, { maximumFractionDigits: 0 })}</>
          ) : (
            '—'
          )}
        </div>
      </button>

      {isOpen && (
        <div className="pb-4 px-1 animate-fade-in">
          {digestStock ? (
            <>
              <p className="text-base font-medium text-foreground leading-relaxed mb-2">{digestStock.status}</p>
              <p className="text-sm text-muted-foreground leading-relaxed mb-3">{digestStock.quick_take}</p>
              <Link
                href={`/stock/${holding.symbol}`}
                className="inline-flex items-center gap-1 text-xs text-primary hover:text-primary/80 transition-colors"
              >
                查看 {holding.symbol} 完整分析
                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </Link>
              {digestDate && (
                <FeedbackBar
                  targetType="digest_quick_take"
                  targetId={`quick_take:${holding.symbol}:${digestDate}`}
                  snapshot={{ text: digestStock.quick_take?.slice(0, 200) }}
                />
              )}
            </>
          ) : (
            <HoldingFallbackPanel
              holding={holding}
              thesis={thesis}
              headlines={headlines}
              briefs={briefs}
              events={events}
            />
          )}
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Portfolio header with totals                                        */
/* ------------------------------------------------------------------ */

function PortfolioHeader({
  count,
  totalMarketValue,
  totalDailyChange,
  totalDailyChangePct,
  portfolioSummary,
}: {
  count: number;
  totalMarketValue?: number;
  totalDailyChange?: number;
  totalDailyChangePct?: number;
  portfolioSummary?: string;
}) {
  const isPositive = (totalDailyChangePct ?? 0) >= 0;
  return (
    <div className="mb-3">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold text-foreground">我的持仓</span>
          <span className="text-[11px] px-2 py-0.5 bg-primary text-primary-foreground rounded-full">{count} 只</span>
        </div>
        {totalMarketValue != null && (
          <div className="text-right">
            <div className="text-lg font-semibold font-data text-foreground">${totalMarketValue.toLocaleString(undefined, { maximumFractionDigits: 0 })}</div>
            {totalDailyChange != null && totalDailyChangePct != null && (
              <div className={`text-xs font-data ${isPositive ? 'text-emerald-500' : 'text-red-500'}`}>
                {isPositive ? '+' : ''}${totalDailyChange.toLocaleString(undefined, { maximumFractionDigits: 0 })} ({isPositive ? '+' : ''}{totalDailyChangePct.toFixed(1)}%) 今日
              </div>
            )}
          </div>
        )}
      </div>
      {portfolioSummary && (
        <div className="px-3 py-2 bg-background rounded-lg border-l-2 border-primary text-xs text-muted-foreground leading-relaxed mb-3">
          {portfolioSummary}
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Portfolio empty state                                               */
/* ------------------------------------------------------------------ */

function PortfolioEmptyState() {
  return (
    <div className="text-center py-6 text-sm text-muted-foreground">
      <p>还没有模拟持仓，添加后可追踪组合表现</p>
      <Link href="/for-you/portfolio" className="inline-block mt-2 text-xs text-primary hover:text-primary/80 transition-colors">
        添加持仓 →
      </Link>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Holdings group — dual-column on desktop, accordion on mobile        */
/* ------------------------------------------------------------------ */

function HoldingsGroup({
  holdings,
  digestStockMap,
  selectedSymbol,
  onSelect,
  digestDate,
  thesisMap,
  onThesisSaved,
  headlines,
  briefs,
  events,
}: {
  holdings: HoldingView[];
  digestStockMap: Record<string, StockAnalysis>;
  selectedSymbol: string;
  onSelect: (sym: string) => void;
  digestDate?: string;
  thesisMap?: Record<string, string>;
  onThesisSaved?: (symbol: string, thesis: string) => void;
  headlines?: DigestHeadlineNews[];
  briefs?: DigestBriefNews[];
  events?: DigestEvent[];
}) {
  if (holdings.length === 0) return null;

  const selectedHolding = holdings.find(h => h.symbol === selectedSymbol) ?? holdings[0];
  const selectedDigestStock = digestStockMap[selectedHolding.symbol];

  return (
    <>
      {/* Desktop: dual-column */}
      <div className="hidden md:grid md:grid-cols-[260px_1fr] gap-4">
        <div className="divide-y divide-border/30 rounded-lg border border-border/30">
          {holdings.map((h) => (
            <HoldingRow
              key={h.symbol}
              holding={h}
              digestStock={digestStockMap[h.symbol]}
              isSelected={h.symbol === selectedHolding.symbol}
              onSelect={() => onSelect(h.symbol)}
            />
          ))}
        </div>

        <div className="md:sticky md:top-4 self-start pl-2">
          {selectedDigestStock ? (
            <StockDetailPanel
              stock={selectedDigestStock}
              digestDate={digestDate}
              thesis={thesisMap?.[selectedHolding.symbol]}
              onThesisSaved={onThesisSaved}
            />
          ) : (
            <HoldingFallbackPanel
              holding={selectedHolding}
              thesis={thesisMap?.[selectedHolding.symbol]}
              headlines={headlines}
              briefs={briefs}
              events={events}
            />
          )}
        </div>
      </div>

      {/* Mobile: accordion */}
      <div className="md:hidden divide-y divide-border/30">
        {holdings.map((h) => (
          <MobileHoldingItem
            key={h.symbol}
            holding={h}
            digestStock={digestStockMap[h.symbol]}
            isOpen={h.symbol === selectedHolding.symbol}
            onToggle={() => onSelect(h.symbol === selectedHolding.symbol ? '' : h.symbol)}
            digestDate={digestDate}
            thesis={thesisMap?.[h.symbol]}
            headlines={headlines}
            briefs={briefs}
            events={events}
          />
        ))}
      </div>
    </>
  );
}

/* ------------------------------------------------------------------ */
/* Stock group — used by watchlist section (and legacy V1 flat view)    */
/* ------------------------------------------------------------------ */

function StockGroup({
  stocks,
  selectedSymbol,
  onSelect,
  digestDate,
  thesisMap,
  onThesisSaved,
  selectedStock,
  weightMap,
}: {
  stocks: StockAnalysis[];
  selectedSymbol: string;
  onSelect: (sym: string) => void;
  digestDate?: string;
  thesisMap?: Record<string, string>;
  onThesisSaved?: (symbol: string, thesis: string) => void;
  selectedStock?: StockAnalysis;
  weightMap?: Record<string, number>;
}) {
  if (stocks.length === 0) return null;

  return (
    <>
      {/* Desktop: dual-column layout */}
      <div className="hidden md:grid md:grid-cols-[260px_1fr] gap-4">
        <div className="divide-y divide-border/30 rounded-lg border border-border/30">
          {stocks.map((stock) => (
            <StockListItem
              key={stock.symbol}
              stock={stock}
              isSelected={stock.symbol === selectedSymbol}
              isHighlighted={isNotableMove(stock.daily_change)}
              onClick={() => onSelect(stock.symbol)}
              weightPct={weightMap?.[stock.symbol]}
            />
          ))}
        </div>

        <div className="md:sticky md:top-4 self-start pl-2">
          {selectedStock && (
            <StockDetailPanel
              stock={selectedStock}
              digestDate={digestDate}
              thesis={thesisMap?.[selectedStock.symbol]}
              onThesisSaved={onThesisSaved}
            />
          )}
        </div>
      </div>

      {/* Mobile: accordion layout */}
      <div className="md:hidden divide-y divide-border/30">
        {stocks.map((stock) => (
          <MobileStockItem
            key={stock.symbol}
            stock={stock}
            isOpen={stock.symbol === selectedSymbol}
            isHighlighted={isNotableMove(stock.daily_change)}
            onToggle={() => onSelect(stock.symbol === selectedSymbol ? '' : stock.symbol)}
            digestDate={digestDate}
            weightPct={weightMap?.[stock.symbol]}
          />
        ))}
      </div>
    </>
  );
}

/* ------------------------------------------------------------------ */
/* Main component                                                      */
/* ------------------------------------------------------------------ */

export default function StockOverviewPanel({
  stocks,
  digestDate,
  thesisMap,
  onThesisSaved,
  portfolioSymbols,
  holdings,
  portfolioWeightMap,
  portfolioSummary,
  totalMarketValue,
  totalDailyChange,
  totalDailyChangePct,
  headlines,
  briefs,
  events,
}: StockOverviewPanelProps) {
  const sorted = useMemo(() => sortByVolatility(stocks), [stocks]);

  // Truth-source portfolio rows (V2 new shape). When `holdings` is provided,
  // 我的持仓 is sourced from it regardless of whether each symbol appears in
  // digest.stocks — fixes the stale-cache / LLM-dropped-symbol bug where
  // 我的持仓 silently became a subset of the portfolio.
  const visibleHoldings = useMemo(
    () => (holdings ?? []).filter(isVisibleHolding),
    [holdings],
  );

  // Effective portfolio symbol set: prefer the holdings-derived set; fall
  // back to the legacy `portfolioSymbols` prop for callers that pass it.
  const effectivePortfolioSymbols = useMemo(() => {
    if (holdings) return new Set(visibleHoldings.map((h) => h.symbol));
    return portfolioSymbols;
  }, [holdings, visibleHoldings, portfolioSymbols]);

  // Map from symbol → digest stock entry, for overlay on holding rows.
  const digestStockMap = useMemo(() => {
    const map: Record<string, StockAnalysis> = {};
    for (const s of stocks) map[s.symbol] = s;
    return map;
  }, [stocks]);

  // V1 callers pass neither portfolioSymbols nor holdings → flat list, no
  // sectioning.
  const portfolioMode = effectivePortfolioSymbols !== undefined;
  const hasPortfolio = portfolioMode && effectivePortfolioSymbols!.size > 0;

  // Watchlist = digest.stocks - portfolio symbols. Stays sourced from
  // digest.stocks (mirrors V1 behavior); the bug only affected the portfolio
  // half.
  const watchlistStocks = hasPortfolio
    ? sorted.filter((s) => !effectivePortfolioSymbols!.has(s.symbol))
    : sorted;

  // Default-select first holding (when present), else first watchlist stock.
  const initialSelectedSymbol =
    visibleHoldings[0]?.symbol ?? sorted[0]?.symbol ?? '';
  const [selectedSymbol, setSelectedSymbol] = useState(initialSelectedSymbol);

  // Hash-based deep link: #stock-AAPL scrolls to and highlights that stock.
  useEffect(() => {
    const handleHash = () => {
      const hash = window.location.hash;
      if (!hash.startsWith('#stock-')) return;
      const sym = hash.slice(7);
      const allSyms = [
        ...visibleHoldings.map((h) => h.symbol),
        ...sorted.map((s) => s.symbol),
      ];
      const exists = allSyms.includes(sym);
      if (!exists) {
        history.replaceState(null, '', window.location.pathname + window.location.search);
        return;
      }
      setSelectedSymbol(sym);
      requestAnimationFrame(() => {
        const el = document.getElementById(`stock-${sym}`);
        if (el) {
          el.scrollIntoView({ behavior: 'smooth', block: 'center' });
          el.classList.add('ring-2', 'ring-primary', 'ring-offset-2');
          setTimeout(() => el.classList.remove('ring-2', 'ring-primary', 'ring-offset-2'), 3000);
        }
      });
      history.replaceState(null, '', window.location.pathname + window.location.search);
    };
    window.addEventListener('hashchange', handleHash);
    handleHash();
    return () => window.removeEventListener('hashchange', handleHash);
  }, [sorted, visibleHoldings]);

  if (sorted.length === 0 && !hasPortfolio && visibleHoldings.length === 0) {
    return null;
  }

  // Branching: when caller passes `holdings`, use the truth-source path.
  const useHoldingsPath = holdings !== undefined;

  return (
    <div className="space-y-6">
      {/* Portfolio section */}
      {portfolioMode && !hasPortfolio && <PortfolioEmptyState />}

      {useHoldingsPath && visibleHoldings.length > 0 && (
        <>
          <PortfolioHeader
            count={visibleHoldings.length}
            totalMarketValue={totalMarketValue}
            totalDailyChange={totalDailyChange}
            totalDailyChangePct={totalDailyChangePct}
            portfolioSummary={portfolioSummary}
          />
          <HoldingsGroup
            holdings={visibleHoldings}
            digestStockMap={digestStockMap}
            selectedSymbol={selectedSymbol}
            onSelect={setSelectedSymbol}
            digestDate={digestDate}
            thesisMap={thesisMap}
            onThesisSaved={onThesisSaved}
            headlines={headlines}
            briefs={briefs}
            events={events}
          />
        </>
      )}

      {/* Legacy V2 path: caller passed portfolioSymbols but not holdings.
          Keep the original digest∩portfolio behavior so we don't break the
          first wave of V2 callers that haven't migrated. */}
      {!useHoldingsPath && hasPortfolio && (() => {
        const portfolioStocks = sorted.filter((s) => effectivePortfolioSymbols!.has(s.symbol));
        return (
          <>
            <PortfolioHeader
              count={portfolioStocks.length || effectivePortfolioSymbols!.size}
              totalMarketValue={totalMarketValue}
              totalDailyChange={totalDailyChange}
              totalDailyChangePct={totalDailyChangePct}
              portfolioSummary={portfolioSummary}
            />
            {portfolioStocks.length === 0 ? (
              <div className="text-center py-4 text-sm text-muted-foreground">
                今日日报暂未包含您的持仓分析
              </div>
            ) : (
              <StockGroup
                stocks={portfolioStocks}
                selectedSymbol={selectedSymbol}
                onSelect={setSelectedSymbol}
                digestDate={digestDate}
                thesisMap={thesisMap}
                onThesisSaved={onThesisSaved}
                selectedStock={portfolioStocks.find((s) => s.symbol === selectedSymbol) || portfolioStocks[0]}
                weightMap={portfolioWeightMap}
              />
            )}
          </>
        );
      })()}

      {/* Watchlist section */}
      {watchlistStocks.length > 0 && (
        <div className={portfolioMode && (hasPortfolio || visibleHoldings.length > 0) ? 'pt-2' : ''}>
          {portfolioMode && (hasPortfolio || visibleHoldings.length > 0) && (
            <div className="flex items-center gap-2 mb-3">
              <span className="text-sm font-semibold text-muted-foreground">观察列表</span>
              <span className="text-[11px] px-2 py-0.5 bg-muted text-muted-foreground rounded-full">{watchlistStocks.length} 只</span>
            </div>
          )}
          <StockGroup
            stocks={watchlistStocks}
            selectedSymbol={selectedSymbol}
            onSelect={setSelectedSymbol}
            digestDate={digestDate}
            thesisMap={thesisMap}
            onThesisSaved={onThesisSaved}
            selectedStock={watchlistStocks.find((s) => s.symbol === selectedSymbol) || watchlistStocks[0]}
          />
        </div>
      )}
    </div>
  );
}
