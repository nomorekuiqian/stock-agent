'use client';

import Link from 'next/link';
import { formatHeaderDate } from './formatHeaderDate';

import { ReportHeroBanner } from '@/components/ReportHeroBanner';
import { ReportTabs } from '@/components/ReportTabs';

import { HotLeaderboard } from './HotLeaderboard';
import { MacroSection } from './MacroSection';
import { OpeningSection } from './OpeningSection';
import { BottomUpgradeCard, UpgradeBanner } from './LockedBlur';
import { TwitterDigestActions } from './TwitterDigestActions';
import { WatchpointsSection } from './WatchpointsSection';
import { TickerSection } from './TickerSection';
import type { DailyDigest, TickerThesis } from './types';

interface Props {
  date: string;
  digest: DailyDigest | null;
  /** Used to build the login-redirect URL on the locked-mode upgrade banner. */
  isAuthenticated?: boolean;
}

function isEmpty(d: DailyDigest): boolean {
  return d.ticker_theses.length === 0 && d.macro_threads.length === 0;
}

// ---------------------------------------------------------------------------

export function DigestView({ date, digest, isAuthenticated = false }: Props) {
  if (!digest) {
    return (
      <main className="min-h-screen w-full max-w-full overflow-x-hidden bg-background editorial-paper">
        <DigestPageHeader showSubscribe />
        <div className="max-w-4xl mx-auto px-4 md:px-6 py-24 text-center">
          <h2 className="font-editorial text-2xl text-foreground/85">该日期暂无日报</h2>
          <p className="text-muted-foreground mt-3 text-sm">{formatHeaderDate(date)}</p>
          <p className="text-muted-foreground mt-2 text-sm max-w-sm mx-auto">
            可能是当天 KOL 产出未达收录标准。
          </p>
          <Link
            href="/twitter-digest"
            className="mt-8 inline-block text-sm text-sky-400 hover:underline underline-offset-4"
          >
            查看最新一期
          </Link>
        </div>
      </main>
    );
  }

  const theses = digest.ticker_theses;
  const macros = digest.macro_threads;
  const empty = isEmpty(digest);
  const locked = digest.is_locked === true;
  const targetPath = date ? `/twitter-digest/${date}` : '/twitter-digest';

  // Partition by side so the layout reads:
  //   ⚔️ disputed → 🟢 bull → 🔴 bear
  const disputed: TickerThesis[] = [];
  const bullSide: TickerThesis[] = [];
  const bearSide: TickerThesis[] = [];
  for (const t of theses) {
    const s = t.side ?? 'bull';
    if (s === 'disputed') disputed.push(t);
    else if (s === 'bear') bearSide.push(t);
    else bullSide.push(t);
  }

  // Top-1 ticker chip in OpeningSection must mirror HotLeaderboard's #1
  // (KOL count first, then tweet count) — the raw `theses` order is the
  // LLM's cluster order and may not match the leaderboard.
  const topThesis = [...theses].sort((a, b) => {
    if (b.primary_kols.length !== a.primary_kols.length) {
      return b.primary_kols.length - a.primary_kols.length;
    }
    return b.tweet_count - a.tweet_count;
  })[0];
  const topTickerForChip = topThesis
    ? {
        label: topThesis.ticker,
        count: topThesis.tweet_count,
        kols: topThesis.primary_kols.length,
      }
    : undefined;

  return (
    <main className="min-h-screen w-full max-w-full overflow-x-hidden bg-background editorial-paper">
      <DigestPageHeader showSubscribe={!locked} />

      <div className="max-w-4xl mx-auto px-4 md:px-6 py-8 md:py-10 space-y-6">
        <OpeningSection
          date={date}
          headline={digest.headline}
          windowHours={digest.window_hours}
          trackedKolCount={digest.tracked_kols.length}
          inputTweetCount={digest.input_tweet_count}
          topTicker={topTickerForChip}
        />

        {empty ? (
          <p className="text-sm text-muted-foreground italic py-12 text-center">
            — 今天 KOL 圈子整体偏静,没有达到收录标准的话题。
          </p>
        ) : (
          <>
            <HotLeaderboard theses={theses} />

            {locked && (
              <UpgradeBanner isAuthenticated={isAuthenticated} targetPath={targetPath} />
            )}

            <TickerGroup
              theses={disputed}
              emoji="⚔️"
              title="多空打架"
              hint="散户最爱看的现场 — 双方都有支撑者"
              id="theses-disputed"
              locked={locked}
            />
            <TickerGroup
              theses={bullSide}
              emoji="🟢"
              title="被看多的票"
              hint="多数博主在押多 / 无人公开反方"
              id="theses-bull"
              locked={locked}
            />
            <TickerGroup
              theses={bearSide}
              emoji="🔴"
              title="被看空的票"
              hint="多数博主在押空 / 无人接多头单"
              id="theses-bear"
              locked={locked}
            />

            {macros.length > 0 && (
              <section
                className="space-y-4"
                id="macro-threads"
                aria-label="其他热议"
              >
                <SectionHeading
                  emoji="💭"
                  title="其他热议"
                  hint="无个股标的的宏观 / 行业话题"
                  count={macros.length}
                />
                <div className="space-y-4">
                  {macros.map((m, i) => (
                    <MacroSection key={`${m.title}-${i}`} thread={m} index={i} locked={locked} />
                  ))}
                </div>
              </section>
            )}

            <WatchpointsSection watchpoints={digest.watchpoints ?? []} locked={locked} />

            {locked && (
              <BottomUpgradeCard isAuthenticated={isAuthenticated} targetPath={targetPath} />
            )}
          </>
        )}

        <Footer digest={digest} />
      </div>
    </main>
  );
}

function DigestPageHeader({ showSubscribe }: { showSubscribe: boolean }) {
  return (
    <section className="border-b border-border/50">
      <div className="max-w-5xl mx-auto px-4 md:px-6 py-8 md:py-12">
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
          <div className="space-y-3">
            <div className="flex items-center gap-3 animate-fade-in-up">
              <div className="h-px flex-1 max-w-[60px] bg-gradient-to-r from-sky-400 to-transparent animate-line-expand" />
              <span className="text-sky-400 text-xs font-semibold tracking-[0.25em] uppercase">Twitter Digest</span>
            </div>
            <h2 className="text-3xl md:text-5xl font-editorial text-foreground tracking-tight leading-[1.1] animate-fade-in-up delay-100">
              推特 KOL 日报
            </h2>
            <p className="text-muted-foreground text-sm md:text-base max-w-lg leading-relaxed animate-fade-in-up delay-200">
              每天 5 分钟带你看清美股高质量 KOL 观点
            </p>
          </div>

          <div className="flex flex-col items-start md:items-end gap-4 animate-fade-in-up delay-300">
            <ReportTabs />
            <TwitterDigestActions showSubscribe={showSubscribe} />
          </div>
        </div>

        <ReportHeroBanner src="/report-banners/twitter-digest-banner.png" priority />
      </div>
    </section>
  );
}

function SectionHeading({
  emoji, title, hint, count,
}: { emoji: string; title: string; hint?: string; count?: number }) {
  return (
    <div className="flex items-baseline gap-3 px-2">
      <h2 className="text-base md:text-lg font-medium text-foreground tracking-tight flex items-center gap-2">
        <span aria-hidden>{emoji}</span>
        <span>{title}</span>
      </h2>
      {typeof count === 'number' && (
        <span className="text-xs text-muted-foreground tabular-nums">
          <span className="font-data text-foreground/70">{count}</span> 条
        </span>
      )}
      {hint && (
        <span className="ml-auto hidden text-xs italic text-muted-foreground md:inline">
          {hint}
        </span>
      )}
    </div>
  );
}

function TickerGroup({
  theses, emoji, title, hint, id, locked,
}: {
  theses: TickerThesis[];
  emoji: string;
  title: string;
  hint: string;
  id: string;
  locked: boolean;
}) {
  if (theses.length === 0) return null;
  return (
    <section className="space-y-5" id={id} aria-label={title}>
      <SectionHeading emoji={emoji} title={title} hint={hint} count={theses.length} />
      <div className="space-y-5">
        {theses.map((t, i) => (
          <TickerSection
            key={t.ticker}
            thesis={t}
            index={i}
            locked={locked}
          />
        ))}
      </div>
    </section>
  );
}

function Footer({ digest }: { digest: DailyDigest }) {
  const stamp = new Date(digest.generated_at).toLocaleString('zh-CN', {
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit',
  });
  return (
    <footer className="pt-2 pb-2 text-center">
      <p className="text-xs text-muted-foreground" title={`模型 ${digest.model_version}`}>
        本期生成于 <span className="font-data tabular-nums">{stamp}</span>
      </p>
    </footer>
  );
}
