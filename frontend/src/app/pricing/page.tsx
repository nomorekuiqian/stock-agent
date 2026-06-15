'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowRight, Check, ChevronDown, Crown, Gem, MessageSquareQuote, Zap } from 'lucide-react';

import { useAuth } from '@/contexts/AuthContext';
import { useSubscription } from '@/contexts/SubscriptionContext';
import { PRICING, STRIPE_LIVE } from '@/lib/pricing';

type Tier = 'pro' | 'max' | 'ultra';

const FREE_FEATURES = ['每日市场日报', '宏观仪表盘', 'AI 投研每日 2 次体验'];

const TESTIMONIALS = [
  {
    quote: '这是我用过最好的平台。我已经推荐了不下于五个人注册了。我很喜欢这种极简的风格。',
    role: '在读博士生',
    planHint: '日常复盘',
  },
  {
    quote: '宏观数据实时变化的了解，以及其对个股的影响分析，如果自己手动做会很麻烦。',
    role: '进阶投资者',
    planHint: '宏观 + 个股',
  },
  {
    quote: '提供个股或单个 ETF 的长期投资逻辑，降低市场噪音，把握住核心逻辑。',
    role: '进阶投资者',
    planHint: '长期研究',
  },
];

const PLANS: {
  tier: Tier;
  name: string;
  price: string;
  priceLabel: string;
  summary: string;
  icon: typeof Zap;
  accent: {
    icon: string;
    border: string;
    ring: string;
    button: string;
    current: string;
  };
  features: string[];
}[] = [
  {
    tier: 'pro',
    name: 'Pro',
    price: PRICING.pro,
    priceLabel: PRICING.proPerMonth,
    summary: '适合想把市场信息自动送到邮箱的人。',
    icon: Zap,
    accent: {
      icon: 'text-primary',
      border: 'border-primary/25 hover:border-primary/45',
      ring: 'hover:shadow-primary/10',
      button: 'bg-primary text-primary-foreground hover:bg-primary/90',
      current: 'border-primary/25 bg-primary/5 text-primary',
    },
    features: [
      '盘前早报邮件',
      '每日市场日报邮件',
      '专属持仓日报邮件',
      '宏观周报邮件',
    ],
  },
  {
    tier: 'max',
    name: 'Max',
    price: PRICING.max,
    priceLabel: PRICING.maxPerMonth,
    summary: '适合需要研究助手、个股深度分析和 KOL 日报的人。',
    icon: Crown,
    accent: {
      icon: 'text-amber-500',
      border: 'border-amber-400/35 hover:border-amber-400/55',
      ring: 'hover:shadow-amber-500/10',
      button: 'bg-amber-600 text-white hover:bg-amber-600/90',
      current: 'border-amber-400/30 bg-amber-400/10 text-amber-500',
    },
    features: [
      'Pro 全部功能',
      '推特 KOL 日报',
      'AI研究助手',
      'AI 深度个股分析无限使用',
    ],
  },
  {
    tier: 'ultra',
    name: 'Ultra',
    price: PRICING.ultra,
    priceLabel: PRICING.ultraPerMonth,
    summary: '适合想完整使用 Qinbafrank 研究室的人。',
    icon: Gem,
    accent: {
      icon: 'text-rose-400',
      border: 'border-rose-400/35 hover:border-rose-400/55',
      ring: 'hover:shadow-rose-500/10',
      button: 'bg-rose-600 text-white hover:bg-rose-600/90',
      current: 'border-rose-400/30 bg-rose-400/10 text-rose-400',
    },
    features: [
      'Max 全部功能',
      'Qinbafrank完整资料库',
      'Qinbafrank专属研究助手',
    ],
  },
];

export default function PricingPage() {
  const router = useRouter();
  const { isAuthenticated, isLoading: authLoading } = useAuth();
  const {
    isPro,
    isMax,
    isLoading: subLoading,
    createCheckout,
    checkoutError,
    portalError,
    plan,
    accessExpiresAt,
  } = useSubscription();

  const [checkoutTier, setCheckoutTier] = useState<Tier | null>(null);

  const isPaidPro = isPro && !accessExpiresAt && plan === 'pro';
  const isPaidMax = isMax && !accessExpiresAt && plan === 'max';
  const isPaidUltra = !accessExpiresAt && plan === 'ultra';
  const loading = authLoading || subLoading;

  const handleCheckout = async (tier: Tier) => {
    if (!isAuthenticated) {
      router.push('/login?redirect=/pricing');
      return;
    }
    setCheckoutTier(tier);
    await createCheckout(tier);
    setCheckoutTier(null);
  };

  return (
    <main className="relative min-h-screen overflow-hidden bg-background px-4 pb-16 pt-24 md:pb-20">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-72 bg-[linear-gradient(180deg,rgba(16,185,129,0.08),rgba(16,185,129,0.025)_45%,transparent)]"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-24 h-px bg-gradient-to-r from-transparent via-primary/30 to-transparent"
      />
      <div className="relative mx-auto max-w-6xl">
        <section className="mb-10 max-w-[44rem]">
          <p className="inline-flex items-center gap-2 text-sm font-medium text-primary">
            <span className="h-1.5 w-1.5 rounded-full bg-primary" />
            订阅方案
          </p>
          <h1 className="mt-3 font-editorial text-3xl leading-tight tracking-tight text-foreground md:text-5xl">
            选择你需要的投研能力
          </h1>
          <p className="mt-4 max-w-2xl text-base leading-8 text-muted-foreground">
            价格透明，按月订阅，随时取消。先免费体验，再按需解锁邮件、研究助手和博主研究室。
          </p>
        </section>

        {!loading && (isPaidPro || isPaidMax || isPaidUltra) ? (
          <div className="mb-6 rounded-lg border border-border/50 bg-card/40 px-4 py-3 text-sm text-muted-foreground">
            当前方案：
            <span className="font-medium text-foreground">
              {isPaidUltra ? ' Ultra' : isPaidMax ? ' Max' : ' Pro'}
            </span>
          </div>
        ) : null}

        {(checkoutError || portalError) ? (
          <div className="mb-6 rounded-lg border border-destructive/25 bg-destructive/10 px-4 py-3 text-sm text-destructive">
            {checkoutError || portalError}
          </div>
        ) : null}

        <section className="mb-6 rounded-lg border border-border/50 bg-card/25 p-5 md:p-6">
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div>
              <div className="flex items-baseline gap-2">
                <h2 className="text-lg font-semibold text-foreground">Free</h2>
                <span className="font-data text-2xl font-bold text-foreground">$0</span>
                <span className="text-sm text-muted-foreground">/月</span>
              </div>
              <div className="mt-3 flex flex-wrap gap-x-4 gap-y-2">
                {FREE_FEATURES.map((feature) => (
                  <FeaturePill key={feature}>{feature}</FeaturePill>
                ))}
              </div>
            </div>
            <Link
              href="/today"
              className="group inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-border/60 px-4 text-sm font-semibold text-foreground transition hover:border-primary/40 hover:text-primary active:scale-[0.98]"
            >
              免费开始
              <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
            </Link>
          </div>
        </section>

        <section className="grid gap-4 lg:grid-cols-3">
          {PLANS.map((planItem) => (
            <PlanCard
              key={planItem.tier}
              planItem={planItem}
              loading={loading}
              checkoutTier={checkoutTier}
              isAuthenticated={isAuthenticated}
              isCurrent={
                (planItem.tier === 'pro' && isPaidPro) ||
                (planItem.tier === 'max' && isPaidMax) ||
                (planItem.tier === 'ultra' && isPaidUltra)
              }
              isIncluded={
                (planItem.tier === 'pro' && (isPaidMax || isPaidUltra)) ||
                (planItem.tier === 'max' && isPaidUltra)
              }
              isUpgrade={
                (planItem.tier === 'max' && isPaidPro) ||
                (planItem.tier === 'ultra' && (isPaidPro || isPaidMax))
              }
              onCheckout={handleCheckout}
            />
          ))}
        </section>

        <section className="mt-12 border-t border-border/50 pt-10">
          <div className="mb-6 flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
            <div>
              <p className="text-sm font-medium text-primary">用户反馈</p>
              <h2 className="mt-2 text-xl font-semibold text-foreground md:text-2xl">
                他们为什么留下来
              </h2>
            </div>
            <p className="max-w-md text-sm leading-relaxed text-muted-foreground">
              不是更多噪音，而是把每天该看的市场信息整理清楚。
            </p>
          </div>
          <div className="grid gap-4 md:grid-cols-3">
            {TESTIMONIALS.map((item, index) => (
              <figure
                key={item.quote}
                className={`group rounded-lg border border-border/50 bg-card/35 p-5 transition duration-200 hover:-translate-y-0.5 hover:border-primary/30 hover:bg-card/50 hover:shadow-lg hover:shadow-primary/5 motion-reduce:hover:translate-y-0 ${
                  index === 1 ? 'md:mt-5' : ''
                }`}
              >
                <div className="mb-5 flex items-center justify-between">
                  <MessageSquareQuote className="h-5 w-5 text-primary transition-transform duration-200 group-hover:-rotate-3 group-hover:scale-105" />
                  <span className="rounded-full border border-border/50 px-2.5 py-1 text-sm text-muted-foreground">
                    {item.planHint}
                  </span>
                </div>
                <blockquote className="text-sm leading-7 text-foreground">
                  &ldquo;{item.quote}&rdquo;
                </blockquote>
                <figcaption className="mt-5 text-sm text-muted-foreground">
                  {item.role}
                </figcaption>
              </figure>
            ))}
          </div>
        </section>

        <section className="mt-12 grid gap-4 border-t border-border/50 pt-8 md:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)] md:gap-10">
          <div>
            <h2 className="text-lg font-semibold text-foreground">怎么选</h2>
            <p className="mt-2 text-sm leading-7 text-muted-foreground">
              只想接收邮件选 Pro；需要自己提问和做个股研究选 Max；要 Qinbafrank 资料包和研究助手选 Ultra。
            </p>
          </div>
          <div className="divide-y divide-border/40">
            <FaqItem
              q="可以从 Pro 升级到 Max 或 Ultra 吗?"
              a="可以。已有订阅用户升级会进入 Stripe 订阅管理流程，按剩余周期处理差额。"
            />
            <FaqItem
              q="可以随时取消吗?"
              a="可以。取消后当前计费周期内仍可使用，不会额外收费。"
            />
            <FaqItem
              q="免费版包含什么?"
              a="免费版包含每日市场日报、宏观仪表盘，以及每天 2 次 AI 投研体验。"
            />
          </div>
        </section>
      </div>
    </main>
  );
}

function PlanCard({
  planItem,
  loading,
  checkoutTier,
  isAuthenticated,
  isCurrent,
  isIncluded,
  isUpgrade,
  onCheckout,
}: {
  planItem: (typeof PLANS)[number];
  loading: boolean;
  checkoutTier: Tier | null;
  isAuthenticated: boolean;
  isCurrent: boolean;
  isIncluded: boolean;
  isUpgrade: boolean;
  onCheckout: (tier: Tier) => void;
}) {
  const Icon = planItem.icon;
  const isBusy = checkoutTier === planItem.tier;

  return (
    <article
      className={`group flex min-h-[440px] flex-col rounded-lg border bg-card/35 p-6 transition duration-200 hover:-translate-y-0.5 hover:bg-card/45 hover:shadow-lg motion-reduce:hover:translate-y-0 md:p-7 ${planItem.accent.border} ${planItem.accent.ring}`}
    >
      <div className="flex items-center gap-3">
        <Icon className={`h-5 w-5 transition-transform duration-200 group-hover:-translate-y-0.5 ${planItem.accent.icon}`} />
        <h2 className="text-xl font-semibold text-foreground">{planItem.name}</h2>
      </div>

      <p className="mt-3 min-h-12 text-sm leading-7 text-muted-foreground">
        {planItem.summary}
      </p>

      <div className="mt-5 flex items-baseline gap-2">
        <span className="font-data text-4xl font-bold text-foreground">{planItem.price}</span>
        <span className="text-sm text-muted-foreground">{PRICING.interval}</span>
      </div>

      <ul className="mt-6 space-y-3">
        {planItem.features.map((feature) => (
          <li key={feature} className="flex items-start gap-3 text-sm text-foreground">
            <Check className={`mt-0.5 h-4 w-4 shrink-0 transition-transform duration-200 group-hover:scale-105 ${planItem.accent.icon}`} />
            <span>{feature}</span>
          </li>
        ))}
      </ul>

      <div className="mt-auto pt-8">
        {loading ? (
          <div className="h-11 w-full animate-pulse rounded-lg bg-muted" />
        ) : isCurrent ? (
          <div className={`flex min-h-11 items-center justify-center rounded-lg border px-4 text-sm font-semibold ${planItem.accent.current}`}>
            当前方案
          </div>
        ) : isIncluded ? (
          <div className="flex min-h-11 items-center justify-center rounded-lg border border-border/50 px-4 text-sm font-medium text-muted-foreground">
            已包含在更高方案中
          </div>
        ) : (
          <button
            onClick={STRIPE_LIVE ? () => onCheckout(planItem.tier) : undefined}
            disabled={!STRIPE_LIVE || isBusy}
            className={`flex min-h-11 w-full items-center justify-center gap-2 rounded-lg px-4 text-sm font-semibold transition active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-70 ${planItem.accent.button}`}
          >
            {!STRIPE_LIVE ? (
              '即将开放'
            ) : isBusy ? (
              <>
                <span className="h-4 w-4 rounded-full border-2 border-current/30 border-t-current animate-spin" />
                跳转中...
              </>
            ) : isAuthenticated ? (
              `${isUpgrade ? '升级到' : '订阅'} ${planItem.name} · ${planItem.priceLabel}`
            ) : (
              '登录后订阅'
            )}
          </button>
        )}
        <p className="mt-3 text-center text-sm text-muted-foreground">
          {STRIPE_LIVE ? 'Stripe 安全支付' : '订阅功能即将开放'}
        </p>
      </div>
    </article>
  );
}

function FeaturePill({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-sm text-muted-foreground">
      <Check className="h-3.5 w-3.5 text-primary" />
      {children}
    </span>
  );
}

function FaqItem({ q, a }: { q: string; a: string }) {
  const [open, setOpen] = useState(false);

  return (
    <div className="py-4">
      <button
        onClick={() => setOpen(!open)}
        className="flex w-full cursor-pointer items-center justify-between gap-4 text-left"
      >
        <span className="text-sm font-medium text-foreground">{q}</span>
        <ChevronDown
          className={`h-4 w-4 shrink-0 text-muted-foreground transition-transform ${open ? 'rotate-180' : ''}`}
        />
      </button>
      <div
        className="grid transition-[grid-template-rows] duration-200"
        style={{ gridTemplateRows: open ? '1fr' : '0fr' }}
      >
        <div className="overflow-hidden">
          <p className="pb-1 pt-2 text-sm leading-relaxed text-muted-foreground">{a}</p>
        </div>
      </div>
    </div>
  );
}
