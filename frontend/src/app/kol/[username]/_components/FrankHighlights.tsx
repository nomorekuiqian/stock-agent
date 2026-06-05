'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  ArrowUpRight,
  BookOpenText,
  BriefcaseBusiness,
  Coins,
  Cpu,
  Globe2,
  LineChart,
  Search,
  Zap,
  type LucideIcon,
} from 'lucide-react';

import { cn } from '@/lib/utils';
import { useKolEvidenceTweets } from '@/hooks/queries/use-kol-data';
import {
  FRANK_FEATURED_CONTENT,
  FRANK_HIGHLIGHT_TOPICS,
  getFeaturedItemsForGroup,
  getFeaturedByTopic,
  getGroupsByTopic,
  getTopicSummary,
  type FrankFeaturedContent,
  type FrankFeaturedGroup,
  type FrankHighlightTopicId,
} from './frankContentData';

const topicIcons: Record<FrankHighlightTopicId, LucideIcon> = {
  'ai-trend': Cpu,
  'capex-war': Zap,
  'company-theses': BriefcaseBusiness,
  'market-rules': LineChart,
  'market-timing': LineChart,
  'macro-geopolitics': Globe2,
  'crypto-rwa': Coins,
};

type TopicToneName = 'emerald' | 'amber' | 'sky' | 'rose';

interface TopicTone {
  name: TopicToneName;
  text: string;
  line: string;
  dot: string;
  chip: string;
  activeTab: string;
  inactiveHover: string;
  activeIcon: string;
  inactiveIcon: string;
  cardActive: string;
  cardHover: string;
  titleHover: string;
  readerBorder: string;
  guide: string;
  timelineActive: string;
  timelineHover: string;
  heroAccent: string;
}

const topicTones: Record<TopicToneName, TopicTone> = {
  emerald: {
    name: 'emerald',
    text: 'text-emerald-300 light:text-emerald-700',
    line: 'bg-emerald-400',
    dot: 'bg-emerald-400',
    chip: 'border-emerald-400/30 bg-emerald-500/10 text-emerald-300 light:text-emerald-700',
    activeTab: 'border-emerald-400/50 bg-emerald-500/10 text-foreground shadow-[0_16px_36px_rgba(16,185,129,0.10)]',
    inactiveHover: 'hover:border-emerald-400/30 hover:bg-emerald-500/[0.06] hover:text-foreground',
    activeIcon: 'border-emerald-400/35 bg-emerald-500/10 text-emerald-300 light:text-emerald-700',
    inactiveIcon: 'border-border/40 bg-background/40 text-muted-foreground group-hover:border-emerald-400/30 group-hover:text-emerald-300',
    cardActive: 'border-emerald-400/45 bg-[linear-gradient(135deg,rgba(16,185,129,0.14),rgba(255,255,255,0.025)_44%,rgba(245,158,11,0.055))] shadow-[0_18px_54px_rgba(16,185,129,0.11),inset_0_1px_0_rgba(255,255,255,0.08)]',
    cardHover: 'hover:border-emerald-400/35 hover:bg-emerald-500/[0.045]',
    titleHover: 'group-hover:text-emerald-300 light:group-hover:text-emerald-700',
    readerBorder: 'border-emerald-400/30',
    guide: 'border-emerald-400/25 bg-emerald-500/[0.045]',
    timelineActive: 'border-emerald-400/45 bg-emerald-500/10 text-foreground',
    timelineHover: 'hover:border-emerald-400/35 hover:bg-emerald-500/[0.055] hover:text-foreground',
    heroAccent: 'bg-[linear-gradient(90deg,transparent,rgba(16,185,129,0.62),rgba(245,158,11,0.28),transparent)]',
  },
  amber: {
    name: 'amber',
    text: 'text-amber-300 light:text-amber-700',
    line: 'bg-amber-400',
    dot: 'bg-amber-400',
    chip: 'border-amber-400/30 bg-amber-500/10 text-amber-300 light:text-amber-700',
    activeTab: 'border-amber-400/50 bg-amber-500/10 text-foreground shadow-[0_16px_36px_rgba(245,158,11,0.10)]',
    inactiveHover: 'hover:border-amber-400/30 hover:bg-amber-500/[0.06] hover:text-foreground',
    activeIcon: 'border-amber-400/35 bg-amber-500/10 text-amber-300 light:text-amber-700',
    inactiveIcon: 'border-border/40 bg-background/40 text-muted-foreground group-hover:border-amber-400/30 group-hover:text-amber-300',
    cardActive: 'border-amber-400/45 bg-[linear-gradient(135deg,rgba(245,158,11,0.13),rgba(255,255,255,0.025)_44%,rgba(16,185,129,0.04))] shadow-[0_18px_54px_rgba(245,158,11,0.10),inset_0_1px_0_rgba(255,255,255,0.08)]',
    cardHover: 'hover:border-amber-400/35 hover:bg-amber-500/[0.045]',
    titleHover: 'group-hover:text-amber-300 light:group-hover:text-amber-700',
    readerBorder: 'border-amber-400/30',
    guide: 'border-amber-400/25 bg-amber-500/[0.045]',
    timelineActive: 'border-amber-400/45 bg-amber-500/10 text-foreground',
    timelineHover: 'hover:border-amber-400/35 hover:bg-amber-500/[0.055] hover:text-foreground',
    heroAccent: 'bg-[linear-gradient(90deg,transparent,rgba(245,158,11,0.56),rgba(16,185,129,0.28),transparent)]',
  },
  sky: {
    name: 'sky',
    text: 'text-sky-300 light:text-sky-700',
    line: 'bg-sky-400',
    dot: 'bg-sky-400',
    chip: 'border-sky-400/30 bg-sky-500/10 text-sky-300 light:text-sky-700',
    activeTab: 'border-sky-400/50 bg-sky-500/10 text-foreground shadow-[0_16px_36px_rgba(14,165,233,0.10)]',
    inactiveHover: 'hover:border-sky-400/30 hover:bg-sky-500/[0.06] hover:text-foreground',
    activeIcon: 'border-sky-400/35 bg-sky-500/10 text-sky-300 light:text-sky-700',
    inactiveIcon: 'border-border/40 bg-background/40 text-muted-foreground group-hover:border-sky-400/30 group-hover:text-sky-300',
    cardActive: 'border-sky-400/45 bg-[linear-gradient(135deg,rgba(14,165,233,0.13),rgba(255,255,255,0.025)_44%,rgba(16,185,129,0.04))] shadow-[0_18px_54px_rgba(14,165,233,0.10),inset_0_1px_0_rgba(255,255,255,0.08)]',
    cardHover: 'hover:border-sky-400/35 hover:bg-sky-500/[0.045]',
    titleHover: 'group-hover:text-sky-300 light:group-hover:text-sky-700',
    readerBorder: 'border-sky-400/30',
    guide: 'border-sky-400/25 bg-sky-500/[0.045]',
    timelineActive: 'border-sky-400/45 bg-sky-500/10 text-foreground',
    timelineHover: 'hover:border-sky-400/35 hover:bg-sky-500/[0.055] hover:text-foreground',
    heroAccent: 'bg-[linear-gradient(90deg,transparent,rgba(14,165,233,0.54),rgba(16,185,129,0.28),transparent)]',
  },
  rose: {
    name: 'rose',
    text: 'text-rose-300 light:text-rose-700',
    line: 'bg-rose-400',
    dot: 'bg-rose-400',
    chip: 'border-rose-400/30 bg-rose-500/10 text-rose-300 light:text-rose-700',
    activeTab: 'border-rose-400/50 bg-rose-500/10 text-foreground shadow-[0_16px_36px_rgba(244,63,94,0.10)]',
    inactiveHover: 'hover:border-rose-400/30 hover:bg-rose-500/[0.06] hover:text-foreground',
    activeIcon: 'border-rose-400/35 bg-rose-500/10 text-rose-300 light:text-rose-700',
    inactiveIcon: 'border-border/40 bg-background/40 text-muted-foreground group-hover:border-rose-400/30 group-hover:text-rose-300',
    cardActive: 'border-rose-400/45 bg-[linear-gradient(135deg,rgba(244,63,94,0.12),rgba(255,255,255,0.025)_44%,rgba(245,158,11,0.04))] shadow-[0_18px_54px_rgba(244,63,94,0.09),inset_0_1px_0_rgba(255,255,255,0.08)]',
    cardHover: 'hover:border-rose-400/35 hover:bg-rose-500/[0.045]',
    titleHover: 'group-hover:text-rose-300 light:group-hover:text-rose-700',
    readerBorder: 'border-rose-400/30',
    guide: 'border-rose-400/25 bg-rose-500/[0.045]',
    timelineActive: 'border-rose-400/45 bg-rose-500/10 text-foreground',
    timelineHover: 'hover:border-rose-400/35 hover:bg-rose-500/[0.055] hover:text-foreground',
    heroAccent: 'bg-[linear-gradient(90deg,transparent,rgba(244,63,94,0.48),rgba(245,158,11,0.30),transparent)]',
  },
};

const topicToneById: Record<FrankHighlightTopicId, TopicTone> = {
  'ai-trend': topicTones.emerald,
  'capex-war': topicTones.amber,
  'company-theses': topicTones.emerald,
  'market-rules': topicTones.rose,
  'market-timing': topicTones.sky,
  'macro-geopolitics': topicTones.sky,
  'crypto-rwa': topicTones.amber,
};

interface Props {
  username: string;
  initialTopicId?: string | null;
}

export default function FrankHighlights({ username, initialTopicId }: Props) {
  const initialTopic = getTopicSummary(initialTopicId)?.id ?? 'ai-trend';
  const fallbackGroup = getGroupsByTopic('ai-trend')[0]!;
  const initialGroup = getGroupsByTopic(initialTopic)[0] ?? fallbackGroup;
  const initialGroupItems = getFeaturedItemsForGroup(initialGroup);
  const [activeTopicId, setActiveTopicId] = useState<FrankHighlightTopicId>(initialTopic);
  const [selectedGroupId, setSelectedGroupId] = useState(
    initialGroup.id,
  );
  const [selectedItemId, setSelectedItemId] = useState(
    initialGroupItems[0]?.id ?? FRANK_FEATURED_CONTENT[0]?.id ?? '',
  );
  const [query, setQuery] = useState('');
  const activeTopic = getTopicSummary(activeTopicId) ?? FRANK_HIGHLIGHT_TOPICS[0];
  const topicGroups = useMemo(() => getGroupsByTopic(activeTopicId), [activeTopicId]);
  const normalizedQuery = query.trim().toLowerCase();
  const visibleGroups = useMemo(() => {
    if (!normalizedQuery) return topicGroups;
    return topicGroups.filter((groupItem) => {
      const items = getFeaturedItemsForGroup(groupItem);
      return [
        groupItem.title,
        groupItem.summary,
        groupItem.whyItMatters,
        ...(groupItem.tickers ?? []),
        ...items.flatMap((item) => [
          item.title,
          item.summary,
          item.whyItMatters,
          item.sourceId,
          ...(item.tickers ?? []),
        ]),
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
        .includes(normalizedQuery);
    });
  }, [normalizedQuery, topicGroups]);
  const selectedGroup =
    visibleGroups.find((item) => item.id === selectedGroupId) ??
    (normalizedQuery ? visibleGroups[0] : undefined) ??
    topicGroups.find((item) => item.id === selectedGroupId) ??
    topicGroups[0] ??
    fallbackGroup;
  const selectedGroupItems = getFeaturedItemsForGroup(selectedGroup);
  const selectedItem =
    selectedGroupItems.find((item) => item.id === selectedItemId) ??
    selectedGroupItems[0] ??
    FRANK_FEATURED_CONTENT[0];
  const activeTone = topicToneById[activeTopicId];

  useEffect(() => {
    const nextTopic = getTopicSummary(initialTopicId)?.id;
    if (!nextTopic) return;
    const nextGroup = getGroupsByTopic(nextTopic)[0];
    setActiveTopicId(nextTopic);
    setSelectedGroupId(nextGroup?.id ?? selectedGroupId);
    setSelectedItemId(nextGroup ? getFeaturedItemsForGroup(nextGroup)[0]?.id ?? selectedItemId : selectedItemId);
    // selected ids are intentionally not dependencies; route topic is the reset boundary.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialTopicId]);

  const handleTopicChange = (topicId: FrankHighlightTopicId) => {
    const nextGroup = getGroupsByTopic(topicId)[0];
    setActiveTopicId(topicId);
    setQuery('');
    setSelectedGroupId(nextGroup?.id ?? selectedGroupId);
    setSelectedItemId(nextGroup ? getFeaturedItemsForGroup(nextGroup)[0]?.id ?? selectedItemId : selectedItemId);
    scrollReaderIntoView();
  };

  const handleSelectGroup = (groupItem: FrankFeaturedGroup) => {
    setSelectedGroupId(groupItem.id);
    setSelectedItemId(getFeaturedItemsForGroup(groupItem)[0]?.id ?? selectedItemId);
    scrollReaderIntoView();
  };

  const handleSelectTimelineItem = (item: FrankFeaturedContent) => {
    setSelectedItemId(item.id);
  };

  return (
    <div className="relative min-h-[100dvh] overflow-hidden border-t border-border/40 bg-background light:bg-[linear-gradient(180deg,#f7faf6_0%,var(--background)_34rem)]">
      <div className="relative mx-auto w-full max-w-[1480px] space-y-6 px-4 pb-16 pt-5 sm:px-6 lg:px-8 2xl:px-10">
        <HighlightsHero selectedGroup={selectedGroup} selectedItem={selectedItem} tone={activeTone} />
        <TopicSelector activeTopicId={activeTopicId} onChange={handleTopicChange} />

        <section className="relative z-10 grid gap-6 xl:grid-cols-[minmax(20rem,28rem)_minmax(0,1fr)] 2xl:grid-cols-[minmax(22rem,30rem)_minmax(0,1fr)]">
          <aside className="min-w-0 xl:sticky xl:top-20 xl:self-start">
            <SearchPanel
              query={query}
              onQueryChange={setQuery}
              visibleCount={visibleGroups.length}
              tone={activeTone}
            />
            <div
              aria-label={`${activeTopic.label}检索卡片`}
              className="mt-3 grid max-h-none gap-3 rounded-lg border border-border/35 bg-card/60 p-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.05)] dark:bg-card/50 md:grid-cols-2 xl:max-h-[calc(100dvh-15rem)] xl:grid-cols-1 xl:overflow-y-auto"
            >
              {visibleGroups.length ? (
                visibleGroups.map((groupItem, index) => (
                  <RetrievalCard
                    key={groupItem.id}
                    groupItem={groupItem}
                    index={index + 1}
                    active={selectedGroup.id === groupItem.id}
                    tone={topicToneById[groupItem.topicId]}
                    onSelect={() => handleSelectGroup(groupItem)}
                  />
                ))
              ) : (
                <div className="rounded-md border border-dashed border-border/55 bg-background/25 px-4 py-5 text-sm leading-relaxed text-muted-foreground">
                  当前主题下没有匹配内容。换个关键词，或切到其他主题。
                </div>
              )}
            </div>
          </aside>

          <HighlightsReader
            username={username}
            groupItem={selectedGroup}
            items={selectedGroupItems}
            item={selectedItem}
            topicId={activeTopicId}
            tone={activeTone}
            onSelectItem={handleSelectTimelineItem}
          />
        </section>
      </div>
    </div>
  );
}

function scrollReaderIntoView() {
  if (typeof window === 'undefined' || window.innerWidth >= 1280) return;
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  window.setTimeout(() => {
    document
      .getElementById('frank-highlights-reader')
      ?.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'start' });
  }, 0);
}

function HighlightsHero({
  selectedGroup,
  selectedItem,
  tone,
}: {
  selectedGroup: FrankFeaturedGroup;
  selectedItem: FrankFeaturedContent;
  tone: TopicTone;
}) {
  return (
    <section className="relative isolate animate-fade-in-up overflow-hidden rounded-lg border border-border/45 bg-card/25 p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.05)] md:p-6">
      <div
        aria-hidden
        className={cn('absolute inset-x-0 top-0 h-px', tone.heroAccent)}
      />
      <div>
        <p className={cn('text-xs font-medium', tone.text)}>qinbafrank 过往观点索引</p>
        <h2 className="mt-2 max-w-4xl font-editorial text-3xl leading-tight text-foreground [text-wrap:balance] sm:text-4xl md:text-5xl">
          过往精华内容库
        </h2>
        <p className="mt-4 max-w-3xl text-base leading-relaxed text-muted-foreground">
          按主题整理 qinbafrank 的核心判断、原文证据和时间脉络，让用户不用翻完整推文流，也能快速理解一条观点从提出、验证到迭代的过程。当前焦点：
          <span className="font-medium text-foreground"> {selectedGroup.title}</span>
          <span className="text-muted-foreground"> / {selectedItem.title}</span>
        </p>
        <div className="mt-5 flex flex-wrap items-center gap-2">
          <span className={cn('inline-flex min-h-8 items-center gap-2 rounded-md border px-2.5 text-xs font-medium', tone.chip)}>
            <span aria-hidden className={cn('h-1.5 w-1.5 rounded-full', tone.dot)} />
            当前焦点
          </span>
          {(selectedGroup.tickers ?? []).slice(0, 5).map((ticker) => (
            <span
              key={ticker}
              className="inline-flex min-h-8 items-center rounded-md border border-border/40 bg-background/35 px-2.5 font-data text-xs tabular-nums text-muted-foreground"
            >
              {ticker}
            </span>
          ))}
        </div>
      </div>
    </section>
  );
}

function TopicSelector({
  activeTopicId,
  onChange,
}: {
  activeTopicId: FrankHighlightTopicId;
  onChange: (topicId: FrankHighlightTopicId) => void;
}) {
  return (
    <div className="grid gap-2 rounded-lg border border-border/35 bg-card/35 p-1.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.05)] sm:grid-cols-2 lg:grid-cols-4 2xl:grid-cols-7">
      {FRANK_HIGHLIGHT_TOPICS.map((topic, index) => {
        const Icon = topicIcons[topic.id];
        const tone = topicToneById[topic.id];
        const active = activeTopicId === topic.id;
        return (
          <button
            key={topic.id}
            type="button"
            aria-pressed={active}
            onClick={() => onChange(topic.id)}
            className={cn(
              'group relative isolate min-h-14 overflow-hidden rounded-md border px-3 py-2.5 text-left transition-all duration-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/70 active:scale-[0.99] motion-safe:hover:-translate-y-0.5',
              active
                ? tone.activeTab
                : cn('border-transparent text-muted-foreground hover:bg-background/35', tone.inactiveHover),
            )}
          >
            <span
              aria-hidden
              className={cn(
                'absolute inset-x-3 bottom-0 h-px rounded-full transition-opacity duration-300',
                active ? tone.line : 'bg-transparent opacity-0 group-hover:bg-border/60 group-hover:opacity-100',
              )}
            />
            <span className="flex items-start justify-between gap-3">
              <span className="flex min-w-0 items-start gap-2">
                <span
                  className={cn(
                    'mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-sm border transition duration-300 motion-safe:group-hover:scale-[1.04]',
                    active ? tone.activeIcon : tone.inactiveIcon,
                  )}
                >
                  <Icon className="h-3.5 w-3.5" />
                </span>
                <span className="min-w-0">
                  <span className="block text-sm font-semibold">{topic.label}</span>
                  <span className="mt-1 block font-data text-xs tabular-nums text-muted-foreground">
                    {getGroupsByTopic(topic.id).length} 组 / {getFeaturedByTopic(topic.id).length} 条
                  </span>
                </span>
              </span>
              <span className="font-data text-xs tabular-nums text-muted-foreground">
                {String(index + 1).padStart(2, '0')}
              </span>
            </span>
          </button>
        );
      })}
    </div>
  );
}

function SearchPanel({
  query,
  onQueryChange,
  visibleCount,
  tone,
}: {
  query: string;
  onQueryChange: (value: string) => void;
  visibleCount: number;
  tone: TopicTone;
}) {
  return (
    <div
      className={cn(
        'mt-3 rounded-lg border bg-card/45 p-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.05)] transition-colors',
        query ? tone.readerBorder : 'border-border/35',
      )}
    >
      <div className="flex items-center justify-between gap-3">
        <label className="text-xs font-medium text-muted-foreground" htmlFor="frank-highlight-search">
          检索卡片
        </label>
        {query ? (
          <span className={cn('rounded-sm border px-1.5 py-0.5 text-xs font-medium', tone.chip)}>
            {visibleCount} 组匹配
          </span>
        ) : null}
      </div>
      <div className="mt-2 flex min-h-11 items-center gap-2 rounded-md border border-border/45 bg-background/45 px-3 transition focus-within:border-primary/45 focus-within:bg-background/65">
        <Search className={cn('h-4 w-4 shrink-0 transition-colors', query ? tone.text : 'text-muted-foreground')} />
        <input
          id="frank-highlight-search"
          value={query}
          onChange={(event) => onQueryChange(event.target.value)}
          placeholder="搜公司、主题、关键词"
          className="min-w-0 flex-1 bg-transparent text-sm text-foreground outline-none placeholder:text-muted-foreground"
        />
      </div>
    </div>
  );
}

function RetrievalCard({
  groupItem,
  index,
  active,
  tone,
  onSelect,
}: {
  groupItem: FrankFeaturedGroup;
  index: number;
  active: boolean;
  tone: TopicTone;
  onSelect: () => void;
}) {
  const items = getFeaturedItemsForGroup(groupItem);
  const first = items[0];
  const last = items[items.length - 1];
  const dateRange =
    first && last && first.date !== last.date
      ? `${first.date} - ${last.date}`
      : first?.date ?? '待补原文';

  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onSelect}
      style={{ animationDelay: `${Math.min(index, 10) * 35}ms` }}
      className={cn(
        'group relative isolate animate-fade-in-up overflow-hidden rounded-lg border px-4 py-4 text-left shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] transition-all duration-500 ease-[cubic-bezier(0.22,1,0.36,1)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/70 active:scale-[0.99]',
        active
          ? tone.cardActive
          : cn(
              'border-border/30 bg-[linear-gradient(135deg,rgba(255,255,255,0.045),rgba(255,255,255,0.01)_48%,rgba(16,185,129,0.025))] hover:-translate-y-0.5',
              tone.cardHover,
            ),
      )}
    >
      <span
        aria-hidden
        className={cn(
          'absolute inset-y-5 left-0 w-px rounded-r transition-all duration-500',
          active ? tone.line : 'bg-border/45 group-hover:opacity-80',
        )}
      />
      <span
        aria-hidden
        className="absolute bottom-2 right-3 -z-10 font-editorial text-6xl leading-none text-foreground/[0.035] transition-transform duration-500 group-hover:translate-x-0.5 group-hover:text-primary/[0.08]"
      >
        {String(index).padStart(2, '0')}
      </span>

      <div className="flex items-start gap-4">
        <span
          aria-hidden
          className={cn(
            'relative grid h-12 w-12 shrink-0 place-items-center rounded-md border transition-all duration-500 motion-safe:group-hover:rotate-[-1deg] motion-safe:group-hover:scale-[1.03]',
            active
              ? cn(tone.activeIcon, 'shadow-[0_10px_28px_rgba(16,185,129,0.10)]')
              : tone.inactiveIcon,
          )}
        >
          <BookOpenText className="h-5 w-5" strokeWidth={1.6} />
        </span>
        <span className="min-w-0 flex-1 pt-0.5">
          <span className="flex flex-wrap items-center gap-2">
            <span className="font-data text-xs tabular-nums text-muted-foreground">{dateRange}</span>
            <span className={cn('rounded-sm border px-1.5 py-0.5 text-xs font-medium', active ? tone.chip : 'border-border/40 bg-background/35 text-muted-foreground')}>
              {items.length} 条原文
            </span>
            {active ? (
              <span className={cn('rounded-sm border px-1.5 py-0.5 text-xs font-medium', tone.chip)}>
                正在阅读
              </span>
            ) : null}
          </span>
          <span className={cn('mt-2 block font-editorial text-xl leading-snug text-foreground transition-colors duration-300 [text-wrap:balance]', tone.titleHover)}>
            {groupItem.title}
          </span>
          <span className="mt-3 line-clamp-3 block text-sm leading-relaxed text-muted-foreground">
            {groupItem.summary}
          </span>
        </span>
      </div>
      <div className="mt-5 flex flex-wrap items-center gap-1.5 border-t border-border/25 pt-3">
        {(groupItem.tickers ?? []).slice(0, 5).map((ticker) => (
          <span
            key={ticker}
            className={cn(
              'rounded-sm border px-1.5 py-0.5 font-data text-xs tabular-nums',
              active ? tone.chip : 'border-border/45 bg-background/35 text-muted-foreground',
            )}
          >
            {ticker}
          </span>
        ))}
        <span className="ml-auto font-data text-xs tabular-nums text-muted-foreground">
          {items.length} 条
        </span>
      </div>
    </button>
  );
}

function HighlightsReader({
  username,
  groupItem,
  items,
  item,
  topicId,
  tone,
  onSelectItem,
}: {
  username: string;
  groupItem: FrankFeaturedGroup;
  items: FrankFeaturedContent[];
  item: FrankFeaturedContent;
  topicId: FrankHighlightTopicId;
  tone: TopicTone;
  onSelectItem: (item: FrankFeaturedContent) => void;
}) {
  const ids = items.map((entry) => entry.sourceId).filter((id): id is string => Boolean(id));
  const { data, isLoading } = useKolEvidenceTweets(username, ids);
  const activeTweet = item.sourceId ? data?.tweets.find((tweet) => tweet.id === item.sourceId) ?? null : null;
  const paragraphs = splitTweetText(activeTweet?.text ?? '');
  const topic = getTopicSummary(topicId);

  return (
    <section
      id="frank-highlights-reader"
      className={cn(
        'relative h-[calc(100dvh-5rem)] min-h-[34rem] min-w-0 scroll-mt-20 overflow-y-auto overscroll-contain rounded-lg border bg-card/60 shadow-[0_22px_70px_rgba(15,23,42,0.10),inset_0_1px_0_rgba(255,255,255,0.05)] [scrollbar-gutter:stable] xl:h-[calc(100dvh-7rem)] xl:max-h-[58rem]',
        tone.readerBorder,
      )}
    >
      <div aria-hidden className={cn('absolute inset-x-0 top-0 h-px', tone.heroAccent)} />
      <header className="shrink-0 border-b border-border/35 bg-background/25 p-4 md:p-5 lg:p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="max-w-3xl">
            <div className="flex flex-wrap items-center gap-2">
              <span className={cn('inline-flex min-h-7 items-center gap-1.5 rounded-md border px-2 text-xs font-medium', tone.chip)}>
                <span aria-hidden className={cn('h-1.5 w-1.5 rounded-full', tone.dot)} />
                证据链
              </span>
              <p className="font-data text-xs tabular-nums text-muted-foreground">
                {item.date} · {item.topic} · {groupItem.title}
              </p>
            </div>
            <div className="mt-2 flex flex-wrap items-start gap-3">
              <h3 className="min-w-0 font-editorial text-3xl leading-tight text-foreground md:text-4xl">
                {item.title}
              </h3>
              <SourceLink item={item} />
            </div>
            {topic ? (
              <p className="mt-3 max-w-3xl text-sm leading-relaxed text-muted-foreground">
                {topic.principle}
              </p>
            ) : null}
          </div>
        </div>
      </header>

      {items.length > 1 ? (
        <TimelineSwitcher items={items} activeId={item.id} tone={tone} onSelectItem={onSelectItem} />
      ) : null}

      <div className="shrink-0 border-b border-border/35 bg-background/20 p-4 md:p-5 lg:p-6">
        <div className="grid gap-4 xl:grid-cols-2">
          <GuideBlock title="导读：大致观点" tone={tone}>{item.summary}</GuideBlock>
          <GuideBlock title="为什么重要" tone={tone}>{item.whyItMatters}</GuideBlock>
        </div>
      </div>

      <article className="bg-background/40 px-4 py-5 md:px-8 md:py-6 lg:px-10 xl:px-14">
        <div className="mx-auto max-w-[84ch]">
          <OriginalText
            isLoading={isLoading}
            hasSource={Boolean(item.sourceId)}
            paragraphs={paragraphs}
            fallbackSummary={item.summary}
          />
        </div>
      </article>
    </section>
  );
}

function SourceLink({ item }: { item: FrankFeaturedContent }) {
  if (!item.sourceUrl) {
    return (
      <span className="mt-1 inline-flex min-h-9 items-center rounded-md border border-border/45 bg-card/35 px-3 py-1.5 text-xs font-medium text-muted-foreground">
        原文待补
      </span>
    );
  }

  return (
    <Link
      href={item.sourceUrl}
      target="_blank"
      rel="noreferrer"
      aria-label={`打开 ${item.title} 的 X 原文`}
      className="mt-1 inline-flex min-h-9 shrink-0 items-center gap-2 rounded-md border border-border/45 bg-card/45 px-3 py-1.5 text-xs font-medium text-foreground transition hover:border-primary/45 hover:bg-primary/10 hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/70"
    >
      <XLogo />
      <span>原文</span>
      <ArrowUpRight className="h-3.5 w-3.5" />
    </Link>
  );
}

function TimelineSwitcher({
  items,
  activeId,
  tone,
  onSelectItem,
}: {
  items: FrankFeaturedContent[];
  activeId: string;
  tone: TopicTone;
  onSelectItem: (item: FrankFeaturedContent) => void;
}) {
  return (
    <div className="shrink-0 border-b border-border/35 bg-background/15 p-4 md:p-5 lg:p-6">
      <div className="flex flex-wrap gap-2">
        {items.map((entry, index) => {
          const active = activeId === entry.id;
          return (
            <button
              key={entry.id}
              type="button"
              aria-pressed={active}
              onClick={() => onSelectItem(entry)}
              className={cn(
                'inline-flex min-h-10 max-w-full items-center gap-2 rounded-md border px-3 py-2 text-left transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/70 motion-safe:hover:-translate-y-0.5',
                active
                  ? tone.timelineActive
                  : cn('border-border/35 bg-card/25 text-muted-foreground', tone.timelineHover),
              )}
            >
              <span className="font-data text-xs tabular-nums">{String(index + 1).padStart(2, '0')}</span>
              <span className="font-data text-xs tabular-nums">{entry.date}</span>
              <span className="max-w-[18rem] truncate text-sm font-medium">{entry.title}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function XLogo() {
  return (
    <span
      aria-hidden
      className="grid h-5 w-5 place-items-center rounded-sm bg-foreground font-data text-[11px] font-semibold leading-none text-background"
    >
      X
    </span>
  );
}

function GuideBlock({
  title,
  tone,
  children,
}: {
  title: string;
  tone: TopicTone;
  children: string;
}) {
  return (
    <section className={cn('relative isolate overflow-hidden rounded-lg border p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] transition-colors', tone.guide)}>
      <p className={cn('flex items-center gap-2 text-xs font-medium', tone.text)}>
        <span aria-hidden className={cn('h-1.5 w-1.5 rounded-full', tone.dot)} />
        {title}
      </p>
      <p className="mt-2 text-sm leading-relaxed text-foreground">{children}</p>
    </section>
  );
}

function OriginalText({
  isLoading,
  hasSource,
  paragraphs,
  fallbackSummary,
}: {
  isLoading: boolean;
  hasSource: boolean;
  paragraphs: string[];
  fallbackSummary: string;
}) {
  if (isLoading) {
    return <ReaderSkeleton />;
  }

  if (paragraphs.length) {
    return (
      <div className="mt-5 space-y-5 text-base leading-8 text-foreground md:text-lg md:leading-9">
        {paragraphs.map((paragraph, index) => (
          <p
            key={`${index}-${paragraph.slice(0, 12)}`}
            className={`whitespace-pre-wrap break-words [overflow-wrap:anywhere] ${
              index === 0 ? 'text-lg leading-9 text-foreground md:text-xl md:leading-10' : ''
            }`}
          >
            <LinkedText text={paragraph} />
          </p>
        ))}
      </div>
    );
  }

  return (
    <div className="mt-5 rounded-sm border border-dashed border-border/55 bg-card/20 px-4 py-6 text-sm leading-relaxed text-muted-foreground">
      {hasSource
        ? '这条原文还没有命中站内索引，先保留外部原文链接和上方导读。'
        : '这条内容已在 qinbafrank 反馈中点名，但原文链接待补齐。'}
      <p className="mt-3 text-foreground">{fallbackSummary}</p>
    </div>
  );
}

function LinkedText({ text }: { text: string }) {
  const parts = splitTextWithUrls(text);
  return (
    <>
      {parts.map((part, index) =>
        part.type === 'url' ? (
          <a
            key={`${part.value}-${index}`}
            href={part.value}
            target="_blank"
            rel="noreferrer"
            className="font-medium text-primary underline decoration-primary/35 underline-offset-4 transition hover:decoration-primary"
          >
            {part.value}
          </a>
        ) : (
          <span key={`${index}-${part.value.slice(0, 10)}`}>{part.value}</span>
        ),
      )}
    </>
  );
}

function splitTextWithUrls(text: string) {
  const urlPattern = /https?:\/\/[A-Za-z0-9\-._~:/?#[\]@!$&()*+,;=%]+/g;
  const parts: Array<{ type: 'text' | 'url'; value: string }> = [];
  let lastIndex = 0;
  for (const match of text.matchAll(urlPattern)) {
    const rawUrl = match[0];
    const index = match.index ?? 0;
    if (index > lastIndex) {
      parts.push({ type: 'text', value: text.slice(lastIndex, index) });
    }

    const trimmedUrl = rawUrl.replace(/[),.，。；;：:!?！？、）】》]+$/u, '');
    const trailing = rawUrl.slice(trimmedUrl.length);
    if (trimmedUrl) {
      parts.push({ type: 'url', value: trimmedUrl });
    }
    if (trailing) {
      parts.push({ type: 'text', value: trailing });
    }
    lastIndex = index + rawUrl.length;
  }

  if (lastIndex < text.length) {
    parts.push({ type: 'text', value: text.slice(lastIndex) });
  }
  return parts.length ? parts : [{ type: 'text' as const, value: text }];
}

function ReaderSkeleton() {
  return (
    <div className="mt-5 space-y-4">
      <div className="h-3 w-36 rounded bg-muted/40" />
      <div className="space-y-2">
        <div className="h-4 w-full rounded bg-muted/35" />
        <div className="h-4 w-[92%] rounded bg-muted/30" />
        <div className="h-4 w-[76%] rounded bg-muted/25" />
      </div>
      <div className="space-y-2 pt-2">
        <div className="h-4 w-[96%] rounded bg-muted/30" />
        <div className="h-4 w-[82%] rounded bg-muted/25" />
      </div>
    </div>
  );
}

function splitTweetText(text: string) {
  return text
    .split(/\n{2,}|\r\n{2,}/)
    .map((part) => part.trim())
    .filter(Boolean);
}
