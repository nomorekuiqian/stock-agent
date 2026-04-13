'use client';

import { ReactNode } from 'react';
import PaywallGuard from '@/components/PaywallGuard';

function MorningPreview() {
  return (
    <main className="min-h-[70vh] bg-background">
      <section className="border-b border-border/50">
        <div className="max-w-5xl mx-auto px-4 md:px-6 py-8 md:py-12">
          <div className="space-y-3">
            <div className="flex items-center gap-3">
              <div className="h-px flex-1 max-w-[60px] bg-gradient-to-r from-amber-400 to-transparent" />
              <span className="text-amber-400 text-xs font-semibold tracking-[0.25em] uppercase">Morning Brief</span>
            </div>
            <h1 className="text-3xl md:text-5xl font-editorial text-foreground tracking-tight leading-[1.1]">
              盘前早报
            </h1>
            <p className="text-muted-foreground text-sm md:text-base max-w-lg leading-relaxed">
              盘前市场简报，快速了解隔夜要闻与今日焦点
            </p>
          </div>
        </div>
      </section>
      <div className="max-w-5xl mx-auto px-4 md:px-6 py-8 space-y-6">
        <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-card border border-border/50 w-fit">
          <svg className="w-4 h-4 text-amber-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z" />
          </svg>
          <span className="text-sm font-data text-foreground tabular-nums">今日盘前</span>
        </div>
        <div className="space-y-4">
          <div className="h-8 w-2/3 bg-muted/30 rounded" />
          <div className="p-4 rounded-lg bg-primary/5 border border-primary/10 space-y-2">
            <div className="h-4 w-full bg-muted/20 rounded" />
            <div className="h-4 w-4/5 bg-muted/20 rounded" />
            <div className="h-4 w-3/5 bg-muted/20 rounded" />
          </div>
        </div>
      </div>
    </main>
  );
}

export default function MorningPaywallGuard({ children }: { children: ReactNode }) {
  return (
    <PaywallGuard requiredFeature="morning_website" preview={<MorningPreview />}>
      {children}
    </PaywallGuard>
  );
}
