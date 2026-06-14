'use client';

import Link from 'next/link';
import { DigestResponse, DigestHeadlineNews, DigestBriefNews, DigestEvent, HoldingView } from '@/lib/api';
import { formatReportDate, formatCalendarDate, isMarketToday, formatCompactTimestamp } from '@/lib/timezone';
import StockOverviewPanel from './StockOverviewPanel';
import { FeedbackBar } from '@/components/memory/FeedbackBar';

interface DigestInlineReportProps {
  digest: DigestResponse;
  /**
   * Layout variant. `'v1'` keeps the legacy 总结-at-bottom placement;
   * `'v2'` renders the renamed 给你的复盘笔记 section at position 3 (below 持仓概览).
   * Defaults to `'v1'` so any un-migrated caller keeps the legacy UI.
   */
  variant?: 'v1' | 'v2';
  thesisMap?: Record<string, string>;
  onThesisSaved?: (symbol: string, thesis: string) => void;
  portfolioSymbols?: Set<string>;
  /** Truth-source portfolio holdings — when passed, 我的持仓 is rendered from
   *  this list directly (with shares/price/market_value), independent of
   *  whether each symbol appears in `digest.stocks`. Preferred over
   *  `portfolioSymbols` for new callers. */
  holdings?: HoldingView[];
  portfolioWeightMap?: Record<string, number>;
  portfolioSummary?: string;
  totalMarketValue?: number;
  totalDailyChange?: number;
  totalDailyChangePct?: number;
}

function NewsTimestamp({ timestamp }: { timestamp?: string }) {
  if (!timestamp) return null;

  return (
    <div className="flex items-center gap-2 pl-1 text-xs leading-tight text-muted-foreground/75 font-data mt-1.5 mb-2.5">
      <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full border border-border/60 bg-muted/50">
        <svg className="w-2.5 h-2.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M12 8v4l2.5 2.5m6.5-2.5a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      </span>
      <span>{formatCompactTimestamp(timestamp)}</span>
    </div>
  );
}

export default function DigestInlineReport({
  digest,
  variant = 'v1',
  thesisMap,
  onThesisSaved,
  portfolioSymbols,
  holdings,
  portfolioWeightMap,
  portfolioSummary,
  totalMarketValue,
  totalDailyChange,
  totalDailyChangePct,
}: DigestInlineReportProps) {
  return (
    <div className="max-w-5xl mx-auto px-4 md:px-6 py-8 space-y-8">
      {/* Report Header */}
      <section className="animate-fade-in-up">
        {/* Date */}
        <div className="flex items-center gap-3 mb-4">
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-card border border-border/50">
            <svg className="w-4 h-4 text-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
            <span className="text-sm font-data text-foreground">{formatReportDate(digest.timestamp.split('T')[0])}</span>
          </div>
        </div>

        {/* Greeting as Title */}
        <h2 className="text-2xl md:text-3xl font-editorial text-foreground leading-tight">
          {digest.greeting}
        </h2>

        {/* Summary */}
        {digest.one_line_summary && (
          <p className="text-muted-foreground mt-3 leading-relaxed">
            {digest.one_line_summary}
          </p>
        )}

        {/* Tracked symbols */}
        <div className="flex flex-wrap gap-1.5 mt-4">
          {digest.symbols_used.map((sym) =>
            sym === '$CASH' ? (
              <span key={sym} className="px-2 py-1 bg-primary/10 text-primary border border-primary/20 rounded text-xs font-data">
                {sym}
              </span>
            ) : (
              <Link key={sym} href={`/stock/${sym}`} className="px-2 py-1 bg-primary/10 text-primary border border-primary/20 rounded text-xs font-data hover:bg-primary/20 transition-colors">
                {sym}
              </Link>
            )
          )}
        </div>
      </section>

      {/* Holdings + Watchlist Overview.
          Render whenever we have either (a) digest analyses or (b) real
          holdings to show — the holdings path doesn't depend on digest.stocks
          being populated. */}
      {(digest.stocks.length > 0 || (holdings && holdings.length > 0)) && (
        <section className="terminal-card p-6 animate-fade-in-up">
          <div className="flex items-center gap-2 mb-5">
            <div className="w-1 h-5 bg-primary rounded-full" />
            <h3 className="text-sm font-medium text-foreground uppercase tracking-wider">持仓概览</h3>
          </div>
          <StockOverviewPanel
            stocks={digest.stocks}
            digestDate={digest.timestamp.split('T')[0]}
            thesisMap={thesisMap}
            onThesisSaved={onThesisSaved}
            portfolioSymbols={portfolioSymbols}
            holdings={holdings}
            portfolioWeightMap={portfolioWeightMap}
            portfolioSummary={portfolioSummary}
            totalMarketValue={totalMarketValue}
            totalDailyChange={totalDailyChange}
            totalDailyChangePct={totalDailyChangePct}
            headlines={digest.news?.headlines}
            briefs={digest.news?.briefs}
            events={digest.events}
          />
        </section>
      )}

      {/* V2 only: 给你的复盘笔记 — moved from the bottom; section:notes anchor lives here */}
      {variant === 'v2' && digest.summary?.content && (
        <section id="section-notes" className="terminal-card p-6 animate-fade-in-up">
          <div className="flex items-center gap-2 mb-2">
            <div className="w-1 h-5 bg-primary rounded-full" />
            <h3 className="text-sm font-medium text-foreground uppercase tracking-wider">
              给你的复盘笔记
            </h3>
          </div>
          <p className="text-xs text-muted-foreground mb-4">
            综合你的持仓、关注列表与今日相关新闻
          </p>
          <div className="space-y-4">
            {digest.summary.content.split('\n\n').map((paragraph, index) =>
              paragraph.trim() && (
                <p key={index} className="text-sm text-muted-foreground leading-relaxed">
                  {paragraph.trim()}
                </p>
              ),
            )}
          </div>
        </section>
      )}

      {/* Headlines News */}
      {digest.news.headlines && digest.news.headlines.length > 0 && (
        <section id="section-headlines" className="terminal-card p-6 animate-fade-in-up">
          <div className="flex items-center gap-2 mb-5">
            <div className="w-1 h-5 bg-primary rounded-full" />
            <h3 className="text-sm font-medium text-foreground uppercase tracking-wider">头条新闻</h3>
          </div>
          <div className="divide-y divide-border/30">
            {digest.news.headlines.map((item: DigestHeadlineNews, index: number) => (
              <div key={index} className="py-4 first:pt-0 last:pb-0">
                <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-1 sm:gap-2 mb-2">
                  <a
                    href={item.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="font-semibold text-foreground hover:text-primary transition-colors text-sm"
                  >
                    {item.title}
                  </a>
                  {item.related_symbols.length > 0 && (
                    <div className="flex flex-wrap gap-1 sm:shrink-0">
                      {item.related_symbols.map((sym: string) => (
                        <span key={sym} className="px-1.5 py-0.5 bg-primary/10 text-primary border border-primary/20 rounded text-xs font-data">
                          {sym}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
                <NewsTimestamp timestamp={item.published_at} />
                <p className="text-sm text-foreground mb-2">{item.fact_summary}</p>
                <p className="text-sm text-muted-foreground leading-relaxed">{item.deep_analysis}</p>
                <FeedbackBar
                  targetType="digest_headline"
                  targetId={`digest_headline:${digest.timestamp.split('T')[0]}:${index}`}
                  snapshot={{ text: item.fact_summary?.slice(0, 200) }}
                />
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Brief News */}
      {digest.news.briefs && digest.news.briefs.length > 0 && (
        <section id="section-briefs" className="terminal-card p-6 animate-fade-in-up">
          <div className="flex items-center gap-2 mb-5">
            <div className="w-1 h-5 bg-primary rounded-full" />
            <h3 className="text-sm font-medium text-foreground uppercase tracking-wider">更多新闻</h3>
          </div>
          <div className="divide-y divide-border/30">
            {digest.news.briefs.map((item: DigestBriefNews, index: number) => (
              <div key={index} className="py-3 first:pt-0 last:pb-0">
                <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-1 sm:gap-2 mb-1">
                  <a
                    href={item.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="font-medium text-foreground hover:text-primary transition-colors text-sm"
                  >
                    {item.title}
                  </a>
                  {item.related_symbols.length > 0 && (
                    <div className="flex flex-wrap gap-1 sm:shrink-0">
                      {item.related_symbols.map((sym: string) => (
                        <span key={sym} className="px-1.5 py-0.5 bg-primary/10 text-primary border border-primary/20 rounded text-xs font-data">
                          {sym}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
                <NewsTimestamp timestamp={item.published_at} />
                <p className="text-xs text-muted-foreground">{item.summary}</p>
                <p className="text-xs text-muted-foreground leading-relaxed mt-1">{item.analysis}</p>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Key Events */}
      {digest.events.length > 0 && (
        <section id="section-events" className="terminal-card p-6 animate-fade-in-up">
          <div className="flex items-center gap-2 mb-5">
            <div className="w-1 h-5 bg-primary rounded-full" />
            <h3 className="text-sm font-medium text-foreground uppercase tracking-wider">重要事件</h3>
          </div>
          <div className="space-y-4">
            {digest.events.map((event: DigestEvent, index: number) => {
              const dateStr = event.date.split('T')[0];
              const calendarDate = formatCalendarDate(dateStr);
              const isToday = isMarketToday(dateStr);

              return (
                <div key={index} className="flex gap-4">
                  <div className={`flex-shrink-0 w-14 rounded-lg p-2 text-center border ${
                    isToday
                      ? 'bg-primary/10 border-primary/20'
                      : 'bg-card border-border/30'
                  }`}>
                    <p className={`text-xs font-data uppercase ${isToday ? 'text-primary' : 'text-muted-foreground'}`}>
                      {calendarDate.month}
                    </p>
                    <p className={`text-xl font-semibold font-data ${isToday ? 'text-primary' : 'text-foreground'}`}>
                      {calendarDate.day}
                    </p>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-1 sm:gap-2 mb-1">
                      <span className="font-semibold text-foreground text-sm">{event.event}</span>
                      {event.related_symbols.length > 0 && (
                        <div className="flex flex-wrap gap-1 sm:shrink-0">
                          {event.related_symbols.map((sym: string) => (
                            <span key={sym} className="px-1.5 py-0.5 bg-primary/10 text-primary border border-primary/20 rounded text-xs font-data">
                              {sym}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                    <p className="text-sm text-muted-foreground leading-relaxed">{event.why_important}</p>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* V1 legacy summary — rendered at the bottom for backward compat */}
      {variant !== 'v2' && digest.summary?.content && (
        <section className="terminal-card p-6 animate-fade-in-up">
          <div className="flex items-center gap-2 mb-5">
            <div className="w-1 h-5 bg-primary rounded-full" />
            <h3 className="text-sm font-medium text-foreground uppercase tracking-wider">总结</h3>
          </div>
          <div className="space-y-4">
            {digest.summary.content.split('\n\n').map((paragraph, index) =>
              paragraph.trim() && (
                <p key={index} className="text-sm text-muted-foreground leading-relaxed">
                  {paragraph.trim()}
                </p>
              ),
            )}
          </div>
        </section>
      )}

      {/* Disclaimer */}
      <div className="text-center pt-4 border-t border-border/30">
        <p className="text-xs text-muted-foreground/70">
          AI 生成的报告仅供参考,不构成投资建议
        </p>
      </div>
    </div>
  );
}
