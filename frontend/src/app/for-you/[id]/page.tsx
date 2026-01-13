'use client';

import { useState, useEffect, use } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '@/contexts/AuthContext';
import { getUserDigestById } from '@/lib/insforge';
import { DigestResponse, StockAnalysis, DigestHeadlineNews, DigestBriefNews, DigestEvent } from '@/lib/api';
import { formatDateChinese, formatTimePacific, formatCalendarDate, isTodayPacific } from '@/lib/timezone';

export default function ForYouDetailPage({
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
      router.push(`/login?redirect=/for-you/${id}`);
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
          setError('Report not found');
          return;
        }

        // Verify ownership
        if (historyItem.user_id !== user.id) {
          setError('You do not have access to this report');
          return;
        }

        // Convert to DigestResponse format
        const digestData = historyItem.digest_data || {};
        const digestFromHistory: DigestResponse = {
          success: true,
          timestamp: historyItem.created_at || '',
          symbols_used: historyItem.symbols,
          greeting: historyItem.greeting || '',
          one_line_summary: historyItem.one_line_summary || '',
          stocks: digestData.stocks || [],
          news: digestData.news || { headlines: [], briefs: [] },
          events: digestData.events || [],
          summary: digestData.summary || {
            content: historyItem.bottom_line || historyItem.analysis || '',
          },
        };
        setDigest(digestFromHistory);
      } catch (err) {
        console.error('Failed to load digest:', err);
        setError('Failed to load report');
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
      return 'text-emerald-400 bg-emerald-500/10';
    } else if (status.includes('down') || status.includes('weak') || status.includes('fall')) {
      return 'text-red-400 bg-red-500/10';
    }
    return 'text-muted-foreground bg-card';
  };

  // Show loading while checking auth
  if (authLoading) {
    return (
      <main className="min-h-screen bg-background">
        <div className="max-w-5xl mx-auto px-4 md:px-6 py-20">
          <div className="flex flex-col items-center justify-center gap-4">
            <div className="w-10 h-10 rounded-full border-2 border-emerald-500/20 border-t-emerald-500 animate-spin" />
            <p className="text-muted-foreground text-sm">加载中...</p>
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
      {/* Back Navigation */}
      <div className="border-b border-border/50">
        <div className="max-w-5xl mx-auto px-4 md:px-6 py-3">
          <Link
            href="/for-you"
            className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
            返回专属日报
          </Link>
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="max-w-5xl mx-auto px-4 md:px-6 py-4">
          <div className="p-4 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-sm text-center">
            {error}
          </div>
        </div>
      )}

      {/* Loading State */}
      {loading && (
        <div className="max-w-5xl mx-auto px-4 md:px-6 py-20">
          <div className="flex flex-col items-center justify-center gap-4">
            <div className="w-10 h-10 rounded-full border-2 border-emerald-500/20 border-t-emerald-500 animate-spin" />
            <p className="text-muted-foreground text-sm">加载报告...</p>
          </div>
        </div>
      )}

      {/* Main Content */}
      {!loading && digest && (
        <div className="max-w-5xl mx-auto px-4 md:px-6 py-8 space-y-8">
          {/* Report Header */}
          <section className="animate-fade-in-up">
            {/* Date & Time */}
            <div className="flex items-center gap-3 mb-4">
              <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-card border border-border/50">
                <svg className="w-4 h-4 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
                <span className="text-sm font-data text-foreground">{formatDateChinese(digest.timestamp)}</span>
              </div>
              <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-card border border-border/50">
                <svg className="w-4 h-4 text-muted-foreground" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <span className="text-sm font-data text-muted-foreground">{formatTimePacific(digest.timestamp)}</span>
              </div>
            </div>

            {/* Greeting as Title */}
            <h2 className="text-2xl md:text-3xl font-editorial text-foreground leading-tight">
              {digest.greeting}
            </h2>

            {/* Summary */}
            {digest.one_line_summary && (
              <p className="text-muted-foreground mt-3 leading-relaxed">
                {digest.one_line_summary}
              </p>
            )}

            {/* Tracked symbols */}
            <div className="flex flex-wrap gap-1.5 mt-4">
              {digest.symbols_used.map((sym) => (
                <span key={sym} className="px-2 py-1 bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 rounded text-xs font-data">
                  {sym}
                </span>
              ))}
            </div>
          </section>

          {/* Watchlist Overview */}
          {digest.stocks.length > 0 && (
            <section className="terminal-card p-6 animate-fade-in-up">
              <div className="flex items-center gap-2 mb-5">
                <div className="w-1 h-5 bg-emerald-500 rounded-full" />
                <h3 className="text-sm font-medium text-foreground uppercase tracking-wider">持仓概览</h3>
              </div>
              <div className="divide-y divide-border/30">
                {digest.stocks.map((stock: StockAnalysis) => (
                  <div key={stock.symbol} className="py-4 first:pt-0 last:pb-0">
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-3">
                        <span className="font-semibold font-data text-foreground">{stock.symbol}</span>
                        <span className="text-sm text-muted-foreground">{stock.name}</span>
                      </div>
                      <span className={`px-2 py-0.5 rounded text-xs font-medium ${getStatusColor(stock.status)}`}>
                        {stock.status}
                      </span>
                    </div>
                    <div className="flex items-center gap-4 text-sm mb-2">
                      <span className="text-foreground font-medium font-data">${stock.price.toFixed(2)}</span>
                      <span className={`font-data ${stock.daily_change.startsWith('+') ? 'text-emerald-400' : 'text-red-400'}`}>
                        {stock.daily_change}
                      </span>
                      <span className="text-muted-foreground/50">|</span>
                      <span className={`font-data ${stock.week_change.startsWith('+') ? 'text-emerald-400' : 'text-red-400'}`}>
                        {stock.week_change} (周)
                      </span>
                    </div>
                    <p className="text-sm text-muted-foreground leading-relaxed">{stock.quick_take}</p>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* Headlines News */}
          {digest.news.headlines && digest.news.headlines.length > 0 && (
            <section className="terminal-card p-6 animate-fade-in-up">
              <div className="flex items-center gap-2 mb-5">
                <div className="w-1 h-5 bg-emerald-500 rounded-full" />
                <h3 className="text-sm font-medium text-foreground uppercase tracking-wider">头条新闻</h3>
              </div>
              <div className="divide-y divide-border/30">
                {digest.news.headlines.map((item: DigestHeadlineNews, index: number) => (
                  <div key={index} className="py-4 first:pt-0 last:pb-0">
                    <div className="flex items-start justify-between gap-2 mb-2">
                      <a
                        href={item.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="font-semibold text-foreground hover:text-emerald-400 transition-colors text-sm"
                      >
                        {item.title}
                      </a>
                      {item.related_symbols.length > 0 && (
                        <div className="flex gap-1 shrink-0">
                          {item.related_symbols.map((sym: string) => (
                            <span key={sym} className="px-1.5 py-0.5 bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 rounded text-xs font-data">
                              {sym}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                    <p className="text-sm text-foreground/90 mb-2">{item.fact_summary}</p>
                    <p className="text-sm text-muted-foreground leading-relaxed">{item.deep_analysis}</p>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* Brief News */}
          {digest.news.briefs && digest.news.briefs.length > 0 && (
            <section className="terminal-card p-6 animate-fade-in-up">
              <div className="flex items-center gap-2 mb-5">
                <div className="w-1 h-5 bg-emerald-500 rounded-full" />
                <h3 className="text-sm font-medium text-foreground uppercase tracking-wider">更多新闻</h3>
              </div>
              <div className="divide-y divide-border/30">
                {digest.news.briefs.map((item: DigestBriefNews, index: number) => (
                  <div key={index} className="py-3 first:pt-0 last:pb-0">
                    <div className="flex items-start justify-between gap-2 mb-1">
                      <a
                        href={item.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="font-medium text-foreground hover:text-emerald-400 transition-colors text-sm"
                      >
                        {item.title}
                      </a>
                      {item.related_symbols.length > 0 && (
                        <div className="flex gap-1 shrink-0">
                          {item.related_symbols.map((sym: string) => (
                            <span key={sym} className="px-1.5 py-0.5 bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 rounded text-xs font-data">
                              {sym}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground">{item.summary}</p>
                    <p className="text-xs text-muted-foreground leading-relaxed mt-1">{item.analysis}</p>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* Key Events */}
          {digest.events.length > 0 && (
            <section className="terminal-card p-6 animate-fade-in-up">
              <div className="flex items-center gap-2 mb-5">
                <div className="w-1 h-5 bg-emerald-500 rounded-full" />
                <h3 className="text-sm font-medium text-foreground uppercase tracking-wider">重要事件</h3>
              </div>
              <div className="space-y-4">
                {digest.events.map((event: DigestEvent, index: number) => {
                  const dateStr = event.date.split('T')[0];
                  const calendarDate = formatCalendarDate(dateStr);
                  const isToday = isTodayPacific(dateStr);

                  return (
                    <div key={index} className="flex gap-4">
                      <div className={`flex-shrink-0 w-14 rounded-lg p-2 text-center border ${
                        isToday
                          ? 'bg-emerald-500/10 border-emerald-500/20'
                          : 'bg-card border-border/30'
                      }`}>
                        <p className={`text-xs font-data uppercase ${isToday ? 'text-emerald-400' : 'text-muted-foreground'}`}>
                          {calendarDate.month}
                        </p>
                        <p className={`text-xl font-semibold font-data ${isToday ? 'text-emerald-400' : 'text-foreground'}`}>
                          {calendarDate.day}
                        </p>
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-start justify-between gap-2 mb-1">
                          <span className="font-semibold text-foreground text-sm">{event.event}</span>
                          {event.related_symbols.length > 0 && (
                            <div className="flex gap-1 shrink-0">
                              {event.related_symbols.map((sym: string) => (
                                <span key={sym} className="px-1.5 py-0.5 bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 rounded text-xs font-data">
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

          {/* Summary */}
          {digest.summary?.content && (
            <section className="terminal-card p-6 animate-fade-in-up">
              <div className="flex items-center gap-2 mb-5">
                <div className="w-1 h-5 bg-emerald-500 rounded-full" />
                <h3 className="text-sm font-medium text-foreground uppercase tracking-wider">总结</h3>
              </div>
              <div className="space-y-4">
                {digest.summary.content.split('\n\n').map((paragraph, index) => (
                  paragraph.trim() && (
                    <p key={index} className="text-sm text-muted-foreground leading-relaxed">
                      {paragraph.trim()}
                    </p>
                  )
                ))}
              </div>
            </section>
          )}

          {/* Disclaimer */}
          <div className="text-center pt-4 border-t border-border/30">
            <p className="text-xs text-muted-foreground/60">
              AI 生成的报告仅供参考,不构成投资建议
            </p>
          </div>
        </div>
      )}
    </main>
  );
}
