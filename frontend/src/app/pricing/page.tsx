'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { useSubscription } from '@/contexts/SubscriptionContext';
import { Check, Zap, Crown } from 'lucide-react';
import { PRICING, STRIPE_LIVE } from '@/lib/pricing';

// ── Feature comparison data ──────────────────────────────────────────────────
const PRO_FEATURES = [
  { feature: '每日市场日报（邮件）', desc: 'AI 生成的每日市场分析，直达收件箱' },
  { feature: '盘前早报（邮件）',    desc: '每个交易日早上推送，帮你预判开盘' },
  { feature: '专属持仓日报（邮件）', desc: '基于你的实际持仓，每日生成只属于你的分析报告' },
  { feature: '宏观周报（邮件）',    desc: '每周宏观要点汇总，直达收件箱' },
  { feature: '自选股管理',          desc: '追踪最多 25 只股票，个性化推送' },
  { feature: '市场日报网站',        desc: '在 /today 查看完整晚报和历史存档' },
];

const MAX_ONLY_FEATURES = [
  { feature: 'AI 深度个股分析',     desc: '基本面、技术面、估值对比一键生成' },
  { feature: 'AI 投研引擎',        desc: '对话式投研 + 全市场选股，一个 Agent 搞定' },
  { feature: '宏观仪表盘',         desc: '流动性、经济、通胀、情绪四维度监控' },
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

const EARLY_BIRD_TOTAL = PRICING.earlyAccessTotal;

export default function PricingPage() {
  const router = useRouter();
  const { isAuthenticated, isLoading: authLoading } = useAuth();
  const {
    isPro, isMax,
    isLoading: subLoading,
    createCheckout,
    redeemInviteCode,
    plan,
    accessExpiresAt,
  } = useSubscription();

  const [codeInput, setCodeInput] = useState('');
  const [codeError, setCodeError] = useState('');
  const [isRedeeming, setIsRedeeming] = useState(false);
  const [redeemSuccess, setRedeemSuccess] = useState(false);
  const [checkoutTier, setCheckoutTier] = useState<'pro' | 'max' | null>(null);

  const isExpiredTrial =
    isAuthenticated &&
    (plan === 'pro' || plan === 'max') &&
    accessExpiresAt &&
    new Date(accessExpiresAt) < new Date();

  const isActiveTrial =
    isAuthenticated &&
    isPro &&
    accessExpiresAt &&
    new Date(accessExpiresAt) > new Date();

  const isPaidPro = isPro && !accessExpiresAt && plan === 'pro';
  const isPaidMax = isMax && !accessExpiresAt;
  const isPaidAny = isPaidPro || isPaidMax;

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

  const handleRedeem = async () => {
    if (!codeInput.trim()) return;
    if (!isAuthenticated) {
      router.push('/login?redirect=/pricing');
      return;
    }
    setIsRedeeming(true);
    setCodeError('');
    const result = await redeemInviteCode(codeInput.trim());
    setIsRedeeming(false);
    if (result.success) {
      setRedeemSuccess(true);
    } else {
      setCodeError(result.error || '兑换失败');
    }
  };

  return (
    <main className="min-h-screen bg-background pt-24 pb-20 px-4">
      <div className="max-w-6xl mx-auto">

        {/* ── Hero ─────────────────────────────────────────────── */}
        <div className="text-center mb-16 md:mb-20 space-y-5">
          <div className="flex items-center justify-center gap-3 animate-fade-in-up">
            <div className="h-px flex-1 max-w-[60px] bg-gradient-to-r from-primary to-transparent animate-line-expand" />
            <span className="text-primary text-xs font-semibold tracking-[0.25em] uppercase">
              Pricing
            </span>
            <div className="h-px flex-1 max-w-[60px] bg-gradient-to-l from-primary to-transparent animate-line-expand" style={{ animationDirection: 'reverse', transformOrigin: 'right' }} />
          </div>
          <h1 className="text-3xl md:text-5xl font-editorial text-foreground tracking-tight leading-[1.1] animate-fade-in-up delay-100">
            选择适合你的方案
          </h1>
          <p className="text-muted-foreground text-sm md:text-lg max-w-lg mx-auto leading-relaxed animate-fade-in-up delay-200">
            从邮件订阅到全平台 AI 分析工具，按需选择
          </p>
        </div>

        {/* ── Status Banners ───────────────────────────────────── */}
        {!loading && isPaidMax && (
          <div className="text-center mb-10">
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-amber-400/10 border border-amber-400/20">
              <Crown className="w-4 h-4 text-amber-400" />
              <span className="text-sm text-amber-400 font-medium">你已是 Max 会员</span>
            </div>
          </div>
        )}
        {!loading && isPaidPro && (
          <div className="text-center mb-10">
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-primary/10 border border-primary/20">
              <Check className="w-4 h-4 text-primary" />
              <span className="text-sm text-primary font-medium">你已是 Pro 会员 — 升级 Max 解锁全部功能</span>
            </div>
          </div>
        )}
        {!loading && isActiveTrial && (
          <div className="text-center mb-10">
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-primary/10 border border-primary/20">
              <Check className="w-4 h-4 text-primary" />
              <span className="text-sm text-primary font-medium">
                免费试用中 -- 订阅后可享每月不间断服务
              </span>
            </div>
          </div>
        )}
        {!loading && isExpiredTrial && (
          <div className="text-center mb-10">
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-amber-500/10 border border-amber-500/20">
              <span className="text-sm text-amber-400 light:text-amber-600 font-medium">
                你的体验期已结束，选择一个方案继续使用
              </span>
            </div>
          </div>
        )}

        {/* ── Two-column Pricing + Free aside ─────────────────── */}
        <div className="max-w-4xl mx-auto mb-16 md:mb-20">

          {/* Free tier — compact inline banner */}
          <div className="flex items-center justify-center gap-3 mb-6 py-3 px-5 rounded-lg border border-border/30 bg-card/20 max-w-md mx-auto">
            <span className="text-sm text-muted-foreground">免费版</span>
            <span className="text-xs text-muted-foreground/60">|</span>
            <span className="text-sm text-muted-foreground">每日市场日报邮件</span>
            <Link
              href="/#subscribe"
              className="ml-auto text-xs text-primary hover:text-primary/80 transition-colors shrink-0"
            >
              免费订阅 &rarr;
            </Link>
          </div>

          {/* Pro + Max columns */}
          <div className="grid md:grid-cols-2 gap-4 md:gap-6">

            {/* Pro Column */}
            <div className="relative rounded-xl border border-primary/30 bg-card/50 overflow-hidden ring-1 ring-primary/10 transition-all duration-300 hover:-translate-y-1 hover:shadow-lg hover:shadow-primary/5 motion-reduce:hover:translate-y-0 motion-reduce:hover:shadow-none">
              <div className="absolute -top-20 left-1/2 -translate-x-1/2 w-60 h-40 bg-primary/10 blur-[80px] pointer-events-none" />

              <div className="relative px-6 py-5 border-b border-primary/20">
                <div className="flex items-center gap-2 mb-1">
                  <Zap className="w-4 h-4 text-primary" />
                  <h3 className="text-lg font-semibold text-foreground">Pro</h3>
                  <span className="ml-auto inline-flex items-center gap-1 px-2 py-0.5 rounded bg-primary/10 border border-primary/20">
                    <span className="w-1.5 h-1.5 rounded-full bg-primary" />
                    <span className="text-xs font-medium text-primary">抢先体验价</span>
                  </span>
                </div>
                <p className="text-xs text-muted-foreground">邮件全解锁 + 市场日报网站</p>
                <div className="mt-4 flex items-baseline gap-2">
                  <span className="text-3xl font-data font-bold text-foreground">{PRICING.pro}</span>
                  <span className="text-sm text-muted-foreground">{PRICING.interval}</span>
                  <span className="text-sm text-muted-foreground/60 line-through font-data ml-1">{PRICING.proOriginal}</span>
                  <span className="text-xs font-medium text-primary">{PRICING.proDiscount}</span>
                </div>
                <p className="text-xs text-muted-foreground mt-3">终身锁定此价格 · 仅限前 {EARLY_BIRD_TOTAL} 名</p>
              </div>

              <div className="relative px-6 py-5 space-y-3.5">
                {PRO_FEATURES.map((item) => (
                  <div key={item.feature} className="flex items-start gap-3">
                    <Check className="w-4 h-4 text-primary mt-0.5 shrink-0" />
                    <div>
                      <span className="text-sm text-foreground">{item.feature}</span>
                      <span className="text-xs text-muted-foreground/60 block">{item.desc}</span>
                    </div>
                  </div>
                ))}
                {/* Max-only teaser */}
                <div className="pt-2 border-t border-border/20">
                  <p className="text-xs text-muted-foreground/50">
                    个股投研、AI 投研引擎、宏观仪表盘 → 升级 Max
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
                    className="w-full px-4 py-3 bg-primary text-primary-foreground rounded-lg text-sm font-semibold transition-all duration-200 hover:bg-primary/90 hover:shadow-[0_4px_20px_rgba(5,150,105,0.25)] active:scale-[0.98] cursor-pointer flex items-center justify-center gap-2 disabled:opacity-70 disabled:cursor-not-allowed disabled:hover:shadow-none"
                  >
                    {!STRIPE_LIVE ? (
                      '即将开放'
                    ) : checkoutTier === 'pro' ? (
                      <>
                        <div className="w-4 h-4 rounded-full border-2 border-primary-foreground/30 border-t-primary-foreground animate-spin" />
                        跳转中...
                      </>
                    ) : isAuthenticated ? (
                      `订阅 Pro — ${PRICING.proPerMonth}`
                    ) : (
                      '登录后订阅'
                    )}
                  </button>
                )}
                <p className="text-xs text-muted-foreground/60 text-center mt-3">
                  {STRIPE_LIVE ? '随时取消 · Stripe 安全支付' : '订阅功能即将上线，敬请期待'}
                </p>
              </div>
            </div>

            {/* Max Column */}
            <div className="relative rounded-xl border border-amber-400/30 bg-card/50 overflow-hidden ring-1 ring-amber-400/10 transition-all duration-300 hover:-translate-y-1 hover:shadow-lg hover:shadow-amber-400/8 motion-reduce:hover:translate-y-0 motion-reduce:hover:shadow-none">
              <div className="absolute -top-20 left-1/2 -translate-x-1/2 w-60 h-40 bg-amber-400/10 blur-[80px] pointer-events-none" />

              <div className="relative px-6 py-5 border-b border-amber-400/20">
                <div className="flex items-center gap-2 mb-1">
                  <Crown className="w-4 h-4 text-amber-400" />
                  <h3 className="text-lg font-semibold text-foreground">Max</h3>
                  <span className="ml-auto inline-flex items-center gap-1 px-2 py-0.5 rounded bg-amber-500/10 border border-amber-500/20">
                    <span className="w-1.5 h-1.5 rounded-full bg-amber-400 light:bg-amber-600" />
                    <span className="text-xs font-medium text-amber-400 light:text-amber-600">抢先体验价</span>
                  </span>
                </div>
                <p className="text-xs text-muted-foreground">全部功能解锁，AI 驱动专业分析</p>
                <div className="mt-4 flex items-baseline gap-2">
                  <span className="text-3xl font-data font-bold text-foreground">{PRICING.max}</span>
                  <span className="text-sm text-muted-foreground">{PRICING.interval}</span>
                  <span className="text-sm text-muted-foreground/60 line-through font-data ml-1">{PRICING.maxOriginal}</span>
                  <span className="text-xs font-medium text-amber-400">{PRICING.maxDiscount}</span>
                </div>
                <p className="text-xs text-muted-foreground mt-3">终身锁定此价格 · 仅限前 {EARLY_BIRD_TOTAL} 名</p>
              </div>

              <div className="relative px-6 py-5 space-y-3.5">
                {/* Pro features included */}
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Pro 全部功能，加上</p>
                {MAX_ONLY_FEATURES.map((item) => (
                  <div key={item.feature} className="flex items-start gap-3">
                    <Check className="w-4 h-4 text-amber-400 mt-0.5 shrink-0" />
                    <div>
                      <span className="text-sm text-foreground">{item.feature}</span>
                      <span className="text-xs text-muted-foreground/60 block">{item.desc}</span>
                    </div>
                  </div>
                ))}
                <div className="pt-2 border-t border-border/20">
                  <div className="flex flex-wrap gap-x-3 gap-y-1">
                    {PRO_FEATURES.map((item) => (
                      <span key={item.feature} className="text-xs text-muted-foreground/50 flex items-center gap-1">
                        <Check className="w-3 h-3 text-muted-foreground/30 shrink-0" />
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
                    className="w-full px-4 py-3 bg-amber-600 text-white rounded-lg text-sm font-semibold transition-all duration-200 hover:bg-amber-600/90 hover:shadow-[0_4px_20px_rgba(217,119,6,0.3)] active:scale-[0.98] cursor-pointer flex items-center justify-center gap-2 disabled:opacity-70 disabled:cursor-not-allowed disabled:hover:shadow-none"
                  >
                    {!STRIPE_LIVE ? (
                      '即将开放'
                    ) : checkoutTier === 'max' ? (
                      <>
                        <div className="w-4 h-4 rounded-full border-2 border-white/30 border-t-white animate-spin" />
                        跳转中...
                      </>
                    ) : isAuthenticated ? (
                      isPaidPro ? `升级到 Max — ${PRICING.maxPerMonth}` : `订阅 Max — ${PRICING.maxPerMonth}`
                    ) : (
                      '登录后订阅'
                    )}
                  </button>
                )}
                <p className="text-xs text-muted-foreground/60 text-center mt-3">
                  {STRIPE_LIVE ? '随时取消 · Stripe 安全支付' : '订阅功能即将上线，敬请期待'}
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* ── Why TheMarketBrew (replaces redundant feature highlights) ── */}
        <section className="mb-16 md:mb-20">
          <div className="flex items-center gap-3 mb-8">
            <div className="h-px flex-1 max-w-[60px] bg-gradient-to-r from-primary to-transparent" />
            <span className="text-primary text-xs font-semibold tracking-[0.25em] uppercase">
              Why us
            </span>
          </div>
          <div className="grid md:grid-cols-3 gap-4 max-w-4xl">
            <div className="p-5 rounded-xl border border-border/30 bg-card/30 transition-colors duration-200 hover:border-primary/20">
              <h4 className="text-sm font-semibold text-foreground mb-1.5">5 分钟掌握全貌</h4>
              <p className="text-xs text-muted-foreground leading-relaxed">不用刷新闻、不用翻 K 线，每天一份报告覆盖市场全局</p>
            </div>
            <div className="p-5 rounded-xl border border-border/30 bg-card/30 transition-colors duration-200 hover:border-primary/20">
              <h4 className="text-sm font-semibold text-foreground mb-1.5">只属于你的分析</h4>
              <p className="text-xs text-muted-foreground leading-relaxed">基于你的真实持仓生成，不是通用文章的复制粘贴</p>
            </div>
            <div className="p-5 rounded-xl border border-border/30 bg-card/30 transition-colors duration-200 hover:border-primary/20">
              <h4 className="text-sm font-semibold text-foreground mb-1.5">宏观到个股，一站式</h4>
              <p className="text-xs text-muted-foreground leading-relaxed">从美联储到你持仓的具体标的，用一个工具搞定</p>
            </div>
          </div>
        </section>

        {/* ── Social Proof ────────────────────────────────────── */}
        <section className="mb-16 md:mb-20">
          <div className="flex items-center gap-3 mb-8">
            <div className="h-px flex-1 max-w-[60px] bg-gradient-to-r from-primary to-transparent" />
            <span className="text-primary text-xs font-semibold tracking-[0.25em] uppercase">
              Users
            </span>
          </div>
          <div className="grid md:grid-cols-3 gap-4">
            {TESTIMONIALS.map((t, i) => (
              <div
                key={i}
                className="p-5 rounded-xl border border-border/30 bg-card/30"
              >
                <p className="text-sm text-foreground/90 leading-relaxed mb-4">
                  &ldquo;{t.quote}&rdquo;
                </p>
                <p className="text-xs text-muted-foreground">&mdash; {t.role}</p>
              </div>
            ))}
          </div>
        </section>

        {/* ── Free Trial / Invite Code ────────────────────────── */}
        {!loading && !isPaidAny && (
          <section className="max-w-md mx-auto mb-16 md:mb-20">
            <div className="text-center mb-5">
              <div className="h-px bg-border/30 mb-5" />
              <p className="text-xs text-muted-foreground tracking-wide uppercase">
                {isActiveTrial ? '还没准备好付费?' : '免费试用'}
              </p>
            </div>

            {!isAuthenticated && !isActiveTrial && (
              <div className="text-center mb-5">
                <Link
                  href="/login?redirect=/pricing"
                  className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg border border-primary/30 bg-primary/5 hover:bg-primary/10 text-sm font-medium text-primary transition-colors"
                >
                  注册即试用 14 天全功能
                </Link>
              </div>
            )}

            {redeemSuccess ? (
              <div className="terminal-card p-6 text-center">
                <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-3">
                  <Check className="w-5 h-5 text-primary" />
                </div>
                <p className="text-sm font-medium text-foreground mb-1">兑换成功</p>
                <p className="text-xs text-muted-foreground">你已获得 14 天全功能体验</p>
                <Link
                  href="/today"
                  className="inline-block mt-4 text-xs text-primary hover:text-primary/80 transition-colors"
                >
                  开始探索 &rarr;
                </Link>
              </div>
            ) : (
              <>
                {isActiveTrial && (
                  <p className="text-xs text-muted-foreground text-center mb-3">
                    试用期 14 天免费体验，付费订阅则按月持续使用
                  </p>
                )}
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={codeInput}
                    onChange={(e) => setCodeInput(e.target.value.toUpperCase())}
                    onKeyDown={(e) => e.key === 'Enter' && handleRedeem()}
                    placeholder="有邀请码？在此输入"
                    className="flex-1 px-3 py-2.5 bg-card border border-border/60 rounded-lg text-sm text-foreground placeholder:text-muted-foreground/50 font-mono tracking-wider focus:outline-none focus:border-primary/60 focus:ring-1 focus:ring-primary/20 transition-colors"
                  />
                  <button
                    onClick={handleRedeem}
                    disabled={isRedeeming || !codeInput.trim()}
                    className="px-4 py-2.5 bg-card border border-border/60 rounded-lg text-sm font-medium text-foreground hover:border-primary/40 hover:text-primary transition-colors disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer shrink-0"
                  >
                    {isRedeeming ? '兑换中...' : '兑换'}
                  </button>
                </div>
              </>
            )}
            {codeError && (
              <p className="text-xs text-red-400 mt-2 text-center">{codeError}</p>
            )}
          </section>
        )}

        {/* ── FAQ ─────────────────────────────────────────────── */}
        <div className="max-w-lg mx-auto">
          <h2 className="text-center text-sm font-medium text-foreground mb-6 tracking-wide">
            常见问题
          </h2>
          <div className="space-y-0 divide-y divide-border/30">
            <FaqItem
              q="Pro 和 Max 有什么区别?"
              a="Pro 包含全部邮件订阅（每日晚报、盘前早报、专属持仓日报、宏观周报），以及市场日报网站（/today 和历史存档）和自选股管理。Max 在此基础上解锁 AI 深度个股分析、AI 投研引擎、宏观仪表盘，以及 /morning、/macro、/stock、/research 等全部网站深度功能。"
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
              q="免费试用包含哪些功能?"
              a="注册即可获得 14 天全功能（Max 级别）体验，到期后可选择 Pro 或 Max 继续使用。"
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
        className="w-full flex items-center justify-between text-left cursor-pointer group"
      >
        <span className="text-sm text-foreground group-hover:text-primary transition-colors duration-200">
          {q}
        </span>
        <svg
          className={`w-4 h-4 text-muted-foreground shrink-0 ml-4 transition-transform duration-300 ease-out ${
            open ? 'rotate-180' : ''
          }`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>
      <div
        className="grid transition-[grid-template-rows] duration-300 ease-out"
        style={{ gridTemplateRows: open ? '1fr' : '0fr' }}
      >
        <div className="overflow-hidden">
          <p className="text-sm text-muted-foreground mt-2 pr-8 leading-relaxed pb-1">
            {a}
          </p>
        </div>
      </div>
    </div>
  );
}
