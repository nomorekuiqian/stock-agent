'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { useSubscription } from '@/contexts/SubscriptionContext';
import { Check, X, Zap, Mail, BarChart3, Brain, LineChart, Shield } from 'lucide-react';
import { PRICING } from '@/lib/pricing';

// ─── Free vs Pro comparison data ─────────────────────────────────────────────
const COMPARISON = [
  { feature: '每日市场日报（邮件）', free: true, pro: true, desc: 'AI 生成的每日市场分析，直达收件箱' },
  { feature: '完整市场日报（网站）', free: false, pro: true, desc: '盘前早报 + 盘后晚报，图表与深度解读' },
  { feature: 'AI 专属日报', free: false, pro: true, desc: '基于你的自选股，每日生成个性化分析' },
  { feature: 'AI 深度个股分析', free: false, pro: true, desc: '基本面、技术面、估值对比一键生成' },
  { feature: '投研助手', free: false, pro: true, desc: 'AI 驱动的交互式投研对话' },
  { feature: '宏观仪表盘', free: false, pro: true, desc: '流动性、经济、通胀、情绪四维度监控' },
  { feature: '自选股管理', free: false, pro: true, desc: '追踪最多 25 只股票，个性化推送' },
  { feature: 'AI 选股助手', free: false, pro: true, desc: '全市场筛选 + AI 对话式选股' },
];

// ─── Pro feature highlights ──────────────────────────────────────────────────
const HIGHLIGHTS = [
  { icon: BarChart3, title: '每日市场简报', desc: '5 分钟掌握市场全貌，不遗漏重要信号' },
  { icon: Brain, title: 'AI 专属分析', desc: '不是通用报告，是只与你的持仓相关的分析' },
  { icon: LineChart, title: '深度个股研究', desc: '估值、同行对比、多空观点，一键生成' },
  { icon: Shield, title: '宏观风险监控', desc: '30+ 指标实时追踪，提前预警市场风险' },
];

// ─── Real user quotes from questionnaire ─────────────────────────────────────
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
    isPro,
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
  const [checkoutLoading, setCheckoutLoading] = useState(false);

  const isExpiredTrial =
    isAuthenticated &&
    plan === 'pro' &&
    accessExpiresAt &&
    new Date(accessExpiresAt) < new Date();

  const isActiveTrial =
    isAuthenticated &&
    isPro &&
    accessExpiresAt &&
    new Date(accessExpiresAt) > new Date();

  // Paid Pro = isPro without trial expiry
  const isPaidPro = isPro && !accessExpiresAt;

  const loading = authLoading || subLoading;

  const handleCheckout = async () => {
    if (!isAuthenticated) {
      router.push('/login?redirect=/pricing');
      return;
    }
    setCheckoutLoading(true);
    await createCheckout();
    setCheckoutLoading(false);
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
      setCodeError(result.error || '兑换失败，请稍后再试');
    }
  };

  return (
    <main className="min-h-screen bg-background pt-24 pb-20 px-4">
      <div className="max-w-5xl mx-auto">

        {/* ─── Hero ─────────────────────────────────────────────── */}
        <div className="text-center mb-16 md:mb-20 space-y-5">
          <div className="flex items-center justify-center gap-3">
            <div className="h-px flex-1 max-w-[60px] bg-gradient-to-r from-primary to-transparent" />
            <span className="text-primary text-xs font-medium tracking-[0.2em] uppercase">
              Pricing
            </span>
            <div className="h-px flex-1 max-w-[60px] bg-gradient-to-l from-primary to-transparent" />
          </div>
          <h1 className="text-3xl md:text-5xl font-editorial text-foreground tracking-tight">
            所有功能，一个价格
          </h1>
          <p className="text-muted-foreground text-sm md:text-lg max-w-lg mx-auto leading-relaxed">
            从市场日报到 AI 个股深研，一个订阅解锁全部专业分析工具
          </p>
        </div>

        {/* ─── Status Banners ───────────────────────────────────── */}
        {!loading && isPaidPro && (
          <div className="text-center mb-10">
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-primary/10 border border-primary/20">
              <Check className="w-4 h-4 text-primary" />
              <span className="text-sm text-primary font-medium">你已是 Pro 会员</span>
            </div>
          </div>
        )}
        {!loading && isActiveTrial && (
          <div className="text-center mb-10">
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-primary/10 border border-primary/20">
              <Check className="w-4 h-4 text-primary" />
              <span className="text-sm text-primary font-medium">
                邀请码体验中 — 订阅后可享每月不间断服务
              </span>
            </div>
          </div>
        )}
        {!loading && isExpiredTrial && (
          <div className="text-center mb-10">
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-amber-500/10 border border-amber-500/20">
              <span className="text-sm text-amber-400 light:text-amber-600 font-medium">
                你的体验期已结束，升级 Pro 继续使用全部功能
              </span>
            </div>
          </div>
        )}

        {/* ─── Free vs Pro Comparison ──────────────────────────── */}
        <div className="grid md:grid-cols-2 gap-4 md:gap-6 mb-16 md:mb-20 max-w-4xl mx-auto">

          {/* Free Column */}
          <div className="rounded-xl border border-border/40 bg-card/30 overflow-hidden">
            <div className="px-6 py-5 border-b border-border/30">
              <div className="flex items-center gap-2 mb-1">
                <Mail className="w-4 h-4 text-muted-foreground" />
                <h3 className="text-lg font-semibold text-foreground">免费版</h3>
              </div>
              <p className="text-xs text-muted-foreground">邮件订阅，接收每日市场日报</p>
              <div className="mt-4">
                <span className="text-3xl font-data font-bold text-foreground">$0</span>
                <span className="text-sm text-muted-foreground ml-1">/月</span>
              </div>
            </div>
            <div className="px-6 py-5 space-y-3.5">
              {COMPARISON.map((item) => (
                <div key={item.feature} className="flex items-start gap-3">
                  {item.free ? (
                    <Check className="w-4 h-4 text-primary mt-0.5 shrink-0" />
                  ) : (
                    <X className="w-4 h-4 text-muted-foreground/30 mt-0.5 shrink-0" />
                  )}
                  <span className={`text-sm ${item.free ? 'text-foreground' : 'text-muted-foreground/40'}`}>
                    {item.feature}
                  </span>
                </div>
              ))}
            </div>
            <div className="px-6 pb-6">
              <Link
                href="/"
                className="block w-full px-4 py-2.5 border border-border/60 rounded-lg text-sm font-medium text-muted-foreground text-center hover:border-border transition-colors"
              >
                订阅邮件 — 免费
              </Link>
            </div>
          </div>

          {/* Pro Column */}
          <div className="relative rounded-xl border border-primary/30 bg-card/50 overflow-hidden ring-1 ring-primary/10">
            {/* Glow */}
            <div className="absolute -top-20 left-1/2 -translate-x-1/2 w-60 h-40 bg-primary/10 blur-[80px] pointer-events-none" />

            <div className="relative px-6 py-5 border-b border-primary/20">
              <div className="flex items-center gap-2 mb-1">
                <Zap className="w-4 h-4 text-primary" />
                <h3 className="text-lg font-semibold text-foreground">Pro</h3>
                <span className="ml-auto inline-flex items-center gap-1 px-2 py-0.5 rounded bg-amber-500/10 border border-amber-500/20">
                  <span className="w-1.5 h-1.5 rounded-full bg-amber-400 light:bg-amber-600" />
                  <span className="text-xs font-medium text-amber-400 light:text-amber-600">抢先体验价</span>
                </span>
              </div>
              <p className="text-xs text-muted-foreground">全部功能解锁，AI 驱动专业分析</p>
              <div className="mt-4 flex items-baseline gap-2">
                <span className="text-3xl font-data font-bold text-foreground">{PRICING.pro}</span>
                <span className="text-sm text-muted-foreground">{PRICING.interval}</span>
                <span className="text-sm text-muted-foreground/60 line-through font-data ml-1">{PRICING.original}</span>
                <span className="text-xs font-medium text-primary">{PRICING.discount}</span>
              </div>
              <div className="mt-3 flex flex-col gap-1">
                <p className="text-xs text-muted-foreground">终身锁定此价格 · 仅限前 {EARLY_BIRD_TOTAL} 名</p>
              </div>
            </div>

            <div className="relative px-6 py-5 space-y-3.5">
              {COMPARISON.map((item) => (
                <div key={item.feature} className="flex items-start gap-3">
                  <Check className="w-4 h-4 text-primary mt-0.5 shrink-0" />
                  <div>
                    <span className="text-sm text-foreground">{item.feature}</span>
                    <span className="text-xs text-muted-foreground/60 block">{item.desc}</span>
                  </div>
                </div>
              ))}
            </div>

            <div className="relative px-6 pb-6">
              {loading ? (
                <div className="w-full h-11 rounded-lg bg-muted animate-pulse" />
              ) : isPaidPro ? (
                <div className="text-center text-sm text-muted-foreground py-2.5 border border-primary/20 rounded-lg bg-primary/5">
                  当前已订阅
                </div>
              ) : (
                <button
                  onClick={handleCheckout}
                  disabled={checkoutLoading}
                  className="w-full px-4 py-3 bg-primary text-primary-foreground rounded-lg text-sm font-semibold transition-all hover:bg-primary/90 active:scale-[0.98] cursor-pointer flex items-center justify-center gap-2 disabled:opacity-70"
                >
                  {checkoutLoading ? (
                    <>
                      <div className="w-4 h-4 rounded-full border-2 border-primary-foreground/30 border-t-primary-foreground animate-spin" />
                      跳转中...
                    </>
                  ) : isAuthenticated ? (
                    isActiveTrial ? `升级为付费订阅 — ${PRICING.proPerMonth}` : `立即订阅 — ${PRICING.proPerMonth}`
                  ) : (
                    '登录后订阅'
                  )}
                </button>
              )}
              <p className="text-xs text-muted-foreground/60 text-center mt-3">
                随时取消 · Stripe 安全支付
              </p>
            </div>
          </div>
        </div>

        {/* ─── Feature Highlights ──────────────────────────────── */}
        <section className="mb-16 md:mb-20">
          <div className="flex items-center gap-3 mb-8">
            <div className="h-px flex-1 max-w-[60px] bg-gradient-to-r from-primary to-transparent" />
            <span className="text-primary text-xs font-medium tracking-[0.2em] uppercase">
              What you get
            </span>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {HIGHLIGHTS.map((h) => (
              <div
                key={h.title}
                className="p-5 rounded-xl border border-border/30 bg-card/30 hover:border-primary/20 transition-colors"
              >
                <h.icon className="w-5 h-5 text-primary mb-3" />
                <h4 className="text-sm font-semibold text-foreground mb-1.5">{h.title}</h4>
                <p className="text-xs text-muted-foreground leading-relaxed">{h.desc}</p>
              </div>
            ))}
          </div>
        </section>

        {/* ─── Social Proof ────────────────────────────────────── */}
        <section className="mb-16 md:mb-20">
          <div className="flex items-center gap-3 mb-8">
            <div className="h-px flex-1 max-w-[60px] bg-gradient-to-r from-primary to-transparent" />
            <span className="text-primary text-xs font-medium tracking-[0.2em] uppercase">
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
                <p className="text-xs text-muted-foreground">— {t.role}</p>
              </div>
            ))}
          </div>
        </section>

        {/* ─── Invite Code ─────────────────────────────────────── */}
        {!loading && !isPaidPro && (
          <section className="max-w-md mx-auto mb-16 md:mb-20">
            <div className="text-center mb-5">
              <div className="h-px bg-border/30 mb-5" />
              <p className="text-xs text-muted-foreground tracking-wide uppercase">
                {isActiveTrial ? '还没准备好付费？' : '或使用邀请码'}
              </p>
            </div>

            {redeemSuccess ? (
              <div className="terminal-card p-6 text-center">
                <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-3">
                  <Check className="w-5 h-5 text-primary" />
                </div>
                <p className="text-sm font-medium text-foreground mb-1">兑换成功</p>
                <p className="text-xs text-muted-foreground">你已获得 14 天 Pro 体验</p>
                <Link
                  href="/today"
                  className="inline-block mt-4 text-xs text-primary hover:text-primary/80 transition-colors"
                >
                  开始探索 →
                </Link>
              </div>
            ) : (
              <>
                {isActiveTrial && (
                  <p className="text-xs text-muted-foreground text-center mb-3">
                    邀请码提供 14 天免费体验，付费订阅则按月持续使用
                  </p>
                )}
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={codeInput}
                    onChange={(e) => setCodeInput(e.target.value.toUpperCase())}
                    onKeyDown={(e) => e.key === 'Enter' && handleRedeem()}
                    placeholder="输入邀请码"
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
            {!isActiveTrial && (
              <p className="text-center mt-3">
                <Link
                  href="/request-access"
                  className="text-xs text-muted-foreground hover:text-foreground transition-colors"
                >
                  没有邀请码？填写问卷免费获取 →
                </Link>
              </p>
            )}
          </section>
        )}

        {/* ─── FAQ ─────────────────────────────────────────────── */}
        <div className="max-w-lg mx-auto">
          <h2 className="text-center text-sm font-medium text-foreground mb-6 tracking-wide">
            常见问题
          </h2>
          <div className="space-y-0 divide-y divide-border/30">
            <FaqItem
              q="抢先体验价会持续多久？"
              a={`${PRICING.proPerMonth}的抢先体验价限前 ${EARLY_BIRD_TOTAL} 名用户，订阅后终身锁定此价格（原价 ${PRICING.original}${PRICING.interval}）。未来产品成熟后将推出不同价格层级。`}
            />
            <FaqItem
              q="可以随时取消吗？"
              a="可以。通过 Stripe 管理订阅，取消后当前计费周期内仍可使用，不会额外收费。"
            />
            <FaqItem
              q="邀请码和付费订阅有什么区别？"
              a="邀请码提供 14 天免费 Pro 体验，到期后需要续码或订阅。付费订阅按月自动续费，持续享有全部功能。"
            />
            <FaqItem
              q="支持哪些支付方式？"
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
        <span className="text-sm text-foreground group-hover:text-primary transition-colors">
          {q}
        </span>
        <svg
          className={`w-4 h-4 text-muted-foreground shrink-0 ml-4 transition-transform duration-200 ${
            open ? 'rotate-180' : ''
          }`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>
      {open && (
        <p className="text-sm text-muted-foreground mt-2 pr-8 leading-relaxed">
          {a}
        </p>
      )}
    </div>
  );
}
