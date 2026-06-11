'use client';

import { useEffect, useMemo, useState } from 'react';
import { track } from '@vercel/analytics';
import Image from 'next/image';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  ArrowRight,
  CheckCircle2,
  ClipboardList,
  History,
  Newspaper,
  PanelTopOpen,
  Workflow,
  type LucideIcon,
} from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { trackProductEvent } from '@/lib/product-analytics';

type CtaLocation = 'hero' | 'waitlist_offer';
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

const QINBAFRANK_TAGS = ['宏观', '美股科技', 'AI 供应链', 'Crypto'];

const AGENT_CAPABILITIES: Array<{
  icon: LucideIcon;
  tone: Tone;
  title: string;
  body: string;
}> = [
  {
    icon: PanelTopOpen,
    tone: 'emerald',
    title: '向博主 Agent 直接提问',
    body: '用自然语言问股票、新闻、财报或市场问题。',
  },
  {
    icon: History,
    tone: 'amber',
    title: '查阅过往内容库',
    body: '回看 Qinbafrank 过去讲过什么，必要时打开原文。',
  },
  {
    icon: Workflow,
    tone: 'sky',
    title: '使用专属投研工作流',
    body: '把问题拆成框架、证据、变量和下一步清单。',
  },
  {
    icon: Newspaper,
    tone: 'neutral',
    title: '用博主视角看市场',
    body: '从宏观、产业链和个股逻辑里理解当下变化。',
  },
];

const WAITLIST_BENEFITS = [
  'Qinbafrank Agent 试用申请',
  '早期体验名额',
  '观点库与 Agent 入口',
  '反馈优先收集',
];

function getAttribution(searchParams: { get: (name: string) => string | null }) {
  return {
    utm_source: searchParams.get('utm_source'),
    utm_medium: searchParams.get('utm_medium'),
    utm_campaign: searchParams.get('utm_campaign'),
    ref: searchParams.get('ref'),
  };
}

export default function QinbafrankAgentLandingClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { isAuthenticated, isLoading: authLoading } = useAuth();
  const [ctaLocation, setCtaLocation] = useState<CtaLocation | null>(null);
  const attribution = useMemo(() => getAttribution(searchParams), [searchParams]);
  const waitlistHref = '/request-access?source=qinbafrank-agent';

  useEffect(() => {
    const properties = {
      source: 'qinbafrank_agent_waitlist',
      path: '/frank-agent',
      ...attribution,
    };
    track('qinbafrank_waitlist_landing_view', properties);
    trackProductEvent('qinbafrank_waitlist_landing_view', properties);
  }, [attribution]);

  async function handlePrimaryCta(location: CtaLocation) {
    const properties = {
      source: 'qinbafrank_agent_waitlist',
      location,
      authenticated: isAuthenticated,
      ...attribution,
    };
    track('qinbafrank_waitlist_cta_click', properties);
    trackProductEvent('qinbafrank_waitlist_cta_click', properties);

    setCtaLocation(location);
    if (!isAuthenticated) {
      trackProductEvent('qinbafrank_waitlist_signup_started', {
        source: 'qinbafrank_agent_waitlist',
        location,
        ...attribution,
      });
      router.push(`/login?mode=signup&redirect=${encodeURIComponent(waitlistHref)}`);
      return;
    }

    router.push(waitlistHref);
  }

  const ctaLabel = '注册加入 waitlist';
  const ctaBusy = ctaLocation !== null;

  return (
    <main className="min-h-screen bg-background font-editorial text-foreground">
      <section className="relative overflow-hidden border-b border-border/35 bg-[linear-gradient(135deg,rgba(16,185,129,0.04),transparent_44%,rgba(245,158,11,0.025))]">
        <div className="mx-auto grid max-w-6xl gap-9 px-4 py-12 md:grid-cols-[minmax(0,1fr)_420px] md:px-6 md:py-16 lg:py-20">
          <div className="flex flex-col justify-center">
            <h1 className="max-w-3xl text-balance font-editorial text-4xl leading-tight text-foreground md:text-5xl lg:text-6xl">
              Qinbafrank AI 投研助手 Waitlist
            </h1>

            <p className="mt-5 max-w-xl text-pretty text-base leading-relaxed text-muted-foreground md:text-lg">
              在 TheMarketBrew 里查 Qinbafrank 旧观点，用他的框架看新闻、财报和股票。
            </p>

            <div className="mt-7 flex flex-col gap-3 sm:flex-row sm:items-center">
              <button
                type="button"
                onClick={() => handlePrimaryCta('hero')}
                disabled={authLoading || ctaBusy}
                className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-lg bg-primary/90 px-5 py-3 text-sm font-medium text-primary-foreground transition hover:bg-primary active:translate-y-px focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/35 disabled:cursor-not-allowed disabled:opacity-70 motion-reduce:transform-none"
              >
                {ctaBusy && ctaLocation === 'hero' ? '正在跳转...' : ctaLabel}
                <ArrowRight className="h-4 w-4" />
              </button>
              <Link
                href="#features"
                className="inline-flex min-h-[44px] items-center justify-center rounded-lg border border-border/50 bg-card/20 px-5 py-3 text-sm font-medium text-foreground transition hover:border-primary/25 hover:bg-primary/[0.035] active:translate-y-px focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30 motion-reduce:transform-none"
                onClick={() => {
                  trackProductEvent('qinbafrank_waitlist_secondary_cta_click', {
                    source: 'qinbafrank_agent_waitlist',
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
                试用 waitlist
              </span>
              <span className="inline-flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-primary/75" />
                非投资建议
              </span>
            </div>
          </div>

          <QinbafrankSnapshot attribution={attribution} />
        </div>
      </section>

      <section id="qinbafrank" className="border-b border-border/35 bg-card/[0.055]">
        <div className="mx-auto grid max-w-6xl gap-6 px-4 py-10 md:grid-cols-[300px_minmax(0,1fr)] md:px-6 md:py-12">
          <div>
            <p className="text-xs font-medium uppercase tracking-[0.14em] text-primary/80">
              Why Qinbafrank
            </p>
            <h2 className="mt-3 text-balance font-editorial text-3xl leading-tight md:text-4xl">
              Qinbafrank 是谁
            </h2>
          </div>
          <div>
            <p className="max-w-3xl text-pretty text-base leading-relaxed text-muted-foreground md:text-lg">
              中文 X 上长期研究宏观、美股科技、AI 供应链和 Crypto 的内容创作者。我们整理的是他的公开内容和方法论，不是本人代答。
            </p>
            <div className="mt-5 flex flex-wrap gap-2">
              {QINBAFRANK_TAGS.map((tag) => (
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
              四个入口，围绕 Qinbafrank 的公开内容和方法论做研究。
            </p>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            {AGENT_CAPABILITIES.map((item) => (
              <CapabilityCard key={item.title} item={item} />
            ))}
          </div>
        </div>
      </section>

      <section id="waitlist" className="border-y border-border/35 bg-card/[0.065]">
        <div className="mx-auto grid max-w-6xl gap-7 px-4 py-10 md:grid-cols-[minmax(0,1fr)_360px] md:px-6 md:py-12">
          <div>
            <p className="text-xs font-medium uppercase tracking-[0.14em] text-primary/80">
              Waitlist
            </p>
            <h2 className="mt-3 max-w-2xl text-balance font-editorial text-3xl leading-tight md:text-4xl">
              加入试用 waitlist
            </h2>
            <p className="mt-4 max-w-2xl text-pretty text-base leading-relaxed text-muted-foreground">
              先注册账号，再用 1 分钟填写申请。我们会优先邀请最匹配的用户试用。
            </p>
            <div className="mt-6 grid gap-3 sm:grid-cols-2">
              {WAITLIST_BENEFITS.map((item) => (
                <div key={item} className="flex gap-3 text-sm text-foreground">
                  <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-primary/75" />
                  <span>{item}</span>
                </div>
              ))}
            </div>
            <p className="mt-6 max-w-3xl text-sm leading-relaxed text-muted-foreground">
              TheMarketBrew 基于 Qinbafrank 公开内容和投研框架整理。Qinbafrank 本人不会逐条人工回复；内容仅供学习和研究，不构成投资建议。
            </p>
          </div>

          <div className="rounded-lg border border-primary/25 bg-primary/[0.035] p-6">
            <div className="flex items-center justify-between gap-4">
              <div>
                <h3 className="font-editorial text-xl font-semibold text-foreground">
                  Qinbafrank Agent Waitlist
                </h3>
                <p className="mt-1 text-sm text-muted-foreground">试用申请通道</p>
              </div>
              <ClipboardList className="h-6 w-6 text-primary/75" />
            </div>
            <p className="mt-6 text-sm leading-relaxed text-muted-foreground">
              这不是正式发布，也不是付费销售页。我们会根据申请信息和反馈节奏，分批开放试用。
            </p>
            <button
              type="button"
              onClick={() => handlePrimaryCta('waitlist_offer')}
              disabled={authLoading || ctaBusy}
              className="mt-6 inline-flex min-h-[44px] w-full items-center justify-center gap-2 rounded-lg bg-primary/90 px-5 py-3 text-sm font-medium text-primary-foreground transition hover:bg-primary active:translate-y-px focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/35 disabled:cursor-not-allowed disabled:opacity-70 motion-reduce:transform-none"
            >
              {ctaBusy && ctaLocation === 'waitlist_offer' ? '正在跳转...' : ctaLabel}
              <ArrowRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      </section>
    </main>
  );
}

function QinbafrankSnapshot({ attribution }: { attribution: ReturnType<typeof getAttribution> }) {
  return (
    <aside className="self-start rounded-lg border border-border/40 bg-card/30 p-5 shadow-sm shadow-black/5">
      <div className="flex items-start gap-4">
        <Image
          src="/kol-avatars/qinbafrank.png"
          alt="Qinbafrank"
          width={58}
          height={58}
          className="rounded-lg border border-border/45 bg-background/50"
          priority
        />
        <div>
          <p className="text-lg font-semibold text-foreground">TheMarketBrew Qinbafrank Agent</p>
          <p className="mt-1 text-sm leading-relaxed text-muted-foreground">AI 投研助手 Waitlist</p>
        </div>
      </div>

      <div className="mt-5 grid gap-2">
        {['直接提问', '查过往内容', '跑投研工作流', '用博主视角看市场'].map((item) => (
          <div
            key={item}
            className="flex items-center gap-2 rounded-lg border border-border/35 bg-background/40 px-3 py-2 text-sm text-foreground"
          >
            <span className="h-1.5 w-1.5 rounded-full bg-primary/70" />
            {item}
          </div>
        ))}
      </div>

      <Link
        href="/kol/qinbafrank"
        className="mt-5 inline-flex min-h-[42px] w-full items-center justify-center gap-2 rounded-lg border border-border/45 bg-background/45 px-4 py-2.5 text-sm font-medium text-foreground transition hover:border-primary/25 hover:bg-primary/[0.035] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/25"
        onClick={() => {
          trackProductEvent('qinbafrank_waitlist_library_click', {
            source: 'qinbafrank_agent_waitlist',
            location: 'hero_snapshot',
            ...attribution,
          });
        }}
      >
        先看 Qinbafrank 观点库
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
