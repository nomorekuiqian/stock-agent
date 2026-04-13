'use client';

import { useState, useMemo } from 'react';
import ChatInput from './ChatInput';

// ---------------------------------------------------------------------------
// Greeting rotation
// ---------------------------------------------------------------------------

const GREETINGS = [
  { main: '今天市场有什么动静？', sub: '让 AI 帮你快速了解' },
  { main: '你关注的股票还好吗？', sub: '查行情、看分析、找机会' },
  { main: '不确定该买什么？', sub: '让 AI 帮你筛选和分析' },
  { main: '想知道大盘在发生什么？', sub: '宏观、情绪、流动性，一问就懂' },
  { main: '错过了什么重要消息？', sub: '日报、早报、周报，随时追' },
];

// ---------------------------------------------------------------------------
// Two-level cards
// ---------------------------------------------------------------------------

interface Intent {
  id: string;
  label: string;
  hint: string;
  queries: { text: string; tag?: string }[];
}

const INTENT_STYLE: Record<string, { icon: string; dot: string; bg: string; hoverBg: string; border: string }> = {
  catchup: {
    icon: 'text-amber-400',
    dot: 'bg-amber-400',
    bg: 'bg-amber-500/[0.04]',
    hoverBg: 'hover:bg-amber-500/[0.08]',
    border: 'border-amber-500/10 hover:border-amber-500/25',
  },
  stock: {
    icon: 'text-blue-400',
    dot: 'bg-blue-400',
    bg: 'bg-blue-500/[0.04]',
    hoverBg: 'hover:bg-blue-500/[0.08]',
    border: 'border-blue-500/10 hover:border-blue-500/25',
  },
  find: {
    icon: 'text-primary',
    dot: 'bg-primary',
    bg: 'bg-primary/[0.04]',
    hoverBg: 'hover:bg-primary/[0.08]',
    border: 'border-primary/10 hover:border-primary/25',
  },
  macro: {
    icon: 'text-violet-400',
    dot: 'bg-violet-400',
    bg: 'bg-violet-500/[0.04]',
    hoverBg: 'hover:bg-violet-500/[0.08]',
    border: 'border-violet-500/10 hover:border-violet-500/25',
  },
};

const INTENTS: Intent[] = [
  {
    id: 'catchup',
    label: '今天发生了什么',
    hint: '日报 / 早报 / 持仓',
    queries: [
      { text: '帮我解读今天的市场日报', tag: '日报' },
      { text: '今天早报说了什么？', tag: '早报' },
      { text: '我的持仓今天表现如何？', tag: '持仓' },
      { text: '今天大盘整体怎么样？', tag: '行情' },
      { text: '这周宏观总结是什么？', tag: '周报' },
    ],
  },
  {
    id: 'stock',
    label: '帮我看一只股票',
    hint: '分析 / 对比 / 估值',
    queries: [
      { text: 'NVDA 现在值得买吗？', tag: '综合分析' },
      { text: 'AAPL 跟 MSFT 比怎么样？', tag: '同行对比' },
      { text: 'META 现在估值贵不贵？', tag: '历史估值' },
      { text: 'TSLA 最新财报关键数字', tag: '基本面' },
      { text: 'AMZN 技术面现在什么信号？', tag: '技术分析' },
      { text: '英伟达这家公司是做什么的？', tag: '公司概况' },
    ],
  },
  {
    id: 'find',
    label: '帮我找好股票',
    hint: '筛选 / 策略 / 推荐',
    queries: [
      { text: '帮我找 AI 相关的好标的', tag: '主题选股' },
      { text: '最近被错杀的好公司有哪些？', tag: '超跌反弹' },
      { text: '被低估的白马股有哪些？', tag: '价值发现' },
      { text: '成长最快的中小盘股', tag: '高成长' },
      { text: '适合长期拿着的分红股', tag: '股息策略' },
      { text: '上季度财报超预期的公司', tag: '业绩驱动' },
    ],
  },
  {
    id: 'macro',
    label: '现在适合买吗',
    hint: '宏观 / 情绪 / 风险',
    queries: [
      { text: '现在宏观风险怎么样？', tag: '风险仪表盘' },
      { text: '当前流动性对美股意味着什么？', tag: '流动性' },
      { text: '市场情绪现在是恐惧还是贪婪？', tag: '市场情绪' },
      { text: '美联储政策对成长股的影响？', tag: '通胀利率' },
      { text: '下周有什么重要经济事件？', tag: '经济日历' },
      { text: '当前经济基本面怎么样？', tag: '经济基本面' },
    ],
  },
];

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

interface WelcomeScreenProps {
  onSelect: (value: string) => void;
  universeSize?: number;
  userName?: string | null;
}

export default function WelcomeScreen({
  onSelect,
  universeSize,
  userName,
}: WelcomeScreenProps) {
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const expandedIntent = INTENTS.find((i) => i.id === expandedId);
  const expandedStyle = expandedId ? INTENT_STYLE[expandedId] : null;

  const greeting = useMemo(
    () => GREETINGS[Math.floor(Math.random() * GREETINGS.length)],
    [],
  );

  return (
    <div className="h-full flex flex-col">
      <div className="flex-1 overflow-y-auto">
        <div className="mx-auto flex w-full max-w-2xl flex-col justify-center px-4 sm:px-5 py-8 sm:py-12 min-h-full">

          {/* ── Logo + Greeting ── */}
          <div className="mb-8 sm:mb-12 animate-fade-in-up">
            <div className="flex items-center gap-3 mb-5">
              <div className="w-10 h-10 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center shrink-0">
                <svg className="w-5 h-5" viewBox="0 0 32 32" fill="none">
                  <path
                    d="M4 24V12L10 6V24M10 6L16 14L22 6M22 6V24M28 24V12L22 6"
                    stroke="url(#welcome-brand)"
                    strokeWidth="2.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                  <defs>
                    <linearGradient id="welcome-brand" x1="0%" y1="0%" x2="100%" y2="100%">
                      <stop offset="0%" stopColor="#10B981" />
                      <stop offset="100%" stopColor="#6EE7B7" />
                    </linearGradient>
                  </defs>
                </svg>
              </div>
              <p className="text-lg font-editorial text-foreground">
                Hi{userName ? `，${userName}` : ''}
              </p>
            </div>
            <h1 className="font-editorial text-2xl sm:text-4xl md:text-5xl leading-[1.2] text-foreground tracking-tight mb-3">
              {greeting.main}
            </h1>
            <p className="text-sm text-muted-foreground tracking-wide">
              {greeting.sub}
              {universeSize ? ` · ${universeSize.toLocaleString()} 只美股实时数据` : ''}
            </p>
          </div>

          {/* ── Intent cards (level 1) ── */}
          {!expandedIntent && (
            <div className="grid grid-cols-2 gap-2.5 sm:gap-3 animate-fade-in-up delay-100">
              {INTENTS.map((intent) => {
                const s = INTENT_STYLE[intent.id];
                return (
                  <button
                    key={intent.id}
                    type="button"
                    onClick={() => setExpandedId(intent.id)}
                    aria-label={`${intent.label} - ${intent.hint}`}
                    className={`group text-left px-4 py-4 sm:px-5 sm:py-5 rounded-2xl border ${s?.border || 'border-border/50'} ${s?.bg || ''} ${s?.hoverBg || 'hover:bg-card/60'} hover:-translate-y-0.5 transition-all duration-200 cursor-pointer`}
                  >
                    <div className={`mb-3 ${s?.icon || 'text-muted-foreground'}`}>
                      {intent.id === 'catchup' && (
                        <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                          <path d="M4 22h14a2 2 0 0 0 2-2V7.5L14.5 2H6a2 2 0 0 0-2 2v4" />
                          <path d="M14 2v6h6" /><path d="M2 13h10M2 17h6M2 9h4" />
                        </svg>
                      )}
                      {intent.id === 'stock' && (
                        <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                          <path d="M3 3v18h18" /><path d="M7 16l4-8 4 4 4-6" />
                        </svg>
                      )}
                      {intent.id === 'find' && (
                        <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                          <circle cx="11" cy="11" r="8" /><path d="M21 21l-4.35-4.35" />
                        </svg>
                      )}
                      {intent.id === 'macro' && (
                        <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                          <circle cx="12" cy="12" r="10" />
                          <path d="M2 12h20M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
                        </svg>
                      )}
                    </div>
                    <p className="text-sm sm:text-base font-medium text-foreground mb-1">{intent.label}</p>
                    <p className="text-xs text-muted-foreground/50 group-hover:text-muted-foreground/70 transition-colors">
                      {intent.hint}
                    </p>
                  </button>
                );
              })}
            </div>
          )}

          {/* ── Expanded queries (level 2) ── */}
          {expandedIntent && (
            <div className="animate-fade-in-up">
              {/* Back button with color dot for continuity */}
              <button
                type="button"
                onClick={() => setExpandedId(null)}
                className="flex items-center gap-2.5 text-sm text-muted-foreground hover:text-foreground mb-6 transition-colors cursor-pointer"
              >
                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M19 12H5M12 19l-7-7 7-7" />
                </svg>
                <span className={`w-2 h-2 rounded-full ${expandedStyle?.dot || 'bg-muted-foreground/30'}`} />
                {expandedIntent.label}
              </button>

              <div className="space-y-2">
                {expandedIntent.queries.map((q, i) => (
                  <button
                    key={q.text}
                    type="button"
                    onClick={() => onSelect(q.text)}
                    className="w-full text-left px-4 py-3 sm:px-5 sm:py-3.5 rounded-xl border border-border/50 hover:border-primary/30 hover:bg-primary/[0.03] transition-all duration-150 cursor-pointer group flex items-center justify-between animate-fade-in-up"
                    style={{ animationDelay: `${i * 50}ms` }}
                  >
                    <p className="text-sm text-foreground">{q.text}</p>
                    <span className="flex items-center gap-2 shrink-0 ml-4">
                      {q.tag && (
                        <span className="text-[11px] text-muted-foreground/50 group-hover:text-primary/60 transition-colors">
                          {q.tag}
                        </span>
                      )}
                      <svg className="w-3.5 h-3.5 text-muted-foreground/0 group-hover:text-primary/40 translate-x-0 group-hover:translate-x-0.5 transition-all duration-200" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M5 12h14M12 5l7 7-7 7" />
                      </svg>
                    </span>
                  </button>
                ))}
              </div>
            </div>
          )}

        </div>
      </div>

      {/* ── Composer ── */}
      <div className="shrink-0 mx-auto w-full max-w-2xl px-4 sm:px-5 pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-3 sm:pt-4">
        <ChatInput
          onSubmit={onSelect}
          placeholder="随便问点什么..."
          autoFocus={false}
        />
      </div>
    </div>
  );
}
