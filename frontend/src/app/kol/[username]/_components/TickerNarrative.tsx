'use client';

import type { KolTickerSummary } from '@/lib/api';

interface Props {
  summary: KolTickerSummary;
}

/**
 * Plain-prose narrative — 4 labeled paragraphs of his actual logic for
 * this stock. Uses Frank's own words (extracted from ticker skill markdown) and
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
        <p className="text-xs font-medium uppercase tracking-[0.16em] text-muted-foreground">
          观点框架
        </p>
        <span className="h-px flex-1 bg-border/40" aria-hidden />
      </div>
      <div className="space-y-3">
        {hasPositioning ? (
          <FrameCard eyebrow="01" label="在他心目中的定位">
            {summary.position ? (
              <p className="mb-1.5 text-xs font-medium uppercase tracking-[0.14em] text-primary">
                {summary.position}
              </p>
            ) : null}
            {summary.thesis ? (
              <p className="text-base font-medium leading-snug text-foreground">
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
          <FrameCard eyebrow="02" label="机会 / 风险">
            <div className="grid gap-4 md:grid-cols-2 md:gap-5">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-emerald-600 dark:text-emerald-400">
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
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-destructive">
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
          <FrameCard eyebrow="03" label="需要关注的数据">
            {signalsItems.length > 4 ? (
              <ul className="space-y-1.5">
                {signalsItems.map((item, j) => (
                  <li
                    key={j}
                    className="flex gap-2 text-sm leading-relaxed text-foreground"
                  >
                    <span className="mt-2 inline-block h-1 w-1 shrink-0 rounded-full bg-primary/60" />
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
  children,
}: {
  eyebrow: string;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-md border border-border/40 bg-card/20 p-4">
      <p className="text-xs font-medium uppercase tracking-[0.16em] text-muted-foreground">
        {eyebrow} · {label}
      </p>
      <div className="mt-2">{children}</div>
    </div>
  );
}

const LEADING_MARKER_RE = /^[\s\u2705\u274c\u26a0\uFE0F]+/u;

function strip(s: string): string {
  return s.replace(LEADING_MARKER_RE, '').trim();
}
