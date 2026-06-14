'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const TABS = [
  { href: '/macro', label: '总览' },
  { href: '/macro/liquidity', label: '流动性' },
  { href: '/macro/economy', label: '经济基本面' },
  { href: '/macro/inflation-rates', label: '通胀与利率' },
  { href: '/macro/sentiment', label: '市场情绪' },
  { href: '/macro/weekly', label: '周报' },
];

export function MacroTabBar() {
  const pathname = usePathname();

  return (
    <div className="sticky top-0 z-30 bg-background/95 backdrop-blur-sm border-b border-border/30">
      <div className="max-w-[1400px] mx-auto px-4 lg:px-6">
        <nav className="flex gap-1 overflow-x-auto py-1 -mb-px">
          {TABS.map((tab) => {
            const isActive = pathname === tab.href;
            return (
              <Link
                key={tab.href}
                href={tab.href}
                className={`shrink-0 px-4 py-2.5 text-sm font-medium rounded-t-lg transition-colors relative ${
                  isActive
                    ? 'text-primary'
                    : 'text-muted-foreground/70 hover:text-foreground'
                }`}
              >
                {tab.label}
                {isActive && (
                  <span className="absolute bottom-0 left-2 right-2 h-0.5 bg-primary rounded-full" />
                )}
              </Link>
            );
          })}
        </nav>
      </div>
    </div>
  );
}
