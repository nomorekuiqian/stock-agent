import { getAccessToken } from './auth';

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

export interface SummarySection {
  title: string;
  content: string;
}

// MarketData from backend API - matches database schema (snake_case)
export interface MarketData {
  report_id?: string;
  report_date?: string;
  indices: MarketIndex[];
  timestamp: string;
  title?: string;
  summary?: string;
  intro?: string;
  news?: NewsSection;
  report_summary?: SummarySection[] | string;
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
export type SubscriptionChannel = 'daily_report' | 'personal_digest' | 'weekly_report';

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

export interface WeeklyPreviewResponse {
  success: boolean;
  html: string;
  week_label: string;
  title: string;
  report_id: string;
  generated_at: string;
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

// Global Liquidity Types
export interface GlobalLiquidityMetric {
  series_id: string;
  title: string;
  value: number | null;
  raw_value?: number | null;
  date: string | null;
  units: string;
  change: number | null;
  previous_date?: string | null;
  components_available?: number;
  components_total?: number;
  partial?: boolean;
}

export interface GlobalLiquidityIndex {
  series_id: string;
  title: string;
  value: number | null;
  date: string | null;
  units: string;
  formula: string;
}

export interface GlobalLiquidityMetrics {
  global_liquidity: GlobalLiquidityIndex;
  fed_assets: GlobalLiquidityMetric;
  us_m2: GlobalLiquidityMetric;
  ecb_assets: GlobalLiquidityMetric;
  boj_assets: GlobalLiquidityMetric;
  fx_rates?: {
    eurusd: number | null;
    usdjpy: number | null;
  };
}

export interface GlobalLiquidityResponse {
  success: boolean;
  timestamp: string;
  data: GlobalLiquidityMetrics;
}

export interface GlobalLiquidityHistoryObservation {
  time: string;
  value: number | null;
}

export interface GlobalLiquidityHistoryData {
  series_id: string;
  title: string;
  units: string;
  observations: GlobalLiquidityHistoryObservation[];
}

export interface GlobalLiquidityHistoryResponse {
  success: boolean;
  timestamp: string;
  data: GlobalLiquidityHistoryData;
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

function fetchOhlcvHistory(pathSegment: string) {
  return async (symbol: string, days: number = 730): Promise<OhlcvHistoryResponse> => {
    const response = await fetch(`${API_BASE_URL}/macro-risk/${pathSegment}/history/${symbol}?days=${days}`);
    if (!response.ok) {
      const error = await response.json().catch(() => ({ detail: `Failed to fetch ${pathSegment} history` }));
      throw new Error(error.detail || `Failed to fetch ${pathSegment} history`);
    }
    return response.json();
  };
}

// Weekly Macro Report Types
export interface SectionAnalysis {
  summary: string;
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
  title: string;
  verdict: string;
  signal_lights: SignalLights;
  landscape: string;
  narrative: string;
  takeaway: string;
  liquidity_analysis: SectionAnalysis;
  economy_analysis: SectionAnalysis;
  inflation_analysis: SectionAnalysis;
  sentiment_analysis: SectionAnalysis;
  week_ahead: WeekAheadEvent[];
}

export interface WeeklyReportResponse {
  success: boolean;
  data: WeeklyMacroReport | null;
}

// --- Data types for backend-proxied reads ---

export interface ReportListItem {
  id: string;
  report_date: string;
  timestamp: string;
  title?: string;
  summary?: string;
  created_at?: string;
}

// --- Morning Report Types ---

export interface MorningFuturesQuote {
  name: string;
  value: number;
  daily_change: number;
}

export interface MorningMarketQuote {
  name: string;
  value: number;
  daily_change: number;
}

export interface MorningGlobalSnapshot {
  asia: MorningMarketQuote[];
  europe: MorningMarketQuote[];
  other: MorningMarketQuote[];
}

export interface MorningOvernightItem {
  title: string;
  analysis: string;
  url?: string;
}

export interface MorningTodayFocusItem {
  title: string;
  analysis: string;
  time?: string;
}

export interface MorningSummarySection {
  title: string;
  content: string;
}

export interface MorningReport {
  report_id?: string;
  report_date?: string;
  timestamp: string;
  title: string;
  market_pulse: string;
  futures: MorningFuturesQuote[];
  futures_analysis?: string;
  global_markets: MorningGlobalSnapshot;
  global_markets_analysis?: string;
  overnight_news: MorningOvernightItem[];
  today_focus: MorningTodayFocusItem[];
  summary: MorningSummarySection[];
  market_data?: unknown;
  from_cache?: boolean;
}

export interface MorningReportListItem {
  id: string;
  report_date: string;
  timestamp: string;
  title?: string;
  market_pulse?: string;
  created_at?: string;
}

export interface WatchlistData {
  user_id: string;
  email?: string;
  symbols: string[];
  created_at?: string;
  updated_at?: string;
}

export interface UserDigestItem {
  id?: string;
  user_id: string;
  digest_date: string;
  symbols: string[];
  analysis: string;
  greeting?: string;
  one_line_summary?: string;
  bottom_line?: string;
  digest_data?: {
    stocks?: StockAnalysis[];
    news?: DigestNewsSection;
    events?: DigestEvent[];
    summary?: DigestSummary;
  };
  created_at?: string;
}

// Screener Types
export interface ScreenerFilterRequest {
  strategy: string;
  sector?: string | null;
  params?: Record<string, unknown> | null;
}

export interface ScreenerSuggestionOption {
  value: string;
  label: string;
  count?: number;
}

export interface ScreenerSuggestion {
  dimension: string;
  label: string;
  type: 'categorical' | 'sort';
  options?: ScreenerSuggestionOption[];
  description?: string;
}

export interface ScreenerFilterResult {
  success: boolean;
  strategy: string;
  candidates: Record<string, unknown>[];
  candidate_count: number;
  universe_size: number;
  data_freshness: string | null;
  is_stale: boolean;
  suggestions: ScreenerSuggestion[];
}

export interface ScreenerStatusEntry {
  key: string;
  fetched_at: string | null;
  source: string | null;
  is_valid: boolean;
  error: string | null;
}

export interface ScreenerStatusResponse {
  success: boolean;
  timestamp: string;
  entries: ScreenerStatusEntry[];
  count: number;
}

export interface ScreenerSector {
  value: string;
  label_zh: string;
  label: string;
  count: number;
}

export interface ScreenerSectorsResponse {
  success: boolean;
  sectors: ScreenerSector[];
  count: number;
}

export interface ScreenerAskRequest {
  message: string;
  current_filters?: { field: string; op: string; value: unknown }[];
  history?: { role: string; content?: string; summary?: string }[];
}

export interface ScreenerAskResult {
  success: boolean;
  filter_used: Record<string, unknown>;
  candidates: Record<string, unknown>[];
  candidate_count: number;
  universe_size: number;
  suggestions: ScreenerSuggestion[];
  summary: string;
  data_freshness: string | null;
  is_stale: boolean;
}

// Stock Picker Agent types
export interface PickerOption {
  label: string;
  value: string;
}

export interface PickRequest {
  message: string;
  history?: { role: string; content: string }[];
  accumulated_filters?: { field: string; op: string; value: unknown }[];
}

export interface PickResult {
  success: boolean;
  message: string;
  options: PickerOption[];
  candidates: Record<string, unknown>[];
  candidate_count: number;
  universe_size: number;
  pick_reasons: { symbol: string; reason: string }[];
  accumulated_filters: { field: string; op: string; value: unknown }[];
  data_freshness: string | null;
  is_stale: boolean;
}

async function _authHeaders(base: Record<string, string> = {}): Promise<Record<string, string>> {
  const token = await getAccessToken();
  if (token) {
    return { ...base, Authorization: `Bearer ${token}` };
  }
  return base;
}

export const api = {
  getMarketAnalysis: async (force: boolean = false): Promise<MarketData> => {
    const response = await fetch(`${API_BASE_URL}/market`, {
      method: 'POST',
      headers: await _authHeaders({ 'Content-Type': 'application/json' }),
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

  sendMorningReportEmail: async (email?: string): Promise<SendEmailResponse> => {
    const response = await fetch(`${API_BASE_URL}/morning-report/send-test`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ email }),
    });
    if (!response.ok) {
      const error = await response.json().catch(() => ({ detail: 'Failed to send morning report email' }));
      throw new Error(error.detail || 'Failed to send morning report email');
    }
    return response.json();
  },

  generateMorningReport: async (force = false): Promise<unknown> => {
    const response = await fetch(`${API_BASE_URL}/morning`, {
      method: 'POST',
      headers: await _authHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ force }),
    });
    if (!response.ok) {
      const error = await response.json().catch(() => ({ detail: 'Failed to generate morning report' }));
      throw new Error(error.detail || 'Failed to generate morning report');
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
      headers: await _authHeaders({ 'Content-Type': 'application/json' }),
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

  getWeeklyPreview: async (params?: { week?: string; firstName?: string }): Promise<WeeklyPreviewResponse> => {
    const searchParams = new URLSearchParams();
    if (params?.week) searchParams.append('week', params.week);
    if (params?.firstName) searchParams.append('first_name', params.firstName);
    const queryString = searchParams.toString();
    const url = `${API_BASE_URL}/weekly-report/preview${queryString ? `?${queryString}` : ''}`;
    const response = await fetch(url);
    if (!response.ok) {
      const error = await response.json().catch(() => ({ detail: 'Failed to get weekly report preview' }));
      throw new Error(error.detail || 'Failed to get weekly report preview');
    }
    return response.json();
  },

  sendWeeklyReportEmail: async (email: string): Promise<SendEmailResponse> => {
    const response = await fetch(`${API_BASE_URL}/weekly-report/send-test`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email }),
    });
    if (!response.ok) {
      const error = await response.json().catch(() => ({ detail: 'Failed to send weekly report email' }));
      throw new Error(error.detail || 'Failed to send weekly report email');
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

  // Global Liquidity API
  getGlobalLiquidity: async (): Promise<GlobalLiquidityResponse> => {
    const response = await fetch(`${API_BASE_URL}/liquidity/global`);
    if (!response.ok) {
      const error = await response.json().catch(() => ({ detail: 'Failed to fetch global liquidity' }));
      throw new Error(error.detail || 'Failed to fetch global liquidity');
    }
    return response.json();
  },

  getGlobalLiquidityHistory: async (days: number = 365): Promise<GlobalLiquidityHistoryResponse> => {
    const response = await fetch(`${API_BASE_URL}/liquidity/global/history?days=${days}`);
    if (!response.ok) {
      const error = await response.json().catch(() => ({ detail: 'Failed to fetch global liquidity history' }));
      throw new Error(error.detail || 'Failed to fetch global liquidity history');
    }
    return response.json();
  },

  // Macro Risk Dashboard API
  getMacroRiskDashboard: async (): Promise<MacroRiskDashboardResponse> => {
    const response = await fetch(`${API_BASE_URL}/macro-risk/dashboard`);
    if (!response.ok) {
      const error = await response.json().catch(() => ({ detail: 'Failed to fetch macro risk dashboard' }));
      throw new Error(error.detail || 'Failed to fetch macro risk dashboard');
    }
    return response.json();
  },

  // Economic Fundamentals API
  getEconomicFundamentals: async (): Promise<EconomicFundamentalsResponse> => {
    const response = await fetch(`${API_BASE_URL}/macro-risk/economy`);
    if (!response.ok) {
      const error = await response.json().catch(() => ({ detail: 'Failed to fetch economic fundamentals' }));
      throw new Error(error.detail || 'Failed to fetch economic fundamentals');
    }
    return response.json();
  },

  // Market Sentiment API
  getMarketSentiment: async (): Promise<EconomicFundamentalsResponse> => {
    const response = await fetch(`${API_BASE_URL}/macro-risk/sentiment`);
    if (!response.ok) {
      const error = await response.json().catch(() => ({ detail: 'Failed to fetch market sentiment' }));
      throw new Error(error.detail || 'Failed to fetch market sentiment');
    }
    return response.json();
  },

  getSentimentHistory: fetchOhlcvHistory('sentiment'),

  getCommodityHistory: fetchOhlcvHistory('commodity'),

  // Inflation & Rates API
  getInflationRates: async (): Promise<EconomicFundamentalsResponse> => {
    const response = await fetch(`${API_BASE_URL}/macro-risk/inflation-rates`);
    if (!response.ok) {
      const error = await response.json().catch(() => ({ detail: 'Failed to fetch inflation & rates' }));
      throw new Error(error.detail || 'Failed to fetch inflation & rates');
    }
    return response.json();
  },

  // CPI Breakdown API
  getCpiBreakdown: async (): Promise<CpiBreakdownResponse> => {
    const response = await fetch(`${API_BASE_URL}/macro-risk/cpi-breakdown`);
    if (!response.ok) {
      const error = await response.json().catch(() => ({ detail: 'Failed to fetch CPI breakdown' }));
      throw new Error(error.detail || 'Failed to fetch CPI breakdown');
    }
    return response.json();
  },

  // Treasury & Commodities API
  getTreasuryCommodities: async (): Promise<TreasuryCommoditiesResponse> => {
    const response = await fetch(`${API_BASE_URL}/macro-risk/treasury-commodities`);
    if (!response.ok) {
      const error = await response.json().catch(() => ({ detail: 'Failed to fetch treasury & commodities' }));
      throw new Error(error.detail || 'Failed to fetch treasury & commodities');
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
      const response = await fetch(`${API_BASE_URL}/sectors/`);
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

  // --- Backend-proxied data reads (replaces direct Insforge SDK queries) ---

  morningReports: {
    getLatest: async (): Promise<MorningReport | null> => {
      const response = await fetch(`${API_BASE_URL}/morning/reports/latest`);
      if (!response.ok) {
        if (response.status === 404) return null;
        throw new Error('Failed to fetch latest morning report');
      }
      const json = await response.json();
      return json.data as MorningReport;
    },

    getByDate: async (date: string): Promise<MorningReport | null> => {
      const response = await fetch(`${API_BASE_URL}/morning/reports/date/${date}`);
      if (!response.ok) {
        if (response.status === 404) return null;
        throw new Error('Failed to fetch morning report');
      }
      const json = await response.json();
      return json.data as MorningReport;
    },

    getById: async (id: string): Promise<MorningReport | null> => {
      const response = await fetch(`${API_BASE_URL}/morning/reports/${id}`);
      if (!response.ok) {
        if (response.status === 404) return null;
        throw new Error('Failed to fetch morning report');
      }
      const json = await response.json();
      return json.data as MorningReport;
    },

    list: async (limit = 20, offset = 0): Promise<{ data: MorningReportListItem[]; total: number }> => {
      const response = await fetch(`${API_BASE_URL}/morning/reports?limit=${limit}&offset=${offset}`);
      if (!response.ok) {
        throw new Error('Failed to fetch morning reports');
      }
      const json = await response.json();
      return { data: json.data || [], total: json.total ?? json.data?.length ?? 0 };
    },
  },

  reports: {
    getLatest: async (): Promise<MarketData | null> => {
      const response = await fetch(`${API_BASE_URL}/market/reports/latest`, { signal: AbortSignal.timeout(10000) });
      if (!response.ok) {
        if (response.status === 404) return null;
        throw new Error('Failed to fetch latest report');
      }
      const json = await response.json();
      return json.data as MarketData;
    },

    getByDate: async (date: string): Promise<MarketData | null> => {
      const response = await fetch(`${API_BASE_URL}/market/reports/date/${date}`, { signal: AbortSignal.timeout(10000) });
      if (!response.ok) {
        if (response.status === 404) return null;
        throw new Error('Failed to fetch report');
      }
      const json = await response.json();
      return json.data as MarketData;
    },

    getById: async (id: string): Promise<MarketData | null> => {
      const response = await fetch(`${API_BASE_URL}/market/reports/${id}`, { signal: AbortSignal.timeout(10000) });
      if (!response.ok) {
        if (response.status === 404) return null;
        throw new Error('Failed to fetch report');
      }
      const json = await response.json();
      return json.data as MarketData;
    },

    list: async (limit = 20, offset = 0): Promise<{ data: ReportListItem[]; total: number }> => {
      const response = await fetch(`${API_BASE_URL}/market/reports?limit=${limit}&offset=${offset}`, { signal: AbortSignal.timeout(10000) });
      if (!response.ok) {
        throw new Error('Failed to fetch reports');
      }
      const json = await response.json();
      return { data: json.data || [], total: json.total ?? json.data?.length ?? 0 };
    },
  },

  watchlist: {
    get: async (_userId?: string): Promise<WatchlistData | null> => {
      const headers = await _authHeaders();
      const response = await fetch(`${API_BASE_URL}/watchlist`, { headers });
      if (!response.ok) {
        throw new Error('Failed to fetch watchlist');
      }
      const json = await response.json();
      return json.data || null;
    },

    save: async (_userId: string, symbols: string[], email: string = ''): Promise<{ success: boolean; error?: string }> => {
      const headers = await _authHeaders({ 'Content-Type': 'application/json' });
      const response = await fetch(`${API_BASE_URL}/watchlist`, {
        method: 'PUT',
        headers,
        body: JSON.stringify({ symbols, email }),
      });
      if (!response.ok) {
        const error = await response.json().catch(() => ({ detail: 'Failed to save watchlist' }));
        return { success: false, error: error.detail || 'Failed to save watchlist' };
      }
      return response.json();
    },
  },

  digests: {
    list: async (_userId: string, limit = 10, offset = 0): Promise<{ data: UserDigestItem[]; total: number }> => {
      const headers = await _authHeaders();
      const response = await fetch(
        `${API_BASE_URL}/digests?limit=${limit}&offset=${offset}`,
        { headers }
      );
      if (!response.ok) {
        throw new Error('Failed to fetch digests');
      }
      const json = await response.json();
      return { data: json.data || [], total: json.total || 0 };
    },

    getById: async (id: string): Promise<UserDigestItem | null> => {
      const headers = await _authHeaders();
      const response = await fetch(`${API_BASE_URL}/digests/${id}`, { headers });
      if (!response.ok) {
        if (response.status === 404) return null;
        throw new Error('Failed to fetch digest');
      }
      const json = await response.json();
      return json.data || null;
    },
  },

  // Screener API
  screener: {
    filter: async (req: ScreenerFilterRequest): Promise<ScreenerFilterResult> => {
      const headers = await _authHeaders({ 'Content-Type': 'application/json' });
      const response = await fetch(`${API_BASE_URL}/screener/filter`, {
        method: 'POST',
        headers,
        body: JSON.stringify(req),
      });
      if (!response.ok) {
        const error = await response.json().catch(() => ({ detail: 'Failed to filter stocks' }));
        throw new Error(error.detail || 'Failed to filter stocks');
      }
      return response.json();
    },

    status: async (): Promise<ScreenerStatusResponse> => {
      const response = await fetch(`${API_BASE_URL}/screener/status`);
      if (!response.ok) {
        throw new Error('Failed to fetch screener status');
      }
      return response.json();
    },

    sectors: async (): Promise<ScreenerSectorsResponse> => {
      const response = await fetch(`${API_BASE_URL}/screener/sectors`);
      if (!response.ok) {
        throw new Error('Failed to fetch screener sectors');
      }
      return response.json();
    },

    ask: async (req: ScreenerAskRequest): Promise<ScreenerAskResult> => {
      const headers = await _authHeaders({ 'Content-Type': 'application/json' });
      if (!headers['Authorization']) {
        throw new Error('登录已过期，请刷新页面或重新登录');
      }
      const response = await fetch(`${API_BASE_URL}/screener/ask`, {
        method: 'POST',
        headers,
        body: JSON.stringify(req),
      });
      if (!response.ok) {
        if (response.status === 401) {
          throw new Error('登录已过期，请刷新页面或重新登录');
        }
        const error = await response.json().catch(() => ({ detail: 'AI 查询失败' }));
        throw new Error(error.detail || 'AI 查询失败');
      }
      return response.json();
    },

    pick: async (req: PickRequest): Promise<PickResult> => {
      const headers = await _authHeaders({ 'Content-Type': 'application/json' });
      if (!headers['Authorization']) {
        throw new Error('登录已过期，请刷新页面或重新登录');
      }
      const response = await fetch(`${API_BASE_URL}/screener/pick`, {
        method: 'POST',
        headers,
        body: JSON.stringify(req),
      });
      if (!response.ok) {
        if (response.status === 401) {
          throw new Error('登录已过期，请刷新页面或重新登录');
        }
        const error = await response.json().catch(() => ({ detail: 'AI 助手暂时无法响应' }));
        throw new Error(error.detail || 'AI 助手暂时无法响应');
      }
      return response.json();
    },
  },

  // Weekly Macro Report API
  weeklyReport: {
    getLatest: async (): Promise<WeeklyReportResponse> => {
      const response = await fetch(`${API_BASE_URL}/weekly-report`);
      if (!response.ok) {
        throw new Error('Failed to fetch weekly report');
      }
      return response.json();
    },

    generate: async (force: boolean = false): Promise<WeeklyReportResponse> => {
      const headers: Record<string, string> = {};
      const cronSecret = process.env.NEXT_PUBLIC_CRON_SECRET;
      if (cronSecret) {
        headers['X-Cron-Secret'] = cronSecret;
      }
      const response = await fetch(
        `${API_BASE_URL}/weekly-report/generate?force=${force}`,
        { method: 'POST', headers },
      );
      if (!response.ok) {
        const error = await response.json().catch(() => ({ detail: 'Failed to generate weekly report' }));
        throw new Error(error.detail || 'Failed to generate weekly report');
      }
      return response.json();
    },
  },
};
