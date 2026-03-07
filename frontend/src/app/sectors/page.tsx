'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { RefreshCw } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import PaywallGuard from '@/components/PaywallGuard';
import { api, SectorInfo, SectorDigestData, SectorSubscription, StockQuote, SectorDigestHistoryItem, SectorStockAnalysis, SectorNews, SectorEvent } from '@/lib/api';
import { formatDateChinese, formatTimePacific, formatCalendarDate, formatDateShort, formatCompactTimestamp } from '@/lib/timezone';
import SectorPanel from '@/components/SectorPanel';

// Stock name mapping
const STOCK_NAMES: Record<string, { en: string; zh: string }> = {
  'AAPL': { en: 'Apple Inc.', zh: '苹果' },
  'MSFT': { en: 'Microsoft Corp.', zh: '微软' },
  'NVDA': { en: 'NVIDIA Corp.', zh: '英伟达' },
  'GOOGL': { en: 'Alphabet Inc.', zh: '谷歌' },
  'GOOG': { en: 'Alphabet Inc.', zh: '谷歌' },
  'AMZN': { en: 'Amazon.com Inc.', zh: '亚马逊' },
  'META': { en: 'Meta Platforms', zh: 'Meta' },
  'TSLA': { en: 'Tesla Inc.', zh: '特斯拉' },
  'AMD': { en: 'AMD Inc.', zh: 'AMD' },
  'INTC': { en: 'Intel Corp.', zh: '英特尔' },
  'AVGO': { en: 'Broadcom Inc.', zh: '博通' },
  'TSM': { en: 'TSMC', zh: '台积电' },
  'BABA': { en: 'Alibaba Group', zh: '阿里巴巴' },
  'JD': { en: 'JD.com Inc.', zh: '京东' },
  'PDD': { en: 'PDD Holdings', zh: '拼多多' },
  'BIDU': { en: 'Baidu Inc.', zh: '百度' },
  'NIO': { en: 'NIO Inc.', zh: '蔚来' },
  'LI': { en: 'Li Auto Inc.', zh: '理想' },
  'XPEV': { en: 'XPeng Inc.', zh: '小鹏' },
  'JPM': { en: 'JPMorgan Chase', zh: '摩根大通' },
  'BAC': { en: 'Bank of America', zh: '美国银行' },
  'GS': { en: 'Goldman Sachs', zh: '高盛' },
  'MS': { en: 'Morgan Stanley', zh: '摩根士丹利' },
  'WFC': { en: 'Wells Fargo', zh: '富国银行' },
  'V': { en: 'Visa Inc.', zh: 'Visa' },
  'MA': { en: 'Mastercard', zh: '万事达' },
  'BRK.B': { en: 'Berkshire Hathaway', zh: '伯克希尔' },
  'UNH': { en: 'UnitedHealth', zh: '联合健康' },
  'JNJ': { en: 'Johnson & Johnson', zh: '强生' },
  'XOM': { en: 'Exxon Mobil', zh: '埃克森美孚' },
  'CVX': { en: 'Chevron Corp.', zh: '雪佛龙' },
  'COST': { en: 'Costco', zh: '好市多' },
  'WMT': { en: 'Walmart', zh: '沃尔玛' },
  'HD': { en: 'Home Depot', zh: '家得宝' },
  'MCD': { en: 'McDonald\'s', zh: '麦当劳' },
  'SBUX': { en: 'Starbucks', zh: '星巴克' },
  'DIS': { en: 'Walt Disney', zh: '迪士尼' },
  'NFLX': { en: 'Netflix', zh: '奈飞' },
  'CRM': { en: 'Salesforce', zh: 'Salesforce' },
  'ORCL': { en: 'Oracle Corp.', zh: '甲骨文' },
  'ADBE': { en: 'Adobe Inc.', zh: 'Adobe' },
  'NOW': { en: 'ServiceNow', zh: 'ServiceNow' },
  'COIN': { en: 'Coinbase', zh: 'Coinbase' },
  'PLTR': { en: 'Palantir', zh: 'Palantir' },
  'SNOW': { en: 'Snowflake', zh: 'Snowflake' },
  'ARM': { en: 'Arm Holdings', zh: 'Arm' },
  'UBER': { en: 'Uber Technologies', zh: 'Uber' },
  'ABNB': { en: 'Airbnb', zh: 'Airbnb' },
};

function NewsTimestamp({ timestamp }: { timestamp?: string }) {
  if (!timestamp) return null;

  return (
    <div className="flex items-center gap-2 pl-1 text-[11px] leading-none text-muted-foreground/75 font-data mt-1.5 mb-2.5">
      <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full border border-border/60 bg-muted/50">
        <svg className="w-2.5 h-2.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M12 8v4l2.5 2.5m6.5-2.5a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      </span>
      <span>{formatCompactTimestamp(timestamp)}</span>
    </div>
  );
}

function SectorsPageContent() {
  const router = useRouter();
  const { user, isLoading: authLoading, isAuthenticated } = useAuth();

  // Sectors data
  const [sectors, setSectors] = useState<SectorInfo[]>([]);
  const [subscriptions, setSubscriptions] = useState<string[]>([]);
  const [loadingSectors, setLoadingSectors] = useState(true);

  // Current selected sector and its digest
  const [selectedSectorId, setSelectedSectorId] = useState<string | null>(null);
  const [digest, setDigest] = useState<SectorDigestData | null>(null);
  const [loadingDigest, setLoadingDigest] = useState(false);
  const [generatingDigest, setGeneratingDigest] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Historical digests
  const [history, setHistory] = useState<SectorDigestHistoryItem[]>([]);
  const [totalHistory, setTotalHistory] = useState(0);

  // Stock quotes
  const [quotes, setQuotes] = useState<Record<string, StockQuote>>({});

  // Subscription action state
  const [subscribingTo, setSubscribingTo] = useState<string | null>(null);

  // Computed: selected sector object
  const selectedSector = sectors.find((s) => s.id === selectedSectorId);

  // Collect all symbols from all sectors
  const getAllSymbols = useCallback(() => {
    const allSymbols = new Set<string>();
    sectors.forEach((s) => s.symbols.forEach((sym) => allSymbols.add(sym)));
    return Array.from(allSymbols);
  }, [sectors]);

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
        // Auto-select first sector if none selected
        if (data.length > 0 && !selectedSectorId) {
          setSelectedSectorId(data[0].id);
        }
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
        const data = await api.sectors.getSubscriptions();
        setSubscriptions(data.map((s: SectorSubscription) => s.sector_id));
      } catch (err) {
        console.error('Failed to load subscriptions:', err);
      }
    };

    if (user?.id) {
      loadSubscriptions();
    }
  }, [user?.id]);

  // Load quotes for all sector stocks
  useEffect(() => {
    const fetchQuotes = async () => {
      const allSymbols = getAllSymbols();
      if (allSymbols.length === 0) return;

      try {
        const result = await api.getStockQuotes(allSymbols);
        const quotesMap: Record<string, StockQuote> = {};
        result.quotes.forEach((q: StockQuote) => {
          quotesMap[q.symbol] = q;
        });
        setQuotes(quotesMap);
      } catch (err) {
        console.error('Failed to fetch quotes:', err);
      }
    };

    if (sectors.length > 0) {
      fetchQuotes();
    }
  }, [sectors, getAllSymbols]);

  // Load digest when sector changes
  useEffect(() => {
    const loadDigest = async () => {
      if (!selectedSectorId) return;

      setLoadingDigest(true);
      setDigest(null);
      setError(null);

      try {
        const data = await api.sectors.getLatestDigest(selectedSectorId);
        setDigest(data);
      } catch (err) {
        console.error('Failed to load digest:', err);
      } finally {
        setLoadingDigest(false);
      }
    };

    loadDigest();
  }, [selectedSectorId]);

  // Load history when sector changes
  useEffect(() => {
    const loadHistory = async () => {
      if (!selectedSectorId) return;

      try {
        const response = await api.sectors.getHistory(selectedSectorId, 30);
        setHistory(response.digests);
        setTotalHistory(response.total || response.digests.length);
      } catch (err) {
        console.error('Failed to load history:', err);
      }
    };

    loadHistory();
  }, [selectedSectorId]);

  // Handle sector selection
  const handleSelectSector = (sectorId: string) => {
    setSelectedSectorId(sectorId);
  };

  // Handle subscription toggle
  const handleToggleSubscription = async (sectorId: string) => {
    if (!user?.id || subscribingTo) return;

    setSubscribingTo(sectorId);
    try {
      if (subscriptions.includes(sectorId)) {
        await api.sectors.unsubscribe(sectorId);
        setSubscriptions(subscriptions.filter((s) => s !== sectorId));
      } else {
        await api.sectors.subscribe(sectorId);
        setSubscriptions([...subscriptions, sectorId]);
      }
    } catch (err) {
      console.error('Subscription action failed:', err);
    } finally {
      setSubscribingTo(null);
    }
  };

  // Generate new digest
  const handleGenerateDigest = async () => {
    if (!selectedSectorId) return;

    setGeneratingDigest(true);
    setError(null);

    try {
      const data = await api.sectors.generateDigest(selectedSectorId);
      setDigest(data);

      // Reload history after generation
      const response = await api.sectors.getHistory(selectedSectorId, 30);
      setHistory(response.digests);
      setTotalHistory(response.total || response.digests.length);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to generate digest');
    } finally {
      setGeneratingDigest(false);
    }
  };

  // Loading state
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
      {/* Page Header */}
      <section className="border-b border-border/50">
        <div className="max-w-5xl mx-auto px-4 md:px-6 py-8 md:py-12">
          <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
            {/* Title Section */}
            <div className="space-y-3">
              {/* Section Label */}
              <div className="flex items-center gap-3">
                <div className="h-px flex-1 max-w-[60px] bg-gradient-to-r from-primary to-transparent" />
                <span className="text-primary text-xs font-medium tracking-[0.2em] uppercase">SECTORS</span>
                {subscriptions.length > 0 && (
                  <span className="text-muted-foreground text-xs font-medium tracking-[0.15em] ml-2">/ {subscriptions.length} SUBSCRIBED</span>
                )}
              </div>

              {/* Main Title */}
              <h1 className="text-3xl md:text-4xl font-editorial text-foreground tracking-tight">
                板块日报
              </h1>

              {/* Subtitle */}
              <p className="text-muted-foreground text-sm md:text-base max-w-lg">
                按行业板块追踪市场动态，获取专业投资洞察
              </p>
            </div>

            {/* Action Buttons */}
            <div className="flex items-center gap-3">
              {/* Subscribe button for selected sector */}
              <button
                onClick={() => selectedSectorId && handleToggleSubscription(selectedSectorId)}
                disabled={!selectedSectorId || subscribingTo !== null}
                className={`px-4 py-2.5 rounded-lg font-medium text-sm border transition-all flex items-center gap-2 group ${
                  selectedSectorId && subscriptions.includes(selectedSectorId)
                    ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20 hover:bg-red-500/10 hover:text-red-400 hover:border-red-500/20'
                    : 'bg-card text-foreground border-border/50 hover:border-emerald-500/30'
                } disabled:opacity-50 disabled:cursor-not-allowed`}
              >
                {subscribingTo !== null ? (
                  <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                ) : selectedSectorId && subscriptions.includes(selectedSectorId) ? (
                  <>
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M5 13l4 4L19 7" />
                    </svg>
                    <span>已订阅</span>
                  </>
                ) : (
                  <>
                    <svg className="w-4 h-4 text-muted-foreground group-hover:text-emerald-400 transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
                    </svg>
                    <span>订阅</span>
                  </>
                )}
              </button>

              {/* Generate button */}
              <button
                onClick={handleGenerateDigest}
                disabled={!selectedSectorId || generatingDigest}
                className="px-5 py-2.5 bg-emerald-600 text-white rounded-lg font-medium text-sm transition-all hover:bg-emerald-500 hover:shadow-lg hover:shadow-emerald-500/20 disabled:opacity-50 disabled:cursor-not-allowed disabled:shadow-none flex items-center gap-2"
              >
                {generatingDigest ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    <span>生成中...</span>
                  </>
                ) : (
                  <>
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                    </svg>
                    <span>生成日报</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* Sector Panel */}
      <SectorPanel
        sectors={sectors}
        selectedSectorId={selectedSectorId}
        subscribedSectorIds={subscriptions}
        quotes={quotes}
        stockNames={STOCK_NAMES}
        isLoading={loadingSectors}
        onSelectSector={handleSelectSector}
        onToggleSubscription={handleToggleSubscription}
        subscribingTo={subscribingTo}
      />

      {/* Error */}
      {error && (
        <div className="max-w-5xl mx-auto px-4 md:px-6 py-4">
          <div className="p-4 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-sm text-center">
            {error}
          </div>
        </div>
      )}

      {/* Loading State */}
      {(loadingDigest || generatingDigest) && (
        <div className="max-w-5xl mx-auto px-4 md:px-6 py-20">
          <div className="flex flex-col items-center justify-center gap-4">
            <div className="w-10 h-10 rounded-full border-2 border-emerald-500/20 border-t-emerald-500 animate-spin" />
            <p className="text-muted-foreground text-sm">
              {generatingDigest ? `正在分析 ${selectedSector?.name_zh || '板块'}...` : '加载日报...'}
            </p>
          </div>
        </div>
      )}

      {/* Main Content - Digest */}
      {!loadingDigest && !generatingDigest && digest && (
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

          {/* Stock Overview */}
          {digest.stocks && digest.stocks.length > 0 && (
            <section className="terminal-card p-6 animate-fade-in-up">
              <div className="flex items-center gap-2 mb-5">
                <div className="w-1 h-5 bg-emerald-500 rounded-full" />
                <h3 className="text-sm font-medium text-foreground uppercase tracking-wider">个股概览</h3>
              </div>
              <div className="divide-y divide-border/30">
                {digest.stocks.map((stock: SectorStockAnalysis) => {
                  const isPositive = stock.change_percent >= 0;
                  return (
                    <div key={stock.symbol} className="py-4 first:pt-0 last:pb-0">
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-3">
                          <span className="font-semibold font-data text-foreground">{stock.symbol}</span>
                          <span className="text-sm text-muted-foreground">{stock.name}</span>
                        </div>
                        <span className={`px-2 py-0.5 rounded text-xs font-medium font-data ${
                          isPositive ? 'text-emerald-400 bg-emerald-500/10' : 'text-red-400 bg-red-500/10'
                        }`}>
                          {isPositive ? '+' : ''}{stock.change_percent.toFixed(2)}%
                        </span>
                      </div>
                      <p className="text-sm text-muted-foreground leading-relaxed">{stock.analysis}</p>
                    </div>
                  );
                })}
              </div>
            </section>
          )}

          {/* News */}
          {digest.news && digest.news.length > 0 && (
            <section className="terminal-card p-6 animate-fade-in-up">
              <div className="flex items-center gap-2 mb-5">
                <div className="w-1 h-5 bg-emerald-500 rounded-full" />
                <h3 className="text-sm font-medium text-foreground uppercase tracking-wider">板块新闻</h3>
              </div>
              <div className="divide-y divide-border/30">
                {digest.news.map((item: SectorNews, index: number) => (
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
                      <span className="font-semibold text-foreground text-sm block mb-2">
                        {item.title}
                      </span>
                    )}
                    <NewsTimestamp timestamp={item.published_at} />
                    <p className="text-sm text-muted-foreground leading-relaxed">{item.summary}</p>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* Key Events */}
          {digest.events && digest.events.length > 0 && (
            <section className="terminal-card p-6 animate-fade-in-up">
              <div className="flex items-center gap-2 mb-5">
                <div className="w-1 h-5 bg-emerald-500 rounded-full" />
                <h3 className="text-sm font-medium text-foreground uppercase tracking-wider">重要事件</h3>
              </div>
              <div className="space-y-4">
                {digest.events.map((event: SectorEvent, index: number) => {
                  const dateStr = event.date.split('T')[0];
                  const calendarDate = formatCalendarDate(dateStr);

                  return (
                    <div key={index} className="flex gap-4">
                      <div className="flex-shrink-0 w-14 rounded-lg p-2 text-center border bg-card border-border/30">
                        <p className="text-xs font-data uppercase text-muted-foreground">
                          {calendarDate.month}
                        </p>
                        <p className="text-xl font-semibold font-data text-foreground">
                          {calendarDate.day}
                        </p>
                      </div>
                      <div className="flex-1 min-w-0">
                        <span className="font-semibold text-foreground text-sm block mb-1">{event.title}</span>
                        {event.description && (
                          <p className="text-sm text-muted-foreground leading-relaxed">{event.description}</p>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>
          )}

          {/* Summary */}
          {digest.summary && (
            <section className="terminal-card p-6 animate-fade-in-up">
              <div className="flex items-center gap-2 mb-5">
                <div className="w-1 h-5 bg-emerald-500 rounded-full" />
                <h3 className="text-sm font-medium text-foreground uppercase tracking-wider">总结</h3>
              </div>
              <div className="space-y-4">
                {digest.summary.split('\n\n').map((paragraph: string, index: number) => (
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

      {/* Empty State - No Digest */}
      {!loadingDigest && !generatingDigest && !digest && selectedSector && (
        <div className="max-w-5xl mx-auto px-4 md:px-6 py-20">
          <div className="text-center space-y-6">
            <div className="w-20 h-20 mx-auto rounded-2xl bg-card border border-border/50 flex items-center justify-center">
              <svg className="w-10 h-10 text-muted-foreground" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
            </div>
            <div>
              <h3 className="text-xl font-medium text-foreground mb-2">生成板块日报</h3>
              <p className="text-muted-foreground text-sm max-w-sm mx-auto">
                点击「生成日报」按钮获取 {selectedSector.name_zh} 的 AI 分析报告
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Historical Reports Section */}
      {history.length > 0 && (
        <section className="border-t border-border/50 mt-12">
          <div className="max-w-5xl mx-auto px-4 md:px-6 py-10">
            {/* Section Header */}
            <div className="flex items-center justify-between mb-8">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <div className="w-1 h-5 bg-emerald-500 rounded-full" />
                  <h3 className="text-xl font-medium text-foreground">往期报告</h3>
                </div>
                <p className="text-sm text-muted-foreground pl-3">{totalHistory} 份 {selectedSector?.name_zh} 报告存档</p>
              </div>
              <Link
                href="/sectors/archive"
                className="text-sm text-emerald-400 hover:text-emerald-300 transition-colors flex items-center gap-1 group"
              >
                查看全部
                <svg className="w-4 h-4 transition-transform group-hover:translate-x-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </Link>
            </div>

            {/* Report Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4">
              {history.slice(0, 5).map((item) => {
                const shortDate = formatDateShort(item.digest_date);
                return (
                  <Link
                    key={item.id}
                    href={`/sectors/${item.sector_id}?date=${item.digest_date}`}
                    className="group terminal-card p-4 hover:border-emerald-500/30 transition-all"
                  >
                    <div className="flex items-center justify-between mb-3">
                      <span className="text-xs font-data text-emerald-400 bg-emerald-500/10 px-2 py-1 rounded">
                        {shortDate}
                      </span>
                      <svg className="w-4 h-4 text-muted-foreground group-hover:text-emerald-400 transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                      </svg>
                    </div>
                    <h4 className="text-sm font-medium text-foreground line-clamp-2 group-hover:text-emerald-400 transition-colors leading-snug">
                      {item.greeting || formatDateChinese(item.digest_date)}
                    </h4>
                  </Link>
                );
              })}
            </div>
          </div>
        </section>
      )}
    </main>
  );
}

export default function SectorsPage() {
  return (
    <PaywallGuard>
      <SectorsPageContent />
    </PaywallGuard>
  );
}
