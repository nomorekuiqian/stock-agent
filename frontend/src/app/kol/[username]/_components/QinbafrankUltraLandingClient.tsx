'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { track } from '@vercel/analytics';
import Image from 'next/image';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  ArrowRight,
  Ban,
  BookOpenText,
  CandlestickChart,
  CheckCircle2,
  FileSearch,
  LibraryBig,
  Layers,
  LockKeyhole,
  MessageSquareText,
  Radar,
  Rss,
  ShieldCheck,
  Sparkles,
  UsersRound,
  type LucideIcon,
} from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { useSubscription } from '@/contexts/SubscriptionContext';
import { PRICING } from '@/lib/pricing';
import { trackProductEvent } from '@/lib/product-analytics';
import { trackCheckoutOpen, trackPaywallCtaClick } from '@/lib/paywall-analytics';

type CtaLocation = 'hero' | 'offer';
type Tone = 'emerald' | 'amber' | 'sky' | 'neutral';

const PRODUCT = 'ultra' as const;
const LANDING_PATH = '/kol/qinbafrank';
const RETURN_PATH = '/kol/qinbafrank?welcome=1';

const TONE_CLASS: Record<Tone, { card: string; icon: string; label: string }> = {
  emerald: {
    card: 'border-primary/25 bg-primary/[0.04]',
    icon: 'border-primary/25 bg-primary/[0.08] text-primary',
    label: 'text-primary',
  },
  amber: {
    card: 'border-amber-500/25 bg-amber-500/[0.045]',
    icon: 'border-amber-500/25 bg-amber-500/[0.08] text-amber-700 dark:text-amber-300',
    label: 'text-amber-700 dark:text-amber-300',
  },
  sky: {
    card: 'border-sky-500/25 bg-sky-500/[0.04]',
    icon: 'border-sky-500/25 bg-sky-500/[0.075] text-sky-700 dark:text-sky-300',
    label: 'text-sky-700 dark:text-sky-300',
  },
  neutral: {
    card: 'border-border/45 bg-card/25',
    icon: 'border-border/45 bg-background/60 text-muted-foreground',
    label: 'text-muted-foreground',
  },
};

const INSIDE_PACK: Array<{
  icon: LucideIcon;
  tone: Tone;
  title: string;
  body: string;
}> = [
  {
    icon: LibraryBig,
    tone: 'emerald',
    title: '观点库',
    body: '按 ticker、主题和产业链查 Qinbafrank 公开旧观点。',
  },
  {
    icon: BookOpenText,
    tone: 'amber',
    title: '精选主题',
    body: 'AI、资本开支、宏观、行情规律、过往推荐公司等主题索引。',
  },
  {
    icon: FileSearch,
    tone: 'sky',
    title: '个股档案',
    body: '把历史 thesis、原文证据、观点变化和当前数据放在一起看。',
  },
  {
    icon: MessageSquareText,
    tone: 'neutral',
    title: 'AI 追问',
    body: '用公开框架拆新闻、财报、个股和你的真实问题。',
  },
];

const LIBRARY_ENTRIES: Array<{
  icon: LucideIcon;
  tone: Tone;
  title: string;
  eyebrow: string;
  body: string;
  href: string;
}> = [
  {
    icon: Layers,
    tone: 'emerald',
    title: '板块观点',
    eyebrow: '5 个板块',
    body: 'AI、加密 RWA、行情判断、宏观地缘和过往推荐公司。',
    href: '/kol/qinbafrank/sectors',
  },
  {
    icon: BookOpenText,
    tone: 'amber',
    title: '过往精华',
    eyebrow: '7 个主题',
    body: '按主题阅读 Frank 公开观点、导读和原文证据。',
    href: '/kol/qinbafrank/highlights',
  },
  {
    icon: CandlestickChart,
    tone: 'sky',
    title: '个股档案',
    eyebrow: '推荐档案',
    body: '公司 thesis、观点变化、价格验证和原文时间线。',
    href: '/kol/qinbafrank/stocks',
  },
  {
    icon: Rss,
    tone: 'neutral',
    title: '全量原文',
    eyebrow: '精选 + 原文',
    body: '从完整内容流里检索历史观点和最新入库内容。',
    href: '/kol/qinbafrank/latest',
  },
  {
    icon: Radar,
    tone: 'sky',
    title: '宏观内容',
    eyebrow: '传导地图',
    body: '流动性、财政扩张、贸易战与地缘风险的判断链。',
    href: '/kol/qinbafrank/macro',
  },
  {
    icon: MessageSquareText,
    tone: 'emerald',
    title: '研究助手',
    eyebrow: '可追问',
    body: '带着资料库上下文继续拆新闻、财报和 watchlist。',
    href: '/research?agent=kol&persona=qinbafrank',
  },
];

const EXAMPLES = [
  'Qinbafrank 以前怎么看 PLTR？',
  '这条新闻会改变公司故事吗？',
  'NVDA 财报应该先看哪几个变量？',
  '这次下跌是杀估值、杀业绩，还是杀逻辑？',
  '我的 watchlist 里哪些值得先复盘？',
];

const OFFER_ITEMS = [
  'Qinbafrank Research Pack 完整资料库',
  'TheMarketBrew Max AI 投研能力',
  '个股深度研究与推特 KOL 日报',
  '研究助手回答不代表本人观点，非投资建议',
];

const FIT_SECTIONS: Array<{
  icon: LucideIcon;
  tone: Tone;
  title: string;
  items: string[];
}> = [
  {
    icon: Sparkles,
    tone: 'emerald',
    title: 'What You Get',
    items: [
      'Frank 的历史研究内容与方法论资料库。',
      '可对话的 Frank Research Bot。',
      '公司、行业、宏观主题的结构化解释。',
      '基于资料脉络的回答。',
      '持续改进中的研究体验。',
    ],
  },
  {
    icon: UsersRound,
    tone: 'sky',
    title: 'Who It Is For',
    items: [
      '想系统学习 Frank 研究框架的人。',
      '已经关注 Frank，但不想在碎片内容里反复翻找的人。',
      '有关注列表，想用 Frank 的框架辅助理解的人。',
    ],
  },
  {
    icon: Ban,
    tone: 'neutral',
    title: 'Who It Is Not For',
    items: [
      '想要荐股的人。',
      '想要买卖点的人。',
      '想要短线交易信号的人。',
      '想要保证收益的人。',
    ],
  },
];

function getAttribution(searchParams: { get: (name: string) => string | null }) {
  return {
    utm_source: searchParams.get('utm_source'),
    utm_medium: searchParams.get('utm_medium'),
    utm_campaign: searchParams.get('utm_campaign'),
    ref: searchParams.get('ref'),
  };
}

export default function QinbafrankUltraLandingClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { isAuthenticated, isLoading: authLoading } = useAuth();
  const { createCheckout, isCheckoutLoading, checkoutError, portalError } = useSubscription();
  const [ctaLocation, setCtaLocation] = useState<CtaLocation | null>(null);
  const autoCheckoutStartedRef = useRef(false);
  const attribution = useMemo(() => getAttribution(searchParams), [searchParams]);

  useEffect(() => {
    const properties = {
      source: 'qinbafrank_ultra',
      product: PRODUCT,
      path: LANDING_PATH,
      ...attribution,
    };
    track('qinbafrank_pack_landing_view', properties);
    trackProductEvent('qinbafrank_pack_landing_view', properties);
  }, [attribution]);

  const trackCheckoutIntent = useCallback((location: CtaLocation) => {
    const properties = {
      source: 'qinbafrank_ultra',
      product: PRODUCT,
      location,
      authenticated: isAuthenticated,
      ...attribution,
    };
    track('qinbafrank_pack_checkout_click', properties);
    trackProductEvent('qinbafrank_pack_checkout_click', properties);
    trackPaywallCtaClick({
      source: 'qinbafrank_ultra_landing',
      tier: PRODUCT,
      authenticated: isAuthenticated,
    });
  }, [attribution, isAuthenticated]);

  const startCheckout = useCallback(async (location: CtaLocation) => {
    trackCheckoutIntent(location);

    if (!isAuthenticated) {
      const redirect = `${LANDING_PATH}?checkout=ultra`;
      router.push(`/login?mode=signup&redirect=${encodeURIComponent(redirect)}`);
      return;
    }

    setCtaLocation(location);
    trackCheckoutOpen({ source: 'qinbafrank_ultra_landing', tier: PRODUCT });
    await createCheckout(PRODUCT, RETURN_PATH);
    setCtaLocation(null);
  }, [createCheckout, isAuthenticated, router, trackCheckoutIntent]);

  useEffect(() => {
    if (authLoading || !isAuthenticated || autoCheckoutStartedRef.current) return;
    if (!['1', 'creator', 'ultra'].includes(searchParams.get('checkout') || '')) return;
    autoCheckoutStartedRef.current = true;
    trackCheckoutIntent('hero');
    trackCheckoutOpen({ source: 'qinbafrank_ultra_landing', tier: PRODUCT });
    void createCheckout(PRODUCT, RETURN_PATH);
  }, [authLoading, createCheckout, isAuthenticated, searchParams, trackCheckoutIntent]);

  const priceLabel = PRICING.ultraPerMonth;
  const ctaBusy = ctaLocation !== null || isCheckoutLoading;
  const ctaCopy = ctaBusy ? '正在跳转...' : '立即解锁 Ultra';
  const paymentError = checkoutError || portalError;

  return (
    <main className="min-h-screen bg-background font-editorial text-foreground">
      <section className="relative overflow-hidden border-b border-border/35 bg-[linear-gradient(135deg,rgba(16,185,129,0.05),transparent_45%,rgba(245,158,11,0.035))]">
        <div className="mx-auto grid max-w-6xl gap-9 px-4 py-12 md:grid-cols-[minmax(0,1fr)_390px] md:px-6 md:py-16 lg:py-20">
          <div className="flex flex-col justify-center">
            <h1 className="max-w-3xl text-balance font-editorial text-4xl leading-tight text-foreground md:text-5xl lg:text-6xl">
              Qinbafrank 研究室 Ultra
            </h1>
            <p className="mt-5 max-w-2xl text-pretty text-base leading-relaxed text-muted-foreground md:text-lg">
              Qinbafrank 观点库、精选主题、个股档案、AI 追问和 TheMarketBrew Max 投研工具。用一套工作流查旧观点、套框架、做复盘。
            </p>

            <div className="mt-7 flex flex-col gap-3 sm:flex-row sm:items-center">
              <button
                type="button"
                onClick={() => startCheckout('hero')}
                disabled={authLoading || ctaBusy}
                className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-lg bg-primary/90 px-5 py-3 text-sm font-medium text-primary-foreground transition hover:bg-primary active:translate-y-px focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/35 disabled:cursor-not-allowed disabled:opacity-70 motion-reduce:transform-none"
              >
                {ctaCopy}
                <ArrowRight className="h-4 w-4" />
              </button>
              <Link
                href="#library-nav"
                className="inline-flex min-h-[44px] items-center justify-center rounded-lg border border-border/50 bg-card/20 px-5 py-3 text-sm font-medium text-foreground transition hover:border-primary/25 hover:bg-primary/[0.035] active:translate-y-px focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30 motion-reduce:transform-none"
                onClick={() => {
                  track('qinbafrank_pack_sample_click', {
                    source: 'qinbafrank_ultra',
                    location: 'hero_library_nav',
                    ...attribution,
                  });
                  trackProductEvent('qinbafrank_pack_sample_click', {
                    source: 'qinbafrank_ultra',
                    location: 'hero_library_nav',
                    ...attribution,
                  });
                }}
              >
                查看资料库入口
              </Link>
            </div>
            {paymentError && (
              <p className="mt-3 max-w-xl rounded-lg border border-destructive/25 bg-destructive/10 px-3 py-2 text-sm leading-relaxed text-destructive">
                {paymentError}
              </p>
            )}

            <div className="mt-5 flex flex-wrap gap-x-5 gap-y-2 text-sm text-muted-foreground">
              <span className="inline-flex items-center gap-2">
                <ShieldCheck className="h-4 w-4 text-primary/75" />
                基于公开内容整理
              </span>
              <span className="inline-flex items-center gap-2">
                <ShieldCheck className="h-4 w-4 text-primary/75" />
                研究助手不代表本人观点
              </span>
              <span className="inline-flex items-center gap-2">
                <ShieldCheck className="h-4 w-4 text-primary/75" />
                非投资建议
              </span>
            </div>
          </div>

          <section
            id="library-nav"
            aria-labelledby="library-nav-title"
            className="order-2 scroll-mt-24 border-t border-border/35 pt-6 md:order-3 md:col-span-2"
          >
            <div className="flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
              <div>
                <p className="text-xs font-medium uppercase tracking-[0.14em] text-primary/80">
                  Library Navigation
                </p>
                <h2 id="library-nav-title" className="mt-2 font-editorial text-2xl leading-snug text-foreground md:text-3xl">
                  资料库入口保留在首页
                </h2>
              </div>
              <p className="max-w-xl text-sm leading-relaxed text-muted-foreground">
                Ultra 是第一页；下面这些入口直接通往原来的资料库、主题、个股和追问工作台。
              </p>
            </div>

            <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
              {LIBRARY_ENTRIES.map((item) => (
                <LibraryNavLink key={item.title} item={item} />
              ))}
            </div>
          </section>

          <div className="order-3 md:order-2">
            <OfferCard
              priceLabel={priceLabel}
              ctaCopy={ctaCopy}
              ctaBusy={ctaBusy}
              onCheckout={() => startCheckout('offer')}
              error={paymentError}
            />
          </div>
        </div>
      </section>

      <section id="inside-pack" className="mx-auto max-w-6xl scroll-mt-24 px-4 py-12 md:px-6 md:py-14">
        <div className="grid gap-7 lg:grid-cols-[minmax(0,0.82fr)_minmax(0,1.18fr)]">
          <div>
            <p className="text-xs font-medium uppercase tracking-[0.14em] text-primary/80">
              Inside the Pack
            </p>
            <h2 className="mt-3 max-w-xl text-balance font-editorial text-3xl leading-tight md:text-4xl">
              买到的是资料包，也是一套投研工作流
            </h2>
            <p className="mt-4 max-w-xl text-pretty text-base leading-relaxed text-muted-foreground">
              不是只买一个聊天入口，而是把可查、可读、可追问的研究材料放进同一个工作台。
            </p>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            {INSIDE_PACK.map((item) => (
              <CapabilityCard key={item.title} item={item} />
            ))}
          </div>
        </div>
      </section>

      <section className="border-y border-border/35 bg-background">
        <div className="mx-auto max-w-6xl px-4 py-12 md:px-6 md:py-14">
          <div className="max-w-3xl">
            <p className="text-xs font-medium uppercase tracking-[0.14em] text-primary/80">
              Product Fit
            </p>
            <h2 className="mt-3 text-balance font-editorial text-3xl leading-tight md:text-4xl">
              先说清楚你会得到什么，以及它不适合什么
            </h2>
            <p className="mt-4 text-pretty text-base leading-relaxed text-muted-foreground">
              这是一个围绕 Frank 公开研究脉络整理的学习与研究工具，不是荐股服务、交易信号或收益承诺。
            </p>
          </div>

          <div className="mt-8 grid gap-4 lg:grid-cols-3">
            {FIT_SECTIONS.map((section) => (
              <FitSectionCard key={section.title} section={section} />
            ))}
          </div>
        </div>
      </section>

      <section className="border-y border-border/35 bg-card/[0.055]">
        <div className="mx-auto grid max-w-6xl gap-6 px-4 py-10 md:grid-cols-[320px_minmax(0,1fr)] md:px-6 md:py-12">
          <div>
            <p className="text-xs font-medium uppercase tracking-[0.14em] text-primary/80">
              Example Questions
            </p>
            <h2 className="mt-3 text-balance font-editorial text-3xl leading-tight md:text-4xl">
              直接问真实问题
            </h2>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            {EXAMPLES.map((question, index) => (
              <div
                key={question}
                className="flex min-h-[74px] items-center gap-3 rounded-lg border border-border/40 bg-background/45 px-4 py-3"
              >
                <span className="font-data text-xs text-primary/80">{String(index + 1).padStart(2, '0')}</span>
                <p className="text-sm leading-relaxed text-foreground">{question}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 py-12 md:px-6 md:py-14">
        <div className="grid gap-8 md:grid-cols-[minmax(0,1fr)_380px]">
          <div>
            <p className="text-xs font-medium uppercase tracking-[0.14em] text-primary/80">
              Offer
            </p>
            <h2 className="mt-3 max-w-2xl text-balance font-editorial text-3xl leading-tight md:text-4xl">
              解锁 Qinbafrank 研究室 Ultra
            </h2>
            <p className="mt-4 max-w-2xl text-pretty text-base leading-relaxed text-muted-foreground">
              适合已经关注 Qinbafrank 方法论，希望把他的公开观点资料包和 TheMarketBrew Max 投研工具合在一起使用的用户。
            </p>
            <div className="mt-6 grid gap-3 sm:grid-cols-2">
              {OFFER_ITEMS.map((item) => (
                <div key={item} className="flex gap-3 text-sm text-foreground">
                  <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-primary/75" />
                  <span>{item}</span>
                </div>
              ))}
            </div>
            <p className="mt-6 max-w-3xl text-sm leading-relaxed text-muted-foreground">
              TheMarketBrew 基于 Qinbafrank 的公开内容和投研框架整理本资料包。研究助手的回答由系统基于公开资料和市场数据生成，不代表 Qinbafrank 本人观点，也不构成投资建议。
            </p>
          </div>

          <OfferCard
            priceLabel={priceLabel}
            ctaCopy={ctaCopy}
            ctaBusy={ctaBusy}
            onCheckout={() => startCheckout('offer')}
            error={paymentError}
            compact
          />
        </div>
      </section>
    </main>
  );
}

function FitSectionCard({
  section,
}: {
  section: {
    icon: LucideIcon;
    tone: Tone;
    title: string;
    items: string[];
  };
}) {
  const tone = TONE_CLASS[section.tone];

  return (
    <article className={`rounded-lg border p-5 ${tone.card}`}>
      <div className="flex items-center gap-3">
        <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border ${tone.icon}`}>
          <section.icon className="h-4 w-4" />
        </div>
        <h3 className="font-editorial text-xl font-semibold text-foreground">{section.title}</h3>
      </div>

      <ul className="mt-5 grid gap-3">
        {section.items.map((item) => (
          <li key={item} className="flex gap-3 text-sm leading-relaxed text-foreground">
            <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-primary/70" />
            <span>{item}</span>
          </li>
        ))}
      </ul>
    </article>
  );
}

function OfferCard({
  priceLabel,
  ctaCopy,
  ctaBusy,
  onCheckout,
  error,
  compact = false,
}: {
  priceLabel: string;
  ctaCopy: string;
  ctaBusy: boolean;
  onCheckout: () => void;
  error?: string | null;
  compact?: boolean;
}) {
  return (
    <aside className="self-start rounded-lg border border-primary/25 bg-primary/[0.035] p-5 shadow-sm shadow-black/5">
      <div className="flex items-start gap-4">
        <Image
          src="/kol-avatars/qinbafrank.png"
          alt="Qinbafrank"
          width={58}
          height={58}
          className="rounded-lg border border-border/45 bg-background/50"
          priority={!compact}
        />
        <div>
          <p className="text-lg font-semibold text-foreground">Qinbafrank 研究室 Ultra</p>
          <p className="mt-1 text-sm leading-relaxed text-muted-foreground">Research Pack + TheMarketBrew Max</p>
        </div>
      </div>

      <div className="mt-5 rounded-lg border border-border/35 bg-background/45 p-4">
        <div className="flex items-end gap-2">
          <p className="font-data text-3xl font-bold text-foreground">{priceLabel.replace('/月', '')}</p>
          <p className="pb-1 text-sm text-muted-foreground">/月</p>
        </div>
        <p className="mt-2 text-xs text-muted-foreground">
          包含 Qinbafrank 资料包和 Max 全部能力
        </p>
      </div>

      <div className="mt-5 grid gap-2">
        {['观点库 + 精选主题', '个股档案 + 原文证据', 'Qinbafrank 研究助手', 'Max AI 投研能力'].map((item) => (
          <div key={item} className="flex items-center gap-2 text-sm text-foreground">
            <CheckCircle2 className="h-4 w-4 text-primary/75" />
            {item}
          </div>
        ))}
      </div>

      <button
        type="button"
        onClick={onCheckout}
        disabled={ctaBusy}
        className="mt-6 inline-flex min-h-[44px] w-full items-center justify-center gap-2 rounded-lg bg-primary/90 px-5 py-3 text-sm font-medium text-primary-foreground transition hover:bg-primary active:translate-y-px focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/35 disabled:cursor-not-allowed disabled:opacity-70 motion-reduce:transform-none"
      >
        {ctaBusy ? (
          <span className="h-4 w-4 rounded-full border-2 border-primary-foreground/30 border-t-primary-foreground animate-spin" />
        ) : (
          <LockKeyhole className="h-4 w-4" />
        )}
        {ctaCopy}
      </button>
      {error && (
        <p className="mt-3 rounded-lg border border-destructive/25 bg-destructive/10 px-3 py-2 text-sm leading-relaxed text-destructive">
          {error}
        </p>
      )}
    </aside>
  );
}

function LibraryNavLink({
  item,
}: {
  item: {
    icon: LucideIcon;
    tone: Tone;
    title: string;
    eyebrow: string;
    body: string;
    href: string;
  };
}) {
  const tone = TONE_CLASS[item.tone];

  return (
    <Link
      href={item.href}
      className={`group flex min-h-[132px] flex-col rounded-lg border p-4 transition hover:-translate-y-0.5 hover:border-primary/35 hover:bg-primary/[0.035] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/35 motion-reduce:transform-none ${tone.card}`}
    >
      <span className="flex items-center justify-between gap-3">
        <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border ${tone.icon}`}>
          <item.icon className="h-4 w-4" />
        </span>
        <ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground transition group-hover:translate-x-0.5 group-hover:text-primary motion-reduce:transform-none" />
      </span>
      <span className={`mt-4 text-xs font-medium uppercase tracking-[0.12em] ${tone.label}`}>
        {item.eyebrow}
      </span>
      <span className="mt-1 text-lg font-semibold leading-snug text-foreground">
        {item.title}
      </span>
      <span className="mt-2 text-sm leading-relaxed text-muted-foreground">
        {item.body}
      </span>
    </Link>
  );
}

function CapabilityCard({
  item,
}: {
  item: {
    icon: LucideIcon;
    tone: Tone;
    title: string;
    body: string;
  };
}) {
  const tone = TONE_CLASS[item.tone];

  return (
    <article className={`rounded-lg border p-4 ${tone.card}`}>
      <div className="flex items-start gap-3">
        <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border ${tone.icon}`}>
          <item.icon className="h-4 w-4" />
        </div>
        <div>
          <p className={`text-xs font-medium uppercase tracking-[0.12em] ${tone.label}`}>
            <Sparkles className="mr-1 inline h-3 w-3" />
            Ultra
          </p>
          <h3 className="mt-1 font-editorial text-lg font-semibold text-foreground">{item.title}</h3>
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{item.body}</p>
        </div>
      </div>
    </article>
  );
}
