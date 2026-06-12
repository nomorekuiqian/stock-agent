'use client';

import { type CSSProperties, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { useSubscription } from '@/contexts/SubscriptionContext';
import { ArrowRight, Check, ChevronDown, Crown, Loader2, Zap } from 'lucide-react';
import { PRICING, STRIPE_LIVE } from '@/lib/pricing';

// ── Feature comparison data ──────────────────────────────────────────────────
const PRO_FEATURES = [
  { feature: '每日市场日报（邮件）', desc: 'AI 生成的每日市场分析，直达收件箱' },
  { feature: '盘前早报（邮件）',    desc: '每个交易日早上推送，帮你预判开盘' },
  { feature: '专属持仓日报（邮件）', desc: '基于你的实际持仓，每日生成只属于你的分析报告' },
  { feature: '宏观周报（邮件）',    desc: '每周宏观要点汇总，直达收件箱' },
];

type MaxFeature = { feature: string; desc: string; badge?: 'NEW' };

const MAX_ONLY_FEATURES: MaxFeature[] = [
  { feature: '推特 KOL 日报',          desc: '每日整理金融博主观点，含完整归档和邮件推送', badge: 'NEW' },
  { feature: 'AI 投研引擎 · 无限使用', desc: '对话式投研 + 全市场 AI 选股，不限次数调用' },
  { feature: 'AI 深度个股分析',       desc: '基本面、技术面、估值对比一键生成，无使用上限' },
];

// ── Testimonials ─────────────────────────────────────────────────────────────
const TESTIMONIALS = [
  {
    quote: '这是我用过最好的平台。我已经推荐了不下于五个人注册了。我很喜欢这种极简的风格。',
    role: '在读博士生',
  },
  {
    quote: '宏观数据实时变化的了解，以及其对个股的影响分析，如果自己手动做会很麻烦。',
    role: '进阶投资者',
  },
  {
    quote: '提供个股或单个 ETF 的长期投资逻辑，降低市场噪音，把握住核心逻辑。',
    role: '进阶投资者',
  },
];

const WHY_POINTS = [
  {
    title: '5 分钟掌握全貌',
    desc: '不用刷新闻、不用翻 K 线，每天一份报告覆盖市场全局',
  },
  {
    title: '只属于你的分析',
    desc: '基于你的真实持仓生成，不是通用文章的复制粘贴',
  },
  {
    title: '宏观到个股，一站式',
    desc: '从美联储到你持仓的具体标的，用一个工具搞定',
  },
];

const EARLY_BIRD_TOTAL = PRICING.earlyAccessTotal;

type MotionStyle = CSSProperties & {
  '--motion-delay'?: string;
  '--motion-duration'?: string;
};

const motionDelay = (delayMs: number): MotionStyle => ({
  '--motion-delay': `${delayMs}ms`,
});

const lineMotion = (delayMs: number, transformOrigin: 'left' | 'right'): MotionStyle => ({
  ...motionDelay(delayMs),
  transformOrigin,
});

export default function PricingPage() {
  const router = useRouter();
  const { isAuthenticated, isLoading: authLoading } = useAuth();
  const {
    isPro, isMax,
    isLoading: subLoading,
    createCheckout,
    plan,
    accessExpiresAt,
  } = useSubscription();

  const [checkoutTier, setCheckoutTier] = useState<'pro' | 'max' | null>(null);

  // Freemium 模型已无自动 trial。剩下的 access_expires_at 只在少量遗留邀请码用户
  // 上还会出现，他们走完后自然消失，因此 pricing 页不再为这种状态显示横幅。

  const isPaidPro = isPro && !accessExpiresAt && plan === 'pro';
  const isPaidMax = isMax && !accessExpiresAt;

  const loading = authLoading || subLoading;

  const handleCheckout = async (tier: 'pro' | 'max') => {
    if (!isAuthenticated) {
      router.push('/login?redirect=/pricing');
      return;
    }
    setCheckoutTier(tier);
    await createCheckout(tier);
    setCheckoutTier(null);
  };

  return (
    <main className="min-h-screen overflow-hidden bg-background px-4 pb-20 pt-24">
      <div className="max-w-6xl mx-auto">

        {/* ── Hero ─────────────────────────────────────────────── */}
        <div className="text-center mb-16 md:mb-20 space-y-5">
          <div className="flex items-center justify-center gap-3 animate-fade-in-up">
            <div
              className="h-px flex-1 max-w-[60px] bg-gradient-to-r from-primary to-transparent animate-line-expand"
              style={lineMotion(80, 'left')}
            />
            <span className="text-primary text-xs font-semibold tracking-[0.2em] uppercase">
              Pricing
            </span>
            <div
              className="h-px flex-1 max-w-[60px] bg-gradient-to-l from-primary to-transparent animate-line-expand"
              style={lineMotion(80, 'right')}
            />
          </div>
          <h1 className="text-3xl md:text-5xl font-editorial text-foreground tracking-tight leading-[1.1] animate-fade-in-up" style={motionDelay(110)}>
            选择适合你的方案
          </h1>
          <p className="text-muted-foreground text-sm md:text-lg max-w-lg mx-auto leading-relaxed animate-fade-in-up" style={motionDelay(200)}>
            从邮件订阅到全平台 AI 分析工具，按需选择
          </p>
        </div>

        {/* ── Status Banners ───────────────────────────────────── */}
        {!loading && isPaidMax && (
          <div className="text-center mb-10 animate-fade-in-up" style={motionDelay(260)}>
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-amber-400/10 border border-amber-400/20 shadow-sm shadow-amber-400/5">
              <Crown className="w-4 h-4 text-amber-400 animate-fade-in" />
              <span className="text-sm text-amber-400 font-medium">你已是 Max 会员</span>
            </div>
          </div>
        )}
        {!loading && isPaidPro && (
          <div className="text-center mb-10 animate-fade-in-up" style={motionDelay(260)}>
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-primary/10 border border-primary/20 shadow-sm shadow-primary/5">
              <Check className="w-4 h-4 text-primary animate-fade-in" />
              <span className="text-sm text-primary font-medium">你已是 Pro 会员 — 升级 Max 解锁全部功能</span>
            </div>
          </div>
        )}
        {/* ── Two-column Pricing + Free aside ─────────────────── */}
        <div className="max-w-4xl mx-auto mb-16 md:mb-20">

          {/* Free tier — compact inline banner */}
          <div className="flex flex-wrap items-center justify-center gap-x-3 gap-y-2 mb-6 py-3 px-5 rounded-lg border border-border/30 bg-card/20 max-w-md mx-auto animate-fade-in-up" style={motionDelay(300)}>
            <span className="text-sm text-muted-foreground">免费版</span>
            <span className="text-xs text-muted-foreground/70">|</span>
            <span className="text-sm text-muted-foreground">每日市场日报 + 宏观仪表盘</span>
            <Link
              href="/macro"
              className="group/free ml-0 sm:ml-auto inline-flex items-center gap-1 text-xs text-primary transition-colors hover:text-primary/80 shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/35 rounded"
            >
              立即体验
              <ArrowRight className="h-3.5 w-3.5 transition-transform duration-200 ease-out-standard group-hover/free:translate-x-0.5 motion-reduce:transform-none" aria-hidden="true" />
            </Link>
          </div>

          {/* Pro + Max columns */}
          <div className="grid items-stretch md:grid-cols-2 gap-4 md:gap-6">

            {/* Pro Column */}
            <div className="group/card relative rounded-xl border border-primary/30 bg-card/50 overflow-hidden ring-1 ring-primary/10 animate-fade-in-up transition-all duration-300 ease-out-standard hover:-translate-y-1 hover:border-primary/45 hover:bg-card/65 hover:shadow-lg hover:shadow-primary/5 focus-within:border-primary/50 motion-reduce:transform-none motion-reduce:hover:shadow-none" style={motionDelay(380)}>
              <div className="absolute -top-20 left-1/2 -translate-x-1/2 w-60 h-40 bg-primary/10 blur-[80px] pointer-events-none opacity-75 transition-opacity duration-500 ease-out-standard group-hover/card:opacity-100" />

              <div className="relative px-6 py-5 border-b border-primary/20">
                <div className="flex items-center gap-2 mb-1">
                  <Zap className="w-4 h-4 text-primary transition-transform duration-300 ease-out-standard group-hover/card:scale-105 motion-reduce:transform-none" />
                  <h3 className="text-lg font-semibold text-foreground">Pro</h3>
                  <span className="ml-auto inline-flex items-center gap-1 px-2 py-0.5 rounded bg-primary/10 border border-primary/20">
                    <span className="w-1.5 h-1.5 rounded-full bg-primary transition-transform duration-300 ease-out-standard group-hover/card:scale-125 motion-reduce:transform-none" />
                    <span className="text-xs font-medium text-primary">抢先体验价</span>
                  </span>
                </div>
                <div className="mt-4 flex items-baseline gap-2">
                  <span className="text-3xl font-data font-semibold text-foreground">{PRICING.pro}</span>
                  <span className="text-sm text-muted-foreground">{PRICING.interval}</span>
                  <span className="text-sm text-muted-foreground/70 line-through font-data ml-1">{PRICING.proOriginal}</span>
                  <span className="text-xs font-medium text-primary">{PRICING.proDiscount}</span>
                </div>
                <p className="text-xs text-muted-foreground mt-3">终身锁定此价格 · 仅限前 {EARLY_BIRD_TOTAL} 名</p>
              </div>

              <div className="relative px-6 py-5 space-y-3.5">
                {PRO_FEATURES.map((item) => (
                  <div key={item.feature} className="flex items-start gap-3">
                    <Check className="w-4 h-4 text-primary mt-0.5 shrink-0 transition-transform duration-200 ease-out-standard group-hover/card:scale-105 motion-reduce:transform-none" />
                    <div>
                      <span className="text-sm text-foreground">{item.feature}</span>
                      <span className="text-xs text-muted-foreground/70 block">{item.desc}</span>
                    </div>
                  </div>
                ))}
                {/* Max-only teaser */}
                <div className="pt-2 border-t border-border/20">
                  <p className="text-xs text-muted-foreground/70">
                    <span className="inline-flex items-center px-1 py-0.5 rounded text-micro font-semibold tracking-wider bg-amber-500/15 text-amber-400 border border-amber-400/30 mr-1.5 align-middle">
                      新
                    </span>
                    推特 KOL 日报、AI 投研引擎（无限使用）、AI 深度个股分析 → 升级 Max
                  </p>
                </div>
              </div>

              <div className="px-6 pb-6">
                {loading ? (
                  <div className="w-full h-11 rounded-lg bg-muted animate-pulse" />
                ) : isPaidPro ? (
                  <div className="text-center text-sm text-muted-foreground py-2.5 border border-primary/20 rounded-lg bg-primary/5">
                    当前方案
                  </div>
                ) : isPaidMax ? (
                  <div className="text-center text-sm text-muted-foreground py-2.5 border border-border/40 rounded-lg">
                    已包含在 Max 中
                  </div>
                ) : (
                  <button
                    onClick={STRIPE_LIVE ? () => handleCheckout('pro') : undefined}
                    disabled={!STRIPE_LIVE || checkoutTier === 'pro'}
                    className="group/cta w-full px-4 py-3 bg-primary text-primary-foreground rounded-lg text-sm font-semibold transition-all duration-200 ease-out-standard hover:bg-primary/90 hover:shadow-[0_4px_20px_rgba(5,150,105,0.25)] active:scale-[0.98] cursor-pointer flex items-center justify-center gap-2 disabled:opacity-70 disabled:cursor-not-allowed disabled:hover:shadow-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 motion-reduce:transform-none"
                  >
                    {!STRIPE_LIVE ? (
                      '即将开放'
                    ) : checkoutTier === 'pro' ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                        跳转中...
                      </>
                    ) : isAuthenticated ? (
                      <>
                        <span>{`订阅 Pro — ${PRICING.proPerMonth}`}</span>
                        <ArrowRight className="h-4 w-4 transition-transform duration-200 ease-out-standard group-hover/cta:translate-x-0.5 motion-reduce:transform-none" aria-hidden="true" />
                      </>
                    ) : (
                      <>
                        <span>登录后订阅</span>
                        <ArrowRight className="h-4 w-4 transition-transform duration-200 ease-out-standard group-hover/cta:translate-x-0.5 motion-reduce:transform-none" aria-hidden="true" />
                      </>
                    )}
                  </button>
                )}
                <p className="text-xs text-muted-foreground/70 text-center mt-3">
                  {STRIPE_LIVE ? '随时取消 · Stripe 安全支付' : '订阅功能即将上线，敬请期待'}
                </p>
              </div>
            </div>

            {/* Max Column */}
            <div className="group/card relative rounded-xl border border-amber-400/30 bg-card/50 overflow-hidden ring-1 ring-amber-400/10 animate-fade-in-up transition-all duration-300 ease-out-standard hover:-translate-y-1 hover:border-amber-400/45 hover:bg-card/65 hover:shadow-lg hover:shadow-amber-400/10 focus-within:border-amber-400/50 motion-reduce:transform-none motion-reduce:hover:shadow-none" style={motionDelay(470)}>
              <div className="absolute -top-20 left-1/2 -translate-x-1/2 w-60 h-40 bg-amber-400/10 blur-[80px] pointer-events-none opacity-75 transition-opacity duration-500 ease-out-standard group-hover/card:opacity-100" />

              <div className="relative px-6 py-5 border-b border-amber-400/20">
                <div className="flex items-center gap-2 mb-1">
                  <Crown className="w-4 h-4 text-amber-400 transition-transform duration-300 ease-out-standard group-hover/card:scale-105 motion-reduce:transform-none" />
                  <h3 className="text-lg font-semibold text-foreground">Max</h3>
                  <span className="ml-auto inline-flex items-center gap-1 px-2 py-0.5 rounded bg-amber-500/10 border border-amber-500/20">
                    <span className="w-1.5 h-1.5 rounded-full bg-amber-400 light:bg-amber-600 transition-transform duration-300 ease-out-standard group-hover/card:scale-125 motion-reduce:transform-none" />
                    <span className="text-xs font-medium text-amber-400 light:text-amber-600">抢先体验价</span>
                  </span>
                </div>
                <div className="mt-4 flex items-baseline gap-2">
                  <span className="text-3xl font-data font-semibold text-foreground">{PRICING.max}</span>
                  <span className="text-sm text-muted-foreground">{PRICING.interval}</span>
                  <span className="text-sm text-muted-foreground/70 line-through font-data ml-1">{PRICING.maxOriginal}</span>
                  <span className="text-xs font-medium text-amber-400">{PRICING.maxDiscount}</span>
                </div>
                <p className="text-xs text-muted-foreground mt-3">终身锁定此价格 · 仅限前 {EARLY_BIRD_TOTAL} 名</p>
              </div>

              <div className="relative px-6 py-5 space-y-3.5">
                {/* Pro features included */}
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Pro 全部功能，加上</p>
                {MAX_ONLY_FEATURES.map((item) => (
                  <div key={item.feature} className="flex items-start gap-3">
                    <Check className="w-4 h-4 text-amber-400 mt-0.5 shrink-0 transition-transform duration-200 ease-out-standard group-hover/card:scale-105 motion-reduce:transform-none" />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm text-foreground">{item.feature}</span>
                        {item.badge === 'NEW' && (
                          <span className="inline-flex items-center px-1.5 py-0.5 rounded text-micro font-semibold tracking-wider bg-amber-500/15 text-amber-400 border border-amber-400/30">
                            新功能
                          </span>
                        )}
                      </div>
                      <span className="text-xs text-muted-foreground/70 block">{item.desc}</span>
                    </div>
                  </div>
                ))}
                <div className="pt-2 border-t border-border/20">
                  <div className="flex flex-wrap gap-x-3 gap-y-1">
                    {PRO_FEATURES.map((item) => (
                      <span key={item.feature} className="text-xs text-muted-foreground/70 flex items-center gap-1">
                        <Check className="w-3 h-3 text-muted-foreground/70 shrink-0" />
                        {item.feature}
                      </span>
                    ))}
                  </div>
                </div>
              </div>

              <div className="relative px-6 pb-6">
                {loading ? (
                  <div className="w-full h-11 rounded-lg bg-muted animate-pulse" />
                ) : isPaidMax ? (
                  <div className="text-center text-sm text-muted-foreground py-2.5 border border-amber-400/20 rounded-lg bg-amber-400/5">
                    当前方案
                  </div>
                ) : (
                  <button
                    onClick={STRIPE_LIVE ? () => handleCheckout('max') : undefined}
                    disabled={!STRIPE_LIVE || checkoutTier === 'max'}
                    className="group/cta w-full px-4 py-3 bg-amber-600 text-white rounded-lg text-sm font-semibold transition-all duration-200 ease-out-standard hover:bg-amber-600/90 hover:shadow-[0_4px_20px_rgba(217,119,6,0.3)] active:scale-[0.98] cursor-pointer flex items-center justify-center gap-2 disabled:opacity-70 disabled:cursor-not-allowed disabled:hover:shadow-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400/35 motion-reduce:transform-none"
                  >
                    {!STRIPE_LIVE ? (
                      '即将开放'
                    ) : checkoutTier === 'max' ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                        跳转中...
                      </>
                    ) : isAuthenticated ? (
                      <>
                        <span>{isPaidPro ? `升级到 Max — ${PRICING.maxPerMonth}` : `订阅 Max — ${PRICING.maxPerMonth}`}</span>
                        <ArrowRight className="h-4 w-4 transition-transform duration-200 ease-out-standard group-hover/cta:translate-x-0.5 motion-reduce:transform-none" aria-hidden="true" />
                      </>
                    ) : (
                      <>
                        <span>登录后订阅</span>
                        <ArrowRight className="h-4 w-4 transition-transform duration-200 ease-out-standard group-hover/cta:translate-x-0.5 motion-reduce:transform-none" aria-hidden="true" />
                      </>
                    )}
                  </button>
                )}
                <p className="text-xs text-muted-foreground/70 text-center mt-3">
                  {STRIPE_LIVE ? '随时取消 · Stripe 安全支付' : '订阅功能即将上线，敬请期待'}
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* ── Why TheMarketBrew (replaces redundant feature highlights) ── */}
        <section className="mb-16 md:mb-20">
          <div className="flex items-center gap-3 mb-8 animate-fade-in-up" style={motionDelay(560)}>
            <div className="h-px flex-1 max-w-[60px] bg-gradient-to-r from-primary to-transparent animate-line-expand" style={lineMotion(620, 'left')} />
            <span className="text-primary text-xs font-semibold tracking-[0.2em] uppercase">
              Why us
            </span>
          </div>
          <div className="grid md:grid-cols-3 gap-4 max-w-4xl">
            {WHY_POINTS.map((item, i) => (
              <div
                key={item.title}
                className="group/why p-5 rounded-xl border border-border/30 bg-card/30 animate-fade-in-up transition-all duration-200 ease-out-standard hover:-translate-y-0.5 hover:border-primary/25 hover:bg-card/45 motion-reduce:transform-none"
                style={motionDelay(620 + i * 70)}
              >
                <h4 className="text-sm font-semibold text-foreground mb-1.5 transition-colors duration-200 group-hover/why:text-primary">{item.title}</h4>
                <p className="text-xs text-muted-foreground leading-relaxed">{item.desc}</p>
              </div>
            ))}
          </div>
        </section>

        {/* ── Social Proof ────────────────────────────────────── */}
        <section className="mb-16 md:mb-20">
          <div className="flex items-center gap-3 mb-8 animate-fade-in-up" style={motionDelay(680)}>
            <div className="h-px flex-1 max-w-[60px] bg-gradient-to-r from-primary to-transparent animate-line-expand" style={lineMotion(740, 'left')} />
            <span className="text-primary text-xs font-semibold tracking-[0.2em] uppercase">
              Users
            </span>
          </div>
          <div className="grid md:grid-cols-3 gap-4">
            {TESTIMONIALS.map((t, i) => (
              <div
                key={i}
                className="p-5 rounded-xl border border-border/30 bg-card/30 animate-fade-in-up transition-all duration-200 ease-out-standard hover:-translate-y-0.5 hover:border-border/60 hover:bg-card/45 motion-reduce:transform-none"
                style={motionDelay(740 + i * 70)}
              >
                <p className="text-sm text-foreground leading-relaxed mb-4">
                  &ldquo;{t.quote}&rdquo;
                </p>
                <p className="text-xs text-muted-foreground">&mdash; {t.role}</p>
              </div>
            ))}
          </div>
        </section>

        {/* Free Trial / Invite Code section removed in freemium transition */}

        {/* ── FAQ ─────────────────────────────────────────────── */}
        <div className="max-w-lg mx-auto animate-fade-in-up" style={motionDelay(820)}>
          <h2 className="text-center text-sm font-medium text-foreground mb-6 tracking-wide">
            常见问题
          </h2>
          <div className="space-y-0 divide-y divide-border/30">
            <FaqItem
              q="Pro 和 Max 有什么区别?"
              a="宏观仪表盘（/macro）、每日市场日报网站和自选股管理免费开放，注册即可使用。Pro 包含基础邮件订阅（每日晚报、盘前早报、专属持仓日报、宏观周报）。Max 在此基础上解锁推特 KOL 日报、AI 投研引擎（/research）的无限次对话与选股，以及 AI 深度个股分析（/stock）。"
            />
            <FaqItem
              q="抢先体验价会持续多久?"
              a={`Max ${PRICING.maxPerMonth} 的抢先体验价限前 ${EARLY_BIRD_TOTAL} 名用户，订阅后终身锁定此价格（原价 ${PRICING.maxOriginal}${PRICING.interval}）。Pro 同样享受早期锁定价。`}
            />
            <FaqItem
              q="可以从 Pro 升级到 Max 吗?"
              a="可以。在订阅管理页面直接升级，Stripe 会按剩余天数自动折算差价。"
            />
            <FaqItem
              q="可以随时取消吗?"
              a="可以。通过 Stripe 管理订阅，取消后当前计费周期内仍可使用，不会额外收费。"
            />
            <FaqItem
              q="免费版包含哪些功能?"
              a="注册后永久免费使用每日市场日报、宏观仪表盘和 25 只自选股管理；AI 投研引擎也提供每天 2 次免费体验。需要更深度功能时再升级 Pro 或 Max。"
            />
            <FaqItem
              q="支持哪些支付方式?"
              a="通过 Stripe 支付，支持 Visa、Mastercard、American Express 等主流信用卡和借记卡。"
            />
          </div>
        </div>

      </div>
    </main>
  );
}

function FaqItem({ q, a }: { q: string; a: string }) {
  const [open, setOpen] = useState(false);

  return (
    <div className="py-4">
      <button
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        className="w-full flex items-center justify-between text-left cursor-pointer group focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30 rounded-md"
      >
        <span className="text-sm text-foreground group-hover:text-primary transition-colors duration-200">
          {q}
        </span>
        <ChevronDown
          className={`w-4 h-4 text-muted-foreground shrink-0 ml-4 transition-transform duration-300 ease-out-standard motion-reduce:transform-none ${
            open ? 'rotate-180' : ''
          }`}
          aria-hidden="true"
        />
      </button>
      <div
        className="grid transition-[grid-template-rows] duration-300 ease-out-standard"
        style={{ gridTemplateRows: open ? '1fr' : '0fr' }}
      >
        <div className="overflow-hidden">
          <p className={`text-sm text-muted-foreground mt-2 pr-8 leading-relaxed pb-1 transition-all duration-300 ease-out-standard motion-reduce:transform-none ${
            open ? 'opacity-100 translate-y-0' : 'opacity-0 -translate-y-1'
          }`}>
            {a}
          </p>
        </div>
      </div>
    </div>
  );
}
