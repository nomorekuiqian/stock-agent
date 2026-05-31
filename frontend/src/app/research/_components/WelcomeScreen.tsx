'use client';

import { useEffect, useState } from 'react';
import { ArrowUpRight } from 'lucide-react';
import ChatInput from './ChatInput';
import PersonaSelector, { type AgentKind } from './PersonaSelector';

// ---------------------------------------------------------------------------
// Greeting rotation (default mode)
// ---------------------------------------------------------------------------

const GREETINGS = [
  { main: '今天市场有什么动静？', sub: '让 AI 帮你快速了解' },
  { main: '你关注的股票还好吗？', sub: '查行情、看分析、找机会' },
  { main: '不确定该买什么？', sub: '让 AI 帮你筛选和分析' },
  { main: '想知道大盘在发生什么？', sub: '宏观、情绪、流动性，一问就懂' },
  { main: '错过了什么重要消息？', sub: '日报、早报、周报，随时追' },
];

// ---------------------------------------------------------------------------
// Default capability cards
// ---------------------------------------------------------------------------

interface CapabilityCard {
  title: string;
  description: string;
  example: string;
}

const CAPABILITIES: CapabilityCard[] = [
  { title: '一句话选股', description: '大白话从 5000 只里筛到几只', example: 'PE 小于 20、有分红' },
  { title: '个股研究台', description: '基本面、技术面、新闻、同行对标', example: '深入分析 NVDA' },
  { title: '宏观仪表盘', description: '流动性、经济、通胀、情绪 四维信号灯', example: '现在宏观环境怎么样' },
  { title: '市场日报', description: '复盘昨日市场发生了什么', example: '解读今天的市场日报' },
  { title: '盘前早报', description: '今天开盘前要看什么', example: '今早盘前要点' },
  { title: '专属日报', description: '基于你的持仓自动生成', example: '我持仓今天怎么样' },
];

// ---------------------------------------------------------------------------
// Persona descriptors. Lookup by username; falls back to qinbafrank-style copy.
// Starters are written in the blogger's voice — not generic capability prompts.
// ---------------------------------------------------------------------------

interface PersonaDescriptor {
  displayName: string;
  tagline: string[];
  quotes: PersonaQuote[];
  starters: PersonaStarter[];
}

interface PersonaQuote {
  label: string;
  text: string;
}

interface PersonaStarter {
  title: string;
  displayPrompt: string;
  prompt: string;
}

const PERSONAS: Record<string, PersonaDescriptor> = {
  qinbafrank: {
    displayName: 'qinbafrank',
    tagline: ['MACRO', 'AI 算力', '加密金融'],
    quotes: [
      {
        label: '定价观',
        text: '投资的关键不是预测财报，而是预判市场未来如何重新理解一个资产。',
      },
      {
        label: '产业观',
        text: 'AI 不是单一模型突破，也不是“会聊天”的玩具，而是像电力一样的核心基础设施。',
      },
      {
        label: '宏观观',
        text: '一个阶段内把影响市场的因素做权重排序，重点关注权重最高的那个驱动因素。',
      },
      {
        label: '风控观',
        text: '没有研究支撑的信仰，只有 FOMO 的心和 all in 的账户。',
      },
    ],
    starters: [
      {
        title: '个股诊断',
        displayPrompt: 'NVDA 还能买吗？',
        prompt: 'NVDA 还能买吗？',
      },
      {
        title: 'AI 算力链',
        displayPrompt: 'AI 现在看什么？',
        prompt: 'AI 现在看什么？',
      },
      {
        title: '宏观流动性',
        displayPrompt: '大盘现在危险吗？',
        prompt: '大盘现在危险吗？',
      },
      {
        title: '财报验证',
        displayPrompt: '财报算利好吗？',
        prompt: '财报算利好吗？',
      },
      {
        title: '加密金融',
        displayPrompt: '加密股还能追吗？',
        prompt: '加密股还能追吗？',
      },
      {
        title: '持仓证伪',
        displayPrompt: '我该继续拿吗？',
        prompt: '我拿着 NVDA，该继续拿吗？',
      },
    ],
  },
};

function getPersonaDescriptor(username: string | null): PersonaDescriptor {
  if (username && PERSONAS[username]) return PERSONAS[username];
  return {
    ...PERSONAS.qinbafrank,
    displayName: username || 'qinbafrank',
  };
}

// ---------------------------------------------------------------------------
// Props
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
  personaSelectorEnabled?: boolean;
  agentKind?: AgentKind;
  personaUsername?: string | null;
  onPersonaChange?: (next: { agentKind: AgentKind; personaUsername: string | null }) => void;
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

const TRANSITION_MS = 260;

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

  // Target mode = current prop-derived mode.
  // renderMode = which layer is currently *mounted*. During a swap we keep the
  // old mode mounted for TRANSITION_MS so it can fade out before being replaced.
  const targetMode: 'default' | 'persona' =
    agentKind === 'kol_research' && personaUsername ? 'persona' : 'default';
  const [renderMode, setRenderMode] = useState<'default' | 'persona'>(targetMode);
  const isLeaving = renderMode !== targetMode;

  useEffect(() => {
    if (!isLeaving) return;
    const t = setTimeout(() => setRenderMode(targetMode), TRANSITION_MS);
    return () => clearTimeout(t);
  }, [isLeaving, targetMode]);

  // Persona descriptor for the persona layer (memoized lookup; cheap).
  const persona = getPersonaDescriptor(personaUsername);

  return (
    <div className="h-full flex flex-col relative">
      {/* Ambient background wash — fades in/out smoothly with persona mode.
          Sits below content; doesn't catch clicks. */}
      <div
        aria-hidden
        className={`absolute inset-0 pointer-events-none transition-opacity duration-700 ease-out ${
          renderMode === 'persona' && !isLeaving ? 'opacity-100' : 'opacity-0'
        }`}
      >
        <div className="absolute inset-x-0 top-0 h-72 bg-[radial-gradient(ellipse_60%_70%_at_50%_0%,rgba(16,185,129,0.10),transparent_70%)]" />
      </div>

      {/* Mode-switching upper region. */}
      <div className="flex-1 overflow-y-auto relative">
        <div
          className={`transition-[opacity,transform,filter] ease-[cubic-bezier(0.22,1,0.36,1)] ${
            isLeaving
              ? 'opacity-0 -translate-y-1.5 blur-[2px] duration-200'
              : 'opacity-100 translate-y-0 blur-0 duration-300'
          }`}
          // Force animation replay on every persona toggle by keying on
          // the resolved render-mode. CSS staggered fade-ins on children
          // re-run as React unmounts/remounts the subtree.
          key={renderMode}
        >
          {renderMode === 'persona' ? (
            <PersonaIntro persona={persona} onSelect={onSelect} />
          ) : (
            <DefaultIntro
              greeting={greeting}
              userName={userName}
              universeSize={universeSize}
              onSelect={onSelect}
            />
          )}
        </div>
      </div>

      {/* Composer — shared. Placeholder and leftSlot subtly adapt to mode. */}
      <div className="shrink-0 mx-auto w-full max-w-4xl px-4 sm:px-6 pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-3 sm:pt-4 relative">
        <ChatInput
          onSubmit={onSelect}
          placeholder={
            targetMode === 'persona'
              ? `想问 @${persona.displayName} 什么？`
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
                requireConfirmBeforeSwitch={false}
                placement="top"
              />
            ) : null
          }
        />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Default intro (original layout — capability grid + editorial greeting)
// ---------------------------------------------------------------------------

interface DefaultIntroProps {
  greeting: { main: string; sub: string };
  userName?: string | null;
  universeSize?: number;
  onSelect: (value: string) => void;
}

function DefaultIntro({ greeting, userName, universeSize, onSelect }: DefaultIntroProps) {
  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col px-4 sm:px-6 py-8 sm:py-12">
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

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {CAPABILITIES.map((cap, i) => (
          <button
            key={cap.title}
            type="button"
            onClick={() => onSelect(cap.example)}
            className="group relative flex flex-col text-left p-5 rounded-xl border border-border/50 hover:border-primary/40 hover:bg-primary/[0.02] focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/30 transition-colors duration-200 animate-fade-in-up cursor-pointer"
            style={{ animationDelay: `${i * 60}ms` }}
          >
            <h3 className="font-editorial text-lg leading-tight text-foreground mb-1.5">
              {cap.title}
            </h3>
            <p className="text-sm text-muted-foreground leading-relaxed mb-4">
              {cap.description}
            </p>
            <div className="mt-auto pt-3 border-t border-border/40 group-hover:border-primary/20 flex items-center gap-2 transition-colors">
              <span className="text-sm text-foreground/70 group-hover:text-primary transition-colors flex-1 truncate">
                {cap.example}
              </span>
              <svg
                className="w-3.5 h-3.5 text-muted-foreground/70 group-hover:text-primary group-hover:translate-x-0.5 transition-all shrink-0"
                viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
              >
                <path d="M5 12h14M13 5l7 7-7 7" />
              </svg>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Persona intro landing
// ---------------------------------------------------------------------------

interface PersonaIntroProps {
  persona: PersonaDescriptor;
  onSelect: (value: string) => void;
}

function PersonaIntro({ persona, onSelect }: PersonaIntroProps) {
  const avatarSrc = `/kol-avatars/${persona.displayName.toLowerCase()}.png`;

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col items-center px-4 py-5 text-center sm:px-6 sm:py-10">
      <div className="relative mb-5 animate-scale-in sm:mb-6" style={{ animationDelay: '60ms' }}>
        <div
          aria-hidden
          className="absolute inset-0 -m-6 rounded-full bg-primary/15 blur-2xl animate-pulse-glow"
        />
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={avatarSrc}
          alt={persona.displayName}
          className="relative h-16 w-16 rounded-full object-cover ring-2 ring-primary/40 ring-offset-4 ring-offset-background sm:h-24 sm:w-24"
          onError={(e) => {
            (e.currentTarget as HTMLImageElement).style.display = 'none';
            const sib = (e.currentTarget as HTMLImageElement).nextElementSibling as HTMLElement | null;
            if (sib) {
              sib.classList.remove('hidden');
              sib.classList.add('flex');
            }
          }}
        />
        <div className="relative hidden h-16 w-16 items-center justify-center rounded-full border border-primary/30 bg-primary/[0.08] font-editorial text-2xl text-primary sm:h-24 sm:w-24 sm:text-3xl">
          {persona.displayName.slice(0, 2).toUpperCase()}
        </div>
      </div>

      <h1
        className="font-editorial italic text-3xl tracking-tight text-foreground sm:text-5xl animate-fade-in-up"
        style={{ animationDelay: '140ms' }}
      >
        @{persona.displayName}
      </h1>

      <div
        className="mt-3 flex flex-wrap items-center justify-center gap-2 animate-fade-in-up"
        style={{ animationDelay: '220ms' }}
      >
        {persona.tagline.map((tag) => (
          <span
            key={tag}
            className="rounded-full border border-border/60 bg-card/70 px-3 py-1 text-sm font-medium text-muted-foreground"
          >
            {tag}
          </span>
        ))}
      </div>

      {persona.quotes.length > 0 && (
        <div className="mt-5 w-full max-w-3xl space-y-2.5 text-left sm:mt-7 sm:space-y-3">
          {persona.quotes.map((quote, i) => (
            <blockquote
              key={quote.label}
              className={`border-l border-primary/35 pl-4 italic leading-relaxed animate-fade-in-up ${
                i === 0
                  ? 'font-editorial text-lg text-foreground sm:text-xl'
                  : 'text-sm text-foreground/85 sm:text-base'
              }`}
              style={{ animationDelay: `${300 + i * 55}ms` }}
            >
              <span aria-hidden className="text-primary/80">“</span>
              {quote.text}
              <span aria-hidden className="text-primary/80">”</span>
            </blockquote>
          ))}
        </div>
      )}

      <div className="mt-6 grid w-full max-w-4xl grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
        {persona.starters.map((starter, i) => (
          <button
            key={starter.title}
            type="button"
            onClick={() => onSelect(starter.prompt)}
            className="group rounded-lg border border-border/50 bg-card/70 px-3.5 py-2.5 text-left transition-colors duration-200 hover:border-primary/40 hover:bg-primary/[0.04] active:scale-[0.99] focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/30 animate-fade-in-up cursor-pointer"
            style={{ animationDelay: `${540 + i * 60}ms` }}
          >
            <span className="flex items-center justify-between gap-3 text-sm font-medium text-foreground">
              {starter.title}
              <ArrowUpRight className="h-4 w-4 shrink-0 text-muted-foreground transition-colors group-hover:text-primary" aria-hidden />
            </span>
            <span className="mt-1 block text-sm leading-relaxed text-muted-foreground transition-colors group-hover:text-primary">
              {starter.displayPrompt}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}
