"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  BookOpenText,
  CandlestickChart,
  Layers,
  LayoutDashboard,
  MessageCircle,
  Radar,
  Rss,
  type LucideIcon,
} from "lucide-react";

import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

interface KpiSet {
  latestCount?: number | null;
  sectorCount?: number | null;
  tickerCount?: number | null;
}

interface Props {
  username: string;
  displayName: string;
  avatarUrl?: string | null;
  kpis?: KpiSet;
}

interface NavItem {
  key: "overview" | "latest" | "sectors" | "highlights" | "macro" | "history" | "stocks" | "chat";
  label: string;
  icon: LucideIcon;
  kpi: (k: KpiSet, displayName: string) => string;
  href: (u: string, displayName: string) => string;
  activePath?: (u: string) => string;
  emphasized?: boolean;
}

const GENERIC_ITEMS: NavItem[] = [
  {
    key: "overview",
    label: "概览",
    icon: LayoutDashboard,
    kpi: () => "驾驶舱入口",
    href: (u) => `/kol/${u}`,
  },
  {
    key: "latest",
    label: "最新观点",
    icon: Rss,
    kpi: (k) =>
      k.latestCount != null
        ? `${k.latestCount} 条实时更新`
        : "滚动看他在说什么",
    href: (u) => `/kol/${u}/latest`,
  },
  {
    key: "sectors",
    label: "板块视角",
    icon: Layers,
    kpi: (k) =>
      k.sectorCount != null ? `${k.sectorCount} 板块跟踪` : "产业链分层视角",
    href: (u) => `/kol/${u}/sectors`,
  },
  {
    key: "macro",
    label: "宏观视角",
    icon: Radar,
    kpi: () => "宏观框架与关键指标",
    href: (u) => `/kol/${u}/macro`,
  },
  {
    key: "stocks",
    label: "个股视角",
    icon: CandlestickChart,
    kpi: (k) =>
      k.tickerCount != null ? `${k.tickerCount} 票覆盖` : "历史观点 + 价格联动",
    href: (u) => `/kol/${u}/stocks`,
  },
  {
    key: "chat",
    label: "追问视角",
    icon: MessageCircle,
    kpi: (_, name) => `${name} · 研究助手`,
    href: (u) => `/research?agent=kol&persona=${encodeURIComponent(u)}`,
    activePath: (u) => `/kol/${u}/chat`,
    emphasized: true,
  },
];

const FRANK_ITEMS: NavItem[] = [
  {
    key: "overview",
    label: "主页",
    icon: LayoutDashboard,
    kpi: () => "qinbafrank 专属研究台",
    href: (u) => `/kol/${u}`,
  },
  {
    key: "sectors",
    label: "板块观点",
    icon: Layers,
    kpi: () => "5 个板块观点",
    href: (u) => `/kol/${u}/sectors`,
  },
  {
    key: "highlights",
    label: "精华",
    icon: BookOpenText,
    kpi: () => "7 个主题完整归档",
    href: (u) => `/kol/${u}/highlights`,
  },
  {
    key: "stocks",
    label: "个股",
    icon: CandlestickChart,
    kpi: (k) =>
      k.tickerCount != null ? `${k.tickerCount} 票覆盖` : "推荐档案与价格验证",
    href: (u) => `/kol/${u}/stocks`,
  },
  {
    key: "latest",
    label: "全量库",
    icon: Rss,
    kpi: (k) =>
      k.latestCount != null
        ? `精选 + ${k.latestCount} 条原文`
        : "精选内容 + 全量原文",
    href: (u) => `/kol/${u}/latest`,
  },
  {
    key: "chat",
    label: "追问",
    icon: MessageCircle,
    kpi: () => "qinbafrank 研究助手",
    href: (u) => `/research?agent=kol&persona=${encodeURIComponent(u)}`,
    activePath: () => "/research",
    emphasized: true,
  },
];

// Serenity-specific nav. Same shape/UX as Frank's rail, but labels reflect her
// supply-chain operating system: 「供应链」 replaces 「过往精华」 because her
// alpha lives in the bottleneck rotation, not in topic archives. 「内容库」
// stays a single-tab landing for evidence-tweet snippets (live feed unavailable
// until ingestion lands).
const SERENITY_ITEMS: NavItem[] = [
  {
    key: "overview",
    label: "主页",
    icon: LayoutDashboard,
    kpi: () => "Serenity 投研驾驶舱",
    href: (u) => `/kol/${u}`,
  },
  {
    key: "sectors",
    label: "供应链",
    icon: Layers,
    kpi: (k) =>
      k.sectorCount != null
        ? `${k.sectorCount} 个瓶颈环节`
        : "AI capex 漏斗 · 瓶颈轮动",
    href: (u) => `/kol/${u}/sectors`,
  },
  {
    key: "stocks",
    label: "个股",
    icon: CandlestickChart,
    kpi: (k) =>
      k.tickerCount != null ? `${k.tickerCount} 票覆盖` : "小盘 niche · 公司解码",
    href: (u) => `/kol/${u}/stocks`,
  },
  {
    key: "macro",
    label: "AI 周期",
    icon: Radar,
    kpi: () => "AI capex + 地缘宏观",
    href: (u) => `/kol/${u}/macro`,
  },
  {
    key: "latest",
    label: "内容库",
    icon: Rss,
    kpi: (k) =>
      k.latestCount != null ? `${k.latestCount} 条证据原文` : "skill 证据原文",
    href: (u) => `/kol/${u}/latest`,
  },
  {
    key: "chat",
    label: "追问",
    icon: MessageCircle,
    kpi: () => "Serenity 研究助手",
    href: (u) => `/research?agent=kol&persona=${encodeURIComponent(u)}`,
    activePath: () => "/research",
    emphasized: true,
  },
];

/**
 * Sub-nav that adapts shape to screen size:
 *   - Mobile (< lg): horizontal sticky strip, icon + label + KPI sub-line (md+).
 *   - Desktop (lg+): slim icon-only sticky rail on the left, with a
 *     Tooltip on hover showing the label + KPI. Radix Tooltip is touch-aware
 *     and does not trigger on tap, so wrapping every item is safe.
 */
export default function SubNav({
  username,
  displayName,
  avatarUrl,
  kpis = {},
}: Props) {
  const pathname = usePathname();
  const u = username.toLowerCase();
  const isFrank = u === "qinbafrank";
  const isSerenity = u === "aleabitoreddit";
  const items = isFrank
    ? FRANK_ITEMS
    : isSerenity
      ? SERENITY_ITEMS
      : GENERIC_ITEMS;
  const navTitle = isFrank ? "qinbafrank" : displayName;

  return (
    <TooltipProvider delayDuration={120}>
      <nav
        aria-label={`${navTitle} 导航`}
        className="
          sticky top-0 z-30
          border-b border-border/60 bg-background/95 backdrop-blur
          supports-[backdrop-filter]:bg-background/80
          lg:top-20 lg:mx-1 lg:mt-3 lg:h-fit lg:rounded-lg lg:border lg:border-border/50 lg:bg-card/30 lg:backdrop-blur
          lg:supports-[backdrop-filter]:bg-card/30
        "
      >
        <div className="hidden px-2 pt-2 lg:block">
          <Tooltip>
            <TooltipTrigger asChild>
              <Link
                href={`/kol/${username}`}
                aria-label={`${navTitle} 首页`}
                className="group relative grid h-12 place-items-center rounded-md border border-primary/20 bg-primary/[0.06] transition hover:border-primary/45 hover:bg-primary/[0.1] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
              >
                {avatarUrl ? (
                  <Image
                    src={avatarUrl}
                    alt={`${navTitle} 头像`}
                    width={32}
                    height={32}
                    className="h-8 w-8 rounded-full border border-primary/25 object-cover"
                  />
                ) : (
                  <span className="font-editorial text-2xl text-primary">
                    {navTitle.slice(0, 1).toUpperCase()}
                  </span>
                )}
              </Link>
            </TooltipTrigger>
            <TooltipContent
              side="right"
              sideOffset={6}
              className="hidden lg:block"
            >
              <div className="text-sm font-medium">{navTitle}</div>
              <div className="mt-0.5 text-micro font-medium uppercase tracking-[0.14em] opacity-70">
                @{username}
              </div>
            </TooltipContent>
          </Tooltip>
        </div>
        <ul
          className={`
            grid auto-cols-[minmax(5.75rem,1fr)] grid-flow-col overflow-x-auto divide-x divide-border/40
            md:auto-cols-auto md:grid-flow-row ${
              items.length === 5 ? "md:grid-cols-5" : "md:grid-cols-6"
            }
            lg:flex lg:overflow-visible lg:flex-col lg:divide-x-0 lg:divide-y lg:py-2
          `}
        >
          {items.map((item) => {
            const href = item.href(username, displayName);
            const activePath = item.activePath?.(username) ?? href;
            // The overview tab now lives at the persona root (`/kol/{u}`).
            // Use exact-match for it so it doesn't light up on every sub-route
            // (which all share the same `/kol/{u}` prefix). Other tabs use
            // prefix-match so deeper paths (e.g. `/stocks?ticker=NVDA`) still
            // highlight the parent tab.
            const isOverview = item.key === "overview";
            const isActive = isOverview
              ? pathname === activePath
              : pathname?.startsWith(activePath);
            const Icon = item.icon;
            const labelText = item.label;
            const kpiText = item.kpi(kpis, displayName);
            const isEmphasized = item.emphasized === true;
            return (
              <li key={item.key} className="min-w-0">
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Link
                      href={href}
                      aria-label={labelText}
                      className={`group relative flex h-16 flex-col justify-center gap-1 overflow-hidden px-2.5 transition-colors md:h-20 md:px-5 lg:mx-2 lg:h-12 lg:flex-row lg:items-center lg:justify-center lg:gap-0 lg:rounded-md lg:px-0 lg:py-0 ${
                        isEmphasized
                          ? "border border-primary/45 bg-primary text-primary-foreground shadow-sm shadow-primary/25 hover:bg-primary/90"
                          : isActive
                            ? "bg-accent text-foreground"
                            : "hover:bg-muted/50 text-muted-foreground hover:text-foreground"
                      }`}
                    >
                      {/* Active left rail — 3px emerald vertical bar */}
                      <span
                        aria-hidden
                        className={`absolute left-0 top-0 h-full w-[3px] transition-opacity ${
                          isActive && !isEmphasized
                            ? "bg-primary opacity-100"
                            : "bg-primary opacity-0"
                        }`}
                      />
                      {/* Icon + label row.
                          Mobile/tablet: icon + label inline; KPI below.
                          lg+: icon only (label/KPI hidden, shown via tooltip). */}
                      <div className="flex items-center gap-1.5 md:gap-2 lg:gap-0">
                        <Icon
                          className={`h-4 w-4 shrink-0 transition-colors md:h-4 md:w-4 lg:h-5 lg:w-5 ${
                            isEmphasized
                              ? "text-primary-foreground"
                              : isActive
                                ? "text-primary"
                                : "text-muted-foreground group-hover:text-foreground"
                          }`}
                          strokeWidth={1.6}
                        />
                        <span
                          className={`truncate text-sm font-medium lg:hidden ${
                            isEmphasized
                              ? "text-primary-foreground"
                              : "text-foreground"
                          }`}
                        >
                          {labelText}
                        </span>
                      </div>
                      {/* KPI sub-line — hidden mobile, shown md, hidden lg (tooltip) */}
                      <div
                        className={`hidden truncate pl-6 text-xs font-medium uppercase tracking-[0.12em] md:block lg:hidden ${
                          isEmphasized
                            ? "text-primary-foreground/80"
                            : "text-muted-foreground"
                        }`}
                      >
                        {kpiText}
                      </div>
                    </Link>
                  </TooltipTrigger>
                  {/* Tooltip only renders visually on lg+ (mobile/touch never hovers) */}
                  <TooltipContent
                    side="right"
                    sideOffset={6}
                    className="hidden lg:block"
                  >
                    <div className="text-sm font-medium">{labelText}</div>
                    <div className="mt-0.5 text-micro font-medium uppercase tracking-[0.14em] opacity-70">
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
