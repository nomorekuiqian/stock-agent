'use client';

import ReactMarkdown from 'react-markdown';
import { CalendarEvent } from '@/lib/api';

interface IndexData {
  name: string;
  value: number;
  change_percent?: number;
}

interface ReportContentProps {
  indices?: IndexData[];
  inDepthAnalysis?: string;
  calendar?: CalendarEvent[];
  timestamp?: string;
  showTimestamp?: boolean;
}

export function ReportContent({
  indices,
  inDepthAnalysis,
  calendar,
  timestamp,
  showTimestamp = true,
}: ReportContentProps) {
  const formatDate = (dateString: string) => {
    const d = new Date(dateString);
    return d.toLocaleDateString('en-US', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
  };

  const formatTime = (dateString: string) => {
    const d = new Date(dateString);
    return d.toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  return (
    <div className="space-y-8">
      {/* Market Indices */}
      {indices && indices.length > 0 && (
        <section className="animate-fade-in-up">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-foreground">Market Overview</h2>
            <span className="text-xs text-muted-foreground">{indices.length} indices</span>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            {indices.map((index, idx) => (
              <div
                key={index.name}
                className="bg-card rounded-lg border border-border p-4 hover:border-emerald-500/50 hover-glow transition-all animate-stagger-fade-in"
                style={{ animationDelay: `${idx * 50}ms` }}
              >
                <p className="text-xs text-muted-foreground font-medium mb-1 truncate">{index.name}</p>
                <p className="text-lg font-semibold text-foreground mb-1">
                  {index.value?.toLocaleString(undefined, { maximumFractionDigits: 2 })}
                </p>
                {index.change_percent !== undefined && (
                  <div
                    className={`inline-flex items-center gap-0.5 text-xs font-medium ${
                      index.change_percent >= 0 ? 'text-emerald-500' : 'text-red-500'
                    }`}
                  >
                    <svg
                      className={`w-3 h-3 ${index.change_percent >= 0 ? '' : 'rotate-180'}`}
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M5 10l7-7m0 0l7 7m-7-7v18"
                      />
                    </svg>
                    {Math.abs(index.change_percent).toFixed(2)}%
                  </div>
                )}
              </div>
            ))}
          </div>
        </section>
      )}

      {/* In-Depth Analysis */}
      {inDepthAnalysis && (
        <section className="animate-fade-in-up delay-200">
          <div className="flex items-center gap-2 mb-4">
            <div className="w-8 h-8 rounded-lg bg-emerald-500/10 dark:bg-emerald-500/20 flex items-center justify-center">
              <svg className="w-4 h-4 text-emerald-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                />
              </svg>
            </div>
            <div>
              <h2 className="text-lg font-semibold text-foreground">In-Depth Analysis</h2>
              <p className="text-xs text-muted-foreground">AI-generated market report</p>
            </div>
          </div>

          <div className="bg-card rounded-xl border border-border p-5 md:p-6">
            <div className="prose prose-sm max-w-none prose-headings:text-foreground prose-headings:font-semibold prose-headings:text-base prose-p:text-muted-foreground prose-p:text-sm prose-p:leading-relaxed prose-strong:text-foreground prose-a:text-emerald-500 hover:prose-a:text-emerald-400 prose-ul:text-muted-foreground prose-ul:text-sm prose-li:text-muted-foreground prose-li:text-sm prose-h2:mt-6 prose-h2:mb-3 prose-h3:mt-4 prose-h3:mb-2 dark:prose-invert">
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
          </div>
        </section>
      )}

      {/* Key Events - LLM Curated */}
      {calendar && calendar.length > 0 && (
        <section className="animate-fade-in-up delay-300">
          <div className="flex items-center gap-2 mb-4">
            <div className="w-8 h-8 rounded-lg bg-emerald-500/10 dark:bg-emerald-500/20 flex items-center justify-center">
              <svg className="w-4 h-4 text-emerald-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"
                />
              </svg>
            </div>
            <div>
              <h2 className="text-lg font-semibold text-foreground">Key Events</h2>
              <p className="text-xs text-muted-foreground">{calendar.length} important events to watch</p>
            </div>
          </div>

          <div className="space-y-3">
            {calendar.map((event, idx) => (
              <div
                key={idx}
                className="bg-card rounded-xl border border-border p-4 hover:border-emerald-500/50 hover-glow transition-all animate-stagger-fade-in"
                style={{ animationDelay: `${idx * 100}ms` }}
              >
                <div className="flex items-start gap-4">
                  <div className="flex-shrink-0 w-16 text-center">
                    <div className="text-xs font-medium text-emerald-500 uppercase">
                      {new Date(event.date).toLocaleDateString('en-US', { month: 'short' })}
                    </div>
                    <div className="text-2xl font-bold text-foreground">
                      {new Date(event.date).getDate()}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {new Date(event.date).toLocaleDateString('en-US', { weekday: 'short' })}
                    </div>
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="font-semibold text-foreground mb-1">{event.event}</h3>
                    <p className="text-sm text-muted-foreground leading-relaxed">{event.analysis}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Timestamp */}
      {showTimestamp && timestamp && (
        <div className="text-center pt-4 border-t border-border animate-fade-in delay-400">
          <p className="text-xs text-muted-foreground">
            Report generated on {formatDate(timestamp)} at {formatTime(timestamp)}
          </p>
        </div>
      )}
    </div>
  );
}
