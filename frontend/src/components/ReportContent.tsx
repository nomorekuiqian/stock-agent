'use client';

import { useMemo } from 'react';
import ReactMarkdown from 'react-markdown';
import { CalendarEvent, MacroSection, NewsSection } from '@/lib/api';
import { formatDateChinese, formatTimePacific, isTodayPacific, formatCalendarDate } from '@/lib/timezone';

interface IndexData {
  name: string;
  value: number;
  change_percent?: number;
}

interface ReportContentProps {
  indices?: IndexData[];
  intro?: string;
  macro?: MacroSection;
  news?: NewsSection;
  reportSummary?: string;
  calendar?: CalendarEvent[];
  inDepthAnalysis?: string;
  timestamp?: string;
  showTimestamp?: boolean;
}

// Key indices to display (matching email format)
const KEY_INDICES = ['S&P 500', 'Nasdaq', '10Y Treasury', 'VIX', 'Gold', 'US Dollar'];

// Indicator display names
const INDICATOR_NAMES: Record<string, string> = {
  'S&P 500': 'S&P 500',
  'Nasdaq': 'NASDAQ',
  '10Y Treasury': '10Y TREASURY',
  'VIX': 'VIX',
  'Gold': 'GOLD',
  'US Dollar': 'US DOLLAR',
};

// Section header component (matching email style)
const SectionHeader = ({ children }: { children: React.ReactNode }) => (
  <div className="flex items-center gap-3 mb-5">
    <div className="w-1 h-5 bg-foreground rounded-full" />
    <h2 className="text-sm font-semibold text-foreground uppercase tracking-wider">
      {children}
    </h2>
  </div>
);

// Subsection header component
const SubsectionHeader = ({ children }: { children: React.ReactNode }) => (
  <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">
    {children}
  </h3>
);

export function ReportContent({
  indices,
  intro,
  macro,
  news,
  reportSummary,
  calendar,
  inDepthAnalysis,
  timestamp,
  showTimestamp = true,
}: ReportContentProps) {
  const hasStructuredData = !!(intro || macro || news || reportSummary);
  const formatDate = (dateString: string) => formatDateChinese(dateString);
  const formatTime = (dateString: string) => formatTimePacific(dateString);

  // Filter to key indices only
  const keyIndices = useMemo(() => {
    if (!indices) return [];
    return KEY_INDICES.map(name => {
      // Use exact match or specific patterns to avoid false matches
      // e.g., "Russell" contains "us" which would wrongly match "US Dollar"
      const found = indices.find(idx => {
        const idxName = idx.name.toLowerCase();
        const targetName = name.toLowerCase();
        // Exact match or starts with the target name
        return idxName === targetName || idxName.startsWith(targetName.split(' ')[0] + ' ') ||
               (targetName === 'us dollar' && idxName.includes('dollar'));
      });
      return found ? { ...found, displayName: INDICATOR_NAMES[name] || name } : null;
    }).filter(Boolean) as (IndexData & { displayName: string })[];
  }, [indices]);

  return (
    <div className="space-y-5">
      {/* Market Overview - 6 Key Indices Grid */}
      {keyIndices.length > 0 && (
        <section className="bg-card rounded-xl border border-border p-5 animate-fade-in-up">
          <SectionHeader>市场概览</SectionHeader>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {keyIndices.map((index) => {
              const change = index.change_percent || 0;
              const isPositive = change >= 0;
              return (
                <div
                  key={index.name}
                  className="bg-secondary/50 rounded-lg p-4 text-center"
                >
                  <p className="text-xs text-muted-foreground uppercase tracking-wide mb-1">
                    {index.displayName}
                  </p>
                  <p className="text-xl font-semibold text-foreground">
                    {index.value > 1000
                      ? index.value.toLocaleString(undefined, { maximumFractionDigits: 0 })
                      : index.value.toLocaleString(undefined, { maximumFractionDigits: 2 })}
                  </p>
                  <p className={`text-sm font-semibold mt-1 ${isPositive ? 'text-emerald-500' : 'text-red-500'}`}>
                    {isPositive ? '+' : ''}{change.toFixed(2)}%
                  </p>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* Intro / Today's Overview */}
      {intro && (
        <section className="bg-card rounded-xl border border-border p-5 animate-fade-in-up">
          <SectionHeader>今日要点</SectionHeader>
          <p className="text-base text-muted-foreground leading-relaxed whitespace-pre-line">
            {intro}
          </p>
        </section>
      )}

      {/* Key Signals */}
      {macro && macro.signals && macro.signals.length > 0 && (
        <section className="bg-card rounded-xl border border-border p-5 animate-fade-in-up">
          <SectionHeader>关键信号</SectionHeader>
          <div className="space-y-0 divide-y divide-border">
            {macro.signals.map((signal, idx) => {
              const trendColor = signal.trend_direction === 'up'
                ? 'text-emerald-500'
                : signal.trend_direction === 'down'
                ? 'text-red-500'
                : 'text-muted-foreground';
              return (
                <div key={idx} className="py-4 first:pt-0 last:pb-0">
                  <div className="flex items-center gap-3 mb-2">
                    <span className="text-sm font-semibold text-foreground">{signal.name}</span>
                    <span className={`text-sm font-semibold ${trendColor}`}>
                      {signal.current_value} ({signal.change})
                    </span>
                  </div>
                  <p className="text-sm text-muted-foreground leading-relaxed">
                    {signal.analysis}
                  </p>
                </div>
              );
            })}
          </div>
          {macro.summary && (
            <div className="mt-4 pt-4 border-t border-border">
              <p className="text-sm text-muted-foreground leading-relaxed">
                {macro.summary}
              </p>
            </div>
          )}
        </section>
      )}

      {/* News Section */}
      {news && (news.headlines?.length > 0 || news.briefs?.length > 0) && (
        <section className="bg-secondary/30 rounded-xl border border-border p-5 animate-fade-in-up">
          <SectionHeader>新闻</SectionHeader>

          {/* Headlines */}
          {news.headlines && news.headlines.length > 0 && (
            <div className="mb-6">
              <SubsectionHeader>头条</SubsectionHeader>
              <div className="space-y-4">
                {news.headlines.map((headline, idx) => (
                  <div key={idx} className="pb-4 border-b border-border last:border-0 last:pb-0">
                    <a
                      href={headline.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-base font-semibold text-foreground hover:text-emerald-500 transition-colors block mb-2"
                    >
                      {headline.title}
                    </a>
                    <p className="text-sm text-muted-foreground mb-3">{headline.fact_summary}</p>
                    <div className="bg-secondary/50 rounded-lg p-3">
                      <p className="text-sm text-muted-foreground leading-relaxed">
                        {headline.deep_analysis}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Briefs */}
          {news.briefs && news.briefs.length > 0 && (
            <div>
              <SubsectionHeader>快讯</SubsectionHeader>
              <div className="space-y-3">
                {news.briefs.map((brief, idx) => (
                  <div key={idx} className="pb-3 border-b border-border/50 last:border-0 last:pb-0">
                    <a
                      href={brief.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-sm font-medium text-foreground hover:text-emerald-500 transition-colors"
                    >
                      {brief.title}
                    </a>
                    <p className="text-sm text-muted-foreground mt-1">{brief.summary}</p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </section>
      )}

      {/* Upcoming Events Calendar */}
      {calendar && calendar.length > 0 && (
        <section className="bg-card rounded-xl border border-border p-5 animate-fade-in-up">
          <SectionHeader>近期事件</SectionHeader>
          <div className="space-y-4">
            {calendar.slice(0, 5).map((event, idx) => {
              const dateStr = event.date.split('T')[0];
              const calendarDate = formatCalendarDate(dateStr);
              const isToday = isTodayPacific(dateStr);

              return (
                <div key={idx} className="flex gap-4">
                  {/* Date Block */}
                  <div className={`flex-shrink-0 w-14 rounded-lg p-2 text-center ${
                    isToday
                      ? 'bg-emerald-500/10 border border-emerald-500/20'
                      : 'bg-secondary border border-border'
                  }`}>
                    <p className={`text-xs uppercase ${isToday ? 'text-emerald-500' : 'text-muted-foreground'}`}>
                      {calendarDate.month}
                    </p>
                    <p className={`text-xl font-semibold ${isToday ? 'text-emerald-500' : 'text-foreground'}`}>
                      {calendarDate.day}
                    </p>
                  </div>

                  {/* Event Details */}
                  <div className="flex-1 min-w-0">
                    <h3 className="text-sm font-semibold text-foreground mb-1">{event.event}</h3>
                    <p className="text-sm text-muted-foreground leading-relaxed">{event.analysis}</p>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* Summary */}
      {reportSummary && (
        <section className="bg-card rounded-xl border border-border p-5 animate-fade-in-up">
          <SectionHeader>总结展望</SectionHeader>
          <p className="text-base text-muted-foreground leading-relaxed whitespace-pre-line">
            {reportSummary}
          </p>
        </section>
      )}

      {/* Legacy In-Depth Analysis (for old reports) */}
      {!hasStructuredData && inDepthAnalysis && (
        <section className="bg-card rounded-xl border border-border p-5 animate-fade-in-up">
          <SectionHeader>深度分析</SectionHeader>
          <div className="prose prose-sm max-w-none prose-headings:text-foreground prose-headings:font-semibold prose-p:text-muted-foreground prose-strong:text-foreground prose-a:text-emerald-500 prose-ul:text-muted-foreground prose-li:text-muted-foreground dark:prose-invert">
            <ReactMarkdown
              components={{
                a: ({ href, children }) => (
                  <a href={href} target="_blank" rel="noopener noreferrer" className="transition-colors">
                    {children}
                  </a>
                ),
              }}
            >
              {inDepthAnalysis}
            </ReactMarkdown>
          </div>
        </section>
      )}

      {/* Timestamp */}
      {showTimestamp && timestamp && (
        <div className="text-center pt-4 border-t border-border animate-fade-in">
          <p className="text-xs text-muted-foreground">
            AI-generated report for informational purposes only. Not financial advice.
          </p>
          <p className="text-xs text-muted-foreground mt-1">
            Generated at {formatDate(timestamp)} {formatTime(timestamp)}
          </p>
        </div>
      )}
    </div>
  );
}
