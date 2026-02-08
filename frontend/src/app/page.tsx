"use client";

import Link from "next/link";
import Image from "next/image";
import SubscribeForm from "@/components/SubscribeForm";
import LogoMarquee from "@/components/LogoMarquee";

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

        <div className="relative flex-1 flex items-start md:items-center max-w-6xl mx-auto w-full px-4 md:px-6 pt-8 pb-20 md:pt-20 md:pb-24">
          <div className="grid md:grid-cols-2 gap-12 lg:gap-16 items-center">
            {/* Left - Content */}
            <div>
              {/* Product Positioning Tag */}
              <div className="animate-fade-in-up flex items-center gap-3 mb-6">
                <div className="h-px flex-1 max-w-[60px] bg-gradient-to-r from-primary to-transparent" />
                <span className="text-primary text-xs font-medium tracking-[0.2em] uppercase">
                  美股 AI 投资助理
                </span>
              </div>

              {/* Main Headline - Clear Value Proposition */}
              <h1 className="animate-fade-in-up delay-100 font-editorial text-3xl md:text-5xl lg:text-6xl text-foreground leading-[1.05] mb-5">
                每天 5 分钟
                <br />
                <span className="text-gradient-emerald">读懂美股交易信号</span>
              </h1>

              {/* Subtitle - Specific Value */}
              <p className="animate-fade-in-up delay-200 text-base md:text-lg text-muted-foreground max-w-md leading-relaxed mb-6">
                AI 从 5000+ 条新闻中提炼你需要的交易信号。
                <br className="hidden sm:block" />
                收盘后自动发送，让你带着清晰的头脑规划明天。
              </p>

              {/* Quick Value Points */}
              <div className="animate-fade-in-up delay-300 flex flex-wrap gap-4 mb-6">
                {["AI 智能提炼", "收盘后送达", "完全免费"].map((item, i) => (
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

              {/* Secondary CTA - View Sample */}
              <div className="animate-fade-in-up delay-500 mt-6">
                <Link
                  href="/today"
                  className="inline-flex items-center gap-2 text-sm text-primary hover:text-primary/80 transition-colors group"
                >
                  <span className="border-b border-primary/30 group-hover:border-primary/60 transition-colors">
                    先看一份样本报告
                  </span>
                  <svg
                    className="w-4 h-4 transition-transform group-hover:translate-x-0.5"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M9 5l7 7-7 7"
                    />
                  </svg>
                </Link>
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
              <span className="text-micro text-muted-foreground/50 uppercase tracking-[0.2em]">
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

      {/* Report Preview Section - Moved up for immediate product visibility */}
      <section className="relative py-16 md:py-24 overflow-hidden">
        {/* Subtle grid background */}
        <div className="absolute inset-0 bg-[linear-gradient(rgba(16,185,129,0.03)_1px,transparent_1px),linear-gradient(90deg,rgba(16,185,129,0.03)_1px,transparent_1px)] bg-[size:60px_60px]" />
        <div className="relative max-w-6xl mx-auto px-4 md:px-6">
          <div className="grid md:grid-cols-2 gap-12 lg:gap-16 items-start">
            {/* Left - Content */}
            <div className="space-y-6 md:sticky md:top-8">
              <div className="flex items-center gap-3">
                <div className="h-px flex-1 max-w-[60px] bg-gradient-to-r from-primary to-transparent" />
                <span className="text-primary text-xs font-medium tracking-[0.2em] uppercase">
                  Preview
                </span>
              </div>
              <h2 className="font-editorial text-3xl md:text-4xl text-foreground">
                真实邮件长这样
              </h2>
              <p className="text-muted-foreground leading-relaxed">
                每份报告包含你需要了解的所有市场信息，结构清晰，一目了然。
              </p>
              <ul className="space-y-4 pt-2">
                {[
                  { icon: "chart", text: "市场指数：一眼看清大盘走势" },
                  { icon: "bulb", text: "今日要点：当日核心叙事" },
                  { icon: "signal", text: "关键信号：VIX、国债、美元在说什么" },
                  { icon: "news", text: "新闻精选：重要头条 + 深度解读" },
                  { icon: "calendar", text: "近期事件：不错过任何重要日程" },
                  { icon: "eye", text: "总结展望：明天要关注什么" },
                ].map((item, i) => (
                  <li key={i} className="flex items-start gap-3">
                    <div className="w-5 h-5 rounded-full bg-primary/20 flex items-center justify-center mt-0.5 flex-shrink-0">
                      <svg
                        className="w-3 h-3 text-primary"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={3}
                          d="M5 13l4 4L19 7"
                        />
                      </svg>
                    </div>
                    <span className="text-foreground text-sm">{item.text}</span>
                  </li>
                ))}
              </ul>
            </div>

            {/* Right - Real Email Preview */}
            <div className="terminal-card p-0 overflow-hidden">
              {/* Email Header - THEMARKETBREW branding */}
              <div className="bg-zinc-100 dark:bg-[#0a0a0a] px-6 py-4 border-b border-border">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded bg-primary flex items-center justify-center">
                      <span className="text-primary-foreground font-bold text-sm">
                        M
                      </span>
                    </div>
                    <div>
                      <p className="text-xs text-primary font-medium tracking-wider">
                        THEMARKETBREW
                      </p>
                      <p className="text-micro text-muted-foreground">
                        每日市场报告
                      </p>
                    </div>
                  </div>
                  <p className="text-xs text-muted-foreground font-data">
                    2025-01-24
                  </p>
                </div>
              </div>

              {/* Market Indices Grid */}
              <div className="px-6 py-4 bg-card/50">
                <p className="text-xs text-muted-foreground mb-3 font-medium">
                  市场指数
                </p>
                <div className="grid grid-cols-3 gap-3">
                  {[
                    {
                      name: "S&P 500",
                      value: "6,118.71",
                      change: "+0.53%",
                      up: true,
                    },
                    {
                      name: "Nasdaq",
                      value: "20,053.68",
                      change: "+0.22%",
                      up: true,
                    },
                    {
                      name: "10Y Treasury",
                      value: "4.63%",
                      change: "+2bp",
                      up: false,
                    },
                    { name: "VIX", value: "14.85", change: "-5.2%", up: true },
                    {
                      name: "Gold",
                      value: "$2,758",
                      change: "+0.8%",
                      up: true,
                    },
                    {
                      name: "US Dollar",
                      value: "107.95",
                      change: "-0.3%",
                      up: true,
                    },
                  ].map((item, i) => (
                    <div key={i} className="bg-muted/30 rounded px-2.5 py-2">
                      <p className="text-micro text-muted-foreground truncate">
                        {item.name}
                      </p>
                      <p className="font-data text-xs text-foreground">
                        {item.value}
                      </p>
                      <p
                        className={`font-data text-micro ${
                          item.up ? "text-primary" : "text-red-400"
                        }`}
                      >
                        {item.change}
                      </p>
                    </div>
                  ))}
                </div>
              </div>

              {/* Today's Key Points */}
              <div className="px-6 py-4 border-t border-border/30">
                <div className="flex items-center gap-2 mb-2">
                  <div className="w-1 h-4 bg-primary rounded-full"></div>
                  <p className="text-xs font-medium text-primary">今日要点</p>
                </div>
                <p className="text-sm text-foreground/90 leading-relaxed">
                  科技股带领市场收涨，投资者消化特朗普关税政策影响。Nvidia
                  领涨芯片板块，市场情绪回暖但仍需关注下周财报季...
                </p>
              </div>

              {/* Key Signals */}
              <div className="px-6 py-4 border-t border-border/30">
                <div className="flex items-center gap-2 mb-3">
                  <div className="w-1 h-4 bg-amber-400 rounded-full"></div>
                  <p className="text-xs font-medium text-amber-400">关键信号</p>
                </div>
                <div className="space-y-2">
                  {[
                    {
                      signal: "VIX 跌破 15 进入「平静区」",
                      implication: "市场恐慌情绪消退",
                    },
                    {
                      signal: "10Y 国债小幅上行",
                      implication: "降息预期略有降温",
                    },
                  ].map((item, i) => (
                    <div key={i} className="flex items-start gap-2 text-xs">
                      <span className="text-muted-foreground">-</span>
                      <div>
                        <span className="text-foreground">{item.signal}</span>
                        <span className="text-muted-foreground">
                          {" "}
                          - {item.implication}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* News Headlines - Simplified */}
              <div className="px-6 py-4 border-t border-border/30">
                <div className="flex items-center gap-2 mb-3">
                  <div className="w-1 h-4 bg-blue-400 rounded-full"></div>
                  <p className="text-xs font-medium text-blue-400">新闻精选</p>
                </div>
                <div className="text-xs">
                  <p className="text-foreground font-medium mb-1">
                    Trump signs executive order on AI infrastructure
                  </p>
                  <p className="text-muted-foreground leading-relaxed">
                    特朗普签署 AI 基础设施行政令，利好数据中心和芯片企业...
                  </p>
                </div>
              </div>

              {/* Outlook */}
              <div className="px-6 py-4 border-t border-border/30 bg-primary/5">
                <div className="flex items-center gap-2 mb-2">
                  <div className="w-1 h-4 bg-primary rounded-full"></div>
                  <p className="text-xs font-medium text-primary">总结展望</p>
                </div>
                <p className="text-xs text-foreground/80 leading-relaxed">
                  短期关注财报季表现和 FOMC
                  会议，技术面看好但需警惕获利回吐压力...
                </p>
              </div>

              {/* Footer hint */}
              <div className="px-6 py-3 bg-muted/20 border-t border-border/30">
                <p className="text-micro text-muted-foreground text-center">
                  这是真实邮件的简化预览
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Core Capabilities Section - Simplified */}
      <section className="relative py-20 md:py-28 overflow-hidden">
        {/* Subtle grid background */}
        <div className="absolute inset-0 bg-[linear-gradient(rgba(16,185,129,0.03)_1px,transparent_1px),linear-gradient(90deg,rgba(16,185,129,0.03)_1px,transparent_1px)] bg-[size:60px_60px]" />

        <div className="relative max-w-6xl mx-auto px-4 md:px-6">
          {/* Section Header - Editorial Style */}
          <div className="mb-12 md:mb-16">
            <div className="flex items-center gap-3 mb-6">
              <div className="h-px flex-1 max-w-[60px] bg-gradient-to-r from-primary to-transparent" />
              <span className="text-primary text-xs font-medium tracking-[0.2em] uppercase">
                Features
              </span>
            </div>
            <h2 className="font-editorial text-4xl md:text-5xl lg:text-6xl text-foreground leading-[1.1]">
              三大核心功能
            </h2>
          </div>

          {/* Feature 1: Daily Report */}
          <Link href="/today" className="block mb-8 group cursor-pointer">
            <div className="relative rounded-xl border border-border/30 bg-card overflow-hidden hover:border-primary/30 transition-all duration-300">
              <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-primary/40 to-transparent" />
              <div className="p-8 md:p-10">
                <div className="grid md:grid-cols-2 gap-8 items-center">
                  {/* Left - Content */}
                  <div>
                    <p className="text-xs font-medium tracking-[0.15em] uppercase text-primary/80 mb-3">
                      核心功能 / 每日简报
                    </p>
                    <h3 className="font-editorial text-xl sm:text-2xl md:text-3xl text-foreground mb-4 leading-tight">
                      5000+ 条新闻
                      <span className="text-primary mx-2">→</span>
                      5 分钟阅读
                    </h3>
                    <p className="text-sm text-muted-foreground leading-relaxed mb-6">
                      AI 帮你从海量信息中提炼当日要点、关键信号、重要新闻。每个交易日收盘后自动生成，让你用最短时间掌握市场全貌。
                    </p>

                    <div className="inline-flex items-center gap-2 px-5 py-2.5 bg-emerald-600 text-white rounded-lg font-medium text-sm group-hover:bg-emerald-500 group-hover:shadow-lg group-hover:shadow-emerald-500/15 transition-all cursor-pointer">
                      查看今日日报
                      <svg className="w-4 h-4 transition-transform group-hover:translate-x-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                      </svg>
                    </div>
                  </div>

                  {/* Right - Report structure preview */}
                  <div className="hidden md:block">
                    <div className="space-y-2.5">
                      {[
                        { label: "今日要点", color: "bg-emerald-500" },
                        { label: "关键信号", color: "bg-amber-400" },
                        { label: "新闻精选", color: "bg-blue-400" },
                        { label: "近期事件", color: "bg-purple-400" },
                        { label: "总结展望", color: "bg-emerald-500" },
                      ].map((item, idx) => (
                        <div
                          key={item.label}
                          className="flex items-center gap-3 px-4 py-2.5 rounded-lg bg-muted/30 border border-border/50"
                        >
                          <div className={`w-0.5 h-5 ${item.color} rounded-full`} />
                          <span className="text-sm text-foreground/80">{item.label}</span>
                          <div className="flex-1 h-1.5 rounded-full bg-muted/50 overflow-hidden ml-auto max-w-[100px]">
                            <div
                              className={`h-full ${item.color} rounded-full opacity-60`}
                              style={{ width: `${85 - idx * 10}%` }}
                            />
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </Link>

          {/* Feature 2 & 3: Grid Layout */}
          <div className="grid md:grid-cols-2 gap-6 lg:gap-8">
            {/* Feature 2: Personalization */}
            <Link href="/for-you" className="group block h-full cursor-pointer">
              <div className="relative rounded-xl border border-border/30 bg-card overflow-hidden hover:border-primary/30 transition-all duration-300 h-full">
                <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-primary/30 to-transparent" />
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

            {/* Feature 3: One-Stop Research */}
            <Link href="/stock" className="group block h-full cursor-pointer">
              <div className="relative rounded-xl border border-border/30 bg-card overflow-hidden hover:border-primary/30 transition-all duration-300 h-full">
                <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-primary/30 to-transparent" />
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
          </div>
        </div>
      </section>

      {/* About Us Section */}
      <section className="relative py-20 md:py-28 overflow-hidden">
        <div className="absolute inset-0 bg-muted/20" />
        <div className="relative max-w-6xl mx-auto px-4 md:px-6">
          <div className="max-w-3xl mx-auto">
            {/* Section Label */}
            <div className="flex items-center gap-3 mb-8">
              <div className="h-px flex-1 max-w-[60px] bg-gradient-to-r from-primary to-transparent" />
              <span className="text-primary text-xs font-medium tracking-[0.2em] uppercase">
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
                  独立开发者 / 十年美股散户
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
                    所以我给自己做了 TheMarketBrew。让 AI
                    替我从每天的噪音中提炼出清晰的逻辑，解放了我的时间和精力，让我可以更加理性的面对投资。
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

      {/* Get Started Section - Combined CTA + Quick Start */}
      <section className="relative py-16 md:py-24 bg-gradient-mesh overflow-hidden">
        <div className="absolute inset-0 bg-[linear-gradient(rgba(16,185,129,0.03)_1px,transparent_1px),linear-gradient(90deg,rgba(16,185,129,0.03)_1px,transparent_1px)] bg-[size:60px_60px]" />
        <div className="absolute inset-0 bg-noise pointer-events-none" />

        <div className="relative max-w-6xl mx-auto px-4 md:px-6">
          {/* CTA Header */}
          <div className="text-center max-w-2xl mx-auto mb-12 md:mb-16">
            <div className="inline-flex items-center gap-3 justify-center mb-6">
              <div className="h-px w-12 bg-gradient-to-r from-transparent to-primary/50" />
              <span className="text-primary text-xs font-medium tracking-[0.2em] uppercase">
                Get Started
              </span>
              <div className="h-px w-12 bg-gradient-to-r from-primary/50 to-transparent" />
            </div>
            <h2 className="font-editorial text-3xl md:text-4xl text-foreground mb-4">
              从今天开始，清醒地交易
            </h2>
            <p className="text-muted-foreground max-w-xl mx-auto">
              所有功能完全免费。选择最适合你的方式开始。
            </p>
          </div>

          {/* Action Cards */}
          <div className="grid md:grid-cols-3 gap-6 lg:gap-8 mb-10">
            {/* Card 1: Read Today's Report */}
            <Link href="/today" className="group block h-full cursor-pointer">
              <div className="relative rounded-xl border border-border/50 bg-card overflow-hidden hover:border-primary/30 transition-all duration-300 h-full">
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
              <div className="relative rounded-xl border border-border/50 bg-card overflow-hidden hover:border-primary/30 transition-all duration-300 h-full">
                <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-primary/30 to-transparent" />
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
              <div className="relative rounded-xl border border-border/50 bg-card overflow-hidden hover:border-primary/30 transition-all duration-300 h-full">
                <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-primary/30 to-transparent" />
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
              className="px-4 py-2 rounded-lg bg-card/60 backdrop-blur-sm border border-border/50 hover:border-primary/30 transition-colors text-sm text-foreground"
            >
              个股研究
            </Link>
            <Link
              href="/macro/liquidity"
              className="px-4 py-2 rounded-lg bg-card/60 backdrop-blur-sm border border-border/50 hover:border-primary/30 transition-colors text-sm text-foreground"
            >
              流动性监控
            </Link>
            <Link
              href="/today/archive"
              className="px-4 py-2 rounded-lg bg-card/60 backdrop-blur-sm border border-border/50 hover:border-primary/30 transition-colors text-sm text-muted-foreground hover:text-foreground"
            >
              浏览历史报告
            </Link>
          </div>
        </div>
      </section>
    </main>
  );
}
