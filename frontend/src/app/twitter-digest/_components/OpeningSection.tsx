/**
 * Opening — 一行 headline + 元信息。
 *
 * `intro` 字段已弃用，前端不再渲染（早期版本是 80-150 字编辑导览段，
 * 实测散户不读，已砍）。
 */

import Link from 'next/link';

import type { HotItem } from './types';

interface Props {
  date: string;
  headline: string;
  windowHours: number;
  trackedKolCount: number;
  inputTweetCount: number;
  topTicker?: HotItem;
  topSector?: HotItem;
  topEvent?: HotItem;
}

const WEEKDAYS = ['星期日', '星期一', '星期二', '星期三', '星期四', '星期五', '星期六'];

// `date` is the ET market day stored by the backend. Use UTC arithmetic to
// derive the weekday so the result is the same in every reader's timezone.
function formatHeaderDate(date: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return date;
  const [y, m, d] = date.split('-').map(Number);
  const weekday = WEEKDAYS[new Date(Date.UTC(y, m - 1, d)).getUTCDay()];
  return `${y} 年 ${m} 月 ${d} 日 · ${weekday}`;
}

export function OpeningSection({
  date, headline, windowHours, trackedKolCount, inputTweetCount,
  topTicker, topSector, topEvent,
}: Props) {
  const hasRadar = !!(topTicker || topSector || topEvent);
  return (
    <section
      className="text-center space-y-5 py-2 animate-fade-in-up"
      aria-label="今日开场"
    >
      <p className="text-sm text-muted-foreground tabular-nums">
        {formatHeaderDate(date)}
      </p>

      {headline ? (
        <h1 className="font-editorial text-3xl md:text-4xl text-foreground tracking-tight max-w-2xl mx-auto leading-tight">
          {headline}
        </h1>
      ) : (
        <h1 className="font-editorial text-3xl md:text-4xl text-foreground tracking-tight">
          KOL 观点日报
        </h1>
      )}

      <p className="text-xs text-muted-foreground/80 tabular-nums">
        过去 <span className="font-data text-foreground/70">{windowHours}</span> 小时,
        <span className="font-data text-foreground/70">{trackedKolCount}</span> 位金融博主的观点汇总,
        覆盖 <span className="font-data text-foreground/70">{inputTweetCount}</span> 条推文
      </p>

      {hasRadar && (
        <div
          className="flex flex-wrap justify-center items-center gap-2 md:gap-3 pt-1"
          aria-label="今日最热"
        >
          <span className="text-xs font-medium uppercase tracking-[0.16em] text-muted-foreground">
            今日最热
          </span>
          {topTicker && <RadarChip kind="ticker" item={topTicker} />}
          {topSector && <RadarChip kind="sector" item={topSector} />}
          {topEvent && <RadarChip kind="event" item={topEvent} />}
        </div>
      )}

    </section>
  );
}

// ---------------------------------------------------------------------------

function RadarChip({ kind, item }: { kind: 'ticker' | 'sector' | 'event'; item: HotItem }) {
  const isTicker = kind === 'ticker';
  const symbol = isTicker ? item.label.replace(/^\$/, '') : null;
  const kols = item.kols ?? 0;

  const labelNode = isTicker && symbol ? (
    <span className="inline-flex items-baseline gap-0.5 font-data">
      <span className="text-sky-400/75">$</span>
      <span className="text-foreground/95">{symbol}</span>
    </span>
  ) : (
    <span className="font-editorial text-foreground/90">{item.label}</span>
  );

  const sharedClass = "group inline-flex items-center gap-1.5 rounded-full border border-border/65 bg-background/80 px-3 py-1 text-sm transition-all hover:border-sky-400/55 hover:bg-sky-400/5";
  const innerContent = (
    <>
      {labelNode}
      {kols > 0 && (
        <span className="text-xs font-data tabular-nums text-muted-foreground transition-colors group-hover:text-sky-400">
          {kols} KOL
        </span>
      )}
    </>
  );

  if (isTicker && symbol) {
    return (
      <Link
        href={`/stock/${symbol}`}
        prefetch={false}
        className={sharedClass}
        aria-label={`查看 ${symbol} 个股详情`}
      >
        {innerContent}
      </Link>
    );
  }
  return (
    <a href="#hot-leaderboard" className={sharedClass}>
      {innerContent}
    </a>
  );
}
