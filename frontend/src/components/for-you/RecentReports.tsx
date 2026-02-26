'use client';

import Link from 'next/link';
import { UserDigestItem } from '@/lib/api';
import { formatReportDate, formatDateShort } from '@/lib/timezone';

interface RecentReportsProps {
  history: UserDigestItem[];
  totalHistory: number;
}

export default function RecentReports({ history, totalHistory }: RecentReportsProps) {
  if (history.length === 0) return null;

  return (
    <section className="border-t border-border/50 mt-12">
      <div className="max-w-5xl mx-auto px-4 md:px-6 py-10">
        {/* Section Header */}
        <div className="flex items-center justify-between mb-8">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <div className="w-1 h-5 bg-emerald-500 rounded-full" />
              <h3 className="text-xl font-medium text-foreground">往期报告</h3>
            </div>
            <p className="text-sm text-muted-foreground pl-3">{totalHistory} 份报告存档</p>
          </div>
          <Link
            href="/for-you/archive"
            className="text-sm text-emerald-400 hover:text-emerald-300 transition-colors flex items-center gap-1 group"
          >
            查看全部
            <svg className="w-4 h-4 transition-transform group-hover:translate-x-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </Link>
        </div>

        {/* Report Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {history.slice(0, 6).map((item) => (
            <Link
              key={item.id}
              href={`/for-you/${item.id}`}
              className="group terminal-card p-6 hover:border-emerald-500/30 hover:bg-card/80 transition-all"
            >
              <h4 className="text-base font-medium text-foreground line-clamp-2 group-hover:text-emerald-400 transition-colors leading-relaxed mb-4">
                {item.greeting || formatReportDate(item.digest_date)}
              </h4>
              <div className="flex items-center justify-between pt-4 border-t border-border/30">
                <span className="text-xs font-data text-muted-foreground">
                  {formatDateShort(item.digest_date)}
                </span>
                <svg className="w-4 h-4 text-muted-foreground group-hover:text-emerald-400 group-hover:translate-x-0.5 transition-all" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </div>
            </Link>
          ))}
        </div>
      </div>
    </section>
  );
}
