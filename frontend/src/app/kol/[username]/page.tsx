'use client';

import { use } from 'react';
import Link from 'next/link';
import {
  ArrowRight,
  BriefcaseBusiness,
  BookOpenText,
  CandlestickChart,
  Coins,
  Cpu,
  Globe2,
  Layers,
  LineChart,
  MessageCircle,
  Radar,
  Rss,
  TrendingDown,
  TrendingUp,
  type LucideIcon,
} from 'lucide-react';

import {
  useKolCockpitProfile,
  useKolCockpitTickers,
  useKolCockpitFeed,
  useKolCockpitSectors,
} from '@/hooks/queries/use-kol-data';
import type { KolCockpitFeedItem, KolCockpitTickerSummary } from '@/lib/api';
import {
  FRANK_COMPANY_RECOMMENDATIONS,
  FRANK_FEATURED_CONTENT,
  FRANK_FEATURED_GROUPS,
  FRANK_HIGHLIGHT_TOPICS,
  type FrankHighlightTopicId,
} from './_components/frankContentData';
import OverviewMiniPreview from './_components/OverviewMiniPreview';
import SerenityOverview from './_components/SerenityOverview';
import { relativeTimeCN } from './_components/relativeTime';

type FrankHomeSectorId =
  | 'ai-industry'
  | 'crypto-rwa'
  | 'market-cycle'
  | 'macro-geopolitics'
  | 'company-theses';

type FrankHomeSectorTone = 'emerald' | 'amber' | 'sky' | 'rose' | 'zinc';

interface FrankHomeSector {
  id: FrankHomeSectorId;
  label: string;
  eyebrow: string;
  summary: string;
  topicIds: FrankHighlightTopicId[];
  icon: LucideIcon;
  tone: FrankHomeSectorTone;
}

const FRANK_HOME_SECTORS: FrankHomeSector[] = [
  {
    id: 'ai-industry',
    label: 'AI 产业',
    eyebrow: 'AI INDUSTRY',
    summary: '先看使用量和商业化，再看 capex 把瓶颈推到存储、光通信、电力、CPU 和软件。',
    topicIds: ['ai-trend', 'capex-war'],
    icon: Cpu,
    tone: 'emerald',
  },
  {
    id: 'crypto-rwa',
    label: '加密 RWA 产业',
    eyebrow: 'CRYPTO & RWA',
    summary: '过滤纯币价投机，重点看稳定币、RWA、美股代币化和交易入口是否进入真实金融场景。',
    topicIds: ['crypto-rwa'],
    icon: Coins,
    tone: 'amber',
  },
  {
    id: 'market-cycle',
    label: '美股调整规律和行情判断',
    eyebrow: 'US MARKET CYCLE',
    summary: '先判断市场在杀估值、杀业绩还是杀逻辑，再决定这次下跌是机会还是风险升级。',
    topicIds: ['market-rules', 'market-timing'],
    icon: LineChart,
    tone: 'sky',
  },
  {
    id: 'macro-geopolitics',
    label: '宏观与地缘',
    eyebrow: 'MACRO & GEOPOLITICS',
    summary: '不追新闻情绪，而是看流动性、财政、贸易和地缘事件有没有真正传到风险资产。',
    topicIds: ['macro-geopolitics'],
    icon: Globe2,
    tone: 'rose',
  },
  {
    id: 'company-theses',
    label: '过往推荐公司',
    eyebrow: 'COMPANY CASES',
    summary: '把 PLTR、HOOD、MU、AVGO 等公司放回产业主线、首次逻辑和后续验证里看。',
    topicIds: ['company-theses'],
    icon: BriefcaseBusiness,
    tone: 'zinc',
  },
];

const homeSectorToneClass: Record<FrankHomeSectorTone, {
  card: string;
  icon: string;
  text: string;
}> = {
  emerald: {
    card: 'hover:border-primary/35 hover:bg-primary/[0.045]',
    icon: 'border-primary/25 bg-primary/10 text-primary',
    text: 'text-primary',
  },
  amber: {
    card: 'hover:border-amber-500/35 hover:bg-amber-500/[0.045]',
    icon: 'border-amber-500/25 bg-amber-500/10 text-amber-500',
    text: 'text-amber-500',
  },
  sky: {
    card: 'hover:border-sky-500/35 hover:bg-sky-500/[0.045]',
    icon: 'border-sky-500/25 bg-sky-500/10 text-sky-400',
    text: 'text-sky-400',
  },
  rose: {
    card: 'hover:border-rose-500/35 hover:bg-rose-500/[0.045]',
    icon: 'border-rose-500/25 bg-rose-500/10 text-rose-400',
    text: 'text-rose-400',
  },
  zinc: {
    card: 'hover:border-border/70 hover:bg-card/35',
    icon: 'border-border/45 bg-card/45 text-foreground',
    text: 'text-muted-foreground',
  },
};

export default function OverviewPage({
  params,
}: {
  params: Promise<{ username: string }>;
}) {
  const { username } = use(params);
  // Shared with layout's queries — cache hit, no re-fetch on navigation.
  const profileQ = useKolCockpitProfile(username);
  const tickersQ = useKolCockpitTickers(username);
  const feedQ = useKolCockpitFeed(username, { limit: 3 });
  const sectorsQ = useKolCockpitSectors(username);

  const profile = profileQ.data ?? null;
  const tickers = tickersQ.data?.tickers ?? [];
  const feed = feedQ.data?.tweets ?? [];
  const totalTweetCount = feedQ.data?.raw_total ?? feedQ.data?.total ?? null;
  const sectors = sectorsQ.data?.sectors ?? [];
  const macroSummary = sectors.find((sector) => sector.layer === 'macro' || sector.key === 'macro-regime');
  const sectorOnly = sectors.filter((sector) => sector.layer === 'sector');
  const u = username.toLowerCase();
  const isFrank = u === 'qinbafrank';
  const isSerenity = u === 'aleabitoreddit';
  const loading = profileQ.isLoading || tickersQ.isLoading || feedQ.isLoading || (!isFrank && sectorsQ.isLoading);

  const displayName = profile?.persona.display_name ?? username;
  const titleName = isFrank ? 'qinbafrank' : displayName;
  const lensPositioning =
    isFrank
      ? '把 @qinbafrank 的公开观点、原文证据和当前数据，整理成可追问的内容档案馆。'
      : `把 @${username} 的公开观点整理成可查询、可验证、可持续跟踪的股票研究框架。`;

  if (isFrank) {
    return (
      <FrankOverview
        username={username}
        feed={feed}
        tickers={tickers}
        totalTweetCount={totalTweetCount}
        loading={profileQ.isLoading || tickersQ.isLoading || feedQ.isLoading}
      />
    );
  }

  if (isSerenity) {
    return <SerenityOverview username={username} />;
  }

  return (
    <div className="space-y-7 py-6 md:space-y-8 md:py-8">
      <section className="max-w-3xl space-y-2">
        <p className="text-xs font-medium uppercase tracking-[0.18em] text-primary">
          博主研究室
        </p>
        <h2 className="font-editorial text-2xl leading-tight text-foreground md:text-3xl">
          {lensPositioning}
        </h2>
      </section>

      <ResearchToolButton
        username={username}
        displayName={titleName}
      />

      {/* 2x2 模块网格 — 最新观点 / 宏观 / 板块 / 个股 */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 md:gap-5">
        {/* 1. Latest */}
        <OverviewMiniPreview
          title="原文流"
          icon={Rss}
          href={`/kol/${username}/latest`}
        >
          {loading ? (
            <MiniLoading rows={3} />
          ) : feed.length === 0 ? (
            <p className="text-sm text-muted-foreground">暂无内容</p>
          ) : (
            <ul className="space-y-3.5">
              {feed.slice(0, 3).map((t) => (
                <li key={t.id} className="editorial-item">
                  <div className="flex items-center gap-2">
                    <time className="font-data text-xs tabular-nums text-muted-foreground">
                      {relativeTimeCN(t.created_at)}
                    </time>
                    {t.tickers.slice(0, 3).map((tk) => (
                      <span
                        key={tk}
                        className="rounded-sm bg-primary/10 px-1 py-0.5 font-data text-micro font-medium tracking-wider text-primary"
                      >
                        ${tk}
                      </span>
                    ))}
                  </div>
                  <p className="mt-1 line-clamp-2 text-sm leading-relaxed text-foreground">
                    {t.text}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </OverviewMiniPreview>

        {/* 2. Macro */}
        <OverviewMiniPreview
          title="宏观框架"
          icon={Radar}
          href={`/kol/${username}/macro`}
        >
          {loading ? (
            <MiniLoading rows={3} />
          ) : (
            <div className="space-y-3.5">
              <p className="line-clamp-3 text-sm leading-relaxed text-foreground">
                {macroSummary?.short ?? '围绕流动性、政策经济学、通胀就业和市场结构，追踪他的宏观判断框架。'}
              </p>
              <div className="grid grid-cols-2 gap-2">
                {['流动性', '政策经济学', '通胀就业', '市场结构'].map((item) => (
                  <span
                    key={item}
                    className="rounded-md border border-border/40 bg-background/40 px-2.5 py-2 text-xs font-medium text-muted-foreground"
                  >
                    {item}
                  </span>
                ))}
              </div>
              <p className="text-xs font-medium uppercase tracking-[0.14em] text-muted-foreground">
                数据 / 判断 / 历史原文
              </p>
            </div>
          )}
        </OverviewMiniPreview>

        {/* 3. Sectors — 每个板块单独可点击,直接进入该板块详情 */}
        <OverviewMiniPreview title="板块地图" icon={Layers}>
          {loading ? (
            <MiniLoading rows={5} />
          ) : sectorOnly.length === 0 ? (
            <p className="text-sm text-muted-foreground">暂无内容</p>
          ) : (
            <ul className="space-y-1.5">
              {sectorOnly.map((s) => (
                <li key={s.key}>
                  <Link
                    href={`/kol/${username}/sectors?key=${encodeURIComponent(s.key)}`}
                    className="group/sec flex items-start justify-between gap-3 rounded-md border border-border/40 bg-background/40 px-3 py-2.5 transition hover:border-primary/40 hover:bg-primary/5"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5">
                        <h4 className="truncate text-sm font-medium text-foreground group-hover/sec:text-primary">
                          {s.label}
                        </h4>
                        {s.layer === 'macro' ? (
                          <span className="shrink-0 rounded-sm bg-muted/60 px-1 py-0.5 text-micro font-medium text-muted-foreground">
                            宏观
                          </span>
                        ) : null}
                      </div>
                      {s.short ? (
                        <p className="mt-0.5 line-clamp-2 text-xs leading-relaxed text-muted-foreground">
                          {s.short}
                        </p>
                      ) : null}
                    </div>
                    <span className="shrink-0 font-data text-xs tabular-nums text-muted-foreground">
                      {s.tweet_count} 条
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </OverviewMiniPreview>

        {/* 4. Stocks */}
        <OverviewMiniPreview
          title="个股雷达"
          icon={CandlestickChart}
          href={`/kol/${username}/stocks`}
        >
          {loading ? (
            <MiniLoading rows={2} />
          ) : tickers.length === 0 ? (
            <p className="text-sm text-muted-foreground">暂无内容</p>
          ) : (
            <ul className="grid grid-cols-2 gap-2">
              {tickers.slice(0, 6).map((t) => (
                <li
                  key={t.ticker}
                  className="flex items-center justify-between gap-2 rounded-md border border-border/40 bg-background/40 px-2.5 py-2"
                >
                  <div className="min-w-0">
                    <div className="font-data text-sm font-medium tabular-nums text-foreground">
                      ${t.ticker}
                    </div>
                    <div className="mt-0.5 font-data text-xs tabular-nums text-muted-foreground">
                      {t.count} 次提及
                    </div>
                  </div>
                  <PriceMini price={t.price} change={t.daily_change} />
                </li>
              ))}
            </ul>
          )}
        </OverviewMiniPreview>

      </div>
    </div>
  );
}

function FrankOverview({
  username,
  feed,
  tickers,
  totalTweetCount,
  loading,
}: {
  username: string;
  feed: KolCockpitFeedItem[];
  tickers: KolCockpitTickerSummary[];
  totalTweetCount: number | null;
  loading: boolean;
}) {
  const recommendedCompanies = FRANK_COMPANY_RECOMMENDATIONS.slice(0, 6).map((company) => ({
    company,
    live: tickers.find((ticker) => ticker.ticker.toUpperCase() === company.ticker),
  }));
  const highlightTopicIndex = FRANK_HIGHLIGHT_TOPICS.map((topic) => {
    const groups = FRANK_FEATURED_GROUPS.filter((group) => group.topicId === topic.id);
    const evidenceCount = FRANK_FEATURED_CONTENT.filter((item) => item.topicId === topic.id).length;
    return { topic, groups, evidenceCount };
  });
  const totalHighlightGroupCount = highlightTopicIndex.reduce(
    (sum, item) => sum + item.groups.length,
    0,
  );
  const homeSectors = FRANK_HOME_SECTORS.map((sector) => ({
    ...sector,
    href: `/kol/${username}/sectors?sector=${sector.id}`,
    groupCount: FRANK_FEATURED_GROUPS.filter((group) => sector.topicIds.includes(group.topicId)).length,
  }));
  const formatStatValue = (value: number | null) => (
    value === null ? '--' : value.toLocaleString()
  );
  const archiveStats = [
    {
      label: '板块观点',
      value: FRANK_HOME_SECTORS.length.toLocaleString(),
      detail: '5 条主线',
    },
    {
      label: '个股档案',
      value: formatStatValue(tickers.length || null),
      detail: '完整 Ticker 归档',
    },
    {
      label: '入库推文',
      value: formatStatValue(totalTweetCount),
      detail: '原始入库数',
    },
  ];

  return (
    <div className="space-y-6 py-5 md:space-y-8 md:py-8">
      <section className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_22rem] lg:items-end">
        <div className="max-w-3xl">
          <div className="space-y-3">
            <h2 className="font-editorial text-3xl leading-tight text-foreground md:text-4xl">
              qinbafrank研究室
            </h2>
            <p className="max-w-[62ch] text-base leading-relaxed text-muted-foreground md:text-lg">
              把他的公开观点整理成板块框架、个股档案和原文证据，帮你快速看懂他如何判断产业机会、市场节奏和风险边界。
            </p>
          </div>
        </div>

        <div className="rounded-lg border border-border/50 bg-card/30 p-3">
          <div className="grid grid-cols-3 divide-x divide-border/40">
            {archiveStats.map((stat) => (
              <div key={stat.label} className="px-3 first:pl-1 last:pr-1">
                <div className="font-data text-xl font-semibold tabular-nums text-foreground">
                  {stat.value}
                </div>
                <div className="mt-1 text-xs font-medium text-muted-foreground">
                  {stat.label}
                </div>
                <div className="mt-0.5 text-xs text-muted-foreground">
                  {stat.detail}
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <div>
        <Link
          href={`/research?agent=kol&persona=${encodeURIComponent(username)}`}
          className="group relative inline-flex min-h-16 w-full max-w-lg items-center gap-3 overflow-hidden rounded-lg border border-primary/35 bg-primary/[0.08] px-4 py-3 text-left transition duration-200 ease-out hover:-translate-y-0.5 hover:border-primary/55 hover:bg-primary/[0.12] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 sm:w-auto sm:min-w-[22rem]"
        >
          <span
            className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_12%_20%,rgba(16,185,129,0.18),transparent_36%)] opacity-0 transition duration-300 group-hover:opacity-100"
            aria-hidden
          />
          <span className="relative grid h-10 w-10 shrink-0 place-items-center rounded-md border border-primary/30 bg-primary/10 text-primary">
            <MessageCircle className="h-5 w-5" strokeWidth={1.7} />
          </span>
          <span className="relative min-w-0 flex-1">
            <span className="flex flex-wrap items-center gap-2">
              <span className="text-base font-semibold text-foreground">
                向 qinbafrank 提问
              </span>
              <span className="rounded-sm border border-amber-500/30 bg-amber-500/10 px-1.5 py-0.5 font-data text-xs font-medium uppercase tracking-[0.12em] text-amber-500">
                Max
              </span>
            </span>
            <span className="mt-0.5 block text-sm leading-relaxed text-muted-foreground">
              带他的框架去理解市场
            </span>
          </span>
          <ArrowRight className="relative h-4 w-4 shrink-0 text-primary transition group-hover:translate-x-0.5" strokeWidth={1.7} />
        </Link>
      </div>

      <section className="space-y-3">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-xs font-medium uppercase tracking-[0.16em] text-muted-foreground">
              五个板块
            </p>
            <h3 className="mt-1 text-xl font-semibold tracking-tight text-foreground">
              从这里进入他的观点体系
            </h3>
          </div>
        </div>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-5">
          {homeSectors.map((sector) => (
            <HomeSectorCard key={sector.id} sector={sector} />
          ))}
        </div>
      </section>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-12 lg:gap-5">
        <OverviewMiniPreview
          title="他的精华"
          eyebrow="精选主题"
          icon={BookOpenText}
          href={`/kol/${username}/highlights`}
          className="lg:col-span-12"
          bodyClassName="space-y-5"
        >
          <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end">
            <SectionIntro text="把他的精华先拆成主题和子话题：用户不用先翻原文，也能看清每条主线到底在讨论什么。" />
            <div className="grid grid-cols-3 gap-2 text-center lg:min-w-80">
              <div className="border-t border-border/45 pt-2">
                <span className="block font-data text-base font-semibold tabular-nums text-foreground">
                  {FRANK_HIGHLIGHT_TOPICS.length}
                </span>
                <span className="mt-0.5 block text-xs text-muted-foreground">主题</span>
              </div>
              <div className="border-t border-border/45 pt-2">
                <span className="block font-data text-base font-semibold tabular-nums text-foreground">
                  {totalHighlightGroupCount}
                </span>
                <span className="mt-0.5 block text-xs text-muted-foreground">子话题</span>
              </div>
              <div className="border-t border-border/45 pt-2">
                <span className="block font-data text-base font-semibold tabular-nums text-foreground">
                  {FRANK_FEATURED_CONTENT.length}
                </span>
                <span className="mt-0.5 block text-xs text-muted-foreground">精华原文</span>
              </div>
            </div>
          </div>

          <ul className="grid gap-x-5 gap-y-5 md:grid-cols-2 xl:grid-cols-3">
            {highlightTopicIndex.map(({ topic, groups, evidenceCount }) => (
              <li key={topic.id} className="min-w-0 border-t border-border/45 pt-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold leading-snug text-foreground">
                      {topic.label}
                    </p>
                    <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-muted-foreground">
                      {topic.principle}
                    </p>
                  </div>
                  <span className="shrink-0 rounded-sm border border-primary/20 bg-primary/10 px-1.5 py-0.5 font-data text-xs font-medium tabular-nums text-primary">
                    {groups.length} 组
                  </span>
                </div>
                <div className="mt-2.5 flex flex-wrap gap-1.5">
                  {groups.map((group) => (
                    <span
                      key={group.id}
                      className="max-w-full rounded-sm border border-border/45 bg-background/45 px-1.5 py-1 text-xs leading-snug text-foreground/85"
                    >
                      {group.title}
                    </span>
                  ))}
                </div>
                <p className="mt-2 line-clamp-2 text-xs leading-relaxed text-muted-foreground">
                  含 {evidenceCount} 条原文，重点看：{topic.description}
                </p>
              </li>
            ))}
          </ul>
        </OverviewMiniPreview>

        <OverviewMiniPreview
          title="个股验证"
          eyebrow="推荐公司"
          icon={CandlestickChart}
          href={`/kol/${username}/stocks`}
          className="lg:col-span-5"
          bodyClassName="space-y-4"
        >
          <SectionIntro text="看他点过的公司，对照首次逻辑、后续观点和当前价格表现。" />
          {loading ? (
            <MiniLoading rows={2} />
          ) : recommendedCompanies.length === 0 ? (
            <p className="text-sm text-muted-foreground">暂无内容</p>
          ) : (
            <ul className="grid grid-cols-2 gap-2 lg:grid-cols-1 xl:grid-cols-2">
              {recommendedCompanies.slice(0, 4).map(({ company, live }) => (
                <li
                  key={company.ticker}
                  className="flex min-h-16 items-center justify-between gap-2 rounded-md border border-border/40 bg-background/45 px-2.5 py-2"
                >
                  <span className="min-w-0">
                    <span className="block font-data text-sm font-medium tabular-nums text-foreground">
                      ${company.ticker}
                    </span>
                    <span className="mt-0.5 block truncate text-xs text-muted-foreground">
                      {company.name}
                    </span>
                  </span>
                  <PriceMini price={live?.price ?? null} change={live?.daily_change ?? null} />
                </li>
              ))}
            </ul>
          )}
        </OverviewMiniPreview>

        <OverviewMiniPreview
          title="原文证据"
          eyebrow="最新入库"
          icon={Rss}
          href={`/kol/${username}/latest`}
          className="lg:col-span-7"
          bodyClassName="space-y-4"
          tone="amber"
        >
          <SectionIntro text="想核对他说过什么，直接回到全量原文和最新入库内容。" />
          {loading ? (
            <MiniLoading rows={3} />
          ) : feed.length === 0 ? (
            <p className="text-sm text-muted-foreground">暂无内容</p>
          ) : (
            <ul className="space-y-3">
              {feed.slice(0, 3).map((t) => (
                <li key={t.id} className="grid gap-1 sm:grid-cols-[5rem_minmax(0,1fr)] sm:gap-3 lg:block">
                  <time className="font-data text-xs tabular-nums text-muted-foreground">
                    {relativeTimeCN(t.created_at)}
                  </time>
                  <p className="line-clamp-2 text-sm leading-relaxed text-foreground lg:mt-1">
                    {formatTweetPreview(t)}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </OverviewMiniPreview>
      </div>
    </div>
  );
}

function HomeSectorCard({
  sector,
}: {
  sector: FrankHomeSector & {
    href: string;
    groupCount: number;
  };
}) {
  const Icon = sector.icon;
  const tone = homeSectorToneClass[sector.tone];

  return (
    <Link
      href={sector.href}
      className={`group flex min-h-[15rem] flex-col rounded-lg border border-border/55 bg-card/25 p-4 transition duration-200 ease-out hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/35 ${tone.card}`}
    >
      <div className="flex items-start justify-between gap-3">
        <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-md border ${tone.icon}`}>
          <Icon className="h-4 w-4" strokeWidth={1.7} />
        </span>
        <span className="font-data text-xs font-medium tabular-nums text-muted-foreground">
          {sector.groupCount} 组
        </span>
      </div>
      <div className="mt-4 min-w-0 flex-1">
        <p className={`text-xs font-medium uppercase tracking-[0.14em] ${tone.text}`}>
          {sector.eyebrow}
        </p>
        <h4 className="mt-1 text-lg font-semibold leading-snug text-foreground">
          {sector.label}
        </h4>
        <p className="mt-2 line-clamp-4 text-sm leading-relaxed text-muted-foreground">
          {sector.summary}
        </p>
      </div>
      <div className="mt-4 flex items-center justify-end border-t border-border/35 pt-3">
        <span className="inline-flex items-center gap-1 text-xs font-medium text-muted-foreground transition group-hover:text-primary">
          进入
          <ArrowRight className="h-3.5 w-3.5 transition group-hover:translate-x-0.5" strokeWidth={1.7} />
        </span>
      </div>
    </Link>
  );
}

function SectionIntro({ text }: { text: string }) {
  return (
    <p className="line-clamp-2 text-sm leading-relaxed text-muted-foreground">
      {text}
    </p>
  );
}

function formatTweetPreview(tweet: KolCockpitFeedItem) {
  return (tweet.key_claim || tweet.text)
    .replace(/https?:\/\/\S+/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function ResearchToolButton({
  username,
  displayName,
}: {
  username: string;
  displayName: string;
}) {
  const href = `/research?agent=kol&persona=${encodeURIComponent(username)}`;

  return (
    <Link
      href={href}
      className="group inline-flex min-h-16 w-full max-w-xl items-center justify-between gap-4 rounded-lg border border-primary/30 bg-primary/[0.055] px-5 py-4 text-left transition hover:border-primary/50 hover:bg-primary/[0.09] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
    >
      <span className="flex min-w-0 items-center gap-3">
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-md border border-primary/30 bg-primary/10 text-primary">
          <MessageCircle className="h-5 w-5" strokeWidth={1.7} />
        </span>
        <span className="min-w-0">
          <span className="block text-lg font-semibold text-foreground">
            打开研究助手
          </span>
          <span className="block truncate text-sm text-muted-foreground">
            用 {displayName} 框架追问
          </span>
        </span>
      </span>
      <span className="shrink-0 rounded-md border border-primary/25 px-3 py-1.5 text-sm font-medium text-primary transition group-hover:border-primary/45 group-hover:bg-primary/10">
        打开
      </span>
    </Link>
  );
}

function MiniLoading({ rows }: { rows: number }) {
  return (
    <div className="space-y-3">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="space-y-2">
          <div className="h-3 w-1/3 rounded bg-muted/50" />
          <div className="h-4 w-[90%] rounded bg-muted/40" />
        </div>
      ))}
    </div>
  );
}

function PriceMini({ price, change }: { price: number | null; change: number | null }) {
  if (price == null) return null;
  const hasChange = change != null;
  const up = (change ?? 0) > 0;
  const color = !hasChange
    ? 'text-muted-foreground'
    : up
      ? 'text-primary'
      : (change ?? 0) === 0
        ? 'text-muted-foreground'
        : 'text-destructive';
  const ChangeIcon = hasChange && (change ?? 0) !== 0 ? (up ? TrendingUp : TrendingDown) : null;
  return (
    <div className={`shrink-0 text-right font-data text-xs tabular-nums ${color}`}>
      <div>{price.toFixed(2)}</div>
      {hasChange && ChangeIcon ? (
        <div className="flex items-center justify-end gap-0.5">
          <ChangeIcon className="h-3 w-3" />
          {Math.abs(change!).toFixed(2)}%
        </div>
      ) : null}
    </div>
  );
}
