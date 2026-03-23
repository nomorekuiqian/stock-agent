'use client';

import { DigestResponse, StockAnalysis, DigestHeadlineNews, DigestBriefNews, DigestEvent } from '@/lib/api';
import { formatReportDate, formatCalendarDate, isMarketToday, formatCompactTimestamp } from '@/lib/timezone';
import { getStatusColor } from '@/lib/digest-utils';

interface DigestInlineReportProps {
  digest: DigestResponse;
}

function NewsTimestamp({ timestamp }: { timestamp?: string }) {
  if (!timestamp) return null;

  return (
    <div className="flex items-center gap-2 pl-1 text-[11px] leading-none text-muted-foreground/75 font-data mt-1.5 mb-2.5">
      <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full border border-border/60 bg-muted/50">
        <svg className="w-2.5 h-2.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M12 8v4l2.5 2.5m6.5-2.5a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      </span>
      <span>{formatCompactTimestamp(timestamp)}</span>
    </div>
  );
}

export default function DigestInlineReport({ digest }: DigestInlineReportProps) {
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
          {digest.symbols_used.map((sym) => (
            <span key={sym} className="px-2 py-1 bg-primary/10 text-primary border border-primary/20 rounded text-xs font-data">
              {sym}
            </span>
          ))}
        </div>
      </section>

      {/* Watchlist Overview */}
      {digest.stocks.length > 0 && (
        <section className="terminal-card p-6 animate-fade-in-up">
          <div className="flex items-center gap-2 mb-5">
            <div className="w-1 h-5 bg-primary rounded-full" />
            <h3 className="text-sm font-medium text-foreground uppercase tracking-wider">持仓概览</h3>
          </div>
          <div className="divide-y divide-border/30">
            {digest.stocks.map((stock: StockAnalysis) => (
              <div key={stock.symbol} className="py-4 first:pt-0 last:pb-0">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-3">
                    <span className="font-semibold font-data text-foreground">{stock.symbol}</span>
                    <span className="text-sm text-muted-foreground">{stock.name}</span>
                  </div>
                  <span className={`px-2 py-0.5 rounded text-xs font-medium ${getStatusColor(stock.status)}`}>
                    {stock.status}
                  </span>
                </div>
                <div className="flex items-center gap-4 text-sm mb-2">
                  <span className="text-foreground font-medium font-data">${stock.price.toFixed(2)}</span>
                  <span className={`font-data ${stock.daily_change.startsWith('+') ? 'text-emerald-400' : 'text-red-400'}`}>
                    {stock.daily_change}
                  </span>
                  <span className="text-muted-foreground/50">|</span>
                  <span className={`font-data ${stock.week_change.startsWith('+') ? 'text-emerald-400' : 'text-red-400'}`}>
                    {stock.week_change} (周)
                  </span>
                </div>
                <p className="text-sm text-muted-foreground leading-relaxed">{stock.quick_take}</p>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Headlines News */}
      {digest.news.headlines && digest.news.headlines.length > 0 && (
        <section className="terminal-card p-6 animate-fade-in-up">
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
                <p className="text-sm text-foreground/90 mb-2">{item.fact_summary}</p>
                <p className="text-sm text-muted-foreground leading-relaxed">{item.deep_analysis}</p>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Brief News */}
      {digest.news.briefs && digest.news.briefs.length > 0 && (
        <section className="terminal-card p-6 animate-fade-in-up">
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
        <section className="terminal-card p-6 animate-fade-in-up">
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

      {/* Summary */}
      {digest.summary?.content && (
        <section className="terminal-card p-6 animate-fade-in-up">
          <div className="flex items-center gap-2 mb-5">
            <div className="w-1 h-5 bg-primary rounded-full" />
            <h3 className="text-sm font-medium text-foreground uppercase tracking-wider">总结</h3>
          </div>
          <div className="space-y-4">
            {digest.summary.content.split('\n\n').map((paragraph, index) => (
              paragraph.trim() && (
                <p key={index} className="text-sm text-muted-foreground leading-relaxed">
                  {paragraph.trim()}
                </p>
              )
            ))}
          </div>
        </section>
      )}

      {/* Disclaimer */}
      <div className="text-center pt-4 border-t border-border/30">
        <p className="text-xs text-muted-foreground/60">
          AI 生成的报告仅供参考,不构成投资建议
        </p>
      </div>
    </div>
  );
}
