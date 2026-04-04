"use client";

import Link from "next/link";
import Image from "next/image";
import SubscribeForm from "@/components/SubscribeForm";
import LogoMarquee from "@/components/LogoMarquee";
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
                {["AI 智能提炼", "收盘后送达", "抢先体验价"].map((item, i) => (
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
              <div className="animate-fade-in-up delay-500 mt-6 flex flex-wrap items-center gap-3">
                <Link
                  href="/pricing"
                  className="inline-flex items-center gap-2 px-5 py-2.5 bg-primary text-primary-foreground rounded-lg text-sm font-medium transition-all hover:bg-primary/90 active:scale-[0.98]"
                >
                  查看定价方案
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                </Link>
                <Link
                  href="/today"
                  className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors group"
                >
                  <span className="border-b border-border/40 group-hover:border-foreground/40 transition-colors">
                    先看一份样本报告
                  </span>
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
          <div className="grid md:grid-cols-2 gap-12 lg:gap-16 items-center">
            {/* Left - Content */}
            <div className="space-y-6">
              <div className="flex items-center gap-3">
                <div className="h-px flex-1 max-w-[60px] bg-gradient-to-r from-primary to-transparent" />
                <span className="text-primary text-xs font-semibold tracking-[0.25em] uppercase">
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
                  { icon: "chart", text: "市场概览：一眼看清大盘走势" },
                  { icon: "bulb", text: "今日要点：当日核心叙事" },
                  { icon: "news", text: "新闻精选：重要头条 + 深度解读" },
                  { icon: "calendar", text: "近期事件：不错过任何重要日程" },
                  { icon: "eye", text: "总结与展望：明天要关注什么" },
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

            {/* Right - iPhone Mockup */}
            <div className="flex justify-center">
              <div className="relative">
                {/* Ambient glow */}
                <div className="absolute -inset-12 bg-primary/[0.07] blur-[60px] rounded-full pointer-events-none" />

                {/* Phone body */}
                <div
                  className="relative bg-zinc-900 rounded-[3rem] p-[10px] border border-zinc-700/50 w-[320px]"
                  style={{
                    boxShadow: '0 25px 60px -12px rgba(0,0,0,0.5), 0 0 40px -8px rgba(16,185,129,0.1)',
                    transform: 'perspective(1200px) rotateY(-3deg) rotateX(1deg)',
                  }}
                >
                  {/* Dynamic Island */}
                  <div className="absolute top-[18px] left-1/2 -translate-x-1/2 w-[80px] h-[24px] bg-black rounded-full z-20" />

                  {/* Screen */}
                  <div className="relative bg-[#f0f0f0] rounded-[2.4rem] overflow-hidden" style={{ height: 580 }}>
                    {/* Status bar */}
                    <div className="flex items-center justify-between px-8 pt-[14px] pb-1 bg-[#0a0a0a]">
                      <span className="text-[10px] text-white/50 font-medium">9:41</span>
                      <div className="flex items-center gap-[3px]">
                        <svg className="w-[14px] h-[10px] text-white/50" viewBox="0 0 16 12" fill="currentColor">
                          <rect x="0" y="5" width="3" height="7" rx="0.5" opacity="0.4" />
                          <rect x="4.5" y="3" width="3" height="9" rx="0.5" opacity="0.6" />
                          <rect x="9" y="1" width="3" height="11" rx="0.5" opacity="0.8" />
                          <rect x="13" y="0" width="3" height="12" rx="0.5" />
                        </svg>
                        <svg className="w-[14px] h-[10px] text-white/50" viewBox="0 0 16 12" fill="currentColor">
                          <path d="M8 3C10.7 3 13.1 4.2 14.8 6.1L16 4.8C14 2.6 11.2 1.2 8 1.2S2 2.6 0 4.8L1.2 6.1C2.9 4.2 5.3 3 8 3Z" opacity="0.4" />
                          <path d="M8 6.5C9.8 6.5 11.4 7.3 12.5 8.5L13.7 7.2C12.3 5.7 10.3 4.7 8 4.7S3.7 5.7 2.3 7.2L3.5 8.5C4.6 7.3 6.2 6.5 8 6.5Z" opacity="0.7" />
                          <circle cx="8" cy="11" r="1.5" />
                        </svg>
                        <div className="w-[22px] h-[10px] rounded-[2px] border border-white/30 relative ml-0.5">
                          <div className="absolute inset-[1.5px] right-[2px] bg-white/50 rounded-[1px]" />
                          <div className="absolute right-[-2.5px] top-[2.5px] w-[1.5px] h-[5px] bg-white/30 rounded-r" />
                        </div>
                      </div>
                    </div>

                    {/* Email content - matching real email template */}
                    <div>
                      {/* Dark gradient header - matching real email */}
                      <div className="px-4 py-4 text-center" style={{ background: 'linear-gradient(135deg, #0a0a0a 0%, #1a1a2e 100%)' }}>
                        <p className="text-[8px] text-primary font-bold tracking-[0.25em] mb-0.5">THEMARKETBREW</p>
                        <p className="text-[7px] text-white/40 tracking-[0.15em] mb-1">DAILY BRIEF</p>
                        <p className="text-[7px] text-white/30 font-data">2025-01-24 Friday</p>
                      </div>

                      {/* Email body - light background */}
                      <div className="px-3 py-3">
                        {/* Greeting + headline */}
                        <div className="bg-white rounded-lg px-3 py-2.5 mb-2 shadow-[0_1px_3px_rgba(0,0,0,0.08)]">
                          <p className="text-[8px] text-zinc-500 mb-1">Hi Investor,</p>
                          <p className="text-[10px] text-zinc-900 font-bold leading-tight mb-1">
                            科技股领涨，AI 投资潮持续升温
                          </p>
                          <p className="text-[7px] text-zinc-500 leading-relaxed">
                            市场在关税担忧缓解后强劲反弹，标普500突破6100点...
                          </p>
                        </div>

                        {/* Market overview - 3x2 grid matching real email */}
                        <div className="bg-white rounded-lg px-3 py-2.5 mb-2 shadow-[0_1px_3px_rgba(0,0,0,0.08)]">
                          <p className="text-[8px] text-zinc-800 font-bold mb-2">Market Overview</p>
                          <div className="grid grid-cols-3 gap-1.5">
                            {[
                              { name: "S&P 500", val: "6,118", chg: "+0.53%", up: true },
                              { name: "NASDAQ", val: "20,053", chg: "+0.22%", up: true },
                              { name: "VIX", val: "14.85", chg: "-5.2%", up: true },
                              { name: "GOLD", val: "2,770", chg: "+0.8%", up: true },
                              { name: "US DOLLAR", val: "107.9", chg: "-0.3%", up: false },
                              { name: "10Y YIELD", val: "4.63%", chg: "+2bp", up: false },
                            ].map((d, i) => (
                              <div key={i} className="bg-[#f8f8f8] rounded px-1.5 py-1 border border-zinc-100">
                                <p className="text-[6px] text-zinc-400 truncate">{d.name}</p>
                                <p className="text-[9px] text-zinc-900 font-semibold font-data">{d.val}</p>
                                <p className={`text-[7px] font-data font-medium ${d.up ? 'text-emerald-600' : 'text-red-500'}`}>{d.chg}</p>
                              </div>
                            ))}
                          </div>
                        </div>

                        {/* Today's key points */}
                        <div className="bg-white rounded-lg px-3 py-2.5 mb-2 shadow-[0_1px_3px_rgba(0,0,0,0.08)]">
                          <p className="text-[8px] text-zinc-800 font-bold mb-1.5">Key Takeaways</p>
                          <div className="space-y-1">
                            <div className="flex items-start gap-1.5">
                              <div className="w-1 h-1 rounded-full bg-primary mt-[3px] flex-shrink-0" />
                              <p className="text-[7px] text-zinc-600 leading-relaxed">Nvidia 领涨芯片板块，AI 基础设施投资加速</p>
                            </div>
                            <div className="flex items-start gap-1.5">
                              <div className="w-1 h-1 rounded-full bg-primary mt-[3px] flex-shrink-0" />
                              <p className="text-[7px] text-zinc-600 leading-relaxed">关税担忧缓解，投资者重新布局风险资产</p>
                            </div>
                            <div className="flex items-start gap-1.5">
                              <div className="w-1 h-1 rounded-full bg-primary mt-[3px] flex-shrink-0" />
                              <p className="text-[7px] text-zinc-600 leading-relaxed">VIX 回落至 15 以下，市场恐慌情绪消退</p>
                            </div>
                          </div>
                        </div>

                        {/* News Headlines */}
                        <div className="bg-white rounded-lg px-3 py-2.5 shadow-[0_1px_3px_rgba(0,0,0,0.08)]">
                          <p className="text-[8px] text-zinc-800 font-bold mb-1.5">News Headlines</p>
                          <div className="space-y-1.5">
                            <div>
                              <p className="text-[7px] text-zinc-800 font-semibold leading-tight">Nvidia CEO: AI Infrastructure Spending to Accelerate</p>
                              <p className="text-[6.5px] text-zinc-500 leading-relaxed">黄仁勋表示数据中心需求远超预期，带动芯片板块全线走强...</p>
                            </div>
                            <div className="border-t border-zinc-100 pt-1.5">
                              <p className="text-[7px] text-zinc-800 font-semibold leading-tight">Fed Officials Signal Patience on Rate Cuts</p>
                              <p className="text-[6.5px] text-zinc-500 leading-relaxed">多位联储官员暗示将维持利率不变，市场重新评估降息时间表...</p>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Bottom fade */}
                    <div className="absolute bottom-0 left-0 right-0 h-24 bg-gradient-to-t from-[#e8e8e8] via-[#f0f0f0]/90 to-transparent pointer-events-none" />
                  </div>

                  {/* Home indicator */}
                  <div className="mx-auto mt-[6px] mb-[2px] w-[100px] h-[4px] bg-zinc-700 rounded-full" />
                </div>
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
              <span className="text-primary text-xs font-semibold tracking-[0.25em] uppercase">
                Features
              </span>
            </div>
            <h2 className="font-editorial text-4xl md:text-5xl lg:text-6xl text-foreground leading-[1.1]">
              四大核心功能
            </h2>
          </div>

          {/* 4 Features: 2x2 Grid Layout */}
          <div className="grid md:grid-cols-2 gap-6">
            {/* Feature 1: Daily Report */}
            <Link href="/today" className="group block h-full cursor-pointer">
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

            {/* Feature 2: Personalization */}
            <Link href="/for-you" className="group block h-full cursor-pointer">
              <div className="relative rounded-xl border border-border/30 bg-card overflow-hidden hover-glow h-full">
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

            {/* Feature 3: Stock Research */}
            <Link href="/stock" className="group block h-full cursor-pointer">
              <div className="relative rounded-xl border border-border/30 bg-card overflow-hidden hover-glow h-full">
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

            {/* Feature 4: Macro Analysis (NEW) */}
            <Link href="/macro" className="group block h-full cursor-pointer">
              <div className="relative rounded-xl border border-border/30 bg-card overflow-hidden hover-glow h-full">
                <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-primary/30 to-transparent" />
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

      {/* Pricing Section */}
      <section className="relative py-20 md:py-28 overflow-hidden">
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
              所有功能，一个价格
            </h2>
            <p className="text-muted-foreground text-sm md:text-base max-w-md mx-auto">
              从市场日报到 AI 深度投研，一个订阅全部解锁
            </p>
          </div>

          {/* Two Column Comparison */}
          <div className="grid md:grid-cols-2 gap-4 md:gap-6 max-w-4xl mx-auto mb-10">
            {/* Free */}
            <div className="rounded-xl border border-border/40 bg-card/30 p-6">
              <h3 className="text-lg font-semibold text-foreground mb-1">免费版</h3>
              <p className="text-xs text-muted-foreground mb-4">邮件订阅</p>
              <div className="text-2xl font-data font-bold text-foreground mb-5">$0<span className="text-sm text-muted-foreground font-normal ml-1">/月</span></div>
              <div className="space-y-3">
                {[
                  { ok: true, text: '每日市场日报（邮件）' },
                  { ok: false, text: '专属持仓日报' },
                  { ok: false, text: 'AI 个股深度分析' },
                  { ok: false, text: '投研助手' },
                  { ok: false, text: '宏观仪表盘' },
                ].map((item) => (
                  <div key={item.text} className="flex items-center gap-2.5">
                    {item.ok ? (
                      <svg className="w-4 h-4 text-primary shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
                    ) : (
                      <svg className="w-4 h-4 text-muted-foreground/30 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                    )}
                    <span className={`text-sm ${item.ok ? 'text-foreground' : 'text-muted-foreground/40'}`}>{item.text}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Pro */}
            <div className="relative rounded-xl border border-primary/30 bg-card/50 p-6 ring-1 ring-primary/10">
              <div className="absolute -top-16 left-1/2 -translate-x-1/2 w-48 h-32 bg-primary/8 blur-[60px] pointer-events-none" />
              <div className="relative">
                <div className="flex items-center gap-2 mb-1">
                  <h3 className="text-lg font-semibold text-foreground">Pro</h3>
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-amber-500/10 border border-amber-500/20">
                    <span className="w-1.5 h-1.5 rounded-full bg-amber-400 light:bg-amber-600" />
                    <span className="text-xs font-medium text-amber-400 light:text-amber-600">抢先体验价</span>
                  </span>
                </div>
                <p className="text-xs text-muted-foreground mb-4">全部功能解锁</p>
                <div className="flex items-baseline gap-2 mb-5">
                  <span className="text-2xl font-data font-bold text-foreground">{PRICING.pro}</span>
                  <span className="text-sm text-muted-foreground">{PRICING.interval}</span>
                  <span className="text-sm text-muted-foreground/60 line-through font-data">{PRICING.maxOriginal}</span>
                  <span className="text-xs font-medium text-primary">{PRICING.maxDiscount}</span>
                </div>
                <div className="space-y-3 mb-6">
                  {[
                    '完整市场日报（网站 + 邮件）',
                    '专属持仓日报（只属于你的分析）',
                    'AI 深度个股分析',
                    '投研助手（AI 对话）',
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
                  className="block w-full px-4 py-2.5 bg-primary text-primary-foreground rounded-lg text-sm font-semibold text-center transition-all hover:bg-primary/90 active:scale-[0.98]"
                >
                  立即订阅 — {PRICING.proPerMonth}
                </Link>
                <p className="text-xs text-muted-foreground/60 text-center mt-2.5">随时取消 · Stripe 安全支付</p>
              </div>
            </div>
          </div>

          {/* Social proof bar */}
          <div className="flex items-center justify-center gap-6 text-xs text-muted-foreground">
            <span>34 位用户正在使用</span>
            <span className="w-1 h-1 rounded-full bg-border" />
            <span>前 50 名抢先体验</span>
            <span className="w-1 h-1 rounded-full bg-border" />
            <span>
              <Link href="/pricing" className="text-primary hover:text-primary/80 transition-colors">
                查看完整定价 →
              </Link>
            </span>
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

      {/* Community Section - WeChat Group */}
      <section className="relative py-16 md:py-24 overflow-hidden">
        <div className="absolute inset-0 bg-[linear-gradient(rgba(16,185,129,0.03)_1px,transparent_1px),linear-gradient(90deg,rgba(16,185,129,0.03)_1px,transparent_1px)] bg-[size:60px_60px]" />

        <div className="relative max-w-6xl mx-auto px-4 md:px-6">
          <div className="max-w-3xl mx-auto text-center">
            {/* Section Label */}
            <div className="inline-flex items-center gap-3 justify-center mb-6">
              <div className="h-px w-12 bg-gradient-to-r from-transparent to-primary/50" />
              <span className="text-primary text-xs font-semibold tracking-[0.25em] uppercase">
                Community
              </span>
              <div className="h-px w-12 bg-gradient-to-r from-primary/50 to-transparent" />
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
                    src="https://9wmhxyi4.us-east.insforge.app/api/storage/buckets/community/objects/wechat-qr-0405.jpg"
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
            <div className="inline-flex items-center gap-3 justify-center mb-6">
              <div className="h-px w-12 bg-gradient-to-r from-transparent to-primary/50" />
              <span className="text-primary text-xs font-semibold tracking-[0.25em] uppercase">
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
              <div className="relative rounded-xl border border-border/50 bg-card overflow-hidden hover-glow h-full">
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
              className="px-4 py-2 rounded-lg bg-card/60 border border-border/50 hover:border-primary/30 transition-colors text-sm text-foreground"
            >
              个股研究
            </Link>
            <Link
              href="/macro/liquidity"
              className="px-4 py-2 rounded-lg bg-card/60 border border-border/50 hover:border-primary/30 transition-colors text-sm text-foreground"
            >
              流动性监控
            </Link>
            <Link
              href="/today/archive"
              className="px-4 py-2 rounded-lg bg-card/60 border border-border/50 hover:border-primary/30 transition-colors text-sm text-muted-foreground hover:text-foreground"
            >
              浏览历史报告
            </Link>
          </div>
        </div>
      </section>
    </main>
  );
}
