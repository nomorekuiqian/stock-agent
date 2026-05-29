'use client';

import Link from 'next/link';
import { LockKeyhole } from 'lucide-react';

/**
 * Locked content placeholder.
 *
 * Renders a blurred multi-line skeleton that visually communicates "real
 * content lives here" rather than an empty card. Used to occupy the spot
 * where a Max user would see synthesis paragraphs, KOL arguments, or
 * evidence — keeping the page layout identical between free and Max users.
 *
 * `kolSample` is shown as a chip row under the label to surface real KOL
 * names (e.g. "@AdamFletch / @JoshBrown 等") — a stronger conversion hook
 * than the bare "X 条论据" count.
 *
 * The per-section conversion CTA is handled by `SectionUnlockCta` below,
 * which renders one centered, prominent button per locked card. Keep the
 * placeholder itself pure visual so multiple stacked LockedBlurs in one
 * section don't repeat the CTA noisily.
 */
export function LockedBlur({
  lines = 3,
  label,
  variant = 'paragraph',
  kolSample,
}: {
  /** How many skeleton lines to render. Approximates the real content length. */
  lines?: number;
  /** Small caption shown above the blurred lines (e.g. "5 条看多论据"). */
  label?: string;
  /** Visual treatment. `paragraph` for prose; `bullets` for list-style. */
  variant?: 'paragraph' | 'bullets';
  /** Up to ~3 KOL handles to surface under the label (without @). */
  kolSample?: string[];
}) {
  const sample = (kolSample ?? []).filter(Boolean).slice(0, 3);
  return (
    <div
      className="relative rounded-md border border-dashed border-border/60 bg-muted/15 px-4 py-3"
      aria-label={label ? `${label}（Max 解锁）` : 'Max 解锁'}
    >
      {label && (
        <div className="text-[11px] uppercase tracking-[0.22em] text-muted-foreground/85 font-data">
          {label}
        </div>
      )}
      {sample.length > 0 && (
        <div className="mt-2 flex flex-wrap items-center gap-1.5 text-[11px] text-muted-foreground/85">
          {sample.map((kol) => (
            <span
              key={kol}
              className="font-data text-foreground/75 normal-case tracking-normal"
            >
              @{kol}
            </span>
          ))}
          <span className="text-muted-foreground/55 normal-case tracking-normal">等</span>
        </div>
      )}
      <div
        className={`mt-3 space-y-2 select-none pointer-events-none ${
          variant === 'bullets' ? 'pl-4' : ''
        }`}
        aria-hidden
      >
        {Array.from({ length: lines }).map((_, i) => (
          <div
            key={i}
            className="h-[12px] rounded-full bg-foreground/12 blur-[5px]"
            style={{
              width: `${variant === 'bullets'
                ? 60 + Math.round(Math.sin(i + 1) * 18 + 18)
                : 92 - i * 7
              }%`,
              opacity: 0.85 - i * 0.05,
            }}
          />
        ))}
      </div>
    </div>
  );
}

/**
 * Section-level unlock CTA. Centered, prominent button rendered once per
 * locked card (TickerSection / MacroSection / Watchpoint). Sized for easy
 * tap on mobile and obvious on desktop — the per-blur inline link was too
 * small to act as the primary affordance.
 */
export function SectionUnlockCta({
  label = '订阅解锁',
}: {
  label?: string;
}) {
  return (
    <div className="mt-5 flex justify-center">
      <Link
        href="/pricing"
        className="inline-flex items-center justify-center gap-2 rounded-lg bg-amber-600 px-6 py-3 text-sm font-semibold text-white shadow-md shadow-amber-600/20 transition-colors hover:bg-amber-600/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400/60 focus-visible:ring-offset-2 focus-visible:ring-offset-background"
      >
        <LockKeyhole className="w-4 h-4" aria-hidden />
        {label}
      </Link>
    </div>
  );
}

/**
 * Mid-page upgrade banner shown after the HotLeaderboard when the digest is
 * locked. Placed below the leaderboard (not the page hero) so free users see
 * the headline + KOL attention ranking first — the leaderboard is itself a
 * teaser, and putting the banner *after* it lowers the "this is a paywall"
 * defensive reaction.
 *
 * Paired with `BottomUpgradeCard` at the natural end of the page; together
 * they carry the page-level CTA load so per-section `LockedBlur` only needs
 * to show the inline upgrade link on the very first instance.
 */
export function UpgradeBanner({
  isAuthenticated,
  targetPath,
}: {
  isAuthenticated: boolean;
  targetPath: string;
}) {
  const ctaHref = isAuthenticated
    ? '/pricing'
    : `/login?redirect=${encodeURIComponent(targetPath)}`;
  const ctaLabel = isAuthenticated ? '升级 Max 解锁全文' : '登录后开通 Max';

  return (
    <section
      className="rounded-xl border border-amber-400/35 bg-gradient-to-br from-amber-400/10 via-amber-400/5 to-transparent p-6 md:p-8"
      aria-label="升级 Max 提示"
    >
      <div className="flex flex-col items-start gap-5 md:flex-row md:items-center md:justify-between">
        <div className="space-y-2 max-w-xl">
          <p className="text-[11px] uppercase tracking-[0.25em] text-amber-700 dark:text-amber-300 font-data">
            Max Intelligence
          </p>
          <h3 className="text-xl md:text-2xl font-editorial text-foreground">
            解锁今日完整 KOL 立场分析
          </h3>
          <p className="text-sm text-muted-foreground leading-relaxed">
            每个个股的多空论据、原推证据链、宏观议题完整论述与短期关注事件的深度
            解读，都为 Max 用户开放。
          </p>
        </div>
        <Link
          href={ctaHref}
          className="inline-flex items-center justify-center gap-2 rounded-lg bg-amber-600 px-5 py-3 text-sm font-semibold text-white transition-colors hover:bg-amber-600/90 whitespace-nowrap"
        >
          {ctaLabel}
        </Link>
      </div>
    </section>
  );
}

/**
 * Bottom-of-page upgrade CTA, sibling to `UpgradeBanner`.
 *
 * Tighter visual than the top banner — single line + button — so the user
 * who scrolled past every locked section meets a clear next step without a
 * second hero-sized block of the same copy.
 */
export function BottomUpgradeCard({
  isAuthenticated,
  targetPath,
}: {
  isAuthenticated: boolean;
  targetPath: string;
}) {
  const ctaHref = isAuthenticated
    ? '/pricing'
    : `/login?redirect=${encodeURIComponent(targetPath)}`;
  const ctaLabel = isAuthenticated ? '升级 Max 解锁全文' : '登录后开通 Max';

  return (
    <section
      className="rounded-xl border border-amber-400/30 bg-amber-400/5 px-5 py-4 md:px-6 md:py-5"
      aria-label="升级 Max 提示"
    >
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <p className="text-sm text-foreground/90 leading-relaxed">
          看完了今日 KOL 关注度榜 — 完整多空论据、宏观论述与短期事件深度解读为 Max 订阅者开放。
        </p>
        <Link
          href={ctaHref}
          className="inline-flex items-center justify-center gap-2 rounded-lg bg-amber-600 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-amber-600/90 whitespace-nowrap"
        >
          {ctaLabel}
        </Link>
      </div>
    </section>
  );
}
