const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000/api';

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

// Liquidity Analysis Types
export interface LiquidityAnalysis {
  id?: string;
  analysis: string;
  status: string;
  generated_at: string;
  model?: string;
  metrics_snapshot?: {
    net_liquidity?: number | null;
    fed_assets?: number | null;
    tga?: number | null;
    rrp?: number | null;
    nfci?: number | null;
  };
}

export interface LiquidityAnalysisResponse {
  success: boolean;
  analysis?: LiquidityAnalysis;
  error?: string;
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
    const response = await fetch(`${API_BASE_URL}/liquidity/metrics`);
    if (!response.ok) {
      const error = await response.json().catch(() => ({ detail: 'Failed to fetch liquidity metrics' }));
      throw new Error(error.detail || 'Failed to fetch liquidity metrics');
    }
    return response.json();
  },

  getLiquidityHistory: async (days: number = 365): Promise<LiquidityHistoryResponse> => {
    const response = await fetch(`${API_BASE_URL}/liquidity/history?days=${days}`);
    if (!response.ok) {
      const error = await response.json().catch(() => ({ detail: 'Failed to fetch liquidity history' }));
      throw new Error(error.detail || 'Failed to fetch liquidity history');
    }
    return response.json();
  },

  // Liquidity Analysis APIs
  generateLiquidityAnalysis: async (): Promise<LiquidityAnalysisResponse> => {
    const response = await fetch(`${API_BASE_URL}/liquidity/analysis`, {
      method: 'POST',
    });
    if (!response.ok) {
      const error = await response.json().catch(() => ({ detail: 'Failed to generate analysis' }));
      throw new Error(error.detail || 'Failed to generate analysis');
    }
    return response.json();
  },

  getLatestLiquidityAnalysis: async (): Promise<LiquidityAnalysisResponse> => {
    const response = await fetch(`${API_BASE_URL}/liquidity/analysis/latest`);
    if (!response.ok) {
      const error = await response.json().catch(() => ({ detail: 'Failed to fetch analysis' }));
      throw new Error(error.detail || 'Failed to fetch analysis');
    }
    return response.json();
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
  },
};
