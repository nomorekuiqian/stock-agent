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
        <section>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-gray-900">Market Overview</h2>
            <span className="text-xs text-gray-400">{indices.length} indices</span>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            {indices.map((index) => (
              <div
                key={index.name}
                className="bg-white rounded-lg border border-gray-200 p-4 hover:border-gray-300 transition-colors"
              >
                <p className="text-xs text-gray-500 font-medium mb-1 truncate">{index.name}</p>
                <p className="text-lg font-semibold text-gray-900 mb-1">
                  {index.value?.toLocaleString(undefined, { maximumFractionDigits: 2 })}
                </p>
                {index.change_percent !== undefined && (
                  <div
                    className={`inline-flex items-center gap-0.5 text-xs font-medium ${
                      index.change_percent >= 0 ? 'text-green-600' : 'text-red-600'
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
        <section>
          <div className="flex items-center gap-2 mb-4">
            <svg className="w-5 h-5 text-emerald-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
              />
            </svg>
            <div>
              <h2 className="text-lg font-semibold text-gray-900">In-Depth Analysis</h2>
              <p className="text-xs text-gray-500">AI-generated market report</p>
            </div>
          </div>

          <div className="bg-white rounded-xl border border-gray-200 p-5 md:p-6">
            <div className="prose prose-sm max-w-none prose-headings:text-gray-900 prose-headings:font-semibold prose-headings:text-base prose-p:text-gray-600 prose-p:text-sm prose-p:leading-relaxed prose-strong:text-gray-900 prose-a:text-emerald-600 prose-ul:text-gray-600 prose-ul:text-sm prose-li:text-gray-600 prose-li:text-sm prose-h2:mt-6 prose-h2:mb-3 prose-h3:mt-4 prose-h3:mb-2">
              <ReactMarkdown
                components={{
                  a: ({ href, children }) => (
                    <a href={href} target="_blank" rel="noopener noreferrer">
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
        <section>
          <div className="flex items-center gap-2 mb-4">
            <svg className="w-5 h-5 text-emerald-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"
              />
            </svg>
            <div>
              <h2 className="text-lg font-semibold text-gray-900">Key Events</h2>
              <p className="text-xs text-gray-500">{calendar.length} important events to watch</p>
            </div>
          </div>

          <div className="space-y-3">
            {calendar.map((event, idx) => (
              <div
                key={idx}
                className="bg-white rounded-xl border border-gray-200 p-4 hover:border-emerald-200 transition-colors"
              >
                <div className="flex items-start gap-4">
                  <div className="flex-shrink-0 w-16 text-center">
                    <div className="text-xs font-medium text-emerald-600 uppercase">
                      {new Date(event.date).toLocaleDateString('en-US', { month: 'short' })}
                    </div>
                    <div className="text-2xl font-bold text-gray-900">
                      {new Date(event.date).getDate()}
                    </div>
                    <div className="text-xs text-gray-500">
                      {new Date(event.date).toLocaleDateString('en-US', { weekday: 'short' })}
                    </div>
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="font-semibold text-gray-900 mb-1">{event.event}</h3>
                    <p className="text-sm text-gray-600 leading-relaxed">{event.analysis}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Timestamp */}
      {showTimestamp && timestamp && (
        <div className="text-center pt-4 border-t border-gray-100">
          <p className="text-xs text-gray-400">
            Report generated on {formatDate(timestamp)} at {formatTime(timestamp)}
          </p>
        </div>
      )}
    </div>
  );
}
