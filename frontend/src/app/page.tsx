'use client';

import Link from 'next/link';
import SubscribeForm from '@/components/SubscribeForm';

export default function Home() {

  return (
    <main className="min-h-screen bg-background">
      {/* Hero Section */}
      <section className="relative overflow-hidden">
        {/* Background gradient + grid pattern */}
        <div className="absolute inset-0 bg-gradient-to-b from-emerald-950/20 via-background to-background dark:from-emerald-950/30 pointer-events-none" />
        <div className="absolute inset-0 bg-grid-pattern opacity-50 dark:opacity-100 pointer-events-none" />

        <div className="relative max-w-5xl mx-auto px-4 md:px-6 pt-20 pb-24 md:pt-28 md:pb-32">
          <div className="text-center space-y-8">
            {/* Badge */}
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-emerald-500/10 dark:bg-emerald-500/20 border border-emerald-500/20 dark:border-emerald-500/30 text-emerald-600 dark:text-emerald-400 text-xs font-medium backdrop-blur-sm">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-500 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
              </span>
              AI-Powered Market Intelligence
            </div>

            {/* Main Headline */}
            <h1 className="text-4xl md:text-6xl font-bold tracking-tight text-foreground max-w-4xl mx-auto leading-[1.1]">
              Understand Markets,
              <br />
              <span className="text-emerald-500 dark:text-emerald-400">Not Just Data</span>
            </h1>

            {/* Subtitle */}
            <p className="text-lg md:text-xl text-muted-foreground max-w-2xl mx-auto leading-relaxed">
              Daily AI-generated market analysis that explains the &quot;why&quot; behind market movements.
              Built for investors who want insights, not noise.
            </p>

            {/* CTA Buttons */}
            <div className="flex flex-col sm:flex-row items-center justify-center gap-4 pt-4">
              <a
                href="#subscribe"
                className="w-full sm:w-auto px-8 py-4 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl font-medium text-sm transition-all hover:shadow-lg hover:shadow-emerald-500/25 dark:hover:shadow-emerald-500/20 flex items-center justify-center gap-2 glow-emerald-sm"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                </svg>
                Subscribe to Daily Reports
              </a>
              <Link
                href="/market"
                className="w-full sm:w-auto px-8 py-4 bg-secondary hover:bg-secondary/80 text-foreground rounded-xl font-medium text-sm border border-border transition-all hover:border-emerald-500/50 flex items-center justify-center gap-2"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                </svg>
                View Today&apos;s Analysis
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section className="border-t border-border">
        <div className="max-w-5xl mx-auto px-4 md:px-6 py-20 md:py-24">
          <div className="text-center mb-16">
            <h2 className="text-2xl md:text-3xl font-bold text-foreground mb-4">
              What You Get
            </h2>
            <p className="text-muted-foreground max-w-lg mx-auto">
              Professional-grade market intelligence, delivered daily
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-6">
            {/* Feature 1 */}
            <div className="group bg-card rounded-2xl border border-border p-6 hover:border-emerald-500/50 hover-glow transition-all">
              <div className="w-12 h-12 rounded-xl bg-emerald-500/10 dark:bg-emerald-500/20 flex items-center justify-center mb-5 group-hover:glow-emerald-sm transition-all">
                <svg className="w-6 h-6 text-emerald-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                </svg>
              </div>
              <h3 className="font-semibold text-foreground mb-2 text-lg">AI-Powered Insights</h3>
              <p className="text-sm text-muted-foreground leading-relaxed">
                Not just what happened, but why it matters. Our AI explains market movements with cause-and-effect analysis.
              </p>
            </div>

            {/* Feature 2 */}
            <div className="group bg-card rounded-2xl border border-border p-6 hover:border-emerald-500/50 hover-glow transition-all">
              <div className="w-12 h-12 rounded-xl bg-blue-500/10 dark:bg-blue-500/20 flex items-center justify-center mb-5">
                <svg className="w-6 h-6 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
              </div>
              <h3 className="font-semibold text-foreground mb-2 text-lg">Forward-Looking Calendar</h3>
              <p className="text-sm text-muted-foreground leading-relaxed">
                Know what&apos;s coming. Economic events and earnings with scenario analysis for different outcomes.
              </p>
            </div>

            {/* Feature 3 */}
            <div className="group bg-card rounded-2xl border border-border p-6 hover:border-emerald-500/50 hover-glow transition-all">
              <div className="w-12 h-12 rounded-xl bg-purple-500/10 dark:bg-purple-500/20 flex items-center justify-center mb-5">
                <svg className="w-6 h-6 text-purple-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z" />
                </svg>
              </div>
              <h3 className="font-semibold text-foreground mb-2 text-lg">Personalized Digest</h3>
              <p className="text-sm text-muted-foreground leading-relaxed">
                Build your watchlist and get analysis tailored to the stocks you care about most.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* How It Works Section */}
      <section className="border-t border-border bg-muted/30">
        <div className="max-w-5xl mx-auto px-4 md:px-6 py-20 md:py-24">
          <div className="text-center mb-16">
            <h2 className="text-2xl md:text-3xl font-bold text-foreground mb-4">
              How It Works
            </h2>
            <p className="text-muted-foreground max-w-lg mx-auto">
              From raw market data to actionable intelligence
            </p>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-8">
            {/* Step 1 */}
            <div className="text-center">
              <div className="w-14 h-14 rounded-full bg-muted border border-border flex items-center justify-center mx-auto mb-4 text-muted-foreground font-bold text-lg">
                1
              </div>
              <h3 className="font-medium text-foreground mb-2">Data Collection</h3>
              <p className="text-xs text-muted-foreground">
                Real-time market data, news, and economic indicators
              </p>
            </div>

            {/* Step 2 */}
            <div className="text-center">
              <div className="w-14 h-14 rounded-full bg-emerald-500/10 dark:bg-emerald-500/20 border border-emerald-500/30 flex items-center justify-center mx-auto mb-4 text-emerald-500 font-bold text-lg">
                2
              </div>
              <h3 className="font-medium text-foreground mb-2">AI Analysis</h3>
              <p className="text-xs text-muted-foreground">
                Advanced LLM processes and synthesizes information
              </p>
            </div>

            {/* Step 3 */}
            <div className="text-center">
              <div className="w-14 h-14 rounded-full bg-muted border border-border flex items-center justify-center mx-auto mb-4 text-muted-foreground font-bold text-lg">
                3
              </div>
              <h3 className="font-medium text-foreground mb-2">Insight Generation</h3>
              <p className="text-xs text-muted-foreground">
                Creates narrative with cause-effect chains
              </p>
            </div>

            {/* Step 4 */}
            <div className="text-center">
              <div className="w-14 h-14 rounded-full bg-emerald-500 flex items-center justify-center mx-auto mb-4 text-white font-bold text-lg glow-emerald-sm">
                4
              </div>
              <h3 className="font-medium text-foreground mb-2">Your Report</h3>
              <p className="text-xs text-muted-foreground">
                Delivered daily, ready when you need it
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Report Preview Section */}
      <section className="border-t border-border">
        <div className="max-w-5xl mx-auto px-4 md:px-6 py-20 md:py-24">
          <div className="grid md:grid-cols-2 gap-12 items-center">
            <div className="space-y-6">
              <h2 className="text-2xl md:text-3xl font-bold text-foreground">
                Analysis That Helps You Think
              </h2>
              <p className="text-muted-foreground leading-relaxed">
                Each report is structured to help you understand the market narrative,
                not just memorize numbers. We provide thinking frameworks so you can
                make your own informed decisions.
              </p>
              <ul className="space-y-4 pt-2">
                <li className="flex items-start gap-3">
                  <div className="w-5 h-5 rounded-full bg-emerald-500/20 flex items-center justify-center mt-0.5 flex-shrink-0">
                    <svg className="w-3 h-3 text-emerald-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                    </svg>
                  </div>
                  <span className="text-foreground">Market narrative and dominant themes</span>
                </li>
                <li className="flex items-start gap-3">
                  <div className="w-5 h-5 rounded-full bg-emerald-500/20 flex items-center justify-center mt-0.5 flex-shrink-0">
                    <svg className="w-3 h-3 text-emerald-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                    </svg>
                  </div>
                  <span className="text-foreground">Macro environment with signal interpretation</span>
                </li>
                <li className="flex items-start gap-3">
                  <div className="w-5 h-5 rounded-full bg-emerald-500/20 flex items-center justify-center mt-0.5 flex-shrink-0">
                    <svg className="w-3 h-3 text-emerald-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                    </svg>
                  </div>
                  <span className="text-foreground">Curated news with impact chain analysis</span>
                </li>
                <li className="flex items-start gap-3">
                  <div className="w-5 h-5 rounded-full bg-emerald-500/20 flex items-center justify-center mt-0.5 flex-shrink-0">
                    <svg className="w-3 h-3 text-emerald-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                    </svg>
                  </div>
                  <span className="text-foreground">Scenario thinking for upcoming events</span>
                </li>
              </ul>
            </div>

            {/* Report Preview Card */}
            <div className="bg-card rounded-2xl border border-border p-6 shadow-xl dark:shadow-emerald-500/5">
              <div className="flex items-center gap-3 mb-5">
                <div className="w-10 h-10 rounded-xl bg-emerald-500 flex items-center justify-center glow-emerald-sm">
                  <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Daily Report</p>
                  <p className="font-medium text-foreground">December 13, 2024</p>
                </div>
              </div>

              <div className="space-y-4">
                <div className="p-4 rounded-xl bg-emerald-500/10 dark:bg-emerald-500/20 border border-emerald-500/20">
                  <p className="font-medium text-emerald-600 dark:text-emerald-400 text-xs mb-1">Market Thesis</p>
                  <p className="text-emerald-700 dark:text-emerald-300 text-sm">Tech profit-taking masks underlying strength as rotation continues...</p>
                </div>

                <div className="space-y-3 p-4 rounded-xl bg-muted/50">
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground text-sm">VIX</span>
                    <span className="font-medium text-foreground">15.74 <span className="text-amber-500">+5.99%</span></span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground text-sm">10Y Yield</span>
                    <span className="font-medium text-foreground">4.32% <span className="text-red-500">+2bp</span></span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground text-sm">DXY</span>
                    <span className="font-medium text-foreground">106.8 <span className="text-emerald-500">-0.12%</span></span>
                  </div>
                </div>

                <div className="pt-3 border-t border-border">
                  <p className="text-xs text-muted-foreground mb-2">Upcoming</p>
                  <p className="text-sm text-foreground">Dec 18: FOMC Meeting - Key focus on rate path guidance...</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Newsletter Subscribe Section */}
      <section id="subscribe" className="border-t border-border bg-gradient-to-b from-emerald-950/10 to-background dark:from-emerald-950/20 scroll-mt-16">
        <div className="max-w-5xl mx-auto px-4 md:px-6 py-20 md:py-24">
          <div className="grid md:grid-cols-2 gap-12 items-center">
            <div className="space-y-6">
              <h2 className="text-2xl md:text-3xl font-bold text-foreground">
                Never Miss a Market Insight
              </h2>
              <p className="text-muted-foreground leading-relaxed">
                Subscribe to receive daily market analysis directly in your inbox.
                Join investors who prefer insights over information overload.
              </p>
              <ul className="space-y-3 pt-2">
                <li className="flex items-center gap-3 text-foreground">
                  <svg className="w-5 h-5 text-emerald-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                  Daily AI-generated market analysis
                </li>
                <li className="flex items-center gap-3 text-foreground">
                  <svg className="w-5 h-5 text-emerald-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                  Delivered before market open
                </li>
                <li className="flex items-center gap-3 text-foreground">
                  <svg className="w-5 h-5 text-emerald-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                  Unsubscribe anytime
                </li>
              </ul>
            </div>
            <SubscribeForm variant="card" />
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="border-t border-border">
        <div className="max-w-5xl mx-auto px-4 md:px-6 py-20 md:py-24">
          <div className="text-center space-y-8">
            <h2 className="text-2xl md:text-3xl font-bold text-foreground">
              Ready to Understand Markets Better?
            </h2>
            <p className="text-muted-foreground max-w-lg mx-auto">
              Start with today&apos;s analysis - it&apos;s free.
            </p>
            <div className="flex flex-col sm:flex-row items-center justify-center gap-4 pt-2">
              <Link
                href="/market"
                className="w-full sm:w-auto px-8 py-4 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl font-medium transition-all hover:shadow-lg hover:shadow-emerald-500/25 dark:hover:shadow-emerald-500/20 glow-emerald-sm"
              >
                Read Today&apos;s Report
              </Link>
              <Link
                href="/reports"
                className="w-full sm:w-auto px-8 py-4 text-muted-foreground hover:text-foreground rounded-xl font-medium transition-all hover:bg-muted"
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
