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
    label: 'AI 相关的好标的',
    desc: '半导体、算力、大模型受益股',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="w-4 h-4">
        <rect x="6" y="6" width="12" height="12" rx="1" />
        <path d="M9 1v4M15 1v4M9 19v4M15 19v4M1 9h4M1 15h4M19 9h4M19 15h4" />
      </svg>
    ),
  },
  {
    label: '最近被错杀的好公司',
    desc: '从高位大幅回调，基本面完好',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="w-4 h-4">
        <path d="M22 17l-8.5-8.5-5 5L2 7" />
        <path d="M12 17c0 0 2-4 6-4" />
        <path d="M18 17h4v-4" />
      </svg>
    ),
  },
  {
    label: '适合长期拿着的分红股',
    desc: '股息率高、连续多年派息',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="w-4 h-4">
        <ellipse cx="12" cy="6" rx="8" ry="3" />
        <path d="M4 6v4c0 1.657 3.582 3 8 3s8-1.343 8-3V6" />
        <path d="M4 10v4c0 1.657 3.582 3 8 3s8-1.343 8-3v-4" />
      </svg>
    ),
  },
  {
    label: '成长最快的中小盘',
    desc: '营收高速增长、估值还没跑高',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="w-4 h-4">
        <path d="M7 17L17 7M17 7H7M17 7v10" />
      </svg>
    ),
  },
  {
    label: '上季度财报超预期',
    desc: 'EPS 好于市场预期，业绩加速',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="w-4 h-4">
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
        <path d="M14 2v6h6" />
        <path d="M9 15l2 2 4-4" />
      </svg>
    ),
  },
  {
    label: '被低估的白马股',
    desc: 'ROE 强劲、PE 合理、护城河宽',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="w-4 h-4">
        <path d="M6 3h12l4 6-10 13L2 9z" />
        <path d="M2 9h20" />
        <path d="M10 3l-2 6 4 13 4-13-2-6" />
      </svg>
    ),
  },
  {
    label: '分析师一致推荐的股',
    desc: '机构共识买入，评级近期上调',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="w-4 h-4">
        <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
      </svg>
    ),
  },
  {
    label: '大市值稳健蓝筹',
    desc: '低波动、现金流充沛、抗跌',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="w-4 h-4">
        <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
      </svg>
    ),
  },
];

// ---------------------------------------------------------------------------
// Theme pool (show 6 at a time, rotate on demand)
// ---------------------------------------------------------------------------

type ThemeChip = { label: string; type: 'screen' | 'stock' | 'macro' };

const ALL_THEMES: ThemeChip[] = [
  // 选股型
  { label: '最近被低估的软件股', type: 'screen' },
  { label: '盈利能力最强的云计算公司', type: 'screen' },
  { label: '估值合理但赚钱能力强的公司', type: 'screen' },
  { label: '年年分红超 4% 的稳健大公司', type: 'screen' },
  { label: '利润空间大、竞争对手难追上的公司', type: 'screen' },
  { label: '连续 3 年营收增长超 30%', type: 'screen' },
  { label: '几乎不借钱、财务特别稳健的公司', type: 'screen' },
  { label: '最近从高位回调 20% 的好公司', type: 'screen' },
  { label: '近期突破 52 周新高的强势股', type: 'screen' },
  { label: '最近财报超预期的公司', type: 'screen' },
  { label: '华尔街分析师普遍一致看好的股票', type: 'screen' },
  { label: '近一年涨幅最强的半导体股', type: 'screen' },
  { label: '中小市值、成长飞快的潜力黑马', type: 'screen' },
  { label: '躺着就能赚大钱、现金极其充沛的公司', type: 'screen' },
  { label: '技术面超卖、可能快要反弹的好股', type: 'screen' },
  { label: '赚钱效率极高的科技公司', type: 'screen' },
  // 个股研究型
  { label: 'NVDA 当前技术面信号', type: 'stock' },
  { label: 'AAPL 最新财报关键数字', type: 'stock' },
  { label: 'META 现在估值贵不贵', type: 'stock' },
  { label: 'TSLA 今年的投资逻辑', type: 'stock' },
  { label: 'MSFT AI 布局对估值的影响', type: 'stock' },
  { label: 'AMZN 云业务增速还能维持吗', type: 'stock' },
  { label: 'GOOGL 广告护城河还在吗', type: 'stock' },
  { label: 'BABA 当前性价比如何', type: 'stock' },
  { label: '英伟达和 AMD 哪个更值得持有', type: 'stock' },
  // 市场宏观型
  { label: '科技股这波回调的宏观原因', type: 'macro' },
  { label: '美联储政策对成长股的影响', type: 'macro' },
  { label: '当前流动性对美股意味着什么', type: 'macro' },
  { label: '关税新政对各板块有什么影响', type: 'macro' },
  { label: '今天市场最重要的信号是什么', type: 'macro' },
  { label: '日元走势对美股有什么影响', type: 'macro' },
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

function pickThemesByType(type: ThemeChip['type'], count: number, exclude: string[] = []): ThemeChip[] {
  const pool = ALL_THEMES.filter(t => t.type === type);
  const available = pool.filter(t => !exclude.includes(t.label));
  const source = available.length >= count ? available : pool;
  return [...source].sort(() => Math.random() - 0.5).slice(0, count);
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
  onEnterPersonalReport?: () => void;
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
  onEnterPersonalReport,
  universeSize,
  conversations = [],
  conversationsLoading = false,
  onLoadConversation,
  onDeleteConversation,
}: WelcomeScreenProps) {
  const [strategies, setStrategies] = useState(() => pickStrategies(4));
  const [strategyExiting, setStrategyExiting] = useState(false);
  const [screenChips] = useState(() => pickThemesByType('screen', 6));

  const rotateStrategies = useCallback(() => {
    setStrategyExiting(true);
    setTimeout(() => {
      setStrategies(prev => pickStrategies(4, prev.map(s => s.label)));
      setStrategyExiting(false);
    }, 300);
  }, []);

  return (
    <div className="min-h-[calc(100vh-4rem)] flex items-center justify-center px-4 sm:px-6 lg:px-8 py-8 lg:py-0">
      <div className="w-full max-w-5xl">
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
                  <p className="text-lg font-data font-medium text-primary">{universeSize.toLocaleString()}+</p>
                  <p className="text-xs text-muted-foreground/70">覆盖美股</p>
                </div>
              ) : null}
              <div>
                <div className="flex items-center gap-1.5">
                  <p className="text-lg font-data font-medium text-primary leading-none">实时</p>
                  <span className="relative flex h-2 w-2 mt-0.5 shrink-0">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-75" />
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-primary" />
                  </span>
                </div>
                <p className="text-xs text-muted-foreground/70 mt-1">数据更新</p>
              </div>
            </div>

            {/* Divider - only on desktop */}
            <div className="hidden lg:block w-12 h-px bg-border/60 mt-8 mb-6" />

            {/* Recent conversations - desktop only for left column */}
            {!conversationsLoading && conversations.length > 0 && (
              <div className="hidden lg:block animate-fade-in-up delay-300">
                <p className="text-sm font-semibold text-foreground/75 mb-3">
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
                        <svg aria-hidden="true" className="w-3.5 h-3.5 shrink-0 text-primary/35" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                        </svg>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm text-foreground truncate">
                            {conv.title || '未命名对话'}
                          </p>
                          <p className="text-xs text-muted-foreground/60 mt-0.5">
                            {formatRelativeTime(conv.updated_at)} · {conv.message_count} 条消息
                          </p>
                        </div>
                      </button>
                      <button
                        type="button"
                        onClick={() => onDeleteConversation?.(conv.id)}
                        aria-label={`删除对话：${conv.title || '未命名对话'}`}
                        className="opacity-0 group-hover:opacity-100 focus:opacity-100 [@media(hover:none)]:opacity-40 ml-2 p-1.5 text-muted-foreground/40 hover:text-red-500 focus:text-red-500 transition-all duration-150 rounded"
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
            <div className="w-px h-96 bg-gradient-to-b from-transparent via-primary/[0.18] to-transparent" />
          </div>

          {/* ── Right column: Three sections + Input ── */}
          <div className="flex-1 flex flex-col justify-center mt-10 lg:mt-0 lg:py-12">

            {/* ── Section 1: 聊聊当前行情 ── */}
            <div className="animate-fade-in-up delay-100">
              <p className="text-sm font-semibold text-foreground/75 mb-3">
                跟 AI 聊聊
              </p>
              <div className="grid grid-cols-2 gap-2">
                {/* 今日日报 */}
                <button
                  type="button"
                  onClick={onEnterDailyReport}
                  className="group text-left p-3 rounded-xl border border-border/40 bg-card/30 hover:bg-card/70 hover:border-amber-500/30 hover:shadow-lg hover:shadow-amber-500/[0.04] transition-all duration-200 cursor-pointer flex items-center gap-3"
                >
                  <div className="w-7 h-7 rounded-lg bg-amber-500/[0.08] border border-amber-500/10 flex items-center justify-center shrink-0 text-amber-600 dark:text-amber-400/80 group-hover:bg-amber-500/15 group-hover:border-amber-500/20 transition-colors">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="w-4 h-4">
                      <path d="M4 22h14a2 2 0 0 0 2-2V7.5L14.5 2H6a2 2 0 0 0-2 2v4" />
                      <path d="M14 2v6h6" />
                      <path d="M2 13h10M2 17h6M2 9h4" />
                    </svg>
                  </div>
                  <div>
                    <p className="text-sm font-medium text-foreground group-hover:text-amber-600 dark:group-hover:text-amber-400 transition-colors">今日日报</p>
                    <p className="text-xs text-muted-foreground/60 mt-0.5">{todayLabel()} · 市场综述</p>
                  </div>
                </button>

                {/* 深研个股 */}
                <button
                  type="button"
                  onClick={() => onSelect("帮我深度研究一只个股")}
                  className="group text-left p-3 rounded-xl border border-border/40 bg-card/30 hover:bg-card/70 hover:border-border/60 transition-all duration-200 cursor-pointer flex items-center gap-3"
                >
                  <div className="w-7 h-7 rounded-lg bg-muted/40 border border-border/40 flex items-center justify-center shrink-0 text-muted-foreground/60 group-hover:bg-muted/60 group-hover:text-foreground/70 transition-colors">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="w-4 h-4">
                      <path d="M3 3v18h18" />
                      <path d="M7 16l4-4 4 4 4-4" />
                    </svg>
                  </div>
                  <div>
                    <p className="text-sm font-medium text-foreground group-hover:text-foreground transition-colors">深研个股</p>
                    <p className="text-xs text-muted-foreground/60 mt-0.5">基本面 · 技术面 · 深度分析</p>
                  </div>
                </button>

                {/* 宏观快览 */}
                <button
                  type="button"
                  onClick={onEnterMacro}
                  className="group text-left p-3 rounded-xl border border-border/40 bg-card/30 hover:bg-card/70 hover:border-border/60 transition-all duration-200 cursor-pointer flex items-center gap-3"
                >
                  <div className="w-7 h-7 rounded-lg bg-muted/40 border border-border/40 flex items-center justify-center shrink-0 text-muted-foreground/60 group-hover:bg-muted/60 group-hover:text-foreground/70 transition-colors">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="w-4 h-4">
                      <circle cx="12" cy="12" r="10" />
                      <path d="M2 12h20M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
                    </svg>
                  </div>
                  <div>
                    <p className="text-sm font-medium text-foreground group-hover:text-foreground transition-colors">宏观快览</p>
                    <p className="text-xs text-muted-foreground/60 mt-0.5">流动性 · 风险信号</p>
                  </div>
                </button>

                {/* 专属日报 */}
                <button
                  type="button"
                  onClick={onEnterPersonalReport ?? (() => onSelect("帮我看看我的专属日报"))}
                  className="group text-left p-3 rounded-xl border border-border/40 bg-card/30 hover:bg-card/70 hover:border-border/60 transition-all duration-200 cursor-pointer flex items-center gap-3"
                >
                  <div className="w-7 h-7 rounded-lg bg-muted/40 border border-border/40 flex items-center justify-center shrink-0 text-muted-foreground/60 group-hover:bg-muted/60 group-hover:text-foreground/70 transition-colors">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="w-4 h-4">
                      <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                      <circle cx="12" cy="7" r="4" />
                    </svg>
                  </div>
                  <div>
                    <p className="text-sm font-medium text-foreground group-hover:text-foreground transition-colors">专属日报</p>
                    <p className="text-xs text-muted-foreground/60 mt-0.5">基于你的持仓</p>
                  </div>
                </button>
              </div>

            </div>

            {/* ── Section 2: 选股 ── */}
            <div className="mt-8 animate-fade-in-up delay-200">
              <div className="flex items-center justify-between mb-3">
                <p className="text-sm font-semibold text-foreground/75">AI 智能选股</p>
                <button
                  type="button"
                  onClick={rotateStrategies}
                  aria-label="换一批策略"
                  className="p-2 rounded-md text-muted-foreground/30 hover:text-primary hover:bg-primary/5 transition-colors cursor-pointer"
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
                    className="group text-left p-3 rounded-xl border border-border/40 bg-card/30 hover:bg-card/70 hover:border-primary/30 hover:shadow-lg hover:shadow-primary/[0.03] transition-all duration-200 cursor-pointer flex items-center gap-3 animate-fade-in-up"
                    style={{ animationDelay: `${idx * 60}ms` }}
                  >
                    <div className="w-7 h-7 rounded-lg bg-primary/[0.08] border border-primary/10 flex items-center justify-center shrink-0 text-primary group-hover:bg-primary/15 group-hover:border-primary/20 transition-colors">
                      {preset.icon}
                    </div>
                    <div>
                      <p className="text-sm font-medium text-foreground group-hover:text-primary transition-colors">{preset.label}</p>
                      <p className="text-xs text-muted-foreground/60 mt-0.5">{preset.desc}</p>
                    </div>
                  </button>
                ))}
              </div>

              {/* Small screen chips */}
              <div className="flex flex-wrap gap-2 mt-3">
                {screenChips.map((chip) => (
                  <button
                    type="button"
                    key={chip.label}
                    onClick={() => onSelect(chip.label)}
                    className="px-3.5 py-1.5 rounded-full text-xs border border-border/40 bg-card/20 text-muted-foreground hover:border-primary/30 hover:text-primary hover:bg-primary/5 active:scale-95 transition-all duration-200 cursor-pointer"
                  >
                    {chip.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Divider + Input */}
            <div className="w-full h-px bg-border/30 my-6" />
            <div className="welcome-input animate-fade-in-up delay-500">
              <p className="text-sm font-semibold text-foreground/75 mb-2">或者，用你自己的话描述</p>
              <ChatInput
                onSubmit={onSelect}
                placeholder="聊聊日报、宏观，或描述你的选股想法..."
                autoFocus={false}
              />
            </div>

            {/* Mobile recent conversations */}
            {!conversationsLoading && conversations.length > 0 && (
              <div className="lg:hidden mt-8 animate-fade-in-up delay-500">
                <p className="text-sm font-semibold text-foreground/75 mb-3">
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
                        <svg aria-hidden="true" className="w-3.5 h-3.5 shrink-0 text-primary/35" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                        </svg>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm text-foreground truncate">{conv.title || '未命名对话'}</p>
                          <p className="text-xs text-muted-foreground/60 mt-0.5">
                            {formatRelativeTime(conv.updated_at)} · {conv.message_count} 条消息
                          </p>
                        </div>
                      </button>
                      <button
                        type="button"
                        onClick={() => onDeleteConversation?.(conv.id)}
                        aria-label={`删除对话：${conv.title || '未命名对话'}`}
                        className="opacity-0 group-hover:opacity-100 focus:opacity-100 [@media(hover:none)]:opacity-40 ml-2 p-1.5 text-muted-foreground/40 hover:text-red-500 focus:text-red-500 transition-all duration-150 rounded"
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
