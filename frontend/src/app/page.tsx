"use client";

import Link from "next/link";
import Image from "next/image";
import SubscribeForm from "@/components/SubscribeForm";
import FeatureSections from "@/components/FeatureSections";
import { PRICING } from "@/lib/pricing";
import { useAuth } from "@/contexts/AuthContext";

export default function Home() {
  const { isAuthenticated, isLoading } = useAuth();
  return (
    <main className="min-h-screen bg-background">
      {/* Hero Section — belief-led editorial: text-first, single CTA, no photo/form */}
      <section className="relative overflow-hidden min-h-screen md:h-screen -mt-16 flex items-center justify-center bg-background">
        {/* Hero atmosphere — the one allowed signature gradient (no photo).
            Warm near-black gains color depth: an emerald glow top-left, a warm
            amber glow bottom-right, and a faint warm lift up top. */}
        <div
          aria-hidden
          className="absolute inset-0 pointer-events-none"
          style={{
            background:
              'radial-gradient(ellipse 60% 50% at 22% 12%, rgba(16,185,129,0.18), transparent 62%), radial-gradient(ellipse 55% 50% at 84% 82%, rgba(232,170,96,0.10), transparent 62%)',
          }}
        />

        <div className="relative w-full max-w-3xl mx-auto px-4 md:px-6 text-center pt-24 pb-16 md:py-20">
          {/* Eyebrow */}
          <div className="animate-fade-in-up flex items-center justify-center gap-3 mb-7">
            <div className="h-px w-8 bg-primary/60 animate-line-expand" />
            <span className="font-data text-primary text-xs tracking-[0.3em] uppercase">
              美股 AI 投研平台
            </span>
          </div>

          {/* Main Headline — oversized editorial (copy unchanged) */}
          <h1 className="animate-fade-in-up delay-100 font-editorial text-5xl md:text-6xl lg:text-7xl text-foreground leading-[1.05] tracking-tight mb-7">
            你的 AI <span className="text-primary">投研团队</span>
          </h1>

          {/* Subtitle (copy unchanged) */}
          <p className="animate-fade-in-up delay-200 text-base md:text-lg text-muted-foreground max-w-xl mx-auto leading-relaxed mb-9">
            从日报到个股、从持仓到宏观 -- 一个平台，覆盖你的全部投研需求。
          </p>

          {/* Quiet value row (labels unchanged) */}
          <div className="animate-fade-in-up delay-300 flex flex-wrap items-center justify-center gap-x-5 gap-y-2 mb-10 text-sm text-muted-foreground">
            {["四份日报", "AI 个股研究", "AI 投研助手", "宏观仪表盘"].map((item) => (
              <span key={item} className="inline-flex items-center gap-1.5">
                <svg className="w-3.5 h-3.5 text-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
                {item}
              </span>
            ))}
          </div>

          {/* Single primary CTA — segmented for returning users */}
          <div className="animate-fade-in-up delay-400 flex flex-col items-center gap-4">
            <Link
              href="/research"
              aria-busy={isLoading}
              className="inline-flex items-center gap-2 px-7 py-3.5 bg-primary text-primary-foreground rounded-lg text-sm font-medium transition-all hover:bg-primary/90 active:scale-[0.98] cursor-pointer"
            >
              {isAuthenticated ? "进入工作台" : "免费开始"}
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </Link>
            <p className="text-xs text-muted-foreground/70">
              无需信用卡 · 每日市场日报 + 宏观仪表盘永久免费
            </p>
          </div>
        </div>
      </section>

      {/* Email subscribe — downgraded from the hero to a quiet inline band */}
      <section className="relative border-b border-border/40 bg-card/20">
        <div className="max-w-2xl mx-auto px-4 md:px-6 py-6 flex flex-col gap-3 sm:flex-row sm:items-center">
          <p className="shrink-0 text-sm text-muted-foreground">
            订阅每日日报 · 收盘后送达
          </p>
          <SubscribeForm variant="inline" className="flex-1" />
        </div>
      </section>

      {/* Three Feature Sections: Stock Research / AI Research / Macro Dashboard */}
      <FeatureSections />

      {/* Social Proof Section */}
      <section className="relative py-16 md:py-20 overflow-hidden">
        <div className="relative max-w-5xl mx-auto px-4 md:px-6">
          <div className="flex items-center justify-center gap-3 mb-10">
            <div className="h-px flex-1 max-w-[60px] bg-gradient-to-r from-primary to-transparent" />
            <span className="text-primary text-xs font-semibold tracking-[0.25em] uppercase">
              Testimonials
            </span>
            <div className="h-px flex-1 max-w-[60px] bg-gradient-to-l from-primary to-transparent" />
          </div>

          <div className="grid md:grid-cols-3 gap-6">
            {[
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
            ].map((t, i) => (
              <div key={i} className="rounded-xl border border-border/30 bg-card/50 p-6 hover:border-border/60 transition-colors">
                <div className="flex items-center gap-1 mb-4">
                  {[...Array(5)].map((_, j) => (
                    <svg key={j} className="w-4 h-4 text-amber-400" fill="currentColor" viewBox="0 0 20 20">
                      <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                    </svg>
                  ))}
                </div>
                <p className="text-sm text-foreground leading-relaxed mb-4">&ldquo;{t.quote}&rdquo;</p>
                <p className="text-xs text-muted-foreground">{t.role}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Pricing Section */}
      <section className="relative py-16 md:py-24 overflow-hidden">
        <div className="absolute inset-0 bg-[linear-gradient(rgba(16,185,129,0.02)_1px,transparent_1px),linear-gradient(90deg,rgba(16,185,129,0.02)_1px,transparent_1px)] bg-[size:60px_60px]" />
        <div className="relative max-w-5xl mx-auto px-4 md:px-6">
          {/* Section Header */}
          <div className="text-center mb-12 md:mb-16">
            <div className="flex items-center justify-center gap-3 mb-6">
              <div className="h-px flex-1 max-w-[60px] bg-gradient-to-r from-primary to-transparent" />
              <span className="text-primary text-xs font-semibold tracking-[0.25em] uppercase">
                Pricing
              </span>
              <div className="h-px flex-1 max-w-[60px] bg-gradient-to-l from-primary to-transparent" />
            </div>
            <h2 className="font-editorial text-3xl md:text-5xl text-foreground tracking-tight mb-4">
              选择适合你的方案
            </h2>
            <p className="text-muted-foreground text-sm md:text-base max-w-md mx-auto">
              从免费日报到 AI 全栈投研，按需升级
            </p>
          </div>

          {/* Three Column Pricing */}
          <div className="grid md:grid-cols-3 gap-4 md:gap-5 max-w-5xl mx-auto mb-10">
            {/* Free */}
            <div className="rounded-xl border border-border/40 bg-card/30 p-6 hover:border-border/60 transition-all">
              <h3 className="text-lg font-semibold text-foreground mb-1">免费版</h3>
              <p className="text-xs text-muted-foreground mb-4">基础市场资讯</p>
              <div className="text-2xl font-data font-bold text-foreground mb-5">$0<span className="text-sm text-muted-foreground font-normal ml-1">/月</span></div>
              <div className="space-y-3 mb-6">
                {[
                  { ok: true, text: '盘后总览（网站阅读）' },
                  { ok: true, text: '宏观仪表盘' },
                  { ok: false, text: '盘前情报 + 专属日报（Pro+）' },
                  { ok: false, text: '推特简报（Max 专属）' },
                  { ok: false, text: 'AI 深度个股分析' },
                ].map((item) => (
                  <div key={item.text} className="flex items-center gap-2.5">
                    {item.ok ? (
                      <svg className="w-4 h-4 text-primary shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
                    ) : (
                      <svg className="w-4 h-4 text-muted-foreground/70 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                    )}
                    <span className={`text-sm ${item.ok ? 'text-foreground' : 'text-muted-foreground/70'}`}>{item.text}</span>
                  </div>
                ))}
              </div>
              <Link
                href="/today"
                className="block w-full px-4 py-3 bg-muted/50 text-foreground rounded-lg text-sm font-semibold text-center transition-all hover:bg-muted/70 active:scale-[0.98] border border-border/50"
              >
                免费开始
              </Link>
            </div>

            {/* Pro */}
            <div className="rounded-xl border border-border/40 bg-card/30 p-6 hover:border-border/60 transition-all">
              <div className="flex items-center gap-2 mb-1">
                <h3 className="text-lg font-semibold text-foreground">Pro</h3>
              </div>
              <p className="text-xs text-muted-foreground mb-4">邮件推送 + 持仓分析</p>
              <div className="flex items-baseline gap-2 mb-5">
                <span className="text-2xl font-data font-bold text-foreground">{PRICING.pro}</span>
                <span className="text-sm text-muted-foreground">{PRICING.interval}</span>
                <span className="text-sm text-muted-foreground/70 line-through font-data">{PRICING.proOriginal}</span>
              </div>
              <div className="space-y-3 mb-6">
                {[
                  { ok: true, text: '盘前情报 + 盘后总览（邮件推送）' },
                  { ok: true, text: '专属日报 · 基于你的持仓' },
                  { ok: true, text: '宏观周报（邮件推送）' },
                  { ok: true, text: '宏观仪表盘' },
                  { ok: true, text: '自选股管理' },
                  { ok: false, text: '推特简报（Max 专属）' },
                  { ok: false, text: 'AI 投研引擎（无限使用）' },
                  { ok: false, text: 'AI 深度个股分析' },
                ].map((item) => (
                  <div key={item.text} className="flex items-center gap-2.5">
                    {item.ok ? (
                      <svg className="w-4 h-4 text-primary shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
                    ) : (
                      <svg className="w-4 h-4 text-muted-foreground/70 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                    )}
                    <span className={`text-sm ${item.ok ? 'text-foreground' : 'text-muted-foreground/70'}`}>{item.text}</span>
                  </div>
                ))}
              </div>
              <Link
                href="/pricing"
                className="block w-full px-4 py-3 bg-card text-foreground rounded-lg text-sm font-semibold text-center transition-all hover:border-primary/30 active:scale-[0.98] border border-border/50"
              >
                立即订阅
              </Link>
              <p className="text-xs text-muted-foreground/70 text-center mt-2.5">随时取消 · Stripe 安全支付</p>
            </div>

            {/* Max - 推荐 */}
            <div className="relative rounded-xl border border-primary/30 bg-card/50 p-6 ring-1 ring-primary/10">
              <div className="relative">
                <div className="flex items-center gap-2 mb-1">
                  <h3 className="text-lg font-semibold text-foreground">Max</h3>
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-primary/10 border border-primary/20">
                    <span className="text-xs font-medium text-primary">推荐</span>
                  </span>
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-amber-500/10 border border-amber-500/20">
                    <span className="w-1.5 h-1.5 rounded-full bg-amber-400 light:bg-amber-600" />
                    <span className="text-xs font-medium text-amber-400 light:text-amber-600">抢先体验价</span>
                  </span>
                </div>
                <p className="text-xs text-muted-foreground mb-4">全部功能解锁</p>
                <div className="flex items-baseline gap-2 mb-5">
                  <span className="text-2xl font-data font-bold text-foreground">{PRICING.max}</span>
                  <span className="text-sm text-muted-foreground">{PRICING.interval}</span>
                  <span className="text-sm text-muted-foreground/70 line-through font-data">{PRICING.maxOriginal}</span>
                  <span className="text-xs font-medium text-primary">{PRICING.maxDiscount}</span>
                </div>
                <div className="space-y-3 mb-6">
                  {[
                    'Pro 的所有功能',
                    '推特简报 · 300+ 美股博主高质量观点聚合',
                    'AI 投研引擎 · 无限对话与选股',
                    'AI 深度个股分析 · 无限使用',
                    '优先支持与新功能抢先体验',
                  ].map((text) => (
                    <div key={text} className="flex items-center gap-2.5">
                      <svg className="w-4 h-4 text-primary shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
                      <span className="text-sm text-foreground">{text}</span>
                    </div>
                  ))}
                </div>
                <Link
                  href="/pricing"
                  className="block w-full px-4 py-3 bg-primary text-primary-foreground rounded-lg text-sm font-semibold text-center transition-all hover:bg-primary/90 active:scale-[0.98]"
                >
                  立即订阅
                </Link>
                <p className="text-xs text-muted-foreground/70 text-center mt-2.5">随时取消 · Stripe 安全支付</p>
              </div>
            </div>
          </div>

          {/* Social proof bar */}
          <div className="flex items-center justify-center gap-6 text-xs text-muted-foreground">
            <span>34 位用户正在使用</span>
            <span className="w-1 h-1 rounded-full bg-border" />
            <span>前 {PRICING.earlyAccessTotal} 名抢先体验</span>
            <span className="w-1 h-1 rounded-full bg-border" />
            <span>
              <Link href="/pricing" className="text-primary hover:text-primary/80 transition-colors py-2 inline-flex items-center min-h-[44px]">
                查看完整定价 →
              </Link>
            </span>
          </div>
        </div>
      </section>

      {/* About Us Section */}
      <section className="relative py-16 md:py-24 overflow-hidden">
        <div className="absolute inset-0 bg-muted/20" />
        <div className="relative max-w-6xl mx-auto px-4 md:px-6">
          <div className="max-w-3xl mx-auto">
            {/* Section Label */}
            <div className="flex items-center gap-3 mb-8">
              <div className="h-px flex-1 max-w-[60px] bg-gradient-to-r from-primary to-transparent" />
              <span className="text-primary text-xs font-semibold tracking-[0.25em] uppercase">
                Our Story
              </span>
            </div>

            <div className="grid md:grid-cols-[1fr,2fr] gap-10 md:gap-14 items-start">
              {/* Left - Founder */}
              <div>
                <Image
                  src="/founder-avatar.jpeg"
                  alt="Golden"
                  width={80}
                  height={80}
                  className="w-20 h-20 rounded-2xl border border-primary/20 object-cover mb-4"
                />
                <p className="text-sm text-muted-foreground">
                  独立开发者 / 美股投资者
                </p>
                <p className="text-xs text-amber-400 mt-1.5">@Golden / 金黄</p>
              </div>

              {/* Right - Story */}
              <div className="space-y-5">
                <h2 className="font-editorial text-2xl md:text-3xl text-foreground leading-snug">
                  我们的故事
                </h2>
                <div className="space-y-4 text-muted-foreground leading-relaxed">
                  <p>
                    我是一个在硅谷大厂的全职程序员，投资美股十多年。和大多数散户一样，我也曾每天盯着盘面上数字的涨跌，搞得心情跟着K线走。涨的时候不知道为什么涨，跌的时候更不知道该不该跑。市场上有太多噪音，太多情绪，唯独缺少一个能帮我快速看清真相的工具。
                  </p>
                  <p>
                    所以我给自己做了 TheMarketBrew。从一份简单的 AI 日报开始，逐渐发展成了一个完整的投研平台——每日简报、盘前早报、个股深度分析、宏观仪表盘、AI 投研助手。让 AI 替我从噪音中提炼逻辑，解放时间和精力。
                  </p>
                  <p>
                    这个产品帮助了我更好的调整了投资心态，毕竟我们投资都是为了更好的生活。因此我希望也可以帮助到你。
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Final CTA - Compact */}
      <section className="relative py-16 md:py-20 overflow-hidden">
        <div className="relative max-w-3xl mx-auto px-4 md:px-6 text-center">
          <h2 className="font-editorial text-2xl md:text-3xl text-foreground mb-3">
            从今天开始，清醒地交易
          </h2>
          <p className="text-muted-foreground text-sm mb-8 max-w-md mx-auto">
            免费订阅日报，或直接体验 AI 投研工具。
          </p>
          <div className="flex flex-wrap items-center justify-center gap-3">
            <Link
              href="/login"
              className="inline-flex items-center gap-2 px-6 py-3 bg-primary text-primary-foreground rounded-lg text-sm font-medium transition-all hover:bg-primary/90 active:scale-[0.98] cursor-pointer"
            >
              免费订阅日报
            </Link>
            <Link
              href="/stock"
              className="px-5 py-3 rounded-lg border border-border/60 text-sm text-foreground hover:border-primary/30 transition-colors min-h-[44px] flex items-center cursor-pointer"
            >
              个股研究
            </Link>
            <Link
              href="/research"
              className="px-5 py-3 rounded-lg border border-border/60 text-sm text-foreground hover:border-primary/30 transition-colors min-h-[44px] flex items-center cursor-pointer"
            >
              AI 投研助手
            </Link>
            <Link
              href="/macro"
              className="px-5 py-3 rounded-lg border border-border/60 text-sm text-foreground hover:border-primary/30 transition-colors min-h-[44px] flex items-center cursor-pointer"
            >
              宏观仪表盘
            </Link>
          </div>
        </div>
      </section>
    </main>
  );
}
