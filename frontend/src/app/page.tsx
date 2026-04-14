"use client";

import Link from "next/link";
import Image from "next/image";
import SubscribeForm from "@/components/SubscribeForm";
import LogoMarquee from "@/components/LogoMarquee";
import ProductShowcase from "@/components/ProductShowcase";
import { PRICING } from "@/lib/pricing";

export default function Home() {
  return (
    <main className="min-h-screen bg-background">
      {/* Hero Section - with embedded subscribe form */}
      <section className="relative overflow-hidden min-h-screen md:h-screen -mt-16 flex flex-col hero-dark">
        {/* Hero Background Image */}
        <Image
          src="/hero-bg.jpeg"
          alt=""
          fill
          priority
          className="object-cover object-[30%_20%] pointer-events-none"
        />
        {/* Base overlay - subtle emerald tint, lighter to let image details show */}
        <div className="absolute inset-0 bg-[#0a1a14]/35 pointer-events-none" />
        {/* Left side gradient for text readability */}
        <div className="absolute inset-0 bg-gradient-to-r from-[#050a08]/50 via-transparent to-transparent pointer-events-none" />
        {/* Vignette - darker edges, lighter center for depth */}
        <div
          className="absolute inset-0 pointer-events-none"
          style={{ background: 'radial-gradient(ellipse at 30% 40%, transparent 20%, rgba(5,5,6,0.55) 100%)' }}
        />
        {/* Bottom fade for smooth transition to page content */}
        <div className="absolute bottom-0 left-0 right-0 h-32 md:h-48 bg-gradient-to-b from-transparent via-[#050506]/70 to-[#050506] pointer-events-none" />

        <div className="relative flex-1 flex items-start md:items-center max-w-6xl mx-auto w-full px-4 md:px-6 pt-24 pb-32 md:pt-20 md:pb-24">
          <div className="grid md:grid-cols-2 gap-8 md:gap-12 lg:gap-16 items-center">
            {/* Left - Content */}
            <div>
              {/* Product Positioning Tag */}
              <div className="animate-fade-in-up flex items-center gap-3 mb-6">
                <div className="h-px flex-1 max-w-[60px] bg-gradient-to-r from-primary to-transparent animate-line-expand" />
                <span className="text-primary text-xs font-semibold tracking-[0.25em] uppercase">
                  美股 AI 投研平台
                </span>
              </div>

              {/* Main Headline - Clear Value Proposition */}
              <h1 className="animate-fade-in-up delay-100 font-editorial text-3xl md:text-5xl lg:text-6xl text-foreground leading-[1.05] mb-5">
                每天 5 分钟
                <br />
                <span className="text-gradient-emerald">掌握美股全局</span>
              </h1>

              {/* Subtitle - Specific Value */}
              <p className="animate-fade-in-up delay-200 text-base md:text-lg text-muted-foreground max-w-md leading-relaxed mb-6">
                AI 从海量信息中提炼你需要知道的一切——市场动态、持仓分析、宏观趋势。免费订阅，收盘后直达邮箱。
              </p>

              {/* Quick Value Points */}
              <div className="animate-fade-in-up delay-300 flex flex-wrap gap-4 mb-6">
                {["免费邮件日报", "持仓专属监控", "个股深度分析", "宏观仪表盘"].map((item, i) => (
                  <div
                    key={i}
                    className="flex items-center gap-1.5 text-sm text-muted-foreground"
                  >
                    <svg
                      className="w-4 h-4 text-primary"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M5 13l4 4L19 7"
                      />
                    </svg>
                    {item}
                  </div>
                ))}
              </div>

              {/* Trust Badges - User Count */}
              <div className="animate-fade-in-up delay-400 flex items-center gap-2">
                <div className="flex -space-x-1.5">
                  {[...Array(3)].map((_, i) => (
                    <div
                      key={i}
                      className="w-5 h-5 rounded-full bg-gradient-to-br from-primary/30 to-primary/10 border-2 border-background flex items-center justify-center"
                    >
                      <span className="text-micro text-primary/70 font-medium">
                        {["K", "J", "M"][i]}
                      </span>
                    </div>
                  ))}
                </div>
                <span className="text-xs text-muted-foreground">
                  已为 <span className="text-foreground font-medium">100+</span>{" "}
                  投资者提供服务
                </span>
              </div>

              {/* CTAs */}
              <div className="animate-fade-in-up delay-500 mt-6 flex flex-col items-start gap-3">
                <div className="flex flex-wrap items-center gap-3">
                  <Link
                    href="/login"
                    className="inline-flex items-center gap-2 px-5 py-3 bg-primary text-primary-foreground rounded-lg text-sm font-medium transition-all hover:bg-primary/90 active:scale-[0.98]"
                  >
                    免费体验 14 天
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                    </svg>
                  </Link>
                  <Link
                    href="/today"
                    className="inline-flex items-center gap-2 px-5 py-3 rounded-lg text-sm font-medium border border-border/60 text-muted-foreground hover:text-foreground hover:border-border transition-all min-h-[44px]"
                  >
                    先看今天的市场
                  </Link>
                </div>
                <p className="text-xs text-muted-foreground/70">
                  无需信用卡 · 14 天后自动结束
                </p>
              </div>
            </div>

            {/* Right - Subscribe Form */}
            <div className="animate-fade-in-up delay-300">
              <SubscribeForm variant="card" />
            </div>
          </div>
        </div>

        {/* Logo Marquee - Data Sources (absolute bottom) */}
        <div className="absolute bottom-0 left-0 right-0 z-10 py-3 bg-muted/20">
          <div className="max-w-6xl mx-auto px-4 md:px-6">
            <div className="flex items-center justify-center gap-6 mb-1.5">
              <div className="h-px flex-1 max-w-[100px] bg-gradient-to-r from-transparent to-border/50" />
              <span className="text-micro text-muted-foreground/70 uppercase tracking-[0.2em]">
                Data Sources
              </span>
              <div className="h-px flex-1 max-w-[100px] bg-gradient-to-l from-transparent to-border/50" />
            </div>
          </div>
          <LogoMarquee speed="slow" />
        </div>
      </section>

      {/* Hero-to-content transition bridge */}
      <div className="relative h-20 -mt-1 bg-gradient-to-b from-[#050506] to-background pointer-events-none" />

      {/* Product Showcase Section */}
      <section className="relative py-16 md:py-24 overflow-hidden">
        <div className="absolute inset-0 bg-[linear-gradient(rgba(16,185,129,0.03)_1px,transparent_1px),linear-gradient(90deg,rgba(16,185,129,0.03)_1px,transparent_1px)] bg-[size:60px_60px]" />
        <div className="relative max-w-6xl mx-auto px-4 md:px-6">
          <ProductShowcase />
        </div>
      </section>

      {/* Core Capabilities Section - Simplified */}
      <section className="relative py-16 md:py-24 overflow-hidden">
        {/* Subtle grid background */}
        <div className="absolute inset-0 bg-[linear-gradient(rgba(16,185,129,0.03)_1px,transparent_1px),linear-gradient(90deg,rgba(16,185,129,0.03)_1px,transparent_1px)] bg-[size:60px_60px]" />

        <div className="relative max-w-6xl mx-auto px-4 md:px-6">
          {/* Section Header - Editorial Style */}
          <div className="mb-12 md:mb-16 animate-fade-in-up">
            <div className="flex items-center gap-3 mb-6">
              <div className="h-px flex-1 max-w-[60px] bg-gradient-to-r from-primary to-transparent" />
              <span className="text-primary text-xs font-semibold tracking-[0.25em] uppercase">
                Features
              </span>
            </div>
            <h2 className="font-editorial text-4xl md:text-5xl lg:text-6xl text-foreground leading-[1.1]">
              六大核心功能
            </h2>
          </div>

          {/* 6 Features: 3x2 Grid Layout */}
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            {/* Feature 1: Daily Report */}
            <Link href="/today" className="group block h-full cursor-pointer animate-fade-in-up delay-100">
              <div className="relative rounded-xl border border-border/30 bg-card overflow-hidden hover-glow h-full">
                <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-primary/40 to-transparent" />
                <div className="p-7 flex flex-col h-full">
                  <p className="text-xs font-medium tracking-[0.15em] uppercase text-primary/80 mb-4">
                    核心功能 / 每日简报
                  </p>

                  {/* Big Number */}
                  <div className="mb-3">
                    <span className="font-data text-5xl font-light text-primary">5</span>
                    <span className="text-base text-muted-foreground ml-2">min</span>
                  </div>

                  <h3 className="font-editorial text-xl text-foreground mb-3">每日市场简报</h3>
                  <p className="text-sm text-muted-foreground leading-relaxed mb-6 flex-grow">
                    AI 从海量信息中提炼当日要点和重要新闻，5 分钟掌握市场全貌。
                  </p>

                  {/* CTA */}
                  <div className="flex items-center justify-between p-3 rounded-lg bg-muted/30 border border-border/50 mt-auto group-hover:border-primary/25 transition-colors">
                    <span className="text-xs text-muted-foreground">查看今日日报</span>
                    <svg className="w-4 h-4 text-primary/60 transition-transform group-hover:translate-x-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                    </svg>
                  </div>
                </div>
              </div>
            </Link>

            {/* Feature 2: Morning Report */}
            <Link href="/morning" className="group block h-full cursor-pointer animate-fade-in-up delay-150">
              <div className="relative rounded-xl border border-border/30 bg-card overflow-hidden hover-glow h-full">
                <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-amber-400/40 to-transparent" />
                <div className="p-7 flex flex-col h-full">
                  <p className="text-xs font-medium tracking-[0.15em] uppercase text-amber-400/80 mb-4">
                    盘前准备 / 每日早报
                  </p>

                  {/* Big Number */}
                  <div className="mb-3">
                    <span className="font-data text-5xl font-light text-amber-400">10</span>
                    <span className="text-base text-muted-foreground ml-2">min</span>
                  </div>

                  <h3 className="font-editorial text-xl text-foreground mb-3">盘前早报</h3>
                  <p className="text-sm text-muted-foreground leading-relaxed mb-6 flex-grow">
                    每个交易日开盘前发布。期货走势、全球市场、隔夜要闻，帮你用 10 分钟做好今天的交易准备。
                  </p>

                  {/* CTA */}
                  <div className="flex items-center justify-between p-3 rounded-lg bg-muted/30 border border-border/50 mt-auto group-hover:border-amber-400/25 transition-colors">
                    <span className="text-xs text-muted-foreground">查看今日早报</span>
                    <svg className="w-4 h-4 text-amber-400/60 transition-transform group-hover:translate-x-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                    </svg>
                  </div>
                </div>
              </div>
            </Link>

            {/* Feature 3: Personalization */}
            <Link href="/for-you" className="group block h-full cursor-pointer animate-fade-in-up delay-200">
              <div className="relative rounded-xl border border-border/30 bg-card overflow-hidden hover-glow h-full">
                <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-primary/40 to-transparent" />
                <div className="p-7 flex flex-col h-full">
                  <p className="text-xs font-medium tracking-[0.15em] uppercase text-primary/80 mb-4">
                    专属定制 / 你的持仓
                  </p>

                  {/* Big Number */}
                  <div className="mb-3">
                    <span className="font-data text-5xl font-light text-primary">100</span>
                    <span className="font-data text-3xl text-primary/50">%</span>
                    <span className="text-base text-muted-foreground ml-2">与你相关</span>
                  </div>

                  <h3 className="font-editorial text-xl text-foreground mb-3">只看你关心的</h3>
                  <p className="text-sm text-muted-foreground leading-relaxed mb-6 flex-grow">
                    添加你的持仓清单，获得只针对你关心股票的分析。不是泛泛而谈，而是「这条新闻对你的 $AAPL 意味着什么」。
                  </p>

                  {/* CTA */}
                  <div className="flex items-center justify-between p-3 rounded-lg bg-muted/30 border border-border/50 mt-auto group-hover:border-primary/25 transition-colors">
                    <div className="flex items-center gap-2">
                      <div className="flex -space-x-1">
                        {["AAPL", "NVDA", "MSFT"].map((ticker) => (
                          <div key={ticker} className="w-6 h-6 rounded-full bg-primary/15 border-2 border-card flex items-center justify-center">
                            <span className="text-micro font-data text-primary/80">{ticker[0]}</span>
                          </div>
                        ))}
                      </div>
                      <span className="text-xs text-muted-foreground">创建关注列表</span>
                    </div>
                    <svg className="w-4 h-4 text-primary/60 transition-transform group-hover:translate-x-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                    </svg>
                  </div>
                </div>
              </div>
            </Link>

            {/* Feature 4: Stock Research */}
            <Link href="/stock" className="group block h-full cursor-pointer animate-fade-in-up delay-300">
              <div className="relative rounded-xl border border-border/30 bg-card overflow-hidden hover-glow h-full">
                <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-primary/40 to-transparent" />
                <div className="p-7 flex flex-col h-full">
                  <p className="text-xs font-medium tracking-[0.15em] uppercase text-primary/80 mb-4">
                    深度研究 / 个股透视
                  </p>

                  {/* Big Number */}
                  <div className="mb-3">
                    <span className="font-data text-5xl font-light text-primary">1</span>
                    <span className="text-xl text-muted-foreground ml-2">页看透</span>
                  </div>

                  <h3 className="font-editorial text-xl text-foreground mb-3">一站式股票分析</h3>
                  <p className="text-sm text-muted-foreground leading-relaxed mb-6 flex-grow">
                    基本面、技术面、新闻面、AI 分析——所有你做决策需要的信息，整合在一个清晰的页面里。
                  </p>

                  {/* CTA */}
                  <div className="flex items-center justify-between p-3 rounded-lg bg-muted/30 border border-border/50 mt-auto group-hover:border-primary/25 transition-colors">
                    <span className="text-xs text-muted-foreground">搜索任意美股</span>
                    <svg className="w-4 h-4 text-primary/60 transition-transform group-hover:translate-x-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                    </svg>
                  </div>
                </div>
              </div>
            </Link>

            {/* Feature 5: AI Research Assistant */}
            <Link href="/research" className="group block h-full cursor-pointer animate-fade-in-up delay-400">
              <div className="relative rounded-xl border border-border/30 bg-card overflow-hidden hover-glow h-full">
                <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-primary/40 to-transparent" />
                <div className="p-7 flex flex-col h-full">
                  <p className="text-xs font-medium tracking-[0.15em] uppercase text-primary/80 mb-4">
                    AI 引擎 / 对话投研
                  </p>

                  {/* Big Number */}
                  <div className="mb-3">
                    <span className="font-data text-5xl font-light text-primary">AI</span>
                    <span className="text-base text-muted-foreground ml-2">驱动</span>
                  </div>

                  <h3 className="font-editorial text-xl text-foreground mb-3">AI 投研助手</h3>
                  <p className="text-sm text-muted-foreground leading-relaxed mb-6 flex-grow">
                    用自然语言对话，深度研究任意美股。基本面、技术面、新闻面、宏观面——一个问题开始，追问到底。
                  </p>

                  {/* CTA */}
                  <div className="flex items-center justify-between p-3 rounded-lg bg-muted/30 border border-border/50 mt-auto group-hover:border-primary/25 transition-colors">
                    <span className="text-xs text-muted-foreground">开始对话研究</span>
                    <svg className="w-4 h-4 text-primary/60 transition-transform group-hover:translate-x-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                    </svg>
                  </div>
                </div>
              </div>
            </Link>

            {/* Feature 6: Macro Analysis */}
            <Link href="/macro" className="group block h-full cursor-pointer animate-fade-in-up delay-500">
              <div className="relative rounded-xl border border-border/30 bg-card overflow-hidden hover-glow h-full">
                <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-primary/40 to-transparent" />
                <div className="p-7 flex flex-col h-full">
                  <p className="text-xs font-medium tracking-[0.15em] uppercase text-primary/80 mb-4">
                    宏观分析 / 经济全景
                  </p>

                  {/* Big Number */}
                  <div className="mb-3">
                    <span className="font-data text-5xl font-light text-primary">360</span>
                    <span className="font-data text-xl text-primary/50">&deg;</span>
                    <span className="text-base text-muted-foreground ml-2">全景视角</span>
                  </div>

                  <h3 className="font-editorial text-xl text-foreground mb-3">宏观经济仪表盘</h3>
                  <p className="text-sm text-muted-foreground leading-relaxed mb-6 flex-grow">
                    通胀、利率、流动性、风险指标一站式追踪，理解推动市场的宏观力量。
                  </p>

                  {/* CTA */}
                  <div className="flex items-center justify-between p-3 rounded-lg bg-muted/30 border border-border/50 mt-auto group-hover:border-primary/25 transition-colors">
                    <span className="text-xs text-muted-foreground">查看宏观面板</span>
                    <svg className="w-4 h-4 text-primary/60 transition-transform group-hover:translate-x-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                    </svg>
                  </div>
                </div>
              </div>
            </Link>
          </div>
        </div>
      </section>

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
                  { ok: true, text: '每日市场日报（网站阅读）' },
                  { ok: true, text: '盘前早报（网站阅读）' },
                  { ok: false, text: '专属持仓日报' },
                  { ok: false, text: 'AI 深度个股分析' },
                  { ok: false, text: '宏观仪表盘' },
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
            <div className="relative rounded-xl border border-primary/30 bg-card/50 p-6 ring-1 ring-primary/10">
              <div className="absolute -top-16 left-1/2 -translate-x-1/2 w-48 h-32 bg-primary/8 blur-[60px] pointer-events-none" />
              <div className="relative">
                <div className="flex items-center gap-2 mb-1">
                  <h3 className="text-lg font-semibold text-foreground">Pro</h3>
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-primary/10 border border-primary/20">
                    <span className="text-xs font-medium text-primary">推荐</span>
                  </span>
                </div>
                <p className="text-xs text-muted-foreground mb-4">邮件推送 + 持仓分析</p>
                <div className="flex items-baseline gap-2 mb-5">
                  <span className="text-2xl font-data font-bold text-foreground">{PRICING.pro}</span>
                  <span className="text-sm text-muted-foreground">{PRICING.interval}</span>
                  <span className="text-sm text-muted-foreground/70 line-through font-data">{PRICING.proOriginal}</span>
                </div>
                <div className="space-y-3 mb-6">
                  {[
                    { ok: true, text: '完整市场日报（网站 + 邮件）' },
                    { ok: true, text: '盘前早报 + 盘后晚报' },
                    { ok: true, text: '专属持仓日报（邮件推送）' },
                    { ok: true, text: '宏观周报（邮件推送）' },
                    { ok: true, text: '自选股管理' },
                    { ok: false, text: 'AI 深度个股分析' },
                    { ok: false, text: 'AI 投研助手' },
                    { ok: false, text: '宏观仪表盘' },
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
                  className="block w-full px-4 py-3 bg-primary text-primary-foreground rounded-lg text-sm font-semibold text-center transition-all hover:bg-primary/90 active:scale-[0.98]"
                >
                  立即订阅 — {PRICING.proPerMonth}
                </Link>
                <p className="text-xs text-muted-foreground/70 text-center mt-2.5">随时取消 · Stripe 安全支付</p>
              </div>
            </div>

            {/* Max */}
            <div className="rounded-xl border border-border/40 bg-card/30 p-6 hover:border-border/60 transition-all">
              <div className="flex items-center gap-2 mb-1">
                <h3 className="text-lg font-semibold text-foreground">Max</h3>
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
                  'AI 深度个股分析',
                  'AI 投研引擎（对话 + 选股）',
                  '宏观四维度仪表盘',
                ].map((text) => (
                  <div key={text} className="flex items-center gap-2.5">
                    <svg className="w-4 h-4 text-primary shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
                    <span className="text-sm text-foreground">{text}</span>
                  </div>
                ))}
              </div>
              <Link
                href="/pricing"
                className="block w-full px-4 py-3 bg-card text-foreground rounded-lg text-sm font-semibold text-center transition-all hover:border-primary/30 active:scale-[0.98] border border-border/50"
              >
                立即订阅 — {PRICING.maxPerMonth}
              </Link>
              <p className="text-xs text-muted-foreground/70 text-center mt-2.5">随时取消 · Stripe 安全支付</p>
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

      {/* Community Section - WeChat Group */}
      <section className="relative py-16 md:py-24 overflow-hidden">
        <div className="absolute inset-0 bg-[linear-gradient(rgba(16,185,129,0.03)_1px,transparent_1px),linear-gradient(90deg,rgba(16,185,129,0.03)_1px,transparent_1px)] bg-[size:60px_60px]" />

        <div className="relative max-w-6xl mx-auto px-4 md:px-6">
          <div className="max-w-3xl mx-auto text-center">
            {/* Section Label */}
            <div className="flex items-center justify-center gap-3 mb-6">
              <div className="h-px flex-1 max-w-[60px] bg-gradient-to-r from-primary to-transparent" />
              <span className="text-primary text-xs font-semibold tracking-[0.25em] uppercase">
                Community
              </span>
              <div className="h-px flex-1 max-w-[60px] bg-gradient-to-l from-primary to-transparent" />
            </div>

            <h2 className="font-editorial text-3xl md:text-4xl text-foreground mb-4">
              加入投资者社群
            </h2>
            <p className="text-muted-foreground max-w-xl mx-auto mb-10 leading-relaxed">
              和 100+ 美股投资者一起交流市场观点、分享投资心得。扫码加入微信群，与志同道合的人一起成长。
            </p>

            {/* QR Code Cards */}
            <div className="inline-flex flex-col sm:flex-row gap-6">
              {/* Group QR Code */}
              <div className="relative rounded-2xl border border-border/50 bg-card p-6 md:p-8">
                <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-primary/40 to-transparent" />

                {/*
                  WeChat QR Code Image
                  - Insforge Storage bucket: community
                  - Naming: wechat-qr-MMDD.jpg (MMDD = expiry date)
                  - Update steps: upload new image to Insforge with new filename, update src below
                  - Must use new filename each time to bypass Insforge CDN cache
                */}
                <div className="w-52 md:w-64 mx-auto mb-5 rounded-xl overflow-hidden">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src="https://9wmhxyi4.us-east.insforge.app/api/storage/buckets/community/objects/wechat-qr-0421.jpg"
                    alt="TheMarketBrew WeChat Group QR Code"
                    className="w-full h-auto"
                  />
                </div>

                <p className="text-sm text-foreground font-medium">
                  微信扫码加入社群
                </p>
              </div>

              {/* Personal QR Code */}
              <div className="relative rounded-2xl border border-border/50 bg-card p-6 md:p-8">
                <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-primary/30 to-transparent" />

                <div className="w-52 md:w-64 mx-auto mb-5 rounded-xl overflow-hidden">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src="https://9wmhxyi4.us-east.insforge.app/api/storage/buckets/community/objects/wechat-personal-qr.jpg"
                    alt="Add WeChat Personal Contact"
                    className="w-full h-auto"
                  />
                </div>

                <p className="text-sm text-foreground font-medium">
                  群满或过期？加我拉你入群
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Get Started Section - Combined CTA + Quick Start */}
      <section className="relative py-16 md:py-24 bg-gradient-mesh overflow-hidden">
        <div className="absolute inset-0 bg-[linear-gradient(rgba(16,185,129,0.03)_1px,transparent_1px),linear-gradient(90deg,rgba(16,185,129,0.03)_1px,transparent_1px)] bg-[size:60px_60px]" />
        <div className="absolute inset-0 bg-noise pointer-events-none" />

        <div className="relative max-w-6xl mx-auto px-4 md:px-6">
          {/* CTA Header */}
          <div className="text-center max-w-2xl mx-auto mb-12 md:mb-16">
            <div className="flex items-center justify-center gap-3 mb-6">
              <div className="h-px flex-1 max-w-[60px] bg-gradient-to-r from-primary to-transparent" />
              <span className="text-primary text-xs font-semibold tracking-[0.25em] uppercase">
                Get Started
              </span>
              <div className="h-px flex-1 max-w-[60px] bg-gradient-to-l from-primary to-transparent" />
            </div>
            <h2 className="font-editorial text-3xl md:text-4xl text-foreground mb-4">
              从今天开始，清醒地交易
            </h2>
            <p className="text-muted-foreground max-w-xl mx-auto">
              选择最适合你的方式，开始更清醒的投资。
            </p>
          </div>

          {/* Action Cards */}
          <div className="grid md:grid-cols-3 gap-6 lg:gap-8 mb-10">
            {/* Card 1: Read Today's Report */}
            <Link href="/today" className="group block h-full cursor-pointer">
              <div className="relative rounded-xl border border-border/50 bg-card overflow-hidden hover-glow h-full">
                <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-primary/40 to-transparent" />
                <div className="p-7 flex flex-col h-full">
                  <p className="text-xs font-medium tracking-[0.15em] uppercase text-primary/80 mb-4">
                    即刻开始 / 免费阅读
                  </p>

                  <div className="mb-3">
                    <span className="font-data text-5xl font-light text-primary">5</span>
                    <span className="text-base text-muted-foreground ml-2">分钟读完</span>
                  </div>

                  <h3 className="font-editorial text-xl text-foreground mb-3">阅读今日日报</h3>
                  <p className="text-sm text-muted-foreground leading-relaxed mb-6 flex-grow">
                    无需注册，直接阅读今天的市场分析报告。5 分钟了解市场全貌。
                  </p>

                  <div className="flex items-center justify-between p-3 rounded-lg bg-muted/30 border border-border/50 mt-auto group-hover:border-primary/25 transition-colors">
                    <span className="text-xs text-muted-foreground">查看最新日报</span>
                    <svg className="w-4 h-4 text-primary/60 transition-transform group-hover:translate-x-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                    </svg>
                  </div>
                </div>
              </div>
            </Link>

            {/* Card 2: Subscribe Email */}
            <Link href="/login" className="group block h-full cursor-pointer">
              <div className="relative rounded-xl border border-border/50 bg-card overflow-hidden hover-glow h-full">
                <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-primary/40 to-transparent" />
                <div className="p-7 flex flex-col h-full">
                  <p className="text-xs font-medium tracking-[0.15em] uppercase text-primary/80 mb-4">
                    自动送达 / 一键订阅
                  </p>

                  <div className="mb-3">
                    <span className="font-data text-5xl font-light text-primary">0</span>
                    <span className="text-base text-muted-foreground ml-2">操作成本</span>
                  </div>

                  <h3 className="font-editorial text-xl text-foreground mb-3">订阅邮件推送</h3>
                  <p className="text-sm text-muted-foreground leading-relaxed mb-6 flex-grow">
                    每个交易日收盘后自动送达邮箱，再也不错过任何一天的市场动态。
                  </p>

                  <div className="flex items-center justify-between p-3 rounded-lg bg-muted/30 border border-border/50 mt-auto group-hover:border-primary/25 transition-colors">
                    <span className="text-xs text-muted-foreground">填写邮箱即可</span>
                    <svg className="w-4 h-4 text-primary/60 transition-transform group-hover:translate-x-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                    </svg>
                  </div>
                </div>
              </div>
            </Link>

            {/* Card 3: Personalized Report */}
            <Link href="/for-you" className="group block h-full cursor-pointer">
              <div className="relative rounded-xl border border-border/50 bg-card overflow-hidden hover-glow h-full">
                <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-primary/40 to-transparent" />
                <div className="p-7 flex flex-col h-full">
                  <p className="text-xs font-medium tracking-[0.15em] uppercase text-primary/80 mb-4">
                    个性定制 / 需登录
                  </p>

                  <div className="mb-3">
                    <span className="font-data text-5xl font-light text-primary">100</span>
                    <span className="font-data text-3xl text-primary/50">%</span>
                    <span className="text-base text-muted-foreground ml-2">相关</span>
                  </div>

                  <h3 className="font-editorial text-xl text-foreground mb-3">创建专属日报</h3>
                  <p className="text-sm text-muted-foreground leading-relaxed mb-6 flex-grow">
                    添加你的持仓，获得只针对你的股票分析。100% 与你相关。
                  </p>

                  <div className="flex items-center justify-between p-3 rounded-lg bg-muted/30 border border-border/50 mt-auto group-hover:border-primary/25 transition-colors">
                    <span className="text-xs text-muted-foreground">登录创建关注列表</span>
                    <svg className="w-4 h-4 text-primary/60 transition-transform group-hover:translate-x-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                    </svg>
                  </div>
                </div>
              </div>
            </Link>
          </div>

          {/* More Tools + Archive */}
          <div className="flex flex-wrap items-center justify-center gap-3">
            <Link
              href="/stock"
              className="px-4 py-2.5 rounded-lg bg-card/60 border border-border/50 hover:border-primary/30 transition-colors text-sm text-foreground min-h-[44px] flex items-center"
            >
              个股研究
            </Link>
            <Link
              href="/morning"
              className="px-4 py-2.5 rounded-lg bg-card/60 border border-border/50 hover:border-primary/30 transition-colors text-sm text-foreground min-h-[44px] flex items-center"
            >
              盘前早报
            </Link>
            <Link
              href="/research"
              className="px-4 py-2.5 rounded-lg bg-card/60 border border-border/50 hover:border-primary/30 transition-colors text-sm text-foreground min-h-[44px] flex items-center"
            >
              AI 投研助手
            </Link>
            <Link
              href="/macro"
              className="px-4 py-2.5 rounded-lg bg-card/60 border border-border/50 hover:border-primary/30 transition-colors text-sm text-foreground min-h-[44px] flex items-center"
            >
              宏观仪表盘
            </Link>
            <Link
              href="/today/archive"
              className="px-4 py-2.5 rounded-lg bg-card/60 border border-border/50 hover:border-primary/30 transition-colors text-sm text-muted-foreground hover:text-foreground min-h-[44px] flex items-center"
            >
              浏览历史报告
            </Link>
          </div>
        </div>
      </section>
    </main>
  );
}
