'use client';

import { useEffect, useState } from 'react';
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
  signatureQuote: string;
  quoteAttribution: string;
  starters: string[];
}

const PERSONAS: Record<string, PersonaDescriptor> = {
  qinbafrank: {
    displayName: 'qinbafrank',
    tagline: ['Macro', 'AI 算力', '能力圈'],
    signatureQuote: '拿不住的票不是好票。看不懂的票不要碰。',
    quoteAttribution: '整理自博主公开推文，非博主本人发言',
    starters: [
      '怎么看 NVDA？',
      '怎么看 TSLA？',
      'AI 算力板块还有机会吗？',
      '黄金板块现在怎么看？',
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
// Persona intro — editorial "blogger's desk" landing
// ---------------------------------------------------------------------------

interface PersonaIntroProps {
  persona: PersonaDescriptor;
  onSelect: (value: string) => void;
}

function PersonaIntro({ persona, onSelect }: PersonaIntroProps) {
  const avatarSrc = `/kol-avatars/${persona.displayName.toLowerCase()}.png`;
  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col items-center px-4 sm:px-6 py-10 sm:py-16 text-center">
      {/* Avatar — emerald soft glow */}
      <div className="relative mb-7 animate-scale-in" style={{ animationDelay: '60ms' }}>
        <div
          aria-hidden
          className="absolute inset-0 -m-6 rounded-full bg-emerald-500/20 blur-2xl animate-pulse-glow"
        />
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={avatarSrc}
          alt={persona.displayName}
          className="relative w-24 h-24 sm:w-28 sm:h-28 rounded-full object-cover ring-2 ring-emerald-500/40 ring-offset-4 ring-offset-background"
          onError={(e) => {
            // Hide broken image; the fallback letterbox below takes over.
            (e.currentTarget as HTMLImageElement).style.display = 'none';
            const sib = (e.currentTarget as HTMLImageElement).nextElementSibling as HTMLElement | null;
            if (sib) sib.classList.remove('hidden');
          }}
        />
        <div className="relative hidden w-24 h-24 sm:w-28 sm:h-28 rounded-full items-center justify-center bg-emerald-500/15 ring-2 ring-emerald-500/40 ring-offset-4 ring-offset-background font-editorial italic text-3xl text-emerald-700">
          {persona.displayName.slice(0, 2).toUpperCase()}
        </div>
      </div>

      {/* Display name */}
      <h1
        className="font-editorial italic text-3xl sm:text-5xl tracking-tight text-foreground animate-fade-in-up"
        style={{ animationDelay: '140ms' }}
      >
        @{persona.displayName}
      </h1>

      {/* Framework tagline — monospace, wide-tracking, bullet-separated */}
      <div
        className="mt-3 flex items-center gap-2.5 text-xs font-data tracking-[0.32em] uppercase text-muted-foreground/85 animate-fade-in-up"
        style={{ animationDelay: '220ms' }}
      >
        {persona.tagline.map((t, i) => (
          <span key={t} className="flex items-center gap-2.5">
            {i > 0 && <span aria-hidden className="w-1 h-1 rounded-full bg-emerald-500/60" />}
            {t}
          </span>
        ))}
      </div>

      {/* Signature quote */}
      <blockquote
        className="relative mt-9 max-w-xl font-editorial italic text-lg sm:text-xl leading-relaxed text-foreground/90 animate-fade-in-up"
        style={{ animationDelay: '340ms' }}
      >
        <span aria-hidden className="absolute -left-5 -top-1 text-3xl text-emerald-500/40 font-editorial">“</span>
        {persona.signatureQuote}
        <span aria-hidden className="absolute -right-5 bottom-0 text-3xl text-emerald-500/40 font-editorial">”</span>
      </blockquote>
      <p
        className="mt-3 text-xs text-muted-foreground/70 tracking-wide animate-fade-in-up"
        style={{ animationDelay: '410ms' }}
      >
        — {persona.quoteAttribution}
      </p>

      {/* Hairline divider — neutral, separates quote from starter chips */}
      <div
        className="mt-9 mb-6 w-12 h-px bg-border/40 animate-fade-in"
        style={{ animationDelay: '490ms' }}
      />

      {/* Framework starter chips */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 w-full max-w-2xl">
        {persona.starters.map((q, i) => (
          <button
            key={q}
            type="button"
            onClick={() => onSelect(q)}
            className="group relative text-left px-4 py-3 rounded-lg border border-border/40 bg-background/60 backdrop-blur-[1px] hover:border-emerald-500/40 hover:bg-emerald-50/60 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/30 transition-colors animate-fade-in-up cursor-pointer"
            style={{ animationDelay: `${560 + i * 80}ms` }}
          >
            {/* Tiny leading marker — editorial ornament */}
            <span
              aria-hidden
              className="absolute left-0 top-1/2 -translate-y-1/2 w-[2px] h-5 rounded-r-full bg-emerald-500/40 group-hover:bg-emerald-500/80 transition-colors"
            />
            <span className="ml-1.5 text-sm text-foreground/90 group-hover:text-emerald-800 transition-colors">
              {q}
            </span>
          </button>
        ))}
      </div>

      {/* Curator footer disclaimer */}
      <p
        className="mt-10 max-w-md text-xs text-muted-foreground/70 font-data tracking-wide animate-fade-in-up"
        style={{ animationDelay: '900ms' }}
      >
        本视角整理自博主公开推文；引用 [#N] 对应博主原文。非投资建议。
      </p>
    </div>
  );
}
