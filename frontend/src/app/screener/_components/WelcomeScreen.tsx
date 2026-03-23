'use client';

import { useState, useCallback } from 'react';
import type { ConversationSummary } from '@/lib/api';
import { marketTodayStr } from '@/lib/timezone';
import ChatInput from './ChatInput';

// ---------------------------------------------------------------------------
// Preset data
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Strategy pool (8 total, show 4 at a time, rotate every 15s)
// ---------------------------------------------------------------------------

const ALL_STRATEGIES = [
  {
    label: '稳定收益',
    desc: '高股息、持续派息',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="w-5 h-5">
        <ellipse cx="12" cy="6" rx="8" ry="3" />
        <path d="M4 6v4c0 1.657 3.582 3 8 3s8-1.343 8-3V6" />
        <path d="M4 10v4c0 1.657 3.582 3 8 3s8-1.343 8-3v-4" />
        <path d="M4 14v4c0 1.657 3.582 3 8 3s8-1.343 8-3v-4" />
      </svg>
    ),
  },
  {
    label: '成长动能',
    desc: '营收加速、赛道领先',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="w-5 h-5">
        <path d="M22 7l-8.5 8.5-5-5L2 17" />
        <path d="M16 7h6v6" />
      </svg>
    ),
  },
  {
    label: '价值发现',
    desc: '低估值、高质量',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="w-5 h-5">
        <path d="M6 3h12l4 6-10 13L2 9z" />
        <path d="M2 9h20" />
        <path d="M10 3l-2 6 4 13 4-13-2-6" />
      </svg>
    ),
  },
  {
    label: '趋势策略',
    desc: '量价配合、均线突破',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="w-5 h-5">
        <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" />
      </svg>
    ),
  },
  {
    label: '科技前沿',
    desc: '大市值科技领军',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="w-5 h-5">
        <rect x="6" y="6" width="12" height="12" rx="1" />
        <path d="M9 1v4M15 1v4M9 19v4M15 19v4M1 9h4M1 15h4M19 9h4M19 15h4" />
      </svg>
    ),
  },
  {
    label: '防御配置',
    desc: '低波动、稳健经营',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="w-5 h-5">
        <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
      </svg>
    ),
  },
  {
    label: '现金流优选',
    desc: '自由现金流充沛',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="w-5 h-5">
        <rect x="2" y="6" width="20" height="12" rx="2" />
        <circle cx="12" cy="12" r="3" />
        <path d="M2 10h2M20 10h2M2 14h2M20 14h2" />
      </svg>
    ),
  },
  {
    label: '高速成长',
    desc: '中小市值、增速领先',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="w-5 h-5">
        <path d="M7 17L17 7M17 7H7M17 7v10" />
      </svg>
    ),
  },
];

// ---------------------------------------------------------------------------
// Theme pool (28 total, show 6 at a time, rotate every 10s)
// ---------------------------------------------------------------------------

const ALL_THEMES = [
  // Sector + quality long-tail
  '最近被低估的软件股',
  '近期涨幅领先的芯片公司',
  '盈利能力最强的云计算公司',
  '被华尔街看好的生物科技股',
  '营收增速最快的网络安全公司',
  '自由现金流最强的科技巨头',
  '利润率最高的医药公司',
  '增长最快的数字支付公司',
  '估值最低的工业股',
  '现金流最好的新能源公司',
  // Metric-driven
  'PE 低于 15 且 ROE 超过 20%',
  '股息率超过 4% 的蓝筹股',
  '毛利率超过 60% 的高壁垒公司',
  '连续 3 年营收增长超 30%',
  '负债率低于 30% 的优质公司',
  '研发投入占比最高的科技公司',
  // Timing + quality
  '最近从高位回调 20% 的好公司',
  '近期突破 52 周新高的强势股',
  'RSI 超跌的优质成长股',
  '最近成交量明显放大的股票',
  '最近财报超预期的公司',
  // Style + characteristic
  '机构持仓比例最高的中盘股',
  '回购力度最大的公司',
  '海外营收占比超 50% 的跨国企业',
  '分析师一致给出买入评级的标的',
  '连续 10 年以上稳定分红的公司',
  '增速最快的 AI 应用公司',
  '市盈率最低的消费龙头',
];

// ---------------------------------------------------------------------------
// Selection helpers (exclude current set to guarantee fresh items)
// ---------------------------------------------------------------------------

type StrategyPreset = (typeof ALL_STRATEGIES)[number];

function pickStrategies(count: number, excludeLabels: string[] = []): StrategyPreset[] {
  const available = ALL_STRATEGIES.filter(s => !excludeLabels.includes(s.label));
  const pool = available.length >= count ? available : ALL_STRATEGIES;
  return [...pool].sort(() => Math.random() - 0.5).slice(0, count);
}

function pickThemes(count: number, exclude: string[] = []): string[] {
  const available = ALL_THEMES.filter(t => !exclude.includes(t));
  const pool = available.length >= count ? available : ALL_THEMES;
  return [...pool].sort(() => Math.random() - 0.5).slice(0, count);
}

// ---------------------------------------------------------------------------
// Decorative SVGs
// ---------------------------------------------------------------------------

/** Dot grid background pattern (Vercel-style) */
function DotGrid() {
  return (
    <svg className="absolute inset-0 w-full h-full" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <pattern id="screener-dots" x="0" y="0" width="24" height="24" patternUnits="userSpaceOnUse">
          <circle cx="1.5" cy="1.5" r="0.75" className="fill-foreground/[0.04]" />
        </pattern>
      </defs>
      <rect width="100%" height="100%" fill="url(#screener-dots)" />
    </svg>
  );
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatRelativeTime(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1) return '刚刚';
  if (diffMin < 60) return `${diffMin}分钟前`;
  const diffHours = Math.floor(diffMin / 60);
  if (diffHours < 24) return `${diffHours}小时前`;
  const diffDays = Math.floor(diffHours / 24);
  if (diffDays < 7) return `${diffDays}天前`;
  return `${date.getMonth() + 1}月${date.getDate()}日`;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

interface WelcomeScreenProps {
  onSelect: (value: string) => void;
  onEnterDailyReport?: () => void;
  onEnterMacro?: () => void;
  universeSize?: number;
  conversations?: ConversationSummary[];
  conversationsLoading?: boolean;
  onLoadConversation?: (id: string) => void;
  onDeleteConversation?: (id: string) => void;
}

function todayLabel(): string {
  const [, month, day] = marketTodayStr().split('-');
  return `${parseInt(month)}月${parseInt(day)}日`;
}

export default function WelcomeScreen({
  onSelect,
  onEnterDailyReport,
  onEnterMacro,
  universeSize,
  conversations = [],
  conversationsLoading = false,
  onLoadConversation,
  onDeleteConversation,
}: WelcomeScreenProps) {
  // Rotating pools
  const [strategies, setStrategies] = useState(() => pickStrategies(4));
  const [themes, setThemes] = useState(() => pickThemes(6));
  const [strategyExiting, setStrategyExiting] = useState(false);
  const [themeExiting, setThemeExiting] = useState(false);

  const rotateStrategies = useCallback(() => {
    setStrategyExiting(true);
    setTimeout(() => {
      setStrategies(prev => pickStrategies(4, prev.map(s => s.label)));
      setStrategyExiting(false);
    }, 300);
  }, []);

  const rotateThemes = useCallback(() => {
    setThemeExiting(true);
    setTimeout(() => {
      setThemes(prev => pickThemes(6, prev));
      setThemeExiting(false);
    }, 300);
  }, []);

  return (
    <div className="relative min-h-[calc(100vh-4rem)] flex items-center justify-center px-4 sm:px-6 lg:px-8 py-8 lg:py-0 overflow-hidden">
      {/* ── Background layers ── */}
      <DotGrid />
      {/* Emerald gradient orb — Apple-style ambient glow */}
      <div className="absolute top-1/3 -left-32 w-[500px] h-[500px] rounded-full bg-primary/[0.07] blur-[120px] pointer-events-none" />
      <div className="absolute bottom-1/4 right-0 w-[300px] h-[300px] rounded-full bg-primary/[0.04] blur-[100px] pointer-events-none" />

      <div className="relative w-full max-w-5xl z-10">
        {/* Split layout: stack on mobile, side-by-side on lg */}
        <div className="flex flex-col lg:flex-row lg:items-stretch lg:gap-16">

          {/* ── Left column: Brand + Visual ── */}
          <div className="lg:w-[400px] shrink-0 flex flex-col justify-center lg:py-12">
            {/* Brand mark */}
            <div className="animate-fade-in-up">
              <div className="w-11 h-11 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center mb-6">
                <svg className="w-6 h-6" viewBox="0 0 32 32" fill="none">
                  <path
                    d="M4 24V12L10 6V24M10 6L16 14L22 6M22 6V24M28 24V12L22 6"
                    stroke="url(#welcome-logo-grad)"
                    strokeWidth="2.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                  <defs>
                    <linearGradient id="welcome-logo-grad" x1="0%" y1="0%" x2="100%" y2="100%">
                      <stop offset="0%" stopColor="#10B981" />
                      <stop offset="50%" stopColor="#34D399" />
                      <stop offset="100%" stopColor="#6EE7B7" />
                    </linearGradient>
                  </defs>
                </svg>
              </div>

              <h1 className="text-3xl lg:text-4xl font-editorial text-foreground tracking-tight leading-tight">
                你的 AI
                <br />
                <span className="text-primary">投研助手</span>
              </h1>

              <p className="mt-4 text-sm lg:text-base text-muted-foreground leading-relaxed max-w-sm">
                {universeSize
                  ? `覆盖 ${universeSize.toLocaleString()}+ 只美股，从选股筛选到深度研究，随时开聊`
                  : '从选股筛选到个股研究，AI 随时陪你深入分析'
                }
              </p>
            </div>

            {/* Stats row */}
            <div className="flex items-center gap-6 mt-6 animate-fade-in-up delay-100">
              {universeSize ? (
                <div>
                  <p className="text-lg font-data font-medium text-foreground">{universeSize.toLocaleString()}+</p>
                  <p className="text-xs text-muted-foreground/70">覆盖美股</p>
                </div>
              ) : null}
              <div>
                <p className="text-lg font-data font-medium text-foreground">50+</p>
                <p className="text-xs text-muted-foreground/70">分析维度</p>
              </div>
              <div className="flex items-start gap-2">
                <div>
                  <div className="flex items-center gap-1.5">
                    <p className="text-lg font-data font-medium text-foreground leading-none">实时</p>
                    {/* Live pulse indicator */}
                    <span className="relative flex h-2 w-2 mt-0.5 shrink-0">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-75" />
                      <span className="relative inline-flex rounded-full h-2 w-2 bg-primary" />
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground/70 mt-1">数据更新</p>
                </div>
              </div>
            </div>

            {/* Divider - only on desktop */}
            <div className="hidden lg:block w-12 h-px bg-border/60 mt-8 mb-6" />

            {/* Recent conversations - desktop only for left column */}
            {!conversationsLoading && conversations.length > 0 && (
              <div className="hidden lg:block animate-fade-in-up delay-300">
                <p className="text-xs font-medium text-muted-foreground/60 uppercase tracking-wider mb-3">
                  继续之前的对话
                </p>
                <div className="space-y-1 max-h-64 overflow-y-auto overflow-x-hidden conversation-scroll">
                  {conversations.map((conv) => (
                    <div
                      key={conv.id}
                      className="group flex items-center justify-between px-3 py-2.5 -mx-3 rounded-lg hover:bg-card/80 border border-transparent hover:border-border/40 transition-all duration-200"
                    >
                      <button
                        type="button"
                        className="flex items-center gap-2.5 flex-1 min-w-0 text-left"
                        onClick={() => onLoadConversation?.(conv.id)}
                      >
                        <svg aria-hidden="true" className="w-3.5 h-3.5 shrink-0 text-muted-foreground/40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                        </svg>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm text-foreground truncate">
                            {conv.title || '未命名对话'}
                          </p>
                          <p className="text-xs text-muted-foreground/50 mt-0.5">
                            {formatRelativeTime(conv.updated_at)} · {conv.message_count} 条消息
                          </p>
                        </div>
                      </button>
                      <button
                        type="button"
                        onClick={() => onDeleteConversation?.(conv.id)}
                        aria-label={`删除对话：${conv.title || '未命名对话'}`}
                        className="opacity-0 group-hover:opacity-100 focus:opacity-100 ml-2 p-1 text-muted-foreground/40 hover:text-red-500 focus:text-red-500 transition-all duration-150 rounded"
                      >
                        <svg aria-hidden="true" className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <path d="M18 6L6 18M6 6l12 12" />
                        </svg>
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* ── Vertical divider (desktop only) ── */}
          <div className="hidden lg:flex items-center">
            <div className="w-px h-96 bg-gradient-to-b from-transparent via-border/60 to-transparent" />
          </div>

          {/* ── Right column: Quick Entry + Strategies + Themes + Input ── */}
          <div className="flex-1 flex flex-col justify-center mt-10 lg:mt-0 lg:py-12">

            {/* ── Quick context entry ── */}
            <div className="animate-fade-in-up delay-100">
              <p className="text-xs font-medium text-muted-foreground/60 uppercase tracking-wider mb-3">
                快速进入
              </p>
              <div className="grid grid-cols-2 gap-2.5">
                {/* Today's Daily Report */}
                <button
                  type="button"
                  onClick={onEnterDailyReport}
                  className="group text-left p-4 rounded-xl border border-border/40 bg-card/30 hover:bg-card/70 hover:border-amber-500/30 hover:shadow-lg hover:shadow-amber-500/[0.04] transition-all duration-200 cursor-pointer"
                >
                  <div className="w-8 h-8 rounded-lg bg-amber-500/[0.08] border border-amber-500/10 flex items-center justify-center mb-3 text-amber-600 dark:text-amber-400/80 group-hover:bg-amber-500/15 group-hover:border-amber-500/20 transition-colors">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="w-5 h-5">
                      <path d="M4 22h14a2 2 0 0 0 2-2V7.5L14.5 2H6a2 2 0 0 0-2 2v4" />
                      <path d="M14 2v6h6" />
                      <path d="M2 13h10M2 17h6M2 9h4" />
                    </svg>
                  </div>
                  <p className="text-sm font-medium text-foreground group-hover:text-amber-600 dark:group-hover:text-amber-400 transition-colors">
                    今日日报
                  </p>
                  <p className="text-xs text-muted-foreground/50 mt-1">
                    {todayLabel()} · 市场综述
                  </p>
                </button>

                {/* Macro Overview */}
                <button
                  type="button"
                  onClick={onEnterMacro}
                  className="group text-left p-4 rounded-xl border border-border/40 bg-card/30 hover:bg-card/70 hover:border-violet-500/30 hover:shadow-lg hover:shadow-violet-500/[0.04] transition-all duration-200 cursor-pointer"
                >
                  <div className="w-8 h-8 rounded-lg bg-violet-500/[0.08] border border-violet-500/10 flex items-center justify-center mb-3 text-violet-600 dark:text-violet-400/80 group-hover:bg-violet-500/15 group-hover:border-violet-500/20 transition-colors">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="w-5 h-5">
                      <circle cx="12" cy="12" r="10" />
                      <path d="M2 12h20M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
                    </svg>
                  </div>
                  <p className="text-sm font-medium text-foreground group-hover:text-violet-600 dark:group-hover:text-violet-400 transition-colors">
                    宏观快览
                  </p>
                  <p className="text-xs text-muted-foreground/50 mt-1">
                    流动性 · 风险信号
                  </p>
                </button>
              </div>
            </div>

            {/* ── Divider: quick entry → screener ── */}
            <div className="flex items-center gap-3 my-6">
              <div className="flex-1 h-px bg-border/30" />
              <span className="text-xs text-muted-foreground/40 tracking-widest">或者选股</span>
              <div className="flex-1 h-px bg-border/30" />
            </div>

            {/* Strategy cards - 2x2 grid, rotating pool */}
            <div className="animate-fade-in-up delay-200">
              <div className="flex items-center justify-between mb-3">
                <p className="text-xs font-medium text-muted-foreground/60 uppercase tracking-wider">
                  热门策略
                </p>
                <button
                  type="button"
                  onClick={rotateStrategies}
                  aria-label="换一批策略"
                  className="p-1 rounded-md text-muted-foreground/30 hover:text-primary hover:bg-primary/5 transition-colors cursor-pointer"
                >
                  <svg aria-hidden="true" className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8" />
                    <path d="M21 3v5h-5" />
                    <path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16" />
                    <path d="M3 21v-5h5" />
                  </svg>
                </button>
              </div>
              <div className={`grid grid-cols-2 gap-2.5 transition-all duration-300 ease-out ${
                strategyExiting ? 'opacity-0 translate-y-1.5' : 'opacity-100 translate-y-0'
              }`}>
                {strategies.map((preset, idx) => (
                  <button
                    type="button"
                    key={preset.label}
                    onClick={() => onSelect(preset.label)}
                    className="group text-left p-4 rounded-xl border border-border/40 bg-card/30 hover:bg-card/70 hover:border-primary/30 hover:shadow-lg hover:shadow-primary/[0.03] transition-all duration-200 cursor-pointer animate-fade-in-up"
                    style={{ animationDelay: `${idx * 60}ms` }}
                  >
                    <div className="w-8 h-8 rounded-lg bg-primary/[0.08] border border-primary/10 flex items-center justify-center mb-3 text-primary group-hover:bg-primary/15 group-hover:border-primary/20 transition-colors">
                      {preset.icon}
                    </div>
                    <p className="text-sm font-medium text-foreground group-hover:text-primary transition-colors">
                      {preset.label}
                    </p>
                    <p className="text-xs text-muted-foreground/50 mt-1">
                      {preset.desc}
                    </p>
                  </button>
                ))}
              </div>
            </div>

            {/* Theme chips - rotating pool */}
            <div className="mt-6 animate-fade-in-up delay-300">
              <div className="flex items-center justify-between mb-3">
                <p className="text-xs font-medium text-muted-foreground/60 uppercase tracking-wider">
                  试试这些
                </p>
                <button
                  type="button"
                  onClick={rotateThemes}
                  aria-label="换一批主题"
                  className="p-1 rounded-md text-muted-foreground/30 hover:text-primary hover:bg-primary/5 transition-colors cursor-pointer"
                >
                  <svg aria-hidden="true" className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8" />
                    <path d="M21 3v5h-5" />
                    <path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16" />
                    <path d="M3 21v-5h5" />
                  </svg>
                </button>
              </div>
              <div className={`flex flex-wrap gap-2 transition-all duration-300 ease-out ${
                themeExiting ? 'opacity-0 translate-y-1.5' : 'opacity-100 translate-y-0'
              }`}>
                {themes.map((theme, idx) => (
                  <button
                    type="button"
                    key={theme}
                    onClick={() => onSelect(theme)}
                    className="px-3.5 py-1.5 rounded-full text-xs border border-border/40 bg-card/20 text-muted-foreground hover:border-primary/30 hover:text-primary hover:bg-primary/5 active:scale-95 transition-all duration-200 cursor-pointer animate-fade-in-up"
                    style={{ animationDelay: `${idx * 40}ms` }}
                  >
                    {theme}
                  </button>
                ))}
              </div>
            </div>

            {/* Divider */}
            <div className="w-full h-px bg-border/30 my-6" />

            {/* Input */}
            <div className="welcome-input animate-fade-in-up delay-500">
              <p className="text-xs text-muted-foreground/50 mb-2">
                或者，用你自己的话描述
              </p>
              <ChatInput
                onSubmit={onSelect}
                placeholder="聊聊日报、宏观，或描述你的选股想法..."
                autoFocus={false}
              />
            </div>

            {/* Mobile recent conversations */}
            {!conversationsLoading && conversations.length > 0 && (
              <div className="lg:hidden mt-8 animate-fade-in-up delay-500">
                <p className="text-xs font-medium text-muted-foreground/60 uppercase tracking-wider mb-3">
                  继续之前的对话
                </p>
                <div className="space-y-1 max-h-48 overflow-y-auto overflow-x-hidden conversation-scroll">
                  {conversations.map((conv) => (
                    <div
                      key={conv.id}
                      className="group flex items-center justify-between px-3 py-2.5 rounded-lg hover:bg-card/80 border border-transparent hover:border-border/40 transition-all duration-200"
                    >
                      <button
                        type="button"
                        className="flex items-center gap-2.5 flex-1 min-w-0 text-left"
                        onClick={() => onLoadConversation?.(conv.id)}
                      >
                        <svg aria-hidden="true" className="w-3.5 h-3.5 shrink-0 text-muted-foreground/40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                        </svg>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm text-foreground truncate">
                            {conv.title || '未命名对话'}
                          </p>
                          <p className="text-xs text-muted-foreground/50 mt-0.5">
                            {formatRelativeTime(conv.updated_at)} · {conv.message_count} 条消息
                          </p>
                        </div>
                      </button>
                      <button
                        type="button"
                        onClick={() => onDeleteConversation?.(conv.id)}
                        aria-label={`删除对话：${conv.title || '未命名对话'}`}
                        className="opacity-0 group-hover:opacity-100 focus:opacity-100 ml-2 p-1 text-muted-foreground/40 hover:text-red-500 focus:text-red-500 transition-all duration-150 rounded"
                      >
                        <svg aria-hidden="true" className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <path d="M18 6L6 18M6 6l12 12" />
                        </svg>
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

        </div>
      </div>
    </div>
  );
}
