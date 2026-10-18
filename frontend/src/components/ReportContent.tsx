'use client';

import { StockLinkedText } from '@/components/StockLinkedText';

import { useMemo } from 'react';
import { CalendarEvent, NewsSection, SummarySection } from '@/lib/api';
import { isTodayPacific, formatCalendarDate, formatCompactTimestamp } from '@/lib/timezone';

interface IndexData {
  name: string;
  value: number;
  change_percent?: number;
  change_unit?: string;
}

// Props use snake_case to match database schema directly
interface ReportContentProps {
  indices?: IndexData[];
  intro?: string;
  news?: NewsSection;
  report_summary?: SummarySection[] | string;
  calendar?: CalendarEvent[];
  showDisclaimer?: boolean;
}

// Key indices to display (matching email format)
const KEY_INDICES = ['S&P 500', 'Nasdaq', '10Y Treasury', 'VIX', 'Gold', 'US Dollar', 'Oil'];

// Indicator display names
const INDICATOR_NAMES: Record<string, string> = {
  'S&P 500': 'S&P 500',
  'Nasdaq': 'NASDAQ',
  '10Y Treasury': '10Y TREASURY',
  'VIX': 'VIX',
  'Gold': 'GOLD',
  'Oil': '原油',
  'US Dollar': 'US DOLLAR',
};

// Section header component
const SectionHeader = ({ children }: { children: React.ReactNode }) => (
  <div className="mb-5 flex items-center gap-2">
    <div className="h-5 w-1 rounded-full bg-primary" />
    <h2 className="text-base font-semibold text-foreground">
      {children}
    </h2>
  </div>
);

// Subsection header component
const SubsectionHeader = ({ children }: { children: React.ReactNode }) => (
  <h3 className="mb-3 flex items-center gap-2 text-sm font-medium">
    <span className="h-1.5 w-1.5 rounded-full bg-amber-400/80 light:bg-amber-600" />
    <span className="text-amber-400 light:text-amber-700">{children}</span>
  </h3>
);

const NewsTimestamp = ({ timestamp }: { timestamp?: string }) => {
  if (!timestamp) return null;

  return (
    <div className="mt-1.5 mb-2.5 flex items-center gap-2 pl-1 font-data text-xs leading-normal text-muted-foreground/75">
      <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full border border-border/60 bg-muted/50">
        <svg className="w-2.5 h-2.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M12 8v4l2.5 2.5m6.5-2.5a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      </span>
      <span>{formatCompactTimestamp(timestamp)}</span>
    </div>
  );
};

export function ReportContent({
  indices,
  intro,
  news,
  report_summary,
  calendar,
  showDisclaimer = true,
}: ReportContentProps) {
  const linkedSymbols = new Set<string>();
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
               (targetName === 'us dollar' && idxName.includes('dollar')) ||
               (targetName === 'oil' && /oil|crude|brent|wti|原油/i.test(idx.name));
      });
      return found ? { ...found, displayName: INDICATOR_NAMES[name] || name } : null;
    }).filter(Boolean) as (IndexData & { displayName: string })[];
  }, [indices]);

  return (
    <div className="space-y-5">
      {/* Market Overview - 6 Key Indices Grid */}
      {keyIndices.length > 0 && (
        <section className="rounded-xl border border-border/40 bg-card/50 p-5 animate-fade-in-up">
          <SectionHeader>市场概览</SectionHeader>
          <div className="grid grid-flow-dense grid-cols-2 gap-2 md:grid-cols-3 lg:grid-cols-6">
            {keyIndices.map((index) => {
              const change = index.change_percent || 0;
              const isPositive = change >= 0;
              return (
                <div
                  key={index.name}
                  className="rounded-lg border border-border/40 bg-card/40 p-3"
                >
                  <p className="mb-1 text-xs font-medium text-muted-foreground">
                    {index.displayName}
                  </p>
                  <p className="font-data text-xl font-semibold text-foreground">
                    {index.value > 1000
                      ? index.value.toLocaleString(undefined, { maximumFractionDigits: 0 })
                      : index.value.toLocaleString(undefined, { maximumFractionDigits: 2 })}
                  </p>
                  <p className={`mt-1 font-data text-sm font-medium ${isPositive ? 'text-emerald-400 light:text-emerald-600' : 'text-red-400 light:text-red-600'}`}>
                    {index.change_unit === 'bps'
                      ? `${isPositive ? '+' : ''}${change.toFixed(1)}bp`
                      : `${isPositive ? '+' : ''}${change.toFixed(2)}%`}
                  </p>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* Intro / Today's Overview */}
      {intro && (
        <section className="rounded-xl border border-border/40 bg-card/50 p-5 animate-fade-in-up">
          <SectionHeader>今日要点</SectionHeader>
          <p className="text-base text-foreground leading-relaxed whitespace-pre-line">
            <StockLinkedText seen={linkedSymbols} text={intro.replace(/\\n/g, '\n')} />
          </p>
        </section>
      )}

      {/* News Section */}
      {news && (news.headlines?.length > 0 || news.briefs?.length > 0) && (
        <section className="rounded-xl border border-border/40 bg-card/50 p-5 animate-fade-in-up">
          <SectionHeader>新闻</SectionHeader>

          {/* Headlines */}
          {news.headlines && news.headlines.length > 0 && (
            <div className="mb-6">
              <SubsectionHeader>头条</SubsectionHeader>
              <div className="space-y-4">
                {news.headlines.map((headline, idx) => (
                  <div key={idx} className="pb-4 border-b border-border/40 last:border-0 last:pb-0">
                    <a
                      href={headline.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="mb-2 block text-base font-semibold leading-relaxed text-foreground transition-colors hover:text-primary"
                    >
                      {headline.title}
                    </a>
                    <NewsTimestamp timestamp={headline.published_at} />
                    <p className="mb-3 text-sm leading-relaxed text-muted-foreground"><StockLinkedText seen={linkedSymbols} text={headline.fact_summary} /></p>
                    <div className="rounded-lg border border-border/30 bg-card/40 p-3">
                      <p className="text-sm leading-relaxed text-foreground">
                        <StockLinkedText seen={linkedSymbols} text={headline.deep_analysis} />
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
                  <div key={idx} className="pb-3 border-b border-border/40 last:border-0 last:pb-0">
                    <a
                      href={brief.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="block text-sm font-medium leading-relaxed text-foreground transition-colors hover:text-primary"
                    >
                      {brief.title}
                    </a>
                    <NewsTimestamp timestamp={brief.published_at} />
                    <p className="mt-1 text-sm leading-relaxed text-muted-foreground"><StockLinkedText seen={linkedSymbols} text={brief.summary} /></p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </section>
      )}

      {/* Upcoming Events Calendar */}
      {calendar && calendar.length > 0 && (
        <section className="rounded-xl border border-border/40 bg-card/50 p-5 animate-fade-in-up">
          <div id="events"><SectionHeader>近期事件</SectionHeader></div>
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
                      ? 'bg-primary/10 border border-primary/20'
                      : 'bg-card/40 border border-border/40'
                  }`}>
                    <p className={`text-xs uppercase ${isToday ? 'text-primary' : 'text-muted-foreground'}`}>
                      {calendarDate.month}
                    </p>
                    <p className={`text-xl font-semibold ${isToday ? 'text-primary' : 'text-foreground'}`}>
                      {calendarDate.day}
                    </p>
                  </div>

                  {/* Event Details */}
                  <div className="flex-1 min-w-0">
                    <h3 className="text-sm font-semibold text-foreground mb-1"><StockLinkedText seen={linkedSymbols} anchor="#earnings" text={event.event} /></h3>
                    <p className="text-sm text-muted-foreground leading-relaxed"><StockLinkedText seen={linkedSymbols} anchor="#earnings" text={event.analysis} /></p>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* Summary */}
      {report_summary && (
        <section className="rounded-xl border border-border/40 bg-card/50 p-5 animate-fade-in-up">
          <SectionHeader>总结与展望</SectionHeader>
          {Array.isArray(report_summary) ? (
            <div className="space-y-6">
              {report_summary.map((section, idx) => (
                <div key={idx}>
                  <div className="flex items-center gap-2 mb-3">
                    <span className="w-1.5 h-1.5 rounded-full bg-primary/70" />
                    <h3 className="text-sm font-semibold text-foreground">{section.title}</h3>
                  </div>
                  <div className="space-y-3">
                    {section.content.replace(/\\n/g, '\n').split('\n').filter(p => p.trim()).map((paragraph, pIdx) => (
                      <p key={pIdx} className="text-base text-foreground leading-relaxed">
                        <StockLinkedText seen={linkedSymbols} text={paragraph} />
                      </p>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          ) : typeof report_summary === 'string' ? (
            (() => {
              let parsed: SummarySection[] | null = null;
              try {
                const obj = JSON.parse(report_summary);
                if (Array.isArray(obj) && obj.length > 0 && obj[0].title && obj[0].content) {
                  parsed = obj as SummarySection[];
                }
              } catch { /* not JSON, render as plain text */ }

              if (parsed) {
                return (
                  <div className="space-y-6">
                    {parsed.map((section, idx) => (
                      <div key={idx}>
                        <div className="flex items-center gap-2 mb-3">
                          <span className="w-1.5 h-1.5 rounded-full bg-primary/70" />
                          <h3 className="text-sm font-semibold text-foreground">{section.title}</h3>
                        </div>
                        <div className="space-y-3">
                          {section.content.replace(/\\n/g, '\n').split('\n').filter(p => p.trim()).map((paragraph, pIdx) => (
                            <p key={pIdx} className="text-base text-foreground leading-relaxed">
                              <StockLinkedText seen={linkedSymbols} text={paragraph} />
                            </p>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                );
              }

              return (
                <div className="space-y-4">
                  {report_summary.replace(/\\n/g, '\n').split('\n').filter((p: string) => p.trim()).map((paragraph: string, idx: number) => (
                    <p key={idx} className="text-base text-foreground leading-relaxed">
                      <StockLinkedText seen={linkedSymbols} text={paragraph} />
                    </p>
                  ))}
                </div>
              );
            })()
          ) : null}
          <p className="text-xs text-muted-foreground mt-6 pt-4 border-t border-border/50">
            以上内容由 AI 生成，仅供参考，不构成任何投资建议。投资有风险，决策需谨慎。
          </p>
        </section>
      )}

      {/* Disclaimer */}
      {showDisclaimer && (
        <div className="text-center pt-4 border-t border-border animate-fade-in">
          <p className="text-xs text-muted-foreground">
            AI-generated report for informational purposes only. Not financial advice.
          </p>
        </div>
      )}
    </div>
  );
}
