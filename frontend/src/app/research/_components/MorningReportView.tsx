'use client';

import { useEffect } from 'react';
import { MorningReportContent } from '@/components/MorningReportContent';
import { formatDateChinese } from '@/lib/timezone';
import { useMorningReportByDate, useMorningReportLatest } from '@/hooks/queries/use-morning-report-data';
import type {
  MorningFuturesQuote,
  MorningGlobalSnapshot,
  MorningOvernightItem,
  MorningTodayFocusItem,
  MorningSummarySection,
} from '@/lib/api';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Data payload passed to parent for Agent context injection. */
export interface MorningReportContextPayload {
  type: 'morning_report';
  date: string;
  title: string | null;
  market_pulse: string | null;
  futures: MorningFuturesQuote[] | null;
  global_markets: MorningGlobalSnapshot | null;
  overnight_news: MorningOvernightItem[] | null;
  today_focus: MorningTodayFocusItem[] | null;
  summary: MorningSummarySection[] | null;
}

interface MorningReportViewProps {
  /** YYYY-MM-DD format. If omitted, loads the latest report. */
  date?: string;
  /** Called when report data is loaded, so parent can send context to Agent. */
  onContextReady?: (payload: MorningReportContextPayload) => void;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function MorningReportView({
  date,
  onContextReady,
}: MorningReportViewProps) {
  const hasDate = !!date;

  const {
    data: dateReport,
    isLoading: dateLoading,
    error: dateError,
  } = useMorningReportByDate(date ?? '');

  // Always fetch latest as fallback (no conditional disable)
  const {
    data: latestReport,
    isLoading: latestLoading,
    error: latestError,
  } = useMorningReportLatest();

  // Fall back to latest if date-specific query fails or returns nothing
  const dateQueryDone = hasDate && !dateLoading;
  const dateQueryFailed = dateQueryDone && (!!dateError || !dateReport);
  const report = (hasDate && !dateQueryFailed) ? dateReport : latestReport;
  const isLoading = hasDate ? (dateLoading || (dateQueryFailed && latestLoading)) : latestLoading;
  const error = dateQueryFailed ? latestError : (hasDate ? dateError : latestError);

  // Build context payload for parent when data is ready
  useEffect(() => {
    if (!onContextReady || !report) return;

    onContextReady({
      type: 'morning_report',
      date: report.report_date ?? date ?? '',
      title: report.title ?? null,
      market_pulse: report.market_pulse ?? null,
      futures: report.futures ?? null,
      global_markets: report.global_markets ?? null,
      overnight_news: report.overnight_news ?? null,
      today_focus: report.today_focus ?? null,
      summary: report.summary ?? null,
    });
  }, [report, onContextReady, date]);

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-4">
        <div className="relative w-12 h-12">
          <div className="absolute inset-0 rounded-full border border-amber-400/20" />
          <div className="absolute inset-0 rounded-full border-t border-amber-400 animate-spin" />
          <svg
            className="absolute inset-0 m-auto w-5 h-5 text-amber-400/60"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
            strokeWidth="1.5"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z"
            />
          </svg>
        </div>
        <span className="text-xs text-muted-foreground">加载早报数据</span>
      </div>
    );
  }

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
          {date ? `无法加载 ${date} 的早报` : '无法加载最新早报'}
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
            <svg className="w-4 h-4 text-amber-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1.5}
                d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z"
              />
            </svg>
            <span className="text-sm font-data text-foreground">
              {formatDateChinese(report.report_date ?? '')}
            </span>
          </div>
        </div>

        {report.title && (
          <h2 className="text-xl font-editorial text-foreground leading-tight">
            {report.title}
          </h2>
        )}

        {report.market_pulse && (
          <p className="text-sm text-muted-foreground mt-2 leading-relaxed">
            {report.market_pulse}
          </p>
        )}
      </div>

      {/* Divider */}
      <div className="border-b border-border/30" />

      {/* Report Content */}
      <div className="px-5 py-5">
        <MorningReportContent
          futures={report.futures || []}
          futures_analysis={report.futures_analysis}
          global_markets={report.global_markets || { asia: [], europe: [], other: [] }}
          global_markets_analysis={report.global_markets_analysis}
          overnight_news={report.overnight_news || []}
          today_focus={report.today_focus || []}
          summary={report.summary || []}
        />
      </div>
    </div>
  );
}
