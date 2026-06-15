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
      <div className="absolute inset-0 bg-gradient-to-b from-primary/[0.03] to-transparent pointer-events-none" />

      <div className="relative max-w-6xl mx-auto px-4 md:px-6 pt-4 pb-5 md:pt-5 md:pb-6">
        {/* Row 1: Section path + Controls */}
        <div className="flex items-center justify-between mb-4 md:mb-5">
          {/* Section path */}
          <nav className="flex items-center gap-2 text-xs tracking-[0.15em] uppercase">
            <Link
              href="/macro"
              className="text-muted-foreground/70 hover:text-primary transition-colors"
            >
              Macro
            </Link>
            <span className="text-muted-foreground/70">/</span>
            <span className="text-primary font-medium">{section}</span>
          </nav>

          {/* Controls */}
          <div className="flex items-center gap-2">
            {onRefresh && (
              <button
                onClick={onRefresh}
                disabled={loading}
                className="group p-2 rounded-lg text-muted-foreground/70 hover:text-primary hover:bg-primary/5 transition-all disabled:opacity-40"
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
                    className={`px-2.5 py-1 text-xs font-medium rounded-md transition-all ${
                      timeRange === range
                        ? 'bg-primary/15 text-primary shadow-sm'
                        : 'text-muted-foreground/70 hover:text-foreground'
                    }`}
                  >
                    {range}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Row 2: Title block */}
        <div className="rounded-lg border border-primary/20 bg-primary/[0.025] px-5 py-4 md:px-6">
          <h1 className="font-editorial text-2xl md:text-3xl text-foreground leading-[1.15] tracking-tight">
            {title}
          </h1>
          <p className="font-editorial text-base md:text-lg text-foreground/80 mt-2 font-medium">
            {question}
          </p>
        </div>

        {/* Row 3: Timestamp */}
        {lastUpdated && (
          <div className="mt-3 md:mt-4 flex items-center gap-2 text-xs text-muted-foreground/70">
            <div className="w-1.5 h-1.5 rounded-full bg-primary/50 animate-pulse" />
            <span className="font-data tracking-wide">
              {lastUpdated}
            </span>
          </div>
        )}
      </div>

      {/* Bottom accent line */}
      <div className="h-px bg-gradient-to-r from-primary/40 via-border/50 to-transparent" />
    </header>
  );
}
