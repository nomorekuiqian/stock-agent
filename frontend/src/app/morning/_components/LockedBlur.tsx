'use client';

import { useEffect } from 'react';

import { UnlockCTA } from '@/components/UnlockCTA';
import { trackPaywallView } from '@/lib/paywall-analytics';

const SOURCE = 'morning' as const;

/**
 * Locked content placeholder for 盘前早报.
 *
 * Pure visual blur. The conversion CTA lives in `SectionUnlockCta` /
 * `UpgradeBanner` — both now defer to the shared `<UnlockCTA />` component.
 */
export function LockedBlur({
  lines = 3,
  label,
  variant = 'paragraph',
}: {
  lines?: number;
  label?: string;
  variant?: 'paragraph' | 'bullets';
}) {
  return (
    <div
      className="relative rounded-md border border-dashed border-amber-400/30 bg-amber-400/5 px-4 py-3"
      aria-label={label ? `${label}（订阅解锁）` : '订阅解锁'}
    >
      {label && (
        <div className="text-xs font-medium uppercase tracking-[0.16em] text-muted-foreground">
          {label}
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
 * locked section card.
 */
export function SectionUnlockCta() {
  return (
    <div className="mt-5 flex justify-center">
      <UnlockCTA source={SOURCE} variant="primary" hideArrow />
    </div>
  );
}

/**
 * Top-of-page upgrade banner shown when 盘前早报 is locked.
 *
 * Section-level locks do the bulk of the conversion work; this banner is the
 * single primary CTA above the fold.
 */
export function UpgradeBanner({
  isAuthenticated,
  targetPath,
}: {
  isAuthenticated: boolean;
  targetPath: string;
}) {
  useEffect(() => {
    trackPaywallView({ source: SOURCE, tier: 'max' });
  }, []);

  // The shared CTA derives auth + returnPath internally; prop API preserved
  // for the legacy callers in MorningReportBody.
  void isAuthenticated;

  return (
    <section
      className="rounded-xl border border-amber-400/35 bg-gradient-to-br from-amber-400/12 via-amber-400/5 to-transparent p-6 md:p-7"
      aria-label="升级订阅提示"
    >
      <div className="flex flex-col items-start gap-5 md:flex-row md:items-center md:justify-between">
        <div className="space-y-2 max-w-xl">
          <p className="text-xs font-medium uppercase tracking-[0.16em] text-amber-600 dark:text-amber-300">
            Morning Brief · Subscribers Only
          </p>
          <h3 className="text-xl md:text-2xl font-editorial text-foreground">
            解锁今日盘前完整解读
          </h3>
          <p className="text-sm text-muted-foreground leading-relaxed">
            期货与全球市场走势已开放查看；每日 AI 撰写的隔夜要闻、今日焦点与开盘
            策略归属订阅用户。
          </p>
        </div>
        <UnlockCTA source={SOURCE} variant="primary" returnPath={targetPath} hideArrow />
      </div>
    </section>
  );
}
