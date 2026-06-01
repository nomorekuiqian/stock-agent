'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { useSubscription } from '@/contexts/SubscriptionContext';
import { ArrowRight, Crown, Sparkles, Zap } from 'lucide-react';
import { PRICING } from '@/lib/pricing';

/**
 * Conversion CTA shown at the bottom of every macro page.
 *
 * Macro dashboard is an open lead-gen surface — visitors who get value
 * from the data are prime candidates for Pro (email) or Max (AI research).
 *
 * The messaging is context-aware: each macro subpage gets a headline
 * tailored to the dimension the user just finished reading, plus a
 * deep-link to /research with the corresponding context parameter.
 *
 * Variants:
 *  - Max user            → hidden (no upsell needed)
 *  - Pro user            → nudge toward Max, headline: 无限 AI 投研引擎
 *  - Free authenticated  → dual path (Pro + Max)
 *  - Unauthenticated     → sign up CTA (free 永久免费版)
 */

type SectionKey = 'macro' | 'economy' | 'inflation' | 'liquidity' | 'sentiment' | 'weekly';

const SECTION_COPY: Record<SectionKey, {
  headline: string;
  subline: string;
  researchContext: string;
}> = {
  macro: {
    headline: '把宏观洞察落到个股决策',
    subline: '升级 Max 解锁 AI 投研引擎无限对话、全市场 AI 选股,以及 AI 深度个股分析。',
    researchContext: 'macro',
  },
  economy: {
    headline: '经济周期切换时,哪些板块值得关注?',
    subline: 'AI 投研引擎帮你找防御/成长切换的机会,无限次对话、不限次数选股。',
    researchContext: 'macro_economy',
  },
  inflation: {
    headline: '利率环境里,什么股票最抗压?',
    subline: 'AI 投研引擎分析利率敏感行业与久期风险,从宏观落到你的持仓。',
    researchContext: 'macro_inflation',
  },
  liquidity: {
    headline: '流动性紧缩时,防御标的怎么选?',
    subline: 'AI 投研引擎扫描现金流稳健、低负债率的公司,不限次数使用。',
    researchContext: 'macro_liquidity',
  },
  sentiment: {
    headline: '极端情绪出现时,反转机会在哪?',
    subline: 'AI 投研引擎识别被错杀的优质股,基于实时数据无限对话。',
    researchContext: 'macro_sentiment',
  },
  weekly: {
    headline: '把本周宏观观点转成选股思路',
    subline: 'AI 投研引擎基于最新数据给你具体方向,无限次对话不限次数选股。',
    researchContext: 'macro',
  },
};

function resolveSection(pathname: string | null): SectionKey {
  if (!pathname) return 'macro';
  if (pathname.startsWith('/macro/economy')) return 'economy';
  if (pathname.startsWith('/macro/inflation-rates')) return 'inflation';
  if (pathname.startsWith('/macro/liquidity')) return 'liquidity';
  if (pathname.startsWith('/macro/sentiment')) return 'sentiment';
  if (pathname.startsWith('/macro/weekly')) return 'weekly';
  return 'macro';
}

export function MacroUpgradeCTA() {
  const pathname = usePathname();
  const { isAuthenticated, isLoading: authLoading } = useAuth();
  const { isPro, isMax, isLoading: subLoading } = useSubscription();

  if (authLoading || subLoading) return null;
  if (isMax) return null;

  const section = resolveSection(pathname);
  const copy = SECTION_COPY[section];
  const researchHref = `/research?context=${copy.researchContext}`;

  if (isPro) {
    return (
      <section className="max-w-[1400px] mx-auto px-4 lg:px-6 pb-12 pt-6">
        <div className="relative overflow-hidden rounded-xl border border-amber-400/30 bg-gradient-to-br from-amber-400/5 via-card/50 to-card/30 p-6 md:p-8">
          <div className="absolute -top-20 right-10 w-60 h-40 bg-amber-400/10 blur-[80px] pointer-events-none" />
          <div className="relative flex flex-col md:flex-row md:items-center gap-6">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-3">
                <Crown className="w-4 h-4 text-amber-400" />
                <span className="text-xs font-semibold tracking-[0.2em] uppercase text-amber-400">Upgrade to Max</span>
              </div>
              <h3 className="text-lg md:text-xl font-editorial text-foreground mb-2">
                {copy.headline}
              </h3>
              <p className="text-sm text-muted-foreground leading-relaxed">
                {copy.subline}
              </p>
            </div>
            <div className="flex flex-col gap-2 shrink-0">
              <Link
                href={researchHref}
                className="inline-flex items-center justify-center gap-2 px-5 py-3 rounded-lg bg-amber-400/15 hover:bg-amber-400/25 border border-amber-400/40 text-amber-400 text-sm font-semibold transition-colors"
              >
                试用 AI 投研
                <ArrowRight className="w-4 h-4" />
              </Link>
              <Link
                href="/pricing"
                className="inline-flex items-center justify-center gap-2 px-5 py-2 rounded-lg text-xs text-muted-foreground hover:text-foreground transition-colors"
              >
                升级 Max · {PRICING.maxPerMonth}
              </Link>
            </div>
          </div>
        </div>
      </section>
    );
  }

  // Free authenticated OR unauthenticated
  return (
    <section className="max-w-[1400px] mx-auto px-4 lg:px-6 pb-12 pt-6">
      <div className="relative overflow-hidden rounded-xl border border-border/40 bg-card/30 p-6 md:p-8">
        <div className="absolute -top-20 left-10 w-60 h-40 bg-primary/10 blur-[80px] pointer-events-none" />
        <div className="relative">
          <div className="flex items-center gap-2 mb-3">
            <Sparkles className="w-4 h-4 text-primary" />
            <span className="text-xs font-semibold tracking-[0.2em] uppercase text-primary">Go Further</span>
          </div>
          <h3 className="text-lg md:text-xl font-editorial text-foreground mb-2">
            {copy.headline}
          </h3>
          <p className="text-sm text-muted-foreground leading-relaxed mb-6 max-w-2xl">
            {isAuthenticated
              ? `${copy.subline} 或订阅 Pro 获取每周宏观邮件推送。`
              : '注册免费用每日市场日报 + 宏观仪表盘; 升级 Max 解锁 AI 投研引擎无限使用、深度个股分析、推特 KOL 日报。'}
          </p>
          <div className="grid md:grid-cols-2 gap-3">
            <Link
              href={isAuthenticated ? '/pricing' : '/login'}
              className="group flex items-center gap-3 p-4 rounded-lg border border-primary/30 bg-primary/5 hover:bg-primary/10 transition-colors"
            >
              <div className="w-9 h-9 rounded-lg bg-primary/15 flex items-center justify-center shrink-0">
                <Zap className="w-4 h-4 text-primary" />
              </div>
              <div className="flex-1 min-w-0 text-left">
                <p className="text-sm font-semibold text-foreground">Pro · {PRICING.proPerMonth}</p>
                <p className="text-xs text-muted-foreground">宏观周报 + 持仓日报 + 自选股</p>
              </div>
              <ArrowRight className="w-4 h-4 text-primary shrink-0 transition-transform group-hover:translate-x-0.5" />
            </Link>
            <Link
              href={isAuthenticated ? researchHref : '/login'}
              className="group flex items-center gap-3 p-4 rounded-lg border border-amber-400/30 bg-amber-400/5 hover:bg-amber-400/10 transition-colors"
            >
              <div className="w-9 h-9 rounded-lg bg-amber-400/15 flex items-center justify-center shrink-0">
                <Crown className="w-4 h-4 text-amber-400" />
              </div>
              <div className="flex-1 min-w-0 text-left">
                <p className="text-sm font-semibold text-foreground">Max · {PRICING.maxPerMonth}</p>
                <p className="text-xs text-muted-foreground">无限 AI 投研 + 深度个股分析</p>
              </div>
              <ArrowRight className="w-4 h-4 text-amber-400 shrink-0 transition-transform group-hover:translate-x-0.5" />
            </Link>
          </div>
          {!isAuthenticated && (
            <p className="text-xs text-muted-foreground/70 mt-4 text-center">
              已有账号?{' '}
              <Link href="/login" className="text-primary hover:text-primary/80 transition-colors">
                登录继续
              </Link>
            </p>
          )}
        </div>
      </div>
    </section>
  );
}
