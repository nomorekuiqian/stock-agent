'use client';

import { use, useEffect, useState } from 'react';
import Link from 'next/link';
import { Sparkles, LayoutGrid, BarChart3, MessageCircle, ArrowUpRight, TrendingUp, TrendingDown } from 'lucide-react';

import {
  api,
  type KolCockpitFeedItem,
  type KolCockpitProfile,
  type KolCockpitTickerSummary,
} from '@/lib/api';
import OverviewMiniPreview from './_components/OverviewMiniPreview';
import { relativeTimeCN } from './_components/relativeTime';

const STARTER_QUESTIONS = [
  '他怎么看 NVDA 现在的位置？',
  'AI 算力链下一步看哪里？',
  '宏观风险等级现在是哪一级？',
];

const USE_STEPS = [
  { n: 1, label: '最新观点', hint: '看他这周/这天在说什么' },
  { n: 2, label: '板块机会', hint: '他的产业链分层 + 重点标的' },
  { n: 3, label: '个股观点', hint: '单只股的完整逻辑（机会 / 风险 / 数据）' },
  { n: 4, label: '追问他的视角', hint: '他没说过的，AI 用他框架替你想' },
];

export default function OverviewPage({
  params,
}: {
  params: Promise<{ username: string }>;
}) {
  const { username } = use(params);
  const [profile, setProfile] = useState<KolCockpitProfile | null>(null);
  const [tickers, setTickers] = useState<KolCockpitTickerSummary[]>([]);
  const [feed, setFeed] = useState<KolCockpitFeedItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    Promise.all([
      api.kolResearch.cockpitProfile(username),
      api.kolResearch.cockpitTickers(username),
      api.kolResearch.cockpitFeed(username, { limit: 3 }),
    ])
      .then(([p, t, f]) => {
        if (cancelled) return;
        setProfile(p);
        setTickers(t.tickers);
        setFeed(f.tweets);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [username]);

  const chatHref = `/research?agent=kol&persona=${encodeURIComponent(username)}`;

  return (
    <div className="space-y-7 py-6 md:space-y-8 md:py-8">
      {/* Section eyebrow */}
      <div className="flex items-baseline justify-between">
        <div>
          <p className="font-data text-[11px] uppercase tracking-[0.22em] text-muted-foreground">
            COCKPIT · OVERVIEW
          </p>
          <h2 className="mt-1 font-editorial text-2xl text-foreground md:text-[28px]">
            {profile?.persona.display_name ?? username} 投研驾驶舱
          </h2>
        </div>
        <Link
          href={`/kol/${username}/latest`}
          className="hidden items-center gap-1 font-data text-[11px] uppercase tracking-[0.14em] text-muted-foreground transition hover:text-primary md:inline-flex"
        >
          直接看 Live Feed
          <ArrowUpRight className="h-3 w-3" />
        </Link>
      </div>

      {/* How to use this cockpit — quick orientation for first-time visitors */}
      <section className="rounded-lg border border-border/60 bg-card/30 p-5 md:p-6">
        <p className="font-data text-[10px] uppercase tracking-[0.22em] text-muted-foreground">
          这个驾驶舱是什么 · 怎么用
        </p>
        <p className="mt-2 text-sm leading-relaxed text-foreground/90 md:text-[15px]">
          基于 <span className="text-foreground">@{username}</span> 的公开推文蒸馏成的投研工具。
          四个模块串起来用：先看「最新观点」追他在说什么，再看「板块机会」看他的产业链分层，
          想深挖某只股就进「个股观点」看完整逻辑（机会 / 风险 / 关注数据），他没说过的可以「追问他的视角」让 AI 用他框架替你想。
        </p>
        <ul className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-4">
          {USE_STEPS.map((step) => (
            <li key={step.label} className="flex gap-3">
              <span className="mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-full border border-primary/30 bg-primary/10 font-data text-[11px] tabular-nums text-primary">
                {step.n}
              </span>
              <div className="min-w-0">
                <p className="text-sm font-medium tracking-tight text-foreground">
                  {step.label}
                </p>
                <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">
                  {step.hint}
                </p>
              </div>
            </li>
          ))}
        </ul>
      </section>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 md:gap-5">
        {/* 1. Latest */}
        <OverviewMiniPreview
          eyebrow="MODULE 01"
          title="最新观点"
          description="他在说什么 · 时间倒序"
          icon={Sparkles}
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

        {/* 2. Sectors */}
        <OverviewMiniPreview
          eyebrow="MODULE 02"
          title="板块机会"
          description="产业链分层 · 关键标的"
          icon={LayoutGrid}
          href={`/kol/${username}/sectors`}
          actionLabel={`看全部 ${profile?.sectors.length ?? 0} 个`}
        >
          {loading ? (
            <MiniLoading rows={3} />
          ) : !profile ? null : (
            <ul className="space-y-3">
              {profile.sectors.slice(0, 3).map((s) => (
                <li key={s.key} className="flex items-baseline justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline gap-2">
                      <span className="font-data text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
                        {s.eyebrow}
                      </span>
                      <h4 className="truncate text-sm font-medium tracking-tight text-foreground">
                        {s.label}
                      </h4>
                    </div>
                    <p className="mt-0.5 line-clamp-1 text-xs text-muted-foreground">
                      {s.stance}
                    </p>
                  </div>
                  <span className="shrink-0 font-data text-xs tabular-nums text-muted-foreground">
                    {s.mention_count} 次
                  </span>
                </li>
              ))}
            </ul>
          )}
        </OverviewMiniPreview>

        {/* 3. Stocks */}
        <OverviewMiniPreview
          eyebrow="MODULE 03"
          title="个股观点"
          description="他历史提过的标的 · 价格联动"
          icon={BarChart3}
          href={`/kol/${username}/stocks`}
          actionLabel={`看全部 ${tickers.length} 只`}
        >
          {loading ? (
            <MiniLoading rows={2} />
          ) : tickers.length === 0 ? (
            <p className="text-sm text-muted-foreground">暂无内容</p>
          ) : (
            <ul className="grid grid-cols-2 gap-2">
              {tickers.slice(0, 6).map((t) => (
                <li key={t.ticker}>
                  <Link
                    href={`/kol/${username}/stocks?ticker=${t.ticker}`}
                    className="flex items-center justify-between gap-2 rounded-md border border-border/40 bg-background/40 px-2.5 py-2 transition hover:border-primary/40 hover:bg-primary/5"
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
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </OverviewMiniPreview>

        {/* 4. Chat */}
        <OverviewMiniPreview
          eyebrow="MODULE 04"
          title={`追问 ${profile?.persona.display_name ?? username} 的视角`}
          description="他没说过的事 · 让 AI 用他的镜头回答"
          icon={MessageCircle}
          href={chatHref}
          actionLabel="进入对话"
        >
          <ul className="space-y-2">
            {STARTER_QUESTIONS.map((q) => (
              <li key={q}>
                <Link
                  href={`${chatHref}&q=${encodeURIComponent(q)}`}
                  className="block rounded-md border border-border/40 bg-background/40 px-3 py-2 text-sm text-foreground/85 transition hover:border-primary/40 hover:bg-primary/5 hover:text-foreground"
                >
                  {q}
                </Link>
              </li>
            ))}
          </ul>
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
