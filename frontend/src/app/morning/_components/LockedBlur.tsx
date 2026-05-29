'use client';

import Link from 'next/link';
import { LockKeyhole } from 'lucide-react';

/**
 * Locked content placeholder for 盘前早报.
 *
 * Pure visual blur. The conversion CTA lives in `SectionUnlockCta` below,
 * rendered once per locked section so the button stays prominent without
 * spamming a link inside every placeholder.
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
        <div className="text-[11px] uppercase tracking-[0.22em] text-muted-foreground/85 font-data">
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
 * locked section card. Sized for easy tap on mobile and obvious on desktop.
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
        className="inline-flex items-center justify-center gap-2 rounded-lg bg-amber-500 px-6 py-3 text-sm font-semibold text-white shadow-md shadow-amber-500/20 transition-colors hover:bg-amber-500/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400/60 focus-visible:ring-offset-2 focus-visible:ring-offset-background"
      >
        <LockKeyhole className="w-4 h-4" aria-hidden />
        {label}
      </Link>
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
  trialEligible,
  targetPath,
}: {
  isAuthenticated: boolean;
  trialEligible: boolean;
  targetPath: string;
}) {
  let ctaHref: string;
  let ctaLabel: string;
  if (!isAuthenticated) {
    ctaHref = `/login?redirect=${encodeURIComponent(targetPath)}`;
    ctaLabel = '注册免费体验 14 天';
  } else if (trialEligible) {
    ctaHref = '/pricing';
    ctaLabel = '开启 14 天免费试用';
  } else {
    ctaHref = '/pricing';
    ctaLabel = '订阅解锁全部内容';
  }

  return (
    <section
      className="rounded-xl border border-amber-400/35 bg-gradient-to-br from-amber-400/12 via-amber-400/5 to-transparent p-6 md:p-7"
      aria-label="升级订阅提示"
    >
      <div className="flex flex-col items-start gap-5 md:flex-row md:items-center md:justify-between">
        <div className="space-y-2 max-w-xl">
          <p className="text-[11px] uppercase tracking-[0.25em] text-amber-600 dark:text-amber-300 font-data">
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
        <Link
          href={ctaHref}
          className="inline-flex items-center justify-center gap-2 rounded-lg bg-amber-500 px-5 py-3 text-sm font-semibold text-white transition-colors hover:bg-amber-500/90 whitespace-nowrap"
        >
          {ctaLabel}
        </Link>
      </div>
    </section>
  );
}
