'use client';

import Link from 'next/link';
import {
  Activity,
  ArrowUpRight,
  Compass,
  Landmark,
  LineChart,
  Search,
} from 'lucide-react';
import { useMemo, useState, type ReactNode } from 'react';

import type {
  EconomicFundamentalsResponse,
  GlobalLiquidityMetrics,
  KolCockpitFeedItem,
  KolCockpitTweet,
  KolSectorDetail,
  KolSectorRuleItem,
  LiquidityMetric,
  LiquidityMetrics,
  RiskIndicator,
} from '@/lib/api';
import { useLiquidityMetrics, useGlobalLiquidity } from '@/hooks/queries/use-liquidity-data';
import { useKolCockpitFeed } from '@/hooks/queries/use-kol-data';
import {
  useEconomicFundamentals,
  useInflationRates,
  useMarketSentiment,
  useTreasuryCommodities,
} from '@/hooks/queries/use-macro-data';
import { formatLiquidityValue } from '@/app/macro/liquidity/liquidity-metrics';

interface Props {
  detail: KolSectorDetail;
  username: string;
}

type Tone = 'supportive' | 'watch' | 'stress' | 'neutral';

interface IndicatorCardData {
  key: string;
  label: string;
  value: string;
  date?: string | null;
  tone: Tone;
  status: string;
  frankRead: string;
  source: string;
  change?: string | null;
}

interface IndicatorGroup {
  id: string;
  items: IndicatorCardData[];
}

interface MacroPillarConfig {
  id: string;
  eyebrow: string;
  title: string;
  thesis: string;
  question: string;
  method: string[];
  indicatorKeys: string[];
  evidenceTerms: string[];
  tone: Tone;
  icon: ReactNode;
}

interface MacroPillar extends MacroPillarConfig {
  signals: string[];
  indicators: IndicatorCardData[];
  ruleItems: MacroRuleRef[];
  evidenceTweets: KolCockpitTweet[];
}

interface MacroRuleRef {
  section: string;
  item: KolSectorRuleItem;
}

const MACRO_PILLAR_CONFIGS: MacroPillarConfig[] = [
  {
    id: 'liquidity',
    eyebrow: 'Liquidity Regime',
    title: '流动性体制',
    thesis: '先判断市场里的水位是否从“偏紧”升级成“钱荒”。',
    question: '准备金、TGA、RRP、SOFR 有没有形成同方向压力？',
    method: ['准备金 3.0T / 3.2T 阈值', 'TGA 是否抽水', 'SOFR-EFFR 是否走阔'],
    indicatorKeys: ['net-liquidity', 'reserves', 'tga', 'rrp', 'sofr-effr'],
    evidenceTerms: ['准备金', 'TGA', 'RRP', 'SOFR', '钱荒', '流动性'],
    tone: 'watch',
    icon: <Activity className="h-4 w-4" />,
  },
  {
    id: 'policy',
    eyebrow: 'Policy Economy',
    title: '政策经济学',
    thesis: '不只看 Fed，还看财政、关税、政治约束如何改变市场预期。',
    question: '政策主张能不能落地？市场定价的是口号还是节奏？',
    method: ['政策三人组', '关税 / TACO 边界', '财政与中期选举约束'],
    indicatorKeys: ['10y', 'inflation', 'yield-curve'],
    evidenceTerms: ['政策三人组', '贝森特', '沃什', '关税', 'TACO', '中期选举', '国家安全战略'],
    tone: 'neutral',
    icon: <Landmark className="h-4 w-4" />,
  },
  {
    id: 'inflation',
    eyebrow: 'Inflation & Jobs',
    title: '通胀就业',
    thesis: '通胀决定宽松空间，就业拆分决定软着陆叙事是否站得住。',
    question: 'CPI / PCE 是否连续超预期？非农强弱来自哪里？',
    method: ['核心 CPI / PCE', '非农行业拆分', 'GDP 与软着陆叙事'],
    indicatorKeys: ['inflation', '10y', 'yield-curve'],
    evidenceTerms: ['CPI', 'PCE', '通胀', '非农', '就业', 'GDP', '降息'],
    tone: 'supportive',
    icon: <LineChart className="h-4 w-4" />,
  },
  {
    id: 'geopolitics',
    eyebrow: 'Geopolitics & Structure',
    title: '地缘与市场结构',
    thesis: '单点地缘不是结论，只有传导到能源、信用或流动性才升级。',
    question: '冲突是否影响咽喉？市场结构是否已经无对冲、过拥挤？',
    method: ['霍尔木兹 / OPEC+', 'VIX 与信用利差', '日元套息与资产 MEME 化'],
    indicatorKeys: ['vix', 'hy-oas', 'usdjpy', 'global-liquidity', 'fear-greed'],
    evidenceTerms: ['霍尔木兹', '伊朗', 'OPEC', 'VIX', '日元', 'COT', 'MEME', '地缘'],
    tone: 'stress',
    icon: <Compass className="h-4 w-4" />,
  },
];

const toneText: Record<Tone, string> = {
  supportive: 'text-primary',
  watch: 'text-amber-500',
  stress: 'text-destructive',
  neutral: 'text-muted-foreground',
};

const toneBg: Record<Tone, string> = {
  supportive: 'bg-primary/10 border-primary/25',
  watch: 'bg-amber-500/10 border-amber-500/25',
  stress: 'bg-destructive/10 border-destructive/25',
  neutral: 'bg-muted/30 border-border/50',
};

const toneDot: Record<Tone, string> = {
  supportive: 'bg-primary',
  watch: 'bg-amber-500',
  stress: 'bg-destructive',
  neutral: 'bg-muted-foreground',
};

const toneBar: Record<Tone, string> = {
  supportive: 'bg-primary',
  watch: 'bg-amber-500',
  stress: 'bg-destructive',
  neutral: 'bg-muted-foreground',
};

export default function MacroRegimeFramework({ detail, username }: Props) {
  const { data: liquidityRes, isLoading: liquidityLoading } = useLiquidityMetrics();
  const { data: globalLiquidityRes, isLoading: globalLoading } = useGlobalLiquidity();
  const { data: economyRes, isLoading: economyLoading } = useEconomicFundamentals();
  const { data: inflationRes, isLoading: inflationLoading } = useInflationRates();
  const { data: sentimentRes, isLoading: sentimentLoading } = useMarketSentiment();
  const { data: treasuryRes, isLoading: treasuryLoading } = useTreasuryCommodities();
  const { data: macroFeedRes } = useKolCockpitFeed(username, {
    limit: 80,
    sector: 'macro',
  });

  const metrics = liquidityRes?.success ? liquidityRes.metrics : null;
  const globalMetrics = globalLiquidityRes?.success ? globalLiquidityRes.data : null;
  const economy = economyRes?.success ? economyRes : null;
  const inflation = inflationRes?.success ? inflationRes : null;
  const sentiment = sentimentRes?.success ? sentimentRes : null;
  const treasury = treasuryRes?.success ? treasuryRes : null;
  const loading =
    liquidityLoading ||
    globalLoading ||
    economyLoading ||
    inflationLoading ||
    sentimentLoading ||
    treasuryLoading;

  const indicatorGroups = buildIndicatorGroups({
    metrics,
    globalMetrics,
    economy,
    inflation,
    sentiment,
    tenYear: treasury?.treasury.rates['10Y']?.rate ?? null,
  });
  const macroPillars = buildMacroPillars(indicatorGroups, detail);
  const macroFeedTweets = useMemo(
    () => (macroFeedRes?.tweets ?? []).map(feedItemToTweet),
    [macroFeedRes?.tweets],
  );

  return (
    <div className="pb-10">
      <MacroPillarAtlas
        pillars={macroPillars}
        username={username}
        feedTweets={macroFeedTweets}
        loading={loading}
      />
    </div>
  );
}

function MacroPillarAtlas({
  pillars,
  username,
  feedTweets,
  loading,
}: {
  pillars: MacroPillar[];
  username: string;
  feedTweets: KolCockpitTweet[];
  loading: boolean;
}) {
  const [activeId, setActiveId] = useState(pillars[0]?.id ?? 'liquidity');
  const [query, setQuery] = useState('');
  const activePillar = pillars.find((pillar) => pillar.id === activeId) ?? pillars[0];

  if (!activePillar) return null;

  return (
    <section className="mt-6">
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground">
            4 个宏观主题
          </p>
          <h3 className="mt-1 text-xl font-semibold tracking-tight text-foreground">
            选择一个主题
          </h3>
        </div>
        <p className="max-w-xl text-sm leading-relaxed text-muted-foreground">
          切换主题后，下方同步更新数据、判断规则和原文检索。
        </p>
      </div>

      <div className="grid gap-4 xl:grid-cols-[300px_minmax(0,1fr)] 2xl:grid-cols-[320px_minmax(0,1fr)]">
        <div className="grid grid-cols-2 gap-2 sm:gap-3 xl:grid-cols-1 xl:auto-rows-max xl:content-start">
          {pillars.map((pillar) => (
            <MacroPillarCard
              key={pillar.id}
              pillar={pillar}
              active={pillar.id === activePillar.id}
              onSelect={() => {
                setActiveId(pillar.id);
                setQuery('');
              }}
            />
          ))}
        </div>
        <MacroPillarDeepDive
          pillar={activePillar}
          username={username}
          feedTweets={feedTweets}
          query={query}
          onQueryChange={setQuery}
          loading={loading}
        />
      </div>
    </section>
  );
}

function MacroPillarCard({
  pillar,
  active,
  onSelect,
}: {
  pillar: MacroPillar;
  active: boolean;
  onSelect: () => void;
}) {
  const primaryIndicator = pillar.indicators.find((indicator) => indicator.value !== 'N/A');
  const evidenceCount = uniqueTweets([
    ...pillar.evidenceTweets,
    ...pillar.ruleItems.flatMap((rule) => rule.item.evidence),
  ]).length;

  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={active}
      aria-label={`${pillar.title}，${Math.max(evidenceCount, pillar.evidenceTweets.length)} 条原文，当前读数 ${primaryIndicator ? primaryIndicator.value : 'N/A'}`}
      className={`group min-h-32 w-full rounded-lg border p-3 text-left transition-[border-color,background-color,transform] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 motion-safe:hover:-translate-y-0.5 sm:min-h-36 sm:p-4 xl:min-h-0 ${
        active ? toneBg[pillar.tone] : 'border-border/45 bg-card/20 hover:border-primary/30 hover:bg-primary/[0.035]'
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="hidden truncate text-xs font-medium uppercase tracking-[0.16em] text-muted-foreground sm:block">
            {pillar.eyebrow}
          </p>
          <h4 className={`text-base font-semibold tracking-tight sm:mt-1 sm:text-lg ${active ? toneText[pillar.tone] : 'text-foreground'}`}>
            {pillar.title}
          </h4>
        </div>
        <span className={`grid h-8 w-8 shrink-0 place-items-center rounded-md border sm:h-9 sm:w-9 ${toneBg[pillar.tone]} ${toneText[pillar.tone]}`}>
          {pillar.icon}
        </span>
      </div>

      <p className="mt-2 hidden text-sm leading-relaxed text-foreground sm:line-clamp-2 sm:block">
        {pillar.thesis}
      </p>

      <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-border/30 pt-3 text-xs font-medium text-muted-foreground">
        <span>
          <span className="font-data tabular-nums text-foreground">
            {Math.max(evidenceCount, pillar.evidenceTweets.length)}
          </span>{' '}
          条原文
        </span>
        <span className="min-w-0 truncate">
          读数{' '}
          <span className={`font-data tabular-nums ${primaryIndicator ? toneText[primaryIndicator.tone] : 'text-muted-foreground'}`}>
            {primaryIndicator ? primaryIndicator.value : 'N/A'}
          </span>
        </span>
      </div>
    </button>
  );
}

function MacroPillarDeepDive({
  pillar,
  username,
  feedTweets,
  query,
  onQueryChange,
  loading,
}: {
  pillar: MacroPillar;
  username: string;
  feedTweets: KolCockpitTweet[];
  query: string;
  onQueryChange: (value: string) => void;
  loading: boolean;
}) {
  const allTweets = collectPillarTweets(pillar, feedTweets);
  const filteredRules = filterPillarRules(pillar, query);
  const filteredTweets = filterTweets(allTweets, query).slice(0, 8);
  const summaryItems = getSummaryItems(pillar, filteredRules).slice(0, 5);
  const chips = getSearchChips(pillar);
  const chatHref =
    `/research?agent=kol&persona=${encodeURIComponent(username)}` +
    `&q=${encodeURIComponent(`按 qinbafrank 的宏观框架解释${pillar.title}：重点看哪些数据、现在怎么判断、有哪些原文依据。`)}`;

  return (
    <article className="overflow-hidden rounded-lg border border-border/45 bg-card/20">
      <div className={`h-1 ${toneBar[pillar.tone]}`} />
      <div className="border-b border-border/35 p-4 md:p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0 max-w-3xl">
            <p className="text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground">
              {pillar.eyebrow}
            </p>
            <h4 className="mt-1 text-2xl font-semibold tracking-tight text-foreground">
              {pillar.title}
            </h4>
            <p className="mt-2 text-sm leading-relaxed text-foreground">
              {pillar.thesis}
            </p>
          </div>
          <Link
            href={chatHref}
            className="inline-flex min-h-11 w-full shrink-0 items-center justify-center gap-1.5 rounded-md border border-primary/30 bg-primary/10 px-3 py-2 text-sm font-medium text-primary transition hover:border-primary hover:bg-primary/15 sm:w-auto"
          >
            追问这个主题
            <ArrowUpRight className="h-4 w-4" />
          </Link>
        </div>
      </div>

      <div className="grid gap-5 p-4 md:p-5 xl:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)]">
        <section className="min-w-0">
          <SectionTitle label="看什么数据" />
          {pillar.indicators.length > 0 ? (
            <div className="mt-3 divide-y divide-border/35">
              {pillar.indicators.map((indicator) => (
                <MacroIndicatorRow key={indicator.key} item={indicator} />
              ))}
            </div>
          ) : loading ? (
            <EmptyEvidenceState text="正在读取宏观指标..." />
          ) : (
            <EmptyEvidenceState text="这个主题暂时没有对应的实时指标。" />
          )}
        </section>

        <section className="min-w-0 border-t border-border/35 pt-5 xl:border-l xl:border-t-0 xl:pl-5 xl:pt-0">
          <SectionTitle label="怎么判断" />
          <p className="mt-3 text-sm leading-relaxed text-foreground">
            核心问题：{pillar.question}
          </p>
          <ol className="mt-3 space-y-2">
            {pillar.method.map((item, index) => (
              <li
                key={item}
                className="grid grid-cols-[1.5rem_minmax(0,1fr)] gap-2 text-sm leading-relaxed text-foreground"
              >
                <span className="font-data text-xs tabular-nums text-primary">{index + 1}</span>
                <span>{item}</span>
              </li>
            ))}
          </ol>
        </section>
      </div>

      <section className="border-t border-border/35 p-4 md:p-5">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <SectionTitle label="历史观点检索" />
            <p className="mt-1 text-sm text-muted-foreground" aria-live="polite">
              命中 {summaryItems.length} 条观点摘要、{filteredTweets.length} 条原文。
            </p>
          </div>
          <div className="w-full sm:w-80">
            <label className="sr-only" htmlFor={`macro-search-${pillar.id}`}>
              搜索历史观点
            </label>
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <input
                id={`macro-search-${pillar.id}`}
                value={query}
                onChange={(event) => onQueryChange(event.target.value)}
                placeholder="搜 TGA、CPI、就业、关税..."
                className="h-11 w-full rounded-md border border-border/50 bg-card/40 pl-9 pr-3 text-sm text-foreground outline-none transition placeholder:text-muted-foreground focus:border-primary/50"
              />
            </div>
          </div>
        </div>

        <div className="mt-3 flex flex-wrap gap-1.5">
          {chips.map((chip) => (
            <button
              key={chip}
              type="button"
              onClick={() => onQueryChange(chip)}
              className={`min-h-11 rounded-md border px-3 py-1.5 text-sm font-medium transition ${
                query === chip
                  ? 'border-primary/40 bg-primary/10 text-primary'
                  : 'border-border/45 text-muted-foreground hover:border-primary/35 hover:text-primary'
              }`}
            >
              {chip}
            </button>
          ))}
          {query ? (
            <button
              type="button"
              onClick={() => onQueryChange('')}
              className="min-h-11 rounded-md border border-border/45 px-3 py-1.5 text-sm font-medium text-muted-foreground transition hover:border-primary/35 hover:text-primary"
            >
              清空
            </button>
          ) : null}
        </div>

        <div className="mt-4 grid gap-5 xl:grid-cols-[minmax(0,0.86fr)_minmax(0,1.14fr)]">
          <div className="min-w-0">
            <p className="text-sm font-medium text-foreground">观点摘要</p>
            {summaryItems.length > 0 ? (
              <ul className="mt-3 space-y-2">
                {summaryItems.map((item, index) => (
                  <li key={`${item}-${index}`} className="grid grid-cols-[1rem_minmax(0,1fr)] gap-2 text-sm leading-relaxed text-foreground">
                    <span className={`mt-2 h-1.5 w-1.5 rounded-full ${toneDot[pillar.tone]}`} />
                    <span>{stripLeadingMarker(item)}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <EmptyEvidenceState text="没有命中这组关键词，换一个主题词试试。" />
            )}
          </div>

          <div className="min-w-0">
            <p className="text-sm font-medium text-foreground">原文</p>
            {filteredTweets.length > 0 ? (
              <div className="mt-3 divide-y divide-border/35">
                {filteredTweets.map((tweet) => (
                  <MacroTweetExcerpt key={tweet.id} tweet={tweet} />
                ))}
              </div>
            ) : (
              <EmptyEvidenceState text="这组关键词暂时没有对应原文。" />
            )}
          </div>
        </div>
      </section>
    </article>
  );
}

function SectionTitle({ label }: { label: string }) {
  return <h5 className="text-sm font-semibold tracking-tight text-foreground">{label}</h5>;
}

function MacroIndicatorRow({ item }: { item: IndicatorCardData }) {
  return (
    <div className="py-3 first:pt-0 last:pb-0">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <p className="text-sm font-medium text-foreground">{item.label}</p>
          <p className="mt-0.5 text-xs font-medium uppercase tracking-[0.12em] text-muted-foreground">
            {item.source}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <p className="font-data text-base font-semibold tabular-nums text-foreground">
            {item.value}
          </p>
          <span
            className={`inline-flex items-center gap-1.5 rounded-md border border-current/20 px-2 py-1 text-xs font-medium ${toneText[item.tone]}`}
          >
            <span className={`h-1.5 w-1.5 rounded-full ${toneDot[item.tone]}`} />
            {item.status}
          </span>
        </div>
      </div>
      <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
        {item.frankRead}
      </p>
    </div>
  );
}

function EmptyEvidenceState({ text }: { text: string }) {
  return (
    <div className="mt-3 rounded-md border border-border/40 bg-background/25 p-4 text-center text-sm text-muted-foreground">
      {text}
    </div>
  );
}

function MacroTweetExcerpt({ tweet }: { tweet: KolCockpitTweet }) {
  return (
    <article className="py-3 first:pt-0 last:pb-0">
      <div className="flex flex-wrap items-center gap-2 text-xs font-medium uppercase tracking-[0.14em] text-muted-foreground">
        <time dateTime={tweet.created_at ?? undefined}>{formatDateSafe(tweet.created_at)}</time>
        <span>
          <span className="font-data tabular-nums">{formatNumber(tweet.like_count)}</span> 赞
        </span>
        {tweet.url ? (
          <a
            href={tweet.url}
            target="_blank"
            rel="noopener noreferrer"
            className="ml-auto inline-flex min-h-11 items-center gap-1 rounded-md px-2 text-muted-foreground transition hover:bg-primary/10 hover:text-primary"
          >
            看原文
            <ArrowUpRight className="h-3 w-3" />
          </a>
        ) : null}
      </div>
      <p className="mt-2 line-clamp-4 whitespace-pre-wrap text-sm leading-relaxed text-foreground">
        {tweet.text}
      </p>
    </article>
  );
}

function buildMacroPillars(
  groups: IndicatorGroup[],
  detail: KolSectorDetail,
): MacroPillar[] {
  const indicatorByKey = new Map<string, IndicatorCardData>();
  groups.forEach((group) => {
    group.items.forEach((item) => {
      indicatorByKey.set(item.key, item);
    });
  });

  return MACRO_PILLAR_CONFIGS.map((config) => ({
    ...config,
    indicators: config.indicatorKeys
      .map((key) => indicatorByKey.get(key))
      .filter((item): item is IndicatorCardData => Boolean(item)),
    signals: pickRuleTexts(detail.signals, config.evidenceTerms, 3),
    ruleItems: collectRuleItems(detail, config.evidenceTerms),
    evidenceTweets: collectEvidenceTweets(detail, config.evidenceTerms),
  }));
}

function collectRuleItems(
  detail: KolSectorDetail,
  terms: string[],
): MacroRuleRef[] {
  const sections: Array<{
    section: string;
    items: KolSectorRuleItem[];
  }> = [
    {
      section: '追问',
      items: detail.core_questions,
    },
    {
      section: '指标',
      items: detail.signals,
    },
    {
      section: '看多',
      items: detail.bull_conditions,
    },
    {
      section: '风险',
      items: detail.bear_triggers,
    },
    {
      section: '边界',
      items: detail.veto,
    },
    {
      section: '打脸',
      items: detail.falsifiers,
    },
    {
      section: '误读',
      items: detail.misreadings,
    },
  ];

  const matched = sections.flatMap((section) =>
    section.items
      .filter((item) => ruleMatchesTerms(item, terms))
      .map((item) => ({
        section: section.section,
        item,
      })),
  );

  if (matched.length > 0) return matched;

  return sections.flatMap((section) =>
    section.items.slice(0, 2).map((item) => ({
      section: section.section,
      item,
    })),
  );
}

function collectEvidenceTweets(
  detail: KolSectorDetail,
  terms: string[],
): KolCockpitTweet[] {
  const ruleEvidence = collectRuleItems(detail, terms).flatMap((rule) => rule.item.evidence);
  const representative = detail.rep_tweets.filter((tweet) => textMatchesTerms(tweet.text, terms));
  return uniqueTweets([...representative, ...ruleEvidence]);
}

function collectPillarTweets(
  pillar: MacroPillar,
  feedTweets: KolCockpitTweet[],
): KolCockpitTweet[] {
  const fromRules = pillar.ruleItems.flatMap((rule) => rule.item.evidence);
  const fromFeed = feedTweets.filter((tweet) => textMatchesTerms(tweet.text, getFeedTerms(pillar)));
  return uniqueTweets([...pillar.evidenceTweets, ...fromRules, ...fromFeed]);
}

function filterPillarRules(
  pillar: MacroPillar,
  query: string,
): MacroRuleRef[] {
  const trimmed = query.trim();
  if (!trimmed) return pillar.ruleItems;
  return pillar.ruleItems.filter((rule) =>
    textMatchesQuery(
      [
        rule.section,
        rule.item.text,
        ...rule.item.evidence.map((tweet) => tweet.text),
      ].join('\n'),
      trimmed,
    ),
  );
}

function filterTweets(
  tweets: KolCockpitTweet[],
  query: string,
): KolCockpitTweet[] {
  const trimmed = query.trim();
  if (!trimmed) return tweets;
  return tweets.filter((tweet) => textMatchesQuery(tweet.text, trimmed));
}

function getSummaryItems(pillar: MacroPillar, rules: MacroRuleRef[]): string[] {
  const items = [
    ...rules.map((rule) => rule.item.text),
    ...pillar.signals,
    ...pillar.method,
  ];
  return Array.from(new Set(items.map(stripLeadingMarker).filter(Boolean)));
}

function getSearchChips(pillar: MacroPillar): string[] {
  const defaults: Record<string, string[]> = {
    liquidity: ['准备金', 'TGA', 'RRP', 'SOFR', '钱荒'],
    policy: ['关税', 'TACO', '财政', '中期选举', '沃什'],
    inflation: ['CPI', 'PCE', '非农', '就业', '降息'],
    geopolitics: ['霍尔木兹', 'VIX', '日元', 'OPEC', 'MEME'],
  };
  return defaults[pillar.id] ?? pillar.evidenceTerms.slice(0, 5);
}

function getFeedTerms(pillar: MacroPillar): string[] {
  const terms: Record<string, string[]> = {
    liquidity: ['准备金', 'TGA', 'RRP', 'SOFR', 'SRF', '钱荒', '缩表', 'H.4.1'],
    policy: ['贝森特', '沃什', '关税', 'TACO', '中期选举', '政策三人组', '国家安全战略'],
    inflation: ['CPI', 'PCE', '通胀', '非农', '就业', 'GDP', '降息'],
    geopolitics: ['霍尔木兹', '伊朗', 'OPEC', 'VIX', '日元', 'COT', 'MEME'],
  };
  return terms[pillar.id] ?? pillar.evidenceTerms;
}

function ruleMatchesTerms(rule: KolSectorRuleItem, terms: string[]): boolean {
  return textMatchesTerms(rule.text, terms);
}

function textMatchesQuery(text: string, query: string): boolean {
  const haystack = text.toLowerCase();
  return query
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .every((term) => haystack.includes(term));
}

function uniqueTweets(tweets: KolCockpitTweet[]): KolCockpitTweet[] {
  const seen = new Set<string>();
  const out: KolCockpitTweet[] = [];
  for (const tweet of tweets) {
    if (seen.has(tweet.id)) continue;
    seen.add(tweet.id);
    out.push(tweet);
  }
  return out.sort((a, b) => {
    const aTime = a.created_at ? new Date(a.created_at).getTime() : 0;
    const bTime = b.created_at ? new Date(b.created_at).getTime() : 0;
    return bTime - aTime;
  });
}

function feedItemToTweet(item: KolCockpitFeedItem): KolCockpitTweet {
  return {
    id: item.id,
    text: item.text,
    created_at: item.created_at,
    url: item.url,
    like_count: item.like_count,
    retweet_count: item.retweet_count,
    reply_count: item.reply_count,
    tweet_type: item.tweet_type,
    tickers: item.tickers,
    reply_kind: item.reply_kind,
  };
}

function pickRuleTexts(
  rules: KolSectorDetail['signals'],
  terms: string[],
  limit: number,
): string[] {
  const matches = rules
    .map((rule) => rule.text)
    .filter((text) => textMatchesTerms(text, terms));
  return matches.slice(0, limit);
}

function textMatchesTerms(text: string, terms: string[]): boolean {
  const lower = text.toLowerCase();
  return terms.some((term) => lower.includes(term.toLowerCase()));
}

function buildIndicatorGroups({
  metrics,
  globalMetrics,
  economy,
  inflation,
  sentiment,
  tenYear,
}: {
  metrics: LiquidityMetrics | null;
  globalMetrics: GlobalLiquidityMetrics | null;
  economy: EconomicFundamentalsResponse | null;
  inflation: EconomicFundamentalsResponse | null;
  sentiment: EconomicFundamentalsResponse | null;
  tenYear: number | null;
}): IndicatorGroup[] {
  const hyOas = findIndicator(economy, 'BAMLH0A0HYM2');
  const yieldCurve = findIndicator(economy, 'T10Y2Y');
  const cpi = findIndicator(inflation, 'CPIAUCSL');
  const corePce = findIndicator(inflation, 'PCEPILFE');
  const vix = findIndicator(sentiment, 'VIX');
  const fearGreed = sentiment?.data.sub_dimensions.find((dim) => dim.name === 'cnn_indicators')?.score;

  return [
    {
      id: 'liquidity-core',
      items: [
        reservesCard(metrics?.reserves ?? null),
        tgaCard(metrics?.tga ?? null),
        rrpCard(metrics?.rrp ?? null),
        netLiquidityCard(metrics?.net_liquidity ?? null),
      ],
    },
    {
      id: 'funding-stress',
      items: [
        fundingSpreadCard(metrics?.sofr ?? null, metrics?.effr ?? null),
        nfciCard(metrics?.nfci ?? null),
      ],
    },
    {
      id: 'valuation-policy',
      items: [
        tenYearCard(tenYear),
        inflationCard(cpi, corePce),
        yieldCurveCard(yieldCurve),
      ],
    },
    {
      id: 'systemic-risk',
      items: [
        creditCard(hyOas),
        vixCard(vix),
        fearGreedCard(fearGreed ?? null),
        globalLiquidityCard(globalMetrics?.global_liquidity.value ?? null, globalMetrics?.global_liquidity.date ?? null),
        usdJpyCard(globalMetrics?.fx_rates?.usdjpy ?? null),
      ],
    },
  ];
}

function reservesCard(metric: LiquidityMetric | null): IndicatorCardData {
  const value = valueToBillions(metric);
  let tone: Tone = 'neutral';
  let status = '无数据';
  if (value != null) {
    if (value >= 3200) {
      tone = 'supportive';
      status = '充裕';
    } else if (value >= 3000) {
      tone = 'watch';
      status = '临界';
    } else {
      tone = 'stress';
      status = '紧张';
    }
  }
  return {
    key: 'reserves',
    label: '银行准备金',
    value: metric ? formatLiquidityValue(metric.value, metric.units) : 'N/A',
    date: metric?.date,
    tone,
    status,
    source: 'WRESBAL',
    change: formatMetricChange(metric),
    frankRead: '3.0T 附近是充裕到紧张的分界；重新回到 3.2T 以上，才更像过剩流动性。',
  };
}

function tgaCard(metric: LiquidityMetric | null): IndicatorCardData {
  const value = valueToBillions(metric);
  let tone: Tone = 'neutral';
  let status = '无数据';
  if (value != null) {
    if (value >= 1000) {
      tone = 'stress';
      status = '抽水';
    } else if (value >= 700) {
      tone = 'watch';
      status = '偏高';
    } else {
      tone = 'supportive';
      status = '释放';
    }
  }
  return {
    key: 'tga',
    label: 'TGA 财政部账户',
    value: metric ? formatLiquidityValue(metric.value, metric.units) : 'N/A',
    date: metric?.date,
    tone,
    status,
    source: 'WDTGAL',
    change: formatMetricChange(metric),
    frankRead: 'TGA 上升相当于财政部从市场抽水；下降则把现金重新释放回银行体系。',
  };
}

function rrpCard(metric: LiquidityMetric | null): IndicatorCardData {
  const value = valueToBillions(metric);
  let tone: Tone = 'neutral';
  let status = '无数据';
  if (value != null) {
    if (value < 50) {
      tone = 'stress';
      status = '缓冲少';
    } else if (value < 250) {
      tone = 'watch';
      status = '接近耗尽';
    } else {
      tone = 'supportive';
      status = '有缓冲';
    }
  }
  return {
    key: 'rrp',
    label: 'ON RRP 缓冲垫',
    value: metric ? formatLiquidityValue(metric.value, metric.units) : 'N/A',
    date: metric?.date,
    tone,
    status,
    source: 'RRPONTSYD',
    change: formatMetricChange(metric),
    frankRead: 'RRP 接近 0 说明 QT 的缓冲垫被消耗，之后准备金压力会更直接地传导。',
  };
}

function netLiquidityCard(metric: LiquidityMetric | null): IndicatorCardData {
  const change = metric?.change;
  let tone: Tone = 'neutral';
  let status = '无数据';
  if (change != null) {
    if (change > 0) {
      tone = 'supportive';
      status = '回升';
    } else if (change > -1) {
      tone = 'watch';
      status = '走平';
    } else {
      tone = 'stress';
      status = '收缩';
    }
  }
  return {
    key: 'net-liquidity',
    label: '净流动性',
    value: metric ? formatLiquidityValue(metric.value, metric.units) : 'N/A',
    date: metric?.date,
    tone,
    status,
    source: 'WALCL - TGA - RRP',
    change: formatMetricChange(metric),
    frankRead: '这是宏观水位的总账。趋势比单点更重要，连续回升会削弱宏观逆风。',
  };
}

function fundingSpreadCard(sofr: LiquidityMetric | null, effr: LiquidityMetric | null): IndicatorCardData {
  const spreadBps = sofr?.value != null && effr?.value != null ? (sofr.value - effr.value) * 100 : null;
  let tone: Tone = 'neutral';
  let status = '无数据';
  if (spreadBps != null) {
    if (spreadBps > 25) {
      tone = 'stress';
      status = '警报';
    } else if (spreadBps > 10) {
      tone = 'watch';
      status = '走阔';
    } else {
      tone = 'supportive';
      status = '稳定';
    }
  }
  return {
    key: 'sofr-effr',
    label: 'SOFR - EFFR',
    value: spreadBps != null ? `${signed(spreadBps, 0)} bps` : 'N/A',
    date: sofr?.date ?? effr?.date,
    tone,
    status,
    source: 'SOFR / EFFR',
    frankRead: '利差扩大代表回购市场融资成本上行；突破走廊才接近钱荒级别。',
  };
}

function nfciCard(metric: LiquidityMetric | null): IndicatorCardData {
  const value = metric?.value;
  let tone: Tone = 'neutral';
  let status = '无数据';
  if (value != null) {
    if (value > 0.5) {
      tone = 'stress';
      status = '收紧';
    } else if (value > 0) {
      tone = 'watch';
      status = '偏紧';
    } else {
      tone = 'supportive';
      status = '宽松';
    }
  }
  return {
    key: 'nfci',
    label: 'NFCI 金融状况',
    value: value != null ? value.toFixed(2) : 'N/A',
    date: metric?.date,
    tone,
    status,
    source: 'NFCI',
    change: formatMetricChange(metric),
    frankRead: 'NFCI 为正说明金融条件开始收紧；如果和短端融资压力共振，需要提高风险级别。',
  };
}

function tenYearCard(value: number | null): IndicatorCardData {
  let tone: Tone = 'neutral';
  let status = '无数据';
  if (value != null) {
    if (value >= 5) {
      tone = 'stress';
      status = '压估值';
    } else if (value >= 4.5) {
      tone = 'watch';
      status = '偏高';
    } else {
      tone = 'neutral';
      status = '观察';
    }
  }
  return {
    key: '10y',
    label: '10Y 美债收益率',
    value: value != null ? `${value.toFixed(2)}%` : 'N/A',
    tone,
    status,
    source: 'DGS10',
    frankRead: '长端利率主要影响估值折现率；它更像杀估值变量，不等于产业逻辑破裂。',
  };
}

function inflationCard(cpi: RiskIndicator | null, corePce: RiskIndicator | null): IndicatorCardData {
  const value = cpi?.value ?? null;
  let tone: Tone = 'neutral';
  let status = '无数据';
  if (value != null) {
    if (value > 3.5) {
      tone = 'stress';
      status = '限制';
    } else if (value > 2.5) {
      tone = 'watch';
      status = '偏高';
    } else {
      tone = 'supportive';
      status = '降温';
    }
  }
  return {
    key: 'inflation',
    label: 'CPI / 核心 PCE',
    value: value != null ? `${value.toFixed(1)}%` : 'N/A',
    date: cpi?.date ?? corePce?.date,
    tone,
    status,
    source: 'CPIAUCSL / PCEPILFE',
    change: cpi?.change != null ? `CPI ${signed(cpi.change, 2)}` : null,
    frankRead: '通胀决定联储是否有宽松空间；但 qinbafrank 不会单靠“要降息”去预测大顶大底。',
  };
}

function yieldCurveCard(indicator: RiskIndicator | null): IndicatorCardData {
  const value = indicator?.value ?? null;
  let tone: Tone = 'neutral';
  let status = '无数据';
  if (value != null) {
    if (value < 0) {
      tone = 'watch';
      status = '倒挂';
    } else if (value < 0.5) {
      tone = 'neutral';
      status = '平坦';
    } else {
      tone = 'supportive';
      status = '正常';
    }
  }
  return {
    key: 'yield-curve',
    label: '10Y - 2Y 利差',
    value: value != null ? `${signed(value, 2)}%` : 'N/A',
    date: indicator?.date,
    tone,
    status,
    source: 'T10Y2Y',
    change: indicator?.change != null ? signed(indicator.change, 2) : null,
    frankRead: '收益率曲线帮助识别经济周期压力，但需要和信用、就业一起看，不能单独下结论。',
  };
}

function creditCard(indicator: RiskIndicator | null): IndicatorCardData {
  const value = indicator?.value ?? null;
  let tone: Tone = 'neutral';
  let status = '无数据';
  if (value != null) {
    if (value >= 8) {
      tone = 'stress';
      status = '危机';
    } else if (value >= 5) {
      tone = 'watch';
      status = '承压';
    } else {
      tone = 'supportive';
      status = '可控';
    }
  }
  return {
    key: 'hy-oas',
    label: '高收益债利差',
    value: value != null ? `${(value * 100).toFixed(0)} bps` : 'N/A',
    date: indicator?.date,
    tone,
    status,
    source: 'BAMLH0A0HYM2',
    change: indicator?.change != null ? `${signed(indicator.change * 100, 0)} bps` : null,
    frankRead: '信用利差是真风险的温度计。只有信用压力扩散，宏观叙事才更像系统性风险。',
  };
}

function vixCard(indicator: RiskIndicator | null): IndicatorCardData {
  const value = indicator?.value ?? null;
  let tone: Tone = 'neutral';
  let status = '无数据';
  if (value != null) {
    if (value >= 30) {
      tone = 'stress';
      status = '恐慌';
    } else if (value >= 20) {
      tone = 'watch';
      status = '升温';
    } else {
      tone = 'supportive';
      status = '平静';
    }
  }
  return {
    key: 'vix',
    label: 'VIX 波动率',
    value: value != null ? value.toFixed(1) : 'N/A',
    date: indicator?.date,
    tone,
    status,
    source: 'VIX',
    change: indicator?.change != null ? signed(indicator.change, 2) : null,
    frankRead: 'VIX 是恐慌温度，不是结论。恐慌若没有杀逻辑，反而可能制造上车窗口。',
  };
}

function fearGreedCard(scoreRaw: number | null): IndicatorCardData {
  const score = scoreRaw != null ? scoreRaw * 10 : null;
  let tone: Tone = 'neutral';
  let status = '无数据';
  if (score != null) {
    if (score <= 25) {
      tone = 'stress';
      status = '极恐';
    } else if (score <= 45) {
      tone = 'watch';
      status = '恐慌';
    } else if (score <= 75) {
      tone = 'neutral';
      status = '中性';
    } else {
      tone = 'watch';
      status = '贪婪';
    }
  }
  return {
    key: 'fear-greed',
    label: '恐惧贪婪指数',
    value: score != null ? `${score.toFixed(0)}/100` : 'N/A',
    tone,
    status,
    source: 'CNN Composite',
    frankRead: '情绪极端只说明定价拥挤。qinbafrank 会继续追问：是情绪踩踏，还是基本面真的变了？',
  };
}

function globalLiquidityCard(value: number | null, date: string | null): IndicatorCardData {
  return {
    key: 'global-liquidity',
    label: '全球流动性指数',
    value: value != null ? formatCompactCurrencyFromBillions(value) : 'N/A',
    date,
    tone: 'neutral',
    status: '总账',
    source: 'Fed + ECB + BOJ - TGA - RRP',
    frankRead: '全球央行资产负债表决定外部水位，适合和美元、日元套利压力一起观察。',
  };
}

function usdJpyCard(value: number | null): IndicatorCardData {
  return {
    key: 'usdjpy',
    label: 'USD/JPY',
    value: value != null ? value.toFixed(2) : 'N/A',
    tone: 'neutral',
    status: '套利',
    source: 'FX',
    frankRead: '日元快速升值可能触发套利交易平仓；单点汇率不下结论，要看速度和风险资产共振。',
  };
}

function findIndicator(response: EconomicFundamentalsResponse | null, seriesId: string): RiskIndicator | null {
  if (!response?.success) return null;
  for (const dim of response.data.sub_dimensions) {
    const found = dim.indicators.find((indicator) => indicator.series_id === seriesId);
    if (found) return found;
  }
  return null;
}

function valueToBillions(metric: LiquidityMetric | null): number | null {
  if (!metric || metric.value == null) return null;
  const units = metric.units.toLowerCase();
  if (units.includes('million')) return metric.value / 1000;
  if (units.includes('billion')) return metric.value;
  return metric.value;
}

function formatMetricChange(metric: LiquidityMetric | null): string | null {
  if (!metric || metric.change == null) return null;
  return `周${signed(metric.change, 1)}%`;
}

function signed(value: number, digits: number): string {
  return `${value >= 0 ? '+' : ''}${value.toFixed(digits)}`;
}

function formatNumber(value: number): string {
  return new Intl.NumberFormat('zh-CN', { notation: 'compact' }).format(value);
}

function formatDateSafe(date: string | null): string {
  if (!date) return '未知时间';
  const parsed = new Date(date);
  if (Number.isNaN(parsed.getTime())) return '未知时间';
  return parsed.toLocaleDateString('zh-CN', {
    month: 'short',
    day: 'numeric',
  });
}

function formatCompactCurrencyFromBillions(value: number): string {
  const abs = Math.abs(value);
  if (abs >= 1000) return `$${(value / 1000).toFixed(2)}T`;
  if (abs >= 1) return `$${value.toFixed(0)}B`;
  return `$${(value * 1000).toFixed(0)}M`;
}

function stripLeadingMarker(s: string): string {
  return s
    .replace(/^[\u274c\u2705\u26a0\ufe0f\s]+/, '')
    .replace(/\u9635\u773c/g, '主导变量')
    .trim();
}
