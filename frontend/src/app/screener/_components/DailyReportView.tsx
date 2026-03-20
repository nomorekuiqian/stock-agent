'use client';

import { useEffect } from 'react';
import { ReportContent } from '@/components/ReportContent';
import { formatDateChinese } from '@/lib/timezone';
import { useReportByDate, useLatestReport } from '@/hooks/queries/use-report-data';
import type { NewsSection, SummarySection, CalendarEvent } from '@/lib/api';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Data payload passed to parent for Agent context injection. */
export interface DailyReportContextPayload {
  type: 'daily_report';
  date: string;
  title: string | null;
  summary: string | null;
  intro: string | null;
  news: NewsSection | null;
  report_summary: SummarySection[] | string | null;
  calendar: CalendarEvent[] | null;
}

interface DailyReportViewProps {
  /** YYYY-MM-DD format. If omitted, loads the latest report. */
  date?: string;
  /** Called when report data is loaded, so parent can send context to Agent. */
  onContextReady?: (payload: DailyReportContextPayload) => void;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

interface IndexData {
  name: string;
  value: number;
  change_percent?: number;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function DailyReportView({
  date,
  onContextReady,
}: DailyReportViewProps) {
  // Conditional data fetching: specific date vs latest
  const {
    data: dateReport,
    isLoading: dateLoading,
    error: dateError,
  } = useReportByDate(date ?? '');

  const {
    data: latestReport,
    isLoading: latestLoading,
    error: latestError,
  } = useLatestReport();

  // Determine which report to show
  const hasDate = !!date;
  const report = hasDate ? dateReport : latestReport;
  const isLoading = hasDate ? dateLoading : latestLoading;
  const error = hasDate ? dateError : latestError;

  // Build context payload for parent
  useEffect(() => {
    if (!onContextReady || !report) return;

    onContextReady({
      type: 'daily_report',
      date: report.report_date ?? date ?? '',
      title: report.title ?? null,
      summary: report.summary ?? null,
      intro: report.intro ?? null,
      news: report.news ?? null,
      report_summary: report.report_summary ?? null,
      calendar: report.calendar ?? null,
    });
  }, [report, onContextReady, date]);

  // Loading state
  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-4">
        <div className="relative w-12 h-12">
          <div className="absolute inset-0 rounded-full border border-emerald-500/20" />
          <div className="absolute inset-0 rounded-full border-t border-emerald-500 animate-spin" />
          <svg
            className="absolute inset-0 m-auto w-5 h-5 text-emerald-500/60"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
            strokeWidth="1.5"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M12 7.5h1.5m-1.5 3h1.5m-7.5 3h7.5m-7.5 3h7.5m3-9h3.375c.621 0 1.125.504 1.125 1.125V18a2.25 2.25 0 01-2.25 2.25M16.5 7.5V18a2.25 2.25 0 002.25 2.25M16.5 7.5V4.875c0-.621-.504-1.125-1.125-1.125H4.125C3.504 3.75 3 4.254 3 4.875V18a2.25 2.25 0 002.25 2.25h13.5M6 7.5h3v3H6v-3z"
            />
          </svg>
        </div>
        <span className="text-xs text-muted-foreground">
          加载日报数据
        </span>
      </div>
    );
  }

  // Error state
  if (error || !report) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-3 px-6 text-center">
        <div className="w-10 h-10 rounded-full bg-red-500/10 flex items-center justify-center">
          <svg className="w-5 h-5 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={1.5}
              d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z"
            />
          </svg>
        </div>
        <p className="text-sm text-muted-foreground">
          {date ? `无法加载 ${date} 的日报` : '无法加载最新日报'}
        </p>
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto">
      {/* Report Header */}
      <div className="px-5 pt-4 pb-4">
        <div className="flex items-center gap-3 mb-3">
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-card border border-border/50">
            <svg className="w-4 h-4 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1.5}
                d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"
              />
            </svg>
            <span className="text-sm font-data text-foreground">
              {formatDateChinese(report.report_date)}
            </span>
          </div>
        </div>

        {report.title && (
          <h2 className="text-xl font-editorial text-foreground leading-tight">
            {report.title}
          </h2>
        )}

        {report.summary && (
          <p className="text-sm text-muted-foreground mt-2 leading-relaxed">
            {report.summary}
          </p>
        )}
      </div>

      {/* Divider */}
      <div className="border-b border-border/30" />

      {/* Report Content */}
      <div className="px-5 py-5">
        <ReportContent
          indices={report.indices as IndexData[] | undefined}
          intro={report.intro}
          news={report.news}
          report_summary={report.report_summary}
          calendar={report.calendar}
          showDisclaimer={false}
        />
      </div>
    </div>
  );
}
