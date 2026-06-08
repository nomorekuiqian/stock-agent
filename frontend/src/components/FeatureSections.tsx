"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useRef, useCallback, useEffect } from "react";
import { api, type StockSearchResult } from "@/lib/api";

// Re-export is not needed; we use StockSearchResult for local state

// ---------------------------------------------------------------------------
// Shared UI primitives
// ---------------------------------------------------------------------------

function ArrowIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      fill="none"
      stroke="currentColor"
      viewBox="0 0 24 24"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M17 8l4 4m0 0l-4 4m4-4H3"
      />
    </svg>
  );
}

function SectionLabel({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-3 mb-6">
      <div className="h-px flex-1 max-w-[60px] bg-gradient-to-r from-primary to-transparent" />
      <span className="text-primary text-xs font-semibold tracking-[0.25em] uppercase">
        {label}
      </span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Feature 1: Stock Research
// ---------------------------------------------------------------------------

function StockSearchBox() {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<StockSearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  const composingRef = useRef(false);

  const doSearch = useCallback(
    async (q: string) => {
      if (q.length < 1) {
        setResults([]);
        setOpen(false);
        return;
      }
      setIsSearching(true);
      try {
        const data = await api.searchStocks(q, 5);
        setResults(data.stocks);
        setOpen(data.stocks.length > 0);
      } catch {
        setResults([]);
      } finally {
        setIsSearching(false);
      }
    },
    []
  );

  const onQueryChange = useCallback(
    (value: string) => {
      setQuery(value);
      if (composingRef.current) return;
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => doSearch(value), 300);
    },
    [doSearch]
  );

  // Close dropdown on outside click or Escape
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (
        containerRef.current &&
        !containerRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    }
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", handleClick);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handleClick);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, []);

  return (
    <div ref={containerRef} className="relative w-full max-w-md">
      <div className="relative">
        {/* Search icon */}
        <svg
          className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground/60"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
          />
        </svg>
        <input
          type="text"
          value={query}
          onChange={(e) => onQueryChange(e.target.value)}
          onCompositionStart={() => {
            composingRef.current = true;
          }}
          onCompositionEnd={(e) => {
            composingRef.current = false;
            onQueryChange((e.target as HTMLInputElement).value);
          }}
          onFocus={() => {
            if (results.length > 0) setOpen(true);
          }}
          placeholder="输入股票代码，如 AAPL、TSLA、NVDA..."
          className="w-full pl-12 pr-4 py-3.5 bg-card/80 border border-border/60 rounded-xl text-sm text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:border-primary/50 focus:ring-1 focus:ring-primary/20 transition-all"
        />
        {isSearching && (
          <div className="absolute right-4 top-1/2 -translate-y-1/2 w-4 h-4 border-2 border-primary/40 border-t-primary rounded-full animate-spin" />
        )}
      </div>

      {/* Search results dropdown */}
      {open && results.length > 0 && (
        <div className="absolute top-full left-0 right-0 mt-2 bg-card border border-border/60 rounded-xl overflow-hidden shadow-2xl shadow-black/40 z-20">
          {results.map((stock) => (
            <button
              key={stock.symbol}
              onClick={() => {
                router.push(`/stock/${stock.symbol}`);
              }}
              className="w-full flex items-center justify-between px-4 py-3 hover:bg-primary/5 transition-colors text-left cursor-pointer"
            >
              <div className="flex items-center gap-3">
                <span className="font-data text-sm font-semibold text-primary">
                  {stock.symbol}
                </span>
                <span className="text-sm text-muted-foreground truncate max-w-[200px]">
                  {stock.name}
                </span>
              </div>
              <svg
                className="w-4 h-4 text-muted-foreground/40"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M9 5l7 7-7 7"
                />
              </svg>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function StockMockup() {
  const metrics = [
    { label: "P/E", value: "32.8x", sub: "行业 28.5x" },
    { label: "营收增速", value: "+6.1%", sub: "YoY" },
    { label: "毛利率", value: "46.9%", sub: "稳定" },
    { label: "ROE", value: "157%", sub: "优秀" },
  ];

  const technicals = [
    { label: "RSI (14)", value: "52", signal: "neutral" as const },
    { label: "MACD", value: "多头", signal: "up" as const },
    { label: "支撑位", value: "$198", signal: "neutral" as const },
    { label: "阻力位", value: "$236", signal: "neutral" as const },
  ];

  const signalColor = {
    up: "text-emerald-400",
    down: "text-red-400",
    neutral: "text-white/80",
  };

  return (
    <div className="relative bg-[#0c0c0e] rounded-2xl border border-white/[0.08] overflow-hidden transition-all duration-500 hover:border-white/[0.12] hover:shadow-lg hover:shadow-primary/5">
      {/* Top accent line */}
      <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-primary/40 to-transparent" />

      {/* Stock header */}
      <div className="px-5 pt-5 pb-3 border-b border-white/[0.06]">
        <div className="flex items-center justify-between">
          <div>
            <div className="flex items-baseline gap-2.5 mb-1">
              <span className="font-data text-lg font-bold text-primary">
                AAPL
              </span>
              <span className="text-sm text-white/50">Apple Inc.</span>
            </div>
            <div className="flex items-baseline gap-2">
              <span className="font-data text-2xl font-bold text-white/90">
                $213.49
              </span>
              <span className="font-data text-sm font-medium text-emerald-400">
                +1.24%
              </span>
            </div>
          </div>
          <div className="flex gap-1.5">
            {["概览", "技术", "财务", "新闻"].map((tab, i) => (
              <span
                key={tab}
                className={`text-xs px-2.5 py-1 rounded-md ${
                  i === 0
                    ? "bg-primary/15 text-primary font-medium"
                    : "text-white/40"
                }`}
              >
                {tab}
              </span>
            ))}
          </div>
        </div>
      </div>

      {/* Chart placeholder */}
      <div className="px-5 py-4">
        <div className="h-28 relative">
          <svg
            viewBox="0 0 400 100"
            className="w-full h-full"
            preserveAspectRatio="none"
          >
            <defs>
              <linearGradient id="chartGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#10b981" stopOpacity="0.15" />
                <stop offset="100%" stopColor="#10b981" stopOpacity="0" />
              </linearGradient>
            </defs>
            <path
              d="M0,70 C30,65 60,45 100,50 C140,55 170,30 200,35 C230,40 260,25 300,20 C340,15 370,30 400,15"
              fill="none"
              stroke="#10b981"
              strokeWidth="2"
              opacity="0.8"
            />
            <path
              d="M0,70 C30,65 60,45 100,50 C140,55 170,30 200,35 C230,40 260,25 300,20 C340,15 370,30 400,15 V100 H0Z"
              fill="url(#chartGrad)"
            />
          </svg>
          {/* Time labels */}
          <div className="absolute bottom-0 left-0 right-0 flex justify-between">
            {["1M", "3M", "6M", "1Y", "5Y"].map((t, i) => (
              <span
                key={t}
                className={`text-micro font-data ${
                  i === 3
                    ? "text-primary font-medium"
                    : "text-white/30"
                }`}
              >
                {t}
              </span>
            ))}
          </div>
        </div>
      </div>

      {/* Metrics grid */}
      <div className="px-5 pb-3">
        <p className="text-micro text-primary/60 font-semibold uppercase tracking-wider mb-2">
          基本面指标
        </p>
        <div className="grid grid-cols-4 gap-2">
          {metrics.map((m) => (
            <div
              key={m.label}
              className="bg-white/[0.04] rounded-lg px-2.5 py-2 border border-white/[0.06]"
            >
              <p className="text-micro text-white/40">{m.label}</p>
              <p className="font-data text-sm font-semibold text-white/90 mt-0.5">
                {m.value}
              </p>
              <p className="text-micro text-white/30 font-data">
                {m.sub}
              </p>
            </div>
          ))}
        </div>
      </div>

      {/* Technical indicators */}
      <div className="px-5 pb-4">
        <p className="text-micro text-primary/60 font-semibold uppercase tracking-wider mb-2">
          技术面信号
        </p>
        <div className="grid grid-cols-4 gap-2">
          {technicals.map((t) => (
            <div
              key={t.label}
              className="flex items-center justify-between bg-white/[0.03] rounded-lg px-2.5 py-2 border border-white/[0.05]"
            >
              <span className="text-micro text-white/40">
                {t.label}
              </span>
              <span
                className={`font-data text-xs font-medium ${signalColor[t.signal]}`}
              >
                {t.value}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* AI summary */}
      <div className="mx-5 mb-5 border-l-2 border-primary/40 pl-3 py-2 bg-primary/[0.03] rounded-r-lg">
        <p className="text-micro text-primary/50 font-semibold uppercase tracking-wider mb-1">
          AI 综合评估
        </p>
        <p className="text-xs text-white/55 leading-relaxed">
          苹果基本面稳健，iPhone 及服务收入双轮驱动。估值略高于行业均值但增长可期。技术面中性偏多，$198 为关键支撑。
        </p>
      </div>

      {/* Bottom fade */}
      <div className="absolute bottom-0 left-0 right-0 h-12 bg-gradient-to-t from-[#0c0c0e] to-transparent pointer-events-none" />
    </div>
  );
}

function StockResearchSection() {
  return (
    <section className="relative py-20 md:py-32 overflow-hidden">
      {/* Background: subtle emerald grid */}
      <div className="absolute inset-0 bg-[linear-gradient(rgba(16,185,129,0.02)_1px,transparent_1px),linear-gradient(90deg,rgba(16,185,129,0.02)_1px,transparent_1px)] bg-[size:80px_80px]" />

      <div className="relative max-w-6xl mx-auto px-4 md:px-6">
        <div className="grid md:grid-cols-2 gap-12 lg:gap-20 items-center">
          {/* Left: Content */}
          <div className="space-y-6">
            <SectionLabel label="个股透视" />

            <h2 className="font-editorial text-3xl md:text-4xl lg:text-5xl text-foreground leading-[1.1]">
              输入代码，
              <br />
              <span className="text-primary">一页看透</span>
            </h2>

            <p className="text-muted-foreground text-base md:text-lg leading-relaxed max-w-md">
              输入任意美股代码，即刻获得完整的投资分析 -- 基本面、技术面、新闻面、AI 综合评估，所有决策信息整合在一个页面。
            </p>

            {/* Interactive stock search */}
            <div className="pt-2">
              <p className="text-xs text-muted-foreground/60 mb-3">
                搜索任意美股，立即查看分析:
              </p>
              <StockSearchBox />
              <div className="mt-4">
                <Link
                  href="/stock"
                  className="inline-flex items-center gap-2.5 px-6 py-3.5 bg-primary text-primary-foreground rounded-xl text-sm font-medium transition-all hover:bg-primary/90 active:scale-[0.98] cursor-pointer"
                >
                  浏览个股分析
                  <ArrowIcon className="w-4 h-4" />
                </Link>
              </div>
            </div>
          </div>

          {/* Right: Mockup */}
          <div className="relative">
            {/* Ambient glow */}
            <div className="absolute -inset-12 bg-primary/[0.05] blur-[80px] rounded-full pointer-events-none" />
            <div className="relative">
              <StockMockup />
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Feature 1: Daily Reports Family — four time-anchored reports
// ---------------------------------------------------------------------------

// Accent matches the actual destination page's theme color:
//   /morning       → amber
//   /today         → primary (emerald)
//   /twitter-digest → sky
//   /for-you       → primary (emerald)
type ReportAccent = "amber" | "sky" | "primary";

interface ReportCardConfig {
  /** Internal slug. */
  key: string;
  /** Tier badge: 免费 / Max / Pro+. */
  tier: "免费" | "Pro+" | "Max 专属";
  /** Big editorial name. */
  name: string;
  /** One-liner positioning. */
  tagline: string;
  /** Vague cadence anchor (no specific clock times — they shift). */
  cadence: string;
  /** 2-3 short bullets — what's actually inside. */
  bullets: string[];
  /** Where the CTA links to. */
  href: string;
  /** Visual color theme — matches the destination page. */
  accent: ReportAccent;
}

const ACCENT_STYLES: Record<
  ReportAccent,
  { ring: string; dot: string; text: string; line: string }
> = {
  amber: {
    ring: "border-amber-400/25 hover:border-amber-400/50",
    dot: "bg-amber-400",
    text: "text-amber-400",
    line: "from-amber-400/60",
  },
  sky: {
    ring: "border-sky-400/25 hover:border-sky-400/50",
    dot: "bg-sky-400",
    text: "text-sky-400",
    line: "from-sky-400/60",
  },
  primary: {
    ring: "border-primary/25 hover:border-primary/50",
    dot: "bg-primary",
    text: "text-primary",
    line: "from-primary/60",
  },
};

const DAILY_REPORTS: ReportCardConfig[] = [
  {
    key: "morning",
    tier: "Pro+",
    name: "盘前情报",
    tagline: "开盘前把隔夜 + 早盘 + 今日议程一次过完",
    cadence: "工作日 · 开盘前送达",
    bullets: [
      "隔夜重要新闻 + futures 走势",
      "今日财报日历 + 宏观数据",
      "盘前异动股快览",
    ],
    href: "/morning",
    accent: "amber",
  },
  {
    key: "evening",
    tier: "免费",
    name: "盘后总览",
    tagline: "10 分钟看完今日市场到底发生了什么",
    cadence: "工作日 · 盘后送达",
    bullets: [
      "今日动态 + Top movers",
      "板块轮动 + 关键新闻深度",
      "明日观察点",
    ],
    href: "/today",
    accent: "primary",
  },
  {
    key: "kol",
    tier: "Max 专属",
    name: "推特简报",
    tagline: "300+ 美股博主推文里只筛高质量论据和多空观点",
    cadence: "工作日 · 盘后送达",
    bullets: [
      "今日 KOL 圈在押什么票",
      "每个个股的多空论据 + 原推引用",
      "下周需要关注的事件",
    ],
    href: "/twitter-digest",
    accent: "sky",
  },
  {
    key: "personal",
    tier: "Pro+",
    name: "专属日报",
    tagline: "基于你的持仓筛选,只看跟你相关的市场动态",
    cadence: "工作日 · 盘后送达",
    bullets: [
      "每条新闻都关联到你的具体持仓",
      "AI 结合你的持仓给出操作建议",
      "邮件自动推送,无需打开网站",
    ],
    href: "/for-you",
    accent: "primary",
  },
];

function ReportCard({ config }: { config: ReportCardConfig }) {
  const s = ACCENT_STYLES[config.accent];
  return (
    <Link
      href={config.href}
      className={`group relative rounded-2xl border bg-card/40 p-6 md:p-7 transition-all hover:bg-card/70 hover:-translate-y-0.5 ${s.ring}`}
    >
      <div
        className={`absolute top-0 left-0 right-0 h-px bg-gradient-to-r ${s.line} via-transparent to-transparent opacity-70`}
      />
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="flex items-center gap-2.5">
          <span className={`w-1.5 h-1.5 rounded-full ${s.dot}`} aria-hidden />
          <span className="text-[11px] text-muted-foreground/85 tracking-wide">
            {config.cadence}
          </span>
        </div>
        <span
          className={`text-[10px] uppercase tracking-[0.18em] font-semibold px-2 py-0.5 rounded-md border ${
            config.tier === "免费"
              ? "border-border/50 text-muted-foreground/85"
              : config.tier === "Max 专属"
                ? "border-amber-400/40 bg-amber-400/[0.08] text-amber-400"
                : "border-primary/30 bg-primary/[0.08] text-primary"
          }`}
        >
          {config.tier}
        </span>
      </div>

      <h3 className="font-editorial text-2xl md:text-3xl text-foreground leading-tight mb-2">
        {config.name}
      </h3>
      <p className={`text-sm leading-relaxed text-muted-foreground mb-5`}>
        {config.tagline}
      </p>

      <ul className="space-y-2 mb-6">
        {config.bullets.map((b) => (
          <li key={b} className="flex items-start gap-2 text-sm text-foreground/85">
            <span className={`mt-2 w-1 h-1 rounded-full shrink-0 ${s.dot}`} aria-hidden />
            <span className="leading-relaxed">{b}</span>
          </li>
        ))}
      </ul>

      <div className={`inline-flex items-center gap-1.5 text-sm font-medium ${s.text} group-hover:gap-2.5 transition-all`}>
        查看{config.name}
        <ArrowIcon className="w-3.5 h-3.5" />
      </div>
    </Link>
  );
}

function DailyReportsSection() {
  return (
    <section className="relative py-20 md:py-32 overflow-hidden">
      <div className="absolute inset-0 bg-muted/10" />
      <div className="absolute inset-0 bg-[linear-gradient(rgba(16,185,129,0.018)_1px,transparent_1px),linear-gradient(90deg,rgba(16,185,129,0.018)_1px,transparent_1px)] bg-[size:80px_80px]" />

      <div className="relative max-w-6xl mx-auto px-4 md:px-6">
        {/* Section header — centered */}
        <div className="max-w-2xl mx-auto text-center mb-12 md:mb-16">
          <div className="inline-flex items-center gap-3 mb-6">
            <div className="h-px w-12 bg-gradient-to-r from-primary to-transparent" />
            <span className="text-primary text-xs font-semibold tracking-[0.25em] uppercase">
              Daily Reports
            </span>
            <div className="h-px w-12 bg-gradient-to-l from-primary to-transparent" />
          </div>
          <h2 className="font-editorial text-3xl md:text-4xl lg:text-5xl text-foreground leading-[1.1] mb-4">
            四份日报,
            <br className="md:hidden" />
            <span className="text-primary">覆盖你的全天</span>
          </h2>
          <p className="text-muted-foreground text-base md:text-lg leading-relaxed">
            从盘前到盘后、从大盘到 KOL 声音、从市场到你的持仓 ——
            四份不同时间、不同视角的日报,一个邮箱全收齐。
          </p>
        </div>

        {/* 2x2 card grid */}
        <div className="grid sm:grid-cols-2 gap-4 md:gap-5 max-w-4xl mx-auto">
          {DAILY_REPORTS.map((c) => (
            <ReportCard key={c.key} config={c} />
          ))}
        </div>

        {/* Tier ladder footer */}
        <div className="mt-10 text-center">
          <p className="text-xs text-muted-foreground/75">
            <span className="text-foreground/85">免费</span> 盘后总览
            <span className="mx-2 text-muted-foreground/30">·</span>
            <span className="text-primary">Pro+</span> 解锁盘前情报 + 专属日报
            <span className="mx-2 text-muted-foreground/30">·</span>
            <span className="text-amber-400">Max</span> 解锁推特简报
          </p>
        </div>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Feature 3: AI Research Assistant
// ---------------------------------------------------------------------------

function ResearchMockup() {
  return (
    <div className="relative bg-[#0c0c0e] rounded-2xl border border-white/[0.08] overflow-hidden transition-all duration-500 hover:border-white/[0.12] hover:shadow-lg hover:shadow-sky-400/5">
      <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-sky-400/40 to-transparent" />

      <div className="flex flex-col sm:flex-row h-auto sm:h-[420px]">
        {/* Left: Chat Panel */}
        <div className="w-full sm:w-[45%] border-b sm:border-b-0 sm:border-r border-white/[0.06] flex flex-col">
          <div className="px-4 py-3 border-b border-white/[0.05]">
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-sky-400" />
              <span className="text-xs font-medium text-white/80">
                AI 投研助手
              </span>
            </div>
          </div>

          <div className="flex-1 px-4 py-3 space-y-3 overflow-hidden">
            {/* User message */}
            <div className="flex justify-end">
              <div className="bg-primary/10 border border-primary/20 rounded-xl rounded-br-sm px-3 py-2 max-w-[85%]">
                <p className="text-xs text-white/80 leading-relaxed">
                  NVDA 和 AMD 哪个更值得买入？
                </p>
              </div>
            </div>

            {/* AI message */}
            <div className="flex justify-start">
              <div className="max-w-[92%]">
                <p className="text-xs text-white/65 leading-[1.8]">
                  从三个维度对比分析:
                </p>
                <div className="mt-2 space-y-1.5">
                  <div className="flex items-start gap-1.5">
                    <div className="w-1 h-1 rounded-full bg-sky-400 mt-1.5 shrink-0" />
                    <p className="text-xs text-white/60 leading-relaxed">
                      <span className="text-sky-400/80 font-medium">基本面</span>{" "}
                      -- NVDA 数据中心营收 +78%，AMD 营收 +10%。NVDA 在 AI 芯片领域护城河更深。
                    </p>
                  </div>
                  <div className="flex items-start gap-1.5">
                    <div className="w-1 h-1 rounded-full bg-sky-400 mt-1.5 shrink-0" />
                    <p className="text-xs text-white/60 leading-relaxed">
                      <span className="text-sky-400/80 font-medium">估值</span>{" "}
                      -- NVDA P/E 58x vs AMD 45x。NVDA 估值更高但增速也更快...
                    </p>
                  </div>
                </div>
              </div>
            </div>

            {/* Follow-up chips */}
            <div className="flex gap-1.5 flex-wrap">
              {["看技术面对比", "未来增长预期", "风险因素"].map((chip) => (
                <span
                  key={chip}
                  className="text-micro text-white/30 border border-white/[0.10] rounded-full px-2.5 py-1 cursor-default"
                >
                  {chip}
                </span>
              ))}
            </div>
          </div>

          {/* Input */}
          <div className="px-4 pb-3">
            <div className="flex items-center gap-2 bg-white/[0.04] border border-white/[0.08] rounded-lg px-3 py-2.5">
              <span className="text-xs text-white/30">
                继续追问...
              </span>
            </div>
          </div>
        </div>

        {/* Right: Analysis Panel */}
        <div className="w-full sm:w-[55%] px-4 py-3 space-y-3 overflow-hidden">
          {/* Comparison header */}
          <div className="flex items-center gap-4 pb-2 border-b border-white/[0.05]">
            <div className="flex items-baseline gap-1.5">
              <span className="font-data text-sm font-bold text-sky-400">
                NVDA
              </span>
              <span className="font-data text-lg font-bold text-white/90">
                $112
              </span>
              <span className="font-data text-micro text-red-400">-3.2%</span>
            </div>
            <span className="text-white/25">vs</span>
            <div className="flex items-baseline gap-1.5">
              <span className="font-data text-sm font-bold text-amber-400">
                AMD
              </span>
              <span className="font-data text-lg font-bold text-white/90">
                $156
              </span>
              <span className="font-data text-micro text-emerald-400">
                +1.8%
              </span>
            </div>
          </div>

          {/* Comparison metrics */}
          <div className="space-y-1.5">
            {[
              {
                label: "P/E",
                a: "58.3x",
                b: "44.7x",
                winner: "b" as const,
              },
              {
                label: "营收增速",
                a: "+78%",
                b: "+10%",
                winner: "a" as const,
              },
              {
                label: "毛利率",
                a: "73.0%",
                b: "50.1%",
                winner: "a" as const,
              },
              {
                label: "市值",
                a: "$2.7T",
                b: "$252B",
                winner: "a" as const,
              },
            ].map((row) => (
              <div
                key={row.label}
                className="flex items-center gap-2 text-micro"
              >
                <span className="w-14 text-white/40">
                  {row.label}
                </span>
                <span
                  className={`flex-1 text-right font-data ${
                    row.winner === "a"
                      ? "text-sky-400 font-medium"
                      : "text-white/50"
                  }`}
                >
                  {row.a}
                </span>
                <div className="w-px h-3 bg-white/[0.08]" />
                <span
                  className={`flex-1 font-data ${
                    row.winner === "b"
                      ? "text-amber-400 font-medium"
                      : "text-white/50"
                  }`}
                >
                  {row.b}
                </span>
              </div>
            ))}
          </div>

          {/* AI Verdict */}
          <div className="border-l-2 border-sky-400/40 pl-3 py-2 bg-sky-400/[0.03] rounded-r-lg">
            <p className="text-micro text-sky-400/60 font-semibold uppercase tracking-wider mb-1">
              AI 结论
            </p>
            <p className="text-xs text-white/55 leading-relaxed">
              NVDA 在 AI 赛道具备绝对领先优势，适合看好 AI 长期增长的投资者。AMD 估值更合理，适合寻求安全边际的配置。
            </p>
          </div>

          {/* Screener preview */}
          <div className="bg-white/[0.03] rounded-lg border border-white/[0.06] p-3">
            <p className="text-micro text-white/40 font-semibold uppercase tracking-wider mb-2">
              AI 选股引擎
            </p>
            <div className="flex gap-2">
              {[
                { ticker: "NVDA", tag: "AI 芯片" },
                { ticker: "AVGO", tag: "AI 基建" },
                { ticker: "PLTR", tag: "AI 软件" },
              ].map((s) => (
                <div
                  key={s.ticker}
                  className="flex items-center gap-1.5 bg-white/[0.04] rounded px-2 py-1 border border-white/[0.05]"
                >
                  <span className="font-data text-micro font-semibold text-primary/80">
                    {s.ticker}
                  </span>
                  <span className="text-micro text-white/30">
                    {s.tag}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Bottom fade */}
      <div className="absolute bottom-0 left-0 right-0 h-12 bg-gradient-to-t from-[#0c0c0e] to-transparent pointer-events-none" />
    </div>
  );
}

function ResearchSection() {
  return (
    <section className="relative py-20 md:py-32 overflow-hidden">
      {/* Different background to create visual separation */}
      <div className="absolute inset-0 bg-muted/15" />
      <div className="absolute inset-0 bg-[linear-gradient(rgba(56,189,248,0.015)_1px,transparent_1px),linear-gradient(90deg,rgba(56,189,248,0.015)_1px,transparent_1px)] bg-[size:80px_80px]" />

      <div className="relative max-w-6xl mx-auto px-4 md:px-6">
        <div className="grid md:grid-cols-2 gap-12 lg:gap-20 items-center">
          {/* Left: Mockup (reversed layout for visual variety) */}
          <div className="relative order-2 md:order-1">
            <div className="absolute -inset-12 bg-sky-400/[0.04] blur-[80px] rounded-full pointer-events-none" />
            <div className="relative">
              <ResearchMockup />
            </div>
          </div>

          {/* Right: Content */}
          <div className="space-y-6 order-1 md:order-2">
            <SectionLabel label="AI 投研" />

            <h2 className="font-editorial text-3xl md:text-4xl lg:text-5xl text-foreground leading-[1.1]">
              对话式投研，
              <br />
              <span className="text-primary">追问到底</span>
            </h2>

            <p className="text-muted-foreground text-base md:text-lg leading-relaxed max-w-md">
              像和分析师对话一样研究股票。问一个问题开始，追问估值、对比竞品、分析风险 -- 直到你得到满意的答案。
            </p>

            {/* Capability highlights */}
            <div className="space-y-3 pt-2">
              {[
                {
                  title: "深度对话",
                  desc: "反复追问，直到得到满意答案",
                },
                {
                  title: "跨股票对比",
                  desc: "同行竞品估值对比，优劣势一目了然",
                },
                {
                  title: "AI 选股引擎",
                  desc: "描述偏好，AI 从全市场筛选匹配标的",
                },
              ].map((c) => (
                <div
                  key={c.title}
                  className="flex items-start gap-3 py-2"
                >
                  <div className="w-1.5 h-1.5 rounded-full bg-primary mt-2 shrink-0" />
                  <div>
                    <span className="text-sm font-medium text-foreground">
                      {c.title}
                    </span>
                    <span className="text-sm text-muted-foreground ml-1.5">
                      -- {c.desc}
                    </span>
                  </div>
                </div>
              ))}
            </div>

            {/* CTA */}
            <div className="pt-4">
              <Link
                href="/research"
                className="inline-flex items-center gap-2.5 px-6 py-3.5 bg-primary text-primary-foreground rounded-xl text-sm font-medium transition-all hover:bg-primary/90 active:scale-[0.98] cursor-pointer"
              >
                试试 AI 投研助手
                <ArrowIcon className="w-4 h-4" />
              </Link>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Feature 3: Macro Dashboard
// ---------------------------------------------------------------------------

function MacroMockup() {
  const dimensions = [
    {
      name: "流动性环境",
      signal: "green" as const,
      label: "宽松",
      score: 7.8,
      metrics: [
        { key: "净流动性", val: "$6.1T" },
        { key: "NFCI", val: "-0.23" },
      ],
    },
    {
      name: "经济基本面",
      signal: "yellow" as const,
      label: "中性",
      score: 5.5,
      metrics: [
        { key: "失业率", val: "3.9%" },
        { key: "衰退概率", val: "25%" },
      ],
    },
    {
      name: "通胀与利率",
      signal: "yellow" as const,
      label: "偏紧",
      score: 4.8,
      metrics: [
        { key: "核心CPI", val: "2.8%" },
        { key: "BBB利差", val: "1.42%" },
      ],
    },
    {
      name: "市场情绪",
      signal: "red" as const,
      label: "恐慌",
      score: 3.0,
      metrics: [
        { key: "恐贪指数", val: "30/100" },
        { key: "VIX", val: "30.0" },
      ],
    },
  ];

  const signalStyles = {
    green: {
      dot: "bg-emerald-400",
      border: "border-emerald-500/20",
      bg: "bg-emerald-500/[0.06]",
      text: "text-emerald-400",
      bar: "bg-emerald-400",
    },
    yellow: {
      dot: "bg-amber-400",
      border: "border-amber-500/20",
      bg: "bg-amber-500/[0.06]",
      text: "text-amber-400",
      bar: "bg-amber-400",
    },
    red: {
      dot: "bg-red-400",
      border: "border-red-500/20",
      bg: "bg-red-500/[0.06]",
      text: "text-red-400",
      bar: "bg-red-400",
    },
  };

  return (
    <div className="relative bg-[#0c0c0e] rounded-2xl border border-white/[0.08] overflow-hidden transition-all duration-500 hover:border-white/[0.12] hover:shadow-lg hover:shadow-amber-400/5">
      <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-amber-400/40 to-transparent" />

      <div className="px-5 py-5 space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="h-px w-6 bg-gradient-to-r from-amber-400 to-transparent" />
            <span className="text-micro font-semibold tracking-[0.2em] uppercase text-amber-400/80">
              Macro Dashboard
            </span>
          </div>
          <span className="text-micro text-white/30 font-data">
            实时更新
          </span>
        </div>

        {/* Overall risk score */}
        <div className="bg-white/[0.03] rounded-xl border border-white/[0.06] p-4">
          <div className="flex items-center justify-between mb-3">
            <div>
              <p className="text-micro text-white/40 mb-1">
                综合风险评分
              </p>
              <div className="flex items-baseline gap-1.5">
                <span className="font-data text-3xl font-bold text-white/90">
                  6.2
                </span>
                <span className="font-data text-sm text-white/30">
                  / 10
                </span>
              </div>
            </div>
            <span className="text-xs text-amber-400 bg-amber-400/10 border border-amber-400/20 rounded-md px-2.5 py-1 font-medium">
              中等风险
            </span>
          </div>
          {/* Risk bar */}
          <div className="h-2 bg-white/[0.06] rounded-full overflow-hidden">
            <div
              className="h-full rounded-full bg-gradient-to-r from-emerald-500 via-amber-400 to-red-500"
              style={{ width: "62%" }}
            />
          </div>
        </div>

        {/* Four dimension cards */}
        <div className="grid grid-cols-2 gap-2.5">
          {dimensions.map((d) => {
            const s = signalStyles[d.signal];
            return (
              <div
                key={d.name}
                className={`rounded-xl border p-3.5 ${s.bg} ${s.border}`}
              >
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-1.5">
                    <div className={`w-1.5 h-1.5 rounded-full ${s.dot}`} />
                    <span className="text-micro text-white/60 font-medium">
                      {d.name}
                    </span>
                  </div>
                  <span className={`text-micro font-semibold ${s.text}`}>
                    {d.label}
                  </span>
                </div>
                {/* Mini score bar */}
                <div className="h-1 bg-white/[0.04] rounded-full overflow-hidden mb-2.5">
                  <div
                    className={`h-full rounded-full ${s.bar}`}
                    style={{ width: `${d.score * 10}%` }}
                  />
                </div>
                <div className="space-y-1">
                  {d.metrics.map((m) => (
                    <div
                      key={m.key}
                      className="flex items-center justify-between"
                    >
                      <span className="text-micro text-white/30">
                        {m.key}
                      </span>
                      <span className="text-micro text-white/70 font-data font-medium">
                        {m.val}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Bottom fade */}
      <div className="absolute bottom-0 left-0 right-0 h-8 bg-gradient-to-t from-[#0c0c0e] to-transparent pointer-events-none" />
    </div>
  );
}

function MacroSection() {
  return (
    <section className="relative py-20 md:py-32 overflow-hidden">
      {/* Background */}
      <div className="absolute inset-0 bg-[linear-gradient(rgba(251,191,36,0.015)_1px,transparent_1px),linear-gradient(90deg,rgba(251,191,36,0.015)_1px,transparent_1px)] bg-[size:80px_80px]" />

      <div className="relative max-w-6xl mx-auto px-4 md:px-6">
        <div className="grid md:grid-cols-2 gap-12 lg:gap-20 items-center">
          {/* Left: Content */}
          <div className="space-y-6">
            <SectionLabel label="宏观监控" />

            <h2 className="font-editorial text-3xl md:text-4xl lg:text-5xl text-foreground leading-[1.1]">
              宏观全局，
              <br />
              <span className="text-primary">一眼看穿</span>
            </h2>

            <p className="text-muted-foreground text-base md:text-lg leading-relaxed max-w-md">
              四个维度追踪宏观经济 -- 流动性、基本面、通胀利率、市场情绪。理解驱动市场涨跌的底层力量，做出更清醒的投资决策。
            </p>

            {/* Four dimensions */}
            <div className="grid grid-cols-2 gap-3 pt-2">
              {[
                {
                  name: "流动性",
                  desc: "央行动向与资金面",
                  color: "text-emerald-400",
                },
                {
                  name: "经济基本面",
                  desc: "就业、GDP、消费",
                  color: "text-sky-400",
                },
                {
                  name: "通胀利率",
                  desc: "CPI、利差、联储",
                  color: "text-amber-400",
                },
                {
                  name: "市场情绪",
                  desc: "VIX、恐贪指数",
                  color: "text-red-400",
                },
              ].map((d) => (
                <div
                  key={d.name}
                  className="flex items-start gap-2.5 py-2"
                >
                  <div
                    className={`w-1.5 h-1.5 rounded-full mt-1.5 shrink-0 ${d.color.replace("text-", "bg-")}`}
                  />
                  <div>
                    <p className={`text-sm font-medium ${d.color}`}>{d.name}</p>
                    <p className="text-xs text-muted-foreground/60">
                      {d.desc}
                    </p>
                  </div>
                </div>
              ))}
            </div>

            {/* CTA */}
            <div className="pt-4">
              <Link
                href="/macro"
                className="inline-flex items-center gap-2.5 px-6 py-3.5 bg-primary text-primary-foreground rounded-xl text-sm font-medium transition-all hover:bg-primary/90 active:scale-[0.98] cursor-pointer"
              >
                查看宏观仪表盘
                <ArrowIcon className="w-4 h-4" />
              </Link>
            </div>
          </div>

          {/* Right: Mockup */}
          <div className="relative">
            <div className="absolute -inset-12 bg-amber-400/[0.03] blur-[80px] rounded-full pointer-events-none" />
            <div className="relative">
              <MacroMockup />
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Export: All three sections combined
// ---------------------------------------------------------------------------

export default function FeatureSections() {
  return (
    <>
      <DailyReportsSection />
      <StockResearchSection />
      <ResearchSection />
      <MacroSection />
    </>
  );
}
