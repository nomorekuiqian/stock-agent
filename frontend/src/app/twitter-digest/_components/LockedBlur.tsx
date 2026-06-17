'use client';

import { useEffect } from 'react';

import { UnlockCTA } from '@/components/UnlockCTA';
import { trackPaywallView } from '@/lib/paywall-analytics';

const SOURCE = 'twitter_digest' as const;

/**
 * Locked content placeholder.
 *
 * Renders a blurred multi-line skeleton that visually communicates "real
 * content lives here" rather than an empty card. Used to occupy the spot
 * where an entitled user would see synthesis paragraphs, KOL arguments, or
 * evidence — keeping the page layout identical between free and Pro users.
 *
 * `kolSample` is shown as a chip row under the label to surface real KOL
 * names (e.g. "@AdamFletch / @JoshBrown 等") — a stronger conversion hook
 * than the bare "X 条论据" count.
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
      aria-label={label ? `${label}（订阅解锁）` : '订阅解锁'}
    >
      {label && (
        <div className="text-xs font-medium uppercase tracking-[0.16em] text-muted-foreground">
          {label}
        </div>
      )}
      {sample.length > 0 && (
        <div className="mt-2 flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
          {sample.map((kol) => (
            <span
              key={kol}
              className="font-data text-foreground normal-case tracking-normal"
            >
              @{kol}
            </span>
          ))}
          <span className="text-muted-foreground normal-case tracking-normal">等</span>
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
 * locked card (TickerSection / MacroSection / Watchpoint).
 */
export function SectionUnlockCta() {
  return (
    <div className="mt-5 flex justify-center">
      <UnlockCTA source={SOURCE} tier="pro" variant="primary" label="升级 Pro 解锁" hideArrow />
    </div>
  );
}

/**
 * Mid-page upgrade banner shown after the HotLeaderboard when the digest is
 * locked. Placed below the leaderboard (not the page hero) so free users see
 * the headline + KOL attention ranking first.
 */
export function UpgradeBanner({
  isAuthenticated,
  targetPath,
}: {
  isAuthenticated: boolean;
  targetPath: string;
}) {
  useEffect(() => {
    trackPaywallView({ source: SOURCE, tier: 'pro' });
  }, []);

  void isAuthenticated;

  return (
    <section
      className="rounded-xl border border-amber-400/35 bg-gradient-to-br from-amber-400/10 via-amber-400/5 to-transparent p-6 md:p-8"
      aria-label="升级提示"
    >
      <div className="flex flex-col items-start gap-5 md:flex-row md:items-center md:justify-between">
        <div className="space-y-2 max-w-xl">
          <p className="text-xs font-medium uppercase tracking-[0.16em] text-amber-700 dark:text-amber-300">
            Premium Intelligence
          </p>
          <h3 className="text-xl md:text-2xl font-editorial text-foreground">
            解锁今日完整 KOL 立场分析
          </h3>
          <p className="text-sm text-muted-foreground leading-relaxed">
            每个个股的多空论据、原推证据链、宏观议题完整论述与短期关注事件的深度解读。
          </p>
        </div>
        <UnlockCTA
          source={SOURCE}
          tier="pro"
          variant="primary"
          label="升级 Pro 解锁"
          returnPath={targetPath}
          hideArrow
        />
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
  void isAuthenticated;
  return (
    <section
      className="rounded-xl border border-amber-400/30 bg-amber-400/5 px-5 py-4 md:px-6 md:py-5"
      aria-label="升级提示"
    >
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <p className="text-sm text-foreground/90 leading-relaxed">
          看完了今日 KOL 关注度榜 — 完整多空论据、宏观论述与短期事件深度解读为订阅者开放。
        </p>
        <UnlockCTA
          source={SOURCE}
          tier="pro"
          variant="primary"
          label="升级 Pro 解锁"
          returnPath={targetPath}
          hideArrow
        />
      </div>
    </section>
  );
}
