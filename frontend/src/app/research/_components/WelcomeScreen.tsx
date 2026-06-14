'use client';

import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { ChevronDown } from 'lucide-react';
import { useKolCockpitTickers } from '@/hooks/queries/use-kol-data';
import type { KolCockpitTickerSummary } from '@/lib/api';
import ChatInput from './ChatInput';
import PersonaSelector, { type AgentKind } from './PersonaSelector';

// ---------------------------------------------------------------------------
// Default capability cards (4-card layout, two interaction patterns)
// ---------------------------------------------------------------------------

type CardId = string;
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
  freeInputPrompt?: (value: string) => string;
}

interface TickerCard extends BaseCard {
  mode: 'ticker';
  chips: string[];
  tickerPrompt?: (ticker: string) => string;
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

const ACCENTS: Record<AccentName, AccentClasses> = {
  emerald: {
    borderActive: 'border-emerald-500/35',
    borderActiveHover: 'hover:border-emerald-500/35',
    borderActiveFocus: 'focus:border-emerald-500/40',
    bgTint: 'bg-emerald-500/[0.06]',
    bgTintHover: 'hover:bg-emerald-500/[0.06]',
    textActive: 'text-emerald-700 dark:text-emerald-300',
    textActiveHover: 'hover:text-emerald-700 dark:hover:text-emerald-300',
    textActiveGroupHover: 'group-hover:text-emerald-700 dark:group-hover:text-emerald-300',
    textRest: 'text-emerald-700/80 dark:text-emerald-300/80',
    ring: 'focus-visible:ring-emerald-500/30',
    ringFocus: 'focus:ring-emerald-500/30',
    glow: 'bg-[radial-gradient(circle_at_88%_0%,rgba(16,185,129,0.14),transparent_44%)]',
  },
  amber: {
    borderActive: 'border-amber-500/35',
    borderActiveHover: 'hover:border-amber-500/35',
    borderActiveFocus: 'focus:border-amber-500/40',
    bgTint: 'bg-amber-500/[0.07]',
    bgTintHover: 'hover:bg-amber-500/[0.07]',
    textActive: 'text-amber-700 dark:text-amber-300',
    textActiveHover: 'hover:text-amber-700 dark:hover:text-amber-300',
    textActiveGroupHover: 'group-hover:text-amber-700 dark:group-hover:text-amber-300',
    textRest: 'text-amber-700/80 dark:text-amber-300/80',
    ring: 'focus-visible:ring-amber-500/30',
    ringFocus: 'focus:ring-amber-500/30',
    glow: 'bg-[radial-gradient(circle_at_88%_0%,rgba(245,158,11,0.16),transparent_44%)]',
  },
  sky: {
    borderActive: 'border-sky-500/35',
    borderActiveHover: 'hover:border-sky-500/35',
    borderActiveFocus: 'focus:border-sky-500/40',
    bgTint: 'bg-sky-500/[0.06]',
    bgTintHover: 'hover:bg-sky-500/[0.06]',
    textActive: 'text-sky-700 dark:text-sky-300',
    textActiveHover: 'hover:text-sky-700 dark:hover:text-sky-300',
    textActiveGroupHover: 'group-hover:text-sky-700 dark:group-hover:text-sky-300',
    textRest: 'text-sky-700/80 dark:text-sky-300/80',
    ring: 'focus-visible:ring-sky-500/30',
    ringFocus: 'focus:ring-sky-500/30',
    glow: 'bg-[radial-gradient(circle_at_88%_0%,rgba(14,165,233,0.14),transparent_44%)]',
  },
  violet: {
    borderActive: 'border-amber-500/35',
    borderActiveHover: 'hover:border-amber-500/35',
    borderActiveFocus: 'focus:border-amber-500/40',
    bgTint: 'bg-amber-500/[0.07]',
    bgTintHover: 'hover:bg-amber-500/[0.07]',
    textActive: 'text-amber-700 dark:text-amber-300',
    textActiveHover: 'hover:text-amber-700 dark:hover:text-amber-300',
    textActiveGroupHover: 'group-hover:text-amber-700 dark:group-hover:text-amber-300',
    textRest: 'text-amber-700/80 dark:text-amber-300/80',
    ring: 'focus-visible:ring-amber-500/30',
    ringFocus: 'focus:ring-amber-500/30',
    glow: 'bg-[radial-gradient(circle_at_88%_0%,rgba(245,158,11,0.16),transparent_44%)]',
  },
  rose: {
    borderActive: 'border-rose-500/30',
    borderActiveHover: 'hover:border-rose-500/30',
    borderActiveFocus: 'focus:border-rose-500/40',
    bgTint: 'bg-rose-500/[0.06]',
    bgTintHover: 'hover:bg-rose-500/[0.06]',
    textActive: 'text-rose-700 dark:text-rose-300',
    textActiveHover: 'hover:text-rose-700 dark:hover:text-rose-300',
    textActiveGroupHover: 'group-hover:text-rose-700 dark:group-hover:text-rose-300',
    textRest: 'text-rose-700/80 dark:text-rose-300/80',
    ring: 'focus-visible:ring-rose-500/30',
    ringFocus: 'focus:ring-rose-500/30',
    glow: 'bg-[radial-gradient(circle_at_88%_0%,rgba(244,63,94,0.12),transparent_44%)]',
  },
};

const DOT_BG: Record<AccentName, string> = {
  emerald: 'bg-emerald-500/70',
  amber: 'bg-amber-500/70',
  sky: 'bg-sky-500/70',
  violet: 'bg-amber-500/70',
  rose: 'bg-rose-500/70',
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
    accent: 'rose',
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

const DEFAULT_PERSONA_TICKER_CHIPS = ['NVDA', 'TSLA', 'AAPL', 'PLTR', 'COIN'];

const PERSONA_TICKER_FALLBACKS: Record<string, string[]> = {
  // Fallbacks mirror the persona cockpit ticker lists, sorted by mention count.
  qinbafrank: ['NVDA', 'GOOGL', 'MSFT', 'META', 'MU'],
  aleabitoreddit: ['NVDA', 'LITE', 'GOOGL', 'SIVE', 'MSFT'],
};

function selectPersonaTickerChips(
  personaUsername: string | null,
  tickers: KolCockpitTickerSummary[] | undefined,
): string[] {
  const fallback = PERSONA_TICKER_FALLBACKS[personaUsername?.toLowerCase() ?? ''] ?? DEFAULT_PERSONA_TICKER_CHIPS;
  const seen = new Set<string>();
  const fromCoverage = (tickers ?? [])
    .filter((t) => t.priceable !== false)
    .sort((a, b) => (b.count ?? 0) - (a.count ?? 0))
    .map((t) => normalizePersonaTicker(t.ticker))
    .filter((ticker) => {
      if (!ticker || seen.has(ticker)) return false;
      seen.add(ticker);
      return true;
    })
    .slice(0, 5);

  return fromCoverage.length > 0 ? fromCoverage : fallback;
}

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
  description: string;
}

const PERSONAS: Record<string, PersonaDescriptor> = {
  qinbafrank: {
    displayName: 'qinbafrank',
    tagline: ['MACRO', 'AI 算力', '加密金融'],
    description: 'Frank 的框架偏向宏观权重排序、AI 基础设施重定价和风险资产流动性。适合用来检查一只股票是否正在被市场重新理解，以及当前叙事有没有数据支撑。',
  },
  aleabitoreddit: {
    displayName: 'Serenity',
    tagline: ['光子 / CPO', 'AI 半导体供应链', 'small-cap 瓶颈'],
    description: 'Serenity 的框架偏向 AI 半导体供应链、光子/CPO 和底层瓶颈迁移。适合从 hyperscaler capex 往下拆，寻找少数公司绕不过去的 chokepoint。',
  },
};

function getPersonaDescriptor(username: string | null): PersonaDescriptor {
  if (username && PERSONAS[username]) return PERSONAS[username];
  // Unknown persona: stay persona-agnostic — never borrow another KOL's
  // tagline/quotes. Show just the handle with no fabricated voice.
  return {
    displayName: username || '',
    tagline: [],
    description: username
      ? `按 @${username} 的公开方法论检视标的、行业和市场，不复刻口吻，只保留分析框架。`
      : '',
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
  quota,
  personaSelectorEnabled = false,
  agentKind = 'research',
  personaUsername = null,
  onPersonaChange,
}: WelcomeScreenProps) {
  // Target mode = current prop-derived mode.
  // renderMode = which layer is currently *mounted*. During a swap we keep the
  // old mode mounted for TRANSITION_MS so it can fade out before being replaced.
  const targetMode: 'default' | 'persona' =
    agentKind === 'kol_research' && personaUsername ? 'persona' : 'default';
  const [renderMode, setRenderMode] = useState<'default' | 'persona'>(targetMode);
  const isLeaving = renderMode !== targetMode;
  const personaTickersQuery = useKolCockpitTickers(personaUsername ?? '');
  const personaTickerChips = selectPersonaTickerChips(
    personaUsername,
    personaTickersQuery.data?.tickers,
  );

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
      <div className="flex-1 overflow-y-auto relative min-h-0">
        <div
          className={`min-h-full transition-[opacity,transform,filter] ease-[cubic-bezier(0.22,1,0.36,1)] ${
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
            <PersonaIntro
              persona={persona}
              onSelect={onSelect}
              quota={quota}
              personaSelectorEnabled={personaSelectorEnabled}
              agentKind={agentKind}
              personaUsername={personaUsername}
              onPersonaChange={onPersonaChange}
              tickerChips={personaTickerChips}
            />
          ) : (
            <DefaultIntro
              onSelect={onSelect}
              quota={quota}
              personaSelectorEnabled={personaSelectorEnabled}
              agentKind={agentKind}
              personaUsername={personaUsername}
              onPersonaChange={onPersonaChange}
            />
          )}
        </div>
      </div>
    </div>
  );
}

function ComposerControls({
  personaSelectorEnabled,
  agentKind,
  personaUsername,
  onPersonaChange,
}: {
  personaSelectorEnabled: boolean;
  agentKind: AgentKind;
  personaUsername: string | null;
  onPersonaChange?: (next: { agentKind: AgentKind; personaUsername: string | null }) => void;
}) {
  if (!personaSelectorEnabled || !onPersonaChange) return null;

  return (
    <div className="mb-2 flex items-center px-1 animate-fade-in-up">
      <div className="flex min-w-0 items-center gap-2">
        <PersonaSelector
          agentKind={agentKind}
          personaUsername={personaUsername}
          onChange={onPersonaChange}
          requireConfirmBeforeSwitch={false}
          placement="top"
          align="left"
          variant="toolbar"
        />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Default intro — compact agent prompt + capability grid
// ---------------------------------------------------------------------------

interface DefaultIntroProps {
  onSelect: (value: string) => void;
  quota?: QuotaInfo | null;
  personaSelectorEnabled: boolean;
  agentKind: AgentKind;
  personaUsername: string | null;
  onPersonaChange?: (next: { agentKind: AgentKind; personaUsername: string | null }) => void;
}

function DefaultIntro({
  onSelect,
  quota,
  personaSelectorEnabled,
  agentKind,
  personaUsername,
  onPersonaChange,
}: DefaultIntroProps) {
  const [expandedId, setExpandedId] = useState<CardId | null>(null);
  const toggle = (id: CardId) =>
    setExpandedId((prev) => (prev === id ? null : id));

  return (
    <div className="mx-auto flex min-h-[calc(100dvh-4rem)] w-full max-w-4xl flex-col justify-start px-4 pb-6 pt-[clamp(5.5rem,20vh,14rem)] sm:px-6 sm:pb-8">
      <div className="mb-5 flex justify-center text-center sm:mb-6 animate-fade-in-up">
        <h1 className="font-editorial text-2xl leading-snug text-foreground sm:text-3xl md:text-4xl">
          今天想研究什么
        </h1>
      </div>

      <div className="mx-auto mb-6 w-full max-w-3xl sm:mb-7 animate-fade-in-up" style={{ animationDelay: '60ms' }}>
        <ComposerControls
          personaSelectorEnabled={personaSelectorEnabled}
          agentKind={agentKind}
          personaUsername={personaUsername}
          onPersonaChange={onPersonaChange}
        />
        <ChatInput
          onSubmit={onSelect}
          placeholder="随便问点什么..."
          autoFocus={false}
          quota={quota}
        />
      </div>

      <CapabilityCardGrid
        cards={CAPABILITIES}
        expandedId={expandedId}
        onToggle={toggle}
        onSubmit={onSelect}
      />
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

function CapabilityCardGrid({
  cards,
  expandedId,
  onToggle,
  onSubmit,
}: {
  cards: CapabilityCard[];
  expandedId: CardId | null;
  onToggle: (id: CardId) => void;
  onSubmit: (value: string) => void;
}) {
  const positionedCards = cards.map((card, index) => ({ card, index }));
  const leftColumn = positionedCards.filter(({ index }) => index % 2 === 0);
  const rightColumn = positionedCards.filter(({ index }) => index % 2 === 1);

  const renderCard = ({ card, index }: { card: CapabilityCard; index: number }) => (
    <CapabilityCardView
      key={card.id}
      card={card}
      expanded={expandedId === card.id}
      onToggle={() => onToggle(card.id)}
      onSubmit={onSubmit}
      index={index}
    />
  );

  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 sm:items-start">
      <div className="contents sm:flex sm:flex-col sm:gap-3">
        {leftColumn.map(renderCard)}
      </div>
      <div className="contents sm:flex sm:flex-col sm:gap-3">
        {rightColumn.map(renderCard)}
      </div>
    </div>
  );
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
      className={`group relative overflow-hidden rounded-xl border bg-card/35 shadow-sm shadow-black/[0.03] animate-fade-in-up transition-[border-color,background-color,transform,box-shadow] duration-200 hover:-translate-y-0.5 hover:shadow-md hover:shadow-black/[0.06] ${
        expanded
          ? `${a.borderActive} ${a.bgTint}`
          : `border-border/50 ${a.borderActiveHover} ${a.bgTintHover}`
      }`}
      style={{ animationDelay: `${index * 60}ms`, order: index + 1 }}
    >
      {/* Ambient corner glow — only on expand. Sits below content, doesn't catch clicks. */}
      <div
        aria-hidden
        className={`pointer-events-none absolute inset-0 transition-opacity duration-500 ${a.glow} ${
          expanded ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
        }`}
      />

      <button
        type="button"
        onClick={onToggle}
        aria-expanded={expanded}
        aria-controls={`card-body-${card.id}`}
        className={`relative w-full text-left px-5 py-4 focus:outline-none focus-visible:ring-2 ${a.ring} cursor-pointer`}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-3 min-w-0">
            <div
              className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-md border ${
                expanded ? a.borderActive : 'border-border/40'
              } ${a.bgTint} transition-[border-color,background-color,transform] duration-200 group-hover:scale-105`}
            >
              <CardGlyph
                name={card.glyph}
                className={`h-4 w-4 transition-colors ${expanded ? a.textActive : a.textRest} ${a.textActiveGroupHover}`}
              />
            </div>
            <div className="min-w-0">
              <h3 className="text-lg font-semibold leading-tight text-foreground">
                {card.title}
              </h3>
            </div>
          </div>
          <div
            className={`mt-0.5 flex shrink-0 items-center gap-1.5 text-sm font-medium leading-5 transition-colors ${
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

      <div
        id={`card-body-${card.id}`}
        aria-hidden={!expanded}
        className={`relative grid transition-[grid-template-rows,opacity] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none ${
          expanded ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0'
        }`}
      >
        <div className={`min-h-0 overflow-hidden ${expanded ? 'visible' : 'invisible'}`}>
          <div
            className={`border-t border-border/30 px-5 pb-5 transition-[opacity,transform] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none motion-reduce:transform-none ${
              expanded ? 'translate-y-0 opacity-100' : '-translate-y-1.5 opacity-0'
            }`}
          >
            {card.mode === 'ticker' ? (
              <TickerEntry
                chips={card.chips}
                accent={a}
                onSubmit={(ticker) => onSubmit(card.tickerPrompt ? card.tickerPrompt(ticker) : `深入分析 ${ticker}`)}
              />
            ) : (
              <OptionGrid
                options={card.options}
                accent={a}
                freeInputPlaceholder={card.freeInputPlaceholder}
                onSubmit={onSubmit}
                onFreeSubmit={card.freeInputPrompt ? (value) => {
                  const prompt = card.freeInputPrompt?.(value);
                  if (prompt) onSubmit(prompt);
                } : undefined}
              />
            )}
          </div>
        </div>
      </div>
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
  onFreeSubmit?: (value: string) => void;
}

function OptionGrid({ options, accent, freeInputPlaceholder, onSubmit, onFreeSubmit }: OptionGridProps) {
  const [freeText, setFreeText] = useState('');
  const isComposingRef = useRef(false);

  const submitFreeText = () => {
    const trimmed = freeText.trim();
    if (!trimmed) return;
    if (onFreeSubmit) {
      onFreeSubmit(trimmed);
    } else {
      onSubmit(trimmed);
    }
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
            className={`flex items-start gap-2.5 rounded-lg border border-border/40 bg-background/45 px-3.5 py-2.5 text-left transition-[border-color,background-color,transform] duration-200 hover:-translate-y-px ${accent.borderActiveHover} ${accent.bgTintHover} focus:outline-none focus-visible:ring-2 ${accent.ring} cursor-pointer`}
          >
            {opt.dot && (
              <span
                aria-hidden
                className={`mt-1.5 h-1.5 w-1.5 rounded-full shrink-0 ${DOT_BG[opt.dot]}`}
              />
            )}
            <div className="min-w-0 flex-1">
              <div className="text-sm font-medium leading-snug text-foreground">
                {opt.title}
              </div>
              {opt.desc && (
                <div className="mt-1 truncate text-sm leading-5 text-muted-foreground">
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
            className={`w-full rounded-lg border border-border/40 bg-background/45 pl-3.5 pr-10 py-2.5 text-sm text-foreground placeholder:text-muted-foreground/70 focus:outline-none ${accent.borderActiveFocus} focus:ring-1 ${accent.ringFocus} transition-colors duration-200`}
          />
          <button
            type="button"
            onClick={submitFreeText}
            disabled={!freeText.trim()}
            aria-label="发送"
            className={`absolute right-1.5 top-1/2 -translate-y-1/2 p-1.5 rounded-md transition-colors duration-200 ${
              freeText.trim()
                ? `${accent.textActive} ${accent.bgTintHover} cursor-pointer`
                : 'text-muted-foreground/70 cursor-not-allowed'
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
          className={`w-full pl-10 pr-12 py-2.5 rounded-lg border border-border/40 bg-background/45 text-sm text-foreground placeholder:text-muted-foreground/70 focus:outline-none ${accent.borderActiveFocus} focus:ring-1 ${accent.ringFocus} transition-colors duration-200 uppercase tracking-wide`}
        />
        <button
          type="button"
          onClick={submit}
          disabled={!value.trim()}
          aria-label="开始分析"
          className={`absolute right-1.5 top-1/2 -translate-y-1/2 p-1.5 rounded-md transition-colors duration-200 ${
            value.trim()
              ? `${accent.textActive} ${accent.bgTintHover} cursor-pointer`
              : 'text-muted-foreground/70 cursor-not-allowed'
          }`}
        >
          <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="M5 12h14M13 5l7 7-7 7" />
          </svg>
        </button>
      </div>

      <div className="flex flex-wrap items-center gap-1.5">
        <span className="mr-1 text-sm font-medium leading-5 text-muted-foreground">热门</span>
        {chips.map((ticker) => (
          <button
            key={ticker}
            type="button"
            onClick={() => onSubmit(ticker)}
            className={`rounded-md border border-border/40 bg-background/50 px-2.5 py-1 text-xs font-medium tracking-wide ${accent.textRest} ${accent.borderActiveHover} ${accent.textActiveHover} ${accent.bgTintHover} transition-[border-color,background-color,transform] duration-200 hover:-translate-y-px focus:outline-none focus-visible:ring-2 ${accent.ring} cursor-pointer`}
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
  tickerChips: string[];
  quota?: QuotaInfo | null;
  personaSelectorEnabled: boolean;
  agentKind: AgentKind;
  personaUsername: string | null;
  onPersonaChange?: (next: { agentKind: AgentKind; personaUsername: string | null }) => void;
}

function PersonaIntro({
  persona,
  onSelect,
  tickerChips,
  quota,
  personaSelectorEnabled,
  agentKind,
  personaUsername,
  onPersonaChange,
}: PersonaIntroProps) {
  const avatarSrc = `/kol-avatars/${persona.displayName.toLowerCase()}.png`;

  return (
    <div className="mx-auto flex min-h-[calc(100dvh-4rem)] w-full max-w-5xl flex-col justify-start px-4 pb-6 pt-[clamp(3.5rem,12vh,8rem)] text-center sm:px-6 sm:pb-8">
      <div className="mx-auto mb-5 flex max-w-2xl flex-col items-center sm:mb-6">
        <div className="relative mb-3 animate-scale-in" style={{ animationDelay: '60ms' }}>
          <div
            aria-hidden
            className="absolute inset-0 -m-5 rounded-full bg-primary/12 blur-xl"
          />
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={avatarSrc}
            alt={persona.displayName}
            className="relative h-14 w-14 rounded-full object-cover ring-2 ring-primary/35 ring-offset-4 ring-offset-background sm:h-16 sm:w-16"
            onError={(e) => {
              (e.currentTarget as HTMLImageElement).style.display = 'none';
              const sib = (e.currentTarget as HTMLImageElement).nextElementSibling as HTMLElement | null;
              if (sib) {
                sib.classList.remove('hidden');
                sib.classList.add('flex');
              }
            }}
          />
          <div className="relative hidden h-14 w-14 items-center justify-center rounded-full border border-primary/30 bg-primary/[0.08] font-editorial text-xl text-primary sm:h-16 sm:w-16 sm:text-2xl">
            {persona.displayName.slice(0, 2).toUpperCase()}
          </div>
        </div>

        <h1
          className="font-editorial italic text-2xl leading-snug text-foreground sm:text-3xl animate-fade-in-up"
          style={{ animationDelay: '140ms' }}
        >
          @{persona.displayName}
        </h1>

        {persona.description ? (
          <p
            className="font-reading mt-4 max-w-xl animate-fade-in-up text-balance text-base leading-7 text-muted-foreground"
            style={{ animationDelay: '220ms' }}
          >
            {persona.description}
          </p>
        ) : null}
      </div>

      <div className="mx-auto mb-6 w-full max-w-3xl sm:mb-7 animate-fade-in-up" style={{ animationDelay: '300ms' }}>
        <ComposerControls
          personaSelectorEnabled={personaSelectorEnabled}
          agentKind={agentKind}
          personaUsername={personaUsername}
          onPersonaChange={onPersonaChange}
        />
        <ChatInput
          onSubmit={onSelect}
          placeholder={`想问 @${persona.displayName} 什么？`}
          autoFocus={false}
          quota={quota}
        />
      </div>

      <PersonaLensActions persona={persona} tickerChips={tickerChips} onSelect={onSelect} />
    </div>
  );
}

function PersonaLensActions({
  persona,
  tickerChips,
  onSelect,
}: {
  persona: PersonaDescriptor;
  tickerChips: string[];
  onSelect: (value: string) => void;
}) {
  const name = persona.displayName;
  const [expandedId, setExpandedId] = useState<CardId | null>(null);
  const cards = buildPersonaLensCards(name, tickerChips);
  const toggle = (id: CardId) =>
    setExpandedId((prev) => (prev === id ? null : id));

  return (
    <section
      aria-label={`${name} Lens 快速提问`}
      className="w-full max-w-4xl text-left animate-fade-in-up"
      style={{ animationDelay: '360ms' }}
    >
      <CapabilityCardGrid
        cards={cards}
        expandedId={expandedId}
        onToggle={toggle}
        onSubmit={onSelect}
      />
    </section>
  );
}

function buildPersonaLensCards(name: string, tickerChips: string[]): CapabilityCard[] {
  return [
    {
      id: 'persona-stock',
      title: '他怎么看这只股票',
      description: '历史观点、当前数据、证伪点',
      hint: '输入代码',
      accent: 'emerald',
      glyph: 'candles',
      mode: 'ticker',
      chips: tickerChips,
      tickerPrompt: (ticker) => {
        const symbol = normalizePersonaTicker(ticker);
        return `按 ${name} 的框架分析 ${symbol}：他怎么看这只股票、过去是否直接提到、核心逻辑是什么、现在有哪些数据支持或证伪？`;
      },
    },
    {
      id: 'persona-market',
      title: '他怎么看最近的市场',
      description: '风险、流动性、行情主线、财报季',
      hint: '4 问题',
      accent: 'sky',
      glyph: 'gauge',
      mode: 'options',
      options: [
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
      ],
      freeInputPlaceholder: '或者输入 CPI / 降息 / VIX...',
      freeInputPrompt: (value) => `按 ${name} 的框架看最近市场里的「${value.trim()}」：这个变量现在权重有多高，会如何影响风险资产？`,
    },
    {
      id: 'persona-industry',
      title: '他怎么看这个行业',
      description: '产业链位置、核心驱动、相关公司',
      hint: '选主题',
      accent: 'amber',
      glyph: 'funnel',
      mode: 'options',
      options: [
        {
          title: 'AI 算力',
          desc: 'GPU / 电力 / 数据中心',
          prompt: `按 ${name} 的框架分析「AI 算力」产业链：他过去怎么看、核心驱动是什么、现在该关注哪些公司和风险信号？`,
        },
        {
          title: '半导体',
          desc: '周期 / 先进制程 / 设备',
          prompt: `按 ${name} 的框架分析「半导体」行业：他过去怎么看、核心驱动是什么、现在该关注哪些公司和风险信号？`,
        },
        {
          title: '加密金融',
          desc: 'BTC / 交易所 / 支付',
          prompt: `按 ${name} 的框架分析「加密金融」主题：他过去怎么看、核心驱动是什么、现在该关注哪些公司和风险信号？`,
        },
        {
          title: '能源与电力',
          desc: 'AI 负载 / 核电 / 电网',
          prompt: `按 ${name} 的框架分析「能源与电力」产业链：他过去怎么看、核心驱动是什么、现在该关注哪些公司和风险信号？`,
        },
      ],
      freeInputPlaceholder: '或者输入行业 / 产业链 / 主题...',
      freeInputPrompt: (value) => `按 ${name} 的框架分析「${value.trim()}」这个行业/产业链：他过去怎么看、核心驱动是什么、现在该关注哪些公司和风险信号？`,
    },
    {
      id: 'persona-verify',
      title: '验证他的观点',
      description: '找原文、看证据、判断是否过期',
      hint: '快速问',
      accent: 'rose',
      glyph: 'paper',
      mode: 'options',
      options: [
        {
          title: '最新观点',
          desc: '最近在强调什么',
          prompt: `${name} 最近最重要的观点是什么？请按主题总结，并说明哪些观点有市场数据支持。`,
        },
        {
          title: '有没有改口',
          desc: '前后观点是否变化',
          prompt: `检查 ${name} 最近和过去的观点有没有明显变化：哪些观点延续，哪些观点可能已经修正？`,
        },
        {
          title: '数据支持吗',
          desc: '价格 / 财报 / 宏观验证',
          prompt: `用当前市场数据验证 ${name} 最近的核心判断：哪些被支持，哪些还缺证据，哪些可能被证伪？`,
        },
        {
          title: '风险提醒',
          desc: '他可能低估了什么',
          prompt: `站在 ${name} 的框架里反向检查：当前最容易被低估的风险是什么？需要观察哪些信号？`,
        },
      ],
      freeInputPlaceholder: '或者输入一个观点 / 主题...',
      freeInputPrompt: (value) => `帮我查 ${name} 关于「${value.trim()}」的历史观点，并判断这些观点现在还有没有数据支持。`,
    },
  ];
}

function normalizePersonaTicker(value: string): string {
  return value.trim().replace(/^\$/, '').toUpperCase();
}
