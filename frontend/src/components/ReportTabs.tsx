'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

export function ReportTabs() {
  const pathname = usePathname();
  const isMorning = pathname.startsWith('/morning');
  const isTwitterDigest = pathname.startsWith('/twitter-digest');
  const isToday = pathname.startsWith('/today') || (!isMorning && !isTwitterDigest);

  return (
    <div className="flex shrink-0 items-center gap-1 rounded-lg border border-border/50 bg-muted/50 p-1">
      <Link
        href="/morning"
        className={`whitespace-nowrap rounded-md px-4 py-1.5 text-sm font-medium transition-all ${
          isMorning
            ? 'bg-background text-foreground shadow-sm'
            : 'text-muted-foreground hover:text-foreground'
        }`}
      >
        早报
      </Link>
      <Link
        href="/today"
        className={`whitespace-nowrap rounded-md px-4 py-1.5 text-sm font-medium transition-all ${
          isToday
            ? 'bg-background text-foreground shadow-sm'
            : 'text-muted-foreground hover:text-foreground'
        }`}
      >
        晚报
      </Link>
      <Link
        href="/twitter-digest"
        className={`whitespace-nowrap rounded-md px-4 py-1.5 text-sm font-medium transition-all ${
          isTwitterDigest
            ? 'bg-background text-foreground shadow-sm'
            : 'text-muted-foreground hover:text-foreground'
        }`}
      >
        推特
      </Link>
    </div>
  );
}
