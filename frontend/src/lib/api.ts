const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000/api';

// ============================================================================
// Client-side cache with TTL + request coalescing
// ============================================================================

const DEFAULT_CACHE_TTL = 5 * 60 * 1000; // 5 minutes

interface CacheEntry<T> {
  data: T;
  timestamp: number;
}

const MAX_CACHE_SIZE = 100;
const _cache = new Map<string, CacheEntry<unknown>>();
const _inflight = new Map<string, Promise<unknown>>();

function cachedFetch<T>(key: string, fetcher: () => Promise<T>, ttl = DEFAULT_CACHE_TTL): Promise<T> {
  // Skip cache on server-side (SSR)
  if (typeof window === 'undefined') return fetcher();

  // Return cached data if still fresh
  const cached = _cache.get(key);
  if (cached && Date.now() - cached.timestamp < ttl) {
    return Promise.resolve(cached.data as T);
  }

  // Coalesce concurrent requests for the same key
  const inflight = _inflight.get(key);
  if (inflight) return inflight as Promise<T>;

  const promise = fetcher().then((data) => {
    // Evict oldest entries if cache is full
    if (_cache.size >= MAX_CACHE_SIZE) {
      const oldestKey = _cache.keys().next().value;
      if (oldestKey !== undefined) _cache.delete(oldestKey);
    }
    _cache.set(key, { data, timestamp: Date.now() });
    _inflight.delete(key);
    return data;
  }).catch((err) => {
    _inflight.delete(key);
    throw err;
  });

  _inflight.set(key, promise);
  return promise;
}

/** Invalidate a specific cache key, or clear the entire cache if no key is given */
export function invalidateCache(key?: string) {
  if (key) {
    _cache.delete(key);
    _inflight.delete(key);
  } else {
    _cache.clear();
    _inflight.clear();
  }
}

export interface MarketIndex {
  name: string;
  value: number;
  previous_value?: number;
  change_percent?: number;
}

export interface EconomicEvent {
  date: string;
  event: string;
  previous?: string | number | null;
  estimate?: string | number | null;
  is_key_event?: boolean;
}

export interface EarningsEvent {
  symbol: string;
  date: string;
  epsEstimated?: number | null;
  revenueEstimated?: number | null;
  is_ai_related?: boolean;
}

export interface CalendarEvent {
  date: string;
  event: string;
  analysis: string;
}

// New structured types for market report
export interface MacroSignal {
  name: string;
  current_value: string;
  change: string;
  trend_direction: 'up' | 'down' | 'flat';
  analysis: string;
}

export interface MacroSection {
  signals: MacroSignal[];
  summary: string;
}

export interface HeadlineNews {
  title: string;
  fact_summary: string;
  deep_analysis: string;
  url: string;
}

export interface BriefNews {
  title: string;
  summary: string;
  analysis: string;
  url: string;
}

export interface NewsSection {
  headlines: HeadlineNews[];
  briefs: BriefNews[];
}

// MarketData from backend API - matches database schema (snake_case)
export interface MarketData {
  report_id?: string;
  indices: MarketIndex[];
  timestamp: string;
  title?: string;
  summary?: string;
  intro?: string;
  macro?: MacroSection;
  news?: NewsSection;
  report_summary?: string;
  calendar?: CalendarEvent[];
  market_data?: unknown;
  from_cache?: boolean;
}

export interface SendEmailResponse {
  success: boolean;
  message: string;
  email_id?: string;
  sent_to?: string;
}

// PersonalDigest Types

export interface StockAnalysis {
  symbol: string;
  name: string;
  price: number;
  daily_change: string;
  week_change: string;
  status: string;
  quick_take: string;
}

export interface DigestHeadlineNews {
  title: string;
  related_symbols: string[];
  fact_summary: string;
  deep_analysis: string;
  url: string;
}

export interface DigestBriefNews {
  title: string;
  related_symbols: string[];
  summary: string;
  analysis: string;
  url: string;
}

export interface DigestNewsSection {
  headlines: DigestHeadlineNews[];
  briefs: DigestBriefNews[];
}

export interface DigestEvent {
  date: string;
  event: string;
  related_symbols: string[];
  why_important: string;
}

export interface DigestSummary {
  content: string;
}

export interface DigestResponse {
  success: boolean;
  timestamp: string;
  symbols_used: string[];

  // Header
  greeting: string;
  one_line_summary: string;

  // Section 1: Portfolio Overview
  stocks: StockAnalysis[];

  // Section 2: News (Headline + Brief structure)
  news: DigestNewsSection;

  // Section 3: Upcoming Events
  events: DigestEvent[];

  // Section 4: Summary (replaces macro_impact + bottom_line)
  summary: DigestSummary;

  // Cache indicator
  from_cache?: boolean;

  // Error handling
  error?: string;
}

export interface SubscribeResponse {
  success: boolean;
  message: string;
  email: string;
  contact_id?: string;
}

export interface UnsubscribeResponse {
  success: boolean;
  message: string;
  email: string;
}

// Subscription Management Types
export type SubscriptionChannel = 'daily_report' | 'personal_digest';

export interface SubscriptionResponse {
  success: boolean;
  channel: string;
  email: string;
  contact_id?: string;
  metadata?: Record<string, unknown>;
  error?: string;
}

export interface SubscriptionStatusResponse {
  success: boolean;
  channel: string;
  subscribed: boolean;
  email: string;
  metadata: Record<string, unknown>;
  error?: string;
}

export interface SubscribeData {
  email: string;
  first_name?: string;
  user_id?: string;
  symbols?: string[];
}

export interface UpdateSubscriptionData {
  email: string;
  first_name?: string;
  symbols?: string[];
}

export interface SyncedChannelInfo {
  channel: string;
  subscribed: boolean;
  metadata: Record<string, unknown>;
}

export interface SyncUserResponse {
  success: boolean;
  email: string;
  user_id: string;
  synced_channels: SyncedChannelInfo[];
  errors: string[];
}

export interface EmailPreviewResponse {
  success: boolean;
  html: string;
  report_id: string;
  report_date: string;
}

export interface DigestPreviewResponse {
  success: boolean;
  html: string;
  digest_id: string;
  digest_date: string;
  user_id: string;
  symbols: string[];
}

// Liquidity Monitor Types
export interface LiquidityMetric {
  series_id: string;
  title: string;
  value: number | null;
  date: string | null;
  units: string;
  change: number | null;
  previous_date?: string | null;
  formula?: string;
  error?: string;
}

export interface LiquidityMetrics {
  fed_assets: LiquidityMetric;
  tga: LiquidityMetric;
  rrp: LiquidityMetric;
  reserves: LiquidityMetric;
  sofr: LiquidityMetric;
  effr: LiquidityMetric;
  nfci: LiquidityMetric;
  net_liquidity: LiquidityMetric;
}

export interface LiquidityMetricsResponse {
  success: boolean;
  timestamp: string;
  metrics: LiquidityMetrics;
}

export interface LiquidityHistoryObservation {
  time: string;
  value: number;
  fed_assets: number;
  tga: number;
  rrp: number;
  reserves?: number;
  sofr?: number;
  effr?: number;
  nfci?: number;
}

export interface LiquidityHistoryData {
  series_id: string;
  title: string;
  units: string;
  formula: string;
  observations: LiquidityHistoryObservation[];
  metrics?: LiquidityMetrics;
}

export interface LiquidityHistoryResponse {
  success: boolean;
  timestamp: string;
  data: LiquidityHistoryData;
}

// Stock Search Types
export interface StockSearchResult {
  symbol: string;
  name: string;
  type: string;
  exchange: string;
}

export interface StockSearchResponse {
  stocks: StockSearchResult[];
}

// Stock Quote Types
export interface StockQuote {
  symbol: string;
  name: string;
  price: number;
  daily_change: number;
}

export interface StockQuotesResponse {
  success: boolean;
  quotes: StockQuote[];
}

// Sector Digest Types
export interface SectorInfo {
  id: string;
  name_en: string;
  name_zh: string;
  description: string;
  symbols: string[];
  symbol_count: number;
}

export interface SectorStockAnalysis {
  symbol: string;
  name: string;
  change_percent: number;
  analysis: string;
}

export interface SectorNews {
  title: string;
  summary: string;
  url?: string;
}

export interface SectorEvent {
  date: string;
  title: string;
  description?: string;
}

export interface SectorDigestData {
  success: boolean;
  timestamp: string;
  sector_id: string;
  sector_name: string;
  greeting: string;
  intro: string;
  stocks: SectorStockAnalysis[];
  news: SectorNews[];
  events: SectorEvent[];
  summary: string;
  error?: string;
}

export interface SectorSubscription {
  id: string;
  sector_id: string;
  subscribed_at: string;
}

export interface SectorSubscriptionsResponse {
  success: boolean;
  subscriptions: SectorSubscription[];
}

export interface SectorSubscribeResponse {
  success: boolean;
  message: string;
  sector_id: string;
}

export interface SectorUnsubscribeResponse {
  success: boolean;
  message: string;
  sector_id: string;
}

export interface SectorDigestHistoryItem {
  id: string;
  sector_id: string;
  digest_date: string;
  greeting?: string;
  generated_at: string;
}

export interface SectorDigestHistoryResponse {
  success: boolean;
  sector_id: string;
  digests: SectorDigestHistoryItem[];
  total: number;
}

// Macro Risk Dashboard Types
export interface RiskIndicator {
  series_id: string;
  name: string;
  value: number | null;
  date: string | null;
  units: string;
  change: number | null;
  previous_value: number | null;
  source: string;
}

export interface CategoryRiskScore {
  category_id: number;
  category_name: string;
  risk_score: number;
  risk_level: string;
  headline: string;
  indicators: RiskIndicator[];
}

export interface AIStockInfo {
  symbol: string;
  price: number | null;
  daily_change: number | null;
  name: string;
}

export interface MacroRiskDashboardResponse {
  success: boolean;
  timestamp: string;
  composite_score: number;
  composite_level: string;
  categories: CategoryRiskScore[];
  ai_stocks: AIStockInfo[];
  liquidity_summary: {
    nfci: { value: number | null; date: string | null; change: number | null };
    net_liquidity: { value: number | null; date: string | null; units: string; change: number | null };
  } | null;
}

// Economic Fundamentals Types
export interface SubDimension {
  name: string;
  name_zh: string;
  score: number;
  risk_level: string;
  weight: number;
  headline: string;
  indicators: RiskIndicator[];
}

export interface EconomicFundamentals {
  timestamp: string;
  overall_score: number;
  overall_level: string;
  overall_headline: string;
  sub_dimensions: SubDimension[];
}

export interface EconomicFundamentalsResponse {
  success: boolean;
  timestamp: string;
  data: EconomicFundamentals;
}

// CPI Breakdown Types
export interface CpiComponent {
  series_id: string;
  name: string;
  name_zh: string;
  value: number | null;
  date: string | null;
  yoy_pct: number | null;
  mom_pct: number | null;
}

export interface CpiBreakdownResponse {
  success: boolean;
  timestamp: string;
  components: CpiComponent[];
}

// Treasury & Commodities Types
export interface TreasuryRate {
  rate: number;
  daily_change_bps: number | null;
}

export interface TreasuryCommoditiesResponse {
  success: boolean;
  timestamp: string;
  treasury: {
    date: string | null;
    rates: Record<string, TreasuryRate>;
    spreads: Record<string, number>;
    yield_curve_shape: string;
  };
  commodities: Record<string, {
    price: number | null;
    changePercent: number | null;
    previousClose: number | null;
    dayHigh: number | null;
    dayLow: number | null;
    symbol: string;
  }>;
  dollar: {
    price: number | null;
    daily_change: number | null;
  };
}

// OHLCV History Response (shared by sentiment + commodity history)
export interface OhlcvHistoryResponse {
  success: boolean;
  symbol: string;
  count: number;
  data: Array<{ date: string; open: number; high: number; low: number; close: number; volume: number }>;
}

const HISTORY_TTL = 10 * 60 * 1000;

function fetchOhlcvHistory(cachePrefix: string, pathSegment: string) {
  return async (symbol: string, days: number = 730): Promise<OhlcvHistoryResponse> => {
    return cachedFetch(`${cachePrefix}-${symbol}-${days}`, async () => {
      const response = await fetch(`${API_BASE_URL}/macro-risk/${pathSegment}/history/${symbol}?days=${days}`);
      if (!response.ok) {
        const error = await response.json().catch(() => ({ detail: `Failed to fetch ${pathSegment} history` }));
        throw new Error(error.detail || `Failed to fetch ${pathSegment} history`);
      }
      return response.json();
    }, HISTORY_TTL);
  };
}

// Weekly Macro Report Types
export interface SectionAnalysis {
  data_changes: string;
  trend_interpretation: string;
  market_implication: string;
}

export interface SignalLights {
  liquidity: 'green' | 'yellow' | 'red';
  economy: 'green' | 'yellow' | 'red';
  inflation: 'green' | 'yellow' | 'red';
  sentiment: 'green' | 'yellow' | 'red';
}

export interface WeekAheadEvent {
  date: string;
  event: string;
  if_above: string;
  if_below: string;
}

export interface WeeklyMacroReport {
  week_label: string;
  generated_at: string;
  executive_summary: string;
  signal_lights: SignalLights;
  market_recap: string;
  liquidity_analysis: SectionAnalysis;
  economy_analysis: SectionAnalysis;
  inflation_analysis: SectionAnalysis;
  sentiment_analysis: SectionAnalysis;
  investment_implications: string;
  week_ahead: WeekAheadEvent[];
}

export interface WeeklyReportResponse {
  success: boolean;
  data: WeeklyMacroReport | null;
}

export const api = {
  getMarketAnalysis: async (force: boolean = false): Promise<MarketData> => {
    const response = await fetch(`${API_BASE_URL}/market`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ force }),
    });
    if (!response.ok) {
      throw new Error('Failed to fetch market analysis');
    }
    return response.json();
  },

  sendReportEmail: async (email?: string): Promise<SendEmailResponse> => {
    const response = await fetch(`${API_BASE_URL}/report/send-test`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ email }),
    });
    if (!response.ok) {
      const error = await response.json().catch(() => ({ detail: 'Failed to send email' }));
      throw new Error(error.detail || 'Failed to send email');
    }
    return response.json();
  },

  generateDigest: async (
    symbols: string[],
    userId?: string
  ): Promise<DigestResponse> => {
    const body: { symbols: string[]; user_id?: string } = { symbols };
    if (userId) {
      body.user_id = userId;
    }

    const response = await fetch(`${API_BASE_URL}/digest`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });
    if (!response.ok) {
      const error = await response.json().catch(() => ({ detail: 'Failed to generate digest' }));
      throw new Error(error.detail || 'Failed to generate digest');
    }
    return response.json();
  },

  // Legacy subscribe (for backward compatibility) - uses daily_report channel
  subscribe: async (email: string, firstName?: string): Promise<SubscribeResponse> => {
    const result = await api.subscriptions.subscribe('daily_report', { email, first_name: firstName });
    return {
      success: result.success,
      message: result.success ? 'Successfully subscribed' : (result.error || 'Failed to subscribe'),
      email: result.email,
      contact_id: result.contact_id,
    };
  },

  // Legacy unsubscribe (for backward compatibility) - uses daily_report channel
  unsubscribe: async (email: string): Promise<UnsubscribeResponse> => {
    const result = await api.subscriptions.unsubscribe('daily_report', email);
    return {
      success: result.success,
      message: result.success ? 'Successfully unsubscribed' : (result.error || 'Failed to unsubscribe'),
      email: result.email,
    };
  },

  // Unified Subscription Management API
  subscriptions: {
    subscribe: async (channel: SubscriptionChannel, data: SubscribeData): Promise<SubscriptionResponse> => {
      const response = await fetch(`${API_BASE_URL}/subscriptions/${channel}/subscribe`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(data),
      });
      if (!response.ok) {
        const error = await response.json().catch(() => ({ detail: 'Failed to subscribe' }));
        throw new Error(error.detail || 'Failed to subscribe');
      }
      return response.json();
    },

    unsubscribe: async (channel: SubscriptionChannel, email: string): Promise<SubscriptionResponse> => {
      const response = await fetch(`${API_BASE_URL}/subscriptions/${channel}/unsubscribe`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ email }),
      });
      if (!response.ok) {
        const error = await response.json().catch(() => ({ detail: 'Failed to unsubscribe' }));
        throw new Error(error.detail || 'Failed to unsubscribe');
      }
      return response.json();
    },

    getStatus: async (channel: SubscriptionChannel, email: string): Promise<SubscriptionStatusResponse> => {
      const response = await fetch(
        `${API_BASE_URL}/subscriptions/${channel}/status?email=${encodeURIComponent(email)}`
      );
      if (!response.ok) {
        const error = await response.json().catch(() => ({ detail: 'Failed to get status' }));
        throw new Error(error.detail || 'Failed to get status');
      }
      return response.json();
    },

    update: async (channel: SubscriptionChannel, data: UpdateSubscriptionData): Promise<SubscriptionResponse> => {
      const response = await fetch(`${API_BASE_URL}/subscriptions/${channel}/update`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(data),
      });
      if (!response.ok) {
        const error = await response.json().catch(() => ({ detail: 'Failed to update subscription' }));
        throw new Error(error.detail || 'Failed to update subscription');
      }
      return response.json();
    },

    /**
     * Sync a website user with their existing Resend subscriptions.
     * Call this when user logs in or registers to link their account
     * with any existing email subscriptions.
     */
    syncUser: async (userId: string, email: string, firstName?: string): Promise<SyncUserResponse> => {
      try {
        const response = await fetch(`${API_BASE_URL}/subscriptions/sync-user`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            user_id: userId,
            email: email,
            first_name: firstName,
          }),
        });
        if (!response.ok) {
          const error = await response.json().catch(() => ({ detail: 'Failed to sync user' }));
          console.warn('[API] Sync user failed:', error.detail);
          return { success: false, email, user_id: userId, synced_channels: [], errors: [error.detail] };
        }
        return response.json();
      } catch (error) {
        // Don't throw - sync is a background operation that shouldn't block login
        console.warn('[API] Sync user error:', error);
        return { success: false, email, user_id: userId, synced_channels: [], errors: [String(error)] };
      }
    },
  },

  getEmailPreview: async (reportId?: string, firstName?: string): Promise<EmailPreviewResponse> => {
    const params = new URLSearchParams();
    if (reportId) params.append('report_id', reportId);
    if (firstName) params.append('first_name', firstName);
    const queryString = params.toString();
    const url = queryString
      ? `${API_BASE_URL}/report/preview?${queryString}`
      : `${API_BASE_URL}/report/preview`;
    const response = await fetch(url);
    if (!response.ok) {
      const error = await response.json().catch(() => ({ detail: 'Failed to get email preview' }));
      throw new Error(error.detail || 'Failed to get email preview');
    }
    return response.json();
  },

  getDigestPreview: async (params?: { userId?: string; digestId?: string }): Promise<DigestPreviewResponse> => {
    const searchParams = new URLSearchParams();
    if (params?.userId) searchParams.append('user_id', params.userId);
    if (params?.digestId) searchParams.append('digest_id', params.digestId);
    const queryString = searchParams.toString();
    const url = `${API_BASE_URL}/subscriptions/personal_digest/preview${queryString ? `?${queryString}` : ''}`;
    const response = await fetch(url);
    if (!response.ok) {
      const error = await response.json().catch(() => ({ detail: 'Failed to get digest preview' }));
      throw new Error(error.detail || 'Failed to get digest preview');
    }
    return response.json();
  },

  // Liquidity Monitor APIs
  getLiquidityMetrics: async (): Promise<LiquidityMetricsResponse> => {
    return cachedFetch('liquidity-metrics', async () => {
      const response = await fetch(`${API_BASE_URL}/liquidity/metrics`);
      if (!response.ok) {
        const error = await response.json().catch(() => ({ detail: 'Failed to fetch liquidity metrics' }));
        throw new Error(error.detail || 'Failed to fetch liquidity metrics');
      }
      return response.json();
    });
  },

  getLiquidityHistory: async (days: number = 365): Promise<LiquidityHistoryResponse> => {
    return cachedFetch(`liquidity-history-${days}`, async () => {
      const response = await fetch(`${API_BASE_URL}/liquidity/history?days=${days}`);
      if (!response.ok) {
        const error = await response.json().catch(() => ({ detail: 'Failed to fetch liquidity history' }));
        throw new Error(error.detail || 'Failed to fetch liquidity history');
      }
      return response.json();
    });
  },

  // Macro Risk Dashboard API
  getMacroRiskDashboard: async (): Promise<MacroRiskDashboardResponse> => {
    return cachedFetch('macro-risk-dashboard', async () => {
      const response = await fetch(`${API_BASE_URL}/macro-risk/dashboard`);
      if (!response.ok) {
        const error = await response.json().catch(() => ({ detail: 'Failed to fetch macro risk dashboard' }));
        throw new Error(error.detail || 'Failed to fetch macro risk dashboard');
      }
      return response.json();
    });
  },

  // Economic Fundamentals API
  getEconomicFundamentals: async (): Promise<EconomicFundamentalsResponse> => {
    return cachedFetch('economic-fundamentals', async () => {
      const response = await fetch(`${API_BASE_URL}/macro-risk/economy`);
      if (!response.ok) {
        const error = await response.json().catch(() => ({ detail: 'Failed to fetch economic fundamentals' }));
        throw new Error(error.detail || 'Failed to fetch economic fundamentals');
      }
      return response.json();
    });
  },

  // Market Sentiment API
  getMarketSentiment: async (): Promise<EconomicFundamentalsResponse> => {
    return cachedFetch('market-sentiment', async () => {
      const response = await fetch(`${API_BASE_URL}/macro-risk/sentiment`);
      if (!response.ok) {
        const error = await response.json().catch(() => ({ detail: 'Failed to fetch market sentiment' }));
        throw new Error(error.detail || 'Failed to fetch market sentiment');
      }
      return response.json();
    });
  },

  getSentimentHistory: fetchOhlcvHistory('sentiment-history', 'sentiment'),

  getCommodityHistory: fetchOhlcvHistory('commodity-history', 'commodity'),

  // Inflation & Rates API
  getInflationRates: async (): Promise<EconomicFundamentalsResponse> => {
    return cachedFetch('inflation-rates', async () => {
      const response = await fetch(`${API_BASE_URL}/macro-risk/inflation-rates`);
      if (!response.ok) {
        const error = await response.json().catch(() => ({ detail: 'Failed to fetch inflation & rates' }));
        throw new Error(error.detail || 'Failed to fetch inflation & rates');
      }
      return response.json();
    });
  },

  // CPI Breakdown API
  getCpiBreakdown: async (): Promise<CpiBreakdownResponse> => {
    return cachedFetch('cpi-breakdown', async () => {
      const response = await fetch(`${API_BASE_URL}/macro-risk/cpi-breakdown`);
      if (!response.ok) {
        const error = await response.json().catch(() => ({ detail: 'Failed to fetch CPI breakdown' }));
        throw new Error(error.detail || 'Failed to fetch CPI breakdown');
      }
      return response.json();
    });
  },

  // Treasury & Commodities API
  getTreasuryCommodities: async (): Promise<TreasuryCommoditiesResponse> => {
    return cachedFetch('treasury-commodities', async () => {
      const response = await fetch(`${API_BASE_URL}/macro-risk/treasury-commodities`);
      if (!response.ok) {
        const error = await response.json().catch(() => ({ detail: 'Failed to fetch treasury & commodities' }));
        throw new Error(error.detail || 'Failed to fetch treasury & commodities');
      }
      return response.json();
    });
  },

  // Stock Search API
  searchStocks: async (query: string, limit: number = 8): Promise<StockSearchResponse> => {
    const response = await fetch(
      `${API_BASE_URL}/stocks/search?q=${encodeURIComponent(query)}&limit=${limit}`
    );
    if (!response.ok) {
      const error = await response.json().catch(() => ({ detail: 'Failed to search stocks' }));
      throw new Error(error.detail || 'Failed to search stocks');
    }
    return response.json();
  },

  // Stock Quotes API
  getStockQuotes: async (symbols: string[]): Promise<StockQuotesResponse> => {
    if (symbols.length === 0) {
      return { success: true, quotes: [] };
    }
    const response = await fetch(
      `${API_BASE_URL}/stocks/quotes?symbols=${symbols.join(',')}`
    );
    if (!response.ok) {
      const error = await response.json().catch(() => ({ detail: 'Failed to get stock quotes' }));
      throw new Error(error.detail || 'Failed to get stock quotes');
    }
    return response.json();
  },

  // Sector APIs
  sectors: {
    list: async (): Promise<SectorInfo[]> => {
      const response = await fetch(`${API_BASE_URL}/sectors`);
      if (!response.ok) {
        const error = await response.json().catch(() => ({ detail: 'Failed to fetch sectors' }));
        throw new Error(error.detail || 'Failed to fetch sectors');
      }
      const data = await response.json();
      return data.sectors;
    },

    generateDigest: async (sectorId: string): Promise<SectorDigestData> => {
      const response = await fetch(`${API_BASE_URL}/sectors/${sectorId}/digest`, {
        method: 'POST',
      });
      if (!response.ok) {
        const error = await response.json().catch(() => ({ detail: 'Failed to generate sector digest' }));
        throw new Error(error.detail || 'Failed to generate sector digest');
      }
      return response.json();
    },

    getLatestDigest: async (sectorId: string): Promise<SectorDigestData | null> => {
      const response = await fetch(`${API_BASE_URL}/sectors/${sectorId}/digest/latest`);
      if (!response.ok) {
        if (response.status === 404) {
          return null;
        }
        const error = await response.json().catch(() => ({ detail: 'Failed to fetch sector digest' }));
        throw new Error(error.detail || 'Failed to fetch sector digest');
      }
      const data = await response.json();
      // Backend returns { success, digest, digest_date, generated_at }
      // Extract the digest field which contains the full SectorDigestData
      return data.digest || null;
    },

    subscribe: async (sectorId: string, userId: string): Promise<SectorSubscribeResponse> => {
      const response = await fetch(`${API_BASE_URL}/sectors/subscribe`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ sector_id: sectorId, user_id: userId }),
      });
      if (!response.ok) {
        const error = await response.json().catch(() => ({ detail: 'Failed to subscribe to sector' }));
        throw new Error(error.detail || 'Failed to subscribe to sector');
      }
      return response.json();
    },

    unsubscribe: async (sectorId: string, userId: string): Promise<SectorUnsubscribeResponse> => {
      const response = await fetch(`${API_BASE_URL}/sectors/${sectorId}/unsubscribe?user_id=${userId}`, {
        method: 'DELETE',
      });
      if (!response.ok) {
        const error = await response.json().catch(() => ({ detail: 'Failed to unsubscribe from sector' }));
        throw new Error(error.detail || 'Failed to unsubscribe from sector');
      }
      return response.json();
    },

    getSubscriptions: async (userId: string): Promise<SectorSubscription[]> => {
      const response = await fetch(`${API_BASE_URL}/sectors/subscriptions?user_id=${userId}`);
      if (!response.ok) {
        const error = await response.json().catch(() => ({ detail: 'Failed to fetch subscriptions' }));
        throw new Error(error.detail || 'Failed to fetch subscriptions');
      }
      const data = await response.json();
      return data.subscriptions;
    },

    getHistory: async (sectorId: string, days: number = 30): Promise<SectorDigestHistoryResponse> => {
      const response = await fetch(`${API_BASE_URL}/sectors/${sectorId}/digest/history?days=${days}`);
      if (!response.ok) {
        const error = await response.json().catch(() => ({ detail: 'Failed to fetch digest history' }));
        throw new Error(error.detail || 'Failed to fetch digest history');
      }
      return response.json();
    },
  },

  // Weekly Macro Report API
  weeklyReport: {
    getLatest: async (): Promise<WeeklyReportResponse> => {
      return cachedFetch('weekly-report-latest', async () => {
        const response = await fetch(`${API_BASE_URL}/weekly-report`);
        if (!response.ok) {
          throw new Error('Failed to fetch weekly report');
        }
        return response.json();
      }, 10 * 60 * 1000); // 10 min TTL
    },
  },
};
