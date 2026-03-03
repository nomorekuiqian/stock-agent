'use client';

import { ExternalLink, Calendar, TrendingUp, TrendingDown, Newspaper, BarChart3, Lightbulb } from 'lucide-react';
import type { SectorDigestData, SectorStockAnalysis, SectorNews, SectorEvent } from '@/lib/api';

interface SectorDigestContentProps {
  digest: SectorDigestData;
}

// Section header component
function SectionHeader({ icon: Icon, title }: { icon: React.ElementType; title: string }) {
  return (
    <div className="flex items-center gap-2 mb-5">
      <div className="w-1 h-5 bg-emerald-500 rounded-full" />
      <Icon className="w-4 h-4 text-emerald-400" />
      <h3 className="text-sm font-medium text-foreground uppercase tracking-wider">
        {title}
      </h3>
    </div>
  );
}

// Stock analysis card
function StockCard({ stock }: { stock: SectorStockAnalysis }) {
  const isPositive = stock.change_percent >= 0;

  return (
    <div className="p-4 rounded-lg bg-card border border-border/50 hover:border-emerald-500/30 transition-all">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <span className="text-sm font-data font-semibold text-foreground">
            {stock.symbol}
          </span>
          <span className="text-sm text-muted-foreground">
            {stock.name}
          </span>
        </div>
        <div className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg ${
          isPositive
            ? 'bg-emerald-500/10 text-emerald-400'
            : 'bg-red-500/10 text-red-400'
        }`}>
          {isPositive ? (
            <TrendingUp className="w-3.5 h-3.5" />
          ) : (
            <TrendingDown className="w-3.5 h-3.5" />
          )}
          <span className="text-sm font-data font-medium">
            {isPositive ? '+' : ''}{stock.change_percent.toFixed(2)}%
          </span>
        </div>
      </div>
      <p className="text-sm text-muted-foreground leading-relaxed">
        {stock.analysis}
      </p>
    </div>
  );
}

// News item card
function NewsCard({ news }: { news: SectorNews }) {
  return (
    <div className="p-4 rounded-lg bg-card border border-border/50 hover:border-emerald-500/30 transition-all">
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1">
          <h4 className="text-sm font-medium text-foreground mb-2 line-clamp-2">
            {news.title}
          </h4>
          <p className="text-sm text-muted-foreground leading-relaxed line-clamp-3">
            {news.summary}
          </p>
        </div>
        {news.url && (
          <a
            href={news.url}
            target="_blank"
            rel="noopener noreferrer"
            className="flex-shrink-0 p-2 rounded-lg bg-card border border-border/50 text-muted-foreground hover:text-emerald-400 hover:border-emerald-500/30 transition-all"
          >
            <ExternalLink className="w-4 h-4" />
          </a>
        )}
      </div>
    </div>
  );
}

// Event item
function EventItem({ event }: { event: SectorEvent }) {
  // Parse and format date
  const formatDate = (dateStr: string) => {
    try {
      const date = new Date(dateStr);
      return date.toLocaleDateString('zh-CN', {
        month: 'short',
        day: 'numeric',
      });
    } catch {
      return dateStr;
    }
  };

  return (
    <div className="flex items-start gap-4 p-4 rounded-lg bg-card border border-border/50">
      <div className="flex-shrink-0 flex flex-col items-center justify-center w-14 h-14 rounded-lg bg-emerald-500/10 border border-emerald-500/20">
        <Calendar className="w-4 h-4 text-emerald-400 mb-1" />
        <span className="text-xs font-data font-medium text-emerald-400">
          {formatDate(event.date)}
        </span>
      </div>
      <div className="flex-1 min-w-0">
        <h4 className="text-sm font-medium text-foreground mb-1">
          {event.title}
        </h4>
        {event.description && (
          <p className="text-sm text-muted-foreground line-clamp-2">
            {event.description}
          </p>
        )}
      </div>
    </div>
  );
}

export function SectorDigestContent({ digest }: SectorDigestContentProps) {
  if (!digest.success) {
    return (
      <div className="v2-card p-6">
        <div className="text-red-400">
          {digest.error || 'Failed to load digest'}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* Greeting & Intro */}
      <section className="v2-card p-6 animate-fade-in-up">
        <div className="text-sm text-emerald-400 font-medium mb-3">
          {digest.greeting}
        </div>
        <div className="prose prose-invert prose-sm max-w-none">
          <p className="text-muted-foreground leading-relaxed whitespace-pre-wrap">
            {digest.intro}
          </p>
        </div>
      </section>

      {/* Stock Analysis */}
      {digest.stocks && digest.stocks.length > 0 && (
        <section className="v2-card p-6 animate-fade-in-up">
          <SectionHeader icon={BarChart3} title="Stocks" />
          <div className="space-y-4">
            {digest.stocks.map((stock, idx) => (
              <StockCard key={`${stock.symbol}-${idx}`} stock={stock} />
            ))}
          </div>
        </section>
      )}

      {/* News */}
      {digest.news && digest.news.length > 0 && (
        <section className="v2-card p-6 animate-fade-in-up">
          <SectionHeader icon={Newspaper} title="News" />
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {digest.news.map((news, idx) => (
              <NewsCard key={idx} news={news} />
            ))}
          </div>
        </section>
      )}

      {/* Events */}
      {digest.events && digest.events.length > 0 && (
        <section className="v2-card p-6 animate-fade-in-up">
          <SectionHeader icon={Calendar} title="Events" />
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {digest.events.map((event, idx) => (
              <EventItem key={idx} event={event} />
            ))}
          </div>
        </section>
      )}

      {/* Summary / Deep Insight */}
      {digest.summary && (
        <section className="v2-card p-6 animate-fade-in-up">
          <SectionHeader icon={Lightbulb} title="Analysis" />
          <div className="prose prose-invert prose-sm max-w-none">
            <div className="text-muted-foreground leading-relaxed whitespace-pre-wrap">
              {digest.summary}
            </div>
          </div>
        </section>
      )}
    </div>
  );
}
