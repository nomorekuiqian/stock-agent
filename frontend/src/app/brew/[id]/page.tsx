'use client';

import { useState, useEffect, use } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Coffee } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { getUserDigestById, UserDigest } from '@/lib/insforge';
import { DigestResponse, StockAnalysis, BrewNews, BrewEvent } from '@/lib/api';
import { formatDateChinese, formatTimePacific, formatCalendarDate, isTodayPacific } from '@/lib/timezone';

export default function BrewDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const router = useRouter();
  const { user, isLoading: authLoading, isAuthenticated } = useAuth();

  const [digest, setDigest] = useState<DigestResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Redirect to login if not authenticated
  useEffect(() => {
    if (!authLoading && !isAuthenticated) {
      router.push(`/login?redirect=/brew/${id}`);
    }
  }, [authLoading, isAuthenticated, router, id]);

  // Load digest
  useEffect(() => {
    const loadDigest = async () => {
      if (!user?.id) return;

      setLoading(true);
      setError(null);
      try {
        const historyItem = await getUserDigestById(id);

        if (!historyItem) {
          setError('Brew not found');
          return;
        }

        // Verify ownership
        if (historyItem.user_id !== user.id) {
          setError('You do not have access to this brew');
          return;
        }

        // Convert to DigestResponse format
        const brewData = historyItem.brew_data || {};
        const digestFromHistory: DigestResponse = {
          success: true,
          timestamp: historyItem.created_at || '',
          symbols_used: historyItem.symbols,
          greeting: historyItem.greeting || '',
          one_line_summary: historyItem.one_line_summary || '',
          stocks: brewData.stocks || [],
          news: brewData.news || [],
          events: brewData.events || [],
          macro_impact: brewData.macro_impact || null,
          bottom_line: historyItem.bottom_line || historyItem.analysis || '',
        };
        setDigest(digestFromHistory);
      } catch (err) {
        console.error('Failed to load digest:', err);
        setError('Failed to load brew');
      } finally {
        setLoading(false);
      }
    };

    if (user?.id && id) {
      loadDigest();
    }
  }, [user?.id, id]);

  const getStatusColor = (status: string) => {
    if (status.includes('up') || status.includes('strong') || status.includes('rise')) {
      return 'text-emerald-500 bg-emerald-500/10';
    } else if (status.includes('down') || status.includes('weak') || status.includes('fall')) {
      return 'text-red-500 bg-red-500/10';
    }
    return 'text-muted-foreground bg-secondary';
  };

  const getRiskColor = (riskLevel: string) => {
    const level = riskLevel.toLowerCase();
    if (level.includes('low')) return 'text-emerald-500';
    if (level.includes('medium') || level.includes('moderate')) return 'text-amber-500';
    if (level.includes('high')) return 'text-red-500';
    return 'text-muted-foreground';
  };

  // Show loading while checking auth
  if (authLoading) {
    return (
      <main className="min-h-screen bg-background">
        <div className="max-w-5xl mx-auto px-4 md:px-6 py-16">
          <div className="flex flex-col items-center justify-center gap-4">
            <div className="w-12 h-12 rounded-full border-3 border-emerald-500/20 border-t-emerald-500 animate-spin" />
            <p className="text-muted-foreground">Loading...</p>
          </div>
        </div>
      </main>
    );
  }

  if (!isAuthenticated) {
    return null;
  }

  return (
    <main className="min-h-screen bg-background">
      {/* Header */}
      <section className="border-b border-border">
        <div className="max-w-5xl mx-auto px-4 md:px-6 py-4">
          <div className="flex items-center gap-3">
            <Link
              href="/brew"
              className="p-2 -ml-2 text-muted-foreground hover:text-foreground transition-colors"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
            </Link>
            <div className="w-10 h-10 rounded-xl bg-emerald-500/10 dark:bg-emerald-500/20 flex items-center justify-center">
              <Coffee className="w-5 h-5 text-emerald-500" strokeWidth={2} />
            </div>
            <div>
              <h1 className="text-xl font-bold text-foreground">My Brew</h1>
              <p className="text-xs text-muted-foreground">Personal Report</p>
            </div>
          </div>
        </div>
      </section>

      {/* Error */}
      {error && (
        <div className="max-w-5xl mx-auto px-4 md:px-6 py-4">
          <div className="p-4 rounded-xl bg-red-500/10 border border-red-500/20 text-red-500 text-sm text-center">
            {error}
          </div>
        </div>
      )}

      {/* Loading State */}
      {loading && (
        <div className="max-w-5xl mx-auto px-4 md:px-6 py-16">
          <div className="flex flex-col items-center justify-center gap-4">
            <div className="w-12 h-12 rounded-full border-3 border-emerald-500/20 border-t-emerald-500 animate-spin" />
            <p className="text-muted-foreground">Loading your brew...</p>
          </div>
        </div>
      )}

      {/* Main Content */}
      {!loading && digest && (
        <div className="max-w-5xl mx-auto px-4 md:px-6 py-6 space-y-6">
          {/* Report Header */}
          <section className="animate-fade-in-up">
            <div className="flex items-center gap-2 text-xs text-muted-foreground mb-2">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
              <span>{formatDateChinese(digest.timestamp)}</span>
              <span className="text-muted-foreground/50">|</span>
              <span>{formatTimePacific(digest.timestamp)}</span>
            </div>
            <h2 className="text-xl md:text-2xl font-bold text-foreground">
              {digest.greeting}
            </h2>
            <p className="text-sm text-muted-foreground mt-2">
              {digest.one_line_summary}
            </p>

            {/* Tracked symbols */}
            <div className="flex flex-wrap gap-1.5 mt-3">
              {digest.symbols_used.map((sym) => (
                <span key={sym} className="px-2 py-0.5 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 rounded text-xs font-medium">
                  {sym}
                </span>
              ))}
            </div>
          </section>

          {/* Portfolio Overview */}
          {digest.stocks.length > 0 && (
            <section className="bg-card rounded-xl border border-border p-5 animate-fade-in-up">
              <div className="flex items-center gap-2 mb-4">
                <div className="w-1 h-4 bg-emerald-500 rounded-full" />
                <h3 className="text-sm font-semibold text-foreground uppercase tracking-wider">Portfolio Overview</h3>
              </div>
              <div className="divide-y divide-border">
                {digest.stocks.map((stock: StockAnalysis) => (
                  <div key={stock.symbol} className="py-4 first:pt-0 last:pb-0">
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-3">
                        <span className="font-semibold text-foreground">{stock.symbol}</span>
                        <span className="text-sm text-muted-foreground">{stock.name}</span>
                      </div>
                      <span className={`px-2 py-0.5 rounded text-xs font-medium ${getStatusColor(stock.status)}`}>
                        {stock.status}
                      </span>
                    </div>
                    <div className="flex items-center gap-4 text-sm mb-2">
                      <span className="text-foreground font-medium">${stock.price.toFixed(2)}</span>
                      <span className={stock.daily_change.startsWith('+') ? 'text-emerald-500' : 'text-red-500'}>
                        {stock.daily_change}
                      </span>
                      <span className="text-muted-foreground">|</span>
                      <span className={stock.week_change.startsWith('+') ? 'text-emerald-500' : 'text-red-500'}>
                        {stock.week_change} (week)
                      </span>
                    </div>
                    <p className="text-sm text-muted-foreground leading-relaxed">{stock.quick_take}</p>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* Related News */}
          {digest.news.length > 0 && (
            <section className="bg-card rounded-xl border border-border p-5 animate-fade-in-up">
              <div className="flex items-center gap-2 mb-4">
                <div className="w-1 h-4 bg-emerald-500 rounded-full" />
                <h3 className="text-sm font-semibold text-foreground uppercase tracking-wider">Related News</h3>
              </div>
              <div className="divide-y divide-border">
                {digest.news.map((item: BrewNews, index: number) => (
                  <div key={index} className="py-4 first:pt-0 last:pb-0">
                    <div className="flex items-start justify-between gap-2 mb-2">
                      <a
                        href={item.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="font-semibold text-foreground hover:text-emerald-500 transition-colors text-sm"
                      >
                        {item.title}
                      </a>
                      {item.related_symbols.length > 0 && (
                        <div className="flex gap-1 shrink-0">
                          {item.related_symbols.map((sym: string) => (
                            <span key={sym} className="px-1.5 py-0.5 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 rounded text-xs">
                              {sym}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                    <p className="text-sm text-muted-foreground mb-1">{item.summary}</p>
                    <p className="text-sm text-muted-foreground leading-relaxed">{item.analysis}</p>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* Key Events */}
          {digest.events.length > 0 && (
            <section className="bg-card rounded-xl border border-border p-5 animate-fade-in-up">
              <div className="flex items-center gap-2 mb-4">
                <div className="w-1 h-4 bg-emerald-500 rounded-full" />
                <h3 className="text-sm font-semibold text-foreground uppercase tracking-wider">Key Events</h3>
              </div>
              <div className="space-y-4">
                {digest.events.map((event: BrewEvent, index: number) => {
                  const dateStr = event.date.split('T')[0];
                  const calendarDate = formatCalendarDate(dateStr);
                  const isToday = isTodayPacific(dateStr);

                  return (
                    <div key={index} className="flex gap-4">
                      <div className={`flex-shrink-0 w-14 rounded-lg p-2 text-center ${
                        isToday
                          ? 'bg-emerald-500/10 border border-emerald-500/20'
                          : 'bg-secondary border border-border'
                      }`}>
                        <p className={`text-xs uppercase ${isToday ? 'text-emerald-500' : 'text-muted-foreground'}`}>
                          {calendarDate.month}
                        </p>
                        <p className={`text-xl font-semibold ${isToday ? 'text-emerald-500' : 'text-foreground'}`}>
                          {calendarDate.day}
                        </p>
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-start justify-between gap-2 mb-1">
                          <span className="font-semibold text-foreground text-sm">{event.event}</span>
                          {event.related_symbols.length > 0 && (
                            <div className="flex gap-1 shrink-0">
                              {event.related_symbols.map((sym: string) => (
                                <span key={sym} className="px-1.5 py-0.5 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 rounded text-xs">
                                  {sym}
                                </span>
                              ))}
                            </div>
                          )}
                        </div>
                        <p className="text-sm text-muted-foreground leading-relaxed">{event.why_important}</p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>
          )}

          {/* Macro Impact */}
          {digest.macro_impact && (
            <section className="bg-card rounded-xl border border-border p-5 animate-fade-in-up">
              <div className="flex items-center gap-2 mb-4">
                <div className="w-1 h-4 bg-emerald-500 rounded-full" />
                <h3 className="text-sm font-semibold text-foreground uppercase tracking-wider">Macro Impact</h3>
              </div>
              <div className="divide-y divide-border">
                <div className="pb-4">
                  <div className="flex items-center gap-3 mb-2">
                    <span className="text-sm font-semibold text-foreground">Market Environment</span>
                    <span className={`text-sm font-medium ${getRiskColor(digest.macro_impact.risk_level)}`}>
                      Risk: {digest.macro_impact.risk_level}
                    </span>
                  </div>
                  <p className="text-sm text-muted-foreground leading-relaxed">{digest.macro_impact.overall_environment}</p>
                </div>
                <div className="py-4">
                  <span className="text-sm font-semibold text-foreground">Portfolio Impact</span>
                  <p className="text-sm text-muted-foreground leading-relaxed mt-2">{digest.macro_impact.impact_on_portfolio}</p>
                </div>
                <div className="pt-4">
                  <span className="text-sm font-semibold text-foreground">Risk Factors</span>
                  <p className="text-sm text-muted-foreground leading-relaxed mt-2">{digest.macro_impact.risk_factors}</p>
                </div>
              </div>
            </section>
          )}

          {/* Key Takeaway */}
          {digest.bottom_line && (
            <section className="bg-emerald-500/10 rounded-xl p-5 border border-emerald-500/20 animate-fade-in-up">
              <div className="flex items-center gap-2 mb-3">
                <div className="w-1 h-4 bg-emerald-500 rounded-full" />
                <h3 className="text-sm font-semibold text-emerald-600 dark:text-emerald-400 uppercase tracking-wider">Key Takeaway</h3>
              </div>
              <p className="text-sm text-foreground leading-relaxed">{digest.bottom_line}</p>
            </section>
          )}

          {/* Footer */}
          <div className="text-center pt-4 border-t border-border space-y-3">
            <p className="text-xs text-muted-foreground">
              AI-generated report for informational purposes only. Not financial advice.
            </p>
            <Link
              href="/brew"
              className="inline-flex items-center gap-2 text-sm text-emerald-600 dark:text-emerald-400 hover:underline"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
              Back to My Brew
            </Link>
          </div>
        </div>
      )}
    </main>
  );
}
