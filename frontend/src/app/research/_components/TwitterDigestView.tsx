'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';

import { api } from '@/lib/api';
import { MacroSection } from '@/app/twitter-digest/_components/MacroSection';
import { TickerSection } from '@/app/twitter-digest/_components/TickerSection';
import { WatchpointsSection } from '@/app/twitter-digest/_components/WatchpointsSection';
import type {
  DailyDigest,
  TickerThesis,
} from '@/app/twitter-digest/_components/types';

// ---------------------------------------------------------------------------
// Context payload — matches backend `_format_twitter_digest_context`.
// ---------------------------------------------------------------------------

export interface TwitterDigestContextPayload {
  type: 'twitter_digest';
  date: string;
  headline: string;
  hot_tickers: Array<{ label: string; count: number; kols: number }>;
  ticker_theses: Array<{
    ticker: string;
    side: 'disputed' | 'bull' | 'bear';
    primary_kols: string[];
    tweet_count: number;
    stance_summary: string;
    synthesis_zh: string;
    buy_count: number;
    sell_count: number;
    observation_count: number;
  }>;
  macro_threads: Array<{
    title: string;
    layer: 'macro' | 'industry';
    primary_kols: string[];
    synthesis_zh: string;
  }>;
  watchpoints: Array<{
    title: string;
    date_hint: string;
    why_it_matters_zh: string;
    related_tickers: string[];
  }>;
}

interface TwitterDigestViewProps {
  /** YYYY-MM-DD. Omit to load the latest digest. */
  date?: string;
  onContextReady?: (payload: TwitterDigestContextPayload) => void;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function partitionBySide(theses: TickerThesis[]) {
  const disputed: TickerThesis[] = [];
  const bull: TickerThesis[] = [];
  const bear: TickerThesis[] = [];
  for (const t of theses) {
    const s = t.side ?? 'bull';
    if (s === 'disputed') disputed.push(t);
    else if (s === 'bear') bear.push(t);
    else bull.push(t);
  }
  return { disputed, bull, bear };
}

function digestToPayload(digest: DailyDigest): TwitterDigestContextPayload {
  return {
    type: 'twitter_digest',
    date: digest.date || (digest.generated_at?.slice(0, 10) ?? ''),
    headline: digest.headline ?? '',
    hot_tickers: (digest.hot_tickers ?? []).slice(0, 10).map((h) => ({
      label: h.label,
      count: h.count,
      kols: h.kols ?? 0,
    })),
    ticker_theses: (digest.ticker_theses ?? []).slice(0, 8).map((t) => ({
      ticker: t.ticker,
      side: t.side ?? 'bull',
      primary_kols: (t.primary_kols ?? []).slice(0, 4),
      tweet_count: t.tweet_count ?? 0,
      stance_summary: t.stance_summary ?? '',
      synthesis_zh: t.synthesis_zh ?? '',
      buy_count: t.buy_arguments?.length || t.buy_count || 0,
      sell_count: t.sell_arguments?.length || t.sell_count || 0,
      observation_count:
        t.observation_arguments?.length || t.observation_count || 0,
    })),
    macro_threads: (digest.macro_threads ?? []).slice(0, 4).map((m) => ({
      title: m.title,
      layer: m.layer ?? 'macro',
      primary_kols: (m.primary_kols ?? []).slice(0, 4),
      synthesis_zh: m.synthesis_zh ?? '',
    })),
    watchpoints: (digest.watchpoints ?? []).slice(0, 5).map((w) => ({
      title: w.title,
      date_hint: w.date_hint ?? '',
      why_it_matters_zh: w.why_it_matters_zh ?? '',
      related_tickers: (w.related_tickers ?? []).slice(0, 6),
    })),
  };
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function TwitterDigestView({
  date,
  onContextReady,
}: TwitterDigestViewProps) {
  // Initial state = loading. Parent passes key={date} so date changes
  // force a remount, which is why we don't need to reset state inside the
  // effect — that would trip react-hooks/set-state-in-effect.
  const [phase, setPhase] = useState<
    | { status: 'loading' }
    | { status: 'loaded'; digest: DailyDigest | null }
    | { status: 'error'; error: string }
  >({ status: 'loading' });

  useEffect(() => {
    let cancelled = false;
    const fetcher = date
      ? api.twitterDigest.getByDate(date)
      : api.twitterDigest.getLatest();

    fetcher
      .then((result) => {
        if (cancelled) return;
        setPhase({ status: 'loaded', digest: result });
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setPhase({
          status: 'error',
          error: err instanceof Error ? err.message : '加载失败',
        });
      });

    return () => {
      cancelled = true;
    };
  }, [date]);

  const digest = phase.status === 'loaded' ? phase.digest : null;
  const loading = phase.status === 'loading';
  const error = phase.status === 'error' ? phase.error : null;

  useEffect(() => {
    if (!onContextReady || !digest) return;
    onContextReady(digestToPayload(digest));
  }, [digest, onContextReady]);

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-4">
        <div className="w-10 h-10 rounded-full border-2 border-sky-400/20 border-t-sky-400 animate-spin" />
        <p className="text-xs text-muted-foreground">加载推特日报</p>
      </div>
    );
  }

  if (error || !digest) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-3 px-6 text-center">
        <p className="text-sm text-muted-foreground">
          {error ? `加载失败: ${error}` : '暂无推特日报'}
        </p>
        <Link
          href="/twitter-digest"
          className="text-xs text-sky-400 hover:underline underline-offset-4"
        >
          打开独立页面查看
        </Link>
      </div>
    );
  }

  const { disputed, bull, bear } = partitionBySide(digest.ticker_theses ?? []);
  const watchpoints = digest.watchpoints ?? [];
  const macros = digest.macro_threads ?? [];
  const locked = digest.is_locked === true;
  const displayDate =
    digest.date || (digest.generated_at?.slice(0, 10) ?? '');

  return (
    <div className="h-full overflow-y-auto">
      <div className="px-5 pt-4 pb-3">
        <div className="flex items-center gap-2 mb-2">
          <span className="text-xs font-data text-muted-foreground tracking-wide">
            {displayDate}
          </span>
          <span className="h-3 w-px bg-border/50" />
          <span className="text-xs text-muted-foreground/80">
            KOL 推特日报
          </span>
          <Link
            href={
              displayDate
                ? `/twitter-digest/${displayDate}`
                : '/twitter-digest'
            }
            className="ml-auto text-xs text-sky-400/80 hover:text-sky-400 hover:underline underline-offset-4"
          >
            打开全屏 →
          </Link>
        </div>
        {digest.headline && (
          <h2 className="text-base font-semibold leading-snug text-foreground">
            {digest.headline}
          </h2>
        )}
      </div>

      <div className="border-b border-border/30" />

      {locked && (
        <div className="mx-5 my-3 rounded-md border border-sky-500/30 bg-sky-500/[0.05] px-3 py-2 text-xs text-foreground/80">
          解锁完整推特日报后可看到博主原文论据 ·
          <Link
            href="/pricing"
            className="ml-1 text-sky-400 hover:underline underline-offset-4"
          >
            查看会员
          </Link>
        </div>
      )}

      <div className="px-5 py-4 space-y-6">
        {disputed.length + bull.length + bear.length === 0 && macros.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-10">
            今日 KOL 圈无显著热议
          </p>
        ) : null}

        {disputed.length > 0 && (
          <Section title="多空打架">
            {disputed.map((t, i) => (
              <TickerSection key={t.ticker} thesis={t} index={i} locked={locked} />
            ))}
          </Section>
        )}

        {bull.length > 0 && (
          <Section title="看多为主">
            {bull.map((t, i) => (
              <TickerSection key={t.ticker} thesis={t} index={i} locked={locked} />
            ))}
          </Section>
        )}

        {bear.length > 0 && (
          <Section title="看空为主">
            {bear.map((t, i) => (
              <TickerSection key={t.ticker} thesis={t} index={i} locked={locked} />
            ))}
          </Section>
        )}

        {watchpoints.length > 0 && (
          <Section title="后续看点">
            <WatchpointsSection watchpoints={watchpoints} locked={locked} />
          </Section>
        )}

        {macros.length > 0 && (
          <Section title="宏观与行业">
            {macros.map((m, i) => (
              <MacroSection key={m.title + i} thread={m} index={i} locked={locked} />
            ))}
          </Section>
        )}
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h3 className="text-xs font-medium tracking-wider text-muted-foreground/80 uppercase mb-3">
        {title}
      </h3>
      <div className="space-y-3">{children}</div>
    </section>
  );
}
