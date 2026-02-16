'use client';

import { ReactNode, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { useSubscription } from '@/contexts/SubscriptionContext';

const PAYWALL_ENABLED = process.env.NEXT_PUBLIC_ENABLE_PAYWALL === 'true';

const FEATURES = [
  {
    title: 'AI 个性化日报',
    desc: '根据你的持仓定制，每天 5 分钟掌握关键信号',
    free: false,
    pro: true,
  },
  {
    title: 'AI 个股深度分析',
    desc: '基本面、技术面、风险评估一键生成',
    free: false,
    pro: true,
  },
  {
    title: '宏观仪表盘',
    desc: '通胀、利率、就业等核心指标实时追踪',
    free: false,
    pro: true,
  },
  {
    title: '流动性监控',
    desc: '美联储资产负债表、逆回购等流动性指标',
    free: false,
    pro: true,
  },
  {
    title: '板块分析',
    desc: '11 大板块轮动追踪，发现资金流向',
    free: false,
    pro: true,
  },
  {
    title: '每日市场速报',
    desc: '市场概览与重要事件汇总',
    free: true,
    pro: true,
  },
];

const FAQS = [
  {
    q: '可以随时取消吗?',
    a: '可以。在账户设置中一键取消，不会额外收费。取消后当期仍可使用至到期日。',
  },
  {
    q: '支付安全吗?',
    a: '所有支付通过 Stripe 处理，符合 PCI DSS 安全标准。我们不存储你的信用卡信息。',
  },
  {
    q: '数据来源是什么?',
    a: '整合 Yahoo Finance、FMP、FRED、OpenBB 四大数据源，覆盖美股行情、财务数据、宏观经济指标。',
  },
  {
    q: '分析报告多久更新?',
    a: '市场日报每个交易日更新。个股分析和宏观数据实时生成，基于最新市场数据。',
  },
];

export default function PaywallGuard({ children }: { children: ReactNode }) {
  const router = useRouter();
  const { isAuthenticated, isLoading: authLoading } = useAuth();
  const {
    isPro,
    isLoading: subLoading,
    isCheckoutLoading,
    checkoutError,
    createCheckout,
    openBillingPortal,
    plan,
    status,
  } = useSubscription();
  const [openFaq, setOpenFaq] = useState<number | null>(null);

  // DEBUG: Visible state indicator (remove after debugging)
  const debugInfo = process.env.NODE_ENV === 'development' ? (
    <div className="fixed bottom-4 right-4 z-[9999] bg-black/90 text-xs text-white p-3 rounded-lg font-mono max-w-xs border border-zinc-700">
      <div>PAYWALL_ENABLED: {String(PAYWALL_ENABLED)}</div>
      <div>authLoading: {String(authLoading)}</div>
      <div>subLoading: {String(subLoading)}</div>
      <div>isAuthenticated: {String(isAuthenticated)}</div>
      <div>isPro: {String(isPro)}</div>
      <div>plan: {plan}</div>
      <div>status: {status}</div>
    </div>
  ) : null;

  if (!PAYWALL_ENABLED) {
    return <>{debugInfo}{children}</>;
  }

  if (authLoading || subLoading) {
    return (
      <main className="min-h-screen bg-background">
        <div className="max-w-5xl mx-auto px-4 md:px-6 py-20">
          <div className="flex flex-col items-center justify-center gap-4">
            <div className="w-10 h-10 rounded-full border-2 border-emerald-500/20 border-t-emerald-500 animate-spin" />
            <p className="text-muted-foreground text-sm">Loading...</p>
          </div>
        </div>
      </main>
    );
  }

  const needsLogin = !isAuthenticated;

  const handleCtaClick = () => {
    if (needsLogin) {
      const redirect = typeof window !== 'undefined' ? window.location.pathname : '/';
      router.push(`/login?redirect=${encodeURIComponent(redirect)}`);
    } else {
      createCheckout();
    }
  };

  if (!isPro) {
    return (
      <main className="min-h-screen bg-background">
        {/* Hero */}
        <section className="border-b border-border/50">
          <div className="max-w-3xl mx-auto px-4 md:px-6 pt-16 pb-12 text-center">
            <div className="flex items-center justify-center gap-2 mb-6">
              <div className="h-px w-12 bg-gradient-to-r from-transparent to-emerald-500/50" />
              <span className="text-emerald-400 text-xs font-medium tracking-[0.2em] uppercase">Pro</span>
              <div className="h-px w-12 bg-gradient-to-l from-transparent to-emerald-500/50" />
            </div>

            <h1 className="text-3xl md:text-4xl font-editorial text-foreground mb-4 leading-tight">
              专业级市场分析
              <br />
              <span className="text-emerald-400">为你的每个决策赋能</span>
            </h1>

            <p className="text-muted-foreground text-base max-w-lg mx-auto mb-8 leading-relaxed">
              整合 4 大数据源，AI 自动生成市场日报、个股分析、宏观风险评估。
              <br className="hidden md:block" />
              每天 5 分钟，掌握影响你持仓的关键信号。
            </p>

            <div className="flex items-center justify-center gap-6 text-sm text-muted-foreground">
              <span className="flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                500+ 美股标的
              </span>
              <span className="flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                4 大数据源
              </span>
              <span className="flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                每日更新
              </span>
            </div>
          </div>
        </section>

        {/* Pain -> Solution */}
        <section className="border-b border-border/50">
          <div className="max-w-3xl mx-auto px-4 md:px-6 py-12">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {[
                {
                  pain: '信息过载',
                  solution: 'AI 帮你筛选',
                  desc: '从数百条新闻中提炼与你持仓相关的关键信息',
                },
                {
                  pain: '分析耗时',
                  solution: '一键生成报告',
                  desc: '个股基本面、技术面、风险评估自动完成',
                },
                {
                  pain: '信号遗漏',
                  solution: '实时追踪提醒',
                  desc: '宏观指标、流动性变化、板块轮动持续监控',
                },
              ].map((item) => (
                <div key={item.pain} className="terminal-card p-5">
                  <div className="text-sm text-muted-foreground mb-1 line-through decoration-red-400/50">{item.pain}</div>
                  <div className="text-sm font-medium text-emerald-400 mb-3">{item.solution}</div>
                  <p className="text-xs text-muted-foreground leading-relaxed">{item.desc}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Feature Comparison */}
        <section className="border-b border-border/50">
          <div className="max-w-3xl mx-auto px-4 md:px-6 py-12">
            <h2 className="text-xl font-editorial text-foreground text-center mb-8">Free vs Pro</h2>

            {/* Desktop table */}
            <div className="hidden md:block terminal-card overflow-hidden">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-border/50">
                    <th className="text-left text-sm font-medium text-muted-foreground p-4">功能</th>
                    <th className="text-center text-sm font-medium text-muted-foreground p-4 w-24">Free</th>
                    <th className="text-center text-sm font-medium text-emerald-400 p-4 w-24 bg-emerald-500/5">Pro</th>
                  </tr>
                </thead>
                <tbody>
                  {FEATURES.map((f, i) => (
                    <tr key={i} className="border-b border-border/30 last:border-0">
                      <td className="p-4">
                        <div className="text-sm text-foreground font-medium">{f.title}</div>
                        <div className="text-xs text-muted-foreground mt-0.5">{f.desc}</div>
                      </td>
                      <td className="text-center p-4 w-24">
                        {f.free ? (
                          <svg className="w-5 h-5 text-emerald-400 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                          </svg>
                        ) : (
                          <svg className="w-5 h-5 text-zinc-600 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                          </svg>
                        )}
                      </td>
                      <td className="text-center p-4 w-24 bg-emerald-500/5">
                        <svg className="w-5 h-5 text-emerald-400 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                        </svg>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Mobile stacked cards */}
            <div className="md:hidden space-y-3">
              {FEATURES.map((f, i) => (
                <div key={i} className="terminal-card p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="text-sm text-foreground font-medium">{f.title}</div>
                      <div className="text-xs text-muted-foreground mt-0.5">{f.desc}</div>
                    </div>
                    <div className="flex items-center gap-3 shrink-0 pt-0.5">
                      <div className="text-center">
                        <div className="text-[10px] text-muted-foreground mb-1">Free</div>
                        {f.free ? (
                          <svg className="w-4 h-4 text-emerald-400 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                          </svg>
                        ) : (
                          <svg className="w-4 h-4 text-zinc-600 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                          </svg>
                        )}
                      </div>
                      <div className="text-center">
                        <div className="text-[10px] text-emerald-400 mb-1">Pro</div>
                        <svg className="w-4 h-4 text-emerald-400 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                        </svg>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Pricing Card */}
        <section className="border-b border-border/50">
          <div className="max-w-md mx-auto px-4 md:px-6 py-12">
            <div className="terminal-card p-8 relative overflow-hidden">
              {/* Glow border effect */}
              <div className="absolute inset-0 rounded-lg border border-emerald-500/30 pointer-events-none" />
              <div className="absolute -top-20 left-1/2 -translate-x-1/2 w-40 h-40 bg-emerald-500/10 rounded-full blur-3xl pointer-events-none" />

              <div className="relative">
                {/* Plan name */}
                <div className="text-center mb-6">
                  <span className="inline-block px-3 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs font-medium tracking-wider uppercase mb-4">
                    Pro
                  </span>

                  {/* Price */}
                  <div className="flex items-baseline justify-center gap-1 mb-2">
                    <span className="text-4xl font-bold font-data text-foreground">$9.99</span>
                    <span className="text-muted-foreground text-sm">/ 月</span>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    每天不到 <span className="text-emerald-400 font-data">$0.33</span> &mdash; 一杯咖啡的零头
                  </p>
                </div>

                {/* Feature list */}
                <div className="space-y-3 mb-8 pt-6 border-t border-border/30">
                  {FEATURES.filter((f) => f.pro).map((f, i) => (
                    <div key={i} className="flex items-start gap-2.5">
                      <svg className="w-4 h-4 text-emerald-400 mt-0.5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                      </svg>
                      <span className="text-sm text-foreground">{f.title}</span>
                    </div>
                  ))}
                </div>

                {/* CTA */}
                <button
                  onClick={handleCtaClick}
                  disabled={isCheckoutLoading}
                  className="w-full px-6 py-3.5 bg-emerald-600 text-white rounded-lg font-medium text-sm transition-all hover:bg-emerald-500 hover:shadow-lg hover:shadow-emerald-500/20 disabled:opacity-70 disabled:cursor-wait flex items-center justify-center gap-2"
                >
                  {isCheckoutLoading ? (
                    <>
                      <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                      </svg>
                      <span>Redirecting to Stripe...</span>
                    </>
                  ) : needsLogin ? (
                    <>
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M11 16l-4-4m0 0l4-4m-4 4h14m-5 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h7a3 3 0 013 3v1" />
                      </svg>
                      <span>Sign In to Subscribe</span>
                    </>
                  ) : (
                    <span>Subscribe to Pro</span>
                  )}
                </button>

                {/* Error message */}
                {checkoutError && (
                  <p className="mt-3 text-xs text-red-400 text-center">{checkoutError}</p>
                )}

                {/* Manage existing */}
                {!needsLogin && status === 'canceled' && (
                  <button
                    onClick={openBillingPortal}
                    className="w-full mt-2 text-xs text-muted-foreground hover:text-emerald-400 transition-colors py-2"
                  >
                    Manage existing subscription
                  </button>
                )}

                {/* Trust signals */}
                <div className="flex items-center justify-center gap-4 mt-6 pt-4 border-t border-border/30">
                  <span className="text-[11px] text-muted-foreground flex items-center gap-1">
                    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                    </svg>
                    Stripe Security
                  </span>
                  <span className="text-border">|</span>
                  <span className="text-[11px] text-muted-foreground">Cancel Anytime</span>
                </div>
              </div>
            </div>

            {/* Value anchoring */}
            <p className="text-xs text-muted-foreground text-center mt-4 leading-relaxed">
              Research Terminal + AI Analysis: $30+/mo elsewhere
            </p>
          </div>
        </section>

        {/* FAQ */}
        <section>
          <div className="max-w-2xl mx-auto px-4 md:px-6 py-12">
            <h2 className="text-xl font-editorial text-foreground text-center mb-8">FAQ</h2>
            <div className="space-y-2">
              {FAQS.map((faq, i) => (
                <div key={i} className="terminal-card overflow-hidden">
                  <button
                    onClick={() => setOpenFaq(openFaq === i ? null : i)}
                    className="w-full flex items-center justify-between p-4 text-left"
                  >
                    <span className="text-sm font-medium text-foreground">{faq.q}</span>
                    <svg
                      className={`w-4 h-4 text-muted-foreground transition-transform shrink-0 ml-4 ${openFaq === i ? 'rotate-180' : ''}`}
                      fill="none" stroke="currentColor" viewBox="0 0 24 24"
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                  </button>
                  {openFaq === i && (
                    <div className="px-4 pb-4">
                      <p className="text-sm text-muted-foreground leading-relaxed">{faq.a}</p>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Bottom CTA */}
        <section className="border-t border-border/50">
          <div className="max-w-2xl mx-auto px-4 md:px-6 py-12 text-center">
            <p className="text-lg font-editorial text-foreground mb-4">
              Ready to upgrade your research?
            </p>
            <button
              onClick={handleCtaClick}
              disabled={isCheckoutLoading}
              className="px-8 py-3 bg-emerald-600 text-white rounded-lg font-medium text-sm transition-all hover:bg-emerald-500 hover:shadow-lg hover:shadow-emerald-500/20 disabled:opacity-70 disabled:cursor-wait"
            >
              {isCheckoutLoading
                ? 'Redirecting...'
                : needsLogin
                  ? 'Sign In to Subscribe'
                  : 'Subscribe to Pro - $9.99/mo'}
            </button>
            {checkoutError && (
              <p className="mt-3 text-xs text-red-400">{checkoutError}</p>
            )}
          </div>
        </section>
      </main>
    );
  }

  return <>{children}</>;
}
