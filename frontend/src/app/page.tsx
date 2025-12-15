'use client';

import Link from 'next/link';
import { useAuth } from '@/contexts/AuthContext';
import SubscribeForm from '@/components/SubscribeForm';

export default function Home() {
  const { isAuthenticated } = useAuth();

  return (
    <main className="min-h-screen bg-white">
      {/* Hero Section */}
      <section className="relative overflow-hidden">
        {/* Background gradient */}
        <div className="absolute inset-0 bg-gradient-to-b from-emerald-50/50 to-white pointer-events-none" />

        <div className="relative max-w-5xl mx-auto px-4 md:px-6 pt-16 pb-20 md:pt-24 md:pb-28">
          <div className="text-center space-y-6">
            {/* Badge */}
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-emerald-100/80 text-emerald-700 text-xs font-medium">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-500 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-600"></span>
              </span>
              AI-Powered Market Intelligence
            </div>

            {/* Main Headline */}
            <h1 className="text-3xl md:text-5xl font-semibold tracking-tight text-gray-900 max-w-3xl mx-auto leading-tight">
              Understand Markets,
              <br />
              <span className="text-emerald-600">Not Just Data</span>
            </h1>

            {/* Subtitle */}
            <p className="text-base md:text-lg text-gray-500 max-w-xl mx-auto leading-relaxed">
              Daily AI-generated market analysis that explains the "why" behind market movements.
              Built for investors who want insights, not noise.
            </p>

            {/* CTA Buttons */}
            <div className="flex flex-col sm:flex-row items-center justify-center gap-3 pt-4">
              <a
                href="#subscribe"
                className="w-full sm:w-auto px-6 py-3 bg-emerald-600 text-white rounded-xl font-medium text-sm transition-all hover:bg-emerald-700 hover:shadow-lg hover:shadow-emerald-200 flex items-center justify-center gap-2"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                </svg>
                Subscribe to Daily Reports
              </a>
              <Link
                href="/market"
                className="w-full sm:w-auto px-6 py-3 bg-white text-gray-700 rounded-xl font-medium text-sm border border-gray-200 transition-all hover:bg-gray-50 hover:border-gray-300 flex items-center justify-center gap-2"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                </svg>
                View Today's Analysis
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section className="border-t border-gray-100 bg-gray-50/50">
        <div className="max-w-5xl mx-auto px-4 md:px-6 py-16 md:py-20">
          <div className="text-center mb-12">
            <h2 className="text-xl md:text-2xl font-semibold text-gray-900 mb-3">
              What You Get
            </h2>
            <p className="text-sm text-gray-500 max-w-lg mx-auto">
              Professional-grade market intelligence, delivered daily
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-6">
            {/* Feature 1 */}
            <div className="bg-white rounded-2xl border border-gray-200 p-6 hover:shadow-lg hover:border-gray-300 transition-all">
              <div className="w-10 h-10 rounded-xl bg-emerald-100 flex items-center justify-center mb-4">
                <svg className="w-5 h-5 text-emerald-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                </svg>
              </div>
              <h3 className="font-semibold text-gray-900 mb-2">AI-Powered Insights</h3>
              <p className="text-sm text-gray-500 leading-relaxed">
                Not just what happened, but why it matters. Our AI explains market movements with cause-and-effect analysis.
              </p>
            </div>

            {/* Feature 2 */}
            <div className="bg-white rounded-2xl border border-gray-200 p-6 hover:shadow-lg hover:border-gray-300 transition-all">
              <div className="w-10 h-10 rounded-xl bg-blue-100 flex items-center justify-center mb-4">
                <svg className="w-5 h-5 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
              </div>
              <h3 className="font-semibold text-gray-900 mb-2">Forward-Looking Calendar</h3>
              <p className="text-sm text-gray-500 leading-relaxed">
                Know what's coming. Economic events and earnings with scenario analysis for different outcomes.
              </p>
            </div>

            {/* Feature 3 */}
            <div className="bg-white rounded-2xl border border-gray-200 p-6 hover:shadow-lg hover:border-gray-300 transition-all">
              <div className="w-10 h-10 rounded-xl bg-purple-100 flex items-center justify-center mb-4">
                <svg className="w-5 h-5 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z" />
                </svg>
              </div>
              <h3 className="font-semibold text-gray-900 mb-2">Personalized Digest</h3>
              <p className="text-sm text-gray-500 leading-relaxed">
                Build your watchlist and get analysis tailored to the stocks you care about most.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* How It Works Section */}
      <section className="border-t border-gray-100">
        <div className="max-w-5xl mx-auto px-4 md:px-6 py-16 md:py-20">
          <div className="text-center mb-12">
            <h2 className="text-xl md:text-2xl font-semibold text-gray-900 mb-3">
              How It Works
            </h2>
            <p className="text-sm text-gray-500 max-w-lg mx-auto">
              From raw market data to actionable intelligence
            </p>
          </div>

          <div className="grid md:grid-cols-4 gap-6">
            {/* Step 1 */}
            <div className="text-center">
              <div className="w-12 h-12 rounded-full bg-gray-100 flex items-center justify-center mx-auto mb-4 text-gray-400 font-semibold">
                1
              </div>
              <h3 className="font-medium text-gray-900 mb-1 text-sm">Data Collection</h3>
              <p className="text-xs text-gray-500">
                Real-time market data, news, and economic indicators
              </p>
            </div>

            {/* Arrow */}
            <div className="hidden md:flex items-center justify-center">
              <svg className="w-6 h-6 text-gray-300 -mt-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" />
              </svg>
            </div>

            {/* Step 2 */}
            <div className="text-center">
              <div className="w-12 h-12 rounded-full bg-emerald-100 flex items-center justify-center mx-auto mb-4 text-emerald-600 font-semibold">
                2
              </div>
              <h3 className="font-medium text-gray-900 mb-1 text-sm">AI Analysis</h3>
              <p className="text-xs text-gray-500">
                Advanced LLM processes and synthesizes information
              </p>
            </div>

            {/* Arrow */}
            <div className="hidden md:flex items-center justify-center">
              <svg className="w-6 h-6 text-gray-300 -mt-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" />
              </svg>
            </div>

            {/* Step 3 */}
            <div className="text-center md:col-start-1">
              <div className="w-12 h-12 rounded-full bg-gray-100 flex items-center justify-center mx-auto mb-4 text-gray-400 font-semibold">
                3
              </div>
              <h3 className="font-medium text-gray-900 mb-1 text-sm">Insight Generation</h3>
              <p className="text-xs text-gray-500">
                Creates narrative with cause-effect chains
              </p>
            </div>

            {/* Arrow */}
            <div className="hidden md:flex items-center justify-center">
              <svg className="w-6 h-6 text-gray-300 -mt-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" />
              </svg>
            </div>

            {/* Step 4 */}
            <div className="text-center">
              <div className="w-12 h-12 rounded-full bg-emerald-600 flex items-center justify-center mx-auto mb-4 text-white font-semibold">
                4
              </div>
              <h3 className="font-medium text-gray-900 mb-1 text-sm">Your Report</h3>
              <p className="text-xs text-gray-500">
                Delivered daily, ready when you need it
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Report Preview Section */}
      <section className="border-t border-gray-100 bg-gray-50/50">
        <div className="max-w-5xl mx-auto px-4 md:px-6 py-16 md:py-20">
          <div className="grid md:grid-cols-2 gap-8 items-center">
            <div className="space-y-4">
              <h2 className="text-xl md:text-2xl font-semibold text-gray-900">
                Analysis That Helps You Think
              </h2>
              <p className="text-sm text-gray-500 leading-relaxed">
                Each report is structured to help you understand the market narrative,
                not just memorize numbers. We provide thinking frameworks so you can
                make your own informed decisions.
              </p>
              <ul className="space-y-3 pt-2">
                <li className="flex items-start gap-3">
                  <svg className="w-5 h-5 text-emerald-600 mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                  <span className="text-sm text-gray-600">Market narrative and dominant themes</span>
                </li>
                <li className="flex items-start gap-3">
                  <svg className="w-5 h-5 text-emerald-600 mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                  <span className="text-sm text-gray-600">Macro environment with signal interpretation</span>
                </li>
                <li className="flex items-start gap-3">
                  <svg className="w-5 h-5 text-emerald-600 mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                  <span className="text-sm text-gray-600">Curated news with impact chain analysis</span>
                </li>
                <li className="flex items-start gap-3">
                  <svg className="w-5 h-5 text-emerald-600 mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                  <span className="text-sm text-gray-600">Scenario thinking for upcoming events</span>
                </li>
              </ul>
            </div>

            {/* Report Preview Card */}
            <div className="bg-white rounded-2xl border border-gray-200 p-6 shadow-lg">
              <div className="flex items-center gap-2 mb-4">
                <div className="w-8 h-8 rounded-lg bg-emerald-600 flex items-center justify-center">
                  <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                </div>
                <div>
                  <p className="text-xs text-gray-400">Daily Report</p>
                  <p className="text-sm font-medium text-gray-900">December 13, 2024</p>
                </div>
              </div>

              <div className="space-y-3 text-sm">
                <div className="p-3 rounded-lg bg-emerald-50 border border-emerald-100">
                  <p className="font-medium text-emerald-800 text-xs mb-1">Market Thesis</p>
                  <p className="text-emerald-700 text-xs">Tech profit-taking masks underlying strength as rotation continues...</p>
                </div>

                <div className="space-y-1.5">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-gray-500">VIX</span>
                    <span className="font-medium text-gray-900">15.74 <span className="text-amber-600">+5.99%</span></span>
                  </div>
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-gray-500">10Y Yield</span>
                    <span className="font-medium text-gray-900">4.32% <span className="text-red-500">+2bp</span></span>
                  </div>
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-gray-500">DXY</span>
                    <span className="font-medium text-gray-900">106.8 <span className="text-emerald-600">-0.12%</span></span>
                  </div>
                </div>

                <div className="pt-2 border-t border-gray-100">
                  <p className="text-xs text-gray-400 mb-1">Upcoming</p>
                  <p className="text-xs text-gray-600">Dec 18: FOMC Meeting - Key focus on rate path guidance...</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Newsletter Subscribe Section */}
      <section id="subscribe" className="border-t border-gray-100 bg-gradient-to-b from-emerald-50/30 to-white scroll-mt-16">
        <div className="max-w-5xl mx-auto px-4 md:px-6 py-16 md:py-20">
          <div className="grid md:grid-cols-2 gap-8 items-center">
            <div className="space-y-4">
              <h2 className="text-xl md:text-2xl font-semibold text-gray-900">
                Never Miss a Market Insight
              </h2>
              <p className="text-sm text-gray-500 leading-relaxed">
                Subscribe to receive daily market analysis directly in your inbox.
                Join investors who prefer insights over information overload.
              </p>
              <ul className="space-y-2 pt-2">
                <li className="flex items-center gap-2 text-sm text-gray-600">
                  <svg className="w-4 h-4 text-emerald-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                  Daily AI-generated market analysis
                </li>
                <li className="flex items-center gap-2 text-sm text-gray-600">
                  <svg className="w-4 h-4 text-emerald-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                  Delivered before market open
                </li>
                <li className="flex items-center gap-2 text-sm text-gray-600">
                  <svg className="w-4 h-4 text-emerald-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
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
      <section className="border-t border-gray-100">
        <div className="max-w-5xl mx-auto px-4 md:px-6 py-16 md:py-20">
          <div className="text-center space-y-6">
            <h2 className="text-xl md:text-2xl font-semibold text-gray-900">
              Ready to Understand Markets Better?
            </h2>
            <p className="text-sm text-gray-500 max-w-lg mx-auto">
              Start with today's analysis - it's free.
            </p>
            <div className="flex flex-col sm:flex-row items-center justify-center gap-3 pt-2">
              <Link
                href="/market"
                className="w-full sm:w-auto px-6 py-3 bg-emerald-600 text-white rounded-xl font-medium text-sm transition-all hover:bg-emerald-700 hover:shadow-lg hover:shadow-emerald-200"
              >
                Read Today's Report
              </Link>
              <Link
                href="/reports"
                className="w-full sm:w-auto px-6 py-3 text-gray-600 rounded-xl font-medium text-sm transition-all hover:bg-gray-100"
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
