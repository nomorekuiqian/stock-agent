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
            {/* Live Badge */}
            <div className="animate-fade-in-up inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-primary/10 border border-primary/20 text-primary text-xs font-medium mb-8">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-primary"></span>
              </span>
              AI-Powered Market Intelligence
            </div>

            {/* Main Headline - Editorial Style */}
            <h1 className="animate-fade-in-up delay-100 font-editorial text-5xl md:text-7xl lg:text-8xl text-foreground leading-[0.95] mb-6">
              Understand
              <br />
              <span className="text-gradient-emerald">Markets</span>,
              <br />
              Not Just Data
            </h1>

            {/* Subtitle */}
            <p className="animate-fade-in-up delay-200 text-lg md:text-xl text-muted-foreground max-w-xl leading-relaxed mb-10">
              Daily AI-generated market analysis that explains the &quot;why&quot; behind movements.
              Built for investors who want insights, not noise.
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
                  Subscribe to Daily Reports
                </span>
              </a>
              <Link
                href="/today"
                className="px-6 py-3.5 bg-secondary hover:bg-secondary/80 text-foreground rounded-lg font-medium text-sm border border-border hover:border-primary/30 transition-all flex items-center gap-2"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                </svg>
                View Today&apos;s Analysis
              </Link>
            </div>
          </div>
        </div>

        {/* Decorative Line */}
        <div className="divider-fade" />
      </section>

      {/* Features Section */}
      <section className="relative py-20 md:py-28">
        <div className="max-w-6xl mx-auto px-4 md:px-6">
          {/* Section Header */}
          <div className="max-w-xl mb-16">
            <p className="text-primary text-sm font-medium mb-3 tracking-wide uppercase">Features</p>
            <h2 className="text-3xl md:text-4xl font-medium text-foreground mb-4">
              What You Get
            </h2>
            <p className="text-muted-foreground">
              Professional-grade market intelligence, delivered daily to your inbox.
            </p>
          </div>

          {/* Feature Cards */}
          <div className="grid md:grid-cols-3 gap-6">
            {/* Feature 1 */}
            <div className="group terminal-card p-6 hover-glow transition-all">
              <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center mb-5 group-hover:glow-emerald-sm transition-all">
                <svg className="w-5 h-5 text-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                </svg>
              </div>
              <h3 className="font-medium text-foreground mb-2">AI-Powered Insights</h3>
              <p className="text-sm text-muted-foreground leading-relaxed">
                Not just what happened, but why it matters. Our AI explains market movements with cause-and-effect analysis.
              </p>
            </div>

            {/* Feature 2 */}
            <div className="group terminal-card p-6 hover-glow transition-all">
              <div className="w-10 h-10 rounded-lg bg-blue-500/10 flex items-center justify-center mb-5">
                <svg className="w-5 h-5 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
              </div>
              <h3 className="font-medium text-foreground mb-2">Forward-Looking Calendar</h3>
              <p className="text-sm text-muted-foreground leading-relaxed">
                Know what&apos;s coming. Economic events and earnings with scenario analysis for different outcomes.
              </p>
            </div>

            {/* Feature 3 */}
            <div className="group terminal-card p-6 hover-glow transition-all">
              <div className="w-10 h-10 rounded-lg bg-purple-500/10 flex items-center justify-center mb-5">
                <svg className="w-5 h-5 text-purple-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z" />
                </svg>
              </div>
              <h3 className="font-medium text-foreground mb-2">Personalized Digest</h3>
              <p className="text-sm text-muted-foreground leading-relaxed">
                Build your watchlist and get analysis tailored to the stocks you care about most.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* How It Works Section */}
      <section className="relative py-20 md:py-28 bg-card/50">
        <div className="max-w-6xl mx-auto px-4 md:px-6">
          {/* Section Header */}
          <div className="text-center mb-16">
            <p className="text-primary text-sm font-medium mb-3 tracking-wide uppercase">Process</p>
            <h2 className="text-3xl md:text-4xl font-medium text-foreground mb-4">
              How It Works
            </h2>
            <p className="text-muted-foreground max-w-lg mx-auto">
              From raw market data to actionable intelligence in four steps.
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
                <h3 className="font-medium text-foreground mb-2">Data Collection</h3>
                <p className="text-xs text-muted-foreground">
                  Real-time market data, news, and economic indicators
                </p>
              </div>

              {/* Step 2 - Highlighted */}
              <div className="relative text-center">
                <div className="w-16 h-16 rounded-full bg-primary/10 border border-primary/30 flex items-center justify-center mx-auto mb-4 text-primary font-data text-lg relative z-10">
                  02
                </div>
                <h3 className="font-medium text-foreground mb-2">AI Analysis</h3>
                <p className="text-xs text-muted-foreground">
                  Advanced LLM processes and synthesizes information
                </p>
              </div>

              {/* Step 3 */}
              <div className="relative text-center">
                <div className="w-16 h-16 rounded-full bg-muted border border-border flex items-center justify-center mx-auto mb-4 text-muted-foreground font-data text-lg relative z-10">
                  03
                </div>
                <h3 className="font-medium text-foreground mb-2">Insight Generation</h3>
                <p className="text-xs text-muted-foreground">
                  Creates narrative with cause-effect analysis chains
                </p>
              </div>

              {/* Step 4 - Final */}
              <div className="relative text-center">
                <div className="w-16 h-16 rounded-full bg-primary flex items-center justify-center mx-auto mb-4 text-primary-foreground font-data text-lg glow-emerald-sm relative z-10">
                  04
                </div>
                <h3 className="font-medium text-foreground mb-2">Your Report</h3>
                <p className="text-xs text-muted-foreground">
                  Delivered daily, ready when you need it
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
              <p className="text-primary text-sm font-medium tracking-wide uppercase">Report Preview</p>
              <h2 className="text-3xl md:text-4xl font-medium text-foreground">
                Analysis That Helps You Think
              </h2>
              <p className="text-muted-foreground leading-relaxed">
                Each report is structured to help you understand the market narrative,
                not just memorize numbers. We provide thinking frameworks so you can
                make your own informed decisions.
              </p>
              <ul className="space-y-4 pt-2">
                {[
                  'Market narrative and dominant themes',
                  'Macro environment with signal interpretation',
                  'Curated news with impact chain analysis',
                  'Scenario thinking for upcoming events'
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
                  <p className="text-xs text-muted-foreground">Daily Report</p>
                  <p className="font-medium text-foreground text-sm">December 13, 2024</p>
                </div>
              </div>

              {/* Market Thesis */}
              <div className="p-4 rounded-lg bg-primary/5 border border-primary/10 mb-4">
                <p className="text-xs text-primary font-medium mb-1.5">Market Thesis</p>
                <p className="text-sm text-foreground/90">Tech profit-taking masks underlying strength as rotation continues...</p>
              </div>

              {/* Key Metrics */}
              <div className="space-y-3 p-4 rounded-lg bg-muted/50 mb-4">
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground text-sm">VIX</span>
                  <span className="font-data text-sm text-foreground">15.74 <span className="text-amber-400">+5.99%</span></span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground text-sm">10Y Yield</span>
                  <span className="font-data text-sm text-foreground">4.32% <span className="text-red-400">+2bp</span></span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground text-sm">DXY</span>
                  <span className="font-data text-sm text-foreground">106.8 <span className="text-primary">-0.12%</span></span>
                </div>
              </div>

              {/* Upcoming Event */}
              <div className="pt-4 border-t border-border">
                <p className="text-xs text-muted-foreground mb-2">Upcoming</p>
                <p className="text-sm text-foreground">Dec 18: FOMC Meeting - Key focus on rate path guidance...</p>
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
              <p className="text-primary text-sm font-medium tracking-wide uppercase">Subscribe</p>
              <h2 className="text-3xl md:text-4xl font-medium text-foreground">
                Never Miss a Market Insight
              </h2>
              <p className="text-muted-foreground leading-relaxed">
                Subscribe to receive daily market analysis directly in your inbox.
                Join investors who prefer insights over information overload.
              </p>
              <ul className="space-y-3 pt-2">
                {[
                  'Daily AI-generated market analysis',
                  'Delivered before market open',
                  'Unsubscribe anytime'
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
            <h2 className="font-editorial text-4xl md:text-5xl text-foreground">
              Ready to Understand Markets Better?
            </h2>
            <p className="text-muted-foreground text-lg">
              Start with today&apos;s analysis - it&apos;s free.
            </p>
            <div className="flex flex-col sm:flex-row items-center justify-center gap-4 pt-4">
              <Link
                href="/today"
                className="px-8 py-4 bg-primary text-primary-foreground rounded-lg font-medium transition-all hover:shadow-lg hover:shadow-primary/25 glow-emerald-sm"
              >
                Read Today&apos;s Report
              </Link>
              <Link
                href="/today/archive"
                className="px-8 py-4 text-muted-foreground hover:text-foreground rounded-lg font-medium transition-all hover:bg-muted"
              >
                Browse Past Reports
              </Link>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}
