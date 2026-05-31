'use client';

import { useEffect, useMemo, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useQueries } from '@tanstack/react-query';
import {
  ArrowUpRight,
  BarChart3,
  ChevronDown,
  Coins,
  Cpu,
  FileText,
  Gauge,
  Layers3,
  MessageCircle,
  PanelsTopLeft,
  Quote,
  Shield,
  ShieldAlert,
  TrendingDown,
  TrendingUp,
} from 'lucide-react';

import { api, type KolCockpitTweet, type KolSectorDetail, type KolSectorSummary } from '@/lib/api';
import { queryKeys } from '@/hooks/queries/query-keys';
import { useKolCockpitSectors } from '@/hooks/queries/use-kol-data';
import IndustryChainView from './IndustryChainView';
import MacroPerspectivePanel from './MacroPerspectivePanel';

// Boards with a dedicated industry-chain visualization.
const CHAIN_BOARDS = new Set([
  'ai-infrastructure',
  'crypto-stablecoin-rwa',
  'defense-and-space',
]);

interface SectorVisual {
  icon: ReactNode;
  accent: string;
  iconTone: string;
  bar: string;
  badge: string;
  thesis: string;
  subtopics: string[];
}

const SECTOR_VISUALS: Record<string, SectorVisual> = {
  'ai-infrastructure': {
    icon: <Cpu className="h-4 w-4" />,
    accent: 'border-primary/35 bg-primary/[0.055]',
    iconTone: 'border-primary/30 bg-primary/10 text-primary',
    bar: 'bg-primary/70',
    badge: '算力链',
    thesis: '先找卡脖子环节，再看 capex 是否转成收入。',
    subtopics: ['半导体 / HBM', '数据中心', '物理 AI'],
  },
  'crypto-stablecoin-rwa': {
    icon: <Coins className="h-4 w-4" />,
    accent: 'border-amber-500/35 bg-amber-500/[0.055]',
    iconTone: 'border-amber-500/30 bg-amber-500/10 text-amber-500',
    bar: 'bg-amber-500/70',
    badge: '链上金融',
    thesis: '只看能变成金融基建的部分，不追 meme 式投机。',
    subtopics: ['稳定币', '合规交易所', '散户入口'],
  },
  'defense-and-space': {
    icon: <Shield className="h-4 w-4" />,
    accent: 'border-sky-500/35 bg-sky-500/[0.055]',
    iconTone: 'border-sky-500/30 bg-sky-500/10 text-sky-400',
    bar: 'bg-sky-500/70',
    badge: '硬资产',
    thesis: '从地缘事件传导到订单、发射、卫星和政府软件。',
    subtopics: ['商业航天', '卫星网络', '大型承包商'],
  },
  'software-ai-disruption': {
    icon: <PanelsTopLeft className="h-4 w-4" />,
    accent: 'border-rose-500/35 bg-rose-500/[0.052]',
    iconTone: 'border-rose-500/30 bg-rose-500/10 text-rose-400',
    bar: 'bg-rose-500/70',
    badge: 'AI 颠覆',
    thesis: '区分会被 AI 吞掉的流程软件，和仍有入口/数据壁垒的软件。',
    subtopics: ['SaaS 风险', '安全', '数据层'],
  },
};

const FALLBACK_VISUAL: SectorVisual = {
  icon: <Layers3 className="h-4 w-4" />,
  accent: 'border-border/45 bg-card/25',
  iconTone: 'border-border/40 bg-muted/20 text-muted-foreground',
  bar: 'bg-primary/60',
  badge: '主线',
  thesis: '先看产业结构，再用数据和原文验证。',
  subtopics: [],
};

function getSectorVisual(key: string): SectorVisual {
  return SECTOR_VISUALS[key] ?? FALLBACK_VISUAL;
}

interface Props {
  username: string;
}

export default function SectorExplorer({ username }: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const initialKey = searchParams?.get('key') ?? null;
  const isLegacyMacroRoute = initialKey === 'macro-regime';

  const { data, isError } = useKolCockpitSectors(username);
  const sectorOnly = useMemo(
    () => (data?.sectors ?? []).filter((sector) => sector.layer === 'sector'),
    [data?.sectors],
  );
  const [expandedKey, setExpandedKey] = useState<string | null>(initialKey);
  const activeKey =
    expandedKey && sectorOnly.some((sector) => sector.key === expandedKey)
      ? expandedKey
      : null;

  // Only fetch detail for the currently expanded sector. Other panels fetch
  // on expand. Avoids 1+N requests on first paint when the user only opens 1.
  const detailQueries = useQueries({
    queries: sectorOnly.map((sector) => ({
      queryKey: queryKeys.kol.sectorDetail(username, sector.key),
      queryFn: () => api.kolResearch.cockpitSector(username, sector.key),
      enabled: Boolean(username) && sector.key === activeKey,
      staleTime: 5 * 60 * 1000,
    })),
  });

  const detailsByKey = useMemo(() => {
    const map = new Map<string, KolSectorDetail>();
    sectorOnly.forEach((sector, index) => {
      const detail = detailQueries[index]?.data;
      if (detail) map.set(sector.key, detail);
    });
    return map;
  }, [detailQueries, sectorOnly]);

  useEffect(() => {
    if (isLegacyMacroRoute) {
      router.replace(`/kol/${username}/macro`, { scroll: false });
    }
  }, [isLegacyMacroRoute, router, username]);

  function expandSector(key: string) {
    const next = activeKey === key ? null : key;
    setExpandedKey(next);
    const params = new URLSearchParams(searchParams?.toString() ?? '');
    if (next) {
      params.set('key', next);
      router.replace(`?${params.toString()}`, { scroll: false });
    } else {
      params.delete('key');
      const query = params.toString();
      router.replace(query ? `?${query}` : `/kol/${username}/sectors`, { scroll: false });
    }
  }

  if (isLegacyMacroRoute) {
    return <MacroPerspectivePanel username={username} />;
  }

  if (isError) {
    return (
      <div className="py-16 text-center">
        <p className="text-sm text-destructive">无法获取板块列表 · 请检查网络或稍后重试</p>
      </div>
    );
  }

  if (!data?.sectors) {
    return <SectorAtlasSkeleton />;
  }

  if (sectorOnly.length === 0) {
    return (
      <div className="py-16 text-center text-sm font-medium text-muted-foreground">
        这个博主还没整理出板块框架
      </div>
    );
  }

  const loadedDetails = sectorOnly
    .map((sector) => detailsByKey.get(sector.key))
    .filter((detail): detail is KolSectorDetail => Boolean(detail));
  const maxTweetCount = Math.max(1, ...sectorOnly.map((sector) => sector.tweet_count));

  return (
    <div className="space-y-10 pb-12 pt-5 md:pt-6">
      <SectorMethodStrip />

      <section>
        <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-xs font-medium uppercase tracking-[0.16em] text-muted-foreground">
              01 · 板块地图
            </p>
            <h3 className="mt-1 text-xl font-semibold tracking-tight text-foreground">
              四条主线
            </h3>
          </div>
          <p className="max-w-md text-sm leading-relaxed text-muted-foreground">
            每条主线都汇总了历史推文里的子主题、标的和代表原文。
          </p>
        </div>
        <div className="grid gap-3 md:grid-cols-2 2xl:grid-cols-4">
          {sectorOnly.map((sector) => (
            <SectorMapCard
              key={sector.key}
              sector={sector}
              detail={detailsByKey.get(sector.key)}
              active={activeKey === sector.key}
              maxTweetCount={maxTweetCount}
              onClick={() => expandSector(sector.key)}
            />
          ))}
        </div>
      </section>

      <section className="space-y-4">
        <div>
          <p className="text-xs font-medium uppercase tracking-[0.16em] text-muted-foreground">
            02 · 过往观点
          </p>
          <h3 className="mt-1 text-xl font-semibold tracking-tight text-foreground">
            每个板块的过往观点
          </h3>
        </div>

        <div className="space-y-4">
          {sectorOnly.map((sector, index) => {
            const detail = detailsByKey.get(sector.key);
            const open = activeKey === sector.key;
            return (
              <SectorNarrativePanel
                key={sector.key}
                index={index + 1}
                sector={sector}
                detail={detail}
                open={open}
                username={username}
                onToggle={() => expandSector(sector.key)}
              />
            );
          })}
        </div>
      </section>

      <SectorAtlasSummary sectors={sectorOnly} details={loadedDetails} />
    </div>
  );
}

function SectorMethodStrip() {
  const steps = [
    {
      label: '定位主线',
      body: '先判断这条机会属于哪条产业链，而不是按传统行业分类。',
    },
    {
      label: '找兑现证据',
      body: '看订单、收入、capex、政策或链上采用是否真的发生。',
    },
    {
      label: '设打脸条件',
      body: '每个机会都要能被数据推翻，避免只剩叙事。',
    },
  ];

  return (
    <section className="grid gap-3 rounded-lg border border-border/40 bg-card/20 p-4 md:grid-cols-3">
      {steps.map((step, index) => (
        <div key={step.label} className="grid grid-cols-[2rem_minmax(0,1fr)] gap-3">
          <span className="grid h-8 w-8 place-items-center rounded-md border border-primary/25 bg-primary/10 font-data text-xs tabular-nums text-primary">
            {index + 1}
          </span>
          <div>
            <h3 className="text-sm font-semibold text-foreground">{step.label}</h3>
            <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{step.body}</p>
          </div>
        </div>
      ))}
    </section>
  );
}

function SectorMapCard({
  sector,
  detail,
  active,
  maxTweetCount,
  onClick,
}: {
  sector: KolSectorSummary;
  detail?: KolSectorDetail;
  active: boolean;
  maxTweetCount: number;
  onClick: () => void;
}) {
  const topTickers = (detail?.tickers ?? []).slice(0, 4);
  const visual = getSectorVisual(sector.key);
  const mainPoint = visual.thesis || pickViewpoints(detail).at(0) || sector.short;
  const attentionWidth = `${Math.max(8, Math.round((sector.tweet_count / maxTweetCount) * 100))}%`;
  return (
    <button
      type="button"
      onClick={onClick}
      className={`group min-h-[236px] rounded-lg border p-4 text-left transition-[border-color,background-color,transform] motion-safe:hover:-translate-y-0.5 ${
        active
          ? visual.accent
          : 'border-border/45 bg-card/25 hover:border-primary/30 hover:bg-primary/[0.035]'
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-3">
          <span className={`mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-md border ${visual.iconTone}`}>
            {visual.icon}
          </span>
          <div className="min-w-0">
            <p className="text-xs font-medium uppercase tracking-[0.16em] text-muted-foreground">
              {sector.eyebrow}
            </p>
            <h4 className={`mt-1 text-lg font-semibold tracking-tight ${active ? 'text-primary' : 'text-foreground'}`}>
              {sector.label}
            </h4>
          </div>
        </div>
        <span className="rounded-md border border-border/50 px-2 py-1 font-data text-xs tabular-nums text-muted-foreground">
          {sector.tweet_count}
        </span>
      </div>

      <p className="mt-4 line-clamp-3 text-sm leading-relaxed text-foreground">
        {stripLeadingMarker(mainPoint)}
      </p>

      <div className="mt-4 flex flex-wrap gap-1.5">
        <span className={`rounded-sm border px-1.5 py-0.5 text-xs font-medium ${visual.iconTone}`}>
          {visual.badge}
        </span>
        {visual.subtopics.slice(0, 2).map((topic) => (
          <span
            key={topic}
            className="rounded-sm border border-border/40 bg-background/30 px-1.5 py-0.5 text-xs font-medium text-muted-foreground"
          >
            {topic}
          </span>
        ))}
      </div>

      <div className="mt-4 flex flex-wrap gap-1.5">
        {topTickers.length > 0 ? (
          topTickers.map((ticker) => (
            <span
              key={ticker.ticker}
              className="rounded-sm border border-border/45 px-1.5 py-0.5 font-data text-xs tabular-nums text-muted-foreground"
            >
              ${ticker.ticker}
            </span>
          ))
        ) : (
          <span className="text-sm text-muted-foreground">正在读取标的</span>
        )}
      </div>

      <div className="mt-4 flex items-center justify-between border-t border-border/35 pt-3">
        <span className="text-xs font-medium uppercase tracking-[0.14em] text-muted-foreground">
          {detail ? `${detail.rep_tweets.length} 条原文` : '读取中'}
        </span>
        <ChevronDown className={`h-4 w-4 text-muted-foreground transition ${active ? 'rotate-180 text-primary' : 'group-hover:text-primary'}`} />
      </div>
      <div className="mt-3 h-1 rounded-full bg-muted/30">
        <div
          className={`h-full rounded-full transition-all ${visual.bar}`}
          style={{ width: attentionWidth }}
        />
      </div>
    </button>
  );
}

function SectorNarrativePanel({
  index,
  sector,
  detail,
  open,
  username,
  onToggle,
}: {
  index: number;
  sector: KolSectorSummary;
  detail?: KolSectorDetail;
  open: boolean;
  username: string;
  onToggle: () => void;
}) {
  const viewpoints = pickViewpoints(detail);
  const comments = detail?.rep_tweets.slice(0, 2) ?? [];
  const falsifier = detail?.falsifiers[0]?.text;
  const visual = getSectorVisual(sector.key);
  const hasChainView = CHAIN_BOARDS.has(sector.key);
  const expandLabel = hasChainView ? '看产业链' : '看框架';
  const collapseLabel = hasChainView ? '收起产业链' : '收起框架';
  const chatHref =
    `/research?agent=kol&persona=${encodeURIComponent(username)}` +
    `&q=${encodeURIComponent(`按 qinbafrank 的框架，总结一下${sector.label}的机会、风险和打脸条件。`)}`;

  return (
    <article className={`rounded-lg border bg-card/20 transition-colors ${open ? visual.accent : 'border-border/45'}`}>
      <div className="grid gap-5 p-4 md:p-5 xl:grid-cols-[240px_minmax(0,1fr)_minmax(300px,0.82fr)]">
        <div>
          <div className="flex items-start gap-3">
            <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-md border ${visual.iconTone}`}>
              {visual.icon}
            </span>
            <div className="min-w-0">
              <p className="text-xs font-medium uppercase tracking-[0.16em] text-muted-foreground">
                {String(index).padStart(2, '0')} · {sector.eyebrow}
              </p>
              <h4 className="mt-2 text-xl font-semibold tracking-tight text-foreground">
                {sector.label}
              </h4>
            </div>
          </div>
          <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
            {sector.short}
          </p>
          <div className="mt-4 flex flex-wrap gap-2 text-xs font-medium uppercase tracking-[0.14em] text-muted-foreground">
            <span><span className="font-data tabular-nums text-foreground">{sector.tweet_count}</span> 条推文</span>
            <span><span className="font-data tabular-nums text-foreground">{sector.ticker_count}</span> 个标的</span>
          </div>
        </div>

        <div className="min-w-0">
          <PanelLabel icon={<Gauge className="h-4 w-4" />} label="他的观点" />
          {detail ? (
            <ul className="mt-3 space-y-2">
              {(viewpoints.length > 0 ? viewpoints : [sector.short]).slice(0, 3).map((item, itemIndex) => (
                <li key={itemIndex} className="grid grid-cols-[1.5rem_minmax(0,1fr)] gap-2 text-sm leading-relaxed text-foreground">
                  <span className="font-data text-xs tabular-nums text-primary">
                    {itemIndex + 1}
                  </span>
                  <span>{stripLeadingMarker(item)}</span>
                </li>
              ))}
            </ul>
          ) : (
            <LoadingLines />
          )}

          {falsifier ? (
            <div className="mt-4 rounded-md border border-amber-500/20 bg-amber-500/10 px-3 py-2.5">
              <PanelLabel icon={<ShieldAlert className="h-4 w-4" />} label="打脸条件" compact />
              <p className="mt-1.5 text-sm leading-relaxed text-foreground">
                {stripLeadingMarker(falsifier)}
              </p>
            </div>
          ) : null}
        </div>

        <div className="min-w-0">
          <PanelLabel icon={<Quote className="h-4 w-4" />} label="过往评论" />
          {detail ? (
            comments.length > 0 ? (
              <div className="mt-3 divide-y divide-border/35">
                {comments.map((tweet) => (
                  <CommentExcerpt key={tweet.id} tweet={tweet} />
                ))}
              </div>
            ) : (
              <p className="mt-3 text-sm text-muted-foreground">这个板块暂时没有可展示的代表原文。</p>
            )
          ) : (
            <LoadingLines />
          )}
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border/35 px-4 py-3 md:px-5">
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={onToggle}
            className="inline-flex min-h-11 items-center gap-1.5 rounded-md border border-border/50 px-3 py-2 text-sm font-medium text-muted-foreground transition hover:border-primary/40 hover:text-primary"
          >
            <Layers3 className="h-4 w-4" />
            {open ? collapseLabel : expandLabel}
          </button>
          <Link
            href={chatHref}
            className="inline-flex min-h-11 items-center gap-1.5 rounded-md border border-primary/30 bg-primary/10 px-3 py-2 text-sm font-medium text-primary transition hover:border-primary hover:bg-primary/15"
          >
            <MessageCircle className="h-4 w-4" />
            继续追问
          </Link>
        </div>
        {detail?.tickers.length ? (
          <div className="flex flex-wrap items-center gap-1.5">
            {detail.tickers.slice(0, 6).map((ticker) => (
              <TickerPill key={ticker.ticker} ticker={ticker} username={username} />
            ))}
          </div>
        ) : null}
      </div>

      {open ? (
        <div className="animate-fade-in border-t border-border/35 px-4 py-5 md:px-5">
          {hasChainView ? (
            <IndustryChainView username={username} boardKey={sector.key} />
          ) : (
            <CompactSectorDeepDive detail={detail} username={username} />
          )}
        </div>
      ) : null}
    </article>
  );
}

function CompactSectorDeepDive({
  detail,
  username,
}: {
  detail?: KolSectorDetail;
  username: string;
}) {
  if (!detail) {
    return <SectorAtlasSkeleton compact />;
  }

  return (
    <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(260px,0.75fr)]">
      <RuleColumn
        title="他先看什么"
        icon={<BarChart3 className="h-4 w-4" />}
        items={detail.signals.slice(0, 5).map((item) => item.text)}
      />
      <RuleColumn
        title="什么时候转向"
        icon={<ShieldAlert className="h-4 w-4" />}
        items={[...detail.bear_triggers, ...detail.veto, ...detail.falsifiers].slice(0, 5).map((item) => item.text)}
      />
      <div>
        <PanelLabel icon={<FileText className="h-4 w-4" />} label="相关标的" />
        {detail.tickers.length > 0 ? (
          <div className="mt-3 grid grid-cols-2 gap-2">
            {detail.tickers.slice(0, 10).map((ticker) => (
              <TickerPill key={ticker.ticker} ticker={ticker} username={username} block />
            ))}
          </div>
        ) : (
          <p className="mt-3 text-sm text-muted-foreground">暂无结构化标的。</p>
        )}
      </div>
    </div>
  );
}

function RuleColumn({
  title,
  icon,
  items,
}: {
  title: string;
  icon: ReactNode;
  items: string[];
}) {
  return (
    <div>
      <PanelLabel icon={icon} label={title} />
      {items.length > 0 ? (
        <ul className="mt-3 space-y-2">
          {items.map((item, index) => (
            <li key={index} className="rounded-md bg-background/35 px-3 py-2 text-sm leading-relaxed text-foreground">
              {stripLeadingMarker(item)}
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-3 text-sm text-muted-foreground">这个板块没有对应条目。</p>
      )}
    </div>
  );
}

function SectorAtlasSummary({
  sectors,
  details,
}: {
  sectors: KolSectorSummary[];
  details: KolSectorDetail[];
}) {
  const sorted = [...sectors].sort((a, b) => b.tweet_count - a.tweet_count);
  const topThree = sorted.slice(0, 3);
  const totalFalsifiers = details.reduce((sum, detail) => sum + detail.falsifiers.length, 0);
  const tickerCount = new Set(details.flatMap((detail) => detail.tickers.map((ticker) => ticker.ticker))).size;
  const directComments = details.reduce((sum, detail) => sum + detail.rep_tweets.length, 0);

  return (
    <section className="rounded-lg border border-border/45 bg-card/20 p-5 md:p-6">
      <div className="grid gap-5 lg:grid-cols-[260px_minmax(0,1fr)]">
        <div>
          <p className="text-xs font-medium uppercase tracking-[0.16em] text-muted-foreground">
            03 · 板块总结
          </p>
          <h3 className="mt-1 text-xl font-semibold tracking-tight text-foreground">
            总结
          </h3>
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
            这不是一个均匀铺开的行业地图，而是 qinbafrank 注意力最集中的几条产业线。
          </p>
        </div>

        <div className="grid gap-4 md:grid-cols-3">
          <SummaryItem
            title="注意力最密集"
            body={`${topThree.map((sector) => sector.label).join(' / ')} 是当前证据量最高的板块。`}
          />
          <SummaryItem
            title="不是只看故事"
            body={`已整理 ${totalFalsifiers || '多'} 条打脸条件，核心是每条机会都要能被数据验证或推翻。`}
          />
          <SummaryItem
            title="可继续下钻"
            body={`目前覆盖 ${tickerCount || '多'} 个相关标的和 ${directComments || '多'} 条代表原文，可以继续进入个股页或研究对话。`}
          />
        </div>
      </div>
    </section>
  );
}

function SummaryItem({ title, body }: { title: string; body: string }) {
  return (
    <div className="border-t border-border/40 pt-4">
      <h4 className="text-sm font-semibold text-foreground">{title}</h4>
      <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{body}</p>
    </div>
  );
}

function CommentExcerpt({ tweet }: { tweet: KolCockpitTweet }) {
  return (
    <article className="py-3 first:pt-0 last:pb-0">
      <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-[0.14em] text-muted-foreground">
        <time dateTime={tweet.created_at ?? undefined}>{formatDate(tweet.created_at)}</time>
        <span><span className="font-data tabular-nums">{formatNumber(tweet.like_count)}</span> 赞</span>
        {tweet.url ? (
          <a
            href={tweet.url}
            target="_blank"
            rel="noopener noreferrer"
            className="ml-auto inline-flex items-center gap-1 text-muted-foreground transition hover:text-primary"
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

function PanelLabel({
  icon,
  label,
  compact,
}: {
  icon: ReactNode;
  label: string;
  compact?: boolean;
}) {
  return (
    <div className={`flex items-center gap-2 ${compact ? '' : 'text-muted-foreground'}`}>
      <span className="text-primary/80">{icon}</span>
      <span className="text-xs font-medium uppercase tracking-[0.14em]">{label}</span>
    </div>
  );
}

function TickerPill({
  ticker,
  username,
  block,
}: {
  ticker: KolSectorDetail['tickers'][number];
  username: string;
  block?: boolean;
}) {
  const hasChange = ticker.daily_change != null;
  const up = (ticker.daily_change ?? 0) > 0;
  const flat = (ticker.daily_change ?? 0) === 0;
  const color = !hasChange || flat ? 'text-muted-foreground' : up ? 'text-primary' : 'text-destructive';
  const ChangeIcon = hasChange && !flat ? (up ? TrendingUp : TrendingDown) : null;

  return (
    <Link
      href={`/kol/${username}/stocks?ticker=${encodeURIComponent(ticker.ticker)}`}
      className={`inline-flex min-h-11 items-center justify-between gap-2 rounded-md border border-border/45 bg-background/35 px-2.5 py-1.5 text-sm transition hover:border-primary/35 hover:text-primary md:min-h-9 ${
        block ? 'w-full' : ''
      }`}
    >
      <span className="font-data tabular-nums text-foreground">${ticker.ticker}</span>
      <span className={`inline-flex items-center gap-1 font-data text-xs tabular-nums ${color}`}>
        {ChangeIcon ? <ChangeIcon className="h-3 w-3" /> : null}
        {ticker.daily_change != null ? `${ticker.daily_change.toFixed(2)}%` : `${ticker.source_count}x`}
      </span>
    </Link>
  );
}

function LoadingLines() {
  return (
    <div className="mt-3 space-y-2">
      <div className="h-3 w-full rounded bg-muted/30" />
      <div className="h-3 w-5/6 rounded bg-muted/25" />
      <div className="h-3 w-2/3 rounded bg-muted/20" />
    </div>
  );
}

function SectorAtlasSkeleton({ compact }: { compact?: boolean }) {
  return (
    <div className={`space-y-4 ${compact ? '' : 'py-6'}`}>
      <div className="h-8 w-64 rounded bg-muted/35" />
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: compact ? 3 : 4 }).map((_, index) => (
          <div key={index} className="h-48 rounded-lg border border-border/40 bg-card/20 p-4">
            <div className="h-3 w-24 rounded bg-muted/35" />
            <div className="mt-3 h-5 w-36 rounded bg-muted/30" />
            <div className="mt-5 space-y-2">
              <div className="h-3 w-full rounded bg-muted/25" />
              <div className="h-3 w-5/6 rounded bg-muted/20" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function pickViewpoints(detail?: KolSectorDetail): string[] {
  if (!detail) return [];
  return [
    ...detail.core_questions.map((item) => item.text),
    ...detail.bull_conditions.map((item) => item.text),
    ...detail.falsifiers.map((item) => item.text),
  ].filter(Boolean);
}

function stripLeadingMarker(value: string): string {
  return value.replace(/^[\u274c\u2705\u26a0\ufe0f\s]+/, '').trim();
}

function formatNumber(value: number): string {
  return new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 }).format(value);
}

function formatDate(value: string | null | undefined): string {
  if (!value) return '未知日期';
  return new Date(value).toLocaleDateString('zh-CN', {
    month: 'short',
    day: 'numeric',
  });
}
