'use client';

import { useMemo } from 'react';
import { CalendarEvent, NewsSection, SummarySection } from '@/lib/api';
import { formatDateChinese, formatTimePacific, isTodayPacific, formatCalendarDate } from '@/lib/timezone';

interface IndexData {
  name: string;
  value: number;
  change_percent?: number;
}

// Props use snake_case to match database schema directly
interface ReportContentProps {
  indices?: IndexData[];
  intro?: string;
  news?: NewsSection;
  report_summary?: SummarySection[] | string;
  calendar?: CalendarEvent[];
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
    <div className="w-1 h-5 bg-emerald-500 rounded-full" />
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
  news,
  report_summary,
  calendar,
  timestamp,
  showTimestamp = true,
}: ReportContentProps) {
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
                  className="bg-muted/80 rounded-lg p-4 text-center border border-border/50"
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
          <p className="text-base text-foreground/90 leading-relaxed whitespace-pre-line">
            {intro.replace(/\\n/g, '\n')}
          </p>
        </section>
      )}

      {/* News Section */}
      {news && (news.headlines?.length > 0 || news.briefs?.length > 0) && (
        <section className="bg-card rounded-xl border border-border p-5 animate-fade-in-up">
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
                    <div className="bg-muted/60 rounded-lg p-3 border border-border/30">
                      <p className="text-sm text-foreground/90 leading-relaxed">
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
                    <p className="text-sm text-foreground/80 mt-1">{brief.summary}</p>
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
                    <p className="text-sm text-foreground/80 leading-relaxed">{event.analysis}</p>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* Summary */}
      {report_summary && (
        <section className="bg-card rounded-xl border border-border p-5 animate-fade-in-up">
          <SectionHeader>总结与展望</SectionHeader>
          {Array.isArray(report_summary) ? (
            <div className="space-y-6">
              {report_summary.map((section, idx) => (
                <div key={idx}>
                  <div className="flex items-center gap-2 mb-3">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500/70" />
                    <h3 className="text-sm font-semibold text-foreground">{section.title}</h3>
                  </div>
                  <div className="space-y-3">
                    {section.content.replace(/\\n/g, '\n').split('\n').filter(p => p.trim()).map((paragraph, pIdx) => (
                      <p key={pIdx} className="text-base text-foreground/90 leading-relaxed">
                        {paragraph}
                      </p>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          ) : typeof report_summary === 'string' ? (
            <div className="space-y-4">
              {report_summary.replace(/\\n/g, '\n').split('\n').filter((p: string) => p.trim()).map((paragraph: string, idx: number) => (
                <p key={idx} className="text-base text-foreground/90 leading-relaxed">
                  {paragraph}
                </p>
              ))}
            </div>
          ) : null}
          <p className="text-xs text-muted-foreground mt-6 pt-4 border-t border-border/50">
            以上内容由 AI 生成，仅供参考，不构成任何投资建议。投资有风险，决策需谨慎。
          </p>
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
