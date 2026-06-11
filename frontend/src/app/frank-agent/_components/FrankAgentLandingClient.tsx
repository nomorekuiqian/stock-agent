'use client';

import { useEffect, useMemo, useState } from 'react';
import { track } from '@vercel/analytics';
import Image from 'next/image';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  ArrowRight,
  CheckCircle2,
  CircleDollarSign,
  History,
  ListChecks,
  Newspaper,
  SearchCheck,
  type LucideIcon,
} from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { useSubscription } from '@/contexts/SubscriptionContext';
import { PRICING, STRIPE_LIVE } from '@/lib/pricing';
import { trackProductEvent } from '@/lib/product-analytics';

type CtaLocation = 'hero' | 'features' | 'beta_offer' | 'final_cta';
type Tone = 'emerald' | 'amber' | 'sky' | 'neutral';

const TONE_CLASS: Record<Tone, {
  card: string;
  label: string;
  iconBox: string;
  dot: string;
}> = {
  emerald: {
    card: 'border-primary/25 bg-primary/[0.035]',
    label: 'text-primary',
    iconBox: 'border-primary/25 bg-primary/[0.075] text-primary',
    dot: 'bg-primary/75',
  },
  amber: {
    card: 'border-amber-500/20 bg-amber-500/[0.035]',
    label: 'text-amber-700 dark:text-amber-300',
    iconBox: 'border-amber-500/25 bg-amber-500/[0.07] text-amber-700 dark:text-amber-300',
    dot: 'bg-amber-500/75',
  },
  sky: {
    card: 'border-sky-500/20 bg-sky-500/[0.03]',
    label: 'text-sky-700 dark:text-sky-300',
    iconBox: 'border-sky-500/25 bg-sky-500/[0.065] text-sky-700 dark:text-sky-300',
    dot: 'bg-sky-500/70',
  },
  neutral: {
    card: 'border-border/40 bg-card/20',
    label: 'text-muted-foreground',
    iconBox: 'border-border/40 bg-background/55 text-muted-foreground',
    dot: 'bg-muted-foreground/45',
  },
};

const FRANK_TAGS = ['宏观', '美股科技', 'AI 供应链', 'Crypto'];

const FRANK_FACTS = [
  {
    value: '1048',
    label: '条公开内容语料',
  },
  {
    value: '22+',
    label: '个股 playbook',
  },
  {
    value: '7',
    label: '产业主线',
  },
] as const;

const AGENT_CAPABILITIES: Array<{
  icon: LucideIcon;
  tone: Tone;
  title: string;
  body: string;
}> = [
  {
    icon: History,
    tone: 'emerald',
    title: '查 Frank 旧观点',
    body: '输入 ticker 或主题，找到相关历史观点和原文证据。',
  },
  {
    icon: SearchCheck,
    tone: 'amber',
    title: '判断新闻有没有用',
    body: '贴新闻或财报，判断它是否改变公司故事。',
  },
  {
    icon: Newspaper,
    tone: 'sky',
    title: '用框架看股票',
    body: '把个股放回产业链、估值、业绩和逻辑里拆。',
  },
  {
    icon: ListChecks,
    tone: 'neutral',
    title: '整理下一步清单',
    body: '留下还要核对的数据、风险和打脸条件。',
  },
];

const QUESTION_BANK = [
  'Frank 以前怎么看 PLTR？',
  '这条新闻会改变公司故事吗？',
  'NVDA 下跌是杀估值、杀业绩还是杀逻辑？',
  'HOOD 财报里哪个数字最关键？',
];

const BETA_BENEFITS = [
  'Frank Agent Beta',
  'TheMarketBrew Max',
  '早期价',
  '可退款',
];

function getAttribution(searchParams: { get: (name: string) => string | null }) {
  return {
    utm_source: searchParams.get('utm_source'),
    utm_medium: searchParams.get('utm_medium'),
    utm_campaign: searchParams.get('utm_campaign'),
    ref: searchParams.get('ref'),
  };
}

export default function FrankAgentLandingClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { isAuthenticated, isLoading: authLoading } = useAuth();
  const {
    isMax,
    isLoading: subLoading,
    isCheckoutLoading,
    checkoutError,
    createCheckout,
  } = useSubscription();
  const [ctaLocation, setCtaLocation] = useState<CtaLocation | null>(null);
  const attribution = useMemo(() => getAttribution(searchParams), [searchParams]);
  const loading = authLoading || subLoading;
  const agentHref = '/research?agent=kol&persona=qinbafrank';

  useEffect(() => {
    const properties = {
      source: 'frank_agent_beta',
      path: '/frank-agent',
      ...attribution,
    };
    track('frank_beta_landing_view', properties);
    trackProductEvent('frank_beta_landing_view', properties);
  }, [attribution]);

  async function handlePrimaryCta(location: CtaLocation) {
    const properties = {
      source: 'frank_agent_beta',
      location,
      tier: 'max',
      authenticated: isAuthenticated,
      already_max: isMax,
      stripe_live: STRIPE_LIVE,
      ...attribution,
    };
    track('frank_beta_cta_click', properties);
    trackProductEvent('frank_beta_cta_click', properties);

    if (isMax) {
      router.push(agentHref);
      return;
    }

    if (!isAuthenticated) {
      trackProductEvent('frank_beta_signup', {
        source: 'frank_agent_beta',
        location,
        ...attribution,
      });
      router.push('/login?redirect=/frank-agent');
      return;
    }

    if (!STRIPE_LIVE) {
      router.push('/pricing');
      return;
    }

    setCtaLocation(location);
    track('frank_beta_checkout_started', properties);
    trackProductEvent('frank_beta_checkout_started', properties);
    await createCheckout('max', '/frank-agent');
    setCtaLocation(null);
  }

  const ctaLabel = isMax ? '打开 Frank Agent' : isAuthenticated ? '加入 Frank Agent Beta' : '登录后加入 Beta';
  const ctaBusy = isCheckoutLoading || ctaLocation !== null;

  return (
    <main className="min-h-screen bg-background font-editorial text-foreground">
      <section className="relative overflow-hidden border-b border-border/35 bg-[linear-gradient(135deg,rgba(16,185,129,0.04),transparent_44%,rgba(245,158,11,0.025))]">
        <div className="mx-auto grid max-w-6xl gap-9 px-4 py-12 md:grid-cols-[minmax(0,1fr)_420px] md:px-6 md:py-16 lg:py-20">
          <div className="flex flex-col justify-center">
            <div className="mb-5 flex flex-wrap items-center gap-3">
              <span className="rounded-lg border border-primary/20 bg-primary/[0.06] px-3 py-1.5 text-xs font-medium tracking-[0.12em] text-primary">
                TheMarketBrew
              </span>
              <span className="rounded-lg border border-border/45 bg-card/25 px-3 py-1.5 text-sm text-muted-foreground">
                Frank Agent Beta
              </span>
            </div>

            <h1 className="max-w-3xl text-balance font-editorial text-4xl leading-tight text-foreground md:text-5xl lg:text-6xl">
              <span className="block">Frank AI</span>
              <span className="block">投研助手 Beta</span>
            </h1>

            <p className="mt-5 max-w-xl text-pretty text-base leading-relaxed text-muted-foreground md:text-lg">
              在 TheMarketBrew 里查 Frank 旧观点，用他的框架看新闻、财报和股票。
            </p>

            <div className="mt-7 flex flex-col gap-3 sm:flex-row sm:items-center">
              <button
                type="button"
                onClick={() => handlePrimaryCta('hero')}
                disabled={loading || ctaBusy}
                className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-lg bg-primary/90 px-5 py-3 text-sm font-medium text-primary-foreground transition hover:bg-primary active:translate-y-px focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/35 disabled:cursor-not-allowed disabled:opacity-70 motion-reduce:transform-none"
              >
                {ctaBusy && ctaLocation === 'hero' ? '正在跳转...' : ctaLabel}
                <ArrowRight className="h-4 w-4" />
              </button>
              <Link
                href="#features"
                className="inline-flex min-h-[44px] items-center justify-center rounded-lg border border-border/50 bg-card/20 px-5 py-3 text-sm font-medium text-foreground transition hover:border-primary/25 hover:bg-primary/[0.035] active:translate-y-px focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30 motion-reduce:transform-none"
                onClick={() => {
                  trackProductEvent('frank_beta_secondary_cta_click', {
                    source: 'frank_agent_beta',
                    location: 'hero_features',
                    ...attribution,
                  });
                }}
              >
                先看能问什么
              </Link>
            </div>

            <div className="mt-5 flex flex-wrap gap-x-5 gap-y-2 text-sm text-muted-foreground">
              <span className="inline-flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-primary/75" />
                限量 Beta
              </span>
              <span className="inline-flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-primary/75" />
                可退款
              </span>
              <span className="inline-flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-primary/75" />
                非投资建议
              </span>
            </div>
          </div>

          <FrankSnapshot attribution={attribution} />
        </div>
      </section>

      <section id="frank" className="border-b border-border/35 bg-card/[0.055]">
        <div className="mx-auto grid max-w-6xl gap-6 px-4 py-10 md:grid-cols-[300px_minmax(0,1fr)] md:px-6 md:py-12">
          <div>
            <p className="text-xs font-medium uppercase tracking-[0.14em] text-primary/80">
              Why Frank
            </p>
            <h2 className="mt-3 text-balance font-editorial text-3xl leading-tight md:text-4xl">
              Frank 是谁
            </h2>
          </div>
          <div>
            <p className="max-w-3xl text-pretty text-base leading-relaxed text-muted-foreground md:text-lg">
              中文 X 上长期研究宏观、美股科技、AI 供应链和 Crypto 的内容创作者。我们整理的是他的公开内容和方法论，不是本人代答。
            </p>
            <div className="mt-5 flex flex-wrap gap-2">
              {FRANK_TAGS.map((tag) => (
                <span
                  key={tag}
                  className="rounded-lg border border-border/40 bg-background/45 px-3 py-1.5 text-sm text-muted-foreground"
                >
                  {tag}
                </span>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section id="features" className="mx-auto max-w-6xl scroll-mt-24 px-4 py-12 md:px-6 md:py-14">
        <div className="grid gap-7 lg:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)]">
          <div>
            <p className="text-xs font-medium uppercase tracking-[0.14em] text-primary/80">
              Agent Value
            </p>
            <h2 className="mt-3 max-w-xl text-balance font-editorial text-3xl leading-tight md:text-4xl">
              Agent 能做什么
            </h2>
            <p className="mt-4 max-w-xl text-pretty text-base leading-relaxed text-muted-foreground">
              查原文，套框架，给清单。不替你做买卖决定。
            </p>

            <div id="questions" className="mt-6 rounded-lg border border-border/40 bg-card/[0.18] p-4">
              <p className="text-sm font-medium text-foreground">可以直接这样问</p>
              <div className="mt-3 grid gap-2">
                {QUESTION_BANK.map((question) => (
                  <button
                    key={question}
                    type="button"
                    onClick={() => {
                      trackProductEvent('frank_beta_example_question_click', {
                        source: 'frank_agent_beta',
                        question,
                        ...attribution,
                      });
                      handlePrimaryCta('features');
                    }}
                    className="group flex min-h-[42px] items-center justify-between gap-3 rounded-lg border border-border/35 bg-background/40 px-3 py-2 text-left text-sm text-muted-foreground transition hover:border-primary/25 hover:bg-primary/[0.035] hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/25"
                  >
                    <span>{question}</span>
                    <ArrowRight className="h-3.5 w-3.5 shrink-0 text-primary/70 transition-transform group-hover:translate-x-0.5 motion-reduce:transform-none" />
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            {AGENT_CAPABILITIES.map((item) => (
              <CapabilityCard key={item.title} item={item} />
            ))}
          </div>
        </div>
      </section>

      <section id="beta" className="border-y border-border/35 bg-card/[0.065]">
        <div className="mx-auto grid max-w-6xl gap-7 px-4 py-10 md:grid-cols-[minmax(0,1fr)_360px] md:px-6 md:py-12">
          <div>
            <p className="text-xs font-medium uppercase tracking-[0.14em] text-primary/80">
              Beta Offer
            </p>
            <h2 className="mt-3 max-w-2xl text-balance font-editorial text-3xl leading-tight md:text-4xl">
              Beta 权益
            </h2>
            <p className="mt-4 max-w-2xl text-pretty text-base leading-relaxed text-muted-foreground">
              小范围内测。你的反馈会影响下一版。
            </p>
            <div className="mt-6 grid gap-3 sm:grid-cols-2">
              {BETA_BENEFITS.map((item) => (
                <div key={item} className="flex gap-3 text-sm text-foreground">
                  <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-primary/75" />
                  <span>{item}</span>
                </div>
              ))}
            </div>
            <p className="mt-6 max-w-3xl text-sm leading-relaxed text-muted-foreground">
              TheMarketBrew 基于 Frank 公开内容和投研框架整理。Frank 本人不会逐条人工回复；内容仅供学习和研究，不构成投资建议。
            </p>
          </div>

          <div className="rounded-lg border border-primary/25 bg-primary/[0.035] p-6">
            <div className="flex items-center justify-between gap-4">
              <div>
                <h3 className="font-editorial text-xl font-semibold text-foreground">
                  Frank Agent Beta
                </h3>
                <p className="mt-1 text-sm text-muted-foreground">TheMarketBrew Max 早期价</p>
              </div>
              <CircleDollarSign className="h-6 w-6 text-primary/75" />
            </div>
            <div className="mt-6 flex items-end gap-2">
              <span className="text-4xl font-medium tabular-nums text-foreground">{PRICING.max}</span>
              <span className="pb-1 text-sm text-muted-foreground">{PRICING.interval}</span>
            </div>
            <p className="mt-2 text-sm text-muted-foreground">
              早期版本，可退款。后续价格和权益可能调整。
            </p>
            <button
              type="button"
              onClick={() => handlePrimaryCta('beta_offer')}
              disabled={loading || ctaBusy}
              className="mt-6 inline-flex min-h-[44px] w-full items-center justify-center gap-2 rounded-lg bg-primary/90 px-5 py-3 text-sm font-medium text-primary-foreground transition hover:bg-primary active:translate-y-px focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/35 disabled:cursor-not-allowed disabled:opacity-70 motion-reduce:transform-none"
            >
              {ctaBusy && ctaLocation === 'beta_offer' ? '正在跳转...' : ctaLabel}
              <ArrowRight className="h-4 w-4" />
            </button>
            {checkoutError && (
              <p className="mt-3 text-sm leading-relaxed text-red-400">{checkoutError}</p>
            )}
          </div>
        </div>
      </section>

      <section className="mx-auto flex max-w-6xl flex-col gap-5 px-4 py-10 md:flex-row md:items-center md:justify-between md:px-6">
        <div>
          <p className="text-sm font-medium text-foreground">TheMarketBrew Frank Agent Beta</p>
          <p className="mt-1 text-sm text-muted-foreground">查旧观点，问框架，做复盘。</p>
        </div>
        <button
          type="button"
          onClick={() => handlePrimaryCta('final_cta')}
          disabled={loading || ctaBusy}
          className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-lg bg-primary/90 px-5 py-3 text-sm font-medium text-primary-foreground transition hover:bg-primary active:translate-y-px focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/35 disabled:cursor-not-allowed disabled:opacity-70 motion-reduce:transform-none"
        >
          {ctaBusy && ctaLocation === 'final_cta' ? '正在跳转...' : ctaLabel}
          <ArrowRight className="h-4 w-4" />
        </button>
      </section>
    </main>
  );
}

function FrankSnapshot({ attribution }: { attribution: ReturnType<typeof getAttribution> }) {
  return (
    <aside className="self-start rounded-lg border border-border/40 bg-card/30 p-5 shadow-sm shadow-black/5">
      <div className="flex items-start gap-4">
        <Image
          src="/kol-avatars/qinbafrank.png"
          alt="qinbafrank"
          width={58}
          height={58}
          className="rounded-lg border border-border/45 bg-background/50"
          priority
        />
        <div>
          <p className="text-lg font-semibold text-foreground">TheMarketBrew Frank Agent</p>
          <p className="mt-1 text-sm leading-relaxed text-muted-foreground">AI 投研助手 Beta</p>
        </div>
      </div>

      <div className="mt-5 grid gap-2">
        {['查 Frank 旧观点', '判断新闻有没有用', '整理下一步清单'].map((item) => (
          <div
            key={item}
            className="flex items-center gap-2 rounded-lg border border-border/35 bg-background/40 px-3 py-2 text-sm text-foreground"
          >
            <span className="h-1.5 w-1.5 rounded-full bg-primary/70" />
            {item}
          </div>
        ))}
      </div>

      <div className="mt-5 hidden grid-cols-3 gap-2 sm:grid">
        {FRANK_FACTS.map((fact) => (
          <div key={fact.label} className="rounded-lg border border-border/35 bg-background/40 p-3">
            <p className="text-2xl font-medium tabular-nums text-foreground">{fact.value}</p>
            <p className="mt-1 text-[11px] leading-snug text-muted-foreground">{fact.label}</p>
          </div>
        ))}
      </div>

      <Link
        href="/kol/qinbafrank"
        className="mt-5 inline-flex min-h-[42px] w-full items-center justify-center gap-2 rounded-lg border border-border/45 bg-background/45 px-4 py-2.5 text-sm font-medium text-foreground transition hover:border-primary/25 hover:bg-primary/[0.035] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/25"
        onClick={() => {
          trackProductEvent('frank_beta_cockpit_click', {
            source: 'frank_agent_beta',
            location: 'hero_snapshot',
            ...attribution,
          });
        }}
      >
        先看 Frank 观点库
        <ArrowRight className="h-4 w-4" />
      </Link>
    </aside>
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
        <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border ${tone.iconBox}`}>
          <item.icon className="h-4 w-4" />
        </div>
        <div>
          <h3 className="font-editorial text-lg font-semibold text-foreground">{item.title}</h3>
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{item.body}</p>
        </div>
      </div>
    </article>
  );
}
