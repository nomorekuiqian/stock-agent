'use client';

import Link from 'next/link';
import SubscribeForm from '@/components/SubscribeForm';
import LogoMarquee from '@/components/LogoMarquee';

export default function Home() {
  return (
    <main className="min-h-screen bg-background">
      {/* Hero Section - with embedded subscribe form */}
      <section className="relative overflow-hidden">
        {/* Background Effects */}
        <div className="absolute inset-0 bg-gradient-mesh pointer-events-none" />
        <div className="absolute inset-0 bg-dot-pattern pointer-events-none" />
        <div className="absolute inset-0 bg-noise pointer-events-none" />

        <div className="relative max-w-6xl mx-auto px-4 md:px-6 pt-20 pb-16 md:pt-28 md:pb-24">
          <div className="grid md:grid-cols-2 gap-12 lg:gap-16 items-center">
            {/* Left - Content */}
            <div>
              {/* Product Positioning Tag */}
              <div className="animate-fade-in-up flex items-center gap-3 mb-6">
                <div className="h-px flex-1 max-w-[60px] bg-gradient-to-r from-primary to-transparent" />
                <span className="text-primary text-xs font-medium tracking-[0.2em] uppercase">美股 AI 投资助理</span>
              </div>

              {/* Main Headline - Clear Value Proposition */}
              <h1 className="animate-fade-in-up delay-100 font-editorial text-4xl md:text-5xl lg:text-6xl text-foreground leading-[1.05] mb-5">
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
                {['AI 智能提炼', '收盘后送达', '完全免费'].map((item, i) => (
                  <div key={i} className="flex items-center gap-1.5 text-sm text-muted-foreground">
                    <svg className="w-4 h-4 text-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
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
                      <span className="text-[8px] text-primary/70 font-medium">
                        {['K', 'J', 'M'][i]}
                      </span>
                    </div>
                  ))}
                </div>
                <span className="text-xs text-muted-foreground">
                  已为 <span className="text-foreground font-medium">100+</span> 投资者提供服务
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
                  <svg className="w-4 h-4 transition-transform group-hover:translate-x-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
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

        {/* Decorative Line */}
        <div className="divider-fade" />

        {/* Logo Marquee - Data Sources */}
        <div className="relative py-8 bg-muted/20">
          <div className="max-w-6xl mx-auto px-4 md:px-6">
            <div className="flex items-center justify-center gap-6 mb-4">
              <div className="h-px flex-1 max-w-[100px] bg-gradient-to-r from-transparent to-border/50" />
              <span className="text-[10px] text-muted-foreground/50 uppercase tracking-[0.2em]">Data Sources</span>
              <div className="h-px flex-1 max-w-[100px] bg-gradient-to-l from-transparent to-border/50" />
            </div>
          </div>
          <LogoMarquee speed="slow" />
        </div>
      </section>

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
                <span className="text-primary text-xs font-medium tracking-[0.2em] uppercase">Preview</span>
              </div>
              <h2 className="font-editorial text-3xl md:text-4xl text-foreground">
                真实邮件长这样
              </h2>
              <p className="text-muted-foreground leading-relaxed">
                每份报告包含你需要了解的所有市场信息，结构清晰，一目了然。
              </p>
              <ul className="space-y-4 pt-2">
                {[
                  { icon: 'chart', text: '市场指数：一眼看清大盘走势' },
                  { icon: 'bulb', text: '今日要点：当日核心叙事' },
                  { icon: 'signal', text: '关键信号：VIX、国债、美元在说什么' },
                  { icon: 'news', text: '新闻精选：重要头条 + 深度解读' },
                  { icon: 'calendar', text: '近期事件：不错过任何重要日程' },
                  { icon: 'eye', text: '总结展望：明天要关注什么' }
                ].map((item, i) => (
                  <li key={i} className="flex items-start gap-3">
                    <div className="w-5 h-5 rounded-full bg-primary/20 flex items-center justify-center mt-0.5 flex-shrink-0">
                      <svg className="w-3 h-3 text-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
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
                      <span className="text-primary-foreground font-bold text-sm">M</span>
                    </div>
                    <div>
                      <p className="text-xs text-primary font-medium tracking-wider">THEMARKETBREW</p>
                      <p className="text-[10px] text-muted-foreground">每日市场报告</p>
                    </div>
                  </div>
                  <p className="text-xs text-muted-foreground font-data">2025-01-24</p>
                </div>
              </div>

              {/* Market Indices Grid */}
              <div className="px-6 py-4 bg-card/50">
                <p className="text-xs text-muted-foreground mb-3 font-medium">市场指数</p>
                <div className="grid grid-cols-3 gap-3">
                  {[
                    { name: 'S&P 500', value: '6,118.71', change: '+0.53%', up: true },
                    { name: 'Nasdaq', value: '20,053.68', change: '+0.22%', up: true },
                    { name: '10Y Treasury', value: '4.63%', change: '+2bp', up: false },
                    { name: 'VIX', value: '14.85', change: '-5.2%', up: true },
                    { name: 'Gold', value: '$2,758', change: '+0.8%', up: true },
                    { name: 'US Dollar', value: '107.95', change: '-0.3%', up: true }
                  ].map((item, i) => (
                    <div key={i} className="bg-muted/30 rounded px-2.5 py-2">
                      <p className="text-[10px] text-muted-foreground truncate">{item.name}</p>
                      <p className="font-data text-xs text-foreground">{item.value}</p>
                      <p className={`font-data text-[10px] ${item.up ? 'text-primary' : 'text-red-400'}`}>{item.change}</p>
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
                  科技股带领市场收涨，投资者消化特朗普关税政策影响。Nvidia 领涨芯片板块，市场情绪回暖但仍需关注下周财报季...
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
                    { signal: 'VIX 跌破 15 进入「平静区」', implication: '市场恐慌情绪消退' },
                    { signal: '10Y 国债小幅上行', implication: '降息预期略有降温' }
                  ].map((item, i) => (
                    <div key={i} className="flex items-start gap-2 text-xs">
                      <span className="text-muted-foreground">-</span>
                      <div>
                        <span className="text-foreground">{item.signal}</span>
                        <span className="text-muted-foreground"> - {item.implication}</span>
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
                  <p className="text-foreground font-medium mb-1">Trump signs executive order on AI infrastructure</p>
                  <p className="text-muted-foreground leading-relaxed">特朗普签署 AI 基础设施行政令，利好数据中心和芯片企业...</p>
                </div>
              </div>

              {/* Outlook */}
              <div className="px-6 py-4 border-t border-border/30 bg-primary/5">
                <div className="flex items-center gap-2 mb-2">
                  <div className="w-1 h-4 bg-primary rounded-full"></div>
                  <p className="text-xs font-medium text-primary">总结展望</p>
                </div>
                <p className="text-xs text-foreground/80 leading-relaxed">
                  短期关注财报季表现和 FOMC 会议，技术面看好但需警惕获利回吐压力...
                </p>
              </div>

              {/* Footer hint */}
              <div className="px-6 py-3 bg-muted/20 border-t border-border/30">
                <p className="text-[10px] text-muted-foreground text-center">
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
              <span className="text-primary text-xs font-medium tracking-[0.2em] uppercase">Features</span>
            </div>
            <h2 className="font-editorial text-4xl md:text-5xl lg:text-6xl text-foreground leading-[1.1]">
              三大核心功能
            </h2>
          </div>

          {/* Feature 1: Daily Report - Simplified Hero */}
          <Link href="/today" className="block mb-8 group">
            <div className="relative p-8 md:p-10 rounded-2xl border border-border/50 bg-card/50 hover:border-primary/40 transition-all duration-300 hover:shadow-lg hover:shadow-primary/5">
              <div className="grid md:grid-cols-2 gap-8 items-center">
                {/* Left - Content */}
                <div>
                  <div className="flex items-center gap-3 mb-6">
                    <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-primary/20 to-primary/5 border border-primary/20 flex items-center justify-center">
                      <svg className="w-6 h-6 text-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 20H5a2 2 0 01-2-2V6a2 2 0 012-2h10a2 2 0 012 2v1m2 13a2 2 0 01-2-2V7m2 13a2 2 0 002-2V9a2 2 0 00-2-2h-2m-4-3H9M7 16h6M7 8h6v4H7V8z" />
                      </svg>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground uppercase tracking-wider">核心功能</p>
                      <p className="text-lg font-medium text-foreground">每日市场报告</p>
                    </div>
                  </div>

                  <h3 className="text-2xl md:text-3xl font-medium text-foreground mb-4">
                    5000+ 条新闻 <span className="text-primary">→</span> 5 分钟阅读
                  </h3>
                  <p className="text-muted-foreground leading-relaxed mb-6">
                    AI 帮你从海量信息中提炼当日要点、关键信号、重要新闻。每个交易日收盘后自动生成，让你用最短时间掌握市场全貌。
                  </p>

                  <div className="inline-flex items-center gap-2 px-5 py-2.5 bg-primary text-primary-foreground rounded-lg font-medium text-sm group-hover:shadow-lg group-hover:shadow-primary/25 transition-all">
                    查看今日日报
                    <svg className="w-4 h-4 transition-transform group-hover:translate-x-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                    </svg>
                  </div>
                </div>

                {/* Right - Simple Visual */}
                <div className="hidden md:block">
                  <div className="space-y-3">
                    {[
                      { label: '今日要点', color: 'bg-primary' },
                      { label: '关键信号', color: 'bg-amber-400' },
                      { label: '新闻精选', color: 'bg-blue-400' },
                      { label: '近期事件', color: 'bg-purple-400' },
                      { label: '总结展望', color: 'bg-primary' },
                    ].map((item, idx) => (
                      <div key={item.label} className="flex items-center gap-3 px-4 py-3 rounded-lg bg-muted/30 border border-border/30">
                        <div className={`w-1 h-6 ${item.color} rounded-full`} />
                        <span className="text-sm text-foreground">{item.label}</span>
                        <div className="flex-1 h-2 rounded-full bg-muted overflow-hidden ml-auto max-w-[120px]">
                          <div className={`h-full ${item.color} rounded-full`} style={{ width: `${85 - idx * 10}%` }} />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </Link>

          {/* Feature 2 & 3: Grid Layout */}
          <div className="grid md:grid-cols-2 gap-6 lg:gap-8">
            {/* Feature 2: Personalization */}
            <Link href="/for-you" className="group relative h-full block">
              <div className="absolute inset-0 bg-gradient-to-br from-primary/5 to-transparent rounded-2xl opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
              <div className="relative p-8 rounded-2xl border border-border/50 bg-card/50 hover:border-primary/40 transition-all duration-300 h-full flex flex-col">
                {/* Feature Name Label */}
                <div className="flex items-center gap-3 mb-6">
                  <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-primary/20 to-primary/5 border border-primary/20 flex items-center justify-center">
                    <svg className="w-5 h-5 text-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M5.121 17.804A13.937 13.937 0 0112 16c2.5 0 4.847.655 6.879 1.804M15 10a3 3 0 11-6 0 3 3 0 016 0zm6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground uppercase tracking-wider">功能</p>
                    <p className="text-sm font-medium text-foreground">个性化日报</p>
                  </div>
                </div>

                {/* Big Number */}
                <div className="mb-3">
                  <span className="font-data text-5xl font-light text-primary">100</span>
                  <span className="font-data text-3xl text-primary/60">%</span>
                  <span className="text-lg text-muted-foreground ml-2">与你相关</span>
                </div>

                <h3 className="text-lg font-medium text-foreground mb-3">
                  只看你关心的
                </h3>
                <p className="text-sm text-muted-foreground leading-relaxed mb-6 flex-grow">
                  添加你的持仓清单，获得只针对你关心股票的分析。不是泛泛而谈，而是「这条新闻对你的 $AAPL 意味着什么」。
                </p>

                {/* CTA Button */}
                <div className="flex items-center justify-between p-3 rounded-lg bg-muted/50 border border-border/30 mt-auto group-hover:border-primary/30 transition-colors">
                  <div className="flex items-center gap-2">
                    <div className="flex -space-x-1">
                      {['AAPL', 'NVDA', 'MSFT'].map((ticker) => (
                        <div key={ticker} className="w-6 h-6 rounded-full bg-primary/20 border-2 border-card flex items-center justify-center">
                          <span className="text-[8px] font-data text-primary">{ticker[0]}</span>
                        </div>
                      ))}
                    </div>
                    <span className="text-xs text-muted-foreground">创建关注列表</span>
                  </div>
                  <svg className="w-4 h-4 text-primary transition-transform group-hover:translate-x-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                </div>
              </div>
            </Link>

            {/* Feature 3: One-Stop Research */}
            <Link href="/stock" className="group relative h-full block">
              <div className="absolute inset-0 bg-gradient-to-br from-primary/5 to-transparent rounded-2xl opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
              <div className="relative p-8 rounded-2xl border border-border/50 bg-card/50 hover:border-primary/40 transition-all duration-300 h-full flex flex-col">
                {/* Feature Name Label */}
                <div className="flex items-center gap-3 mb-6">
                  <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-primary/20 to-primary/5 border border-primary/20 flex items-center justify-center">
                    <svg className="w-5 h-5 text-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                    </svg>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground uppercase tracking-wider">功能</p>
                    <p className="text-sm font-medium text-foreground">个股投研</p>
                  </div>
                </div>

                {/* Big Number */}
                <div className="mb-3">
                  <span className="font-data text-5xl font-light text-primary">1</span>
                  <span className="text-2xl text-muted-foreground ml-2">页看透</span>
                </div>

                <h3 className="text-lg font-medium text-foreground mb-3">
                  一站式股票分析
                </h3>
                <p className="text-sm text-muted-foreground leading-relaxed mb-6 flex-grow">
                  基本面、技术面、新闻面、AI 分析——所有你做决策需要的信息，整合在一个清晰的页面里。
                </p>

                {/* CTA Button */}
                <div className="flex items-center justify-between p-3 rounded-lg bg-muted/50 border border-border/30 mt-auto group-hover:border-primary/30 transition-colors">
                  <span className="text-xs text-muted-foreground">搜索任意美股</span>
                  <svg className="w-4 h-4 text-primary transition-transform group-hover:translate-x-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                </div>
              </div>
            </Link>
          </div>
        </div>
      </section>

      {/* Quick Start Guide Section */}
      <section className="relative py-20 md:py-28 overflow-hidden">
        <div className="absolute inset-0 bg-muted/30" />
        <div className="absolute inset-0 bg-[linear-gradient(rgba(16,185,129,0.02)_1px,transparent_1px),linear-gradient(90deg,rgba(16,185,129,0.02)_1px,transparent_1px)] bg-[size:60px_60px]" />

        <div className="relative max-w-6xl mx-auto px-4 md:px-6">
          {/* Section Header */}
          <div className="text-center mb-12 md:mb-16">
            <div className="inline-flex items-center gap-3 mb-6">
              <div className="h-px w-12 bg-gradient-to-r from-transparent to-primary/50" />
              <span className="text-primary text-xs font-medium tracking-[0.2em] uppercase">Quick Start</span>
              <div className="h-px w-12 bg-gradient-to-r from-primary/50 to-transparent" />
            </div>
            <h2 className="font-editorial text-3xl md:text-4xl lg:text-5xl text-foreground mb-4">
              3 步开始使用
            </h2>
            <p className="text-muted-foreground max-w-lg mx-auto">
              所有功能完全免费，现在就开始你的智能投资之旅
            </p>
          </div>

          {/* Steps */}
          <div className="grid md:grid-cols-3 gap-6 lg:gap-8 mb-12">
            {/* Step 1 */}
            <div className="relative group">
              <div className="absolute -inset-px bg-gradient-to-b from-primary/20 to-transparent rounded-2xl opacity-0 group-hover:opacity-100 transition-opacity" />
              <div className="relative p-6 md:p-8 rounded-2xl border border-border bg-card h-full">
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-10 h-10 rounded-full bg-primary/10 border border-primary/20 flex items-center justify-center">
                    <span className="font-data text-lg text-primary">1</span>
                  </div>
                  <span className="text-xs text-primary font-medium px-2 py-0.5 rounded-full bg-primary/10">免费</span>
                </div>
                <h3 className="text-lg font-medium text-foreground mb-2">阅读今日日报</h3>
                <p className="text-sm text-muted-foreground mb-4 leading-relaxed">
                  每天 5 分钟，了解市场全貌。无需注册，直接阅读。
                </p>
                <Link
                  href="/today"
                  className="inline-flex items-center gap-2 text-sm text-primary hover:text-primary/80 transition-colors"
                >
                  查看今日日报
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                </Link>
              </div>
            </div>

            {/* Step 2 */}
            <div className="relative group">
              <div className="absolute -inset-px bg-gradient-to-b from-primary/20 to-transparent rounded-2xl opacity-0 group-hover:opacity-100 transition-opacity" />
              <div className="relative p-6 md:p-8 rounded-2xl border border-border bg-card h-full">
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-10 h-10 rounded-full bg-primary/10 border border-primary/20 flex items-center justify-center">
                    <span className="font-data text-lg text-primary">2</span>
                  </div>
                  <span className="text-xs text-muted-foreground font-medium px-2 py-0.5 rounded-full bg-muted">需登录</span>
                </div>
                <h3 className="text-lg font-medium text-foreground mb-2">订阅邮件推送</h3>
                <p className="text-sm text-muted-foreground mb-4 leading-relaxed">
                  每个交易日收盘后，日报自动发送到你的邮箱。
                </p>
                <Link
                  href="/login"
                  className="inline-flex items-center gap-2 text-sm text-primary hover:text-primary/80 transition-colors"
                >
                  登录后订阅
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                </Link>
              </div>
            </div>

            {/* Step 3 */}
            <div className="relative group">
              <div className="absolute -inset-px bg-gradient-to-b from-primary/20 to-transparent rounded-2xl opacity-0 group-hover:opacity-100 transition-opacity" />
              <div className="relative p-6 md:p-8 rounded-2xl border border-border bg-card h-full">
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-10 h-10 rounded-full bg-primary/10 border border-primary/20 flex items-center justify-center">
                    <span className="font-data text-lg text-primary">3</span>
                  </div>
                  <span className="text-xs text-muted-foreground font-medium px-2 py-0.5 rounded-full bg-muted">需登录</span>
                </div>
                <h3 className="text-lg font-medium text-foreground mb-2">创建专属日报</h3>
                <p className="text-sm text-muted-foreground mb-4 leading-relaxed">
                  添加你关注的股票，获得 100% 与你相关的个性化分析。
                </p>
                <Link
                  href="/for-you"
                  className="inline-flex items-center gap-2 text-sm text-primary hover:text-primary/80 transition-colors"
                >
                  创建关注列表
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                </Link>
              </div>
            </div>
          </div>

          {/* More Tools */}
          <div className="text-center">
            <p className="text-sm text-muted-foreground mb-4">更多功能</p>
            <div className="inline-flex flex-wrap justify-center gap-3">
              <Link
                href="/stock"
                className="px-4 py-2 rounded-lg bg-card border border-border hover:border-primary/30 transition-colors text-sm text-foreground"
              >
                个股研究
              </Link>
              <Link
                href="/tools/liquidity"
                className="px-4 py-2 rounded-lg bg-card border border-border hover:border-primary/30 transition-colors text-sm text-foreground"
              >
                流动性监控
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* Final CTA Section - Simplified */}
      <section className="relative py-16 md:py-24 bg-gradient-mesh overflow-hidden">
        <div className="absolute inset-0 bg-[linear-gradient(rgba(16,185,129,0.03)_1px,transparent_1px),linear-gradient(90deg,rgba(16,185,129,0.03)_1px,transparent_1px)] bg-[size:60px_60px]" />
        <div className="absolute inset-0 bg-noise pointer-events-none" />
        <div className="relative max-w-6xl mx-auto px-4 md:px-6">
          <div className="text-center max-w-2xl mx-auto space-y-6">
            <div className="inline-flex items-center gap-3 justify-center">
              <div className="h-px w-12 bg-gradient-to-r from-transparent to-primary/50" />
              <span className="text-primary text-xs font-medium tracking-[0.2em] uppercase">Get Started</span>
              <div className="h-px w-12 bg-gradient-to-r from-primary/50 to-transparent" />
            </div>
            <h2 className="font-editorial text-3xl md:text-4xl text-foreground">
              从今天开始，清醒地交易
            </h2>
            <p className="text-muted-foreground max-w-xl mx-auto">
              每天收盘后，让 AI 替你复盘市场。你要做的，只是带着清晰的头脑规划明天。
            </p>
            <div className="flex flex-col sm:flex-row items-center justify-center gap-4 pt-2">
              <Link
                href="/today"
                className="px-8 py-3.5 bg-primary text-primary-foreground rounded-lg font-medium transition-all hover:shadow-lg hover:shadow-primary/25 glow-emerald-sm"
              >
                阅读今日报告
              </Link>
              <Link
                href="/today/archive"
                className="px-8 py-3.5 text-muted-foreground hover:text-foreground rounded-lg font-medium transition-all hover:bg-muted"
              >
                浏览历史报告
              </Link>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}
