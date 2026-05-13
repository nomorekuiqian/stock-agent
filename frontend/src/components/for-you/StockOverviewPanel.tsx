'use client';

import { useState, useEffect } from 'react';
import { StockAnalysis } from '@/lib/api';
import { sortByVolatility, isNotableMove, parseChangePercent } from '@/lib/digest-utils';
import StockListItem from './StockListItem';
import StockDetailPanel from './StockDetailPanel';
import Link from 'next/link';
import { FeedbackBar } from '@/components/memory/FeedbackBar';

interface StockOverviewPanelProps {
  stocks: StockAnalysis[];
  digestDate?: string;
  thesisMap?: Record<string, string>;
  onThesisSaved?: (symbol: string, thesis: string) => void;
  portfolioSymbols?: Set<string>;
  portfolioWeightMap?: Record<string, number>;
  portfolioSummary?: string;
  totalMarketValue?: number;
  totalDailyChange?: number;
  totalDailyChangePct?: number;
}

/* ------------------------------------------------------------------ */
/* Mobile accordion item                                               */
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
          <span
            className={`shrink-0 w-1.5 h-1.5 rounded-full ${
              isPositive ? 'bg-emerald-400' : 'bg-red-400'
            }`}
          />
          <span className="font-semibold font-data text-sm text-foreground">
            {stock.symbol}
          </span>
          {weightPct != null && (
            <span className="text-[11px] text-muted-foreground/70 font-data">
              {weightPct.toFixed(1)}%
            </span>
          )}
          <span className="text-xs text-muted-foreground truncate">
            {stock.name}
          </span>
        </div>

        <div className="flex items-center gap-2 shrink-0 ml-2">
          <span className="text-xs font-data text-muted-foreground">
            ${(stock.price ?? 0).toFixed(2)}
          </span>
          <span
            className={`text-xs font-data font-medium ${
              isPositive ? 'text-emerald-400' : 'text-red-400'
            }`}
          >
            {stock.daily_change}
          </span>
          <svg
            className={`w-3.5 h-3.5 text-muted-foreground transition-transform ${
              isOpen ? 'rotate-180' : ''
            }`}
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M19 9l-7 7-7-7"
            />
          </svg>
        </div>
      </button>

      {/* Expandable detail */}
      {isOpen && (
        <div className="pb-4 px-1 animate-fade-in">
          <div className="flex items-center gap-3 mb-2">
            <span
              className={`font-data text-xs ${
                isPositive ? 'text-emerald-400' : 'text-red-400'
              }`}
            >
              {stock.daily_change}
            </span>
            {stock.week_change && (
              <>
                <span className="text-muted-foreground/70 text-xs">|</span>
                <span
                  className={`font-data text-xs ${
                    (stock.week_change ?? '').startsWith('+') ? 'text-emerald-400' : 'text-red-400'
                  }`}
                >
                  {stock.week_change} (周)
                </span>
              </>
            )}
          </div>

          <p className="text-base font-medium text-foreground leading-relaxed mb-2">
            {stock.status}
          </p>

          <p className="text-sm text-muted-foreground leading-relaxed mb-3">
            {stock.quick_take}
          </p>

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
/* Stock group — shared desktop + mobile rendering                     */
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
        {/* Left column — stock list */}
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

        {/* Right column — detail panel */}
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
            onToggle={() =>
              onSelect(stock.symbol === selectedSymbol ? '' : stock.symbol)
            }
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
  portfolioWeightMap,
  portfolioSummary,
  totalMarketValue,
  totalDailyChange,
  totalDailyChangePct,
}: StockOverviewPanelProps) {
  const sorted = sortByVolatility(stocks);
  const [selectedSymbol, setSelectedSymbol] = useState(sorted[0]?.symbol ?? '');
  const selectedStock = sorted.find((s) => s.symbol === selectedSymbol) || sorted[0];

  // Hash-based deep link: #stock-AAPL scrolls to and highlights that stock
  useEffect(() => {
    const handleHash = () => {
      const hash = window.location.hash;
      if (!hash.startsWith('#stock-')) return;
      const sym = hash.slice(7);
      const exists = sorted.some((s) => s.symbol === sym);
      if (!exists) {
        // Clear the dead hash so it doesn't linger in the URL bar.
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
  }, [sorted]);

  // V2 callers always pass `portfolioSymbols` (possibly empty Set) to opt into
  // the portfolio sectioning UI. V1 callers omit it → flat stock list, no
  // portfolio header / empty state / "我的持仓·观察列表" headings.
  const portfolioMode = portfolioSymbols !== undefined;
  const hasPortfolio = portfolioMode && portfolioSymbols.size > 0;

  // Split stocks into portfolio vs watchlist
  const portfolioStocks = hasPortfolio
    ? sorted.filter((s) => portfolioSymbols.has(s.symbol))
    : [];
  const watchlistStocks = hasPortfolio
    ? sorted.filter((s) => !portfolioSymbols.has(s.symbol))
    : sorted;

  if (sorted.length === 0 && !hasPortfolio) return null;

  return (
    <div className="space-y-6">
      {/* Portfolio section — only shown in V2 (when portfolioSymbols prop is passed) */}
      {portfolioMode && !hasPortfolio && (
        <PortfolioEmptyState />
      )}

      {hasPortfolio && portfolioStocks.length === 0 && (
        <>
          <PortfolioHeader
            count={portfolioSymbols.size}
            totalMarketValue={totalMarketValue}
            totalDailyChange={totalDailyChange}
            totalDailyChangePct={totalDailyChangePct}
            portfolioSummary={portfolioSummary}
          />
          <div className="text-center py-4 text-sm text-muted-foreground">
            今日日报暂未包含您的持仓分析
          </div>
        </>
      )}

      {hasPortfolio && portfolioStocks.length > 0 && (
        <>
          <PortfolioHeader
            count={portfolioStocks.length}
            totalMarketValue={totalMarketValue}
            totalDailyChange={totalDailyChange}
            totalDailyChangePct={totalDailyChangePct}
            portfolioSummary={portfolioSummary}
          />
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
        </>
      )}

      {/* Watchlist section */}
      {watchlistStocks.length > 0 && (
        <div className={portfolioMode && hasPortfolio ? 'pt-2' : ''}>
          {portfolioMode && hasPortfolio && (
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
