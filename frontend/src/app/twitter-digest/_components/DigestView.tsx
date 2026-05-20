'use client';

import Link from 'next/link';

import { HotLeaderboard } from './HotLeaderboard';
import { MacroSection } from './MacroSection';
import { OpeningSection } from './OpeningSection';
import { WatchpointsSection } from './WatchpointsSection';
import { TickerSection } from './TickerSection';
import { TrustBanner } from './TrustBanner';
import type { DailyDigest, TickerThesis } from './types';

interface Props {
  date: string;
  digest: DailyDigest | null;
}

const WEEKDAYS = ['星期日', '星期一', '星期二', '星期三', '星期四', '星期五', '星期六'];

function formatHeaderDate(date: string): string {
  try {
    const [y, m, d] = date.split('-').map(Number);
    const dt = new Date(`${date}T08:00:00+08:00`);
    return `${y} 年 ${m} 月 ${d} 日 · ${WEEKDAYS[dt.getDay()]}`;
  } catch {
    return date;
  }
}

function isEmpty(d: DailyDigest): boolean {
  return d.ticker_theses.length === 0 && d.macro_threads.length === 0;
}

// ---------------------------------------------------------------------------

export function DigestView({ date, digest }: Props) {
  if (!digest) {
    return (
      <main className="min-h-screen bg-background">
        <div className="max-w-4xl mx-auto px-4 md:px-6 py-24 text-center">
          <h1 className="font-editorial text-2xl text-foreground/85">该日期暂无日报</h1>
          <p className="text-muted-foreground mt-3 text-sm">{formatHeaderDate(date)}</p>
          <p className="text-muted-foreground mt-2 text-sm max-w-sm mx-auto">
            可能是当天 KOL 产出未达收录标准。
          </p>
          <Link
            href="/twitter-digest"
            className="mt-8 inline-block text-sm text-primary hover:underline underline-offset-4"
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

  // Top-1 ticker chip in OpeningSection — mirrors the leaderboard #1.
  const topThesis = theses[0];
  const topTickerForChip = topThesis
    ? {
        label: topThesis.ticker,
        count: topThesis.tweet_count,
        kols: topThesis.primary_kols.length,
      }
    : undefined;

  return (
    <main className="min-h-screen bg-background editorial-paper">
      <BackBar />
      <div className="max-w-4xl mx-auto px-4 md:px-6 py-8 md:py-10 space-y-6">
        <TrustBanner
          trackedKolCount={digest.tracked_kols.length}
          inputTweetCount={digest.input_tweet_count}
          windowHours={digest.window_hours}
        />

        <OpeningSection
          date={date}
          headline={digest.headline}
          windowHours={digest.window_hours}
          trackedKolCount={digest.tracked_kols.length}
          topTicker={topTickerForChip}
        />

        {empty ? (
          <p className="text-sm text-muted-foreground italic py-12 text-center">
            — 今天 KOL 圈子整体偏静,没有达到收录标准的话题。
          </p>
        ) : (
          <>
            <HotLeaderboard theses={theses} />

            <TickerGroup
              theses={disputed}
              emoji="⚔️"
              title="多空打架"
              hint="散户最爱看的现场 — 双方都有支撑者"
              id="theses-disputed"
            />
            <TickerGroup
              theses={bullSide}
              emoji="🟢"
              title="被看多的票"
              hint="多数博主在押多 / 无人公开反方"
              id="theses-bull"
            />
            <TickerGroup
              theses={bearSide}
              emoji="🔴"
              title="被看空的票"
              hint="多数博主在押空 / 无人接多头单"
              id="theses-bear"
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
                    <MacroSection key={`${m.title}-${i}`} thread={m} index={i} />
                  ))}
                </div>
              </section>
            )}

            <WatchpointsSection watchpoints={digest.watchpoints ?? []} />
          </>
        )}

        <Footer digest={digest} />
      </div>
    </main>
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
        <span className="ml-auto text-[11px] text-muted-foreground/65 italic hidden md:inline">
          {hint}
        </span>
      )}
    </div>
  );
}

function TickerGroup({
  theses, emoji, title, hint, id,
}: { theses: TickerThesis[]; emoji: string; title: string; hint: string; id: string }) {
  if (theses.length === 0) return null;
  return (
    <section className="space-y-5" id={id} aria-label={title}>
      <SectionHeading emoji={emoji} title={title} hint={hint} count={theses.length} />
      <div className="space-y-5">
        {theses.map((t, i) => (
          <TickerSection key={t.ticker} thesis={t} index={i} />
        ))}
      </div>
    </section>
  );
}

function BackBar() {
  return (
    <div className="border-b border-border/40">
      <div className="max-w-4xl mx-auto px-4 md:px-6 py-3">
        <Link
          href="/today"
          className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
          返回日报
        </Link>
      </div>
    </div>
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
