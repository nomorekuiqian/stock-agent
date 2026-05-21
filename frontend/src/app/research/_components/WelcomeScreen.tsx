'use client';

import { useState } from 'react';
import ChatInput from './ChatInput';
import PersonaSelector, { type AgentKind } from './PersonaSelector';

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
// Capability cards
// 上排：主动用工具（选股 / 个股 / 宏观）
// 下排：被动看内容（日报 / 早报 / 专属日报）
// ---------------------------------------------------------------------------

interface CapabilityCard {
  number: string;
  title: string;
  description: string;
  example: string;
}

const CAPABILITIES: CapabilityCard[] = [
  {
    number: '01',
    title: '一句话选股',
    description: '大白话从 5000 只里筛到几只',
    example: 'PE 小于 20、有分红',
  },
  {
    number: '02',
    title: '个股研究台',
    description: '基本面、技术面、新闻、同行对标',
    example: '深入分析 NVDA',
  },
  {
    number: '03',
    title: '宏观仪表盘',
    description: '流动性、经济、通胀、情绪 四维信号灯',
    example: '现在宏观环境怎么样',
  },
  {
    number: '04',
    title: '市场日报',
    description: '复盘昨日市场发生了什么',
    example: '解读今天的市场日报',
  },
  {
    number: '05',
    title: '盘前早报',
    description: '今天开盘前要看什么',
    example: '今早盘前要点',
  },
  {
    number: '06',
    title: '专属日报',
    description: '基于你的持仓自动生成',
    example: '我持仓今天怎么样',
  },
];

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

interface QuotaInfo {
  allowed: boolean;
  used: number;
  limit: number;
  remaining: number;
  unlimited: boolean;
}

interface WelcomeScreenProps {
  onSelect: (value: string) => void;
  universeSize?: number;
  userName?: string | null;
  quota?: QuotaInfo | null;
  /** When set, renders the persona selector inside the composer. */
  personaSelectorEnabled?: boolean;
  agentKind?: AgentKind;
  personaUsername?: string | null;
  onPersonaChange?: (next: { agentKind: AgentKind; personaUsername: string | null }) => void;
}

export default function WelcomeScreen({
  onSelect,
  universeSize,
  userName,
  quota,
  personaSelectorEnabled = false,
  agentKind = 'research',
  personaUsername = null,
  onPersonaChange,
}: WelcomeScreenProps) {
  const [greeting] = useState(
    () => GREETINGS[Math.floor(Math.random() * GREETINGS.length)],
  );

  return (
    <div className="h-full flex flex-col">
      <div className="flex-1 overflow-y-auto">
        <div className="mx-auto flex w-full max-w-4xl flex-col px-4 sm:px-6 py-8 sm:py-12">

          {/* -- Logo + Greeting -- */}
          <div className="mb-10 sm:mb-14 animate-fade-in-up">
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
            <h1 className="font-editorial text-2xl sm:text-4xl md:text-5xl leading-[1.15] text-foreground tracking-tight mb-3">
              {greeting.main}
            </h1>
            <p className="text-sm text-muted-foreground">
              {greeting.sub}
              {universeSize ? ` · ${universeSize.toLocaleString()} 只美股实时数据` : ''}
            </p>
          </div>

          {/* -- Capability grid: 1 col mobile, 2 cols tablet, 3 cols desktop -- */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {CAPABILITIES.map((cap, i) => (
              <button
                key={cap.number}
                type="button"
                onClick={() => onSelect(cap.example)}
                className="
                  group relative flex flex-col text-left
                  p-5 rounded-xl
                  border border-border/50
                  hover:border-primary/40 hover:bg-primary/[0.02]
                  focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/30
                  transition-colors duration-200
                  animate-fade-in-up cursor-pointer
                "
                style={{ animationDelay: `${i * 60}ms` }}
              >
                {/* Editorial number marker — magazine ToC vibe */}
                <div className="font-editorial italic text-xs text-muted-foreground/50 tracking-[0.15em] mb-2.5">
                  {cap.number}
                </div>

                {/* Title — editorial display */}
                <h3 className="font-editorial text-lg leading-tight text-foreground mb-1.5">
                  {cap.title}
                </h3>

                {/* Description — single line, muted */}
                <p className="text-xs text-muted-foreground leading-relaxed mb-4">
                  {cap.description}
                </p>

                {/* Example — pinned to bottom, divided by hairline; reads as a pull quote */}
                <div className="
                  mt-auto pt-3
                  border-t border-border/40 group-hover:border-primary/20
                  flex items-center gap-2
                  transition-colors
                ">
                  <span className="text-sm text-foreground/70 group-hover:text-primary transition-colors flex-1 truncate">
                    {cap.example}
                  </span>
                  <svg
                    className="w-3.5 h-3.5 text-muted-foreground/50 group-hover:text-primary group-hover:translate-x-0.5 transition-all shrink-0"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M5 12h14M13 5l7 7-7 7" />
                  </svg>
                </div>
              </button>
            ))}
          </div>

        </div>
      </div>

      {/* -- Composer -- */}
      <div className="shrink-0 mx-auto w-full max-w-4xl px-4 sm:px-6 pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-3 sm:pt-4">
        <ChatInput
          onSubmit={onSelect}
          placeholder={
            agentKind === 'kol_research'
              ? `按 @${personaUsername || 'qinbafrank'} 方法论提问...`
              : '随便问点什么...'
          }
          autoFocus={false}
          quota={quota}
          leftSlot={
            personaSelectorEnabled && onPersonaChange ? (
              <PersonaSelector
                agentKind={agentKind}
                personaUsername={personaUsername}
                onChange={onPersonaChange}
                // No unsaved chat at welcome screen, skip confirm dialog.
                requireConfirmBeforeSwitch={false}
                // Composer sits at the bottom of the viewport — expand upward.
                placement="top"
              />
            ) : null
          }
        />
      </div>
    </div>
  );
}
