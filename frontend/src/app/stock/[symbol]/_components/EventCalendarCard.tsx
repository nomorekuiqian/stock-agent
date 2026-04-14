'use client';

import { useMemo } from 'react';

interface EventCalendarCardProps {
  earningsDate: number | null; // Unix timestamp
  exDividendDate: number | null; // Unix timestamp
  nextQuarterEpsEstimate: number | null;
  currentPrice: number | null;
}

function formatDate(ts: number): string {
  const d = new Date(ts * 1000);
  return d.toLocaleDateString('zh-CN', { month: 'short', day: 'numeric', year: 'numeric' });
}

function getDaysUntil(ts: number): number {
  const now = Date.now();
  const target = ts * 1000;
  return Math.max(0, Math.ceil((target - now) / (1000 * 60 * 60 * 24)));
}

function CountdownPill({ days }: { days: number }) {
  const urgency = days <= 7 ? 'text-amber-400 bg-amber-500/10 border-amber-500/20' :
                  days <= 30 ? 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20' :
                  'text-muted-foreground bg-muted/40 border-border/30';
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-data font-medium border ${urgency}`}>
      {days}天
    </span>
  );
}

export function EventCalendarCard({ earningsDate, exDividendDate, nextQuarterEpsEstimate }: EventCalendarCardProps) {
  const events = useMemo(() => {
    const items: { label: string; date: string; days: number; accent: string }[] = [];

    if (earningsDate && earningsDate > Date.now() / 1000) {
      items.push({
        label: '财报发布',
        date: formatDate(earningsDate),
        days: getDaysUntil(earningsDate),
        accent: 'emerald',
      });
    }

    if (exDividendDate && exDividendDate > Date.now() / 1000) {
      items.push({
        label: '除息日',
        date: formatDate(exDividendDate),
        days: getDaysUntil(exDividendDate),
        accent: 'blue',
      });
    }

    return items;
  }, [earningsDate, exDividendDate]);

  if (events.length === 0 && !nextQuarterEpsEstimate) return null;

  return (
    <div className="mb-5 flex items-stretch gap-3 overflow-x-auto scrollbar-hide">
      {/* Upcoming Events */}
      {events.map((event) => (
        <div
          key={event.label}
          className="flex-shrink-0 flex items-center gap-3 px-4 py-2.5 bg-card/50 border border-border/40 rounded-xl"
        >
          <div className="flex items-center gap-2">
            <div className={`w-1.5 h-1.5 rounded-full ${
              event.accent === 'emerald' ? 'bg-emerald-500' : 'bg-blue-500'
            }`} />
            <span className="text-xs text-muted-foreground">{event.label}</span>
          </div>
          <span className="text-sm font-data text-foreground">{event.date}</span>
          <CountdownPill days={event.days} />
        </div>
      ))}

      {/* Analyst EPS Estimate */}
      {nextQuarterEpsEstimate !== null && (
        <div className="flex-shrink-0 flex items-center gap-3 px-4 py-2.5 bg-card/50 border border-border/40 rounded-xl">
          <div className="flex items-center gap-2">
            <div className="w-1.5 h-1.5 rounded-full bg-violet-500" />
            <span className="text-xs text-muted-foreground">下季 EPS 预期</span>
          </div>
          <span className="text-sm font-data font-medium text-foreground">
            ${nextQuarterEpsEstimate.toFixed(2)}
          </span>
        </div>
      )}
    </div>
  );
}
