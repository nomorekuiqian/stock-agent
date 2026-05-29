'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  CandlestickChart,
  Layers,
  LayoutDashboard,
  MessageCircle,
  Radar,
  Rss,
  type LucideIcon,
} from 'lucide-react';

import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';

interface KpiSet {
  latestCount?: number | null;
  sectorCount?: number | null;
  tickerCount?: number | null;
}

interface Props {
  username: string;
  displayName: string;
  kpis?: KpiSet;
}

interface NavItem {
  key: 'overview' | 'latest' | 'sectors' | 'macro' | 'stocks' | 'chat';
  label: string;
  icon: LucideIcon;
  kpi: (k: KpiSet, displayName: string) => string;
  href: (u: string) => string;
}

const ITEMS: NavItem[] = [
  {
    key: 'overview',
    label: '概览',
    icon: LayoutDashboard,
    kpi: () => '驾驶舱入口',
    href: (u) => `/kol/${u}`,
  },
  {
    key: 'latest',
    label: '最新观点',
    icon: Rss,
    kpi: (k) => (k.latestCount != null ? `${k.latestCount} 条实时更新` : '滚动看他在说什么'),
    href: (u) => `/kol/${u}/latest`,
  },
  {
    key: 'sectors',
    label: '板块机会',
    icon: Layers,
    kpi: (k) => (k.sectorCount != null ? `${k.sectorCount} 板块跟踪` : '产业链分层视角'),
    href: (u) => `/kol/${u}/sectors`,
  },
  {
    key: 'macro',
    label: '宏观视角',
    icon: Radar,
    kpi: () => '宏观框架与关键指标',
    href: (u) => `/kol/${u}/macro`,
  },
  {
    key: 'stocks',
    label: '个股观点',
    icon: CandlestickChart,
    kpi: (k) => (k.tickerCount != null ? `${k.tickerCount} 票覆盖` : '历史观点 + 价格联动'),
    href: (u) => `/kol/${u}/stocks`,
  },
  {
    key: 'chat',
    label: '追问他的视角',
    icon: MessageCircle,
    kpi: (_, name) => `${name} · AI 投研对话`,
    href: (u) => `/kol/${u}/chat`,
  },
];

/**
 * Sub-nav that adapts shape to screen size:
 *   - Mobile (< lg): horizontal sticky strip, icon + label + KPI sub-line (md+).
 *   - Desktop (lg+): slim ~60px icon-only sticky rail on the left, with a
 *     Tooltip on hover showing the label + KPI. Radix Tooltip is touch-aware
 *     and does not trigger on tap, so wrapping every item is safe.
 */
export default function SubNav({ username, displayName, kpis = {} }: Props) {
  const pathname = usePathname();

  return (
    <TooltipProvider delayDuration={120}>
      <nav
        aria-label="KOL 驾驶舱导航"
        className="
          sticky top-0 z-30
          border-b border-border/60 bg-background/95 backdrop-blur
          supports-[backdrop-filter]:bg-background/80
          lg:h-fit lg:border-b-0 lg:bg-transparent lg:backdrop-blur-none
          lg:supports-[backdrop-filter]:bg-transparent
        "
      >
        <ul
          className="
            grid auto-cols-[minmax(5.75rem,1fr)] grid-flow-col overflow-x-auto divide-x divide-border/40
            md:auto-cols-auto md:grid-flow-row md:grid-cols-6
            lg:flex lg:overflow-visible lg:flex-col lg:divide-x-0 lg:divide-y lg:py-2
          "
        >
          {ITEMS.map((item) => {
            const href = item.href(username);
            // The overview tab now lives at the persona root (`/kol/{u}`).
            // Use exact-match for it so it doesn't light up on every sub-route
            // (which all share the same `/kol/{u}` prefix). Other tabs use
            // prefix-match so deeper paths (e.g. `/stocks?ticker=NVDA`) still
            // highlight the parent tab.
            const isOverview = item.key === 'overview';
            const isActive = isOverview
              ? pathname === href
              : pathname?.startsWith(href);
            const Icon = item.icon;
            const labelText = item.label;
            const kpiText = item.kpi(kpis, displayName);
            return (
              <li key={item.key} className="min-w-0">
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Link
                      href={href}
                      aria-label={labelText}
                      className={`group relative flex h-16 flex-col justify-center gap-1 overflow-hidden px-2.5 transition-colors md:h-20 md:px-5 lg:h-14 lg:flex-row lg:items-center lg:justify-center lg:gap-0 lg:px-0 lg:py-0 ${
                        isActive
                          ? 'bg-accent text-foreground'
                          : 'hover:bg-muted/50 text-muted-foreground hover:text-foreground'
                      }`}
                    >
                      {/* Active left rail — 3px emerald vertical bar */}
                      <span
                        aria-hidden
                        className={`absolute left-0 top-0 h-full w-[3px] transition-opacity ${
                          isActive ? 'bg-primary opacity-100' : 'bg-primary opacity-0'
                        }`}
                      />
                      {/* Icon + label row.
                          Mobile/tablet: icon + label inline; KPI below.
                          lg+: icon only (label/KPI hidden, shown via tooltip). */}
                      <div className="flex items-center gap-1.5 md:gap-2 lg:gap-0">
                        <Icon
                          className={`h-4 w-4 shrink-0 transition-colors md:h-4 md:w-4 lg:h-5 lg:w-5 ${
                            isActive ? 'text-primary' : 'text-muted-foreground group-hover:text-foreground'
                          }`}
                          strokeWidth={1.6}
                        />
                        <span className="truncate text-sm font-medium tracking-tight text-foreground md:text-[15px] lg:hidden">
                          {labelText}
                        </span>
                      </div>
                      {/* KPI sub-line — hidden mobile, shown md, hidden lg (tooltip) */}
                      <div className="hidden truncate pl-6 font-data text-[11px] uppercase tracking-[0.12em] text-muted-foreground md:block lg:hidden">
                        {kpiText}
                      </div>
                    </Link>
                  </TooltipTrigger>
                  {/* Tooltip only renders visually on lg+ (mobile/touch never hovers) */}
                  <TooltipContent side="right" sideOffset={6} className="hidden lg:block">
                    <div className="text-sm font-medium">{labelText}</div>
                    <div className="mt-0.5 font-data text-[10px] uppercase tracking-[0.14em] opacity-70">
                      {kpiText}
                    </div>
                  </TooltipContent>
                </Tooltip>
              </li>
            );
          })}
        </ul>
      </nav>
    </TooltipProvider>
  );
}
