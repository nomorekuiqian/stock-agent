/**
 * Ticker Section — one card per ticker, side-tagged (disputed / bull / bear).
 *
 * Synthesis is a short 30-80 字 plain-language gist of what KOLs are saying;
 * the full bull/bear/observation argument breakdown is folded by default.
 */

import Link from 'next/link';

import { LockedBlur, SectionUnlockCta } from './LockedBlur';
import { safeUserUrl, safeTweetUrl } from './safeUrl';
import type { Argument, TickerSide, TickerThesis } from './types';

interface Props {
  thesis: TickerThesis;
  index: number;
  /** When true, render blurred locked skeletons in place of paid content. */
  locked?: boolean;
}

const SIDE_META: Record<TickerSide, {
  emoji: string;
  label: string;
  chipClass: string;
  borderClass: string;
}> = {
  disputed: {
    emoji: '⚔️',
    label: '多空打架',
    chipClass: 'bg-amber-50 text-amber-800 border-amber-200/70 dark:bg-amber-950/30 dark:text-amber-300 dark:border-amber-800/40',
    borderClass: 'border-amber-300/40 dark:border-amber-700/35',
  },
  bull: {
    emoji: '🟢',
    label: '看多为主',
    chipClass: 'bg-primary/8 text-primary border-primary/25',
    borderClass: 'border-primary/25',
  },
  bear: {
    emoji: '🔴',
    label: '看空为主',
    chipClass: 'bg-rose-50 text-rose-700 border-rose-200/70 dark:bg-rose-950/30 dark:text-rose-300 dark:border-rose-800/40',
    borderClass: 'border-rose-300/40 dark:border-rose-700/35',
  },
};

export function TickerSection({
  thesis, index, locked = false,
}: Props) {
  // Counts: in unlocked (Max) mode, the arguments arrays carry the truth and
  // `*_count` fields are not populated (pydantic default 0). In locked mode
  // the arrays are empty and `*_count` carry the truth. So pick whichever
  // is non-zero — array length wins when present, count field fills in
  // when the array has been stripped.
  const buyCount = thesis.buy_arguments.length || thesis.buy_count || 0;
  const sellCount = thesis.sell_arguments.length || thesis.sell_count || 0;
  const obsCount = thesis.observation_arguments.length || thesis.observation_count || 0;
  const total = buyCount + sellCount + obsCount;
  if (total === 0) return null;
  const side = thesis.side ?? 'bull';
  const meta = SIDE_META[side];
  // KOL hint surfaced under each locked label. We don't have per-direction
  // KOL lists at the API boundary so fall back to the thesis-level
  // `primary_kols` for all three lanes — close enough as a teaser.
  const kolSample = thesis.primary_kols.slice(0, 2);

  return (
    <section
      id={`ticker-${thesis.ticker}`}
      className={`rounded-xl border bg-card/40 p-5 md:p-7 animate-fade-in-up scroll-mt-24 ${meta.borderClass}`}
      aria-label={`${thesis.ticker} 综合讨论`}
    >
      <Header
        ticker={thesis.ticker}
        side={side}
        kols={thesis.primary_kols.length}
        tweets={thesis.tweet_count}
        index={index}
      />

      {thesis.stance_summary && (
        <p className="mt-4 text-sm italic leading-6 text-muted-foreground">
          {thesis.stance_summary}
        </p>
      )}

      {locked ? (
        <div className="mt-4">
          <LockedBlur
            lines={3}
            label="多空综合分析"
            variant="paragraph"
            kolSample={kolSample}
          />
        </div>
      ) : (
        thesis.synthesis_zh && (
          <p className="font-reading mt-4 text-sm leading-7 text-foreground/90 md:text-base md:leading-8">
            {thesis.synthesis_zh}
          </p>
        )
      )}

      {locked ? (
        <>
          <div className="mt-5 space-y-4">
            {buyCount > 0 && (
              <LockedBlur
                lines={Math.min(buyCount, 3)}
                label={`买入逻辑 · ${buyCount} 条`}
                variant="bullets"
                kolSample={kolSample}
              />
            )}
            {sellCount > 0 && (
              <LockedBlur
                lines={Math.min(sellCount, 3)}
                label={`卖出 / 风险逻辑 · ${sellCount} 条`}
                variant="bullets"
                kolSample={kolSample}
              />
            )}
            {obsCount > 0 && (
              <LockedBlur
                lines={Math.min(obsCount, 2)}
                label={`数据 / 客观观察 · ${obsCount} 条`}
                variant="bullets"
                kolSample={kolSample}
              />
            )}
          </div>
          <SectionUnlockCta />
        </>
      ) : (
        total > 0 && (
          <details className="mt-5 group">
            <summary className="list-none cursor-pointer flex items-center gap-2 py-1.5 text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground transition-colors hover:text-sky-400 select-none">
              <Caret />
              <span className="group-open:hidden">展开论据</span>
              <span className="hidden group-open:inline">收起论据</span>
              <span className="font-data tabular-nums text-muted-foreground/70 normal-case">
                ({total})
              </span>
              <ToneSummary buy={buyCount} sell={sellCount} obs={obsCount} />
            </summary>
            <div className="mt-5 space-y-6">
              {thesis.buy_arguments.length > 0 && (
                <Lane
                  label="买入逻辑"
                  count={thesis.buy_arguments.length}
                  tone="buy"
                  args={thesis.buy_arguments}
                />
              )}
              {thesis.sell_arguments.length > 0 && (
                <Lane
                  label="卖出 / 风险逻辑"
                  count={thesis.sell_arguments.length}
                  tone="sell"
                  args={thesis.sell_arguments}
                />
              )}
              {thesis.observation_arguments.length > 0 && (
                <Lane
                  label="数据 / 客观观察"
                  count={thesis.observation_arguments.length}
                  tone="observation"
                  args={thesis.observation_arguments}
                />
              )}
            </div>
          </details>
        )
      )}
    </section>
  );
}

function Caret() {
  return (
    <svg
      aria-hidden
      className="w-3 h-3 transition-transform duration-200 group-open:rotate-90"
      fill="none"
      stroke="currentColor"
      viewBox="0 0 24 24"
    >
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
    </svg>
  );
}

function ToneSummary({ buy, sell, obs }: { buy: number; sell: number; obs: number }) {
  return (
    <span className="ml-auto flex items-center gap-2 text-xs font-data tabular-nums normal-case">
      {buy > 0 && <span className="text-primary/80">买 {buy}</span>}
      {sell > 0 && (
        <>
          {buy > 0 && <span className="text-muted-foreground/70">·</span>}
          <span className="text-rose-600/85 dark:text-rose-400/85">卖 {sell}</span>
        </>
      )}
      {obs > 0 && (
        <>
          {(buy > 0 || sell > 0) && <span className="text-muted-foreground/70">·</span>}
          <span className="text-muted-foreground/75">观 {obs}</span>
        </>
      )}
    </span>
  );
}

// ---------------------------------------------------------------------------

function Header({
  ticker, side, kols, tweets, index,
}: { ticker: string; side: TickerSide; kols: number; tweets: number; index: number }) {
  const meta = SIDE_META[side];
  return (
    <header className="flex items-center justify-between gap-3 border-b border-border/40 pb-4">
      <div className="flex items-center gap-3 min-w-0">
        <span
          aria-hidden
          className="font-data text-xs tabular-nums text-muted-foreground/70"
        >
          {String(index + 1).padStart(2, '0')}
        </span>
        <Link
          href={`/stock/${ticker}`}
          prefetch={false}
          className="inline-flex items-baseline gap-0.5 font-data text-2xl tracking-tight transition-colors hover:text-sky-400 md:text-3xl"
          aria-label={`查看 ${ticker} 个股详情`}
        >
          <span className="text-sky-400/70">$</span>
          <span className="text-foreground">{ticker}</span>
        </Link>
        <span
          className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs ${meta.chipClass}`}
          aria-label={meta.label}
        >
          <span aria-hidden>{meta.emoji}</span>
          <span>{meta.label}</span>
        </span>
      </div>
      <div className="flex shrink-0 items-baseline gap-3 text-xs uppercase tracking-[0.16em] text-muted-foreground font-data">
        <span className="tabular-nums">
          <span className="text-foreground/85">{kols}</span> KOL
        </span>
        <span aria-hidden className="text-muted-foreground/70">·</span>
        <span className="tabular-nums">
          <span className="text-foreground/85">{tweets}</span> 推
        </span>
      </div>
    </header>
  );
}

interface LaneProps {
  label: string;
  count: number;
  tone: 'buy' | 'sell' | 'observation';
  args: Argument[];
}

const TONE_STYLES: Record<LaneProps['tone'], { bar: string; label: string; bullet: string }> = {
  buy: {
    bar: 'bg-primary',
    label: 'text-primary',
    bullet: 'text-primary/70',
  },
  sell: {
    bar: 'bg-rose-500/85',
    label: 'text-rose-600 dark:text-rose-400',
    bullet: 'text-rose-500/75',
  },
  observation: {
    bar: 'bg-muted-foreground/40',
    label: 'text-muted-foreground',
    bullet: 'text-muted-foreground/70',
  },
};

function Lane({ label, count, tone, args }: LaneProps) {
  const style = TONE_STYLES[tone];
  return (
    <div className="space-y-3">
      <h4 className="flex items-center gap-2.5">
        <span aria-hidden className={`block w-0.5 h-3.5 rounded-full ${style.bar}`} />
        <span
          className={`text-xs font-medium uppercase tracking-[0.18em] ${style.label}`}
        >
          {label}
        </span>
        <span className="text-xs font-data tabular-nums text-muted-foreground/70">
          {count}
        </span>
      </h4>
      <ul className="space-y-2.5">
        {args.map((arg, i) => (
          <ArgumentRow key={i} arg={arg} bulletClass={style.bullet} />
        ))}
      </ul>
    </div>
  );
}

function ArgumentRow({ arg, bulletClass }: { arg: Argument; bulletClass: string }) {
  return (
    <li className="flex gap-3 text-sm leading-relaxed group">
      <span aria-hidden className={`shrink-0 mt-2 ${bulletClass}`}>·</span>
      <div className="min-w-0 flex-1">
        <p className="font-reading text-foreground/90">
          {arg.point_zh}
        </p>
        <div className="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
          <a
            href={safeUserUrl(arg.kol)}
            target="_blank"
            rel="noopener noreferrer"
            className="font-data text-muted-foreground/85 hover:text-sky-400 transition-colors"
          >
            @{arg.kol}
          </a>
          <span aria-hidden className="text-muted-foreground/70">·</span>
          <a
            href={safeTweetUrl(arg.tweet_url)}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-muted-foreground transition-colors hover:text-sky-400"
            aria-label="查看原推"
          >
            原推
            <svg
              aria-hidden
              className="w-3 h-3 opacity-70 group-hover:opacity-100 transition-opacity"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1.75}
                d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"
              />
            </svg>
          </a>
        </div>
      </div>
    </li>
  );
}
