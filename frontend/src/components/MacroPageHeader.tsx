'use client';

import Link from 'next/link';

interface MacroPageHeaderProps {
  section: string;
  title: string;
  question: string;
  lastUpdated?: string | null;
  loading?: boolean;
  onRefresh?: () => void;
  timeRange?: string;
  onTimeRangeChange?: (range: string) => void;
  timeRanges?: readonly string[];
}

export function MacroPageHeader({
  section,
  title,
  question,
  lastUpdated,
  loading,
  onRefresh,
  timeRange,
  onTimeRangeChange,
  timeRanges = ['1M', '3M', '6M', '1Y', 'ALL'],
}: MacroPageHeaderProps) {
  return (
    <header className="relative overflow-hidden">
      {/* Subtle background gradient for depth */}
      <div className="absolute inset-0 bg-gradient-to-b from-emerald-500/[0.03] to-transparent pointer-events-none" />

      <div className="relative max-w-6xl mx-auto px-4 md:px-6 pt-4 pb-5 md:pt-5 md:pb-6">
        {/* Row 1: Section path + Controls */}
        <div className="flex items-center justify-between mb-4 md:mb-5">
          {/* Section path */}
          <nav className="flex items-center gap-2 text-[11px] tracking-[0.15em] uppercase">
            <Link
              href="/tools"
              className="text-muted-foreground/60 hover:text-emerald-500 transition-colors"
            >
              Macro
            </Link>
            <span className="text-muted-foreground/30">/</span>
            <span className="text-emerald-500 font-medium">{section}</span>
          </nav>

          {/* Controls */}
          <div className="flex items-center gap-2">
            {onRefresh && (
              <button
                onClick={onRefresh}
                disabled={loading}
                className="group p-2 rounded-lg text-muted-foreground/60 hover:text-emerald-500 hover:bg-emerald-500/5 transition-all disabled:opacity-40"
                aria-label="Refresh data"
              >
                <svg
                  className={`w-4 h-4 ${loading ? 'animate-spin' : 'group-hover:rotate-45 transition-transform duration-300'}`}
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={1.5}
                    d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
                  />
                </svg>
              </button>
            )}

            {timeRange && onTimeRangeChange && (
              <div className="flex items-center bg-muted/50 rounded-lg p-0.5 border border-border/30">
                {timeRanges.map((range) => (
                  <button
                    key={range}
                    onClick={() => onTimeRangeChange(range)}
                    className={`px-2.5 py-1 text-[11px] font-medium rounded-md transition-all ${
                      timeRange === range
                        ? 'bg-emerald-500/15 text-emerald-500 shadow-sm'
                        : 'text-muted-foreground/60 hover:text-foreground'
                    }`}
                  >
                    {range}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Row 2: Title block with emerald accent bar */}
        <div className="border-l-2 border-emerald-500/70 pl-5 md:pl-6">
          <h1 className="font-editorial text-2xl md:text-3xl text-foreground leading-[1.15] tracking-tight">
            {title}
          </h1>
          <p className="font-editorial text-sm md:text-base text-muted-foreground/70 mt-1 italic">
            {question}
          </p>
        </div>

        {/* Row 3: Timestamp */}
        {lastUpdated && (
          <div className="mt-3 md:mt-4 flex items-center gap-2 text-[11px] text-muted-foreground/40">
            <div className="w-1.5 h-1.5 rounded-full bg-emerald-500/50 animate-pulse" />
            <span className="font-data tracking-wide">
              {lastUpdated}
            </span>
          </div>
        )}
      </div>

      {/* Bottom accent line */}
      <div className="h-px bg-gradient-to-r from-emerald-500/40 via-border/50 to-transparent" />
    </header>
  );
}
