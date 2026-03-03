'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

export function ReportTabs() {
  const pathname = usePathname();
  const isMorning = pathname.startsWith('/morning');

  return (
    <div className="flex items-center gap-1 p-1 v2-inset">
      <Link
        href="/morning"
        className={`px-4 py-1.5 rounded-md text-sm font-medium transition-all ${
          isMorning
            ? 'bg-background text-foreground shadow-sm'
            : 'text-muted-foreground hover:text-foreground'
        }`}
      >
        早报
      </Link>
      <Link
        href="/today"
        className={`px-4 py-1.5 rounded-md text-sm font-medium transition-all ${
          !isMorning
            ? 'bg-background text-foreground shadow-sm'
            : 'text-muted-foreground hover:text-foreground'
        }`}
      >
        晚报
      </Link>
    </div>
  );
}
