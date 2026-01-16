'use client';

import Link from 'next/link';
import SubscribeForm from '@/components/SubscribeForm';

export default function Home() {
  return (
    <main className="min-h-screen bg-background">
      {/* Hero Section */}
      <section className="relative overflow-hidden">
        {/* Background Effects */}
        <div className="absolute inset-0 bg-gradient-mesh pointer-events-none" />
        <div className="absolute inset-0 bg-dot-pattern pointer-events-none" />
        <div className="absolute inset-0 bg-noise pointer-events-none" />

        <div className="relative max-w-6xl mx-auto px-4 md:px-6 pt-24 pb-20 md:pt-32 md:pb-28">
          <div className="max-w-3xl">
            {/* Brand Philosophy Badge */}
            <div className="animate-fade-in-up inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-primary/10 border border-primary/20 text-primary text-xs font-medium mb-8">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-primary"></span>
              </span>
              拒绝噪音，只要信号
            </div>

            {/* Main Headline - The Core Slogan */}
            <h1 className="animate-fade-in-up delay-100 font-editorial text-5xl md:text-7xl lg:text-8xl text-foreground leading-[0.95] mb-6">
              看清因果
              <br />
              <span className="text-gradient-emerald">才敢下注</span>
            </h1>

            {/* Subtitle - Identity & Value Proposition */}
            <p className="animate-fade-in-up delay-200 text-lg md:text-xl text-muted-foreground max-w-xl leading-relaxed mb-4">
              投资不是算命，是计算概率。
            </p>
            <p className="animate-fade-in-up delay-200 text-base text-muted-foreground/80 max-w-xl leading-relaxed mb-10">
              MarketBrew 用 AI 帮你从海量噪音中提炼信号，让每一次决策都有依据，而非靠猜。
            </p>

            {/* CTA Buttons */}
            <div className="animate-fade-in-up delay-300 flex flex-col sm:flex-row items-start gap-4">
              <a
                href="#subscribe"
                className="group relative px-6 py-3.5 bg-primary text-primary-foreground rounded-lg font-medium text-sm transition-all hover:shadow-lg hover:shadow-primary/25 glow-emerald-sm overflow-hidden"
              >
                <span className="relative z-10 flex items-center gap-2">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                  </svg>
                  订阅每日报告
                </span>
              </a>
              <Link
                href="/today"
                className="px-6 py-3.5 bg-secondary hover:bg-secondary/80 text-foreground rounded-lg font-medium text-sm border border-border hover:border-primary/30 transition-all flex items-center gap-2"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                </svg>
                查看今日分析
              </Link>
            </div>
          </div>
        </div>

        {/* Decorative Line */}
        <div className="divider-fade" />
      </section>

      {/* Us vs. Them Section */}
      <section className="relative py-16 md:py-24 bg-card/30">
        <div className="max-w-6xl mx-auto px-4 md:px-6">
          <div className="text-center mb-12">
            <p className="text-primary text-sm font-medium mb-3 tracking-wide uppercase">为什么不同</p>
            <h2 className="text-2xl md:text-3xl font-medium text-foreground">
              我们不制造焦虑，我们消除焦虑
            </h2>
          </div>

          <div className="grid md:grid-cols-2 gap-6 max-w-4xl mx-auto">
            {/* The Noise - Others */}
            <div className="terminal-card p-6 border-red-500/20 bg-red-500/5">
              <div className="flex items-center gap-2 mb-5">
                <div className="w-8 h-8 rounded-full bg-red-500/10 flex items-center justify-center">
                  <svg className="w-4 h-4 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </div>
                <span className="text-sm font-medium text-red-400">市场上的噪音</span>
              </div>
              <ul className="space-y-3">
                {[
                  '靠直觉喊单，制造 FOMO',
                  '信息过载，让你更焦虑',
                  '把你当流量，而非用户',
                  '只说「买」，不说「为什么」'
                ].map((item, i) => (
                  <li key={i} className="flex items-start gap-3 text-sm text-muted-foreground">
                    <span className="text-red-400/60 mt-0.5">-</span>
                    {item}
                  </li>
                ))}
              </ul>
            </div>

            {/* The Signal - Us */}
            <div className="terminal-card p-6 border-primary/30 bg-primary/5">
              <div className="flex items-center gap-2 mb-5">
                <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
                  <svg className="w-4 h-4 text-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                </div>
                <span className="text-sm font-medium text-primary">MarketBrew 的信号</span>
              </div>
              <ul className="space-y-3">
                {[
                  '靠数据说话，解释因果',
                  '精准提炼，只给你有用的',
                  '把你当合伙人，帮你思考',
                  '告诉你「为什么」，你自己决定'
                ].map((item, i) => (
                  <li key={i} className="flex items-start gap-3 text-sm text-foreground">
                    <svg className="w-4 h-4 text-primary flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                    {item}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </section>

      {/* Value Propositions Section - Editorial Style */}
      <section className="relative py-20 md:py-28">
        <div className="max-w-5xl mx-auto px-4 md:px-6">
          {/* Section Header */}
          <div className="mb-16 md:mb-20">
            <p className="text-primary text-sm font-medium mb-4 tracking-wide">你的武器</p>
            <h2 className="font-editorial text-3xl md:text-4xl lg:text-5xl text-foreground leading-tight">
              像拥有私人情报局
              <br className="hidden md:block" />
              一样做交易
            </h2>
          </div>

          {/* Value Items - Editorial List */}
          <div className="space-y-12 md:space-y-0 md:grid md:grid-cols-12 md:gap-x-8 md:gap-y-16">

            {/* Value 1 */}
            <div className="md:col-span-12 md:grid md:grid-cols-12 md:gap-8 md:items-start group">
              <div className="md:col-span-1">
                <span className="font-data text-5xl md:text-6xl font-light text-primary/20 group-hover:text-primary/40 transition-colors">
                  01
                </span>
              </div>
              <div className="md:col-span-4 mt-2 md:mt-3">
                <h3 className="text-xl md:text-2xl font-medium text-foreground">
                  化噪音为信号
                </h3>
              </div>
              <div className="md:col-span-7 mt-3 md:mt-3">
                <p className="text-muted-foreground leading-relaxed">
                  每天有几千条新闻、几百份财报、无数个大 V 的观点。AI 替你阅读这一切，从几万字中提炼出关键逻辑。原本需要一个团队一天做的事，压缩成一杯咖啡的时间。
                </p>
              </div>
            </div>

            {/* Divider */}
            <div className="hidden md:block md:col-span-12">
              <div className="h-px bg-border/50" />
            </div>

            {/* Value 2 */}
            <div className="md:col-span-12 md:grid md:grid-cols-12 md:gap-8 md:items-start group">
              <div className="md:col-span-1">
                <span className="font-data text-5xl md:text-6xl font-light text-primary/20 group-hover:text-primary/40 transition-colors">
                  02
                </span>
              </div>
              <div className="md:col-span-4 mt-2 md:mt-3">
                <h3 className="text-xl md:text-2xl font-medium text-foreground">
                  看清胜率
                </h3>
              </div>
              <div className="md:col-span-7 mt-3 md:mt-3">
                <p className="text-muted-foreground leading-relaxed">
                  我们不负责预测未来，也不会告诉你「明天必涨」。我们帮你看清所有支持和反对的理由。当你下单时，底气来自于你清楚地知道风险在哪、机会在哪。
                </p>
              </div>
            </div>

            {/* Divider */}
            <div className="hidden md:block md:col-span-12">
              <div className="h-px bg-border/50" />
            </div>

            {/* Value 3 */}
            <div className="md:col-span-12 md:grid md:grid-cols-12 md:gap-8 md:items-start group">
              <div className="md:col-span-1">
                <span className="font-data text-5xl md:text-6xl font-light text-primary/20 group-hover:text-primary/40 transition-colors">
                  03
                </span>
              </div>
              <div className="md:col-span-4 mt-2 md:mt-3">
                <h3 className="text-xl md:text-2xl font-medium text-foreground">
                  只看与你有关的
                </h3>
              </div>
              <div className="md:col-span-7 mt-3 md:mt-3">
                <p className="text-muted-foreground leading-relaxed">
                  建立你的关注列表，获取只对你持仓有影响的分析。不是一份「新闻列表」让你自己去猜，而是直接告诉你「这条新闻和你的 $AAPL 有什么关系」。
                </p>
              </div>
            </div>

          </div>
        </div>
      </section>

      {/* Philosophy Quote Section */}
      <section className="relative py-16 md:py-24 bg-gradient-mesh overflow-hidden">
        <div className="absolute inset-0 bg-dot-pattern pointer-events-none" />
        <div className="absolute inset-0 bg-noise pointer-events-none" />
        <div className="relative max-w-4xl mx-auto px-4 md:px-6 text-center">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-primary/10 border border-primary/20 mb-6">
            <svg className="w-6 h-6 text-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
            </svg>
          </div>
          <blockquote className="font-editorial text-3xl md:text-4xl lg:text-5xl text-foreground leading-tight mb-6">
            &ldquo;在充满噪音的世界里，
            <br />
            <span className="text-gradient-emerald">清晰是唯一的 Alpha。</span>&rdquo;
          </blockquote>
          <p className="text-muted-foreground max-w-2xl mx-auto leading-relaxed">
            我们不提供「内幕消息」，我们提供「决策证据」。
            当你下单的那一刻，你的底气不是来自于「听说了什么」，而是来自于你清晰地看见了所有支持和反对的理由。
          </p>
        </div>
      </section>

      {/* How It Works Section */}
      <section className="relative py-20 md:py-28 bg-card/50">
        <div className="max-w-6xl mx-auto px-4 md:px-6">
          {/* Section Header */}
          <div className="text-center mb-16">
            <p className="text-primary text-sm font-medium mb-3 tracking-wide uppercase">工作流程</p>
            <h2 className="text-3xl md:text-4xl font-medium text-foreground mb-4">
              你的超级大脑，如何运作
            </h2>
            <p className="text-muted-foreground max-w-lg mx-auto">
              从海量市场数据到一杯咖啡时间的清晰洞察。
            </p>
          </div>

          {/* Timeline Steps */}
          <div className="relative">
            {/* Connection Line */}
            <div className="hidden md:block absolute top-8 left-0 right-0 h-px bg-border" />

            <div className="grid grid-cols-2 md:grid-cols-4 gap-8">
              {/* Step 1 */}
              <div className="relative text-center">
                <div className="w-16 h-16 rounded-full bg-muted border border-border flex items-center justify-center mx-auto mb-4 text-muted-foreground font-data text-lg relative z-10">
                  01
                </div>
                <h3 className="font-medium text-foreground mb-2">吞噬数据</h3>
                <p className="text-xs text-muted-foreground">
                  5000+ 条新闻、实时行情、经济指标
                </p>
              </div>

              {/* Step 2 - Highlighted */}
              <div className="relative text-center">
                <div className="w-16 h-16 rounded-full bg-primary/10 border border-primary/30 flex items-center justify-center mx-auto mb-4 text-primary font-data text-lg relative z-10">
                  02
                </div>
                <h3 className="font-medium text-foreground mb-2">AI 提炼</h3>
                <p className="text-xs text-muted-foreground">
                  分离噪音与信号，构建因果链条
                </p>
              </div>

              {/* Step 3 */}
              <div className="relative text-center">
                <div className="w-16 h-16 rounded-full bg-muted border border-border flex items-center justify-center mx-auto mb-4 text-muted-foreground font-data text-lg relative z-10">
                  03
                </div>
                <h3 className="font-medium text-foreground mb-2">生成洞察</h3>
                <p className="text-xs text-muted-foreground">
                  解释「为什么」，而非只说「是什么」
                </p>
              </div>

              {/* Step 4 - Final */}
              <div className="relative text-center">
                <div className="w-16 h-16 rounded-full bg-primary flex items-center justify-center mx-auto mb-4 text-primary-foreground font-data text-lg glow-emerald-sm relative z-10">
                  04
                </div>
                <h3 className="font-medium text-foreground mb-2">送达你</h3>
                <p className="text-xs text-muted-foreground">
                  收盘后送达，一杯咖啡的阅读量
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Report Preview Section */}
      <section className="relative py-20 md:py-28">
        <div className="max-w-6xl mx-auto px-4 md:px-6">
          <div className="grid md:grid-cols-2 gap-12 lg:gap-16 items-center">
            {/* Left - Content */}
            <div className="space-y-6">
              <p className="text-primary text-sm font-medium tracking-wide uppercase">报告预览</p>
              <h2 className="text-3xl md:text-4xl font-medium text-foreground">
                帮你思考，而非替你决定
              </h2>
              <p className="text-muted-foreground leading-relaxed">
                每份报告都旨在帮助你理解市场叙事，建立自己的判断框架。
                我们提供证据和逻辑，决策权始终在你手中。
              </p>
              <ul className="space-y-4 pt-2">
                {[
                  '市场主线：今天的核心叙事是什么',
                  '宏观信号：VIX、国债、美元在说什么',
                  '新闻解读：不只是发生了什么，更是为什么重要',
                  '前瞻日历：下周要关注什么，不同情景会怎样'
                ].map((item, i) => (
                  <li key={i} className="flex items-start gap-3">
                    <div className="w-5 h-5 rounded-full bg-primary/20 flex items-center justify-center mt-0.5 flex-shrink-0">
                      <svg className="w-3 h-3 text-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                      </svg>
                    </div>
                    <span className="text-foreground text-sm">{item}</span>
                  </li>
                ))}
              </ul>
            </div>

            {/* Right - Preview Card */}
            <div className="terminal-card p-6">
              {/* Card Header */}
              <div className="flex items-center gap-3 mb-6">
                <div className="w-10 h-10 rounded-lg bg-primary flex items-center justify-center glow-emerald-sm">
                  <svg className="w-5 h-5 text-primary-foreground" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">每日报告</p>
                  <p className="font-medium text-foreground text-sm">2025年1月15日</p>
                </div>
              </div>

              {/* Market Thesis */}
              <div className="p-4 rounded-lg bg-primary/5 border border-primary/10 mb-4">
                <p className="text-xs text-primary font-medium mb-1.5">今日主线</p>
                <p className="text-sm text-foreground/90">通胀数据超预期回落，市场重新定价降息路径，科技股领涨...</p>
              </div>

              {/* Key Metrics */}
              <div className="space-y-3 p-4 rounded-lg bg-muted/50 mb-4">
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground text-sm">VIX 恐慌指数</span>
                  <span className="font-data text-sm text-foreground">14.2 <span className="text-primary">-8.3%</span></span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground text-sm">10Y 国债</span>
                  <span className="font-data text-sm text-foreground">4.18% <span className="text-primary">-5bp</span></span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground text-sm">美元指数</span>
                  <span className="font-data text-sm text-foreground">103.5 <span className="text-red-400">-0.4%</span></span>
                </div>
              </div>

              {/* Analysis snippet */}
              <div className="pt-4 border-t border-border">
                <p className="text-xs text-muted-foreground mb-2">为什么重要</p>
                <p className="text-sm text-foreground">VIX 跌破 15 进入「平静区」，通常意味着...</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Newsletter Subscribe Section */}
      <section id="subscribe" className="relative py-20 md:py-28 bg-gradient-mesh scroll-mt-16">
        <div className="absolute inset-0 bg-noise pointer-events-none" />
        <div className="relative max-w-6xl mx-auto px-4 md:px-6">
          <div className="grid md:grid-cols-2 gap-12 lg:gap-16 items-center">
            {/* Left - Content */}
            <div className="space-y-6">
              <p className="text-primary text-sm font-medium tracking-wide uppercase">加入我们</p>
              <h2 className="text-3xl md:text-4xl font-medium text-foreground">
                从明天开始，清醒地交易
              </h2>
              <p className="text-muted-foreground leading-relaxed">
                每天收盘后，让 AI 替你复盘市场，然后只告诉你最重要的事。
                你要做的，只是带着清晰的头脑规划明天。
              </p>
              <ul className="space-y-3 pt-2">
                {[
                  '每日 AI 生成的市场分析',
                  '收盘后送达，一杯咖啡读完',
                  '随时可取消，没有任何套路'
                ].map((item, i) => (
                  <li key={i} className="flex items-center gap-3 text-foreground text-sm">
                    <svg className="w-4 h-4 text-primary flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                    {item}
                  </li>
                ))}
              </ul>
            </div>

            {/* Right - Subscribe Form */}
            <SubscribeForm variant="card" />
          </div>
        </div>
      </section>

      {/* Final CTA Section */}
      <section className="relative py-20 md:py-28">
        <div className="max-w-6xl mx-auto px-4 md:px-6">
          <div className="text-center max-w-2xl mx-auto space-y-6">
            <p className="text-primary text-sm font-medium tracking-wide uppercase">开始行动</p>
            <h2 className="font-editorial text-4xl md:text-5xl text-foreground">
              停止被噪音淹没
            </h2>
            <p className="text-muted-foreground text-lg max-w-xl mx-auto">
              从今天的报告开始，体验什么是「化噪音为信号」。完全免费，不需要注册。
            </p>
            <div className="flex flex-col sm:flex-row items-center justify-center gap-4 pt-4">
              <Link
                href="/today"
                className="px-8 py-4 bg-primary text-primary-foreground rounded-lg font-medium transition-all hover:shadow-lg hover:shadow-primary/25 glow-emerald-sm"
              >
                阅读今日报告
              </Link>
              <Link
                href="/today/archive"
                className="px-8 py-4 text-muted-foreground hover:text-foreground rounded-lg font-medium transition-all hover:bg-muted"
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
