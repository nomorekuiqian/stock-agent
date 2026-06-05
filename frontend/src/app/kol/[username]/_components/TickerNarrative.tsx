'use client';

import type { KolTickerSummary } from '@/lib/api';
import { cn } from '@/lib/utils';

interface Props {
  summary: KolTickerSummary;
}

/**
 * Plain-prose narrative — 4 labeled paragraphs of his actual logic for
 * this stock. Uses qinbafrank's own words (extracted from ticker skill markdown) and
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

  const bulls = summary.bull_conditions.slice(0, 4).map(strip);
  const risks: string[] = [
    ...summary.bear_triggers.slice(0, 3).map(strip),
    ...summary.veto.slice(0, 2).map(strip),
    ...summary.falsifiers.slice(0, 2).map(strip),
  ];
  const signalsItems = summary.signals_watched.slice(0, 6).map(strip);

  const hasBullsOrRisks = bulls.length > 0 || risks.length > 0;
  const hasAny = hasPositioning || hasBullsOrRisks || signalsItems.length > 0;
  if (!hasAny) return null;

  return (
    <section className="mt-6 border-t border-border/40 pt-5">
      <div className="mb-4 flex items-center justify-between gap-3">
        <p className="text-sm font-medium leading-snug tracking-wide text-muted-foreground">
          观点框架
        </p>
        <span className="h-px flex-1 bg-border/40" aria-hidden />
      </div>
      <div className="space-y-3">
        {hasPositioning ? (
          <FrameCard eyebrow="01" label="在他心目中的定位" tone="primary">
            {summary.position ? (
              <p className="mb-1.5 text-sm font-medium leading-snug tracking-wide text-primary">
                {summary.position}
              </p>
            ) : null}
            {summary.thesis ? (
              <p className="max-w-[58ch] text-base font-semibold leading-snug text-foreground">
                {summary.thesis}
              </p>
            ) : null}
            {summary.key_logic ? (
              <p
                className={`${summary.thesis ? 'mt-1.5' : ''} text-sm leading-relaxed text-muted-foreground`}
              >
                {summary.key_logic}
              </p>
            ) : null}
          </FrameCard>
        ) : null}

        {hasBullsOrRisks ? (
          <FrameCard eyebrow="02" label="机会 / 风险" tone="amber">
            <div className="grid gap-4 md:grid-cols-2 md:gap-5">
              <div>
                <p className="text-sm font-medium leading-snug tracking-wide text-primary">
                  机会
                </p>
                {bulls.length > 0 ? (
                  <p className="mt-1.5 text-sm leading-relaxed text-foreground">
                    {bulls.join('；')}。
                  </p>
                ) : (
                  <p className="mt-1.5 text-sm text-muted-foreground">—</p>
                )}
              </div>
              <div>
                <p className="text-sm font-medium leading-snug tracking-wide text-destructive">
                  风险
                </p>
                {risks.length > 0 ? (
                  <p className="mt-1.5 text-sm leading-relaxed text-foreground">
                    {risks.join('；')}。
                  </p>
                ) : (
                  <p className="mt-1.5 text-sm text-muted-foreground">—</p>
                )}
              </div>
            </div>
          </FrameCard>
        ) : null}

        {signalsItems.length > 0 ? (
          <FrameCard eyebrow="03" label="需要关注的数据" tone="sky">
            {signalsItems.length > 4 ? (
              <ul className="space-y-1.5">
                {signalsItems.map((item, j) => (
                  <li
                    key={j}
                    className="flex gap-2 text-sm leading-relaxed text-foreground"
                  >
                    <span className="mt-2 inline-block h-1.5 w-1.5 shrink-0 rounded-full bg-sky-400" />
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm leading-relaxed text-foreground">
                {signalsItems.join('；')}。
              </p>
            )}
          </FrameCard>
        ) : null}
      </div>
    </section>
  );
}

function FrameCard({
  eyebrow,
  label,
  tone,
  children,
}: {
  eyebrow: string;
  label: string;
  tone: 'primary' | 'amber' | 'sky';
  children: React.ReactNode;
}) {
  const toneClass = {
    primary: 'border-primary/25 bg-primary/[0.045]',
    amber: 'border-amber-500/25 bg-amber-500/[0.04]',
    sky: 'border-sky-500/25 bg-sky-500/[0.04]',
  }[tone];

  const dotClass = {
    primary: 'bg-primary',
    amber: 'bg-amber-500',
    sky: 'bg-sky-400',
  }[tone];

  return (
    <div className={cn('stock-motion-card rounded-md border p-4 transition-colors duration-200', toneClass)}>
      <div className="flex items-center gap-2">
        <span className={cn('h-1.5 w-1.5 rounded-full', dotClass)} aria-hidden />
        <p className="text-sm font-medium leading-snug tracking-wide text-muted-foreground">
          <span className="font-data tabular-nums text-foreground">{eyebrow}</span> · {label}
        </p>
      </div>
      <div className="mt-2">{children}</div>
    </div>
  );
}

const LEADING_MARKER_RE = /^[\s\u2705\u274c\u26a0\uFE0F]+/u;

function strip(s: string): string {
  return s.replace(LEADING_MARKER_RE, '').trim();
}
