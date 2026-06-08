'use client';

import { useEffect, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import { ChevronDown } from 'lucide-react';
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
// Default capability cards (4-card layout, two interaction patterns)
// ---------------------------------------------------------------------------

type CardId = 'screener' | 'stock' | 'macro' | 'daily';
type AccentName = 'emerald' | 'amber' | 'sky' | 'violet' | 'rose';
type GlyphName = 'funnel' | 'candles' | 'gauge' | 'paper';

interface CardOption {
  title: string;
  desc?: string;
  prompt: string;
  dot?: AccentName;
}

interface BaseCard {
  id: CardId;
  title: string;
  description: string;
  hint: string;
  accent: AccentName;
  glyph: GlyphName;
}

interface ExpandCard extends BaseCard {
  mode: 'options';
  options: CardOption[];
  freeInputPlaceholder?: string;
}

interface TickerCard extends BaseCard {
  mode: 'ticker';
  chips: string[];
}

type CapabilityCard = ExpandCard | TickerCard;

// All Tailwind class strings are literal so they survive the JIT compiler's
// content scan. NEVER template-string the accent name — Tailwind won't see it.
interface AccentClasses {
  borderActive: string;        // 'border-emerald-500/40'
  borderActiveHover: string;   // 'hover:border-emerald-500/40'
  borderActiveFocus: string;   // 'focus:border-emerald-500/40'
  bgTint: string;              // 'bg-emerald-500/[0.04]'
  bgTintHover: string;         // 'hover:bg-emerald-500/[0.04]'
  textActive: string;          // 'text-emerald-400'
  textActiveHover: string;     // 'hover:text-emerald-400'
  textActiveGroupHover: string;// 'group-hover:text-emerald-400'
  textRest: string;            // 'text-emerald-500/70'
  ring: string;                // 'focus-visible:ring-emerald-500/40'
  ringFocus: string;           // 'focus:ring-emerald-500/40'
  glow: string;                // arbitrary radial-gradient bg
}

// One calm, monochrome treatment for every card — no per-card rainbow accent
// and no corner glows (the "engineer-style capability showcase" tell). Brand
// emerald appears only on the active/selected state; everything else is neutral.
const NEUTRAL_ACCENT: AccentClasses = {
  borderActive: 'border-foreground/20',
  borderActiveHover: 'hover:border-foreground/20',
  borderActiveFocus: 'focus:border-foreground/20',
  bgTint: 'bg-foreground/[0.03]',
  bgTintHover: 'hover:bg-foreground/[0.03]',
  textActive: 'text-primary',
  textActiveHover: 'hover:text-foreground',
  textActiveGroupHover: 'group-hover:text-foreground',
  textRest: 'text-muted-foreground',
  ring: 'focus-visible:ring-primary/30',
  ringFocus: 'focus:ring-primary/30',
  glow: '',
};

const ACCENTS: Record<AccentName, AccentClasses> = {
  emerald: NEUTRAL_ACCENT,
  amber: NEUTRAL_ACCENT,
  sky: NEUTRAL_ACCENT,
  violet: NEUTRAL_ACCENT,
  rose: NEUTRAL_ACCENT,
};

// Per-option leading dots — neutral, no rainbow.
const DOT_BG: Record<AccentName, string> = {
  emerald: 'bg-muted-foreground/50',
  amber: 'bg-muted-foreground/50',
  sky: 'bg-muted-foreground/50',
  violet: 'bg-muted-foreground/50',
  rose: 'bg-muted-foreground/50',
};

const CAPABILITIES: CapabilityCard[] = [
  {
    id: 'screener',
    title: '一句话选股',
    description: '用大白话从 5000 只里筛到几只',
    hint: '看示例',
    accent: 'emerald',
    glyph: 'funnel',
    mode: 'options',
    options: [
      { title: '不知道从哪问？', desc: '让 Agent 帮你梳理思路', prompt: '我该怎么挑股票？给我几个常见的切入角度' },
      { title: '估值', desc: 'PE 小于 20 且有稳定分红', prompt: '帮我找 PE 小于 20 且有稳定分红的股票' },
      { title: '趋势', desc: '突破 52 周新高 + 放量', prompt: '帮我找突破 52 周新高且成交量放大的股票' },
      { title: '主题', desc: 'AI 算力链里的龙头', prompt: 'AI 算力产业链里有哪些龙头？' },
      { title: '红利', desc: '股息率 4%+，连续 5 年增长', prompt: '帮我找股息率 4% 以上、连续 5 年增长股息的公司' },
    ],
    freeInputPlaceholder: '或者，自己描述你想筛的股票...',
  },
  {
    id: 'stock',
    title: '个股研究台',
    description: '基本面、技术面、新闻、同行对标',
    hint: '输入代码',
    accent: 'amber',
    glyph: 'candles',
    mode: 'ticker',
    chips: ['NVDA', 'TSLA', 'AAPL', 'PLTR', 'COIN'],
  },
  {
    id: 'macro',
    title: '宏观仪表盘',
    description: '流动性 / 经济 / 通胀 / 情绪 四维信号',
    hint: '4 维度',
    accent: 'sky',
    glyph: 'gauge',
    mode: 'options',
    options: [
      { title: '流动性', desc: '美联储、利率、信用利差', prompt: '现在市场流动性怎么样？' },
      { title: '经济', desc: '增长、就业、消费、制造业', prompt: '美国经济现在处于什么阶段？' },
      { title: '通胀', desc: 'CPI、PPI、通胀预期', prompt: '通胀压力现在还大吗？' },
      { title: '情绪', desc: '恐慌贪婪、VIX、资金流向', prompt: '市场情绪现在是恐慌还是贪婪？' },
    ],
  },
  {
    id: 'daily',
    title: '每日简报',
    description: '复盘、盘前、专属、KOL 热议',
    hint: '4 种日报',
    accent: 'violet',
    glyph: 'paper',
    mode: 'options',
    options: [
      { title: '市场日报', desc: '复盘昨日市场发生了什么', prompt: '解读今天的市场日报', dot: 'amber' },
      { title: '盘前早报', desc: '今天开盘前要看什么', prompt: '今早盘前要点', dot: 'rose' },
      { title: '专属日报', desc: '基于你的持仓自动生成', prompt: '我持仓今天怎么样', dot: 'emerald' },
      { title: '推特日报', desc: 'KOL 今天都在聊什么', prompt: '今天 KOL 都在聊什么？', dot: 'sky' },
    ],
  },
];

// ---------------------------------------------------------------------------
// Card glyphs — tiny inline SVGs, currentColor friendly.
// ---------------------------------------------------------------------------

function CardGlyph({ name, className }: { name: GlyphName; className?: string }) {
  const common = {
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.6,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    className,
    'aria-hidden': true as const,
  };
  switch (name) {
    case 'funnel':
      return (
        <svg {...common}>
          <path d="M4 5h16l-6.2 8.2v5.3l-3.6 1.5v-6.8L4 5z" />
        </svg>
      );
    case 'candles':
      return (
        <svg {...common}>
          <path d="M7 4v3M7 17v3M17 4v6M17 18v2" />
          <rect x="5.5" y="7" width="3" height="10" rx="0.6" />
          <rect x="15.5" y="10" width="3" height="8" rx="0.6" />
        </svg>
      );
    case 'gauge':
      return (
        <svg {...common}>
          <path d="M4 16a8 8 0 1116 0" />
          <path d="M12 16l4-4" />
          <circle cx="12" cy="16" r="1.1" fill="currentColor" stroke="none" />
        </svg>
      );
    case 'paper':
      return (
        <svg {...common}>
          <path d="M5 5h11l3 3v11H5z" />
          <path d="M8 10h8M8 13h8M8 16h5" />
        </svg>
      );
  }
}

// ---------------------------------------------------------------------------
// Persona descriptors. Lookup by username; falls back to qinbafrank-style copy.
// Starters are written in the blogger's voice — not generic capability prompts.
// ---------------------------------------------------------------------------

interface PersonaDescriptor {
  displayName: string;
  tagline: string[];
  quotes: PersonaQuote[];
}

interface PersonaQuote {
  label: string;
  text: string;
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
  const [expandedId, setExpandedId] = useState<CardId | null>(null);
  const toggle = (id: CardId) =>
    setExpandedId((prev) => (prev === id ? null : id));

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

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 items-start">
        {CAPABILITIES.map((card, i) => (
          <CapabilityCardView
            key={card.id}
            card={card}
            expanded={expandedId === card.id}
            onToggle={() => toggle(card.id)}
            onSubmit={onSelect}
            index={i}
          />
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Capability card — dispatches to options-expand or ticker-input body.
// Color identity comes from card.accent (see ACCENTS map).
// ---------------------------------------------------------------------------

interface CapabilityCardViewProps {
  card: CapabilityCard;
  expanded: boolean;
  onToggle: () => void;
  onSubmit: (value: string) => void;
  index: number;
}

function CapabilityCardView({
  card,
  expanded,
  onToggle,
  onSubmit,
  index,
}: CapabilityCardViewProps) {
  const a = ACCENTS[card.accent];

  return (
    <div
      className={`group relative rounded-xl border bg-card/30 animate-fade-in-up transition-colors duration-200 overflow-hidden ${
        expanded
          ? `${a.borderActive} ${a.bgTint}`
          : `border-border/50 ${a.borderActiveHover} ${a.bgTintHover}`
      }`}
      style={{ animationDelay: `${index * 60}ms` }}
    >
      {/* Ambient corner glow — only on expand. Sits below content, doesn't catch clicks. */}
      <div
        aria-hidden
        className={`pointer-events-none absolute inset-0 transition-opacity duration-500 ${a.glow} ${
          expanded ? 'opacity-100' : 'opacity-0'
        }`}
      />

      <button
        type="button"
        onClick={onToggle}
        aria-expanded={expanded}
        aria-controls={`card-body-${card.id}`}
        className={`relative w-full text-left p-5 focus:outline-none focus-visible:ring-2 ${a.ring} cursor-pointer`}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-3 min-w-0">
            <div
              className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-md border ${
                expanded ? a.borderActive : 'border-border/40'
              } ${a.bgTint} transition-colors`}
            >
              <CardGlyph
                name={card.glyph}
                className={`h-4 w-4 transition-colors ${expanded ? a.textActive : a.textRest} ${a.textActiveGroupHover}`}
              />
            </div>
            <div className="min-w-0">
              <h3 className="font-editorial text-lg leading-tight text-foreground mb-1.5">
                {card.title}
              </h3>
              <p className="text-sm text-muted-foreground leading-relaxed">
                {card.description}
              </p>
            </div>
          </div>
          <div
            className={`flex items-center gap-1.5 text-xs shrink-0 mt-1 transition-colors ${
              expanded ? a.textActive : `${a.textRest} ${a.textActiveGroupHover}`
            }`}
          >
            <span>{card.hint}</span>
            <ChevronDown
              className={`w-3.5 h-3.5 transition-transform duration-200 ${
                expanded ? 'rotate-180' : ''
              }`}
              aria-hidden
            />
          </div>
        </div>
      </button>

      {expanded && (
        <div
          id={`card-body-${card.id}`}
          className="relative px-5 pb-5 border-t border-border/30 animate-fade-in-up"
        >
          {card.mode === 'ticker' ? (
            <TickerEntry
              chips={card.chips}
              accent={a}
              onSubmit={(ticker) => onSubmit(`深入分析 ${ticker}`)}
            />
          ) : (
            <OptionGrid
              options={card.options}
              accent={a}
              freeInputPlaceholder={card.freeInputPlaceholder}
              onSubmit={onSubmit}
            />
          )}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Option grid — used by 一句话选股 / 宏观仪表盘 / 每日简报
// ---------------------------------------------------------------------------

interface OptionGridProps {
  options: CardOption[];
  accent: AccentClasses;
  freeInputPlaceholder?: string;
  onSubmit: (value: string) => void;
}

function OptionGrid({ options, accent, freeInputPlaceholder, onSubmit }: OptionGridProps) {
  const [freeText, setFreeText] = useState('');
  const isComposingRef = useRef(false);

  const submitFreeText = () => {
    const trimmed = freeText.trim();
    if (!trimmed) return;
    onSubmit(trimmed);
    setFreeText('');
  };

  return (
    <div className="pt-4 space-y-3">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        {options.map((opt) => (
          <button
            key={opt.title}
            type="button"
            onClick={() => onSubmit(opt.prompt)}
            className={`flex items-start gap-2.5 rounded-lg border border-border/40 bg-background/40 px-3.5 py-2.5 text-left transition-colors duration-200 ${accent.borderActiveHover} ${accent.bgTintHover} focus:outline-none focus-visible:ring-2 ${accent.ring} cursor-pointer`}
          >
            {opt.dot && (
              <span
                aria-hidden
                className={`mt-1.5 h-1.5 w-1.5 rounded-full shrink-0 ${DOT_BG[opt.dot]}`}
              />
            )}
            <div className="min-w-0 flex-1">
              <div className="text-sm font-medium text-foreground leading-tight">
                {opt.title}
              </div>
              {opt.desc && (
                <div className="mt-0.5 text-xs text-muted-foreground leading-relaxed truncate">
                  {opt.desc}
                </div>
              )}
            </div>
          </button>
        ))}
      </div>

      {freeInputPlaceholder && (
        <div className="relative">
          <input
            type="text"
            value={freeText}
            onChange={(e) => setFreeText(e.target.value)}
            onCompositionStart={() => { isComposingRef.current = true; }}
            onCompositionEnd={() => { isComposingRef.current = false; }}
            onKeyDown={(e) => {
              if (isComposingRef.current || e.nativeEvent.isComposing) return;
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                submitFreeText();
              }
            }}
            placeholder={freeInputPlaceholder}
            aria-label="自定义筛选条件"
            className={`w-full rounded-lg border border-border/40 bg-background/40 pl-3.5 pr-10 py-2.5 text-sm text-foreground placeholder:text-muted-foreground/50 focus:outline-none ${accent.borderActiveFocus} focus:ring-1 ${accent.ringFocus} transition-colors duration-200`}
          />
          <button
            type="button"
            onClick={submitFreeText}
            disabled={!freeText.trim()}
            aria-label="发送"
            className={`absolute right-1.5 top-1/2 -translate-y-1/2 p-1.5 rounded-md transition-colors duration-200 ${
              freeText.trim()
                ? `${accent.textActive} ${accent.bgTintHover} cursor-pointer`
                : 'text-muted-foreground/30 cursor-not-allowed'
            }`}
          >
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d="M5 12h14M13 5l7 7-7 7" />
            </svg>
          </button>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Ticker entry — used by 个股研究台
// ---------------------------------------------------------------------------

interface TickerEntryProps {
  chips: string[];
  accent: AccentClasses;
  onSubmit: (ticker: string) => void;
}

function TickerEntry({ chips, accent, onSubmit }: TickerEntryProps) {
  const [value, setValue] = useState('');
  const isComposingRef = useRef(false);

  const submit = () => {
    const trimmed = value.trim().toUpperCase();
    if (!trimmed) return;
    onSubmit(trimmed);
    setValue('');
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (isComposingRef.current || e.nativeEvent.isComposing) return;
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      submit();
    }
  };

  return (
    <div className="pt-4 space-y-3">
      <div className="relative">
        <div className={`absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none ${accent.textRest}`} aria-hidden>
          <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
          </svg>
        </div>
        <input
          type="text"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={handleKeyDown}
          onCompositionStart={() => { isComposingRef.current = true; }}
          onCompositionEnd={() => { isComposingRef.current = false; }}
          placeholder="输入股票代码或公司名，如 NVDA / 英伟达"
          aria-label="输入股票代码"
          className={`w-full pl-10 pr-12 py-2.5 rounded-lg border border-border/40 bg-background/40 text-sm text-foreground placeholder:text-muted-foreground/50 focus:outline-none ${accent.borderActiveFocus} focus:ring-1 ${accent.ringFocus} transition-colors duration-200 uppercase tracking-wide`}
        />
        <button
          type="button"
          onClick={submit}
          disabled={!value.trim()}
          aria-label="开始分析"
          className={`absolute right-1.5 top-1/2 -translate-y-1/2 p-1.5 rounded-md transition-colors duration-200 ${
            value.trim()
              ? `${accent.textActive} hover:${accent.bgTint} cursor-pointer`
              : 'text-muted-foreground/30 cursor-not-allowed'
          }`}
        >
          <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="M5 12h14M13 5l7 7-7 7" />
          </svg>
        </button>
      </div>

      <div className="flex flex-wrap items-center gap-1.5">
        <span className="text-xs text-muted-foreground/60 mr-1">热门</span>
        {chips.map((ticker) => (
          <button
            key={ticker}
            type="button"
            onClick={() => onSubmit(ticker)}
            className={`px-2.5 py-1 rounded-md text-xs font-medium tracking-wide ${accent.textRest} bg-background/50 border border-border/40 ${accent.borderActiveHover} ${accent.textActiveHover} ${accent.bgTintHover} transition-colors duration-200 focus:outline-none focus-visible:ring-2 ${accent.ring} cursor-pointer`}
          >
            {ticker}
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
          className="absolute inset-0 -m-6 rounded-full bg-primary/15 blur-2xl"
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
        <div className="mt-4 w-full max-w-3xl space-y-2 text-left sm:mt-7 sm:space-y-3">
          {persona.quotes.map((quote, i) => (
            <blockquote
              key={quote.label}
              className={`border-l border-primary/35 pl-4 italic leading-relaxed animate-fade-in-up ${
                i === 0
                  ? 'font-editorial text-lg text-foreground sm:text-xl'
                  : 'text-sm text-muted-foreground sm:text-base'
              } ${i > 1 ? 'hidden sm:block' : ''}`}
              style={{ animationDelay: `${300 + i * 55}ms` }}
            >
              <span aria-hidden className="text-primary/80">“</span>
              {quote.text}
              <span aria-hidden className="text-primary/80">”</span>
            </blockquote>
          ))}
        </div>
      )}

      <PersonaLensActions persona={persona} onSelect={onSelect} />
    </div>
  );
}

function PersonaLensActions({
  persona,
  onSelect,
}: {
  persona: PersonaDescriptor;
  onSelect: (value: string) => void;
}) {
  const name = persona.displayName;

  return (
    <section
      aria-label={`${name} Lens 快速提问`}
      className="mt-4 w-full max-w-4xl text-left animate-fade-in-up sm:mt-6"
      style={{ animationDelay: '540ms' }}
    >
      <div className="relative overflow-hidden rounded-2xl border border-border/50 bg-card/45 shadow-[0_24px_80px_rgba(0,0,0,0.22)]">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_70%_80%_at_15%_0%,rgba(16,185,129,0.10),transparent_62%)]"
        />
        <div className="relative flex items-center justify-between gap-4 border-b border-border/40 px-4 py-3 sm:px-5">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs font-medium tracking-[0.15em] text-primary">
                qinbafrank LENS
              </span>
              <span aria-hidden className="h-1 w-1 rounded-full bg-border" />
              <span className="text-sm font-medium text-muted-foreground">
                股票 · 市场 · 行业
              </span>
            </div>
          </div>
        </div>

        <div className="relative grid items-start gap-3 p-3 sm:p-4 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.45fr)]">
          <PersonaLensCard
            title="他怎么看这只股票"
            description="Ticker 或公司名"
            glyph="candles"
            accent={ACCENTS.emerald}
            emphasis
          >
            <PersonaTickerEntry
              accent={ACCENTS.emerald}
              onSubmit={(ticker) => {
                const symbol = normalizePersonaTicker(ticker);
                onSelect(`按 ${name} 的框架分析 ${symbol}：他怎么看这只股票、过去是否直接提到、核心逻辑是什么、现在有哪些数据支持或证伪？`);
              }}
            />
          </PersonaLensCard>

          <PersonaLensCard
            title="他怎么看最近的市场"
            description="四个常见市场问题"
            glyph="gauge"
            accent={ACCENTS.emerald}
            className="lg:col-start-2 lg:row-span-2 lg:row-start-1"
          >
            <PersonaMarketChoices
              options={[
                {
                  title: '大盘风险',
                  desc: '调整级别 / 防守信号',
                  prompt: `按 ${name} 的框架看最近美股市场：现在是健康调整、风险释放还是需要防守？请结合他的历史调整分级和当前市场数据。`,
                },
                {
                  title: '流动性',
                  desc: '利率 / 美债 / 风险资产',
                  prompt: `按 ${name} 的框架看最近市场：流动性、利率和美债现在对风险资产是顺风还是逆风？`,
                },
                {
                  title: '行情主线',
                  desc: 'AI / 财报 / 宏观权重',
                  prompt: `按 ${name} 的框架看最近市场：当前行情的最高权重驱动是什么，AI、财报和宏观变量谁更重要？`,
                },
                {
                  title: '财报季',
                  desc: '业绩验证 / 估值重定价',
                  prompt: `按 ${name} 的框架看最近财报季：市场更在意业绩本身，还是未来预期和估值重定价？`,
                },
              ]}
              accent={ACCENTS.emerald}
              freeInputPlaceholder="或者输入 CPI / 降息 / VIX"
              onSubmit={(value) => {
                const trimmed = value.trim();
                if (!trimmed) return;
                if (trimmed.startsWith(`按 ${name}`)) {
                  onSelect(trimmed);
                  return;
                }
                onSelect(`按 ${name} 的框架看最近市场里的「${trimmed}」：这个变量现在权重有多高，会如何影响风险资产？`);
              }}
            />
          </PersonaLensCard>

          <PersonaLensCard
            title="他怎么看这个行业产业"
            description="行业、产业链或主题"
            glyph="funnel"
            accent={ACCENTS.emerald}
            className="lg:col-start-1 lg:row-start-2"
          >
            <PersonaTextEntry
              placeholder="AI 算力 / 半导体 / 加密金融"
              accent={ACCENTS.emerald}
              onSubmit={(industry) => {
                const topic = industry.trim();
                if (!topic) return;
                onSelect(`按 ${name} 的框架分析「${topic}」这个行业/产业链：他过去怎么看、核心驱动是什么、现在该关注哪些公司和风险信号？`);
              }}
            />
          </PersonaLensCard>
        </div>
      </div>
    </section>
  );
}

function PersonaLensCard({
  title,
  description,
  glyph,
  accent,
  emphasis = false,
  className = '',
  children,
}: {
  title: string;
  description: string;
  glyph: GlyphName;
  accent: AccentClasses;
  emphasis?: boolean;
  className?: string;
  children: ReactNode;
}) {
  return (
    <article
      className={`group relative overflow-hidden rounded-xl border border-border/45 bg-background/35 transition-[border-color,background-color,transform] duration-200 hover:-translate-y-0.5 hover:border-foreground/20 hover:bg-background/50 active:scale-[0.99] ${
        emphasis ? 'p-4 sm:p-5' : 'p-4'
      } ${className}`}
    >
      <div
        aria-hidden
        className={`pointer-events-none absolute inset-0 opacity-0 transition-opacity duration-300 group-hover:opacity-100 ${accent.glow}`}
      />
      <div className="relative text-left">
        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 items-start gap-3">
            <div
              className={`mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-border/50 bg-card/70 transition-colors group-hover:border-primary/30 ${accent.textActive}`}
            >
              <CardGlyph
                name={glyph}
                className="h-4 w-4"
              />
            </div>
            <div className="min-w-0">
              <h3 className="text-base font-semibold leading-snug text-foreground">
                {title}
              </h3>
              <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
                {description}
              </p>
            </div>
          </div>
        </div>
      </div>
      <div className={`relative ${emphasis ? 'mt-5' : 'mt-4'}`}>
        {children}
      </div>
    </article>
  );
}

function PersonaMarketChoices({
  options,
  accent,
  freeInputPlaceholder,
  onSubmit,
}: {
  options: CardOption[];
  accent: AccentClasses;
  freeInputPlaceholder: string;
  onSubmit: (value: string) => void;
}) {
  const [freeText, setFreeText] = useState('');
  const isComposingRef = useRef(false);

  const submitFreeText = () => {
    const trimmed = freeText.trim();
    if (!trimmed) return;
    onSubmit(trimmed);
    setFreeText('');
  };

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        {options.map((opt, i) => (
          <button
            key={opt.title}
            type="button"
            onClick={() => onSubmit(opt.prompt)}
            className={`group/option flex min-h-16 items-start gap-3 rounded-lg border border-border/45 bg-card/45 px-3.5 py-3 text-left transition-[border-color,background-color,transform] duration-200 hover:-translate-y-0.5 hover:border-primary/30 hover:bg-card/70 active:scale-[0.99] focus:outline-none focus-visible:ring-2 ${accent.ring} cursor-pointer`}
          >
            <span className={`mt-0.5 shrink-0 text-xs font-medium leading-normal ${accent.textActive}`}>
              {String(i + 1).padStart(2, '0')}
            </span>
            <span className="min-w-0">
              <span className="block text-sm font-medium leading-snug text-foreground">
                {opt.title}
              </span>
              {opt.desc ? (
                <span className="mt-1 block text-sm leading-relaxed text-muted-foreground">
                  {opt.desc}
                </span>
              ) : null}
            </span>
          </button>
        ))}
      </div>

      <PersonaFreeTextInput
        value={freeText}
        onChange={setFreeText}
        onSubmit={submitFreeText}
        placeholder={freeInputPlaceholder}
        ariaLabel="自定义市场变量"
        accent={accent}
        isComposingRef={isComposingRef}
      />
    </div>
  );
}

function PersonaTickerEntry({
  accent,
  onSubmit,
}: {
  accent: AccentClasses;
  onSubmit: (ticker: string) => void;
}) {
  const [value, setValue] = useState('');
  const isComposingRef = useRef(false);

  const submit = () => {
    const trimmed = normalizePersonaTicker(value);
    if (!trimmed) return;
    onSubmit(trimmed);
    setValue('');
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (isComposingRef.current || e.nativeEvent.isComposing) return;
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      submit();
    }
  };

  return (
    <PersonaFreeTextInput
      value={value}
      onChange={setValue}
      onSubmit={submit}
      onKeyDown={handleKeyDown}
      placeholder="NVDA / 英伟达 / PLTR"
      ariaLabel="输入股票代码"
      accent={accent}
      isComposingRef={isComposingRef}
      inputClassName="tracking-wide"
    />
  );
}

function PersonaTextEntry({
  placeholder,
  accent,
  onSubmit,
}: {
  placeholder: string;
  accent: AccentClasses;
  onSubmit: (value: string) => void;
}) {
  const [value, setValue] = useState('');
  const isComposingRef = useRef(false);

  const submit = () => {
    const trimmed = value.trim();
    if (!trimmed) return;
    onSubmit(trimmed);
    setValue('');
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (isComposingRef.current || e.nativeEvent.isComposing) return;
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      submit();
    }
  };

  return (
    <PersonaFreeTextInput
      value={value}
      onChange={setValue}
      onSubmit={submit}
      onKeyDown={handleKeyDown}
      placeholder={placeholder}
      ariaLabel="输入行业或产业链"
      accent={accent}
      isComposingRef={isComposingRef}
    />
  );
}

function PersonaFreeTextInput({
  value,
  onChange,
  onSubmit,
  onKeyDown,
  placeholder,
  ariaLabel,
  accent,
  isComposingRef,
  inputClassName = '',
}: {
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  onKeyDown?: (e: KeyboardEvent<HTMLInputElement>) => void;
  placeholder: string;
  ariaLabel: string;
  accent: AccentClasses;
  isComposingRef: { current: boolean };
  inputClassName?: string;
}) {
  return (
    <div className="relative">
      <div
        className={`pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 ${accent.textActive}`}
        aria-hidden
      >
        <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
          <path d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
        </svg>
      </div>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if (onKeyDown) {
            onKeyDown(e);
            return;
          }
          if (isComposingRef.current || e.nativeEvent.isComposing) return;
          if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            onSubmit();
          }
        }}
        onCompositionStart={() => { isComposingRef.current = true; }}
        onCompositionEnd={() => { isComposingRef.current = false; }}
        placeholder={placeholder}
        aria-label={ariaLabel}
        className={`h-12 w-full rounded-xl border border-border/50 bg-card/55 py-3 pl-11 pr-14 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none ${accent.borderActiveFocus} focus:ring-1 ${accent.ringFocus} transition-colors duration-200 ${inputClassName}`}
      />
      <button
        type="button"
        onClick={onSubmit}
        disabled={!value.trim()}
        aria-label="开始分析"
        className={`absolute right-1 top-1/2 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-lg transition-colors duration-200 ${
          value.trim()
            ? `${accent.textActive} ${accent.bgTintHover} cursor-pointer`
            : 'text-muted-foreground opacity-50 cursor-not-allowed'
        }`}
      >
        <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <path d="M5 12h14M13 5l7 7-7 7" />
        </svg>
      </button>
    </div>
  );
}

function normalizePersonaTicker(value: string): string {
  return value.trim().replace(/^\$/, '').toUpperCase();
}
