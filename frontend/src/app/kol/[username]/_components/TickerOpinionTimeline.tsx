'use client';

import type { CSSProperties } from 'react';
import { ArrowUpRight } from 'lucide-react';

import { useKolTickerTimeline } from '@/hooks/queries/use-kol-data';
import type { KolCockpitTickerTimelineItem } from '@/lib/api';

interface Props {
  username: string;
  ticker: string;
}

/**
 * Vertical opinion timeline for a single ticker. Each node = date + content
 * type chip + stance chip + qinbafrank's one-line key_claim + link back to the
 * original tweet. Server-side already picked the ~10 most informative
 * mentions and returns them newest-first; this component just renders them.
 */
export default function TickerOpinionTimeline({ username, ticker }: Props) {
  const { data, isLoading, isError } = useKolTickerTimeline(username, ticker);

  if (isLoading) {
    return (
      <div className="space-y-3 py-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-16 animate-pulse rounded bg-muted/30" />
        ))}
      </div>
    );
  }

  if (isError || !data) {
    return (
      <p className="py-8 text-center text-sm text-muted-foreground">
        无法加载观点时间线
      </p>
    );
  }

  if (data.items.length === 0) {
    return (
      <p className="py-8 text-center text-sm text-muted-foreground">
        暂无可整理的观点
      </p>
    );
  }

  return (
    <ol className="relative ml-2 space-y-5 border-l border-border/40 pl-5">
      {data.items.map((item, index) => (
        <TimelineNode key={item.id} item={item} isLatest={index === 0} index={index} />
      ))}
    </ol>
  );
}

function TimelineNode({
  item,
  isLatest,
  index,
}: {
  item: KolCockpitTickerTimelineItem;
  isLatest: boolean;
  index: number;
}) {
  const ds = formatDate(item.created_at);
  const cType = typeLabel(item.content_type);
  const stance = stanceLabel(item.stance);
  const claim = stripTypePrefix(item.key_claim);

  return (
    <li
      className={`stock-motion-timeline-item relative ${isLatest ? 'stock-motion-latest' : ''}`}
      style={{ '--stock-item-index': index } as CSSProperties}
    >
      {/* Marker dot */}
      <span
        aria-hidden
        className={`absolute -left-[1.55rem] top-1.5 grid h-3 w-3 place-items-center rounded-full border bg-background ${
          isLatest ? 'border-primary/70' : 'border-border/70'
        }`}
      >
        <span className={`stock-motion-dot h-1.5 w-1.5 rounded-full ${isLatest ? 'bg-primary' : 'bg-muted-foreground'}`} />
      </span>

      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
        <span className="font-data text-xs font-medium uppercase tracking-[0.14em] text-muted-foreground tabular-nums">
          {ds}
        </span>
        {cType ? (
          <span className="rounded-sm border border-border/50 bg-card/40 px-1.5 py-0.5 text-xs font-medium text-muted-foreground">
            {cType}
          </span>
        ) : null}
        {stance ? (
          <span
            className={`rounded-sm px-1.5 py-0.5 text-xs font-medium ${stance.tone}`}
          >
            {stance.label}
          </span>
        ) : null}
        {isLatest ? (
          <span className="rounded-sm border border-primary/25 bg-primary/10 px-1.5 py-0.5 text-xs font-medium text-primary">
            最新
          </span>
        ) : null}
      </div>

      {claim ? (
        <p className="mt-1.5 text-sm leading-relaxed text-foreground">
          {claim}
        </p>
      ) : null}

      {item.url ? (
        <a
          href={item.url}
          target="_blank"
          rel="noreferrer"
          className="group mt-2 inline-flex min-h-8 items-center gap-1.5 rounded-md border border-border/45 bg-card/35 px-2.5 text-sm font-medium text-muted-foreground transition duration-200 ease-out motion-safe:hover:-translate-y-px hover:border-primary/40 hover:bg-primary/10 hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30"
        >
          看原文
          <ArrowUpRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
        </a>
      ) : null}
    </li>
  );
}

function formatDate(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function typeLabel(ct: string | null): string {
  switch (ct) {
    case 'thesis':
      return '投资逻辑';
    case 'catalyst':
      return '催化剂';
    case 'risk_flag':
      return '风险';
    case 'sector_framework':
      return '板块框架';
    case 'trade_action':
      return '交易动作';
    default:
      return '';
  }
}

function stanceLabel(s: KolCockpitTickerTimelineItem['stance']): { label: string; tone: string } | null {
  if (s === 'bull') return { label: '看多', tone: 'bg-primary/15 text-primary' };
  if (s === 'bear') return { label: '看空', tone: 'bg-destructive/15 text-destructive' };
  if (s === 'neutral') return { label: '中性', tone: 'bg-muted/40 text-muted-foreground' };
  return null;
}

/** Strip "投资逻辑: " / "催化剂: " etc. prefixes from key_claim so the chip and
 * prose don't double-state the content type. Tolerates both `: ` and `：` and
 * leading whitespace. */
function stripTypePrefix(s: string | null): string {
  if (!s) return '';
  return s.replace(/^\s*(投资逻辑|催化剂|风险|板块框架|交易动作|宏观观点)\s*[:：]\s*/u, '');
}
