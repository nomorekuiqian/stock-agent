'use client';

import { use } from 'react';
import Link from 'next/link';
import {
  BookOpenText,
  CandlestickChart,
  Layers,
  MessageCircle,
  Radar,
  Rss,
  TrendingDown,
  TrendingUp,
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
  FRANK_SECTIONS,
  type FrankHighlightTopicId,
  type FrankSectionId,
} from './_components/frankContentData';
import OverviewMiniPreview from './_components/OverviewMiniPreview';
import { relativeTimeCN } from './_components/relativeTime';

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
  const sectors = sectorsQ.data?.sectors ?? [];
  const macroSummary = sectors.find((sector) => sector.layer === 'macro' || sector.key === 'macro-regime');
  const sectorOnly = sectors.filter((sector) => sector.layer === 'sector');
  const isFrank = username.toLowerCase() === 'qinbafrank';
  const loading = profileQ.isLoading || tickersQ.isLoading || feedQ.isLoading || (!isFrank && sectorsQ.isLoading);

  const displayName = profile?.persona.display_name ?? username;
  const titleName = username.toLowerCase() === 'qinbafrank' ? 'qinbafrank' : displayName;
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
        loading={profileQ.isLoading || tickersQ.isLoading || feedQ.isLoading}
      />
    );
  }

  return (
    <div className="space-y-7 py-6 md:space-y-8 md:py-8">
      <section className="max-w-3xl space-y-2">
        <p className="text-xs font-medium uppercase tracking-[0.18em] text-primary">
          博主研究室
        </p>
        <h2 className="font-editorial text-2xl leading-tight tracking-tight text-foreground md:text-3xl">
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
                        <h4 className="truncate text-sm font-medium tracking-tight text-foreground group-hover/sec:text-primary">
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
  loading,
}: {
  username: string;
  feed: KolCockpitFeedItem[];
  tickers: KolCockpitTickerSummary[];
  loading: boolean;
}) {
  const previewTopicIds: FrankHighlightTopicId[] = ['ai-trend', 'capex-war', 'market-rules'];
  const highlightHighlights = previewTopicIds
    .map((topicId) => FRANK_FEATURED_CONTENT.find((item) => item.topicId === topicId))
    .filter((item): item is typeof FRANK_FEATURED_CONTENT[number] => Boolean(item));
  const recommendedCompanies = FRANK_COMPANY_RECOMMENDATIONS.slice(0, 6).map((company) => ({
    company,
    live: tickers.find((ticker) => ticker.ticker.toUpperCase() === company.ticker),
  }));
  const sectionMap = Object.fromEntries(FRANK_SECTIONS.map((s) => [s.id, s])) as Record<FrankSectionId, typeof FRANK_SECTIONS[number]>;

  return (
    <div className="space-y-7 py-6 md:space-y-8 md:py-8">
      <section className="max-w-3xl space-y-3">
        <h2 className="font-editorial text-3xl leading-tight tracking-tight text-foreground md:text-4xl">
          qinbafrank 研究室
        </h2>
        <p className="text-base leading-relaxed text-muted-foreground md:text-lg">
          把他在 X 上散落的观点、原文证据和个股表态整理在一处 ——
          按主题读精华、按个股复盘演化、随时回到原文,也可以基于这些上下文追问他的框架。
        </p>
      </section>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 md:gap-5">
        <OverviewMiniPreview
          title={sectionMap.highlights.label}
          icon={BookOpenText}
          href={`/kol/${username}/sectors`}
        >
          <SectionIntro text={sectionMap.highlights.purpose} />
          <ul className="space-y-2">
            {highlightHighlights.map((item) => (
              <li key={item.id} className="flex items-baseline gap-2">
                <time className="shrink-0 font-data text-xs tabular-nums text-muted-foreground">
                  {item.date}
                </time>
                <span className="shrink-0 rounded-sm bg-primary/10 px-1.5 py-0.5 text-xs font-medium text-primary">
                  {item.topic}
                </span>
                <p className="truncate text-sm text-foreground">{item.title}</p>
              </li>
            ))}
          </ul>
        </OverviewMiniPreview>

        <OverviewMiniPreview
          title={sectionMap.stocks.label}
          icon={CandlestickChart}
          href={`/kol/${username}/stocks`}
        >
          <SectionIntro text={sectionMap.stocks.purpose} />
          {loading ? (
            <MiniLoading rows={2} />
          ) : recommendedCompanies.length === 0 ? (
            <p className="text-sm text-muted-foreground">暂无内容</p>
          ) : (
            <ul className="grid grid-cols-3 gap-2">
              {recommendedCompanies.map(({ company, live }) => (
                <li
                  key={company.ticker}
                  className="flex items-center justify-between gap-2 rounded-md border border-border/40 bg-background/40 px-2 py-1.5"
                >
                  <span className="font-data text-sm font-medium tabular-nums text-foreground">
                    ${company.ticker}
                  </span>
                  <PriceMini price={live?.price ?? null} change={live?.daily_change ?? null} />
                </li>
              ))}
            </ul>
          )}
        </OverviewMiniPreview>

        <OverviewMiniPreview
          title={sectionMap.library.label}
          icon={Rss}
          href={`/kol/${username}/latest`}
        >
          <SectionIntro text={sectionMap.library.purpose} />
          {loading ? (
            <MiniLoading rows={3} />
          ) : feed.length === 0 ? (
            <p className="text-sm text-muted-foreground">暂无内容</p>
          ) : (
            <ul className="space-y-2">
              {feed.slice(0, 3).map((t) => (
                <li key={t.id} className="flex items-baseline gap-2">
                  <time className="shrink-0 font-data text-xs tabular-nums text-muted-foreground">
                    {relativeTimeCN(t.created_at)}
                  </time>
                  <p className="truncate text-sm text-foreground">{t.text}</p>
                </li>
              ))}
            </ul>
          )}
        </OverviewMiniPreview>

        <OverviewMiniPreview
          title="追问"
          icon={MessageCircle}
          href={`/research?agent=kol&persona=${encodeURIComponent(username)}`}
        >
          <SectionIntro text={sectionMap.chat.purpose} />
          <div className="rounded-md border border-primary/25 bg-primary/10 px-3 py-2 text-sm font-medium text-primary">
            打开 qinbafrank 研究助手
          </div>
        </OverviewMiniPreview>
      </div>
    </div>
  );
}

function SectionIntro({ text }: { text: string }) {
  return (
    <p className="mb-3.5 line-clamp-3 text-sm leading-relaxed text-muted-foreground">
      {text}
    </p>
  );
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
          <span className="block text-lg font-semibold tracking-tight text-foreground">
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
