'use client';

import { useEffect } from 'react';
import { Sparkles, BarChart3, Bot } from 'lucide-react';

import { UnlockCTA } from '@/components/UnlockCTA';
import { trackPaywallView } from '@/lib/paywall-analytics';

/**
 * Personal-digest lock UI. Mirrors the Twitter-digest lock screen
 * (LockedBlur / UpgradeBanner / BottomUpgradeCard). Uses the shared amber
 * paywall palette so all in-product paywalls look the same — earlier the
 * file used indigo, but the global visual language is now: amber == paid
 * upsell.
 */

const SOURCE = 'personal_digest' as const;

/**
 * Blurred placeholder for one analysis block. Matches the height and rhythm
 * of a real prose block so the locked page keeps the same layout as paid.
 */
export function DigestLockedBlur({
  lines = 4,
  label,
  variant = 'paragraph',
}: {
  lines?: number;
  label?: string;
  variant?: 'paragraph' | 'bullets';
}) {
  return (
    <div
      className="relative rounded-md border border-dashed border-amber-400/25 bg-amber-400/[0.06] px-4 py-3"
      aria-label={label ? `${label}（订阅解锁）` : '订阅解锁'}
    >
      {label && (
        <div className="font-data text-[11px] uppercase tracking-[0.22em] text-amber-600 dark:text-amber-300">
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
              width: `${
                variant === 'bullets'
                  ? 60 + Math.round(Math.sin(i + 1) * 18 + 18)
                  : 94 - i * 6
              }%`,
              opacity: 0.85 - i * 0.04,
            }}
          />
        ))}
      </div>
    </div>
  );
}

/**
 * Mid-page upgrade banner. Anchors conversion at page level rather than
 * per-section.
 */
export function DigestUpgradeBanner() {
  useEffect(() => {
    trackPaywallView({ source: SOURCE, tier: 'max' });
  }, []);

  return (
    <section
      className="rounded-xl border border-amber-400/35 bg-gradient-to-br from-amber-400/10 via-amber-400/[0.04] to-transparent p-6 md:p-8"
      aria-label="升级提示"
    >
      <div className="flex flex-col items-start gap-5 md:flex-row md:items-center md:justify-between">
        <div className="space-y-2 max-w-xl">
          <p className="text-[11px] uppercase tracking-[0.25em] text-amber-700 dark:text-amber-300 font-data">
            Premium Intelligence
          </p>
          <h3 className="text-xl md:text-2xl font-editorial text-foreground">
            解锁今日每只自选股的完整 AI 分析
          </h3>
          <p className="text-sm text-muted-foreground leading-relaxed">
            每只持仓 + 自选股的<strong className="text-foreground">今日要闻、短中长期 AI 视角、催化剂时间表与持仓影响</strong>,
            每天美股收盘后自动生成。
          </p>
          <ul className="mt-3 space-y-1.5 text-sm text-muted-foreground">
            <li className="flex items-start gap-2">
              <Sparkles className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-500" />
              <span>专属日报 + 推特 KOL 日报每日推送</span>
            </li>
            <li className="flex items-start gap-2">
              <Bot className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-500" />
              <span>AI 投研引擎无限使用 + AI 深度个股分析</span>
            </li>
            <li className="flex items-start gap-2">
              <BarChart3 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-500" />
              <span>每只票的催化剂时间表 + 仓位影响一键生成</span>
            </li>
          </ul>
        </div>
        <UnlockCTA source={SOURCE} variant="primary" hideArrow />
      </div>
    </section>
  );
}

/**
 * Bottom CTA mirror of `DigestUpgradeBanner` — tighter visual so users who
 * scrolled past every locked card meet a clear next step.
 */
export function DigestBottomUpgradeCard() {
  return (
    <section
      className="rounded-xl border border-amber-400/30 bg-amber-400/[0.05] px-5 py-4 md:px-6 md:py-5"
      aria-label="升级提示"
    >
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <p className="text-sm text-foreground/90 leading-relaxed">
          看完了你的持仓概览 — 每只票的完整 AI 分析、催化剂时间表与短中长期判断,为订阅者开放。
        </p>
        <UnlockCTA source={SOURCE} variant="primary" hideArrow />
      </div>
    </section>
  );
}
