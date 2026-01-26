'use client';

import Link from 'next/link';
import SubscribeForm from '@/components/SubscribeForm';

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
              {/* Editorial Style Label */}
              <div className="animate-fade-in-up flex items-center gap-3 mb-6">
                <div className="h-px flex-1 max-w-[60px] bg-gradient-to-r from-primary to-transparent" />
                <span className="text-primary text-xs font-medium tracking-[0.2em] uppercase">Daily Report</span>
              </div>

              {/* Main Headline */}
              <h1 className="animate-fade-in-up delay-100 font-editorial text-4xl md:text-5xl lg:text-6xl text-foreground leading-[1.05] mb-5">
                5 分钟读完市场
                <br />
                <span className="text-gradient-emerald">不再被噪音淹没</span>
              </h1>

              {/* Subtitle */}
              <p className="animate-fade-in-up delay-200 text-base md:text-lg text-muted-foreground max-w-md leading-relaxed mb-6">
                AI 从 5000+ 条新闻中提炼出你需要知道的 5 件事。
                <br className="hidden sm:block" />
                每天一杯咖啡的时间，掌握市场全貌。
              </p>

              {/* Quick Value Points */}
              <div className="animate-fade-in-up delay-300 flex flex-wrap gap-4 mb-2">
                {['AI 智能提炼', '收盘后送达', '完全免费'].map((item, i) => (
                  <div key={i} className="flex items-center gap-1.5 text-sm text-muted-foreground">
                    <svg className="w-4 h-4 text-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                    {item}
                  </div>
                ))}
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
      </section>

      {/* Core Capabilities Section - Data Terminal Aesthetic */}
      <section className="relative py-20 md:py-32 overflow-hidden">
        {/* Subtle grid background */}
        <div className="absolute inset-0 bg-[linear-gradient(rgba(16,185,129,0.03)_1px,transparent_1px),linear-gradient(90deg,rgba(16,185,129,0.03)_1px,transparent_1px)] bg-[size:60px_60px]" />

        <div className="relative max-w-6xl mx-auto px-4 md:px-6">
          {/* Section Header - Editorial Style */}
          <div className="mb-16 md:mb-24">
            <div className="flex items-center gap-3 mb-6">
              <div className="h-px flex-1 max-w-[60px] bg-gradient-to-r from-primary to-transparent" />
              <span className="text-primary text-xs font-medium tracking-[0.2em] uppercase">Features</span>
            </div>
            <h2 className="font-editorial text-4xl md:text-5xl lg:text-6xl text-foreground leading-[1.1]">
              你的信息处理
              <span className="text-gradient-emerald">升级</span>
            </h2>
          </div>

          {/* Feature 1: The Compression Engine - Hero Feature */}
          <div className="mb-20 md:mb-32">
            <div className="grid md:grid-cols-12 gap-8 md:gap-12 items-center">
              {/* Visual - Terminal Style Data Flow */}
              <div className="md:col-span-7 relative">
                <div className="relative rounded-2xl overflow-hidden bg-zinc-100 dark:bg-[#0a0a0a] border border-border shadow-2xl">
                  {/* Terminal Header */}
                  <div className="flex items-center gap-2 px-4 py-3 border-b border-border bg-white/50 dark:bg-card/50">
                    <div className="flex gap-1.5">
                      <div className="w-3 h-3 rounded-full bg-red-500/80" />
                      <div className="w-3 h-3 rounded-full bg-yellow-500/80" />
                      <div className="w-3 h-3 rounded-full bg-green-500/80" />
                    </div>
                    <span className="text-[10px] text-muted-foreground ml-2 font-mono">marketbrew-ai-processor</span>
                  </div>

                  <div className="p-4 md:p-6">
                    {/* Input Section - Raw Data Sources */}
                    <div className="mb-4">
                      <div className="flex items-center gap-2 mb-3">
                        <div className="w-1.5 h-1.5 rounded-full bg-muted-foreground animate-pulse" />
                        <span className="text-[10px] text-muted-foreground uppercase tracking-wider font-mono">Data Sources</span>
                        <span className="text-[10px] text-muted-foreground/60 font-mono ml-auto">5,247 items</span>
                      </div>
                      <div className="grid grid-cols-3 gap-2">
                        {[
                          { name: 'Reuters', count: '1.2K' },
                          { name: 'Bloomberg', count: '890' },
                          { name: 'SEC Filings', count: '156' },
                          { name: 'Fed Data', count: '45' },
                          { name: 'Earnings', count: '78' },
                          { name: 'Social', count: '2.8K' },
                        ].map((source) => (
                          <div key={source.name} className="px-2 py-1.5 rounded bg-white/60 dark:bg-muted/30 border border-border">
                            <p className="text-[9px] text-muted-foreground truncate">{source.name}</p>
                            <p className="font-data text-xs text-foreground">{source.count}</p>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Processing Animation */}
                    <div className="flex items-center justify-center py-4">
                      <div className="flex items-center gap-3">
                        <div className="h-px w-8 bg-gradient-to-r from-transparent to-muted-foreground/30" />
                        <div className="relative">
                          <div className="absolute inset-0 bg-primary/20 blur-xl rounded-full" />
                          <div className="relative w-10 h-10 rounded-xl bg-gradient-to-br from-primary to-emerald-600 flex items-center justify-center">
                            <svg className="w-5 h-5 text-primary-foreground" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                            </svg>
                          </div>
                        </div>
                        <div className="h-px w-8 bg-gradient-to-r from-primary/50 to-transparent" />
                      </div>
                    </div>

                    {/* Output Section - Structured Insights */}
                    <div>
                      <div className="flex items-center gap-2 mb-3">
                        <div className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse" />
                        <span className="text-[10px] text-primary uppercase tracking-wider font-mono">Output</span>
                        <span className="text-[10px] text-primary/60 font-mono ml-auto">5 insights</span>
                      </div>
                      <div className="space-y-2">
                        {[
                          { label: '今日要点', desc: '科技股领涨，通胀数据回落' },
                          { label: '关键信号', desc: 'VIX 跌破 15，风险偏好回升' },
                          { label: '重要新闻', desc: 'Fed 官员释放鸽派信号' },
                          { label: '财报速递', desc: 'NVDA 业绩超预期 12%' },
                          { label: '明日关注', desc: 'CPI 数据 & FOMC 纪要' },
                        ].map((item, idx) => (
                          <div key={item.label} className="flex items-center gap-3 px-3 py-2 rounded-lg bg-primary/10 dark:bg-primary/5 border border-primary/30 dark:border-primary/20">
                            <span className="font-data text-[10px] text-primary w-4">{idx + 1}</span>
                            <div className="w-px h-4 bg-primary/40" />
                            <div className="flex-1 min-w-0">
                              <span className="text-xs text-primary font-medium">{item.label}</span>
                              <span className="text-xs text-foreground/70 ml-2 truncate">{item.desc}</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Content */}
              <div className="md:col-span-5">
                {/* Feature Name Label */}
                <div className="flex items-center gap-3 mb-6">
                  <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-primary/20 to-primary/5 border border-primary/20 flex items-center justify-center">
                    <svg className="w-5 h-5 text-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 20H5a2 2 0 01-2-2V6a2 2 0 012-2h10a2 2 0 012 2v1m2 13a2 2 0 01-2-2V7m2 13a2 2 0 002-2V9a2 2 0 00-2-2h-2m-4-3H9M7 16h6M7 8h6v4H7V8z" />
                    </svg>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground uppercase tracking-wider">Feature</p>
                    <p className="text-sm font-medium text-foreground">每日市场报告</p>
                  </div>
                </div>

                <div className="mb-4">
                  <div className="inline-flex items-center gap-3">
                    <div className="text-center">
                      <span className="font-data text-4xl md:text-5xl font-light text-primary">5000</span>
                      <p className="text-[10px] text-muted-foreground uppercase tracking-wider mt-1">条新闻</p>
                    </div>
                    <svg className="w-6 h-6 text-muted-foreground flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 8l4 4m0 0l-4 4m4-4H3" />
                    </svg>
                    <div className="text-center">
                      <span className="font-data text-4xl md:text-5xl font-light text-foreground">5</span>
                      <p className="text-[10px] text-muted-foreground uppercase tracking-wider mt-1">分钟阅读</p>
                    </div>
                  </div>
                </div>
                <h3 className="text-xl md:text-2xl font-medium text-foreground mb-4">
                  降噪与提取
                </h3>
                <p className="text-muted-foreground leading-relaxed mb-6">
                  每天 5000+ 条新闻、财报、经济数据涌入市场。AI 像你的私人分析师团队，24 小时不停歇地阅读、筛选、提炼——最终只留下最重要的 5 件事。
                </p>
                <div className="flex flex-wrap gap-2">
                  {['新闻聚合', '财报解读', '数据提炼', '因果分析'].map((tag) => (
                    <span key={tag} className="px-3 py-1 text-xs rounded-full bg-muted text-muted-foreground border border-border/50">
                      {tag}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* Feature 2 & 3: Grid Layout */}
          <div className="grid md:grid-cols-2 gap-6 lg:gap-8">
            {/* Feature 2: Personalization */}
            <div className="group relative">
              <div className="absolute inset-0 bg-gradient-to-br from-primary/5 to-transparent rounded-2xl opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
              <div className="relative p-8 rounded-2xl border border-border/50 bg-card/50 hover:border-primary/30 transition-all duration-300">
                {/* Feature Name Label */}
                <div className="flex items-center gap-3 mb-6">
                  <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-primary/20 to-primary/5 border border-primary/20 flex items-center justify-center">
                    <svg className="w-5 h-5 text-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M5.121 17.804A13.937 13.937 0 0112 16c2.5 0 4.847.655 6.879 1.804M15 10a3 3 0 11-6 0 3 3 0 016 0zm6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground uppercase tracking-wider">Feature</p>
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
                <p className="text-sm text-muted-foreground leading-relaxed mb-6">
                  建立你的持仓清单后，每条分析都只针对你关心的股票。不是泛泛而谈的市场评论，而是「这条新闻对你的 $AAPL 意味着什么」。
                </p>

                {/* Mini visualization */}
                <div className="flex items-center gap-2 p-3 rounded-lg bg-muted/50 border border-border/30">
                  <div className="flex -space-x-1">
                    {['AAPL', 'NVDA', 'MSFT'].map((ticker) => (
                      <div key={ticker} className="w-6 h-6 rounded-full bg-primary/20 border-2 border-card flex items-center justify-center">
                        <span className="text-[8px] font-data text-primary">{ticker[0]}</span>
                      </div>
                    ))}
                  </div>
                  <span className="text-xs text-muted-foreground">你的关注列表</span>
                  <svg className="w-4 h-4 text-primary ml-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                </div>
              </div>
            </div>

            {/* Feature 3: One-Stop Research */}
            <div className="group relative">
              <div className="absolute inset-0 bg-gradient-to-br from-primary/5 to-transparent rounded-2xl opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
              <div className="relative p-8 rounded-2xl border border-border/50 bg-card/50 hover:border-primary/30 transition-all duration-300">
                {/* Feature Name Label */}
                <div className="flex items-center gap-3 mb-6">
                  <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-primary/20 to-primary/5 border border-primary/20 flex items-center justify-center">
                    <svg className="w-5 h-5 text-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                    </svg>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground uppercase tracking-wider">Feature</p>
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
                <p className="text-sm text-muted-foreground leading-relaxed mb-6">
                  基本面、技术面、新闻面、AI 分析——所有你做决策需要的信息，整合在一个清晰的页面里。不用在十几个网站间切换。
                </p>

                {/* Mini visualization - Data layers */}
                <div className="space-y-2">
                  {[
                    { label: '基本面', width: '90%' },
                    { label: '技术面', width: '75%' },
                    { label: '新闻面', width: '85%' },
                    { label: 'AI 分析', width: '95%' },
                  ].map((item) => (
                    <div key={item.label} className="flex items-center gap-3">
                      <span className="text-[10px] text-muted-foreground w-12">{item.label}</span>
                      <div className="flex-1 h-1.5 rounded-full bg-muted overflow-hidden">
                        <div
                          className="h-full rounded-full bg-gradient-to-r from-primary to-emerald-400"
                          style={{ width: item.width }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Report Preview Section - Real Email Format */}
      <section className="relative py-20 md:py-28 overflow-hidden">
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

              {/* News Headlines */}
              <div className="px-6 py-4 border-t border-border/30">
                <div className="flex items-center gap-2 mb-3">
                  <div className="w-1 h-4 bg-blue-400 rounded-full"></div>
                  <p className="text-xs font-medium text-blue-400">新闻精选</p>
                </div>
                <div className="space-y-3">
                  <div className="text-xs">
                    <p className="text-foreground font-medium mb-1">Trump signs executive order on AI infrastructure</p>
                    <p className="text-muted-foreground leading-relaxed">特朗普签署 AI 基础设施行政令，利好数据中心和芯片企业...</p>
                  </div>
                  <div className="text-xs">
                    <p className="text-foreground font-medium mb-1">Netflix beats Q4 expectations, stock surges</p>
                    <p className="text-muted-foreground leading-relaxed">Netflix 四季度业绩超预期，订阅用户大幅增长...</p>
                  </div>
                </div>
              </div>

              {/* Upcoming Events */}
              <div className="px-6 py-4 border-t border-border/30">
                <div className="flex items-center gap-2 mb-3">
                  <div className="w-1 h-4 bg-purple-400 rounded-full"></div>
                  <p className="text-xs font-medium text-purple-400">近期事件</p>
                </div>
                <div className="space-y-2 text-xs">
                  <div className="flex items-center gap-2">
                    <span className="text-muted-foreground font-data">01/28</span>
                    <span className="text-foreground">FOMC 利率决议</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-muted-foreground font-data">01/29</span>
                    <span className="text-foreground">MSFT, META 财报</span>
                  </div>
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
