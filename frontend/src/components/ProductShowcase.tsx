"use client";

import { useState, useEffect, useCallback, useRef } from "react";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const AUTO_ROTATE_MS = 6000;

const TABS = [
  { id: "daily", label: "市场日报", route: "/today" },
  { id: "morning", label: "盘前早报", route: "/morning" },
  { id: "research", label: "AI 投研助手", route: "/research" },
  { id: "macro", label: "宏观仪表盘", route: "/macro" },
] as const;

const TAB_CONTENT = [
  {
    title: "每日市场简报",
    description:
      "收盘后 AI 自动生成，5 分钟掌握当日市场全貌。从指数表现到新闻解读，一份报告涵盖你需要知道的一切。",
    points: [
      "6 大指数实时数据",
      "AI 提炼今日要点",
      "重要新闻深度解读",
      "近期事件日历",
    ],
  },
  {
    title: "盘前早报",
    description:
      "每个交易日开盘前发布，帮你用 10 分钟做好今天的交易准备。",
    points: [
      "三大期货实时走势",
      "全球市场隔夜表现",
      "隔夜重要新闻",
      "今日关注焦点",
    ],
  },
  {
    title: "AI 投研助手",
    description:
      "用自然语言对话，深度研究任意美股。基本面、技术面、新闻面 -- 一个问题开始，追问到底。",
    points: [
      "对话式深度研究",
      "五维度综合分析",
      "跨股票对比",
      "全市场 AI 选股",
    ],
  },
  {
    title: "宏观仪表盘",
    description:
      "四个维度追踪宏观经济环境，理解推动市场涨跌的底层力量。",
    points: [
      "流动性环境监控",
      "经济基本面追踪",
      "通胀与利率分析",
      "市场情绪指标",
    ],
  },
];

// ---------------------------------------------------------------------------
// Shared sub-components
// ---------------------------------------------------------------------------

function LockIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
    >
      <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
      <path d="M7 11V7a5 5 0 0 1 10 0v4" />
    </svg>
  );
}

function CheckIcon({ className }: { className?: string }) {
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
        d="M5 13l4 4L19 7"
      />
    </svg>
  );
}

// ---------------------------------------------------------------------------
// Tab content renderers (inside browser viewport)
// ---------------------------------------------------------------------------

function DailyReportMockup() {
  const indices = [
    { name: "S&P 500", val: "5,396", chg: "-4.84%", up: false },
    { name: "NASDAQ", val: "16,550", chg: "-5.97%", up: false },
    { name: "VIX", val: "30.02", chg: "+39.4%", up: false },
    { name: "GOLD", val: "3,136", chg: "+1.53%", up: true },
    { name: "US DOLLAR", val: "101.9", chg: "-1.69%", up: false },
    { name: "10Y YIELD", val: "3.99%", chg: "-8bp", up: true },
  ];

  const takeaways = [
    '特朗普宣布全面"对等关税"，引发全球股市抛售',
    "黄金突破 3100 大关，避险资产需求激增",
    "VIX 恐慌指数飙至 30 以上，为近半年最高",
  ];

  return (
    <div className="px-4 py-3 space-y-3">
      {/* Header */}
      <div>
        <div className="flex items-center gap-2 mb-1.5">
          <div className="h-px w-8 bg-gradient-to-r from-emerald-500 to-transparent" />
          <span className="text-[9px] font-semibold tracking-[0.2em] uppercase text-emerald-400">
            DAILY REPORT
          </span>
        </div>
        <p className="text-[9px] text-white/30 font-data mb-2">
          2026-04-04 Friday
        </p>
        <h2
          className="text-sm font-semibold text-white/90 leading-snug mb-1"
          style={{ fontFamily: "var(--font-serif)" }}
        >
          关税冲击波蔓延，全球市场剧烈震荡
        </h2>
        <p className="text-[10px] text-white/40 leading-relaxed">
          美国宣布全面对等关税后，风险资产遭大规模抛售，避险资产全线走强。
        </p>
      </div>

      {/* Index Grid */}
      <div className="grid grid-cols-3 gap-1.5">
        {indices.map((d) => (
          <div
            key={d.name}
            className="bg-white/[0.04] rounded-lg border border-white/[0.06] p-2"
          >
            <p className="text-[8px] text-white/35 truncate">{d.name}</p>
            <p className="text-[11px] text-white/90 font-semibold font-data mt-0.5">
              {d.val}
            </p>
            <p
              className={`text-[9px] font-data font-medium ${
                d.up ? "text-emerald-400" : "text-red-400"
              }`}
            >
              {d.chg}
            </p>
          </div>
        ))}
      </div>

      {/* Key Takeaways */}
      <div>
        <p className="text-[9px] text-white/50 font-semibold mb-1.5 tracking-wide uppercase">
          Key Takeaways
        </p>
        <div className="space-y-1.5">
          {takeaways.map((t, i) => (
            <div key={i} className="flex items-start gap-1.5">
              <div className="w-1 h-1 rounded-full bg-emerald-400 mt-[4px] flex-shrink-0" />
              <p className="text-[10px] text-white/60 leading-relaxed">{t}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function MorningReportMockup() {
  const futures = [
    { name: "ES 期货", val: "5,338", chg: "-1.08%", up: false },
    { name: "NQ 期货", val: "18,375", chg: "-1.45%", up: false },
    { name: "YM 期货", val: "40,200", chg: "-0.82%", up: false },
  ];

  const news = [
    {
      en: "EU Proposes Retaliatory Tariffs on US Goods",
      zh: "欧盟拟对美国商品征收报复性关税，涵盖农产品与科技产品...",
    },
    {
      en: "Asian Markets Tumble in Wake of US Tariff Announcement",
      zh: "亚太市场全线下跌，日经跌超 3%，恒生指数跌 2.8%...",
    },
  ];

  return (
    <div className="px-4 py-3 space-y-3">
      {/* Header */}
      <div>
        <div className="flex items-center gap-2 mb-1.5">
          <div className="h-px w-8 bg-gradient-to-r from-amber-400 to-transparent" />
          <span className="text-[9px] font-semibold tracking-[0.2em] uppercase text-amber-400">
            MORNING BRIEF
          </span>
        </div>
        <p className="text-[9px] text-white/30 font-data">
          2026-04-05 Saturday
        </p>
      </div>

      {/* Market Pulse */}
      <div className="rounded-lg border border-amber-400/25 bg-amber-400/[0.05] p-2.5">
        <p className="text-[8px] text-amber-400/70 font-semibold uppercase tracking-wider mb-1">
          Market Pulse
        </p>
        <p className="text-[10px] text-white/70 leading-relaxed">
          全球市场剧烈震荡消化关税冲击，避险情绪持续升温
        </p>
      </div>

      {/* Futures Grid */}
      <div className="space-y-1.5">
        {futures.map((f) => (
          <div
            key={f.name}
            className="flex items-center justify-between bg-white/[0.04] rounded-lg border border-amber-400/[0.08] px-3 py-2"
          >
            <span className="text-[10px] text-white/50">{f.name}</span>
            <div className="flex items-center gap-3">
              <span className="text-[11px] text-white/90 font-data font-semibold">
                {f.val}
              </span>
              <span
                className={`text-[10px] font-data font-medium min-w-[50px] text-right ${
                  f.up ? "text-emerald-400" : "text-red-400"
                }`}
              >
                {f.chg}
              </span>
            </div>
          </div>
        ))}
      </div>

      {/* Overnight News */}
      <div>
        <p className="text-[9px] text-amber-400/60 font-semibold mb-1.5 tracking-wide uppercase">
          隔夜要闻
        </p>
        <div className="space-y-2">
          {news.map((n, i) => (
            <div key={i} className="border-l-2 border-amber-400/30 pl-2">
              <p className="text-[10px] text-white/70 font-semibold leading-tight mb-0.5">
                {n.en}
              </p>
              <p className="text-[9px] text-white/40 leading-relaxed">
                {n.zh}
              </p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function ResearchMockup() {
  const fundamentals = [
    { label: "P/E", value: "58.3x" },
    { label: "营收", value: "+78%" },
    { label: "毛利率", value: "73.0%" },
  ];

  const technicals = [
    { label: "RSI", value: "38" },
    { label: "MACD", value: "空头" },
    { label: "支撑位", value: "$105" },
  ];

  return (
    <div className="flex h-full">
      {/* Left: Chat Panel */}
      <div className="w-[42%] border-r border-white/[0.06] flex flex-col bg-white/[0.01]">
        <div className="flex-1 px-3 py-3 space-y-3 overflow-hidden">
          {/* User message */}
          <div className="flex justify-end">
            <div className="bg-white/[0.08] rounded-xl rounded-br-sm px-2.5 py-1.5 max-w-[90%]">
              <p className="text-[10px] text-white/80 leading-relaxed">
                帮我分析一下 NVDA 最近的走势
              </p>
            </div>
          </div>

          {/* AI message */}
          <div className="flex justify-start">
            <div className="max-w-[95%]">
              <p className="text-[10px] text-white/65 leading-[1.7]">
                NVDA 正面临短期回调压力。虽然基本面依然强劲 --
                数据中心营收同比增长 78%，但在全面关税不确定性下，高估值科技股承受较大抛压。RSI
                已跌至 38 的偏弱区间...
              </p>
            </div>
          </div>

          {/* Option Chips */}
          <div className="flex gap-1.5 flex-wrap">
            {["追问估值", "对比 AMD", "查看技术面"].map((chip) => (
              <span
                key={chip}
                className="text-[9px] text-white/40 border border-white/10 rounded-full px-2 py-0.5 hover:border-white/20 hover:text-white/55 transition-colors cursor-default"
              >
                {chip}
              </span>
            ))}
          </div>
        </div>

        {/* Input */}
        <div className="px-3 pb-3">
          <div className="flex items-center gap-2 bg-white/[0.04] border border-white/[0.08] rounded-lg px-2.5 py-1.5">
            <span className="text-[10px] text-white/20">
              输入你的问题...
            </span>
          </div>
        </div>
      </div>

      {/* Right: Analysis Panel */}
      <div className="w-[58%] px-3 py-3 space-y-2.5 overflow-hidden">
        {/* Stock Header */}
        <div>
          <div className="flex items-baseline gap-2 mb-0.5">
            <span className="font-data text-xs font-bold text-emerald-400">
              NVDA
            </span>
            <span className="text-[9px] text-white/35">NVIDIA Corp</span>
          </div>
          <div className="flex items-baseline gap-2">
            <span className="font-data text-lg font-bold text-white/90">
              $112.30
            </span>
            <span className="font-data text-[10px] font-medium text-red-400">
              -3.22%
            </span>
          </div>
        </div>

        {/* Two-column metrics */}
        <div className="grid grid-cols-2 gap-2">
          {/* Fundamentals */}
          <div>
            <p className="text-[8px] text-emerald-400/60 font-semibold uppercase tracking-wider mb-1">
              基本面
            </p>
            <div className="space-y-1">
              {fundamentals.map((m) => (
                <div
                  key={m.label}
                  className="flex items-center justify-between"
                >
                  <span className="text-[9px] text-white/35">{m.label}</span>
                  <span className="text-[10px] text-white/80 font-data font-medium">
                    {m.value}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Technicals */}
          <div>
            <p className="text-[8px] text-emerald-400/60 font-semibold uppercase tracking-wider mb-1">
              技术面
            </p>
            <div className="space-y-1">
              {technicals.map((m) => (
                <div
                  key={m.label}
                  className="flex items-center justify-between"
                >
                  <span className="text-[9px] text-white/35">{m.label}</span>
                  <span className="text-[10px] text-white/80 font-data font-medium">
                    {m.value}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* AI Summary */}
        <div className="border-l-2 border-emerald-500/50 pl-2.5 py-1.5 bg-emerald-500/[0.03] rounded-r-lg">
          <p className="text-[8px] text-emerald-400/50 font-semibold uppercase tracking-wider mb-1">
            AI 分析摘要
          </p>
          <p className="text-[9px] text-white/55 leading-[1.7]">
            短期承压但长期增长逻辑未变。当前估值在关税不确定性下风险偏高，建议关注
            $105 支撑位表现。若有效守住，可视为加仓机会。
          </p>
        </div>
      </div>
    </div>
  );
}

function MacroDashboardMockup() {
  const dimensions = [
    {
      name: "流动性环境",
      signal: "green" as const,
      signalLabel: "宽松",
      metrics: ["$6.1T 净流动性", "NFCI -0.23"],
    },
    {
      name: "经济基本面",
      signal: "yellow" as const,
      signalLabel: "中性",
      metrics: ["3.9% 失业率", "衰退概率 25%"],
    },
    {
      name: "通胀与利率",
      signal: "yellow" as const,
      signalLabel: "偏紧",
      metrics: ["2.8% 核心CPI", "BBB利差 1.42%"],
    },
    {
      name: "市场情绪",
      signal: "red" as const,
      signalLabel: "恐慌",
      metrics: ["30/100 恐贪指数", "VIX 30.0"],
    },
  ];

  const signalStyles = {
    green: {
      dot: "bg-emerald-400",
      bg: "bg-emerald-500/[0.06]",
      border: "border-emerald-500/20",
      text: "text-emerald-400",
    },
    yellow: {
      dot: "bg-amber-400",
      bg: "bg-amber-500/[0.06]",
      border: "border-amber-500/20",
      text: "text-amber-400",
    },
    red: {
      dot: "bg-red-400",
      bg: "bg-red-500/[0.06]",
      border: "border-red-500/20",
      text: "text-red-400",
    },
  };

  return (
    <div className="px-4 py-3 space-y-3">
      {/* Header */}
      <div className="flex items-center gap-2 mb-1">
        <div className="h-px w-8 bg-gradient-to-r from-emerald-500 to-transparent" />
        <span className="text-[9px] font-semibold tracking-[0.2em] uppercase text-emerald-400">
          MACRO DASHBOARD
        </span>
      </div>

      {/* Overall Risk Score */}
      <div className="bg-white/[0.04] rounded-lg border border-white/[0.06] p-3">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-baseline gap-2">
            <span className="font-data text-xl font-bold text-white/90">
              6.2
            </span>
            <span className="text-[10px] text-white/30 font-data">/ 10</span>
          </div>
          <span className="text-[9px] text-amber-400 bg-amber-400/10 border border-amber-400/20 rounded px-1.5 py-0.5 font-medium">
            中等风险
          </span>
        </div>
        {/* Progress bar */}
        <div className="h-1.5 bg-white/[0.06] rounded-full overflow-hidden">
          <div
            className="h-full rounded-full bg-gradient-to-r from-emerald-500 via-amber-400 to-red-500"
            style={{ width: "62%" }}
          />
        </div>
      </div>

      {/* Dimension Cards - 2x2 */}
      <div className="grid grid-cols-2 gap-1.5">
        {dimensions.map((d) => {
          const s = signalStyles[d.signal];
          return (
            <div
              key={d.name}
              className={`rounded-lg border p-2.5 ${s.bg} ${s.border}`}
            >
              <div className="flex items-center gap-1.5 mb-2">
                <div className={`w-1.5 h-1.5 rounded-full ${s.dot}`} />
                <span className="text-[9px] text-white/60 font-medium">
                  {d.name}
                </span>
              </div>
              <p className={`text-[10px] font-semibold mb-1.5 ${s.text}`}>
                {d.signalLabel}
              </p>
              <div className="space-y-0.5">
                {d.metrics.map((m) => (
                  <p key={m} className="text-[9px] text-white/40 font-data">
                    {m}
                  </p>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// Tab content array for indexed access
const TAB_MOCKUPS = [
  DailyReportMockup,
  MorningReportMockup,
  ResearchMockup,
  MacroDashboardMockup,
];

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------

export default function ProductShowcase() {
  const [activeTab, setActiveTab] = useState(0);
  const [transitioning, setTransitioning] = useState(false);
  const [paused, setPaused] = useState(false);
  const [progress, setProgress] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const progressRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const handleTabChange = useCallback(
    (index: number) => {
      if (index === activeTab || transitioning) return;
      setTransitioning(true);
      setProgress(0);
      setTimeout(() => {
        setActiveTab(index);
        setTransitioning(false);
      }, 150);
    },
    [activeTab, transitioning]
  );

  // Auto-rotate: advance tab every AUTO_ROTATE_MS, pause on hover
  useEffect(() => {
    if (paused) return;

    // Progress bar: update every 50ms for smooth animation
    const progressStep = 50 / AUTO_ROTATE_MS;
    progressRef.current = setInterval(() => {
      setProgress((prev) => Math.min(prev + progressStep, 1));
    }, 50);

    // Tab advance
    timerRef.current = setInterval(() => {
      setTransitioning(true);
      setProgress(0);
      setTimeout(() => {
        setActiveTab((prev) => (prev + 1) % TABS.length);
        setTransitioning(false);
      }, 150);
    }, AUTO_ROTATE_MS);

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      if (progressRef.current) clearInterval(progressRef.current);
    };
  }, [paused]);

  const handleMouseEnter = useCallback(() => setPaused(true), []);
  const handleMouseLeave = useCallback(() => {
    setPaused(false);
    setProgress(0);
  }, []);

  const ActiveMockup = TAB_MOCKUPS[activeTab];
  const content = TAB_CONTENT[activeTab];
  const activeRoute = TABS[activeTab].route;

  return (
    <section
      className="relative py-16 md:py-24 overflow-hidden"
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      {/* Subtle grid background */}
      <div className="absolute inset-0 bg-[linear-gradient(rgba(16,185,129,0.03)_1px,transparent_1px),linear-gradient(90deg,rgba(16,185,129,0.03)_1px,transparent_1px)] bg-[size:60px_60px]" />

      <div className="relative max-w-6xl mx-auto px-4 md:px-6">
        <div className="grid md:grid-cols-2 gap-12 lg:gap-16 items-center">
          {/* ============================================================
              LEFT SIDE: Content + Tabs
              ============================================================ */}
          <div className="space-y-6">
            {/* Editorial label */}
            <div className="flex items-center gap-3">
              <div className="h-px flex-1 max-w-[60px] bg-gradient-to-r from-primary to-transparent" />
              <span className="text-primary text-xs font-semibold tracking-[0.25em] uppercase">
                PRODUCT
              </span>
            </div>

            {/* Title + description (transitions with tab) */}
            <div
              className="transition-all duration-300 ease-out"
              style={{
                opacity: transitioning ? 0 : 1,
                transform: transitioning
                  ? "translateY(-6px)"
                  : "translateY(0)",
              }}
            >
              <h2 className="font-editorial text-4xl md:text-5xl lg:text-6xl text-foreground leading-[1.1] mb-5">
                {content.title}
              </h2>
              <p className="text-muted-foreground text-base md:text-lg leading-relaxed mb-8">
                {content.description}
              </p>

              {/* Feature points */}
              <ul className="space-y-3.5">
                {content.points.map((point, i) => (
                  <li key={i} className="flex items-start gap-3">
                    <div className="w-5 h-5 rounded-full bg-primary/20 flex items-center justify-center mt-0.5 flex-shrink-0">
                      <CheckIcon className="w-3 h-3 text-primary" />
                    </div>
                    <span className="text-foreground text-sm md:text-base">
                      {point}
                    </span>
                  </li>
                ))}
              </ul>
            </div>

            {/* Tab buttons with progress bar */}
            <div className="flex gap-2 overflow-x-auto pt-4 pb-1 -mx-1 px-1">
              {TABS.map((tab, i) => (
                <button
                  key={tab.id}
                  onClick={() => handleTabChange(i)}
                  className={`relative flex-shrink-0 text-xs font-medium px-3.5 py-3 min-h-[44px] flex items-center rounded-lg border transition-all duration-200 overflow-hidden ${
                    activeTab === i
                      ? "bg-primary/15 border-primary/30 text-primary"
                      : "bg-transparent border-border/40 text-muted-foreground hover:border-border/60 hover:text-foreground"
                  }`}
                >
                  {tab.label}
                  {/* Progress bar under active tab */}
                  {activeTab === i && !paused && (
                    <span
                      className="absolute bottom-0 left-0 h-[2px] bg-primary/50 transition-none"
                      style={{ width: `${progress * 100}%` }}
                    />
                  )}
                </button>
              ))}
            </div>
          </div>

          {/* ============================================================
              RIGHT SIDE: Browser Mockup
              ============================================================ */}
          <div className="flex justify-center">
            <div className="relative w-full max-w-[520px] group">
              {/* Ambient glow */}
              <div className="absolute -inset-12 bg-primary/[0.07] blur-[60px] rounded-full pointer-events-none transition-opacity duration-500 group-hover:bg-primary/[0.10]" />

              {/* Browser window */}
              <div
                className="relative bg-[#1e1e22] rounded-xl overflow-hidden border border-white/[0.08] transition-transform duration-500 ease-out group-hover:scale-[1.01]"
                style={{
                  boxShadow:
                    "0 25px 60px -12px rgba(0,0,0,0.5), 0 0 40px -8px rgba(16,185,129,0.1)",
                  transform:
                    "perspective(1200px) rotateY(-2deg) rotateX(1deg)",
                }}
              >
                {/* Title bar */}
                <div className="flex items-center px-4 py-2.5 bg-[#2a2a2e]/90 border-b border-white/[0.06]">
                  {/* Traffic lights */}
                  <div className="flex gap-1.5">
                    <div className="w-2.5 h-2.5 rounded-full bg-[#ff5f57]" />
                    <div className="w-2.5 h-2.5 rounded-full bg-[#febc2e]" />
                    <div className="w-2.5 h-2.5 rounded-full bg-[#28c840]" />
                  </div>

                  {/* Address bar */}
                  <div className="mx-auto flex items-center gap-1.5 bg-[#1a1a1e] rounded-md px-3 py-1">
                    <LockIcon className="w-3 h-3 text-white/30" />
                    <span className="text-[11px] text-white/40 font-data">
                      themarketbrew.com
                      <span className="text-white/25">{activeRoute}</span>
                    </span>
                  </div>

                  {/* Spacer for symmetry */}
                  <div className="w-[52px]" />
                </div>

                {/* Content area */}
                <div
                  className="relative bg-[#0a0a0c] overflow-hidden"
                  style={{ height: 440 }}
                >
                  {/* Tab mockup content with transition */}
                  <div
                    className="h-full overflow-hidden transition-all duration-300 ease-out"
                    style={{
                      opacity: transitioning ? 0 : 1,
                      transform: transitioning
                        ? "translateY(6px)"
                        : "translateY(0)",
                    }}
                  >
                    <ActiveMockup />
                  </div>

                  {/* Bottom fade */}
                  <div className="absolute bottom-0 left-0 right-0 h-20 bg-gradient-to-t from-[#0a0a0c] to-transparent pointer-events-none z-10" />
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
