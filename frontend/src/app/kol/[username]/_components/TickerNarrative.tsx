'use client';

import type { KolTickerSummary } from '@/lib/api';

interface Props {
  summary: KolTickerSummary;
}

/**
 * Plain-prose narrative — 4 labeled paragraphs of his actual logic for
 * this stock. Uses Frank's own words (extracted from v3 ticker md) and
 * does NOT impose categorical labels on his stance.
 *
 * Sections:
 *   01 · 在他心目中的定位  = position + thesis + key_logic
 *   02 · 机会             = bull_conditions
 *   03 · 风险             = bear_triggers + veto + falsifiers (combined)
 *   04 · 需要关注的数据     = signals_watched
 */
export default function TickerNarrative({ summary }: Props) {
  const hasPositioning = !!(summary.thesis || summary.key_logic || summary.position);

  // Combine risk-side rules: bear_triggers + veto + falsifiers
  const risks: string[] = [
    ...summary.bear_triggers.slice(0, 3).map(strip),
    ...summary.veto.slice(0, 2).map(strip),
    ...summary.falsifiers.slice(0, 2).map(strip),
  ];

  const blocks: Array<{
    eyebrow: string;
    label: string;
    render: () => React.ReactNode;
  }> = [];

  if (hasPositioning) {
    blocks.push({
      eyebrow: '01',
      label: '在他心目中的定位',
      render: () => (
        <>
          {summary.position ? (
            <p className="mb-1.5 font-data text-[10px] uppercase tracking-[0.16em] text-primary/80">
              {summary.position}
            </p>
          ) : null}
          {summary.thesis ? (
            <p className="text-[15px] font-medium leading-snug text-foreground">
              {summary.thesis}
            </p>
          ) : null}
          {summary.key_logic ? (
            <p className={`${summary.thesis ? 'mt-1.5' : ''} text-[14px] leading-relaxed text-muted-foreground`}>
              {summary.key_logic}
            </p>
          ) : null}
        </>
      ),
    });
  }

  if (summary.bull_conditions.length > 0) {
    blocks.push({
      eyebrow: '02',
      label: '机会',
      render: () => (
        <p className="text-[14px] leading-relaxed text-foreground/90">
          {summary.bull_conditions.slice(0, 4).map(strip).join('；')}。
        </p>
      ),
    });
  }

  if (risks.length > 0) {
    blocks.push({
      eyebrow: '03',
      label: '风险',
      render: () => (
        <p className="text-[14px] leading-relaxed text-foreground/90">
          {risks.join('；')}。
        </p>
      ),
    });
  }

  // 04 · 需要关注的数据 — when >4 items, switch from prose to bullets.
  // Joined sentence above 4 items reads cramped on mobile.
  const signalsItems = summary.signals_watched.slice(0, 6).map(strip);
  if (signalsItems.length > 0) {
    blocks.push({
      eyebrow: '04',
      label: '需要关注的数据',
      render: () =>
        signalsItems.length > 4 ? (
          <ul className="space-y-1.5">
            {signalsItems.map((item, j) => (
              <li
                key={j}
                className="flex gap-2 text-sm leading-relaxed text-foreground/90"
              >
                <span className="mt-2 inline-block h-1 w-1 shrink-0 rounded-full bg-primary/60" />
                <span>{item}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-[14px] leading-relaxed text-foreground/90">
            {signalsItems.join('；')}。
          </p>
        ),
    });
  }

  if (blocks.length === 0) return null;

  return (
    <section className="mt-5 space-y-5 border-t border-border/40 pt-5">
      {blocks.map((b, i) => (
        <div key={i}>
          <p className="font-data text-[10px] uppercase tracking-[0.22em] text-muted-foreground">
            {b.eyebrow} · {b.label}
          </p>
          <div className="mt-2">{b.render()}</div>
        </div>
      ))}
    </section>
  );
}

function strip(s: string): string {
  return s.replace(/^[❌✅⚠️\s]+/, '').trim();
}
