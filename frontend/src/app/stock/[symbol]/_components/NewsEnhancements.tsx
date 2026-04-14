'use client';

import { useMemo, useState } from 'react';

// =============================================================================
// Types
// =============================================================================

interface InsiderTrade {
  filing_date: string | null;
  transaction_date: string | null;
  reporting_name: string | null;
  type_of_owner: string | null;
  transaction_type: string | null;
  securities_transacted: number | null;
  price: number | null;
  acquisition_or_disposition: string | null;
}

interface InsiderStats {
  year: number;
  quarter: number;
  totalPurchases: number;
  totalSales: number;
}

interface NewsArticle {
  title: string;
  publishedDate: string;
  source: string;
  url: string;
  summary?: string;
}

interface PriceTargetConsensus {
  targetHigh: number;
  targetLow: number;
  targetConsensus: number;
  targetMedian: number;
}

// =============================================================================
// Insider Trading Section
// =============================================================================

export function InsiderTradingSection({ trades }: {
  trades: InsiderTrade[];
  statistics?: InsiderStats[];
}) {
  const [showAll, setShowAll] = useState(false);

  // Summary
  const summary = useMemo(() => {
    const recent = trades.filter(t => {
      if (!t.transaction_date) return false;
      const d = new Date(t.transaction_date);
      const now = new Date();
      return (now.getTime() - d.getTime()) < 90 * 24 * 60 * 60 * 1000; // 90 days
    });

    let totalBought = 0;
    let totalSold = 0;

    recent.forEach(t => {
      const val = (t.securities_transacted ?? 0) * (t.price ?? 0);
      if (t.acquisition_or_disposition === 'A') {
        totalBought += val;
      } else if (t.acquisition_or_disposition === 'D') {
        totalSold += val;
      }
    });

    return { totalBought, totalSold, netFlow: totalBought - totalSold, count: recent.length };
  }, [trades]);

  if (trades.length === 0) return null;

  const displayTrades = showAll ? trades : trades.slice(0, 8);

  // Filter to only show P-Purchase and S-Sale (skip M-Exempt, etc.)
  const meaningfulTrades = displayTrades.filter(t =>
    t.transaction_type === 'P-Purchase' || t.transaction_type === 'S-Sale'
  );

  function formatValue(v: number): string {
    if (v >= 1e6) return `$${(v / 1e6).toFixed(1)}M`;
    if (v >= 1e3) return `$${(v / 1e3).toFixed(0)}K`;
    return `$${v.toFixed(0)}`;
  }

  return (
    <div>
      {/* Summary Cards */}
      <div className="grid grid-cols-3 gap-3 mb-4">
        <div className="bg-card/40 border border-border/25 rounded-lg p-3 text-center">
          <div className="text-xs text-muted-foreground mb-1">买入</div>
          <div className="text-sm font-data font-medium text-emerald-400">
            {formatValue(summary.totalBought)}
          </div>
        </div>
        <div className="bg-card/40 border border-border/25 rounded-lg p-3 text-center">
          <div className="text-xs text-muted-foreground mb-1">卖出</div>
          <div className="text-sm font-data font-medium text-red-400">
            {formatValue(summary.totalSold)}
          </div>
        </div>
        <div className="bg-card/40 border border-border/25 rounded-lg p-3 text-center">
          <div className="text-xs text-muted-foreground mb-1">净流向</div>
          <div className={`text-sm font-data font-medium ${summary.netFlow >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
            {summary.netFlow >= 0 ? '+' : ''}{formatValue(summary.netFlow)}
          </div>
        </div>
      </div>

      {/* Trade List */}
      {meaningfulTrades.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-card/60">
                <th className="text-left py-2 px-3 text-xs uppercase tracking-wider text-muted-foreground font-medium">交易人</th>
                <th className="text-right py-2 px-3 text-xs uppercase tracking-wider text-muted-foreground font-medium">方向</th>
                <th className="text-right py-2 px-3 text-xs uppercase tracking-wider text-muted-foreground font-medium">金额</th>
                <th className="text-right py-2 px-3 text-xs uppercase tracking-wider text-muted-foreground font-medium">日期</th>
              </tr>
            </thead>
            <tbody>
              {meaningfulTrades.map((trade, i) => {
                const isBuy = trade.acquisition_or_disposition === 'A';
                const value = (trade.securities_transacted ?? 0) * (trade.price ?? 0);
                return (
                  <tr key={i} className="border-t border-border/20">
                    <td className="py-2 px-3 text-muted-foreground">
                      {trade.reporting_name || 'Unknown'}
                      {trade.type_of_owner && (
                        <span className="text-muted-foreground text-xs ml-2">{trade.type_of_owner.replace('officer: ', '')}</span>
                      )}
                    </td>
                    <td className={`py-2 px-3 text-right font-data ${isBuy ? 'text-emerald-400' : 'text-red-400'}`}>
                      {isBuy ? '买入' : '卖出'}
                    </td>
                    <td className={`py-2 px-3 text-right font-data ${isBuy ? 'text-emerald-400' : 'text-red-400'}`}>
                      {formatValue(value)}
                    </td>
                    <td className="py-2 px-3 text-right text-xs text-muted-foreground font-data">
                      {trade.transaction_date?.slice(5) || ''}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Show more */}
      {trades.length > 8 && !showAll && (
        <button
          onClick={() => setShowAll(true)}
          className="w-full py-2.5 text-xs text-muted-foreground hover:text-foreground transition-colors border-t border-border/20 cursor-pointer
            focus-visible:ring-2 focus-visible:ring-emerald-500/40 focus-visible:outline-none"
        >
          查看全部 {trades.length} 条交易
        </button>
      )}
    </div>
  );
}

// =============================================================================
// Price Target Visualization
// =============================================================================

export function PriceTargetBar({ consensus, currentPrice }: {
  consensus: PriceTargetConsensus | null;
  currentPrice: number;
}) {
  if (!consensus) return null;

  const { targetLow, targetMedian, targetHigh } = consensus;
  const min = Math.min(targetLow, currentPrice) * 0.92;
  const max = Math.max(targetHigh, currentPrice) * 1.08;
  const range = max - min;

  const toPercent = (v: number) => ((v - min) / range) * 100;

  const upside = ((targetMedian - currentPrice) / currentPrice * 100).toFixed(1);
  const isUpside = targetMedian > currentPrice;

  return (
    <div className="bg-card/50 border border-border/40 rounded-xl p-4">
      <div className="flex items-center justify-between mb-3">
        <h4 className="text-xs text-muted-foreground flex items-center gap-2">
          分析师目标价
        </h4>
        <span className={`text-xs font-data ${isUpside ? 'text-emerald-400' : 'text-red-400'}`}>
          {isUpside ? '+' : ''}{upside}%
        </span>
      </div>

      {/* Bar */}
      <div className="relative h-6 mb-2">
        <div className="absolute top-2 left-0 right-0 h-2 bg-muted/30 rounded-full" />
        <div
          className="absolute top-2 h-2 bg-blue-500/25 rounded-full"
          style={{ left: `${toPercent(targetLow)}%`, width: `${toPercent(targetHigh) - toPercent(targetLow)}%` }}
        />
        {/* Median */}
        <div
          className="absolute top-1 w-0.5 h-4 bg-blue-400 rounded-full"
          style={{ left: `${toPercent(targetMedian)}%` }}
        />
        {/* Current */}
        <div
          className="absolute top-0.5 w-2.5 h-5 rounded bg-foreground/90 border border-background"
          style={{ left: `${toPercent(currentPrice)}%`, transform: 'translateX(-50%)' }}
        />
      </div>

      <div className="flex justify-between text-xs font-data text-muted-foreground">
        <span>${targetLow.toFixed(0)}</span>
        <span className="text-blue-400">${targetMedian.toFixed(0)}</span>
        <span>${targetHigh.toFixed(0)}</span>
      </div>
    </div>
  );
}

// =============================================================================
// Raw News Feed
// =============================================================================

export function NewsFeed({ articles }: { articles: NewsArticle[] }) {
  if (articles.length === 0) return null;

  function timeAgo(dateStr: string): string {
    const d = new Date(dateStr);
    const now = new Date();
    const hours = Math.floor((now.getTime() - d.getTime()) / (1000 * 60 * 60));
    if (hours < 1) return '刚刚';
    if (hours < 24) return `${hours}小时前`;
    const days = Math.floor(hours / 24);
    if (days < 7) return `${days}天前`;
    return d.toLocaleDateString('zh-CN', { month: 'short', day: 'numeric' });
  }

  return (
    <div className="divide-y divide-border/20">
      {articles.slice(0, 15).map((article, i) => (
        <a
          key={i}
          href={article.url}
          target="_blank"
          rel="noopener noreferrer"
          className="block py-3 hover:bg-card/60 transition-colors group first:pt-0"
        >
          <div className="flex items-start justify-between gap-3">
            <h4 className="text-sm text-muted-foreground group-hover:text-foreground transition-colors leading-snug line-clamp-2 flex-1">
              {article.title}
            </h4>
            <svg className="w-3.5 h-3.5 text-muted-foreground group-hover:text-foreground transition-colors flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
            </svg>
          </div>
          <div className="flex items-center gap-2 mt-1.5 text-xs text-muted-foreground">
            <span>{article.source}</span>
            <span>-</span>
            <span>{timeAgo(article.publishedDate)}</span>
          </div>
        </a>
      ))}
    </div>
  );
}

// =============================================================================
// Multi-timeframe Confluence Card (Technical Tab)
// =============================================================================

interface SignalData {
  rating: string; // 'strong_buy' | 'buy' | 'neutral' | 'sell' | 'strong_sell'
  rsi: number | null;
  macd_signal: string | null; // 'bullish' | 'bearish'
}

export function ConfluenceCard({ daily, weekly }: {
  daily: SignalData | null;
  weekly: SignalData | null;
}) {
  if (!daily && !weekly) return null;

  function ratingLabel(rating: string): { text: string; color: string } {
    const map: Record<string, { text: string; color: string }> = {
      strong_buy: { text: '强势看涨', color: 'text-emerald-400' },
      buy: { text: '看涨', color: 'text-emerald-400' },
      neutral: { text: '中性', color: 'text-amber-400' },
      sell: { text: '看跌', color: 'text-red-400' },
      strong_sell: { text: '强势看跌', color: 'text-red-400' },
    };
    return map[rating] || { text: rating, color: 'text-muted-foreground' };
  }

  function getConfluence(): { text: string; color: string } {
    if (!daily || !weekly) return { text: '数据不足', color: 'text-muted-foreground' };
    const bullish = ['strong_buy', 'buy'];
    const bearish = ['sell', 'strong_sell'];
    const dBull = bullish.includes(daily.rating);
    const wBull = bullish.includes(weekly.rating);
    const dBear = bearish.includes(daily.rating);
    const wBear = bearish.includes(weekly.rating);

    if (dBull && wBull) return { text: '多周期共振看涨', color: 'text-emerald-400' };
    if (dBear && wBear) return { text: '多周期共振看跌', color: 'text-red-400' };
    if (dBull && !wBull) return { text: '日线偏多, 周线未确认', color: 'text-amber-400' };
    if (!dBull && wBull) return { text: '周线偏多, 日线回调', color: 'text-amber-400' };
    return { text: '方向不明, 观望为宜', color: 'text-muted-foreground' };
  }

  const confluence = getConfluence();

  return (
    <div className="bg-card/50 border border-border/40 rounded-xl overflow-hidden mb-5">
      <div className="px-5 py-3 border-b border-border/30 bg-card/40">
        <h3 className="text-sm font-medium text-foreground flex items-center gap-2">
          <span>多周期信号共振</span>
        </h3>
      </div>
      <div className="p-5">
        <div className="grid grid-cols-2 gap-4 mb-4">
          {/* Daily */}
          {daily && (
            <div className="space-y-1">
              <div className="text-xs text-muted-foreground">日线 Daily</div>
              <div className={`text-sm font-medium ${ratingLabel(daily.rating).color}`}>
                {ratingLabel(daily.rating).text}
              </div>
              <div className="text-xs text-muted-foreground font-data">
                RSI {daily.rsi?.toFixed(0) ?? '--'}
                {daily.macd_signal && ` / MACD ${daily.macd_signal === 'bullish' ? '金叉' : '死叉'}`}
              </div>
            </div>
          )}
          {/* Weekly */}
          {weekly && (
            <div className="space-y-1">
              <div className="text-xs text-muted-foreground">周线 Weekly</div>
              <div className={`text-sm font-medium ${ratingLabel(weekly.rating).color}`}>
                {ratingLabel(weekly.rating).text}
              </div>
              <div className="text-xs text-muted-foreground font-data">
                RSI {weekly.rsi?.toFixed(0) ?? '--'}
                {weekly.macd_signal && ` / MACD ${weekly.macd_signal === 'bullish' ? '金叉' : '死叉'}`}
              </div>
            </div>
          )}
        </div>
        {/* Confluence verdict */}
        <div className="pt-3 border-t border-border/30">
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">共振判断</span>
            <span className={`text-sm font-medium ${confluence.color}`}>{confluence.text}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
