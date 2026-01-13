'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { api, SectorInfo, SectorDigestData, SectorSubscription } from '@/lib/api';
import { formatDateChinese, formatTimePacific, formatCalendarDate, isTodayPacific } from '@/lib/timezone';

export default function SectorsPage() {
  const router = useRouter();
  const { user, isLoading: authLoading, isAuthenticated } = useAuth();

  const [sectors, setSectors] = useState<SectorInfo[]>([]);
  const [subscriptions, setSubscriptions] = useState<string[]>([]);
  const [loadingSectors, setLoadingSectors] = useState(true);
  const [loadingSubscriptions, setLoadingSubscriptions] = useState(true);

  // Current selected sector and its digest
  const [selectedSector, setSelectedSector] = useState<SectorInfo | null>(null);
  const [digest, setDigest] = useState<SectorDigestData | null>(null);
  const [loadingDigest, setLoadingDigest] = useState(false);
  const [generatingDigest, setGeneratingDigest] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Subscription actions
  const [subscribingTo, setSubscribingTo] = useState<string | null>(null);

  // Redirect to login if not authenticated
  useEffect(() => {
    if (!authLoading && !isAuthenticated) {
      router.push('/login?redirect=/sectors');
    }
  }, [authLoading, isAuthenticated, router]);

  // Load sectors
  useEffect(() => {
    const loadSectors = async () => {
      try {
        const data = await api.sectors.list();
        setSectors(data);
      } catch (err) {
        console.error('Failed to load sectors:', err);
      } finally {
        setLoadingSectors(false);
      }
    };

    loadSectors();
  }, []);

  // Load user subscriptions
  useEffect(() => {
    const loadSubscriptions = async () => {
      if (!user?.id) return;

      try {
        const data = await api.sectors.getSubscriptions(user.id);
        setSubscriptions(data.map((s: SectorSubscription) => s.sector_id));
      } catch (err) {
        console.error('Failed to load subscriptions:', err);
      } finally {
        setLoadingSubscriptions(false);
      }
    };

    if (user?.id) {
      loadSubscriptions();
    }
  }, [user?.id]);

  // Handle subscription toggle
  const handleToggleSubscription = async (sectorId: string) => {
    if (!user?.id || subscribingTo) return;

    setSubscribingTo(sectorId);
    try {
      if (subscriptions.includes(sectorId)) {
        await api.sectors.unsubscribe(sectorId, user.id);
        setSubscriptions(subscriptions.filter(s => s !== sectorId));
      } else {
        await api.sectors.subscribe(sectorId, user.id);
        setSubscriptions([...subscriptions, sectorId]);
      }
    } catch (err) {
      console.error('Subscription action failed:', err);
    } finally {
      setSubscribingTo(null);
    }
  };

  // Handle sector selection
  const handleSelectSector = async (sector: SectorInfo) => {
    setSelectedSector(sector);
    setError(null);
    setLoadingDigest(true);
    setDigest(null);

    try {
      const data = await api.sectors.getLatestDigest(sector.id);
      setDigest(data);
    } catch (err) {
      console.error('Failed to load digest:', err);
    } finally {
      setLoadingDigest(false);
    }
  };

  // Generate new digest
  const handleGenerateDigest = async () => {
    if (!selectedSector) return;

    setGeneratingDigest(true);
    setError(null);

    try {
      const data = await api.sectors.generateDigest(selectedSector.id);
      setDigest(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to generate digest');
    } finally {
      setGeneratingDigest(false);
    }
  };

  if (authLoading) {
    return (
      <main className="min-h-screen bg-background">
        <div className="max-w-5xl mx-auto px-4 md:px-6 py-20">
          <div className="flex flex-col items-center justify-center gap-4">
            <div className="w-10 h-10 rounded-full border-2 border-emerald-500/20 border-t-emerald-500 animate-spin" />
            <p className="text-muted-foreground text-sm">Loading...</p>
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
      {/* Page Header */}
      <section className="border-b border-border/50">
        <div className="max-w-5xl mx-auto px-4 md:px-6 py-8 md:py-12">
          <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
            {/* Title Section */}
            <div className="space-y-3">
              {/* Section Label */}
              <div className="flex items-center gap-2">
                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                  Sector Tracking
                </span>
                {subscriptions.length > 0 && (
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-card text-muted-foreground border border-border/50">
                    {subscriptions.length} subscribed
                  </span>
                )}
              </div>

              {/* Main Title */}
              <h1 className="text-3xl md:text-4xl font-editorial text-foreground tracking-tight">
                Sector Tracking
              </h1>

              {/* Subtitle */}
              <p className="text-muted-foreground text-sm md:text-base max-w-lg">
                Subscribe to sectors you&apos;re interested in and receive daily sector-focused analysis
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Sectors Grid */}
      <section className="border-b border-border/50">
        <div className="max-w-5xl mx-auto px-4 md:px-6 py-8">
          <div className="terminal-card p-6">
            {/* Header */}
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center gap-2">
                <div className="w-1 h-5 bg-emerald-500 rounded-full" />
                <h3 className="text-sm font-medium text-foreground uppercase tracking-wider">Available Sectors</h3>
              </div>
            </div>

            {loadingSectors ? (
              <div className="flex items-center gap-2 text-muted-foreground py-4">
                <div className="w-4 h-4 rounded-full border-2 border-border border-t-emerald-500 animate-spin" />
                <span className="text-sm">Loading sectors...</span>
              </div>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
                {sectors.map((sector) => {
                  const isSubscribed = subscriptions.includes(sector.id);
                  const isSelected = selectedSector?.id === sector.id;
                  const isLoading = subscribingTo === sector.id;

                  return (
                    <div
                      key={sector.id}
                      className={`relative group rounded-lg border transition-all cursor-pointer ${
                        isSelected
                          ? 'bg-emerald-500/10 border-emerald-500/30'
                          : 'bg-card/50 hover:bg-card border-border/30 hover:border-emerald-500/20'
                      }`}
                    >
                      {/* Card content - clickable area */}
                      <button
                        onClick={() => handleSelectSector(sector)}
                        className="w-full p-4 text-left"
                      >
                        <div className="flex items-center justify-between mb-2">
                          <span className="font-semibold text-foreground text-sm">{sector.name_zh}</span>
                          <span className="text-xs font-data text-muted-foreground">{sector.symbol_count}</span>
                        </div>
                        <p className="text-xs text-muted-foreground mb-3 line-clamp-1">{sector.description}</p>
                        <div className="flex flex-wrap gap-1">
                          {sector.symbols.slice(0, 4).map((sym) => (
                            <span
                              key={sym}
                              className="px-1.5 py-0.5 bg-background/50 text-muted-foreground rounded text-xs font-data"
                            >
                              {sym}
                            </span>
                          ))}
                          {sector.symbols.length > 4 && (
                            <span className="text-xs text-muted-foreground font-data">+{sector.symbols.length - 4}</span>
                          )}
                        </div>
                      </button>

                      {/* Subscribe button */}
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleToggleSubscription(sector.id);
                        }}
                        disabled={isLoading || loadingSubscriptions}
                        className={`absolute top-3 right-3 p-1.5 rounded-full transition-all ${
                          isSubscribed
                            ? 'bg-emerald-500/20 text-emerald-400 hover:bg-red-500/20 hover:text-red-400'
                            : 'bg-card/80 text-muted-foreground hover:bg-emerald-500/10 hover:text-emerald-400'
                        }`}
                        title={isSubscribed ? 'Unsubscribe' : 'Subscribe'}
                      >
                        {isLoading ? (
                          <div className="w-4 h-4 rounded-full border-2 border-current border-t-transparent animate-spin" />
                        ) : isSubscribed ? (
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                          </svg>
                        ) : (
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                          </svg>
                        )}
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </section>

      {/* Selected Sector Content */}
      {selectedSector && (
        <div className="max-w-5xl mx-auto px-4 md:px-6 py-8">
          {/* Sector Header */}
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-3">
              <button
                onClick={() => {
                  setSelectedSector(null);
                  setDigest(null);
                }}
                className="p-2 rounded-lg bg-card border border-border/50 text-muted-foreground hover:text-foreground transition-all"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                </svg>
              </button>
              <div>
                <h2 className="text-xl font-medium text-foreground">{selectedSector.name_zh}</h2>
                <p className="text-sm text-muted-foreground">{selectedSector.name_en}</p>
              </div>
            </div>

            <button
              onClick={handleGenerateDigest}
              disabled={generatingDigest}
              className="px-5 py-2.5 bg-emerald-600 text-white rounded-lg font-medium text-sm transition-all hover:bg-emerald-500 hover:shadow-lg hover:shadow-emerald-500/20 disabled:opacity-50 disabled:cursor-not-allowed disabled:shadow-none flex items-center gap-2"
            >
              {generatingDigest ? (
                <>
                  <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  <span>Generating...</span>
                </>
              ) : (
                <>
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                  </svg>
                  <span>Generate Digest</span>
                </>
              )}
            </button>
          </div>

          {/* Error */}
          {error && (
            <div className="mb-6 p-4 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-sm text-center">
              {error}
            </div>
          )}

          {/* Loading Digest */}
          {loadingDigest && (
            <div className="py-20">
              <div className="flex flex-col items-center justify-center gap-4">
                <div className="w-10 h-10 rounded-full border-2 border-emerald-500/20 border-t-emerald-500 animate-spin" />
                <p className="text-muted-foreground text-sm">Loading digest...</p>
              </div>
            </div>
          )}

          {/* Generating Digest */}
          {generatingDigest && (
            <div className="py-20">
              <div className="flex flex-col items-center justify-center gap-4">
                <div className="w-10 h-10 rounded-full border-2 border-emerald-500/20 border-t-emerald-500 animate-spin" />
                <p className="text-muted-foreground text-sm">Analyzing {selectedSector.name_zh}...</p>
              </div>
            </div>
          )}

          {/* No Digest */}
          {!loadingDigest && !generatingDigest && !digest && (
            <div className="py-20">
              <div className="text-center space-y-6">
                <div className="w-20 h-20 mx-auto rounded-2xl bg-card border border-border/50 flex items-center justify-center">
                  <svg className="w-10 h-10 text-muted-foreground" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M13 10V3L4 14h7v7l9-11h-7z" />
                  </svg>
                </div>
                <div>
                  <h3 className="text-xl font-medium text-foreground mb-2">No digest yet</h3>
                  <p className="text-muted-foreground text-sm max-w-sm mx-auto">
                    Click &quot;Generate Digest&quot; to create an analysis for {selectedSector.name_zh}
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Digest Content */}
          {!loadingDigest && !generatingDigest && digest && (
            <div className="space-y-8">
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

                {/* Greeting */}
                <h2 className="text-2xl md:text-3xl font-editorial text-foreground leading-tight">
                  {digest.greeting}
                </h2>

                {/* Intro */}
                {digest.intro && (
                  <p className="text-muted-foreground mt-3 leading-relaxed">
                    {digest.intro}
                  </p>
                )}
              </section>

              {/* Stock Analysis */}
              {digest.stocks?.length > 0 && (
                <section className="terminal-card p-6 animate-fade-in-up">
                  <div className="flex items-center gap-2 mb-5">
                    <div className="w-1 h-5 bg-emerald-500 rounded-full" />
                    <h3 className="text-sm font-medium text-foreground uppercase tracking-wider">Key Stocks</h3>
                  </div>
                  <div className="divide-y divide-border/30">
                    {digest.stocks.map((stock) => (
                      <div key={stock.symbol} className="py-4 first:pt-0 last:pb-0">
                        <div className="flex items-center justify-between mb-2">
                          <div className="flex items-center gap-3">
                            <span className="font-semibold font-data text-foreground">{stock.symbol}</span>
                            <span className="text-sm text-muted-foreground">{stock.name}</span>
                          </div>
                          <span className={`font-medium font-data text-sm ${
                            stock.change_percent >= 0 ? 'text-emerald-400' : 'text-red-400'
                          }`}>
                            {stock.change_percent >= 0 ? '+' : ''}{stock.change_percent.toFixed(2)}%
                          </span>
                        </div>
                        <p className="text-sm text-muted-foreground leading-relaxed">{stock.analysis}</p>
                      </div>
                    ))}
                  </div>
                </section>
              )}

              {/* News */}
              {digest.news?.length > 0 && (
                <section className="terminal-card p-6 animate-fade-in-up">
                  <div className="flex items-center gap-2 mb-5">
                    <div className="w-1 h-5 bg-emerald-500 rounded-full" />
                    <h3 className="text-sm font-medium text-foreground uppercase tracking-wider">Sector News</h3>
                  </div>
                  <div className="divide-y divide-border/30">
                    {digest.news.map((item, index) => (
                      <div key={index} className="py-4 first:pt-0 last:pb-0">
                        {item.url ? (
                          <a
                            href={item.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="font-semibold text-foreground hover:text-emerald-400 transition-colors text-sm block mb-2"
                          >
                            {item.title}
                          </a>
                        ) : (
                          <h4 className="font-semibold text-foreground text-sm mb-2">{item.title}</h4>
                        )}
                        <p className="text-sm text-muted-foreground leading-relaxed">{item.summary}</p>
                      </div>
                    ))}
                  </div>
                </section>
              )}

              {/* Events */}
              {digest.events?.length > 0 && (
                <section className="terminal-card p-6 animate-fade-in-up">
                  <div className="flex items-center gap-2 mb-5">
                    <div className="w-1 h-5 bg-emerald-500 rounded-full" />
                    <h3 className="text-sm font-medium text-foreground uppercase tracking-wider">Upcoming Events</h3>
                  </div>
                  <div className="space-y-4">
                    {digest.events.map((event, index) => {
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
                            <span className="font-semibold text-foreground text-sm">{event.title}</span>
                            {event.description && (
                              <p className="text-sm text-muted-foreground leading-relaxed mt-1">{event.description}</p>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </section>
              )}

              {/* Summary (Deep Insights) */}
              {digest.summary && (
                <section className="terminal-card p-6 animate-fade-in-up">
                  <div className="flex items-center gap-2 mb-5">
                    <div className="w-1 h-5 bg-emerald-500 rounded-full" />
                    <h3 className="text-sm font-medium text-foreground uppercase tracking-wider">Insights & Outlook</h3>
                  </div>
                  <div className="space-y-4">
                    {digest.summary.split('\n\n').map((paragraph, index) => (
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
                  AI-generated report for reference only, not investment advice
                </p>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Empty State - when no sector selected */}
      {!selectedSector && !loadingSectors && (
        <div className="max-w-5xl mx-auto px-4 md:px-6 py-20">
          <div className="text-center space-y-6">
            <div className="w-20 h-20 mx-auto rounded-2xl bg-card border border-border/50 flex items-center justify-center">
              <svg className="w-10 h-10 text-muted-foreground" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 5a1 1 0 011-1h14a1 1 0 011 1v2a1 1 0 01-1 1H5a1 1 0 01-1-1V5zM4 13a1 1 0 011-1h6a1 1 0 011 1v6a1 1 0 01-1 1H5a1 1 0 01-1-1v-6zM16 13a1 1 0 011-1h2a1 1 0 011 1v6a1 1 0 01-1 1h-2a1 1 0 01-1-1v-6z" />
              </svg>
            </div>
            <div>
              <h3 className="text-xl font-medium text-foreground mb-2">Select a sector</h3>
              <p className="text-muted-foreground text-sm max-w-sm mx-auto">
                Click on a sector above to view its digest or subscribe to receive daily updates
              </p>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
