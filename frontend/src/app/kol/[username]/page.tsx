'use client';

import { use } from 'react';
import Link from 'next/link';
import { Rss, Layers, CandlestickChart, MessageCircle, TrendingUp, TrendingDown } from 'lucide-react';

import {
  useKolCockpitProfile,
  useKolCockpitTickers,
  useKolCockpitFeed,
  useKolCockpitSectorsV3,
} from '@/hooks/queries/use-kol-data';
import type { KolCockpitProfile } from '@/lib/api';
import ChatComposer from './_components/ChatComposer';
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
  const sectorsQ = useKolCockpitSectorsV3(username);

  const profile = profileQ.data ?? null;
  const tickers = tickersQ.data?.tickers ?? [];
  const feed = feedQ.data?.tweets ?? [];
  const sectorsV3 = sectorsQ.data?.sectors ?? [];
  const loading = profileQ.isLoading || tickersQ.isLoading || feedQ.isLoading || sectorsQ.isLoading;

  const displayName = profile?.persona.display_name ?? username;
  const suggestions = buildSuggestions(profile, displayName);
  const chatHref = `/research?agent=kol&persona=${encodeURIComponent(username)}`;
  const lensPositioning =
    username.toLowerCase() === 'qinbafrank'
      ? '把 qinbafrank 的公开观点整理成可查询、可验证、可持续跟踪的股票研究框架。'
      : `把 @${username} 的公开观点整理成可查询、可验证、可持续跟踪的股票研究框架。`;

  return (
    <div className="space-y-7 py-6 md:space-y-8 md:py-8">
      <section className="max-w-3xl space-y-2">
        <p className="font-data text-[11px] uppercase tracking-[0.22em] text-primary">
          Frank Lens
        </p>
        <h2 className="font-editorial text-2xl leading-tight tracking-tight text-foreground md:text-[30px]">
          {lensPositioning}
        </h2>
      </section>

      {/* Chat composer — 第一屏的核心动作,前置在 hero 下方 */}
      <ChatComposer username={username} displayName={displayName} suggestions={suggestions} />

      {/* 2x2 模块网格 — 最新观点 / 板块 / 个股 / 对话 */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 md:gap-5">
        {/* 1. Latest */}
        <OverviewMiniPreview
          title="最新观点"
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
                    <time className="font-data text-[11px] tabular-nums text-muted-foreground">
                      {relativeTimeCN(t.created_at)}
                    </time>
                    {t.tickers.slice(0, 3).map((tk) => (
                      <span
                        key={tk}
                        className="rounded-sm bg-primary/10 px-1 py-0.5 font-data text-[10px] font-medium tracking-wider text-primary"
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

        {/* 2. Sectors — 每个板块单独可点击,直接进入该板块详情 */}
        <OverviewMiniPreview title="他专注的领域" icon={Layers}>
          {loading ? (
            <MiniLoading rows={5} />
          ) : sectorsV3.length === 0 ? (
            <p className="text-sm text-muted-foreground">暂无内容</p>
          ) : (
            <ul className="space-y-1.5">
              {sectorsV3.map((s) => (
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
                          <span className="shrink-0 rounded-sm bg-muted/60 px-1 py-0.5 font-data text-[9px] uppercase tracking-wider text-muted-foreground">
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
                    <span className="shrink-0 font-data text-[11px] tabular-nums text-muted-foreground/80">
                      {s.tweet_count} 条
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </OverviewMiniPreview>

        {/* 3. Stocks */}
        <OverviewMiniPreview
          title="个股观点"
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
                    <div className="mt-0.5 font-data text-[10px] tabular-nums text-muted-foreground">
                      {t.count} 次提及
                    </div>
                  </div>
                  <PriceMini price={t.price} change={t.daily_change} />
                </li>
              ))}
            </ul>
          )}
        </OverviewMiniPreview>

        {/* 4. Chat — each suggestion opens a fresh chat seeded with that question.
            href on the card is intentionally omitted so per-item Links can carry
            their own ?q= seed without nested-anchor issues. */}
        <OverviewMiniPreview
          title={`追问 ${displayName} 的视角`}
          icon={MessageCircle}
        >
          <ul className="space-y-2">
            {(suggestions ?? DEFAULT_STARTER).map((q) => (
              <li key={q}>
                <Link
                  href={`${chatHref}&q=${encodeURIComponent(q)}`}
                  className="group/q flex items-center justify-between gap-3 rounded-md border border-border/40 bg-background/40 px-3 py-2 text-sm text-foreground/85 transition hover:border-primary/40 hover:bg-primary/5 hover:text-foreground"
                >
                  <span className="min-w-0 flex-1">{q}</span>
                  <span
                    aria-hidden
                    className="font-data text-xs text-muted-foreground/70 opacity-0 transition group-hover/q:opacity-100 md:inline"
                  >
                    问 →
                  </span>
                </Link>
              </li>
            ))}
          </ul>
          <Link
            href={chatHref}
            className="mt-3 inline-flex items-center gap-1 font-data text-xs uppercase tracking-wider text-muted-foreground transition hover:text-primary"
          >
            进入完整对话 →
          </Link>
        </OverviewMiniPreview>
      </div>
    </div>
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
    <div className={`shrink-0 text-right font-data text-[11px] tabular-nums ${color}`}>
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

const DEFAULT_STARTER = [
  '他怎么看 NVDA 现在的位置？',
  'AI 算力链下一步看哪里？',
  '宏观风险等级现在是哪一级？',
];

/**
 * 用 profile 数据构造 3 个建议问题。
 * 用于 ChatComposer 的 chip + Module 04 的 starter 列表共享。
 */
function buildSuggestions(
  profile: KolCockpitProfile | null,
  displayName: string,
): string[] | undefined {
  if (!profile) return undefined;
  const topSector = profile.sectors[0]?.label;
  const principles = profile.core.principles ?? [];
  const fingerprint = profile.core.fingerprint;
  const out: string[] = [];
  if (topSector) out.push(`他怎么看「${topSector}」现在的位置？`);
  if (principles.length > 0 && principles[0].title) {
    out.push(`${displayName} 说的「${principles[0].title}」具体怎么用？`);
  }
  if (fingerprint) out.push('他最近有改变立场的标的吗？');
  while (out.length < 3) {
    const next = DEFAULT_STARTER[out.length] ?? DEFAULT_STARTER[0];
    if (!out.includes(next)) out.push(next);
    else break;
  }
  return out.slice(0, 3);
}
