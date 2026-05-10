/**
 * V4 Ticker Section — replaces V3 stock-level Topic cards.
 *
 * Renders all KOL discussion of a single ticker, organized by argument
 * direction (买入逻辑 / 卖出逻辑 / 数据观察). The reframing is from
 * "stance" (KOL 立场, 易误判) to "direction" (论据指向, 客观分类).
 *
 * Visual language follows the standard daily report:
 *   - emerald 主色 for ticker + buy lane
 *   - rose 主色 for sell lane
 *   - muted for observation
 *   - serif (font-editorial) for headers + synthesis
 *   - data font for KOL/count metadata
 *   - small uppercase tracking for section labels
 */

import { safeUserUrl, safeTweetUrl } from './safeUrl';
import type { Argument, TickerThesis } from './types';

interface Props {
  thesis: TickerThesis;
  index: number;
}

export function TickerSection({ thesis, index }: Props) {
  const total =
    thesis.buy_arguments.length +
    thesis.sell_arguments.length +
    thesis.observation_arguments.length;
  if (total === 0) return null;

  return (
    <section
      id={`ticker-${thesis.ticker}`}
      className="rounded-xl border border-border/60 bg-card/40 p-5 md:p-7 animate-fade-in-up scroll-mt-24"
      aria-label={`${thesis.ticker} 综合讨论`}
    >
      <Header
        ticker={thesis.ticker}
        kols={thesis.primary_kols.length}
        tweets={thesis.tweet_count}
        index={index}
      />

      {thesis.synthesis_zh && (
        <p className="mt-4 text-[15px] leading-[1.85] text-foreground/85 font-editorial border-l-2 border-primary/35 pl-4 py-1">
          {thesis.synthesis_zh}
        </p>
      )}

      {total > 0 && (
        <details className="mt-5 group">
          <summary className="list-none cursor-pointer flex items-center gap-2 text-[11px] uppercase tracking-[0.22em] text-muted-foreground/75 hover:text-primary transition-colors py-1.5 select-none">
            <Caret />
            <span className="group-open:hidden">展开论据</span>
            <span className="hidden group-open:inline">收起论据</span>
            <span className="font-data tabular-nums text-muted-foreground/55 normal-case">
              ({total})
            </span>
            <ToneSummary
              buy={thesis.buy_arguments.length}
              sell={thesis.sell_arguments.length}
              obs={thesis.observation_arguments.length}
            />
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
    <span className="ml-auto flex items-center gap-2 text-[10px] font-data tabular-nums normal-case">
      {buy > 0 && <span className="text-primary/80">买 {buy}</span>}
      {sell > 0 && (
        <>
          {buy > 0 && <span className="text-muted-foreground/35">·</span>}
          <span className="text-rose-600/85 dark:text-rose-400/85">卖 {sell}</span>
        </>
      )}
      {obs > 0 && (
        <>
          {(buy > 0 || sell > 0) && <span className="text-muted-foreground/35">·</span>}
          <span className="text-muted-foreground/75">观 {obs}</span>
        </>
      )}
    </span>
  );
}

// ---------------------------------------------------------------------------

function Header({
  ticker, kols, tweets, index,
}: { ticker: string; kols: number; tweets: number; index: number }) {
  return (
    <header className="flex items-baseline justify-between gap-3 border-b border-border/40 pb-4">
      <h3 className="flex items-baseline gap-3 min-w-0">
        <span
          aria-hidden
          className="font-data text-[10px] tabular-nums text-muted-foreground/60 mt-1"
        >
          {String(index + 1).padStart(2, '0')}
        </span>
        <span className="inline-flex items-baseline gap-0.5 font-data text-2xl md:text-[26px] tracking-tight">
          <span className="text-primary/70">$</span>
          <span className="text-foreground">{ticker}</span>
        </span>
      </h3>
      <div className="flex items-baseline gap-3 shrink-0 text-[11px] uppercase tracking-[0.2em] text-muted-foreground/75 font-data">
        <span className="tabular-nums">
          <span className="text-foreground/85">{kols}</span> KOL
        </span>
        <span aria-hidden className="text-muted-foreground/35">·</span>
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
    bullet: 'text-muted-foreground/60',
  },
};

function Lane({ label, count, tone, args }: LaneProps) {
  const style = TONE_STYLES[tone];
  return (
    <div className="space-y-3">
      <h4 className="flex items-center gap-2.5">
        <span aria-hidden className={`block w-0.5 h-3.5 rounded-full ${style.bar}`} />
        <span
          className={`text-[11px] uppercase tracking-[0.22em] font-medium ${style.label}`}
        >
          {label}
        </span>
        <span className="text-[10px] font-data tabular-nums text-muted-foreground/55">
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
        <p className="text-foreground/90 font-editorial">
          {arg.point_zh}
        </p>
        <div className="mt-1 flex items-center gap-2 text-[11px] text-muted-foreground/75">
          <a
            href={safeUserUrl(arg.kol)}
            target="_blank"
            rel="noopener noreferrer"
            className="font-data text-muted-foreground/85 hover:text-primary transition-colors"
          >
            @{arg.kol}
          </a>
          <span aria-hidden className="text-muted-foreground/35">·</span>
          <a
            href={safeTweetUrl(arg.tweet_url)}
            target="_blank"
            rel="noopener noreferrer"
            className="text-muted-foreground/65 hover:text-primary transition-colors inline-flex items-center gap-1"
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
